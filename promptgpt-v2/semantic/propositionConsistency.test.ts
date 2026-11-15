import type { Proposition } from "../types";
import { detectPotentialPropositionContradictions } from "./propositionConsistency";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function makeProposition(
  id: string,
  polarity: Proposition["polarity"],
  overrides: Partial<Proposition> = {},
): Proposition {
  return {
    id,
    summary: "Монах пришёл",
    sourceSpan: { start: id === "p1" ? 0 : 30, end: id === "p1" ? 14 : 44, text: id === "p1" ? "Он пришёл сюда" : "Он не пришёл сюда" },
    subject: "Монах",
    predicate: polarity === "negative" ? "не пришёл" : "пришёл",
    object: "в монастырь",
    polarity,
    qualifications: [],
    relations: [],
    mandatory: true,
    ...overrides,
  };
}

export function runPropositionConsistencySelfTests(): { passed: number; names: string[] } {
  const names: string[] = [];

  const contradiction = detectPotentialPropositionContradictions([
    makeProposition("p1", "positive"),
    makeProposition("p2", "negative"),
  ]);
  assert(contradiction.contradictions.length === 1, "opposite polarity on an otherwise identical claim must be reported");
  names.push("detect explicit polarity conflicts");

  const differentTime = detectPotentialPropositionContradictions([
    makeProposition("p1", "positive", {
      qualifications: [{ kind: "time", value: "вчера" }],
    }),
    makeProposition("p2", "negative", {
      qualifications: [{ kind: "time", value: "сегодня" }],
    }),
  ]);
  assert(differentTime.contradictions.length === 0, "different explicit time contexts must not be conflated");
  names.push("respect different temporal qualifications");

  const differentAttribution = detectPotentialPropositionContradictions([
    makeProposition("p1", "positive", {
      qualifications: [{ kind: "attribution", value: "по словам первого свидетеля" }],
    }),
    makeProposition("p2", "negative", {
      qualifications: [{ kind: "attribution", value: "по словам второго свидетеля" }],
    }),
  ]);
  assert(differentAttribution.contradictions.length === 0, "different attributions must not be conflated");
  names.push("respect different speaker attributions");

  const differentObject = detectPotentialPropositionContradictions([
    makeProposition("p1", "positive", { object: "в монастырь" }),
    makeProposition("p2", "negative", { object: "в пустыню" }),
  ]);
  assert(differentObject.contradictions.length === 0, "different objects must not be treated as the same claim");
  names.push("avoid conflicts between different objects");

  const unknownPolarity = detectPotentialPropositionContradictions([
    makeProposition("p1", "unknown"),
    makeProposition("p2", "negative"),
  ]);
  assert(unknownPolarity.contradictions.length === 0, "unknown polarity must not be treated as explicit contradiction");
  names.push("ignore unknown polarity in contradiction screening");

  return { passed: names.length, names };
}
