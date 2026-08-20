import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../types";
import { captureApiAnalyticsSafely } from "./analytics";

const { mockCaptureBackgroundException } = vi.hoisted(() => ({
  mockCaptureBackgroundException: vi.fn(),
}));

vi.mock("./sentry", () => ({
  captureBackgroundException: mockCaptureBackgroundException,
  getSafeRoutePath: vi.fn(() => "/test-route"),
}));

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function makeApp(capture: Promise<unknown> | unknown, options: { setContext?: boolean } = {}) {
  const app = new Hono<AppEnv>();
  app.get("/test-route", (c) => {
    if (options.setContext !== false) {
      c.set("orgId", "org-1");
      c.set("entityId", "entity-1");
    }
    captureApiAnalyticsSafely(capture, {
      c,
      eventName: "test_event",
    });
    return c.json({ ok: true });
  });
  return app;
}

describe("captureApiAnalyticsSafely", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the route response successful when analytics capture rejects", async () => {
    const error = new Error("PostHog down");
    const response = await makeApp(Promise.reject(error)).request("/test-route");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });

    await flushMicrotasks();

    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(error, "api.analytics", {
      analytics_event: "test_event",
      method: "GET",
      path: "/test-route",
      org_id: "org-1",
      entity_id: "entity-1",
    });
  });

  it("does not report successful analytics captures", async () => {
    const response = await makeApp(Promise.resolve({ id: "capture-1" })).request("/test-route");

    expect(response.status).toBe(200);
    await flushMicrotasks();

    expect(mockCaptureBackgroundException).not.toHaveBeenCalled();
  });

  it("uses empty Sentry metadata when org and entity context are absent", async () => {
    const error = new Error("PostHog down");
    const response = await makeApp(Promise.reject(error), { setContext: false }).request(
      "/test-route",
    );

    expect(response.status).toBe(200);
    await flushMicrotasks();

    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(error, "api.analytics", {
      analytics_event: "test_event",
      method: "GET",
      path: "/test-route",
      org_id: "",
      entity_id: "",
    });
  });
});
