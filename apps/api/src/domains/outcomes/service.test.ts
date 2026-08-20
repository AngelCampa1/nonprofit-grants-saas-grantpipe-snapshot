import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOutcome, createOutcomeIndicator, listOutcomes, toOutcomeResponse } from "./service";

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn(),
}));

import { recordActivityLog } from "../../lib/activity-log";

const now = new Date("2026-06-18T00:00:00.000Z");

function outcomeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "outcome-1",
    orgId: "org-1",
    programId: "program-1",
    grantId: "grant-1",
    name: "Families keep stable housing",
    statement: "Families served by the housing grant keep stable housing for 12 months.",
    targetPopulation: "Families at risk of eviction",
    status: "active",
    startDate: new Date("2026-01-01T00:00:00.000Z"),
    endDate: new Date("2026-12-31T00:00:00.000Z"),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    indicators: [],
    ...overrides,
  };
}

function indicatorRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "indicator-1",
    orgId: "org-1",
    outcomeId: "outcome-1",
    impactMetricId: "metric-1",
    name: "Households housed",
    indicatorType: "outcome",
    direction: "increase",
    targetValue: "125",
    baselineValue: "80",
    unit: "households",
    source: "Funder report",
    funderDefined: true,
    reportingCadence: "quarterly",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    impactMetric: {
      id: "metric-1",
      entries: [
        {
          id: "entry-old",
          value: "90",
          periodStart: new Date("2026-01-01T00:00:00.000Z"),
          periodEnd: new Date("2026-03-31T00:00:00.000Z"),
          notes: null,
          deletedAt: null,
        },
        {
          id: "entry-latest",
          value: "130",
          periodStart: new Date("2026-04-01T00:00:00.000Z"),
          periodEnd: new Date("2026-06-30T00:00:00.000Z"),
          notes: "Quarter 2",
          deletedAt: null,
        },
      ],
    },
    ...overrides,
  };
}

function buildDb(
  options: {
    outcomes?: unknown[];
    insertedOutcomes?: unknown[];
    insertedIndicators?: unknown[];
    outcomeLookup?: unknown;
    grantLookup?: unknown;
    programLookup?: unknown;
    metricLookup?: unknown;
  } = {},
) {
  return {
    query: {
      outcomeGoals: {
        findMany: vi.fn(async () => options.outcomes ?? []),
        findFirst: vi.fn(async () =>
          "outcomeLookup" in options ? options.outcomeLookup : outcomeRow(),
        ),
      },
      grants: {
        findFirst: vi.fn(async () =>
          "grantLookup" in options ? options.grantLookup : { id: "grant-1", orgId: "org-1" },
        ),
      },
      programs: {
        findFirst: vi.fn(async () =>
          "programLookup" in options ? options.programLookup : { id: "program-1", orgId: "org-1" },
        ),
      },
      grantImpactMetrics: {
        findFirst: vi.fn(async () =>
          "metricLookup" in options ? options.metricLookup : { id: "metric-1", orgId: "org-1" },
        ),
      },
    },
    transaction: vi.fn(async (callback) =>
      callback({
        insert: vi.fn((table) => ({
          values: vi.fn(() => ({
            returning: vi.fn(async () =>
              table?.[Symbol.for("drizzle:Name")] === "outcome_indicators"
                ? (options.insertedIndicators ?? [indicatorRow()])
                : (options.insertedOutcomes ?? [outcomeRow()]),
            ),
          })),
        })),
      }),
    ),
  };
}

describe("outcome service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps indicator progress from the latest non-deleted linked metric entry", () => {
    const response = toOutcomeResponse(
      outcomeRow({
        indicators: [
          indicatorRow({
            impactMetric: {
              id: "metric-1",
              entries: [
                { value: "40", periodEnd: new Date("2026-01-31"), deletedAt: null },
                { value: "130", periodEnd: new Date("2026-06-30"), deletedAt: null },
                { value: "500", periodEnd: new Date("2026-07-31"), deletedAt: new Date() },
              ],
            },
          }),
        ],
      }),
    );

    expect(response.indicators[0]).toMatchObject({
      id: "indicator-1",
      actualValue: 130,
      progressPercent: 104,
      status: "on_track",
      latestEntry: { value: 130, periodEnd: "2026-06-30T00:00:00.000Z" },
    });
    expect(response.summary).toEqual({
      totalIndicators: 1,
      onTrack: 1,
      behind: 0,
      missing: 0,
      atRisk: false,
    });
  });

  it("classifies decrease and maintain indicators without deleted indicators", () => {
    const response = toOutcomeResponse(
      outcomeRow({
        indicators: [
          indicatorRow({
            id: "indicator-decrease",
            direction: "decrease",
            targetValue: "10",
            impactMetric: { entries: [{ value: "9", periodEnd: now, deletedAt: null }] },
          }),
          indicatorRow({
            id: "indicator-maintain",
            direction: "maintain",
            targetValue: "10",
            impactMetric: { entries: [{ value: "11", periodEnd: now, deletedAt: null }] },
          }),
          indicatorRow({
            id: "indicator-increase",
            targetValue: "10",
            impactMetric: { entries: [{ value: "9", periodEnd: now, deletedAt: null }] },
          }),
          indicatorRow({ id: "deleted-indicator", deletedAt: now }),
        ],
      }),
    );

    expect(response.indicators.map((indicator) => indicator.status)).toEqual([
      "on_track",
      "behind",
      "behind",
    ]);
    expect(response.summary).toMatchObject({ totalIndicators: 3, onTrack: 1, behind: 2 });
  });

  it("handles exact maintain targets and invalid numeric values", () => {
    const response = toOutcomeResponse(
      outcomeRow({
        indicators: [
          indicatorRow({
            id: "indicator-maintain",
            direction: "maintain",
            targetValue: "10",
            baselineValue: 7,
            impactMetric: { entries: [{ value: 10, periodEnd: now, deletedAt: null }] },
          }),
          indicatorRow({
            id: "indicator-invalid",
            targetValue: "not-a-number",
            impactMetric: { entries: [{ value: "also-bad", periodEnd: now, deletedAt: null }] },
          }),
        ],
      }),
    );

    expect(response.indicators[0]).toMatchObject({
      baselineValue: 7,
      actualValue: 10,
      status: "on_track",
    });
    expect(response.indicators[1]).toMatchObject({
      actualValue: null,
      targetValue: null,
      progressPercent: null,
      status: "missing",
    });
  });

  it("maps an outcome with no indicator relation to an empty summary", () => {
    const response = toOutcomeResponse(outcomeRow({ indicators: undefined }));

    expect(response.indicators).toEqual([]);
    expect(response.summary).toEqual({
      totalIndicators: 0,
      onTrack: 0,
      behind: 0,
      missing: 0,
      atRisk: false,
    });
  });

  it("treats missing target or entry data as missing instead of inventing progress", () => {
    const response = toOutcomeResponse(
      outcomeRow({
        indicators: [
          indicatorRow({ targetValue: null, impactMetric: { entries: [] } }),
          indicatorRow({ id: "indicator-2", targetValue: "10", impactMetric: null }),
        ],
      }),
    );

    expect(response.indicators.map((indicator) => indicator.status)).toEqual([
      "missing",
      "missing",
    ]);
    expect(response.summary.missing).toBe(2);
  });

  it("lists org-scoped outcomes with optional filters", async () => {
    const db = buildDb({ outcomes: [outcomeRow({ indicators: [indicatorRow()] })] });

    const outcomes = await listOutcomes(db as never, {
      orgId: "org-1",
      query: { status: "active", programId: "program-1", page: 1, pageSize: 25 },
    });

    expect(outcomes.data).toHaveLength(1);
    expect(outcomes.data[0]!.summary.onTrack).toBe(1);
    expect(db.query.outcomeGoals.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 26,
        orderBy: expect.any(Array),
        offset: 0,
        with: expect.objectContaining({
          indicators: expect.objectContaining({
            with: expect.objectContaining({
              impactMetric: expect.objectContaining({
                with: expect.objectContaining({
                  entries: expect.objectContaining({ limit: 1 }),
                }),
              }),
            }),
          }),
        }),
      }),
    );
  });

  it("lists outcomes without optional filters", async () => {
    const db = buildDb({ outcomes: [] });

    await expect(
      listOutcomes(db as never, {
        orgId: "org-1",
        query: { page: 1, pageSize: 25 },
      }),
    ).resolves.toEqual({
      data: [],
      pagination: { page: 1, pageSize: 25, hasNextPage: false },
    });
  });

  it("applies page offsets when listing outcomes", async () => {
    const db = buildDb({ outcomes: [] });

    await listOutcomes(db as never, {
      orgId: "org-1",
      query: { page: 3, pageSize: 10 },
    });

    expect(db.query.outcomeGoals.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 11, offset: 20 }),
    );
  });

  it("returns page metadata and trims the extra row used for has next page", async () => {
    const db = buildDb({
      outcomes: [
        outcomeRow({ id: "outcome-1" }),
        outcomeRow({ id: "outcome-2" }),
        outcomeRow({ id: "outcome-3" }),
      ],
    });

    const result = await listOutcomes(db as never, {
      orgId: "org-1",
      query: { page: 2, pageSize: 2 },
    });

    expect(result.data.map((outcome) => outcome.id)).toEqual(["outcome-1", "outcome-2"]);
    expect(result.pagination).toEqual({ page: 2, pageSize: 2, hasNextPage: true });
  });

  it("creates an outcome after verifying optional program and grant ownership", async () => {
    const db = buildDb({ insertedOutcomes: [outcomeRow({ id: "created-outcome" })] });

    await expect(
      createOutcome(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        data: {
          name: "Stable housing",
          statement: "Families stay housed.",
          programId: "123e4567-e89b-12d3-a456-426614174000",
          grantId: "123e4567-e89b-12d3-a456-426614174001",
          startDate: "2026-01-01T00:00:00.000Z",
          endDate: "2026-12-31T00:00:00.000Z",
        },
      }),
    ).resolves.toMatchObject({ id: "created-outcome" });
    expect(db.query.programs.findFirst).toHaveBeenCalledOnce();
    expect(db.query.grants.findFirst).toHaveBeenCalledOnce();
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        action: "created",
        entityType: "outcome_goal",
        entityId: "created-outcome",
        entityLabel: "Families keep stable housing",
      }),
    );
  });

  it("fails outcome creation when the insert returns no row", async () => {
    const db = buildDb({ insertedOutcomes: [] });

    await expect(
      createOutcome(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        data: {
          name: "Stable housing",
          statement: "Families stay housed.",
        },
      }),
    ).rejects.toMatchObject({ status: 500 });
  });

  it("rejects outcome links to records outside the org", async () => {
    const db = buildDb({ programLookup: null, grantLookup: null });

    await expect(
      createOutcome(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        data: {
          name: "Stable housing",
          statement: "Families stay housed.",
          programId: "123e4567-e89b-12d3-a456-426614174000",
        },
      }),
    ).rejects.toMatchObject({ status: 404 });

    await expect(
      createOutcome(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        data: {
          name: "Stable housing",
          statement: "Families stay housed.",
          grantId: "123e4567-e89b-12d3-a456-426614174001",
        },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("records indicator creation activity", async () => {
    const db = buildDb({ insertedIndicators: [indicatorRow({ id: "created-indicator" })] });

    await expect(
      createOutcomeIndicator(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        outcomeId: "outcome-1",
        data: {
          name: "Households housed",
          indicatorType: "outcome",
          targetValue: 125,
          funderDefined: true,
        },
      }),
    ).resolves.toMatchObject({ id: "created-indicator" });

    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        action: "created",
        entityType: "outcome_indicator",
        entityId: "created-indicator",
        entityLabel: "Households housed",
      }),
    );
  });

  it("verifies linked impact metric ownership before creating an indicator", async () => {
    const db = buildDb({ insertedIndicators: [indicatorRow({ id: "created-indicator" })] });

    await expect(
      createOutcomeIndicator(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        outcomeId: "outcome-1",
        data: {
          name: "Households housed",
          indicatorType: "outcome",
          impactMetricId: "123e4567-e89b-12d3-a456-426614174000",
        },
      }),
    ).resolves.toMatchObject({ id: "created-indicator" });
    expect(db.query.grantImpactMetrics.findFirst).toHaveBeenCalledOnce();
  });

  it("fails indicator creation when the insert returns no row", async () => {
    const db = buildDb({ insertedIndicators: [] });

    await expect(
      createOutcomeIndicator(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        outcomeId: "outcome-1",
        data: {
          name: "Households housed",
          indicatorType: "outcome",
        },
      }),
    ).rejects.toMatchObject({ status: 500 });
  });

  it("rejects indicator links to impact metrics outside the org", async () => {
    const db = buildDb({ metricLookup: null });

    await expect(
      createOutcomeIndicator(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        outcomeId: "outcome-1",
        data: {
          name: "Households housed",
          indicatorType: "outcome",
          impactMetricId: "123e4567-e89b-12d3-a456-426614174000",
        },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects indicators for outcomes outside the org", async () => {
    const db = buildDb({ outcomeLookup: null });

    await expect(
      createOutcomeIndicator(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        outcomeId: "outcome-1",
        data: {
          name: "Households housed",
          indicatorType: "outcome",
        },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
