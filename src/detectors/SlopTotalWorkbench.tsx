/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowLeft,
  ShieldAlert,
  Play,
  Zap,
  Globe,
  Layers,
  CheckSquare,
  Download,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  FileUp,
  ThumbsUp,
  Bot,
  SlidersHorizontal,
  HelpCircle,
  BarChart3,
  Eye,
} from 'lucide-react';
import {
  SLOPTOTAL_ENGINES,
  SLOPTOTAL_BAND_INFO,
  SLOPTOTAL_CALIBRATION,
  runSlopTotalAnalysis,
  runSlopTotalQuickScore,
  runSlopTotalParagraphAnalyze,
  type SlopAnalysisReport,
  type SlopQuickResult,
  type SlopParagraphReport,
  type SiteFingerprintResult,
  type PageClassificationResult,
} from '../../shared/sloptotalCore';

type SlopMode = 'analyze' | 'paragraph' | 'quick' | 'site';

interface SiteScanResponse {
  url: string;
  finalUrl: string;
  site: SiteFingerprintResult;
  pageType: PageClassificationResult;
  htmlFeatures: {
    list_count: number;
    list_items: number;
    headings: number;
    bold_count: number;
    paragraph_count: number;
    nav_links: number;
    form_count: number;
    code_blocks: number;
  };
  extractedText: string;
  text: SlopQuickResult | null;
}

interface SlopStats {
  totalAnalyses: number;
  totalQuickScans: number;
  totalParagraphScans: number;
  totalSiteScans: number;
  cachedReportsCount: number;
  verdictCounts: Record<string, number>;
  feedbackCounts: Record<string, number>;
}

interface SlopTotalWorkbenchProps {
  onBack?: () => void;
  currentDnaResult?: string;
  currentContentText?: string;
  currentDonorText?: string;
  embedded?: boolean;
  initialText?: string;
  onApplyScoreToMain?: (humanScore: number, aiScore: number, rawMetric: string) => void;
}

const SAMPLE_SLOPTOTAL_TEXT = `В рамках современной парадигмы развития гуманитарного знания следует отметить, что комплексный подход играет ключевую роль в понимании сложных социальных трансформаций. Более того, данное обстоятельство является неотъемлемым элементом устойчивого прогресса, позволяя выявлять скрытые взаимосвязи между традиционными ценностями и инновационными практиками. Подводя итог, важно подчеркнуть, что гармоничное сочетание анализа и синтеза открывает новые горизонты для дальнейших исследований.`;

function getVerdictColors(verdictKey: SlopAnalysisReport['verdictKey']) {
  switch (verdictKey) {
    case 'clean':
      return {
        bg: 'bg-emerald-950/60',
        border: 'border-emerald-600/70',
        text: 'text-emerald-300',
        badge: 'bg-emerald-950 text-emerald-300 border-emerald-600/70',
        bar: 'bg-emerald-500',
      };
    case 'low':
      return {
        bg: 'bg-teal-950/60',
        border: 'border-teal-600/70',
        text: 'text-teal-300',
        badge: 'bg-teal-950 text-teal-300 border-teal-600/70',
        bar: 'bg-teal-400',
      };
    case 'suspicious':
      return {
        bg: 'bg-amber-950/60',
        border: 'border-amber-600/70',
        text: 'text-amber-300',
        badge: 'bg-amber-950 text-amber-300 border-amber-600/70',
        bar: 'bg-amber-400',
      };
    case 'likely':
      return {
        bg: 'bg-orange-950/60',
        border: 'border-orange-600/70',
        text: 'text-orange-300',
        badge: 'bg-orange-950 text-orange-300 border-orange-600/70',
        bar: 'bg-orange-500',
      };
    case 'slop':
    default:
      return {
        bg: 'bg-rose-950/60',
        border: 'border-rose-600/70',
        text: 'text-rose-300',
        badge: 'bg-rose-950 text-rose-300 border-rose-600/70',
        bar: 'bg-rose-500',
      };
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function SlopTotalWorkbench({
  onBack,
  currentDnaResult = '',
  currentContentText = '',
  currentDonorText = '',
  embedded = false,
  initialText = '',
  onApplyScoreToMain,
}: SlopTotalWorkbenchProps) {
  const [mode, setMode] = useState<SlopMode>('analyze');
  const [inputKind, setInputKind] = useState<'text' | 'url'>('text');
  const [inputText, setInputText] = useState<string>(
    () => initialText || currentDnaResult || currentContentText || currentDonorText || SAMPLE_SLOPTOTAL_TEXT
  );
  const [inputUrl, setInputUrl] = useState<string>('');
  const [siteUrl, setSiteUrl] = useState<string>('');
  const [siteHtml, setSiteHtml] = useState<string>('');
  const [siteInputMode, setSiteInputMode] = useState<'url' | 'html'>('url');

  // Engine selection inside SlopTotal (all 23 by default)
  const [selectedEngines, setSelectedEngines] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SLOPTOTAL_ENGINES.map((e) => [e.key, true]))
  );
  const [fastMode, setFastMode] = useState<boolean>(false);
  const [showRemoteBridge, setShowRemoteBridge] = useState<boolean>(false);
  const [remoteUrl, setRemoteUrl] = useState<string>('');

  // Results & UI state
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [report, setReport] = useState<SlopAnalysisReport | null>(null);
  const [quickResult, setQuickResult] = useState<SlopQuickResult | null>(null);
  const [paragraphResult, setParagraphResult] = useState<SlopParagraphReport | null>(null);
  const [siteResult, setSiteResult] = useState<SiteScanResponse | null>(null);

  const [engineFilter, setEngineFilter] = useState<'all' | 'flagged' | 'classifier' | 'statistical' | 'linguistic'>('all');
  const [showMarkers, setShowMarkers] = useState<boolean>(true);
  const [copiedSummary, setCopiedSummary] = useState<boolean>(false);
  const [feedbackSent, setFeedbackSent] = useState<string | null>(null);
  const [stats, setStats] = useState<SlopStats | null>(null);

  useEffect(() => {
    if (initialText.trim()) setInputText(initialText);
  }, [initialText]);

  useEffect(() => {
    if (!report || !onApplyScoreToMain) return;
    const aiScore = Number(report.overallScore);
    const humanScore = Number.isFinite(report.humanScore) ? Number(report.humanScore) : 100 - aiScore;
    onApplyScoreToMain(humanScore, aiScore, `${aiScore}/100 · ${report.enginesFlagged}/${report.enginesTotal} движков`);
  }, [report]);

  const selectedEngineKeys = useMemo(
    () => SLOPTOTAL_ENGINES.filter((e) => selectedEngines[e.key]).map((e) => e.key),
    [selectedEngines]
  );

  const loadStats = async () => {
    try {
      const r = await fetch('/api/sloptotal/stats');
      if (r.ok) setStats(await r.json());
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const setEnginePreset = (preset: 'all' | 'quick' | 'heuristics' | 'calibrated' | 'none') => {
    const next: Record<string, boolean> = {};
    for (const e of SLOPTOTAL_ENGINES) {
      if (preset === 'all') next[e.key] = true;
      else if (preset === 'none') next[e.key] = false;
      else if (preset === 'quick') next[e.key] = e.isQuick;
      else if (preset === 'heuristics') next[e.key] = e.engineType === 'linguistic';
      else if (preset === 'calibrated') {
        const w =
          (SLOPTOTAL_CALIBRATION.english.weights as Record<string, number>)[e.key] ||
          (SLOPTOTAL_CALIBRATION.multilingual.weights as Record<string, number>)[e.key] ||
          0;
        next[e.key] = w > 0;
      }
    }
    setSelectedEngines(next);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const raw = await file.text();
      if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
        const stripped = raw
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        setInputText(stripped);
      } else {
        setInputText(raw);
      }
      setInputKind('text');
      setErrorMsg(null);
    } catch {
      setErrorMsg('Не удалось прочитать файл.');
    } finally {
      e.target.value = '';
    }
  };

  const runAnalyze = async (forceAll23: boolean) => {
    const keys = forceAll23 ? SLOPTOTAL_ENGINES.map((e) => e.key) : selectedEngineKeys;
    if (!forceAll23 && keys.length === 0) {
      setErrorMsg('Выберите хотя бы 1 движок SlopTotal галочкой или нажмите «Полный скан (23 движка)».');
      return;
    }
    if (inputKind === 'text' && inputText.trim().length < 50) {
      setErrorMsg('Для анализа SlopTotal необходимо минимум 50 символов текста.');
      return;
    }
    if (inputKind === 'url' && !inputUrl.trim()) {
      setErrorMsg('Введите URL публичной страницы.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setFeedbackSent(null);
    try {
      const resp = await fetch('/api/sloptotal/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: inputKind === 'text' ? inputText : undefined,
          url: inputKind === 'url' ? inputUrl.trim() : undefined,
          selectedEngineKeys: forceAll23 ? undefined : keys,
          fast: fastMode,
          remoteUrl: remoteUrl.trim() || undefined,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || 'Ошибка анализа SlopTotal');
      setReport(data);
      loadStats();
    } catch (err: any) {
      if (inputKind === 'text') {
        const local = runSlopTotalAnalysis(inputText, {
          selectedEngineKeys: forceAll23 ? undefined : keys,
          fast: fastMode,
        });
        setReport(local);
      } else {
        setErrorMsg(err?.message || 'Ошибка анализа');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const runQuick = async () => {
    if (inputKind === 'text' && inputText.trim().length < 50) {
      setErrorMsg('Минимум 50 символов для Quick Score.');
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const resp = await fetch('/api/sloptotal/quick-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: inputKind === 'text' ? inputText : undefined,
          url: inputKind === 'url' ? inputUrl.trim() : undefined,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || 'Ошибка Quick Score');
      setQuickResult(data);
      loadStats();
    } catch (err: any) {
      if (inputKind === 'text') {
        setQuickResult(runSlopTotalQuickScore(inputText));
      } else {
        setErrorMsg(err?.message || 'Ошибка Quick Score');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const runParagraphs = async () => {
    if (inputKind === 'text' && inputText.trim().length < 50) {
      setErrorMsg('Минимум 50 символов для поабзацного анализа.');
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const resp = await fetch('/api/sloptotal/paragraph-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: inputKind === 'text' ? inputText : undefined,
          url: inputKind === 'url' ? inputUrl.trim() : undefined,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || 'Ошибка поабзацного разбора');
      setParagraphResult(data);
      loadStats();
    } catch (err: any) {
      if (inputKind === 'text') {
        setParagraphResult(runSlopTotalParagraphAnalyze(inputText));
      } else {
        setErrorMsg(err?.message || 'Ошибка поабзацного разбора');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const runSiteScan = async () => {
    if (siteInputMode === 'url' && !siteUrl.trim()) {
      setErrorMsg('Укажите URL сайта для сканирования отпечатков конструкторов.');
      return;
    }
    if (siteInputMode === 'html' && !siteHtml.trim()) {
      setErrorMsg('Вставьте HTML-код страницы.');
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const resp = await fetch('/api/sloptotal/scan/site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: siteInputMode === 'url' ? siteUrl.trim() : siteUrl.trim() || undefined,
          html: siteInputMode === 'html' ? siteHtml : undefined,
          includeText: true,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || 'Ошибка сканирования сайта');
      setSiteResult(data);
      loadStats();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Ошибка сканирования сайта');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFeedback = async (verdict: 'human' | 'ai' | 'mixed' | 'unsure') => {
    if (!report) return;
    try {
      const resp = await fetch(`/api/sloptotal/report/${encodeURIComponent(report.id)}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verdict }),
      });
      if (resp.ok) {
        setFeedbackSent(verdict);
        loadStats();
      }
    } catch {
      setFeedbackSent(verdict);
    }
  };

  const handleExportJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sloptotal-${report.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopySummary = async () => {
    if (!report) return;
    const lines = [
      `SlopTotal Report (${report.id})`,
      `Overall AI Score: ${report.overallScore}/100 (${report.overallVerdict}) | Human: ${report.humanScore}%`,
      `Language: ${report.language} (${report.languageSupport}) | Words: ${report.wordCount} | Confidence: ${report.confidence}`,
      `Engines flagged: ${report.enginesFlagged}/${report.enginesTotal}`,
      '',
      ...report.engineResults.map(
        (e) => `- ${e.engineName} [${e.engineType}]: ${Math.round(e.score * 100)}% (${e.verdict}) — ${e.details}`
      ),
    ];
    await navigator.clipboard.writeText(lines.join('\n'));
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  const filteredEngines = useMemo(() => {
    if (!report) return [];
    const list = [...report.engineResults].sort((a, b) => b.score - a.score);
    if (engineFilter === 'all') return list;
    if (engineFilter === 'flagged') return list.filter((e) => e.score >= 0.4);
    if (engineFilter === 'statistical') return list.filter((e) => e.engineType === 'statistical' || e.engineType === 'embedding');
    return list.filter((e) => e.engineType === engineFilter);
  }, [report, engineFilter]);

  const highlightedExcerpt = useMemo(() => {
    if (!report) return null;
    const text = report.textExcerpt.slice(0, 4000);
    if (!report.matchedMarkers || report.matchedMarkers.length === 0) {
      return <span>{text}</span>;
    }
    const cleanMarkers = report.matchedMarkers
      .filter((m) => m.length >= 3 && !m.includes('('))
      .slice(0, 40);
    if (cleanMarkers.length === 0) return <span>{text}</span>;
    const regex = new RegExp(`(${cleanMarkers.map(escapeRegExp).join('|')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, idx) =>
      regex.test(part) ? (
        <mark key={idx} className="bg-rose-500/30 text-rose-200 border border-rose-500/50 rounded px-1">
          {part}
        </mark>
      ) : (
        <React.Fragment key={idx}>{part}</React.Fragment>
      )
    );
  }, [report]);

  const verdictStyle = report ? getVerdictColors(report.verdictKey) : getVerdictColors('clean');

  return (
    <div className={`${embedded ? '' : 'min-h-screen bg-slate-950 p-6'} text-slate-100 space-y-6`}>
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/70 to-slate-900 border border-indigo-700/60 rounded-2xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" />
                Назад
              </button>
            )}
            <div className="p-2.5 rounded-xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-300">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-white">SlopTotal — VirusTotal для проверки AI-текстов и сайтов</h2>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700/60 font-mono font-bold">
                  23 движка • Калибровка SlopBench ({SLOPTOTAL_CALIBRATION.version})
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Полный порт <a href="https://github.com/pablocaeg/sloptotal" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline font-mono">github.com/pablocaeg/sloptotal</a>: 9 классификаторов, 7 стат/zero-shot движков, 6 лингво-эвристик, 18 языков, поабзацная тепловая карта и сканер AI-конструкторов сайтов.
              </p>
            </div>
          </div>

          {stats && (
            <div className="flex items-center gap-3 text-[11px] bg-slate-950/70 px-3 py-2 rounded-xl border border-slate-800">
              <span className="text-slate-400">
                Проверок в сессии: <strong className="text-white font-mono">{stats.totalAnalyses}</strong>
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-400">
                Абзацев: <strong className="text-indigo-300 font-mono">{stats.totalParagraphScans}</strong>
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-400">
                Сайтов: <strong className="text-emerald-300 font-mono">{stats.totalSiteScans}</strong>
              </span>
            </div>
          )}
        </div>

        {/* Sub-mode tabs */}
        <div className="flex items-center gap-2 flex-wrap border-t border-slate-800/80 pt-3">
          {(
            [
              { id: 'analyze', label: '🔍 Полный анализ (23 движка / Выбор)', Icon: BarChart3 },
              { id: 'paragraph', label: '🗺️ Поабзацная тепловая карта', Icon: Layers },
              { id: 'quick', label: '⚡ Быстрый скан (Quick Score)', Icon: Zap },
              { id: 'site', label: '🌐 Сканер сайтов (Lovable / v0 / Bolt / Replit...)', Icon: Globe },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setMode(id);
                setErrorMsg(null);
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                mode === id
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                  : 'bg-slate-950/70 text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* MODE: SITE SCANNER */}
      {mode === 'site' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-5 shadow-xl">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-sm font-bold text-white">Детектор AI-конструкторов сайтов и классификатор страниц</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Определяет следы 8 платформ: <strong>Lovable, v0, Bolt, Base44, Replit, Same, Anything (Create), Emergent</strong> + тип страницы и оценку текста.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setSiteInputMode('url')}
                className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer ${
                  siteInputMode === 'url' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
                }`}
              >
                По URL
              </button>
              <button
                type="button"
                onClick={() => setSiteInputMode('html')}
                className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer ${
                  siteInputMode === 'html' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
                }`}
              >
                Вставить HTML
              </button>
            </div>
          </div>

          {siteInputMode === 'url' ? (
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="url"
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                placeholder="https://example.lovable.app или любой публичный URL..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={runSiteScan}
                disabled={isLoading}
                className="px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                Сканировать сайт
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <input
                type="url"
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                placeholder="URL страницы (опционально, для проверки домена .lovable.app / .bolt.host и т.д.)"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
              />
              <textarea
                rows={7}
                value={siteHtml}
                onChange={(e) => setSiteHtml(e.target.value)}
                placeholder="Вставьте исходный HTML страницы (<!DOCTYPE html>...)..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={runSiteScan}
                disabled={isLoading}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                Проанализировать HTML
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-700 text-xs text-rose-200 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {siteResult && (
            <div className="space-y-4 pt-3 border-t border-slate-800">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Вердикт конструкторов</span>
                  <div className="text-sm font-bold text-white">{siteResult.site.verdict}</div>
                  {siteResult.site.generator && (
                    <div className="text-[11px] font-mono text-indigo-300">meta generator: {siteResult.site.generator}</div>
                  )}
                </div>
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Классификация страницы</span>
                  <div className="text-sm font-bold text-emerald-300">
                    {siteResult.pageType.label} ({siteResult.pageType.type})
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Пригодна для текстового скоринга: {siteResult.pageType.scoreable ? 'Да' : 'Нет'}
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Быстрая оценка текста страницы</span>
                  {siteResult.text ? (
                    <div className="text-sm font-bold text-white">
                      {siteResult.text.score}/100 AI ({siteResult.text.verdict.toUpperCase()}) • {siteResult.text.wordCount} сл.
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400">Недостаточно прозаического текста на странице</div>
                  )}
                </div>
              </div>

              {siteResult.site.builders.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {siteResult.site.builders.map((b) => (
                    <div key={b.name} className="p-4 rounded-xl bg-slate-950 border border-indigo-700/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <a href={b.url} target="_blank" rel="noreferrer" className="font-bold text-sm text-indigo-300 hover:underline flex items-center gap-1">
                          {b.name}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                            b.confidence === 'confirmed'
                              ? 'bg-rose-950 text-rose-300 border border-rose-700'
                              : 'bg-amber-950 text-amber-300 border border-amber-700'
                          }`}
                        >
                          {b.confidence}
                        </span>
                      </div>
                      <ul className="text-xs text-slate-300 space-y-1 list-disc list-inside">
                        {b.evidence.map((ev, i) => (
                          <li key={i}>{ev}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap gap-3 text-[11px] text-slate-400 font-mono">
                <span>&lt;p&gt;: {siteResult.htmlFeatures.paragraph_count}</span>
                <span>&lt;h1-h6&gt;: {siteResult.htmlFeatures.headings}</span>
                <span>&lt;ul/ol&gt;: {siteResult.htmlFeatures.list_count}</span>
                <span>&lt;li&gt;: {siteResult.htmlFeatures.list_items}</span>
                <span>&lt;strong/b&gt;: {siteResult.htmlFeatures.bold_count}</span>
                <span>&lt;nav a&gt;: {siteResult.htmlFeatures.nav_links}</span>
                <span>&lt;form&gt;: {siteResult.htmlFeatures.form_count}</span>
                <span>&lt;code/pre&gt;: {siteResult.htmlFeatures.code_blocks}</span>
              </div>

              {siteResult.extractedText && (
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs text-slate-400">Извлечено {siteResult.extractedText.length} симв. текста.</span>
                  <button
                    type="button"
                    onClick={() => {
                      setInputText(siteResult.extractedText);
                      setInputKind('text');
                      setMode('analyze');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer"
                  >
                    Передать текст в 23 движка SlopTotal →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* INPUT BLOCK FOR ANALYZE / PARAGRAPH / QUICK */}
      {mode !== 'site' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setInputKind('text')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                  inputKind === 'text' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
                }`}
              >
                Текст / Файл
              </button>
              <button
                type="button"
                onClick={() => setInputKind('url')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                  inputKind === 'url' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
                }`}
              >
                Публичный URL
              </button>
              {inputKind === 'text' && (
                <>
                  {currentDnaResult && (
                    <button
                      type="button"
                      onClick={() => setInputText(currentDnaResult)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 text-[11px] font-semibold cursor-pointer"
                    >
                      🟢 Результат ДНК V5
                    </button>
                  )}
                  {currentContentText && (
                    <button
                      type="button"
                      onClick={() => setInputText(currentContentText)}
                      className="px-2.5 py-1 rounded-lg bg-purple-950/80 text-purple-300 border border-purple-700/60 text-[11px] font-semibold cursor-pointer"
                    >
                      🟣 Текст 2 (ИИ)
                    </button>
                  )}
                  {currentDonorText && (
                    <button
                      type="button"
                      onClick={() => setInputText(currentDonorText)}
                      className="px-2.5 py-1 rounded-lg bg-indigo-950/80 text-indigo-300 border border-indigo-700/60 text-[11px] font-semibold cursor-pointer"
                    >
                      🔵 Текст 1 (Донор)
                    </button>
                  )}
                  <label className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-semibold cursor-pointer inline-flex items-center gap-1">
                    <FileUp className="h-3 w-3" />
                    <span>Загрузить .txt/.md/.html</span>
                    <input type="file" accept=".txt,.md,.html,.htm" onChange={handleFileUpload} className="hidden" />
                  </label>
                </>
              )}
            </div>

            <span className="text-[11px] font-mono text-slate-400">
              {inputKind === 'text' ? `${inputText.length} симв. • ~${inputText.trim() ? inputText.trim().split(/\s+/).length : 0} сл.` : 'URL Fetch + HTML Strip'}
            </span>
          </div>

          {inputKind === 'text' ? (
            <textarea
              rows={7}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Вставьте минимум 50 символов текста для проверки движками SlopTotal..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 resize-y"
            />
          ) : (
            <input
              type="url"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="https://example.com/article"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          )}

          {/* Engine Checkboxes Matrix in Analyze Mode */}
          {mode === 'analyze' && (
            <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                  <CheckSquare className="h-4 w-4 text-indigo-400" />
                  <span>Выбор движков SlopTotal ({selectedEngineKeys.length} из {SLOPTOTAL_ENGINES.length}):</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                  <button
                    type="button"
                    onClick={() => setEnginePreset('all')}
                    className="px-2.5 py-1 rounded-lg bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-800 cursor-pointer"
                  >
                    Все 23
                  </button>
                  <button
                    type="button"
                    onClick={() => setEnginePreset('quick')}
                    className="px-2.5 py-1 rounded-lg bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 cursor-pointer"
                  >
                    6 Quick
                  </button>
                  <button
                    type="button"
                    onClick={() => setEnginePreset('heuristics')}
                    className="px-2.5 py-1 rounded-lg bg-amber-950 hover:bg-amber-900 text-amber-300 border border-amber-800 cursor-pointer"
                  >
                    6 Эвристик
                  </button>
                  <button
                    type="button"
                    onClick={() => setEnginePreset('calibrated')}
                    className="px-2.5 py-1 rounded-lg bg-purple-950 hover:bg-purple-900 text-purple-300 border border-purple-800 cursor-pointer"
                  >
                    Взвешенные SlopBench
                  </button>
                  <button
                    type="button"
                    onClick={() => setEnginePreset('none')}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 cursor-pointer"
                  >
                    Снять все
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 max-h-60 overflow-y-auto pr-1">
                {SLOPTOTAL_ENGINES.map((eng) => {
                  const checked = !!selectedEngines[eng.key];
                  return (
                    <label
                      key={eng.key}
                      className={`flex items-center gap-2 p-2 rounded-lg border text-[11px] cursor-pointer transition ${
                        checked
                          ? 'bg-indigo-950/40 border-indigo-700/70 text-slate-100'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setSelectedEngines((prev) => ({ ...prev, [eng.key]: e.target.checked }))}
                        className="w-3.5 h-3.5 rounded text-indigo-600 bg-slate-800 border-slate-700 shrink-0"
                      />
                      <span className="truncate font-semibold flex-1" title={eng.description}>
                        {eng.name}
                      </span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                        {eng.tier}
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="flex items-center justify-between flex-wrap gap-3 pt-2 border-t border-slate-800/70 text-xs">
                <div className="flex items-center gap-4 flex-wrap">
                  <label className="inline-flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={fastMode}
                      onChange={(e) => setFastMode(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-indigo-600 bg-slate-800 border-slate-700"
                    />
                    <span>Fast mode</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowRemoteBridge((v) => !v)}
                    className="text-[11px] text-slate-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                  >
                    <SlidersHorizontal className="h-3 w-3" />
                    <span>{showRemoteBridge ? 'Скрыть внешний Docker URL' : 'Внешний Docker SlopTotal URL (опц.)'}</span>
                  </button>
                </div>

                {showRemoteBridge && (
                  <input
                    type="url"
                    value={remoteUrl}
                    onChange={(e) => setRemoteUrl(e.target.value)}
                    placeholder="http://localhost:8000 (если поднят Python SlopTotal)"
                    className="w-full sm:w-80 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                )}
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-700 text-xs text-rose-200 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-3 flex-wrap">
            {mode === 'analyze' && (
              <>
                <button
                  type="button"
                  onClick={() => runAnalyze(false)}
                  disabled={isLoading || selectedEngineKeys.length === 0}
                  className="px-5 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-lg"
                >
                  {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckSquare className="h-4 w-4" />}
                  Запустить выбранные ({selectedEngineKeys.length}/23)
                </button>
                <button
                  type="button"
                  onClick={() => runAnalyze(true)}
                  disabled={isLoading}
                  className="px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white font-bold text-xs flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-lg"
                >
                  {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Полный скан (все 23 движка)
                </button>
              </>
            )}

            {mode === 'paragraph' && (
              <button
                type="button"
                onClick={runParagraphs}
                disabled={isLoading}
                className="px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-lg"
              >
                {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
                Построить поабзацную тепловую карту
              </button>
            )}

            {mode === 'quick' && (
              <button
                type="button"
                onClick={runQuick}
                disabled={isLoading}
                className="px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-lg"
              >
                {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                Выполнить Quick Score (6 движков)
              </button>
            )}
          </div>
        </div>
      )}

      {/* QUICK RESULT */}
      {mode === 'quick' && quickResult && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-xl">
          <div className="flex items-center justify-between flex-wrap gap-4 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-4">
              <div className="text-4xl font-mono font-black text-white">
                {quickResult.score}
                <span className="text-base text-slate-400 font-normal">/100 AI</span>
              </div>
              <div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold border ${
                    quickResult.verdict === 'clean'
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-600'
                      : quickResult.verdict === 'mixed'
                        ? 'bg-amber-950 text-amber-300 border-amber-600'
                        : 'bg-rose-950 text-rose-300 border-rose-600'
                  }`}
                >
                  {quickResult.verdict.toUpperCase()} • {quickResult.humanScore}% Человек
                </span>
                <div className="text-xs text-slate-400 mt-1">
                  Язык: <strong className="text-slate-200">{quickResult.language}</strong> ({quickResult.languageSupport}) • {quickResult.wordCount} сл. • Уверенность: {quickResult.confidence}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {quickResult.engines.map((e) => (
              <div key={e.engine} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-white">{e.name}</span>
                  <span
                    className={`font-mono font-bold text-xs ${
                      e.verdict === 'clean' ? 'text-emerald-400' : e.verdict === 'suspicious' ? 'text-amber-400' : 'text-rose-400'
                    }`}
                  >
                    {e.score}% AI
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full ${
                      e.verdict === 'clean' ? 'bg-emerald-500' : e.verdict === 'suspicious' ? 'bg-amber-400' : 'bg-rose-500'
                    }`}
                    style={{ width: `${Math.min(100, e.score)}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400">{e.details}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PARAGRAPH HEATMAP RESULT */}
      {mode === 'paragraph' && paragraphResult && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-xl">
          <div className="flex items-center justify-between flex-wrap gap-3 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-sm font-bold text-white">Поабзацная тепловая карта ({paragraphResult.paragraphCount} абз.)</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Взвешенный по длине AI-балл: <strong className="text-white font-mono">{paragraphResult.overallScore}/100</strong> ({paragraphResult.overallVerdict}) • AI-абзацев (&gt;65): <strong className="text-rose-400">{paragraphResult.aiParagraphCount}</strong>
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {paragraphResult.paragraphs.map((p) => {
              const barColor =
                p.verdict === 'clean'
                  ? 'border-emerald-700/60 bg-emerald-950/20'
                  : p.verdict === 'mixed'
                    ? 'border-amber-700/60 bg-amber-950/20'
                    : 'border-rose-700/60 bg-rose-950/25';
              const pill =
                p.verdict === 'clean'
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                  : p.verdict === 'mixed'
                    ? 'bg-amber-950 text-amber-300 border-amber-700'
                    : 'bg-rose-950 text-rose-300 border-rose-700';

              return (
                <div key={p.index} className={`p-4 rounded-xl border ${barColor} space-y-2`}>
                  <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                    <span className="font-mono text-slate-400">
                      Абзац #{p.index + 1} • {p.wordCount} сл. ({p.charCount} симв.)
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full font-mono font-bold border text-[11px] ${pill}`}>
                        {p.score}/100 AI ({p.verdict})
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">{p.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* FULL 23-ENGINE REPORT */}
      {mode === 'analyze' && report && (
        <div className="space-y-5">
          {/* Score Hero Card */}
          <div className={`rounded-2xl border p-6 shadow-2xl space-y-5 ${verdictStyle.bg} ${verdictStyle.border}`}>
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-4xl font-mono font-black text-white">
                    {report.overallScore}
                    <span className="text-base text-slate-400 font-normal">/100 AI</span>
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold border ${verdictStyle.badge}`}>
                    {report.overallVerdict}
                  </span>
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-950/80 text-emerald-300 border border-emerald-700/60 font-mono">
                    Человек: {report.humanScore}%
                  </span>
                </div>
                <div className="flex items-center gap-3 flex-wrap text-xs text-slate-300">
                  <span>
                    Язык: <strong className="text-white uppercase">{report.language}</strong> ({report.languageSupport})
                  </span>
                  <span>•</span>
                  <span>
                    Слов: <strong className="text-white font-mono">{report.wordCount}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Флагов движков: <strong className="text-white font-mono">{report.enginesFlagged}/{report.enginesTotal}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Диапазон: <strong className="text-white font-mono">{Math.round(report.scoreRange[0])}–{Math.round(report.scoreRange[1])}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Уверенность: <strong className="text-white uppercase">{report.confidence}</strong>
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleCopySummary}
                  className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedSummary ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedSummary ? 'Скопировано' : 'Копировать отчёт'}
                </button>
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  JSON
                </button>
              </div>
            </div>

            {/* 5-Band SlopBench Calibration Scale */}
            <div className="space-y-2">
              <div className="relative h-4 rounded-full overflow-hidden flex border border-slate-800 bg-slate-950">
                <div style={{ width: '30%' }} className="bg-emerald-500/75" title="0–30 Clean" />
                <div style={{ width: '15%' }} className="bg-teal-400/75" title="30–45 Low risk" />
                <div style={{ width: '10%' }} className="bg-amber-400/80" title="45–55 Suspicious" />
                <div style={{ width: '25%' }} className="bg-orange-500/80" title="55–80 Likely AI" />
                <div style={{ width: '20%' }} className="bg-rose-500/85" title="80–100 Slop" />
                <div
                  className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_8px_#fff]"
                  style={{ left: `calc(${Math.min(99, Math.max(1, report.overallScore))}% - 2px)` }}
                />
              </div>
              <div className="grid grid-cols-5 text-[10px] font-mono text-slate-300">
                {SLOPTOTAL_BAND_INFO.map((b) => (
                  <div key={b.key} title={b.desc}>
                    <span className="font-bold">{b.range}</span> {b.labelRu}
                  </div>
                ))}
              </div>
            </div>

            {report.notes.length > 0 && (
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
                {report.notes.map((n, i) => (
                  <div key={i} className="text-xs text-amber-300 flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{n}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Highlighted Markers Excerpt */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <Eye className="h-4 w-4 text-rose-400" />
                <span>Подсвеченные AI-маркеры и шаблоны ({report.matchedMarkers.length} шт.)</span>
              </div>
              <button
                type="button"
                onClick={() => setShowMarkers((v) => !v)}
                className="text-xs text-indigo-400 hover:underline cursor-pointer"
              >
                {showMarkers ? 'Скрыть фрагмент' : 'Показать фрагмент'}
              </button>
            </div>
            {report.matchedMarkers.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {report.matchedMarkers.map((m, idx) => (
                  <span key={idx} className="px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800/70 text-[11px] font-mono">
                    {m}
                  </span>
                ))}
              </div>
            )}
            {showMarkers && (
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 leading-relaxed max-h-56 overflow-y-auto whitespace-pre-wrap">
                {highlightedExcerpt}
              </div>
            )}
          </div>

          {/* 23-Engine Breakdown */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h3 className="text-sm font-bold text-white">
                Разбивка по движкам ({filteredEngines.length} из {report.engineResults.length})
              </h3>
              <div className="flex items-center gap-1.5 flex-wrap text-xs">
                {(
                  [
                    { id: 'all', label: 'Все' },
                    { id: 'flagged', label: 'С флагом (≥40%)' },
                    { id: 'classifier', label: 'Классификаторы' },
                    { id: 'statistical', label: 'Статистика / Zero-Shot' },
                    { id: 'linguistic', label: 'Лингво-эвристики' },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setEngineFilter(f.id)}
                    className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                      engineFilter === f.id ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {filteredEngines.map((eng) => {
                const pct = Math.round(eng.score * 100);
                const barCls =
                  eng.verdict === 'clean' ? 'bg-emerald-500' : eng.verdict === 'suspicious' ? 'bg-amber-400' : 'bg-rose-500';
                const badgeCls =
                  eng.verdict === 'clean'
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                    : eng.verdict === 'suspicious'
                      ? 'bg-amber-950 text-amber-300 border-amber-700'
                      : 'bg-rose-950 text-rose-300 border-rose-700';

                return (
                  <div key={eng.key} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs text-white">{eng.engineName}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                          {eng.engineType}
                        </span>
                        {eng.url && (
                          <a
                            href={eng.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-0.5 text-[10px]"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-28 h-2 rounded-full bg-slate-800 overflow-hidden">
                          <div className={`h-full ${barCls}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="font-mono font-bold text-xs text-white w-10 text-right">{pct}%</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase ${badgeCls}`}>
                          {eng.verdict}
                        </span>
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-300">{eng.details}</div>
                    <div className="text-[10px] text-slate-500">{eng.description}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Anonymous Feedback */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3 text-xs">
            <span className="text-slate-300 font-semibold">Обратная связь по точности отчёта (как в SlopTotal):</span>
            {feedbackSent ? (
              <span className="text-emerald-400 font-bold">Спасибо! Ваша оценка ({feedbackSent}) учтена.</span>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleFeedback('human')}
                  className="px-3 py-1.5 rounded-lg bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 flex items-center gap-1 cursor-pointer"
                >
                  <ThumbsUp className="h-3.5 w-3.5" /> Человек
                </button>
                <button
                  type="button"
                  onClick={() => handleFeedback('ai')}
                  className="px-3 py-1.5 rounded-lg bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 flex items-center gap-1 cursor-pointer"
                >
                  <Bot className="h-3.5 w-3.5" /> ИИ
                </button>
                <button
                  type="button"
                  onClick={() => handleFeedback('mixed')}
                  className="px-3 py-1.5 rounded-lg bg-amber-950 hover:bg-amber-900 text-amber-300 border border-amber-800 cursor-pointer"
                >
                  Смешанный
                </button>
                <button
                  type="button"
                  onClick={() => handleFeedback('unsure')}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1 cursor-pointer"
                >
                  <HelpCircle className="h-3.5 w-3.5" /> Не уверен
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
