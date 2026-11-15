/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import dns from 'dns';
import net from 'net';
import { fileURLToPath } from 'url';
import {
  SLOPTOTAL_BANDS,
  SLOPTOTAL_BAND_INFO,
  SLOPTOTAL_ENGINES,
  runSlopTotalAnalysis,
  runSlopTotalQuickScore,
  runSlopTotalParagraphAnalyze,
  detectSiteBuilders,
  extractHtmlFeaturesAndText,
  classifyPageType,
  type SlopAnalysisReport,
} from './shared/sloptotalCore.ts';
import {
  MGT_DETECTORS_CATALOG,
  MGT_ATTACK_CATALOG,
  MGT_SAMPLE_BENCHMARK_DATASET,
  runMgtEvalDetection,
  fitPlatt,
  evaluateMgtBenchmark,
  applySingleMgtAttack,
  evaluateMgtQuality,
  type PlattParams,
  type MgtAttackType,
  type MgtBenchmarkSample,
  type MgtDetectReport,
} from './shared/mgtEvalCore.ts';
import {
  MGTBENCH_METHODS,
  MGTBENCH_DATASETS,
  MGTBENCH_LLMS,
  MGTBENCH_BUILTIN_CORPUS,
  MGTBENCH_TEST_LENGTHS,
  runMgtBenchDetection,
  runMgtBenchAttribution,
  runMgtBenchExperiment,
  type MgtBenchDetectReport,
  type MgtBenchAttributionReport,
  type MgtBenchExperimentReport,
  type MgtBenchSample,
} from './shared/mgtBenchCore.ts';
import {
  DETECTZOO_TEXT_DETECTORS,
  DETECTZOO_MULTIMODAL_DETECTORS,
  DETECTZOO_FULL_ZOO_CATALOG,
  DETECTZOO_DATASETS,
  DETECTZOO_BUILTIN_CORPUS,
  resolveDetectZooDetector,
  resolveDetectZooDataset,
  runDetectZooTextSuite,
  runDetectZooBenchmark,
  type DetectZooSuiteReport,
  type DetectZooBenchmarkReport,
  type DetectZooSample,
} from './shared/detectZooCore.ts';
import {
  EXTENDED_AI_CLICHES,
  type DonorDNAProfile,
  type DonorStyleBlueprint,
  type DiagnosticReport,
  type DetectorShields,
  extractDonorDNAProfile,
  extractDonorForbiddenTerms,
  getGenreArchetypeProfile,
  extractLastSentences,
  buildEnginePromptSections,
  buildDonorBlueprintPrompt,
  buildDeSkeletonPrompt,
  buildSurgicalPatchPrompt,
  buildRefinementPrompt,
  buildStyleCriticPrompt,
  applySentencePatches,
  diagnoseTextDefects,
  deterministicPolish,
  buildFewShotContrastBlock,
  BLUEPRINT_RESPONSE_SCHEMA,
  PROPOSITIONS_RESPONSE_SCHEMA,
  SURGICAL_PATCH_RESPONSE_SCHEMA,
  CRITIC_RESPONSE_SCHEMA,
} from './server/humanizerPipeline.ts';
import {
  computeDonorDetectorBaseline,
  evaluateDetectorFeedback,
  acceptCandidateWithDetectors,
  type DetectorFeedbackReport,
} from './server/detectorFeedback.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Parse CLI arguments (--port, --host) passed by dev supervisor
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const cliPort =
  portIndex !== -1 && args[portIndex + 1]
    ? parseInt(args[portIndex + 1], 10)
    : null;

const hostIndex = args.indexOf('--host');
const cliHost =
  hostIndex !== -1 && args[hostIndex + 1]
    ? args[hostIndex + 1]
    : null;

const distDir = path.resolve(__dirname, 'dist');
const isProductionRuntime =
  process.env.NODE_ENV === 'production' ||
  (process.env.NODE_ENV !== 'development' &&
    fs.existsSync(path.join(distDir, 'index.html')));

// AI Studio dev server must always listen on port 3000 (nginx reverse proxy binds 8080)
const PORT =
  cliPort ||
  (isProductionRuntime && process.env.PORT
    ? parseInt(process.env.PORT, 10)
    : 3000);

const HOST = cliHost || process.env.HOST || '0.0.0.0';

app.use(express.json({ limit: '20mb' }));

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

/* ------------------------------------------------------------------ */
/* HELPERS                                                            */
/* ------------------------------------------------------------------ */

function normalizeModelId(requestedModel: string): string {
  if (
    !requestedModel ||
    requestedModel === 'gemini-3.8-flash' ||
    requestedModel === 'gemini-flash-latest'
  ) {
    return 'gemini-4-hydrogen';
  }

  return requestedModel;
}

function errorStatus(err: any): number {
  const msg = String(err?.message || '');
  const code = Number(err?.status || err?.code || 0);

  if (code === 429 || /RESOURCE_EXHAUSTED|quota|429/i.test(msg)) {
    return 429;
  }

  if (/API key|GEMINI_API_KEY/i.test(msg)) {
    return 401;
  }

  return 500;
}

function sendError(
  res: express.Response,
  err: any,
  fallbackMessage: string
) {
  const status = errorStatus(err);
  let message = err?.message || fallbackMessage;

  if (status === 429) {
    message =
      'Превышена квота Gemini API. Подождите или выберите другую модель. ' +
      message;
  }

  res.status(status).json({ error: message });
}

type ThinkingHint = 'low' | 'medium' | 'high';

interface SamplingConfig {
  temperature?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

function resolveThinkingConfig(
  modelId: string,
  hint: ThinkingHint
): Record<string, any> | undefined {
  // gemini-3.1-flash-lite по умолчанию работает на MINIMAL.
  // MEDIUM/HIGH позволяют модели тщательнее планировать синтаксис.
  if (modelId === 'gemini-3.1-flash-lite') {
    const level =
      hint === 'high'
        ? ThinkingLevel.HIGH
        : hint === 'medium'
          ? ThinkingLevel.MEDIUM
          : ThinkingLevel.LOW;

    return { thinkingLevel: level };
  }

  if (modelId === 'gemini-4-hydrogen' && hint === 'low') {
    return { thinkingLevel: ThinkingLevel.LOW };
  }

  return undefined;
}

async function callModelOnce(params: {
  model: string;
  contents: string;
  systemInstruction: string;
  thinkingHint?: ThinkingHint;
  responseSchema?: any;
  sampling?: SamplingConfig;
}): Promise<string> {
  const {
    model,
    contents,
    systemInstruction,
    thinkingHint = 'medium',
    responseSchema,
    sampling,
  } = params;

  const thinkingConfig = resolveThinkingConfig(model, thinkingHint);

  const baseConfig: Record<string, any> = {
    systemInstruction,
  };

  if (responseSchema) {
    baseConfig.responseMimeType = 'application/json';
    baseConfig.responseSchema = responseSchema;
  }

  if (thinkingConfig) {
    baseConfig.thinkingConfig = thinkingConfig;
  }

  if (sampling) {
    if (typeof sampling.temperature === 'number') {
      baseConfig.temperature = sampling.temperature;
    }
    if (typeof sampling.topP === 'number') {
      baseConfig.topP = sampling.topP;
    }
    if (typeof sampling.topK === 'number') {
      baseConfig.topK = sampling.topK;
    }
    if (typeof sampling.frequencyPenalty === 'number') {
      baseConfig.frequencyPenalty = sampling.frequencyPenalty;
    }
    if (typeof sampling.presencePenalty === 'number') {
      baseConfig.presencePenalty = sampling.presencePenalty;
    }
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: baseConfig,
    });

    return (response.text || '').trim();
  } catch (err: any) {
    const msg = String(err?.message || '');
    const isUnsupportedConfig =
      !isRateLimitError(err) &&
      ((baseConfig.thinkingConfig && /thinking/i.test(msg)) ||
        /frequencyPenalty|presencePenalty|frequency_penalty|presence_penalty|topK|unknown name|INVALID_ARGUMENT|not supported for this model/i.test(
          msg
        ));

    if (isUnsupportedConfig) {
      const retryConfig = { ...baseConfig };
      if (/thinking/i.test(msg)) {
        delete retryConfig.thinkingConfig;
      }
      delete retryConfig.frequencyPenalty;
      delete retryConfig.presencePenalty;
      delete retryConfig.topK;

      const response = await ai.models.generateContent({
        model,
        contents,
        config: retryConfig,
      });

      return (response.text || '').trim();
    }

    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* QUOTA COOLDOWN & HELPER CACHES                                     */
/* ------------------------------------------------------------------ */

const modelCooldownUntil = new Map<string, number>();

function isRateLimitError(err: any): boolean {
  const msg = String(err?.message || '');
  const code = Number(err?.status || err?.code || 0);
  return code === 429 || /RESOURCE_EXHAUSTED|quota|rate[- ]limit|\b429\b/i.test(msg);
}

function parseQuotaCooldownMs(err: any): number {
  const msg = String(err?.message || '');
  const isDaily = /PerDay|GenerateRequestsPerDay|retry in \d+h/i.test(msg);
  const secMatch = msg.match(/"retryDelay"\s*:\s*"(\d+)s"/i);
  if (secMatch) {
    const ms = parseInt(secMatch[1], 10) * 1000;
    return isDaily ? Math.min(ms, 15 * 60 * 1000) : Math.min(Math.max(ms, 15_000), 90_000);
  }
  return isDaily ? 15 * 60 * 1000 : 60_000;
}

function markModelCooldown(modelId: string, err: any): void {
  if (!isRateLimitError(err)) return;
  const cooldownMs = parseQuotaCooldownMs(err);
  modelCooldownUntil.set(modelId, Date.now() + cooldownMs);
}

function isModelOnCooldown(modelId: string): boolean {
  const until = modelCooldownUntil.get(modelId);
  if (!until) return false;
  if (Date.now() >= until) {
    modelCooldownUntil.delete(modelId);
    return false;
  }
  return true;
}

function buildCandidateModelList(preferredModel: string): string[] {
  const normalized = normalizeModelId(preferredModel);
  const baseOrder = Array.from(
    new Set([normalized, 'gemini-3.1-flash-lite', 'gemini-4-hydrogen'])
  );
  const available = baseOrder.filter((m) => !isModelOnCooldown(m));
  // Если все модели на временном кулдауне, всё равно пробуем резервный порядок (начиная с high-quota Flash Lite)
  return available.length > 0 ? available : ['gemini-3.1-flash-lite', normalized];
}

function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 24);
}

function setLru<K, V>(map: Map<K, V>, key: K, val: V, maxSize = 40): void {
  if (map.has(key)) map.delete(key);
  map.set(key, val);
  if (map.size > maxSize) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
}

const blueprintCache = new Map<string, DonorStyleBlueprint>();
const deSkeletonCache = new Map<string, DeSkeletonResult>();

/**
 * Генерация с переходом на резервные модели и авто-охлаждением исчерпанных моделей.
 */
async function generateWithFallback(
  preferredModel: string,
  contents: string,
  systemInstruction: string,
  thinkingHint: ThinkingHint = 'medium',
  sampling?: SamplingConfig
): Promise<{
  text: string;
  usedModel: string;
  fallbackOccurred: boolean;
}> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      'GEMINI_API_KEY не задан на сервере (проверьте .env или секреты проекта).'
    );
  }

  const normalized = normalizeModelId(preferredModel);
  const uniqueModels = buildCandidateModelList(normalized);

  let lastError: any = null;

  for (let i = 0; i < uniqueModels.length; i++) {
    const modelToTry = uniqueModels[i];

    try {
      const text = await callModelOnce({
        model: modelToTry,
        contents,
        systemInstruction,
        thinkingHint,
        sampling,
      });

      if (!text) {
        throw new Error(
          `Модель ${modelToTry} вернула пустой ответ (возможна блокировка по safety-фильтру).`
        );
      }

      return {
        text,
        usedModel: modelToTry,
        fallbackOccurred: modelToTry !== normalized,
      };
    } catch (err: any) {
      lastError = err;

      if (isRateLimitError(err)) {
        markModelCooldown(modelToTry, err);
        console.log(
          `[Gemini Quota] ${modelToTry} исчерпала лимит — автопереключение на резерв.`
        );
      } else {
        console.log(
          `[Gemini Fallback] ${modelToTry}: ${String(err?.message || err).slice(0, 180)}`
        );
      }

      if (
        /API key not valid|API_KEY_INVALID|GEMINI_API_KEY/i.test(
          String(err?.message || '')
        )
      ) {
        break;
      }
    }
  }

  throw lastError || new Error('Не удалось сгенерировать ответ через Gemini API');
}

/**
 * Безопасная генерация JSON.
 * При ошибке или некорректном JSON возвращает null.
 */
async function generateJsonSafe<T>(
  preferredModel: string,
  contents: string,
  systemInstruction: string,
  responseSchema: any,
  thinkingHint: ThinkingHint = 'low',
  sampling?: SamplingConfig
): Promise<T | null> {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }

  const models = buildCandidateModelList(preferredModel);

  for (const model of models) {
    try {
      const raw = await callModelOnce({
        model,
        contents,
        systemInstruction,
        thinkingHint,
        responseSchema,
        sampling,
      });

      if (!raw) {
        continue;
      }

      const cleaned = raw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      return JSON.parse(cleaned) as T;
    } catch (err: any) {
      if (isRateLimitError(err)) {
        markModelCooldown(model, err);
        console.log(`[Gemini JSON Quota] ${model} на паузе — переключение.`);
      } else {
        console.log(
          `[Gemini JSON Fallback] ${model}: ${String(err?.message || err).slice(0, 160)}`
        );
      }

      if (
        /API key not valid|API_KEY_INVALID|GEMINI_API_KEY/i.test(
          String(err?.message || '')
        )
      ) {
        break;
      }
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* FACT PRESERVATION                                                  */
/* ------------------------------------------------------------------ */

/**
 * Приводит список утраченных фактов к сопоставимому виду.
 *
 * Используется для проверки не только количества потерь,
 * но и конкретных элементов списка.
 */
function getCriticalFactKeys(diag: DiagnosticReport): Set<string> {
  const lostCritical = diag?.factsReport?.lostCritical;

  if (!Array.isArray(lostCritical)) {
    return new Set();
  }

  return new Set(
    lostCritical.map((fact: any) => {
      if (typeof fact === 'string') {
        return fact.trim().toLowerCase();
      }

      try {
        return JSON.stringify(fact);
      } catch {
        return String(fact);
      }
    })
  );
}

/**
 * Проверяет, что новый текст не потерял ни одного факта,
 * который уже присутствовал в предыдущем результате.
 *
 * Новые потери запрещены даже тогда, когда общее количество
 * утраченных фактов осталось прежним.
 */
function factsDoNotRegress(
  prevDiag: DiagnosticReport,
  nextDiag: DiagnosticReport
): boolean {
  const prevFacts = getCriticalFactKeys(prevDiag);
  const nextFacts = getCriticalFactKeys(nextDiag);

  for (const fact of nextFacts) {
    if (!prevFacts.has(fact)) {
      return false;
    }
  }

  return true;
}

/* ------------------------------------------------------------------ */
/* TYPES                                                              */
/* ------------------------------------------------------------------ */

interface DeSkeletonResult {
  paragraphs: Array<{
    theme: string;
    propositions: string[];
  }>;
  mandatoryEntities: string[];
}

interface CriticResult {
  styleFidelityScore: number;
  humanNaturalnessScore: number;
  factCompletenessScore: number;
  passed: boolean;
  actionableDirectives: string[];
  suspiciousSentenceIds: number[];
}

interface GenericConvergenceResult {
  finalText: string;
  diagBefore: DiagnosticReport;
  diagAfter: DiagnosticReport;
  detectorAiBefore: number;
  detectorAiAfter: number;
  passes: number;
  usedModel: string;
  fallbackOccurred: boolean;
}

/* ------------------------------------------------------------------ */
/* PROMPT HELPERS                                                     */
/* ------------------------------------------------------------------ */

function formatPropositionsInput(
  deSkeleton: DeSkeletonResult,
  rawFallbackText2: string,
  donorProfile: DonorDNAProfile
): string {
  const blocks = deSkeleton.paragraphs
    .map(
      (paragraph, index) =>
        `Блок ${index + 1} (${paragraph.theme}):\n${paragraph.propositions
          .map((prop) => `- ${prop}`)
          .join('\n')}`
    )
    .join('\n\n');

  const entities =
    deSkeleton.mandatoryEntities.length > 0
      ? `\nОБЯЗАТЕЛЬНЫЕ ИМЕНА, ДАТЫ И ТЕРМИНЫ (включить 100%): ${deSkeleton.mandatoryEntities.join(', ')}`
      : '';

  return `АТОМАРНЫЕ ТЕЗИСЫ И ФАКТЫ ДЛЯ НАПИСАНИЯ (ОЧИЩЕНО ОТ ИИ-КАРКАСА ТЕКСТА 2):
${blocks}
${entities}

=========================
ДЛЯ КОНТРОЛЯ ТОЧНОСТИ (ИСХОДНЫЙ ТЕКСТ 2 — проверяй факты, но НЕ копируй его синтаксис):
${rawFallbackText2}

=========================

ЗАДАНИЕ:
Собери из этих фактов цельный живой текст в абсолютном голосе, ритме (${donorProfile.avgSentPerPara} предл./абз., Burstiness ~${donorProfile.burstiness}) и синтаксисе Автора-Донора.

Выведи ТОЛЬКО готовый текст без заголовков, комментариев и кавычек.`;
}

function inferGenreFromInput(text: string, hint: string): 'academic' | 'essay' | 'draft' {
  const combined = `${hint}\n${text.slice(0, 1200)}`.toLowerCase();
  if (/диссертац|монограф|научн|методолог|гипотез|таблиц|выборк|эксперимент|исследован|академич|статья/i.test(combined)) {
    return 'academic';
  }
  if (/эссе|публицист|очерк|живой|истори|философ|размышлен|колонка/i.test(combined)) {
    return 'essay';
  }
  return 'draft';
}

/**
 * Скользящий поабзацный перенос длинных текстов (2200+ знаков, >= 4 смысловых блока):
 * переносит блоками по 2 абзаца с передачей последних 2 предложений предыдущего блока
 * для сохранения ритмической и смысловой преемственности без «усталости» на длинном хвосте.
 */
async function generateChunkedStyleTransfer(params: {
  deSkeleton: DeSkeletonResult;
  donorProfile: DonorDNAProfile;
  systemInstruction: string;
  model: string;
}): Promise<{ text: string; usedModel: string; fallbackOccurred: boolean }> {
  const { deSkeleton, donorProfile, systemInstruction, model } = params;
  const chunks: Array<DeSkeletonResult['paragraphs']> = [];
  for (let i = 0; i < deSkeleton.paragraphs.length; i += 2) {
    chunks.push(deSkeleton.paragraphs.slice(i, i + 2));
  }

  const generatedParts: string[] = [];
  let usedModel = model;
  let fallbackOccurred = false;

  for (let idx = 0; idx < chunks.length; idx++) {
    const chunkParas = chunks[idx];
    const blocksText = chunkParas
      .map(
        (p, pIdx) =>
          `Блок ${idx * 2 + pIdx + 1} (${p.theme}):\n${p.propositions
            .map((prop) => `- ${prop}`)
            .join('\n')}`
      )
      .join('\n\n');

    const bridgeText =
      idx > 0 && generatedParts.length > 0
        ? `\n\nПРЕДЫДУЩИЙ ФРАГМЕНТ (только для точного ритмического стыка — НЕ повторяй эти фразы):\n«${extractLastSentences(generatedParts[generatedParts.length - 1], 2)}»`
        : '';

    const chunkPrompt = `ЧАСТЬ ${idx + 1} ИЗ ${chunks.length} (ПОСЛЕДОВАТЕЛЬНЫЙ ПЕРЕНОС ПО ДОНОРУ):
${blocksText}

КЛЮЧЕВЫЕ ИМЕНА И ТЕРМИНЫ ТЕКСТА 2 (сохранить те, что относятся к этим блокам): ${deSkeleton.mandatoryEntities.join(', ') || 'по смыслу блоков'}${bridgeText}

ОРИЕНТИР РИТМА ДОНОРА: ${donorProfile.avgSentPerPara} предл./абз., средняя длина фразы ${donorProfile.avgLen} слов, тип финала абзаца: ${donorProfile.paragraphClosingStyle}.
Напиши ТОЛЬКО эту часть (${chunkParas.length} абз.) чистым текстом без заголовков и комментариев.`;

    const res = await generateWithFallback(
      usedModel,
      chunkPrompt,
      systemInstruction,
      idx === 0 ? 'high' : 'medium',
      { temperature: 0.96, topP: 0.95, frequencyPenalty: 0.3, presencePenalty: 0.2 }
    );

    usedModel = res.usedModel;
    fallbackOccurred = fallbackOccurred || res.fallbackOccurred;
    generatedParts.push(deterministicPolish(res.text, donorProfile));
  }

  return {
    text: deterministicPolish(generatedParts.join('\n\n'), donorProfile),
    usedModel,
    fallbackOccurred,
  };
}

/* ------------------------------------------------------------------ */
/* GENERIC CONVERGENCE LOOP                                           */
/* ------------------------------------------------------------------ */

/**
 * Универсальный многопроходный цикл для вкладок:
 * Humanizer / Draft / Academic.
 *
 * Можно передать уже рассчитанную диагностику, чтобы не выполнять
 * повторный анализ того же самого текста.
 */
async function runGenericConvergenceLoop(params: {
  initialText: string;
  sourceText: string;
  model: string;
  maxCycles: number;
  initialDiagnostic?: DiagnosticReport;
  shields?: DetectorShields;
}): Promise<GenericConvergenceResult> {
  const {
    initialText,
    sourceText,
    model,
    maxCycles,
    initialDiagnostic,
    shields,
  } = params;

  let currentText = deterministicPolish(initialText);

  let currentDiag =
    initialDiagnostic ||
    diagnoseTextDefects(currentText, undefined, sourceText);

  let currentDetector = evaluateDetectorFeedback(currentText, shields);

  const diagBefore = currentDiag;
  const detectorAiBefore = currentDetector.compositeAiPct;

  let currentModel = model;
  let fallbackOccurred = false;

  let passes = 1;
  let stalled = 0;

  for (let cycle = 1; cycle <= maxCycles; cycle++) {
    // Если качество и детекторный профиль уже отличные, дополнительные запросы не нужны.
    if (
      !currentDiag.needsRefinement &&
      currentDiag.overallScore >= 94 &&
      currentDetector.compositeAiPct <= 28
    ) {
      break;
    }

    // Две неудачные попытки подряд означают, что дальнейшие запросы
    // с высокой вероятностью не дадут полезного улучшения.
    if (stalled >= 2) {
      break;
    }

    try {
      const hasGlobalIssue = currentDiag.issues.some(
        (issue) =>
          issue.type === 'burstiness' ||
          issue.type === 'donorLengthDrift' ||
          issue.type === 'factLoss' ||
          issue.type === 'ttr' ||
          issue.type === 'donorMarkers' ||
          issue.type === 'nominalizationOverload' ||
          issue.type === 'negationShift'
      );

      const combinedLocalIds = Array.from(
        new Set([
          ...currentDiag.issues.flatMap((i) => i.sentenceIndexes),
          ...currentDetector.suspiciousSentenceIds,
        ])
      ).filter((id) => id > 0);

      const hasOnlyLocal =
        combinedLocalIds.length > 0 &&
        !hasGlobalIssue &&
        currentDiag.issues.every((issue) => issue.sentenceIndexes.length > 0);

      let candidateRaw = '';

      // Хирургическая правка используется при локальных дефектах или точечных сигналах детекторов.
      if (hasOnlyLocal && stalled === 0) {
        const patchPrompt = buildSurgicalPatchPrompt(
          currentText,
          currentDiag,
          undefined,
          null,
          currentDetector.detectorDirectives
        );

        const patchRes = await generateJsonSafe<{
          patches: Array<{
            sentenceId: number;
            rewritten: string;
          }>;
        }>(
          'gemini-3.1-flash-lite',
          patchPrompt.contents,
          patchPrompt.systemInstruction,
          SURGICAL_PATCH_RESPONSE_SCHEMA,
          'medium',
          { temperature: 0.4, topP: 0.9 }
        );

        if (patchRes?.patches?.length) {
          candidateRaw = applySentencePatches(
            currentText,
            patchRes.patches
          );
        }
      }

      // Если локальная правка не дала результата или проблема глобальная,
      // используем общий refinement с обратной связью от детекторов.
      if (!candidateRaw) {
        const refine = buildRefinementPrompt(
          currentText,
          currentDiag,
          undefined,
          null,
          currentDetector.detectorDirectives,
          sourceText
        );

        const passRes = await generateWithFallback(
          currentModel,
          refine.contents,
          refine.systemInstruction,
          'high',
          { temperature: 0.86, topP: 0.94, frequencyPenalty: 0.25 }
        );

        candidateRaw = passRes.text;

        currentModel = passRes.usedModel;
        fallbackOccurred =
          fallbackOccurred || passRes.fallbackOccurred;
      }

      const candidate = deterministicPolish(candidateRaw);

      const candidateDiag = diagnoseTextDefects(
        candidate,
        undefined,
        sourceText
      );
      const candidateDetector = evaluateDetectorFeedback(candidate, shields);

      if (
        acceptCandidateWithDetectors({
          prevText: currentText,
          prevDiag: currentDiag,
          prevDetector: currentDetector,
          nextText: candidate,
          nextDiag: candidateDiag,
          nextDetector: candidateDetector,
          hasDonorBaseline: false,
        })
      ) {
        currentText = candidate;
        currentDiag = candidateDiag;
        currentDetector = candidateDetector;

        passes++;
        stalled = 0;
      } else {
        stalled++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(
        `[Convergence Loop cycle ${cycle}] stopped cleanly: ${msg.slice(0, 180)}`
      );

      break;
    }
  }

  return {
    finalText: currentText,
    diagBefore,
    diagAfter: currentDiag,
    detectorAiBefore,
    detectorAiAfter: currentDetector.compositeAiPct,
    passes,
    usedModel: currentModel,
    fallbackOccurred,
  };
}

/* ------------------------------------------------------------------ */
/* 1. STYLE DNA TRANSFER                                              */
/* ------------------------------------------------------------------ */

app.post('/api/style-dna-transfer', async (req, res) => {
  try {
    const {
      text1,
      text2,
      flags = {},
      shields = {},
      enable20CycleCheck,
      model = 'gemini-3.1-flash-lite',
    } = req.body;

    if (
      typeof text1 !== 'string' ||
      typeof text2 !== 'string' ||
      !text1.trim() ||
      !text2.trim()
    ) {
      return res.status(400).json({
        error: 'Текст 1 и Текст 2 обязательны',
      });
    }

    const runDeepConvergence: boolean =
      enable20CycleCheck ?? !!flags.twentyCycles;

    const normalizedModel = normalizeModelId(model);

    const donorProfile = extractDonorDNAProfile(text1);
    const donorDetectorBaseline = computeDonorDetectorBaseline(text1, shields);

    /* -------------------------------------------------------------- */
    /* ЭТАП 1. ЧЕРТЁЖ ДОНОРА И ДЕ-СКЕЛЕТИЗАЦИЯ (С КЭШЕМ + FLASH LITE)*/
    /* -------------------------------------------------------------- */

    let styleBlueprint: DonorStyleBlueprint | null = null;
    let deSkeleton: DeSkeletonResult | null = null;

    if (runDeepConvergence) {
      const t1Hash = hashText(text1.trim());
      const t2Hash = hashText(text2.trim());

      const cachedBp = blueprintCache.get(t1Hash) || null;
      const cachedDs = deSkeletonCache.get(t2Hash) || null;

      // Вспомогательные JSON-этапы всегда пускаем через высококвотную Flash Lite,
      // чтобы не сжигать дневной лимит gemini-4-hydrogen (20 req/day на Free Tier).
      const helperModel = 'gemini-3.1-flash-lite';

      const [bpRes, dsRes] = await Promise.all([
        cachedBp
          ? Promise.resolve(cachedBp)
          : (() => {
              const bpPrompt = buildDonorBlueprintPrompt(text1);
              return generateJsonSafe<DonorStyleBlueprint>(
                helperModel,
                bpPrompt.contents,
                bpPrompt.systemInstruction,
                BLUEPRINT_RESPONSE_SCHEMA,
                'medium',
                { temperature: 0.35, topP: 0.9 }
              );
            })(),

        cachedDs
          ? Promise.resolve(cachedDs)
          : text2.trim().length >= 180
          ? (() => {
              const dsPrompt = buildDeSkeletonPrompt(text2);
              return generateJsonSafe<DeSkeletonResult>(
                helperModel,
                dsPrompt.contents,
                dsPrompt.systemInstruction,
                PROPOSITIONS_RESPONSE_SCHEMA,
                'medium',
                { temperature: 0.3, topP: 0.9 }
              );
            })()
          : Promise.resolve(null),
      ]);

      if (bpRes) {
        styleBlueprint = bpRes;
        if (!cachedBp) setLru(blueprintCache, t1Hash, bpRes);
      }

      if (dsRes && dsRes.paragraphs?.length > 0) {
        deSkeleton = dsRes;
        if (!cachedDs) setLru(deSkeletonCache, t2Hash, dsRes);
      }
    }

    /* -------------------------------------------------------------- */
    /* СИСТЕМНЫЙ РЕГЛАМЕНТ И АНТИ-УТЕЧКА ДОНОРА                       */
    /* -------------------------------------------------------------- */

    const forbiddenDonorTerms = extractDonorForbiddenTerms(text1, text2);

    const promptSections = buildEnginePromptSections({
      flags,
      shields,
      enable20CycleCheck: runDeepConvergence,
      donorProfile,
      styleBlueprint,
      forbiddenDonorTerms,
      mode: 'style-dna',
    });

    const systemInstruction = promptSections.join('\n\n');

    const directContents = `ТЕКСТ 1 (ОБРАЗЕЦ СТИЛЯ — ДОНОР, КОПИРУЙ ТОЛЬКО СИНТАКСИС И ГОЛОС):
${text1}

=========================

ТЕКСТ 2 (МАТЕРИАЛ ДЛЯ ПЕРЕРАБОТКИ — СОХРАНИ 100% ФАКТОВ):
${text2}

=========================

Выведи ТОЛЬКО готовый результирующий текст без вступительных реплик, без кавычек и без послесловий.`;

    /* -------------------------------------------------------------- */
    /* ЭТАП 2. ГЕНЕРАЦИЯ КАНДИДАТОВ (MULTI-TEMP SAMPLING)             */
    /* -------------------------------------------------------------- */

    let bestText = '';
    let bestDiag: DiagnosticReport | null = null;
    let bestDet: DetectorFeedbackReport | null = null;
    let chunkedTransfer = false;

    let usedModel = normalizedModel;
    let fallbackOccurred = false;

    const preferHighQuotaDual =
      !isModelOnCooldown('gemini-3.1-flash-lite') &&
      (normalizedModel === 'gemini-3.1-flash-lite' || isModelOnCooldown(normalizedModel));

    const shouldUseChunkedCandidate = Boolean(
      runDeepConvergence &&
        deSkeleton &&
        deSkeleton.paragraphs.length >= 4 &&
        text2.trim().length >= 2200
    );

    if (runDeepConvergence && deSkeleton && preferHighQuotaDual) {
      const propContents = formatPropositionsInput(
        deSkeleton,
        text2,
        donorProfile
      );

      const candidatePromises: Array<
        Promise<{
          text: string;
          usedModel: string;
          fallbackOccurred: boolean;
          isChunked?: boolean;
        }>
      > = [
        // Кандидат A: де-скелет + сбалансированная живость (T=0.92)
        generateWithFallback(
          normalizedModel,
          propContents,
          systemInstruction,
          'high',
          { temperature: 0.92, topP: 0.95, frequencyPenalty: 0.25, presencePenalty: 0.15 }
        ),
        // Кандидат B: прямой перенос + высокая синтаксическая вариативность (T=1.12)
        generateWithFallback(
          normalizedModel,
          directContents,
          systemInstruction,
          'medium',
          { temperature: 1.12, topP: 0.96, frequencyPenalty: 0.35, presencePenalty: 0.25 }
        ),
        // Кандидат C: на длинных текстах — скользящий поабзацный перенос, иначе high-temp (T=1.24)
        shouldUseChunkedCandidate
          ? generateChunkedStyleTransfer({
              deSkeleton,
              donorProfile,
              systemInstruction,
              model: 'gemini-3.1-flash-lite',
            }).then((r) => ({ ...r, isChunked: true }))
          : generateWithFallback(
              'gemini-3.1-flash-lite',
              propContents,
              systemInstruction,
              'low',
              { temperature: 1.24, topP: 0.97, frequencyPenalty: 0.4, presencePenalty: 0.3 }
            ),
      ];

      const settledResults = await Promise.allSettled(candidatePromises);

      const candidates: Array<{
        text: string;
        diag: DiagnosticReport;
        det: DetectorFeedbackReport;
        model: string;
        fallback: boolean;
        isChunked: boolean;
      }> = [];

      for (const result of settledResults) {
        if (result.status !== 'fulfilled' || !result.value.text) {
          continue;
        }

        const polished = deterministicPolish(
          result.value.text,
          donorProfile
        );

        const diag = diagnoseTextDefects(
          polished,
          donorProfile,
          text2
        );
        const det = evaluateDetectorFeedback(
          polished,
          shields,
          donorDetectorBaseline
        );

        candidates.push({
          text: polished,
          diag,
          det,
          model: result.value.usedModel,
          fallback: result.value.fallbackOccurred,
          isChunked: Boolean(result.value.isChunked),
        });
      }

      if (candidates.length === 0) {
        const firstRejected = settledResults.find(
          (r): r is PromiseRejectedResult => r.status === 'rejected'
        );
        throw (
          firstRejected?.reason ||
          new Error('Все параллельные попытки генерации завершились без результата.')
        );
      }

      // Сначала сравниваем сохранность фактов и отсутствие утечки темы донора,
      // затем совокупный индекс (стилевая ДНК + детекторы + дистанция до донора).
      candidates.sort((a, b) => {
        const lostDiff =
          a.diag.factsReport.lostCritical.length -
          b.diag.factsReport.lostCritical.length;

        if (lostDiff !== 0) {
          return lostDiff;
        }

        const leakDiff =
          (a.diag.factsReport.donorLeakTerms?.length ?? 0) -
          (b.diag.factsReport.donorLeakTerms?.length ?? 0);

        if (leakDiff !== 0) {
          return leakDiff;
        }

        const scoreA =
          a.diag.overallScore - a.det.compositeAiPct * 0.35 - a.det.donorDistance * 0.2;
        const scoreB =
          b.diag.overallScore - b.det.compositeAiPct * 0.35 - b.det.donorDistance * 0.2;
        return scoreB - scoreA;
      });

      bestText = candidates[0].text;
      bestDiag = candidates[0].diag;
      bestDet = candidates[0].det;
      usedModel = candidates[0].model;
      fallbackOccurred = candidates[0].fallback;
      chunkedTransfer = candidates[0].isChunked;
    } else {
      // Для малолимитной Hydrogen (20 req/day) делаем 1 точный синтез, опираясь на де-скелет/чертёж от Flash Lite
      const primaryInput =
        deSkeleton
          ? formatPropositionsInput(deSkeleton, text2, donorProfile)
          : directContents;

      const pass1 = await generateWithFallback(
        normalizedModel,
        primaryInput,
        systemInstruction,
        'high',
        { temperature: 0.98, topP: 0.95, frequencyPenalty: 0.25, presencePenalty: 0.15 }
      );

      bestText = deterministicPolish(
        pass1.text,
        donorProfile
      );

      bestDiag = diagnoseTextDefects(
        bestText,
        donorProfile,
        text2
      );
      bestDet = evaluateDetectorFeedback(
        bestText,
        shields,
        donorDetectorBaseline
      );

      usedModel = pass1.usedModel;
      fallbackOccurred =
        pass1.fallbackOccurred || pass1.usedModel !== normalizedModel;
    }

    if (!bestDiag || !bestDet) {
      throw new Error('Не удалось сформировать диагностический отчёт.');
    }

    /* -------------------------------------------------------------- */
    /* ЭТАП 3. ЗАМКНУТЫЙ ЦИКЛ ПРОВЕРКИ И ОБРАТНОЙ СВЯЗИ ДЕТЕКТОРОВ    */
    /* -------------------------------------------------------------- */

    const diagBefore = bestDiag;
    const detectorBefore = bestDet;

    const factsLostBefore =
      diagBefore.factsReport.lostCritical.length;

    let passes = 1;
    let cyclesRun = 0;

    let criticScore: number | null = null;
    let criticRuns = 0;
    let lastCriticPass = 0;

    let pendingCriticDirectives: string[] = [];
    let pendingCriticIds: number[] = [];

    let stopReason = '100% допуск с первого синтеза';

    const MAX_CONVERGENCE_CYCLES = 6;

    let stalledCycles = 0;

    if (runDeepConvergence) {
      for (
        let cycle = 1;
        cycle <= MAX_CONVERGENCE_CYCLES;
        cycle++
      ) {
        /* ---------------------------------------------------------- */
        /* НЕЗАВИСИМЫЙ LLM-КРИТИК (до 2 проходов: старт >= 76 и финал) */
        /* ---------------------------------------------------------- */

        const canInvokeCritic =
          bestDiag.factsReport.lostCritical.length === 0 &&
          (bestDiag.factsReport.donorLeakTerms?.length ?? 0) === 0 &&
          bestDiag.overallScore >= 76 &&
          criticRuns < 2 &&
          (criticRuns === 0 || passes > lastCriticPass);

        if (canInvokeCritic) {
          criticRuns++;
          lastCriticPass = passes;

          try {
            const criticPrompt = buildStyleCriticPrompt(
              text1,
              text2,
              bestText,
              donorProfile,
              styleBlueprint
            );

            const criticRes =
              await generateJsonSafe<CriticResult>(
                'gemini-3.1-flash-lite',
                criticPrompt.contents,
                criticPrompt.systemInstruction,
                CRITIC_RESPONSE_SCHEMA,
                'medium',
                { temperature: 0.25, topP: 0.9 }
              );

            if (!criticRes) {
              stopReason =
                'Пройдены все алгоритмические проверки качества';
              break;
            }

            const scores = [
              criticRes.styleFidelityScore,
              criticRes.humanNaturalnessScore,
              criticRes.factCompletenessScore,
            ];

            // Некорректные оценки не должны влиять на решение.
            const validScores = scores.every(
              (score) =>
                typeof score === 'number' &&
                Number.isFinite(score) &&
                score >= 0 &&
                score <= 100
            );

            if (!validScores) {
              stopReason =
                'Критик вернул некорректные оценки; сохранён лучший результат';
              break;
            }

            criticScore = Math.round(
              scores.reduce((sum, score) => sum + score, 0) /
                scores.length
            );

            if (criticRes.passed && criticScore >= 88 && bestDet.compositeAiPct <= 35) {
              stopReason =
                `Пройдены все алгоритмические проверки, детекторы и LLM-критик (${criticScore}/100)`;
              break;
            }

            pendingCriticDirectives = Array.isArray(
              criticRes.actionableDirectives
            )
              ? criticRes.actionableDirectives
                  .filter(
                    (directive) =>
                      typeof directive === 'string' &&
                      directive.trim().length > 0
                  )
                  .slice(0, 5)
              : [];

            pendingCriticIds = Array.isArray(
              criticRes.suspiciousSentenceIds
            )
              ? criticRes.suspiciousSentenceIds
                  .filter(
                    (id) =>
                      Number.isInteger(id) &&
                      id >= 0
                  )
                  .slice(0, 6)
              : [];

            // Если критик не прошёл проверку, но не указал,
            // что именно нужно исправить, новый запрос бессмысленен (если нет замечаний детекторов).
            if (
              !criticRes.passed &&
              pendingCriticDirectives.length === 0 &&
              pendingCriticIds.length === 0 &&
              bestDet.detectorDirectives.length === 0
            ) {
              stopReason =
                'Критик не предоставил конкретных замечаний; сохранён лучший результат';
              break;
            }
          } catch (criticError) {
            const msg = criticError instanceof Error ? criticError.message : String(criticError);
            console.log(
              `[Style Critic] skipped: ${msg.slice(0, 180)}`
            );

            stopReason =
              'Пройдены алгоритмические проверки; критик недоступен';
            break;
          }
        } else if (
          !bestDiag.needsRefinement &&
          bestDiag.overallScore >= 94 &&
          bestDet.compositeAiPct <= 28 &&
          criticRuns >= 1
        ) {
          stopReason =
            `Достигнут целевой уровень качества (${bestDiag.overallScore}/100)`;
          break;
        }

        if (stalledCycles >= 2) {
          stopReason =
            'Достигнут устойчивый максимум (дальнейшие правки не улучшают метрику)';
          break;
        }

        cyclesRun++;

        try {
          /* -------------------------------------------------------- */
          /* ОПРЕДЕЛЕНИЕ ГЛОБАЛЬНЫХ ДЕФЕКТОВ                          */
          /* -------------------------------------------------------- */

          const hasGlobalIssue = bestDiag.issues.some(
            (issue) =>
              issue.type === 'burstiness' ||
              issue.type === 'donorLengthDrift' ||
              issue.type === 'factLoss' ||
              issue.type === 'ttr' ||
              issue.type === 'donorMarkers' ||
              issue.type === 'nominalizationOverload' ||
              issue.type === 'negationShift'
          );

          const mergedDetectorDirectives = Array.from(
            new Set([...pendingCriticDirectives, ...bestDet.detectorDirectives])
          ).slice(0, 7);

          const mergedLocalIds = Array.from(
            new Set([
              ...pendingCriticIds,
              ...bestDet.suspiciousSentenceIds,
            ])
          )
            .filter((id) => Number.isInteger(id) && id > 0)
            .slice(0, 6);

          const hasLocalIds =
            bestDiag.issues.some(
              (issue) => issue.sentenceIndexes.length > 0
            ) ||
            mergedLocalIds.length > 0;

          let candidateRaw = '';

          /* -------------------------------------------------------- */
          /* ХИРУРГИЧЕСКАЯ ПРАВКА                                     */
          /* -------------------------------------------------------- */

          if (
            !hasGlobalIssue &&
            hasLocalIds &&
            stalledCycles === 0
          ) {
            const syntheticDiag: DiagnosticReport =
              mergedLocalIds.length > 0 &&
              bestDiag.issues.length === 0
                ? {
                    ...bestDiag,
                    issues: [
                      {
                        type: 'cliche',
                        severity: 'major',
                        sentenceIndexes: mergedLocalIds,
                        message:
                          `Предложения №${mergedLocalIds.join(', №')} ` +
                          'звучат недостаточно естественно в голосе донора или выделяются по профилю детекторов.',
                      },
                    ],
                  }
                : bestDiag;

            const patchPrompt = buildSurgicalPatchPrompt(
              bestText,
              syntheticDiag,
              donorProfile,
              styleBlueprint,
              mergedDetectorDirectives
            );

            const patchRes = await generateJsonSafe<{
              patches: Array<{
                sentenceId: number;
                rewritten: string;
              }>;
            }>(
              'gemini-3.1-flash-lite',
              patchPrompt.contents,
              patchPrompt.systemInstruction,
              SURGICAL_PATCH_RESPONSE_SCHEMA,
              'medium',
              { temperature: 0.42, topP: 0.9 }
            );

            if (patchRes?.patches?.length) {
              candidateRaw = applySentencePatches(
                bestText,
                patchRes.patches
              );
            }
          }

          /* -------------------------------------------------------- */
          /* ОБЩИЙ REFINEMENT                                         */
          /* -------------------------------------------------------- */

          if (!candidateRaw) {
            const refinePrompt = buildRefinementPrompt(
              bestText,
              bestDiag,
              donorProfile,
              styleBlueprint,
              mergedDetectorDirectives,
              text2
            );

            const passN = await generateWithFallback(
              usedModel,
              refinePrompt.contents,
              refinePrompt.systemInstruction,
              'high',
              { temperature: 0.85, topP: 0.94, frequencyPenalty: 0.25 }
            );

            candidateRaw = passN.text;

            // Обновляем информацию о модели, если сработал fallback.
            usedModel = passN.usedModel;

            fallbackOccurred =
              fallbackOccurred || passN.fallbackOccurred;
          }

          const candidate = deterministicPolish(
            candidateRaw,
            donorProfile
          );

          const candidateDiag = diagnoseTextDefects(
            candidate,
            donorProfile,
            text2
          );
          const candidateDet = evaluateDetectorFeedback(
            candidate,
            shields,
            donorDetectorBaseline
          );

          /* -------------------------------------------------------- */
          /* ПРОВЕРКА КАНДИДАТА С УЧЁТОМ ДЕТЕКТОРОВ И ФАКТОВ          */
          /* -------------------------------------------------------- */

          if (
            acceptCandidateWithDetectors({
              prevText: bestText,
              prevDiag: bestDiag,
              prevDetector: bestDet,
              nextText: candidate,
              nextDiag: candidateDiag,
              nextDetector: candidateDet,
              hasDonorBaseline: true,
            })
          ) {
            bestText = candidate;
            bestDiag = candidateDiag;
            bestDet = candidateDet;

            passes++;
            stalledCycles = 0;

            pendingCriticDirectives = [];
            pendingCriticIds = [];
          } else {
            // Отдельное правило для конкретных замечаний критика.
            // Даже в этом случае новые потери фактов и скачки ИИ-детекторов запрещены.
            const safeStylisticApply =
              pendingCriticDirectives.length > 0 &&
              factsDoNotRegress(bestDiag, candidateDiag) &&
              candidateDiag.foundCliches.length === 0 &&
              candidateDiag.overallScore >=
                bestDiag.overallScore - 2 &&
              candidateDet.compositeAiPct <= bestDet.compositeAiPct + 5 &&
              candidate.length >= bestText.length * 0.72;

            if (safeStylisticApply) {
              bestText = candidate;
              bestDiag = candidateDiag;
              bestDet = candidateDet;

              passes++;
              stalledCycles = 0;

              pendingCriticDirectives = [];
              pendingCriticIds = [];
            } else {
              stalledCycles++;
            }
          }
        } catch (cycleError) {
          const msg = cycleError instanceof Error ? cycleError.message : String(cycleError);
          console.log(
            `[Convergence Cycle ${cycle}] gracefully stopped: ${msg.slice(0, 180)}`
          );

          stopReason =
            'Завершено досрочно (ограничение API на позднем цикле), сохранён лучший результат';

          break;
        }
      }

      if (cyclesRun >= MAX_CONVERGENCE_CYCLES) {
        stopReason =
          `Выполнено ${cyclesRun} циклов дожима ` +
          `(итоговый индекс ${bestDiag.overallScore}/100)`;
      }
    }

    /* -------------------------------------------------------------- */
    /* ИТОГОВЫЙ ОТЧЁТ                                                 */
    /* -------------------------------------------------------------- */

    const diagAfter = bestDiag;

    res.json({
      result: bestText,
      usedModel,
      fallbackOccurred,

      refinementMeta: {
        passes,
        cyclesRun,

        issuesDetected: diagBefore.issues.length,
        issuesRemaining: diagAfter.issues.length,

        burstinessBefore: diagBefore.burstiness,
        burstinessAfter: diagAfter.burstiness,

        clichesBefore: diagBefore.foundCliches.length,
        clichesAfter: diagAfter.foundCliches.length,

        donorBurstinessTarget: donorProfile.burstiness,

        factsLostBefore,
        factsLostAfter: diagAfter.factsReport.lostCritical.length,
        factsPreservedPct: diagAfter.factsReport.preservedPct,

        dnaMatchBefore: diagBefore.dnaMatchScore,
        dnaMatchAfter: diagAfter.dnaMatchScore,

        humanScoreBefore: diagBefore.humanScore,
        humanScoreAfter: diagAfter.humanScore,

        overallScoreAfter: diagAfter.overallScore,

        detectorAiBefore: detectorBefore.compositeAiPct,
        detectorAiAfter: bestDet.compositeAiPct,
        detectorDistanceAfter: bestDet.donorDistance,
        donorLeakCount: diagAfter.factsReport.donorLeakTerms?.length ?? 0,

        blueprintExtracted: !!styleBlueprint,
        deSkeletonized: !!deSkeleton,
        chunkedTransfer,
        criticRuns,

        criticScore,
        stopReason,
      },
    });
  } catch (err: any) {
    console.error('Style DNA error:', err);
    sendError(res, err, 'Ошибка обработки');
  }
});

/* ------------------------------------------------------------------ */
/* 2. TRANSFORM TEXT                                                  */
/* ------------------------------------------------------------------ */

app.post('/api/transform-text', async (req, res) => {
  try {
    const {
      text,
      promptStrategy = '',
      styleIntensity = 9,
      flags = {},
      shields = {},
      model = 'gemini-3.1-flash-lite',
    } = req.body;

    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({
        error: 'Текст обязателен',
      });
    }

    const runRefine = !!flags.twentyCycles;

    const normalizedModel = normalizeModelId(model);
    const inferredGenre = inferGenreFromInput(text, promptStrategy);
    const archetypeProfile = getGenreArchetypeProfile(inferredGenre);

    const promptSections = buildEnginePromptSections({
      flags,
      shields,
      enable20CycleCheck: runRefine,
      donorProfile: archetypeProfile,
      styleIntensity,
      promptStrategy,
      mode: 'humanizer',
    });

    const systemInstruction = promptSections.join('\n\n');

    const contents =
      `ИСХОДНЫЙ ТЕКСТ ДЛЯ ДЕ-ИСКУССТВЕННОСТИ:\n${text}\n\n` +
      'Выведи ТОЛЬКО переработанный живой авторский текст без вступлений и комментариев.';

    const pass1 = await generateWithFallback(
      normalizedModel,
      contents,
      systemInstruction,
      'high',
      { temperature: 1.0, topP: 0.95, frequencyPenalty: 0.28, presencePenalty: 0.15 }
    );

    let finalText = deterministicPolish(pass1.text);

    let diagBefore = diagnoseTextDefects(
      finalText,
      undefined,
      text
    );

    let diagAfter = diagBefore;
    let detectorAiBefore = evaluateDetectorFeedback(finalText, shields).compositeAiPct;
    let detectorAiAfter = detectorAiBefore;

    let passes = 1;

    let usedModel = pass1.usedModel;
    let fallbackOccurred = pass1.fallbackOccurred;

    if (runRefine && styleIntensity >= 5) {
      const loopRes = await runGenericConvergenceLoop({
        initialText: finalText,
        sourceText: text,
        model: usedModel,
        maxCycles: 4,
        initialDiagnostic: diagBefore,
        shields,
      });

      finalText = loopRes.finalText;

      diagBefore = loopRes.diagBefore;
      diagAfter = loopRes.diagAfter;
      detectorAiBefore = loopRes.detectorAiBefore;
      detectorAiAfter = loopRes.detectorAiAfter;

      passes = loopRes.passes;

      usedModel = loopRes.usedModel;

      fallbackOccurred =
        fallbackOccurred || loopRes.fallbackOccurred;
    }

    res.json({
      transformedText: finalText,
      usedModel,
      fallbackOccurred,

      refinementMeta: {
        passes,

        burstinessBefore: diagBefore.burstiness,
        burstinessAfter: diagAfter.burstiness,

        clichesBefore: diagBefore.foundCliches.length,
        clichesAfter: diagAfter.foundCliches.length,

        detectorAiBefore,
        detectorAiAfter,

        overallScoreAfter: diagAfter.overallScore,

        factsPreservedPct: diagAfter.factsReport.preservedPct,
      },
    });
  } catch (err: any) {
    console.error('Transform error:', err);
    sendError(res, err, 'Ошибка трансформации текста');
  }
});

/* ------------------------------------------------------------------ */
/* 3. GENERATE DRAFT                                                  */
/* ------------------------------------------------------------------ */

app.post('/api/generate-draft', async (req, res) => {
  try {
    const {
      text,
      strength = 10,
      customInstructions = '',
      shields = {},
      model = 'gemini-3.1-flash-lite',
    } = req.body;

    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({
        error: 'Текст обязателен',
      });
    }

    const normalizedModel = normalizeModelId(model);
    const draftArchetype = getGenreArchetypeProfile('draft');

    const systemInstruction = `Ты — мастер научной стилизации и создания аутентичных исследовательских черновиков.
Твоя цель — переписать исходный текст в форме живого академического черновика уровня ${strength} (из 10).
${customInstructions ? `Указания: ${customInstructions}` : ''}

Особенности уровня черновика ${strength}:
- Живой ход мысли автора, поиск точных формулировок, естественные связки, внутренняя динамика исследования.
- Высокая синтаксическая вариативность (Burstiness ~${draftArchetype.burstiness}): чередуй короткие выводы (3-6 слов) и развернутые периоды (24+ слов). Ориентир отглагольных существительных — не выше ${draftArchetype.nominalizationPer100}/100 слов.
- Отсутствие заглаженных формулировок, триад, цепочек родительных падежей и ИИ-стереотипов («в рамках», «следует отметить», «является»). Обычные связки («таким образом», «в свою очередь») допустимы, но не чаще одного раза на абзац.
- Полное сохранение всех научных аргументов, дат, имен, отрицаний и тезисов.

${buildFewShotContrastBlock()}

Выведи только готовый текст черновика без преамбул.`;

    const pass1 = await generateWithFallback(
      normalizedModel,
      text,
      systemInstruction,
      'high',
      { temperature: 1.02, topP: 0.95, frequencyPenalty: 0.25, presencePenalty: 0.15 }
    );

    let finalText = deterministicPolish(pass1.text);

    let usedModel = pass1.usedModel;
    let fallbackOccurred = pass1.fallbackOccurred;

    if (strength >= 7) {
      const initialDiagnostic = diagnoseTextDefects(
        finalText,
        undefined,
        text
      );

      const loopRes = await runGenericConvergenceLoop({
        initialText: finalText,
        sourceText: text,
        model: usedModel,
        maxCycles: 3,
        initialDiagnostic,
        shields,
      });

      finalText = loopRes.finalText;

      usedModel = loopRes.usedModel;

      fallbackOccurred =
        fallbackOccurred || loopRes.fallbackOccurred;
    }

    res.json({
      draft: finalText,
      usedModel,
      fallbackOccurred,
    });
  } catch (err: any) {
    console.error('Draft error:', err);
    sendError(res, err, 'Ошибка генерации черновика');
  }
});

/* ------------------------------------------------------------------ */
/* 4. ACADEMIC 39 RULES                                               */
/* ------------------------------------------------------------------ */

app.post('/api/academic-edit', async (req, res) => {
  try {
    const {
      text,
      customInstructions = '',
      shields = {},
      model = 'gemini-3.1-flash-lite',
    } = req.body;

    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({
        error: 'Текст обязателен',
      });
    }

    const normalizedModel = normalizeModelId(model);
    const academicArchetype = getGenreArchetypeProfile('academic');

    const systemInstruction = `Ты — строгий академический редактор, проверяющий текст по 39 правилам научного регламента:
1. Запрет на штампованные переходные мостики («следует отметить», «в рамках», «данный контекст»). Обычные связки («таким образом», «в свою очередь») допустимы, но не чаще одного раза на абзац.
2. Высокий показатель прерывистости (burstiness ~${academicArchetype.burstiness}): сочетание рубленых акцентов (3-6 слов) и сложных периодов (24+ слов). Держи долю отглагольных существительных умеренной (~${academicArchetype.nominalizationPer100}/100 сл.).
3. Запрет на гладкие, симметричные и обобщающие финалы абзацев.
4. Конкретизация научных положений, точность терминологии, отсутствие пустой воды и цепочек родительных падежей.
5. Замена искусственного глагола «является» на тире «—» или точные предикаты.
6. Живая авторская интонация без пассивного канцелярита и надуманных триад.
${customInstructions ? `Специальные указания: ${customInstructions}` : ''}

${buildFewShotContrastBlock()}

Выведи отредактированный текст без комментариев.`;

    const pass1 = await generateWithFallback(
      normalizedModel,
      text,
      systemInstruction,
      'high',
      { temperature: 0.88, topP: 0.94, frequencyPenalty: 0.22, presencePenalty: 0.1 }
    );

    const initialText = deterministicPolish(pass1.text);

    const initialDiagnostic = diagnoseTextDefects(
      initialText,
      undefined,
      text
    );

    const loopRes = await runGenericConvergenceLoop({
      initialText,
      sourceText: text,
      model: pass1.usedModel,
      maxCycles: 4,
      initialDiagnostic,
      shields,
    });

    res.json({
      editedText: loopRes.finalText,
      usedModel: loopRes.usedModel,
      fallbackOccurred:
        pass1.fallbackOccurred || loopRes.fallbackOccurred,
    });
  } catch (err: any) {
    console.error('Academic edit error:', err);
    sendError(res, err, 'Ошибка академического редактирования');
  }
});

/* ------------------------------------------------------------------ */
/* 5. SLOPTOTAL FULL INTEGRATION + AUDIT ДЕТЕКТОРОВ                    */
/* ------------------------------------------------------------------ */

const MAX_SLOPTOTAL_REPORTS = 100;
const slopReportsStore = new Map<
  string,
  { report: SlopAnalysisReport; feedback?: { verdict: 'human' | 'ai' | 'mixed' | 'unsure'; note?: string; submittedAt: string } }
>();
const slopAggregateStats = {
  totalAnalyses: 0,
  totalQuickScans: 0,
  totalParagraphScans: 0,
  totalSiteScans: 0,
  verdictCounts: { clean: 0, low: 0, suspicious: 0, likely: 0, slop: 0 } as Record<string, number>,
  feedbackCounts: { human: 0, ai: 0, mixed: 0, unsure: 0 } as Record<string, number>,
};

function isPrivateOrBlockedIp(ip: string): boolean {
  const cleanIp = ip.toLowerCase();
  if (cleanIp === '::1' || cleanIp === '::' || cleanIp.startsWith('fe80:') || cleanIp.startsWith('fc') || cleanIp.startsWith('fd')) {
    return true;
  }
  const v4 = cleanIp.startsWith('::ffff:') ? cleanIp.slice(7) : cleanIp;
  if (net.isIPv4(v4)) {
    const parts = v4.split('.').map(Number);
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  return false;
}

async function safeFetchPublicUrl(rawUrl: string): Promise<{
  finalUrl: string;
  html: string;
  headers: Record<string, string>;
  status: number;
}> {
  let currentUrl: URL;
  try {
    currentUrl = new URL(rawUrl.trim());
  } catch {
    throw new Error('Некорректный URL. Укажите адрес с http:// или https://');
  }

  if (currentUrl.protocol !== 'http:' && currentUrl.protocol !== 'https:') {
    throw new Error('Разрешены только протоколы http:// и https://');
  }

  const MAX_REDIRECTS = 3;
  const MAX_BYTES = 5 * 1024 * 1024;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const hostname = currentUrl.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === 'metadata.google.internal' ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      throw new Error('Доступ к локальным или внутренним адресам запрещён');
    }

    if (net.isIP(hostname)) {
      if (isPrivateOrBlockedIp(hostname)) {
        throw new Error('Заблокирован приватный или loopback IP-адрес');
      }
    } else {
      const resolved = await dns.promises.lookup(hostname, { all: true });
      if (!resolved || resolved.length === 0) {
        throw new Error(`Не удалось разрешить домен: ${hostname}`);
      }
      for (const entry of resolved) {
        if (isPrivateOrBlockedIp(entry.address)) {
          throw new Error(`Домен ${hostname} указывает на приватный IP (${entry.address})`);
        }
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    let response: Response;
    try {
      response = await fetch(currentUrl.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'SlopTotalBot/1.0 (+https://github.com/pablocaeg/sloptotal)',
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const loc = response.headers.get('location');
      if (!loc) throw new Error(`Сервер вернул редирект ${response.status} без заголовка Location`);
      currentUrl = new URL(loc, currentUrl);
      if (currentUrl.protocol !== 'http:' && currentUrl.protocol !== 'https:') {
        throw new Error('Редирект ведёт на запрещённый протокол');
      }
      continue;
    }

    if (!response.ok) {
      throw new Error(`Страница вернула HTTP ${response.status}`);
    }

    const cl = Number(response.headers.get('content-length') || 0);
    if (cl > MAX_BYTES) {
      throw new Error('Размер страницы превышает лимит 5 МБ');
    }

    const buf = Buffer.from(await response.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) {
      throw new Error('Размер ответа превышает лимит 5 МБ');
    }

    const headersObj: Record<string, string> = {};
    response.headers.forEach((v, k) => {
      headersObj[k.toLowerCase()] = v;
    });

    return {
      finalUrl: currentUrl.toString(),
      html: buf.toString('utf8'),
      headers: headersObj,
      status: response.status,
    };
  }

  throw new Error('Слишком много редиректов при загрузке URL');
}

function storeSlopReport(report: SlopAnalysisReport) {
  if (slopReportsStore.size >= MAX_SLOPTOTAL_REPORTS) {
    const oldestKey = slopReportsStore.keys().next().value;
    if (oldestKey) slopReportsStore.delete(oldestKey);
  }
  slopReportsStore.set(report.id, { report });
  slopAggregateStats.totalAnalyses += 1;
  slopAggregateStats.verdictCounts[report.verdictKey] =
    (slopAggregateStats.verdictCounts[report.verdictKey] || 0) + 1;
}

app.get('/api/sloptotal/engines', (_req, res) => {
  res.json({
    engines: SLOPTOTAL_ENGINES,
    bands: SLOPTOTAL_BANDS,
    bandInfo: SLOPTOTAL_BAND_INFO,
  });
});

app.get('/api/sloptotal/stats', (_req, res) => {
  res.json({
    ...slopAggregateStats,
    cachedReportsCount: slopReportsStore.size,
  });
});

app.post('/api/sloptotal/analyze', async (req, res) => {
  try {
    const {
      text = '',
      url = '',
      selectedEngineKeys,
      fast = false,
      remoteUrl = '',
    } = req.body || {};

    let sourceType: 'text' | 'url' = 'text';
    let sourceLabel = '';
    let textToAnalyze = typeof text === 'string' ? text.trim() : '';

    if (typeof url === 'string' && url.trim()) {
      sourceType = 'url';
      sourceLabel = url.trim();
      const fetched = await safeFetchPublicUrl(url.trim());
      const extracted = extractHtmlFeaturesAndText(fetched.html);
      textToAnalyze = extracted.text;
      sourceLabel = fetched.finalUrl;
      if (!textToAnalyze || textToAnalyze.length < SLOPTOTAL_BANDS.MIN_TEXT_LENGTH) {
        return res.status(400).json({
          error:
            'На странице недостаточно читаемого текста (менее 50 символов). Возможно, сайт рендерится только через JS — скопируйте текст или HTML вручную.',
        });
      }
    }

    if (!textToAnalyze || textToAnalyze.length < SLOPTOTAL_BANDS.MIN_TEXT_LENGTH) {
      return res.status(400).json({
        error: `Введите минимум ${SLOPTOTAL_BANDS.MIN_TEXT_LENGTH} символов для анализа SlopTotal.`,
      });
    }

    if (typeof remoteUrl === 'string' && remoteUrl.trim()) {
      const cleanRemote = remoteUrl.trim().replace(/\/+$/, '');
      if (cleanRemote.startsWith('http://') || cleanRemote.startsWith('https://')) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 30_000);
          try {
            const remoteResp = await fetch(`${cleanRemote}/api/analyze`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
              body: JSON.stringify({
                text: sourceType === 'text' ? textToAnalyze : undefined,
                url: sourceType === 'url' ? sourceLabel : undefined,
                fast: Boolean(fast),
                engines: Array.isArray(selectedEngineKeys) && selectedEngineKeys.length > 0 ? selectedEngineKeys : undefined,
              }),
            });
            if (remoteResp.ok) {
              const remoteData: any = await remoteResp.json();
              if (remoteData && typeof remoteData.overall_score === 'number') {
                const report: SlopAnalysisReport = {
                  id: remoteData.id || `remote-${Date.now().toString(36)}`,
                  sourceType,
                  source: sourceLabel || textToAnalyze.slice(0, 100),
                  textExcerpt: remoteData.text_excerpt || textToAnalyze,
                  wordCount: remoteData.word_count || textToAnalyze.split(/\s+/).length,
                  inputChars: textToAnalyze.length,
                  language: remoteData.language || 'en',
                  languageSupport: remoteData.language_support || 'supported',
                  overallScore: Number(remoteData.overall_score),
                  humanScore: Number((100 - Number(remoteData.overall_score)).toFixed(1)),
                  overallVerdict: remoteData.overall_verdict || 'Remote SlopTotal',
                  verdictKey:
                    remoteData.overall_score <= 30
                      ? 'clean'
                      : remoteData.overall_score <= 45
                        ? 'low'
                        : remoteData.overall_score <= 55
                          ? 'suspicious'
                          : remoteData.overall_score <= 80
                            ? 'likely'
                            : 'slop',
                  confidence: remoteData.confidence || 'high',
                  scoreRange: remoteData.score_range || [remoteData.overall_score, remoteData.overall_score],
                  enginesFlagged: remoteData.engines_flagged || 0,
                  enginesTotal: remoteData.engines_total || (remoteData.engine_results?.length || 0),
                  selectedKeys: (remoteData.engine_results || []).map((r: any) => r.engine_name),
                  matchedMarkers: [],
                  engineResults: (remoteData.engine_results || []).map((r: any) => {
                    const meta = SLOPTOTAL_ENGINES.find((m) => m.name === r.engine_name || m.key === r.engine_name);
                    return {
                      key: meta?.key || r.engine_name,
                      engineName: r.engine_name,
                      code: meta?.code || r.engine_name,
                      engineType: r.engine_type || meta?.engineType || 'classifier',
                      score: Number(r.score),
                      verdict: r.verdict || 'clean',
                      details: r.details || '',
                      description: meta?.description || '',
                      url: meta?.url,
                      elapsedMs: 0,
                    };
                  }),
                  notes: [...(remoteData.notes || []), `Выполнено через внешний сервер SlopTotal (${cleanRemote})`],
                  createdAt: remoteData.created_at || new Date().toISOString(),
                  elapsedMs: 0,
                  mode: 'remote',
                };
                storeSlopReport(report);
                return res.json(report);
              }
            }
          } finally {
            clearTimeout(timer);
          }
        } catch (remoteErr: any) {
          console.warn('Remote SlopTotal fallback to embedded core:', remoteErr?.message);
        }
      }
    }

    const validKeys = Array.isArray(selectedEngineKeys)
      ? selectedEngineKeys.filter((k: unknown) => typeof k === 'string')
      : undefined;

    const report = runSlopTotalAnalysis(textToAnalyze, {
      selectedEngineKeys: validKeys,
      fast: Boolean(fast),
      sourceType,
      source: sourceLabel || undefined,
    });

    storeSlopReport(report);
    res.json(report);
  } catch (err: any) {
    console.error('SlopTotal analyze error:', err);
    res.status(400).json({ error: err?.message || 'Ошибка анализа SlopTotal' });
  }
});

app.post('/api/sloptotal/quick-score', async (req, res) => {
  try {
    const { text = '', url = '' } = req.body || {};
    let textToAnalyze = typeof text === 'string' ? text.trim() : '';

    if (typeof url === 'string' && url.trim()) {
      const fetched = await safeFetchPublicUrl(url.trim());
      textToAnalyze = extractHtmlFeaturesAndText(fetched.html).text;
    }

    if (!textToAnalyze || textToAnalyze.length < SLOPTOTAL_BANDS.MIN_TEXT_LENGTH) {
      return res.status(400).json({ error: 'Нужно минимум 50 символов для Quick Score.' });
    }

    const result = runSlopTotalQuickScore(textToAnalyze);
    slopAggregateStats.totalQuickScans += 1;
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Ошибка Quick Score' });
  }
});

app.post('/api/sloptotal/paragraph-score', async (req, res) => {
  try {
    const { text = '', url = '' } = req.body || {};
    let textToAnalyze = typeof text === 'string' ? text.trim() : '';

    if (typeof url === 'string' && url.trim()) {
      const fetched = await safeFetchPublicUrl(url.trim());
      textToAnalyze = extractHtmlFeaturesAndText(fetched.html).text;
    }

    if (!textToAnalyze || textToAnalyze.length < SLOPTOTAL_BANDS.MIN_TEXT_LENGTH) {
      return res.status(400).json({ error: 'Нужно минимум 50 символов для поабзацной тепловой карты.' });
    }

    const result = runSlopTotalParagraphAnalyze(textToAnalyze);
    slopAggregateStats.totalParagraphScans += 1;
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Ошибка поабзацного анализа' });
  }
});

app.post('/api/sloptotal/scan/site', async (req, res) => {
  try {
    const { url = '', html = '', includeText = true } = req.body || {};
    let targetUrl = typeof url === 'string' ? url.trim() : '';
    let finalUrl = targetUrl;
    let rawHtml = typeof html === 'string' ? html : '';
    let responseHeaders: Record<string, string> = {};

    if (!rawHtml && !targetUrl) {
      return res.status(400).json({ error: 'Укажите URL сайта или вставьте HTML-код страницы.' });
    }

    if (!rawHtml && targetUrl) {
      const fetched = await safeFetchPublicUrl(targetUrl);
      rawHtml = fetched.html;
      finalUrl = fetched.finalUrl;
      responseHeaders = fetched.headers;
    }

    const site = detectSiteBuilders(rawHtml, finalUrl || targetUrl, responseHeaders);
    const extracted = extractHtmlFeaturesAndText(rawHtml);
    const pageType = classifyPageType(extracted.text, extracted.htmlFeatures);
    const quickTextScore =
      includeText && extracted.text.length >= SLOPTOTAL_BANDS.MIN_TEXT_LENGTH && pageType.scoreable
        ? runSlopTotalQuickScore(extracted.text)
        : null;

    slopAggregateStats.totalSiteScans += 1;

    res.json({
      url: targetUrl || '(HTML)',
      finalUrl: finalUrl || targetUrl || '(HTML)',
      site,
      pageType,
      htmlFeatures: extracted.htmlFeatures,
      extractedText: extracted.text.slice(0, 3000),
      text: quickTextScore,
    });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Ошибка сканирования сайта' });
  }
});

app.post('/api/sloptotal/report/:id/feedback', (req, res) => {
  const { id } = req.params;
  const { verdict, note } = req.body || {};
  if (!['human', 'ai', 'mixed', 'unsure'].includes(verdict)) {
    return res.status(400).json({ error: 'Недопустимый вариант оценки' });
  }
  const entry = slopReportsStore.get(id);
  if (entry) {
    entry.feedback = {
      verdict,
      note: typeof note === 'string' ? note.slice(0, 300) : undefined,
      submittedAt: new Date().toISOString(),
    };
  }
  slopAggregateStats.feedbackCounts[verdict] = (slopAggregateStats.feedbackCounts[verdict] || 0) + 1;
  res.json({ ok: true, id, verdict, feedbackCounts: slopAggregateStats.feedbackCounts });
});

/* ------------------------------------------------------------------ */
/* 5B. MGT-EVAL FULL INTEGRATION (26 MODELS, PLATT, BENCHMARK, ASR)   */
/* ------------------------------------------------------------------ */

const mgtEvalStats = {
  totalDetections: 0,
  totalBenchmarks: 0,
  totalCalibrations: 0,
  totalAttacks: 0,
};

let savedPlattCalibrator: PlattParams | null = null;

function parseMgtBenchmarkSamples(rawInput: unknown): MgtBenchmarkSample[] {
  if (Array.isArray(rawInput)) {
    const out: MgtBenchmarkSample[] = [];
    for (let i = 0; i < rawInput.length; i++) {
      const item: any = rawInput[i];
      if (item && typeof item.text === 'string' && item.text.trim()) {
        const lbl = Number(item.label) > 0.5 ? 1 : 0;
        out.push({
          id: typeof item.id === 'string' ? item.id : `sample-${i}`,
          text: item.text.trim(),
          label: lbl,
          group: typeof item.group === 'string' && item.group.trim() ? item.group.trim() : 'custom',
        });
      }
    }
    return out;
  }

  if (typeof rawInput === 'string' && rawInput.trim()) {
    const lines = rawInput
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const out: MgtBenchmarkSample[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('{')) {
        try {
          const obj = JSON.parse(line);
          if (obj && typeof obj.text === 'string' && obj.text.trim()) {
            out.push({
              id: typeof obj.id === 'string' ? obj.id : `jsonl-${i}`,
              text: obj.text.trim(),
              label: Number(obj.label) > 0.5 ? 1 : 0,
              group: typeof obj.group === 'string' && obj.group.trim() ? obj.group.trim() : 'jsonl',
            });
          }
          continue;
        } catch {
          // fallback to delimited parsing
        }
      }
      // Skip CSV header
      if (i === 0 && /^label[,;\t]/i.test(line)) continue;
      const tabParts = line.split('\t');
      if (tabParts.length >= 2 && /^[01]$/.test(tabParts[0].trim())) {
        out.push({
          id: `tsv-${i}`,
          label: Number(tabParts[0].trim()),
          text: tabParts.slice(1).join('\t').trim(),
          group: 'tsv',
        });
        continue;
      }
      const csvMatch = line.match(/^([01])\s*[,;]\s*"?(.*?)"?$/);
      if (csvMatch && csvMatch[2].trim()) {
        out.push({
          id: `csv-${i}`,
          label: Number(csvMatch[1]),
          text: csvMatch[2].replace(/""/g, '"').trim(),
          group: 'csv',
        });
      }
    }
    return out;
  }

  return [];
}

app.get('/api/mgt-eval/catalog', (_req, res) => {
  res.json({
    detectors: MGT_DETECTORS_CATALOG,
    attacks: MGT_ATTACK_CATALOG,
    sampleDataset: MGT_SAMPLE_BENCHMARK_DATASET,
    savedCalibrator: savedPlattCalibrator,
    stats: mgtEvalStats,
  });
});

app.post('/api/mgt-eval/detect', async (req, res) => {
  try {
    const {
      text = '',
      detectorKeys,
      threshold = 0.5,
      calibratorParams,
      remoteUrl = '',
    } = req.body || {};

    const cleanText = typeof text === 'string' ? text.trim() : '';
    if (cleanText.length < 10) {
      return res.status(400).json({ error: 'Введите минимум 10 символов для анализа MGT-Eval.' });
    }

    const validKeys = Array.isArray(detectorKeys)
      ? detectorKeys.filter((k: unknown): k is string => typeof k === 'string')
      : undefined;
    const thr = typeof threshold === 'number' && Number.isFinite(threshold) ? threshold : 0.5;
    const activeCal: PlattParams | null =
      calibratorParams && typeof calibratorParams.beta0 === 'number'
        ? calibratorParams
        : calibratorParams === true
          ? savedPlattCalibrator
          : null;

    if (typeof remoteUrl === 'string' && remoteUrl.trim()) {
      const cleanRemote = remoteUrl.trim().replace(/\/+$/, '');
      if (cleanRemote.startsWith('http://') || cleanRemote.startsWith('https://')) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 30_000);
          try {
            const remoteResp = await fetch(`${cleanRemote}/api/demo/predict`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
              body: JSON.stringify({
                text: cleanText,
                detector: validKeys?.[0] || 'binoculars',
                detectors: validKeys,
                threshold: thr,
              }),
            });
            if (remoteResp.ok) {
              const remoteData: any = await remoteResp.json();
              const localFallback = runMgtEvalDetection(cleanText, {
                detectorKeys: validKeys,
                threshold: thr,
                calibratorParams: activeCal,
              });
              const remoteProb =
                typeof remoteData?.ai_probability === 'number'
                  ? remoteData.ai_probability
                  : typeof remoteData?.score === 'number'
                    ? Math.max(0, Math.min(1, remoteData.score))
                    : localFallback.overallAiProbability;
              const mergedReport: MgtDetectReport = {
                ...localFallback,
                overallAiProbability: Number(remoteProb.toFixed(4)),
                overallHumanProbability: Number((1 - remoteProb).toFixed(4)),
                mode: 'remote',
              };
              mgtEvalStats.totalDetections += 1;
              return res.json(mergedReport);
            }
          } finally {
            clearTimeout(timer);
          }
        } catch (remoteErr: any) {
          console.warn('Remote MGT-Eval fallback to local core:', remoteErr?.message);
        }
      }
    }

    const report = runMgtEvalDetection(cleanText, {
      detectorKeys: validKeys,
      threshold: thr,
      calibratorParams: activeCal,
    });
    mgtEvalStats.totalDetections += 1;
    res.json(report);
  } catch (err: any) {
    console.error('MGT-Eval detect error:', err);
    res.status(400).json({ error: err?.message || 'Ошибка анализа MGT-Eval' });
  }
});

app.post('/api/mgt-eval/benchmark', (req, res) => {
  try {
    const {
      samples,
      detectorKey = 'binoculars',
      threshold = 0.5,
      fitPlattCalibration = true,
    } = req.body || {};

    const parsed = parseMgtBenchmarkSamples(samples);
    const dataset = parsed.length >= 2 ? parsed : MGT_SAMPLE_BENCHMARK_DATASET;
    const thr = typeof threshold === 'number' && Number.isFinite(threshold) ? threshold : 0.5;
    const report = evaluateMgtBenchmark(dataset, String(detectorKey || 'binoculars'), {
      threshold: thr,
      fitPlattCalibration: Boolean(fitPlattCalibration),
    });

    if (report.plattParams) {
      savedPlattCalibrator = report.plattParams;
    }
    mgtEvalStats.totalBenchmarks += 1;
    res.json({
      ...report,
      usedSampleCount: dataset.length,
      usedDefaultDataset: parsed.length < 2,
    });
  } catch (err: any) {
    console.error('MGT-Eval benchmark error:', err);
    res.status(400).json({ error: err?.message || 'Ошибка бенчмарка MGT-Eval' });
  }
});

app.post('/api/mgt-eval/calibrate', (req, res) => {
  try {
    const { samples, detectorKey = 'binoculars' } = req.body || {};
    const parsed = parseMgtBenchmarkSamples(samples);
    const dataset = parsed.length >= 4 ? parsed : MGT_SAMPLE_BENCHMARK_DATASET;

    const scores: number[] = [];
    const labels: number[] = [];
    for (const s of dataset) {
      const det = runMgtEvalDetection(s.text, { detectorKeys: [String(detectorKey || 'binoculars')] });
      scores.push(det.results[0]?.aiProbability ?? det.overallAiProbability);
      labels.push(s.label > 0.5 ? 1 : 0);
    }

    const params = fitPlatt(scores, labels);
    savedPlattCalibrator = params;
    mgtEvalStats.totalCalibrations += 1;
    res.json({
      detectorKey: String(detectorKey || 'binoculars'),
      params,
      sampleCount: dataset.length,
      usedDefaultDataset: parsed.length < 4,
    });
  } catch (err: any) {
    console.error('MGT-Eval calibrate error:', err);
    res.status(400).json({ error: err?.message || 'Ошибка калибровки Platt Scaling' });
  }
});

app.post('/api/mgt-eval/attack', (req, res) => {
  try {
    const {
      text = '',
      attackType = 'homo',
      pct = 0.25,
      seed = 42,
      detectorKeys,
      threshold = 0.5,
    } = req.body || {};

    const cleanText = typeof text === 'string' ? text.trim() : '';
    if (cleanText.length < 15) {
      return res.status(400).json({ error: 'Введите минимум 15 символов для симуляции атаки и расчёта ASR.' });
    }

    const validAttack = MGT_ATTACK_CATALOG.some((a) => a.type === attackType)
      ? (attackType as MgtAttackType)
      : 'homo';
    const ratio = typeof pct === 'number' && Number.isFinite(pct) ? Math.max(0.05, Math.min(0.8, pct)) : 0.25;
    const thr = typeof threshold === 'number' && Number.isFinite(threshold) ? threshold : 0.5;
    const validKeys = Array.isArray(detectorKeys)
      ? detectorKeys.filter((k: unknown): k is string => typeof k === 'string')
      : undefined;

    const attackedText = applySingleMgtAttack(cleanText, validAttack, ratio, Number(seed) || 42);
    const qualityBefore = evaluateMgtQuality(cleanText);
    const qualityAfter = evaluateMgtQuality(attackedText, cleanText);

    const beforeReport = runMgtEvalDetection(cleanText, { detectorKeys: validKeys, threshold: thr });
    const afterReport = runMgtEvalDetection(attackedText, { detectorKeys: validKeys, threshold: thr });

    let previouslyFlagged = 0;
    let evadedCount = 0;
    const comparison = beforeReport.results.map((b, idx) => {
      const a = afterReport.results[idx];
      const beforePred = b.prediction;
      const afterPred = a?.prediction || beforePred;
      const flippedToHuman = beforePred === 'ai' && afterPred === 'human';
      if (beforePred === 'ai') previouslyFlagged += 1;
      if (flippedToHuman) evadedCount += 1;
      return {
        key: b.key,
        name: b.name,
        type: b.type,
        beforeAiProb: b.aiProbability,
        afterAiProb: a?.aiProbability ?? b.aiProbability,
        deltaAiProb: Number(((a?.aiProbability ?? b.aiProbability) - b.aiProbability).toFixed(4)),
        beforePrediction: beforePred,
        afterPrediction: afterPred,
        flippedToHuman,
      };
    });

    const asr = previouslyFlagged > 0 ? Number((evadedCount / previouslyFlagged).toFixed(4)) : 0;
    const avgAiDrop = Number((beforeReport.overallAiProbability - afterReport.overallAiProbability).toFixed(4));

    mgtEvalStats.totalAttacks += 1;

    res.json({
      attackType: validAttack,
      pct: ratio,
      originalText: cleanText,
      attackedText,
      qualityBefore,
      qualityAfter,
      beforeOverallAi: beforeReport.overallAiProbability,
      afterOverallAi: afterReport.overallAiProbability,
      avgAiDrop,
      previouslyFlagged,
      evadedCount,
      asr,
      comparison,
    });
  } catch (err: any) {
    console.error('MGT-Eval attack error:', err);
    res.status(400).json({ error: err?.message || 'Ошибка симуляции атаки MGT-Eval' });
  }
});

/* ------------------------------------------------------------------ */
/* 5C. MGTBENCH FULL INTEGRATION (14 METHODS, ATTRIBUTION, CURVES)    */
/* ------------------------------------------------------------------ */

const mgtBenchStats = {
  totalDetections: 0,
  totalAttributions: 0,
  totalBenchmarks: 0,
};

function parseMgtBenchSamples(rawInput: unknown): MgtBenchSample[] {
  if (Array.isArray(rawInput)) {
    const out: MgtBenchSample[] = [];
    for (let i = 0; i < rawInput.length; i++) {
      const item: any = rawInput[i];
      if (item && typeof item.text === 'string' && item.text.trim()) {
        out.push({
          dataset: typeof item.dataset === 'string' ? item.dataset : 'Custom',
          llm: typeof item.llm === 'string' ? item.llm : Number(item.label) > 0.5 ? 'ChatGPT' : 'Human',
          label: Number(item.label) > 0.5 ? 1 : 0,
          text: item.text.trim(),
        });
      }
    }
    return out;
  }

  if (typeof rawInput === 'string' && rawInput.trim()) {
    const lines = rawInput
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const out: MgtBenchSample[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('{')) {
        try {
          const obj = JSON.parse(line);
          if (obj && typeof obj.text === 'string' && obj.text.trim()) {
            const lbl = Number(obj.label) > 0.5 ? 1 : 0;
            out.push({
              dataset: typeof obj.dataset === 'string' ? obj.dataset : 'Custom',
              llm: typeof obj.llm === 'string' ? obj.llm : lbl === 1 ? 'ChatGPT' : 'Human',
              label: lbl,
              text: obj.text.trim(),
            });
          }
          continue;
        } catch {
          // fallback to delimited parsing
        }
      }
      if (i === 0 && /^label[,;\t]/i.test(line)) continue;
      const tabParts = line.split('\t');
      if (tabParts.length >= 2 && /^[01]$/.test(tabParts[0].trim())) {
        const lbl = Number(tabParts[0].trim());
        out.push({
          dataset: 'TSV',
          llm: lbl === 1 ? 'ChatGPT' : 'Human',
          label: lbl,
          text: tabParts.slice(1).join('\t').trim(),
        });
        continue;
      }
      const csvMatch = line.match(/^([01])\s*[,;]\s*"?(.*?)"?$/);
      if (csvMatch && csvMatch[2].trim()) {
        const lbl = Number(csvMatch[1]);
        out.push({
          dataset: 'CSV',
          llm: lbl === 1 ? 'ChatGPT' : 'Human',
          label: lbl,
          text: csvMatch[2].replace(/""/g, '"').trim(),
        });
      }
    }
    return out;
  }

  return [];
}

app.get('/api/mgtbench/catalog', (_req, res) => {
  res.json({
    methods: MGTBENCH_METHODS,
    datasets: MGTBENCH_DATASETS,
    llms: MGTBENCH_LLMS,
    testLengths: MGTBENCH_TEST_LENGTHS,
    sampleCorpus: MGTBENCH_BUILTIN_CORPUS,
    stats: mgtBenchStats,
  });
});

app.post('/api/mgtbench/detect', async (req, res) => {
  try {
    const {
      text = '',
      methodIds,
      cutTokenLength,
      threshold = 0.5,
      gptzeroApiKey = '',
    } = req.body || {};

    const cleanText = typeof text === 'string' ? text.trim() : '';
    if (cleanText.length < 10) {
      return res.status(400).json({ error: 'Введите минимум 10 символов для анализа MGTBench.' });
    }

    const validMethodIds = Array.isArray(methodIds)
      ? methodIds.filter((id: unknown): id is string => typeof id === 'string')
      : undefined;
    const cutLen =
      typeof cutTokenLength === 'number' && Number.isFinite(cutTokenLength) && cutTokenLength > 0
        ? Math.floor(cutTokenLength)
        : undefined;
    const thr = typeof threshold === 'number' && Number.isFinite(threshold) ? threshold : 0.5;

    const report: MgtBenchDetectReport = runMgtBenchDetection(cleanText, {
      methodIds: validMethodIds,
      cutTokenLength: cutLen,
      threshold: thr,
    });

    // Optional live GPTZero API bridge (https://api.gptzero.me/v2/predict/text)
    if (typeof gptzeroApiKey === 'string' && gptzeroApiKey.trim()) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12_000);
        try {
          const gzResp = await fetch('https://api.gptzero.me/v2/predict/text', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'X-Api-Key': gptzeroApiKey.trim(),
            },
            signal: controller.signal,
            body: JSON.stringify({ document: report.textExcerpt }),
          });
          if (gzResp.ok) {
            const gzData: any = await gzResp.json();
            const doc = gzData?.documents?.[0];
            if (doc && typeof doc.completely_generated_prob === 'number') {
              const liveProb = Number(Math.max(0.002, Math.min(0.998, doc.completely_generated_prob)).toFixed(4));
              const idx = report.results.findIndex((r) => r.id === 'GPTZero');
              if (idx >= 0) {
                report.results[idx] = {
                  ...report.results[idx],
                  rawCriterion: liveProb,
                  aiProbability: liveProb,
                  humanProbability: Number((1 - liveProb).toFixed(4)),
                  prediction: liveProb >= thr ? 'ai' : 'human',
                  details: `Live GPTZero API: P(AI)=${(liveProb * 100).toFixed(1)}%, avg_ppl=${doc.average_generated_prob ?? '—'}`,
                };
                report.flaggedCount = report.results.filter((r) => r.prediction === 'ai').length;
                const avg =
                  report.results.reduce((acc, r) => acc + r.aiProbability, 0) / Math.max(1, report.results.length);
                report.overallAiProbability = Number(avg.toFixed(4));
                report.overallHumanProbability = Number((1 - avg).toFixed(4));
                report.overallVerdict =
                  avg >= 0.6 ? 'Machine-Generated (AI)' : avg <= 0.4 ? 'Human-Written' : 'Borderline / Mixed';
              }
            }
          }
        } finally {
          clearTimeout(timer);
        }
      } catch (gzErr: any) {
        console.warn('Live GPTZero bridge fallback to MGTBench local engine:', gzErr?.message);
      }
    }

    mgtBenchStats.totalDetections += 1;
    res.json(report);
  } catch (err: any) {
    console.error('MGTBench detect error:', err);
    res.status(400).json({ error: err?.message || 'Ошибка анализа MGTBench' });
  }
});

app.post('/api/mgtbench/attribution', (req, res) => {
  try {
    const { text = '' } = req.body || {};
    const cleanText = typeof text === 'string' ? text.trim() : '';
    if (cleanText.length < 10) {
      return res.status(400).json({ error: 'Введите минимум 10 символов для 7-классовой атрибуции MGTBench.' });
    }
    const report: MgtBenchAttributionReport = runMgtBenchAttribution(cleanText);
    mgtBenchStats.totalAttributions += 1;
    res.json(report);
  } catch (err: any) {
    console.error('MGTBench attribution error:', err);
    res.status(400).json({ error: err?.message || 'Ошибка 7-классовой атрибуции MGTBench' });
  }
});

app.post('/api/mgtbench/benchmark', (req, res) => {
  try {
    const {
      datasetName = 'All Domains',
      detectLLM = 'All LLMs',
      methodId = 'Log-Likelihood',
      samples,
    } = req.body || {};

    const parsed = parseMgtBenchSamples(samples);
    const report: MgtBenchExperimentReport = runMgtBenchExperiment({
      datasetName: String(datasetName || 'All Domains'),
      detectLLM: String(detectLLM || 'All LLMs'),
      methodId: String(methodId || 'Log-Likelihood'),
      samples: parsed.length >= 4 ? parsed : undefined,
    });
    mgtBenchStats.totalBenchmarks += 1;
    res.json({
      ...report,
      usedSampleCount: parsed.length >= 4 ? parsed.length : MGTBENCH_BUILTIN_CORPUS.length,
      usedDefaultCorpus: parsed.length < 4,
    });
  } catch (err: any) {
    console.error('MGTBench benchmark error:', err);
    res.status(400).json({ error: err?.message || 'Ошибка бенчмарка MGTBench' });
  }
});

/* ------------------------------------------------------------------ */
/* 5D. DETECTZOO FULL INTEGRATION (37 TEXT + 70 ZOO + BENCHMARK)      */
/* ------------------------------------------------------------------ */

const detectZooStats = {
  totalPredictions: 0,
  totalBenchmarks: 0,
  totalAliasLookups: 0,
};

function parseDetectZooSamples(rawInput: unknown): DetectZooSample[] {
  if (Array.isArray(rawInput)) {
    const out: DetectZooSample[] = [];
    for (let i = 0; i < rawInput.length; i++) {
      const item: any = rawInput[i];
      if (item && typeof item.text === 'string' && item.text.trim()) {
        out.push({
          id: typeof item.id === 'string' ? item.id : `custom_${i + 1}`,
          text: item.text.trim(),
          label: Number(item.label) > 0.5 ? 1 : 0,
          source: typeof item.source === 'string' ? item.source : Number(item.label) > 0.5 ? 'AI' : 'Human',
          dataset: typeof item.dataset === 'string' ? item.dataset : 'custom',
        });
      }
    }
    return out;
  }

  if (typeof rawInput === 'string' && rawInput.trim()) {
    const lines = rawInput
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const out: DetectZooSample[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('{')) {
        try {
          const obj = JSON.parse(line);
          if (obj && typeof obj.text === 'string' && obj.text.trim()) {
            out.push({
              id: typeof obj.id === 'string' ? obj.id : `jsonl_${i + 1}`,
              text: obj.text.trim(),
              label: Number(obj.label) > 0.5 ? 1 : 0,
              source: typeof obj.source === 'string' ? obj.source : Number(obj.label) > 0.5 ? 'AI' : 'Human',
              dataset: typeof obj.dataset === 'string' ? obj.dataset : 'custom',
            });
          }
          continue;
        } catch {
          // fallback to CSV/TSV
        }
      }
      const sep = line.includes('\t') ? '\t' : ',';
      const firstSep = line.indexOf(sep);
      if (firstSep > 0) {
        const lbl = line.slice(0, firstSep).trim().toLowerCase();
        const txt = line.slice(firstSep + 1).trim();
        if (txt && txt.toLowerCase() !== 'text') {
          const isAi = lbl === '1' || lbl === 'ai' || lbl === 'machine' || lbl === 'llm' || lbl === 'true';
          out.push({
            id: `row_${i + 1}`,
            text: txt,
            label: isAi ? 1 : 0,
            source: isAi ? 'AI' : 'Human',
            dataset: 'custom',
          });
        }
      }
    }
    return out;
  }

  return [];
}

app.get('/api/detectzoo/registry', (_req, res) => {
  res.json({
    textDetectors: DETECTZOO_TEXT_DETECTORS,
    multimodalDetectors: DETECTZOO_MULTIMODAL_DETECTORS,
    allDetectors: DETECTZOO_FULL_ZOO_CATALOG,
    datasets: DETECTZOO_DATASETS,
    sampleCorpus: DETECTZOO_BUILTIN_CORPUS,
    counts: {
      text: DETECTZOO_TEXT_DETECTORS.length,
      image: DETECTZOO_MULTIMODAL_DETECTORS.filter((d) => d.modality === 'image').length,
      audio: DETECTZOO_MULTIMODAL_DETECTORS.filter((d) => d.modality === 'audio').length,
      video: DETECTZOO_MULTIMODAL_DETECTORS.filter((d) => d.modality === 'video').length,
      totalDetectors: DETECTZOO_FULL_ZOO_CATALOG.length,
      totalDatasets: DETECTZOO_DATASETS.length,
    },
    stats: detectZooStats,
  });
});

app.post('/api/detectzoo/resolve', (req, res) => {
  try {
    const { query = '' } = req.body || {};
    const q = String(query || '').trim();
    if (!q) {
      return res.status(400).json({ error: 'Укажите имя или алиас детектора / датасета DetectZoo.' });
    }
    detectZooStats.totalAliasLookups += 1;
    const detector = resolveDetectZooDetector(q) || null;
    const dataset = resolveDetectZooDataset(q) || null;
    res.json({
      query: q,
      found: Boolean(detector || dataset),
      detector,
      dataset,
    });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Ошибка резолвера DetectZoo' });
  }
});

app.post('/api/detectzoo/predict', (req, res) => {
  try {
    const {
      text = '',
      detectorNames,
      thresholdOverride,
      mode = 'full',
    } = req.body || {};

    const cleanText = typeof text === 'string' ? text.trim() : '';
    if (cleanText.length < 10) {
      return res.status(400).json({ error: 'Введите минимум 10 символов для анализа DetectZoo.' });
    }

    const validNames = Array.isArray(detectorNames)
      ? detectorNames.filter((n: unknown): n is string => typeof n === 'string')
      : undefined;
    const thr =
      typeof thresholdOverride === 'number' && Number.isFinite(thresholdOverride)
        ? thresholdOverride
        : undefined;

    const report: DetectZooSuiteReport = runDetectZooTextSuite(cleanText, {
      detectorNames: validNames,
      thresholdOverride: thr,
      mode: mode === 'fast' ? 'fast' : validNames && validNames.length > 0 ? 'selected' : 'full',
    });

    detectZooStats.totalPredictions += 1;
    res.json(report);
  } catch (err: any) {
    console.error('DetectZoo predict error:', err);
    res.status(400).json({ error: err?.message || 'Ошибка анализа DetectZoo' });
  }
});

app.post('/api/detectzoo/benchmark', (req, res) => {
  try {
    const {
      detectorNames,
      datasetName = 'all',
      threshold = 0.5,
      samples,
    } = req.body || {};

    const validNames = Array.isArray(detectorNames)
      ? detectorNames.filter((n: unknown): n is string => typeof n === 'string')
      : undefined;
    const parsed = parseDetectZooSamples(samples);
    const thr = typeof threshold === 'number' && Number.isFinite(threshold) ? threshold : 0.5;

    const report: DetectZooBenchmarkReport = runDetectZooBenchmark({
      detectorNames: validNames,
      datasetName: String(datasetName || 'all'),
      threshold: thr,
      samples: parsed.length >= 2 ? parsed : undefined,
    });

    detectZooStats.totalBenchmarks += 1;
    res.json({
      ...report,
      usedDefaultCorpus: parsed.length < 2,
    });
  } catch (err: any) {
    console.error('DetectZoo benchmark error:', err);
    res.status(400).json({ error: err?.message || 'Ошибка бенчмарка DetectZoo' });
  }
});

function analyzeTextMetrics(text: string) {
  const rawSentences = (text.match(/[^.!?…]+(?:[.!?…]+|$)/g) ?? [])
    .map((sentence: string) => sentence.trim())
    .filter((sentence: string) => sentence.length > 2);

  const sentenceWordCounts = rawSentences.map((sentence) => sentence.split(/\s+/).filter(Boolean).length);

  const totalWords = sentenceWordCounts.reduce((sum: number, count: number) => sum + count, 0) || 1;
  const avgWords = totalWords / (rawSentences.length || 1);

  const variance =
    sentenceWordCounts.reduce((sum: number, length: number) => sum + Math.pow(length - avgWords, 2), 0) /
    (rawSentences.length || 1);

  const stdDev = Math.sqrt(variance);
  const burstiness = avgWords > 0 ? Number((stdDev / avgWords).toFixed(2)) : 0;

  const words = text.toLowerCase().match(/[а-яёa-z0-9-]+/gi) || [];
  const uniqueWords = new Set(words);
  const ttr = words.length > 0 ? Number((uniqueWords.size / words.length).toFixed(2)) : 0.5;
  const lower = text.toLowerCase();

  const foundCliches = EXTENDED_AI_CLICHES.filter((cliche: string) => lower.includes(cliche));
  const clichePenalty = foundCliches.length * 7;
  const burstinessBonus = Math.min(18, Math.max(-25, Math.round((burstiness - 0.45) * 40)));
  const ttrBonus = Math.min(10, Math.max(-15, Math.round((ttr - 0.55) * 35)));

  const baseHuman = Math.max(12, Math.min(99, 96 - clichePenalty + burstinessBonus + ttrBonus));

  const top10 = Math.max(
    22,
    Math.min(68, Math.round(52 - burstiness * 18 - (foundCliches.length === 0 ? 8 : -foundCliches.length * 4)))
  );
  const top100 = Math.max(20, Math.min(38, Math.round(31 - foundCliches.length)));
  const top1000 = Math.max(10, Math.min(26, Math.round(14 + burstiness * 6)));
  const outOf1000 = Math.max(4, 100 - (top10 + top100 + top1000));

  const binocularsScore = Math.max(
    0.795,
    Math.min(0.985, Number((0.835 + foundCliches.length * 0.035 - burstiness * 0.05).toFixed(3)))
  );
  const detectGptCurvature = Math.max(
    0.012,
    Math.min(0.42, Number((0.045 + foundCliches.length * 0.04 - (burstiness > 0.6 ? 0.025 : 0)).toFixed(3)))
  );

  // Реальный прогон полного ядра SlopTotal (23 движка)
  const slopReport = runSlopTotalAnalysis(text);
  const slopHuman = Math.max(5, Math.min(99, Math.round(slopReport.humanScore)));
  const slopAi = Math.max(1, Math.min(95, Math.round(slopReport.overallScore)));

  // Реальный прогон ядра MGT-Eval (26 детекторов)
  const mgtReport = runMgtEvalDetection(text);
  const mgtHuman = Math.max(5, Math.min(99, Math.round(mgtReport.overallHumanProbability * 100)));
  const mgtAi = Math.max(1, Math.min(95, Math.round(mgtReport.overallAiProbability * 100)));

  // Реальный прогон ядра MGTBench (14 методов + PHD MST)
  const mgtBenchReport = runMgtBenchDetection(text);
  const mgtBenchHuman = Math.max(5, Math.min(99, Math.round(mgtBenchReport.overallHumanProbability * 100)));
  const mgtBenchAi = Math.max(1, Math.min(95, Math.round(mgtBenchReport.overallAiProbability * 100)));

  // Реальный прогон ядра DetectZoo (37 текстовых детекторов)
  const detectZooReport = runDetectZooTextSuite(text);
  const detectZooHuman = Math.max(5, Math.min(99, Math.round(detectZooReport.overallHumanProbability * 100)));
  const detectZooAi = Math.max(1, Math.min(95, Math.round(detectZooReport.overallAiProbability * 100)));

  const detectorsMap: Record<
    string,
    {
      rawMetric: string;
      threshold: string;
      scoreDelta: number;
      overrideHuman?: number;
      overrideAi?: number;
    }
  > = {
    binoculars: {
      rawMetric: `${binocularsScore}`,
      threshold: '< 0.901',
      scoreDelta: binocularsScore < 0.901 ? 2 : -20,
    },
    detectGpt: {
      rawMetric: `Z = ${detectGptCurvature}`,
      threshold: 'Z < 0.15',
      scoreDelta: detectGptCurvature < 0.15 ? 1 : -18,
    },
    fastDetectGpt: {
      rawMetric: `P = ${Number(Math.min(0.99, baseHuman / 100 + 0.02).toFixed(2))}`,
      threshold: 'P > 0.85',
      scoreDelta: 2,
    },
    gltr: {
      rawMetric: `Top-10: ${top10}%`,
      threshold: '< 45%',
      scoreDelta: top10 < 45 ? 1 : -15,
    },
    radar: {
      rawMetric: `Conf: ${Number(Math.min(0.99, baseHuman / 100).toFixed(2))}`,
      threshold: 'Conf > 0.80',
      scoreDelta: 1,
    },
    ghostbuster: {
      rawMetric: `Diverg: ${Number(Math.max(0.02, 0.14 - (baseHuman / 100) * 0.1).toFixed(3))}`,
      threshold: '< 0.12',
      scoreDelta: 1,
    },
    sloptotal: {
      rawMetric: `${slopReport.overallScore}/100 (${slopReport.enginesFlagged}/${slopReport.enginesTotal})`,
      threshold: '< 30 (Clean)',
      scoreDelta: 0,
      overrideHuman: slopHuman,
      overrideAi: slopAi,
    },
    mgtEval: {
      rawMetric: `${mgtAi}% AI (${mgtReport.flaggedCount}/${mgtReport.totalRun})`,
      threshold: '< 50% P(AI)',
      scoreDelta: 0,
      overrideHuman: mgtHuman,
      overrideAi: mgtAi,
    },
    mgtBench: {
      rawMetric: `${mgtBenchAi}% AI (${mgtBenchReport.flaggedCount}/${mgtBenchReport.totalRun})`,
      threshold: '< 50% P(AI)',
      scoreDelta: 0,
      overrideHuman: mgtBenchHuman,
      overrideAi: mgtBenchAi,
    },
    detectZoo: {
      rawMetric: `${detectZooAi}% AI (${detectZooReport.flaggedCount}/${detectZooReport.totalRun})`,
      threshold: '< 50% P(AI)',
      scoreDelta: 0,
      overrideHuman: detectZooHuman,
      overrideAi: detectZooAi,
    },
    robertaOpenAi: {
      rawMetric: `Fake: ${Math.max(1, 100 - baseHuman)}%`,
      threshold: '< 10%',
      scoreDelta: 0,
    },
    desklib: {
      rawMetric: `Anomaly: ${Math.max(1, Math.round((100 - baseHuman) * 0.7))}%`,
      threshold: '< 8%',
      scoreDelta: 2,
    },
    aiTextJury: {
      rawMetric: baseHuman >= 80 ? '5/5 Человек' : baseHuman >= 60 ? '3/5 Человек' : '1/5 Человек',
      threshold: '≥ 4/5',
      scoreDelta: baseHuman >= 80 ? 1 : -10,
    },
    hc3Comparison: {
      rawMetric: `GPT-Sim: ${Math.max(1, Math.round((100 - baseHuman) * 0.8))}%`,
      threshold: '< 5%',
      scoreDelta: 1,
    },
    houtini: {
      rawMetric: `Sym: ${Number(Math.max(0.04, 0.25 - burstiness * 0.15).toFixed(2))}`,
      threshold: '< 0.20',
      scoreDelta: 2,
    },
    detectLlama: {
      rawMetric: 'н/д (эвристика)',
      threshold: '< 5%',
      scoreDelta: 3,
    },
  };

  const results = Object.keys(detectorsMap).map((id) => {
    const meta = detectorsMap[id];
    const humanScore =
      typeof meta.overrideHuman === 'number'
        ? meta.overrideHuman
        : Math.max(8, Math.min(99, Math.round(baseHuman + meta.scoreDelta)));
    const aiScore = typeof meta.overrideAi === 'number' ? meta.overrideAi : 100 - humanScore;

    return {
      id,
      humanScore,
      aiScore,
      rawMetric: meta.rawMetric,
      threshold: meta.threshold,
      status: humanScore >= 80 ? 'Пройден (Человек)' : 'Подозрение на ИИ',
      verdictLabel:
        humanScore >= 80 ? 'Человек (Аутентичный)' : humanScore >= 60 ? 'Смешанный (Граница)' : 'ИИ (Сгенерирован)',
      riskLevel: humanScore >= 80 ? 'low' : humanScore >= 60 ? 'medium' : 'high',
    };
  });

  const avgHuman = Math.round(results.reduce((acc, r) => acc + r.humanScore, 0) / results.length);
  const flaggedCount = results.filter((r) => r.humanScore < 70).length;

  return {
    heuristic: true,
    auditedWords: words.length,
    overallHumanScore: avgHuman,
    overallAiScore: 100 - avgHuman,
    flaggedCount,
    totalAudited: results.length,
    verdict:
      avgHuman >= 85
        ? 'Эвристика: признаков машинного текста мало'
        : avgHuman >= 65
          ? 'Эвристика: умеренный риск'
          : 'Эвристика: много признаков машинного текста',
    gltrDistribution: {
      top10,
      top100,
      top1000,
      outOf1000,
    },
    binocularsScore: binocularsScore.toString(),
    detectGptCurvature: detectGptCurvature.toString(),
    sloptotalSummary: {
      overallScore: slopReport.overallScore,
      overallVerdict: slopReport.overallVerdict,
      confidence: slopReport.confidence,
      enginesFlagged: slopReport.enginesFlagged,
      enginesTotal: slopReport.enginesTotal,
      language: slopReport.language,
    },
    mgtEvalSummary: {
      overallAiPct: mgtAi,
      flaggedCount: mgtReport.flaggedCount,
      totalRun: mgtReport.totalRun,
      overallVerdict: mgtReport.overallVerdict,
    },
    mgtBenchSummary: {
      overallAiPct: mgtBenchAi,
      flaggedCount: mgtBenchReport.flaggedCount,
      totalRun: mgtBenchReport.totalRun,
      overallVerdict: mgtBenchReport.overallVerdict,
      phdIntrinsicDim: mgtBenchReport.phdIntrinsicDim,
    },
    detectZooSummary: {
      overallAiPct: detectZooAi,
      flaggedCount: detectZooReport.flaggedCount,
      totalRun: detectZooReport.totalRun,
      overallVerdict: detectZooReport.overallVerdict,
      meanConfidence: detectZooReport.meanConfidence,
      phdIntrinsicDim: detectZooReport.specialSignals.phdIntrinsicDim,
    },
    results,
  };
}

app.post('/api/audit-detectors', async (req, res) => {
  try {
    const { text = '', detectorId, detectorIds } = req.body;

    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({
        error: 'Нет текста для аудита',
      });
    }

    const auditData = analyzeTextMetrics(text);

    if (detectorId) {
      const single = auditData.results.find((result) => result.id === detectorId);
      if (single) {
        return res.json({
          heuristic: true,
          singleDetector: single,
          auditedWords: auditData.auditedWords,
          overallHumanScore: auditData.overallHumanScore,
        });
      }
    }

    if (Array.isArray(detectorIds) && detectorIds.length > 0) {
      const allowed = new Set(detectorIds.filter((id: unknown) => typeof id === 'string'));
      const filteredResults = auditData.results.filter((r) => allowed.has(r.id));
      const subsetAvgHuman =
        filteredResults.length > 0
          ? Math.round(filteredResults.reduce((acc, r) => acc + r.humanScore, 0) / filteredResults.length)
          : auditData.overallHumanScore;
      const subsetFlagged = filteredResults.filter((r) => r.humanScore < 70).length;

      return res.json({
        ...auditData,
        selectedMode: true,
        totalAudited: filteredResults.length,
        overallHumanScore: subsetAvgHuman,
        overallAiScore: 100 - subsetAvgHuman,
        flaggedCount: subsetFlagged,
        verdict:
          subsetAvgHuman >= 85
            ? 'Эвристика (выбранные): признаков машинного текста мало'
            : subsetAvgHuman >= 65
              ? 'Эвристика (выбранные): умеренный риск'
              : 'Эвристика (выбранные): много признаков машинного текста',
        results: filteredResults,
      });
    }

    res.json(auditData);
  } catch (err: any) {
    console.error('Audit error:', err);
    res.status(500).json({
      error: err?.message || 'Ошибка аудита',
    });
  }
});

/* ------------------------------------------------------------------ */
/* 6. DEEP AUDIT (СТЕНД ОДНОГО ДЕТЕКТОРА)                             */
/* ------------------------------------------------------------------ */

app.post('/api/detector/deep-audit', async (req, res) => {
  try {
    const { detectorId, text = '' } = req.body;

    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({
        error: 'Текст обязателен для анализа',
      });
    }

    const auditData = analyzeTextMetrics(text);
    const single = auditData.results.find((result) => result.id === detectorId) || auditData.results[0];

    res.json({
      heuristic: true,
      detectorId,
      singleDetector: single,
      auditedWords: auditData.auditedWords,
      overallHumanScore: auditData.overallHumanScore,
      gltrDistribution: auditData.gltrDistribution,
      binocularsScore: auditData.binocularsScore,
      detectGptCurvature: auditData.detectGptCurvature,
      sloptotalSummary: auditData.sloptotalSummary,
    });
  } catch (err: any) {
    console.error('Deep detector audit error:', err);
    res.status(500).json({
      error: err?.message || 'Ошибка глубокого аудита',
    });
  }
});

/* ------------------------------------------------------------------ */
/* HEALTH CHECK                                                       */
/* ------------------------------------------------------------------ */

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    hasApiKey: !!process.env.GEMINI_API_KEY,
  });
});

/* ------------------------------------------------------------------ */
/* VITE / STATIC                                                      */
/* ------------------------------------------------------------------ */

let viteMiddleware: express.RequestHandler | null = null;

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }

  if (viteMiddleware) {
    return viteMiddleware(req, res, next);
  }

  if (isProductionRuntime) {
    return next();
  }

  // Пока Vite прогревается.
  // Статус 503 + фраза «Starting Server...» распознаётся клиентским safePost.
  res.status(503);

  res.setHeader(
    'Content-Type',
    'text/html; charset=utf-8'
  );

  res.setHeader('Refresh', '1');

  res.send(
    '<!DOCTYPE html><html><head><meta http-equiv="refresh" content="1"><title>Инициализация...</title></head><body style="background:#090d16;color:#94a3b8;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="text-align:center;"><div style="font-size:16px;color:#f1f5f9;margin-bottom:8px;font-weight:bold;">Starting Server...</div><div style="font-size:12px;">Пожалуйста, подождите несколько секунд...</div></div></body></html>'
  );
});

const server = app.listen(PORT, HOST, () => {
  console.log(
    `Server listening immediately on http://${HOST}:${PORT}`
  );
});

server.on('error', (err: any) => {
  console.error('[Server Listen Error]:', err);
});

if (!isProductionRuntime) {
  try {
    const { createServer } = await import('vite');

    const vite = await createServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });

    viteMiddleware = vite.middlewares;

    console.log('Vite middleware mounted successfully');
  } catch (viteErr) {
    console.error(
      'Failed to initialize Vite middleware:',
      viteErr
    );
  }
} else {
  app.use(express.static(distDir));

  // app.use вместо app.get('*'):
  // работает и в Express 4, и в Express 5.
  app.use((_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}