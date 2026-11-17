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

  return { passed: names.length, names };
}
