import { analyzeStyleDNA } from "./styleDNAAnalyzer";
import { createDonorStyleBaseline, verifyDonorStyleBaseline } from "./donorBaseline";
import type { StyleDNAProfile } from "./styleTypes";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Donor baseline self-test failed: ${message}`);
}
function donorText(): string {
  return Array.from({ length: 20 }, () =>
    "И тогда автор подробно объяснил обстоятельства, поскольку они имели особенное значение. Однако затем повествование продолжилось."
  ).join("\n\n");
}

export function runDonorBaselineSelfTests(): { passed: number; names: string[] } {
  const names: string[] = [];
  const profile = analyzeStyleDNA(donorText(), {
    minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10,
  });
  const created = createDonorStyleBaseline(profile);
  assert(created.ok && !!created.baseline, "sufficient donor profile creates a baseline");
  names.push("baseline creation");

  const baseline = created.baseline!;
  assert(verifyDonorStyleBaseline(baseline).valid, "new baseline passes integrity verification");
  names.push("baseline integrity");

  assert(Object.isFrozen(baseline) && Object.isFrozen(baseline.profile) && Object.isFrozen(baseline.profile.features),
    "baseline and nested profile structures are frozen");
  names.push("recursive immutability");

  const tooShort = analyzeStyleDNA("Слишком короткий текст.");
  const rejected = createDonorStyleBaseline(tooShort);
  assert(!rejected.ok && !rejected.baseline, "insufficient donor corpus cannot become baseline");
  names.push("insufficient donor rejection");

  const altered = {
    ...baseline,
    profile: { ...baseline.profile, confidence: Math.max(0, baseline.profile.confidence - 0.1) },
  };
  assert(!verifyDonorStyleBaseline(altered).valid, "altered profile snapshot fails integrity check");
  names.push("mutation detection");

  const duplicateFeature: StyleDNAProfile = {
    ...profile,
    features: [...profile.features, profile.features[0]],
  };
  assert(!createDonorStyleBaseline(duplicateFeature).ok, "duplicate feature IDs are rejected");
  names.push("profile structure validation");

  return { passed: names.length, names };
}
