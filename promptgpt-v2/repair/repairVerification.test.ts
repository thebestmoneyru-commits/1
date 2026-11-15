import { buildFactInventory } from "../semantic/factInventory";
import { analyzeStyleDNA } from "../style/styleDNAAnalyzer";
import { createDonorStyleBaseline } from "../style/donorBaseline";
import { verifyRepairedCandidate } from "./repairVerification";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Repair verification self-test failed: ${message}`);
}
function corpus(): string {
  return Array.from({ length: 24 }, () =>
    "И тогда автор подробно объяснил обстоятельства, поскольку они имели особенное значение. Однако затем повествование продолжилось."
  ).join("\n\n");
}

export function runRepairVerificationSelfTests(): { passed: number; names: string[] } {
  const names: string[] = [];
  const sourceText = corpus() + " В 1912 году произошло событие.";
  const text = sourceText;
  const donorProfile = analyzeStyleDNA(corpus(), {
    minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10,
  });
  const baselineResult = createDonorStyleBaseline(donorProfile);
  assert(baselineResult.ok && !!baselineResult.baseline, "donor baseline fixture is available");
  const baseline = baselineResult.baseline!;
  const profile = analyzeStyleDNA(text, {
    minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10,
  });
  const report = verifyRepairedCandidate({
    candidateId: "repair-check",
    sourceText, beforeText: text, repairedText: text,
    inventory: buildFactInventory(sourceText),
    beforeAssessments: [], repairedAssessments: [],
    donorBaseline: baseline, beforeProfile: profile, repairedProfile: profile,
  });
  assert(report.passed && report.after.disposition === "accepted",
    "unchanged semantically complete candidate passes post-repair verification");
  assert(report.styleDelta === 0, "unchanged text has no artificial style delta");
  names.push("post-repair semantic and style recheck");

  const wrongProfile = analyzeStyleDNA(text + " Другое предложение.", {
    minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10,
  });
  const fingerprintGuard = (() => {
    try {
      verifyRepairedCandidate({
        candidateId: "wrong-profile",
        sourceText, beforeText: text, repairedText: text,
        inventory: buildFactInventory(sourceText),
        beforeAssessments: [], repairedAssessments: [],
        donorBaseline: baseline, beforeProfile: profile, repairedProfile: wrongProfile,
      });
      return false;
    } catch { return true; }
  })();
  assert(fingerprintGuard, "verification rejects a profile from another text revision");
  names.push("exact repaired-profile binding");

  return { passed: names.length, names };
}
