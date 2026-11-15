import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { ModelRouterError, type ModelAdapter, type ModelInvocation } from "./modelRouter";

type SamplingKey = "temperature" | "topP" | "topK" | "frequencyPenalty" | "presencePenalty";

function resolveThinkingLevel(level: ModelInvocation["thinking"]): ThinkingLevel | undefined {
  switch (level) {
    case "low": return ThinkingLevel.LOW;
    case "medium": return ThinkingLevel.MEDIUM;
    case "high": return ThinkingLevel.HIGH;
    default: return undefined;
  }
}

function applySampling(config: Record<string, unknown>, sampling: Readonly<Record<string, unknown>> | undefined): void {
  if (!sampling) return;
  const ranges: Record<SamplingKey, [number, number]> = {
    temperature: [0, 2],
    topP: [0, 1],
    topK: [1, 1000],
    frequencyPenalty: [-2, 2],
    presencePenalty: [-2, 2],
  };
  for (const [rawKey, rawValue] of Object.entries(sampling)) {
    if (!(rawKey in ranges)) throw new Error(`Unsupported Gemini sampling parameter: ${rawKey}`);
    const key = rawKey as SamplingKey;
    const [min, max] = ranges[key];
    if (typeof rawValue !== "number" || !Number.isFinite(rawValue) || rawValue < min || rawValue > max) {
      throw new Error(`Gemini sampling parameter ${key} must be a finite number in [${min}, ${max}].`);
    }
    config[key] = rawValue;
  }
}

function abortError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

/**
 * Adapter for the installed @google/genai SDK. The router owns retries,
 * cooldowns and concurrency; the SDK receives the AbortSignal for client-side
 * cancellation of an in-flight request.
 */
export class GeminiModelAdapter implements ModelAdapter {
  constructor(private readonly client: GoogleGenAI) {}

  async invoke(request: ModelInvocation): Promise<string> {
    if (request.signal.aborted) throw abortError("Gemini request was cancelled before dispatch.");

    const config: Record<string, unknown> = {
      abortSignal: request.signal,
    };
    if (request.systemInstruction) config.systemInstruction = request.systemInstruction;
    if (request.responseSchema !== undefined) {
      config.responseMimeType = "application/json";
      config.responseSchema = request.responseSchema;
    }
    const thinkingLevel = resolveThinkingLevel(request.thinking);
    if (thinkingLevel !== undefined) config.thinkingConfig = { thinkingLevel };
    applySampling(config, request.sampling);

    const response = await this.client.models.generateContent({
      model: request.modelId,
      contents: request.prompt,
      config: config as never,
    });

    // Do not turn a late response into a successful result after cancellation.
    // The router distinguishes caller cancellation from its own request timeout.
    if (request.signal.aborted) throw abortError("Gemini request completed after its deadline or cancellation.");

    const providerResponse = response as unknown as {
      text?: string | null;
      promptFeedback?: { blockReason?: unknown };
      candidates?: Array<{ finishReason?: unknown }>;
    };
    const finishReason = String(providerResponse.candidates?.[0]?.finishReason ?? "").toUpperCase();
    const blockReason = providerResponse.promptFeedback?.blockReason;

    if (finishReason === "MAX_TOKENS") {
      throw new ModelRouterError("Gemini response was truncated because it reached MAX_TOKENS.", "truncated", request.modelId);
    }
    if (blockReason || ["SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"].includes(finishReason)) {
      throw new ModelRouterError(
        `Gemini blocked the prompt or candidate: ${String(blockReason ?? finishReason)}`,
        "safety-block",
        request.modelId,
      );
    }

    return (providerResponse.text ?? "").trim();
  }
}
