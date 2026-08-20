import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isRecoverableComplianceReportType,
  recoverPendingComplianceArtifacts,
} from "./recovery.service";

const {
  mockAnalyticsCapture,
  mockCaptureBackgroundException,
  mockDeliverReportReadyEffects,
  mockStorageDelete,
  mockStorageGet,
} = vi.hoisted(() => ({
  mockAnalyticsCapture: vi.fn().mockResolvedValue({ id: "event-1" }),
  mockCaptureBackgroundException: vi.fn(),
  mockDeliverReportReadyEffects: vi.fn().mockResolvedValue(true),
  mockStorageDelete: vi.fn().mockResolvedValue(undefined),
  mockStorageGet: vi.fn(),
}));

vi.mock("../../lib/integrations", () => ({
  getIntegrations: vi.fn(() => ({
    analytics: { capture: mockAnalyticsCapture },
    storage: {
      delete: mockStorageDelete,
      get: mockStorageGet,
    },
  })),
}));

vi.mock("../../lib/sentry", () => ({
  captureBackgroundException: mockCaptureBackgroundException,
}));

vi.mock("../report-builder/ready-effects", () => ({
  deliverReportReadyEffects: mockDeliverReportReadyEffects,
}));

type RecoveryRow = {
  id: string;
  orgId: string;
  type: string;
  status: string;
  fileKey: string;
  recoveryAttemptedAt: Date | null;
  artifactCleanupCompleted: boolean;
  artifactCleanupClaimed: boolean;
  createdAt: Date;
};

function row(overrides: Partial<RecoveryRow> = {}): RecoveryRow {
  return {
    id: "report-1",
    orgId: "org-1",
    type: "compliance",
    status: "pending",
    fileKey: "org-1/compliance/report-1/report.pdf",
    recoveryAttemptedAt: null,
    artifactCleanupCompleted: false,
    artifactCleanupClaimed: false,
    createdAt: new Date("2026-07-11T18:00:00.000Z"),
    ...overrides,
  };
}

function makeDb(
  rows: RecoveryRow[],
  options: {
    throwReadyOnce?: boolean;
    throwRecoveryStamp?: boolean;
    markReadyBeforeCleanupClaim?: boolean;
    markReadyBeforeSpecializedFailure?: boolean;
  } = {},
) {
  let throwReady = options.throwReadyOnce === true;
  const findMany = vi.fn(async () =>
    rows.filter(
      (candidate) =>
        candidate.status === "pending" ||
        (candidate.status === "failed" && !candidate.artifactCleanupCompleted),
    ),
  );
  const update = vi.fn(() => ({
    set: vi.fn((values: { status?: string; recoveryAttemptedAt?: Date; metadata?: unknown }) => ({
      where: vi.fn(() => ({
        returning: vi.fn(async () => {
          if (options.markReadyBeforeSpecializedFailure && values.status === "failed") {
            rows[0]!.status = "ready";
          }
          if (values.recoveryAttemptedAt && !values.status && options.throwRecoveryStamp) {
            throw new Error("Postgres backoff unavailable");
          }
          if (
            options.markReadyBeforeCleanupClaim &&
            values.recoveryAttemptedAt &&
            !values.metadata
          ) {
            rows[0]!.status = "ready";
          }
          const candidate = rows.find((item) =>
            values.status === "ready"
              ? item.status === "pending" && item.recoveryAttemptedAt === null
              : values.status === "failed"
                ? item.status === "pending"
                : values.metadata
                  ? item.status === "failed" &&
                    !item.artifactCleanupCompleted &&
                    item.artifactCleanupClaimed
                  : item.status !== "ready",
          );
          if (!candidate) return [];
          if (values.status === "ready" && throwReady) {
            throwReady = false;
            throw new Error("Postgres response unavailable");
          }
          if (values.status) candidate.status = values.status;
          if (values.recoveryAttemptedAt) {
            candidate.recoveryAttemptedAt = values.recoveryAttemptedAt;
          }
          if (values.recoveryAttemptedAt && !values.metadata && candidate.status === "failed") {
            candidate.artifactCleanupClaimed = true;
          }
          if (values.metadata && !values.status) candidate.artifactCleanupCompleted = true;
          return [{ id: candidate.id }];
        }),
      })),
    })),
  }));
  return {
    db: { query: { generatedReports: { findMany } }, update } as never,
    findMany,
    update,
  };
}

beforeEach(() => {
  mockAnalyticsCapture.mockReset();
  mockAnalyticsCapture.mockResolvedValue({ id: "event-1" });
  mockCaptureBackgroundException.mockReset();
  mockDeliverReportReadyEffects.mockReset();
  mockDeliverReportReadyEffects.mockResolvedValue(true);
  mockStorageDelete.mockReset();
  mockStorageDelete.mockResolvedValue(undefined);
  mockStorageGet.mockReset();
});

describe("recoverPendingComplianceArtifacts", () => {
  it("excludes reports whose domain side effects cannot be reconstructed from the artifact", () => {
    expect(isRecoverableComplianceReportType("acknowledgment")).toBe(false);
    expect(isRecoverableComplianceReportType("donor_year_end_statement")).toBe(false);
    expect(isRecoverableComplianceReportType("donor_year_end")).toBe(false);
  });

  it.each(["acknowledgment", "donor_year_end_statement"])(
    "fails and cleans a stale stored %s artifact after a crash before its domain effects",
    async (type) => {
      const rows = [
        row({
          type,
          createdAt: new Date("2026-07-10T18:00:00.000Z"),
        }),
      ];
      const { db } = makeDb(rows);
      mockStorageGet.mockResolvedValue({ body: "stored" });

      await expect(
        recoverPendingComplianceArtifacts(db, {} as never, new Date("2026-07-12T20:00:00.000Z")),
      ).resolves.toBe(1);

      expect(rows[0]?.status).toBe("failed");
      expect(rows[0]?.artifactCleanupCompleted).toBe(true);
      expect(mockStorageGet).not.toHaveBeenCalled();
      expect(mockStorageDelete).toHaveBeenCalledWith(rows[0]!.fileKey);
      expect(mockDeliverReportReadyEffects).not.toHaveBeenCalled();
    },
  );

  it("preserves a specialized artifact when the original request marks it ready first", async () => {
    const rows = [
      row({
        type: "acknowledgment",
        createdAt: new Date("2026-07-10T18:00:00.000Z"),
      }),
    ];
    const { db } = makeDb(rows, { markReadyBeforeSpecializedFailure: true });

    await expect(
      recoverPendingComplianceArtifacts(db, {} as never, new Date("2026-07-12T20:00:00.000Z")),
    ).resolves.toBe(0);

    expect(rows[0]?.status).toBe("ready");
    expect(mockStorageDelete).not.toHaveBeenCalled();
  });

  it("lets only one overlapping worker fail and clean a stale specialized artifact", async () => {
    const rows = [
      row({
        type: "donor_year_end_statement",
        createdAt: new Date("2026-07-10T18:00:00.000Z"),
      }),
    ];
    const { db, findMany } = makeDb(rows);
    findMany.mockImplementation(async () => [{ ...rows[0]! }]);
    const now = new Date("2026-07-12T20:00:00.000Z");

    const counts = await Promise.all([
      recoverPendingComplianceArtifacts(db, {} as never, now),
      recoverPendingComplianceArtifacts(db, {} as never, now),
    ]);

    expect(counts[0]! + counts[1]!).toBe(1);
    expect(mockStorageDelete).toHaveBeenCalledTimes(1);
    expect(rows[0]?.artifactCleanupCompleted).toBe(true);
  });

  it("leaves a recent specialized pending artifact for its original request", async () => {
    const rows = [
      row({
        type: "acknowledgment",
        createdAt: new Date("2026-07-12T19:30:00.000Z"),
      }),
    ];
    const { db, findMany } = makeDb(rows);
    findMany.mockImplementation(async () => [{ ...rows[0]! }]);

    await expect(
      recoverPendingComplianceArtifacts(db, {} as never, new Date("2026-07-12T20:00:00.000Z")),
    ).resolves.toBe(0);

    expect(rows[0]?.status).toBe("pending");
    expect(mockStorageDelete).not.toHaveBeenCalled();
  });

  it("backs off specialized cleanup failures without exposing artifact identity", async () => {
    const rows = [
      row({
        type: "acknowledgment",
        createdAt: new Date("2026-07-10T18:00:00.000Z"),
      }),
    ];
    const { db, findMany } = makeDb(rows);
    findMany.mockImplementation(async () => [{ ...rows[0]! }]);
    const now = new Date("2026-07-12T20:00:00.000Z");
    mockStorageDelete.mockRejectedValueOnce(new Error("R2 cleanup unavailable"));

    await expect(recoverPendingComplianceArtifacts(db, {} as never, now)).resolves.toBe(0);

    expect(rows[0]).toMatchObject({ status: "failed", recoveryAttemptedAt: now });
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "R2 cleanup unavailable" }),
      "compliance_report_recovery",
      { operation: "expire_specialized_pending", report_type: "acknowledgment" },
    );
    expect(JSON.stringify(mockCaptureBackgroundException.mock.calls)).not.toContain("report-1");
  });

  it("CAS-fences a stale specialized row against its prior recovery timestamp", async () => {
    const previousAttempt = new Date("2026-07-10T17:00:00.000Z");
    const rows = [
      row({
        type: "donor_year_end_statement",
        createdAt: new Date("2026-07-09T18:00:00.000Z"),
        recoveryAttemptedAt: previousAttempt,
      }),
    ];
    const { db } = makeDb(rows);
    const now = new Date("2026-07-12T20:00:00.000Z");

    await expect(recoverPendingComplianceArtifacts(db, {} as never, now)).resolves.toBe(1);

    expect(rows[0]).toMatchObject({
      status: "failed",
      recoveryAttemptedAt: now,
      artifactCleanupCompleted: true,
    });
  });

  it("ignores failed report types outside the cleanup allowlist", async () => {
    const rows = [row({ type: "unknown_report", status: "failed" })];
    const { db } = makeDb(rows);

    await expect(
      recoverPendingComplianceArtifacts(db, {} as never, new Date("2026-07-12T20:00:00.000Z")),
    ).resolves.toBe(0);

    expect(mockStorageDelete).not.toHaveBeenCalled();
  });

  it.each(["acknowledgment", "donor_year_end_statement"])(
    "still cleans a failed %s artifact without promoting it",
    async (type) => {
      const rows = [row({ type, status: "failed" })];
      const { db } = makeDb(rows);

      await expect(
        recoverPendingComplianceArtifacts(db, {} as never, new Date("2026-07-11T20:00:00.000Z")),
      ).resolves.toBe(1);

      expect(mockStorageDelete).toHaveBeenCalledWith(rows[0]!.fileKey);
      expect(rows[0]?.status).toBe("failed");
      expect(rows[0]?.artifactCleanupCompleted).toBe(true);
    },
  );

  it("skips recovery when the generated-report query adapter is unavailable", async () => {
    await expect(
      recoverPendingComplianceArtifacts({ query: {} } as never, {} as never),
    ).resolves.toBe(0);
  });

  it("recovers generic compliance and SEFA objects without uploading duplicates", async () => {
    const rows = [
      row(),
      row({
        id: "report-sefa",
        type: "sefa",
        fileKey: "org-1/sefa/report-sefa/sefa.csv",
      }),
    ];
    const { db, findMany } = makeDb(rows);
    mockStorageGet.mockResolvedValue({ body: "stored" });

    await expect(
      recoverPendingComplianceArtifacts(db, {} as never, new Date("2026-07-11T20:00:00.000Z")),
    ).resolves.toBe(2);

    expect(rows.map((candidate) => candidate.status)).toEqual(["ready", "ready"]);
    expect(mockStorageGet).toHaveBeenCalledWith(rows[0]!.fileKey);
    expect(mockStorageGet).toHaveBeenCalledWith(rows[1]!.fileKey);
    expect(mockStorageDelete).not.toHaveBeenCalled();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 25, orderBy: expect.any(Array) }),
    );
    expect(mockDeliverReportReadyEffects).toHaveBeenCalledTimes(2);
  });

  it("retries a pending object after a database outage without creating another object or row", async () => {
    const rows = [row({ type: "sefa", fileKey: "org-1/sefa/report-1/sefa.csv" })];
    const { db } = makeDb(rows, { throwReadyOnce: true });
    mockStorageGet.mockResolvedValue({ body: "stored" });

    await expect(
      recoverPendingComplianceArtifacts(db, {} as never, new Date("2026-07-11T20:00:00.000Z")),
    ).resolves.toBe(0);
    expect(rows[0]?.status).toBe("pending");

    rows[0]!.recoveryAttemptedAt = null;
    await expect(
      recoverPendingComplianceArtifacts(db, {} as never, new Date("2026-07-11T21:01:00.000Z")),
    ).resolves.toBe(1);
    expect(rows[0]?.status).toBe("ready");
    expect(mockStorageGet).toHaveBeenCalledTimes(2);
    expect(mockStorageDelete).not.toHaveBeenCalled();
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Postgres response unavailable" }),
      "compliance_report_recovery",
      expect.objectContaining({ operation: "reconcile_pending", report_type: "sefa" }),
    );
  });

  it("lets only one overlapping worker win the pending-to-ready transition", async () => {
    const rows = [row()];
    const { db } = makeDb(rows);
    let releaseGet: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseGet = resolve;
    });
    mockStorageGet.mockImplementation(async () => {
      await gate;
      return { body: "stored" };
    });

    const now = new Date("2026-07-11T20:00:00.000Z");
    const first = recoverPendingComplianceArtifacts(db, {} as never, now);
    const second = recoverPendingComplianceArtifacts(db, {} as never, now);
    await vi.waitFor(() => expect(mockStorageGet).toHaveBeenCalledTimes(2));
    releaseGet?.();

    const counts = await Promise.all([first, second]);
    expect(counts[0]! + counts[1]!).toBe(1);
    expect(rows[0]?.status).toBe("ready");
    expect(mockDeliverReportReadyEffects).toHaveBeenCalledTimes(1);
  });

  it("marks a pending row failed when its deterministic object is absent", async () => {
    const rows = [row()];
    const now = new Date("2026-07-11T20:00:00.000Z");
    const { db } = makeDb(rows);
    mockStorageGet.mockResolvedValue(null);

    await expect(recoverPendingComplianceArtifacts(db, {} as never, now)).resolves.toBe(1);

    expect(rows[0]).toMatchObject({ status: "failed", recoveryAttemptedAt: now });
    expect(mockStorageDelete).not.toHaveBeenCalled();
    expect(mockAnalyticsCapture).not.toHaveBeenCalled();
  });

  it("cleans an ambiguous failed-row object once and records durable completion", async () => {
    const rows = [
      row({
        status: "failed",
        recoveryAttemptedAt: new Date("2026-07-11T19:00:00.000Z"),
      }),
    ];
    const now = new Date("2026-07-11T20:00:00.000Z");
    const { db } = makeDb(rows);

    await expect(recoverPendingComplianceArtifacts(db, {} as never, now)).resolves.toBe(1);

    expect(mockStorageDelete).toHaveBeenCalledWith(rows[0]!.fileKey);
    expect(rows[0]?.recoveryAttemptedAt).toEqual(now);
    expect(rows[0]?.artifactCleanupCompleted).toBe(true);

    await expect(recoverPendingComplianceArtifacts(db, {} as never, now)).resolves.toBe(0);
    expect(mockStorageDelete).toHaveBeenCalledTimes(1);
  });

  it("does not delete an artifact when the generator wins the failed-to-ready race", async () => {
    const rows = [row({ status: "failed" })];
    const { db } = makeDb(rows, { markReadyBeforeCleanupClaim: true });

    await expect(
      recoverPendingComplianceArtifacts(db, {} as never, new Date("2026-07-11T20:00:00.000Z")),
    ).resolves.toBe(0);

    expect(rows[0]?.status).toBe("ready");
    expect(mockStorageDelete).not.toHaveBeenCalled();
  });

  it("backs off an isolated row failure and continues the recovery batch", async () => {
    const rows = [row({ id: "broken" }), row({ id: "healthy", type: "sefa" })];
    const now = new Date("2026-07-11T20:00:00.000Z");
    const { db } = makeDb(rows);
    mockStorageGet
      .mockRejectedValueOnce(new Error("R2 unavailable"))
      .mockResolvedValueOnce({ body: "stored" });

    await expect(recoverPendingComplianceArtifacts(db, {} as never, now)).resolves.toBe(1);

    expect(rows[0]?.status).toBe("pending");
    expect(rows[0]?.recoveryAttemptedAt).toEqual(now);
    expect(rows[1]?.status).toBe("ready");
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "R2 unavailable" }),
      "compliance_report_recovery",
      expect.objectContaining({ operation: "reconcile_pending", report_type: "compliance" }),
    );
  });

  it("contains analytics and backoff persistence failures without exposing report identity", async () => {
    const rows = [row()];
    const { db } = makeDb(rows, { throwRecoveryStamp: true });
    mockStorageGet.mockResolvedValueOnce({ body: "stored" });
    mockDeliverReportReadyEffects.mockResolvedValueOnce(false);

    await expect(recoverPendingComplianceArtifacts(db, {} as never)).resolves.toBe(1);
    expect(mockDeliverReportReadyEffects).toHaveBeenCalledOnce();

    rows[0]!.status = "pending";
    rows[0]!.recoveryAttemptedAt = null;
    mockStorageGet.mockRejectedValueOnce(new Error("R2 unavailable"));
    await expect(recoverPendingComplianceArtifacts(db, {} as never)).resolves.toBe(0);
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Postgres backoff unavailable" }),
      "compliance_report_recovery",
      { operation: "backoff_stamp", report_type: "compliance" },
    );
    expect(JSON.stringify(mockCaptureBackgroundException.mock.calls)).not.toContain("report-1");
  });

  it("backs off a failed-row cleanup error so poison rows cannot monopolize the batch", async () => {
    const rows = [row({ status: "failed" })];
    const { db } = makeDb(rows);
    mockStorageDelete.mockRejectedValueOnce(new Error("R2 cleanup unavailable"));
    const now = new Date("2026-07-11T20:00:00.000Z");

    await expect(recoverPendingComplianceArtifacts(db, {} as never, now)).resolves.toBe(0);

    expect(rows[0]?.recoveryAttemptedAt).toEqual(now);
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "R2 cleanup unavailable" }),
      "compliance_report_recovery",
      { operation: "cleanup_failed", report_type: "compliance" },
    );
  });
});
