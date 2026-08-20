import { readdirSync, readFileSync, existsSync } from "node:fs";
import { extname, join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FORBIDDEN_PATTERNS } from "../forbidden-patterns";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..", "..", "..", "..");

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
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (
        e.name === "node_modules" ||
        e.name === "dist" ||
        e.name === ".turbo" ||
        e.name === "__tests__" ||
        e.name === "test" ||
        e.name === "tests"
      )
        continue;
      out.push(...walk(full));
    } else if (
      SCAN_EXTS.includes(extname(e.name)) &&
      !e.name.endsWith(".test.ts") &&
      !e.name.endsWith(".test.tsx") &&
      !e.name.endsWith(".spec.ts")
    ) {
      out.push(full);
    }
  }
  return out;
}

function stripFrontmatter(source: string): string {
  const m = source.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  return m ? source.slice(m[0].length) : source;
}

describe("founder-rule guardrails", () => {
  for (const { name, pattern, reason } of FORBIDDEN_PATTERNS) {
    it(`corpus contains no matches for forbidden pattern "${name}"`, () => {
      const hits: Array<{ file: string; match: string }> = [];
      const re = new RegExp(
        pattern.source,
        pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g",
      );
      for (const root of SCAN_ROOTS) {
        for (const file of walk(root)) {
          const raw = readFileSync(file, "utf8");
          const body = file.endsWith(".md") ? stripFrontmatter(raw) : raw;
          for (const m of body.matchAll(re)) {
            hits.push({
              file: relative(REPO_ROOT, file).replace(/\\/g, "/"),
              match: m[0].slice(0, 120),
            });
          }
        }
      }
      if (hits.length > 0) {
        console.error(`Forbidden pattern "${name}" matched (${reason}):`, hits.slice(0, 5));
      }
      expect(hits).toEqual([]);
    }, 30_000);
  }
});
