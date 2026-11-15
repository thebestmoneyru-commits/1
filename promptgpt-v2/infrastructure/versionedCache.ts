export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  version: string;
}
export interface VersionedCacheOptions { maxEntries: number; ttlMs: number; now?: () => number; }

/** In-memory bounded LRU cache. Keys must be opaque fingerprints, not raw prompts or secrets. */
export class VersionedLruCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private readonly now: () => number;
  constructor(options: VersionedCacheOptions) {
    if (!Number.isInteger(options.maxEntries) || options.maxEntries < 1) throw new Error("maxEntries must be a positive integer.");
    if (!Number.isFinite(options.ttlMs) || options.ttlMs < 1) throw new Error("ttlMs must be a positive finite number.");
    this.maxEntries = options.maxEntries; this.ttlMs = options.ttlMs; this.now = options.now ?? Date.now;
  }
  get(key: string, version: string): T | undefined {
    const entry = this.entries.get(key); if (!entry) return undefined;
    if (entry.expiresAt <= this.now() || entry.version !== version) { this.entries.delete(key); return undefined; }
    this.entries.delete(key); this.entries.set(key, entry); return entry.value;
  }
  set(key: string, version: string, value: T, ttlMs = this.ttlMs): void {
    if (!key.trim() || !version.trim()) throw new Error("Cache key and version must be non-empty.");
    if (!Number.isFinite(ttlMs) || ttlMs < 1) throw new Error("Cache TTL must be positive.");
    this.entries.delete(key); this.entries.set(key, { value, version, expiresAt: this.now() + ttlMs });
    this.pruneExpired();
    while (this.entries.size > this.maxEntries) { const oldest = this.entries.keys().next().value; if (oldest === undefined) break; this.entries.delete(oldest); }
  }
  delete(key: string): boolean { return this.entries.delete(key); }
  clear(): void { this.entries.clear(); }
  get size(): number { this.pruneExpired(); return this.entries.size; }
  private pruneExpired(): void { const now = this.now(); for (const [key, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(key); }
}

/** Stable namespace helper; callers should supply a cryptographic content fingerprint. */
export function versionedCacheKey(namespace: string, fingerprint: string, version: string): string {
  if (!namespace.trim() || !fingerprint.trim() || !version.trim()) throw new Error("Cache key parts must be non-empty.");
  return [namespace, version, fingerprint].join(":");
}