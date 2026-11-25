import type { StyleDNAProfile } from "./styleTypes";
import type { StyleScoreReport } from "./styleDNAScorer";
import { computeWordTrigramOverlap } from "./textOverlap";
import { splitParagraphs, countWords } from "./tokenizer";
import type {
  AdvancedDiagnosticReport,
  DetectorWeakSpot,
  DragFeatureItem,
  LatencyBreakdown,
  ModelExecutionTrace,
  ParagraphSliceStats,
  StageScoreDelta,
  TrapCounterReport,
} from "./diagnosticsTypes";

const FORBIDDEN_OPENERS_RE =
  /(?:^|[.!?…]\s+|[\r\n]+)(вследствие этого|вследствие чего|в такой системе|в таком случае)\b/giu;
const CLICHE_QUOTES_RE =
  /[«"„“](?:лучшей жизни|общего счастья)[»"”‟]/giu;
const DUPLICATE_WORD_RE =
  /(?<![\p{L}\p{N}_-])([\p{L}\p{N}_-]+)\s+\1(?![\p{L}\p{N}_-])/giu;
const PARENS_RE = /\([^()]*\)/gu;
const PUNCT_ANY_RE = /[,;—–:!?…«»„“”"()]/gu;

function analyzeTraps(text: string): TrapCounterReport {
  const forbiddenMatches = [...text.matchAll(FORBIDDEN_OPENERS_RE)].map((m) => m[0].trim());
  const clicheMatches = [...text.matchAll(CLICHE_QUOTES_RE)].map((m) => m[0].trim());
  const dupMatches = [...text.matchAll(DUPLICATE_WORD_RE)].map((m) => m[0].trim());
  const parensCount = [...text.matchAll(PARENS_RE)].length;

  const totalTrapScore =
    forbiddenMatches.length * 3 +
    clicheMatches.length * 2 +
    dupMatches.length * 3 +
    Math.max(0, parensCount - 2);

  return {
    forbiddenOpenersCount: forbiddenMatches.length,
    forbiddenOpenersMatches: forbiddenMatches.slice(0, 8),
    clicheQuotedPhrasesCount: clicheMatches.length,
    clicheQuotedPhrasesMatches: clicheMatches.slice(0, 8),
    consecutiveDuplicateWordsCount: dupMatches.length,
    consecutiveDuplicateWordsMatches: dupMatches.slice(0, 8),
    parentheticalSpansCount: parensCount,
    totalTrapScore,
  };
}

function summarizeSlice(
  slice: "opening" | "middle" | "closing",
  paras: ReturnType<typeof splitParagraphs>,
): ParagraphSliceStats {
  const paragraphsCount = paras.length;
  const wordsCount = paras.reduce((acc, p) => acc + countWords(p.text), 0);
  const sentences = paras.flatMap((p) => p.sentences);
  const sentencesCount = sentences.length;
  const meanSentenceLength = sentencesCount
    ? Number((sentences.reduce((acc, s) => acc + s.words.length, 0) / sentencesCount).toFixed(2))
    : 0;
  const shortCount = sentences.filter((s) => s.words.length <= 8).length;
  const shortSentenceShare = sentencesCount
    ? Number((shortCount / sentencesCount).toFixed(3))
    : 0;
  const punctCount = paras.reduce(
    (acc, p) => acc + [...p.text.matchAll(PUNCT_ANY_RE)].length,
    0,
  );
  const punctuationPer100Words = wordsCount
    ? Number(((punctCount / wordsCount) * 100).toFixed(2))
    : 0;

  return {
    slice,
    paragraphsCount,
    wordsCount,
    sentencesCount,
    meanSentenceLength,
    shortSentenceShare,
    punctuationPer100Words,
  };
}

function analyzeParagraphDrift(text: string): {
  slices: ParagraphSliceStats[];
  closingVsOpeningLengthDelta: number;
} {
  const paras = splitParagraphs(text);
  if (!paras.length) {
    return {
      slices: [
        summarizeSlice("opening", []),
        summarizeSlice("middle", []),
        summarizeSlice("closing", []),
      ],
      closingVsOpeningLengthDelta: 0,
    };
  }
  if (paras.length === 1) {
    const only = summarizeSlice("opening", paras);
    return {
      slices: [
        only,
        summarizeSlice("middle", []),
        { ...only, slice: "closing" },
      ],
      closingVsOpeningLengthDelta: 0,
    };
  }
  if (paras.length === 2) {
    const opening = summarizeSlice("opening", [paras[0]]);
    const closing = summarizeSlice("closing", [paras[1]]);
    return {
      slices: [opening, summarizeSlice("middle", []), closing],
      closingVsOpeningLengthDelta: Number(
        (closing.meanSentenceLength - opening.meanSentenceLength).toFixed(2),
      ),
    };
  }

  const opening = summarizeSlice("opening", [paras[0]]);
  const closing = summarizeSlice("closing", [paras[paras.length - 1]]);
  const middle = summarizeSlice("middle", paras.slice(1, -1));
  return {
    slices: [opening, middle, closing],
    closingVsOpeningLengthDelta: Number(
      (closing.meanSentenceLength - opening.meanSentenceLength).toFixed(2),
    ),
  };
}

export function buildAdvancedDiagnostics(input: {
  sourceText: string;
  finalText: string;
  candidateProfile: StyleDNAProfile;
  styleReport: StyleScoreReport;
  stageDeltas?: StageScoreDelta[];
  latency?: LatencyBreakdown;
  modelTrace?: ModelExecutionTrace;
}): AdvancedDiagnosticReport {
  const topDragFeatures: DragFeatureItem[] = input.styleReport.comparisons
    .map((c) => ({
      featureId: c.featureId,
      family: c.family,
      label: c.label,
      donorValue: c.donorValue,
      candidateValue: c.candidateValue,
      similarity: c.similarity,
      penalty: Number(((1 - c.similarity) * c.weight * c.confidence).toFixed(4)),
      direction: c.direction,
    }))
    .filter((item) => item.penalty > 0)
    .sort((a, b) => b.penalty - a.penalty)
    .slice(0, 8);

  const traps = analyzeTraps(input.finalText);
  const { slices, closingVsOpeningLengthDelta } = analyzeParagraphDrift(input.finalText);

  const trigramOverlapRatio = Number(
    computeWordTrigramOverlap(input.sourceText, input.finalText).toFixed(3),
  );
  const riskLevel: "low" | "medium" | "high" =
    trigramOverlapRatio >= 0.45 ? "high" : trigramOverlapRatio >= 0.25 ? "medium" : "low";

  const detectorWeakSpots: DetectorWeakSpot[] = [];
  const varianceFeat = input.candidateProfile.features.find(
    (f) => f.id === "rhythm.sentence-length-variance",
  );
  const shortShareFeat = input.candidateProfile.features.find(
    (f) => f.id === "rhythm.length-distribution.short",
  );
  const gerundShareFeat = input.candidateProfile.features.find(
    (f) => f.id === "syntax.gerund-like",
  );

  if (varianceFeat && varianceFeat.rate < 45) {
    detectorWeakSpots.push({
      code: "low-length-variance",
      severity: "medium",
      message: `Низкий разброс длины предложений (${varianceFeat.rate.toFixed(1)}): ровный ритм повышает риск машинных оценок.`,
    });
  }
  if (shortShareFeat && shortShareFeat.rate < 0.08) {
    detectorWeakSpots.push({
      code: "missing-short-sentences",
      severity: "high",
      message: `Почти нет коротких предложений до 8 слов (доля ${(shortShareFeat.rate * 100).toFixed(1)}%).`,
    });
  }
  if (input.candidateProfile.corpus.medianWordsPerSentence > 19) {
    detectorWeakSpots.push({
      code: "overlong-median-sentence",
      severity: "medium",
      message: `Завышена медианная длина предложения (${input.candidateProfile.corpus.medianWordsPerSentence.toFixed(1)} сл.).`,
    });
  }
  if (traps.clicheQuotedPhrasesCount > 0) {
    detectorWeakSpots.push({
      code: "excess-cliche-quotes",
      severity: "medium",
      message: `Обнаружены кавычки вокруг шаблонных выражений (${traps.clicheQuotedPhrasesMatches.join(", ")}).`,
    });
  }
  if (gerundShareFeat && gerundShareFeat.rate > 0.45) {
    detectorWeakSpots.push({
      code: "excess-gerunds",
      severity: "low",
      message: `Высокая доля деепричастных фраз (${(gerundShareFeat.rate * 100).toFixed(0)}%).`,
    });
  }
  if (riskLevel === "high") {
    detectorWeakSpots.push({
      code: "high-source-trigram-overlap",
      severity: "high",
      message: `Высокое пересечение 3-грамм с исходником (${(trigramOverlapRatio * 100).toFixed(1)}%): велика доля кальки.`,
    });
  }

  return {
    topDragFeatures,
    traps,
    paragraphDrift: slices,
    closingVsOpeningLengthDelta,
    sourceCopyRisk: {
      trigramOverlapRatio,
      riskLevel,
    },
    stageDeltas: input.stageDeltas ?? [],
    latency: input.latency ?? {},
    modelTrace: input.modelTrace ?? { warnings: [] },
    detectorWeakSpots,
  };
}