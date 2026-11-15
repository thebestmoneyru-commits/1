import type { TextSpan } from "../types";
import type {
  Distribution, StyleAnalyzerOptions, StyleDNAProfile, StyleEvidence,
  StyleFeature, StyleFeatureFamily, StyleCorpusStats,
} from "./styleTypes";
import { countWords, median, splitParagraphs, tokenize, type Sentence } from "./tokenizer";

export const STYLE_PROFILE_VERSION = "2.0.0";

const DEFAULTS: StyleAnalyzerOptions = {
  minWordsForReliableProfile: 500,
  minSentencesForReliableProfile: 25,
  maxEvidencePerFeature: 4,
};

const CONNECTORS: Record<string, string[]> = {
  contrast: ["однако", "впрочем", "между тем", "тем не менее", "но"],
  cause: ["потому что", "поскольку", "ибо", "так как", "оттого что"],
  consequence: ["поэтому", "следовательно", "таким образом", "вследствие этого"],
  addition: ["также", "кроме того", "притом", "вместе с тем", "равным образом"],
  sequence: ["затем", "потом", "далее", "наконец", "во-первых", "во-вторых"],
  concession: ["хотя", "несмотря на", "пусть", "даже если"],
  explanation: ["то есть", "иначе говоря", "например", "в частности"],
};
const PARENTHETICAL = new Set([
  "вероятно", "очевидно", "конечно", "разумеется", "по-видимому",
  "кажется", "кстати", "следовательно", "итак", "таким образом",
]);
const PARTICIPLE_SUFFIX = /(?:вший|вшая|вшее|вшие|вшийся|вшаяся|вшееся|вшиеся|ющий|ющая|ющее|ющие|ущий|ущая|ущее|ущие|ащий|ащая|ащее|ащие|ящий|ящая|ящее|ящие|емый|емая|емое|емые|имый|имая|имое|имые|енный|енная|енное|енные|анный|анная|анное|анные|янный|янная|янное|янные|тый|тая|тое|тые)$/u;
const GERUND_SUFFIX = /(?:вши|в|ши|я)$/u;
const COMMON_FUNCTION_WORDS = new Set([
  "и","а","но","или","да","же","ли","бы","не","ни","что","чтобы","как",
  "когда","если","то","это","так","в","во","на","с","со","к","ко","у",
  "из","от","до","по","за","для","при","о","об","под","над","между",
  "без","через","перед","после","надо","можно","нужно",
]);

function fingerprint(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `fnv1a32:${(h >>> 0).toString(16).padStart(8,"0")}:${text.length}`;
}
function clamp01(n: number): number { return Math.max(0, Math.min(1, n)); }
function span(text: string, start: number, end: number): TextSpan { return { start, end, text: text.slice(start, end) }; }
function rate(count: number, denominator: number, scale: number): number {
  return denominator ? (count / denominator) * scale : 0;
}
function feature(
  id: string, family: StyleFeatureFamily, label: string, count: number, denominator: number,
  unit: StyleFeature["unit"], confidence: number, observations: number,
  examples: StyleEvidence[], interpretation: string, scale = 100,
): StyleFeature {
  return { id, family, label, count, denominator, rate: unit === "mean" ? count : rate(count, denominator, scale),
    unit, confidence, observations, evidence: examples, interpretation };
}
function phraseOccurrences(text: string, phrase: string): number[] {
  const result: number[] = [];
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const re = new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "giu");
  for (const m of text.matchAll(re)) result.push(m.index ?? 0);
  return result;
}
function countPattern(text: string, pattern: RegExp): number {
  const flags = pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g";
  return [...text.matchAll(new RegExp(pattern.source, flags))].length;
}
function distribution(values: number[]): StyleCorpusStats["sentenceLengthDistribution"] {
  const buckets = { short: 0, medium: 0, long: 0, veryLong: 0 };
  for (const n of values) {
    if (n <= 8) buckets.short++;
    else if (n <= 20) buckets.medium++;
    else if (n <= 35) buckets.long++;
    else buckets.veryLong++;
  }
  const total = values.length || 1;
  const d = (count: number): Distribution => ({ count, share: count / total });
  return { short: d(buckets.short), medium: d(buckets.medium), long: d(buckets.long), veryLong: d(buckets.veryLong) };
}
function wordsIn(sentence: Sentence): string[] { return sentence.words.map((w) => w.normalized); }
function meaningfulOpening(sentence: Sentence): string {
  // Keep function words: "и тогда", "но он", "в то время" can be authorial signals.
  return wordsIn(sentence).slice(0, 2).join(" ");
}
function makeCorpusStats(text: string, sentences: Sentence[], paragraphs: ReturnType<typeof splitParagraphs>): StyleCorpusStats {
  const lengths = sentences.map((s) => s.words.length);
  return {
    characters: text.length,
    words: countWords(text),
    sentences: sentences.length,
    paragraphs: paragraphs.length,
    meanWordsPerSentence: lengths.length ? lengths.reduce((a,b)=>a+b,0)/lengths.length : 0,
    medianWordsPerSentence: median(lengths),
    meanSentencesPerParagraph: paragraphs.length ? sentences.length/paragraphs.length : 0,
    sentenceLengthDistribution: distribution(lengths),
  };
}

/**
 * Heuristic corpus analyzer. Morphological labels are intentionally approximate:
 * Russian suffix patterns are clues, not a substitute for a morphological parser.
 */
export function analyzeStyleDNA(sourceText: string, options: Partial<StyleAnalyzerOptions> = {}): StyleDNAProfile {
  const config = { ...DEFAULTS, ...options };
  const text = sourceText ?? "";
  const paragraphs = splitParagraphs(text);
  const sentences = paragraphs.flatMap((p) => p.sentences);
  const allTokens = tokenize(text);
  const wordTokens = allTokens.filter((t) => t.kind === "word");
  const words = wordTokens.map((t) => t.normalized);
  const stats = makeCorpusStats(text, sentences, paragraphs);
  const features: StyleFeature[] = [];
  const warnings: string[] = [];
  const nSent = sentences.length || 1;
  const nWords = stats.words || 1;
  const corpusConfidence = clamp01(Math.min(stats.words / config.minWordsForReliableProfile, stats.sentences / config.minSentencesForReliableProfile));

  const sentenceLengths = sentences.map((s) => s.words.length);
  const variance = sentenceLengths.length
    ? sentenceLengths.reduce((sum, n) => sum + Math.pow(n - stats.meanWordsPerSentence, 2), 0) / sentenceLengths.length : 0;
  features.push(feature("rhythm.mean-sentence-length","rhythm","Средняя длина предложения",stats.meanWordsPerSentence,sentences.length,"mean",corpusConfidence,sentences.length,[], "Среднее число слов в предложении."));
  features.push(feature("rhythm.sentence-length-variance","rhythm","Разброс длины предложений",variance,sentences.length,"mean",corpusConfidence,sentences.length,[], "Дисперсия длины предложений; большее значение означает более неоднородный ритм."));
  features.push(feature("rhythm.long-sentence-share","rhythm","Доля длинных предложений",stats.sentenceLengthDistribution.long.count+stats.sentenceLengthDistribution.veryLong.count,nSent,"share",corpusConfidence,sentences.length,[], "Доля предложений длиннее 20 слов.",1));

  const punctuation: Array<[string,string,RegExp]> = [
    ["dash","Тире",/—|–/gu],["semicolon","Точка с запятой",/;/gu],
    ["colon","Двоеточие",/:/gu],["exclamation","Восклицательный знак",/!/gu],
    ["question","Вопросительный знак",/\?/gu],["ellipsis","Многоточие",/…|\.{3}/gu],
    ["parentheses","Скобочные конструкции",/[()]/gu],["quotation-marks","Кавычки",/[«»„“”"]/gu],
  ];
  for (const [id,label,re] of punctuation) {
    const count = countPattern(text,re);
    features.push(feature(`punctuation.${id}`,"punctuation",label,count,nWords,"per-1000-words",corpusConfidence,count,[],`Частота знака на 1000 слов.`,1000));
  }

  const commaSentences = sentences.filter((s)=>s.text.includes(","));
  const subordinate = sentences.filter((s)=>/\b(?:который|которая|которые|которое|поскольку|потому что|если|когда|хотя|чтобы|так как)\b/iu.test(s.text));
  const participleSentences = sentences.filter((s)=>s.words.some((w)=>PARTICIPLE_SUFFIX.test(w.normalized) && w.normalized.length > 5));
  const gerundSentences = sentences.filter((s)=>s.text.includes(",") && s.words.some((w)=>GERUND_SUFFIX.test(w.normalized) && w.normalized.length > 7));
  const parentheticalSentences = sentences.filter((s)=>s.words.some((w)=>PARENTHETICAL.has(w.normalized)));
  for (const [id,label,list,description] of [
    ["comma-rich","Предложения с запятыми",commaSentences,"Предложения, содержащие хотя бы одну запятую."],
    ["subordinate-markers","Предложения с маркерами придаточности",subordinate,"Эвристический поиск союзов и союзных слов."],
    ["participle-like","Предложения с причастными формами",participleSentences,"Приближённая суффиксальная эвристика, возможны ложные срабатывания."],
    ["gerund-like","Предложения с деепричастными формами",gerundSentences,"Приближённая суффиксальная эвристика, требует морфологической проверки."],
    ["parentheticals","Предложения с вводными маркерами",parentheticalSentences,"Наличие слов из ограниченного списка вводных маркеров."],
  ] as Array<[string,string,Sentence[],string]>) {
    features.push(feature(`syntax.${id}`,"syntax",label,list.length,nSent,"share",corpusConfidence,list.length,evidenceFor(list,config.maxEvidencePerFeature),description,1));
  }

  for (const [group, phrases] of Object.entries(CONNECTORS)) {
    const hits: Array<{sentence:Sentence;phrase:string}> = [];
    for (const sentence of sentences) {
      const lower = sentence.text.toLocaleLowerCase("ru-RU");
      for (const phrase of phrases) if (phraseOccurrences(lower,phrase).length) hits.push({sentence,phrase});
    }
    features.push(feature(`connectors.${group}`,"connectors",`Связки: ${group}`,hits.length,nSent,"per-100-sentences",corpusConfidence,hits.length,hits.slice(0,config.maxEvidencePerFeature).map(h=>({span:{start:h.sentence.start,end:h.sentence.end,text:h.sentence.text},excerpt:`${h.phrase}: ${h.sentence.text.slice(0,220)}`})), "Групповая частота связующих выражений.",100));
  }

  const openingMap = new Map<string, Sentence[]>();
  for (const s of sentences) {
    const key = meaningfulOpening(s);
    if (key.length < 3) continue;
    const list = openingMap.get(key) ?? []; list.push(s); openingMap.set(key,list);
  }
  for (const [key, list] of [...openingMap.entries()].filter(([,v])=>v.length>=2).sort((a,b)=>b[1].length-a[1].length).slice(0,12)) {
    features.push(feature(`openers.${key.replace(/\s+/gu,"-")}`,"openers",`Повторяющееся начало: «${key}»`,list.length,nSent,"per-100-sentences",corpusConfidence,list.length,evidenceFor(list,config.maxEvidencePerFeature),"Первые два слова предложения с сохранением служебных слов; частотный сигнал, не готовый стилевой маркер.",100));
  }

  const closingMap = new Map<string, Sentence[]>();
  for (const s of sentences) {
    const key = wordsIn(s).slice(-2).join(" ");
    if (key.length < 3) continue;
    const list = closingMap.get(key) ?? []; list.push(s); closingMap.set(key,list);
  }
  for (const [key,list] of [...closingMap.entries()].filter(([,v])=>v.length>=2).sort((a,b)=>b[1].length-a[1].length).slice(0,8)) {
    features.push(feature(`closings.${key.replace(/\s+/gu,"-")}`,"openers",`Повторяющееся окончание: «${key}»`,list.length,nSent,"per-100-sentences",corpusConfidence,list.length,evidenceFor(text,list,config.maxEvidencePerFeature),"Два последних слова предложения; частотный сигнал.",100));
  }

  const freq = new Map<string, number>();
  for (const w of words) if (w.length >= 5 && !COMMON_FUNCTION_WORDS.has(w)) freq.set(w,(freq.get(w)??0)+1);
  for (const [word,count] of [...freq.entries()].filter(([,c])=>c>=3).sort((a,b)=>b[1]-a[1]).slice(0,15)) {
    features.push(feature(`lexical.repeat.${word}`,"lexical",`Повторяемая лексема: «${word}»`,count,nWords,"per-1000-words",corpusConfidence,count,[], "Повторяемость лексемы; не является автоматически положительным стилевым признаком.",1000));
  }

  for (const phrase of options.trackedPhrases ?? []) {
    const positions = phraseOccurrences(text.toLocaleLowerCase("ru-RU"),phrase.toLocaleLowerCase("ru-RU"));
    const examples = positions.slice(0,config.maxEvidencePerFeature).map((pos)=>({
      span:span(text,pos,pos+phrase.length), excerpt:text.slice(Math.max(0,pos-70),Math.min(text.length,pos+phrase.length+100)),
    }));
    features.push(feature(`tracked.${phrase}`,"lexical",`Заданный маркер: «${phrase}»`,positions.length,nWords,"per-1000-words",corpusConfidence,positions.length,examples,"Маркер задан явно; его наличие не означает, что его нужно механически добавлять.",1000));
  }

  if (stats.words < config.minWordsForReliableProfile) warnings.push(`Мало слов: ${stats.words}; надёжный профиль требует около ${config.minWordsForReliableProfile}.`);
  if (stats.sentences < config.minSentencesForReliableProfile) warnings.push(`Мало предложений: ${stats.sentences}; надёжная оценка требует около ${config.minSentencesForReliableProfile}.`);
  if (!stats.paragraphs) warnings.push("Текст не содержит анализируемых абзацев.");
  if (features.some(f=>f.id.startsWith("syntax.participle") || f.id.startsWith("syntax.gerund"))) warnings.push("Морфологические признаки определяются эвристически; для точной классификации нужен морфологический анализатор.");

  const status = stats.words >= config.minWordsForReliableProfile && stats.sentences >= config.minSentencesForReliableProfile
    ? "sufficient" : stats.words >= 120 && stats.sentences >= 6 ? "limited" : "insufficient";
  return {
    profileVersion: STYLE_PROFILE_VERSION, status, confidence: corpusConfidence,
    corpus: stats, features, warnings, sourceFingerprint: fingerprint(text),
  };
}

function evidenceFor(sentences: Sentence[], max: number): StyleEvidence[] {
  return sentences.slice(0,max).map((s)=>({span:{start:s.start,end:s.end,text:s.text},excerpt:s.text.slice(0,260)}));
}
