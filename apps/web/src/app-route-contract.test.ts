import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROUTE_FILES = [
  "routes/_authenticated/accounting/anomalies.tsx",
  "routes/_authenticated/donors/at-risk.tsx",
  "routes/_authenticated/donors/pledges.tsx",
  "routes/_authenticated/grants/sentinel.lazy.tsx",
  "routes/_authenticated/reports/ask-ledger.tsx",
] as const;

describe("authenticated app route links", () => {
  it.each(ROUTE_FILES)("routes billing CTAs through TanStack Router in %s", (relativePath) => {
    const source = readFileSync(resolve(import.meta.dirname, relativePath), "utf8");

    expect(source).not.toMatch(/<a\s[^>]*href=["']\/settings#billing["']/s);
    expect(source).toContain('to="/settings"');
    expect(source).toContain('hash="billing"');
  });
});
