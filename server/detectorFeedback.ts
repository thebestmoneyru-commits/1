/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  runSlopTotalAnalysis,
  runSlopTotalParagraphAnalyze,
} from '../shared/sloptotalCore.ts';
import { runMgtEvalDetection } from '../shared/mgtEvalCore.ts';
import { runMgtBenchDetection } from '../shared/mgtBenchCore.ts';
import { runDetectZooTextSuite } from '../shared/detectZooCore.ts';
import {
  splitSentences,
  type DetectorShields,
  type DiagnosticReport,
} from './humanizerPipeline.ts';

export interface DonorDetectorBaseline {
  compositeAiPct: number;
  slopScore: number;
  phdIntrinsicDim: number;
  gecscoreRouge2: number;
  biscopeBce: number;
  remodetectReward: number;
  gltrTop10Pct: number;
  burstiness: number;
}

export interface DetectorFeedbackReport {
  compositeAiPct: number;
  slopScore: number;
  mgtEvalAiPct: number;
  mgtBenchAiPct: number;
  detectZooAiPct: number;
  phdIntrinsicDim: number;
  gecscoreRouge2: number;
  biscopeBce: number;
  remodetectReward: number;
  gltrTop10Pct: number;
  donorDistance: number;
  hotspotParagraphIndexes: number[];
  suspiciousSentenceIds: number[];
  topTriggeredDetectors: Array<{ name: string; aiPct: number }>;
  detectorDirectives: string[];
}

interface ActiveSuites {
  useSlopTotal: boolean;
  useMgtEval: boolean;
  mgtEvalKeys?: string[];
  useMgtBench: boolean;
  useDetectZoo: boolean;
  detectZooFull: boolean;
}

const SUITE_WEIGHTS = {
  slopTotal: 0.3,
  mgtEval: 0.25,
  mgtBench: 0.2,
  detectZoo: 0.25,
} as const;

/**
 * Определяет, какие комплексы действительно выбраны пользователем.
 *
 * Важное правило:
 * - если объект shields отсутствует или все его флаги выключены,
 *   сохраняется прежнее поведение: запускаются все комплексы;
 * - если пользователь включил хотя бы один конкретный флаг,
 *   запускаются только соответствующие ему комплексы;
 * - отдельные детекторы MGT-Eval передаются в ядро адресно.
 */
function resolveActiveSuites(shields?: DetectorShields): ActiveSuites {
  if (!shields || !Object.values(shields).some(Boolean)) {
    return {
      useSlopTotal: true,
      useMgtEval: true,
      useMgtBench: true,
      useDetectZoo: true,
      detectZooFull: false,
    };
  }

  const mgtEvalKeys: string[] = [];

  if (shields.binoculars) mgtEvalKeys.push('binoculars');
  if (shields.fastDetectGpt) mgtEvalKeys.push('fastdetectgpt');
  if (shields.detectGpt) mgtEvalKeys.push('detectgpt');
  if (shields.gltr) mgtEvalKeys.push('gltr');
  if (shields.radar) mgtEvalKeys.push('radar');
  if (shields.ghostbuster) mgtEvalKeys.push('ghostbuster');
  if (shields.robertaOpenAi) mgtEvalKeys.push('roberta');

  const useMgtEval =
    Boolean(shields.mgtEval) || mgtEvalKeys.length > 0;

  const useSlopTotal = Boolean(shields.sloptotal);

  const useMgtBench =
    Boolean(shields.mgtBench) ||
    Boolean(shields.hc3Comparison);

  const useDetectZoo =
    Boolean(shields.detectZoo) ||
    Boolean(shields.desklib) ||
    Boolean(shields.aiTextJury) ||
    Boolean(shields.houtini) ||
    Boolean(shields.detectLlama);

  return {
    useSlopTotal,
    useMgtEval,
    mgtEvalKeys:
      useMgtEval && !shields.mgtEval && mgtEvalKeys.length > 0
        ? mgtEvalKeys
        : undefined,
    useMgtBench,
    useDetectZoo,
    detectZooFull: Boolean(shields.detectZoo),
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function normalizeComposite(
  values: Array<{ value: number; weight: number }>
): number {
  const validValues = values.filter(
    (item) =>
      Number.isFinite(item.value) &&
      Number.isFinite(item.weight) &&
      item.weight > 0
  );

  if (validValues.length === 0) {
    return 0;
  }

  const weightedSum = validValues.reduce(
    (sum, item) => sum + item.value * item.weight,
    0
  );

  const totalWeight = validValues.reduce(
    (sum, item) => sum + item.weight,
    0
  );

  return totalWeight > 0
    ? round1(weightedSum / totalWeight)
    : 0;
}

/**
 * Рассчитывает исходный профиль донора.
 *
 * Используются только выбранные комплексы.
 * Набор активных комплексов и веса здесь совпадают
 * с логикой оценки итогового текста.
 */
export function computeDonorDetectorBaseline(
  donorText: string,
  shields?: DetectorShields
): DonorDetectorBaseline {
  const clean = (donorText || '').trim();

  if (!clean) {
    return {
      compositeAiPct: 18,
      slopScore: 15,
      phdIntrinsicDim: 6.5,
      gecscoreRouge2: 0.38,
      biscopeBce: 0.95,
      remodetectReward: -0.25,
      gltrTop10Pct: 42,
      burstiness: 0.52,
    };
  }

  const suites = resolveActiveSuites(shields);

  const slop = suites.useSlopTotal
    ? runSlopTotalAnalysis(clean, {
        fast: !shields?.sloptotal,
      })
    : null;

  const mgtEval = suites.useMgtEval
    ? runMgtEvalDetection(clean, {
        detectorKeys: suites.mgtEvalKeys,
      })
    : null;

  const mgtBench = suites.useMgtBench
    ? runMgtBenchDetection(clean)
    : null;

  const detectZoo = suites.useDetectZoo
    ? runDetectZooTextSuite(clean, {
        mode: suites.detectZooFull ? 'full' : 'fast',
      })
    : null;

  const slopScore = slop
    ? round1(slop.overallScore)
    : 0;

  const mgtEvalPct = mgtEval
    ? round1(mgtEval.overallAiProbability * 100)
    : 0;

  const mgtBenchPct = mgtBench
    ? round1(mgtBench.overallAiProbability * 100)
    : 0;

  const detectZooPct = detectZoo
    ? round1(detectZoo.overallAiProbability * 100)
    : 0;

  const compositeAiPct = normalizeComposite([
    ...(slop
      ? [{
          value: slopScore,
          weight: SUITE_WEIGHTS.slopTotal,
        }]
      : []),
    ...(mgtEval
      ? [{
          value: mgtEvalPct,
          weight: SUITE_WEIGHTS.mgtEval,
        }]
      : []),
    ...(mgtBench
      ? [{
          value: mgtBenchPct,
          weight: SUITE_WEIGHTS.mgtBench,
        }]
      : []),
    ...(detectZoo
      ? [{
          value: detectZooPct,
          weight: SUITE_WEIGHTS.detectZoo,
        }]
      : []),
  ]);

  return {
    compositeAiPct,
    slopScore,
    phdIntrinsicDim: mgtBench?.phdIntrinsicDim ?? 0,
    gecscoreRouge2:
      detectZoo?.specialSignals.gecscoreRouge2 ?? 0,
    biscopeBce:
      detectZoo?.specialSignals.biscopeBce ?? 0,
    remodetectReward:
      detectZoo?.specialSignals.remodetectReward ?? 0,
    gltrTop10Pct: mgtEval?.gltrBins.top10 ?? 0,
    burstiness: mgtEval?.burstiness ?? 0,
  };
}

/**
 * Анализирует текст и возвращает диагностические сигналы.
 *
 * Оценки локальных детекторных ядер здесь рассматриваются
 * только как дополнительные эвристические показатели.
 * Они не являются доказательством происхождения текста
 * и не должны определять авторский стиль.
 */
export function evaluateDetectorFeedback(
  candidateText: string,
  shields?: DetectorShields,
  donorBaseline?: DonorDetectorBaseline
): DetectorFeedbackReport {
  const clean = (candidateText || '').trim();
  const suites = resolveActiveSuites(shields);

  const slop = suites.useSlopTotal
    ? runSlopTotalAnalysis(clean, {
        fast: !shields?.sloptotal,
      })
    : null;

  const slopPara = suites.useSlopTotal
    ? runSlopTotalParagraphAnalyze(clean)
    : null;

  const mgtEval = suites.useMgtEval
    ? runMgtEvalDetection(clean, {
        detectorKeys: suites.mgtEvalKeys,
      })
    : null;

  const mgtBench = suites.useMgtBench
    ? runMgtBenchDetection(clean)
    : null;

  const detectZoo = suites.useDetectZoo
    ? runDetectZooTextSuite(clean, {
        mode: suites.detectZooFull ? 'full' : 'fast',
      })
    : null;

  const slopScore = slop
    ? round1(slop.overallScore)
    : 0;

  const mgtEvalAiPct = mgtEval
    ? round1(mgtEval.overallAiProbability * 100)
    : 0;

  const mgtBenchAiPct = mgtBench
    ? round1(mgtBench.overallAiProbability * 100)
    : 0;

  const detectZooAiPct = detectZoo
    ? round1(detectZoo.overallAiProbability * 100)
    : 0;

  const compositeAiPct = normalizeComposite([
    ...(slop
      ? [{
          value: slopScore,
          weight: SUITE_WEIGHTS.slopTotal,
        }]
      : []),
    ...(mgtEval
      ? [{
          value: mgtEvalAiPct,
          weight: SUITE_WEIGHTS.mgtEval,
        }]
      : []),
    ...(mgtBench
      ? [{
          value: mgtBenchAiPct,
          weight: SUITE_WEIGHTS.mgtBench,
        }]
      : []),
    ...(detectZoo
      ? [{
          value: detectZooAiPct,
          weight: SUITE_WEIGHTS.detectZoo,
        }]
      : []),
  ]);

  const phdIntrinsicDim =
    mgtBench?.phdIntrinsicDim ?? 0;

  const gecscoreRouge2 =
    detectZoo?.specialSignals.gecscoreRouge2 ?? 0;

  const biscopeBce =
    detectZoo?.specialSignals.biscopeBce ?? 0;

  const remodetectReward =
    detectZoo?.specialSignals.remodetectReward ?? 0;

  const gltrTop10Pct =
    mgtEval?.gltrBins.top10 ?? 0;

  let donorDistance = 0;

  if (donorBaseline) {
    const phdDiff =
      Math.abs(
        phdIntrinsicDim - donorBaseline.phdIntrinsicDim
      ) * 7.5;

    const gecDiff =
      Math.abs(
        gecscoreRouge2 - donorBaseline.gecscoreRouge2
      ) * 32;

    const biDiff =
      Math.abs(
        biscopeBce - donorBaseline.biscopeBce
      ) * 16;

    const gltrDiff =
      Math.abs(
        gltrTop10Pct - donorBaseline.gltrTop10Pct
      ) * 0.35;

    const slopDiff =
      Math.abs(
        slopScore - donorBaseline.slopScore
      ) * 0.35;

    donorDistance = Math.max(
      0,
      Math.min(
        100,
        round1(
          phdDiff +
          gecDiff +
          biDiff +
          gltrDiff +
          slopDiff
        )
      )
    );
  }

  // Проблемные абзацы определяются только тогда,
  // когда пользователь включил SlopTotal.
  const hotspotParagraphIndexes = slopPara
    ? slopPara.paragraphs
        .filter(
          (paragraph) =>
            paragraph.score >= 42 ||
            paragraph.verdict === 'ai'
        )
        .map((paragraph) => paragraph.index + 1)
    : [];

  const candidateSentences = splitSentences(clean);
  const suspiciousSet = new Set<number>();

  // Сигналы отдельных предложений MGTBench.
  if (
    mgtBench &&
    Array.isArray(mgtBench.gptZeroSentences) &&
    mgtBench.gptZeroSentences.length > 0
  ) {
    for (const item of mgtBench.gptZeroSentences) {
      if (item.aiProb < 0.65 || !item.sentence) {
        continue;
      }

      const needle = item.sentence
        .slice(0, 36)
        .toLowerCase();

      const foundIndex = candidateSentences.findIndex(
        (sentence) =>
          sentence.toLowerCase().includes(needle)
      );

      if (foundIndex >= 0) {
        suspiciousSet.add(foundIndex + 1);
      }
    }
  }

  // Маркеры SlopTotal используются только при включённом комплексе.
  if (slop?.matchedMarkers.length) {
    candidateSentences.forEach((sentence, index) => {
      const lowerSentence = sentence.toLowerCase();

      if (
        slop.matchedMarkers.some((marker) =>
          lowerSentence.includes(marker.toLowerCase())
        )
      ) {
        suspiciousSet.add(index + 1);
      }
    });
  }

  const suspiciousSentenceIds = Array.from(suspiciousSet)
    .sort((a, b) => a - b)
    .slice(0, 6);

  // Собираем сигналы только реально запущенных комплексов.
  const allDetectorHits: Array<{
    name: string;
    aiPct: number;
  }> = [];

  if (mgtEval) {
    for (const result of mgtEval.results) {
      if (result.aiProbability >= 0.55) {
        allDetectorHits.push({
          name: `MGT-Eval:${result.name}`,
          aiPct: round1(result.aiProbability * 100),
        });
      }
    }
  }

  if (mgtBench) {
    for (const result of mgtBench.results) {
      if (result.aiProbability >= 0.55) {
        allDetectorHits.push({
          name: `MGTBench:${result.name}`,
          aiPct: round1(result.aiProbability * 100),
        });
      }
    }
  }

  if (detectZoo) {
    for (const result of detectZoo.results) {
      if (result.aiProbability >= 0.55) {
        allDetectorHits.push({
          name: `DetectZoo:${result.registryName}`,
          aiPct: round1(result.aiProbability * 100),
        });
      }
    }
  }

  if (slop) {
    for (const result of slop.engineResults) {
      if (result.score >= 0.52) {
        allDetectorHits.push({
          name: `SlopTotal:${result.engineName}`,
          aiPct: round1(result.score * 100),
        });
      }
    }
  }

  const topTriggeredDetectors = allDetectorHits
    .sort((a, b) => b.aiPct - a.aiPct)
    .slice(0, 8);

  /*
   * Намеренно не формируем detectorDirectives.
   *
   * Ранее эти инструкции заставляли модель менять лексику,
   * синтаксис и пунктуацию ради снижения условного ИИ-риска.
   * Для задачи переноса авторской манеры это неверный приоритет:
   * необычные обороты, повторы и неровности донора могут быть
   * нормальными особенностями его индивидуального письма.
   *
   * Поле оставлено в интерфейсе для совместимости с остальным
   * приложением, но возвращается пустым массивом.
   */
  const detectorDirectives: string[] = [];

  return {
    compositeAiPct,
    slopScore,
    mgtEvalAiPct,
    mgtBenchAiPct,
    detectZooAiPct,
    phdIntrinsicDim,
    gecscoreRouge2,
    biscopeBce,
    remodetectReward,
    gltrTop10Pct,
    donorDistance,
    hotspotParagraphIndexes,
    suspiciousSentenceIds,
    topTriggeredDetectors,
    detectorDirectives,
  };
}

/**
 * Решает, стоит ли принимать новый вариант текста.
 *
 * Приоритеты:
 * 1. Не допускать пустой текст и резкое изменение объёма.
 * 2. Не допускать появления новых потерянных критических фактов.
 * 3. Не допускать появления новых терминов, перенесённых из донора.
 * 4. Не принимать вариант с существенным падением качества.
 * 5. Принимать вариант по улучшению содержательной диагностики.
 *
 * Процентные оценки детекторных эвристик не используются
 * как целевая функция и не могут перевесить качество переноса.
 */
export function acceptCandidateWithDetectors(params: {
  prevText: string;
  prevDiag: DiagnosticReport;
  prevDetector: DetectorFeedbackReport;
  nextText: string;
  nextDiag: DiagnosticReport;
  nextDetector: DetectorFeedbackReport;
  hasDonorBaseline: boolean;
}): boolean {
  const {
    prevText,
    prevDiag,
    nextText,
    nextDiag,
  } = params;

  // Сохраняем параметр интерфейса для совместимости вызовов.
  // Он больше не меняет критерии принятия кандидата.
  void params.hasDonorBaseline;
  void params.prevDetector;
  void params.nextDetector;

  const previousText = (prevText || '').trim();
  const candidateText = (nextText || '').trim();

  if (!candidateText) {
    return false;
  }

  if (!previousText) {
    return true;
  }

  const ratio =
    candidateText.length / Math.max(1, previousText.length);

  if (ratio < 0.62 || ratio > 1.65) {
    return false;
  }

  const previousLostFacts =
    prevDiag.factsReport.lostCritical || [];

  const nextLostFacts =
    nextDiag.factsReport.lostCritical || [];

  const previousFactSet = new Set(
    previousLostFacts.map((fact) =>
      String(fact).trim().toLowerCase()
    )
  );

  // Новый вариант не должен терять критические факты,
  // которые присутствовали в предыдущем варианте.
  for (const fact of nextLostFacts) {
    const normalizedFact = String(fact)
      .trim()
      .toLowerCase();

    if (!previousFactSet.has(normalizedFact)) {
      return false;
    }
  }

  const previousLeakTerms = new Set(
    (prevDiag.factsReport.donorLeakTerms || []).map(
      (term) => String(term).trim().toLowerCase()
    )
  );

  const nextLeakTerms =
    nextDiag.factsReport.donorLeakTerms || [];

  // Не допускаем появления новых заимствованных терминов донора
  // в тексте, который должен сохранять содержание второго текста.
  for (const term of nextLeakTerms) {
    const normalizedTerm = String(term)
      .trim()
      .toLowerCase();

    if (!previousLeakTerms.has(normalizedTerm)) {
      return false;
    }
  }

  const previousLostCount = previousLostFacts.length;
  const nextLostCount = nextLostFacts.length;

  const previousLeakCount = previousLeakTerms.size;
  const nextLeakCount = nextLeakTerms.length;

  const previousScore = Number(prevDiag.overallScore) || 0;
  const nextScore = Number(nextDiag.overallScore) || 0;

  // Сначала проверяются все ограничения.
  // Только после этого учитываются улучшения.
  const maximumAllowedScoreDrop = 1.5;

  if (
    nextScore <
    previousScore - maximumAllowedScoreDrop
  ) {
    return false;
  }

  // Улучшение сохранности критических фактов.
  if (nextLostCount < previousLostCount) {
    return true;
  }

  // Уменьшение утечки терминов донора.
  if (nextLeakCount < previousLeakCount) {
    return true;
  }

  // Основной критерий — улучшение содержательной диагностики.
  if (nextScore > previousScore + 0.25) {
    return true;
  }

  // Небольшое улучшение сохранности фактов при практически
  // неизменном общем диагностическом балле.
  const previousPreserved =
    Number(prevDiag.factsReport.preservedPct) || 0;

  const nextPreserved =
    Number(nextDiag.factsReport.preservedPct) || 0;

  if (
    nextScore >= previousScore - 0.25 &&
    nextPreserved > previousPreserved + 0.1
  ) {
    return true;
  }

  return false;
}