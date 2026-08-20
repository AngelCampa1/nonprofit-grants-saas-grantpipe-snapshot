import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api-client";

const mockInvalidateQueries = vi.fn();
const mockRemoveQueries = vi.fn();
const mockCaptureEvent = vi.fn();

vi.mock("../lib/analytics", () => ({
  captureEvent: (...args: unknown[]) => mockCaptureEvent(...args),
}));

vi.mock("../lib/mutation-error", () => ({
  onMutationError: vi.fn(),
}));

vi.mock("../lib/api-client", () => ({
  api: {
    api: {
      compliance: {
        reports: {
          "spend-down": {
            $post: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({ id: "rep-1" }) }),
          },
        },
      },
      grants: {
        $get: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue([]) }),
        $post: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }),
        opportunities: {
          $get: vi.fn().mockResolvedValue({
            json: vi.fn().mockResolvedValue({ data: [{ id: "tracked-opp-1" }] }),
          }),
          $post: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({ id: "opp-new" }) }),
          search: {
            $post: vi.fn().mockResolvedValue({
              json: vi.fn().mockResolvedValue({ data: [{ id: "opp-1" }] }),
            }),
          },
          ":opportunityId": {
            save: {
              $post: vi.fn().mockResolvedValue({
                json: vi.fn().mockResolvedValue({ id: "action-1" }),
              }),
            },
            convert: {
              $post: vi.fn().mockResolvedValue({
                json: vi.fn().mockResolvedValue({ id: "grant-1" }),
              }),
            },
          },
        },
        pipeline: {
          $get: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }),
        },
        funders: {
          $get: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue([]) }),
          $post: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }),
          ":funderId": {
            $get: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }),
            $patch: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }),
            $delete: vi.fn().mockResolvedValue(undefined),
            contacts: {
              $post: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }),
              ":contactId": {
                $patch: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }),
                $delete: vi.fn().mockResolvedValue(undefined),
              },
            },
          },
        },
        funds: {
          $get: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue([]) }),
          $post: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }),
          ":fundId": {
            $get: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }),
            $patch: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }),
            $delete: vi.fn().mockResolvedValue(undefined),
          },
        },
        ":grantId": {
          $get: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }),
          $patch: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }),
          $delete: vi.fn().mockResolvedValue(undefined),
          allocations: {
            $post: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }),
            ":allocationId": {
              $patch: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }),
              $delete: vi.fn().mockResolvedValue(undefined),
            },
          },
          expenses: {
            $post: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }),
            ":expenseId": {
              $patch: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }),
              $delete: vi.fn().mockResolvedValue(undefined),
            },
          },
          metrics: {
            $post: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }),
            ":metricId": {
              $patch: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }),
              $delete: vi.fn().mockResolvedValue(undefined),
              entries: {
                $post: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }),
                ":entryId": {
                  $patch: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }),
                  $delete: vi.fn().mockResolvedValue(undefined),
                },
              },
            },
          },
          "reporting-requirements": {
            $post: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }),
            ":requirementId": {
              $patch: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }),
              $delete: vi.fn().mockResolvedValue(undefined),
            },
          },
          "closeout-items": {
            $post: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }),
            ":itemId": {
              $patch: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }),
              $delete: vi.fn().mockResolvedValue(undefined),
            },
          },
          "spend-down": {
            $get: vi.fn().mockResolvedValue({
              json: vi.fn().mockResolvedValue({ totalAllocatedCents: 0 }),
            }),
          },
          budget: {
            variance: {
              $get: vi.fn().mockResolvedValue({
                json: vi.fn().mockResolvedValue({
                  rows: [
                    {
                      lineId: "line-1",
                      category: "Personnel",
                      approvedAmountCents: 100000,
                      actualCents: 25000,
                      plannedCents: 15000,
                      remainingCents: 60000,
                      varianceCents: 75000,
                    },
                  ],
                }),
              }),
            },
          },
        },
      },
    },
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(() => ({
    invalidateQueries: mockInvalidateQueries,
    removeQueries: mockRemoveQueries,
  })),
  keepPreviousData: Symbol("keepPreviousData"),
}));

import { useMutation, useQuery } from "@tanstack/react-query";
import { onMutationError } from "../lib/mutation-error";
import {
  useAllocationMutations,
  useCloseoutItemMutations,
  useCreateFunder,
  useCreateFund,
  useCreateGrant,
  useExpenseMutations,
  useFunder,
  useFunderUpdateMutations,
  useFunderContactMutations,
  useFunders,
  useFund,
  useFundUpdateMutations,
  useFunds,
  useGenerateSpendDownReport,
  useGrant,
  useGrantBudgetVariance,
  useGrantOpportunityMutations,
  useGrantOpportunities,
  useGrantOpportunitySearch,
  useCreateGrantOpportunity,
  useGrants,
  useGrantPipeline,
  useSpendDown,
  useUpdateGrantStage,
  useGrantUpdateMutations,
  useImpactMetricMutations,
  useReportingRequirementMutations,
} from "./use-grants";

function captureQueryFn() {
  const call = vi.mocked(useQuery).mock.calls[0]?.[0];
  return (call as unknown as { queryFn: () => Promise<unknown> }).queryFn;
}

function captureMutationFn() {
  const call = vi.mocked(useMutation).mock.calls[0]?.[0];
  return (call as { mutationFn: (arg: unknown) => Promise<unknown> }).mutationFn;
}

function captureOnSuccess() {
  const call = vi.mocked(useMutation).mock.calls[0]?.[0];
  return (call as { onSuccess: () => void }).onSuccess;
}

function captureOnError() {
  const call = vi.mocked(useMutation).mock.calls[0]?.[0];
  return (call as { onError: (error: unknown) => void }).onError;
}

function asMutationConfig(value: unknown) {
  return value as {
    mutationFn: (arg?: unknown) => Promise<unknown>;
    onSuccess?: () => void;
    onError?: (error: unknown) => void;
  };
}

function resetMocks() {
  vi.mocked(useQuery).mockClear();
  vi.mocked(useMutation).mockClear();
  mockInvalidateQueries.mockClear();
  mockRemoveQueries.mockClear();
  mockCaptureEvent.mockClear();
}

describe("grant queries", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
  });

  it("falls back to empty strings when optional grant list filters are absent", async () => {
    useGrants({ page: 1, pageSize: 25, sortBy: "updatedAt", sortOrder: "desc" });
    const call = vi.mocked(useQuery).mock.calls[0]?.[0];
    const queryKey = (call as unknown as { queryKey: unknown[] }).queryKey;
    // All 5 optional filters must resolve to "" — not undefined
    expect(queryKey.filter((entry) => entry === "").length).toBe(5);
    // queryFn should not pass any of the optional filters through
    const result = await captureQueryFn()();
    expect(result).toEqual([]);
  });

  it("loads grants with primitive query key entries", async () => {
    useGrants({
      page: 3,
      pageSize: 50,
      sortBy: "name",
      sortOrder: "asc",
      search: "summer",
      status: "active",
      funderId: "funder-1",
      fundId: "fund-1",
      threshold: "80",
    });
    const call = vi.mocked(useQuery).mock.calls[0]?.[0];
    const queryKey = (call as unknown as { queryKey: unknown[] }).queryKey;
    expect(queryKey[0]).toBe("grants");
    for (const entry of queryKey.slice(1)) {
      expect(
        typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean",
      ).toBe(true);
    }
    expect(queryKey).toContain("summer");
    expect(queryKey).toContain("active");
    expect(queryKey).toContain("funder-1");
    expect(queryKey).toContain("fund-1");
    expect(queryKey).toContain("80");
    expect(queryKey).toContain(3);
    expect(queryKey).toContain(50);
    const result = await captureQueryFn()();
    expect(result).toEqual([]);
  });

  it("loads grant detail when id is present", async () => {
    useGrant("grant-1");
    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["grant", "grant-1"], enabled: true }),
    );
    const result = await captureQueryFn()();
    expect(result).toEqual({});
  });

  it("disables grant detail query when id is missing", () => {
    useGrant("");
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it("loads grant pipeline", async () => {
    useGrantPipeline();
    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["grant-pipeline"] }),
    );
    const result = await captureQueryFn()();
    expect(result).toEqual({});
  });

  it("loads grant opportunities with primitive query key entries", async () => {
    const params = {
      keyword: "food",
      agency: "HHS",
      opportunityStatus: "posted" as const,
      applicantTypes: ["nonprofits", "schools"],
      fundingCategories: ["education"],
      closeFrom: "2026-05-01T00:00:00.000Z",
      closeTo: "2026-06-01T00:00:00.000Z",
      page: 2,
      pageSize: 10,
    };
    useGrantOpportunitySearch(params);

    const call = vi.mocked(useQuery).mock.calls[0]?.[0];
    const queryKey = (call as unknown as { queryKey: unknown[] }).queryKey;
    expect(queryKey).toEqual([
      "grant-opportunities",
      "food",
      "HHS",
      "posted",
      "nonprofits|schools",
      "education",
      "2026-05-01T00:00:00.000Z",
      "2026-06-01T00:00:00.000Z",
      2,
      10,
    ]);
    expect(call).toEqual(expect.objectContaining({ enabled: true }));
    expect(await captureQueryFn()()).toEqual({ data: [{ id: "opp-1" }] });
    expect(api.api.grants.opportunities.search.$post).toHaveBeenCalledWith({
      json: params,
    });
  });

  it("falls back to empty opportunity search filters when optional fields are absent", () => {
    useGrantOpportunitySearch({ page: 1, pageSize: 25 });

    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
        queryKey: ["grant-opportunities", "", "", "", "", "", "", "", 1, 25],
      }),
    );
  });

  it("loads tracked grant opportunities with source and funder filters", async () => {
    useGrantOpportunities({
      keyword: "resilience",
      sourceType: "community_foundation",
      funderType: "foundation",
      page: 1,
      pageSize: 25,
    });

    const call = vi.mocked(useQuery).mock.calls[0]?.[0];
    expect((call as unknown as { queryKey: unknown[] }).queryKey).toEqual([
      "tracked-grant-opportunities",
      "resilience",
      "",
      "",
      "community_foundation",
      "foundation",
      "",
      "",
      1,
      25,
    ]);
    expect(await captureQueryFn()()).toEqual({ data: [{ id: "tracked-opp-1" }] });
    expect(api.api.grants.opportunities.$get).toHaveBeenCalledWith({
      query: expect.objectContaining({
        keyword: "resilience",
        sourceType: "community_foundation",
        funderType: "foundation",
        page: "1",
        pageSize: "25",
      }),
    });
  });

  it("loads tracked grant opportunities with every optional filter", async () => {
    useGrantOpportunities({
      keyword: "housing",
      agency: "City",
      opportunityStatus: "posted",
      sourceType: "state_local",
      funderType: "government",
      closeFrom: "2026-06-01T00:00:00.000Z",
      closeTo: "2026-07-01T00:00:00.000Z",
      page: 3,
      pageSize: 15,
    });

    await captureQueryFn()();

    expect(api.api.grants.opportunities.$get).toHaveBeenCalledWith({
      query: {
        page: "3",
        pageSize: "15",
        keyword: "housing",
        agency: "City",
        opportunityStatus: "posted",
        sourceType: "state_local",
        funderType: "government",
        closeFrom: "2026-06-01T00:00:00.000Z",
        closeTo: "2026-07-01T00:00:00.000Z",
      },
    });
  });

  it("omits optional tracked grant opportunity filters when they are absent", async () => {
    useGrantOpportunities({ page: 1, pageSize: 25 });

    await captureQueryFn()();

    expect(api.api.grants.opportunities.$get).toHaveBeenCalledWith({
      query: {
        page: "1",
        pageSize: "25",
      },
    });
  });

  it("disables grant opportunity search until a keyword is present", () => {
    useGrantOpportunitySearch({ keyword: "  ", page: 1, pageSize: 25 });

    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
        queryKey: ["grant-opportunities", "  ", "", "", "", "", "", "", 1, 25],
      }),
    );
  });

  it("loads funders list", async () => {
    useFunders({ page: 1, pageSize: 25, sortBy: "name", sortOrder: "asc" });
    const result = await captureQueryFn()();
    expect(result).toEqual([]);
  });

  it("loads funders list with search and type filters", async () => {
    useFunders({
      page: 1,
      pageSize: 25,
      sortBy: "name",
      sortOrder: "asc",
      search: "acme",
      type: "foundation",
    });
    const result = await captureQueryFn()();
    expect(result).toEqual([]);
  });

  it("builds a primitive query key for funders (no raw object)", () => {
    useFunders({
      page: 2,
      pageSize: 10,
      sortBy: "updatedAt",
      sortOrder: "desc",
      search: "acme",
      type: "foundation",
    });
    const call = vi.mocked(useQuery).mock.calls[0]?.[0];
    const queryKey = (call as unknown as { queryKey: unknown[] }).queryKey;
    expect(queryKey[0]).toBe("funders");
    for (const entry of queryKey.slice(1)) {
      expect(
        typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean",
      ).toBe(true);
    }
    expect(queryKey).toContain("acme");
    expect(queryKey).toContain("foundation");
    expect(queryKey).toContain(2);
    expect(queryKey).toContain(10);
  });

  it("builds a primitive query key for funds (no raw object)", () => {
    useFunds({
      page: 4,
      pageSize: 15,
      sortBy: "balanceCents",
      sortOrder: "desc",
      search: "reserve",
      type: "temporarily_restricted",
    });
    const call = vi.mocked(useQuery).mock.calls[0]?.[0];
    const queryKey = (call as unknown as { queryKey: unknown[] }).queryKey;
    expect(queryKey[0]).toBe("funds");
    for (const entry of queryKey.slice(1)) {
      expect(
        typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean",
      ).toBe(true);
    }
    expect(queryKey).toContain("reserve");
    expect(queryKey).toContain("temporarily_restricted");
    expect(queryKey).toContain(4);
    expect(queryKey).toContain(15);
  });

  it("loads single funder", async () => {
    useFunder("funder-1");
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    const result = await captureQueryFn()();
    expect(result).toEqual({});
  });

  it("loads funds list", async () => {
    useFunds({ page: 1, pageSize: 25, sortBy: "name", sortOrder: "asc" });
    const result = await captureQueryFn()();
    expect(result).toEqual([]);
  });

  it("loads funds list with search and type filters", async () => {
    useFunds({
      page: 1,
      pageSize: 25,
      sortBy: "name",
      sortOrder: "asc",
      search: "reserve",
      type: "temporarily_restricted",
    });
    const result = await captureQueryFn()();
    expect(result).toEqual([]);
  });

  it("loads single fund", async () => {
    useFund("fund-1");
    const result = await captureQueryFn()();
    expect(result).toEqual({});
  });
});

describe("top-level create mutations", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useMutation).mockImplementation((options) => options as never);
  });

  it("creates a grant and invalidates list and pipeline", async () => {
    useCreateGrant();
    expect(await captureMutationFn()({ name: "Summer Programs" })).toEqual({});
    captureOnSuccess()();
    expect(mockCaptureEvent).toHaveBeenCalledWith("grant_created");
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["grants"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["grant-pipeline"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["dashboard-overview"] });
    // A newly created grant is embedded into its funder's detail view — getFunder
    // returns { grants: true }, rendered in the funder "Grant History" tab from
    // the ["funder", id] query. Creating a grant tied to a funder must refresh
    // the funder caches — the ["funder"] prefix covers every open funder detail
    // page — or the Grant History tab omits the new grant until a reload.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["funder"] });
  });

  it("tracks grant operation failures without raw error text", () => {
    useCreateGrant();
    const onError = captureOnError();
    onError(new Error("Name is required"));
    onError(new Error("Permission denied"));
    onError(new Error("Grant not found"));
    onError(new Error("Network request failed"));
    onError("bad");

    expect(mockCaptureEvent).toHaveBeenCalledWith("grant_operation_failed", {
      operation: "create_grant",
      failure_type: "validation",
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("grant_operation_failed", {
      operation: "create_grant",
      failure_type: "permission",
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("grant_operation_failed", {
      operation: "create_grant",
      failure_type: "not_found",
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("grant_operation_failed", {
      operation: "create_grant",
      failure_type: "network",
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("grant_operation_failed", {
      operation: "create_grant",
      failure_type: "unknown",
    });
    expect(mockCaptureEvent).not.toHaveBeenCalledWith(
      "grant_operation_failed",
      expect.objectContaining({ message: expect.any(String) }),
    );
    expect(onMutationError).toHaveBeenCalled();
  });

  it("creates a funder and invalidates funders", async () => {
    useCreateFunder();
    expect(await captureMutationFn()({ name: "Acme Foundation" })).toEqual({});
    captureOnSuccess()();
    expect(mockCaptureEvent).toHaveBeenCalledWith("funder_created");
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["funders"] });
  });

  it("creates a fund and invalidates funds", async () => {
    useCreateFund();
    expect(await captureMutationFn()({ name: "General Operations" })).toEqual({});
    captureOnSuccess()();
    expect(mockCaptureEvent).toHaveBeenCalledWith("fund_created");
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["funds"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["dashboard-overview"] });
  });

  it("creates a manual grant opportunity and refreshes tracked opportunities", async () => {
    useCreateGrantOpportunity();

    expect(
      await captureMutationFn()({
        title: "Neighborhood Resilience Fund",
        sourceType: "community_foundation",
        sourceName: "Community Foundation",
      }),
    ).toEqual({ id: "opp-new" });
    captureOnSuccess()();

    expect(mockCaptureEvent).toHaveBeenCalledWith("grant_opportunity_created");
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["tracked-grant-opportunities"],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["grant-opportunities"] });
  });

  it("saves grant opportunities and refreshes opportunity search results", async () => {
    const actions = useGrantOpportunityMutations();

    expect(
      await asMutationConfig(actions.saveOpportunity).mutationFn({
        opportunityId: "opp-1",
        data: { notes: "Follow up" },
      }),
    ).toEqual({ id: "action-1" });
    asMutationConfig(actions.saveOpportunity).onSuccess?.();

    expect(mockCaptureEvent).toHaveBeenCalledWith("grant_opportunity_saved");
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["grant-opportunities"] });
  });

  it("converts grant opportunities and refreshes grants plus pipeline", async () => {
    const actions = useGrantOpportunityMutations();

    expect(
      await asMutationConfig(actions.convertOpportunity).mutationFn({
        opportunityId: "opp-1",
        status: "application",
      }),
    ).toEqual({ id: "grant-1" });
    asMutationConfig(actions.convertOpportunity).onSuccess?.();

    expect(mockCaptureEvent).toHaveBeenCalledWith("grant_opportunity_converted");
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["grant-opportunities"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["grants"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["grant-pipeline"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["funders"] });
    // Converting an opportunity creates a grant tied to a (possibly existing) funder,
    // which getFunder embeds via { grants: true } and the funder "Grant History" tab
    // renders from the ["funder", id] query — refresh the funder detail caches too.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["funder"] });
  });
});

describe("grant detail mutations", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useMutation).mockImplementation((options) => options as never);
  });

  it("updates and deletes grants with grant cache invalidation", async () => {
    const actions = useGrantUpdateMutations("grant-1");
    expect(await asMutationConfig(actions.updateGrant).mutationFn({ status: "active" })).toEqual(
      {},
    );
    asMutationConfig(actions.updateGrant).onSuccess?.();
    expect(mockCaptureEvent).toHaveBeenCalledWith("grant_updated");
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["grant", "grant-1"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["dashboard-overview"] });
    // The grant's name is denormalized into the fund detail view — each fund's
    // allocation row renders allocation.grant.name from the embedded ["fund", id]
    // query. Editing a grant (e.g. renaming it) must refresh the fund caches too,
    // or the fund detail page keeps showing the old grant name until a reload.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["fund"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["funds"] });
    // The grant's name is denormalized as grantName into every payment-request
    // row via listPaymentRequests' leftJoin, rendered in the payments list's
    // Grant column from the ["payment-requests", ...] query. Renaming a grant
    // must refresh the payment-requests caches too, or the payments list keeps
    // showing the old grant name until a reload.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["payment-requests"] });
    // The grant's name is also embedded into the funder detail view — getFunder
    // returns { grants: true }, including each grant's name, rendered in the
    // funder "Grant History" tab from the ["funder", id] query. Renaming a grant
    // must refresh the funder caches too — the ["funder"] prefix covers every
    // open funder detail page — or the Grant History tab keeps showing the old
    // grant name until a reload.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["funder"] });
    // The grant's name is also denormalized into the Reports-page grant picker —
    // useReportGrantOptions (["report-grant-options"], its own root) lists each
    // grant's name + funderName, rendered in the Grant Compliance Report
    // <SelectItem>. Renaming a grant must refresh that list too, or the Reports
    // dropdown keeps showing the old grant name until a reload (["grants"] does
    // not prefix-match ["report-grant-options"]).
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["report-grant-options"] });

    mockCaptureEvent.mockClear();
    await asMutationConfig(actions.deleteGrant).mutationFn();
    asMutationConfig(actions.deleteGrant).onSuccess?.();
    expect(mockCaptureEvent).toHaveBeenCalledWith("grant_deleted");
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["grants"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["dashboard-overview"] });
    // A deleted grant is filtered out of getFunder's embedded grants, but the
    // funder "Grant History" tab keeps showing it until the ["funder", id] cache
    // refreshes — the ["funder"] prefix covers every open funder detail page.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["funder"] });
    // (deleteGrant's ["fund"]/["funds"] invalidation is asserted in the isolated
    // "removes deleted grant detail from cache" test below — here updateGrant has
    // already called them via invalidateGrantAndFunds on the shared mock.)
  });

  it("removes deleted grant detail from cache instead of invalidating it", async () => {
    mockRemoveQueries.mockClear();
    mockInvalidateQueries.mockClear();
    const actions = useGrantUpdateMutations("grant-1");
    await asMutationConfig(actions.deleteGrant).mutationFn();
    asMutationConfig(actions.deleteGrant).onSuccess?.();
    expect(mockRemoveQueries).toHaveBeenCalledWith({ queryKey: ["grant", "grant-1"] });
    // The detail page's Spend-Down and Budget Variance tabs key off the PLURAL
    // ["grants", grantId, ...] prefix (useSpendDown -> ["grants", id, "spend-down"];
    // useGrantBudgetVariance -> ["grants", id, "budget", "variance"]). The broad
    // ["grants"] invalidate below prefix-matches those still-mounted observers and
    // would refetch the just-deleted grant -> 404. Remove them from cache first so
    // the invalidate can't catch them. (The grant LIST query's 2nd key element is
    // params.search, a string, so this never matches list caches.)
    expect(mockRemoveQueries).toHaveBeenCalledWith({ queryKey: ["grants", "grant-1"] });
    // Must NOT invalidate the deleted detail (would cause 404 refetch)
    expect(mockInvalidateQueries).not.toHaveBeenCalledWith({ queryKey: ["grant", "grant-1"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["grants"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["grant-pipeline"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["dashboard-overview"] });
    // The funder "Grant History" tab embeds each grant — a delete must refresh
    // the ["funder"] caches too, or the deleted grant lingers until a reload.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["funder"] });
    // getFund embeds the grant's allocation row — a delete must refresh the
    // fund caches too, or the deleted grant's allocation lingers until a reload.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["fund"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["funds"] });
  });

  it("updates a grant stage and invalidates lists, pipeline, and the grant detail", async () => {
    useUpdateGrantStage();
    expect(await captureMutationFn()({ grantId: "grant-1", status: "active" })).toEqual({});
    const onSuccess = vi.mocked(useMutation).mock.calls[0]?.[0] as unknown as {
      onSuccess: (data: unknown, vars: { grantId: string; status: string }) => void;
    };
    onSuccess.onSuccess({}, { grantId: "grant-1", status: "active" });
    expect(mockCaptureEvent).toHaveBeenCalledWith("grant_stage_changed", { stage: "active" });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["grants"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["grant-pipeline"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["grant", "grant-1"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["dashboard-overview"] });
    // The funder "Grant History" tab renders each grant's status badge from the
    // embedded ["funder", id] query. A stage change must refresh the ["funder"]
    // caches too, or the badge shows the old status until a reload.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["funder"] });
  });

  it("creates, updates, and deletes allocations", async () => {
    const actions = useAllocationMutations("grant-1");
    expect(
      await asMutationConfig(actions.createAllocation).mutationFn({
        fundId: "fund-1",
        allocatedAmountCents: 1000,
      }),
    ).toEqual({});
    asMutationConfig(actions.createAllocation).onSuccess?.();
    expect(mockCaptureEvent).toHaveBeenCalledWith("grant_fund_allocation_created");
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["grant", "grant-1"] });
    expect(
      await asMutationConfig(actions.updateAllocation).mutationFn({
        allocationId: "alloc-1",
        data: { allocatedAmountCents: 2000 },
      }),
    ).toEqual({});
    asMutationConfig(actions.updateAllocation).onSuccess?.();
    await asMutationConfig(actions.deleteAllocation).mutationFn("alloc-1");
    asMutationConfig(actions.deleteAllocation).onSuccess?.();
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["grant", "grant-1"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["fund"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["funds"] });
  });

  it("creates, updates, and deletes expenses", async () => {
    const actions = useExpenseMutations("grant-1");
    expect(
      await asMutationConfig(actions.createExpense).mutationFn({
        amountCents: 1000,
        date: "2026-04-01T00:00:00Z",
      }),
    ).toEqual({});
    asMutationConfig(actions.createExpense).onSuccess?.();
    expect(
      await asMutationConfig(actions.updateExpense).mutationFn({
        expenseId: "exp-1",
        data: { description: "Updated" },
      }),
    ).toEqual({});
    asMutationConfig(actions.updateExpense).onSuccess?.();
    await asMutationConfig(actions.deleteExpense).mutationFn("exp-1");
    asMutationConfig(actions.deleteExpense).onSuccess?.();
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["grant", "grant-1"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["fund"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["funds"] });
    // Expenses post/reverse a journal entry (and, on restricted funds, a
    // restriction-release row) on the backend, so the Accounting balance views,
    // the journal-entries list, and every restriction view must refresh too.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-journal-entries"],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["accounting-trial-balance"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["accounting-ledger"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-report-financial-position"],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-report-activities"],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-report-functional-expenses"],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["restrictions"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["reports"] });
  });

  it("rejects expense creation when the API returns an error response", async () => {
    vi.mocked(api.api.grants[":grantId"].expenses.$post).mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: "Expense date must be ISO-8601" }),
    } as never);

    const actions = useExpenseMutations("grant-1");

    await expect(
      asMutationConfig(actions.createExpense).mutationFn({
        amountCents: 1000,
        date: "2026-04-01",
      }),
    ).rejects.toThrow("Expense date must be ISO-8601");
  });

  it("creates, updates, and deletes metrics and entries", async () => {
    const actions = useImpactMetricMutations("grant-1");
    expect(
      await asMutationConfig(actions.createMetric).mutationFn({ name: "Students Served" }),
    ).toEqual({});
    asMutationConfig(actions.createMetric).onSuccess?.();
    expect(
      await asMutationConfig(actions.updateMetric).mutationFn({
        metricId: "metric-1",
        data: { unit: "students" },
      }),
    ).toEqual({});
    asMutationConfig(actions.updateMetric).onSuccess?.();
    await asMutationConfig(actions.deleteMetric).mutationFn("metric-1");
    asMutationConfig(actions.deleteMetric).onSuccess?.();
    expect(
      await asMutationConfig(actions.createEntry).mutationFn({
        metricId: "metric-1",
        data: {
          value: "5",
          periodStart: "2026-01-01T00:00:00Z",
          periodEnd: "2026-03-31T00:00:00Z",
        },
      }),
    ).toEqual({});
    asMutationConfig(actions.createEntry).onSuccess?.();
    expect(
      await asMutationConfig(actions.updateEntry).mutationFn({
        metricId: "metric-1",
        entryId: "entry-1",
        data: { notes: "Updated" },
      }),
    ).toEqual({});
    asMutationConfig(actions.updateEntry).onSuccess?.();
    await asMutationConfig(actions.deleteEntry).mutationFn({
      metricId: "metric-1",
      entryId: "entry-1",
    });
    asMutationConfig(actions.deleteEntry).onSuccess?.();
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["grant", "grant-1"] });
  });

  it("creates, updates, and deletes reporting requirements", async () => {
    const actions = useReportingRequirementMutations("grant-1");
    expect(
      await asMutationConfig(actions.createRequirement).mutationFn({
        reportType: "quarterly",
        dueDate: "2026-10-01T00:00:00Z",
      }),
    ).toEqual({});
    asMutationConfig(actions.createRequirement).onSuccess?.();
    expect(
      await asMutationConfig(actions.updateRequirement).mutationFn({
        requirementId: "req-1",
        data: { status: "submitted" },
      }),
    ).toEqual({});
    asMutationConfig(actions.updateRequirement).onSuccess?.();
    await asMutationConfig(actions.deleteRequirement).mutationFn("req-1");
    asMutationConfig(actions.deleteRequirement).onSuccess?.();
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["grant", "grant-1"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["calendar-overview"] });
  });

  it("creates, updates, and deletes closeout items", async () => {
    const actions = useCloseoutItemMutations("grant-1");
    expect(
      await asMutationConfig(actions.createItem).mutationFn({ label: "Final report submitted" }),
    ).toEqual({});
    asMutationConfig(actions.createItem).onSuccess?.();
    expect(
      await asMutationConfig(actions.updateItem).mutationFn({
        itemId: "item-1",
        data: { completed: true },
      }),
    ).toEqual({});
    asMutationConfig(actions.updateItem).onSuccess?.();
    await asMutationConfig(actions.deleteItem).mutationFn("item-1");
    asMutationConfig(actions.deleteItem).onSuccess?.();
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["grant", "grant-1"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["calendar-overview"] });
  });
});

describe("funder and fund detail mutations", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useMutation).mockImplementation((options) => options as never);
  });

  it("manages funder contacts and invalidates the funder detail", async () => {
    const actions = useFunderContactMutations("funder-1");
    expect(
      await asMutationConfig(actions.createContact).mutationFn({ name: "Jane Officer" }),
    ).toEqual({});
    asMutationConfig(actions.createContact).onSuccess?.();
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["funder", "funder-1"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["funders"] });

    expect(
      await asMutationConfig(actions.updateContact).mutationFn({
        contactId: "contact-1",
        data: { title: "PO" },
      }),
    ).toEqual({});
    asMutationConfig(actions.updateContact).onSuccess?.();
    await asMutationConfig(actions.deleteContact).mutationFn("contact-1");
    asMutationConfig(actions.deleteContact).onSuccess?.();
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["funder", "funder-1"] });
  });

  it("updates and deletes funders with proper invalidation and events", async () => {
    const actions = useFunderUpdateMutations("funder-1");
    expect(
      await asMutationConfig(actions.updateFunder).mutationFn({ website: "https://acme.org" }),
    ).toEqual({});
    asMutationConfig(actions.updateFunder).onSuccess?.();
    expect(mockCaptureEvent).toHaveBeenCalledWith("funder_updated");
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["funder", "funder-1"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["funders"] });
    // Renaming a funder changes the funder name embedded in every grant read
    // (grant detail's grant.funder.name and the grants list's Funder column),
    // so the grant entity and grants list caches must be refreshed too — or
    // those pages keep showing the old funder name until a full reload.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["grant"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["grants"] });
    // The funder name is also shown as the disambiguator in the Reports-page
    // grant picker — useReportGrantOptions (["report-grant-options"], its own
    // root) lists each grant's funderName, rendered under the grant name in the
    // Grant Compliance Report <SelectItem>. Renaming a funder must refresh that
    // list too, or the Reports dropdown keeps showing the old funder name until a
    // reload (["funders"]/["grants"] do not prefix-match ["report-grant-options"]).
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["report-grant-options"] });

    mockCaptureEvent.mockClear();
    await asMutationConfig(actions.deleteFunder).mutationFn();
    asMutationConfig(actions.deleteFunder).onSuccess?.();
    expect(mockCaptureEvent).toHaveBeenCalledWith("funder_deleted");
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["funders"] });
  });

  it("updates and deletes funds with proper invalidation and events", async () => {
    const actions = useFundUpdateMutations("fund-1");
    expect(
      await asMutationConfig(actions.updateFund).mutationFn({ description: "Updated" }),
    ).toEqual({});
    asMutationConfig(actions.updateFund).onSuccess?.();
    expect(mockCaptureEvent).toHaveBeenCalledWith("fund_updated");
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["fund", "fund-1"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["dashboard-overview"] });
    // The fund's name is denormalized into the grant detail view — each grant's
    // allocation card renders allocation.fund.name from the embedded ["grant", id]
    // query. Renaming a fund must refresh the grant caches too, or the grant
    // detail page keeps showing the old fund name until a reload.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["grant"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["grants"] });
    // The fund's name is denormalized as fundName into each donation row via
    // listDonations' leftJoin, rendered in the contact giving-history table from
    // the ["donations", contactId, ...] query. Renaming a fund must refresh the
    // donation caches too, or the contact donation history keeps showing the old
    // fund name until a reload.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["donations"] });

    mockInvalidateQueries.mockClear();
    mockCaptureEvent.mockClear();
    await asMutationConfig(actions.deleteFund).mutationFn();
    asMutationConfig(actions.deleteFund).onSuccess?.();
    expect(mockCaptureEvent).toHaveBeenCalledWith("fund_deleted");
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["funds"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["dashboard-overview"] });
    // A deleted fund is filtered out of getGrant's embedded allocations, so any
    // grant the fund was allocated to keeps showing its allocation row (rendering
    // allocation.fund.name) until the ["grant"]/["grants"] caches refresh. The
    // sibling updateFund.onSuccess already invalidates these; delete must too.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["grant"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["grants"] });
    // listDonations leftJoins funds with isNull(funds.deletedAt), so a deleted
    // fund flips each donation's fundName from the name to null ("N/A") in the
    // contact giving-history table (["donations", contactId, ...]). Refresh the
    // donation caches — the ["donations"] prefix covers every contact's page —
    // or the deleted fund's name lingers until a reload. (updateFund does this;
    // deleteFund must too.)
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["donations"] });
  });

  it("disables funder and fund detail queries when ids are missing", () => {
    useFunder("");
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));

    resetMocks();
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);

    useFund("");
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });
});

describe("spend-down queries and mutations", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
    vi.mocked(useMutation).mockImplementation((options) => options as never);
  });

  it("loads spend-down for a grant", async () => {
    useSpendDown("grant-1");
    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["grants", "grant-1", "spend-down"],
        enabled: true,
      }),
    );
    const result = await captureQueryFn()();
    expect(result).toEqual({ totalAllocatedCents: 0 });
  });

  it("disables spend-down query when grantId is empty", () => {
    useSpendDown("");
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it("loads grant budget variance for a grant", async () => {
    useGrantBudgetVariance("grant-1");
    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["grants", "grant-1", "budget", "variance"],
        enabled: true,
      }),
    );
    const result = await captureQueryFn()();
    expect(result).toEqual({
      rows: [
        {
          lineId: "line-1",
          category: "Personnel",
          approvedAmountCents: 100000,
          actualCents: 25000,
          plannedCents: 15000,
          remainingCents: 60000,
          varianceCents: 75000,
        },
      ],
    });
    expect(api.api.grants[":grantId"].budget.variance.$get).toHaveBeenCalledWith({
      param: { grantId: "grant-1" },
      query: {},
    });
  });

  it("disables grant budget variance query when grantId is empty", () => {
    useGrantBudgetVariance("");
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it("generates a spend-down report and invalidates reports", async () => {
    useGenerateSpendDownReport();
    const result = await captureMutationFn()({ grantId: "grant-1", title: "Q1 Spend-down" });
    expect(result).toEqual({ id: "rep-1" });
    captureOnSuccess()();
    expect(mockCaptureEvent).toHaveBeenCalledWith("report_generated", {
      report_type: "spend_down",
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["reports"] });
  });
});
