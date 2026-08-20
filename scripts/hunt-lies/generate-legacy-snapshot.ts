import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { extname, join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const CONTENT_ROOT = resolve(REPO_ROOT, "packages/shared/src/knowledge/marketing/content");
const OUT_FILE = resolve(
  REPO_ROOT,
  "packages/shared/src/knowledge/marketing/legacy-claims-snapshot.json",
);

type LegacyEntry = { filepath: string; index: number; stat: string };

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (extname(e.name) === ".md") out.push(full);
  }
  return out;
}

function main(): void {
  const legacy: LegacyEntry[] = [];
  for (const file of walk(CONTENT_ROOT)) {
    const source = readFileSync(file, "utf8");
    const parsed = matter(source);
    const stats = (parsed.data as Record<string, unknown>).statistics;
    if (!Array.isArray(stats)) continue;
    const rel = relative(REPO_ROOT, file).replace(/\\/g, "/");
    stats.forEach((s, idx) => {
      const stat = (s as Record<string, unknown>).stat;
      const sourceUrl = (s as Record<string, unknown>).sourceUrl;
      if (typeof stat !== "string") return;
      if (typeof sourceUrl === "string" && sourceUrl.startsWith("https://")) return;
      legacy.push({ filepath: rel, index: idx, stat });
    });
  }
  legacy.sort((a, b) =>
    a.filepath === b.filepath ? a.index - b.index : a.filepath.localeCompare(b.filepath),
  );
  const payload = {
    generatedAt: new Date().toISOString(),
    note: "Frontmatter statistics entries that currently lack a sourceUrl. New statistics added after this snapshot MUST include an https sourceUrl on the ALLOWED_CITATION_HOSTS allowlist. Entries here may keep their stat+source pair, but should migrate to a verified sourceUrl over time and be removed from this file.",
    entryCount: legacy.length,
    entries: legacy,
  };
  writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2));

  console.log(`Wrote ${legacy.length} legacy entries to ${OUT_FILE}`);
}

main();
