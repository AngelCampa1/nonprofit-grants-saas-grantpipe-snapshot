import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(): string {
  return readFileSync(new URL("./field.astro", import.meta.url), "utf8");
}

describe("ui/field.astro source regressions", () => {
  it("defaults the control to input", () => {
    const source = readSource();

    expect(source).toContain('control = "input"');
  });

  it("composes the shared .gp-field class with mobile-safe class and passthrough class", () => {
    const source = readSource();

    expect(source).toContain('"gp-field"');
    expect(source).toContain("gp-field--mobile-safe");
    expect(source).toContain("className");
  });

  it("adds mobile-safe sizing to prevent iOS zoom and meet 48px tap target", () => {
    const source = readSource();

    expect(source).toContain("font-size: 16px");
    expect(source).toContain("min-height: 48px");
  });

  it("renders textarea, select, and input branches", () => {
    const source = readSource();

    expect(source).toContain('control === "textarea" ? (');
    expect(source).toContain("<textarea class={classes} {...rest}>");
    expect(source).toContain('control === "select" ? (');
    expect(source).toContain("<select class={classes} {...rest}>");
    expect(source).toContain("<input class={classes} {...rest} />");
  });

  it("keeps the typed Props contract free of any", () => {
    const source = readSource();

    expect(source).toContain("control?: Control");
    expect(source).toContain("class?: string");
    expect(source).not.toContain(": any");
  });
});
