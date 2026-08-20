import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const manifestPath = fileURLToPath(
  new URL("../../../../docs/research/city-content-manifest-batch-3.md", import.meta.url),
);

const expectedMix = {
  "city-pages": 60,
  guides: 25,
  "vertical-pages": 5,
  "faq-hubs": 5,
  benchmarks: 3,
  "lead-magnets": 2,
} as const;

function manifestRows(): string[][] {
  return readFileSync(manifestPath, "utf-8")
    .split(/\r?\n/)
    .filter((line) => /^\|\s*\d+\s*\|/.test(line))
    .map((line) =>
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
}

describe("city content batch 3 manifest", () => {
  const rows = manifestRows();

  test("contains exactly 100 planned content rows", () => {
    expect(rows).toHaveLength(100);
  });

  test("matches the planned collection mix", () => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const collection = row[2]!;
      counts.set(collection, (counts.get(collection) ?? 0) + 1);
    }

    expect(Object.fromEntries(counts)).toEqual(expectedMix);
  });

  test("uses unique slugs and marks every row complete", () => {
    const slugs = rows.map((row) => row[1]!);
    const statuses = rows.map((row) => row[12]!);

    expect(new Set(slugs).size).toBe(100);
    expect(statuses.every((status) => status === "complete")).toBe(true);
  });
});
