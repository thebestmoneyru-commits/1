import type {
  AdvancedDiagnosticReport,
  DiagnosticStatus,
  DiagnosticStepItem,
  DiagnosticSummary,
} from './diagnosticsTypes';

export interface BuildAdvancedDiagnosticsInput {
  id?: string;
  createdAt?: string;
  steps?: DiagnosticStepItem[];
  sourceText?: string;
  resultText?: string;
  durationMs?: number;
  stageDurationsMs?: Record<string, number>;
  metrics?: Record<string, number | string | boolean | null>;
  metadata?: Record<string, unknown>;
}

function normalizeStepStatus(raw: unknown): DiagnosticStatus {
  const s = String(raw ?? '').toLowerCase();
  if (s === 'error' || s === 'fail' || s === 'failed') return 'error';
  if (s === 'warn' || s === 'warning') return 'warn';
  if (s === 'skip' || s === 'skipped') return 'skip';
  if (s === 'pending') return 'pending';
  return 'ok';
}

export function summarizeDiagnosticSteps(steps: DiagnosticStepItem[]): DiagnosticSummary {
  let passedSteps = 0;
  let warnSteps = 0;
  let errorSteps = 0;
  let skippedSteps = 0;

  for (const step of steps) {
    const st = normalizeStepStatus(step.status);
    if (st === 'error') errorSteps += 1;
    else if (st === 'warn') warnSteps += 1;
    else if (st === 'skip') skippedSteps += 1;
    else if (st === 'ok') passedSteps += 1;
  }

  let overallStatus: DiagnosticStatus = 'ok';
  if (errorSteps > 0) overallStatus = 'error';
  else if (warnSteps > 0) overallStatus = 'warn';

  return {
    totalSteps: steps.length,
    passedSteps,
    warnSteps,
    errorSteps,
    skippedSteps,
    overallStatus,
  };
}

export function buildAdvancedDiagnostics(
  input: BuildAdvancedDiagnosticsInput = {}
): AdvancedDiagnosticReport {
  const normalizedSteps: DiagnosticStepItem[] = (input.steps ?? []).map((item, idx) => ({
    id: item.id ?? `step-${idx + 1}`,
    name: item.name ?? item.step ?? `Шаг ${idx + 1}`,
    step: item.step ?? item.name ?? `step_${idx + 1}`,
    status: normalizeStepStatus(item.status),
    detail: item.detail ?? item.message ?? '',
    durationMs: item.durationMs,
    metrics: item.metrics,
  }));

  const summary = summarizeDiagnosticSteps(normalizedSteps);

  const computedMetrics: Record<string, number | string | boolean | null> = {
    ...(input.metrics ?? {}),
    sourceChars: input.sourceText ? input.sourceText.length : null,
    resultChars: input.resultText ? input.resultText.length : null,
    totalDurationMs: typeof input.durationMs === 'number' ? input.durationMs : null,
  };

  return {
    id: input.id ?? `diag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: input.createdAt ?? new Date().toISOString(),
    steps: normalizedSteps,
    summary,
    metrics: computedMetrics,
    metadata: {
      ...(input.metadata ?? {}),
      stageDurationsMs: input.stageDurationsMs ?? undefined,
    },
  };
}
