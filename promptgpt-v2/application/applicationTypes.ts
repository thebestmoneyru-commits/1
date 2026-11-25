import type { FactInventory, Proposition, PropositionAssessment, SemanticPolicy } from "../types";
import type { AdvancedDiagnosticReport } from "../style/diagnosticsTypes";
import type { DnaDiagnostics40Report } from "../style/dnaDiagnostics40";
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
  id?: string;
  timestamp?: string;
  elapsedMs?: number;
  durationMs?: number;
  model?: string;
  status?: string;
  detail?: string;
  metadata?: Record<string, unknown>;
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
  /** Defaults to true in production; false is reserved for controlled internal/test flows. */
  requireStyleTransfer?: boolean;
  /** Optional score threshold below which even accepted candidates run StyleCritic + SurgicalRepair polish. */
  criticPolishThreshold?: number;
  critic?: Partial<StyleCriticOptions>;
  repair?: Partial<SurgicalRepairOptions>;
  verification?: Partial<RepairVerificationOptions>;
  /** Non-blocking warnings collected during request preparation (audits/repairs). */
  preparationWarnings?: readonly string[];
  /** Global 'Режим без фильтрации': disables all semantic interpretation checks and semantic audits so errors in text never stop execution. */
  unfilteredMode?: boolean;
  /** Runs one compact recovery synthesis pass if all initial candidates fail with transient upstream errors. */
  enableCompactRecovery?: boolean;
  signal?: AbortSignal;
}

export interface CandidateDiagnosticStep {
  /** Wall-clock time spent in this stage, measured by the service clock. */
  durationMs?: number;
  stage: "candidate-generation" | "semantic-verification" | "logical-structure" | "style-profiling" | "style-scoring" | "semantic-restoration" | "style-critic-repair" | "final-decision";
  status: "completed" | "failed" | "skipped" | "not-completed";
  detail: string;
}

export interface StagePromptRecord {
  stage: "candidate-generation" | "compact-recovery" | "semantic-restoration";
  candidateId?: string;
  prompt: string;
  createdAt?: number | string;
  durationMs?: number;
  model?: string;
  responseText?: string;
  metadata?: Record<string, unknown>;
}

export interface CandidateOutcome {
  candidateId: string;
  initial: CandidateEvaluationResult;
  finalText: string;
  finalEvaluation: CandidateEvaluationResult;
  repaired: boolean;
  repairPassed?: boolean;
  usedPrompt?: string;
  warnings: string[];
  /** Explicit per-candidate record of which pipeline stages ran, passed, failed or were skipped. */
  diagnosticSteps: CandidateDiagnosticStep[];
  diagnostics?: AdvancedDiagnosticReport | Record<string, unknown>;
}

export interface PromptResultHistoryEntry {
  id: string;
  requestId?: string;
  createdAt: number | string;
  totalDurationMs?: number;
  durationMs?: number;
  status?: string;
  usedModel?: string;
  requestedModel?: string;
  styleScore?: number | null;
  sourceText?: string;
  donorFingerprint?: string;
  resultText?: string;
  prompts?: StagePromptRecord[];
  prompt?: string;
  provider?: string;
  metrics?: Record<string, number | string | boolean | null>;
  diagnostics?: AdvancedDiagnosticReport | Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface StyleTransferResponse {
  requestId: string;
  status: "accepted" | "needs-review" | "rejected" | "cancelled";
  selectedText?: string;
  selectedCandidateId?: string;
  /** Best non-blocked generated output when selectedText is unavailable due to non-fatal warnings or donor-faithful errors. */
  bestAvailableText?: string;
  bestAvailableCandidateId?: string;
  requestedModel?: string;
  usedModel?: string;
  fallbackOccurred?: boolean;
  totalDurationMs?: number;
  usedPrompt?: string;
  stagePrompts?: StagePromptRecord[];
  sourceFingerprint: string;
  donorBaselineId: string;
  generation: CandidateGenerationResult;
  candidates: CandidateOutcome[];
  trace: TransferTraceEvent[];
  warnings: string[];
  error?: { code: string; message: string };
  historyEntry?: PromptResultHistoryEntry;
  /** Non-blocking 40-point Style DNA diagnostics for the selected/best available output. */
  dnaDiagnostics40?: DnaDiagnostics40Report;
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
