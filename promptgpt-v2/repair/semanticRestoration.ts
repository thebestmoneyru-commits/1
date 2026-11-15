import type { FactInventory, PropositionAssessment, SemanticReport } from "../types";
import type { LogicalRelationAssessment } from "../semantic/logicalRelationPreservation";
import { countWords } from "../style/tokenizer";

/**
 * Builds a single bounded restoration pass when independent verification finds
 * concrete semantic omissions. The current candidate is the style carrier;
 * the immutable source remains the only authority for meaning.
 */
export function buildSemanticRestorationPrompt(input: {
  sourceText: string;
  candidateText: string;
  inventory: FactInventory;
  propositionAssessments: readonly PropositionAssessment[];
  relationAssessments: readonly LogicalRelationAssessment[];
  semanticReport: SemanticReport;
}): string {
  const failedPropositions = input.propositionAssessments
    .filter((item) => item.status !== "preserved")
    .map((item) => ({
      propositionId: item.propositionId,
      status: item.status,
      outputEvidence: item.outputEvidence,
      verifierFinding: item.rationale,
      sourceProposition: input.inventory.propositions.find((p) => p.id === item.propositionId),
    }));
  const failedRelations = input.relationAssessments
    .filter((item) => item.status !== "preserved")
    .map((item) => ({
      relationKey: item.relationKey,
      status: item.status,
      outputEvidence: item.outputEvidence,
      verifierFinding: item.rationale,
    }));
  const missingAnchors = input.semanticReport.anchorChecks
    .filter((item) => item.status === "missing")
    .map((item) => {
      const anchor = input.inventory.anchors.find((candidate) => candidate.id === item.anchorId);
      return anchor ? {
        kind: anchor.kind,
        value: anchor.value,
        requiredOccurrences: anchor.requiredOccurrences,
      } : { anchorId: item.anchorId };
    });
  const sourceWords = countWords(input.sourceText);
  const candidateWords = countWords(input.candidateText);

  return [
    "ЗАДАЧА: восстанови в преобразованном тексте все утраченные элементы исходного содержания.",
    "Это не новая стилистическая генерация и не сокращённый пересказ. Текущий кандидат — основа и носитель уже достигнутой авторской манеры; исходник — единственный источник содержания.",
    "Сохрани удачные синтаксические и ритмические решения кандидата, меняя только то, что необходимо для восстановления полного смысла.",
    "Обязательно восстанови каждое пропущенное или изменённое положение, включая определения, наречия степени и частотности, усилители, ограничения, условия, временные уточнения, оговорки, сравнения, причинные пояснения и смысловые оттенки.",
    "Не считай сохранение общего тезиса достаточным, если из него исчезло хотя бы одно существенное уточнение. Не заменяй конкретное положение более общим выражением.",
    "Сохрани все исходные числа, даты, имена, термины, цитаты, отрицания, модальность, атрибуцию и логические отношения. Не добавляй сведений, которых нет в оригинале.",
    "Сверь каждую пропозицию и каждую связь из SOURCE INVENTORY с итоговым текстом. Семантически равнозначная формулировка допустима, но все исходные смысловые компоненты должны присутствовать.",
    "Не копируй факты, лексику или предметное содержание из донорских текстов. Не добавляй объяснений от себя.",
    "Ориентир по объёму — не менее 90% числа слов исходника, если только точное сохранение содержания не требует иного. Текущий кандидат короче исходника — проверь, не вызвано ли это пропусками.",
    "Верни только полный исправленный текст, сохранив абзацы. Не возвращай JSON, отчёт, комментарии или список изменений.",
    "",
    "VERIFICATION FINDINGS JSON:",
    JSON.stringify({
      failedPropositions,
      failedRelations,
      missingAnchors,
      semanticIssues: input.semanticReport.issues,
    }, null, 2),
    "",
    "SOURCE INVENTORY JSON:",
    JSON.stringify({
      anchors: input.inventory.anchors,
      propositions: input.inventory.propositions,
    }, null, 2),
    "",
    "SOURCE WORD COUNT:",
    String(sourceWords),
    "",
    "CURRENT CANDIDATE WORD COUNT:",
    String(candidateWords),
    "",
    "IMMUTABLE ORIGINAL SOURCE JSON:",
    JSON.stringify(input.sourceText),
    "",
    "CURRENT CANDIDATE JSON:",
    JSON.stringify(input.candidateText),
  ].join("\n");
}
