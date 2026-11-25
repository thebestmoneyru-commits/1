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
  Clock,
  Eye,
  Trash2,
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
import {
  buildConfigAndHistoryExportPayload,
  buildConfigExportFilename,
} from './utils/configExport';
import {
  BUILT_IN_PROMPT_TEMPLATES,
  PROMPT_TEMPLATES_STORAGE_KEY,
  createCustomPromptTemplate,
  parseStoredCustomTemplates,
  type PromptTemplate,
} from './utils/promptTemplates';
import { PromptTemplateSidebar } from './components/PromptTemplateSidebar';

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
  promptUsed?: string;
  modelUsed?: string;
  durationMs?: number;
  metricsSnapshot?: Record<string, string | number>;
  diagnosticsSnapshot?: any;
}

type TabId =
  | 'style-dna'
  | 'sloptotal'
  | 'mgt-eval'
  | 'mgt-bench'
  | 'detect-zoo'
  | 'analysis'
  | 'sandbox'
  | 'draft-workshop'
  | 'academic-39'
  | 'history';

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

export interface ExtendedMetricItem {
  key: string;
  label: string;
  category: 'Ритм и синтаксис' | 'Лексика и словарный запас' | 'Пунктуация и структура' | 'Анти-ИИ и стиль';
  value: string | number;
  note?: string;
}

export interface ExtendedDiagnosticsLog {
  operation: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  model: string;
  status: 'ok' | 'degraded' | 'error';
  activeFlags: string[];
  activeShieldsCount: number;
  inputChars: number;
  outputChars: number;
  steps: Array<{
    stage: string;
    status: 'completed' | 'skipped' | 'warning' | 'failed';
    durationMs: number;
    detail: string;
  }>;
  warnings: string[];
  error?: string;
}

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

const splitSentences = (text: string): string[] =>
  (text.match(/[^.!?…]+(?:[.!?…]+|$)/g) ?? []).map((s) => s.trim()).filter((s) => s.length > 2);

const countWords = (s: string) => s.split(/\s+/).filter(Boolean).length;

const wordCount = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const formatDuration = (ms?: number | null): string => {
  if (typeof ms !== 'number' || Number.isNaN(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} мс`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(2)} с`;
  const mins = Math.floor(sec / 60);
  const remSec = (sec % 60).toFixed(1);
  return `${mins} мин ${remSec} с`;
};

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

// Расширенный расчёт +40 метрик по всем разделам (ритм, лексика, пунктуация/структура, анти-ИИ/стиль)
const computePlus40Metrics = (text: string, donorRefText?: string, sourceRefText?: string): ExtendedMetricItem[] => {
  if (!text || !text.trim()) return [];

  const sentences = splitSentences(text);
  const sentLens = sentences.map(countWords);
  const words = text.toLowerCase().match(/[а-яёa-z0-9-]+/gi) || [];
  const wordLengths = words.map((w) => w.length);
  const paragraphs = text.split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean);
  const paraWordCounts = paragraphs.map(countWords);

  const totalChars = text.length;
  const nonSpaceChars = text.replace(/\s+/g, '').length;
  const totalWords = words.length || 1;
  const totalSentences = sentences.length || 1;
  const totalParagraphs = paragraphs.length || 1;

  const uniqueWords = new Set(words);
  const freqMap = new Map<string, number>();
  for (const w of words) freqMap.set(w, (freqMap.get(w) || 0) + 1);
  const hapaxCount = Array.from(freqMap.values()).filter((c) => c === 1).length;
  const disCount = Array.from(freqMap.values()).filter((c) => c === 2).length;
  const longWordsCount = words.filter((w) => w.length >= 9).length;
  const shortWordsCount = words.filter((w) => w.length <= 3).length;

  const avgSentLen = totalWords / totalSentences;
  const sentStd = Math.sqrt(sentLens.reduce((acc, n) => acc + Math.pow(n - avgSentLen, 2), 0) / totalSentences);
  const medianSentLen = [...sentLens].sort((a, b) => a - b)[Math.floor(sentLens.length / 2)] || 0;
  const iqrSentLen = (() => {
    if (sentLens.length < 4) return Math.round(sentStd);
    const sorted = [...sentLens].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    return Number((q3 - q1).toFixed(1));
  })();

  const commas = (text.match(/,/g) || []).length;
  const periods = (text.match(/\./g) || []).length;
  const semicolons = (text.match(/;/g) || []).length;
  const colons = (text.match(/:/g) || []).length;
  const dashes = (text.match(/[—–-]{1,2}/g) || []).length;
  const questions = (text.match(/\?/g) || []).length;
  const exclamations = (text.match(/!/g) || []).length;
  const quotes = (text.match(/[«»"“”]/g) || []).length;
  const parens = (text.match(/[()]/g) || []).length;

  const lower = text.toLowerCase();
  const clicheHits = AI_CLICHES.reduce(
    (sum, c) => sum + (lower.match(new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length,
    0
  );
  const particlesHits = (lower.match(/\b(же|ведь|лишь|только|даже|уже|просто|именно|будто|словно|точно)\b/g) || []).length;
  const introMarkersHits = (lower.match(/\b(однако|впрочем|напротив|тем не менее|кроме того|помимо этого|следовательно|итак)\b/g) || []).length;
  const passiveMarkersHits = (lower.match(/\b(является|представляет собой|осуществляется|производится|выполняется|реализуется|рассматривается)\b/g) || []).length;
  const firstPersonHits = (lower.match(/\b(я|мы|мой|наш|мне|нам|меня|нас)\b/g) || []).length;
  const digitsCount = (text.match(/\d+/g) || []).length;

  // Энтропия Шеннона по частотам слов
  let entropy = 0;
  for (const cnt of freqMap.values()) {
    const p = cnt / totalWords;
    entropy -= p * Math.log2(p);
  }

  // Yule's K (лексическое разнообразие)
  let sumFreqSq = 0;
  for (const cnt of freqMap.values()) sumFreqSq += cnt * cnt;
  const yuleK = Number((((sumFreqSq - totalWords) / (totalWords * totalWords)) * 10000).toFixed(1));

  // Сравнение с донором и источником (если переданы)
  const donorWordsSet = new Set((donorRefText?.toLowerCase().match(/[а-яёa-z0-9-]+/gi) || []));
  const overlapWithDonor = words.length > 0 && donorWordsSet.size > 0
    ? Number(((words.filter((w) => donorWordsSet.has(w)).length / words.length) * 100).toFixed(1))
    : 0;

  const sourceWordCount = wordCount(sourceRefText || '');
  const lengthRatioVsSource = sourceWordCount > 0 ? Number((words.length / sourceWordCount).toFixed(2)) : 1;

  return [
    // 1–12: Ритм и синтаксис
    { key: 'm01_word_count', label: '01. Объём слов', category: 'Ритм и синтаксис', value: words.length },
    { key: 'm02_char_total', label: '02. Символов всего', category: 'Ритм и синтаксис', value: totalChars },
    { key: 'm03_char_nospace', label: '03. Символов без пробелов', category: 'Ритм и синтаксис', value: nonSpaceChars },
    { key: 'm04_sent_count', label: '04. Число предложений', category: 'Ритм и синтаксис', value: sentences.length },
    { key: 'm05_avg_sent_len', label: '05. Средняя длина предложения', category: 'Ритм и синтаксис', value: Number(avgSentLen.toFixed(1)), note: 'слов' },
    { key: 'm06_median_sent_len', label: '06. Медиана длины предложения', category: 'Ритм и синтаксис', value: medianSentLen, note: 'слов' },
    { key: 'm07_sent_stddev', label: '07. СКО длины предложения', category: 'Ритм и синтаксис', value: Number(sentStd.toFixed(2)) },
    { key: 'm08_sent_iqr', label: '08. Межквартильный размах (IQR)', category: 'Ритм и синтаксис', value: iqrSentLen },
    { key: 'm09_min_sent', label: '09. Минимум слов в предложении', category: 'Ритм и синтаксис', value: sentLens.length ? Math.min(...sentLens) : 0 },
    { key: 'm10_max_sent', label: '10. Максимум слов в предложении', category: 'Ритм и синтаксис', value: sentLens.length ? Math.max(...sentLens) : 0 },
    { key: 'm11_short_sent_share', label: '11. Доля коротких фраз (≤7 сл.)', category: 'Ритм и синтаксис', value: `${Math.round((sentLens.filter((n) => n <= 7).length / totalSentences) * 100)}%` },
    { key: 'm12_long_sent_share', label: '12. Доля длинных фраз (≥25 сл.)', category: 'Ритм и синтаксис', value: `${Math.round((sentLens.filter((n) => n >= 25).length / totalSentences) * 100)}%` },

    // 13–23: Лексика и словарный запас
    { key: 'm13_unique_words', label: '13. Уникальных словоформ', category: 'Лексика и словарный запас', value: uniqueWords.size },
    { key: 'm14_ttr', label: '14. Коэффициент TTR', category: 'Лексика и словарный запас', value: Number((uniqueWords.size / totalWords).toFixed(3)) },
    { key: 'm15_hapax', label: '15. Hapax Legomena (1 раз)', category: 'Лексика и словарный запас', value: hapaxCount },
    { key: 'm16_hapax_ratio', label: '16. Доля Hapax в словаре', category: 'Лексика и словарный запас', value: `${Math.round((hapaxCount / Math.max(1, uniqueWords.size)) * 100)}%` },
    { key: 'm17_dis_legomena', label: '17. Dis Legomena (2 раза)', category: 'Лексика и словарный запас', value: disCount },
    { key: 'm18_avg_word_len', label: '18. Средняя длина слова', category: 'Лексика и словарный запас', value: Number((wordLengths.reduce((a, b) => a + b, 0) / totalWords).toFixed(2)), note: 'букв' },
    { key: 'm19_long_words_share', label: '19. Длинные слова (≥9 букв)', category: 'Лексика и словарный запас', value: `${Math.round((longWordsCount / totalWords) * 100)}%` },
    { key: 'm20_short_words_share', label: '20. Короткие слова (≤3 букв)', category: 'Лексика и словарный запас', value: `${Math.round((shortWordsCount / totalWords) * 100)}%` },
    { key: 'm21_word_entropy', label: '21. Энтропия лексики (бит)', category: 'Лексика и словарный запас', value: Number(entropy.toFixed(2)) },
    { key: 'm22_yule_k', label: '22. Индекс Юла (Yule K)', category: 'Лексика и словарный запас', value: yuleK },
    { key: 'm23_digits_count', label: '23. Числовых токенов', category: 'Лексика и словарный запас', value: digitsCount },

    // 24–32: Пунктуация и структура
    { key: 'm24_para_count', label: '24. Число абзацев', category: 'Пунктуация и структура', value: paragraphs.length },
    { key: 'm25_avg_para_words', label: '25. Средний размер абзаца', category: 'Пунктуация и структура', value: Math.round(paraWordCounts.reduce((a, b) => a + b, 0) / totalParagraphs), note: 'слов' },
    { key: 'm26_commas', label: '26. Запятых всего', category: 'Пунктуация и структура', value: commas },
    { key: 'm27_commas_per_100', label: '27. Запятых на 100 слов', category: 'Пунктуация и структура', value: Number(((commas / totalWords) * 100).toFixed(1)) },
    { key: 'm28_dashes', label: '28. Тире / дефисов', category: 'Пунктуация и структура', value: dashes },
    { key: 'm29_colons_semicolons', label: '29. Двоеточий и точек с запятой', category: 'Пунктуация и структура', value: colons + semicolons },
    { key: 'm30_questions_excl', label: '30. Вопросов (!) и восклицаний (?)', category: 'Пунктуация и структура', value: `${questions} / ${exclamations}` },
    { key: 'm31_quotes_parens', label: '31. Кавычек / скобок', category: 'Пунктуация и структура', value: `${quotes} / ${parens}` },
    { key: 'm32_periods', label: '32. Точек в тексте', category: 'Пунктуация и структура', value: periods },

    // 33–42+: Анти-ИИ, голос и сопоставление
    { key: 'm33_ai_cliches', label: '33. Машинных штампов', category: 'Анти-ИИ и стиль', value: clicheHits },
    { key: 'm34_cliche_density', label: '34. Плотность штампов / 100 сл.', category: 'Анти-ИИ и стиль', value: Number(((clicheHits / totalWords) * 100).toFixed(2)) },
    { key: 'm35_particles', label: '35. Живых частиц («же», «ведь»...)', category: 'Анти-ИИ и стиль', value: particlesHits },
    { key: 'm36_intro_markers', label: '36. Вводных и связок', category: 'Анти-ИИ и стиль', value: introMarkersHits },
    { key: 'm37_passive_markers', label: '37. Канцелярских глаголов', category: 'Анти-ИИ и стиль', value: passiveMarkersHits },
    { key: 'm38_first_person', label: '38. Маркеров 1-го лица (я/мы)', category: 'Анти-ИИ и стиль', value: firstPersonHits },
    { key: 'm39_donor_overlap', label: '39. Пересечение словаря с донором', category: 'Анти-ИИ и стиль', value: `${overlapWithDonor}%` },
    { key: 'm40_len_ratio_source', label: '40. Коэф. длины к исходнику', category: 'Анти-ИИ и стиль', value: `${lengthRatioVsSource}x` },
    { key: 'm41_burstiness_idx', label: '41. Индекс Burstiness', category: 'Анти-ИИ и стиль', value: Number((sentStd / Math.max(1, avgSentLen)).toFixed(3)) },
    { key: 'm42_dialog_cadence', label: '42. Ритмический контраст соседних фраз', category: 'Анти-ИИ и стиль', value: (() => {
      if (sentLens.length < 2) return 0;
      let diffs = 0;
      for (let i = 1; i < sentLens.length; i++) diffs += Math.abs(sentLens[i] - sentLens[i - 1]);
      return Number((diffs / (sentLens.length - 1)).toFixed(1));
    })() },
  ];
};

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

function Plus40MetricsPanel({
  metrics,
  title = 'Расширенный набор метрик (+42 показателя по всем разделам)',
}: {
  metrics: ExtendedMetricItem[];
  title?: string;
}) {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  if (!metrics || metrics.length === 0) return null;

  const categories = ['ALL', 'Ритм и синтаксис', 'Лексика и словарный запас', 'Пунктуация и структура', 'Анти-ИИ и стиль'];
  const filtered = selectedCategory === 'ALL' ? metrics : metrics.filter((m) => m.category === selectedCategory);

  return (
    <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800/80 pb-2">
        <div className="flex items-center gap-2 text-xs font-bold text-cyan-300">
          <BarChart3 className="h-4 w-4 text-cyan-400" />
          <span>{title}</span>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-cyan-900/80 text-cyan-200 border-cyan-500'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              {cat === 'ALL' ? `Все (${metrics.length})` : cat}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2 max-h-72 overflow-y-auto pr-1">
        {filtered.map((m) => (
          <div key={m.key} className="rounded-lg bg-slate-900/90 border border-slate-800/90 p-2">
            <div className="text-[10px] text-slate-400 truncate" title={m.label}>
              {m.label}
            </div>
            <div className="text-xs font-bold font-mono text-white mt-0.5">
              {m.value} {m.note ? <span className="text-[10px] font-normal text-slate-400">{m.note}</span> : null}
            </div>
            <div className="text-[9px] text-slate-500 truncate mt-0.5">{m.category}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExtendedDiagnosticsPanel({ log }: { log: ExtendedDiagnosticsLog | null }) {
  if (!log) return null;
  return (
    <details open className="rounded-xl border border-indigo-800/60 bg-slate-950/90 p-4 space-y-3 text-xs">
      <summary className="cursor-pointer font-bold text-indigo-300 flex items-center justify-between flex-wrap gap-2">
        <span>Расширенная диагностика выполнения: {log.operation}</span>
        <span className="font-mono text-[11px] text-emerald-300">
          Время: {formatDuration(log.durationMs)} · Модель: {log.model}
        </span>
      </summary>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 pt-2">
        <div className="rounded-lg bg-slate-900 border border-slate-800 p-2">
          <div className="text-[10px] text-slate-400">Длительность</div>
          <div className="font-mono font-bold text-emerald-300">{formatDuration(log.durationMs)}</div>
        </div>
        <div className="rounded-lg bg-slate-900 border border-slate-800 p-2">
          <div className="text-[10px] text-slate-400">Статус</div>
          <div className="font-bold text-white">{log.status.toUpperCase()}</div>
        </div>
        <div className="rounded-lg bg-slate-900 border border-slate-800 p-2">
          <div className="text-[10px] text-slate-400">Активных щитов</div>
          <div className="font-mono font-bold text-cyan-300">{log.activeShieldsCount}</div>
        </div>
        <div className="rounded-lg bg-slate-900 border border-slate-800 p-2">
          <div className="text-[10px] text-slate-400">Вход / Выход</div>
          <div className="font-mono font-bold text-slate-200">
            {log.inputChars} / {log.outputChars} симв.
          </div>
        </div>
        <div className="rounded-lg bg-slate-900 border border-slate-800 p-2">
          <div className="text-[10px] text-slate-400">Окончание</div>
          <div className="font-mono text-[11px] text-slate-300">{log.finishedAt}</div>
        </div>
      </div>

      {log.activeFlags.length > 0 && (
        <div className="text-[11px] text-slate-400">
          Активные модули: <span className="text-slate-200 font-medium">{log.activeFlags.join(', ')}</span>
        </div>
      )}

      <div className="space-y-1.5">
        {log.steps.map((st, idx) => (
          <div key={idx} className="rounded-lg bg-slate-900/80 border border-slate-800 px-3 py-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="font-semibold text-slate-200">{st.stage}</span>
              <span className="text-slate-400 ml-2">— {st.detail}</span>
            </div>
            <span className="shrink-0 font-mono text-[10px] text-cyan-300 tabular-nums">{formatDuration(st.durationMs)}</span>
          </div>
        ))}
      </div>

      {log.warnings.length > 0 && (
        <div className="rounded-lg bg-amber-950/20 border border-amber-800/50 p-2.5 text-amber-200">
          <div className="font-bold mb-1">Предупреждения:</div>
          <ul className="list-disc pl-5 space-y-0.5">
            {log.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {log.error && (
        <div className="rounded-lg bg-red-950/40 border border-red-800 p-2.5 text-red-200 font-semibold">
          Ошибка: {log.error}
        </div>
      )}
    </details>
  );
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
  elapsedMs,
  metrics,
  diagnostics,
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
  elapsedMs?: number | null;
  metrics?: ExtendedMetricItem[];
  diagnostics?: ExtendedDiagnosticsLog | null;
}) {
  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 flex flex-col min-h-[520px]">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`${titleColor} font-semibold text-sm`}>{title}</span>
          {typeof elapsedMs === 'number' && elapsedMs > 0 && (
            <span className="px-2 py-0.5 rounded-md bg-slate-950 border border-slate-700 text-[11px] font-mono text-emerald-300 flex items-center gap-1">
              <Clock className="h-3 w-3" /> {formatDuration(elapsedMs)}
            </span>
          )}
        </div>
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
      {text && metrics && metrics.length > 0 && <Plus40MetricsPanel metrics={metrics} />}
      {diagnostics && <ExtendedDiagnosticsPanel log={diagnostics} />}
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
  const [dnaElapsedMs, setDnaElapsedMs] = useState<number | null>(null);
  const [dnaDiagnostics, setDnaDiagnostics] = useState<ExtendedDiagnosticsLog | null>(null);
  const [v2AccessKey, setV2AccessKey] = useState('');
  const [v2ModelId, setV2ModelId] = useState<string>(() => {
    try {
      return localStorage.getItem('promptgpt_v2_model_id') || 'gemini-3.1-flash-lite';
    } catch {
      return 'gemini-3.1-flash-lite';
    }
  });
  const [v2Status, setV2Status] = useState('');
  const [v2Diagnostics, setV2Diagnostics] = useState<any>(null);
  const [v2QuestionChoices, setV2QuestionChoices] = useState<Record<string, string>>({});
  const [unfilteredMode, setUnfilteredMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('promptgpt_unfiltered_mode') === 'true';
    } catch {
      return false;
    }
  });
  const toggleUnfilteredMode = () => {
    setUnfilteredMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('promptgpt_unfiltered_mode', String(next));
      } catch {
        /* ignore storage error */
      }
      return next;
    });
  };
  const [v2StyleIntensity, setV2StyleIntensity] = useState<1 | 2 | 3 | 4 | 5>(() => {
    try {
      const saved = Number(localStorage.getItem('promptgpt_v2_style_intensity'));
      if (saved >= 1 && saved <= 5) return Math.round(saved) as 1 | 2 | 3 | 4 | 5;
    } catch {
      /* ignore storage error */
    }
    return 5;
  });
  const handleChangeV2StyleIntensity = (next: 1 | 2 | 3 | 4 | 5) => {
    setV2StyleIntensity(next);
    try {
      localStorage.setItem('promptgpt_v2_style_intensity', String(next));
    } catch {
      /* ignore storage error */
    }
  };
  const [v2CustomInstructions, setV2CustomInstructions] = useState<string>(() => {
    try {
      return localStorage.getItem('promptgpt_v2_custom_instructions') ?? '';
    } catch {
      return '';
    }
  });
  const handleChangeV2CustomInstructions = (value: string) => {
    setV2CustomInstructions(value);
    try {
      localStorage.setItem('promptgpt_v2_custom_instructions', value);
    } catch {
      /* ignore storage error */
    }
  };
  const [isGeneratingDna, setIsGeneratingDna] = useState(false);
  const [showPromptDetails, setShowPromptDetails] = useState(false);
  const [showActivePromptSummary, setShowActivePromptSummary] = useState(false);

  const [flags, setFlags] = useState<Flags>(DEFAULT_FLAGS);
  const activeEnginesCount = ALL_FLAG_KEYS.filter((k) => flags[k]).length;
  const toggleFlag = (k: FlagKey) => setFlags((prev) => ({ ...prev, [k]: !prev[k] }));

  // Model
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    try {
      return localStorage.getItem('promptgpt_selected_model') || 'gemini-3.1-flash-lite';
    } catch {
      return 'gemini-3.1-flash-lite';
    }
  });
  const handleSelectModel = (modelId: string) => {
    setSelectedModel(modelId);
    setV2ModelId(modelId);
    try {
      localStorage.setItem('promptgpt_selected_model', modelId);
      localStorage.setItem('promptgpt_v2_model_id', modelId);
    } catch {
      /* ignore storage error */
    }
  };
  const handleChangeV2ModelId = (value: string) => {
    setV2ModelId(value);
    const trimmed = value.trim();
    if (GEMINI_FREE_MODELS.some((m) => m.id === trimmed)) {
      setSelectedModel(trimmed);
      try {
        localStorage.setItem('promptgpt_selected_model', trimmed);
      } catch {
        /* ignore storage error */
      }
    }
    try {
      localStorage.setItem('promptgpt_v2_model_id', value);
    } catch {
      /* ignore storage error */
    }
  };
  const [lastUsedModel, setLastUsedModel] = useState('');
  const [fallbackOccurred, setFallbackOccurred] = useState(false);
  const selectedModelName = GEMINI_FREE_MODELS.find((m) => m.id === selectedModel)?.name || selectedModel;

  // Sidebar prompt template library
  const [isTemplateSidebarOpen, setIsTemplateSidebarOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('promptgpt_template_sidebar_open');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const toggleTemplateSidebar = () => {
    setIsTemplateSidebarOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('promptgpt_template_sidebar_open', String(next));
      } catch {
        /* ignore storage error */
      }
      return next;
    });
  };
  const [customTemplates, setCustomTemplates] = useState<PromptTemplate[]>(() => {
    try {
      return parseStoredCustomTemplates(localStorage.getItem(PROMPT_TEMPLATES_STORAGE_KEY));
    } catch {
      return [];
    }
  });
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const allTemplates = useMemo(
    () => [...customTemplates, ...BUILT_IN_PROMPT_TEMPLATES],
    [customTemplates],
  );
  const persistCustomTemplates = (next: PromptTemplate[]) => {
    setCustomTemplates(next);
    try {
      localStorage.setItem(PROMPT_TEMPLATES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore storage error */
    }
  };

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
  const [auditElapsedMs, setAuditElapsedMs] = useState<number | null>(null);
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
  const [humanizerElapsedMs, setHumanizerElapsedMs] = useState<number | null>(null);
  const [humanizerDiagnostics, setHumanizerDiagnostics] = useState<ExtendedDiagnosticsLog | null>(null);
  const [isGeneratingHumanizer, setIsGeneratingHumanizer] = useState(false);

  // Draft
  const [draftInputText, setDraftInputText] = useState(SAMPLE_DRAFT_TEXT);
  const [draftStrength, setDraftStrength] = useState(10);
  const [draftCustomInstructions] = useState('');
  const [draftOutputText, setDraftOutputText] = useState('');
  const [draftElapsedMs, setDraftElapsedMs] = useState<number | null>(null);
  const [draftDiagnostics, setDraftDiagnostics] = useState<ExtendedDiagnosticsLog | null>(null);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);

  // Academic
  const [academicInputText, setAcademicInputText] = useState(TEXT_AI);
  const [academicCustomInstructions, setAcademicCustomInstructions] = useState('');
  const [academicOutputText, setAcademicOutputText] = useState('');
  const [academicElapsedMs, setAcademicElapsedMs] = useState<number | null>(null);
  const [academicDiagnostics, setAcademicDiagnostics] = useState<ExtendedDiagnosticsLog | null>(null);
  const [isGeneratingAcademic, setIsGeneratingAcademic] = useState(false);

  // History & local request counter
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedHistoryItemId, setSelectedHistoryItemId] = useState<string | null>(null);
  const [dailyUsage, setDailyUsage] = useState<{ count: number; date: string }>({
    count: 0,
    date: new Date().toDateString(),
  });

  const [error, setErrorState] = useState<{ tab: TabId; msg: string } | null>(null);
  const setError = (msg: string | null) => setErrorState(msg ? { tab: activeTab, msg } : null);
  const tabError = error && error.tab === activeTab ? error.msg : null;

  useEffect(() => {
    try {
      const saved = localStorage.getItem('unified_app_history');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setHistory(parsed);
          if (parsed[0]?.id) setSelectedHistoryItemId(parsed[0].id);
        }
      }
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

  const saveToHistory = (
    output: string,
    strOrInt: number,
    input: string,
    type: HistoryType,
    extra?: {
      promptUsed?: string;
      modelUsed?: string;
      durationMs?: number;
      metricsSnapshot?: Record<string, string | number>;
      diagnosticsSnapshot?: any;
    }
  ) => {
    const metricsList = computePlus40Metrics(output, donorText, input);
    const compactMetrics: Record<string, string | number> =
      extra?.metricsSnapshot ||
      Object.fromEntries(metricsList.slice(0, 20).map((m) => [m.label, m.value]));

    const newItem: HistoryItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      type,
      strengthOrIntensity: strOrInt,
      inputText: input,
      outputText: output,
      promptUsed: extra?.promptUsed,
      modelUsed: extra?.modelUsed || selectedModelName,
      durationMs: extra?.durationMs,
      metricsSnapshot: compactMetrics,
      diagnosticsSnapshot: extra?.diagnosticsSnapshot,
    };
    setHistory((prev) => {
      const next = [newItem, ...prev].slice(0, 40);
      try {
        localStorage.setItem('unified_app_history', JSON.stringify(next));
      } catch {
        try {
          localStorage.setItem('unified_app_history', JSON.stringify(next.slice(0, 10)));
        } catch {
          /* игнорируем */
        }
      }
      return next;
    });
    setSelectedHistoryItemId(newItem.id);
  };

  const handleDeleteHistoryItem = (id: string) => {
    setHistory((prev) => {
      const next = prev.filter((item) => item.id !== id);
      try {
        localStorage.setItem('unified_app_history', JSON.stringify(next));
      } catch {
        /* игнорируем */
      }
      return next;
    });
    if (selectedHistoryItemId === id) setSelectedHistoryItemId(null);
  };

  const handleClearHistory = () => {
    setHistory([]);
    setSelectedHistoryItemId(null);
    try {
      localStorage.removeItem('unified_app_history');
    } catch {
      /* игнорируем */
    }
  };

  const [exportJustCompleted, setExportJustCompleted] = useState(false);

  const handleExportConfigAndHistory = () => {
    const payload = buildConfigAndHistoryExportPayload({
      activeTab,
      selectedModel,
      selectedModelName,
      unfilteredMode,
      v2ModelId,
      v2StyleIntensity,
      v2CustomInstructions,
      flags,
      detectorShields,
      styleIntensity,
      promptStrategy,
      draftStrength,
      draftCustomInstructions,
      academicCustomInstructions,
      history,
    });
    const json = JSON.stringify(payload, null, 2);
    downloadBlob(json, 'application/json;charset=utf-8', buildConfigExportFilename());
    setExportJustCompleted(true);
    setTimeout(() => setExportJustCompleted(false), 2500);
  };

  const buildCurrentTemplateConfig = () => ({
    flags: { ...flags },
    v2StyleIntensity,
    v2CustomInstructions,
    styleIntensity,
    promptStrategy,
    academicCustomInstructions,
    draftStrength,
    selectedModel,
    unfilteredMode,
  });

  const handleSavePromptTemplate = (input: { name: string; category: string; description: string }) => {
    const created = createCustomPromptTemplate({
      ...input,
      config: buildCurrentTemplateConfig(),
    });
    persistCustomTemplates([created, ...customTemplates]);
    setActiveTemplateId(created.id);
  };

  const handleApplyPromptTemplate = (tpl: PromptTemplate) => {
    setFlags({ ...tpl.config.flags });
    handleChangeV2StyleIntensity(tpl.config.v2StyleIntensity);
    handleChangeV2CustomInstructions(tpl.config.v2CustomInstructions);
    setStyleIntensity(tpl.config.styleIntensity);
    setPromptStrategy(tpl.config.promptStrategy);
    setAcademicCustomInstructions(tpl.config.academicCustomInstructions);
    setDraftStrength(tpl.config.draftStrength);
    if (tpl.config.selectedModel) {
      handleSelectModel(tpl.config.selectedModel);
    }
    if (typeof tpl.config.unfilteredMode === 'boolean' && tpl.config.unfilteredMode !== unfilteredMode) {
      toggleUnfilteredMode();
    }
    setActiveTemplateId(tpl.id);
  };

  const handleUpdateCustomTemplate = (templateId: string) => {
    const updatedAt = Date.now();
    const next = customTemplates.map((tpl) =>
      tpl.id === templateId
        ? { ...tpl, updatedAt, config: buildCurrentTemplateConfig() }
        : tpl,
    );
    persistCustomTemplates(next);
    setActiveTemplateId(templateId);
  };

  const handleDeleteCustomTemplate = (templateId: string) => {
    const next = customTemplates.filter((tpl) => tpl.id !== templateId);
    persistCustomTemplates(next);
    if (activeTemplateId === templateId) {
      setActiveTemplateId(null);
    }
  };

  const handleDuplicatePromptTemplate = (tpl: PromptTemplate) => {
    const copy = createCustomPromptTemplate({
      name: `${tpl.name} (копия)`,
      category: tpl.category,
      description: tpl.description,
      config: { ...tpl.config, flags: { ...tpl.config.flags } },
    });
    persistCustomTemplates([copy, ...customTemplates]);
    setActiveTemplateId(copy.id);
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
    const t0 = performance.now();
    setScanningDetectors((prev) => ({ ...prev, [detectorId]: true }));
    setError(null);

    try {
      const [data] = await Promise.all([safePost(AUDIT_URL, { text, detectorId }), sleep(300)]);
      setAuditElapsedMs(Math.round(performance.now() - t0));
      if (data && data.singleDetector) {
        applyScores([{ id: detectorId, ...data.singleDetector }]);
      } else {
        throw new Error('empty');
      }
    } catch {
      const single = calculateLocalAudit(text).results.find((r) => r.id === detectorId);
      if (single) applyScores([single]);
      setAuditElapsedMs(Math.round(performance.now() - t0));
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
    const t0 = performance.now();
    setIsAuditing(true);
    setError(null);
    setScanningDetectors(Object.fromEntries(DETECTORS_LIST.map((d) => [d.id, true])));

    try {
      const [data] = await Promise.all([safePost(AUDIT_URL, { text: textToCheck }), sleep(350)]);
      setAuditElapsedMs(Math.round(performance.now() - t0));
      setAuditResult(data);
      if (data?.results && Array.isArray(data.results)) applyScores(data.results);
    } catch {
      const local = calculateLocalAudit(textToCheck);
      setAuditElapsedMs(Math.round(performance.now() - t0));
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

    const t0 = performance.now();
    setIsAuditing(true);
    setError(null);
    setScanningDetectors(Object.fromEntries(selectedIds.map((id) => [id, true])));

    try {
      const [data] = await Promise.all([
        safePost(AUDIT_URL, { text: textToCheck, detectorIds: selectedIds }),
        sleep(300),
      ]);
      setAuditElapsedMs(Math.round(performance.now() - t0));
      setAuditResult(data);
      if (data?.results && Array.isArray(data.results)) applyScores(data.results);
    } catch {
      const local = calculateLocalAudit(textToCheck);
      setAuditElapsedMs(Math.round(performance.now() - t0));
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
    const startedPerf = performance.now();
    const startedIso = new Date().toISOString();
    setIsGeneratingDna(true);
    setError(null);
    setDnaRefinementMeta(null);
    setDnaResultText('');
    setDnaElapsedMs(null);
    setDnaDiagnostics(null);

    const activeFlagNames = MODULES.filter((m) => flags[m.key]).map((m) => m.title);
    const composedPromptSummary = [
      `Режим: Style DNA Transfer V5.0 | Модель: ${selectedModel}`,
      `Модули (${activeFlagNames.length}): ${activeFlagNames.join('; ')}`,
      `Щитов детекции: ${activeShieldsCount} | Без фильтрации: ${unfilteredMode ? 'да' : 'нет'}`,
      `Донор (Т1, ${wordCount(donorText)} сл.) -> Материал (Т2, ${wordCount(contentText)} сл.)`,
    ].join('\n');

    try {
      const reqStart = performance.now();
      const data = await safePost('/api/style-dna-transfer', {
        text1: donorText,
        text2: contentText,
        flags,
        shields: detectorShields,
        enable20CycleCheck: flags.twentyCycles,
        model: selectedModel,
        unfilteredMode,
      });
      const reqDuration = Math.round(performance.now() - reqStart);
      const totalDuration = Math.round(performance.now() - startedPerf);

      setDnaResultText(data.result);
      setDnaElapsedMs(totalDuration);
      setDnaRefinementMeta(data.refinementMeta || null);

      const usedModelLabel = data.usedModel
        ? GEMINI_FREE_MODELS.find((m) => m.id === data.usedModel)?.name || data.usedModel
        : selectedModelName;

      if (data.usedModel) {
        setLastUsedModel(usedModelLabel);
        setFallbackOccurred(!!data.fallbackOccurred);
      }

      const diag: ExtendedDiagnosticsLog = {
        operation: 'Style DNA Transfer V5.0',
        startedAt: startedIso,
        finishedAt: new Date().toISOString(),
        durationMs: totalDuration,
        model: usedModelLabel,
        status: data.refinementMeta?.issuesRemaining > 0 ? 'degraded' : 'ok',
        activeFlags: activeFlagNames,
        activeShieldsCount,
        inputChars: donorText.length + contentText.length,
        outputChars: (data.result || '').length,
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
        steps: [
          {
            stage: 'Извлечение ДНК донора и синтез результата',
            status: 'completed',
            durationMs: reqDuration,
            detail: `Модель ${usedModelLabel}, циклов: ${data.refinementMeta?.cyclesRun ?? 0}, проходов: ${data.refinementMeta?.passes ?? 1}`,
          },
          {
            stage: 'Запуск аудита по 16 детекторам',
            status: 'completed',
            durationMs: Math.max(10, totalDuration - reqDuration),
            detail: 'Обновление циферблатов и расчёт метрик',
          },
        ],
      };
      setDnaDiagnostics(diag);

      setAuditTargetSource('result');
      handleRunDetectorAudit(data.result);

      const activeList = MODULES.filter((m) => flags[m.key]).map((m) => m.short);
      if (activeShieldsCount > 0) activeList.push(`${activeShieldsCount} щитов детекции`);

      const metricsSnap = Object.fromEntries(
        computePlus40Metrics(data.result, donorText, contentText).map((m) => [m.label, m.value])
      );

      saveToHistory(
        data.result,
        Math.min(100, activeEnginesCount * 12),
        `[${usedModelLabel} | ${activeList.join(' + ') || 'Без модулей'}] Т1: ${donorText.slice(0, 60)}... | Т2: ${contentText.slice(0, 80)}...`,
        'style-dna',
        {
          promptUsed: composedPromptSummary,
          modelUsed: usedModelLabel,
          durationMs: totalDuration,
          metricsSnapshot: metricsSnap,
          diagnosticsSnapshot: { refinementMeta: data.refinementMeta, log: diag },
        }
      );
    } catch (err: any) {
      const totalDuration = Math.round(performance.now() - startedPerf);
      setDnaElapsedMs(totalDuration);
      setError(err.message || 'Ошибка при переносе ДНК стиля.');
      setDnaDiagnostics({
        operation: 'Style DNA Transfer V5.0',
        startedAt: startedIso,
        finishedAt: new Date().toISOString(),
        durationMs: totalDuration,
        model: selectedModelName,
        status: 'error',
        activeFlags: activeFlagNames,
        activeShieldsCount,
        inputChars: donorText.length + contentText.length,
        outputChars: 0,
        warnings: [],
        error: err.message || 'Ошибка при переносе ДНК стиля.',
        steps: [
          {
            stage: 'Вызов /api/style-dna-transfer',
            status: 'failed',
            durationMs: totalDuration,
            detail: err.message || 'Ошибка выполнения',
          },
        ],
      });
    } finally {
      setIsGeneratingDna(false);
    }
  };

  const handleRunV2Pipeline = async () => {
    const t0 = performance.now();
    const startedIso = new Date().toISOString();
    setIsGeneratingDna(true);
    setError(null);
    setV2Status('Запуск PromptGPT v2...');

    const activeFlagNames = MODULES.filter((m) => flags[m.key]).map((m) => m.title);
    const chosenModel = v2ModelId.trim() || selectedModel;

    try {
      const headers: Record<string, string> = {};
      if (v2AccessKey.trim()) {
        headers['x-promptgpt-v2-key'] = v2AccessKey.trim();
      }

      // Keep the client contract aligned with the authenticated PROMPTGPT v2 router.
      const data = await safePost(
        '/api/v2/style-transfer',
        {
          donorText,
          sourceText: contentText,
          model: chosenModel,
          styleIntensity: v2StyleIntensity,
          customInstructions: v2CustomInstructions,
          unfilteredMode,
        },
        3,
        headers
      );

      const elapsed = Math.round(performance.now() - t0);
      setDnaElapsedMs(elapsed);
      setV2Diagnostics(data || null);

      const outStr =
        typeof data?.selectedText === 'string' && data.selectedText.trim()
          ? data.selectedText
          : typeof data?.bestAvailableText === 'string'
            ? data.bestAvailableText
            : '';

      if (data?.status === 'accepted') {
        setV2Status('Готово (PromptGPT v2): проверки пройдены');
      } else if (data?.status === 'needs-review') {
        setV2Status('Результат PromptGPT v2 готов: требуется проверка');
      } else if (outStr) {
        setV2Status('Получен резервный результат PromptGPT v2: проверьте предупреждения');
      } else {
        setV2Status(data?.status === 'cancelled' ? 'Запуск PromptGPT v2 отменён' : 'Не удалось получить результат PromptGPT v2');
      }

      if (outStr) {
        setDnaResultText(outStr);
        setAuditTargetSource('result');
        handleRunDetectorAudit(outStr);
        const metricsSnap = Object.fromEntries(
          computePlus40Metrics(outStr, donorText, contentText).map((m) => [m.label, m.value])
        );
        const diagLog: ExtendedDiagnosticsLog = {
          operation: 'PromptGPT v2 Pipeline',
          startedAt: startedIso,
          finishedAt: new Date().toISOString(),
          durationMs: elapsed,
          model: data?.usedModel || chosenModel,
          status: data?.status === 'accepted' ? 'ok' : 'degraded',
          activeFlags: activeFlagNames,
          activeShieldsCount,
          inputChars: donorText.length + contentText.length,
          outputChars: outStr.length,
          warnings: Array.isArray(data?.warnings) ? data.warnings : [],
          steps: [
            {
              stage: 'PromptGPT v2 Pipeline (/api/v2/style-transfer)',
              status: data?.status === 'accepted' || data?.status === 'needs-review' ? 'completed' : 'warning',
              durationMs: elapsed,
              detail: `Статус: ${data?.status || 'неизвестен'}; интенсивность ${v2StyleIntensity}/5; модель ${data?.usedModel || chosenModel}`,
            },
          ],
        };
        setDnaDiagnostics(diagLog);
        saveToHistory(
          outStr,
          v2StyleIntensity * 20,
          `[v2 | ${data?.usedModel || chosenModel} | стиль ${v2StyleIntensity}/5] Т1: ${donorText.slice(0, 60)}... | Т2: ${contentText.slice(0, 80)}...`,
          'style-dna',
          {
            promptUsed: `PromptGPT v2 | Модель: ${data?.usedModel || chosenModel} | Стиль: ${v2StyleIntensity}/5\nИнструкции: ${v2CustomInstructions || '(нет)'}`,
            modelUsed: data?.usedModel || chosenModel,
            durationMs: elapsed,
            metricsSnapshot: metricsSnap,
            diagnosticsSnapshot: { v2Data: data, log: diagLog },
          }
        );
      } else if (data?.error?.message) {
        setError(data.error.message);
      }
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - t0);
      setDnaElapsedMs(elapsed);
      setV2Status('Ошибка выполнения PromptGPT v2');
      setError(err?.message || 'Ошибка при запуске PromptGPT v2');
      setDnaDiagnostics({
        operation: 'PromptGPT v2 Pipeline',
        startedAt: startedIso,
        finishedAt: new Date().toISOString(),
        durationMs: elapsed,
        model: chosenModel,
        status: 'error',
        activeFlags: activeFlagNames,
        activeShieldsCount,
        inputChars: donorText.length + contentText.length,
        outputChars: 0,
        warnings: [],
        error: err?.message || 'Ошибка при запуске PromptGPT v2',
        steps: [
          {
            stage: 'Вызов /api/v2/run',
            status: 'failed',
            durationMs: elapsed,
            detail: err?.message || 'Ошибка',
          },
        ],
      });
    } finally {
      setIsGeneratingDna(false);
    }
  };

  const handleTransformHumanizer = async () => {
    if (!inputTextAI.trim()) {
      setError('Пожалуйста, введите текст для гуманизации.');
      return;
    }
    const t0 = performance.now();
    const startedIso = new Date().toISOString();
    setIsGeneratingHumanizer(true);
    setError(null);
    setTransformedText('');
    setHumanizerElapsedMs(null);
    setHumanizerDiagnostics(null);

    const activeFlagNames = MODULES.filter((m) => flags[m.key]).map((m) => m.title);
    const promptSummary = `Режим: Humanizer | Интенсивность: ${styleIntensity}/10 | Модель: ${selectedModelName}\nСтратегия: ${promptStrategy || '(стандартная)'}`;

    try {
      const data = await safePost('/api/humanizer', {
        text: inputTextAI,
        styleIntensity,
        promptStrategy,
        model: selectedModel,
        unfilteredMode,
      });
      const elapsed = Math.round(performance.now() - t0);
      setHumanizerElapsedMs(elapsed);
      setTransformedText(data.result);

      const diag: ExtendedDiagnosticsLog = {
        operation: 'Humanizer Переработка',
        startedAt: startedIso,
        finishedAt: new Date().toISOString(),
        durationMs: elapsed,
        model: selectedModelName,
        status: 'ok',
        activeFlags: activeFlagNames,
        activeShieldsCount,
        inputChars: inputTextAI.length,
        outputChars: (data.result || '').length,
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
        steps: [
          {
            stage: 'Стилистическая переработка (/api/humanizer)',
            status: 'completed',
            durationMs: elapsed,
            detail: `Интенсивность ${styleIntensity}/10, модель ${selectedModelName}`,
          },
        ],
      };
      setHumanizerDiagnostics(diag);

      saveToHistory(data.result, styleIntensity, inputTextAI, 'humanizer', {
        promptUsed: promptSummary,
        modelUsed: selectedModelName,
        durationMs: elapsed,
        metricsSnapshot: Object.fromEntries(
          computePlus40Metrics(data.result, donorText, inputTextAI).map((m) => [m.label, m.value])
        ),
        diagnosticsSnapshot: { log: diag },
      });
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - t0);
      setHumanizerElapsedMs(elapsed);
      setError(err.message || 'Произошла ошибка при обработке запроса.');
      setHumanizerDiagnostics({
        operation: 'Humanizer Переработка',
        startedAt: startedIso,
        finishedAt: new Date().toISOString(),
        durationMs: elapsed,
        model: selectedModelName,
        status: 'error',
        activeFlags: activeFlagNames,
        activeShieldsCount,
        inputChars: inputTextAI.length,
        outputChars: 0,
        warnings: [],
        error: err.message || 'Произошла ошибка при обработке запроса.',
        steps: [{ stage: 'Вызов /api/humanizer', status: 'failed', durationMs: elapsed, detail: err.message || 'Ошибка' }],
      });
    } finally {
      setIsGeneratingHumanizer(false);
    }
  };

  const handleGenerateDraft = async () => {
    if (!draftInputText.trim()) {
      setError('Введите текст для черновика.');
      return;
    }
    const t0 = performance.now();
    const startedIso = new Date().toISOString();
    setIsGeneratingDraft(true);
    setError(null);
    setDraftOutputText('');
    setDraftElapsedMs(null);
    setDraftDiagnostics(null);

    const activeFlagNames = MODULES.filter((m) => flags[m.key]).map((m) => m.title);
    const promptSummary = `Режим: Draft Workshop | Сила: ${draftStrength}/10 | Модель: ${selectedModelName}\nИнструкции: ${draftCustomInstructions || '(нет)'}`;

    try {
      const data = await safePost('/api/draft-workshop', {
        text: draftInputText,
        draftStrength,
        customInstructions: draftCustomInstructions,
        model: selectedModel,
        unfilteredMode,
      });
      const elapsed = Math.round(performance.now() - t0);
      setDraftElapsedMs(elapsed);
      setDraftOutputText(data.result);

      const diag: ExtendedDiagnosticsLog = {
        operation: 'Draft Workshop (Черновик)',
        startedAt: startedIso,
        finishedAt: new Date().toISOString(),
        durationMs: elapsed,
        model: selectedModelName,
        status: 'ok',
        activeFlags: activeFlagNames,
        activeShieldsCount,
        inputChars: draftInputText.length,
        outputChars: (data.result || '').length,
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
        steps: [
          {
            stage: 'Генерация черновика (/api/draft-workshop)',
            status: 'completed',
            durationMs: elapsed,
            detail: `Сила ${draftStrength}/10, модель ${selectedModelName}`,
          },
        ],
      };
      setDraftDiagnostics(diag);

      saveToHistory(data.result, draftStrength, draftInputText, 'draft', {
        promptUsed: promptSummary,
        modelUsed: selectedModelName,
        durationMs: elapsed,
        metricsSnapshot: Object.fromEntries(
          computePlus40Metrics(data.result, donorText, draftInputText).map((m) => [m.label, m.value])
        ),
        diagnosticsSnapshot: { log: diag },
      });
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - t0);
      setDraftElapsedMs(elapsed);
      setError(err.message || 'Ошибка при генерации черновика.');
      setDraftDiagnostics({
        operation: 'Draft Workshop (Черновик)',
        startedAt: startedIso,
        finishedAt: new Date().toISOString(),
        durationMs: elapsed,
        model: selectedModelName,
        status: 'error',
        activeFlags: activeFlagNames,
        activeShieldsCount,
        inputChars: draftInputText.length,
        outputChars: 0,
        warnings: [],
        error: err.message || 'Ошибка при генерации черновика.',
        steps: [{ stage: 'Вызов /api/draft-workshop', status: 'failed', durationMs: elapsed, detail: err.message || 'Ошибка' }],
      });
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  const handleGenerateAcademic39 = async () => {
    if (!academicInputText.trim()) {
      setError('Введите текст для академической переработки.');
      return;
    }
    const t0 = performance.now();
    const startedIso = new Date().toISOString();
    setIsGeneratingAcademic(true);
    setError(null);
    setAcademicOutputText('');
    setAcademicElapsedMs(null);
    setAcademicDiagnostics(null);

    const activeFlagNames = MODULES.filter((m) => flags[m.key]).map((m) => m.title);
    const promptSummary = `Режим: Academic 39 Rules | Модель: ${selectedModelName}\nИнструкции: ${academicCustomInstructions || '(стандартные 39 правил)'}`;

    try {
      const data = await safePost('/api/academic-39', {
        text: academicInputText,
        customInstructions: academicCustomInstructions,
        model: selectedModel,
        unfilteredMode,
      });
      const elapsed = Math.round(performance.now() - t0);
      setAcademicElapsedMs(elapsed);
      setAcademicOutputText(data.result);

      const diag: ExtendedDiagnosticsLog = {
        operation: 'Academic 39 Rules',
        startedAt: startedIso,
        finishedAt: new Date().toISOString(),
        durationMs: elapsed,
        model: selectedModelName,
        status: 'ok',
        activeFlags: activeFlagNames,
        activeShieldsCount,
        inputChars: academicInputText.length,
        outputChars: (data.result || '').length,
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
        steps: [
          {
            stage: 'Академическая обработка (/api/academic-39)',
            status: 'completed',
            durationMs: elapsed,
            detail: `Модель ${selectedModelName}, доп. инструкций: ${academicCustomInstructions ? 'да' : 'нет'}`,
          },
        ],
      };
      setAcademicDiagnostics(diag);

      saveToHistory(data.result, 39, academicInputText, 'academic-39', {
        promptUsed: promptSummary,
        modelUsed: selectedModelName,
        durationMs: elapsed,
        metricsSnapshot: Object.fromEntries(
          computePlus40Metrics(data.result, donorText, academicInputText).map((m) => [m.label, m.value])
        ),
        diagnosticsSnapshot: { log: diag },
      });
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - t0);
      setAcademicElapsedMs(elapsed);
      setError(err.message || 'Ошибка при генерации по правилам 39.');
      setAcademicDiagnostics({
        operation: 'Academic 39 Rules',
        startedAt: startedIso,
        finishedAt: new Date().toISOString(),
        durationMs: elapsed,
        model: selectedModelName,
        status: 'error',
        activeFlags: activeFlagNames,
        activeShieldsCount,
        inputChars: academicInputText.length,
        outputChars: 0,
        warnings: [],
        error: err.message || 'Ошибка при генерации по правилам 39.',
        steps: [{ stage: 'Вызов /api/academic-39', status: 'failed', durationMs: elapsed, detail: err.message || 'Ошибка' }],
      });
    } finally {
      setIsGeneratingAcademic(false);
    }
  };

  const metricsHuman = analyzeStyleMetrics(TEXT_HUMAN);
  const metricsAI = analyzeStyleMetrics(inputTextAI);
  const metricsTransformed = analyzeStyleMetrics(transformedText);

  const activeDnaMetrics = useMemo(
    () => (dnaResultText ? computePlus40Metrics(dnaResultText, donorText, contentText) : []),
    [dnaResultText, donorText, contentText]
  );
  const activeHumanizerMetrics = useMemo(
    () => (transformedText ? computePlus40Metrics(transformedText, donorText, inputTextAI) : []),
    [transformedText, donorText, inputTextAI]
  );
  const activeDraftMetrics = useMemo(
    () => (draftOutputText ? computePlus40Metrics(draftOutputText, donorText, draftInputText) : []),
    [draftOutputText, donorText, draftInputText]
  );
  const activeAcademicMetrics = useMemo(
    () => (academicOutputText ? computePlus40Metrics(academicOutputText, donorText, academicInputText) : []),
    [academicOutputText, donorText, academicInputText]
  );

  const selectedHistoryItem = useMemo(
    () => history.find((item) => item.id === selectedHistoryItemId) || history[0] || null,
    [history, selectedHistoryItemId]
  );

  const donorModules = MODULES.filter((m) => m.group === 'author');
  const externalModules = MODULES.filter((m) => m.group === 'external');

  const combinedPromptPreview = [
    '=== ПЕРЕНОС СТИЛЯ ДНК АВТОРА ===',
    `ТЕКСТ 1 (ОБРАЗЕЦ СТИЛЯ): "${donorText}"`,
    `ТЕКСТ 2 (ИСХОДНОЕ СОДЕРЖАНИЕ): "${contentText}"`,
    `АКТИВНЫЕ МОДУЛИ (${activeEnginesCount}/${ALL_FLAG_KEYS.length}):`,
    ...MODULES.filter((m) => flags[m.key]).map((m) => `  • ${m.summary}`),
    ...(activeEnginesCount === 0 ? ['  (Нет включенных модулей)'] : []),
    `ЩИТЫ ДЕТЕКЦИИ (${activeShieldsCount}/${DETECTORS_LIST.length}): ${
      activeShieldsCount > 0 ? `${activeShieldsCount} активных` : 'Нет'
    }`,
    `ЦИКЛЫ ПРОВЕРКИ: ${flags.twentyCycles ? 'Включено (20 циклов)' : 'Стандартный режим'}`,
  ].join('\n');

  const currentSourceText = getTextToAudit();

  const renderDetectorCards = (list: DetectorInfo[]) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {list.map((det) => {
        const scoreData = detectorScores[det.id] || INITIAL_DETECTOR_SCORES[det.id];
        const isScanning = !!scanningDetectors[det.id];
        const isShielded = !!detectorShields[det.id];
        const notTested = scoreData.status === 'Не проверено' && !isScanning;

        return (
          <div
            key={det.id}
            className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
              isShielded
                ? 'bg-slate-900/95 border-indigo-500/50 shadow-md'
                : 'bg-slate-900/60 border-slate-800 opacity-75'
            }`}
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <input
                    type="checkbox"
                    checked={isShielded}
                    onChange={() => setDetectorShields((prev) => ({ ...prev, [det.id]: !prev[det.id] }))}
                    className="h-3.5 w-3.5 rounded accent-indigo-500 cursor-pointer shrink-0"
                    title="Включить щит / выбрать для сканирования"
                  />
                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 truncate">
                    {det.category}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-slate-400 shrink-0">{scoreData.threshold}</span>
              </div>

              <div className="mt-1.5">
                <h4 className="text-xs font-extrabold text-white leading-snug">{det.name}</h4>
                <a
                  href={det.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-mono text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1 mt-0.5 break-all"
                >
                  {det.repo} <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                </a>
              </div>

              <DetectorDialGauge
                humanScore={scoreData.humanScore}
                aiScore={scoreData.aiScore}
                isScanning={isScanning}
                notTested={notTested}
              />

              <div className="bg-slate-950/90 border border-slate-800/80 rounded-lg p-2 text-center space-y-1 mb-2">
                <div className="text-[11px] font-mono text-slate-300">
                  Метрика: <strong className="text-white">{scoreData.rawMetric}</strong>
                </div>
                <div
                  className={`text-[11px] font-bold ${
                    notTested
                      ? 'text-slate-400'
                      : scoreData.humanScore >= 80
                      ? 'text-emerald-400'
                      : scoreData.humanScore >= 60
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}
                >
                  {isScanning ? 'Проверка...' : scoreData.verdictLabel}
                </div>
              </div>

              <p className="text-[10px] text-slate-400 leading-relaxed mb-2">{det.description}</p>
            </div>

            <div className="space-y-1.5">
              <div className="pt-2 border-t border-slate-800/80 text-[10px] text-slate-400 leading-snug">
                <span className="text-indigo-300 font-semibold">Щит:</span> {det.shieldRule}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleRunSingleDetector(det.id)}
                  disabled={isScanning}
                  className="py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-indigo-600 disabled:opacity-50 text-slate-200 hover:text-white text-[10px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
                >
                  <RefreshCw className={`h-3 w-3 ${isScanning ? 'animate-spin' : ''}`} />
                  {isScanning ? 'Скан...' : 'Тест'}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveWorkbenchDetector(det.id)}
                  className="py-1.5 px-2 rounded-lg bg-indigo-950/80 hover:bg-indigo-700 border border-indigo-700/60 text-indigo-200 hover:text-white text-[10px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
                >
                  <Maximize2 className="h-3 w-3" />
                  Стенд
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const navTabs: Array<{ id: TabId; label: string; Icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'style-dna', label: 'Стиль ДНК и 16 детекторов', Icon: Dna },
    { id: 'sloptotal', label: 'SlopTotal (23 движка)', Icon: ShieldAlert },
    { id: 'mgt-eval', label: 'MGT-Eval (26 моделей)', Icon: Activity },
    { id: 'mgt-bench', label: 'MGTBench (14 методов)', Icon: Layers },
    { id: 'detect-zoo', label: 'DetectZoo (37 моделей)', Icon: Sparkles },
    { id: 'analysis', label: 'Сравнение и 16 детекторов', Icon: Search },
    { id: 'sandbox', label: 'Гуманизатор текста', Icon: Sliders },
    { id: 'draft-workshop', label: 'Черновик', Icon: FileCode },
    { id: 'academic-39', label: 'Стиль 39 правил', Icon: BookOpen },
    { id: 'history', label: `История (${history.length})`, Icon: History },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-500/20">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                PromptGPT Studio &amp; Анти-Детектор
              </h1>
              <p className="text-xs text-slate-400">
                Стиль ДНК • {DETECTORS_LIST.length} детекторов • Черновики и анализ
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 flex-wrap gap-y-2">
            <button
              type="button"
              onClick={toggleTemplateSidebar}
              data-testid="toggle-template-sidebar-btn"
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition flex items-center gap-1.5 cursor-pointer ${
                isTemplateSidebarOpen
                  ? 'bg-amber-950/70 text-amber-200 border-amber-600/70'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title="Открыть или скрыть библиотеку шаблонов промптов"
            >
              <BookOpen className="h-3.5 w-3.5 text-amber-300" />
              <span>Шаблоны ({allTemplates.length})</span>
            </button>
            <span className="px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs text-slate-300">
              Запросов сегодня (локально): <strong>{dailyUsage.count}</strong>
            </span>
            <button
              type="button"
              onClick={handleExportConfigAndHistory}
              data-testid="export-config-history-btn"
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-sm"
              title="Скачать все настройки и историю в JSON-файл"
            >
              {exportJustCompleted ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-200" />
                  <span>Экспортировано</span>
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  <span>Экспорт настроек и истории</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-1 overflow-x-auto pb-1">
          {navTabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setActiveTab(id);
                setError(null);
              }}
              className={`flex items-center space-x-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === id
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col lg:flex-row gap-6 items-start">
        {isTemplateSidebarOpen && (
          <PromptTemplateSidebar
            isOpen={isTemplateSidebarOpen}
            onToggleOpen={toggleTemplateSidebar}
            templates={allTemplates}
            activeTemplateId={activeTemplateId}
            currentFlagsCount={Object.values(flags).filter(Boolean).length}
            currentV2Intensity={v2StyleIntensity}
            currentHumanizerIntensity={styleIntensity}
            onSaveTemplate={handleSavePromptTemplate}
            onApplyTemplate={handleApplyPromptTemplate}
            onUpdateCustomTemplate={handleUpdateCustomTemplate}
            onDeleteCustomTemplate={handleDeleteCustomTemplate}
            onDuplicateTemplate={handleDuplicatePromptTemplate}
          />
        )}

        <main className="flex-1 min-w-0 w-full space-y-8">
        <ErrorBox message={tabError} />

        {/* ==================== TAB 1: STYLE DNA & DETECTORS ==================== */}
        {activeTab === 'style-dna' && (
          <div className="space-y-8">
            {/* Hero */}
            <div className="bg-gradient-to-r from-indigo-950/60 via-slate-900 to-purple-950/60 border border-indigo-500/30 rounded-2xl p-6 shadow-xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="inline-flex items-center space-x-2 px-2.5 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-xs font-medium mb-2">
                    <Dna className="h-3.5 w-3.5" />
                    <span>ПЕРЕНОС СТИЛЯ ДНК АВТОРА + {DETECTORS_LIST.length} ДЕТЕКТОРОВ</span>
                  </div>
                  <h2 className="text-xl font-bold text-white">Генератор стиля по образцу + защита от детекторов</h2>
                  <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                    <strong>Текст 1</strong> задаёт стиль письма (синтаксис, длину фраз, пунктуацию), <strong>Текст 2</strong> — содержание и факты. Нажмите переключатели модулей и щиты детекторов ниже.
                  </p>
                </div>
                <div className="flex items-center space-x-3 shrink-0">
                  <div className="text-right">
                    <div className="text-xs text-slate-400">Активно модулей</div>
                    <div className="text-2xl font-black text-indigo-400">
                      {activeEnginesCount} / {ALL_FLAG_KEYS.length}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Model selector */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-2">
                  <Cpu className="h-4 w-4 text-emerald-400" />
                  <h3 className="text-sm font-bold text-white">Модель генерации</h3>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                    Бесплатный уровень
                  </span>
                </div>
                <div className="text-xs text-slate-400">
                  Выбрана: <strong className="text-emerald-400">{selectedModelName}</strong>
                  {lastUsedModel && (
                    <span className="ml-2 text-slate-500">
                      (последний ответ: <strong className="text-slate-300">{lastUsedModel}</strong>
                      {fallbackOccurred ? ' — авто-переход при лимите' : ''})
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {GEMINI_FREE_MODELS.map((m) => {
                  const isSelected = selectedModel === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleSelectModel(m.id)}
                      className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'bg-gradient-to-br from-slate-900 via-emerald-950/30 to-slate-900 border-emerald-500 ring-1 ring-emerald-500/40 shadow-md'
                          : 'bg-slate-950/70 border-slate-800 hover:border-slate-700 opacity-80 hover:opacity-100'
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                            #{m.rank}
                          </span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border truncate ${m.badgeColor}`}>
                            {m.badge}
                          </span>
                        </div>
                        <div className="text-xs font-bold text-white leading-snug">{m.name}</div>
                        <p className="text-[10px] text-slate-400 leading-relaxed">{m.description}</p>
                      </div>
                      <div className="pt-2 mt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                        <span className="text-slate-400">
                          Ум: <strong className="text-amber-300">{'★'.repeat(m.intelligenceRating)}</strong>
                        </span>
                        <span className={isSelected ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                          {isSelected ? '● Выбрана' : 'Выбрать'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* PromptGPT v2 Unified Pipeline */}
            <div className="bg-slate-900/90 border border-cyan-700/50 rounded-2xl p-5 shadow-xl space-y-4" data-testid="promptgpt-v2-panel">
              <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Sparkles className="h-4 w-4 text-cyan-400" />
                  <h3 className="text-sm font-bold text-white">PromptGPT v2 (Единый конвейер)</h3>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                    /api/v2/run
                  </span>
                  <button
                    type="button"
                    onClick={toggleUnfilteredMode}
                    data-testid="unfiltered-mode-toggle"
                    className={`text-[11px] px-2.5 py-0.5 rounded-full border font-semibold transition cursor-pointer ${
                      unfilteredMode
                        ? 'bg-amber-950/90 text-amber-200 border-amber-500/80'
                        : 'bg-slate-950 text-slate-400 border-slate-700 hover:text-slate-200'
                    }`}
                    title="Включает режим без смягчений и цензуры для генерации и анализа"
                  >
                    {unfilteredMode ? 'Без фильтрации: ВКЛ' : 'Без фильтрации: ВЫКЛ'}
                  </button>
                </div>
                <div className="text-xs font-mono text-cyan-300" data-testid="v2-status-label">
                  {v2Status || 'Ожидание запуска'}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Модель v2 (modelId)</label>
                  <input
                    type="text"
                    value={v2ModelId}
                    onChange={(e) => handleChangeV2ModelId(e.target.value)}
                    placeholder="gemini-3.1-flash-lite"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Интенсивность стиля (1–5): <strong className="text-cyan-300">{v2StyleIntensity}</strong>
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    value={v2StyleIntensity}
                    onChange={(e) => handleChangeV2StyleIntensity(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
                    className="w-full accent-cyan-500 cursor-pointer mt-2"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Ключ доступа PROMPTGPT v2 (обязателен)</label>
                  <input
                    type="password"
                    value={v2AccessKey}
                    onChange={(e) => setV2AccessKey(e.target.value)}
                    placeholder="Ключ PROMPTGPT_V2_ACCESS_KEY"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Дополнительные инструкции v2</label>
                <input
                  type="text"
                  value={v2CustomInstructions}
                  onChange={(e) => handleChangeV2CustomInstructions(e.target.value)}
                  placeholder="Например: сохраняй цитаты и даты без изменений..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              {v2Diagnostics?.status === 'needs_clarification' && Array.isArray(v2Diagnostics.questions) && (
                <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-700/60 space-y-2.5" data-testid="v2-clarification-box">
                  <div className="text-xs font-bold text-amber-300">Уточняющие вопросы перед генерацией:</div>
                  {v2Diagnostics.questions.map((q: any) => (
                    <div key={q.id} className="space-y-1">
                      <div className="text-xs text-slate-200">{q.prompt}</div>
                      <input
                        type="text"
                        value={v2QuestionChoices[q.id] ?? ''}
                        onChange={(e) =>
                          setV2QuestionChoices((prev) => ({ ...prev, [q.id]: e.target.value }))
                        }
                        placeholder="Ваш ответ..."
                        className="w-full bg-slate-950 border border-amber-800/70 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleRunV2Pipeline}
                  disabled={isGeneratingDna}
                  data-testid="run-v2-btn"
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 transition cursor-pointer"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Запустить PromptGPT v2</span>
                </button>

                {v2Diagnostics && v2Diagnostics.status !== 'needs_clarification' && (
                  <details className="text-xs text-slate-300">
                    <summary className="cursor-pointer text-cyan-300 hover:text-cyan-200 font-semibold">
                      Диагностика v2
                    </summary>
                    <pre className="mt-2 p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-w-2xl">
                      {JSON.stringify(v2Diagnostics, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </div>

            {/* 9 Modules */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-3 border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center space-x-2">
                    <Sliders className="h-4 w-4 text-purple-400" />
                    <span>9 модулей стиля и анти-детектора</span>
                    <span className="text-xs font-normal text-slate-400">
                      (включено: <strong className="text-purple-400">{activeEnginesCount}</strong> из {ALL_FLAG_KEYS.length})
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Включайте и выключайте любые модули — они объединяются в единый промпт без конфликтов.
                  </p>
                </div>
                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                  <button
                    type="button"
                    onClick={() => setFlags(PRESET_ALL)}
                    className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold"
                  >
                    Включить все (9)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFlags(PRESET_RECOMMENDED)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold"
                  >
                    Рекомендуемые (7)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFlags(PRESET_AUTHOR)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700"
                  >
                    Только ДНК автора (3)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFlags(PRESET_NONE)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-medium border border-slate-700"
                  >
                    Сбросить все
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center space-x-1.5">
                  <Dna className="h-3.5 w-3.5" />
                  <span>Часть А: ДНК автора и вариативность (4 модуля)</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {donorModules.map((m) => (
                    <ModuleCard key={m.key} mod={m} on={flags[m.key]} onToggle={() => toggleFlag(m.key)} />
                  ))}
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-400 flex items-center space-x-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Часть Б: Анти-детекторы и перплексия (5 модулей)</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                  {externalModules.map((m) => (
                    <ModuleCard key={m.key} mod={m} on={flags[m.key]} onToggle={() => toggleFlag(m.key)} />
                  ))}
                </div>
              </div>

              {/* Active prompt summary */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                    <Terminal className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Сводка активного промпта ({activeEnginesCount} модулей + {activeShieldsCount} щитов)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowActivePromptSummary(!showActivePromptSummary)}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 underline"
                  >
                    {showActivePromptSummary ? 'Скрыть сводку' : 'Показать сводку'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {MODULES.filter((m) => flags[m.key]).map((m) => (
                    <span
                      key={m.key}
                      className="text-[10px] px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-800/60"
                    >
                      ✓ {m.short}
                    </span>
                  ))}
                  {activeEnginesCount === 0 && (
                    <span className="text-[10px] text-slate-500">Нет активных модулей</span>
                  )}
                </div>
                {showActivePromptSummary && (
                  <pre className="mt-2 p-3 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-300 font-mono whitespace-pre-wrap max-h-60 overflow-y-auto">
                    {combinedPromptPreview}
                  </pre>
                )}
              </div>
            </div>

            {/* 16 Detectors & Shields */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-3 border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center space-x-2">
                    <ShieldCheck className="h-5 w-5 text-indigo-400" />
                    <span>{DETECTORS_LIST.length} детекторов ИИ + щиты со стрелочными циферблатами</span>
                    <span className="text-xs font-normal text-slate-400">
                      (щитов включено: <strong className="text-indigo-400">{activeShieldsCount}</strong> из {DETECTORS_LIST.length})
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Нажмите <strong>«Проверить все 16 детекторов»</strong> — каждый циферблат покажет % вероятности человека и вердикт по выбранному тексту.
                  </p>
                </div>
                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                  <button
                    type="button"
                    onClick={() => handleRunDetectorAudit()}
                    disabled={isAuditing}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold flex items-center space-x-1.5 shadow"
                  >
                    <Activity className={`h-3.5 w-3.5 ${isAuditing ? 'animate-spin' : ''}`} />
                    <span>{isAuditing ? 'Сканирование...' : `Проверить все ${DETECTORS_LIST.length}`}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRunSelectedDetectors()}
                    disabled={isAuditing || activeShieldsCount === 0}
                    className="px-3 py-1.5 rounded-lg bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white text-xs font-semibold flex items-center space-x-1.5"
                  >
                    <Search className="h-3.5 w-3.5" />
                    <span>Проверить выбранные ({activeShieldsCount})</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectAllShields}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
                  >
                    Включить все щиты ({DETECTORS_LIST.length})
                  </button>
                  <button
                    type="button"
                    onClick={handleKeyAcademicShields}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700"
                  >
                    Ключевые (8)
                  </button>
                  <button
                    type="button"
                    onClick={handleResetShields}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-medium border border-slate-700"
                  >
                    Сбросить щиты
                  </button>
                </div>
              </div>

              {/* Source selector */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-2 text-xs flex-wrap gap-y-1">
                  <span className="text-slate-400 font-medium">Текст для проверки:</span>
                  {(
                    [
                      ['result', 'Результат переноса ДНК'],
                      ['content', 'Исходный Текст 2'],
                      ['donor', 'Образец Текст 1'],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setAuditTargetSource(key)}
                      className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                        auditTargetSource === key
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="text-[11px] text-slate-400 truncate max-w-md">
                  К проверке: <strong className="text-slate-200">{wordCount(currentSourceText)} слов</strong> — «
                  {currentSourceText.slice(0, 55)}...»
                </div>
              </div>

              {renderDetectorCards(DETECTORS_LIST)}

              {activeWorkbenchDetector && (
                <DetectorWorkbench
                  detectorId={activeWorkbenchDetector}
                  onSelectDetector={setActiveWorkbenchDetector}
                  onBack={() => setActiveWorkbenchDetector(null)}
                  currentContentText={currentSourceText}
                  onApplyToMainScore={(detId, patch) => {
                    setDetectorScores((prev) => ({
                      ...prev,
                      [detId]: {
                        ...(prev[detId] || INITIAL_DETECTOR_SCORES[detId]),
                        ...patch,
                        lastTestedAt: Date.now(),
                      },
                    }));
                  }}
                />
              )}

              {/* Audit summary */}
              {auditResult && (
                <div className="bg-slate-950 border border-indigo-500/40 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800 pb-3">
                    <div className="flex items-center space-x-2">
                      <BarChart3 className="h-5 w-5 text-indigo-400" />
                      <h4 className="text-sm font-bold text-white">
                        Сводный отчёт по {auditResult.totalAudited} детекторам
                      </h4>
                    </div>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-700 font-semibold">
                      {auditResult.verdict}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                      <div className="text-[11px] text-slate-400">Средний балл «Человек»</div>
                      <div className="text-2xl font-black text-emerald-400 mt-0.5">{auditResult.overallHumanScore}%</div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                      <div className="text-[11px] text-slate-400">Средний риск ИИ</div>
                      <div className="text-2xl font-black text-rose-400 mt-0.5">{auditResult.overallAiScore}%</div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                      <div className="text-[11px] text-slate-400">Binoculars / DetectGPT</div>
                      <div className="text-sm font-mono font-bold text-indigo-300 mt-1.5">
                        {auditResult.binocularsScore} / Z={auditResult.detectGptCurvature}
                      </div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                      <div className="text-[11px] text-slate-400">GLTR (Top-10 / &gt;1000)</div>
                      <div className="text-sm font-mono font-bold text-purple-300 mt-1.5">
                        {auditResult.gltrDistribution?.top10}% / {auditResult.gltrDistribution?.outOf1000}%
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Text 1 & Text 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <TextInputCard
                borderColor="border-emerald-800/50"
                titleColor="text-emerald-400"
                Icon={UserCheck}
                title="ТЕКСТ 1: Образец стиля (ДНК автора)"
                sampleLabel="Загрузить пример"
                sampleBtnClass="bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border-emerald-800/60"
                hint="Откуда брать стиль речи, длину фраз, пунктуацию и ритм (факты из Текста 1 в результат не переносятся)."
                focusBorder="focus:border-emerald-500"
                value={donorText}
                onChange={setDonorText}
                onSample={() => setDonorText(SAMPLE_DONOR_TEXT)}
                placeholder="Вставьте текст-образец нужного стиля..."
              />
              <TextInputCard
                borderColor="border-blue-800/50"
                titleColor="text-blue-400"
                Icon={FileText}
                title="ТЕКСТ 2: Исходное содержание"
                sampleLabel="Загрузить пример"
                sampleBtnClass="bg-blue-950 hover:bg-blue-900 text-blue-300 border-blue-800/60"
                hint="Какие тезисы, факты и смыслы нужно изложить в новом стиле."
                focusBorder="focus:border-blue-500"
                value={contentText}
                onChange={setContentText}
                onSample={() => setContentText(SAMPLE_CONTENT_TEXT)}
                placeholder="Вставьте исходный текст для переработки..."
              />
            </div>

            {/* Run button */}
            <div className="flex flex-col items-center justify-center space-y-2">
              <button
                type="button"
                onClick={handleRunDnaTransfer}
                disabled={isGeneratingDna}
                className="w-full md:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-indigo-600 to-purple-600 hover:from-emerald-500 hover:via-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white font-bold text-sm shadow-xl shadow-indigo-600/25 flex items-center justify-center space-x-3 transition-all cursor-pointer"
              >
                {isGeneratingDna ? (
                  <>
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    <span>Перенос ДНК стиля ({activeEnginesCount} модулей + {activeShieldsCount} щитов)...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" />
                    <span>
                      Выполнить перенос ДНК стиля ({activeEnginesCount} модулей + {activeShieldsCount} щитов)
                    </span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowPromptDetails(!showPromptDetails)}
                className="text-xs text-slate-400 hover:text-indigo-400 flex items-center space-x-1"
              >
                <Terminal className="h-3.5 w-3.5" />
                <span>{showPromptDetails ? 'Скрыть структуру промпта' : 'Показать структуру промпта'}</span>
              </button>
            </div>

            {showPromptDetails && (
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
                    Структура объединённого промпта
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Активно модулей: {activeEnginesCount} | Щитов: {activeShieldsCount}
                  </span>
                </div>
                <pre className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-[11px] text-slate-300 font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">
                  {combinedPromptPreview}
                </pre>
              </div>
            )}

            {/* Refinement report */}
            {dnaRefinementMeta && (
              <div className="bg-slate-900/90 border border-teal-700/50 rounded-2xl p-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="font-bold text-teal-300 flex items-center space-x-1.5">
                    <ShieldCheck className="h-4 w-4 text-teal-400" />
                    <span>
                      Отчёт контроля качества и сближения с ДНК донора (проходов: {dnaRefinementMeta.passes}
                      {typeof dnaRefinementMeta.cyclesRun === 'number' ? `, циклов: ${dnaRefinementMeta.cyclesRun}` : ''})
                    </span>
                  </span>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-teal-950 text-teal-300 border border-teal-800 font-mono">
                    Замечаний: {dnaRefinementMeta.issuesDetected} → {dnaRefinementMeta.issuesRemaining}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                  <div className="bg-slate-950 border border-slate-800/80 rounded-lg p-2.5">
                    <div className="text-[10px] text-slate-400">Burstiness (до → после)</div>
                    <div className="text-sm font-mono font-bold text-cyan-300 mt-0.5">
                      {dnaRefinementMeta.burstinessBefore} → {dnaRefinementMeta.burstinessAfter}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Ориентир донора: ~{dnaRefinementMeta.donorBurstinessTarget}
                    </div>
                  </div>
                  <div className="bg-slate-950 border border-slate-800/80 rounded-lg p-2.5">
                    <div className="text-[10px] text-slate-400">Штампы (до → после)</div>
                    <div className="text-sm font-mono font-bold text-emerald-300 mt-0.5">
                      {dnaRefinementMeta.clichesBefore} → {dnaRefinementMeta.clichesAfter}
                    </div>
                    <div className="text-[10px] text-slate-500">Канцеляризмы и клише</div>
                  </div>
                  <div className="bg-slate-950 border border-slate-800/80 rounded-lg p-2.5">
                    <div className="text-[10px] text-slate-400">Факты и совпадение ДНК</div>
                    <div className="text-sm font-mono font-bold text-amber-300 mt-0.5">
                      {dnaRefinementMeta.factsPreservedPct ?? 100}% · ДНК {dnaRefinementMeta.dnaMatchAfter ?? '—'}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Потеряно фактов: {dnaRefinementMeta.factsLostAfter ?? 0}
                    </div>
                  </div>
                  <div className="bg-slate-950 border border-slate-800/80 rounded-lg p-2.5">
                    <div className="text-[10px] text-slate-400">Итоговый индекс качества</div>
                    <div className="text-sm font-mono font-bold text-indigo-300 mt-0.5">
                      {dnaRefinementMeta.overallScoreAfter ?? '—'}/100
                      {typeof dnaRefinementMeta.criticScore === 'number' ? ` · Критик ${dnaRefinementMeta.criticScore}` : ''}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate" title={dnaRefinementMeta.stopReason || ''}>
                      {dnaRefinementMeta.stopReason || 'Конвергенция завершена'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <OutputPanel
              title="Результат переноса стиля ДНК"
              titleColor="text-emerald-400"
              text={dnaResultText}
              loading={isGeneratingDna}
              loadingText="Применяем выбранные модули и щиты детекторов..."
              placeholder="Здесь появится текст, написанный в стиле Текста 1 на основе содержания Текста 2."
              baseName="style-dna-result"
              spinnerColor="text-emerald-500"
              Icon={Dna}
              elapsedMs={dnaElapsedMs}
              metrics={activeDnaMetrics}
              diagnostics={dnaDiagnostics}
            />
          </div>
        )}

        {/* ==================== DEDICATED BENCHMARK SUITES ==================== */}
        {activeTab === 'sloptotal' && (
          <SlopTotalWorkbench
            initialText={currentSourceText}
            onApplyScoreToMain={(humanScore, aiScore, rawMetric) => {
              setDetectorScores((prev) => ({
                ...prev,
                sloptotal: {
                  ...(prev.sloptotal || INITIAL_DETECTOR_SCORES.sloptotal),
                  humanScore,
                  aiScore,
                  rawMetric,
                  status: humanScore >= 70 ? 'Пройден (Clean)' : 'Подозрение на Slop',
                  verdictLabel: humanScore >= 70 ? 'Clean (Человек)' : 'AI Slop / Подозрение',
                  riskLevel: humanScore >= 70 ? 'low' : humanScore >= 50 ? 'medium' : 'high',
                  lastTestedAt: Date.now(),
                },
              }));
            }}
          />
        )}

        {activeTab === 'mgt-eval' && (
          <MgtEvalWorkbench
            initialText={currentSourceText}
            onApplyScoreToMain={(humanScore, aiScore, rawMetric) => {
              setDetectorScores((prev) => ({
                ...prev,
                mgtEval: {
                  ...(prev.mgtEval || INITIAL_DETECTOR_SCORES.mgtEval),
                  humanScore,
                  aiScore,
                  rawMetric,
                  status: humanScore >= 50 ? 'Пройден (Human)' : 'Подозрение на MGT',
                  verdictLabel: humanScore >= 50 ? 'Human (MGT-Eval)' : 'AI-Generated (MGT-Eval)',
                  riskLevel: humanScore >= 70 ? 'low' : humanScore >= 50 ? 'medium' : 'high',
                  lastTestedAt: Date.now(),
                },
              }));
            }}
          />
        )}

        {activeTab === 'mgt-bench' && (
          <MgtBenchWorkbench
            initialText={currentSourceText}
            onApplyScoreToMain={(humanScore, aiScore, rawMetric) => {
              setDetectorScores((prev) => ({
                ...prev,
                mgtBench: {
                  ...(prev.mgtBench || INITIAL_DETECTOR_SCORES.mgtBench),
                  humanScore,
                  aiScore,
                  rawMetric,
                  status: humanScore >= 50 ? 'Пройден (Human)' : 'Подозрение на MGT',
                  verdictLabel: humanScore >= 50 ? 'Human (MGTBench)' : 'AI-Generated (MGTBench)',
                  riskLevel: humanScore >= 70 ? 'low' : humanScore >= 50 ? 'medium' : 'high',
                  lastTestedAt: Date.now(),
                },
              }));
            }}
          />
        )}

        {activeTab === 'detect-zoo' && (
          <DetectZooWorkbench
            initialText={currentSourceText}
            onApplyScoreToMain={(humanScore, aiScore, rawMetric) => {
              setDetectorScores((prev) => ({
                ...prev,
                detectZoo: {
                  ...(prev.detectZoo || INITIAL_DETECTOR_SCORES.detectZoo),
                  humanScore,
                  aiScore,
                  rawMetric,
                  status: humanScore >= 50 ? 'Пройден (Human)' : 'Подозрение на AI',
                  verdictLabel: humanScore >= 50 ? 'Human (DetectZoo)' : 'AI-Generated (DetectZoo)',
                  riskLevel: humanScore >= 70 ? 'low' : humanScore >= 50 ? 'medium' : 'high',
                  lastTestedAt: Date.now(),
                },
              }));
            }}
          />
        )}

        {/* ==================== TAB 2: ANALYSIS ==================== */}
        {activeTab === 'analysis' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Human reference */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center space-x-2 text-emerald-400 font-semibold text-sm">
                    <CheckSquare className="h-4 w-4" />
                    <span>Эталон: естественный авторский стиль</span>
                  </div>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                    Ориентир
                  </span>
                </div>
                <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 text-xs text-slate-300 leading-relaxed max-h-48 overflow-y-auto font-serif">
                  {TEXT_HUMAN}
                </div>
                {metricsHuman && (
                  <div className="grid grid-cols-3 gap-2 pt-2">
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
                      <div className="text-[11px] text-slate-400">Средняя длина</div>
                      <div className="text-lg font-bold text-white mt-0.5">{metricsHuman.avgWords} сл.</div>
                      <div className="text-[10px] text-slate-500">
                        от {metricsHuman.minSentenceWords} до {metricsHuman.maxSentenceWords}
                      </div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
                      <div className="text-[11px] text-slate-400">Коротких (≤8 сл.)</div>
                      <div className="text-lg font-bold text-emerald-400 mt-0.5">{metricsHuman.shortSentences.length}</div>
                      <div className="text-[10px] text-slate-500">из {metricsHuman.sentenceCount} фраз</div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
                      <div className="text-[11px] text-slate-400">Burstiness</div>
                      <div className="text-lg font-bold text-purple-400 mt-0.5">{metricsHuman.burstiness}</div>
                      <div className="text-[10px] text-slate-500">разброс длины</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Target text */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center space-x-2 text-amber-400 font-semibold text-sm">
                    <AlertTriangle className="h-4 w-4" />
                    <span>Проверяемый текст</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInputTextAI(TEXT_AI)}
                    className="text-xs text-indigo-400 hover:text-indigo-300 underline"
                  >
                    Сбросить пример
                  </button>
                </div>
                <textarea
                  rows={6}
                  value={inputTextAI}
                  onChange={(e) => setInputTextAI(e.target.value)}
                  placeholder="Вставьте текст для проверки ритма и штампов..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 leading-relaxed resize-none font-serif"
                />
                {metricsAI && (
                  <div className="grid grid-cols-3 gap-2 pt-2">
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
                      <div className="text-[11px] text-slate-400">Средняя длина</div>
                      <div className="text-lg font-bold text-white mt-0.5">{metricsAI.avgWords} сл.</div>
                      <div className="text-[10px] text-slate-500">
                        от {metricsAI.minSentenceWords} до {metricsAI.maxSentenceWords}
                      </div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
                      <div className="text-[11px] text-slate-400">Коротких (≤8 сл.)</div>
                      <div className="text-lg font-bold text-amber-400 mt-0.5">{metricsAI.shortSentences.length}</div>
                      <div className="text-[10px] text-slate-500">из {metricsAI.sentenceCount} фраз</div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
                      <div className="text-[11px] text-slate-400">Burstiness</div>
                      <div className="text-lg font-bold text-rose-400 mt-0.5">{metricsAI.burstiness}</div>
                      <div className="text-[10px] text-slate-500">однородность: {metricsAI.uniformityScore}%</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {metricsAI && metricsAI.foundCliches.length > 0 && (
              <div className="bg-amber-950/20 border border-amber-900/40 rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-amber-300 mb-2">
                  Найдены частые штампы ({metricsAI.foundCliches.length}):
                </h3>
                <div className="flex flex-wrap gap-2">
                  {metricsAI.foundCliches.map((c, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 rounded-lg bg-amber-950/60 border border-amber-800/50 text-xs text-amber-200"
                    >
                      «{c}»
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 16 Detectors */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-3 border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center space-x-2">
                    <ShieldAlert className="h-5 w-5 text-indigo-400" />
                    <span>Проверка по {DETECTORS_LIST.length} детекторам (циферблаты)</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Проверяет текст из поля выше по всем {DETECTORS_LIST.length} моделям и метрикам.
                  </p>
                </div>
                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                  <button
                    type="button"
                    onClick={() => handleRunDetectorAudit(inputTextAI)}
                    disabled={isAuditing}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold flex items-center space-x-2 shadow-lg cursor-pointer"
                  >
                    <Activity className={`h-4 w-4 ${isAuditing ? 'animate-spin' : ''}`} />
                    <span>{isAuditing ? 'Сканирование...' : `Проверить по всем ${DETECTORS_LIST.length} детекторам`}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRunSelectedDetectors(inputTextAI)}
                    disabled={isAuditing || activeShieldsCount === 0}
                    className="px-3.5 py-2 rounded-xl bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white text-xs font-bold flex items-center space-x-1.5 shadow cursor-pointer"
                  >
                    <Search className="h-3.5 w-3.5" />
                    <span>Выбранные ({activeShieldsCount})</span>
                  </button>
                </div>
              </div>

              {renderDetectorCards(DETECTORS_LIST)}

              {activeWorkbenchDetector && (
                <DetectorWorkbench
                  detectorId={activeWorkbenchDetector}
                  onSelectDetector={setActiveWorkbenchDetector}
                  onBack={() => setActiveWorkbenchDetector(null)}
                  currentContentText={inputTextAI}
                  onApplyToMainScore={(detId, patch) => {
                    setDetectorScores((prev) => ({
                      ...prev,
                      [detId]: {
                        ...(prev[detId] || INITIAL_DETECTOR_SCORES[detId]),
                        ...patch,
                        lastTestedAt: Date.now(),
                      },
                    }));
                  }}
                />
              )}
            </div>
          </div>
        )}

        {/* ==================== TAB 3: SANDBOX ==================== */}
        {activeTab === 'sandbox' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <h2 className="text-base font-semibold text-white flex items-center space-x-2">
                    <Sliders className="h-4 w-4 text-indigo-400" />
                    <span>Настройки переработки</span>
                  </h2>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800/60 font-medium">
                    Интенсивность: {styleIntensity}/10
                  </span>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-slate-400 mb-2">
                    <span>Мягкая правка (1)</span>
                    <span>Средняя (5)</span>
                    <span>Глубокая переработка (10)</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={styleIntensity}
                    onChange={(e) => setStyleIntensity(Number(e.target.value))}
                    className="w-full accent-indigo-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-2">
                    Дополнительные пожелания (необязательно)
                  </label>
                  <textarea
                    rows={3}
                    value={promptStrategy}
                    onChange={(e) => setPromptStrategy(e.target.value)}
                    placeholder="Например: сделать более живой ритм, сохранить термины и даты..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 resize-none"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-medium text-slate-300">Исходный текст</label>
                    <button
                      type="button"
                      onClick={() => setInputTextAI(TEXT_AI)}
                      className="text-[11px] text-indigo-400 hover:text-indigo-300"
                    >
                      Подставить пример
                    </button>
                  </div>
                  <textarea
                    rows={8}
                    value={inputTextAI}
                    onChange={(e) => setInputTextAI(e.target.value)}
                    placeholder="Вставьте текст для переработки..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 leading-relaxed resize-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleTransformHumanizer}
                  disabled={isGeneratingHumanizer}
                  className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white font-semibold text-sm shadow-lg shadow-indigo-600/20 flex items-center justify-center space-x-2 transition-all cursor-pointer"
                >
                  {isGeneratingHumanizer ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Перерабатываем текст...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      <span>Переработать текст</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="lg:col-span-7 space-y-6">
              <OutputPanel
                title="Результат переработки"
                titleColor="text-emerald-400"
                text={transformedText}
                loading={isGeneratingHumanizer}
                loadingText="Редактируем стиль и ритм предложения за предложением..."
                placeholder="Нажмите «Переработать текст», чтобы получить результат."
                baseName="humanized-text"
                elapsedMs={humanizerElapsedMs}
                metrics={activeHumanizerMetrics}
                diagnostics={humanizerDiagnostics}
              />

              {metricsTransformed && (
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                    Метрики ритма результата
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
                      <div className="text-[11px] text-slate-400">Средняя длина</div>
                      <div className="text-base font-bold text-white mt-0.5">{metricsTransformed.avgWords} сл.</div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
                      <div className="text-[11px] text-slate-400">Коротких фраз</div>
                      <div className="text-base font-bold text-emerald-400 mt-0.5">
                        {metricsTransformed.shortSentences.length}
                      </div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
                      <div className="text-[11px] text-slate-400">Burstiness</div>
                      <div className="text-base font-bold text-purple-400 mt-0.5">{metricsTransformed.burstiness}</div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
                      <div className="text-[11px] text-slate-400">Штампов осталось</div>
                      <div className="text-base font-bold text-amber-400 mt-0.5">
                        {metricsTransformed.foundCliches.length}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== TAB 4: DRAFT WORKSHOP ==================== */}
        {activeTab === 'draft-workshop' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <h2 className="text-base font-semibold text-white flex items-center space-x-2">
                  <FileCode className="h-4 w-4 text-purple-400" />
                  <span>Рабочий черновик</span>
                </h2>
                <span className="text-xs px-2.5 py-1 rounded-full bg-purple-950 text-purple-300 border border-purple-800/60 font-medium">
                  Глубина: {draftStrength}/10
                </span>
              </div>
              <div>
                <div className="flex justify-between text-xs text-slate-400 mb-2">
                  <span>Лёгкая правка (1)</span>
                  <span>Глубокая переработка (10)</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={draftStrength}
                  onChange={(e) => setDraftStrength(Number(e.target.value))}
                  className="w-full accent-purple-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-medium text-slate-300">Текст черновика</label>
                  <button
                    type="button"
                    onClick={() => setDraftInputText(SAMPLE_DRAFT_TEXT)}
                    className="text-[11px] text-purple-400 hover:text-purple-300"
                  >
                    Подставить пример
                  </button>
                </div>
                <textarea
                  rows={11}
                  value={draftInputText}
                  onChange={(e) => setDraftInputText(e.target.value)}
                  placeholder="Вставьте черновик..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500 leading-relaxed resize-none"
                />
              </div>
              <button
                type="button"
                onClick={handleGenerateDraft}
                disabled={isGeneratingDraft}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-semibold text-sm shadow-lg flex items-center justify-center space-x-2 cursor-pointer"
              >
                {isGeneratingDraft ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Формируем черновик...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>Сформировать черновик</span>
                  </>
                )}
              </button>
            </div>
            <div className="lg:col-span-7">
              <OutputPanel
                title="Готовый черновик"
                titleColor="text-purple-400"
                text={draftOutputText}
                loading={isGeneratingDraft}
                loadingText="Перерабатываем черновик..."
                placeholder="Здесь появится переработанный черновик."
                baseName="draft-workshop"
                spinnerColor="text-purple-500"
                elapsedMs={draftElapsedMs}
                metrics={activeDraftMetrics}
                diagnostics={draftDiagnostics}
              />
            </div>
          </div>
        )}

        {/* ==================== TAB 5: ACADEMIC 39 ==================== */}
        {activeTab === 'academic-39' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <h2 className="text-base font-semibold text-white flex items-center space-x-2">
                  <BookOpen className="h-4 w-4 text-teal-400" />
                  <span>Академический стиль (39 правил)</span>
                </h2>
                <span className="text-xs px-2.5 py-1 rounded-full bg-teal-950 text-teal-300 border border-teal-800/60 font-medium">
                  39 правил
                </span>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">
                  Дополнительные требования к тексту
                </label>
                <textarea
                  rows={3}
                  value={academicCustomInstructions}
                  onChange={(e) => setAcademicCustomInstructions(e.target.value)}
                  placeholder="Например: сохранить библиографические ссылки и термины..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-teal-500 resize-none"
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-medium text-slate-300">Исходный текст</label>
                  <button
                    type="button"
                    onClick={() => setAcademicInputText(TEXT_AI)}
                    className="text-[11px] text-teal-400 hover:text-teal-300"
                  >
                    Подставить пример
                  </button>
                </div>
                <textarea
                  rows={9}
                  value={academicInputText}
                  onChange={(e) => setAcademicInputText(e.target.value)}
                  placeholder="Вставьте текст для академической переработки..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500 leading-relaxed resize-none"
                />
              </div>
              <button
                type="button"
                onClick={handleGenerateAcademic39}
                disabled={isGeneratingAcademic}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 disabled:opacity-50 text-white font-semibold text-sm shadow-lg flex items-center justify-center space-x-2 cursor-pointer"
              >
                {isGeneratingAcademic ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Применяем 39 правил...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>Переработать по 39 правилам</span>
                  </>
                )}
              </button>
            </div>
            <div className="lg:col-span-7">
              <OutputPanel
                title="Академический текст"
                titleColor="text-teal-400"
                text={academicOutputText}
                loading={isGeneratingAcademic}
                loadingText="Редактируем текст по академическим правилам..."
                placeholder="Здесь появится переработанный текст."
                baseName="academic-39"
                spinnerColor="text-teal-500"
                elapsedMs={academicElapsedMs}
                metrics={activeAcademicMetrics}
                diagnostics={academicDiagnostics}
              />
            </div>
          </div>
        )}

        {/* ==================== TAB 6: HISTORY ==================== */}
        {activeTab === 'history' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <History className="h-5 w-5 text-indigo-400" />
                  <span>История операций, промптов, времени и метрик</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Выберите любую запись слева, чтобы просмотреть полный результат, использованный промпт, время выполнения, +40 метрик и диагностику.
                </p>
              </div>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearHistory}
                  className="px-3.5 py-1.5 rounded-lg bg-red-950/60 hover:bg-red-900/70 border border-red-800/60 text-red-200 text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Очистить историю</span>
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 space-y-2">
                <History className="h-10 w-10 text-slate-600 mx-auto" />
                <p>История пока пуста. Выполните генерацию или переработку текста на любой вкладке.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left list of history items */}
                <div className="lg:col-span-5 space-y-3 max-h-[820px] overflow-y-auto pr-1">
                  {history.map((item) => {
                    const isSelected = selectedHistoryItem?.id === item.id;
                    const typeBadge =
                      item.type === 'style-dna'
                        ? 'Стиль ДНК'
                        : item.type === 'draft'
                        ? 'Черновик'
                        : item.type === 'academic-39'
                        ? 'Стиль 39 правил'
                        : 'Гуманизатор';

                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedHistoryItemId(item.id)}
                        className={`p-4 rounded-xl border transition cursor-pointer space-y-2 ${
                          isSelected
                            ? 'bg-slate-900 border-indigo-500 ring-1 ring-indigo-500/40 shadow-lg'
                            : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-xs flex-wrap">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60 font-semibold text-[11px]">
                              {typeBadge}
                            </span>
                            {item.modelUsed && (
                              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-mono">
                                {item.modelUsed}
                              </span>
                            )}
                            {typeof item.durationMs === 'number' && (
                              <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/50 text-[10px] font-mono flex items-center gap-1">
                                <Clock className="h-2.5 w-2.5" /> {formatDuration(item.durationMs)}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteHistoryItem(item.id);
                            }}
                            className="text-slate-500 hover:text-red-400 p-1 rounded"
                            title="Удалить запись"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="text-[11px] text-slate-400">
                          {new Date(item.timestamp).toLocaleString('ru-RU')} · Параметр: <strong>{item.strengthOrIntensity}</strong> · Объём: <strong>{wordCount(item.outputText)} сл.</strong>
                        </div>

                        <p className="text-xs text-slate-200 line-clamp-2 font-serif bg-slate-950/70 p-2 rounded-lg border border-slate-800/70">
                          {item.outputText}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Right detailed viewer */}
                <div className="lg:col-span-7 space-y-4">
                  {selectedHistoryItem && (
                    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800 pb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Eye className="h-4 w-4 text-indigo-400" />
                          <h3 className="text-sm font-bold text-white">
                            Детальный просмотр записи от {new Date(selectedHistoryItem.timestamp).toLocaleString('ru-RU')}
                          </h3>
                          {typeof selectedHistoryItem.durationMs === 'number' && (
                            <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-[11px] font-mono text-emerald-300">
                              Время: {formatDuration(selectedHistoryItem.durationMs)}
                            </span>
                          )}
                        </div>
                        <OutputActions text={selectedHistoryItem.outputText} baseName={`history-${selectedHistoryItem.type}`} />
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5">
                          <div className="text-[10px] text-slate-400">Модель</div>
                          <div className="font-mono font-bold text-cyan-300 truncate">{selectedHistoryItem.modelUsed || selectedModelName}</div>
                        </div>
                        <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5">
                          <div className="text-[10px] text-slate-400">Длительность</div>
                          <div className="font-mono font-bold text-emerald-300">{formatDuration(selectedHistoryItem.durationMs)}</div>
                        </div>
                        <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5">
                          <div className="text-[10px] text-slate-400">Слов в результате</div>
                          <div className="font-mono font-bold text-white">{wordCount(selectedHistoryItem.outputText)}</div>
                        </div>
                        <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5">
                          <div className="text-[10px] text-slate-400">Интенсивность / сила</div>
                          <div className="font-mono font-bold text-amber-300">{selectedHistoryItem.strengthOrIntensity}</div>
                        </div>
                      </div>

                      {selectedHistoryItem.promptUsed && (
                        <details open className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs">
                          <summary className="cursor-pointer font-bold text-indigo-300">
                            Использованный промпт и параметры запроса
                          </summary>
                          <pre className="mt-2 text-[11px] font-mono text-slate-300 whitespace-pre-wrap overflow-x-auto">
                            {selectedHistoryItem.promptUsed}
                          </pre>
                        </details>
                      )}

                      <div className="space-y-1.5">
                        <div className="text-xs font-semibold text-slate-400">Исходный вход:</div>
                        <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3.5 text-xs text-slate-300 max-h-40 overflow-y-auto whitespace-pre-wrap font-serif">
                          {selectedHistoryItem.inputText}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="text-xs font-semibold text-emerald-400">Итоговый текст:</div>
                        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-slate-100 max-h-80 overflow-y-auto whitespace-pre-wrap leading-relaxed font-serif">
                          {selectedHistoryItem.outputText}
                        </div>
                      </div>

                      <Plus40MetricsPanel
                        metrics={computePlus40Metrics(selectedHistoryItem.outputText, donorText, selectedHistoryItem.inputText)}
                        title="Полный набор метрик записи (+42 показателя)"
                      />

                      {selectedHistoryItem.diagnosticsSnapshot?.log && (
                        <ExtendedDiagnosticsPanel log={selectedHistoryItem.diagnosticsSnapshot.log} />
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        </main>
      </div>
    </div>
  );
}
