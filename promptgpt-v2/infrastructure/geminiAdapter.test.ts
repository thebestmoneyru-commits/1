import { GeminiModelAdapter } from "./geminiAdapter";
import type { ModelInvocation } from "./modelRouter";
import type { GoogleGenAI } from "@google/genai";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Gemini adapter self-test failed: ${message}`);
}

export async function runGeminiAdapterSelfTests(): Promise<{ passed: number; names: string[] }> {
  const names: string[] = [];
  let captured: Record<string, unknown> | undefined;
  let response: Record<string, unknown> = { text: "  generated text  " };
  const fakeClient = {
    models: {
      async generateContent(args: Record<string, unknown>) {
        captured = args;
        return response;
      },
    },
  } as unknown as GoogleGenAI;
  const adapter = new GeminiModelAdapter(fakeClient);
  const controller = new AbortController();
  const request: ModelInvocation = {
    modelId: "test-model",
    task: "candidate-generation",
    prompt: "write",
    systemInstruction: "system",
    responseSchema: { type: "OBJECT" },
    thinking: "high",
    sampling: { temperature: 0.7, topP: 0.9, topK: 32 },
    signal: controller.signal,
  };

  const text = await adapter.invoke(request);
  assert(text === "generated text", "adapter trims and returns provider text");
  assert(captured?.model === "test-model" && captured?.contents === "write", "adapter forwards model and prompt");
  const config = captured?.config as Record<string, unknown>;
  assert(config.systemInstruction === "system" && config.responseMimeType === "application/json",
    "adapter forwards system instruction and JSON response mode");
  assert(config.abortSignal === controller.signal, "adapter forwards AbortSignal to the SDK");
  assert(typeof config.thinkingConfig === "object" && config.temperature === 0.7 && config.topP === 0.9,
    "adapter forwards supported thinking and sampling configuration");
  names.push("Gemini request mapping and cancellation signal");

  const badSampling = await adapter.invoke({
    ...request, sampling: { topP: 1.5 },
  }).then(() => false).catch(() => true);
  assert(badSampling, "out-of-range sampling values are rejected before provider call");
  names.push("sampling range validation");

  response = { text: "", candidates: [{ finishReason: "MAX_TOKENS" }] };
  const truncated = await adapter.invoke(request).then(() => false).catch((error) => error?.kind === "truncated");
  assert(truncated, "MAX_TOKENS is surfaced as a typed truncated response rather than an empty response");
  names.push("provider truncation classification");

  response = { text: "", promptFeedback: { blockReason: "SAFETY" } };
  const blocked = await adapter.invoke(request).then(() => false).catch((error) => error?.kind === "safety-block");
  assert(blocked, "prompt-level safety block is surfaced as a typed safety error");
  names.push("provider safety-block classification");

  const aborted = new AbortController();
  aborted.abort();
  const cancelled = await adapter.invoke({ ...request, signal: aborted.signal }).then(() => false).catch((error) => error?.name === "AbortError");
  assert(cancelled, "pre-aborted requests are not dispatched and preserve AbortError classification");
  names.push("pre-dispatch cancellation");

  const lateAbort = new AbortController();
  const lateAbortClient = {
    models: {
      async generateContent() {
        lateAbort.abort();
        return { text: "late response" };
      },
    },
  } as unknown as GoogleGenAI;
  const lateAdapter = new GeminiModelAdapter(lateAbortClient);
  const lateRejected = await lateAdapter.invoke({ ...request, signal: lateAbort.signal })
    .then(() => false)
    .catch((error) => error?.name === "AbortError");
  assert(lateRejected, "a provider response arriving after cancellation is not accepted");
  names.push("late response cancellation guard");

  {
    const capturedConfigs: Array<Record<string, unknown>> = [];
    const hydrogenClient = {
      models: {
        async generateContent(args: { config: Record<string, unknown> }) {
          capturedConfigs.push(args.config);
          return { text: "hydrogen output" };
        },
      },
    } as unknown as GoogleGenAI;
    const hydrogenAdapter = new GeminiModelAdapter(hydrogenClient);

    const highRes = await hydrogenAdapter.invoke({
      ...request,
      modelId: "gemini-4-hydrogen",
      thinking: "high",
    });
    assert(highRes === "hydrogen output", "hydrogen adapter returns text on high thinking fallback");
    assert(capturedConfigs[0]?.thinkingConfig === undefined, "gemini-4-hydrogen omits thinkingConfig when thinking is medium/high");

    const lowRes = await hydrogenAdapter.invoke({
      ...request,
      modelId: "gemini-4-hydrogen",
      thinking: "low",
    });
    assert(lowRes === "hydrogen output", "hydrogen adapter returns text on low thinking");
    assert(
      typeof capturedConfigs[1]?.thinkingConfig === "object" &&
      (capturedConfigs[1]?.thinkingConfig as Record<string, unknown>).thinkingLevel === "LOW",
      "gemini-4-hydrogen forwards ThinkingLevel.LOW when thinking is low",
    );
    names.push("gemini-4-hydrogen thinking level clamping");
  }

  {
    let attempts = 0;
    const retryConfigs: Array<Record<string, unknown>> = [];
    const unsupportedClient = {
      models: {
        async generateContent(args: { config: Record<string, unknown> }) {
          attempts++;
          retryConfigs.push(args.config);
          if (attempts === 1) {
            throw new Error("INVALID_ARGUMENT: Unknown name \"frequencyPenalty\" at config");
          }
          return { text: "recovered after stripping unsupported config" };
        },
      },
    } as unknown as GoogleGenAI;
    const retryAdapter = new GeminiModelAdapter(unsupportedClient);
    const recovered = await retryAdapter.invoke({
      ...request,
      modelId: "gemini-4-hydrogen",
      thinking: "low",
      sampling: { temperature: 0.8, topP: 0.9, topK: 40, frequencyPenalty: 0.3, presencePenalty: 0.2 },
    });
    assert(attempts === 2, "unsupported parameter triggers one retry without unsupported config fields");
    assert(recovered === "recovered after stripping unsupported config", "retry succeeds after stripping unsupported params");
    assert(
      retryConfigs[1]?.frequencyPenalty === undefined &&
      retryConfigs[1]?.presencePenalty === undefined &&
      retryConfigs[1]?.topK === undefined &&
      retryConfigs[1]?.temperature === 0.8,
      "retry strips unsupported penalty/topK fields while keeping core sampling parameters",
    );
    names.push("graceful retry when provider rejects optional config parameters");
  }

  return { passed: names.length, names };
}
