import { describe, expect, it } from "vitest";
import { buildSampleContent, SAMPLE_MARKER } from "./seed-content";

const FIXED_NOW = new Date("2026-06-19T00:00:00Z");

describe("buildSampleContent", () => {
  const content = buildSampleContent({ orgId: "org-1", now: FIXED_NOW });

  // -------------------------------------------------------------------------
  // Org scoping
  // -------------------------------------------------------------------------

  it("scopes every entity to the caller org", () => {
    const allRows = Object.values(content).flat() as Array<Record<string, unknown>>;
    expect(allRows.length).toBeGreaterThan(0);
    for (const row of allRows) {
      if ("orgId" in row) {
        expect(row.orgId).toBe("org-1");
      }
    }
  });

  it("marks funder, fund, and grant names as sample data", () => {
    for (const f of content.funders) expect(f.name).toContain(SAMPLE_MARKER);
    for (const f of content.funds) expect(f.name).toContain(SAMPLE_MARKER);
    for (const g of content.grants) expect(g.name).toContain(SAMPLE_MARKER);
  });

  it("marks contact visible-name fields as sample data", () => {
    for (const c of content.contacts) {
      const hasFirstName = typeof c.firstName === "string" && c.firstName.includes(SAMPLE_MARKER);
      const hasOrgName =
        typeof c.organizationName === "string" && c.organizationName.includes(SAMPLE_MARKER);
      expect(hasFirstName || hasOrgName).toBe(true);
    }
  });

  it("marks restriction term titles as sample data", () => {
    for (const t of content.restrictionTerms) {
      expect(t.title).toContain(SAMPLE_MARKER);
    }
  });

  // -------------------------------------------------------------------------
  // Dataset shape
  // -------------------------------------------------------------------------

  it("produces a non-trivial dataset with valid FK references", () => {
    expect(content.grants.length).toBeGreaterThanOrEqual(4);
    expect(content.contacts.length).toBeGreaterThanOrEqual(5);

    const fundIds = new Set(content.funds.map((f) => f.id));
    for (const a of content.allocations) {
      expect(fundIds.has(a.fundId)).toBe(true);
    }

    const grantIds = new Set(content.grants.map((g) => g.id));
    for (const a of content.allocations) {
      expect(grantIds.has(a.grantId)).toBe(true);
    }

    const contactIds = new Set(content.contacts.map((c) => c.id));
    for (const d of content.donations) {
      expect(contactIds.has(d.contactId)).toBe(true);
    }
  });

  it("threads expense IDs from builder into restriction releases", () => {
    const expenseIds = new Set(content.expenses.map((e) => e.id));
    for (const r of content.restrictionReleases) {
      if (r.expenseId !== null && r.expenseId !== undefined) {
        expect(expenseIds.has(r.expenseId)).toBe(true);
      }
    }
  });

  it("threads restriction term IDs into additions, releases, and allowed categories", () => {
    const termIds = new Set(content.restrictionTerms.map((t) => t.id));

    for (const a of content.restrictionAdditions) {
      expect(termIds.has(a.restrictionTermId)).toBe(true);
    }
    for (const r of content.restrictionReleases) {
      expect(termIds.has(r.restrictionTermId)).toBe(true);
    }
    for (const c of content.restrictionAllowedCategories) {
      expect(termIds.has(c.restrictionTermId)).toBe(true);
    }
  });

  it("threads restriction release IDs into evidence links", () => {
    const releaseIds = new Set(content.restrictionReleases.map((r) => r.id));
    for (const e of content.restrictionEvidenceLinks) {
      expect(releaseIds.has(e.restrictionReleaseId)).toBe(true);
    }
  });

  it("threads metric IDs from impact metrics into metric entries", () => {
    const metricIds = new Set(content.impactMetrics.map((m) => m.id));
    for (const e of content.metricEntries) {
      expect(metricIds.has(e.metricId)).toBe(true);
    }
  });

  it("threads grant IDs into reporting requirements and closeout items", () => {
    const grantIds = new Set(content.grants.map((g) => g.id));
    for (const r of content.reportingRequirements) {
      expect(grantIds.has(r.grantId)).toBe(true);
    }
    for (const ci of content.closeoutItems) {
      expect(grantIds.has(ci.grantId)).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // Determinism
  // -------------------------------------------------------------------------

  it("is deterministic in shape given a fixed now (counts stable across calls)", () => {
    const a = buildSampleContent({ orgId: "o", now: FIXED_NOW });
    const b = buildSampleContent({ orgId: "o", now: FIXED_NOW });
    expect(a.grants.length).toBe(b.grants.length);
    expect(a.contacts.length).toBe(b.contacts.length);
    expect(a.donations.length).toBe(b.donations.length);
    expect(a.expenses.length).toBe(b.expenses.length);
    expect(a.restrictionTerms.length).toBe(b.restrictionTerms.length);
    expect(a.restrictionReleases.length).toBe(b.restrictionReleases.length);
    expect(a.restrictionEvidenceLinks.length).toBe(b.restrictionEvidenceLinks.length);
  });

  it("generates different UUIDs on each call (non-deterministic ids)", () => {
    const a = buildSampleContent({ orgId: "o", now: FIXED_NOW });
    const b = buildSampleContent({ orgId: "o", now: FIXED_NOW });
    // Grants will have different ids between two separate calls
    expect(a.grants.map((g) => g.id)).not.toEqual(b.grants.map((g) => g.id));
  });

  it("uses the supplied orgId not a hardcoded org", () => {
    const content2 = buildSampleContent({ orgId: "org-xyz", now: FIXED_NOW });
    const allRows = Object.values(content2).flat() as Array<Record<string, unknown>>;
    for (const row of allRows) {
      if ("orgId" in row) {
        expect(row.orgId).toBe("org-xyz");
      }
    }
    // Org-1 content should not bleed into org-xyz content
    const org1Rows = Object.values(content).flat() as Array<Record<string, unknown>>;
    for (const row of org1Rows) {
      if ("orgId" in row) {
        expect(row.orgId).toBe("org-1");
      }
    }
  });

  // -------------------------------------------------------------------------
  // Restriction lifecycle correctness
  // -------------------------------------------------------------------------

  it("seeds the right number of restriction terms (5 terms A–E)", () => {
    expect(content.restrictionTerms.length).toBe(5);
  });

  it("seeds restriction additions for each restriction term", () => {
    // All 5 terms get exactly 1 addition each in the seed
    expect(content.restrictionAdditions.length).toBe(5);
    const termIds = new Set(content.restrictionTerms.map((t) => t.id));
    const additionTermIds = new Set(content.restrictionAdditions.map((a) => a.restrictionTermId));
    // Every term that has an addition should be a valid term
    for (const tid of additionTermIds) {
      expect(termIds.has(tid)).toBe(true);
    }
  });

  it("Term E (missing_evidence) has no releases seeded", () => {
    // Term E is the last restriction term; it should have no releases
    const termE = content.restrictionTerms[4];
    expect(termE).toBeDefined();
    expect(termE!.evidenceRequirement).toBeTruthy();
    const termEReleases = content.restrictionReleases.filter(
      (r) => r.restrictionTermId === termE!.id,
    );
    expect(termEReleases.length).toBe(0);
  });

  it("evidence links only reference known release IDs", () => {
    const releaseIds = new Set(content.restrictionReleases.map((r) => r.id));
    for (const e of content.restrictionEvidenceLinks) {
      expect(releaseIds.has(e.restrictionReleaseId)).toBe(true);
    }
    // Should have 2 evidence links (one per evidenced release)
    expect(content.restrictionEvidenceLinks.length).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Enum / valid value assertions
  // -------------------------------------------------------------------------

  it("uses valid funder type values", () => {
    const validTypes = new Set(["foundation", "corporate", "government", "other"]);
    for (const f of content.funders) {
      expect(validTypes.has(f.type)).toBe(true);
    }
  });

  it("uses valid fund type values", () => {
    const validTypes = new Set([
      "temporarily_restricted",
      "permanently_restricted",
      "unrestricted",
    ]);
    for (const f of content.funds) {
      expect(validTypes.has(f.type)).toBe(true);
    }
  });

  it("uses valid grant status values", () => {
    const validStatuses = new Set([
      "discovery",
      "application",
      "submitted",
      "awarded",
      "active",
      "reporting",
      "closeout",
      "renewal",
      "declined",
    ]);
    for (const g of content.grants) {
      expect(validStatuses.has(g.status ?? "")).toBe(true);
    }
  });

  it("uses valid reporting requirement status values", () => {
    const validStatuses = new Set(["upcoming", "in_progress", "submitted", "overdue"]);
    for (const r of content.reportingRequirements) {
      expect(validStatuses.has(r.status ?? "")).toBe(true);
    }
  });

  it("uses valid contact type values", () => {
    const validTypes = new Set(["individual", "organization"]);
    for (const c of content.contacts) {
      expect(validTypes.has(c.type)).toBe(true);
    }
  });

  it("uses valid donation type values", () => {
    const validTypes = new Set(["one_time", "recurring", "pledge"]);
    for (const d of content.donations) {
      expect(validTypes.has(d.type)).toBe(true);
    }
  });

  it("stores all money as integer cents (no fractional values)", () => {
    for (const e of content.expenses) {
      expect(Number.isInteger(e.amountCents)).toBe(true);
      expect(e.amountCents).toBeGreaterThan(0);
    }
    for (const d of content.donations) {
      expect(Number.isInteger(d.amountCents)).toBe(true);
      expect(d.amountCents).toBeGreaterThan(0);
    }
    for (const a of content.allocations) {
      expect(Number.isInteger(a.allocatedAmountCents)).toBe(true);
      expect(a.allocatedAmountCents).toBeGreaterThan(0);
    }
  });

  // -------------------------------------------------------------------------
  // Relative date shape (using fixed now)
  // -------------------------------------------------------------------------

  it("daysAgo dates are before now, daysFromNow dates are after now", () => {
    // Expenses should all have dates before or at now
    for (const e of content.expenses) {
      expect(e.date.getTime()).toBeLessThanOrEqual(FIXED_NOW.getTime());
    }
    // The application grant's deadline should be in the future
    const appGrant = content.grants.find((g) => g.status === "application");
    expect(appGrant).toBeDefined();
    expect(appGrant!.applicationDeadline!.getTime()).toBeGreaterThan(FIXED_NOW.getTime());
  });

  // -------------------------------------------------------------------------
  // Default now fallback (covers the params.now ?? new Date() branch)
  // -------------------------------------------------------------------------

  it("works when now is omitted and defaults to current date", () => {
    const before = Date.now();
    const c = buildSampleContent({ orgId: "org-default-now" });
    const after = Date.now();
    // The application grant's deadline should be after the call started
    const appGrant = c.grants.find((g) => g.status === "application");
    expect(appGrant).toBeDefined();
    expect(appGrant!.applicationDeadline!.getTime()).toBeGreaterThan(before);
    expect(appGrant!.applicationDeadline!.getTime()).toBeGreaterThan(after - 1); // sanity
    // All rows must still be scoped to the given org
    const allRows = Object.values(c).flat() as Array<Record<string, unknown>>;
    for (const row of allRows) {
      if ("orgId" in row) {
        expect(row.orgId).toBe("org-default-now");
      }
    }
  });
});
