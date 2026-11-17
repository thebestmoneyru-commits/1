import type { Proposition } from "../types";
import { validatePropositionInterpretationAudit } from "./propositionInterpretationAudit";

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
