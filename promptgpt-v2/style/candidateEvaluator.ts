import type {
  FactInventory, PropositionAssessment, SemanticPolicy, SemanticReport,
} from "../types";
import { evaluateSemanticPreservation } from "../semantic/semanticPreservation";
import { fingerprintStyleSource } from "./styleDNAAnalyzer";
import { scoreStyleDNA, type StyleScoreReport } from "./styleDNAScorer";
import { verifyDonorStyleBaseline } from "./donorBaseline";
import type { DonorStyleBaseline, StyleDNAProfile } from "./styleTypes";

export type CandidateDisposition = "accepted" | "rejected" | "needs-review";

export interface CandidateEvaluatorOptions {
  minimumStyleScore: number;
  minimumStyleConfidence: number;
  semanticPolicy?: SemanticPolicy;
}

export interface CandidateEvaluationInput {
  candidateId: string;
  sourceText: string;
  outputText: string;
  inventory: FactInventory;
  propositionAssessments: readonly PropositionAssessment[];
  donorBaseline: DonorStyleBaseline;
  candidateProfile: StyleDNAProfile;
}

export interface CandidateEvaluationResult {
  candidateId: string;
  disposition: CandidateDisposition;
  admissible: boolean;
  donorBaselineId: string;
  semanticReport: SemanticReport;
  styleReport: StyleScoreReport;
  rejectionReasons: string[];
  warnings: string[];
}

const DEFAULT_OPTIONS: CandidateEvaluatorOptions = {
  minimumStyleScore: 72,
  minimumStyleConfidence: 0.35,
};

function normalizeOptions(options: Partial<CandidateEvaluatorOptions>): CandidateEvaluatorOptions {
  return {
    minimumStyleScore: Number.isFinite(options.minimumStyleScore)
      ? Math.max(0, Math.min(100, options.minimumStyleScore!))
      : DEFAULT_OPTIONS.minimumStyleScore,
    minimumStyleConfidence: Number.isFinite(options.minimumStyleConfidence)
      ? Math.max(0, Math.min(1, options.minimumStyleConfidence!))
      : DEFAULT_OPTIONS.minimumStyleConfidence,
    semanticPolicy: options.semanticPolicy,
  };
}

/**
 * Final candidate gate. Semantic preservation is a hard requirement; style
 * similarity is measured only against the frozen original donor baseline.
 * A high style score can never compensate for a semantic failure.
 */
export function evaluateCandidate(
  input: CandidateEvaluationInput,
  suppliedOptions: Partial<CandidateEvaluatorOptions> = {},
): CandidateEvaluationResult {
  const options = normalizeOptions(suppliedOptions);
  const semanticReport = evaluateSemanticPreservation({
    sourceText: input.sourceText,
    outputText: input.outputText,
    inventory: input.inventory,
    propositionAssessments: input.propositionAssessments,
    policy: options.semanticPolicy,
  });
  const baselineIntegrity = verifyDonorStyleBaseline(input.donorBaseline);
  const styleReport = scoreStyleDNA(input.donorBaseline.profile, input.candidateProfile);
  const rejectionReasons: string[] = [];
  const warnings: string[] = [];

  if (!semanticReport.passed) {
    rejectionReasons.push("Кандидат не прошёл обязательную проверку сохранности исходного смысла.");
  }
  if (!baselineIntegrity.valid) {
    rejectionReasons.push(baselineIntegrity.reason ?? "Нарушена целостность донорского baseline.");
  }
  if (input.candidateProfile.sourceFingerprint !== fingerprintStyleSource(input.outputText)) {
    rejectionReasons.push("Стилевой профиль построен не по точному тексту данного кандидата.");
  }
  if (styleReport.status !== "scored" || styleReport.score === null) {
    warnings.push("Невозможно надёжно измерить стилевое сходство кандидата; требуется дополнительная проверка.");
    warnings.push(...styleReport.warnings);
  } else {
    if (styleReport.confidence < options.minimumStyleConfidence) {
      // A low-confidence numeric score is provisional and must not cause an automatic rejection.
      warnings.push(`Уверенность стилевой оценки низкая: ${styleReport.confidence}; числовой балл предварительный и не используется как основание для автоматического отказа.`);
    } else if (styleReport.score < options.minimumStyleScore) {
      rejectionReasons.push(`Стилевое сходство ниже порога: ${styleReport.score} из 100 при минимуме ${options.minimumStyleScore}.`);
    }
    warnings.push(...styleReport.warnings);
  }

  const hardFailure = !semanticReport.passed || !baselineIntegrity.valid ||
    input.candidateProfile.sourceFingerprint !== fingerprintStyleSource(input.outputText) ||
    (styleReport.status === "scored" && styleReport.score !== null &&
      styleReport.confidence >= options.minimumStyleConfidence &&
      styleReport.score < options.minimumStyleScore);

  const donorStyleIsReliable = input.donorBaseline.profile.status === "sufficient";
  const needsReview = styleReport.status === "insufficient-candidate" ||
    styleReport.status === "incompatible-profiles" ||
    (donorStyleIsReliable && (styleReport.status !== "scored" || styleReport.score === null ||
      styleReport.confidence < options.minimumStyleConfidence));

  const disposition: CandidateDisposition = hardFailure
    ? "rejected"
    : needsReview ? "needs-review" : "accepted";

  return {
    candidateId: input.candidateId,
    disposition,
    admissible: disposition === "accepted",
    donorBaselineId: input.donorBaseline.baselineId,
    semanticReport,
    styleReport,
    rejectionReasons,
    warnings,
  };
}
