import type { LogicalRelation, Proposition } from "../types";
import { getLogicalRelationAuditKey } from "./semanticStructureAudit";
import { evidenceExistsInText } from "./textEvidence";

export type LogicalRelationStatus = "preserved" | "changed" | "omitted" | "uncertain";

export interface LogicalRelationAssessment {
  relationKey: string;
  status: LogicalRelationStatus;
  outputEvidence: string[];
  rationale: string;
  confidence: number;
}

export interface LogicalRelationPreservationReport {
  passed: boolean;
  assessments: LogicalRelationAssessment[];
  issues: string[];
}

/**
 * Validates output-side judgments for every source relation. This is a
 * structural counterpart to proposition assessment: facts may survive while
 * the relation connecting them is reversed, weakened or lost.
 */
export function validateLogicalRelationAssessments(
  candidateText: string,
  propositions: readonly Proposition[],
  input: unknown,
  minimumConfidence = 0.85,
): LogicalRelationPreservationReport {
  const issues: string[] = [];
  if (!Array.isArray(input)) {
    return { passed: false, assessments: [], issues: ["Ожидался массив оценок логических связей."] };
  }

  const relations = new Map<string, LogicalRelation>();
  for (const proposition of propositions) {
    for (const relation of proposition.relations) {
      relations.set(getLogicalRelationAuditKey(relation), relation);
    }
  }

  const byKey = new Map<string, LogicalRelationAssessment[]>();
  for (const raw of input) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      issues.push("Оценка логической связи должна быть объектом.");
      continue;
    }
    const item = raw as Record<string, unknown>;
    if (typeof item.relationKey !== "string" || !relations.has(item.relationKey)) {
      issues.push("Оценка ссылается на неизвестную логическую связь.");
      continue;
    }
    if (!["preserved", "changed", "omitted", "uncertain"].includes(String(item.status))) {
      issues.push(`Для связи ${item.relationKey} указан неизвестный статус.`);
      continue;
    }
    if (!Array.isArray(item.outputEvidence) ||
        !item.outputEvidence.every((value) => typeof value === "string") ||
        typeof item.rationale !== "string" || !item.rationale.trim() ||
        typeof item.confidence !== "number" || !Number.isFinite(item.confidence) ||
        item.confidence < 0 || item.confidence > 1) {
      issues.push(`Оценка связи ${item.relationKey} имеет некорректные доказательства или confidence.`);
      continue;
    }
    const assessment: LogicalRelationAssessment = {
      relationKey: item.relationKey,
      status: item.status as LogicalRelationStatus,
      outputEvidence: [...item.outputEvidence] as string[],
      rationale: item.rationale.trim(),
      confidence: item.confidence,
    };
    const list = byKey.get(assessment.relationKey) ?? [];
    list.push(assessment);
    byKey.set(assessment.relationKey, list);
  }

  const assessments: LogicalRelationAssessment[] = [];
  for (const relationKey of relations.keys()) {
    const matches = byKey.get(relationKey) ?? [];
    if (matches.length !== 1) {
      issues.push(matches.length === 0
        ? `Для логической связи ${relationKey} отсутствует оценка.`
        : `Для логической связи ${relationKey} получено несколько оценок.`);
      continue;
    }
    const assessment = matches[0];
    const evidenceIsGrounded = assessment.outputEvidence.every((evidence) =>
      evidenceExistsInText(candidateText, evidence));
    if (!evidenceIsGrounded) {
      issues.push(`Связь ${relationKey}: доказательство отсутствует в точном тексте кандидата.`);
    }
    if (assessment.status !== "preserved") {
      issues.push(`Логическая связь ${relationKey} имеет статус «${assessment.status}»: ${assessment.rationale}`);
    } else if (assessment.confidence < minimumConfidence) {
      issues.push(`Уверенность сохранения связи ${relationKey} ниже порога ${minimumConfidence}.`);
    } else if (assessment.outputEvidence.length === 0) {
      issues.push(`Сохранённая связь ${relationKey} не имеет текстового доказательства.`);
    }
    assessments.push(assessment);
  }

  for (const key of byKey.keys()) {
    if (!relations.has(key)) issues.push(`Получена лишняя оценка неизвестной связи ${key}.`);
  }

  return { passed: issues.length === 0, assessments, issues };
}
