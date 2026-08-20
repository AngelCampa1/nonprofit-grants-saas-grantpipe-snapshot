#!/usr/bin/env node
/* eslint-env node */
// One-shot: add `lastReviewedAt: "2026-04-23"` to any content entry missing it.
// Targets: guides, alternatives, comparisons, listicles, state-pages,
// vertical-pages, pricing-breakdowns, lead-magnets.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_ROOT = join(__dirname, "..", "src", "content");
const TODAY = "2026-04-23";
const COLLECTIONS = [
  "guides",
  "alternatives",
  "comparisons",
  "listicles",
  "state-pages",
  "vertical-pages",
  "pricing-breakdowns",
  "lead-magnets",
];

let touched = 0;
let skipped = 0;

for (const coll of COLLECTIONS) {
  const dir = join(CONTENT_ROOT, coll);
  let entries;
  try {
    entries = readdirSync(dir).filter((f) => f.endsWith(".md"));
  } catch {
    continue;
  }

  for (const entry of entries) {
    const path = join(dir, entry);
    const source = readFileSync(path, "utf-8");

    if (/^lastReviewedAt:/m.test(source)) {
      skipped++;
      continue;
    }

    // Insert after `updatedAt:` line in frontmatter.
    const updated = source.replace(/^(updatedAt:\s*"[^"]+")$/m, `$1\nlastReviewedAt: "${TODAY}"`);

    if (updated === source) {
      // No updatedAt line found — insert just before the closing `---`.
      // Only touch the first frontmatter block.
      const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
      if (!fmMatch) {
        globalThis.console.warn(`skip (no frontmatter): ${coll}/${entry}`);
        continue;
      }
      const replaced =
        source.slice(0, fmMatch.index) +
        `---\n${fmMatch[1]}\nlastReviewedAt: "${TODAY}"\n---` +
        source.slice(fmMatch.index + fmMatch[0].length);
      writeFileSync(path, replaced, "utf-8");
    } else {
      writeFileSync(path, updated, "utf-8");
    }
    touched++;
  }
}

globalThis.console.log(`touched ${touched} · skipped ${skipped}`);
