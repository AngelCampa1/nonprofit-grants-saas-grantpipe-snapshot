import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("editorial prose polish source regressions", () => {
  it("gives GrantPipe .prose h2 a short ochre accent hairline via ::after", () => {
    const source = readSource("./globals.css");

    expect(source).toMatch(
      /body\[data-site-name="GrantPipe"\][^{]*\.prose h2::after\s*{[^}]*width:\s*2\.5rem;[^}]*height:\s*2px;[^}]*background:\s*color-mix\(in srgb, var\(--color-accent-500\) 70%, transparent\);[^}]*border-radius:\s*9999px;/s,
    );
  });

  it("treats the first paragraph of .article-prose as a lede using an existing ink token", () => {
    const source = readSource("./globals.css");

    // --gp-ink-800 does not exist in this codebase (only 500/600/700/900 are
    // defined in generate-theme-css.ts) — the lede must fall back to
    // --gp-ink-700 rather than referencing the nonexistent token.
    expect(source).not.toContain("--gp-ink-800");
    expect(source).toMatch(
      /\.article-prose > p:first-of-type\s*{[^}]*font-size:\s*var\(--text-body-lg\);[^}]*line-height:\s*1\.7;[^}]*color:\s*var\(--gp-ink-700[^}]*}/s,
    );
  });
});
