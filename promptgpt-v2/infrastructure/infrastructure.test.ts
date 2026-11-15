import { VersionedLruCache, versionedCacheKey } from "./versionedCache";
import { isRecord, parseValidatedJson } from "./jsonValidation";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Infrastructure self-test failed: ${message}`);
}
interface Payload { ok: boolean; count: number; }
function isPayload(value: unknown): value is Payload {
  return isRecord(value) && value.ok === true && typeof value.count === "number" && Number.isFinite(value.count);
}

export function runInfrastructureSelfTests(): { passed: number; names: string[] } {
  const names: string[] = [];
  let now = 100;
  const cache = new VersionedLruCache<string>({ maxEntries: 2, ttlMs: 50, now: () => now });
  cache.set("a", "v1", "one");
  assert(cache.get("a", "v1") === "one", "cache returns matching version");
  assert(cache.get("a", "v2") === undefined, "cache rejects stale algorithm version");
  cache.set("a", "v1", "one"); cache.set("b", "v1", "two"); cache.get("a", "v1"); cache.set("c", "v1", "three");
  assert(cache.get("b", "v1") === undefined && cache.get("a", "v1") === "one", "LRU evicts least recently used entry");
  now += 51;
  assert(cache.get("a", "v1") === undefined && cache.size === 0, "TTL expires entries");
  names.push("versioned TTL LRU cache");

  assert(versionedCacheKey("blueprint", "sha256:abc", "prompt-v3") === "blueprint:prompt-v3:sha256:abc",
    "cache key contains namespace, version and fingerprint");
  names.push("versioned cache key namespace");

  const payload = parseValidatedJson('{"ok":true,"count":3}', isPayload);
  assert(payload.count === 3, "valid model JSON passes runtime validator");
  const fenced = parseValidatedJson(' ```json\n{"ok":true,"count":4}\n``` ', isPayload);
  assert(fenced.count === 4, "fenced JSON is parsed safely");
  const invalid = (() => { try { parseValidatedJson('{"ok":"yes","count":"3"}', isPayload); return false; } catch { return true; } })();
  assert(invalid, "wrong JSON field types are rejected");
  names.push("runtime JSON schema validation");

  return { passed: names.length, names };
}
