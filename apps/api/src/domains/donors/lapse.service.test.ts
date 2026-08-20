import { describe, it, expect, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { getAtRiskDonors } from "./lapse.service";

// ---------------------------------------------------------------------------
// Helpers to build mock DB rows
// ---------------------------------------------------------------------------

function makeDonationRow(overrides: {
  contactId: string;
  amountCents: number;
  date: Date;
  contactFirstName?: string | null;
  contactLastName?: string | null;
  contactOrganizationName?: string | null;
  contactEmail?: string | null;
  contactDeletedAt?: Date | null;
}) {
  return {
    contactId: overrides.contactId,
    amountCents: overrides.amountCents,
    date: overrides.date,
    contact: {
      id: overrides.contactId,
      firstName: overrides.contactFirstName ?? null,
      lastName: overrides.contactLastName ?? null,
      organizationName: overrides.contactOrganizationName ?? null,
      email: overrides.contactEmail ?? null,
      deletedAt: overrides.contactDeletedAt ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// getAtRiskDonors
// ---------------------------------------------------------------------------

describe("getAtRiskDonors", () => {
  const now = new Date("2026-06-16T12:00:00.000Z");

  function buildDb(rows: ReturnType<typeof makeDonationRow>[]) {
    return {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(rows),
          }),
        }),
      }),
    };
  }

  it("fences lapse-risk donations by active selected-entity ownership", async () => {
    let predicate: unknown;
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn((value) => {
              predicate = value;
              return Promise.resolve([]);
            }),
          }),
        }),
      }),
    };

    await getAtRiskDonors(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      now,
    });

    const rendered = new PgDialect().sqlToQuery(
      predicate as Parameters<PgDialect["sqlToQuery"]>[0],
    );
    expect(rendered.sql.toLowerCase()).toContain('"donor_scope_fund"."deleted_at" is null');
    expect(rendered.sql.toLowerCase()).toContain('"donor_scope_grant"."deleted_at" is null');
    expect(rendered.params).toContain("entity-1");
  });

  it("returns empty donors array and zero totals when no donations exist", async () => {
    const db = buildDb([]);
    const result = await getAtRiskDonors(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      now,
    });
    expect(result.donors).toEqual([]);
    expect(result.totals).toEqual({ lapsing: 0, at_risk: 0, lapsed: 0, total: 0 });
  });

  it("returns donors in lapsing/at_risk/lapsed bands sorted by riskScore DESC then daysSinceLastGift DESC", async () => {
    // Contact A: high-risk lapsed (no gift for 2 years), $10000 lifetime
    const dateA1 = new Date("2024-01-01");
    const dateA2 = new Date("2024-06-01");
    // Contact B: lapsing, $500 lifetime
    const dateB1 = new Date("2025-12-01");
    const dateB2 = new Date("2026-01-01");
    // now = 2026-06-16, cadence B = ~31 days, days since = ~166 > 1.25*31=38.75

    const rows = [
      makeDonationRow({
        contactId: "c-A",
        amountCents: 5000,
        date: dateA1,
        contactFirstName: "Alice",
        contactLastName: "Smith",
        contactEmail: "a@example.com",
      }),
      makeDonationRow({
        contactId: "c-A",
        amountCents: 5000,
        date: dateA2,
        contactFirstName: "Alice",
        contactLastName: "Smith",
        contactEmail: "a@example.com",
      }),
      makeDonationRow({
        contactId: "c-B",
        amountCents: 250,
        date: dateB1,
        contactFirstName: "Bob",
        contactLastName: "Jones",
        contactEmail: "b@example.com",
      }),
      makeDonationRow({
        contactId: "c-B",
        amountCents: 250,
        date: dateB2,
        contactFirstName: "Bob",
        contactLastName: "Jones",
        contactEmail: "b@example.com",
      }),
    ];

    const db = buildDb(rows);
    const result = await getAtRiskDonors(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      now,
    });
    const donors = result.donors;

    // Both should be at_risk or lapsed (returned only if band !== "none")
    expect(donors.length).toBeGreaterThan(0);
    expect(donors.every((d) => ["lapsing", "at_risk", "lapsed"].includes(d.band))).toBe(true);

    // riskScore sorted DESC
    for (let i = 1; i < donors.length; i++) {
      expect((donors[i - 1] as (typeof donors)[0]).riskScore).toBeGreaterThanOrEqual(
        (donors[i] as (typeof donors)[0]).riskScore,
      );
    }

    const donorA = donors.find((d) => d.contactId === "c-A");
    expect(donorA).toBeDefined();
    expect(donorA?.displayName).toBe("Alice Smith");
    expect(donorA?.email).toBe("a@example.com");
    expect(donorA?.band).toBe("lapsed");
    expect(donorA?.lifetimeGivingCents).toBe(10000);
    expect(donorA?.lastGiftDate).toEqual(dateA2);
  });

  it("excludes donors whose band is 'none'", async () => {
    // Single gift yesterday → band should be "none"
    const rows = [
      makeDonationRow({
        contactId: "c-recent",
        amountCents: 1000,
        date: new Date("2026-06-15"),
        contactFirstName: "Recent",
        contactLastName: "Donor",
        contactEmail: "r@example.com",
      }),
    ];
    const db = buildDb(rows);
    const result = await getAtRiskDonors(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      now,
    });
    expect(result.donors).toHaveLength(0);
    expect(result.totals.total).toBe(0);
  });

  it("filters by bands when provided", async () => {
    const dateA1 = new Date("2024-01-01");
    const dateA2 = new Date("2024-06-01");
    const dateB1 = new Date("2025-12-01");
    const dateB2 = new Date("2026-01-01");

    const rows = [
      makeDonationRow({
        contactId: "c-A",
        amountCents: 5000,
        date: dateA1,
        contactFirstName: "Alice",
        contactLastName: "S",
        contactEmail: "a@e.com",
      }),
      makeDonationRow({
        contactId: "c-A",
        amountCents: 5000,
        date: dateA2,
        contactFirstName: "Alice",
        contactLastName: "S",
        contactEmail: "a@e.com",
      }),
      makeDonationRow({
        contactId: "c-B",
        amountCents: 250,
        date: dateB1,
        contactFirstName: "Bob",
        contactLastName: "J",
        contactEmail: "b@e.com",
      }),
      makeDonationRow({
        contactId: "c-B",
        amountCents: 250,
        date: dateB2,
        contactFirstName: "Bob",
        contactLastName: "J",
        contactEmail: "b@e.com",
      }),
    ];

    const db = buildDb(rows);
    const result = await getAtRiskDonors(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      now,
      bands: ["lapsed"],
    });
    expect(result.donors.every((d) => d.band === "lapsed")).toBe(true);
    // Totals reflect the FULL population (both lapsed + at-risk/lapsing contacts)
    expect(result.totals.total).toBeGreaterThanOrEqual(result.donors.length);
  });

  it("applies limit", async () => {
    const dateA1 = new Date("2024-01-01");
    const dateA2 = new Date("2024-06-01");
    const dateB1 = new Date("2023-11-01");
    const dateB2 = new Date("2024-05-01");

    const rows = [
      makeDonationRow({
        contactId: "c-A",
        amountCents: 5000,
        date: dateA1,
        contactFirstName: "A",
        contactLastName: "A",
        contactEmail: "a@e.com",
      }),
      makeDonationRow({
        contactId: "c-A",
        amountCents: 5000,
        date: dateA2,
        contactFirstName: "A",
        contactLastName: "A",
        contactEmail: "a@e.com",
      }),
      makeDonationRow({
        contactId: "c-B",
        amountCents: 5000,
        date: dateB1,
        contactFirstName: "B",
        contactLastName: "B",
        contactEmail: "b@e.com",
      }),
      makeDonationRow({
        contactId: "c-B",
        amountCents: 5000,
        date: dateB2,
        contactFirstName: "B",
        contactLastName: "B",
        contactEmail: "b@e.com",
      }),
    ];

    const db = buildDb(rows);
    const result = await getAtRiskDonors(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      now,
      limit: 1,
    });
    expect(result.donors).toHaveLength(1);
    // Totals should reflect both contacts (2 lapsed), not the limited slice of 1
    expect(result.totals.total).toBe(2);
  });

  it("prefers organizationName over firstName+lastName for org contacts", async () => {
    const rows = [
      makeDonationRow({
        contactId: "c-org",
        amountCents: 1000,
        date: new Date("2024-01-01"),
        contactFirstName: "Jane",
        contactLastName: "Doe",
        contactOrganizationName: "ACME Corp",
        contactEmail: "org@e.com",
      }),
      makeDonationRow({
        contactId: "c-org",
        amountCents: 1000,
        date: new Date("2024-06-01"),
        contactFirstName: "Jane",
        contactLastName: "Doe",
        contactOrganizationName: "ACME Corp",
        contactEmail: "org@e.com",
      }),
    ];

    const db = buildDb(rows);
    const result = await getAtRiskDonors(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      now,
    });
    expect(result.donors[0]?.displayName).toBe("ACME Corp");
  });

  it("handles contact with null firstName/lastName (trims properly)", async () => {
    const rows = [
      makeDonationRow({
        contactId: "c-noname",
        amountCents: 500,
        date: new Date("2024-01-01"),
        contactFirstName: null,
        contactLastName: null,
        contactEmail: null,
      }),
      makeDonationRow({
        contactId: "c-noname",
        amountCents: 500,
        date: new Date("2024-06-01"),
        contactFirstName: null,
        contactLastName: null,
        contactEmail: null,
      }),
    ];

    const db = buildDb(rows);
    const result = await getAtRiskDonors(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      now,
    });
    // band should be lapsed (2 years ago), displayName is empty string trimmed
    const donor = result.donors.find((d) => d.contactId === "c-noname");
    expect(donor).toBeDefined();
    expect(donor?.displayName).toBe("");
  });

  it("passes now through to the classifier", async () => {
    // Use a custom 'now' in the past so a recent-ish donation is still at_risk
    const customNow = new Date("2026-01-01T00:00:00.000Z");
    const date1 = new Date("2025-01-01");
    const date2 = new Date("2025-07-01");
    // cadence ~181 days, daysSince = ~184, 184 > 1.25*181=226? no. 184 > 181? yes → at_risk

    const rows = [
      makeDonationRow({
        contactId: "c-X",
        amountCents: 1000,
        date: date1,
        contactFirstName: "X",
        contactLastName: "X",
        contactEmail: "x@e.com",
      }),
      makeDonationRow({
        contactId: "c-X",
        amountCents: 1000,
        date: date2,
        contactFirstName: "X",
        contactLastName: "X",
        contactEmail: "x@e.com",
      }),
    ];

    const db = buildDb(rows);
    const result = await getAtRiskDonors(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      now: customNow,
    });
    // with customNow the donation from 2025-07-01 is ~184 days old
    // cadence = 181 days, 184 > 1.25*181=226? No. 184 > 2*181=362? No. band = none
    // So actually this contact should be "none" — so result is empty
    // Band "none" donors are excluded — result should have no c-X donor
    expect(result.donors.find((d) => d.contactId === "c-X")).toBeUndefined();
  });

  it("totals reflect full population when bands filter and limit are applied", async () => {
    // 2 lapsed donors + 1 lapsing donor
    // With bands=["lapsed"] + limit=1: donors array has 1 row, totals has 3 total
    const dateLapsed1a = new Date("2024-01-01");
    const dateLapsed1b = new Date("2024-06-01");
    const dateLapsed2a = new Date("2023-06-01");
    const dateLapsed2b = new Date("2024-01-01");
    const dateB1 = new Date("2025-12-01");
    const dateB2 = new Date("2026-01-01");

    const rows = [
      makeDonationRow({
        contactId: "c-lapsed1",
        amountCents: 10000,
        date: dateLapsed1a,
        contactFirstName: "L1",
        contactLastName: "A",
        contactEmail: "l1@e.com",
      }),
      makeDonationRow({
        contactId: "c-lapsed1",
        amountCents: 10000,
        date: dateLapsed1b,
        contactFirstName: "L1",
        contactLastName: "A",
        contactEmail: "l1@e.com",
      }),
      makeDonationRow({
        contactId: "c-lapsed2",
        amountCents: 5000,
        date: dateLapsed2a,
        contactFirstName: "L2",
        contactLastName: "B",
        contactEmail: "l2@e.com",
      }),
      makeDonationRow({
        contactId: "c-lapsed2",
        amountCents: 5000,
        date: dateLapsed2b,
        contactFirstName: "L2",
        contactLastName: "B",
        contactEmail: "l2@e.com",
      }),
      makeDonationRow({
        contactId: "c-lapsing",
        amountCents: 250,
        date: dateB1,
        contactFirstName: "LP",
        contactLastName: "C",
        contactEmail: "lp@e.com",
      }),
      makeDonationRow({
        contactId: "c-lapsing",
        amountCents: 250,
        date: dateB2,
        contactFirstName: "LP",
        contactLastName: "C",
        contactEmail: "lp@e.com",
      }),
    ];

    const db = buildDb(rows);
    const result = await getAtRiskDonors(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      now,
      bands: ["lapsed"],
      limit: 1,
    });

    // Filtered + limited: only 1 donor row
    expect(result.donors).toHaveLength(1);
    expect(result.donors[0]?.band).toBe("lapsed");

    // Totals cover the full population (2 lapsed + 1 lapsing = 3 total at-risk)
    expect(result.totals.lapsed).toBe(2);
    expect(result.totals.total).toBe(3);
    // Totals are consistent with what bands filter excluded
    expect(result.totals.total).toBeGreaterThan(result.donors.length);
  });
});
