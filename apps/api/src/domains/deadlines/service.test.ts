import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  fiscalPeriods,
  grantCloseoutItems,
  grantReportingRequirements,
  grants,
  restrictionTerms,
} from "@grantpipe/db";
import type { RadarObligation } from "@grantpipe/shared";
import {
  applyHorizon,
  bandObligations,
  collectObligations,
  mapApplicationDeadline,
  mapCloseoutItem,
  mapPeriodClose,
  mapReportingRequirement,
  mapRestrictionRelease,
  restrictionTermOwnershipAllows,
  type ResolvedRestrictionOwner,
} from "./service";

const NOW = new Date("2026-06-15T12:00:00.000Z");
const CONTEXT = { now: NOW, timeZone: "UTC", includeResolved: false };
const CONTEXT_WITH_RESOLVED = { ...CONTEXT, includeResolved: true };

function makeObligation(overrides: Partial<RadarObligation>): RadarObligation {
  return {
    id: "application_deadline:g1",
    kind: "application_deadline",
    title: "Application deadline",
    contextLabel: "Grant One",
    dueDate: "2026-06-20T00:00:00.000Z",
    daysUntilDue: 5,
    status: "upcoming",
    urgencyBand: "this_week",
    target: { type: "grant", id: "g1" },
    ...overrides,
  };
}

describe("bandObligations", () => {
  it("returns an empty banded structure with zeroed totals", () => {
    const result = bandObligations([], NOW);
    expect(result.asOf).toBe(NOW.toISOString());
    expect(result.bands).toEqual({
      overdue: [],
      due_today: [],
      this_week: [],
      this_month: [],
      later: [],
    });
    expect(result.totals).toEqual({
      application_deadline: 0,
      reporting_requirement: 0,
      closeout_item: 0,
      restriction_release: 0,
      period_close: 0,
    });
  });

  it("groups obligations into their bands and tallies per-kind totals", () => {
    const obligations = [
      makeObligation({ id: "a", urgencyBand: "overdue", kind: "application_deadline" }),
      makeObligation({ id: "b", urgencyBand: "due_today", kind: "reporting_requirement" }),
      makeObligation({ id: "c", urgencyBand: "this_week", kind: "closeout_item" }),
      makeObligation({ id: "d", urgencyBand: "this_month", kind: "restriction_release" }),
      makeObligation({ id: "e", urgencyBand: "later", kind: "period_close" }),
      makeObligation({ id: "f", urgencyBand: "later", kind: "period_close" }),
    ];
    const result = bandObligations(obligations, NOW);
    expect(result.bands.overdue.map((o) => o.id)).toEqual(["a"]);
    expect(result.bands.due_today.map((o) => o.id)).toEqual(["b"]);
    expect(result.bands.this_week.map((o) => o.id)).toEqual(["c"]);
    expect(result.bands.this_month.map((o) => o.id)).toEqual(["d"]);
    expect(result.bands.later.map((o) => o.id)).toEqual(["e", "f"]);
    expect(result.totals).toEqual({
      application_deadline: 1,
      reporting_requirement: 1,
      closeout_item: 1,
      restriction_release: 1,
      period_close: 2,
    });
  });

  it("sorts by due date, then kind, then id", () => {
    const sameDay = "2026-06-20T00:00:00.000Z";
    const obligations = [
      makeObligation({ id: "z", dueDate: "2026-07-01T00:00:00.000Z", kind: "period_close" }),
      makeObligation({ id: "b", dueDate: sameDay, kind: "reporting_requirement" }),
      makeObligation({ id: "a", dueDate: sameDay, kind: "application_deadline" }),
      makeObligation({ id: "a2", dueDate: sameDay, kind: "application_deadline" }),
    ];
    const result = bandObligations(obligations, NOW);
    // All land in this_week / later; flatten in sort order to assert ordering.
    const ordered = [...result.bands.this_week, ...result.bands.later].map((o) => o.id);
    expect(ordered).toEqual(["a", "a2", "b", "z"]);
  });
});

describe("per-source mappers", () => {
  it("maps an application deadline and skips a null deadline", () => {
    expect(
      mapApplicationDeadline({ id: "g1", name: "Grant One", applicationDeadline: null }, CONTEXT),
    ).toBeNull();
    const mapped = mapApplicationDeadline(
      {
        id: "g1",
        name: "Grant One",
        applicationDeadline: new Date("2026-06-20T00:00:00.000Z"),
      },
      CONTEXT,
    );
    expect(mapped).toMatchObject({
      id: "application_deadline:g1",
      kind: "application_deadline",
      title: "Application deadline",
      contextLabel: "Grant One",
      status: "upcoming",
      urgencyBand: "this_week",
      daysUntilDue: 5,
      target: { type: "grant", id: "g1" },
    });
  });

  it("maps a reporting requirement and treats submitted as resolved", () => {
    const base = {
      id: "r1",
      grantId: "g1",
      grantName: "Grant One",
      reportType: "Q2",
      dueDate: new Date("2026-06-10T00:00:00.000Z"),
      status: "upcoming",
    };
    const overdue = mapReportingRequirement(base, CONTEXT);
    expect(overdue).toMatchObject({
      id: "reporting_requirement:r1",
      title: "Q2 report",
      status: "overdue",
      urgencyBand: "overdue",
    });

    expect(mapReportingRequirement({ ...base, status: "submitted" }, CONTEXT)).toBeNull();
    expect(
      mapReportingRequirement({ ...base, status: "submitted" }, CONTEXT_WITH_RESOLVED),
    ).toMatchObject({ status: "resolved" });
    expect(mapReportingRequirement({ ...base, dueDate: null }, CONTEXT)).toBeNull();
  });

  it("humanizes known report-type enum keys into a titled label", () => {
    const base = {
      id: "r2",
      grantId: "g1",
      grantName: "Grant One",
      reportType: "quarterly",
      dueDate: new Date("2026-06-10T00:00:00.000Z"),
      status: "upcoming",
    };
    expect(mapReportingRequirement(base, CONTEXT)).toMatchObject({
      title: "Quarterly report",
    });
    expect(mapReportingRequirement({ ...base, reportType: "annual" }, CONTEXT)).toMatchObject({
      title: "Annual report",
    });
    expect(mapReportingRequirement({ ...base, reportType: "final" }, CONTEXT)).toMatchObject({
      title: "Final report",
    });
    expect(mapReportingRequirement({ ...base, reportType: "custom" }, CONTEXT)).toMatchObject({
      title: "Custom report",
    });
  });

  it("does not duplicate the word 'report' when a free-text type already contains it", () => {
    const base = {
      id: "r3",
      grantId: "g1",
      grantName: "Grant One",
      dueDate: new Date("2026-06-10T00:00:00.000Z"),
      status: "upcoming",
    };
    // AI-extracted descriptive names (the reportType column is free text) must not
    // produce "... Report report".
    expect(
      mapReportingRequirement({ ...base, reportType: "Final Programmatic Report" }, CONTEXT),
    ).toMatchObject({ title: "Final Programmatic Report" });
    expect(
      mapReportingRequirement({ ...base, reportType: "Quarterly Financial REPORT" }, CONTEXT),
    ).toMatchObject({ title: "Quarterly Financial REPORT" });
    // A free-text type without "report" still gets the suffix.
    expect(
      mapReportingRequirement({ ...base, reportType: "Mid-Year Progress" }, CONTEXT),
    ).toMatchObject({ title: "Mid-Year Progress report" });
    // Surrounding whitespace is trimmed.
    expect(
      mapReportingRequirement({ ...base, reportType: "  Site Visit  " }, CONTEXT),
    ).toMatchObject({ title: "Site Visit report" });
    // Empty or whitespace-only free text falls back to a clean "Report" label.
    expect(mapReportingRequirement({ ...base, reportType: "" }, CONTEXT)).toMatchObject({
      title: "Report",
    });
    expect(mapReportingRequirement({ ...base, reportType: "   " }, CONTEXT)).toMatchObject({
      title: "Report",
    });
  });

  it("maps a closeout item and treats completed as resolved", () => {
    const base = {
      id: "c1",
      grantId: "g1",
      grantName: "Grant One",
      label: "Final report filed",
      dueDate: new Date("2026-06-15T00:00:00.000Z"),
      completed: false,
    };
    expect(mapCloseoutItem(base, CONTEXT)).toMatchObject({
      id: "closeout_item:c1",
      title: "Final report filed",
      status: "due_today",
      urgencyBand: "due_today",
    });
    expect(mapCloseoutItem({ ...base, completed: true }, CONTEXT)).toBeNull();
    expect(mapCloseoutItem({ ...base, dueDate: null }, CONTEXT)).toBeNull();
  });

  it("maps a restriction release; remaining<=0 is resolved", () => {
    const base = {
      id: "t1",
      title: "Building fund",
      fundId: "fund-1",
      grantId: null,
      endDate: new Date("2026-07-20T00:00:00.000Z"),
      remainingCents: 5_000,
    };
    expect(mapRestrictionRelease(base, CONTEXT)).toMatchObject({
      id: "restriction_release:t1",
      title: "Building fund",
      contextLabel: "Restriction release",
      urgencyBand: "later",
      target: { type: "fund", id: "fund-1" },
    });
    // Resolved once nothing remains to spend down.
    expect(mapRestrictionRelease({ ...base, remainingCents: 0 }, CONTEXT)).toBeNull();
    // A grant-scoped restriction (no fund) links through to its grant, not the term id.
    expect(
      mapRestrictionRelease({ ...base, fundId: null, grantId: "grant-9" }, CONTEXT),
    ).toMatchObject({
      target: { type: "grant", id: "grant-9" },
    });
    // A restriction tied to neither a fund nor a grant has no navigable target and is omitted.
    expect(mapRestrictionRelease({ ...base, fundId: null, grantId: null }, CONTEXT)).toBeNull();
    expect(mapRestrictionRelease({ ...base, endDate: null }, CONTEXT)).toBeNull();
  });

  it("maps a period close; closed/locked is resolved", () => {
    const base = {
      id: "p1",
      name: "FY2026 Q2",
      endDate: new Date("2026-06-30T00:00:00.000Z"),
      status: "open",
    };
    expect(mapPeriodClose(base, CONTEXT)).toMatchObject({
      id: "period_close:p1",
      title: "Close FY2026 Q2",
      contextLabel: "FY2026 Q2",
      urgencyBand: "this_month",
      target: { type: "fiscal_period", id: "p1" },
    });
    expect(mapPeriodClose({ ...base, status: "closed" }, CONTEXT)).toBeNull();
    expect(mapPeriodClose({ ...base, status: "locked" }, CONTEXT)).toBeNull();
    expect(mapPeriodClose({ ...base, status: "closed" }, CONTEXT_WITH_RESOLVED)).toMatchObject({
      status: "resolved",
    });
  });
});

describe("applyHorizon", () => {
  it("keeps overdue and due-today items regardless of horizon, drops far-future ones", () => {
    const overdue = makeObligation({
      id: "overdue",
      status: "overdue",
      urgencyBand: "overdue",
      daysUntilDue: -10,
    });
    const dueToday = makeObligation({
      id: "due-today",
      status: "due_today",
      urgencyBand: "due_today",
      daysUntilDue: 0,
    });
    const nearFuture = makeObligation({ id: "near", daysUntilDue: 30 });
    const farFuture = makeObligation({
      id: "far",
      daysUntilDue: 200,
      urgencyBand: "later",
    });

    const result = applyHorizon([overdue, dueToday, nearFuture, farFuture], 90);
    expect(result.map((o) => o.id)).toEqual(["overdue", "due-today", "near"]);
  });
});

const UNLINKED_OWNER = { linked: false } as const;

function linkedOwner<T>(record: T | null): ResolvedRestrictionOwner<T> {
  return { linked: true, record };
}

function activeEntityOwner(entityId = "entity-1", orgId = "org-1") {
  return { orgId, entityId, deletedAt: null };
}

function restrictionOwnershipFixture(
  overrides: Partial<Parameters<typeof restrictionTermOwnershipAllows>[0]> = {},
): Parameters<typeof restrictionTermOwnershipAllows>[0] {
  return {
    orgId: "org-1",
    entityId: "entity-1",
    defaultEntityId: "entity-1",
    fund: UNLINKED_OWNER,
    grant: UNLINKED_OWNER,
    donation: UNLINKED_OWNER,
    document: UNLINKED_OWNER,
    ...overrides,
  };
}

describe("restrictionTermOwnershipAllows", () => {
  it("allows fully unlinked terms only for the organization default entity", () => {
    expect(restrictionTermOwnershipAllows(restrictionOwnershipFixture())).toBe(true);
    expect(
      restrictionTermOwnershipAllows(
        restrictionOwnershipFixture({ entityId: "entity-2", defaultEntityId: "entity-1" }),
      ),
    ).toBe(false);
  });

  it.each([
    ["sibling entity", activeEntityOwner("entity-2")],
    ["cross organization", activeEntityOwner("entity-1", "org-2")],
    ["deleted owner", { ...activeEntityOwner(), deletedAt: new Date("2026-01-01") }],
    ["missing owner", null],
  ])("denies a grant-linked term with a %s record", (_label, record) => {
    expect(
      restrictionTermOwnershipAllows(restrictionOwnershipFixture({ grant: linkedOwner(record) })),
    ).toBe(false);
  });

  it("fails closed when one of multiple direct owners belongs to a sibling entity", () => {
    expect(
      restrictionTermOwnershipAllows(
        restrictionOwnershipFixture({
          fund: linkedOwner(activeEntityOwner()),
          grant: linkedOwner(activeEntityOwner("entity-2")),
        }),
      ),
    ).toBe(false);
    expect(
      restrictionTermOwnershipAllows(
        restrictionOwnershipFixture({
          fund: linkedOwner(activeEntityOwner()),
          grant: linkedOwner(activeEntityOwner()),
        }),
      ),
    ).toBe(true);
  });

  it("fails closed across donation ownership and its multiple linked parents", () => {
    const donation = {
      orgId: "org-1",
      deletedAt: null,
      fund: linkedOwner(activeEntityOwner()),
      grant: linkedOwner(activeEntityOwner("entity-2")),
    };
    expect(
      restrictionTermOwnershipAllows(
        restrictionOwnershipFixture({ donation: linkedOwner(donation) }),
      ),
    ).toBe(false);
    expect(
      restrictionTermOwnershipAllows(
        restrictionOwnershipFixture({
          donation: linkedOwner({
            ...donation,
            grant: linkedOwner(activeEntityOwner()),
          }),
        }),
      ),
    ).toBe(true);
  });

  it("applies default-only fallback to an unlinked donation owner", () => {
    const donation = {
      orgId: "org-1",
      deletedAt: null,
      fund: UNLINKED_OWNER,
      grant: UNLINKED_OWNER,
    };
    expect(
      restrictionTermOwnershipAllows(
        restrictionOwnershipFixture({ donation: linkedOwner(donation) }),
      ),
    ).toBe(true);
    expect(
      restrictionTermOwnershipAllows(
        restrictionOwnershipFixture({
          entityId: "entity-2",
          defaultEntityId: "entity-1",
          donation: linkedOwner(donation),
        }),
      ),
    ).toBe(false);
  });

  it.each([
    ["sibling fund", "fund" as const, activeEntityOwner("entity-2")],
    ["cross-org grant", "grant" as const, activeEntityOwner("entity-1", "org-2")],
  ])("denies document ownership through a %s", (_label, entityType, owner) => {
    expect(
      restrictionTermOwnershipAllows(
        restrictionOwnershipFixture({
          document: linkedOwner({
            orgId: "org-1",
            deletedAt: null,
            entityType,
            owner: linkedOwner(owner),
          }),
        }),
      ),
    ).toBe(false);
  });

  it("denies a term linked through a deleted source document", () => {
    expect(
      restrictionTermOwnershipAllows(
        restrictionOwnershipFixture({
          document: linkedOwner({
            orgId: "org-1",
            deletedAt: new Date("2026-01-01"),
            entityType: "generated_report",
            owner: linkedOwner(activeEntityOwner()),
          }),
        }),
      ),
    ).toBe(false);
  });

  it("requires every direct and document owner to match when a term has multiple owners", () => {
    expect(
      restrictionTermOwnershipAllows(
        restrictionOwnershipFixture({
          fund: linkedOwner(activeEntityOwner()),
          document: linkedOwner({
            orgId: "org-1",
            deletedAt: null,
            entityType: "grant",
            owner: linkedOwner(activeEntityOwner("entity-2")),
          }),
        }),
      ),
    ).toBe(false);
  });
});

type StubRows = {
  grants: unknown[];
  reporting: unknown[];
  closeout: unknown[];
  restrictions: unknown[];
  periods: unknown[];
};

function renderPredicate(value: unknown) {
  return new PgDialect().sqlToQuery(value as Parameters<PgDialect["sqlToQuery"]>[0]);
}

function makeCollectorDb(rows: Partial<StubRows>, organization: { timezone: string } | null) {
  const byTable = new Map<unknown, unknown[]>([
    [grants, rows.grants ?? []],
    [grantReportingRequirements, rows.reporting ?? []],
    [grantCloseoutItems, rows.closeout ?? []],
    [restrictionTerms, rows.restrictions ?? []],
    [fiscalPeriods, rows.periods ?? []],
  ]);
  const predicates = new Map<unknown, ReturnType<typeof renderPredicate>>();
  // Each select() chain resolves the result set keyed by the table passed to
  // from(), so kind filtering (which omits queries) maps results correctly.
  const select = vi.fn(() => {
    let result: unknown[] = [];
    const chain = {
      from: vi.fn((table: unknown) => {
        result = byTable.get(table) ?? [];
        return chain;
      }),
      innerJoin: vi.fn(() => chain),
      where: vi.fn((where: unknown) => {
        const table = [...byTable.entries()].find(([, tableRows]) => tableRows === result)?.[0];
        if (table) predicates.set(table, renderPredicate(where));
        return Promise.resolve(result);
      }),
    };
    return chain;
  });
  return {
    select,
    predicates,
    query: {
      organizations: {
        findFirst: vi.fn().mockResolvedValue(organization),
      },
    },
  };
}

describe("collectObligations", () => {
  it("throws when the organization is missing", async () => {
    const db = makeCollectorDb({}, null);
    await expect(
      collectObligations(db as never, {
        orgId: "org-1",
        entityId: "entity-1",
        now: NOW,
        horizonDays: 90,
      }),
    ).rejects.toThrow("Organization not found");
  });

  it("collects and normalizes all five kinds", async () => {
    const db = makeCollectorDb(
      {
        grants: [
          { id: "g1", name: "Grant One", applicationDeadline: new Date("2026-06-20T00:00:00Z") },
          { id: "g2", name: "Grant Two", applicationDeadline: null },
        ],
        reporting: [
          {
            id: "r1",
            grantId: "g1",
            grantName: "Grant One",
            reportType: "Q2",
            dueDate: new Date("2026-06-10T00:00:00Z"),
            status: "upcoming",
          },
        ],
        closeout: [
          {
            id: "c1",
            grantId: "g1",
            grantName: "Grant One",
            label: "Close it",
            dueDate: new Date("2026-06-15T00:00:00Z"),
            completed: false,
          },
        ],
        restrictions: [
          {
            id: "t1",
            title: "Building fund",
            // ISO string endDate exercises the asDate string-coercion branch.
            endDate: "2026-07-01T00:00:00.000Z",
            fundId: "fund-1",
            beginningBalanceCents: 10_000,
            additionsTotal: "2000",
            // null releasesTotal exercises the ?? 0 fallback.
            releasesTotal: null,
          },
          {
            id: "t2",
            title: "Spent fund",
            fundId: "fund-2",
            endDate: new Date("2026-07-01T00:00:00Z"),
            beginningBalanceCents: 1_000,
            additionsTotal: null,
            releasesTotal: "1000",
          },
        ],
        periods: [
          {
            id: "p1",
            name: "FY2026 Q2",
            endDate: new Date("2026-06-30T00:00:00Z"),
            status: "open",
          },
        ],
      },
      { timezone: "UTC" },
    );

    const result = await collectObligations(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      now: NOW,
      horizonDays: 90,
    });
    const ids = result.map((o) => o.id).sort();
    expect(ids).toEqual([
      "application_deadline:g1",
      "closeout_item:c1",
      "period_close:p1",
      "reporting_requirement:r1",
      "restriction_release:t1",
    ]);
    // t2 is fully spent (resolved) and excluded by default.
    expect(result.find((o) => o.id === "restriction_release:t1")?.daysUntilDue).toBeGreaterThan(0);
  });

  it("honors the kinds filter and runs only the requested query", async () => {
    const db = makeCollectorDb(
      {
        periods: [
          {
            id: "p1",
            name: "FY2026 Q2",
            endDate: new Date("2026-06-30T00:00:00Z"),
            status: "open",
          },
        ],
      },
      { timezone: "UTC" },
    );

    const result = await collectObligations(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      now: NOW,
      horizonDays: 90,
      kinds: ["period_close"],
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe("period_close");
    // Only the org lookup + the single period_close select should run.
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("fences application deadlines by organization, selected entity, and active grant", async () => {
    const db = makeCollectorDb({}, { timezone: "UTC" });
    await collectObligations(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      now: NOW,
      horizonDays: 90,
      kinds: ["application_deadline"],
    });

    expect(db.predicates.get(grants)).toMatchObject({
      sql: expect.stringContaining('"grants"."entity_id" = $2'),
      params: ["org-1", "entity-1"],
    });
    expect(db.predicates.get(grants)?.sql).toContain('"grants"."deleted_at" is null');
  });

  it("fences reporting children and joined grants against sibling, deleted, and cross-org rows", async () => {
    const db = makeCollectorDb({}, { timezone: "UTC" });
    await collectObligations(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      now: NOW,
      horizonDays: 90,
      kinds: ["reporting_requirement"],
    });

    const predicate = db.predicates.get(grantReportingRequirements);
    expect(predicate?.sql).toContain('"grant_reporting_requirements"."org_id" = $1');
    expect(predicate?.sql).toContain('"grant_reporting_requirements"."entity_id" = $2');
    expect(predicate?.sql).toContain('"grant_reporting_requirements"."deleted_at" is null');
    expect(predicate?.sql).toContain('"grants"."org_id" = $3');
    expect(predicate?.sql).toContain('"grants"."entity_id" = $4');
    expect(predicate?.sql).toContain('"grants"."deleted_at" is null');
    expect(predicate?.params).toEqual(["org-1", "entity-1", "org-1", "entity-1"]);
  });

  it("fences closeout children and joined grants against sibling, deleted, and cross-org rows", async () => {
    const db = makeCollectorDb({}, { timezone: "UTC" });
    await collectObligations(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      now: NOW,
      horizonDays: 90,
      kinds: ["closeout_item"],
    });

    const predicate = db.predicates.get(grantCloseoutItems);
    expect(predicate?.sql).toContain('"grant_closeout_items"."org_id" = $1');
    expect(predicate?.sql).toContain('"grant_closeout_items"."entity_id" = $2');
    expect(predicate?.sql).toContain('"grant_closeout_items"."deleted_at" is null');
    expect(predicate?.sql).toContain('"grants"."org_id" = $3');
    expect(predicate?.sql).toContain('"grants"."entity_id" = $4');
    expect(predicate?.sql).toContain('"grants"."deleted_at" is null');
    expect(predicate?.params).toEqual(["org-1", "entity-1", "org-1", "entity-1"]);
  });

  it("scopes restriction terms through active grant, fund, donation, and document ownership", async () => {
    const db = makeCollectorDb({}, { timezone: "UTC" });
    await collectObligations(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      now: NOW,
      horizonDays: 90,
      kinds: ["restriction_release"],
    });

    const predicate = db.predicates.get(restrictionTerms);
    const sqlText = predicate?.sql.toLowerCase();
    expect(sqlText).toContain('"restriction_terms"."org_id"');
    expect(sqlText).toContain('"restriction_terms"."deleted_at" is null');
    for (const table of ["funds", "grants", "donations", "documents"]) {
      expect(sqlText).toMatch(new RegExp(`from\\s+"${table}"`));
    }
    expect(sqlText).toContain('"funds"."deleted_at" is null');
    expect(sqlText).toContain('"grants"."deleted_at" is null');
    expect(sqlText).toContain('"donations"."deleted_at" is null');
    expect(sqlText).toContain('"documents"."deleted_at" is null');
    expect(sqlText).toContain('"organizations"."default_entity_id"');
    expect(predicate?.params).toContain("org-1");
    expect(predicate?.params).toContain("entity-1");
    for (const table of [
      "grant_payment_requests",
      "subawards",
      "subrecipient_monitoring_tasks",
      "subrecipient_findings",
      "subrecipient_corrective_actions",
    ]) {
      expect(sqlText).toContain(`from "${table}"`);
    }
    expect(sqlText).toContain('"organizations"."deleted_at" is null');
  });

  it("keeps fiscal periods intentionally organization-global", async () => {
    const db = makeCollectorDb({}, { timezone: "UTC" });
    await collectObligations(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      now: NOW,
      horizonDays: 90,
      kinds: ["period_close"],
    });

    expect(db.predicates.get(fiscalPeriods)).toEqual({
      sql: '"fiscal_periods"."org_id" = $1',
      params: ["org-1"],
      typings: ["none"],
    });
  });
});
