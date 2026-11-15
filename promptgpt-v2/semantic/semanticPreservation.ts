import type {
  AnchorCheck, FactInventory, PropositionAssessment, SemanticIssue, SemanticPolicy, SemanticReport,
} from "../types";
import { DEFAULT_SEMANTIC_POLICY } from "../types";
import { fingerprintSource } from "./factInventory";
import { verifyPropositionAssessments } from "./propositionIntegrity";

export const SEMANTIC_VERIFICATION_VERSION = "2.0.1";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
function countWholePhrase(text: string, phrase: string): number {
  const value = phrase.trim();
  if (!value) return 0;
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}_])${escapeRegExp(value)}(?![\\p{L}\\p{N}_])`,
    "giu",
  );
  return [...text.matchAll(pattern)].length;
}
export interface SemanticPreservationInput {
  sourceText: string;
  outputText: string;
  inventory: FactInventory;
  propositionAssessments?: readonly PropositionAssessment[];
  policy?: SemanticPolicy;
}

/**
 * A deterministic admissibility gate, not proof of semantic equivalence.
 * Proposition assessments must come from an independent verifier comparing
 * the candidate to the immutable original source.
 */
export function evaluateSemanticPreservation(input: SemanticPreservationInput): SemanticReport {
  const {
    sourceText, outputText, inventory,
    propositionAssessments = [],
    policy = DEFAULT_SEMANTIC_POLICY,
  } = input;
  const issues: SemanticIssue[] = [];
  const anchorChecks: AnchorCheck[] = [];

  for (const anchor of inventory.anchors) {
    const occurrences = countWholePhrase(outputText, anchor.value);
    const status = occurrences === 0 ? "missing" : occurrences === 1 ? "found" : "ambiguous";
    anchorChecks.push({ anchorId: anchor.id, status, matchedText: occurrences > 0 ? anchor.value : undefined, occurrences });

    if (anchor.required && occurrences === 0) {
      issues.push({
        code: "MISSING_REQUIRED_ANCHOR", severity: "error", anchorId: anchor.id,
        message: `Не сохранён обязательный элемент исходника: «${anchor.value}».`,
      });
    } else if (anchor.required && occurrences > 1 && policy.rejectAmbiguousRequiredAnchors) {
      issues.push({
        code: "AMBIGUOUS_ANCHOR",
        severity: "error",
        anchorId: anchor.id,
        message: `Обязательный элемент «${anchor.value}» встречается несколько раз; требуется контекстная проверка.`,
      });
    }
  }

  const propositionResult = verifyPropositionAssessments(inventory.propositions, propositionAssessments, policy);
  issues.push(...propositionResult.issues);

  if (
    inventory.sourceLength !== sourceText.length ||
    inventory.sourceFingerprint !== fingerprintSource(sourceText)
  ) {
    issues.push({
      code: "SOURCE_INVENTORY_INCOMPLETE", severity: "error",
      message: "Инвентарь не соответствует точному исходному тексту. Пересоздайте его по неизменённому оригиналу.",
    });
  }

  const requiredAnchors = inventory.anchors.filter((anchor) => anchor.required);
  const requiredAnchorsFound = anchorChecks.filter((check) => {
    const anchor = inventory.anchors.find((item) => item.id === check.anchorId);
    return anchor?.required && check.status === "found";
  }).length;

  return {
    passed: !issues.some((issue) => issue.severity === "error"),
    sourceLength: sourceText.length,
    outputLength: outputText.length,
    anchorChecks,
    propositionAssessments: propositionResult.assessments,
    issues,
    requiredAnchorsFound,
    requiredAnchorsTotal: requiredAnchors.length,
    mandatoryPropositionsPreserved: propositionResult.preservedMandatory,
    mandatoryPropositionsTotal: propositionResult.totalMandatory,
    verificationVersion: SEMANTIC_VERIFICATION_VERSION,
  };
}
