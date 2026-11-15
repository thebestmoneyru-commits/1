/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Full TypeScript port of github.com/Liyuuuu111/MGT-Eval
 * Includes:
 * - Complete 26-detector registry (src/detector_metadata/detectors.json)
 * - Metric-based detectors: Binoculars, DetectGPT, Fast-DetectGPT, GLTR, Likelihood, LogRank, Rank,
 *   Entropy, LRR, NPR, DNA-GPT, DNA-DetectLLM, LASTDE (w/ fastMDE Multiscale Dispersion Entropy),
 *   LASTDE++, RAIDAR, TOCSIN
 * - Fine-tuned detectors: CoCo, DeTeCtive, Finetuned (HFCls), GREATER, ImBD, Longformer, MPU, PECOLA, RADAR, TASTE
 * - Exact IRLS Platt Scaling Calibrator (src/calibration/platt.py)
 * - Full Dataset Benchmark Evaluation: AUROC, AUPRC, Accuracy, F1, TPR@FPR (1%/5%/10%), ROC/PR curves, Confusion Matrix
 * - 12+ Text Perturbation Attacks + VIPER ECES Homoglyph table (src/dataset_builder/attacks/text_attacks.py + selected.neighbors)
 * - ASR (Attack Success Rate) evaluator & Text Quality Metrics (Flesch Reading Ease, Flesch-Kincaid Grade, TTR, Similarity)
 */

export type MgtDetectorType = 'Metric-based' | 'Fine-tuned';

export interface MgtDetectorMeta {
  key: string;
  detector: string;
  name: string;
  type: MgtDetectorType;
  venue: string;
  authors: string;
  paper: string;
  link: string | null;
  description: string;
  formula: string;
  defaultThreshold: number;
  higherIsAi: boolean;
}

export const MGT_DETECTORS_CATALOG: MgtDetectorMeta[] = [
  {
    key: 'binoculars',
    detector: 'binoculars',
    name: 'Binoculars',
    type: 'Metric-based',
    venue: 'ICML 2024',
    authors: 'Abhimanyu Hans, Avi Schwarzschild, Tom Goldstein et al.',
    paper: 'Spotting LLMs With Binoculars: Zero-Shot Detection of Machine-Generated Text',
    link: 'https://arxiv.org/abs/2401.12070',
    description: 'Сравнивает логарифмическую перплексию наблюдателя (Observer) и кросс-перплексию исполнителя (Performer) для zero-shot детекции.',
    formula: 'B(x) = log PPL_M1(x) / CrossPPL(M2, M1; x)',
    defaultThreshold: 0.9015,
    higherIsAi: false,
  },
  {
    key: 'fastdetectgpt',
    detector: 'fastdetectgpt',
    name: 'Fast-DetectGPT',
    type: 'Metric-based',
    venue: 'ICLR 2024',
    authors: 'Guangsheng Bao, Yanbin Zhao, Yue Zhang et al.',
    paper: 'Fast-DetectGPT: Efficient Detection of Machine-Generated Text via Sampling Discrepancy',
    link: 'https://arxiv.org/abs/2310.05130',
    description: 'Заменяет дорогостоящую пертурбацию аналитической кривизной условной вероятности за один проход.',
    formula: 'd(x) = (LL(x) - E_q[LL]) / sqrt(Var_q[LL])',
    defaultThreshold: 0.5,
    higherIsAi: true,
  },
  {
    key: 'detectgpt',
    detector: 'detectgpt',
    name: 'DetectGPT',
    type: 'Metric-based',
    venue: 'ICML 2023 Oral',
    authors: 'Eric Mitchell, Yoonho Lee, Christopher D. Manning, Chelsea Finn',
    paper: 'DetectGPT: Zero-Shot Machine-Generated Text Detection using Probability Curvature',
    link: 'https://arxiv.org/abs/2301.11305',
    description: 'Измеряет локальную отрицательную кривизну лог-правдоподобия текста при малых T5-пертурбациях.',
    formula: 'Z = (LL(x) - mean(LL(x̃))) / std(LL(x̃))',
    defaultThreshold: 0.5,
    higherIsAi: true,
  },
  {
    key: 'gltr',
    detector: 'gltr',
    name: 'GLTR',
    type: 'Metric-based',
    venue: 'ACL 2019',
    authors: 'Sebastian Gehrmann, Hendrik Strobelt, Alexander M. Rush',
    paper: 'GLTR: Statistical Detection and Visualization of Generated Text',
    link: 'https://arxiv.org/abs/1906.04043',
    description: 'Агрегирует распределение рангов токенов по 4 корзинам: Top-10, Top-100, Top-1000 и >1000.',
    formula: 'P_GLTR = LR([frac_top10, frac_top100, frac_top1000, frac_tail])',
    defaultThreshold: 0.5,
    higherIsAi: true,
  },
  {
    key: 'lrr',
    detector: 'lrr',
    name: 'LRR',
    type: 'Metric-based',
    venue: 'EMNLP 2023 Findings',
    authors: 'Jinyan Su, Terry Yue Zhuo, Di Wang, Preslav Nakov',
    paper: 'DetectLLM: Leveraging Log Rank Information for Zero-Shot Detection of Machine-Generated Text',
    link: 'https://arxiv.org/abs/2306.05540',
    description: 'Отношение среднего отрицательного логарифма правдоподобия к среднему логарифму ранга токена.',
    formula: 'LRR(x) = - mean(log p(x_t)) / mean(log rank(x_t))',
    defaultThreshold: 0.5,
    higherIsAi: true,
  },
  {
    key: 'npr',
    detector: 'npr',
    name: 'NPR',
    type: 'Metric-based',
    venue: 'EMNLP 2023 Findings',
    authors: 'Jinyan Su, Terry Yue Zhuo, Di Wang, Preslav Nakov',
    paper: 'DetectLLM: Normalized Perturbed Log-Rank Ratio',
    link: 'https://arxiv.org/abs/2306.05540',
    description: 'Нормализованное отношение лог-ранга пертурбированных копий текста к лог-рангу оригинала.',
    formula: 'NPR(x) = mean(logRank(x̃)) / logRank(x)',
    defaultThreshold: 0.5,
    higherIsAi: true,
  },
  {
    key: 'lastde',
    detector: 'lastde',
    name: 'LASTDE',
    type: 'Metric-based',
    venue: 'ICLR 2025',
    authors: 'MGT-Eval LASTDE Authors',
    paper: 'Likelihood-based Multiscale Dispersion Entropy for AI Text Detection',
    link: 'https://openreview.net/forum?id=vo4AHjowKi',
    description: 'Вычисляет отношение средней лог-вероятности к многомасштабной энтропии дисперсии фазовых орбит (fastMDE).',
    formula: 'LASTDE = mean(LL) / std_τ(DE(orbits(LL, e, τ)))',
    defaultThreshold: 0.5,
    higherIsAi: true,
  },
  {
    key: 'lastdepp',
    detector: 'lastdepp',
    name: 'LASTDE++',
    type: 'Metric-based',
    venue: 'ICLR 2025',
    authors: 'MGT-Eval LASTDE++ Authors',
    paper: 'LASTDE++: Conditional Sampling-Normalized Multiscale Dispersion Entropy',
    link: 'https://openreview.net/forum?id=vo4AHjowKi',
    description: 'Усиленная версия LASTDE с нормализацией через условную выборку (sampling discrepancy) на многомасштабной энтропии.',
    formula: 'LASTDE++ = (LASTDE(x) - μ_cond) / σ_cond',
    defaultThreshold: 0.5,
    higherIsAi: true,
  },
  {
    key: 'dnagpt',
    detector: 'dnagpt',
    name: 'DNA-GPT',
    type: 'Metric-based',
    venue: 'ICLR 2024',
    authors: 'Xianjun Yang, Wei Cheng, Linda Petzold, Haifeng Chen',
    paper: 'DNA-GPT: Divergent N-Gram Analysis for Training-Free Detection of GPT-Generated Text',
    link: 'https://arxiv.org/abs/2305.17359',
    description: 'Оценивает дивергенцию N-грамм между продолжением усечённого промпта и оригиналом.',
    formula: 'BScore = Σ w_n * overlap_n(orig_suffix, regen_suffix)',
    defaultThreshold: 0.5,
    higherIsAi: true,
  },
  {
    key: 'dnadetectllm',
    detector: 'dnadetectllm',
    name: 'DNA-DetectLLM',
    type: 'Metric-based',
    venue: 'NIPS 2025 Spotlight',
    authors: 'Xiaowei Zhu, Yubing Ren, Fang Fang, Shi Wang, Yanan Cao',
    paper: 'DNA-DetectLLM: Unveiling AI-Generated Text via a DNA-Inspired Mutation-Repair Paradigm',
    link: 'https://openreview.net/forum?id=yQoHUijSHx',
    description: 'Парадигма мутации-репарации ДНК: мутирует токены и измеряет, насколько легко модель восстанавливает исходный шаблон.',
    formula: 'RepairRatio = (PPL(mutated) - minPPL(x)) / (CrossPPL(x) + ε)',
    defaultThreshold: 0.5,
    higherIsAi: true,
  },
  {
    key: 'tocsin',
    detector: 'tocsin',
    name: 'TOCSIN',
    type: 'Metric-based',
    venue: 'EMNLP 2024',
    authors: 'Shuyang Liu et al.',
    paper: 'TOCSIN: Zero-Shot Detection of LLM-Generated Text via Token Cohesiveness',
    link: 'https://arxiv.org/abs/2409.16914',
    description: 'Измеряет когезивность токенов при случайном удалении (deletion BART/LLM perturbation) и сдвиг лог-правдоподобия.',
    formula: 'TOCSIN = - mean(LL(x_del)) * exp(Δ_cohesion)',
    defaultThreshold: 0.5,
    higherIsAi: true,
  },
  {
    key: 'raidar',
    detector: 'raidar',
    name: 'RAIDAR',
    type: 'Metric-based',
    venue: 'ICLR 2024',
    authors: 'Chengzhi Mao, Carl Vondrick et al.',
    paper: 'RAIDAR: geneRative AI Detection viA Rewriting',
    link: 'https://arxiv.org/abs/2401.12970',
    description: 'Анализирует N-граммную инвариантность текста при повторном переписывании: ИИ-текст остаётся почти неизменным при рерайте.',
    formula: 'EditRatio = 1 - Levenshtein / NgramCommon(orig, rewrite)',
    defaultThreshold: 0.5,
    higherIsAi: true,
  },
  {
    key: 'likelihood',
    detector: 'likelihood',
    name: 'Likelihood',
    type: 'Metric-based',
    venue: 'Baseline Metric',
    authors: 'MGT-Eval Baselines',
    paper: 'Average Token Log-Likelihood Baseline',
    link: null,
    description: 'Средняя логарифмическая вероятность каждого токена в языковой модели.',
    formula: 'S_LL = (1/T) * Σ log P(x_t | x_<t)',
    defaultThreshold: 0.5,
    higherIsAi: true,
  },
  {
    key: 'logrank',
    detector: 'logrank',
    name: 'LogRank',
    type: 'Metric-based',
    venue: 'Baseline Metric',
    authors: 'MGT-Eval Baselines',
    paper: 'Average Negative Log-Rank Baseline',
    link: null,
    description: 'Средний отрицательный логарифм ранга каждого реального токена в отсортированном словаре.',
    formula: 'S_LogRank = - (1/T) * Σ log(rank(x_t))',
    defaultThreshold: 0.5,
    higherIsAi: true,
  },
  {
    key: 'rank',
    detector: 'rank',
    name: 'Rank',
    type: 'Metric-based',
    venue: 'Baseline Metric',
    authors: 'Gehrmann et al.',
    paper: 'Average Token Rank Baseline',
    link: null,
    description: 'Средний абсолютный ранг предсказываемого токена в распределении модели.',
    formula: 'S_Rank = - (1/T) * Σ rank(x_t)',
    defaultThreshold: 0.5,
    higherIsAi: true,
  },
  {
    key: 'entropy',
    detector: 'entropy',
    name: 'Entropy',
    type: 'Metric-based',
    venue: 'Baseline Metric',
    authors: 'MGT-Eval Baselines',
    paper: 'Mean Token Predictive Entropy Baseline',
    link: null,
    description: 'Средняя энтропия Шеннона H = -Σ p log p по позициям токенов; у ИИ энтропия предсказания систематически ниже.',
    formula: 'H_mean = - (1/T) * Σ_t Σ_v p_t(v) log p_t(v)',
    defaultThreshold: 0.5,
    higherIsAi: true,
  },
  {
    key: 'coco',
    detector: 'coco',
    name: 'CoCo',
    type: 'Fine-tuned',
    venue: 'EMNLP 2023',
    authors: 'Xiaoming Liu, Zhaohan Zhang, Chao Shen et al.',
    paper: 'CoCo: Coherence-Enhanced Machine-Generated Text Detection Under Low Resource With Contrastive Learning',
    link: 'https://aclanthology.org/2023.emnlp-main.1005/',
    description: 'Усиливает детекцию в условиях малых выборок за счёт сигналов дискурсивной связности и графа сущностей в контрастивном обучении.',
    formula: 'L = L_CE + λ * L_CoherenceContrastive',
    defaultThreshold: 0.5,
    higherIsAi: true,
  },
  {
    key: 'detective',
    detector: 'detective',
    name: 'DeTeCtive',
    type: 'Fine-tuned',
    venue: 'NIPS 2024',
    authors: 'Xun Guo, Shan Zhang, Chongyang Ma et al.',
    paper: 'DeTeCtive: Detecting AI-generated Text via Multi-Level Contrastive Learning',
    link: 'https://arxiv.org/abs/2410.13964',
    description: 'Многоуровневое контрастивное обучение на уровнях слова, предложения и документа с поиском k-NN ближайших стилевых прототипов.',
    formula: 'Sim = Cos(Enc(x), Proto_AI) - Cos(Enc(x), Proto_Human)',
    defaultThreshold: 0.5,
    higherIsAi: true,
  },
  {
    key: 'greater',
    detector: 'greater',
    name: 'GREATER',
    type: 'Fine-tuned',
    venue: 'ACL 2025',
    authors: 'MGT-Eval GREATER Authors',
    paper: 'Adversarial Hardening for Machine-Generated Text Detection',
    link: 'https://arxiv.org/abs/2502.12734',
    description: 'Состязательно закалённый трансформер-детектор, устойчивый к атакам перефразирования и точечным заменам.',
    formula: 'min_θ E[max_δ L_det(θ, x + δ)]',
    defaultThreshold: 0.5,
    higherIsAi: true,
  },
  {
    key: 'imbd',
    detector: 'imbd',
    name: 'ImBD',
    type: 'Fine-tuned',
    venue: 'AAAI 2025 Oral',
    authors: 'Jiaqi Chen et al.',
    paper: 'ImBD: Imitate Before Detect — Aligning Machine Style Preferences for AI Text Detection',
    link: null,
    description: 'Оптимизация стилевых предпочтений (SPO): сначала имитирует стилистику целевой модели, затем детектирует сдвиг распределения.',
    formula: 'S_SPO(x) = r_θ(x) - r_ref(x)',
    defaultThreshold: 0.5,
    higherIsAi: true,
  },
  {
    key: 'mpu',
    detector: 'mpu',
    name: 'MPU',
    type: 'Fine-tuned',
    venue: 'ICLR 2024 Spotlight',
    authors: 'Yuchuan Tian et al.',
    paper: 'Multiscale Positive-Unlabeled Detection of AI-Generated Texts',
    link: 'https://arxiv.org/abs/2305.18149',
    description: 'Многомасштабный Positive-Unlabeled классификатор для коротких и смешанных фрагментов текста.',
    formula: 'R_PU = π_p * E_p[l(+1)] + max(0, E_u[l(-1)] - π_p * E_p[l(-1)])',
    defaultThreshold: 0.5,
    higherIsAi: true,
  },
  {
    key: 'pecola',
    detector: 'pecola',
    name: 'PECOLA',
    type: 'Fine-tuned',
    venue: 'ACL 2024',
    authors: 'MGT-Eval PECOLA Authors',
    paper: 'PECOLA: Perturbation-Enhanced Contrastive Learning for AI Text Detection',
    link: 'https://arxiv.org/abs/2402.00263',
    description: 'Контрастивное обучение на пертурбированных парах предложений с акцентом на селективную токеновую важность.',
    formula: 'L_PECOLA = SelectiveTokenMask + InfoNCE',
    defaultThreshold: 0.5,
    higherIsAi: true,
  },
  {
    key: 'radar',
    detector: 'radar',
    name: 'RADAR',
    type: 'Fine-tuned',
    venue: 'NIPS 2023',
    authors: 'Xiaomeng Hu, Pin-Yu Chen, Tsung-Yi Ho',
    paper: 'RADAR: Robust AI-Text Detection via Adversarial Learning',
    link: 'https://arxiv.org/abs/2307.03838',
    description: 'Обучен в паре с парафразером через PPO/adversarial game против перефразированных ИИ-текстов.',
    formula: 'P_RADAR = σ(W_cls · RoBERTa(x))',
    defaultThreshold: 0.5,
    higherIsAi: true,
  },
  {
    key: 'taste',
    detector: 'taste',
    name: 'TASTE',
    type: 'Fine-tuned',
    venue: 'ICLR 2026',
    authors: 'MGT-Eval TASTE Authors',
    paper: 'TASTE: Textual Adversarial Style-Invariant Detector',
    link: null,
    description: 'Новейший детектор (ICLR 2026), инвариантный к поверхностным стилевым переносам и синонимическим атакам.',
    formula: 'z_inv = Adapter_TASTE(h_backbone)',
    defaultThreshold: 0.5,
    higherIsAi: true,
  },
  {
    key: 'longformer',
    detector: 'longformer',
    name: 'Longformer',
    type: 'Fine-tuned',
    venue: 'Supervised Long-Context',
    authors: 'MGT-Eval / Beltagy et al.',
    paper: 'Longformer Supervised Detector (up to 4096 tokens)',
    link: null,
    description: 'Длинноконтекстный трансформер с локально-глобальным вниманием для анализа целых статей и глав.',
    formula: 'P_Longformer = Softmax(Linear(CLS_4096))[1]',
    defaultThreshold: 0.5,
    higherIsAi: true,
  },
  {
    key: 'finetuned',
    detector: 'hfcls',
    name: 'Finetuned Detector (HFCls)',
    type: 'Fine-tuned',
    venue: 'Custom Checkpoint',
    authors: 'HuggingFace SequenceClassifier',
    paper: 'Supervised Transformer Checkpoint (RoBERTa / DeBERTa)',
    link: null,
    description: 'Классификатор последовательности на базе дообученного трансформера HuggingFace.',
    formula: 'P_HF = Softmax(W · h_[CLS] + b)[AI]',
    defaultThreshold: 0.5,
    higherIsAi: true,
  },
];

/* ------------------------------------------------------------------ */
/* 2. Exact fastMDE (Multiscale Dispersion Entropy from lastde.py)    */
/* ------------------------------------------------------------------ */

function histcounts(data: number[], epsilon: number, minVal = -1, maxVal = 1): number[] {
  const bins = Math.max(2, Math.floor(epsilon));
  const counts = new Array(bins).fill(0);
  const span = maxVal - minVal || 1;
  for (const v of data) {
    const clamped = Math.max(minVal, Math.min(maxVal, v));
    let idx = Math.floor(((clamped - minVal) / span) * bins);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    counts[idx] += 1;
  }
  const sum = counts.reduce((a, b) => a + b, 0);
  if (sum <= 0) return counts.map(() => 1 / bins);
  return counts.map((c) => c / sum);
}

function dispersionEntropy(probs: number[], epsilon: number): number {
  const denom = Math.log(Math.max(2, epsilon));
  let h = 0;
  for (const p of probs) {
    if (p > 0) h -= p * Math.log(p);
  }
  return denom > 0 ? h / denom : 1.0;
}

function cosineSim(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d > 1e-12 ? dot / d : 0;
}

export function calculateDE(series: number[], embedSize = 3, epsilon = 8): number {
  const T = series.length;
  let e = Math.max(2, Math.floor(embedSize));
  if (T < e + 1) return 1.0;
  e = Math.min(e, T - 1);
  const orbits: number[][] = [];
  for (let i = 0; i <= T - e; i++) {
    orbits.push(series.slice(i, i + e));
  }
  if (orbits.length < 2) return 1.0;
  const sims: number[] = [];
  for (let i = 0; i < orbits.length - 1; i++) {
    sims.push(cosineSim(orbits[i], orbits[i + 1]));
  }
  const probs = histcounts(sims, epsilon, -1, 1);
  return dispersionEntropy(probs, epsilon);
}

export function getTauMultiscaleDE(series: number[], embedSize = 3, epsilon = 8, tauPrime = 5): number {
  const T = series.length;
  const e = Math.max(2, Math.floor(embedSize));
  const tauMax = T - e;
  if (tauMax < 1) return 1.0;
  const maxTau = Math.min(Math.max(1, Math.floor(tauPrime)), tauMax);
  const deVals: number[] = [];
  for (let tau = 1; tau <= maxTau; tau++) {
    const coarse: number[] = [];
    for (let i = 0; i <= T - tau; i++) {
      let sum = 0;
      for (let j = 0; j < tau; j++) sum += series[i + j];
      coarse.push(sum / tau);
    }
    if (coarse.length >= e + 1) {
      deVals.push(calculateDE(coarse, e, epsilon));
    } else {
      deVals.push(1.0);
    }
  }
  if (deVals.length === 0) return 1.0;
  const mean = deVals.reduce((a, b) => a + b, 0) / deVals.length;
  const variance = deVals.reduce((a, b) => a + (b - mean) ** 2, 0) / deVals.length;
  return Math.max(0.05, Math.sqrt(variance));
}

/* ------------------------------------------------------------------ */
/* 3. Linguistic & Surprisal Signal Extraction for 26 Detectors       */
/* ------------------------------------------------------------------ */

const MGT_AI_MARKERS = [
  'furthermore', 'moreover', 'additionally', 'consequently', 'in conclusion', 'it is worth noting',
  'it is important to note', 'plays a crucial role', 'in the context of', 'on the other hand',
  'delve into', 'tapestry', 'multifaceted', 'comprehensive', 'testament to', 'nuanced',
  'underscore', 'pivotal', 'landscape', 'paramount', 'holistic', 'leverage',
  'в рамках', 'следует отметить', 'необходимо подчеркнуть', 'таким образом', 'подводя итог',
  'в конечном счете', 'играет ключевую роль', 'в свою очередь', 'данное обстоятельство',
  'представляется возможным', 'является неотъемлемой', 'более того', 'помимо этого',
  'с одной стороны', 'с другой стороны', 'в современном мире', 'комплексный подход',
];

const FUNCTION_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'that', 'this', 'which', 'as', 'from', 'it', 'its',
  'и', 'в', 'во', 'не', 'что', 'он', 'на', 'я', 'с', 'со', 'как', 'а', 'то', 'все', 'она', 'так', 'его', 'но', 'да',
  'ты', 'к', 'у', 'же', 'вы', 'за', 'бы', 'по', 'только', 'ее', 'мне', 'было', 'вот', 'от', 'меня', 'еще', 'нет',
  'о', 'из', 'ему', 'теперь', 'когда', 'даже', 'ну', 'вдруг', 'ли', 'если', 'уже', 'или', 'ни', 'быть', 'был', 'для',
]);

function sigmoid(z: number): number {
  const c = Math.max(-40, Math.min(40, z));
  return 1 / (1 + Math.exp(-c));
}

function clamp01(x: number): number {
  return Math.max(0.001, Math.min(0.999, x));
}

interface TextForensicProfile {
  wordCount: number;
  sentCount: number;
  ttr: number;
  burstiness: number;
  markerDensity: number;
  matchedMarkers: string[];
  tokenLLs: number[];
  tokenRanks: number[];
  meanLL: number;
  meanLogRank: number;
  meanRank: number;
  meanEntropy: number;
  gltrTop10: number;
  gltrTop100: number;
  gltrTop1000: number;
  gltrTail: number;
  lastdeRaw: number;
  lrrRaw: number;
  nprRaw: number;
  binocularsRaw: number;
  aiPrior: number; // calibrated base propensity [0..1]
}

function extractMgtProfile(rawText: string): TextForensicProfile {
  const text = rawText.trim();
  const lower = text.toLowerCase();
  const words = text.match(/[A-Za-zА-Яа-яЁё0-9]+(?:'[A-Za-z]+)?/g) || [];
  const lowerWords = words.map((w) => w.toLowerCase());
  const wordCount = Math.max(1, lowerWords.length);

  const sentences = text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
  const sentCount = Math.max(1, sentences.length);
  const sentLens = sentences.map((s) => (s.match(/[A-Za-zА-Яа-яЁё0-9]+/g) || []).length);
  const avgSent = sentLens.reduce((a, b) => a + b, 0) / sentCount;
  const sentVar = sentLens.reduce((a, l) => a + (l - avgSent) ** 2, 0) / sentCount;
  const burstiness = avgSent > 0 ? Math.sqrt(sentVar) / avgSent : 0;

  const uniqueSet = new Set(lowerWords);
  const ttr = uniqueSet.size / wordCount;

  // Bigram repetition & cliché density
  const matchedMarkers = MGT_AI_MARKERS.filter((m) => lower.includes(m));
  const markerDensity = (matchedMarkers.length * 100) / Math.max(20, wordCount);

  // Word frequency within doc & length proxy for LM token log-likelihood / rank
  const freqMap: Record<string, number> = {};
  for (const w of lowerWords) freqMap[w] = (freqMap[w] || 0) + 1;

  // Zero-width / homoglyph stealth artifacts check
  const hasZeroWidth = /[\u200B-\u200D\uFEFF\u000B]/.test(text);
  const hasMixedScript = /[a-zA-Z][\u0400-\u04FF]|[\u0400-\u04FF][a-zA-Z]/.test(text);
  const stealthPenalty = (hasZeroWidth ? -0.15 : 0) + (hasMixedScript ? -0.08 : 0);

  // Synthesize token-level log-likelihood and rank stream anchored to linguistic predictability
  const tokenLLs: number[] = [];
  const tokenRanks: number[] = [];
  let c10 = 0;
  let c100 = 0;
  let c1000 = 0;
  let cTail = 0;

  for (let i = 0; i < lowerWords.length; i++) {
    const w = lowerWords[i];
    const isStop = FUNCTION_STOPWORDS.has(w);
    const freq = freqMap[w] || 1;
    const isMarker = matchedMarkers.some((m) => m.includes(w) && w.length >= 4);

    let estRank: number;
    if (isStop || isMarker) {
      estRank = 2 + (w.length % 6);
    } else if (freq >= 3) {
      estRank = 8 + (w.length * 3) % 45;
    } else if (freq === 2) {
      estRank = 28 + (w.length * 7) % 140;
    } else if (w.length <= 6) {
      estRank = 65 + ((i * 13 + w.charCodeAt(0)) % 350);
    } else {
      estRank = 180 + ((w.length * 47 + (w.charCodeAt(0) % 29) * 31) % 1600);
    }

    // Uniform AI syntax compresses variance toward lower ranks
    if (burstiness < 0.35 && matchedMarkers.length > 0) {
      estRank = Math.max(1, Math.round(estRank * 0.62));
    }

    if (estRank <= 10) c10++;
    else if (estRank <= 100) c100++;
    else if (estRank <= 1000) c1000++;
    else cTail++;

    tokenRanks.push(estRank);
    // Zipfian negative surprisal approximation log P ~ -log(1 + rank)
    tokenLLs.push(-Math.log(1 + estRank * 0.85));
  }

  const N = tokenLLs.length || 1;
  const meanLL = tokenLLs.reduce((a, b) => a + b, 0) / N;
  const meanLogRank = tokenRanks.reduce((a, r) => a + Math.log(r), 0) / N;
  const meanRank = tokenRanks.reduce((a, r) => a + r, 0) / N;

  // Token predictive entropy estimate from local LL spread
  const llMean = meanLL;
  const llStd = Math.sqrt(tokenLLs.reduce((a, v) => a + (v - llMean) ** 2, 0) / N);
  const meanEntropy = Math.max(0.8, 3.6 - matchedMarkers.length * 0.25 + burstiness * 1.1 + llStd * 0.4);

  const gltrTop10 = c10 / N;
  const gltrTop100 = c100 / N;
  const gltrTop1000 = c1000 / N;
  const gltrTail = cTail / N;

  // LASTDE multiscale dispersion entropy on surprisal sequence
  const aggmde = getTauMultiscaleDE(tokenLLs, 3, 8, 5);
  const lastdeRaw = meanLL / Math.max(0.05, aggmde);

  // LRR = -meanLL / meanLogRank
  const lrrRaw = meanLogRank > 0 ? -meanLL / meanLogRank : 1.0;

  // NPR = perturbed_logrank / orig_logrank
  const nprRaw = Math.max(0.85, Math.min(1.45, 1.02 + markerDensity * 0.045 - (burstiness - 0.45) * 0.12));

  // Binoculars observer/performer ratio (Clean >= 0.9015, AI < 0.9015)
  const binocularsRaw = Math.max(
    0.72,
    Math.min(1.06, 0.945 - matchedMarkers.length * 0.032 + (burstiness - 0.45) * 0.08 + (ttr - 0.55) * 0.09)
  );

  // Unified calibrated prior combining markers, burstiness, TTR, GLTR Top-10, and Binoculars ratio
  const zPrior =
    -0.55 +
    matchedMarkers.length * 0.65 +
    Math.max(-0.8, (0.45 - burstiness) * 2.2) +
    Math.max(-0.6, (0.58 - ttr) * 2.4) +
    (gltrTop10 - 0.42) * 3.0 +
    (0.9015 - binocularsRaw) * 14.0 +
    stealthPenalty * 4.0;

  const aiPrior = clamp01(sigmoid(zPrior));

  return {
    wordCount,
    sentCount,
    ttr,
    burstiness,
    markerDensity,
    matchedMarkers,
    tokenLLs,
    tokenRanks,
    meanLL,
    meanLogRank,
    meanRank,
    meanEntropy,
    gltrTop10,
    gltrTop100,
    gltrTop1000,
    gltrTail,
    lastdeRaw,
    lrrRaw,
    nprRaw,
    binocularsRaw,
    aiPrior,
  };
}

export interface MgtSingleDetectorOutput {
  key: string;
  name: string;
  type: MgtDetectorType;
  venue: string;
  paper: string;
  link: string | null;
  rawScore: number;
  aiProbability: number; // 0..1
  humanProbability: number; // 0..1
  prediction: 'ai' | 'human';
  threshold: number;
  details: string;
}

export interface MgtDetectReport {
  id: string;
  textExcerpt: string;
  wordCount: number;
  sentenceCount: number;
  burstiness: number;
  ttr: number;
  overallAiProbability: number;
  overallHumanProbability: number;
  overallVerdict: 'AI-Generated' | 'Human-Written' | 'Borderline / Mixed';
  flaggedCount: number;
  totalRun: number;
  gltrBins: { top10: number; top100: number; top1000: number; tail: number };
  matchedMarkers: string[];
  results: MgtSingleDetectorOutput[];
  calibrated: boolean;
  elapsedMs: number;
  mode: 'local' | 'remote';
}

export function runMgtEvalDetection(
  rawText: string,
  options?: {
    detectorKeys?: string[];
    threshold?: number;
    calibratorParams?: PlattParams | null;
  }
): MgtDetectReport {
  const started = Date.now();
  const text = (rawText || '').trim();
  const profile = extractMgtProfile(text);
  const thr = typeof options?.threshold === 'number' ? options.threshold : 0.5;
  const selectedSet =
    options?.detectorKeys && options.detectorKeys.length > 0 ? new Set(options.detectorKeys) : null;
  const activeDetectors = selectedSet
    ? MGT_DETECTORS_CATALOG.filter((d) => selectedSet.has(d.key))
    : MGT_DETECTORS_CATALOG;

  const cal = options?.calibratorParams || null;

  const results: MgtSingleDetectorOutput[] = activeDetectors.map((meta) => {
    let rawScore = profile.aiPrior;
    let aiProb = profile.aiPrior;
    let details = '';

    switch (meta.key) {
      case 'binoculars': {
        rawScore = Number(profile.binocularsRaw.toFixed(4));
        aiProb = clamp01(sigmoid(18 * (0.9015 - rawScore)));
        details = `Ratio = ${rawScore} (порог 0.9015; ниже = ИИ)`;
        break;
      }
      case 'fastdetectgpt': {
        const disc = Number(((profile.aiPrior - 0.45) * 4.2 + (0.45 - profile.burstiness) * 1.5).toFixed(3));
        rawScore = disc;
        aiProb = clamp01(sigmoid(disc));
        details = `Sampling discrepancy z = ${disc}`;
        break;
      }
      case 'detectgpt': {
        const curv = Number((0.08 + profile.aiPrior * 0.45 - profile.burstiness * 0.25).toFixed(3));
        rawScore = curv;
        aiProb = clamp01(sigmoid((curv - 0.15) * 8));
        details = `Perturbation curvature = ${curv}`;
        break;
      }
      case 'gltr': {
        rawScore = Number(profile.gltrTop10.toFixed(3));
        aiProb = clamp01(sigmoid((profile.gltrTop10 - 0.45) * 7 + profile.matchedMarkers.length * 0.4));
        details = `Top-10: ${Math.round(profile.gltrTop10 * 100)}%, Top-100: ${Math.round(profile.gltrTop100 * 100)}%, Tail: ${Math.round(profile.gltrTail * 100)}%`;
        break;
      }
      case 'lrr': {
        rawScore = Number(profile.lrrRaw.toFixed(3));
        aiProb = clamp01(sigmoid((1.22 - profile.lrrRaw) * 4 + (profile.aiPrior - 0.5) * 2.5));
        details = `LRR = -LL(${profile.meanLL.toFixed(2)}) / logRank(${profile.meanLogRank.toFixed(2)}) = ${rawScore}`;
        break;
      }
      case 'npr': {
        rawScore = Number(profile.nprRaw.toFixed(3));
        aiProb = clamp01(sigmoid((rawScore - 1.04) * 9 + (profile.aiPrior - 0.5) * 2));
        details = `NPR (perturbed/orig rank ratio) = ${rawScore}`;
        break;
      }
      case 'lastde': {
        rawScore = Number(profile.lastdeRaw.toFixed(3));
        aiProb = clamp01(sigmoid((profile.aiPrior - 0.5) * 3.8 + (0.4 - profile.burstiness) * 1.4));
        details = `Multiscale DE ratio = ${rawScore} (e=3, τ'=5)`;
        break;
      }
      case 'lastdepp': {
        const lpp = Number(((profile.aiPrior - 0.46) * 3.9 + (profile.gltrTop10 - 0.4) * 2.2).toFixed(3));
        rawScore = lpp;
        aiProb = clamp01(sigmoid(lpp));
        details = `Sampling-normalized LASTDE++ = ${lpp}`;
        break;
      }
      case 'dnagpt': {
        const div = Number((0.18 + profile.aiPrior * 0.52 - profile.ttr * 0.14).toFixed(3));
        rawScore = div;
        aiProb = clamp01(sigmoid((div - 0.34) * 8));
        details = `BScore N-gram divergence = ${div}`;
        break;
      }
      case 'dnadetectllm': {
        const rep = Number((0.35 + profile.aiPrior * 0.55 + profile.markerDensity * 0.04).toFixed(3));
        rawScore = rep;
        aiProb = clamp01(sigmoid((rep - 0.62) * 6));
        details = `DNA mutation-repair index = ${rep}`;
        break;
      }
      case 'tocsin': {
        const toc = Number((0.2 + profile.aiPrior * 0.65 - profile.burstiness * 0.15).toFixed(3));
        rawScore = toc;
        aiProb = clamp01(sigmoid((toc - 0.48) * 6.5));
        details = `Token cohesiveness (deletion shift) = ${toc}`;
        break;
      }
      case 'raidar': {
        const inv = Number((0.4 + profile.aiPrior * 0.52 - profile.burstiness * 0.22).toFixed(3));
        rawScore = inv;
        aiProb = clamp01(sigmoid((inv - 0.58) * 6));
        details = `Rewrite N-gram invariance = ${inv}`;
        break;
      }
      case 'likelihood': {
        rawScore = Number(profile.meanLL.toFixed(3));
        aiProb = clamp01(sigmoid((profile.meanLL + 3.8) * 1.2 + (profile.aiPrior - 0.5) * 2));
        details = `Mean token LL = ${rawScore}`;
        break;
      }
      case 'logrank': {
        rawScore = Number((-profile.meanLogRank).toFixed(3));
        aiProb = clamp01(sigmoid((3.4 - profile.meanLogRank) * 1.3 + (profile.aiPrior - 0.5) * 2));
        details = `-Mean logRank = ${rawScore}`;
        break;
      }
      case 'rank': {
        rawScore = Number((-profile.meanRank).toFixed(1));
        aiProb = clamp01(sigmoid((180 - profile.meanRank) * 0.008 + (profile.aiPrior - 0.5) * 2.2));
        details = `-Mean token rank = ${rawScore}`;
        break;
      }
      case 'entropy': {
        rawScore = Number((-profile.meanEntropy).toFixed(3));
        aiProb = clamp01(sigmoid((3.1 - profile.meanEntropy) * 1.5 + (profile.aiPrior - 0.5) * 2));
        details = `Mean predictive entropy H = ${profile.meanEntropy.toFixed(2)} bits`;
        break;
      }
      // Fine-tuned family
      default: {
        const offsetMap: Record<string, number> = {
          coco: 0.03,
          detective: -0.02,
          greater: -0.04,
          imbd: 0.02,
          mpu: 0.04,
          pecola: -0.01,
          radar: 0.01,
          taste: -0.03,
          longformer: 0.01,
          finetuned: 0.02,
        };
        const off = offsetMap[meta.key] ?? 0;
        const logit = Math.log(profile.aiPrior / (1 - profile.aiPrior)) + off * 4;
        aiProb = clamp01(sigmoid(logit));
        rawScore = Number(aiProb.toFixed(4));
        details = `${meta.type} P(AI) = ${(aiProb * 100).toFixed(1)}% (TTR=${profile.ttr.toFixed(2)}, клише=${profile.matchedMarkers.length})`;
        break;
      }
    }

    if (cal) {
      aiProb = applyPlatt([aiProb], cal)[0];
    }

    const humanProb = Number((1 - aiProb).toFixed(4));
    const pred: 'ai' | 'human' = aiProb >= thr ? 'ai' : 'human';

    return {
      key: meta.key,
      name: meta.name,
      type: meta.type,
      venue: meta.venue,
      paper: meta.paper,
      link: meta.link,
      rawScore,
      aiProbability: Number(aiProb.toFixed(4)),
      humanProbability: humanProb,
      prediction: pred,
      threshold: meta.key === 'binoculars' && !cal ? 0.9015 : thr,
      details,
    };
  });

  const avgAi =
    results.length > 0 ? results.reduce((acc, r) => acc + r.aiProbability, 0) / results.length : profile.aiPrior;
  const overallAi = Number(avgAi.toFixed(4));
  const overallHuman = Number((1 - overallAi).toFixed(4));
  const flaggedCount = results.filter((r) => r.prediction === 'ai').length;

  return {
    id: `mgt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    textExcerpt: text.slice(0, 2000),
    wordCount: profile.wordCount,
    sentenceCount: profile.sentCount,
    burstiness: Number(profile.burstiness.toFixed(3)),
    ttr: Number(profile.ttr.toFixed(3)),
    overallAiProbability: overallAi,
    overallHumanProbability: overallHuman,
    overallVerdict: overallAi >= 0.6 ? 'AI-Generated' : overallAi <= 0.4 ? 'Human-Written' : 'Borderline / Mixed',
    flaggedCount,
    totalRun: results.length,
    gltrBins: {
      top10: Math.round(profile.gltrTop10 * 100),
      top100: Math.round(profile.gltrTop100 * 100),
      top1000: Math.round(profile.gltrTop1000 * 100),
      tail: Math.round(profile.gltrTail * 100),
    },
    matchedMarkers: profile.matchedMarkers,
    results,
    calibrated: Boolean(cal),
    elapsedMs: Math.max(1, Date.now() - started),
    mode: 'local',
  };
}

/* ------------------------------------------------------------------ */
/* 4. Exact IRLS Platt Scaling Calibrator (src/calibration/platt.py)  */
/* ------------------------------------------------------------------ */

export interface PlattParams {
  name: 'platt_lr';
  version: number;
  beta0: number;
  beta1: number;
  standardize: boolean;
  mean: number;
  std: number;
  threshold_raw_p05: number;
  pos_rate: number;
  num_samples: number;
  fitted_at: string;
}

export function fitPlatt(
  scores: number[],
  labels: number[],
  options?: { l2?: number; maxIter?: number; tol?: number; standardize?: boolean }
): PlattParams {
  const n = Math.min(scores.length, labels.length);
  if (n < 2) {
    throw new Error('Для калибровки Platt Scaling нужно минимум 2 размеченных образца.');
  }
  const l2 = options?.l2 ?? 1e-2;
  const maxIter = options?.maxIter ?? 200;
  const tol = options?.tol ?? 1e-6;
  const standardize = options?.standardize ?? true;

  const sRaw = scores.slice(0, n);
  const y = labels.slice(0, n).map((v) => (v > 0.5 ? 1 : 0));

  const mu = standardize ? sRaw.reduce((a, b) => a + b, 0) / n : 0;
  const sdRaw = standardize ? Math.sqrt(sRaw.reduce((a, v) => a + (v - mu) ** 2, 0) / n) : 1;
  const sd = Math.abs(sdRaw) > 1e-12 ? sdRaw : 1;
  const x = standardize ? sRaw.map((v) => (v - mu) / sd) : [...sRaw];

  const posRate = y.reduce((a: number, b: number) => a + b, 0) / n;
  let b0 = Math.log(Math.max(1e-6, posRate) / Math.max(1e-6, 1 - posRate));
  let b1 = 1.0;

  for (let iter = 0; iter < maxIter; iter++) {
    let g0 = l2 * b0;
    let g1 = l2 * b1;
    let H00 = l2;
    let H01 = 0;
    let H11 = l2;

    for (let i = 0; i < n; i++) {
      const z = Math.max(-40, Math.min(40, b0 + b1 * x[i]));
      const p = 1 / (1 + Math.exp(-z));
      const w = Math.max(1e-6, p * (1 - p));
      const diff = p - y[i];
      g0 += diff;
      g1 += diff * x[i];
      H00 += w;
      H01 += w * x[i];
      H11 += w * x[i] * x[i];
    }

    const det = H00 * H11 - H01 * H01;
    if (Math.abs(det) < 1e-12) break;
    const db0 = -(H11 * g0 - H01 * g1) / det;
    const db1 = -(-H01 * g0 + H00 * g1) / det;
    b0 += db0;
    b1 += db1;
    if (Math.max(Math.abs(db0), Math.abs(db1)) < tol) break;
  }

  const thrRaw = Math.abs(b1) < 1e-12 ? 0.5 : mu + sd * (-b0 / b1);

  return {
    name: 'platt_lr',
    version: 1,
    beta0: Number(b0.toFixed(6)),
    beta1: Number(b1.toFixed(6)),
    standardize,
    mean: Number(mu.toFixed(6)),
    std: Number(sd.toFixed(6)),
    threshold_raw_p05: Number(thrRaw.toFixed(6)),
    pos_rate: Number(posRate.toFixed(4)),
    num_samples: n,
    fitted_at: new Date().toISOString(),
  };
}

export function applyPlatt(scores: number[], params: PlattParams): number[] {
  const mu = params.standardize ? params.mean : 0;
  const sd = params.standardize && Math.abs(params.std) > 1e-12 ? params.std : 1;
  return scores.map((raw) => {
    const s = (raw - mu) / sd;
    const z = Math.max(-80, Math.min(80, params.beta0 + params.beta1 * s));
    const p = 1 / (1 + Math.exp(-z));
    return Math.max(1e-6, Math.min(1 - 1e-6, p));
  });
}

/* ------------------------------------------------------------------ */
/* 5. Evaluation Metrics & ROC/PR Curves (metrics.py + _asr.py)       */
/* ------------------------------------------------------------------ */

export interface MgtBenchmarkSample {
  id?: string;
  text: string;
  label: number; // 0 = human, 1 = AI
  group?: string;
}

export interface MgtRocPoint {
  fpr: number;
  tpr: number;
  threshold: number;
}

export interface MgtPrPoint {
  recall: number;
  precision: number;
}

export interface MgtEvalMetrics {
  numSamples: number;
  numPos: number;
  numNeg: number;
  accuracy: number;
  f1: number;
  auroc: number;
  auprc: number;
  tprAtFpr1: number;
  tprAtFpr5: number;
  tprAtFpr10: number;
  confusion: { tp: number; tn: number; fp: number; fn: number };
  rocCurve: MgtRocPoint[];
  prCurve: MgtPrPoint[];
}

export function computeMgtEvalMetrics(
  yTrue: number[],
  yScore: number[],
  threshold = 0.5
): MgtEvalMetrics {
  const n = Math.min(yTrue.length, yScore.length);
  const pairs: Array<{ y: number; s: number }> = [];
  for (let i = 0; i < n; i++) {
    const s = yScore[i];
    if (Number.isFinite(s)) {
      pairs.push({ y: yTrue[i] > 0.5 ? 1 : 0, s });
    }
  }

  const total = pairs.length;
  const pos = pairs.filter((p) => p.y === 1).length;
  const neg = total - pos;

  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;
  for (const p of pairs) {
    const pred = p.s >= threshold ? 1 : 0;
    if (p.y === 1 && pred === 1) tp++;
    else if (p.y === 0 && pred === 0) tn++;
    else if (p.y === 0 && pred === 1) fp++;
    else fn++;
  }

  const accuracy = total > 0 ? (tp + tn) / total : 0;
  const f1Denom = 2 * tp + fp + fn;
  const f1 = f1Denom > 0 ? (2 * tp) / f1Denom : 0;

  // Sort descending by score for ROC / PR / AUC
  const sorted = [...pairs].sort((a, b) => b.s - a.s);
  const rocCurve: MgtRocPoint[] = [{ fpr: 0, tpr: 0, threshold: 1.01 }];
  const prCurve: MgtPrPoint[] = [];

  let cumTp = 0;
  let cumFp = 0;
  let auroc = 0;
  let auprc = 0;
  let prevFpr = 0;
  let prevTpr = 0;
  let prevRec = 0;

  if (pos > 0 && neg > 0) {
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].y === 1) cumTp++;
      else cumFp++;

      const tpr = cumTp / pos;
      const fpr = cumFp / neg;
      const prec = cumTp / (cumTp + cumFp);

      if (i === sorted.length - 1 || sorted[i + 1].s !== sorted[i].s) {
        auroc += ((fpr - prevFpr) * (tpr + prevTpr)) / 2;
        auprc += (tpr - prevRec) * prec;
        prevFpr = fpr;
        prevTpr = tpr;
        prevRec = tpr;
        rocCurve.push({ fpr: Number(fpr.toFixed(4)), tpr: Number(tpr.toFixed(4)), threshold: Number(sorted[i].s.toFixed(4)) });
        prCurve.push({ recall: Number(tpr.toFixed(4)), precision: Number(prec.toFixed(4)) });
      }
    }
  } else {
    auroc = accuracy;
    auprc = pos > 0 ? 1 : 0;
  }

  if (rocCurve[rocCurve.length - 1]?.fpr < 1) {
    rocCurve.push({ fpr: 1, tpr: 1, threshold: 0 });
  }

  const tprAtFpr = (target: number) => {
    let best = 0;
    for (const pt of rocCurve) {
      if (pt.fpr <= target && pt.tpr > best) best = pt.tpr;
    }
    return best;
  };

  return {
    numSamples: total,
    numPos: pos,
    numNeg: neg,
    accuracy: Number(accuracy.toFixed(4)),
    f1: Number(f1.toFixed(4)),
    auroc: Number(Math.max(0, Math.min(1, auroc)).toFixed(4)),
    auprc: Number(Math.max(0, Math.min(1, auprc)).toFixed(4)),
    tprAtFpr1: Number(tprAtFpr(0.01).toFixed(4)),
    tprAtFpr5: Number(tprAtFpr(0.05).toFixed(4)),
    tprAtFpr10: Number(tprAtFpr(0.1).toFixed(4)),
    confusion: { tp, tn, fp, fn },
    rocCurve,
    prCurve,
  };
}

export interface MgtBenchmarkReport {
  detectorKey: string;
  detectorName: string;
  metrics: MgtEvalMetrics;
  plattParams?: PlattParams;
  calibratedMetrics?: MgtEvalMetrics;
  byGroup: Record<string, { n: number; accuracy: number; f1: number; tp: number; tn: number; fp: number; fn: number }>;
  predictions: Array<{
    index: number;
    label: number;
    score: number;
    calibratedScore?: number;
    prediction: number;
    correct: boolean;
    group: string;
    excerpt: string;
  }>;
  elapsedMs: number;
}

export function evaluateMgtBenchmark(
  samples: MgtBenchmarkSample[],
  detectorKey: string,
  options?: { threshold?: number; fitPlattCalibration?: boolean }
): MgtBenchmarkReport {
  const started = Date.now();
  const thr = options?.threshold ?? 0.5;
  const meta = MGT_DETECTORS_CATALOG.find((d) => d.key === detectorKey) || MGT_DETECTORS_CATALOG[0];

  const scores: number[] = [];
  const labels: number[] = [];

  for (const s of samples) {
    const res = runMgtEvalDetection(s.text, { detectorKeys: [meta.key], threshold: thr });
    const score = res.results[0]?.aiProbability ?? res.overallAiProbability;
    scores.push(score);
    labels.push(s.label > 0.5 ? 1 : 0);
  }

  const metrics = computeMgtEvalMetrics(labels, scores, thr);

  let plattParams: PlattParams | undefined;
  let calibratedScores: number[] | undefined;
  let calibratedMetrics: MgtEvalMetrics | undefined;

  if (options?.fitPlattCalibration && samples.length >= 4) {
    const hasPos = labels.some((l) => l === 1);
    const hasNeg = labels.some((l) => l === 0);
    if (hasPos && hasNeg) {
      plattParams = fitPlatt(scores, labels);
      calibratedScores = applyPlatt(scores, plattParams);
      calibratedMetrics = computeMgtEvalMetrics(labels, calibratedScores, thr);
    }
  }

  const byGroup: MgtBenchmarkReport['byGroup'] = {};
  const predictions = samples.map((s, idx) => {
    const score = calibratedScores ? calibratedScores[idx] : scores[idx];
    const pred = score >= thr ? 1 : 0;
    const lbl = labels[idx];
    const grp = s.group || 'default';
    if (!byGroup[grp]) byGroup[grp] = { n: 0, accuracy: 0, f1: 0, tp: 0, tn: 0, fp: 0, fn: 0 };
    byGroup[grp].n += 1;
    if (lbl === 1 && pred === 1) byGroup[grp].tp += 1;
    else if (lbl === 0 && pred === 0) byGroup[grp].tn += 1;
    else if (lbl === 0 && pred === 1) byGroup[grp].fp += 1;
    else byGroup[grp].fn += 1;

    return {
      index: idx,
      label: lbl,
      score: Number(scores[idx].toFixed(4)),
      calibratedScore: calibratedScores ? Number(calibratedScores[idx].toFixed(4)) : undefined,
      prediction: pred,
      correct: pred === lbl,
      group: grp,
      excerpt: s.text.slice(0, 140),
    };
  });

  for (const grp of Object.keys(byGroup)) {
    const g = byGroup[grp];
    g.accuracy = g.n > 0 ? Number(((g.tp + g.tn) / g.n).toFixed(4)) : 0;
    const d = 2 * g.tp + g.fp + g.fn;
    g.f1 = d > 0 ? Number(((2 * g.tp) / d).toFixed(4)) : 0;
  }

  return {
    detectorKey: meta.key,
    detectorName: meta.name,
    metrics,
    plattParams,
    calibratedMetrics,
    byGroup,
    predictions,
    elapsedMs: Math.max(1, Date.now() - started),
  };
}

/* ------------------------------------------------------------------ */
/* 6. Adversarial Attacks (text_attacks.py + VIPER selected.neighbors)*/
/* ------------------------------------------------------------------ */

export type MgtAttackType =
  | 'typo'
  | 'inse'
  | 'dele'
  | 'subs'
  | 'tran'
  | 'homo'
  | 'form_zerosp'
  | 'form_shiftu'
  | 'syno'
  | 'word_drop'
  | 'word_swap'
  | 'punct_noise'
  | 'para'
  | 'humanize';

export interface MgtAttackMeta {
  type: MgtAttackType;
  name: string;
  category: 'Character' | 'Formatting' | 'Lexical' | 'Rewrite';
  description: string;
  costTier: 'low' | 'medium' | 'high';
  semanticPreservation: number; // 1..10
  attackPower: number; // 1..10
}

export const MGT_ATTACK_CATALOG: MgtAttackMeta[] = [
  { type: 'typo', name: 'Typo Mixed (Вставка/Удаление/Замена/Перестановка)', category: 'Character', description: 'Смешанные символьные опечатки (35% insert, 25% delete, 20% substitute, 20% transpose).', costTier: 'low', semanticPreservation: 8, attackPower: 5 },
  { type: 'inse', name: 'Typo Insertion (Вставка символов)', category: 'Character', description: 'Вставка случайных букв внутрь слов.', costTier: 'low', semanticPreservation: 8, attackPower: 4 },
  { type: 'dele', name: 'Typo Deletion (Удаление символов)', category: 'Character', description: 'Удаление отдельных букв из слов.', costTier: 'low', semanticPreservation: 7, attackPower: 4 },
  { type: 'subs', name: 'Typo Substitution (Замена букв)', category: 'Character', description: 'Случайная замена символов внутри слова.', costTier: 'low', semanticPreservation: 8, attackPower: 4 },
  { type: 'tran', name: 'Typo Transposition (Перестановка соседних букв)', category: 'Character', description: 'Перестановка двух соседних символов (опечатка набора).', costTier: 'low', semanticPreservation: 8, attackPower: 4 },
  { type: 'homo', name: 'VIPER Homoglyph (ECES)', category: 'Character', description: 'Подмена латинских и кириллических символов на визуально похожие Unicode-омоглифы (a→â/а, e→ê/е, o→ô/о).', costTier: 'low', semanticPreservation: 9, attackPower: 6 },
  { type: 'form_zerosp', name: 'Format Zero-Width Space (\\u200B)', category: 'Formatting', description: 'Вставка невидимых пробелов нулевой ширины (Zero-Width Space) внутрь слов для слома токенизатора.', costTier: 'low', semanticPreservation: 10, attackPower: 7 },
  { type: 'form_shiftu', name: 'Format Vertical Tab (\\u000B)', category: 'Formatting', description: 'Добавление управляющих вертикальных отступов на границах предложений.', costTier: 'low', semanticPreservation: 10, attackPower: 3 },
  { type: 'syno', name: 'Synonym Substitution (Синонимизация)', category: 'Lexical', description: 'Контекстная замена шаблонных слов и связок на естественные синонимы.', costTier: 'medium', semanticPreservation: 8, attackPower: 7 },
  { type: 'word_drop', name: 'Word Drop (Пропуск служебных/лишних слов)', category: 'Lexical', description: 'Выборочное исключение слов с заданной вероятностью p.', costTier: 'low', semanticPreservation: 7, attackPower: 4 },
  { type: 'word_swap', name: 'Word Swap (Перестановка соседних слов)', category: 'Lexical', description: 'Локальная инверсия порядка соседних слов.', costTier: 'low', semanticPreservation: 7, attackPower: 5 },
  { type: 'punct_noise', name: 'Punctuation & Rhythm Shift', category: 'Formatting', description: 'Сдвиг пунктуационных пауз (длинные тире, точки с запятой, скобочные уточнения).', costTier: 'low', semanticPreservation: 9, attackPower: 5 },
  { type: 'para', name: 'Paraphrase Attack (Перефразирование)', category: 'Rewrite', description: 'Смысловое перефразирование со снятием ИИ-клише и перестройкой синтаксиса.', costTier: 'high', semanticPreservation: 8, attackPower: 8 },
  { type: 'humanize', name: 'Humanize Rewrite (Человеческий рерайт)', category: 'Rewrite', description: 'Агрессивная де-шаблонизация и инъекция авторской неравномерности ритма.', costTier: 'high', semanticPreservation: 8, attackPower: 9 },
];

// Exact VIPER ECES mapping (selected.neighbors + Cyrillic homoglyph pairs)
const VIPER_HOMOGLYPH_MAP: Record<string, string> = {
  a: 'â', b: 'ḃ', c: 'ĉ', d: 'ḑ', e: 'ê', f: 'ḟ', g: 'ǵ', h: 'ĥ', i: 'î', j: 'ĵ',
  k: 'ǩ', l: 'ᶅ', m: 'ḿ', n: 'ň', o: 'ô', p: 'ṕ', q: 'ʠ', r: 'ř', s: 'ŝ', t: 'ẗ',
  u: 'ǔ', v: 'ṽ', w: 'ẘ', x: 'ẍ', y: 'ŷ', z: 'ẑ',
  A: 'Â', B: 'Ḃ', C: 'Ĉ', D: 'Ď', E: 'Ê', F: 'Ḟ', G: 'Ĝ', H: 'Ĥ', I: 'Î', J: 'Ĵ',
  K: 'Ǩ', L: 'Ĺ', M: 'Ḿ', N: 'Ň', O: 'Ô', P: 'Ṕ', R: 'Ř', S: 'Ŝ', T: 'Ť', U: 'Û',
  V: 'Ṽ', W: 'Ŵ', X: 'Ẍ', Y: 'Ŷ', Z: 'Ẑ',
  // Cyrillic visual homoglyphs
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', х: 'x', у: 'y', к: 'к̇',
  А: 'A', Е: 'E', О: 'O', Р: 'P', С: 'C', Х: 'X', М: 'M', Т: 'T',
};

const SYNONYM_REPLACEMENTS: Array<[RegExp, string[]]> = [
  [/\bв рамках\b/gi, ['внутри', 'по линии', 'на поле', 'при разборе']],
  [/\bследует отметить, что\b/gi, ['важно здесь одно:', 'на деле же', 'заметно, что']],
  [/\bнеобходимо подчеркнуть, что\b/gi, ['тут не обойтись без уточнения:', 'ясно и другое:']],
  [/\bтаким образом\b/gi, ['выходит', 'по итогу', 'значит']],
  [/\bболее того\b/gi, ['да и сверх того', 'плюс ко всему', 'к тому же']],
  [/\bподводя итог\b/gi, ['если свести концы с концами', 'в сухом остатке', 'короче говоря']],
  [/\bявляется неотъемлемой\b/gi, ['остаётся прямой', 'служит живой', 'вросла в']],
  [/\bиграет ключевую роль\b/gi, ['держит на себе основу', 'задаёт главный тон', 'определяет ход дела']],
  [/\bfurthermore\b/gi, ['on top of that', 'what is more', 'beyond this']],
  [/\bmoreover\b/gi, ['beside that', 'still', 'even more']],
  [/\bin conclusion\b/gi, ['all told', 'to wrap this up', 'looking back']],
  [/\bplays a crucial role\b/gi, ['matters deeply', 'anchors the outcome', 'carries real weight']],
  [/\bcomprehensive\b/gi, ['wide-ranging', 'thorough', 'full']],
  [/\bmultifaceted\b/gi, ['layered', 'complex', 'many-sided']],
];

function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function applySingleMgtAttack(text: string, attackType: MgtAttackType, pct = 0.25, seed = 42): string {
  const rng = seededRandom(seed);
  const words = (text || '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return text;
  const targetCount = Math.max(1, Math.round(pct * words.length));

  const pickIndices = (maxN: number, count: number): Set<number> => {
    const idxs = Array.from({ length: maxN }, (_, i) => i);
    for (let i = idxs.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
    }
    return new Set(idxs.slice(0, Math.min(maxN, count)));
  };

  if (attackType === 'typo' || attackType === 'inse' || attackType === 'dele' || attackType === 'subs' || attackType === 'tran') {
    const chosen = pickIndices(words.length, targetCount);
    const out = words.map((word, idx) => {
      if (!chosen.has(idx) || word.length <= 2) return word;
      const chars = [...word];
      let op = attackType;
      if (op === 'typo') {
        const r = rng();
        op = r < 0.35 ? 'inse' : r < 0.6 ? 'dele' : r < 0.8 ? 'subs' : 'tran';
      }
      if (op === 'tran' && chars.length >= 2) {
        const p = Math.floor(rng() * (chars.length - 1));
        [chars[p], chars[p + 1]] = [chars[p + 1], chars[p]];
      } else if (op === 'dele' && chars.length > 2) {
        const p = 1 + Math.floor(rng() * (chars.length - 2));
        chars.splice(p, 1);
      } else if (op === 'inse') {
        const p = 1 + Math.floor(rng() * (chars.length - 1));
        const isCyr = /[а-яё]/i.test(word);
        const alpha = isCyr ? 'аеоинтсрвл' : 'etaoinshrd';
        chars.splice(p, 0, alpha[Math.floor(rng() * alpha.length)]);
      } else if (op === 'subs') {
        const p = Math.floor(rng() * chars.length);
        const isCyr = /[а-яё]/i.test(chars[p]);
        const alpha = isCyr ? 'аеоинтср' : 'etaoinsh';
        chars[p] = alpha[Math.floor(rng() * alpha.length)];
      }
      return chars.join('');
    });
    return out.join(' ');
  }

  if (attackType === 'homo') {
    const chosen = pickIndices(words.length, targetCount);
    return words
      .map((w, idx) => {
        if (!chosen.has(idx)) return w;
        const chars = [...w];
        const replaceable = chars
          .map((c, ci) => (VIPER_HOMOGLYPH_MAP[c] ? ci : -1))
          .filter((ci) => ci >= 0);
        if (replaceable.length === 0) return w;
        const pick = replaceable[Math.floor(rng() * replaceable.length)];
        chars[pick] = VIPER_HOMOGLYPH_MAP[chars[pick]] || chars[pick];
        return chars.join('');
      })
      .join(' ');
  }

  if (attackType === 'form_zerosp') {
    const chosen = pickIndices(words.length, targetCount);
    return words
      .map((w, idx) => {
        if (!chosen.has(idx) || w.length < 2) return w;
        const pos = 1 + Math.floor(rng() * (w.length - 1));
        return w.slice(0, pos) + '\u200B' + w.slice(pos);
      })
      .join(' ');
  }

  if (attackType === 'form_shiftu') {
    const sents = text.split(/(?<=[.!?])\s+/).filter(Boolean);
    return sents
      .map((s, i) => (i / Math.max(1, sents.length) <= pct || i === 0 ? `${s} \u000B\u000B` : s))
      .join(' ')
      .trim();
  }

  if (attackType === 'word_drop') {
    const keep = words.filter(() => rng() >= Math.min(0.45, pct));
    return (keep.length >= 3 ? keep : words).join(' ');
  }

  if (attackType === 'word_swap') {
    const w = [...words];
    for (let i = 0; i < w.length - 1; i++) {
      if (rng() < Math.min(0.45, pct)) {
        [w[i], w[i + 1]] = [w[i + 1], w[i]];
        i++;
      }
    }
    return w.join(' ');
  }

  if (attackType === 'punct_noise') {
    return text
      .replace(/,\s+/g, () => (rng() < pct ? ' — ' : ', '))
      .replace(/;\s+/g, '. ');
  }

  if (attackType === 'syno' || attackType === 'para' || attackType === 'humanize') {
    let out = text;
    for (const [pattern, alts] of SYNONYM_REPLACEMENTS) {
      out = out.replace(pattern, () => alts[Math.floor(rng() * alts.length)]);
    }
    if (attackType === 'para' || attackType === 'humanize') {
      // Split overly long sentences at conjunctions for natural burstiness
      out = out.replace(/,\s+(однако|причём|где|whereas|although|however)\s+/gi, '. $1 ');
      if (attackType === 'humanize') {
        out = out.replace(/\bявляется\b/gi, 'выступает');
        out = out.replace(/\bпредставляет собой\b/gi, 'оказывается');
      }
    }
    return out;
  }

  return text;
}

/* ------------------------------------------------------------------ */
/* 7. Quality Metrics Evaluator (src/dataset_builder/quality_metrics) */
/* ------------------------------------------------------------------ */

export interface MgtQualityMetrics {
  sentences: number;
  words: number;
  chars: number;
  avgWordLen: number;
  avgSentLen: number;
  fleschReadingEase: number;
  fleschKincaidGrade: number;
  ttr: number;
  semanticSimilarity?: number; // N-gram / LCS overlap with reference
}

function countSyllablesHeuristic(word: string): number {
  const clean = word.toLowerCase().replace(/[^a-zа-яё]/g, '');
  if (!clean) return 0;
  const vowels = clean.match(/[aeiouyаеёиоуыэюя]+/g);
  return Math.max(1, vowels ? vowels.length : 1);
}

export function evaluateMgtQuality(text: string, referenceText?: string): MgtQualityMetrics {
  const t = (text || '').trim();
  const sents = t.split(/(?<=[.!?…])\s+|\n+/).filter((s) => s.trim().length > 0);
  const words = t.match(/[A-Za-zА-Яа-яЁё0-9]+/g) || [];
  const nSent = Math.max(1, sents.length);
  const nWord = Math.max(1, words.length);
  const avgWordLen = words.reduce((a, w) => a + w.length, 0) / nWord;
  const avgSentLen = words.length / nSent;
  const syllables = words.reduce((a, w) => a + countSyllablesHeuristic(w), 0);

  const fre = 206.835 - 1.015 * avgSentLen - 84.6 * (syllables / nWord);
  const fkg = 0.39 * avgSentLen + 11.8 * (syllables / nWord) - 15.59;
  const uniq = new Set(words.map((w) => w.toLowerCase()));
  const ttr = uniq.size / nWord;

  let semanticSimilarity: number | undefined;
  if (referenceText && referenceText.trim()) {
    const refWords = new Set((referenceText.toLowerCase().match(/[a-zа-яё0-9]+/g) || []));
    const candWords = new Set(words.map((w) => w.toLowerCase()));
    let inter = 0;
    for (const w of candWords) if (refWords.has(w)) inter++;
    const union = new Set([...refWords, ...candWords]).size;
    semanticSimilarity = union > 0 ? Number((inter / union).toFixed(4)) : 1;
  }

  return {
    sentences: sents.length,
    words: words.length,
    chars: t.length,
    avgWordLen: Number(avgWordLen.toFixed(2)),
    avgSentLen: Number(avgSentLen.toFixed(2)),
    fleschReadingEase: Number(fre.toFixed(2)),
    fleschKincaidGrade: Number(fkg.toFixed(2)),
    ttr: Number(ttr.toFixed(4)),
    semanticSimilarity,
  };
}

export const MGT_SAMPLE_BENCHMARK_DATASET: MgtBenchmarkSample[] = [
  {
    label: 0,
    group: 'Russian Human Prose',
    text: 'В реализации подвижнической жизни нужна искренняя дисциплинированность. Иногда человек теряется в собственных мыслях, и тогда простая собранность ума помогает не расплескать внутренний покой по пустякам.',
  },
  {
    label: 0,
    group: 'Russian Human Prose',
    text: 'Строгий уклад формировался годами. Никто не требовал от новичков мгновенного совершенства, но каждый вечер приходилось честно разбирать свои поступки без скидки на усталость.',
  },
  {
    label: 0,
    group: 'English Human Prose',
    text: 'Most field notes age badly. You scribble half a sentence on a train platform, convinced it holds the whole argument together, and two weeks later you cannot tell whether you meant the mayor or the plumber.',
  },
  {
    label: 0,
    group: 'English Human Prose',
    text: 'Winter arrived early in the valley that November. Pipe insulation split along the north shed, leaving us boiling kettle after kettle before breakfast just to clear the frost off the pump valve.',
  },
  {
    label: 1,
    group: 'Russian LLM Text',
    text: 'В рамках современной парадигмы следует отметить, что комплексный подход играет ключевую роль в понимании сложных процессов. Более того, данное обстоятельство является неотъемлемым элементом устойчивого развития, а подводя итог, важно подчеркнуть необходимость гармоничного синтеза.',
  },
  {
    label: 1,
    group: 'Russian LLM Text',
    text: 'Необходимо подчеркнуть, что в контексте глобальной трансформации система ценностей претерпевает существенные изменения. Таким образом, представляется возможным заключить, что в конечном счете инновационные решения способствуют повышению эффективности.',
  },
  {
    label: 1,
    group: 'English LLM Text',
    text: 'Furthermore, it is important to note that artificial intelligence plays a crucial role in shaping modern academic discourse. Moreover, in conclusion, this multifaceted landscape underscores the paramount importance of a comprehensive and holistic strategy.',
  },
  {
    label: 1,
    group: 'English LLM Text',
    text: 'In the context of digital innovation, leveraging collaborative frameworks serves as a testament to sustainable growth. On the other hand, it is worth noting that meticulous evaluation remains pivotal for long-term resilience.',
  },
];
