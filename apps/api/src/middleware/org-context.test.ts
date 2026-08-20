import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { orgContextMiddleware } from "./org-context";
import type { Role } from "@grantpipe/shared";

type User = { id: string; email: string; name: string };

type Membership = { orgId: string; role: Role; deletedAt: Date | null };

type TestVariables = {
  user: User;
  orgId: string;
  memberRole: Role;
};

describe("orgContextMiddleware", () => {
  function createApp(findMember: (userId: string) => Promise<Membership | undefined>) {
    const app = new Hono<{ Variables: TestVariables }>();

    // Simulate session middleware setting user context
    app.use("/test", async (c, next) => {
      c.set("user", { id: "user-1", email: "user@example.com", name: "Test User" });
      await next();
    });

    app.use("/test", orgContextMiddleware(findMember));

    app.get("/test", (c) => {
      const orgId = c.get("orgId");
      const memberRole = c.get("memberRole");
      return c.json({ orgId, memberRole });
    });

    return app;
  }

  it("returns 403 when findMember returns undefined", async () => {
    const findMember = vi.fn().mockResolvedValue(undefined);
    const app = createApp(findMember);

    const res = await app.request("/test");

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "No organization membership" });
  });

  it("sets orgId and memberRole on context when membership exists", async () => {
    const membership: Membership = { orgId: "org-1", role: "admin", deletedAt: null };
    const findMember = vi.fn().mockResolvedValue(membership);
    const app = createApp(findMember);

    const res = await app.request("/test");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orgId: "org-1", memberRole: "admin" });
  });

  it("calls findMember with the correct user ID from context", async () => {
    const membership: Membership = { orgId: "org-1", role: "editor", deletedAt: null };
    const findMember = vi.fn().mockResolvedValue(membership);
    const app = createApp(findMember);

    await app.request("/test");

    expect(findMember).toHaveBeenCalledOnce();
    expect(findMember).toHaveBeenCalledWith("user-1");
  });

  it("returns 403 when membership has been soft-deleted", async () => {
    const membership: Membership = {
      orgId: "org-1",
      role: "editor",
      deletedAt: new Date("2025-01-01"),
    };
    const findMember = vi.fn().mockResolvedValue(membership);
    const app = createApp(findMember);

    const res = await app.request("/test");

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "No organization membership" });
  });
});
