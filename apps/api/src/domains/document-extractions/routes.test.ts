import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { ANALYTICS_EVENTS, AI_USAGE_CAP_REACHED, type Role } from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { AppError } from "../../lib/app-error";
import { errorHandler } from "../../middleware/error-handler";
import { documentExtractionRoutes } from "./routes";

const { mockCaptureAnalytics, mockCaptureBackgroundException } = vi.hoisted(() => ({
  mockCaptureAnalytics: vi.fn().mockResolvedValue({ id: "analytics-1" }),
  mockCaptureBackgroundException: vi.fn(),
}));

vi.mock("./service", () => ({
  cancelDocumentExtraction: vi.fn(),
  commitDocumentExtraction: vi.fn(),
  createDocumentExtraction: vi.fn(),
  getDocumentExtraction: vi.fn(),
  recordDocumentExtractionAction: vi.fn(),
}));

vi.mock("../org/trial-usage", () => ({
  recordTrialFeatureUsage: vi.fn(),
}));

vi.mock("../../lib/integrations", () => ({
  getIntegrations: vi.fn(() => ({
    analytics: { capture: mockCaptureAnalytics },
  })),
}));

vi.mock("../../lib/sentry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/sentry")>();
  return {
    ...actual,
    captureBackgroundException: mockCaptureBackgroundException,
  };
});

import {
  cancelDocumentExtraction,
  commitDocumentExtraction,
  createDocumentExtraction,
  getDocumentExtraction,
  recordDocumentExtractionAction,
} from "./service";
import { recordTrialFeatureUsage } from "../org/trial-usage";

function makeApp(
  planTier = "growth",
  subscriptionOverrides: Partial<NonNullable<AppEnv["Variables"]["orgSubscription"]>> = {},
  role: Role = "admin",
) {
  return new Hono<AppEnv>()
    .onError(errorHandler)
    .use("/document-extractions/*", async (c, next) => {
      c.set("db", { db: true } as never);
      c.set("orgId", "org-1");
      c.set("user", { id: "user-1", email: "user@example.com" } as AppEnv["Variables"]["user"]);
      c.set("session", { id: "session-1", userId: "user-1" });
      c.set("memberRole", role);
      c.set("memberPermissions", null);
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
    .route("/document-extractions", documentExtractionRoutes);
}

function startBody(documentId: string) {
  return {
    documentId,
    attemptId: "28e0825f-7e61-4bda-b663-a3b5fa2f147b",
  };
}

describe("document extraction routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("wires start, read, action, cancel, and commit requests to the service", async () => {
    vi.mocked(createDocumentExtraction).mockResolvedValue({
      extraction: { id: "ext-1" },
      created: true,
    } as never);
    vi.mocked(getDocumentExtraction).mockResolvedValue({ id: "ext-1" } as never);
    vi.mocked(recordDocumentExtractionAction).mockResolvedValue({ id: "action-1" } as never);
    vi.mocked(cancelDocumentExtraction).mockResolvedValue({
      id: "ext-1",
      status: "canceled",
    } as never);
    vi.mocked(commitDocumentExtraction).mockResolvedValue({
      grantId: "grant-1",
      funderId: "funder-1",
    } as never);
    const app = makeApp();

    const startRes = await app.request("/document-extractions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: "doc-1",
        attemptId: "28e0825f-7e61-4bda-b663-a3b5fa2f147b",
      }),
    });
    const getRes = await app.request("/document-extractions/ext-1");
    const actionRes = await app.request("/document-extractions/ext-1/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fieldId: "field-1", action: "accept", nextValue: "Award" }),
    });
    const cancelRes = await app.request("/document-extractions/ext-1/cancel", { method: "POST" });
    const commitRes = await app.request("/document-extractions/ext-1/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        funderDecision: { action: "create_new" },
        grantDecision: { action: "create_new" },
        requiredGrantBasics: {
          name: "Youth STEM",
          amountCents: 100000,
          startDate: "2026-01-01T00:00:00.000Z",
          endDate: "2026-12-31T00:00:00.000Z",
        },
      }),
    });

    expect(startRes.status).toBe(201);
    expect(getRes.status).toBe(200);
    expect(actionRes.status).toBe(201);
    expect(cancelRes.status).toBe(200);
    expect(commitRes.status).toBe(201);
    expect(createDocumentExtraction).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      expect.objectContaining({
        orgId: "org-1",
        userId: "user-1",
        documentId: "doc-1",
        attemptId: "28e0825f-7e61-4bda-b663-a3b5fa2f147b",
      }),
    );
    expect(recordDocumentExtractionAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ extractionId: "ext-1" }),
    );
    expect(commitDocumentExtraction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ planTier: "growth", extractionId: "ext-1" }),
    );
  });

  it("returns an idempotent winner without repeating started analytics", async () => {
    vi.mocked(createDocumentExtraction).mockResolvedValue({
      extraction: { id: "ext-existing", status: "pending" },
      created: false,
    } as never);
    const app = makeApp();

    const response = await app.request("/document-extractions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: "doc-1",
        attemptId: "28e0825f-7e61-4bda-b663-a3b5fa2f147b",
      }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "ext-existing", status: "pending" });
    expect(mockCaptureAnalytics).not.toHaveBeenCalled();
  });

  it("rejects cached clients that omit the required attempt id", async () => {
    const app = makeApp();

    const response = await app.request("/document-extractions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: "doc-legacy" }),
    });

    expect(response.status).toBe(400);
    expect(createDocumentExtraction).not.toHaveBeenCalled();
    expect(mockCaptureAnalytics).not.toHaveBeenCalled();
  });

  it("returns service error bodies and statuses for handled domain errors", async () => {
    vi.mocked(createDocumentExtraction).mockRejectedValue(
      Object.assign(new Error("insufficient_plan"), {
        status: 402,
        body: { error: "insufficient_plan", required: "growth", current: "starter" },
      }),
    );
    vi.mocked(getDocumentExtraction).mockRejectedValue(
      Object.assign(new Error("Document extraction not found"), { status: 404 }),
    );
    const app = makeApp("starter");

    const startRes = await app.request("/document-extractions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(startBody("doc-1")),
    });
    const getRes = await app.request("/document-extractions/missing");

    expect(startRes.status).toBe(402);
    expect(await startRes.json()).toEqual({
      error: "insufficient_plan",
      required: "growth",
      current: "starter",
    });
    expect(getRes.status).toBe(404);
    expect(await getRes.json()).toEqual({ error: "Document extraction not found" });

    vi.mocked(getDocumentExtraction).mockRejectedValue({ status: 418 });
    const bareStatusRes = await app.request("/document-extractions/bare-status");
    expect(bareStatusRes.status).toBe(418);
    expect(await bareStatusRes.json()).toEqual({ error: "request_failed" });
  });

  it("reports handled 5xx start failures before returning the existing response", async () => {
    vi.mocked(createDocumentExtraction).mockRejectedValue({
      status: 500,
      body: { error: "award_intake_not_configured" },
    });

    const res = await makeApp().request("/document-extractions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(startBody("doc-1")),
    });

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "award_intake_not_configured" });
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(expect.any(Error), "award_intake", {
      operation: "start",
      status: "500",
      failure_type: "award_intake_not_configured",
    });
  });

  it("uses selected Starter entitlements for active Starter trials", async () => {
    vi.mocked(createDocumentExtraction).mockResolvedValue({
      extraction: { id: "ext-1" },
      created: true,
    } as never);
    const app = makeApp("starter", {
      subscriptionStatus: "trialing",
      trialEndsAt: new Date("2099-01-01T00:00:00.000Z"),
      stripeSubscriptionId: null,
    });

    const res = await app.request("/document-extractions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(startBody("doc-1")),
    });

    expect(res.status).toBe(201);
    expect(createDocumentExtraction).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      expect.objectContaining({ planTier: "starter" }),
    );
    expect(recordTrialFeatureUsage).not.toHaveBeenCalled();
  });

  it("passes auditor-safe document entity types when reading extraction details", async () => {
    vi.mocked(getDocumentExtraction).mockResolvedValue({ id: "ext-1" } as never);
    const app = makeApp("growth", {}, "auditor");

    const res = await app.request("/document-extractions/ext-1");

    expect(res.status).toBe(200);
    expect(getDocumentExtraction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        extractionId: "ext-1",
        allowedDocumentEntityTypes: expect.arrayContaining(["grant", "payment_request"]),
      }),
    );
  });

  it("returns handled service errors for action, cancel, and commit failures", async () => {
    vi.mocked(recordDocumentExtractionAction).mockRejectedValue(
      Object.assign(new Error("Extraction is not ready for review actions"), { status: 409 }),
    );
    vi.mocked(cancelDocumentExtraction).mockRejectedValue(
      Object.assign(new Error("Extraction cannot be canceled"), { status: 409 }),
    );
    vi.mocked(commitDocumentExtraction).mockRejectedValue(
      Object.assign(new Error("review_incomplete"), {
        status: 409,
        body: { error: "review_incomplete", fields: ["grant.name"] },
      }),
    );
    const app = makeApp();

    const actionRes = await app.request("/document-extractions/ext-1/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fieldId: "field-1", action: "accept" }),
    });
    const cancelRes = await app.request("/document-extractions/ext-1/cancel", { method: "POST" });
    const commitRes = await app.request("/document-extractions/ext-1/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        funderDecision: { action: "create_new" },
        grantDecision: { action: "create_new" },
        requiredGrantBasics: { name: "Youth STEM", amountCents: 100000 },
      }),
    });

    expect(actionRes.status).toBe(409);
    expect(await actionRes.json()).toEqual({
      error: "Extraction is not ready for review actions",
    });
    expect(cancelRes.status).toBe(409);
    expect(await cancelRes.json()).toEqual({ error: "Extraction cannot be canceled" });
    expect(commitRes.status).toBe(409);
    expect(await commitRes.json()).toEqual({
      error: "review_incomplete",
      fields: ["grant.name"],
    });
  });

  it("rethrows unexpected errors to the app error handler", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(getDocumentExtraction).mockRejectedValue(new Error("unexpected"));
    const app = makeApp();

    try {
      const res = await app.request("/document-extractions/ext-1");

      expect(res.status).toBe(500);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("captures persistence preparation failures without sensitive identifiers", async () => {
    vi.mocked(createDocumentExtraction).mockRejectedValue(
      Object.assign(new Error("Award intake could not be prepared"), {
        status: 503,
        body: { error: "award_intake_persistence_failed" },
      }),
    );
    const app = makeApp();

    const res = await app.request("/document-extractions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(startBody("doc-sensitive")),
    });

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: "award_intake_persistence_failed" });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.awardIntakeFailed,
        payload: expect.objectContaining({
          entity_type: "award_intake",
          operation: "start",
          failure_type: "award_intake_persistence_failed",
        }),
      }),
    );
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(expect.any(Error), "award_intake", {
      operation: "start",
      status: "503",
      failure_type: "award_intake_persistence_failed",
    });
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("doc-sensitive");
    expect(JSON.stringify(mockCaptureBackgroundException.mock.calls)).not.toContain(
      "doc-sensitive",
    );
  });

  it("captures safe analytics for award intake operations and handled failures", async () => {
    vi.mocked(createDocumentExtraction)
      .mockResolvedValueOnce({ extraction: { id: "ext-1" }, created: true } as never)
      .mockRejectedValueOnce(
        Object.assign(new Error("award_intake_queue_failed"), {
          status: 503,
          body: { error: "award_intake_queue_failed" },
        }),
      )
      .mockRejectedValueOnce(
        Object.assign(new Error("unsafe failure detail"), {
          status: 400,
          body: { error: "Needs review by Finance" },
        }),
      );
    vi.mocked(recordDocumentExtractionAction).mockResolvedValue({ id: "action-1" } as never);
    vi.mocked(commitDocumentExtraction)
      .mockResolvedValueOnce({ grantId: "grant-1", funderId: "funder-1" } as never)
      .mockRejectedValueOnce(
        Object.assign(new Error("review_incomplete"), {
          status: 409,
          body: { error: "review_incomplete", fields: ["grant.name"] },
        }),
      );
    const app = makeApp();

    await app.request("/document-extractions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(startBody("doc-1")),
    });
    await app.request("/document-extractions/ext-1/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fieldId: "field-1",
        action: "map_existing",
        mappedEntityType: "funder",
        mappedEntityId: "funder-1",
        note: "Use the existing funder record",
      }),
    });
    await app.request("/document-extractions/ext-1/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        funderDecision: { action: "map_existing", existingId: "funder-1" },
        grantDecision: { action: "create_new" },
        requiredGrantBasics: {
          name: "Youth STEM",
          amountCents: 100000,
          startDate: "2026-01-01T00:00:00.000Z",
          endDate: "2026-12-31T00:00:00.000Z",
        },
      }),
    });
    await app.request("/document-extractions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(startBody("doc-2")),
    });
    await app.request("/document-extractions/ext-2/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        funderDecision: { action: "create_new" },
        grantDecision: { action: "create_new" },
        requiredGrantBasics: { name: "Youth STEM", amountCents: 100000 },
      }),
    });
    await app.request("/document-extractions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(startBody("doc-3")),
    });

    expect(mockCaptureAnalytics).toHaveBeenCalledTimes(6);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        eventName: ANALYTICS_EVENTS.awardIntakeStarted,
        payload: expect.objectContaining({
          actorId: "user-1",
          entity_type: "award_intake",
          plan: "growth",
        }),
      }),
    );
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.awardIntakeFieldActioned,
        payload: expect.objectContaining({
          entity_type: "award_intake_field",
          operation: "map_existing",
          mapped_entity_type: "funder",
        }),
      }),
    );
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.awardIntakeCommitted,
        payload: expect.objectContaining({
          entity_type: "award_intake",
          funder_decision: "map_existing",
          grant_decision: "create_new",
          amount_present: true,
          date_range_present: true,
        }),
      }),
    );
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.awardIntakeFailed,
        payload: expect.objectContaining({
          entity_type: "award_intake",
          operation: "start",
          failure_type: "award_intake_queue_failed",
        }),
      }),
    );
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.awardIntakeFailed,
        payload: expect.objectContaining({
          entity_type: "award_intake",
          operation: "commit",
          failure_type: "review_incomplete",
        }),
      }),
    );
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.awardIntakeFailed,
        payload: expect.objectContaining({
          entity_type: "award_intake",
          operation: "start",
          failure_type: "request_failed",
        }),
      }),
    );

    const serializedCalls = JSON.stringify(mockCaptureAnalytics.mock.calls);
    expect(serializedCalls).not.toContain("doc-1");
    expect(serializedCalls).not.toContain("doc-2");
    expect(serializedCalls).not.toContain("doc-3");
    expect(serializedCalls).not.toContain("ext-1");
    expect(serializedCalls).not.toContain("ext-2");
    expect(serializedCalls).not.toContain("field-1");
    expect(serializedCalls).not.toContain("funder-1");
    expect(serializedCalls).not.toContain("Youth STEM");
    expect(serializedCalls).not.toContain("Use the existing funder record");
    expect(serializedCalls).not.toContain("Needs review by Finance");
  });

  it("surfaces the award-intake cap-reached upgrade contract and analytics", async () => {
    vi.mocked(createDocumentExtraction).mockRejectedValue(
      new AppError(402, AI_USAGE_CAP_REACHED, AI_USAGE_CAP_REACHED, {
        feature: "award_intake",
        cap: 5,
        used: 5,
        currentPlan: "starter",
        upgradeToPlan: "growth",
      }),
    );
    const app = makeApp("starter");

    const res = await app.request("/document-extractions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(startBody("doc-1")),
    });

    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({
      error: AI_USAGE_CAP_REACHED,
      errorCode: AI_USAGE_CAP_REACHED,
      feature: "award_intake",
      cap: 5,
      used: 5,
      currentPlan: "starter",
      upgradeToPlan: "growth",
    });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.awardIntakeFailed,
        payload: expect.objectContaining({
          entity_type: "award_intake",
          operation: "start",
          failure_type: AI_USAGE_CAP_REACHED,
        }),
      }),
    );
  });
});
