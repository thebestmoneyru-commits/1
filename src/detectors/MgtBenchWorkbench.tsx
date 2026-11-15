/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowLeft,
  Compass,
  Play,
  Fingerprint,
  TrendingDown,
  BookOpen,
  CheckSquare,
  Download,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  Upload,
  Sparkles,
  ShieldAlert,
  Activity,
} from 'lucide-react';
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
} from '../../shared/mgtBenchCore';

type BenchSubTab = 'detect' | 'attribution' | 'benchmark' | 'catalog';

interface MgtBenchWorkbenchProps {
  onBack?: () => void;
  currentDnaResult?: string;
  currentContentText?: string;
  currentDonorText?: string;
  embedded?: boolean;
}

const SAMPLE_MGTBENCH_TEXT = `Furthermore, it is important to note that higher education plays a crucial role in shaping critical thinking. On the other hand, leveraging comprehensive methodologies underscores a multifaceted testament to intellectual growth. В рамках современной образовательной парадигмы следует отметить, что комплексный подход играет ключевую роль.`;

function parseClientBenchSamples(raw: string): MgtBenchSample[] {
  const lines = (raw || '')
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
        // ignore invalid JSON line
      }
    }
    if (i === 0 && /^label[,;\t]/i.test(line)) continue;
    const tab = line.split('\t');
    if (tab.length >= 2 && /^[01]$/.test(tab[0].trim())) {
      const lbl = Number(tab[0].trim());
      out.push({ dataset: 'TSV', llm: lbl === 1 ? 'ChatGPT' : 'Human', label: lbl, text: tab.slice(1).join('\t').trim() });
      continue;
    }
    const csv = line.match(/^([01])\s*[,;]\s*"?(.*?)"?$/);
    if (csv && csv[2].trim()) {
      const lbl = Number(csv[1]);
      out.push({
        dataset: 'CSV',
        llm: lbl === 1 ? 'ChatGPT' : 'Human',
        label: lbl,
        text: csv[2].replace(/""/g, '"').trim(),
      });
    }
  }
  return out;
}

export function MgtBenchWorkbench({
  onBack,
  currentDnaResult = '',
  currentContentText = '',
  currentDonorText = '',
  embedded = false,
}: MgtBenchWorkbenchProps) {
  const [subTab, setSubTab] = useState<BenchSubTab>('detect');

  // 1. Detection state
  const [inputText, setInputText] = useState<string>(() => currentDnaResult || currentContentText || SAMPLE_MGTBENCH_TEXT);
  const [selectedMethods, setSelectedMethods] = useState<string[]>(() => MGTBENCH_METHODS.map((m) => m.id));
  const [cutTokenLength, setCutTokenLength] = useState<number>(-1);
  const [threshold, setThreshold] = useState<number>(0.5);
  const [gptzeroApiKey, setGptzeroApiKey] = useState<string>('');
  const [detectReport, setDetectReport] = useState<MgtBenchDetectReport | null>(null);
  const [isDetecting, setIsDetecting] = useState<boolean>(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [copiedSummary, setCopiedSummary] = useState<boolean>(false);
  const [stats, setStats] = useState<{
    totalDetections: number;
    totalAttributions: number;
    totalBenchmarks: number;
  } | null>(null);

  // 2. Attribution state (7 classes)
  const [attrText, setAttrText] = useState<string>(() => currentDnaResult || currentContentText || SAMPLE_MGTBENCH_TEXT);
  const [attrReport, setAttrReport] = useState<MgtBenchAttributionReport | null>(null);
  const [isAttributing, setIsAttributing] = useState<boolean>(false);
  const [attrError, setAttrError] = useState<string | null>(null);

  // 3. Benchmark & Length Curve state
  const [benchDataset, setBenchDataset] = useState<string>('All Domains');
  const [benchLlm, setBenchLlm] = useState<string>('All LLMs');
  const [benchMethod, setBenchMethod] = useState<string>('Log-Likelihood');
  const [customCorpusRaw, setCustomCorpusRaw] = useState<string>(() =>
    MGTBENCH_BUILTIN_CORPUS.map((s) => JSON.stringify(s)).join('\n')
  );
  const [expReport, setExpReport] = useState<MgtBenchExperimentReport | null>(null);
  const [isBenchmarking, setIsBenchmarking] = useState<boolean>(false);
  const [benchError, setBenchError] = useState<string | null>(null);

  // 4. Catalog state
  const [catalogFilter, setCatalogFilter] = useState<'All' | 'Metric-based' | 'Model-based'>('All');
  const [catalogSearch, setCatalogSearch] = useState<string>('');

  const refreshStats = async () => {
    try {
      const resp = await fetch('/api/mgtbench/catalog');
      if (resp.ok) {
        const data = await resp.json();
        if (data?.stats) setStats(data.stats);
      }
    } catch {
      // ignore initial fetch failure
    }
  };

  useEffect(() => {
    refreshStats();
    if (inputText.trim().length >= 10) {
      try {
        setDetectReport(
          runMgtBenchDetection(inputText, {
            methodIds: selectedMethods,
            cutTokenLength: cutTokenLength > 0 ? cutTokenLength : undefined,
            threshold,
          })
        );
        setAttrReport(runMgtBenchAttribution(inputText));
      } catch {
        // noop
      }
    }
  }, []);

  const toggleMethodId = (id: string) => {
    setSelectedMethods((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleRunDetection = async (idsOverride?: string[]) => {
    const idsToRun = idsOverride || selectedMethods;
    if (!inputText.trim() || inputText.trim().length < 10) {
      setDetectError('Введите минимум 10 символов для анализа MGTBench.');
      return;
    }
    if (idsToRun.length === 0) {
      setDetectError('Отметьте хотя бы один метод из 14 доступных.');
      return;
    }

    setIsDetecting(true);
    setDetectError(null);
    try {
      const resp = await fetch('/api/mgtbench/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: inputText,
          methodIds: idsToRun,
          cutTokenLength: cutTokenLength > 0 ? cutTokenLength : undefined,
          threshold,
          gptzeroApiKey: gptzeroApiKey.trim() || undefined,
        }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData?.error || `HTTP ${resp.status}`);
      }
      const data: MgtBenchDetectReport = await resp.json();
      setDetectReport(data);
      refreshStats();
    } catch (err: any) {
      try {
        const local = runMgtBenchDetection(inputText, {
          methodIds: idsToRun,
          cutTokenLength: cutTokenLength > 0 ? cutTokenLength : undefined,
          threshold,
        });
        setDetectReport(local);
      } catch (e2: any) {
        setDetectError(err?.message || e2?.message || 'Ошибка анализа MGTBench');
      }
    } finally {
      setIsDetecting(false);
    }
  };

  const handleRunAttribution = async () => {
    if (!attrText.trim() || attrText.trim().length < 10) {
      setAttrError('Введите минимум 10 символов для 7-классовой атрибуции.');
      return;
    }
    setIsAttributing(true);
    setAttrError(null);
    try {
      const resp = await fetch('/api/mgtbench/attribution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: attrText }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData?.error || `HTTP ${resp.status}`);
      }
      const data: MgtBenchAttributionReport = await resp.json();
      setAttrReport(data);
      refreshStats();
    } catch (err: any) {
      try {
        setAttrReport(runMgtBenchAttribution(attrText));
      } catch (e2: any) {
        setAttrError(err?.message || e2?.message || 'Ошибка атрибуции MGTBench');
      }
    } finally {
      setIsAttributing(false);
    }
  };

  const handleRunBenchmark = async () => {
    setIsBenchmarking(true);
    setBenchError(null);
    try {
      const parsed = parseClientBenchSamples(customCorpusRaw);
      const resp = await fetch('/api/mgtbench/benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasetName: benchDataset,
          detectLLM: benchLlm,
          methodId: benchMethod,
          samples: parsed.length >= 4 ? parsed : undefined,
        }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData?.error || `HTTP ${resp.status}`);
      }
      const data: MgtBenchExperimentReport = await resp.json();
      setExpReport(data);
      refreshStats();
    } catch (err: any) {
      try {
        const parsed = parseClientBenchSamples(customCorpusRaw);
        const rep = runMgtBenchExperiment({
          datasetName: benchDataset,
          detectLLM: benchLlm,
          methodId: benchMethod,
          samples: parsed.length >= 4 ? parsed : undefined,
        });
        setExpReport(rep);
      } catch (e2: any) {
        setBenchError(err?.message || e2?.message || 'Ошибка расчёта бенчмарка MGTBench');
      }
    } finally {
      setIsBenchmarking(false);
    }
  };

  const handleUploadCorpus = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCustomCorpusRaw(text);
    e.target.value = '';
  };

  const handleCopyDetectSummary = async () => {
    if (!detectReport) return;
    const summary = [
      `=== MGTBench (TrustAIRLab/MGTBench) Report ===`,
      `Verdict: ${detectReport.overallVerdict}`,
      `Mean P(AI): ${(detectReport.overallAiProbability * 100).toFixed(1)}% | Human: ${(detectReport.overallHumanProbability * 100).toFixed(1)}%`,
      `Flagged: ${detectReport.flaggedCount}/${detectReport.totalRun} | PHD Intrinsic Dim: ${detectReport.phdIntrinsicDim} | Burstiness: ${detectReport.burstiness}`,
      `Cut Tokens: ${detectReport.cutTokensApplied ?? 'Full'} | Words: ${detectReport.wordsCount}`,
      `GLTR Test-2 Bins: [<10:${(detectReport.gltrFeatures[0] * 100).toFixed(1)}%, <100:${(detectReport.gltrFeatures[1] * 100).toFixed(1)}%, <1k:${(detectReport.gltrFeatures[2] * 100).toFixed(1)}%, Tail:${(detectReport.gltrFeatures[3] * 100).toFixed(1)}%]`,
      '',
      ...detectReport.results.map(
        (r) => `- ${r.name} [${r.category}]: P(AI)=${(r.aiProbability * 100).toFixed(1)}% (${r.prediction.toUpperCase()}) | ${r.details}`
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
    return MGTBENCH_METHODS.filter((m) => {
      if (catalogFilter !== 'All' && m.category !== catalogFilter) return false;
      if (catalogSearch.trim()) {
        const q = catalogSearch.toLowerCase();
        return (
          m.name.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q) ||
          m.reference.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [catalogFilter, catalogSearch]);

  // SVG Length Curve Path Builders
  const lengthCurveSvg = useMemo(() => {
    if (!expReport?.lengthCurve?.length) return null;
    const pts = expReport.lengthCurve;
    const w = 520;
    const h = 210;
    const padX = 42;
    const padY = 24;
    const stepX = (w - padX * 2) / Math.max(1, pts.length - 1);

    const makePath = (getter: (p: typeof pts[0]) => number) =>
      pts
        .map((p, i) => {
          const x = padX + i * stepX;
          const y = h - padY - getter(p) * (h - padY * 2);
          return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(' ');

    return {
      w,
      h,
      padX,
      padY,
      stepX,
      aucPath: makePath((p) => p.auc),
      f1Path: makePath((p) => p.f1),
      pts,
    };
  }, [expReport]);

  const subTabBtn = (id: BenchSubTab, label: string, Icon: React.ComponentType<{ className?: string }>) => {
    const active = subTab === id;
    return (
      <button
        type="button"
        onClick={() => setSubTab(id)}
        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
          active
            ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white border-cyan-500 shadow-lg'
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
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-cyan-950/50 to-indigo-950/60 border border-cyan-800/60 rounded-2xl p-5 shadow-2xl space-y-4">
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
            <div className="p-3 rounded-2xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shrink-0">
              <Compass className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg lg:text-xl font-black text-white tracking-tight">
                  MGTBench — Полный эталонный фреймворк (14 методов + PHD MST + 7-Class Attribution)
                </h2>
                <a
                  href="https://github.com/TrustAIRLab/MGTBench"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-slate-900 text-cyan-300 hover:text-white border border-cyan-700/60 text-[11px] font-mono"
                >
                  TrustAIRLab/MGTBench <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed max-w-4xl">
                Полная интеграция <strong>MGTBench</strong>: 9 Metric-based детекторов (включая точный{' '}
                <code className="text-emerald-300">PHD Prim MST</code> из <code className="text-cyan-300">IntrinsicDim.py</code>,
                GLTR Test-2, DetectGPT Span Perturbations, LRR, NPR), 5 Model-based (OpenAI-D, ChatGPT-D, ConDA, LM-D, GPTZero
                + live API bridge), <strong>7-классовая атрибуция</strong> источника (Human / ChatGPT / ChatGLM / Dolly /
                ChatGPT-turbo / GPT4 / Claude) и <strong>Multi-Length Curve</strong> от 10 до 500+ токенов.
              </p>
            </div>
          </div>

          {stats && (
            <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono">
              <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
                Сканов: <strong className="text-cyan-300">{stats.totalDetections}</strong>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
                Атрибуций: <strong className="text-amber-300">{stats.totalAttributions}</strong>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
                Кривых длин: <strong className="text-emerald-300">{stats.totalBenchmarks}</strong>
              </span>
            </div>
          )}
        </div>

        {/* Sub-tab Navigation */}
        <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-800/80">
          {subTabBtn('detect', 'Детекция (14 методов MGTBench)', Play)}
          {subTabBtn('attribution', 'Атрибуция автора (7 классов LLM)', Fingerprint)}
          {subTabBtn('benchmark', 'Бенчмарк & Кривая длин (Length Curve)', TrendingDown)}
          {subTabBtn('catalog', 'Каталог 14 методов MGTBench', BookOpen)}
        </div>
      </div>

      {/* ===================== SUB-TAB 1: DETECT (14 METHODS) ===================== */}
      {subTab === 'detect' && (
        <div className="space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <span className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-cyan-400" />
                Текст для анализа по 14 методам MGTBench
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
                    🟣 Текст 2 (ИИ)
                  </button>
                )}
                {currentDonorText && (
                  <button
                    type="button"
                    onClick={() => setInputText(currentDonorText)}
                    className="px-2.5 py-1 rounded-lg bg-blue-950/70 hover:bg-blue-900 text-blue-300 border border-blue-700/60 font-semibold cursor-pointer"
                  >
                    🔵 Текст 1 (Донор)
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setInputText(SAMPLE_MGTBENCH_TEXT)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
                >
                  Образец MGTBench
                </button>
              </div>
            </div>

            <textarea
              rows={6}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Вставьте текст (минимум 10 символов) для анализа MGTBench..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs lg:text-sm text-slate-200 font-mono leading-relaxed focus:outline-none focus:border-cyan-500 resize-y"
            />

            {/* Controls Row: cut_length, threshold, GPTZero API key */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-950/70 p-4 rounded-xl border border-slate-800/80 text-xs">
              <div className="space-y-1.5">
                <span className="text-slate-300 font-semibold block">Усечение длины (cut_length, токены):</span>
                <select
                  value={cutTokenLength}
                  onChange={(e) => setCutTokenLength(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                >
                  {MGTBENCH_TEST_LENGTHS.map((len) => (
                    <option key={len} value={len}>
                      {len < 0 ? 'Full text (без обрезки)' : `${len} tokens`}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400">Оригинальный тест MGTBench на коротких окнах.</p>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-300 font-semibold">Порог решения P(AI):</span>
                  <span className="font-mono font-bold text-cyan-300">{threshold.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={0.9}
                  step={0.05}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
                <p className="text-[10px] text-slate-400">Если P(AI) ≥ порога → метод помечает текст как AI.</p>
              </div>

              <div className="space-y-1.5">
                <span className="text-slate-300 font-semibold block">GPTZero API Key (опциональный мост):</span>
                <input
                  type="password"
                  value={gptzeroApiKey}
                  onChange={(e) => setGptzeroApiKey(e.target.value)}
                  placeholder="Оставьте пустым для локального ядра"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            {/* Method checkboxes */}
            <div className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                <span className="font-bold text-slate-200">
                  Выбрано методов: <strong className="text-cyan-300">{selectedMethods.length}</strong> / {MGTBENCH_METHODS.length}
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setSelectedMethods(MGTBENCH_METHODS.map((m) => m.id))}
                    className="px-2.5 py-1 rounded-lg bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 cursor-pointer"
                  >
                    Все 14
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedMethods(MGTBENCH_METHODS.filter((m) => m.category === 'Metric-based').map((m) => m.id))}
                    className="px-2.5 py-1 rounded-lg bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 cursor-pointer"
                  >
                    Metric-based (9)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedMethods(MGTBENCH_METHODS.filter((m) => m.category === 'Model-based').map((m) => m.id))}
                    className="px-2.5 py-1 rounded-lg bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-800 cursor-pointer"
                  >
                    Model-based (5)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedMethods([])}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 cursor-pointer"
                  >
                    Сброс
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-2">
                {MGTBENCH_METHODS.map((m) => {
                  const checked = selectedMethods.includes(m.id);
                  return (
                    <label
                      key={m.id}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] cursor-pointer transition ${
                        checked
                          ? m.category === 'Metric-based'
                            ? 'bg-emerald-950/50 border-emerald-700/70 text-emerald-200'
                            : 'bg-indigo-950/50 border-indigo-700/70 text-indigo-200'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMethodId(m.id)}
                        className="w-3.5 h-3.5 rounded text-cyan-600 bg-slate-800 border-slate-700 shrink-0"
                      />
                      <span className="truncate font-medium">{m.id}</span>
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
                disabled={isDetecting || selectedMethods.length === 0}
                className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-lg"
              >
                <CheckSquare className="h-4 w-4" />
                <span>Запустить выбранные ({selectedMethods.length}/14)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const all = MGTBENCH_METHODS.map((m) => m.id);
                  setSelectedMethods(all);
                  handleRunDetection(all);
                }}
                disabled={isDetecting}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-xl"
              >
                {isDetecting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                <span>Полный скан (все 14 методов)</span>
              </button>
            </div>
          </div>

          {/* Detection Report */}
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
                    <span className="px-2.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-700/70 text-[11px] font-mono font-bold">
                      PHD Intrinsic Dim (Prim MST): {detectReport.phdIntrinsicDim}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Флагов AI: <strong className="text-slate-200">{detectReport.flaggedCount}</strong> / {detectReport.totalRun}{' '}
                    · Слов: <strong className="text-slate-200">{detectReport.wordsCount}</strong> · Burstiness:{' '}
                    <strong className="text-slate-200">{detectReport.burstiness}</strong> · TTR:{' '}
                    <strong className="text-slate-200">{detectReport.ttr}</strong> · Усечение:{' '}
                    <strong className="text-slate-200">{detectReport.cutTokensApplied ?? 'Full'}</strong> · {detectReport.elapsedMs} мс
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
                    onClick={() => handleDownloadJson(detectReport, `mgtbench_detect_${Date.now()}.json`)}
                    className="px-3 py-1.5 rounded-lg bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/60 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    JSON
                  </button>
                </div>
              </div>

              {/* GLTR Test-2 4-bin Histogram */}
              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                  <span className="font-bold text-slate-300">GLTR Test-2 Features [p_&lt;10, p_&lt;100, p_&lt;1000, Tail]:</span>
                  <span className="font-mono text-slate-400">
                    Top-10: <strong className="text-emerald-400">{(detectReport.gltrFeatures[0] * 100).toFixed(1)}%</strong> |
                    Top-100: <strong className="text-amber-400">{(detectReport.gltrFeatures[1] * 100).toFixed(1)}%</strong> |
                    Top-1000: <strong className="text-rose-400">{(detectReport.gltrFeatures[2] * 100).toFixed(1)}%</strong> |
                    Tail: <strong className="text-purple-400">{(detectReport.gltrFeatures[3] * 100).toFixed(1)}%</strong>
                  </span>
                </div>
                <div className="h-2.5 rounded-full overflow-hidden flex bg-slate-800">
                  <div style={{ width: `${detectReport.gltrFeatures[0] * 100}%` }} className="bg-emerald-500" />
                  <div style={{ width: `${detectReport.gltrFeatures[1] * 100}%` }} className="bg-amber-400" />
                  <div style={{ width: `${detectReport.gltrFeatures[2] * 100}%` }} className="bg-rose-500" />
                  <div style={{ width: `${detectReport.gltrFeatures[3] * 100}%` }} className="bg-purple-500" />
                </div>
                {detectReport.matchedCues.length > 0 && (
                  <div className="text-[11px] text-rose-300 flex items-center gap-1.5 flex-wrap pt-1">
                    <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                    <span>Найдены маркеры LLM:</span>
                    {detectReport.matchedCues.map((c) => (
                      <span key={c} className="px-1.5 py-0.5 rounded bg-rose-950 border border-rose-800 font-mono text-[10px]">
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* 14 Method Result Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {detectReport.results.map((r) => {
                  const isAi = r.prediction === 'ai';
                  const pct = Math.round(r.aiProbability * 100);
                  return (
                    <div
                      key={r.id}
                      className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                        isAi ? 'bg-rose-950/20 border-rose-800/60' : 'bg-emerald-950/20 border-emerald-800/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-bold text-white block truncate">{r.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {r.category} · {r.reference}
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

              {/* DetectGPT Perturbations & GPTZero Perplexity Tables */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2.5">
                  <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                    DetectGPT T5 Span Perturbations (span_length=2)
                  </h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {detectReport.detectGptPerturbations.map((p) => (
                      <div key={p.id} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] space-y-1">
                        <div className="flex items-center justify-between font-mono">
                          <span className="text-slate-300 font-bold">Пертурбация #{p.id}</span>
                          <span className="text-amber-300">
                            LL = {p.ll} · Δ = -{p.curvatureDiff}
                          </span>
                        </div>
                        <p className="text-slate-400 font-mono text-[10px] truncate">{p.maskedText}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2.5">
                  <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
                    GPTZero Пофразовая перплексия предложений
                  </h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {detectReport.gptZeroSentences.map((s, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between gap-2 text-[11px]"
                      >
                        <span className="text-slate-300 truncate flex-1">{s.sentence}</span>
                        <span className="font-mono text-slate-400 shrink-0">PPL {s.perplexity}</span>
                        <span
                          className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] shrink-0 ${
                            s.aiProb >= 0.5 ? 'bg-rose-950 text-rose-300' : 'bg-emerald-950 text-emerald-300'
                          }`}
                        >
                          {(s.aiProb * 100).toFixed(0)}% AI
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================== SUB-TAB 2: 7-CLASS ATTRIBUTION ===================== */}
      {subTab === 'attribution' && (
        <div className="space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Fingerprint className="h-4 w-4 text-amber-400" />
                7-классовая атрибуция модели-автора (attribution_benchmark.py)
              </h3>
              <div className="flex items-center gap-2 text-xs flex-wrap">
                {currentDnaResult && (
                  <button
                    type="button"
                    onClick={() => setAttrText(currentDnaResult)}
                    className="px-2.5 py-1 rounded-lg bg-emerald-950/70 text-emerald-300 border border-emerald-700/60 cursor-pointer"
                  >
                    🟢 Результат ДНК V5
                  </button>
                )}
                {currentContentText && (
                  <button
                    type="button"
                    onClick={() => setAttrText(currentContentText)}
                    className="px-2.5 py-1 rounded-lg bg-purple-950/70 text-purple-300 border border-purple-700/60 cursor-pointer"
                  >
                    🟣 Текст 2 (ИИ)
                  </button>
                )}
                {currentDonorText && (
                  <button
                    type="button"
                    onClick={() => setAttrText(currentDonorText)}
                    className="px-2.5 py-1 rounded-lg bg-blue-950/70 text-blue-300 border border-blue-700/60 cursor-pointer"
                  >
                    🔵 Текст 1 (Донор)
                  </button>
                )}
              </div>
            </div>

            <textarea
              rows={5}
              value={attrText}
              onChange={(e) => setAttrText(e.target.value)}
              placeholder="Вставьте текст для классификации источника: Human vs ChatGPT vs ChatGLM vs Dolly vs ChatGPT-turbo vs GPT4 vs Claude..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs lg:text-sm text-slate-200 font-mono leading-relaxed focus:outline-none focus:border-amber-500 resize-y"
            />

            {attrError && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-700 text-rose-200 text-xs">{attrError}</div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleRunAttribution}
                disabled={isAttributing}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-lg"
              >
                {isAttributing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
                Определить вероятный источник (7 классов LLM)
              </button>
            </div>
          </div>

          {attrReport && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-4 border-b border-slate-800 pb-4">
                <div>
                  <span className="text-xs text-slate-400 block">Вероятный источник генерации (Class #{attrReport.predictedIndex}):</span>
                  <div className="flex items-center gap-3 mt-1">
                    <span
                      className={`text-xl font-black px-3.5 py-1 rounded-xl border ${
                        attrReport.predictedClass === 'Human'
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-600'
                          : 'bg-rose-950 text-rose-300 border-rose-600'
                      }`}
                    >
                      {attrReport.predictedClass}
                    </span>
                    <span className="text-sm font-mono text-white font-bold">
                      Уверенность: {(attrReport.confidence * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
                <span className="text-xs font-mono text-slate-400">Время расчёта: {attrReport.elapsedMs} мс</span>
              </div>

              <div className="space-y-2.5">
                {attrReport.probabilities.map((p) => {
                  const pct = (p.probability * 100).toFixed(1);
                  const isTop = p.label === attrReport.predictedClass;
                  return (
                    <div key={p.label} className="space-y-1 text-xs">
                      <div className="flex items-center justify-between font-mono">
                        <span className={isTop ? 'text-white font-bold' : 'text-slate-300'}>
                          [{p.index}] {p.label}
                        </span>
                        <span className={isTop ? 'text-amber-300 font-bold' : 'text-slate-400'}>{pct}%</span>
                      </div>
                      <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 ${
                            p.label === 'Human'
                              ? 'bg-emerald-500'
                              : isTop
                                ? 'bg-gradient-to-r from-amber-500 to-rose-500'
                                : 'bg-indigo-500/70'
                          }`}
                          style={{ width: `${Math.max(2, Number(pct))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-1.5 text-xs">
                <div className="font-bold text-slate-200">Стилистическое обоснование атрибуции:</div>
                <ul className="list-disc list-inside text-slate-400 space-y-1">
                  {attrReport.rationale.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================== SUB-TAB 3: BENCHMARK & LENGTH CURVE ===================== */}
      {subTab === 'benchmark' && (
        <div className="space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-emerald-400" />
                Воспроизводимый бенчмарк (benchmark.py + cal_metrics + Multi-Length Curve)
              </h3>
              <label className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer border border-slate-700">
                <Upload className="h-3.5 w-3.5 text-cyan-400" />
                Загрузить JSONL / CSV корпус
                <input type="file" accept=".jsonl,.json,.csv,.tsv,.txt" onChange={handleUploadCorpus} className="hidden" />
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-950/70 p-4 rounded-xl border border-slate-800 text-xs">
              <div className="space-y-1">
                <span className="text-slate-300 font-semibold block">Домен / Датасет (dataset):</span>
                <select
                  value={benchDataset}
                  onChange={(e) => setBenchDataset(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200"
                >
                  <option value="All Domains">All Domains (весь корпус)</option>
                  {MGTBENCH_DATASETS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <span className="text-slate-300 font-semibold block">Генератор ИИ (detectLLM):</span>
                <select
                  value={benchLlm}
                  onChange={(e) => setBenchLlm(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200"
                >
                  <option value="All LLMs">All LLMs (все генераторы)</option>
                  {MGTBENCH_LLMS.filter((l) => l !== 'Human').map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <span className="text-slate-300 font-semibold block">Тестируемый детектор:</span>
                <select
                  value={benchMethod}
                  onChange={(e) => setBenchMethod(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200"
                >
                  {MGTBENCH_METHODS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id} ({m.category})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <textarea
              rows={5}
              value={customCorpusRaw}
              onChange={(e) => setCustomCorpusRaw(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-[11px] font-mono text-slate-300 focus:outline-none focus:border-emerald-500 resize-y"
              placeholder='JSONL {"dataset":"Essay","llm":"ChatGPT","label":1,"text":"..."} или CSV label,text'
            />

            {benchError && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-700 text-rose-200 text-xs">{benchError}</div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleRunBenchmark}
                disabled={isBenchmarking}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-lg"
              >
                {isBenchmarking ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                Запустить бенчмарк (60/40 Split + Multi-Length Curve)
              </button>
            </div>
          </div>

          {expReport && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-3 border-b border-slate-800 pb-4">
                <div>
                  <h4 className="text-base font-black text-white">
                    {expReport.methodName} · {expReport.datasetName} vs {expReport.detectLLM}
                  </h4>
                  <p className="text-xs text-slate-400">
                    Train: <strong className="text-slate-200">{expReport.trainSize}</strong> · Test:{' '}
                    <strong className="text-slate-200">{expReport.testSize}</strong> · Время: {expReport.elapsedMs} мс
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDownloadJson(expReport, `mgtbench_experiment_${expReport.methodId}.json`)}
                  className="px-3 py-1.5 rounded-lg bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/60 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" /> Экспорт отчёта
                </button>
              </div>

              {/* Train & Test Metric Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { title: 'Обучающая выборка (Train Split 60%)', m: expReport.trainMetrics, tone: 'border-slate-700' },
                  { title: 'Тестовая выборка (Test Split 40%)', m: expReport.testMetrics, tone: 'border-emerald-700/60' },
                ].map((blk) => (
                  <div key={blk.title} className={`bg-slate-950/90 border ${blk.tone} rounded-xl p-4 space-y-3`}>
                    <div className="text-xs font-bold text-slate-200">{blk.title}</div>
                    <div className="grid grid-cols-5 gap-2 text-center font-mono text-xs">
                      <div className="p-2 rounded bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">ACC</span>
                        <strong className="text-white">{(blk.m.accuracy * 100).toFixed(1)}%</strong>
                      </div>
                      <div className="p-2 rounded bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">PREC</span>
                        <strong className="text-cyan-300">{(blk.m.precision * 100).toFixed(1)}%</strong>
                      </div>
                      <div className="p-2 rounded bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">REC</span>
                        <strong className="text-indigo-300">{(blk.m.recall * 100).toFixed(1)}%</strong>
                      </div>
                      <div className="p-2 rounded bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">F1</span>
                        <strong className="text-amber-300">{(blk.m.f1 * 100).toFixed(1)}%</strong>
                      </div>
                      <div className="p-2 rounded bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">AUC</span>
                        <strong className="text-emerald-400">{blk.m.auc.toFixed(3)}</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* SVG Length Curve + Numeric Table */}
              {lengthCurveSvg && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                  <div className="lg:col-span-6 bg-slate-950/90 border border-slate-800 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-white">Кривая устойчивости к длине текста (Multi-Length Curve)</span>
                      <span className="font-mono text-[10px] text-slate-400">
                        <span className="text-emerald-400">● AUC</span> · <span className="text-amber-400">● F1</span>
                      </span>
                    </div>
                    <svg viewBox={`0 0 ${lengthCurveSvg.w} ${lengthCurveSvg.h}`} className="w-full h-52">
                      {[0, 0.25, 0.5, 0.75, 1].map((yVal) => {
                        const y = lengthCurveSvg.h - lengthCurveSvg.padY - yVal * (lengthCurveSvg.h - lengthCurveSvg.padY * 2);
                        return (
                          <g key={yVal}>
                            <line
                              x1={lengthCurveSvg.padX}
                              y1={y}
                              x2={lengthCurveSvg.w - lengthCurveSvg.padX}
                              y2={y}
                              stroke="#1e293b"
                              strokeDasharray="3 3"
                            />
                            <text x={8} y={y + 3} fill="#64748b" fontSize="9" fontFamily="monospace">
                              {yVal.toFixed(2)}
                            </text>
                          </g>
                        );
                      })}
                      <path d={lengthCurveSvg.f1Path} fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="5 3" />
                      <path d={lengthCurveSvg.aucPath} fill="none" stroke="#10b981" strokeWidth="3" />
                      {lengthCurveSvg.pts.map((p, i) => {
                        const x = lengthCurveSvg.padX + i * lengthCurveSvg.stepX;
                        const yAuc =
                          lengthCurveSvg.h - lengthCurveSvg.padY - p.auc * (lengthCurveSvg.h - lengthCurveSvg.padY * 2);
                        const yF1 =
                          lengthCurveSvg.h - lengthCurveSvg.padY - p.f1 * (lengthCurveSvg.h - lengthCurveSvg.padY * 2);
                        return (
                          <g key={p.label}>
                            <circle cx={x} cy={yAuc} r="4" fill="#10b981" />
                            <circle cx={x} cy={yF1} r="3.5" fill="#f59e0b" />
                            <text x={x} y={lengthCurveSvg.h - 6} textAnchor="middle" fill="#94a3b8" fontSize="9" fontFamily="monospace">
                              {p.label}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>

                  <div className="lg:col-span-6 bg-slate-950/90 border border-slate-800 rounded-xl p-4 overflow-x-auto">
                    <table className="w-full text-xs font-mono text-left">
                      <thead className="text-[10px] uppercase text-slate-400 border-b border-slate-800">
                        <tr>
                          <th className="py-2 pr-3">Длина</th>
                          <th className="py-2 pr-3">Acc</th>
                          <th className="py-2 pr-3">Precision</th>
                          <th className="py-2 pr-3">Recall</th>
                          <th className="py-2 pr-3">F1</th>
                          <th className="py-2">AUC</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {expReport.lengthCurve.map((pt) => (
                          <tr key={pt.label} className="hover:bg-slate-900/60">
                            <td className="py-2 pr-3 text-cyan-300 font-bold">{pt.label}</td>
                            <td className="py-2 pr-3 text-slate-200">{(pt.accuracy * 100).toFixed(1)}%</td>
                            <td className="py-2 pr-3 text-slate-300">{(pt.precision * 100).toFixed(1)}%</td>
                            <td className="py-2 pr-3 text-slate-300">{(pt.recall * 100).toFixed(1)}%</td>
                            <td className="py-2 pr-3 text-amber-300">{(pt.f1 * 100).toFixed(1)}%</td>
                            <td className="py-2 text-emerald-400 font-bold">{pt.auc.toFixed(3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===================== SUB-TAB 4: CATALOG OF 14 METHODS ===================== */}
      {subTab === 'catalog' && (
        <div className="space-y-5">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 text-xs">
              {(['All', 'Metric-based', 'Model-based'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCatalogFilter(cat)}
                  className={`px-3 py-1.5 rounded-lg font-bold border cursor-pointer ${
                    catalogFilter === cat
                      ? 'bg-cyan-600 text-white border-cyan-500'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  {cat === 'All' ? `Все (${MGTBENCH_METHODS.length})` : cat}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              placeholder="Поиск по названию, формуле или автору..."
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 w-64 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredCatalog.map((m) => (
              <div key={m.id} className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-white text-sm">{m.name}</h4>
                    <span className="text-[11px] font-mono text-slate-400">{m.reference}</span>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-md font-mono font-bold text-[10px] border ${
                      m.category === 'Metric-based'
                        ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                        : 'bg-indigo-950 text-indigo-300 border-indigo-700'
                    }`}
                  >
                    {m.category}
                  </span>
                </div>
                <p className="text-slate-300 leading-relaxed">{m.description}</p>
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-2 font-mono text-[11px] text-cyan-300 overflow-x-auto">
                  {m.formula}
                </div>
                <div className="flex justify-end">
                  <a
                    href={m.paperUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-indigo-300 hover:text-white"
                  >
                    Источник / Статья <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
