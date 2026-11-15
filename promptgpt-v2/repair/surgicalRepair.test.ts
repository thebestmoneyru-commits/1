import { buildFactInventory, fingerprintSource } from "../semantic/factInventory";
import { analyzeStyleDNA } from "../style/styleDNAAnalyzer";
import { createDonorStyleBaseline } from "../style/donorBaseline";
import { repairCandidateSurgically } from "./surgicalRepair";
import type { StyleCriticReport } from "../critic/styleCritic";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Surgical repair self-test failed: ${message}`);
}
function donorText(): string {
  return Array.from({ length: 24 }, () =>
    "И тогда автор подробно объяснил обстоятельства, поскольку они имели особенное значение. Однако затем повествование продолжилось."
  ).join("\n\n");
}

export async function runSurgicalRepairSelfTests(): Promise<{ passed: number; names: string[] }> {
  const names: string[] = [];
  const profile = analyzeStyleDNA(donorText(), {
    minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10,
  });
  const created = createDonorStyleBaseline(profile);
  assert(created.ok && !!created.baseline, "baseline fixture exists");
  const baseline = created.baseline!;
  const sourceText = "В 1912 году автор описал событие.";
  const candidateText = "Автор описал событие в 1912 году.";
  const inventory = buildFactInventory(sourceText);
  const donorFeature = baseline.profile.features.find((item) => item.evidence.length > 0);
  assert(!!donorFeature, "donor evidence fixture exists");
  const donorEvidence = donorFeature!.evidence[0].excerpt;
  const issue = {
    id: "issue-1", type: "syntax-mismatch" as const, severity: "warning" as const,
    outputSpan: { start: 0, end: 6, text: "Автор " },
    donorFeatureId: donorFeature!.id, donorEvidenceExcerpt: donorEvidence,
    rationale: "Требуется точечная перестройка.", suggestedChange: "Изменить только начало.",
    affectedPropositionIds: [],
  };
  const report: StyleCriticReport = {
    criticVersion: "1.0.0", candidateFingerprint: fingerprintSource(candidateText),
    donorBaselineId: baseline.baselineId, styleFidelityScore: 60, naturalnessScore: 90,
    issues: [issue], passed: false, warnings: [],
  };
  const result = await repairCandidateSurgically({
    sourceText, candidateText, inventory, criticReport: report, donorBaseline: baseline,
    adapter: { async repair() {
      return JSON.stringify([{ issueId: "issue-1", expectedText: "Автор ", replacement: "И тогда автор " }]);
    } },
  });
  assert(result.applied && result.patchesApplied === 1, "one authorized patch is applied");
  assert(result.repairedText === "И тогда автор описал событие в 1912 году.", "patch changes only the selected span");
  assert(result.repairedText.includes("1912"), "unrelated numeric anchor remains untouched");
  names.push("exact-span surgical patch");

  const stale = await repairCandidateSurgically({
    sourceText, candidateText, inventory,
    criticReport: { ...report, candidateFingerprint: "stale" }, donorBaseline: baseline,
    adapter: { async repair() { throw new Error("must not call model"); } },
  }).then(() => false).catch(() => true);
  assert(stale, "critic report from a previous candidate revision is rejected");
  names.push("stale critic report rejection");

  const invalidPatch = await repairCandidateSurgically({
    sourceText, candidateText, inventory, criticReport: report, donorBaseline: baseline,
    adapter: { async repair() {
      return JSON.stringify([{ issueId: "issue-1", expectedText: "другой текст", replacement: "новое начало" }]);
    } },
  }).then(() => false).catch(() => true);
  assert(invalidPatch, "patch with a mismatched expected span is rejected");
  names.push("expected-text integrity");

  const fabricatedEvidence = await repairCandidateSurgically({
    sourceText, candidateText, inventory,
    criticReport: {
      ...report,
      issues: [{ ...issue, donorEvidenceExcerpt: "этого нет в корпусе донора" }],
    },
    donorBaseline: baseline,
    adapter: { async repair() { throw new Error("must not call model"); } },
  }).then(() => false).catch(() => true);
  assert(fabricatedEvidence, "repair rejects critic issues with invented donor evidence");
  names.push("donor evidence provenance check");

  const overlappingReport: StyleCriticReport = {
    ...report,
    issues: [
      issue,
      { ...issue, id: "issue-2", outputSpan: { start: 3, end: 10, text: candidateText.slice(3, 10) } },
    ],
  };
  const overlap = await repairCandidateSurgically({
    sourceText, candidateText, inventory, criticReport: overlappingReport, donorBaseline: baseline,
    adapter: { async repair() {
      return JSON.stringify([
        { issueId: "issue-1", expectedText: issue.outputSpan.text, replacement: "Первый" },
        { issueId: "issue-2", expectedText: candidateText.slice(3, 10), replacement: "второй" },
      ]);
    } },
  }).then(() => false).catch(() => true);
  assert(overlap, "overlapping patches are rejected");
  names.push("overlapping patch rejection");

  const validPatches = JSON.stringify([
    { issueId: "issue-1", expectedText: "Автор ", replacement: "И тогда автор " },
  ]);

  const fencedRepair = await repairCandidateSurgically({
    sourceText, candidateText, inventory, criticReport: report, donorBaseline: baseline,
    adapter: { async repair() { return "```json\n" + validPatches + "\n```"; } },
  });
  assert(fencedRepair.applied && fencedRepair.patchesApplied === 1,
    "repair must parse JSON wrapped in markdown fences");

  const bomRepair = await repairCandidateSurgically({
    sourceText, candidateText, inventory, criticReport: report, donorBaseline: baseline,
    adapter: { async repair() { return `\uFEFF${validPatches}`; } },
  });
  assert(bomRepair.applied && bomRepair.patchesApplied === 1,
    "repair must parse JSON prefixed with UTF-8 BOM");

  const malformedRepair = await repairCandidateSurgically({
    sourceText, candidateText, inventory, criticReport: report, donorBaseline: baseline,
    adapter: { async repair() { return "[{broken"; } },
  }).then(() => false).catch(() => true);
  assert(malformedRepair, "repair must reject malformed JSON");

  const emptyRepair = await repairCandidateSurgically({
    sourceText, candidateText, inventory, criticReport: report, donorBaseline: baseline,
    adapter: { async repair() { return ""; } },
  }).then(() => false).catch(() => true);
  assert(emptyRepair, "repair must reject empty model responses");

  const wrongShapeRepair = await repairCandidateSurgically({
    sourceText, candidateText, inventory, criticReport: report, donorBaseline: baseline,
    adapter: { async repair() { return '{"issueId":"issue-1"}'; } },
  }).then(() => false).catch(() => true);
  assert(wrongShapeRepair, "repair must still reject non-array JSON payloads");
  names.push("resilient JSON parsing with strict structural validation");

  return { passed: names.length, names };
}
