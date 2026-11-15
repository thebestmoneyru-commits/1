import type { FactInventory, PropositionAssessment, Proposition, SemanticPolicy } from "../types";
import { runStyleCritic, type StyleCriticAdapter, type StyleCriticReport, type StyleCriticOptions } from "../critic/styleCritic";
import { repairCandidateSurgically, type SurgicalRepairAdapter, type SurgicalRepairOptions, type SurgicalRepairResult } from "./surgicalRepair";
import { verifyRepairedCandidate, type RepairVerificationOptions, type RepairVerificationReport } from "./repairVerification";
import type { DonorStyleBaseline, StyleDNAProfile } from "../style/styleTypes";

export interface IndependentSemanticVerifier {
  assess(input: {
    sourceText: string;
    candidateText: string;
    propositions: readonly Proposition[];
  }): Promise<PropositionAssessment[]>;
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
  const [criticReport, beforeAssessments, beforeProfile] = await Promise.all([
    runStyleCritic({
      sourceText: input.sourceText,
      candidateText: input.candidateText,
      inventory: input.inventory,
      donorBaseline: input.donorBaseline,
      adapter: input.criticAdapter,
      options: options.critic,
    }),
    input.semanticVerifier.assess({
      sourceText: input.sourceText,
      candidateText: input.candidateText,
      propositions: input.inventory.propositions,
    }),
    input.styleProfiler.analyze(input.candidateText),
  ]);

  const repairResult = await repairCandidateSurgically({
    sourceText: input.sourceText,
    candidateText: input.candidateText,
    inventory: input.inventory,
    criticReport,
    donorBaseline: input.donorBaseline,
    adapter: input.repairAdapter,
    options: options.repair,
  });

  const finalText = repairResult.repairedText;
  const [repairedAssessments, repairedProfile] = await Promise.all([
    input.semanticVerifier.assess({
      sourceText: input.sourceText,
      candidateText: finalText,
      propositions: input.inventory.propositions,
    }),
    input.styleProfiler.analyze(finalText),
  ]);

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

  const warnings = [
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
