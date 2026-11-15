import type {
  FactInventory,
  SemanticAnchor,
  TextSpan,
} from "../types";

export const FACT_INVENTORY_VERSION = "2.0.0";

const SCRIPTURE_REFERENCE_PATTERNS = [
  /\b(?:Быт|Исх|Лев|Чис|Втор|Нав|Суд|Руф|1\s*Цар|2\s*Цар|3\s*Цар|4\s*Цар|Пс|Притч|Ис|Иер|Иез|Дан|Мф|Мк|Лк|Ин|Деян|Рим|1\s*Кор|2\s*Кор|Гал|Еф|Флп|Кол|1\s*Фес|2\s*Фес|1\s*Тим|2\s*Тим|Евр|Иак|1\s*Пет|2\s*Пет|1\s*Ин|2\s*Ин|3\s*Ин|Иуд|Откр)\.?\s*\d{1,3}(?::\d{1,3}(?:[-–]\d{1,3})?)?/giu,
  /\b\d?\s*[КорТимПетИнЦар]\.?\s*\d{1,3}:\d{1,3}(?:[-–]\d{1,3})?/giu,
];

const QUOTED_TEXT_PATTERN =
  /«[^»\n]{1,1000}»|„[^“\n]{1,1000}“|“[^”\n]{1,1000}”|"[^"\n]{1,1000}"/gu;

const NUMBER_OR_DATE_PATTERN =
  /(?<![\p{L}\p{N}_])(?:\d{1,4}(?:[.,]\d+)?(?:\s*[-–—/]\s*\d{1,4}(?:[.,]\d+)?)?(?:\s*(?:гг?\.?|году|лет|век(?:а|е)?|тыс\.?|млн\.?|млрд\.?|%))?|\d{1,2}[./]\d{1,2}[./]\d{2,4})(?![\p{L}\p{N}_])/gu;

function stableId(kind: string, value: string, index: number): string {
  return `${kind}-${index}-${hashString(value)}`;
}

function hashString(value: string): string {
  // Small deterministic non-cryptographic hash; IDs are labels, not security tokens.
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function collectMatches(text: string, pattern: RegExp): TextSpan[] {
  const flags = pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g";
  const matcher = new RegExp(pattern.source, flags);
  const matches: TextSpan[] = [];
  for (const match of text.matchAll(matcher)) {
    if (!match[0]) continue;
    const start = match.index ?? 0;
    matches.push({ start, end: start + match[0].length, text: match[0] });
  }
  return matches;
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

function toAnchor(
  kind: SemanticAnchor["kind"],
  span: TextSpan,
  index: number,
  required = true,
): SemanticAnchor {
  return {
    id: stableId(kind, span.text, index),
    kind,
    value: span.text,
    required,
    evidence: [{ sourceSpan: span }],
  };
}

export interface FactInventoryOptions {
  /** Terms selected by the caller/domain expert. These are stronger than frequency guesses. */
  requiredTerms?: readonly string[];
  /** Proper names supplied by the caller or a trusted upstream entity extractor. */
  properNames?: readonly string[];
  /** When false, automatically detected quotations are advisory, not hard requirements. */
  requireQuotedText?: boolean;
}

/**
 * Extracts literal anchors only. It does NOT claim to understand propositions,
 * negation scope, modality scope, or the meaning of a sentence.
 *
 * Do not use frequency-based guesses as mandatory domain terms. Pass important
 * terms explicitly through requiredTerms.
 */
export function buildFactInventory(
  sourceText: string,
  options: FactInventoryOptions = {},
): FactInventory {
  const text = sourceText ?? "";
  const anchors: SemanticAnchor[] = [];

  const numericSpans = uniqueSpans(collectMatches(text, NUMBER_OR_DATE_PATTERN));
  numericSpans.forEach((span, index) => {
    anchors.push(toAnchor("number", span, index));
  });

  const scriptureSpans = uniqueSpans(
    SCRIPTURE_REFERENCE_PATTERNS.flatMap((pattern) => collectMatches(text, pattern)),
  );
  scriptureSpans.forEach((span, index) => {
    anchors.push(toAnchor("scripture-reference", span, index));
  });

  const quotationSpans = uniqueSpans(collectMatches(text, QUOTED_TEXT_PATTERN));
  quotationSpans.forEach((span, index) => {
    anchors.push(toAnchor("quotation", span, index, options.requireQuotedText ?? true));
  });

  const names = uniqueStrings(options.properNames ?? []);
  names.forEach((name, index) => {
    anchors.push({
      id: stableId("proper-name", name, index),
      kind: "proper-name",
      value: name,
      required: true,
      evidence: [],
    });
  });

  const terms = uniqueStrings(options.requiredTerms ?? []);
  terms.forEach((term, index) => {
    anchors.push({
      id: stableId("domain-term", term, index),
      kind: "domain-term",
      value: term,
      required: true,
      evidence: [],
    });
  });

  return {
    anchors,
    propositions: [],
    warnings: [
      "Лексический инвентарь не является семантическим разбором.",
      "Имена и специальные термины следует передавать явно или получать из проверенного извлекателя.",
      "Область действия отрицания, модальности и логические отношения требуют отдельной проверки пропозиций.",
    ],
    sourceLength: text.length,
    inventoryVersion: FACT_INVENTORY_VERSION,
  };
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter((value) => {
      const key = value.toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
