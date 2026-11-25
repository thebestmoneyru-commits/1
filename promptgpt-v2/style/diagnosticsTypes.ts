import type { StyleFeatureFamily } from "./styleTypes";

export interface DragFeatureItem {
  featureId: string;
  family: StyleFeatureFamily;
  label: string;
  donorValue: number;
  candidateValue: number;
  similarity: number;
  penalty: number;
  direction: "match" | "underuse" | "overuse";
}

export interface TrapCounterReport {
  forbiddenOpenersCount: number;
  forbiddenOpenersMatches: string[];
  clicheQuotedPhrasesCount: number;
  clicheQuotedPhrasesMatches: string[];
  consecutiveDuplicateWordsCount: number;
  consecutiveDuplicateWordsMatches: string[];
  parentheticalSpansCount: number;
  totalTrapScore: number;
}

export interface ParagraphSliceStats {
  slice: "opening" | "middle" | "closing";
  paragraphsCount: number;
  wordsCount: number;
  sentencesCount: number;
  meanSentenceLength: number;
  shortSentenceShare: number;
  punctuationPer100Words: number;
}

export interface StageScoreDelta {
  stage: "semantic-restoration" | "style-critic-repair";
  beforeScore: number | null;
  afterScore: number | null;
  deltaScore: number | null;
  repaired: boolean;
  repairPassed?: boolean;
  noGainReason?:
    | "not-applied"
    | "score-dropped-or-flat"
    | "reverification-incomplete"
    | "semantic-check-failed"
    | "none";
}

export interface LatencyBreakdown {
  totalMs?: number;
  candidateGenerationMs?: number;
  semanticVerificationMs?: number;
  logicalStructureMs?: number;
  styleProfilingMs?: number;
  styleScoringMs?: number;
  semanticRestorationMs?: number;
  criticRepairMs?: number;
}

export interface ModelExecutionTrace {
  requestedModel?: string;
  usedModel?: string;
  fallbackOccurred?: boolean;
  warnings: string[];
}

export interface DetectorWeakSpot {
  code:
    | "low-length-variance"
    | "missing-short-sentences"
    | "overlong-median-sentence"
    | "excess-cliche-quotes"
    | "excess-gerunds"
    | "high-source-trigram-overlap";
  severity: "low" | "medium" | "high";
  message: string;
}

export interface AdvancedDiagnosticReport {
  topDragFeatures: DragFeatureItem[];
  traps: TrapCounterReport;
  paragraphDrift: ParagraphSliceStats[];
  closingVsOpeningLengthDelta: number;
  sourceCopyRisk: {
    trigramOverlapRatio: number;
    riskLevel: "low" | "medium" | "high";
  };
  stageDeltas: StageScoreDelta[];
  latency: LatencyBreakdown;
  modelTrace: ModelExecutionTrace;
  detectorWeakSpots: DetectorWeakSpot[];
}