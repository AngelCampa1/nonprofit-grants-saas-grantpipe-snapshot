import { describe, expect, it } from "vitest";
// @ts-expect-error — importing an .mjs helper for test coverage of its pure functions.
import { checkContents } from "../check-design-tokens.mjs";

describe("check-design-tokens / checkContents", () => {
  it("flags bracket [var(--color-*)] in className", () => {
    const issues = checkContents(
      "apps/web/src/example.tsx",
      'const x = <div className="bg-[var(--color-primary-500)]" />;',
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].match).toContain("color");
  });

  it("flags bracket [#hex] in className", () => {
    const issues = checkContents(
      "apps/web/src/example.tsx",
      'const x = <div className="bg-[#ff0000]" />;',
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].match).toBe("hex-in-class");
  });

  it("flags raw Tailwind palette classes in className", () => {
    const issues = checkContents(
      "apps/web/src/example.tsx",
      'const x = <div className="text-red-500 bg-blue-100" />;',
    );
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].match).toBe("raw-palette");
  });

  it("flags Astro class attribute with palette colors", () => {
    const issues = checkContents(
      "apps/site/src/pages/example.astro",
      '<div class="bg-emerald-50 text-emerald-700"></div>',
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it("allows design-system semantic tokens", () => {
    const issues = checkContents(
      "apps/web/src/example.tsx",
      'const x = <div className="bg-surface-primary text-success-600 text-destructive" />;',
    );
    expect(issues).toHaveLength(0);
  });

  it("allows primary-/accent-/neutral- design-system scales", () => {
    const issues = checkContents(
      "apps/web/src/example.tsx",
      'const x = <div className="bg-primary-500 text-neutral-700 border-accent-200" />;',
    );
    expect(issues).toHaveLength(0);
  });

  it("allows legitimate motion/spacing/icon bracket tokens", () => {
    const issues = checkContents(
      "packages/ui/src/site/example.astro",
      '<div class="py-[var(--section-py)] duration-[var(--transition-base)] w-[var(--icon-md)]"></div>',
    );
    expect(issues).toHaveLength(0);
  });

  it("ignores color references outside class/className attributes", () => {
    const issues = checkContents(
      "apps/web/src/example.tsx",
      'const style = { color: "#ff0000" }; // not in a class attribute',
    );
    expect(issues).toHaveLength(0);
  });
});
