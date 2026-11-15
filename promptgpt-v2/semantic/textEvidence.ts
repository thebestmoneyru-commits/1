/**
 * Shared normalization for grounding verifier evidence in generated text.
 * It tolerates typography-only differences without weakening lexical matching.
 */
export function normalizeEvidenceText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[«»„“”]/gu, '"')
    .replace(/[‘’‚‛]/gu, "'")
    .replace(/[‐‑‒–—]/gu, "-")
    .replace(/ё/giu, "е")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("ru-RU");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/** Count normalized whole-phrase occurrences, not substrings inside other words. */
export function countNormalizedWholePhrase(text: string, phrase: string): number {
  const normalizedText = normalizeEvidenceText(text);
  const normalizedPhrase = normalizeEvidenceText(phrase);
  if (!normalizedPhrase) return 0;
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}_])${escapeRegExp(normalizedPhrase)}(?![\\p{L}\\p{N}_])`,
    "giu",
  );
  return [...normalizedText.matchAll(pattern)].length;
}

/** Ground a verifier-supplied excerpt despite harmless whitespace/typography changes. */
export function evidenceExistsInText(text: string, evidence: string): boolean {
  const normalizedEvidence = normalizeEvidenceText(evidence);
  if (!normalizedEvidence) return false;
  const pattern = new RegExp(
    "(?<![\\p{L}\\p{N}_])" + escapeRegExp(normalizedEvidence) + "(?![\\p{L}\\p{N}_])",
    "u",
  );
  return pattern.test(normalizeEvidenceText(text));
}
