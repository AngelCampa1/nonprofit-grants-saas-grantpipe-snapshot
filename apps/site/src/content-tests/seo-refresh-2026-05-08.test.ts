import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { marketingContentDirectory } from "../lib/marketing-content-root";

const CONTENT_ROOT = marketingContentDirectory;
const REFRESH_DATE = "2026-05-08";
const STALE_CUTOFF = "2026-04-24";
const CORPUS_SCAN_TIMEOUT_MS = 60_000;

function markdownFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      return markdownFiles(entryPath);
    }

    return entry.isFile() && entry.name.endsWith(".md") ? [entryPath] : [];
  });
}

function scalar(source: string, field: string): string | null {
  const match = source.match(new RegExp(`^${field}:\\s*["']?(\\d{4}-\\d{2}-\\d{2})["']?`, "m"));
  return match?.[1] ?? null;
}

describe("2026-05-08 SEO content refresh", () => {
  it(
    "moves every page older than the two-week review cutoff to the refresh date",
    () => {
      const staleAfterRefresh = markdownFiles(CONTENT_ROOT)
        .map((path) => {
          const source = readFileSync(path, "utf8");
          const lastReviewedAt = scalar(source, "lastReviewedAt");

          return {
            path: relative(CONTENT_ROOT, path).replace(/\\/g, "/"),
            lastReviewedAt,
            updatedAt: scalar(source, "updatedAt"),
            verifiedAt: scalar(source, "verifiedAt"),
          };
        })
        .filter((entry) => entry.lastReviewedAt && entry.lastReviewedAt < STALE_CUTOFF);

      expect(staleAfterRefresh).toEqual([]);
    },
    CORPUS_SCAN_TIMEOUT_MS,
  );

  it("keeps refreshed public pages on a single review/update/verification date", () => {
    const mismatched = markdownFiles(CONTENT_ROOT)
      .map((path) => {
        const source = readFileSync(path, "utf8");

        return {
          path: relative(CONTENT_ROOT, path).replace(/\\/g, "/"),
          updatedAt: scalar(source, "updatedAt"),
          lastReviewedAt: scalar(source, "lastReviewedAt"),
          verifiedAt: scalar(source, "verifiedAt"),
        };
      })
      .filter((entry) => entry.lastReviewedAt === REFRESH_DATE)
      .filter((entry) => entry.updatedAt !== REFRESH_DATE || entry.verifiedAt !== REFRESH_DATE);

    expect(mismatched).toEqual([]);
  });
});
