import { Type } from "@google/genai";
import type { ModelRouter, ModelTask } from "../infrastructure/modelRouter";
import { parseJsonUnknown, isRecord, isNonEmptyString, isFiniteNumberInRange } from "../infrastructure/jsonValidation";
import type { PropositionAssessment } from "../types";
import type { CandidateModelAdapter } from "../style/candidateGenerator";
import type { StyleCriticAdapter } from "../critic/styleCritic";
import type { SurgicalRepairAdapter } from "../repair/surgicalRepair";
import type { SemanticVerifier } from "./applicationTypes";
import { getLogicalRelationAuditKey } from "../semantic/semanticStructureAudit";
import type { LogicalRelationAssessment } from "../semantic/logicalRelationPreservation";
import type { ApplicationModelRoutes } from "./applicationTypes";
import { resolveVerbatimSpan } from "../semantic/spanAnchor";
import { computeWordTrigramOverlap } from "../style/textOverlap";
export { computeWordTrigramOverlap };

const PROPOSITION_ASSESSMENT_ARRAY_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      propositionId: { type: Type.STRING },
      status: { type: Type.STRING, enum: ["preserved", "changed", "omitted", "uncertain"] },
      outputEvidence: { type: Type.ARRAY, items: { type: Type.STRING } },
      rationale: { type: Type.STRING },
      confidence: { type: Type.NUMBER },
    },
    required: ["propositionId", "status", "outputEvidence", "rationale", "confidence"],
  },
};

const RELATION_ASSESSMENT_ARRAY_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      relationKey: { type: Type.STRING },
      status: { type: Type.STRING, enum: ["preserved", "changed", "omitted", "uncertain"] },
      outputEvidence: { type: Type.ARRAY, items: { type: Type.STRING } },
      rationale: { type: Type.STRING },
      confidence: { type: Type.NUMBER },
    },
    required: ["relationKey", "status", "outputEvidence", "rationale", "confidence"],
  },
};

const COMBINED_VERIFICATION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    propositionAssessments: PROPOSITION_ASSESSMENT_ARRAY_SCHEMA,
    relationAssessments: RELATION_ASSESSMENT_ARRAY_SCHEMA,
  },
  required: ["propositionAssessments", "relationAssessments"],
};

const CRITIC_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    styleFidelityScore: { type: Type.NUMBER },
    naturalnessScore: { type: Type.NUMBER },
    issues: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          type: {
            type: Type.STRING,
            enum: [
              "syntax-mismatch",
              "rhythm-mismatch",
              "punctuation-mismatch",
              "connector-mismatch",
              "lexical-overfitting",
              "paragraph-structure",
              "unnatural-construction",
              "unsupported-style-claim",
            ],
          },
          severity: { type: Type.STRING, enum: ["blocking", "warning", "info"] },
          outputSpan: {
            type: Type.OBJECT,
            properties: {
              start: { type: Type.INTEGER },
              end: { type: Type.INTEGER },
              text: { type: Type.STRING },
            },
            required: ["start", "end", "text"],
          },
          donorFeatureId: { type: Type.STRING },
          donorEvidenceExcerpt: { type: Type.STRING },
          rationale: { type: Type.STRING },
          suggestedChange: { type: Type.STRING },
          affectedPropositionIds: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: [
          "id",
          "type",
          "severity",
          "outputSpan",
          "donorFeatureId",
          "donorEvidenceExcerpt",
          "rationale",
          "suggestedChange",
          "affectedPropositionIds",
        ],
      },
    },
  },
  required: ["styleFidelityScore", "naturalnessScore", "issues"],
};

const REPAIR_RESPONSE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      issueId: { type: Type.STRING },
      expectedText: { type: Type.STRING },
      replacement: { type: Type.STRING },
    },
    required: ["issueId", "expectedText", "replacement"],
  },
};

function routeFor(routes: ApplicationModelRoutes, task: ModelTask) {
  switch (task) {
    case "candidate-generation": return routes.candidateGeneration;
    case "style-critique": return routes.styleCritique;
    case "surgical-repair": return routes.surgicalRepair;
    case "semantic-verification": return routes.semanticVerification;
    default: throw new Error(`No application route is configured for task ${task}.`);
  }
}
type ThinkingLevelOption = "low" | "medium" | "high";

const DEFAULT_THINKING_BY_TASK: Record<ModelTask, ThinkingLevelOption> = {
  "style-analysis": "medium",
  "candidate-generation": "medium",
  "style-critique": "medium",
  "surgical-repair": "medium",
  "semantic-extraction": "high",
  "semantic-verification": "medium",
  "general": "medium",
};

const CANDIDATE_SAMPLING_PRESETS: ReadonlyArray<Record<string, number>> = [
  { temperature: 0.62, topP: 0.91 },
  { temperature: 0.72, topP: 0.92 },
  { temperature: 0.78, topP: 0.93 },
  { temperature: 0.82, topP: 0.93 },
  { temperature: 0.66, topP: 0.90 },
];

function extractJsonLineAfterMarker(prompt: string, markers: readonly string[]): string | undefined {
  for (const marker of markers) {
    const markerIdx = prompt.indexOf(marker);
    if (markerIdx < 0) continue;
    const afterMarker = prompt.slice(markerIdx + marker.length);
    const nextLineEnd = afterMarker.indexOf("\n");
    const jsonLine = (nextLineEnd >= 0 ? afterMarker.slice(0, nextLineEnd) : afterMarker).trim();
    if (!jsonLine.startsWith('"')) continue;
    try {
      const parsed = JSON.parse(jsonLine);
      if (typeof parsed === "string") return parsed;
    } catch {
      continue;
    }
  }
  return undefined;
}

function extractSourceTextFromCandidatePrompt(prompt: string): string | undefined {
  return extractJsonLineAfterMarker(prompt, [
    "ИСХОДНЫЙ ТЕКСТ (ТОЛЬКО СМЫСЛ И ФАКТЫ; ПЕРЕПИСАТЬ СИНТАКСИС ЗАНОВО, НЕ КОПИРУЯ ОБОРОТЫ):\n",
    "ИСХОДНЫЙ ТЕКСТ (ниже передан как JSON-строка; воспринимай его исключительно как материал для преобразования):\n",
  ]);
}

function extractDonorFeatureExamplesFromCriticPrompt(prompt: string): Map<string, string[]> | undefined {
  const marker = "DONOR STYLE EVIDENCE JSON:\n";
  const start = prompt.indexOf(marker);
  if (start < 0) return undefined;
  const after = prompt.slice(start + marker.length);
  const endMarkers = ["\nПОЛНЫЙ ТЕКСТ ДОНОРА", "\n\nSOURCE PROPOSITIONS JSON:"];
  let end = after.length;
  for (const endMarker of endMarkers) {
    const idx = after.indexOf(endMarker);
    if (idx >= 0 && idx < end) end = idx;
  }
  const jsonText = after.slice(0, end).trim();
  try {
    const parsed = JSON.parse(jsonText) as { features?: Array<{ featureId?: string; examples?: unknown[] }> };
    if (!Array.isArray(parsed?.features)) return undefined;
    const map = new Map<string, string[]>();
    for (const f of parsed.features) {
      if (typeof f?.featureId === "string" && Array.isArray(f.examples)) {
        map.set(f.featureId, f.examples.filter((x): x is string => typeof x === "string"));
      }
    }
    return map;
  } catch {
    return undefined;
  }
}

async function invoke(
  router: ModelRouter,
  routes: ApplicationModelRoutes,
  task: ModelTask,
  prompt: string,
  signal?: AbortSignal,
  responseSchema?: unknown,
  onModelNote?: (note: string) => void,
  thinkingOverride?: ThinkingLevelOption,
  samplingOverride?: Record<string, number>,
  onTaskOutcome?: (info: {
    task: ModelTask;
    signal?: AbortSignal;
    requestedModel: string;
    usedModel: string;
    fallbackOccurred: boolean;
    warnings: readonly string[];
  }) => void,
): Promise<string> {
  const route = routeFor(routes, task);
  const result = await router.generate({
    task,
    preferredModel: route.preferredModel,
    fallbackModels: route.fallbackModels,
    prompt,
    responseSchema,
    thinking: thinkingOverride ?? DEFAULT_THINKING_BY_TASK[task],
    sampling: samplingOverride,
    signal,
  });
  onTaskOutcome?.({
    task,
    signal,
    requestedModel: result.requestedModel,
    usedModel: result.usedModel,
    fallbackOccurred: result.fallbackOccurred,
    warnings: result.warnings,
  });
  if (onModelNote) {
    if (result.fallbackOccurred) {
      onModelNote(`Этап ${task}: выполнен автоматический переход с ${result.requestedModel} на ${result.usedModel}.`);
    }
    for (const warning of result.warnings) {
      onModelNote(warning);
    }
  }
  return result.text;
}

function validateRelationAssessments(value: unknown): value is LogicalRelationAssessment[] {
  return Array.isArray(value) && value.every((item) =>
    isRecord(item) && isNonEmptyString(item.relationKey) &&
    ["preserved", "changed", "omitted", "uncertain"].includes(String(item.status)) &&
    Array.isArray(item.outputEvidence) && item.outputEvidence.every((evidence) => typeof evidence === "string") &&
    typeof item.rationale === "string" && isFiniteNumberInRange(item.confidence, 0, 1)
  );
}

function validateAssessments(value: unknown): value is PropositionAssessment[] {
  return Array.isArray(value) && value.every((item) =>
    isRecord(item) &&
    isNonEmptyString(item.propositionId) &&
    ["preserved", "changed", "omitted", "uncertain"].includes(String(item.status)) &&
    Array.isArray(item.outputEvidence) &&
    item.outputEvidence.every((evidence) => typeof evidence === "string") &&
    typeof item.rationale === "string" &&
    isFiniteNumberInRange(item.confidence, 0, 1)
  );
}

/** Creates adapters backed by one shared router and its long-lived provider client. */
export function createRouterAdapters(
  router: ModelRouter,
  routes: ApplicationModelRoutes,
  options: {
    onModelNote?: (note: string) => void;
    onTaskOutcome?: (info: {
      task: ModelTask;
      signal?: AbortSignal;
      requestedModel: string;
      usedModel: string;
      fallbackOccurred: boolean;
      warnings: readonly string[];
    }) => void;
    thinkingByTask?: Partial<Record<ModelTask, ThinkingLevelOption>>;
  } = {},
): {
  candidateGenerator: CandidateModelAdapter;
  critic: StyleCriticAdapter;
  repair: SurgicalRepairAdapter;
  semanticVerifier: SemanticVerifier;
} {
  const wrapInvoke = (
    task: ModelTask,
    prompt: string,
    signal?: AbortSignal,
    schema?: unknown,
    sampling?: Record<string, number>,
  ) =>
    invoke(
      router,
      routes,
      task,
      prompt,
      signal,
      schema,
      options.onModelNote,
      options.thinkingByTask?.[task],
      sampling,
      options.onTaskOutcome,
    );
  return {
    candidateGenerator: {
      async generate({ prompt, candidateIndex, signal }) {
        const isSemanticRestoration = prompt.startsWith("ЗАДАЧА: восстанови в преобразованном тексте");
        const sampling = isSemanticRestoration
          ? { temperature: 0.35, topP: 0.90 }
          : CANDIDATE_SAMPLING_PRESETS[candidateIndex % CANDIDATE_SAMPLING_PRESETS.length];
        const firstDraft = await wrapInvoke("candidate-generation", prompt, signal, undefined, sampling);
        if (isSemanticRestoration) {
          const origSource = extractJsonLineAfterMarker(prompt, ["IMMUTABLE ORIGINAL SOURCE JSON:\n"]);
          const baseCandidate = extractJsonLineAfterMarker(prompt, ["CURRENT CANDIDATE JSON:\n"]);
          if (origSource && baseCandidate && origSource.length >= 120) {
            const baseOverlap = computeWordTrigramOverlap(origSource, baseCandidate);
            const restoredOverlap = computeWordTrigramOverlap(origSource, firstDraft);
            if (baseOverlap < 0.45 && restoredOverlap >= 0.36 && restoredOverlap > baseOverlap + 0.12) {
              options.onModelNote?.(
                `Восстановление смысла откатилось к синтаксису исходника (${Math.round(restoredOverlap * 100)}%); запускается точечная правка поверх кандидата.`,
              );
              const restoreEscalation = [
                prompt,
                "",
                `КРИТИЧЕСКАЯ ОШИБКА: ТВОЙ ПРОШЛЫЙ ВАРИАНТ СКОПИРОВАЛ ИСХОДНЫЙ ТЕКСТ (${Math.round(restoredOverlap * 100)}% совпадения)!`,
                "КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО переписывать абзацы из IMMUTABLE ORIGINAL SOURCE JSON!",
                "Возьми за основу ТОЛЬКО CURRENT CANDIDATE JSON, сохрани его стиль, разбивку фраз, тире, скобки и перефразировку, и ТОЧЕЧНО вставь в него ТОЛЬКО недостающие детали из VERIFICATION FINDINGS!",
              ].join("\n");
              try {
                const rewritten = await wrapInvoke("candidate-generation", restoreEscalation, signal, undefined, {
                  temperature: 0.42,
                  topP: 0.90,
                });
                if (rewritten.trim()) {
                  const retryOverlap = computeWordTrigramOverlap(origSource, rewritten);
                  if (rewritten.trim().length >= baseCandidate.trim().length * 0.6 && retryOverlap < restoredOverlap) {
                    return rewritten;
                  }
                }
              } catch {
                // Return firstDraft if the targeted anti-verbatim restoration retry fails.
              }
            }
          }
          return firstDraft;
        }
        const sourceText = extractSourceTextFromCandidatePrompt(prompt);
        if (!sourceText || sourceText.length < 120) return firstDraft;
        const firstOverlap = computeWordTrigramOverlap(sourceText, firstDraft);
        // Avoid multiplying model calls for every candidate: only candidate 1
        // may receive one extra pass, and only for substantial copied passages.
        const overlapThreshold = 0.55;
        if (candidateIndex !== 0 || firstOverlap < overlapThreshold) return firstDraft;

        options.onModelNote?.(
          `Кандидат ${candidateIndex + 1}: обнаружено дословное совпадение с исходником (${Math.round(firstOverlap * 100)}%); запускается глубокая синтаксическая пересборка под стиль донора.`,
        );
        const escalatedPrompt = [
          prompt,
          "",
          "ОГРАНИЧЕННАЯ КОРРЕКЦИЯ: предыдущий вариант сохранил слишком много длинных дословных фрагментов исходника. Перестрой синтаксический каркас и ход фраз в манере донора, сохраняя точные термины, факты, устойчивые выражения и все логические отношения.",
          "Не запрещай общеупотребительные связки и не исправляй донорские повторы, орфографические/грамматические отклонения и пунктуационные привычки. Переноси их пропорционально и только в естественных контекстных аналогах; не подменяй содержание донора содержанием исходника и наоборот.",
        ].join("\n");
        try {
          const rewritten = await wrapInvoke("candidate-generation", escalatedPrompt, signal, undefined, {
            temperature: 0.84,
            topP: 0.93,
          });
          if (!rewritten.trim()) return firstDraft;
          const rewrittenOverlap = computeWordTrigramOverlap(sourceText, rewritten);
          const reasonableLength = rewritten.trim().length >= sourceText.trim().length * 0.45;
          if (reasonableLength && rewrittenOverlap < firstOverlap) {
            return rewritten;
          }
        } catch {
          // Keep the first valid draft rather than failing if the rewrite retry errors out.
        }
        return firstDraft;
      },
    },
    critic: {
      async review(prompt, signal) {
        const raw = await wrapInvoke("style-critique", prompt, signal, CRITIC_RESPONSE_SCHEMA);
        const candidateText = extractJsonLineAfterMarker(prompt, ["CANDIDATE TEXT JSON:\n"]);
        if (!candidateText) return raw;
        const donorExamples = extractDonorFeatureExamplesFromCriticPrompt(prompt);
        const normalizeWs = (v: string) => v.replace(/\s+/gu, " ").trim();
        const sanitizeIssues = (parsedObj: Record<string, unknown>) => {
          const rawIssues = Array.isArray(parsedObj.issues) ? parsedObj.issues : [];
          const validIssues: Array<Record<string, unknown>> = [];
          const invalidIds: string[] = [];
          for (const entry of rawIssues) {
            if (!isRecord(entry)) continue;
            const anchored = resolveVerbatimSpan(candidateText, entry.outputSpan, undefined, 0, true);
            const spanOk = isRecord(anchored) &&
              Number.isInteger(anchored.start) &&
              Number.isInteger(anchored.end) &&
              (anchored.start as number) >= 0 &&
              (anchored.end as number) > (anchored.start as number) &&
              (anchored.end as number) <= candidateText.length &&
              typeof anchored.text === "string" &&
              candidateText.slice(anchored.start as number, anchored.end as number) === anchored.text;
            let evidenceOk = typeof entry.donorEvidenceExcerpt === "string" && normalizeWs(entry.donorEvidenceExcerpt).length > 0;
            if (evidenceOk && donorExamples) {
              const examples = donorExamples.get(String(entry.donorFeatureId));
              const normExcerpt = normalizeWs(entry.donorEvidenceExcerpt as string);
              evidenceOk = !!examples && examples.some((ex) => normalizeWs(ex).includes(normExcerpt));
            }
            if (spanOk && evidenceOk) {
              validIssues.push({ ...entry, outputSpan: anchored });
            } else if (typeof entry.id === "string") {
              invalidIds.push(entry.id);
            }
          }
          return { validIssues, invalidIds, total: rawIssues.length };
        };

        try {
          const parsed = parseJsonUnknown(raw);
          if (!isRecord(parsed)) return raw;
          const firstCheck = sanitizeIssues(parsed);
          if (firstCheck.invalidIds.length === 0) {
            return JSON.stringify({ ...parsed, issues: firstCheck.validIssues });
          }
          if (firstCheck.validIssues.length === 0 && firstCheck.total > 0) {
            const retryPrompt = [
              prompt,
              "",
              `ОШИБКА ПРОШЛОГО ОТВЕТА (${firstCheck.invalidIds.join(", ")}): outputSpan.text НЕ является точной дословной подстрокой CANDIDATE TEXT JSON или donorEvidenceExcerpt не совпадает с examples!`,
              "Повтори ответ: скопируй outputSpan.text СТРОГО символ-в-символ из CANDIDATE TEXT JSON (3–10 слов), а donorEvidenceExcerpt — СТРОГО символ-в-символ из examples соответствующего featureId. Если точных нарушений нет, верни issues: [].",
            ].join("\n");
            try {
              const retryRaw = await wrapInvoke("style-critique", retryPrompt, signal, CRITIC_RESPONSE_SCHEMA);
              const retryParsed = parseJsonUnknown(retryRaw);
              if (isRecord(retryParsed)) {
                const retryCheck = sanitizeIssues(retryParsed);
                if (retryCheck.invalidIds.length > 0) {
                  options.onModelNote?.(`StyleCritic: отфильтрованы непривязанные замечания (${retryCheck.invalidIds.join(", ")}).`);
                }
                return JSON.stringify({ ...retryParsed, issues: retryCheck.validIssues });
              }
            } catch {
              // Fall through and strip unanchored issues cleanly.
            }
          }
          options.onModelNote?.(`StyleCritic: отфильтрованы непривязанные замечания (${firstCheck.invalidIds.join(", ")}).`);
          return JSON.stringify({ ...parsed, issues: firstCheck.validIssues });
        } catch {
          return raw;
        }
      },
    },
    repair: {
      repair: (prompt, signal) => wrapInvoke("surgical-repair", prompt, signal, REPAIR_RESPONSE_SCHEMA),
    },
    semanticVerifier: {
      async assessCombined({ sourceText, candidateText, propositions, signal }) {
        const relations = new Map<string, unknown>();
        for (const proposition of propositions) {
          for (const relation of proposition.relations) relations.set(getLogicalRelationAuditKey(relation), relation);
        }
        const prompt = [
          "Выполни две отдельные проверки сохранения смысла кандидата относительно оригинала. Это два самостоятельных отчёта в одном JSON-ответе; не смешивай их элементы.",
          "КРИТИЧЕСКОЕ ПРАВИЛО ЦИТИРОВАНИЯ outputEvidence: каждая строка внутри массива outputEvidence ОБЯЗАНА быть точной, непрерывной, дословной подстрокой ИМЕННО из CANDIDATE JSON (копируй символ-в-символ из кандидата!). НИКОГДА не используй многоточия (...), не склеивай несмежные куски, не меняй слова и не копируй формулировки из ORIGINAL SOURCE JSON, если кандидат переписал фразу иначе! Если нужные части находятся в разных местах, укажи 2 коротких точных фрагмента подряд в массиве outputEvidence (например, [\"первый фрагмент\", \"второй фрагмент\"]).",
          "ОТЧЁТ 1 — propositionAssessments: проверь каждую исходную пропозицию отдельно: субъект, предикат, объект, отрицание, модальность, условия, оговорки, причинность, последовательность и атрибуцию. Отдельно сверь КАЖДОЕ значение qualifications и modality: нельзя признать пропозицию полностью сохранённой, если основной тезис остался, но исчезло существенное уточнение, ограничение, степень, частотность, временная оговорка или усилитель. Смысловой эквивалент в синтаксисе и лексике донора полностью допускается; буквальное совпадение с исходником не требуется. Верни ровно одну оценку на каждый propositionId. Статусы: preserved, changed, omitted, uncertain. outputEvidence — точные непустые фрагменты CANDIDATE JSON. При сомнении используй uncertain.",
          "ОТЧЁТ 2 — relationAssessments: проверь каждую исходную логическую связь отдельно. Наличие обоих фактов не доказывает сохранение связи. Проверь направление, тип, причинность, временной порядок, условия, уступки, цель, противопоставление, сравнение и атрибуцию. Не требуй исходного союза дословно: допускай равнозначную синтаксическую конструкцию в манере донора, но только если она сохраняет то же отношение между теми же положениями и его направление. Для preserved outputEvidence должен состоять из 1–2 точных дословных подстрок CANDIDATE JSON без сокращений и без «...». Не возвращай пустое evidence для preserved. Для каждой relationKey верни ровно одну оценку со статусом preserved, changed, omitted или uncertain.",
          "КРИТИЧЕСКОЕ ПРАВИЛО О ФОРМЕ, ОШИБКАХ ДОНОРА И ПУНКТУАЦИИ: кандидат намеренно воспроизводит стилевую ДНК текста-донора, включая опечатки, орфографические ошибки, грамматические несогласования (в роде, числе, падеже, управлении), разговорный синтаксис и крайне редкую/нестандартную пунктуацию (например, «2 запятых на 3 абзаца»). Если при наличии таких перенесённых особенностей формы пропозициональный смысл, субъект/предикат/объект, отрицание, модальность, уточнения и логические отношения понятны и сохранены, ОБЯЗАТЕЛЬНО ставь preserved и НИКОГДА не помечай пропозицию или связь как changed/omitted/uncertain и не снижай confidence только из-за орфографической, грамматической или пунктуационной погрешности.",
          "Не пропускай элементы. Не добавляй неизвестные ID или ключи. Если исходных связей нет, верни relationAssessments: []. При любой неопределённости укажи uncertain. Если утверждение или связь сохранены (preserved), ставь confidence >= 0.90; если уверенность ниже 0.85 — указывай status: \"uncertain\" или \"changed\".",
          "ЛАКОНИЧНОСТЬ rationale: пиши rationale максимально кратко (3–10 слов; для preserved достаточно «Сохранено в манере донора»).",
          "Верни только JSON-объект: {propositionAssessments:[{propositionId,status,outputEvidence,rationale,confidence}],relationAssessments:[{relationKey,status,outputEvidence,rationale,confidence}]}. confidence — число от 0 до 1.",
          "", "ORIGINAL SOURCE JSON:", JSON.stringify(sourceText),
          "", "CANDIDATE JSON:", JSON.stringify(candidateText),
          "", "SOURCE PROPOSITIONS JSON:", JSON.stringify(propositions),
          "", "SOURCE RELATIONS JSON:", JSON.stringify([...relations.entries()].map(([relationKey, relation]) => ({ relationKey, relation }))),
        ].join("\n");
        const raw = await wrapInvoke("semantic-verification", prompt, signal, COMBINED_VERIFICATION_SCHEMA);
        const parsed = parseJsonUnknown(raw);
        if (!isRecord(parsed) || !validateAssessments(parsed.propositionAssessments) ||
            !validateRelationAssessments(parsed.relationAssessments)) {
          throw new Error("Combined semantic verifier returned invalid proposition or relation assessments.");
        }
        const anchorEvidenceList = (evidenceList: readonly string[]) =>
          evidenceList.map((ev) => {
            if (!ev || candidateText.includes(ev)) return ev;
            const anchored = resolveVerbatimSpan(candidateText, { start: 0, end: 0, text: ev }, undefined, 0, true);
            if (isRecord(anchored) && typeof anchored.text === "string" && candidateText.includes(anchored.text)) {
              return anchored.text;
            }
            return ev;
          });
        return {
          propositionAssessments: parsed.propositionAssessments.map((item) => ({
            ...item,
            outputEvidence: anchorEvidenceList(item.outputEvidence),
          })),
          relationAssessments: parsed.relationAssessments.map((item) => ({
            ...item,
            outputEvidence: anchorEvidenceList(item.outputEvidence),
          })),
        };
      },
      async assess({ sourceText, candidateText, propositions, signal }) {
        const prompt = [
          "Проведи независимую проверку сохранения содержания преобразованного текста относительно неизменного оригинала.",
          "Проверь каждую пропозицию отдельно: субъект, предикат, объект, отрицание, модальность, условия, оговорки, причинность, последовательность и атрибуцию. Обязательно проверь каждое уточнение в qualifications и modality; основной тезис без существенного уточнения не считается полностью сохранённым. Семантически равнозначная формулировка считается preserved, даже если слова отличаются.",
          "Не считай стилистическое сходство доказательством смысловой сохранности. Не додумывай отсутствующие утверждения.",
          "Намеренные стилевые особенности формы (включая перенесённые из донора опечатки, орфографические отклонения, грамматические несогласования или редкую/нестандартную пунктуацию) не являются изменением смысла сами по себе, если субъект, предикат, объект, полярность, модальность и уточнения сохранены.",
          "Для каждого ID верни ровно одну оценку. КРИТИЧЕСКОЕ ПРАВИЛО ЦИТИРОВАНИЯ outputEvidence: каждая строка внутри outputEvidence ОБЯЗАНА быть точной, непрерывной, дословной подстрокой ИМЕННО из CANDIDATE JSON (без многоточий «...», без склейки и без копирования формулировок из ORIGINAL SOURCE JSON). Если части находятся в разных местах, укажи 2 коротких точных фрагмента подряд в массиве outputEvidence. При сомнении используй uncertain.",
          "Верни только JSON-массив: [{propositionId,status,outputEvidence,rationale,confidence}]. confidence — число от 0 до 1. rationale пиши кратко (3–10 слов).",
          "",
          "ORIGINAL SOURCE JSON:",
          JSON.stringify(sourceText),
          "",
          "CANDIDATE JSON:",
          JSON.stringify(candidateText),
          "",
          "SOURCE PROPOSITIONS JSON:",
          JSON.stringify(propositions),
        ].join("\n");
        const raw = await wrapInvoke("semantic-verification", prompt, signal, PROPOSITION_ASSESSMENT_ARRAY_SCHEMA);
        const parsed = parseJsonUnknown(raw);
        if (!validateAssessments(parsed)) {
          throw new Error("Semantic verifier returned an invalid assessment array.");
        }
        return parsed;
      },
      async assessRelations({ sourceText, candidateText, propositions, signal }) {
        const relations = new Map<string, unknown>();
        for (const proposition of propositions) {
          for (const relation of proposition.relations) relations.set(getLogicalRelationAuditKey(relation), relation);
        }
        if (relations.size === 0) return [];
        const prompt = [
          "Проведи независимое сравнение логической структуры оригинала и преобразованного текста.",
          "Оцени каждую исходную логическую связь ровно один раз: направление причины и следствия, временной порядок, условия, уступки, цель, противопоставление, сравнение и атрибуцию.",
          "Факты могут сохраниться, даже если связь между ними перевёрнута, ослаблена или исчезла. Не считай простое наличие обоих фактов сохранением связи.",
          "Для каждой связи верни status: preserved, changed, omitted или uncertain. Не требуй исходный союз дословно: допускай равнозначную синтаксическую конструкцию, если сохраняется то же отношение между теми же положениями и его направление. Пропуск запятой или стилевые отклонения/ошибки формы, перенесённые из донора, не означают утрату логической связи, если смысл и направление отношения однозначно сохранены. КРИТИЧЕСКОЕ ПРАВИЛО ЦИТИРОВАНИЯ outputEvidence: при preserved массив outputEvidence должен содержать 1–2 точные, непрерывные, дословные подстроки ИМЕННО из CANDIDATE JSON без «...», без изменений и без цитат из ORIGINAL SOURCE JSON. Не оставляй outputEvidence пустым и не выдумывай цитаты.",
          "relationKey должен дословно совпадать с ключом связи из SOURCE RELATIONS JSON. rationale пиши кратко (3–10 слов). Верни только JSON-массив объектов {relationKey,status,outputEvidence,rationale,confidence}.",
          "", "ORIGINAL SOURCE JSON:", JSON.stringify(sourceText),
          "", "CANDIDATE JSON:", JSON.stringify(candidateText),
          "", "SOURCE RELATIONS JSON:", JSON.stringify([...relations.entries()].map(([relationKey, relation]) => ({ relationKey, relation }))),
        ].join("\n");
        const raw = await wrapInvoke("semantic-verification", prompt, signal, RELATION_ASSESSMENT_ARRAY_SCHEMA);
        const parsed = parseJsonUnknown(raw);
        if (!validateRelationAssessments(parsed)) throw new Error("Semantic structure verifier returned an invalid relation assessment array.");
        return parsed;
      },
    },
  };
}
