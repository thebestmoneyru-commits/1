import type { FactInventory, Proposition, PropositionAssessment, SemanticPolicy } from "../types";
import type { CandidateGenerationOptions, CandidateGenerationResult } from "../style/candidateGenerator";
import type { CandidateEvaluationResult } from "../style/candidateEvaluator";
import type { DonorStyleBaseline, StyleDNAProfile } from "../style/styleTypes";
import type { StyleCriticOptions } from "../critic/styleCritic";
import type { SurgicalRepairOptions } from "../repair/surgicalRepair";
import type { RepairVerificationOptions } from "../repair/repairVerification";

export type TransferStage =
  | "validating-input"
  | "generating-candidates"
  | "evaluating-candidates"
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
  critic?: Partial<StyleCriticOptions>;
  repair?: Partial<SurgicalRepairOptions>;
  verification?: Partial<RepairVerificationOptions>;
  signal?: AbortSignal;
}

export interface CandidateOutcome {
  candidateId: string;
  initial: CandidateEvaluationResult;
  finalText: string;
  finalEvaluation: CandidateEvaluationResult;
  repaired: boolean;
  repairPassed?: boolean;
  warnings: string[];
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

export interface SemanticVerifier {
  assess(input: {
    sourceText: string;
    candidateText: string;
    propositions: readonly Proposition[];
    signal?: AbortSignal;
  }): Promise<PropositionAssessment[]>;
}

export interface ApplicationModelRoutes {
  candidateGeneration: { preferredModel: string; fallbackModels?: readonly string[] };
  styleCritique: { preferredModel: string; fallbackModels?: readonly string[] };
  surgicalRepair: { preferredModel: string; fallbackModels?: readonly string[] };
  semanticVerification: { preferredModel: string; fallbackModels?: readonly string[] };
}
