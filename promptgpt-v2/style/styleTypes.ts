import type { TextSpan } from "../types";

export type StyleFeatureFamily =
  | "rhythm"
  | "syntax"
  | "punctuation"
  | "openers"
  | "connectors"
  | "morphology"
  | "lexical"
  | "paragraphs";

export interface StyleEvidence {
  span: TextSpan;
  excerpt: string;
}

export interface StyleFeature {
  id: string;
  family: StyleFeatureFamily;
  label: string;
  count: number;
  denominator: number;
  rate: number;
  unit: "per-100-sentences" | "per-1000-words" | "share" | "mean" | "distribution";
  confidence: number;
  observations: number;
  evidence: StyleEvidence[];
  interpretation: string;
}

export interface Distribution {
  count: number;
  share: number;
}

export interface StyleCorpusStats {
  characters: number;
  words: number;
  sentences: number;
  paragraphs: number;
  meanWordsPerSentence: number;
  medianWordsPerSentence: number;
  meanSentencesPerParagraph: number;
  sentenceLengthDistribution: {
    short: Distribution;
    medium: Distribution;
    long: Distribution;
    veryLong: Distribution;
  };
}

export interface StyleDNAProfile {
  profileVersion: string;
  status: "sufficient" | "limited" | "insufficient";
  confidence: number;
  corpus: StyleCorpusStats;
  features: StyleFeature[];
  warnings: string[];
  sourceFingerprint: string;
}

export interface StyleAnalyzerOptions {
  minWordsForReliableProfile: number;
  minSentencesForReliableProfile: number;
  maxEvidencePerFeature: number;
  /** Caller-supplied phrases that should be tracked as stylistic markers. */
  trackedPhrases?: readonly string[];
}
