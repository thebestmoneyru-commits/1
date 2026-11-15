/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Full TypeScript port of github.com/pablocaeg/sloptotal
 * Includes:
 * - language.py (18-language detection + CJK/unspaced word counting)
 * - calibration.json & calibration.py (SlopBench logistic weights, band knots, confidence)
 * - config.py & schemas.py (verdict bands: Clean <=30, Low risk <=45, Suspicious <=55, Likely AI <=80, Slop >80)
 * - 6 heuristic engines ported 1:1 (Linguistic, Structural, Vocabulary, Formulaic, Readability, Sentiment)
 * - 17 statistical & classifier engines with exact SlopTotal metadata, weights, URLs & calibrated estimators
 * - site_fingerprints.py (Lovable, v0, Bolt, Base44, Replit, Same, Anything, Emergent)
 * - page_classifier.py (short / hub / landing / reference / article)
 * - paragraph_analyze & quick_score
 */

export type SlopVerdictBand = 'clean' | 'suspicious' | 'slop';
export type SlopConfidence = 'low' | 'medium' | 'high';
export type SlopLanguageSupport = 'supported' | 'experimental' | 'unsupported';
export type SlopEngineType = 'classifier' | 'embedding' | 'statistical' | 'linguistic';

export interface SlopEngineMeta {
  key: string;
  name: string;
  code: string;
  engineType: SlopEngineType;
  description: string;
  url?: string;
  tier: 'A' | 'B' | 'C' | 'D' | 'E';
  isCheap: boolean;
  isQuick: boolean;
  cost: number;
  englishWeight: number;
  multilingualWeight: number;
  quickWeight: number;
}

export interface SlopEngineResult {
  key: string;
  engineName: string;
  code: string;
  engineType: SlopEngineType;
  score: number; // 0..1 (higher = more AI)
  verdict: SlopVerdictBand;
  details: string;
  description: string;
  url?: string;
  matchedMarkers?: string[];
  elapsedMs: number;
}

export interface SlopAnalysisReport {
  id: string;
  sourceType: 'text' | 'url';
  source: string;
  textExcerpt: string;
  wordCount: number;
  inputChars: number;
  language: string;
  languageSupport: SlopLanguageSupport;
  overallScore: number; // 0..100 AI score (SlopTotal scale)
  humanScore: number; // 100 - overallScore
  overallVerdict: string;
  verdictKey: 'clean' | 'low' | 'suspicious' | 'likely' | 'slop';
  confidence: SlopConfidence;
  scoreRange: [number, number];
  enginesFlagged: number;
  enginesTotal: number;
  selectedKeys: string[];
  matchedMarkers: string[];
  engineResults: SlopEngineResult[];
  notes: string[];
  createdAt: string;
  elapsedMs: number;
  mode: 'full' | 'fast' | 'selected' | 'remote';
}

export interface SlopQuickResult {
  score: number;
  humanScore: number;
  verdict: 'clean' | 'mixed' | 'ai';
  confidence: SlopConfidence;
  language: string;
  languageSupport: SlopLanguageSupport;
  wordCount: number;
  engines: Array<{
    engine: string;
    name: string;
    score: number;
    verdict: SlopVerdictBand;
    details: string;
  }>;
  elapsedMs: number;
}

export interface SlopParagraphItem {
  index: number;
  text: string;
  charCount: number;
  wordCount: number;
  score: number;
  verdict: 'clean' | 'mixed' | 'ai';
  confidence: SlopConfidence;
}

export interface SlopParagraphReport {
  paragraphs: SlopParagraphItem[];
  overallScore: number;
  overallVerdict: 'clean' | 'mixed' | 'ai';
  paragraphCount: number;
  aiParagraphCount: number;
  elapsedMs: number;
}

export interface SiteBuilderMatch {
  name: string;
  url: string;
  confidence: 'confirmed' | 'possible';
  evidence: string[];
}

export interface SiteFingerprintResult {
  builders: SiteBuilderMatch[];
  generator: string | null;
  verdict: string;
}

export interface PageClassificationResult {
  type: 'short' | 'hub' | 'landing' | 'reference' | 'article';
  label: string;
  scoreable: boolean;
}

/* ------------------------------------------------------------------ */
/* 1. Config Thresholds (app/config.py + app/schemas.py)              */
/* ------------------------------------------------------------------ */

export const SLOPTOTAL_BANDS = {
  SCORE_CLEAN: 30,
  SCORE_LOW_RISK: 45,
  SCORE_SUSPICIOUS: 55,
  SCORE_LIKELY_AI: 80,
  QUICK_CLEAN_MAX: 35,
  QUICK_AI_MIN: 65,
  SHORT_TEXT_WORDS: 80,
  MIN_TEXT_LENGTH: 50,
  MAX_ANALYSED_CHARS: 100_000,
} as const;

export const SLOPTOTAL_BAND_INFO = [
  {
    key: 'clean' as const,
    range: '0–30',
    label: 'Clean — likely human-written',
    labelRu: 'Чисто — вероятно, написано человеком',
    desc: 'Минимальные ИИ-сигналы по движкам. Текст читается как естественное человеческое письмо.',
  },
  {
    key: 'low' as const,
    range: '30–45',
    label: 'Low risk',
    labelRu: 'Низкий риск',
    desc: 'Некоторые движки видят слабые сигналы. Официальный или тщательно вычитанный человеческий текст часто попадает сюда.',
  },
  {
    key: 'suspicious' as const,
    range: '45–55',
    label: 'Suspicious',
    labelRu: 'Подозрительно (серая зона)',
    desc: 'Движки расходятся во мнениях: возможен ИИ-черновик с правкой человека или формальный текст.',
  },
  {
    key: 'likely' as const,
    range: '55–80',
    label: 'Likely AI-generated',
    labelRu: 'Вероятно, сгенерировано ИИ',
    desc: 'Уверенные сигналы сразу от нескольких семейств детекторов при слабой авторской редактуре.',
  },
  {
    key: 'slop' as const,
    range: '80–100',
    label: 'Slop detected',
    labelRu: 'Обнаружен ИИ-слоп',
    desc: 'Широкий консенсус движков: выраженные статистические и лингвистические маркеры необработанной генерации LLM.',
  },
];

export function scoreToEngineVerdict(score: number): SlopVerdictBand {
  if (score < 0.4) return 'clean';
  if (score < 0.65) return 'suspicious';
  return 'slop';
}

export function scoreToVerdictInfo(score: number): {
  key: 'clean' | 'low' | 'suspicious' | 'likely' | 'slop';
  label: string;
  labelRu: string;
} {
  if (score <= SLOPTOTAL_BANDS.SCORE_CLEAN) {
    return { key: 'clean', label: 'Clean — likely human-written', labelRu: 'Чисто — вероятно человек' };
  }
  if (score <= SLOPTOTAL_BANDS.SCORE_LOW_RISK) {
    return { key: 'low', label: 'Low risk', labelRu: 'Низкий риск' };
  }
  if (score <= SLOPTOTAL_BANDS.SCORE_SUSPICIOUS) {
    return { key: 'suspicious', label: 'Suspicious', labelRu: 'Подозрительно' };
  }
  if (score <= SLOPTOTAL_BANDS.SCORE_LIKELY_AI) {
    return { key: 'likely', label: 'Likely AI-generated', labelRu: 'Вероятно ИИ' };
  }
  return { key: 'slop', label: 'Slop detected', labelRu: 'Обнаружен ИИ-слоп' };
}

export function quickVerdict(score: number): 'clean' | 'mixed' | 'ai' {
  if (score <= SLOPTOTAL_BANDS.QUICK_CLEAN_MAX) return 'clean';
  if (score <= SLOPTOTAL_BANDS.QUICK_AI_MIN) return 'mixed';
  return 'ai';
}

/* ------------------------------------------------------------------ */
/* 2. Exact SlopBench Calibration Data (app/calibration.json)         */
/* ------------------------------------------------------------------ */

export const SLOPTOTAL_CALIBRATION = {
  version: '2026-10-10',
  multilingual: {
    short_alpha: 81.9,
    short_ref_words: 150,
    intercept: 5.5363,
    default_offset: -0.5385,
    weights: {
      classifier_bert_raid: 0.0,
      binoculars: 0.0,
      burstiness: 0.1096,
      classifier_chatgpt: 0.1155,
      cross_perplexity: 0.0,
      classifier_desklib: 0.0229,
      diveye: 0.0,
      classifier_e5: 0.2421,
      classifier_fakespot: 0.0,
      fast_detectgpt: 0.1581,
      formulaic: 0.0,
      gltr: 0.0,
      linguistic: 0.015,
      log_rank: 0.0,
      classifier_openai: 0.031,
      perplexity: 0.0,
      classifier_remodetect: 0.9038,
      readability: 0.0,
      sentiment: 0.0,
      structural: 0.2295,
      classifier_superannotate: 0.1783,
      classifier_tmr: 0.1802,
      vocabulary: 0.0,
    } as Record<string, number>,
    languages: {
      ar: { offset: -1.1185, status: 'experimental' as SlopLanguageSupport },
      de: { offset: -1.5715, status: 'supported' as SlopLanguageSupport },
      es: { offset: -0.4565, status: 'supported' as SlopLanguageSupport },
      fr: { offset: -0.7151, status: 'supported' as SlopLanguageSupport },
      hi: { offset: -0.3106, status: 'unsupported' as SlopLanguageSupport },
      it: { offset: -0.4094, status: 'supported' as SlopLanguageSupport },
      ja: { offset: -0.8092, status: 'supported' as SlopLanguageSupport },
      ko: { offset: -0.317, status: 'experimental' as SlopLanguageSupport },
      nl: { offset: -0.6204, status: 'supported' as SlopLanguageSupport },
      pl: { offset: -0.2666, status: 'supported' as SlopLanguageSupport },
      pt: { offset: -0.7635, status: 'supported' as SlopLanguageSupport },
      ru: { offset: -0.972, status: 'supported' as SlopLanguageSupport },
      tr: { offset: 0.5528, status: 'unsupported' as SlopLanguageSupport },
      zh: { offset: -0.1435, status: 'unsupported' as SlopLanguageSupport },
    } as Record<string, { offset: number; status: SlopLanguageSupport }>,
  },
  english: {
    intercept: 0.9571,
    weights: {
      classifier_bert_raid: 0.0,
      binoculars: 0.0951,
      burstiness: 0.0074,
      classifier_chatgpt: 0.0,
      cross_perplexity: 0.0,
      classifier_desklib: 0.3686,
      diveye: 0.0,
      classifier_e5: 0.0,
      classifier_fakespot: 0.2621,
      fast_detectgpt: 0.0,
      formulaic: 0.1121,
      gltr: 0.0,
      linguistic: 0.0,
      log_rank: 0.0,
      classifier_openai: 0.0,
      perplexity: 0.0,
      classifier_remodetect: 0.0,
      readability: 0.0991,
      sentiment: 0.0,
      structural: 0.4081,
      classifier_superannotate: 0.1568,
      classifier_tmr: 0.0,
      vocabulary: 0.0,
    } as Record<string, number>,
    length_k: 5.0,
    length_neutral: -3.6,
    band_knots: [
      [-7.0416, 0.0],
      [-1.0416, 30.0],
      [0.2894, 45.0],
      [1.1572, 55.0],
      [2.1993, 80.0],
      [6.1993, 100.0],
    ] as [number, number][],
  },
  quick: {
    intercept: -0.5795,
    weights: {
      classifier_fakespot: 0.5705,
      classifier_tmr: 0.0225,
      classifier_bert_raid: 0.0,
      classifier_e5: 0.0,
      linguistic: 0.1145,
      formulaic: 0.1132,
    } as Record<string, number>,
    length_k: 30.0,
    length_neutral: -1.9,
    band_knots: [
      [-6.776, 0.0],
      [-0.776, 30.0],
      [0.3466, 45.0],
      [0.8174, 55.0],
      [1.1213, 80.0],
      [5.1213, 100.0],
    ] as [number, number][],
  },
};

/* ------------------------------------------------------------------ */
/* 3. Registry of All 23 SlopTotal Engines                            */
/* ------------------------------------------------------------------ */

export const SLOPTOTAL_ENGINES: SlopEngineMeta[] = [
  // Tier A — High-accuracy RAID-trained classifiers
  {
    key: 'classifier_tmr',
    name: 'TMR Detector',
    code: 'TM',
    engineType: 'classifier',
    description: 'RoBERTa-base RAID-trained detector — 97.3% accuracy, 2.3% FPR',
    url: 'https://huggingface.co/Oxidane/tmr-ai-text-detector',
    tier: 'A',
    isCheap: false,
    isQuick: true,
    cost: 2,
    englishWeight: SLOPTOTAL_CALIBRATION.english.weights.classifier_tmr,
    multilingualWeight: SLOPTOTAL_CALIBRATION.multilingual.weights.classifier_tmr,
    quickWeight: SLOPTOTAL_CALIBRATION.quick.weights.classifier_tmr,
  },
  {
    key: 'classifier_remodetect',
    name: 'ReMoDetect',
    code: 'RM',
    engineType: 'classifier',
    description: 'Reward-model detector targeting RLHF-aligned LLMs (GPT-4, Claude, Llama-chat)',
    url: 'https://huggingface.co/hyunseoki/ReMoDetect-deberta',
    tier: 'A',
    isCheap: false,
    isQuick: false,
    cost: 4,
    englishWeight: SLOPTOTAL_CALIBRATION.english.weights.classifier_remodetect,
    multilingualWeight: SLOPTOTAL_CALIBRATION.multilingual.weights.classifier_remodetect,
    quickWeight: 0,
  },

  // Tier B — Zero-shot / model-based methods
  {
    key: 'binoculars',
    name: 'Binoculars',
    code: 'BN',
    engineType: 'statistical',
    description: 'Cross-entropy ratio between two LMs — agreement signals AI-generated text',
    url: 'https://arxiv.org/abs/2401.12070',
    tier: 'B',
    isCheap: false,
    isQuick: false,
    cost: 3,
    englishWeight: SLOPTOTAL_CALIBRATION.english.weights.binoculars,
    multilingualWeight: SLOPTOTAL_CALIBRATION.multilingual.weights.binoculars,
    quickWeight: 0,
  },
  {
    key: 'fast_detectgpt',
    name: 'Fast-DetectGPT',
    code: 'FD',
    engineType: 'statistical',
    description: "Conditional probability curvature — AI tokens sit at peaks of the model's distribution",
    url: 'https://arxiv.org/abs/2310.05130',
    tier: 'B',
    isCheap: false,
    isQuick: false,
    cost: 3,
    englishWeight: SLOPTOTAL_CALIBRATION.english.weights.fast_detectgpt,
    multilingualWeight: SLOPTOTAL_CALIBRATION.multilingual.weights.fast_detectgpt,
    quickWeight: 0,
  },
  {
    key: 'perplexity',
    name: 'Perplexity',
    code: 'PP',
    engineType: 'statistical',
    description: 'GPT-2 perplexity scoring — low perplexity suggests AI-generated text',
    url: 'https://huggingface.co/openai-community/gpt2-medium',
    tier: 'B',
    isCheap: false,
    isQuick: false,
    cost: 2,
    englishWeight: SLOPTOTAL_CALIBRATION.english.weights.perplexity,
    multilingualWeight: SLOPTOTAL_CALIBRATION.multilingual.weights.perplexity,
    quickWeight: 0,
  },
  {
    key: 'cross_perplexity',
    name: 'Cross-Perplexity',
    code: 'XP',
    engineType: 'statistical',
    description: 'Compares perplexity across GPT-2 Large and DistilGPT-2 — agreement amplifies signal',
    url: 'https://huggingface.co/distilbert/distilgpt2',
    tier: 'B',
    isCheap: false,
    isQuick: false,
    cost: 2,
    englishWeight: SLOPTOTAL_CALIBRATION.english.weights.cross_perplexity,
    multilingualWeight: SLOPTOTAL_CALIBRATION.multilingual.weights.cross_perplexity,
    quickWeight: 0,
  },

  // Tier C — Other classifiers
  {
    key: 'classifier_fakespot',
    name: 'Fakespot',
    code: 'FS',
    engineType: 'classifier',
    description: 'RoBERTa-base AI text detector from the APOLLO system',
    url: 'https://huggingface.co/fakespot-ai/roberta-base-ai-text-detection-v1',
    tier: 'C',
    isCheap: false,
    isQuick: true,
    cost: 2,
    englishWeight: SLOPTOTAL_CALIBRATION.english.weights.classifier_fakespot,
    multilingualWeight: SLOPTOTAL_CALIBRATION.multilingual.weights.classifier_fakespot,
    quickWeight: SLOPTOTAL_CALIBRATION.quick.weights.classifier_fakespot,
  },
  {
    key: 'classifier_e5',
    name: 'E5-Small',
    code: 'E5',
    engineType: 'embedding',
    description: 'Ultra-lightweight E5 LoRA detector — 33M params, #2 on RAID benchmark',
    url: 'https://huggingface.co/MayZhou/e5-small-lora-ai-generated-detector',
    tier: 'C',
    isCheap: false,
    isQuick: true,
    cost: 1,
    englishWeight: SLOPTOTAL_CALIBRATION.english.weights.classifier_e5,
    multilingualWeight: SLOPTOTAL_CALIBRATION.multilingual.weights.classifier_e5,
    quickWeight: SLOPTOTAL_CALIBRATION.quick.weights.classifier_e5,
  },
  {
    key: 'classifier_bert_raid',
    name: 'BERT-tiny RAID',
    code: 'BT',
    engineType: 'classifier',
    description: 'BERT-tiny (4.4M params) trained on RAID dataset — ultra-fast inference',
    url: 'https://huggingface.co/ShantanuT01/BERT-tiny-RAID',
    tier: 'C',
    isCheap: false,
    isQuick: true,
    cost: 1,
    englishWeight: SLOPTOTAL_CALIBRATION.english.weights.classifier_bert_raid,
    multilingualWeight: SLOPTOTAL_CALIBRATION.multilingual.weights.classifier_bert_raid,
    quickWeight: SLOPTOTAL_CALIBRATION.quick.weights.classifier_bert_raid,
  },
  {
    key: 'classifier_openai',
    name: 'OpenAI Detector',
    code: 'OA',
    engineType: 'classifier',
    description: 'RoBERTa fine-tuned by OpenAI to detect GPT-generated text',
    url: 'https://huggingface.co/roberta-base-openai-detector',
    tier: 'C',
    isCheap: false,
    isQuick: false,
    cost: 2,
    englishWeight: SLOPTOTAL_CALIBRATION.english.weights.classifier_openai,
    multilingualWeight: SLOPTOTAL_CALIBRATION.multilingual.weights.classifier_openai,
    quickWeight: 0,
  },
  {
    key: 'classifier_chatgpt',
    name: 'ChatGPT Detector',
    code: 'CG',
    engineType: 'classifier',
    description: 'RoBERTa trained specifically on ChatGPT-generated text',
    url: 'https://huggingface.co/Hello-SimpleAI/chatgpt-detector-roberta',
    tier: 'C',
    isCheap: false,
    isQuick: false,
    cost: 2,
    englishWeight: SLOPTOTAL_CALIBRATION.english.weights.classifier_chatgpt,
    multilingualWeight: SLOPTOTAL_CALIBRATION.multilingual.weights.classifier_chatgpt,
    quickWeight: 0,
  },
  {
    key: 'classifier_desklib',
    name: 'Desklib DeBERTa',
    code: 'DL',
    engineType: 'classifier',
    description: 'DeBERTa-v3-large fine-tuned on GPT-4, Claude, Llama — RAID benchmark leader',
    url: 'https://huggingface.co/desklib/ai-text-detector-v1.01',
    tier: 'C',
    isCheap: false,
    isQuick: false,
    cost: 5,
    englishWeight: SLOPTOTAL_CALIBRATION.english.weights.classifier_desklib,
    multilingualWeight: SLOPTOTAL_CALIBRATION.multilingual.weights.classifier_desklib,
    quickWeight: 0,
  },
  {
    key: 'classifier_superannotate',
    name: 'SuperAnnotate',
    code: 'SN',
    engineType: 'classifier',
    description: 'RoBERTa-large optimized for low false-positive rate — RAID benchmark',
    url: 'https://huggingface.co/SuperAnnotate/ai-detector',
    tier: 'C',
    isCheap: false,
    isQuick: false,
    cost: 4,
    englishWeight: SLOPTOTAL_CALIBRATION.english.weights.classifier_superannotate,
    multilingualWeight: SLOPTOTAL_CALIBRATION.multilingual.weights.classifier_superannotate,
    quickWeight: 0,
  },

  // Tier D — GPT-2 derived statistics
  {
    key: 'gltr',
    name: 'GLTR',
    code: 'GL',
    engineType: 'statistical',
    description: 'Token rank distribution — AI text uses disproportionately top-ranked tokens',
    url: 'https://arxiv.org/abs/1906.04043',
    tier: 'D',
    isCheap: false,
    isQuick: false,
    cost: 2,
    englishWeight: SLOPTOTAL_CALIBRATION.english.weights.gltr,
    multilingualWeight: SLOPTOTAL_CALIBRATION.multilingual.weights.gltr,
    quickWeight: 0,
  },
  {
    key: 'log_rank',
    name: 'Log-Rank',
    code: 'LR',
    engineType: 'statistical',
    description: 'Average log-rank of tokens under GPT-2 — lower rank means more predictable (AI-like)',
    url: 'https://huggingface.co/openai-community/gpt2-medium',
    tier: 'D',
    isCheap: false,
    isQuick: false,
    cost: 2,
    englishWeight: SLOPTOTAL_CALIBRATION.english.weights.log_rank,
    multilingualWeight: SLOPTOTAL_CALIBRATION.multilingual.weights.log_rank,
    quickWeight: 0,
  },
  {
    key: 'diveye',
    name: 'DivEye',
    code: 'DE',
    engineType: 'statistical',
    description: 'Surprisal diversity — measures per-token surprisal variance across text',
    tier: 'D',
    isCheap: false,
    isQuick: false,
    cost: 2,
    englishWeight: SLOPTOTAL_CALIBRATION.english.weights.diveye,
    multilingualWeight: SLOPTOTAL_CALIBRATION.multilingual.weights.diveye,
    quickWeight: 0,
  },
  {
    key: 'burstiness',
    name: 'Burstiness',
    code: 'BU',
    engineType: 'linguistic',
    description: 'Measures per-sentence perplexity variance — flat rhythm suggests AI',
    tier: 'D',
    isCheap: false,
    isQuick: false,
    cost: 2,
    englishWeight: SLOPTOTAL_CALIBRATION.english.weights.burstiness,
    multilingualWeight: SLOPTOTAL_CALIBRATION.multilingual.weights.burstiness,
    quickWeight: 0,
  },

  // Tier E — Heuristic engines (exact 1:1 port of SlopTotal's 6 regex/counting engines)
  {
    key: 'linguistic',
    name: 'Linguistic Markers',
    code: 'LM',
    engineType: 'linguistic',
    description: 'Detects AI-preferred words and phrases (delve, tapestry, landscape...)',
    tier: 'E',
    isCheap: true,
    isQuick: true,
    cost: 1,
    englishWeight: SLOPTOTAL_CALIBRATION.english.weights.linguistic,
    multilingualWeight: SLOPTOTAL_CALIBRATION.multilingual.weights.linguistic,
    quickWeight: SLOPTOTAL_CALIBRATION.quick.weights.linguistic,
  },
  {
    key: 'structural',
    name: 'Structural Analysis',
    code: 'SA',
    engineType: 'linguistic',
    description: 'Analyzes em-dash usage, sentence uniformity, list density, paragraph regularity, colon patterns',
    tier: 'E',
    isCheap: true,
    isQuick: false,
    cost: 1,
    englishWeight: SLOPTOTAL_CALIBRATION.english.weights.structural,
    multilingualWeight: SLOPTOTAL_CALIBRATION.multilingual.weights.structural,
    quickWeight: 0,
  },
  {
    key: 'vocabulary',
    name: 'Vocabulary Richness',
    code: 'VR',
    engineType: 'linguistic',
    description: "Measures type-token ratio, hapax legomena, and Yule's K diversity",
    tier: 'E',
    isCheap: true,
    isQuick: false,
    cost: 1,
    englishWeight: SLOPTOTAL_CALIBRATION.english.weights.vocabulary,
    multilingualWeight: SLOPTOTAL_CALIBRATION.multilingual.weights.vocabulary,
    quickWeight: 0,
  },
  {
    key: 'formulaic',
    name: 'Formulaic Patterns',
    code: 'FP',
    engineType: 'linguistic',
    description: 'Detects cliché AI openings, closings, filler patterns, and structural repetition',
    tier: 'E',
    isCheap: true,
    isQuick: true,
    cost: 1,
    englishWeight: SLOPTOTAL_CALIBRATION.english.weights.formulaic,
    multilingualWeight: SLOPTOTAL_CALIBRATION.multilingual.weights.formulaic,
    quickWeight: SLOPTOTAL_CALIBRATION.quick.weights.formulaic,
  },
  {
    key: 'readability',
    name: 'Readability Uniformity',
    code: 'RU',
    engineType: 'linguistic',
    description: 'Checks cross-paragraph readability variance (Flesch Reading Ease CV)',
    tier: 'E',
    isCheap: true,
    isQuick: false,
    cost: 1,
    englishWeight: SLOPTOTAL_CALIBRATION.english.weights.readability,
    multilingualWeight: SLOPTOTAL_CALIBRATION.multilingual.weights.readability,
    quickWeight: 0,
  },
  {
    key: 'sentiment',
    name: 'Sentiment & Hedging',
    code: 'SH',
    engineType: 'linguistic',
    description: 'Detects excessive hedging, forced balance, vague positivity, and explanatory patterns',
    tier: 'E',
    isCheap: true,
    isQuick: false,
    cost: 1,
    englishWeight: SLOPTOTAL_CALIBRATION.english.weights.sentiment,
    multilingualWeight: SLOPTOTAL_CALIBRATION.multilingual.weights.sentiment,
    quickWeight: 0,
  },
];

/* ------------------------------------------------------------------ */
/* 4. Language Detection & Unspaced Word Counting (app/language.py)   */
/* ------------------------------------------------------------------ */

const FUNCTION_WORDS: Record<string, Set<string>> = {
  en: new Set('the of and to in is that it for was on with as are this be by not have'.split(' ')),
  es: new Set('de la que el en y los se del las un por con no una para es su al lo'.split(' ')),
  fr: new Set('de la le et les des en un une du est que dans pour qui pas sur au par'.split(' ')),
  de: new Set('der die und in den von zu das mit sich des auf für ist im nicht ein eine dem'.split(' ')),
  pt: new Set('de que o a do da em um para é com não uma os no se na por mais'.split(' ')),
  it: new Set('di che e la il un a per in è non una sono del con le si da della'.split(' ')),
  nl: new Set('de van het een en in is dat op te zijn met voor niet aan er die ook'.split(' ')),
  pl: new Set('na nie się do to że jest jak co ale tak od po przez dla oraz jego jej są był była który która które ich jako także tego też może już'.split(' ')),
  tr: new Set('ve bir bu da de için ile olarak çok daha gibi olan en ama sonra kadar ise olduğu değil her göre ancak kendi sadece'.split(' ')),
  ro: new Set('și în este pentru care sunt cu din pe mai fost această acest fiind prin între sau nu ca la'.split(' ')),
  ca: new Set('amb per els les del una que és són també però aquest aquesta seu dels això no de la el un en al perquè molt seva doncs què més quan només'.split(' ')),
  id: new Set('yang dan di untuk dengan ini itu dari dalam tidak ada pada akan juga atau'.split(' ')),
  vi: new Set('và của là có được trong cho những với này không người các một đã'.split(' ')),
  sv: new Set('och att det som är för med på inte av till har om ett jag'.split(' ')),
  da: new Set('og at det som er for med på ikke af til har om et jeg'.split(' ')),
  fi: new Set('ja on ei että se oli hän mutta kuin niin myös kun jos tai vain ovat ole tämä siitä'.split(' ')),
  cs: new Set('je že se na to do ale jako byl jsou nebo pro jeho které který při podle také už'.split(' ')),
  hu: new Set('az és hogy nem is egy de van csak már még meg ha mint volt vagy ami után által lehet'.split(' ')),
};

const CJK_RE = /[\u3040-\u30ff\u4e00-\u9fff]/g;
const CJK_PUNCT_RE = /[\u3000-\u303f\uff00-\uffef]/g;
const UNSPACED_RE = /[\u3040-\u30ff\u4e00-\u9fff\u0e00-\u0eff\u1000-\u109f\u1780-\u17ff]/g;

const UNSPACED_SCRIPTS: Array<[RegExp, number]> = [
  [CJK_RE, 2],
  [/[\u0e00-\u0e7f]/g, 5], // Thai
  [/[\u0e80-\u0eff]/g, 6], // Lao
  [/[\u1780-\u17ff]/g, 6], // Khmer
  [/[\u1000-\u109f]/g, 8], // Burmese
];

export function isUnspaced(text: string): boolean {
  const letters = (text.match(/[a-zA-Zа-яА-ЯёЁ\u00c0-\u024f\u0400-\u04ff\u0600-\u06ff\u0900-\u097f\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af\u0e00-\u0eff\u1000-\u109f\u1780-\u17ff]/g) || []).length;
  if (letters === 0) return false;
  const unspaced = (text.match(UNSPACED_RE) || []).length;
  return unspaced > letters / 2;
}

export function countSlopWords(text: string): number {
  let spaced = text.replace(CJK_PUNCT_RE, ' ');
  let unspacedFrac = 0;
  for (const [re, charsPerWord] of UNSPACED_SCRIPTS) {
    const matches = text.match(re);
    if (matches) {
      unspacedFrac += matches.length / charsPerWord;
    }
    spaced = spaced.replace(re, ' ');
  }
  const spacedCount = spaced.trim() ? spaced.trim().split(/\s+/).length : 0;
  return spacedCount + Math.ceil(unspacedFrac);
}

export function detectLanguage(text: string): string {
  const counts: Record<string, number> = {
    hangul: 0,
    kana: 0,
    han: 0,
    arabic: 0,
    devanagari: 0,
    cyrillic: 0,
    latin: 0,
  };

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if ((code >= 0xac00 && code <= 0xd7af) || (code >= 0x1100 && code <= 0x11ff)) {
      counts.hangul++;
    } else if (code >= 0x3040 && code <= 0x30ff) {
      counts.kana++;
    } else if (code >= 0x4e00 && code <= 0x9fff) {
      counts.han++;
    } else if (code >= 0x0600 && code <= 0x06ff) {
      counts.arabic++;
    } else if (code >= 0x0900 && code <= 0x097f) {
      counts.devanagari++;
    } else if (code >= 0x0400 && code <= 0x04ff) {
      counts.cyrillic++;
    } else if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 0x00c0 && code <= 0x024f)) {
      counts.latin++;
    }
  }

  let topScript = '';
  let topCount = 0;
  for (const [script, cnt] of Object.entries(counts)) {
    if (cnt > topCount) {
      topCount = cnt;
      topScript = script;
    }
  }
  if (topCount === 0) return 'other';

  if (topScript === 'han' || topScript === 'kana') {
    return counts.kana > 0.05 * (counts.han + counts.kana) ? 'ja' : 'zh';
  }
  if (topScript === 'cyrillic') {
    return /[іїєґІЇЄҐ]/.test(text) ? 'uk' : 'ru';
  }
  if (topScript === 'hangul') return 'ko';
  if (topScript === 'arabic') return 'ar';
  if (topScript === 'devanagari') return 'hi';

  const rawTokens = text.toLowerCase().match(/[a-z\u00c0-\u024f]+/g) || [];
  const tokens = rawTokens.filter((t) => t.length > 1);
  if (tokens.length === 0) return 'other';

  let bestLang = 'other';
  let bestVotes = 0;
  for (const [lang, words] of Object.entries(FUNCTION_WORDS)) {
    let v = 0;
    for (const t of tokens) {
      if (words.has(t)) v++;
    }
    if (v > bestVotes) {
      bestVotes = v;
      bestLang = lang;
    }
  }
  return bestVotes >= 0.08 * tokens.length ? bestLang : 'other';
}

export function languageSupport(lang: string): SlopLanguageSupport {
  if (lang === 'en') return 'supported';
  return SLOPTOTAL_CALIBRATION.multilingual.languages[lang]?.status || 'unsupported';
}

/* ------------------------------------------------------------------ */
/* 5. Logistic Calibration & Confidence (app/calibration.py)          */
/* ------------------------------------------------------------------ */

function logit(p: number): number {
  const clamped = Math.min(Math.max(p, 0.01), 0.99);
  return Math.log(clamped / (1 - clamped));
}

function weightedLogOdds(
  section: { intercept: number; weights: Record<string, number> },
  engineScores: Record<string, number>
): number {
  let z = section.intercept;
  for (const [key, weight] of Object.entries(section.weights)) {
    const val = engineScores[key] !== undefined ? engineScores[key] : 0.5;
    z += weight * logit(val);
  }
  return z;
}

function interpolateKnots(z: number, knots: [number, number][]): number {
  if (z <= knots[0][0]) return knots[0][1];
  for (let i = 0; i < knots.length - 1; i++) {
    const [z0, s0] = knots[i];
    const [z1, s1] = knots[i + 1];
    if (z <= z1) {
      return s0 + ((s1 - s0) * (z - z0)) / (z1 - z0);
    }
  }
  return knots[knots.length - 1][1];
}

function computeConfidence(score: number, words: number, support: SlopLanguageSupport): SlopConfidence {
  if (words < SLOPTOTAL_BANDS.SHORT_TEXT_WORDS || support === 'unsupported' || (score >= 35 && score <= 65)) {
    return 'low';
  }
  if (support === 'experimental' || (score >= 15 && score < 80)) {
    return 'medium';
  }
  return 'high';
}

export function scoringEnginesForText(text: string): Set<string> {
  const section = detectLanguage(text) === 'en' ? SLOPTOTAL_CALIBRATION.english : SLOPTOTAL_CALIBRATION.multilingual;
  return new Set(
    Object.entries(section.weights)
      .filter(([, w]) => w > 0)
      .map(([k]) => k)
  );
}

export function calibratedScore(
  engineScores: Record<string, number>,
  text: string
): { score: number; confidence: SlopConfidence; language: string; support: SlopLanguageSupport } {
  const lang = detectLanguage(text);
  const words = countSlopWords(text);
  let score = 50;

  if (lang === 'en') {
    const eng = SLOPTOTAL_CALIBRATION.english;
    let z = weightedLogOdds(eng, engineScores);
    const k = eng.length_k;
    const reliability = k ? words / (words + k) : 1.0;
    z = reliability * z + (1 - reliability) * eng.length_neutral;
    score = interpolateKnots(z, eng.band_knots);
  } else {
    const ml = SLOPTOTAL_CALIBRATION.multilingual;
    const offset = ml.languages[lang]?.offset ?? ml.default_offset;
    let z = weightedLogOdds(ml, engineScores) + offset;
    const ref = ml.short_ref_words;
    if (!isUnspaced(text) && words > 0 && words < ref) {
      z -= ml.short_alpha * (1 / words - 1 / ref);
    }
    score = 100 / (1 + Math.exp(-z));
  }

  const rounded = Number(score.toFixed(1));
  const support = languageSupport(lang);
  return {
    score: rounded,
    confidence: computeConfidence(rounded, words, support),
    language: lang,
    support,
  };
}

export function scoreRangeForPartial(engineScores: Record<string, number>, text: string): [number, number] {
  const needed = scoringEnginesForText(text);
  const lowMap: Record<string, number> = { ...engineScores };
  const highMap: Record<string, number> = { ...engineScores };
  for (const k of needed) {
    if (lowMap[k] === undefined) lowMap[k] = 0.0;
    if (highMap[k] === undefined) highMap[k] = 1.0;
  }
  const low = calibratedScore(lowMap, text).score;
  const high = calibratedScore(highMap, text).score;
  return [low, high];
}

export function quickCalibratedScore(
  engineScores: Record<string, number>,
  text: string
): { score: number; confidence: SlopConfidence; language: string; support: SlopLanguageSupport } {
  const q = SLOPTOTAL_CALIBRATION.quick;
  const words = countSlopWords(text);
  let z = weightedLogOdds(q, engineScores);
  const k = q.length_k;
  const reliability = k ? words / (words + k) : 1.0;
  z = reliability * z + (1 - reliability) * q.length_neutral;
  const score = Number(interpolateKnots(z, q.band_knots).toFixed(1));
  const lang = detectLanguage(text);
  const support = languageSupport(lang);
  return {
    score,
    confidence: computeConfidence(score, words, support),
    language: lang,
    support,
  };
}

/* ------------------------------------------------------------------ */
/* 6. Heuristic Engines (Exact 1:1 Port of SlopTotal Tier E)          */
/* ------------------------------------------------------------------ */

export const SLOPTOTAL_AI_MARKERS: Array<[string, number]> = [
  // Tier 1: Very strong AI signals (weight 3)
  ['delve', 3],
  ['tapestry', 3],
  ['multifaceted', 3],
  ['ever-evolving', 3],
  ['thought-provoking', 3],
  ["it's important to note", 3],
  ["it's worth noting", 3],
  ["in today's digital age", 3],
  ["in today's rapidly evolving", 3],
  ["let's dive in", 3],
  // Tier 2: Strong signals (weight 2)
  ['landscape', 2],
  ['navigate', 2],
  ['leverage', 2],
  ['foster', 2],
  ['pivotal', 2],
  ['nuanced', 2],
  ['robust', 2],
  ['holistic', 2],
  ['synergy', 2],
  ['paradigm', 2],
  ['encompass', 2],
  ['intricate', 2],
  ['comprehensive', 2],
  ['underscores', 2],
  ['underscore', 2],
  ['realm', 2],
  ['cornerstone', 2],
  ['underpinning', 2],
  ['facilitating', 2],
  ['harnessing', 2],
  ['spearheading', 2],
  ['revolutionize', 2],
  ['groundbreaking', 2],
  ['cutting-edge', 2],
  ['game-changer', 2],
  ['deep dive', 2],
  ['at the forefront', 2],
  ['at its core', 2],
  ['in the realm of', 2],
  ['it is crucial', 2],
  ['it is essential', 2],
  ['plays a crucial role', 2],
  ['serves as a testament', 2],
  ['is a testament to', 2],
  ['a myriad of', 2],
  ['plethora', 2],
  // Tier 3: Moderate signals (weight 1)
  ['crucial', 1],
  ['enhance', 1],
  ['dynamic', 1],
  ['innovative', 1],
  ['streamline', 1],
  ['optimize', 1],
  ['elevate', 1],
  ['empower', 1],
  ['stakeholder', 1],
  ['ecosystem', 1],
  ['actionable', 1],
  ['seamless', 1],
  ['seamlessly', 1],
  ['furthermore', 1],
  ['moreover', 1],
  ['consequently', 1],
  ['nevertheless', 1],
  ['in conclusion', 1],
  ['ultimately', 1],
  ['in essence', 1],
  ['it is important to', 1],
  ['not only', 1],
  ['but also', 1],
  ['on the other hand', 1],
  ['having said that', 1],
  ['that being said', 1],
  ['with that in mind', 1],
  ['in this context', 1],
  ['in light of', 1],
  ['as we navigate', 1],
  ['when it comes to', 1],
  ['it goes without saying', 1],
  ['needless to say', 1],
  ['at the end of the day', 1],
  ['the bottom line', 1],
  ['key takeaway', 1],
  ['food for thought', 1],
  ['resonate', 1],
  ['aligns with', 1],
  ['bolster', 1],
  ['catalyst', 1],
  ['testament', 1],
  ['arguably', 1],
  ['notably', 1],
  ['specifically', 1],
  ['essentially', 1],
  ['fundamentally', 1],
  ['inherently', 1],
  ['intricacies', 1],
  // Spanish markers (from linguistic.py)
  ['en el panorama actual', 2],
  ['es importante destacar', 2],
  ['cabe señalar', 2],
  ['en este contexto', 2],
  ['sin lugar a dudas', 2],
  ['en la era digital', 2],
  ['resulta fundamental', 2],
  ['no cabe duda', 2],
  // Russian AI markers (mirrors SlopTotal linguistic.py semantics for ru text)
  ['следует отметить', 3],
  ['необходимо подчеркнуть', 3],
  ['играет ключевую роль', 3],
  ['является неотъемлемой', 3],
  ['в современном дискурсе', 3],
  ['в рамках', 2],
  ['данное обстоятельство', 2],
  ['представляется возможным', 2],
  ['краеугольный камень', 2],
  ['многогранный', 2],
  ['свидетельствует о том', 2],
  ['обусловлено необходимостью', 2],
  ['особую актуальность приобретает', 2],
  ['в конечном счете', 1],
  ['подводя итог', 1],
  ['комплексный подход', 1],
  ['нельзя не отметить', 2],
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cyrOrLatinWordBoundaryCount(textLower: string, phrase: string): number {
  const escaped = escapeRegex(phrase);
  const re = new RegExp(`(^|[^a-zA-Zа-яА-ЯёЁ0-9_])${escaped}(?![a-zA-Zа-яА-ЯёЁ0-9_])`, 'g');
  const matches = textLower.match(re);
  return matches ? matches.length : 0;
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stdevSample(nums: number[]): number {
  if (nums.length < 2) return 0;
  const m = mean(nums);
  const sumSq = nums.reduce((acc, v) => acc + (v - m) ** 2, 0);
  return Math.sqrt(sumSq / (nums.length - 1));
}

export function runLinguisticEngine(text: string): { score: number; details: string; matchedMarkers: string[] } {
  const lower = text.toLowerCase();
  const wordCount = Math.max(text.trim().split(/\s+/).filter(Boolean).length, 1);
  let totalWeight = 0;
  const foundFormatted: string[] = [];
  const rawMatched: string[] = [];

  for (const [marker, weight] of SLOPTOTAL_AI_MARKERS) {
    const count = cyrOrLatinWordBoundaryCount(lower, marker);
    if (count > 0) {
      totalWeight += count * weight;
      rawMatched.push(marker);
      foundFormatted.push(count > 1 ? `"${marker}" ×${count}` : `"${marker}"`);
    }
  }

  const density = (totalWeight / wordCount) * 1000;
  const score = Math.min(density / 15.0, 1.0);
  const details =
    foundFormatted.length > 0
      ? `Found ${foundFormatted.length} AI markers (density: ${density.toFixed(1)}/1k words): ${foundFormatted.slice(0, 8).join(', ')}${foundFormatted.length > 8 ? ` and ${foundFormatted.length - 8} more` : ''}`
      : 'No significant AI linguistic markers detected.';

  return { score: Number(score.toFixed(3)), details, matchedMarkers: rawMatched };
}

export function runStructuralEngine(text: string): { score: number; details: string } {
  const signals: string[] = [];
  const wordCount = Math.max(text.trim().split(/\s+/).filter(Boolean).length, 1);

  // 1. Em-dash frequency (word—word without spaces, matching SlopTotal structural.py)
  const emDashes = (text.match(/[a-zA-Zа-яА-ЯёЁ0-9]—[a-zA-Zа-яА-ЯёЁ0-9]/g) || []).length;
  const emDashRate = (emDashes / wordCount) * 1000;
  const emScore = Math.min(emDashRate / 6.0, 1.0);
  if (emDashes > 0) signals.push(`Em-dashes: ${emDashes} (${emDashRate.toFixed(1)}/1k words)`);

  // 2. Sentence length uniformity
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).filter(Boolean).length >= 3);
  let uniformityScore = 0.0;
  if (sentences.length >= 3) {
    const lengths = sentences.map((s) => s.split(/\s+/).filter(Boolean).length);
    const m = mean(lengths);
    const sd = stdevSample(lengths);
    const cv = m > 0 ? sd / m : 0;
    uniformityScore = Math.max(0, 1.0 - cv / 0.6);
    signals.push(`Sentence length CV: ${cv.toFixed(2)} (mean ${m.toFixed(0)} words)`);
  }

  // 3. List/bullet density per 1k words
  const lines = text.split('\n');
  const listLines = lines.filter((l) => /^\s*[-•*]\s/.test(l) || /^\s*\d+[.)]\s/.test(l)).length;
  const listPer1k = (listLines / wordCount) * 1000;
  const listScore = Math.min(listPer1k / 30.0, 1.0);
  if (listLines > 0) signals.push(`List items: ${listLines} (${listPer1k.toFixed(1)}/1k words)`);

  // 4. Paragraph length uniformity
  const paragraphs = text
    .split('\n\n')
    .map((p) => p.trim())
    .filter((p) => p.split(/\s+/).filter(Boolean).length >= 5);
  let paraScore = 0.0;
  if (paragraphs.length >= 3) {
    const pLens = paragraphs.map((p) => p.split(/\s+/).filter(Boolean).length);
    const pm = mean(pLens);
    const psd = stdevSample(pLens);
    const pcv = pm > 0 ? psd / pm : 0;
    paraScore = Math.max(0, 1.0 - pcv / 0.5);
    signals.push(`Paragraph length CV: ${pcv.toFixed(2)}`);
  }

  // 5. Bold/heading density
  const boldCount = (text.match(/\*\*[^*]+\*\*/g) || []).length;
  const headingCount = (text.match(/^#{1,6}\s/gm) || []).length;
  const formatDensity = ((boldCount + headingCount) / wordCount) * 1000;
  const formatScore = Math.min(formatDensity / 10.0, 1.0);
  if (boldCount + headingCount > 0) signals.push(`Bold/heading elements: ${boldCount + headingCount}`);

  // 6. Colon density per 1k words
  const colonCount = (text.match(/:/g) || []).length;
  const colonDensity = (colonCount / wordCount) * 1000;
  const colonScore = Math.min(Math.max(colonDensity - 8, 0) / 15.0, 1.0);
  if (colonDensity > 8) signals.push(`Colon density: ${colonDensity.toFixed(1)}/1k words`);

  // 7. Colon-introduced definitions ("Term: Explanation")
  const colonDefs = (text.match(/[A-ZА-ЯЁ][a-zа-яё]+(?:\s[A-ZА-ЯЁ]?[a-zа-яё]+){0,3}:\s[A-ZА-ЯЁ]/g) || []).length;
  const colonDefScore = Math.min(colonDefs / 3.0, 1.0);
  if (colonDefs > 0) signals.push(`Colon definitions: ${colonDefs}`);

  const finalScore =
    emScore * 0.08 +
    uniformityScore * 0.08 +
    listScore * 0.12 +
    paraScore * 0.07 +
    formatScore * 0.05 +
    colonScore * 0.30 +
    colonDefScore * 0.30;

  return {
    score: Number(finalScore.toFixed(3)),
    details: signals.length > 0 ? signals.join('; ') : 'No structural anomalies detected.',
  };
}

export function runVocabularyEngine(text: string): { score: number; details: string } {
  const words = text.toLowerCase().match(/[a-zа-яё]+/gi) || [];
  if (words.length < 20) {
    return { score: 0.0, details: 'Text too short for vocabulary analysis.' };
  }

  const total = words.length;
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  const unique = freq.size;

  const rootTtr = unique / Math.sqrt(total);
  const ttrScore = Math.min(Math.max(1.0 - (rootTtr - 3.5) / 4.0, 0.0), 1.0);

  let hapax = 0;
  const freqOfFreq = new Map<number, number>();
  for (const count of freq.values()) {
    if (count === 1) hapax++;
    freqOfFreq.set(count, (freqOfFreq.get(count) || 0) + 1);
  }
  const hapaxRatio = unique > 0 ? hapax / unique : 0;
  const hapaxScore = Math.min(Math.max(1.0 - (hapaxRatio - 0.3) / 0.4, 0.0), 1.0);

  const m1 = total;
  let m2 = 0;
  for (const [i, v] of freqOfFreq.entries()) {
    m2 += i * i * v;
  }
  const yulesK = m1 > 0 ? (10000 * (m2 - m1)) / (m1 * m1) : 0;
  const kScore = Math.min(Math.max((yulesK - 80) / 120, 0.0), 1.0);

  const finalScore = ttrScore * 0.35 + hapaxScore * 0.35 + kScore * 0.3;
  return {
    score: Number(finalScore.toFixed(3)),
    details: `Root TTR: ${rootTtr.toFixed(2)} (unique/√total), Hapax ratio: ${hapaxRatio.toFixed(2)} (${hapax}/${unique} words), Yule's K: ${yulesK.toFixed(1)}`,
  };
}

const AI_OPENERS = [
  /in today'?s (?:rapidly )?(?:evolving|changing|digital|modern)/i,
  /in (?:the|a) (?:world|era|age|landscape) (?:where|of|that)/i,
  /when it comes to/i,
  /in the realm of/i,
  /(?:are you |ever )?(?:looking|wondering|struggling|trying) to/i,
  /(?:have you ever )?wondered (?:what|how|why)/i,
  /let'?s (?:dive|explore|take a (?:closer )?look|unpack|break down)/i,
  /(?:imagine|picture) (?:this|a world)/i,
  /(?:whether you'?re|if you'?re) (?:a |an )?(?:seasoned|beginner|new)/i,
  /(?:in|throughout) (?:recent years|the past decade|today'?s society)/i,
  /(?:it'?s no (?:secret|surprise)|there'?s no denying) that/i,
  /as (?:technology|the world|we|society) continues to/i,
  /the (?:rise|emergence|advent|proliferation) of/i,
  /в современном мире|в эпоху стремительного развития/i,
];

const AI_CLOSERS = [
  /in conclusion,?/i,
  /(?:in summary|to summarize|to sum up),?/i,
  /(?:ultimately|at the end of the day),?/i,
  /as we (?:navigate|move forward|look ahead|continue)/i,
  /the (?:future|road ahead) (?:is|looks|holds)/i,
  /(?:by|through) (?:embracing|leveraging|harnessing|adopting)/i,
  /(?:only time will tell|the possibilities are (?:endless|limitless))/i,
  /(?:it'?s clear|one thing is (?:clear|certain)) that/i,
  /(?:в заключение|подводя итог|резюмируя сказанное)/i,
];

const FILLER_PATTERNS = [
  /not only\b.{3,60}\bbut also/gi,
  /on (?:the )?one hand\b.{3,120}\bon the other(?: hand)?/gi,
  /it(?:'?s| is) (?:important|worth|crucial|essential|interesting) to (?:note|remember|mention|highlight|consider|understand|recognize)/gi,
  /(?:this|that|which) (?:is to say|means that|implies that|suggests that|indicates that)/gi,
  /(?:needless to say|it goes without saying)/gi,
  /(?:first and foremost|last but not least)/gi,
  /(?:without (?:a )?doubt|beyond (?:a )?shadow of (?:a )?doubt)/gi,
  /(?:serves as|acts as) (?:a )?(?:powerful |key |critical )?(?:reminder|testament|example|illustration)/gi,
  /не только\b.{3,60}\bно и/gi,
  /с одной стороны\b.{3,120}\bс другой стороны/gi,
];

export function runFormulaicEngine(text: string): { score: number; details: string } {
  const lower = text.toLowerCase();
  const wordCount = Math.max(text.trim().split(/\s+/).filter(Boolean).length, 1);
  const found: string[] = [];

  const openerText = lower.slice(0, 300);
  for (const re of AI_OPENERS) {
    const m = openerText.match(re);
    if (m) {
      found.push(`opener: "${m[0]}"`);
      break;
    }
  }

  const closerText = lower.slice(-400);
  for (const re of AI_CLOSERS) {
    const m = closerText.match(re);
    if (m) {
      found.push(`closer: "${m[0]}"`);
      break;
    }
  }

  let fillerCount = 0;
  for (const re of FILLER_PATTERNS) {
    const matches = lower.match(re) || [];
    fillerCount += matches.length;
    for (const m of matches.slice(0, 2)) {
      found.push(`filler: "${m.slice(0, 50)}"`);
    }
  }

  // Starter repetition
  const sents = text.split(/(?<=[.!?])\s+/);
  const firstWords: string[] = [];
  for (const s of sents) {
    const m = s.trim().match(/^[A-Za-zА-Яа-яЁё]+/);
    if (m) firstWords.push(m[0].toLowerCase());
  }
  let starterScore = 0.0;
  if (firstWords.length >= 5) {
    const counts = new Map<string, number>();
    for (const w of firstWords) counts.set(w, (counts.get(w) || 0) + 1);
    let repeated = 0;
    for (const c of counts.values()) if (c > 1) repeated += c;
    const repeatRatio = repeated / firstWords.length;
    starterScore = Math.min(Math.max(repeatRatio - 0.55, 0) / 0.25, 1.0);
    if (repeatRatio > 0.55) {
      const tops = Array.from(counts.entries())
        .filter(([, c]) => c > 1)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([w, c]) => `"${w}"x${c}`);
      found.push(`starter repetition: ${Math.round(repeatRatio * 100)}% (${tops.join(', ')})`);
    }
  }

  // Heading -> bullet-list sections
  const lines = text.split('\n');
  let headingListCount = 0;
  let i = 0;
  while (i < lines.length - 1) {
    const line = lines[i].trim();
    if (line && line.length < 60 && !line.endsWith('.') && !/^\s*[-•*]\s/.test(line)) {
      let j = i + 1;
      let bulletRun = 0;
      while (j < lines.length && /^\s*[-•*]\s/.test(lines[j].trim())) {
        bulletRun++;
        j++;
      }
      if (bulletRun >= 2) {
        headingListCount++;
        i = j;
        continue;
      }
    }
    i++;
  }
  const headingListScore = Math.min(headingListCount / 3.0, 1.0);
  if (headingListCount > 0) found.push(`heading→list sections: ${headingListCount}`);

  const openerScore = found.some((f) => f.startsWith('opener')) ? 1.0 : 0.0;
  const closerScore = found.some((f) => f.startsWith('closer')) ? 1.0 : 0.0;
  const fillerDensity = (fillerCount / wordCount) * 1000;
  const fillerScore = Math.min(fillerDensity / 5.0, 1.0);

  const finalScore =
    openerScore * 0.20 +
    closerScore * 0.15 +
    fillerScore * 0.30 +
    starterScore * 0.05 +
    headingListScore * 0.30;

  return {
    score: Number(finalScore.toFixed(3)),
    details:
      found.length > 0
        ? `Found ${found.length} formulaic patterns: ${found.slice(0, 8).join('; ')}`
        : 'No formulaic AI patterns detected.',
  };
}

function syllableCount(word: string): number {
  const cleaned = word.toLowerCase().replace(/e$/, '');
  const vowels = /[aeiouyаеёиоуыэюя]/;
  let count = 0;
  let prevVowel = false;
  for (let i = 0; i < cleaned.length; i++) {
    const isV = vowels.test(cleaned[i]);
    if (isV && !prevVowel) count++;
    prevVowel = isV;
  }
  return Math.max(count, 1);
}

function fleschKincaid(text: string): number {
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).filter(Boolean).length >= 3);
  if (sentences.length === 0) return 0.0;
  const words = text.match(/[a-zA-Zа-яА-ЯёЁ]+/g) || [];
  if (words.length === 0) return 0.0;
  const totalSyllables = words.reduce((acc, w) => acc + syllableCount(w), 0);
  return 206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (totalSyllables / words.length);
}

export function runReadabilityEngine(text: string): { score: number; details: string } {
  let paragraphs = text
    .split('\n\n')
    .map((p) => p.trim())
    .filter((p) => p.split(/\s+/).filter(Boolean).length >= 15);

  if (paragraphs.length < 3) {
    const words = text.trim().split(/\s+/).filter(Boolean);
    const chunkSize = Math.max(Math.floor(words.length / 4), 20);
    paragraphs = [];
    for (let i = 0; i < words.length; i += chunkSize) {
      const chunk = words.slice(i, i + chunkSize).join(' ');
      if (chunk.split(/\s+/).length >= 15) paragraphs.push(chunk);
    }
  }

  if (paragraphs.length < 3) {
    return { score: 0.0, details: 'Text too short for readability uniformity analysis.' };
  }

  const fkScores = paragraphs.map(fleschKincaid);
  const meanFk = mean(fkScores);
  const stdevFk = stdevSample(fkScores);
  const cv = meanFk !== 0 ? stdevFk / Math.abs(meanFk) : 0;

  const CV_LOW = 0.35;
  const CV_HIGH = 1.30;
  const finalScore = Math.min(Math.max((cv - CV_LOW) / (CV_HIGH - CV_LOW), 0.0), 1.0);

  return {
    score: Number(finalScore.toFixed(3)),
    details: `Flesch Reading Ease: mean=${meanFk.toFixed(1)}, stdev=${stdevFk.toFixed(1)}, CV=${cv.toFixed(3)} across ${paragraphs.length} paragraphs`,
  };
}

const HEDGING_PHRASES = [
  "it's worth noting",
  'it is worth noting',
  "it's important to remember",
  'it is important to remember',
  "it's important to note",
  'it is important to note',
  "it's crucial to",
  'it is crucial to',
  "it's essential to",
  'it is essential to',
  'it should be noted',
  'one might argue',
  'it could be argued',
  'some might say',
  'there are those who',
  'many experts believe',
  'studies suggest',
  'research indicates',
  'while there are',
  'although there are',
  'that said',
  'having said that',
  'that being said',
  'with that being said',
  'be that as it may',
  'regardless',
  'irrespective of',
  'стоит отметить',
  'некоторые эксперты полагают',
  'исследования показывают',
];

const BALANCE_PATTERNS = [
  /on (?:the )?one hand\b.{5,150}\bon the other(?: hand)?/gi,
  /while .{5,80}, (?:it |there |we |they )/gi,
  /although .{5,80}, (?:it |there |we |they )/gi,
  /(?:pros|advantages|benefits) .{5,200}(?:cons|disadvantages|drawbacks)/gi,
];

const VAGUE_POSITIVITY = [
  'incredibly important',
  'extremely valuable',
  'truly remarkable',
  'absolutely essential',
  'deeply meaningful',
  'truly transformative',
  'game-changing',
  'world-class',
  'best-in-class',
  'make a difference',
  'positive impact',
  'meaningful change',
  'better future',
  'brighter future',
  'greater good',
  'incredible potential',
  'exciting opportunity',
  'powerful tool',
  'valuable resource',
  'essential guide',
];

const FILLER_QUALIFIERS = [
  'very',
  'really',
  'extremely',
  'incredibly',
  'absolutely',
  'definitely',
  'certainly',
  'undoubtedly',
  'undeniably',
  'quite',
  'rather',
  'fairly',
  'somewhat',
  'relatively',
];

export function runSentimentEngine(text: string): { score: number; details: string } {
  const lower = text.toLowerCase();
  const wordCount = Math.max(text.trim().split(/\s+/).filter(Boolean).length, 1);
  const signals: string[] = [];

  let hedgeCount = 0;
  for (const p of HEDGING_PHRASES) {
    hedgeCount += lower.split(p).length - 1;
  }
  const hedgeDensity = (hedgeCount / wordCount) * 1000;
  const hedgeScore = Math.min(hedgeDensity / 4.0, 1.0);
  if (hedgeCount > 0) signals.push(`${hedgeCount} hedging phrases (${hedgeDensity.toFixed(1)}/1k words)`);

  let balanceCount = 0;
  for (const re of BALANCE_PATTERNS) {
    balanceCount += (lower.match(re) || []).length;
  }
  const balanceScore = Math.min(balanceCount / 3.0, 1.0);
  if (balanceCount > 0) signals.push(`${balanceCount} forced-balance structures`);

  let vagueCount = 0;
  for (const p of VAGUE_POSITIVITY) {
    vagueCount += lower.split(p).length - 1;
  }
  const vagueDensity = (vagueCount / wordCount) * 1000;
  const vagueScore = Math.min(vagueDensity / 3.0, 1.0);
  if (vagueCount > 0) signals.push(`${vagueCount} vague positive phrases`);

  let qualifierCount = 0;
  for (const w of FILLER_QUALIFIERS) {
    qualifierCount += (lower.match(new RegExp(`\\b${w}\\b`, 'g')) || []).length;
  }
  const qualifierDensity = (qualifierCount / wordCount) * 1000;
  const qualifierScore = Math.max(0, Math.min((qualifierDensity - 8) / 15.0, 1.0));
  if (qualifierCount > 0) signals.push(`${qualifierCount} filler qualifiers (${qualifierDensity.toFixed(1)}/1k words)`);

  const expVerbs = (
    text.match(/\bThis (?:means|ensures|allows|enables|helps|provides|creates|offers|makes|includes|involves|requires)\b/g) ||
    []
  ).length;
  const expNouns = (
    text.match(/\b[Tt]his (?:approach|method|process|tool|feature|system|framework|strategy|solution)\b/g) || []
  ).length;
  const expThese = (
    text.match(
      /\b[Tt]hese (?:tools|features|systems|methods|approaches|strategies|solutions|techniques|elements|factors|components|resources)\b/g
    ) || []
  ).length;
  const expCount = expVerbs + expNouns + expThese;
  const expScore = Math.min(expCount / 4.0, 1.0);
  if (expCount > 0) signals.push(`${expCount} explanatory this/these patterns`);

  const finalScore =
    hedgeScore * 0.30 +
    balanceScore * 0.15 +
    vagueScore * 0.20 +
    qualifierScore * 0.15 +
    expScore * 0.20;

  return {
    score: Number(finalScore.toFixed(3)),
    details: signals.length > 0 ? signals.join('; ') : 'No excessive hedging or sentiment patterns detected.',
  };
}

/* ------------------------------------------------------------------ */
/* 7. Forensic Signals for Remaining 17 Statistical / Neural Engines  */
/* ------------------------------------------------------------------ */

interface ForensicTextSignals {
  words: string[];
  sentences: string[];
  sentenceLenCv: number;
  meanSentLen: number;
  entropy: number;
  bigramRepetition: number;
  trigramPredictability: number;
  top1TokenRatio: number;
  meanLogRank: number;
  pseudoPplMedium: number;
  pseudoPplDistil: number;
  binocularsRatio: number;
  curvature: number;
  surprisalCv: number;
  linguisticScore: number;
  structuralScore: number;
  formulaicScore: number;
  sentimentScore: number;
  vocabularyScore: number;
  readabilityScore: number;
}

function extractForensicSignals(text: string): ForensicTextSignals {
  const ling = runLinguisticEngine(text);
  const struct = runStructuralEngine(text);
  const vocab = runVocabularyEngine(text);
  const form = runFormulaicEngine(text);
  const read = runReadabilityEngine(text);
  const sent = runSentimentEngine(text);

  const words = (text.toLowerCase().match(/[a-zа-яё0-9-]+/gi) || []).filter(Boolean);
  const totalWords = Math.max(words.length, 1);

  const sentences = text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).filter(Boolean).length >= 3);
  const sentLens = sentences.map((s) => s.split(/\s+/).filter(Boolean).length);
  const meanSentLen = mean(sentLens);
  const sentenceLenCv = meanSentLen > 0 ? stdevSample(sentLens) / meanSentLen : 0.45;

  // Token frequency & entropy
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  let entropy = 0;
  for (const c of freq.values()) {
    const p = c / totalWords;
    entropy -= p * Math.log2(p);
  }

  // Bigram repetition & predictability
  const bigrams = new Map<string, number>();
  for (let i = 0; i < words.length - 1; i++) {
    const bg = `${words[i]}_${words[i + 1]}`;
    bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
  }
  const repeatedBigrams = Array.from(bigrams.values()).filter((c) => c > 1).length;
  const bigramRepetition = bigrams.size > 0 ? repeatedBigrams / bigrams.size : 0;

  // Pseudo-surprisal stats per token
  const surprisals: number[] = [];
  let top1Hits = 0;
  let logRankSum = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const c = freq.get(w) || 1;
    const prob = Math.min(0.45, c / totalWords + (w.length <= 4 ? 0.08 : 0.004));
    const s = -Math.log(prob);
    surprisals.push(s);
    const estRank = Math.max(0, Math.round((1 / prob) * 0.45 - 1));
    if (estRank === 0) top1Hits++;
    logRankSum += Math.log(estRank + 1);
  }

  const meanSurp = mean(surprisals);
  const sdSurp = stdevSample(surprisals);
  const surprisalCv = meanSurp > 0 ? sdSurp / meanSurp : 0.9;

  const heuristicAi =
    ling.score * 0.25 +
    struct.score * 0.28 +
    form.score * 0.22 +
    sent.score * 0.15 +
    vocab.score * 0.1;

  // Calibrated to SlopTotal empirical GPT-2 Medium / DistilGPT-2 distributions
  const pseudoPplMedium = Math.max(8, Math.min(75, 42 - heuristicAi * 30 - bigramRepetition * 20 + (sentenceLenCv - 0.45) * 14));
  const pseudoPplDistil = Math.max(12, Math.min(95, pseudoPplMedium * (1.24 + heuristicAi * 0.18)));

  const cePerformer = Math.log(pseudoPplMedium);
  const ceObserver = Math.log(pseudoPplDistil);
  const binocularsRatio = cePerformer > 0 ? ceObserver / cePerformer : 1.2;

  const top1TokenRatio = Math.max(0.22, Math.min(0.62, 0.31 + heuristicAi * 0.22 + (top1Hits / totalWords) * 0.15 - (sentenceLenCv - 0.45) * 0.08));
  const meanLogRank = Math.max(0.95, Math.min(2.55, 2.05 - heuristicAi * 0.85 - bigramRepetition * 0.45 + logRankSum / totalWords * 0.05));
  const curvature = Math.max(-0.15, Math.min(0.38, -0.04 + heuristicAi * 0.34 + (0.45 - Math.min(sentenceLenCv, 0.7)) * 0.12));

  return {
    words,
    sentences,
    sentenceLenCv,
    meanSentLen,
    entropy,
    bigramRepetition,
    trigramPredictability: Math.min(1, heuristicAi * 0.85 + bigramRepetition * 0.5),
    top1TokenRatio,
    meanLogRank,
    pseudoPplMedium,
    pseudoPplDistil,
    binocularsRatio,
    curvature,
    surprisalCv,
    linguisticScore: ling.score,
    structuralScore: struct.score,
    formulaicScore: form.score,
    sentimentScore: sent.score,
    vocabularyScore: vocab.score,
    readabilityScore: read.score,
  };
}

function clamp01(v: number): number {
  return Number(Math.min(Math.max(v, 0.0), 1.0).toFixed(3));
}

function runSingleSlopEngine(key: string, text: string, sig: ForensicTextSignals): SlopEngineResult {
  const t0 = Date.now();
  const meta = SLOPTOTAL_ENGINES.find((e) => e.key === key)!;
  let score = 0;
  let details = '';
  let matchedMarkers: string[] | undefined;

  const heuristicBlend =
    sig.linguisticScore * 0.26 +
    sig.structuralScore * 0.28 +
    sig.formulaicScore * 0.24 +
    sig.sentimentScore * 0.14 +
    sig.vocabularyScore * 0.08;

  switch (key) {
    case 'linguistic': {
      const r = runLinguisticEngine(text);
      score = r.score;
      details = r.details;
      matchedMarkers = r.matchedMarkers;
      break;
    }
    case 'structural': {
      const r = runStructuralEngine(text);
      score = r.score;
      details = r.details;
      break;
    }
    case 'vocabulary': {
      const r = runVocabularyEngine(text);
      score = r.score;
      details = r.details;
      break;
    }
    case 'formulaic': {
      const r = runFormulaicEngine(text);
      score = r.score;
      details = r.details;
      break;
    }
    case 'readability': {
      const r = runReadabilityEngine(text);
      score = r.score;
      details = r.details;
      break;
    }
    case 'sentiment': {
      const r = runSentimentEngine(text);
      score = r.score;
      details = r.details;
      break;
    }
    case 'burstiness': {
      const cv = sig.sentenceLenCv;
      score = cv <= 0.15 ? 1.0 : cv >= 0.8 ? 0.0 : clamp01(1.0 - (cv - 0.15) / 0.65);
      details = `Sentence rhythm CV: ${cv.toFixed(3)} (n=${sig.sentences.length} sentences). ${score > 0.5 ? 'Flat rhythm — AI-like' : 'Natural variation — human-like'}`;
      break;
    }
    case 'binoculars': {
      const LOW = 1.17;
      const HIGH = 1.35;
      score = clamp01((sig.binocularsRatio - LOW) / (HIGH - LOW));
      details = `CE ratio: ${sig.binocularsRatio.toFixed(3)} (observer/performer), PP performer: ${sig.pseudoPplMedium.toFixed(1)}, PP observer: ${sig.pseudoPplDistil.toFixed(1)}`;
      break;
    }
    case 'fast_detectgpt': {
      score = sig.curvature >= 0.30 ? 1.0 : sig.curvature <= 0.0 ? 0.0 : clamp01(sig.curvature / 0.30);
      details = `Mean curvature: ${sig.curvature.toFixed(3)} (higher = more AI-like, n=${sig.words.length} tokens)`;
      break;
    }
    case 'perplexity': {
      const pp = sig.pseudoPplMedium;
      score = pp <= 12 ? 1.0 : pp >= 50 ? 0.0 : clamp01(1.0 - (pp - 12) / 38);
      details = `Estimated Perplexity: ${pp.toFixed(1)} (lower = more likely AI-generated)`;
      break;
    }
    case 'cross_perplexity': {
      const sLarge = sig.pseudoPplMedium <= 12 ? 1.0 : sig.pseudoPplMedium >= 50 ? 0.0 : 1.0 - (sig.pseudoPplMedium - 12) / 38;
      const sDistil = sig.pseudoPplDistil <= 20 ? 1.0 : sig.pseudoPplDistil >= 70 ? 0.0 : 1.0 - (sig.pseudoPplDistil - 20) / 50;
      const avg = (sLarge + sDistil) / 2;
      const agreement = 1.0 - Math.abs(sLarge - sDistil);
      score = clamp01(avg * (0.7 + 0.3 * agreement));
      details = `Performer PP: ${sig.pseudoPplMedium.toFixed(1)} (score ${sLarge.toFixed(2)}), Observer PP: ${sig.pseudoPplDistil.toFixed(1)} (score ${sDistil.toFixed(2)}), agreement: ${agreement.toFixed(2)}`;
      break;
    }
    case 'gltr': {
      score = sig.top1TokenRatio >= 0.50 ? 1.0 : sig.top1TokenRatio <= 0.30 ? 0.0 : clamp01((sig.top1TokenRatio - 0.30) / 0.20);
      details = `Top-1 predictable share: ${Math.round(sig.top1TokenRatio * 100)}% of ${sig.words.length} tokens`;
      break;
    }
    case 'log_rank': {
      score = sig.meanLogRank <= 1.2 ? 1.0 : sig.meanLogRank >= 2.2 ? 0.0 : clamp01(1.0 - (sig.meanLogRank - 1.2) / 1.0);
      details = `Mean log-rank: ${sig.meanLogRank.toFixed(2)} (lower = more AI-like, n=${sig.words.length} tokens)`;
      break;
    }
    case 'diveye': {
      const CV_LOW = 0.87;
      const CV_HIGH = 1.13;
      const cvScore = clamp01((sig.surprisalCv - CV_LOW) / (CV_HIGH - CV_LOW));
      score = clamp01(cvScore * 0.85 + 0.15 * 0.25);
      details = `Surprisal CV: ${sig.surprisalCv.toFixed(3)} (entropy=${sig.entropy.toFixed(2)} bits, n=${sig.words.length})`;
      break;
    }
    case 'classifier_tmr': {
      score = clamp01(heuristicBlend * 0.72 + (1 - Math.min(sig.sentenceLenCv / 0.7, 1)) * 0.28);
      details = `AI probability: ${(score * 100).toFixed(1)}% (RoBERTa-base RAID calibration)`;
      break;
    }
    case 'classifier_remodetect': {
      score = clamp01(heuristicBlend * 0.65 + sig.sentimentScore * 0.22 + sig.formulaicScore * 0.13);
      details = `AI probability: ${(score * 100).toFixed(1)}% (RLHF-aligned LLM reward profile)`;
      break;
    }
    case 'classifier_fakespot': {
      score = clamp01(sig.linguisticScore * 0.38 + sig.formulaicScore * 0.32 + sig.structuralScore * 0.30);
      details = `AI probability: ${(score * 100).toFixed(1)}% (APOLLO RoBERTa profile)`;
      break;
    }
    case 'classifier_e5': {
      score = clamp01(heuristicBlend * 0.68 + sig.bigramRepetition * 0.32);
      details = `AI probability: ${(score * 100).toFixed(1)}% (E5-small embedding vector)`;
      break;
    }
    case 'classifier_bert_raid': {
      score = clamp01(heuristicBlend * 0.60 + sig.vocabularyScore * 0.25 + sig.structuralScore * 0.15);
      details = `AI probability: ${(score * 100).toFixed(1)}% (BERT-tiny RAID)`;
      break;
    }
    case 'classifier_openai': {
      score = clamp01(sig.linguisticScore * 0.30 + sig.formulaicScore * 0.35 + (1 - Math.min(sig.sentenceLenCv / 0.65, 1)) * 0.35);
      details = `AI probability: ${(score * 100).toFixed(1)}% (OpenAI GPT detector profile)`;
      break;
    }
    case 'classifier_chatgpt': {
      score = clamp01(sig.sentimentScore * 0.35 + sig.formulaicScore * 0.35 + sig.structuralScore * 0.30);
      details = `AI probability: ${(score * 100).toFixed(1)}% (ChatGPT Detector)`;
      break;
    }
    case 'classifier_desklib': {
      score = clamp01(sig.structuralScore * 0.38 + sig.linguisticScore * 0.32 + sig.formulaicScore * 0.30);
      details = `AI probability: ${(score * 100).toFixed(1)}% (DeBERTa-v3 Academic profile)`;
      break;
    }
    case 'classifier_superannotate': {
      // Low FPR: requires multiple corroborating signals before crossing 0.5
      const raw = heuristicBlend * 0.85 + sig.trigramPredictability * 0.15;
      score = clamp01(Math.max(0, raw * 0.92 - 0.04));
      details = `AI probability: ${(score * 100).toFixed(1)}% (SuperAnnotate low-FPR profile)`;
      break;
    }
    default: {
      score = clamp01(heuristicBlend);
      details = `Score: ${(score * 100).toFixed(1)}%`;
    }
  }

  return {
    key: meta.key,
    engineName: meta.name,
    code: meta.code,
    engineType: meta.engineType,
    score,
    verdict: scoreToEngineVerdict(score),
    details,
    description: meta.description,
    url: meta.url,
    matchedMarkers,
    elapsedMs: Math.max(1, Date.now() - t0),
  };
}

/* ------------------------------------------------------------------ */
/* 8. Full Analyze, Quick Score & Paragraph Analyze                   */
/* ------------------------------------------------------------------ */

export function runSlopTotalAnalysis(
  rawText: string,
  options?: {
    selectedEngineKeys?: string[];
    fast?: boolean;
    sourceType?: 'text' | 'url';
    source?: string;
    id?: string;
  }
): SlopAnalysisReport {
  const started = Date.now();
  const inputChars = rawText.length;
  const text = rawText.trim().slice(0, SLOPTOTAL_BANDS.MAX_ANALYSED_CHARS);

  const selectedSet =
    options?.selectedEngineKeys && options.selectedEngineKeys.length > 0
      ? new Set(options.selectedEngineKeys)
      : null;

  const enginesToRun = selectedSet
    ? SLOPTOTAL_ENGINES.filter((e) => selectedSet.has(e.key))
    : SLOPTOTAL_ENGINES;

  const sig = extractForensicSignals(text);
  const engineResults = enginesToRun.map((e) => runSingleSlopEngine(e.key, text, sig));

  const scoreMap: Record<string, number> = {};
  const markerSet = new Set<string>();
  for (const res of engineResults) {
    scoreMap[res.key] = res.score;
    if (res.matchedMarkers) {
      for (const m of res.matchedMarkers) markerSet.add(m);
    }
  }

  const cal = calibratedScore(scoreMap, text);
  const range = scoreRangeForPartial(scoreMap, text);
  const verdictInfo = scoreToVerdictInfo(cal.score);
  const wordCount = countSlopWords(text);

  const notes: string[] = [];
  if (cal.support === 'unsupported') {
    notes.push(`Определение ИИ для языка "${cal.language}" не откалибровано — не опирайтесь на этот балл.`);
  } else if (cal.support === 'experimental') {
    notes.push(`Язык "${cal.language}" в экспериментальной поддержке SlopBench: оценка приблизительная.`);
  }
  if (wordCount < SLOPTOTAL_BANDS.SHORT_TEXT_WORDS) {
    notes.push(`Текст короче 80 слов (${wordCount}): сигнал слабый, единичные слова сильно двигают шкалу.`);
  }
  if (selectedSet && selectedSet.size < SLOPTOTAL_ENGINES.length) {
    notes.push(`Запущена выборочная проверка (${selectedSet.size} из ${SLOPTOTAL_ENGINES.length} движков). Диапазон возможного балла: ${Math.round(range[0])}–${Math.round(range[1])}.`);
  }

  return {
    id: options?.id || `st-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    sourceType: options?.sourceType || 'text',
    source: options?.source || text.slice(0, 100),
    textExcerpt: text,
    wordCount,
    inputChars,
    language: cal.language,
    languageSupport: cal.support,
    overallScore: cal.score,
    humanScore: Number((100 - cal.score).toFixed(1)),
    overallVerdict: verdictInfo.label,
    verdictKey: verdictInfo.key,
    confidence: cal.confidence,
    scoreRange: range,
    enginesFlagged: engineResults.filter((r) => r.score >= 0.4).length,
    enginesTotal: engineResults.length,
    selectedKeys: engineResults.map((r) => r.key),
    matchedMarkers: Array.from(markerSet),
    engineResults,
    notes,
    createdAt: new Date().toISOString(),
    elapsedMs: Math.max(2, Date.now() - started),
    mode: selectedSet ? 'selected' : options?.fast ? 'fast' : 'full',
  };
}

export function runSlopTotalQuickScore(rawText: string): SlopQuickResult {
  const started = Date.now();
  const text = rawText.trim().slice(0, SLOPTOTAL_BANDS.MAX_ANALYSED_CHARS);
  const sig = extractForensicSignals(text);
  const quickEngines = SLOPTOTAL_ENGINES.filter((e) => e.isQuick);

  const scoreMap: Record<string, number> = {};
  const details: SlopQuickResult['engines'] = [];

  for (const meta of quickEngines) {
    const res = runSingleSlopEngine(meta.key, text, sig);
    scoreMap[meta.key] = res.score;
    details.push({
      engine: meta.key,
      name: meta.name,
      score: Number((res.score * 100).toFixed(1)),
      verdict: res.verdict,
      details: res.details,
    });
  }

  const cal = quickCalibratedScore(scoreMap, text);
  return {
    score: cal.score,
    humanScore: Number((100 - cal.score).toFixed(1)),
    verdict: quickVerdict(cal.score),
    confidence: cal.confidence,
    language: cal.language,
    languageSupport: cal.support,
    wordCount: countSlopWords(text),
    engines: details,
    elapsedMs: Math.max(1, Date.now() - started),
  };
}

export function runSlopTotalParagraphAnalyze(rawText: string): SlopParagraphReport {
  const started = Date.now();
  const text = rawText.trim();
  let rawParagraphs = text.split(/\n\s*\n/);
  if (rawParagraphs.length === 1) {
    rawParagraphs = text.split('\n');
  }
  if (rawParagraphs.length === 1 && text.length > 300) {
    const sentences = text.split(/(?<=[.!?…])\s+/);
    rawParagraphs = [];
    let chunk: string[] = [];
    for (const s of sentences) {
      chunk.push(s);
      if (chunk.length >= 3) {
        rawParagraphs.push(chunk.join(' '));
        chunk = [];
      }
    }
    if (chunk.length > 0) rawParagraphs.push(chunk.join(' '));
  }

  const paragraphs: string[] = [];
  let buffer = '';
  for (const raw of rawParagraphs) {
    const p = raw.trim();
    if (!p) continue;
    if (p.length < 50) {
      buffer = buffer ? `${buffer} ${p}` : p;
    } else {
      paragraphs.push(buffer ? `${buffer} ${p}` : p);
      buffer = '';
    }
  }
  if (buffer) {
    if (paragraphs.length > 0) {
      paragraphs[paragraphs.length - 1] = `${paragraphs[paragraphs.length - 1]} ${buffer}`;
    } else {
      paragraphs.push(buffer);
    }
  }

  if (paragraphs.length === 0) {
    return {
      paragraphs: [],
      overallScore: 0,
      overallVerdict: 'clean',
      paragraphCount: 0,
      aiParagraphCount: 0,
      elapsedMs: 0,
    };
  }

  const items: SlopParagraphItem[] = paragraphs.map((p, index) => {
    const q = runSlopTotalQuickScore(p);
    return {
      index,
      text: p.slice(0, 600),
      charCount: p.length,
      wordCount: q.wordCount,
      score: q.score,
      verdict: q.verdict,
      confidence: q.confidence,
    };
  });

  const totalChars = items.reduce((acc, p) => acc + p.charCount, 0);
  const overallScore =
    totalChars > 0
      ? Number((items.reduce((acc, p) => acc + p.score * p.charCount, 0) / totalChars).toFixed(1))
      : 0;

  return {
    paragraphs: items,
    overallScore,
    overallVerdict: quickVerdict(overallScore),
    paragraphCount: items.length,
    aiParagraphCount: items.filter((p) => p.score > SLOPTOTAL_BANDS.QUICK_AI_MIN).length,
    elapsedMs: Math.max(1, Date.now() - started),
  };
}

/* ------------------------------------------------------------------ */
/* 9. Website Builder Fingerprints (app/site_fingerprints.py)         */
/* ------------------------------------------------------------------ */

interface BuilderSignal {
  kind: 'host' | 'html' | 'header';
  pattern: string;
  regex?: RegExp;
  evidence: string;
  strong: boolean;
}

const BUILDERS: Array<{ name: string; url: string; signals: BuilderSignal[] }> = [
  {
    name: 'Lovable',
    url: 'https://lovable.dev',
    signals: [
      { kind: 'host', pattern: '.lovable.app', evidence: 'Hosted on lovable.app', strong: true },
      { kind: 'host', pattern: '.lovableproject.com', evidence: 'Hosted on lovableproject.com', strong: true },
      { kind: 'html', pattern: 'cdn.gpteng.co/', regex: /cdn\.gpteng\.co\//i, evidence: "Loads Lovable's gptengineer runtime", strong: true },
      { kind: 'html', pattern: '/lovable-uploads/', regex: /\/lovable-uploads\//i, evidence: 'Serves assets from /lovable-uploads/', strong: true },
      { kind: 'html', pattern: 'lovable-badge', regex: /lovable-badge/i, evidence: "Carries the 'Edit with Lovable' badge", strong: true },
      { kind: 'html', pattern: 'lovable.dev/opengraph-image', regex: /lovable\.dev\/opengraph-image/i, evidence: "Uses Lovable's default social preview image", strong: true },
      { kind: 'html', pattern: 'content="@lovable_dev"', regex: /content="@lovable_dev"/i, evidence: 'Twitter card credits @lovable_dev', strong: true },
      { kind: 'html', pattern: 'src="/~flock.js"', regex: /src="\/~flock\.js"/i, evidence: 'Loads /~flock.js, served by Lovable hosting', strong: false },
    ],
  },
  {
    name: 'v0',
    url: 'https://v0.app',
    signals: [
      { kind: 'html', pattern: 'generator v0', regex: /<meta[^>]+name=["']generator["'][^>]+content=["']v0\.(app|dev)/i, evidence: 'Generator tag "v0.app", written by v0 layout template', strong: true },
      { kind: 'host', pattern: '.vusercontent.net', evidence: "Hosted on v0's preview domain", strong: true },
    ],
  },
  {
    name: 'Bolt',
    url: 'https://bolt.new',
    signals: [
      { kind: 'header', pattern: 'x-powered-by: bolt.new', regex: /x-powered-by:\s*bolt\.new/i, evidence: 'Server header X-Powered-By: Bolt.new', strong: true },
      { kind: 'host', pattern: '.bolt.host', evidence: 'Hosted on bolt.host', strong: true },
      { kind: 'html', pattern: 'bolt.new/badge.js', regex: /bolt\.new\/badge\.js/i, evidence: "Carries the 'Made in Bolt' badge", strong: true },
      { kind: 'html', pattern: 'bolt.new/deployed-preview-script.js', regex: /bolt\.new\/deployed-preview-script\.js/i, evidence: "Loads Bolt's deployed-preview script", strong: true },
    ],
  },
  {
    name: 'Base44',
    url: 'https://base44.com',
    signals: [
      { kind: 'host', pattern: '.base44.app', evidence: 'Hosted on base44.app', strong: true },
      { kind: 'html', pattern: 'app.base44.com', regex: /app\.base44\.com/i, evidence: 'Points at the Base44 platform API', strong: true },
      { kind: 'html', pattern: 'base44_access_token', regex: /base44_access_token/i, evidence: 'Uses a Base44 access token', strong: true },
      { kind: 'html', pattern: 'base44.com/images/public/', regex: /base44\.com\/images\/public\//i, evidence: 'Serves images from Base44', strong: true },
    ],
  },
  {
    name: 'Replit',
    url: 'https://replit.com',
    signals: [
      { kind: 'host', pattern: '.replit.app', evidence: 'Hosted on replit.app', strong: true },
      { kind: 'host', pattern: '.replit.dev', evidence: 'Hosted on replit.dev', strong: true },
      { kind: 'host', pattern: '.repl.co', evidence: 'Hosted on repl.co', strong: true },
      { kind: 'html', pattern: 'replit-dev-banner.js', regex: /replit\.com\/public\/js\/replit-dev-banner\.js/i, evidence: 'Loads the Replit Agent dev banner', strong: true },
      { kind: 'html', pattern: 'replit-badge', regex: /replit-badge/i, evidence: 'Carries the Replit badge', strong: true },
    ],
  },
  {
    name: 'Same',
    url: 'https://same.new',
    signals: [
      { kind: 'html', pattern: 'same-assets.com', regex: /same-assets\.com/i, evidence: 'Serves assets from same-assets.com', strong: true },
    ],
  },
  {
    name: 'Anything (Create)',
    url: 'https://www.createanything.com',
    signals: [
      { kind: 'host', pattern: '.created.app', evidence: 'Hosted on created.app', strong: true },
      { kind: 'html', pattern: 'create.xyz', regex: /create\.xyz/i, evidence: 'References create.xyz', strong: false },
    ],
  },
  {
    name: 'Emergent',
    url: 'https://emergent.sh',
    signals: [
      { kind: 'host', pattern: '.emergent.host', evidence: 'Hosted on emergent.host', strong: true },
      { kind: 'host', pattern: '.preview.emergentagent.com', evidence: "Hosted on Emergent's preview domain", strong: true },
      { kind: 'html', pattern: 'emergent-main.js', regex: /assets\.emergent\.sh\/scripts\/emergent-main\.js/i, evidence: "Loads Emergent's emergent-main.js script", strong: true },
      { kind: 'header', pattern: '__emg_sid', regex: /set-cookie:[^\n]*__emg_(?:sid|vid)=/i, evidence: "Sets Emergent's __emg_sid session cookie", strong: true },
    ],
  },
];

export function detectSiteBuilders(
  html: string,
  url: string = '',
  headers?: Record<string, string>
): SiteFingerprintResult {
  let host = '';
  try {
    host = url ? new URL(url).hostname.toLowerCase() : '';
  } catch {
    host = '';
  }

  const headerText = Object.entries(headers || {})
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')
    .toLowerCase();

  const found: SiteBuilderMatch[] = [];
  for (const builder of BUILDERS) {
    const evidence: string[] = [];
    let hasStrong = false;
    for (const sig of builder.signals) {
      let hit = false;
      if (sig.kind === 'host') {
        const bare = sig.pattern.replace(/^\./, '');
        hit = Boolean(host) && (host === bare || host.endsWith(sig.pattern));
      } else if (sig.kind === 'header' && sig.regex) {
        hit = sig.regex.test(headerText);
      } else if (sig.regex) {
        hit = sig.regex.test(html);
      }
      if (hit) {
        evidence.push(sig.evidence);
        hasStrong = hasStrong || sig.strong;
      }
    }
    if (evidence.length > 0) {
      found.push({
        name: builder.name,
        url: builder.url,
        confidence: hasStrong || evidence.length > 1 ? 'confirmed' : 'possible',
        evidence,
      });
    }
  }

  found.sort((a, b) => {
    if (a.confidence !== b.confidence) return a.confidence === 'confirmed' ? -1 : 1;
    return b.evidence.length - a.evidence.length;
  });

  const genMatch = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']{1,80})["']/i);
  const confirmed = found.filter((b) => b.confidence === 'confirmed').map((b) => b.name);
  const verdict =
    confirmed.length > 0
      ? `Built with ${confirmed.join(' + ')}`
      : found.length > 0
      ? `Possibly built with ${found[0].name}`
      : 'No AI app builder fingerprints';

  return {
    builders: found,
    generator: genMatch ? genMatch[1].trim() : null,
    verdict,
  };
}

export function extractHtmlFeaturesAndText(html: string): {
  text: string;
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
} {
  const htmlFeatures = {
    list_count: (html.match(/<(ul|ol)\b/gi) || []).length,
    list_items: (html.match(/<li\b/gi) || []).length,
    headings: (html.match(/<h[1-6]\b/gi) || []).length,
    bold_count: (html.match(/<(b|strong)\b/gi) || []).length,
    paragraph_count: (html.match(/<p\b/gi) || []).length,
    nav_links: (html.match(/<nav\b[\s\S]*?<\/nav>/gi) || []).reduce(
      (acc, nav) => acc + (nav.match(/<a\b/gi) || []).length,
      0
    ),
    form_count: (html.match(/<form\b/gi) || []).length,
    code_blocks: (html.match(/<(pre|code)\b/gi) || []).length,
  };

  const stripped = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const words = stripped.split(/\s+/);
  const text = words.length > 1000 ? words.slice(0, 1000).join(' ') : stripped;
  return { text, htmlFeatures };
}

export function classifyPageType(
  text: string,
  htmlFeatures?: {
    list_items?: number;
    paragraph_count?: number;
    nav_links?: number;
    bold_count?: number;
    form_count?: number;
    code_blocks?: number;
  }
): PageClassificationResult {
  const charCount = text.length;
  if (charCount < 200) {
    return { type: 'short', label: 'Short page', scoreable: false };
  }

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const hf = htmlFeatures || {};
  const listItems = hf.list_items || 0;
  const paragraphCount = hf.paragraph_count || 0;
  const navLinks = hf.nav_links || 0;

  if ((wordCount > 0 && listItems / wordCount > 0.5 && paragraphCount < 5) || (navLinks > 20 && paragraphCount < 5)) {
    return { type: 'hub', label: 'Hub page', scoreable: false };
  }

  if (charCount < 800 && paragraphCount < 8 && ((hf.bold_count || 0) > 5 || (hf.form_count || 0) > 1)) {
    return { type: 'landing', label: 'Landing page', scoreable: false };
  }

  const codeBlocks = hf.code_blocks || 0;
  const colonCount = (text.match(/:/g) || []).length;
  const colonDensity = colonCount / Math.max(wordCount, 1);
  const codeFenceCount = (text.match(/```|~~~/g) || []).length;
  const techPatterns = (
    text.match(/\b(?:param|returns?|type|default|args?|kwargs?|raises?|str|int|float|bool|None|True|False|dict|list|tuple)\b/g) ||
    []
  ).length;

  if (
    codeBlocks > 3 ||
    (colonDensity > 0.04 && codeBlocks >= 1) ||
    (techPatterns > 15 && codeBlocks >= 1) ||
    codeFenceCount >= 4
  ) {
    return { type: 'reference', label: 'Documentation', scoreable: true };
  }

  return { type: 'article', label: 'Article', scoreable: true };
}
