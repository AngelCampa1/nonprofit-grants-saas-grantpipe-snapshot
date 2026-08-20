import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const indexPath = fileURLToPath(new URL("./pages/index.astro", import.meta.url));
const dashboardMockPath = fileURLToPath(
  new URL("./components/dashboard-mock.astro", import.meta.url),
);

describe("homepage motion contract", () => {
  it("keeps the hero h1 free of scroll-in and transform-based entrance delay to protect LCP", () => {
    const source = readFileSync(indexPath, "utf-8");
    const h1Match = source.match(/<h1[^>]*>/);
    expect(h1Match).not.toBeNull();
    const h1Tag = h1Match?.[0] ?? "";
    expect(h1Tag).not.toContain("scroll-in");
    expect(h1Tag).not.toContain("gp-hero-stagger__item");
  });

  it("guards the hero entrance stagger with a prefers-reduced-motion rule", () => {
    const source = readFileSync(indexPath, "utf-8");
    expect(source).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(source).toMatch(/\.gp-hero-stagger__title/);
    expect(source).toMatch(/\.gp-hero-stagger__item/);
  });

  it("guards the dashboard mock ambient animation with a prefers-reduced-motion rule", () => {
    const source = readFileSync(dashboardMockPath, "utf-8");
    expect(source).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(source).toMatch(/@property --bar/);
  });
});
