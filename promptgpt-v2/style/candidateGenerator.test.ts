import { buildFactInventory } from "../semantic/factInventory";
import { buildSemanticInventory } from "../semantic/buildInventory";
import { analyzeStyleDNA } from "./styleDNAAnalyzer";
import { createDonorStyleBaseline } from "./donorBaseline";
import { buildCandidatePrompt, generateCandidates } from "./candidateGenerator";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Candidate generator self-test failed: ${message}`);
}
function donorText(): string {
  return Array.from({ length: 20 }, () =>
    "И тогда автор подробно объяснил обстоятельства, поскольку они имели особенное значение. Однако затем повествование продолжилось."
  ).join("\n\n");
}

export async function runCandidateGeneratorSelfTests(): Promise<{ passed: number; names: string[] }> {
  const names: string[] = [];
  const donor = analyzeStyleDNA(donorText(), {
    minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10,
  });
  const donorWithIrregularity = donorText() + "\n\nОн обруживает эту особенность в тексте.";
  const donorWithIrregularityProfile = analyzeStyleDNA(donorWithIrregularity, {
    minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10,
  });
  const created = createDonorStyleBaseline(donorWithIrregularityProfile, donorWithIrregularity);
  assert(created.ok && !!created.baseline, "donor baseline fixture is available");
  const baseline = created.baseline!;
  const sourceText = "В 1912 году автор описал событие.";
  const inventory = buildFactInventory(sourceText);

  const prompt = buildCandidatePrompt({
    sourceText, inventory, donorBaseline: baseline, candidateIndex: 0,
    styleIntensity: 5, maxDonorExamples: 3,
  });
  assert(prompt.includes(JSON.stringify(sourceText)), "source text is embedded as a JSON string");
  assert(prompt.includes("не переноси факты") || prompt.includes("НЕ ПЕРЕНОСИ факты"),
    "prompt separates donor style from donor content");
  assert(prompt.includes("1912"), "required numeric anchor is supplied to the model");
  assert(prompt.includes("обруживает"), "exact donor spelling irregularities are supplied as style evidence");
  assert(prompt.includes("сопоставимой частотности") && prompt.includes("грамматические несогласования") && prompt.includes("punctuation.comma"),
    "prompt requires frequency-calibrated imitation of donor irregularities, agreements, and comma density");
  assert(!prompt.includes("lexical.repeat.") && !prompt.includes("Повторяющееся окончание:"),
    "topic-specific repeated words and exact donor endings are not presented as style instructions");
  assert(prompt.includes("сверь все смысловые элементы") && prompt.includes("все смысловые элементы"),
    "generation prompt explicitly requires a complete semantic review");
  assert(prompt.toLocaleLowerCase("ru-RU").includes("не исправляй их автоматически") && prompt.includes("естественный аналог"),
    "donor irregularities must be preserved contextually instead of normalized or copied mechanically");
  const longInstructions = "УКАЗАНИЕ".repeat(700);
  const uncappedPrompt = buildCandidatePrompt({
    sourceText, inventory, donorBaseline: baseline, candidateIndex: 0,
    styleIntensity: 5, maxDonorExamples: Number.MAX_SAFE_INTEGER,
    customInstructions: longInstructions,
  });
  assert(uncappedPrompt.includes(longInstructions), "long user instructions are not silently truncated");
  assert(!uncappedPrompt.includes("90%") && !uncappedPrompt.includes("115%"), "generation prompt has no arbitrary output-length ratio");
  names.push("unbounded custom-instruction text and removal of fixed output-length ratio");
  const secondPrompt = buildCandidatePrompt({
    sourceText, inventory, donorBaseline: baseline, candidateIndex: 1,
    styleIntensity: 5, maxDonorExamples: 3,
  });
  assert(prompt !== secondPrompt, "candidate indices produce deliberately distinct stylistic approaches");
  names.push("prompt content, semantic constraints, donor spelling preservation and candidate diversity");

  const nativeConnectorDonorText = donorWithIrregularity + "\nТем не менее, данное положение сохраняет значение.";
  const nativeConnectorProfile = analyzeStyleDNA(nativeConnectorDonorText, {
    minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10,
  });
  const nativeConnectorBaseline = createDonorStyleBaseline(nativeConnectorProfile, nativeConnectorDonorText);
  assert(nativeConnectorBaseline.ok && !!nativeConnectorBaseline.baseline, "native donor connector baseline is available");
  const nativeConnectorSource = "Тем не менее, автор описал событие.";
  const nativeConnectorPrompt = buildCandidatePrompt({
    sourceText: nativeConnectorSource,
    inventory: buildFactInventory(nativeConnectorSource),
    donorBaseline: nativeConnectorBaseline.baseline!,
    candidateIndex: 0,
    styleIntensity: 5,
    maxDonorExamples: 8,
  });
  assert(
    !nativeConnectorPrompt.includes("ЧУЖДЫЕ ДОНОРУ СВЯЗКИ ИСХОДНИКА"),
    "a connector present in both source and donor must not be listed as foreign",
  );
  names.push("donor-native connectors are not forbidden by source-overlap detection");

  const quotedSource = "Автор связывает это с понятием «лучшей жизни».";
  const quotedPrompt = buildCandidatePrompt({
    sourceText: quotedSource,
    inventory: buildFactInventory(quotedSource),
    donorBaseline: baseline,
    candidateIndex: 0,
    styleIntensity: 5,
    maxDonorExamples: 8,
  });
  assert(
    quotedPrompt.includes("ОБЯЗАТЕЛЬНЫЕ ЯКОРЯ") &&
    !quotedPrompt.includes("НЕ бери в кавычки обычные словосочетания вроде «лучшей жизни»"),
    "mandatory quoted anchors must not be contradicted by generic punctuation guidance",
  );
  names.push("quoted semantic anchors take precedence over generic quotation-frequency guidance");

  let active = 0;
  let maxActive = 0;
  const result = await generateCandidates({
    sourceText,
    inventory,
    donorBaseline: baseline,
    options: { candidateCount: 3, concurrency: 2, styleIntensity: 4 },
    adapter: {
      async generate({ candidateIndex }) {
        active++;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active--;
        if (candidateIndex === 1) throw new Error("simulated provider error");
        return `Кандидат ${candidateIndex + 1}`;
      },
    },
  });
  assert(result.requested === 3 && result.generated === 2 && result.failed === 1,
    "one provider failure does not discard successful candidates");
  names.push("per-candidate failure isolation");

  assert(maxActive <= 2, "generation respects configured concurrency");
  names.push("concurrency limit");

  assert(result.candidates[0].sourceFingerprint === inventory.sourceFingerprint,
    "each candidate is bound to the immutable source fingerprint");
  assert(result.candidates.every((candidate) => candidate.donorBaselineId === baseline.baselineId),
    "every candidate is bound to the same donor baseline");
  names.push("source and donor baseline binding");

  let calls = 0;
  const clamped = await generateCandidates({
    sourceText, inventory, donorBaseline: baseline,
    options: { candidateCount: 99, concurrency: 99 },
    adapter: { async generate() { calls++; return "ok"; } },
  });
  assert(clamped.requested === 5 && calls === 5, "candidate count is clamped to safe maximum");
  names.push("safe generation bounds");

  const invalidInventory = { ...inventory, sourceFingerprint: "wrong" };
  let called = false;
  try {
    await generateCandidates({
      sourceText, inventory: invalidInventory, donorBaseline: baseline,
      adapter: { async generate() { called = true; return "unexpected"; } },
    });
  } catch {
    // Expected: generation must stop before any provider request.
  }
  assert(!called, "invalid source inventory blocks provider calls");
  names.push("source inventory guard");

  const richDonor = analyzeStyleDNA(
    Array.from({ length: 18 }, () =>
      "И тогда автор — вопреки ожиданиям — объяснил причину, поскольку знал цену слова; однако вывод оставался сдержанным."
    ).join("\n\n"),
    { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 },
  );
  const richCreated = createDonorStyleBaseline(richDonor);
  assert(richCreated.ok && !!richCreated.baseline, "rich donor baseline fixture is available");
  const richPrompt = buildCandidatePrompt({
    sourceText,
    inventory,
    donorBaseline: richCreated.baseline!,
    candidateIndex: 0,
    styleIntensity: 5,
    maxDonorExamples: 24,
  });
  assert(richPrompt.includes('"corpusProfile"'), "prompt includes corpusProfile statistics");
  assert(richPrompt.includes('"avoidOveruseTraits"'), "prompt includes absent donor traits warning list");
  assert(
    richPrompt.includes('"punctuation.dash"') && richPrompt.includes('"rhythm.mean-sentence-length"'),
    "prompt retains multi-family corpus-wide features alongside syntax",
  );
  names.push("multi-family Style DNA evidence and corpusProfile transfer");

  const verboseSourceText = Array.from({ length: 6 }, () =>
    "В рамках сложной теоретической парадигмы смысл существования последовательно редуцируется к длинному процессу материального улучшения внешних условий бытия, где каждое отдельное явление выступает естественным следствием физических законов."
  ).join(" ");
  const shortDonorText = Array.from({ length: 18 }, () =>
    "Смысл жизни прост. Человек ищет опору в деле. Во-первых, важна честность. Во-вторых, нужна ясность ума."
  ).join(" ");
  const shortDonorProfile = analyzeStyleDNA(shortDonorText, {
    minWordsForReliableProfile: 80,
    minSentencesForReliableProfile: 10,
  });
  const shortCreated = createDonorStyleBaseline(shortDonorProfile, shortDonorText);
  assert(shortCreated.ok && !!shortCreated.baseline, "short-sentence donor baseline fixture is available");
  const planPrompt = buildCandidatePrompt({
    sourceText: verboseSourceText,
    inventory: buildFactInventory(verboseSourceText),
    donorBaseline: shortCreated.baseline!,
    candidateIndex: 0,
    styleIntensity: 5,
    maxDonorExamples: 12,
  });
  assert(
    planPrompt.includes("ПЛАН ОБЯЗАТЕЛЬНОЙ СИНТАКСИЧЕСКОЙ И СТИЛИСТИЧЕСКОЙ ПЕРЕСТРОЙКИ") &&
    planPrompt.includes("ОБЯЗАТЕЛЬНАЯ ПЕРЕСБОРКА ЧИСЛА И ГРАНИЦ ПРЕДЛОЖЕНИЙ") &&
    planPrompt.includes("не делай соответствие «одно исходное предложение — одно выходное»") &&
    planPrompt.includes("ПРИНЦИП НЕЗАВИСИМОГО СОЗДАНИЯ ТЕКСТА") &&
    planPrompt.includes("КОНТРОЛЬ РЕЗУЛЬТАТА") &&
    planPrompt.includes("ГЛУБОКАЯ ПЕРЕСТРОЙКА БЕЗ МЕХАНИЧЕСКОГО АНТИ-КОПИРОВАНИЯ") &&
    planPrompt.includes("ЗАПРЕТ ИНВЕРСИИ ПРИЧИНЫ И СЛЕДСТВИЯ") &&
    planPrompt.includes("ПУНКТУАЦИОННЫЕ ОРИЕНТИРЫ, НЕ МЕХАНИЧЕСКИЕ КВОТЫ") &&
    planPrompt.includes("ДРОБИ длинные фразы") &&
    planPrompt.includes("не навязывай фиксированное число абзацев") &&
    planPrompt.includes("не исправляй весь текст до нейтральной нормы"),
    "prompt must include Source-vs-Donor rhythm splitting plan, causal-direction lock, punctuation quotas, and strict anti-verbatim ban",
  );
  assert(!planPrompt.includes("не дублируй слова подряд"), "donor-supported repetitions are not categorically banned");
  assert(!planPrompt.includes("обязательно раздели текст на 3–4 логических абзаца"), "paragraph layout is not hard-coded against donor structure");
  names.push("source-vs-donor transformation plan, context-aware donor irregularities and bounded anti-verbatim instructions");

  const relSource = "Дождь усилился, вследствие чего дорогу размыло.";
  const s1End = relSource.indexOf(",");
  const s2Start = relSource.indexOf("дорогу");
  const relBuilt = buildSemanticInventory(relSource, [
    {
      id: "p1",
      summary: "Дождь усилился.",
      sourceSpan: { start: 0, end: s1End, text: relSource.slice(0, s1End) },
      subject: "дождь",
      predicate: "усилился",
      polarity: "positive",
      qualifications: [],
      relations: [{ kind: "effect", from: "p2", to: "p1", expression: "вследствие чего" }],
      mandatory: true,
    },
    {
      id: "p2",
      summary: "Дорогу размыло.",
      sourceSpan: { start: s2Start, end: relSource.length, text: relSource.slice(s2Start) },
      subject: "неуказанный субъект",
      predicate: "размыло",
      object: "дорогу",
      polarity: "positive",
      qualifications: [],
      relations: [{ kind: "effect", from: "p2", to: "p1", expression: "вследствие чего" }],
      mandatory: true,
    },
  ]);
  assert(relBuilt.valid && !!relBuilt.inventory, "relation test inventory must be valid");
  const relPrompt = buildCandidatePrompt({
    sourceText: relSource,
    inventory: relBuilt.inventory!,
    donorBaseline: shortCreated.baseline!,
    candidateIndex: 0,
    styleIntensity: 5,
    maxDonorExamples: 12,
  });
  assert(
    relPrompt.includes("ЛОГИЧЕСКИЕ СВЯЗИ") &&
    !relPrompt.includes('"expression":"вследствие чего"') &&
    relPrompt.includes("пар скобок") &&
    relPrompt.includes("пар кавычек") &&
    relPrompt.includes("ключевые слова не искажай"),
    "prompt must expose logical relations, pair-aware punctuation quotas, and keyword anti-garbling guard",
  );
  assert(
    relPrompt.includes('"subjectTokens":["дождь"]') &&
      relPrompt.includes('"predicateTokens":["усилился"]') &&
      !relPrompt.includes('"subject":"дождь"') &&
      !relPrompt.includes('"predicate":"усилился"') &&
      !relPrompt.includes('"summary":"Дождь усилился."') &&
      !relPrompt.includes('"expression":"вследствие чего"'),
    "generation receives role-tagged lexical atoms and relation types, never source-ordered phrases or connector wording",
  );
  const atomSource = "Смысл человеческого существования неизбежно редуцируется к процессу последовательного и сугубо материального улучшения внешних условий бытия.";
  const atomBuilt = buildSemanticInventory(atomSource, [{
    id: "p1",
    summary: atomSource,
    sourceSpan: { start: 0, end: atomSource.length, text: atomSource },
    subject: "смысл человеческого существования",
    predicate: "неизбежно редуцируется",
    object: "к процессу последовательного и сугубо материального улучшения внешних условий бытия",
    polarity: "positive",
    qualifications: [{ kind: "restriction", value: "В рамках атеистической парадигмы" }],
    relations: [],
    mandatory: true,
  }]);
  assert(atomBuilt.valid && !!atomBuilt.inventory, "multiword semantic-atom fixture is valid");
  const atomPrompt = buildCandidatePrompt({
    sourceText: atomSource,
    inventory: atomBuilt.inventory!,
    donorBaseline: shortCreated.baseline!,
    candidateIndex: 0,
    styleIntensity: 5,
    maxDonorExamples: 12,
  });
  const atomMarker = "ОБЯЗАТЕЛЬНЫЕ УТВЕРЖДЕНИЯ";
  const atomStart = atomPrompt.indexOf("\\n", atomPrompt.indexOf(atomMarker)) + 1;
  const atomEnd = atomPrompt.indexOf("\\n", atomStart);
  const atomPayload = JSON.parse(atomPrompt.slice(atomStart, atomEnd)) as Array<Record<string, unknown>>;
  const firstAtom = atomPayload[0];
  const subjectTokens = firstAtom.subjectTokens as string[];
  const predicateTokens = firstAtom.predicateTokens as string[];
  const objectTokens = firstAtom.objectTokens as string[];
  assert(
    subjectTokens.length === 3 && subjectTokens.join(" ") !== "смысл человеческого существования" &&
      predicateTokens.length === 2 && predicateTokens.join(" ") !== "неизбежно редуцируется" &&
      objectTokens.length > 4 && objectTokens.join(" ") !== "к процессу последовательного и сугубо материального улучшения внешних условий бытия" &&
      !JSON.stringify(firstAtom).includes("В рамках атеистической парадигмы"),
    "multiword source phrases and qualification wording are de-ordered while every lexical atom remains available",
  );
  names.push("source-order-free subject, predicate, object and qualification atoms");

  names.push("logical relations, pair punctuation quotas, and anti-garbling rules");

  return { passed: names.length, names };
}
