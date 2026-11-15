import type { FactInventory, Proposition } from "../types";
import { buildFactInventory, type FactInventoryOptions } from "./factInventory";
import { validatePropositionExtraction } from "./propositionSchema";

export interface InventoryBuildResult {
  valid: boolean;
  inventory?: FactInventory;
  errors: string[];
}

/**
 * Creates the canonical source inventory from literal anchors and a separately
 * extracted proposition array. The original source string is fingerprinted
 * once and remains the baseline for every later candidate.
 */
export function buildSemanticInventory(
  sourceText: string,
  extractedPropositions: unknown,
  options: FactInventoryOptions = {},
): InventoryBuildResult {
  const extracted = validatePropositionExtraction(sourceText, extractedPropositions);
  if (!extracted.valid) {
    return { valid: false, errors: extracted.errors };
  }

  const literalInventory = buildFactInventory(sourceText, options);
  const inventory: FactInventory = {
    ...literalInventory,
    propositions: extracted.propositions as Proposition[],
  };

  return { valid: true, inventory, errors: [] };
}
