import express, { type RequestHandler } from "express";
import { ModelRouterError } from "../infrastructure/modelRouter";
import { createStyleTransferApiRouter } from "./styleTransferRouter";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function runStyleTransferApiSelfTests(): Promise<{ passed: number; names: string[] }> {
  const names: string[] = [];
  let prepareCalls = 0;
  let executeCalls = 0;
  let prepareMode: "ok" | "rate-limit" | "preparation-error" = "ok";
  const authenticate: RequestHandler = (req, res, next) => {
    if (req.header("x-test-auth") !== "allowed") return res.status(401).json({ error: "unauthorized" });
    next();
  };
  let rateLimitCalls = 0;
  const rateLimit: RequestHandler = (_req, _res, next) => { rateLimitCalls++; next(); };
  const service = {
    async execute(request: { requestId: string; sourceText: string; signal?: AbortSignal }) {
      executeCalls++;
      return {
        requestId: request.requestId,
        status: "accepted" as const,
        selectedText: request.sourceText,
      };
    },
  };
  const router = createStyleTransferApiRouter({
    service: service as never,
    authenticate,
    rateLimit,
    prepareRequest: async () => {
      prepareCalls++;
      if (prepareMode === "rate-limit") {
        throw new ModelRouterError("Quota exceeded on model", "rate-limit", "gemini-3.1-flash-lite");
      }
      if (prepareMode === "preparation-error") {
        throw new Error("Semantic extraction failed source-bound validation.");
      }
      return {
        inventory: {} as never,
        donorBaseline: {} as never,
      };
    },
    maxSourceCharacters: 100,
    maxDonorCharacters: 100,
  });
  const app = express();
  app.use("/api/v2/style-transfer", router);
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind to an ephemeral TCP port.");
  const base = `http://127.0.0.1:${address.port}/api/v2/style-transfer`;

  try {
    const unauthorized = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceText: "Исходный текст", donorText: "Текст автора" }),
    });
    assert(unauthorized.status === 401, "authentication middleware must reject unauthenticated requests");
    assert(prepareCalls === 0 && executeCalls === 0 && rateLimitCalls === 0, "unauthenticated requests must not reach rate limiter, preparation or service");
    names.push("enforce host authentication before processing");

    const invalid = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-auth": "allowed" },
      body: JSON.stringify({ sourceText: "", donorText: "Текст автора" }),
    });
    assert(invalid.status === 400, "empty source text must be rejected");
    assert(prepareCalls === 0, "invalid payload must not reach server-side preparation");
    names.push("reject invalid request payload before model preparation");

    const oversized = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-auth": "allowed" },
      body: JSON.stringify({ sourceText: "x".repeat(101), donorText: "Текст автора ".repeat(20) }),
    });
    assert(oversized.status === 200, "source and donor text beyond legacy configured limits must still be processed");
    assert(prepareCalls === 1 && executeCalls === 1, "large text must reach preparation and service");
    names.push("ignore legacy per-field text caps");

    const malformed = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-auth": "allowed" },
      body: "{broken",
    });
    assert(malformed.status === 400, "malformed JSON must return a structured 400 response");
    names.push("normalize malformed JSON errors");

    const rateLimitBeforeValid = rateLimitCalls;
    const valid = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-auth": "allowed" },
      body: JSON.stringify({ requestId: "rate-limited-test", sourceText: "Исходный текст", donorText: "Текст автора" }),
    });
    assert(valid.status === 200, "valid authenticated request must reach the service");
    assert(rateLimitCalls === rateLimitBeforeValid + 1, "authenticated requests must pass through the host rate limiter");
    assert(Number(prepareCalls) === 1 && Number(executeCalls) === 1, "valid request must be prepared and executed exactly once");
    names.push("apply host rate limiting before preparation and execution");

    prepareMode = "rate-limit";
    const upstreamRateLimited = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-auth": "allowed" },
      body: JSON.stringify({ sourceText: "Исходный текст", donorText: "Текст автора" }),
    });
    const rateLimitBody = await upstreamRateLimited.json() as { error?: { code?: string; message?: string } };
    assert(
      upstreamRateLimited.status === 429 && rateLimitBody.error?.code === "RATE_LIMITED_UPSTREAM",
      "upstream ModelRouterError(rate-limit) must surface HTTP 429 instead of opaque 500",
    );

    prepareMode = "preparation-error";
    const prepRejected = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-auth": "allowed" },
      body: JSON.stringify({ sourceText: "Исходный текст", donorText: "Текст автора" }),
    });
    const prepBody = await prepRejected.json() as { error?: { code?: string; message?: string } };
    assert(
      prepRejected.status === 422 &&
      prepBody.error?.code === "PREPARATION_FAILED" &&
      (prepBody.error?.message ?? "").includes("Semantic extraction failed"),
      "semantic preparation failures must surface HTTP 422 with concrete reason",
    );
    names.push("classify upstream model and preparation errors cleanly");

    return { passed: names.length, names };
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}
