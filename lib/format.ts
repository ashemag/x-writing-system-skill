import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export function printJson(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

export function writeMarkdownOutput(content: string, outPath?: string): string {
  const destination =
    outPath ?? resolve(import.meta.dir, "..", "data", "cache", `advice-${Date.now()}.md`);
  const folder = resolve(destination, "..");
  mkdirSync(folder, { recursive: true });
  writeFileSync(destination, content, "utf8");
  return destination;
}

export function printHelp(): void {
  process.stdout.write(
    [
      "x-search.ts - X writing system research CLI",
      "",
      "Commands:",
      "  fetch      Pull your last-30-day posts",
      "  research   Search X topics for market learnings",
      "  advise     Build a markdown research brief for LLM rewriting",
      "",
      "Examples:",
      "  bun run x-search.ts fetch --username ashebytes --out data/recent_posts.json",
      "  bun run x-search.ts research --topics \"founder writing,x growth\"",
      "  bun run x-search.ts advise --draft-file ./draft.txt --username ashebytes",
      "  bun run x-search.ts advise --draft \"...\" --topics \"agent skills,x api\" --performant-like-threshold 50",
      "  bun run x-search.ts advise --draft-file ./draft.txt --split-topic-calls   # debugging only",
    ].join("\n")
  );
}
