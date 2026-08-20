/**
 * Contract: no raw multi-column grid without a responsive breakpoint prefix.
 *
 * Any `grid-cols-{2..6}` class must be paired with a smaller-viewport default
 * (`sm:grid-cols-1` / `sm:grid-cols-2` etc.) OR must itself be prefixed
 * (`sm:grid-cols-3` etc.) so it only activates at sm+.
 *
 * KNOWN_VIOLATIONS: file paths (relative to pages/ or components/) that
 * currently fail. Remove entries after fixing them in later batches.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { describe, expect, it } from "vitest";

const PAGES_DIR = resolve(import.meta.dirname, "pages");
const COMPONENTS_DIR = resolve(import.meta.dirname, "components");

/**
 * Files known to have unresponsive grid-col classes.
 * Add file paths (relative to src/pages or src/components) here to defer.
 * Remove when fixed.
 */
const KNOWN_VIOLATIONS: Set<string> = new Set([]);

/** Regex for bare (unprefixed) grid-cols-2 through grid-cols-6 */
const BARE_GRID_COLS_RE = /(?<![a-z]:)grid-cols-([2-6])/g;

/** Regex for any prefixed grid-cols variant */
const PREFIXED_GRID_COLS_RE = /(?:sm|md|lg|xl|2xl):grid-cols-\d+/;

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

function fileHasUnresponsiveGridCols(source: string): boolean {
  const matches = [...source.matchAll(BARE_GRID_COLS_RE)];
  if (matches.length === 0) return false;
  // If the file also contains a responsive grid-cols, consider it acceptable
  // (the author is deliberately mixing — coarse check avoids false positives).
  return !PREFIXED_GRID_COLS_RE.test(source);
}

describe("mobile-first grid contract", () => {
  const pageFiles = collectAstroFiles(PAGES_DIR);
  const componentFiles = collectAstroFiles(COMPONENTS_DIR);
  const allFiles = [
    ...pageFiles.map((f) => ({ root: PAGES_DIR, rel: f })),
    ...componentFiles.map((f) => ({ root: COMPONENTS_DIR, rel: f })),
  ];

  it("no unresponsive grid-cols-{2..6} classes in pages or components (except KNOWN_VIOLATIONS)", () => {
    const newViolations: string[] = [];

    for (const { root, rel } of allFiles) {
      const source = readFileSync(join(root, rel), "utf8");
      if (fileHasUnresponsiveGridCols(source) && !KNOWN_VIOLATIONS.has(rel)) {
        newViolations.push(rel);
      }
    }

    expect(
      newViolations,
      `Unresponsive grid-cols found in:\n${newViolations.join("\n")}\nAdd responsive breakpoint or add to KNOWN_VIOLATIONS.`,
    ).toHaveLength(0);
  });

  it("KNOWN_VIOLATIONS entries still actually have unresponsive grid cols (remove when fixed)", () => {
    for (const violation of KNOWN_VIOLATIONS) {
      // Try pages then components
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
      if (!source) continue; // file may have been deleted

      expect(
        fileHasUnresponsiveGridCols(source),
        `'${violation}' is in KNOWN_VIOLATIONS but no longer has unresponsive grid cols. Remove it from the list.`,
      ).toBe(true);
    }
  });
});
