import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PermissionMap } from "@grantpipe/shared";
import { Hono } from "hono";
import type { AppEnv } from "../../types";
import { errorHandler } from "../../middleware/error-handler";
import { grantBudgetRoutes } from "./budget.routes";

vi.mock("./grant.service", () => ({
  resolvePlanTier: vi.fn(),
}));

vi.mock("./budget.service", () => ({
  createBudgetAmendment: vi.fn(),
  createBudgetVersion: vi.fn(),
  createBudgetPeriod: vi.fn(),
  createBudgetLine: vi.fn(),
  approveBudgetVersion: vi.fn(),
  getBudgetVersion: vi.fn(),
  getCurrentBudgetVersion: vi.fn(),
  listBudgetAmendments: vi.fn(),
  listBudgetVersions: vi.fn(),
}));

vi.mock("./budget-allocations.service", () => ({
  setExpenseBudgetAllocations: vi.fn(),
  setJournalLineBudgetAllocations: vi.fn(),
}));

vi.mock("./budget-reporting.service", () => ({
  getBudgetVarianceRows: vi.fn(),
  exportGrantBudgetActualsCsv: vi.fn(),
}));

vi.mock("./budget-intake.service", () => ({
  extractBudgetRowsWithOpenRouter: vi.fn(),
}));

vi.mock("./planned-expenses.service", () => ({
  convertPlannedExpense: vi.fn(),
  createPlannedExpense: vi.fn(),
  deletePlannedExpense: vi.fn(),
  listPlannedExpenses: vi.fn(),
  updatePlannedExpense: vi.fn(),
}));

import { resolvePlanTier } from "./grant.service";
import {
  approveBudgetVersion,
  createBudgetAmendment,
  createBudgetLine,
  createBudgetPeriod,
  createBudgetVersion,
  getBudgetVersion,
  getCurrentBudgetVersion,
  listBudgetAmendments,
  listBudgetVersions,
} from "./budget.service";
import {
  setExpenseBudgetAllocations,
  setJournalLineBudgetAllocations,
} from "./budget-allocations.service";
import { exportGrantBudgetActualsCsv, getBudgetVarianceRows } from "./budget-reporting.service";
import { extractBudgetRowsWithOpenRouter } from "./budget-intake.service";
import {
  convertPlannedExpense,
  createPlannedExpense,
  deletePlannedExpense,
  listPlannedExpenses,
  updatePlannedExpense,
} from "./planned-expenses.service";

function buildApp(
  role: "admin" | "editor" | "viewer" = "admin",
  db: unknown = {},
  permissions: Partial<PermissionMap> | null = null,
) {
  return new Hono<AppEnv>()
    .onError(errorHandler)
    .use("/grants/*", async (c, next) => {
      c.set("db", db as never);
      c.set("orgId", "org-1");
      c.set("user", { id: "user-1", email: "test@example.com", name: "Test" });
      c.set("session", { id: "sess-1", userId: "user-1" });
      c.set("memberRole", role);
      c.set("memberPermissions", permissions as PermissionMap | null);
      await next();
    })
    .route("/grants/:grantId/budget", grantBudgetRoutes);
}

function buildUnscopedBudgetApp() {
  return new Hono<AppEnv>()
    .onError(errorHandler)
    .use("/budget/*", async (c, next) => {
      c.set("db", {} as never);
      c.set("orgId", "org-1");
      c.set("user", { id: "user-1", email: "test@example.com", name: "Test" });
      c.set("session", { id: "sess-1", userId: "user-1" });
      c.set("memberRole", "viewer");
      c.set("memberPermissions", null);
      await next();
    })
    .route("/budget", grantBudgetRoutes);
}

describe("grant budget routes", () => {
  beforeEach(() => vi.resetAllMocks());

  it("creates budget versions, periods, lines, and allocations for editors", async () => {
    vi.mocked(createBudgetVersion).mockResolvedValue({ id: "version-1" } as never);
    vi.mocked(createBudgetPeriod).mockResolvedValue({ id: "period-1" } as never);
    vi.mocked(createBudgetLine).mockResolvedValue({ id: "line-1" } as never);
    vi.mocked(setExpenseBudgetAllocations).mockResolvedValue({
      allocations: [{ id: "allocation-1" }],
      warnings: [],
    } as never);
    vi.mocked(setJournalLineBudgetAllocations).mockResolvedValue({
      allocations: [{ id: "allocation-2" }],
      warnings: [],
    } as never);

    const app = buildApp("editor");
    const versionRes = await app.request("/grants/grant-1/budget/versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "manual" }),
    });
    const periodRes = await app.request("/grants/grant-1/budget/periods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        budgetVersionId: "version-1",
        label: "Q1",
        startDate: "2026-01-01",
        endDate: "2026-03-31",
      }),
    });
    const lineRes = await app.request("/grants/grant-1/budget/lines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        budgetVersionId: "version-1",
        category: "Personnel",
        approvedAmountCents: 100000,
      }),
    });
    const allocationRes = await app.request(
      "/grants/grant-1/budget/expenses/expense-1/allocations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allocations: [{ budgetLineId: "line-1", amountCents: 100000 }],
        }),
      },
    );
    const journalAllocationRes = await app.request(
      "/grants/grant-1/budget/journal-lines/jl-1/allocations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allocations: [{ budgetLineId: "line-1", amountCents: 100000 }],
        }),
      },
    );

    expect(versionRes.status).toBe(201);
    expect(periodRes.status).toBe(201);
    expect(lineRes.status).toBe(201);
    expect(allocationRes.status).toBe(200);
    expect(journalAllocationRes.status).toBe(200);
    expect(setJournalLineBudgetAllocations).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        grantId: "grant-1",
        journalLineId: "jl-1",
        actorId: "user-1",
      }),
    );
  });

  it("allows clearing expense budget allocations with an empty allocation list", async () => {
    vi.mocked(setExpenseBudgetAllocations).mockResolvedValue({
      allocations: [],
      warnings: [],
    } as never);

    const app = buildApp("editor");
    const res = await app.request("/grants/grant-1/budget/expenses/expense-1/allocations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allocations: [] }),
    });

    expect(res.status).toBe(200);
    expect(setExpenseBudgetAllocations).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        grantId: "grant-1",
        expenseId: "expense-1",
        actorId: "user-1",
        allocations: [],
      }),
    );
  });

  it("allows clearing journal-line budget allocations with an empty allocation list", async () => {
    vi.mocked(setJournalLineBudgetAllocations).mockResolvedValue({
      allocations: [],
      warnings: [],
    } as never);

    const app = buildApp("editor");
    const res = await app.request("/grants/grant-1/budget/journal-lines/jl-1/allocations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allocations: [] }),
    });

    expect(res.status).toBe(200);
    expect(setJournalLineBudgetAllocations).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        grantId: "grant-1",
        journalLineId: "jl-1",
        actorId: "user-1",
        allocations: [],
      }),
    );
  });

  it("returns budget versions and individual budget details for viewers", async () => {
    const versions = [
      {
        id: "version-2",
        status: "approved",
        periods: [{ id: "period-1" }],
        lines: [{ id: "line-1" }],
      },
    ];
    const version = versions[0];
    vi.mocked(listBudgetVersions).mockResolvedValue(versions as never);
    vi.mocked(getBudgetVersion).mockResolvedValue(version as never);

    const app = buildApp("viewer");
    const listRes = await app.request("/grants/grant-1/budget/versions");
    const detailRes = await app.request("/grants/grant-1/budget/versions/version-2");

    expect(listRes.status).toBe(200);
    expect(detailRes.status).toBe(200);
    expect(await listRes.json()).toEqual({ versions });
    expect(await detailRes.json()).toEqual(version);
    expect(listBudgetVersions).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      grantId: "grant-1",
    });
    expect(getBudgetVersion).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      grantId: "grant-1",
      versionId: "version-2",
    });
  });

  it("returns the current approved budget version for viewers", async () => {
    const current = {
      id: "version-3",
      status: "approved",
      periods: [],
      lines: [],
    };
    vi.mocked(getCurrentBudgetVersion).mockResolvedValue(current as never);

    const res = await buildApp("viewer").request("/grants/grant-1/budget/current");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(current);
    expect(getCurrentBudgetVersion).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-1",
      grantId: "grant-1",
    });
  });

  it("lists and creates planned expenses for Growth orgs", async () => {
    const planned = [{ id: "planned-1", description: "Program supplies" }];
    vi.mocked(resolvePlanTier).mockResolvedValue("growth");
    vi.mocked(listPlannedExpenses).mockResolvedValue(planned as never);
    vi.mocked(createPlannedExpense).mockResolvedValue(planned[0] as never);

    const app = buildApp("editor");
    const listRes = await app.request("/grants/grant-1/budget/planned-expenses");
    const createRes = await app.request("/grants/grant-1/budget/planned-expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        budgetLineId: "line-1",
        description: "Program supplies",
        amountCents: 50000,
        expectedDate: "2026-06-01",
      }),
    });

    expect(listRes.status).toBe(200);
    expect(await listRes.json()).toEqual({ plannedExpenses: planned });
    expect(createRes.status).toBe(201);
    expect(await createRes.json()).toEqual(planned[0]);
    expect(createPlannedExpense).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        grantId: "grant-1",
        actorId: "user-1",
        budgetLineId: "line-1",
      }),
    );
  });

  it("updates and converts planned expenses for Growth editors", async () => {
    vi.mocked(resolvePlanTier).mockResolvedValue("growth");
    vi.mocked(convertPlannedExpense).mockResolvedValue({
      plannedExpense: { id: "planned-1", convertedExpenseId: "expense-1" },
      expense: { id: "expense-1" },
    } as never);
    vi.mocked(updatePlannedExpense).mockResolvedValue({ id: "planned-1" } as never);

    const app = buildApp("editor");
    const convertRes = await app.request(
      "/grants/grant-1/budget/planned-expenses/planned-1/convert",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: "2026-08-15" }),
      },
    );
    const updateRes = await app.request("/grants/grant-1/budget/planned-expenses/planned-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "committed" }),
    });

    expect(convertRes.status).toBe(201);
    expect(updateRes.status).toBe(200);
    expect(convertPlannedExpense).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        grantId: "grant-1",
        actorId: "user-1",
        plannedExpenseId: "planned-1",
        data: { date: "2026-08-15" },
      }),
    );
    expect(updatePlannedExpense).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        grantId: "grant-1",
        actorId: "user-1",
        plannedExpenseId: "planned-1",
        data: { status: "committed" },
      }),
    );
    expect(deletePlannedExpense).not.toHaveBeenCalled();
  });

  it("blocks Growth editors from deleting planned expenses", async () => {
    vi.mocked(resolvePlanTier).mockResolvedValue("growth");
    vi.mocked(deletePlannedExpense).mockResolvedValue({ id: "planned-1" } as never);

    const res = await buildApp("editor").request(
      "/grants/grant-1/budget/planned-expenses/planned-1",
      { method: "DELETE" },
    );

    expect(res.status).toBe(403);
    expect(deletePlannedExpense).not.toHaveBeenCalled();
  });

  it("deletes planned expenses for Growth grant managers", async () => {
    vi.mocked(resolvePlanTier).mockResolvedValue("growth");
    vi.mocked(deletePlannedExpense).mockResolvedValue({ id: "planned-1" } as never);

    const res = await buildApp("admin").request(
      "/grants/grant-1/budget/planned-expenses/planned-1",
      { method: "DELETE" },
    );

    expect(res.status).toBe(204);
    expect(deletePlannedExpense).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        grantId: "grant-1",
        actorId: "user-1",
        plannedExpenseId: "planned-1",
      }),
    );
  });

  it("blocks Starter planned expense workflows", async () => {
    vi.mocked(resolvePlanTier).mockResolvedValue("starter");

    const res = await buildApp("editor").request("/grants/grant-1/budget/planned-expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        budgetLineId: "line-1",
        description: "Program supplies",
        amountCents: 50000,
        expectedDate: "2026-06-01",
      }),
    });

    expect(res.status).toBe(402);
    expect(createPlannedExpense).not.toHaveBeenCalled();
  });

  it("lists and creates budget amendments for Audit-Ready editors", async () => {
    const amendments = [{ id: "amendment-1", reason: "Rebudget personnel" }];
    const created = {
      amendment: amendments[0],
      budgetVersion: { id: "version-2", source: "amendment" },
    };
    vi.mocked(resolvePlanTier).mockResolvedValue("audit_ready");
    vi.mocked(listBudgetAmendments).mockResolvedValue(amendments as never);
    vi.mocked(createBudgetAmendment).mockResolvedValue(created as never);

    const app = buildApp("editor");
    const listRes = await app.request("/grants/grant-1/budget/amendments");
    const createRes = await app.request("/grants/grant-1/budget/amendments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        previousBudgetVersionId: "version-1",
        reason: "Rebudget personnel",
        effectiveDate: "2026-07-01",
        supportingDocumentId: "doc-1",
      }),
    });

    expect(listRes.status).toBe(200);
    expect(await listRes.json()).toEqual({ amendments });
    expect(createRes.status).toBe(201);
    expect(await createRes.json()).toEqual(created);
    expect(createBudgetAmendment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        grantId: "grant-1",
        actorId: "user-1",
        previousBudgetVersionId: "version-1",
        reason: "Rebudget personnel",
      }),
    );
  });

  it("blocks Starter amendment workflows", async () => {
    vi.mocked(resolvePlanTier).mockResolvedValue("growth");

    const res = await buildApp("editor").request("/grants/grant-1/budget/amendments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        previousBudgetVersionId: "version-1",
        reason: "Rebudget personnel",
        effectiveDate: "2026-07-01",
      }),
    });

    expect(res.status).toBe(402);
    expect(createBudgetAmendment).not.toHaveBeenCalled();
  });

  it("approves versions only for grant managers", async () => {
    vi.mocked(approveBudgetVersion).mockResolvedValue({ id: "version-1" } as never);

    const editorRes = await buildApp("editor").request(
      "/grants/grant-1/budget/versions/version-1/approve",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvedAt: "2026-02-01" }),
      },
    );
    const adminRes = await buildApp("admin").request(
      "/grants/grant-1/budget/versions/version-1/approve",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvedAt: "2026-02-01" }),
      },
    );

    expect(editorRes.status).toBe(403);
    expect(adminRes.status).toBe(200);
    expect(approveBudgetVersion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        grantId: "grant-1",
        versionId: "version-1",
        actorId: "user-1",
        approvedAt: "2026-02-01",
      }),
    );
  });

  it("returns budget variance and exports CSV for Growth orgs", async () => {
    const rows = [
      {
        lineId: "line-1",
        category: "Personnel",
        approvedAmountCents: 100000,
        actualCents: 25000,
        plannedCents: 0,
        remainingCents: 75000,
        varianceCents: 75000,
        variancePercent: 75,
        allowable: true,
        costType: "direct",
      },
    ];
    vi.mocked(resolvePlanTier).mockResolvedValue("growth");
    vi.mocked(getBudgetVarianceRows).mockResolvedValue(rows);
    vi.mocked(exportGrantBudgetActualsCsv).mockReturnValue("budget_line_id\nline-1");

    const app = buildApp("viewer");
    const varianceRes = await app.request(
      "/grants/grant-1/budget/variance?periodId=period-1&allowable=true",
    );
    const exportRes = await app.request("/grants/grant-1/budget/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "csv", category: "Personnel" }),
    });

    expect(varianceRes.status).toBe(200);
    expect(await varianceRes.json()).toEqual({ rows });
    expect(exportRes.status).toBe(200);
    expect(await exportRes.json()).toEqual({
      format: "csv",
      content: "budget_line_id\nline-1",
    });
    expect(exportGrantBudgetActualsCsv).toHaveBeenCalledWith(rows);
  });

  it("requires grantId when mounted without a grant route parameter", async () => {
    const res = await buildUnscopedBudgetApp().request("/budget/variance");

    expect(res.status).toBe(400);
    expect(getBudgetVarianceRows).not.toHaveBeenCalled();
  });

  it("allows Starter exports and requires an OpenRouter key for Growth AI extraction", async () => {
    vi.mocked(resolvePlanTier).mockResolvedValueOnce("starter").mockResolvedValueOnce("growth");

    const app = buildApp("editor");
    const exportRes = await app.request("/grants/grant-1/budget/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "csv" }),
    });
    const intakeRes = await app.request(
      "/grants/grant-1/budget/intake/extract",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: "doc-1", documentText: "Personnel $1,000" }),
      },
      {},
    );

    expect(exportRes.status).toBe(200);
    expect(intakeRes.status).toBe(400);
    expect(getBudgetVarianceRows).toHaveBeenCalled();
    expect(extractBudgetRowsWithOpenRouter).not.toHaveBeenCalled();
  });

  it("extracts budget rows for Growth orgs when OpenRouter is configured", async () => {
    vi.mocked(resolvePlanTier).mockResolvedValue("growth");
    vi.mocked(extractBudgetRowsWithOpenRouter).mockResolvedValue([
      {
        category: "Personnel",
        approvedAmountCents: 100000,
        allowable: true,
        costType: "direct",
      },
    ]);

    const res = await buildApp("editor").request(
      "/grants/grant-1/budget/intake/extract",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: "doc-1", documentText: "Personnel $1,000" }),
      },
      { OPENROUTER_API_KEY: "openrouter-test-key" },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      rows: [
        {
          category: "Personnel",
          approvedAmountCents: 100000,
          allowable: true,
          costType: "direct",
        },
      ],
      sourceDocumentId: "doc-1",
      reviewRequired: true,
    });
  });
});
