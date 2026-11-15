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
  Info,
  BookOpen,
  Cpu,
  BarChart2,
  Layers,
  Sparkles,
  ChevronRight,
  Maximize2,
  Search,
  Code2,
} from 'lucide-react';
import { DETAILED_DETECTORS, DetailedDetectorInfo } from './detectorData';
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
}

export function DetectorWorkbench({
  detectorId,
  onSelectDetector,
  onBack,
  currentDnaResult = '',
  currentContentText = '',
  currentDonorText = '',
}: DetectorWorkbenchProps) {
  const detector = DETAILED_DETECTORS[detectorId] || DETAILED_DETECTORS.gltr;

  // Input text state
  const [inputText, setInputText] = useState<string>(() => {
    return currentDnaResult || currentContentText || detector.sampleHumanText;
  });

  // Custom parameters state
  const [paramValues, setParamValues] = useState<Record<string, any>>(() => {
    const initial: Record<string, any> = {};
    detector.params.forEach(p => {
      initial[p.key] = p.defaultValue;
    });
    return initial;
  });

  // Audit state
  const [auditResult, setAuditResult] = useState<DeepAuditResult | null>(null);
  const [isAuditing, setIsAuditing] = useState<boolean>(false);
  const [copiedReport, setCopiedReport] = useState<boolean>(false);

  // Selected token for GLTR inspector popup
  const [inspectToken, setInspectToken] = useState<any | null>(null);

  // When detectorId changes, reset params to that detector defaults
  useEffect(() => {
    const initial: Record<string, any> = {};
    const d = DETAILED_DETECTORS[detectorId] || DETAILED_DETECTORS.gltr;
    d.params.forEach(p => {
      initial[p.key] = p.defaultValue;
    });
    setParamValues(initial);
  }, [detectorId]);

  // Execute deep audit
  const handleExecuteAudit = () => {
    if (!inputText.trim()) return;
    setIsAuditing(true);
    setInspectToken(null);

    setTimeout(() => {
      try {
        const result = runDeepAudit(detector.id, inputText, paramValues);
        setAuditResult(result);
      } catch (err) {
        console.error('Audit execution error:', err);
      } finally {
        setIsAuditing(false);
      }
    }, 250);
  };

  // Run automatically on first load of the workbench
  useEffect(() => {
    if (inputText.trim()) {
      handleExecuteAudit();
    }
  }, [detectorId]);

  const handleCopyReport = () => {
    if (!auditResult) return;
    const report = `=== АУДИТ ДЕТЕКТОРА ${detector.name.toUpperCase()} ===\n` +
      `Дата: ${new Date().toLocaleString()}\n` +
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
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(auditResult, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${detector.id}_deep_audit_report.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

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

            {/* Quick Detector Switcher Dropdown */}
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

          {/* GitHub Repo & Paper Link Badges */}
          <div className="flex items-center gap-3">
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

              {/* Academic Paper Citation */}
              <div className="pt-2 flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                <BookOpen className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                <span className="truncate">{detector.academicCitation}</span>
              </div>
            </div>

            {/* Scientific Mathematical Formula Box */}
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

            {/* Quick Load Buttons from App State */}
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
              <span>Символов: <strong className="text-slate-300 font-mono">{inputText.length}</strong> · Слов: <strong className="text-slate-300 font-mono">{inputText.split(/\s+/).filter(Boolean).length}</strong></span>
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

          {/* Detector Parameter Tuning Bar */}
          {detector.params.length > 0 && (
            <div className="bg-slate-950/80 border border-slate-800/80 p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Sliders className="h-3.5 w-3.5 text-indigo-400" />
                  Параметры калибровки и настройки алгоритма ({detector.shortName})
                </span>
                <span className="text-[10px] text-slate-500 font-normal">Параметры из оригинального GitHub-репозитория</span>
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
                            {val}{p.unit || ''}
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

                      <p className="text-[10px] text-slate-500 leading-tight">
                        {p.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Primary Action Button */}
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
            {/* Top Scoreboard: Dial Gauge + Core Verdict Card */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Dial Gauge Card */}
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
                    <div className="text-xl font-mono font-black text-emerald-300">{auditResult.humanProbability}%</div>
                  </div>
                  <div className="flex-1 p-2 rounded-xl bg-rose-950/60 border border-rose-800/50 text-center">
                    <div className="text-[10px] text-rose-400 uppercase font-bold">ИИ-Текст</div>
                    <div className="text-xl font-mono font-black text-rose-300">{auditResult.aiProbability}%</div>
                  </div>
                </div>
              </div>

              {/* Scientific Verdict & Core Metrics Card */}
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

                    <span className="text-xs font-mono px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                      Время: {auditResult.speedMs} мс
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    {auditResult.verdictText}
                  </p>

                  {/* Primary Metric Comparison */}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">{auditResult.primaryMetricLabel}</span>
                      <span className="text-xl font-mono font-black text-indigo-400">{auditResult.primaryMetricValue}</span>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Порог разделения классов</span>
                      <span className="text-xl font-mono font-black text-slate-300">{auditResult.thresholdValue}</span>
                    </div>
                  </div>
                </div>

                {/* Text Anatomy Telemetry */}
                <div className="pt-3 border-t border-slate-800/80 grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/60">
                    <div className="text-[10px] text-slate-500">Слов</div>
                    <div className="font-mono font-bold text-slate-200">{auditResult.stats.totalWords}</div>
                  </div>
                  <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/60">
                    <div className="text-[10px] text-slate-500">Ср. длина фразы</div>
                    <div className="font-mono font-bold text-slate-200">{auditResult.stats.avgSentenceLength} сл.</div>
                  </div>
                  <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/60">
                    <div className="text-[10px] text-slate-500">Burstiness (σ/μ)</div>
                    <div className="font-mono font-bold text-emerald-400">{auditResult.stats.burstiness}</div>
                  </div>
                  <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/60">
                    <div className="text-[10px] text-slate-500">Разнообразие TTR</div>
                    <div className="font-mono font-bold text-indigo-400">{auditResult.stats.typeTokenRatio}</div>
                  </div>
                </div>
              </div>
            </div>

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
                    {copiedReport ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
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

              {/* 1. GLTR LABORATORY: TOKEN RANK HEATMAP & HISTOGRAM */}
              {detector.id === 'gltr' && auditResult.details.tokens && (
                <div className="space-y-4">
                  {/* GLTR 4-Color Histogram */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-emerald-950/40 border border-emerald-700/50 p-3 rounded-xl">
                      <div className="flex items-center justify-between text-xs text-emerald-400 font-bold">
                        <span>Зеленый (Топ-10)</span>
                        <span>{auditResult.details.histogram.top10}%</span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mt-2">
                        <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${auditResult.details.histogram.top10}%` }}></div>
                      </div>
                      <span className="text-[10px] text-slate-400 block mt-1">Ожидаемо: &lt; 45% для человека</span>
                    </div>

                    <div className="bg-amber-950/40 border border-amber-700/50 p-3 rounded-xl">
                      <div className="flex items-center justify-between text-xs text-amber-400 font-bold">
                        <span>Желтый (Топ-100)</span>
                        <span>{auditResult.details.histogram.top100}%</span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mt-2">
                        <div className="bg-amber-500 h-full transition-all duration-500" style={{ width: `${auditResult.details.histogram.top100}%` }}></div>
                      </div>
                      <span className="text-[10px] text-slate-400 block mt-1">Средняя предсказуемость</span>
                    </div>

                    <div className="bg-rose-950/40 border border-rose-700/50 p-3 rounded-xl">
                      <div className="flex items-center justify-between text-xs text-rose-400 font-bold">
                        <span>Красный (Топ-1000)</span>
                        <span>{auditResult.details.histogram.top1000}%</span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mt-2">
                        <div className="bg-rose-500 h-full transition-all duration-500" style={{ width: `${auditResult.details.histogram.top1000}%` }}></div>
                      </div>
                      <span className="text-[10px] text-slate-400 block mt-1">Редкие лексические единицы</span>
                    </div>

                    <div className="bg-purple-950/40 border border-purple-700/50 p-3 rounded-xl">
                      <div className="flex items-center justify-between text-xs text-purple-400 font-bold">
                        <span>Фиолетовый (&gt;1000)</span>
                        <span>{auditResult.details.histogram.outOf1000}%</span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mt-2">
                        <div className="bg-purple-500 h-full transition-all duration-500" style={{ width: `${auditResult.details.histogram.outOf1000}%` }}></div>
                      </div>
                      <span className="text-[10px] text-slate-400 block mt-1">Авторские и редкие слова</span>
                    </div>
                  </div>

                  {/* Interactive Token Highlighter */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Нажмите на любое слово для просмотра ранга и машинных альтернатив:</span>
                      <span className="text-[10px] font-mono text-indigo-400">Клик по токену = Инспектор</span>
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

                  {/* Token Inspector Popup / Card */}
                  {inspectToken && (
                    <div className="p-4 rounded-xl bg-slate-950 border border-indigo-600/70 space-y-3 animate-in fade-in">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">Инспектор токена:</span>
                          <span className="font-mono font-bold text-white text-sm bg-slate-800 px-2 py-0.5 rounded">
                            «{inspectToken.word}»
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded font-mono font-bold ${
                            inspectToken.color === 'green' ? 'bg-emerald-950 text-emerald-300' :
                            inspectToken.color === 'yellow' ? 'bg-amber-950 text-amber-300' :
                            inspectToken.color === 'red' ? 'bg-rose-950 text-rose-300' : 'bg-purple-950 text-purple-300'
                          }`}>
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
                        <span className="text-[11px] text-slate-400 block font-semibold">Альтернативные варианты языковой модели при этой позиции:</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2">
                          {inspectToken.alts?.map((alt: any, i: number) => (
                            <div key={i} className="bg-slate-900 p-2 rounded-lg border border-slate-800 text-xs font-mono">
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

              {/* 2. BINOCULARS LABORATORY: PPL vs CrossPPL & Trajectories */}
              {detector.id === 'binoculars' && auditResult.details.sentenceTrajectories && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">Observer PPL (M1)</span>
                      <div className="text-lg font-mono font-bold text-emerald-400">{auditResult.details.observerPPL}</div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">Performer CrossPPL (M2, M1)</span>
                      <div className="text-lg font-mono font-bold text-indigo-400">{auditResult.details.performerCrossPPL}</div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">Отношение (Score) / Порог</span>
                      <div className="text-lg font-mono font-bold text-white">{auditResult.details.score} <span className="text-xs text-slate-400 font-normal">/ 0.9015</span></div>
                    </div>
                  </div>

                  {/* Sentence-by-Sentence Breakdown */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-300">Пофразовое распределение перплексий:</span>
                    <div className="space-y-1.5 max-h-72 overflow-y-auto">
                      {auditResult.details.sentenceTrajectories.map((s: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between gap-3 bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-xs font-mono">
                          <span className="text-slate-300 truncate flex-1">{idx + 1}. {s.sentence}</span>
                          <span className="text-indigo-400 font-bold shrink-0">{s.ratio}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] shrink-0 font-bold ${
                            s.isHuman ? 'bg-emerald-950 text-emerald-300' : 'bg-rose-950 text-rose-300'
                          }`}>
                            {s.isHuman ? 'Человек' : 'ИИ'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 3. DETECTGPT LABORATORY: PERTURBATION TABLE */}
              {detector.id === 'detectGpt' && auditResult.details.perturbations && (
                <div className="space-y-4">
                  <div className="text-xs text-slate-300">
                    Сгенерировано 10 T5-пертурбаций для оценки градиента кривизны лог-правдоподобия:
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-72 overflow-y-auto">
                    {auditResult.details.perturbations.map((p: any) => (
                      <div key={p.id} className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center text-xs font-mono">
                        <div>
                          <span className="text-slate-200 block font-semibold">{p.label}</span>
                          <span className="text-[10px] text-slate-400">log p = {p.perturbedLogP}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-emerald-400 font-bold block">Δ log p = -{p.diff}</span>
                          <span className="text-[10px] text-slate-500">Кривизна {p.varianceRatio}x</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 5. AITEXTJURY LABORATORY: COURTROOM JURY DELIBERATION */}
              {detector.id === 'aiTextJury' && auditResult.details.votes && (
                <div className="space-y-3">
                  <span className="text-xs font-bold text-slate-300">Протокол судебных прений коллегии экспертов:</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {auditResult.details.votes.map((v: any, idx: number) => (
                      <div key={idx} className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <span className="text-xs font-bold text-white">{v.juror}</span>
                          <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                            v.vote === 'Человек' ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' : 'bg-rose-950 text-rose-300 border border-rose-700'
                          }`}>
                            {v.vote} ({v.score}%)
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          «{v.argument}»
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 6. GENERAL FORENSIC DATA TABLE FOR OTHER DETECTORS */}
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
          </section>
        )}
      </main>
      )}
    </div>
  );
}
