import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { PgDialect } from "drizzle-orm/pg-core";
import { ANALYTICS_EVENTS, type PermissionMap } from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { errorHandler } from "../../middleware/error-handler";
import { complianceRoutes } from "./routes";

const { mockCaptureAnalytics, mockCaptureApiException, mockCaptureBackgroundException } =
  vi.hoisted(() => ({
    mockCaptureAnalytics: vi.fn().mockResolvedValue(undefined),
    mockCaptureApiException: vi.fn(),
    mockCaptureBackgroundException: vi.fn(),
  }));

vi.mock("../../lib/integrations", () => ({
  getIntegrations: vi.fn(() => ({
    analytics: {
      capture: mockCaptureAnalytics,
    },
  })),
}));

vi.mock("../../lib/sentry", () => ({
  captureApiException: mockCaptureApiException,
  captureBackgroundException: mockCaptureBackgroundException,
}));

vi.mock("./service", () => ({
  downloadReportArtifact: vi.fn(),
  generateAcknowledgmentLetter: vi.fn(),
  generateDonorYearEndStatementRun: vi.fn(),
  generateAuditReport: vi.fn(),
  generateBoardReport: vi.fn(),
  generateGrantComplianceReport: vi.fn(),
  generateIrs990Report: vi.fn(),
  generateSpendDownReport: vi.fn(),
  getAcknowledgmentTemplate: vi.fn(),
  getGeneratedReportArtifact: vi.fn(),
  getGeneratedReportPreview: vi.fn(),
  listGeneratedReportArtifacts: vi.fn(),
  updateAcknowledgmentTemplate: vi.fn(),
}));

vi.mock("./sefa.service", () => ({
  generateSefaReport: vi.fn(),
  getSefaTripwire: vi.fn(),
}));

import {
  downloadReportArtifact,
  generateAcknowledgmentLetter,
  generateDonorYearEndStatementRun,
  generateAuditReport,
  generateBoardReport,
  generateGrantComplianceReport,
  generateIrs990Report,
  generateSpendDownReport,
  getAcknowledgmentTemplate,
  getGeneratedReportArtifact,
  getGeneratedReportPreview,
  listGeneratedReportArtifacts,
  updateAcknowledgmentTemplate,
} from "./service";
import { generateSefaReport, getSefaTripwire } from "./sefa.service";

let latestReportCountWhere: unknown;

function buildMockDb(
  planTier: "starter" | "growth" | "audit_ready",
  reportCount: number | Error = 0,
) {
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where:
      reportCount instanceof Error
        ? vi.fn().mockRejectedValue(reportCount)
        : vi.fn((where: unknown) => {
            latestReportCountWhere = where;
            return Promise.resolve([{ n: reportCount }]);
          }),
  };
  return {
    query: {
      organizations: {
        findFirst: vi.fn().mockResolvedValue({ id: "org-1", planTier }),
      },
    },
    select: vi.fn().mockReturnValue(selectChain),
  };
}

function buildApp(
  role: "admin" | "editor" | "viewer" = "admin",
  planTier: "starter" | "growth" | "audit_ready" = "growth",
  permissions: Partial<PermissionMap> | null = null,
  reportCount: number | Error = 0,
  orgSubscription: AppEnv["Variables"]["orgSubscription"] = null,
  entityId: string | null = "entity-1",
) {
  const db = buildMockDb(planTier, reportCount);
  return new Hono<AppEnv>()
    .onError(errorHandler)
    .use("/compliance/*", async (c, next) => {
      c.set("db", db as never);
      c.set("orgId", "org-1");
      c.set("entityId", entityId);
      c.set("user", { id: "user-1", email: "finance@example.com", name: "Finance Lead" });
      c.set("session", { id: "sess-1", userId: "user-1" });
      c.set("memberRole", role);
      c.set("memberPermissions", permissions as PermissionMap | null);
      c.set("orgSubscription", orgSubscription);
      await next();
    })
    .route("/compliance", complianceRoutes);
}

const reportArtifact = {
  id: "report-1",
  type: "compliance",
  format: "pdf",
  status: "ready",
  title: "Q1 Compliance Report",
  fileName: "q1-compliance.pdf",
  downloadPath: "/api/compliance/reports/report-1/download",
  previewPath: "/api/compliance/reports/report-1/preview",
  internalPath: "/reports/report-1",
  createdAt: "2026-04-07T20:00:00.000Z",
};

describe("compliance report generation routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    latestReportCountWhere = undefined;
  });

  it("resolves plan tier from cached orgSubscription in the report list route (bypasses DB query)", async () => {
    vi.mocked(listGeneratedReportArtifacts).mockResolvedValue({
      data: [reportArtifact],
      total: 1,
      page: 1,
      pageSize: 25,
    } as never);
    // Inject a cached orgSubscription so getCurrentPlanTier takes the cached path (lines 83-85).
    const cachedSub: AppEnv["Variables"]["orgSubscription"] = {
      planTier: "growth",
      subscriptionStatus: "active",
      trialEndsAt: null,
      onboardingCompleted: true,
      planSelectedAt: null,
      stripeSubscriptionId: null,
    };
    const app = buildApp("viewer", "growth", null, 0, cachedSub);

    const res = await app.request("/compliance/reports");

    expect(res.status).toBe(200);
  });

  it("passes undefined entity scope when no active entity is selected", async () => {
    vi.mocked(listGeneratedReportArtifacts).mockResolvedValue({
      data: [reportArtifact],
      total: 1,
      page: 1,
      pageSize: 25,
    } as never);
    const app = buildApp("viewer", "growth", null, 0, null, null);

    const res = await app.request("/compliance/reports");

    expect(res.status).toBe(200);
    expect(listGeneratedReportArtifacts).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityId: undefined }),
    );
  });

  it("allows viewers to generate grant compliance reports", async () => {
    vi.mocked(generateGrantComplianceReport).mockResolvedValue(reportArtifact as never);
    const app = buildApp("viewer");

    const res = await app.request("/compliance/reports/compliance/grants/grant-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Quarterly Report" }),
    });

    expect(res.status).toBe(201);
    expect(generateGrantComplianceReport).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      expect.objectContaining({ entityId: "entity-1" }),
    );
  });

  it("allows Audit-Ready viewers to preview the SEFA tripwire", async () => {
    vi.mocked(getSefaTripwire).mockResolvedValue({
      fiscalYear: "FY2026",
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-12-31T23:59:59.999Z",
      thresholdCents: 100_000_000,
      totalFederalExpendituresCents: 82_500_000,
      remainingToThresholdCents: 17_500_000,
      thresholdPercent: 82.5,
      state: "watch",
      rows: [],
      warnings: [],
    } as never);
    const app = buildApp("viewer", "audit_ready");

    const res = await app.request("/compliance/reports/sefa/preview?fiscalYear=FY2026");

    expect(res.status).toBe(200);
    expect(getSefaTripwire).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        entityId: "entity-1",
        fiscalYear: "FY2026",
      }),
    );
    await expect(res.json()).resolves.toMatchObject({
      fiscalYear: "FY2026",
      state: "watch",
      thresholdCents: 100_000_000,
    });
  });

  it("rejects SEFA preview requests without a fiscal year", async () => {
    const app = buildApp("viewer", "audit_ready");

    const res = await app.request("/compliance/reports/sefa/preview");

    expect(res.status).toBe(400);
    expect(getSefaTripwire).not.toHaveBeenCalled();
  });

  it("generates a SEFA draft report for Audit-Ready viewers", async () => {
    vi.mocked(generateSefaReport).mockResolvedValue({
      ...reportArtifact,
      type: "sefa",
      format: "csv_bundle",
      title: "FY2026 SEFA Draft",
      fileName: "sefa-fy2026.csv",
    } as never);
    const app = buildApp("viewer", "audit_ready");

    const res = await app.request("/compliance/reports/sefa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fiscalYear: "FY2026", title: "FY2026 SEFA Draft" }),
    });

    expect(res.status).toBe(201);
    expect(generateSefaReport).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      expect.objectContaining({
        orgId: "org-1",
        entityId: "entity-1",
        userId: "user-1",
        data: { fiscalYear: "FY2026", title: "FY2026 SEFA Draft" },
      }),
    );
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.reportGenerated,
        payload: expect.objectContaining({ report_type: "sefa" }),
      }),
    );
    const renderedCountWhere = new PgDialect().sqlToQuery(
      latestReportCountWhere as Parameters<PgDialect["sqlToQuery"]>[0],
    );
    expect(renderedCountWhere.sql).toContain('"generated_reports"."status"');
    expect(renderedCountWhere.params).toContain("ready");
  });

  it("tracks the first SEFA report when it is the first report of that type", async () => {
    vi.mocked(generateSefaReport).mockResolvedValue({
      ...reportArtifact,
      type: "sefa",
      format: "csv_bundle",
      title: "FY2026 SEFA Draft",
      fileName: "sefa-fy2026.csv",
    } as never);
    const app = buildApp("viewer", "audit_ready", null, 1);

    const res = await app.request("/compliance/reports/sefa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fiscalYear: "FY2026" }),
    });

    expect(res.status).toBe(201);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.firstReportGenerated,
        payload: expect.objectContaining({ report_type: "sefa" }),
      }),
    );
  });

  it("blocks Growth orgs from SEFA endpoints until Audit-Ready", async () => {
    const app = buildApp("viewer", "growth");

    const previewRes = await app.request("/compliance/reports/sefa/preview?fiscalYear=FY2026");
    const generateRes = await app.request("/compliance/reports/sefa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fiscalYear: "FY2026" }),
    });

    expect(previewRes.status).toBe(402);
    expect(generateRes.status).toBe(402);
    expect(getSefaTripwire).not.toHaveBeenCalled();
    expect(generateSefaReport).not.toHaveBeenCalled();
  });

  it("blocks compliance report generation when reports permission is removed", async () => {
    const app = buildApp("viewer", "growth", {
      compliance: "view",
      reports: "none",
    });

    const res = await app.request("/compliance/reports/compliance/grants/grant-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Quarterly Report" }),
    });

    expect(res.status).toBe(403);
    expect(generateGrantComplianceReport).not.toHaveBeenCalled();
  });

  it("blocks acknowledgment generation when donor permission is removed", async () => {
    const app = buildApp("viewer", "starter", {
      compliance: "view",
      donors: "none",
      reports: "view",
    });

    const res = await app.request("/compliance/reports/acknowledgments/donations/donation-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Receipt" }),
    });

    expect(res.status).toBe(403);
    expect(generateAcknowledgmentLetter).not.toHaveBeenCalled();
  });

  it("blocks Starter orgs from the Growth-only compliance report pack endpoints", async () => {
    const app = buildApp("viewer", "starter");

    const complianceRes = await app.request("/compliance/reports/compliance/grants/grant-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Quarterly Report" }),
    });
    const auditRes = await app.request("/compliance/reports/audit/fiscal-years/FY2026", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Audit Export" }),
    });
    const boardRes = await app.request("/compliance/reports/board", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fiscalYear: "FY2026", title: "Board Packet" }),
    });
    const spendDownRes = await app.request("/compliance/reports/spend-down", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grantId: "grant-1" }),
    });

    for (const res of [complianceRes, auditRes, boardRes, spendDownRes]) {
      expect(res.status).toBe(402);
      await expect(res.json()).resolves.toMatchObject({
        error: "insufficient_plan",
        required: "growth",
        current: "starter",
      });
    }
  });

  it("lets Starter orgs keep the IRS 990 and acknowledgment workflows", async () => {
    vi.mocked(generateIrs990Report).mockResolvedValue({
      ...reportArtifact,
      id: "report-3",
      type: "irs_990",
      format: "csv_bundle",
    } as never);
    vi.mocked(generateAcknowledgmentLetter).mockResolvedValue({
      ...reportArtifact,
      id: "report-5",
      type: "acknowledgment",
    } as never);
    const app = buildApp("viewer", "starter");

    expect(
      await app.request("/compliance/reports/irs-990", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fiscalYear: "FY2026", title: "IRS 990 Prep Export" }),
      }),
    ).toMatchObject({ status: 201 });
    expect(
      await app.request("/compliance/reports/acknowledgments/donations/donation-1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Receipt" }),
      }),
    ).toMatchObject({ status: 201 });
  });

  it("allows Growth orgs to generate audit, board, 990, and acknowledgment artifacts", async () => {
    vi.mocked(generateAuditReport).mockResolvedValue({
      ...reportArtifact,
      id: "report-2",
      type: "audit",
      format: "csv_bundle",
    } as never);
    vi.mocked(generateIrs990Report).mockResolvedValue({
      ...reportArtifact,
      id: "report-3",
      type: "irs_990",
      format: "csv_bundle",
    } as never);
    vi.mocked(generateBoardReport).mockResolvedValue({
      ...reportArtifact,
      id: "report-4",
      type: "board",
    } as never);
    vi.mocked(generateAcknowledgmentLetter).mockResolvedValue({
      ...reportArtifact,
      id: "report-5",
      type: "acknowledgment",
    } as never);
    const app = buildApp("viewer", "growth");

    expect(
      await app.request("/compliance/reports/audit/fiscal-years/FY2026", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Audit Export" }),
      }),
    ).toMatchObject({ status: 201 });
    expect(
      await app.request("/compliance/reports/irs-990", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fiscalYear: "FY2026", title: "IRS 990 Prep Export" }),
      }),
    ).toMatchObject({ status: 201 });
    expect(
      await app.request("/compliance/reports/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fiscalYear: "FY2026", title: "Board Packet" }),
      }),
    ).toMatchObject({ status: 201 });
    expect(
      await app.request("/compliance/reports/acknowledgments/donations/donation-1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Receipt" }),
      }),
    ).toMatchObject({ status: 201 });

    for (const generator of [
      generateAuditReport,
      generateIrs990Report,
      generateBoardReport,
      generateAcknowledgmentLetter,
    ]) {
      expect(generator).toHaveBeenCalledWith(
        expect.anything(),
        undefined,
        expect.objectContaining({ entityId: "entity-1" }),
      );
    }
  });

  it("rejects invalid 990 payloads", async () => {
    const app = buildApp("editor");

    const res = await app.request("/compliance/reports/irs-990", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Missing fiscal year" }),
    });

    expect(res.status).toBe(400);
  });

  it("surfaces structured 404 errors from grant and donation generation", async () => {
    vi.mocked(generateGrantComplianceReport).mockRejectedValueOnce(
      new HTTPException(404, { message: "Grant not found" }),
    );
    vi.mocked(generateAcknowledgmentLetter).mockRejectedValueOnce(
      new HTTPException(404, { message: "Donation not found" }),
    );
    const app = buildApp("viewer");

    const grantRes = await app.request("/compliance/reports/compliance/grants/missing-grant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Quarterly Report" }),
    });
    const donationRes = await app.request(
      "/compliance/reports/acknowledgments/donations/missing-donation",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Receipt" }),
      },
    );

    expect(grantRes.status).toBe(404);
    expect(await grantRes.json()).toEqual({ error: "Grant not found" });
    expect(donationRes.status).toBe(404);
    expect(await donationRes.json()).toEqual({ error: "Donation not found" });
  });
});

describe("generated report artifact routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("lists and fetches report artifacts", async () => {
    vi.mocked(listGeneratedReportArtifacts).mockResolvedValue({
      data: [reportArtifact],
      total: 1,
      page: 1,
      pageSize: 25,
    } as never);
    vi.mocked(getGeneratedReportArtifact).mockResolvedValue(reportArtifact as never);
    vi.mocked(getGeneratedReportPreview).mockResolvedValue({
      kind: "html",
      title: reportArtifact.title,
      content: "<h1>Q1 Compliance Report</h1>",
    } as never);
    vi.mocked(downloadReportArtifact).mockResolvedValue(
      new Response("pdf-bytes", {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="q1-compliance.pdf"',
        },
      }) as never,
    );
    const app = buildApp("viewer");

    expect(await app.request("/compliance/reports")).toMatchObject({ status: 200 });
    expect(await app.request("/compliance/reports/report-1")).toMatchObject({ status: 200 });
    expect(await app.request("/compliance/reports/report-1/preview")).toMatchObject({
      status: 200,
    });
    const downloadRes = await app.request("/compliance/reports/report-1/download");
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers.get("Content-Type")).toBe("application/pdf");
  });

  it("blocks report artifact list when reports permission is removed", async () => {
    const app = buildApp("viewer", "growth", {
      compliance: "view",
      reports: "none",
    });
    const res = await app.request("/compliance/reports");

    expect(res.status).toBe(403);
    expect(listGeneratedReportArtifacts).not.toHaveBeenCalled();
  });

  it("blocks report artifact detail, preview, and download when reports permission is removed", async () => {
    const app = buildApp("viewer", "growth", {
      compliance: "view",
      reports: "none",
    });

    const detailRes = await app.request("/compliance/reports/report-1");
    const previewRes = await app.request("/compliance/reports/report-1/preview");
    const downloadRes = await app.request("/compliance/reports/report-1/download");

    expect(detailRes.status).toBe(403);
    expect(previewRes.status).toBe(403);
    expect(downloadRes.status).toBe(403);
    expect(getGeneratedReportArtifact).not.toHaveBeenCalled();
    expect(getGeneratedReportPreview).not.toHaveBeenCalled();
    expect(downloadReportArtifact).not.toHaveBeenCalled();
  });

  it("filters Growth-only report-pack artifacts out of Starter org listings", async () => {
    vi.mocked(listGeneratedReportArtifacts).mockResolvedValue({
      data: [
        {
          ...reportArtifact,
          id: "report-990",
          type: "irs_990",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 25,
    } as never);
    const app = buildApp("viewer", "starter");

    const res = await app.request("/compliance/reports");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      total: 1,
      data: [{ id: "report-990", type: "irs_990" }],
    });
  });

  it("passes Starter-visible report types into listing queries before pagination is applied", async () => {
    vi.mocked(listGeneratedReportArtifacts).mockResolvedValue({
      data: [{ ...reportArtifact, id: "report-990", type: "irs_990" }],
      total: 1,
      page: 1,
      pageSize: 1,
    } as never);
    const app = buildApp("viewer", "starter");

    const res = await app.request("/compliance/reports?page=1&pageSize=1");

    expect(res.status).toBe(200);
    expect(listGeneratedReportArtifacts).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        allowedTypes: ["irs_990", "acknowledgment", "custom_report"],
      }),
    );
  });

  it("keeps Audit-Ready report types out of Growth report listings", async () => {
    vi.mocked(listGeneratedReportArtifacts).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      pageSize: 1,
    } as never);
    const app = buildApp("viewer", "growth");

    const res = await app.request("/compliance/reports?page=1&pageSize=1");

    expect(res.status).toBe(200);
    expect(listGeneratedReportArtifacts).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        allowedTypes: expect.not.arrayContaining(["sefa"]),
      }),
    );
  });

  it("leaves report listing unrestricted for Audit-Ready orgs", async () => {
    vi.mocked(listGeneratedReportArtifacts).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      pageSize: 1,
    } as never);
    const app = buildApp("viewer", "audit_ready");

    const res = await app.request("/compliance/reports?page=1&pageSize=1");

    expect(res.status).toBe(200);
    expect(listGeneratedReportArtifacts).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        allowedTypes: undefined,
      }),
    );
  });

  it("blocks Starter orgs from viewing, previewing, or downloading Growth-only report-pack artifacts", async () => {
    vi.mocked(getGeneratedReportArtifact).mockResolvedValue(reportArtifact as never);
    const app = buildApp("viewer", "starter");

    const artifactRes = await app.request("/compliance/reports/report-1");
    const previewRes = await app.request("/compliance/reports/report-1/preview");
    const downloadRes = await app.request("/compliance/reports/report-1/download");

    for (const res of [artifactRes, previewRes, downloadRes]) {
      expect(res.status).toBe(402);
      await expect(res.json()).resolves.toMatchObject({
        error: "insufficient_plan",
        required: "growth",
        current: "starter",
      });
    }
  });

  it("blocks Growth orgs from viewing, previewing, or downloading SEFA artifacts", async () => {
    vi.mocked(getGeneratedReportArtifact).mockResolvedValue({
      ...reportArtifact,
      type: "sefa",
      format: "csv_bundle",
    } as never);
    const app = buildApp("viewer", "growth");

    const artifactRes = await app.request("/compliance/reports/report-1");
    const previewRes = await app.request("/compliance/reports/report-1/preview");
    const downloadRes = await app.request("/compliance/reports/report-1/download");

    for (const res of [artifactRes, previewRes, downloadRes]) {
      expect(res.status).toBe(402);
      await expect(res.json()).resolves.toMatchObject({
        error: "insufficient_plan",
        required: "audit_ready",
        current: "growth",
      });
    }
    expect(downloadReportArtifact).not.toHaveBeenCalled();
  });

  it("allows Audit-Ready orgs to view, preview, and download SEFA artifacts", async () => {
    vi.mocked(getGeneratedReportArtifact).mockResolvedValue({
      ...reportArtifact,
      type: "sefa",
      format: "csv_bundle",
    } as never);
    vi.mocked(getGeneratedReportPreview).mockResolvedValue({
      kind: "html",
      title: "FY2026 SEFA Draft",
      content: "<h1>FY2026 SEFA Draft</h1>",
    } as never);
    vi.mocked(downloadReportArtifact).mockResolvedValue(
      new Response("csv", {
        status: 200,
        headers: { "Content-Type": "text/csv" },
      }) as never,
    );
    const app = buildApp("viewer", "audit_ready");

    const artifactRes = await app.request("/compliance/reports/report-1");
    const previewRes = await app.request("/compliance/reports/report-1/preview");
    const downloadRes = await app.request("/compliance/reports/report-1/download");

    expect(artifactRes.status).toBe(200);
    expect(previewRes.status).toBe(200);
    expect(downloadRes.status).toBe(200);
    expect(downloadReportArtifact).toHaveBeenCalledOnce();
  });
});

describe("acknowledgment template routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns and updates the org acknowledgment template", async () => {
    vi.mocked(getAcknowledgmentTemplate).mockResolvedValue({
      intro: "Thank you for your generosity.",
      body: "No goods or services were provided in exchange for this contribution.",
      closing: "With gratitude, GrantPipe Foundation",
    } as never);
    vi.mocked(updateAcknowledgmentTemplate).mockResolvedValue({
      intro: "Updated intro",
      body: "Updated body",
      closing: "Updated closing",
    } as never);
    const app = buildApp("admin");

    expect(await app.request("/compliance/templates/acknowledgment")).toMatchObject({
      status: 200,
    });
    expect(
      await app.request("/compliance/templates/acknowledgment", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intro: "Updated intro",
          body: "Updated body",
          closing: "Updated closing",
        }),
      }),
    ).toMatchObject({ status: 200 });
  });

  it("rejects invalid template payloads", async () => {
    const app = buildApp("admin");
    const res = await app.request("/compliance/templates/acknowledgment", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intro: "", body: "", closing: "" }),
    });

    expect(res.status).toBe(400);
  });
});

describe("POST /compliance/reports/spend-down", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("allows viewers to generate spend-down reports", async () => {
    vi.mocked(generateSpendDownReport).mockResolvedValue({
      ...reportArtifact,
      id: "report-sd-1",
      type: "spend_down",
      grantId: "grant-1",
    } as never);
    const app = buildApp("viewer");

    const res = await app.request("/compliance/reports/spend-down", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grantId: "grant-1" }),
    });

    expect(res.status).toBe(201);
    expect(generateSpendDownReport).toHaveBeenCalledOnce();
    const [, , callParams] = vi.mocked(generateSpendDownReport).mock.calls[0]!;
    expect(callParams).toMatchObject({
      orgId: "org-1",
      userId: "user-1",
      data: { grantId: "grant-1" },
    });
  });

  it("accepts optional from, to, and title parameters", async () => {
    vi.mocked(generateSpendDownReport).mockResolvedValue({
      ...reportArtifact,
      id: "report-sd-2",
      type: "spend_down",
    } as never);
    const app = buildApp("viewer");

    const res = await app.request("/compliance/reports/spend-down", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grantId: "grant-1",
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-03-31T23:59:59.999Z",
        title: "Q1 Spend-Down",
      }),
    });

    expect(res.status).toBe(201);
  });

  it("rejects missing grantId", async () => {
    const app = buildApp("viewer");
    const res = await app.request("/compliance/reports/spend-down", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "No grant" }),
    });

    expect(res.status).toBe(400);
    expect(generateSpendDownReport).not.toHaveBeenCalled();
  });

  it("rejects an inverted date range", async () => {
    const app = buildApp("viewer");
    const res = await app.request("/compliance/reports/spend-down", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grantId: "grant-1",
        from: "2026-04-01T00:00:00.000Z",
        to: "2026-03-31T23:59:59.999Z",
      }),
    });

    expect(res.status).toBe(400);
    expect(generateSpendDownReport).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Analytics capture tests
// ---------------------------------------------------------------------------

describe("analytics: report_generated event", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCaptureAnalytics.mockResolvedValue(undefined);
  });

  it("captures report_generated with report_type=compliance on grant compliance success", async () => {
    vi.mocked(generateGrantComplianceReport).mockResolvedValue(reportArtifact as never);
    const app = buildApp("viewer", "growth", null, 2);

    const res = await app.request("/compliance/reports/compliance/grants/grant-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Q1 Report" }),
    });

    expect(res.status).toBe(201);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.reportGenerated,
        payload: expect.objectContaining({
          $insert_id: "report-1:ready",
          report_type: "compliance",
          actorId: "user-1",
        }),
      }),
    );
  });

  it("reports analytics capture failures without failing report generation", async () => {
    const analyticsError = new Error("PostHog unavailable");
    vi.mocked(generateGrantComplianceReport).mockResolvedValue(reportArtifact as never);
    mockCaptureAnalytics.mockRejectedValue(analyticsError);
    const app = buildApp("viewer", "growth", null, 2);

    const res = await app.request("/compliance/reports/compliance/grants/grant-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Q1 Report" }),
    });
    await Promise.resolve();

    expect(res.status).toBe(201);
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      analyticsError,
      "compliance",
      expect.objectContaining({ step: "analytics_capture" }),
    );
  });

  it("reports first-report count failures and skips the first-report event", async () => {
    const countError = new Error("count failed");
    vi.mocked(generateGrantComplianceReport).mockResolvedValue(reportArtifact as never);
    const app = buildApp("viewer", "growth", null, countError);

    const res = await app.request("/compliance/reports/compliance/grants/grant-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Q1 Report" }),
    });

    expect(res.status).toBe(201);
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      countError,
      "compliance",
      expect.objectContaining({
        step: "report_count",
        report_type: "compliance",
      }),
    );
    expect(mockCaptureAnalytics).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventName: ANALYTICS_EVENTS.firstReportGenerated }),
    );
  });

  it("captures report_generated with report_type=audit on audit success", async () => {
    vi.mocked(generateAuditReport).mockResolvedValue({ ...reportArtifact, type: "audit" } as never);
    const app = buildApp("viewer", "growth", null, 2);

    const res = await app.request("/compliance/reports/audit/fiscal-years/FY2026", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Audit Export" }),
    });

    expect(res.status).toBe(201);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.reportGenerated,
        payload: expect.objectContaining({ report_type: "audit" }),
      }),
    );
  });

  it("captures report_generated with report_type=irs_990 on IRS-990 success", async () => {
    vi.mocked(generateIrs990Report).mockResolvedValue({
      ...reportArtifact,
      type: "irs_990",
    } as never);
    const app = buildApp("viewer", "starter", null, 2);

    const res = await app.request("/compliance/reports/irs-990", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fiscalYear: "FY2026", title: "IRS Export" }),
    });

    expect(res.status).toBe(201);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.reportGenerated,
        payload: expect.objectContaining({ report_type: "irs_990" }),
      }),
    );
  });

  it("captures report_generated with report_type=board on board success", async () => {
    vi.mocked(generateBoardReport).mockResolvedValue({
      ...reportArtifact,
      type: "board",
    } as never);
    const app = buildApp("viewer", "growth", null, 2);

    const res = await app.request("/compliance/reports/board", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fiscalYear: "FY2026", title: "Board Packet" }),
    });

    expect(res.status).toBe(201);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.reportGenerated,
        payload: expect.objectContaining({ report_type: "board" }),
      }),
    );
  });

  it("captures report_generated with report_type=acknowledgment on acknowledgment success", async () => {
    vi.mocked(generateAcknowledgmentLetter).mockResolvedValue({
      ...reportArtifact,
      type: "acknowledgment",
    } as never);
    const app = buildApp("viewer", "starter", null, 2);

    const res = await app.request("/compliance/reports/acknowledgments/donations/donation-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Receipt" }),
    });

    expect(res.status).toBe(201);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.reportGenerated,
        payload: expect.objectContaining({ report_type: "acknowledgment" }),
      }),
    );
  });

  it("generates donor year-end statement runs for Growth orgs", async () => {
    vi.mocked(generateDonorYearEndStatementRun).mockResolvedValue({
      ...reportArtifact,
      type: "donor_year_end_statement",
      fiscalYear: "2026",
    } as never);
    const app = buildApp("editor", "growth", null, 2);

    const res = await app.request("/compliance/reports/donor-year-end-statements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year: 2026, deliveryMode: "download" }),
    });

    expect(res.status).toBe(201);
    expect(generateDonorYearEndStatementRun).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      expect.objectContaining({
        orgId: "org-1",
        entityId: "entity-1",
        userId: "user-1",
        data: { year: 2026, deliveryMode: "download", minimumAmountCents: 0 },
      }),
    );
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.reportGenerated,
        payload: expect.objectContaining({ report_type: "donor_year_end_statement" }),
      }),
    );
  });

  it("captures report_generated with report_type=spend_down on spend-down success", async () => {
    vi.mocked(generateSpendDownReport).mockResolvedValue({
      ...reportArtifact,
      type: "spend_down",
    } as never);
    const app = buildApp("viewer", "growth", null, 2);

    const res = await app.request("/compliance/reports/spend-down", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grantId: "grant-1" }),
    });

    expect(res.status).toBe(201);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.reportGenerated,
        payload: expect.objectContaining({ report_type: "spend_down" }),
      }),
    );
  });
});

describe("analytics: report_generation_failed — non-Error thrown values", () => {
  // When the service rejects with a plain object (not an Error instance), the route
  // catch block wraps it as new Error("unknown") before capturing analytics, then
  // re-throws the original plain object. Hono's onError does not handle non-Error
  // throws, so app.request() itself rejects — we catch that and verify analytics.
  beforeEach(() => {
    vi.resetAllMocks();
    mockCaptureAnalytics.mockResolvedValue(undefined);
  });

  it("names the failure 'Error' when grant compliance service rejects with a non-Error value", async () => {
    vi.mocked(generateGrantComplianceReport).mockRejectedValue({ code: "GC_FAIL" });
    const app = buildApp("viewer", "growth", null, 0);

    try {
      await app.request("/compliance/reports/compliance/grants/grant-1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Q1 Report" }),
      });
    } catch {
      // non-Error rethrow escapes Hono's onError — expected
    }

    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.reportGenerationFailed,
        payload: expect.objectContaining({ report_type: "compliance", failure_type: "Error" }),
      }),
    );
  });

  it("names the failure 'Error' when audit service rejects with a non-Error value", async () => {
    vi.mocked(generateAuditReport).mockRejectedValue({ code: "AUDIT_FAIL" });
    const app = buildApp("viewer", "growth", null, 0);

    try {
      await app.request("/compliance/reports/audit/fiscal-years/FY2026", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Audit Export" }),
      });
    } catch {
      // non-Error rethrow escapes Hono's onError — expected
    }

    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.reportGenerationFailed,
        payload: expect.objectContaining({ report_type: "audit", failure_type: "Error" }),
      }),
    );
  });

  it("names the failure 'Error' when IRS-990 service rejects with a non-Error value", async () => {
    vi.mocked(generateIrs990Report).mockRejectedValue({ code: "IRS_FAIL" });
    const app = buildApp("viewer", "starter", null, 0);

    try {
      await app.request("/compliance/reports/irs-990", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fiscalYear: "FY2026", title: "IRS Export" }),
      });
    } catch {
      // non-Error rethrow escapes Hono's onError — expected
    }

    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.reportGenerationFailed,
        payload: expect.objectContaining({ report_type: "irs_990", failure_type: "Error" }),
      }),
    );
  });

  it("names the failure 'Error' when board service rejects with a non-Error value", async () => {
    // Plain object exercises the false branch of `err instanceof Error ? err : new Error("unknown")`.
    vi.mocked(generateBoardReport).mockRejectedValue({ code: "BOARD_FAIL" });
    const app = buildApp("viewer", "growth", null, 0);

    try {
      await app.request("/compliance/reports/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fiscalYear: "FY2026", title: "Board Packet" }),
      });
    } catch {
      // non-Error rethrow escapes Hono's onError — expected
    }

    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.reportGenerationFailed,
        payload: expect.objectContaining({ report_type: "board", failure_type: "Error" }),
      }),
    );
  });

  it("names the failure 'Error' when acknowledgment service rejects with a non-Error value", async () => {
    vi.mocked(generateAcknowledgmentLetter).mockRejectedValue({ code: "ACK_FAIL" });
    const app = buildApp("viewer", "starter", null, 0);

    try {
      await app.request("/compliance/reports/acknowledgments/donations/donation-1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Receipt" }),
      });
    } catch {
      // non-Error rethrow escapes Hono's onError — expected
    }

    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.reportGenerationFailed,
        payload: expect.objectContaining({ report_type: "acknowledgment", failure_type: "Error" }),
      }),
    );
  });

  it("names the failure 'Error' when spend-down service rejects with a non-Error value", async () => {
    vi.mocked(generateSpendDownReport).mockRejectedValue({ code: "SD_FAIL" });
    const app = buildApp("viewer", "growth", null, 0);

    try {
      await app.request("/compliance/reports/spend-down", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grantId: "grant-1" }),
      });
    } catch {
      // non-Error rethrow escapes Hono's onError — expected
    }

    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.reportGenerationFailed,
        payload: expect.objectContaining({ report_type: "spend_down", failure_type: "Error" }),
      }),
    );
  });

  it("names the failure 'Error' when SEFA service rejects with a non-Error value", async () => {
    vi.mocked(generateSefaReport).mockRejectedValue({ code: "SEFA_FAIL" });
    const app = buildApp("viewer", "audit_ready", null, 0);

    try {
      await app.request("/compliance/reports/sefa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fiscalYear: "FY2026", title: "SEFA Draft" }),
      });
    } catch {
      // non-Error rethrow escapes Hono's onError - expected
    }

    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.reportGenerationFailed,
        payload: expect.objectContaining({ report_type: "sefa", failure_type: "Error" }),
      }),
    );
  });
});

describe("analytics: report_generation_failed event", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCaptureAnalytics.mockResolvedValue(undefined);
  });

  it("captures report_generation_failed and rethrows when grant compliance service throws", async () => {
    const cause = new Error("DB timeout");
    cause.name = "TimeoutError";
    vi.mocked(generateGrantComplianceReport).mockRejectedValue(cause);
    const app = buildApp("viewer", "growth", null, 0);

    const res = await app.request("/compliance/reports/compliance/grants/grant-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Q1 Report" }),
    });

    expect(res.status).toBe(500);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.reportGenerationFailed,
        payload: expect.objectContaining({
          report_type: "compliance",
          failure_type: "TimeoutError",
        }),
      }),
    );
    expect(mockCaptureAnalytics).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventName: ANALYTICS_EVENTS.reportGenerated }),
    );
  });

  it("captures report_generation_failed and rethrows when IRS-990 service throws", async () => {
    const cause = new HTTPException(422, { message: "Invalid fiscal year" });
    vi.mocked(generateIrs990Report).mockRejectedValue(cause);
    const app = buildApp("viewer", "starter", null, 0);

    const res = await app.request("/compliance/reports/irs-990", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fiscalYear: "FY2026", title: "Export" }),
    });

    expect(res.status).toBe(422);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.reportGenerationFailed,
        payload: expect.objectContaining({
          report_type: "irs_990",
          failure_type: expect.any(String),
        }),
      }),
    );
  });

  it("captures report_generation_failed and rethrows when audit service throws", async () => {
    const cause = new Error("DB failure");
    cause.name = "DatabaseError";
    vi.mocked(generateAuditReport).mockRejectedValue(cause);
    const app = buildApp("viewer", "growth", null, 0);

    const res = await app.request("/compliance/reports/audit/fiscal-years/FY2026", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Audit Export" }),
    });

    expect(res.status).toBe(500);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.reportGenerationFailed,
        payload: expect.objectContaining({ report_type: "audit", failure_type: "DatabaseError" }),
      }),
    );
    expect(mockCaptureAnalytics).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventName: ANALYTICS_EVENTS.reportGenerated }),
    );
  });

  it("captures report_generation_failed and rethrows when board service throws", async () => {
    const cause = new Error("Render failure");
    cause.name = "RenderError";
    vi.mocked(generateBoardReport).mockRejectedValue(cause);
    const app = buildApp("viewer", "growth", null, 0);

    const res = await app.request("/compliance/reports/board", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fiscalYear: "FY2026", title: "Board Packet" }),
    });

    expect(res.status).toBe(500);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.reportGenerationFailed,
        payload: expect.objectContaining({ report_type: "board", failure_type: "RenderError" }),
      }),
    );
    expect(mockCaptureAnalytics).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventName: ANALYTICS_EVENTS.reportGenerated }),
    );
  });

  it("captures report_generation_failed and rethrows when acknowledgment service throws", async () => {
    const cause = new Error("Donor not found");
    cause.name = "NotFoundError";
    vi.mocked(generateAcknowledgmentLetter).mockRejectedValue(cause);
    const app = buildApp("viewer", "starter", null, 0);

    const res = await app.request("/compliance/reports/acknowledgments/donations/donation-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Receipt" }),
    });

    expect(res.status).toBe(500);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.reportGenerationFailed,
        payload: expect.objectContaining({
          report_type: "acknowledgment",
          failure_type: "NotFoundError",
        }),
      }),
    );
    expect(mockCaptureAnalytics).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventName: ANALYTICS_EVENTS.reportGenerated }),
    );
  });

  it("captures report_generation_failed and rethrows when spend-down service throws", async () => {
    const cause = new Error("Grant not found");
    cause.name = "NotFoundError";
    vi.mocked(generateSpendDownReport).mockRejectedValue(cause);
    const app = buildApp("viewer", "growth", null, 0);

    const res = await app.request("/compliance/reports/spend-down", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grantId: "grant-1" }),
    });

    expect(res.status).toBe(500);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.reportGenerationFailed,
        payload: expect.objectContaining({
          report_type: "spend_down",
          failure_type: "NotFoundError",
        }),
      }),
    );
    expect(mockCaptureAnalytics).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventName: ANALYTICS_EVENTS.reportGenerated }),
    );
  });
});

describe("analytics: first_report_generated event", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCaptureAnalytics.mockResolvedValue(undefined);
  });

  it("captures first_report_generated on the first grant compliance report", async () => {
    vi.mocked(generateGrantComplianceReport).mockResolvedValue(reportArtifact as never);
    // reportCount=1 means this is the first compliance report for this org
    const app = buildApp("viewer", "growth", null, 1);

    const res = await app.request("/compliance/reports/compliance/grants/grant-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "First Q1 Report" }),
    });

    expect(res.status).toBe(201);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.firstReportGenerated,
        payload: expect.objectContaining({
          $insert_id: "report-1:first-ready",
          report_type: "compliance",
        }),
      }),
    );
  });

  it("captures first_report_generated when the org report count is 1 after generation", async () => {
    vi.mocked(generateIrs990Report).mockResolvedValue({
      ...reportArtifact,
      type: "irs_990",
    } as never);
    // reportCount=1 means this is the first report of this type
    const app = buildApp("viewer", "starter", null, 1);

    const res = await app.request("/compliance/reports/irs-990", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fiscalYear: "FY2026", title: "First IRS Export" }),
    });

    expect(res.status).toBe(201);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.firstReportGenerated,
        payload: expect.objectContaining({ report_type: "irs_990", actorId: "user-1" }),
      }),
    );
  });

  it("does NOT capture first_report_generated when the org already has more than 1 report of that type", async () => {
    vi.mocked(generateIrs990Report).mockResolvedValue({
      ...reportArtifact,
      type: "irs_990",
    } as never);
    // reportCount=3: not the first
    const app = buildApp("viewer", "starter", null, 3);

    const res = await app.request("/compliance/reports/irs-990", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fiscalYear: "FY2026", title: "Nth IRS Export" }),
    });

    expect(res.status).toBe(201);
    expect(mockCaptureAnalytics).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventName: ANALYTICS_EVENTS.firstReportGenerated }),
    );
  });

  it("captures first_report_generated on the first acknowledgment letter", async () => {
    vi.mocked(generateAcknowledgmentLetter).mockResolvedValue({
      ...reportArtifact,
      type: "acknowledgment",
    } as never);
    const app = buildApp("viewer", "starter", null, 1);

    const res = await app.request("/compliance/reports/acknowledgments/donations/donation-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "First Receipt" }),
    });

    expect(res.status).toBe(201);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.firstReportGenerated,
        payload: expect.objectContaining({ report_type: "acknowledgment" }),
      }),
    );
  });

  it("captures first_report_generated on the first audit report", async () => {
    vi.mocked(generateAuditReport).mockResolvedValue({
      ...reportArtifact,
      type: "audit",
    } as never);
    const app = buildApp("viewer", "growth", null, 1);

    const res = await app.request("/compliance/reports/audit/fiscal-years/FY2026", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "First Audit" }),
    });

    expect(res.status).toBe(201);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.firstReportGenerated,
        payload: expect.objectContaining({ report_type: "audit" }),
      }),
    );
  });

  it("captures first_report_generated on the first board report", async () => {
    vi.mocked(generateBoardReport).mockResolvedValue({
      ...reportArtifact,
      type: "board",
    } as never);
    const app = buildApp("viewer", "growth", null, 1);

    const res = await app.request("/compliance/reports/board", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fiscalYear: "FY2026", title: "First Board Packet" }),
    });

    expect(res.status).toBe(201);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.firstReportGenerated,
        payload: expect.objectContaining({ report_type: "board" }),
      }),
    );
  });

  it("captures first_report_generated on the first spend-down report", async () => {
    vi.mocked(generateSpendDownReport).mockResolvedValue({
      ...reportArtifact,
      type: "spend_down",
    } as never);
    const app = buildApp("viewer", "growth", null, 1);

    const res = await app.request("/compliance/reports/spend-down", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grantId: "grant-1" }),
    });

    expect(res.status).toBe(201);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.firstReportGenerated,
        payload: expect.objectContaining({ report_type: "spend_down" }),
      }),
    );
  });
});
