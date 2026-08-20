import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";
import { activityRoutes } from "./routes";

vi.mock("./service", () => ({
  listActivity: vi.fn(),
  listOrgActivity: vi.fn(),
}));

import { listActivity, listOrgActivity } from "./service";

function buildApp(role: AppEnv["Variables"]["memberRole"] = "viewer") {
  return new Hono<AppEnv>()
    .use("/activity/*", async (c, next) => {
      c.set("db", {} as never);
      c.set("orgId", "org-1");
      c.set("entityId", "entity-1");
      c.set("user", { id: "user-1", email: "user@example.com", name: "User" });
      c.set("session", { id: "session-1", userId: "user-1" });
      c.set("memberRole", role);
      await next();
    })
    .route("/activity", activityRoutes);
}

describe("activity routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("lists activity for a scoped entity", async () => {
    vi.mocked(listActivity).mockResolvedValue({
      data: [{ id: "activity-1", action: "created" }] as never,
      total: 1,
      page: 1,
      pageSize: 25,
    });

    const app = buildApp();
    const res = await app.request(
      "/activity?entityType=contact&entityId=contact-1&page=1&pageSize=25",
    );

    expect(res.status).toBe(200);
    expect(listActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        activeEntityId: "entity-1",
        entityType: "contact",
        entityId: "contact-1",
      }),
    );
  });

  it("blocks auditor scoped activity for disallowed entity types", async () => {
    const app = buildApp("auditor");
    const res = await app.request(
      "/activity?entityType=contact&entityId=contact-1&page=1&pageSize=25",
    );

    expect(res.status).toBe(403);
    expect(listActivity).not.toHaveBeenCalled();
  });

  it("allows auditor scoped activity for grant audit surfaces", async () => {
    vi.mocked(listActivity).mockResolvedValue({
      data: [] as never,
      total: 0,
      page: 1,
      pageSize: 25,
    });

    const app = buildApp("auditor");
    const res = await app.request("/activity?entityType=grant&entityId=grant-1&page=1&pageSize=25");

    expect(res.status).toBe(200);
    expect(listActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "grant", entityId: "grant-1" }),
    );
  });

  it("allows auditor scoped activity for payment request audit surfaces", async () => {
    vi.mocked(listActivity).mockResolvedValue({
      data: [] as never,
      total: 0,
      page: 1,
      pageSize: 25,
    });

    const app = buildApp("auditor");
    const res = await app.request(
      "/activity?entityType=payment_request&entityId=request-1&page=1&pageSize=25",
    );

    expect(res.status).toBe(200);
    expect(listActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: "payment_request",
        entityId: "request-1",
      }),
    );
  });

  it("lists org-wide activity via GET /org", async () => {
    vi.mocked(listOrgActivity).mockResolvedValue({
      data: [{ id: "activity-2", action: "updated" }] as never,
      total: 1,
      page: 1,
      pageSize: 25,
    });

    const app = buildApp();
    const res = await app.request("/activity/org?page=1&pageSize=25");

    expect(res.status).toBe(200);
    expect(listOrgActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        activeEntityId: "entity-1",
        page: 1,
        pageSize: 25,
      }),
    );
  });

  it("filters org activity by entityType", async () => {
    vi.mocked(listOrgActivity).mockResolvedValue({
      data: [] as never,
      total: 0,
      page: 1,
      pageSize: 25,
    });

    const app = buildApp();
    const res = await app.request("/activity/org?page=1&pageSize=25&entityType=grant");

    expect(res.status).toBe(200);
    expect(listOrgActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "grant" }),
    );
  });

  it("blocks auditor org activity filters for disallowed entity types", async () => {
    const app = buildApp("auditor");
    const res = await app.request("/activity/org?page=1&pageSize=25&entityType=contact");

    expect(res.status).toBe(403);
    expect(listOrgActivity).not.toHaveBeenCalled();
  });

  it("allows auditor org activity filters for grant audit surfaces", async () => {
    vi.mocked(listOrgActivity).mockResolvedValue({
      data: [] as never,
      total: 0,
      page: 1,
      pageSize: 25,
    });

    const app = buildApp("auditor");
    const res = await app.request("/activity/org?page=1&pageSize=25&entityType=grant");

    expect(res.status).toBe(200);
    expect(listOrgActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "grant" }),
    );
  });

  it("allows auditor org activity filters for payment audit surfaces", async () => {
    vi.mocked(listOrgActivity).mockResolvedValue({
      data: [] as never,
      total: 0,
      page: 1,
      pageSize: 25,
    });

    const app = buildApp("auditor");
    const res = await app.request("/activity/org?page=1&pageSize=25&entityType=payment");

    expect(res.status).toBe(200);
    expect(listOrgActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "payment" }),
    );
  });

  it("returns 400 for invalid entityType in GET /org", async () => {
    const app = buildApp();
    const res = await app.request("/activity/org?page=1&pageSize=25&entityType=invalid_type");
    expect(res.status).toBe(400);
  });

  it("passes fromDate and toDate as Date objects when provided", async () => {
    vi.mocked(listOrgActivity).mockResolvedValue({
      data: [] as never,
      total: 0,
      page: 1,
      pageSize: 25,
    });

    const app = buildApp();
    const res = await app.request(
      "/activity/org?page=1&pageSize=25&fromDate=2026-01-01T00:00:00.000Z&toDate=2026-12-31T23:59:59.000Z",
    );

    expect(res.status).toBe(200);
    expect(listOrgActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        fromDate: expect.any(Date),
        toDate: expect.any(Date),
      }),
    );
  });

  it("passes actorId when provided in GET /org", async () => {
    vi.mocked(listOrgActivity).mockResolvedValue({
      data: [] as never,
      total: 0,
      page: 1,
      pageSize: 25,
    });

    const app = buildApp();
    const res = await app.request("/activity/org?page=1&pageSize=25&actorId=user-42");

    expect(res.status).toBe(200);
    expect(listOrgActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorId: "user-42" }),
    );
  });
});
