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
  | "unavailable"
  | "network"
  | "invalid-auth"
  | "invalid-request"
  | "unsupported-model"
  | "safety-block"
  | "empty-response"
  | "unknown";

export interface ModelDefinition {
  id: string;
  tasks: readonly ModelTask[];
  enabled: boolean;
  maxConcurrency: number;
  supportsJsonSchema: boolean;
  supportsThinking: boolean;
  supportsSampling: boolean;
  priority: number;
}

export interface ModelInvocation {
  modelId: string;
  task: ModelTask;
  prompt: string;
  systemInstruction?: string;
  responseSchema?: unknown;
  parameters?: Readonly<Record<string, unknown>>;
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
  parameters?: Readonly<Record<string, unknown>>;
  timeoutMs?: number;
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
  unavailable: 8_000,
  network: 3_000,
  "invalid-auth": 0,
  "invalid-request": 0,
  "unsupported-model": 0,
  "safety-block": 0,
  "empty-response": 0,
  unknown: 0,
  cancelled: 0,
};

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try { return JSON.stringify(error); } catch { return String(error); }
}
function numericStatus(error: unknown): number {
  if (!error || typeof error !== "object") return 0;
  const value = error as Record<string, unknown>;
  return Number(value.status ?? value.statusCode ?? value.code ?? 0);
}

export function classifyModelError(error: unknown): ModelErrorKind {
  const message = errorText(error);
  const upper = message.toUpperCase();
  const status = numericStatus(error);
  if (/API_KEY_INVALID|API KEY NOT VALID|UNAUTHENTICATED|INVALID API KEY/.test(upper) || status === 401 || status === 403) return "invalid-auth";
  if (/SAFETY|BLOCKED BY.*POLICY|PROHIBITED CONTENT/.test(upper)) return "safety-block";
  if (/UNSUPPORTED MODEL|MODEL.*NOT FOUND|NOT_FOUND/.test(upper) || status === 404) return "unsupported-model";
  if (/INVALID_ARGUMENT|INVALID REQUEST|BAD REQUEST|MALFORMED/.test(upper) || status === 400) return "invalid-request";
  if (/QUOTA|RESOURCE_EXHAUSTED|DAILY LIMIT|BILLING/.test(upper)) return "quota-exhausted";
  if (/RATE.?LIMIT|TOO MANY REQUESTS/.test(upper) || status === 429) return "rate-limit";
  if (/TIMEOUT|TIMED OUT|DEADLINE_EXCEEDED|ABORT_ERR/.test(upper) || status === 408 || status === 504) return "timeout";
  if (/ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|NETWORK/.test(upper)) return "network";
  if (/UNAVAILABLE|OVERLOADED|INTERNAL SERVER ERROR|BAD GATEWAY/.test(upper) || status === 500 || status === 502 || status === 503) return "unavailable";
  return "unknown";
}

function retryable(kind: ModelErrorKind): boolean {
  return kind === "rate-limit" || kind === "quota-exhausted" || kind === "timeout" ||
    kind === "unavailable" || kind === "network" || kind === "empty-response";
}

function createAbortSignal(parent: AbortSignal | undefined, timeoutMs: number): {
  signal: AbortSignal; dispose: () => void;
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

export class ModelRouter {
  private readonly definitions = new Map<string, ModelDefinition>();
  private readonly states = new Map<string, ModelState>();
  private readonly adapter: ModelAdapter;
  private readonly defaultTimeoutMs: number;
  private readonly defaultAttempts: number;
  private readonly cooldowns: Record<ModelErrorKind, number>;
  private readonly now: () => number;

  constructor(options: ModelRouterOptions) {
    this.adapter = options.adapter;
    this.defaultTimeoutMs = Math.max(1000, options.defaultTimeoutMs ?? 45_000);
    this.defaultAttempts = Math.max(1, Math.min(3, options.maxAttemptsPerModel ?? 2));
    this.cooldowns = { ...DEFAULT_COOLDOWNS, ...options.cooldownMs };
    this.now = options.now ?? Date.now;
    for (const model of options.models) {
      if (!model.id.trim() || this.definitions.has(model.id)) throw new Error("Model IDs must be non-empty and unique.");
      if (!Number.isInteger(model.maxConcurrency) || model.maxConcurrency < 1) throw new Error(`Invalid concurrency limit for model ${model.id}.`);
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

  private async acquire(model: ModelDefinition, signal: AbortSignal): Promise<() => void> {
    const state = this.states.get(model.id)!;
    if (signal.aborted) throw new ModelRouterError("Model request was aborted before queueing.", "timeout", model.id);
    if (state.active < model.maxConcurrency) {
      state.active++;
      return () => this.release(model.id);
    }
    await new Promise<void>((resolve, reject) => {
      const wake = () => { signal.removeEventListener("abort", abort); resolve(); };
      const abort = () => {
        const index = state.queue.indexOf(wake);
        if (index >= 0) state.queue.splice(index, 1);
        reject(new ModelRouterError("Model request aborted while waiting for capacity.", "timeout", model.id));
      };
      state.queue.push(wake);
      signal.addEventListener("abort", abort, { once: true });
    });
    if (signal.aborted) {
      this.release(model.id);
      throw new ModelRouterError("Model request aborted while waiting for capacity.", "cancelled", model.id);
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
    const requestedModel = request.preferredModel;
    const candidateIds = [...new Set([requestedModel, ...(request.fallbackModels ?? [])])];
    const attempts: ModelAttempt[] = [];
    const warnings: string[] = [];
    const maxAttempts = Math.max(1, Math.min(3, request.maxAttemptsPerModel ?? this.defaultAttempts));
    const timeoutMs = Math.max(1000, Math.min(180_000, request.timeoutMs ?? this.defaultTimeoutMs));
    let lastError: unknown;

    for (const modelId of candidateIds) {
      const model = this.definitions.get(modelId);
      if (!model || !model.enabled || !model.tasks.includes(request.task)) {
        warnings.push(`Модель ${modelId} отсутствует, отключена или не предназначена для задачи ${request.task}.`);
        continue;
      }
      const state = this.states.get(modelId)!;
      if (state.cooldownUntil > this.now()) {
        warnings.push(`Модель ${modelId} временно охлаждается.`);
        continue;
      }

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const timer = createAbortSignal(request.signal, timeoutMs);
        const started = this.now();
        let release: (() => void) | undefined;
        try {
          release = await this.acquire(model, timer.signal);
          const text = (await this.adapter.invoke({
            modelId, task: request.task, prompt: request.prompt,
            systemInstruction: request.systemInstruction,
            responseSchema: model.supportsJsonSchema ? request.responseSchema : undefined,
            parameters: model.supportsSampling ? request.parameters : undefined,
            signal: timer.signal,
          })).trim();
          if (!text) throw new ModelRouterError("Provider returned an empty response.", "empty-response", modelId);
          attempts.push({ modelId, attempt, durationMs: Math.max(0, this.now() - started) });
          return {
            text, requestedModel, usedModel: modelId,
            fallbackOccurred: modelId !== requestedModel,
            attempts, warnings,
          };
        } catch (error) {
          lastError = error;
          const kind = request.signal?.aborted ? "cancelled" : (error instanceof ModelRouterError ? error.kind : classifyModelError(error));
          attempts.push({ modelId, attempt, errorKind: kind, durationMs: Math.max(0, this.now() - started) });
          if (kind === "rate-limit" || kind === "quota-exhausted" || kind === "unavailable" || kind === "timeout" || kind === "network") {
            state.cooldownUntil = Math.max(state.cooldownUntil, this.now() + (this.cooldowns[kind] ?? 0));
          }
          if (!retryable(kind) || attempt === maxAttempts) break;
        } finally {
          release?.();
          timer.dispose();
        }
      }
      if (lastError) {
        const lastKind = lastError instanceof ModelRouterError ? lastError.kind : classifyModelError(lastError);
        if (lastKind === "cancelled" || lastKind === "invalid-auth" ||
            lastKind === "invalid-request" || lastKind === "safety-block" || lastKind === "unknown") break;
      }
    }
    const kind = lastError instanceof ModelRouterError ? lastError.kind : classifyModelError(lastError);
    throw new ModelRouterError(
      lastError ? errorText(lastError) : "No eligible model was available for this task.",
      kind, undefined, attempts,
    );
  }
}
