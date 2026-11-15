import { DEFAULT_SEMANTIC_POLICY, type FactInventory, type PropositionAssessment, type Proposition, type SemanticPolicy } from "../types";
import { runStyleCritic, type StyleCriticAdapter, type StyleCriticReport, type StyleCriticOptions } from "../critic/styleCritic";
import { repairCandidateSurgically, type SurgicalRepairAdapter, type SurgicalRepairOptions, type SurgicalRepairResult } from "./surgicalRepair";
import { verifyRepairedCandidate, type RepairVerificationOptions, type RepairVerificationReport } from "./repairVerification";
import type { DonorStyleBaseline, StyleDNAProfile } from "../style/styleTypes";
import type { LogicalRelationAssessment } from "../semantic/logicalRelationPreservation";
import { validateLogicalRelationAssessments } from "../semantic/logicalRelationPreservation";

export interface IndependentSemanticVerifier {
  assess(input: {
    sourceText: string;
    candidateText: string;
    propositions: readonly Proposition[];
    signal?: AbortSignal;
  }): Promise<PropositionAssessment[]>;
  assessRelations(input: {
    sourceText: string;
    candidateText: string;
    propositions: readonly Proposition[];
    signal?: AbortSignal;
  }): Promise<LogicalRelationAssessment[]>;
}
export interface IndependentStyleProfiler {
  analyze(text: string): Promise<StyleDNAProfile> | StyleDNAProfile;
}
export interface CriticRepairPipelineInput {
  candidateId: string;
  sourceText: string;
  candidateText: string;
  inventory: FactInventory;
  donorBaseline: DonorStyleBaseline;
  criticAdapter: StyleCriticAdapter;
  repairAdapter: SurgicalRepairAdapter;
  semanticVerifier: IndependentSemanticVerifier;
  styleProfiler: IndependentStyleProfiler;
  semanticPolicy?: SemanticPolicy;
  signal?: AbortSignal;
  /** Reuse the service's already completed initial gate to avoid duplicate model calls. */
  initialVerification?: {
    propositionAssessments: PropositionAssessment[];
    relationAssessments: LogicalRelationAssessment[];
    styleProfile: StyleDNAProfile;
  };
}
export interface CriticRepairPipelineOptions {
  critic?: Partial<StyleCriticOptions>;
  repair?: Partial<SurgicalRepairOptions>;
  verification?: Partial<RepairVerificationOptions>;
}
export interface CriticRepairPipelineResult {
  completed: boolean;
  finalText: string;
  criticReport: StyleCriticReport;
  repairResult: SurgicalRepairResult;
  verification: RepairVerificationReport;
  warnings: string[];
}

/**
 * One complete critic -> surgical repair -> independent verification cycle.
 * This function deliberately does not loop or self-approve: callers may start
 * another cycle only after inspecting the complete verification report.
 */
export async function runCriticRepairPipeline(
  input: CriticRepairPipelineInput,
  options: CriticRepairPipelineOptions = {},
): Promise<CriticRepairPipelineResult> {
  const [criticReport, beforeAssessments, beforeRelationAssessments, beforeProfile] = await Promise.all([
    runStyleCritic({
      sourceText: input.sourceText,
      candidateText: input.candidateText,
      inventory: input.inventory,
      donorBaseline: input.donorBaseline,
      adapter: input.criticAdapter,
      options: options.critic,
      signal: input.signal,
    }),
    input.initialVerification
      ? Promise.resolve(input.initialVerification.propositionAssessments)
      : input.semanticVerifier.assess({
          sourceText: input.sourceText,
          candidateText: input.candidateText,
          propositions: input.inventory.propositions,
          signal: input.signal,
        }),
    input.initialVerification
      ? Promise.resolve(input.initialVerification.relationAssessments)
      : input.semanticVerifier.assessRelations({
          sourceText: input.sourceText,
          candidateText: input.candidateText,
          propositions: input.inventory.propositions,
          signal: input.signal,
        }),
    input.initialVerification
      ? Promise.resolve(input.initialVerification.styleProfile)
      : input.styleProfiler.analyze(input.candidateText),
  ]);

  const repairResult = await repairCandidateSurgically({
    sourceText: input.sourceText,
    candidateText: input.candidateText,
    inventory: input.inventory,
    criticReport,
    donorBaseline: input.donorBaseline,
    adapter: input.repairAdapter,
    options: options.repair,
    signal: input.signal,
  });

  const finalText = repairResult.repairedText;
  let repairedAssessments: PropositionAssessment[];
  let repairedRelationAssessments: LogicalRelationAssessment[];
  let repairedProfile: StyleDNAProfile;
  if (finalText === input.candidateText) {
    repairedAssessments = beforeAssessments;
    repairedRelationAssessments = beforeRelationAssessments;
    repairedProfile = beforeProfile;
  } else {
    [repairedAssessments, repairedRelationAssessments, repairedProfile] = await Promise.all([
      input.semanticVerifier.assess({
        sourceText: input.sourceText,
        candidateText: finalText,
        propositions: input.inventory.propositions,
        signal: input.signal,
      }),
      input.semanticVerifier.assessRelations({
        sourceText: input.sourceText,
        candidateText: finalText,
        propositions: input.inventory.propositions,
        signal: input.signal,
      }),
      input.styleProfiler.analyze(finalText),
    ]);
  }

  const verification = verifyRepairedCandidate({
    candidateId: input.candidateId,
    sourceText: input.sourceText,
    beforeText: input.candidateText,
    repairedText: finalText,
    inventory: input.inventory,
    beforeAssessments,
    repairedAssessments,
    donorBaseline: input.donorBaseline,
    beforeProfile,
    repairedProfile,
    semanticPolicy: input.semanticPolicy,
  }, options.verification);

  const beforeStructure = validateLogicalRelationAssessments(
    input.candidateText, input.inventory.propositions, beforeRelationAssessments,
    input.semanticPolicy?.minimumAssessmentConfidence ?? DEFAULT_SEMANTIC_POLICY.minimumAssessmentConfidence,
  );
  const afterStructure = validateLogicalRelationAssessments(
    finalText, input.inventory.propositions, repairedRelationAssessments,
    input.semanticPolicy?.minimumAssessmentConfidence ?? DEFAULT_SEMANTIC_POLICY.minimumAssessmentConfidence,
  );
  if (!afterStructure.passed) {
    verification.after.semanticReport.passed = false;
    verification.after.semanticReport.issues.push({
      code: "LOGICAL_RELATION_NOT_PRESERVED", severity: "error",
      message: afterStructure.issues.join(" "),
    });
    verification.after.disposition = "rejected";
    verification.after.admissible = false;
    verification.after.rejectionReasons.push("После точечной правки логическая структура исходника не сохранена.");
    verification.passed = false;
    verification.rejectionReasons.push("Исправленный текст не сохранил логические связи оригинала.");
  }

  const warnings = [
    ...(!beforeStructure.passed ? ["До исправления обнаружены нарушения логической структуры."] : []),
    ...criticReport.warnings,
    ...repairResult.warnings,
    ...verification.warnings,
  ];
  return {
    completed: verification.passed,
    finalText,
    criticReport,
    repairResult,
    verification,
    warnings: [...new Set(warnings)],
  };
}
