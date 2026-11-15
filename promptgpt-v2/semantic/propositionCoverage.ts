import type { Proposition, TextSpan } from "../types";
import { splitParagraphs } from "../style/tokenizer";

export interface PropositionCoverageGap {
  sentenceIndex: number;
  segmentIndex: number;
  sourceSpan: TextSpan;
  sentenceText: string;
}

export interface PropositionCoverageReport {
  covered: boolean;
  sentenceCount: number;
  segmentCount: number;
  coveredSegments: number;
  gaps: PropositionCoverageGap[];
}

/**
 * Conservative deterministic coverage check. Every sentence and every
 * semicolon-delimited clause must intersect at least one validated proposition
 * span. Clause spans exclude leading/trailing whitespace and terminal sentence
 * punctuation ([.!?…]+$) while keeping internal punctuation, closing quotes/
 * brackets and exact UTF-16 offsets. This detects completely unrepresented
 * source regions; it does not prove that a proposition captures every meaning
 * inside an intersecting span.
 */
export function checkPropositionSourceCoverage(
  sourceText: string,
  propositions: readonly Proposition[],
): PropositionCoverageReport {
  const spans = propositions.map((item) => item.sourceSpan);
  const gaps: PropositionCoverageGap[] = [];
  let sentenceCount = 0;
  let segmentCount = 0;
  let coveredSegments = 0;

  for (const paragraph of splitParagraphs(sourceText)) {
    for (const sentence of paragraph.sentences) {
      sentenceCount += 1;
      const parts = sentence.text.split(";");
      let cursor = sentence.start;
      parts.forEach((part, partIndex) => {
        const leading = part.search(/\S/u);
        if (leading < 0) {
          cursor += part.length + (partIndex < parts.length - 1 ? 1 : 0);
          return;
        }
        const trimmed = part.trimEnd().replace(/[.!?…]+$/u, "").trimEnd();
        const start = cursor + leading;
        const end = cursor + trimmed.length;
        if (end <= start) {
          cursor += part.length + (partIndex < parts.length - 1 ? 1 : 0);
          return;
        }
        const segment = sourceText.slice(start, end);
        if (!/\p{L}|\p{N}/u.test(segment)) {
          cursor += part.length + (partIndex < parts.length - 1 ? 1 : 0);
          return;
        }
        segmentCount += 1;
        const covered = spans.some((span) => span.start < end && span.end > start);
        if (covered) {
          coveredSegments += 1;
        } else {
          gaps.push({
            sentenceIndex: sentenceCount,
            segmentIndex: partIndex + 1,
            sourceSpan: { start, end, text: segment },
            sentenceText: sentence.text,
          });
        }
        cursor += part.length + (partIndex < parts.length - 1 ? 1 : 0);
      });
    }
  }

  return {
    covered: gaps.length === 0,
    sentenceCount,
    segmentCount,
    coveredSegments,
    gaps,
  };
}
