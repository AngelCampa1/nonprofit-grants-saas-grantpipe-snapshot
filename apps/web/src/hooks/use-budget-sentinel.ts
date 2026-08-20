import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api-client";
import { isApiErrorStatus } from "../lib/api-errors";
import { readResponseOrThrow } from "../lib/http-response";

const budgetSentinelApi = api.api.grants["budget-sentinel"];

/** Overspend item returned by the API. */
export type OverspendItem = {
  kind: "overspend";
  id: string;
  grantId: string;
  grantName: string;
  category: string;
  band: "near_limit" | "projected_overspend" | "over_budget";
  approvedAmountCents: number;
  actualCents: number;
  plannedCents: number;
  projectedCents: number;
  overByCents: number;
  utilizationPercent: number | null;
  riskScore: number;
};

/** Underspend item returned by the API. */
export type UnderspendItem = {
  kind: "underspend";
  id: string;
  fundId: string | null;
  fundName: string | null;
  grantId: string | null;
  title: string;
  band: "lapse_watch" | "lapsing_soon" | "lapsed_unspent";
  balanceCents: number;
  daysUntilEnd: number;
  endDate: string;
  riskScore: number;
};

/** Discriminated union for a sentinel item. */
export type BudgetSentinelItem = OverspendItem | UnderspendItem;

/** Totals broken down by band. */
export type BudgetSentinelTotals = {
  overspend: {
    near_limit: number;
    projected_overspend: number;
    over_budget: number;
    total: number;
  };
  underspend: {
    lapse_watch: number;
    lapsing_soon: number;
    lapsed_unspent: number;
    total: number;
  };
  totalAtRisk: number;
};

/** Full API response shape for `GET /api/grants/budget-sentinel`. */
export type BudgetSentinelResponse = {
  asOf: string;
  items: BudgetSentinelItem[];
  totals: BudgetSentinelTotals;
};

/** Filters passed to the hook, mirroring the query params the API accepts. */
export type BudgetSentinelFilters = {
  /** Kind tokens to include. Omit to return all kinds. */
  kinds?: Array<"overspend" | "underspend">;
  /** Maximum number of items to return. API default applies when omitted. */
  limit?: number;
};

/**
 * Builds the query-string record the RPC client sends.
 * All values must be strings; undefined/empty entries are omitted so the API
 * falls back to its defaults.
 */
export function buildBudgetSentinelQuery(
  filters: BudgetSentinelFilters,
): Record<string, string> {
  const query: Record<string, string> = {};
  if (filters.kinds && filters.kinds.length > 0) {
    query.kinds = filters.kinds.join(",");
  }
  if (typeof filters.limit === "number") {
    query.limit = String(filters.limit);
  }
  return query;
}

/**
 * TanStack Query hook that fetches the budget sentinel feed.
 *
 * The hook exposes `isPlanGated` so callers can branch on the 402 entitlement
 * error without inspecting raw error state.
 */
export function useBudgetSentinel(filters: BudgetSentinelFilters = {}) {
  const query = buildBudgetSentinelQuery(filters);
  const result = useQuery({
    queryKey: ["budget-sentinel", query] as const,
    queryFn: async (): Promise<BudgetSentinelResponse> => {
      const res = await budgetSentinelApi.$get({ query });
      return readResponseOrThrow<BudgetSentinelResponse>(
        res as unknown as Parameters<typeof readResponseOrThrow<BudgetSentinelResponse>>[0],
      );
    },
    retry: (failureCount, error) => {
      if (isApiErrorStatus(error, 402)) return false;
      return failureCount < 1;
    },
  });

  const isPlanGated = isApiErrorStatus(result.error, 402);

  return { ...result, isPlanGated };
}
