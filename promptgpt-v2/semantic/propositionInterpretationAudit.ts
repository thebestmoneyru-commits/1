import type { Proposition, TextSpan } from "../types";

export type PropositionInterpretationField =
  | "subject"
  | "predicate"
  | "object"
  | "polarity"
  | "modality"
  | "qualification"
  | "attribution"
  | "logical-relation"
  | "scope"
  | "other";

export interface PropositionInterpretationIssue {
  propositionId: string;
  field: PropositionInterpretationField;
  evidenceSpan: TextSpan;
  explanation: string;
}

export interface PropositionInterpretationAudit {
  checkedPropositionIds: string[];
  issues: PropositionInterpretationIssue[];
}

export interface PropositionInterpretationAuditValidation {
  valid: boolean;
  audit?: PropositionInterpretationAudit;
  errors: string[];
}

const FIELDS = new Set<PropositionInterpretationField>([
  "subject", "predicate", "object", "polarity", "modality",
  "qualification", "attribution", "logical-relation", "scope", "other",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validSpan(sourceText: string, value: unknown): value is TextSpan {
  if (!isRecord(value)) return false;
  const { start, end, text } = value;
  return Number.isInteger(start) && Number.isInteger(end) &&
    (start as number) >= 0 && (end as number) > (start as number) &&
    (end as number) <= sourceText.length && typeof text === "string" &&
    sourceText.slice(start as number, end as number) === text &&
    /[\p{L}\p{N}]/u.test(text);
}

/**
 * Validates a separate model's interpretation audit. Every source proposition
 * must be explicitly accounted for. Findings are evidence-linked and never
 * mutate proposition fields; callers decide whether to stop or request review.
 */
export function validatePropositionInterpretationAudit(
  sourceText: string,
  propositions: readonly Proposition[],
  input: unknown,
  options: { allowOutOfSpanSubjectPredicateEvidence?: boolean } = {},
): PropositionInterpretationAuditValidation {
  const errors: string[] = [];
  if (!isRecord(input) || !Array.isArray(input.checkedPropositionIds) || !Array.isArray(input.issues)) {
    return { valid: false, errors: ["Ожидался объект checkedPropositionIds/issues."] };
  }

  const expected = new Set(propositions.map((item) => item.id));
  const checked = input.checkedPropositionIds;
  const checkedSet = new Set<string>();
  for (const id of checked) {
    if (typeof id !== "string" || !expected.has(id)) {
      errors.push("Аудит содержит неизвестный или некорректный checkedPropositionId.");
      continue;
    }
    if (checkedSet.has(id)) errors.push(`Аудит повторно проверяет пропозицию ${id}.`);
    checkedSet.add(id);
  }
  for (const id of expected) {
    if (!checkedSet.has(id)) errors.push(`Аудит не подтвердил проверку пропозиции ${id}.`);
  }

  const issues: PropositionInterpretationIssue[] = [];
  for (const [index, raw] of input.issues.entries()) {
    if (!isRecord(raw)) {
      errors.push(`Замечание аудита #${index + 1} должно быть объектом.`);
      continue;
    }
    const propositionId = raw.propositionId;
    const field = raw.field;
    const explanation = raw.explanation;
    if (typeof propositionId !== "string" || !expected.has(propositionId)) {
      errors.push(`Замечание аудита #${index + 1} ссылается на неизвестную пропозицию.`);
      continue;
    }
    if (typeof field !== "string" || !FIELDS.has(field as PropositionInterpretationField)) {
      errors.push(`Замечание аудита #${index + 1} содержит неизвестное поле.`);
      continue;
    }
    if (typeof explanation !== "string" || !explanation.trim()) {
      errors.push(`Замечание аудита #${index + 1} не содержит объяснения.`);
      continue;
    }
    if (!validSpan(sourceText, raw.evidenceSpan)) {
      errors.push(`Замечание аудита #${index + 1} не содержит точного фрагмента исходника.`);
      continue;
    }
    const proposition = propositions.find((item) => item.id === propositionId)!;
    const span = raw.evidenceSpan;
    const overlaps = (span.start as number) < proposition.sourceSpan.end &&
      (span.end as number) > proposition.sourceSpan.start;
    const mayUseSentenceScopedEvidence =
      options.allowOutOfSpanSubjectPredicateEvidence === true &&
      (field === "subject" || field === "predicate");
    if (!overlaps && !mayUseSentenceScopedEvidence) {
      errors.push(`Замечание аудита #${index + 1} указывает на фрагмент вне исходного свидетельства пропозиции ${propositionId}.`);
      continue;
    }
    issues.push({
      propositionId,
      field: field as PropositionInterpretationField,
      evidenceSpan: { start: span.start as number, end: span.end as number, text: span.text as string },
      explanation: explanation.trim(),
    });
  }

  if (errors.length) return { valid: false, errors };
  return {
    valid: true,
    audit: { checkedPropositionIds: [...checkedSet], issues },
    errors: [],
  };
}
