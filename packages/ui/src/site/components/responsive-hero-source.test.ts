import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function readSource(): string {
  return readFileSync(resolve(import.meta.dirname, "./responsive-hero.astro"), "utf8");
}

describe("responsive-hero source regressions", () => {
  it("uses a <section> as the outermost element", () => {
    const source = readSource();

    expect(source).toContain("<section class={sectionClasses}");
  });

  it("composes the responsive-hero base class with the passthrough className", () => {
    const source = readSource();

    expect(source).toContain('"responsive-hero"');
    expect(source).toContain("className");
    expect(source).toContain(".filter(Boolean)");
  });

  it("exposes eyebrow, heading, copy, cta, and media named slots", () => {
    const source = readSource();

    expect(source).toContain('name="eyebrow"');
    expect(source).toContain('name="heading"');
    expect(source).toContain('name="copy"');
    expect(source).toContain('name="cta"');
    expect(source).toContain('name="media"');
  });

  it("guards optional slots with Astro.slots.has() before rendering", () => {
    const source = readSource();

    expect(source).toContain('Astro.slots.has("eyebrow")');
    expect(source).toContain('Astro.slots.has("copy")');
    expect(source).toContain('Astro.slots.has("cta")');
    expect(source).toContain('Astro.slots.has("media")');
  });

  it("forces clamp() typography on the heading slot wrapper", () => {
    const source = readSource();

    expect(source).toContain("clamp(2.35rem, 7vw, 4.25rem)");
    expect(source).toContain(".responsive-hero__heading :global(h1)");
    expect(source).toContain(".responsive-hero__heading :global(h2)");
  });

  it("switches to a two-column grid layout at min-width 900px", () => {
    const source = readSource();

    expect(source).toContain("@media (min-width: 900px)");
    expect(source).toContain("grid-template-columns: minmax(0, 1fr) minmax(21rem, 0.64fr)");
  });

  it("stacks the CTA row vertically on mobile, horizontally at 640px+", () => {
    const source = readSource();

    expect(source).toContain("flex-direction: column");
    expect(source).toContain("@media (min-width: 640px)");
    expect(source).toContain("flex-direction: row");
  });

  it("uses fluid padding via clamp() instead of fixed pixel values", () => {
    const source = readSource();

    expect(source).toContain("padding: clamp(2.25rem");
    expect(source).toContain("gap: clamp(2rem");
  });

  it("keeps the Props contract free of any", () => {
    const source = readSource();

    expect(source).not.toContain(": any");
    expect(source).toContain("class?: string");
    expect(source).toContain("innerClass?: string");
  });
});
