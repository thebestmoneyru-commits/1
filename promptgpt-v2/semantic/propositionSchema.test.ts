import { validatePropositionExtraction } from "./propositionSchema";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const source = "Он не пришёл, потому что заболел.";
const base = {
  id: "p1",
  summary: "Он не пришёл",
  sourceSpan: { start: 0, end: 12, text: source.slice(0, 12) },
  subject: "Он",
  predicate: "не пришёл",
  object: undefined,
  polarity: "negative",
  modality: { kind: "certainty", value: "факт", scope: "не пришёл" },
  qualifications: [],
  relations: [],
  mandatory: true,
};

export function runPropositionSchemaSelfTests(): { passed: number; names: string[] } {
  const names: string[] = [];
  const valid = validatePropositionExtraction(source, [base]);
  assert(valid.valid && valid.propositions.length === 1, "well-formed proposition must pass");
  names.push("accept a well-formed proposition with modality");

  const invalidQualification = validatePropositionExtraction(source, [{
    ...base, qualifications: [{ kind: "invented-kind", value: "условие" }],
  }]);
  assert(!invalidQualification.valid, "unknown qualification kinds must be rejected");
  names.push("reject unknown qualification kinds");

  const invalidModality = validatePropositionExtraction(source, [{
    ...base, modality: { kind: "certainty", value: "", scope: "не пришёл" },
  }]);
  assert(!invalidModality.valid, "empty modality values must be rejected");
  names.push("reject malformed modality");

  const invalidRelation = validatePropositionExtraction(source, [{
    ...base, relations: [{ kind: "cause", from: "p1", to: "missing" }],
  }]);
  assert(!invalidRelation.valid, "relations to missing proposition IDs must be rejected");
  names.push("reject dangling logical relations");

  const invalidObject = validatePropositionExtraction(source, [{ ...base, object: "   " }]);
  assert(!invalidObject.valid, "empty objects must be rejected when supplied");
  names.push("reject empty optional object values");

  return { passed: names.length, names };
}
