import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFParse } from "pdf-parse";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

async function extractPdfText(path: string): Promise<string> {
  const parser = new PDFParse({ data: readFileSync(join(root, path)) });
  try {
    return (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }
}

describe("deactivated external accounting integrations", () => {
  it("keeps only the API tombstone, not an unreachable connector runtime", () => {
    expect(existsSync(join(root, "apps/api/src/domains/accounting-integrations/service.ts"))).toBe(
      false,
    );
    expect(existsSync(join(root, "apps/api/src/domains/accounting-integrations/queue.ts"))).toBe(
      false,
    );

    const routes = read("apps/api/src/domains/accounting-integrations/routes.ts");
    expect(routes).toContain("quickbooks_integration_unavailable");
    expect(routes).toContain("accounting_integrations_unavailable");
    expect(routes).not.toContain('from "./service"');
  });

  it("does not advertise dead QBO secrets, queues, hooks, or validators", () => {
    expect(read("apps/api/src/types.ts")).not.toMatch(/QBO_|ACCOUNTING_SYNC_QUEUE/);
    expect(read("apps/web/src/hooks/use-accounting.ts")).not.toMatch(
      /useAccountingIntegrations|useAccountingIntegrationSyncRuns|useAccountingIntegrationConflicts|useSyncAccountingIntegration|useResolveAccountingConflict/,
    );
    expect(read("packages/shared/src/validators/accounting.ts")).not.toMatch(
      /ACCOUNTING_INTEGRATION_|accountingIntegrationSettingsSchema|accountingIntegrationSyncRequestSchema|accountingConflictResolutionSchema/,
    );
  });

  it("tests the unavailable production contract instead of a live OAuth flow", () => {
    const stress = read("e2e-adhoc/accounting-integrations-prod-stress.mjs");

    expect(stress).toContain("accounting-integrations-unavailable");
    expect(stress).toContain("quickbooks_integration_unavailable");
    expect(stress).toContain("accounting_integrations_unavailable");
    expect(stress).toContain("createdAt:");
    expect(stress).toContain("complete,");
    expect(stress).toContain("scenarioCount:");
    expect(stress).not.toMatch(/QBO_|targetsIntuit|appcenter\.intuit\.com/);
  });

  it("marks active architecture and planning docs with the current deferred status", () => {
    const dependencyMap = read("docs/architecture/third-party-dependency-map.md");
    const prd = read("docs/grant-operating-system/08-accounting-integrations-prd.md");
    const oldSpec = read("docs/superpowers/specs/2026-05-06-accounting-integrations-design.md");
    const oldPlan = read("docs/superpowers/plans/2026-05-06-accounting-integrations.md");

    expect(dependencyMap).toContain("Deferred candidate");
    expect(dependencyMap).not.toContain("`QBO_*` env vars");
    expect(prd).toContain("Deferred - unavailable in the current product");
    expect(oldSpec).toContain("Superseded on 2026-07-03");
    expect(oldPlan).toContain("Superseded on 2026-07-03");

    for (const path of [
      "docs/superpowers/specs/2026-06-20-capability-communication-and-tier-repackaging-design.md",
      "docs/superpowers/plans/2026-06-20-capability-communication-and-tier-repackaging.md",
      "docs/superpowers/plans/2026-06-28-pricing-packaging-realignment.md",
      "docs/superpowers/plans/2026-06-29-tier-repackaging-spec.md",
    ]) {
      expect(read(path), `${path} must disclose the current product state`).toContain(
        "Superseded on 2026-07-03",
      );
    }
  });

  it("keeps published brochure PDFs aligned with their HTML sources", async () => {
    for (const path of [
      "output/pdf/grantpipe-executive-brochure.html",
      "output/pdf/grantpipe-executive-brochure-limited-offer.html",
    ]) {
      expect(read(path), `${path} must use the compact plan-comparison layout`).toContain(
        'class="page matrix-page plan-comparison-page"',
      );
    }

    for (const path of [
      "output/pdf/grantpipe-executive-brochure.pdf",
      "output/pdf/grantpipe-executive-brochure-limited-offer.pdf",
    ]) {
      const text = await extractPdfText(path);
      expect(text, `${path} still promises the retired connector`).not.toContain(
        "QuickBooks Online read-only ingestion",
      );
      expect(text, `${path} is missing the supported migration path`).toContain(
        "QuickBooks CSV opening-balance import",
      );
    }
  });

  it("uses a count, not currency, for the zero-writeback proof point", () => {
    const landingPage = read("apps/site/src/pages/lp/fund-accounting-without-the-price.astro");
    expect(landingPage).toContain('value: "0 entries"');
    expect(landingPage).toContain(
      'label: "written back to QuickBooks. GrantPipe does not connect to QuickBooks right now."',
    );
    expect(landingPage).not.toMatch(/0 entries[\s\S]{0,120}in journal entries written back/i);
    expect(landingPage).not.toMatch(/value: "\$0"[\s\S]{0,120}journal entries written back/i);
  });
});
