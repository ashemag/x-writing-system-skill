import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const eq = trimmed.indexOf("=");
  if (eq <= 0) return null;
  const key = trimmed.slice(0, eq).trim();
  const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
  if (!key) return null;
  return [key, value];
}

export function loadEnvFiles(paths: string[]): string[] {
  const loaded: string[] = [];
  for (const p of paths) {
    const fullPath = resolve(p);
    if (!existsSync(fullPath)) continue;
    const lines = readFileSync(fullPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;
      const [key, value] = parsed;
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
    loaded.push(fullPath);
  }
  return loaded;
}

export function defaultEnvCandidates(baseDir: string): string[] {
  return [resolve(baseDir, ".env")];
}
