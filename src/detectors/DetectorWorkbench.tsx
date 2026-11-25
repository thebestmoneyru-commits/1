/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  ExternalLink,
  Zap,
  RefreshCw,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  Check,
  Download,
  BookOpen,
  Cpu,
  BarChart2,
  Sparkles,
  Code2,
  Clock,
  Activity,
  History,
  Eye,
  Trash2,
} from 'lucide-react';
import { DETAILED_DETECTORS } from './detectorData';
import { runDeepAudit, DeepAuditResult } from './deepAuditEngine';
import { DetectorDialGauge } from '../App';
import { SlopTotalWorkbench } from './SlopTotalWorkbench';
import { MgtEvalWorkbench } from './MgtEvalWorkbench';
import { MgtBenchWorkbench } from './MgtBenchWorkbench';
import { DetectZooWorkbench } from './DetectZooWorkbench';

interface DetectorWorkbenchProps {
  detectorId: string;
  onSelectDetector: (id: string) => void;
  onBack: () => void;
  currentDnaResult?: string;
  currentContentText?: string;
  currentDonorText?: string;
  onApplyToMainScore?: (
    detectorId: string,
    patch: Partial<{
      humanScore: number;
      aiScore: number;
      rawMetric: string;
      status: string;
      verdictLabel: string;
      riskLevel: "low" | "medium" | "high";
    }>,
  ) => void;
}

export interface WorkbenchExtendedMetric {
  key: string;
  label: string;
  category:
    | 'Ритм и синтаксис'
    | 'Лексика и словарный запас'
    | 'Пунктуация и структура'
    | 'Анти-ИИ и стиль';
  value: string | number;
  note?: string;
}

export interface WorkbenchDiagnosticsLog {
  detectorId: string;
  detectorName: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  status: 'ok' | 'warning' | 'error';
  inputChars: number;
  inputWords: number;
  outputSummaryChars: number;
  paramsUsed: Record<string, any>;
  steps: Array<{
    stage: string;
    status: 'completed' | 'warning' | 'failed';
    durationMs: number;
    detail: string;
  }>;
  warnings: string[];
  error?: string;
}

export interface WorkbenchHistoryEntry {
  id: string;
  timestamp: number;
  detectorId: string;
  detectorName: string;
  durationMs: number;
  humanProbability: number;
  aiProbability: number;
  primaryMetric: string;
  promptOrContext: string;
  inputText: string;
  outputSummaryText: string;
  metricsSnapshot: Record<string, string | number>;
  diagnosticsSnapshot: WorkbenchDiagnosticsLog;
}

const WORKBENCH_HISTORY_KEY = 'detector_workbench_history_v1';

const AI_CLICHES_LIST = [
  'в рамках',
  'при таком подходе',
  'следует отметить',
  'необходимо отметить',
  'необходимо подчеркнуть',
  'важно подчеркнуть',
  'важно отметить',
  'нельзя не отметить',
  'в конечном счете',
  'в конечном итоге',
  'является неотъемлемой частью',
  'неотъемлемой частью',
  'данное обстоятельство',
  'представляется возможным',
  'играет ключевую роль',
  'подводя итог',
  'краеугольный камень',
  'гобелен',
  'многогранн',
  'свидетельствует о том',
  'в современном дискурсе',
  'выступает ключевым фактором',
  'целесообразно отметить',
  'детерминирующим фактором',
];

const formatDuration = (ms?: number | null): string => {
  if (typeof ms !== 'number' || Number.isNaN(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} мс`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(2)} с`;
  const mins = Math.floor(sec / 60);
  const rem = (sec % 60).toFixed(1);
  return `${mins} мин ${rem} с`;
};

const computePlus40WorkbenchMetrics = (
  text: string,
  donorRef?: string,
  sourceRef?: string
): WorkbenchExtendedMetric[] => {
  if (!text || !text.trim()) return [];

  const sentences = (text.match(/[^.!?…]+(?:[.!?…]+|$)/g) ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
  const sentLens = sentences.map((s) => s.split(/\s+/).filter(Boolean).length);
  const words = text.toLowerCase().match(/[а-яёa-z0-9-]+/gi) || [];
  const wordLens = words.map((w) => w.length);
  const paragraphs = text
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const paraLens = paragraphs.map((p) => p.split(/\s+/).filter(Boolean).length);

  const totalChars = text.length;
  const nonSpaceChars = text.replace(/\s+/g, '').length;
  const totalWords = words.length || 1;
  const totalSents = sentences.length || 1;
  const totalParas = paragraphs.length || 1;

  const uniqueWords = new Set(words);
  const freqMap = new Map<string, number>();
  for (const w of words) freqMap.set(w, (freqMap.get(w) || 0) + 1);

  const hapaxCount = Array.from(freqMap.values()).filter((c) => c === 1).length;
  const disCount = Array.from(freqMap.values()).filter((c) => c === 2).length;
  const longWordsCount = words.filter((w) => w.length >= 9).length;
  const shortWordsCount = words.filter((w) => w.length <= 3).length;

  const avgSentLen = totalWords / totalSents;
  const sentStd = Math.sqrt(
    sentLens.reduce((sum, n) => sum + Math.pow(n - avgSentLen, 2), 0) / totalSents
  );
  const sortedSentLens = [...sentLens].sort((a, b) => a - b);
  const medianSentLen = sortedSentLens[Math.floor(sortedSentLens.length / 2)] || 0;
  const iqrSentLen =
    sortedSentLens.length >= 4
      ? Number(
          (
            sortedSentLens[Math.floor(sortedSentLens.length * 0.75)] -
            sortedSentLens[Math.floor(sortedSentLens.length * 0.25)]
          ).toFixed(1)
        )
      : Number(sentStd.toFixed(1));

  const commas = (text.match(/,/g) || []).length;
  const periods = (text.match(/\./g) || []).length;
  const semicolons = (text.match(/;/g) || []).length;
  const colons = (text.match(/:/g) || []).length;
  const dashes = (text.match(/[—–-]{1,2}/g) || []).length;
  const questions = (text.match(/\?/g) || []).length;
  const exclamations = (text.match(/!/g) || []).length;
  const quotes = (text.match(/[«»"“”]/g) || []).length;
  const parens = (text.match(/[()]/g) || []).length;

  const lower = text.toLowerCase();
  const clicheHits = AI_CLICHES_LIST.reduce(
    (acc, c) =>
      acc +
      (lower.match(new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length,
    0
  );
  const particlesHits = (
    lower.match(/\b(же|ведь|лишь|только|даже|уже|просто|именно|будто|словно|точно)\b/g) || []
  ).length;
  const introMarkersHits = (
    lower.match(/\b(однако|впрочем|напротив|тем не менее|кроме того|помимо этого|следовательно|итак)\b/g) || []
  ).length;
  const passiveMarkersHits = (
    lower.match(/\b(является|представляет собой|осуществляется|производится|выполняется|реализуется|рассматривается)\b/g) || []
  ).length;
  const firstPersonHits = (lower.match(/\b(я|мы|мой|наш|мне|нам|меня|нас)\b/g) || []).length;
  const digitsCount = (text.match(/\d+/g) || []).length;

  let entropy = 0;
  for (const cnt of freqMap.values()) {
    const p = cnt / totalWords;
    entropy -= p * Math.log2(p);
  }

  let sumFreqSq = 0;
  for (const cnt of freqMap.values()) sumFreqSq += cnt * cnt;
  const yuleK = Number((((sumFreqSq - totalWords) / (totalWords * totalWords)) * 10000).toFixed(1));

  const donorSet = new Set((donorRef?.toLowerCase().match(/[а-яёa-z0-9-]+/gi) || []));
  const donorOverlapPct =
    words.length > 0 && donorSet.size > 0
      ? Number(((words.filter((w) => donorSet.has(w)).length / words.length) * 100).toFixed(1))
      : 0;

  const srcWords = (sourceRef?.trim() ? sourceRef.trim().split(/\s+/).length : 0) || words.length;
  const lengthRatio = srcWords > 0 ? Number((words.length / srcWords).toFixed(2)) : 1;

  let stepDiffSum = 0;
  for (let i = 1; i < sentLens.length; i++) {
    stepDiffSum += Math.abs(sentLens[i] - sentLens[i - 1]);
  }
  const cadenceDelta = sentLens.length > 1 ? Number((stepDiffSum / (sentLens.length - 1)).toFixed(1)) : 0;

  return [
    { key: 'm01', label: '01. Всего слов', category: 'Ритм и синтаксис', value: words.length },
    { key: 'm02', label: '02. Всего символов', category: 'Ритм и синтаксис', value: totalChars },
    { key: 'm03', label: '03. Символов без пробелов', category: 'Ритм и синтаксис', value: nonSpaceChars },
    { key: 'm04', label: '04. Число предложений', category: 'Ритм и синтаксис', value: sentences.length },
    { key: 'm05', label: '05. Средняя длина фразы', category: 'Ритм и синтаксис', value: Number(avgSentLen.toFixed(1)), note: 'сл.' },
    { key: 'm06', label: '06. Медиана длины фразы', category: 'Ритм и синтаксис', value: medianSentLen, note: 'сл.' },
    { key: 'm07', label: '07. СКО длины фразы', category: 'Ритм и синтаксис', value: Number(sentStd.toFixed(2)) },
    { key: 'm08', label: '08. Размах IQR длин фраз', category: 'Ритм и синтаксис', value: iqrSentLen },
    { key: 'm09', label: '09. Мин. слов во фразе', category: 'Ритм и синтаксис', value: sentLens.length ? Math.min(...sentLens) : 0 },
    { key: 'm10', label: '10. Макс. слов во фразе', category: 'Ритм и синтаксис', value: sentLens.length ? Math.max(...sentLens) : 0 },
    { key: 'm11', label: '11. Доля коротких (≤7 сл.)', category: 'Ритм и синтаксис', value: `${Math.round((sentLens.filter((n) => n <= 7).length / totalSents) * 100)}%` },
    { key: 'm12', label: '12. Доля длинных (≥25 сл.)', category: 'Ритм и синтаксис', value: `${Math.round((sentLens.filter((n) => n >= 25).length / totalSents) * 100)}%` },

    { key: 'm13', label: '13. Уникальных слов', category: 'Лексика и словарный запас', value: uniqueWords.size },
    { key: 'm14', label: '14. Коэффициент TTR', category: 'Лексика и словарный запас', value: Number((uniqueWords.size / totalWords).toFixed(3)) },
    { key: 'm15', label: '15. Hapax Legomena (1 раз)', category: 'Лексика и словарный запас', value: hapaxCount },
    { key: 'm16', label: '16. Доля Hapax в словаре', category: 'Лексика и словарный запас', value: `${Math.round((hapaxCount / Math.max(1, uniqueWords.size)) * 100)}%` },
    { key: 'm17', label: '17. Dis Legomena (2 раза)', category: 'Лексика и словарный запас', value: disCount },
    { key: 'm18', label: '18. Средняя длина слова', category: 'Лексика и словарный запас', value: Number((wordLens.reduce((a, b) => a + b, 0) / totalWords).toFixed(2)), note: 'букв' },
    { key: 'm19', label: '19. Длинные слова (≥9 б.)', category: 'Лексика и словарный запас', value: `${Math.round((longWordsCount / totalWords) * 100)}%` },
    { key: 'm20', label: '20. Короткие слова (≤3 б.)', category: 'Лексика и словарный запас', value: `${Math.round((shortWordsCount / totalWords) * 100)}%` },
    { key: 'm21', label: '21. Энтропия лексики', category: 'Лексика и словарный запас', value: Number(entropy.toFixed(2)), note: 'бит' },
    { key: 'm22', label: '22. Индекс Юла (Yule K)', category: 'Лексика и словарный запас', value: yuleK },
    { key: 'm23', label: '23. Числовых токенов', category: 'Лексика и словарный запас', value: digitsCount },

    { key: 'm24', label: '24. Число абзацев', category: 'Пунктуация и структура', value: paragraphs.length },
    { key: 'm25', label: '25. Средний абзац', category: 'Пунктуация и структура', value: Math.round(paraLens.reduce((a, b) => a + b, 0) / totalParas), note: 'сл.' },
    { key: 'm26', label: '26. Запятых всего', category: 'Пунктуация и структура', value: commas },
    { key: 'm27', label: '27. Запятых на 100 слов', category: 'Пунктуация и структура', value: Number(((commas / totalWords) * 100).toFixed(1)) },
    { key: 'm28', label: '28. Тире и дефисов', category: 'Пунктуация и структура', value: dashes },
    { key: 'm29', label: '29. Двоеточий и ;', category: 'Пунктуация и структура', value: colons + semicolons },
    { key: 'm30', label: '30. Вопросов / !', category: 'Пунктуация и структура', value: `${questions} / ${exclamations}` },
    { key: 'm31', label: '31. Кавычек / скобок', category: 'Пунктуация и структура', value: `${quotes} / ${parens}` },
    { key: 'm32', label: '32. Точек в тексте', category: 'Пунктуация и структура', value: periods },

    { key: 'm33', label: '33. Машинных клише', category: 'Анти-ИИ и стиль', value: clicheHits },
    { key: 'm34', label: '34. Клише на 100 слов', category: 'Анти-ИИ и стиль', value: Number(((clicheHits / totalWords) * 100).toFixed(2)) },
    { key: 'm35', label: '35. Частиц («же», «ведь»...)', category: 'Анти-ИИ и стиль', value: particlesHits },
    { key: 'm36', label: '36. Вводных связок', category: 'Анти-ИИ и стиль', value: introMarkersHits },
    { key: 'm37', label: '37. Канцелярских глаголов', category: 'Анти-ИИ и стиль', value: passiveMarkersHits },
    { key: 'm38', label: '38. Местоимений 1-го лица', category: 'Анти-ИИ и стиль', value: firstPersonHits },
    { key: 'm39', label: '39. Сходство словаря с Т1', category: 'Анти-ИИ и стиль', value: `${donorOverlapPct}%` },
    { key: 'm40', label: '40. Отношение длины к Т2', category: 'Анти-ИИ и стиль', value: `${lengthRatio}x` },
    { key: 'm41', label: '41. Индекс Burstiness', category: 'Анти-ИИ и стиль', value: Number((sentStd / Math.max(1, avgSentLen)).toFixed(3)) },
    { key: 'm42', label: '42. Контраст соседних фраз', category: 'Анти-ИИ и стиль', value: cadenceDelta },
  ];
};

export function DetectorWorkbench({
  detectorId,
  onSelectDetector,
  onBack,
  currentDnaResult = '',
  currentContentText = '',
  currentDonorText = '',
  onApplyToMainScore,
}: DetectorWorkbenchProps) {
  const detector = DETAILED_DETECTORS[detectorId] || DETAILED_DETECTORS.gltr;

  const [inputText, setInputText] = useState<string>(() => {
    return currentDnaResult || currentContentText || detector.sampleHumanText;
  });

  const [paramValues, setParamValues] = useState<Record<string, any>>(() => {
    const initial: Record<string, any> = {};
    detector.params.forEach((p) => {
      initial[p.key] = p.defaultValue;
    });
    return initial;
  });

  const [auditResult, setAuditResult] = useState<DeepAuditResult | null>(null);
  const [auditElapsedMs, setAuditElapsedMs] = useState<number | null>(null);
  const [diagnosticsLog, setDiagnosticsLog] = useState<WorkbenchDiagnosticsLog | null>(null);
  const [isAuditing, setIsAuditing] = useState<boolean>(false);
  const [copiedReport, setCopiedReport] = useState<boolean>(false);
  const [inspectToken, setInspectToken] = useState<any | null>(null);
  const [metricCategory, setMetricCategory] = useState<string>('ALL');

  // History of prompts/contexts & audit results
  const [historyItems, setHistoryItems] = useState<WorkbenchHistoryEntry[]>(() => {
    try {
      const raw = localStorage.getItem(WORKBENCH_HISTORY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      /* ignore */
    }
    return [];
  });
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(() => historyItems[0]?.id || null);

  const persistHistory = (next: WorkbenchHistoryEntry[]) => {
    setHistoryItems(next);
    try {
      localStorage.setItem(WORKBENCH_HISTORY_KEY, JSON.stringify(next.slice(0, 30)));
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const initial: Record<string, any> = {};
    const d = DETAILED_DETECTORS[detectorId] || DETAILED_DETECTORS.gltr;
    d.params.forEach((p) => {
      initial[p.key] = p.defaultValue;
    });
    setParamValues(initial);
  }, [detectorId]);

  const plus40Metrics = useMemo(
    () => computePlus40WorkbenchMetrics(inputText, currentDonorText, currentContentText),
    [inputText, currentDonorText, currentContentText]
  );

  const filteredPlus40Metrics = useMemo(() => {
    if (metricCategory === 'ALL') return plus40Metrics;
    return plus40Metrics.filter((m) => m.category === metricCategory);
  }, [plus40Metrics, metricCategory]);

  const handleExecuteAudit = () => {
    if (!inputText.trim()) return;
    const t0 = performance.now();
    const startedIso = new Date().toISOString();
    setIsAuditing(true);
    setInspectToken(null);

    setTimeout(() => {
      try {
        const step1Start = performance.now();
        const result = runDeepAudit(detector.id, inputText, paramValues);
        const step1Ms = Math.max(1, Math.round(performance.now() - step1Start));

        const step2Start = performance.now();
        const metricsList = computePlus40WorkbenchMetrics(inputText, currentDonorText, currentContentText);
        const step2Ms = Math.max(1, Math.round(performance.now() - step2Start));

        const totalMs = Math.max(1, Math.round(performance.now() - t0));
        const finishedIso = new Date().toISOString();

        const summaryText = `${result.verdictText} | ${result.primaryMetricLabel}: ${result.primaryMetricValue} (Порог: ${result.thresholdValue})`;

        const diag: WorkbenchDiagnosticsLog = {
          detectorId: detector.id,
          detectorName: detector.name,
          startedAt: startedIso,
          finishedAt: finishedIso,
          durationMs: totalMs,
          status:
            result.thresholdVerdict === 'passed'
              ? 'ok'
              : result.thresholdVerdict === 'warning'
              ? 'warning'
              : 'error',
          inputChars: inputText.length,
          inputWords: inputText.trim().split(/\s+/).filter(Boolean).length,
          outputSummaryChars: summaryText.length,
          paramsUsed: { ...paramValues },
          warnings:
            result.thresholdVerdict !== 'passed'
              ? [`Вердикт детектора ${detector.shortName}: ${result.verdictText}`]
              : [],
          steps: [
            {
              stage: `1. Глубокий расчёт алгоритма ${detector.shortName}`,
              status: 'completed',
              durationMs: step1Ms,
              detail: `${result.primaryMetricLabel} = ${result.primaryMetricValue}, Человек: ${result.humanProbability}% / ИИ: ${result.aiProbability}%`,
            },
            {
              stage: '2. Расчёт расширенного набора метрик (+42 показателя)',
              status: 'completed',
              durationMs: step2Ms,
              detail: `Вычислено ${metricsList.length} метрик по 4 категориям`,
            },
          ],
        };

        setAuditResult({ ...result, speedMs: totalMs });
        onApplyToMainScore?.(detector.id, {
          humanScore: result.humanProbability,
          aiScore: result.aiProbability,
          rawMetric: `${result.primaryMetricLabel}: ${result.primaryMetricValue}`,
          status: result.thresholdVerdict === "passed" ? "Пройден" : "Требует внимания",
          verdictLabel: result.verdictText,
          riskLevel: result.humanProbability >= 80 ? "low" : result.humanProbability >= 50 ? "medium" : "high",
        });
        setAuditElapsedMs(totalMs);
        setDiagnosticsLog(diag);

        const promptContext = [
          `Детектор: ${detector.name} (${detector.repo})`,
          `Параметры: ${JSON.stringify(paramValues)}`,
          `Порог: ${detector.thresholdFormula}`,
        ].join('\n');

        const entry: WorkbenchHistoryEntry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: Date.now(),
          detectorId: detector.id,
          detectorName: detector.shortName,
          durationMs: totalMs,
          humanProbability: result.humanProbability,
          aiProbability: result.aiProbability,
          primaryMetric: `${result.primaryMetricLabel}: ${result.primaryMetricValue}`,
          promptOrContext: promptContext,
          inputText,
          outputSummaryText: summaryText,
          metricsSnapshot: Object.fromEntries(metricsList.map((m) => [m.label, m.value])),
          diagnosticsSnapshot: diag,
        };

        const nextHistory = [entry, ...historyItems].slice(0, 30);
        persistHistory(nextHistory);
        setSelectedHistoryId(entry.id);
      } catch (err: any) {
        const totalMs = Math.max(1, Math.round(performance.now() - t0));
        setAuditElapsedMs(totalMs);
        setDiagnosticsLog({
          detectorId: detector.id,
          detectorName: detector.name,
          startedAt: startedIso,
          finishedAt: new Date().toISOString(),
          durationMs: totalMs,
          status: 'error',
          inputChars: inputText.length,
          inputWords: inputText.trim().split(/\s+/).filter(Boolean).length,
          outputSummaryChars: 0,
          paramsUsed: { ...paramValues },
          warnings: [],
          error: err?.message || 'Ошибка выполнения аудита',
          steps: [
            {
              stage: `Выполнение ${detector.shortName}`,
              status: 'failed',
              durationMs: totalMs,
              detail: err?.message || 'Ошибка',
            },
          ],
        });
        console.error('Audit execution error:', err);
      } finally {
        setIsAuditing(false);
      }
    }, 200);
  };

  useEffect(() => {
    if (inputText.trim()) {
      handleExecuteAudit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectorId]);

  const handleCopyReport = () => {
    if (!auditResult) return;
    const report =
      `=== АУДИТ ДЕТЕКТОРА ${detector.name.toUpperCase()} ===\n` +
      `Дата: ${new Date().toLocaleString()}\n` +
      `Время выполнения: ${formatDuration(auditElapsedMs ?? auditResult.speedMs)}\n` +
      `Первоисточник: ${detector.url}\n` +
      `Вероятность Человек: ${auditResult.humanProbability}%\n` +
      `Вероятность ИИ: ${auditResult.aiProbability}%\n` +
      `Основной показатель: ${auditResult.primaryMetricLabel} = ${auditResult.primaryMetricValue} (Порог: ${auditResult.thresholdValue})\n` +
      `Вердикт: ${auditResult.verdictText}\n` +
      `Слов: ${auditResult.stats.totalWords}, Предложений: ${auditResult.stats.totalSentences}, Burstiness: ${auditResult.stats.burstiness}\n`;

    navigator.clipboard.writeText(report);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2000);
  };

  const handleExportJson = () => {
    if (!auditResult) return;
    const fullExport = {
      auditResult,
      elapsedMs: auditElapsedMs ?? auditResult.speedMs,
      plus40Metrics,
      diagnosticsLog,
      history: historyItems,
    };
    const dataStr =
      'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(fullExport, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${detector.id}_deep_audit_report.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const selectedHistoryEntry = useMemo(
    () => historyItems.find((h) => h.id === selectedHistoryId) || historyItems[0] || null,
    [historyItems, selectedHistoryId]
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navigation & Breadcrumbs */}
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 lg:px-8 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition active:scale-95 cursor-pointer border border-slate-700"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Назад ко всем детекторам</span>
            </button>

            <span className="text-slate-600 hidden sm:inline">|</span>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium hidden md:inline">Детектор:</span>
              <select
                value={detector.id}
                onChange={(e) => onSelectDetector(e.target.value)}
                className="bg-slate-950 border border-indigo-600/60 text-indigo-200 text-xs font-semibold rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
              >
                {Object.values(DETAILED_DETECTORS).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.shortName} ({d.category})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {typeof auditElapsedMs === 'number' && auditElapsedMs > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-950/60 border border-emerald-700/60 text-emerald-300 text-xs font-mono">
                <Clock className="h-3.5 w-3.5" />
                <span>{formatDuration(auditElapsedMs)}</span>
              </span>
            )}
            <a
              href={detector.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-white text-xs font-mono transition border border-slate-700"
              title="Открыть первоисточник на GitHub"
            >
              <Code2 className="h-3.5 w-3.5" />
              <span>{detector.repo}</span>
              <ExternalLink className="h-3 w-3 ml-0.5 opacity-70" />
            </a>
          </div>
        </div>
      </header>

      {/* Main Workbench Body */}
      {detector.id === 'sloptotal' ? (
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-8">
          <SlopTotalWorkbench
            embedded
            currentDnaResult={currentDnaResult}
            currentContentText={currentContentText}
            currentDonorText={currentDonorText}
          />
        </main>
      ) : detector.id === 'mgtEval' ? (
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-8">
          <MgtEvalWorkbench
            embedded
            currentDnaResult={currentDnaResult}
            currentContentText={currentContentText}
            currentDonorText={currentDonorText}
          />
        </main>
      ) : detector.id === 'mgtBench' ? (
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-8">
          <MgtBenchWorkbench
            embedded
            currentDnaResult={currentDnaResult}
            currentContentText={currentContentText}
            currentDonorText={currentDonorText}
          />
        </main>
      ) : detector.id === 'detectZoo' ? (
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-8">
          <DetectZooWorkbench
            embedded
            currentDnaResult={currentDnaResult}
            currentContentText={currentContentText}
            currentDonorText={currentDonorText}
          />
        </main>
      ) : (
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-8 space-y-6">
          {/* Detector Title Banner & Scientific Credentials */}
          <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>

            <div className="relative z-10 flex flex-col md:flex-row md:items-start justify-between gap-6">
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs px-2.5 py-0.5 rounded-md font-mono font-bold bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                    {detector.category}
                  </span>
                  <span className="text-xs text-slate-400">
                    {detector.institution} · {detector.year}
                  </span>
                </div>

                <h1 className="text-2xl lg:text-3xl font-black text-white tracking-tight">
                  {detector.name}
                </h1>

                <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
                  {detector.scientificDescription}
                </p>

                <div className="pt-2 flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                  <BookOpen className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                  <span className="truncate">{detector.academicCitation}</span>
                </div>
              </div>

              <div className="bg-slate-950/90 border border-slate-800 p-4 rounded-xl shrink-0 min-w-[280px] max-w-sm space-y-2">
                <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Математический базис детектора</span>
                </div>
                <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800/80 font-mono text-xs text-emerald-400 font-bold overflow-x-auto">
                  {detector.mathFormula}
                </div>
                <div className="text-[11px] text-slate-400 flex justify-between pt-1">
                  <span>Правило порога:</span>
                  <strong className="text-slate-200 font-mono">{detector.thresholdFormula}</strong>
                </div>
              </div>
            </div>
          </section>

          {/* Text Input Workbench & Source Selectors */}
          <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-400" />
                <span>Текст для лабораторного анализа</span>
              </h2>

              <div className="flex items-center gap-1.5 flex-wrap">
                {currentDnaResult && (
                  <button
                    type="button"
                    onClick={() => setInputText(currentDnaResult)}
                    className="px-2.5 py-1 rounded-md bg-emerald-950/70 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/60 text-xs font-semibold transition active:scale-95 cursor-pointer"
                  >
                    🟢 Результат ДНК V5
                  </button>
                )}
                {currentContentText && (
                  <button
                    type="button"
                    onClick={() => setInputText(currentContentText)}
                    className="px-2.5 py-1 rounded-md bg-purple-950/70 hover:bg-purple-900 text-purple-300 border border-purple-700/60 text-xs font-semibold transition active:scale-95 cursor-pointer"
                  >
                    🟣 Исходный Текст 2 (ИИ)
                  </button>
                )}
                {currentDonorText && (
                  <button
                    type="button"
                    onClick={() => setInputText(currentDonorText)}
                    className="px-2.5 py-1 rounded-md bg-blue-950/70 hover:bg-blue-900 text-blue-300 border border-blue-700/60 text-xs font-semibold transition active:scale-95 cursor-pointer"
                  >
                    🔵 Текст 1 (Автор-Донор)
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setInputText(detector.sampleHumanText)}
                  className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition active:scale-95 cursor-pointer"
                >
                  Образец: Человек
                </button>
                <button
                  type="button"
                  onClick={() => setInputText(detector.sampleAiText)}
                  className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition active:scale-95 cursor-pointer"
                >
                  Образец: ИИ (ChatGPT)
                </button>
              </div>
            </div>

            <div className="relative">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Вставьте любой текст для исследования..."
                rows={7}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs lg:text-sm text-slate-200 font-mono leading-relaxed focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition resize-y"
              />
              <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 pt-1">
                <span>
                  Символов: <strong className="text-slate-300 font-mono">{inputText.length}</strong> · Слов:{' '}
                  <strong className="text-slate-300 font-mono">
                    {inputText.trim() ? inputText.trim().split(/\s+/).length : 0}
                  </strong>
                </span>
                {inputText.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setInputText('')}
                    className="text-slate-500 hover:text-rose-400 transition"
                  >
                    Очистить
                  </button>
                )}
              </div>
            </div>

            {detector.params.length > 0 && (
              <div className="bg-slate-950/80 border border-slate-800/80 p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Sliders className="h-3.5 w-3.5 text-indigo-400" />
                    Параметры калибровки и настройки алгоритма ({detector.shortName})
                  </span>
                  <span className="text-[10px] text-slate-500 font-normal">
                    Параметры из оригинального GitHub-репозитория
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {detector.params.map((p) => {
                    const val = paramValues[p.key] ?? p.defaultValue;
                    return (
                      <div key={p.key} className="space-y-1.5 bg-slate-900/50 p-3 rounded-lg border border-slate-800/60">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-slate-300 font-medium">{p.label}</span>
                          {p.type === 'slider' && (
                            <span className="text-indigo-400 font-mono font-bold">
                              {val}
                              {p.unit || ''}
                            </span>
                          )}
                        </div>

                        {p.type === 'slider' && (
                          <input
                            type="range"
                            min={p.min}
                            max={p.max}
                            step={p.step}
                            value={val}
                            onChange={(e) => {
                              setParamValues((prev) => ({
                                ...prev,
                                [p.key]: Number(e.target.value),
                              }));
                            }}
                            className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                          />
                        )}

                        {p.type === 'select' && (
                          <select
                            value={val}
                            onChange={(e) => {
                              setParamValues((prev) => ({
                                ...prev,
                                [p.key]: e.target.value,
                              }));
                            }}
                            className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          >
                            {p.options?.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        )}

                        {p.type === 'toggle' && (
                          <label className="flex items-center space-x-2 cursor-pointer pt-1">
                            <input
                              type="checkbox"
                              checked={!!val}
                              onChange={(e) => {
                                setParamValues((prev) => ({
                                  ...prev,
                                  [p.key]: e.target.checked,
                                }));
                              }}
                              className="w-4 h-4 rounded text-indigo-600 bg-slate-800 border-slate-700 focus:ring-indigo-500"
                            />
                            <span className="text-xs text-slate-300">{val ? 'Включено' : 'Выключено'}</span>
                          </label>
                        )}

                        <p className="text-[10px] text-slate-500 leading-tight">{p.description}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={handleExecuteAudit}
                disabled={isAuditing || !inputText.trim()}
                className="py-3 px-6 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm shadow-xl shadow-indigo-600/30 flex items-center gap-2 transition active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isAuditing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Вычисление формулы {detector.shortName}...</span>
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 text-amber-300" />
                    <span>Запустить полный глубокий анализ ({detector.shortName})</span>
                  </>
                )}
              </button>
            </div>
          </section>

          {/* Visual Results & Forensic Output */}
          {auditResult && (
            <section className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col items-center justify-center text-center relative overflow-hidden">
                  <div className="text-xs uppercase font-bold text-slate-400 tracking-wider mb-2">
                    Циферблат вероятности детектора
                  </div>

                  <DetectorDialGauge
                    humanScore={auditResult.humanProbability}
                    aiScore={auditResult.aiProbability}
                    isScanning={isAuditing}
                  />

                  <div className="w-full flex items-center justify-between gap-4 mt-3 px-4">
                    <div className="flex-1 p-2 rounded-xl bg-emerald-950/60 border border-emerald-800/50 text-center">
                      <div className="text-[10px] text-emerald-400 uppercase font-bold">Человек</div>
                      <div className="text-xl font-mono font-black text-emerald-300">
                        {auditResult.humanProbability}%
                      </div>
                    </div>
                    <div className="flex-1 p-2 rounded-xl bg-rose-950/60 border border-rose-800/50 text-center">
                      <div className="text-[10px] text-rose-400 uppercase font-bold">ИИ-Текст</div>
                      <div className="text-xl font-mono font-black text-rose-300">
                        {auditResult.aiProbability}%
                      </div>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-7 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        {auditResult.thresholdVerdict === 'passed' ? (
                          <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                        ) : auditResult.thresholdVerdict === 'warning' ? (
                          <AlertTriangle className="h-6 w-6 text-amber-400" />
                        ) : (
                          <XCircle className="h-6 w-6 text-rose-400" />
                        )}
                        <div>
                          <span className="text-xs text-slate-400 block">Научный вердикт:</span>
                          <h3 className="text-lg font-black text-white">
                            {auditResult.thresholdVerdict === 'passed'
                              ? 'Пройден: Аутентичный авторский текст'
                              : auditResult.thresholdVerdict === 'warning'
                              ? 'Пограничный результат (Риск подозрения)'
                              : 'Обнаружен сгенерированный ИИ-текст'}
                          </h3>
                        </div>
                      </div>

                      <span className="text-xs font-mono px-2.5 py-1 rounded-md bg-slate-800 text-emerald-300 border border-slate-700 flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        Время: {formatDuration(auditElapsedMs ?? auditResult.speedMs)}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">{auditResult.verdictText}</p>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          {auditResult.primaryMetricLabel}
                        </span>
                        <span className="text-xl font-mono font-black text-indigo-400">
                          {auditResult.primaryMetricValue}
                        </span>
                      </div>
                      <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          Порог разделения классов
                        </span>
                        <span className="text-xl font-mono font-black text-slate-300">
                          {auditResult.thresholdValue}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 grid grid-cols-4 gap-2 text-center text-xs">
                    <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/60">
                      <div className="text-[10px] text-slate-500">Слов</div>
                      <div className="font-mono font-bold text-slate-200">{auditResult.stats.totalWords}</div>
                    </div>
                    <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/60">
                      <div className="text-[10px] text-slate-500">Ср. длина фразы</div>
                      <div className="font-mono font-bold text-slate-200">
                        {auditResult.stats.avgSentenceLength} сл.
                      </div>
                    </div>
                    <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/60">
                      <div className="text-[10px] text-slate-500">Burstiness</div>
                      <div className="font-mono font-bold text-emerald-400">{auditResult.stats.burstiness}</div>
                    </div>
                    <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/60">
                      <div className="text-[10px] text-slate-500">Разнообразие TTR</div>
                      <div className="font-mono font-bold text-indigo-400">
                        {auditResult.stats.typeTokenRatio}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* +42 Additional Metrics across all categories */}
              {plus40Metrics.length > 0 && (
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-cyan-300">
                      <Activity className="h-4 w-4 text-cyan-400" />
                      <span>Расширенный набор метрик (+{plus40Metrics.length} показателей по всем разделам)</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap text-xs">
                      {[
                        'ALL',
                        'Ритм и синтаксис',
                        'Лексика и словарный запас',
                        'Пунктуация и структура',
                        'Анти-ИИ и стиль',
                      ].map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setMetricCategory(cat)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                            metricCategory === cat
                              ? 'bg-cyan-950 text-cyan-200 border-cyan-500'
                              : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                          }`}
                        >
                          {cat === 'ALL' ? `Все (${plus40Metrics.length})` : cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 max-h-80 overflow-y-auto pr-1">
                    {filteredPlus40Metrics.map((m) => (
                      <div
                        key={m.key}
                        className="rounded-xl bg-slate-950 border border-slate-800 p-2.5 space-y-0.5"
                      >
                        <div className="text-[10px] text-slate-400 truncate" title={m.label}>
                          {m.label}
                        </div>
                        <div className="text-xs font-mono font-bold text-white">
                          {m.value}{' '}
                          {m.note ? (
                            <span className="text-[10px] font-normal text-slate-400">{m.note}</span>
                          ) : null}
                        </div>
                        <div className="text-[9px] text-slate-500 truncate">{m.category}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* DETECTOR-SPECIFIC INTERACTIVE LABORATORY VIEWER */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-wrap gap-2">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <BarChart2 className="h-4 w-4 text-indigo-400" />
                    <span>Детальный инструментальный анализ: {detector.name}</span>
                  </h3>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyReport}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition active:scale-95 cursor-pointer"
                    >
                      {copiedReport ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      <span>{copiedReport ? 'Скопировано!' : 'Копировать отчет'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleExportJson}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-700/60 text-xs font-semibold transition active:scale-95 cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Экспорт JSON</span>
                    </button>
                  </div>
                </div>

                {detector.id === 'gltr' && auditResult.details.tokens && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-emerald-950/40 border border-emerald-700/50 p-3 rounded-xl">
                        <div className="flex items-center justify-between text-xs text-emerald-400 font-bold">
                          <span>Зеленый (Топ-10)</span>
                          <span>{auditResult.details.histogram.top10}%</span>
                        </div>
                        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mt-2">
                          <div
                            className="bg-emerald-500 h-full transition-all duration-500"
                            style={{ width: `${auditResult.details.histogram.top10}%` }}
                          ></div>
                        </div>
                        <span className="text-[10px] text-slate-400 block mt-1">
                          Ожидаемо: &lt; 45% для человека
                        </span>
                      </div>

                      <div className="bg-amber-950/40 border border-amber-700/50 p-3 rounded-xl">
                        <div className="flex items-center justify-between text-xs text-amber-400 font-bold">
                          <span>Желтый (Топ-100)</span>
                          <span>{auditResult.details.histogram.top100}%</span>
                        </div>
                        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mt-2">
                          <div
                            className="bg-amber-500 h-full transition-all duration-500"
                            style={{ width: `${auditResult.details.histogram.top100}%` }}
                          ></div>
                        </div>
                        <span className="text-[10px] text-slate-400 block mt-1">
                          Средняя предсказуемость
                        </span>
                      </div>

                      <div className="bg-rose-950/40 border border-rose-700/50 p-3 rounded-xl">
                        <div className="flex items-center justify-between text-xs text-rose-400 font-bold">
                          <span>Красный (Топ-1000)</span>
                          <span>{auditResult.details.histogram.top1000}%</span>
                        </div>
                        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mt-2">
                          <div
                            className="bg-rose-500 h-full transition-all duration-500"
                            style={{ width: `${auditResult.details.histogram.top1000}%` }}
                          ></div>
                        </div>
                        <span className="text-[10px] text-slate-400 block mt-1">
                          Редкие лексические единицы
                        </span>
                      </div>

                      <div className="bg-purple-950/40 border border-purple-700/50 p-3 rounded-xl">
                        <div className="flex items-center justify-between text-xs text-purple-400 font-bold">
                          <span>Фиолетовый (&gt;1000)</span>
                          <span>{auditResult.details.histogram.outOf1000}%</span>
                        </div>
                        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mt-2">
                          <div
                            className="bg-purple-500 h-full transition-all duration-500"
                            style={{ width: `${auditResult.details.histogram.outOf1000}%` }}
                          ></div>
                        </div>
                        <span className="text-[10px] text-slate-400 block mt-1">
                          Авторские и редкие слова
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>Нажмите на любое слово для просмотра ранга и машинных альтернатив:</span>
                        <span className="text-[10px] font-mono text-indigo-400">
                          Клик по токену = Инспектор
                        </span>
                      </div>

                      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 leading-relaxed flex flex-wrap gap-1.5 max-h-96 overflow-y-auto">
                        {auditResult.details.tokens.map((t: any, idx: number) => {
                          const bg =
                            t.color === 'green'
                              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60 hover:bg-emerald-900'
                              : t.color === 'yellow'
                              ? 'bg-amber-950/80 text-amber-300 border-amber-700/60 hover:bg-amber-900'
                              : t.color === 'red'
                              ? 'bg-rose-950/80 text-rose-300 border-rose-700/60 hover:bg-rose-900'
                              : 'bg-purple-950/80 text-purple-300 border-purple-700/60 hover:bg-purple-900';

                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setInspectToken(t)}
                              className={`px-1.5 py-0.5 rounded text-xs font-mono border transition-all cursor-pointer ${bg} ${
                                inspectToken === t ? 'ring-2 ring-white scale-105' : ''
                              }`}
                            >
                              {t.word}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {inspectToken && (
                      <div className="p-4 rounded-xl bg-slate-950 border border-indigo-600/70 space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">Инспектор токена:</span>
                            <span className="font-mono font-bold text-white text-sm bg-slate-800 px-2 py-0.5 rounded">
                              «{inspectToken.word}»
                            </span>
                            <span
                              className={`text-xs px-2 py-0.5 rounded font-mono font-bold ${
                                inspectToken.color === 'green'
                                  ? 'bg-emerald-950 text-emerald-300'
                                  : inspectToken.color === 'yellow'
                                  ? 'bg-amber-950 text-amber-300'
                                  : inspectToken.color === 'red'
                                  ? 'bg-rose-950 text-rose-300'
                                  : 'bg-purple-950 text-purple-300'
                              }`}
                            >
                              Ранг #{inspectToken.rank} ({inspectToken.color.toUpperCase()})
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setInspectToken(null)}
                            className="text-xs text-slate-400 hover:text-white"
                          >
                            Закрыть ✕
                          </button>
                        </div>

                        <div className="space-y-1.5">
                          <span className="text-[11px] text-slate-400 block font-semibold">
                            Альтернативные варианты языковой модели при этой позиции:
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2">
                            {inspectToken.alts?.map((alt: any, i: number) => (
                              <div
                                key={i}
                                className="bg-slate-900 p-2 rounded-lg border border-slate-800 text-xs font-mono"
                              >
                                <span className="text-slate-200 block truncate">{alt.word}</span>
                                <span className="text-[10px] text-indigo-400">P = {alt.prob}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {detector.id === 'binoculars' && auditResult.details.sentenceTrajectories && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-400 uppercase font-bold">
                          Observer PPL (M1)
                        </span>
                        <div className="text-lg font-mono font-bold text-emerald-400">
                          {auditResult.details.observerPPL}
                        </div>
                      </div>
                      <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-400 uppercase font-bold">
                          Performer CrossPPL (M2, M1)
                        </span>
                        <div className="text-lg font-mono font-bold text-indigo-400">
                          {auditResult.details.performerCrossPPL}
                        </div>
                      </div>
                      <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-400 uppercase font-bold">
                          Отношение (Score) / Порог
                        </span>
                        <div className="text-lg font-mono font-bold text-white">
                          {auditResult.details.score}{' '}
                          <span className="text-xs text-slate-400 font-normal">/ 0.9015</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <span className="text-xs font-bold text-slate-300">
                        Пофразовое распределение перплексий:
                      </span>
                      <div className="space-y-1.5 max-h-72 overflow-y-auto">
                        {auditResult.details.sentenceTrajectories.map((s: any, idx: number) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between gap-3 bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-xs font-mono"
                          >
                            <span className="text-slate-300 truncate flex-1">
                              {idx + 1}. {s.sentence}
                            </span>
                            <span className="text-indigo-400 font-bold shrink-0">{s.ratio}</span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] shrink-0 font-bold ${
                                s.isHuman
                                  ? 'bg-emerald-950 text-emerald-300'
                                  : 'bg-rose-950 text-rose-300'
                              }`}
                            >
                              {s.isHuman ? 'Человек' : 'ИИ'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {detector.id === 'detectGpt' && auditResult.details.perturbations && (
                  <div className="space-y-4">
                    <div className="text-xs text-slate-300">
                      Сгенерировано 10 T5-пертурбаций для оценки градиента кривизны лог-правдоподобия:
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-72 overflow-y-auto">
                      {auditResult.details.perturbations.map((p: any) => (
                        <div
                          key={p.id}
                          className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center text-xs font-mono"
                        >
                          <div>
                            <span className="text-slate-200 block font-semibold">{p.label}</span>
                            <span className="text-[10px] text-slate-400">
                              log p = {p.perturbedLogP}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-emerald-400 font-bold block">
                              Δ log p = -{p.diff}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              Кривизна {p.varianceRatio}x
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {detector.id === 'aiTextJury' && auditResult.details.votes && (
                  <div className="space-y-3">
                    <span className="text-xs font-bold text-slate-300">
                      Протокол судебных прений коллегии экспертов:
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {auditResult.details.votes.map((v: any, idx: number) => (
                        <div
                          key={idx}
                          className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2"
                        >
                          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                            <span className="text-xs font-bold text-white">{v.juror}</span>
                            <span
                              className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                                v.vote === 'Человек'
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                                  : 'bg-rose-950 text-rose-300 border border-rose-700'
                              }`}
                            >
                              {v.vote} ({v.score}%)
                            </span>
                          </div>
                          <p className="text-xs text-slate-300 leading-relaxed">«{v.argument}»</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!['gltr', 'binoculars', 'detectGpt', 'aiTextJury'].includes(detector.id) && (
                  <div className="space-y-3">
                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs space-y-2">
                      <div className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                        Внутренние переменные и векторные метрики:
                      </div>
                      <pre className="text-emerald-400 overflow-x-auto p-2 bg-slate-900 rounded-lg">
                        {JSON.stringify(auditResult.details, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>

              {/* Extended Diagnostics Panel */}
              {diagnosticsLog && (
                <details open className="bg-slate-900/80 border border-indigo-800/60 rounded-2xl p-6 shadow-xl space-y-4">
                  <summary className="cursor-pointer text-sm font-bold text-indigo-300 flex items-center justify-between flex-wrap gap-2">
                    <span>Расширенная диагностика стенда ({diagnosticsLog.detectorName})</span>
                    <span className="font-mono text-xs text-emerald-300">
                      Общее время: {formatDuration(diagnosticsLog.durationMs)}
                    </span>
                  </summary>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs pt-2">
                    <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
                      <div className="text-[10px] text-slate-400">Длительность</div>
                      <div className="font-mono font-bold text-emerald-300">
                        {formatDuration(diagnosticsLog.durationMs)}
                      </div>
                    </div>
                    <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
                      <div className="text-[10px] text-slate-400">Статус</div>
                      <div className="font-bold text-white">{diagnosticsLog.status.toUpperCase()}</div>
                    </div>
                    <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
                      <div className="text-[10px] text-slate-400">Объём входа</div>
                      <div className="font-mono font-bold text-slate-200">
                        {diagnosticsLog.inputWords} сл. / {diagnosticsLog.inputChars} симв.
                      </div>
                    </div>
                    <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
                      <div className="text-[10px] text-slate-400">Старт / Финиш</div>
                      <div className="font-mono text-[11px] text-slate-300 truncate">
                        {new Date(diagnosticsLog.finishedAt).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {diagnosticsLog.steps.map((st, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <span className="font-bold text-slate-200">{st.stage}</span>
                          <span className="text-slate-400 ml-2">— {st.detail}</span>
                        </div>
                        <span className="shrink-0 font-mono text-[11px] text-cyan-300 tabular-nums">
                          {formatDuration(st.durationMs)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {diagnosticsLog.warnings.length > 0 && (
                    <div className="rounded-xl bg-amber-950/20 border border-amber-800/50 p-3 text-xs text-amber-200">
                      <div className="font-bold mb-1">Диагностические предупреждения:</div>
                      <ul className="list-disc pl-5 space-y-1">
                        {diagnosticsLog.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {diagnosticsLog.error && (
                    <div className="rounded-xl bg-red-950/40 border border-red-800 p-3 text-xs text-red-200 font-semibold">
                      Ошибка: {diagnosticsLog.error}
                    </div>
                  )}
                </details>
              )}
            </section>
          )}

          {/* Saved History of Prompts, Contexts & Audit Results */}
          <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <History className="h-4 w-4 text-indigo-400" />
                <span>История запусков, параметров и результатов ({historyItems.length})</span>
              </div>
              {historyItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    persistHistory([]);
                    setSelectedHistoryId(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-950/40 hover:bg-red-900/50 text-red-200 border border-red-800/60 text-xs font-semibold cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Очистить историю</span>
                </button>
              )}
            </div>

            {historyItems.length === 0 ? (
              <p className="text-xs text-slate-400">Записей пока нет — запустите анализ текста.</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                <div className="lg:col-span-5 space-y-2 max-h-80 overflow-y-auto pr-1">
                  {historyItems.map((h) => {
                    const active = selectedHistoryEntry?.id === h.id;
                    return (
                      <div
                        key={h.id}
                        onClick={() => setSelectedHistoryId(h.id)}
                        className={`rounded-xl p-3 border text-xs cursor-pointer transition space-y-1 ${
                          active
                            ? 'bg-slate-950 border-indigo-500 ring-1 ring-indigo-500/40'
                            : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-indigo-300">{h.detectorName}</span>
                          <span className="font-mono text-[10px] text-emerald-300">
                            ⏱ {formatDuration(h.durationMs)}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-200 font-mono">
                          Человек: {h.humanProbability}% / ИИ: {h.aiProbability}% · {h.primaryMetric}
                        </div>
                        <div className="text-[10px] text-slate-400 line-clamp-2">{h.inputText}</div>
                        <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
                          <span>{new Date(h.timestamp).toLocaleString()}</span>
                          <span className="text-indigo-300 flex items-center gap-1">
                            <Eye className="h-3 w-3" /> Просмотр
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {selectedHistoryEntry && (
                  <div className="lg:col-span-7 rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-3 text-xs">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2 flex-wrap gap-2">
                      <span className="font-bold text-white">
                        Запись: {selectedHistoryEntry.detectorName} ({formatDuration(selectedHistoryEntry.durationMs)})
                      </span>
                      <button
                        type="button"
                        onClick={() => setInputText(selectedHistoryEntry.inputText)}
                        className="px-2.5 py-1 rounded bg-indigo-950 hover:bg-indigo-900 text-indigo-200 border border-indigo-700/60 text-[11px] font-semibold cursor-pointer"
                      >
                        Загрузить текст в редактор
                      </button>
                    </div>

                    <div className="rounded-lg bg-slate-900 border border-slate-800 p-2.5 space-y-1">
                      <div className="text-[10px] font-bold text-indigo-300">Параметры и контекст запуска</div>
                      <pre className="text-[11px] text-slate-200 whitespace-pre-wrap font-mono">
                        {selectedHistoryEntry.promptOrContext}
                      </pre>
                    </div>

                    <div className="rounded-lg bg-slate-900 border border-slate-800 p-2.5 space-y-1">
                      <div className="text-[10px] font-bold text-emerald-300">Результат проверки</div>
                      <p className="text-xs text-slate-100">{selectedHistoryEntry.outputSummaryText}</p>
                    </div>

                    <div className="rounded-lg bg-slate-900 border border-slate-800 p-2.5 space-y-1">
                      <div className="text-[10px] font-bold text-slate-400">Исходный текст запуска</div>
                      <p className="text-xs text-slate-300 whitespace-pre-wrap max-h-40 overflow-y-auto">
                        {selectedHistoryEntry.inputText}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </main>
      )}
    </div>
  );
}