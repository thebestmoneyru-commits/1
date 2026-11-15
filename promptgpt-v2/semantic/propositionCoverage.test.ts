import type { Proposition } from "../types";
import { checkPropositionSourceCoverage } from "./propositionCoverage";
import { splitParagraphs } from "../style/tokenizer";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function proposition(source: string, id: string, phrase: string): Proposition {
  const start = source.indexOf(phrase);
  if (start < 0) throw new Error(`Fixture phrase not found: ${phrase}`);
  return {
    id,
    summary: phrase,
    sourceSpan: { start, end: start + phrase.length, text: phrase },
    subject: "fixture subject",
    predicate: "fixture predicate",
    polarity: "positive",
    qualifications: [],
    relations: [],
    mandatory: true,
  };
}

export function runPropositionCoverageSelfTests(): { passed: number; names: string[] } {
  const names: string[] = [];
  const source = "Прп. Макарий пришёл в пустыню; там он поселился. Он не оставил учеников, хотя был болен. Если наступал вечер, братия собиралась на молитву.";
  const sentences = splitParagraphs(source).flatMap((paragraph) => paragraph.sentences);
  assert(sentences.length === 3, "Orthodox abbreviation must not split the first sentence");
  names.push("preserve sentence boundaries after common Orthodox abbreviations");

  const complete = [
    proposition(source, "p1", "Прп. Макарий пришёл в пустыню"),
    proposition(source, "p2", "там он поселился"),
    proposition(source, "p3", "Он не оставил учеников, хотя был болен."),
    proposition(source, "p4", "Если наступал вечер, братия собиралась на молитву."),
  ];
  const report = checkPropositionSourceCoverage(source, complete);
  assert(report.covered, "all sentence and semicolon-delimited segments must be covered");
  assert(report.sentenceCount === 3 && report.segmentCount === 4, "coverage must count sentences and semicolon clauses");
  names.push("accept complete sentence and clause source coverage");

  const missingClause = checkPropositionSourceCoverage(source, complete.filter((item) => item.id !== "p2"));
  assert(!missingClause.covered, "an unrepresented semicolon clause must be detected");
  assert(missingClause.gaps.some((gap) => gap.sourceSpan.text === "там он поселился"), "coverage gap must identify exact missing source text");
  names.push("detect a missing semicolon-delimited clause");

  const missingSentence = checkPropositionSourceCoverage(source, complete.filter((item) => item.id !== "p4"));
  assert(!missingSentence.covered, "an unrepresented sentence must be detected");
  assert(missingSentence.gaps.some((gap) => gap.sentenceIndex === 3), "coverage gap must report the sentence index");
  names.push("detect a wholly unrepresented sentence");

  const boundarySource = [
    "Простое предложение без точки с запятой.",
    "Первая клауза; вторая клауза; третья перед точкой.",
    "Кто пришёл?",
    "Идите скорее!",
    "Он долго молчал…",
    "Они ждали ответа...",
    "Он сказал: «Мир вам!»",
    "Брат (см. примечание) вышел.",
    "Макарий молился 🙏; братия слушала 😊.",
  ].join(" ");
  const boundaryGaps = checkPropositionSourceCoverage(boundarySource, []);
  assert(!boundaryGaps.covered && boundaryGaps.sentenceCount === 9 && boundaryGaps.segmentCount === 12,
    "all sentences and semicolon clauses must be counted across punctuation and emoji cases");
  for (const gap of boundaryGaps.gaps) {
    assert(boundarySource.slice(gap.sourceSpan.start, gap.sourceSpan.end) === gap.sourceSpan.text,
      `gap span must match exact UTF-16 slice: ${gap.sourceSpan.text}`);
  }
  const gapTexts = boundaryGaps.gaps.map((gap) => gap.sourceSpan.text);
  assert(gapTexts.includes("Простое предложение без точки с запятой"), "sentence without semicolon must trim terminal period");
  assert(gapTexts.includes("Первая клауза") && gapTexts.includes("вторая клауза") && gapTexts.includes("третья перед точкой"),
    "multiple semicolon clauses and final clause before period must have exact boundaries");
  assert(gapTexts.includes("Кто пришёл") && gapTexts.includes("Идите скорее"),
    "question and exclamation marks must be handled cleanly");
  assert(gapTexts.includes("Он долго молчал") && gapTexts.includes("Они ждали ответа"),
    "both Unicode ellipsis and three-dot ellipsis must be handled cleanly");
  assert(gapTexts.includes("Он сказал: «Мир вам!»") && gapTexts.includes("Брат (см. примечание) вышел"),
    "quotes and parentheses must not lose characters");
  assert(gapTexts.includes("Макарий молился 🙏") && gapTexts.includes("братия слушала 😊"),
    "Cyrillic and emoji surrogate pairs must preserve exact UTF-16 boundaries");
  names.push("preserve exact UTF-16 boundaries across punctuation, quotes, brackets and emojis");

  return { passed: names.length, names };
}
