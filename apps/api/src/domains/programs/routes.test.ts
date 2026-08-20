import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { ANALYTICS_EVENTS, type PermissionMap, type Role } from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { programRoutes } from "./routes";

const { mockCaptureAnalytics } = vi.hoisted(() => ({
  mockCaptureAnalytics: vi.fn().mockResolvedValue({ id: "analytics-1" }),
}));

vi.mock("./program.service", () => ({
  archiveProgram: vi.fn(),
  createProgram: vi.fn(),
  getProgram: vi.fn(),
  listPrograms: vi.fn(),
  updateProgram: vi.fn(),
}));
vi.mock("./budget.service", () => ({
  createProgramBudget: vi.fn(),
  updateProgramBudget: vi.fn(),
}));
vi.mock("./allocation.service", () => ({
  replaceExpenseProgramAllocations: vi.fn(),
  replaceGrantProgramAllocations: vi.fn(),
}));
vi.mock("./report.service", () => ({
  exportProgramBudgetVsActual: vi.fn(),
  getProgramBudgetVsActual: vi.fn(),
}));
vi.mock("../../lib/integrations", () => ({
  getIntegrations: vi.fn(() => ({
    analytics: { capture: mockCaptureAnalytics },
  })),
}));

import {
  replaceExpenseProgramAllocations,
  replaceGrantProgramAllocations,
} from "./allocation.service";
import { createProgramBudget, updateProgramBudget } from "./budget.service";
import {
  archiveProgram,
  createProgram,
  getProgram,
  listPrograms,
  updateProgram,
} from "./program.service";
import { exportProgramBudgetVsActual, getProgramBudgetVsActual } from "./report.service";

function buildApp(
  role: Role = "admin",
  planTier = "audit_ready",
  permissions: Partial<PermissionMap> | null = null,
) {
  return new Hono<AppEnv>()
    .use("/programs/*", async (c, next) => {
      c.set("db", {
        query: {
          organizations: { findFirst: vi.fn().mockResolvedValue({ planTier }) },
        },
      } as never);
      c.set("orgId", "org-1");
      c.set("user", { id: "user-1", email: "test@example.com", name: "Test" });
      c.set("session", { id: "sess-1", userId: "user-1" });
      c.set("memberRole", role);
      c.set("memberPermissions", permissions as PermissionMap | null);
      c.set("orgSubscription", {
        planTier,
        subscriptionStatus: "active",
        trialEndsAt: null,
        onboardingCompleted: true,
        planSelectedAt: new Date("2026-05-02T00:00:00.000Z"),
        stripeSubscriptionId: "sub-1",
      });
      await next();
    })
    .route("/programs", programRoutes);
}

const uuid = "11111111-1111-4111-8111-111111111111";

function allocationUuid(index: number): string {
  return `11111111-1111-4111-8111-${index.toString(16).padStart(12, "0")}`;
}

describe("program routes", () => {
  beforeEach(() => vi.resetAllMocks());

  it("allows Starter users to list programs", async () => {
    vi.mocked(listPrograms).mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 25 });

    const res = await buildApp("viewer", "starter").request("/programs");

    expect(res.status).toBe(200);
    expect(listPrograms).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1" }),
    );
  });

  it("allows Starter users to view program details and budget-vs-actual", async () => {
    vi.mocked(getProgram).mockResolvedValue({ id: uuid, name: "Health" } as never);
    vi.mocked(getProgramBudgetVsActual).mockResolvedValue({ rows: [] });

    const listRes = await buildApp("viewer", "starter").request("/programs");
    const detailRes = await buildApp("viewer", "starter").request(`/programs/${uuid}`);
    const reportRes = await buildApp("viewer", "starter").request(
      `/programs/budget-vs-actual?periodStart=2026-01-01&periodEnd=2026-12-31`,
    );

    expect(listRes.status).toBe(200);
    expect(detailRes.status).toBe(200);
    expect(reportRes.status).toBe(200);
  });

  it("creates programs for Starter editors", async () => {
    vi.mocked(createProgram).mockResolvedValue({ id: uuid, name: "Health Access" } as never);

    const res = await buildApp("editor", "starter").request("/programs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Health Access" }),
    });

    expect(res.status).toBe(201);
    expect(createProgram).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1", actorId: "user-1", name: "Health Access" }),
    );
  });

  it("blocks viewers from mutation endpoints", async () => {
    const res = await buildApp("viewer").request(`/programs/${uuid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });

    expect(res.status).toBe(403);
    expect(updateProgram).not.toHaveBeenCalled();
  });

  it("gets, updates, and archives programs", async () => {
    vi.mocked(getProgram).mockResolvedValue({ id: uuid, name: "Health" } as never);
    vi.mocked(updateProgram).mockResolvedValue({ id: uuid, name: "Health Access" } as never);
    vi.mocked(archiveProgram).mockResolvedValue(undefined);

    const getRes = await buildApp("viewer", "starter").request(`/programs/${uuid}`);
    const patchRes = await buildApp("editor", "starter").request(`/programs/${uuid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Health Access" }),
    });
    const deleteRes = await buildApp("admin", "starter").request(`/programs/${uuid}`, {
      method: "DELETE",
    });

    expect(getRes.status).toBe(200);
    expect(patchRes.status).toBe(200);
    expect(deleteRes.status).toBe(204);
  });

  it("creates budgets through the program service", async () => {
    vi.mocked(createProgramBudget).mockResolvedValue({ id: uuid } as never);

    const res = await buildApp("editor", "starter").request("/programs/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        programId: uuid,
        name: "FY 2027",
        periodStart: "2026-07-01",
        periodEnd: "2027-06-30",
        lines: [{ category: "Personnel", budgetedCents: 100_00 }],
      }),
    });

    expect(res.status).toBe(201);
    expect(createProgramBudget).toHaveBeenCalledOnce();
  });

  it("updates budgets through the program service", async () => {
    vi.mocked(updateProgramBudget).mockResolvedValue({ id: uuid, name: "FY 2027" } as never);

    const res = await buildApp("editor", "starter").request(`/programs/budgets/${uuid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "FY 2027" }),
    });

    expect(res.status).toBe(200);
    expect(updateProgramBudget).toHaveBeenCalledOnce();
  });

  it("routes grant and expense allocation replacement", async () => {
    vi.mocked(replaceGrantProgramAllocations).mockResolvedValue({ allocations: [], warnings: [] });
    vi.mocked(replaceExpenseProgramAllocations).mockResolvedValue({
      allocations: [],
      warnings: [],
    });

    const grantRes = await buildApp("editor", "starter").request(
      `/programs/grants/${uuid}/allocations`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grantId: uuid,
          allocations: [{ programId: uuid, percentBasisPoints: 10_000 }],
        }),
      },
    );
    const expenseRes = await buildApp("editor", "starter").request(
      `/programs/expenses/${uuid}/allocations`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expenseId: uuid,
          balanceMode: "replace_and_balance",
          allocations: [{ programId: uuid, percentBasisPoints: 10_000 }],
        }),
      },
    );

    expect(grantRes.status).toBe(200);
    expect(expenseRes.status).toBe(200);
    expect(replaceGrantProgramAllocations).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ grantId: uuid }),
    );
    expect(replaceExpenseProgramAllocations).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ expenseId: uuid }),
    );
  });

  it("rejects allocation replacement when path and body ids disagree", async () => {
    const otherUuid = "22222222-2222-4222-8222-222222222222";
    const grantRes = await buildApp("editor").request(`/programs/grants/${uuid}/allocations`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grantId: otherUuid,
        allocations: [{ programId: uuid, percentBasisPoints: 10_000 }],
      }),
    });
    const expenseRes = await buildApp("editor").request(`/programs/expenses/${uuid}/allocations`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expenseId: otherUuid,
        balanceMode: "replace_and_balance",
        allocations: [{ programId: uuid, percentBasisPoints: 10_000 }],
      }),
    });

    expect(grantRes.status).toBe(400);
    expect(expenseRes.status).toBe(400);
    expect(replaceGrantProgramAllocations).not.toHaveBeenCalled();
    expect(replaceExpenseProgramAllocations).not.toHaveBeenCalled();
  });

  it("returns report data and gates exports to Growth", async () => {
    vi.mocked(getProgramBudgetVsActual).mockResolvedValue({ rows: [] });
    vi.mocked(exportProgramBudgetVsActual).mockResolvedValue("program_id\n");

    const query = `periodStart=2026-01-01&periodEnd=2026-12-31&programId=${uuid}`;
    const preview = await buildApp("viewer", "starter").request(
      `/programs/budget-vs-actual?${query}`,
    );
    const blockedExport = await buildApp("viewer", "starter").request(
      `/programs/budget-vs-actual/export?${query}`,
    );
    const exportRes = await buildApp("viewer", "growth").request(
      `/programs/budget-vs-actual/export?${query}`,
    );

    expect(preview.status).toBe(200);
    expect(blockedExport.status).toBe(402);
    expect(exportRes.status).toBe(200);
    expect(exportRes.headers.get("content-type")).toContain("text/csv");
    expect(exportRes.headers.get("cache-control")).toBe("private, no-store");
    expect(exportRes.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
  });

  it("captures safe analytics for program operations", async () => {
    vi.mocked(createProgram).mockResolvedValue({ id: uuid, name: "Health Access" } as never);
    vi.mocked(updateProgram).mockResolvedValue({ id: uuid, name: "Updated Health" } as never);
    vi.mocked(archiveProgram).mockResolvedValue(undefined);
    vi.mocked(createProgramBudget).mockResolvedValue({ id: uuid } as never);
    vi.mocked(updateProgramBudget).mockResolvedValue({ id: uuid, name: "FY 2027" } as never);
    vi.mocked(replaceGrantProgramAllocations).mockResolvedValue({ allocations: [], warnings: [] });
    vi.mocked(replaceExpenseProgramAllocations).mockResolvedValue({
      allocations: [],
      warnings: [],
    });
    vi.mocked(exportProgramBudgetVsActual).mockResolvedValue("program_id\n");

    await buildApp("editor").request("/programs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Health Access" }),
    });
    await buildApp("editor").request(`/programs/${uuid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated Health" }),
    });
    await buildApp("admin").request(`/programs/${uuid}`, { method: "DELETE" });
    await buildApp("editor").request("/programs/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        programId: uuid,
        name: "FY 2027",
        periodStart: "2026-07-01",
        periodEnd: "2027-06-30",
        lines: [{ category: "Personnel", budgetedCents: 100_00 }],
      }),
    });
    await buildApp("editor").request(`/programs/budgets/${uuid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "FY 2028" }),
    });
    await buildApp("editor").request(`/programs/grants/${uuid}/allocations`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grantId: uuid,
        allocations: [{ programId: uuid, percentBasisPoints: 10_000 }],
      }),
    });
    await buildApp("editor").request(`/programs/expenses/${uuid}/allocations`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expenseId: uuid,
        balanceMode: "replace_and_balance",
        allocations: [{ programId: uuid, percentBasisPoints: 10_000 }],
      }),
    });
    await buildApp("viewer", "audit_ready").request(
      `/programs/budget-vs-actual/export?periodStart=2026-01-01&periodEnd=2026-12-31&programId=${uuid}`,
    );

    expect(mockCaptureAnalytics).toHaveBeenCalledTimes(8);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        eventName: ANALYTICS_EVENTS.programCreated,
        payload: expect.objectContaining({
          actorId: "user-1",
          entity_type: "program",
        }),
      }),
    );
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.programUpdated,
        payload: expect.objectContaining({
          entity_type: "program",
          changed_fields: ["name"],
        }),
      }),
    );
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.programArchived,
        payload: expect.objectContaining({ entity_type: "program" }),
      }),
    );
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.programBudgetCreated,
        payload: expect.objectContaining({ entity_type: "program_budget" }),
      }),
    );
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.programBudgetUpdated,
        payload: expect.objectContaining({
          entity_type: "program_budget",
          changed_fields: ["name"],
        }),
      }),
    );
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.grantProgramAllocationsReplaced,
        payload: expect.objectContaining({
          entity_type: "grant_program_allocation",
          allocation_count_bucket: "1-10",
        }),
      }),
    );
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.expenseProgramAllocationsReplaced,
        payload: expect.objectContaining({
          entity_type: "expense_program_allocation",
          allocation_count_bucket: "1-10",
          balance_mode: "replace_and_balance",
        }),
      }),
    );
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.programBudgetVsActualExported,
        payload: expect.objectContaining({
          entity_type: "program_budget_vs_actual",
          file_format: "csv",
        }),
      }),
    );
    const serializedCalls = JSON.stringify(mockCaptureAnalytics.mock.calls);
    expect(serializedCalls).not.toContain("Health Access");
    expect(serializedCalls).not.toContain("Updated Health");
    expect(serializedCalls).not.toContain(uuid);
  });

  it("buckets program allocation replacement counts without raw counts", async () => {
    vi.mocked(replaceGrantProgramAllocations).mockResolvedValue({ allocations: [], warnings: [] });

    await buildApp("editor").request(`/programs/grants/${uuid}/allocations`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grantId: uuid, allocations: [] }),
    });
    await buildApp("editor").request(`/programs/grants/${uuid}/allocations`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grantId: uuid,
        allocations: Array.from({ length: 11 }, (_value, index) => ({
          programId: allocationUuid(index + 1),
          percentBasisPoints: 1,
        })),
      }),
    });
    await buildApp("editor").request(`/programs/grants/${uuid}/allocations`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grantId: uuid,
        allocations: Array.from({ length: 51 }, (_value, index) => ({
          programId: allocationUuid(index + 1),
          percentBasisPoints: 1,
        })),
      }),
    });

    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.grantProgramAllocationsReplaced,
        payload: expect.objectContaining({ allocation_count_bucket: "0" }),
      }),
    );
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.grantProgramAllocationsReplaced,
        payload: expect.objectContaining({ allocation_count_bucket: "11-50" }),
      }),
    );
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.grantProgramAllocationsReplaced,
        payload: expect.objectContaining({ allocation_count_bucket: "51+" }),
      }),
    );
  });
});
