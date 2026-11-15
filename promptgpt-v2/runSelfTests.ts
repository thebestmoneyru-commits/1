import { runStyleDNAAnalyzerSelfTests } from "./style/styleDNAAnalyzer.test";
import { runStyleDNAScorerSelfTests } from "./style/styleDNAScorer.test";
import { runDonorBaselineSelfTests } from "./style/donorBaseline.test";
import { runCandidateGeneratorSelfTests } from "./style/candidateGenerator.test";
import { runCandidateEvaluatorSelfTests } from "./style/candidateEvaluator.test";
import { runStyleCriticSelfTests } from "./critic/styleCritic.test";
import { runSurgicalRepairSelfTests } from "./repair/surgicalRepair.test";
import { runRepairVerificationSelfTests } from "./repair/repairVerification.test";
import { runCriticRepairPipelineSelfTests } from "./repair/criticRepairPipeline.test";
import { runModelRouterSelfTests } from "./infrastructure/modelRouter.test";
import { runGeminiAdapterSelfTests } from "./infrastructure/geminiAdapter.test";
import { runInfrastructureSelfTests } from "./infrastructure/infrastructure.test";
import { runRemoteEndpointPolicySelfTests } from "./infrastructure/remoteEndpointPolicy.test";
import { runSafeRemoteFetchSelfTests } from "./infrastructure/safeRemoteFetch.test";
import { runApplicationSelfTests } from "./application/modelCatalog.test";
import { runStyleTransferServiceSelfTests } from "./application/styleTransferService.test";
import { runRequestPreparationSelfTests } from "./application/requestPreparation.test";
import { runPropositionCoverageSelfTests } from "./semantic/propositionCoverage.test";
import { runPropositionSchemaSelfTests } from "./semantic/propositionSchema.test";
import { runPropositionConsistencySelfTests } from "./semantic/propositionConsistency.test";
import { runPropositionInterpretationAuditSelfTests } from "./semantic/propositionInterpretationAudit.test";
import { runSemanticStructureAuditSelfTests } from "./semantic/semanticStructureAudit.test";
import { runStyleTransferApiSelfTests } from "./api/styleTransferRouter.test";

export interface SelfTestGroupResult {
  group: string;
  passed: number;
  names: string[];
}
export interface SelfTestSuiteResult {
  passed: number;
  groups: SelfTestGroupResult[];
}

/** Runs every dependency-free v2 regression group sequentially and returns a compact report. */
export async function runV2SelfTestSuite(): Promise<SelfTestSuiteResult> {
  const groups: Array<{ group: string; run: () => Promise<{ passed: number; names: string[] }> | { passed: number; names: string[] } }> = [
    { group: "style-dna-analyzer", run: runStyleDNAAnalyzerSelfTests },
    { group: "style-dna-scorer", run: runStyleDNAScorerSelfTests },
    { group: "donor-baseline", run: runDonorBaselineSelfTests },
    { group: "candidate-generator", run: runCandidateGeneratorSelfTests },
    { group: "candidate-evaluator", run: runCandidateEvaluatorSelfTests },
    { group: "style-critic", run: runStyleCriticSelfTests },
    { group: "surgical-repair", run: runSurgicalRepairSelfTests },
    { group: "repair-verification", run: runRepairVerificationSelfTests },
    { group: "critic-repair-pipeline", run: runCriticRepairPipelineSelfTests },
    { group: "model-router", run: runModelRouterSelfTests },
    { group: "gemini-adapter", run: runGeminiAdapterSelfTests },
    { group: "infrastructure", run: runInfrastructureSelfTests },
    { group: "remote-endpoint-policy", run: runRemoteEndpointPolicySelfTests },
    { group: "safe-remote-fetch", run: runSafeRemoteFetchSelfTests },
    { group: "application-model-catalog", run: runApplicationSelfTests },
    { group: "application-style-transfer-service", run: runStyleTransferServiceSelfTests },
    { group: "application-request-preparation", run: runRequestPreparationSelfTests },
    { group: "semantic-proposition-coverage", run: runPropositionCoverageSelfTests },
    { group: "semantic-proposition-schema", run: runPropositionSchemaSelfTests },
    { group: "semantic-proposition-consistency", run: runPropositionConsistencySelfTests },
    { group: "semantic-proposition-interpretation-audit", run: runPropositionInterpretationAuditSelfTests },
    { group: "semantic-structure-audit", run: runSemanticStructureAuditSelfTests },
    { group: "api-style-transfer-router", run: runStyleTransferApiSelfTests },
  ];
  const results: SelfTestGroupResult[] = [];
  for (const item of groups) {
    const result = await item.run();
    results.push({ group: item.group, passed: result.passed, names: result.names });
  }
  return { passed: results.reduce((sum, group) => sum + group.passed, 0), groups: results };
}
