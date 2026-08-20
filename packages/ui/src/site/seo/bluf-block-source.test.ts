import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("bluf block source regressions", () => {
  it("keeps the bluf-block class name and note role (schema speakable selector depends on it)", () => {
    const source = readSource("./bluf-block.astro");

    expect(source).toContain("bluf-block");
    expect(source).toContain('role="note"');
  });

  it("renders a bold left accent rule so the lede reads as a pull-quote-style answer", () => {
    const source = readSource("./bluf-block.astro");

    expect(source).toMatch(/border-l-4/);
    expect(source).toMatch(/border-accent-500/);
  });

  it("squares the left corners and rounds only the right corners", () => {
    const source = readSource("./bluf-block.astro");

    expect(source).toContain("rounded-l-none");
    expect(source).toMatch(/rounded-r-(md|lg)/);
    expect(source).not.toMatch(/\brounded-md\b/);
  });

  it("keeps the mono uppercase accent-700 label and body-lg medium text", () => {
    const source = readSource("./bluf-block.astro");

    expect(source).toContain("text-accent-700");
    expect(source).toContain("var(--text-body-lg)");
    expect(source).toContain("font-medium");
  });
});
