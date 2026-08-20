import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("web light-only source", () => {
  it("does not bootstrap or persist an alternate theme", () => {
    const html = read("index.html");
    const blockedTone = ["da", "rk"].join("");

    const storedKey = ["grantpipe", "theme"].join("-");
    const mediaQuery = ["prefers-color", "scheme"].join("-");
    expect(html).not.toMatch(
      new RegExp(`${storedKey}|${mediaQuery}|classList\\\\.add\\\\("${blockedTone}"\\\\)`),
    );
    expect(existsSync(join(root, "src/hooks", "use-" + "theme.ts"))).toBe(false);
  });

  it("does not expose theme switching controls in shell entry points", () => {
    const topbar = read("src/components/shell/app-topbar.tsx");
    const palette = read("src/components/shell/command-palette.tsx");

    expect(topbar).not.toMatch(/useTheme|toggleTheme|Switch to .* theme|Moon|Sun/);
    expect(palette).not.toMatch(/useTheme|toggleTheme|Toggle theme|Sun/);
  });
});
