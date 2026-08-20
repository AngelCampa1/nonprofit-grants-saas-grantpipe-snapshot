import { readdirSync, readFileSync, existsSync } from "node:fs";
import { extname, join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { describe, expect, it } from "vitest";
import legacySnapshot from "../legacy-claims-snapshot.json" with { type: "json" };

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..", "..", "..", "..");
const CONTENT_ROOT = resolve(REPO_ROOT, "packages/shared/src/knowledge/marketing/content");

type LegacyEntry = { filepath: string; index: number; stat: string };
const legacyKey = (e: LegacyEntry) => `${e.filepath}#${e.index}`;
const LEGACY = new Set((legacySnapshot.entries as LegacyEntry[]).map(legacyKey));

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

type StatEntry = { stat?: unknown; source?: unknown; sourceUrl?: unknown };

function loadEntries(): Array<{ filepath: string; index: number; entry: StatEntry }> {
  const out: Array<{ filepath: string; index: number; entry: StatEntry }> = [];
  for (const file of walk(CONTENT_ROOT)) {
    const parsed = matter(readFileSync(file, "utf8"));
    const stats = (parsed.data as Record<string, unknown>).statistics;
    if (!Array.isArray(stats)) continue;
    const rel = relative(REPO_ROOT, file).replace(/\\/g, "/");
    stats.forEach((entry, index) => {
      out.push({ filepath: rel, index, entry: entry as StatEntry });
    });
  }
  return out;
}

const ALL_ENTRIES = loadEntries();

describe("marketing content citations", () => {
  it("loads at least one frontmatter statistic from the corpus", () => {
    expect(ALL_ENTRIES.length).toBeGreaterThan(0);
  });

  it("every frontmatter statistic has a non-empty stat string", () => {
    const bad = ALL_ENTRIES.filter(
      ({ entry }) => typeof entry.stat !== "string" || entry.stat.trim().length === 0,
    );
    expect(bad.map((b) => `${b.filepath}#${b.index}`)).toEqual([]);
  });

  it("every frontmatter statistic has a non-empty source string", () => {
    const bad = ALL_ENTRIES.filter(
      ({ entry }) => typeof entry.source !== "string" || entry.source.trim().length === 0,
    );
    expect(bad.map((b) => `${b.filepath}#${b.index}`)).toEqual([]);
  });

  it("every non-legacy frontmatter statistic has an https sourceUrl", () => {
    const bad = ALL_ENTRIES.filter(({ filepath, index, entry }) => {
      const key = `${filepath}#${index}`;
      if (LEGACY.has(key)) return false;
      if (typeof entry.sourceUrl !== "string") return true;
      return !entry.sourceUrl.startsWith("https://");
    });
    if (bad.length > 0) {
      console.error(
        "Unsourced claims (add a https sourceUrl or add the entry to legacy-claims-snapshot.json):",
        bad.slice(0, 10).map((b) => `${b.filepath}#${b.index}`),
      );
    }
    expect(bad.map((b) => `${b.filepath}#${b.index}`)).toEqual([]);
  });

  it("legacy snapshot entries still exist in the corpus", () => {
    const ALL_KEYS = new Set(ALL_ENTRIES.map((e) => `${e.filepath}#${e.index}`));
    const orphans = (legacySnapshot.entries as LegacyEntry[]).filter(
      (e) => !ALL_KEYS.has(legacyKey(e)),
    );
    expect(orphans.map(legacyKey)).toEqual([]);
  });
});
