import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function readSource(): string {
  return readFileSync(resolve(import.meta.dirname, "./viewport-aware-details.astro"), "utf8");
}

describe("viewport-aware-details source regressions", () => {
  it("uses <details> as the outermost element", () => {
    const source = readSource();

    expect(source).toContain("<details class={detailsClasses}");
  });

  it("composes the gp-viewport-details base class with the passthrough className", () => {
    const source = readSource();

    expect(source).toContain('"gp-viewport-details"');
    expect(source).toContain("className");
    expect(source).toContain(".filter(Boolean)");
  });

  it("composes the summary class with the passthrough summaryClass", () => {
    const source = readSource();

    expect(source).toContain('"gp-viewport-details__summary"');
    expect(source).toContain("summaryClass");
  });

  it("defaults the open prop to false", () => {
    const source = readSource();

    expect(source).toContain("open = false");
  });

  it("exposes a summary named slot inside the <summary> element", () => {
    const source = readSource();

    expect(source).toContain('<slot name="summary"');
    expect(source).toContain("<summary class={summaryClasses}>");
  });

  it("opens all instances at 640px or wider on load and on resize", () => {
    const source = readSource();

    expect(source).toContain("window.innerWidth >= 640");
    expect(source).toContain("el.open = true");
    expect(source).toContain('window.addEventListener("resize", handleResize');
  });

  it("debounces the resize handler to avoid thrashing", () => {
    const source = readSource();

    expect(source).toContain("clearTimeout(resizeTimer)");
    expect(source).toContain("setTimeout(syncViewportDetails, 100)");
  });

  it("cleans up the resize listener and timer before view transition swap", () => {
    const source = readSource();

    expect(source).toContain('window.removeEventListener("resize", handleResize)');
    expect(source).toContain("astro:before-swap");
    expect(source).toContain("clearTimeout(resizeTimer)");
  });

  it("gives the summary a 48px minimum tap target height", () => {
    const source = readSource();

    expect(source).toContain("min-height: 3rem");
  });

  it("keeps the Props contract free of any", () => {
    const source = readSource();

    expect(source).not.toContain(": any");
    expect(source).toContain("class?: string");
    expect(source).toContain("summaryClass?: string");
    expect(source).toContain("open?: boolean");
  });
});
