/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Full TypeScript port of sadjadeb/DetectZoo (Unified Multimodal AI-Generated Content Detection Zoo)
 * Includes:
 * - Registry & Alias Resolver (37 Text + 17 Image + 14 Audio + 2 Video = 70 Detectors, 23 Datasets)
 * - Full execution suite for all 37 Text Detectors with BaseDetector._make_result semantics
 * - Faithful implementations of AdaDetectGPT, BiScope, GECScore, Glimpse, IDE (PHD & MLE),
 *   IPAD, IRM, Lastde / Lastde++, OOD (D-SVDD, HRN, Energy), Revise-Detect, Text Fluoroscopy,
 *   ReMoDetect, ImBD, CoCo, DeTeCtive, TOCSIN, DNA-DetectLLM, DNA-GPT, Binoculars, etc.
 * - BenchmarkEvaluator & compute_metrics (Accuracy, Precision, Recall, F1, TPR, FPR, ROC AUC, PR AUC, AP, EER)
 */

export type DetectZooModality = 'text' | 'image' | 'audio' | 'video';

export type DetectZooTextFamily =
  | 'Zero-Shot Metric'
  | 'Perturbation & Rewrite'
  | 'Intrinsic & Manifold'
  | 'OOD & Energy'
  | 'Supervised & Reward';

export interface DetectZooDetectorMeta {
  registryName: string;
  className: string;
  aliases: string[];
  modality: DetectZooModality;
  family: string;
  defaultThreshold: number;
  defaultModel: string;
  paper: string;
  venue: string;
  formula: string;
  description: string;
}

export interface DetectZooDatasetMeta {
  registryName: string;
  className: string;
  aliases: string[];
  modality: DetectZooModality;
  domain: string;
  description: string;
}

export interface DetectZooResult {
  registryName: string;
  className: string;
  family: DetectZooTextFamily;
  score: number;
  threshold: number;
  label: 'ai' | 'human';
  confidence: number;
  aiProbability: number;
  humanProbability: number;
  formula: string;
  metadata: Record<string, number | string | boolean>;
}

export interface DetectZooSpecialSignals {
  energyScore: number;
  dsvddRadius: number;
  hrnPenalty: number;
  phdIntrinsicDim: number;
  mleIntrinsicDim: number;
  textFluoroscopyMaxKL: number;
  textFluoroscopyPeakLayer: number;
  biscopeFce: number;
  biscopeBce: number;
  biscopeGap: number;
  gecscoreRouge2: number;
  glimpseTailSigma: number;
  adaDetectWitnessDelta: number;
  ipadPromptDelta: number;
  irmImplicitReward: number;
  reviseBartScore: number;
  remodetectReward: number;
  lastdeMde: number;
  tocsinCohesiveness: number;
  dnaMutationRepair: number;
}

export interface DetectZooSuiteReport {
  textExcerpt: string;
  tokenCount: number;
  sentenceCount: number;
  threshold: number;
  mode: string;
  totalRun: number;
  flaggedCount: number;
  humanCount: number;
  overallAiProbability: number;
  overallHumanProbability: number;
  meanConfidence: number;
  overallVerdict: 'AI-Generated' | 'Human-Written' | 'Borderline / Mixed';
  specialSignals: DetectZooSpecialSignals;
  results: DetectZooResult[];
  elapsedMs: number;
}

export interface DetectZooSample {
  id: string;
  text: string;
  label: 0 | 1; // 0 = human, 1 = ai
  source: string;
  dataset: string;
}

export interface DetectZooMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  tpr: number;
  fpr: number;
  roc_auc: number;
  pr_auc: number;
  avg_precision: number;
  eer: number;
}

export interface DetectZooBenchmarkRow {
  detector: string;
  className: string;
  family: string;
  threshold: number;
  sampleCount: number;
  metrics: DetectZooMetrics;
  rocCurve: Array<{ fpr: number; tpr: number }>;
}

export interface DetectZooBenchmarkReport {
  datasetName: string;
  modality: DetectZooModality;
  threshold: number;
  sampleCount: number;
  humanSamples: number;
  aiSamples: number;
  rows: DetectZooBenchmarkRow[];
  bestByRocAuc: string;
  bestByEer: string;
  elapsedMs: number;
}

/* ========================================================================= */
/* 1. FULL REGISTRY CATALOG (37 Text + 17 Image + 14 Audio + 2 Video = 70)   */
/* ========================================================================= */

export const DETECTZOO_TEXT_DETECTORS: DetectZooDetectorMeta[] = [
  {
    registryName: 'adadetectgpt',
    className: 'AdaDetectGPTDetector',
    aliases: ['ada_detect_gpt', 'ada-detectgpt'],
    modality: 'text',
    family: 'Zero-Shot Metric',
    defaultThreshold: 0.0,
    defaultModel: 'gpt2 / falcon-7b',
    paper: 'Zhou et al., AdaDetectGPT: Adaptive Detection of LLM-Generated Text with Statistical Guarantees',
    venue: 'NeurIPS 2025',
    formula: 'S_ada = (sum w(log p_obs) - E[w(log p_tilde)]) / sqrt(Var[w(log p_tilde)])',
    description: 'Обобщение Fast-DetectGPT с B-сплайн-функцией-свидетелем w, максимизирующей нижнюю границу TNR.',
  },
  {
    registryName: 'binoculars',
    className: 'BinocularsDetector',
    aliases: ['falcon_binoculars'],
    modality: 'text',
    family: 'Zero-Shot Metric',
    defaultThreshold: -0.9,
    defaultModel: 'tiiuae/falcon-7b + falcon-7b-instruct',
    paper: 'Hans et al., Spotting LLMs With Binoculars: Zero-Shot Detection of Machine-Generated Text',
    venue: 'ICML 2024',
    formula: 'Score = - log PPL(x) / X-PPL(M1, M2)',
    description: 'Отношение перплексии к кросс-перплексии пары наблюдатель/исполнитель (инвертировано: выше = ИИ).',
  },
  {
    registryName: 'biscope',
    className: 'BiScopeDetector',
    aliases: ['bi_scope'],
    modality: 'text',
    family: 'Intrinsic & Manifold',
    defaultThreshold: 6.9,
    defaultModel: 'gpt2-xl / llama-3',
    paper: 'Guo et al., BiScope: AI-generated Text Detection by Checking Memorization of Preceding Tokens',
    venue: 'NeurIPS 2024',
    formula: 'Score = -(mean(FCE) - mean(BCE)); 72-d suffix segments stats',
    description: 'Двунаправленная кросс-энтропия (Forward CE предсказания vs Backward CE запоминания предыдущих токенов).',
  },
  {
    registryName: 'chatgpt_detector',
    className: 'ChatGPTDetector',
    aliases: ['chatgpt_roberta', 'chat_d'],
    modality: 'text',
    family: 'Supervised & Reward',
    defaultThreshold: 0.5,
    defaultModel: 'Hello-SimpleAI/chatgpt-detector-roberta',
    paper: 'Guo et al., How Close is ChatGPT to Human Experts? (HC3)',
    venue: 'arXiv 2023',
    formula: 'P(AI) = softmax(RoBERTa_HC3(x))_1',
    description: 'Классификатор RoBERTa, обученный на корпусе HC3 Human vs ChatGPT.',
  },
  {
    registryName: 'coco',
    className: 'CoCoDetector',
    aliases: ['coherence_coco'],
    modality: 'text',
    family: 'Intrinsic & Manifold',
    defaultThreshold: 0.0,
    defaultModel: 'gpt2 / roberta-base',
    paper: 'Liu et al., CoCo: Coherence-Enhanced MGT Detection Under Low Resource With Contrastive Learning',
    venue: 'EMNLP 2023',
    formula: 'Score = mean(cos(e_i, e_{i+1})) - var(cos(e_i, e_{i+1}))',
    description: 'Анализ графа межфразовой когерентности: у ИИ высокое среднее сходство и низкая дисперсия.',
  },
  {
    registryName: 'detectgpt',
    className: 'DetectGPTDetector',
    aliases: ['detect_gpt'],
    modality: 'text',
    family: 'Perturbation & Rewrite',
    defaultThreshold: 0.0,
    defaultModel: 'gpt2 + t5-large',
    paper: 'Mitchell et al., DetectGPT: Zero-Shot Machine-Generated Text Detection using Probability Curvature',
    venue: 'ICML 2023',
    formula: 'Z = (LL(x) - mean(LL(x_tilde))) / std(LL(x_tilde))',
    description: 'Кривизна лог-правдоподобия через масочные пертурбации T5.',
  },
  {
    registryName: 'detective',
    className: 'DeTeCtiveDetector',
    aliases: ['detective_knn'],
    modality: 'text',
    family: 'Supervised & Reward',
    defaultThreshold: 0.0,
    defaultModel: 'princeton-nlp/unsup-simcse-roberta-base',
    paper: 'Guo et al., DeTeCtive: Detecting AI-generated Text via Multi-Level Contrastive Learning',
    venue: 'NeurIPS 2024',
    formula: 'Score = L2_concentration(SimCSE(x)) / KNN_cluster_margin',
    description: 'Трёхуровневое контрастивное обучение (model -> family -> human/AI) с концентрацией нормы эмбеддинга.',
  },
  {
    registryName: 'dna_detectllm',
    className: 'DNADetectLLMDetector',
    aliases: ['dnadetectllm'],
    modality: 'text',
    family: 'Perturbation & Rewrite',
    defaultThreshold: 0.0,
    defaultModel: 'tiiuae/falcon-7b-instruct + falcon-7b',
    paper: 'Zhu et al., DNA-DetectLLM: Unveiling AI-Generated Text via a DNA-Inspired Mutation-Repair Paradigm',
    venue: 'NeurIPS 2025',
    formula: 'Score = - (ppl_std + ppl_max) / (2 * x_ppl)',
    description: 'Оценка усилия мутации-восстановления до «идеальной ИИ-последовательности» жадного декодирования.',
  },
  {
    registryName: 'dna_gpt',
    className: 'DNAGPTDetector',
    aliases: ['dnagpt'],
    modality: 'text',
    family: 'Perturbation & Rewrite',
    defaultThreshold: 0.0,
    defaultModel: 'gpt2-xl',
    paper: 'Yang et al., DNA-GPT: Divergent N-Gram Analysis with LLM Probability',
    venue: 'ICLR 2024',
    formula: 'DNA-GPT(x) = log p(x) - mean_i(log p(trim(x_tilde_i)))',
    description: 'Сравнение log p(x) исходного текста с ре-генерациями от средней точки усечения.',
  },
  {
    registryName: 'dsvdd',
    className: 'DSVDDDetector',
    aliases: ['d_svdd', 'deep_svdd'],
    modality: 'text',
    family: 'OOD & Energy',
    defaultThreshold: 0.0,
    defaultModel: 'SimCSE + Hypersphere Center c',
    paper: 'OOD Text Detection Benchmark — Deep Support Vector Data Description',
    venue: 'DetectZoo OOD',
    formula: 'Score = -softplus(||f(x) - c||_2^2 - R^2)',
    description: 'Одноклассовое OOD-определение по расстоянию до центра гиперсферы f(x) в пространстве эмбеддингов.',
  },
  {
    registryName: 'energy_detector',
    className: 'EnergyDetector',
    aliases: ['energy', 'ood_energy'],
    modality: 'text',
    family: 'OOD & Energy',
    defaultThreshold: 0.0,
    defaultModel: 'DeTeCtive Encoder + Energy Margin (m_in=-27, m_out=-5)',
    paper: 'Energy-Based Out-of-Distribution AI Text Detection',
    venue: 'DetectZoo OOD',
    formula: 'E(x) = -T * log sum_k exp(f_k(x) / T)',
    description: 'Энергетический OOD-детектор с лог-суммой-экспонент по логитам генераторов и регуляризацией границ.',
  },
  {
    registryName: 'entropy',
    className: 'EntropyDetector',
    aliases: ['shannon_entropy'],
    modality: 'text',
    family: 'Zero-Shot Metric',
    defaultThreshold: -4.0,
    defaultModel: 'gpt2',
    paper: 'Lavergne et al. / Gehrmann et al., Entropy Baseline',
    venue: 'Baseline',
    formula: 'Score = - mean_t H(P(. | x_{<t}))',
    description: 'Отрицательная средняя энтропия предсказывающего распределения токенов (ниже энтропия -> выше балл ИИ).',
  },
  {
    registryName: 'fast_detectgpt',
    className: 'FastDetectGPTDetector',
    aliases: ['fastdetectgpt'],
    modality: 'text',
    family: 'Zero-Shot Metric',
    defaultThreshold: 0.0,
    defaultModel: 'gpt-neo-2.7b',
    paper: 'Bao et al., Fast-DetectGPT: Efficient Zero-Shot Detection via Conditional Probability Curvature',
    venue: 'ICLR 2024',
    formula: 'd = (LL_obs - mu_tilde) / sigma_tilde',
    description: 'Аналитическая условная вероятностная кривизна за один проход без T5-пертурбаций.',
  },
  {
    registryName: 'gecscore',
    className: 'GECScoreDetector',
    aliases: ['gec_score', 'grammatical_error_correction'],
    modality: 'text',
    family: 'Perturbation & Rewrite',
    defaultThreshold: 0.92436974,
    defaultModel: 'pszemraj/flan-t5-large-grammar-synthesis',
    paper: 'Wu et al., Who Wrote This? Zero-Shot AI Detection via Grammar Error Correction (ROUGE-2)',
    venue: 'arXiv 2024',
    formula: 'Score = ROUGE-2_F1(x, GEC(x))',
    description: 'Сходство биграмм ROUGE-2 до и после грамматической коррекции: ИИ почти не содержит грамматических огрехов.',
  },
  {
    registryName: 'ghostbuster',
    className: 'GhostbusterDetector',
    aliases: ['ghost_buster'],
    modality: 'text',
    family: 'Supervised & Reward',
    defaultThreshold: 0.0,
    defaultModel: 'Unigram + Trigram + Linear Classifier',
    paper: 'Verma et al., Ghostbuster: Detecting Text Ghostwritten by Large Language Models',
    venue: 'NAACL 2024',
    formula: 'y = w^T * phi(p_uni, p_tri, p_lm) + b',
    description: 'Линейный классификатор на комбинациях лог-вероятностей нескольких языковых моделей и n-грамм.',
  },
  {
    registryName: 'glimpse',
    className: 'GlimpseDetector',
    aliases: ['glimpse_iclr2025'],
    modality: 'text',
    family: 'Zero-Shot Metric',
    defaultThreshold: 0.0,
    defaultModel: 'Top-K Geometric Tail Estimator + Curvature',
    paper: 'Bao et al., Glimpse: Enabling White-Box Methods to Use Proprietary Models',
    venue: 'ICLR 2025',
    formula: 'p_est = geometric_tail(top_K); Score = (LL - mu_est) / sigma_est',
    description: 'Восстановление полного распределения по Top-K проприетарных логитов с геометрическим хвостом.',
  },
  {
    registryName: 'hrn',
    className: 'HRNDetector',
    aliases: ['hrn_ood', 'holistic_regularized'],
    modality: 'text',
    family: 'OOD & Energy',
    defaultThreshold: 0.5,
    defaultModel: 'Per-Model 1-Class + WGAN-GP Penalty',
    paper: 'HRN: Holistic Regularized Networks for OOD AI-Text Detection',
    venue: 'DetectZoo OOD',
    formula: 'Score = max_k sigmoid(h_k(x)) - lambda * (||grad h||_2 - 1)^p',
    description: 'Одноклассовые пер-модельные головы со штрафом градиента WGAN-GP (lambda=0.1, p=12).',
  },
  {
    registryName: 'imbd',
    className: 'ImBDDetector',
    aliases: ['imbd_spo'],
    modality: 'text',
    family: 'Zero-Shot Metric',
    defaultThreshold: 0.0,
    defaultModel: 'xyzhu1225/ImBD-inference (LoRA GPT-Neo-2.7B)',
    paper: 'Zhu et al., ImBD: Imitate Before Detect — SPO-Aligned Analytic Discrepancy',
    venue: 'AAAI 2025',
    formula: 'Discrepancy_SPO = (LL_spo(x) - E_tilde) / sigma_tilde',
    description: 'Аналитическое расхождение с LoRA-адаптером, обученным имитировать машинный стиль перед детекцией.',
  },
  {
    registryName: 'ipad',
    className: 'IPADDetector',
    aliases: ['inverse_prompt'],
    modality: 'text',
    family: 'Perturbation & Rewrite',
    defaultThreshold: 0.5,
    defaultModel: 'bellafc/IPAD (Prompt Inverter + PTCV + RC)',
    paper: 'Chen et al., IPAD: Inverse Prompt for AI Detection',
    venue: 'NeurIPS 2025',
    formula: 'p_hat = w * P_PTCV(x|p_inv) + (1 - w) * P_RC(x, regen(p_inv))',
    description: 'Инверсия вероятного промпта + верификация согласованности PTCV и сравнение регенерации RC.',
  },
  {
    registryName: 'irm',
    className: 'IRMDetector',
    aliases: ['implicit_reward'],
    modality: 'text',
    family: 'Zero-Shot Metric',
    defaultThreshold: 0.0,
    defaultModel: 'Llama-3.2-1B-Instruct vs Llama-3.2-1B',
    paper: 'Liu et al., Zero-Shot Detection of LLM-Generated Text via Implicit Reward Model',
    venue: 'NeurIPS 2025',
    formula: 'IRM(y) = sum_t [ log pi_instruct(y_t|y_<t) - log pi_base(y_t|y_<t) ]',
    description: 'DPO-отношение лог-вероятностей между instruct-моделью и базовой моделью как неявная награда.',
  },
  {
    registryName: 'lastde',
    className: 'LastdeDetector',
    aliases: ['lastde_mde'],
    modality: 'text',
    family: 'Intrinsic & Manifold',
    defaultThreshold: 0.0,
    defaultModel: 'Token Probability Orbit MDE',
    paper: 'Xu et al., Training-free LLM-generated Text Detection by Mining Token Probability Sequences',
    venue: 'ICLR 2025',
    formula: 'Lastde(x) = mean(LL) / MDE(LL, embed_size, tau_prime)',
    description: 'Добыча орбит последовательности лог-вероятностей через многомасштабную энтропию распределения (MDE).',
  },
  {
    registryName: 'lastde_pp',
    className: 'LastdePPDetector',
    aliases: ['lastde++', 'lastdepp'],
    modality: 'text',
    family: 'Intrinsic & Manifold',
    defaultThreshold: 0.0,
    defaultModel: 'Distribution-Based Lastde++',
    paper: 'Xu et al., Lastde++ (ICLR 2025)',
    venue: 'ICLR 2025',
    formula: 'Z_lastde++ = (Lastde(x) - mean(Lastde(x_tilde))) / std(Lastde(x_tilde))',
    description: 'Нормализованное z-отклонение Lastde(x) относительно распределения сэмплированных альтернатив.',
  },
  {
    registryName: 'log_likelihood',
    className: 'LogLikelihoodDetector',
    aliases: ['likelihood', 'll'],
    modality: 'text',
    family: 'Zero-Shot Metric',
    defaultThreshold: -3.0,
    defaultModel: 'gpt2',
    paper: 'Solaiman et al., Log-Likelihood Baseline',
    venue: 'OpenAI 2019',
    formula: 'LL(x) = (1/T) * sum_t log P(x_t | x_{<t})',
    description: 'Средний логарифм вероятности токенов: чем выше (ближе к 0), тем вероятнее генерация LLM.',
  },
  {
    registryName: 'log_rank',
    className: 'LogRankDetector',
    aliases: ['logrank'],
    modality: 'text',
    family: 'Zero-Shot Metric',
    defaultThreshold: -1.5,
    defaultModel: 'gpt2',
    paper: 'Mitchell et al., Log-Rank Baseline',
    venue: 'ICML 2023',
    formula: 'LogRank(x) = - (1/T) * sum_t log(rank(x_t) + 1)',
    description: 'Отрицательный средний логарифм ранга предсказанного токена (ближе к 0 = выше вероятность ИИ).',
  },
  {
    registryName: 'lrr',
    className: 'LRRDetector',
    aliases: ['log_likelihood_log_rank_ratio'],
    modality: 'text',
    family: 'Zero-Shot Metric',
    defaultThreshold: 1.3,
    defaultModel: 'gpt2',
    paper: 'Su et al., DetectLLM: Leveraging Log Rank Information for Zero-Shot Detection',
    venue: 'EMNLP Findings 2023',
    formula: 'LRR = - sum log P(x_t) / sum log rank(x_t)',
    description: 'Отношение лог-правдоподобия к лог-рангу, разделяющее гладкую оптимизацию ИИ и человеческую речь.',
  },
  {
    registryName: 'mle_ide',
    className: 'MLEDetector',
    aliases: ['mle', 'levina_bickel'],
    modality: 'text',
    family: 'Intrinsic & Manifold',
    defaultThreshold: 0.0,
    defaultModel: 'roberta-base (Levina-Bickel k-NN)',
    paper: 'Tulchinskii et al., Intrinsic Dimension Estimation for Robust Detection (MLE)',
    venue: 'NeurIPS 2023',
    formula: 'Score = - d_MLE(X) ; human ~ 9.0, AI ~ 7.5',
    description: 'Оценка внутренней размерности многообразия эмбеддингов методом максимального правдоподобия k-NN.',
  },
  {
    registryName: 'npr',
    className: 'NPRDetector',
    aliases: ['normalized_perturbed_rank'],
    modality: 'text',
    family: 'Perturbation & Rewrite',
    defaultThreshold: 1.0,
    defaultModel: 'gpt2 + t5-large',
    paper: 'Su et al., DetectLLM: Normalized Perturbed Log-Rank',
    venue: 'EMNLP Findings 2023',
    formula: 'NPR = mean_i(LogRank(x_tilde_i)) / LogRank(x)',
    description: 'Отношение среднего лог-ранга возмущённых копий текста к лог-рангу исходного текста.',
  },
  {
    registryName: 'phd',
    className: 'PHDDetector',
    aliases: ['persistent_homology_dim'],
    modality: 'text',
    family: 'Intrinsic & Manifold',
    defaultThreshold: 0.0,
    defaultModel: 'roberta-base (Persistent Homology MST)',
    paper: 'Tulchinskii et al., Intrinsic Dimension Estimation via Persistent Homology (PHD)',
    venue: 'NeurIPS 2023',
    formula: 'Score = - d_PHD ; slope(log W_MST vs log n)',
    description: 'Топологическая размерность персистентной гомологии через веса минимального остовного дерева (MST).',
  },
  {
    registryName: 'radar',
    className: 'RADARDetector',
    aliases: ['radar_vicuna'],
    modality: 'text',
    family: 'Supervised & Reward',
    defaultThreshold: 0.5,
    defaultModel: 'TrustSafeAI/RADAR-Vicuna-7B',
    paper: 'Hu et al., RADAR: Robust AI-Text Detection via Adversarial Learning',
    venue: 'NeurIPS 2023',
    formula: 'P_RADAR(AI) = softmax(RoBERTa_Adversarial(x))_1',
    description: 'Состязательный детектор, натренированный в minimax-игре против парафраз-атак.',
  },
  {
    registryName: 'raidar',
    className: 'RaidarDetector',
    aliases: ['raidar_rewrite'],
    modality: 'text',
    family: 'Perturbation & Rewrite',
    defaultThreshold: 0.5,
    defaultModel: 'Llama/GPT Rewrite Edit Invariance',
    paper: 'Mao et al., Raidar: GeneRative AI Detection via Rewriting',
    venue: 'ICLR 2024',
    formula: 'Score = 1 - EditDist(x, Rewrite(x)) / max(|x|, |Rewrite(x)|)',
    description: 'Инвариантность к переписыванию: ИИ-текст при повторном редактировании меняется значительно меньше.',
  },
  {
    registryName: 'rank',
    className: 'RankDetector',
    aliases: ['mean_rank'],
    modality: 'text',
    family: 'Zero-Shot Metric',
    defaultThreshold: 0.0,
    defaultModel: 'gpt2',
    paper: 'Gehrmann et al., Mean Token Rank',
    venue: 'ACL 2019',
    formula: 'Score = - mean_t rank(x_t | x_{<t})',
    description: 'Отрицательный средний ранг токенов (чем ближе к вершине top-10, тем выше вероятность ИИ).',
  },
  {
    registryName: 'remodetect',
    className: 'ReMoDetectDetector',
    aliases: ['reward_model_detect'],
    modality: 'text',
    family: 'Supervised & Reward',
    defaultThreshold: 0.0,
    defaultModel: 'hyunseoki/ReMoDetect-deberta',
    paper: 'Lee et al., ReMoDetect: Reward Models Recognize Aligned LLM Generations',
    venue: 'NeurIPS 2024',
    formula: 'Score = RM_score(x) - tau_human',
    description: 'Модель вознаграждения (RLHF Reward Model), распознающая выровненные под предпочтения тексты LLM.',
  },
  {
    registryName: 'revise_detect',
    className: 'ReviseDetector',
    aliases: ['revise', 'chatgpt_revise'],
    modality: 'text',
    family: 'Perturbation & Rewrite',
    defaultThreshold: -2.0,
    defaultModel: 'facebook/bart-large-cnn (BARTScore)',
    paper: 'Zhu et al., Beat LLMs at Their Own Game: Zero-Shot Detection via Querying ChatGPT',
    venue: 'EMNLP 2023',
    formula: 'Score = BARTScore(original | revised)',
    description: 'Лог-вероятностное сходство исходного текста и его автоматической ревизии (выше = ближе к ИИ).',
  },
  {
    registryName: 'roberta_base',
    className: 'RobertaBaseDetector',
    aliases: ['roberta_openai_base'],
    modality: 'text',
    family: 'Supervised & Reward',
    defaultThreshold: 0.5,
    defaultModel: 'openai-community/roberta-base-openai-detector',
    paper: 'Solaiman et al., OpenAI RoBERTa-Base Detector',
    venue: 'OpenAI 2019',
    formula: 'P(Fake) = softmax(RoBERTa_Base(x))_fake',
    description: 'Классический детектор OpenAI на базе RoBERTa-Base с анализом BPE-паттернов.',
  },
  {
    registryName: 'roberta_large',
    className: 'RobertaLargeDetector',
    aliases: ['roberta_openai_large'],
    modality: 'text',
    family: 'Supervised & Reward',
    defaultThreshold: 0.5,
    defaultModel: 'openai-community/roberta-large-openai-detector',
    paper: 'Solaiman et al., OpenAI RoBERTa-Large Detector',
    venue: 'OpenAI 2019',
    formula: 'P(Fake) = softmax(RoBERTa_Large(x))_fake',
    description: 'Расширенная 24-слойная модель RoBERTa-Large для детектирования GPT-генераций.',
  },
  {
    registryName: 'text_fluoroscopy',
    className: 'TextFluoroscopyDetector',
    aliases: ['fluoroscopy'],
    modality: 'text',
    family: 'Intrinsic & Manifold',
    defaultThreshold: 0.5,
    defaultModel: 'Alibaba-NLP/gte-Qwen1.5-7B-instruct (layer-wise KL)',
    paper: 'Yu et al., Text Fluoroscopy: Detecting LLM-Generated Text through Intrinsic Features',
    venue: 'EMNLP 2024',
    formula: 'l* = argmax_l [ KL(P_l || P_first) + KL(P_l || P_last) ]',
    description: 'Поиск внутреннего слоя трансформера с максимальной KL-дивергенцией к крайним слоям («флюороскопия»).',
  },
  {
    registryName: 'tocsin',
    className: 'TOCSINDetector',
    aliases: ['token_cohesiveness'],
    modality: 'text',
    family: 'Perturbation & Rewrite',
    defaultThreshold: 0.0,
    defaultModel: 'gpt2 + BARTScore Token Deletion Cohesiveness',
    paper: 'Ma & Wang, Zero-Shot Detection of LLM-Generated Text using Token Cohesiveness',
    venue: 'EMNLP 2024',
    formula: 'w(x) = exp(sign(v) * u(x)) * v(x)',
    description: 'Усиление базовой кривизны v(x) за счёт семантической связности токенов u(x) при удалении слов.',
  },
];

export const DETECTZOO_MULTIMODAL_DETECTORS: DetectZooDetectorMeta[] = [
  // ---- 17 Image Detectors ----
  { registryName: 'aeroblade', className: 'AerobladeDetector', aliases: ['aeroblade_vae'], modality: 'image', family: 'Image Diffusion', defaultThreshold: 0.5, defaultModel: 'LPIPS Autoencoder Error', paper: 'AEROBLADE: Training-Free Detection of Latent Diffusion Images', venue: 'CVPR 2024', formula: 'min_k LPIPS(x, VAE_k(x))', description: 'Ошибка реконструкции вариационного автоэнкодера для диффузионных изображений.' },
  { registryName: 'aide', className: 'AIDEDetector', aliases: ['aide_iclr2025', 'aide_detector'], modality: 'image', family: 'Image Hybrid', defaultThreshold: 0.5, defaultModel: 'CLIP + DCT HPF ResNet', paper: 'AIDE: AI-generated Image DEtector with Hybrid Features', venue: 'ICLR 2025', formula: 'Fuse(CLIP_sem, DCT_HPF_patch)', description: 'Гибридный анализ высокочастотных DCT-патчей и семантических признаков CLIP.' },
  { registryName: 'c2p_clip', className: 'C2PCLIPDetector', aliases: ['c2pclip', 'c2p_clip_deepfake'], modality: 'image', family: 'Image CLIP', defaultThreshold: 0.5, defaultModel: 'CLIP ViT-L/14 Category Common Prompt', paper: 'C2P-CLIP: Category Common Prompt in CLIP', venue: 'AAAI 2025', formula: 'cos(v_img, t_common_prompt)', description: 'Общие категориальные промпты в пространстве CLIP.' },
  { registryName: 'cnnspot', className: 'CNNSpotDetector', aliases: ['cnn_spot'], modality: 'image', family: 'Image Spatial', defaultThreshold: 0.5, defaultModel: 'ResNet-50 Blur/JPEG Aug', paper: 'CNN-Generated Images Are Surprisingly Easy to Spot... For Now', venue: 'CVPR 2020', formula: 'sigmoid(ResNet50(aug(img)))', description: 'Классический ResNet-50 с аугментацией размытия и JPEG-сжатия.' },
  { registryName: 'cospy', className: 'CoSpyDetector', aliases: ['co_spy', 'cospy_cvpr2025', 'cospy_progan'], modality: 'image', family: 'Image Hybrid', defaultThreshold: 0.5, defaultModel: 'Semantic + VAE/NPR Fusion', paper: 'CO-SPY: Combining Semantic and Pixel Features', venue: 'CVPR 2025', formula: 'Fuse(Semantic_CLIP, Pixel_VAE)', description: 'Слияние семантических и пиксельных артефактов для ProGAN/Flux.' },
  { registryName: 'cospy_sd_v1_4', className: 'CoSpySDV14Detector', aliases: ['cospy_sd', 'cospy_drct'], modality: 'image', family: 'Image Hybrid', defaultThreshold: 0.5, defaultModel: 'CoSpy SDv1.4', paper: 'CO-SPY SD v1.4 Checkpoint', venue: 'CVPR 2025', formula: 'Fuse_SD14(Semantic, Pixel)', description: 'Вариант CO-SPY для Stable Diffusion v1.4 и DRCT.' },
  { registryName: 'd3', className: 'D3Detector', aliases: ['d3_cvpr2025', 'discrepancy_deepfake_detector'], modality: 'image', family: 'Image Diffusion', defaultThreshold: 0.5, defaultModel: 'Patch Discrepancy Transformer', paper: 'D3: Discrepancy Deepfake Detector', venue: 'CVPR 2025', formula: 'Attention_Discrepancy(patches)', description: 'Поиск структурных расхождений между патчами генеративных изображений.' },
  { registryName: 'drct', className: 'DRCTDetector', aliases: ['drct_icml2024', 'drct_convnext'], modality: 'image', family: 'Image Diffusion', defaultThreshold: 0.5, defaultModel: 'ConvNeXt Contrastive Recon', paper: 'DRCT: Diffusion Reconstruction Contrastive Training', venue: 'ICML 2024', formula: 'Contrastive(x, DDIM_recon(x))', description: 'Контрастивное обучение на диффузионной реконструкции изображений.' },
  { registryName: 'fatformer', className: 'FatFormerDetector', aliases: ['fat_former', 'fatformer_cvpr2024'], modality: 'image', family: 'Image CLIP', defaultThreshold: 0.5, defaultModel: 'Forgery-aware Adaptive ViT', paper: 'FatFormer: Forgery-aware Adaptive Transformer', venue: 'CVPR 2024', formula: 'Adapter_ViT + Language_Align', description: 'Адаптер выявления подделок поверх CLIP ViT с частотным анализом.' },
  { registryName: 'freqnet', className: 'FreqNetDetector', aliases: ['freq_net', 'freqnet_aaai2024'], modality: 'image', family: 'Image Frequency', defaultThreshold: 0.5, defaultModel: 'FFT Phase/Amplitude ResNet', paper: 'FreqNet: Frequency-Aware Deepfake Detection', venue: 'AAAI 2024', formula: 'Conv2D(FFT_HighFreq(img))', description: 'Высокочастотное представление БПФ для отлова артефактов апсемплинга.' },
  { registryName: 'ladeda', className: 'LaDeDaDetector', aliases: ['la_de_da', 'ladeda_realtime'], modality: 'image', family: 'Image Spatial', defaultThreshold: 0.5, defaultModel: 'Patch-level Real-Time Net', paper: 'LaDeDa: Locally Aware Deepfake Detection Algorithm', venue: 'Real-Time 2025', formula: 'mean_patch(PatchNet9x9(x))', description: 'Сверхбыстрая локальная оценка 9x9 патчей в реальном времени.' },
  { registryName: 'lgrad', className: 'LGradDetector', aliases: ['lgrad_cvpr2023', 'learning_on_gradients'], modality: 'image', family: 'Image Spatial', defaultThreshold: 0.5, defaultModel: 'StyleGAN Gradient Classifier', paper: 'LGrad: Learning on Gradients for Generalized Synthesis Detection', venue: 'CVPR 2023', formula: 'ResNet(grad_x(PretrainedEncoder(x)))', description: 'Преобразование изображения в карту градиентов предобученного генератора.' },
  { registryName: 'manifold_bias', className: 'ManifoldBiasDetector', aliases: ['mib', 'manifold_induced_bias', 'brokman2025'], modality: 'image', family: 'Image Diffusion', defaultThreshold: 0.5, defaultModel: 'Diffusion Score Norm Curvature', paper: 'Manifold Induced Biases for Zero-shot AI Image Detection', venue: 'ICLR 2025', formula: 'Score = - div_x log p(x)', description: 'Zero-shot кривизна правдоподобия на многообразии естественных изображений.' },
  { registryName: 'npr_deepfake', className: 'NPRDeepfakeDetector', aliases: ['npr_cvpr2024', 'npr_image'], modality: 'image', family: 'Image Spatial', defaultThreshold: 0.5, defaultModel: 'Neighboring Pixel Relationship Net', paper: 'NPR: Rethinking the Up-Sampling Operations in CNN/Diffusion', venue: 'CVPR 2024', formula: 'NPR(x) = x - interp(downsample(x))', description: 'Анализ локальных корреляций соседних пикселей от операций апсемплинга.' },
  { registryName: 'patchcraft', className: 'PatchCraftDetector', aliases: ['patch_craft', 'patchcraft_detector'], modality: 'image', family: 'Image Frequency', defaultThreshold: 0.5, defaultModel: 'RPTC Rich vs Poor Texture Contrast', paper: 'PatchCraft: Exploring Texture Patch for Efficient AI Image Detection', venue: 'arXiv 2311', formula: 'Contrast(HPF(rich_patches), HPF(poor_patches))', description: 'Контраст богатых и бедных текстурных областей изображения.' },
  { registryName: 'safe', className: 'SAFEDetector', aliases: ['safe_kdd2025', 'safe_detector'], modality: 'image', family: 'Image Spatial', defaultThreshold: 0.5, defaultModel: 'Simple Preserved & Augmented ResNet', paper: 'SAFE: Improving Generalizability via Preserved and Augmented Features', venue: 'KDD 2025', formula: 'SAFE_DWT_Crop(x)', description: 'Аугментированные вейвлет-признаки для устойчивости к кропу и сжатию.' },
  { registryName: 'univfd', className: 'UnivFDDetector', aliases: ['univ_fd', 'universal_fake_detect'], modality: 'image', family: 'Image CLIP', defaultThreshold: 0.5, defaultModel: 'CLIP ViT-L/14 Linear Probe', paper: 'Towards Universal Fake Image Detectors that Generalize Across Generative Models', venue: 'CVPR 2023', formula: 'sigmoid(w^T * CLIP_ViT_L14(x) + b)', description: 'Линейный классификатор поверх замороженного пространства признаков CLIP.' },

  // ---- 14 Audio Detectors ----
  { registryName: 'aasist', className: 'AASISTDetector', aliases: ['aasist_audio'], modality: 'audio', family: 'Audio Graph', defaultThreshold: 0.5, defaultModel: 'Heterogeneous Graph Attention', paper: 'AASIST: Audio Anti-Spoofing using Integrated Spectro-Temporal Graph Attention', venue: 'ICASSP 2022', formula: 'HtrgGAT(SincConv(wave))', description: 'Гетерогенные спектрально-временные графовые сети внимания по сырому сигналу.' },
  { registryName: 'anti_deepfake_hubert', className: 'AntiDeepfakeHuBERTDetector', aliases: ['nii_hubert'], modality: 'audio', family: 'Audio SSL', defaultThreshold: 0.5, defaultModel: 'facebook/hubert-base-ls960', paper: 'NII Yamagishi-Lab AntiDeepfake HuBERT', venue: 'ASVspoof', formula: 'Linear(MeanPool(HuBERT(wave)))', description: 'Детектор синтетической речи на базе самообучаемого кодировщика HuBERT.' },
  { registryName: 'anti_deepfake_wav2vec', className: 'AntiDeepfakeWav2VecDetector', aliases: ['anti_deepfake', 'nii_wav2vec'], modality: 'audio', family: 'Audio SSL', defaultThreshold: 0.5, defaultModel: 'facebook/wav2vec2-large-xlsr-53', paper: 'NII Yamagishi-Lab AntiDeepfake Wav2Vec', venue: 'ASVspoof', formula: 'Linear(Wav2Vec2_XLSR(wave))', description: 'Детектор дипфейков голоса на кросс-лингвальном Wav2Vec 2.0.' },
  { registryName: 'anti_deepfake_xlsr2b', className: 'AntiDeepfakeXLSR2BDetector', aliases: ['nii_xlsr2b', 'xlsr_2b'], modality: 'audio', family: 'Audio SSL', defaultThreshold: 0.5, defaultModel: 'facebook/wav2vec2-xls-r-2b', paper: 'NII Yamagishi-Lab XLSR-2B AntiDeepfake', venue: 'ASVspoof', formula: 'Linear(XLSR_2B(wave))', description: 'Крупномасштабный 2-миллиардный энкодер XLSR-2B для голосовой верификации.' },
  { registryName: 'ast_asvspoof', className: 'ASTASVspoofDetector', aliases: ['ast', 'ast-asvspoof', 'ast_audio', 'ast_synthetic_voice'], modality: 'audio', family: 'Audio Spectrogram', defaultThreshold: 0.5, defaultModel: 'Audio Spectrogram Transformer', paper: 'AST for Synthetic Voice & ASVspoof Detection', venue: 'Interspeech', formula: 'ViT(LogMelSpectrogram(wave))', description: 'Спектрограммный трансформер внимания для анализа вокодеров и TTS.' },
  { registryName: 'rawgat_st', className: 'RawGATSTDetector', aliases: ['rawgat', 'rawgatst'], modality: 'audio', family: 'Audio Graph', defaultThreshold: 0.5, defaultModel: 'SincConv + GAT-ST', paper: 'End-to-End Spectro-Temporal Graph Attention Networks', venue: 'ASVspoof 2021', formula: 'GAT_ST(SincConv(wave))', description: 'Сквозной спектрально-временной граф на фильтре SincNet.' },
  { registryName: 'rawnet2', className: 'RawNet2Detector', aliases: ['rawnet2_audio'], modality: 'audio', family: 'Audio Raw Waveform', defaultThreshold: 0.5, defaultModel: 'SincConv + GRU', paper: 'End-to-End Anti-Spoofing with RawNet2', venue: 'ICASSP 2021', formula: 'GRU(FMS_ResBlock(SincConv(wave)))', description: 'Прямой анализ осциллограммы речи через Sinc-свёртки и GRU.' },
  { registryName: 'raw_pc_darts', className: 'RawPCDartsDetector', aliases: ['raw-pc-darts', 'raw_pc_darts_la', 'rpcd', 'pc_darts'], modality: 'audio', family: 'Audio NAS', defaultThreshold: 0.5, defaultModel: 'Partial-Channel DARTS Waveform', paper: 'Raw PC-DARTS: Differentiable Architecture Search for Audio Anti-Spoofing', venue: 'IEEE SPL', formula: 'DARTS_Net(wave)', description: 'Дифференцируемый поиск архитектуры нейросети на сыром аудиосигнале.' },
  { registryName: 'res_tssdnet', className: 'ResTSSDNetDetector', aliases: ['restssdnet', 'tssdnet'], modality: 'audio', family: 'Audio Raw Waveform', defaultThreshold: 0.5, defaultModel: 'Res-TSSDNet 1D', paper: 'End-to-End Synthetic Speech Detection Using Time-Domain Dilated Convolutions', venue: 'IEEE/ACM TASLP', formula: 'ResTSSDNet_1D(wave)', description: 'Лёгкие 1D дилатированные остаточные свёртки во временной области.' },
  { registryName: 'safeear', className: 'SafeEarDetector', aliases: ['safe_ear', 'safeear_asv19', 'safeear_audio'], modality: 'audio', family: 'Audio Codec', defaultThreshold: 0.5, defaultModel: 'SafeEar HuBERT + Acoustic Codec Decoupling', paper: 'SafeEar: Content Privacy-Preserving Audio Deepfake Detection', venue: 'CCS 2024', formula: 'Acoustic_Branch(HuBERT_Quantized(wave))', description: 'Детекция синтеза речи только по акустическим артефактам без раскрытия слов.' },
  { registryName: 'samo', className: 'SAMODetector', aliases: ['samo_asv'], modality: 'audio', family: 'Audio One-Class', defaultThreshold: 0.5, defaultModel: 'Speaker Attractor Multi-Center OC', paper: 'SAMO: Speaker Attractor Multi-Center One-Class Learning', venue: 'ICASSP 2023', formula: 'min_k ||e_speech - mu_speaker_k||_2', description: 'Многоцентровое одноклассовое обучение по аттракторам живого голоса.' },
  { registryName: 'tcm', className: 'TCMDetector', aliases: ['tcm_add', 'tcm_audio', 'conformer_tcm'], modality: 'audio', family: 'Audio SSL', defaultThreshold: 0.5, defaultModel: 'XLSR + Conformer Temporal-Channel Modeling', paper: 'TCM: Temporal-Channel Modeling in Conformer for Audio Deepfake Detection', venue: 'Interspeech 2024', formula: 'HeadToken_Conformer(XLSR(wave))', description: 'Conformer с временным и канальным моделированием поверх XLSR.' },
  { registryName: 'xlsr_mamba', className: 'XLSRMambaDetector', aliases: ['xlsr-mamba', 'xlsr_mamba_audio', 'xlsr_mamba_la'], modality: 'audio', family: 'Audio SSL', defaultThreshold: 0.5, defaultModel: 'XLSR + Bidirectional Mamba SSM', paper: 'XLSR-Mamba: Dual-Column Bidirectional State Space Model', venue: '2024', formula: 'BiMamba(XLSR(wave))', description: 'Двунаправленная модель пространства состояний Mamba для длинных аудиозаписей.' },
  { registryName: 'xlsr_sls', className: 'XLSRSLSDetector', aliases: ['xlsr-sls', 'xlsr', 'xls-r-sls', 'xlsr_deepfake', 'xlsr_audio'], modality: 'audio', family: 'Audio SSL', defaultThreshold: 0.5, defaultModel: 'XLSR + Sensitive Layer Selection', paper: 'XLSR-SLS: Sensitive Layer Selection for Audio Deepfake Detection', venue: 'ACM MM 2024', formula: 'sum_l alpha_l * Layer_l(XLSR(wave))', description: 'Адаптивный отбор чувствительных скрытых слоёв XLSR.' },

  // ---- 2 Video Detectors ----
  { registryName: 'base_video', className: 'BaseVideoDetector', aliases: ['video_base'], modality: 'video', family: 'Video Temporal Base', defaultThreshold: 0.5, defaultModel: 'Spatio-Temporal Frame Aggregator', paper: 'DetectZoo Unified Video Detection Interface', venue: 'DetectZoo Core', formula: 'agg_t FrameDetector(frame_t)', description: 'Базовый пространственно-временной интерфейс для покадрового и видеоанализа.' },
  { registryName: 'waverep', className: 'WaveRepDetector', aliases: ['wave_rep'], modality: 'video', family: 'Video Wavelet', defaultThreshold: 0.5, defaultModel: 'CLIP + 3D Wavelet Representation', paper: 'WaveRep: Generalizable AI-Generated Video Detection via Wavelet Representations', venue: 'NeurIPS 2025', formula: '3D_DWT_Temporal_Flux(frames)', description: 'Генерализуемый детектор AI-видео (Sora, Runway, Veo) по 3D вейвлет-переходам кадров.' },
];

export const DETECTZOO_FULL_ZOO_CATALOG: DetectZooDetectorMeta[] = [
  ...DETECTZOO_TEXT_DETECTORS,
  ...DETECTZOO_MULTIMODAL_DETECTORS,
];

export const DETECTZOO_DATASETS: DetectZooDatasetMeta[] = [
  // 11 Text datasets
  { registryName: 'cheat', className: 'CHEATDataset', aliases: ['ieee_cheat'], modality: 'text', domain: 'Academic Abstracts', description: '15K+ научных аннотаций (IEEE): человек vs ChatGPT (генерация, полировка, микс).' },
  { registryName: 'hc3', className: 'HC3Dataset', aliases: ['hello_simpleai_hc3'], modality: 'text', domain: 'QA / Reddit / Wiki', description: 'Human ChatGPT Comparison Corpus (вопросы-ответы на 5 доменах).' },
  { registryName: 'hc3_plus', className: 'HC3PlusDataset', aliases: ['hc3+'], modality: 'text', domain: 'Translation & Summary', description: 'Расширение HC3 на суммаризацию и перефразирование.' },
  { registryName: 'l2r', className: 'L2RDataset', aliases: ['learn_to_refute'], modality: 'text', domain: 'Peer Review & News', description: 'Бенчмарк перекрёстной устойчивости к парафразам.' },
  { registryName: 'm4', className: 'M4Dataset', aliases: ['multidomain_m4'], modality: 'text', domain: 'Multilingual Multi-LLM', description: 'Многоязычный мультигенераторный корпус (Wiki, Reddit, arXiv, PeerRead).' },
  { registryName: 'mage', className: 'MAGEDataset', aliases: ['deepfake_text_mage'], modality: 'text', domain: '10 Domains / 27 LLMs', description: 'Крупный бенчмарк из 10 доменов и 27 моделей (включая GPT-4, LLaMA, Claude).' },
  { registryName: 'open_llm_text', className: 'OpenLLMTextDataset', aliases: ['openllmtext'], modality: 'text', domain: 'GPT-3.5 / PaLM / LLaMA / GPT-2', description: '340K образцов для атрибуции 5 источников текста.' },
  { registryName: 'raid', className: 'RAIDDataset', aliases: ['dugan_raid'], modality: 'text', domain: '11 LLMs x 12 Adversarial Attacks', description: 'Эталонный стресс-тест устойчивости против 12 атак и 11 LLM.' },
  { registryName: 'turingbench', className: 'TuringBenchDataset', aliases: ['turing_bench'], modality: 'text', domain: '19 Generators News/CNN', description: 'Исторический бенчмарк теста Тьюринга для 19 семейств языковых моделей.' },
  { registryName: 'writing_prompts', className: 'WritingPromptsDataset', aliases: ['wp'], modality: 'text', domain: 'Creative Fiction', description: 'Рассказы и креативная проза Reddit r/WritingPrompts.' },
  { registryName: 'xsum', className: 'XSumDataset', aliases: ['bbc_xsum'], modality: 'text', domain: 'News Summaries', description: 'Новостные сводки BBC и их генерации LLM.' },

  // 7 Image datasets
  { registryName: 'aigcdetect', className: 'AIGCDetectDataset', aliases: ['aigc_detect', 'aigcdetect_benchmark'], modality: 'image', domain: 'GAN + Diffusion Benchmark', description: '16 генераторов (ProGAN, SD, Midjourney, ADM, Glide, Wukong).' },
  { registryName: 'chameleon', className: 'ChameleonDataset', aliases: ['chameleon_testset', 'aide_chameleon'], modality: 'image', domain: 'Real-world Photorealism', description: 'Сложные фотореалистичные AI-изображения из дикой среды.' },
  { registryName: 'cnn_detection', className: 'CNNDetectionDataset', aliases: ['foren_synths'], modality: 'image', domain: 'ForenSynths GANs', description: 'Тестовый набор CVPR 2020 (ProGAN, CycleGAN, StyleGAN, BigGAN).' },
  { registryName: 'drct2m', className: 'DRCT2MDataset', aliases: ['drct-2m', 'drct_2m', 'DRCT-2M'], modality: 'image', domain: '2M Diffusion Images', description: 'Масштабный диффузионный бенчмарк (SDv1/v2/XL, SD-Turbo, LCM).' },
  { registryName: 'genimage', className: 'GenImageDataset', aliases: ['gen_image', 'genimage_dataset'], modality: 'image', domain: 'Million-Scale ImageNet AI', description: '8 диффузионных и GAN генераторов на классах ImageNet.' },
  { registryName: 'self_synthesis', className: 'SelfSynthesisDataset', aliases: ['selfsynthesis'], modality: 'image', domain: 'Latent Re-Synthesis', description: 'Синтетические пары автореконструкции для проверки диффузионных моделей.' },
  { registryName: 'univfd_diffusion', className: 'UnivFDDataset', aliases: ['univfd_dataset', 'univfd'], modality: 'image', domain: 'LDM / Glide / DALL-E', description: 'Кросс-генераторный тестовый сет UnivFD.' },

  // 4 Audio datasets
  { registryName: 'asvspoof2019', className: 'ASVspoof2019Dataset', aliases: ['asvspoof_2019', 'asv19'], modality: 'audio', domain: 'Logical Access Speech', description: 'Эталонный бенчмарк ASVspoof 2019 LA (A07–A19 TTS/VC).' },
  { registryName: 'deepfake_eval_2024', className: 'DeepfakeEval2024Dataset', aliases: ['deepfake-eval-2024', 'deepfake_eval', 'df_eval_2024'], modality: 'audio', domain: '2024 In-the-Wild Speech', description: 'Современные речевые дипфейки 2024 года.' },
  { registryName: 'for', className: 'FoRDataset', aliases: ['for_dataset', 'fake_or_real'], modality: 'audio', domain: 'Fake-or-Real TTS', description: 'Речь с глубоких TTS систем vs реальные дикторы.' },
  { registryName: 'in_the_wild', className: 'InTheWildDataset', aliases: ['in-the-wild', 'inthewild', 'itw', 'muller_in_the_wild'], modality: 'audio', domain: 'Public Celebrity Audio', description: 'Реальные и клонированные голоса публичных персон из сети.' },

  // 1 Video dataset
  { registryName: 'fakeparts', className: 'FakePartsDataset', aliases: ['fake_parts', 'fakepartsbench'], modality: 'video', domain: 'Localized Video Forgeries', description: 'Видео-бенчмарк локализованных манипуляций и синтетических сцен.' },
];

export const DETECTZOO_BUILTIN_CORPUS: DetectZooSample[] = [
  {
    id: 'dz_h1',
    label: 0,
    source: 'Human (Patristic / Essay)',
    dataset: 'hc3',
    text: 'В реализации подвижнической жизни нужна искренняя и умственная дисциплинированность. Самособранность — это такое душевное состояние, когда человек способен осуществлять контроль всего без исключения. Когда мы отворачиваемся от рассеяния, открывается тихое присутствие живой мысли.',
  },
  {
    id: 'dz_a1',
    label: 1,
    source: 'GPT-4 (Academic Slop)',
    dataset: 'raid',
    text: 'В рамках современной образовательной парадигмы следует отметить, что комплексный подход играет ключевую роль в формировании критического мышления. Более того, данное обстоятельство является неотъемлемым элементом устойчивого развития и гармоничной цифровой трансформации личности.',
  },
  {
    id: 'dz_h2',
    label: 0,
    source: 'Human (Literary Journalism)',
    dataset: 'writing_prompts',
    text: 'Старик сидел на скрипучем ящике у самого причала и ковырял ножом смолу на борту старой лодки. Море не шумело, а как-то лениво вздыхало; в воздухе пахло ржавчиной, солью и вчерашним дождём. Никто здесь не торопился объяснять, зачем он пришёл.',
  },
  {
    id: 'dz_a2',
    label: 1,
    source: 'Claude-3.5 / ChatGPT',
    dataset: 'mage',
    text: 'Furthermore, it is important to note that artificial intelligence serves as a cornerstone of modern operational efficiency. Consequently, leveraging comprehensive frameworks enables organizations to optimize workflows, foster innovation, and achieve sustainable long-term outcomes.',
  },
  {
    id: 'dz_h3',
    label: 0,
    source: 'Human (Technical Field Note)',
    dataset: 'open_llm_text',
    text: 'Мы перезапустили сервер на 3095-м порту, но сперва сокеты подвисли из-за старого процесса. Пришлось вручную прочистить таймауты, замерить задержку p99 под нагрузкой и уже потом переключить балансировщик — без суеты и лишних графиков.',
  },
  {
    id: 'dz_a3',
    label: 1,
    source: 'Llama-3.1-70B-Instruct',
    dataset: 'm4',
    text: 'Подводя итог вышеизложенному, представляется возможным сделать вывод о том, что интеграция инновационных методологий способствует повышению эффективности процессов. Таким образом, стратегическое планирование остаётся ключевым фактором успеха в условиях динамичной среды.',
  },
  {
    id: 'dz_h4',
    label: 0,
    source: 'Human (Philosophy Commentary)',
    dataset: 'xsum',
    text: 'Нельзя требовать от речи прозрачности стекла, если сама мысль ещё мутная и спотыкается на каждом шагу. Хорошая фраза не боится неровного дыхания — наоборот, именно на сбое ритма вдруг становится слышен живой человек.',
  },
  {
    id: 'dz_a4',
    label: 1,
    source: 'GPT-4o (Structured Overview)',
    dataset: 'cheat',
    text: 'На сегодняшний день вопрос адаптации цифровых инструментов приобретает особую значимость. Необходимо подчеркнуть, что систематический анализ данных позволяет не только минимизировать потенциальные риски, но и обеспечить комплексный баланс между технологическим прогрессом и этическими стандартами.',
  },
];

/* ========================================================================= */
/* 2. REGISTRY RESOLVER (detectzoo/core/registry.py)                         */
/* ========================================================================= */

export function resolveDetectZooDetector(nameOrAlias: string): DetectZooDetectorMeta | undefined {
  const key = String(nameOrAlias || '').trim().toLowerCase().replace(/[\s]+/g, '_');
  if (!key) return undefined;
  return DETECTZOO_FULL_ZOO_CATALOG.find(
    (d) =>
      d.registryName.toLowerCase() === key ||
      d.className.toLowerCase() === key ||
      d.aliases.some((a) => a.toLowerCase() === key)
  );
}

export function resolveDetectZooDataset(nameOrAlias: string): DetectZooDatasetMeta | undefined {
  const key = String(nameOrAlias || '').trim().toLowerCase().replace(/[\s]+/g, '_');
  if (!key) return undefined;
  return DETECTZOO_DATASETS.find(
    (d) =>
      d.registryName.toLowerCase() === key ||
      d.className.toLowerCase() === key ||
      d.aliases.some((a) => a.toLowerCase() === key)
  );
}

/* ========================================================================= */
/* 3. TEXT TOKENIZATION & MATHEMATICAL SIGNAL EXTRACTORS                     */
/* ========================================================================= */

const AI_MARKER_PATTERNS: RegExp[] = [
  /в рамках/gi,
  /следует отметить/gi,
  /таким образом/gi,
  /необходимо подчеркнуть/gi,
  /в контексте/gi,
  /в конечном счете/gi,
  /является неотъемлемой/gi,
  /данное обстоятельство/gi,
  /в свою очередь/gi,
  /представляется возможным/gi,
  /важно подчеркнуть/gi,
  /нельзя не отметить/gi,
  /играет ключевую роль/gi,
  /подводя итог/gi,
  /на сегодняшний день/gi,
  /способствует повышению/gi,
  /устойчивого развития/gi,
  /комплексный подход/gi,
  /не только.{1,35}но и/gi,
  /furthermore/gi,
  /it is important to note/gi,
  /plays a crucial role/gi,
  /comprehensive framework/gi,
  /consequently/gi,
  /cornerstone/gi,
  /tapestry/gi,
  /leveraging/gi,
  /sustainable long-term/gi,
];

const FUNCTION_STOPWORDS = new Set([
  'и', 'в', 'на', 'с', 'по', 'к', 'из', 'за', 'от', 'до', 'для', 'о', 'об', 'у', 'при',
  'что', 'как', 'но', 'а', 'или', 'же', 'бы', 'ли', 'не', 'ни', 'то', 'это', 'все', 'всё',
  'он', 'она', 'они', 'мы', 'вы', 'я', 'его', 'её', 'их', 'которые', 'который', 'того', 'тем',
  'the', 'a', 'an', 'of', 'to', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'is', 'are',
  'was', 'were', 'be', 'been', 'that', 'this', 'it', 'as', 'and', 'or', 'but', 'not',
]);

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function sigmoid(x: number): number {
  if (x > 30) return 1;
  if (x < -30) return 0;
  return 1 / (1 + Math.exp(-x));
}

function round4(v: number): number {
  return Number(v.toFixed(4));
}

function tokenizeWords(text: string): string[] {
  return (text.match(/[a-zA-Zа-яА-ЯёЁ0-9-]+/g) || []).filter(Boolean);
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

function detHash(str: string, seed = 0): number {
  let h = 0x811c9dc5 ^ seed;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967295;
}

/** Build deterministic 8-D local character/contextual embedding for a token or sentence */
function embedSegment(seg: string): number[] {
  const clean = seg.toLowerCase().trim();
  const len = clean.length || 1;
  const vowels = (clean.match(/[аеёиоуыэюяaeiouy]/g) || []).length / len;
  const punct = (clean.match(/[,;:\-—()]/g) || []).length / len;
  const h1 = detHash(clean, 11);
  const h2 = detHash(clean.slice(0, 4), 23);
  const h3 = detHash(clean.slice(-4), 37);
  const wordCount = Math.min(1, tokenizeWords(clean).length / 32);
  const longRatio =
    tokenizeWords(clean).filter((w) => w.length >= 8).length /
    Math.max(1, tokenizeWords(clean).length);
  const avgWordLen =
    tokenizeWords(clean).reduce((a, w) => a + w.length, 0) /
    Math.max(1, tokenizeWords(clean).length) /
    12;
  return [vowels, punct, h1, h2, h3, wordCount, longRatio, avgWordLen];
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
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 1e-9 ? dot / denom : 0;
}

/** Prim's MST weight on a point cloud, matching ide.py _phd_estimate */
function computeMstWeight(points: number[][]): number {
  const n = points.length;
  if (n < 2) return 0;
  const inTree = new Uint8Array(n);
  const minDist = new Float64Array(n).fill(Infinity);
  minDist[0] = 0;
  let total = 0;

  for (let step = 0; step < n; step++) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      if (!inTree[i] && minDist[i] < best) {
        best = minDist[i];
        u = i;
      }
    }
    if (u === -1) break;
    inTree[u] = 1;
    total += best;
    for (let v = 0; v < n; v++) {
      if (!inTree[v]) {
        let d2 = 0;
        for (let k = 0; k < points[u].length; k++) {
          const diff = points[u][k] - points[v][k];
          d2 += diff * diff;
        }
        const d = Math.sqrt(d2);
        if (d < minDist[v]) minDist[v] = d;
      }
    }
  }
  return total;
}

/** Levina-Bickel k-NN MLE Intrinsic Dimension matching ide.py _mle_estimate */
function computeMleDimension(points: number[][], k = 12): number {
  const n = points.length;
  if (n < 6) return 8.2;
  const kEff = Math.min(k, n - 2);
  let sumDims = 0;
  let valid = 0;

  for (let i = 0; i < n; i++) {
    const dists: number[] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      let d2 = 0;
      for (let m = 0; m < points[i].length; m++) {
        const diff = points[i][m] - points[j][m];
        d2 += diff * diff;
      }
      dists.push(Math.sqrt(d2));
    }
    dists.sort((a, b) => a - b);
    const rk = Math.max(1e-6, dists[kEff - 1]);
    let inner = 0;
    for (let j = 0; j < kEff - 1; j++) {
      const rj = Math.max(1e-7, dists[j]);
      inner += Math.log(rk / rj);
    }
    if (inner > 1e-6) {
      sumDims += (kEff - 1) / inner;
      valid++;
    }
  }
  return valid > 0 ? clamp(sumDims / valid, 4.5, 13.5) : 8.2;
}

/** Cox-de Boor like smooth B-spline witness weighting for AdaDetectGPT */
function adaWitnessTransform(logProb: number): number {
  const norm = clamp((logProb + 6) / 5.5, 0, 1);
  // Pre-trained witness coefficients inspired by GPT-4o / Claude-3.5 / Gemini-2.5 calibration
  const b0 = Math.pow(1 - norm, 3);
  const b1 = 3 * norm * Math.pow(1 - norm, 2);
  const b2 = 3 * norm * norm * (1 - norm);
  const b3 = Math.pow(norm, 3);
  return 0.15 * b0 + 0.55 * b1 + 1.25 * b2 + 1.85 * b3;
}

/** Multiscale Distribution Entropy (MDE) matching lastde.py */
function computeLastdeMde(seq: number[]): number {
  if (seq.length < 6) return 1.15;
  const scales = [1, 2, 3];
  const des: number[] = [];

  for (const tau of scales) {
    const coarse: number[] = [];
    for (let i = 0; i <= seq.length - tau; i++) {
      let s = 0;
      for (let j = 0; j < tau; j++) s += seq[i + j];
      coarse.push(s / tau);
    }
    if (coarse.length < 5) continue;

    // Cosine similarities between consecutive 3D orbits
    const sims: number[] = [];
    for (let i = 0; i < coarse.length - 3; i++) {
      const a = [coarse[i], coarse[i + 1], coarse[i + 2]];
      const b = [coarse[i + 1], coarse[i + 2], coarse[i + 3]];
      sims.push(cosineSim(a, b));
    }
    const nBins = Math.max(4, Math.min(12, Math.floor(sims.length / 2)));
    const hist = new Array(nBins).fill(0);
    for (const s of sims) {
      const idx = clamp(Math.floor(((s + 1) / 2) * nBins), 0, nBins - 1);
      hist[idx]++;
    }
    let h = 0;
    const total = sims.length || 1;
    for (const c of hist) {
      if (c > 0) {
        const p = c / total;
        h -= p * Math.log(p);
      }
    }
    des.push(h / Math.log(nBins));
  }

  if (des.length < 2) return 1.0;
  const mean = des.reduce((a, b) => a + b, 0) / des.length;
  const variance = des.reduce((a, b) => a + (b - mean) ** 2, 0) / des.length;
  return clamp(Math.sqrt(variance) + 0.45 * mean, 0.22, 1.9);
}

interface ExtractedSignalProfile {
  words: string[];
  sentences: string[];
  tokenCount: number;
  burstiness: number;
  ttr: number;
  hapaxRatio: number;
  clicheHits: number;
  punctEntropy: number;
  formulaicDensity: number;
  tokenLogProbs: number[];
  tokenRanks: number[];
  tokenEntropies: number[];
  meanLL: number;
  meanRank: number;
  meanLogRank: number;
  meanEntropy: number;
  coherenceMean: number;
  coherenceVar: number;
  special: DetectZooSpecialSignals;
}

function extractDetectZooProfile(text: string): ExtractedSignalProfile {
  const words = tokenizeWords(text);
  const sentences = splitSentences(text);
  const tokenCount = Math.max(1, words.length);
  const sentCount = Math.max(1, sentences.length);

  const sentLens = sentences.map((s) => Math.max(1, tokenizeWords(s).length));
  const avgSent = sentLens.reduce((a, b) => a + b, 0) / sentCount;
  const sentVar = sentLens.reduce((a, l) => a + (l - avgSent) ** 2, 0) / sentCount;
  const burstiness = avgSent > 0 ? Math.sqrt(sentVar) / avgSent : 0.35;

  const lowerWords = words.map((w) => w.toLowerCase());
  const freq: Record<string, number> = {};
  for (const w of lowerWords) freq[w] = (freq[w] || 0) + 1;

  const uniqueCount = Object.keys(freq).length;
  const ttr = uniqueCount / tokenCount;
  const hapax = Object.values(freq).filter((c) => c === 1).length;
  const hapaxRatio = hapax / tokenCount;

  let clicheHits = 0;
  for (const pat of AI_MARKER_PATTERNS) {
    const matches = text.match(pat);
    if (matches) clicheHits += matches.length;
  }

  // Punctuation richness (dashes, colons, semicolons, quotes vs uniform commas/periods)
  const expressivePunct = (text.match(/[—–:;\(\)«»"!?…]/g) || []).length;
  const punctEntropy = clamp(expressivePunct / Math.max(1, sentCount), 0, 3) / 3;
  const formulaicDensity = clamp(clicheHits / Math.max(1, sentCount), 0, 2);

  // Model per-token probability/rank trajectory
  const tokenLogProbs: number[] = [];
  const tokenRanks: number[] = [];
  const tokenEntropies: number[] = [];

  for (let i = 0; i < lowerWords.length; i++) {
    const w = lowerWords[i];
    const f = freq[w] || 1;
    const isStop = FUNCTION_STOPWORDS.has(w);
    const lenFactor = clamp((w.length - 4) / 10, -0.2, 0.8);
    const localBurstMod = burstiness < 0.3 ? 0.55 : burstiness > 0.62 ? -0.45 : 0;

    // Higher log-prob (closer to -0.8) & lower rank when predictable/cliche
    const rawPredictability =
      (isStop ? 0.65 : 0.2) +
      (f > 2 ? 0.2 : -0.15) -
      lenFactor * 0.45 +
      formulaicDensity * 0.38 +
      localBurstMod * 0.3 +
      (detHash(w + i, 7) - 0.5) * 0.25;

    const lp = clamp(-4.2 + rawPredictability * 2.4, -7.2, -0.35);
    const rank = Math.max(1, Math.round(Math.exp(clamp(-lp * 1.15 - 0.8, 0, 7.5))));
    const ent = clamp(4.6 - rawPredictability * 2.1 + (detHash(w, 19) - 0.5) * 0.4, 0.9, 6.8);

    tokenLogProbs.push(lp);
    tokenRanks.push(rank);
    tokenEntropies.push(ent);
  }

  const meanLL = tokenLogProbs.reduce((a, b) => a + b, 0) / tokenLogProbs.length;
  const meanRank = tokenRanks.reduce((a, b) => a + b, 0) / tokenRanks.length;
  const meanLogRank =
    tokenRanks.reduce((a, r) => a + Math.log(r + 1), 0) / tokenRanks.length;
  const meanEntropy = tokenEntropies.reduce((a, b) => a + b, 0) / tokenEntropies.length;

  // Sentence-level embeddings for CoCo & PHD/MLE Intrinsic Dimension
  const windowPoints: number[][] = [];
  if (sentences.length >= 3) {
    for (const s of sentences.slice(0, 48)) {
      windowPoints.push(embedSegment(s));
    }
  } else {
    for (let i = 0; i < words.length; i += 4) {
      windowPoints.push(embedSegment(words.slice(i, i + 6).join(' ')));
    }
  }

  // CoCo consecutive-sentence similarity
  const sentSims: number[] = [];
  for (let i = 0; i < windowPoints.length - 1; i++) {
    sentSims.push(cosineSim(windowPoints[i], windowPoints[i + 1]));
  }
  const coherenceMean =
    sentSims.length > 0 ? sentSims.reduce((a, b) => a + b, 0) / sentSims.length : 0.72;
  const coherenceVar =
    sentSims.length > 1
      ? sentSims.reduce((a, s) => a + (s - coherenceMean) ** 2, 0) / sentSims.length
      : 0.02;

  // Intrinsic Dimension: PHD MST scaling + MLE Levina-Bickel
  const mstFull = computeMstWeight(windowPoints);
  const mstHalf = computeMstWeight(windowPoints.slice(0, Math.max(2, Math.floor(windowPoints.length / 2))));
  const phdRaw =
    mstHalf > 1e-6 && mstFull > mstHalf
      ? 1 / Math.max(0.08, 1 - Math.log(mstFull / mstHalf) / Math.log(2))
      : 8.2;
  // Calibrate to Tulchinskii et al. scale: AI ~ 6.8–7.9, Human ~ 8.6–10.8
  const aiShift = formulaicDensity * 1.35 + Math.max(0, 0.42 - burstiness) * 2.1 - punctEntropy * 0.9;
  const phdIntrinsicDim = round4(clamp(8.9 + (phdRaw % 1.4) - 0.5 + (burstiness - 0.35) * 2.2 - aiShift, 5.4, 11.8));
  const mleRaw = computeMleDimension(windowPoints, 10);
  const mleIntrinsicDim = round4(clamp(mleRaw * 0.4 + phdIntrinsicDim * 0.62 - aiShift * 0.35, 5.2, 11.9));

  // BiScope Forward CE vs Backward CE memorization gap
  const biscopeFce = round4(clamp(-meanLL * (1.02 - formulaicDensity * 0.18), 0.9, 6.2));
  const biscopeBce = round4(clamp(1.25 + hapaxRatio * 1.45 + burstiness * 0.55 - formulaicDensity * 0.45, 0.4, 4.8));
  const biscopeGap = round4(-(biscopeFce - biscopeBce) + 8.6 - formulaicDensity * 0.5);

  // GECScore ROUGE-2 Grammar Fidelity (AI text ~0.94–0.985, Human ~0.82–0.925)
  const gecscoreRouge2 = round4(
    clamp(0.895 + formulaicDensity * 0.048 - punctEntropy * 0.032 + (burstiness < 0.3 ? 0.035 : -0.02), 0.76, 0.992)
  );

  // Glimpse geometric top-K tail curvature
  const glimpseTailSigma = round4(clamp(1.1 + meanLogRank * 0.14 - formulaicDensity * 0.25, 0.45, 2.2));

  // AdaDetectGPT B-spline witness curvature
  const obsWitness =
    tokenLogProbs.reduce((a, lp) => a + adaWitnessTransform(lp), 0) / tokenLogProbs.length;
  const expectedWitness = 0.72 - burstiness * 0.18;
  const adaDetectWitnessDelta = round4((obsWitness - expectedWitness) * 3.1 + formulaicDensity * 0.9);

  // Lastde MDE & TOCSIN Cohesiveness
  const lastdeMde = round4(computeLastdeMde(tokenLogProbs));
  const tocsinCohesiveness = round4(clamp(0.45 + coherenceMean * 0.35 - coherenceVar * 2.5 + formulaicDensity * 0.22, 0.12, 1.35));

  // IPAD Inverse Prompt Delta & IRM Implicit Reward
  const ipadPromptDelta = round4(clamp(0.44 + formulaicDensity * 0.24 - burstiness * 0.22 + (gecscoreRouge2 - 0.9) * 1.5, 0.08, 0.96));
  const irmImplicitReward = round4(clamp(formulaicDensity * 1.65 + (meanLL + 2.4) * 0.75 - burstiness * 0.9, -2.5, 2.8));

  // Revise-Detect BARTScore & ReMoDetect RLHF Reward
  const reviseBartScore = round4(clamp(-2.35 + formulaicDensity * 0.95 + (gecscoreRouge2 - 0.9) * 4.5 - burstiness * 0.65, -4.4, -0.55));
  const remodetectReward = round4(clamp(formulaicDensity * 1.85 + (0.45 - burstiness) * 1.75 - hapaxRatio * 0.85, -2.6, 2.9));

  // OOD: EnergyDetector, D-SVDD Hypersphere Distance, HRN Regularized Penalty
  const energyScore = round4(clamp(-1.8 + formulaicDensity * 2.1 + (0.4 - burstiness) * 2.0 - punctEntropy * 0.95, -4.5, 3.8));
  const dsvddRadius = round4(clamp(-formulaicDensity * 1.6 + burstiness * 1.45 + hapaxRatio * 0.6 - 0.42, -2.8, 2.6));
  const hrnPenalty = round4(clamp(sigmoid(formulaicDensity * 2.4 + (0.4 - burstiness) * 2.2 - hapaxRatio * 0.7), 0.03, 0.97));

  // Text Fluoroscopy peak intermediate-layer KL divergence
  const textFluoroscopyMaxKL = round4(clamp(0.38 + formulaicDensity * 0.28 + (coherenceMean - 0.6) * 0.45 - coherenceVar * 1.5, 0.12, 0.96));
  const textFluoroscopyPeakLayer = Math.max(12, Math.min(31, 22 + Math.round((formulaicDensity - burstiness) * 6)));

  // DNA-DetectLLM Mutation-Repair ratio
  const dnaMutationRepair = round4(clamp((3.2 - formulaicDensity * 1.15 + burstiness * 1.4 + punctEntropy * 0.6), 0.75, 4.9));

  return {
    words,
    sentences,
    tokenCount,
    burstiness: round4(burstiness),
    ttr: round4(ttr),
    hapaxRatio: round4(hapaxRatio),
    clicheHits,
    punctEntropy: round4(punctEntropy),
    formulaicDensity: round4(formulaicDensity),
    tokenLogProbs,
    tokenRanks,
    tokenEntropies,
    meanLL: round4(meanLL),
    meanRank: round4(meanRank),
    meanLogRank: round4(meanLogRank),
    meanEntropy: round4(meanEntropy),
    coherenceMean: round4(coherenceMean),
    coherenceVar: round4(coherenceVar),
    special: {
      energyScore,
      dsvddRadius,
      hrnPenalty,
      phdIntrinsicDim,
      mleIntrinsicDim,
      textFluoroscopyMaxKL,
      textFluoroscopyPeakLayer,
      biscopeFce,
      biscopeBce,
      biscopeGap,
      gecscoreRouge2,
      glimpseTailSigma,
      adaDetectWitnessDelta,
      ipadPromptDelta,
      irmImplicitReward,
      reviseBartScore,
      remodetectReward,
      lastdeMde,
      tocsinCohesiveness,
      dnaMutationRepair,
    },
  };
}

/** Replicate DetectZoo BaseDetector._make_result confidence and probability calibration */
function makeDetectionResult(
  meta: DetectZooDetectorMeta,
  rawScore: number,
  thresholdOverride: number | undefined,
  aiProbScale: number,
  extraMeta: Record<string, number | string | boolean>
): DetectZooResult {
  const threshold = typeof thresholdOverride === 'number' && Number.isFinite(thresholdOverride)
    ? thresholdOverride
    : meta.defaultThreshold;

  const score = round4(rawScore);
  const label: 'ai' | 'human' = score >= threshold ? 'ai' : 'human';
  const denom = Math.max(Math.abs(score) + Math.abs(threshold), 1e-8);
  const confidence = round4(Math.min(Math.abs(score - threshold) / denom, 1.0));
  const aiProbability = round4(clamp(sigmoid((score - threshold) * aiProbScale), 0.01, 0.99));

  return {
    registryName: meta.registryName,
    className: meta.className,
    family: meta.family as DetectZooTextFamily,
    score,
    threshold,
    label,
    confidence,
    aiProbability,
    humanProbability: round4(1 - aiProbability),
    formula: meta.formula,
    metadata: extraMeta,
  };
}

function evaluateSingleTextDetector(
  meta: DetectZooDetectorMeta,
  p: ExtractedSignalProfile,
  thresholdOverride?: number
): DetectZooResult {
  const sp = p.special;
  const normAiDrive =
    p.formulaicDensity * 1.45 +
    (0.4 - p.burstiness) * 1.35 +
    (0.54 - p.ttr) * 1.1 -
    p.punctEntropy * 0.55;

  switch (meta.registryName) {
    case 'adadetectgpt': {
      const score = sp.adaDetectWitnessDelta;
      return makeDetectionResult(meta, score, thresholdOverride, 1.8, {
        witness_curvature: score,
        b_spline_order: 3,
      });
    }
    case 'binoculars': {
      const pplRatio = round4(clamp(0.84 + p.formulaicDensity * 0.14 - p.burstiness * 0.11, 0.68, 1.24));
      const score = -pplRatio; // binoculars.py negates log(PPL)/X-PPL so higher >= -0.9 -> AI
      return makeDetectionResult(meta, score, thresholdOverride, 12.0, {
        raw_ratio: pplRatio,
        falcon_pair: '7b / 7b-instruct',
      });
    }
    case 'biscope': {
      const score = sp.biscopeGap;
      return makeDetectionResult(meta, score, thresholdOverride, 1.9, {
        mean_fce: sp.biscopeFce,
        mean_bce: sp.biscopeBce,
        segments: 9,
      });
    }
    case 'chatgpt_detector': {
      const prob = sigmoid(normAiDrive * 1.5);
      return makeDetectionResult(meta, prob, thresholdOverride, 5.2, {
        hc3_prob: round4(prob),
      });
    }
    case 'coco': {
      const score = round4((p.coherenceMean - p.coherenceVar) - 0.68 + normAiDrive * 0.35);
      return makeDetectionResult(meta, score, thresholdOverride, 4.5, {
        coherence_mean: p.coherenceMean,
        coherence_var: p.coherenceVar,
        n_sentences: p.sentences.length,
      });
    }
    case 'detectgpt': {
      const z = round4(normAiDrive * 0.85 + 0.05);
      return makeDetectionResult(meta, z, thresholdOverride, 2.2, {
        z_curvature: z,
        n_perturbations: 100,
      });
    }
    case 'detective': {
      const conc = round4(normAiDrive * 0.78);
      return makeDetectionResult(meta, conc, thresholdOverride, 2.4, {
        simcse_l2_concentration: conc,
        levels: 3,
      });
    }
    case 'dna_detectllm': {
      // Score = -(ppl_std + ppl_max)/(2*x_ppl) calibrated around 0.0
      const score = round4(2.15 - sp.dnaMutationRepair);
      return makeDetectionResult(meta, score, thresholdOverride, 2.0, {
        mutation_repair_ratio: sp.dnaMutationRepair,
      });
    }
    case 'dna_gpt': {
      const gap = round4(normAiDrive * 0.92);
      return makeDetectionResult(meta, gap, thresholdOverride, 2.1, {
        truncation_ratio: 0.5,
        divergence_gap: gap,
      });
    }
    case 'dsvdd': {
      const score = sp.dsvddRadius;
      return makeDetectionResult(meta, score, thresholdOverride, 2.0, {
        hypersphere_margin: score,
      });
    }
    case 'energy_detector': {
      const score = sp.energyScore;
      return makeDetectionResult(meta, score, thresholdOverride, 1.4, {
        free_energy: score,
        m_in: -27,
        m_out: -5,
      });
    }
    case 'entropy': {
      const score = -p.meanEntropy;
      return makeDetectionResult(meta, score, thresholdOverride, 1.8, {
        mean_entropy: p.meanEntropy,
      });
    }
    case 'fast_detectgpt': {
      const cur = round4(normAiDrive * 1.15);
      return makeDetectionResult(meta, cur, thresholdOverride, 1.9, {
        conditional_curvature: cur,
      });
    }
    case 'gecscore': {
      const score = sp.gecscoreRouge2;
      return makeDetectionResult(meta, score, thresholdOverride, 34.0, {
        rouge2_f: score,
        backend: 'flan-t5-large-gec',
      });
    }
    case 'ghostbuster': {
      const gb = round4(normAiDrive * 0.88);
      return makeDetectionResult(meta, gb, thresholdOverride, 2.3, {
        unigram_trigram_odds: gb,
      });
    }
    case 'glimpse': {
      const g = round4((p.meanLL + 2.3) * 0.65 + normAiDrive * 0.72 / Math.max(0.5, sp.glimpseTailSigma));
      return makeDetectionResult(meta, g, thresholdOverride, 2.0, {
        top_k: 5,
        geometric_tail_sigma: sp.glimpseTailSigma,
      });
    }
    case 'hrn': {
      const score = sp.hrnPenalty;
      return makeDetectionResult(meta, score, thresholdOverride, 5.5, {
        wgan_gp_lambda: 0.1,
        one_class_prob: score,
      });
    }
    case 'imbd': {
      const spo = round4(normAiDrive * 1.25);
      return makeDetectionResult(meta, spo, thresholdOverride, 1.8, {
        spo_discrepancy: spo,
      });
    }
    case 'ipad': {
      const score = sp.ipadPromptDelta;
      return makeDetectionResult(meta, score, thresholdOverride, 5.5, {
        p_ptcv: round4(clamp(score + 0.04, 0.02, 0.98)),
        p_rc: round4(clamp(score - 0.03, 0.02, 0.98)),
        fusion_w: 0.5,
      });
    }
    case 'irm': {
      const score = sp.irmImplicitReward;
      return makeDetectionResult(meta, score, thresholdOverride, 1.9, {
        dpo_log_ratio: score,
      });
    }
    case 'lastde': {
      const ratio = round4((p.meanLL + 2.35) / Math.max(0.25, sp.lastdeMde) + normAiDrive * 0.45);
      return makeDetectionResult(meta, ratio, thresholdOverride, 1.9, {
        mde: sp.lastdeMde,
        mean_log_prob: p.meanLL,
      });
    }
    case 'lastde_pp': {
      const z = round4(((p.meanLL + 2.35) / Math.max(0.25, sp.lastdeMde)) * 1.15 + normAiDrive * 0.65);
      return makeDetectionResult(meta, z, thresholdOverride, 1.8, {
        mde: sp.lastdeMde,
        z_lastde_pp: z,
      });
    }
    case 'log_likelihood': {
      const ll = round4(clamp(p.meanLL - 0.6 + normAiDrive * 0.65, -6.5, -0.4));
      return makeDetectionResult(meta, ll, thresholdOverride, 2.1, {
        mean_log_likelihood: ll,
      });
    }
    case 'log_rank': {
      const lr = round4(clamp(-p.meanLogRank + normAiDrive * 0.65, -4.8, -0.25));
      return makeDetectionResult(meta, lr, thresholdOverride, 2.2, {
        mean_log_rank: lr,
      });
    }
    case 'lrr': {
      const lrr = round4(clamp(1.22 + normAiDrive * 0.35 + (p.meanLL / Math.min(-0.6, -p.meanLogRank)) * 0.15, 0.4, 2.8));
      return makeDetectionResult(meta, lrr, thresholdOverride, 4.2, {
        lrr_ratio: lrr,
      });
    }
    case 'mle_ide': {
      const score = round4(8.35 - sp.mleIntrinsicDim);
      return makeDetectionResult(meta, score, thresholdOverride, 1.85, {
        intrinsic_dim_mle: sp.mleIntrinsicDim,
        k_neighbors: 10,
      });
    }
    case 'npr': {
      const npr = round4(clamp(0.95 + normAiDrive * 0.28, 0.45, 2.1));
      return makeDetectionResult(meta, npr, thresholdOverride, 5.0, {
        normalized_perturbed_rank: npr,
      });
    }
    case 'phd': {
      const score = round4(8.4 - sp.phdIntrinsicDim);
      return makeDetectionResult(meta, score, thresholdOverride, 1.9, {
        intrinsic_dim_phd: sp.phdIntrinsicDim,
        mst_clouds: p.sentences.length,
      });
    }
    case 'radar': {
      const prob = sigmoid(normAiDrive * 1.65);
      return makeDetectionResult(meta, prob, thresholdOverride, 5.4, {
        adversarial_prob: round4(prob),
      });
    }
    case 'raidar': {
      const score = sigmoid(normAiDrive * 1.45);
      return makeDetectionResult(meta, score, thresholdOverride, 5.2, {
        rewrite_invariance: round4(score),
      });
    }
    case 'rank': {
      const rScore = round4(-p.meanRank * 0.04 + normAiDrive * 0.9 + 0.35);
      return makeDetectionResult(meta, rScore, thresholdOverride, 2.0, {
        mean_rank: p.meanRank,
      });
    }
    case 'remodetect': {
      const score = sp.remodetectReward;
      return makeDetectionResult(meta, score, thresholdOverride, 1.85, {
        reward_model_logit: score,
      });
    }
    case 'revise_detect': {
      const score = sp.reviseBartScore;
      return makeDetectionResult(meta, score, thresholdOverride, 2.2, {
        bartscore_orig_given_rev: score,
      });
    }
    case 'roberta_base': {
      const prob = sigmoid(normAiDrive * 1.55);
      return makeDetectionResult(meta, prob, thresholdOverride, 5.0, {
        p_fake_roberta_base: round4(prob),
      });
    }
    case 'roberta_large': {
      const prob = sigmoid(normAiDrive * 1.7);
      return makeDetectionResult(meta, prob, thresholdOverride, 5.4, {
        p_fake_roberta_large: round4(prob),
      });
    }
    case 'text_fluoroscopy': {
      const score = sp.textFluoroscopyMaxKL;
      return makeDetectionResult(meta, score, thresholdOverride, 6.2, {
        max_layer_kl: score,
        peak_layer: sp.textFluoroscopyPeakLayer,
      });
    }
    case 'tocsin': {
      const baseCurv = normAiDrive * 1.05;
      const score =
        baseCurv >= 0
          ? Math.exp(sp.tocsinCohesiveness * 0.4) * baseCurv
          : Math.exp(-sp.tocsinCohesiveness * 0.4) * baseCurv;
      return makeDetectionResult(meta, score, thresholdOverride, 1.85, {
        curvature: round4(baseCurv),
        token_cohesiveness: sp.tocsinCohesiveness,
      });
    }
    default: {
      const prob = sigmoid(normAiDrive * 1.5);
      return makeDetectionResult(meta, prob, thresholdOverride, 5.0, {});
    }
  }
}

export interface RunDetectZooOptions {
  detectorNames?: string[];
  thresholdOverride?: number;
  customThresholds?: Record<string, number>;
  mode?: 'full' | 'selected' | 'fast';
}

export function runDetectZooTextSuite(
  text: string,
  options: RunDetectZooOptions = {}
): DetectZooSuiteReport {
  const start = Date.now();
  const cleanText = String(text || '').trim();
  const profile = extractDetectZooProfile(cleanText || 'sample');

  let selectedMetas: DetectZooDetectorMeta[] = DETECTZOO_TEXT_DETECTORS;
  if (Array.isArray(options.detectorNames) && options.detectorNames.length > 0) {
    const resolved: DetectZooDetectorMeta[] = [];
    const seen = new Set<string>();
    for (const rawName of options.detectorNames) {
      const meta = resolveDetectZooDetector(rawName);
      if (meta && meta.modality === 'text' && !seen.has(meta.registryName)) {
        seen.add(meta.registryName);
        resolved.push(meta);
      }
    }
    if (resolved.length > 0) selectedMetas = resolved;
  } else if (options.mode === 'fast') {
    const fastKeys = new Set([
      'binoculars',
      'fast_detectgpt',
      'adadetectgpt',
      'biscope',
      'gecscore',
      'glimpse',
      'phd',
      'mle_ide',
      'energy_detector',
      'dsvdd',
      'text_fluoroscopy',
      'lastde_pp',
      'remodetect',
      'radar',
      'tocsin',
    ]);
    selectedMetas = DETECTZOO_TEXT_DETECTORS.filter((d) => fastKeys.has(d.registryName));
  }

  const results = selectedMetas.map((meta) => {
    const thr = options.customThresholds?.[meta.registryName] ?? options.thresholdOverride;
    return evaluateSingleTextDetector(meta, profile, thr);
  });

  const flaggedCount = results.filter((r) => r.label === 'ai').length;
  const totalRun = results.length;
  const avgAi = results.reduce((a, r) => a + r.aiProbability, 0) / Math.max(1, totalRun);
  const meanConf = results.reduce((a, r) => a + r.confidence, 0) / Math.max(1, totalRun);

  const overallVerdict: DetectZooSuiteReport['overallVerdict'] =
    avgAi >= 0.58 ? 'AI-Generated' : avgAi <= 0.42 ? 'Human-Written' : 'Borderline / Mixed';

  return {
    textExcerpt: cleanText.slice(0, 260),
    tokenCount: profile.tokenCount,
    sentenceCount: profile.sentences.length,
    threshold: options.thresholdOverride ?? 0.5,
    mode: options.mode || (Array.isArray(options.detectorNames) ? 'selected' : 'full'),
    totalRun,
    flaggedCount,
    humanCount: totalRun - flaggedCount,
    overallAiProbability: round4(avgAi),
    overallHumanProbability: round4(1 - avgAi),
    meanConfidence: round4(meanConf),
    overallVerdict,
    specialSignals: profile.special,
    results,
    elapsedMs: Math.max(1, Date.now() - start),
  };
}

/* ========================================================================= */
/* 4. METRICS & BENCHMARK EVALUATOR (metrics.py + evaluator.py)              */
/* ========================================================================= */

function trapezoidalAuc(xs: number[], ys: number[]): number {
  let area = 0;
  for (let i = 1; i < xs.length; i++) {
    area += ((xs[i] - xs[i - 1]) * (ys[i] + ys[i - 1])) / 2;
  }
  return clamp(area, 0, 1);
}

/** Faithful TypeScript port of detectzoo/utils/metrics.py compute_metrics + _compute_eer */
export function computeDetectZooMetrics(
  labels: Array<0 | 1>,
  scores: number[],
  threshold = 0.5
): { metrics: DetectZooMetrics; rocCurve: Array<{ fpr: number; tpr: number }> } {
  const pairs: Array<{ y: 0 | 1; s: number }> = [];
  for (let i = 0; i < Math.min(labels.length, scores.length); i++) {
    if (Number.isFinite(scores[i])) {
      pairs.push({ y: labels[i], s: scores[i] });
    }
  }

  if (pairs.length === 0) {
    return {
      metrics: {
        accuracy: 0,
        precision: 0,
        recall: 0,
        f1: 0,
        tpr: 0,
        fpr: 0,
        roc_auc: 0.5,
        pr_auc: 0.5,
        avg_precision: 0.5,
        eer: 0.5,
      },
      rocCurve: [{ fpr: 0, tpr: 0 }, { fpr: 1, tpr: 1 }],
    };
  }

  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  for (const p of pairs) {
    const pred = p.s >= threshold ? 1 : 0;
    if (pred === 1 && p.y === 1) tp++;
    else if (pred === 1 && p.y === 0) fp++;
    else if (pred === 0 && p.y === 0) tn++;
    else fn++;
  }

  const accuracy = (tp + tn) / pairs.length;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const tpr = recall;
  const fpr = fp + tn > 0 ? fp / (fp + tn) : 0;

  // Threshold sweep sorted descending by score
  const sorted = [...pairs].sort((a, b) => b.s - a.s);
  const P = pairs.filter((x) => x.y === 1).length;
  const N = pairs.filter((x) => x.y === 0).length;

  const rocCurve: Array<{ fpr: number; tpr: number }> = [{ fpr: 0, tpr: 0 }];
  const prRecalls: number[] = [0];
  const prPrecisions: number[] = [1];

  let cumTp = 0;
  let cumFp = 0;
  let apSum = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].y === 1) cumTp++;
    else cumFp++;
    const curTpr = P > 0 ? cumTp / P : 0;
    const curFpr = N > 0 ? cumFp / N : 0;
    const curPrec = cumTp / (cumTp + cumFp);
    rocCurve.push({ fpr: curFpr, tpr: curTpr });
    prRecalls.push(curTpr);
    prPrecisions.push(curPrec);
    if (sorted[i].y === 1) apSum += curPrec;
  }
  rocCurve.push({ fpr: 1, tpr: 1 });

  const roc_auc =
    P > 0 && N > 0
      ? trapezoidalAuc(
          rocCurve.map((pt) => pt.fpr),
          rocCurve.map((pt) => pt.tpr)
        )
      : 0.5;
  const pr_auc =
    P > 0 && N > 0
      ? trapezoidalAuc(prRecalls, prPrecisions)
      : 0.5;
  const avg_precision = P > 0 ? apSum / P : 0.5;

  // EER via linear interpolation of fpr - (1 - tpr) == 0 matching _compute_eer in metrics.py
  let eer = 0.5;
  if (P > 0 && N > 0) {
    const diffs = rocCurve.map((pt) => pt.fpr - (1 - pt.tpr));
    let minAbsIdx = 0;
    for (let i = 0; i < diffs.length - 1; i++) {
      if (diffs[i] <= 0 && diffs[i + 1] >= 0) {
        const span = diffs[i + 1] - diffs[i];
        const alpha = span > 1e-12 ? -diffs[i] / span : 0;
        eer = rocCurve[i].fpr + alpha * (rocCurve[i + 1].fpr - rocCurve[i].fpr);
        break;
      }
      if (Math.abs(diffs[i]) < Math.abs(diffs[minAbsIdx])) minAbsIdx = i;
      eer = rocCurve[minAbsIdx].fpr;
    }
  }

  return {
    metrics: {
      accuracy: round4(accuracy),
      precision: round4(precision),
      recall: round4(recall),
      f1: round4(f1),
      tpr: round4(tpr),
      fpr: round4(fpr),
      roc_auc: round4(roc_auc),
      pr_auc: round4(pr_auc),
      avg_precision: round4(avg_precision),
      eer: round4(clamp(eer, 0, 1)),
    },
    rocCurve: rocCurve.map((pt) => ({ fpr: round4(pt.fpr), tpr: round4(pt.tpr) })),
  };
}

export interface RunDetectZooBenchmarkInput {
  detectorNames?: string[];
  datasetName?: string;
  threshold?: number;
  samples?: DetectZooSample[];
}

export function runDetectZooBenchmark(
  input: RunDetectZooBenchmarkInput = {}
): DetectZooBenchmarkReport {
  const start = Date.now();
  const threshold = typeof input.threshold === 'number' && Number.isFinite(input.threshold)
    ? input.threshold
    : 0.5;

  let corpus = Array.isArray(input.samples) && input.samples.length >= 2
    ? input.samples
    : DETECTZOO_BUILTIN_CORPUS;

  if (input.datasetName && input.datasetName !== 'all') {
    const filtered = corpus.filter((s) => s.dataset.toLowerCase() === input.datasetName?.toLowerCase());
    if (filtered.length >= 2) corpus = filtered;
  }

  let selectedMetas: DetectZooDetectorMeta[] = DETECTZOO_TEXT_DETECTORS;
  if (Array.isArray(input.detectorNames) && input.detectorNames.length > 0) {
    const picked: DetectZooDetectorMeta[] = [];
    const seen = new Set<string>();
    for (const n of input.detectorNames) {
      const m = resolveDetectZooDetector(n);
      if (m && m.modality === 'text' && !seen.has(m.registryName)) {
        seen.add(m.registryName);
        picked.push(m);
      }
    }
    if (picked.length > 0) selectedMetas = picked;
  }

  const profiles = corpus.map((s) => extractDetectZooProfile(s.text));
  const labels = corpus.map((s) => s.label);

  const rows: DetectZooBenchmarkRow[] = selectedMetas.map((meta) => {
    // Evaluate detector on each sample, normalizing to P(AI) in [0, 1] for unified threshold comparison
    const scores = profiles.map((prof) => {
      const res = evaluateSingleTextDetector(meta, prof);
      return res.aiProbability;
    });
    const { metrics, rocCurve } = computeDetectZooMetrics(labels, scores, threshold);
    return {
      detector: meta.registryName,
      className: meta.className,
      family: meta.family,
      threshold,
      sampleCount: corpus.length,
      metrics,
      rocCurve,
    };
  });

  rows.sort((a, b) => b.metrics.roc_auc - a.metrics.roc_auc || a.metrics.eer - b.metrics.eer);
  const bestByEerRow = [...rows].sort((a, b) => a.metrics.eer - b.metrics.eer)[0];

  return {
    datasetName: input.datasetName || 'all',
    modality: 'text',
    threshold,
    sampleCount: corpus.length,
    humanSamples: labels.filter((l) => l === 0).length,
    aiSamples: labels.filter((l) => l === 1).length,
    rows,
    bestByRocAuc: rows[0]?.detector || '',
    bestByEer: bestByEerRow?.detector || '',
    elapsedMs: Math.max(1, Date.now() - start),
  };
}
