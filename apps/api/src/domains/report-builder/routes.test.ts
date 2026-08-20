import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../../types";
import { errorHandler } from "../../middleware/error-handler";
import { reportBuilderRoutes } from "./routes";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import { captureBackgroundException } from "../../lib/sentry";

const analyticsCapture = vi.fn();

vi.mock("./service", () => ({
  getReportBuilderMetadata: vi.fn(),
  listReportDefinitions: vi.fn(),
  createReportDefinition: vi.fn(),
  updateReportDefinition: vi.fn(),
  deleteReportDefinition: vi.fn(),
  previewReportDefinition: vi.fn(),
  runReportDefinition: vi.fn(),
}));

vi.mock("../../lib/integrations", () => ({
  getIntegrations: vi.fn(() => ({
    analytics: { capture: analyticsCapture },
  })),
}));

vi.mock("../../lib/sentry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/sentry")>()),
  captureBackgroundException: vi.fn(),
}));

const service = await import("./service");

function buildApp(overrides: Partial<AppEnv["Variables"]> = {}) {
  return new Hono<AppEnv>()
    .onError(errorHandler)
    .use("*", async (c, next) => {
      c.set("db", {} as never);
      c.set("orgId", "org-1");
      c.set("user", { id: "user-1" } as never);
      c.set("memberRole", "admin");
      c.set("memberPermissions", null);
      c.set("orgSubscription", {
        planTier: "enterprise",
        subscriptionStatus: "active",
        trialEndsAt: null,
      } as never);
      for (const [key, value] of Object.entries(overrides)) {
        c.set(key as never, value as never);
      }
      await next();
    })
    .route("/report-builder", reportBuilderRoutes);
}

describe("reportBuilderRoutes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analyticsCapture.mockResolvedValue({ id: "analytics-1" });
    vi.mocked(service.getReportBuilderMetadata).mockResolvedValue({
      entities: {
        donors: { label: "Donors", columns: [], customFields: [] },
        donations: { label: "Donations", columns: [], customFields: [] },
        grants: { label: "Grants", columns: [], customFields: [] },
        funds: { label: "Funds", columns: [], customFields: [] },
      },
    });
    vi.mocked(service.listReportDefinitions).mockResolvedValue([]);
    vi.mocked(service.createReportDefinition).mockResolvedValue({
      id: "definition-1",
      name: "Grant list",
      entity: "grants",
      columns: ["name"],
      customFieldIds: [],
      filters: [],
      sort: [],
      createdBy: "user-1",
      createdAt: "2026-06-18T00:00:00.000Z",
      updatedAt: "2026-06-18T00:00:00.000Z",
    });
    vi.mocked(service.updateReportDefinition).mockResolvedValue({
      id: "definition-1",
      name: "Grant list",
      entity: "grants",
      columns: ["name"],
      customFieldIds: [],
      filters: [],
      sort: [],
      createdBy: "user-1",
      createdAt: "2026-06-18T00:00:00.000Z",
      updatedAt: "2026-06-18T00:00:00.000Z",
    });
    vi.mocked(service.previewReportDefinition).mockResolvedValue({
      columns: [{ id: "name", label: "Name" }],
      rows: [{ name: "Youth Grant" }],
      totalRows: 1,
    });
    vi.mocked(service.runReportDefinition).mockImplementation(async (_db, _env, params) => {
      const artifact = {
        id: "report-1",
        type: "custom_report",
        format: "csv_bundle",
        status: "ready",
        title: "Grant list",
        fileName: "grant-list.csv",
        downloadPath: "/api/compliance/reports/report-1/download",
        previewPath: "/api/compliance/reports/report-1/preview",
        internalPath: "/reports/report-1",
        createdAt: "2026-06-18T00:00:00.000Z",
      } as const;
      await params.onFirstReady?.(artifact);
      return artifact;
    });
    vi.mocked(service.deleteReportDefinition).mockResolvedValue(undefined);
  });

  it("returns report builder metadata for enterprise orgs", async () => {
    const res = await buildApp().request("/report-builder/metadata");

    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty("entities.grants");
    expect(service.getReportBuilderMetadata).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      allowedEntities: ["donors", "donations", "grants", "funds"],
    });
  });

  it("lets auditors use grant and fund report surfaces without donor access", async () => {
    const app = buildApp({ memberRole: "auditor" });

    const grantPreview = await app.request("/report-builder/preview", {
      method: "POST",
      body: JSON.stringify({ entity: "grants", columns: ["name"], limit: 10 }),
      headers: { "content-type": "application/json" },
    });
    const donorPreview = await app.request("/report-builder/preview", {
      method: "POST",
      body: JSON.stringify({ entity: "donors", columns: ["email"], limit: 10 }),
      headers: { "content-type": "application/json" },
    });

    expect(grantPreview.status).toBe(200);
    expect(donorPreview.status).toBe(403);
    expect(service.previewReportDefinition).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      data: expect.objectContaining({ entity: "grants" }),
    });
    expect(service.previewReportDefinition).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        data: expect.objectContaining({ entity: "donors" }),
      }),
    );
  });

  it("blocks scoped users from listing or creating inaccessible entity reports", async () => {
    const app = buildApp({ memberRole: "auditor" });

    const listRes = await app.request("/report-builder/definitions?entity=donors");
    const createRes = await app.request("/report-builder/definitions", {
      method: "POST",
      body: JSON.stringify({
        name: "Donor report",
        entity: "donors",
        columns: ["email"],
      }),
      headers: { "content-type": "application/json" },
    });

    expect(listRes.status).toBe(403);
    expect(createRes.status).toBe(403);
    expect(service.listReportDefinitions).not.toHaveBeenCalled();
    expect(service.createReportDefinition).not.toHaveBeenCalled();
  });

  it("blocks the builder below enterprise", async () => {
    const res = await buildApp({
      orgSubscription: { planTier: "growth", subscriptionStatus: "active", trialEndsAt: null },
    } as never).request("/report-builder/metadata");

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "insufficient_plan" });
  });

  it("blocks the builder on audit-ready and points to the enterprise plan", async () => {
    const res = await buildApp({
      orgSubscription: { planTier: "audit_ready", subscriptionStatus: "active", trialEndsAt: null },
    } as never).request("/report-builder/metadata");

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      error: "insufficient_plan",
      message: "The Cross-Entity Report Builder is available on the Enterprise plan.",
    });
  });

  it("creates and previews saved definitions with org and actor context", async () => {
    const app = buildApp();
    const createRes = await app.request("/report-builder/definitions", {
      method: "POST",
      body: JSON.stringify({
        name: "Grant list",
        description: "Board view",
        entity: "grants",
        columns: ["name"],
      }),
      headers: { "content-type": "application/json" },
    });
    const previewRes = await app.request("/report-builder/preview", {
      method: "POST",
      body: JSON.stringify({ entity: "grants", columns: ["name"], limit: 10 }),
      headers: { "content-type": "application/json" },
    });

    expect(createRes.status).toBe(201);
    expect(previewRes.status).toBe(200);
    expect(service.createReportDefinition).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      userId: "user-1",
      data: expect.objectContaining({ entity: "grants" }),
    });
    expect(analyticsCapture).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.reportBuilderDefinitionSaved,
      payload: {
        entity_type: "grants",
        report_type: "custom_report",
        surface: "report_builder",
        operation: "definition_save",
        column_count: 1,
        custom_field_count: 0,
        filter_count: 0,
        sort_count: 0,
        has_description: true,
      },
    });
    expect(analyticsCapture).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.reportBuilderPreviewGenerated,
      payload: {
        entity_type: "grants",
        report_type: "custom_report",
        surface: "report_builder",
        operation: "preview",
        column_count: 1,
        custom_field_count: 0,
        filter_count: 0,
        sort_count: 0,
        has_description: false,
        limit_bucket: "1_10",
        total_rows_bucket: "1_10",
      },
    });
    expect(JSON.stringify(analyticsCapture.mock.calls)).not.toContain("Grant list");
  });

  it("lists, updates, and deletes saved definitions", async () => {
    const app = buildApp();

    const listRes = await app.request("/report-builder/definitions?entity=grants");
    const updateRes = await app.request("/report-builder/definitions/definition-1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Renamed report" }),
      headers: { "content-type": "application/json" },
    });
    const deleteRes = await app.request("/report-builder/definitions/definition-1", {
      method: "DELETE",
    });

    expect(listRes.status).toBe(200);
    expect(updateRes.status).toBe(200);
    expect(deleteRes.status).toBe(200);
    expect(service.listReportDefinitions).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      entity: "grants",
      allowedEntities: ["donors", "donations", "grants", "funds"],
    });
    expect(service.updateReportDefinition).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      definitionId: "definition-1",
      data: expect.objectContaining({ name: "Renamed report" }),
      allowedEntities: ["donors", "donations", "grants", "funds"],
    });
    expect(service.deleteReportDefinition).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      definitionId: "definition-1",
      allowedEntities: ["donors", "donations", "grants", "funds"],
    });
    expect(await deleteRes.json()).toEqual({ success: true });
  });

  it("blocks partial updates that move scoped users to inaccessible entities", async () => {
    const res = await buildApp({ memberRole: "auditor" }).request(
      "/report-builder/definitions/definition-1",
      {
        method: "PATCH",
        body: JSON.stringify({ entity: "donors", columns: ["email"] }),
        headers: { "content-type": "application/json" },
      },
    );

    expect(res.status).toBe(403);
    expect(service.updateReportDefinition).not.toHaveBeenCalled();
  });

  it("buckets preview row counts without leaking report names", async () => {
    const app = buildApp();
    const totals = [0, 15, 50, 101];

    for (const totalRows of totals) {
      vi.mocked(service.previewReportDefinition).mockResolvedValueOnce({
        columns: [{ id: "name", label: "Name" }],
        rows: [],
        totalRows,
      });
      const res = await app.request("/report-builder/preview", {
        method: "POST",
        body: JSON.stringify({
          entity: "grants",
          columns: ["name"],
          customFieldIds: ["field-1"],
          filters: [{ field: "name", operator: "contains", value: "Grant" }],
          sort: [{ field: "name", direction: "asc" }],
          limit: totalRows === 101 ? 100 : 25,
        }),
        headers: { "content-type": "application/json" },
      });

      expect(res.status).toBe(200);
    }

    expect(analyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ total_rows_bucket: "0" }),
      }),
    );
    expect(analyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ total_rows_bucket: "10_25" }),
      }),
    );
    expect(analyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ total_rows_bucket: "25_100" }),
      }),
    );
    expect(analyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          custom_field_count: 1,
          filter_count: 1,
          sort_count: 1,
          total_rows_bucket: "100_plus",
        }),
      }),
    );
  });

  it("runs a saved definition into a generated report artifact", async () => {
    const res = await buildApp().request("/report-builder/definitions/definition-1/run", {
      method: "POST",
      body: JSON.stringify({
        title: "Board grants export",
        attemptId: "00000000-0000-4000-8000-000000000099",
      }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ id: "report-1", format: "csv_bundle" });
    expect(service.runReportDefinition).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      expect.objectContaining({
        orgId: "org-1",
        userId: "user-1",
        definitionId: "definition-1",
        data: {
          title: "Board grants export",
          attemptId: "00000000-0000-4000-8000-000000000099",
        },
        allowedEntities: ["donors", "donations", "grants", "funds"],
      }),
    );
    expect(analyticsCapture).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventName: ANALYTICS_EVENTS.reportGenerated }),
    );
    expect(JSON.stringify(analyticsCapture.mock.calls)).not.toContain("Board grants export");
  });

  it("leaves canonical export analytics to the durable report service", async () => {
    vi.mocked(service.runReportDefinition).mockImplementationOnce(async () => {
      const artifact = {
        id: "report-2",
        type: "custom_report",
        format: "csv_bundle",
        status: "ready",
        title: "Grant list",
        fileName: "grant-list.csv",
        downloadPath: "/api/compliance/reports/report-2/download",
        previewPath: "/api/compliance/reports/report-2/preview",
        internalPath: "/reports/report-2",
        createdAt: "2026-06-18T00:00:00.000Z",
        metadata: { reportBuilder: { totalRows: 42 } },
      } as const;
      return artifact;
    });

    const res = await buildApp().request("/report-builder/definitions/definition-1/run", {
      method: "POST",
      body: JSON.stringify({ attemptId: "00000000-0000-4000-8000-000000000099" }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(201);
    expect(analyticsCapture).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventName: ANALYTICS_EVENTS.reportGenerated }),
    );
  });

  it("does not emit generated analytics when the service replays an existing attempt", async () => {
    vi.mocked(service.runReportDefinition).mockResolvedValueOnce({
      id: "report-1",
      type: "custom_report",
      format: "csv_bundle",
      status: "ready",
      title: "Grant list",
      fileName: "grant-list.csv",
      downloadPath: "/api/compliance/reports/report-1/download",
      previewPath: "/api/compliance/reports/report-1/preview",
      internalPath: "/reports/report-1",
      createdAt: "2026-06-18T00:00:00.000Z",
    });
    const res = await buildApp().request("/report-builder/definitions/definition-1/run", {
      method: "POST",
      body: JSON.stringify({ attemptId: "00000000-0000-4000-8000-000000000099" }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(201);
    expect(analyticsCapture).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventName: ANALYTICS_EVENTS.reportGenerated }),
    );
  });

  it("rejects cached clients without an export attempt id before creating an artifact", async () => {
    const app = buildApp();
    const response = await app.request("/report-builder/definitions/definition-1/run", {
      method: "POST",
      body: JSON.stringify({ title: "Old client" }),
      headers: { "content-type": "application/json" },
    });

    expect(response.status).toBe(400);
    expect(vi.mocked(service.runReportDefinition)).not.toHaveBeenCalled();
  });

  it("reports analytics capture failures to Sentry without breaking the route", async () => {
    analyticsCapture.mockRejectedValueOnce(new Error("PostHog offline"));

    const res = await buildApp().request("/report-builder/definitions", {
      method: "POST",
      body: JSON.stringify({
        name: "Sensitive donor export",
        entity: "donors",
        columns: ["email"],
      }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(201);
    expect(captureBackgroundException).toHaveBeenCalledWith(expect.any(Error), "report_builder", {
      operation: "definition_save",
      telemetry: "analytics_capture",
    });
    expect(JSON.stringify(vi.mocked(captureBackgroundException).mock.calls)).not.toContain(
      "Sensitive donor export",
    );
  });
});
