import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ANALYTICS_EVENTS, AI_USAGE_CAP_REACHED } from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { AppError } from "../../lib/app-error";
import { errorHandler } from "../../middleware/error-handler";
import { captureBackgroundException } from "../../lib/sentry";
import { ledgerAssistantRoutes } from "./routes";

const analyticsCapture = vi.fn();

vi.mock("./service", () => ({
  askLedger: vi.fn(),
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
        planTier: "audit_ready",
        subscriptionStatus: "active",
        trialEndsAt: null,
      } as never);
      for (const [key, value] of Object.entries(overrides)) {
        c.set(key as never, value as never);
      }
      await next();
    })
    .route("/ask-ledger", ledgerAssistantRoutes);
}

describe("ledgerAssistantRoutes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analyticsCapture.mockResolvedValue({ id: "analytics-1" });
    vi.mocked(service.askLedger).mockResolvedValue({
      answer: "No active grant budget lines are over budget.",
      mode: "deterministic",
      confidence: "high",
      safeguards: ["Numbers are calculated from posted GrantPipe records only."],
      citations: [
        {
          type: "report_row",
          label: "Budget sentinel",
          href: "/grants/budget-sentinel",
          value: "0 at-risk budget lines",
        },
      ],
      suggestedFollowUps: ["Which grants are over budget?"],
    });
  });

  it("answers questions with org context, allowed entities, and safe analytics", async () => {
    const res = await buildApp({ entityId: "entity-1" }).request("/ask-ledger/ask", {
      method: "POST",
      body: JSON.stringify({ question: "Which grants are over budget?" }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(service.askLedger).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      entityId: "entity-1",
      planTier: "audit_ready",
      input: { question: "Which grants are over budget?", mode: "deterministic" },
      allowedEntities: ["donors", "donations", "grants", "funds"],
    });
    expect(analyticsCapture).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.ledgerAssistantAsked,
      payload: {
        operation: "ask",
        surface: "ask_ledger",
        mode: "deterministic",
        intent_type: "grant_budget_risk",
        date_range_present: false,
        query_length_bucket: "25_100",
      },
    });
    expect(analyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.ledgerAssistantAnswered,
        payload: expect.objectContaining({
          intent_type: "grant_budget_risk",
          result_count_bucket: "1_10",
          citation_count_bucket: "1_10",
          confidence: "high",
        }),
      }),
    );
    expect(JSON.stringify(analyticsCapture.mock.calls)).not.toContain(
      "Which grants are over budget",
    );
  });

  it("passes auditor-safe entity access to the service", async () => {
    const res = await buildApp({ memberRole: "auditor" }).request("/ask-ledger/ask", {
      method: "POST",
      body: JSON.stringify({ question: "Show restricted fund balances" }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(service.askLedger).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ allowedEntities: ["grants", "funds"] }),
    );
  });

  it("captures fund intent, date presence, and large result buckets safely", async () => {
    vi.mocked(service.askLedger).mockResolvedValueOnce({
      answer: "Restricted fund balances are ready.",
      mode: "deterministic",
      confidence: "medium",
      safeguards: ["Numbers are calculated from posted GrantPipe records only."],
      citations: Array.from({ length: 101 }, (_, index) => ({
        type: "fund" as const,
        label: `Fund ${index}`,
        href: "/reports/builder",
        value: "$1",
      })),
      suggestedFollowUps: [],
    });

    const res = await buildApp().request("/ask-ledger/ask", {
      method: "POST",
      body: JSON.stringify({ question: "Show restricted fund balances this fiscal year" }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(analyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.ledgerAssistantAsked,
        payload: expect.objectContaining({
          intent_type: "restricted_fund_balance",
          date_range_present: true,
        }),
      }),
    );
    expect(analyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.ledgerAssistantAnswered,
        payload: expect.objectContaining({
          confidence: "medium",
          result_count_bucket: "100_plus",
          citation_count_bucket: "100_plus",
        }),
      }),
    );
  });

  it("captures unsupported short questions with the smallest query bucket", async () => {
    const res = await buildApp().request("/ask-ledger/ask", {
      method: "POST",
      body: JSON.stringify({ question: "Cash flow?" }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(analyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.ledgerAssistantAsked,
        payload: expect.objectContaining({
          intent_type: "unsupported",
          query_length_bucket: "1_10",
        }),
      }),
    );
  });

  it("captures mid-size questions with contract-valid answer telemetry", async () => {
    vi.mocked(service.askLedger).mockResolvedValueOnce({
      answer: "I could not find matching ledger rows for that question.",
      mode: "deterministic",
      confidence: "low",
      safeguards: ["No answer is shown without GrantPipe records behind it."],
      citations: [
        {
          type: "report_row",
          label: "Report builder",
          href: "/reports/builder",
          value: "Use saved reports for custom questions",
        },
      ],
      suggestedFollowUps: [],
    });

    const res = await buildApp().request("/ask-ledger/ask", {
      method: "POST",
      body: JSON.stringify({ question: "Show budget risk" }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(analyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.ledgerAssistantAsked,
        payload: expect.objectContaining({
          intent_type: "grant_budget_risk",
          query_length_bucket: "10_25",
        }),
      }),
    );
    expect(analyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.ledgerAssistantAnswered,
        payload: expect.objectContaining({
          result_count_bucket: "1_10",
          citation_count_bucket: "1_10",
          confidence: "low",
        }),
      }),
    );
  });

  it("blocks Starter with a Growth upsell and gate analytics", async () => {
    const res = await buildApp({
      orgSubscription: { planTier: "starter", subscriptionStatus: "active", trialEndsAt: null },
    } as never).request("/ask-ledger/ask", {
      method: "POST",
      body: JSON.stringify({ question: "Which grants are over budget?" }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(402);
    await expect(res.json()).resolves.toEqual({
      error: "insufficient_plan",
      required: "growth",
      current: "starter",
    });
    expect(service.askLedger).not.toHaveBeenCalled();
    expect(analyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.ledgerAssistantGateBlocked,
        payload: {
          operation: "gate_blocked",
          surface: "ask_ledger",
          plan_tier: "starter",
        },
      }),
    );
  });

  it("fails closed when the service returns an answer without citations", async () => {
    vi.mocked(service.askLedger).mockResolvedValueOnce({
      answer: "I could not find matching ledger rows for that question.",
      mode: "deterministic",
      confidence: "low",
      safeguards: ["No answer is shown without GrantPipe records behind it."],
      citations: [],
      suggestedFollowUps: [],
    });

    const res = await buildApp().request("/ask-ledger/ask", {
      method: "POST",
      body: JSON.stringify({ question: "Show budget risk" }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(500);
    expect(analyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.ledgerAssistantFailed,
        payload: expect.objectContaining({ failure_type: "ZodError" }),
      }),
    );
  });

  it("requires accounting visibility for ledger answers", async () => {
    const res = await buildApp({
      memberRole: "viewer",
      memberPermissions: { accounting: "none" } as never,
    }).request("/ask-ledger/ask", {
      method: "POST",
      body: JSON.stringify({ question: "Which grants are over budget?" }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(403);
    expect(service.askLedger).not.toHaveBeenCalled();
  });

  it("captures failed answers without leaking the raw question", async () => {
    vi.mocked(service.askLedger).mockRejectedValueOnce(new Error("Provider offline"));

    const res = await buildApp().request("/ask-ledger/ask", {
      method: "POST",
      body: JSON.stringify({ question: "Show donor Jane Smith giving history" }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(500);
    expect(analyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.ledgerAssistantFailed,
        payload: expect.objectContaining({ failure_type: "Error" }),
      }),
    );
    expect(JSON.stringify(analyticsCapture.mock.calls)).not.toContain("Jane Smith");
  });

  it("uses an unknown failure type for non-Error answer failures", async () => {
    vi.mocked(service.askLedger).mockRejectedValueOnce("offline");

    await expect(
      buildApp().request("/ask-ledger/ask", {
        method: "POST",
        body: JSON.stringify({ question: "What changed in cash flow?" }),
        headers: { "content-type": "application/json" },
      }),
    ).rejects.toBe("offline");
    expect(analyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.ledgerAssistantFailed,
        payload: expect.objectContaining({ failure_type: "unknown" }),
      }),
    );
  });

  it("surfaces downstream ask-ledger cap-reached failures and analytics", async () => {
    vi.mocked(service.askLedger).mockRejectedValueOnce(
      new AppError(402, AI_USAGE_CAP_REACHED, AI_USAGE_CAP_REACHED, {
        feature: "ask_your_ledger",
        cap: 0,
        used: 0,
        currentPlan: "growth",
        upgradeToPlan: "growth",
      }),
    );

    const res = await buildApp({
      orgSubscription: {
        planTier: "growth",
        subscriptionStatus: "active",
        trialEndsAt: null,
      } as never,
    }).request("/ask-ledger/ask", {
      method: "POST",
      body: JSON.stringify({ question: "Which grants are over budget?" }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({
      error: AI_USAGE_CAP_REACHED,
      errorCode: AI_USAGE_CAP_REACHED,
      feature: "ask_your_ledger",
      cap: 0,
      used: 0,
      currentPlan: "growth",
      upgradeToPlan: "growth",
    });
    expect(analyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.ledgerAssistantFailed,
        payload: expect.objectContaining({ failure_type: AI_USAGE_CAP_REACHED }),
      }),
    );
  });

  it("reports analytics capture failures to Sentry without breaking the route", async () => {
    analyticsCapture.mockRejectedValueOnce(new Error("PostHog offline"));

    const res = await buildApp().request("/ask-ledger/ask", {
      method: "POST",
      body: JSON.stringify({ question: "Which grants are over budget?" }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(captureBackgroundException).toHaveBeenCalledWith(expect.any(Error), "ledger_assistant", {
      telemetry: "analytics_capture",
      operation: "ask",
    });
  });
});
