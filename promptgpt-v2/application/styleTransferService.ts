import { buildAdvancedDiagnostics } from '../style/advancedDiagnostics';
import type { AdvancedDiagnosticReport, DiagnosticStepItem } from '../style/diagnosticsTypes';
import { buildDnaDiagnostics40 } from '../style/dnaDiagnostics40';
import type {
  CandidateOutcome,
  PromptResultHistoryEntry,
  StagePromptRecord,
  StyleTransferResult,
  TransferTraceEvent,
} from './applicationTypes';

export interface RunStyleTransferInput {
  sourceText: string;
  prompt?: string;
  model?: string;
  provider?: string;
  steps?: DiagnosticStepItem[];
  generateCandidate?: (params: {
    sourceText: string;
    prompt: string;
    model?: string;
    attempt: number;
  }) => Promise<CandidateOutcome<string> | string>;
}

export class StyleTransferService {
  async run(input: RunStyleTransferInput): Promise<StyleTransferResult> {
    const startedAt = Date.now();
    const nowIso = new Date(startedAt).toISOString();
    const trace: TransferTraceEvent[] = [];
    const stageRecords: StagePromptRecord[] = [];
    const candidates: CandidateOutcome[] = [];
    const stageDurationsMs: Record<string, number> = {};

    const pushTrace = (
      stage: string,
      status: string,
      message?: string,
      detail?: string,
      durationMs?: number
    ) => {
      trace.push({
        id: `tr_${trace.length + 1}`,
        stage,
        timestamp: new Date().toISOString(),
        elapsedMs: Date.now() - startedAt,
        durationMs,
        model: input.model,
        status,
        message,
        detail,
      });
    };

    const promptText =
      input.prompt && input.prompt.trim().length > 0
        ? input.prompt.trim()
        : 'Перенеси стиль и сохрани смысл исходного текста.';

    // Этап 1: сборка стартового промпта (строка ~258)
    const stage1Start = Date.now();
    pushTrace('prepare_prompt', 'start', 'Подготовка промпта переноса стиля');
    const stage1Record: StagePromptRecord = {
      id: 'stage_prepare_prompt',
      stage: 'prepare_prompt',
      createdAt: new Date(stage1Start).toISOString(),
      prompt: promptText,
      model: input.model,
      attempt: 1,
    };
    stageRecords.push(stage1Record);
    stageDurationsMs.prepare_prompt = Date.now() - stage1Start;
    pushTrace(
      'prepare_prompt',
      'success',
      'Промпт подготовлен',
      undefined,
      stageDurationsMs.prepare_prompt
    );

    // Этап 2: генерация кандидата (строки ~285 и ~318)
    const stage2Start = Date.now();
    pushTrace('generate_candidate', 'start', 'Генерация кандидата');

    let candidateText = input.sourceText;
    let candidateDiagnostics: AdvancedDiagnosticReport | Record<string, unknown> =
      buildAdvancedDiagnostics({
        createdAt: new Date(stage2Start).toISOString(),
        sourceText: input.sourceText,
        resultText: candidateText,
        steps: input.steps,
      });

    if (input.generateCandidate) {
      const rawOutcome = await input.generateCandidate({
        sourceText: input.sourceText,
        prompt: promptText,
        model: input.model,
        attempt: 1,
      });

      if (typeof rawOutcome === 'string') {
        candidateText = rawOutcome;
      } else {
        candidateText = rawOutcome.text ?? rawOutcome.candidate ?? input.sourceText;
        if (rawOutcome.diagnostics) {
          candidateDiagnostics = rawOutcome.diagnostics;
        }
      }
    }

    const genDuration = Date.now() - stage2Start;
    stageDurationsMs.generate_candidate = genDuration;

    const stage2Record: StagePromptRecord = {
      id: 'stage_generate_candidate',
      stage: 'generate_candidate',
      createdAt: new Date(stage2Start).toISOString(),
      prompt: promptText,
      responseText: candidateText,
      model: input.model,
      attempt: 1,
      durationMs: genDuration,
    };
    stageRecords.push(stage2Record);

    const retryStageRecord: StagePromptRecord = {
      id: 'stage_verify_candidate',
      stage: 'verify_candidate',
      createdAt: new Date().toISOString(),
      prompt: promptText,
      responseText: candidateText,
      model: input.model,
      attempt: 1,
    };
    stageRecords.push(retryStageRecord);

    const outcome: CandidateOutcome<string> = {
      ok: true,
      candidate: candidateText,
      text: candidateText,
      model: input.model,
      attempt: 1,
      durationMs: genDuration,
      diagnostics: candidateDiagnostics,
    };
    candidates.push(outcome);
    pushTrace(
      'generate_candidate',
      'success',
      'Кандидат сформирован',
      undefined,
      genDuration
    );

    // Этап 3: финальная диагностика и запись в историю (строка ~801)
    const finalizeStart = Date.now();
    const dna40 = buildDnaDiagnostics40(input.steps ?? []);
    const diagnostics = buildAdvancedDiagnostics({
      createdAt: new Date(finalizeStart).toISOString(),
      sourceText: input.sourceText,
      resultText: candidateText,
      durationMs: Date.now() - startedAt,
      stageDurationsMs,
      steps: input.steps,
      metrics: dna40.diagnostics40,
    });

    const finalizeRecord: StagePromptRecord = {
      id: 'stage_finalize',
      stage: 'finalize',
      createdAt: new Date(finalizeStart).toISOString(),
      prompt: promptText,
      responseText: candidateText,
      model: input.model,
      attempt: 1,
    };
    stageRecords.push(finalizeRecord);

    const totalDurationMs = Date.now() - startedAt;
    stageDurationsMs.finalize = Date.now() - finalizeStart;
    pushTrace('finalize', 'success', 'Этап завершён', undefined, stageDurationsMs.finalize);

    const historyEntry: PromptResultHistoryEntry = {
      id: `hist_${startedAt}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: nowIso,
      prompt: promptText,
      resultText: candidateText,
      sourceText: input.sourceText,
      model: input.model,
      provider: input.provider,
      durationMs: totalDurationMs,
      stageDurationsMs,
      metrics: diagnostics.metrics,
      diagnostics,
    };

    return {
      resultText: candidateText,
      sourceText: input.sourceText,
      durationMs: totalDurationMs,
      stageDurationsMs,
      trace,
      stageRecords,
      candidates,
      diagnostics,
      historyEntry,
    };
  }
}
