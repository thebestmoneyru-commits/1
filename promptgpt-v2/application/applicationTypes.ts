import type { FactInventory, Proposition, PropositionAssessment, SemanticPolicy } from "../types";
import type { CandidateGenerationOptions, CandidateGenerationResult } from "../style/candidateGenerator";
import type { CandidateEvaluationResult } from "../style/candidateEvaluator";
import type { DonorStyleBaseline, StyleDNAProfile } from "../style/styleTypes";
import type { StyleCriticOptions } from "../critic/styleCritic";
import type { SurgicalRepairOptions } from "../repair/surgicalRepair";
import type { RepairVerificationOptions } from "../repair/repairVerification";
import type { LogicalRelationAssessment } from "../semantic/logicalRelationPreservation";

export type TransferStage =
  | "validating-input"
  | "generating-candidates"
  | "evaluating-candidates"
  | "semantic-repair"
  | "critic-repair"
  | "completed"
  | "failed"
  | "cancelled";

export interface TransferTraceEvent {
  stage: TransferStage;
  at: number;
  message: string;
  candidateId?: string;
}

export interface StyleTransferRequest {
  requestId: string;
  sourceText: string;
  inventory: FactInventory;
  donorBaseline: DonorStyleBaseline;
  generation?: Partial<CandidateGenerationOptions>;
  semanticPolicy?: SemanticPolicy;
  minimumStyleScore?: number;
  minimumStyleConfidence?: number;
  /** Optional score threshold below which even accepted candidates run StyleCritic + SurgicalRepair polish. */
  criticPolishThreshold?: number;
  critic?: Partial<StyleCriticOptions>;
  repair?: Partial<SurgicalRepairOptions>;
  verification?: Partial<RepairVerificationOptions>;
  signal?: AbortSignal;
}

export interface CandidateDiagnosticStep {
  stage: "candidate-generation" | "semantic-verification" | "logical-structure" | "style-profiling" | "style-scoring" | "semantic-restoration" | "style-critic-repair" | "final-decision";
  status: "completed" | "failed" | "skipped" | "not-completed";
  detail: string;
}

export interface CandidateOutcome {
  candidateId: string;
  initial: CandidateEvaluationResult;
  finalText: string;
  finalEvaluation: CandidateEvaluationResult;
  repaired: boolean;
  repairPassed?: boolean;
  warnings: string[];
  /** Explicit per-candidate record of which pipeline stages ran, passed, failed or were skipped. */
  diagnosticSteps: CandidateDiagnosticStep[];
}

export interface StyleTransferResponse {
  requestId: string;
  status: "accepted" | "needs-review" | "rejected" | "cancelled";
  selectedText?: string;
  selectedCandidateId?: string;
  sourceFingerprint: string;
  donorBaselineId: string;
  generation: CandidateGenerationResult;
  candidates: CandidateOutcome[];
  trace: TransferTraceEvent[];
  warnings: string[];
  error?: { code: string; message: string };
}

export interface StyleProfiler {
  analyze(text: string): StyleDNAProfile;
}

export interface SemanticVerificationBundle {
  propositionAssessments: PropositionAssessment[];
  relationAssessments: LogicalRelationAssessment[];
}

export interface SemanticVerifier {
  /** One provider call returning two separately validated semantic reports when supported. */
  assessCombined?(input: {
    sourceText: string;
    candidateText: string;
    propositions: readonly Proposition[];
    signal?: AbortSignal;
  }): Promise<SemanticVerificationBundle>;
  /** Compatibility fallback for adapters that have not implemented combined verification. */
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

export interface ApplicationModelRoutes {
  candidateGeneration: { preferredModel: string; fallbackModels?: readonly string[] };
  styleCritique: { preferredModel: string; fallbackModels?: readonly string[] };
  surgicalRepair: { preferredModel: string; fallbackModels?: readonly string[] };
  semanticVerification: { preferredModel: string; fallbackModels?: readonly string[] };
  semanticExtraction: { preferredModel: string; fallbackModels?: readonly string[] };
  /** Optional, preferably distinct model route for the independent extraction completeness audit. */
  semanticAudit?: { preferredModel: string; fallbackModels?: readonly string[] };
}
