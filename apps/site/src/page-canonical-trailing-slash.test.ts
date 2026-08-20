import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * Enforces that every .astro page which assigns a `canonicalUrl` constant
 * at file scope ends the expression with a trailing slash (or wraps with
 * ensureTrailingSlash). Prevents JSON-LD @id / url fields from dereferencing
 * a slashless URL while <link rel="canonical"> is auto-normalized.
 */

const PAGES_ROOT = join(__dirname, "pages");

function walkAstroPages(directory: string, prefix = ""): string[] {
  const pages: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      pages.push(...walkAstroPages(fullPath, relPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".astro")) {
      pages.push(relPath);
    }
  }

  return pages.sort();
}

const CANDIDATE_FILES = walkAstroPages(PAGES_ROOT).filter((relPath) =>
  readFileSync(join(PAGES_ROOT, relPath), "utf-8").includes("canonicalUrl"),
);

describe("page canonical trailing-slash contract", () => {
  for (const relPath of CANDIDATE_FILES) {
    it(`${relPath} normalizes canonicalUrl with a trailing slash`, () => {
      const filePath = join(PAGES_ROOT, relPath);
      const source = readFileSync(filePath, "utf-8");

      // Two sources of truth to audit:
      //   (a) file-scope `const canonicalUrl = <expr>` — must be a
      //       trailing-slash literal or wrapped in ensureTrailingSlash.
      //   (b) prop bindings `canonicalUrl={<expr>}` in component calls —
      //       either reference the already-normalized local variable
      //       (a bare identifier) or pass a normalized expression inline.

      const constRe = /^const\s+canonicalUrl\s*=\s*([^;\n]+)/gm;
      const constMatches = Array.from(source.matchAll(constRe));

      // Extract prop bindings `canonicalUrl={…}` with brace-balanced
      // scanning so template-literal `${…}` interpolations don't
      // prematurely close the capture.
      const propMatches: Array<{ 1: string }> = [];
      const propStartRe = /canonicalUrl\s*=\s*\{/g;
      let startMatch: RegExpExecArray | null;
      while ((startMatch = propStartRe.exec(source)) !== null) {
        let depth = 1;
        let i = startMatch.index + startMatch[0].length;
        while (i < source.length && depth > 0) {
          const ch = source[i]!;
          if (ch === "{") depth++;
          else if (ch === "}") depth--;
          if (depth > 0) i++;
        }
        if (depth === 0) {
          propMatches.push({
            1: source.slice(startMatch.index + startMatch[0].length, i),
          });
        }
      }

      expect(
        constMatches.length + propMatches.length,
        `${relPath}: no canonicalUrl assignment or binding found`,
      ).toBeGreaterThan(0);

      const isNormalized = (expr: string): boolean => {
        const e = expr.trim();
        return (
          /ensureTrailingSlash\s*\(/.test(e) ||
          /\/[`'"]\s*$/.test(e.replace(/\s+$/, "")) ||
          /\/["']\s*$/.test(e)
        );
      };

      for (const match of constMatches) {
        const expr = match[1]!.trim();
        expect(
          isNormalized(expr),
          `${relPath}: const canonicalUrl must end with a trailing slash or use ensureTrailingSlash(). Got: ${expr}`,
        ).toBe(true);
      }

      for (const match of propMatches) {
        const expr = match[1]!.trim();
        // A bare identifier reference (e.g. `canonicalUrl`) is fine IFF
        // the file also has a normalized file-scope assignment that
        // already cleared the check above.
        if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(expr) && constMatches.length > 0) {
          continue;
        }
        expect(
          isNormalized(expr),
          `${relPath}: canonicalUrl prop binding must pass a normalized URL. Got: ${expr}`,
        ).toBe(true);
      }
    });
  }
});
