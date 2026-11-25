export type DiagnosticStatus = 'ok' | 'warn' | 'error' | 'skip' | 'pending';

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
  metrics?: Record<string, number | string | boolean | null>;
  metadata?: Record<string, unknown>;
}
