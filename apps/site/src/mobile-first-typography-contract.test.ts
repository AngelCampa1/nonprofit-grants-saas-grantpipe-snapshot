/**
 * Contract: no raw `text-5xl`, `text-6xl`, or `text-7xl` without a smaller
 * viewport companion.
 *
 * Bare large text classes must be paired with a smaller-screen override
 * (`text-3xl sm:text-5xl` etc.) OR must themselves be prefixed
 * (`sm:text-5xl` etc.) so they only activate at sm+.
 *
 * KNOWN_VIOLATIONS: file paths to defer. Remove when fixed in later batches.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { describe, expect, it } from "vitest";

const PAGES_DIR = resolve(import.meta.dirname, "pages");
const COMPONENTS_DIR = resolve(import.meta.dirname, "components");

const KNOWN_VIOLATIONS: Set<string> = new Set([]);

/** Matches bare (unprefixed) large text classes */
const BARE_LARGE_TEXT_RE = /(?<![a-z]:)text-(?:5xl|6xl|7xl)/g;

/** Matches prefixed large text classes */
const PREFIXED_LARGE_TEXT_RE = /(?:sm|md|lg|xl|2xl):text-(?:5xl|6xl|7xl)/;

function collectAstroFiles(dir: string, base = ""): string[] {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];
  const entries = readdirSync(dir);
  const result: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const relativePath = base ? `${base}/${entry}` : entry;
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      result.push(...collectAstroFiles(fullPath, relativePath));
    } else if (entry.endsWith(".astro")) {
      result.push(relativePath);
    }
  }
  return result;
}

function fileHasUnresponsiveLargeText(source: string): boolean {
  const matches = [...source.matchAll(BARE_LARGE_TEXT_RE)];
  if (matches.length === 0) return false;
  // If the file also contains a prefixed large text, the author is already
  // doing responsive type — coarse check avoids false positives.
  return !PREFIXED_LARGE_TEXT_RE.test(source);
}

describe("mobile-first typography contract", () => {
  const pageFiles = collectAstroFiles(PAGES_DIR);
  const componentFiles = collectAstroFiles(COMPONENTS_DIR);
  const allFiles = [
    ...pageFiles.map((f) => ({ root: PAGES_DIR, rel: f })),
    ...componentFiles.map((f) => ({ root: COMPONENTS_DIR, rel: f })),
  ];

  it("no unresponsive text-5xl/6xl/7xl in pages or components (except KNOWN_VIOLATIONS)", () => {
    const newViolations: string[] = [];

    for (const { root, rel } of allFiles) {
      const source = readFileSync(join(root, rel), "utf8");
      if (fileHasUnresponsiveLargeText(source) && !KNOWN_VIOLATIONS.has(rel)) {
        newViolations.push(rel);
      }
    }

    expect(
      newViolations,
      `Unresponsive large text classes found in:\n${newViolations.join("\n")}\nAdd responsive companion or add to KNOWN_VIOLATIONS.`,
    ).toHaveLength(0);
  });

  it("KNOWN_VIOLATIONS entries still have unresponsive large text (remove when fixed)", () => {
    for (const violation of KNOWN_VIOLATIONS) {
      let source: string | undefined;
      try {
        source = readFileSync(join(PAGES_DIR, violation), "utf8");
      } catch {
        /* not in pages */
      }
      if (!source) {
        try {
          source = readFileSync(join(COMPONENTS_DIR, violation), "utf8");
        } catch {
          /* not in components */
        }
      }
      if (!source) continue;

      expect(
        fileHasUnresponsiveLargeText(source),
        `'${violation}' is in KNOWN_VIOLATIONS but no longer has unresponsive large text. Remove it.`,
      ).toBe(true);
    }
  });
});
