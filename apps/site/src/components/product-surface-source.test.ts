import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(): string {
  return readFileSync(new URL("./product-surface.astro", import.meta.url), "utf8");
}

describe("product-surface.astro source regressions", () => {
  it("wraps every variant in the shared .gp-surface head/body shell", () => {
    const source = readSource();

    expect(source).toContain('class="gp-surface"');
    expect(source).toContain('class="gp-surface__head"');
    expect(source).toContain('class="gp-surface__body"');
  });

  it("declares a discriminated Props union keyed on variant, with no `any`", () => {
    const source = readSource();

    expect(source).toContain('variant: "calendar"');
    expect(source).toContain('variant: "meter"');
    expect(source).toContain('variant: "rows"');
    expect(source).not.toMatch(/:\s*any\b/);
  });

  it("renders the calendar variant with .gp-surface-cal date chips", () => {
    const source = readSource();

    expect(source).toContain("gp-surface-cal");
    expect(source).toContain("gp-surface-cal__item");
    expect(source).toContain("gp-surface-cal__date");
  });

  it("renders the meter variant with a track/fill and clamps pct to 0-100", () => {
    const source = readSource();

    expect(source).toContain("gp-surface-meter");
    expect(source).toContain("gp-surface-meter__label");
    expect(source).toContain("gp-surface-meter__track");
    expect(source).toContain("gp-surface-meter__fill");
    // Must clamp the raw pct value before using it in the inline width style.
    expect(source).toMatch(/Math\.min\(100,\s*Math\.max\(0,/);
  });

  it("renders the rows variant with .gp-surface-row and an optional status pill", () => {
    const source = readSource();

    expect(source).toContain("gp-surface-row");
    expect(source).toContain("gp-surface-row__status");
  });

  it("stays a static component with no client directive", () => {
    const source = readSource();

    expect(source).not.toMatch(/client:/);
  });

  it("has no era-word identifiers", () => {
    const source = readSource();

    expect(source).not.toMatch(/-redesign|-new\b|-v2\b|-legacy\b/);
  });
});
