import type { Proposition } from "../types";
import { getLogicalRelationAuditKey } from "./semanticStructureAudit";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

interface SpanRange {
  start: number;
  end: number;
}

function findExactOccurrences(haystack: string, needle: string): SpanRange[] {
  if (!needle) return [];
  const matches: SpanRange[] = [];
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const idx = haystack.indexOf(needle, from);
    if (idx < 0) break;
    matches.push({ start: idx, end: idx + needle.length });
    from = idx + 1;
  }
  return matches;
}

function findWhitespaceFlexibleOccurrences(haystack: string, needle: string): SpanRange[] {
  const tokens = needle.trim().split(/\s+/u).filter(Boolean);
  if (tokens.length <= 1) return findExactOccurrences(haystack, tokens[0] ?? "");

  const first = tokens[0];
  const matches: SpanRange[] = [];
  let searchFrom = 0;
  while (searchFrom <= haystack.length - first.length) {
    const start = haystack.indexOf(first, searchFrom);
    if (start < 0) break;
    let cursor = start + first.length;
    let matchedAll = true;
    for (let i = 1; i < tokens.length; i++) {
      let wsEnd = cursor;
      while (wsEnd < haystack.length && /\s/u.test(haystack[wsEnd])) {
        wsEnd++;
      }
      if (wsEnd === cursor || !haystack.startsWith(tokens[i], wsEnd)) {
        matchedAll = false;
        break;
      }
      cursor = wsEnd + tokens[i].length;
    }
    if (matchedAll) {
      matches.push({ start, end: cursor });
    }
    searchFrom = start + 1;
  }
  return matches;
}

/**
 * Deterministic verbatim span anchor.
 * LLMs cannot reliably compute exact UTF-16 character offsets across prose, so
 * when a model quotes a literal substring from `fullText` with imprecise
 * `start`/`end` numbers, this helper locates that exact substring and assigns
 * exact UTF-16 offsets without altering or inventing text. Non-literal quotes
 * are left untouched so downstream schema validation still rejects them.
 */
export function resolveVerbatimSpan(
  fullText: string,
  rawSpan: unknown,
  preferredRange?: SpanRange,
  hintStart = 0,
): unknown {
  if (!isRecord(rawSpan)) return rawSpan;
  const { start, end, text } = rawSpan;

  if (
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    (start as number) >= 0 &&
    (end as number) > (start as number) &&
    (end as number) <= fullText.length &&
    typeof text === "string" &&
    fullText.slice(start as number, end as number) === text
  ) {
    if (
      !preferredRange ||
      ((start as number) < preferredRange.end && (end as number) > preferredRange.start)
    ) {
      return { start: start as number, end: end as number, text };
    }
    const overlapping = findExactOccurrences(fullText, text).filter(
      (item) => item.start < preferredRange.end && item.end > preferredRange.start,
    );
    if (overlapping.length > 0) {
      let best = overlapping[0];
      let bestDistance = Math.abs(best.start - (start as number));
      for (let i = 1; i < overlapping.length; i++) {
        const distance = Math.abs(overlapping[i].start - (start as number));
        if (distance < bestDistance) {
          best = overlapping[i];
          bestDistance = distance;
        }
      }
      return { start: best.start, end: best.end, text: fullText.slice(best.start, best.end) };
    }
    return { start: start as number, end: end as number, text };
  }

  if (typeof text !== "string" || !/[\p{L}\p{N}]/u.test(text)) {
    return rawSpan;
  }

  let matches = findExactOccurrences(fullText, text);
  if (matches.length === 0) {
    const trimmed = text.trim();
    if (trimmed !== text) {
      matches = findExactOccurrences(fullText, trimmed);
    }
  }
  if (matches.length === 0) {
    matches = findWhitespaceFlexibleOccurrences(fullText, text);
  }
  if (matches.length === 0) {
    return rawSpan;
  }

  let pool = matches;
  if (preferredRange) {
    const overlapping = matches.filter(
      (item) => item.start < preferredRange.end && item.end > preferredRange.start,
    );
    if (overlapping.length > 0) {
      pool = overlapping;
    }
  }

  const targetHint =
    typeof start === "number" && Number.isFinite(start) && !(start === 0 && hintStart > 0)
      ? start
      : hintStart;
  let best = pool[0];
  let bestDistance = Math.abs(best.start - targetHint);
  for (let i = 1; i < pool.length; i++) {
    const distance = Math.abs(pool[i].start - targetHint);
    if (distance < bestDistance) {
      best = pool[i];
      bestDistance = distance;
    }
  }

  return {
    start: best.start,
    end: best.end,
    text: fullText.slice(best.start, best.end),
  };
}

/**
 * Normalizes unambiguous LLM formatting quirks at the preparation boundary
 * before running strict schema validation:
 * - unwraps `{ propositions: [...] }` if wrapped by the model;
 * - converts finite integer IDs / relation endpoints (e.g. `1` -> `"p1"`)
 *   while preserving malformed strings (like `" p1 "`) for strict rejection;
 * - converts JSON `null` on optional fields (`object`, `modality`, `expression`)
 *   to `undefined`;
 * - resolves verbatim `sourceSpan.text` to exact UTF-16 offsets in `sourceText`.
 */
export function normalizeModelExtractedPropositions(
  sourceText: string,
  raw: unknown,
): unknown {
  const list = isRecord(raw) && Array.isArray(raw.propositions) ? raw.propositions : raw;
  if (!Array.isArray(list)) return raw;

  const stringIds = new Set<string>();
  for (const item of list) {
    if (isRecord(item) && typeof item.id === "string") {
      stringIds.add(item.id);
    }
  }
  const normalizeId = (value: unknown): unknown => {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
      const asPlain = String(value);
      if (stringIds.has(asPlain)) return asPlain;
      return `p${value}`;
    }
    return value;
  };

  let cursorHint = 0;
  return list.map((entry) => {
    if (!isRecord(entry)) return entry;
    const copy: Record<string, unknown> = { ...entry };
    copy.id = normalizeId(copy.id);

    if (copy.object === null) delete copy.object;
    if (copy.modality === null) delete copy.modality;

    if (Array.isArray(copy.relations)) {
      copy.relations = copy.relations.map((rel) => {
        if (!isRecord(rel)) return rel;
        const relCopy: Record<string, unknown> = { ...rel };
        relCopy.from = normalizeId(relCopy.from);
        relCopy.to = normalizeId(relCopy.to);
        if (relCopy.expression === null) delete relCopy.expression;
        return relCopy;
      });
    }

    const resolvedSpan = resolveVerbatimSpan(sourceText, copy.sourceSpan, undefined, cursorHint);
    copy.sourceSpan = resolvedSpan;
    if (
      isRecord(resolvedSpan) &&
      Number.isInteger(resolvedSpan.end) &&
      typeof resolvedSpan.text === "string" &&
      fullTextMatches(sourceText, resolvedSpan)
    ) {
      cursorHint = resolvedSpan.end as number;
    }

    return copy;
  });
}

function fullTextMatches(fullText: string, span: Record<string, unknown>): boolean {
  return (
    Number.isInteger(span.start) &&
    Number.isInteger(span.end) &&
    (span.start as number) >= 0 &&
    (span.end as number) > (span.start as number) &&
    (span.end as number) <= fullText.length &&
    fullText.slice(span.start as number, span.end as number) === span.text
  );
}

export function normalizeModelInterpretationAudit(
  sourceText: string,
  propositions: readonly Proposition[],
  raw: unknown,
): unknown {
  if (!isRecord(raw) || !Array.isArray(raw.issues)) return raw;
  const byId = new Map(propositions.map((item) => [item.id, item]));
  return {
    ...raw,
    issues: raw.issues.map((entry) => {
      if (!isRecord(entry)) return entry;
      const prop = typeof entry.propositionId === "string" ? byId.get(entry.propositionId) : undefined;
      return {
        ...entry,
        evidenceSpan: resolveVerbatimSpan(sourceText, entry.evidenceSpan, prop?.sourceSpan),
      };
    }),
  };
}

export function normalizeModelStructureAudit(
  sourceText: string,
  propositions: readonly Proposition[],
  raw: unknown,
): unknown {
  if (!isRecord(raw)) return raw;
  const byId = new Map(propositions.map((item) => [item.id, item]));
  const expectedRelationKeys = new Set<string>();
  for (const proposition of propositions) {
    for (const relation of proposition.relations) {
      expectedRelationKeys.add(getLogicalRelationAuditKey(relation));
    }
  }

  const canonicalizeRelationKey = (value: unknown): unknown => {
    if (typeof value !== "string") return value;
    if (expectedRelationKeys.has(value)) return value;
    try {
      const parsed = JSON.parse(value) as unknown;
      if (
        Array.isArray(parsed) &&
        (parsed.length === 3 || parsed.length === 4) &&
        typeof parsed[0] === "string" &&
        typeof parsed[1] === "string" &&
        typeof parsed[2] === "string" &&
        (parsed[3] === undefined || typeof parsed[3] === "string")
      ) {
        const canonical = JSON.stringify([parsed[0], parsed[1], parsed[2], parsed[3] ?? ""]);
        if (expectedRelationKeys.has(canonical)) return canonical;
      }
    } catch {
      // Leave unparseable strings untouched so validation rejects invalid keys.
    }
    return value;
  };

  return {
    ...raw,
    ...(Array.isArray(raw.checkedRelationKeys)
      ? { checkedRelationKeys: raw.checkedRelationKeys.map(canonicalizeRelationKey) }
      : {}),
    ...(Array.isArray(raw.issues)
      ? {
          issues: raw.issues.map((entry) => {
            if (!isRecord(entry)) return entry;
            const copy: Record<string, unknown> = { ...entry };
            if (copy.relationKey === null) {
              delete copy.relationKey;
            } else if (copy.relationKey !== undefined) {
              copy.relationKey = canonicalizeRelationKey(copy.relationKey);
            }
            let envelope: SpanRange | undefined;
            if (Array.isArray(copy.propositionIds)) {
              const matched = copy.propositionIds
                .filter((id): id is string => typeof id === "string")
                .map((id) => byId.get(id))
                .filter((item): item is Proposition => Boolean(item));
              if (matched.length > 0) {
                envelope = {
                  start: Math.min(...matched.map((item) => item.sourceSpan.start)),
                  end: Math.max(...matched.map((item) => item.sourceSpan.end)),
                };
              }
            }
            copy.evidenceSpan = resolveVerbatimSpan(sourceText, copy.evidenceSpan, envelope);
            return copy;
          }),
        }
      : {}),
  };
}