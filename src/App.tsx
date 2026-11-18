/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Sliders,
  Sparkles,
  Copy,
  Check,
  Download,
  History,
  BookOpen,
  RefreshCw,
  FileCheck,
  Cpu,
  UserCheck,
  Terminal,
  Search,
  Zap,
  Activity,
  Layers,
  ExternalLink,
  CheckSquare,
  Dna,
  ArrowDownUp,
  FileCode,
  ShieldCheck,
  BarChart3,
  AlertTriangle,
  Maximize2,
  ShieldAlert,
} from 'lucide-react';
import { DetectorWorkbench } from './detectors/DetectorWorkbench';
import { SlopTotalWorkbench } from './detectors/SlopTotalWorkbench';
import { MgtEvalWorkbench } from './detectors/MgtEvalWorkbench';
import { MgtBenchWorkbench } from './detectors/MgtBenchWorkbench';
import { DetectZooWorkbench } from './detectors/DetectZooWorkbench';
import { runSlopTotalAnalysis } from '../shared/sloptotalCore';
import { runMgtEvalDetection } from '../shared/mgtEvalCore';
import { runMgtBenchDetection } from '../shared/mgtBenchCore';
import { runDetectZooTextSuite } from '../shared/detectZooCore';

/* ========================================================================= */
/* TYPES                                                                     */
/* ========================================================================= */

type HistoryType = 'humanizer' | 'draft' | 'academic-39' | 'style-dna';

interface HistoryItem {
  id: string;
  timestamp: number;
  type: HistoryType;
  strengthOrIntensity: number;
  inputText: string;
  outputText: string;
}

type TabId = 'style-dna' | 'sloptotal' | 'mgt-eval' | 'mgt-bench' | 'detect-zoo' | 'analysis' | 'sandbox' | 'draft-workshop' | 'academic-39' | 'history';

type FlagKey =
  | 'basic'
  | 'ultra'
  | 'targeted6'
  | 'twentyCycles'
  | 'turnitout'
  | 'lynote'
  | 'dadaNanjesha'
  | 'blader'
  | 'perplexityTopics';

type Flags = Record<FlagKey, boolean>;

/* ========================================================================= */
/* SAMPLE TEXTS                                                              */
/* ========================================================================= */

const SAMPLE_DONOR_TEXT = `В реализации подвижнической жизни нужна искренняя и умственная дисциплинированность. Самособранность – это такое душевное состояние, когда человек способен осуществлять контроль всего без исключения. Несобранность совершается от расслабленности ума и неосторожности от неверия в присутствие Господа. Искренней организованности обязано содействовать и уединение. Кроме того, необходимо также совершенное послушание наставнику, которое подразумевает не только лишь то, чтобы по его рекомендации удерживаться от абсурдного, но и чтобы без его волевой регуляции не осуществлять и достохвального. Для человека, который идёт аскетическим путем, нужен отказ абсолютно от всего. Идея о потребности для благополучного разумного созерцания с воздержанием требует особого отношения к телесному естеству. Данная мысль была полноценно отражена в метафоре святого Василия Великого Кесарийского, в которой человеческий дух сравнивается с возницей, а телесное естество – с конем: «Великолепная вещь есть конь, и чем он по своей сути прытче и жарче, тем несомненно правильнее; однако необходимо постоянно держать его в узде и контролировать его, ибо это животное не обладает рассудком как человек. В случае, если же возница на нем, то он постарается применить естественные качества коня для себя непосредственно». Причиной для данного сопряжения служит, во-первых, то, что инок-аскет, аналогично ангелам бесстрастным, стремится в совершенстве усмирить любую идею о земных страстях, и, во-вторых, никак не покоряясь телесным вожделениям, углубляется в непрестанное созерцание Господа. В качестве основания аскетического богословия святителя выступает добродетель любви, прежде всего – любви к Господу. Архиепископ Константинопольский святитель Григорий Богослов выполнил большую роль в формировании аскетизма как учения. Рассуждая об истинном значении аскетизма, святитель Григорий Богослов называет его третьим рождением. В соответствии с суждениями святителя Григория, человек способен испытать во время своего существования три рождения. Первоначальное рождение ведет свое непосредственное начало от плоти и крови – по нему люди появляются на земле и со временем умирают; второе рождение связано с рождением от чистого Святого Духа, когда на омытых водой нисходит озарение, то есть когда происходит крещение. Существует и третье рождение, очищающее в человеческом духе облик Господа, очерненный грехом, слезами и скорбями. Первоначальное из этих трех рождений человек имеет от отца, второе непосредственно от Господа, а в третьем – он сам себе родитель-создатель и служит для мира превосходным светилом. Божье единение, к которому старается прийти христианин, обладает великой любовью к Господу. Строгий аскетический образ жизни, в соответствии с суждениями святого Григория, приводит к обожению человека как личности. Христианские подвижники находятся выше земной жизни. Они, едва касаясь мира, не связаны с земными стяжаниями и постоянно молятся Господу. Отречение нужно не только самим инокам-аскетам, но каждому уважающему себя христианскому человеку. Абсолютно согласен с ними в собственном подходе к аскетическому учению и третий великий каппадокиец – святой Григорий Нисский. Его работа «Об устроении человека», не будучи написана со специальной целью проанализировать суть аскетизма, тем не менее, заняла очень значимое место в доктрине подвижнической жизни как, собственно, и для своей, так и для будущих поколений. Аскеты начала V в. н. э. Исаия Египетский (Отшельник) и Евагрий Понтийский аскетическое учение строили на таких характерных отличительных чертах в человеке, как телесное естество, душевность и духовность, или ум. Рассуждения о них проходят через все их писания. О Евагрии Понтийском, по мнению А.И. Сидорова, можно сказать, что он завершает начальный период в истории монашества; он осуществил синтез богословия и практического монашества.`;

const SAMPLE_CONTENT_TEXT = `В рамках атеистической парадигмы смысл человеческого существования неизбежно редуцируется к процессу последовательного и сугубо материального улучшения внешних условий бытия, где всё многообразие мировых явлений выступает не более чем естественным процессом, детерминированным строгими физико-химическими законами. В этой жестко заданной системе координат сам человек предстает лишь результатом случайной комбинации материи, вследствие чего единственно возможный вектор развития мировой истории усматривается в прогрессивном преобразовании вещественного мира. В отсутствие же высших духовных ориентиров именно категория наслаждения закономерно возводится в ранг ключевого мерила "лучшей жизни".

При таком подходе культура призвана лишь инструментально обогащать человеческий опыт, делая его более разнообразным и приятным, в то время как развитие науки и техники обеспечивает индивиду власть над силами природы для удовлетворения постоянно расширяющегося спектра потребностей. Идеалом подобного прогресса провозглашается достижение некоего универсального равенства в доступе к источникам удовольствия, однако именно здесь обнаруживается фундаментальное противоречие: современная урбанистическая среда, выступая средоточием всех цивилизационных достижений, зачастую порождает у субъекта глубокое внутреннее отторжение, диктуемое жаждой первозданной простоты. Более того, ввиду того, что удовольствие одного индивида может фатально оборачиваться страданием для другого, сама идея "общего счастья" оказывается лишенной объективного, универсально применимого измерителя.

Последовательное сведение человеческой сущности к совокупности биохимических реакций фактически элиминирует само понятие свободы выбора, что неминуемо влечет за собой упразднение моральной ответственности и превращение исторического процесса в механическую последовательность фактов, лишенную всякого телеологического обоснования. В такой детерминированной системе, где не остается места ни совести, ни этическому идеалу, атеистическая концепция смысла жизни неизбежно заходит в экзистенциальный тупик. Обещая материальное преуспеяние, она, тем не менее, оказывается неспособной дать ответ на вопрос о финальной цели бытия перед лицом неизбежной смерти, вследствие чего любая модель смысла, базирующаяся исключительно на материи, обнаруживает свою предельную несостоятельность, неизбежно сталкиваясь с неутолимой жаждой вечности, имманентно присущей самой человеческой природе.`;

const TEXT_HUMAN = `Так же, как и христианская культура, культура самодийцев состоит из верований, материальных артефактов и обрядов. Мы рассмотрели во второй главе методы соотнесения религиозных образов и саму парадигму мышления. Однако перед нами стоит задача примирить новую христианскую парадигму мышления с традиционным образом жизни самодийцев. За века их пребывания на Севере был сформирован особый уклад быта, который во многом был обусловлен этническими верованиями. Кочевой образ жизни, способ ведения хозяйства, предметы быта, а также питание – всё это представляет собой сложное соединение факторов, позволяющих самодийцам выжить в суровых климатических условиях Крайнего Севера...`;

const TEXT_AI = `Подобно христианской культуре, культура самодийских народов представляет собой целостную систему, включающую религиозные представления, материальные элементы и обрядовую практику. Во второй главе были рассмотрены методы соотнесения религиозных образов, а также особенности соответствующей парадигмы мышления...`;

const SAMPLE_DRAFT_TEXT = `Система военного и морского духовенства Российской империи складывалась годами и окончательно закрепилась в «Положении об управлении церквами и духовенством Военного и Морского ведомств» 1890 года. Настоящей проверкой на прочность для этой структуры стала Русско-японская война 1904–1905 годов...`;

/* ========================================================================= */
/* MODELS                                                                    */
/* ========================================================================= */

export interface GeminiModelOption {
  id: string;
  name: string;
  rank: number;
  badge: string;
  tier?: string;
  description: string;
  intelligenceRating: number;
  speedRating: number;
  speed?: string;
  power?: string;
  badgeColor: string;
}

export const GEMINI_FREE_MODELS: GeminiModelOption[] = [
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash Lite',
    rank: 1,
    badge: '🏆 Рекомендуется (Высокая квота + Thinking)',
    tier: 'Усиленный режим (Thinking + Чертёж ДНК + Де-скелет + 2 кандидата)',
    description:
      'Основная рабочая модель для стабильного ежедневного использования без жёстких суточных лимитов. Использует Deep Thinking, JSON-чертёж стиля донора, разбор тезисов и многоступенчатый дожим.',
    intelligenceRating: 4,
    speedRating: 5,
    speed: 'Быстро (~2–5с)',
    power: '96%',
    badgeColor: 'bg-emerald-950 text-emerald-300 border-emerald-700/60',
  },
  {
    id: 'gemini-4-hydrogen',
    name: 'Gemini 4 Hydrogen (Flash)',
    rank: 2,
    badge: '⚡ Лимит Free Tier: 20 запр./день',
    tier: 'Глубокий стилевой синтез (при исчерпании квоты — авто-переход на Flash Lite)',
    description:
      'Флагман 4 поколения с лимитом Free Tier 20 запросов в сутки. Чертежи, критик и точечные правки автоматически выполняются через Flash Lite для экономии квоты; при 429 включается мгновенный авто-переход.',
    intelligenceRating: 5,
    speedRating: 5,
    speed: 'Быстро (~2–4с)',
    power: '100%',
    badgeColor: 'bg-blue-950 text-blue-300 border-blue-700/60',
  },
];

/* ========================================================================= */
/* DETECTORS                                                                 */
/* ========================================================================= */

export interface DetectorInfo {
  id: string;
  name: string;
  repo: string;
  url: string;
  category: string;
  shieldFocus?: string;
  description: string;
  shieldRule: string;
}

export const DETECTORS_LIST: DetectorInfo[] = [
  {
    id: 'binoculars',
    name: 'Binoculars Zero-Shot Metric',
    repo: 'vllm-project/binoculars',
    url: 'https://github.com/vllm-project/binoculars',
    category: 'Perplexity Ratio',
    description: 'Метрика соотношения перплексии и кросс-перплексии двух LLM. Самый строгий современный zero-shot тест.',
    shieldRule: 'Слом фиксированного соотношения перплексии, исключение предсказуемых пар токенов.',
  },
  {
    id: 'detectGpt',
    name: 'DetectGPT Curvature Test',
    repo: 'eric-mitchell/detect-gpt',
    url: 'https://github.com/eric-mitchell/detect-gpt',
    category: 'Log-Likelihood Curvature',
    description: 'Определение локальной отрицательной кривизны лог-правдоподобия при малых пертурбациях текста.',
    shieldRule: 'Ликвидация отрицательной кривизны: малые пертурбации не вызывают характерного падения вероятностей.',
  },
  {
    id: 'fastDetectGpt',
    name: 'Fast-DetectGPT',
    repo: 'BaoGengLiu/Fast-DetectGPT',
    url: 'https://github.com/BaoGengLiu/Fast-DetectGPT',
    category: 'Conditional Probability',
    description: 'Ускоренный детектор на основе условных вероятностей и локального скоринга без выборки пертурбаций.',
    shieldRule: 'Сглаживание локальных условных распределений, исключение машинных вероятностных плато.',
  },
  {
    id: 'gltr',
    name: 'GLTR (Giant Language Model Test Room)',
    repo: 'harvardnlp/gltr',
    url: 'https://github.com/harvardnlp/gltr',
    category: 'Token Rank Distribution',
    description:
      'Гарвардский визуализатор рангов токенов: распределение зеленого (Top-10), желтого (10-100), красного (100-1000) и фиолетового (>1000).',
    shieldRule: 'Снижение доли зеленых токенов Top-10 < 45%, регулярная инъекция редких токенов (>100 и >1000).',
  },
  {
    id: 'radar',
    name: 'RADAR Adversarial Paraphrase',
    repo: 'Trustworthy-ML-Lab/RADAR',
    url: 'https://github.com/Trustworthy-ML-Lab/RADAR',
    category: 'Adversarial Classifier',
    description: 'Состязательно обученный классификатор и парафразер против ИИ-текста от Trustworthy ML Lab.',
    shieldRule: 'Устранение стандартных эмбеддингов ИИ-парафразирования, глубокая авторская переработка.',
  },
  {
    id: 'ghostbuster',
    name: 'Ghostbuster Evaluator',
    repo: 'vivek-myers/ghostbuster',
    url: 'https://github.com/vivek3141/ghostbuster',
    category: 'N-gram Probability Matrix',
    description: 'Модель исследователей UC Berkeley на базе n-граммных вероятностей ряда скрытых языковых моделей.',
    shieldRule: 'Разрушение униграммных и триграммных вероятностных матриц, уникальные авторские коллокации.',
  },
  {
    id: 'sloptotal',
    name: 'SlopTotal (23-Engine Suite)',
    repo: 'pablocaeg/sloptotal',
    url: 'https://github.com/pablocaeg/sloptotal',
    category: '23-Engine Ensemble',
    shieldFocus: '23 движка + SlopBench',
    description:
      'Полноценная система из 23 движков (9 классификаторов, 7 zero-shot/статистик, 6 лингво-эвристик) с калибровкой по 18 языкам и сканером сайтов.',
    shieldRule:
      'Подавление AI-сигналов во всех 23 движках SlopTotal (лингвистические клише, структурная симметрия, формульность, burstiness, GLTR, Binoculars).',
  },
  {
    id: 'mgtEval',
    name: 'MGT-Eval (26-Model Eval & ASR)',
    repo: 'Liyuuuu111/MGT-Eval',
    url: 'https://github.com/Liyuuuu111/MGT-Eval',
    category: '26-Model Eval & ASR Benchmark',
    shieldFocus: '26 детекторов + ASR + Platt',
    description:
      'Полный бенчмарк из 26 детекторов (16 Metric-based включая LASTDE/fastMDE, Binoculars, LRR, NPR, TOCSIN + 10 Fine-tuned), Platt Scaling (IRLS), ROC/AUPRC и 14 атак VIPER/ASR.',
    shieldRule:
      'Снижение AI-сигналов по всем 26 моделям MGT-Eval (многомасштабная энтропия LASTDE/fastMDE, LRR, NPR, GLTR, Binoculars и 10 нейро-классификаторов).',
  },
  {
    id: 'mgtBench',
    name: 'MGTBench (14 Methods & 7-Class)',
    repo: 'TrustAIRLab/MGTBench',
    url: 'https://github.com/TrustAIRLab/MGTBench',
    category: '14-Method Suite & 7-Class Attribution',
    shieldFocus: '14 методов + PHD MST',
    description:
      'Эталонный бенчмарк CISPA из 14 детекторов (включая PHD Intrinsic Dimensionality через Prim MST, GLTR Test-2, LRR, NPR, DetectGPT, OpenAI-D, ChatGPT-D, ConDA, LM-D, GPTZero) + 7-классовая атрибуция LLM и Length Curves.',
    shieldRule:
      'Выравнивание внутренней размерности PHD MST до человеческого диапазона, разрушение GLTR Test-2 профилей и нейтрализация 5 модельных детекторов MGTBench.',
  },
  {
    id: 'detectZoo',
    name: 'DetectZoo (37 Text + 70 Cross-Modal)',
    repo: 'sadjadeb/DetectZoo',
    url: 'https://github.com/sadjadeb/DetectZoo',
    category: '37-Detector Text + 70-Zoo Suite',
    shieldFocus: '37 моделей + OOD/EER',
    description:
      'Унифицированный зоопарк DetectZoo: 37 текстовых детекторов (AdaDetectGPT, BiScope, GECScore, Glimpse, IPAD, IRM, Text Fluoroscopy, ReMoDetect, Lastde++, D-SVDD, HRN, Energy, PHD/MLE IDE, TOCSIN, CoCo, DeTeCtive) + каталог Image/Audio/Video (70 всего) и BenchmarkEvaluator с EER.',
    shieldRule:
      'Обход 37 алгоритмов DetectZoo (нейтрализация BiScope BCE/FCE, GECScore ROUGE-2, OOD Energy/D-SVDD, Text Fluoroscopy KL и B-сплайн-кривизны AdaDetectGPT).',
  },
  {
    id: 'robertaOpenAi',
    name: 'RoBERTa-Base OpenAI Detector',
    repo: 'roberta-base-openai-detector',
    url: 'https://huggingface.co/roberta-base-openai-detector',
    category: 'Supervised Classifier',
    description: 'Классификатор OpenAI на базе RoBERTa, натренированный отличать GPT-выходы.',
    shieldRule: 'Удаление субсловных артефактов токенизации BPE, свойственных моделям OpenAI.',
  },
  {
    id: 'desklib',
    name: 'Desklib AI Text Detector v1.01',
    repo: 'desklib/ai-text-detector-v1.01',
    url: 'https://huggingface.co/desklib/ai-text-detector-v1.01',
    category: 'Academic Essay Classifier',
    description: 'Эмбеддинговый детектор академических диссертаций, статей и эссе от Desklib.',
    shieldRule: 'Обеспечение естественной нелинейной структуры аргументации без штампованных связок.',
  },
  {
    id: 'aiTextJury',
    name: 'AITextJury Multi-Agent Consensus',
    repo: 'YiCQi/AITextJury',
    url: 'https://github.com/YiCQi/AITextJury',
    category: 'Multi-Agent Jury',
    description: 'Мультиагентная коллегия судей-нейросетей, анализирующая стиль с разных точек зрения.',
    shieldRule: 'Создание стилистической гетерогенности, исключающей консенсус судейских агентов.',
  },
  {
    id: 'hc3Comparison',
    name: 'HC3 ChatGPT Comparison Detection',
    repo: 'Hello-SimpleAI/chatgpt-comparison-detection',
    url: 'https://github.com/Hello-SimpleAI/chatgpt-comparison-detection',
    category: 'Human vs ChatGPT Benchmark',
    description: 'Бенчмарк сотен тысяч человеческих ответов против ChatGPT от Hello-SimpleAI.',
    shieldRule: 'Устранение предсказуемых вежливых и симметричных формулировок ChatGPT.',
  },
  {
    id: 'houtini',
    name: 'Houtini AI Detect',
    repo: 'houtini-ai/ai-detect',
    url: 'https://github.com/houtini-ai/ai-detect',
    category: 'Syntactic Pattern Scan',
    description: 'Детектор синтаксических паттернов и машинных аномалий.',
    shieldRule: 'Разрушение симметричных синтаксических паттернов, инверсия и парцелляция.',
  },
  {
    id: 'detectLlama',
    name: 'DetectLlama',
    repo: 'papo1011/DetectLlama',
    url: 'https://github.com/papo1011/DetectLlama',
    category: 'Open-Weight LLM Scan',
    description: 'Детектор текста, сгенерированного открытыми моделями семейства LLaMA.',
    shieldRule: 'Исключение характерных для открытых весов распределений токенов и стереотипных окончаний.',
  },
];

export interface DetectorScoreData {
  id: string;
  humanScore: number;
  aiScore: number;
  rawMetric: string;
  threshold: string;
  status: string;
  verdictLabel: string;
  riskLevel: 'low' | 'medium' | 'high';
  lastTestedAt?: number;
}

const THRESHOLDS: Record<string, string> = {
  binoculars: '< 0.901',
  detectGpt: 'Z < 0.15',
  fastDetectGpt: 'P > 0.85',
  gltr: '< 45%',
  radar: 'Conf > 0.80',
  ghostbuster: '< 0.12',
  sloptotal: '< 30 (Clean)',
  mgtEval: '< 50% P(AI)',
  mgtBench: '< 50% P(AI)',
  detectZoo: '< 50% P(AI)',
  robertaOpenAi: '< 10%',
  desklib: '< 8%',
  aiTextJury: '≥ 4/5',
  hc3Comparison: '< 5%',
  houtini: '< 0.20',
  detectLlama: '< 5%',
};

// Начальные значения нейтральные: пока текст не проверен, никаких «98% Человек» не показываем.
export const INITIAL_DETECTOR_SCORES: Record<string, DetectorScoreData> = Object.fromEntries(
  DETECTORS_LIST.map((d) => [
    d.id,
    {
      id: d.id,
      humanScore: 0,
      aiScore: 0,
      rawMetric: '—',
      threshold: THRESHOLDS[d.id] || '—',
      status: 'Не проверено',
      verdictLabel: 'Не проверено',
      riskLevel: 'low',
    } as DetectorScoreData,
  ])
);

/* ========================================================================= */
/* GAUGE                                                                     */
/* ========================================================================= */

export function DetectorDialGauge({
  humanScore = 0,
  aiScore = 0,
  isScanning = false,
  notTested = false,
}: {
  humanScore?: number;
  aiScore?: number;
  isScanning?: boolean;
  notTested?: boolean;
}) {
  const clampedHuman = Math.max(0, Math.min(100, humanScore));
  const needleAngle = notTested ? -120 : -120 + (clampedHuman / 100) * 240;

  const isHighHuman = clampedHuman >= 80;
  const isMedium = clampedHuman >= 60 && clampedHuman < 80;
  const strokeColor = notTested ? '#64748b' : isHighHuman ? '#10b981' : isMedium ? '#f59e0b' : '#f43f5e';
  const glowShadow = notTested
    ? 'none'
    : isHighHuman
    ? 'drop-shadow(0 0 6px rgba(16, 185, 129, 0.5))'
    : isMedium
    ? 'drop-shadow(0 0 6px rgba(245, 158, 11, 0.5))'
    : 'drop-shadow(0 0 6px rgba(244, 63, 94, 0.5))';

  const totalArc = 201.06;
  const progressOffset = isScanning ? totalArc * 0.5 : notTested ? totalArc : totalArc - (clampedHuman / 100) * totalArc;

  return (
    <div className="relative flex flex-col items-center justify-center select-none py-1">
      <svg viewBox="0 0 160 108" className="w-40 h-28 overflow-visible" aria-label={`Вероятность человека: ${notTested ? 'не проверено' : clampedHuman + '%'}`}>
        <path d="M 38.43 92.00 A 48 48 0 1 1 121.57 92.00" fill="none" stroke="#1e293b" strokeWidth="8" strokeLinecap="round" />

        {[0, 25, 50, 75, 100].map((tick) => {
          const angle = -120 + (tick / 100) * 240;
          const rad = (angle - 90) * (Math.PI / 180);
          return (
            <line
              key={tick}
              x1={80 + 38 * Math.cos(rad)}
              y1={68 + 38 * Math.sin(rad)}
              x2={80 + 43 * Math.cos(rad)}
              y2={68 + 43 * Math.sin(rad)}
              stroke="#475569"
              strokeWidth="1.5"
            />
          );
        })}

        <path
          d="M 38.43 92.00 A 48 48 0 1 1 121.57 92.00"
          fill="none"
          stroke={strokeColor}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray="201.06 300"
          strokeDashoffset={progressOffset}
          style={{ filter: glowShadow, transition: 'stroke-dashoffset 0.8s ease, stroke 0.4s ease' }}
          className={isScanning ? 'animate-pulse' : ''}
        />

        <g
          transform={`rotate(${isScanning ? 0 : needleAngle} 80 68)`}
          style={{ transition: 'transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
        >
          <polygon points="78,68 82,68 80.8,24 79.2,24" fill={strokeColor} style={{ filter: glowShadow }} />
          <circle cx="80" cy="68" r="6" fill="#090d16" stroke={strokeColor} strokeWidth="2.5" />
          <circle cx="80" cy="68" r="2.2" fill="#ffffff" />
        </g>

        <text x="80" y="54" textAnchor="middle" fill="#ffffff" fontSize="15" fontWeight="900" fontFamily="monospace">
          {isScanning ? '...' : notTested ? '—' : `${clampedHuman}%`}
        </text>

        <text
          x="80"
          y="84"
          textAnchor="middle"
          fill={notTested ? '#94a3b8' : isHighHuman ? '#34d399' : isMedium ? '#fbbf24' : '#f87171'}
          fontSize="8.5"
          fontWeight="800"
          letterSpacing="0.06em"
        >
          {isScanning ? 'СКАНИРОВАНИЕ' : notTested ? 'НЕ ПРОВЕРЕНО' : isHighHuman ? 'ЧЕЛОВЕК' : isMedium ? 'СОМНЕНИЕ' : 'ИИ-ТЕКСТ'}
        </text>

        <text x="24" y="98" fill="#f43f5e" fontSize="7" fontWeight="bold">ИИ</text>
        <text x="136" y="98" fill="#10b981" fontSize="7" fontWeight="bold" textAnchor="end">100%</text>
      </svg>
    </div>
  );
}

/* ========================================================================= */
/* HELPERS (pure, outside component)                                         */
/* ========================================================================= */

const AUDIT_URL = '/api/audit-detectors';

// Только действительно машинные штампы. Нормальные научные обороты
// («таким образом», «с одной стороны», «в свою очередь») сюда не входят.
const AI_CLICHES = [
  'в рамках',
  'при таком подходе',
  'следует отметить',
  'необходимо отметить',
  'необходимо подчеркнуть',
  'важно подчеркнуть',
  'важно отметить',
  'нельзя не отметить',
  'в конечном счете',
  'в конечном итоге',
  'является неотъемлемой частью',
  'неотъемлемой частью',
  'данное обстоятельство',
  'представляется возможным',
  'играет ключевую роль',
  'подводя итог',
  'краеугольный камень',
  'гобелен',
  'многогранн',
  'свидетельствует о том',
  'в современном дискурсе',
  'выступает ключевым фактором',
  'целесообразно отметить',
  'детерминирующим фактором',
];

// Без lookbehind: работает во всех браузерах, включая старые Safari.
const splitSentences = (text: string): string[] =>
  (text.match(/[^.!?…]+(?:[.!?…]+|$)/g) ?? []).map((s) => s.trim()).filter((s) => s.length > 2);

const countWords = (s: string) => s.split(/\s+/).filter(Boolean).length;

const wordCount = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const downloadBlob = (content: string, mime: string, filename: string) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const downloadAsDoc = (text: string, filename: string) => {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('');
  const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'></head><body>${paragraphs}</body></html>`;
  downloadBlob('\ufeff' + html, 'application/msword', filename);
};

const analyzeStyleMetrics = (text: string) => {
  if (!text || text.trim().length === 0) return null;

  const rawSentences = splitSentences(text);
  if (rawSentences.length === 0) return null;

  const sentenceWordCounts = rawSentences.map(countWords);
  const totalWords = sentenceWordCounts.reduce((a, b) => a + b, 0);
  const avgWords = totalWords / sentenceWordCounts.length;

  const variance =
    sentenceWordCounts.reduce((sum, len) => sum + Math.pow(len - avgWords, 2), 0) / sentenceWordCounts.length;
  const stdDev = Math.sqrt(variance);

  const burstiness = avgWords > 0 ? Number((stdDev / avgWords).toFixed(2)) : 0;
  const uniformityScore = Math.max(0, Math.min(100, Math.round((1 - Math.min(burstiness, 1)) * 100)));

  const lowerText = text.toLowerCase();
  const foundCliches = AI_CLICHES.filter((c) => lowerText.includes(c));

  return {
    sentenceCount: rawSentences.length,
    avgWords: Math.round(avgWords),
    minSentenceWords: Math.min(...sentenceWordCounts),
    maxSentenceWords: Math.max(...sentenceWordCounts),
    shortSentences: rawSentences.filter((s) => countWords(s) <= 8),
    burstiness,
    uniformityScore,
    foundCliches,
  };
};

// Эвристика, а не реальные детекторы. Полностью детерминирована (без Math.random).
const calculateLocalAudit = (text: string) => {
  const rawSentences = splitSentences(text);
  const sentenceWordCounts = rawSentences.map(countWords);
  const totalWords = sentenceWordCounts.reduce((a, b) => a + b, 0) || 1;
  const avgWords = totalWords / (rawSentences.length || 1);
  const variance =
    sentenceWordCounts.reduce((sum, len) => sum + Math.pow(len - avgWords, 2), 0) / (rawSentences.length || 1);
  const stdDev = Math.sqrt(variance);
  const burstiness = avgWords > 0 ? Number((stdDev / avgWords).toFixed(2)) : 0;

  const words = text.toLowerCase().match(/[а-яёa-z0-9-]+/gi) || [];
  const uniqueWords = new Set(words);
  const ttr = words.length > 0 ? Number((uniqueWords.size / words.length).toFixed(2)) : 0.5;

  const lower = text.toLowerCase();
  const foundCliches = AI_CLICHES.filter((c) => lower.includes(c));
  const clichePenalty = foundCliches.length * 7;
  const burstinessBonus = Math.min(18, Math.max(-25, Math.round((burstiness - 0.45) * 40)));
  const ttrBonus = Math.min(10, Math.max(-15, Math.round((ttr - 0.55) * 35)));

  const baseHuman = Math.max(12, Math.min(99, 96 - clichePenalty + burstinessBonus + ttrBonus));

  const top10 = Math.max(
    22,
    Math.min(68, Math.round(52 - burstiness * 18 - (foundCliches.length === 0 ? 8 : -foundCliches.length * 4)))
  );
  const top100 = Math.max(20, Math.min(38, Math.round(28 + ttr * 6)));
  const top1000 = Math.max(10, Math.min(26, Math.round(14 + burstiness * 6)));
  const outOf1000 = Math.max(4, 100 - (top10 + top100 + top1000));

  const binocularsScore = Math.max(0.795, Math.min(0.985, Number((0.835 + foundCliches.length * 0.035 - burstiness * 0.05).toFixed(3))));
  const detectGptCurvature = Math.max(0.012, Math.min(0.42, Number((0.045 + foundCliches.length * 0.04 - (burstiness > 0.6 ? 0.025 : 0)).toFixed(3))));
  const slopReport = runSlopTotalAnalysis(text);
  const slopHuman = Math.max(5, Math.min(99, Math.round(slopReport.humanScore)));
  const slopAi = Math.max(1, Math.min(95, Math.round(slopReport.overallScore)));

  const mgtReport = runMgtEvalDetection(text);
  const mgtHuman = Math.max(5, Math.min(99, Math.round(mgtReport.overallHumanProbability * 100)));
  const mgtAi = Math.max(1, Math.min(95, Math.round(mgtReport.overallAiProbability * 100)));

  const mgtBenchReport = runMgtBenchDetection(text);
  const mgtBenchHuman = Math.max(5, Math.min(99, Math.round(mgtBenchReport.overallHumanProbability * 100)));
  const mgtBenchAi = Math.max(1, Math.min(95, Math.round(mgtBenchReport.overallAiProbability * 100)));

  const detectZooReport = runDetectZooTextSuite(text);
  const detectZooHuman = Math.max(5, Math.min(99, Math.round(detectZooReport.overallHumanProbability * 100)));
  const detectZooAi = Math.max(1, Math.min(95, Math.round(detectZooReport.overallAiProbability * 100)));

  const detectorsMap: Record<string, { rawMetric: string; scoreDelta: number; overrideHuman?: number; overrideAi?: number }> = {
    binoculars: { rawMetric: `${binocularsScore}`, scoreDelta: binocularsScore < 0.901 ? 2 : -20 },
    detectGpt: { rawMetric: `Z = ${detectGptCurvature}`, scoreDelta: detectGptCurvature < 0.15 ? 1 : -18 },
    fastDetectGpt: { rawMetric: `P = ${Number(Math.min(0.99, baseHuman / 100 + 0.02).toFixed(2))}`, scoreDelta: 2 },
    gltr: { rawMetric: `Top-10: ${top10}%`, scoreDelta: top10 < 45 ? 1 : -15 },
    radar: { rawMetric: `Conf: ${Number(Math.min(0.99, baseHuman / 100).toFixed(2))}`, scoreDelta: 1 },
    ghostbuster: { rawMetric: `Diverg: ${Number(Math.max(0.02, 0.14 - (baseHuman / 100) * 0.1).toFixed(3))}`, scoreDelta: 1 },
    sloptotal: {
      rawMetric: `${slopReport.overallScore}/100 (${slopReport.enginesFlagged}/${slopReport.enginesTotal})`,
      scoreDelta: 0,
      overrideHuman: slopHuman,
      overrideAi: slopAi,
    },
    mgtEval: {
      rawMetric: `${mgtAi}% AI (${mgtReport.flaggedCount}/${mgtReport.totalRun})`,
      scoreDelta: 0,
      overrideHuman: mgtHuman,
      overrideAi: mgtAi,
    },
    mgtBench: {
      rawMetric: `${mgtBenchAi}% AI (${mgtBenchReport.flaggedCount}/${mgtBenchReport.totalRun})`,
      scoreDelta: 0,
      overrideHuman: mgtBenchHuman,
      overrideAi: mgtBenchAi,
    },
    detectZoo: {
      rawMetric: `${detectZooAi}% AI (${detectZooReport.flaggedCount}/${detectZooReport.totalRun})`,
      scoreDelta: 0,
      overrideHuman: detectZooHuman,
      overrideAi: detectZooAi,
    },
    robertaOpenAi: { rawMetric: `Fake: ${Math.max(1, 100 - baseHuman)}%`, scoreDelta: 0 },
    desklib: { rawMetric: `Anomaly: ${Math.max(1, Math.round((100 - baseHuman) * 0.7))}%`, scoreDelta: 2 },
    aiTextJury: {
      rawMetric: baseHuman >= 80 ? '5/5 Человек' : baseHuman >= 60 ? '3/5 Человек' : '1/5 Человек',
      scoreDelta: baseHuman >= 80 ? 1 : -10,
    },
    hc3Comparison: { rawMetric: `GPT-Sim: ${Math.max(1, Math.round((100 - baseHuman) * 0.8))}%`, scoreDelta: 1 },
    houtini: { rawMetric: `Sym: ${Number(Math.max(0.04, 0.25 - burstiness * 0.15).toFixed(2))}`, scoreDelta: 2 },
    detectLlama: { rawMetric: 'н/д (эвристика)', scoreDelta: 3 },
  };

  const results = Object.keys(detectorsMap).map((id) => {
    const meta = detectorsMap[id];
    const hScore =
      typeof meta.overrideHuman === 'number'
        ? meta.overrideHuman
        : Math.max(8, Math.min(99, Math.round(baseHuman + meta.scoreDelta)));
    const aScore = typeof meta.overrideAi === 'number' ? meta.overrideAi : 100 - hScore;
    return {
      id,
      humanScore: hScore,
      aiScore: aScore,
      rawMetric: meta.rawMetric,
      threshold: THRESHOLDS[id] || '—',
      status: hScore >= 80 ? 'Пройден (Человек)' : 'Подозрение на ИИ',
      verdictLabel: hScore >= 80 ? 'Человек (Аутентичный)' : hScore >= 60 ? 'Смешанный (Граница)' : 'ИИ (Сгенерирован)',
      riskLevel: (hScore >= 80 ? 'low' : hScore >= 60 ? 'medium' : 'high') as 'low' | 'medium' | 'high',
    };
  });

  const avgHuman = Math.round(results.reduce((acc, r) => acc + r.humanScore, 0) / results.length);

  return {
    auditedWords: words.length,
    overallHumanScore: avgHuman,
    overallAiScore: 100 - avgHuman,
    flaggedCount: results.filter((r) => r.humanScore < 70).length,
    totalAudited: results.length,
    verdict:
      avgHuman >= 85
        ? 'Эвристика: признаков машинного текста мало'
        : avgHuman >= 65
        ? 'Эвристика: умеренный риск'
        : 'Эвристика: много признаков машинного текста',
    gltrDistribution: { top10, top100, top1000, outOf1000 },
    binocularsScore: binocularsScore.toString(),
    detectGptCurvature: detectGptCurvature.toString(),
    sloptotalSummary: {
      overallScore: slopReport.overallScore,
      overallVerdict: slopReport.overallVerdict,
      confidence: slopReport.confidence,
      enginesFlagged: slopReport.enginesFlagged,
      enginesTotal: slopReport.enginesTotal,
      language: slopReport.language,
    },
    mgtEvalSummary: {
      overallAiPct: mgtAi,
      flaggedCount: mgtReport.flaggedCount,
      totalRun: mgtReport.totalRun,
      overallVerdict: mgtReport.overallVerdict,
    },
    mgtBenchSummary: {
      overallAiPct: mgtBenchAi,
      flaggedCount: mgtBenchReport.flaggedCount,
      totalRun: mgtBenchReport.totalRun,
      overallVerdict: mgtBenchReport.overallVerdict,
      phdIntrinsicDim: mgtBenchReport.phdIntrinsicDim,
    },
    detectZooSummary: {
      overallAiPct: detectZooAi,
      flaggedCount: detectZooReport.flaggedCount,
      totalRun: detectZooReport.totalRun,
      overallVerdict: detectZooReport.overallVerdict,
      meanConfidence: detectZooReport.meanConfidence,
      phdIntrinsicDim: detectZooReport.specialSignals.phdIntrinsicDim,
    },
    results,
  };
};

/* ========================================================================= */
/* MODULES (data-driven cards)                                               */
/* ========================================================================= */

type ColorKey = 'emerald' | 'purple' | 'amber' | 'teal' | 'blue' | 'cyan' | 'pink' | 'indigo';

const COLOR_STYLES: Record<ColorKey, { card: string; badge: string; toggle: string; text: string; box: string }> = {
  emerald: {
    card: 'from-slate-900 via-emerald-950/40 to-slate-900 border-emerald-500 ring-emerald-500/30',
    badge: 'bg-emerald-950 text-emerald-300 border-emerald-700/60',
    toggle: 'bg-emerald-500',
    text: 'text-emerald-400',
    box: 'border-emerald-800/40 text-emerald-300',
  },
  purple: {
    card: 'from-slate-900 via-purple-950/40 to-slate-900 border-purple-500 ring-purple-500/30',
    badge: 'bg-purple-950 text-purple-300 border-purple-700/60',
    toggle: 'bg-purple-600',
    text: 'text-purple-400',
    box: 'border-purple-800/40 text-purple-300',
  },
  amber: {
    card: 'from-slate-900 via-amber-950/40 to-slate-900 border-amber-500 ring-amber-500/30',
    badge: 'bg-amber-950 text-amber-300 border-amber-700/60',
    toggle: 'bg-amber-500',
    text: 'text-amber-400',
    box: 'border-amber-800/40 text-amber-300',
  },
  teal: {
    card: 'from-slate-900 via-teal-950/40 to-slate-900 border-teal-500 ring-teal-500/30',
    badge: 'bg-teal-950 text-teal-300 border-teal-700/60',
    toggle: 'bg-teal-500',
    text: 'text-teal-400',
    box: 'border-teal-800/40 text-teal-300',
  },
  blue: {
    card: 'from-slate-900 via-blue-950/40 to-slate-900 border-blue-500 ring-blue-500/30',
    badge: 'bg-blue-950 text-blue-300 border-blue-800',
    toggle: 'bg-blue-500',
    text: 'text-blue-400',
    box: 'border-blue-800/40 text-blue-300',
  },
  cyan: {
    card: 'from-slate-900 via-cyan-950/40 to-slate-900 border-cyan-500 ring-cyan-500/30',
    badge: 'bg-cyan-950 text-cyan-300 border-cyan-800',
    toggle: 'bg-cyan-500',
    text: 'text-cyan-400',
    box: 'border-cyan-800/40 text-cyan-300',
  },
  pink: {
    card: 'from-slate-900 via-pink-950/40 to-slate-900 border-pink-500 ring-pink-500/30',
    badge: 'bg-pink-950 text-pink-300 border-pink-800',
    toggle: 'bg-pink-500',
    text: 'text-pink-400',
    box: 'border-pink-800/40 text-pink-300',
  },
  indigo: {
    card: 'from-slate-900 via-indigo-950/40 to-slate-900 border-indigo-500 ring-indigo-500/30',
    badge: 'bg-indigo-950 text-indigo-300 border-indigo-800',
    toggle: 'bg-indigo-500',
    text: 'text-indigo-400',
    box: 'border-indigo-800/40 text-indigo-300',
  },
};

interface ModuleDef {
  key: FlagKey;
  group: 'author' | 'external';
  color: ColorKey;
  badge: string;
  title: string;
  short: string;
  Icon: React.ComponentType<{ className?: string }>;
  desc: string;
  footLabel: string;
  footValue: string;
  summary: string;
}

const MODULES: ModuleDef[] = [
  {
    key: 'basic',
    group: 'author',
    color: 'emerald',
    badge: 'PROMPTGPT V5.0',
    title: '1. Базовая ДНК автора',
    short: 'ДНК V5.0',
    Icon: Dna,
    desc: '100% тезисов Текста 2 переписываются в синтаксисе Текста 1. Зачистка шаблонных ИИ-клише («в рамках», «следует отметить»).',
    footLabel: 'Стиль',
    footValue: 'Донор Т1',
    summary: 'Модуль 1: Базовый перенос ДНК автора (КАК писать + 100% фактов ЧТО писать)',
  },
  {
    key: 'ultra',
    group: 'author',
    color: 'purple',
    badge: '4 ФАКТОРА',
    title: '2. Ультра-вариативность',
    short: 'Ультра (4 фактора)',
    Icon: Sparkles,
    desc: 'Неповторяющийся синтаксис, бёрстность >0.85, смысловой монтаж, живая экспрессия и органичные частицы («ведь», «же», «да и»).',
    footLabel: 'Ритм',
    footValue: 'Прерывистый',
    summary: 'Модуль 2: Ультра-вариативность (4 фактора слома монотонности)',
  },
  {
    key: 'targeted6',
    group: 'author',
    color: 'amber',
    badge: 'СТРОГО 6 ПРАВИЛ',
    title: '3. Де-искусственность',
    short: '6 правил',
    Icon: Zap,
    desc: 'Придаточные с «который», короткие фразы-акценты (2-4 сл.), тире/«это» вместо «является», 1 артефакт и 1 риторический вопрос на 600 сл.',
    footLabel: 'Режим',
    footValue: 'Точечный',
    summary: 'Модуль 3: Точечная де-искусственность (6 правил)',
  },
  {
    key: 'twentyCycles',
    group: 'author',
    color: 'teal',
    badge: 'МНОГОСТУПЕНЧАТАЯ КОНВЕРГЕНЦИЯ',
    title: '4. Глубокий аудит и дожим',
    short: 'Конвергенция (15 проверок × до 6 циклов)',
    Icon: ShieldCheck,
    desc: 'Извлекает JSON-чертёж донора, очищает Т2 от ИИ-скелета, выбирает лучшего из 2 кандидатов и гоняет 15-точечный контроль + LLM-критика стиля с хирургическими правками до 100% выполнения.',
    footLabel: 'Контроль',
    footValue: 'До 6 циклов + Критик',
    summary: 'Модуль 4: Глубокая конвергенция (Чертёж Т1 + Де-скелетизация Т2 + Best-of-2 + до 6 циклов 15 проверок + LLM-критик)',
  },
  {
    key: 'turnitout',
    group: 'external',
    color: 'blue',
    badge: 'AhmadHassan-BTed',
    title: 'Turnitout-Humanizer',
    short: 'Turnitout',
    Icon: ShieldCheck,
    desc: 'Слом непрерывных n-грамм, характерных для машинного текста. Сохранность формул, цитат и фактов.',
    footLabel: 'Цель',
    footValue: 'Слом n-грамм',
    summary: 'Модуль 5: Turnitout Humanizer (слом n-грамм)',
  },
  {
    key: 'lynote',
    group: 'external',
    color: 'cyan',
    badge: 'lynote-ai',
    title: 'Lynote Engine',
    short: 'Lynote',
    Icon: Layers,
    desc: 'Семантическая каденция человеческой речи, устранение «template vibes». Органичные паузы, естественный темпоритм мышления автора.',
    footLabel: 'Стиль',
    footValue: 'Живая каденция',
    summary: 'Модуль 6: Lynote Engine (семантическая каденция и снятие template vibes)',
  },
  {
    key: 'dadaNanjesha',
    group: 'external',
    color: 'pink',
    badge: 'DadaNanjesha',
    title: 'Tone & Register Shifter',
    short: 'Tone Shifter',
    Icon: ArrowDownUp,
    desc: 'Слом жесткого синтаксического шаблона S-V-O («Подлежащее-Сказуемое»). Активный живой залог вместо пассивного канцелярского монолога.',
    footLabel: 'Залог',
    footValue: 'Активный живой',
    summary: 'Модуль 7: Tone Shifter (слом паттерна S-V-O, активный залог)',
  },
  {
    key: 'blader',
    group: 'external',
    color: 'amber',
    badge: 'blader/humanizer',
    title: 'Wiki Signs Cleaner',
    short: 'Wiki Signs',
    Icon: FileCheck,
    desc: 'Зачистка по стандарту Wikipedia AI Cleanup: удаление напыщенных клише («краеугольный камень», «гобелен»), ложных контрастов и пустых выводов.',
    footLabel: 'Фильтр',
    footValue: 'Wiki AI Signs',
    summary: 'Модуль 8: Blader Humanizer (зачистка маркеров по Wikipedia Signs of AI)',
  },
  {
    key: 'perplexityTopics',
    group: 'external',
    color: 'indigo',
    badge: 'topics/humanize-ai',
    title: 'Perplexity & Entropy',
    short: 'Perplexity Booster',
    Icon: Activity,
    desc: 'Максимизация перплексии: слом вероятности предсказания следующего токена, распределение длин фраз от 2 до 45+ слов.',
    footLabel: 'Спектр',
    footValue: 'Перплексия',
    summary: 'Модуль 9: Topics Perplexity Booster (непредсказуемость токенов, разброс длин фраз)',
  },
];

const ALL_FLAG_KEYS = MODULES.map((m) => m.key);

const makeFlags = (on: FlagKey[]): Flags =>
  Object.fromEntries(ALL_FLAG_KEYS.map((k) => [k, on.includes(k)])) as Flags;

const PRESET_ALL = makeFlags(ALL_FLAG_KEYS);
const PRESET_NONE = makeFlags([]);
const PRESET_RECOMMENDED = makeFlags(['basic', 'ultra', 'twentyCycles', 'turnitout', 'lynote', 'blader', 'perplexityTopics']);
const PRESET_AUTHOR = makeFlags(['basic', 'ultra', 'twentyCycles']);
const DEFAULT_FLAGS = makeFlags(['basic', 'ultra', 'twentyCycles', 'turnitout', 'lynote', 'blader']);

/* ========================================================================= */
/* SMALL COMPONENTS                                                          */
/* ========================================================================= */

function OutputActions({
  text,
  baseName,
  withDoc = true,
}: {
  text: string;
  baseName: string;
  withDoc?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* буфер обмена недоступен */
    }
  };

  return (
    <div className="flex items-center space-x-2">
      <button
        type="button"
        onClick={copy}
        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1.5"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'Скопировано' : 'Копировать'}
      </button>
      <button
        type="button"
        onClick={() => downloadBlob(text, 'text/plain;charset=utf-8', `${baseName}-${Date.now()}.txt`)}
        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1.5"
      >
        <Download className="h-3.5 w-3.5" /> .txt
      </button>
      {withDoc && (
        <button
          type="button"
          onClick={() => downloadAsDoc(text, `${baseName}-${Date.now()}.doc`)}
          title="Файл в формате .doc (открывается в Word)"
          className="px-3 py-1.5 rounded-lg bg-blue-950 border border-blue-800 text-blue-300 text-xs flex items-center gap-1.5"
        >
          <FileCheck className="h-3.5 w-3.5" /> .doc (Word)
        </button>
      )}
    </div>
  );
}

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="p-3 rounded-xl bg-red-950/50 border border-red-800 text-red-300 text-xs">{message}</div>;
}

function OutputPanel({
  title,
  titleColor,
  text,
  loading,
  loadingText,
  placeholder,
  baseName,
  withDoc = true,
  spinnerColor = 'text-indigo-500',
  Icon = BookOpen,
}: {
  title: string;
  titleColor: string;
  text: string;
  loading: boolean;
  loadingText: string;
  placeholder: string;
  baseName: string;
  withDoc?: boolean;
  spinnerColor?: string;
  Icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 flex flex-col min-h-[520px]">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4 flex-wrap gap-2">
        <span className={`${titleColor} font-semibold text-sm`}>{title}</span>
        {text && <OutputActions text={text} baseName={baseName} withDoc={withDoc} />}
      </div>
      <div className="flex-1 bg-slate-950 border border-slate-800/80 rounded-xl p-5 text-sm text-slate-200 leading-relaxed overflow-y-auto max-h-[500px] whitespace-pre-wrap">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center space-y-3 py-20 text-slate-400">
            <RefreshCw className={`h-8 w-8 animate-spin ${spinnerColor}`} />
            <p className="text-sm">{loadingText}</p>
          </div>
        ) : text ? (
          text
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center py-20 text-slate-500 space-y-2">
            <Icon className="h-10 w-10 text-slate-600 mb-1" />
            <p className="text-slate-400">{placeholder}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ModuleCard({ mod, on, onToggle }: { mod: ModuleDef; on: boolean; onToggle: () => void }) {
  const c = COLOR_STYLES[mod.color];
  const Icon = mod.Icon;
  return (
    <div
      onClick={onToggle}
      role="switch"
      aria-checked={on}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
      className={`p-4 rounded-xl border transition-all duration-200 flex flex-col justify-between cursor-pointer ${
        on
          ? `bg-gradient-to-br ${c.card} shadow-md ring-1`
          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 opacity-70 hover:opacity-100'
      }`}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${c.badge}`}>{mod.badge}</span>
          <div className={`w-8 h-4 rounded-full transition-colors relative ${on ? c.toggle : 'bg-slate-700'}`}>
            <div
              className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all ${on ? 'left-[18px]' : 'left-0.5'}`}
            />
          </div>
        </div>
        <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
          <Icon className={`h-4 w-4 ${c.text}`} />
          {mod.title}
        </h4>
        <p className="text-[11px] text-slate-300 leading-relaxed">{mod.desc}</p>
      </div>
      <div className="pt-2 mt-2 border-t border-slate-800 text-[10px] flex justify-between text-slate-400">
        <span>
          {mod.footLabel}: <strong>{mod.footValue}</strong>
        </span>
        <span className={on ? `${c.text} font-semibold` : 'text-slate-500'}>{on ? '● Включен' : '○ Выключен'}</span>
      </div>
    </div>
  );
}

function TextInputCard({
  borderColor,
  titleColor,
  Icon,
  title,
  sampleLabel,
  sampleBtnClass,
  hint,
  focusBorder,
  value,
  onChange,
  onSample,
  placeholder,
}: {
  borderColor: string;
  titleColor: string;
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  sampleLabel: string;
  sampleBtnClass: string;
  hint: string;
  focusBorder: string;
  value: string;
  onChange: (v: string) => void;
  onSample: () => void;
  placeholder: string;
}) {
  return (
    <div className={`bg-slate-900/90 border ${borderColor} rounded-2xl p-6 shadow-xl space-y-4`}>
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-wrap gap-2">
        <div className={`flex items-center space-x-2 ${titleColor} font-bold text-sm`}>
          <Icon className="h-4 w-4" />
          <span>{title}</span>
        </div>
        <button type="button" onClick={onSample} className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${sampleBtnClass}`}>
          {sampleLabel}
        </button>
      </div>
      <p className="text-xs text-slate-400">{hint}</p>
      <textarea
        rows={10}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs text-slate-200 focus:outline-none ${focusBorder} leading-relaxed resize-y font-serif`}
      />
      <div className="flex justify-between items-center text-[11px] text-slate-500">
        <span>Слов: {wordCount(value)}</span>
        <button type="button" onClick={() => onChange('')} className="text-slate-500 hover:text-red-400">
          Очистить
        </button>
      </div>
    </div>
  );
}

/* ========================================================================= */
/* APP                                                                       */
/* ========================================================================= */

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('style-dna');
  const [activeWorkbenchDetector, setActiveWorkbenchDetector] = useState<string | null>(null);

  // Style DNA
  const [donorText, setDonorText] = useState(SAMPLE_DONOR_TEXT);
  const [contentText, setContentText] = useState(SAMPLE_CONTENT_TEXT);
  const [dnaResultText, setDnaResultText] = useState('');
  const [v2AccessKey, setV2AccessKey] = useState('');
  const [v2Status, setV2Status] = useState('');
  const [v2Diagnostics, setV2Diagnostics] = useState<any>(null);
  const [isGeneratingDna, setIsGeneratingDna] = useState(false);
  const [showPromptDetails, setShowPromptDetails] = useState(false);
  const [showActivePromptSummary, setShowActivePromptSummary] = useState(false);

  const [flags, setFlags] = useState<Flags>(DEFAULT_FLAGS);
  const activeEnginesCount = ALL_FLAG_KEYS.filter((k) => flags[k]).length;
  const toggleFlag = (k: FlagKey) => setFlags((prev) => ({ ...prev, [k]: !prev[k] }));

  // Model
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.1-flash-lite');
  const [lastUsedModel, setLastUsedModel] = useState('');
  const [fallbackOccurred, setFallbackOccurred] = useState(false);
  const selectedModelName = GEMINI_FREE_MODELS.find((m) => m.id === selectedModel)?.name || selectedModel;

  const [dnaRefinementMeta, setDnaRefinementMeta] = useState<{
    passes: number;
    cyclesRun?: number;
    issuesDetected: number;
    issuesRemaining: number;
    burstinessBefore: number;
    burstinessAfter: number;
    clichesBefore: number;
    clichesAfter: number;
    donorBurstinessTarget: number;
    factsLostBefore?: number;
    factsLostAfter?: number;
    factsPreservedPct?: number;
    dnaMatchBefore?: number;
    dnaMatchAfter?: number;
    humanScoreBefore?: number;
    humanScoreAfter?: number;
    overallScoreAfter?: number;
    blueprintExtracted?: boolean;
    deSkeletonized?: boolean;
    criticScore?: number | null;
    stopReason?: string;
  } | null>(null);

  // Shields
  const [detectorShields, setDetectorShields] = useState<Record<string, boolean>>(
    Object.fromEntries(DETECTORS_LIST.map((d) => [d.id, true]))
  );
  const activeShieldsCount = Object.values(detectorShields).filter(Boolean).length;

  const setShields = (ids: string[]) =>
    setDetectorShields(Object.fromEntries(DETECTORS_LIST.map((d) => [d.id, ids.includes(d.id)])));

  const handleSelectAllShields = () => setShields(DETECTORS_LIST.map((d) => d.id));
  const handleResetShields = () => setShields([]);
  const handleKeyAcademicShields = () =>
    setShields(['binoculars', 'detectGpt', 'fastDetectGpt', 'gltr', 'ghostbuster', 'sloptotal', 'radar', 'robertaOpenAi']);

  // Audit
  const [detectorScores, setDetectorScores] = useState<Record<string, DetectorScoreData>>(INITIAL_DETECTOR_SCORES);
  const [scanningDetectors, setScanningDetectors] = useState<Record<string, boolean>>({});
  const [auditTargetSource, setAuditTargetSource] = useState<'result' | 'content' | 'donor'>('result');
  const [auditResult, setAuditResult] = useState<any>(null);
  const [isAuditing, setIsAuditing] = useState(false);

  const getTextToAudit = (source = auditTargetSource): string => {
    if (source === 'content') return contentText;
    if (source === 'donor') return donorText;
    return dnaResultText || contentText;
  };

  // Humanizer
  const [inputTextAI, setInputTextAI] = useState(TEXT_AI);
  const [transformedText, setTransformedText] = useState('');
  const [styleIntensity, setStyleIntensity] = useState(9);
  const [promptStrategy, setPromptStrategy] = useState('');
  const [isGeneratingHumanizer, setIsGeneratingHumanizer] = useState(false);

  // Draft
  const [draftInputText, setDraftInputText] = useState(SAMPLE_DRAFT_TEXT);
  const [draftStrength, setDraftStrength] = useState(10);
  const [draftCustomInstructions] = useState('');
  const [draftOutputText, setDraftOutputText] = useState('');
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);

  // Academic
  const [academicInputText, setAcademicInputText] = useState(TEXT_AI);
  const [academicCustomInstructions, setAcademicCustomInstructions] = useState('');
  const [academicOutputText, setAcademicOutputText] = useState('');
  const [isGeneratingAcademic, setIsGeneratingAcademic] = useState(false);

  // History & local request counter
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [dailyUsage, setDailyUsage] = useState<{ count: number; date: string }>({
    count: 0,
    date: new Date().toDateString(),
  });

  // Ошибка привязана к вкладке, на которой возникла
  const [error, setErrorState] = useState<{ tab: TabId; msg: string } | null>(null);
  const setError = (msg: string | null) => setErrorState(msg ? { tab: activeTab, msg } : null);
  const tabError = error && error.tab === activeTab ? error.msg : null;

  useEffect(() => {
    try {
      const saved = localStorage.getItem('unified_app_history');
      if (saved) setHistory(JSON.parse(saved));
    } catch (e) {
      console.error(e);
    }

    const today = new Date().toDateString();
    try {
      const savedUsage = localStorage.getItem('api_daily_usage');
      if (savedUsage) {
        const parsed = JSON.parse(savedUsage);
        if (parsed.date === today) {
          setDailyUsage(parsed);
          return;
        }
      }
      setDailyUsage({ count: 0, date: today });
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Счётчик реально выполненных запросов к модели (приблизительный, локальный)
  const bumpUsage = () => {
    const today = new Date().toDateString();
    setDailyUsage((prev) => {
      const next = { count: prev.date === today ? prev.count + 1 : 1, date: today };
      try {
        localStorage.setItem('api_daily_usage', JSON.stringify(next));
      } catch {
        /* хранилище недоступно или переполнено */
      }
      return next;
    });
  };

  const saveToHistory = (output: string, strOrInt: number, input: string, type: HistoryType) => {
    const newItem: HistoryItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      type,
      strengthOrIntensity: strOrInt,
      inputText: input.slice(0, 600),
      outputText: output.slice(0, 4000),
    };
    setHistory((prev) => {
      const next = [newItem, ...prev].slice(0, 20);
      try {
        localStorage.setItem('unified_app_history', JSON.stringify(next));
      } catch {
        // Переполнение: оставляем только последние записи
        try {
          localStorage.setItem('unified_app_history', JSON.stringify(next.slice(0, 5)));
        } catch {
          /* игнорируем */
        }
      }
      return next;
    });
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // Повторяем ТОЛЬКО когда сервер прогревается (502/503 или «Starting Server...»).
  // Любая другая ошибка (429, 400, парсинг) выбрасывается сразу и не тратит квоту.
  const safePost = async (url: string, body: any, maxRetries = 3, extraHeaders: Record<string, string> = {}): Promise<any> => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...extraHeaders },
          body: JSON.stringify(body),
        });

        const contentType = res.headers.get('content-type') || '';

        if (contentType.includes('text/html') || !res.ok) {
          const text = await res.text();
          const isServerStarting = text.includes('Starting Server...') || res.status === 502 || res.status === 503;

          if (isServerStarting) {
            const warm: any = new Error('Сервер инициализируется. Пожалуйста, подождите несколько секунд и повторите запуск.');
            warm.warmup = true;
            throw warm;
          }

          let parsedErrorMessage: string | null = null;
          try {
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === 'object') {
              if (typeof parsed.error === 'string') {
                try {
                  const nested = JSON.parse(parsed.error);
                  parsedErrorMessage = nested?.error?.message || parsed.error;
                } catch {
                  parsedErrorMessage = parsed.error;
                }
              } else if (parsed.error?.message) {
                parsedErrorMessage = parsed.error.message;
              } else if (parsed.message) {
                parsedErrorMessage = parsed.message;
              }
            }
          } catch {
            /* не JSON */
          }

          if (parsedErrorMessage) throw new Error(parsedErrorMessage);
          throw new Error(`Ошибка сервера (${res.status}): ${text.slice(0, 150)}`);
        }

        const data = await res.json();
        if (url !== AUDIT_URL) bumpUsage();
        return data;
      } catch (err: any) {
        if (!err?.warmup || attempt === maxRetries) throw err;
        await sleep(1200);
      }
    }
    throw new Error('Не удалось связаться с сервером. Пожалуйста, обновите страницу.');
  };

  const applyScores = (items: any[]) => {
    setDetectorScores((prev) => {
      const updated = { ...prev };
      items.forEach((item) => {
        updated[item.id] = {
          ...(updated[item.id] || {}),
          id: item.id,
          humanScore: item.humanScore,
          aiScore: item.aiScore,
          rawMetric: item.rawMetric,
          threshold: item.threshold,
          status: item.status,
          verdictLabel: item.verdictLabel,
          riskLevel: item.riskLevel,
          lastTestedAt: Date.now(),
        };
      });
      return updated;
    });
  };

  const handleRunSingleDetector = async (detectorId: string) => {
    const text = getTextToAudit();
    if (!text.trim()) {
      setError('Нет текста для проверки детектора.');
      return;
    }
    setScanningDetectors((prev) => ({ ...prev, [detectorId]: true }));
    setError(null);

    try {
      const [data] = await Promise.all([safePost(AUDIT_URL, { text, detectorId }), sleep(300)]);
      if (data && data.singleDetector) {
        applyScores([{ id: detectorId, ...data.singleDetector }]);
      } else {
        throw new Error('empty');
      }
    } catch {
      const single = calculateLocalAudit(text).results.find((r) => r.id === detectorId);
      if (single) applyScores([single]);
    } finally {
      setScanningDetectors((prev) => ({ ...prev, [detectorId]: false }));
    }
  };

  const handleRunDetectorAudit = async (customText?: string) => {
    const textToCheck = customText || getTextToAudit();
    if (!textToCheck || !textToCheck.trim()) {
      setError(`Нет текста для аудита по ${DETECTORS_LIST.length} детекторам.`);
      return;
    }
    setIsAuditing(true);
    setError(null);
    setScanningDetectors(Object.fromEntries(DETECTORS_LIST.map((d) => [d.id, true])));

    try {
      const [data] = await Promise.all([safePost(AUDIT_URL, { text: textToCheck }), sleep(350)]);
      setAuditResult(data);
      if (data?.results && Array.isArray(data.results)) applyScores(data.results);
    } catch {
      const local = calculateLocalAudit(textToCheck);
      setAuditResult(local);
      applyScores(local.results);
    } finally {
      setIsAuditing(false);
      setScanningDetectors({});
    }
  };

  const handleRunSelectedDetectors = async (customText?: string) => {
    const selectedIds = DETECTORS_LIST.filter((d) => detectorShields[d.id]).map((d) => d.id);
    if (selectedIds.length === 0) {
      setError('Отметьте галочками хотя бы один детектор, чтобы запустить выборочное сканирование.');
      return;
    }
    const textToCheck = customText || getTextToAudit();
    if (!textToCheck || !textToCheck.trim()) {
      setError('Нет текста для сканирования выбранными детекторами.');
      return;
    }

    setIsAuditing(true);
    setError(null);
    setScanningDetectors(Object.fromEntries(selectedIds.map((id) => [id, true])));

    try {
      const [data] = await Promise.all([
        safePost(AUDIT_URL, { text: textToCheck, detectorIds: selectedIds }),
        sleep(300),
      ]);
      setAuditResult(data);
      if (data?.results && Array.isArray(data.results)) applyScores(data.results);
    } catch {
      const local = calculateLocalAudit(textToCheck);
      const allowed = new Set(selectedIds);
      const filteredResults = local.results.filter((r) => allowed.has(r.id));
      const subsetAvgHuman =
        filteredResults.length > 0
          ? Math.round(filteredResults.reduce((acc, r) => acc + r.humanScore, 0) / filteredResults.length)
          : local.overallHumanScore;
      setAuditResult({
        ...local,
        selectedMode: true,
        totalAudited: filteredResults.length,
        overallHumanScore: subsetAvgHuman,
        overallAiScore: 100 - subsetAvgHuman,
        flaggedCount: filteredResults.filter((r) => r.humanScore < 70).length,
        verdict:
          subsetAvgHuman >= 85
            ? 'Эвристика (выбранные): признаков машинного текста мало'
            : subsetAvgHuman >= 65
            ? 'Эвристика (выбранные): умеренный риск'
            : 'Эвристика (выбранные): много признаков машинного текста',
        results: filteredResults,
      });
      applyScores(filteredResults);
    } finally {
      setIsAuditing(false);
      setScanningDetectors({});
    }
  };

  const handleRunDnaTransfer = async () => {
    if (!donorText.trim() || !contentText.trim()) {
      setError('Пожалуйста, заполните оба поля: Текст 1 (образец стиля) и Текст 2 (содержание).');
      return;
    }
    setIsGeneratingDna(true);
    setError(null);
    setDnaRefinementMeta(null);
    setDnaResultText('');
    try {
      const data = await safePost('/api/style-dna-transfer', {
        text1: donorText,
        text2: contentText,
        flags,
        shields: detectorShields,
        enable20CycleCheck: flags.twentyCycles,
        model: selectedModel,
      });
      setDnaResultText(data.result);
      setDnaRefinementMeta(data.refinementMeta || null);
      if (data.usedModel) {
        const found = GEMINI_FREE_MODELS.find((m) => m.id === data.usedModel);
        setLastUsedModel(found?.name || data.usedModel);
        setFallbackOccurred(!!data.fallbackOccurred);
      }

      setAuditTargetSource('result');
      handleRunDetectorAudit(data.result);

      const activeList = MODULES.filter((m) => flags[m.key]).map((m) => m.short);
      if (activeShieldsCount > 0) activeList.push(`${activeShieldsCount} щитов детекции`);

      saveToHistory(
        data.result,
        Math.min(100, activeEnginesCount * 12),
        `[${selectedModelName} | ${activeList.join(' + ') || 'Без модулей'}] Т1: ${donorText.slice(0, 35)}... | Т2: ${contentText.slice(0, 35)}...`,
        'style-dna'
      );
    } catch (err: any) {
      setError(err.message || 'Ошибка переноса стилевой ДНК');
    } finally {
      setIsGeneratingDna(false);
    }
  };

  const handleRunDnaTransferV2 = async () => {
    if (!donorText.trim() || !contentText.trim()) {
      setError('Пожалуйста, заполните оба поля: Текст 1 (образец стиля) и Текст 2 (содержание).');
      return;
    }
    if (!v2AccessKey.trim()) {
      setError('Введите ключ PROMPTGPT_V2_ACCESS_KEY, заданный в настройках сервера.');
      return;
    }

    setIsGeneratingDna(true);
    setError(null);
    setV2Status('');
    setV2Diagnostics(null);
    setDnaResultText('');

    try {
      let res: Response | null = null;
      let rawText = '';
      for (let attempt = 1; attempt <= 3; attempt++) {
        res = await fetch('/api/v2/style-transfer', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-PromptGPT-V2-Key': v2AccessKey.trim(),
          },
          body: JSON.stringify({ donorText, sourceText: contentText }),
        });

        const contentType = res.headers.get('content-type') || '';
        rawText = await res.text();
        const isWarmup =
          (contentType.includes('text/html') && rawText.includes('Starting Server...')) ||
          res.status === 502 ||
          res.status === 503;

        if (isWarmup && !rawText.trim().startsWith('{') && attempt < 3) {
          await sleep(1200);
          continue;
        }
        break;
      }

      if (!res) {
        throw new Error('Не удалось связаться с сервером. Пожалуйста, повторите попытку.');
      }

      let data: any = null;
      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch {
        data = null;
      }

      if (data && typeof data === 'object' && 'status' in data) {
        bumpUsage();
        setV2Diagnostics(data);
        setV2Status(
          `PROMPTGPT v2: ${data.status || 'неизвестный статус'}; создано вариантов: ${data.generation?.generated ?? 0}.`
        );

        if (data.status !== 'accepted' || typeof data.selectedText !== 'string' || !data.selectedText.trim()) {
          const firstCandidate = Array.isArray(data.candidates) ? data.candidates[0] : undefined;
          const firstEval = firstCandidate?.finalEvaluation || firstCandidate?.initial;
          const detail =
            data.error?.message ||
            firstEval?.rejectionReasons?.[0] ||
            data.warnings?.[0] ||
            firstCandidate?.warnings?.[0] ||
            'Ни один вариант не прошёл обязательные проверки смысла и стиля.';
          throw new Error(`PROMPTGPT v2 завершил работу со статусом «${data.status || 'unknown'}». ${detail}`);
        }

        setDnaResultText(data.selectedText);
        setDnaRefinementMeta(null);
        setAuditTargetSource('result');
        handleRunDetectorAudit(data.selectedText);
        saveToHistory(
          data.selectedText,
          100,
          `[PROMPTGPT v2] Т1: ${donorText.slice(0, 35)}... | Т2: ${contentText.slice(0, 35)}...`,
          'style-dna'
        );
        return;
      }

      if (!res.ok) {
        const errorMessage =
          (typeof data?.error === 'string' ? data.error : data?.error?.message) ||
          data?.message ||
          (rawText.includes('Starting Server...')
            ? 'Сервер инициализируется. Пожалуйста, подождите несколько секунд и повторите запуск.'
            : `Ошибка сервера (${res.status}).`);
        throw new Error(errorMessage);
      }

      throw new Error('Сервер вернул неожиданный ответ от PROMPTGPT v2.');
    } catch (err: any) {
      setError(err.message || 'Ошибка PROMPTGPT v2');
    } finally {
      setIsGeneratingDna(false);
    }
  };

  const handleTransformHumanizer = async () => {
    if (!inputTextAI.trim()) {
      setError('Пожалуйста, введите текст для преобразования.');
      return;
    }
    setIsGeneratingHumanizer(true);
    setError(null);
    try {
      const data = await safePost('/api/transform-text', {
        text: inputTextAI,
        promptStrategy,
        styleIntensity,
        flags,
        shields: detectorShields,
        model: selectedModel,
      });
      setTransformedText(data.transformedText);
      saveToHistory(data.transformedText, styleIntensity, inputTextAI, 'humanizer');
    } catch (err: any) {
      setError(err.message || 'Ошибка трансформации');
    } finally {
      setIsGeneratingHumanizer(false);
    }
  };

  const handleGenerateDraft = async () => {
    if (!draftInputText.trim()) {
      setError('Пожалуйста, введите текст для создания черновика.');
      return;
    }
    setIsGeneratingDraft(true);
    setError(null);
    try {
      const data = await safePost('/api/generate-draft', {
        text: draftInputText,
        strength: draftStrength,
        customInstructions: draftCustomInstructions,
        model: selectedModel,
      });
      setDraftOutputText(data.draft);
      saveToHistory(data.draft, draftStrength, draftInputText, 'draft');
    } catch (err: any) {
      setError(err.message || 'Ошибка генерации черновика');
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  const handleAcademicEdit = async () => {
    if (!academicInputText.trim()) {
      setError('Пожалуйста, введите текст для редактирования по 39 правилам.');
      return;
    }
    setIsGeneratingAcademic(true);
    setError(null);
    try {
      const data = await safePost('/api/academic-edit', {
        text: academicInputText,
        customInstructions: academicCustomInstructions,
        model: selectedModel,
      });
      setAcademicOutputText(data.editedText);
      saveToHistory(data.editedText, 39, academicInputText, 'academic-39');
    } catch (err: any) {
      setError(err.message || 'Ошибка академического редактирования');
    } finally {
      setIsGeneratingAcademic(false);
    }
  };

  const dnaMetrics = useMemo(() => analyzeStyleMetrics(dnaResultText), [dnaResultText]);

  if (activeWorkbenchDetector) {
    return (
      <DetectorWorkbench
        detectorId={activeWorkbenchDetector}
        onSelectDetector={(id: string) => setActiveWorkbenchDetector(id)}
        onBack={() => setActiveWorkbenchDetector(null)}
        currentDnaResult={dnaResultText}
        currentContentText={contentText}
        currentDonorText={donorText}
      />
    );
  }

  const NAV_TABS: { id: TabId; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'academic-39', label: '39 правил регламента', Icon: CheckSquare },
    { id: 'sandbox', label: 'Алхимик Человечности', Icon: Sparkles },
    { id: 'draft-workshop', label: 'Черновики (Ур. 1-10)', Icon: BookOpen },
    { id: 'analysis', label: 'Анализ Различий', Icon: Search },
  ];

  const tabBtn = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
      active ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
    }`;

  const authorModules = MODULES.filter((m) => m.group === 'author');
  const externalModules = MODULES.filter((m) => m.group === 'external');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur sticky top-0 z-30 px-6 py-4 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Dna className="h-5 w-5 text-white animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              PROMPTGPT ∞ Style DNA Transfer Engine
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-medium border border-indigo-500/30">
                v5.0 Pro
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Глубокое извлечение и перенос стилевой ДНК автора (Текст 1: КАК писать ➔ Текст 2: ЧТО писать)
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 bg-slate-900/90 p-1 rounded-xl border border-slate-800 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveTab('style-dna')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'style-dna'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md'
                : 'text-indigo-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Dna className="h-3.5 w-3.5" />
            🧬 ДНК-Трансфер (PROMPTGPT V5.0)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sloptotal')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'sloptotal'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                : 'bg-emerald-950/70 text-emerald-300 hover:text-white hover:bg-emerald-900 border border-emerald-700/60'
            }`}
            title="Полноценный SlopTotal: 23 движка, поабзацная тепловая карта и сканер сайтов"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            🛡️ SlopTotal (23 движка)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('mgt-eval')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'mgt-eval'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                : 'bg-purple-950/70 text-purple-300 hover:text-white hover:bg-purple-900 border border-purple-700/60'
            }`}
            title="Полноценный MGT-Eval: 26 моделей, 14 атак VIPER/ASR, Platt Calibration и ROC/AUROC бенчмарк"
          >
            <Activity className="h-3.5 w-3.5" />
            🧪 MGT-Eval (26 моделей)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('mgt-bench')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'mgt-bench'
                ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-md'
                : 'bg-cyan-950/70 text-cyan-300 hover:text-white hover:bg-cyan-900 border border-cyan-700/60'
            }`}
            title="Полноценный MGTBench (TrustAIRLab): 14 методов, PHD Prim MST, 7-классовая атрибуция LLM и Multi-Length Curve"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            📐 MGTBench (14 методов)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('detect-zoo')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'detect-zoo'
                ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-md'
                : 'bg-amber-950/70 text-amber-300 hover:text-white hover:bg-amber-900 border border-amber-700/60'
            }`}
            title="Полноценный DetectZoo (sadjadeb/DetectZoo): 37 текст-детекторов, OOD/BiScope/Fluoroscopy, BenchmarkEvaluator EER и каталог 70 моделей"
          >
            <Sparkles className="h-3.5 w-3.5" />
            🦁 DetectZoo (37+70 мод.)
          </button>
          <button
            type="button"
            onClick={() => setActiveWorkbenchDetector('gltr')}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 bg-indigo-950/80 text-indigo-300 hover:text-white hover:bg-indigo-900 border border-indigo-700/60 cursor-pointer shadow-sm"
            title={`Открыть лабораторию с полным функционалом каждого из ${DETECTORS_LIST.length} детекторов`}
          >
            <Maximize2 className="h-3.5 w-3.5 text-indigo-400" />
            🔬 Стенды {DETECTORS_LIST.length} Детекторов
          </button>
          {NAV_TABS.map(({ id, label, Icon }) => (
            <button key={id} type="button" onClick={() => setActiveTab(id)} className={tabBtn(activeTab === id)}>
              <Icon className={`h-3.5 w-3.5 ${id === 'academic-39' ? 'text-amber-400' : ''}`} />
              {label}
            </button>
          ))}
          <button type="button" onClick={() => setActiveTab('history')} className={tabBtn(activeTab === 'history')}>
            <History className="h-3.5 w-3.5" />
            История ({history.length})
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Local request counter */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-2">
                <span>Запросы к модели сегодня ({selectedModelName})</span>
              </div>
              <p className="text-xs text-slate-400">
                Выполнено в этом браузере: <strong className="text-slate-200">{dailyUsage.count}</strong>. Это локальный счётчик: реальный лимит определяет ваш API-ключ.
              </p>
            </div>
          </div>
        </div>

        {/* ===================== TAB: STYLE DNA ===================== */}
        {activeTab === 'style-dna' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-purple-950 border border-indigo-800/60 rounded-2xl p-6 shadow-2xl space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center space-x-3">
                  <div className="p-3 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                    <Dna className="h-7 w-7" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">
                      Глубокий перенос авторской стилевой ДНК (Style DNA Transfer Engine V5.0)
                    </h2>
                    <p className="text-xs text-slate-300">
                      <strong>Текст 1 (Донор)</strong> определяет <span className="text-indigo-400 font-semibold">КАК писать</span>.{' '}
                      <strong>Текст 2 (Материал)</strong> определяет <span className="text-purple-400 font-semibold">ЧТО писать</span>.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowPromptDetails(!showPromptDetails)}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-xs text-slate-300 flex items-center gap-1.5 border border-slate-700 transition-colors"
                >
                  <FileCode className="h-3.5 w-3.5 text-indigo-400" />
                  {showPromptDetails ? 'Скрыть регламент V5.0' : 'Показать регламент V5.0'}
                </button>
              </div>

              {/* Model selector */}
              <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center space-x-2">
                    <Cpu className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs font-bold text-slate-200">Модель Gemini (от мощной к быстрой):</span>
                  </div>
                  <span className="text-[11px] text-slate-400 bg-slate-800/60 px-2.5 py-0.5 rounded-full border border-slate-700/60">
                    Активная: <strong className="text-emerald-300">{selectedModelName}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {GEMINI_FREE_MODELS.map((m) => {
                    const isSelected = selectedModel === m.id;
                    return (
                      <div
                        key={m.id}
                        onClick={() => setSelectedModel(m.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedModel(m.id);
                          }
                        }}
                        role="button"
                        aria-pressed={isSelected}
                        tabIndex={0}
                        className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer relative flex flex-col justify-between ${
                          isSelected
                            ? 'bg-slate-900 border-emerald-500/80 ring-2 ring-emerald-500/30 shadow-lg'
                            : 'bg-slate-950/70 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
                            <span className="font-bold text-xs text-white flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                              {m.name}
                            </span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${m.badgeColor}`}>{m.badge}</span>
                          </div>
                          <div className="text-[11px] font-semibold text-slate-300 mb-1">{m.tier}</div>
                          <p className="text-[10.5px] text-slate-400 leading-relaxed mb-2.5">{m.description}</p>
                        </div>
                        <div className="flex items-center justify-between text-[10.5px] text-slate-400 border-t border-slate-800/80 pt-2">
                          <span>
                            Скорость: <strong className="text-slate-200">{m.speed}</strong>
                          </span>
                          <span>
                            Мощность: <strong className="text-emerald-400">{m.power}</strong>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {showPromptDetails && (
                <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-2 leading-relaxed">
                  <p className="font-semibold text-indigo-300">📌 Ключевые протоколы движка V5.0:</p>
                  <ul className="list-disc list-inside space-y-1 text-slate-400">
                    <li>
                      <strong>Не улучшать, а воспроизводить:</strong> копируются реальные синтаксические привычки и неровности автора, без приглаживания под усредненный стандарт.
                    </li>
                    <li>
                      <strong>Сохранение 100% содержания:</strong> ни один факт, тезис или аргумент Текста 2 не теряется; факты Текста 1 не примешиваются.
                    </li>
                    <li>
                      <strong>Многоступенчатая конвергенция:</strong> чертёж синтаксиса донора + де-скелетизация Текста 2 + выбор лучшего из 2 кандидатов + до 6 циклов хирургического дожима по 15 метрикам и LLM-критику (с запретом ухудшения качества и потери фактов).
                    </li>
                  </ul>
                </div>
              )}
            </div>

            {/* Modules */}
            <div className="space-y-5">
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center space-x-2.5">
                    <Sliders className="h-5 w-5 text-indigo-400" />
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                        <span>Стек хуманизаторов и алгоритмов (независимые переключатели)</span>
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${
                            activeEnginesCount > 0
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-600/60'
                              : 'bg-red-950 text-red-300 border-red-800'
                          }`}
                        >
                          Активно: {activeEnginesCount} из {MODULES.length} модулей
                        </span>
                      </h3>
                      <p className="text-xs text-slate-400">
                        Каждый модуль включается отдельно и комбинируется со всеми остальными в единый промт.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <button
                      type="button"
                      onClick={() => setFlags(PRESET_ALL)}
                      className="px-2.5 py-1.5 rounded-lg bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-800 transition-colors font-medium flex items-center gap-1"
                    >
                      <Sparkles className="h-3 w-3" /> Все {MODULES.length} модулей (Максимум)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFlags(PRESET_RECOMMENDED)}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 transition-colors font-medium flex items-center gap-1"
                    >
                      <ShieldCheck className="h-3 w-3" /> Рекомендуемый набор
                    </button>
                    <button
                      type="button"
                      onClick={() => setFlags(PRESET_AUTHOR)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                    >
                      Только авторские V5
                    </button>
                    <button
                      type="button"
                      onClick={() => setFlags(PRESET_NONE)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-red-950 hover:text-red-300 text-slate-400 border border-slate-700 transition-colors"
                    >
                      Сброс
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowActivePromptSummary(!showActivePromptSummary)}
                      className="px-2.5 py-1.5 rounded-lg bg-purple-950 hover:bg-purple-900 text-purple-300 border border-purple-800 transition-colors flex items-center gap-1"
                    >
                      <FileCode className="h-3 w-3" />
                      {showActivePromptSummary ? 'Скрыть промт' : 'Инспектор промта'}
                    </button>
                  </div>
                </div>

                {showActivePromptSummary && (
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-indigo-900/40 text-xs text-slate-300 space-y-2">
                    <div className="font-semibold text-indigo-300 flex items-center gap-1.5">
                      <Terminal className="h-3.5 w-3.5 text-indigo-400" />
                      <span>Состав активного промта ({activeEnginesCount} модулей):</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                      {MODULES.filter((m) => flags[m.key]).map((m) => (
                        <div key={m.key} className={`p-2 rounded bg-slate-900 border ${COLOR_STYLES[m.color].box}`}>
                          ✓ {m.summary}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center space-x-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
                  <Dna className="h-4 w-4 text-emerald-400" />
                  <span>Блок 1: авторские модули PROMPTGPT V5.0</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  {authorModules.map((m) => (
                    <ModuleCard key={m.key} mod={m} on={flags[m.key]} onToggle={() => toggleFlag(m.key)} />
                  ))}
                </div>
              </div>

              <div className="space-y-2.5 pt-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center space-x-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
                    <Terminal className="h-4 w-4 text-indigo-400" />
                    <span>Блок 2: внешние программы и открытые хуманизаторы (GitHub)</span>
                  </div>
                  <span className="text-[11px] text-slate-400">Работают независимо или вместе с любыми авторскими правилами</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5">
                  {externalModules.map((m) => (
                    <ModuleCard key={m.key} mod={m} on={flags[m.key]} onToggle={() => toggleFlag(m.key)} />
                  ))}
                </div>
              </div>
            </div>

            {/* Inputs */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              <TextInputCard
                borderColor="border-indigo-800/40"
                titleColor="text-indigo-400"
                Icon={UserCheck}
                title="ТЕКСТ 1 — Образец авторской манеры (Донор стиля)"
                sampleLabel="Загрузить пример 1 (Аскетизм)"
                sampleBtnClass="bg-indigo-950 border-indigo-800 text-indigo-300 hover:bg-indigo-900"
                hint="Вставьте сюда фрагмент автора, чей синтаксис, лексику, ритм и обороты нужно извлечь как стилевую ДНК. Лучше брать живой текст реального автора."
                focusBorder="focus:border-indigo-500"
                value={donorText}
                onChange={setDonorText}
                onSample={() => setDonorText(SAMPLE_DONOR_TEXT)}
                placeholder="Вставьте образец авторского письма..."
              />
              <TextInputCard
                borderColor="border-purple-800/40"
                titleColor="text-purple-400"
                Icon={FileText}
                title="ТЕКСТ 2 — Материал для переработки (Содержание)"
                sampleLabel="Загрузить пример 2 (Атеизм)"
                sampleBtnClass="bg-purple-950 border-purple-800 text-purple-300 hover:bg-purple-900"
                hint="Вставьте сюда исходный текст, тезисы и факты которого должны быть полностью переписаны в стиле Текста 1."
                focusBorder="focus:border-purple-500"
                value={contentText}
                onChange={setContentText}
                onSample={() => setContentText(SAMPLE_CONTENT_TEXT)}
                placeholder="Вставьте текст с фактами и содержанием..."
              />
            </div>

            <div className="rounded-xl border border-cyan-800/60 bg-cyan-950/20 p-4 space-y-2">
              <label htmlFor="promptgpt-v2-access-key" className="block text-xs font-semibold text-cyan-200">
                Ключ доступа к новому движку PROMPTGPT v2
              </label>
              <input
                id="promptgpt-v2-access-key"
                type="password"
                autoComplete="off"
                value={v2AccessKey}
                onChange={(event) => setV2AccessKey(event.target.value)}
                placeholder="Введите значение PROMPTGPT_V2_ACCESS_KEY из настроек сервера"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
              />
              <p className="text-[11px] text-slate-400">
                Ключ не сохраняется в истории и передаётся только серверу в заголовке запроса. Для работы v2 администратор должен задать такой же ключ в переменных окружения.
              </p>
              {v2Status && <p className="text-xs text-cyan-200">{v2Status}</p>}
            </div>

            {tabError && <div className="p-4 rounded-xl bg-red-950/50 border border-red-800 text-red-300 text-xs">{tabError}</div>}

            <div className="flex justify-center">
              <button
                type="button"
                onClick={handleRunDnaTransfer}
                disabled={isGeneratingDna || !donorText.trim() || !contentText.trim() || activeEnginesCount === 0}
                className="w-full max-w-lg py-4 rounded-2xl font-bold shadow-xl flex items-center justify-center space-x-3 disabled:opacity-50 transition-all text-sm bg-gradient-to-r from-emerald-600 via-indigo-600 to-purple-600 hover:from-emerald-500 hover:to-purple-500 text-white shadow-indigo-600/30 cursor-pointer"
              >
                {isGeneratingDna ? (
                  <>
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    <span>
                      Синтез {activeEnginesCount} модулей + {activeShieldsCount} щитов ({selectedModelName})...
                    </span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5 text-amber-300" />
                    <span>
                      {activeEnginesCount === 0
                        ? 'Выберите хотя бы 1 модуль'
                        : `🧬 Запустить ДНК-перенос (Стек: ${activeEnginesCount} мод. + ${activeShieldsCount} щитов)`}
                    </span>
                  </>
                )}
              </button>
            </div>

            <div className="flex justify-center">
              <button
                type="button"
                onClick={handleRunDnaTransferV2}
                disabled={isGeneratingDna || !donorText.trim() || !contentText.trim() || !v2AccessKey.trim()}
                className="w-full max-w-lg rounded-2xl border border-cyan-500/60 bg-cyan-950/50 px-5 py-3 font-bold text-sm text-cyan-100 shadow-lg shadow-cyan-950/30 transition-colors hover:bg-cyan-900/70 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isGeneratingDna ? 'PROMPTGPT v2 выполняет проверки...' : '🧬 Запустить новый PROMPTGPT v2 (семантическая защита + Style DNA)'}
              </button>
            </div>

            {v2Diagnostics && (
              <div className="rounded-2xl border border-cyan-800/60 bg-slate-900/90 p-5 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-base font-bold text-cyan-300">Диагностика PROMPTGPT v2</h3>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                    v2Diagnostics.status === 'accepted'
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                      : v2Diagnostics.status === 'needs-review'
                        ? 'bg-amber-950 text-amber-300 border-amber-700'
                        : 'bg-red-950 text-red-300 border-red-700'
                  }`}>
                    {v2Diagnostics.status || 'Неизвестный статус'}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    ['Создано вариантов', v2Diagnostics.generation?.generated],
                    ['Не удалось создать', v2Diagnostics.generation?.failed],
                    ['Проверено кандидатов', v2Diagnostics.candidates?.length],
                    ['Этапов обработки', v2Diagnostics.trace?.length]
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-xl bg-slate-950 p-3 border border-slate-800">
                      <div className="text-xs text-slate-400">{label}</div>
                      <div className="text-xl font-bold text-white">{value ?? 0}</div>
                    </div>
                  ))}
                </div>

                {v2Diagnostics.error?.message && (
                  <div className="rounded-xl border border-red-800 bg-red-950/40 p-3">
                    <div className="text-sm font-bold text-red-300">Ошибка обработки</div>
                    <p className="text-sm text-red-200 mt-1">{v2Diagnostics.error.message}</p>
                  </div>
                )}

                {Array.isArray(v2Diagnostics.candidates) && v2Diagnostics.candidates.map((candidate: any, index: number) => {
                  const evaluation = candidate.finalEvaluation || candidate.initial;
                  const semantic = evaluation?.semanticReport;
                  const style = evaluation?.styleReport;
                  return (
                    <div key={candidate.candidateId || index} className="rounded-xl border border-slate-700 bg-slate-950/80 p-4 space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="font-semibold text-white">Кандидат {index + 1}</div>
                        <span className="text-xs text-cyan-300">{evaluation?.disposition || 'Статус неизвестен'}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-lg bg-slate-900 p-2">
                          <div className="text-xs text-slate-400">Стилевое сходство</div>
                          <div className="font-bold text-white">{style?.score != null ? `${style.score} / 100` : 'Нет оценки'}</div>
                        </div>
                        <div className="rounded-lg bg-slate-900 p-2">
                          <div className="text-xs text-slate-400">Сохранение смысла</div>
                          <div className={semantic?.passed ? 'font-bold text-emerald-300' : 'font-bold text-red-300'}>
                            {semantic?.passed == null ? 'Нет данных' : semantic.passed ? 'Пройдено' : 'Не пройдено'}
                          </div>
                        </div>
                      </div>
                      {Array.isArray(evaluation?.rejectionReasons) && evaluation.rejectionReasons.length > 0 && (
                        <div>
                          <div className="text-xs font-bold text-red-300 mb-2">Причины отклонения</div>
                          <ul className="list-disc pl-5 space-y-1 text-xs text-red-200">
                            {evaluation.rejectionReasons.map((reason: string, i: number) => <li key={i}>{reason}</li>)}
                          </ul>
                        </div>
                      )}
                      {Array.isArray(evaluation?.warnings) && evaluation.warnings.length > 0 && (
                        <div>
                          <div className="text-xs font-bold text-amber-300 mb-2">Предупреждения</div>
                          <ul className="list-disc pl-5 space-y-1 text-xs text-amber-200">
                            {evaluation.warnings.map((warning: string, i: number) => <li key={i}>{warning}</li>)}
                          </ul>
                        </div>
                      )}
                      {Array.isArray(candidate.warnings) && candidate.warnings.length > 0 && (
                        <ul className="list-disc pl-5 space-y-1 text-xs text-amber-200">
                          {candidate.warnings.map((warning: string, i: number) => <li key={i}>{warning}</li>)}
                        </ul>
                      )}
                      {typeof candidate.finalText === 'string' && candidate.finalText.trim() && (
                        <details className="rounded-lg border border-slate-800 bg-slate-900/70 p-2">
                          <summary className="cursor-pointer text-xs font-semibold text-slate-300">
                            Текст кандидата ({candidate.finalText.length} симв.)
                          </summary>
                          <p className="mt-2 whitespace-pre-wrap text-xs text-slate-300 leading-relaxed">
                            {candidate.finalText}
                          </p>
                        </details>
                      )}
                    </div>
                  );
                })}

                {Array.isArray(v2Diagnostics.warnings) && v2Diagnostics.warnings.length > 0 && (
                  <div className="rounded-xl border border-amber-800/60 bg-amber-950/20 p-3">
                    <div className="font-bold text-sm text-amber-300 mb-2">Общие предупреждения системы</div>
                    <ul className="list-disc pl-5 space-y-1 text-xs text-amber-200">
                      {v2Diagnostics.warnings.map((warning: string, i: number) => <li key={i}>{warning}</li>)}
                    </ul>
                  </div>
                )}

                {Array.isArray(v2Diagnostics.trace) && v2Diagnostics.trace.length > 0 && (
                  <details className="rounded-xl border border-slate-700 p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-cyan-300">
                      Журнал этапов обработки ({v2Diagnostics.trace.length})
                    </summary>
                    <div className="mt-3 space-y-2">
                      {v2Diagnostics.trace.map((event: any, i: number) => (
                        <div key={i} className="border-l-2 border-cyan-800 pl-3 py-1">
                          <div className="text-xs font-bold text-slate-200">{event.stage}</div>
                          <div className="text-xs text-slate-400">{event.message}</div>
                          {event.candidateId && <div className="text-[10px] text-slate-500">{event.candidateId}</div>}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}

            {/* Detectors */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-4 border-b border-slate-800 pb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 rounded-xl bg-indigo-950/80 border border-indigo-700/50 text-indigo-400">
                    <ShieldCheck className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="text-base font-bold text-white">Щиты и эвристический аудит {DETECTORS_LIST.length} ИИ-детекторов</h3>
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${
                          activeShieldsCount > 0
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-600/70'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        Активно щитов: {activeShieldsCount} из {DETECTORS_LIST.length}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Каждый флажок добавляет в промт правила против детектора и позволяет запустить сканирование только выбранных циферблатов.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <button
                    type="button"
                    onClick={handleSelectAllShields}
                    className="px-3 py-1.5 rounded-lg bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-800 transition-colors font-medium flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckSquare className="h-3.5 w-3.5 text-indigo-400" />
                    Все {DETECTORS_LIST.length} щитов
                  </button>
                  <button
                    type="button"
                    onClick={handleKeyAcademicShields}
                    className="px-3 py-1.5 rounded-lg bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 transition-colors font-medium flex items-center gap-1.5 cursor-pointer"
                  >
                    <Zap className="h-3.5 w-3.5 text-emerald-400" />
                    Ключевые (8 шт.)
                  </button>
                  <button
                    type="button"
                    onClick={handleResetShields}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 transition-colors cursor-pointer"
                  >
                    Сбросить
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRunSelectedDetectors()}
                    disabled={isAuditing || activeShieldsCount === 0}
                    className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-md"
                    title="Запустить сканирование только тех детекторов, которые отмечены галочками"
                  >
                    {isAuditing ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        <span>Проверка выбранных...</span>
                      </>
                    ) : (
                      <>
                        <CheckSquare className="h-3.5 w-3.5" />
                        <span>🎯 Запустить выбранные ({activeShieldsCount} шт.)</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRunDetectorAudit()}
                    disabled={isAuditing}
                    className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white font-bold transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-md"
                  >
                    {isAuditing ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        <span>Сканирование всех {DETECTORS_LIST.length} циферблатов...</span>
                      </>
                    ) : (
                      <>
                        <BarChart3 className="h-3.5 w-3.5" />
                        <span>⚡ Запустить все {DETECTORS_LIST.length} циферблатов</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/50 text-xs text-amber-200 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  Циферблаты показывают <strong>эвристическую оценку</strong> (длина предложений, разнообразие лексики, список штампов), а не результат работы реальных детекторов. Зелёный циферблат не гарантирует, что настоящий Turnitin, GPTZero или другой сервис пропустит текст.
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between flex-wrap gap-3 text-xs">
                <div className="flex items-center space-x-2 text-slate-300">
                  <Activity className="h-4 w-4 text-indigo-400" />
                  <span className="font-semibold">Проверяемый текст для циферблатов:</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {(
                    [
                      { id: 'result', label: `🟢 Результат ДНК V5 (${dnaResultText ? 'Готов' : 'Пока пуст'})`, text: dnaResultText, on: 'bg-emerald-950 text-emerald-300 border-emerald-600' },
                      { id: 'content', label: '🟣 Исходный Текст 2 (ИИ-материал)', text: contentText, on: 'bg-purple-950 text-purple-300 border-purple-600' },
                      { id: 'donor', label: '🔵 Текст 1 (Автор-Донор)', text: donorText, on: 'bg-indigo-950 text-indigo-300 border-indigo-600' },
                    ] as const
                  ).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setAuditTargetSource(s.id);
                        if (s.text) handleRunDetectorAudit(s.text);
                      }}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition border ${
                        auditTargetSource === s.id
                          ? `${s.on} shadow-sm`
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {auditResult && (
                <div className="p-4 rounded-xl bg-slate-950 border border-indigo-900/60 space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-3 border-b border-slate-800/80 pb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <BarChart3 className="h-4 w-4 text-emerald-400" />
                      <span className="text-xs font-bold text-white">
                        Эвристическая оценка ({auditResult.auditedWords || 0} слов):
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-slate-800 text-slate-200 border border-slate-600">
                        {auditResult.overallHumanScore}% Человек / {auditResult.overallAiScore ?? 100 - auditResult.overallHumanScore}% ИИ
                      </span>
                      <span className="text-xs text-slate-400">
                        ({auditResult.flaggedCount} из {auditResult.totalAudited || DETECTORS_LIST.length} оценок ниже порога
                        {auditResult.selectedMode ? ' • выборочный скан' : ''})
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Вывод: <strong className="text-slate-200">{auditResult.verdict}</strong>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                    {auditResult.gltrDistribution && (
                      <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-slate-400 font-semibold">GLTR-подобное распределение:</span>
                          <span className="text-emerald-400 font-mono">
                            {auditResult.gltrDistribution.top1000 + auditResult.gltrDistribution.outOf1000}% редких
                          </span>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden flex bg-slate-800">
                          <div style={{ width: `${auditResult.gltrDistribution.top10}%` }} className="bg-emerald-500" />
                          <div style={{ width: `${auditResult.gltrDistribution.top100}%` }} className="bg-amber-400" />
                          <div style={{ width: `${auditResult.gltrDistribution.top1000}%` }} className="bg-red-400" />
                          <div style={{ width: `${auditResult.gltrDistribution.outOf1000}%` }} className="bg-purple-500" />
                        </div>
                        <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                          <span className="text-emerald-400">Зел:{auditResult.gltrDistribution.top10}%</span>
                          <span className="text-amber-400">Жел:{auditResult.gltrDistribution.top100}%</span>
                          <span className="text-red-400">Крас:{auditResult.gltrDistribution.top1000}%</span>
                          <span className="text-purple-400">Фиол:{auditResult.gltrDistribution.outOf1000}%</span>
                        </div>
                      </div>
                    )}

                    {auditResult.binocularsScore && (
                      <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-slate-400 font-semibold">Binoculars-подобная метрика:</span>
                          <span className="text-slate-200 font-mono font-bold">{auditResult.binocularsScore}</span>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          Порог: &lt; 0.901 ({Number(auditResult.binocularsScore) < 0.901 ? 'ниже порога' : 'на грани или выше'})
                        </p>
                      </div>
                    )}

                    {auditResult.detectGptCurvature && (
                      <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-slate-400 font-semibold">DetectGPT-подобная кривизна:</span>
                          <span className="text-slate-200 font-mono font-bold">{auditResult.detectGptCurvature}</span>
                        </div>
                        <p className="text-[10px] text-slate-400">Порог: &lt; 0.15.</p>
                      </div>
                    )}

                    {auditResult.sloptotalSummary && (
                      <div
                        onClick={() => setActiveTab('sloptotal')}
                        className="p-2.5 rounded-lg bg-slate-900 hover:bg-slate-800/80 border border-indigo-700/60 space-y-1 cursor-pointer transition"
                        title="Открыть полный отчёт SlopTotal (23 движка)"
                      >
                        <div className="flex justify-between text-[11px]">
                          <span className="text-indigo-300 font-semibold">SlopTotal (23 движка):</span>
                          <span className="text-white font-mono font-bold">{auditResult.sloptotalSummary.overallScore}/100</span>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          {auditResult.sloptotalSummary.overallVerdict} • флагов: {auditResult.sloptotalSummary.enginesFlagged}/{auditResult.sloptotalSummary.enginesTotal} →
                        </p>
                      </div>
                    )}

                    {auditResult.mgtEvalSummary && (
                      <div
                        onClick={() => setActiveTab('mgt-eval')}
                        className="p-2.5 rounded-lg bg-slate-900 hover:bg-slate-800/80 border border-purple-700/60 space-y-1 cursor-pointer transition"
                        title="Открыть полный отчёт MGT-Eval (26 моделей)"
                      >
                        <div className="flex justify-between text-[11px]">
                          <span className="text-purple-300 font-semibold">MGT-Eval (26 моделей):</span>
                          <span className="text-white font-mono font-bold">{auditResult.mgtEvalSummary.overallAiPct}% AI</span>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          {auditResult.mgtEvalSummary.overallVerdict} • флагов: {auditResult.mgtEvalSummary.flaggedCount}/{auditResult.mgtEvalSummary.totalRun} →
                        </p>
                      </div>
                    )}

                    {auditResult.mgtBenchSummary && (
                      <div
                        onClick={() => setActiveTab('mgt-bench')}
                        className="p-2.5 rounded-lg bg-slate-900 hover:bg-slate-800/80 border border-cyan-700/60 space-y-1 cursor-pointer transition"
                        title="Открыть полный отчёт MGTBench (14 методов + PHD MST + Атрибуция)"
                      >
                        <div className="flex justify-between text-[11px]">
                          <span className="text-cyan-300 font-semibold">MGTBench (14 методов):</span>
                          <span className="text-white font-mono font-bold">{auditResult.mgtBenchSummary.overallAiPct}% AI</span>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          PHD={auditResult.mgtBenchSummary.phdIntrinsicDim} • флагов: {auditResult.mgtBenchSummary.flaggedCount}/{auditResult.mgtBenchSummary.totalRun} →
                        </p>
                      </div>
                    )}

                    {auditResult.detectZooSummary && (
                      <div
                        onClick={() => setActiveTab('detect-zoo')}
                        className="p-2.5 rounded-lg bg-slate-900 hover:bg-slate-800/80 border border-amber-700/60 space-y-1 cursor-pointer transition"
                        title="Открыть полный отчёт DetectZoo (37 моделей + BenchmarkEvaluator + 70-Zoo)"
                      >
                        <div className="flex justify-between text-[11px]">
                          <span className="text-amber-300 font-semibold">DetectZoo (37 моделей):</span>
                          <span className="text-white font-mono font-bold">{auditResult.detectZooSummary.overallAiPct}% AI</span>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          Conf={(auditResult.detectZooSummary.meanConfidence * 100).toFixed(0)}% • флагов: {auditResult.detectZooSummary.flaggedCount}/{auditResult.detectZooSummary.totalRun} →
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {DETECTORS_LIST.map((d) => {
                  const isChecked = !!detectorShields[d.id];
                  const score = detectorScores[d.id] || INITIAL_DETECTOR_SCORES[d.id];
                  const isScanning = !!scanningDetectors[d.id];
                  const notTested = !score.lastTestedAt;

                  return (
                    <div
                      key={d.id}
                      className={`p-4 rounded-2xl border transition-all duration-300 text-xs flex flex-col justify-between ${
                        isChecked
                          ? 'bg-slate-950 border-indigo-600/70 shadow-lg ring-1 ring-indigo-500/30'
                          : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2 border-b border-slate-800/60 pb-2.5">
                          <div className="flex items-center space-x-2.5 flex-1 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => setDetectorShields((prev) => ({ ...prev, [d.id]: e.target.checked }))}
                              aria-label={`Щит: ${d.name}`}
                              className="w-4 h-4 rounded text-indigo-600 bg-slate-800 border-slate-700 focus:ring-indigo-500 focus:ring-offset-slate-900 cursor-pointer shrink-0"
                            />
                            <div
                              onClick={() => setActiveWorkbenchDetector(d.id)}
                              className="min-w-0 flex-1 cursor-pointer group"
                              title="Нажмите, чтобы открыть полный лабораторный стенд детектора"
                            >
                              <span className="font-bold text-white text-xs block leading-tight truncate group-hover:text-indigo-300 transition-colors">
                                {d.name}
                              </span>
                              <span className="text-[10px] font-mono text-indigo-400 block mt-0.5 truncate">{d.repo}</span>
                            </div>
                          </div>

                          <a
                            href={d.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`Открыть репозиторий ${d.repo}`}
                            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[9.5px] px-2 py-0.5 rounded font-mono font-medium bg-slate-900 text-slate-300 border border-slate-800">
                            {d.category}
                          </span>
                          {d.shieldFocus && (
                            <span className="text-[9.5px] px-2 py-0.5 rounded font-semibold bg-indigo-950/70 text-indigo-300 border border-indigo-800/50">
                              {d.shieldFocus}
                            </span>
                          )}
                        </div>

                        <div
                          onClick={() => setActiveWorkbenchDetector(d.id)}
                          className="bg-slate-900/70 hover:bg-slate-900/90 rounded-xl p-2.5 border border-slate-800/80 hover:border-indigo-600/70 transition-all flex flex-col items-center justify-center relative overflow-hidden cursor-pointer"
                          title="Нажмите на циферблат для перехода в полный режим детектора"
                        >
                          <DetectorDialGauge
                            humanScore={score.humanScore}
                            aiScore={score.aiScore}
                            isScanning={isScanning}
                            notTested={notTested}
                          />

                          <div className="w-full flex items-center justify-between gap-2 mt-1 px-1">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-700/60">
                              Человек: {notTested ? '—' : `${score.humanScore}%`}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-950/80 text-rose-300 border border-rose-700/60">
                              ИИ: {notTested ? '—' : `${score.aiScore}%`}
                            </span>
                          </div>

                          <div className="w-full mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
                            <span>
                              Показатель: <strong className="text-slate-200 font-mono">{score.rawMetric}</strong>
                            </span>
                            <span>
                              Порог: <strong className="text-slate-400 font-mono">{score.threshold}</strong>
                            </span>
                          </div>
                        </div>

                        <p className="text-[11px] text-slate-400 leading-relaxed">{d.description}</p>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-slate-800/80 space-y-2">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className={`font-medium ${isChecked ? 'text-emerald-400' : 'text-slate-500'}`}>
                            {isChecked ? '🛡️ Щит в промте: ВКЛ' : 'Щит отключен'}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold border text-[9.5px] ${
                              notTested
                                ? 'bg-slate-900 text-slate-400 border-slate-700'
                                : score.humanScore >= 80
                                ? 'bg-emerald-950 text-emerald-300 border-emerald-700/60'
                                : score.humanScore >= 60
                                ? 'bg-amber-950 text-amber-300 border-amber-700/60'
                                : 'bg-rose-950 text-rose-300 border-rose-700/60'
                            }`}
                          >
                            {score.status}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => setActiveWorkbenchDetector(d.id)}
                          className="w-full py-2 px-3 rounded-lg bg-indigo-950/90 hover:bg-indigo-900 text-indigo-200 hover:text-white border border-indigo-700/70 text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-md"
                        >
                          <Maximize2 className="h-3.5 w-3.5 text-indigo-400" />
                          <span>🔬 Открыть полный стенд детектора</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRunSingleDetector(d.id)}
                          disabled={isScanning || isAuditing}
                          className="w-full py-1 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800/90 text-[11px] font-medium flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                        >
                          {isScanning ? (
                            <>
                              <RefreshCw className="h-3 w-3 animate-spin text-indigo-400" />
                              <span>Вычисление...</span>
                            </>
                          ) : (
                            <>
                              <Zap className="h-3 w-3 text-amber-400" />
                              <span>Быстрая проверка циферблата</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Result */}
            {dnaResultText && (
              <div className="bg-slate-900/90 border border-emerald-800/50 rounded-2xl p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4 flex-wrap gap-3">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-base flex-wrap">
                    <Check className="h-5 w-5" />
                    <span>Результат: ТЕКСТ 2, переписанный в стилевой ДНК ТЕКСТА 1</span>
                    {lastUsedModel && (
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-normal">
                        Модель: <strong className="text-emerald-300">{lastUsedModel}</strong>
                        {fallbackOccurred && <span className="text-amber-400 ml-1.5 font-medium">(авто-переход)</span>}
                      </span>
                    )}
                  </div>
                  <OutputActions text={dnaResultText} baseName="style-dna-result" />
                </div>

                <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-6 text-sm text-slate-100 leading-relaxed font-serif whitespace-pre-wrap max-h-[600px] overflow-y-auto">
                  {dnaResultText}
                </div>

                {dnaMetrics && (
                  <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 flex-wrap gap-2">
                      <div className="flex items-center space-x-2 text-xs font-bold text-white">
                        <BarChart3 className="h-4 w-4 text-indigo-400" />
                        <span>Экспресс-аудит прерывистости и штампов</span>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        Предложений: <strong className="text-slate-200">{dnaMetrics.sentenceCount}</strong> | Средняя длина:{' '}
                        <strong className="text-slate-200">{dnaMetrics.avgWords}</strong> сл.
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-400">Шаблоны и канцелярит:</span>
                          <span
                            className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                              dnaMetrics.foundCliches.length === 0
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : 'bg-red-950 text-red-300 border border-red-800'
                            }`}
                          >
                            {dnaMetrics.foundCliches.length === 0 ? '0 найдено' : `${dnaMetrics.foundCliches.length} найдено`}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300">
                          {dnaMetrics.foundCliches.length === 0
                            ? `Из ${AI_CLICHES.length} проверяемых машинных оборотов ни один не найден. Это не гарантия «человечности».`
                            : `Обнаружены обороты: ${dnaMetrics.foundCliches.join(', ')}`}
                        </p>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-400">Однородность предложений:</span>
                          <span
                            className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                              dnaMetrics.uniformityScore < 45
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : dnaMetrics.uniformityScore < 70
                                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                : 'bg-red-950 text-red-300 border border-red-800'
                            }`}
                          >
                            {dnaMetrics.uniformityScore}% {dnaMetrics.uniformityScore < 45 ? '(Хороший разброс)' : ''}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300">
                          Разброс: от <strong className="text-white">{dnaMetrics.minSentenceWords}</strong> до{' '}
                          <strong className="text-white">{dnaMetrics.maxSentenceWords}</strong> слов.
                        </p>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-400">Бёрстность (ритм):</span>
                          <span
                            className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                              dnaMetrics.burstiness >= 0.65
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : dnaMetrics.burstiness >= 0.45
                                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                : 'bg-red-950 text-red-300 border border-red-800'
                            }`}
                          >
                            {dnaMetrics.burstiness} {dnaMetrics.burstiness >= 0.65 ? '(Живой ритм)' : ''}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300">
                          Коротких фраз (≤ 8 сл.): <strong className="text-white">{dnaMetrics.shortSentences.length}</strong> шт.
                        </p>
                      </div>
                    </div>

                    {dnaRefinementMeta && (
                      <div className="pt-2.5 border-t border-slate-800/70 space-y-2 text-[11px] text-slate-300">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <span>
                            Замкнутый конвейер качества:{' '}
                            <strong className="text-emerald-400">
                              {dnaRefinementMeta.passes}{' '}
                              {dnaRefinementMeta.passes === 1
                                ? 'проход'
                                : dnaRefinementMeta.passes < 5
                                ? 'прохода'
                                : 'проходов'}
                            </strong>
                            {typeof dnaRefinementMeta.cyclesRun === 'number' && dnaRefinementMeta.cyclesRun > 0 && (
                              <span className="text-slate-400"> (циклов дожима: {dnaRefinementMeta.cyclesRun})</span>
                            )}
                          </span>
                          <span className="font-mono text-slate-400">
                            Burstiness:{' '}
                            <strong className="text-white">
                              {dnaRefinementMeta.burstinessBefore} → {dnaRefinementMeta.burstinessAfter}
                            </strong>{' '}
                            (цель: {dnaRefinementMeta.donorBurstinessTarget}) · Дефекты:{' '}
                            <strong className="text-emerald-300">
                              {dnaRefinementMeta.issuesDetected} → {dnaRefinementMeta.issuesRemaining}
                            </strong>
                          </span>
                        </div>

                        <div className="flex items-center justify-between flex-wrap gap-2 text-[10.5px]">
                          <div className="flex items-center gap-2 flex-wrap">
                            {typeof dnaRefinementMeta.dnaMatchAfter === 'number' && (
                              <span className="px-2 py-0.5 rounded bg-indigo-950/80 border border-indigo-700/60 text-indigo-200 font-mono">
                                ДНК донора: {dnaRefinementMeta.dnaMatchBefore ?? dnaRefinementMeta.dnaMatchAfter}% →{' '}
                                <strong>{dnaRefinementMeta.dnaMatchAfter}%</strong>
                              </span>
                            )}
                            {typeof dnaRefinementMeta.humanScoreAfter === 'number' && (
                              <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-700/60 text-emerald-200 font-mono">
                                Анти-ИИ чистота: {dnaRefinementMeta.humanScoreBefore ?? dnaRefinementMeta.humanScoreAfter}% →{' '}
                                <strong>{dnaRefinementMeta.humanScoreAfter}%</strong>
                              </span>
                            )}
                            {typeof dnaRefinementMeta.factsPreservedPct === 'number' && (
                              <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-200 font-mono">
                                Факты Т2: <strong>{dnaRefinementMeta.factsPreservedPct}%</strong>
                              </span>
                            )}
                            {dnaRefinementMeta.blueprintExtracted && (
                              <span className="px-2 py-0.5 rounded bg-purple-950/70 border border-purple-700/50 text-purple-300">
                                Чертёж Т1 ✓
                              </span>
                            )}
                            {dnaRefinementMeta.deSkeletonized && (
                              <span className="px-2 py-0.5 rounded bg-cyan-950/70 border border-cyan-700/50 text-cyan-300">
                                Де-скелет Т2 ✓
                              </span>
                            )}
                            {typeof dnaRefinementMeta.criticScore === 'number' && (
                              <span className="px-2 py-0.5 rounded bg-amber-950/70 border border-amber-700/50 text-amber-200 font-mono">
                                Критик: {dnaRefinementMeta.criticScore}/100
                              </span>
                            )}
                          </div>
                          {dnaRefinementMeta.stopReason && (
                            <span className="text-slate-400 italic">{dnaRefinementMeta.stopReason}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800/60 flex-wrap gap-2">
                  <span>
                    Объем: <strong>{wordCount(dnaResultText)}</strong> слов (Текст 2 исходный: {wordCount(contentText)} слов)
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {MODULES.filter((m) => flags[m.key]).map((m) => {
                      const Icon = m.Icon;
                      return (
                        <span
                          key={m.key}
                          className={`text-[11px] px-2 py-0.5 rounded border flex items-center gap-1 ${COLOR_STYLES[m.color].badge}`}
                        >
                          <Icon className="h-3 w-3" /> {m.short}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================== TAB: ACADEMIC 39 ===================== */}
        {activeTab === 'academic-39' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-6 space-y-6">
              <div className="bg-slate-900/80 border border-amber-800/40 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center space-x-2 text-amber-400 font-semibold text-sm">
                    <CheckSquare className="h-5 w-5" />
                    <span>Академический редактор (39 правил регламента)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAcademicInputText(TEXT_AI)}
                    className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300"
                  >
                    Загрузить пример текста
                  </button>
                </div>

                <p className="text-xs text-slate-400">
                  Редактирует текст по всем 39 пунктам регламента: контроль прерывистости (burstiness), отсутствие шаблонных мостиков, запрет гладких финалов абзацев, проверка конкретики и терминологическая точность.
                </p>

                <textarea
                  rows={10}
                  value={academicInputText}
                  onChange={(e) => setAcademicInputText(e.target.value)}
                  placeholder="Вставьте научный или диссертационный текст для редактуры по 39 правилам..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-slate-200 focus:outline-none focus:border-amber-500 leading-relaxed resize-y"
                />

                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-300">Дополнительные указания к редакции</label>
                  <input
                    type="text"
                    value={academicCustomInstructions}
                    onChange={(e) => setAcademicCustomInstructions(e.target.value)}
                    placeholder="Например: уделить особое внимание первому абзацу..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <ErrorBox message={tabError} />

                <button
                  type="button"
                  onClick={handleAcademicEdit}
                  disabled={isGeneratingAcademic || !academicInputText.trim()}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-600 to-indigo-600 text-white font-medium shadow-lg flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {isGeneratingAcademic ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Редактируем по 39 правилам...</span>
                    </>
                  ) : (
                    <>
                      <CheckSquare className="h-4 w-4" />
                      <span>Запустить академическую редакцию (39 правил)</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="lg:col-span-6 space-y-6">
              <OutputPanel
                title="Отредактированный текст (39 правил)"
                titleColor="text-amber-400"
                text={academicOutputText}
                loading={isGeneratingAcademic}
                loadingText="Проверяем текст по 39 пунктам регламента..."
                placeholder="Здесь появится отредактированный по 39 правилам текст"
                baseName="academic-39-rules"
                spinnerColor="text-amber-500"
                Icon={CheckSquare}
              />
            </div>
          </div>
        )}

        {/* ===================== TAB: SANDBOX ===================== */}
        {activeTab === 'sandbox' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-6 space-y-6">
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-indigo-400 font-semibold text-sm">Исходный ИИ-текст</span>
                  <button
                    type="button"
                    onClick={() => setInputTextAI(TEXT_AI)}
                    className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300"
                  >
                    Загрузить пример Текст 2
                  </button>
                </div>

                <textarea
                  rows={10}
                  value={inputTextAI}
                  onChange={(e) => setInputTextAI(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 leading-relaxed resize-y"
                />

                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-semibold">Интенсивность де-искусственности</span>
                    <span className="text-indigo-400 font-bold">{styleIntensity} / 10</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={styleIntensity}
                    onChange={(e) => setStyleIntensity(Number(e.target.value))}
                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-300">Дополнительные пожелания</label>
                  <input
                    type="text"
                    value={promptStrategy}
                    onChange={(e) => setPromptStrategy(e.target.value)}
                    placeholder="Например: сделать абзацы слитнее..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <ErrorBox message={tabError} />

                <button
                  type="button"
                  onClick={handleTransformHumanizer}
                  disabled={isGeneratingHumanizer || !inputTextAI.trim()}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium shadow-lg flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {isGeneratingHumanizer ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Переписываем текст...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      <span>Преобразовать текст</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="lg:col-span-6 space-y-6">
              <OutputPanel
                title="Результат"
                titleColor="text-indigo-400"
                text={transformedText}
                loading={isGeneratingHumanizer}
                loadingText="Применяем алгоритмы де-искусственности..."
                placeholder="Здесь появится преобразованный текст"
                baseName="humanized"
                withDoc={false}
              />
            </div>
          </div>
        )}

        {/* ===================== TAB: DRAFT ===================== */}
        {activeTab === 'draft-workshop' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-6 space-y-6">
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-indigo-400 font-semibold">
                    <Sliders className="h-5 w-5" />
                    <span>Сила черновика (уровень 1-10)</span>
                  </div>
                  <span className="text-2xl font-black text-indigo-400 bg-indigo-950 px-3 py-1 rounded-xl border border-indigo-800">
                    {draftStrength}
                  </span>
                </div>

                <input
                  type="range"
                  min="1"
                  max="10"
                  value={draftStrength}
                  onChange={(e) => setDraftStrength(Number(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />

                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-300">Исходный научный текст для черновика</label>
                  <textarea
                    rows={8}
                    value={draftInputText}
                    onChange={(e) => setDraftInputText(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 resize-y"
                  />
                </div>

                <ErrorBox message={tabError} />

                <button
                  type="button"
                  onClick={handleGenerateDraft}
                  disabled={isGeneratingDraft || !draftInputText.trim()}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium shadow-lg flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {isGeneratingDraft ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Создание черновика...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      <span>Сгенерировать черновик (ур. {draftStrength})</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="lg:col-span-6 space-y-6">
              <OutputPanel
                title={`Черновик (уровень ${draftStrength})`}
                titleColor="text-indigo-400"
                text={draftOutputText}
                loading={isGeneratingDraft}
                loadingText="Строим черновик заданной силы..."
                placeholder="Здесь появится ваш черновик"
                baseName={`draft-level-${draftStrength}`}
              />
            </div>
          </div>
        )}

        {/* ===================== TAB: ANALYSIS ===================== */}
        {activeTab === 'analysis' && (
          <div className="space-y-8">
            <div className="bg-gradient-to-r from-indigo-950/70 via-slate-900 to-purple-950/70 border border-indigo-800/50 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  <UserCheck className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Анализ различий: Текст 1 (человек) и Текст 2 (ИИ)</h2>
                  <p className="text-xs text-slate-300">
                    Сравните стилистические контрасты, синтаксическую структуру и принципы построения авторских текстов.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-slate-900/80 border border-emerald-800/40 rounded-2xl p-6 space-y-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center space-x-2 text-emerald-400 font-bold">
                    <UserCheck className="h-5 w-5" />
                    <span>ТЕКСТ 1 — написан человеком</span>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-emerald-950 border border-emerald-800 text-emerald-300">
                    Слов: {wordCount(TEXT_HUMAN)}
                  </span>
                </div>
                <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 text-xs text-slate-300 leading-relaxed max-h-96 overflow-y-auto whitespace-pre-wrap">
                  {TEXT_HUMAN}
                </div>
              </div>

              <div className="bg-slate-900/80 border border-purple-800/40 rounded-2xl p-6 space-y-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center space-x-2 text-purple-400 font-bold">
                    <Cpu className="h-5 w-5" />
                    <span>ТЕКСТ 2 — написан ИИ</span>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-purple-950 border border-purple-800 text-purple-300">
                    Слов: {wordCount(TEXT_AI)}
                  </span>
                </div>
                <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 text-xs text-slate-300 leading-relaxed max-h-96 overflow-y-auto whitespace-pre-wrap">
                  {TEXT_AI}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===================== TAB: SLOPTOTAL ===================== */}
        {activeTab === 'sloptotal' && (
          <SlopTotalWorkbench
            embedded
            currentDnaResult={dnaResultText}
            currentContentText={contentText}
            currentDonorText={donorText}
          />
        )}

        {/* ===================== TAB: MGT-EVAL ===================== */}
        {activeTab === 'mgt-eval' && (
          <MgtEvalWorkbench
            embedded
            currentDnaResult={dnaResultText}
            currentContentText={contentText}
            currentDonorText={donorText}
          />
        )}

        {/* ===================== TAB: MGTBENCH ===================== */}
        {activeTab === 'mgt-bench' && (
          <MgtBenchWorkbench
            embedded
            currentDnaResult={dnaResultText}
            currentContentText={contentText}
            currentDonorText={donorText}
          />
        )}

        {/* ===================== TAB: DETECTZOO ===================== */}
        {activeTab === 'detect-zoo' && (
          <DetectZooWorkbench
            embedded
            currentDnaResult={dnaResultText}
            currentContentText={contentText}
            currentDonorText={donorText}
          />
        )}

        {/* ===================== TAB: HISTORY ===================== */}
        {activeTab === 'history' && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-white">История генераций</h2>
            {history.length === 0 ? (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">История пуста</div>
            ) : (
              <div className="space-y-4">
                {history.map((item) => (
                  <div key={item.id} className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800 pb-2">
                      <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 font-bold">
                        {item.type === 'style-dna'
                          ? '🧬 ДНК-Трансфер V5.0'
                          : item.type === 'humanizer'
                          ? 'Де-искусственность'
                          : item.type === 'academic-39'
                          ? '39 правил'
                          : 'Черновик'}
                      </span>
                      <span>{new Date(item.timestamp).toLocaleString()}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                        <span className="text-slate-500 block mb-1">Исходные данные:</span>
                        <p className="text-slate-300 line-clamp-2">{item.inputText}</p>
                      </div>
                      <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                        <span className="text-indigo-400 block mb-1">Результат:</span>
                        <p className="text-slate-200 line-clamp-2">{item.outputText}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-slate-800 bg-slate-950 py-4 px-6 text-center text-xs text-slate-500 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center space-x-2">
          <Activity className="h-4 w-4 text-emerald-400" />
          <span>PROMPTGPT ∞ Engine: активна модель {selectedModelName}</span>
        </div>
        <div>
          <span>
            Запросов к модели сегодня (локальный счётчик): <strong className="text-slate-300">{dailyUsage.count}</strong>
          </span>
        </div>
      </footer>
    </div>
  );
}
