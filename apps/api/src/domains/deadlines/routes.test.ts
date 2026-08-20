import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { RadarObligation } from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { deadlineRoutes } from "./routes";

vi.mock("./service", () => ({
  collectObligations: vi.fn(),
  bandObligations: vi.fn(),
}));

import { bandObligations, collectObligations } from "./service";

function makeObligation(overrides: Partial<RadarObligation>): RadarObligation {
  return {
    id: "application_deadline:g1",
    kind: "application_deadline",
    title: "Application deadline",
    contextLabel: "Grant One",
    dueDate: "2026-06-20T00:00:00.000Z",
    daysUntilDue: 5,
    status: "upcoming",
    urgencyBand: "this_week",
    target: { type: "grant", id: "g1" },
    ...overrides,
  };
}

const EMPTY_BANDS = {
  asOf: "2026-06-15T12:00:00.000Z",
  bands: { overdue: [], due_today: [], this_week: [], this_month: [], later: [] },
  totals: {
    application_deadline: 0,
    reporting_requirement: 0,
    closeout_item: 0,
    restriction_release: 0,
    period_close: 0,
  },
};

function buildApp(memberRole: AppEnv["Variables"]["memberRole"] = "viewer") {
  return new Hono<AppEnv>()
    .use("/deadlines/*", async (c, next) => {
      c.set("db", {} as never);
      c.set("orgId", "org-1");
      c.set("entityId", "entity-1");
      c.set("user", { id: "user-1", email: "user@example.com", name: "User" });
      c.set("session", { id: "session-1", userId: "user-1" });
      c.set("memberRole", memberRole);
      await next();
    })
    .route("/deadlines", deadlineRoutes);
}

describe("deadline routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(bandObligations).mockReturnValue(EMPTY_BANDS);
  });

  it("returns the banded payload with defaults", async () => {
    vi.mocked(collectObligations).mockResolvedValue([]);

    const app = buildApp();
    const res = await app.request("/deadlines");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(EMPTY_BANDS);
    expect(collectObligations).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        entityId: "entity-1",
        horizonDays: 90,
        includeResolved: false,
        kinds: undefined,
      }),
    );
  });

  it("forwards parsed filters to the collector", async () => {
    vi.mocked(collectObligations).mockResolvedValue([]);

    const app = buildApp();
    const res = await app.request(
      "/deadlines?horizonDays=30&kinds=period_close,reporting_requirement&includeResolved=true",
    );

    expect(res.status).toBe(200);
    expect(collectObligations).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        horizonDays: 30,
        includeResolved: true,
        kinds: ["period_close", "reporting_requirement"],
      }),
    );
  });

  it("filters by status before banding", async () => {
    const overdue = makeObligation({ id: "a", status: "overdue", urgencyBand: "overdue" });
    const upcoming = makeObligation({ id: "b", status: "upcoming" });
    vi.mocked(collectObligations).mockResolvedValue([overdue, upcoming]);

    const app = buildApp();
    const res = await app.request("/deadlines?status=overdue");

    expect(res.status).toBe(200);
    expect(bandObligations).toHaveBeenCalledWith([overdue], expect.any(Date));
  });

  it("rejects an out-of-range horizon", async () => {
    const app = buildApp();
    const res = await app.request("/deadlines?horizonDays=0");
    expect(res.status).toBe(400);
  });

  it("rejects requests without a member role", async () => {
    const app = buildApp(null);
    const res = await app.request("/deadlines");
    expect(res.status).toBe(403);
  });
});
