import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api } from "../lib/api-client";
import { readResponseOrThrow, throwIfNotOk } from "../lib/http-response";
import { captureEvent } from "../lib/analytics";
import { onMutationError } from "../lib/mutation-error";
import { invalidateOverview } from "../lib/overview-invalidation";
import { invalidateAccountingBalanceViews } from "./use-accounting";
import { invalidateRestrictions } from "./use-restrictions";
import type {
  CreateAllocationInput,
  CreateCloseoutItemInput,
  CreateFunderContactInput,
  CreateFunderInput,
  CreateFundInput,
  CreateGrantExpenseInput,
  CreateGrantInput,
  CreateGrantOpportunityInput,
  CreateImpactMetricEntryInput,
  CreateImpactMetricInput,
  CreateReportingRequirementInput,
  FunderListParams,
  FundListParams,
  GrantBudgetLineRollup,
  GeneratedReportArtifact,
  GrantListParams,
  GrantOpportunityActionInput,
  GrantOpportunitySearchParams,
  SpendDownResult,
  UpdateAllocationInput,
  UpdateCloseoutItemInput,
  UpdateExpenseInput,
  UpdateFunderContactInput,
  UpdateFunderInput,
  UpdateFundInput,
  UpdateGrantInput,
  UpdateImpactMetricEntryInput,
  UpdateImpactMetricInput,
  UpdateReportingRequirementInput,
} from "@grantpipe/shared";

const grants = api.api.grants;

function invalidateGrant(queryClient: ReturnType<typeof useQueryClient>, grantId: string) {
  void queryClient.invalidateQueries({ queryKey: ["grant", grantId] });
  void queryClient.invalidateQueries({ queryKey: ["grants"] });
  void queryClient.invalidateQueries({ queryKey: ["grant-pipeline"] });
  // The calendar page builds its month view from ["calendar-overview", month],
  // whose items are keyed by reportingRequirementId / closeoutItemId and grant
  // due dates. Editing a grant, reporting requirement, or closeout item shifts
  // those deadlines, so the calendar must refetch too — not just the dashboard.
  void queryClient.invalidateQueries({ queryKey: ["calendar-overview"] });
  invalidateOverview(queryClient);
}

// Allocations and expenses carry a fundId and feed the fund detail page's
// allocation/expense lists and balance summary. Invalidate the fund list and
// the ["fund"] detail prefix (covers every ["fund", id]) so a create/update/
// delete — including moves between funds — refreshes the affected fund views.
function invalidateGrantAndFunds(queryClient: ReturnType<typeof useQueryClient>, grantId: string) {
  invalidateGrant(queryClient, grantId);
  void queryClient.invalidateQueries({ queryKey: ["fund"] });
  void queryClient.invalidateQueries({ queryKey: ["funds"] });
}

// Creating, editing, or deleting a grant expense posts, re-posts, or reverses a
// journal entry on the backend (postExpense) when accounting is enabled — shifting
// the trial balance, account ledger, the journal-entries list, and the three
// financial reports. For an expense against a restricted fund it also inserts or
// reverses a restriction-release row, changing every restriction view and the
// restriction reports. Refresh those caches too, mirroring the payment and
// restriction-release mutations, or the Accounting and Restriction pages stay
// stale after an expense is recorded, edited, or removed.
function invalidateExpensePostingViews(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["accounting-journal-entries"] });
  invalidateAccountingBalanceViews(queryClient);
  invalidateRestrictions(queryClient);
}

function getFailureType(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";

  const message = error.message.toLowerCase();
  if (message.includes("valid") || message.includes("required")) return "validation";
  if (message.includes("permission") || message.includes("forbidden")) return "permission";
  if (message.includes("not found")) return "not_found";
  if (message.includes("network") || message.includes("fetch")) return "network";
  return "unknown";
}

function handleGrantOperationError(operation: string) {
  return (error: unknown) => {
    captureEvent("grant_operation_failed", {
      operation,
      failure_type: getFailureType(error),
    });
    onMutationError(error);
  };
}

export function useGrants(params: GrantListParams) {
  return useQuery({
    queryKey: [
      "grants",
      params.search ?? "",
      params.status ?? "",
      params.funderId ?? "",
      params.fundId ?? "",
      params.threshold ?? "",
      params.page,
      params.pageSize,
      params.sortBy,
      params.sortOrder,
    ],
    queryFn: async () => {
      const res = await grants.$get({
        query: {
          page: String(params.page),
          pageSize: String(params.pageSize),
          sortBy: params.sortBy,
          sortOrder: params.sortOrder,
          ...(params.search ? { search: params.search } : {}),
          ...(params.status ? { status: params.status } : {}),
          ...(params.funderId ? { funderId: params.funderId } : {}),
          ...(params.fundId ? { fundId: params.fundId } : {}),
          ...(params.threshold ? { threshold: params.threshold } : {}),
        },
      });
      return readResponseOrThrow(res);
    },
    placeholderData: keepPreviousData,
  });
}

export function useGrant(grantId: string) {
  return useQuery({
    queryKey: ["grant", grantId],
    queryFn: async () => {
      const res = await grants[":grantId"].$get({ param: { grantId } });
      return readResponseOrThrow(res);
    },
    enabled: !!grantId,
  });
}

export function useGrantPipeline() {
  return useQuery({
    queryKey: ["grant-pipeline"],
    queryFn: async () => {
      const res = await grants.pipeline.$get();
      return readResponseOrThrow(res);
    },
  });
}

export function useGrantOpportunitySearch(params: GrantOpportunitySearchParams) {
  return useQuery({
    queryKey: [
      "grant-opportunities",
      params.keyword ?? "",
      params.agency ?? "",
      params.opportunityStatus ?? "",
      params.applicantTypes?.join("|") ?? "",
      params.fundingCategories?.join("|") ?? "",
      params.closeFrom ?? "",
      params.closeTo ?? "",
      params.page,
      params.pageSize,
    ],
    queryFn: async () => {
      const res = await grants.opportunities.search.$post({
        json: params as typeof params,
      });
      return readResponseOrThrow(res);
    },
    enabled: (params.keyword ?? "").trim().length > 0,
    placeholderData: keepPreviousData,
  });
}

export function useGrantOpportunities(params: GrantOpportunitySearchParams) {
  return useQuery({
    queryKey: [
      "tracked-grant-opportunities",
      params.keyword ?? "",
      params.agency ?? "",
      params.opportunityStatus ?? "",
      params.sourceType ?? "",
      params.funderType ?? "",
      params.closeFrom ?? "",
      params.closeTo ?? "",
      params.page,
      params.pageSize,
    ],
    queryFn: async () => {
      const res = await grants.opportunities.$get({
        query: {
          page: String(params.page),
          pageSize: String(params.pageSize),
          ...(params.keyword ? { keyword: params.keyword } : {}),
          ...(params.agency ? { agency: params.agency } : {}),
          ...(params.opportunityStatus ? { opportunityStatus: params.opportunityStatus } : {}),
          ...(params.sourceType ? { sourceType: params.sourceType } : {}),
          ...(params.funderType ? { funderType: params.funderType } : {}),
          ...(params.closeFrom ? { closeFrom: params.closeFrom } : {}),
          ...(params.closeTo ? { closeTo: params.closeTo } : {}),
        },
      });
      return readResponseOrThrow(res);
    },
    placeholderData: keepPreviousData,
  });
}

export function useCreateGrantOpportunity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateGrantOpportunityInput) => {
      const res = await grants.opportunities.$post({ json: data as typeof data });
      return readResponseOrThrow(res);
    },
    onSuccess: () => {
      captureEvent("grant_opportunity_created");
      void queryClient.invalidateQueries({ queryKey: ["tracked-grant-opportunities"] });
      void queryClient.invalidateQueries({ queryKey: ["grant-opportunities"] });
    },
    onError: handleGrantOperationError("create_grant_opportunity"),
  });
}

export function useGrantOpportunityMutations() {
  const queryClient = useQueryClient();
  return {
    saveOpportunity: useMutation({
      mutationFn: async ({
        opportunityId,
        data,
      }: {
        opportunityId: string;
        data: GrantOpportunityActionInput;
      }) => {
        const res = await grants.opportunities[":opportunityId"].save.$post({
          param: { opportunityId },
          json: data as typeof data,
        });
        return readResponseOrThrow(res);
      },
      onSuccess: () => {
        captureEvent("grant_opportunity_saved");
        void queryClient.invalidateQueries({ queryKey: ["grant-opportunities"] });
      },
      onError: handleGrantOperationError("save_grant_opportunity"),
    }),
    convertOpportunity: useMutation({
      mutationFn: async ({
        opportunityId,
        status,
      }: {
        opportunityId: string;
        status: "discovery" | "application";
      }) => {
        const res = await grants.opportunities[":opportunityId"].convert.$post({
          param: { opportunityId },
          json: { status },
        });
        return readResponseOrThrow(res);
      },
      onSuccess: () => {
        captureEvent("grant_opportunity_converted");
        void queryClient.invalidateQueries({ queryKey: ["grant-opportunities"] });
        void queryClient.invalidateQueries({ queryKey: ["grants"] });
        void queryClient.invalidateQueries({ queryKey: ["grant-pipeline"] });
        void queryClient.invalidateQueries({ queryKey: ["funders"] });
        // Converting an opportunity inserts a grant tied to a (possibly existing)
        // funder — getFunder embeds it via { grants: true } and the funder "Grant
        // History" tab renders it from the ["funder", id] query. Refresh the funder
        // detail caches too — the ["funder"] prefix covers every open funder detail
        // page — or that tab omits the converted grant until a reload.
        void queryClient.invalidateQueries({ queryKey: ["funder"] });
      },
      onError: handleGrantOperationError("convert_grant_opportunity"),
    }),
  };
}

export function useCreateGrant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateGrantInput) => {
      const res = await grants.$post({ json: data as typeof data });
      return readResponseOrThrow(res);
    },
    onSuccess: () => {
      captureEvent("grant_created");
      void queryClient.invalidateQueries({ queryKey: ["grants"] });
      void queryClient.invalidateQueries({ queryKey: ["grant-pipeline"] });
      invalidateOverview(queryClient);
      // A new grant tied to a funder is embedded into that funder's detail view —
      // getFunder returns { grants: true }, rendered in the funder "Grant History"
      // tab from the ["funder", id] query. Refresh the funder caches too — the
      // ["funder"] prefix covers every open funder detail page — or the Grant
      // History tab omits the newly created grant until a reload.
      void queryClient.invalidateQueries({ queryKey: ["funder"] });
    },
    onError: handleGrantOperationError("create_grant"),
  });
}

export function useGrantUpdateMutations(grantId: string) {
  const queryClient = useQueryClient();

  return {
    updateGrant: useMutation({
      mutationFn: async (data: UpdateGrantInput) => {
        const res = await grants[":grantId"].$patch({
          param: { grantId },
          json: data as typeof data,
        });
        return readResponseOrThrow(res);
      },
      onSuccess: () => {
        captureEvent("grant_updated");
        // The grant's name is denormalized into the fund detail view — each
        // fund's allocation row renders allocation.grant.name from the embedded
        // ["fund", id] query. Renaming a grant must refresh the fund caches too,
        // or the fund detail page keeps showing the old grant name until a reload.
        invalidateGrantAndFunds(queryClient, grantId);
        // The grant's name is also denormalized as grantName into every payment-
        // request row via listPaymentRequests' leftJoin, rendered in the payments
        // list's Grant column from the ["payment-requests", ...] query. Renaming a
        // grant must refresh those caches too — the ["payment-requests"] prefix
        // covers every paginated/filtered variant — or the payments list keeps
        // showing the old grant name until a reload. (Placed here, not in the
        // shared invalidateGrant helper, because the grant sub-entity mutations
        // that reuse that helper don't change the grant's name.)
        void queryClient.invalidateQueries({ queryKey: ["payment-requests"] });
        // The grant's name is also embedded into the funder detail view —
        // getFunder returns { grants: true }, including each grant's name,
        // rendered in the funder "Grant History" tab from the ["funder", id]
        // query. Renaming a grant must refresh the funder caches too — the
        // ["funder"] prefix covers every open funder detail page — or the Grant
        // History tab keeps showing the old grant name until a reload.
        void queryClient.invalidateQueries({ queryKey: ["funder"] });
        // The grant's name is also denormalized into the Reports-page grant
        // picker — useReportGrantOptions (["report-grant-options"], its own root)
        // lists each grant's name + funderName, rendered in the Grant Compliance
        // Report <SelectItem>. Renaming a grant must refresh that list too, or the
        // Reports dropdown keeps showing the old name until a reload (["grants"]
        // does not prefix-match ["report-grant-options"]).
        void queryClient.invalidateQueries({ queryKey: ["report-grant-options"] });
      },
      onError: handleGrantOperationError("update_grant"),
    }),
    deleteGrant: useMutation({
      mutationFn: async () => {
        const res = await grants[":grantId"].$delete({ param: { grantId } });
        await throwIfNotOk(res);
      },
      // After a delete, the detail record is gone — remove it from the cache
      // rather than invalidating (which would trigger a 404 refetch). The list
      // and pipeline still need to refresh.
      onSuccess: () => {
        captureEvent("grant_deleted");
        queryClient.removeQueries({ queryKey: ["grant", grantId] });
        // The detail page's Spend-Down and Budget Variance tabs key off the
        // PLURAL ["grants", grantId, ...] prefix (useSpendDown ->
        // ["grants", id, "spend-down"]; useGrantBudgetVariance ->
        // ["grants", id, "budget", "variance"]). The broad ["grants"] invalidate
        // below prefix-matches those still-mounted observers and would refetch
        // the just-deleted grant -> 404. Remove them from cache first so the
        // invalidate can't catch them. The grant LIST query's 2nd key element is
        // params.search (a string), so this never matches list caches.
        queryClient.removeQueries({ queryKey: ["grants", grantId] });
        void queryClient.invalidateQueries({ queryKey: ["grants"] });
        void queryClient.invalidateQueries({ queryKey: ["grant-pipeline"] });
        invalidateOverview(queryClient);
        // The funder "Grant History" tab embeds each grant via getFunder's
        // { grants: true } and filters soft-deleted ones server-side. Refresh the
        // ["funder"] caches too — the prefix covers every open funder detail page
        // — or the deleted grant lingers in that tab until a reload.
        void queryClient.invalidateQueries({ queryKey: ["funder"] });
        // getFund embeds each grant allocation (with: { grant: true }) and filters
        // out allocations whose grant is soft-deleted. Refresh the fund caches too
        // — the ["fund"] prefix covers every open fund detail page — or the deleted
        // grant's allocation row lingers in Source Allocations until a reload.
        // (updateGrant does this via invalidateGrantAndFunds; deleteGrant must too.)
        void queryClient.invalidateQueries({ queryKey: ["fund"] });
        void queryClient.invalidateQueries({ queryKey: ["funds"] });
      },
      onError: handleGrantOperationError("delete_grant"),
    }),
  };
}

export function useUpdateGrantStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      grantId,
      status,
    }: {
      grantId: string;
      status: NonNullable<UpdateGrantInput["status"]>;
    }) => {
      const data = { status };
      const res = await grants[":grantId"].$patch({
        param: { grantId },
        json: data as typeof data,
      });
      return readResponseOrThrow(res);
    },
    onSuccess: (_data, variables) => {
      captureEvent("grant_stage_changed", { stage: variables.status });
      void queryClient.invalidateQueries({ queryKey: ["grants"] });
      void queryClient.invalidateQueries({ queryKey: ["grant-pipeline"] });
      void queryClient.invalidateQueries({ queryKey: ["grant", variables.grantId] });
      invalidateOverview(queryClient);
      // The funder "Grant History" tab renders each grant's status badge from the
      // embedded ["funder", id] query (getFunder returns { grants: true }).
      // Refresh the ["funder"] caches too — the prefix covers every open funder
      // detail page — or the badge shows the old status until a reload.
      void queryClient.invalidateQueries({ queryKey: ["funder"] });
    },
    onError: handleGrantOperationError("update_grant_stage"),
  });
}

export function useFunders(params: FunderListParams) {
  return useQuery({
    queryKey: [
      "funders",
      params.search ?? "",
      params.type ?? "",
      params.page,
      params.pageSize,
      params.sortBy,
      params.sortOrder,
    ],
    queryFn: async () => {
      const res = await grants.funders.$get({
        query: {
          page: String(params.page),
          pageSize: String(params.pageSize),
          sortBy: params.sortBy,
          sortOrder: params.sortOrder,
          ...(params.search ? { search: params.search } : {}),
          ...(params.type ? { type: params.type } : {}),
        },
      });
      return readResponseOrThrow(res);
    },
  });
}

export function useFunder(funderId: string) {
  return useQuery({
    queryKey: ["funder", funderId],
    queryFn: async () => {
      const res = await grants.funders[":funderId"].$get({ param: { funderId } });
      return readResponseOrThrow(res);
    },
    enabled: !!funderId,
  });
}

export function useCreateFunder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateFunderInput) => {
      const res = await grants.funders.$post({ json: data as typeof data });
      return readResponseOrThrow(res);
    },
    onSuccess: () => {
      captureEvent("funder_created");
      void queryClient.invalidateQueries({ queryKey: ["funders"] });
    },
    onError: handleGrantOperationError("create_funder"),
  });
}

export function useFunderUpdateMutations(funderId: string) {
  const queryClient = useQueryClient();

  return {
    updateFunder: useMutation({
      mutationFn: async (data: UpdateFunderInput) => {
        const res = await grants.funders[":funderId"].$patch({
          param: { funderId },
          json: data as typeof data,
        });
        return readResponseOrThrow(res);
      },
      onSuccess: () => {
        captureEvent("funder_updated");
        void queryClient.invalidateQueries({ queryKey: ["funder", funderId] });
        void queryClient.invalidateQueries({ queryKey: ["funders"] });
        // The funder's name is denormalized into every grant read — the grant
        // detail page renders grant.funder.name and the grants list renders a
        // Funder column from the joined name. Renaming a funder must refresh
        // the grant entity and grants list caches, or those pages keep showing
        // the stale funder name until a full page reload.
        void queryClient.invalidateQueries({ queryKey: ["grant"] });
        void queryClient.invalidateQueries({ queryKey: ["grants"] });
        // The funder name is also shown as the disambiguator in the Reports-page
        // grant picker — useReportGrantOptions (["report-grant-options"], its own
        // root) lists each grant's funderName under the grant name in the Grant
        // Compliance Report <SelectItem>. Renaming a funder must refresh that list
        // too, or the Reports dropdown keeps showing the old funder name until a
        // reload (["funders"]/["grants"] do not prefix-match ["report-grant-options"]).
        void queryClient.invalidateQueries({ queryKey: ["report-grant-options"] });
      },
      onError: handleGrantOperationError("update_funder"),
    }),
    deleteFunder: useMutation({
      mutationFn: async () => {
        const res = await grants.funders[":funderId"].$delete({ param: { funderId } });
        await throwIfNotOk(res);
      },
      onSuccess: () => {
        captureEvent("funder_deleted");
        queryClient.removeQueries({ queryKey: ["funder", funderId] });
        void queryClient.invalidateQueries({ queryKey: ["funders"] });
      },
      onError: handleGrantOperationError("delete_funder"),
    }),
  };
}

export function useFunderContactMutations(funderId: string) {
  const queryClient = useQueryClient();

  return {
    createContact: useMutation({
      mutationFn: async (data: CreateFunderContactInput) => {
        const res = await grants.funders[":funderId"].contacts.$post({
          param: { funderId },
          json: data as typeof data,
        });
        return readResponseOrThrow(res);
      },
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ["funder", funderId] });
        void queryClient.invalidateQueries({ queryKey: ["funders"] });
      },
      onError: handleGrantOperationError("create_funder_contact"),
    }),
    updateContact: useMutation({
      mutationFn: async ({
        contactId,
        data,
      }: {
        contactId: string;
        data: UpdateFunderContactInput;
      }) => {
        const res = await grants.funders[":funderId"].contacts[":contactId"].$patch({
          param: { funderId, contactId },
          json: data as typeof data,
        });
        return readResponseOrThrow(res);
      },
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ["funder", funderId] });
      },
      onError: handleGrantOperationError("update_funder_contact"),
    }),
    deleteContact: useMutation({
      mutationFn: async (contactId: string) => {
        const res = await grants.funders[":funderId"].contacts[":contactId"].$delete({
          param: { funderId, contactId },
        });
        await throwIfNotOk(res);
      },
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ["funder", funderId] });
      },
      onError: handleGrantOperationError("delete_funder_contact"),
    }),
  };
}

export function useFunds(params: FundListParams) {
  return useQuery({
    queryKey: [
      "funds",
      params.search ?? "",
      params.type ?? "",
      params.page,
      params.pageSize,
      params.sortBy,
      params.sortOrder,
    ],
    queryFn: async () => {
      const res = await grants.funds.$get({
        query: {
          page: String(params.page),
          pageSize: String(params.pageSize),
          sortBy: params.sortBy,
          sortOrder: params.sortOrder,
          ...(params.search ? { search: params.search } : {}),
          ...(params.type ? { type: params.type } : {}),
        },
      });
      return readResponseOrThrow(res);
    },
  });
}

export function useFund(fundId: string) {
  return useQuery({
    queryKey: ["fund", fundId],
    queryFn: async () => {
      const res = await grants.funds[":fundId"].$get({ param: { fundId } });
      return readResponseOrThrow(res);
    },
    enabled: !!fundId,
  });
}

export function useCreateFund() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateFundInput) => {
      const res = await grants.funds.$post({ json: data as typeof data });
      return readResponseOrThrow(res);
    },
    onSuccess: () => {
      captureEvent("fund_created");
      void queryClient.invalidateQueries({ queryKey: ["funds"] });
      invalidateOverview(queryClient);
    },
    onError: handleGrantOperationError("create_fund"),
  });
}

export function useFundUpdateMutations(fundId: string) {
  const queryClient = useQueryClient();

  return {
    updateFund: useMutation({
      mutationFn: async (data: UpdateFundInput) => {
        const res = await grants.funds[":fundId"].$patch({
          param: { fundId },
          json: data as typeof data,
        });
        return readResponseOrThrow(res);
      },
      onSuccess: () => {
        captureEvent("fund_updated");
        void queryClient.invalidateQueries({ queryKey: ["fund", fundId] });
        void queryClient.invalidateQueries({ queryKey: ["funds"] });
        // The fund's name is denormalized into the grant detail view — each
        // grant's allocation card renders allocation.fund.name from the embedded
        // ["grant", id] query. Renaming a fund must refresh the grant caches too,
        // or the grant detail page keeps showing the old fund name until a reload.
        void queryClient.invalidateQueries({ queryKey: ["grant"] });
        void queryClient.invalidateQueries({ queryKey: ["grants"] });
        // The fund's name is denormalized as fundName into each donation row via
        // listDonations' leftJoin, rendered in the contact giving-history table
        // from the ["donations", contactId, ...] query. Renaming a fund must
        // refresh the donation caches too, or the contact donation history keeps
        // showing the old fund name until a reload.
        void queryClient.invalidateQueries({ queryKey: ["donations"] });
        invalidateOverview(queryClient);
      },
      onError: handleGrantOperationError("update_fund"),
    }),
    deleteFund: useMutation({
      mutationFn: async () => {
        const res = await grants.funds[":fundId"].$delete({ param: { fundId } });
        await throwIfNotOk(res);
      },
      onSuccess: () => {
        captureEvent("fund_deleted");
        queryClient.removeQueries({ queryKey: ["fund", fundId] });
        void queryClient.invalidateQueries({ queryKey: ["funds"] });
        // getGrant embeds each fund allocation (with: { fund: true }) and filters
        // out allocations whose fund is soft-deleted. Refresh the grant caches too
        // — the ["grant"] prefix covers every open grant detail page — or the
        // deleted fund's allocation row (rendering allocation.fund.name) lingers
        // until a reload. (updateFund does this; deleteFund must too.)
        void queryClient.invalidateQueries({ queryKey: ["grant"] });
        void queryClient.invalidateQueries({ queryKey: ["grants"] });
        // listDonations leftJoins funds with isNull(funds.deletedAt), so a
        // deleted fund flips each donation's fundName from the name to null
        // ("N/A") in the contact giving-history table. Refresh the donation
        // caches too — the ["donations"] prefix covers every contact's page —
        // or the deleted fund's name lingers until a reload. (updateFund does
        // this; deleteFund must too.)
        void queryClient.invalidateQueries({ queryKey: ["donations"] });
        invalidateOverview(queryClient);
      },
      onError: handleGrantOperationError("delete_fund"),
    }),
  };
}

export function useAllocationMutations(grantId: string) {
  const queryClient = useQueryClient();
  return {
    createAllocation: useMutation({
      mutationFn: async (data: CreateAllocationInput) => {
        const res = await grants[":grantId"].allocations.$post({
          param: { grantId },
          json: data as typeof data,
        });
        return readResponseOrThrow(res);
      },
      onSuccess: () => {
        captureEvent("grant_fund_allocation_created");
        invalidateGrantAndFunds(queryClient, grantId);
      },
      onError: handleGrantOperationError("create_allocation"),
    }),
    updateAllocation: useMutation({
      mutationFn: async ({
        allocationId,
        data,
      }: {
        allocationId: string;
        data: UpdateAllocationInput;
      }) => {
        const res = await grants[":grantId"].allocations[":allocationId"].$patch({
          param: { grantId, allocationId },
          json: data as typeof data,
        });
        return readResponseOrThrow(res);
      },
      onSuccess: () => invalidateGrantAndFunds(queryClient, grantId),
      onError: handleGrantOperationError("update_allocation"),
    }),
    deleteAllocation: useMutation({
      mutationFn: async (allocationId: string) => {
        const res = await grants[":grantId"].allocations[":allocationId"].$delete({
          param: { grantId, allocationId },
        });
        await throwIfNotOk(res);
      },
      onSuccess: () => invalidateGrantAndFunds(queryClient, grantId),
      onError: handleGrantOperationError("delete_allocation"),
    }),
  };
}

export function useExpenseMutations(grantId: string) {
  const queryClient = useQueryClient();
  return {
    createExpense: useMutation({
      mutationFn: async (data: CreateGrantExpenseInput) => {
        const res = await grants[":grantId"].expenses.$post({
          param: { grantId },
          json: data as typeof data,
        });
        return readResponseOrThrow(res);
      },
      onSuccess: () => {
        invalidateGrantAndFunds(queryClient, grantId);
        invalidateExpensePostingViews(queryClient);
      },
      onError: handleGrantOperationError("create_expense"),
    }),
    updateExpense: useMutation({
      mutationFn: async ({ expenseId, data }: { expenseId: string; data: UpdateExpenseInput }) => {
        const res = await grants[":grantId"].expenses[":expenseId"].$patch({
          param: { grantId, expenseId },
          json: data as typeof data,
        });
        return readResponseOrThrow(res);
      },
      onSuccess: () => {
        invalidateGrantAndFunds(queryClient, grantId);
        invalidateExpensePostingViews(queryClient);
      },
      onError: handleGrantOperationError("update_expense"),
    }),
    deleteExpense: useMutation({
      mutationFn: async (expenseId: string) => {
        const res = await grants[":grantId"].expenses[":expenseId"].$delete({
          param: { grantId, expenseId },
        });
        await throwIfNotOk(res);
      },
      onSuccess: () => {
        invalidateGrantAndFunds(queryClient, grantId);
        invalidateExpensePostingViews(queryClient);
      },
      onError: handleGrantOperationError("delete_expense"),
    }),
  };
}

export function useImpactMetricMutations(grantId: string) {
  const queryClient = useQueryClient();
  return {
    createMetric: useMutation({
      mutationFn: async (data: CreateImpactMetricInput) => {
        const res = await grants[":grantId"].metrics.$post({
          param: { grantId },
          json: data as typeof data,
        });
        return readResponseOrThrow(res);
      },
      onSuccess: () => invalidateGrant(queryClient, grantId),
      onError: handleGrantOperationError("create_impact_metric"),
    }),
    updateMetric: useMutation({
      mutationFn: async ({
        metricId,
        data,
      }: {
        metricId: string;
        data: UpdateImpactMetricInput;
      }) => {
        const res = await grants[":grantId"].metrics[":metricId"].$patch({
          param: { grantId, metricId },
          json: data as typeof data,
        });
        return readResponseOrThrow(res);
      },
      onSuccess: () => invalidateGrant(queryClient, grantId),
      onError: handleGrantOperationError("update_impact_metric"),
    }),
    deleteMetric: useMutation({
      mutationFn: async (metricId: string) => {
        const res = await grants[":grantId"].metrics[":metricId"].$delete({
          param: { grantId, metricId },
        });
        await throwIfNotOk(res);
      },
      onSuccess: () => invalidateGrant(queryClient, grantId),
      onError: handleGrantOperationError("delete_impact_metric"),
    }),
    createEntry: useMutation({
      mutationFn: async ({
        metricId,
        data,
      }: {
        metricId: string;
        data: CreateImpactMetricEntryInput;
      }) => {
        const res = await grants[":grantId"].metrics[":metricId"].entries.$post({
          param: { grantId, metricId },
          json: data as typeof data,
        });
        return readResponseOrThrow(res);
      },
      onSuccess: () => invalidateGrant(queryClient, grantId),
      onError: handleGrantOperationError("create_impact_metric_entry"),
    }),
    updateEntry: useMutation({
      mutationFn: async ({
        metricId,
        entryId,
        data,
      }: {
        metricId: string;
        entryId: string;
        data: UpdateImpactMetricEntryInput;
      }) => {
        const res = await grants[":grantId"].metrics[":metricId"].entries[":entryId"].$patch({
          param: { grantId, metricId, entryId },
          json: data as typeof data,
        });
        return readResponseOrThrow(res);
      },
      onSuccess: () => invalidateGrant(queryClient, grantId),
      onError: handleGrantOperationError("update_impact_metric_entry"),
    }),
    deleteEntry: useMutation({
      mutationFn: async ({ metricId, entryId }: { metricId: string; entryId: string }) => {
        const res = await grants[":grantId"].metrics[":metricId"].entries[":entryId"].$delete({
          param: { grantId, metricId, entryId },
        });
        await throwIfNotOk(res);
      },
      onSuccess: () => invalidateGrant(queryClient, grantId),
      onError: handleGrantOperationError("delete_impact_metric_entry"),
    }),
  };
}

export function useReportingRequirementMutations(grantId: string) {
  const queryClient = useQueryClient();
  return {
    createRequirement: useMutation({
      mutationFn: async (data: CreateReportingRequirementInput) => {
        const res = await grants[":grantId"]["reporting-requirements"].$post({
          param: { grantId },
          json: data as typeof data,
        });
        return readResponseOrThrow(res);
      },
      onSuccess: () => invalidateGrant(queryClient, grantId),
      onError: handleGrantOperationError("create_reporting_requirement"),
    }),
    updateRequirement: useMutation({
      mutationFn: async ({
        requirementId,
        data,
      }: {
        requirementId: string;
        data: UpdateReportingRequirementInput;
      }) => {
        const res = await grants[":grantId"]["reporting-requirements"][":requirementId"].$patch({
          param: { grantId, requirementId },
          json: data as typeof data,
        });
        return readResponseOrThrow(res);
      },
      onSuccess: () => invalidateGrant(queryClient, grantId),
      onError: handleGrantOperationError("update_reporting_requirement"),
    }),
    deleteRequirement: useMutation({
      mutationFn: async (requirementId: string) => {
        const res = await grants[":grantId"]["reporting-requirements"][":requirementId"].$delete({
          param: { grantId, requirementId },
        });
        await throwIfNotOk(res);
      },
      onSuccess: () => invalidateGrant(queryClient, grantId),
      onError: handleGrantOperationError("delete_reporting_requirement"),
    }),
  };
}

export function useCloseoutItemMutations(grantId: string) {
  const queryClient = useQueryClient();
  return {
    createItem: useMutation({
      mutationFn: async (data: CreateCloseoutItemInput) => {
        const res = await grants[":grantId"]["closeout-items"].$post({
          param: { grantId },
          json: data as typeof data,
        });
        return readResponseOrThrow(res);
      },
      onSuccess: () => invalidateGrant(queryClient, grantId),
      onError: handleGrantOperationError("create_closeout_item"),
    }),
    updateItem: useMutation({
      mutationFn: async ({ itemId, data }: { itemId: string; data: UpdateCloseoutItemInput }) => {
        const res = await grants[":grantId"]["closeout-items"][":itemId"].$patch({
          param: { grantId, itemId },
          json: data as typeof data,
        });
        return readResponseOrThrow(res);
      },
      onSuccess: () => invalidateGrant(queryClient, grantId),
      onError: handleGrantOperationError("update_closeout_item"),
    }),
    deleteItem: useMutation({
      mutationFn: async (itemId: string) => {
        const res = await grants[":grantId"]["closeout-items"][":itemId"].$delete({
          param: { grantId, itemId },
        });
        await throwIfNotOk(res);
      },
      onSuccess: () => invalidateGrant(queryClient, grantId),
      onError: handleGrantOperationError("delete_closeout_item"),
    }),
  };
}

export function useSpendDown(grantId: string) {
  return useQuery({
    queryKey: ["grants", grantId, "spend-down"],
    queryFn: async (): Promise<SpendDownResult> => {
      const res = await grants[":grantId"]["spend-down"].$get({
        param: { grantId },
        query: {},
      });
      return readResponseOrThrow<SpendDownResult>(res);
    },
    enabled: !!grantId,
  });
}

export function useGrantBudgetVariance(grantId: string) {
  return useQuery({
    queryKey: ["grants", grantId, "budget", "variance"],
    queryFn: async (): Promise<{ rows: GrantBudgetLineRollup[] }> => {
      const res = await grants[":grantId"].budget.variance.$get({
        param: { grantId },
        query: {},
      });
      return readResponseOrThrow<{ rows: GrantBudgetLineRollup[] }>(res);
    },
    enabled: !!grantId,
  });
}

export function useGenerateSpendDownReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      grantId: string;
      title?: string;
      from?: string;
      to?: string;
    }): Promise<GeneratedReportArtifact> => {
      const res = await api.api.compliance.reports["spend-down"].$post({
        json: data as typeof data,
      });
      return readResponseOrThrow<GeneratedReportArtifact>(res);
    },
    onSuccess: () => {
      captureEvent("report_generated", { report_type: "spend_down" });
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: handleGrantOperationError("generate_spend_down_report"),
  });
}
