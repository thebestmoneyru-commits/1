import type { Proposition } from "../types";
import { getLogicalRelationAuditKey, validateSemanticStructureAudit } from "./semanticStructureAudit";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const source = "Вчера. Дождь пошёл, поэтому путники укрылись в храме.";
const propositions: Proposition[] = [
  {
    id: "p1", summary: "Дождь пошёл", sourceSpan: { start: source.indexOf("Дождь пошёл"), end: source.indexOf("Дождь пошёл") + "Дождь пошёл".length, text: "Дождь пошёл" },
    subject: "дождь", predicate: "пошёл", polarity: "positive",
    qualifications: [], relations: [{ kind: "cause", from: "p1", to: "p2", expression: "поэтому" }], mandatory: true,
  },
  {
    id: "p2", summary: "Путники укрылись в храме",
    sourceSpan: { start: source.indexOf("путники укрылись в храме"), end: source.indexOf("путники укрылись в храме") + "путники укрылись в храме".length, text: "путники укрылись в храме" },
    subject: "путники", predicate: "укрылись", object: "в храме", polarity: "positive",
    qualifications: [], relations: [{ kind: "cause", from: "p1", to: "p2", expression: "поэтому" }], mandatory: true,
  },
];
const relationKey = getLogicalRelationAuditKey(propositions[0].relations[0]!);
const cleanAudit = {
  checkedPropositionIds: ["p1", "p2"],
  checkedRelationKeys: [relationKey],
  issues: [],
};

export function runSemanticStructureAuditSelfTests(): { passed: number; names: string[] } {
  const names: string[] = [];
  const clean = validateSemanticStructureAudit(source, propositions, cleanAudit);
  assert(clean.valid && clean.audit?.issues.length === 0, "complete clean structure audit must pass");
  names.push("accept complete audit of propositions and extracted relations");

  const missingRelation = validateSemanticStructureAudit(source, propositions, {
    ...cleanAudit, checkedRelationKeys: [],
  });
  assert(!missingRelation.valid && missingRelation.errors.some((item) => item.includes("не подтвердил проверку связи")),
    "every extracted relation must be explicitly checked");
  names.push("reject structure audits that omit extracted relations");

  const inversion = validateSemanticStructureAudit(source, propositions, {
    ...cleanAudit,
    issues: [{
      kind: "relation-inversion", propositionIds: ["p1", "p2"], relationKey,
      evidenceSpan: { start: source.indexOf("поэтому"), end: source.indexOf("поэтому") + "поэтому".length, text: "поэтому" },
      explanation: "Проверить направление причинной связи.",
    }],
  });
  assert(inversion.valid && inversion.audit?.issues.length === 1, "source-grounded relation inversion finding must validate");
  names.push("accept source-grounded findings tied to an existing relation");

  const fabricatedEvidence = validateSemanticStructureAudit(source, propositions, {
    ...cleanAudit,
    issues: [{
      kind: "relation-omission", propositionIds: ["p1", "p2"],
      evidenceSpan: { start: 0, end: 10, text: "не существует" },
      explanation: "Есть пропущенная связь.",
    }],
  });
  assert(!fabricatedEvidence.valid, "evidence not copied exactly from source must fail");
  names.push("reject fabricated connective evidence");

  const detachedEvidence = validateSemanticStructureAudit(source, propositions, {
    ...cleanAudit,
    issues: [{
      kind: "relation-omission", propositionIds: ["p1", "p2"],
      evidenceSpan: { start: 0, end: 5, text: "Вчера" },
      explanation: "Связь утрачена.",
    }],
  });
  assert(!detachedEvidence.valid, "evidence outside the proposition envelope must fail");
  names.push("reject structural findings detached from referenced propositions");

  const unknownRelation = validateSemanticStructureAudit(source, propositions, {
    ...cleanAudit,
    issues: [{
      kind: "relation-inversion", propositionIds: ["p1", "p2"], relationKey: "unknown",
      evidenceSpan: { start: source.indexOf("поэтому"), end: source.indexOf("поэтому") + "поэтому".length, text: "поэтому" },
      explanation: "Связь перевёрнута.",
    }],
  });
  assert(!unknownRelation.valid, "findings cannot reference invented relation keys");
  names.push("reject findings referencing unknown relation keys");


  const mismatchedEndpoints = validateSemanticStructureAudit(source, propositions, {
    ...cleanAudit,
    issues: [{
      kind: "relation-inversion", propositionIds: ["p1", "p2"], relationKey,
      evidenceSpan: { start: source.indexOf("поэтому"), end: source.indexOf("поэтому") + "поэтому".length, text: "поэтому" },
      explanation: "Связь якобы относится к другим пропозициям.",
    }],
  });
  assert(mismatchedEndpoints.valid, "the referenced relation endpoints must match the issue proposition pair");
  names.push("validate that structural findings reference the relation endpoints");

  return { passed: names.length, names };
}
