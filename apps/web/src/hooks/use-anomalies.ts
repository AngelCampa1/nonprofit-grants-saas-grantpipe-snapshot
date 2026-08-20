import { useQuery } from "@tanstack/react-query";
import { ANALYTICS_EVENTS, ANOMALY_CLASSES, type AnomalyClass } from "@grantpipe/shared";
import { api } from "../lib/api-client";
import { isApiErrorStatus } from "../lib/api-errors";
import { captureEvent } from "../lib/analytics";
import { readResponseOrThrow } from "../lib/http-response";

export { ANOMALY_CLASSES, type AnomalyClass };

const anomaliesApi = api.api.accounting.anomalies;

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export type AnomalyBaseFields = {
  severity: "info" | "warning" | "critical";
  reason: string;
  entityId: string;
};

export type CategoryMisallocationItem = AnomalyBaseFields & {
  class: "category_misallocation";
  entityType: "expense";
  expenseCategory: string | null;
  expenseAccountId: string | null;
  termId: string;
  fundId: string;
};

export type ReleaseOverBalanceItem = AnomalyBaseFields & {
  class: "release_over_balance";
  entityType: "restriction_release";
  releaseAmountCents: number;
  availableBalanceCents: number;
  overByCents: number;
  termId: string;
  fundId: string | null;
  grantId: string | null;
  donationId: string | null;
  contactId: string | null;
};

export type DuplicateDonationItem = AnomalyBaseFields & {
  class: "duplicate_donation";
  entityType: "donation";
  contactId: string;
  duplicateGroupIds: string[];
};

export type IndirectRateMismatchItem = AnomalyBaseFields & {
  class: "indirect_rate_mismatch";
  entityType: "payment_request";
  postedRateBasisPoints: number;
  postedAmountCents: number;
  expectedRateBasisPoints: number;
  expectedAmountCents: number;
  deltaCents: number;
};

export type AnomalyItem =
  | CategoryMisallocationItem
  | ReleaseOverBalanceItem
  | DuplicateDonationItem
  | IndirectRateMismatchItem;

export type AnomalyResult = {
  asOf: string;
  items: AnomalyItem[];
  totals: Record<AnomalyClass, number>;
};

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export type AnomalyFilters = {
  classes?: AnomalyClass[];
  limit?: number;
};

export function buildAnomalyQuery(filters: AnomalyFilters): Record<string, string> {
  const query: Record<string, string> = {};
  if (filters.classes && filters.classes.length > 0) {
    query.classes = filters.classes.join(",");
  }
  if (typeof filters.limit === "number") {
    query.limit = String(filters.limit);
  }
  return query;
}

function failureStatus(error: unknown): number | "unknown" {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number" &&
    (error as { status: number }).status > 0
  ) {
    return (error as { status: number }).status;
  }
  return "unknown";
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * TanStack Query hook that fetches the accounting anomaly feed.
 *
 * Exposes `isPlanGated` when the API returns 402 (audit_ready/enterprise plan required).
 * Does not retry on 402.
 */
export function useAnomalies(filters: AnomalyFilters = {}) {
  const query = buildAnomalyQuery(filters);
  const result = useQuery({
    queryKey: ["accounting-anomalies", query] as const,
    queryFn: async (): Promise<AnomalyResult> => {
      const res = await anomaliesApi.$get({ query });
      try {
        return await readResponseOrThrow<AnomalyResult>(
          res as unknown as Parameters<typeof readResponseOrThrow<AnomalyResult>>[0],
        );
      } catch (error) {
        captureEvent(ANALYTICS_EVENTS.accountingAnomalyOperationFailed, {
          operation: "load",
          failure_status: failureStatus(error),
        });
        throw error;
      }
    },
    retry: (failureCount, error) => {
      if (isApiErrorStatus(error, 402)) return false;
      return failureCount < 1;
    },
  });

  const isPlanGated = isApiErrorStatus(result.error, 402);

  return { ...result, isPlanGated };
}
