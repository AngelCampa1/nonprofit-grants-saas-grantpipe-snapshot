import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";
import { marketingContentDirectory } from "../lib/marketing-content-root";

/**
 * P4 programmatic-content guard: state-pages and vertical-pages are the
 * highest risk surface for Helpful Content downgrades because they share
 * a template. This test asserts each entry carries enough entry-specific
 * data (grant agencies, filing requirements, vertical grantors, pain
 * points) that the page could not have been copy-pasted from a sibling.
 *
 * If an entry cannot clear the bar, the correct action is to enrich it
 * with real data or mark it `noindex: true` - NOT to weaken this test.
 */

const STATE_DIR = join(marketingContentDirectory, "state-pages");
const VERTICAL_DIR = join(marketingContentDirectory, "vertical-pages");

function getScalar(frontmatter: string, field: string): string | null {
  const re = new RegExp(`^${field}:\\s*"?([^"\\n]+)"?\\s*$`, "m");
  const m = frontmatter.match(re);
  return m ? m[1]!.trim() : null;
}

function countListItems(frontmatter: string, field: string): number {
  // Match a YAML block like:
  //   field:
  //     - item
  //     - item
  // or nested-object form:
  //   field:
  //     - name: "X"
  //       count: 10
  //     - name: "Y"
  //       count: 20
  // Capture everything from the field line to the next top-level field
  // (a line starting at column 0), then count "- " items inside.
  // `(?=^\\S|$(?![\\s\\S]))` = next line starts with non-whitespace OR end
  // of input. The second branch matters when the matched field is the last
  // top-level entry in frontmatter (no sibling to terminate on). Using
  // `\\Z` here would be a literal `Z` in JS regex - not an end-anchor.
  const re = new RegExp(`^${field}:\\s*\\n((?:[ \\t]+.*\\n?)+?)(?=^\\S|$(?![\\s\\S]))`, "m");
  const m = frontmatter.match(re);
  if (!m) return 0;
  return m[1]!.split("\n").filter((l) => /^\s+-\s/.test(l)).length;
}

function listMarkdown(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => join(dir, f));
}

function wordCount(body: string): number {
  return body.split(/\s+/).filter(Boolean).length;
}

function splitFrontmatterAndBody(source: string): { fm: string; body: string } | null {
  const m = source.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return null;
  return { fm: m[1]!, body: m[2]! };
}

describe("state-pages programmatic content richness", () => {
  const files = listMarkdown(STATE_DIR);

  test("at least one state page exists", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  const failures: string[] = [];

  for (const file of files) {
    const slug = file.replace(/\\/g, "/").split("/").pop()!;
    test(`${slug} has state-specific data`, () => {
      const source = readFileSync(file, "utf-8");
      const split = splitFrontmatterAndBody(source);
      expect(split, `${slug} missing frontmatter`).not.toBeNull();
      const { fm, body } = split!;

      const state = getScalar(fm, "state");
      const stateCode = getScalar(fm, "stateCode");
      const establishmentCount = getScalar(fm, "establishmentCount");
      const licensingNotes = getScalar(fm, "licensingNotes");
      const seasonalNotes = getScalar(fm, "seasonalNotes");
      const topMetroCount = countListItems(fm, "topMetros");

      const missing: string[] = [];
      if (!state) missing.push("state");
      if (!stateCode) missing.push("stateCode");
      if (!establishmentCount) missing.push("establishmentCount");
      if (!licensingNotes || licensingNotes.length < 80)
        missing.push("licensingNotes (>=80 chars)");
      if (!seasonalNotes || seasonalNotes.length < 80) missing.push("seasonalNotes (>=80 chars)");
      if (topMetroCount < 3) missing.push(`topMetros (>=3, have ${topMetroCount})`);
      if (wordCount(body) < 500) missing.push(`body word count >= 500 (have ${wordCount(body)})`);

      if (missing.length > 0) {
        failures.push(`${slug}: ${missing.join(", ")}`);
      }
      expect(missing, `${slug}: ${missing.join(", ")}`).toEqual([]);
    });
  }
});

describe("vertical-pages programmatic content richness", () => {
  const files = listMarkdown(VERTICAL_DIR);

  test("at least one vertical page exists", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const slug = file.replace(/\\/g, "/").split("/").pop()!;
    test(`${slug} has vertical-specific data`, () => {
      const source = readFileSync(file, "utf-8");
      const split = splitFrontmatterAndBody(source);
      expect(split, `${slug} missing frontmatter`).not.toBeNull();
      const { fm, body } = split!;

      const verticalType = getScalar(fm, "verticalType");
      const complianceNotes = getScalar(fm, "complianceNotes");
      const painPointCount = countListItems(fm, "keyPainPoints");
      const grantTypeCount = countListItems(fm, "commonGrantTypes");

      const missing: string[] = [];
      if (!verticalType) missing.push("verticalType");
      if (!complianceNotes || complianceNotes.length < 120)
        missing.push("complianceNotes (>=120 chars)");
      if (painPointCount < 3) missing.push(`keyPainPoints (>=3, have ${painPointCount})`);
      if (grantTypeCount < 3) missing.push(`commonGrantTypes (>=3, have ${grantTypeCount})`);
      if (wordCount(body) < 500) missing.push(`body word count >= 500 (have ${wordCount(body)})`);

      expect(missing, `${slug}: ${missing.join(", ")}`).toEqual([]);
    });
  }
});
