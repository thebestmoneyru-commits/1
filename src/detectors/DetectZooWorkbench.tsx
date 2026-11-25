/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState, useEffect } from 'react';
import {
  Activity,
  BarChart3,
  Check,
  CheckSquare,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileText,
  Filter,
  FlaskConical,
  Layers,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  Sliders,
  Sparkles,
  Square,
  Terminal,
  Upload,
} from 'lucide-react';
import {
  DETECTZOO_BUILTIN_CORPUS,
  DETECTZOO_DATASETS,
  DETECTZOO_FULL_ZOO_CATALOG,
  DETECTZOO_MULTIMODAL_DETECTORS,
  DETECTZOO_TEXT_DETECTORS,
  resolveDetectZooDataset,
  resolveDetectZooDetector,
  runDetectZooBenchmark,
  runDetectZooTextSuite,
  type DetectZooBenchmarkReport,
  type DetectZooModality,
  type DetectZooSample,
  type DetectZooSuiteReport,
  type DetectZooTextFamily,
} from '../../shared/detectZooCore';

interface DetectZooWorkbenchProps {
  embedded?: boolean;
  currentDnaResult?: string;
  currentContentText?: string;
  currentDonorText?: string;
  initialText?: string;
  onApplyScoreToMain?: (humanScore: number, aiScore: number, rawMetric: string) => void;
}

type ZooTab = 'detect' | 'benchmark' | 'inspectors' | 'registry';

const TEXT_FAMILIES: Array<{ id: 'all' | DetectZooTextFamily; label: string }> = [
  { id: 'all', label: 'Все 37' },
  { id: 'Zero-Shot Metric', label: 'Zero-Shot Metric' },
  { id: 'Perturbation & Rewrite', label: 'Perturbation & Rewrite' },
  { id: 'Intrinsic & Manifold', label: 'Intrinsic & Manifold' },
  { id: 'OOD & Energy', label: 'OOD & Energy' },
  { id: 'Supervised & Reward', label: 'Supervised & Reward' },
];

const CURVE_COLORS = ['#34d399', '#38bdf8', '#f472b6', '#fbbf24', '#a78bfa', '#fb7185'];

export function DetectZooWorkbench({
  embedded = false,
  initialText = '',
  onApplyScoreToMain,
  currentDnaResult = '',
  currentContentText = '',
  currentDonorText = '',
}: DetectZooWorkbenchProps) {
  const [activeTab, setActiveTab] = useState<ZooTab>('detect');

  // Input state
  const [inputText, setInputText] = useState<string>(() => {
    return (
      initialText ||
      currentDnaResult ||
      currentContentText ||
      DETECTZOO_BUILTIN_CORPUS[0].text
    );
  });

  // Tab 1: Detection Suite state
  const [familyFilter, setFamilyFilter] = useState<'all' | DetectZooTextFamily>('all');
  const [selectedNames, setSelectedNames] = useState<string[]>(() =>
    DETECTZOO_TEXT_DETECTORS.map((d) => d.registryName)
  );
  const [useCustomThr, setUseCustomThr] = useState<boolean>(false);
  const [customThreshold, setCustomThreshold] = useState<number>(0.5);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [suiteReport, setSuiteReport] = useState<DetectZooSuiteReport | null>(() =>
    runDetectZooTextSuite(currentDnaResult || currentContentText || DETECTZOO_BUILTIN_CORPUS[0].text)
  );
  const [resultSort, setResultSort] = useState<'aiDesc' | 'confDesc' | 'nameAsc'>('aiDesc');
  const [copiedReport, setCopiedReport] = useState<boolean>(false);

  // Alias lookup bar (load_detector / load_dataset)
  const [aliasQuery, setAliasQuery] = useState<string>('adadetectgpt');
  const [aliasResult, setAliasResult] = useState<{
    found: boolean;
    detector: ReturnType<typeof resolveDetectZooDetector> | null;
    dataset: ReturnType<typeof resolveDetectZooDataset> | null;
  } | null>(() => ({
    found: true,
    detector: resolveDetectZooDetector('adadetectgpt') || null,
    dataset: null,
  }));

  // Tab 2: BenchmarkEvaluator state
  const [benchDataset, setBenchDataset] = useState<string>('all');
  const [benchThreshold, setBenchThreshold] = useState<number>(0.5);
  const [benchDetectors, setBenchDetectors] = useState<string[]>([
    'adadetectgpt',
    'binoculars',
    'biscope',
    'fast_detectgpt',
    'gecscore',
    'glimpse',
    'phd',
    'mle_ide',
    'energy_detector',
    'dsvdd',
    'text_fluoroscopy',
    'remodetect',
    'radar',
    'lastde_pp',
  ]);
  const [customSamplesRaw, setCustomSamplesRaw] = useState<string>('');
  const [isBenching, setIsBenching] = useState<boolean>(false);
  const [benchReport, setBenchReport] = useState<DetectZooBenchmarkReport | null>(() =>
    runDetectZooBenchmark({
      detectorNames: [
        'adadetectgpt',
        'binoculars',
        'biscope',
        'fast_detectgpt',
        'gecscore',
        'glimpse',
        'phd',
        'mle_ide',
        'energy_detector',
        'dsvdd',
        'text_fluoroscopy',
        'remodetect',
        'radar',
        'lastde_pp',
      ],
    })
  );

  // Tab 4: Registry Explorer state
  const [registryView, setRegistryView] = useState<DetectZooModality | 'datasets'>('text');
  const [registrySearch, setRegistrySearch] = useState<string>('');

  useEffect(() => {
    if (currentDnaResult && currentDnaResult.length > 20) {
      setInputText(currentDnaResult);
    }
  }, [currentDnaResult]);

  useEffect(() => {
    if (initialText.trim()) setInputText(initialText);
  }, [initialText]);

  useEffect(() => {
    if (!suiteReport || !onApplyScoreToMain) return;
    const humanScore = Number((suiteReport.overallHumanProbability * 100).toFixed(1));
    const aiScore = Number((suiteReport.overallAiProbability * 100).toFixed(1));
    onApplyScoreToMain(humanScore, aiScore, `${aiScore}% P(AI) · ${suiteReport.flaggedCount}/${suiteReport.totalRun}`);
  }, [suiteReport]);

  const filteredTextCatalog = useMemo(() => {
    return familyFilter === 'all'
      ? DETECTZOO_TEXT_DETECTORS
      : DETECTZOO_TEXT_DETECTORS.filter((d) => d.family === familyFilter);
  }, [familyFilter]);

  const toggleDetector = (name: string) => {
    setSelectedNames((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]
    );
  };

  const handleAliasLookup = async (qRaw?: string) => {
    const q = (qRaw ?? aliasQuery).trim();
    if (!q) return;
    try {
      const resp = await fetch('/api/detectzoo/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setAliasResult({
          found: Boolean(data.found),
          detector: data.detector || null,
          dataset: data.dataset || null,
        });
        return;
      }
    } catch {
      // local fallback
    }
    const det = resolveDetectZooDetector(q) || null;
    const ds = resolveDetectZooDataset(q) || null;
    setAliasResult({ found: Boolean(det || ds), detector: det, dataset: ds });
  };

  const handleRunSuite = async (namesOverride?: string[], modeOverride?: 'full' | 'selected' | 'fast') => {
    const clean = inputText.trim();
    if (clean.length < 10) return;
    setIsRunning(true);
    const names = namesOverride ?? (selectedNames.length > 0 ? selectedNames : undefined);
    const thr = useCustomThr ? customThreshold : undefined;
    try {
      const resp = await fetch('/api/detectzoo/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: clean,
          detectorNames: names,
          thresholdOverride: thr,
          mode: modeOverride || (names && names.length < 37 ? 'selected' : 'full'),
        }),
      });
      if (resp.ok) {
        const data: DetectZooSuiteReport = await resp.json();
        setSuiteReport(data);
        setIsRunning(false);
        return;
      }
    } catch {
      // local fallback
    }
    const local = runDetectZooTextSuite(clean, {
      detectorNames: names,
      thresholdOverride: thr,
      mode: modeOverride,
    });
    setSuiteReport(local);
    setIsRunning(false);
  };

  const parseLocalSamples = (raw: string): DetectZooSample[] | undefined => {
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const parsed: DetectZooSample[] = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l.startsWith('{')) {
        try {
          const obj = JSON.parse(l);
          if (obj && typeof obj.text === 'string' && obj.text.trim()) {
            parsed.push({
              id: obj.id || `u_${i + 1}`,
              text: obj.text.trim(),
              label: Number(obj.label) > 0.5 ? 1 : 0,
              source: obj.source || 'Custom',
              dataset: obj.dataset || 'custom',
            });
          }
          continue;
        } catch {
          // ignore
        }
      }
      const sep = l.includes('\t') ? '\t' : ',';
      const idx = l.indexOf(sep);
      if (idx > 0) {
        const lbl = l.slice(0, idx).trim().toLowerCase();
        const txt = l.slice(idx + 1).trim();
        if (txt) {
          const isAi = lbl === '1' || lbl === 'ai' || lbl === 'machine';
          parsed.push({
            id: `c_${i + 1}`,
            text: txt,
            label: isAi ? 1 : 0,
            source: isAi ? 'AI' : 'Human',
            dataset: 'custom',
          });
        }
      }
    }
    return parsed.length >= 2 ? parsed : undefined;
  };

  const handleRunBenchmark = async () => {
    setIsBenching(true);
    const customSamples = parseLocalSamples(customSamplesRaw);
    try {
      const resp = await fetch('/api/detectzoo/benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          detectorNames: benchDetectors.length > 0 ? benchDetectors : undefined,
          datasetName: benchDataset,
          threshold: benchThreshold,
          samples: customSamples || customSamplesRaw || undefined,
        }),
      });
      if (resp.ok) {
        const data: DetectZooBenchmarkReport = await resp.json();
        setBenchReport(data);
        setIsBenching(false);
        return;
      }
    } catch {
      // local fallback
    }
    const local = runDetectZooBenchmark({
      detectorNames: benchDetectors.length > 0 ? benchDetectors : undefined,
      datasetName: benchDataset,
      threshold: benchThreshold,
      samples: customSamples,
    });
    setBenchReport(local);
    setIsBenching(false);
  };

  const handleBenchmarkFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCustomSamplesRaw(reader.result);
      }
    };
    reader.readAsText(file);
  };

  const sortedResults = useMemo(() => {
    if (!suiteReport) return [];
    const copy = [...suiteReport.results];
    if (resultSort === 'aiDesc') return copy.sort((a, b) => b.aiProbability - a.aiProbability);
    if (resultSort === 'confDesc') return copy.sort((a, b) => b.confidence - a.confidence);
    return copy.sort((a, b) => a.registryName.localeCompare(b.registryName));
  }, [suiteReport, resultSort]);

  const handleCopySuite = () => {
    if (!suiteReport) return;
    const txt =
      `=== DETECTZOO (${suiteReport.totalRun}/37 TEXT DETECTORS) ===\n` +
      `Verdict: ${suiteReport.overallVerdict} | AI=${Math.round(suiteReport.overallAiProbability * 100)}% | Human=${Math.round(suiteReport.overallHumanProbability * 100)}%\n` +
      `Flagged: ${suiteReport.flaggedCount}/${suiteReport.totalRun} | Mean Confidence: ${suiteReport.meanConfidence}\n` +
      `PHD=${suiteReport.specialSignals.phdIntrinsicDim}, MLE=${suiteReport.specialSignals.mleIntrinsicDim}, Energy=${suiteReport.specialSignals.energyScore}, Fluoroscopy KL=${suiteReport.specialSignals.textFluoroscopyMaxKL}\n\n` +
      sortedResults
        .map(
          (r) =>
            `${r.registryName.padEnd(18)} | label=${r.label.toUpperCase()} | score=${r.score} (thr=${r.threshold}) | conf=${r.confidence} | P(AI)=${Math.round(r.aiProbability * 100)}%`
        )
        .join('\n');
    navigator.clipboard.writeText(txt);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2000);
  };

  const handleDownloadJson = (data: unknown, filename: string) => {
    const uri = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 2));
    const a = document.createElement('a');
    a.href = uri;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const filteredRegistryDetectors = useMemo(() => {
    const q = registrySearch.trim().toLowerCase();
    return DETECTZOO_FULL_ZOO_CATALOG.filter((d) => {
      if (registryView !== 'datasets' && d.modality !== registryView) return false;
      if (!q) return true;
      return (
        d.registryName.toLowerCase().includes(q) ||
        d.className.toLowerCase().includes(q) ||
        d.aliases.some((a) => a.toLowerCase().includes(q)) ||
        d.paper.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q)
      );
    });
  }, [registryView, registrySearch]);

  const filteredRegistryDatasets = useMemo(() => {
    const q = registrySearch.trim().toLowerCase();
    return DETECTZOO_DATASETS.filter((ds) => {
      if (!q) return true;
      return (
        ds.registryName.toLowerCase().includes(q) ||
        ds.className.toLowerCase().includes(q) ||
        ds.aliases.some((a) => a.toLowerCase().includes(q)) ||
        ds.domain.toLowerCase().includes(q) ||
        ds.description.toLowerCase().includes(q)
      );
    });
  }, [registrySearch]);

  return (
    <div className={`${embedded ? '' : 'min-h-screen bg-slate-950 p-6'} text-slate-100 space-y-6`}>
      {/* Top Banner */}
      <div className="bg-gradient-to-br from-slate-900 via-amber-950/20 to-slate-900 border border-amber-600/40 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-bold uppercase tracking-wider">
                sadjadeb/DetectZoo
              </span>
              <h2 className="text-xl font-bold text-white tracking-tight">
                DetectZoo — Единый мультимодальный зоопарк детекции (37 Text + 70 Zoo)
              </h2>
            </div>
            <p className="text-xs text-slate-300 max-w-4xl">
              Полная интеграция репозитория DetectZoo: 37 текстовых алгоритмов (AdaDetectGPT, BiScope, GECScore, Glimpse, IPAD, IRM,
              Text Fluoroscopy, ReMoDetect, Lastde++, D-SVDD, HRN, Energy, PHD/MLE IDE, CoCo, DeTeCtive, ImBD, TOCSIN),
              BenchmarkEvaluator с EER / ROC AUC / PR AUC и кросс-модальный реестр (Image 17 · Audio 14 · Video 2 · Datasets 23).
            </p>
          </div>
          <a
            href="https://github.com/sadjadeb/DetectZoo"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-mono border border-slate-700 transition"
          >
            <span>github.com/sadjadeb/DetectZoo</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        {/* Sub-Navigation */}
        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-800/80">
          {[
            { id: 'detect' as ZooTab, label: '🔍 Текст-детекция (37 моделей)', icon: ShieldAlert },
            { id: 'benchmark' as ZooTab, label: '📊 BenchmarkEvaluator (EER · ROC AUC)', icon: BarChart3 },
            { id: 'inspectors' as ZooTab, label: '⚡ Спец-инспекторы (OOD · BiScope · IDE)', icon: FlaskConical },
            { id: 'registry' as ZooTab, label: '🦁 Zoo-реестр (70 моделей · 23 датасета)', icon: Database },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                activeTab === id
                  ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-lg'
                  : 'bg-slate-900/90 text-slate-300 hover:text-white border border-slate-700/80 hover:border-amber-500/40'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ===================== TAB 1: 37 TEXT DETECTORS ===================== */}
      {activeTab === 'detect' && (
        <div className="space-y-5">
          {/* Alias Lookup Bar (registry.py load_detector) */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-amber-300 font-semibold">
              <Terminal className="h-4 w-4" />
              <span>Быстрый резолвер реестра (load_detector / load_dataset по имени или алиасу):</span>
            </div>
            <div className="flex items-center gap-2 flex-1 max-w-xl">
              <input
                type="text"
                value={aliasQuery}
                onChange={(e) => setAliasQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAliasLookup()}
                placeholder="Напр.: adadetectgpt, biscope, chatgpt_roberta, xlsr-sls, raid, chameleon..."
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-amber-500"
              />
              <button
                type="button"
                onClick={() => handleAliasLookup()}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold cursor-pointer"
              >
                Найти
              </button>
            </div>
            {aliasResult && (
              <div className="w-full text-[11px] bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                {aliasResult.detector ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                      {aliasResult.detector.className}
                    </span>
                    <span className="text-slate-300">
                      registry=<code className="text-amber-300">{aliasResult.detector.registryName}</code> · modality=
                      <code className="text-cyan-300">{aliasResult.detector.modality}</code> · thr=
                      <code className="text-white">{aliasResult.detector.defaultThreshold}</code>
                    </span>
                    <span className="text-slate-400">
                      aliases: [{aliasResult.detector.aliases.join(', ') || '—'}]
                    </span>
                  </div>
                ) : aliasResult.dataset ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono font-bold">
                      {aliasResult.dataset.className}
                    </span>
                    <span className="text-slate-300">
                      dataset=<code className="text-amber-300">{aliasResult.dataset.registryName}</code> · {aliasResult.dataset.domain}
                    </span>
                  </div>
                ) : (
                  <span className="text-rose-400">Ничего не найдено в реестре DetectZoo.</span>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left: Text + Model Selector */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-amber-400" />
                    Анализируемый текст
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {currentDnaResult && (
                      <button
                        type="button"
                        onClick={() => setInputText(currentDnaResult)}
                        className="px-2 py-1 rounded bg-emerald-950 text-emerald-300 hover:bg-emerald-900 border border-emerald-700/60 text-[10px] font-semibold cursor-pointer"
                      >
                        ДНК V5
                      </button>
                    )}
                    {currentContentText && (
                      <button
                        type="button"
                        onClick={() => setInputText(currentContentText)}
                        className="px-2 py-1 rounded bg-indigo-950 text-indigo-300 hover:bg-indigo-900 border border-indigo-700/60 text-[10px] font-semibold cursor-pointer"
                      >
                        Текст 2
                      </button>
                    )}
                    {currentDonorText && (
                      <button
                        type="button"
                        onClick={() => setInputText(currentDonorText)}
                        className="px-2 py-1 rounded bg-purple-950 text-purple-300 hover:bg-purple-900 border border-purple-700/60 text-[10px] font-semibold cursor-pointer"
                      >
                        Текст 1 (Донор)
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setInputText(DETECTZOO_BUILTIN_CORPUS[1].text)}
                      className="px-2 py-1 rounded bg-rose-950 text-rose-300 hover:bg-rose-900 border border-rose-700/60 text-[10px] font-semibold cursor-pointer"
                    >
                      Образец ИИ
                    </button>
                    <button
                      type="button"
                      onClick={() => setInputText(DETECTZOO_BUILTIN_CORPUS[0].text)}
                      className="px-2 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 text-[10px] font-semibold cursor-pointer"
                    >
                      Образец Человек
                    </button>
                  </div>
                </div>

                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  rows={6}
                  placeholder="Вставьте текст для проверки по 37 детекторам DetectZoo..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 leading-relaxed focus:outline-none focus:border-amber-500"
                />

                {/* Threshold Controls */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useCustomThr}
                        onChange={(e) => setUseCustomThr(e.target.checked)}
                        className="accent-amber-500"
                      />
                      <span>Переопределить порог всех моделей</span>
                    </label>
                    <span className="font-mono text-amber-300 font-bold">
                      {useCustomThr ? customThreshold.toFixed(2) : 'По умолчанию (per-model)'}
                    </span>
                  </div>
                  {useCustomThr && (
                    <input
                      type="range"
                      min={-3}
                      max={2}
                      step={0.05}
                      value={customThreshold}
                      onChange={(e) => setCustomThreshold(parseFloat(e.target.value))}
                      className="w-full accent-amber-500"
                    />
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={isRunning}
                    onClick={() => handleRunSuite(selectedNames, 'selected')}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg cursor-pointer disabled:opacity-60"
                  >
                    {isRunning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    <span>Запустить выбранные ({selectedNames.length}/37)</span>
                  </button>
                  <button
                    type="button"
                    disabled={isRunning}
                    onClick={() => handleRunSuite(DETECTZOO_TEXT_DETECTORS.map((d) => d.registryName), 'full')}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-600/50 text-xs font-bold cursor-pointer"
                  >
                    Полный скан (37)
                  </button>
                </div>
              </div>

              {/* 37-Model Multi-Checkbox Picker */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Filter className="h-3.5 w-3.5 text-amber-400" />
                    Выбор детекторов ({selectedNames.length}/37)
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedNames(DETECTZOO_TEXT_DETECTORS.map((d) => d.registryName))}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-200 cursor-pointer"
                    >
                      Все 37
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedNames([])}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-400 cursor-pointer"
                    >
                      Снять
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedNames([
                          'adadetectgpt',
                          'binoculars',
                          'biscope',
                          'gecscore',
                          'glimpse',
                          'phd',
                          'mle_ide',
                          'energy_detector',
                          'dsvdd',
                          'text_fluoroscopy',
                          'lastde_pp',
                          'remodetect',
                          'tocsin',
                          'radar',
                          'fast_detectgpt',
                        ])
                      }
                      className="px-2 py-1 rounded bg-amber-950 text-amber-300 border border-amber-700/60 text-[10px] cursor-pointer"
                    >
                      Топ-15 SOTA
                    </button>
                  </div>
                </div>

                {/* Family filter */}
                <div className="flex flex-wrap gap-1.5">
                  {TEXT_FAMILIES.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFamilyFilter(f.id)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-semibold cursor-pointer border ${
                        familyFilter === f.id
                          ? 'bg-amber-600/30 text-amber-200 border-amber-500/70'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="max-h-72 overflow-y-auto pr-1 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {filteredTextCatalog.map((det) => {
                    const checked = selectedNames.includes(det.registryName);
                    return (
                      <button
                        key={det.registryName}
                        type="button"
                        onClick={() => toggleDetector(det.registryName)}
                        className={`p-2 rounded-lg border text-left text-[11px] flex items-center gap-2 transition cursor-pointer ${
                          checked
                            ? 'bg-amber-950/30 border-amber-600/60 text-amber-100'
                            : 'bg-slate-950 border-slate-800/80 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        {checked ? (
                          <CheckSquare className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                        ) : (
                          <Square className="h-3.5 w-3.5 text-slate-600 shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-mono font-semibold truncate">{det.registryName}</div>
                          <div className="text-[9px] text-slate-500 truncate">{det.venue} · {det.family}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right: Detection Results */}
            <div className="lg:col-span-7 space-y-4">
              {suiteReport && (
                <>
                  {/* Summary Header */}
                  <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`px-3 py-1.5 rounded-xl text-sm font-black border ${
                            suiteReport.overallVerdict === 'Human-Written'
                              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                              : suiteReport.overallVerdict === 'AI-Generated'
                              ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
                              : 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                          }`}
                        >
                          {suiteReport.overallVerdict}
                        </div>
                        <div className="text-xs text-slate-300">
                          AI: <span className="font-mono font-bold text-white">{Math.round(suiteReport.overallAiProbability * 100)}%</span> ·
                          Human: <span className="font-mono font-bold text-emerald-300">{Math.round(suiteReport.overallHumanProbability * 100)}%</span> ·
                          Флагов: <span className="font-mono font-bold text-amber-300">{suiteReport.flaggedCount}/{suiteReport.totalRun}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={resultSort}
                          onChange={(e) => setResultSort(e.target.value as any)}
                          className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-[11px] text-slate-200"
                        >
                          <option value="aiDesc">Сорт: P(AI) ↓</option>
                          <option value="confDesc">Сорт: Confidence ↓</option>
                          <option value="nameAsc">Сорт: Имя A-Z</option>
                        </select>
                        <button
                          type="button"
                          onClick={handleCopySuite}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center gap-1 cursor-pointer"
                        >
                          {copiedReport ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                          <span>Копировать</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadJson(suiteReport, 'detectzoo_report.json')}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center gap-1 cursor-pointer"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>JSON</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                      <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                        <span className="text-slate-500 block">Mean Confidence</span>
                        <span className="font-mono font-bold text-amber-300">{(suiteReport.meanConfidence * 100).toFixed(1)}%</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                        <span className="text-slate-500 block">PHD / MLE Dim</span>
                        <span className="font-mono font-bold text-cyan-300">
                          {suiteReport.specialSignals.phdIntrinsicDim.toFixed(2)} / {suiteReport.specialSignals.mleIntrinsicDim.toFixed(2)}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                        <span className="text-slate-500 block">GECScore ROUGE-2</span>
                        <span className="font-mono font-bold text-purple-300">
                          {suiteReport.specialSignals.gecscoreRouge2.toFixed(4)}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                        <span className="text-slate-500 block">Токены / Предл.</span>
                        <span className="font-mono font-bold text-slate-200">
                          {suiteReport.tokenCount} / {suiteReport.sentenceCount} ({suiteReport.elapsedMs}ms)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Results Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[680px] overflow-y-auto pr-1">
                    {sortedResults.map((res) => {
                      const isAi = res.label === 'ai';
                      const aiPct = Math.round(res.aiProbability * 100);
                      return (
                        <div
                          key={res.registryName}
                          className={`p-3 rounded-xl border text-xs space-y-2 ${
                            isAi
                              ? 'bg-rose-950/20 border-rose-700/60'
                              : 'bg-emerald-950/15 border-emerald-700/50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <span className="font-mono font-bold text-white">{res.registryName}</span>
                              <span className="text-[10px] text-slate-400 ml-2">{res.className}</span>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                isAi ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'
                              }`}
                            >
                              {res.label} ({aiPct}%)
                            </span>
                          </div>

                          <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${isAi ? 'bg-rose-500' : 'bg-emerald-500'}`}
                              style={{ width: `${Math.max(4, aiPct)}%` }}
                            />
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-slate-300 font-mono">
                            <span>score={res.score}</span>
                            <span>thr={res.threshold}</span>
                            <span>conf={(res.confidence * 100).toFixed(1)}%</span>
                          </div>

                          <div className="text-[10px] text-slate-400 truncate" title={res.formula}>
                            {res.formula}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================== TAB 2: BENCHMARK EVALUATOR ===================== */}
      {activeTab === 'benchmark' && (
        <div className="space-y-5">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-amber-400" />
                  BenchmarkEvaluator (detectzoo/benchmarks/evaluator.py)
                </h3>
                <p className="text-xs text-slate-400">
                  Сравнение нескольких выбранных детекторов по точным метрикам ROC AUC, PR AUC, Avg Precision, F1, TPR, FPR и Equal Error Rate (EER).
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isBenching}
                  onClick={handleRunBenchmark}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
                >
                  {isBenching ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  Запустить BenchmarkEvaluator
                </button>
                {benchReport && (
                  <button
                    type="button"
                    onClick={() => handleDownloadJson(benchReport, 'detectzoo_benchmark_results.json')}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    run_and_save (JSON)
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="space-y-2">
                <label className="text-slate-400 font-semibold block">Датасет DetectZoo (11 текстовых)</label>
                <select
                  value={benchDataset}
                  onChange={(e) => setBenchDataset(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200"
                >
                  <option value="all">Все встроенные образцы (All Domains)</option>
                  {DETECTZOO_DATASETS.filter((d) => d.modality === 'text').map((ds) => (
                    <option key={ds.registryName} value={ds.registryName}>
                      {ds.className} ({ds.registryName}) — {ds.domain}
                    </option>
                  ))}
                </select>
                <div className="pt-2">
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-400">Порог P(AI) (threshold)</span>
                    <span className="font-mono text-amber-300 font-bold">{benchThreshold.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={0.9}
                    step={0.05}
                    value={benchThreshold}
                    onChange={(e) => setBenchThreshold(parseFloat(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-slate-400 font-semibold">Пользовательский корпус (JSONL / CSV / TSV)</label>
                  <label className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-amber-300 cursor-pointer">
                    <Upload className="h-3 w-3" />
                    <span>Файл</span>
                    <input type="file" accept=".jsonl,.json,.csv,.tsv,.txt" onChange={handleBenchmarkFileUpload} className="hidden" />
                  </label>
                </div>
                <textarea
                  value={customSamplesRaw}
                  onChange={(e) => setCustomSamplesRaw(e.target.value)}
                  rows={4}
                  placeholder={'Оставьте пустым для встроенного корпуса (8 образцов) или вставьте JSONL/CSV:\n0,Текст написанный человеком...\n1,В рамках современной парадигмы следует отметить...'}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-[11px] font-mono text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-slate-400 font-semibold">Сравниваемые детекторы ({benchDetectors.length}/37)</label>
                  <button
                    type="button"
                    onClick={() =>
                      setBenchDetectors(
                        benchDetectors.length === 37 ? ['adadetectgpt', 'binoculars', 'gecscore', 'energy_detector'] : DETECTZOO_TEXT_DETECTORS.map((d) => d.registryName)
                      )
                    }
                    className="text-[10px] text-amber-300 hover:underline cursor-pointer"
                  >
                    {benchDetectors.length === 37 ? 'Сократить' : 'Выбрать все 37'}
                  </button>
                </div>
                <div className="max-h-28 overflow-y-auto bg-slate-950 border border-slate-800 rounded-xl p-2 flex flex-wrap gap-1.5">
                  {DETECTZOO_TEXT_DETECTORS.map((d) => {
                    const active = benchDetectors.includes(d.registryName);
                    return (
                      <button
                        key={d.registryName}
                        type="button"
                        onClick={() =>
                          setBenchDetectors((prev) =>
                            prev.includes(d.registryName) ? prev.filter((x) => x !== d.registryName) : [...prev, d.registryName]
                          )
                        }
                        className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer border ${
                          active
                            ? 'bg-amber-600/30 border-amber-500/70 text-amber-200'
                            : 'bg-slate-900 border-slate-800 text-slate-500'
                        }`}
                      >
                        {d.registryName}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {benchReport && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* SVG ROC Chart */}
              <div className="lg:col-span-4 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-white">ROC-кривые (Топ-6 выбранных моделей)</h4>
                <svg viewBox="0 0 240 210" className="w-full h-56 bg-slate-950 rounded-xl border border-slate-800 p-2">
                  <line x1="25" y1="185" x2="225" y2="185" stroke="#334155" strokeWidth="1" />
                  <line x1="25" y1="15" x2="25" y2="185" stroke="#334155" strokeWidth="1" />
                  <line x1="25" y1="185" x2="225" y2="15" stroke="#475569" strokeDasharray="4 4" strokeWidth="1" />
                  {benchReport.rows.slice(0, 6).map((row, idx) => {
                    const pts = row.rocCurve
                      .map((pt) => `${25 + pt.fpr * 200},${185 - pt.tpr * 170}`)
                      .join(' ');
                    return (
                      <polyline
                        key={row.detector}
                        fill="none"
                        stroke={CURVE_COLORS[idx % CURVE_COLORS.length]}
                        strokeWidth="2"
                        points={pts}
                      />
                    );
                  })}
                  <text x="125" y="203" textAnchor="middle" fill="#94a3b8" fontSize="9">
                    False Positive Rate (FPR)
                  </text>
                  <text x="10" y="100" textAnchor="middle" fill="#94a3b8" fontSize="9" transform="rotate(-90 10 100)">
                    TPR
                  </text>
                </svg>

                <div className="space-y-1 text-[11px]">
                  {benchReport.rows.slice(0, 6).map((row, idx) => (
                    <div key={row.detector} className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 font-mono text-slate-300">
                        <span
                          className="w-2.5 h-2.5 rounded-full inline-block"
                          style={{ backgroundColor: CURVE_COLORS[idx % CURVE_COLORS.length] }}
                        />
                        {row.detector}
                      </span>
                      <span className="font-mono text-amber-300">
                        AUC={(row.metrics.roc_auc * 100).toFixed(1)}% · EER={(row.metrics.eer * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
                  <div>Лучший по ROC AUC: <span className="font-mono text-emerald-300 font-bold">{benchReport.bestByRocAuc}</span></div>
                  <div>Лучший по min EER: <span className="font-mono text-cyan-300 font-bold">{benchReport.bestByEer}</span></div>
                  <div>Выборка: {benchReport.sampleCount} текстов ({benchReport.humanSamples} Human / {benchReport.aiSamples} AI)</div>
                </div>
              </div>

              {/* Comparison Table */}
              <div className="lg:col-span-8 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-[10px] uppercase">
                      <th className="py-2 pr-3">Detector</th>
                      <th className="py-2 px-2">Acc</th>
                      <th className="py-2 px-2">Prec</th>
                      <th className="py-2 px-2">Recall/TPR</th>
                      <th className="py-2 px-2">FPR</th>
                      <th className="py-2 px-2">F1</th>
                      <th className="py-2 px-2">ROC AUC</th>
                      <th className="py-2 px-2">PR AUC</th>
                      <th className="py-2 px-2">Avg Prec</th>
                      <th className="py-2 pl-2">EER ↓</th>
                    </tr>
                  </thead>
                  <tbody>
                    {benchReport.rows.map((r) => (
                      <tr key={r.detector} className="border-b border-slate-800/60 hover:bg-slate-800/30 font-mono text-[11px]">
                        <td className="py-2 pr-3 font-bold text-amber-300">{r.detector}</td>
                        <td className="py-2 px-2 text-slate-200">{(r.metrics.accuracy * 100).toFixed(1)}%</td>
                        <td className="py-2 px-2 text-slate-300">{(r.metrics.precision * 100).toFixed(1)}%</td>
                        <td className="py-2 px-2 text-slate-300">{(r.metrics.tpr * 100).toFixed(1)}%</td>
                        <td className="py-2 px-2 text-slate-400">{(r.metrics.fpr * 100).toFixed(1)}%</td>
                        <td className="py-2 px-2 text-emerald-300 font-semibold">{(r.metrics.f1 * 100).toFixed(1)}%</td>
                        <td className="py-2 px-2 text-cyan-300 font-bold">{(r.metrics.roc_auc * 100).toFixed(1)}%</td>
                        <td className="py-2 px-2 text-indigo-300">{(r.metrics.pr_auc * 100).toFixed(1)}%</td>
                        <td className="py-2 px-2 text-slate-300">{(r.metrics.avg_precision * 100).toFixed(1)}%</td>
                        <td className="py-2 pl-2 text-rose-300">{(r.metrics.eer * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================== TAB 3: SPECIALIZED INSPECTORS ===================== */}
      {activeTab === 'inspectors' && suiteReport && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* OOD Detectors */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-300">OOD Suite: Energy / D-SVDD / HRN</span>
              <span className="text-[10px] font-mono text-slate-400">ood_detectors.py</span>
            </div>
            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex justify-between">
                <span className="text-slate-400">Energy -logsumexp E(x)</span>
                <span className="font-mono font-bold text-white">{suiteReport.specialSignals.energyScore}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex justify-between">
                <span className="text-slate-400">D-SVDD Hypersphere Margin</span>
                <span className="font-mono font-bold text-cyan-300">{suiteReport.specialSignals.dsvddRadius}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex justify-between">
                <span className="text-slate-400">HRN WGAN-GP One-Class</span>
                <span className="font-mono font-bold text-purple-300">{suiteReport.specialSignals.hrnPenalty}</span>
              </div>
            </div>
          </div>

          {/* Text Fluoroscopy + IDE */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-cyan-300">Text Fluoroscopy & IDE Manifold</span>
              <span className="text-[10px] font-mono text-slate-400">ide.py · text_fluoroscopy.py</span>
            </div>
            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex justify-between">
                <span className="text-slate-400">Fluoroscopy Max KL (Layer #{suiteReport.specialSignals.textFluoroscopyPeakLayer})</span>
                <span className="font-mono font-bold text-amber-300">{suiteReport.specialSignals.textFluoroscopyMaxKL}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex justify-between">
                <span className="text-slate-400">PHD (Persistent Homology MST)</span>
                <span className="font-mono font-bold text-emerald-300">{suiteReport.specialSignals.phdIntrinsicDim}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex justify-between">
                <span className="text-slate-400">MLE (Levina-Bickel k-NN)</span>
                <span className="font-mono font-bold text-cyan-300">{suiteReport.specialSignals.mleIntrinsicDim}</span>
              </div>
            </div>
          </div>

          {/* BiScope Bidirectional Cross-Entropy */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-purple-300">BiScope Bidirectional CE (NeurIPS 2024)</span>
              <span className="text-[10px] font-mono text-slate-400">biscope.py</span>
            </div>
            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex justify-between">
                <span className="text-slate-400">Forward CE (FCE)</span>
                <span className="font-mono font-bold text-white">{suiteReport.specialSignals.biscopeFce}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex justify-between">
                <span className="text-slate-400">Backward Memorization (BCE)</span>
                <span className="font-mono font-bold text-emerald-300">{suiteReport.specialSignals.biscopeBce}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex justify-between">
                <span className="text-slate-400">BiScope Score (thr=6.9)</span>
                <span className="font-mono font-bold text-amber-300">{suiteReport.specialSignals.biscopeGap}</span>
              </div>
            </div>
          </div>

          {/* AdaDetectGPT + Glimpse + Lastde */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-300">AdaDetectGPT · Glimpse · Lastde++</span>
              <span className="text-[10px] font-mono text-slate-400">NeurIPS / ICLR 2025</span>
            </div>
            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex justify-between">
                <span className="text-slate-400">AdaDetectGPT B-Spline Witness</span>
                <span className="font-mono font-bold text-white">{suiteReport.specialSignals.adaDetectWitnessDelta}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex justify-between">
                <span className="text-slate-400">Glimpse Geometric Tail Sigma</span>
                <span className="font-mono font-bold text-cyan-300">{suiteReport.specialSignals.glimpseTailSigma}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex justify-between">
                <span className="text-slate-400">Lastde MDE Orbit Entropy</span>
                <span className="font-mono font-bold text-emerald-300">{suiteReport.specialSignals.lastdeMde}</span>
              </div>
            </div>
          </div>

          {/* GECScore + Revise + DNA */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-rose-300">GECScore · Revise · DNA-DetectLLM</span>
              <span className="text-[10px] font-mono text-slate-400">Rewrite & Repair</span>
            </div>
            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex justify-between">
                <span className="text-slate-400">GECScore ROUGE-2 (thr=0.924)</span>
                <span className="font-mono font-bold text-amber-300">{suiteReport.specialSignals.gecscoreRouge2}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex justify-between">
                <span className="text-slate-400">Revise BARTScore (thr=-2.0)</span>
                <span className="font-mono font-bold text-white">{suiteReport.specialSignals.reviseBartScore}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex justify-between">
                <span className="text-slate-400">DNA Mutation-Repair Ratio</span>
                <span className="font-mono font-bold text-emerald-300">{suiteReport.specialSignals.dnaMutationRepair}</span>
              </div>
            </div>
          </div>

          {/* IPAD + IRM + ReMoDetect + TOCSIN */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-300">IPAD · IRM · ReMoDetect · TOCSIN</span>
              <span className="text-[10px] font-mono text-slate-400">Reward & Inverse Prompt</span>
            </div>
            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex justify-between">
                <span className="text-slate-400">IPAD Fusion p_hat (thr=0.5)</span>
                <span className="font-mono font-bold text-white">{suiteReport.specialSignals.ipadPromptDelta}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex justify-between">
                <span className="text-slate-400">IRM Implicit DPO Reward</span>
                <span className="font-mono font-bold text-cyan-300">{suiteReport.specialSignals.irmImplicitReward}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex justify-between">
                <span className="text-slate-400">ReMoDetect RLHF / TOCSIN Cohes.</span>
                <span className="font-mono font-bold text-amber-300">
                  {suiteReport.specialSignals.remodetectReward} / {suiteReport.specialSignals.tocsinCohesiveness}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== TAB 4: FULL 70-DETECTOR ZOO + 23 DATASETS ===================== */}
      {activeTab === 'registry' && (
        <div className="space-y-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'text' as const, label: `📝 Text (${DETECTZOO_TEXT_DETECTORS.length})` },
                { id: 'image' as const, label: `🖼️ Image (${DETECTZOO_MULTIMODAL_DETECTORS.filter((d) => d.modality === 'image').length})` },
                { id: 'audio' as const, label: `🎙️ Audio (${DETECTZOO_MULTIMODAL_DETECTORS.filter((d) => d.modality === 'audio').length})` },
                { id: 'video' as const, label: `🎬 Video (${DETECTZOO_MULTIMODAL_DETECTORS.filter((d) => d.modality === 'video').length})` },
                { id: 'datasets' as const, label: `📦 Datasets (${DETECTZOO_DATASETS.length})` },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setRegistryView(t.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer border ${
                    registryView === t.id
                      ? 'bg-amber-600/30 border-amber-500 text-amber-200'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="relative flex-1 max-w-sm">
              <Search className="h-3.5 w-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={registrySearch}
                onChange={(e) => setRegistrySearch(e.target.value)}
                placeholder="Поиск по классу, алиасу, статье..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {registryView === 'datasets' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredRegistryDatasets.map((ds) => (
                <div key={ds.registryName} className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-amber-300">{ds.registryName}</span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300 text-[10px] uppercase font-bold">
                      {ds.modality}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-400">{ds.className} · {ds.domain}</div>
                  <p className="text-slate-300 text-[11px]">{ds.description}</p>
                  {ds.aliases.length > 0 && (
                    <div className="text-[10px] text-slate-500 font-mono">
                      aliases: {ds.aliases.join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredRegistryDetectors.map((det) => (
                <div key={det.registryName} className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-amber-300">{det.registryName}</span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">{det.venue}</span>
                  </div>
                  <div className="text-[11px] font-mono text-cyan-300">{det.className}</div>
                  <p className="text-slate-300 text-[11px]">{det.description}</p>
                  <div className="p-2 rounded bg-slate-950 border border-slate-800 font-mono text-[10px] text-emerald-300 truncate" title={det.formula}>
                    {det.formula}
                  </div>
                  <div className="text-[10px] text-slate-500 flex flex-wrap justify-between gap-1">
                    <span>model: {det.defaultModel}</span>
                    <span>thr: {det.defaultThreshold}</span>
                  </div>
                  {det.aliases.length > 0 && (
                    <div className="text-[10px] text-slate-400 font-mono">
                      aliases: [{det.aliases.join(', ')}]
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
