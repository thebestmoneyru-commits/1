import type { ModelDefinition, ModelTask } from "../infrastructure/modelRouter";
import type { ApplicationModelRoutes } from "./applicationTypes";

export interface ModelCatalogConfig {
  models: readonly ModelDefinition[];
  routes: ApplicationModelRoutes;
}

const ROUTE_TASKS: ReadonlyArray<[keyof ApplicationModelRoutes, ModelTask]> = [
  ["candidateGeneration", "candidate-generation"],
  ["styleCritique", "style-critique"],
  ["surgicalRepair", "surgical-repair"],
  ["semanticVerification", "semantic-verification"],\n  ["semanticExtraction", "semantic-extraction"],
];

/**
 * Validates an explicit deployment-supplied model allowlist and its task routes.
 * No provider model IDs are silently assumed or invented by this module.
 */
export function validateModelCatalog(config: ModelCatalogConfig): ModelCatalogConfig {
  if (!config || !Array.isArray(config.models) || config.models.length === 0) {
    throw new Error("Model catalog must contain at least one explicitly configured model.");
  }
  const ids = new Set<string>();
  for (const model of config.models) {
    if (!model.id.trim() || ids.has(model.id)) throw new Error("Model catalog contains an empty or duplicate model ID.");
    ids.add(model.id);
    if (!Number.isInteger(model.maxConcurrency) || model.maxConcurrency < 1) {
      throw new Error(`Invalid maxConcurrency for model ${model.id}.`);
    }
  }
  for (const [routeName, task] of ROUTE_TASKS) {
    const route = config.routes?.[routeName];
    if (!route || !route.preferredModel?.trim()) {
      throw new Error(`Missing preferred model for route ${routeName}.`);
    }
    const routeIds = [route.preferredModel, ...(route.fallbackModels ?? [])];
    for (const id of routeIds) {
      const model = config.models.find((item) => item.id === id);
      if (!model) throw new Error(`Route ${routeName} references model ${id}, which is not in the allowlist.`);
      if (!model.enabled) throw new Error(`Route ${routeName} references disabled model ${id}.`);
      if (!model.tasks.includes(task)) {
        throw new Error(`Model ${id} is not enabled for task ${task} required by route ${routeName}.`);
      }
    }
  }
  return config;
}
