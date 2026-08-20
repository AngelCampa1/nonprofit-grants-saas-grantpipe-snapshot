import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readSource(): string {
  return readFileSync(path.resolve(__dirname, "./statistic-citation.astro"), "utf8");
}

describe("statistic-citation source regressions", () => {
  it("renders short numeric stats in mono at heading size via <data>", () => {
    const source = readSource();

    expect(source).toContain("<data");
    expect(source).toContain(
      'class="font-mono text-[length:var(--text-heading)] font-bold text-brand-primary leading-tight"',
    );
  });

  it("renders long prose stats in editorial sans at body-lg — not mono heading", () => {
    const source = readSource();

    expect(source).toContain("text-[length:var(--text-body-lg)]");
    expect(source).toContain("font-semibold");
    expect(source).toContain("text-brand-text");
  });

  it("branches on stat length + numeric pattern to pick rendering mode", () => {
    const source = readSource();

    expect(source).toMatch(/isNumericStat|isShortStat|statIsNumeric/);
    expect(source).toMatch(/stat\.length\s*<=\s*30\s*&&\s*\/\\d\/\.test\(stat\)/);
  });

  it("always renders the Source caption in sans, not mono", () => {
    const source = readSource();

    const sourceCaption = source.match(/Source:[\s\S]*?sourceUrl[\s\S]*?source[\s\S]*?\}/);

    expect(sourceCaption).toBeTruthy();
    const captionLine = source.split("\n").find((line) => line.includes("Source:"));

    expect(captionLine).toBeTruthy();
    expect(captionLine).not.toContain("font-mono");
  });

  it("keeps the JSON-LD statistic citation schema emission", () => {
    const source = readSource();

    expect(source).toContain("SchemaMarkup");
    expect(source).toContain("buildStatisticCitationSchema");
    expect(source).toContain("emitSchema");
  });
});
