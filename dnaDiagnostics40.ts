import type { DiagnosticStepItem } from './diagnosticsTypes';

export interface DnaStepEntry {
  id?: string;
  name?: string;
  step?: string;
  status: string;
  detail: string;
  durationMs?: number;
  weight?: number;
  score?: number;
}

export interface DnaDiagnostics40Summary {
  totalSteps: number;
  weightedScore: number;
  totalWeight: number;
  steps: DnaStepEntry[];
  stepMap: Record<string, DnaStepEntry>;
  diagnostics40: Record<string, number | string | boolean | null>;
}

function toSafeStep(raw: unknown, index: number): DnaStepEntry {
  const obj =
    raw && typeof raw === 'object'
      ? (raw as Record<string, unknown>)
      : ({} as Record<string, unknown>);

  const statusVal =
    typeof obj.status === 'string' && obj.status.trim().length > 0
      ? obj.status.trim()
      : 'ok';

  const detailVal =
    typeof obj.detail === 'string'
      ? obj.detail
      : typeof obj.message === 'string'
        ? obj.message
        : '';

  const stepKey =
    typeof obj.step === 'string' && obj.step.trim().length > 0
      ? obj.step.trim()
      : typeof obj.name === 'string' && obj.name.trim().length > 0
        ? obj.name.trim()
        : typeof obj.id === 'string' && obj.id.trim().length > 0
          ? obj.id.trim()
          : `step_${index + 1}`;

  return {
    id: typeof obj.id === 'string' ? obj.id : `dna_step_${index + 1}`,
    name: typeof obj.name === 'string' ? obj.name : stepKey,
    step: stepKey,
    status: statusVal,
    detail: detailVal,
    durationMs: typeof obj.durationMs === 'number' ? obj.durationMs : undefined,
    weight: typeof obj.weight === 'number' && Number.isFinite(obj.weight) ? obj.weight : 1,
    score: typeof obj.score === 'number' && Number.isFinite(obj.score) ? obj.score : undefined,
  };
}

export function buildDnaDiagnostics40(
  rawSteps: ReadonlyArray<DiagnosticStepItem | Record<string, unknown> | unknown> = [],
  extraMetrics: Record<string, number | string | boolean | null> = {}
): DnaDiagnostics40Summary {
  const steps: DnaStepEntry[] = rawSteps.map((item, idx: number) => toSafeStep(item, idx));

  const stepMap: Record<string, DnaStepEntry> = {};
  for (const s of steps) {
    const key = s.step ?? s.name ?? s.id ?? 'unknown';
    stepMap[key] = s;
  }

  const accInit = { weightedSum: 0, weightSum: 0 };
  const aggregated = steps.reduce(
    (
      acc: { weightedSum: number; weightSum: number },
      s: DnaStepEntry
    ): { weightedSum: number; weightSum: number } => {
      const w: number = typeof s.weight === 'number' && Number.isFinite(s.weight) ? s.weight : 1;
      const baseScore =
        typeof s.score === 'number'
          ? s.score
          : s.status === 'error'
            ? 0
            : s.status === 'warn'
              ? 0.5
              : 1;
      return {
        weightedSum: acc.weightedSum + baseScore * w,
        weightSum: acc.weightSum + w,
      };
    },
    accInit
  );

  const weightedScore =
    aggregated.weightSum > 0
      ? Number((aggregated.weightedSum / aggregated.weightSum).toFixed(4))
      : 1;

  const sampleStep: DnaStepEntry | undefined = stepMap['step_1'] ?? steps[0];
  const sampleStatus = sampleStep ? sampleStep.status : 'none';
  const sampleDetail = sampleStep ? sampleStep.detail : '';

  const diagnostics40: Record<string, number | string | boolean | null> = {
    dna_m01_total_steps: steps.length,
    dna_m02_weighted_score: weightedScore,
    dna_m03_total_weight: aggregated.weightSum,
    dna_m04_sample_status: sampleStatus,
    dna_m05_sample_detail: sampleDetail,
    ...extraMetrics,
  };

  return {
    totalSteps: steps.length,
    weightedScore,
    totalWeight: aggregated.weightSum,
    steps,
    stepMap,
    diagnostics40,
  };
}
