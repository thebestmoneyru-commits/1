import type { Proposition } from "../types";

export interface PropositionContradiction {
  firstPropositionId: string;
  secondPropositionId: string;
  firstSourceSpan: { start: number; end: number; text: string };
  secondSourceSpan: { start: number; end: number; text: string };
  subject: string;
  predicate: string;
  object?: string;
  explanation: string;
}

export interface PropositionConsistencyReport {
  contradictions: PropositionContradiction[];
  warnings: string[];
}

function normalize(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("ru-RU");
}

/**
 * Removes only a leading Russian negative particle from a predicate so that
 * polarity is compared in its own dedicated field. This deliberately avoids
 * broad synonym or paraphrase matching.
 */
function normalizePredicate(value: string): string {
  return normalize(value).replace(/^(?:не|ни)\s+/u, "");
}

function qualificationKey(proposition: Proposition): string {
  return proposition.qualifications
    .map((item) => `${item.kind}:${normalize(item.value)}`)
    .sort()
    .join("|");
}

function modalityKey(proposition: Proposition): string {
  const modality = proposition.modality;
  return modality
    ? [modality.kind, normalize(modality.value), normalize(modality.scope)].join("|")
    : "";
}

/**
 * Conservative contradiction screening. It reports only exact lexical matches
 * with opposite explicit polarity and identical object, qualification and
 * modality context. It does not infer synonyms, resolve pronouns or decide
 * whether two events are actually co-referential; callers should treat results
 * as review warnings, not automatic proof that the source is inconsistent.
 */
export function detectPotentialPropositionContradictions(
  propositions: readonly Proposition[],
): PropositionConsistencyReport {
  const contradictions: PropositionContradiction[] = [];

  for (let left = 0; left < propositions.length; left += 1) {
    const first = propositions[left];
    if (first.polarity === "unknown") continue;

    for (let right = left + 1; right < propositions.length; right += 1) {
      const second = propositions[right];
      if (second.polarity === "unknown" || first.polarity === second.polarity) continue;

      const sameClaim =
        normalize(first.subject) === normalize(second.subject) &&
        normalizePredicate(first.predicate) === normalizePredicate(second.predicate) &&
        normalize(first.object) === normalize(second.object) &&
        qualificationKey(first) === qualificationKey(second) &&
        modalityKey(first) === modalityKey(second);

      if (!sameClaim) continue;

      contradictions.push({
        firstPropositionId: first.id,
        secondPropositionId: second.id,
        firstSourceSpan: { ...first.sourceSpan },
        secondSourceSpan: { ...second.sourceSpan },
        subject: first.subject,
        predicate: normalizePredicate(first.predicate),
        object: first.object,
        explanation:
          "Обнаружены лексически совпадающие утверждения с противоположной явной полярностью и одинаковым контекстом; требуется проверить отрицание, атрибуцию и временные различия.",
      });
    }
  }

  return {
    contradictions,
    warnings: contradictions.map((item) =>
      `Возможное противоречие между ${item.firstPropositionId} и ${item.secondPropositionId}: ${item.subject} — ${item.predicate}.`,
    ),
  };
}
