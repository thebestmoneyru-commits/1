import type { Proposition, PropositionExtractionValidation } from "../types";

const MODALITY_KINDS = new Set([
  "certainty", "possibility", "necessity", "obligation", "permission", "desire", "reported-speech", "other",
]);
const QUALIFICATION_KINDS = new Set([
  "condition", "exception", "restriction", "approximation", "attribution", "time", "place", "degree", "other",
]);
const RELATION_KINDS = new Set([
  "cause", "effect", "contrast", "concession", "condition", "purpose", "sequence", "comparison", "attribution", "other",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Validates model-produced proposition records before they enter the inventory.
 * Each proposition must point to a literal source span. Offsets use JavaScript
 * UTF-16 string indices, matching String.slice and the rest of this codebase.
 */
export function validatePropositionExtraction(
  sourceText: string,
  input: unknown,
): PropositionExtractionValidation {
  const errors: string[] = [];
  if (!Array.isArray(input)) {
    return { valid: false, propositions: [], errors: ["Ожидался массив пропозиций."] };
  }

  const result: Proposition[] = [];
  const ids = new Set<string>();

  input.forEach((raw, index) => {
    if (!isRecord(raw)) {
      errors.push(`Пропозиция #${index + 1}: ожидался объект.`);
      return;
    }
    const item = raw;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const summary = typeof item.summary === "string" ? item.summary.trim() : "";
    const subject = typeof item.subject === "string" ? item.subject.trim() : "";
    const predicate = typeof item.predicate === "string" ? item.predicate.trim() : "";
    const polarity = item.polarity;
    const mandatory = item.mandatory;
    const span = isRecord(item.sourceSpan) ? item.sourceSpan : undefined;

    if (!id || item.id !== id || ids.has(id)) errors.push(`Пропозиция #${index + 1}: отсутствует ID, ID содержит внешние пробелы или ID повторяется.`);
    if (id) ids.add(id);
    if (!summary || !subject || !predicate) {
      errors.push(`Пропозиция ${id || "#" + (index + 1)}: summary, subject и predicate обязательны.`);
    }
    if (polarity !== "positive" && polarity !== "negative" && polarity !== "unknown") {
      errors.push(`Пропозиция ${id || "#" + (index + 1)}: некорректная полярность.`);
    }
    if (typeof mandatory !== "boolean") {
      errors.push(`Пропозиция ${id || "#" + (index + 1)}: mandatory должен быть boolean.`);
    }
    if (item.object !== undefined && (typeof item.object !== "string" || !item.object.trim())) {
      errors.push(`Пропозиция ${id || "#" + (index + 1)}: object должен быть непустой строкой, если указан.`);
    }

    const start = span?.start;
    const end = span?.end;
    const spanText = span?.text;
    const validSpan =
      Number.isInteger(start) &&
      Number.isInteger(end) &&
      (start as number) >= 0 &&
      (end as number) > (start as number) &&
      (end as number) <= sourceText.length &&
      typeof spanText === "string" &&
      sourceText.slice(start as number, end as number) === spanText;

    if (!validSpan) {
      errors.push(`Пропозиция ${id || "#" + (index + 1)}: sourceSpan не совпадает с исходным текстом.`);
    }

    let validQualifications = Array.isArray(item.qualifications);
    if (validQualifications) {
      (item.qualifications as unknown[]).forEach((rawQualification, qualificationIndex) => {
        if (!isRecord(rawQualification) ||
            typeof rawQualification.kind !== "string" ||
            !QUALIFICATION_KINDS.has(rawQualification.kind) ||
            typeof rawQualification.value !== "string" ||
            !rawQualification.value.trim()) {
          validQualifications = false;
          errors.push(`Пропозиция ${id || "#" + (index + 1)}: некорректное уточнение #${qualificationIndex + 1}.`);
        }
      });
    } else {
      errors.push(`Пропозиция ${id || "#" + (index + 1)}: qualifications должны быть массивом.`);
    }

    let validRelations = Array.isArray(item.relations);
    if (validRelations) {
      (item.relations as unknown[]).forEach((rawRelation, relationIndex) => {
        if (!isRecord(rawRelation) ||
            typeof rawRelation.kind !== "string" ||
            !RELATION_KINDS.has(rawRelation.kind) ||
            typeof rawRelation.from !== "string" || !rawRelation.from.trim() ||
            typeof rawRelation.to !== "string" || !rawRelation.to.trim() ||
            (rawRelation.expression !== undefined && typeof rawRelation.expression !== "string")) {
          validRelations = false;
          errors.push(`Пропозиция ${id || "#" + (index + 1)}: некорректное логическое отношение #${relationIndex + 1}.`);
        }
      });
    } else {
      errors.push(`Пропозиция ${id || "#" + (index + 1)}: relations должны быть массивом.`);
    }

    let validModality = true;
    if (item.modality !== undefined) {
      validModality = isRecord(item.modality) &&
        typeof item.modality.kind === "string" && MODALITY_KINDS.has(item.modality.kind) &&
        typeof item.modality.value === "string" && Boolean(item.modality.value.trim()) &&
        typeof item.modality.scope === "string" && Boolean(item.modality.scope.trim());
      if (!validModality) {
        errors.push(`Пропозиция ${id || "#" + (index + 1)}: некорректная модальность.`);
      }
    }

    if (
      id && summary && subject && predicate &&
      (polarity === "positive" || polarity === "negative" || polarity === "unknown") &&
      typeof mandatory === "boolean" && validSpan &&
      validQualifications && validRelations && validModality &&
      (item.object === undefined || (typeof item.object === "string" && Boolean(item.object.trim())))
    ) {
      result.push(item as unknown as Proposition);
    }
  });

  // Relations must refer to proposition IDs in this same source inventory.
  for (const proposition of result) {
    for (const relation of proposition.relations) {
      if (!ids.has(relation.from) || !ids.has(relation.to)) {
        errors.push(`Пропозиция ${proposition.id}: отношение ссылается на неизвестную пропозицию.`);
      }
    }
  }

  return { valid: errors.length === 0 && result.length === input.length, propositions: result, errors };
}
