import { GeminiModelAdapter } from "./geminiAdapter";
import type { ModelInvocation } from "./modelRouter";
import type { GoogleGenAI } from "@google/genai";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Gemini adapter self-test failed: ${message}`);
}
export async function runGeminiAdapterSelfTests(): Promise<{ passed: number; names: string[] }> {
  const names: string[] = [];
  let captured: Record<string, unknown> | undefined;
  const fakeClient = {
    models: {
      async generateContent(args: Record<string, unknown>) {
        captured = args;
        return { text: "  generated text  " };
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

  const aborted = new AbortController();
  aborted.abort();
  const cancelled = await adapter.invoke({ ...request, signal: aborted.signal }).then(() => false).catch(() => true);
  assert(cancelled, "pre-aborted requests are not dispatched");
  names.push("pre-dispatch cancellation");

  return { passed: names.length, names };
}
