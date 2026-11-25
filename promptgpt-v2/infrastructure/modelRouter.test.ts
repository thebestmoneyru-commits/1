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
  assert(classifyModelError(new Error("This model is currently experiencing high demand. Spikes in demand are usually temporary.")) === "unavailable", "high demand transient message is classified as unavailable");
  assert(
    classifyModelError({
      status: 429,
      message: 'You exceeded your current quota, please check your plan and billing details. GenerateRequestsPerMinutePerProjectPerModel-FreeTier, limit: 15, "retryDelay":"8s"',
    }) === "rate-limit",
    "Google 15-RPM per-minute 429 message containing 'quota' and short retryDelay must classify as transient rate-limit, not daily quota exhaustion",
  );
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

  let nowMs = 1_000_000;
  let dailyPrimaryCalls = 0;
  const dailyQuotaRouter = new ModelRouter({
    models,
    maxAttemptsPerModel: 3,
    now: () => nowMs,
    adapter: { async invoke(request) {
      if (request.modelId === "primary") {
        dailyPrimaryCalls++;
        throw { status: 429, message: 'RESOURCE_EXHAUSTED GenerateRequestsPerDayPerProjectPerModel-FreeTier "retryDelay":"55624s"' };
      }
      return "fallback-ok";
    } },
  });
  const firstDaily = await dailyQuotaRouter.generate({
    task: "candidate-generation", preferredModel: "primary", fallbackModels: ["fallback"], prompt: "test-1",
  });
  nowMs += 10 * 60_000; // 10 minutes later, still within 1h bounded daily cooldown
  const secondDaily = await dailyQuotaRouter.generate({
    task: "candidate-generation", preferredModel: "primary", fallbackModels: ["fallback"], prompt: "test-2",
  });
  assert(
    firstDaily.usedModel === "fallback" && secondDaily.usedModel === "fallback" && dailyPrimaryCalls === 1,
    "daily-quota exhausted primary respects bounded retryDelay cooldown and routes straight to fallback",
  );
  names.push("daily quota retryDelay cooldown and fallback");

  let capNowMs = 2_000_000;
  let capPrimaryCalls = 0;
  const cappedCooldownRouter = new ModelRouter({
    models,
    maxAttemptsPerModel: 1,
    maxCooldownMs: { "quota-exhausted": 60_000 },
    now: () => capNowMs,
    adapter: {
      async invoke(request) {
        if (request.modelId === "primary") {
          capPrimaryCalls++;
          if (capPrimaryCalls === 1) {
            throw { status: 429, message: 'RESOURCE_EXHAUSTED GenerateRequestsPerDay "retryDelay":"55624s"' };
          }
          return "recovered-after-cap";
        }
        return "fallback-cap";
      },
    },
  });
  const firstCap = await cappedCooldownRouter.generate({
    task: "candidate-generation", preferredModel: "primary", fallbackModels: ["fallback"], prompt: "cap-1",
  });
  capNowMs += 65_000;
  const secondCap = await cappedCooldownRouter.generate({
    task: "candidate-generation", preferredModel: "primary", fallbackModels: ["fallback"], prompt: "cap-2",
  });
  assert(
    firstCap.usedModel === "fallback" && secondCap.usedModel === "primary" && secondCap.text === "recovered-after-cap",
    "maxCooldownMs must cap provider cooldown duration so primary recovers after bounded wait",
  );
  names.push("maxCooldownMs bounds cooldown durations");

  let rateRecoverCalls = 0;
  const shortRateRecoveryRouter = new ModelRouter({
    models,
    maxAttemptsPerModel: 1,
    cooldownMs: { "rate-limit": 20, "quota-exhausted": 60_000 },
    adapter: {
      async invoke(request) {
        if (request.modelId === "primary") {
          rateRecoverCalls++;
          if (rateRecoverCalls === 1) {
            throw { status: 429, message: 'RESOURCE_EXHAUSTED GenerateRequestsPerMinute, "retryDelay":"0.02s"' };
          }
          return "recovered-from-rpm";
        }
        throw { status: 429, message: 'RESOURCE_EXHAUSTED GenerateRequestsPerDay, "retryDelay":"55000s"' };
      },
    },
  });
  const rpmRecovered = await shortRateRecoveryRouter.generate({
    task: "candidate-generation", preferredModel: "primary", fallbackModels: ["fallback"], prompt: "rpm-recover",
  });
  assert(
    rpmRecovered.usedModel === "primary" && rpmRecovered.text === "recovered-from-rpm" && rateRecoverCalls === 2,
    "short RPM rate limit must recover on primary when fallback is daily-exhausted instead of surfacing fallback error",
  );
  names.push("short rate-limit recovery when fallback is daily-exhausted");

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

  let fourCalls = 0;
  const fourAttemptRouter = new ModelRouter({
    models,
    maxAttemptsPerModel: 4,
    retryDelays: { unavailable: [10, 10, 10] },
    adapter: {
      async invoke() {
        fourCalls++;
        if (fourCalls < 4) throw { status: 503, message: "high demand" };
        return "recovered-4";
      },
    },
  });
  const recovered4 = await fourAttemptRouter.generate({
    task: "candidate-generation", preferredModel: "primary", prompt: "retry-4",
  });
  assert(recovered4.text === "recovered-4" && fourCalls === 4 && recovered4.attempts.length === 4,
    "configured maxAttemptsPerModel: 4 with custom retryDelays must support 4-attempt recovery");
  names.push("four-attempt custom retryDelays recovery");

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

  const abortMessageRouter = new ModelRouter({
    models: [models[0]],
    maxAttemptsPerModel: 1,
    adapter: {
      async invoke() {
        const err = new Error("This operation was aborted");
        err.name = "AbortError";
        throw err;
      },
    },
  });
  let normalizedTimeoutError: unknown;
  try {
    await abortMessageRouter.generate({
      task: "candidate-generation",
      preferredModel: "primary",
      prompt: "test-timeout-message",
      timeoutMs: 120,
    });
  } catch (error) {
    normalizedTimeoutError = error;
  }
  assert(
    normalizedTimeoutError instanceof Error &&
    (normalizedTimeoutError as { kind?: string }).kind === "timeout" &&
    normalizedTimeoutError.message.includes("Model request timed out after 120ms (primary)"),
    "exhausted SDK AbortError must emit a descriptive timeout message instead of opaque 'This operation was aborted'",
  );
  names.push("descriptive timeout message for exhausted SDK abort errors");

  return { passed: names.length, names };
}
