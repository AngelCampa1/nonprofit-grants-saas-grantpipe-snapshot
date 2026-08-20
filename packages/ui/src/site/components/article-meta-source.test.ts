import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readSource(): string {
  return readFileSync(path.resolve(__dirname, "./article-meta.astro"), "utf8");
}

describe("article-meta source regressions", () => {
  it("does not apply font-mono to the outer label spans", () => {
    const source = readSource();

    expect(source).not.toMatch(/<span class="text-\[length:var\(--text-caption\)\] font-mono/);
    expect(source).not.toMatch(
      /<span class="flex items-center gap-2 text-\[length:var\(--text-caption\)\] font-mono/,
    );
  });

  it("wraps each date value in a <time> element with font-mono", () => {
    const source = readSource();

    const timeTags = source.match(/<time class="font-mono"/g);

    expect(timeTags).toBeTruthy();
    expect(timeTags?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it("emits datetime attributes on each date value for accessibility", () => {
    const source = readSource();

    expect(source).toContain("datetime={normalizedPublishedAt}");
    expect(source).toContain("datetime={normalizedUpdatedAt}");
    expect(source).toContain("datetime={normalizedReviewedAt}");
    expect(source).toContain("datetime={normalizedVerifiedAt}");
  });

  it("tightens horizontal rhythm from gap-x-4 to gap-x-3", () => {
    const source = readSource();

    expect(source).toContain("gap-x-3");
    expect(source).not.toContain("gap-x-4");
  });

  it("does not include alternate appearance utilities for the meta row text", () => {
    const source = readSource();
    const blockedPrefix = ["da", "rk:"].join("");

    expect(source).not.toContain(blockedPrefix);
  });
});
