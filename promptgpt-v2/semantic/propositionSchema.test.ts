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

  const detachedRelation = validatePropositionExtraction(source, [
    { ...base, relations: [{ kind: "cause", from: "p2", to: "p3" }] },
    { ...base, id: "p2", subject: "Брат" },
    { ...base, id: "p3", subject: "Настоятель" },
  ]);
  assert(!detachedRelation.valid && detachedRelation.errors.some((error) => error.includes("не связано с текущей пропозицией")),
    "a relation stored on a proposition must reference that proposition as one endpoint");
  names.push("reject logical relations detached from their owning proposition");

  const attachedRelation = validatePropositionExtraction(source, [
    { ...base, relations: [{ kind: "cause", from: "p1", to: "p2" }] },
    { ...base, id: "p2", subject: "Брат" },
  ]);
  assert(attachedRelation.valid, "a relation connecting its owning proposition to another known proposition must pass");
  names.push("accept correctly attached logical relations");

  const inventedExpression = validatePropositionExtraction(source, [{
    ...base, relations: [{ kind: "cause", from: "p1", to: "p2", expression: "несуществующий маркер" }],
  }], new Set(["p2"]));
  assert(!inventedExpression.valid && inventedExpression.errors.some((error) => error.includes("expression логического отношения отсутствует")),
    "relation expressions must be literal source evidence");
  names.push("reject logical-relation expressions absent from the source");

  const literalExpression = validatePropositionExtraction(source, [{
    ...base, relations: [{ kind: "cause", from: "p1", to: "p2", expression: "потому что" }],
  }], new Set(["p2"]));
  assert(literalExpression.valid, "a literal relation marker must pass");
  names.push("accept verbatim logical-relation expressions");

  const emptyExpression = validatePropositionExtraction(source, [{
    ...base, relations: [{ kind: "cause", from: "p1", to: "p2", expression: "   " }],
  }], new Set(["p2"]));
  assert(!emptyExpression.valid, "provided relation expressions must not be empty");
  names.push("reject empty logical-relation expressions");

  const paddedExpression = validatePropositionExtraction(source, [{
    ...base, relations: [{ kind: "cause", from: "p1", to: "p2", expression: "потому что  " }],
  }], new Set(["p2"]));
  assert(!paddedExpression.valid, "relation evidence must match the source exactly, including whitespace");
  names.push("reject relation expressions with non-source whitespace");

  const differentModality = validatePropositionExtraction(source, [
    base,
    { ...base, id: "p2", modality: { kind: "possibility", value: "возможно", scope: "не пришёл" } },
  ]);
  assert(differentModality.valid, "claims with different modality must not be treated as exact duplicates");
  names.push("include modality in semantic duplicate identity");

  const differentQualification = validatePropositionExtraction(source, [
    { ...base, qualifications: [{ kind: "condition", value: "если заболел" }] },
    { ...base, id: "p2", qualifications: [{ kind: "exception", value: "если заболел" }] },
  ]);
  assert(differentQualification.valid, "claims with different qualification kinds must not be treated as duplicates");
  names.push("include qualification kind in semantic duplicate identity");

  const delimiterCollisionA = { ...base, subject: "A|B", predicate: "C" };
  const delimiterCollisionB = { ...base, id: "p2", subject: "A", predicate: "B|C" };
  const delimiterCollision = validatePropositionExtraction(source, [delimiterCollisionA, delimiterCollisionB]);
  assert(delimiterCollision.valid, "delimiter characters in different fields must not collide in semantic identity");
  names.push("avoid semantic-key collisions from delimiter characters");

  return { passed: names.length, names };
}
