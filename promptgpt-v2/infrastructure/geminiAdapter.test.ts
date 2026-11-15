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
  let abortDuringResponse = false;
  let activeSignal: AbortSignal | undefined;
  const fakeClient = {
    models: {
      async generateContent(args: Record<string, unknown>) {
        captured = args;
        const config = args.config as Record<string, unknown>;
        activeSignal = config.abortSignal as AbortSignal;
        if (abortDuringResponse && activeSignal instanceof AbortSignal) {
          (activeSignal as unknown as { throwIfAborted?: () => void }).throwIfAborted?.();
        }
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

  return { passed: names.length, names };
}
