import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { errorHandler } from "../../middleware/error-handler";
import { captureBackgroundException } from "../../lib/sentry";
import { draftingAssistantRoutes } from "./routes";

const analyticsCapture = vi.fn();

vi.mock("./service", () => ({
  generateDraft: vi.fn(),
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
    .route("/drafting-assistant", draftingAssistantRoutes);
}

describe("draftingAssistantRoutes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analyticsCapture.mockResolvedValue({ id: "analytics-1" });
    vi.mocked(service.generateDraft).mockResolvedValue({
      draftTitle: "Draft Youth Services proposal",
      draftType: "proposal_narrative",
      draftBody: "Editable draft for review.",
      sections: [{ heading: "Need", body: "Editable draft for review." }],
      citations: [{ type: "grant", label: "Youth Services", href: "/grants/grant-1" }],
      safeguards: ["Editable draft only. A human must review, edit, and submit outside GrantPipe."],
      modelId: "minimax/minimax-m2.7",
      promptVersion: "proposal-report-drafting-v1",
      generatedAt: "2026-06-18T12:00:00.000Z",
    });
  });

  it("generates draft responses with safe analytics and OpenRouter config", async () => {
    const res = await buildApp().request("/drafting-assistant/generate", {
      method: "POST",
      body: JSON.stringify({
        grantId: "123e4567-e89b-12d3-a456-426614174000",
        draftType: "proposal_narrative",
        userPrompt: "Draft a short proposal narrative from grounded records.",
      }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(service.generateDraft).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      actorId: "user-1",
      appUrl: undefined,
      openRouterApiKey: undefined,
      input: expect.objectContaining({
        draftType: "proposal_narrative",
      }),
    });
    expect(analyticsCapture).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.draftingAssistantStarted,
      payload: {
        actorId: "user-1",
        surface: "api",
        operation: "generate",
        draft_type: "proposal_narrative",
        prompt_length_bucket: "25_100",
        period_present: false,
      },
    });
    expect(analyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.draftingAssistantGenerated,
        payload: expect.objectContaining({
          draft_type: "proposal_narrative",
          citation_count_bucket: "1_10",
          section_count_bucket: "1_10",
          model_id: "minimax/minimax-m2.7",
        }),
      }),
    );
    expect(JSON.stringify(analyticsCapture.mock.calls)).not.toContain("proposal narrative");
  });

  it("blocks Starter plan (below Growth) from generating drafts", async () => {
    const res = await buildApp({
      orgSubscription: {
        planTier: "starter",
        subscriptionStatus: "active",
        trialEndsAt: null,
      } as never,
    }).request("/drafting-assistant/generate", {
      method: "POST",
      body: JSON.stringify({
        grantId: "123e4567-e89b-12d3-a456-426614174000",
        draftType: "final_report",
        userPrompt: "Draft a final report from the grant and outcome records.",
      }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(402);
    const body = (await res.json()) as { error: string; required: string };
    expect(body.error).toBe("insufficient_plan");
    expect(body.required).toBe("growth");
    expect(service.generateDraft).not.toHaveBeenCalled();
  });

  it("allows Growth plan to generate drafts", async () => {
    const res = await buildApp({
      orgSubscription: {
        planTier: "growth",
        subscriptionStatus: "active",
        trialEndsAt: null,
      } as never,
    }).request("/drafting-assistant/generate", {
      method: "POST",
      body: JSON.stringify({
        grantId: "123e4567-e89b-12d3-a456-426614174000",
        draftType: "final_report",
        userPrompt: "Draft a final report from the grant and outcome records.",
      }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(service.generateDraft).toHaveBeenCalled();
  });

  it("requires grant edit access because drafts can affect external submissions", async () => {
    const res = await buildApp({
      memberRole: "viewer",
      memberPermissions: { grants: "view", reports: "view" } as never,
    }).request("/drafting-assistant/generate", {
      method: "POST",
      body: JSON.stringify({
        grantId: "123e4567-e89b-12d3-a456-426614174000",
        draftType: "interim_report",
        userPrompt: "Draft an interim report from current metrics.",
      }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(403);
    expect(service.generateDraft).not.toHaveBeenCalled();
  });

  it("captures failed generation without leaking raw user prompts", async () => {
    vi.mocked(service.generateDraft).mockRejectedValueOnce(new Error("OpenRouter unavailable"));

    const res = await buildApp().request("/drafting-assistant/generate", {
      method: "POST",
      body: JSON.stringify({
        grantId: "123e4567-e89b-12d3-a456-426614174000",
        draftType: "final_report",
        userPrompt: "Draft a final report for Jane Smith and include her story.",
      }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(500);
    expect(analyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.draftingAssistantFailed,
        payload: expect.objectContaining({
          operation: "generate",
          draft_type: "final_report",
          failure_type: "Error",
        }),
      }),
    );
    expect(JSON.stringify(analyticsCapture.mock.calls)).not.toContain("Jane Smith");
  });

  it("captures non-Error generation failures as unknown failure types", async () => {
    vi.mocked(service.generateDraft).mockRejectedValueOnce("provider unavailable");

    await expect(
      buildApp().request("/drafting-assistant/generate", {
        method: "POST",
        body: JSON.stringify({
          grantId: "123e4567-e89b-12d3-a456-426614174000",
          draftType: "interim_report",
          userPrompt: "Draft an interim report from the current records.",
        }),
        headers: { "content-type": "application/json" },
      }),
    ).rejects.toThrow("provider unavailable");
    expect(analyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.draftingAssistantFailed,
        payload: expect.objectContaining({
          failure_type: "unknown",
        }),
      }),
    );
  });

  it("buckets large generated drafts without sending draft text", async () => {
    vi.mocked(service.generateDraft).mockResolvedValueOnce({
      draftTitle: "Large draft",
      draftType: "final_report",
      draftBody: "Draft body.",
      sections: Array.from({ length: 26 }, (_, index) => ({
        heading: `Section ${index + 1}`,
        body: "Reviewed section text.",
      })),
      citations: Array.from({ length: 12 }, (_, index) => ({
        type: "grant",
        label: `Source ${index + 1}`,
        href: `/grants/source-${index + 1}`,
      })),
      safeguards: ["Editable draft only. A human must review, edit, and submit outside GrantPipe."],
      modelId: "minimax/minimax-m2.7",
      promptVersion: "proposal-report-drafting-v1",
      generatedAt: "2026-06-18T12:00:00.000Z",
    });

    const res = await buildApp().request("/drafting-assistant/generate", {
      method: "POST",
      body: JSON.stringify({
        grantId: "123e4567-e89b-12d3-a456-426614174000",
        draftType: "final_report",
        userPrompt: "x".repeat(120),
        reportPeriodEnd: "2026-12-31",
      }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(analyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.draftingAssistantStarted,
        payload: expect.objectContaining({
          prompt_length_bucket: "100_plus",
          period_present: true,
        }),
      }),
    );
    expect(analyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.draftingAssistantGenerated,
        payload: expect.objectContaining({
          citation_count_bucket: "10_25",
          section_count_bucket: "25_100",
        }),
      }),
    );
    expect(JSON.stringify(analyticsCapture.mock.calls)).not.toContain("Reviewed section text");
  });

  it("captures analytics failures to Sentry without breaking generation", async () => {
    analyticsCapture.mockRejectedValueOnce(new Error("PostHog offline"));

    const res = await buildApp().request("/drafting-assistant/generate", {
      method: "POST",
      body: JSON.stringify({
        grantId: "123e4567-e89b-12d3-a456-426614174000",
        draftType: "proposal_narrative",
        userPrompt: "Draft a short proposal narrative from grounded records.",
      }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(captureBackgroundException).toHaveBeenCalledWith(
      expect.any(Error),
      "drafting_assistant",
      {
        telemetry: "analytics_capture",
        operation: "generate",
      },
    );
  });
});
