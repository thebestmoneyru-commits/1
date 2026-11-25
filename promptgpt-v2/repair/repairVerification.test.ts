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

  const donorProfileWithQuirk = {
    ...donorProfile,
    features: [
      ...donorProfile.features,
      {
        id: "lexical.adjacent-repeat",
        family: "lexical" as const,
        label: "Соседний повтор",
        count: 1,
        denominator: 1,
        rate: 1,
        unit: "share" as const,
        confidence: 1,
        observations: 1,
        evidence: [],
        interpretation: "Подтверждённый повтор в донорском корпусе.",
      },
    ],
  };
  const quirkBaselineResult = createDonorStyleBaseline(donorProfileWithQuirk, corpus());
  assert(quirkBaselineResult.ok && quirkBaselineResult.baseline, "donor baseline with an observed quirk must be valid");
  const quirkReport = verifyRepairedCandidate({
    candidateId: "repair-donor-quirk",
    sourceText,
    beforeText: text,
    repairedText: text,
    inventory: buildFactInventory(sourceText),
    beforeAssessments: [],
    repairedAssessments: [],
    donorBaseline: quirkBaselineResult.baseline,
    beforeProfile: profile,
    repairedProfile: profile,
  });
  assert(
    quirkReport.passed &&
      quirkReport.warnings.some((warning) => warning.includes("Учтены авторские шероховатости")),
    "donor-quirk warning must be evaluated after the passed result is initialized",
  );
  names.push("donor-quirk verification avoids temporal-dead-zone failure");

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

  const spanText = "В 1912 году произошло важное событие";
  const modifiedSource = `${corpus()} ${spanText}.`;
  const beforeRepairedText = modifiedSource;
  const afterRepairedText = `${corpus()} В 1912 году случилось памятное происшествие.`;
  const beforeFactInventory = buildFactInventory(modifiedSource);
  const propInventory = {
    ...beforeFactInventory,
    propositions: [{
      id: "p-repair-1",
      summary: "В 1912 году произошло важное событие.",
      sourceSpan: {
        start: modifiedSource.indexOf(spanText),
        end: modifiedSource.indexOf(spanText) + spanText.length,
        text: spanText,
      },
      subject: "событие",
      predicate: "произошло",
      object: "в 1912 году",
      polarity: "positive" as const,
      qualifications: [],
      relations: [],
      mandatory: true,
    }],
  };
  const beforePropProfile = analyzeStyleDNA(beforeRepairedText, {
    minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10,
  });
  const afterPropProfile = analyzeStyleDNA(afterRepairedText, {
    minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10,
  });

  const staleEvidenceAfterRepair = verifyRepairedCandidate({
    candidateId: "repair-stale-evidence",
    sourceText: modifiedSource,
    beforeText: beforeRepairedText,
    repairedText: afterRepairedText,
    inventory: propInventory,
    beforeAssessments: [{
      propositionId: "p-repair-1",
      status: "preserved",
      outputEvidence: [spanText],
      rationale: "Фраза присутствует до правки.",
      confidence: 0.96,
    }],
    repairedAssessments: [{
      propositionId: "p-repair-1",
      status: "preserved",
      outputEvidence: [spanText],
      rationale: "Устаревшая цитата из текста до правки.",
      confidence: 0.96,
    }],
    donorBaseline: baseline,
    beforeProfile: beforePropProfile,
    repairedProfile: afterPropProfile,
  }, { minimumStyleScore: 0, minimumStyleConfidence: 0 });
  assert(
    !staleEvidenceAfterRepair.passed &&
    !staleEvidenceAfterRepair.after.semanticReport.passed &&
    staleEvidenceAfterRepair.after.disposition === "rejected" &&
    staleEvidenceAfterRepair.after.semanticReport.issues.some((issue) => issue.code === "INVALID_ASSESSMENT"),
    "post-repair verification must reject outputEvidence missing from repairedText",
  );

  const groundedAfterRepair = verifyRepairedCandidate({
    candidateId: "repair-grounded-evidence",
    sourceText: modifiedSource,
    beforeText: beforeRepairedText,
    repairedText: afterRepairedText,
    inventory: propInventory,
    beforeAssessments: [{
      propositionId: "p-repair-1",
      status: "preserved",
      outputEvidence: [spanText],
      rationale: "Фраза присутствует до правки.",
      confidence: 0.96,
    }],
    repairedAssessments: [{
      propositionId: "p-repair-1",
      status: "preserved",
      outputEvidence: ["В 1912 году случилось памятное происшествие"],
      rationale: "Фраза присутствует в исправленном тексте.",
      confidence: 0.96,
    }],
    donorBaseline: baseline,
    beforeProfile: beforePropProfile,
    repairedProfile: afterPropProfile,
  }, { minimumStyleScore: 0, minimumStyleConfidence: 0 });
  assert(
    groundedAfterRepair.passed && groundedAfterRepair.after.semanticReport.passed,
    "post-repair verification must accept outputEvidence grounded in repairedText",
  );
  names.push("post-repair evidence must match repairedText");

  return { passed: names.length, names };
}
