import { analyzeStyleDNA } from "./styleDNAAnalyzer";
import { scoreStyleDNA } from "./styleDNAScorer";
import type { StyleDNAProfile } from "./styleTypes";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Style DNA scorer self-test failed: ${message}`);
}

function corpus(seed: string, repeats: number): string {
  return Array.from({ length: repeats }, (_, index) =>
    `И тогда ${seed} совершил важное дело, поскольку обстоятельства требовали внимательного решения. Однако затем последовало новое событие, и повествование продолжилось. Впрочем, автор подробно объяснил причины произошедшего.`
  ).join("\n\n");
}

function profile(text: string): StyleDNAProfile {
  return analyzeStyleDNA(text, {
    minWordsForReliableProfile: 100,
    minSentencesForReliableProfile: 10,
    maxEvidencePerFeature: 2,
  });
}

/** Lightweight dependency-free regression checks for scorer invariants. */
export function runStyleDNAScorerSelfTests(): { passed: number; names: string[] } {
  const names: string[] = [];
  const donorText = corpus("преподобный подвижник", 20);
  const donor = profile(donorText);
  assert(donor.status === "sufficient", "test donor corpus reaches reliable threshold");
  names.push("sufficient donor fixture");

  const identical = scoreStyleDNA(donor, profile(donorText));
  assert(identical.status === "scored" && identical.score === 100, "identical profile scores 100");
  names.push("identical profile baseline");

  const similar = scoreStyleDNA(donor, profile(corpus("преподобный подвижник", 20)));
  assert(similar.status === "scored" && (similar.score ?? 0) >= 99, "equivalent corpus remains highly similar");
  names.push("stable repeatability");

  const topicSignals = scoreStyleDNA(donor, profile(corpus("совершенно иная тематика", 20)));
  assert(!topicSignals.comparisons.some((item) =>
    item.featureId.startsWith("lexical.repeat.") || item.featureId.startsWith("closings.")),
    "topic-specific repeated words and exact sentence endings must not be scored as portable style");
  names.push("exclude non-portable topic vocabulary and exact closings");

  const short = scoreStyleDNA(donor, analyzeStyleDNA("Короткий текст.", {
    minWordsForReliableProfile: 500, minSentencesForReliableProfile: 25,
  }));
  assert(short.status === "insufficient-candidate" && short.score === null, "short candidate does not receive a misleading numeric score");
  names.push("short-candidate rejection");

  const incompatible: StyleDNAProfile = { ...donor, profileVersion: "future-version" };
  const versionMismatch = scoreStyleDNA(donor, incompatible);
  assert(versionMismatch.status === "incompatible-profiles" && versionMismatch.score === null, "profile versions must match");
  names.push("profile version guard");

  const zeroPunctuationDonor = profile(corpus("тихий рассказ", 20).replace(/[—–]/gu, ""));
  const punctuationCandidate = profile(corpus("тихий рассказ — пояснение", 20));
  const punctuation = scoreStyleDNA(zeroPunctuationDonor, punctuationCandidate);
  assert(punctuation.comparisons.some((item) => item.featureId === "punctuation.dash" && item.candidateValue > item.donorValue),
    "zero-frequency corpus-wide punctuation traits are still compared");
  names.push("zero-frequency punctuation comparison");

  const candidateWithNewOpening = profile(corpus("совершенно новая конструкция", 20));
  const changed = scoreStyleDNA(donor, candidateWithNewOpening);
  assert(changed.status === "scored" && (changed.score ?? 100) < 100, "different repeated openings affect the score");
  names.push("repeated marker deviation");

  const allZero: StyleDNAProfile = { ...donor, features: [] };
  const empty = scoreStyleDNA(allZero, allZero);
  assert(empty.status === "scored" && empty.score === 0 && empty.comparisons.length === 0,
    "empty comparable feature sets do not fabricate a high score");
  names.push("empty feature-set handling");

  const sharedExclamation = identical.comparisons.find((item) => item.featureId === "punctuation.exclamation");
  const overusedDash = punctuation.comparisons.find((item) => item.featureId === "punctuation.dash");
  assert(!!sharedExclamation && sharedExclamation.donorValue === 0 && sharedExclamation.candidateValue === 0 &&
    Math.abs(sharedExclamation.weight - 0.8 * 0.25) < 1e-9,
    "shared zero punctuation features receive discounted 0.25 passive absence weight");
  assert(!!overusedDash && overusedDash.donorValue === 0 && overusedDash.candidateValue > 0 &&
    Math.abs(overusedDash.weight - 0.8) < 1e-9,
    "candidate overuse of an absent donor trait keeps full penalty weight");
  names.push("passive shared-absence weight reduction vs full overuse penalty");

  return { passed: names.length, names };
}
