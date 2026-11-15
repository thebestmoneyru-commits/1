import type { Proposition, PropositionExtractionValidation } from "../types";

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
    if (!raw || typeof raw !== "object") {
      errors.push(`Пропозиция #${index + 1}: ожидался объект.`);
      return;
    }
    const item = raw as Record<string, unknown>;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const summary = typeof item.summary === "string" ? item.summary.trim() : "";
    const subject = typeof item.subject === "string" ? item.subject.trim() : "";
    const predicate = typeof item.predicate === "string" ? item.predicate.trim() : "";
    const polarity = item.polarity;
    const mandatory = item.mandatory;
    const span = item.sourceSpan as Record<string, unknown> | undefined;

    if (!id || ids.has(id)) errors.push(`Пропозиция #${index + 1}: отсутствует ID или ID повторяется.`);
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

    if (!Array.isArray(item.qualifications) || !Array.isArray(item.relations)) {
      errors.push(`Пропозиция ${id || "#" + (index + 1)}: qualifications и relations должны быть массивами.`);
    }

    if (
      id && summary && subject && predicate &&
      (polarity === "positive" || polarity === "negative" || polarity === "unknown") &&
      typeof mandatory === "boolean" && validSpan &&
      Array.isArray(item.qualifications) && Array.isArray(item.relations)
    ) {
      result.push(item as unknown as Proposition);
    }
  });

  // Relations must refer to proposition IDs in this same source inventory.
  for (const proposition of result) {
    for (const relation of proposition.relations) {
      if (!relation || typeof relation !== "object" ||
          typeof relation.from !== "string" || typeof relation.to !== "string") {
        errors.push(`Пропозиция ${proposition.id}: некорректное логическое отношение.`);
        continue;
      }
      if (!ids.has(relation.from) || !ids.has(relation.to)) {
        errors.push(`Пропозиция ${proposition.id}: отношение ссылается на неизвестную пропозицию.`);
      }
    }
  }

  return { valid: errors.length === 0 && result.length === input.length, propositions: result, errors };
}
