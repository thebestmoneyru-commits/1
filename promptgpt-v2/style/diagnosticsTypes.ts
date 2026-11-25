export type DiagnosticStatus = "ok" | "warn" | "error" | "skip" | "pending";
export type StageNoGainReason =
  | "none"
  | "not-applied"
  | "semantic-check-failed"
  | "reverification-incomplete"
  | "score-dropped-or-flat";

export interface StageScoreDelta {
  stage: string;
  beforeScore: number | null;
  afterScore: number | null;
  deltaScore: number | null;
  repaired: boolean;
  repairPassed: boolean;
  noGainReason: StageNoGainReason;
}

export interface DiagnosticStepItem {
  id?: string;
  name?: string;
  step?: string;
  status?: DiagnosticStatus | string;
  detail?: string;
  message?: string;
  durationMs?: number;
  metrics?: Record<string, number | string | boolean | null>;
}

export interface DiagnosticSummary {
  totalSteps: number;
  passedSteps: number;
  warnSteps: number;
  errorSteps: number;
  skippedSteps: number;
  overallStatus: DiagnosticStatus;
  notes?: string[];
}

export interface AdvancedDiagnosticReport {
  id: string;
  createdAt: string;
  steps: DiagnosticStepItem[];
  summary: DiagnosticSummary;
  metrics: Record<string, number | string | boolean | null>;
  metadata?: Record<string, unknown>;
}
