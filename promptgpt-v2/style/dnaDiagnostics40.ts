import { analyzeStyleDNA } from "./styleDNAAnalyzer";
import { scoreStyleDNA } from "./styleDNAScorer";
import { computeWordTrigramOverlap } from "./textOverlap";
import { countWords, splitParagraphs, tokenize } from "./tokenizer";
import type { StyleDNAProfile } from "./styleTypes";

export type DiagnosticParamStatus = "ok" | "warn" | "fail" | "na";

export type DiagnosticCategoryId =
  | "form-isolation"
  | "rhythm-layout"
  | "punctuation-flaws"
  | "syntax-voice"
  | "pipeline-health";

export interface DiagnosticParameter40 {
  index: number;
  id: string;
  category: DiagnosticCategoryId;
  categoryLabel: string;
  name: string;
  donorValue: string;
  sourceValue: string;
  resultValue: string;
  targetRule: string;
  status: DiagnosticParamStatus;
  score: number;
  diagnosis: string;
  codeHint: string;
  /** Confidence in this measurement, from 0 (unavailable) to 1 (high). */
  confidence: number;
  /** Human-readable confidence band; prevents weak samples looking authoritative. */
  reliability: "high" | "medium" | "low" | "unavailable";
}

export interface DnaCodeRecommendation {
  file: string;
  issueCount: number;
  summary: string;
  paramIndices: number[];
}

export interface DnaDiagnostics40Report {
  totalParameters: 40;
  okCount: number;
  warnCount: number;
  failCount: number;
  naCount: number;
  overallHealthScore: number;
  topCodeRecommendations: DnaCodeRecommendation[];
  parameters: DiagnosticParameter40[];
  profileQuality: {
    donor: { status: StyleDNAProfile["status"]; confidence: number; words: number; sentences: number };
    source: { status: StyleDNAProfile["status"]; confidence: number; words: number; sentences: number };
    result: { status: StyleDNAProfile["status"]; confidence: number; words: number; sentences: number };
    warnings: string[];
  };
}

export interface DnaDiagnostics40Input {
  donorText: string;
  sourceText: string;
  resultText: string;
  styleIntensity?: number;
  elapsedMs?: number;
  v2Response?: {
    status?: string;
    requestedModel?: string;
    usedModel?: string;
    fallbackOccurred?: boolean;
    selectedCandidateId?: string;
    bestAvailableCandidateId?: string;
    totalDurationMs?: number;
    warnings?: readonly string[];
    candidates?: ReadonlyArray<{
      candidateId?: string;
      /** Exact final text bound to this candidate evaluation; prevents stale diagnostics from another candidate. */
      finalText?: string;
      repaired?: boolean;
      repairPassed?: boolean;
      warnings?: readonly string[];
      diagnosticSteps?: ReadonlyArray<{
        stage?: string;
        status?: string;
        detail?: string;
        durationMs?: number;
      }>;
      initial?: {
        semanticReport?: {
          passed?: boolean;
          mandatoryPropositionsPreserved?: number;
          mandatoryPropositionsTotal?: number;
          requiredAnchorsFound?: number;
          requiredAnchorsTotal?: number;
          issues?: ReadonlyArray<{ code?: string; message?: string }>;
        };
        styleReport?: {
          score?: number | null;
          confidence?: number;
          status?: string;
        };
      };
      finalEvaluation?: {
        disposition?: string;
        semanticReport?: {
          passed?: boolean;
          mandatoryPropositionsPreserved?: number;
          mandatoryPropositionsTotal?: number;
          requiredAnchorsFound?: number;
          requiredAnchorsTotal?: number;
          issues?: ReadonlyArray<{ code?: string; message?: string }>;
        };
        styleReport?: {
          score?: number | null;
          confidence?: number;
          status?: string;
        };
      };
    }>;
  } | null;
  legacyMeta?: {
    overallScoreAfter?: number;
    dnaMatchAfter?: number;
    factsPreservedPct?: number;
    factsLostAfter?: number;
    donorLeakCount?: number;
    criticRuns?: number;
    criticScore?: number | null;
    passes?: number;
    stopReason?: string;
  } | null;
}

const CATEGORY_LABELS: Record<DiagnosticCategoryId, string> = {
  "form-isolation": "Анти-копирование и роли",
  "rhythm-layout": "Ритм фраз и абзацы",
  "punctuation-flaws": "Пунктуация и почерк",
  "syntax-voice": "Синтаксис и голос донора",
  "pipeline-health": "Работа программы v2",
};

const CLICHE_PHRASES = [
  "в рамках",
  "при таком подходе",
  "следует отметить",
  "необходимо отметить",
  "необходимо подчеркнуть",
  "важно подчеркнуть",
  "важно отметить",
  "нельзя не отметить",
  "в конечном счете",
  "в конечном счёте",
  "в конечном итоге",
  "является неотъемлемой частью",
  "неотъемлемой частью",
  "данное обстоятельство",
  "представляется возможным",
  "играет ключевую роль",
  "подводя итог",
  "краеугольный камень",
  "гобелен",
  "свидетельствует о том",
  "в современном дискурсе",
  "выступает ключевым фактором",
  "целесообразно отметить",
  "детерминирующим фактором",
];

const CONNECTOR_LEXEMES = [
  "во-первых",
  "во-вторых",
  "в-третьих",
  "прежде всего",
  "более того",
  "кроме того",
  "тем не менее",
  "вместе с тем",
  "в свою очередь",
  "таким образом",
  "следовательно",
  "поскольку",
  "однако",
  "впрочем",
  "напротив",
  "собственно",
  "именно поэтому",
  "потому что",
  "так как",
  "то есть",
  "иначе говоря",
  "например",
];

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getFeatureRate(profile: StyleDNAProfile, id: string): number {
  return profile.features.find((f) => f.id === id)?.rate ?? 0;
}

function getFeatureCount(profile: StyleDNAProfile, id: string): number {
  return profile.features.find((f) => f.id === id)?.count ?? 0;
}

function extractWordsNormalized(text: string): string[] {
  return tokenize(text)
    .filter((t) => t.kind === "word")
    .map((t) => t.normalized);
}

function extractSentenceTwoWordOpeners(text: string): string[] {
  return splitParagraphs(text)
    .flatMap((p) => p.sentences)
    .map((s) => s.words.slice(0, 2).map((w) => w.normalized).join(" "))
    .filter((k) => k.length >= 3);
}

function computeBigramOverlapRatio(sourceText: string, resultText: string): number {
  const sWords = extractWordsNormalized(sourceText);
  const rWords = extractWordsNormalized(resultText);
  if (sWords.length < 2 || rWords.length < 2) return 0;
  const srcBigrams = new Set<string>();
  for (let i = 0; i <= sWords.length - 2; i++) {
    srcBigrams.add(`${sWords[i]} ${sWords[i + 1]}`);
  }
  let shared = 0;
  const total = rWords.length - 1;
  for (let i = 0; i <= rWords.length - 2; i++) {
    if (srcBigrams.has(`${rWords[i]} ${rWords[i + 1]}`)) shared++;
  }
  return total > 0 ? shared / total : 0;
}

function computeBurstiness(profile: StyleDNAProfile): number {
  const mean = profile.corpus.meanWordsPerSentence;
  const variance = getFeatureRate(profile, "rhythm.sentence-length-variance");
  if (mean <= 0) return 0;
  return Math.sqrt(Math.max(0, variance)) / mean;
}

function computeRateSimilarityScore(donorVal: number, resultVal: number, tolerance: number): number {
  const denom = Math.max(tolerance, Math.abs(donorVal));
  const diff = Math.abs(donorVal - resultVal);
  const ratio = Math.min(1.5, diff / denom);
  return clampScore((1 - ratio / 1.5) * 100);
}

function statusFromScore(score: number, okMin = 72, warnMin = 45): DiagnosticParamStatus {
  if (score >= okMin) return "ok";
  if (score >= warnMin) return "warn";
  return "fail";
}

function formatMs(ms?: number): string {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "н/д";
  if (ms < 1000) return `${Math.round(ms)} мс`;
  return `${(ms / 1000).toFixed(2)} с`;
}

export function buildDnaDiagnostics40(input: DnaDiagnostics40Input): DnaDiagnostics40Report {
  const donorText = input.donorText ?? "";
  const sourceText = input.sourceText ?? "";
  const resultText = input.resultText ?? "";
  const intensity = input.styleIntensity ?? 4;

  const profileOpts = { minWordsForReliableProfile: 120, minSentencesForReliableProfile: 8, maxEvidencePerFeature: 4 };
  const donorProfile = analyzeStyleDNA(donorText, profileOpts);
  const sourceProfile = analyzeStyleDNA(sourceText, profileOpts);
  const resultProfile = analyzeStyleDNA(resultText, profileOpts);

  const donorWords = extractWordsNormalized(donorText);
  const sourceWords = extractWordsNormalized(sourceText);
  const resultWords = extractWordsNormalized(resultText);

  const dCorpus = donorProfile.corpus;
  const sCorpus = sourceProfile.corpus;
  const rCorpus = resultProfile.corpus;

  const parameters: DiagnosticParameter40[] = [];
  const PROFILE_DEPENDENT_IDS = new Set([
    "mean-sentence-words", "median-sentence-words", "sentence-length-variance", "burstiness-index",
    "short-sentence-share", "long-very-long-share", "paragraph-density", "mean-word-length",
    "comma-per-100", "dash-per-100", "semicolon-per-100", "colon-per-100",
    "parentheses-and-comma-defect", "quotes-per-100", "expressive-punct-per-100", "irregularity-preservation",
    "subordinate-share", "participle-share", "gerund-share", "parenthetical-share",
    "donor-openers-adoption", "donor-connectors-adoption", "lexical-ttr",
  ]);
  const profileConfidence = Math.min(donorProfile.confidence, resultProfile.confidence);
  const profileUnavailable = donorProfile.status === "insufficient" || resultProfile.status === "insufficient";
  const profileWarnings = [
    ...donorProfile.warnings.map((warning) => `Донор: ${warning}`),
    ...sourceProfile.warnings.map((warning) => `Исходник: ${warning}`),
    ...resultProfile.warnings.map((warning) => `Результат: ${warning}`),
  ];
  const textSampleConfidence = Math.max(0, Math.min(1,
    Math.min(dCorpus.words, sCorpus.words, rCorpus.words) / 120,
    Math.min(dCorpus.sentences, sCorpus.sentences, rCorpus.sentences) / 8,
  ));
  const pushParam = (p: Omit<DiagnosticParameter40, "index" | "categoryLabel" | "confidence" | "reliability"> & { confidence?: number }) => {
    const isProfileDependent = PROFILE_DEPENDENT_IDS.has(p.id);
    const confidence = Math.max(0, Math.min(1, p.confidence ?? (
      isProfileDependent ? profileConfidence : p.category === "pipeline-health"
        ? (p.status === "na" ? 0 : 0.95)
        : textSampleConfidence
    )));
    const unavailable = isProfileDependent && profileUnavailable;
    const status = unavailable ? "na" : p.status;
    const score = unavailable ? 0 : p.score;
    const diagnosis = unavailable
      ? `Оценка не выставлена: недостаточно текста для надёжного сравнения Style DNA (донор: ${dCorpus.words} слов/${dCorpus.sentences} предложений; результат: ${rCorpus.words} слов/${rCorpus.sentences} предложений).`
      : p.diagnosis;
    const effectiveConfidence = unavailable ? 0 : confidence;
    parameters.push({
      ...p,
      status,
      score,
      diagnosis,
      confidence: effectiveConfidence,
      reliability: effectiveConfidence >= 0.75 ? "high" : effectiveConfidence >= 0.45 ? "medium" : effectiveConfidence > 0 ? "low" : "unavailable",
      index: parameters.length + 1,
      categoryLabel: CATEGORY_LABELS[p.category],
    });
  };

  // --- 01..08: FORM ISOLATION ---
  const trigramOverlap = computeWordTrigramOverlap(sourceText, resultText);
  const trigramPct = trigramOverlap * 100;
  const maxAllowedTrigram = intensity >= 5 ? 16 : intensity >= 4 ? 22 : 35;
  const p1Status: DiagnosticParamStatus =
    trigramPct <= maxAllowedTrigram ? "ok" : trigramPct <= maxAllowedTrigram + 14 ? "warn" : "fail";
  pushParam({
    id: "trigram-overlap",
    category: "form-isolation",
    name: "Копирование триграмм исходника",
    donorValue: "—",
    sourceValue: "100% база",
    resultValue: `${trigramPct.toFixed(1)}%`,
    targetRule: `<= ${maxAllowedTrigram}% при инт. ${intensity}`,
    status: p1Status,
    score: clampScore(100 - Math.max(0, trigramPct - 8) * 1.8),
    diagnosis:
      p1Status === "ok"
        ? "Фразы глубоко перестроены относительно исходника."
        : p1Status === "warn"
          ? "Остались фрагментарные фразы из исходного текста."
          : "Слишком высокий процент дословного синтаксиса исходника.",
    codeHint: "promptgpt-v2/application/routerAdapters.ts (overlapThreshold) и promptgpt-v2/style/candidateGenerator.ts",
  });

  const srcOpeners = new Set(extractSentenceTwoWordOpeners(sourceText));
  const resOpeners = extractSentenceTwoWordOpeners(resultText);
  const openerEchoCount = resOpeners.filter((o) => srcOpeners.has(o)).length;
  const openerEchoPct = resOpeners.length > 0 ? (openerEchoCount / resOpeners.length) * 100 : 0;
  const p2Status: DiagnosticParamStatus = openerEchoPct <= 15 ? "ok" : openerEchoPct <= 30 ? "warn" : "fail";
  pushParam({
    id: "opener-overlap-source",
    category: "form-isolation",
    name: "Повтор зачинов фраз исходника",
    donorValue: "—",
    sourceValue: `${srcOpeners.size} зач.`,
    resultValue: `${openerEchoPct.toFixed(0)}% (${openerEchoCount}/${resOpeners.length || 0})`,
    targetRule: "<= 15% совпадений",
    status: p2Status,
    score: clampScore(100 - openerEchoPct * 1.6),
    diagnosis:
      p2Status === "ok"
        ? "Начала предложений обновлены."
        : "Предложения слишком часто начинаются теми же словами, что и в исходнике.",
    codeHint: "promptgpt-v2/style/candidateGenerator.ts (extractForbiddenSourcePhrases и candidateApproaches)",
  });

  const bigramOverlap = computeBigramOverlapRatio(sourceText, resultText);
  const bigramNoveltyPct = (1 - bigramOverlap) * 100;
  const p3Status: DiagnosticParamStatus = bigramNoveltyPct >= 62 ? "ok" : bigramNoveltyPct >= 45 ? "warn" : "fail";
  pushParam({
    id: "bigram-novelty",
    category: "form-isolation",
    name: "Новизна словесных пар (биграммы)",
    donorValue: "—",
    sourceValue: `${Math.max(0, sourceWords.length - 1)} пар`,
    resultValue: `${bigramNoveltyPct.toFixed(1)}% новых`,
    targetRule: ">= 62% новых пар",
    status: p3Status,
    score: clampScore(bigramNoveltyPct),
    diagnosis:
      p3Status === "ok"
        ? "Лексико-синтаксическая связка слов основательно обновлена."
        : "Высокая инерция исходных словосочетаний (косметический рерайт).",
    codeHint: "promptgpt-v2/application/routerAdapters.ts (CANDIDATE_SAMPLING_PRESETS) и promptgpt-v2/style/candidateGenerator.ts",
  });

  const wordRatio = sCorpus.words > 0 ? rCorpus.words / sCorpus.words : 1;
  const p4Status: DiagnosticParamStatus = wordRatio >= 0.88 && wordRatio <= 1.2 ? "ok" : wordRatio >= 0.75 && wordRatio <= 1.35 ? "warn" : "fail";
  const p4Score = p4Status === "ok" ? 100 : p4Status === "warn"
    ? clampScore(72 - Math.abs(wordRatio - 1.0) * 80)
    : clampScore(45 - Math.abs(wordRatio - 1.0) * 80);
  pushParam({
    id: "word-ratio",
    category: "form-isolation",
    name: "Сохранение объёма слов",
    donorValue: `${dCorpus.words} сл.`,
    sourceValue: `${sCorpus.words} сл.`,
    resultValue: `${rCorpus.words} сл. (x${wordRatio.toFixed(2)})`,
    targetRule: "x0.88 – x1.20 к исходнику",
    status: p4Status,
    score: p4Score,
    diagnosis:
      p4Status === "ok"
        ? "Объём близок к исходнику."
        : p4Status === "warn"
          ? wordRatio < 1 ? "Текст немного короче целевого коридора; проверьте полноту деталей." : "Текст немного длиннее целевого коридора."
          : wordRatio < 1 ? "Сильное сжатие: проверьте пропущенные смысловые детали." : "Сильное расширение: проверьте лишние вставки.",
    codeHint: "promptgpt-v2/style/candidateGenerator.ts (targetWordDirective)",
  });

  const charRatio = sCorpus.characters > 0 ? rCorpus.characters / sCorpus.characters : 1;
  const p5Score = charRatio >= 0.85 && charRatio <= 1.25 ? 100 : clampScore(100 - Math.abs(charRatio - 1.0) * 150);
  const p5Status: DiagnosticParamStatus = charRatio >= 0.84 && charRatio <= 1.26 ? "ok" : charRatio >= 0.72 && charRatio <= 1.4 ? "warn" : "fail";
  pushParam({
    id: "char-ratio",
    category: "form-isolation",
    name: "Соотношение символов (сжатие/рост)",
    donorValue: `${dCorpus.characters} симв.`,
    sourceValue: `${sCorpus.characters} симв.`,
    resultValue: `${rCorpus.characters} симв. (x${charRatio.toFixed(2)})`,
    targetRule: "x0.84 – x1.26",
    status: p5Status,
    score: p5Score,
    diagnosis:
      p5Status === "ok" ? "Плотность текста соответствует исходному объёму." : "Заметный перекос длины по символам.",
    codeHint: "promptgpt-v2/style/candidateGenerator.ts (targetWordDirective)",
  });

  const donorContentSet = new Set(donorWords.filter((w) => w.length >= 6));
  const sourceContentSet = new Set(sourceWords.filter((w) => w.length >= 6));
  const leakedWords = Array.from(
    new Set(resultWords.filter((w) => w.length >= 6 && donorContentSet.has(w) && !sourceContentSet.has(w))),
  );
  const p6Status: DiagnosticParamStatus = leakedWords.length <= 1 ? "ok" : leakedWords.length <= 3 ? "warn" : "fail";
  pushParam({
    id: "donor-topic-leak",
    category: "form-isolation",
    name: "Утечка тематических слов донора",
    donorValue: `${donorContentSet.size} уник.`,
    sourceValue: `${sourceContentSet.size} уник.`,
    resultValue: leakedWords.length ? `${leakedWords.length} (${leakedWords.slice(0, 3).join(", ")})` : "0 утечек",
    targetRule: "<= 1 чужого слова",
    status: p6Status,
    score: clampScore(100 - leakedWords.length * 22),
    diagnosis:
      p6Status === "ok"
        ? "Предметная лексика донора не просочилась в результат."
        : `В результат проникли слова из темы донора: ${leakedWords.slice(0, 5).join(", ")}.`,
    codeHint: "promptgpt-v2/style/candidateGenerator.ts (строгое разделение ролей) и server.ts (extractDonorForbiddenTerms)",
  });

  const lowerResultWords = resultWords;
  const doubles: string[] = [];
  for (let i = 1; i < lowerResultWords.length; i++) {
    if (lowerResultWords[i] === lowerResultWords[i - 1] && lowerResultWords[i].length >= 2) {
      doubles.push(`${lowerResultWords[i - 1]} ${lowerResultWords[i]}`);
    }
  }
  const p7Status: DiagnosticParamStatus = doubles.length === 0 ? "ok" : doubles.length === 1 ? "warn" : "fail";
  pushParam({
    id: "consecutive-word-doubles",
    category: "form-isolation",
    name: "Дубли слов подряд («слово слово»)",
    donorValue: "—",
    sourceValue: "—",
    resultValue: doubles.length ? `${doubles.length} (${doubles.slice(0, 2).join(", ")})` : "0",
    targetRule: "0 повторов подряд",
    status: p7Status,
    score: clampScore(100 - doubles.length * 45),
    diagnosis: doubles.length === 0 ? "Случайных сдвоенных слов нет." : `Обнаружены сбои склейки: ${doubles.join(", ")}.`,
    codeHint: "promptgpt-v2/style/candidateGenerator.ts (bannedOpenersDirective) и server.ts (deterministicPolish)",
  });

  const lowerResultText = resultText.toLocaleLowerCase("ru-RU");
  const lowerDonorText = donorText.toLocaleLowerCase("ru-RU");
  const foundCliches = CLICHE_PHRASES.filter((p) => lowerResultText.includes(p) && !lowerDonorText.includes(p));
  const parasiticStartHits = (lowerResultText.match(/(?:^|[.!?]\s+)(?:вследствие этого|вследствие чего|в такой системе)\b/gu) || [])
    .filter((hit) => !lowerDonorText.includes(hit.trim().replace(/^[.!?]\s+/, ""))).length;
  const totalTemplateArtifacts = foundCliches.length + parasiticStartHits;
  const p8Status: DiagnosticParamStatus = totalTemplateArtifacts === 0 ? "ok" : totalTemplateArtifacts <= 2 ? "warn" : "fail";
  pushParam({
    id: "cliche-and-template-openers",
    category: "form-isolation",
    name: "ИИ-штампы и шаблонные зачины",
    donorValue: "база",
    sourceValue: "—",
    resultValue: `${totalTemplateArtifacts} шт. (клише: ${foundCliches.length}, зачины: ${parasiticStartHits})`,
    targetRule: "0 посторонних клише",
    status: p8Status,
    score: clampScore(100 - totalTemplateArtifacts * 25),
    diagnosis:
      totalTemplateArtifacts === 0
        ? "Инородных ИИ-клише и «Вследствие этого/чего» нет."
        : `Просочились шаблонные обороты (${foundCliches.slice(0, 3).join(", ") || "паразитные зачины"}).`,
    codeHint: "promptgpt-v2/style/candidateGenerator.ts (bannedOpenersDirective) и promptgpt-v2/critic/styleCritic.ts",
  });

  // --- 09..16: RHYTHM & LAYOUT ---
  const p9Score = computeRateSimilarityScore(dCorpus.meanWordsPerSentence, rCorpus.meanWordsPerSentence, 4.5);
  pushParam({
    id: "mean-sentence-words",
    category: "rhythm-layout",
    name: "Средняя длина предложения (слова)",
    donorValue: `${dCorpus.meanWordsPerSentence.toFixed(1)} сл.`,
    sourceValue: `${sCorpus.meanWordsPerSentence.toFixed(1)} сл.`,
    resultValue: `${rCorpus.meanWordsPerSentence.toFixed(1)} сл.`,
    targetRule: `цель ~${dCorpus.meanWordsPerSentence.toFixed(1)} сл.`,
    status: statusFromScore(p9Score),
    score: p9Score,
    diagnosis:
      p9Score >= 72
        ? "Средняя длина фраз близка к ритму донора."
        : rCorpus.meanWordsPerSentence > dCorpus.meanWordsPerSentence
          ? "Предложения всё ещё длиннее донора."
          : "Предложения излишне измельчены относительно донора.",
    codeHint: "promptgpt-v2/style/candidateGenerator.ts (lengthDirective) и promptgpt-v2/style/styleDNAScorer.ts",
  });

  const p10Score = computeRateSimilarityScore(dCorpus.medianWordsPerSentence, rCorpus.medianWordsPerSentence, 4.5);
  pushParam({
    id: "median-sentence-words",
    category: "rhythm-layout",
    name: "Медианная длина предложения",
    donorValue: `${dCorpus.medianWordsPerSentence.toFixed(1)} сл.`,
    sourceValue: `${sCorpus.medianWordsPerSentence.toFixed(1)} сл.`,
    resultValue: `${rCorpus.medianWordsPerSentence.toFixed(1)} сл.`,
    targetRule: `цель ~${dCorpus.medianWordsPerSentence.toFixed(1)} сл.`,
    status: statusFromScore(p10Score),
    score: p10Score,
    diagnosis: p10Score >= 72 ? "Медиана фраз совпадает с донором." : "Медианный ритм сдвинут относительно донора.",
    codeHint: "promptgpt-v2/style/candidateGenerator.ts (lengthDirective)",
  });

  const dVar = getFeatureRate(donorProfile, "rhythm.sentence-length-variance");
  const sVar = getFeatureRate(sourceProfile, "rhythm.sentence-length-variance");
  const rVar = getFeatureRate(resultProfile, "rhythm.sentence-length-variance");
  const p11Score = computeRateSimilarityScore(dVar, rVar, Math.max(25, dVar * 0.55));
  pushParam({
    id: "sentence-length-variance",
    category: "rhythm-layout",
    name: "Разброс длин фраз (Variance)",
    donorValue: `${dVar.toFixed(0)}`,
    sourceValue: `${sVar.toFixed(0)}`,
    resultValue: `${rVar.toFixed(0)}`,
    targetRule: `цель ~${dVar.toFixed(0)}`,
    status: statusFromScore(p11Score),
    score: p11Score,
    diagnosis:
      rVar < dVar * 0.55
        ? "Модель усреднила длину фраз (потерян контраст коротких и длинных)."
        : "Динамика разброса длин соответствует донору.",
    codeHint: "promptgpt-v2/style/candidateGenerator.ts (varianceDirective) и promptgpt-v2/critic/styleCritic.ts",
  });

  const dBurst = computeBurstiness(donorProfile);
  const sBurst = computeBurstiness(sourceProfile);
  const rBurst = computeBurstiness(resultProfile);
  const p12Score = computeRateSimilarityScore(dBurst, rBurst, 0.24);
  pushParam({
    id: "burstiness-index",
    category: "rhythm-layout",
    name: "Индекс прерывистости (Burstiness)",
    donorValue: dBurst.toFixed(2),
    sourceValue: sBurst.toFixed(2),
    resultValue: rBurst.toFixed(2),
    targetRule: `цель ~${dBurst.toFixed(2)}`,
    status: statusFromScore(p12Score),
    score: p12Score,
    diagnosis:
      rBurst < 0.35 && dBurst >= 0.45
        ? "Ритм слишком монотонный (риск для ИИ-детекторов)."
        : "Прерывистость текста выдержана достойно.",
    codeHint: "promptgpt-v2/style/candidateGenerator.ts (varianceDirective) и promptgpt-v2/style/styleDNAAnalyzer.ts",
  });

  const dShort = dCorpus.sentenceLengthDistribution.short.share * 100;
  const sShort = sCorpus.sentenceLengthDistribution.short.share * 100;
  const rShort = rCorpus.sentenceLengthDistribution.short.share * 100;
  const p13Score = computeRateSimilarityScore(dShort, rShort, 15);
  pushParam({
    id: "short-sentence-share",
    category: "rhythm-layout",
    name: "Доля коротких фраз (<= 8 слов)",
    donorValue: `${dShort.toFixed(0)}%`,
    sourceValue: `${sShort.toFixed(0)}%`,
    resultValue: `${rShort.toFixed(0)}% (${rCorpus.sentenceLengthDistribution.short.count} шт.)`,
    targetRule: `цель ~${dShort.toFixed(0)}%`,
    status: statusFromScore(p13Score),
    score: p13Score,
    diagnosis:
      dShort >= 12 && rShort < 5
        ? "Короткие рубленые акценты исчезли (симптом сглаженного ИИ-текста)."
        : "Короткие предложения присутствуют в нужной доле.",
    codeHint: "promptgpt-v2/style/candidateGenerator.ts (targetShortCount)",
  });

  const dLongPlus = (dCorpus.sentenceLengthDistribution.long.share + dCorpus.sentenceLengthDistribution.veryLong.share) * 100;
  const sLongPlus = (sCorpus.sentenceLengthDistribution.long.share + sCorpus.sentenceLengthDistribution.veryLong.share) * 100;
  const rLongPlus = (rCorpus.sentenceLengthDistribution.long.share + rCorpus.sentenceLengthDistribution.veryLong.share) * 100;
  const p14Score = computeRateSimilarityScore(dLongPlus, rLongPlus, 18);
  pushParam({
    id: "long-very-long-share",
    category: "rhythm-layout",
    name: "Доля длинных периодов (> 20 слов)",
    donorValue: `${dLongPlus.toFixed(0)}%`,
    sourceValue: `${sLongPlus.toFixed(0)}%`,
    resultValue: `${rLongPlus.toFixed(0)}%`,
    targetRule: `цель ~${dLongPlus.toFixed(0)}%`,
    status: statusFromScore(p14Score),
    score: p14Score,
    diagnosis: p14Score >= 72 ? "Доля развёрнутых фраз согласована с донором." : "Доля длинных периодов расходится с донором.",
    codeHint: "promptgpt-v2/style/candidateGenerator.ts (targetLongCount / targetVeryLongCount)",
  });

  const expectedParagraphs = Math.max(
    1,
    Math.round(rCorpus.sentences / Math.max(1, dCorpus.meanSentencesPerParagraph)),
  );
  const paragraphDeviation = Math.abs(rCorpus.paragraphs - expectedParagraphs) / Math.max(1, expectedParagraphs);
  const p15Score = clampScore(100 - Math.min(100, paragraphDeviation * 100));
  pushParam({
    id: "paragraph-density",
    category: "rhythm-layout",
    name: "Абзацы и плотность (предл./абз.)",
    donorValue: `${dCorpus.meanSentencesPerParagraph.toFixed(1)} (${dCorpus.paragraphs} абз.)`,
    sourceValue: `${sCorpus.meanSentencesPerParagraph.toFixed(1)} (${sCorpus.paragraphs} абз.)`,
    resultValue: `${rCorpus.meanSentencesPerParagraph.toFixed(1)} (${rCorpus.paragraphs} абз.)`,
    targetRule: `цель ~${dCorpus.meanSentencesPerParagraph.toFixed(1)} предл./абз.`,
    status: statusFromScore(p15Score),
    score: p15Score,
    diagnosis:
      p15Score >= 72
        ? "Плотность абзацев пропорциональна донорской манере и объёму результата."
        : p15Score >= 45
          ? "Абзацная структура частично расходится с пропорцией донора."
          : "Число и плотность абзацев заметно расходятся с донорской композицией.",
    codeHint: "promptgpt-v2/style/candidateGenerator.ts (paragraphDirective, paragraphSplitDirective)",
  });

  const avgChars = (ws: string[]) => (ws.length ? ws.reduce((sum, w) => sum + w.length, 0) / ws.length : 0);
  const dWordLen = avgChars(donorWords);
  const sWordLen = avgChars(sourceWords);
  const rWordLen = avgChars(resultWords);
  const p16Score = computeRateSimilarityScore(dWordLen, rWordLen, 1.3);
  pushParam({
    id: "mean-word-length",
    category: "rhythm-layout",
    name: "Средняя длина слова (лексический вес)",
    donorValue: `${dWordLen.toFixed(2)} б.`,
    sourceValue: `${sWordLen.toFixed(2)} б.`,
    resultValue: `${rWordLen.toFixed(2)} б.`,
    targetRule: `цель ~${dWordLen.toFixed(2)} б.`,
    status: statusFromScore(p16Score),
    score: p16Score,
    diagnosis: p16Score >= 72 ? "Лексический вес слов близок к донору." : "Сдвиг к более канцелярским/длинным или упрощённым словам.",
    codeHint: "promptgpt-v2/style/candidateGenerator.ts и promptgpt-v2/style/styleDNAAnalyzer.ts",
  });

  // --- 17..24: PUNCTUATION & FLAWS ---
  const per100 = (p: StyleDNAProfile, fid: string) => getFeatureRate(p, fid) / 10;
  const punctSpecs: Array<[string, string, string, number, string]> = [
    ["comma-per-100", "punctuation.comma", "Запятые на 100 слов", 2.8, "promptgpt-v2/style/candidateGenerator.ts и promptgpt-v2/repair/surgicalRepair.ts"],
    ["dash-per-100", "punctuation.dash", "Тире (—/–) на 100 слов", 1.2, "promptgpt-v2/style/candidateGenerator.ts (dashRate) и promptgpt-v2/style/styleDNAScorer.ts"],
    ["semicolon-per-100", "punctuation.semicolon", "Точки с запятой (;) на 100 слов", 0.6, "promptgpt-v2/style/candidateGenerator.ts (semicolonRate)"],
    ["colon-per-100", "punctuation.colon", "Двоеточия (:) на 100 слов", 0.6, "promptgpt-v2/style/candidateGenerator.ts (colonRate) и promptgpt-v2/critic/styleCritic.ts"],
  ];
  for (const [id, fid, name, tol, hint] of punctSpecs) {
    const dv = per100(donorProfile, fid);
    const sv = per100(sourceProfile, fid);
    const rv = per100(resultProfile, fid);
    const sc = computeRateSimilarityScore(dv, rv, tol);
    pushParam({
      id,
      category: "punctuation-flaws",
      name,
      donorValue: `${dv.toFixed(1)}`,
      sourceValue: `${sv.toFixed(1)}`,
      resultValue: `${rv.toFixed(1)}`,
      targetRule: `цель ~${dv.toFixed(1)} / 100 сл.`,
      status: statusFromScore(sc),
      score: sc,
      diagnosis: sc >= 72 ? "Плотность знака согласуется с донором." : `Перекос по знаку (${rv.toFixed(1)} против ${dv.toFixed(1)} у донора).`,
      codeHint: hint,
    });
  }

  const dParen = per100(donorProfile, "punctuation.parentheses") / 2;
  const sParen = per100(sourceProfile, "punctuation.parentheses") / 2;
  const rParen = per100(resultProfile, "punctuation.parentheses") / 2;
  const commaBeforeParenCount = (resultText.match(/,\s*\(/g) || []).length;
  const p21Base = computeRateSimilarityScore(dParen, rParen, 0.7);
  const p21Score = clampScore(p21Base - commaBeforeParenCount * 22);
  pushParam({
    id: "parentheses-and-comma-defect",
    category: "punctuation-flaws",
    name: "Скобки ((...)) и дефект «, (...)»",
    donorValue: `${dParen.toFixed(1)} пар/100`,
    sourceValue: `${sParen.toFixed(1)} пар/100`,
    resultValue: `${rParen.toFixed(1)} пар/100 (дефект «,(»: ${commaBeforeParenCount})`,
    targetRule: `~${dParen.toFixed(1)} пар/100, 0 «, (»`,
    status: statusFromScore(p21Score),
    score: p21Score,
    diagnosis:
      commaBeforeParenCount > 0
        ? "Найдена лишняя запятая перед открывающей скобкой."
        : p21Score >= 72
          ? "Использование скобок соответствует донору."
          : "Недобор или переизбыток вставных скобок.",
    codeHint: "promptgpt-v2/style/candidateGenerator.ts и promptgpt-v2/repair/surgicalRepair.ts",
  });

  const dQuote = per100(donorProfile, "punctuation.quotation-marks") / 2;
  const sQuote = per100(sourceProfile, "punctuation.quotation-marks") / 2;
  const rQuote = per100(resultProfile, "punctuation.quotation-marks") / 2;
  const p22Score = computeRateSimilarityScore(dQuote, rQuote, 0.9);
  pushParam({
    id: "quotes-per-100",
    category: "punctuation-flaws",
    name: "Пар кавычек («...») на 100 слов",
    donorValue: `${dQuote.toFixed(1)}`,
    sourceValue: `${sQuote.toFixed(1)}`,
    resultValue: `${rQuote.toFixed(1)}`,
    targetRule: `~${dQuote.toFixed(1)} пар/100`,
    status: statusFromScore(p22Score),
    score: p22Score,
    diagnosis: rQuote > dQuote + 0.8 ? "Модель ставит лишние кавычки вокруг обычных слов." : "Уровень кавычек в пределах нормы донора.",
    codeHint: "promptgpt-v2/style/candidateGenerator.ts (quoteRate)",
  });

  const expressiveRate = (p: StyleDNAProfile) =>
    per100(p, "punctuation.question") + per100(p, "punctuation.exclamation") + per100(p, "punctuation.ellipsis");
  const dExp = expressiveRate(donorProfile);
  const sExp = expressiveRate(sourceProfile);
  const rExp = expressiveRate(resultProfile);
  const p23Score = computeRateSimilarityScore(dExp, rExp, 0.9);
  pushParam({
    id: "expressive-punct-per-100",
    category: "punctuation-flaws",
    name: "Экспрессивные знаки (? ! …) / 100 сл.",
    donorValue: `${dExp.toFixed(1)}`,
    sourceValue: `${sExp.toFixed(1)}`,
    resultValue: `${rExp.toFixed(1)}`,
    targetRule: `~${dExp.toFixed(1)}`,
    status: statusFromScore(p23Score),
    score: p23Score,
    diagnosis: p23Score >= 72 ? "Интонационные акценты совпадают с донором." : "Интонационная пунктуация заметно отличается.",
    codeHint: "promptgpt-v2/style/styleDNAAnalyzer.ts и promptgpt-v2/critic/styleCritic.ts",
  });

  const anomalySpecs: Array<[string, string, number, number]> = [
    ["syntax.punctuation-quirks", "пунктуационные шероховатости", 0.06, 0.5],
    ["lexical.adjacent-repeat", "смежные повторы/опечатки", 0.15, 0.5],
    ["lexical.nearby-repeat", "близкие лексические повторы", 1.0, 0.35],
  ];
  const anomalyComparisons = anomalySpecs.map(([featureId, label, absoluteTolerance, relativeTolerance]) => {
    const donorRate = getFeatureRate(donorProfile, featureId);
    const sourceRate = getFeatureRate(sourceProfile, featureId);
    const resultRate = getFeatureRate(resultProfile, featureId);
    const tolerance = Math.max(absoluteTolerance, donorRate * relativeTolerance);
    return {
      featureId,
      label,
      donorRate,
      sourceRate,
      resultRate,
      score: computeRateSimilarityScore(donorRate, resultRate, tolerance),
    };
  });
  const p24Score = anomalyComparisons.reduce((sum, item) => sum + item.score, 0) / Math.max(1, anomalyComparisons.length);
  const anomalySummary = anomalyComparisons
    .map((item) => `${item.label}: донор ${item.donorRate.toFixed(3)}, результат ${item.resultRate.toFixed(3)}`)
    .join("; ");
  pushParam({
    id: "irregularity-preservation",
    category: "punctuation-flaws",
    name: "Сохранение ошибок и шероховатостей донора",
    donorValue: anomalyComparisons.map((item) => item.donorRate.toFixed(3)).join(" / "),
    sourceValue: anomalyComparisons.map((item) => item.sourceRate.toFixed(3)).join(" / "),
    resultValue: anomalyComparisons.map((item) => item.resultRate.toFixed(3)).join(" / "),
    targetRule: "не нормализовать подтверждённые донорские отклонения; сопоставимая частота",
    status: statusFromScore(p24Score),
    score: p24Score,
    diagnosis: p24Score >= 72
      ? `Донорские шероховатости и повторы перенесены в сопоставимой пропорции. ${anomalySummary}`
      : `Частоты донорских шероховатостей не совпадают: часть могла быть исправлена или избыточно добавлена. ${anomalySummary}`,
    codeHint: "promptgpt-v2/style/styleDNAAnalyzer.ts, styleDNAScorer.ts и critic/styleCritic.ts",
  });

  // --- 25..32: SYNTAX & VOICE ---
  const syntaxSpecs: Array<[string, string, string, number]> = [
    ["subordinate-share", "syntax.subordinate-markers", "Доля фраз с придаточными", 0.16],
    ["participle-share", "syntax.participle-like", "Доля фраз с причастиями", 0.18],
    ["gerund-share", "syntax.gerund-like", "Доля фраз с деепричастиями", 0.14],
    ["parenthetical-share", "syntax.parentheticals", "Доля фраз с вводными словами", 0.14],
  ];
  for (const [id, fid, name, tol] of syntaxSpecs) {
    const dv = getFeatureRate(donorProfile, fid) * 100;
    const sv = getFeatureRate(sourceProfile, fid) * 100;
    const rv = getFeatureRate(resultProfile, fid) * 100;
    const sc = computeRateSimilarityScore(dv, rv, tol * 100);
    pushParam({
      id,
      category: "syntax-voice",
      name,
      donorValue: `${dv.toFixed(0)}%`,
      sourceValue: `${sv.toFixed(0)}%`,
      resultValue: `${rv.toFixed(0)}%`,
      targetRule: `цель ~${dv.toFixed(0)}%`,
      status: statusFromScore(sc),
      score: sc,
      diagnosis: sc >= 72 ? "Синтаксическая доля близка к профилю донора." : "Конструкций этого типа заметно больше или меньше, чем у донора.",
      codeHint: "promptgpt-v2/style/candidateGenerator.ts и promptgpt-v2/style/styleDNAAnalyzer.ts",
    });
  }

  const donorOpenerCounts = new Map<string, number>();
  for (const op of extractSentenceTwoWordOpeners(donorText)) {
    donorOpenerCounts.set(op, (donorOpenerCounts.get(op) ?? 0) + 1);
  }
  const topDonorOpeners = [...donorOpenerCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([op]) => op);
  const matchedDonorOpeners = topDonorOpeners.filter((op) => resOpeners.includes(op));
  const p29Score = topDonorOpeners.length === 0 ? 100 : clampScore(45 + Math.min(55, matchedDonorOpeners.length * 18));
  pushParam({
    id: "donor-openers-adoption",
    category: "syntax-voice",
    name: "Перенос зачинов фраз донора",
    donorValue: `${topDonorOpeners.length} типов`,
    sourceValue: "—",
    resultValue: matchedDonorOpeners.length ? `${matchedDonorOpeners.length} совп. (${matchedDonorOpeners.slice(0, 2).join(", ")})` : "0 совп.",
    targetRule: "хотя бы 1–3 зачина донора",
    status: statusFromScore(p29Score),
    score: p29Score,
    diagnosis: matchedDonorOpeners.length > 0 ? "Зачины фраз донора прослеживаются в тексте." : "Зачины донора почти не воспроизведены.",
    codeHint: "promptgpt-v2/style/candidateGenerator.ts (extractDonorSyntacticCues)",
  });

  const donorConnectors = CONNECTOR_LEXEMES.filter((c) => lowerDonorText.includes(c));
  const resultConnectors = CONNECTOR_LEXEMES.filter((c) => lowerResultText.includes(c));
  const sharedConnectors = donorConnectors.filter((c) => resultConnectors.includes(c));
  const p30Ratio = donorConnectors.length > 0 ? sharedConnectors.length / Math.min(donorConnectors.length, 6) : 1;
  const p30Score = clampScore(Math.min(1, p30Ratio) * 100);
  pushParam({
    id: "donor-connectors-adoption",
    category: "syntax-voice",
    name: "Освоение связок-коннекторов донора",
    donorValue: `${donorConnectors.length} видов`,
    sourceValue: `${CONNECTOR_LEXEMES.filter((c) => sourceText.toLocaleLowerCase("ru-RU").includes(c)).length} видов`,
    resultValue: `${sharedConnectors.length}/${donorConnectors.length} (${sharedConnectors.slice(0, 3).join(", ") || "нет"})`,
    targetRule: ">= 40% активных связок донора",
    status: statusFromScore(p30Score, 65, 38),
    score: p30Score,
    diagnosis: sharedConnectors.length >= 2 ? "Характерные логические связки донора перенесены." : "Слабо использованы авторские связки донора.",
    codeHint: "promptgpt-v2/style/styleDNAAnalyzer.ts (CONNECTORS) и promptgpt-v2/style/candidateGenerator.ts",
  });

  const calcTtr = (ws: string[]) => (ws.length > 0 ? new Set(ws).size / ws.length : 0);
  const dTtr = calcTtr(donorWords);
  const sTtr = calcTtr(sourceWords);
  const rTtr = calcTtr(resultWords);
  const p31Score = computeRateSimilarityScore(dTtr, rTtr, 0.14);
  pushParam({
    id: "lexical-ttr",
    category: "syntax-voice",
    name: "Лексическое разнообразие (TTR)",
    donorValue: dTtr.toFixed(2),
    sourceValue: sTtr.toFixed(2),
    resultValue: rTtr.toFixed(2),
    targetRule: `цель ~${dTtr.toFixed(2)}`,
    status: statusFromScore(p31Score),
    score: p31Score,
    diagnosis: p31Score >= 72 ? "Богатство словаря близко к донорскому тексту." : "Словарь беднее или избыточно пестрее донора.",
    codeHint: "promptgpt-v2/style/styleDNAAnalyzer.ts и promptgpt-v2/style/styleDNAScorer.ts",
  });

  const srcParas = sourceText.trim().split(/\n{2,}/).filter(Boolean);
  const resParas = resultText.trim().split(/\n{2,}/).filter(Boolean);
  const lastSrc = srcParas[srcParas.length - 1] ?? sourceText;
  const lastRes = resParas[resParas.length - 1] ?? resultText;
  const tailOverlapPct = computeWordTrigramOverlap(lastSrc, lastRes) * 100;
  const p32Status: DiagnosticParamStatus = tailOverlapPct <= 20 ? "ok" : tailOverlapPct <= 35 ? "warn" : "fail";
  pushParam({
    id: "final-paragraph-rewrite",
    category: "syntax-voice",
    name: "Перестройка финального абзаца",
    donorValue: "—",
    sourceValue: `${countWords(lastSrc)} сл.`,
    resultValue: `${tailOverlapPct.toFixed(1)}% совп. с исходником`,
    targetRule: "<= 20% триграмм в финале",
    status: p32Status,
    score: clampScore(100 - tailOverlapPct * 1.9),
    diagnosis:
      p32Status === "ok"
        ? "Финал переписан глубоко без скатывания в исходник."
        : "Финальный абзац слишком близок к исходнику (частая усталость контекста).",
    codeHint: "promptgpt-v2/style/candidateGenerator.ts (paragraphSplitDirective) и promptgpt-v2/application/routerAdapters.ts",
  });

  // --- 33..40: PIPELINE HEALTH ---
  const v2 = input.v2Response ?? null;
  const legacy = input.legacyMeta ?? null;
  const candidates: NonNullable<NonNullable<DnaDiagnostics40Input["v2Response"]>["candidates"]> = v2?.candidates ?? [];
  const requestedCandidateId = v2?.selectedCandidateId || v2?.bestAvailableCandidateId;
  const activeCandidate =
    candidates.find((c) => c.candidateId === requestedCandidateId && c.finalText === resultText) ??
    candidates.find((c) => c.finalText === resultText);
  if (v2 && !activeCandidate) {
    profileWarnings.push(
      "Не найден кандидат с точным совпадением finalText и resultText. Семантические показатели и этапы не подставляются из другого кандидата."
    );
  }
  const steps: NonNullable<(typeof candidates)[number]["diagnosticSteps"]> = activeCandidate?.diagnosticSteps ?? [];
  const stepMap = new Map<string, (typeof steps)[number]>(steps.map((s) => [s.stage ?? "", s] as const));
  const finalEval = activeCandidate?.finalEvaluation ?? activeCandidate?.initial;
  const initialEval = activeCandidate?.initial;

  const totalMs =
    typeof input.elapsedMs === "number" && input.elapsedMs > 0
      ? input.elapsedMs
      : typeof v2?.totalDurationMs === "number"
        ? v2.totalDurationMs
        : undefined;
  const secPer1k = totalMs && resultText.length > 0 ? (totalMs / 1000) / Math.max(0.2, resultText.length / 1000) : undefined;
  const p33Score =
    totalMs === undefined ? 0 : totalMs <= 45_000 ? 95 : totalMs <= 90_000 ? 82 : totalMs <= 120_000 ? 65 : totalMs <= 210_000 ? 45 : 25;
  pushParam({
    id: "total-runtime-and-speed",
    category: "pipeline-health",
    name: "Полное время промпта и темп",
    donorValue: "—",
    sourceValue: `${sourceText.length} симв.`,
    resultValue: totalMs !== undefined ? `${formatMs(totalMs)}${secPer1k ? ` (${secPer1k.toFixed(1)} с/1к)` : ""}` : "н/д",
    targetRule: "<= 90 с; 90–120 с — предупреждение",
    status: totalMs === undefined ? "na" : statusFromScore(p33Score),
    score: p33Score,
    diagnosis:
      totalMs === undefined
        ? "Таймер не зафиксирован."
        : totalMs > 120_000
          ? "Высокая задержка (>2 мин) — проверьте этап-тормоз или повторные вызовы модели."
          : totalMs > 90_000
            ? "Время выше желаемого диапазона; проверьте число вызовов и этапы с повторной генерацией."
            : "Время выполнения в целевом диапазоне.",
    codeHint: "promptgpt-v2/application/styleTransferService.ts и server.ts (cooldown/timeout)",
  });

  const timedSteps = steps.filter((s: (typeof steps)[number]) => typeof s.durationMs === "number" && s.durationMs > 0);
  const slowestStep = [...timedSteps].sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))[0];
  const stepTimeSum = timedSteps.reduce((acc: number, s: (typeof steps)[number]) => acc + (s.durationMs ?? 0), 0);
  const slowestSharePct = slowestStep && stepTimeSum > 0 ? ((slowestStep.durationMs ?? 0) / stepTimeSum) * 100 : 0;
  const p34Status: DiagnosticParamStatus = !slowestStep ? "na" : slowestSharePct > 70 && (slowestStep.durationMs ?? 0) > 40_000 ? "warn" : "ok";
  pushParam({
    id: "bottleneck-stage",
    category: "pipeline-health",
    name: "Узкий этап по времени (Bottleneck)",
    donorValue: "—",
    sourceValue: "—",
    resultValue: slowestStep ? `${slowestStep.stage}: ${formatMs(slowestStep.durationMs)} (${slowestSharePct.toFixed(0)}%)` : "нет данных этапов",
    targetRule: "сбалансированное время этапов",
    status: p34Status,
    score: !slowestStep ? 0 : p34Status === "ok" ? 90 : 58,
    diagnosis: slowestStep ? `Больше всего времени занял этап «${slowestStep.stage}».` : "Поэтапная телеметрия недоступна (стек v1 или без этапов).",
    codeHint: "promptgpt-v2/application/styleTransferService.ts и promptgpt-v2/application/createGeminiService.ts",
  });

  const reqModel = v2?.requestedModel ?? "—";
  const usedModel = v2?.usedModel ?? "—";
  const didFallback = Boolean(v2?.fallbackOccurred) || (reqModel !== "—" && usedModel !== "—" && reqModel !== usedModel);
  pushParam({
    id: "model-engine-and-fallback",
    category: "pipeline-health",
    name: "Модель и авто-переход движка",
    donorValue: "—",
    sourceValue: `запрос: ${reqModel}`,
    resultValue: v2 ? (didFallback ? `${usedModel} (авто-переход)` : `${usedModel} (штатно)`) : "режим v1",
    targetRule: "без вынужденного авто-перехода",
    status: !v2 ? "na" : didFallback ? "warn" : "ok",
    score: !v2 ? 0 : didFallback ? 60 : 100,
    diagnosis: !v2
      ? "Данные маршрутизатора v2 не переданы."
      : didFallback
        ? `Сработал авто-переход с ${reqModel} на ${usedModel} (квота 429 или 503).`
        : "Отработала выбранная модель без переключения.",
    codeHint: "promptgpt-v2/infrastructure/modelRouter.ts и server.ts (V2_ROUTER cooldownMs)",
  });

  const sem = finalEval?.semanticReport;
  const propsOk = sem?.mandatoryPropositionsPreserved;
  const propsTotal = sem?.mandatoryPropositionsTotal;
  const anchorsOk = sem?.requiredAnchorsFound;
  const anchorsTotal = sem?.requiredAnchorsTotal;
  const hasPropStats = typeof propsOk === "number" && typeof propsTotal === "number" && propsTotal > 0;
  const hasAnchorStats = typeof anchorsOk === "number" && typeof anchorsTotal === "number" && anchorsTotal > 0;
  const safePropsOk = hasPropStats ? Math.max(0, Math.min(propsTotal!, propsOk!)) : 0;
  const safeAnchorsOk = hasAnchorStats ? Math.max(0, Math.min(anchorsTotal!, anchorsOk!)) : 0;
  const semanticEvidenceTotal = (hasPropStats ? propsTotal! : 0) + (hasAnchorStats ? anchorsTotal! : 0);
  const semanticEvidencePreserved = safePropsOk + safeAnchorsOk;
  const hasSemStats = semanticEvidenceTotal > 0;
  const propRatio = hasSemStats
    ? semanticEvidencePreserved / semanticEvidenceTotal
    : legacy?.factsPreservedPct !== undefined ? Math.max(0, Math.min(100, legacy.factsPreservedPct)) / 100 : null;
  const p36Score = propRatio === null ? 0 : clampScore(propRatio * 100);
  const semanticHardFailure = sem?.passed === false;
  pushParam({
    id: "semantic-propositions-anchors",
    category: "pipeline-health",
    name: "Полнота пропозиций и якорей",
    donorValue: "—",
    sourceValue: hasSemStats ? `${hasPropStats ? propsTotal : 0} проп. / ${hasAnchorStats ? anchorsTotal : 0} якор.` : "—",
    resultValue: hasSemStats
      ? `${safePropsOk}/${hasPropStats ? propsTotal : 0} проп. · ${safeAnchorsOk}/${hasAnchorStats ? anchorsTotal : 0} якор. (сохранено ${semanticEvidencePreserved}/${semanticEvidenceTotal})`
      : legacy ? `${legacy.factsPreservedPct ?? 100}% (потерь: ${legacy.factsLostAfter ?? 0})` : "нет отчёта",
    targetRule: "100% обязательных пропозиций и якорей",
    status: propRatio === null ? "na" : semanticHardFailure ? "fail" : p36Score === 100 ? "ok" : p36Score >= 85 ? "warn" : "fail",
    score: semanticHardFailure ? Math.min(p36Score, 49) : p36Score,
    diagnosis:
      propRatio === null
        ? "Семантическая проверка не выполнялась."
        : semanticHardFailure
          ? "Семантический верификатор отклонил результат: даже при высокой доле совпадений проверка целиком не пройдена."
          : p36Score >= 100
            ? "Все проверенные обязательные утверждения и якоря сохранены."
            : "Часть обязательных утверждений или якорей не подтверждена верификатором.",
    codeHint: "promptgpt-v2/semantic/semanticPreservation.ts и promptgpt-v2/application/routerAdapters.ts (assessCombined)",
  });

  const logicStep = stepMap.get("logical-structure");
  const logicOk = logicStep?.status === "completed";
  const logicFailed = logicStep?.status === "failed";
  pushParam({
    id: "logical-relations-integrity",
    category: "pipeline-health",
    name: "Логические связи (причина/следствие)",
    donorValue: "—",
    sourceValue: "—",
    resultValue: logicStep ? `${logicStep.status}: ${logicStep.detail ?? ""}`.slice(0, 72) : "не запускалось",
    targetRule: "статус completed (без инверсии связей)",
    status: !logicStep || logicStep.status === "skipped" ? "na" : logicOk ? "ok" : logicFailed ? "fail" : "warn",
    score: !logicStep || logicStep.status === "skipped" ? 0 : logicOk ? 100 : 35,
    diagnosis: logicOk
      ? "Все причинно-следственные и уступительные связи подтверждены."
      : logicStep?.detail || "Этап проверки логики не завершился или нашёл разрыв связи.",
    codeHint: "promptgpt-v2/semantic/logicalRelationPreservation.ts и promptgpt-v2/repair/semanticRestoration.ts",
  });

  const directScorer = scoreStyleDNA(donorProfile, resultProfile);
  const initScore = initialEval?.styleReport?.score ?? null;
  const finalV2Score = finalEval?.styleReport?.score ?? null;
  const computedDnaScore = finalV2Score ?? legacy?.dnaMatchAfter ?? directScorer.score ?? 0;
  const deltaStr = initScore !== null && finalV2Score !== null && initScore !== finalV2Score ? ` (черновик ${initScore} → финал ${finalV2Score})` : "";
  pushParam({
    id: "style-dna-score-progression",
    category: "pipeline-health",
    name: "Итоговый балл Style DNA и сдвиг",
    donorValue: "100 эталон",
    sourceValue: "—",
    resultValue: `${computedDnaScore}/100${deltaStr}`,
    targetRule: ">= 76 / 100",
    status: statusFromScore(computedDnaScore, 76, 58),
    score: clampScore(computedDnaScore),
    diagnosis:
      computedDnaScore >= 76
        ? "Взвешенное стилевое сходство проходит целевой порог."
        : "Низкий итоговый балл Style DNA — проверьте красные параметры в группах B–D.",
    codeHint: "promptgpt-v2/style/styleDNAScorer.ts и promptgpt-v2/style/candidateEvaluator.ts",
  });

  const restStep = stepMap.get("semantic-restoration");
  const restRollbackWarning = (activeCandidate?.warnings ?? []).some((w: string) => w.includes("откатилось") || w.includes("отклонён"));
  const restStatus: DiagnosticParamStatus =
    !restStep ? "na" : restRollbackWarning || restStep.status === "failed" ? "fail" : restStep.status === "not-completed" ? "warn" : "ok";
  pushParam({
    id: "stage8-restoration-health",
    category: "pipeline-health",
    name: "Stage 8: Смысловое восстановление",
    donorValue: "—",
    sourceValue: "—",
    resultValue: restStep ? `${restStep.status}${restRollbackWarning ? " (перехвачен откат)" : ""}` : "нет данных",
    targetRule: "без отката к исходнику",
    status: restStatus,
    score: !restStep ? 0 : restStatus === "ok" ? 100 : restStatus === "warn" ? 55 : 25,
    diagnosis: restRollbackWarning
      ? "Stage 8 попытался откатить текст к исходнику — сработала блокировка."
      : restStep?.detail || "Этап не запускался.",
    codeHint: "promptgpt-v2/repair/semanticRestoration.ts и promptgpt-v2/application/styleTransferService.ts",
  });

  const criticStep = stepMap.get("style-critic-repair");
  const criticSkippedWarnings = (v2?.warnings ?? []).concat(activeCandidate?.warnings ?? []).filter((w: string) => w.includes("непривязанные") || w.includes("unverified"));
  const criticStatus: DiagnosticParamStatus =
    !criticStep
      ? "na"
      : criticStep.status === "failed"
        ? "fail"
        : criticStep.status === "not-completed" || criticSkippedWarnings.length > 0
          ? "warn"
          : "ok";
  pushParam({
    id: "stage9-critic-repair-health",
    category: "pipeline-health",
    name: "Stage 9a: StyleCritic + SurgicalRepair",
    donorValue: "—",
    sourceValue: "—",
    resultValue: criticStep
      ? `${criticStep.status}${activeCandidate?.repaired ? " · правка применена" : ""}`
      : legacy
        ? `запусков: ${legacy.criticRuns ?? 0}, балл: ${legacy.criticScore ?? "н/д"}`
        : "нет данных",
    targetRule: "без ошибок span и без просадки стиля",
    status: criticStatus,
    score: !criticStep ? 0 : criticStatus === "ok" ? 100 : criticStatus === "warn" ? 65 : 20,
    diagnosis:
      criticSkippedWarnings.length > 0
        ? "Часть замечаний критика была отфильтрована из-за неточных цитат."
        : criticStep?.detail || "Этап критика/правки не выполнялся.",
    codeHint: "promptgpt-v2/critic/styleCritic.ts и promptgpt-v2/repair/surgicalRepair.ts",
  });

  const okCount = parameters.filter((p) => p.status === "ok").length;
  const warnCount = parameters.filter((p) => p.status === "warn").length;
  const failCount = parameters.filter((p) => p.status === "fail").length;
  const naCount = parameters.filter((p) => p.status === "na").length;

  const scored = parameters.filter((p) => p.status !== "na" && p.confidence > 0);
  const confidenceWeight = scored.reduce((sum, p) => sum + p.confidence, 0);
  const overallHealthScore = confidenceWeight > 0
    ? clampScore(scored.reduce((sum, p) => sum + p.score * p.confidence, 0) / confidenceWeight)
    : 0;

  const recMap = new Map<string, { count: number; indices: number[]; names: string[] }>();
  for (const p of parameters) {
    if (p.status !== "fail" && p.status !== "warn") continue;
    const primaryFile = p.codeHint.split(" ")[0];
    const cur = recMap.get(primaryFile) ?? { count: 0, indices: [], names: [] };
    cur.count += p.status === "fail" ? 2 : 1;
    cur.indices.push(p.index);
    cur.names.push(p.name);
    recMap.set(primaryFile, cur);
  }
  const topCodeRecommendations: DnaCodeRecommendation[] = [...recMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6)
    .map(([file, info]) => ({
      file,
      issueCount: info.indices.length,
      paramIndices: info.indices,
      summary: `Проблемы по пунктам #${info.indices.join(", #")}: ${info.names.slice(0, 3).join("; ")}${info.names.length > 3 ? "…" : ""}`,
    }));

  return {
    totalParameters: 40,
    okCount,
    warnCount,
    failCount,
    naCount,
    overallHealthScore,
    topCodeRecommendations,
    parameters,
    profileQuality: {
      donor: { status: donorProfile.status, confidence: donorProfile.confidence, words: dCorpus.words, sentences: dCorpus.sentences },
      source: { status: sourceProfile.status, confidence: sourceProfile.confidence, words: sCorpus.words, sentences: sCorpus.sentences },
      result: { status: resultProfile.status, confidence: resultProfile.confidence, words: rCorpus.words, sentences: rCorpus.sentences },
      warnings: profileWarnings,
    },
  };
}
