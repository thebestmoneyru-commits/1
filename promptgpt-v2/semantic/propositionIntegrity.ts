import type {
  Proposition,
  PropositionAssessment,
  SemanticIssue,
  SemanticPolicy,
} from "../types";
import { DEFAULT_SEMANTIC_POLICY } from "../types";

export interface PropositionVerificationResult {
  assessments: PropositionAssessment[];
  issues: SemanticIssue[];
  preservedMandatory: number;
  totalMandatory: number;
  passed: boolean;
}

/**
 * Validates structured proposition judgments produced by an independent
 * semantic verifier. This function validates the verifier's report; it does
 * not itself infer meaning from natural language.
 *
 * The caller must obtain assessments against the immutable original source,
 * not against the previous candidate in an iterative loop.
 */
export function verifyPropositionAssessments(
  sourcePropositions: readonly Proposition[],
  assessments: readonly PropositionAssessment[],
  policy: SemanticPolicy = DEFAULT_SEMANTIC_POLICY,
): PropositionVerificationResult {
  const issues: SemanticIssue[] = [];
  const byId = new Map<string, PropositionAssessment[]>();

  for (const assessment of assessments) {
    const list = byId.get(assessment.propositionId) ?? [];
    list.push(assessment);
    byId.set(assessment.propositionId, list);
  }

  const normalized: PropositionAssessment[] = [];
  let preservedMandatory = 0;
  const mandatory = sourcePropositions.filter((item) => item.mandatory);

  for (const proposition of sourcePropositions) {
    const matches = byId.get(proposition.id) ?? [];

    if (matches.length !== 1) {
      issues.push({
        code: "INVALID_ASSESSMENT",
        severity: proposition.mandatory ? "error" : "warning",
        propositionId: proposition.id,
        message:
          matches.length === 0
            ? `Для пропозиции ${proposition.id} отсутствует оценка.`
            : `Для пропозиции ${proposition.id} получено несколько оценок.`,
      });
      continue;
    }

    const assessment = matches[0];
    const confidenceIsValid =
      Number.isFinite(assessment.confidence) &&
      assessment.confidence >= 0 &&
      assessment.confidence <= 1;

    if (!confidenceIsValid) {
      issues.push({
        code: "INVALID_ASSESSMENT",
        severity: "error",
        propositionId: proposition.id,
        message: "У оценки пропозиции некорректное значение confidence.",
      });
      continue;
    }

    if (assessment.confidence < policy.minimumAssessmentConfidence) {
      issues.push({
        code: "LOW_CONFIDENCE_ASSESSMENT",
        severity: proposition.mandatory ? "error" : "warning",
        propositionId: proposition.id,
        message: `Недостаточная уверенность проверки пропозиции ${proposition.id}.`,
      });
    }

    if (assessment.status === "preserved") {
      const hasEvidence =
        assessment.outputEvidence.length > 0 &&
        assessment.outputEvidence.some((item) => item.trim().length > 0);

      if (policy.requireEvidenceForPreservedPropositions && !hasEvidence) {
        issues.push({
          code: "INVALID_ASSESSMENT",
          severity: proposition.mandatory ? "error" : "warning",
          propositionId: proposition.id,
          message: `Пропозиция ${proposition.id} признана сохранённой без фрагмента-доказательства.`,
        });
      } else if (
        assessment.confidence >= policy.minimumAssessmentConfidence &&
        (!policy.requireEvidenceForPreservedPropositions || hasEvidence) &&
        proposition.mandatory
      ) {
        preservedMandatory += 1;
      }
    } else {
      issues.push({
        code:
          assessment.status === "uncertain"
            ? "PROPOSITION_UNCERTAIN"
            : "PROPOSITION_NOT_PRESERVED",
        severity: proposition.mandatory ? "error" : "warning",
        propositionId: proposition.id,
        message: `Пропозиция ${proposition.id}: статус ${assessment.status}.`,
      });
    }

    normalized.push(assessment);
  }

  for (const assessment of assessments) {
    if (!sourcePropositions.some((item) => item.id === assessment.propositionId)) {
      issues.push({
        code: "INVALID_ASSESSMENT",
        severity: "warning",
        propositionId: assessment.propositionId,
        message: `Получена оценка неизвестной пропозиции ${assessment.propositionId}.`,
      });
    }
  }

  const passed =
    (!policy.requireAllMandatoryPropositions ||
      preservedMandatory === mandatory.length) &&
    !issues.some((issue) => issue.severity === "error");

  return {
    assessments: normalized,
    issues,
    preservedMandatory,
    totalMandatory: mandatory.length,
    passed,
  };
}
