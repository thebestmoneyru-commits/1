import { GoogleGenAI } from "@google/genai";
import { GeminiModelAdapter } from "../infrastructure/geminiAdapter";
import { ModelRouter, type ModelRouterOptions, type ModelTask } from "../infrastructure/modelRouter";
import { validateModelCatalog, type ModelCatalogConfig } from "./modelCatalog";
import { createRouterAdapters } from "./routerAdapters";
import { StyleTransferService, type StyleTransferServiceDependencies } from "./styleTransferService";

export interface GeminiStyleTransferServiceConfig {
  apiKey: string;
  catalog: ModelCatalogConfig;
  router?: Omit<ModelRouterOptions, "models" | "adapter">;
  thinkingByTask?: Partial<Record<ModelTask, "low" | "medium" | "high">>;
  styleProfiler: StyleTransferServiceDependencies["styleProfiler"];
  defaultRequestOptions?: StyleTransferServiceDependencies["defaultRequestOptions"];
}

/**
 * Composition root. Call once during server startup and reuse the returned
 * service; this creates exactly one GoogleGenAI client for the service instance.
 */
export function createGeminiStyleTransferService(config: GeminiStyleTransferServiceConfig): {
  service: StyleTransferService;
  router: ModelRouter;
} {
  if (!config.apiKey.trim()) throw new Error("A Gemini API key is required to construct the v2 service.");
  const catalog = validateModelCatalog(config.catalog);
  const client = new GoogleGenAI({
    apiKey: config.apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
  const adapter = new GeminiModelAdapter(client);
  const router = new ModelRouter({
    ...config.router,
    models: catalog.models,
    adapter,
  });
  const signalUsage = new WeakMap<
    AbortSignal,
    {
      requestedModel?: string;
      usedModel?: string;
      fallbackOccurred: boolean;
      warnings: string[];
    }
  >();
  const routed = createRouterAdapters(router, catalog.routes, {
    thinkingByTask: config.thinkingByTask,
    onTaskOutcome(info) {
      if (!info.signal) return;
      const entry = signalUsage.get(info.signal) ?? { fallbackOccurred: false, warnings: [] };
      if (info.task === "candidate-generation") {
        entry.requestedModel = info.requestedModel;
        entry.usedModel = info.usedModel;
        entry.fallbackOccurred = entry.fallbackOccurred || info.fallbackOccurred;
      }
      if (info.fallbackOccurred) {
        entry.warnings.push(`Этап ${info.task}: автоматический переход с ${info.requestedModel} на ${info.usedModel}.`);
      }
      for (const w of info.warnings) entry.warnings.push(w);
      signalUsage.set(info.signal, entry);
    },
  });
  const service = new StyleTransferService({
    ...routed,
    styleProfiler: config.styleProfiler,
    defaultRequestOptions: config.defaultRequestOptions,
    getSignalDiagnostics(signal) {
      return signal ? signalUsage.get(signal) : undefined;
    },
  });
  return { service, router };
}
