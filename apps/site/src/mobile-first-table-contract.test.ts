/**
 * Contract: every `<table` in .astro files must be wrapped in an element
 * with a class containing `overflow-x-auto` within 5 lines above it.
 *
 * Tables without horizontal scroll wrappers cause horizontal overflow on
 * narrow viewports. This contract enforces the wrapper pattern:
 *
 *   <div class="overflow-x-auto ...">
 *     <table ...>
 *
 * KNOWN_VIOLATIONS: file paths to defer. Remove when fixed in later batches.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { describe, expect, it } from "vitest";

const PAGES_DIR = resolve(import.meta.dirname, "pages");
const COMPONENTS_DIR = resolve(import.meta.dirname, "components");

/**
 * Files that currently have custom scroll wrapper classes (e.g. gp-matrix-scroll,
 * qb-matrix-scroll, gp-books-coa-table-wrap) that are functionally equivalent
 * to overflow-x-auto but don't use the Tailwind utility class name.
 * Later batches will convert these to the standard pattern. Remove when fixed.
 *
 * Batch 03: feature-comparison-matrix.astro converted to overflow-x-auto.
 */
const KNOWN_VIOLATIONS: Set<string> = new Set(["books.astro", "generated-product-stage.astro"]);

const LOOK_BACK_LINES = 5;

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

function findUnwrappedTables(source: string): number[] {
  const lines = source.split("\n");
  const violatingLineNumbers: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (!/<table[\s>]/.test(line)) continue;

    // Look back up to LOOK_BACK_LINES lines for overflow-x-auto
    const startLine = Math.max(0, i - LOOK_BACK_LINES);
    const context = lines.slice(startLine, i + 1).join("\n");
    if (!context.includes("overflow-x-auto")) {
      violatingLineNumbers.push(i + 1);
    }
  }

  return violatingLineNumbers;
}

describe("mobile-first table contract", () => {
  const pageFiles = collectAstroFiles(PAGES_DIR);
  const componentFiles = collectAstroFiles(COMPONENTS_DIR);
  const allFiles = [
    ...pageFiles.map((f) => ({ root: PAGES_DIR, rel: f })),
    ...componentFiles.map((f) => ({ root: COMPONENTS_DIR, rel: f })),
  ];

  it("every <table> must have overflow-x-auto wrapper within 5 lines above (except KNOWN_VIOLATIONS)", () => {
    const newViolations: string[] = [];

    for (const { root, rel } of allFiles) {
      const source = readFileSync(join(root, rel), "utf8");
      const unwrappedLines = findUnwrappedTables(source);
      if (unwrappedLines.length > 0 && !KNOWN_VIOLATIONS.has(rel)) {
        newViolations.push(`${rel} (lines: ${unwrappedLines.join(", ")})`);
      }
    }

    expect(
      newViolations,
      `Tables without overflow-x-auto wrapper found in:\n${newViolations.join("\n")}`,
    ).toHaveLength(0);
  });

  it("KNOWN_VIOLATIONS entries still have unwrapped tables (remove when fixed)", () => {
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
        findUnwrappedTables(source).length,
        `'${violation}' is in KNOWN_VIOLATIONS but no longer has unwrapped tables. Remove it.`,
      ).toBeGreaterThan(0);
    }
  });
});
