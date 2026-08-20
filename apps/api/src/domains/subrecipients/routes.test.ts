import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { ANALYTICS_EVENTS, type PermissionMap } from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { errorHandler } from "../../middleware/error-handler";
import { subrecipientRoutes } from "./routes";

const { mockCaptureAnalytics } = vi.hoisted(() => ({
  mockCaptureAnalytics: vi.fn(),
}));

vi.mock("./service", () => ({
  createCorrectiveAction: vi.fn(),
  createEvidenceBundle: vi.fn(),
  createFinding: vi.fn(),
  createMonitoringLog: vi.fn(),
  createRiskAssessment: vi.fn(),
  createSubaward: vi.fn(),
  createSubrecipient: vi.fn(),
  deleteSubrecipient: vi.fn(),
  generateMonitoringTasks: vi.fn(),
  getMonitoringTaskTemplates: vi.fn(),
  getSubaward: vi.fn(),
  getSubrecipient: vi.fn(),
  listSubawards: vi.fn(),
  listSubrecipients: vi.fn(),
  updateCorrectiveAction: vi.fn(),
  updateFinding: vi.fn(),
  updateMonitoringTask: vi.fn(),
  updateSubaward: vi.fn(),
  updateSubrecipient: vi.fn(),
}));

vi.mock("../../lib/integrations", () => ({
  getIntegrations: () => ({
    analytics: { capture: mockCaptureAnalytics },
  }),
}));

import {
  createCorrectiveAction,
  createEvidenceBundle,
  createFinding,
  createMonitoringLog,
  createRiskAssessment,
  createSubaward,
  createSubrecipient,
  deleteSubrecipient,
  generateMonitoringTasks,
  getSubaward,
  getSubrecipient,
  listSubawards,
  listSubrecipients,
  updateCorrectiveAction,
  updateFinding,
  updateMonitoringTask,
  updateSubaward,
  updateSubrecipient,
} from "./service";

function makeApp(
  role: "admin" | "editor" | "viewer" | "auditor" = "admin",
  planTier = "audit_ready",
  permissions: Partial<PermissionMap> | null = null,
  subscriptionOverrides: Partial<NonNullable<AppEnv["Variables"]["orgSubscription"]>> = {},
) {
  return new Hono<AppEnv>()
    .onError(errorHandler)
    .use("/subrecipients/*", async (c, next) => {
      c.set("db", {
        db: true,
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            onConflictDoUpdate: vi.fn(),
            onConflictDoNothing: vi.fn(),
          })),
        })),
      } as never);
      c.set("orgId", "org-1");
      c.set("user", { id: "user-1", email: "user@example.com" } as AppEnv["Variables"]["user"]);
      c.set("session", { id: "sess-1", userId: "user-1" });
      c.set("memberRole", role);
      c.set("memberPermissions", permissions as PermissionMap | null);
      c.set("orgSubscription", {
        subscriptionStatus: "active",
        trialEndsAt: null,
        planTier,
        onboardingCompleted: true,
        planSelectedAt: new Date("2026-01-01T00:00:00.000Z"),
        stripeSubscriptionId: "sub-1",
        ...subscriptionOverrides,
      });
      await next();
    })
    .route("/subrecipients", subrecipientRoutes);
}

const subrecipientBody = { name: "Community Partner", status: "active" };
const subawardBody = {
  grantId: "grant-1",
  title: "Youth services",
  amountCents: 100000,
  startDate: "2026-05-06T12:00:00.000Z",
  endDate: "2026-12-31T12:00:00.000Z",
};

describe("subrecipient routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCaptureAnalytics.mockResolvedValue({ id: "analytics-1" });
  });

  it("wires portfolio and subrecipient CRUD requests to the service", async () => {
    vi.mocked(listSubrecipients).mockResolvedValue({
      rows: [{ id: "sub-1" }],
      total: 1,
      summary: { subrecipients: 1, overdueTasks: 0, openFindings: 0, highRisk: 0 },
    } as never);
    vi.mocked(getSubrecipient).mockResolvedValue({ id: "sub-1" } as never);
    vi.mocked(createSubrecipient).mockResolvedValue({ id: "sub-1" } as never);
    vi.mocked(updateSubrecipient).mockResolvedValue({ id: "sub-1", status: "watchlist" } as never);
    vi.mocked(deleteSubrecipient).mockResolvedValue({ id: "sub-1" } as never);
    const app = makeApp("admin");

    const listRes = await app.request(
      "/subrecipients?page=2&pageSize=10&status=watchlist&overdueTasks=true",
    );
    const getRes = await app.request("/subrecipients/sub-1");
    const createRes = await app.request("/subrecipients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subrecipientBody),
    });
    const updateRes = await app.request("/subrecipients/sub-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "watchlist" }),
    });
    const deleteRes = await app.request("/subrecipients/sub-1", { method: "DELETE" });

    expect(listRes.status).toBe(200);
    expect(await listRes.json()).toMatchObject({
      data: [{ id: "sub-1" }],
      total: 1,
      summary: { subrecipients: 1 },
    });
    expect(getRes.status).toBe(200);
    expect(createRes.status).toBe(201);
    expect(updateRes.status).toBe(200);
    expect(deleteRes.status).toBe(200);
    expect(listSubrecipients).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        status: "watchlist",
        overdueTasks: true,
      }),
    );
    expect(createSubrecipient).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ data: subrecipientBody }),
    );
    expect(updateSubrecipient).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ subrecipientId: "sub-1" }),
    );
  });

  it("blocks editor-level users from deleting subrecipient records", async () => {
    const app = makeApp("editor");

    const res = await app.request("/subrecipients/sub-1", { method: "DELETE" });

    expect(res.status).toBe(403);
    expect(deleteSubrecipient).not.toHaveBeenCalled();
  });

  it("wires grant-filtered subaward list reads for grant detail monitoring tabs", async () => {
    vi.mocked(listSubawards).mockResolvedValue([{ id: "subaward-1" }] as never);
    const app = makeApp("viewer", "audit_ready", { compliance: "view" });

    const res = await app.request("/subrecipients/subawards?grantId=grant-1");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [{ id: "subaward-1" }] });
    expect(listSubawards).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        grantId: "grant-1",
      }),
    );
  });

  it("blocks active Starter trials from Audit-Ready subrecipient monitoring", async () => {
    vi.mocked(listSubrecipients).mockResolvedValue({
      rows: [{ id: "sub-1" }],
      total: 1,
      summary: { subrecipients: 1, overdueTasks: 0, openFindings: 0, highRisk: 0 },
    } as never);
    const app = makeApp("admin", "starter", null, {
      subscriptionStatus: "trialing",
      trialEndsAt: new Date("2099-01-01T00:00:00.000Z"),
      stripeSubscriptionId: null,
    });

    const res = await app.request("/subrecipients");

    expect(res.status).toBe(402);
    await expect(res.json()).resolves.toMatchObject({
      error: "insufficient_plan",
      required: "audit_ready",
      current: "starter",
    });
    expect(listSubrecipients).not.toHaveBeenCalled();
  });

  it("wires subaward risk, task, log, finding, corrective-action, and bundle routes", async () => {
    vi.mocked(createSubaward).mockResolvedValue({ id: "subaward-1" } as never);
    vi.mocked(getSubaward).mockResolvedValue({ id: "subaward-1" } as never);
    vi.mocked(updateSubaward).mockResolvedValue({ id: "subaward-1" } as never);
    vi.mocked(createRiskAssessment).mockResolvedValue({ id: "risk-1" } as never);
    vi.mocked(generateMonitoringTasks).mockResolvedValue([{ id: "task-1" }] as never);
    vi.mocked(updateMonitoringTask).mockResolvedValue({
      id: "task-1",
      status: "completed",
    } as never);
    vi.mocked(createMonitoringLog).mockResolvedValue({ id: "log-1" } as never);
    vi.mocked(createFinding).mockResolvedValue({ id: "finding-1" } as never);
    vi.mocked(createCorrectiveAction).mockResolvedValue({ id: "action-1" } as never);
    vi.mocked(updateFinding).mockResolvedValue({ id: "finding-1", status: "resolved" } as never);
    vi.mocked(updateCorrectiveAction).mockResolvedValue({
      id: "action-1",
      status: "completed",
    } as never);
    vi.mocked(createEvidenceBundle).mockResolvedValue({ report: { id: "bundle-1" } } as never);
    const app = makeApp("admin");

    const subawardRes = await app.request("/subrecipients/sub-1/subawards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subawardBody),
    });
    const updateSubawardRes = await app.request("/subrecipients/subawards/subaward-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
    const getSubawardRes = await app.request("/subrecipients/subawards/subaward-1");
    const riskRes = await app.request("/subrecipients/subawards/subaward-1/risk-assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checklist: {
          priorFindings: "no",
          newPartner: "yes",
          complexRequirements: "no",
          highDollarAward: "no",
          weakControls: "unknown",
        },
        suggestedRiskRating: "medium",
      }),
    });
    const tasksRes = await app.request(
      "/subrecipients/subawards/subaward-1/monitoring-tasks/generate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riskRating: "high" }),
      },
    );
    const updateTaskRes = await app.request("/subrecipients/monitoring-tasks/task-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
    const logRes = await app.request("/subrecipients/subawards/subaward-1/monitoring-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        logType: "desk_review",
        title: "Desk review",
        occurredAt: "2026-05-06T12:00:00.000Z",
        summary: "Reviewed evidence.",
      }),
    });
    const findingRes = await app.request("/subrecipients/subawards/subaward-1/findings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Missing support",
        severity: "high",
        description: "Invoice support missing.",
      }),
    });
    const actionRes = await app.request("/subrecipients/findings/finding-1/corrective-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        findingId: "finding-1",
        title: "Upload support",
        dueDate: "2026-06-01T12:00:00.000Z",
      }),
    });
    const updateFindingRes = await app.request("/subrecipients/findings/finding-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "resolved" }),
    });
    const updateActionRes = await app.request("/subrecipients/corrective-actions/action-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
    const bundleRes = await app.request("/subrecipients/subawards/subaward-1/evidence-bundle", {
      method: "POST",
    });

    expect(subawardRes.status).toBe(201);
    expect(updateSubawardRes.status).toBe(200);
    expect(getSubawardRes.status).toBe(200);
    expect(riskRes.status).toBe(201);
    expect(tasksRes.status).toBe(201);
    expect(updateTaskRes.status).toBe(200);
    expect(logRes.status).toBe(201);
    expect(findingRes.status).toBe(201);
    expect(actionRes.status).toBe(201);
    expect(updateFindingRes.status).toBe(200);
    expect(updateActionRes.status).toBe(200);
    expect(bundleRes.status).toBe(201);
    expect(createSubaward).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ subrecipientId: "sub-1" }),
    );
    expect(generateMonitoringTasks).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ subawardId: "subaward-1" }),
    );
    expect(updateMonitoringTask).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ taskId: "task-1" }),
    );
  });

  it("creates corrective actions from the finding path without requiring duplicate body state", async () => {
    vi.mocked(createCorrectiveAction).mockResolvedValue({ id: "action-1" } as never);
    const app = makeApp("admin");

    const actionRes = await app.request("/subrecipients/findings/finding-1/corrective-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Upload support",
        dueDate: "2026-06-01T12:00:00.000Z",
      }),
    });

    expect(actionRes.status).toBe(201);
    expect(createCorrectiveAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        findingId: "finding-1",
        data: expect.objectContaining({
          title: "Upload support",
          dueDate: "2026-06-01T12:00:00.000Z",
          status: "open",
        }),
      }),
    );
  });

  it("captures server-side subrecipient monitoring events with safe dimensions", async () => {
    vi.mocked(createSubrecipient).mockResolvedValue({ id: "sub-1" } as never);
    vi.mocked(updateSubrecipient).mockResolvedValue({ id: "sub-1", status: "watchlist" } as never);
    vi.mocked(deleteSubrecipient).mockResolvedValue({ id: "sub-1" } as never);
    vi.mocked(createSubaward).mockResolvedValue({ id: "subaward-1" } as never);
    vi.mocked(updateSubaward).mockResolvedValue({ id: "subaward-1", status: "active" } as never);
    vi.mocked(createRiskAssessment).mockResolvedValue({ id: "risk-1" } as never);
    vi.mocked(generateMonitoringTasks).mockResolvedValue([{ id: "task-1" }] as never);
    vi.mocked(updateMonitoringTask).mockResolvedValue({
      id: "task-1",
      status: "completed",
    } as never);
    vi.mocked(createMonitoringLog).mockResolvedValue({ id: "log-1" } as never);
    vi.mocked(createFinding).mockResolvedValue({ id: "finding-1" } as never);
    vi.mocked(createCorrectiveAction).mockResolvedValue({ id: "action-1" } as never);
    vi.mocked(updateFinding).mockResolvedValue({ id: "finding-1", status: "resolved" } as never);
    vi.mocked(updateCorrectiveAction).mockResolvedValue({
      id: "action-1",
      status: "completed",
    } as never);
    vi.mocked(createEvidenceBundle).mockResolvedValue({ report: { id: "bundle-1" } } as never);
    const app = makeApp("admin");

    await app.request("/subrecipients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subrecipientBody),
    });
    await app.request("/subrecipients/sub-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "watchlist" }),
    });
    await app.request("/subrecipients/sub-1", { method: "DELETE" });
    await app.request("/subrecipients/sub-1/subawards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subawardBody),
    });
    await app.request("/subrecipients/subawards/subaward-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
    await app.request("/subrecipients/subawards/subaward-1/risk-assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checklist: {
          priorFindings: "no",
          newPartner: "yes",
          complexRequirements: "no",
          highDollarAward: "no",
          weakControls: "unknown",
        },
        suggestedRiskRating: "medium",
      }),
    });
    await app.request("/subrecipients/subawards/subaward-1/monitoring-tasks/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ riskRating: "high" }),
    });
    await app.request("/subrecipients/monitoring-tasks/task-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
    await app.request("/subrecipients/subawards/subaward-1/monitoring-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        logType: "desk_review",
        title: "Desk review",
        occurredAt: "2026-05-06T12:00:00.000Z",
        summary: "Reviewed evidence.",
      }),
    });
    await app.request("/subrecipients/subawards/subaward-1/findings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Missing support",
        severity: "high",
        description: "Invoice support missing.",
      }),
    });
    await app.request("/subrecipients/findings/finding-1/corrective-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        findingId: "finding-1",
        title: "Upload support",
        dueDate: "2026-06-01T12:00:00.000Z",
      }),
    });
    await app.request("/subrecipients/findings/finding-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "resolved" }),
    });
    await app.request("/subrecipients/corrective-actions/action-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
    await app.request("/subrecipients/subawards/subaward-1/evidence-bundle", {
      method: "POST",
    });

    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.subrecipientCreated,
      payload: { actorId: "user-1" },
    });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.subrecipientUpdated,
      payload: { actorId: "user-1", status: "watchlist" },
    });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.subawardRiskAssessmentCreated,
      payload: { actorId: "user-1", risk_rating: "medium" },
    });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.subawardMonitoringLogCreated,
      payload: { actorId: "user-1", log_type: "desk_review" },
    });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.subawardFindingCreated,
      payload: { actorId: "user-1", severity: "high" },
    });
    expect(mockCaptureAnalytics).toHaveBeenCalledTimes(14);
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("Community Partner");
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("Youth services");
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("Desk review");
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("subaward-1");
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("finding-1");
  });

  it("allows Audit-Ready compliance viewers to read but blocks mutations and exports", async () => {
    vi.mocked(listSubrecipients).mockResolvedValue({
      rows: [],
      total: 0,
      summary: { subrecipients: 0, overdueTasks: 0, openFindings: 0, highRisk: 0 },
    } as never);
    vi.mocked(createEvidenceBundle).mockResolvedValue({ bundle: { id: "bundle-1" } } as never);
    const app = makeApp("viewer", "audit_ready", { compliance: "view" });

    const listRes = await app.request("/subrecipients");
    const evidenceRes = await app.request("/subrecipients/subawards/subaward-1/evidence-bundle", {
      method: "POST",
    });
    const createRes = await app.request("/subrecipients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subrecipientBody),
    });

    expect(listRes.status).toBe(200);
    expect(evidenceRes.status).toBe(403);
    expect(createRes.status).toBe(403);
    expect(createEvidenceBundle).not.toHaveBeenCalled();
    expect(createSubrecipient).not.toHaveBeenCalled();
  });

  it("returns 402 for lower-tier reads and mutations", async () => {
    const app = makeApp("admin", "growth");

    const listRes = await app.request("/subrecipients");
    const subawardsRes = await app.request("/subrecipients/subawards?grantId=grant-1");
    const getRes = await app.request("/subrecipients/sub-1");
    const createRes = await app.request("/subrecipients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subrecipientBody),
    });

    expect(listRes.status).toBe(402);
    expect(subawardsRes.status).toBe(402);
    expect(getRes.status).toBe(402);
    expect(createRes.status).toBe(402);
    expect(await createRes.json()).toMatchObject({ error: "insufficient_plan" });
    expect(listSubrecipients).not.toHaveBeenCalled();
    expect(listSubawards).not.toHaveBeenCalled();
    expect(getSubrecipient).not.toHaveBeenCalled();
    expect(createSubrecipient).not.toHaveBeenCalled();
  });
});
