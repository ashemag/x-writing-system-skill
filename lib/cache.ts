import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

interface CacheEnvelope<T> {
  savedAt: number;
  ttlMs: number;
  payload: T;
}

const CACHE_DIR = resolve(import.meta.dir, "..", "data", "cache");

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

export function cacheKey(parts: unknown[]): string {
  const h = createHash("sha256");
  h.update(JSON.stringify(parts));
  return h.digest("hex").slice(0, 20);
}

export function readCache<T>(key: string): T | null {
  ensureCacheDir();
  const path = resolve(CACHE_DIR, `${key}.json`);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf8");
    const env = JSON.parse(raw) as CacheEnvelope<T>;
    if (Date.now() - env.savedAt > env.ttlMs) return null;
    return env.payload;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, payload: T, ttlMs: number): void {
  ensureCacheDir();
  const path = resolve(CACHE_DIR, `${key}.json`);
  const env: CacheEnvelope<T> = { savedAt: Date.now(), ttlMs, payload };
  writeFileSync(path, JSON.stringify(env, null, 2), "utf8");
}
