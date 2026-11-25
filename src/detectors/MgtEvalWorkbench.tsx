/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowLeft,
  FlaskConical,
  Play,
  Swords,
  BarChart3,
  Sliders,
  BookOpen,
  CheckSquare,
  Download,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  Upload,
  Sparkles,
  AlertTriangle,
  ShieldAlert,
  TrendingDown,
  Target,
} from 'lucide-react';
import {
  MGT_DETECTORS_CATALOG,
  MGT_ATTACK_CATALOG,
  MGT_SAMPLE_BENCHMARK_DATASET,
  runMgtEvalDetection,
  evaluateMgtBenchmark,
  fitPlatt,
  applySingleMgtAttack,
  evaluateMgtQuality,
  type MgtDetectReport,
  type MgtBenchmarkReport,
  type PlattParams,
  type MgtAttackType,
  type MgtQualityMetrics,
  type MgtBenchmarkSample,
} from '../../shared/mgtEvalCore';

type MgtSubTab = 'detect' | 'attack' | 'benchmark' | 'calibrate' | 'catalog';

interface AttackResponse {
  attackType: MgtAttackType;
  pct: number;
  originalText: string;
  attackedText: string;
  qualityBefore: MgtQualityMetrics;
  qualityAfter: MgtQualityMetrics;
  beforeOverallAi: number;
  afterOverallAi: number;
  avgAiDrop: number;
  previouslyFlagged: number;
  evadedCount: number;
  asr: number;
  comparison: Array<{
    key: string;
    name: string;
    type: 'Metric-based' | 'Fine-tuned';
    beforeAiProb: number;
    afterAiProb: number;
    deltaAiProb: number;
    beforePrediction: 'ai' | 'human';
    afterPrediction: 'ai' | 'human';
    flippedToHuman: boolean;
  }>;
}

interface MgtEvalWorkbenchProps {
  onBack?: () => void;
  currentDnaResult?: string;
  currentContentText?: string;
  currentDonorText?: string;
  embedded?: boolean;
  initialText?: string;
  onApplyScoreToMain?: (humanScore: number, aiScore: number, rawMetric: string) => void;
}

const SAMPLE_MGT_AI_TEXT = `В рамках современной парадигмы следует отметить, что комплексный подход играет ключевую роль в понимании сложных трансформаций. Более того, данное обстоятельство является неотъемлемым элементом устойчивого развития, а подводя итог, важно подчеркнуть необходимость гармоничного синтеза традиционных и инновационных практик. Furthermore, it is important to note that this multifaceted framework serves as a testament to sustainable resilience.`;

const SOTA_ZERO_SHOT_KEYS = [
  'binoculars',
  'lastdepp',
  'lastde',
  'fastdetectgpt',
  'tocsin',
  'raidar',
  'dnadetectllm',
  'lrr',
  'npr',
  'gltr',
];

function parseClientSamples(raw: string): MgtBenchmarkSample[] {
  const lines = (raw || '')
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
            label: Number(obj.label) > 0.5 ? 1 : 0,
            text: obj.text.trim(),
            group: typeof obj.group === 'string' ? obj.group : 'jsonl',
          });
        }
        continue;
      } catch {
        // ignore invalid json line
      }
    }
    if (i === 0 && /^label[,;\t]/i.test(line)) continue;
    const tab = line.split('\t');
    if (tab.length >= 2 && /^[01]$/.test(tab[0].trim())) {
      out.push({ id: `tsv-${i}`, label: Number(tab[0].trim()), text: tab.slice(1).join('\t').trim(), group: 'tsv' });
      continue;
    }
    const csv = line.match(/^([01])\s*[,;]\s*"?(.*?)"?$/);
    if (csv && csv[2].trim()) {
      out.push({ id: `csv-${i}`, label: Number(csv[1]), text: csv[2].replace(/""/g, '"').trim(), group: 'csv' });
    }
  }
  return out;
}

export function MgtEvalWorkbench({
  onBack,
  currentDnaResult = '',
  currentContentText = '',
  currentDonorText = '',
  embedded = false,
  initialText = '',
  onApplyScoreToMain,
}: MgtEvalWorkbenchProps) {
  const [subTab, setSubTab] = useState<MgtSubTab>('detect');

  // Detection state
  const [inputText, setInputText] = useState<string>(() => initialText || currentDnaResult || currentContentText || SAMPLE_MGT_AI_TEXT);
  const [selectedKeys, setSelectedKeys] = useState<string[]>(() => MGT_DETECTORS_CATALOG.map((d) => d.key));
  const [threshold, setThreshold] = useState<number>(0.5);
  const [usePlatt, setUsePlatt] = useState<boolean>(false);
  const [savedPlatt, setSavedPlatt] = useState<PlattParams | null>(null);
  const [remoteUrl, setRemoteUrl] = useState<string>('');
  const [detectReport, setDetectReport] = useState<MgtDetectReport | null>(null);
  const [isDetecting, setIsDetecting] = useState<boolean>(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [copiedSummary, setCopiedSummary] = useState<boolean>(false);
  const [stats, setStats] = useState<{
    totalDetections: number;
    totalBenchmarks: number;
    totalCalibrations: number;
    totalAttacks: number;
  } | null>(null);

  // Attack / ASR state
  const [attackText, setAttackText] = useState<string>(() => currentContentText || SAMPLE_MGT_AI_TEXT);
  const [attackType, setAttackType] = useState<MgtAttackType>('homo');
  const [attackPct, setAttackPct] = useState<number>(0.25);
  const [attackSeed, setAttackSeed] = useState<number>(42);
  const [attackResult, setAttackResult] = useState<AttackResponse | null>(null);
  const [isAttacking, setIsAttacking] = useState<boolean>(false);
  const [attackError, setAttackError] = useState<string | null>(null);

  // Benchmark state
  const [benchDetector, setBenchDetector] = useState<string>('binoculars');
  const [benchThreshold, setBenchThreshold] = useState<number>(0.5);
  const [benchFitPlatt, setBenchFitPlatt] = useState<boolean>(true);
  const [customDatasetRaw, setCustomDatasetRaw] = useState<string>(() =>
    MGT_SAMPLE_BENCHMARK_DATASET.map((s) => JSON.stringify(s)).join('\n')
  );
  const [benchReport, setBenchReport] = useState<MgtBenchmarkReport | null>(null);
  const [isBenchmarking, setIsBenchmarking] = useState<boolean>(false);
  const [benchError, setBenchError] = useState<string | null>(null);

  // Calibration state
  const [calDetector, setCalDetector] = useState<string>('lastdepp');
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [calError, setCalError] = useState<string | null>(null);
  const [calSuccessMsg, setCalSuccessMsg] = useState<string | null>(null);

  // Catalog filter state
  const [catalogFilter, setCatalogFilter] = useState<'All' | 'Metric-based' | 'Fine-tuned'>('All');
  const [catalogSearch, setCatalogSearch] = useState<string>('');

  useEffect(() => {
    if (initialText.trim()) setInputText(initialText);
  }, [initialText]);

  useEffect(() => {
    if (!detectReport || !onApplyScoreToMain) return;
    const humanScore = Number((detectReport.overallHumanProbability * 100).toFixed(1));
    const aiScore = Number((detectReport.overallAiProbability * 100).toFixed(1));
    onApplyScoreToMain(humanScore, aiScore, `${aiScore}% P(AI) · ${detectReport.flaggedCount}/${detectReport.totalRun}`);
  }, [detectReport]);

  const refreshCatalogAndStats = async () => {
    try {
      const resp = await fetch('/api/mgt-eval/catalog');
      if (resp.ok) {
        const data = await resp.json();
        if (data?.stats) setStats(data.stats);
        if (data?.savedCalibrator) setSavedPlatt(data.savedCalibrator);
      }
    } catch {
      // ignore initial fetch hiccup
    }
  };

  useEffect(() => {
    refreshCatalogAndStats();
    // Auto-run initial 26-model scan locally for instant dashboard visualization
    if (inputText.trim().length >= 10) {
      try {
        setDetectReport(runMgtEvalDetection(inputText, { detectorKeys: selectedKeys, threshold }));
      } catch {
        // noop
      }
    }
  }, []);

  const toggleDetectorKey = (key: string) => {
    setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const handleRunDetection = async (keysOverride?: string[]) => {
    const keysToUse = keysOverride || selectedKeys;
    if (!inputText.trim() || inputText.trim().length < 10) {
      setDetectError('Введите минимум 10 символов для анализа MGT-Eval.');
      return;
    }
    if (keysToUse.length === 0) {
      setDetectError('Выберите хотя бы один детектор из 26 доступных.');
      return;
    }

    setIsDetecting(true);
    setDetectError(null);
    try {
      const resp = await fetch('/api/mgt-eval/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: inputText,
          detectorKeys: keysToUse,
          threshold,
          calibratorParams: usePlatt && savedPlatt ? savedPlatt : null,
          remoteUrl: remoteUrl.trim() || undefined,
        }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData?.error || `HTTP ${resp.status}`);
      }
      const data: MgtDetectReport = await resp.json();
      setDetectReport(data);
      refreshCatalogAndStats();
    } catch (err: any) {
      // Offline / local fallback
      try {
        const local = runMgtEvalDetection(inputText, {
          detectorKeys: keysToUse,
          threshold,
          calibratorParams: usePlatt && savedPlatt ? savedPlatt : null,
        });
        setDetectReport(local);
      } catch (e2: any) {
        setDetectError(err?.message || e2?.message || 'Ошибка анализа MGT-Eval');
      }
    } finally {
      setIsDetecting(false);
    }
  };

  const handleRunAttack = async () => {
    if (!attackText.trim() || attackText.trim().length < 15) {
      setAttackError('Введите минимум 15 символов для симуляции состязательной атаки.');
      return;
    }
    setIsAttacking(true);
    setAttackError(null);
    try {
      const resp = await fetch('/api/mgt-eval/attack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: attackText,
          attackType,
          pct: attackPct,
          seed: attackSeed,
          detectorKeys: selectedKeys.length > 0 ? selectedKeys : undefined,
          threshold,
        }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData?.error || `HTTP ${resp.status}`);
      }
      const data: AttackResponse = await resp.json();
      setAttackResult(data);
      refreshCatalogAndStats();
    } catch {
      const attackedText = applySingleMgtAttack(attackText, attackType, attackPct, attackSeed);
      const qualityBefore = evaluateMgtQuality(attackText);
      const qualityAfter = evaluateMgtQuality(attackedText, attackText);
      const before = runMgtEvalDetection(attackText, { detectorKeys: selectedKeys, threshold });
      const after = runMgtEvalDetection(attackedText, { detectorKeys: selectedKeys, threshold });
      let flagged = 0;
      let evaded = 0;
      const comparison = before.results.map((b, i) => {
        const a = after.results[i];
        const flippedToHuman = b.prediction === 'ai' && a?.prediction === 'human';
        if (b.prediction === 'ai') flagged += 1;
        if (flippedToHuman) evaded += 1;
        return {
          key: b.key,
          name: b.name,
          type: b.type,
          beforeAiProb: b.aiProbability,
          afterAiProb: a?.aiProbability ?? b.aiProbability,
          deltaAiProb: Number(((a?.aiProbability ?? b.aiProbability) - b.aiProbability).toFixed(4)),
          beforePrediction: b.prediction,
          afterPrediction: a?.prediction ?? b.prediction,
          flippedToHuman,
        };
      });
      setAttackResult({
        attackType,
        pct: attackPct,
        originalText: attackText,
        attackedText,
        qualityBefore,
        qualityAfter,
        beforeOverallAi: before.overallAiProbability,
        afterOverallAi: after.overallAiProbability,
        avgAiDrop: Number((before.overallAiProbability - after.overallAiProbability).toFixed(4)),
        previouslyFlagged: flagged,
        evadedCount: evaded,
        asr: flagged > 0 ? Number((evaded / flagged).toFixed(4)) : 0,
        comparison,
      });
    } finally {
      setIsAttacking(false);
    }
  };

  const handleRunBenchmark = async () => {
    setIsBenchmarking(true);
    setBenchError(null);
    try {
      const parsed = parseClientSamples(customDatasetRaw);
      const samplesPayload = parsed.length >= 2 ? parsed : MGT_SAMPLE_BENCHMARK_DATASET;
      const resp = await fetch('/api/mgt-eval/benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          samples: samplesPayload,
          detectorKey: benchDetector,
          threshold: benchThreshold,
          fitPlattCalibration: benchFitPlatt,
        }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData?.error || `HTTP ${resp.status}`);
      }
      const data: MgtBenchmarkReport = await resp.json();
      setBenchReport(data);
      if (data.plattParams) setSavedPlatt(data.plattParams);
      refreshCatalogAndStats();
    } catch (err: any) {
      try {
        const parsed = parseClientSamples(customDatasetRaw);
        const dataset = parsed.length >= 2 ? parsed : MGT_SAMPLE_BENCHMARK_DATASET;
        const rep = evaluateMgtBenchmark(dataset, benchDetector, {
          threshold: benchThreshold,
          fitPlattCalibration: benchFitPlatt,
        });
        setBenchReport(rep);
        if (rep.plattParams) setSavedPlatt(rep.plattParams);
      } catch (e2: any) {
        setBenchError(err?.message || e2?.message || 'Ошибка расчёта бенчмарка');
      }
    } finally {
      setIsBenchmarking(false);
    }
  };

  const handleRunCalibration = async () => {
    setIsCalibrating(true);
    setCalError(null);
    setCalSuccessMsg(null);
    try {
      const parsed = parseClientSamples(customDatasetRaw);
      const dataset = parsed.length >= 4 ? parsed : MGT_SAMPLE_BENCHMARK_DATASET;
      const resp = await fetch('/api/mgt-eval/calibrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          samples: dataset,
          detectorKey: calDetector,
        }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData?.error || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      if (data?.params) {
        setSavedPlatt(data.params);
        setUsePlatt(true);
        setCalSuccessMsg(`Platt-калибратор IRLS обучен по ${data.sampleCount} образцам (${calDetector}) и активирован для детекции!`);
      }
      refreshCatalogAndStats();
    } catch {
      try {
        const parsed = parseClientSamples(customDatasetRaw);
        const dataset = parsed.length >= 4 ? parsed : MGT_SAMPLE_BENCHMARK_DATASET;
        const scores = dataset.map(
          (s) => runMgtEvalDetection(s.text, { detectorKeys: [calDetector] }).results[0]?.aiProbability ?? 0.5
        );
        const labels = dataset.map((s) => (s.label > 0.5 ? 1 : 0));
        const params = fitPlatt(scores, labels);
        setSavedPlatt(params);
        setUsePlatt(true);
        setCalSuccessMsg(`Platt-калибратор обучен локально (${calDetector}) и активирован!`);
      } catch (e2: any) {
        setCalError(e2?.message || 'Ошибка калибровки Platt Scaling');
      }
    } finally {
      setIsCalibrating(false);
    }
  };

  const handleUploadDatasetFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCustomDatasetRaw(text);
    e.target.value = '';
  };

  const handleCopyDetectSummary = async () => {
    if (!detectReport) return;
    const summary = [
      `=== MGT-Eval (Liyuuuu111/MGT-Eval) Report ===`,
      `Overall Verdict: ${detectReport.overallVerdict}`,
      `Mean P(AI): ${(detectReport.overallAiProbability * 100).toFixed(1)}% | Mean P(Human): ${(detectReport.overallHumanProbability * 100).toFixed(1)}%`,
      `Flagged: ${detectReport.flaggedCount}/${detectReport.totalRun} | Words: ${detectReport.wordCount} | Burstiness: ${detectReport.burstiness}`,
      `GLTR Bins: Top-10=${detectReport.gltrBins.top10}%, Top-100=${detectReport.gltrBins.top100}%, Top-1000=${detectReport.gltrBins.top1000}%, Tail=${detectReport.gltrBins.tail}%`,
      '',
      ...detectReport.results.map(
        (r) => `- ${r.name} [${r.type}]: P(AI)=${(r.aiProbability * 100).toFixed(1)}% (${r.prediction.toUpperCase()}) | ${r.details}`
      ),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(summary);
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2000);
    } catch {
      // clipboard unavailable
    }
  };

  const handleDownloadJson = (payload: any, filename: string) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const filteredCatalog = useMemo(() => {
    return MGT_DETECTORS_CATALOG.filter((d) => {
      if (catalogFilter !== 'All' && d.type !== catalogFilter) return false;
      if (catalogSearch.trim()) {
        const q = catalogSearch.toLowerCase();
        return (
          d.name.toLowerCase().includes(q) ||
          d.key.toLowerCase().includes(q) ||
          d.paper.toLowerCase().includes(q) ||
          d.venue.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [catalogFilter, catalogSearch]);

  // SVG ROC / PR Curve helpers
  const buildSvgPath = (points: Array<{ x: number; y: number }>, width: number, height: number, pad: number) => {
    if (!points.length) return '';
    return points
      .map((pt, idx) => {
        const px = pad + pt.x * (width - pad * 2);
        const py = height - pad - pt.y * (height - pad * 2);
        return `${idx === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`;
      })
      .join(' ');
  };

  const rocPath = useMemo(() => {
    if (!benchReport) return '';
    return buildSvgPath(
      benchReport.metrics.rocCurve.map((p) => ({ x: p.fpr, y: p.tpr })),
      260,
      200,
      24
    );
  }, [benchReport]);

  const prPath = useMemo(() => {
    if (!benchReport) return '';
    return buildSvgPath(
      benchReport.metrics.prCurve.map((p) => ({ x: p.recall, y: p.precision })),
      260,
      200,
      24
    );
  }, [benchReport]);

  const subTabBtn = (id: MgtSubTab, label: string, Icon: React.ComponentType<{ className?: string }>) => {
    const active = subTab === id;
    return (
      <button
        type="button"
        onClick={() => setSubTab(id)}
        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
          active
            ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white border-indigo-500 shadow-lg'
            : 'bg-slate-900/90 text-slate-300 hover:text-white border-slate-800 hover:border-slate-700'
        }`}
      >
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </button>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/60 to-purple-950/50 border border-indigo-800/60 rounded-2xl p-5 shadow-2xl space-y-4">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-start gap-3.5">
            {onBack && !embedded && (
              <button
                type="button"
                onClick={onBack}
                className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" />
                Назад
              </button>
            )}
            <div className="p-3 rounded-2xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shrink-0">
              <FlaskConical className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg lg:text-xl font-black text-white tracking-tight">
                  MGT-Eval — Полная исследовательская платформа (26 моделей + ASR + Platt Scaling)
                </h2>
                <a
                  href="https://github.com/Liyuuuu111/MGT-Eval"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-slate-900 text-indigo-300 hover:text-white border border-indigo-700/60 text-[11px] font-mono"
                >
                  Liyuuuu111/MGT-Eval <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed max-w-4xl">
                Полный порт фреймворка <strong>MGT-Eval</strong>: 16 Metric-based детекторов (включая точный{' '}
                <code className="text-emerald-300">fastMDE</code> для LASTDE/LASTDE++, Binoculars, LRR, NPR, TOCSIN, RAIDAR,
                DNA-DetectLLM), 10 Fine-tuned классификаторов (CoCo, DeTeCtive, GREATER, ImBD, MPU, PECOLA, RADAR, TASTE),{' '}
                <strong>IRLS Platt Scaling</strong>, бенчмарк с <strong>AUROC/AUPRC/ROC/PR</strong> и 14 атак с{' '}
                <strong>VIPER ECES</strong> и расчётом <strong>ASR</strong>.
              </p>
            </div>
          </div>

          {stats && (
            <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono">
              <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
                Сканов: <strong className="text-indigo-300">{stats.totalDetections}</strong>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
                Атак/ASR: <strong className="text-rose-300">{stats.totalAttacks}</strong>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
                Бенчмарков: <strong className="text-emerald-300">{stats.totalBenchmarks}</strong>
              </span>
            </div>
          )}
        </div>

        {/* Sub-tab Navigation */}
        <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-800/80">
          {subTabBtn('detect', 'Детекция (26 моделей)', Play)}
          {subTabBtn('attack', 'Атаки & ASR (14 + VIPER)', Swords)}
          {subTabBtn('benchmark', 'Бенчмарк (AUROC / ROC)', BarChart3)}
          {subTabBtn('calibrate', 'Калибровка Platt Scaling', Sliders)}
          {subTabBtn('catalog', 'Каталог 26 моделей', BookOpen)}
        </div>
      </div>

      {/* ===================== SUB-TAB 1: DETECT (26 MODELS) ===================== */}
      {subTab === 'detect' && (
        <div className="space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            {/* Quick Load Source Buttons */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <span className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-400" />
                Текст для проверки всеми 26 детекторами MGT-Eval
              </span>
              <div className="flex items-center gap-2 flex-wrap text-xs">
                {currentDnaResult && (
                  <button
                    type="button"
                    onClick={() => setInputText(currentDnaResult)}
                    className="px-2.5 py-1 rounded-lg bg-emerald-950/70 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/60 font-semibold cursor-pointer"
                  >
                    🟢 Результат ДНК V5
                  </button>
                )}
                {currentContentText && (
                  <button
                    type="button"
                    onClick={() => setInputText(currentContentText)}
                    className="px-2.5 py-1 rounded-lg bg-purple-950/70 hover:bg-purple-900 text-purple-300 border border-purple-700/60 font-semibold cursor-pointer"
                  >
                    🟣 Текст 2 (ИИ-материал)
                  </button>
                )}
                {currentDonorText && (
                  <button
                    type="button"
                    onClick={() => setInputText(currentDonorText)}
                    className="px-2.5 py-1 rounded-lg bg-blue-950/70 hover:bg-blue-900 text-blue-300 border border-blue-700/60 font-semibold cursor-pointer"
                  >
                    🔵 Текст 1 (Автор-Донор)
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setInputText(SAMPLE_MGT_AI_TEXT)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
                >
                  Образец MGT-Eval (RU+EN)
                </button>
              </div>
            </div>

            <textarea
              rows={6}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Вставьте любой текст (минимум 10 символов) для анализа по 26 детекторам MGT-Eval..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs lg:text-sm text-slate-200 font-mono leading-relaxed focus:outline-none focus:border-indigo-500 resize-y"
            />

            {/* Controls Row: Threshold, Platt, Optional Remote Python Server */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-950/70 p-4 rounded-xl border border-slate-800/80 text-xs">
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-300 font-semibold">Порог решения P(AI):</span>
                  <span className="font-mono font-bold text-indigo-300">{threshold.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={0.9}
                  step={0.05}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
                <p className="text-[10px] text-slate-400">Если P(AI) ≥ порога → детектор ставит метку AI.</p>
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-200">
                  <input
                    type="checkbox"
                    checked={usePlatt}
                    disabled={!savedPlatt}
                    onChange={(e) => setUsePlatt(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 bg-slate-800 border-slate-700 cursor-pointer"
                  />
                  <span>Применять Platt Scaling (IRLS)</span>
                </label>
                <p className="text-[10px] text-slate-400">
                  {savedPlatt
                    ? `Активен калибратор (β₀=${savedPlatt.beta0}, β₁=${savedPlatt.beta1}, n=${savedPlatt.num_samples}).`
                    : 'Сначала обучите Platt-калибратор во вкладке «Калибровка» или «Бенчмарк».'}
                </p>
              </div>

              <div className="space-y-1.5">
                <span className="text-slate-300 font-semibold block">Внешний Python FastAPI MGT-Eval (опционально):</span>
                <input
                  type="text"
                  value={remoteUrl}
                  onChange={(e) => setRemoteUrl(e.target.value)}
                  placeholder="http://localhost:8000"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Detector Presets & Checkboxes */}
            <div className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                <span className="font-bold text-slate-200">
                  Выбрано моделей: <strong className="text-indigo-300">{selectedKeys.length}</strong> /{' '}
                  {MGT_DETECTORS_CATALOG.length}
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setSelectedKeys(MGT_DETECTORS_CATALOG.map((d) => d.key))}
                    className="px-2.5 py-1 rounded-lg bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-800 cursor-pointer"
                  >
                    Все 26
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedKeys(MGT_DETECTORS_CATALOG.filter((d) => d.type === 'Metric-based').map((d) => d.key))}
                    className="px-2.5 py-1 rounded-lg bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 cursor-pointer"
                  >
                    Metric-based (16)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedKeys(MGT_DETECTORS_CATALOG.filter((d) => d.type === 'Fine-tuned').map((d) => d.key))}
                    className="px-2.5 py-1 rounded-lg bg-purple-950 hover:bg-purple-900 text-purple-300 border border-purple-800 cursor-pointer"
                  >
                    Fine-tuned (10)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedKeys(SOTA_ZERO_SHOT_KEYS)}
                    className="px-2.5 py-1 rounded-lg bg-amber-950 hover:bg-amber-900 text-amber-300 border border-amber-800 cursor-pointer"
                  >
                    SOTA Zero-Shot (10)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedKeys([])}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 cursor-pointer"
                  >
                    Сброс
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-44 overflow-y-auto pr-1">
                {MGT_DETECTORS_CATALOG.map((d) => {
                  const checked = selectedKeys.includes(d.key);
                  return (
                    <label
                      key={d.key}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] cursor-pointer transition ${
                        checked
                          ? d.type === 'Metric-based'
                            ? 'bg-emerald-950/50 border-emerald-700/70 text-emerald-200'
                            : 'bg-purple-950/50 border-purple-700/70 text-purple-200'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDetectorKey(d.key)}
                        className="w-3.5 h-3.5 rounded text-indigo-600 bg-slate-800 border-slate-700 shrink-0"
                      />
                      <span className="truncate font-medium">{d.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {detectError && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-700 text-rose-200 text-xs">{detectError}</div>
            )}

            <div className="flex items-center justify-end gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => handleRunDetection()}
                disabled={isDetecting || selectedKeys.length === 0}
                className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-lg"
              >
                <CheckSquare className="h-4 w-4" />
                <span>Запустить выбранные ({selectedKeys.length}/26)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const all = MGT_DETECTORS_CATALOG.map((d) => d.key);
                  setSelectedKeys(all);
                  handleRunDetection(all);
                }}
                disabled={isDetecting}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-xl"
              >
                {isDetecting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                <span>Полный скан (все 26 моделей)</span>
              </button>
            </div>
          </div>

          {/* Detection Report Output */}
          {detectReport && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-4 border-b border-slate-800 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span
                      className={`px-3 py-1 rounded-lg text-xs font-black border ${
                        detectReport.overallAiProbability >= 0.6
                          ? 'bg-rose-950 text-rose-300 border-rose-600/70'
                          : detectReport.overallAiProbability <= 0.4
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-600/70'
                            : 'bg-amber-950 text-amber-300 border-amber-600/70'
                      }`}
                    >
                      {detectReport.overallVerdict}
                    </span>
                    <span className="text-sm font-mono font-bold text-white">
                      Средняя P(AI): {(detectReport.overallAiProbability * 100).toFixed(1)}% · Человек:{' '}
                      {(detectReport.overallHumanProbability * 100).toFixed(1)}%
                    </span>
                    {detectReport.calibrated && (
                      <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-700 text-[10px] font-bold">
                        Platt Calibrated
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    Флагов AI: <strong className="text-slate-200">{detectReport.flaggedCount}</strong> / {detectReport.totalRun}{' '}
                    · Слов: <strong className="text-slate-200">{detectReport.wordCount}</strong> · Burstiness:{' '}
                    <strong className="text-slate-200">{detectReport.burstiness}</strong> · TTR:{' '}
                    <strong className="text-slate-200">{detectReport.ttr}</strong> · Время:{' '}
                    <strong className="text-slate-200">{detectReport.elapsedMs} мс</strong>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyDetectSummary}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedSummary ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedSummary ? 'Скопировано' : 'Копировать отчёт'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadJson(detectReport, `mgteval_detect_${Date.now()}.json`)}
                    className="px-3 py-1.5 rounded-lg bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-700/60 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    JSON
                  </button>
                </div>
              </div>

              {/* GLTR 4-bucket bar */}
              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-300">GLTR Token Rank Distribution (по всем токенам):</span>
                  <span className="font-mono text-slate-400">
                    Top-10: <strong className="text-emerald-400">{detectReport.gltrBins.top10}%</strong> | Top-100:{' '}
                    <strong className="text-amber-400">{detectReport.gltrBins.top100}%</strong> | Top-1000:{' '}
                    <strong className="text-rose-400">{detectReport.gltrBins.top1000}%</strong> | Tail:{' '}
                    <strong className="text-purple-400">{detectReport.gltrBins.tail}%</strong>
                  </span>
                </div>
                <div className="h-2.5 rounded-full overflow-hidden flex bg-slate-800">
                  <div style={{ width: `${detectReport.gltrBins.top10}%` }} className="bg-emerald-500" />
                  <div style={{ width: `${detectReport.gltrBins.top100}%` }} className="bg-amber-400" />
                  <div style={{ width: `${detectReport.gltrBins.top1000}%` }} className="bg-rose-500" />
                  <div style={{ width: `${detectReport.gltrBins.tail}%` }} className="bg-purple-500" />
                </div>
                {detectReport.matchedMarkers.length > 0 && (
                  <div className="text-[11px] text-rose-300 flex items-center gap-1.5 flex-wrap pt-1">
                    <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                    <span>Найдены ИИ-маркеры:</span>
                    {detectReport.matchedMarkers.map((m) => (
                      <span key={m} className="px-1.5 py-0.5 rounded bg-rose-950 border border-rose-800 font-mono text-[10px]">
                        {m}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* 26 Detector Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {detectReport.results.map((r) => {
                  const isAi = r.prediction === 'ai';
                  const pct = Math.round(r.aiProbability * 100);
                  return (
                    <div
                      key={r.key}
                      className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                        isAi
                          ? 'bg-rose-950/20 border-rose-800/60'
                          : 'bg-emerald-950/20 border-emerald-800/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-bold text-white block truncate">{r.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {r.type} · {r.venue}
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] shrink-0 border ${
                            isAi
                              ? 'bg-rose-950 text-rose-300 border-rose-700'
                              : 'bg-emerald-950 text-emerald-300 border-emerald-700'
                          }`}
                        >
                          {isAi ? `AI ${pct}%` : `HUMAN ${100 - pct}%`}
                        </span>
                      </div>

                      <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full transition-all ${isAi ? 'bg-rose-500' : 'bg-emerald-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      <p className="text-[11px] font-mono text-slate-300 truncate" title={r.details}>
                        {r.details}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================== SUB-TAB 2: ATTACKS & ASR ===================== */}
      {subTab === 'attack' && (
        <div className="space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Swords className="h-4 w-4 text-rose-400" />
                Симулятор 14 состязательных атак MGT-Eval + VIPER Homoglyph (ECES) + Расчёт ASR
              </h3>
              <div className="flex items-center gap-2 text-xs">
                {currentContentText && (
                  <button
                    type="button"
                    onClick={() => setAttackText(currentContentText)}
                    className="px-2.5 py-1 rounded-lg bg-purple-950/70 text-purple-300 border border-purple-700/60 cursor-pointer"
                  >
                    🟣 Текст 2 (ИИ)
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setAttackText(SAMPLE_MGT_AI_TEXT)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 cursor-pointer"
                >
                  Образец AI
                </button>
              </div>
            </div>

            <textarea
              rows={5}
              value={attackText}
              onChange={(e) => setAttackText(e.target.value)}
              placeholder="Введите исходный ИИ-текст для тестирования устойчивости 26 детекторов..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs text-slate-200 font-mono focus:outline-none focus:border-rose-500 resize-y"
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-950/70 p-4 rounded-xl border border-slate-800 text-xs">
              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">Тип атаки (из MGT-Eval):</label>
                <select
                  value={attackType}
                  onChange={(e) => setAttackType(e.target.value as MgtAttackType)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200"
                >
                  {MGT_ATTACK_CATALOG.map((a) => (
                    <option key={a.type} value={a.type}>
                      [{a.category}] {a.name}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400">
                  {MGT_ATTACK_CATALOG.find((a) => a.type === attackType)?.description}
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-300 font-semibold">Интенсивность возмущения (pct):</span>
                  <span className="font-mono font-bold text-rose-300">{Math.round(attackPct * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.05}
                  max={0.6}
                  step={0.05}
                  value={attackPct}
                  onChange={(e) => setAttackPct(Number(e.target.value))}
                  className="w-full accent-rose-500 cursor-pointer"
                />
                <p className="text-[10px] text-slate-400">Доля модифицируемых слов / токенов в тексте.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">Seed (детерминизм):</label>
                <input
                  type="number"
                  value={attackSeed}
                  onChange={(e) => setAttackSeed(Number(e.target.value) || 42)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono"
                />
              </div>
            </div>

            {attackError && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-700 text-rose-200 text-xs">{attackError}</div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleRunAttack}
                disabled={isAttacking}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-xl"
              >
                {isAttacking ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" />}
                <span>Применить атаку и измерить ASR по 26 детекторам</span>
              </button>
            </div>
          </div>

          {attackResult && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
              {/* Top ASR Summary Metrics */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="bg-rose-950/40 border border-rose-700/60 p-3.5 rounded-xl">
                  <div className="text-slate-400 font-semibold">Attack Success Rate (ASR)</div>
                  <div className="text-2xl font-mono font-black text-rose-300 mt-1">
                    {(attackResult.asr * 100).toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Обошло: {attackResult.evadedCount} из {attackResult.previouslyFlagged} сработавших
                  </div>
                </div>

                <div className="bg-amber-950/40 border border-amber-700/60 p-3.5 rounded-xl">
                  <div className="text-slate-400 font-semibold flex items-center gap-1">
                    <TrendingDown className="h-3.5 w-3.5 text-amber-400" /> Снижение P(AI)
                  </div>
                  <div className="text-2xl font-mono font-black text-amber-300 mt-1">
                    -{(attackResult.avgAiDrop * 100).toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {(attackResult.beforeOverallAi * 100).toFixed(1)}% → {(attackResult.afterOverallAi * 100).toFixed(1)}%
                  </div>
                </div>

                <div className="bg-emerald-950/40 border border-emerald-700/60 p-3.5 rounded-xl">
                  <div className="text-slate-400 font-semibold">Semantic Similarity (Jaccard)</div>
                  <div className="text-2xl font-mono font-black text-emerald-300 mt-1">
                    {((attackResult.qualityAfter.semanticSimilarity ?? 1) * 100).toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    TTR: {attackResult.qualityBefore.ttr} → {attackResult.qualityAfter.ttr}
                  </div>
                </div>

                <div className="bg-indigo-950/40 border border-indigo-700/60 p-3.5 rounded-xl">
                  <div className="text-slate-400 font-semibold">Flesch Reading Ease</div>
                  <div className="text-2xl font-mono font-black text-indigo-300 mt-1">
                    {attackResult.qualityAfter.fleschReadingEase}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    FK Grade: {attackResult.qualityAfter.fleschKincaidGrade}
                  </div>
                </div>
              </div>

              {/* Side-by-side Original vs Attacked Text */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <span className="font-bold text-slate-300 block">До атаки (Исходник):</span>
                  <div className="text-slate-400 font-mono leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {attackResult.originalText}
                  </div>
                </div>
                <div className="bg-slate-950 p-4 rounded-xl border border-rose-800/60 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-rose-300">После атаки ({attackResult.attackType}):</span>
                    <button
                      type="button"
                      onClick={() => setInputText(attackResult.attackedText)}
                      className="text-[11px] px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-700 cursor-pointer"
                    >
                      Отправить во вкладку Детекции →
                    </button>
                  </div>
                  <div className="text-slate-200 font-mono leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {attackResult.attackedText}
                  </div>
                </div>
              </div>

              {/* Per-detector Delta Table */}
              <div className="overflow-x-auto max-h-80 overflow-y-auto border border-slate-800 rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] sticky top-0">
                    <tr>
                      <th className="px-3 py-2">Детектор</th>
                      <th className="px-3 py-2">До атаки P(AI)</th>
                      <th className="px-3 py-2">После атаки P(AI)</th>
                      <th className="px-3 py-2">Сдвиг Δ</th>
                      <th className="px-3 py-2">Исход</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 bg-slate-900/40 font-mono">
                    {attackResult.comparison.map((row) => (
                      <tr key={row.key}>
                        <td className="px-3 py-2 font-sans font-semibold text-white">{row.name}</td>
                        <td className="px-3 py-2 text-rose-300">{(row.beforeAiProb * 100).toFixed(1)}%</td>
                        <td className="px-3 py-2 text-slate-200">{(row.afterAiProb * 100).toFixed(1)}%</td>
                        <td className={`px-3 py-2 ${row.deltaAiProb < 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {row.deltaAiProb >= 0 ? '+' : ''}
                          {(row.deltaAiProb * 100).toFixed(1)}%
                        </td>
                        <td className="px-3 py-2 font-sans">
                          {row.flippedToHuman ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700 text-[10px] font-bold">
                              ОБОШЁЛ (AI → Human)
                            </span>
                          ) : row.afterPrediction === 'ai' ? (
                            <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 text-[10px]">
                              Обнаружен (AI)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">Human изначально</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================== SUB-TAB 3: BENCHMARK (AUROC / ROC) ===================== */}
      {subTab === 'benchmark' && (
        <div className="space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-emerald-400" />
                Оценка на размеченном датасете (AUROC, AUPRC, TPR@FPR 1%/5%/10%, ROC & PR Curves)
              </h3>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer border border-slate-700">
                <Upload className="h-3.5 w-3.5" />
                <span>Загрузить JSONL / CSV</span>
                <input type="file" accept=".jsonl,.json,.csv,.tsv,.txt" onChange={handleUploadDatasetFile} className="hidden" />
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-950/70 p-4 rounded-xl border border-slate-800 text-xs">
              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">Оцениваемый детектор:</label>
                <select
                  value={benchDetector}
                  onChange={(e) => setBenchDetector(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200"
                >
                  {MGT_DETECTORS_CATALOG.map((d) => (
                    <option key={d.key} value={d.key}>
                      {d.name} ({d.type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-300 font-semibold">Порог отсечения:</span>
                  <span className="font-mono font-bold text-emerald-300">{benchThreshold.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={0.9}
                  step={0.05}
                  value={benchThreshold}
                  onChange={(e) => setBenchThreshold(Number(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
              </div>

              <div className="space-y-1.5 flex flex-col justify-center">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-200">
                  <input
                    type="checkbox"
                    checked={benchFitPlatt}
                    onChange={(e) => setBenchFitPlatt(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 bg-slate-800 border-slate-700"
                  />
                  <span>Включить калибровку Platt Scaling (IRLS)</span>
                </label>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Размеченный корпус (JSONL {"{label:0|1, text, group}"} или CSV/TSV):</span>
                <button
                  type="button"
                  onClick={() => setCustomDatasetRaw(MGT_SAMPLE_BENCHMARK_DATASET.map((s) => JSON.stringify(s)).join('\n'))}
                  className="text-indigo-400 hover:underline cursor-pointer"
                >
                  Сбросить на встроенный RU+EN датасет (8 шт.)
                </button>
              </div>
              <textarea
                rows={5}
                value={customDatasetRaw}
                onChange={(e) => setCustomDatasetRaw(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-[11px] font-mono text-slate-300 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {benchError && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-700 text-rose-200 text-xs">{benchError}</div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleRunBenchmark}
                disabled={isBenchmarking}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-xl"
              >
                {isBenchmarking ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
                <span>Запустить бенчмарк MGT-Eval</span>
              </button>
            </div>
          </div>

          {benchReport && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="text-slate-400">AUROC</div>
                  <div className="text-xl font-mono font-black text-emerald-400">{benchReport.metrics.auroc}</div>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="text-slate-400">AUPRC</div>
                  <div className="text-xl font-mono font-black text-teal-400">{benchReport.metrics.auprc}</div>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="text-slate-400">Accuracy</div>
                  <div className="text-xl font-mono font-black text-white">
                    {(benchReport.metrics.accuracy * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="text-slate-400">F1 Score</div>
                  <div className="text-xl font-mono font-black text-indigo-300">{benchReport.metrics.f1}</div>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="text-slate-400">TPR@FPR 5%</div>
                  <div className="text-xl font-mono font-black text-amber-300">{benchReport.metrics.tprAtFpr5}</div>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="text-slate-400">TPR@FPR 1%</div>
                  <div className="text-xl font-mono font-black text-purple-300">{benchReport.metrics.tprAtFpr1}</div>
                </div>
              </div>

              {/* ROC Curve, PR Curve & Confusion Matrix */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="text-xs font-bold text-slate-300">ROC Curve (AUROC = {benchReport.metrics.auroc})</div>
                  <svg viewBox="0 0 260 200" className="w-full h-44 bg-slate-900/60 rounded-lg border border-slate-800">
                    <line x1="24" y1="176" x2="236" y2="24" stroke="#475569" strokeDasharray="4 4" strokeWidth="1" />
                    <path d={rocPath} fill="none" stroke="#10b981" strokeWidth="2.5" />
                    <text x="130" y="194" textAnchor="middle" fill="#94a3b8" fontSize="9">
                      False Positive Rate
                    </text>
                    <text x="10" y="100" textAnchor="middle" fill="#94a3b8" fontSize="9" transform="rotate(-90 10 100)">
                      TPR
                    </text>
                  </svg>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="text-xs font-bold text-slate-300">PR Curve (AUPRC = {benchReport.metrics.auprc})</div>
                  <svg viewBox="0 0 260 200" className="w-full h-44 bg-slate-900/60 rounded-lg border border-slate-800">
                    <path d={prPath} fill="none" stroke="#6366f1" strokeWidth="2.5" />
                    <text x="130" y="194" textAnchor="middle" fill="#94a3b8" fontSize="9">
                      Recall
                    </text>
                    <text x="10" y="100" textAnchor="middle" fill="#94a3b8" fontSize="9" transform="rotate(-90 10 100)">
                      Precision
                    </text>
                  </svg>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3 text-xs">
                  <div className="font-bold text-slate-300">Confusion Matrix (2×2)</div>
                  <div className="grid grid-cols-2 gap-2 text-center font-mono">
                    <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-700/60">
                      <div className="text-[10px] text-emerald-400">True Human (TN)</div>
                      <div className="text-xl font-black text-white">{benchReport.metrics.confusion.tn}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800/60">
                      <div className="text-[10px] text-rose-400">False Positive (FP)</div>
                      <div className="text-xl font-black text-white">{benchReport.metrics.confusion.fp}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-amber-950/50 border border-amber-800/60">
                      <div className="text-[10px] text-amber-400">False Negative (FN)</div>
                      <div className="text-xl font-black text-white">{benchReport.metrics.confusion.fn}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-indigo-950/60 border border-indigo-700/60">
                      <div className="text-[10px] text-indigo-400">True AI (TP)</div>
                      <div className="text-xl font-black text-white">{benchReport.metrics.confusion.tp}</div>
                    </div>
                  </div>
                  {benchReport.calibratedMetrics && (
                    <div className="text-[11px] text-indigo-300 pt-1 border-t border-slate-800">
                      После Platt Calibration: Acc={(benchReport.calibratedMetrics.accuracy * 100).toFixed(1)}%, F1=
                      {benchReport.calibratedMetrics.f1}
                    </div>
                  )}
                </div>
              </div>

              {/* Predictions Table */}
              <div className="overflow-x-auto max-h-64 overflow-y-auto border border-slate-800 rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] sticky top-0">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Группа</th>
                      <th className="px-3 py-2">Истина</th>
                      <th className="px-3 py-2">Score P(AI)</th>
                      <th className="px-3 py-2">Калибровка</th>
                      <th className="px-3 py-2">Фрагмент текста</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-900/40 font-mono">
                    {benchReport.predictions.map((p) => (
                      <tr key={p.index}>
                        <td className="px-3 py-2 text-slate-400">{p.index + 1}</td>
                        <td className="px-3 py-2 font-sans text-slate-300">{p.group}</td>
                        <td className="px-3 py-2">
                          <span className={p.label === 1 ? 'text-rose-300' : 'text-emerald-300'}>
                            {p.label === 1 ? 'AI (1)' : 'Human (0)'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-white">{(p.score * 100).toFixed(1)}%</td>
                        <td className="px-3 py-2 text-indigo-300">
                          {typeof p.calibratedScore === 'number' ? `${(p.calibratedScore * 100).toFixed(1)}%` : '—'}
                        </td>
                        <td className="px-3 py-2 font-sans text-slate-300 truncate max-w-md">{p.excerpt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================== SUB-TAB 4: PLATT CALIBRATION ===================== */}
      {subTab === 'calibrate' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sliders className="h-4 w-4 text-indigo-400" />
              Калибровка вероятностей Platt Scaling (IRLS Newton-Raphson из src/calibration/platt.py)
            </h3>
            <p className="text-xs text-slate-400">
              Обучает логистическую калибровку P(AI|s) = σ(β₀ + β₁·(s − μ)/σ) с L2-регуляризацией на размеченном корпусе и
              сохраняет параметры для автоматического применения во вкладке Детекции.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5">
              <label className="text-slate-300 font-semibold block">Базовый детектор для калибровки:</label>
              <select
                value={calDetector}
                onChange={(e) => setCalDetector(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200"
              >
                {MGT_DETECTORS_CATALOG.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.name} ({d.type})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleRunCalibration}
                disabled={isCalibrating}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-lg"
              >
                {isCalibrating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sliders className="h-4 w-4" />}
                <span>Обучить Platt Scaling (IRLS) и активировать</span>
              </button>
            </div>
          </div>

          {calError && <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-700 text-rose-200 text-xs">{calError}</div>}
          {calSuccessMsg && (
            <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-700 text-emerald-200 text-xs">
              {calSuccessMsg}
            </div>
          )}

          {savedPlatt ? (
            <div className="bg-slate-950 border border-indigo-800/60 rounded-xl p-4 space-y-3 text-xs">
              <div className="font-bold text-indigo-300">Текущие параметры обученного калибратора Platt Scaling:</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono">
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-400">beta0 (β₀)</div>
                  <div className="text-white font-bold">{savedPlatt.beta0}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-400">beta1 (β₁)</div>
                  <div className="text-white font-bold">{savedPlatt.beta1}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-400">mean (μ)</div>
                  <div className="text-emerald-300 font-bold">{savedPlatt.mean}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-400">std (σ)</div>
                  <div className="text-emerald-300 font-bold">{savedPlatt.std}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-400">p=0.5 порог</div>
                  <div className="text-amber-300 font-bold">{savedPlatt.threshold_raw_p05}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-400">Образцов (n)</div>
                  <div className="text-indigo-300 font-bold">{savedPlatt.num_samples}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
              Калибратор ещё не обучен в этой сессии. Нажмите кнопку выше, чтобы выполнить IRLS-подгонку логистической кривой.
            </div>
          )}
        </div>
      )}

      {/* ===================== SUB-TAB 5: 26-MODEL CATALOG ===================== */}
      {subTab === 'catalog' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 text-xs">
              {(['All', 'Metric-based', 'Fine-tuned'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCatalogFilter(cat)}
                  className={`px-3 py-1.5 rounded-lg font-bold border cursor-pointer ${
                    catalogFilter === cat
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : 'bg-slate-950 text-slate-300 border-slate-800 hover:text-white'
                  }`}
                >
                  {cat === 'All' ? `Все (${MGT_DETECTORS_CATALOG.length})` : cat === 'Metric-based' ? 'Metric-based (16)' : 'Fine-tuned (10)'}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              placeholder="Поиск по названию, статье или конференции (ICLR, ICML, EMNLP)..."
              className="w-full sm:w-80 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredCatalog.map((d) => (
              <div key={d.key} className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">{d.name}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                          d.type === 'Metric-based'
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                            : 'bg-purple-950 text-purple-300 border-purple-800'
                        }`}
                      >
                        {d.type}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {d.venue} · {d.authors}
                    </div>
                  </div>
                  {d.link && (
                    <a
                      href={d.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:text-white p-1 rounded bg-slate-900 border border-slate-800"
                      title="Открыть научную статью"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>

                <p className="text-slate-300 leading-relaxed">{d.description}</p>
                <div className="bg-slate-900 p-2 rounded-lg border border-slate-800 font-mono text-[11px] text-emerald-300 overflow-x-auto">
                  {d.formula}
                </div>
                <div className="text-[10.5px] text-slate-400 italic truncate" title={d.paper}>
                  Paper: {d.paper}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
