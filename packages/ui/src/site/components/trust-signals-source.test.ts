import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readSource(): string {
  return readFileSync(path.resolve(__dirname, "./trust-signals.astro"), "utf8");
}

describe("trust-signals source regressions", () => {
  it("uses a responsive grid instead of flex-wrap for even column rhythm", () => {
    const source = readSource();

    expect(source).toContain("grid-cols-1");
    expect(source).toContain("sm:grid-cols-2");
    expect(source).toContain("lg:grid-cols-4");
    expect(source).not.toContain("sm:flex sm:flex-wrap sm:justify-center");
  });

  it("adds min-w-0 to the chip and its text so long labels wrap inside their cell", () => {
    const source = readSource();

    expect(source).toMatch(/trust-signal-item[^"]*min-w-0/);
    expect(source).toContain('"min-w-0 leading-relaxed"');
  });

  it("uses compact rectangular chips without pill or hover-lift treatment", () => {
    const source = readSource();

    expect(source).not.toContain("rounded-full border");
    expect(source).not.toContain("shadow-sm");
    expect(source).not.toContain("hover:-translate-y-px");
  });
});
