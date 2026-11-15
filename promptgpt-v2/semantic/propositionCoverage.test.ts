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

  return { passed: names.length, names };
}
