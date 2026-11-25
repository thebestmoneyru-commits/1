import type { StyleDNAProfile } from "./styleTypes";
import type { StyleScoreReport } from "./styleDNAScorer";
import type {
  AdvancedDiagnosticReport,
  DiagnosticStatus,
  DiagnosticStepItem,
  DiagnosticSummary,
  StageScoreDelta,
} from "./diagnosticsTypes";

export interface BuildAdvancedDiagnosticsInput {
  id?: string;
  createdAt?: string;
  steps?: ReadonlyArray<DiagnosticStepItem>;
  sourceText?: string;
  finalText?: string;
  resultText?: string;
  candidateProfile?: StyleDNAProfile;
  styleReport?: StyleScoreReport;
  latency?: {
    candidateGenerationMs?: number;
    styleProfilingMs?: number;
    styleScoringMs?: number;
    semanticVerificationMs?: number;
    logicalStructureMs?: number;
    semanticRestorationMs?: number;
    criticRepairMs?: number;
    [key: string]: number | undefined;
  };
  stageDeltas?: ReadonlyArray<StageScoreDelta>;
  durationMs?: number;
  stageDurationsMs?: Record<string, number>;
  metrics?: Record<string, number | string | boolean | null>;
  metadata?: Record<string, unknown>;
}

function normalizeStepStatus(raw: unknown): DiagnosticStatus {
  const value = String(raw ?? "").toLowerCase();
  if (["error", "fail", "failed"].includes(value)) return "error";
  if (["warn", "warning", "not-completed"].includes(value)) return "warn";
  if (["skip", "skipped"].includes(value)) return "skip";
  if (value === "pending") return "pending";
  return "ok";
}

export function summarizeDiagnosticSteps(steps: ReadonlyArray<DiagnosticStepItem>): DiagnosticSummary {
  let passedSteps = 0;
  let warnSteps = 0;
  let errorSteps = 0;
  let skippedSteps = 0;
  for (const step of steps) {
    const status = normalizeStepStatus(step.status);
    if (status === "error") errorSteps++;
    else if (status === "warn") warnSteps++;
    else if (status === "skip") skippedSteps++;
    else if (status === "ok") passedSteps++;
  }
  const overallStatus: DiagnosticStatus =
    errorSteps > 0 ? "error" : warnSteps > 0 ? "warn" : "ok";
  return { totalSteps: steps.length, passedSteps, warnSteps, errorSteps, skippedSteps, overallStatus };
}

export function buildAdvancedDiagnostics(
  input: BuildAdvancedDiagnosticsInput = {},
): AdvancedDiagnosticReport {
  const steps: DiagnosticStepItem[] = (input.steps ?? []).map((step, index) => ({
    id: step.id ?? `step-${index + 1}`,
    name: step.name ?? step.step ?? `Шаг ${index + 1}`,
    step: step.step ?? step.name ?? `step_${index + 1}`,
    status: normalizeStepStatus(step.status),
    detail: step.detail ?? step.message ?? "",
    durationMs: step.durationMs,
    metrics: step.metrics,
  }));
  const summary = summarizeDiagnosticSteps(steps);
  const metrics: Record<string, number | string | boolean | null> = {
    ...(input.metrics ?? {}),
    sourceChars: input.sourceText?.length ?? null,
    resultChars: (input.finalText ?? input.resultText)?.length ?? null,
    totalDurationMs: input.durationMs ?? null,
    styleScore: input.styleReport?.score ?? null,
    styleConfidence: input.styleReport?.confidence ?? null,
    styleStatus: input.styleReport?.status ?? "not-evaluated",
    profileConfidence: input.candidateProfile?.confidence ?? null,
    profileStatus: input.candidateProfile?.status ?? "not-evaluated",
  };
  for (const [key, value] of Object.entries(input.latency ?? {})) {
    metrics[`latency_${key}`] = typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  if (input.candidateProfile?.features) {
    const quirkMap = new Map(
      input.candidateProfile.features
        .filter((f) => f.id === "syntax.punctuation-quirks" || f.id === "lexical.adjacent-repeat" || f.id === "lexical.nearby-repeat")
        .map((f) => [f.id, Number(f.rate.toFixed(3))]),
    );
    metrics.quirkPunctuationShare = quirkMap.get("syntax.punctuation-quirks") ?? 0;
    metrics.adjacentWordRepeatPer1k = quirkMap.get("lexical.adjacent-repeat") ?? 0;
    metrics.nearbyWordRepeatPer1k = quirkMap.get("lexical.nearby-repeat") ?? 0;
  }
  if (input.stageDeltas) {
    metrics.stageDeltaCount = input.stageDeltas.length;
    metrics.stageRepairsApplied = input.stageDeltas.filter((item) => item.repaired).length;
    metrics.stageRepairsPassed = input.stageDeltas.filter((item) => item.repairPassed).length;
  }
  return {
    id: input.id ?? `diag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: input.createdAt ?? new Date().toISOString(),
    steps,
    summary,
    metrics,
    metadata: {
      ...(input.metadata ?? {}),
      stageDurationsMs: input.stageDurationsMs,
      stageDeltas: input.stageDeltas,
    },
  };
}
