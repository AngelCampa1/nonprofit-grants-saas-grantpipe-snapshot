import { useQuery } from "@tanstack/react-query";
import type { DonorLapseRiskBand } from "@grantpipe/shared";
import { api } from "../lib/api-client";
import { isApiErrorStatus } from "../lib/api-errors";
import { readResponseOrThrow } from "../lib/http-response";

const lapseRiskApi = api.api.donors["lapse-risk"];

/** A single at-risk donor entry returned by the API. */
export type AtRiskDonor = {
  contactId: string;
  displayName: string;
  email: string | null;
  band: Exclude<DonorLapseRiskBand, "none">;
  daysSinceLastGift: number;
  typicalCadenceDays: number | null;
  riskScore: number;
  lifetimeGivingCents: number;
  lastGiftDate: string | null;
};

/** Totals broken down by band, returned alongside the donor list. */
export type AtRiskDonorTotals = {
  lapsing: number;
  at_risk: number;
  lapsed: number;
  total: number;
};

/** Full API response shape for `GET /api/donors/lapse-risk`. */
export type AtRiskDonorsResponse = {
  asOf: string;
  donors: AtRiskDonor[];
  totals: AtRiskDonorTotals;
};

/** Filters passed to the hook, mirroring the query params the API accepts. */
export type AtRiskDonorFilters = {
  /** Comma-joined band names to include. Omit to return all bands. */
  bands?: Array<Exclude<DonorLapseRiskBand, "none">>;
  /** Maximum number of donors to return. API default applies when omitted. */
  limit?: number;
};

/**
 * Builds the query-string record the RPC client sends.
 * All values must be strings; undefined/empty entries are omitted so the API
 * falls back to its defaults.
 */
export function buildAtRiskDonorsQuery(filters: AtRiskDonorFilters): Record<string, string> {
  const query: Record<string, string> = {};
  if (filters.bands && filters.bands.length > 0) {
    query.bands = filters.bands.join(",");
  }
  if (typeof filters.limit === "number") {
    query.limit = String(filters.limit);
  }
  return query;
}

/**
 * TanStack Query hook that fetches the at-risk donor feed.
 *
 * The hook exposes `isPlanGated` so callers can branch on the 402 entitlement
 * error without inspecting raw error state.
 */
export function useAtRiskDonors(filters: AtRiskDonorFilters = {}) {
  const query = buildAtRiskDonorsQuery(filters);
  const result = useQuery({
    queryKey: ["at-risk-donors", query] as const,
    queryFn: async (): Promise<AtRiskDonorsResponse> => {
      const res = await lapseRiskApi.$get({ query });
      // The RPC union includes error response shapes that aren't
      // assignable to AtRiskDonorsResponse; readResponseOrThrow handles
      // non-ok responses by throwing, so this cast is safe.
      return readResponseOrThrow<AtRiskDonorsResponse>(
        res as unknown as Parameters<typeof readResponseOrThrow<AtRiskDonorsResponse>>[0],
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
