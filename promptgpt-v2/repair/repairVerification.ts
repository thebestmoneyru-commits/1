import type { FactInventory, PropositionAssessment, SemanticPolicy } from "../types";
import { fingerprintSource } from "../semantic/factInventory";
import { evaluateCandidate, type CandidateEvaluationResult } from "../style/candidateEvaluator";
import { verifyDonorStyleBaseline } from "../style/donorBaseline";
import type { DonorStyleBaseline, StyleDNAProfile } from "../style/styleTypes";

export interface RepairVerificationInput {
  candidateId: string;
  sourceText: string;
  beforeText: string;
  repairedText: string;
  inventory: FactInventory;
  beforeAssessments: readonly PropositionAssessment[];
  repairedAssessments: readonly PropositionAssessment[];
  donorBaseline: DonorStyleBaseline;
  beforeProfile: StyleDNAProfile;
  repairedProfile: StyleDNAProfile;
  semanticPolicy?: SemanticPolicy;
}
export interface RepairVerificationOptions {
  minimumStyleScore: number;
  minimumStyleConfidence: number;
  allowedStyleRegression: number;
}
export interface RepairVerificationReport {
  passed: boolean;
  before: CandidateEvaluationResult;
  after: CandidateEvaluationResult;
  styleDelta: number | null;
  semanticRestored: boolean;
  rejectionReasons: string[];
  warnings: string[];
}
const DEFAULT_OPTIONS: RepairVerificationOptions = {
  minimumStyleScore: 76,
  minimumStyleConfidence: 0.35,
  allowedStyleRegression: 1,
};

function normalizeOptions(input: Partial<RepairVerificationOptions>): RepairVerificationOptions {
  const bounded = (value: number | undefined, fallback: number, min: number, max: number) =>
    Number.isFinite(value) ? Math.max(min, Math.min(max, value!)) : fallback;
  return {
    minimumStyleScore: bounded(input.minimumStyleScore, DEFAULT_OPTIONS.minimumStyleScore, 0, 100),
    minimumStyleConfidence: bounded(input.minimumStyleConfidence, DEFAULT_OPTIONS.minimumStyleConfidence, 0, 1),
    allowedStyleRegression: bounded(input.allowedStyleRegression, DEFAULT_OPTIONS.allowedStyleRegression, 0, 10),
  };
}

/**
 * A repair is never trusted merely because the patch operation succeeded.
 * The repaired text is re-evaluated against the immutable original source
 * and donor baseline using fresh semantic assessments and a fresh style profile.
 */
export function verifyRepairedCandidate(
  input: RepairVerificationInput,
  suppliedOptions: Partial<RepairVerificationOptions> = {},
): RepairVerificationReport {
  const options = normalizeOptions(suppliedOptions);
  const baseline = verifyDonorStyleBaseline(input.donorBaseline);
  if (!baseline.valid) throw new Error(baseline.reason ?? "Donor baseline integrity check failed.");
  if (input.inventory.sourceLength !== input.sourceText.length ||
      input.inventory.sourceFingerprint !== fingerprintSource(input.sourceText)) {
    throw new Error("Repair verification inventory does not belong to the immutable source.");
  }
  if (input.beforeProfile.sourceFingerprint !== fingerprintSource(input.beforeText)) {
    throw new Error("Pre-repair style profile does not belong to the exact pre-repair text.");
  }
  if (input.repairedProfile.sourceFingerprint !== fingerprintSource(input.repairedText)) {
    throw new Error("Post-repair style profile does not belong to the exact repaired text.");
  }

  const evaluationOptions = {
    minimumStyleScore: options.minimumStyleScore,
    minimumStyleConfidence: options.minimumStyleConfidence,
    semanticPolicy: input.semanticPolicy,
  };
  const before = evaluateCandidate({
    candidateId: `${input.candidateId}:before-repair`,
    sourceText: input.sourceText,
    outputText: input.beforeText,
    inventory: input.inventory,
    propositionAssessments: input.beforeAssessments,
    donorBaseline: input.donorBaseline,
    candidateProfile: input.beforeProfile,
  }, evaluationOptions);
  const after = evaluateCandidate({
    candidateId: `${input.candidateId}:after-repair`,
    sourceText: input.sourceText,
    outputText: input.repairedText,
    inventory: input.inventory,
    propositionAssessments: input.repairedAssessments,
    donorBaseline: input.donorBaseline,
    candidateProfile: input.repairedProfile,
  }, evaluationOptions);

  const beforeScore = before.styleReport.score;
  const afterScore = after.styleReport.score;
  const styleDelta = beforeScore !== null && afterScore !== null ? afterScore - beforeScore : null;
  const rejectionReasons = [...after.rejectionReasons];
  const warnings = [...after.warnings];

  if (after.disposition !== "accepted") {
    rejectionReasons.push("Исправленный текст не прошёл повторный допуск кандидата.");
  }
  if (styleDelta !== null && styleDelta < -options.allowedStyleRegression) {
    rejectionReasons.push(`После исправления стилевое сходство снизилось на ${Math.abs(styleDelta)} пункт(ов), что превышает допустимое снижение ${options.allowedStyleRegression}.`);
  }
  if (styleDelta === null) {
    warnings.push("Сравнение стилевой оценки до и после исправления неполно: один из профилей не дал надёжного числового результата.");
  }

  const passed = after.disposition === "accepted" &&
    after.semanticReport.passed &&
    (styleDelta === null || styleDelta >= -options.allowedStyleRegression);

  return {
    passed,
    before,
    after,
    styleDelta,
    semanticRestored: !before.semanticReport.passed && after.semanticReport.passed,
    rejectionReasons: [...new Set(rejectionReasons)],
    warnings: [...new Set(warnings)],
  };
}
