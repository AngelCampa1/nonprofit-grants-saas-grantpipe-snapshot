import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FORBIDDEN_PATTERNS } from "../../packages/shared/src/knowledge/marketing/forbidden-patterns.js";
import type { FounderRuleHit } from "./manifest-schema.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const AUDIT_DIR = resolve(REPO_ROOT, "audit");

const SCAN_ROOTS = [
  resolve(REPO_ROOT, ".agents"),
  resolve(REPO_ROOT, "content/social/linkedin"),
  resolve(REPO_ROOT, "docs/getting-badges"),
  resolve(REPO_ROOT, "packages/shared/src/constants"),
  resolve(REPO_ROOT, "packages/shared/src/knowledge/marketing/content"),
  resolve(REPO_ROOT, "apps/site/src/pages"),
  resolve(REPO_ROOT, "apps/site/src/components"),
  resolve(REPO_ROOT, "apps/site/src/config"),
  resolve(REPO_ROOT, "apps/site/src/lib"),
  resolve(REPO_ROOT, "apps/api/src"),
];

const SCAN_EXTS = [".md", ".astro", ".ts", ".tsx", ".html", ".txt"];

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        entry.name === ".turbo" ||
        entry.name === "__tests__" ||
        entry.name === "test" ||
        entry.name === "tests"
      ) {
        continue;
      }
      out.push(...walk(full));
    } else if (
      SCAN_EXTS.includes(extname(entry.name)) &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".test.tsx") &&
      !entry.name.endsWith(".spec.ts")
    ) {
      out.push(full);
    }
  }
  return out;
}

function lineNumberOf(source: string, offset: number): number {
  return source.slice(0, offset).split(/\r?\n/).length;
}

function contextOf(source: string, offset: number, length: number): string {
  const lines = source.split(/\r?\n/);
  const startLine = source.slice(0, offset).split(/\r?\n/).length - 1;
  const endLine = source.slice(0, offset + length).split(/\r?\n/).length - 1;
  return lines
    .slice(Math.max(0, startLine - 1), Math.min(lines.length, endLine + 2))
    .join("\n")
    .slice(0, 300);
}

function stripMarkdownFrontmatter(source: string): { body: string; offset: number } {
  const match = source.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  if (!match) return { body: source, offset: 0 };
  return { body: source.slice(match[0].length), offset: match[0].length };
}

function main(): void {
  const hits: FounderRuleHit[] = [];
  for (const root of SCAN_ROOTS) {
    for (const file of walk(root)) {
      const rawSource = readFileSync(file, "utf8");
      const rel = relative(REPO_ROOT, file).replace(/\\/g, "/");
      const isMarkdown = file.endsWith(".md");
      const { body, offset } = isMarkdown
        ? stripMarkdownFrontmatter(rawSource)
        : { body: rawSource, offset: 0 };
      for (const { name, pattern, reason } of FORBIDDEN_PATTERNS) {
        const re = new RegExp(
          pattern.source,
          pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g",
        );
        for (const m of body.matchAll(re)) {
          const absIdx = (m.index ?? 0) + offset;
          hits.push({
            filepath: rel,
            lineNumber: lineNumberOf(rawSource, absIdx),
            patternName: name,
            matchText: m[0].slice(0, 200),
            context: contextOf(rawSource, absIdx, m[0].length),
            reason,
          });
        }
      }
    }
  }

  mkdirSync(AUDIT_DIR, { recursive: true });
  writeFileSync(
    join(AUDIT_DIR, "founder-rule-hits.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), hitCount: hits.length, hits }, null, 2),
  );

  console.log(
    JSON.stringify({ hitCount: hits.length, byPattern: countBy(hits, "patternName") }, null, 2),
  );
}

function countBy<T extends Record<string, unknown>>(
  items: T[],
  key: keyof T,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const k = String(item[key]);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

main();
