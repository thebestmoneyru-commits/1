import type { TextSpan } from "../types";

export interface Token extends TextSpan {
  normalized: string;
  kind: "word" | "number" | "punctuation";
}
export interface Sentence extends TextSpan {
  words: Token[];
  paragraphIndex: number;
}
export interface Paragraph extends TextSpan {
  sentences: Sentence[];
}

const TOKEN_PATTERN = /[\p{L}\p{M}]+(?:[-‑'][\p{L}\p{M}]+)*|\d+(?:[.,]\d+)?|…|[—–-]|[^\s]/gu;
const SENTENCE_END = /[.!?…]+(?:[”’"»)}\]]*)?(?=\s|$)/gu;
const ABBREVIATIONS = [
  /(?<![\p{L}\p{N}_])т\s*\.\s*е\s*\./giu,
  /(?<![\p{L}\p{N}_])т\s*\.\s*д\s*\./giu,
  /(?<![\p{L}\p{N}_])т\s*\.\s*п\s*\./giu,
  /(?<![\p{L}\p{N}_])и\s*т\s*\.\s*д\s*\./giu,
  /(?<![\p{L}\p{N}_])и\s*т\s*\.\s*п\s*\./giu,
  /(?<![\p{L}\p{N}_])(?:ул|пер|просп|пл|д|корп|стр|кв|рис|табл|гл|ср|см|им|акад|проф|доц)\s*\./giu,
  /(?<![\p{L}\p{N}_])гг?\s*\./giu,
  /(?<![\p{L}\p{N}_])(?:руб|коп|тыс|млн|млрд)\s*\./giu,
  /(?<![\p{L}\p{N}_])[А-ЯЁ]\s*\.\s*[А-ЯЁ]\s*\.(?=\s*[А-ЯЁ][а-яё])/gu,
  /(?<![\p{L}\p{N}_])[А-ЯЁ]\s*\.(?=\s*[А-ЯЁ][а-яё])/gu,
];

function protectAbbreviations(text: string): string {
  let result = text;
  for (const pattern of ABBREVIATIONS) {
    result = result.replace(new RegExp(pattern.source, pattern.flags), (match) =>
      match.replace(/\./gu, "\uE000"),
    );
  }
  return result;
}

export function tokenize(text: string): Token[] {
  const result: Token[] = [];
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const value = match[0];
    const start = match.index ?? 0;
    const isWord = /^[\p{L}\p{M}]/u.test(value);
    const isNumber = /^\d/u.test(value);
    result.push({
      start, end: start + value.length, text: value,
      normalized: value.toLocaleLowerCase("ru-RU"),
      kind: isWord ? "word" : isNumber ? "number" : "punctuation",
    });
  }
  return result;
}

/** Paragraphs are separated by blank lines; single line breaks are preserved inside paragraphs. */
export function splitParagraphs(text: string): Paragraph[] {
  const result: Paragraph[] = [];
  const separator = /\r?\n[ \t]*\r?\n+/gu;
  let cursor = 0;
  const add = (rawStart: number, rawEnd: number) => {
    const raw = text.slice(rawStart, rawEnd);
    const leading = raw.search(/\S/u);
    if (leading < 0) return;
    const trimmed = raw.trimEnd();
    const start = rawStart + leading;
    const end = rawStart + trimmed.length;
    const paragraphText = text.slice(start, end);
    const paragraphIndex = result.length;
    result.push({
      start, end, text: paragraphText,
      sentences: splitSentences(paragraphText, start, paragraphIndex),
    });
  };
  for (const match of text.matchAll(separator)) {
    const start = match.index ?? 0;
    add(cursor, start);
    cursor = start + match[0].length;
  }
  add(cursor, text.length);
  return result;
}

function splitSentences(text: string, baseOffset: number, paragraphIndex: number): Sentence[] {
  const result: Sentence[] = [];
  const protectedText = protectAbbreviations(text);
  let cursor = 0;
  for (const match of protectedText.matchAll(SENTENCE_END)) {
    const end = (match.index ?? 0) + match[0].length;
    addSentence(text.slice(cursor, end), cursor, end, baseOffset, paragraphIndex, result);
    cursor = end;
  }
  if (cursor < text.length) {
    addSentence(text.slice(cursor), cursor, text.length, baseOffset, paragraphIndex, result);
  }
  return result;
}

function addSentence(
  raw: string, localStart: number, _localEnd: number, baseOffset: number,
  paragraphIndex: number, target: Sentence[],
): void {
  const leading = raw.search(/\S/u);
  if (leading < 0) return;
  const trimmed = raw.trimEnd();
  const start = baseOffset + localStart + leading;
  const end = baseOffset + localStart + trimmed.length;
  const value = trimmed.slice(leading);
  const words = tokenize(value)
    .filter((token) => token.kind === "word" || token.kind === "number")
    .map((token) => ({ ...token, start: token.start + start, end: token.end + start }));
  target.push({ start, end, text: value, words, paragraphIndex });
}

export function countWords(text: string): number {
  return tokenize(text).filter((token) => token.kind === "word" || token.kind === "number").length;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
