import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";
import { importRoutes } from "./routes";
import { ANALYTICS_EVENTS, type PermissionMap } from "@grantpipe/shared";
import { errorHandler } from "../../middleware/error-handler";

vi.mock("./service", () => ({
  previewImport: vi.fn(),
  commitImport: vi.fn(),
  listImportHistory: vi.fn(),
  getImportMigrationPlan: vi.fn(),
}));

const { mockCaptureAnalytics, mockCaptureApiException, mockCaptureBackgroundException } =
  vi.hoisted(() => ({
    mockCaptureAnalytics: vi.fn(),
    mockCaptureApiException: vi.fn(),
    mockCaptureBackgroundException: vi.fn(),
  }));

vi.mock("../../lib/integrations", () => ({
  getIntegrations: () => ({
    analytics: { capture: mockCaptureAnalytics },
  }),
}));

vi.mock("../../lib/sentry", () => ({
  captureApiException: mockCaptureApiException,
  captureBackgroundException: mockCaptureBackgroundException,
}));

import { commitImport, getImportMigrationPlan, listImportHistory, previewImport } from "./service";

const ZERO_CREATED_COUNTS = {
  contacts: 0,
  donations: 0,
  grants: 0,
  funders: 0,
  grantOpportunities: 0,
  funds: 0,
  openingBalanceLines: 0,
  pledges: 0,
  pledgeInstallments: 0,
};

function buildSelectChain(countValue: number) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([{ value: countValue }]),
  };
  return vi.fn().mockReturnValue(chain);
}

function buildDefaultDb(importCountValue = 2) {
  return { select: buildSelectChain(importCountValue) };
}

function buildApp(
  role: "admin" | "editor" | "viewer" = "editor",
  permissions?: PermissionMap | null,
  db: unknown = buildDefaultDb(),
  entityId: string | null = "entity-active",
) {
  return new Hono<AppEnv>()
    .onError(errorHandler)
    .use("/import/*", async (c, next) => {
      c.set("db", db as never);
      c.set("orgId", "org-1");
      if (entityId) c.set("entityId", entityId);
      c.set("user", { id: "user-1", email: "test@example.com", name: "Test" });
      c.set("session", { id: "sess-1", userId: "user-1" });
      c.set("memberRole", role);
      c.set("memberPermissions", permissions ?? null);
      await next();
    })
    .route("/import", importRoutes);
}

describe("GET /import", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCaptureAnalytics.mockResolvedValue({ id: "analytics-1" });
  });

  it("returns the import history list for the org", async () => {
    vi.mocked(listImportHistory).mockResolvedValue({
      data: [
        {
          id: "history-1",
          entityType: "contacts",
          status: "completed",
        },
      ] as never,
      total: 1,
      page: 2,
      pageSize: 10,
    });

    const app = buildApp("editor");
    const res = await app.request(
      "/import?entityType=contacts&status=completed&page=2&pageSize=10",
    );

    expect(res.status).toBe(200);
    expect(listImportHistory).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      entityId: "entity-active",
      entityType: "contacts",
      status: "completed",
      page: 2,
      pageSize: 10,
      sortBy: "createdAt",
      sortOrder: "desc",
    });
  });

  it("blocks viewers from listing import history", async () => {
    const app = buildApp("viewer");
    const res = await app.request("/import");

    expect(res.status).toBe(403);
    expect(listImportHistory).not.toHaveBeenCalled();
  });

  it("allows a viewer with explicit import edit permission to list import history", async () => {
    vi.mocked(listImportHistory).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      pageSize: 25,
    });
    const app = buildApp("viewer", { import: "edit" } as PermissionMap);

    const res = await app.request("/import");

    expect(res.status).toBe(200);
    expect(listImportHistory).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      entityId: "entity-active",
      page: 1,
      pageSize: 25,
      sortBy: "createdAt",
      sortOrder: "desc",
    });
  });

  it("passes null entityId when listing without an active entity", async () => {
    vi.mocked(listImportHistory).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      pageSize: 25,
    });
    const app = buildApp("editor", null, buildDefaultDb(), null);

    const res = await app.request("/import");

    expect(res.status).toBe(200);
    expect(listImportHistory).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        entityId: null,
      }),
    );
  });
});

describe("GET /import/migration-plan", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCaptureAnalytics.mockResolvedValue({ id: "analytics-1" });
  });

  it("returns a source-specific migration plan with progress for the org", async () => {
    vi.mocked(getImportMigrationPlan).mockResolvedValue({
      sourceId: "quickbooks",
      label: "QuickBooks",
      summary: "A finance cutover path for QuickBooks classes, funds, and opening balances.",
      nextEntityType: "opening_balances",
      sourceNotes: ["Use QuickBooks for opening balances."],
      recommendedOrder: [
        {
          entityType: "opening_balances",
          label: "Seed opening GL balances",
          phase: "finance",
          description: "Post starting balances.",
          whyItMatters: "Reports need a balanced starting ledger.",
          status: "ready",
        },
      ],
      progress: [
        {
          entityType: "opening_balances",
          status: "not_started",
          latestImportAt: null,
          insertedRows: 0,
          failedRows: 0,
        },
      ],
    });

    const app = buildApp("editor");
    const res = await app.request("/import/migration-plan?source=quickbooks");

    expect(res.status).toBe(200);
    expect(getImportMigrationPlan).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      entityId: "entity-active",
      source: "quickbooks",
    });
    expect(await res.json()).toMatchObject({
      sourceId: "quickbooks",
      nextEntityType: "opening_balances",
    });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.migrationStudioPlanViewed,
      payload: {
        actorId: "user-1",
        migration_source: "quickbooks",
        migration_next_entity_type: "opening_balances",
      },
    });
  });

  it("captures complete when every migration plan step is done", async () => {
    vi.mocked(getImportMigrationPlan).mockResolvedValue({
      sourceId: "generic",
      label: "Generic CSV",
      summary: "A safe import path for spreadsheet data.",
      nextEntityType: null,
      sourceNotes: [],
      recommendedOrder: [],
      progress: [],
    });

    const app = buildApp("editor");
    const res = await app.request("/import/migration-plan");

    expect(res.status).toBe(200);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.migrationStudioPlanViewed,
      payload: {
        actorId: "user-1",
        migration_source: "generic",
        migration_next_entity_type: "complete",
      },
    });
    expect(getImportMigrationPlan).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        entityId: "entity-active",
      }),
    );
  });

  it("passes null entityId when reading the migration plan without an active entity", async () => {
    vi.mocked(getImportMigrationPlan).mockResolvedValue({
      sourceId: "generic",
      label: "Generic CSV",
      summary: "A safe import path for spreadsheet data.",
      nextEntityType: "contacts",
      sourceNotes: [],
      recommendedOrder: [],
      progress: [],
    });

    const app = buildApp("editor", null, buildDefaultDb(), null);
    const res = await app.request("/import/migration-plan");

    expect(res.status).toBe(200);
    expect(getImportMigrationPlan).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        entityId: null,
      }),
    );
  });

  it("blocks viewers from reading the migration plan", async () => {
    const app = buildApp("viewer");
    const res = await app.request("/import/migration-plan?source=quickbooks");

    expect(res.status).toBe(403);
    expect(getImportMigrationPlan).not.toHaveBeenCalled();
  });
});

describe("POST /import/preview", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCaptureAnalytics.mockResolvedValue({ id: "analytics-1" });
  });

  it("returns a parsed preview for valid CSV input and forwards orgId", async () => {
    vi.mocked(previewImport).mockResolvedValue({
      orgId: "org-1",
      entityId: "entity-active",
      entityType: "contacts",
      filename: "contacts.csv",
      headers: ["email", "first_name"],
      rows: [{ email: "jane@example.com", first_name: "Jane" }],
      totalRows: 1,
    });

    const app = buildApp("editor");
    const res = await app.request("/import/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType: "contacts",
        filename: "contacts.csv",
        csvText: "email,first_name\njane@example.com,Jane",
      }),
    });

    expect(res.status).toBe(200);
    expect(previewImport).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      entityId: "entity-active",
      entityType: "contacts",
      filename: "contacts.csv",
      csvText: "email,first_name\njane@example.com,Jane",
    });
    const body = (await res.json()) as { orgId: string };
    expect(body.orgId).toBe("org-1");
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.importPreviewStarted,
      payload: {
        actorId: "user-1",
        entity_type: "contacts",
        total_rows_bucket: "1-10",
      },
    });
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("contacts.csv");
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("Jane");
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("jane@example.com");
  });

  it("returns 400 when the payload is invalid", async () => {
    const app = buildApp("editor");
    const res = await app.request("/import/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType: "contacts", filename: "contacts.csv" }),
    });

    expect(res.status).toBe(400);
    expect(previewImport).not.toHaveBeenCalled();
  });

  it("passes null entityId when previewing without an active entity", async () => {
    vi.mocked(previewImport).mockResolvedValue({
      orgId: "org-1",
      entityType: "contacts",
      filename: "contacts.csv",
      headers: ["email"],
      rows: [{ email: "jane@example.com" }],
      totalRows: 1,
    });

    const app = buildApp("editor", null, buildDefaultDb(), null);
    const res = await app.request("/import/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType: "contacts",
        filename: "contacts.csv",
        csvText: "email\njane@example.com",
      }),
    });

    expect(res.status).toBe(200);
    expect(previewImport).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        entityId: null,
      }),
    );
  });
});

describe("POST /import/commit", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCaptureAnalytics.mockResolvedValue({ id: "analytics-1" });
  });

  it("returns commit counts for valid input", async () => {
    vi.mocked(commitImport).mockResolvedValue({
      history: {
        id: "history-1",
        entityType: "contacts",
        status: "completed",
      } as never,
      totalRows: 1,
      insertedRows: 1,
      duplicateRows: 0,
      failedRows: 0,
      createdCounts: {
        ...ZERO_CREATED_COUNTS,
        contacts: 1,
      },
    });

    const app = buildApp("editor");
    const res = await app.request("/import/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType: "contacts",
        filename: "contacts.csv",
        mapping: {
          email: "email",
          firstName: "first_name",
        },
        rows: [{ email: "jane@example.com", first_name: "Jane" }],
      }),
    });

    expect(res.status).toBe(201);
    expect(commitImport).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      userId: "user-1",
      entityId: "entity-active",
      entityType: "contacts",
      filename: "contacts.csv",
      mapping: {
        email: "email",
        firstName: "first_name",
      },
      rows: [{ email: "jane@example.com", first_name: "Jane" }],
    });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.importCompleted,
      payload: {
        actorId: "user-1",
        entity_type: "contacts",
        total_rows_bucket: "1-10",
        inserted_rows_bucket: "1-10",
        duplicate_rows_bucket: "0",
        failed_rows_bucket: "0",
        contacts_created_bucket: "1-10",
        donations_created_bucket: "0",
        grants_created_bucket: "0",
        funders_created_bucket: "0",
        grant_opportunities_created_bucket: "0",
        funds_created_bucket: "0",
        opening_balance_lines_created_bucket: "0",
        pledges_created_bucket: "0",
        pledge_installments_created_bucket: "0",
      },
    });
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("contacts.csv");
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("Jane");
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("jane@example.com");
  });

  it("captures import_failed with safe row-count buckets when commit fails", async () => {
    const error = new Error("Import failed for raw row");
    vi.mocked(commitImport).mockRejectedValue(error);
    const app = buildApp("editor");

    const res = await app.request("/import/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType: "grant_opportunities",
        filename: "opportunities.csv",
        mapping: {},
        rows: [{ title: "Sensitive opportunity" }, { title: "Other" }],
      }),
    });

    expect(res.status).toBe(500);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.importFailed,
      payload: {
        actorId: "user-1",
        entity_type: "grant_opportunities",
        failure_type: "api_error",
        total_rows_bucket: "1-10",
      },
    });
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("opportunities.csv");
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("Sensitive opportunity");
  });

  it("labels non-error commit failures as unknown without leaking row data", async () => {
    vi.mocked(commitImport).mockRejectedValue("string failure");
    const app = buildApp("editor");

    await expect(
      app.request("/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: "contacts",
          filename: "contacts.csv",
          mapping: {},
          rows: [{ email: "private@example.org" }],
        }),
      }),
    ).rejects.toBe("string failure");

    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.importFailed,
      payload: {
        actorId: "user-1",
        entity_type: "contacts",
        failure_type: "unknown_error",
        total_rows_bucket: "1-10",
      },
    });
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("private@example.org");
  });

  it("blocks viewers from committing imports", async () => {
    const app = buildApp("viewer");
    const res = await app.request("/import/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType: "contacts",
        filename: "contacts.csv",
        mapping: {},
        rows: [{ email: "jane@example.com" }],
      }),
    });

    expect(res.status).toBe(403);
    expect(commitImport).not.toHaveBeenCalled();
  });

  it("captures row-count buckets 11-100, 101-1000, and 1000+ correctly", async () => {
    const make101Rows = () =>
      Array.from({ length: 101 }, (_, i) => ({ email: `user${i}@example.com` }));
    const make1001Rows = () =>
      Array.from({ length: 1001 }, (_, i) => ({ email: `u${i}@example.com` }));

    vi.mocked(previewImport).mockResolvedValue({
      orgId: "org-1",
      entityType: "contacts",
      filename: "contacts.csv",
      headers: ["email"],
      rows: make101Rows(),
      totalRows: 101,
    });

    const app = buildApp("editor");

    // 101 rows → "101-1000" bucket
    const res101 = await app.request("/import/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType: "contacts",
        filename: "contacts.csv",
        csvText: make101Rows()
          .map((r) => r.email)
          .join("\n"),
      }),
    });
    expect(res101.status).toBe(200);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ total_rows_bucket: "101-1000" }),
      }),
    );

    vi.mocked(previewImport).mockResolvedValue({
      orgId: "org-1",
      entityType: "contacts",
      filename: "contacts.csv",
      headers: ["email"],
      rows: make1001Rows(),
      totalRows: 1001,
    });

    // 1001 rows → "1000+" bucket
    const res1001 = await app.request("/import/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType: "contacts",
        filename: "contacts.csv",
        csvText: make1001Rows()
          .map((r) => r.email)
          .join("\n"),
      }),
    });
    expect(res1001.status).toBe(200);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ total_rows_bucket: "1000+" }),
      }),
    );

    // 11 rows → "11-100" bucket
    vi.mocked(previewImport).mockResolvedValue({
      orgId: "org-1",
      entityType: "contacts",
      filename: "contacts.csv",
      headers: ["email"],
      rows: Array.from({ length: 11 }, (_, i) => ({ email: `u${i}@example.com` })),
      totalRows: 11,
    });
    const res11 = await app.request("/import/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType: "contacts",
        filename: "contacts.csv",
        csvText: Array.from({ length: 11 }, (_, i) => `u${i}@example.com`).join("\n"),
      }),
    });
    expect(res11.status).toBe(200);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ total_rows_bucket: "11-100" }),
      }),
    );
  });

  it("captures import_completed with 0 buckets when createdCounts fields are undefined", async () => {
    vi.mocked(commitImport).mockResolvedValue({
      history: { id: "h-1", entityType: "contacts", status: "completed" } as never,
      totalRows: 1,
      insertedRows: 1,
      duplicateRows: 0,
      failedRows: 0,
      createdCounts: {
        contacts: undefined,
        donations: undefined,
        grants: undefined,
        funders: undefined,
        grantOpportunities: undefined,
      } as never,
    });

    const app = buildApp("editor");
    const res = await app.request("/import/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType: "contacts",
        filename: "contacts.csv",
        mapping: {},
        rows: [{ email: "a@example.com" }],
      }),
    });

    expect(res.status).toBe(201);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          contacts_created_bucket: "0",
          donations_created_bucket: "0",
          grants_created_bucket: "0",
          funders_created_bucket: "0",
          grant_opportunities_created_bucket: "0",
        }),
      }),
    );
  });

  it("skips capture when orgId is absent from context", async () => {
    vi.mocked(commitImport).mockResolvedValue({
      history: { id: "h-1", entityType: "contacts", status: "completed" } as never,
      totalRows: 1,
      insertedRows: 1,
      duplicateRows: 0,
      failedRows: 0,
      createdCounts: { ...ZERO_CREATED_COUNTS, contacts: 1 },
    });

    const appNoOrg = new Hono<AppEnv>()
      .use("/import/*", async (c, next) => {
        c.set("db", {} as never);
        // orgId intentionally absent
        c.set("user", { id: "user-1", email: "test@example.com", name: "Test" });
        c.set("session", { id: "sess-1", userId: "user-1" });
        c.set("memberRole", "editor");
        c.set("memberPermissions", null);
        await next();
      })
      .route("/import", importRoutes);

    const res = await appNoOrg.request("/import/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType: "contacts",
        filename: "contacts.csv",
        mapping: {},
        rows: [{ email: "a@example.com" }],
      }),
    });

    expect(res.status).toBe(201);
    expect(mockCaptureAnalytics).not.toHaveBeenCalled();
  });

  it("swallowCapture absorbs a rejected capture promise without failing the commit", async () => {
    vi.mocked(commitImport).mockResolvedValue({
      history: { id: "h-1", entityType: "contacts", status: "completed" } as never,
      totalRows: 1,
      insertedRows: 1,
      duplicateRows: 0,
      failedRows: 0,
      createdCounts: { ...ZERO_CREATED_COUNTS, contacts: 1 },
    });
    mockCaptureAnalytics.mockRejectedValue(new Error("PostHog down"));
    const app = buildApp("editor");

    const res = await app.request("/import/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType: "contacts",
        filename: "contacts.csv",
        mapping: {},
        rows: [{ email: "a@example.com" }],
      }),
    });

    expect(res.status).toBe(201);
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      expect.any(Error),
      "import",
      expect.objectContaining({
        telemetry: "analytics_capture",
        analytics_event: ANALYTICS_EVENTS.importCompleted,
      }),
    );
  });

  it("reports first-import count failures without failing the commit", async () => {
    const countError = new Error("count failed");
    vi.mocked(commitImport).mockResolvedValue({
      history: { id: "h-count", entityType: "contacts", status: "completed" } as never,
      totalRows: 1,
      insertedRows: 1,
      duplicateRows: 0,
      failedRows: 0,
      createdCounts: { ...ZERO_CREATED_COUNTS, contacts: 1 },
    });
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockRejectedValue(countError),
    };
    const app = buildApp("editor", null, { select: vi.fn().mockReturnValue(selectChain) });

    const res = await app.request("/import/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType: "contacts",
        filename: "contacts.csv",
        mapping: { email: "email" },
        rows: [{ email: "jane@example.com" }],
      }),
    });

    expect(res.status).toBe(201);
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      countError,
      "import",
      expect.objectContaining({ step: "first_import_count" }),
    );
    expect(mockCaptureAnalytics).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventName: ANALYTICS_EVENTS.firstImportCompleted }),
    );
  });

  it("allows a viewer with explicit import edit permission to commit imports", async () => {
    vi.mocked(commitImport).mockResolvedValue({
      history: {
        id: "history-1",
        entityType: "contacts",
        status: "completed",
      } as never,
      totalRows: 1,
      insertedRows: 1,
      duplicateRows: 0,
      failedRows: 0,
      createdCounts: {
        ...ZERO_CREATED_COUNTS,
        contacts: 1,
      },
    });
    const app = buildApp("viewer", { import: "edit" } as PermissionMap);

    const res = await app.request("/import/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType: "contacts",
        filename: "contacts.csv",
        mapping: {},
        rows: [{ email: "jane@example.com" }],
      }),
    });

    expect(res.status).toBe(201);
    expect(commitImport).toHaveBeenCalledOnce();
  });

  it("emits first_import_completed when this is the org's first import", async () => {
    vi.mocked(commitImport).mockResolvedValue({
      history: { id: "h-first", entityType: "contacts", status: "completed" } as never,
      totalRows: 1,
      insertedRows: 1,
      duplicateRows: 0,
      failedRows: 0,
      createdCounts: { ...ZERO_CREATED_COUNTS, contacts: 1 },
    });
    const app = buildApp("editor", null, buildDefaultDb(1));

    const res = await app.request("/import/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType: "contacts",
        filename: "contacts.csv",
        mapping: { email: "email" },
        rows: [{ email: "jane@example.com" }],
      }),
    });

    expect(res.status).toBe(201);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: ANALYTICS_EVENTS.firstImportCompleted }),
    );
  });

  it("checks first import at the org level when no active entity is set", async () => {
    vi.mocked(commitImport).mockResolvedValue({
      history: { id: "h-1", entityType: "contacts", status: "completed" } as never,
      totalRows: 1,
      insertedRows: 1,
      duplicateRows: 0,
      failedRows: 0,
      createdCounts: { ...ZERO_CREATED_COUNTS, contacts: 1 },
    });

    const app = buildApp("editor", null, buildDefaultDb(1), null);
    const res = await app.request("/import/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType: "contacts",
        filename: "contacts.csv",
        mapping: {},
        rows: [{ email: "a@example.com" }],
      }),
    });

    expect(res.status).toBe(201);
    expect(commitImport).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.objectContaining({ entityId: "entity-active" }),
    );
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.firstImportCompleted,
      }),
    );
  });

  it("does NOT emit first_import_completed when the org already has imports", async () => {
    vi.mocked(commitImport).mockResolvedValue({
      history: { id: "h-second", entityType: "contacts", status: "completed" } as never,
      totalRows: 1,
      insertedRows: 1,
      duplicateRows: 0,
      failedRows: 0,
      createdCounts: { ...ZERO_CREATED_COUNTS, contacts: 1 },
    });
    const app = buildApp("editor", null, buildDefaultDb(2));

    const res = await app.request("/import/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType: "contacts",
        filename: "contacts.csv",
        mapping: { email: "email" },
        rows: [{ email: "jane@example.com" }],
      }),
    });

    expect(res.status).toBe(201);
    const firstEvents = vi
      .mocked(mockCaptureAnalytics)
      .mock.calls.filter(([args]) => args.eventName === ANALYTICS_EVENTS.firstImportCompleted);
    expect(firstEvents).toHaveLength(0);
  });
});
