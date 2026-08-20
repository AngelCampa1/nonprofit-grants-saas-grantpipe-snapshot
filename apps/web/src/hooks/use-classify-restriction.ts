import { useMutation } from "@tanstack/react-query";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import { api } from "../lib/api-client";
import { captureEvent } from "../lib/analytics";
import { readResponseOrThrow } from "../lib/http-response";
import type { ClassificationResult } from "@grantpipe/shared";

export type ClassifyRestrictionParams = {
  fundId?: string;
  grantId?: string;
  designation?: string;
  date?: string;
};

/**
 * Mutation hook for the restriction auto-classifier endpoint.
 * Call `mutateAsync` with fundId, grantId, designation, or date; the server
 * resolves fund/grant data and returns a ClassificationResult.
 *
 * A mutation (not a query) is used intentionally: classification is triggered
 * by form events, not by a stable cache key, and the caller controls exactly
 * when to fire it (after debounce).
 */
export function useClassifyRestriction() {
  return useMutation<ClassificationResult, Error, ClassifyRestrictionParams>({
    mutationFn: async (params: ClassifyRestrictionParams) => {
      const res = await api.api.donors["classify-restriction"].$post({
        json: {
          ...(params.fundId ? { fundId: params.fundId } : {}),
          ...(params.grantId ? { grantId: params.grantId } : {}),
          ...(params.designation ? { designation: params.designation } : {}),
          ...(params.date ? { date: params.date } : {}),
        },
      });
      return readResponseOrThrow(res) as Promise<ClassificationResult>;
    },
    onSuccess: (data) => {
      captureEvent(ANALYTICS_EVENTS.restrictionClassificationSuggested, {
        classification: data.netAssetClass,
      });
    },
  });
}
