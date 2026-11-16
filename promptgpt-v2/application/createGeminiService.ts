import { GoogleGenAI } from "@google/genai";
import { GeminiModelAdapter } from "../infrastructure/geminiAdapter";
import { ModelRouter, type ModelRouterOptions } from "../infrastructure/modelRouter";
import { validateModelCatalog, type ModelCatalogConfig } from "./modelCatalog";
import { createRouterAdapters, type ModelInvocationTelemetry } from "./routerAdapters";
import { StyleTransferService, type StyleTransferServiceDependencies } from "./styleTransferService";

export interface GeminiStyleTransferServiceConfig {
  apiKey: string;
  catalog: ModelCatalogConfig;
  router?: Omit<ModelRouterOptions, "models" | "adapter">;
  styleProfiler: StyleTransferServiceDependencies["styleProfiler"];
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
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });
  const adapter = new GeminiModelAdapter(client);
  const router = new ModelRouter({
    ...config.router,
    models: catalog.models,
    adapter,
  });
  const telemetryBySignal = new WeakMap<AbortSignal, ModelInvocationTelemetry[]>();
  const routed = createRouterAdapters(router, catalog.routes, {
    onModelResult(telemetry) {
      if (!telemetry.signal) return;
      const list = telemetryBySignal.get(telemetry.signal) ?? [];
      list.push(telemetry);
      telemetryBySignal.set(telemetry.signal, list);
    },
  });
  const service = new StyleTransferService({
    ...routed,
    styleProfiler: config.styleProfiler,
    drainModelTelemetry(signal) {
      const list = telemetryBySignal.get(signal) ?? [];
      telemetryBySignal.delete(signal);
      return list;
    },
  });
  return { service, router };
}
