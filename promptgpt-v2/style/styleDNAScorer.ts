import type { StyleDNAProfile, StyleFeature, StyleFeatureFamily } from "./styleTypes";

export type StyleScoreStatus = "scored" | "insufficient-donor" | "insufficient-candidate" | "incompatible-profiles";

export interface FeatureComparison {
  featureId: string;
  family: StyleFeatureFamily;
  label: string;
  donorValue: number;
  candidateValue: number;
  unit: StyleFeature["unit"];
  similarity: number;
  weight: number;
  confidence: number;
  contribution: number;
  direction: "match" | "underuse" | "overuse";
  explanation: string;
}

export interface FamilyScore {
  family: StyleFeatureFamily;
  score: number;
  weight: number;
  confidence: number;
  comparedFeatures: number;
}

export interface StyleScoreReport {
  status: StyleScoreStatus;
  score: number | null;
  confidence: number;
  donorFingerprint: string;
  candidateFingerprint: string;
  donorCorpus: { words: number; sentences: number; status: StyleDNAProfile["status"] };
  candidateCorpus: { words: number; sentences: number; status: StyleDNAProfile["status"] };
  familyScores: FamilyScore[];
  comparisons: FeatureComparison[];
  warnings: string[];
  scoringVersion: string;
}

export interface StyleScorerOptions {
  familyWeights: Partial<Record<StyleFeatureFamily, number>>;
  /** Relative deviation at which a feature reaches the configured penalty curve. */
  relativeTolerance: number;
  /** Minimum absolute tolerance for sparse rates and means. */
  absoluteTolerance: number;
  /** Below this combined corpus confidence, return an explicit non-score. */
  minimumProfileConfidence: number;
  /** Suppress features that have too little evidence in the donor corpus. */
  minimumDonorObservations: number;
  /** Penalty curve exponent. 1 is linear, 2 is more forgiving near the target. */
  penaltyExponent: number;
}

export const STYLE_SCORING_VERSION = "2.1.0";

export const DEFAULT_STYLE_SCORER_OPTIONS: Readonly<StyleScorerOptions> = {
  familyWeights: {
    rhythm: 1.25,
    syntax: 1.25,
    punctuation: 0.8,
    openers: 1.0,
    connectors: 1.0,
    morphology: 0.8,
    lexical: 0.85,
    paragraphs: 0.9,
  },
  relativeTolerance: 0.65,
  absoluteTolerance: 0.025,
  minimumProfileConfidence: 0.2,
  minimumDonorObservations: 2,
  penaltyExponent: 1.25,
};

const FAMILIES: StyleFeatureFamily[] = [
  "rhythm", "syntax", "punctuation", "openers", "connectors", "morphology", "lexical", "paragraphs",
];

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}
function safeNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
function normalizeOptions(options: Partial<StyleScorerOptions>): StyleScorerOptions {
  const weights = { ...DEFAULT_STYLE_SCORER_OPTIONS.familyWeights, ...options.familyWeights };
  for (const key of Object.keys(weights) as StyleFeatureFamily[]) {
    const value = weights[key];
    weights[key] = Number.isFinite(value) && (value ?? 0) >= 0 ? value : 0;
  }
  return {
    familyWeights: weights,
    relativeTolerance: Number.isFinite(options.relativeTolerance) && (options.relativeTolerance ?? 0) > 0
      ? options.relativeTolerance! : DEFAULT_STYLE_SCORER_OPTIONS.relativeTolerance,
    absoluteTolerance: Number.isFinite(options.absoluteTolerance) && (options.absoluteTolerance ?? 0) > 0
      ? options.absoluteTolerance! : DEFAULT_STYLE_SCORER_OPTIONS.absoluteTolerance,
    minimumProfileConfidence: Number.isFinite(options.minimumProfileConfidence)
      ? clamp(options.minimumProfileConfidence!) : DEFAULT_STYLE_SCORER_OPTIONS.minimumProfileConfidence,
    minimumDonorObservations: Number.isFinite(options.minimumDonorObservations)
      ? Math.max(1, Math.floor(options.minimumDonorObservations!)) : DEFAULT_STYLE_SCORER_OPTIONS.minimumDonorObservations,
    penaltyExponent: Number.isFinite(options.penaltyExponent) && (options.penaltyExponent ?? 0) > 0
      ? options.penaltyExponent! : DEFAULT_STYLE_SCORER_OPTIONS.penaltyExponent,
  };
}

/** Feature values are normalized according to their declared units before comparison. */
function featureValue(feature: StyleFeature): number {
  if (feature.unit === "share") return clamp(safeNumber(feature.rate));
  return safeNumber(feature.rate);
}
function toleranceFor(feature: StyleFeature, donorValue: number, options: StyleScorerOptions): number {
  // A floor prevents a tiny donor rate from turning one extra occurrence into an infinite penalty.
  const floor = feature.unit === "share" ? 0.04
    : feature.unit === "mean" ? 1.5
    : feature.unit === "per-1000-words" ? 0.5
    : feature.unit === "per-100-sentences" ? 1.5
    : options.absoluteTolerance;
  return Math.max(floor, Math.abs(donorValue) * options.relativeTolerance, options.absoluteTolerance);
}
function similarityFor(donor: number, candidate: number, tolerance: number, exponent: number): number {
  const deviation = Math.abs(candidate - donor) / Math.max(tolerance, Number.EPSILON);
  // A deviation equal to tolerance retains 50% similarity; larger deviations
  // decay smoothly instead of creating an abrupt pass/fail boundary.
  return clamp(Math.exp(-Math.LN2 * Math.pow(deviation, exponent)));
}
function featureReliability(feature: StyleFeature): number {
  const confidence = clamp(safeNumber(feature.confidence));
  const observationReliability = feature.observations <= 0 ? 0.35
    : feature.observations === 1 ? 0.55
    : feature.observations < 4 ? 0.75 : 1;
  return confidence * observationReliability;
}
function featureWeight(feature: StyleFeature): number {
  // Rare phrase/lexeme counts are useful evidence, but should not dominate the profile.
  if (feature.id.startsWith("tracked.")) return 0.65;
  if (feature.id.startsWith("lexical.repeat.")) return 0.55;
  if (feature.id.startsWith("openers.") || feature.id.startsWith("closings.")) return 0.8;
  return 1;
}
function direction(donor: number, candidate: number): FeatureComparison["direction"] {
  if (Math.abs(candidate - donor) < 1e-9) return "match";
  return candidate < donor ? "underuse" : "overuse";
}
/**
 * Content-word recurrence and exact sentence endings are topic signals, not
 * portable style traits. Comparing them across unrelated subjects rewards
 * copying donor vocabulary and penalizes legitimate topic changes.
 */
function isPortableStyleFeature(id: string): boolean {
  return !id.startsWith("lexical.repeat.") && !id.startsWith("closings.");
}

function featureMap(profile: StyleDNAProfile): Map<string, StyleFeature> {
  return new Map(profile.features.map((feature) => [feature.id, feature]));
}

/**
 * Confidence-aware comparison of a candidate profile against an immutable donor profile.
 * The donor is always the reference distribution; candidates never become a new baseline.
 */
export function scoreStyleDNA(
  donor: StyleDNAProfile,
  candidate: StyleDNAProfile,
  suppliedOptions: Partial<StyleScorerOptions> = {},
): StyleScoreReport {
  const options = normalizeOptions(suppliedOptions);
  const warnings: string[] = [];

  const base = {
    donorFingerprint: donor.sourceFingerprint,
    candidateFingerprint: candidate.sourceFingerprint,
    donorCorpus: { words: donor.corpus.words, sentences: donor.corpus.sentences, status: donor.status },
    candidateCorpus: { words: candidate.corpus.words, sentences: candidate.corpus.sentences, status: candidate.status },
    familyScores: [] as FamilyScore[],
    comparisons: [] as FeatureComparison[],
    warnings,
    scoringVersion: STYLE_SCORING_VERSION,
  };

  if (donor.profileVersion !== candidate.profileVersion) {
    warnings.push("Версии анализатора различаются; сравнение профилей может быть некорректным.");
    return { ...base, status: "incompatible-profiles", score: null, confidence: 0 };
  }
  if (donor.status === "insufficient" || donor.confidence < options.minimumProfileConfidence) {
    warnings.push("Корпус донора слишком мал или ненадёжен для устойчивого стилевого эталона.");
    return { ...base, status: "insufficient-donor", score: null, confidence: 0 };
  }
  if (candidate.status === "insufficient" || candidate.confidence < options.minimumProfileConfidence) {
    warnings.push("Текст-кандидат слишком мал для надёжного сравнения.");
    return { ...base, status: "insufficient-candidate", score: null, confidence: 0 };
  }

  const donorFeatures = featureMap(donor);
  const candidateFeatures = featureMap(candidate);
  const comparisons: FeatureComparison[] = [];

  for (const [id, donorFeature] of donorFeatures) {
    if (!isPortableStyleFeature(id)) continue;
    const isCorpusWideFeature =
      id.startsWith("rhythm.") || id.startsWith("paragraphs.") || id.startsWith("syntax.") ||
      id.startsWith("punctuation.") || id.startsWith("connectors.");
    if (!isCorpusWideFeature && donorFeature.observations < options.minimumDonorObservations) continue;
    const candidateFeature = candidateFeatures.get(id);
    const donorValue = featureValue(donorFeature);
    const candidateValue = candidateFeature ? featureValue(candidateFeature) : 0;
    // Shared absence is not evidence of a positive stylistic match. Keep absent
    // donor traits in the comparison only when the candidate actually overuses them.
    if (donorValue === 0 && candidateValue === 0) continue;
    const reliability = featureReliability(donorFeature) * (candidateFeature ? featureReliability(candidateFeature) : clamp(candidate.confidence));
    const tolerance = toleranceFor(donorFeature, donorValue, options);
    const similarity = similarityFor(donorValue, candidateValue, tolerance, options.penaltyExponent);
    const weight = (options.familyWeights[donorFeature.family] ?? 0) * featureWeight(donorFeature);
    comparisons.push({
      featureId: id, family: donorFeature.family, label: donorFeature.label,
      donorValue, candidateValue, unit: donorFeature.unit, similarity, weight,
      confidence: reliability, contribution: similarity * weight * reliability,
      direction: direction(donorValue, candidateValue),
      explanation: candidateFeature
        ? "Сопоставлены нормированные значения признака в донорском и целевом корпусах."
        : "Признак зафиксирован у донора, но не обнаружен среди признаков кандидата.",
    });
  }

  // Candidate-only markers are potential stylistic overfitting or foreign style leakage.
  for (const [id, candidateFeature] of candidateFeatures) {
    if (!isPortableStyleFeature(id)) continue;
    if (donorFeatures.has(id) || candidateFeature.observations < options.minimumDonorObservations) continue;
    const weight = (options.familyWeights[candidateFeature.family] ?? 0) * featureWeight(candidateFeature);
    const reliability = featureReliability(candidateFeature) * clamp(donor.confidence);
    comparisons.push({
      featureId: id, family: candidateFeature.family, label: candidateFeature.label,
      donorValue: 0, candidateValue: featureValue(candidateFeature), unit: candidateFeature.unit,
      similarity: 0, weight, confidence: reliability, contribution: 0,
      direction: "overuse",
      explanation: "Признак заметен в кандидате, но не был зафиксирован в профиле донора; возможное необоснованное добавление.",
    });
  }

  const familyScores: FamilyScore[] = [];
  for (const family of FAMILIES) {
    const items = comparisons.filter((item) => item.family === family && item.weight > 0);
    const denominator = items.reduce((sum, item) => sum + item.weight * item.confidence, 0);
    const score = denominator ? items.reduce((sum, item) => sum + item.contribution, 0) / denominator * 100 : 0;
    const configuredWeight = options.familyWeights[family] ?? 0;
    const confidence = items.length ? items.reduce((sum,item)=>sum+item.confidence,0)/items.length : 0;
    familyScores.push({ family, score, weight: configuredWeight, confidence, comparedFeatures: items.length });
  }

  const activeFamilies = familyScores.filter((item) => item.comparedFeatures > 0 && item.weight > 0);
  // A family with sparse or weak evidence must not influence the aggregate as
  // strongly as a well-supported family. Confidence therefore scales its weight.
  const totalWeight = activeFamilies.reduce((sum,item)=>sum+item.weight*item.confidence,0);
  const score = totalWeight
    ? activeFamilies.reduce((sum,item)=>sum+item.score*item.weight*item.confidence,0)/totalWeight
    : 0;
  const configuredWeight = activeFamilies.reduce((sum,item)=>sum+item.weight,0);
  const confidence = configuredWeight
    ? activeFamilies.reduce((sum,item)=>sum+item.confidence*item.weight,0)/configuredWeight
    : 0;

  if (donor.status === "limited") warnings.push("Профиль донора ограничен объёмом корпуса; итоговая оценка предварительная.");
  if (candidate.status === "limited") warnings.push("Профиль кандидата ограничен объёмом текста; оценка имеет повышенную неопределённость.");
  if (comparisons.length === 0) warnings.push("Нет общих признаков, пригодных для сравнения.");

  return {
    ...base, status: "scored", score: Math.round(score * 10) / 10,
    confidence: Math.round(confidence * 1000) / 1000,
    familyScores, comparisons: comparisons.sort((a,b)=>(b.weight*b.confidence)-(a.weight*a.confidence)),
  };
}
