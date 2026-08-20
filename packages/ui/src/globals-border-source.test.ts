import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("globals.css border source", () => {
  const css = read("src/globals.css");

  it("restores the design-token border color on the universal selector group", () => {
    const match = css.match(
      /\*,\s*::after,\s*::before,\s*::backdrop,\s*::file-selector-button\s*\{[^}]*border-color:\s*var\(--border\);[^}]*\}/,
    );
    expect(match).not.toBeNull();
  });

  it("lives inside an @layer base block", () => {
    expect(css).toMatch(
      /@layer base \{[\s\S]*\*,\s*::after,\s*::before,\s*::backdrop,\s*::file-selector-button\s*\{[\s\S]*border-color:\s*var\(--border\);[\s\S]*\}[\s\S]*\}/,
    );
  });
});
