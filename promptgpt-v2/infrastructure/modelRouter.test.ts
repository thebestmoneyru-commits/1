import { ModelRouter, classifyModelError, type ModelDefinition, type ModelInvocation, type ModelAdapter } from "./modelRouter";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Model router self-test failed: ${message}`);
}
const models: ModelDefinition[] = [
  { id: "primary", tasks: ["candidate-generation", "general"], enabled: true, maxConcurrency: 1, supportsJsonSchema: true, supportsThinking: true, supportsSampling: true, priority: 1 },
  { id: "fallback", tasks: ["candidate-generation", "general"], enabled: true, maxConcurrency: 2, supportsJsonSchema: false, supportsThinking: false, supportsSampling: false, priority: 2 },
];

export async function runModelRouterSelfTests(): Promise<{ passed: number; names: string[] }> {
  const names: string[] = [];

  assert(classifyModelError({ status: 429, message: "too many requests" }) === "rate-limit", "429 maps to rate limit");
  assert(classifyModelError(new Error("API_KEY_INVALID")) === "invalid-auth", "invalid key is terminal auth error");
  assert(classifyModelError(new Error("RESOURCE_EXHAUSTED quota")) === "quota-exhausted", "quota is distinguished from transient rate limiting");
  names.push("provider error classification");

  let active = 0, maxActive = 0;
  const adapter: ModelAdapter = {
    async invoke(request: ModelInvocation) {
      active++; maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 8));
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
  names.push("global per-model concurrency cap");

  const fallbackRouter = new ModelRouter({
    models,
    maxAttemptsPerModel: 1,
    cooldownMs: { "rate-limit": 10000 },
    adapter: { async invoke(request) {
      if (request.modelId === "primary") throw { status: 429, message: "rate limit" };
      return "fallback-result";
    } },
  });
  const fallback = await fallbackRouter.generate({
    task: "candidate-generation", preferredModel: "primary", fallbackModels: ["fallback"], prompt: "test",
  });
  assert(fallback.usedModel === "fallback" && fallback.fallbackOccurred, "rate-limited primary falls back to next eligible model");
  assert(fallbackRouter.getModelStatus().find((item) => item.modelId === "primary")!.cooldownUntil > 0,
    "rate-limited model enters cooldown");
  names.push("fallback and cooldown");

  let fallbackInvoked = false;
  const authRouter = new ModelRouter({
    models, maxAttemptsPerModel: 1,
    adapter: { async invoke(request) {
      if (request.modelId === "primary") throw new Error("API_KEY_INVALID");
      fallbackInvoked = true; return "should-not-run";
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
  }).then(() => false).catch(() => true);
  assert(taskGuard, "model not approved for task is never called");
  names.push("task capability guard");

  return { passed: names.length, names };
}
