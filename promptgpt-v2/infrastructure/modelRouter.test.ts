import { ModelRouter, classifyModelError, type ModelDefinition, type ModelInvocation, type ModelAdapter } from "./modelRouter";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Model router self-test failed: ${message}`);
}

const models: ModelDefinition[] = [
  { id: "primary", tasks: ["candidate-generation", "general"], enabled: true, maxConcurrency: 1, supportsJsonSchema: true, supportsThinking: true, supportsSampling: true },
  { id: "fallback", tasks: ["candidate-generation", "general"], enabled: true, maxConcurrency: 2, supportsJsonSchema: false, supportsThinking: false, supportsSampling: false },
];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runModelRouterSelfTests(): Promise<{ passed: number; names: string[] }> {
  const names: string[] = [];

  assert(classifyModelError({ status: 429, message: "too many requests" }) === "rate-limit", "429 maps to rate limit");
  assert(classifyModelError(new Error("API_KEY_INVALID")) === "invalid-auth", "invalid key is terminal auth error");
  assert(classifyModelError(new Error("RESOURCE_EXHAUSTED")) === "rate-limit", "generic RESOURCE_EXHAUSTED is treated as a short-window rate limit");
  assert(classifyModelError({ status: 429, message: "RESOURCE_EXHAUSTED: GenerateRequestsPerDay" }) === "quota-exhausted",
    "explicit per-day quota exhaustion is distinguished from a transient rate limit");
  assert(classifyModelError({ status: 429, message: 'RESOURCE_EXHAUSTED, retryDelay: "34s"' }) === "rate-limit",
    "retryDelay metadata does not turn a rate limit into a daily quota");
  const sdkAbort = new Error("This operation was aborted");
  sdkAbort.name = "AbortError";
  assert(classifyModelError(sdkAbort) === "timeout", "SDK AbortError caused by the router timeout is classified as retryable timeout");
  assert(classifyModelError(new Error("The operation was aborted")) === "timeout", "fetch abort message is classified as timeout");
  names.push("provider error classification and quota distinction");

  let active = 0, maxActive = 0;
  const adapter: ModelAdapter = {
    async invoke(request: ModelInvocation) {
      active++;
      maxActive = Math.max(maxActive, active);
      await delay(8);
      active--;
      return request.modelId + ":" + request.prompt;
    },
  };
  const router = new ModelRouter({ models, adapter, maxAttemptsPerModel: 1 });
  const results = await Promise.all([1, 2, 3, 4].map((n) =>
    router.generate({ task: "candidate-generation", preferredModel: "primary", prompt: String(n) })
  ));
  assert(maxActive === 1, "per-model concurrency limit is enforced under parallel calls");
  assert(results.length === 4 && results.every((item) => item.usedModel === "primary"), "queued calls all complete");
  names.push("router-wide per-model concurrency cap");

  let quotaPrimaryCalls = 0;
  const fallbackRouter = new ModelRouter({
    models,
    maxAttemptsPerModel: 3,
    cooldownMs: { "rate-limit": 10_000 },
    adapter: { async invoke(request) {
      if (request.modelId === "primary") {
        quotaPrimaryCalls++;
        throw { status: 429, message: "RESOURCE_EXHAUSTED" };
      }
      return "fallback-result";
    } },
  });
  const fallback = await fallbackRouter.generate({
    task: "candidate-generation", preferredModel: "primary", fallbackModels: ["fallback"], prompt: "test",
  });
  assert(fallback.usedModel === "fallback" && fallback.fallbackOccurred && quotaPrimaryCalls === 1,
    "rate-limited primary falls back immediately without retrying the exhausted model");
  assert(fallbackRouter.getModelStatus().find((item) => item.modelId === "primary")!.cooldownUntil > 0,
    "rate-limited model enters cooldown after fallback");
  names.push("fallback and rate-limit cooldown");

  let transientCalls = 0;
  const retryRouter = new ModelRouter({
    models,
    maxAttemptsPerModel: 3,
    adapter: { async invoke() {
      transientCalls++;
      if (transientCalls < 3) throw { status: 503, message: "service unavailable" };
      return "recovered";
    } },
  });
  const recovered = await retryRouter.generate({
    task: "candidate-generation", preferredModel: "primary", prompt: "retry",
  });
  assert(recovered.text === "recovered" && transientCalls === 3 && recovered.attempts.length === 3,
    "503 UNAVAILABLE is retried up to three total attempts with bounded backoff");
  names.push("three-attempt transient 503 recovery");

  let retryAttemptStarted = false;
  let firstAttempt = true;
  const releaseBeforeBackoffRouter = new ModelRouter({
    models: [models[0]],
    maxAttemptsPerModel: 2,
    adapter: { async invoke(request) {
      if (request.prompt === "retry-owner" && firstAttempt) {
        firstAttempt = false;
        throw { status: 503, message: "UNAVAILABLE" };
      }
      if (request.prompt === "retry-owner") retryAttemptStarted = true;
      return request.prompt;
    } },
  });
  const retryOwner = releaseBeforeBackoffRouter.generate({
    task: "candidate-generation", preferredModel: "primary", prompt: "retry-owner",
  });
  await delay(30);
  const intervening = await releaseBeforeBackoffRouter.generate({
    task: "candidate-generation", preferredModel: "primary", prompt: "intervening", timeoutMs: 500,
  });
  assert(intervening.text === "intervening" && !retryAttemptStarted,
    "the concurrency slot is released during retry backoff so queued work is not blocked");
  await retryOwner;
  names.push("release concurrency slot before retry backoff");

  const queueRouter = new ModelRouter({
    models: [models[0]],
    maxAttemptsPerModel: 1,
    adapter: { async invoke(request) {
      await delay(request.prompt === "slow" ? 120 : 10);
      return request.prompt;
    } },
  });
  const slow = queueRouter.generate({
    task: "candidate-generation", preferredModel: "primary", prompt: "slow", timeoutMs: 1_000,
  });
  await delay(10);
  const queued = queueRouter.generate({
    task: "candidate-generation", preferredModel: "primary", prompt: "queued", timeoutMs: 50,
  });
  const [slowResult, queuedResult] = await Promise.all([slow, queued]);
  assert(slowResult.text === "slow" && queuedResult.text === "queued",
    "provider timeout starts after queue acquisition, not while waiting for a slot");
  names.push("queue wait does not consume provider timeout");

  let fallbackInvoked = false;
  const authRouter = new ModelRouter({
    models, maxAttemptsPerModel: 1,
    adapter: { async invoke(request) {
      if (request.modelId === "primary") throw new Error("API_KEY_INVALID");
      fallbackInvoked = true;
      return "should-not-run";
    } },
  });
  const authFailed = await authRouter.generate({
    task: "candidate-generation", preferredModel: "primary", fallbackModels: ["fallback"], prompt: "test",
  }).then(() => false).catch(() => true);
  assert(authFailed && !fallbackInvoked, "invalid credentials do not trigger pointless model fallback");
  names.push("terminal authentication failure");

  const taskRouter = new ModelRouter({
    models: [{ ...models[0], tasks: ["semantic-verification"] }],
    adapter: { async invoke() { return "unexpected"; } },
  });
  const taskGuard = await taskRouter.generate({
    task: "candidate-generation", preferredModel: "primary", prompt: "test",
  }).then(() => false).catch((error) => error?.kind === "no-eligible-model");
  assert(taskGuard, "model not approved for task returns a typed no-eligible-model error and is never called");
  names.push("typed no-eligible-model error");

  let primaryCalls = 0;
  const unsupportedRouter = new ModelRouter({
    models, maxAttemptsPerModel: 3,
    adapter: { async invoke(request) {
      if (request.modelId === "primary") {
        primaryCalls++;
        throw { status: 404, message: "model not found" };
      }
      return "fallback-after-404";
    } },
  });
  const unsupportedFallback = await unsupportedRouter.generate({
    task: "candidate-generation", preferredModel: "primary", fallbackModels: ["fallback"], prompt: "test",
  });
  assert(primaryCalls === 1 && unsupportedFallback.usedModel === "fallback",
    "unsupported model skips repeated retries and moves to fallback");
  names.push("unsupported model fallback without retry storm");

  let observedCapabilities: ModelInvocation | undefined;
  const capabilityRouter = new ModelRouter({
    models: [{ ...models[1], supportsJsonSchema: false, supportsThinking: false, supportsSampling: false }],
    adapter: { async invoke(request) { observedCapabilities = request; return "ok"; } },
  });
  await capabilityRouter.generate({
    task: "candidate-generation", preferredModel: "fallback", prompt: "test",
    responseSchema: { type: "object" }, thinking: "high", sampling: { temperature: 0.8 },
  });
  assert(observedCapabilities?.responseSchema === undefined &&
    observedCapabilities?.thinking === undefined && observedCapabilities?.sampling === undefined,
    "unsupported model capabilities are stripped before provider call");
  names.push("model capability filtering");

  return { passed: names.length, names };
}
