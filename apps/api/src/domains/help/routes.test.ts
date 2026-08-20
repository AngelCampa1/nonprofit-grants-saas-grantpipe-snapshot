import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";
import { helpRoutes } from "./routes";

vi.mock("./service", () => ({
  listGuideProgress: vi.fn(),
  upsertGuideProgress: vi.fn(),
}));

import { listGuideProgress, upsertGuideProgress } from "./service";

function buildApp(role: "admin" | "editor" | "viewer" | "auditor" = "viewer") {
  return new Hono<AppEnv>()
    .use("/help/*", async (c, next) => {
      c.set("db", {} as never);
      c.set("orgId", "org-1");
      c.set("user", { id: "user-1", email: "test@example.com", name: "Test" });
      c.set("session", { id: "sess-1", userId: "user-1" });
      c.set("memberRole", role);
      await next();
    })
    .route("/help", helpRoutes);
}

describe("help routes", () => {
  beforeEach(() => vi.resetAllMocks());

  it("lists guide progress for a viewer", async () => {
    vi.mocked(listGuideProgress).mockResolvedValue([{ guideKey: "first_setup" }] as never);

    const res = await buildApp("viewer").request("/help/progress");

    expect(res.status).toBe(200);
    expect(listGuideProgress).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1", userId: "user-1" }),
    );
  });

  it("updates guide progress for an auditor", async () => {
    vi.mocked(upsertGuideProgress).mockResolvedValue({
      guideKey: "open_pdf_report",
      status: "completed",
    } as never);

    const res = await buildApp("auditor").request("/help/progress/open_pdf_report", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed", lastStep: "downloaded" }),
    });

    expect(res.status).toBe(200);
    expect(upsertGuideProgress).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        userId: "user-1",
        guideKey: "open_pdf_report",
        data: { status: "completed", lastStep: "downloaded" },
      }),
    );
  });

  it("rejects unknown guide keys", async () => {
    const res = await buildApp().request("/help/progress/nope", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });

    expect(res.status).toBe(400);
    expect(upsertGuideProgress).not.toHaveBeenCalled();
  });

  it("rejects invalid progress payloads", async () => {
    const res = await buildApp().request("/help/progress/first_setup", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "lost" }),
    });

    expect(res.status).toBe(400);
  });
});
