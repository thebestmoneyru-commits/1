import type { DonorStyleBaseline, StyleDNAProfile } from "./styleTypes";

export const DONOR_BASELINE_VERSION = "1.0.0";

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
}

/** FNV-1a is an integrity checksum, not a cryptographic signature. */
function checksum(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
function profileFingerprint(profile: StyleDNAProfile): string {
  return `style-baseline:${checksum(stableSerialize(profile))}:${profile.sourceFingerprint}`;
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
function cloneProfile(profile: StyleDNAProfile): StyleDNAProfile {
  return JSON.parse(JSON.stringify(profile)) as StyleDNAProfile;
}
function validateProfile(profile: StyleDNAProfile): string[] {
  const errors: string[] = [];
  if (!profile || typeof profile !== "object") return ["Профиль донора отсутствует."];
  if (!profile.profileVersion || !profile.sourceFingerprint) errors.push("Не указана версия профиля или fingerprint исходного корпуса.");
  if (!profile.corpus || !Array.isArray(profile.features)) errors.push("Структура профиля донора неполная.");
  if (profile.status === "insufficient") errors.push("Недостаточный корпус нельзя закрепить как стилевой эталон.");
  const ids = new Set<string>();
  for (const feature of profile.features ?? []) {
    if (!feature.id || ids.has(feature.id)) errors.push("Профиль содержит пустые или повторяющиеся идентификаторы признаков.");
    ids.add(feature.id);
    if (!Number.isFinite(feature.rate) || !Number.isFinite(feature.confidence)) {
      errors.push(`Признак ${feature.id || "(без ID)"} содержит некорректные числовые значения.`);
    }
  }
  return errors;
}

export interface DonorBaselineCreationResult {
  ok: boolean;
  baseline?: DonorStyleBaseline;
  errors: string[];
}

/**
 * Captures a deep-cloned, recursively frozen donor profile.
 * Later candidate profiles are compared to this snapshot, never substituted for it.
 */
export function createDonorStyleBaseline(profile: StyleDNAProfile): DonorBaselineCreationResult {
  const errors = validateProfile(profile);
  if (errors.length) return { ok: false, errors };

  const snapshot = deepFreeze(cloneProfile(profile));
  const baselineFingerprint = profileFingerprint(snapshot);
  const warnings = snapshot.status === "limited"
    ? ["Донорский корпус ограничен; baseline закреплён, но сравнения будут иметь пониженную уверенность."]
    : [];

  return {
    ok: true,
    baseline: deepFreeze({
      baselineVersion: DONOR_BASELINE_VERSION,
      baselineId: `donor-${baselineFingerprint.slice(16, 24)}`,
      baselineFingerprint,
      profile: snapshot,
      warnings,
    }),
    errors: [],
  };
}

export interface DonorBaselineIntegrity {
  valid: boolean;
  reason?: string;
}

/** Detects accidental mutation or substitution of the supposedly immutable baseline. */
export function verifyDonorStyleBaseline(baseline: DonorStyleBaseline): DonorBaselineIntegrity {
  if (!baseline || baseline.baselineVersion !== DONOR_BASELINE_VERSION) {
    return { valid: false, reason: "Неизвестная версия донорского baseline." };
  }
  const actual = profileFingerprint(baseline.profile);
  if (actual !== baseline.baselineFingerprint) {
    return { valid: false, reason: "Профиль донора изменился после закрепления baseline." };
  }
  const expectedId = `donor-${actual.slice(16, 24)}`;
  if (baseline.baselineId !== expectedId) {
    return { valid: false, reason: "Идентификатор baseline не соответствует его содержимому." };
  }
  return { valid: true };
}
