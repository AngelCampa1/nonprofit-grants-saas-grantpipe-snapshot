import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { deliverReportReadyEffects, dispatchPendingReportReadyEffects } from "./ready-effects";

const { analyticsCapture, captureBackgroundException } = vi.hoisted(() => ({
  analyticsCapture: vi.fn(),
  captureBackgroundException: vi.fn(),
}));

vi.mock("../../lib/integrations", () => ({
  getIntegrations: vi.fn(() => ({ analytics: { capture: analyticsCapture } })),
}));

vi.mock("../../lib/sentry", () => ({ captureBackgroundException }));

type ReadyReport = {
  id: string;
  orgId: string;
  generatedBy: string;
  type: string;
  status: string;
  metadata: Record<string, unknown>;
  readyEffectsStatus: string | null;
  readyEffectsClaimedAt: Date | null;
  readyEffectsAnalyticsDeliveredAt: Date | null;
  readyEffectsTrialTier: string | null;
  readyEffectsTrialUsageRecordedAt: Date | null;
  readyEffectsAttemptCount: number;
  readyEffectsLastAttemptedAt: Date | null;
  createdAt: Date;
};

function makeReport(overrides: Partial<ReadyReport> = {}): ReadyReport {
  return {
    id: "report-1",
    orgId: "org-1",
    generatedBy: "user-1",
    type: "custom_report",
    status: "ready",
    metadata: { reportBuilder: { totalRows: 11 } },
    readyEffectsStatus: "pending",
    readyEffectsClaimedAt: null,
    readyEffectsAnalyticsDeliveredAt: null,
    readyEffectsTrialTier: null,
    readyEffectsTrialUsageRecordedAt: null,
    readyEffectsAttemptCount: 0,
    readyEffectsLastAttemptedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function findReportId(
  value: unknown,
  reportIds: Set<string>,
  seen = new WeakSet<object>(),
): string {
  if (typeof value === "string" && reportIds.has(value)) return value;
  if (!value || typeof value !== "object" || seen.has(value)) return "";
  seen.add(value);
  for (const child of Object.values(value)) {
    const id = findReportId(child, reportIds, seen);
    if (id) return id;
  }
  return "";
}

function makeDispatchDb(reports: ReadyReport[], getQueryNow: () => Date) {
  const reportIds = new Set(reports.map((report) => report.id));
  const update = vi.fn(() => ({
    set: vi.fn((values: Partial<ReadyReport>) => ({
      where: vi.fn((where: unknown) => {
        const report = reports.find((candidate) => candidate.id === findReportId(where, reportIds));
        let rows: ReadyReport[] = [];
        if (
          report &&
          values.readyEffectsStatus === "sending" &&
          report.readyEffectsStatus === "pending"
        ) {
          const persistedValues = { ...values };
          delete persistedValues.readyEffectsAttemptCount;
          Object.assign(report, persistedValues);
          if ("readyEffectsAttemptCount" in values) report.readyEffectsAttemptCount += 1;
          rows = [{ ...report }];
        } else if (report && values.readyEffectsAnalyticsDeliveredAt) {
          Object.assign(report, values);
        } else if (report && values.readyEffectsStatus === "pending") {
          Object.assign(report, values);
        }
        return Object.assign(Promise.resolve(rows), {
          returning: vi.fn(async () => rows),
        });
      }),
    })),
  }));
  return {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue(undefined) })),
    })),
    update,
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({ update })),
    query: {
      generatedReports: {
        findMany: vi.fn(async () => {
          const retryBefore = getQueryNow().getTime() - 60 * 60_000;
          return reports
            .filter(
              (report) =>
                report.status === "ready" &&
                !report.readyEffectsAnalyticsDeliveredAt &&
                (!report.readyEffectsLastAttemptedAt ||
                  report.readyEffectsLastAttemptedAt.getTime() < retryBefore),
            )
            .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
            .slice(0, 50)
            .map((report) => ({ ...report }));
        }),
      },
    },
  };
}

function makeDb(report: ReadyReport, options: { markTrial?: boolean } = {}) {
  let trialUseCount = 0;
  const activityIds = new Set<string>();
  const update = vi.fn(() => ({
    set: vi.fn((values: Partial<ReadyReport>) => ({
      where: vi.fn(() => {
        let rows: ReadyReport[] = [];
        if (values.readyEffectsStatus === "sending") {
          const attemptedAt =
            values.readyEffectsLastAttemptedAt ?? values.readyEffectsClaimedAt ?? new Date(0);
          const retryEligible =
            !report.readyEffectsLastAttemptedAt ||
            attemptedAt.getTime() - report.readyEffectsLastAttemptedAt.getTime() >= 60 * 60_000;
          if (report.readyEffectsStatus === "pending" && retryEligible) {
            Object.assign(report, values);
            rows = [{ ...report }];
          }
        } else if (values.readyEffectsTrialUsageRecordedAt) {
          if (options.markTrial !== false && !report.readyEffectsTrialUsageRecordedAt) {
            Object.assign(report, values);
            rows = [{ ...report }];
          }
        } else if (values.readyEffectsAnalyticsDeliveredAt) {
          Object.assign(report, values);
        } else if (values.readyEffectsStatus === "pending") {
          Object.assign(report, values);
        }
        return Object.assign(Promise.resolve(rows), {
          returning: vi.fn(async () => rows),
        });
      }),
    })),
  }));
  const db = {
    update,
    insert: vi.fn(() => ({
      values: vi.fn((values: Record<string, unknown>) => ({
        onConflictDoNothing: vi.fn(async () => {
          if (typeof values.id === "string") activityIds.add(values.id);
        }),
        onConflictDoUpdate: vi.fn(async () => {
          trialUseCount += 1;
        }),
      })),
    })),
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(db)),
    query: {
      generatedReports: {
        findFirst: vi.fn(async () => ({ ...report })),
        findMany: vi.fn(async () =>
          report.readyEffectsAnalyticsDeliveredAt ? [] : [{ ...report }],
        ),
      },
    },
  };
  return {
    db,
    getTrialUseCount: () => trialUseCount,
    getActivityIds: () => [...activityIds],
  };
}

const env = {
  R2: {} as never,
  APP_URL: "https://app.test",
  INTEGRATION_MODE: "mock" as const,
};

describe("durable report ready effects", () => {
  beforeEach(() => {
    analyticsCapture.mockReset();
    analyticsCapture.mockResolvedValue({ id: "event-1" });
    captureBackgroundException.mockReset();
  });

  it("allows only one overlapping worker to emit the canonical event", async () => {
    let releaseAnalytics!: () => void;
    analyticsCapture.mockImplementationOnce(
      () =>
        new Promise<{ id: string }>((resolve) => (releaseAnalytics = () => resolve({ id: "1" }))),
    );
    const report = makeReport();
    const { db } = makeDb(report);
    const first = deliverReportReadyEffects(db as never, env, report.id);
    await vi.waitFor(() => expect(analyticsCapture).toHaveBeenCalledOnce());

    await expect(deliverReportReadyEffects(db as never, env, report.id)).resolves.toBe(false);
    releaseAnalytics();
    await expect(first).resolves.toBe(true);

    expect(analyticsCapture).toHaveBeenCalledOnce();
  });

  it("records trial usage once even when analytics fails and is replayed", async () => {
    analyticsCapture
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce({ id: "event-2" });
    const report = makeReport({
      type: "restricted_rollforward",
      metadata: {
        includeEvidencePackage: false,
        fundId: "fund-1",
        grantId: null,
      },
      readyEffectsTrialTier: "growth",
    });
    const { db, getTrialUseCount } = makeDb(report);

    const firstAttemptAt = new Date("2026-01-02T00:00:00.000Z");
    await expect(
      deliverReportReadyEffects(db as never, env, report.id, firstAttemptAt),
    ).resolves.toBe(false);
    await expect(
      deliverReportReadyEffects(
        db as never,
        env,
        report.id,
        new Date(firstAttemptAt.getTime() + 60 * 60_000 + 1),
      ),
    ).resolves.toBe(true);

    expect(getTrialUseCount()).toBe(1);
    expect(analyticsCapture).toHaveBeenCalledTimes(2);
    const insertIds = analyticsCapture.mock.calls.map(
      ([request]) => (request.payload as Record<string, unknown>).$insert_id,
    );
    expect(new Set(insertIds)).toEqual(new Set(["report-1:ready"]));
    for (const [request] of analyticsCapture.mock.calls) {
      expect(request).toEqual({
        orgId: "org-1",
        eventName: "restricted_rollforward_generated",
        payload: {
          $insert_id: "report-1:ready",
          actorId: "user-1",
          report_type: "restricted_rollforward",
          entity_type: "restricted_rollforward",
          include_evidence_package: false,
          has_fund: true,
          has_grant: false,
        },
      });
    }
    expect(report.readyEffectsStatus).toBe("delivered");
  });

  it("does not hammer a failed ready effect before its retry backoff expires", async () => {
    analyticsCapture.mockRejectedValueOnce(new Error("provider unavailable"));
    const report = makeReport();
    const { db } = makeDb(report);
    const firstAttemptAt = new Date("2026-01-02T00:00:00.000Z");

    await expect(
      deliverReportReadyEffects(db as never, env, report.id, firstAttemptAt),
    ).resolves.toBe(false);
    await expect(
      deliverReportReadyEffects(
        db as never,
        env,
        report.id,
        new Date(firstAttemptAt.getTime() + 5 * 60_000),
      ),
    ).resolves.toBe(false);

    expect(analyticsCapture).toHaveBeenCalledOnce();
  });

  it("keeps the custom report event contract separate from rollforward dimensions", async () => {
    const report = makeReport({
      generatedBy: "user-custom",
      metadata: {
        fundId: "fund-that-must-not-leak",
        grantId: "grant-that-must-not-leak",
        reportBuilder: { totalRows: 11 },
      },
    });
    const { db } = makeDb(report);

    await expect(deliverReportReadyEffects(db as never, env, report.id)).resolves.toBe(true);

    expect(analyticsCapture).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: "report_generated",
      payload: {
        $insert_id: "report-1:ready",
        report_type: "custom_report",
        surface: "report_builder",
        file_format: "csv",
        operation: "export",
        total_rows_bucket: "10_25",
      },
    });
  });

  it("durably emits the canonical and recovered compliance effects once", async () => {
    const report = makeReport({
      type: "sefa",
      metadata: { recoveredFromPending: true },
    });
    const { db, getActivityIds } = makeDb(report);

    await expect(deliverReportReadyEffects(db as never, env, report.id)).resolves.toBe(true);
    await expect(deliverReportReadyEffects(db as never, env, report.id)).resolves.toBe(false);

    expect(getActivityIds()).toEqual(["report-ready:report-1"]);
    expect(analyticsCapture.mock.calls).toEqual([
      [
        {
          orgId: "org-1",
          eventName: "report_generated",
          payload: {
            $insert_id: "report-1:ready",
            actorId: "user-1",
            report_type: "sefa",
          },
        },
      ],
      [
        {
          orgId: "org-1",
          eventName: "first_report_generated",
          payload: {
            $insert_id: "report-1:first-ready",
            actorId: "user-1",
            report_type: "sefa",
          },
        },
      ],
      [
        {
          orgId: "org-1",
          eventName: "report_export_recovered",
          payload: {
            $insert_id: "report-1:recovered",
            report_type: "sefa",
          },
        },
      ],
    ]);
  });

  it("selects the first successful report without letting failed or pending rows suppress it", async () => {
    const report = makeReport({ type: "sefa" });
    const { db } = makeDb(report);

    await expect(deliverReportReadyEffects(db as never, env, report.id)).resolves.toBe(true);

    const findFirstMock = db.query.generatedReports.findFirst as unknown as {
      mock: { calls: Array<[{ where: Parameters<PgDialect["sqlToQuery"]>[0] }]> };
    };
    const firstWhere = new PgDialect().sqlToQuery(findFirstMock.mock.calls[0]![0].where);
    expect(firstWhere?.sql).toContain('"generated_reports"."status"');
    expect(firstWhere?.params).toContain("ready");
    expect(analyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "first_report_generated" }),
    );
  });

  it.each(["custom_report", "restricted_rollforward"])(
    "durably emits recovered export telemetry for %s without a one-shot caller capture",
    async (type) => {
      const report = makeReport({
        type,
        metadata: {
          recoveredFromPending: true,
          reportBuilder: { totalRows: 2 },
          includeEvidencePackage: false,
        },
      });
      const { db } = makeDb(report);

      await expect(deliverReportReadyEffects(db as never, env, report.id)).resolves.toBe(true);

      expect(analyticsCapture).toHaveBeenCalledWith({
        orgId: "org-1",
        eventName: "report_export_recovered",
        payload: {
          $insert_id: "report-1:recovered",
          report_type: type,
        },
      });
    },
  );

  it("replays a failed recovered-export effect with the same deterministic insert id", async () => {
    analyticsCapture
      .mockResolvedValueOnce({ id: "canonical-1" })
      .mockRejectedValueOnce(new Error("recovered event response lost"))
      .mockResolvedValueOnce({ id: "canonical-2" })
      .mockResolvedValueOnce({ id: "recovered-2" });
    const report = makeReport({
      metadata: {
        recoveredFromPending: true,
        reportBuilder: { totalRows: 2 },
      },
    });
    const { db } = makeDb(report);
    const firstAttemptAt = new Date("2026-01-02T00:00:00.000Z");

    await expect(
      deliverReportReadyEffects(db as never, env, report.id, firstAttemptAt),
    ).resolves.toBe(false);
    await expect(
      deliverReportReadyEffects(
        db as never,
        env,
        report.id,
        new Date(firstAttemptAt.getTime() + 60 * 60_000 + 1),
      ),
    ).resolves.toBe(true);

    const recoveredCalls = analyticsCapture.mock.calls.filter(
      ([request]) => request.eventName === "report_export_recovered",
    );
    expect(recoveredCalls).toHaveLength(2);
    expect(recoveredCalls.map(([request]) => request.payload.$insert_id)).toEqual([
      "report-1:recovered",
      "report-1:recovered",
    ]);
  });

  it("dispatches ready rows left behind after the ready transition", async () => {
    const report = makeReport();
    const { db } = makeDb(report);

    await expect(dispatchPendingReportReadyEffects(db as never, env)).resolves.toBe(1);
    await expect(dispatchPendingReportReadyEffects(db as never, env)).resolves.toBe(0);

    expect(analyticsCapture).toHaveBeenCalledOnce();
  });

  it("backs off 50 poison rows so a newer ready report is not starved", async () => {
    let queryNow = new Date("2026-01-02T00:00:00.000Z");
    const reports = Array.from({ length: 50 }, (_, index) =>
      makeReport({
        id: `poison-${index}`,
        createdAt: new Date(`2026-01-01T00:${String(index).padStart(2, "0")}:00.000Z`),
      }),
    );
    reports.push(makeReport({ id: "new-report", createdAt: new Date("2026-01-01T01:00:00.000Z") }));
    const db = makeDispatchDb(reports, () => queryNow);
    analyticsCapture.mockImplementation(async ({ payload }) => {
      if ((payload as { $insert_id: string }).$insert_id.startsWith("poison-")) {
        throw new Error("poison event");
      }
      return { id: "delivered" };
    });

    await expect(dispatchPendingReportReadyEffects(db as never, env, queryNow)).resolves.toBe(0);
    queryNow = new Date(queryNow.getTime() + 5 * 60_000);
    await expect(dispatchPendingReportReadyEffects(db as never, env, queryNow)).resolves.toBe(1);

    expect(analyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ $insert_id: "new-report:ready" }),
      }),
    );
    expect(reports.slice(0, 50).every((report) => report.readyEffectsAttemptCount === 1)).toBe(
      true,
    );
  });

  it("dispatches ready effects with bounded concurrency", async () => {
    const queryNow = new Date("2026-01-02T00:00:00.000Z");
    const reports = Array.from({ length: 12 }, (_, index) =>
      makeReport({ id: `report-${index}`, createdAt: new Date(2026, 0, 1, 0, index) }),
    );
    const db = makeDispatchDb(reports, () => queryNow);
    let active = 0;
    let maxActive = 0;
    analyticsCapture.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { id: "delivered" };
    });

    await expect(dispatchPendingReportReadyEffects(db as never, env, queryNow)).resolves.toBe(12);

    expect(maxActive).toBeGreaterThan(1);
    expect(maxActive).toBeLessThanOrEqual(5);
  });

  it.each([
    [undefined, "unknown"],
    [Number.NaN, "unknown"],
    [0, "0"],
    [10, "1_10"],
    [25, "10_25"],
    [100, "25_100"],
    [101, "100_plus"],
  ])("emits the safe row-count bucket for %s", async (totalRows, expected) => {
    const report = makeReport({ metadata: { reportBuilder: { totalRows } } });
    const { db } = makeDb(report);

    await expect(deliverReportReadyEffects(db as never, env, report.id)).resolves.toBe(true);

    expect(analyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ total_rows_bucket: expected }),
      }),
    );
  });

  it("handles malformed legacy metadata and an untracked trial tier", async () => {
    const report = makeReport({
      metadata: null as never,
      readyEffectsTrialTier: "starter",
    });
    const { db, getTrialUseCount } = makeDb(report);

    await expect(deliverReportReadyEffects(db as never, env, report.id)).resolves.toBe(true);

    expect(getTrialUseCount()).toBe(0);
    expect(analyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ total_rows_bucket: "unknown" }),
      }),
    );
  });

  it("skips trial usage when another transaction already marked it", async () => {
    const report = makeReport({
      type: "restricted_rollforward",
      metadata: { includeEvidencePackage: true },
      readyEffectsTrialTier: "audit_ready",
      readyEffectsTrialUsageRecordedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const { db, getTrialUseCount } = makeDb(report);

    await expect(deliverReportReadyEffects(db as never, env, report.id)).resolves.toBe(true);

    expect(getTrialUseCount()).toBe(0);
    expect(analyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ include_evidence_package: true }),
      }),
    );
  });

  it("does not increment trial usage when the transactional marker loses its race", async () => {
    const report = makeReport({
      type: "restricted_rollforward",
      metadata: {},
      readyEffectsTrialTier: "growth",
    });
    const { db, getTrialUseCount } = makeDb(report, { markTrial: false });

    await expect(deliverReportReadyEffects(db as never, env, report.id)).resolves.toBe(true);

    expect(getTrialUseCount()).toBe(0);
  });

  it("reports claim failures without failing a completed report request", async () => {
    const db = {
      update: vi.fn(() => {
        throw new Error("db unavailable");
      }),
    };

    await expect(deliverReportReadyEffects(db as never, env, "report-1")).resolves.toBe(false);

    expect(captureBackgroundException).toHaveBeenCalledWith(
      expect.any(Error),
      "report_ready_effects",
      { operation: "claim_or_persist" },
    );
  });

  it("treats a database adapter without report queries as an empty dispatch", async () => {
    await expect(dispatchPendingReportReadyEffects({ query: {} } as never, env)).resolves.toBe(0);
  });
});
