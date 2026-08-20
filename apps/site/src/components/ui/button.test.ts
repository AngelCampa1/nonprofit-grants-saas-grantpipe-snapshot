import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(): string {
  return readFileSync(new URL("./button.astro", import.meta.url), "utf8");
}

describe("ui/button.astro source regressions", () => {
  it("defaults variant to primary and size to md", () => {
    const source = readSource();

    expect(source).toContain('variant = "primary"');
    expect(source).toContain('size = "md"');
  });

  it("composes the shared .gp-mkt-btn class with variant, size, and passthrough class", () => {
    const source = readSource();

    expect(source).toContain('"gp-mkt-btn"');
    expect(source).toContain("variant");
    expect(source).toContain("size");
    expect(source).toContain("className");
    expect(source).toContain('.join(" ")');
  });

  it("adds mobileFullWidth prop that defaults to true", () => {
    const source = readSource();

    expect(source).toContain("mobileFullWidth");
    expect(source).toContain("mobileFullWidth = true");
    expect(source).toContain("gp-mkt-btn--mobile-fw");
  });

  it("renders an anchor when href is set and a button otherwise", () => {
    const source = readSource();

    expect(source).toContain("href ? (");
    expect(source).toContain("<a class={classes} href={href} {...rest}>");
    expect(source).toContain("<button class={classes} type={type} {...rest}>");
  });

  it("defaults the native button type to button and forwards extra attributes", () => {
    const source = readSource();

    expect(source).toContain('type = "button"');
    expect(source).toContain("...rest");
  });

  it("keeps the typed Props contract free of any", () => {
    const source = readSource();

    expect(source).toContain("variant?: Variant");
    expect(source).toContain("size?: Size");
    expect(source).toContain("href?: string | URL");
    expect(source).not.toContain(": any");
  });
});
