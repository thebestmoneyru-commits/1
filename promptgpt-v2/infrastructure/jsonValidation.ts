export type RuntimeValidator<T> = (value: unknown) => value is T;
export class JsonValidationError extends Error { constructor(message: string) { super(message); this.name = "JsonValidationError"; } }

export function parseJsonUnknown(raw: string): unknown {
  if (typeof raw !== "string" || !raw.trim()) throw new JsonValidationError("JSON response is empty.");
  const cleaned = raw.trim().replace(/^\uFEFF/, "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try { return JSON.parse(cleaned) as unknown; }
  catch (error) { const message = error instanceof Error ? error.message : "Unknown JSON parse error."; throw new JsonValidationError(`Invalid JSON response: ${message}`); }
}

/** Parses model output and validates its runtime shape; never returns an unchecked cast. */
export function parseValidatedJson<T>(raw: string, validator: RuntimeValidator<T>, label = "Model response"): T {
  const value = parseJsonUnknown(raw);
  if (!validator(value)) throw new JsonValidationError(`${label} failed runtime schema validation.`);
  return value;
}
export function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
export function isNonEmptyString(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
export function isFiniteNumberInRange(value: unknown, min: number, max: number): value is number { return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max; }