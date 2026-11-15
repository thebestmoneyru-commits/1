import type { FactInventory, SemanticAnchor, TextSpan } from "../types";

export const FACT_INVENTORY_VERSION = "2.0.1";

const SCRIPTURE_REFERENCE_PATTERNS = [
  /(?<![\p{L}\p{N}_])(?:Быт|Исх|Лев|Чис|Втор|Нав|Суд|Руф|1\s*Цар|2\s*Цар|3\s*Цар|4\s*Цар|Пс|Притч|Ис|Иер|Иез|Дан|Мф|Мк|Лк|Ин|Деян|Рим|1\s*Кор|2\s*Кор|Гал|Еф|Флп|Кол|1\s*Фес|2\s*Фес|1\s*Тим|2\s*Тим|Евр|Иак|1\s*Пет|2\s*Пет|1\s*Ин|2\s*Ин|3\s*Ин|Иуд|Откр)\.?\s*\d{1,3}(?::\d{1,3}(?:[-–]\d{1,3})?)?/giu,
  /(?<![\p{L}\p{N}_])\d?\s*[КорТимПетИнЦар]\.?\s*\d{1,3}:\d{1,3}(?:[-–]\d{1,3})?/giu,
];
const QUOTED_TEXT_PATTERN = /«[^»\n]{1,1000}»|„[^“\n]{1,1000}“|“[^”\n]{1,1000}”|"[^"\n]{1,1000}"/gu;
const NUMBER_OR_DATE_PATTERN = /(?<![\p{L}\p{N}_])(?:\d{1,4}(?:[.,]\d+)?(?:\s*[-–—/]\s*\d{1,4}(?:[.,]\d+)?)?(?:\s*(?:гг?\.?|году|лет|век(?:а|е)?|тыс\.?|млн\.?|млрд\.?|%))?|\d{1,2}[./]\d{1,2}[./]\d{2,4})(?![\p{L}\p{N}_])/gu;

function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
export function fingerprintSource(text: string): string {
  return `fnv1a32:${hashString(text)}:${text.length}`;
}
function stableId(kind: string, value: string, index: number): string {
  return `${kind}-${index}-${hashString(value)}`;
}
function collectMatches(text: string, pattern: RegExp): TextSpan[] {
  const matcher = new RegExp(pattern.source, pattern.flags);
  const result: TextSpan[] = [];
  for (const match of text.matchAll(matcher)) {
    if (!match[0]) continue;
    const start = match.index ?? 0;
    result.push({ start, end: start + match[0].length, text: match[0] });
  }
  return result;
}
function uniqueSpans(spans: TextSpan[]): TextSpan[] {
  const seen = new Set<string>();
  return spans.filter((span) => {
    const key = span.text.trim().replace(/\s+/gu, " ").toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.map((value) => value.trim()).filter((value) => {
    const key = value.toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function toAnchor(kind: SemanticAnchor["kind"], span: TextSpan, index: number, required = true): SemanticAnchor {
  return { id: stableId(kind, span.text, index), kind, value: span.text, required, requiredOccurrences: 1, evidence: [{ sourceSpan: span }] };
}
export interface FactInventoryOptions {
  requiredTerms?: readonly string[];
  properNames?: readonly string[];
  requireQuotedText?: boolean;
}

/** Literal anchor extraction only; it does not infer sentence meaning or negation scope. */
export function buildFactInventory(sourceText: string, options: FactInventoryOptions = {}): FactInventory {
  const text = sourceText ?? "";
  const anchors: SemanticAnchor[] = [];

  collectMatches(text, NUMBER_OR_DATE_PATTERN).forEach((span, i) =>
    anchors.push(toAnchor("number", span, i)),
  );
  SCRIPTURE_REFERENCE_PATTERNS.flatMap((pattern) => collectMatches(text, pattern)).forEach((span, i) =>
    anchors.push(toAnchor("scripture-reference", span, i)),
  );
  collectMatches(text, QUOTED_TEXT_PATTERN).forEach((span, i) =>
    anchors.push(toAnchor("quotation", span, i, options.requireQuotedText ?? true)),
  );
  uniqueStrings(options.properNames ?? []).forEach((name, i) =>
    anchors.push({ id: stableId("proper-name", name, i), kind: "proper-name", value: name, required: true, requiredOccurrences: 1, evidence: [] }),
  );
  uniqueStrings(options.requiredTerms ?? []).forEach((term, i) =>
    anchors.push({ id: stableId("domain-term", term, i), kind: "domain-term", value: term, required: true, requiredOccurrences: 1, evidence: [] }),
  );

  return {
    anchors,
    propositions: [],
    warnings: [
      "Лексический инвентарь не является семантическим разбором.",
      "Имена и специальные термины следует передавать явно или получать из проверенного извлекателя.",
      "Отрицание, модальность, оговорки и логические отношения требуют отдельной проверки пропозиций.",
    ],
    sourceLength: text.length,
    sourceFingerprint: fingerprintSource(text),
    inventoryVersion: FACT_INVENTORY_VERSION,
  };
}
