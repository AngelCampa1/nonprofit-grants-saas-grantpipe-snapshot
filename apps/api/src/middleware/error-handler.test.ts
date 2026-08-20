import { afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { AppError } from "../lib/app-error";
import type { AppEnv } from "../types";

const { mockCaptureException } = vi.hoisted(() => ({
  mockCaptureException: vi.fn(),
}));

vi.mock("@sentry/cloudflare", () => ({
  captureException: mockCaptureException,
}));

import { errorHandler } from "./error-handler";

describe("errorHandler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockCaptureException.mockReset();
  });

  function createApp() {
    const app = new Hono();
    app.onError(errorHandler);
    return app;
  }

  it("converts HTTPException to JSON error", async () => {
    const app = createApp();
    app.get("/test", () => {
      throw new HTTPException(403, { message: "Forbidden" });
    });
    const res = await app.request("/test");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("converts unknown errors to 500", async () => {
    const app = createApp();
    app.get("/test", () => {
      throw new Error("unexpected");
    });
    const res = await app.request("/test");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal Server Error" });
  });

  it("preserves typed application errors", async () => {
    const app = createApp();
    app.get("/test", () => {
      throw new AppError(404, "Grant not found");
    });
    const res = await app.request("/test");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Grant not found" });
  });

  it("includes errorCode in the JSON response when present", async () => {
    const app = createApp();
    app.get("/test", () => {
      throw new AppError(402, "Plan limit reached", "PAYWALL_LIMIT_EXCEEDED");
    });
    const res = await app.request("/test");
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({
      error: "Plan limit reached",
      errorCode: "PAYWALL_LIMIT_EXCEEDED",
    });
  });

  it("logs typed internal application errors before returning 500", async () => {
    const app = createApp();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    app.get("/test", () => {
      throw new AppError(500, "Browser rendering binding is not configured");
    });

    const res = await app.request("/test");

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "Browser rendering binding is not configured",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "Unhandled application error:",
      expect.objectContaining({
        status: 500,
        message: "Browser rendering binding is not configured",
      }),
    );
  });

  it("forwards 500 AppErrors to Sentry", async () => {
    const app = createApp();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new AppError(500, "Something broke");
    app.get("/test", () => {
      throw err;
    });

    await app.request("/test");

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "AppError",
        message: "API exception",
      }),
      expect.objectContaining({
        tags: expect.objectContaining({
          method: "GET",
          path: "/test",
          status: "500",
        }),
      }),
    );
    expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain("Something broke");
  });

  it("merges details into JSON response when AppError has details", async () => {
    const app = createApp();
    app.get("/test", () => {
      throw new AppError(402, "ai_usage_cap_reached", "ai_usage_cap_reached", {
        feature: "award_intake",
        cap: 5,
        used: 5,
        currentPlan: "starter",
        upgradeToPlan: "growth",
      });
    });
    const res = await app.request("/test");
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({
      error: "ai_usage_cap_reached",
      errorCode: "ai_usage_cap_reached",
      feature: "award_intake",
      cap: 5,
      used: 5,
      currentPlan: "starter",
      upgradeToPlan: "growth",
    });
  });

  it("does not forward 4xx AppErrors to Sentry", async () => {
    const app = createApp();
    app.get("/test", () => {
      throw new AppError(404, "Not found");
    });

    await app.request("/test");

    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("forwards entity-scoped grants 403 AppErrors to Sentry with sanitized scope tags", async () => {
    const app = new Hono<AppEnv>().basePath("/api");
    app.onError(errorHandler);
    const err = new AppError(403, "Sensitive Client grant access denied");
    app.get("/grants/:grantId", (c) => {
      c.set("orgId", "org-1");
      c.set("entityId", "entity-client");
      c.set("entityScope", "entity");
      throw err;
    });

    const res = await app.request("/api/grants/grant-client");

    expect(res.status).toBe(403);
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "AppError",
        message: "Entity-scoped grants access failure",
      }),
      expect.objectContaining({
        tags: {
          method: "GET",
          path: "/api/grants/:grantId",
          status: "403",
          org_id: "org-1",
          entity_id: "entity-client",
          entity_scope: "entity",
        },
        user: undefined,
      }),
    );
    const capturedError = mockCaptureException.mock.calls[0]?.[0];
    expect(capturedError).toBeInstanceOf(Error);
    expect(capturedError).not.toBe(err);
    expect(capturedError).not.toMatchObject({
      message: expect.stringContaining("Sensitive Client"),
    });
  });

  it("does not forward expected grants 404 AppErrors to Sentry", async () => {
    const app = new Hono<AppEnv>().basePath("/api");
    app.onError(errorHandler);
    app.get("/grants/:grantId/spend-down", (c) => {
      c.set("orgId", "org-1");
      c.set("entityId", "entity-client");
      c.set("entityScope", "entity");
      throw new AppError(404, "Grant not found");
    });

    const res = await app.request("/api/grants/deleted-grant/spend-down");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Grant not found" });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("does not forward direct entity-scoped grants 404 AppErrors to Sentry", () => {
    const responseBody: unknown[] = [];
    const fakeContext = {
      get: (key: keyof AppEnv["Variables"]) => {
        if (key === "orgId") return "org-1";
        if (key === "entityId") return "entity-client";
        if (key === "entityScope") return "entity";
        return undefined;
      },
      req: {
        method: "GET",
        path: "/api/grants/deleted-grant/spend-down",
        routePath: "/api/grants/:grantId/spend-down",
      },
      json: (body: unknown, status: unknown) => {
        responseBody.push(body, status);
        return new Response(JSON.stringify(body), { status: 404 });
      },
    } as unknown as Parameters<typeof errorHandler>[1];

    const response = errorHandler(new AppError(404, "Grant not found"), fakeContext);

    expect(response).toBeInstanceOf(Response);
    expect(responseBody).toEqual([{ error: "Grant not found" }, { status: 404 }]);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("does not forward entity-scoped 4xx AppErrors outside grant routes", async () => {
    const app = new Hono<AppEnv>().basePath("/api");
    app.onError(errorHandler);
    app.get("/funds/:fundId", (c) => {
      c.set("entityId", "entity-client");
      throw new AppError(404, "Fund not found");
    });

    const res = await app.request("/api/funds/fund-client");

    expect(res.status).toBe(404);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("does not forward grants 4xx AppErrors without an entity context", async () => {
    const app = new Hono<AppEnv>().basePath("/api");
    app.onError(errorHandler);
    app.get("/grants", () => {
      throw new AppError(403, "Forbidden");
    });

    const res = await app.request("/api/grants");

    expect(res.status).toBe(403);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("treats missing optional context as absent for grants 4xx AppErrors", () => {
    const responseBody: unknown[] = [];
    const fakeContext = {
      get: () => {
        throw new Error("context unavailable");
      },
      req: {
        method: "GET",
        path: "/api/grants/grant-client",
        routePath: "/api/grants/:grantId",
      },
      json: (body: unknown, status: unknown) => {
        responseBody.push(body, status);
        return new Response(JSON.stringify(body), { status: 404 });
      },
    } as unknown as Parameters<typeof errorHandler>[1];

    const response = errorHandler(new AppError(404, "Grant not found"), fakeContext);

    expect(response).toBeInstanceOf(Response);
    expect(responseBody).toEqual([{ error: "Grant not found" }, { status: 404 }]);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("does not forward grants 403 AppErrors when optional context access throws", () => {
    const responseBody: unknown[] = [];
    const fakeContext = {
      get: () => {
        throw new Error("context unavailable");
      },
      req: {
        method: "GET",
        path: "/api/grants/grant-client",
        routePath: "/api/grants/:grantId",
      },
      json: (body: unknown, status: unknown) => {
        responseBody.push(body, status);
        return new Response(JSON.stringify(body), { status: 403 });
      },
    } as unknown as Parameters<typeof errorHandler>[1];

    const response = errorHandler(new AppError(403, "Forbidden"), fakeContext);

    expect(response).toBeInstanceOf(Response);
    expect(responseBody).toEqual([{ error: "Forbidden" }, { status: 403 }]);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("uses request path when routePath is unavailable for grants 403 capture", () => {
    const responseBody: unknown[] = [];
    const fakeContext = {
      get: (key: keyof AppEnv["Variables"]) => {
        if (key === "orgId") return "org-1";
        if (key === "entityId") return "entity-client";
        if (key === "entityScope") return "entity";
        return undefined;
      },
      req: {
        method: "GET",
        path: "/api/grants/grant-client",
        routePath: "",
      },
      json: (body: unknown, status: unknown) => {
        responseBody.push(body, status);
        return new Response(JSON.stringify(body), { status: 403 });
      },
    } as unknown as Parameters<typeof errorHandler>[1];

    const response = errorHandler(new AppError(403, "Forbidden"), fakeContext);

    expect(response).toBeInstanceOf(Response);
    expect(responseBody).toEqual([{ error: "Forbidden" }, { status: 403 }]);
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "AppError",
        message: "Entity-scoped grants access failure",
      }),
      expect.objectContaining({
        tags: expect.objectContaining({
          path: "/api/grants/grant-client",
          status: "403",
        }),
      }),
    );
  });

  it("falls back to request path when routePath is not a grants route", () => {
    const responseBody: unknown[] = [];
    const fakeContext = {
      get: (key: keyof AppEnv["Variables"]) => {
        if (key === "orgId") return "org-1";
        if (key === "entityId") return "entity-client";
        if (key === "entityScope") return "entity";
        return undefined;
      },
      req: {
        method: "GET",
        path: "/api/grants/grant-client",
        routePath: "/internal/:id",
      },
      json: (body: unknown, status: unknown) => {
        responseBody.push(body, status);
        return new Response(JSON.stringify(body), { status: 403 });
      },
    } as unknown as Parameters<typeof errorHandler>[1];

    const response = errorHandler(new AppError(403, "Forbidden"), fakeContext);

    expect(response).toBeInstanceOf(Response);
    expect(responseBody).toEqual([{ error: "Forbidden" }, { status: 403 }]);
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "AppError",
        message: "Entity-scoped grants access failure",
      }),
      expect.objectContaining({
        tags: expect.objectContaining({
          path: "/internal/:id",
          status: "403",
        }),
      }),
    );
  });

  it("forwards unhandled errors to Sentry and returns 500", async () => {
    const app = createApp();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("unexpected");
    app.get("/test", () => {
      throw err;
    });

    const res = await app.request("/test");

    expect(res.status).toBe(500);
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Error",
        message: "API exception",
      }),
      expect.objectContaining({
        tags: expect.objectContaining({
          method: "GET",
          path: "/test",
          status: "500",
        }),
      }),
    );
    expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain("unexpected");
  });
});
