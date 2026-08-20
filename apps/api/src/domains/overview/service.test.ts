import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { createDbHandle } from "@grantpipe/db";
import {
  buildDashboardOverview,
  buildCalendarOverview,
  getDashboardHomePreference,
  upsertDashboardHomePreference,
  formatPriorityRiskSummary,
} from "./service";

vi.mock("../donors/stats.service", () => ({
  getDonorStats: vi.fn(),
  getPipelineGroups: vi.fn(),
}));

vi.mock("../grants/grant.service", () => ({
  listGrantPipeline: vi.fn(),
}));

import { getDonorStats, getPipelineGroups } from "../donors/stats.service";
import { listGrantPipeline } from "../grants/grant.service";

type DashboardGrantRecord = {
  id: string;
  name: string;
  status: string;
  amountCents: number | null;
  applicationDeadline: Date | null;
  updatedAt: Date;
  expenses: Array<{ amountCents: number; deletedAt?: Date | null }>;
  fundAllocations: Array<{
    allocatedAmountCents: number;
    fund?: { deletedAt?: Date | null } | null;
  }>;
  reportingRequirements: Array<{
    id: string;
    reportType: string;
    dueDate: Date | null;
    status: "upcoming" | "in_progress" | "submitted" | "overdue";
    deletedAt?: Date | null;
  }>;
  closeoutItems: Array<{
    id: string;
    label: string;
    dueDate: Date | null;
    completed: boolean;
    deletedAt?: Date | null;
  }>;
};

type DashboardFundRecord = {
  id: string;
  name: string;
  type: string;
  grantAllocations: Array<{
    allocatedAmountCents: number;
    grant?: { deletedAt?: Date | null } | null;
  }>;
  expenses: Array<{ amountCents: number; deletedAt?: Date | null }>;
};

type DashboardGeneratedReportRecord = {
  id: string;
  type: string;
  status: string;
  title: string;
  createdAt: Date;
};

function makeDashboardDb({
  grants,
  funds,
  activities,
  organization,
  auditEvidenceEventCount,
  generatedReports = [],
}: {
  grants: DashboardGrantRecord[];
  funds: DashboardFundRecord[];
  activities: Array<{
    id: string;
    action: string;
    entityType: string;
    createdAt: Date;
    changes?: Record<string, unknown> | null;
  }>;
  organization: { timezone: string; fiscalYearStartMonth: number; name: string };
  auditEvidenceEventCount?: number;
  generatedReports?: DashboardGeneratedReportRecord[];
}) {
  const computedAuditEvidenceEventCount =
    auditEvidenceEventCount ??
    activities.filter(
      (activity) =>
        ["generated_report", "import_history"].includes(activity.entityType) ||
        Boolean(activity.changes && "documentId" in activity.changes),
    ).length;
  const where = vi.fn().mockResolvedValue([{ count: computedAuditEvidenceEventCount }]);
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));

  return {
    select,
    query: {
      organizations: {
        findFirst: vi.fn().mockResolvedValue({
          id: "org-1",
          ...organization,
        }),
      },
      grants: {
        findMany: vi.fn().mockResolvedValue(grants),
      },
      funds: {
        findMany: vi.fn().mockResolvedValue(funds),
      },
      activityLog: {
        findMany: vi.fn().mockResolvedValue(activities),
      },
      generatedReports: {
        findFirst: vi.fn().mockResolvedValue(generatedReports[0] ?? null),
      },
    },
  };
}

function renderPredicate(value: unknown) {
  return new PgDialect().sqlToQuery(value as Parameters<PgDialect["sqlToQuery"]>[0]);
}

describe("buildDashboardOverview", () => {
  it("fences every top-level and nested dashboard relation by org, entity, and active ownership", async () => {
    vi.mocked(getDonorStats).mockResolvedValue({
      totalDonors: 0,
      totalGivingThisFY: 0,
      previousFiscalYearGivingCents: 0,
      newDonorsThisFY: 0,
      retentionRate: 0,
    });
    vi.mocked(getPipelineGroups).mockResolvedValue({} as never);
    vi.mocked(listGrantPipeline).mockResolvedValue({} as never);
    const db = makeDashboardDb({
      organization: {
        timezone: "UTC",
        fiscalYearStartMonth: 1,
        name: "Org One",
      },
      grants: [],
      funds: [],
      activities: [],
    });

    await buildDashboardOverview(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      now: new Date("2026-04-10T00:00:00.000Z"),
    });

    const grantConfig = db.query.grants.findMany.mock.calls[0]?.[0];
    const fundConfig = db.query.funds.findMany.mock.calls[0]?.[0];
    const activityConfig = db.query.activityLog.findMany.mock.calls[0]?.[0];
    expect(renderPredicate(grantConfig?.where)).toMatchObject({
      params: ["org-1", "entity-1"],
    });
    expect(renderPredicate(fundConfig?.where)).toMatchObject({
      params: ["org-1", "entity-1"],
    });
    const activityPredicate = renderPredicate(activityConfig?.where);
    expect(activityPredicate.sql).toContain('"activity_log"."active_entity_id" is null');
    expect(activityPredicate.sql).toContain('"activity_scope_org"."default_entity_id"');
    expect(activityPredicate.params).toEqual(["org-1", "entity-1", "org-1", "entity-1"]);

    const auditPredicate = renderPredicate(
      db.select.mock.results[0]?.value.from.mock.results[0]?.value.where.mock.calls[0]?.[0],
    );
    expect(auditPredicate.sql).toContain('"activity_log"."active_entity_id" is null');
    expect(auditPredicate.sql).toContain('"activity_scope_org"."default_entity_id"');

    const grantRelations = grantConfig?.with;
    for (const relation of ["expenses", "reportingRequirements", "closeoutItems"] as const) {
      const predicate = renderPredicate(grantRelations?.[relation]?.where);
      expect(predicate.sql).toContain('"org_id"');
      expect(predicate.sql).toContain('"entity_id"');
      expect(predicate.sql).toContain('"deleted_at" is null');
      expect(predicate.params).toEqual(["org-1", "entity-1"]);
    }

    const fundAllocationPredicate = renderPredicate(grantRelations?.fundAllocations?.where);
    const fundAllocationSql = fundAllocationPredicate.sql.toLowerCase();
    expect(fundAllocationSql).toContain('"grant_fund_allocations"."entity_id"');
    expect(fundAllocationSql).toContain('"grant_fund_allocations"."deleted_at" is null');
    expect(fundAllocationSql).toMatch(/from\s+"funds"/);
    expect(fundAllocationSql).toContain('"grant_allocation_fund"."org_id"');
    expect(fundAllocationSql).toContain('"grant_allocation_fund"."entity_id"');
    expect(fundAllocationSql).toContain('"grant_allocation_fund"."deleted_at" is null');

    const fundRelations = fundConfig?.with;
    const grantAllocationPredicate = renderPredicate(fundRelations?.grantAllocations?.where);
    const grantAllocationSql = grantAllocationPredicate.sql.toLowerCase();
    expect(grantAllocationSql).toContain('"grant_fund_allocations"."entity_id"');
    expect(grantAllocationSql).toContain('"grant_fund_allocations"."deleted_at" is null');
    expect(grantAllocationSql).toMatch(/from\s+"grants"/);
    expect(grantAllocationSql).toContain('"fund_allocation_grant"."org_id"');
    expect(grantAllocationSql).toContain('"fund_allocation_grant"."entity_id"');
    expect(grantAllocationSql).toContain('"fund_allocation_grant"."deleted_at" is null');
    const fundExpensePredicate = renderPredicate(fundRelations?.expenses?.where);
    expect(fundExpensePredicate.sql).toContain('"expenses"."org_id"');
    expect(fundExpensePredicate.sql).toContain('"expenses"."entity_id"');
    expect(fundExpensePredicate.sql).toContain('"expenses"."deleted_at" is null');

    const { db: relationalDb, close } = await createDbHandle(
      "postgresql://unused:unused@127.0.0.1:5432/unused",
    );
    try {
      const compiledGrantQuery = relationalDb.query.grants.findMany(grantConfig).toSQL();
      expect(compiledGrantQuery.sql).toContain('FROM "funds" "grant_allocation_fund"');
      expect(compiledGrantQuery.sql).toContain(
        '"grant_allocation_fund"."id" = "grants_fundAllocations"."fund_id"',
      );
      expect(compiledGrantQuery.sql).toContain('"grant_allocation_fund"."org_id" = $3');
      expect(compiledGrantQuery.sql).toContain('"grant_allocation_fund"."entity_id" = $4');
      expect(compiledGrantQuery.sql).toContain('"grant_allocation_fund"."deleted_at" IS NULL');
      expect(compiledGrantQuery.params.slice(1, 4)).toEqual(["entity-1", "org-1", "entity-1"]);

      const compiledFundQuery = relationalDb.query.funds.findMany(fundConfig).toSQL();
      expect(compiledFundQuery.sql).toContain('FROM "grants" "fund_allocation_grant"');
      expect(compiledFundQuery.sql).toContain(
        '"fund_allocation_grant"."id" = "funds_grantAllocations"."grant_id"',
      );
      expect(compiledFundQuery.sql).toContain('"fund_allocation_grant"."org_id" = $3');
      expect(compiledFundQuery.sql).toContain('"fund_allocation_grant"."entity_id" = $4');
      expect(compiledFundQuery.sql).toContain('"fund_allocation_grant"."deleted_at" IS NULL');
      expect(compiledFundQuery.params.slice(1, 4)).toEqual(["entity-1", "org-1", "entity-1"]);
    } finally {
      await close();
    }
  });
  it("builds an urgent executive snapshot from overdue grants and stale reporting", async () => {
    vi.mocked(getDonorStats).mockResolvedValue({
      totalDonors: 8,
      totalGivingThisFY: 250_000,
      previousFiscalYearGivingCents: 200_000,
      newDonorsThisFY: 2,
      retentionRate: 0.5,
    });
    vi.mocked(getPipelineGroups).mockResolvedValue({
      prospect: { contacts: [], count: 0 },
      cultivation: { contacts: [], count: 0 },
      solicitation: { contacts: [], count: 0 },
      stewardship: { contacts: [], count: 0 },
    } as never);
    vi.mocked(listGrantPipeline).mockResolvedValue({
      discovery: { grants: [], count: 0 },
      application: { grants: [], count: 0 },
      submitted: { grants: [], count: 0 },
      awarded: { grants: [], count: 0 },
      active: { grants: [], count: 1 },
      reporting: { grants: [], count: 1 },
      closeout: { grants: [], count: 0 },
      renewal: { grants: [], count: 0 },
      declined: { grants: [], count: 0 },
    } as never);

    const db = makeDashboardDb({
      organization: {
        timezone: "UTC",
        fiscalYearStartMonth: 1,
        name: "Org One",
      },
      grants: [
        {
          id: "grant-overdue",
          name: "Shelter Operations",
          status: "reporting",
          amountCents: 100_000,
          applicationDeadline: null,
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
          expenses: [{ amountCents: 50_000 }],
          fundAllocations: [{ allocatedAmountCents: 100_000 }],
          reportingRequirements: [
            {
              id: "req-overdue",
              reportType: "final",
              dueDate: new Date("2026-04-05T00:00:00.000Z"),
              status: "upcoming",
            },
          ],
          closeoutItems: [],
        },
      ],
      funds: [
        {
          id: "fund-watch",
          name: "Restricted Program Fund",
          type: "restricted",
          grantAllocations: [{ allocatedAmountCents: 100_000 }],
          expenses: [{ amountCents: 92_000 }],
        },
      ],
      activities: [],
    });

    const result = await buildDashboardOverview(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      now: new Date("2026-04-10T00:00:00.000Z"),
    });

    expect(result.executiveSnapshot).toEqual({
      status: "urgent",
      statusLabel: "Action needed",
      statusDescription:
        "1 overdue grant, 1 restricted fund on watch, and no board packet generated.",
      primaryMetricLabel: "Urgent work",
      primaryMetricValue: "1 urgent",
      secondaryMetricLabel: "Upcoming deadlines",
      secondaryMetricValue: "0 next 30 days",
      priorityActions: [
        {
          id: "grant:grant-overdue",
          kind: "grant_risk",
          title: "Shelter Operations",
          description: "Reporting overdue",
          severity: "urgent",
          dueDate: "2026-04-05T00:00:00.000Z",
          targetType: "grant",
          targetId: "grant-overdue",
        },
        {
          id: "reporting:board-packet",
          kind: "reporting_readiness",
          title: "Generate a board packet",
          description: "No board packet has been generated yet.",
          severity: "watch",
          dueDate: null,
          targetType: "reports",
          targetId: null,
        },
        {
          id: "fund:fund-watch",
          kind: "fund_watch",
          title: "Restricted Program Fund",
          description: "Restricted fund is 92% spent.",
          severity: "watch",
          dueDate: null,
          targetType: "fund",
          targetId: "fund-watch",
        },
      ],
    });
  });

  it("builds a clear executive snapshot when controls are current", async () => {
    vi.mocked(getDonorStats).mockResolvedValue({
      totalDonors: 0,
      totalGivingThisFY: 0,
      previousFiscalYearGivingCents: 0,
      newDonorsThisFY: 0,
      retentionRate: 0,
    });
    vi.mocked(getPipelineGroups).mockResolvedValue({
      prospect: { contacts: [], count: 0 },
      cultivation: { contacts: [], count: 0 },
      solicitation: { contacts: [], count: 0 },
      stewardship: { contacts: [], count: 0 },
    } as never);
    vi.mocked(listGrantPipeline).mockResolvedValue({
      discovery: { grants: [], count: 0 },
      application: { grants: [], count: 0 },
      submitted: { grants: [], count: 0 },
      awarded: { grants: [], count: 0 },
      active: { grants: [], count: 0 },
      reporting: { grants: [], count: 0 },
      closeout: { grants: [], count: 0 },
      renewal: { grants: [], count: 0 },
      declined: { grants: [], count: 0 },
    } as never);

    const db = makeDashboardDb({
      organization: {
        timezone: "UTC",
        fiscalYearStartMonth: 1,
        name: "Org One",
      },
      grants: [],
      funds: [],
      activities: [],
      generatedReports: [
        {
          id: "report-current",
          type: "board",
          status: "ready",
          title: "April board packet",
          createdAt: new Date("2026-04-09T12:00:00.000Z"),
        },
      ],
    });

    const result = await buildDashboardOverview(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      now: new Date("2026-04-10T00:00:00.000Z"),
    });

    expect(result.executiveSnapshot).toEqual(
      expect.objectContaining({
        status: "clear",
        statusLabel: "Under control",
        statusDescription: "No urgent grant or reporting work needs attention.",
        priorityActions: [],
      }),
    );
  });

  it("capitalizes the snapshot sentence when the board-packet fragment leads", async () => {
    vi.mocked(getDonorStats).mockResolvedValue({
      totalDonors: 0,
      totalGivingThisFY: 0,
      previousFiscalYearGivingCents: 0,
      newDonorsThisFY: 0,
      retentionRate: 0,
    });
    vi.mocked(getPipelineGroups).mockResolvedValue({
      prospect: { contacts: [], count: 0 },
      cultivation: { contacts: [], count: 0 },
      solicitation: { contacts: [], count: 0 },
      stewardship: { contacts: [], count: 0 },
    } as never);
    vi.mocked(listGrantPipeline).mockResolvedValue({
      discovery: { grants: [], count: 0 },
      application: { grants: [], count: 0 },
      submitted: { grants: [], count: 0 },
      awarded: { grants: [], count: 0 },
      active: { grants: [], count: 0 },
      reporting: { grants: [], count: 0 },
      closeout: { grants: [], count: 0 },
      renewal: { grants: [], count: 0 },
      declined: { grants: [], count: 0 },
    } as never);

    const db = makeDashboardDb({
      organization: {
        timezone: "UTC",
        fiscalYearStartMonth: 1,
        name: "Org One",
      },
      grants: [],
      funds: [],
      activities: [],
      generatedReports: [],
    });

    const result = await buildDashboardOverview(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      now: new Date("2026-04-10T00:00:00.000Z"),
    });

    expect(result.executiveSnapshot.statusDescription).toBe("No board packet generated.");
  });

  it("marks fully spent restricted funds as urgent priority actions", async () => {
    vi.mocked(getDonorStats).mockResolvedValue({
      totalDonors: 0,
      totalGivingThisFY: 0,
      previousFiscalYearGivingCents: 0,
      newDonorsThisFY: 0,
      retentionRate: 0,
    });
    vi.mocked(getPipelineGroups).mockResolvedValue({
      prospect: { contacts: [], count: 0 },
      cultivation: { contacts: [], count: 0 },
      solicitation: { contacts: [], count: 0 },
      stewardship: { contacts: [], count: 0 },
    } as never);
    vi.mocked(listGrantPipeline).mockResolvedValue({
      discovery: { grants: [], count: 0 },
      application: { grants: [], count: 0 },
      submitted: { grants: [], count: 0 },
      awarded: { grants: [], count: 0 },
      active: { grants: [], count: 0 },
      reporting: { grants: [], count: 0 },
      closeout: { grants: [], count: 0 },
      renewal: { grants: [], count: 0 },
      declined: { grants: [], count: 0 },
    } as never);

    const db = makeDashboardDb({
      organization: {
        timezone: "UTC",
        fiscalYearStartMonth: 1,
        name: "Org One",
      },
      grants: [],
      funds: [
        {
          id: "fund-spent",
          name: "Spent Restricted Fund",
          type: "restricted",
          grantAllocations: [{ allocatedAmountCents: 50_000 }],
          expenses: [{ amountCents: 50_000 }],
        },
      ],
      activities: [],
      generatedReports: [
        {
          id: "report-current",
          type: "board",
          status: "ready",
          title: "April board packet",
          createdAt: new Date("2026-04-09T12:00:00.000Z"),
        },
      ],
    });

    const result = await buildDashboardOverview(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      now: new Date("2026-04-10T00:00:00.000Z"),
    });

    expect(result.executiveSnapshot).toEqual(
      expect.objectContaining({
        status: "urgent",
        statusLabel: "Action needed",
        primaryMetricValue: "1 urgent",
      }),
    );
    expect(result.executiveSnapshot.priorityActions).toContainEqual(
      expect.objectContaining({
        id: "fund:fund-spent",
        severity: "urgent",
        description: "Restricted fund is 100% spent.",
      }),
    );
  });

  it("ranks urgent fund actions ahead of lower-priority reporting work", async () => {
    vi.mocked(getDonorStats).mockResolvedValue({
      totalDonors: 0,
      totalGivingThisFY: 0,
      previousFiscalYearGivingCents: 0,
      newDonorsThisFY: 0,
      retentionRate: 0,
    });
    vi.mocked(getPipelineGroups).mockResolvedValue({
      prospect: { contacts: [], count: 0 },
      cultivation: { contacts: [], count: 0 },
      solicitation: { contacts: [], count: 0 },
      stewardship: { contacts: [], count: 0 },
    } as never);
    vi.mocked(listGrantPipeline).mockResolvedValue({
      discovery: { grants: [], count: 0 },
      application: { grants: [], count: 0 },
      submitted: { grants: [], count: 0 },
      awarded: { grants: [], count: 0 },
      active: { grants: [], count: 2 },
      reporting: { grants: [], count: 0 },
      closeout: { grants: [], count: 0 },
      renewal: { grants: [], count: 0 },
      declined: { grants: [], count: 0 },
    } as never);

    const db = makeDashboardDb({
      organization: {
        timezone: "UTC",
        fiscalYearStartMonth: 1,
        name: "Org One",
      },
      grants: [
        {
          id: "grant-alpha",
          name: "Alpha Grant",
          status: "active",
          amountCents: 100_000,
          applicationDeadline: null,
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
          expenses: [{ amountCents: 82_000 }],
          fundAllocations: [{ allocatedAmountCents: 100_000 }],
          reportingRequirements: [],
          closeoutItems: [],
        },
        {
          id: "grant-beta",
          name: "Beta Grant",
          status: "active",
          amountCents: 100_000,
          applicationDeadline: null,
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
          expenses: [{ amountCents: 83_000 }],
          fundAllocations: [{ allocatedAmountCents: 100_000 }],
          reportingRequirements: [],
          closeoutItems: [],
        },
      ],
      funds: [
        {
          id: "fund-eighty",
          name: "Eighty Fund",
          type: "restricted",
          grantAllocations: [{ allocatedAmountCents: 100_000 }],
          expenses: [{ amountCents: 80_000 }],
        },
        {
          id: "fund-spent",
          name: "Spent Fund",
          type: "restricted",
          grantAllocations: [{ allocatedAmountCents: 100_000 }],
          expenses: [{ amountCents: 100_000 }],
        },
      ],
      activities: [],
    });

    const result = await buildDashboardOverview(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      now: new Date("2026-04-10T00:00:00.000Z"),
    });

    expect(result.executiveSnapshot.priorityActions).toHaveLength(3);
    expect(result.executiveSnapshot.priorityActions[0]).toEqual(
      expect.objectContaining({
        id: "fund:fund-spent",
        severity: "urgent",
      }),
    );
    expect(result.executiveSnapshot.priorityActions).not.toContainEqual(
      expect.objectContaining({
        id: "reporting:board-packet",
      }),
    );
    expect(result.executiveSnapshot.priorityActions).not.toContainEqual(
      expect.objectContaining({
        id: "fund:fund-eighty",
      }),
    );
  });

  it("counts all urgent conditions even when only three priority actions are visible", async () => {
    vi.mocked(getDonorStats).mockResolvedValue({
      totalDonors: 0,
      totalGivingThisFY: 0,
      previousFiscalYearGivingCents: 0,
      newDonorsThisFY: 0,
      retentionRate: 0,
    });
    vi.mocked(getPipelineGroups).mockResolvedValue({
      prospect: { contacts: [], count: 0 },
      cultivation: { contacts: [], count: 0 },
      solicitation: { contacts: [], count: 0 },
      stewardship: { contacts: [], count: 0 },
    } as never);
    vi.mocked(listGrantPipeline).mockResolvedValue({
      discovery: { grants: [], count: 0 },
      application: { grants: [], count: 0 },
      submitted: { grants: [], count: 0 },
      awarded: { grants: [], count: 0 },
      active: { grants: [], count: 0 },
      reporting: { grants: [], count: 0 },
      closeout: { grants: [], count: 0 },
      renewal: { grants: [], count: 0 },
      declined: { grants: [], count: 0 },
    } as never);

    const db = makeDashboardDb({
      organization: {
        timezone: "UTC",
        fiscalYearStartMonth: 1,
        name: "Org One",
      },
      grants: [],
      funds: [
        {
          id: "fund-a",
          name: "Alpha Fund",
          type: "restricted",
          grantAllocations: [{ allocatedAmountCents: 100_000 }],
          expenses: [{ amountCents: 100_000 }],
        },
        {
          id: "fund-b",
          name: "Beta Fund",
          type: "restricted",
          grantAllocations: [{ allocatedAmountCents: 100_000 }],
          expenses: [{ amountCents: 100_000 }],
        },
        {
          id: "fund-c",
          name: "Gamma Fund",
          type: "restricted",
          grantAllocations: [{ allocatedAmountCents: 100_000 }],
          expenses: [{ amountCents: 100_000 }],
        },
        {
          id: "fund-d",
          name: "Delta Fund",
          type: "restricted",
          grantAllocations: [{ allocatedAmountCents: 100_000 }],
          expenses: [{ amountCents: 100_000 }],
        },
      ],
      activities: [],
      generatedReports: [
        {
          id: "report-current",
          type: "board",
          status: "ready",
          title: "April board packet",
          createdAt: new Date("2026-04-09T12:00:00.000Z"),
        },
      ],
    });

    const result = await buildDashboardOverview(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      now: new Date("2026-04-10T00:00:00.000Z"),
    });

    expect(result.executiveSnapshot.primaryMetricLabel).toBe("Urgent work");
    expect(result.executiveSnapshot.primaryMetricValue).toBe("4 urgent");
    expect(result.executiveSnapshot.priorityActions).toHaveLength(3);
    expect(result.executiveSnapshot.priorityActions).toEqual([
      expect.objectContaining({ id: "fund:fund-a", severity: "urgent" }),
      expect.objectContaining({ id: "fund:fund-b", severity: "urgent" }),
      expect.objectContaining({ id: "fund:fund-d", severity: "urgent" }),
    ]);
  });

  it("counts all urgent grant conditions before limiting visible priority actions", async () => {
    vi.mocked(getDonorStats).mockResolvedValue({
      totalDonors: 0,
      totalGivingThisFY: 0,
      previousFiscalYearGivingCents: 0,
      newDonorsThisFY: 0,
      retentionRate: 0,
    });
    vi.mocked(getPipelineGroups).mockResolvedValue({
      prospect: { contacts: [], count: 0 },
      cultivation: { contacts: [], count: 0 },
      solicitation: { contacts: [], count: 0 },
      stewardship: { contacts: [], count: 0 },
    } as never);
    vi.mocked(listGrantPipeline).mockResolvedValue({
      discovery: { grants: [], count: 0 },
      application: { grants: [], count: 0 },
      submitted: { grants: [], count: 0 },
      awarded: { grants: [], count: 0 },
      active: { grants: [], count: 0 },
      reporting: { grants: [], count: 4 },
      closeout: { grants: [], count: 0 },
      renewal: { grants: [], count: 0 },
      declined: { grants: [], count: 0 },
    } as never);

    const db = makeDashboardDb({
      organization: {
        timezone: "UTC",
        fiscalYearStartMonth: 1,
        name: "Org One",
      },
      grants: [
        {
          id: "grant-later-a",
          name: "Later A",
          status: "reporting",
          amountCents: 100_000,
          applicationDeadline: null,
          updatedAt: new Date("2026-03-30T00:00:00.000Z"),
          expenses: [],
          fundAllocations: [],
          reportingRequirements: [
            {
              id: "req-later-a",
              reportType: "final",
              dueDate: new Date("2026-04-07T00:00:00.000Z"),
              status: "upcoming",
            },
          ],
          closeoutItems: [],
        },
        {
          id: "grant-later-b",
          name: "Later B",
          status: "reporting",
          amountCents: 100_000,
          applicationDeadline: null,
          updatedAt: new Date("2026-03-30T00:00:00.000Z"),
          expenses: [],
          fundAllocations: [],
          reportingRequirements: [
            {
              id: "req-later-b",
              reportType: "final",
              dueDate: new Date("2026-04-08T00:00:00.000Z"),
              status: "upcoming",
            },
          ],
          closeoutItems: [],
        },
        {
          id: "grant-earliest",
          name: "Earliest",
          status: "reporting",
          amountCents: 100_000,
          applicationDeadline: null,
          updatedAt: new Date("2026-03-30T00:00:00.000Z"),
          expenses: [],
          fundAllocations: [],
          reportingRequirements: [
            {
              id: "req-earliest",
              reportType: "final",
              dueDate: new Date("2026-04-01T00:00:00.000Z"),
              status: "upcoming",
            },
          ],
          closeoutItems: [],
        },
        {
          id: "grant-middle",
          name: "Middle",
          status: "reporting",
          amountCents: 100_000,
          applicationDeadline: null,
          updatedAt: new Date("2026-03-30T00:00:00.000Z"),
          expenses: [],
          fundAllocations: [],
          reportingRequirements: [
            {
              id: "req-middle",
              reportType: "final",
              dueDate: new Date("2026-04-03T00:00:00.000Z"),
              status: "upcoming",
            },
          ],
          closeoutItems: [],
        },
      ],
      funds: [],
      activities: [],
      generatedReports: [
        {
          id: "report-current",
          type: "board",
          status: "ready",
          title: "April board packet",
          createdAt: new Date("2026-04-09T12:00:00.000Z"),
        },
      ],
    });

    const result = await buildDashboardOverview(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      now: new Date("2026-04-10T00:00:00.000Z"),
    });

    expect(result.executiveSnapshot.primaryMetricValue).toBe("4 urgent");
    expect(result.executiveSnapshot.priorityActions).toHaveLength(3);
    expect(result.executiveSnapshot.priorityActions).toEqual([
      expect.objectContaining({ id: "grant:grant-earliest" }),
      expect.objectContaining({ id: "grant:grant-middle" }),
      expect.objectContaining({ id: "grant:grant-later-a" }),
    ]);
  });

  it("summarizes deadlines, risk, activity, donor metrics, pipeline, and fund balances", async () => {
    vi.mocked(getDonorStats).mockResolvedValue({
      totalDonors: 12,
      totalGivingThisFY: 500_000,
      previousFiscalYearGivingCents: 325_000,
      newDonorsThisFY: 4,
      retentionRate: 0.75,
    });
    vi.mocked(getPipelineGroups).mockResolvedValue({
      prospect: { contacts: [], count: 3 },
      cultivation: { contacts: [], count: 2 },
      solicitation: { contacts: [], count: 1 },
      stewardship: { contacts: [], count: 0 },
    } as never);
    vi.mocked(listGrantPipeline).mockResolvedValue({
      discovery: { grants: [], count: 1 },
      application: { grants: [], count: 1 },
      submitted: { grants: [], count: 0 },
      awarded: { grants: [], count: 0 },
      active: { grants: [], count: 1 },
      reporting: { grants: [], count: 0 },
      closeout: { grants: [], count: 0 },
      renewal: { grants: [], count: 0 },
      declined: { grants: [], count: 0 },
    } as never);

    const db = makeDashboardDb({
      organization: {
        timezone: "UTC",
        fiscalYearStartMonth: 1,
        name: "Org One",
      },
      grants: [
        {
          id: "grant-1",
          name: "Community Impact",
          status: "active",
          amountCents: 100_000,
          applicationDeadline: new Date("2026-04-20T00:00:00.000Z"),
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
          expenses: [{ amountCents: 92_000 }],
          fundAllocations: [{ allocatedAmountCents: 100_000 }],
          reportingRequirements: [
            {
              id: "req-1",
              reportType: "quarterly",
              dueDate: new Date("2026-04-15T00:00:00.000Z"),
              status: "upcoming",
            },
          ],
          closeoutItems: [
            {
              id: "item-1",
              label: "Final narrative",
              dueDate: new Date("2026-04-25T00:00:00.000Z"),
              completed: false,
            },
          ],
        },
        {
          id: "grant-2",
          name: "Renewal Grant",
          status: "reporting",
          amountCents: 50_000,
          applicationDeadline: null,
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
          expenses: [{ amountCents: 20_000 }],
          fundAllocations: [{ allocatedAmountCents: 40_000 }],
          reportingRequirements: [
            {
              id: "req-2",
              reportType: "annual",
              dueDate: new Date("2026-04-05T00:00:00.000Z"),
              status: "overdue",
            },
          ],
          closeoutItems: [],
        },
      ],
      funds: [
        {
          id: "fund-1",
          name: "General Operating",
          type: "unrestricted",
          grantAllocations: [{ allocatedAmountCents: 120_000 }],
          expenses: [{ amountCents: 120_000 }],
        },
        {
          id: "fund-2",
          name: "Restricted Growth",
          type: "restricted",
          grantAllocations: [{ allocatedAmountCents: 100_000 }],
          expenses: [{ amountCents: 80_000 }],
        },
        {
          id: "fund-3",
          name: "Restricted Renewal",
          type: "restricted",
          grantAllocations: [{ allocatedAmountCents: 100_000 }],
          expenses: [{ amountCents: 90_000 }],
        },
        {
          id: "fund-4",
          name: "Restricted Closeout",
          type: "restricted",
          grantAllocations: [{ allocatedAmountCents: 100_000 }],
          expenses: [{ amountCents: 100_000 }],
        },
      ],
      activities: [
        {
          id: "activity-1",
          action: "created",
          entityType: "grant",
          createdAt: new Date("2026-04-08T00:00:00.000Z"),
        },
        {
          id: "activity-2",
          action: "exported",
          entityType: "generated_report",
          createdAt: new Date("2026-04-07T00:00:00.000Z"),
        },
        {
          id: "activity-3",
          action: "uploaded",
          entityType: "grant",
          changes: { documentId: "document-1", filename: "award.pdf" },
          createdAt: new Date("2026-04-06T00:00:00.000Z"),
        },
        {
          id: "activity-4",
          action: "imported",
          entityType: "import_history",
          createdAt: new Date("2026-04-05T00:00:00.000Z"),
        },
      ],
      generatedReports: [
        {
          id: "report-1",
          type: "board",
          status: "ready",
          title: "March board packet",
          createdAt: new Date("2026-04-01T12:00:00.000Z"),
        },
      ],
    });

    const result = await buildDashboardOverview(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      now: new Date("2026-04-10T00:00:00.000Z"),
    });

    expect(result.donorMetrics.totalDonors).toBe(12);
    expect(result.donorMetrics.previousFiscalYearGivingCents).toBe(325_000);
    expect(result.pipelineSummary.donor).toEqual([
      { stage: "prospect", count: 3 },
      { stage: "cultivation", count: 2 },
      { stage: "solicitation", count: 1 },
      { stage: "stewardship", count: 0 },
      { stage: "donor", count: 0 },
      { stage: "lapsed", count: 0 },
    ]);
    expect(result.pipelineSummary.grants[0]).toEqual({ status: "discovery", count: 1 });
    expect(result.upcomingDeadlines).toHaveLength(3);
    expect(result.atRiskGrants).toHaveLength(2);
    expect(result.atRiskGrants[0]?.healthState).toBe("overdue");
    expect(result.recentActivity[0]?.entityType).toBe("grant");
    expect(result.fundBalancesOverview[0]?.currentBalanceCents).toBe(20_000);
    expect(result.complianceHealth).toEqual({
      overdueGrantCount: 1,
      atRiskGrantCount: 1,
      upcomingDeadlineCount: 3,
      restrictedFundWatchCount: 3,
      auditEvidenceEventCount: 3,
    });
    expect(result.boardReportFreshness).toEqual({
      latestReportId: "report-1",
      latestReportTitle: "March board packet",
      latestGeneratedAt: "2026-04-01T12:00:00.000Z",
      daysSinceLatestReport: 8,
    });
  });

  it("counts compliance health from uncapped controls instead of displayed rows", async () => {
    vi.mocked(getDonorStats).mockResolvedValue({
      totalDonors: 0,
      totalGivingThisFY: 0,
      previousFiscalYearGivingCents: 0,
      newDonorsThisFY: 0,
      retentionRate: 0,
    });
    vi.mocked(getPipelineGroups).mockResolvedValue({
      prospect: { contacts: [], count: 0 },
      cultivation: { contacts: [], count: 0 },
      solicitation: { contacts: [], count: 0 },
      stewardship: { contacts: [], count: 0 },
    } as never);
    vi.mocked(listGrantPipeline).mockResolvedValue({
      discovery: { grants: [], count: 0 },
      application: { grants: [], count: 0 },
      submitted: { grants: [], count: 0 },
      awarded: { grants: [], count: 0 },
      active: { grants: [], count: 25 },
      reporting: { grants: [], count: 0 },
      closeout: { grants: [], count: 0 },
      renewal: { grants: [], count: 0 },
      declined: { grants: [], count: 0 },
    } as never);

    const grants = Array.from({ length: 25 }, (_value, index) => ({
      id: `grant-${index}`,
      name: `Grant ${index}`,
      status: "active",
      amountCents: 100_000,
      applicationDeadline: new Date(`2026-04-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`),
      updatedAt: new Date("2026-04-01T00:00:00.000Z"),
      expenses: [],
      fundAllocations: [],
      reportingRequirements: [],
      closeoutItems: [],
    }));

    const db = makeDashboardDb({
      organization: {
        timezone: "UTC",
        fiscalYearStartMonth: 1,
        name: "Org One",
      },
      grants,
      funds: [],
      activities: [
        {
          id: "activity-1",
          action: "created",
          entityType: "grant",
          createdAt: new Date("2026-04-08T00:00:00.000Z"),
        },
      ],
      auditEvidenceEventCount: 12,
    });

    const result = await buildDashboardOverview(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      now: new Date("2026-03-26T00:00:00.000Z"),
    });

    expect(result.upcomingDeadlines).toHaveLength(20);
    expect(result.complianceHealth.upcomingDeadlineCount).toBe(25);
    expect(result.complianceHealth.auditEvidenceEventCount).toBe(12);
  });

  it("ignores soft-deleted child rows when summarizing grants and funds", async () => {
    vi.mocked(getDonorStats).mockResolvedValue({
      totalDonors: 0,
      totalGivingThisFY: 0,
      previousFiscalYearGivingCents: 0,
      newDonorsThisFY: 0,
      retentionRate: 0,
    });
    vi.mocked(getPipelineGroups).mockResolvedValue({
      prospect: { contacts: [], count: 0 },
      cultivation: { contacts: [], count: 0 },
      solicitation: { contacts: [], count: 0 },
      stewardship: { contacts: [], count: 0 },
    } as never);
    vi.mocked(listGrantPipeline).mockResolvedValue({
      discovery: { grants: [], count: 1 },
      application: { grants: [], count: 0 },
      submitted: { grants: [], count: 0 },
      awarded: { grants: [], count: 0 },
      active: { grants: [], count: 1 },
      reporting: { grants: [], count: 0 },
      closeout: { grants: [], count: 0 },
      renewal: { grants: [], count: 0 },
      declined: { grants: [], count: 0 },
    } as never);

    const db = makeDashboardDb({
      organization: {
        timezone: "UTC",
        fiscalYearStartMonth: 1,
        name: "Org One",
      },
      grants: [
        {
          id: "grant-1",
          name: "Community Impact",
          status: "active",
          amountCents: 1_000_000,
          applicationDeadline: null,
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
          expenses: [
            { amountCents: 850_000, deletedAt: null },
            { amountCents: 100_000, deletedAt: new Date("2026-04-01T00:00:00.000Z") },
          ],
          fundAllocations: [
            { allocatedAmountCents: 900_000, fund: { deletedAt: null } },
            {
              allocatedAmountCents: 100_000,
              fund: { deletedAt: new Date("2026-04-01T00:00:00.000Z") },
            },
          ],
          reportingRequirements: [],
          closeoutItems: [],
        },
      ],
      funds: [
        {
          id: "fund-1",
          name: "General Operating",
          type: "unrestricted",
          grantAllocations: [
            { allocatedAmountCents: 700_000, grant: { deletedAt: null } },
            {
              allocatedAmountCents: 100_000,
              grant: { deletedAt: new Date("2026-04-01T00:00:00.000Z") },
            },
          ],
          expenses: [
            { amountCents: 700_000, deletedAt: null },
            { amountCents: 300_000, deletedAt: new Date("2026-04-01T00:00:00.000Z") },
          ],
        },
      ],
      activities: [],
    });

    const result = await buildDashboardOverview(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      now: new Date("2026-04-10T00:00:00.000Z"),
    });

    expect(result.atRiskGrants[0]?.summary.allocationCoverageRatio).toBe(0.9);
    expect(result.atRiskGrants[0]?.summary.thresholdState).toBe("80");
    expect(result.fundBalancesOverview[0]?.currentBalanceCents).toBe(0);
  });

  it("excludes soft-deleted reporting requirements and closeout items from dashboard deadlines and risk", async () => {
    vi.mocked(getDonorStats).mockResolvedValue({
      totalDonors: 0,
      totalGivingThisFY: 0,
      previousFiscalYearGivingCents: 0,
      newDonorsThisFY: 0,
      retentionRate: 0,
    });
    vi.mocked(getPipelineGroups).mockResolvedValue({
      prospect: { contacts: [], count: 0 },
      cultivation: { contacts: [], count: 0 },
      solicitation: { contacts: [], count: 0 },
      stewardship: { contacts: [], count: 0 },
    } as never);
    vi.mocked(listGrantPipeline).mockResolvedValue({
      discovery: { grants: [], count: 0 },
      application: { grants: [], count: 0 },
      submitted: { grants: [], count: 0 },
      awarded: { grants: [], count: 0 },
      active: { grants: [], count: 1 },
      reporting: { grants: [], count: 0 },
      closeout: { grants: [], count: 0 },
      renewal: { grants: [], count: 0 },
      declined: { grants: [], count: 0 },
    } as never);

    const db = makeDashboardDb({
      organization: {
        timezone: "UTC",
        fiscalYearStartMonth: 1,
        name: "Org One",
      },
      grants: [
        {
          id: "grant-1",
          name: "Community Impact",
          status: "active",
          amountCents: 100_000,
          applicationDeadline: null,
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
          expenses: [],
          fundAllocations: [],
          reportingRequirements: [
            {
              id: "req-live",
              reportType: "quarterly",
              dueDate: new Date("2026-04-15T00:00:00.000Z"),
              status: "upcoming",
              deletedAt: null,
            },
            {
              id: "req-deleted",
              reportType: "annual",
              dueDate: new Date("2026-04-05T00:00:00.000Z"),
              status: "upcoming",
              deletedAt: new Date("2026-04-02T00:00:00.000Z"),
            },
          ],
          closeoutItems: [
            {
              id: "closeout-live",
              label: "Live closeout",
              dueDate: new Date("2026-04-20T00:00:00.000Z"),
              completed: false,
              deletedAt: null,
            },
            {
              id: "closeout-deleted",
              label: "Deleted closeout",
              dueDate: new Date("2026-04-11T00:00:00.000Z"),
              completed: false,
              deletedAt: new Date("2026-04-02T00:00:00.000Z"),
            },
          ],
        },
      ],
      funds: [],
      activities: [],
    });

    const result = await buildDashboardOverview(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      now: new Date("2026-04-10T00:00:00.000Z"),
    });

    expect(result.upcomingDeadlines).toHaveLength(2);
    expect(result.upcomingDeadlines.map((deadline) => deadline.label)).toEqual([
      "Quarterly report",
      "Live closeout",
    ]);
    expect(result.atRiskGrants).toEqual([
      expect.objectContaining({
        grantId: "grant-1",
        healthState: "at_risk",
        riskReasons: ["reporting_requirement_due_soon"],
        nextDeadlineAt: "2026-04-15T00:00:00.000Z",
      }),
    ]);
  });

  it("does not double the noun for free-text reporting types that already read as a report", async () => {
    vi.mocked(getDonorStats).mockResolvedValue({
      totalDonors: 0,
      newDonorsThisMonth: 0,
      totalRaisedCents: 0,
      raisedThisMonthCents: 0,
    } as never);
    vi.mocked(getPipelineGroups).mockResolvedValue([] as never);
    vi.mocked(listGrantPipeline).mockResolvedValue([] as never);

    const db = makeDashboardDb({
      organization: {
        timezone: "UTC",
        fiscalYearStartMonth: 1,
        name: "Org One",
      },
      grants: [
        {
          id: "grant-1",
          name: "Community Impact",
          status: "active",
          amountCents: 100_000,
          applicationDeadline: null,
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
          expenses: [],
          fundAllocations: [],
          reportingRequirements: [
            {
              id: "req-freetext",
              reportType: "Monthly Billing Report",
              dueDate: new Date("2026-04-15T00:00:00.000Z"),
              status: "upcoming",
              deletedAt: null,
            },
          ],
          closeoutItems: [],
        },
      ],
      funds: [],
      activities: [],
    });

    const result = await buildDashboardOverview(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      now: new Date("2026-04-10T00:00:00.000Z"),
    });

    expect(result.upcomingDeadlines.map((deadline) => deadline.label)).toEqual([
      "Monthly Billing Report",
    ]);
  });

  it("returns on-track grants and sorts risk entries with fallback ordering", async () => {
    vi.mocked(getDonorStats).mockResolvedValue({
      totalDonors: 2,
      totalGivingThisFY: 10_000,
      previousFiscalYearGivingCents: 5_000,
      newDonorsThisFY: 1,
      retentionRate: 0.5,
    });
    vi.mocked(getPipelineGroups).mockResolvedValue({
      prospect: { contacts: [], count: 0 },
      cultivation: { contacts: [], count: 0 },
      solicitation: { contacts: [], count: 0 },
      stewardship: { contacts: [], count: 0 },
    } as never);
    vi.mocked(listGrantPipeline).mockResolvedValue({
      discovery: { grants: [], count: 0 },
      application: { grants: [], count: 0 },
      submitted: { grants: [], count: 0 },
      awarded: { grants: [], count: 0 },
      active: { grants: [], count: 0 },
      reporting: { grants: [], count: 0 },
      closeout: { grants: [], count: 0 },
      renewal: { grants: [], count: 0 },
      declined: { grants: [], count: 0 },
    } as never);

    const db = makeDashboardDb({
      organization: {
        timezone: "UTC",
        fiscalYearStartMonth: 1,
        name: "Org One",
      },
      grants: [
        {
          id: "grant-on-track",
          name: "On Track Grant",
          status: "active",
          amountCents: 100_000,
          applicationDeadline: null,
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
          expenses: [{ amountCents: 10_000 }],
          fundAllocations: [{ allocatedAmountCents: 100_000 }],
          reportingRequirements: [
            {
              id: "submitted-1",
              reportType: "quarterly",
              dueDate: new Date("2026-04-12T00:00:00.000Z"),
              status: "submitted",
            },
            {
              id: "skipped-1",
              reportType: "annual",
              dueDate: null,
              status: "upcoming",
            },
          ],
          closeoutItems: [
            {
              id: "completed-1",
              label: "Archive records",
              dueDate: new Date("2026-04-09T00:00:00.000Z"),
              completed: true,
            },
          ],
        },
        {
          id: "grant-zeta",
          name: "Zeta Grant",
          status: "active",
          amountCents: 100_000,
          applicationDeadline: null,
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
          expenses: [{ amountCents: 95_000 }],
          fundAllocations: [],
          reportingRequirements: [
            {
              id: "req-zeta",
              reportType: "quarterly",
              dueDate: new Date("2026-04-14T00:00:00.000Z"),
              status: "upcoming",
            },
          ],
          closeoutItems: [],
        },
        {
          id: "grant-alpha",
          name: "Alpha Grant",
          status: "active",
          amountCents: 100_000,
          applicationDeadline: null,
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
          expenses: [{ amountCents: 81_000 }],
          fundAllocations: [],
          reportingRequirements: [
            {
              id: "req-alpha",
              reportType: "annual",
              dueDate: new Date("2026-04-12T00:00:00.000Z"),
              status: "upcoming",
            },
          ],
          closeoutItems: [],
        },
      ],
      funds: [],
      activities: [],
    });

    const result = await buildDashboardOverview(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      now: new Date("2026-04-10T00:00:00.000Z"),
    });

    expect(result.upcomingDeadlines).toHaveLength(2);
    expect(result.atRiskGrants).toHaveLength(2);
    expect(result.atRiskGrants.map((grant) => grant.grantName)).toEqual([
      "Alpha Grant",
      "Zeta Grant",
    ]);
    expect(result.atRiskGrants.every((grant) => grant.healthState === "at_risk")).toBe(true);
  });

  it("sorts same-day deadlines by kind and falls back to missing next-deadline ordering", async () => {
    vi.mocked(getDonorStats).mockResolvedValue({
      totalDonors: 1,
      totalGivingThisFY: 100,
      previousFiscalYearGivingCents: 50,
      newDonorsThisFY: 0,
      retentionRate: 1,
    });
    vi.mocked(getPipelineGroups).mockResolvedValue({
      prospect: { contacts: [], count: 0 },
      cultivation: { contacts: [], count: 0 },
      solicitation: { contacts: [], count: 0 },
      stewardship: { contacts: [], count: 0 },
    } as never);
    vi.mocked(listGrantPipeline).mockResolvedValue({
      discovery: { grants: [], count: 0 },
      application: { grants: [], count: 0 },
      submitted: { grants: [], count: 0 },
      awarded: { grants: [], count: 0 },
      active: { grants: [], count: 0 },
      reporting: { grants: [], count: 0 },
      closeout: { grants: [], count: 0 },
      renewal: { grants: [], count: 0 },
      declined: { grants: [], count: 0 },
    } as never);

    const db = makeDashboardDb({
      organization: {
        timezone: "UTC",
        fiscalYearStartMonth: 1,
        name: "Org One",
      },
      grants: [
        {
          id: "grant-without-deadline",
          name: "Alpha Grant",
          status: "active",
          amountCents: 100_000,
          applicationDeadline: null,
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
          expenses: [{ amountCents: 90_000 }],
          fundAllocations: [{ allocatedAmountCents: 100_000 }],
          reportingRequirements: [],
          closeoutItems: [],
        },
        {
          id: "grant-with-deadline",
          name: "Grant With Deadline",
          status: "active",
          amountCents: 100_000,
          applicationDeadline: new Date("2026-04-15T00:00:00.000Z"),
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
          expenses: [{ amountCents: 90_000 }],
          fundAllocations: [{ allocatedAmountCents: 100_000 }],
          reportingRequirements: [
            {
              id: "req-with",
              reportType: "annual",
              dueDate: new Date("2026-04-15T00:00:00.000Z"),
              status: "upcoming",
            },
          ],
          closeoutItems: [
            {
              id: "closeout-with",
              label: "Package",
              dueDate: new Date("2026-04-15T00:00:00.000Z"),
              completed: false,
            },
          ],
        },
        {
          id: "grant-without-deadline-zeta",
          name: "Zeta Grant",
          status: "active",
          amountCents: 100_000,
          applicationDeadline: null,
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
          expenses: [{ amountCents: 90_000 }],
          fundAllocations: [{ allocatedAmountCents: 100_000 }],
          reportingRequirements: [],
          closeoutItems: [],
        },
      ],
      funds: [],
      activities: [],
    });

    const result = await buildDashboardOverview(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      now: new Date("2026-04-10T00:00:00.000Z"),
    });

    expect(result.upcomingDeadlines.slice(0, 3).map((deadline) => deadline.kind)).toEqual([
      "application_deadline",
      "reporting_requirement",
      "closeout_item",
    ]);
    expect(result.atRiskGrants.map((grant) => grant.grantName)).toEqual([
      "Grant With Deadline",
      "Alpha Grant",
      "Zeta Grant",
    ]);
  });

  it("prioritizes overdue grants ahead of at-risk grants in the sort order", async () => {
    vi.mocked(getDonorStats).mockResolvedValue({
      totalDonors: 0,
      totalGivingThisFY: 0,
      previousFiscalYearGivingCents: 0,
      newDonorsThisFY: 0,
      retentionRate: 0,
    });
    vi.mocked(getPipelineGroups).mockResolvedValue({
      prospect: { contacts: [], count: 0 },
      cultivation: { contacts: [], count: 0 },
      solicitation: { contacts: [], count: 0 },
      stewardship: { contacts: [], count: 0 },
    } as never);
    vi.mocked(listGrantPipeline).mockResolvedValue({
      discovery: { grants: [], count: 0 },
      application: { grants: [], count: 0 },
      submitted: { grants: [], count: 0 },
      awarded: { grants: [], count: 0 },
      active: { grants: [], count: 0 },
      reporting: { grants: [], count: 0 },
      closeout: { grants: [], count: 0 },
      renewal: { grants: [], count: 0 },
      declined: { grants: [], count: 0 },
    } as never);

    const db = makeDashboardDb({
      organization: {
        timezone: "UTC",
        fiscalYearStartMonth: 1,
        name: "Org One",
      },
      grants: [
        {
          id: "grant-overdue",
          name: "Overdue Grant",
          status: "reporting",
          amountCents: 100_000,
          applicationDeadline: null,
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
          expenses: [{ amountCents: 20_000 }],
          fundAllocations: [],
          reportingRequirements: [
            {
              id: "req-overdue",
              reportType: "annual",
              dueDate: new Date("2026-04-05T00:00:00.000Z"),
              status: "upcoming",
            },
          ],
          closeoutItems: [],
        },
        {
          id: "grant-risk",
          name: "Risk Grant",
          status: "active",
          amountCents: 100_000,
          applicationDeadline: null,
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
          expenses: [{ amountCents: 81_000 }],
          fundAllocations: [],
          reportingRequirements: [
            {
              id: "req-risk",
              reportType: "quarterly",
              dueDate: new Date("2026-04-14T00:00:00.000Z"),
              status: "upcoming",
            },
          ],
          closeoutItems: [],
        },
      ],
      funds: [],
      activities: [],
    });

    const result = await buildDashboardOverview(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      now: new Date("2026-04-10T00:00:00.000Z"),
    });

    expect(result.atRiskGrants.map((grant) => grant.grantName)).toEqual([
      "Overdue Grant",
      "Risk Grant",
    ]);
  });

  it("does not mark grants at risk for application or closeout deadlines alone", async () => {
    vi.mocked(getDonorStats).mockResolvedValue({
      totalDonors: 0,
      totalGivingThisFY: 0,
      previousFiscalYearGivingCents: 0,
      newDonorsThisFY: 0,
      retentionRate: 0,
    });
    vi.mocked(getPipelineGroups).mockResolvedValue({
      prospect: { contacts: [], count: 0 },
      cultivation: { contacts: [], count: 0 },
      solicitation: { contacts: [], count: 0 },
      stewardship: { contacts: [], count: 0 },
    } as never);
    vi.mocked(listGrantPipeline).mockResolvedValue({
      discovery: { grants: [], count: 0 },
      application: { grants: [], count: 0 },
      submitted: { grants: [], count: 0 },
      awarded: { grants: [], count: 0 },
      active: { grants: [], count: 0 },
      reporting: { grants: [], count: 0 },
      closeout: { grants: [], count: 0 },
      renewal: { grants: [], count: 0 },
      declined: { grants: [], count: 0 },
    } as never);

    const db = makeDashboardDb({
      organization: {
        timezone: "UTC",
        fiscalYearStartMonth: 1,
        name: "Org One",
      },
      grants: [
        {
          id: "grant-1",
          name: "Closeout Only Grant",
          status: "active",
          amountCents: 100_000,
          applicationDeadline: new Date("2026-04-14T00:00:00.000Z"),
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
          expenses: [{ amountCents: 20_000 }],
          fundAllocations: [{ allocatedAmountCents: 100_000 }],
          reportingRequirements: [],
          closeoutItems: [
            {
              id: "item-1",
              label: "Archive documents",
              dueDate: new Date("2026-04-18T00:00:00.000Z"),
              completed: false,
            },
          ],
        },
      ],
      funds: [],
      activities: [],
    });

    const result = await buildDashboardOverview(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      now: new Date("2026-04-10T00:00:00.000Z"),
    });

    expect(result.upcomingDeadlines.map((deadline) => deadline.kind)).toEqual([
      "application_deadline",
      "closeout_item",
    ]);
    expect(result.atRiskGrants).toEqual([]);
  });

  it("throws when the organization is missing", async () => {
    vi.mocked(getDonorStats).mockReset();
    vi.mocked(getPipelineGroups).mockReset();
    vi.mocked(listGrantPipeline).mockReset();

    const db = {
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
    };

    await expect(
      buildDashboardOverview(db as never, { orgId: "org-1", entityId: "entity-1" }),
    ).rejects.toThrow("Organization not found");
  });

  it("omits donor metrics, donor pipeline, and recent activity when donor data is disabled", async () => {
    vi.mocked(getDonorStats).mockReset();
    vi.mocked(getPipelineGroups).mockReset();
    vi.mocked(listGrantPipeline).mockResolvedValue({
      discovery: { grants: [], count: 0 },
      application: { grants: [], count: 0 },
      submitted: { grants: [], count: 0 },
      awarded: { grants: [], count: 0 },
      active: { grants: [], count: 1 },
      reporting: { grants: [], count: 0 },
      closeout: { grants: [], count: 0 },
      renewal: { grants: [], count: 0 },
      declined: { grants: [], count: 0 },
    } as never);

    const db = makeDashboardDb({
      organization: {
        timezone: "UTC",
        fiscalYearStartMonth: 1,
        name: "Org One",
      },
      grants: [],
      funds: [],
      activities: [
        {
          id: "activity-1",
          action: "created",
          entityType: "contact",
          createdAt: new Date("2026-04-09T00:00:00.000Z"),
        },
      ],
    });

    const result = await buildDashboardOverview(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      now: new Date("2026-04-10T00:00:00.000Z"),
      includeDonorData: false,
    });

    expect(getDonorStats).not.toHaveBeenCalled();
    expect(getPipelineGroups).not.toHaveBeenCalled();
    expect(db.query.activityLog.findMany).not.toHaveBeenCalled();
    expect(result.donorMetrics).toEqual({
      totalDonors: 0,
      totalGivingThisFY: 0,
      previousFiscalYearGivingCents: 0,
      newDonorsThisFY: 0,
      retentionRate: 0,
    });
    expect(result.pipelineSummary.donor.every((stage) => stage.count === 0)).toBe(true);
    expect(result.recentActivity).toEqual([]);
  });
});

describe("dashboard home preferences", () => {
  it("returns role defaults when no preference has been saved", async () => {
    const result = await getDashboardHomePreference(
      {
        query: {
          dashboardHomePreferences: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
        },
      } as never,
      { orgId: "org-1", userId: "user-1", memberRole: "editor" },
    );

    expect(result).toEqual({
      pinnedWidgetIds: [
        "executive_snapshot",
        "needs_attention",
        "quick_actions",
        "donor_metrics",
        "donor_pipeline",
        "grant_pipeline",
        "grant_health",
        "restriction_risk",
        "fund_balances",
        "reporting_readiness",
        "recent_activity",
      ],
      source: "default",
    });
  });

  it("filters saved auditor widgets that are not allowed for the role", async () => {
    const result = await getDashboardHomePreference(
      {
        query: {
          dashboardHomePreferences: {
            findFirst: vi.fn().mockResolvedValue({
              layout: {
                pinnedWidgetIds: [
                  "donor_metrics",
                  "grant_health",
                  "recent_activity",
                  "fund_balances",
                ],
              },
            }),
          },
        },
      } as never,
      { orgId: "org-1", userId: "user-1", memberRole: "auditor" },
    );

    expect(result).toEqual({
      pinnedWidgetIds: ["grant_health", "fund_balances"],
      source: "saved",
    });
  });

  it("upserts a sanitized preference layout", async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    const insert = vi.fn(() => ({ values }));

    const result = await upsertDashboardHomePreference({ insert } as never, {
      orgId: "org-1",
      userId: "user-1",
      memberRole: "auditor",
      pinnedWidgetIds: ["donor_metrics", "grant_health", "grant_health", "fund_balances"],
    });

    expect(result).toEqual({
      pinnedWidgetIds: ["grant_health", "fund_balances"],
      source: "saved",
    });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        userId: "user-1",
        layout: { pinnedWidgetIds: ["grant_health", "fund_balances"] },
      }),
    );
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          layout: { pinnedWidgetIds: ["grant_health", "fund_balances"] },
        }),
      }),
    );
  });
});

describe("buildCalendarOverview", () => {
  it("fences calendar grants and nested deadline children by org, entity, and active rows", async () => {
    const db = makeDashboardDb({
      organization: {
        timezone: "UTC",
        fiscalYearStartMonth: 1,
        name: "Org One",
      },
      grants: [],
      funds: [],
      activities: [],
    });

    await buildCalendarOverview(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      month: "2026-04",
    });

    const grantConfig = db.query.grants.findMany.mock.calls[0]?.[0];
    expect(renderPredicate(grantConfig?.where)).toMatchObject({
      params: ["org-1", "entity-1"],
    });
    for (const relation of ["reportingRequirements", "closeoutItems"] as const) {
      const predicate = renderPredicate(grantConfig?.with?.[relation]?.where);
      expect(predicate.sql).toContain('"org_id"');
      expect(predicate.sql).toContain('"entity_id"');
      expect(predicate.sql).toContain('"deleted_at" is null');
      expect(predicate.params).toEqual(["org-1", "entity-1"]);
    }
  });

  it("groups deadlines by month and date", async () => {
    const db = makeDashboardDb({
      organization: {
        timezone: "UTC",
        fiscalYearStartMonth: 1,
        name: "Org One",
      },
      grants: [
        {
          id: "grant-1",
          name: "Community Impact",
          status: "active",
          amountCents: 100_000,
          applicationDeadline: new Date("2026-04-20T00:00:00.000Z"),
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
          expenses: [],
          fundAllocations: [],
          reportingRequirements: [
            {
              id: "req-1",
              reportType: "quarterly",
              dueDate: new Date("2026-04-15T00:00:00.000Z"),
              status: "upcoming",
            },
            {
              id: "req-2",
              reportType: "final",
              dueDate: new Date("2026-04-18T00:00:00.000Z"),
              status: "submitted",
            },
          ],
          closeoutItems: [
            {
              id: "item-1",
              label: "Final narrative",
              dueDate: new Date("2026-04-25T00:00:00.000Z"),
              completed: false,
            },
            {
              id: "item-2",
              label: "Archive records",
              dueDate: new Date("2026-04-18T00:00:00.000Z"),
              completed: true,
            },
          ],
        },
        {
          id: "grant-2",
          name: "May Grant",
          status: "active",
          amountCents: 50_000,
          applicationDeadline: new Date("2026-05-01T00:00:00.000Z"),
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
          expenses: [],
          fundAllocations: [],
          reportingRequirements: [],
          closeoutItems: [],
        },
      ],
      funds: [],
      activities: [],
    });

    const result = await buildCalendarOverview(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      month: "2026-04",
      now: new Date("2026-04-20T00:00:00.000Z"),
    });

    expect(result.month).toBe("2026-04");
    expect(result.totals).toEqual({
      applicationDeadlines: 1,
      reportingRequirements: 2,
      closeoutItems: 2,
    });
    expect(result.days).toHaveLength(30);
    expect(result.days.find((day) => day.date === "2026-04-15")?.items).toHaveLength(1);
    expect(result.days.find((day) => day.date === "2026-04-18")?.items).toHaveLength(2);
    expect(result.days.find((day) => day.date === "2026-04-20")?.items).toHaveLength(1);
    expect(result.days.find((day) => day.date === "2026-04-25")?.items).toHaveLength(1);
    expect(result.days.find((day) => day.date === "2026-04-15")?.items[0]?.status).toBe("overdue");
    expect(
      result.days.find((day) => day.date === "2026-04-18")?.items.map((item) => item.status),
    ).toEqual(["submitted", "completed"]);
  });

  it("omits items outside the month and sorts same-day deadlines by kind", async () => {
    const db = makeDashboardDb({
      organization: {
        timezone: "UTC",
        fiscalYearStartMonth: 1,
        name: "Org One",
      },
      grants: [
        {
          id: "grant-1",
          name: "Community Impact",
          status: "active",
          amountCents: 100_000,
          applicationDeadline: new Date("2026-04-20T00:00:00.000Z"),
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
          expenses: [],
          fundAllocations: [],
          reportingRequirements: [
            {
              id: "req-1",
              reportType: "quarterly",
              dueDate: new Date("2026-04-20T03:00:00.000Z"),
              status: "upcoming",
            },
            {
              id: "req-3",
              reportType: "monthly",
              dueDate: new Date("2026-04-20T01:00:00.000Z"),
              status: "upcoming",
            },
            {
              id: "req-4",
              reportType: "final",
              dueDate: new Date("2026-05-03T00:00:00.000Z"),
              status: "upcoming",
            },
            {
              id: "req-2",
              reportType: "annual",
              dueDate: null,
              status: "upcoming",
            },
          ],
          closeoutItems: [
            {
              id: "item-1",
              label: "Final narrative",
              dueDate: new Date("2026-04-20T00:00:00.000Z"),
              completed: false,
            },
            {
              id: "item-2",
              label: "Archive records",
              dueDate: null,
              completed: false,
            },
            {
              id: "item-3",
              label: "Mail acknowledgements",
              dueDate: new Date("2026-05-04T00:00:00.000Z"),
              completed: false,
            },
          ],
        },
        {
          id: "grant-2",
          name: "May Grant",
          status: "active",
          amountCents: 50_000,
          applicationDeadline: new Date("2026-05-01T00:00:00.000Z"),
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
          expenses: [],
          fundAllocations: [],
          reportingRequirements: [],
          closeoutItems: [],
        },
      ],
      funds: [],
      activities: [],
    });

    const result = await buildCalendarOverview(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      month: "2026-04",
      now: new Date("2026-04-20T00:00:00.000Z"),
    });

    const sameDayItems = result.days.find((day) => day.date === "2026-04-20")?.items ?? [];

    expect(sameDayItems.map((item) => item.kind)).toEqual([
      "application_deadline",
      "reporting_requirement",
      "reporting_requirement",
      "closeout_item",
    ]);
    expect(sameDayItems[1]?.label).toBe("monthly report");
    expect(sameDayItems[2]?.label).toBe("Quarterly report");
    expect(sameDayItems[1]?.status).toBe("due_today");
    expect(sameDayItems[2]?.status).toBe("due_today");
    expect(sameDayItems[3]?.status).toBe("due_today");
    expect(result.totals).toEqual({
      applicationDeadlines: 1,
      reportingRequirements: 2,
      closeoutItems: 1,
    });
  });

  it("marks future reporting and closeout deadlines as upcoming", async () => {
    const db = makeDashboardDb({
      organization: {
        timezone: "UTC",
        fiscalYearStartMonth: 1,
        name: "Org One",
      },
      grants: [
        {
          id: "grant-1",
          name: "Community Impact",
          status: "active",
          amountCents: 100_000,
          applicationDeadline: null,
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
          expenses: [],
          fundAllocations: [],
          reportingRequirements: [
            {
              id: "req-1",
              reportType: "quarterly",
              dueDate: new Date("2026-04-12T00:00:00.000Z"),
              status: "upcoming",
            },
          ],
          closeoutItems: [
            {
              id: "item-1",
              label: "Final narrative",
              dueDate: new Date("2026-04-16T00:00:00.000Z"),
              completed: false,
            },
          ],
        },
      ],
      funds: [],
      activities: [],
    });

    const result = await buildCalendarOverview(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      month: "2026-04",
      now: new Date("2026-04-10T00:00:00.000Z"),
    });

    expect(result.days.find((day) => day.date === "2026-04-12")?.items[0]?.status).toBe("upcoming");
    expect(result.days.find((day) => day.date === "2026-04-16")?.items[0]?.status).toBe("upcoming");
  });

  it("excludes soft-deleted reporting requirements and closeout items from the calendar", async () => {
    const db = makeDashboardDb({
      organization: {
        timezone: "UTC",
        fiscalYearStartMonth: 1,
        name: "Org One",
      },
      grants: [
        {
          id: "grant-1",
          name: "Community Impact",
          status: "active",
          amountCents: 100_000,
          applicationDeadline: null,
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
          expenses: [],
          fundAllocations: [],
          reportingRequirements: [
            {
              id: "req-live",
              reportType: "quarterly",
              dueDate: new Date("2026-04-12T00:00:00.000Z"),
              status: "upcoming",
              deletedAt: null,
            },
            {
              id: "req-deleted",
              reportType: "annual",
              dueDate: new Date("2026-04-13T00:00:00.000Z"),
              status: "upcoming",
              deletedAt: new Date("2026-04-02T00:00:00.000Z"),
            },
          ],
          closeoutItems: [
            {
              id: "item-live",
              label: "Live closeout",
              dueDate: new Date("2026-04-14T00:00:00.000Z"),
              completed: false,
              deletedAt: null,
            },
            {
              id: "item-deleted",
              label: "Deleted closeout",
              dueDate: new Date("2026-04-15T00:00:00.000Z"),
              completed: false,
              deletedAt: new Date("2026-04-02T00:00:00.000Z"),
            },
          ],
        },
      ],
      funds: [],
      activities: [],
    });

    const result = await buildCalendarOverview(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      month: "2026-04",
      now: new Date("2026-04-10T00:00:00.000Z"),
    });

    expect(result.totals).toEqual({
      applicationDeadlines: 0,
      reportingRequirements: 1,
      closeoutItems: 1,
    });
    expect(result.days.find((day) => day.date === "2026-04-13")?.items).toEqual([]);
    expect(result.days.find((day) => day.date === "2026-04-15")?.items).toEqual([]);
  });

  it("marks past-due incomplete closeout items as overdue", async () => {
    const db = makeDashboardDb({
      organization: {
        timezone: "UTC",
        fiscalYearStartMonth: 1,
        name: "Org One",
      },
      grants: [
        {
          id: "grant-1",
          name: "Community Impact",
          status: "active",
          amountCents: 100_000,
          applicationDeadline: null,
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
          expenses: [],
          fundAllocations: [],
          reportingRequirements: [],
          closeoutItems: [
            {
              id: "item-1",
              label: "Final narrative",
              dueDate: new Date("2026-04-08T00:00:00.000Z"),
              completed: false,
            },
          ],
        },
      ],
      funds: [],
      activities: [],
    });

    const result = await buildCalendarOverview(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      month: "2026-04",
      now: new Date("2026-04-10T00:00:00.000Z"),
    });

    expect(result.days.find((day) => day.date === "2026-04-08")?.items[0]?.status).toBe("overdue");
  });

  it("defaults now and derives application deadline status when no explicit status is provided", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T00:00:00.000Z"));

    const db = makeDashboardDb({
      organization: {
        timezone: "UTC",
        fiscalYearStartMonth: 1,
        name: "Org One",
      },
      grants: [
        {
          id: "grant-1",
          name: "Community Impact",
          status: "active",
          amountCents: 100_000,
          applicationDeadline: new Date("2026-04-14T00:00:00.000Z"),
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
          expenses: [],
          fundAllocations: [],
          reportingRequirements: [],
          closeoutItems: [],
        },
      ],
      funds: [],
      activities: [],
    });

    const result = await buildCalendarOverview(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      month: "2026-04",
    });

    expect(result.days.find((day) => day.date === "2026-04-14")?.items[0]?.status).toBe("upcoming");

    vi.useRealTimers();
  });

  it("throws when the calendar organization is missing", async () => {
    const db = {
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
    };

    await expect(
      buildCalendarOverview(db as never, {
        orgId: "org-1",
        entityId: "entity-1",
        month: "2026-04",
        now: new Date("2026-04-20T00:00:00.000Z"),
      }),
    ).rejects.toThrow("Organization not found");
  });
});

describe("formatPriorityRiskSummary", () => {
  it("returns empty string for empty array", () => {
    expect(formatPriorityRiskSummary([])).toBe("");
  });

  it("formats a single due_soon reason", () => {
    expect(formatPriorityRiskSummary(["reporting_requirement_due_soon"])).toBe(
      "Reporting due soon",
    );
  });

  it("collapses overdue and due_soon for the same subject into one phrase", () => {
    expect(
      formatPriorityRiskSummary([
        "reporting_requirement_due_soon",
        "reporting_requirement_overdue",
      ]),
    ).toBe("Reporting overdue and due soon");
  });

  it("formats a single overdue reason", () => {
    expect(formatPriorityRiskSummary(["reporting_requirement_overdue"])).toBe("Reporting overdue");
  });

  it("formats a spend_down reason", () => {
    expect(formatPriorityRiskSummary(["spend_down_80"])).toBe("Budget 80% spent");
  });

  it("puts budget concern first and joins with middledot", () => {
    expect(formatPriorityRiskSummary(["reporting_requirement_overdue", "spend_down_80"])).toBe(
      "Budget 80% spent · Reporting overdue",
    );
  });

  it("capitalizes non-reporting subjects using capitalizeFirst", () => {
    expect(formatPriorityRiskSummary(["closeout_item_overdue"])).toBe("Closeout item overdue");
  });

  it("handles bare reason tokens with no recognized prefix or suffix", () => {
    expect(formatPriorityRiskSummary(["custom_reason"])).toBe("Custom reason");
  });

  it("preserves first-encounter order for multiple subjects", () => {
    expect(
      formatPriorityRiskSummary([
        "spend_down_90",
        "reporting_requirement_overdue",
        "closeout_item_due_soon",
        "custom_reason",
      ]),
    ).toBe("Budget 90% spent · Reporting overdue · Closeout item due soon · Custom reason");
  });
});
