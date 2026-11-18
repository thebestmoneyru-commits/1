import { buildFactInventory } from "../semantic/factInventory";
import { analyzeStyleDNA } from "./styleDNAAnalyzer";
import { createDonorStyleBaseline } from "./donorBaseline";
import { evaluateCandidate } from "./candidateEvaluator";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Candidate evaluator self-test failed: ${message}`);
}
function corpus(): string {
  return Array.from({ length: 20 }, () =>
    "И тогда автор подробно объяснил обстоятельства, поскольку они имели особенное значение. Однако затем повествование продолжилось."
  ).join("\n\n");
}
function profile(text: string) {
  return analyzeStyleDNA(text, { minWordsForReliableProfile: 100, minSentencesForReliableProfile: 10 });
}

export function runCandidateEvaluatorSelfTests(): { passed: number; names: string[] } {
  const names: string[] = [];
  const sourceText = corpus();
  const outputText = sourceText;
  const donorProfile = profile(sourceText);
  const created = createDonorStyleBaseline(donorProfile);
  assert(created.ok && !!created.baseline, "donor baseline fixture is created");
  const baseline = created.baseline!;
  const inventory = buildFactInventory(sourceText);

  const accepted = evaluateCandidate({
    candidateId: "same-text",
    sourceText,
    outputText,
    inventory,
    propositionAssessments: [],
    donorBaseline: baseline,
    candidateProfile: profile(outputText),
  });
  assert(accepted.disposition === "accepted" && accepted.admissible, "semantically preserved matching candidate is admissible");
  names.push("semantic-first successful admission");

  const shortDonorText = "Слишком короткий текст.";
  const shortDonorProfile = analyzeStyleDNA(shortDonorText);
  const shortDonorBaseline = createDonorStyleBaseline(shortDonorProfile, shortDonorText);
  assert(shortDonorBaseline.ok && !!shortDonorBaseline.baseline, "short donor baseline is available");
  const shortDonorEvaluation = evaluateCandidate({
    candidateId: "short-donor", sourceText, outputText, inventory,
    propositionAssessments: [], donorBaseline: shortDonorBaseline.baseline!,
    candidateProfile: profile(outputText),
  });
  assert(shortDonorEvaluation.disposition === "accepted",
    "a short donor may lower style confidence but must not block semantically verified output");
  assert(shortDonorEvaluation.warnings.some((warning) => warning.includes("стилевое сходство") || warning.includes("слишком мал")),
    "short donor acceptance must disclose reduced style confidence");
  names.push("short donor does not block semantically verified output");

  const sourceWithNumber = `В 1912 году. ${sourceText}`;
  const missingNumberOutput = sourceText;
  const semanticFailure = evaluateCandidate({
    candidateId: "lost-number",
    sourceText: sourceWithNumber,
    outputText: missingNumberOutput,
    inventory: buildFactInventory(sourceWithNumber),
    propositionAssessments: [],
    donorBaseline: baseline,
    candidateProfile: profile(missingNumberOutput),
  });
  assert(semanticFailure.disposition === "rejected" && !semanticFailure.admissible,
    "semantic anchor loss rejects a candidate regardless of style score");
  names.push("semantic failure is an absolute gate");

  const shortOutput = "Короткий текст.";
  const review = evaluateCandidate({
    candidateId: "short",
    sourceText: shortOutput,
    outputText: shortOutput,
    inventory: buildFactInventory(shortOutput),
    propositionAssessments: [],
    donorBaseline: baseline,
    candidateProfile: analyzeStyleDNA(shortOutput),
  });
  assert(review.disposition === "needs-review" && !review.admissible,
    "insufficient style evidence requires review instead of a fabricated score");
  names.push("insufficient style evidence requires review");

  const alteredBaseline = {
    ...baseline,
    profile: { ...baseline.profile, confidence: Math.max(0, baseline.profile.confidence - 0.1) },
  };
  const tampered = evaluateCandidate({
    candidateId: "tampered-baseline",
    sourceText,
    outputText,
    inventory,
    propositionAssessments: [],
    donorBaseline: alteredBaseline,
    candidateProfile: profile(outputText),
  });
  assert(tampered.disposition === "rejected", "mutated donor baseline is rejected");
  names.push("baseline integrity is mandatory");

  const wrongProfile = profile(sourceText + " Дополнительное предложение.");
  const fingerprintMismatch = evaluateCandidate({
    candidateId: "wrong-profile",
    sourceText,
    outputText,
    inventory,
    propositionAssessments: [],
    donorBaseline: baseline,
    candidateProfile: wrongProfile,
  });
  assert(fingerprintMismatch.disposition === "rejected", "candidate profile must describe the exact output text");
  names.push("candidate profile text binding");

  const propSpanText = "И тогда автор подробно объяснил обстоятельства";
  const propSource = `${propSpanText}.`;
  const propCandidate = "Рассказчик изложил события в деталях.";
  const propInventory = {
    ...inventory,
    sourceLength: propSource.length,
    sourceFingerprint: buildFactInventory(propSource).sourceFingerprint,
    anchors: [],
    propositions: [{
      id: "p-evidence",
      summary: "Автор объяснил обстоятельства",
      sourceSpan: { start: 0, end: propSpanText.length, text: propSpanText },
      subject: "автор",
      predicate: "объяснил",
      object: "обстоятельства",
      polarity: "positive" as const,
      qualifications: [],
      relations: [],
      mandatory: true,
    }],
  };
  const ungroundedPropEvidence = evaluateCandidate({
    candidateId: "ungrounded-prop-evidence",
    sourceText: propSource,
    outputText: propCandidate,
    inventory: propInventory,
    propositionAssessments: [{
      propositionId: "p-evidence",
      status: "preserved",
      outputEvidence: [propSpanText],
      rationale: "Цитата взята из исходника, а не из кандидата.",
      confidence: 0.96,
    }],
    donorBaseline: baseline,
    candidateProfile: profile(propCandidate),
  });
  assert(ungroundedPropEvidence.disposition === "rejected" && !ungroundedPropEvidence.semanticReport.passed,
    "candidate evaluator must reject proposition evidence missing from outputText");
  names.push("reject ungrounded proposition evidence in candidate gate");

  return { passed: names.length, names };
}
