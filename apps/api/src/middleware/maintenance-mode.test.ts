import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { isReadOnlyMaintenanceMode, maintenanceMode } from "./maintenance-mode";

describe("maintenanceMode", () => {
  it.each(["GET", "HEAD", "OPTIONS"])(
    "allows %s requests during read-only maintenance",
    async (method) => {
      const next = vi.fn();
      const app = new Hono<{ Bindings: { MAINTENANCE_MODE?: "off" | "read_only" } }>();
      app.use("*", maintenanceMode());
      app.all("/resource", async (c) => {
        await next();
        return c.json({ ok: true });
      });

      const response = await app.request(
        "/resource",
        { method },
        { MAINTENANCE_MODE: "read_only" },
      );

      expect(response.status).toBe(200);
      expect(next).toHaveBeenCalledTimes(1);
    },
  );

  it("allows Better Auth session reads during read-only maintenance", async () => {
    const next = vi.fn();
    const app = new Hono<{ Bindings: { MAINTENANCE_MODE?: "off" | "read_only" } }>();
    app.use("*", maintenanceMode());
    app.get("/api/auth/better/get-session", async (c) => {
      await next();
      return c.json({ ok: true });
    });

    const response = await app.request(
      "/api/auth/better/get-session",
      { method: "GET" },
      { MAINTENANCE_MODE: "read_only" },
    );

    expect(response.status).toBe(200);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("blocks Better Auth GET callbacks during read-only maintenance", async () => {
    const next = vi.fn();
    const app = new Hono<{ Bindings: { MAINTENANCE_MODE?: "off" | "read_only" } }>();
    app.use("*", maintenanceMode());
    app.get("/api/auth/better/callback/google", async (c) => {
      await next();
      return c.json({ ok: true });
    });

    const response = await app.request(
      "/api/auth/better/callback/google",
      { method: "GET" },
      { MAINTENANCE_MODE: "read_only" },
    );

    expect(response.status).toBe(503);
    expect(next).not.toHaveBeenCalled();
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "blocks %s requests during read-only maintenance",
    async (method) => {
      const next = vi.fn();
      const app = new Hono<{ Bindings: { MAINTENANCE_MODE?: "off" | "read_only" } }>();
      app.use("*", maintenanceMode());
      app.on(method, "/resource", async (c) => {
        await next();
        return c.json({ ok: true });
      });

      const response = await app.request(
        "/resource",
        { method },
        { MAINTENANCE_MODE: "read_only" },
      );

      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: "GrantPipe is temporarily read-only for database maintenance.",
        errorCode: "MAINTENANCE_READ_ONLY",
      });
      expect(response.headers.get("retry-after")).toBe("300");
      expect(next).not.toHaveBeenCalled();
    },
  );

  it("allows mutating requests when maintenance mode is off", async () => {
    const next = vi.fn();
    const app = new Hono<{ Bindings: { MAINTENANCE_MODE?: "off" | "read_only" } }>();
    app.use("*", maintenanceMode());
    app.post("/resource", async (c) => {
      await next();
      return c.json({ ok: true });
    });

    const response = await app.request(
      "/resource",
      { method: "POST" },
      { MAINTENANCE_MODE: "off" },
    );

    expect(response.status).toBe(200);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe("isReadOnlyMaintenanceMode", () => {
  it("returns true only for read_only", () => {
    expect(isReadOnlyMaintenanceMode({ MAINTENANCE_MODE: "read_only" })).toBe(true);
    expect(isReadOnlyMaintenanceMode({ MAINTENANCE_MODE: "off" })).toBe(false);
    expect(isReadOnlyMaintenanceMode({})).toBe(false);
  });
});
