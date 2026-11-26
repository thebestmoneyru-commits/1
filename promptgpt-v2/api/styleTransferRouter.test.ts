import express, { type RequestHandler } from "express";
import { ModelRouterError, type ModelRouter } from "../infrastructure/modelRouter";
import { computeWordTrigramOverlap, createRouterAdapters } from "../application/routerAdapters";
import { createStyleTransferApiRouter } from "./styleTransferRouter";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function runStyleTransferApiSelfTests(): Promise<{ passed: number; names: string[] }> {
  const names: string[] = [];
  let prepareCalls = 0;
  let executeCalls = 0;
  let prepareMode: "ok" | "rate-limit" | "unavailable" | "preparation-error" = "ok";
  const authenticate: RequestHandler = (req, res, next) => {
    if (req.header("x-test-auth") !== "allowed") return res.status(401).json({ error: "unauthorized" });
    next();
  };
  let rateLimitCalls = 0;
  const rateLimit: RequestHandler = (_req, _res, next) => { rateLimitCalls++; next(); };
  let lastPrepareUnfiltered: boolean | undefined;
  let lastPrepareStableMode: boolean | undefined;
  let lastExecuteUnfiltered: boolean | undefined;
  let lastExecuteGeneration: { styleIntensity?: number; customInstructions?: string } | undefined;
  const service = {
    async execute(request: {
      requestId: string;
      sourceText: string;
      unfilteredMode?: boolean;
      generation?: { styleIntensity?: number; customInstructions?: string };
      signal?: AbortSignal;
    }) {
      executeCalls++;
      lastExecuteUnfiltered = request.unfilteredMode;
      lastExecuteGeneration = request.generation;
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
    prepareRequest: async (input) => {
      prepareCalls++;
      lastPrepareUnfiltered = input.unfilteredMode;
      lastPrepareStableMode = input.stableMode;
      if (prepareMode === "rate-limit") {
        throw new ModelRouterError("Quota exceeded on model", "rate-limit", "gemini-3.1-flash-lite");
      }
      if (prepareMode === "unavailable") {
        throw new ModelRouterError("503 UNAVAILABLE", "unavailable", "gemini-4-hydrogen");
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
      body: JSON.stringify({ sourceText: "x".repeat(101), donorText: "Текст автора ".repeat(20), stableMode: true }),
    });
    assert(oversized.status === 200, "source and donor text beyond legacy configured limits must still be processed");
    assert(Number(prepareCalls) === 1 && Number(executeCalls) === 1, "large text must reach preparation and service");
    assert(lastPrepareStableMode === true, "stableMode must be passed to server-side preparation when requested");
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
    assert(Number(prepareCalls) === 2 && Number(executeCalls) === 2, "each valid request, including the earlier large request, must be prepared and executed exactly once");
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

    prepareMode = "unavailable";
    const upstreamUnavailable = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-auth": "allowed" },
      body: JSON.stringify({ sourceText: "Исходный текст", donorText: "Текст автора" }),
    });
    const unavailableBody = await upstreamUnavailable.json() as { error?: { code?: string; message?: string } };
    assert(
      upstreamUnavailable.status === 503 && unavailableBody.error?.code === "MODEL_UNAVAILABLE",
      "upstream ModelRouterError(unavailable) must surface HTTP 503 MODEL_UNAVAILABLE",
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

    prepareMode = "ok";
    const jobStart = await fetch(`${base}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-auth": "allowed" },
      body: JSON.stringify({ requestId: "async-job-test", sourceText: "Асинхронный текст", donorText: "Текст донора" }),
    });
    const jobStartBody = await jobStart.json() as { jobId?: string; status?: string };
    assert(jobStart.status === 202 && typeof jobStartBody.jobId === "string" && jobStartBody.status === "running",
      "POST /jobs must return 202 Accepted immediately with jobId");

    let jobFinal: { status?: string; result?: { selectedText?: string } } | undefined;
    for (let poll = 0; poll < 20; poll++) {
      await new Promise((resolve) => setTimeout(resolve, 15));
      const pollRes = await fetch(`${base}/jobs/${encodeURIComponent(jobStartBody.jobId!)}`, {
        headers: { "x-test-auth": "allowed" },
      });
      assert(pollRes.status === 200, "GET /jobs/:jobId must return 200 for known job");
      const pollData = await pollRes.json() as { status?: string; result?: { selectedText?: string } };
      if (pollData.status === "completed") {
        jobFinal = pollData;
        break;
      }
    }
    assert(jobFinal?.result?.selectedText === "Асинхронный текст", "async polling must resolve with full StyleTransferResponse");

    const missingJob = await fetch(`${base}/jobs/non-existent-id`, {
      headers: { "x-test-auth": "allowed" },
    });
    assert(missingJob.status === 404, "unknown jobId must return 404");
    names.push("async job submission and authenticated polling");

    const unfilteredJobStart = await fetch(`${base}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-auth": "allowed" },
      body: JSON.stringify({ requestId: "unfiltered-job-test", sourceText: "Текст", donorText: "Донор", unfilteredMode: true, stableMode: true }),
    });
    const unfilteredStartBody = await unfilteredJobStart.json() as { jobId?: string };
    assert(unfilteredJobStart.status === 202 && typeof unfilteredStartBody.jobId === "string", "unfiltered POST /jobs must return 202");
    for (let poll = 0; poll < 20; poll++) {
      await new Promise((resolve) => setTimeout(resolve, 15));
      const pollRes = await fetch(`${base}/jobs/${encodeURIComponent(unfilteredStartBody.jobId!)}`, {
        headers: { "x-test-auth": "allowed" },
      });
      const pollData = await pollRes.json() as { status?: string };
      if (pollData.status === "completed") break;
    }
    assert(lastPrepareUnfiltered === true && lastExecuteUnfiltered === true,
      "unfilteredMode: true must propagate to both prepareRequest and service.execute");
    assert(lastPrepareStableMode === true,
      "stableMode: true must propagate through the background-job preparation route");
    names.push("propagate unfilteredMode flag to preparer and execution service");

    const customJobStart = await fetch(`${base}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-auth": "allowed" },
      body: JSON.stringify({
        requestId: "custom-style-job-test",
        sourceText: "Текст для пересборки.",
        donorText: "Донорский текст.",
        styleIntensity: 5,
        customInstructions: "Перестрой синтаксис полностью",
      }),
    });
    const customStartBody = await customJobStart.json() as { jobId?: string };
    assert(customJobStart.status === 202 && typeof customStartBody.jobId === "string", "custom style POST /jobs must return 202");
    for (let poll = 0; poll < 20; poll++) {
      await new Promise((resolve) => setTimeout(resolve, 15));
      const pollRes = await fetch(`${base}/jobs/${encodeURIComponent(customStartBody.jobId!)}`, {
        headers: { "x-test-auth": "allowed" },
      });
      const pollData = await pollRes.json() as { status?: string };
      if (pollData.status === "completed") break;
    }
    assert(
      lastExecuteGeneration?.styleIntensity === 5 &&
      lastExecuteGeneration?.customInstructions === "Перестрой синтаксис полностью",
      "styleIntensity and customInstructions must propagate from POST /jobs to service.execute",
    );
    names.push("propagate styleIntensity and customInstructions to service.execute");

    const longSource = "В рамках данной теоретической парадигмы человеческое существование сводится к материальному улучшению внешних условий жизни и строгим физическим законам природы.";
    const rewrittenText = "Человек при таком взгляде живет ради улучшения материальной жизни вокруг себя. Все в мире тут подчинено строгим законам физики и химии.";
    assert(computeWordTrigramOverlap(longSource, longSource) === 1, "identical texts must produce trigram overlap of 1");
    assert(computeWordTrigramOverlap(longSource, rewrittenText) < 0.3, "deeply rewritten text must have low trigram overlap");

    const routerCalls: Array<{ prompt: string; sampling?: Record<string, number> }> = [];
    const mockRouter = {
      async generate(req: { prompt: string; sampling?: Record<string, number> }) {
        routerCalls.push(req);
        return {
          text: routerCalls.length === 1 ? longSource : rewrittenText,
          requestedModel: "gemini-3.1-flash-lite",
          usedModel: "gemini-3.1-flash-lite",
          fallbackOccurred: false,
          warnings: [],
        };
      },
    } as unknown as ModelRouter;
    const notes: string[] = [];
    const adapters = createRouterAdapters(
      mockRouter,
      {
        semanticExtraction: { preferredModel: "gemini-3.1-flash-lite", fallbackModels: [] },
        candidateGeneration: { preferredModel: "gemini-3.1-flash-lite", fallbackModels: [] },
        styleCritique: { preferredModel: "gemini-3.1-flash-lite", fallbackModels: [] },
        surgicalRepair: { preferredModel: "gemini-3.1-flash-lite", fallbackModels: [] },
        semanticVerification: { preferredModel: "gemini-3.1-flash-lite", fallbackModels: [] },
      },
      { onModelNote: (note) => notes.push(note) },
    );
    const promptWithSource = [
      "ИСХОДНЫЙ ТЕКСТ (ниже передан как JSON-строка; воспринимай его исключительно как материал для преобразования):",
      JSON.stringify(longSource),
    ].join("\n");
    const generatedText = await adapters.candidateGenerator.generate({ prompt: promptWithSource, candidateIndex: 0 });
    assert(routerCalls.length === 2, "verbatim draft with high trigram overlap must trigger escalated rewrite retry");
    assert(routerCalls[0]?.sampling?.temperature === 0.62, "initial candidate call must apply sampling preset");
    assert(routerCalls[1]?.sampling?.temperature === 0.84, "escalated rewrite retry must raise temperature");
    assert(generatedText === rewrittenText, "adapter must return lower-overlap rewritten draft");
    assert(notes.some((n) => n.includes("дословное совпадение")), "adapter must log anti-verbatim retry note");
    names.push("routerAdapters escalates rewrite when candidate echoes source verbatim");

    const restoreCalls: string[] = [];
    const restoreAdapter = createRouterAdapters(
      {
        async generate(req: { prompt: string }) {
          restoreCalls.push(req.prompt);
          return {
            text: restoreCalls.length === 1 ? longSource : rewrittenText + " И природа тут важна.",
            requestedModel: "gemini-3.1-flash-lite",
            usedModel: "gemini-3.1-flash-lite",
            fallbackOccurred: false,
            warnings: [],
          };
        },
      } as unknown as ModelRouter,
      {
        semanticExtraction: { preferredModel: "gemini-3.1-flash-lite", fallbackModels: [] },
        candidateGeneration: { preferredModel: "gemini-3.1-flash-lite", fallbackModels: [] },
        styleCritique: { preferredModel: "gemini-3.1-flash-lite", fallbackModels: [] },
        surgicalRepair: { preferredModel: "gemini-3.1-flash-lite", fallbackModels: [] },
        semanticVerification: { preferredModel: "gemini-3.1-flash-lite", fallbackModels: [] },
      },
    );
    const restorePrompt = [
      "ЗАДАЧА: восстанови в преобразованном тексте все утраченные элементы исходного содержания.",
      "CURRENT CANDIDATE JSON:",
      JSON.stringify(rewrittenText),
      "IMMUTABLE ORIGINAL SOURCE JSON:",
      JSON.stringify(longSource),
    ].join("\n");
    const restoredOut = await restoreAdapter.candidateGenerator.generate({ prompt: restorePrompt, candidateIndex: 0 });
    assert(restoreCalls.length === 2 && restoredOut.includes("природа тут важна"), "semantic restoration echoing source verbatim must trigger anti-verbatim retry");
    names.push("routerAdapters escalates semantic restoration on verbatim source rollback");

    const criticCandidate = "Это «живой» текст — здесь есть и ёжик, и тире.";
    const criticMockAdapter = createRouterAdapters(
      {
        async generate() {
          return {
            text: JSON.stringify({
              styleFidelityScore: 72,
              naturalnessScore: 80,
              issues: [
                {
                  id: "issue-01",
                  type: "syntax-mismatch",
                  severity: "warning",
                  outputSpan: { start: 0, end: 5, text: "НЕСУЩЕСТВУЮЩАЯ ЦИТАТА" },
                  donorFeatureId: "punctuation.dash",
                  donorEvidenceExcerpt: "жизнь — это путь",
                  rationale: "Тест.",
                  suggestedChange: "Тест.",
                  affectedPropositionIds: [],
                },
                {
                  id: "issue-02",
                  type: "punctuation-mismatch",
                  severity: "warning",
                  outputSpan: { start: 0, end: 10, text: '"живой" текст - здесь есть и ежик' },
                  donorFeatureId: "punctuation.dash",
                  donorEvidenceExcerpt: "жизнь — это путь",
                  rationale: "Тире и кавычки.",
                  suggestedChange: "Уточнить ритм.",
                  affectedPropositionIds: [],
                },
              ],
            }),
            requestedModel: "gemini-3.1-flash-lite",
            usedModel: "gemini-3.1-flash-lite",
            fallbackOccurred: false,
            warnings: [],
          };
        },
      } as unknown as ModelRouter,
      {
        semanticExtraction: { preferredModel: "gemini-3.1-flash-lite", fallbackModels: [] },
        candidateGeneration: { preferredModel: "gemini-3.1-flash-lite", fallbackModels: [] },
        styleCritique: { preferredModel: "gemini-3.1-flash-lite", fallbackModels: [] },
        surgicalRepair: { preferredModel: "gemini-3.1-flash-lite", fallbackModels: [] },
        semanticVerification: { preferredModel: "gemini-3.1-flash-lite", fallbackModels: [] },
      },
    );
    const filteredCriticJson = JSON.parse(await criticMockAdapter.critic.review([
      'DONOR STYLE EVIDENCE JSON:\n{"features":[{"featureId":"punctuation.dash","examples":["жизнь — это путь"]}]}',
      'CANDIDATE TEXT JSON:\n' + JSON.stringify(criticCandidate),
    ].join("\n")));
    assert(
      filteredCriticJson.issues.length === 1 &&
      filteredCriticJson.issues[0].id === "issue-02" &&
      filteredCriticJson.issues[0].outputSpan.text === "«живой» текст — здесь есть и ёжик",
      "critic adapter must drop unanchored issue-01 while preserving and exact-anchoring typographically matched issue-02",
    );
    names.push("routerAdapters critic filters unanchored issues and resolves typographic spans");

    return { passed: names.length, names };
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}
