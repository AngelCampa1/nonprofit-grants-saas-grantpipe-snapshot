import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(fileName: string): string {
  return readFileSync(join(process.cwd(), `src/site/hubs/${fileName}`), "utf8");
}

describe("hub layout consistency sweep (reveal + accent primitives)", () => {
  it("content-hub reveals its category card grid and uses the accent kicker", () => {
    const source = readSource("content-hub.astro");

    expect(source).toContain("scroll-in");
    expect(source).toContain("gp-kicker--accent");
    // The h1 hero title itself must stay off the reveal system to protect LCP.
    expect(source).not.toMatch(/<h1[^>]*scroll-in/);
  });

  it("category-hub reveals its item card grid and uses the accent kicker", () => {
    const source = readSource("category-hub.astro");

    expect(source).toContain("scroll-in");
    expect(source).toContain("gp-kicker--accent");
    expect(source).not.toMatch(/<h1[^>]*scroll-in/);
  });
});
