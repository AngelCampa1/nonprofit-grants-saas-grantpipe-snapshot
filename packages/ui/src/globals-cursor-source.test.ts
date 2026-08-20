import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("globals.css cursor source", () => {
  const css = read("src/globals.css");

  it("restores pointer cursor on native interactive controls", () => {
    const match = css.match(
      /button:not\(:disabled\):not\(\[aria-disabled="true"\]\)[\s\S]{0,300}?\{[^}]*cursor:\s*pointer;[^}]*\}/,
    );
    expect(match).not.toBeNull();
  });

  it("excludes aria-disabled anchors from the pointer rule", () => {
    expect(css).toMatch(/a\[href\]:not\(\[aria-disabled="true"\]\)/);
    expect(css).not.toMatch(/^\s*a\[href\],?\s*$/m);
  });

  it("does not force a pointer cursor on labels (target's disabled state is unknowable in CSS)", () => {
    expect(css).not.toMatch(/label\[for\]/);
  });

  it("sets not-allowed cursor on disabled controls", () => {
    const match = css.match(/button:disabled[\s\S]{0,200}?\{[^}]*cursor:\s*not-allowed;[^}]*\}/);
    expect(match).not.toBeNull();
  });

  it("lives inside an @layer base block", () => {
    expect(css).toMatch(/@layer base \{[\s\S]*button:not\(:disabled\)[\s\S]*\}/);
  });
});
