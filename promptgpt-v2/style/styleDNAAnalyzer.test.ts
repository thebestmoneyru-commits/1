import { analyzeStyleDNA } from "./styleDNAAnalyzer";
import { countWords, splitParagraphs } from "./tokenizer";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Style DNA self-test failed: ${message}`);
}

/** Lightweight dependency-free regression checks; callable from tsx or another TS runner. */
export function runStyleDNAAnalyzerSelfTests(): { passed: number; names: string[] } {
  const names: string[] = [];

  const paragraphs = splitParagraphs("Первая строка.\nВторая строка.\n\nНовый абзац.");
  assert(paragraphs.length === 2, "blank lines, not single line breaks, delimit paragraphs");
  assert(paragraphs[0].sentences.length === 2, "single line break remains within one paragraph");
  names.push("paragraph segmentation");

  const abbreviationText = "Он пояснил, т.е. уточнил мысль. Затем продолжил.";
  const abbreviationProfile = analyzeStyleDNA(abbreviationText);
  assert(abbreviationProfile.corpus.sentences === 2, "common abbreviation does not create a false sentence boundary");
  names.push("Russian abbreviation handling");

  const initialsProfile = analyzeStyleDNA("А. С. Пушкин пришёл. М. Ю. Лермонтов ушёл.");
  assert(initialsProfile.corpus.sentences === 2, "personal initials do not create false sentence boundaries");
  names.push("Russian personal initials");

  const subordinateProfile = analyzeStyleDNA("Поскольку он пришёл, мы начали работу.");
  const subordinateFeature = subordinateProfile.features.find((item) => item.id === "syntax.subordinate-markers");
  assert(!!subordinateFeature && subordinateFeature.count === 1, "Cyrillic clause markers are recognized with Unicode boundaries");
  names.push("Cyrillic syntax markers");

  assert(countWords("Один, два и три.") === 4, "word tokenizer counts words");
  names.push("word tokenization");

  const sample = "И тогда он вошёл в дом. И тогда он увидел свет. Но вскоре наступила ночь.";
  const profile = analyzeStyleDNA(sample);
  const opener = profile.features.find((item) => item.id === "openers.и-тогда");
  assert(!!opener && opener.count === 2, "repeated opening retains function words and frequency");
  names.push("repeated sentence openings");

  const meanFeature = profile.features.find((item) => item.id === "rhythm.mean-sentence-length");
  assert(!!meanFeature && Math.abs(meanFeature.rate - profile.corpus.meanWordsPerSentence) < 1e-9,
    "mean feature reports the mean rather than mean divided by sample size");
  names.push("mean metric semantics");

  assert(profile.status === "insufficient", "short samples are not presented as reliable profiles");
  names.push("short-corpus confidence gate");

  return { passed: names.length, names };
}
