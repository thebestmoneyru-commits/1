/**
 * PROMPTGPT v2 — shared contracts.
 * Runtime-independent contracts shared by semantic, style and evaluation layers.
 */
export type Confidence = number;

export interface TextSpan { start: number; end: number; text: string; }
export interface Evidence { sourceSpan?: TextSpan; outputSpan?: TextSpan; explanation?: string; }

export interface SemanticAnchor {
  id: string;
  kind: "number" | "date" | "proper-name" | "domain-term" | "quotation" | "scripture-reference" | "user-defined";
  value: string;
  required: boolean;
  requiredOccurrences: number;
  evidence: Evidence[];
}
export type Polarity = "positive" | "negative" | "unknown";
export interface Modality {
  kind: "certainty" | "possibility" | "necessity" | "obligation" | "permission" | "desire" | "reported-speech" | "other";
  value: string;
  scope: string;
}
export interface Qualification {
  kind: "condition" | "exception" | "restriction" | "approximation" | "attribution" | "time" | "place" | "degree" | "other";
  value: string;
}
export interface LogicalRelation {
  /** For causal links: cause => from is cause and to is effect; effect => from is effect and to is cause. */
  kind: "cause" | "effect" | "contrast" | "concession" | "condition" | "purpose" | "sequence" | "comparison" | "attribution" | "other";
  from: string;
  to: string;
  expression?: string;
}
export interface Proposition {
  id: string;
  summary: string;
  /** Exact supporting span in the immutable source text. */
  sourceSpan: TextSpan;
  subject: string;
  predicate: string;
  object?: string;
  polarity: Polarity;
  modality?: Modality;
  qualifications: Qualification[];
  relations: LogicalRelation[];
  mandatory: boolean;
}
export interface FactInventory {
  anchors: SemanticAnchor[];
  propositions: Proposition[];
  warnings: string[];
  sourceLength: number;
  /** Deterministic fingerprint of the exact source string used to build this inventory. */
  sourceFingerprint: string;
  inventoryVersion: string;
}
export type PropositionStatus = "preserved" | "changed" | "omitted" | "uncertain";
export interface PropositionAssessment {
  propositionId: string;
  status: PropositionStatus;
  outputEvidence: string[];
  rationale: string;
  confidence: Confidence;
}
export interface AnchorCheck {
  anchorId: string;
  status: "found" | "missing" | "ambiguous";
  matchedText?: string;
  occurrences: number;
}
export interface SemanticIssue {
  code: "MISSING_REQUIRED_ANCHOR" | "AMBIGUOUS_ANCHOR" | "PROPOSITION_NOT_PRESERVED" | "PROPOSITION_UNCERTAIN" | "LOW_CONFIDENCE_ASSESSMENT" | "INVALID_ASSESSMENT" | "SOURCE_INVENTORY_INCOMPLETE" | "LOGICAL_RELATION_NOT_PRESERVED";
  severity: "error" | "warning";
  message: string;
  anchorId?: string;
  propositionId?: string;
}
export interface SemanticReport {
  passed: boolean;
  sourceLength: number;
  outputLength: number;
  anchorChecks: AnchorCheck[];
  propositionAssessments: PropositionAssessment[];
  issues: SemanticIssue[];
  requiredAnchorsFound: number;
  requiredAnchorsTotal: number;
  mandatoryPropositionsPreserved: number;
  mandatoryPropositionsTotal: number;
  verificationVersion: string;
}
export interface SemanticPolicy {
  minimumAssessmentConfidence: number;
  requireEvidenceForPreservedPropositions: boolean;
  rejectAmbiguousRequiredAnchors: boolean;
  requireAllMandatoryPropositions: boolean;
}
export const DEFAULT_SEMANTIC_POLICY: Readonly<SemanticPolicy> = {
  minimumAssessmentConfidence: 0.85,
  requireEvidenceForPreservedPropositions: true,
  rejectAmbiguousRequiredAnchors: true,
  requireAllMandatoryPropositions: true,
};
export interface CandidateEvaluation {
  candidateId: string;
  admissible: boolean;
  semanticReport: SemanticReport;
  rejectionReasons: string[];
}

export interface PropositionExtractionValidation {
  valid: boolean;
  propositions: Proposition[];
  errors: string[];
}
