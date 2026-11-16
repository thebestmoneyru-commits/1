import type { RequestHandler, Router } from "express";
import type { ApplicationModelRoutes } from "../application/applicationTypes";
import type { RequestPreparationOptions } from "../application/requestPreparation";
import { createStyleTransferRequestPreparer } from "../application/requestPreparation";
import type { ModelRouter } from "../infrastructure/modelRouter";
import type { StyleTransferService } from "../application/styleTransferService";
import { createStyleTransferApiRouter, type DefaultTransferOptions } from "./styleTransferRouter";

export interface PreparedStyleTransferApiOptions {
  service: StyleTransferService;
  modelRouter: ModelRouter;
  routes: Pick<ApplicationModelRoutes, "semanticExtraction" | "semanticAudit">;
  authenticate: RequestHandler;
  rateLimit: RequestHandler;
  preparation?: RequestPreparationOptions;
  maxSourceCharacters?: number;
  maxDonorCharacters?: number;
  defaultTransferOptions?: DefaultTransferOptions;
  onError?: (error: unknown) => void;
}

/**
 * Composition helper that wires the trusted server-side preparation pipeline
 * into the isolated API router. Authentication and distributed rate limiting
 * remain explicit host-application responsibilities.
 */
export function createPreparedStyleTransferApiRouter(options: PreparedStyleTransferApiOptions): Router {
  const prepareRequest = createStyleTransferRequestPreparer(
    options.modelRouter,
    options.routes,
    options.preparation,
  );
  return createStyleTransferApiRouter({
    service: options.service,
    prepareRequest,
    authenticate: options.authenticate,
    rateLimit: options.rateLimit,
    maxSourceCharacters: options.maxSourceCharacters,
    maxDonorCharacters: options.maxDonorCharacters,
    defaultTransferOptions: options.defaultTransferOptions,
    onError: options.onError,
  });
}
