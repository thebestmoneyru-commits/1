import { buildFactInventory } from "../semantic/factInventory";
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
  const created = createDonorStyleBaseline(donor);
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
  assert(!prompt.includes("lexical.repeat.") && !prompt.includes("Повторяющееся окончание:"),
    "topic-specific repeated words and exact donor endings are not presented as style instructions");
  assert(prompt.includes("предложение за предложением") && prompt.includes("обратную сверку"),
    "generation prompt explicitly requires source-by-source completeness review");
  const secondPrompt = buildCandidatePrompt({
    sourceText, inventory, donorBaseline: baseline, candidateIndex: 1,
    styleIntensity: 5, maxDonorExamples: 3,
  });
  assert(prompt !== secondPrompt, "candidate indices produce deliberately distinct stylistic approaches");
  names.push("prompt content, semantic constraints and candidate diversity");

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

  const richDonorCorpus = Array.from({ length: 14 }, (_, idx) =>
    `И тогда автор — человек наблюдательный — пояснил детали; впрочем, смысл оставался прежним. ` +
    `Однако позже он добавил: «Истина не меняется со временем», поскольку помнил давний урок (${idx + 1}). ` +
    `Разве можно было сомневаться? Нет!`
  ).join("\n\n");
  const richDonor = analyzeStyleDNA(richDonorCorpus, {
    minWordsForReliableProfile: 100,
    minSentencesForReliableProfile: 10,
    maxEvidencePerFeature: 4,
  });
  const richCreated = createDonorStyleBaseline(richDonor);
  assert(richCreated.ok && !!richCreated.baseline, "rich donor baseline is created");
  const richPrompt = buildCandidatePrompt({
    sourceText,
    inventory,
    donorBaseline: richCreated.baseline!,
    candidateIndex: 0,
    styleIntensity: 5,
    maxDonorExamples: 12,
  });
  const marker = "НАБЛЮДАЕМЫЕ ОСОБЕННОСТИ ДОНОРА (JSON-ДАННЫЕ; примеры показывают только форму):\n";
  const afterMarker = richPrompt.slice(richPrompt.indexOf(marker) + marker.length);
  const jsonEnd = afterMarker.indexOf("\nОриентируйся на все семейства признаков из JSON:");
  assert(jsonEnd > 0, "style JSON block is present and properly delimited");
  const stylePayload = JSON.parse(afterMarker.slice(0, jsonEnd)) as {
    corpusProfile: { meanWordsPerSentence: number; sentenceLengthDistribution: Record<string, unknown> };
    features: Array<{ id: string; family: string; examples: string[] }>;
    avoidOveruseTraits: Array<{ id: string }>;
  };
  const familiesTransferred = new Set(stylePayload.features.map((f) => f.family));
  const totalExamples = stylePayload.features.reduce((sum, f) => sum + f.examples.length, 0);
  const familiesWithExamples = new Set(stylePayload.features.filter((f) => f.examples.length > 0).map((f) => f.family));
  assert(stylePayload.corpusProfile.meanWordsPerSentence > 0 && !!stylePayload.corpusProfile.sentenceLengthDistribution,
    "corpusProfile rhythm and distribution stats are transferred");
  assert(
    familiesTransferred.has("rhythm") &&
    familiesTransferred.has("paragraphs") &&
    familiesTransferred.has("punctuation") &&
    familiesTransferred.has("syntax") &&
    familiesTransferred.has("connectors"),
    "all active portable feature families are transferred even when maxDonorExamples=12",
  );
  assert(totalExamples <= 12 && familiesWithExamples.size >= 4,
    "round-robin allocator respects maxDonorExamples=12 while covering at least 4 feature families with examples");
  assert(stylePayload.avoidOveruseTraits.some((f) => f.id === "punctuation.ellipsis"),
    "unused donor traits appear in avoidOveruseTraits");
  names.push("full multi-family Style DNA transfer and round-robin example distribution");

  return { passed: names.length, names };
}
