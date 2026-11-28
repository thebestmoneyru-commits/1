/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Type } from '@google/genai';

/* ------------------------------------------------------------------ */
/* Dictionaries & Regexes                                             */
/* ------------------------------------------------------------------ */

// Машинные штампы и канцеляризмы ИИ.
// Обычные авторские связки сами по себе не считаются ошибками.
export const EXTENDED_AI_CLICHES: string[] = [
  'в рамках',
  'при таком подходе',
  'следует отметить',
  'необходимо отметить',
  'необходимо подчеркнуть',
  'важно подчеркнуть',
  'важно отметить',
  'нельзя не отметить',
  'нельзя не подчеркнуть',
  'в конечном счете',
  'в конечном итоге',
  'является неотъемлемой',
  'неотъемлемой частью',
  'данное обстоятельство',
  'представляется возможным',
  'играет ключевую роль',
  'играет важную роль',
  'подводя итог',
  'подводя промежуточный итог',
  'как было показано выше',
  'комплексный подход',
  'краеугольный камень',
  'гобелен',
  'многогранн',
  'свидетельствует о том',
  'обусловлено необходимостью',
  'в современном дискурсе',
  'выступает ключевым фактором',
  'фундаментальная парадигма',
  'особую актуальность приобретает',
  'целесообразно отметить',
  'непреходящую ценность',
  'детерминирующим фактором',
  'способствует формированию',
  'оказывает существенное влияние',
  'находит свое отражение',
  'необходимо констатировать',
  'зачастую порождает',
  'имманентно присущ',
  'возводится в ранг',
  'ключевого мерила',
  'неизбежно сталкиваясь',
  'в жестко заданной системе',
  'не теряет своей актуальности',
  'служит ярким примером',
];

const AUTHOR_DISCOURSE_MARKERS = [
  'ведь',
  'же',
  'ибо',
  'однако',
  'впрочем',
  'причем',
  'причём',
  'даже',
  'лишь',
  'собственно',
  'тем не менее',
  'кроме того',
  'да и',
  'едва ли',
  'все-таки',
  'всё-таки',
  'напротив',
  'действительно',
  'пожалуй',
  'кстати',
  'именно',
  'вовсе',
  'по сути',
  'между тем',
  'стало быть',
];

const SENTENCE_START_STOPWORDS = new Set([
  'однако', 'поэтому', 'причем', 'причём', 'кроме', 'также', 'далее', 'более', 'менее',
  'если', 'когда', 'поскольку', 'хотя', 'чтобы', 'даже', 'лишь', 'только', 'именно',
  'следовательно', 'таким', 'образом', 'впрочем', 'напротив', 'действительно', 'пожалуй',
  'конечно', 'вероятно', 'возможно', 'очевидно', 'разумеется', 'безусловно', 'вообще',
  'здесь', 'тогда', 'теперь', 'сейчас', 'потом', 'затем', 'после', 'перед', 'между',
  'среди', 'через', 'ввиду', 'вследствие', 'вопреки', 'согласно', 'подобно', 'вместе',
  'любой', 'любая', 'любое', 'каждый', 'каждая', 'каждое', 'всякий', 'всякая', 'некий',
  'такой', 'такая', 'такое', 'такие', 'данный', 'данная', 'данное', 'данные',
  'этот', 'эта', 'это', 'эти', 'того', 'этом', 'этой', 'этих', 'всего', 'всех',
  'сами', 'сама', 'само', 'самом', 'самих', 'свой', 'своя', 'свое', 'своё', 'свои',
  'наша', 'наше', 'наши', 'нашем', 'иной', 'иная', 'иное', 'иные', 'другой', 'другая',
  'первый', 'второй', 'третий', 'главный', 'основной', 'современный', 'современная',
  'отсюда', 'итак', 'значит', 'наконец', 'во-первых', 'во-вторых', 'в-третьих',
  'кстати', 'собственно', 'ибо', 'ведь', 'неужели', 'разве', 'несмотря', 'благодаря',
  'нельзя', 'нужно', 'можно', 'следует', 'стоит', 'приходится', 'оказывается',
]);

const RUSSIAN_FUNCTION_WORDS = new Set([
  'что', 'как', 'для', 'при', 'или', 'без', 'над', 'под', 'про', 'раз', 'уже', 'еще', 'ещё',
  'где', 'кто', 'чем', 'тем', 'это', 'вот', 'тут', 'там', 'так', 'его', 'её', 'них', 'нам',
  'вас', 'они', 'она', 'оно', 'мы', 'вы', 'быть', 'есть', 'был', 'была', 'были', 'будет',
  'может', 'могут', 'только', 'лишь', 'даже', 'очень', 'более', 'менее', 'когда',
  'если', 'хотя', 'чтобы', 'потому', 'поэтому', 'однако', 'впрочем', 'причем', 'который',
  'которая', 'которое', 'которые', 'которого', 'которой', 'которых', 'которым', 'свой',
  'своей', 'своих', 'этого', 'этой', 'этих', 'этом', 'этим', 'того', 'тому', 'самом',
  'самой', 'самих', 'всех', 'всего', 'всей', 'всем', 'между', 'через', 'после', 'перед',
  'ведь', 'именно', 'таким', 'образом', 'себя', 'себе', 'собой', 'ибо', 'него',
]);

const ABBREVIATION_END =
  /(?:^|[\s(«"])(?:[А-ЯЁ]\.){1,2}$|(?:^|\s)(?:т\.е|т\.к|т\.д|т\.п|т\.н|напр|см|рис|стр|гг?|вв?|им|ул|проф|акад|св|тыс|млн|млрд|н\.э)\.$/i;

// Границы кириллических слов задаются явно: \b в JavaScript работает с кириллицей некорректно.
const COPULA_REGEX =
  /(^|[^а-яё])(является|являются|представляет собой|представляют собой|выступает в качестве|служит одним из|выступает лишь)(?![а-яё])/i;

const SMOOTH_ENDING_REGEX =
  /(?:,\s*(?:что|тем самым)\s+(?:открывает путь|подтверждает|свидетельствует|делает его|делает её|делает ее|обретает|приводит к|обеспечивает)\b|обретает\s+(?:подлинн|внутренн|глубок)[а-яё]+\s+(?:смысл|гармони|целостност))/i;

const TRIAD_REGEX =
  /([а-яё]{4,}(?:ый|ая|ое|ые|ого|ому|ым|ом|ой|ую|их|ими|ет|ют|ит|ят|ся|ия|ие|ость)),\s+([а-яё]{4,}(?:ый|ая|ое|ые|ого|ому|ым|ом|ой|ую|их|ими|ет|ют|ит|ят|ся|ия|ие|ость))\s+и\s+([а-яё]{4,}(?:ый|ая|ое|ые|ого|ому|ым|ом|ой|ую|их|ими|ет|ют|ит|ят|ся|ия|ие|ость))/i;

const GENITIVE_CHAIN_REGEX =
  /\b([а-яё]{5,}(?:ия|ения|ания|ости|ства|ции|изма|ования|ов|ев|ей))\s+([а-яё]{5,}(?:ия|ения|ания|ости|ства|ции|изма|ования|ов|ев|ей))\s+([а-яё]{5,}(?:ия|ения|ания|ости|ства|ции|изма|ования|ов|ев|ей))/i;

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type AuthorialDeviationKind =
  | 'genitiveChain'
  | 'copula'
  | 'symmetry'
  | 'triad'
  | 'repetition'
  | 'shortFragment'
  | 'unusualOpening';

export interface AuthorialDeviationSignal {
  kind: AuthorialDeviationKind;
  count: number;
  per300Words: number;
  paragraphSpread: number;
  confidence: number;
  examples: string[];
}

export interface AuthorialDeviationProfile {
  totalWords: number;
  analyzedParagraphs: number;
  signals: AuthorialDeviationSignal[];
  protectionLevel: 'low' | 'medium' | 'high';
}

export interface DonorDNAProfile {
  sentenceCount: number;
  paragraphCount: number;
  avgSentPerPara: number;
  minSentPerPara: number;
  maxSentPerPara: number;
  minLen: number;
  medianLen: number;
  maxLen: number;
  avgLen: number;
  stdDev: number;
  burstiness: number;
  shortRatioPct: number;
  longRatioPct: number;
  ttr: number;
  avgWordLenChars: number;
  dashStyle: '—' | '–';
  dashesPer1k: number;
  colonsPer1k: number;
  semicolonsPer1k: number;
  parensPer1k: number;
  questionsCount: number;
  copulaPer1k: number;
  conjunctionStartsPct: number;
  genitiveChainRate: number;
  favoriteMarkers: string[];
  usesGuillemets: boolean;
  sampleCadence: number[];
  exemplars: string[];
  authorialDeviations?: AuthorialDeviationProfile;
  // Фразы из списка AI-клише, реально встречающиеся у донора: их нельзя автоматически штрафовать.
  donorObservedCliches?: string[];
  // DNA v3: Deep morphosyntax, multi-bin cadence & anti-leakage
  lengthHistogramPct: [number, number, number, number, number]; // [1-5, 6-10, 11-16, 17-24, 25+]
  cadenceDeltaMean: number;
  nominalizationPer100: number;
  participleClausePerSent: number;
  modalParticlePer1k: number;
  firstSecondPersonPer1k: number;
  autoMinedOpeners: string[];
  autoMinedConnectors: string[];
  paragraphClosingStyle: 'concise' | 'question' | 'reflective' | 'balanced';
  donorTopicTerms: string[];
}

export interface DonorAuthorialAnomaly {
  category: string;
  observedForms: string[];
  count: number;
  per300Words: number;
  confidence: number;
  transferRule: string;
}

export interface DonorStyleBlueprint {
  voiceAndPerson: string;
  lexicalRegister: string;
  syntaxHabits: string[];
  transitionStyle: string;
  rhythmNotes: string;
  avoidFeatures: string[];
  structuralTemplates: string[];
  // Реальные отклонения донора — отдельный слой ДНК, а не список дефектов результата.
  authorialAnomalies?: DonorAuthorialAnomaly[];
}

export interface FactInventory {
  numbersAndDates: string[];
  properNames: string[];
  domainTerms: string[];
  negationCount: number;
  modalCues: string[];
}

export interface FactVerificationReport {
  preservedPct: number;
  lostCritical: string[];
  lostTerms: string[];
  negationDelta?: number;
  lostModals?: string[];
  donorLeakTerms?: string[];
}

export interface EngineFlags {
  basic?: boolean;
  ultra?: boolean;
  targeted6?: boolean;
  twentyCycles?: boolean;
  turnitout?: boolean;
  lynote?: boolean;
  dadaNanjesha?: boolean;
  blader?: boolean;
  perplexityTopics?: boolean;
}

export interface DetectorShields {
  binoculars?: boolean;
  detectGpt?: boolean;
  fastDetectGpt?: boolean;
  gltr?: boolean;
  radar?: boolean;
  ghostbuster?: boolean;
  sloptotal?: boolean;
  mgtEval?: boolean;
  mgtBench?: boolean;
  detectZoo?: boolean;
  robertaOpenAi?: boolean;
  desklib?: boolean;
  aiTextJury?: boolean;
  hc3Comparison?: boolean;
  houtini?: boolean;
  detectLlama?: boolean;
}

export type IssueType =
  | 'cliche'
  | 'monotony'
  | 'repetition'
  | 'copula'
  | 'symmetry'
  | 'burstiness'
  | 'ttr'
  | 'triad'
  | 'genitiveChain'
  | 'lexicalEcho'
  | 'smoothEnding'
  | 'donorLengthDrift'
  | 'donorPunctuation'
  | 'donorMarkers'
  | 'nominalizationOverload'
  | 'participleOverload'
  | 'donorTopicLeak'
  | 'negationShift'
  | 'factLoss';

export interface DiagnosticIssue {
  type: IssueType;
  severity: 'critical' | 'major' | 'minor';
  sentenceIndexes: number[];
  message: string;
}

export interface DiagnosticReport {
  sentenceCount: number;
  paragraphCount: number;
  avgLen: number;
  shortRatioPct: number;
  longRatioPct: number;
  burstiness: number;
  ttr: number;
  dashesPer1k: number;
  nominalizationPer100: number;
  participleClausePerSent: number;
  foundCliches: string[];
  issues: DiagnosticIssue[];
  humanScore: number;
  dnaMatchScore: number;
  overallScore: number;
  factsReport: FactVerificationReport;
  needsRefinement: boolean;
}

/* ------------------------------------------------------------------ */
/* Russian stemmer & text utilities                                   */
/* ------------------------------------------------------------------ */

export function stemRussianWord(raw: string): string {
  const w = raw.toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z0-9-]/g, '');
  if (w.length <= 4) return w;

  if (/^[a-z0-9-]+$/.test(w)) {
    return w.replace(/(?:ing|tion|ment|ness|able|ible|ed|es|s)$/, '') || w;
  }

  let s = w;
  s = s.replace(/(?:ться|ться|вши|вшись|ивши|ившись|ывши|ывшись)$/, '');
  s = s.replace(
    /(?:иями|ями|ами|ого|ему|ому|ыми|ими|его|ее|ие|ые|ой|ий|ый|ая|яя|ое|ую|юю|им|ым|ем|ом|ам|ям|ах|ях|ов|ев|ей|ию|ью|ия|ья|ие|ье|у|ю|а|я|е|о|и|ы)$/,
    ''
  );

  if (s.length >= 6) {
    s = s.replace(/(?:ующ|ющ|ащ|ящ|вш|енн|анн|онн|ост|еств|ирова|ова|ева)$/, '');
  }

  return s.length >= 3 ? s : w.slice(0, Math.min(4, w.length));
}

function splitParagraph(paragraph: string): string[] {
  const raw = paragraph
    .split(/(?<=[.!?…])\s+(?=[А-ЯЁA-Z«"(\d—–-])/u)
    .map((s) => s.trim())
    .filter(Boolean);

  const merged: string[] = [];

  for (const s of raw) {
    if (merged.length > 0 && ABBREVIATION_END.test(merged[merged.length - 1])) {
      merged[merged.length - 1] += ' ' + s;
    } else {
      merged.push(s);
    }
  }

  return merged.filter((s) => s.length > 2);
}

export function splitSentences(text: string): string[] {
  return text.split(/\n{2,}/).flatMap(splitParagraph);
}

export function getSentenceWords(sentence: string): string[] {
  return sentence.match(/[а-яёa-z0-9-]+/gi) || [];
}

export function movingTTR(words: string[], windowSize = 50): number {
  const stemCache = new Map<string, string>();
  const stemmed: string[] = [];

  for (const word of words) {
    let stem = stemCache.get(word);

    if (stem === undefined) {
      stem = stemRussianWord(word);
      stemCache.set(word, stem);
    }

    if (stem.length >= 2) stemmed.push(stem);
  }

  const n = stemmed.length;
  if (n === 0) return 0.65;

  const safeWindow = Math.max(1, Math.floor(windowSize));

  if (n < safeWindow) {
    return Number((new Set(stemmed).size / n).toFixed(2));
  }

  const frequencies = new Map<string, number>();
  let unique = 0;

  for (let i = 0; i < safeWindow; i++) {
    const word = stemmed[i];
    const next = (frequencies.get(word) || 0) + 1;
    frequencies.set(word, next);
    if (next === 1) unique++;
  }

  const step = Math.max(1, Math.floor(safeWindow / 5));
  let sum = unique / safeWindow;
  let count = 1;
  let windowStart = 0;

  while (windowStart + step + safeWindow <= n) {
    for (let j = windowStart; j < windowStart + step; j++) {
      const word = stemmed[j];
      const next = (frequencies.get(word) || 0) - 1;

      if (next <= 0) {
        frequencies.delete(word);
        unique--;
      } else {
        frequencies.set(word, next);
      }
    }

    const nextStart = windowStart + step;

    for (let j = windowStart + safeWindow; j < nextStart + safeWindow; j++) {
      const word = stemmed[j];
      const next = (frequencies.get(word) || 0) + 1;
      frequencies.set(word, next);
      if (next === 1) unique++;
    }

    windowStart = nextStart;
    sum += unique / safeWindow;
    count++;
  }

  return Number((sum / count).toFixed(2));
}

function getOpenerPattern(sentence: string): string {
  const trimmed = sentence.trim().replace(/^[«"(\-—–]+/, '');
  const words = getSentenceWords(trimmed);

  if (words.length === 0) return '';

  const w0 = words[0].toLowerCase();
  const w1 = (words[1] || '').toLowerCase();

  if (/^(в|во|на|при|для|через|после|среди|между|из|от|к|по|о|об)$/.test(w0)) {
    if (/(?:ой|ей|ом|ем|ых|их|ого|его)$/.test(w1)) return `PREP+ADJ(${w0})`;
    return `PREP(${w0})`;
  }

  if (/^(однако|кроме|более|таким|следовательно|тем|причем|причём|впрочем)$/.test(w0)) {
    return `INTRO(${w0})`;
  }

  return `W(${stemRussianWord(w0)})`;
}

/* ------------------------------------------------------------------ */
/* Authorial deviation analysis                                       */
/* ------------------------------------------------------------------ */

// Сигнал считается авторской особенностью не по одному совпадению,
// а по повторяемости, распределению по абзацам и числу примеров.
// Низкая уверенность означает: конструкцию лучше не исправлять автоматически.
export function extractAuthorialDeviationProfile(
  donorText: string
): AuthorialDeviationProfile {
  const paragraphs = donorText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const sentences = paragraphs.flatMap(splitParagraph);
  const totalWords = getSentenceWords(donorText).length;

  const definitions: Array<{
    kind: AuthorialDeviationKind;
    regex: RegExp;
  }> = [
    { kind: 'genitiveChain', regex: GENITIVE_CHAIN_REGEX },
    { kind: 'copula', regex: COPULA_REGEX },
    { kind: 'symmetry', regex: /не только[\s\S]{1,180}?но и/i },
    { kind: 'triad', regex: TRIAD_REGEX },
  ];

  const signals: AuthorialDeviationSignal[] = [];

  for (const definition of definitions) {
    const examples: string[] = [];
    const paragraphIndexes = new Set<number>();
    let count = 0;

    paragraphs.forEach((paragraph, paragraphIndex) => {
      const paragraphSentences = splitParagraph(paragraph);

      for (const sentence of paragraphSentences) {
        definition.regex.lastIndex = 0;

        if (definition.regex.test(sentence)) {
          count++;
          paragraphIndexes.add(paragraphIndex);

          if (examples.length < 4) {
            examples.push(sentence.trim());
          }
        }
      }
    });

    if (count === 0) continue;

    const per300Words = Number(((count / Math.max(1, totalWords)) * 300).toFixed(2));
    const paragraphSpread =
      paragraphs.length > 0
        ? Number((paragraphIndexes.size / paragraphs.length).toFixed(2))
        : 0;

    const repetitionFactor = Math.min(1, count / 3);
    const spreadFactor = Math.min(1, paragraphSpread / 0.5);
    const confidence = Number(
      Math.min(0.98, 0.2 + repetitionFactor * 0.45 + spreadFactor * 0.33).toFixed(2)
    );

    signals.push({
      kind: definition.kind,
      count,
      per300Words,
      paragraphSpread,
      confidence,
      examples,
    });
  }

  // Короткие самостоятельные фразы: фиксируем только повторяющийся приём,
  // а не единичную точку или случайный обрыв.
  const shortFragments = sentences.filter((sentence) => {
    const words = getSentenceWords(sentence);
    return words.length >= 1 && words.length <= 5;
  });

  if (shortFragments.length >= 2) {
    const examples = shortFragments.slice(0, 4);
    const per300Words = Number(
      ((shortFragments.length / Math.max(1, totalWords)) * 300).toFixed(2)
    );

    signals.push({
      kind: 'shortFragment',
      count: shortFragments.length,
      per300Words,
      paragraphSpread: 0,
      confidence: Number(Math.min(0.9, 0.25 + shortFragments.length * 0.12).toFixed(2)),
      examples,
    });
  }

  // Повторяющиеся необычные зачины: учитываем только одинаковые каркасы,
  // встречающиеся неоднократно, а не обычные союзы и предлоги.
  const openerCounts = new Map<string, { count: number; examples: string[] }>();

  for (const sentence of sentences) {
    const pattern = getOpenerPattern(sentence);

    if (!pattern || pattern.startsWith('PREP(') || pattern.startsWith('PREP+ADJ(')) {
      continue;
    }

    const current = openerCounts.get(pattern) || { count: 0, examples: [] };
    current.count++;

    if (current.examples.length < 3) {
      current.examples.push(sentence);
    }

    openerCounts.set(pattern, current);
  }

  const repeatedOpeners = Array.from(openerCounts.values())
    .filter((item) => item.count >= 3)
    .sort((a, b) => b.count - a.count);

  if (repeatedOpeners.length > 0) {
    const count = repeatedOpeners.reduce((sum, item) => sum + item.count, 0);
    const examples = repeatedOpeners.flatMap((item) => item.examples).slice(0, 4);

    signals.push({
      kind: 'unusualOpening',
      count,
      per300Words: Number(((count / Math.max(1, totalWords)) * 300).toFixed(2)),
      paragraphSpread: 0,
      confidence: Number(Math.min(0.9, 0.3 + count * 0.08).toFixed(2)),
      examples,
    });
  }

  const highConfidenceSignals = signals.filter((signal) => signal.confidence >= 0.72).length;
  const protectionLevel: AuthorialDeviationProfile['protectionLevel'] =
    highConfidenceSignals >= 3
      ? 'high'
      : highConfidenceSignals >= 1 || signals.length >= 3
        ? 'medium'
        : 'low';

  return {
    totalWords,
    analyzedParagraphs: paragraphs.length,
    signals,
    protectionLevel,
  };
}
/* ------------------------------------------------------------------ */
/* Smart Fact Extraction & Stem-Aware Verification                    */
/* ------------------------------------------------------------------ */

const NEGATION_CUES_REGEX = /(^|[^а-яё])(не|нет|ни|нельзя|никогда|никуда|ничуть|никак|отнюдь|вопреки|несмотря на|лишь|только)(?![а-яё])/gi;
const MODAL_CUES_LIST = [
  'возможно', 'вероятно', 'может', 'должен', 'должна', 'должно', 'должны',
  'необходимо', 'следует', 'всегда', 'редко', 'иногда', 'запрещено', 'нельзя', 'допустимо',
];

const ABSTRACT_NOMINAL_REGEX = /^[а-яё]{5,}(?:ение|ание|ость|еств|ство|ция|ции|изм|изма|ика|ения|ания|ости|ством|цией|ений|аний)$/i;
const PARTICIPLE_CLAUSE_REGEX = /,\s*[а-яё]{4,}(?:ющ|ящ|ущ|ащ|вш|ш|енн|анн|нн|ем|им)[а-яё]{1,4}(?:\s|,|$)|,\s*[а-яё]{4,}(?:я|а|в|вши|вшись)(?=\s+[а-яё])/gi;
const MODAL_PARTICLE_REGEX = /(^|[^а-яё])(ведь|же|ли|бы|уж|разве|неужели|будто|словно|вряд ли|едва ли|разве что|мол|дескать|пожалуй|чай)(?![а-яё])/gi;
const PERSON_PRONOUN_REGEX = /(^|[^а-яё])(я|мы|нам|нас|наш|наша|наше|наши|мне|мной|вы|вам|вас|ты|тебе)(?![а-яё])/gi;

function computeMorphosyntaxStats(text: string, sentences: string[], words: string[]) {
  const safeWords = Math.max(1, words.length);
  const safeSents = Math.max(1, sentences.length);
  const charLenK = Math.max(0.5, text.length / 1000);

  let nominals = 0;
  for (const w of words) {
    if (ABSTRACT_NOMINAL_REGEX.test(w)) nominals++;
  }
  const nominalizationPer100 = Number(((nominals / safeWords) * 100).toFixed(1));

  let participleHits = 0;
  for (const s of sentences) {
    const m = s.match(PARTICIPLE_CLAUSE_REGEX);
    if (m) participleHits += m.length;
  }
  const participleClausePerSent = Number((participleHits / safeSents).toFixed(2));

  const modalMatches = text.match(MODAL_PARTICLE_REGEX) || [];
  const modalParticlePer1k = Number((modalMatches.length / charLenK).toFixed(1));

  const personMatches = text.match(PERSON_PRONOUN_REGEX) || [];
  const firstSecondPersonPer1k = Number((personMatches.length / charLenK).toFixed(1));

  return {
    nominalizationPer100,
    participleClausePerSent,
    modalParticlePer1k,
    firstSecondPersonPer1k,
  };
}

export function extractFactInventory(sourceText: string): FactInventory {
  const numbersAndDates = Array.from(
    new Set(
      (sourceText.match(/\b\d[\d.,–-]*\d\b|\b\d+\b|\b[IVXLCDM]{2,6}\b/g) ?? []).filter(
        (n) => n.length >= 1 && !/^(II|III)$/.test(n)
      )
    )
  );

  const sentences = splitSentences(sourceText);
  const properSet = new Set<string>();

  for (const s of sentences) {
    const tokens = s.match(/[А-ЯЁA-Z][а-яёa-zА-ЯЁA-Z-]{2,}/g) ?? [];

    tokens.forEach((tok, idx) => {
      const lower = tok.toLowerCase();

      if (idx === 0 && (SENTENCE_START_STOPWORDS.has(lower) || RUSSIAN_FUNCTION_WORDS.has(lower))) {
        return;
      }

      if (idx > 0 || tok.length >= 5) {
        if (!SENTENCE_START_STOPWORDS.has(lower)) {
          properSet.add(tok);
        }
      }
    });
  }

  const wordFreq = new Map<string, { raw: string; count: number }>();
  const allWords = (sourceText.toLowerCase().match(/[а-яё]{7,}/g) ?? []).filter(
    (w) => !RUSSIAN_FUNCTION_WORDS.has(w) && !SENTENCE_START_STOPWORDS.has(w)
  );

  for (const w of allWords) {
    const st = stemRussianWord(w);
    if (st.length < 5) continue;

    const prev = wordFreq.get(st);
    wordFreq.set(st, { raw: prev ? prev.raw : w, count: (prev?.count || 0) + 1 });
  }

  const domainTerms = Array.from(wordFreq.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 14)
    .map((x) => x.raw);

  const negationCount = (sourceText.match(NEGATION_CUES_REGEX) || []).length;
  const lowerSrc = sourceText.toLowerCase();
  const modalCues = MODAL_CUES_LIST.filter((m) =>
    new RegExp(`(^|[^а-яё])${m}(?![а-яё])`, 'i').test(lowerSrc)
  );

  return {
    numbersAndDates,
    properNames: Array.from(properSet),
    domainTerms,
    negationCount,
    modalCues,
  };
}

export function extractDonorForbiddenTerms(donorText: string, contentText: string): string[] {
  if (!donorText.trim() || !contentText.trim()) return [];
  const donorInv = extractFactInventory(donorText);
  const contentLower = contentText.toLowerCase().replace(/ё/g, 'е');
  const contentStems = new Set(
    (contentLower.match(/[а-яёa-z0-9-]+/gi) ?? []).map(stemRussianWord)
  );

  const forbidden: string[] = [];
  const seenNorm = new Set<string>();
  const candidates = [...donorInv.properNames, ...donorInv.domainTerms];
  for (const term of candidates) {
    const norm = term.toLowerCase().replace(/ё/g, 'е');
    const st = stemRussianWord(term);
    if (
      norm.length >= 4 &&
      !seenNorm.has(norm) &&
      !contentLower.includes(norm) &&
      !contentStems.has(st)
    ) {
      seenNorm.add(norm);
      forbidden.push(term);
    }
  }
  return forbidden.slice(0, 24);
}

export function verifyFactsPreserved(
  sourceText: string,
  outputText: string,
  donorProfile?: DonorDNAProfile
): FactVerificationReport {
  if (!sourceText.trim()) {
    return { preservedPct: 100, lostCritical: [], lostTerms: [], negationDelta: 0, lostModals: [], donorLeakTerms: [] };
  }

  const inv = extractFactInventory(sourceText);
  const outLower = outputText.toLowerCase().replace(/ё/g, 'е');
  const outputTokens = outLower.match(/[а-яёa-z0-9-]+/gi) ?? [];
  const outStems = new Set(outputTokens.map(stemRussianWord));

  const lostCritical: string[] = [];

  for (const num of inv.numbersAndDates) {
    if (!outputText.includes(num)) {
      lostCritical.push(num);
    }
  }

  for (const name of inv.properNames) {
    const st = stemRussianWord(name);
    const normalizedName = name.toLowerCase().replace(/ё/g, 'е');
    const matched = outLower.includes(normalizedName) || outStems.has(st);

    if (!matched) {
      lostCritical.push(name);
    }
  }

  const lostTerms: string[] = [];

  for (const term of inv.domainTerms) {
    const st = stemRussianWord(term);
    const matched = outStems.has(st);

    if (!matched) {
      lostTerms.push(term);
    }
  }

  const outNegations = (outputText.match(NEGATION_CUES_REGEX) || []).length;
  const negationDelta = inv.negationCount - outNegations;
  const lostModals = inv.modalCues.filter(
    (m) => !new RegExp(`(^|[^а-яё])${m}(?![а-яё])`, 'i').test(outLower)
  );

  // Check if donor-specific topic terms leaked into output (case-insensitive dedup)
  const donorLeakTerms: string[] = [];
  const seenLeakNorm = new Set<string>();
  if (donorProfile && donorProfile.donorTopicTerms.length > 0) {
    const sourceLower = sourceText.toLowerCase().replace(/ё/g, 'е');
    const sourceStems = new Set((sourceLower.match(/[а-яёa-z0-9-]+/gi) ?? []).map(stemRussianWord));
    for (const dTerm of donorProfile.donorTopicTerms) {
      const dNorm = dTerm.toLowerCase().replace(/ё/g, 'е');
      if (seenLeakNorm.has(dNorm)) continue;
      const dStem = stemRussianWord(dTerm);
      if (sourceLower.includes(dNorm) || sourceStems.has(dStem)) continue;
      if (outLower.includes(dNorm) || (dStem.length >= 5 && outStems.has(dStem))) {
        seenLeakNorm.add(dNorm);
        donorLeakTerms.push(dTerm);
      }
    }
  }

  const totalChecked = Math.max(
    1,
    inv.numbersAndDates.length + inv.properNames.length + inv.domainTerms.length
  );

  const lostWeighted = lostCritical.length + lostTerms.length * 0.5;
  const preservedPct = Math.max(
    0,
    Math.min(100, Math.round(((totalChecked - lostWeighted) / totalChecked) * 100))
  );

  return {
    preservedPct,
    lostCritical: Array.from(new Set(lostCritical)),
    lostTerms: Array.from(new Set(lostTerms)),
    negationDelta,
    lostModals,
    donorLeakTerms,
  };
}

/* ------------------------------------------------------------------ */
/* Donor DNA Profile v2                                               */
/* ------------------------------------------------------------------ */

function computeLengthHistogram(lengths: number[]): [number, number, number, number, number] {
  const bins: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  const n = Math.max(1, lengths.length);
  for (const l of lengths) {
    if (l <= 5) bins[0]++;
    else if (l <= 10) bins[1]++;
    else if (l <= 16) bins[2]++;
    else if (l <= 24) bins[3]++;
    else bins[4]++;
  }
  return [
    Math.round((bins[0] / n) * 100),
    Math.round((bins[1] / n) * 100),
    Math.round((bins[2] / n) * 100),
    Math.round((bins[3] / n) * 100),
    Math.round((bins[4] / n) * 100),
  ];
}

function mineOpenersAndConnectors(sentences: string[]): {
  autoMinedOpeners: string[];
  autoMinedConnectors: string[];
} {
  const openerFreq = new Map<string, number>();
  const connFreq = new Map<string, number>();

  for (const s of sentences) {
    const words = getSentenceWords(s).map((w) => w.toLowerCase());
    if (words.length >= 2) {
      const bi = `${words[0]} ${words[1]}`;
      if (words[0].length >= 2 && !/^\d+$/.test(words[0])) {
        openerFreq.set(bi, (openerFreq.get(bi) || 0) + 1);
      }
    }
    // Extract intra-sentence connectors following punctuation (, / — / ;)
    const midMatches = s.match(/(?:,|—|;)\s+([а-яё]{2,12}(?:\s+[а-яё]{2,10})?)/gi) || [];
    for (const rawM of midMatches) {
      const clean = rawM.replace(/^[,—;\s]+/, '').toLowerCase();
      if (clean.length >= 3 && !RUSSIAN_FUNCTION_WORDS.has(clean)) {
        connFreq.set(clean, (connFreq.get(clean) || 0) + 1);
      }
    }
  }

  const autoMinedOpeners = Array.from(openerFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k]) => k);

  const autoMinedConnectors = Array.from(connFreq.entries())
    .filter(([, count]) => count >= 2 || sentences.length <= 8)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k]) => k);

  return { autoMinedOpeners, autoMinedConnectors };
}

export function extractDonorDNAProfile(donorText: string): DonorDNAProfile {
  const paragraphs = donorText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const paragraphSentences = paragraphs.map(splitParagraph);
  const paraSentenceCounts = paragraphSentences.map((items) => items.length).filter((n) => n > 0);
  const safeParaCounts = paraSentenceCounts.length > 0 ? paraSentenceCounts : [4];

  const avgSentPerPara = Number(
    (safeParaCounts.reduce((a, b) => a + b, 0) / safeParaCounts.length).toFixed(1)
  );

  const minSentPerPara = Math.min(...safeParaCounts);
  const maxSentPerPara = Math.max(...safeParaCounts);

  const sentences = paragraphSentences.flat();
  const sentenceWordLists = sentences.map(getSentenceWords);
  const lengths = sentenceWordLists.map((items) => items.length).filter((n) => n > 0);
  const safeLengths = lengths.length > 0 ? lengths : [12];
  const sorted = [...safeLengths].sort((a, b) => a - b);

  const totalWords = safeLengths.reduce((a, b) => a + b, 0) || 1;
  const avgLen = Number((totalWords / safeLengths.length).toFixed(1));
  const minLen = sorted[0];
  const maxLen = sorted[sorted.length - 1];
  const medianLen = sorted[Math.floor(sorted.length / 2)];

  const variance =
    safeLengths.reduce((sum, len) => sum + Math.pow(len - avgLen, 2), 0) / safeLengths.length;

  const stdDev = Number(Math.sqrt(variance).toFixed(1));
  const burstiness = avgLen > 0 ? Number((stdDev / avgLen).toFixed(2)) : 0.5;

  const shortCount = safeLengths.filter((n) => n <= 8).length;
  const longCount = safeLengths.filter((n) => n >= 22).length;

  const shortRatioPct = Math.round((shortCount / safeLengths.length) * 100);
  const longRatioPct = Math.round((longCount / safeLengths.length) * 100);

  const lengthHistogramPct = computeLengthHistogram(safeLengths);
  let deltaSum = 0;
  for (let i = 0; i < safeLengths.length - 1; i++) {
    deltaSum += Math.abs(safeLengths[i + 1] - safeLengths[i]);
  }
  const cadenceDeltaMean =
    safeLengths.length > 1 ? Number((deltaSum / (safeLengths.length - 1)).toFixed(1)) : 6.0;

  const allWords = donorText.toLowerCase().match(/[а-яёa-z0-9-]+/gi) || [];
  const ttr = movingTTR(allWords);

  const avgWordLenChars =
    allWords.length > 0
      ? Number((allWords.reduce((sum, w) => sum + w.length, 0) / allWords.length).toFixed(1))
      : 6.2;

  const morpho = computeMorphosyntaxStats(donorText, sentences, allWords);

  const charLenK = Math.max(0.5, donorText.length / 1000);
  const emDashes = (donorText.match(/—/g) || []).length;
  const enDashes = (donorText.match(/–/g) || []).length;

  const dashStyle: '—' | '–' = enDashes > emDashes ? '–' : '—';
  const dashesPer1k = Number(((emDashes + enDashes) / charLenK).toFixed(1));
  const colonsPer1k = Number(((donorText.match(/:/g) || []).length / charLenK).toFixed(1));
  const semicolonsPer1k = Number(((donorText.match(/;/g) || []).length / charLenK).toFixed(1));
  const parensPer1k = Number(((donorText.match(/\(/g) || []).length / charLenK).toFixed(1));
  const questionsCount = (donorText.match(/\?/g) || []).length;

  const usesGuillemets =
    (donorText.match(/[«»]/g) || []).length >= (donorText.match(/"/g) || []).length;

  const copulaHits = sentences.filter((s) => COPULA_REGEX.test(s)).length;
  const copulaPer1k = Number((copulaHits / charLenK).toFixed(1));

  const conjStarts = sentences.filter((s) =>
    /^(?:Однако|Но|Ибо|Ведь|Впрочем|Причем|Причём|Кроме того|Тем не менее|Для|Между тем)\b/i.test(
      s.trim()
    )
  ).length;

  const conjunctionStartsPct =
    sentences.length > 0 ? Math.round((conjStarts / sentences.length) * 100) : 0;

  const genitiveHits = sentences.filter((s) => GENITIVE_CHAIN_REGEX.test(s)).length;
  const genitiveChainRate =
    sentences.length > 0 ? Math.round((genitiveHits / sentences.length) * 100) : 0;

  const lower = donorText.toLowerCase();

  const favoriteMarkers = AUTHOR_DISCOURSE_MARKERS.filter((m) => {
    const regex = new RegExp(`(^|[\\s,;(])${m}($|[\\s,;:.!?])`, 'i');
    return regex.test(lower);
  }).slice(0, 10);

  const { autoMinedOpeners, autoMinedConnectors } = mineOpenersAndConnectors(sentences);

  // Determine paragraph closing style across donor paragraphs
  const closings = paragraphSentences
    .map((ps) => ps[ps.length - 1])
    .filter(Boolean);
  const questionClosings = closings.filter((c) => c.trim().endsWith('?')).length;
  const shortClosings = closings.filter((c) => getSentenceWords(c).length <= 9).length;
  const longClosings = closings.filter((c) => getSentenceWords(c).length >= 20).length;
  const paragraphClosingStyle: DonorDNAProfile['paragraphClosingStyle'] =
    questionClosings > 0
      ? 'question'
      : shortClosings >= Math.max(1, Math.ceil(closings.length * 0.45))
        ? 'concise'
        : longClosings >= Math.max(1, Math.ceil(closings.length * 0.5))
          ? 'reflective'
          : 'balanced';

  const sampleCadence = safeLengths.slice(0, 16);

  // Up to 9 structurally diverse exemplars evenly sampled across donor text
  const exemplars: string[] = [];
  if (sentences.length > 0) {
    const pickedSet = new Set<string>();
    const byLen = sentences
      .map((s, idx) => ({ s: s.trim(), len: sentenceWordLists[idx].length, idx }))
      .filter((x) => x.len >= 3 && x.len <= 55);

    const addPick = (item: { s: string } | undefined) => {
      if (item && !pickedSet.has(item.s) && exemplars.length < 9) {
        pickedSet.add(item.s);
        exemplars.push(item.s);
      }
    };

    // Short punch, medium textured, long periodic, question/dash/colon picks across beginning/middle/end
    addPick(byLen.find((x) => x.len >= 4 && x.len <= 9));
    addPick(byLen.find((x) => /[—–:]/.test(x.s) && x.len >= 9 && x.len <= 28));
    addPick(byLen.find((x) => x.s.endsWith('?') || x.s.includes(';')));
    addPick(byLen.find((x) => x.len >= 22 && x.len <= 48));

    const step = Math.max(1, Math.floor(byLen.length / 5));
    for (let i = 0; i < byLen.length && exemplars.length < 9; i += step) {
      addPick(byLen[i]);
    }
    for (const item of byLen) {
      if (exemplars.length >= 9) break;
      addPick(item);
    }
  }

  const donorInv = extractFactInventory(donorText);
  const seenDonorNorm = new Set<string>();
  const donorTopicTerms: string[] = [];
  for (const term of [...donorInv.properNames, ...donorInv.domainTerms]) {
    const norm = term.toLowerCase().replace(/ё/g, 'е');
    if (!seenDonorNorm.has(norm)) {
      seenDonorNorm.add(norm);
      donorTopicTerms.push(term);
    }
    if (donorTopicTerms.length >= 24) break;
  }

  const authorialDeviations = extractAuthorialDeviationProfile(donorText);

  return {
    sentenceCount: sentences.length,
    paragraphCount: Math.max(1, paragraphs.length),
    avgSentPerPara,
    minSentPerPara,
    maxSentPerPara,
    minLen,
    medianLen,
    maxLen,
    avgLen,
    stdDev,
    burstiness,
    shortRatioPct,
    longRatioPct,
    ttr,
    avgWordLenChars,
    dashStyle,
    dashesPer1k,
    colonsPer1k,
    semicolonsPer1k,
    parensPer1k,
    questionsCount,
    copulaPer1k,
    conjunctionStartsPct,
    genitiveChainRate,
    favoriteMarkers,
    usesGuillemets,
    sampleCadence,
    exemplars,
    authorialDeviations,
    donorObservedCliches: EXTENDED_AI_CLICHES.filter((phrase) => lower.includes(phrase)),
    lengthHistogramPct,
    cadenceDeltaMean,
    nominalizationPer100: morpho.nominalizationPer100,
    participleClausePerSent: morpho.participleClausePerSent,
    modalParticlePer1k: morpho.modalParticlePer1k,
    firstSecondPersonPer1k: morpho.firstSecondPersonPer1k,
    autoMinedOpeners,
    autoMinedConnectors,
    paragraphClosingStyle,
    donorTopicTerms,
  };
}

export function getGenreArchetypeProfile(genre: 'academic' | 'essay' | 'draft'): DonorDNAProfile {
  const samples: Record<'academic' | 'essay' | 'draft', string> = {
    academic:
      'Точность научного вывода зависит от чистоты исходной посылки. Когда исследователь подменяет наблюдение общими словами, аргумент теряет силу — сколько бы терминов он ни нагромождал. Но стоит отсечь лишнее, и логика проступает чётко: причина, условие, следствие. Здесь не нужны ни пафосные вступления, ни обязательная мораль в конце абзаца. Иногда достаточно одной точной оговорки, чтобы вся схема встала на место.',
    essay:
      'Хорошая речь не боится неровного дыхания. Мы привыкли думать, будто ясность требует гладких переходов — однако на деле именно пауза, резкий поворот или короткое возражение делают мысль живой. Попробуйте перечитать страницу вслух: фальшь слышна сразу. Где автор действительно думал, фраза держится на глаголах и редких, но точных образах. Где торопился прикрыть пустоту — вылезают отглагольные связки.',
    draft:
      'В первом приближении гипотеза кажется очевидной — данные ложатся ровно, выбросов почти нет. Но проверка на граничных случаях сразу вскрывает зазор: модель реагирует не на смысл, а на частоту служебных слов. Придётся пересчитать базовую выборку без сглаживания. Иначе мы примем артефакт фильтра за реальный эффект.',
  };
  return extractDonorDNAProfile(samples[genre]);
}

export function formatDonorProfileBlock(
  profile: DonorDNAProfile,
  blueprint?: DonorStyleBlueprint | null,
  forbiddenDonorTerms?: string[]
): string {
  const targetMinBurst = Math.max(0, Number((profile.burstiness - 0.06).toFixed(2)));
  const targetMaxBurst = Math.min(0.95, Number((profile.burstiness + 0.14).toFixed(2)));

  const lines: string[] = [
    `[ПАСПОРТ СТИЛЕВОЙ ДНК АВТОРА-ДОНОРА — ПРИОРИТЕТ №1]`,
    `• Ритм предложений: длина от ${profile.minLen} до ${profile.maxLen} слов (медиана: ${profile.medianLen} сл., среднее: ${profile.avgLen} сл., средний перепад соседних фраз: ±${profile.cadenceDeltaMean} сл.).`,
    `• Распределение длин у донора [1–5 | 6–10 | 11–16 | 17–24 | 25+ сл.]: [${profile.lengthHistogramPct.join('% | ')}%]. Образец ритма подряд: [${profile.sampleCadence.join(' → ')}].`,
    `• Прерывистость (Burstiness): ориентир ${targetMinBurst}–${targetMaxBurst}; коротких фраз ≤8 слов: ~${profile.shortRatioPct}%, длинных периодов ≥22 слов: ~${profile.longRatioPct}%.`,
    `• Архитектура абзацев: в среднем ${profile.avgSentPerPara} предл./абзац (разброс ${profile.minSentPerPara}–${profile.maxSentPerPara}); тип концовки абзаца у донора: ${profile.paragraphClosingStyle === 'concise' ? 'короткий отточенный финал без лишней воды' : profile.paragraphClosingStyle === 'question' ? 'вопросительный или проблематизирующий сдвиг' : profile.paragraphClosingStyle === 'reflective' ? 'развёрнутое завершение' : 'естественная смысловая точка без шаблонного резюме'}.`,
    `• Морфосинтаксис донора: отглагольные существительные (-ение/-ость/-ция) ~${profile.nominalizationPer100}/100 сл., обособленные причастия/деепричастия ~${profile.participleClausePerSent} на фразу, модальные частицы (ведь/же/ли/бы/вряд ли) ~${profile.modalParticlePer1k}/1k, личные местоимения (я/мы/вы) ~${profile.firstSecondPersonPer1k}/1k.`,
    `• Пунктуация на 1000 знаков: тире «${profile.dashStyle}» ~${profile.dashesPer1k}, двоеточия ~${profile.colonsPer1k}, точка с запятой ~${profile.semicolonsPer1k}, скобки ~${profile.parensPer1k}, кавычки ${profile.usesGuillemets ? '«ёлочки»' : '"лапки"'}.`,
    `• Лексика и грамматика: MATTR ~${profile.ttr}, средняя длина слова ~${profile.avgWordLenChars} симв. Зачины с союзами/связками: ~${profile.conjunctionStartsPct}% предложений.`,
    profile.copulaPer1k < 0.3
      ? `• Связка «является/представляет собой»: донор использует её редко (${profile.copulaPer1k}/1k). Предпочитай живые глаголы или тире.`
      : `• Связка «является»: встречается у донора (~${profile.copulaPer1k}/1k). Сохраняй естественный баланс.`,
    profile.favoriteMarkers.length > 0 || profile.autoMinedConnectors.length > 0
      ? `• Живые маркеры и связки донора: ${Array.from(new Set([...profile.favoriteMarkers, ...profile.autoMinedConnectors])).slice(0, 10).join(', ')}. Вплетай только туда, где просит смысл.`
      : `• Не навязывай вводные слова и связки: переходы должны вытекать из смысла.`,
    profile.autoMinedOpeners.length > 0
      ? `• Привычные биграммы зачина у донора: ${profile.autoMinedOpeners.slice(0, 5).map((o) => `«${o}...»`).join(', ')} — ориентируйся на интонацию, не на дословную копирку.`
      : '',
  ].filter(Boolean);

  if (forbiddenDonorTerms && forbiddenDonorTerms.length > 0) {
    lines.push(
      `• АНТИ-УТЕЧКА ТЕМЫ ДОНОРА: категорически ЗАПРЕЩЕНО переносить в итог предметные слова и имена из Текста 1: [${forbiddenDonorTerms.slice(0, 16).join(', ')}].`
    );
  }

  const deviations = profile.authorialDeviations;

  if (deviations && deviations.signals.length > 0) {
    lines.push('');
    lines.push('[ЗАЩИТА УСТОЙЧИВЫХ АВТОРСКИХ ОСОБЕННОСТЕЙ]');
    lines.push(
      `• Уровень защиты: ${deviations.protectionLevel}. Анализ образца обнаружил повторяющиеся конструкции, которые могут быть частью индивидуального почерка.`
    );

    for (const signal of deviations.signals) {
      const label: Record<AuthorialDeviationKind, string> = {
        genitiveChain: 'цепочки родительных падежей',
        copula: 'связки «является/представляет собой»',
        symmetry: 'конструкции «не только..., но и...»',
        triad: 'перечисления из трёх элементов',
        repetition: 'лексические повторы',
        shortFragment: 'короткие самостоятельные фразы',
        unusualOpening: 'повторяющиеся синтаксические зачины',
      };

      lines.push(
        `• ${label[signal.kind]}: ${signal.count} случаев; ~${signal.per300Words} на 300 слов; уверенность сигнала ${signal.confidence}.`
      );

      if (signal.examples.length > 0) {
        lines.push(`  Примеры из донора: ${signal.examples.slice(0, 2).map((x) => `«${x}»`).join(' | ')}`);
      }
    }

    lines.push(
      '• ВАЖНО: не считай перечисленные особенности автоматическими дефектами. Если аналогичная конструкция подходит по смыслу, не исправляй её ради формальной «гладкости».'
    );
  } else {
    lines.push('');
    lines.push(
      '[ЗАЩИТА АВТОРСКОЙ МАНЕРЫ] В образце недостаточно повторяющихся сигналов для вывода об устойчивых отклонениях. Не объявляй живую особенность речи ошибкой.'
    );
  }

  if (blueprint) {
    lines.push('');
    lines.push(`[КАЧЕСТВЕННЫЙ СТИЛЕВОЙ ЧЕРТЁЖ ДОНОРА (ИЗВЛЕЧЁН ИЗ ТЕКСТА 1)]`);
    lines.push(`• Позиция автора и залог: ${blueprint.voiceAndPerson}`);
    lines.push(`• Лексический регистр и эпоха речи: ${blueprint.lexicalRegister}`);
    lines.push(`• Способ переходов между мыслями: ${blueprint.transitionStyle}`);
    lines.push(`• Привычки синтаксиса донора: ${blueprint.syntaxHabits.join(' | ')}`);

    if (blueprint.structuralTemplates.length > 0) {
      lines.push(
        `• Структурные обороты-скелеты (копируй форму, не тему): ${blueprint.structuralTemplates.join(' | ')}`
      );
    }

    if (blueprint.avoidFeatures.length > 0) {
      lines.push(`• Чего этот автор обычно избегает: ${blueprint.avoidFeatures.join(' | ')}`);
    }
  }

  return lines.join('\n');
}

export function buildFewShotContrastBlock(donorProfile?: DonorDNAProfile): string {
  if (donorProfile && donorProfile.exemplars.length >= 2) {
    return `[ЖИВЫЕ ЭТАЛОНЫ СИНТАКСИСА ИМЕННО ЭТОГО ДОНОРА (${donorProfile.exemplars.length} примеров)]
ВНИМАНИЕ: Копируй ТОЛЬКО интонацию, порядок слов, живую инверсию, парцелляцию, расстановку тире/двоеточий и способ перехода мыслей. НИ ОДНОГО факта, имени или темы донора не переноси в результат!
${donorProfile.exemplars.map((ex, i) => `${i + 1}) «${ex}»`).join('\n')}

❌ АНТИ-ПРИМЕР (типичный стерильный ИИ-текст, который палят GECScore, SlopTotal и BiScope):
«В рамках данного подхода следует отметить, что концепция играет ключевую роль в формировании целостной системы, что, в свою очередь, способствует гармоничному развитию личности и открывает путь к новым возможностям.»`;
  }

  return `[ЭТАЛОН ЕСТЕСТВЕННОЙ РЕЧИ: КОНТРАСТ]
❌ ШТАМПОВАННЫЙ ОБРАЗЕЦ: «В рамках современной парадигмы следует отметить, что концепция играет ключевую роль в становлении личности».
✅ ЖИВОЙ РИТМ: «Умственная дисциплина не даётся даром. Нужна редкая собранность — когда человек держит под контролем каждый свой шаг и не позволяет мысли расплыться. Без этого всё рассыпается в прах.»

Не копируй длину, дробность или синтаксическую форму этого примера механически: ориентируйся прежде всего на фактический профиль донора.`;
}
/* ------------------------------------------------------------------ */
/* Conflict-Free Prompt Builder                                       */
/* ------------------------------------------------------------------ */

export function buildEnginePromptSections(options: {
  flags?: EngineFlags;
  shields?: DetectorShields;
  enable20CycleCheck?: boolean;
  donorProfile?: DonorDNAProfile;
  styleBlueprint?: DonorStyleBlueprint | null;
  forbiddenDonorTerms?: string[];
  styleIntensity?: number;
  promptStrategy?: string;
  mode: 'style-dna' | 'humanizer';
}): string[] {
  const {
    flags = {},
    shields = {},
    enable20CycleCheck = false,
    donorProfile,
    styleBlueprint = null,
    forbiddenDonorTerms = [],
    styleIntensity = 9,
    promptStrategy = '',
    mode,
  } = options;

  const sections: string[] = [];

  if (mode === 'style-dna') {
    sections.push(
      `РОЛЬ: МАСТЕР СТИЛИСТИЧЕСКОЙ РЕКОНСТРУКЦИИ. Твоя задача — написать материал Текста 2 голосом, синтаксисом и ритмом автора Текста 1.`
    );

    sections.push(`[ПРАВИЛА ПЕРЕНОСА]
1. ИСТОЧНИК СМЫСЛА (ЧТО): факты, имена, даты, числа, термины, отрицания и модальность (может/должен/редко/нельзя) берутся ТОЛЬКО из Текста 2.
2. ИСТОЧНИК ФОРМЫ (КАК): ориентируйся на синтаксис, порядок слов, живые глаголы, парцелляцию, ритм фраз и пунктуацию Текста 1.
3. ГРАНИЦЫ СОДЕРЖАНИЯ: не переноси в результат факты, персонажей, цитаты или предметные слова Текста 1.
4. АНТИ-СТЕРИЛЬНОСТЬ: не пиши слишком «глянцево» и академически гладко — воспроизводи естественную шероховатость, инверсии и живые оговорки, свойственные донору (это защищает от GECScore и ReMoDetect).
5. СОХРАНЕНИЕ ПОЧЕРКА: не вычищай намеренные повторы, тяжеловесные периоды или короткие фразы донора, если они уместны в новом содержании.`);
  } else {
    sections.push(
      `РОЛЬ: НАУЧНЫЙ РЕДАКТОР И СТИЛИСТ. Твоя задача — сделать изложение живым, естественным, точным по фактам и избавить его от отглагольной и шаблонной ИИ-гладкости.`
    );

    sections.push(`[ЗАДАЧА]
- Перепиши исходный текст с интенсивностью стилистической переработки ${styleIntensity}/10.
- Сохрани 100% фактов, цифр, имён, отрицаний («не», «без», «никогда»), цитат и терминологии.
- Заменяй мёртвые связки с отглагольными существительными («осуществляет формирование», «является фактором») на живые личные глаголы и естественный порядок слов.
- Избегай шаблонных финалов абзацев без реальной новой мысли.
- Сохраняй авторские особенности синтаксиса и пунктуации.
${promptStrategy ? `- Особые указания: ${promptStrategy}` : ''}`);
  }

  if (donorProfile) {
    sections.push(formatDonorProfileBlock(donorProfile, styleBlueprint, forbiddenDonorTerms));
  }

  const ruleList: string[] = [];

  if (flags.basic) {
    ruleList.push(
      `ИЗБЕГАНИЕ МАШИННЫХ ШТАМПОВ: не используй без необходимости обороты «в рамках», «следует отметить», «необходимо подчеркнуть», «играет ключевую роль», «является неотъемлемой частью», «зачастую порождает», «возводится в ранг», «краеугольный камень», «гобелен», «многогранный», «свидетельствует о том». Если подобный оборот необходим по смыслу или является цитатой, не искажай содержание ради его удаления.`
    );
  }

  if (flags.ultra) {
    if (donorProfile) {
      ruleList.push(
        `РИТМ ПО ДОНОРУ: учитывай фактическое чередование коротких и длинных предложений. Не создавай искусственно одинаковые фразы подряд, но и не добавляй короткие обрывки только ради повышения прерывистости. Ориентируйся на статистику донора (${donorProfile.shortRatioPct}% коротких фраз, ${donorProfile.longRatioPct}% длинных; Burstiness ${donorProfile.burstiness}).`
      );
    } else {
      ruleList.push(
        `ЕСТЕСТВЕННЫЙ РИТМ: избегай монотонной последовательности предложений одинаковой длины. Используй короткие и развёрнутые фразы по смысловой необходимости, не создавая искусственных обрывков.`
      );
    }
  }

  if (flags.targeted6) {
    ruleList.push(
      `ЖИВОЙ СИНТАКСИС: избегай канцелярского злоупотребления связками «является/представляет собой». Не запрещай их полностью. Конструкции «не только..., но и...» и перечисления из трёх элементов допустимы, если они точны, естественны или характерны для донора.`
    );
  }

  if (flags.dadaNanjesha) {
    ruleList.push(
      `СИНТАКСИЧЕСКАЯ ПЕРЕСТРОЙКА: не сохраняй механически порядок слов исходника. Используй инверсию, обстоятельства в начале фразы и глагольные конструкции там, где они естественны. Не устраняй все цепочки родительных падежей без разбора: некоторые из них нормативны, точны или принадлежат авторскому почерку.`
    );
  }

  if (flags.turnitout || flags.perplexityTopics) {
    ruleList.push(
      `ЛЕКСИЧЕСКАЯ ТОЧНОСТЬ: избегай случайных повторов, возникших из-за бедного словаря, но сохраняй намеренные лексические повторы, если они усиливают мысль, связывают абзац или характерны для донора. Не заменяй точный термин неточным синонимом.`
    );
  }

  if (flags.lynote || flags.blader) {
    ruleList.push(
      `ЕСТЕСТВЕННОЕ ЗАВЕРШЕНИЕ: избегай шаблонных энциклопедических вступлений и искусственных итогов абзацев. Не обрывай логически завершённую мысль только ради резкого финала.`
    );
  }

  const activeShieldNames = Object.entries(shields)
    .filter(([, on]) => !!on)
    .map(([k]) => k);

  if (activeShieldNames.length > 0) {
    ruleList.push(
      `ПРИОРИТЕТ КАЧЕСТВА ТЕКСТА: при любых дополнительных проверках не жертвуй точностью фактов, естественностью речи и стилевой верностью. Не изменяй текст ради искусственного увеличения статистических показателей. Активные настройки проверки: ${activeShieldNames.join(', ')}.`
    );
  }

  if (enable20CycleCheck) {
    ruleList.push(
      `САМОКОНТРОЛЬ ПЕРЕД ВЫДАЧЕЙ:
1. Проверь сохранность фактов, имён, дат и терминов Текста 2.
2. Найди явные машинные штампы и исправь их, если это не цитаты и не точные термины.
3. Сопоставь ритм и синтаксис с донором.
4. Проверь, не были ли ошибочно устранены намеренные авторские повторы, необычные конструкции или устойчивые грамматические особенности.
5. Не вводи новые конструкции только ради выполнения формальных показателей.`);
  }

  if (ruleList.length > 0) {
    sections.push(
      `[РЕГЛАМЕНТ ИСПОЛНЕНИЯ]\n${ruleList.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
    );
  }

  sections.push(buildFewShotContrastBlock(donorProfile));

  return sections;
}

/* ------------------------------------------------------------------ */
/* Stage Prompts & JSON Schemas                                       */
/* ------------------------------------------------------------------ */

export const BLUEPRINT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    authorialAnomalies: {
      type: Type.ARRAY,
      description: 'Реестр наблюдаемых авторских отклонений и ошибок донора. Это не список того, что надо исправить.',
      items: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING, description: 'Тип: орфография, грамматика, пунктуация, повтор, синтаксис, оформление или иное.' },
          observedForms: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Точные примеры из донора без исправления.' },
          count: { type: Type.INTEGER, description: 'Число подтверждённых случаев в доноре.' },
          per300Words: { type: Type.NUMBER, description: 'Частота на 300 слов.' },
          confidence: { type: Type.NUMBER, description: 'Уверенность, что это реальная особенность образца, 0..1.' },
          transferRule: { type: Type.STRING, description: 'Как воспроизводить особенность пропорционально, не меняя смысл целевого текста.' },
        },
        required: ['category', 'observedForms', 'count', 'per300Words', 'confidence', 'transferRule'],
      },
    },
    voiceAndPerson: {
      type: Type.STRING,
      description: 'От какого лица ведется речь, позиция автора, соотношение актива и пассива.',
    },
    lexicalRegister: {
      type: Type.STRING,
      description: 'Стилевой и исторический слой лексики: книжная, церковно-славянская, строгая академическая, разговорная и т.д.',
    },
    syntaxHabits: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '3–5 конкретных синтаксических приемов именно этого автора.',
    },
    transitionStyle: {
      type: Type.STRING,
      description: 'Как именно автор соединяет предложения и переходит к новым тезисам.',
    },
    rhythmNotes: {
      type: Type.STRING,
      description: 'Характерный темпоритм и строение абзацев донора.',
    },
    avoidFeatures: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Обороты и манеры, чуждые этому автору.',
    },
    structuralTemplates: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '3–4 абстрактных синтаксических каркаса донора без привязки к его теме.',
    },
  },
  required: [
    'authorialAnomalies',
    'voiceAndPerson',
    'lexicalRegister',
    'syntaxHabits',
    'transitionStyle',
    'rhythmNotes',
    'avoidFeatures',
    'structuralTemplates',
  ],
};

export function buildDonorBlueprintPrompt(
  donorText: string
): { systemInstruction: string; contents: string } {
  return {
    systemInstruction:
      'Ты — профессор-стилист и лингвист-текстолог. Извлеки полный структурный чертёж манеры письма. ОБЯЗАТЕЛЬНО отдельно зафиксируй authorialAnomalies: реальные наблюдаемые орфографические, грамматические, пунктуационные, синтаксические отклонения, нестандартные повторы и особенности оформления. Не исправляй примеры и не подменяй их нормативными вариантами. Для каждого укажи точные формы, число случаев, частоту на 300 слов, уверенность и правило пропорционального переноса. Различай повторяющуюся особенность и единичную вероятную опечатку; единичный случай тоже зафиксируй, но не объявляй устойчивым почерком без оснований. Не переноси тему и факты донора.',
    contents: `ТЕКСТ-ДОНОР:\n${donorText}\n\nИзвлеки точный стилевой чертёж автора в формате JSON. Поле authorialAnomalies обязательно: если отклонений не обнаружено, верни пустой массив.`,
  };
}

export const PROPOSITIONS_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    paragraphs: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          theme: { type: Type.STRING, description: 'Краткая суть абзаца.' },
          propositions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Атомарные факты, аргументы, причинно-следственные связи и тезисы в безоценочном виде.',
          },
        },
        required: ['theme', 'propositions'],
      },
    },
    mandatoryEntities: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Все важные имена, даты, числа, термины и ключевые понятия, которые нельзя потерять.',
    },
  },
  required: ['paragraphs', 'mandatoryEntities'],
};

export function buildDeSkeletonPrompt(
  contentText: string
): { systemInstruction: string; contents: string } {
  return {
    systemInstruction: `Ты — экстрактор семантического ядра.
Твоя задача — снять с текста словесную и синтаксическую оболочку, оставив факты, логические связи, понятия, имена и даты по смысловым блокам.
НЕ используй в пропозициях шаблонные обороты («в рамках», «следует отметить», «играет ключевую роль»).
Не удаляй смысловые оттенки, причинно-следственные связи, оговорки и важные различия. Не добавляй сведения, отсутствующие в исходнике.
Пиши кратко, но не превращай сложные тезисы в упрощённые утверждения.`,
    contents: `ИСХОДНЫЙ ТЕКСТ 2:\n${contentText}\n\nИзвлеки фактологическую структуру без потери единого смысла.`,
  };
}

export const SURGICAL_PATCH_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    patches: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          sentenceId: {
            type: Type.INTEGER,
            description: 'Номер предложения [N] из нумерованного черновика.',
          },
          rewritten: {
            type: Type.STRING,
            description: 'Переписанное предложение (или два коротких, если нужно разбить) в стиле донора, без [N].',
          },
        },
        required: ['sentenceId', 'rewritten'],
      },
    },
  },
  required: ['patches'],
};

export const CRITIC_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    styleFidelityScore: {
      type: Type.INTEGER,
      description: '0..100: насколько точно выдержан голос и синтаксис Текста 1.',
    },
    humanNaturalnessScore: {
      type: Type.INTEGER,
      description: '0..100: насколько естественно и нешаблонно звучит текст.',
    },
    factCompletenessScore: {
      type: Type.INTEGER,
      description: '0..100: насколько полно передан смысл Текста 2 без примеси Текста 1.',
    },
    passed: {
      type: Type.BOOLEAN,
      description: 'true только если текст достаточно точно передает стиль, факты и естественную речь.',
    },
    actionableDirectives: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Конкретные точечные указания, какие именно фразы не похожи на донора и как их перестроить.',
    },
    suspiciousSentenceIds: {
      type: Type.ARRAY,
      items: { type: Type.INTEGER },
      description: 'Номера [N] самых слабых или искусственных предложений (до 6 шт.).',
    },
  },
  required: [
    'styleFidelityScore',
    'humanNaturalnessScore',
    'factCompletenessScore',
    'passed',
    'actionableDirectives',
    'suspiciousSentenceIds',
  ],
};

/* ------------------------------------------------------------------ */
/* 14-Point Diagnostics & DNA Fidelity Scoring                        */
/* ------------------------------------------------------------------ */

function getAuthorialSignal(
  profile: DonorDNAProfile | undefined,
  kind: AuthorialDeviationKind
): AuthorialDeviationSignal | undefined {
  return profile?.authorialDeviations?.signals.find((signal) => signal.kind === kind);
}

function hasProtectedAuthorialPattern(
  profile: DonorDNAProfile | undefined,
  kind: AuthorialDeviationKind,
  candidateCount: number
): boolean {
  const signal = getAuthorialSignal(profile, kind);

  if (!signal || signal.confidence < 0.55 || candidateCount <= 0) {
    return false;
  }

  // Не требуется точного совпадения количества конструкций.
  // Достаточно того, что конструкция регулярно встречается у донора.
  return signal.count >= 2 || signal.per300Words >= 0.3;
}

export function diagnoseTextDefects(
  text: string,
  donorProfile?: DonorDNAProfile,
  sourceText?: string
): DiagnosticReport {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const sentences = splitSentences(text);
  const lengths = sentences.map((s) => getSentenceWords(s).length);
  const totalWords = lengths.reduce((a, b) => a + b, 0) || 1;
  const avgLen = Number((totalWords / (lengths.length || 1)).toFixed(1));

  const variance =
    lengths.reduce((sum, len) => sum + Math.pow(len - avgLen, 2), 0) /
    (lengths.length || 1);

  const stdDev = Math.sqrt(variance);
  const burstiness = avgLen > 0 ? Number((stdDev / avgLen).toFixed(2)) : 0;

  const shortCount = lengths.filter((n) => n <= 8).length;
  const longCount = lengths.filter((n) => n >= 22).length;

  const shortRatioPct =
    lengths.length > 0 ? Math.round((shortCount / lengths.length) * 100) : 0;

  const longRatioPct =
    lengths.length > 0 ? Math.round((longCount / lengths.length) * 100) : 0;

  const words = text.toLowerCase().match(/[а-яёa-z0-9-]+/gi) || [];
  const ttr = movingTTR(words);
  const morpho = computeMorphosyntaxStats(text, sentences, words);
  const lengthHistogramPct = computeLengthHistogram(lengths);

  const charLenK = Math.max(0.5, text.length / 1000);
  const dashesPer1k = Number(((text.match(/[—–]/g) || []).length / charLenK).toFixed(1));

  const issues: DiagnosticIssue[] = [];
  const lowerFull = text.toLowerCase();
  const donorCliches = new Set(donorProfile?.donorObservedCliches ?? []);
  const foundCliches = EXTENDED_AI_CLICHES.filter(
    (c) => lowerFull.includes(c) && !donorCliches.has(c)
  );

  const copulaSentences: number[] = [];
  let triadCount = 0;
  let genitiveCount = 0;
  let symmetryCount = 0;

  sentences.forEach((s, idx) => {
    const ls = s.toLowerCase();
    const sId = idx + 1;

    // 1. Машинные клише.
    const sCliches = EXTENDED_AI_CLICHES.filter(
      (c) => ls.includes(c) && !donorCliches.has(c)
    );

    if (sCliches.length > 0) {
      issues.push({
        type: 'cliche',
        severity: 'critical',
        sentenceIndexes: [sId],
        message: `Предложение №${sId}: обнаружены возможные машинные штампы (${sCliches.map((c) => `«${c}»`).join(', ')}). Проверь, не является ли это точной цитатой или необходимым терминологическим оборотом; если нет, замени конкретной формулировкой.`,
      });
    }

    // 2. Связка «является/представляет собой».
    if (COPULA_REGEX.test(ls)) {
      copulaSentences.push(sId);
    }

    // 3. Симметричная конструкция.
    if (/не только .+ но и /i.test(ls)) {
      symmetryCount++;

      if (!hasProtectedAuthorialPattern(donorProfile, 'symmetry', 1)) {
        issues.push({
          type: 'symmetry',
          severity: 'minor',
          sentenceIndexes: [sId],
          message: `Предложение №${sId}: конструкция «не только ... но и». Это нормативная конструкция, а не ошибка. Пересмотри её только в том случае, если она звучит шаблонно или нарушает естественный ход мысли.`,
        });
      }
    }

    // 4. Триады.
    if (TRIAD_REGEX.test(ls)) {
      triadCount++;

      if (!hasProtectedAuthorialPattern(donorProfile, 'triad', 1)) {
        issues.push({
          type: 'triad',
          severity: 'minor',
          sentenceIndexes: [sId],
          message: `Предложение №${sId}: перечисление из трёх элементов. Само по себе оно не является дефектом. Проверяй только искусственное, формальное или семантически избыточное перечисление; не удаляй содержательно необходимые элементы.`,
        });
      }
    }

    // 5. Цепочки родительных падежей.
    if (GENITIVE_CHAIN_REGEX.test(ls)) {
      genitiveCount++;

      if (!hasProtectedAuthorialPattern(donorProfile, 'genitiveChain', 1)) {
        issues.push({
          type: 'genitiveChain',
          severity: 'minor',
          sentenceIndexes: [sId],
          message: `Предложение №${sId}: обнаружена возможная цепочка родительных падежей. Проверь её читаемость и точность. Не перестраивай автоматически, если цепочка нормативна, терминологически точна или характерна для автора.`,
        });
      }
    }

    // 6. Лексическое эхо однокоренных слов внутри предложения.
    const sStems = getSentenceWords(s)
      .filter((w) => w.length >= 5 && !RUSSIAN_FUNCTION_WORDS.has(w.toLowerCase()))
      .map((w) => ({ raw: w, stem: stemRussianWord(w) }))
      .filter((x) => x.stem.length >= 4);

    const seenInSent = new Map<string, string>();

    for (const item of sStems) {
      const previous = seenInSent.get(item.stem);

      if (previous && previous.toLowerCase() !== item.raw.toLowerCase()) {
        issues.push({
          type: 'lexicalEcho',
          severity: 'minor',
          sentenceIndexes: [sId],
          message: `Предложение №${sId}: возможно, близко повторён корень «${item.raw}» / «${previous}». Не устраняй повтор автоматически: сначала определи, является ли он смысловым, терминологическим или авторским.`,
        });
        break;
      }

      if (!previous) {
        seenInSent.set(item.stem, item.raw);
      }
    }
  });

  // Связка оценивается с учетом реальной частоты у донора.
  const donorCopulaRate = donorProfile?.copulaPer1k ?? 0;
  const copulaThreshold =
    donorProfile && donorCopulaRate >= 0.3
      ? Math.max(3, Math.ceil((donorCopulaRate * text.length) / 1000 * 2.5))
      : 2;

  if (copulaSentences.length >= copulaThreshold) {
    issues.push({
      type: 'copula',
      severity: 'minor',
      sentenceIndexes: copulaSentences,
      message: `Предложения №${copulaSentences.join(', №')}: связка «является / представляет собой» встречается несколько раз. Проверь, нет ли канцелярского нагромождения. Если такая конструкция характерна для донора или нужна по смыслу, сохраняй её.`,
    });
  }

  // 7. Гладкие концовки абзацев.
  let runningSentIdx = 0;

  for (const para of paragraphs) {
    const pSents = splitParagraph(para);

    if (pSents.length > 0) {
      const lastSent = pSents[pSents.length - 1];
      const lastSentNum = runningSentIdx + pSents.length;

      if (SMOOTH_ENDING_REGEX.test(lastSent)) {
        issues.push({
          type: 'smoothEnding',
          severity: 'minor',
          sentenceIndexes: [lastSentNum],
          message: `Предложение №${lastSentNum} (конец абзаца): возможно, присутствует шаблонная обобщающая концовка. Проверь, действительно ли она нужна; не обрывай естественно завершённую мысль.`,
        });
      }

      runningSentIdx += pSents.length;
    }
  }

  // 8. Монотонность длин.
  // Не считаем близкие по длине предложения ошибкой, если такой ритм
  // сам по себе характерен для конкретного донора.
  if (lengths.length >= 4) {
    const donorBurstiness = donorProfile?.burstiness;
    const rhythmIsNaturallyEven =
      donorBurstiness !== undefined && donorBurstiness < 0.28;

    if (!rhythmIsNaturallyEven) {
      for (let i = 0; i <= lengths.length - 3; i++) {
        const slice = lengths.slice(i, i + 3);
        const minW = Math.min(...slice);
        const maxW = Math.max(...slice);

        if (maxW - minW <= 4 && minW >= 9) {
          issues.push({
            type: 'monotony',
            severity: 'minor',
            sentenceIndexes: [i + 1, i + 2, i + 3],
            message: `Предложения №${i + 1}–№${i + 3} близки по длине (${slice.join(', ')} слов). Проверь, не создаёт ли это монотонность. Не дроби и не объединяй предложения, если ритм соответствует донору и смыслу.`,
          });

          i += 2;
        }
      }
    }
  }

  // 9. Повторяющиеся зачины.
  for (let i = 0; i < sentences.length - 1; i++) {
    const patA = getOpenerPattern(sentences[i]);
    const patB = getOpenerPattern(sentences[i + 1]);

    if (patA && patA === patB && !patA.startsWith('W(')) {
      const repeatedOpeningIsDonorHabit =
        donorProfile?.authorialDeviations?.protectionLevel === 'high' &&
        hasProtectedAuthorialPattern(donorProfile, 'unusualOpening', 1);

      if (!repeatedOpeningIsDonorHabit) {
        issues.push({
          type: 'repetition',
          severity: 'minor',
          sentenceIndexes: [i + 1, i + 2],
          message: `Предложения №${i + 1} и №${i + 2} имеют сходный синтаксический зачин (${patA}). Проверь, не звучит ли повтор механически. Если повторение соответствует манере донора, оставь его.`,
        });
      }
    } else {
      const firstA = (getSentenceWords(sentences[i])[0] || '').toLowerCase();
      const firstB = (getSentenceWords(sentences[i + 1])[0] || '').toLowerCase();

      if (firstA && firstA === firstB && firstA.length > 2) {
        const repeatedOpeningIsDonorHabit =
          donorProfile?.authorialDeviations?.protectionLevel === 'high' &&
          hasProtectedAuthorialPattern(donorProfile, 'unusualOpening', 1);

        if (!repeatedOpeningIsDonorHabit) {
          issues.push({
            type: 'repetition',
            severity: 'minor',
            sentenceIndexes: [i + 1, i + 2],
            message: `Предложения №${i + 1} и №${i + 2} начинаются с одного слова («${firstA}»). Проверь, не является ли это случайным повтором. Не меняй зачин, если он характерен для донора.`,
          });
        }
      }
    }
  }

  // 10. Прерывистость.
  const minTargetBurstiness = donorProfile
    ? Math.max(0, Number((donorProfile.burstiness - 0.1).toFixed(2)))
    : 0.35;

  if (sentences.length >= 5 && burstiness < minTargetBurstiness) {
    issues.push({
      type: 'burstiness',
      severity: 'minor',
      sentenceIndexes: [],
      message: `Прерывистость (Burstiness = ${burstiness}) ниже ориентира (${minTargetBurstiness}). Проверь, не получился ли текст слишком ровным. Не добавляй короткие фразы и длинные периоды искусственно: ориентируйся на естественную интонацию донора.`,
    });
  }

  // 11. Дрейф длины предложений относительно донора.
  if (donorProfile && sentences.length >= 5) {
    if (
      donorProfile.shortRatioPct >= 20 &&
      shortRatioPct < donorProfile.shortRatioPct * 0.25
    ) {
      issues.push({
        type: 'donorLengthDrift',
        severity: 'minor',
        sentenceIndexes: [],
        message: `В тексте заметно меньше коротких фраз, чем у донора (${shortRatioPct}% против ${donorProfile.shortRatioPct}%). Проверь ритм, но не дроби предложения механически.`,
      });
    }

    if (
      donorProfile.longRatioPct >= 20 &&
      longRatioPct < donorProfile.longRatioPct * 0.25
    ) {
      issues.push({
        type: 'donorLengthDrift',
        severity: 'minor',
        sentenceIndexes: [],
        message: `В тексте заметно меньше длинных периодов, чем у донора (${longRatioPct}% против ${donorProfile.longRatioPct}%). Проверь, не упрощён ли синтаксис чрезмерно.`,
      });
    }

    if (Math.abs(avgLen - donorProfile.avgLen) >= 9) {
      issues.push({
        type: 'donorLengthDrift',
        severity: 'minor',
        sentenceIndexes: [],
        message: `Средняя длина фразы (${avgLen} слов) отличается от донора (${donorProfile.avgLen} слов). Проверь соответствие ритма, не подгоняя длину механически.`,
      });
    }
  }

  // 12. Пунктуационный почерк.
  if (donorProfile && text.length >= 400) {
    if (
      donorProfile.dashesPer1k >= 3.0 &&
      dashesPer1k < donorProfile.dashesPer1k * 0.35
    ) {
      issues.push({
        type: 'donorPunctuation',
        severity: 'minor',
        sentenceIndexes: [],
        message: `Тире встречаются реже, чем у донора (${dashesPer1k}/1k против ${donorProfile.dashesPer1k}/1k). Проверь пунктуационную интонацию, но не вставляй тире там, где они не нужны.`,
      });
    } else if (dashesPer1k > Math.max(8, donorProfile.dashesPer1k * 2.4)) {
      issues.push({
        type: 'donorPunctuation',
        severity: 'minor',
        sentenceIndexes: [],
        message: `Тире встречаются заметно чаще, чем у донора (${dashesPer1k}/1k против ${donorProfile.dashesPer1k}/1k). Проверь, не появились ли они искусственно.`,
      });
    }
  }

  // 13. Дискурсивные маркеры.
  // Отсутствие маркеров не является дефектом: добавлять их ради статистики нельзя.
  if (donorProfile && donorProfile.favoriteMarkers.length >= 3 && sentences.length >= 5) {
    const usedMarkers = donorProfile.favoriteMarkers.filter((m) =>
      new RegExp(`(^|[\\s,;(])${m}($|[\\s,;:.!?])`, 'i').test(lowerFull)
    );

    if (usedMarkers.length === 0) {
      issues.push({
        type: 'donorMarkers',
        severity: 'minor',
        sentenceIndexes: [],
        message: `В тексте не встретились некоторые характерные связки донора (${donorProfile.favoriteMarkers.slice(0, 5).join(', ')}). Это не требует обязательного исправления: не добавляй маркеры, если они не подходят по смыслу.`,
      });
    }
  }

  // 14. MATTR.
  // Низкий показатель — только повод посмотреть на текст, а не команда
  // заменять точные термины и авторские повторы синонимами.
  if (words.length >= 80 && ttr < 0.5) {
    issues.push({
      type: 'ttr',
      severity: 'minor',
      sentenceIndexes: [],
      message: `Корневое разнообразие MATTR = ${ttr}. Проверь, не вызвано ли оно чрезмерными случайными повторами. Сохраняй термины, смысловые повторы и характерную лексику автора; не подбирай синонимы ради числового показателя.`,
    });
  }

  // 15. Морфосинтаксический перекос (отглагольные существительные и причастные обороты).
  if (words.length >= 35) {
    const nomLimit = donorProfile
      ? Math.max(8.5, donorProfile.nominalizationPer100 * 1.65)
      : 12.0;

    if (morpho.nominalizationPer100 > nomLimit) {
      issues.push({
        type: 'nominalizationOverload',
        severity: 'major',
        sentenceIndexes: [],
        message: `Перегруз отглагольными существительными (-ение/-ость/-ция): ${morpho.nominalizationPer100}/100 слов (у донора ${donorProfile ? donorProfile.nominalizationPer100 : '6–9'}/100). Заменяй канцелярские конструкции с отглагольными существительными на живые глаголы действия.`,
      });
    }

    const partLimit = donorProfile
      ? Math.max(0.75, donorProfile.participleClausePerSent + 0.45)
      : 1.2;

    if (sentences.length >= 3 && morpho.participleClausePerSent > partLimit) {
      issues.push({
        type: 'participleOverload',
        severity: 'minor',
        sentenceIndexes: [],
        message: `Плотность обособленных причастных/деепричастных оборотов (${morpho.participleClausePerSent}/предл.) выше естественного уровня${donorProfile ? ` донора (${donorProfile.participleClausePerSent})` : ''}. Переведи часть оборотов в простые придаточные или глагольные конструкции.`,
      });
    }
  }

  // 16. Сохранность фактов, отрицаний, модальности и анти-утечка темы донора.
  const factsReport: FactVerificationReport = sourceText
    ? verifyFactsPreserved(sourceText, text, donorProfile)
    : {
        preservedPct: 100,
        lostCritical: [],
        lostTerms: [],
        negationDelta: 0,
        lostModals: [],
        donorLeakTerms: [],
      };

  if (factsReport.lostCritical.length > 0) {
    issues.unshift({
      type: 'factLoss',
      severity: 'critical',
      sentenceIndexes: [],
      message: `КРИТИЧНО: возможно, потеряны обязательные факты/имена/числа из исходника: ${factsReport.lostCritical.slice(0, 8).join(', ')}. Проверь исходный материал и верни пропущенное без искажения.`,
    });
  }

  if (factsReport.donorLeakTerms && factsReport.donorLeakTerms.length > 0) {
    const leakSentIds: number[] = [];
    sentences.forEach((s, idx) => {
      const ls = s.toLowerCase().replace(/ё/g, 'е');
      if (
        factsReport.donorLeakTerms!.some(
          (term) => ls.includes(term.toLowerCase().replace(/ё/g, 'е'))
        )
      ) {
        leakSentIds.push(idx + 1);
      }
    });

    issues.unshift({
      type: 'donorTopicLeak',
      severity: 'critical',
      sentenceIndexes: leakSentIds.slice(0, 6),
      message: `КРИТИЧНО (утечка темы донора): в текст попали предметные слова из Текста 1 (${factsReport.donorLeakTerms.slice(0, 8).join(', ')}). Немедленно убери тематическую лексику донора, оставив только материал Текста 2.`,
    });
  }

  if (
    sourceText &&
    sentences.length >= 3 &&
    ((factsReport.negationDelta !== undefined && Math.abs(factsReport.negationDelta) >= 2) ||
      (factsReport.lostModals && factsReport.lostModals.length >= 2))
  ) {
    const modalNote =
      factsReport.lostModals && factsReport.lostModals.length > 0
        ? ` Ослаблены модальные маркеры (${factsReport.lostModals.slice(0, 5).join(', ')}).`
        : '';
    const negNote =
      factsReport.negationDelta !== undefined && Math.abs(factsReport.negationDelta) >= 2
        ? ` Сдвиг числа отрицаний относительно исходника: ${factsReport.negationDelta > 0 ? `потеряно ~${factsReport.negationDelta}` : `добавлено ~${Math.abs(factsReport.negationDelta)}`}.`
        : '';

    issues.push({
      type: 'negationShift',
      severity: 'major',
      sentenceIndexes: [],
      message: `Смысловой сдвиг полярности или модальности:${negNote}${modalNote} Сверь оговорки, ограничения и отрицания с Текстом 2.`,
    });
  }

  // Подсчёт индексов.
  const criticalCount = issues.filter((i) => i.severity === 'critical').length;
  const majorCount = issues.filter((i) => i.severity === 'major').length;
  const minorCount = issues.filter((i) => i.severity === 'minor').length;

  const humanScore = Math.max(
    10,
    Math.min(100, Math.round(100 - criticalCount * 14 - majorCount * 7 - minorCount * 2))
  );

  let dnaMatchScore = humanScore;

  if (donorProfile) {
    const burstDiff = Math.abs(burstiness - donorProfile.burstiness);
    const avgLenDiff = Math.abs(avgLen - donorProfile.avgLen);
    const shortDiff = Math.abs(shortRatioPct - donorProfile.shortRatioPct);
    const longDiff = Math.abs(longRatioPct - donorProfile.longRatioPct);
    const dashDiff = Math.abs(dashesPer1k - donorProfile.dashesPer1k);

    const histL1 = donorProfile.lengthHistogramPct.reduce(
      (sum, pct, idx) => sum + Math.abs(pct - (lengthHistogramPct[idx] ?? 0)),
      0
    );
    const histPenalty = Math.min(8, Math.max(0, (histL1 - 24) * 0.08));

    const nomDiff = Math.max(0, Math.abs(morpho.nominalizationPer100 - donorProfile.nominalizationPer100) - 2.0);
    const partDiff = Math.max(0, Math.abs(morpho.participleClausePerSent - donorProfile.participleClausePerSent) - 0.25);
    const morphoPenalty = Math.min(7, nomDiff * 0.55) + Math.min(5, partDiff * 3.0);

    const markerHits = donorProfile.favoriteMarkers.filter((m) =>
      lowerFull.includes(m)
    ).length;

    // Отсутствие маркеров не штрафуется: их нельзя вставлять ради баллов.
    const markerBonus =
      donorProfile.favoriteMarkers.length > 0
        ? Math.min(5, markerHits * 1.5)
        : 2;

    const penalty =
      burstDiff * 30 +
      Math.min(15, avgLenDiff * 1.1) +
      shortDiff * 0.14 +
      longDiff * 0.12 +
      Math.min(10, dashDiff * 1.1) +
      histPenalty +
      morphoPenalty +
      criticalCount * 8 +
      majorCount * 4;

    dnaMatchScore = Math.max(
      10,
      Math.min(100, Math.round(95 + markerBonus - penalty))
    );
  }

  const factPenalty =
    factsReport.lostCritical.length * 12 +
    (factsReport.donorLeakTerms?.length ?? 0) * 10;

  const overallScore = Math.max(
    5,
    Math.min(
      100,
      Math.round(
        (donorProfile
          ? dnaMatchScore * 0.55 + humanScore * 0.45
          : humanScore) - factPenalty
      )
    )
  );

  const needsRefinement =
    criticalCount > 0 ||
    majorCount > 0 ||
    overallScore < 88 ||
    issues.some((issue) => issue.type === 'factLoss' || issue.type === 'donorTopicLeak');

  const severityOrder: Record<DiagnosticIssue['severity'], number> = {
    critical: 0,
    major: 1,
    minor: 2,
  };
  const prioritizedIssues = [...issues]
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
    .slice(0, 12);

  return {
    sentenceCount: sentences.length,
    paragraphCount: paragraphs.length,
    avgLen,
    shortRatioPct,
    longRatioPct,
    burstiness,
    ttr,
    dashesPer1k,
    nominalizationPer100: morpho.nominalizationPer100,
    participleClausePerSent: morpho.participleClausePerSent,
    foundCliches,
    issues: prioritizedIssues,
    humanScore,
    dnaMatchScore,
    overallScore,
    factsReport,
    needsRefinement,
  };
}
/* ------------------------------------------------------------------ */
/* Refinement & Critic Prompt Builders                                */
/* ------------------------------------------------------------------ */

export function numberSentencesWithParagraphs(text: string): {
  numberedText: string;
  paragraphs: string[][];
} {
  let n = 0;
  const paragraphs: string[][] = [];
  const numberedParagraphs: string[] = [];

  for (const para of text.split(/\n{2,}/)) {
    const sents = splitParagraph(para);

    if (sents.length === 0) continue;

    paragraphs.push(sents);
    numberedParagraphs.push(sents.map((s) => `[${++n}] ${s}`).join(' '));
  }

  return {
    numberedText: numberedParagraphs.join('\n\n'),
    paragraphs,
  };
}

// Применяет JSON-патчи только к указанным предложениям.
export function applySentencePatches(
  text: string,
  patches: Array<{ sentenceId: number; rewritten: string }>
): string {
  const patchMap = new Map<number, string>();

  for (const p of patches) {
    if (
      p &&
      Number.isInteger(p.sentenceId) &&
      typeof p.rewritten === 'string' &&
      p.rewritten.trim()
    ) {
      const cleaned = p.rewritten.replace(/^\[\d+\]\s*/, '').trim();

      if (cleaned.length >= 2) {
        patchMap.set(p.sentenceId, cleaned);
      }
    }
  }

  if (patchMap.size === 0) return text;

  let n = 0;

  const rebuilt = text
    .split(/\n{2,}/)
    .map((para) => {
      const sents = splitParagraph(para);

      if (sents.length === 0) return para.trim();

      return sents
        .map((s) => {
          n++;
          return patchMap.get(n) || s;
        })
        .join(' ');
    })
    .join('\n\n');

  return rebuilt;
}

function buildAuthorialProtectionReminder(
  donorProfile?: DonorDNAProfile
): string {
  if (!donorProfile?.authorialDeviations) {
    return `
ЗАЩИТА АВТОРСКОГО ПОЧЕРКА:
- Не исправляй необычную грамматику только потому, что она отличается от нейтральной нормы.
- Не удаляй намеренные повторы, тяжеловесные конструкции, короткие фразы и нестандартные зачины автоматически.
- Если неясно, является ли конструкция ошибкой или особенностью автора, предпочитай сохранение исходного варианта.
- Исправляй только очевидные случайные ошибки, которые не выглядят частью авторской манеры.`;
  }

  const profile = donorProfile.authorialDeviations;

  const descriptions: Record<AuthorialDeviationKind, string> = {
    genitiveChain: 'цепочки родительных падежей',
    copula: 'связки «является/представляет собой»',
    symmetry: 'конструкции «не только..., но и...»',
    triad: 'перечисления из трёх элементов',
    repetition: 'повторы',
    shortFragment: 'короткие самостоятельные фразы',
    unusualOpening: 'необычные синтаксические зачины',
  };

  const signals = profile.signals
    .map(
      (signal) =>
        `• ${descriptions[signal.kind]}: ${signal.count} случаев в образце, уверенность ${signal.confidence}.`
    )
    .join('\n');

  return `
ЗАЩИТА АВТОРСКОГО ПОЧЕРКА — УРОВЕНЬ ${profile.protectionLevel.toUpperCase()}:
${signals || 'В образце не обнаружено достаточно повторяющихся конструкций для уверенной классификации.'}

ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА:
- Перечисленные особенности не являются автоматическими дефектами.
- Не исправляй их только ради соответствия нейтральной литературной норме.
- Не заменяй авторские повторы случайными синонимами.
- Не перестраивай тяжеловесные конструкции, если они передают характерную манеру донора.
- Не добавляй подобные особенности искусственно: переноси их только там, где они органичны.
- При сомнении сохраняй конструкцию, а не нормализуй её.`;
}

export function extractLastSentences(text: string, count = 2): string {
  const sents = splitSentences(text);
  if (sents.length === 0) return '';
  return sents.slice(-Math.max(1, count)).join(' ');
}

export function buildSurgicalPatchPrompt(
  draftText: string,
  report: DiagnosticReport,
  donorProfile?: DonorDNAProfile,
  blueprint?: DonorStyleBlueprint | null,
  extraDirectives: string[] = []
): { systemInstruction: string; contents: string } {
  const { numberedText, paragraphs } = numberSentencesWithParagraphs(draftText);
  const flatSents = paragraphs.flat();

  const targetedIds = Array.from(
    new Set(
      report.issues
        .flatMap((i) => i.sentenceIndexes)
        .filter((id) => id > 0)
    )
  ).sort((a, b) => a - b);

  // Build contextual sliding windows [N-1] -> [N] -> [N+1] so neighboring rhythm & openers align seamlessly
  const contextWindows = targetedIds
    .slice(0, 8)
    .map((id) => {
      const idx = id - 1;
      if (idx < 0 || idx >= flatSents.length) return '';
      const prev = idx > 0 ? `[${id - 1}] (КОНТЕКСТ ДО — НЕ МЕНЯТЬ): ${flatSents[idx - 1]}` : '';
      const target = `>>> [${id}] (ЦЕЛЬ ПРАВКИ): ${flatSents[idx]}`;
      const next =
        idx + 1 < flatSents.length
          ? `[${id + 1}] (КОНТЕКСТ ПОСЛЕ — НЕ МЕНЯТЬ): ${flatSents[idx + 1]}`
          : '';
      return [prev, target, next].filter(Boolean).join('\n');
    })
    .filter(Boolean)
    .join('\n---\n');

  const styleReminder = donorProfile
    ? `
ГОЛОС ДОНОРА:
• Темп и пунктуация: тире «${donorProfile.dashStyle}», средняя длина фразы ${donorProfile.avgLen} слов, перепад длин ±${donorProfile.cadenceDeltaMean}.
• Отглагольные существительные: ~${donorProfile.nominalizationPer100}/100 сл.; маркеры: ${donorProfile.favoriteMarkers.slice(0, 6).join(', ') || 'естественные авторские связки'}.
${blueprint ? `• Синтаксис: ${blueprint.syntaxHabits.slice(0, 3).join('; ')}` : ''}
${donorProfile.exemplars[0] ? `• Ориентир интонации: «${donorProfile.exemplars[0]}»` : ''}`
    : '';

  const authorialProtection = buildAuthorialProtectionReminder(donorProfile);

  const systemInstruction = `Ты — точный стилистический редактор.
Тебе даны нумерованные предложения [N], контекстные окна [N-1 / N / N+1] и список замечаний.
Перепиши только те предложения, в которых действительно обнаружена проблема. Не редактируй контекстные [N-1]/[N+1] и весь текст целиком.
Обязательно сверяй стык с [N-1] и [N+1]: не повторяй начальное слово и синтаксический зачин соседа, если только повтор не характерен для донора.
Сохраняй факты, цифры, имена, термины, отрицания, цитаты и логические связи.
Не заменяй точные слова случайными синонимами.
Не исправляй нормативные конструкции только потому, что они попали в список диагностических сигналов.
${styleReminder}

${authorialProtection}

Если замечание относится к конструкции, которая может быть авторской особенностью, сначала проверь её по профилю донора. Если она соответствует его почерку, не исправляй её.

Верни JSON строго по схеме:
{ "patches": [ { "sentenceId": N, "rewritten": "..." } ] }.

Если предложение не нуждается в исправлении, не включай его в patches.`;

  const issuesList = [
    ...report.issues.map((iss, idx) => `${idx + 1}. ${iss.message}`),
    ...extraDirectives.map(
      (d, idx) => `${report.issues.length + idx + 1}. ${d}`
    ),
  ].join('\n');

  const windowBlock = contextWindows
    ? `\n\n======================\nКОНТЕКСТНЫЕ ОКНА ДЛЯ ТОЧНЫХ СТЫКОВ:\n${contextWindows}`
    : '';

  const contents = `НУМЕРОВАННЫЙ ТЕКСТ:
${numberedText}${windowBlock}

======================
ЗАМЕЧАНИЯ ДЛЯ ПРОВЕРКИ${targetedIds.length > 0 ? ` (предложения №: ${targetedIds.join(', ')})` : ''}:
${issuesList}

Выполни только необходимые исправления. Если замечание не подтверждается контекстом или конструкция характерна для донора, оставь предложение без изменения.

В поле rewritten допускается разделить одно предложение на два, если это действительно улучшает естественность и соответствует манере донора. Не дроби предложения механически.`;

  return { systemInstruction, contents };
}

export function buildRefinementPrompt(
  draftText: string,
  report: DiagnosticReport,
  donorProfile?: DonorDNAProfile,
  blueprint?: DonorStyleBlueprint | null,
  extraDirectives: string[] = [],
  sourceText?: string
): { systemInstruction: string; contents: string } {
  const { numberedText } = numberSentencesWithParagraphs(draftText);

  const donorGuidance = donorProfile
    ? `
ГОЛОС И РИТМ ДОНОРА:
- Тире: «${donorProfile.dashStyle}».
- Ориентир Burstiness: ${Math.max(
        0,
        Number((donorProfile.burstiness - 0.05).toFixed(2))
      )}–${Math.min(
        1.5,
        Number((donorProfile.burstiness + 0.12).toFixed(2))
      )}.
- Средняя длина предложения: ${donorProfile.avgLen} слов; гистограмма длин [1–5 | 6–10 | 11–16 | 17–24 | 25+]: [${donorProfile.lengthHistogramPct.join('% | ')}%].
- Короткие фразы: ${donorProfile.shortRatioPct}%, длинные периоды: ${donorProfile.longRatioPct}%.
- Отглагольные существительные у донора: ~${donorProfile.nominalizationPer100}/100 сл., причастные обороты: ~${donorProfile.participleClausePerSent}/предл.
- Маркеры донора: ${donorProfile.favoriteMarkers.slice(0, 6).join(', ') || 'естественные связки'}.
${blueprint ? `- Привычки синтаксиса: ${blueprint.syntaxHabits.join('; ')}` : ''}
${donorProfile.exemplars.length > 0 ? `- Живой эталон тона донора (не копируй тему): «${donorProfile.exemplars[0]}»` : ''}`
    : '';

  const authorialProtection = buildAuthorialProtectionReminder(donorProfile);

  const systemInstruction = `Ты — внимательный филологический редактор и стилист.
Твоя задача — улучшить текст, устранив только реальные дефекты, сохранив факты, смысл и индивидуальный голос автора.${donorGuidance}

${authorialProtection}

ПРАВИЛА РЕДАКТИРОВАНИЯ:
1. Если указаны потерянные факты, имена, числа или отрицания, проверь исходный материал и верни действительно пропущенные сведения.
2. Если обнаружена монотонность, оцени её на фоне реального ритма донора. Не добавляй короткие предложения и длинные периоды ради формального показателя.
3. Если найдены штампы или утечка предметных слов донора, проверь контекст и замени на точную формулировку из предметной области исходника.
4. Не запрещай конструкции «является», «представляет собой», «не только..., но и...», перечисления и цепочки родительных падежей без разбора.
5. Не исправляй намеренные авторские особенности, даже если они отличаются от нейтральной литературной нормы.
6. Не меняй точную терминологию на приблизительные синонимы.
7. Не переписывай удачные предложения.
8. Сохраняй исходное количество абзацев, если нет содержательной причины изменить их.
9. Не добавляй новые факты, оценки, аргументы или примеры.
10. Выведи только итоговый текст без номеров [1], [2], кавычек вокруг всего текста и редакторских комментариев.`;

  const issuesList = [
    ...report.issues.map((iss, idx) => `${idx + 1}. ${iss.message}`),
    ...extraDirectives.map(
      (d, idx) => `${report.issues.length + idx + 1}. ${d}`
    ),
  ].join('\n');

  const sourceHintParts: string[] = [];
  if (sourceText && report.factsReport.lostCritical.length > 0) {
    sourceHintParts.push(
      `ВОЗМОЖНО ПОТЕРЯННЫЕ ФАКТЫ ИЗ ИСХОДНИКА:\n${report.factsReport.lostCritical.join(', ')}\nПроверь их по исходному тексту и верни только те, которые действительно отсутствуют.`
    );
  }
  if (report.factsReport.donorLeakTerms && report.factsReport.donorLeakTerms.length > 0) {
    sourceHintParts.push(
      `СЛОВА, КОТОРЫЕ ПРОСОЧИЛИСЬ ИЗ ТЕМЫ ДОНОРА (УДАЛИТЬ):\n${report.factsReport.donorLeakTerms.join(', ')}`
    );
  }
  const sourceHint = sourceHintParts.length > 0 ? `\n\n${sourceHintParts.join('\n\n')}` : '';

  const contents = `НУМЕРОВАННЫЙ ЧЕРНОВИК:
${numberedText}

===================================
ДИАГНОСТИЧЕСКИЕ ЗАМЕЧАНИЯ:
${issuesList || 'Критические замечания не обнаружены.'}${sourceHint}

Выполни содержательную проверку каждого замечания. Не воспринимай диагностические сигналы как безусловные команды на переписывание.

Если конструкция является устойчивой особенностью донора, не исправляй её. Если замечание не подтверждается контекстом, оставь соответствующее предложение без изменений.

Выведи только окончательный текст, сохранив абзацы и естественную авторскую манеру.`;

  return { systemInstruction, contents };
}

function selectRepresentativeText(text: string, maxChars: number): string {
  const normalized = text.trim();

  if (normalized.length <= maxChars) return normalized;

  const chunkSize = Math.floor(maxChars / 3);

  const starts = [
    0,
    Math.max(0, Math.floor((normalized.length - chunkSize) / 2)),
    Math.max(0, normalized.length - chunkSize),
  ];

  const chunks = starts.map((start) =>
    normalized.slice(start, start + chunkSize).trim()
  );

  return chunks.filter(Boolean).join('\n[… фрагмент пропущен …]\n');
}

export function buildStyleCriticPrompt(
  donorText: string,
  contentText: string,
  candidateText: string,
  donorProfile: DonorDNAProfile,
  blueprint?: DonorStyleBlueprint | null
): { systemInstruction: string; contents: string } {
  const { numberedText } = numberSentencesWithParagraphs(candidateText);

  const authorialProtection = buildAuthorialProtectionReminder(donorProfile);

  return {
    systemInstruction: `Ты — независимый критик-стилист.
Сравни КАНДИДАТ с ДОНОРОМ (Текст 1) по манере и с ИСХОДНИКОМ (Текст 2) по фактам.

Оцени:
1. Насколько кандидат передаёт голос, лексику, синтаксис и ритм донора.
2. Какие факты или смысловые нюансы Текста 2 искажены или выпали.
3. Где случайно просочились тема или словарь Текста 1.
4. Какие конкретные предложения звучат шаблонно, искусственно или не похожи на донора.
5. Не были ли устранены характерные особенности донора ради нейтральной грамматической нормы.

${authorialProtection}

ВАЖНО:
- Не считай каждую триаду, цепочку родительных падежей, связку «является», повтор или короткое предложение дефектом.
- Не требуй искусственного разнообразия конструкций.
- Не предлагай исправления только ради изменения статистических показателей.
- Если конструкция соответствует донору и уместна по смыслу, оценивай её как допустимую.
- Замечания должны быть конкретными и привязанными к определённым предложениям.
- Не предлагай переписывать текст целиком, если достаточно точечной правки.

Верни строгий JSON по схеме.`,
    contents: `ДОНОР (ТЕКСТ 1 — КАК ПИСАТЬ, фрагмент):
${selectRepresentativeText(donorText, 1800)}

${blueprint ? `ПАСПОРТ ДОНОРА: ${blueprint.voiceAndPerson} | ${blueprint.lexicalRegister} | ${blueprint.syntaxHabits.join('; ')}` : ''}

ИСХОДНИК ФАКТОВ (ТЕКСТ 2 — ЧТО ПИСАТЬ):
${selectRepresentativeText(contentText, 2200)}

КАНДИДАТ (НУМЕРОВАННЫЙ; средняя длина фразы у донора — ${donorProfile.avgLen} слов):
${numberedText}

Оцени результат по схеме. Если существенных недостатков нет, не выдумывай замечания ради заполнения списка.`,
  };
}

/* ------------------------------------------------------------------ */
/* Deterministic polish                                               */
/* ------------------------------------------------------------------ */











export function deterministicPolish(
  text: string,
  donorProfile?: DonorDNAProfile
): string {
  let out = text.trim();

  // Удаляем нулевые/невидимые символы, которые иногда встречаются как артефакты.
  out = out.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '');

  // Убираем вводные реплики модели только перед двоеточием.
  out = out
    .replace(
      /^(?:Вот [^\n:]{0,60}|Итоговый текст|Переписанный (?:текст|вариант)|Результат|Готовый текст)\s*:\s*/i,
      ''
    )
    .trim();

  // Удаляем внешние тройные обратные кавычки или тройные двойные кавычки.
  if (
    (out.startsWith('```') && out.endsWith('```')) ||
    (out.startsWith('"""') && out.endsWith('"""'))
  ) {
    out = out
      .replace(/^```[a-z]*\n?/i, '')
      .replace(/\n?```$/i, '')
      .trim();
  }

  // Снимаем случайный Markdown.
  out = out
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*\n]{1,120})\*\*/g, '$1');

  // Убираем внешние кавычки только тогда, когда они обрамляют весь результат.
  // Внутренние кавычки сохраняются без нормализации.
  if (
    (out.startsWith('«') && out.endsWith('»') && out.indexOf('»') === out.length - 1) ||
    (out.startsWith('"') && out.endsWith('"') && out.indexOf('"', 1) === out.length - 1)
  ) {
    out = out.slice(1, -1).trim();
  }

  // Удаляем техническую нумерацию предложений.
  out = out
    .replace(/(^|\n)\[\d+\]\s+/g, '$1')
    .replace(/\s\[\d+\]\s+/g, ' ');

  // Не нормализуем все тире в тексте: это может уничтожить авторскую пунктуацию.
  // Меняем только очевидные разделительные тире с пробелами вокруг,
  // если профиль донора явно указывает на преобладающий вариант.
  if (donorProfile) {
    const preferredDash = donorProfile.dashStyle;
    const alternateDash = preferredDash === '—' ? '–' : '—';

    const preferredCount = (out.match(new RegExp(preferredDash, 'g')) || []).length;
    const alternateCount = (out.match(new RegExp(alternateDash, 'g')) || []).length;

    // Не меняем пунктуацию, если оба варианта используются сопоставимо часто.
    // Это защищает авторское смешанное употребление тире.
    if (alternateCount > preferredCount * 2 && alternateCount >= 4) {
      out = out.replace(
        new RegExp(`\\s${alternateDash}\\s`, 'g'),
        ` ${preferredDash} `
      );
    }
  }

  // Кавычки намеренно не нормализуются.
  // «Ёлочки», "лапки" и другие варианты могут быть частью почерка донора.

  out = out
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return out;

}

// END OF FILE