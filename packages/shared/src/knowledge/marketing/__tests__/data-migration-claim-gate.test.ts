import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const DATA_MIGRATION_PAGE = resolve(
  process.cwd(),
  "src/knowledge/marketing/content/features/data-migration-onboarding-studio.md",
);

describe("data migration marketing claim gate", () => {
  it("keeps migration claims source-backed and conservative until full verification", () => {
    const source = readFileSync(DATA_MIGRATION_PAGE, "utf8");

    expect(source).not.toMatch(/direct\s+API\s+migration/i);
    expect(source).not.toMatch(/write[-\s]?back/i);
    expect(source).not.toMatch(/automatically\s+merge\s+every\s+possible\s+duplicate/i);
    expect(source).not.toMatch(/\bno\s+consultants?\b/i);
    expect(source).not.toMatch(/\bno\s+migration\s+fees?\b/i);
    expect(source).not.toMatch(/\blive\s+in\s+your\s+first\s+session\b/i);
    expect(source).not.toMatch(/\bon\s+day\s+one\b/i);
    expect(source).not.toMatch(/\bcommon\s+donor\s+tools\b/i);
    expect(source).toMatch(/Bloomerang/i);
    expect(source).toMatch(/DonorPerfect/i);
    expect(source).toMatch(/QuickBooks/i);
    expect(source).toMatch(/Salesforce\s+NPSP/i);
    expect(source).toMatch(/Generic\s+CSV/i);
  });
});
