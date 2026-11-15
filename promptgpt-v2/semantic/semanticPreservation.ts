import type {
  AnchorCheck,
  FactInventory,
  SemanticIssue,
  SemanticPolicy,
  SemanticReport,
} from "../types";
import { DEFAULT_SEMANTIC_POLICY } from "../types";
import { verifyPropositionAssessments } from "./propositionIntegrity";

export const SEMANTIC_VERIFICATION_VERSION = "2.0.0";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function countWholePhrase(text: string, phrase: string): number {
  const normalizedPhrase = phrase.trim();
  if (!normalizedPhrase) return 0;

  // Exact phrase with Unicode-aware token boundaries. This prevents "19"
  // from being treated as present merely because the output contains "191".
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}_])${escapeRegExp(normalizedPhrase)}(?![\\p{L}\\p{N}_])`,
    "giu",
  );
  return [...text.matchAll(pattern)].length;
}

export interface SemanticPreservationInput {
  sourceText: string;
  outputText: string;
  inventory: FactInventory;
  propositionAssessments?: readonly import("../types").PropositionAssessment[];
  policy?: SemanticPolicy;
}

/**
 * Deterministic gate for literal anchors plus separately supplied proposition
 * assessments. A pass means "no detected blocker under this policy"; it is
 * not a mathematical proof of semantic equivalence.
 */
export function evaluateSemanticPreservation(
  input: SemanticPreservationInput,
): SemanticReport {
  const {
    sourceText,
    outputText,
    inventory,
    propositionAssessments = [],
    policy = DEFAULT_SEMANTIC_POLICY,
  } = input;

  const issues: SemanticIssue[] = [];
  const anchorChecks: AnchorCheck[] = [];

  for (const anchor of inventory.anchors) {
    const occurrences = countWholePhrase(outputText, anchor.value);
    const status =
      occurrences === 0
        ? "missing"
        : occurrences === 1
          ? "found"
          : "ambiguous";

    anchorChecks.push({
      anchorId: anchor.id,
      status,
      matchedText: occurrences > 0 ? anchor.value : undefined,
      occurrences,
    });

    if (anchor.required && occurrences === 0) {
      issues.push({
        code: "MISSING_REQUIRED_ANCHOR",
        severity: "error",
        anchorId: anchor.id,
        message: `Не сохранён обязательный элемент исходника: «${anchor.value}».`,
      });
    } else if (
      anchor.required &&
      occurrences > 1 &&
      policy.rejectAmbiguousRequiredAnchors
    ) {
      issues.push({
        code: "AMBIGUOUS_ANCHOR",
        severity: "warning",
        anchorId: anchor.id,
        message: `Обязательный элемент «${anchor.value}» встречается в результате несколько раз; требуется проверка контекста.`,
      });
    }
  }

  const propositionResult = verifyPropositionAssessments(
    inventory.propositions,
    propositionAssessments,
    policy,
  );
  issues.push(...propositionResult.issues);

  if (inventory.sourceLength !== sourceText.length) {
    issues.push({
      code: "SOURCE_INVENTORY_INCOMPLETE",
      severity: "error",
      message:
        "Инвентарь создан для текста другой длины. Пересоздайте его по неизменённому исходнику.",
    });
  }

  const requiredAnchors = inventory.anchors.filter((anchor) => anchor.required);
  const requiredAnchorsFound = anchorChecks.filter((check) => {
    const anchor = inventory.anchors.find((item) => item.id === check.anchorId);
    return anchor?.required && check.status === "found";
  }).length;

  const passed = !issues.some((issue) => issue.severity === "error");

  return {
    passed,
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
