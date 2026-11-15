import type { LogicalRelation, Proposition, TextSpan } from "../types";

export type SemanticStructureIssueKind =
  | "causal-direction"
  | "temporal-order"
  | "conditional-scope"
  | "concessive-scope"
  | "attribution"
  | "pronoun-antecedent"
  | "relation-omission"
  | "relation-inversion"
  | "relation-type"
  | "other";

export interface SemanticStructureIssue {
  kind: SemanticStructureIssueKind;
  propositionIds: string[];
  relationKey?: string;
  evidenceSpan: TextSpan;
  explanation: string;
}

export interface SemanticStructureAudit {
  checkedPropositionIds: string[];
  checkedRelationKeys: string[];
  issues: SemanticStructureIssue[];
}

export interface SemanticStructureAuditValidation {
  valid: boolean;
  audit?: SemanticStructureAudit;
  errors: string[];
}

const ISSUE_KINDS = new Set<SemanticStructureIssueKind>([
  "causal-direction", "temporal-order", "conditional-scope", "concessive-scope",
  "attribution", "pronoun-antecedent", "relation-omission", "relation-inversion",
  "relation-type", "other",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Stable key used to require explicit audit coverage of every extracted relation. */
export function getLogicalRelationAuditKey(relation: LogicalRelation): string {
  return JSON.stringify([relation.kind, relation.from, relation.to, relation.expression ?? ""]);
}

function validEvidenceSpan(sourceText: string, value: unknown): value is TextSpan {
  if (!isRecord(value)) return false;
  const { start, end, text } = value;
  return Number.isInteger(start) && Number.isInteger(end) &&
    (start as number) >= 0 && (end as number) > (start as number) &&
    (end as number) <= sourceText.length && typeof text === "string" &&
    sourceText.slice(start as number, end as number) === text &&
    /[\p{L}\p{N}]/u.test(text);
}

/**
 * Validates a separate audit of relations across propositions. The audit is
 * evidence-only: it never creates, deletes, reverses or edits inventory edges.
 */
export function validateSemanticStructureAudit(
  sourceText: string,
  propositions: readonly Proposition[],
  input: unknown,
): SemanticStructureAuditValidation {
  const errors: string[] = [];
  if (!isRecord(input) ||
      !Array.isArray(input.checkedPropositionIds) ||
      !Array.isArray(input.checkedRelationKeys) ||
      !Array.isArray(input.issues)) {
    return { valid: false, errors: ["Ожидался объект checkedPropositionIds/checkedRelationKeys/issues."] };
  }

  const propositionById = new Map(propositions.map((item) => [item.id, item]));
  const expectedPropositionIds = new Set(propositionById.keys());
  const relationByKey = new Map<string, LogicalRelation>();
  for (const proposition of propositions) {
    for (const relation of proposition.relations) {
      relationByKey.set(getLogicalRelationAuditKey(relation), relation);
    }
  }
  const expectedRelationKeys = new Set(relationByKey.keys());

  const checkedPropositionIds: string[] = [];
  const checkedPropositions = new Set<string>();
  for (const id of input.checkedPropositionIds) {
    if (typeof id !== "string" || !expectedPropositionIds.has(id)) {
      errors.push("Аудит структуры содержит неизвестный или некорректный ID пропозиции.");
      continue;
    }
    if (checkedPropositions.has(id)) errors.push(`Аудит структуры повторно проверяет пропозицию ${id}.`);
    checkedPropositions.add(id);
    checkedPropositionIds.push(id);
  }
  for (const id of expectedPropositionIds) {
    if (!checkedPropositions.has(id)) errors.push(`Аудит структуры не подтвердил проверку пропозиции ${id}.`);
  }

  const checkedRelationKeys: string[] = [];
  const checkedRelations = new Set<string>();
  for (const key of input.checkedRelationKeys) {
    if (typeof key !== "string" || !expectedRelationKeys.has(key)) {
      errors.push("Аудит структуры содержит неизвестный или некорректный ключ логической связи.");
      continue;
    }
    if (checkedRelations.has(key)) errors.push("Аудит структуры повторно проверяет одну логическую связь.");
    checkedRelations.add(key);
    checkedRelationKeys.push(key);
  }
  for (const key of expectedRelationKeys) {
    if (!checkedRelations.has(key)) errors.push(`Аудит структуры не подтвердил проверку связи ${key}.`);
  }

  const issues: SemanticStructureIssue[] = [];
  for (const [index, raw] of input.issues.entries()) {
    if (!isRecord(raw)) {
      errors.push(`Замечание структуры #${index + 1} должно быть объектом.`);
      continue;
    }
    if (typeof raw.kind !== "string" || !ISSUE_KINDS.has(raw.kind as SemanticStructureIssueKind)) {
      errors.push(`Замечание структуры #${index + 1} содержит неизвестный тип.`);
      continue;
    }
    if (!Array.isArray(raw.propositionIds) || raw.propositionIds.length < 1 || raw.propositionIds.length > 2 ||
        raw.propositionIds.some((id) => typeof id !== "string" || !expectedPropositionIds.has(id)) ||
        new Set(raw.propositionIds).size !== raw.propositionIds.length) {
      errors.push(`Замечание структуры #${index + 1} должно ссылаться на одну или две известные пропозиции.`);
      continue;
    }
    if (typeof raw.explanation !== "string" || !raw.explanation.trim()) {
      errors.push(`Замечание структуры #${index + 1} не содержит объяснения.`);
      continue;
    }
    if (!validEvidenceSpan(sourceText, raw.evidenceSpan)) {
      errors.push(`Замечание структуры #${index + 1} не содержит точного текстового свидетельства.`);
      continue;
    }

    const ids = raw.propositionIds as string[];
    const related = ids.map((id) => propositionById.get(id)!);
    const envelopeStart = Math.min(...related.map((item) => item.sourceSpan.start));
    const envelopeEnd = Math.max(...related.map((item) => item.sourceSpan.end));
    const evidence = raw.evidenceSpan;
    if ((evidence.start as number) < envelopeStart || (evidence.end as number) > envelopeEnd) {
      errors.push(`Замечание структуры #${index + 1} указывает на свидетельство вне фрагмента связанных пропозиций.`);
      continue;
    }

    let relationKey: string | undefined;
    if (raw.relationKey !== undefined) {
      if (typeof raw.relationKey !== "string" || !expectedRelationKeys.has(raw.relationKey)) {
        errors.push(`Замечание структуры #${index + 1} ссылается на неизвестную извлечённую связь.`);
        continue;
      }
      relationKey = raw.relationKey;
      const referencedRelation = relationByKey.get(relationKey)!;
      if (ids.length !== 2 ||
          !ids.includes(referencedRelation.from) || !ids.includes(referencedRelation.to)) {
        errors.push(`Замечание структуры #${index + 1} ссылается на связь, не соединяющую указанные пропозиции.`);
        continue;
      }
    }
    if ((raw.kind === "relation-inversion" || raw.kind === "relation-type") && !relationKey) {
      errors.push(`Замечание структуры #${index + 1} должно ссылаться на существующую связь через relationKey.`);
      continue;
    }
    if (raw.kind === "relation-omission" && ids.length !== 2) {
      errors.push(`Замечание об утраченной связи #${index + 1} должно указывать две пропозиции.`);
      continue;
    }

    issues.push({
      kind: raw.kind as SemanticStructureIssueKind,
      propositionIds: [...ids],
      ...(relationKey ? { relationKey } : {}),
      evidenceSpan: {
        start: evidence.start as number,
        end: evidence.end as number,
        text: evidence.text as string,
      },
      explanation: raw.explanation.trim(),
    });
  }

  if (errors.length) return { valid: false, errors };
  return {
    valid: true,
    audit: { checkedPropositionIds, checkedRelationKeys, issues },
    errors: [],
  };
}
