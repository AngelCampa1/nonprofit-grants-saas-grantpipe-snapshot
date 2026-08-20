import { beforeEach, describe, expect, it, vi } from "vitest";
import { ANALYTICS_EVENTS, type PermissionMap } from "@grantpipe/shared";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../../types";
import { errorHandler } from "../../middleware/error-handler";
import { grantRoutes } from "./routes";

const { mockCaptureAnalytics } = vi.hoisted(() => ({
  mockCaptureAnalytics: vi.fn(),
}));

vi.mock("../../lib/integrations", () => ({
  getIntegrations: vi.fn(() => ({
    analytics: {
      capture: mockCaptureAnalytics,
    },
  })),
}));

vi.mock("./funder.service", () => ({
  listFunders: vi.fn(),
  getFunder: vi.fn(),
  createFunder: vi.fn(),
  updateFunder: vi.fn(),
  deleteFunder: vi.fn(),
  createFunderContact: vi.fn(),
  updateFunderContact: vi.fn(),
  deleteFunderContact: vi.fn(),
}));

vi.mock("./grant.service", () => ({
  listGrants: vi.fn(),
  listGrantPipeline: vi.fn(),
  getGrant: vi.fn(),
  createGrant: vi.fn(),
  updateGrant: vi.fn(),
  upsertGrantFederalAwardMetadata: vi.fn(),
  deleteGrant: vi.fn(),
  resolvePlanTier: vi.fn(),
  closeoutGrant: vi.fn(),
  createAllocation: vi.fn(),
  updateAllocation: vi.fn(),
  deleteAllocation: vi.fn(),
  createImpactMetric: vi.fn(),
  updateImpactMetric: vi.fn(),
  deleteImpactMetric: vi.fn(),
  createImpactMetricEntry: vi.fn(),
  updateImpactMetricEntry: vi.fn(),
  deleteImpactMetricEntry: vi.fn(),
}));

vi.mock("./fund.service", () => ({
  listFunds: vi.fn(),
  getFund: vi.fn(),
  createFund: vi.fn(),
  updateFund: vi.fn(),
  deleteFund: vi.fn(),
  createExpense: vi.fn(),
  updateExpense: vi.fn(),
  deleteExpense: vi.fn(),
}));

vi.mock("./reporting.service", () => ({
  createReportingRequirement: vi.fn(),
  updateReportingRequirement: vi.fn(),
  deleteReportingRequirement: vi.fn(),
  createCloseoutItem: vi.fn(),
  updateCloseoutItem: vi.fn(),
  deleteCloseoutItem: vi.fn(),
}));

vi.mock("./spend-down.service", () => ({
  getGrantSpendDown: vi.fn(),
}));

vi.mock("./opportunity.service", () => ({
  searchGrantOpportunities: vi.fn(),
  listGrantOpportunities: vi.fn(),
  lookupFoundationProspects: vi.fn(),
  createGrantOpportunity: vi.fn(),
  saveGrantOpportunity: vi.fn(),
  dismissGrantOpportunity: vi.fn(),
  convertGrantOpportunity: vi.fn(),
  listGrantOpportunitySavedSearches: vi.fn(),
  createGrantOpportunitySavedSearch: vi.fn(),
  updateGrantOpportunitySavedSearch: vi.fn(),
  deleteGrantOpportunitySavedSearch: vi.fn(),
}));

vi.mock("./budget.service", () => ({
  createBudgetVersion: vi.fn(),
  createBudgetPeriod: vi.fn(),
  createBudgetLine: vi.fn(),
  approveBudgetVersion: vi.fn(),
}));

vi.mock("./budget-allocations.service", () => ({
  setExpenseBudgetAllocations: vi.fn(),
}));

vi.mock("./budget-reporting.service", () => ({
  getBudgetVarianceRows: vi.fn(),
  exportGrantBudgetActualsCsv: vi.fn(),
}));

vi.mock("./budget-intake.service", () => ({
  extractBudgetRowsWithOpenRouter: vi.fn(),
}));

import {
  createFunder,
  createFunderContact,
  deleteFunder,
  deleteFunderContact,
  getFunder,
  listFunders,
  updateFunder,
  updateFunderContact,
} from "./funder.service";
import {
  closeoutGrant,
  createAllocation,
  createGrant,
  createImpactMetric,
  createImpactMetricEntry,
  deleteAllocation,
  deleteGrant,
  resolvePlanTier,
  deleteImpactMetric,
  deleteImpactMetricEntry,
  getGrant,
  listGrantPipeline,
  listGrants,
  updateAllocation,
  upsertGrantFederalAwardMetadata,
  updateGrant,
  updateImpactMetric,
  updateImpactMetricEntry,
} from "./grant.service";
import {
  createExpense,
  createFund,
  deleteExpense,
  deleteFund,
  getFund,
  listFunds,
  updateExpense,
  updateFund,
} from "./fund.service";
import {
  createCloseoutItem,
  createReportingRequirement,
  deleteCloseoutItem,
  deleteReportingRequirement,
  updateCloseoutItem,
  updateReportingRequirement,
} from "./reporting.service";
import { getGrantSpendDown } from "./spend-down.service";
import {
  convertGrantOpportunity,
  createGrantOpportunity,
  createGrantOpportunitySavedSearch,
  deleteGrantOpportunitySavedSearch,
  dismissGrantOpportunity,
  listGrantOpportunities,
  listGrantOpportunitySavedSearches,
  lookupFoundationProspects,
  saveGrantOpportunity,
  searchGrantOpportunities,
  updateGrantOpportunitySavedSearch,
} from "./opportunity.service";
import {
  approveBudgetVersion,
  createBudgetLine,
  createBudgetPeriod,
  createBudgetVersion,
} from "./budget.service";
import { setExpenseBudgetAllocations } from "./budget-allocations.service";
import { exportGrantBudgetActualsCsv, getBudgetVarianceRows } from "./budget-reporting.service";
import { extractBudgetRowsWithOpenRouter } from "./budget-intake.service";

function buildSelectChain(countValue: number) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([{ value: countValue }]),
  };
  return vi.fn().mockReturnValue(chain);
}

function buildDefaultDb(countValue = 2) {
  return { select: buildSelectChain(countValue) };
}

function buildApp(
  role: "admin" | "editor" | "viewer" = "admin",
  db: unknown = buildDefaultDb(),
  permissions: Partial<PermissionMap> | null = null,
) {
  return new Hono<AppEnv>()
    .onError(errorHandler)
    .use("/grants/*", async (c, next) => {
      c.set("db", db as never);
      c.set("orgId", "org-1");
      c.set("entityId", "entity-1");
      c.set("user", { id: "user-1", email: "test@example.com", name: "Test" });
      c.set("session", { id: "sess-1", userId: "user-1" });
      c.set("memberRole", role);
      c.set("memberPermissions", permissions as PermissionMap | null);
      await next();
    })
    .route("/grants", grantRoutes);
}

describe("GET /grants", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns paginated grants", async () => {
    vi.mocked(listGrants).mockResolvedValue({
      data: [{ id: "grant-1" }],
      total: 1,
      page: 1,
      pageSize: 25,
    } as never);
    const app = buildApp("viewer");
    const res = await app.request("/grants");

    expect(res.status).toBe(200);
    expect(listGrants).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1", entityId: "entity-1" }),
    );
  });
});

describe("GET /grants/pipeline", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns grouped pipeline data", async () => {
    vi.mocked(listGrantPipeline).mockResolvedValue({
      discovery: { grants: [], count: 0 },
    } as never);
    const app = buildApp("viewer");
    const res = await app.request("/grants/pipeline");

    expect(res.status).toBe(200);
  });
});

describe("grant budget routes", () => {
  beforeEach(() => vi.resetAllMocks());

  it("lets editors create draft budget versions, periods, lines, and allocations", async () => {
    vi.mocked(createBudgetVersion).mockResolvedValue({ id: "version-1" } as never);
    vi.mocked(createBudgetPeriod).mockResolvedValue({ id: "period-1" } as never);
    vi.mocked(createBudgetLine).mockResolvedValue({ id: "line-1" } as never);
    vi.mocked(setExpenseBudgetAllocations).mockResolvedValue({
      allocations: [{ id: "allocation-1" }],
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

    expect(versionRes.status).toBe(201);
    expect(periodRes.status).toBe(201);
    expect(lineRes.status).toBe(201);
    expect(allocationRes.status).toBe(200);
  });

  it("rejects direct approved versions and source document links on create", async () => {
    const app = buildApp("editor");
    const approvedRes = await app.request("/grants/grant-1/budget/versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "manual", status: "approved" }),
    });
    const documentRes = await app.request("/grants/grant-1/budget/versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "manual", sourceDocumentId: "document-1" }),
    });

    expect(approvedRes.status).toBe(400);
    expect(documentRes.status).toBe(400);
    expect(createBudgetVersion).not.toHaveBeenCalled();
  });

  it("requires manage permission to approve a budget version", async () => {
    vi.mocked(approveBudgetVersion).mockResolvedValue({ id: "version-1" } as never);

    const viewerRes = await buildApp("editor").request(
      "/grants/grant-1/budget/versions/version-1/approve",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    const adminRes = await buildApp("admin").request(
      "/grants/grant-1/budget/versions/version-1/approve",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );

    expect(viewerRes.status).toBe(403);
    expect(adminRes.status).toBe(200);
  });

  it("returns budget variance and exports the same rows as CSV", async () => {
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
    const varianceRes = await app.request("/grants/grant-1/budget/variance");
    const exportRes = await app.request("/grants/grant-1/budget/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "csv" }),
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

  it("allows Starter budget exports but still blocks AI extraction", async () => {
    vi.mocked(resolvePlanTier).mockResolvedValue("starter");

    const app = buildApp("editor");
    const exportRes = await app.request("/grants/grant-1/budget/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "csv" }),
    });
    const intakeRes = await app.request("/grants/grant-1/budget/intake/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: "doc-1", documentText: "Personnel $1,000" }),
    });

    expect(exportRes.status).toBe(200);
    expect(intakeRes.status).toBe(402);
    expect(getBudgetVarianceRows).toHaveBeenCalled();
    expect(extractBudgetRowsWithOpenRouter).not.toHaveBeenCalled();
  });

  it("calls OpenRouter budget extraction for Growth orgs with document text", async () => {
    vi.mocked(resolvePlanTier).mockResolvedValue("growth");
    vi.mocked(extractBudgetRowsWithOpenRouter).mockResolvedValue([
      {
        category: "Personnel",
        approvedAmountCents: 100000,
        allowable: true,
        costType: "direct",
      },
    ]);

    const app = buildApp("editor");
    const res = await app.request(
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
    expect(extractBudgetRowsWithOpenRouter).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "google/gemini-3.1-flash-lite",
        documentText: "Personnel $1,000",
      }),
    );
  });
});

describe("grant opportunity routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCaptureAnalytics.mockResolvedValue(undefined);
  });

  it("searches Grants.gov opportunities for viewers", async () => {
    vi.mocked(searchGrantOpportunities).mockResolvedValue({
      data: [{ id: "opp-1", title: "Food access grant" }],
      total: 1,
      page: 1,
      pageSize: 25,
    } as never);

    const res = await buildApp("viewer").request("/grants/opportunities/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword: "food" }),
    });

    expect(res.status).toBe(200);
    expect(searchGrantOpportunities).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1", keyword: "food" }),
    );
  });

  it("lists cached opportunities for viewers", async () => {
    vi.mocked(listGrantOpportunities).mockResolvedValue({
      data: [{ id: "opp-1" }],
      total: 1,
      page: 1,
      pageSize: 25,
    } as never);

    const res = await buildApp("viewer").request("/grants/opportunities?keyword=food");

    expect(res.status).toBe(200);
    expect(listGrantOpportunities).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1", keyword: "food" }),
    );
  });

  it("lets editors create manual non-federal opportunities", async () => {
    vi.mocked(createGrantOpportunity).mockResolvedValue({
      id: "opp-2",
      title: "Neighborhood Resilience Fund",
      sourceType: "community_foundation",
    } as never);

    const res = await buildApp("editor").request("/grants/opportunities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Neighborhood Resilience Fund",
        sourceType: "community_foundation",
        sourceName: "Community Foundation of Central Texas",
        sourceUrl: "https://example.org/apply",
        funderType: "foundation",
        deadlineSource: "funder_website",
        closeDate: "2026-08-15T00:00:00.000Z",
      }),
    });

    expect(res.status).toBe(201);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.grantOpportunityCreated,
      payload: {
        actorId: "user-1",
        entity_type: "grant_opportunity",
        source_type: "community_foundation",
        funder_type: "foundation",
      },
    });
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain(
      "Neighborhood Resilience Fund",
    );
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("opp-2");
    expect(createGrantOpportunity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        sourceType: "community_foundation",
        sourceName: "Community Foundation of Central Texas",
      }),
    );
  });

  it("looks up foundation prospect context for viewers", async () => {
    vi.mocked(lookupFoundationProspects).mockResolvedValue({
      data: [{ ein: "123456789", name: "Community Foundation" }],
      total: 1,
      page: 1,
      pageSize: 25,
      source: "propublica_nonprofit_explorer",
    } as never);

    const res = await buildApp("viewer").request(
      "/grants/foundation-prospects?query=community&state=ca",
    );

    expect(res.status).toBe(200);
    expect(lookupFoundationProspects).toHaveBeenCalledWith(
      expect.objectContaining({ query: "community", state: "CA" }),
    );
  });

  it("lets editors save, dismiss, and convert opportunities", async () => {
    vi.mocked(saveGrantOpportunity).mockResolvedValue({ id: "action-1", state: "saved" } as never);
    vi.mocked(dismissGrantOpportunity).mockResolvedValue({
      id: "action-1",
      state: "dismissed",
    } as never);
    vi.mocked(convertGrantOpportunity).mockResolvedValue({
      opportunity: { id: "opp-1" },
      grant: { id: "grant-1" },
    } as never);
    const app = buildApp("editor");

    const saveRes = await app.request("/grants/opportunities/opp-1/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "Strong fit" }),
    });
    const dismissRes = await app.request("/grants/opportunities/opp-1/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "Not a fit" }),
    });
    const convertRes = await app.request("/grants/opportunities/opp-1/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "application" }),
    });

    expect(saveRes.status).toBe(200);
    expect(dismissRes.status).toBe(200);
    expect(convertRes.status).toBe(201);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.grantOpportunitySaved,
      payload: {
        actorId: "user-1",
        entity_type: "grant_opportunity",
      },
    });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.grantOpportunityConverted,
      payload: {
        actorId: "user-1",
        entity_type: "grant_opportunity",
        status: "application",
      },
    });
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("opp-1");
    expect(convertGrantOpportunity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ opportunityId: "opp-1", actorId: "user-1", status: "application" }),
    );
  });

  it("manages saved searches for editors", async () => {
    vi.mocked(listGrantOpportunitySavedSearches).mockResolvedValue([{ id: "search-1" }] as never);
    vi.mocked(createGrantOpportunitySavedSearch).mockResolvedValue({ id: "search-1" } as never);
    vi.mocked(updateGrantOpportunitySavedSearch).mockResolvedValue({ id: "search-1" } as never);
    vi.mocked(deleteGrantOpportunitySavedSearch).mockResolvedValue(undefined as never);
    const app = buildApp("editor");

    const listRes = await app.request("/grants/opportunity-searches");
    const createRes = await app.request("/grants/opportunity-searches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Food grants", filters: { keyword: "food" } }),
    });
    const updateRes = await app.request("/grants/opportunity-searches/search-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Food access grants" }),
    });
    const adminApp = buildApp("admin");
    const deleteRes = await adminApp.request("/grants/opportunity-searches/search-1", {
      method: "DELETE",
    });

    expect(listRes.status).toBe(200);
    expect(createRes.status).toBe(201);
    expect(updateRes.status).toBe(200);
    expect(deleteRes.status).toBe(204);
    expect(deleteGrantOpportunitySavedSearch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        searchId: "search-1",
      }),
    );
  });
});

describe("POST /grants", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCaptureAnalytics.mockResolvedValue(undefined);
  });

  it("allows editors to create grants", async () => {
    vi.mocked(createGrant).mockResolvedValue({ id: "grant-1" } as never);
    const app = buildApp("editor");
    const res = await app.request("/grants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ funderId: "funder-1", name: "Summer Programs" }),
    });

    expect(res.status).toBe(201);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.grantCreated,
      payload: {
        actorId: "user-1",
        entity_type: "grant",
        source: "manual",
      },
    });
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("Summer Programs");
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("grant-1");
    expect(createGrant).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        funderId: "funder-1",
        name: "Summer Programs",
      }),
    );
  });

  it("allows a viewer with grants edit permission override to create grants", async () => {
    vi.mocked(createGrant).mockResolvedValue({ id: "grant-1" } as never);
    const app = buildApp("viewer", buildDefaultDb(), { grants: "edit" });
    const res = await app.request("/grants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ funderId: "funder-1", name: "Summer Programs" }),
    });

    expect(res.status).toBe(201);
    expect(createGrant).toHaveBeenCalledOnce();
  });

  it("rejects invalid payloads", async () => {
    const app = buildApp("editor");
    const res = await app.request("/grants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });

    expect(res.status).toBe(400);
  });

  it("does not pass planTier to createGrant (service resolves internally)", async () => {
    vi.mocked(createGrant).mockResolvedValue({ id: "grant-1" } as never);
    const app = buildApp("editor");
    const res = await app.request("/grants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ funderId: "funder-1", name: "Paid Grant" }),
    });

    expect(res.status).toBe(201);
    const passed = vi.mocked(createGrant).mock.calls[0]?.[1];
    expect(passed && "planTier" in (passed as object)).toBe(false);
  });

  it("emits first_grant_created when this is the org's first grant", async () => {
    vi.mocked(createGrant).mockResolvedValue({ id: "grant-first" } as never);
    const app = buildApp("editor", buildDefaultDb(1));
    const res = await app.request("/grants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ funderId: "funder-1", name: "First Grant" }),
    });

    expect(res.status).toBe(201);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: ANALYTICS_EVENTS.firstGrantCreated }),
    );
  });

  it("does NOT emit first_grant_created when the org already has grants", async () => {
    vi.mocked(createGrant).mockResolvedValue({ id: "grant-second" } as never);
    const app = buildApp("editor", buildDefaultDb(2));
    const res = await app.request("/grants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ funderId: "funder-1", name: "Second Grant" }),
    });

    expect(res.status).toBe(201);
    const firstEvents = vi
      .mocked(mockCaptureAnalytics)
      .mock.calls.filter(([args]) => args.eventName === ANALYTICS_EVENTS.firstGrantCreated);
    expect(firstEvents).toHaveLength(0);
  });
});

describe("GET /grants/:grantId", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns grant detail", async () => {
    vi.mocked(getGrant).mockResolvedValue({
      id: "grant-1",
      summary: { thresholdState: "80" },
    } as never);
    const app = buildApp("viewer");
    const res = await app.request("/grants/grant-1");

    expect(res.status).toBe(200);
  });
});

describe("grant mutation routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCaptureAnalytics.mockResolvedValue(undefined);
  });

  it("updates and deletes grants", async () => {
    vi.mocked(updateGrant).mockResolvedValue({ id: "grant-1" } as never);
    vi.mocked(deleteGrant).mockResolvedValue(undefined as never);
    const app = buildApp("admin");

    const updateRes = await app.request("/grants/grant-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
    const deleteRes = await app.request("/grants/grant-1", { method: "DELETE" });

    expect(updateRes.status).toBe(200);
    expect(deleteRes.status).toBe(204);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.grantUpdated,
      payload: {
        actorId: "user-1",
        entity_type: "grant",
        changed_fields: ["status"],
      },
    });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.grantStageChanged,
      payload: {
        actorId: "user-1",
        entity_type: "grant",
        stage: "active",
      },
    });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.grantDeleted,
      payload: {
        actorId: "user-1",
        entity_type: "grant",
      },
    });
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("grant-1");
    expect(updateGrant).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        grantId: "grant-1",
      }),
    );
    expect(deleteGrant).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        grantId: "grant-1",
      }),
    );
  });

  it("upserts path-scoped federal award metadata for SEFA reporting", async () => {
    vi.mocked(upsertGrantFederalAwardMetadata).mockResolvedValue({
      grantId: "grant-1",
      assistanceListingNumber: "14.218",
      federalAgency: "HUD",
      sefaInclusionType: "cash",
    } as never);
    const app = buildApp("editor");

    const res = await app.request("/grants/grant-1/federal-award-metadata", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assistanceListingNumber: "14.218",
        federalAgency: "HUD",
        sefaInclusionType: "cash",
      }),
    });

    expect(res.status).toBe(200);
    expect(upsertGrantFederalAwardMetadata).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        grantId: "grant-1",
        data: expect.objectContaining({
          assistanceListingNumber: "14.218",
          federalAgency: "HUD",
          sefaInclusionType: "cash",
        }),
      }),
    );
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.grantUpdated,
      payload: {
        actorId: "user-1",
        entity_type: "grant",
        changed_fields: ["federalAwardMetadata"],
      },
    });
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("14.218");
  });

  it("creates, updates, and deletes allocations", async () => {
    vi.mocked(createAllocation).mockResolvedValue({ id: "allocation-1" } as never);
    vi.mocked(updateAllocation).mockResolvedValue({ id: "allocation-1" } as never);
    vi.mocked(deleteAllocation).mockResolvedValue(undefined as never);
    const app = buildApp("admin");

    expect(
      await app.request("/grants/grant-1/allocations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fundId: "fund-1", allocatedAmountCents: 10_000 }),
      }),
    ).toMatchObject({ status: 201 });
    expect(
      await app.request("/grants/grant-1/allocations/allocation-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allocatedAmountCents: 20_000 }),
      }),
    ).toMatchObject({ status: 200 });
    expect(
      await app.request("/grants/grant-1/allocations/allocation-1", { method: "DELETE" }),
    ).toMatchObject({ status: 204 });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.grantFundAllocationCreated,
      payload: {
        actorId: "user-1",
        entity_type: "grant_fund_allocation",
      },
    });
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("allocation-1");
    expect(createAllocation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        grantId: "grant-1",
        fundId: "fund-1",
        allocatedAmountCents: 10_000,
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
      }),
    );
    expect(updateAllocation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        grantId: "grant-1",
        allocationId: "allocation-1",
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
      }),
    );
    expect(deleteAllocation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        grantId: "grant-1",
        allocationId: "allocation-1",
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
      }),
    );
  });

  it("blocks allocation mutations when funds permission is removed even if grants are allowed", async () => {
    const app = buildApp("editor", {}, { grants: "manage", funds: "none" });

    const createRes = await app.request("/grants/grant-1/allocations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fundId: "fund-1", allocatedAmountCents: 10_000 }),
    });
    const updateRes = await app.request("/grants/grant-1/allocations/allocation-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allocatedAmountCents: 20_000 }),
    });
    const deleteRes = await app.request("/grants/grant-1/allocations/allocation-1", {
      method: "DELETE",
    });

    expect(createRes.status).toBe(403);
    expect(updateRes.status).toBe(403);
    expect(deleteRes.status).toBe(403);
    expect(createAllocation).not.toHaveBeenCalled();
    expect(updateAllocation).not.toHaveBeenCalled();
    expect(deleteAllocation).not.toHaveBeenCalled();
  });

  it("creates, updates, and deletes metrics and entries", async () => {
    vi.mocked(createImpactMetric).mockResolvedValue({ id: "metric-1" } as never);
    vi.mocked(updateImpactMetric).mockResolvedValue({ id: "metric-1" } as never);
    vi.mocked(deleteImpactMetric).mockResolvedValue(undefined as never);
    vi.mocked(createImpactMetricEntry).mockResolvedValue({ id: "entry-1" } as never);
    vi.mocked(updateImpactMetricEntry).mockResolvedValue({ id: "entry-1" } as never);
    vi.mocked(deleteImpactMetricEntry).mockResolvedValue(undefined as never);
    const app = buildApp("admin");

    expect(
      await app.request("/grants/grant-1/metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Families Served" }),
      }),
    ).toMatchObject({ status: 201 });
    expect(
      await app.request("/grants/grant-1/metrics/metric-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unit: "families" }),
      }),
    ).toMatchObject({ status: 200 });
    expect(
      await app.request("/grants/grant-1/metrics/metric-1", { method: "DELETE" }),
    ).toMatchObject({ status: 204 });

    expect(
      await app.request("/grants/grant-1/metrics/metric-1/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          value: "10",
          periodStart: "2026-01-01T00:00:00Z",
          periodEnd: "2026-03-31T00:00:00Z",
        }),
      }),
    ).toMatchObject({ status: 201 });
    expect(
      await app.request("/grants/grant-1/metrics/metric-1/entries/entry-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "updated" }),
      }),
    ).toMatchObject({ status: 200 });
    expect(
      await app.request("/grants/grant-1/metrics/metric-1/entries/entry-1", {
        method: "DELETE",
      }),
    ).toMatchObject({ status: 204 });
    expect(createImpactMetric).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        grantId: "grant-1",
      }),
    );
    expect(updateImpactMetric).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        metricId: "metric-1",
      }),
    );
    expect(deleteImpactMetric).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        metricId: "metric-1",
      }),
    );
    expect(createImpactMetricEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        grantId: "grant-1",
        metricId: "metric-1",
      }),
    );
    expect(updateImpactMetricEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        metricId: "metric-1",
        entryId: "entry-1",
      }),
    );
    expect(deleteImpactMetricEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        metricId: "metric-1",
        entryId: "entry-1",
      }),
    );
  });

  it("creates, updates, and deletes reporting requirements and closeout items", async () => {
    vi.mocked(createReportingRequirement).mockResolvedValue({ id: "req-1" } as never);
    vi.mocked(updateReportingRequirement).mockResolvedValue({ id: "req-1" } as never);
    vi.mocked(deleteReportingRequirement).mockResolvedValue(undefined as never);
    vi.mocked(createCloseoutItem).mockResolvedValue({ id: "item-1" } as never);
    vi.mocked(updateCloseoutItem).mockResolvedValue({ id: "item-1" } as never);
    vi.mocked(deleteCloseoutItem).mockResolvedValue(undefined as never);
    const app = buildApp("admin");

    expect(
      await app.request("/grants/grant-1/reporting-requirements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportType: "quarterly", dueDate: "2026-10-01T00:00:00Z" }),
      }),
    ).toMatchObject({ status: 201 });
    expect(
      await app.request("/grants/grant-1/reporting-requirements/req-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "submitted" }),
      }),
    ).toMatchObject({ status: 200 });
    expect(
      await app.request("/grants/grant-1/reporting-requirements/req-1", { method: "DELETE" }),
    ).toMatchObject({ status: 204 });

    expect(
      await app.request("/grants/grant-1/closeout-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: "Archive files",
          dueDate: "2026-10-15T00:00:00Z",
        }),
      }),
    ).toMatchObject({ status: 201 });
    expect(
      await app.request("/grants/grant-1/closeout-items/item-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: true }),
      }),
    ).toMatchObject({ status: 200 });
    expect(
      await app.request("/grants/grant-1/closeout-items/item-1", { method: "DELETE" }),
    ).toMatchObject({ status: 204 });
    expect(createReportingRequirement).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        grantId: "grant-1",
      }),
    );
    expect(updateReportingRequirement).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        requirementId: "req-1",
      }),
    );
    expect(deleteReportingRequirement).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        requirementId: "req-1",
      }),
    );
    expect(createCloseoutItem).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        grantId: "grant-1",
        dueDate: "2026-10-15T00:00:00Z",
      }),
    );
    expect(updateCloseoutItem).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        itemId: "item-1",
      }),
    );
    expect(deleteCloseoutItem).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        itemId: "item-1",
      }),
    );
  });
});

describe("funders routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCaptureAnalytics.mockResolvedValue(undefined);
  });

  it("returns funder list", async () => {
    vi.mocked(listFunders).mockResolvedValue({
      data: [{ id: "funder-1" }],
      total: 1,
      page: 1,
      pageSize: 25,
    } as never);
    const app = buildApp("viewer");
    const res = await app.request("/grants/funders");

    expect(res.status).toBe(200);
  });

  it("creates funders", async () => {
    vi.mocked(createFunder).mockResolvedValue({ id: "funder-1" } as never);
    const app = buildApp("editor");
    const res = await app.request("/grants/funders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Acme Foundation", type: "foundation" }),
    });

    expect(res.status).toBe(201);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.funderCreated,
      payload: {
        actorId: "user-1",
        entity_type: "funder",
        funder_type: "foundation",
      },
    });
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("Acme Foundation");
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("funder-1");
    expect(createFunder).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        name: "Acme Foundation",
      }),
    );
  });

  it("returns funder detail", async () => {
    vi.mocked(getFunder).mockResolvedValue({ id: "funder-1" } as never);
    const app = buildApp("viewer");
    const res = await app.request("/grants/funders/funder-1");

    expect(res.status).toBe(200);
  });

  it("creates funder contacts", async () => {
    vi.mocked(createFunderContact).mockResolvedValue({ id: "contact-1" } as never);
    const app = buildApp("editor");
    const res = await app.request("/grants/funders/funder-1/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Jane Officer" }),
    });

    expect(res.status).toBe(201);
    expect(createFunderContact).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        funderId: "funder-1",
      }),
    );
  });

  it("updates and deletes funders and contacts", async () => {
    vi.mocked(updateFunder).mockResolvedValue({ id: "funder-1" } as never);
    vi.mocked(deleteFunder).mockResolvedValue(undefined as never);
    vi.mocked(updateFunderContact).mockResolvedValue({ id: "contact-1" } as never);
    vi.mocked(deleteFunderContact).mockResolvedValue(undefined as never);
    const app = buildApp("admin");

    expect(
      await app.request("/grants/funders/funder-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Updated" }),
      }),
    ).toMatchObject({ status: 200 });
    expect(await app.request("/grants/funders/funder-1", { method: "DELETE" })).toMatchObject({
      status: 204,
    });
    expect(
      await app.request("/grants/funders/funder-1/contacts/contact-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Director" }),
      }),
    ).toMatchObject({ status: 200 });
    expect(
      await app.request("/grants/funders/funder-1/contacts/contact-1", { method: "DELETE" }),
    ).toMatchObject({ status: 204 });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.funderUpdated,
      payload: {
        actorId: "user-1",
        entity_type: "funder",
        changed_fields: ["notes"],
      },
    });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.funderDeleted,
      payload: {
        actorId: "user-1",
        entity_type: "funder",
      },
    });
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("funder-1");
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("Updated");
    expect(updateFunder).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        funderId: "funder-1",
      }),
    );
    expect(deleteFunder).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        funderId: "funder-1",
      }),
    );
    expect(updateFunderContact).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        funderId: "funder-1",
        contactId: "contact-1",
      }),
    );
    expect(deleteFunderContact).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        funderId: "funder-1",
        contactId: "contact-1",
      }),
    );
  });
});

describe("funds routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCaptureAnalytics.mockResolvedValue(undefined);
  });

  it("returns fund list", async () => {
    vi.mocked(listFunds).mockResolvedValue({
      data: [{ id: "fund-1" }],
      total: 1,
      page: 1,
      pageSize: 25,
    } as never);
    const app = buildApp("viewer");
    const res = await app.request("/grants/funds");

    expect(res.status).toBe(200);
  });

  it("blocks fund list when funds permission is removed even if grants are allowed", async () => {
    const app = buildApp("viewer", {}, { grants: "view", funds: "none" });
    const res = await app.request("/grants/funds");

    expect(res.status).toBe(403);
    expect(listFunds).not.toHaveBeenCalled();
  });

  it("creates funds", async () => {
    vi.mocked(createFund).mockResolvedValue({ id: "fund-1" } as never);
    const app = buildApp("editor");
    const res = await app.request("/grants/funds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "General Operations", type: "unrestricted" }),
    });

    expect(res.status).toBe(201);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.fundCreated,
      payload: {
        actorId: "user-1",
        entity_type: "fund",
        fund_type: "unrestricted",
      },
    });
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("General Operations");
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("fund-1");
    expect(createFund).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        name: "General Operations",
      }),
    );
  });

  it("blocks fund creation when funds permission is removed even if grants are allowed", async () => {
    const app = buildApp("editor", {}, { grants: "edit", funds: "none" });
    const res = await app.request("/grants/funds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "General Operations", type: "unrestricted" }),
    });

    expect(res.status).toBe(403);
    expect(createFund).not.toHaveBeenCalled();
  });

  it("emits first_fund_created when this is the org's first fund", async () => {
    vi.mocked(createFund).mockResolvedValue({ id: "fund-first" } as never);
    const app = buildApp("editor", buildDefaultDb(1));
    const res = await app.request("/grants/funds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "General Operations", type: "unrestricted" }),
    });

    expect(res.status).toBe(201);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: ANALYTICS_EVENTS.firstFundCreated }),
    );
  });

  it("does NOT emit first_fund_created when the org already has funds", async () => {
    vi.mocked(createFund).mockResolvedValue({ id: "fund-second" } as never);
    const app = buildApp("editor", buildDefaultDb(2));
    const res = await app.request("/grants/funds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "General Operations", type: "unrestricted" }),
    });

    expect(res.status).toBe(201);
    const firstEvents = vi
      .mocked(mockCaptureAnalytics)
      .mock.calls.filter(([args]) => args.eventName === ANALYTICS_EVENTS.firstFundCreated);
    expect(firstEvents).toHaveLength(0);
  });

  it("returns fund detail", async () => {
    vi.mocked(getFund).mockResolvedValue({ id: "fund-1" } as never);
    const app = buildApp("viewer");
    const res = await app.request("/grants/funds/fund-1");

    expect(res.status).toBe(200);
  });

  it("updates and deletes funds and expenses", async () => {
    vi.mocked(updateFund).mockResolvedValue({ id: "fund-1" } as never);
    vi.mocked(deleteFund).mockResolvedValue(undefined as never);
    vi.mocked(createExpense).mockResolvedValue({ id: "expense-1" } as never);
    vi.mocked(updateExpense).mockResolvedValue({ id: "expense-1" } as never);
    vi.mocked(deleteExpense).mockResolvedValue(undefined as never);
    const app = buildApp("admin");

    expect(
      await app.request("/grants/funds/fund-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "Updated" }),
      }),
    ).toMatchObject({ status: 200 });
    expect(await app.request("/grants/funds/fund-1", { method: "DELETE" })).toMatchObject({
      status: 204,
    });
    expect(
      await app.request("/grants/grant-1/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fundId: "fund-1",
          amountCents: 1000,
          date: "2026-10-01T00:00:00Z",
        }),
      }),
    ).toMatchObject({ status: 201 });
    expect(
      await app.request("/grants/grant-1/expenses/expense-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "Updated" }),
      }),
    ).toMatchObject({ status: 200 });
    expect(
      await app.request("/grants/grant-1/expenses/expense-1", { method: "DELETE" }),
    ).toMatchObject({ status: 204 });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.fundUpdated,
      payload: {
        actorId: "user-1",
        entity_type: "fund",
        changed_fields: ["description"],
      },
    });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.fundDeleted,
      payload: {
        actorId: "user-1",
        entity_type: "fund",
      },
    });
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("fund-1");
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("Updated");
    expect(updateFund).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        fundId: "fund-1",
      }),
    );
    expect(deleteFund).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        fundId: "fund-1",
      }),
    );
    expect(createExpense).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        grantId: "grant-1",
      }),
    );
    expect(updateExpense).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        expenseId: "expense-1",
      }),
    );
    expect(deleteExpense).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        expenseId: "expense-1",
      }),
    );
  });

  it("blocks expense mutations when funds permission is removed even if grants are allowed", async () => {
    const app = buildApp("editor", {}, { grants: "manage", funds: "none" });

    const createRes = await app.request("/grants/grant-1/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fundId: "fund-1",
        amountCents: 1000,
        date: "2026-10-01T00:00:00Z",
      }),
    });
    const updateRes = await app.request("/grants/grant-1/expenses/expense-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "Updated" }),
    });
    const deleteRes = await app.request("/grants/grant-1/expenses/expense-1", {
      method: "DELETE",
    });

    expect(createRes.status).toBe(403);
    expect(updateRes.status).toBe(403);
    expect(deleteRes.status).toBe(403);
    expect(createExpense).not.toHaveBeenCalled();
    expect(updateExpense).not.toHaveBeenCalled();
    expect(deleteExpense).not.toHaveBeenCalled();
  });

  it("accepts grant-scoped expense creation without a grantId in the JSON body", async () => {
    vi.mocked(createExpense).mockResolvedValue({ id: "expense-2" } as never);
    const app = buildApp("editor");

    const res = await app.request("/grants/grant-1/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amountCents: 1250,
        date: "2026-10-02T00:00:00Z",
        description: "Transit reimbursement",
      }),
    });

    expect(res.status).toBe(201);
    expect(createExpense).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        grantId: "grant-1",
        amountCents: 1250,
        date: "2026-10-02T00:00:00Z",
        description: "Transit reimbursement",
      }),
    );
  });

  it("rejects grant-scoped expense payloads that omit required fields", async () => {
    const app = buildApp("editor");

    const res = await app.request("/grants/grant-1/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: "Transit reimbursement",
      }),
    });

    expect(res.status).toBe(400);
    expect(createExpense).not.toHaveBeenCalled();
  });
});

describe("GET /grants/:grantId/spend-down", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns spend-down data for a grant", async () => {
    vi.mocked(getGrantSpendDown).mockResolvedValue({
      budgetCents: 100_000,
      expensesCents: 80_000,
      remainingCents: 20_000,
      burnRateCentsPerMonth: 10_000,
      projectedExhaustionDate: "2026-06-01T00:00:00.000Z",
      thresholdState: "80",
      byCategory: [{ category: "Salaries", amountCents: 80_000 }],
      byFund: [],
      byMonth: [{ month: "2026-01", amountCents: 80_000 }],
    });
    const app = buildApp("viewer");
    const res = await app.request("/grants/grant-1/spend-down");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ budgetCents: 100_000, thresholdState: "80" });
    expect(getGrantSpendDown).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1", grantId: "grant-1" }),
    );
  });

  it("returns 400 when from is not a valid datetime", async () => {
    const app = buildApp("viewer");
    const res = await app.request("/grants/grant-1/spend-down?from=not-a-date");

    expect(res.status).toBe(400);
  });

  it("returns 400 when to is not a valid datetime", async () => {
    const app = buildApp("viewer");
    const res = await app.request("/grants/grant-1/spend-down?to=2026-03-31");

    expect(res.status).toBe(400);
  });

  it("passes from and to as Date objects when provided", async () => {
    vi.mocked(getGrantSpendDown).mockResolvedValue({
      budgetCents: null,
      expensesCents: 0,
      remainingCents: null,
      burnRateCentsPerMonth: null,
      projectedExhaustionDate: null,
      thresholdState: null,
      byCategory: [],
      byFund: [],
      byMonth: [],
    });
    const app = buildApp("viewer");
    const res = await app.request(
      "/grants/grant-1/spend-down?from=2026-01-01T00:00:00.000Z&to=2026-03-31T23:59:59.999Z",
    );

    expect(res.status).toBe(200);
    expect(getGrantSpendDown).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        from: new Date("2026-01-01T00:00:00.000Z"),
        to: new Date("2026-03-31T23:59:59.999Z"),
      }),
    );
  });

  it("propagates 404 from service as error response", async () => {
    vi.mocked(getGrantSpendDown).mockRejectedValue(
      new HTTPException(404, { message: "Grant not found" }),
    );
    const app = buildApp("viewer");
    const res = await app.request("/grants/grant-1/spend-down");

    expect(res.status).toBe(404);
  });
});

describe("POST /grants/:grantId/closeout", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 200 with success true for admin", async () => {
    vi.mocked(closeoutGrant).mockResolvedValue(undefined);
    const app = buildApp("admin");
    const res = await app.request("/grants/grant-1/closeout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closeoutDisposition: "release" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });
    expect(closeoutGrant).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        grantId: "grant-1",
        closeoutDisposition: "release",
      }),
    );
  });

  it("returns 200 with return disposition", async () => {
    vi.mocked(closeoutGrant).mockResolvedValue(undefined);
    const app = buildApp("admin");
    const res = await app.request("/grants/grant-1/closeout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closeoutDisposition: "return" }),
    });

    expect(res.status).toBe(200);
    expect(closeoutGrant).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ closeoutDisposition: "return" }),
    );
  });

  it("rejects editors with 403", async () => {
    const app = buildApp("editor");
    const res = await app.request("/grants/grant-1/closeout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closeoutDisposition: "release" }),
    });

    expect(res.status).toBe(403);
  });

  it("rejects invalid disposition with 400", async () => {
    const app = buildApp("admin");
    const res = await app.request("/grants/grant-1/closeout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closeoutDisposition: "invalid" }),
    });

    expect(res.status).toBe(400);
  });

  it("propagates 404 from service", async () => {
    vi.mocked(closeoutGrant).mockRejectedValue(
      new HTTPException(404, { message: "Grant not found" }),
    );
    const app = buildApp("admin");
    const res = await app.request("/grants/grant-1/closeout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closeoutDisposition: "release" }),
    });

    expect(res.status).toBe(404);
  });
});
