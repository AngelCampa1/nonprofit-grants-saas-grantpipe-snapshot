import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(): string {
  return readFileSync(new URL("./card.astro", import.meta.url), "utf8");
}

describe("ui/card.astro source regressions", () => {
  it("defaults variant to default and as to div", () => {
    const source = readSource();

    expect(source).toContain('variant = "default"');
    expect(source).toContain('as = "div"');
  });

  it("omits the variant class for the default variant", () => {
    const source = readSource();

    expect(source).toContain('const variantClass = variant === "default" ? undefined : variant;');
  });

  it("composes the shared .gp-card-base class with variant and passthrough class", () => {
    const source = readSource();

    expect(source).toContain('const classes = ["gp-card-base", variantClass, className]');
  });

  it("forces the anchor tag when href is set", () => {
    const source = readSource();

    expect(source).toContain('const Tag: Tag = href ? "a" : as;');
    expect(source).toContain("<Tag class={classes} href={href} {...rest}>");
  });

  it("keeps the typed Props contract free of any", () => {
    const source = readSource();

    expect(source).toContain("variant?: Variant");
    expect(source).toContain("as?: Tag");
    expect(source).toContain("href?: string | URL");
    expect(source).not.toContain(": any");
  });
});
