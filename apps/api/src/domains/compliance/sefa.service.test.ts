import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { generateSefaReport, getSefaTripwire } from "./sefa.service";

const {
  mockCaptureBackgroundException,
  mockDeliverReportReadyEffects,
  mockStorageDelete,
  mockStoragePut,
} = vi.hoisted(() => ({
  mockCaptureBackgroundException: vi.fn(),
  mockDeliverReportReadyEffects: vi.fn().mockResolvedValue(true),
  mockStorageDelete: vi.fn().mockResolvedValue(undefined),
  mockStoragePut: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/integrations", () => ({
  getIntegrations: vi.fn(() => ({
    storage: { delete: mockStorageDelete, put: mockStoragePut },
  })),
}));

vi.mock("../report-builder/ready-effects", () => ({
  deliverReportReadyEffects: mockDeliverReportReadyEffects,
}));

vi.mock("../../lib/sentry", () => ({
  captureBackgroundException: mockCaptureBackgroundException,
}));

const org = {
  id: "org-1",
  name: "GrantPipe Foundation",
  ein: "12-3456789",
  logoUrl: null,
  address: null,
  fiscalYearStartMonth: 1,
  defaultEntityId: "entity-1",
};
type OrgRecord = Omit<typeof org, "defaultEntityId"> & { defaultEntityId: string | null };

type SefaRow = {
  grantId: string;
  grantName: string;
  assistanceListingNumber: string | null;
  assistanceListingTitle: string | null;
  federalAgency: string | null;
  fain: string | null;
  passThroughEntityName: string | null;
  passThroughIdentifyingNumber: string | null;
  programName: string | null;
  clusterName: string | null;
  expendituresCents: number | string;
};

type InsertMockDb = {
  insert: {
    mock: {
      results: Array<{
        value: {
          values: {
            mock: {
              calls: Array<
                [
                  {
                    entityId: string;
                    metadata: {
                      preview: {
                        content: string;
                      };
                    };
                  },
                ]
              >;
            };
          };
        };
      }>;
    };
  };
};

type UpdateMockDb = {
  update: {
    mock: {
      results: Array<{
        value: {
          set: {
            mock: {
              calls: Array<[Record<string, unknown>]>;
            };
          };
        };
      }>;
    };
  };
};

const watchRows: SefaRow[] = [
  {
    grantId: "grant-federal-1",
    grantName: "HUD Housing Award",
    assistanceListingNumber: "14.218",
    assistanceListingTitle: null,
    federalAgency: "HUD",
    fain: "B-26-MC-11-0001",
    passThroughEntityName: "District of Columbia",
    passThroughIdentifyingNumber: null,
    programName: "Community Development Block Grant",
    clusterName: null,
    expendituresCents: 82_500_000,
  },
];

function makeSelectChain(rows: SefaRow[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(rows),
  };
  return chain;
}

function makeDb(
  rows: SefaRow[] = watchRows,
  options: {
    orgRecord?: OrgRecord | null;
    insertedRows?: unknown[];
    readyRows?: unknown[];
  } = {},
) {
  const insertedRow = {
    id: "report-1",
    type: "sefa",
    format: "csv_bundle",
    status: "pending",
    title: "FY2026 SEFA Draft",
    fileName: "sefa-fy2026.csv",
    createdAt: new Date("2026-06-26T00:00:00.000Z"),
    fiscalYear: "FY2026",
    metadata: {},
  };
  const readyRow = {
    ...insertedRow,
    status: "ready",
    metadata: { tripwire: { thresholdCents: 100_000_000 } },
  };
  let currentRow = insertedRow;
  return {
    query: {
      organizations: {
        findFirst: vi
          .fn()
          .mockResolvedValue(options.orgRecord === undefined ? org : options.orgRecord),
      },
      generatedReports: {
        findFirst: vi.fn(async () => currentRow),
      },
    },
    select: vi.fn(() => makeSelectChain(rows)),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue(options.insertedRows ?? [insertedRow]),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((payload: Record<string, unknown>) => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => {
            if (payload.status === "ready") {
              const rows = options.readyRows ?? [readyRow];
              if (rows[0]) currentRow = rows[0] as typeof insertedRow;
              return rows;
            }
            if (payload.status === "failed" && currentRow.status === "pending") {
              currentRow = { ...currentRow, status: "failed" };
              return [currentRow];
            }
            return [];
          }),
        })),
      })),
    })),
  } as never;
}

function getInsertedReportValues(db: unknown) {
  const insertResult = (db as InsertMockDb).insert.mock.results[0]!.value;
  return insertResult.values.mock.calls[0]![0];
}

function getUpdateSetCalls(db: unknown) {
  const updateResult = (db as UpdateMockDb).update.mock.results[0]!.value;
  return updateResult.set.mock.calls;
}

beforeEach(() => {
  mockCaptureBackgroundException.mockReset();
  mockStorageDelete.mockReset();
  mockStorageDelete.mockResolvedValue(undefined);
  mockStoragePut.mockReset();
  mockStoragePut.mockResolvedValue(undefined);
  mockDeliverReportReadyEffects.mockReset();
  mockDeliverReportReadyEffects.mockResolvedValue(true);
});

describe("getSefaTripwire", () => {
  it("sums federal grant expenses inside the fiscal year and ignores deleted rows", async () => {
    const db = makeDb();

    const result = await getSefaTripwire(db, {
      orgId: "org-1",
      fiscalYear: "FY2026",
      now: new Date("2026-06-30T12:00:00.000Z"),
    });

    expect(result.thresholdCents).toBe(100_000_000);
    expect(result.totalFederalExpendituresCents).toBe(82_500_000);
    expect(result.remainingToThresholdCents).toBe(17_500_000);
    expect(result.state).toBe("watch");
    expect(result.rows).toEqual([
      expect.objectContaining({
        grantId: "grant-federal-1",
        assistanceListingNumber: "14.218",
        federalAgency: "HUD",
        expendituresCents: 82_500_000,
        metadataStatus: "complete",
      }),
    ]);
  });

  it("flags crossed at one million dollars of federal expenditures", async () => {
    const db = makeDb([{ ...watchRows[0]!, expendituresCents: 100_000_000 }]);

    const result = await getSefaTripwire(db, {
      orgId: "org-1",
      fiscalYear: "FY2026",
      now: new Date("2026-12-31T12:00:00.000Z"),
    });

    expect(result.totalFederalExpendituresCents).toBeGreaterThanOrEqual(100_000_000);
    expect(result.remainingToThresholdCents).toBe(0);
    expect(result.state).toBe("crossed");
  });

  it("uses the organization's fiscal year start month for non-calendar fiscal years", async () => {
    const db = makeDb(watchRows, {
      orgRecord: { ...org, fiscalYearStartMonth: 7 },
    });

    const result = await getSefaTripwire(db, {
      orgId: "org-1",
      fiscalYear: "FY2026",
    });

    expect(result.periodStart).toBe("2025-07-01T00:00:00.000Z");
    expect(result.periodEnd).toBe("2026-06-30T23:59:59.999Z");
  });

  it("stays clear below the watch threshold", async () => {
    const db = makeDb([{ ...watchRows[0]!, expendituresCents: 25_000_000 }]);

    const result = await getSefaTripwire(db, {
      orgId: "org-1",
      fiscalYear: "FY2026",
      now: new Date("2026-02-28T12:00:00.000Z"),
    });

    expect(result.state).toBe("clear");
    expect(result.thresholdPercent).toBe(25);
  });

  it("coerces Postgres numeric aggregate strings before summing rows", async () => {
    const db = makeDb([
      { ...watchRows[0]!, grantId: "grant-federal-1", expendituresCents: "100000" },
      { ...watchRows[0]!, grantId: "grant-federal-2", expendituresCents: "25000" },
    ]);

    const result = await getSefaTripwire(db, {
      orgId: "org-1",
      fiscalYear: "FY2026",
    });

    expect(result.totalFederalExpendituresCents).toBe(125_000);
    expect(result.state).toBe("clear");
    expect(result.rows.map((row) => row.expendituresCents)).toEqual([100_000, 25_000]);
  });

  it("omits federal metadata rows with no expenses in the selected fiscal year", async () => {
    const db = makeDb([
      { ...watchRows[0]!, grantId: "grant-federal-current", expendituresCents: "125000" },
      { ...watchRows[0]!, grantId: "grant-federal-zero", expendituresCents: "0" },
    ]);

    const result = await getSefaTripwire(db, {
      orgId: "org-1",
      fiscalYear: "FY2026",
    });

    expect(result.totalFederalExpendituresCents).toBe(125_000);
    expect(result.rows.map((row) => row.grantId)).toEqual(["grant-federal-current"]);
  });

  it("warns when a federal award lacks SEFA metadata", async () => {
    const db = makeDb([
      {
        ...watchRows[0]!,
        grantId: "grant-federal-missing",
        assistanceListingNumber: null,
        federalAgency: null,
      },
    ]);

    const result = await getSefaTripwire(db, {
      orgId: "org-1",
      fiscalYear: "FY2026",
      now: new Date("2026-03-31T12:00:00.000Z"),
    });

    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        grantId: "grant-federal-missing",
        field: "assistanceListingNumber",
      }),
    );
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        grantId: "grant-federal-missing",
        field: "federalAgency",
      }),
    );
  });

  it("rejects fiscal years that do not include a four-digit year", async () => {
    const db = makeDb();

    await expect(
      getSefaTripwire(db, {
        orgId: "org-1",
        fiscalYear: "current",
      }),
    ).rejects.toThrow("Fiscal year must include a four-digit year");
  });

  it("throws when the organization cannot be found", async () => {
    const db = makeDb(watchRows, { orgRecord: null });

    await expect(
      getSefaTripwire(db, {
        orgId: "org-missing",
        fiscalYear: "FY2026",
      }),
    ).rejects.toThrow("Organization not found");
  });
});

describe("generateSefaReport", () => {
  it("stores a SEFA CSV bundle artifact with tripwire metadata", async () => {
    const db = makeDb();

    const result = await generateSefaReport(db, { APP_URL: "https://app.grantpipe.com" } as never, {
      orgId: "org-1",
      userId: "user-1",
      data: { fiscalYear: "FY2026", title: "FY2026 SEFA Draft" },
    });

    expect(result.type).toBe("sefa");
    expect(result.format).toBe("csv_bundle");
    expect(result.title).toBe("FY2026 SEFA Draft");
    expect(result.fileName).toBe("sefa-fy2026.csv");
    expect(result.metadata).toMatchObject({
      tripwire: {
        thresholdCents: 100_000_000,
      },
    });
  });

  it("escapes grant metadata before storing the HTML preview", async () => {
    const db = makeDb([
      {
        ...watchRows[0]!,
        grantName: "<Grant & Award>",
        federalAgency: "HUD <script>",
      },
    ]);

    await generateSefaReport(db, { APP_URL: "https://app.grantpipe.com" } as never, {
      orgId: "org-1",
      userId: "user-1",
      data: { fiscalYear: "FY2026", title: "<FY2026 SEFA>" },
    });

    const inserted = getInsertedReportValues(db);
    const preview = inserted.metadata.preview.content as string;
    expect(preview).toContain("&lt;FY2026 SEFA&gt;");
    expect(preview).toContain("&lt;Grant &amp; Award&gt;");
    expect(preview).toContain("HUD &lt;script&gt;");
    expect(preview).not.toContain("<Grant & Award>");
  });

  it("uses the grant id when warning preview rows have no grant name", async () => {
    const db = makeDb([
      {
        ...watchRows[0]!,
        grantName: "",
        assistanceListingNumber: null,
      },
    ]);

    await generateSefaReport(db, { APP_URL: "https://app.grantpipe.com" } as never, {
      orgId: "org-1",
      userId: "user-1",
      data: { fiscalYear: "FY2026" },
    });

    const inserted = getInsertedReportValues(db);
    const preview = inserted.metadata.preview.content as string;
    expect(preview).toContain("grant-federal-1: Assistance Listing Number is missing.");
    expect(preview).toContain("FY2026 SEFA Draft");
  });

  it("writes blank CSV cells for sparse optional federal award metadata", async () => {
    const db = makeDb([
      {
        ...watchRows[0]!,
        federalAgency: null,
        assistanceListingNumber: null,
        fain: null,
        passThroughEntityName: null,
        passThroughIdentifyingNumber: "PT-26",
        programName: null,
        clusterName: "Research and Development",
      },
    ]);

    await generateSefaReport(db, { APP_URL: "https://app.grantpipe.com" } as never, {
      orgId: "org-1",
      userId: "user-1",
      data: { fiscalYear: "FY2026" },
    });

    expect(mockStoragePut).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining(
          "GrantPipe Foundation,FY2026,grant-federal-1,HUD Housing Award,,,",
        ),
      }),
    );
    expect(mockStoragePut).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining(",PT-26,,Research and Development,82500000,"),
      }),
    );
  });

  it("stores the generated report under the active entity when one is supplied", async () => {
    const db = makeDb();

    await generateSefaReport(db, { APP_URL: "https://app.grantpipe.com" } as never, {
      orgId: "org-1",
      entityId: "entity-active",
      userId: "user-1",
      data: { fiscalYear: "FY2026" },
    });

    expect(getInsertedReportValues(db).entityId).toBe("entity-active");
    expect(mockDeliverReportReadyEffects).toHaveBeenCalledWith(db, expect.anything(), "report-1");
  });

  it("falls back to the organization default entity when no active entity is supplied", async () => {
    const db = makeDb();

    await generateSefaReport(db, { APP_URL: "https://app.grantpipe.com" } as never, {
      orgId: "org-1",
      userId: "user-1",
      data: { fiscalYear: "FY2026" },
    });

    expect(getInsertedReportValues(db).entityId).toBe("entity-1");
  });

  it("throws before insert when no default entity exists", async () => {
    const db = makeDb(watchRows, {
      orgRecord: { ...org, defaultEntityId: null },
    });

    await expect(
      generateSefaReport(db, { APP_URL: "https://app.grantpipe.com" } as never, {
        orgId: "org-1",
        userId: "user-1",
        data: { fiscalYear: "FY2026" },
      }),
    ).rejects.toThrow("Organization default entity is required to store generated reports");
  });

  it("throws when the pending report row cannot be created", async () => {
    const db = makeDb(watchRows, { insertedRows: [] });

    await expect(
      generateSefaReport(db, { APP_URL: "https://app.grantpipe.com" } as never, {
        orgId: "org-1",
        userId: "user-1",
        data: { fiscalYear: "FY2026" },
      }),
    ).rejects.toThrow("Failed to create generated report");
  });

  it("marks the report failed when it cannot be marked ready", async () => {
    const db = makeDb(watchRows, { readyRows: [] });
    let finishCleanup: (() => void) | undefined;
    mockStorageDelete.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishCleanup = resolve;
        }),
    );

    let generationSettled = false;
    const generation = generateSefaReport(db, { APP_URL: "https://app.grantpipe.com" } as never, {
      orgId: "org-1",
      userId: "user-1",
      data: { fiscalYear: "FY2026" },
    }).finally(() => {
      generationSettled = true;
    });
    void generation.catch(() => undefined);

    await vi.waitFor(() => expect(mockStorageDelete).toHaveBeenCalledTimes(1));
    expect(generationSettled).toBe(false);

    finishCleanup?.();
    await expect(generation).rejects.toThrow("Failed to mark generated report ready");

    const updateSetCalls = (db as unknown as UpdateMockDb).update.mock.results.map(
      (result) => result.value.set.mock.calls[0]![0],
    );
    expect(updateSetCalls).toContainEqual(
      expect.objectContaining({
        status: "failed",
      }),
    );
  });

  it("only transitions the organization pending row to ready", async () => {
    let readyWhere: ReturnType<PgDialect["sqlToQuery"]> | undefined;
    const db = makeDb() as unknown as {
      update: ReturnType<typeof vi.fn>;
    };
    db.update.mockImplementationOnce(() => ({
      set: vi.fn(() => ({
        where: vi.fn((where: Parameters<PgDialect["sqlToQuery"]>[0]) => {
          readyWhere = new PgDialect().sqlToQuery(where);
          return { returning: vi.fn().mockResolvedValue([]) };
        }),
      })),
    }));

    await expect(
      generateSefaReport(db as never, { APP_URL: "https://app.grantpipe.com" } as never, {
        orgId: "org-1",
        userId: "user-1",
        data: { fiscalYear: "FY2026" },
      }),
    ).rejects.toThrow("Failed to mark generated report ready");

    expect(readyWhere?.sql).toContain('"generated_reports"."org_id"');
    expect(readyWhere?.sql).toContain('"generated_reports"."status"');
    expect(readyWhere?.params).toEqual(expect.arrayContaining(["report-1", "org-1", "pending"]));
    expect(mockDeliverReportReadyEffects).not.toHaveBeenCalled();
  });

  it("preserves a ready SEFA report and object when the ready commit response is lost", async () => {
    const db = makeDb() as unknown as {
      query: Record<string, unknown>;
      update: ReturnType<typeof vi.fn>;
    };
    const readyRow = {
      id: "report-1",
      type: "sefa",
      format: "csv_bundle",
      status: "ready",
      title: "FY2026 SEFA Draft",
      fileName: "sefa-fy2026.csv",
      createdAt: new Date("2026-06-26T00:00:00.000Z"),
      fiscalYear: "FY2026",
      metadata: { tripwire: { thresholdCents: 100_000_000 } },
    };
    db.query.generatedReports = {
      findFirst: vi.fn().mockResolvedValue(readyRow),
    };
    db.update
      .mockImplementationOnce(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi
              .fn()
              .mockRejectedValue(new Error("Postgres response lost after ready commit")),
          })),
        })),
      }))
      .mockImplementationOnce(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })),
        })),
      }));

    const artifact = await generateSefaReport(
      db as never,
      { APP_URL: "https://app.grantpipe.com" } as never,
      {
        orgId: "org-1",
        userId: "user-1",
        data: { fiscalYear: "FY2026" },
      },
    );

    expect(artifact.status).toBe("ready");
    expect(mockStorageDelete).not.toHaveBeenCalled();
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Postgres response lost after ready commit" }),
      "compliance",
      { step: "sefa_report_ready_reconciled" },
    );
  });

  it("preserves the report failure when SEFA artifact cleanup also fails", async () => {
    const cleanupError = new Error("R2 cleanup failed");
    mockStorageDelete.mockRejectedValueOnce(cleanupError);
    const db = makeDb(watchRows, { readyRows: [] });

    await expect(
      generateSefaReport(db, { APP_URL: "https://app.grantpipe.com" } as never, {
        orgId: "org-1",
        userId: "user-1",
        data: { fiscalYear: "FY2026" },
      }),
    ).rejects.toThrow("Failed to mark generated report ready");

    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(cleanupError, "compliance", {
      step: "sefa_report_cleanup",
    });
  });

  it("preserves the deterministic object when marking the failed row also fails", async () => {
    const failedStatusError = new Error("Postgres unavailable during failed status update");
    const db = makeDb();
    const update = (db as unknown as { update: ReturnType<typeof vi.fn> }).update;
    update
      .mockImplementationOnce(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })),
        })),
      }))
      .mockImplementationOnce(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({ returning: vi.fn().mockRejectedValue(failedStatusError) })),
        })),
      }));

    await expect(
      generateSefaReport(db, { APP_URL: "https://app.grantpipe.com" } as never, {
        orgId: "org-1",
        userId: "user-1",
        data: { fiscalYear: "FY2026" },
      }),
    ).rejects.toThrow("Failed to mark generated report ready");

    expect(mockStorageDelete).not.toHaveBeenCalled();
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(failedStatusError, "compliance", {
      step: "sefa_report_failed_status",
    });
  });

  it("returns no metadata or fiscal year when the ready row omits them", async () => {
    const db = makeDb(watchRows, {
      readyRows: [
        {
          id: "report-1",
          type: "sefa",
          format: "csv_bundle",
          status: "ready",
          title: "FY2026 SEFA Draft",
          fileName: "sefa-fy2026.csv",
          createdAt: new Date("2026-06-26T00:00:00.000Z"),
          fiscalYear: null,
          metadata: null,
        },
      ],
    });

    const result = await generateSefaReport(db, { APP_URL: "https://app.grantpipe.com" } as never, {
      orgId: "org-1",
      userId: "user-1",
      data: { fiscalYear: "FY2026" },
    });

    expect(result.fiscalYear).toBeUndefined();
    expect(result.metadata).toBeUndefined();
  });

  it("marks the pending report failed when artifact storage fails", async () => {
    const db = makeDb();
    mockStoragePut.mockRejectedValueOnce(new Error("R2 down"));

    await expect(
      generateSefaReport(db, { APP_URL: "https://app.grantpipe.com" } as never, {
        orgId: "org-1",
        userId: "user-1",
        data: { fiscalYear: "FY2026" },
      }),
    ).rejects.toThrow("R2 down");

    expect(getUpdateSetCalls(db)[0]![0]).toMatchObject({
      status: "failed",
      metadata: {
        failure: {
          stage: "sefa_report_generation",
          errorName: "Error",
        },
      },
    });
  });

  it("records UnknownError in failure metadata for non-Error failures", async () => {
    const db = makeDb();
    mockStoragePut.mockRejectedValueOnce("storage down" as never);

    await expect(
      generateSefaReport(db, { APP_URL: "https://app.grantpipe.com" } as never, {
        orgId: "org-1",
        userId: "user-1",
        data: { fiscalYear: "FY2026" },
      }),
    ).rejects.toBe("storage down");

    const updateSetCalls = (db as unknown as UpdateMockDb).update.mock.results.map(
      (result) => result.value.set.mock.calls[0]![0],
    );
    expect(updateSetCalls).toContainEqual(
      expect.objectContaining({
        status: "failed",
        metadata: expect.objectContaining({
          failure: expect.objectContaining({ errorName: "UnknownError" }),
        }),
      }),
    );
  });
});
