import type { Proposition } from "../types";
import { validatePropositionInterpretationAudit } from "./propositionInterpretationAudit";
import { normalizeModelInterpretationAudit } from "./spanAnchor";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const source = "Святитель пришёл в город. Он помог людям.";
const propositions: Proposition[] = [
  {
    id: "p1", summary: "Святитель пришёл", sourceSpan: { start: 0, end: 25, text: source.slice(0, 25) },
    subject: "Святитель", predicate: "пришёл", object: "в город", polarity: "positive",
    qualifications: [], relations: [], mandatory: true,
  },
  {
    id: "p2", summary: "Он помог", sourceSpan: { start: 26, end: source.length, text: source.slice(26) },
    subject: "Он", predicate: "помог", object: "людям", polarity: "positive",
    qualifications: [], relations: [], mandatory: true,
  },
];

export function runPropositionInterpretationAuditSelfTests(): { passed: number; names: string[] } {
  const names: string[] = [];
  const valid = validatePropositionInterpretationAudit(source, propositions, {
    checkedPropositionIds: ["p1", "p2"], issues: [],
  });
  assert(valid.valid && valid.audit?.issues.length === 0, "complete clean audit must pass");
  names.push("accept a complete clean interpretation audit");

  const omittedId = validatePropositionInterpretationAudit(source, propositions, {
    checkedPropositionIds: ["p1"], issues: [],
  });
  assert(!omittedId.valid && omittedId.errors.some((item) => item.includes("не подтвердил проверку пропозиции p2")),
    "every proposition must be accounted for");
  names.push("reject audits that omit proposition IDs");

  const fabricatedEvidence = validatePropositionInterpretationAudit(source, propositions, {
    checkedPropositionIds: ["p1", "p2"],
    issues: [{
      propositionId: "p2", field: "subject",
      evidenceSpan: { start: 26, end: source.length, text: "текст, которого нет" },
      explanation: "Субъект не подтверждён.",
    }],
  });
  assert(!fabricatedEvidence.valid, "audit evidence must exactly match the immutable source");
  names.push("reject fabricated interpretation evidence");

  const wrongPropositionSpan = validatePropositionInterpretationAudit(source, propositions, {
    checkedPropositionIds: ["p1", "p2"],
    issues: [{
      propositionId: "p2", field: "attribution",
      evidenceSpan: { start: 0, end: 25, text: source.slice(0, 25) },
      explanation: "Атрибуция не подтверждена.",
    }],
  });
  assert(!wrongPropositionSpan.valid && wrongPropositionSpan.errors.some((item) => item.includes("вне исходного свидетельства")),
    "an issue must cite the evidence span of its proposition");
  names.push("reject findings detached from their proposition evidence");

  const repeatedSource = "Сначала идея неизбежно заходит в тупик, но потом модель неизбежно сталкивается с вопросом.";
  const secondClauseStart = repeatedSource.indexOf("модель");
  const repeatedPropositions: Proposition[] = [
    {
      id: "p1", summary: "Идея заходит в тупик",
      sourceSpan: { start: 0, end: repeatedSource.indexOf(", но"), text: repeatedSource.slice(0, repeatedSource.indexOf(", но")) },
      subject: "идея", predicate: "неизбежно заходит в тупик", polarity: "positive",
      qualifications: [], relations: [], mandatory: true,
    },
    {
      id: "p2", summary: "Модель сталкивается с вопросом",
      sourceSpan: { start: secondClauseStart, end: repeatedSource.length, text: repeatedSource.slice(secondClauseStart) },
      subject: "модель", predicate: "сталкивается с вопросом", polarity: "positive",
      qualifications: [], relations: [], mandatory: true,
    },
  ];
  const firstNeizbezhno = repeatedSource.indexOf("неизбежно");
  const normalizedRepeated = normalizeModelInterpretationAudit(repeatedSource, repeatedPropositions, {
    checkedPropositionIds: ["p1", "p2"],
    issues: [{
      propositionId: "p2",
      field: "modality",
      evidenceSpan: {
        start: firstNeizbezhno,
        end: firstNeizbezhno + "неизбежно".length,
        text: "неизбежно",
      },
      explanation: "Ослаблена модальность необходимости.",
    }],
  });
  const validatedRepeated = validatePropositionInterpretationAudit(repeatedSource, repeatedPropositions, normalizedRepeated);
  assert(
    validatedRepeated.valid &&
    validatedRepeated.audit?.issues[0].evidenceSpan.start === repeatedSource.indexOf("неизбежно", secondClauseStart),
    "repeated substring exact offsets pointing outside proposition sourceSpan must re-anchor to the overlapping occurrence",
  );
  names.push("re-anchor repeated evidenceSpan words to the target proposition range");

  const unknownId = validatePropositionInterpretationAudit(source, propositions, {
    checkedPropositionIds: ["p1", "p2"],
    issues: [{
      propositionId: "p999", field: "polarity",
      evidenceSpan: { start: 26, end: source.length, text: source.slice(26) },
      explanation: "Несовпадение полярности.",
    }],
  });
  assert(!unknownId.valid, "findings must refer to known proposition IDs");
  names.push("reject findings for unknown proposition IDs");

  return { passed: names.length, names };
}
