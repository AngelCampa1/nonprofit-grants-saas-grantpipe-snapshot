import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { ANALYTICS_EVENTS, type PermissionMap } from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { errorHandler } from "../../middleware/error-handler";
import { restrictionRoutes } from "./routes";

const { mockCaptureAnalytics } = vi.hoisted(() => ({
  mockCaptureAnalytics: vi.fn(),
}));

vi.mock("../../lib/integrations", () => ({
  getIntegrations: vi.fn(() => ({
    analytics: {
      capture: mockCaptureAnalytics,
    },
  })),
}));

vi.mock("./service", () => ({
  createRestrictionAddition: vi.fn(),
  createRestrictionEvidenceLink: vi.fn(),
  createRestrictionRelease: vi.fn(),
  createRestrictionTerm: vi.fn(),
  deleteRestrictionTerm: vi.fn(),
  generateRestrictedRollforward: vi.fn(),
  linkRestrictionEvidence: vi.fn(),
  listRestrictionAlerts: vi.fn(),
  listRestrictionTerms: vi.fn(),
  updateRestrictionTerm: vi.fn(),
}));

vi.mock("../org/trial-usage", () => ({
  recordTrialFeatureUsage: vi.fn(),
}));

import {
  createRestrictionAddition,
  createRestrictionRelease,
  createRestrictionTerm,
  deleteRestrictionTerm,
  generateRestrictedRollforward,
  linkRestrictionEvidence,
  listRestrictionAlerts,
  listRestrictionTerms,
  updateRestrictionTerm,
} from "./service";
import { recordTrialFeatureUsage } from "../org/trial-usage";

function makeApp(
  role: "admin" | "editor" | "viewer" | "auditor" = "admin",
  permissions: Partial<PermissionMap> | null = null,
  subscriptionOverrides: Partial<NonNullable<AppEnv["Variables"]["orgSubscription"]>> = {},
) {
  return new Hono<AppEnv>()
    .onError(errorHandler)
    .use("/restrictions/*", async (c, next) => {
      c.set("db", { db: true } as never);
      c.set("orgId", "org-1");
      c.set("user", { id: "user-1", email: "user@example.com" } as AppEnv["Variables"]["user"]);
      c.set("session", { id: "sess-1", userId: "user-1" });
      c.set("memberRole", role);
      c.set("memberPermissions", permissions as PermissionMap | null);
      c.set("orgSubscription", {
        subscriptionStatus: "active",
        trialEndsAt: null,
        planTier: "growth",
        onboardingCompleted: true,
        planSelectedAt: new Date("2026-01-01T00:00:00.000Z"),
        stripeSubscriptionId: "sub-1",
        ...subscriptionOverrides,
      });
      await next();
    })
    .route("/restrictions", restrictionRoutes);
}

const term = {
  id: "term-1",
  orgId: "org-1",
  title: "Scholarship",
  restrictionType: "purpose",
  source: "donor",
  beginningBalanceCents: 10000,
};

const termBody = {
  fundId: "fund-1",
  restrictionType: "purpose",
  source: "donor",
  title: "Scholarship",
  purposeStatement: "Scholarships only",
  beginningBalanceCents: 10000,
};

describe("restriction routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCaptureAnalytics.mockResolvedValue(undefined);
  });

  it("captures privacy-safe restriction lifecycle events", async () => {
    vi.mocked(createRestrictionTerm).mockResolvedValue(term as never);
    vi.mocked(updateRestrictionTerm).mockResolvedValue(term as never);
    vi.mocked(deleteRestrictionTerm).mockResolvedValue({ ...term, deletedAt: new Date() } as never);
    vi.mocked(createRestrictionAddition).mockResolvedValue({ id: "addition-1" } as never);
    vi.mocked(createRestrictionRelease).mockResolvedValue({
      release: { id: "release-1" },
    } as never);
    vi.mocked(linkRestrictionEvidence).mockResolvedValue({ id: "evidence-1" } as never);
    vi.mocked(generateRestrictedRollforward).mockImplementation(async (_db, params) => {
      await params.onFirstReady?.();
      return { report: { id: "report-1" } } as never;
    });
    const app = makeApp("admin");

    await app.request("/restrictions/terms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(termBody),
    });
    await app.request("/restrictions/terms/term-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Updated" }),
    });
    await app.request("/restrictions/terms/term-1/additions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amountCents: 500,
        date: "2026-01-15T00:00:00.000Z",
        source: "donation",
      }),
    });
    await app.request("/restrictions/terms/term-1/releases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amountCents: 250,
        date: "2026-02-15T00:00:00.000Z",
        reason: "Eligible spend",
      }),
    });
    await app.request("/restrictions/releases/release-1/evidence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: "doc-1", evidenceType: "invoice", label: "Invoice" }),
    });
    await app.request("/restrictions/reports/rollforward", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attemptId: "00000000-0000-4000-8000-000000000099",
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-03-31T00:00:00.000Z",
      }),
    });
    await app.request("/restrictions/terms/term-1", { method: "DELETE" });

    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.restrictionTermCreated,
      payload: {
        actorId: "user-1",
        entity_type: "restriction_term",
        restriction_type: "purpose",
        source: "donor",
      },
    });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.restrictionAdditionCreated,
      payload: { actorId: "user-1", entity_type: "restriction_addition", source: "manual" },
    });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.restrictionReleaseCreated,
      payload: { actorId: "user-1", entity_type: "restriction_release" },
    });
    expect(mockCaptureAnalytics).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventName: ANALYTICS_EVENTS.restrictedRollforwardGenerated }),
    );

    const serializedCalls = JSON.stringify(mockCaptureAnalytics.mock.calls);
    expect(serializedCalls).not.toContain("Scholarship");
    expect(serializedCalls).not.toContain("term-1");
    expect(serializedCalls).not.toContain("doc-1");
    expect(serializedCalls).not.toContain("Eligible spend");
  });

  it("does not count or emit a replayed rollforward as a new trial feature use", async () => {
    vi.mocked(generateRestrictedRollforward).mockResolvedValue({
      report: { id: "report-1", status: "ready" },
    } as never);
    const app = makeApp("admin", null, {
      subscriptionStatus: "trialing",
      trialEndsAt: new Date("2026-12-31T00:00:00.000Z"),
    });

    const response = await app.request("/restrictions/reports/rollforward", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attemptId: "00000000-0000-4000-8000-000000000099",
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-03-31T00:00:00.000Z",
      }),
    });

    expect(response.status).toBe(201);
    expect(generateRestrictedRollforward).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ trialUsageTier: "growth" }),
    );
    expect(recordTrialFeatureUsage).not.toHaveBeenCalled();
    expect(mockCaptureAnalytics).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventName: ANALYTICS_EVENTS.restrictedRollforwardGenerated }),
    );
  });

  it("does not count a trial feature use when rollforward storage fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(generateRestrictedRollforward).mockRejectedValueOnce(new Error("R2 unavailable"));
    const app = makeApp("admin", null, {
      subscriptionStatus: "trialing",
      trialEndsAt: new Date("2026-12-31T00:00:00.000Z"),
    });

    const response = await app.request("/restrictions/reports/rollforward", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attemptId: "00000000-0000-4000-8000-000000000099",
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-03-31T00:00:00.000Z",
      }),
    });

    expect(response.status).toBe(500);
    expect(recordTrialFeatureUsage).not.toHaveBeenCalled();
    expect(mockCaptureAnalytics).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventName: ANALYTICS_EVENTS.restrictedRollforwardGenerated }),
    );
    consoleError.mockRestore();
  });

  it("wires term list, create, update, and delete requests to the service", async () => {
    vi.mocked(listRestrictionTerms).mockResolvedValue([term] as never);
    vi.mocked(createRestrictionTerm).mockResolvedValue(term as never);
    vi.mocked(updateRestrictionTerm).mockResolvedValue({ ...term, title: "Updated" } as never);
    vi.mocked(deleteRestrictionTerm).mockResolvedValue({ ...term, deletedAt: new Date() } as never);
    const app = makeApp("admin");

    const listRes = await app.request("/restrictions/terms?page=2&pageSize=10&fundId=fund-1");
    const createRes = await app.request("/restrictions/terms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(termBody),
    });
    const updateRes = await app.request("/restrictions/terms/term-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Updated" }),
    });
    const deleteRes = await app.request("/restrictions/terms/term-1", { method: "DELETE" });

    expect(listRes.status).toBe(200);
    expect(createRes.status).toBe(201);
    expect(updateRes.status).toBe(200);
    expect(deleteRes.status).toBe(200);
    expect(listRestrictionTerms).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        fundId: "fund-1",
        page: 2,
        pageSize: 10,
      }),
    );
    expect(createRestrictionTerm).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ data: expect.objectContaining(termBody) }),
    );
    expect(updateRestrictionTerm).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        termId: "term-1",
        data: expect.objectContaining({ title: "Updated" }),
      }),
    );
    expect(deleteRestrictionTerm).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ termId: "term-1" }),
    );
  });

  it("blocks editors from deleting restriction terms", async () => {
    vi.mocked(deleteRestrictionTerm).mockResolvedValue({ ...term, deletedAt: new Date() } as never);
    const app = makeApp("editor");

    const res = await app.request("/restrictions/terms/term-1", { method: "DELETE" });

    expect(res.status).toBe(403);
    expect(deleteRestrictionTerm).not.toHaveBeenCalled();
  });

  it("wires additions, releases, evidence, alerts, and rollforward routes", async () => {
    vi.mocked(createRestrictionAddition).mockResolvedValue({ id: "addition-1" } as never);
    vi.mocked(createRestrictionRelease).mockResolvedValue({
      release: { id: "release-1" },
    } as never);
    vi.mocked(linkRestrictionEvidence).mockResolvedValue({ id: "evidence-1" } as never);
    vi.mocked(listRestrictionAlerts).mockResolvedValue([{ id: "alert-1" }] as never);
    vi.mocked(generateRestrictedRollforward).mockResolvedValue({
      report: { id: "report-1" },
    } as never);
    const app = makeApp("admin");

    const additionRes = await app.request("/restrictions/terms/term-1/additions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amountCents: 500,
        date: "2026-01-15T00:00:00.000Z",
        source: "donation",
      }),
    });
    const releaseRes = await app.request("/restrictions/terms/term-1/releases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amountCents: 250,
        date: "2026-02-15T00:00:00.000Z",
        reason: "Eligible spend",
      }),
    });
    const evidenceRes = await app.request("/restrictions/releases/release-1/evidence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: "doc-1",
        evidenceType: "invoice",
        label: "Invoice",
      }),
    });
    const alertsRes = await app.request(
      "/restrictions/alerts?periodStart=2026-01-01T00:00:00.000Z",
    );
    const rollforwardRes = await app.request("/restrictions/reports/rollforward", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attemptId: "00000000-0000-4000-8000-000000000099",
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-03-31T00:00:00.000Z",
      }),
    });

    expect(additionRes.status).toBe(201);
    expect(releaseRes.status).toBe(201);
    expect(evidenceRes.status).toBe(201);
    expect(alertsRes.status).toBe(200);
    expect(rollforwardRes.status).toBe(201);
    expect(createRestrictionAddition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ termId: "term-1" }),
    );
    expect(createRestrictionRelease).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ termId: "term-1" }),
    );
    expect(linkRestrictionEvidence).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ releaseId: "release-1" }),
    );
    expect(listRestrictionAlerts).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ periodStart: "2026-01-01T00:00:00.000Z" }),
    );
    expect(generateRestrictedRollforward).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ env: undefined }),
    );
  });

  it("rejects cached clients without a rollforward attempt id before creating an artifact", async () => {
    vi.mocked(generateRestrictedRollforward).mockResolvedValue({
      report: { id: "report-1" },
    } as never);
    const app = makeApp("admin");
    const body = JSON.stringify({
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-03-31T00:00:00.000Z",
    });

    const response = await app.request("/restrictions/reports/rollforward", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    expect(response.status).toBe(400);
    expect(generateRestrictedRollforward).not.toHaveBeenCalled();
  });

  it("passes selected Starter entitlements to Starter trial restriction services", async () => {
    vi.mocked(listRestrictionTerms).mockResolvedValue([term] as never);
    const app = makeApp("admin", null, {
      subscriptionStatus: "trialing",
      trialEndsAt: new Date("2099-01-01T00:00:00.000Z"),
      planTier: "starter",
      stripeSubscriptionId: null,
    });

    const res = await app.request("/restrictions/terms");

    expect(res.status).toBe(200);
    expect(listRestrictionTerms).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ planTier: "starter" }),
    );
    expect(recordTrialFeatureUsage).not.toHaveBeenCalled();
  });

  it("records Audit-Ready usage when active trials generate evidence packages", async () => {
    vi.mocked(generateRestrictedRollforward).mockResolvedValue({ id: "report-1" } as never);
    const app = makeApp("admin", null, {
      subscriptionStatus: "trialing",
      trialEndsAt: new Date("2099-01-01T00:00:00.000Z"),
      planTier: "starter",
      stripeSubscriptionId: null,
    });

    const res = await app.request("/restrictions/reports/rollforward", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attemptId: "00000000-0000-4000-8000-000000000099",
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-03-31T00:00:00.000Z",
        includeEvidencePackage: true,
      }),
    });

    expect(res.status).toBe(201);
    expect(generateRestrictedRollforward).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ trialUsageTier: "audit_ready" }),
    );
    expect(recordTrialFeatureUsage).not.toHaveBeenCalled();
  });

  it("enforces route permissions before calling services", async () => {
    const app = makeApp("viewer", { funds: "view", reports: "none", documents: "none" });

    const createRes = await app.request("/restrictions/terms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(termBody),
    });
    const evidenceRes = await app.request("/restrictions/releases/release-1/evidence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: "doc-1", evidenceType: "invoice" }),
    });
    const rollforwardRes = await app.request("/restrictions/reports/rollforward", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-03-31T00:00:00.000Z",
      }),
    });

    expect(createRes.status).toBe(403);
    expect(evidenceRes.status).toBe(403);
    expect(rollforwardRes.status).toBe(403);
    expect(createRestrictionTerm).not.toHaveBeenCalled();
    expect(linkRestrictionEvidence).not.toHaveBeenCalled();
    expect(generateRestrictedRollforward).not.toHaveBeenCalled();
  });

  it("rejects invalid route payloads before calling services", async () => {
    const app = makeApp("admin");

    const createRes = await app.request("/restrictions/terms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "" }),
    });
    const releaseRes = await app.request("/restrictions/terms/term-1/releases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountCents: -1 }),
    });

    expect(createRes.status).toBe(400);
    expect(releaseRes.status).toBe(400);
    expect(createRestrictionTerm).not.toHaveBeenCalled();
    expect(createRestrictionRelease).not.toHaveBeenCalled();
  });

  it("captures source=donation when addition has donationId", async () => {
    vi.mocked(createRestrictionAddition).mockResolvedValue({ id: "addition-1" } as never);
    const app = makeApp("admin");

    const res = await app.request("/restrictions/terms/term-1/additions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amountCents: 500,
        date: "2026-01-15T00:00:00.000Z",
        donationId: "donation-1",
      }),
    });

    expect(res.status).toBe(201);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ source: "donation" }),
      }),
    );
  });

  it("captures source=grant when addition has grantId", async () => {
    vi.mocked(createRestrictionAddition).mockResolvedValue({ id: "addition-1" } as never);
    const app = makeApp("admin");

    const res = await app.request("/restrictions/terms/term-1/additions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amountCents: 500,
        date: "2026-01-15T00:00:00.000Z",
        grantId: "grant-1",
      }),
    });

    expect(res.status).toBe(201);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ source: "grant" }),
      }),
    );
  });

  it("captures source=journal_line when addition has journalLineId", async () => {
    vi.mocked(createRestrictionAddition).mockResolvedValue({ id: "addition-1" } as never);
    const app = makeApp("admin");

    const res = await app.request("/restrictions/terms/term-1/additions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amountCents: 500,
        date: "2026-01-15T00:00:00.000Z",
        journalLineId: "jl-1",
      }),
    });

    expect(res.status).toBe(201);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ source: "journal_line" }),
      }),
    );
  });

  it("skips capture when orgId is absent from context", async () => {
    vi.mocked(createRestrictionTerm).mockResolvedValue(term as never);
    const app = new Hono<AppEnv>()
      .onError(errorHandler)
      .use("/restrictions/*", async (c, next) => {
        c.set("db", { db: true } as never);
        // orgId intentionally omitted — simulates context missing org
        c.set("user", { id: "user-1", email: "user@example.com" } as AppEnv["Variables"]["user"]);
        c.set("session", { id: "sess-1", userId: "user-1" });
        c.set("memberRole", "admin");
        c.set("memberPermissions", null);
        c.set("orgSubscription", {
          subscriptionStatus: "active",
          trialEndsAt: null,
          planTier: "growth",
          onboardingCompleted: true,
          planSelectedAt: new Date("2026-01-01T00:00:00.000Z"),
          stripeSubscriptionId: "sub-1",
        });
        await next();
      })
      .route("/restrictions", restrictionRoutes);

    const res = await app.request("/restrictions/terms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(termBody),
    });

    expect(res.status).toBe(201);
    expect(mockCaptureAnalytics).not.toHaveBeenCalled();
  });

  it("swallowCapture absorbs a rejected analytics promise without failing the request", async () => {
    vi.mocked(createRestrictionTerm).mockResolvedValue(term as never);
    mockCaptureAnalytics.mockRejectedValue(new Error("PostHog unreachable"));
    const app = makeApp("admin");

    const res = await app.request("/restrictions/terms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(termBody),
    });

    expect(res.status).toBe(201);
  });
});
