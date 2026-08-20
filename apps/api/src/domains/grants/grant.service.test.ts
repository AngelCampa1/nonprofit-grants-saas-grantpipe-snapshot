import { beforeEach, describe, expect, it, vi } from "vitest";
import { funds, grantFundAllocations } from "@grantpipe/db";
import { PgDialect } from "drizzle-orm/pg-core";
import { recordActivityLog } from "../../lib/activity-log";
import {
  closeoutGrant,
  createAllocation,
  createGrant,
  createImpactMetric,
  createImpactMetricEntry,
  deleteAllocation,
  deleteGrant,
  deleteImpactMetric,
  deleteImpactMetricEntry,
  getGrant,
  listGrantPipeline,
  listGrants,
  resolvePlanTier,
  updateAllocation,
  upsertGrantFederalAwardMetadata,
  updateGrant,
  updateImpactMetric,
  updateImpactMetricEntry,
} from "./grant.service";

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn(),
}));

vi.mock("../accounting/postingEngine", () => ({
  postGrantCloseout: vi.fn(),
}));

import { postGrantCloseout } from "../accounting/postingEngine";

describe("resolvePlanTier", () => {
  it("returns the selected plan for active Starter trials", async () => {
    const db = {
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue({
            planTier: "starter",
            subscriptionStatus: "trialing",
            trialEndsAt: new Date("2099-01-01T00:00:00.000Z"),
          }),
        },
      },
    };

    await expect(resolvePlanTier(db as never, "org-1")).resolves.toBe("starter");
    expect(db.query.organizations.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        columns: { planTier: true, subscriptionStatus: true, trialEndsAt: true },
      }),
    );
  });
});

describe("upsertGrantFederalAwardMetadata", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("upserts federal award metadata with org and active entity scope", async () => {
    const returning = vi.fn().mockResolvedValue([
      {
        id: "metadata-1",
        orgId: "org-1",
        entityId: "entity-1",
        grantId: "grant-1",
        assistanceListingNumber: "14.218",
        assistanceListingTitle: "Community Development Block Grants",
        federalAgency: "HUD",
        fain: "FAIN-1",
        passThroughEntityName: "State Pass Through",
        passThroughIdentifyingNumber: "PT-1",
        programName: "Community Development",
        clusterName: "CDBG",
        sefaInclusionType: "cash",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
        deletedAt: null,
      },
    ]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const insert = vi.fn().mockReturnValue({ values });
    const db = {
      query: {
        grants: {
          findFirst: vi.fn().mockResolvedValue({ id: "grant-1", entityId: "entity-1" }),
        },
      },
      insert,
    };

    const result = await upsertGrantFederalAwardMetadata(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      actorId: "user-1",
      grantId: "grant-1",
      data: {
        assistanceListingNumber: "14.218",
        assistanceListingTitle: "Community Development Block Grants",
        federalAgency: "HUD",
        fain: "FAIN-1",
        passThroughEntityName: "State Pass Through",
        passThroughIdentifyingNumber: "PT-1",
        programName: "Community Development",
        clusterName: "CDBG",
        sefaInclusionType: "cash",
      },
    });

    expect(db.query.grants.findFirst).toHaveBeenCalled();
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        entityId: "entity-1",
        grantId: "grant-1",
        assistanceListingNumber: "14.218",
        federalAgency: "HUD",
        sefaInclusionType: "cash",
      }),
    );
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          assistanceListingNumber: "14.218",
          federalAgency: "HUD",
          deletedAt: null,
        }),
      }),
    );
    expect(recordActivityLog).toHaveBeenCalledWith(db, {
      orgId: "org-1",
      activeEntityId: "entity-1",
      actorId: "user-1",
      action: "updated",
      entityType: "grant",
      entityId: "grant-1",
      changes: {
        federalAwardMetadata: expect.arrayContaining(["assistanceListingNumber", "federalAgency"]),
      },
    });
    expect(result).toMatchObject({
      grantId: "grant-1",
      assistanceListingNumber: "14.218",
      federalAgency: "HUD",
      sefaInclusionType: "cash",
    });
  });

  it("allows incomplete federal metadata so SEFA can surface warnings", async () => {
    const returning = vi.fn().mockResolvedValue([
      {
        id: "metadata-1",
        orgId: "org-1",
        entityId: "entity-1",
        grantId: "grant-1",
        assistanceListingNumber: null,
        assistanceListingTitle: null,
        federalAgency: null,
        fain: null,
        passThroughEntityName: null,
        passThroughIdentifyingNumber: null,
        programName: null,
        clusterName: null,
        sefaInclusionType: "cash",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
        deletedAt: null,
      },
    ]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const db = {
      query: {
        grants: {
          findFirst: vi.fn().mockResolvedValue({ id: "grant-1", entityId: "entity-1" }),
        },
      },
      insert: vi.fn().mockReturnValue({ values }),
    };

    const result = await upsertGrantFederalAwardMetadata(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      grantId: "grant-1",
      data: { sefaInclusionType: "cash" },
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        assistanceListingNumber: null,
        assistanceListingTitle: null,
        federalAgency: null,
      }),
    );
    expect(result).toMatchObject({
      assistanceListingNumber: null,
      federalAgency: null,
      sefaInclusionType: "cash",
    });
  });

  it("fails if the metadata upsert does not return a row", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const db = {
      query: {
        grants: {
          findFirst: vi.fn().mockResolvedValue({ id: "grant-1", entityId: "entity-1" }),
        },
      },
      insert: vi.fn().mockReturnValue({ values }),
    };

    await expect(
      upsertGrantFederalAwardMetadata(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        grantId: "grant-1",
        data: { sefaInclusionType: "cash" },
      }),
    ).rejects.toThrow("Failed to save federal award metadata");
  });

  it("falls back to the default entity when grant lookup helpers are unavailable", async () => {
    const returning = vi.fn().mockResolvedValue([
      {
        id: "metadata-1",
        orgId: "org-1",
        entityId: "entity-1",
        grantId: "grant-1",
        assistanceListingNumber: null,
        assistanceListingTitle: null,
        federalAgency: null,
        fain: null,
        passThroughEntityName: null,
        passThroughIdentifyingNumber: null,
        programName: null,
        clusterName: null,
        sefaInclusionType: "cash",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
        deletedAt: null,
      },
    ]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const db = {
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue({ defaultEntityId: "entity-1" }),
        },
      },
      insert: vi.fn().mockReturnValue({ values }),
    };

    await upsertGrantFederalAwardMetadata(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      grantId: "grant-1",
      data: { sefaInclusionType: "cash" },
    });

    expect(db.query.organizations.findFirst).toHaveBeenCalled();
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ entityId: "entity-1" }));
  });
});

function makeInsertMock(returnValue: unknown) {
  const returningFn = vi.fn().mockResolvedValue([returnValue]);
  const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
  const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
  return { insertFn, valuesFn };
}

function makeUpdateMock(returnValue: unknown) {
  const returningFn = vi.fn().mockResolvedValue([returnValue]);
  const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
  const setFn = vi.fn().mockReturnValue({ where: whereFn });
  const updateFn = vi.fn().mockReturnValue({ set: setFn });
  return { updateFn, setFn, whereFn };
}

function makeDeleteMock() {
  const whereFn = vi.fn().mockResolvedValue(undefined);
  const deleteFn = vi.fn().mockReturnValue({ where: whereFn });
  return { deleteFn, whereFn };
}

type FilteredGrantRow = {
  id: string;
  orgId?: string;
  funderId?: string | null;
  funderName?: string | null;
  name?: string | null;
  status?: string | null;
  amountCents?: number | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  applicationDeadline?: Date | string | null;
  description?: string | null;
  notes?: string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  deletedAt?: Date | string | null;
  allocationTotalCents?: number | null;
  expenseTotalCents?: number | null;
};

function makeFilteredListDb({
  summaryRows,
  countRows,
}: {
  summaryRows: FilteredGrantRow[];
  countRows?: Array<{ count?: number } | undefined>;
}) {
  const allocationAs = vi
    .fn()
    .mockReturnValue({ grantId: "allocation-grant-id", allocationTotalCents: "allocation-total" });
  const allocationGroupBy = vi.fn().mockReturnValue({ as: allocationAs });
  const allocationWhere = vi.fn().mockReturnValue({ groupBy: allocationGroupBy });
  const allocationInnerJoin = vi.fn().mockReturnValue({ where: allocationWhere });
  const allocationFrom = vi.fn().mockReturnValue({ innerJoin: allocationInnerJoin });

  const expenseAs = vi
    .fn()
    .mockReturnValue({ grantId: "expense-grant-id", expenseTotalCents: "expense-total" });
  const expenseGroupBy = vi.fn().mockReturnValue({ as: expenseAs });
  const expenseWhere = vi.fn().mockReturnValue({ groupBy: expenseGroupBy });
  const expenseFrom = vi.fn().mockReturnValue({ where: expenseWhere });

  const offset = vi.fn().mockResolvedValue(summaryRows);
  const limit = vi.fn().mockReturnValue({ offset });
  const orderBy = vi.fn().mockReturnValue({ limit });
  const summaryWhere = vi.fn().mockReturnValue({ orderBy });
  const summaryThirdLeftJoin = vi.fn().mockReturnValue({ where: summaryWhere });
  const summarySecondLeftJoin = vi.fn().mockReturnValue({ leftJoin: summaryThirdLeftJoin });
  const summaryFirstLeftJoin = vi.fn().mockReturnValue({ leftJoin: summarySecondLeftJoin });
  const summaryFrom = vi.fn().mockReturnValue({ leftJoin: summaryFirstLeftJoin });

  const countWhere = vi.fn().mockResolvedValue(countRows ?? [{ count: summaryRows.length }]);
  const countSecondLeftJoin = vi.fn().mockReturnValue({ where: countWhere });
  const countFirstLeftJoin = vi.fn().mockReturnValue({ leftJoin: countSecondLeftJoin });
  const countFrom = vi.fn().mockReturnValue({ leftJoin: countFirstLeftJoin });

  const select = vi
    .fn()
    .mockReturnValueOnce({ from: allocationFrom })
    .mockReturnValueOnce({ from: expenseFrom })
    .mockReturnValueOnce({ from: summaryFrom })
    .mockReturnValueOnce({ from: countFrom });

  return {
    db: { select },
    offset,
    countWhere,
    allocationWhere,
    allocationInnerJoin,
    summaryWhere,
  };
}

function containsReference(value: unknown, target: unknown, seen = new WeakSet<object>()): boolean {
  if (value === target) return true;

  if (Array.isArray(value)) {
    return value.some((entry) => containsReference(entry, target, seen));
  }

  if (value && typeof value === "object") {
    if (seen.has(value as object)) {
      return false;
    }

    seen.add(value as object);

    return Object.values(value as Record<string, unknown>).some((entry) =>
      containsReference(entry, target, seen),
    );
  }

  return false;
}

function renderSql(condition: unknown) {
  const dialect = new PgDialect();
  return dialect.sqlToQuery(condition as Parameters<PgDialect["sqlToQuery"]>[0]);
}

describe("listGrants", () => {
  it("returns paginated grants", async () => {
    const countWhere = vi.fn().mockResolvedValue([{ count: 6 }]);
    const db = {
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue({ id: "org-1", planTier: "starter" }),
        },
      },
      select: vi.fn().mockImplementation(() => {
        const count = db.select.mock.calls.length;
        if (count === 1) {
          return {
            from: vi.fn().mockReturnValue({
              leftJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      offset: vi.fn().mockResolvedValue([
                        {
                          id: "grant-1",
                          orgId: "org-1",
                          funderId: "funder-1",
                          funderName: "Acme Foundation",
                          name: "Summer Programs",
                        },
                      ]),
                    }),
                  }),
                }),
              }),
            }),
          };
        }

        return {
          from: vi.fn().mockReturnValue({
            where: count === 2 ? vi.fn().mockResolvedValue([{ count: 1 }]) : countWhere,
          }),
        };
      }),
    };

    const result = await listGrants(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
      sortBy: "updatedAt",
      sortOrder: "desc",
    });

    expect(result.total).toBe(1);
    expect(result.capacity).toEqual({
      planTier: "starter",
      billingCapGrantCount: 6,
      includedCap: 10,
      softHeadroomCap: 20,
      overageCount: 0,
      overageCopy: "$10/active grant/month",
      overageMonthlyCents: 1000,
    });
    expect(result.data).toEqual([
      {
        id: "grant-1",
        orgId: "org-1",
        funderId: "funder-1",
        funder: { id: "funder-1", name: "Acme Foundation" },
        name: "Summer Programs",
      },
    ]);
  });

  it("returns null funder display data when the funder is missing", async () => {
    const db = {
      select: vi.fn().mockImplementation(() => {
        const count = db.select.mock.calls.length;
        if (count === 1) {
          return {
            from: vi.fn().mockReturnValue({
              leftJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      offset: vi.fn().mockResolvedValue([
                        {
                          id: "grant-1",
                          orgId: "org-1",
                          funderId: "funder-1",
                          funderName: null,
                          name: "Summer Programs",
                        },
                      ]),
                    }),
                  }),
                }),
              }),
            }),
          };
        }

        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 1 }]),
          }),
        };
      }),
    };

    const result = await listGrants(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
      sortBy: "updatedAt",
      sortOrder: "desc",
    });

    expect(result.data[0]).toMatchObject({
      id: "grant-1",
      funderId: "funder-1",
      funder: null,
    });
  });

  it("supports search, filters, and alternate sort columns", async () => {
    const makeDb = () => {
      const offset = vi.fn().mockResolvedValue([]);
      const limit = vi.fn().mockReturnValue({ offset });
      const orderBy = vi.fn().mockReturnValue({ limit });
      const where = vi.fn().mockReturnValue({ orderBy });
      const leftJoin = vi.fn().mockReturnValue({ where });
      const from = vi.fn().mockReturnValue({ leftJoin });
      const countWhere = vi.fn().mockResolvedValue([{ count: 0 }]);
      const countFrom = vi.fn().mockReturnValue({ where: countWhere });
      const select = vi.fn().mockReturnValueOnce({ from }).mockReturnValueOnce({ from: countFrom });
      return { db: { select }, offset };
    };

    const sortVariants = [
      "name",
      "status",
      "amountCents",
      "applicationDeadline",
      "createdAt",
    ] as const;

    for (const sortBy of sortVariants) {
      const { db, offset } = makeDb();
      await listGrants(db as never, {
        orgId: "org-1",
        page: 2,
        pageSize: 10,
        search: "summer",
        status: "active",
        funderId: "funder-1",
        sortBy,
        sortOrder: "asc",
      });
      expect(offset).toHaveBeenCalledWith(10);
    }
  });

  it("filters by fund allocation and derived threshold state", async () => {
    const { db, allocationWhere, summaryWhere } = makeFilteredListDb({
      summaryRows: [
        {
          id: "grant-1",
          funderId: "funder-1",
          funderName: "Acme Foundation",
          name: "Qualified Grant",
          status: "active",
          updatedAt: new Date("2026-03-02T00:00:00Z"),
          amountCents: 100_000,
          allocationTotalCents: 100_000,
          expenseTotalCents: 92_000,
        },
      ],
    });

    const result = await listGrants(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
      sortBy: "updatedAt",
      sortOrder: "desc",
      fundId: "fund-1",
      threshold: "90",
    });

    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: "grant-1",
      funder: { id: "funder-1", name: "Acme Foundation" },
    });
    expect(allocationWhere).toHaveBeenCalledTimes(1);
    expect(summaryWhere).toHaveBeenCalledTimes(1);
  });

  it("includes active entity scope in the list predicate", async () => {
    const { db, summaryWhere } = makeFilteredListDb({
      summaryRows: [],
    });

    await listGrants(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      page: 1,
      pageSize: 25,
      sortBy: "updatedAt",
      sortOrder: "desc",
      threshold: "80",
    });

    const renderedWhere = renderSql(summaryWhere.mock.calls[0]?.[0]);
    expect(renderedWhere.sql).toContain('"grants"."entity_id" = $');
    expect(renderedWhere.params).toContain("entity-1");
  });

  it("returns an empty filtered page when no grants are allocated from the selected fund", async () => {
    const { db } = makeFilteredListDb({
      summaryRows: [],
    });

    const result = await listGrants(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
      sortBy: "updatedAt",
      sortOrder: "desc",
      fundId: "fund-missing",
    });

    expect(result).toMatchObject({
      data: [],
      total: 0,
      page: 1,
      pageSize: 25,
    });
  });

  it("excludes soft-deleted funds from filtered allocation totals", async () => {
    const { db, allocationInnerJoin, allocationWhere, summaryWhere } = makeFilteredListDb({
      summaryRows: [
        {
          id: "grant-live-fund",
          name: "Live Fund Grant",
          amountCents: 100_000,
          allocationTotalCents: 75_000,
          expenseTotalCents: 25_000,
        },
      ],
    });

    const result = await listGrants(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
      sortBy: "updatedAt",
      sortOrder: "desc",
      fundId: "fund-1",
      threshold: "80",
    });

    expect(result.data).toHaveLength(1);
    expect(allocationInnerJoin).toHaveBeenCalledWith(funds, expect.anything());
    expect(allocationWhere).toHaveBeenCalledTimes(1);
    expect(containsReference(allocationWhere.mock.calls[0]?.[0], funds.deletedAt)).toBe(true);
    const renderedWhere = renderSql(summaryWhere.mock.calls[0]?.[0]);
    expect(renderedWhere.sql).toContain('"funds"."deleted_at" IS NULL');
    expect(renderedWhere.params).toContain("fund-1");
  });

  it("excludes soft-deleted allocations from the allocation totals subquery", async () => {
    const { db, allocationWhere } = makeFilteredListDb({
      summaryRows: [
        {
          id: "grant-live-alloc",
          name: "Live Allocation Grant",
          amountCents: 100_000,
          allocationTotalCents: 60_000,
          expenseTotalCents: 10_000,
        },
      ],
    });

    await listGrants(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
      sortBy: "updatedAt",
      sortOrder: "desc",
      threshold: "80",
    });

    expect(allocationWhere).toHaveBeenCalledTimes(1);
    const renderedAllocationWhere = renderSql(allocationWhere.mock.calls[0]?.[0]);
    // The WHERE clause must include both the allocation-level and fund-level deleted_at guards.
    // When rendered without full query context, drizzle emits "is null" for each isNull() condition.
    const isNullCount = (renderedAllocationWhere.sql.match(/is null/gi) ?? []).length;
    expect(isNullCount).toBeGreaterThanOrEqual(2);
  });

  it("excludes soft-deleted allocations from the fundId existence subquery", async () => {
    const { db, summaryWhere } = makeFilteredListDb({
      summaryRows: [
        {
          id: "grant-fund-filter",
          name: "Fund Filter Grant",
          amountCents: 100_000,
          allocationTotalCents: 80_000,
          expenseTotalCents: 20_000,
        },
      ],
    });

    await listGrants(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
      sortBy: "updatedAt",
      sortOrder: "desc",
      fundId: "fund-1",
    });

    const renderedWhere = renderSql(summaryWhere.mock.calls[0]?.[0]);
    expect(renderedWhere.sql.toLowerCase()).toContain(
      '"grant_fund_allocations"."deleted_at" is null',
    );
  });

  it("supports threshold-only filtering across the 80 and 100 percent spend states", async () => {
    const thresholdEighty = await listGrants(
      makeFilteredListDb({
        summaryRows: [
          {
            id: "grant-80",
            name: "Threshold 80 Grant",
            amountCents: 100_000,
            allocationTotalCents: 100_000,
            expenseTotalCents: 85_000,
          },
        ],
      }).db as never,
      {
        orgId: "org-1",
        page: 1,
        pageSize: 25,
        sortBy: "updatedAt",
        sortOrder: "desc",
        threshold: "80",
      },
    );

    const thresholdHundred = await listGrants(
      makeFilteredListDb({
        summaryRows: [
          {
            id: "grant-100",
            name: "Threshold 100 Grant",
            amountCents: 100_000,
            allocationTotalCents: 100_000,
            expenseTotalCents: 100_000,
          },
        ],
      }).db as never,
      {
        orgId: "org-1",
        page: 1,
        pageSize: 25,
        sortBy: "updatedAt",
        sortOrder: "desc",
        threshold: "100",
      },
    );

    const thresholdEightyGrant = thresholdEighty.data[0] as
      | ((typeof thresholdEighty.data)[number] & { summary?: { thresholdState?: string } })
      | undefined;
    const thresholdHundredGrant = thresholdHundred.data[0] as
      | ((typeof thresholdHundred.data)[number] & { summary?: { thresholdState?: string } })
      | undefined;

    expect(thresholdEightyGrant?.summary?.thresholdState).toBe("80");
    expect(thresholdHundredGrant?.summary?.thresholdState).toBe("100");
  });

  it("sorts filtered grant results across alternate sort columns", async () => {
    const rows = [
      {
        id: "grant-b",
        name: "Alpha Grant",
        status: "active",
        updatedAt: new Date("2026-03-01T00:00:00Z"),
        createdAt: new Date("2026-01-01T00:00:00Z"),
        applicationDeadline: null,
        amountCents: 100_000,
        allocationTotalCents: 100_000,
        expenseTotalCents: 20_000,
      },
      {
        id: "grant-a",
        name: "Bravo Grant",
        status: "submitted",
        updatedAt: new Date("2026-03-02T00:00:00Z"),
        createdAt: new Date("2026-01-02T00:00:00Z"),
        applicationDeadline: new Date("2026-06-01T00:00:00Z"),
        amountCents: 200_000,
        allocationTotalCents: 200_000,
        expenseTotalCents: 50_000,
      },
    ];

    const byName = await listGrants(makeFilteredListDb({ summaryRows: rows }).db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
      sortBy: "name",
      sortOrder: "asc",
      fundId: "fund-1",
    });
    expect(byName.data.map((grant) => grant.id)).toEqual(["grant-b", "grant-a"]);

    const byStatus = await listGrants(makeFilteredListDb({ summaryRows: rows }).db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
      sortBy: "status",
      sortOrder: "asc",
      fundId: "fund-1",
    });
    expect(byStatus.data.map((grant) => grant.id)).toEqual(["grant-b", "grant-a"]);

    const byAmount = await listGrants(
      makeFilteredListDb({
        summaryRows: [rows[1]!, rows[0]!],
      }).db as never,
      {
        orgId: "org-1",
        page: 1,
        pageSize: 25,
        sortBy: "amountCents",
        sortOrder: "desc",
        fundId: "fund-1",
      },
    );
    expect(byAmount.data.map((grant) => grant.id)).toEqual(["grant-a", "grant-b"]);

    const byDeadline = await listGrants(makeFilteredListDb({ summaryRows: rows }).db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
      sortBy: "applicationDeadline",
      sortOrder: "asc",
      fundId: "fund-1",
    });
    expect(byDeadline.data.map((grant) => grant.id)).toEqual(["grant-b", "grant-a"]);

    const byCreatedAt = await listGrants(
      makeFilteredListDb({
        summaryRows: [rows[1]!, rows[0]!],
      }).db as never,
      {
        orgId: "org-1",
        page: 1,
        pageSize: 25,
        sortBy: "createdAt",
        sortOrder: "desc",
        fundId: "fund-1",
      },
    );
    expect(byCreatedAt.data.map((grant) => grant.id)).toEqual(["grant-a", "grant-b"]);
  });

  it("keeps filtered grant ordering stable when compared sort values are equal", async () => {
    const { db } = makeFilteredListDb({
      summaryRows: [
        {
          id: "grant-1",
          name: "Equal Grant One",
          status: "active",
          updatedAt: new Date("2026-03-02T00:00:00Z"),
          amountCents: 100_000,
          allocationTotalCents: 100_000,
          expenseTotalCents: 10_000,
        },
        {
          id: "grant-2",
          name: "Equal Grant Two",
          status: "active",
          updatedAt: new Date("2026-03-01T00:00:00Z"),
          amountCents: 100_000,
          allocationTotalCents: 100_000,
          expenseTotalCents: 15_000,
        },
      ],
    });

    const result = await listGrants(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
      sortBy: "amountCents",
      sortOrder: "asc",
      fundId: "fund-1",
    });

    expect(result.data.map((grant) => grant.id)).toEqual(["grant-1", "grant-2"]);
  });

  it("sorts filtered grant results by updatedAt when no alternate sort column is selected", async () => {
    const { db } = makeFilteredListDb({
      summaryRows: [
        {
          id: "grant-2",
          name: "Second Grant",
          status: "active",
          updatedAt: new Date("2026-03-02T00:00:00Z"),
          amountCents: 120_000,
          allocationTotalCents: 120_000,
          expenseTotalCents: 15_000,
        },
        {
          id: "grant-1",
          name: "First Grant",
          status: "active",
          updatedAt: new Date("2026-03-01T00:00:00Z"),
          amountCents: 100_000,
          allocationTotalCents: 100_000,
          expenseTotalCents: 10_000,
        },
      ],
    });

    const result = await listGrants(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
      sortBy: "updatedAt",
      sortOrder: "desc",
      fundId: "fund-1",
    });

    expect(result.data.map((grant) => grant.id)).toEqual(["grant-2", "grant-1"]);
  });

  it("handles filtered sort fallbacks and missing count rows", async () => {
    const filteredRows = [
      {
        id: "grant-1",
        name: "Fallback One",
        status: "active",
        updatedAt: new Date("2026-03-01T00:00:00Z"),
        amountCents: undefined,
        applicationDeadline: new Date("2026-06-01T00:00:00Z"),
        allocationTotalCents: 100_000,
        expenseTotalCents: 10_000,
      },
      {
        id: "grant-2",
        name: "Fallback Two",
        status: "active",
        updatedAt: new Date("2026-03-02T00:00:00Z"),
        amountCents: 100_000,
        applicationDeadline: null,
        allocationTotalCents: 100_000,
        expenseTotalCents: 20_000,
      },
    ];

    const filteredByAmount = await listGrants(
      makeFilteredListDb({ summaryRows: filteredRows }).db as never,
      {
        orgId: "org-1",
        page: 1,
        pageSize: 25,
        sortBy: "amountCents",
        sortOrder: "asc",
        fundId: "fund-1",
      },
    );
    expect(filteredByAmount.data.map((grant) => grant.id)).toEqual(["grant-1", "grant-2"]);

    const filteredByDeadline = await listGrants(
      makeFilteredListDb({ summaryRows: filteredRows }).db as never,
      {
        orgId: "org-1",
        page: 1,
        pageSize: 25,
        sortBy: "applicationDeadline",
        sortOrder: "desc",
        fundId: "fund-1",
      },
    );
    expect(filteredByDeadline.data.map((grant) => grant.id)).toEqual(["grant-1", "grant-2"]);

    const selectDb = {
      select: vi.fn().mockImplementation(() => {
        const count = selectDb.select.mock.calls.length;
        if (count === 1) {
          return {
            from: vi.fn().mockReturnValue({
              leftJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      offset: vi.fn().mockResolvedValue([]),
                    }),
                  }),
                }),
              }),
            }),
          };
        }

        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([undefined]),
          }),
        };
      }),
    };

    const unfiltered = await listGrants(selectDb as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
      sortBy: "updatedAt",
      sortOrder: "desc",
    });

    expect(unfiltered.total).toBe(0);
  });

  it("scopes allocationTotals innerJoin by funds.orgId (fix #4)", async () => {
    // grantFundAllocations has no org_id column; cross-org scoping happens via
    // funds.orgId in the JOIN ON clause.
    const { db, allocationInnerJoin } = makeFilteredListDb({
      summaryRows: [],
    });

    await listGrants(db as never, {
      orgId: "org-scoped",
      page: 1,
      pageSize: 25,
      sortBy: "updatedAt",
      sortOrder: "desc",
      threshold: "80",
    });

    // The innerJoin ON predicate must reference funds.orgId.
    expect(allocationInnerJoin).toHaveBeenCalledWith(funds, expect.anything());
    const innerJoinPredicate = allocationInnerJoin.mock.calls[0]?.[1];
    expect(containsReference(innerJoinPredicate, funds.orgId)).toBe(true);
  });

  it("scopes expenseTotals subquery WHERE by expenses.orgId (fix #5)", async () => {
    // Import expenses to reference the real column object.
    const { expenses: expensesTable } = await import("@grantpipe/db");

    const expenseWhereSpy = vi.fn().mockReturnValue({
      groupBy: vi.fn().mockReturnValue({
        as: vi.fn().mockReturnValue({ grantId: "expense-grant-id", expenseTotalCents: "0" }),
      }),
    });
    const expenseFromSpy = vi.fn().mockReturnValue({ where: expenseWhereSpy });

    const allocationAs = vi.fn().mockReturnValue({ grantId: "g", allocationTotalCents: "0" });
    const allocationGroupBy = vi.fn().mockReturnValue({ as: allocationAs });
    const allocationWhereSpy = vi.fn().mockReturnValue({ groupBy: allocationGroupBy });
    const allocationInnerJoinSpy = vi.fn().mockReturnValue({ where: allocationWhereSpy });
    const allocationFromSpy = vi.fn().mockReturnValue({ innerJoin: allocationInnerJoinSpy });

    const offset = vi.fn().mockResolvedValue([]);
    const limit = vi.fn().mockReturnValue({ offset });
    const orderBy = vi.fn().mockReturnValue({ limit });
    const summaryWhere = vi.fn().mockReturnValue({ orderBy });
    const summaryThirdLeftJoin = vi.fn().mockReturnValue({ where: summaryWhere });
    const summarySecondLeftJoin = vi.fn().mockReturnValue({ leftJoin: summaryThirdLeftJoin });
    const summaryFirstLeftJoin = vi.fn().mockReturnValue({ leftJoin: summarySecondLeftJoin });
    const summaryFrom = vi.fn().mockReturnValue({ leftJoin: summaryFirstLeftJoin });
    const countWhere = vi.fn().mockResolvedValue([{ count: 0 }]);
    const countSecondLeftJoin = vi.fn().mockReturnValue({ where: countWhere });
    const countFirstLeftJoin = vi.fn().mockReturnValue({ leftJoin: countSecondLeftJoin });
    const countFrom = vi.fn().mockReturnValue({ leftJoin: countFirstLeftJoin });

    // Simple count-returns-zero builder for resolvePlanTier + countBillingCapGrants
    const makeZeroCountBuilder = () => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      }),
    });

    let selectCall = 0;
    const select = vi.fn().mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) return { from: allocationFromSpy };
      if (selectCall === 2) return { from: expenseFromSpy };
      if (selectCall === 3) return { from: summaryFrom };
      if (selectCall === 4) return { from: countFrom };
      // Additional calls from getGrantCapacityMetadata (countBillingCapGrants)
      return makeZeroCountBuilder();
    });

    const db = {
      select,
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue({ planTier: "starter" }),
        },
      },
    };

    await listGrants(db as never, {
      orgId: "org-scoped",
      page: 1,
      pageSize: 25,
      sortBy: "updatedAt",
      sortOrder: "desc",
      threshold: "80",
    });

    // The expenseTotals WHERE must reference expenses.orgId.
    expect(expenseWhereSpy).toHaveBeenCalledTimes(1);
    const expWhereArg = expenseWhereSpy.mock.calls[0]?.[0];
    expect(containsReference(expWhereArg, expensesTable.orgId)).toBe(true);
  });

  it("scopes EXISTS fundId filter by funds.orgId (fix #6)", async () => {
    // grantFundAllocations has no org_id column; cross-org scoping is achieved by
    // adding funds.orgId = orgId to the EXISTS subquery's ON clause.
    const { db, summaryWhere } = makeFilteredListDb({ summaryRows: [] });

    await listGrants(db as never, {
      orgId: "org-scoped",
      page: 1,
      pageSize: 25,
      sortBy: "updatedAt",
      sortOrder: "desc",
      fundId: "fund-x",
    });

    // The EXISTS subquery is embedded in the WHERE for the filtered query.
    // renderSql converts it to a string we can inspect.
    const rendered = renderSql(summaryWhere.mock.calls[0]?.[0]);
    expect(rendered.sql).toContain('"funds"."org_id"');
  });
});

describe("listGrantPipeline", () => {
  it("groups grants by status", async () => {
    const db = {
      query: {
        grants: {
          findMany: vi.fn().mockResolvedValue([
            { id: "grant-1", status: "discovery" },
            { id: "grant-2", status: "active" },
          ]),
        },
      },
    };

    const result = await listGrantPipeline(db as never, { orgId: "org-1" });
    expect(result.discovery.count).toBe(1);
    expect(result.active.count).toBe(1);
  });
});

describe("getGrant", () => {
  it("returns a grant with computed summary fields", async () => {
    const db = {
      query: {
        grants: {
          findFirst: vi.fn().mockResolvedValue({
            id: "grant-1",
            amountCents: 1_000_000,
            startDate: "2026-01-01T00:00:00Z",
            fundAllocations: [{ allocatedAmountCents: 850_000 }],
            expenses: [{ amountCents: 920_000 }],
            impactMetrics: [
              {
                id: "metric-1",
                targetValue: "120",
                entries: [{ value: "35" }],
              },
            ],
            reportingRequirements: [
              {
                id: "req-1",
                status: "upcoming",
                dueDate: "2026-01-01T00:00:00Z",
              },
            ],
            closeoutItems: [
              {
                id: "closeout-1",
                completed: true,
                completedBy: "user-1",
                completedByUser: { name: "Dana Lee" },
              },
            ],
          }),
        },
      },
    };

    const result = await getGrant(db as never, {
      orgId: "org-1",
      grantId: "grant-1",
      now: new Date("2026-02-01T00:00:00Z"),
    });

    // The completing user's name is joined so the UI can show "by Dana Lee"
    // rather than the raw user id.
    expect(result.closeoutItems[0]!.completedByUser?.name).toBe("Dana Lee");
    expect(result.summary.thresholdState).toBe("90");
    expect(result.summary.remainingBalanceCents).toBe(80_000);
    expect(result.summary.unallocatedBalanceCents).toBe(150_000);
    expect(result.summary.burnRateCentsPerMonth).toBe(890_323);
    expect(result.reportingRequirements[0]!.derivedStatus).toBe("overdue");
    expect(result.impactMetrics[0]!.actualValue).toBe(35);
  });

  it("returns submitted requirements and throws when grant is missing", async () => {
    const db = {
      query: {
        grants: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce({
              id: "grant-1",
              amountCents: null,
              fundAllocations: [],
              expenses: [],
              impactMetrics: [{ id: "metric-1", entries: [{ value: null }] }],
              reportingRequirements: [{ id: "req-1", status: "submitted", dueDate: new Date() }],
              closeoutItems: [],
            })
            .mockResolvedValueOnce(undefined),
        },
      },
    };

    const result = await getGrant(db as never, {
      orgId: "org-1",
      grantId: "grant-1",
      now: new Date("2026-02-01T00:00:00Z"),
    });
    expect(result.reportingRequirements[0]!.derivedStatus).toBe("submitted");
    expect(result.impactMetrics[0]!.actualValue).toBe(0);
    expect(result.summary.remainingBalanceCents).toBeNull();

    await expect(getGrant(db as never, { orgId: "org-1", grantId: "missing" })).rejects.toThrow(
      "Grant not found",
    );
  });

  it("ignores soft-deleted child rows when computing a grant summary", async () => {
    const db = {
      query: {
        grants: {
          findFirst: vi.fn().mockResolvedValue({
            id: "grant-1",
            amountCents: 1_000_000,
            startDate: "2026-01-01T00:00:00Z",
            fundAllocations: [
              {
                allocatedAmountCents: 900_000,
                fund: { deletedAt: null },
              },
              {
                allocatedAmountCents: 100_000,
                fund: { deletedAt: new Date("2026-03-01T00:00:00Z") },
              },
            ],
            expenses: [
              { amountCents: 850_000, deletedAt: null },
              { amountCents: 100_000, deletedAt: new Date("2026-03-01T00:00:00Z") },
            ],
            impactMetrics: [],
            reportingRequirements: [],
            closeoutItems: [],
          }),
        },
      },
    };

    const result = await getGrant(db as never, {
      orgId: "org-1",
      grantId: "grant-1",
    });

    expect(result.summary.remainingBalanceCents).toBe(150_000);
    expect(result.summary.unallocatedBalanceCents).toBe(100_000);
    expect(result.summary.thresholdState).toBe("80");
  });

  it("does not return soft-deleted reporting requirements or closeout items", async () => {
    // The DB layer applies the `where: isNull(deletedAt)` filter, so the mock
    // returns only the rows that would survive that filter — simulating that
    // soft-deleted rows are absent from the result set.
    const db = {
      query: {
        grants: {
          findFirst: vi.fn().mockResolvedValue({
            id: "grant-1",
            amountCents: 500_000,
            startDate: "2026-01-01T00:00:00Z",
            fundAllocations: [],
            expenses: [],
            impactMetrics: [],
            // Only the live requirement is returned (deleted one is filtered by DB)
            reportingRequirements: [
              { id: "req-live", status: "upcoming", dueDate: "2027-01-01T00:00:00Z" },
            ],
            // Only the live closeout item is returned (deleted one is filtered by DB)
            closeoutItems: [{ id: "closeout-live", completed: false }],
          }),
        },
      },
    };

    const result = await getGrant(db as never, {
      orgId: "org-1",
      grantId: "grant-1",
      now: new Date("2026-04-01T00:00:00Z"),
    });

    expect(result.reportingRequirements).toHaveLength(1);
    expect(result.reportingRequirements[0]!.id).toBe("req-live");
    expect(result.closeoutItems).toHaveLength(1);
    expect(result.closeoutItems[0]!.id).toBe("closeout-live");
  });

  it("returns live program allocations and excludes soft-deleted ones", async () => {
    const db = {
      query: {
        grants: {
          findFirst: vi.fn().mockResolvedValue({
            id: "grant-1",
            amountCents: 500_000,
            startDate: "2026-01-01T00:00:00Z",
            fundAllocations: [],
            expenses: [],
            impactMetrics: [],
            reportingRequirements: [],
            closeoutItems: [],
            programAllocations: [
              {
                id: "gpa-live",
                programId: "program-1",
                amountCents: 250_000,
                percentBasisPoints: null,
                deletedAt: null,
                program: { id: "program-1", name: "After School", deletedAt: null },
              },
              {
                id: "gpa-deleted",
                programId: "program-2",
                amountCents: 100_000,
                percentBasisPoints: null,
                deletedAt: new Date("2026-03-01T00:00:00Z"),
                program: { id: "program-2", name: "Old", deletedAt: null },
              },
              {
                id: "gpa-deleted-program",
                programId: "program-3",
                amountCents: 100_000,
                percentBasisPoints: null,
                deletedAt: null,
                program: { id: "program-3", name: "Archived", deletedAt: new Date() },
              },
            ],
          }),
        },
      },
    };

    const result = await getGrant(db as never, { orgId: "org-1", grantId: "grant-1" });

    expect(result.programAllocations).toHaveLength(1);
    expect(result.programAllocations[0]!.id).toBe("gpa-live");
    expect(result.programAllocations[0]!.program?.name).toBe("After School");
  });

  it("defaults program allocations to an empty array when absent", async () => {
    const db = {
      query: {
        grants: {
          findFirst: vi.fn().mockResolvedValue({
            id: "grant-1",
            amountCents: 500_000,
            startDate: "2026-01-01T00:00:00Z",
            fundAllocations: [],
            expenses: [],
            impactMetrics: [],
            reportingRequirements: [],
            closeoutItems: [],
          }),
        },
      },
    };

    const result = await getGrant(db as never, { orgId: "org-1", grantId: "grant-1" });

    expect(result.programAllocations).toEqual([]);
  });

  it("returns live per-expense program allocations and excludes soft-deleted ones", async () => {
    const db = {
      query: {
        grants: {
          findFirst: vi.fn().mockResolvedValue({
            id: "grant-1",
            amountCents: 500_000,
            startDate: "2026-01-01T00:00:00Z",
            fundAllocations: [],
            expenses: [
              {
                id: "expense-1",
                amountCents: 100_000,
                deletedAt: null,
                programAllocations: [
                  {
                    id: "epa-live",
                    programId: "program-1",
                    amountCents: 100_000,
                    percentBasisPoints: null,
                    deletedAt: null,
                    program: { id: "program-1", name: "After School", deletedAt: null },
                  },
                  {
                    id: "epa-deleted",
                    programId: "program-2",
                    amountCents: 50_000,
                    percentBasisPoints: null,
                    deletedAt: new Date("2026-03-01T00:00:00Z"),
                    program: { id: "program-2", name: "Old", deletedAt: null },
                  },
                  {
                    id: "epa-deleted-program",
                    programId: "program-3",
                    amountCents: 25_000,
                    percentBasisPoints: null,
                    deletedAt: null,
                    program: { id: "program-3", name: "Archived", deletedAt: new Date() },
                  },
                ],
              },
            ],
            impactMetrics: [],
            reportingRequirements: [],
            closeoutItems: [],
            programAllocations: [],
          }),
        },
      },
    };

    const result = await getGrant(db as never, { orgId: "org-1", grantId: "grant-1" });

    expect(result.expenses).toHaveLength(1);
    expect(result.expenses[0]!.programAllocations).toHaveLength(1);
    expect(result.expenses[0]!.programAllocations[0]!.id).toBe("epa-live");
    expect(result.expenses[0]!.programAllocations[0]!.program?.name).toBe("After School");
  });

  it("defaults per-expense program allocations to an empty array when absent", async () => {
    const db = {
      query: {
        grants: {
          findFirst: vi.fn().mockResolvedValue({
            id: "grant-1",
            amountCents: 500_000,
            startDate: "2026-01-01T00:00:00Z",
            fundAllocations: [],
            expenses: [{ id: "expense-1", amountCents: 100_000, deletedAt: null }],
            impactMetrics: [],
            reportingRequirements: [],
            closeoutItems: [],
            programAllocations: [],
          }),
        },
      },
    };

    const result = await getGrant(db as never, { orgId: "org-1", grantId: "grant-1" });

    expect(result.expenses[0]!.programAllocations).toEqual([]);
  });
});

describe("grant mutations", () => {
  it("creates, updates, and soft deletes grants", async () => {
    const funderLookup = vi.fn().mockResolvedValue({ id: "funder-1", orgId: "org-1" });
    const create = makeInsertMock({ id: "grant-1" });
    const update = makeUpdateMock({ id: "grant-1", notes: "Updated" });
    const db = {
      query: {
        funders: {
          findFirst: funderLookup,
        },
        organizations: {
          findFirst: vi.fn().mockResolvedValue({ id: "org-1", planTier: "audit_ready" }),
        },
      },
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 0 }]),
        }),
      }),
      insert: create.insertFn,
      update: update.updateFn,
    };

    const created = await createGrant(withTransaction(db) as never, {
      orgId: "org-1",
      funderId: "funder-1",
      name: "Summer Programs",
    });
    expect(created).toEqual({ id: "grant-1" });

    const updated = await updateGrant(withTransaction({ update: update.updateFn }) as never, {
      orgId: "org-1",
      grantId: "grant-1",
      data: { notes: "Updated" },
    });
    expect(updated).toEqual({ id: "grant-1", notes: "Updated" });

    await deleteGrant(withTransaction({ update: update.updateFn }) as never, {
      orgId: "org-1",
      grantId: "grant-1",
    });
  });

  it("records grant mutation activity when an actor is provided", async () => {
    const funderLookup = vi.fn().mockResolvedValue({ id: "funder-1", orgId: "org-1" });
    const create = makeInsertMock({ id: "grant-1" });
    const update = makeUpdateMock({ id: "grant-1", notes: "Updated" });
    vi.mocked(recordActivityLog).mockClear();
    const db = {
      query: {
        funders: {
          findFirst: funderLookup,
        },
        organizations: {
          findFirst: vi.fn().mockResolvedValue({ id: "org-1", planTier: "audit_ready" }),
        },
      },
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 0 }]),
        }),
      }),
      insert: create.insertFn,
      update: update.updateFn,
    };

    const txDb = withTransaction(db);
    await createGrant(txDb as never, {
      orgId: "org-1",
      entityId: "entity-1",
      actorId: "actor-1",
      funderId: "funder-1",
      name: "Summer Programs",
    });
    await updateGrant(txDb as never, {
      orgId: "org-1",
      actorId: "actor-1",
      grantId: "grant-1",
      data: { notes: "Updated" },
    });
    await deleteGrant(txDb as never, {
      orgId: "org-1",
      actorId: "actor-1",
      grantId: "grant-1",
    });

    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledTimes(3);
    expect(create.valuesFn).toHaveBeenCalledWith(expect.objectContaining({ entityId: "entity-1" }));
    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        activeEntityId: "entity-1",
        entityId: "grant-1",
      }),
    );
  });

  it("rolls back grant create/update/delete when the audit-log write fails", async () => {
    const baseDb = {
      query: {
        funders: { findFirst: vi.fn().mockResolvedValue({ id: "funder-1", orgId: "org-1" }) },
        organizations: {
          findFirst: vi.fn().mockResolvedValue({ id: "org-1", planTier: "audit_ready" }),
        },
      },
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ count: 0 }]) }),
      }),
      insert: makeInsertMock({ id: "grant-1", name: "G" }).insertFn,
      update: makeUpdateMock({ id: "grant-1", name: "G" }).updateFn,
    };
    const db = withTransaction(baseDb);

    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    await expect(
      createGrant(db as never, {
        orgId: "org-1",
        actorId: "actor-1",
        funderId: "funder-1",
        name: "G",
      }),
    ).rejects.toThrow("audit log down");

    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    await expect(
      updateGrant(db as never, {
        orgId: "org-1",
        actorId: "actor-1",
        grantId: "grant-1",
        data: { notes: "n" },
      }),
    ).rejects.toThrow("audit log down");

    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    await expect(
      deleteGrant(db as never, {
        orgId: "org-1",
        actorId: "actor-1",
        grantId: "grant-1",
      }),
    ).rejects.toThrow("audit log down");
  });

  it("enforces the active grant cap when updating a terminal grant to an active status", async () => {
    const update = makeUpdateMock({ id: "grant-1", status: "active" });
    const countWhere = vi.fn().mockResolvedValue([{ count: 20 }]);
    const countFrom = vi.fn().mockReturnValue({ where: countWhere });
    const db = {
      query: {
        grants: {
          findFirst: vi.fn().mockResolvedValue({ id: "grant-1", status: "closeout" }),
        },
        organizations: {
          findFirst: vi.fn().mockResolvedValue({ id: "org-1", planTier: "starter" }),
        },
      },
      select: vi.fn().mockReturnValue({ from: countFrom }),
      update: update.updateFn,
      execute: vi.fn().mockResolvedValue([]),
    };

    await expect(
      updateGrant(withTransaction(db) as never, {
        orgId: "org-1",
        grantId: "grant-1",
        data: { status: "active" },
      }),
    ).rejects.toThrow("includes 10 active grants plus 10 grant headroom");
    expect(update.updateFn).not.toHaveBeenCalled();
    // Cap enforcement now happens inside the transaction under the advisory lock.
    expect(db.execute).toHaveBeenCalled();
  });

  it("allows creating billing-cap grants through the 10 grant headroom", async () => {
    const countSelectWhere = vi.fn().mockResolvedValue([{ count: 14 }]);
    const countSelectFrom = vi.fn().mockReturnValue({ where: countSelectWhere });
    const create = makeInsertMock({ id: "grant-new" });
    const db = {
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue({ id: "org-1", planTier: "starter" }),
        },
      },
      select: vi.fn().mockReturnValue({ from: countSelectFrom }),
      insert: create.insertFn,
      execute: vi.fn().mockResolvedValue([]),
    };

    await expect(
      createGrant(withTransaction(db) as never, {
        orgId: "org-1",
        funderId: "funder-1",
        name: "Headroom Grant",
        status: "active",
      }),
    ).resolves.toEqual({ id: "grant-new" });
    // Billing-cap create now serializes the count behind the advisory lock.
    expect(db.execute).toHaveBeenCalled();
  });

  it("does not enforce billing caps for submitted grants", async () => {
    const create = makeInsertMock({ id: "grant-new" });
    const db = {
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue({ id: "org-1", planTier: "starter" }),
        },
      },
      select: vi.fn(),
      insert: create.insertFn,
    };

    await expect(
      createGrant(withTransaction(db) as never, {
        orgId: "org-1",
        funderId: "funder-1",
        name: "Submitted Grant",
        status: "submitted",
      }),
    ).resolves.toEqual({ id: "grant-new" });
    expect(db.select).not.toHaveBeenCalled();
  });

  it("allows updating a terminal grant to active when the plan cap has room", async () => {
    const update = makeUpdateMock({ id: "grant-1", status: "active" });
    const countWhere = vi.fn().mockResolvedValue([{ count: 4 }]);
    const countFrom = vi.fn().mockReturnValue({ where: countWhere });
    const db = {
      query: {
        grants: {
          findFirst: vi.fn().mockResolvedValue({ id: "grant-1", status: "declined" }),
        },
        organizations: {
          findFirst: vi.fn().mockResolvedValue({ id: "org-1", planTier: "starter" }),
        },
      },
      select: vi.fn().mockReturnValue({ from: countFrom }),
      update: update.updateFn,
      execute: vi.fn().mockResolvedValue([]),
    };

    await expect(
      updateGrant(withTransaction(db) as never, {
        orgId: "org-1",
        grantId: "grant-1",
        data: { status: "active" },
      }),
    ).resolves.toEqual({ id: "grant-1", status: "active" });
    expect(update.updateFn).toHaveBeenCalled();
    expect(db.execute).toHaveBeenCalled();
  });

  it("does not double-count updates between active grant statuses", async () => {
    const update = makeUpdateMock({ id: "grant-1", status: "active" });
    const countWhere = vi.fn().mockResolvedValue([{ count: 5 }]);
    const countFrom = vi.fn().mockReturnValue({ where: countWhere });
    const selectFn = vi.fn().mockReturnValue({ from: countFrom });
    const executeFn = vi.fn().mockResolvedValue([]);
    const db = {
      query: {
        grants: {
          findFirst: vi.fn().mockResolvedValue({ id: "grant-1", status: "awarded" }),
        },
        organizations: {
          findFirst: vi.fn().mockResolvedValue({ id: "org-1", planTier: "starter" }),
        },
      },
      select: selectFn,
      update: update.updateFn,
      execute: executeFn,
    };

    await expect(
      updateGrant(withTransaction(db) as never, {
        orgId: "org-1",
        grantId: "grant-1",
        data: { status: "active" },
      }),
    ).resolves.toEqual({ id: "grant-1", status: "active" });
    expect(selectFn).not.toHaveBeenCalled();
    // Already a billing-cap status — no count and no advisory lock needed.
    expect(executeFn).not.toHaveBeenCalled();
    expect(update.updateFn).toHaveBeenCalled();
  });

  it("acquires the billing-cap advisory lock before counting on update (serialized claim)", async () => {
    const update = makeUpdateMock({ id: "grant-1", status: "active" });
    const countWhere = vi.fn().mockResolvedValue([{ count: 0 }]);
    const countFrom = vi.fn().mockReturnValue({ where: countWhere });
    const selectFn = vi.fn().mockReturnValue({ from: countFrom });
    const executeFn = vi.fn().mockResolvedValue([]);
    const db = {
      query: {
        grants: {
          findFirst: vi.fn().mockResolvedValue({ id: "grant-1", status: "declined" }),
        },
        organizations: {
          findFirst: vi.fn().mockResolvedValue({ id: "org-1", planTier: "starter" }),
        },
      },
      select: selectFn,
      update: update.updateFn,
      execute: executeFn,
    };

    await updateGrant(withTransaction(db) as never, {
      orgId: "org-1",
      grantId: "grant-1",
      data: { status: "active" },
    });

    // The advisory lock must be taken before the cap count runs, or the count
    // is not serialized and two concurrent activations could both pass it.
    expect(executeFn).toHaveBeenCalled();
    expect(selectFn).toHaveBeenCalled();
    const lockOrder = executeFn.mock.invocationCallOrder[0] ?? Infinity;
    const countOrder = selectFn.mock.invocationCallOrder[0] ?? -Infinity;
    expect(lockOrder).toBeLessThan(countOrder);
  });

  it("acquires the billing-cap advisory lock before counting on create (serialized claim)", async () => {
    const countWhere = vi.fn().mockResolvedValue([{ count: 0 }]);
    const countFrom = vi.fn().mockReturnValue({ where: countWhere });
    const selectFn = vi.fn().mockReturnValue({ from: countFrom });
    const executeFn = vi.fn().mockResolvedValue([]);
    const create = makeInsertMock({ id: "grant-new" });
    const db = {
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue({ id: "org-1", planTier: "starter" }),
        },
      },
      select: selectFn,
      insert: create.insertFn,
      execute: executeFn,
    };

    await createGrant(withTransaction(db) as never, {
      orgId: "org-1",
      funderId: "funder-1",
      name: "Active Grant",
      status: "active",
    });

    expect(executeFn).toHaveBeenCalled();
    expect(selectFn).toHaveBeenCalled();
    const lockOrder = executeFn.mock.invocationCallOrder[0] ?? Infinity;
    const countOrder = selectFn.mock.invocationCallOrder[0] ?? -Infinity;
    expect(lockOrder).toBeLessThan(countOrder);
  });

  it("rejects relation-backed grant writes outside the org", async () => {
    const funderLookup = vi.fn().mockResolvedValue(undefined);
    const grantInsert = vi.fn();
    const grantUpdate = vi.fn();
    const allocationInsert = vi.fn();
    const db = {
      query: {
        funders: {
          findFirst: funderLookup,
        },
        grants: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
        funds: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
      insert: grantInsert,
      update: grantUpdate,
    };

    await expect(
      createGrant(db as never, {
        orgId: "org-1",
        funderId: "funder-foreign",
        name: "Summer Programs",
      }),
    ).rejects.toThrow("Funder not found");

    await expect(
      updateGrant(db as never, {
        orgId: "org-1",
        grantId: "grant-1",
        data: { funderId: "funder-foreign" },
      }),
    ).rejects.toThrow("Funder not found");

    const allocationDb = {
      query: {
        grants: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
        funds: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
      insert: allocationInsert,
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          query: {
            grants: { findFirst: vi.fn().mockResolvedValue(undefined) },
            funds: { findFirst: vi.fn().mockResolvedValue(undefined) },
          },
          insert: allocationInsert,
        });
      }),
    };
    await expect(
      createAllocation(allocationDb as never, {
        orgId: "org-1",
        grantId: "grant-foreign",
        fundId: "fund-foreign",
        allocatedAmountCents: 500_000,
      }),
    ).rejects.toThrow("Grant not found");

    expect(grantInsert).not.toHaveBeenCalled();
    expect(grantUpdate).not.toHaveBeenCalled();
    expect(allocationInsert).not.toHaveBeenCalled();
  });

  it("enforces active grant plan limit at createGrant time", async () => {
    // Over-limit: starter plan caps at 10 active grants plus 10 grant headroom
    const countSelectWhere = vi.fn().mockResolvedValue([{ count: 20 }]);
    const countSelectFrom = vi.fn().mockReturnValue({ where: countSelectWhere });
    const selectFn = vi.fn().mockReturnValue({ from: countSelectFrom });
    const grantInsert = vi.fn();
    const db = {
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue({ id: "org-1", planTier: "starter" }),
        },
      },
      select: selectFn,
      insert: grantInsert,
      execute: vi.fn().mockResolvedValue([]),
    };

    await expect(
      createGrant(withTransaction(db) as never, {
        orgId: "org-1",
        funderId: "funder-1",
        name: "Over-limit Grant",
        status: "active",
      }),
    ).rejects.toMatchObject({ status: 402 });
    expect(grantInsert).not.toHaveBeenCalled();

    // Under-limit: same plan, fewer grants — should succeed
    const countSelectWhereFew = vi.fn().mockResolvedValue([{ count: 4 }]);
    const countSelectFromFew = vi.fn().mockReturnValue({ where: countSelectWhereFew });
    const selectFnFew = vi.fn().mockReturnValue({ from: countSelectFromFew });
    const create = makeInsertMock({ id: "grant-new" });
    const dbFew = {
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue({ id: "org-1", planTier: "starter" }),
        },
      },
      select: selectFnFew,
      insert: create.insertFn,
      execute: vi.fn().mockResolvedValue([]),
    };

    const result = await createGrant(withTransaction(dbFew) as never, {
      orgId: "org-1",
      funderId: "funder-1",
      name: "Within-limit Grant",
      status: "active",
    });
    expect(result).toEqual({ id: "grant-new" });
  });

  it("enforces active grant plan limit for every active grant status", async () => {
    const countSelectWhere = vi.fn().mockResolvedValue([{ count: 20 }]);
    const countSelectFrom = vi.fn().mockReturnValue({ where: countSelectWhere });
    const selectFn = vi.fn().mockReturnValue({ from: countSelectFrom });
    const create = makeInsertMock({ id: "grant-new" });
    const db = {
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue({ id: "org-1", planTier: "starter" }),
        },
      },
      select: selectFn,
      insert: create.insertFn,
      execute: vi.fn().mockResolvedValue([]),
    };

    await expect(
      createGrant(withTransaction(db) as never, {
        orgId: "org-1",
        funderId: "funder-1",
        name: "Over-limit Awarded Grant",
        status: "awarded",
      }),
    ).rejects.toMatchObject({ status: 402 });
    expect(create.insertFn).not.toHaveBeenCalled();
  });

  it("applies default status, parses dates, and throws on missing rows", async () => {
    const create = makeInsertMock(undefined);
    const update = makeUpdateMock(undefined);

    await expect(
      createGrant(
        withTransaction({
          query: {
            organizations: {
              findFirst: vi.fn().mockResolvedValue({ id: "org-1", planTier: "audit_ready" }),
            },
          },
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ count: 0 }]),
            }),
          }),
          insert: create.insertFn,
        }) as never,
        {
          orgId: "org-1",
          funderId: "funder-1",
          name: "Summer Programs",
          startDate: "2026-01-01T00:00:00Z",
          endDate: "2026-12-31T00:00:00Z",
          applicationDeadline: "2025-10-01T00:00:00Z",
        },
      ),
    ).rejects.toThrow("Failed to create grant");

    await expect(
      updateGrant(withTransaction({ update: update.updateFn }) as never, {
        orgId: "org-1",
        grantId: "grant-1",
        data: {
          funderId: "funder-2",
          name: "Updated Grant",
          status: "reporting",
          amountCents: 25_000,
          startDate: "2026-01-01T00:00:00Z",
          endDate: null,
          applicationDeadline: "2025-10-01T00:00:00Z",
          description: "Desc",
          notes: "Notes",
        },
      }),
    ).rejects.toThrow("Grant not found");

    await expect(
      deleteGrant(withTransaction({ update: update.updateFn }) as never, {
        orgId: "org-1",
        grantId: "grant-1",
      }),
    ).rejects.toThrow("Grant not found");
  });
});

// Wraps a hand-rolled db mock with a self-referencing transaction stub so the
// non-rebalance updateAllocation/deleteAllocation paths (now atomic) resolve the
// callback against the same mock handle.
function withTransaction<T extends object>(dbMock: T): T {
  const wrapped: T & { transaction: ReturnType<typeof vi.fn> } = {
    ...dbMock,
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(wrapped)),
  };
  return wrapped;
}

describe("allocation mutations", () => {
  it("creates, updates, and deletes allocations", async () => {
    const create = makeInsertMock({ id: "allocation-1" });
    const update = makeUpdateMock({ id: "allocation-1", allocatedAmountCents: 600_000 });

    expect(
      await createAllocation({ insert: create.insertFn } as never, {
        grantId: "grant-1",
        fundId: "fund-1",
        allocatedAmountCents: 500_000,
      }),
    ).toEqual({ id: "allocation-1" });

    expect(
      await updateAllocation(withTransaction({ update: update.updateFn }) as never, {
        allocationId: "allocation-1",
        data: { allocatedAmountCents: 600_000 },
      }),
    ).toEqual({ id: "allocation-1", allocatedAmountCents: 600_000 });

    const allocationDelete = makeUpdateMock({ id: "allocation-1" });
    await deleteAllocation(withTransaction({ update: allocationDelete.updateFn }) as never, {
      allocationId: "allocation-1",
    });
  });

  it("records allocation activity when actor and org are provided", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const insertMock = makeInsertMock({ id: "allocation-1" });
    const updateMock = makeUpdateMock({ id: "allocation-1" });
    // Grant has null amountCents so cap check is skipped, keeping this test focused on activity log.
    const txQuery = {
      grants: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: "grant-1", orgId: "org-1", amountCents: null, deletedAt: null }),
      },
      funds: {
        findFirst: vi.fn().mockResolvedValue({ id: "fund-1", orgId: "org-1", deletedAt: null }),
      },
      grantFundAllocations: {
        findFirst: vi.fn().mockResolvedValue({
          id: "allocation-1",
          grant: { id: "grant-1", orgId: "org-1", amountCents: null, deletedAt: null },
          fund: { id: "fund-1", orgId: "org-1", deletedAt: null },
        }),
      },
    };
    const txObj = {
      query: txQuery,
      insert: insertMock.insertFn,
      update: updateMock.updateFn,
    };
    const db = {
      query: txQuery,
      insert: insertMock.insertFn,
      update: updateMock.updateFn,
      delete: makeDeleteMock().deleteFn,
      transaction: vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(txObj)),
    };

    await createAllocation(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      actorId: "actor-1",
      grantId: "grant-1",
      fundId: "fund-1",
      allocatedAmountCents: 500_000,
    });
    await updateAllocation(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      allocationId: "allocation-1",
      grantId: "grant-1",
      data: { allocatedAmountCents: 600_000 },
    });
    await deleteAllocation(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      allocationId: "allocation-1",
      grantId: "grant-1",
    });

    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledTimes(3);
    expect(insertMock.valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: "entity-1" }),
    );
    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        activeEntityId: "entity-1",
        entityId: "allocation-1",
      }),
    );
  });

  it("rejects relation-backed allocation updates outside the org", async () => {
    const db = {
      query: {
        funds: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
      update: vi.fn(),
      delete: vi.fn(),
    };

    await expect(
      updateAllocation(db as never, {
        allocationId: "allocation-1",
        orgId: "org-1",
        data: { fundId: "fund-foreign" },
      }),
    ).rejects.toThrow("Fund not found");
  });

  it("rejects allocation creates when the fund is outside the active entity", async () => {
    const db = {
      query: {
        grants: {
          findFirst: vi.fn().mockResolvedValue({
            id: "grant-1",
            orgId: "org-1",
            entityId: "entity-1",
            amountCents: null,
            deletedAt: null,
          }),
        },
        funds: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
      insert: vi.fn(),
    };

    await expect(
      createAllocation(withTransaction(db) as never, {
        orgId: "org-1",
        entityId: "entity-1",
        grantId: "grant-1",
        fundId: "fund-sibling",
        allocatedAmountCents: 500_000,
      }),
    ).rejects.toThrow("Fund not found");

    const renderedWhere = renderSql(db.query.funds.findFirst.mock.calls[0]?.[0]?.where);
    expect(renderedWhere.sql).toContain('"funds"."entity_id" = $');
    expect(renderedWhere.params).toContain("entity-1");
  });

  it("rejects allocation mutations when the route grant does not match the allocation grant", async () => {
    const allocationLookup = vi.fn().mockResolvedValue({
      id: "allocation-1",
      grant: { id: "grant-2", orgId: "org-1", deletedAt: null },
      fund: { id: "fund-1", orgId: "org-1", deletedAt: null },
    });
    const txQuery = {
      grantFundAllocations: { findFirst: allocationLookup },
    };
    const txObj = { query: txQuery, update: vi.fn() };

    await expect(
      updateAllocation(
        {
          query: txQuery,
          update: vi.fn(),
          transaction: vi
            .fn()
            .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(txObj)),
        } as never,
        {
          orgId: "org-1",
          grantId: "grant-1",
          allocationId: "allocation-1",
          data: { allocatedAmountCents: 1000 },
        },
      ),
    ).rejects.toThrow("Allocation not found");
  });

  it("throws when allocation create, update, or delete does not return a row", async () => {
    const create = makeInsertMock(undefined);
    const update = makeUpdateMock(undefined);

    await expect(
      createAllocation({ insert: create.insertFn } as never, {
        grantId: "grant-1",
        fundId: "fund-1",
        allocatedAmountCents: 500_000,
      }),
    ).rejects.toThrow("Failed to create allocation");

    await expect(
      updateAllocation(withTransaction({ update: update.updateFn }) as never, {
        allocationId: "allocation-1",
        data: { allocatedAmountCents: 600_000 },
      }),
    ).rejects.toThrow("Allocation not found");

    await expect(
      deleteAllocation(withTransaction({ update: update.updateFn }) as never, {
        allocationId: "allocation-1",
      }),
    ).rejects.toThrow("Allocation not found");
  });

  it("records activity log in the non-transaction updateAllocation path (orgId + actorId, no allocatedAmountCents)", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const updateMock = makeUpdateMock({ id: "allocation-1" });
    const db = {
      query: {
        grantFundAllocations: {
          findFirst: vi.fn().mockResolvedValue({
            id: "allocation-1",
            grant: { id: "grant-1", orgId: "org-1", deletedAt: null },
            fund: { id: "fund-1", orgId: "org-1", deletedAt: null },
          }),
        },
        funds: {
          findFirst: vi.fn().mockResolvedValue({ id: "fund-2", orgId: "org-1", deletedAt: null }),
        },
      },
      update: updateMock.updateFn,
    };

    // Call with orgId + actorId but WITHOUT allocatedAmountCents — stays on the
    // non-rebalance path (now wrapped in its own transaction for audit atomicity).
    // Uses fundId change which triggers ownership assert but no cap check.
    await updateAllocation(withTransaction(db) as never, {
      orgId: "org-1",
      actorId: "actor-1",
      allocationId: "allocation-1",
      data: { fundId: "fund-2" },
    });

    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledTimes(1);
  });

  it("scopes final allocation updates to active rows and the route grant", async () => {
    const updateMock = makeUpdateMock({ id: "allocation-1" });
    const db = {
      query: {
        grantFundAllocations: {
          findFirst: vi.fn().mockResolvedValue({
            id: "allocation-1",
            grant: { id: "grant-1", orgId: "org-1", deletedAt: null },
            fund: { id: "fund-1", orgId: "org-1", deletedAt: null },
          }),
        },
        funds: {
          findFirst: vi.fn().mockResolvedValue({ id: "fund-2", orgId: "org-1", deletedAt: null }),
        },
      },
      update: updateMock.updateFn,
    };

    await updateAllocation(withTransaction(db) as never, {
      orgId: "org-1",
      grantId: "grant-1",
      allocationId: "allocation-1",
      data: { fundId: "fund-2" },
    });

    expect(
      containsReference(updateMock.whereFn.mock.calls[0]?.[0], grantFundAllocations.deletedAt),
    ).toBe(true);
    const renderedWhere = renderSql(updateMock.whereFn.mock.calls[0]?.[0]);
    expect(renderedWhere.sql.toLowerCase()).toContain(
      '"grant_fund_allocations"."deleted_at" is null',
    );
    expect(renderedWhere.sql).toContain('"grant_fund_allocations"."grant_id" = $');
    expect(renderedWhere.params).toContain("grant-1");
  });

  it("scopes transactional allocation updates to active rows and the route grant", async () => {
    const updateMock = makeUpdateMock({ id: "allocation-1", allocatedAmountCents: 600_000 });
    const txQuery = {
      grants: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: "grant-1", orgId: "org-1", amountCents: null, deletedAt: null }),
      },
      grantFundAllocations: {
        findFirst: vi.fn().mockResolvedValue({
          id: "allocation-1",
          grant: { id: "grant-1", orgId: "org-1", deletedAt: null },
          fund: { id: "fund-1", orgId: "org-1", deletedAt: null },
        }),
      },
    };
    const txObj = { query: txQuery, update: updateMock.updateFn };
    const db = {
      query: txQuery,
      transaction: vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(txObj)),
    };

    await updateAllocation(db as never, {
      orgId: "org-1",
      grantId: "grant-1",
      allocationId: "allocation-1",
      data: { allocatedAmountCents: 600_000 },
    });

    expect(
      containsReference(updateMock.whereFn.mock.calls[0]?.[0], grantFundAllocations.deletedAt),
    ).toBe(true);
    const renderedWhere = renderSql(updateMock.whereFn.mock.calls[0]?.[0]);
    expect(renderedWhere.sql.toLowerCase()).toContain(
      '"grant_fund_allocations"."deleted_at" is null',
    );
    expect(renderedWhere.sql).toContain('"grant_fund_allocations"."grant_id" = $');
    expect(renderedWhere.params).toContain("grant-1");
  });

  it("scopes final allocation deletes to active rows and the route grant", async () => {
    const updateMock = makeUpdateMock({ id: "allocation-1" });
    const db = {
      query: {
        grantFundAllocations: {
          findFirst: vi.fn().mockResolvedValue({
            id: "allocation-1",
            grant: { id: "grant-1", orgId: "org-1", deletedAt: null },
            fund: { id: "fund-1", orgId: "org-1", deletedAt: null },
          }),
        },
      },
      update: updateMock.updateFn,
    };

    await deleteAllocation(withTransaction(db) as never, {
      orgId: "org-1",
      grantId: "grant-1",
      allocationId: "allocation-1",
    });

    expect(
      containsReference(updateMock.whereFn.mock.calls[0]?.[0], grantFundAllocations.deletedAt),
    ).toBe(true);
    const renderedWhere = renderSql(updateMock.whereFn.mock.calls[0]?.[0]);
    expect(renderedWhere.sql.toLowerCase()).toContain(
      '"grant_fund_allocations"."deleted_at" is null',
    );
    expect(renderedWhere.sql).toContain('"grant_fund_allocations"."grant_id" = $');
    expect(renderedWhere.params).toContain("grant-1");
  });

  it("wraps the non-rebalance updateAllocation path in a transaction and rolls back on audit failure", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const updateMock = makeUpdateMock({ id: "allocation-1" });
    const baseDb = {
      query: {
        grantFundAllocations: {
          findFirst: vi.fn().mockResolvedValue({
            id: "allocation-1",
            grant: { id: "grant-1", orgId: "org-1", deletedAt: null },
            fund: { id: "fund-1", orgId: "org-1", deletedAt: null },
          }),
        },
        funds: {
          findFirst: vi.fn().mockResolvedValue({ id: "fund-2", orgId: "org-1", deletedAt: null }),
        },
      },
      update: updateMock.updateFn,
    };
    const db = withTransaction(baseDb);

    await updateAllocation(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      allocationId: "allocation-1",
      data: { fundId: "fund-2" },
    });
    expect(
      (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction,
    ).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "allocation", action: "updated" }),
    );

    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    await expect(
      updateAllocation(db as never, {
        orgId: "org-1",
        actorId: "actor-1",
        allocationId: "allocation-1",
        data: { fundId: "fund-2" },
      }),
    ).rejects.toThrow("audit log down");
  });

  it("wraps deleteAllocation in a transaction and rolls back on audit failure", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const updateMock = makeUpdateMock({ id: "allocation-1" });
    const baseDb = {
      query: {
        grantFundAllocations: {
          findFirst: vi.fn().mockResolvedValue({
            id: "allocation-1",
            grant: { id: "grant-1", orgId: "org-1", deletedAt: null },
            fund: { id: "fund-1", orgId: "org-1", deletedAt: null },
          }),
        },
      },
      update: updateMock.updateFn,
    };
    const db = withTransaction(baseDb);

    await deleteAllocation(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      allocationId: "allocation-1",
      grantId: "grant-1",
    });
    expect(
      (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction,
    ).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "allocation", action: "deleted" }),
    );

    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    await expect(
      deleteAllocation(db as never, {
        orgId: "org-1",
        actorId: "actor-1",
        allocationId: "allocation-1",
        grantId: "grant-1",
      }),
    ).rejects.toThrow("audit log down");
  });
});

describe("allocation cap checks", () => {
  function makeCapCheckDb({
    grantAmountCents,
    existingSum,
    allocationResult,
    currentAllocationId,
    currentAllocationAmount,
  }: {
    grantAmountCents: number | null;
    existingSum: number;
    allocationResult?: { id: string; allocatedAmountCents?: number };
    currentAllocationId?: string;
    currentAllocationAmount?: number;
  }) {
    const transactionFn = vi
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn(tx);
      });

    // Mock select for aggregate query: returns existingSum
    const selectWhere = vi.fn().mockResolvedValue([{ total: existingSum }]);
    const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
    const selectFn = vi.fn().mockReturnValue({ from: selectFrom });

    const insertMock = makeInsertMock(allocationResult ?? { id: "allocation-new" });
    const updateMock = makeUpdateMock(
      allocationResult ?? {
        id: currentAllocationId ?? "allocation-1",
        allocatedAmountCents: currentAllocationAmount ?? 500_000,
      },
    );

    const tx = {
      query: {
        grants: {
          findFirst: vi.fn().mockResolvedValue({
            id: "grant-1",
            orgId: "org-1",
            deletedAt: null,
            amountCents: grantAmountCents,
          }),
        },
        funds: {
          findFirst: vi.fn().mockResolvedValue({ id: "fund-1", orgId: "org-1", deletedAt: null }),
        },
        grantFundAllocations: {
          findFirst: vi.fn().mockResolvedValue({
            id: currentAllocationId ?? "allocation-1",
            grant: { id: "grant-1", orgId: "org-1", deletedAt: null },
            fund: { id: "fund-1", orgId: "org-1", deletedAt: null },
          }),
        },
      },
      select: selectFn,
      insert: insertMock.insertFn,
      update: updateMock.updateFn,
      execute: vi.fn().mockResolvedValue([]),
    };

    const db = {
      query: {
        grants: {
          findFirst: vi.fn().mockResolvedValue({
            id: "grant-1",
            orgId: "org-1",
            deletedAt: null,
            amountCents: grantAmountCents,
          }),
        },
        funds: {
          findFirst: vi.fn().mockResolvedValue({ id: "fund-1", orgId: "org-1", deletedAt: null }),
        },
        grantFundAllocations: {
          findFirst: vi.fn().mockResolvedValue({
            id: currentAllocationId ?? "allocation-1",
            grant: { id: "grant-1", orgId: "org-1", deletedAt: null },
            fund: { id: "fund-1", orgId: "org-1", deletedAt: null },
          }),
        },
      },
      select: selectFn,
      insert: insertMock.insertFn,
      update: updateMock.updateFn,
      transaction: transactionFn,
    };

    return { db, tx, selectWhere, transactionFn };
  }

  it("createAllocation succeeds when sum + new <= grant amountCents", async () => {
    const { db, tx } = makeCapCheckDb({ grantAmountCents: 1_000_000, existingSum: 400_000 });
    const result = await createAllocation(db as never, {
      orgId: "org-1",
      grantId: "grant-1",
      fundId: "fund-1",
      allocatedAmountCents: 600_000,
    });
    expect(result).toMatchObject({ id: "allocation-new" });
    expect(tx.execute).toHaveBeenCalledTimes(1);
  });

  it("createAllocation throws 409 conflict when sum + new > grant amountCents", async () => {
    const { db, tx } = makeCapCheckDb({ grantAmountCents: 1_000_000, existingSum: 600_000 });
    await expect(
      createAllocation(db as never, {
        orgId: "org-1",
        grantId: "grant-1",
        fundId: "fund-1",
        allocatedAmountCents: 500_000,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(tx.execute).toHaveBeenCalledTimes(1);
  });

  it("createAllocation skips cap check when grant amountCents is null", async () => {
    const { db } = makeCapCheckDb({ grantAmountCents: null, existingSum: 999_999_999 });
    const result = await createAllocation(db as never, {
      orgId: "org-1",
      grantId: "grant-1",
      fundId: "fund-1",
      allocatedAmountCents: 500_000,
    });
    expect(result).toMatchObject({ id: "allocation-new" });
  });

  it("updateAllocation throws 409 conflict when updated amount would over-commit the grant", async () => {
    const { db, tx } = makeCapCheckDb({
      grantAmountCents: 1_000_000,
      existingSum: 700_000,
      currentAllocationId: "allocation-1",
      currentAllocationAmount: 300_000,
    });
    await expect(
      updateAllocation(db as never, {
        orgId: "org-1",
        allocationId: "allocation-1",
        grantId: "grant-1",
        data: { allocatedAmountCents: 400_000 },
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(tx.execute).toHaveBeenCalledTimes(1);
  });

  it("updateAllocation succeeds when updated amount stays under cap", async () => {
    const { db, tx } = makeCapCheckDb({
      grantAmountCents: 1_000_000,
      existingSum: 700_000,
      currentAllocationId: "allocation-1",
      currentAllocationAmount: 300_000,
    });
    const result = await updateAllocation(db as never, {
      orgId: "org-1",
      allocationId: "allocation-1",
      grantId: "grant-1",
      data: { allocatedAmountCents: 300_000 },
    });
    expect(result).toMatchObject({ id: "allocation-1" });
    expect(tx.execute).toHaveBeenCalledTimes(1);
  });

  it("updateAllocation with fundId asserts fund ownership inside the transaction", async () => {
    const { db } = makeCapCheckDb({
      grantAmountCents: 1_000_000,
      existingSum: 0,
      currentAllocationId: "allocation-1",
      currentAllocationAmount: 0,
    });
    // Should succeed — fund is in org and amount is under cap.
    const result = await updateAllocation(db as never, {
      orgId: "org-1",
      allocationId: "allocation-1",
      grantId: "grant-1",
      data: { allocatedAmountCents: 200_000, fundId: "fund-1" },
    });
    expect(result).toMatchObject({ id: "allocation-1" });
  });

  it("createAllocation skips cap check when grants.findFirst is not available on txDb", async () => {
    // Covers the Promise.resolve(null) fallback branch inside the transaction.
    const insertMock = makeInsertMock({ id: "allocation-no-query" });
    const selectWhere = vi.fn().mockResolvedValue([{ total: 0 }]);
    const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
    const selectFn = vi.fn().mockReturnValue({ from: selectFrom });
    const txObj = {
      // No query property — forces the ternary to take the Promise.resolve(null) path
      insert: insertMock.insertFn,
      select: selectFn,
    };
    const db = {
      transaction: vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(txObj)),
      insert: insertMock.insertFn,
      select: selectFn,
    };
    const result = await createAllocation(db as never, {
      orgId: "org-1",
      grantId: "grant-1",
      fundId: "fund-1",
      allocatedAmountCents: 500_000,
    });
    expect(result).toMatchObject({ id: "allocation-no-query" });
  });

  it("createAllocation throws internal error when transaction insert returns no row", async () => {
    const insertMock = makeInsertMock(undefined); // no allocation row returned
    const selectWhere = vi.fn().mockResolvedValue([{ total: 0 }]);
    const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
    const selectFn = vi.fn().mockReturnValue({ from: selectFrom });
    const txObj = {
      query: {
        grants: {
          findFirst: vi.fn().mockResolvedValue({
            id: "grant-1",
            orgId: "org-1",
            amountCents: null,
            deletedAt: null,
          }),
        },
        funds: {
          findFirst: vi.fn().mockResolvedValue({ id: "fund-1", orgId: "org-1", deletedAt: null }),
        },
      },
      insert: insertMock.insertFn,
      select: selectFn,
    };
    const db = {
      transaction: vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(txObj)),
    };
    await expect(
      createAllocation(db as never, {
        orgId: "org-1",
        grantId: "grant-1",
        fundId: "fund-1",
        allocatedAmountCents: 100_000,
      }),
    ).rejects.toThrow("Failed to create allocation");
  });

  it("updateAllocation throws not-found error when transaction update returns no row", async () => {
    const updateMock = makeUpdateMock(undefined); // no allocation row returned
    const selectWhere = vi.fn().mockResolvedValue([{ total: 0 }]);
    const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
    const selectFn = vi.fn().mockReturnValue({ from: selectFrom });
    const txObj = {
      query: {
        grants: {
          findFirst: vi.fn().mockResolvedValue({
            id: "grant-1",
            orgId: "org-1",
            amountCents: null,
            deletedAt: null,
          }),
        },
        grantFundAllocations: {
          findFirst: vi.fn().mockResolvedValue({
            id: "allocation-1",
            grant: { id: "grant-1", orgId: "org-1", deletedAt: null },
            fund: { id: "fund-1", orgId: "org-1", deletedAt: null },
          }),
        },
      },
      update: updateMock.updateFn,
      select: selectFn,
    };
    const db = {
      transaction: vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(txObj)),
    };
    await expect(
      updateAllocation(db as never, {
        orgId: "org-1",
        allocationId: "allocation-1",
        grantId: "grant-1",
        data: { allocatedAmountCents: 100_000 },
      }),
    ).rejects.toThrow("Allocation not found");
  });

  it("updateAllocation skips cap check when grants.findFirst is not available on txDb", async () => {
    // Covers the Promise.resolve(null) fallback branch in updateAllocation.
    const updateMock = makeUpdateMock({ id: "allocation-1", allocatedAmountCents: 200_000 });
    const selectWhere = vi.fn().mockResolvedValue([{ total: 0 }]);
    const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
    const selectFn = vi.fn().mockReturnValue({ from: selectFrom });
    const txObj = {
      // No query.grants — forces the ternary to take the Promise.resolve(null) path
      query: {
        grantFundAllocations: {
          findFirst: vi.fn().mockResolvedValue({
            id: "allocation-1",
            grant: { id: "grant-1", orgId: "org-1", deletedAt: null },
            fund: { id: "fund-1", orgId: "org-1", deletedAt: null },
          }),
        },
      },
      update: updateMock.updateFn,
      select: selectFn,
    };
    const db = {
      transaction: vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(txObj)),
      update: updateMock.updateFn,
      select: selectFn,
    };
    const result = await updateAllocation(db as never, {
      orgId: "org-1",
      allocationId: "allocation-1",
      grantId: "grant-1",
      data: { allocatedAmountCents: 200_000 },
    });
    expect(result).toMatchObject({ id: "allocation-1" });
  });

  it("updateAllocation throws internal error when grantId is absent in transactional branch", async () => {
    // When orgId + allocatedAmountCents are provided but grantId is absent,
    // the guard must throw rather than silently bypass the cap check.
    const updateMock = makeUpdateMock({ id: "allocation-1", allocatedAmountCents: 200_000 });
    const selectWhere = vi.fn().mockResolvedValue([{ total: 0 }]);
    const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
    const selectFn = vi.fn().mockReturnValue({ from: selectFrom });
    const txObj = {
      query: {
        grantFundAllocations: {
          findFirst: vi.fn().mockResolvedValue({
            id: "allocation-1",
            grant: { id: "grant-1", orgId: "org-1", deletedAt: null },
            fund: { id: "fund-1", orgId: "org-1", deletedAt: null },
          }),
        },
      },
      update: updateMock.updateFn,
      select: selectFn,
    };
    const db = {
      transaction: vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(txObj)),
      update: updateMock.updateFn,
      select: selectFn,
    };
    await expect(
      updateAllocation(db as never, {
        orgId: "org-1",
        allocationId: "allocation-1",
        // grantId intentionally omitted
        data: { allocatedAmountCents: 200_000 },
      }),
    ).rejects.toThrow("grantId required for allocation cap check");
  });
});

describe("impact metric mutations", () => {
  it("creates, updates, and deletes metric definitions and entries", async () => {
    const grantLookup = vi.fn().mockResolvedValue({ id: "grant-1", orgId: "org-1" });
    const metricLookup = vi
      .fn()
      .mockResolvedValue({ id: "metric-1", grantId: "grant-1", orgId: "org-1" });
    const metricCreate = makeInsertMock({ id: "metric-1" });
    const metricUpdate = makeUpdateMock({ id: "metric-1", unit: "students" });
    const entryCreate = makeInsertMock({ id: "entry-1" });
    const entryUpdate = makeUpdateMock({ id: "entry-1", notes: "Updated" });
    const db = {
      query: {
        grants: {
          findFirst: grantLookup,
        },
        grantImpactMetrics: {
          findFirst: metricLookup,
        },
      },
      insert: metricCreate.insertFn,
      update: metricUpdate.updateFn,
      transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(db)),
    };

    expect(
      await createImpactMetric(db as never, {
        orgId: "org-1",
        grantId: "grant-1",
        name: "Students Served",
      }),
    ).toEqual({ id: "metric-1" });

    expect(
      await updateImpactMetric(
        {
          update: metricUpdate.updateFn,
          query: db.query,
          transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
            cb({ update: metricUpdate.updateFn, query: db.query }),
          ),
        } as never,
        {
          orgId: "org-1",
          grantId: "grant-1",
          metricId: "metric-1",
          data: { unit: "students" },
        },
      ),
    ).toEqual({ id: "metric-1", unit: "students" });

    expect(
      await createImpactMetricEntry(
        {
          insert: entryCreate.insertFn,
          transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
            cb({ insert: entryCreate.insertFn }),
          ),
        } as never,
        {
          metricId: "metric-1",
          value: "12",
          periodStart: "2026-01-01T00:00:00Z",
          periodEnd: "2026-03-31T00:00:00Z",
        },
      ),
    ).toEqual({ id: "entry-1" });

    expect(
      await updateImpactMetricEntry(
        {
          update: entryUpdate.updateFn,
          transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
            cb({ update: entryUpdate.updateFn }),
          ),
        } as never,
        {
          metricId: "metric-1",
          grantId: "grant-1",
          entryId: "entry-1",
          data: { notes: "Updated" },
        },
      ),
    ).toEqual({ id: "entry-1", notes: "Updated" });

    const metricSoftDelete = makeUpdateMock({ id: "metric-1" });
    await deleteImpactMetric(
      {
        update: metricSoftDelete.updateFn,
        query: db.query,
        transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
          cb({ update: metricSoftDelete.updateFn, query: db.query }),
        ),
      } as never,
      {
        orgId: "org-1",
        grantId: "grant-1",
        metricId: "metric-1",
      },
    );
    const entrySoftDelete = makeUpdateMock({ id: "entry-1" });
    await deleteImpactMetricEntry(
      {
        update: entrySoftDelete.updateFn,
        transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
          cb({ update: entrySoftDelete.updateFn }),
        ),
      } as never,
      {
        metricId: "metric-1",
        grantId: "grant-1",
        entryId: "entry-1",
      },
    );
  });

  it("records impact metric activity when actor and org are provided", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const grantLookup = vi.fn().mockResolvedValue({ id: "grant-1", orgId: "org-1" });
    const metricCreate = makeInsertMock({ id: "metric-1" });
    // metricUpdate is shared for updateImpactMetric and deleteImpactMetric (soft delete)
    const metricUpdate = makeUpdateMock({ id: "metric-1", unit: "students" });
    const entryCreate = makeInsertMock({ id: "entry-1" });
    const entryUpdate = makeUpdateMock({ id: "entry-1", notes: "Updated" });
    const entrySoftDelete = makeUpdateMock({ id: "entry-1" });
    const db = {
      query: {
        grants: {
          findFirst: grantLookup,
        },
        grantImpactMetrics: {
          findFirst: vi.fn().mockResolvedValue({ id: "metric-1", orgId: "org-1" }),
        },
        impactMetricEntries: {
          findFirst: vi.fn().mockResolvedValue({
            id: "entry-1",
            metric: { id: "metric-1", orgId: "org-1" },
          }),
        },
      },
      insert: metricCreate.insertFn,
      update: metricUpdate.updateFn,
      transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(db)),
    };

    await createImpactMetric(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      grantId: "grant-1",
      name: "Students Served",
    });
    await updateImpactMetric(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      grantId: "grant-1",
      metricId: "metric-1",
      data: { unit: "students" },
    });
    await deleteImpactMetric(db as never, {
      orgId: "org-1",
      actorId: "actor-1",
      grantId: "grant-1",
      metricId: "metric-1",
    });

    await createImpactMetricEntry(
      {
        insert: entryCreate.insertFn,
        query: db.query,
        transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
          cb({ insert: entryCreate.insertFn, query: db.query }),
        ),
      } as never,
      {
        metricId: "metric-1",
        actorId: "actor-1",
        orgId: "org-1",
        value: "12",
        periodStart: "2026-01-01T00:00:00Z",
        periodEnd: "2026-03-31T00:00:00Z",
      },
    );
    await updateImpactMetricEntry(
      {
        update: entryUpdate.updateFn,
        query: db.query,
        transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
          cb({ update: entryUpdate.updateFn, query: db.query }),
        ),
      } as never,
      {
        metricId: "metric-1",
        entryId: "entry-1",
        actorId: "actor-1",
        orgId: "org-1",
        grantId: "grant-1",
        data: { notes: "Updated" },
      },
    );
    await deleteImpactMetricEntry(
      {
        update: entrySoftDelete.updateFn,
        query: db.query,
        transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
          cb({ update: entrySoftDelete.updateFn, query: db.query }),
        ),
      } as never,
      {
        metricId: "metric-1",
        entryId: "entry-1",
        actorId: "actor-1",
        orgId: "org-1",
        grantId: "grant-1",
      },
    );

    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledTimes(6);
  });

  it("throws not found and skips the audit log when the metric is concurrently deleted before the soft-delete update", async () => {
    vi.mocked(recordActivityLog).mockClear();
    // assertMetricInGrant passes (the metric was live a moment ago)...
    const metricLookup = vi.fn().mockResolvedValue({ id: "metric-1", orgId: "org-1" });
    // ...but a concurrent delete means the soft-delete UPDATE matches zero rows.
    const returningFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = {
      query: {
        grantImpactMetrics: { findFirst: metricLookup },
      },
      update: updateFn,
      transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb({ update: updateFn, query: { grantImpactMetrics: { findFirst: metricLookup } } }),
      ),
    };

    await expect(
      deleteImpactMetric(db as never, {
        orgId: "org-1",
        actorId: "actor-1",
        grantId: "grant-1",
        metricId: "metric-1",
      }),
    ).rejects.toThrow("Impact metric not found");
    expect(vi.mocked(recordActivityLog)).not.toHaveBeenCalled();
  });

  it("parses metric values and throws when metric rows are missing", async () => {
    const grantLookup = vi.fn().mockResolvedValue({ id: "grant-1", orgId: "org-1" });
    const metricLookupMissing = vi.fn().mockResolvedValue(undefined);
    const metricCreate = makeInsertMock(undefined);
    const metricUpdate = makeUpdateMock(undefined);
    const entryCreate = makeInsertMock(undefined);
    const entryUpdate = makeUpdateMock(undefined);
    const db = {
      query: {
        grants: {
          findFirst: grantLookup,
        },
        grantImpactMetrics: {
          findFirst: metricLookupMissing,
        },
      },
      insert: metricCreate.insertFn,
      update: metricUpdate.updateFn,
      transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(db)),
    };

    await expect(
      createImpactMetric(db as never, {
        orgId: "org-1",
        grantId: "grant-1",
        name: "Students Served",
        targetValue: 20,
        unit: "students",
      }),
    ).rejects.toThrow("Failed to create impact metric");

    await expect(
      updateImpactMetric(db as never, {
        orgId: "org-1",
        grantId: "grant-1",
        metricId: "metric-1",
        data: { name: "Updated", targetValue: null, unit: "families" },
      }),
    ).rejects.toThrow("Impact metric not found");

    await expect(
      createImpactMetricEntry(
        {
          insert: entryCreate.insertFn,
          transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
            cb({ insert: entryCreate.insertFn }),
          ),
        } as never,
        {
          metricId: "metric-1",
          value: null as never,
          periodStart: "2026-01-01T00:00:00Z",
          periodEnd: "2026-03-31T00:00:00Z",
          notes: "Note",
        },
      ),
    ).rejects.toThrow("Failed to create impact metric entry");

    await expect(
      updateImpactMetricEntry(
        {
          update: entryUpdate.updateFn,
          transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
            cb({ update: entryUpdate.updateFn }),
          ),
        } as never,
        {
          metricId: "metric-1",
          grantId: "grant-1",
          entryId: "entry-1",
          data: {
            value: null as never,
            periodStart: "2026-01-01T00:00:00Z",
            periodEnd: "2026-03-31T00:00:00Z",
            notes: "Updated",
          },
        },
      ),
    ).rejects.toThrow("Impact metric entry not found");
  });

  it("rejects impact metric entry updates when the metric-in-grant lookup fails", async () => {
    const db = {
      query: {
        grantImpactMetrics: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
      update: vi.fn(),
    };

    await expect(
      updateImpactMetricEntry(db as never, {
        orgId: "org-1",
        grantId: "grant-1",
        metricId: "metric-1",
        entryId: "entry-1",
        data: { notes: "Updated" },
      }),
    ).rejects.toThrow("Impact metric not found");

    await expect(
      deleteImpactMetricEntry(db as never, {
        orgId: "org-1",
        grantId: "grant-1",
        metricId: "metric-1",
        entryId: "entry-1",
      }),
    ).rejects.toThrow("Impact metric not found");
  });

  it("rejects impact metric entry creation when the metric does not belong to the specified grantId", async () => {
    const metricLookup = vi.fn().mockResolvedValue(undefined);
    const entryCreate = makeInsertMock({ id: "entry-1" });
    const db = {
      query: {
        grantImpactMetrics: {
          findFirst: metricLookup,
        },
      },
      insert: entryCreate.insertFn,
    };

    await expect(
      createImpactMetricEntry(db as never, {
        orgId: "org-1",
        grantId: "grant-1",
        metricId: "metric-foreign",
        value: "12",
        periodStart: "2026-01-01T00:00:00Z",
        periodEnd: "2026-03-31T00:00:00Z",
      }),
    ).rejects.toThrow("Impact metric not found");

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects impact metric update when metric does not belong to the specified grantId", async () => {
    const metricLookup = vi.fn().mockResolvedValue(undefined); // metric not in this grant
    const db = {
      query: {
        grantImpactMetrics: {
          findFirst: metricLookup,
        },
      },
      update: vi.fn(),
    };

    await expect(
      updateImpactMetric(db as never, {
        orgId: "org-1",
        grantId: "grant-1",
        metricId: "metric-foreign",
        data: { name: "Tampered" },
      }),
    ).rejects.toThrow("Impact metric not found");

    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects impact metric delete when metric does not belong to the specified grantId", async () => {
    const metricLookup = vi.fn().mockResolvedValue(undefined); // metric not in this grant
    const db = {
      query: {
        grantImpactMetrics: {
          findFirst: metricLookup,
        },
      },
      update: vi.fn(),
    };

    await expect(
      deleteImpactMetric(db as never, {
        orgId: "org-1",
        grantId: "grant-1",
        metricId: "metric-foreign",
      }),
    ).rejects.toThrow("Impact metric not found");

    expect(db.update).not.toHaveBeenCalled();
  });

  it("allows metric update and delete when metric belongs to the specified grantId", async () => {
    const metricLookup = vi
      .fn()
      .mockResolvedValue({ id: "metric-1", grantId: "grant-1", orgId: "org-1" });
    const metricUpdate = makeUpdateMock({ id: "metric-1", unit: "students" });

    await expect(
      updateImpactMetric(
        {
          query: { grantImpactMetrics: { findFirst: metricLookup } },
          update: metricUpdate.updateFn,
          transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
            cb({
              update: metricUpdate.updateFn,
              query: { grantImpactMetrics: { findFirst: metricLookup } },
            }),
          ),
        } as never,
        {
          orgId: "org-1",
          grantId: "grant-1",
          metricId: "metric-1",
          data: { unit: "students" },
        },
      ),
    ).resolves.toEqual({ id: "metric-1", unit: "students" });

    const metricLookup2 = vi
      .fn()
      .mockResolvedValue({ id: "metric-1", grantId: "grant-1", orgId: "org-1" });
    const softDeleteMock = makeUpdateMock({ id: "metric-1" });
    await deleteImpactMetric(
      {
        query: { grantImpactMetrics: { findFirst: metricLookup2 } },
        update: softDeleteMock.updateFn,
        transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
          cb({
            update: softDeleteMock.updateFn,
            query: { grantImpactMetrics: { findFirst: metricLookup2 } },
          }),
        ),
      } as never,
      {
        orgId: "org-1",
        grantId: "grant-1",
        metricId: "metric-1",
      },
    );
  });

  it("rejects metric entry update when metric does not belong to the specified grantId", async () => {
    const metricLookup = vi.fn().mockResolvedValue(undefined); // metric not in this grant
    const db = {
      query: {
        grantImpactMetrics: {
          findFirst: metricLookup,
        },
      },
      update: vi.fn(),
    };

    await expect(
      updateImpactMetricEntry(db as never, {
        orgId: "org-1",
        grantId: "grant-1",
        metricId: "metric-foreign",
        entryId: "entry-1",
        data: { notes: "Tampered" },
      }),
    ).rejects.toThrow("Impact metric not found");

    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects metric entry delete when metric does not belong to the specified grantId", async () => {
    const metricLookup = vi.fn().mockResolvedValue(undefined); // metric not in this grant
    const db = {
      query: {
        grantImpactMetrics: {
          findFirst: metricLookup,
        },
      },
      update: vi.fn(),
    };

    await expect(
      deleteImpactMetricEntry(db as never, {
        orgId: "org-1",
        grantId: "grant-1",
        metricId: "metric-foreign",
        entryId: "entry-1",
      }),
    ).rejects.toThrow("Impact metric not found");

    expect(db.update).not.toHaveBeenCalled();
  });

  it("updates impact metric targetValue using parseNumericValue", async () => {
    const metricLookup = vi
      .fn()
      .mockResolvedValue({ id: "metric-1", grantId: "grant-1", orgId: "org-1" });
    const metricUpdate = makeUpdateMock({ id: "metric-1", targetValue: "250" });
    const db = {
      query: {
        grants: {
          findFirst: vi.fn().mockResolvedValue({ id: "grant-1", orgId: "org-1" }),
        },
        grantImpactMetrics: {
          findFirst: metricLookup,
        },
      },
      update: metricUpdate.updateFn,
      transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(db)),
    };

    const result = await updateImpactMetric(db as never, {
      orgId: "org-1",
      grantId: "grant-1",
      metricId: "metric-1",
      data: { targetValue: "250" },
    });
    expect(result).toMatchObject({ id: "metric-1" });
  });

  it("updates impact metric name and throws when deleting a missing metric entry", async () => {
    const metricLookup = vi
      .fn()
      .mockResolvedValue({ id: "metric-1", grantId: "grant-1", orgId: "org-1" });
    const metricUpdate = makeUpdateMock({ id: "metric-1", name: "Families Served" });
    const metricEntryDelete = makeUpdateMock(undefined);

    await expect(
      updateImpactMetric(
        {
          query: { grantImpactMetrics: { findFirst: metricLookup } },
          update: metricUpdate.updateFn,
          transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
            cb({
              update: metricUpdate.updateFn,
              query: { grantImpactMetrics: { findFirst: metricLookup } },
            }),
          ),
        } as never,
        {
          orgId: "org-1",
          grantId: "grant-1",
          metricId: "metric-1",
          data: { name: "Families Served" },
        },
      ),
    ).resolves.toEqual({ id: "metric-1", name: "Families Served" });

    await expect(
      deleteImpactMetricEntry(
        {
          update: metricEntryDelete.updateFn,
          transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
            cb({ update: metricEntryDelete.updateFn }),
          ),
        } as never,
        {
          metricId: "metric-1",
          grantId: "grant-1",
          entryId: "entry-missing",
        },
      ),
    ).rejects.toThrow("Impact metric entry not found");
  });

  it("soft-deletes an impact metric using db.update (not db.delete)", async () => {
    const metricLookup = vi
      .fn()
      .mockResolvedValue({ id: "metric-1", grantId: "grant-1", orgId: "org-1" });
    const { updateFn, setFn } = makeUpdateMock({ id: "metric-1" });
    await deleteImpactMetric(
      {
        query: { grantImpactMetrics: { findFirst: metricLookup } },
        update: updateFn,
        transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
          cb({ update: updateFn, query: { grantImpactMetrics: { findFirst: metricLookup } } }),
        ),
      } as never,
      { orgId: "org-1", grantId: "grant-1", metricId: "metric-1" },
    );
    expect(updateFn).toHaveBeenCalledTimes(1);
    const setArg = setFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setArg).toHaveProperty("deletedAt");
    expect(setArg.deletedAt).toBeInstanceOf(Date);
  });
});

describe("closeoutGrant", () => {
  it("throws notFound when the grant does not exist", async () => {
    const db = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue(undefined) },
      },
    };
    await expect(
      closeoutGrant(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        grantId: "grant-404",
        closeoutDisposition: "release",
      }),
    ).rejects.toThrow("Grant not found");
  });

  it("updates status to closeout, calls postGrantCloseout and recordActivityLog", async () => {
    vi.mocked(postGrantCloseout).mockResolvedValue(undefined);
    vi.mocked(recordActivityLog).mockResolvedValue(undefined);

    const { updateFn, setFn } = makeUpdateMock({ id: "grant-1", status: "closeout" });

    const txDb = { update: updateFn };
    const db = {
      query: {
        grants: {
          findFirst: vi.fn().mockResolvedValue({ id: "grant-1", orgId: "org-1", deletedAt: null }),
        },
      },
      transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
        await cb(txDb);
      }),
    };

    await closeoutGrant(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      grantId: "grant-1",
      closeoutDisposition: "release",
    });

    expect(updateFn).toHaveBeenCalledTimes(1);
    const setArg = setFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setArg.status).toBe("closeout");

    expect(postGrantCloseout).toHaveBeenCalledWith(
      txDb,
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        grantId: "grant-1",
        closeoutDisposition: "release",
      }),
    );

    expect(recordActivityLog).toHaveBeenCalledWith(
      txDb,
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        action: "closed",
        entityType: "grant",
        entityId: "grant-1",
        changes: { closeoutDisposition: "release" },
      }),
    );
  });

  it("throws badRequest and does not call postGrantCloseout when grant is already in closeout status", async () => {
    vi.mocked(postGrantCloseout).mockClear();

    const db = {
      query: {
        grants: {
          findFirst: vi.fn().mockResolvedValue({
            id: "grant-1",
            orgId: "org-1",
            status: "closeout",
            deletedAt: null,
          }),
        },
      },
    };

    await expect(
      closeoutGrant(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        grantId: "grant-1",
        closeoutDisposition: "release",
      }),
    ).rejects.toThrow("Grant is already closed out.");

    expect(postGrantCloseout).not.toHaveBeenCalled();
  });

  it("throws and skips closeout posting when a concurrent caller already transitioned the grant inside the transaction", async () => {
    vi.mocked(postGrantCloseout).mockClear();
    vi.mocked(recordActivityLog).mockClear();

    // findFirst sees an active grant (passes the pre-transaction guard), but the
    // atomic conditional update returns no rows because a concurrent transaction
    // already flipped status to "closeout" — the race must be rejected.
    const { updateFn } = makeUpdateMock(undefined);
    const returningEmpty = vi.fn().mockResolvedValue([]);
    const whereEmpty = vi.fn().mockReturnValue({ returning: returningEmpty });
    const setEmpty = vi.fn().mockReturnValue({ where: whereEmpty });
    updateFn.mockReturnValue({ set: setEmpty });

    const txDb = { update: updateFn };
    const db = {
      query: {
        grants: {
          findFirst: vi.fn().mockResolvedValue({
            id: "grant-1",
            orgId: "org-1",
            status: "in_progress",
            deletedAt: null,
          }),
        },
      },
      transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
        await cb(txDb);
      }),
    };

    await expect(
      closeoutGrant(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        grantId: "grant-1",
        closeoutDisposition: "release",
      }),
    ).rejects.toThrow("Grant is already closed out.");

    expect(postGrantCloseout).not.toHaveBeenCalled();
    expect(recordActivityLog).not.toHaveBeenCalled();
  });

  it("works with return disposition", async () => {
    vi.mocked(postGrantCloseout).mockResolvedValue(undefined);
    vi.mocked(recordActivityLog).mockResolvedValue(undefined);

    const { updateFn } = makeUpdateMock({ id: "grant-1", status: "closeout" });
    const txDb = { update: updateFn };
    const db = {
      query: {
        grants: {
          findFirst: vi.fn().mockResolvedValue({ id: "grant-1", orgId: "org-1", deletedAt: null }),
        },
      },
      transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
        await cb(txDb);
      }),
    };

    await closeoutGrant(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      grantId: "grant-1",
      closeoutDisposition: "return",
    });

    expect(postGrantCloseout).toHaveBeenCalledWith(
      txDb,
      expect.objectContaining({ closeoutDisposition: "return" }),
    );
  });
});

describe("activity-log atomicity — impact metrics and entries", () => {
  beforeEach(() => {
    vi.mocked(recordActivityLog).mockReset();
    vi.mocked(recordActivityLog).mockResolvedValue(undefined);
  });

  function makeAtomicDb(
    insertResults: unknown[][] = [],
    updateResults: unknown[][] = [],
    queryResults: Record<string, unknown> = {},
  ) {
    const defaultMetric = { id: "metric-1", grantId: "grant-1", orgId: "org-1" };
    const query = new Proxy(
      {},
      {
        get: (_target, property: string) => ({
          findFirst: vi
            .fn()
            .mockResolvedValue(
              queryResults[property] !== undefined ? queryResults[property] : defaultMetric,
            ),
        }),
      },
    );

    const insertChain = (results: unknown[][]) => {
      const chain = {
        values: vi.fn(() => chain),
        returning: vi.fn(() => Promise.resolve(results.shift() ?? [])),
      };
      return chain;
    };

    const updateChain = (results: unknown[][]) => {
      const chain = {
        set: vi.fn(() => chain),
        where: vi.fn(() => chain),
        returning: vi.fn(() => Promise.resolve(results.shift() ?? [])),
      };
      return chain;
    };

    const inserts = [...insertResults];
    const updates = [...updateResults];

    const db = {
      query,
      insert: vi.fn(() => insertChain(inserts)),
      update: vi.fn(() => updateChain(updates)),
      transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(db)),
    };
    return db;
  }

  it("createImpactMetric wraps insert and audit log in a single transaction", async () => {
    const metric = { id: "metric-new", grantId: "grant-1", orgId: "org-1" };
    const db = makeAtomicDb([[metric]]);

    await createImpactMetric(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      grantId: "grant-1",
      name: "Families Served",
      unit: "families",
    });

    expect(
      (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction,
    ).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "impact_metric", action: "created" }),
    );
  });

  it("createImpactMetric rolls back when the audit log write fails", async () => {
    const metric = { id: "metric-new", grantId: "grant-1", orgId: "org-1" };
    const db = makeAtomicDb([[metric]]);
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));

    await expect(
      createImpactMetric(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        grantId: "grant-1",
        name: "Families Served",
        unit: "families",
      }),
    ).rejects.toThrow("audit log down");
    expect(
      (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction,
    ).toHaveBeenCalledTimes(1);
  });

  it("updateImpactMetric wraps update and audit log in a single transaction", async () => {
    const metric = { id: "metric-1", grantId: "grant-1", orgId: "org-1" };
    const db = makeAtomicDb([], [[metric]]);

    await updateImpactMetric(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      grantId: "grant-1",
      metricId: "metric-1",
      data: { name: "Updated Name" },
    });

    expect(
      (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction,
    ).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "impact_metric", action: "updated" }),
    );
  });

  it("updateImpactMetric rolls back when the audit log write fails", async () => {
    const metric = { id: "metric-1", grantId: "grant-1", orgId: "org-1" };
    const db = makeAtomicDb([], [[metric]]);
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));

    await expect(
      updateImpactMetric(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        grantId: "grant-1",
        metricId: "metric-1",
        data: { name: "Updated Name" },
      }),
    ).rejects.toThrow("audit log down");
  });

  it("deleteImpactMetric wraps soft-delete and audit log in a single transaction", async () => {
    const db = makeAtomicDb([], [[[]]]);

    await deleteImpactMetric(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      grantId: "grant-1",
      metricId: "metric-1",
    });

    expect(
      (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction,
    ).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "impact_metric", action: "deleted" }),
    );
  });

  it("deleteImpactMetric rolls back when the audit log write fails", async () => {
    const db = makeAtomicDb([], [[[]]]);
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));

    await expect(
      deleteImpactMetric(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        grantId: "grant-1",
        metricId: "metric-1",
      }),
    ).rejects.toThrow("audit log down");
  });

  it("createImpactMetricEntry wraps insert and audit log in a single transaction", async () => {
    const entry = { id: "entry-new", metricId: "metric-1" };
    const db = makeAtomicDb([[entry]]);

    await createImpactMetricEntry(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      grantId: "grant-1",
      metricId: "metric-1",
      value: "50",
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-03-31T00:00:00.000Z",
    });

    expect(
      (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction,
    ).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "impact_metric_entry", action: "created" }),
    );
  });

  it("createImpactMetricEntry rolls back when the audit log write fails", async () => {
    const entry = { id: "entry-new", metricId: "metric-1" };
    const db = makeAtomicDb([[entry]]);
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));

    await expect(
      createImpactMetricEntry(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        grantId: "grant-1",
        metricId: "metric-1",
        value: "50",
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-03-31T00:00:00.000Z",
      }),
    ).rejects.toThrow("audit log down");
  });

  it("updateImpactMetricEntry wraps update and audit log in a single transaction", async () => {
    const entry = { id: "entry-1", metricId: "metric-1" };
    const db = makeAtomicDb([], [[entry]]);

    await updateImpactMetricEntry(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      grantId: "grant-1",
      metricId: "metric-1",
      entryId: "entry-1",
      data: { value: "75" },
    });

    expect(
      (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction,
    ).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "impact_metric_entry", action: "updated" }),
    );
  });

  it("updateImpactMetricEntry rolls back when the audit log write fails", async () => {
    const entry = { id: "entry-1", metricId: "metric-1" };
    const db = makeAtomicDb([], [[entry]]);
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));

    await expect(
      updateImpactMetricEntry(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        grantId: "grant-1",
        metricId: "metric-1",
        entryId: "entry-1",
        data: { value: "75" },
      }),
    ).rejects.toThrow("audit log down");
  });

  it("deleteImpactMetricEntry wraps soft-delete and audit log in a single transaction", async () => {
    const entry = { id: "entry-1", metricId: "metric-1" };
    const db = makeAtomicDb([], [[entry]]);

    await deleteImpactMetricEntry(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      grantId: "grant-1",
      metricId: "metric-1",
      entryId: "entry-1",
    });

    expect(
      (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction,
    ).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "impact_metric_entry", action: "deleted" }),
    );
  });

  it("deleteImpactMetricEntry rolls back when the audit log write fails", async () => {
    const entry = { id: "entry-1", metricId: "metric-1" };
    const db = makeAtomicDb([], [[entry]]);
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));

    await expect(
      deleteImpactMetricEntry(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        grantId: "grant-1",
        metricId: "metric-1",
        entryId: "entry-1",
      }),
    ).rejects.toThrow("audit log down");
  });
});
