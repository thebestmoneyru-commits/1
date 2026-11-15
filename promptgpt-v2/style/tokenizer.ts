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

export function splitParagraphs(text: string): Paragraph[] {
  const result: Paragraph[] = [];
  const matcher = /[^\n]+/gu;
  for (const match of text.matchAll(matcher)) {
    const raw = match[0];
    const leading = raw.search(/\S/u);
    if (leading < 0) continue;
    const trailing = raw.length - raw.trimEnd().length;
    const start = (match.index ?? 0) + leading;
    const end = (match.index ?? 0) + raw.length - trailing;
    const paragraphText = text.slice(start, end);
    const paragraphIndex = result.length;
    const sentences = splitSentences(paragraphText, start, paragraphIndex);
    result.push({ start, end, text: paragraphText, sentences });
  }
  return result;
}

function splitSentences(text: string, baseOffset: number, paragraphIndex: number): Sentence[] {
  const result: Sentence[] = [];
  let cursor = 0;
  for (const match of text.matchAll(SENTENCE_END)) {
    const end = (match.index ?? 0) + match[0].length;
    const candidate = text.slice(cursor, end);
    addSentence(candidate, cursor, end, baseOffset, paragraphIndex, result);
    cursor = end;
  }
  if (cursor < text.length) addSentence(text.slice(cursor), cursor, text.length, baseOffset, paragraphIndex, result);
  return result;
}

function addSentence(
  raw: string, localStart: number, localEnd: number, baseOffset: number,
  paragraphIndex: number, target: Sentence[],
): void {
  const leading = raw.search(/\S/u);
  if (leading < 0) return;
  const trimmed = raw.trimEnd();
  const start = baseOffset + localStart + leading;
  const end = baseOffset + localStart + trimmed.length;
  const value = trimmed.slice(leading);
  const words = tokenize(value).filter((token) => token.kind === "word" || token.kind === "number")
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
