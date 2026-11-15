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

  const emojiSource = "🙏 Он пришёл.";
  const emojiStart = emojiSource.indexOf("Он");
  const utf16 = validatePropositionExtraction(emojiSource, [{
    ...base,
    sourceSpan: { start: emojiStart, end: emojiStart + "Он пришёл.".length, text: "Он пришёл." },
  }]);
  assert(utf16.valid, "source offsets must use JavaScript UTF-16 indices");
  names.push("validate source offsets using UTF-16 indexing");

  const paddedId = validatePropositionExtraction(source, [{ ...base, id: " p1 " }]);
  assert(!paddedId.valid, "IDs with leading or trailing whitespace must be rejected");
  names.push("reject non-canonical proposition IDs");

  const duplicateClaim = validatePropositionExtraction(source, [
    base,
    { ...base, id: "p2" },
  ]);
  assert(!duplicateClaim.valid && duplicateClaim.errors.some((error) => error.includes("смысловой дубль")),
    "identical semantic claims tied to the same source span must be rejected");
  names.push("reject duplicate semantic claims on the same source span");

  const punctuationSpan = validatePropositionExtraction(source, [{
    ...base,
    sourceSpan: { start: 12, end: 13, text: "," },
  }]);
  assert(!punctuationSpan.valid, "punctuation-only spans must not support a proposition");
  names.push("reject punctuation-only proposition spans");

  const selfRelation = validatePropositionExtraction(source, [{
    ...base, relations: [{ kind: "cause", from: "p1", to: "p1" }],
  }]);
  assert(!selfRelation.valid && selfRelation.errors.some((error) => error.includes("саму себя")),
    "self-referential logical relations must be rejected");
  names.push("reject self-referential logical relations");

  return { passed: names.length, names };
}
