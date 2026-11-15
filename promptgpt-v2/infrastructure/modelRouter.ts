export type ModelTask =
  | "style-analysis"
  | "candidate-generation"
  | "style-critique"
  | "surgical-repair"
  | "semantic-extraction"
  | "semantic-verification"
  | "general";

export type ModelErrorKind =
  | "rate-limit"
  | "quota-exhausted"
  | "timeout"
  | "queue-timeout"
  | "queue-full"
  | "no-eligible-model"
  | "unavailable"
  | "network"
  | "invalid-auth"
  | "invalid-request"
  | "unsupported-model"
  | "safety-block"
  | "truncated"
  | "empty-response"
  | "unknown"
  | "cancelled";

export interface ModelDefinition {
  id: string;
  tasks: readonly ModelTask[];
  enabled: boolean;
  maxConcurrency: number;
  maxQueueLength?: number;
  supportsJsonSchema: boolean;
  supportsThinking: boolean;
  supportsSampling: boolean;
}

export interface ModelInvocation {
  modelId: string;
  task: ModelTask;
  prompt: string;
  systemInstruction?: string;
  responseSchema?: unknown;
  thinking?: "low" | "medium" | "high";
  sampling?: Readonly<Record<string, unknown>>;
  signal: AbortSignal;
}

export interface ModelAdapter {
  invoke(request: ModelInvocation): Promise<string>;
}

export interface ModelRouterRequest {
  task: ModelTask;
  preferredModel: string;
  fallbackModels?: readonly string[];
  prompt: string;
  systemInstruction?: string;
  responseSchema?: unknown;
  thinking?: "low" | "medium" | "high";
  sampling?: Readonly<Record<string, unknown>>;
  timeoutMs?: number;
  queueTimeoutMs?: number;
  maxAttemptsPerModel?: number;
  signal?: AbortSignal;
}

export interface ModelAttempt {
  modelId: string;
  attempt: number;
  errorKind?: ModelErrorKind;
  durationMs: number;
}

export interface ModelRouterResult {
  text: string;
  requestedModel: string;
  usedModel: string;
  fallbackOccurred: boolean;
  attempts: ModelAttempt[];
  warnings: string[];
}

export interface ModelRouterOptions {
  models: readonly ModelDefinition[];
  adapter: ModelAdapter;
  defaultTimeoutMs?: number;
  queueTimeoutMs?: number;
  maxAttemptsPerModel?: number;
  cooldownMs?: Partial<Record<ModelErrorKind, number>>;
  now?: () => number;
}

export class ModelRouterError extends Error {
  readonly kind: ModelErrorKind;
  readonly modelId?: string;
  readonly attempts: readonly ModelAttempt[];
  constructor(message: string, kind: ModelErrorKind, modelId?: string, attempts: readonly ModelAttempt[] = []) {
    super(message);
    this.name = "ModelRouterError";
    this.kind = kind;
    this.modelId = modelId;
    this.attempts = attempts;
  }
}

interface ModelState {
  active: number;
  queue: Array<() => void>;
  cooldownUntil: number;
}

const DEFAULT_COOLDOWNS: Record<ModelErrorKind, number> = {
  "rate-limit": 20_000,
  "quota-exhausted": 5 * 60_000,
  timeout: 5_000,
  "queue-timeout": 0,
  "queue-full": 0,
  "no-eligible-model": 0,
  unavailable: 8_000,
  network: 3_000,
  "invalid-auth": 0,
  "invalid-request": 0,
  "unsupported-model": 0,
  "safety-block": 0,
  truncated: 0,
  "empty-response": 0,
  unknown: 0,
  cancelled: 0,
};

const MAX_ATTEMPTS = 3;
const MAX_INLINE_RETRY_DELAY_MS = 15_000;
const MAX_COOLDOWN_WAIT_MS = 10_000;

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try { return JSON.stringify(error); } catch { return String(error); }
}

function numericStatus(error: unknown): number {
  if (!error || typeof error !== "object") return 0;
  const value = error as Record<string, unknown>;
  const nested = value.error && typeof value.error === "object"
    ? value.error as Record<string, unknown>
    : undefined;
  return Number(value.status ?? value.statusCode ?? value.code ?? nested?.code ?? 0);
}

/**
 * RESOURCE_EXHAUSTED is not synonymous with a daily quota. Google also uses
 * it for short-window request/token limits. Only explicit quota/day/billing
 * language is treated as a long-lived quota exhaustion.
 */
export function classifyModelError(error: unknown): ModelErrorKind {
  const message = errorText(error);
  const errorName = error && typeof error === "object" && "name" in error
    ? String((error as { name?: unknown }).name ?? "")
    : "";
  const upper = (errorName + " " + message).toUpperCase();
  const status = numericStatus(error);

  if (/API_KEY_INVALID|API KEY NOT VALID|UNAUTHENTICATED|INVALID API KEY/.test(upper) || status === 401 || status === 403) return "invalid-auth";
  if (/SAFETY|BLOCKED BY.*POLICY|PROHIBITED CONTENT/.test(upper)) return "safety-block";
  if (/MAX_TOKENS|RESPONSE TRUNCATED|OUTPUT TOKEN LIMIT/.test(upper)) return "truncated";
  if (/UNSUPPORTED MODEL|MODEL.*NOT FOUND|NOT_FOUND/.test(upper) || status === 404) return "unsupported-model";
  if (/INVALID_ARGUMENT|INVALID REQUEST|BAD REQUEST|MALFORMED/.test(upper) || status === 400) return "invalid-request";
  if (/QUOTA|DAILY LIMIT|PER DAY|PERDAY|BILLING|GENERATEREQUESTSPERDAY|GENERATETOKENSPERDAY/.test(upper)) return "quota-exhausted";
  if (/RESOURCE_EXHAUSTED|RATE.?LIMIT|TOO MANY REQUESTS/.test(upper) || status === 429) return "rate-limit";
  if (/TIMEOUT|TIMED OUT|DEADLINE_EXCEEDED|ABORT_ERR|ABORTERROR|OPERATION WAS ABORTED/.test(upper) || status === 408 || status === 504) return "timeout";
  if (/ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|NETWORK/.test(upper)) return "network";
  if (/UNAVAILABLE|OVERLOADED|INTERNAL SERVER ERROR|BAD GATEWAY/.test(upper) || status === 500 || status === 502 || status === 503) return "unavailable";
  return "unknown";
}

function parseRetryDelayMs(error: unknown): number | undefined {
  const text = errorText(error);
  const match = /"retryDelay"\s*:\s*"?(\d+(?:\.\d+)?)s"?/i.exec(text);
  if (!match) return undefined;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds * 1000) : undefined;
}

function retryDelayMs(
  kind: ModelErrorKind,
  attempt: number,
  error: unknown,
  hasAlternative: boolean,
): number | undefined {
  const delays: Partial<Record<ModelErrorKind, number[]>> = {
    unavailable: [500, 1_500],
    network: [300, 900],
    timeout: [500, 1_000],
    "empty-response": [300],
  };
  if (kind === "rate-limit") {
    if (hasAlternative || attempt > 1) return undefined;
    const providerDelay = parseRetryDelayMs(error);
    const delay = providerDelay ?? 1_000;
    return delay <= MAX_INLINE_RETRY_DELAY_MS ? delay : undefined;
  }
  const sequence = delays[kind];
  return sequence?.[attempt - 1];
}

function createAbortSignal(parent: AbortSignal | undefined, timeoutMs: number): {
  signal: AbortSignal;
  dispose: () => void;
} {
  const controller = new AbortController();
  const abort = () => controller.abort(parent?.reason);
  if (parent?.aborted) abort();
  else parent?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("Model request timeout")), timeoutMs);
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", abort);
    },
  };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ModelRouterError("Request was cancelled while waiting to retry.", "cancelled"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new ModelRouterError("Request was cancelled while waiting to retry.", "cancelled"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export class ModelRouter {
  private readonly definitions = new Map<string, ModelDefinition>();
  private readonly states = new Map<string, ModelState>();
  private readonly adapter: ModelAdapter;
  private readonly defaultTimeoutMs: number;
  private readonly queueTimeoutMs: number;
  private readonly defaultAttempts: number;
  private readonly cooldowns: Record<ModelErrorKind, number>;
  private readonly now: () => number;

  constructor(options: ModelRouterOptions) {
    this.adapter = options.adapter;
    this.defaultTimeoutMs = Math.max(1, Math.min(180_000, options.defaultTimeoutMs ?? 45_000));
    this.queueTimeoutMs = Math.max(1_000, Math.min(300_000, options.queueTimeoutMs ?? 120_000));
    this.defaultAttempts = Math.max(1, Math.min(MAX_ATTEMPTS, options.maxAttemptsPerModel ?? 3));
    this.cooldowns = { ...DEFAULT_COOLDOWNS, ...options.cooldownMs };
    this.now = options.now ?? Date.now;
    for (const model of options.models) {
      if (!model.id.trim() || this.definitions.has(model.id)) throw new Error("Model IDs must be non-empty and unique.");
      if (!Number.isInteger(model.maxConcurrency) || model.maxConcurrency < 1) throw new Error(`Invalid concurrency limit for model ${model.id}.`);
      if (model.maxQueueLength !== undefined && (!Number.isInteger(model.maxQueueLength) || model.maxQueueLength < 0)) throw new Error(`Invalid queue limit for model ${model.id}.`);
      this.definitions.set(model.id, { ...model, tasks: [...model.tasks] });
      this.states.set(model.id, { active: 0, queue: [], cooldownUntil: 0 });
    }
  }

  getModelStatus(): Array<{ modelId: string; enabled: boolean; active: number; queued: number; cooldownUntil: number }> {
    return [...this.definitions.values()].map((model) => {
      const state = this.states.get(model.id)!;
      return { modelId: model.id, enabled: model.enabled, active: state.active, queued: state.queue.length, cooldownUntil: state.cooldownUntil };
    });
  }

  private async acquire(model: ModelDefinition, signal: AbortSignal, parentSignal?: AbortSignal): Promise<() => void> {
    const state = this.states.get(model.id)!;
    const abortKind = (): ModelErrorKind => parentSignal?.aborted ? "cancelled" : "queue-timeout";
    if (signal.aborted) {
      throw new ModelRouterError("Model request was aborted before queueing.", abortKind(), model.id);
    }
    if (state.active < model.maxConcurrency) {
      state.active++;
      return () => this.release(model.id);
    }
    if (state.queue.length >= (model.maxQueueLength ?? 20)) {
      throw new ModelRouterError(`Model ${model.id} queue is full.`, "queue-full", model.id);
    }
    await new Promise<void>((resolve, reject) => {
      const wake = () => {
        signal.removeEventListener("abort", abort);
        resolve();
      };
      const abort = () => {
        const index = state.queue.indexOf(wake);
        if (index >= 0) state.queue.splice(index, 1);
        reject(new ModelRouterError("Model request aborted while waiting for capacity.", abortKind(), model.id));
      };
      state.queue.push(wake);
      signal.addEventListener("abort", abort, { once: true });
    });
    if (signal.aborted) {
      this.release(model.id);
      throw new ModelRouterError("Model request aborted while waiting for capacity.", abortKind(), model.id);
    }
    return () => this.release(model.id);
  }

  private release(modelId: string): void {
    const state = this.states.get(modelId)!;
    const next = state.queue.shift();
    if (next) next();
    else state.active = Math.max(0, state.active - 1);
  }

  async generate(request: ModelRouterRequest): Promise<ModelRouterResult> {
    if (!request.prompt.trim()) throw new ModelRouterError("Prompt must not be empty.", "invalid-request");
    if (request.signal?.aborted) throw new ModelRouterError("Request was cancelled before dispatch.", "cancelled");

    const requestedModel = request.preferredModel;
    const candidateIds = [...new Set([requestedModel, ...(request.fallbackModels ?? [])])];
    const attempts: ModelAttempt[] = [];
    const warnings: string[] = [];
    const maxAttempts = Math.max(1, Math.min(MAX_ATTEMPTS, request.maxAttemptsPerModel ?? this.defaultAttempts));
    const timeoutMs = Math.max(1, Math.min(180_000, request.timeoutMs ?? this.defaultTimeoutMs));
    const queueTimeoutMs = Math.max(1_000, Math.min(300_000, request.queueTimeoutMs ?? this.queueTimeoutMs));
    const eligibleModels = candidateIds
      .map((id) => this.definitions.get(id))
      .filter((model): model is ModelDefinition => !!model && model.enabled && model.tasks.includes(request.task));
    const hasAlternative = eligibleModels.length > 1;
    let lastError: unknown;
    let lastKind: ModelErrorKind | undefined;
    let lastModelId: string | undefined;

    for (const modelId of candidateIds) {
      const model = this.definitions.get(modelId);
      if (!model || !model.enabled || !model.tasks.includes(request.task)) {
        warnings.push(`Модель ${modelId} отсутствует, отключена или не предназначена для задачи ${request.task}.`);
        continue;
      }

      const state = this.states.get(modelId)!;
      const cooldownLeft = state.cooldownUntil - this.now();
      if (cooldownLeft > 0) {
        const isLastEligible = !candidateIds.slice(candidateIds.indexOf(modelId) + 1).some((id) => {
          const candidate = this.definitions.get(id);
          return !!candidate && candidate.enabled && candidate.tasks.includes(request.task);
        });
        if (isLastEligible && cooldownLeft <= MAX_COOLDOWN_WAIT_MS) {
          try {
            await sleep(cooldownLeft, request.signal);
          } catch (error) {
            throw new ModelRouterError(errorText(error), "cancelled", modelId, attempts);
          }
        } else {
          warnings.push(`Модель ${modelId} временно охлаждается ещё ${Math.ceil(cooldownLeft / 1000)} с.`);
          continue;
        }
      }

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        let release: (() => void) | undefined;
        let requestTimer: ReturnType<typeof createAbortSignal> | undefined;
        const queueTimer = createAbortSignal(request.signal, queueTimeoutMs);
        const queueStarted = this.now();
        let retryDelay: number | undefined;

        try {
          try {
            release = await this.acquire(model, queueTimer.signal, request.signal);
          } catch (error) {
            const kind = error instanceof ModelRouterError ? error.kind : classifyModelError(error);
            lastError = error;
            lastKind = kind;
            lastModelId = modelId;
            attempts.push({
              modelId,
              attempt,
              errorKind: kind,
              durationMs: Math.max(0, this.now() - queueStarted),
            });
            break;
          } finally {
            queueTimer.dispose();
          }

          requestTimer = createAbortSignal(request.signal, timeoutMs);
          const started = this.now();
          try {
            const text = (await this.adapter.invoke({
              modelId,
              task: request.task,
              prompt: request.prompt,
              systemInstruction: request.systemInstruction,
              responseSchema: model.supportsJsonSchema ? request.responseSchema : undefined,
              thinking: model.supportsThinking ? request.thinking : undefined,
              sampling: model.supportsSampling ? request.sampling : undefined,
              signal: requestTimer.signal,
            })).trim();

            if (request.signal?.aborted) throw new ModelRouterError("Request was cancelled by the caller.", "cancelled", modelId);
            if (requestTimer.signal.aborted) throw new ModelRouterError("Model request timed out.", "timeout", modelId);
            if (!text) throw new ModelRouterError("Provider returned an empty response.", "empty-response", modelId);

            attempts.push({ modelId, attempt, durationMs: Math.max(0, this.now() - started) });
            return {
              text,
              requestedModel,
              usedModel: modelId,
              fallbackOccurred: modelId !== requestedModel,
              attempts,
              warnings,
            };
          } catch (error) {
            lastError = error;
            lastModelId = modelId;
            lastKind = request.signal?.aborted
              ? "cancelled"
              : requestTimer.signal.aborted
                ? "timeout"
                : error instanceof ModelRouterError
                  ? error.kind
                  : classifyModelError(error);
            attempts.push({
              modelId,
              attempt,
              errorKind: lastKind,
              durationMs: Math.max(0, this.now() - started),
            });
            if (attempt < maxAttempts) retryDelay = retryDelayMs(lastKind, attempt, error, hasAlternative);
          }
        } finally {
          release?.();
          requestTimer?.dispose();
          queueTimer.dispose();
        }

        if (lastKind === "cancelled" || lastKind === "queue-timeout" || lastKind === "queue-full") break;
        if (retryDelay !== undefined) {
          try {
            await sleep(retryDelay, request.signal);
          } catch (error) {
            lastError = error;
            lastKind = "cancelled";
            break;
          }
          continue;
        }

        const coolableKinds = new Set<ModelErrorKind>(["rate-limit", "quota-exhausted", "unavailable", "timeout", "network"]);
        if (lastKind && coolableKinds.has(lastKind)) {
          const retryAfter = lastKind === "rate-limit" ? parseRetryDelayMs(lastError) : undefined;
          const cooldown = retryAfter ?? this.cooldowns[lastKind] ?? 0;
          state.cooldownUntil = Math.max(state.cooldownUntil, this.now() + cooldown);
        }
        break;
      }

      if (lastKind === "cancelled" || lastKind === "queue-timeout" || lastKind === "queue-full" ||
          lastKind === "invalid-auth" || lastKind === "invalid-request" || lastKind === "safety-block" ||
          lastKind === "unknown" || lastKind === "truncated") {
        break;
      }
    }

    if (!lastError) {
      throw new ModelRouterError(
        `No eligible model is currently available for task ${request.task}. ${warnings.join(" ")}`.trim(),
        "no-eligible-model",
        undefined,
        attempts,
      );
    }

    const kind = lastKind ?? classifyModelError(lastError);
    throw new ModelRouterError(errorText(lastError), kind, lastModelId, attempts);
  }
}
