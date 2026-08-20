import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("site light-only source", () => {
  it("does not ship a theme toggle component or exports", () => {
    const toggleFile = ["theme", "toggle.tsx"].join("-");
    expect(existsSync(join(root, "src/site/components", toggleFile))).toBe(false);

    const index = read("src/site/index.ts");
    expect(index).not.toContain(["Theme", "Toggle"].join(""));
  });

  it("does not include alternate theme bootstrap or CSS selectors", () => {
    const scripts = read("src/site/lib/base-layout-scripts.ts");
    const css = read("src/site/styles/globals.css");
    const blockedTone = ["da", "rk"].join("");
    const colorScheme = ["color", "scheme"].join("-");
    const stagedPrefix = ["_", "dk", "-"].join("");

    expect(scripts).not.toMatch(/localStorage\.getItem\("theme"\)|classList\.add\(theme\)/);
    expect(css).not.toMatch(
      new RegExp(
        `prefers-${colorScheme}:\\\\s*${blockedTone}|:root\\\\.${blockedTone}|theme-${blockedTone}-only|${stagedPrefix}|${colorScheme}:\\\\s*${blockedTone}`,
      ),
    );
  });

  it("does not render appearance slots or theme-specific logo swaps", () => {
    const header = read("src/site/components/site-header.astro");
    const footer = read("src/site/components/site-footer.astro");
    const blockedTone = ["da", "rk"].join("");
    const toggleSlot = ["theme", "toggle"].join("-");

    expect(header).not.toMatch(
      new RegExp(
        `${toggleSlot}|logo${blockedTone[0].toUpperCase()}${blockedTone.slice(1)}|theme-light-only|theme-${blockedTone}-only`,
      ),
    );
    expect(footer).not.toMatch(
      new RegExp(
        `logo${blockedTone[0].toUpperCase()}${blockedTone.slice(1)}|theme-light-only|theme-${blockedTone}-only`,
      ),
    );
  });
});
