import type { Proposition } from "../types";
import { getLogicalRelationAuditKey } from "./semanticStructureAudit";
import { validateLogicalRelationAssessments } from "./logicalRelationPreservation";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const candidate = "Дождь пошёл, поэтому путники укрылись в храме.";
const relation = { kind: "cause" as const, from: "p1", to: "p2", expression: "поэтому" };
const propositions: Proposition[] = [
  {
    id: "p1", summary: "Дождь пошёл",
    sourceSpan: { start: 0, end: 11, text: "Дождь пошёл" },
    subject: "дождь", predicate: "пошёл", polarity: "positive",
    qualifications: [], relations: [relation], mandatory: true,
  },
  {
    id: "p2", summary: "Путники укрылись",
    sourceSpan: { start: 23, end: 48, text: "путники укрылись в храме" },
    subject: "путники", predicate: "укрылись", object: "в храме",
    polarity: "positive", qualifications: [], relations: [relation], mandatory: true,
  },
];
const key = getLogicalRelationAuditKey(relation);
const clean = [{
  relationKey: key, status: "preserved", outputEvidence: ["поэтому"],
  rationale: "Причина и следствие сохранены.", confidence: 0.96,
}];

export function runLogicalRelationPreservationSelfTests(): { passed: number; names: string[] } {
  const names: string[] = [];
  const accepted = validateLogicalRelationAssessments(candidate, propositions, clean);
  assert(accepted.passed, "a grounded preserved relation should pass");
  names.push("accept preserved relation with exact candidate evidence");

  const omitted = validateLogicalRelationAssessments(candidate, propositions, [{
    ...clean[0], status: "omitted",
  }]);
  assert(!omitted.passed, "an omitted relation must fail");
  names.push("reject omitted logical relation");

  const reversed = validateLogicalRelationAssessments(candidate, propositions, [{
    ...clean[0], status: "changed", rationale: "Причина и следствие поменялись местами.",
  }]);
  assert(!reversed.passed, "a changed or reversed relation must fail");
  names.push("reject changed or inverted logical relation");

  const missing = validateLogicalRelationAssessments(candidate, propositions, []);
  assert(!missing.passed, "every source relation must be assessed");
  names.push("reject incomplete relation assessment");

  const fabricated = validateLogicalRelationAssessments(candidate, propositions, [{
    ...clean[0], outputEvidence: ["вследствие чего"],
  }]);
  assert(!fabricated.passed, "output evidence must occur verbatim in the candidate");
  names.push("reject fabricated output evidence");

  const lowConfidence = validateLogicalRelationAssessments(candidate, propositions, [{
    ...clean[0], confidence: 0.4,
  }]);
  assert(!lowConfidence.passed, "low-confidence relation preservation must fail");
  names.push("reject low-confidence relation preservation");

  return { passed: names.length, names };
}
