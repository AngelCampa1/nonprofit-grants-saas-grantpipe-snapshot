import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateOutcomeIndicatorInput,
  CreateOutcomeInput,
  OutcomeListQuery,
} from "@grantpipe/shared";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import { api } from "../lib/api-client";
import { captureEvent } from "../lib/analytics";
import { readResponseOrThrow } from "../lib/http-response";
import { captureAppException } from "../lib/sentry";

const outcomes = api.api.outcomes;
type OutcomeFilters = Partial<
  Pick<OutcomeListQuery, "programId" | "grantId" | "status" | "page" | "pageSize">
> & {
  enabled?: boolean;
};

function invalidateOutcomes(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["outcomes"] });
  void queryClient.invalidateQueries({ queryKey: ["program"] });
}

function outcomeProperties(data: Pick<CreateOutcomeInput, "programId" | "grantId" | "status">) {
  return {
    surface: "program_detail",
    has_program_link: Boolean(data.programId),
    has_grant_link: Boolean(data.grantId),
    status: data.status ?? "draft",
  };
}

function indicatorProperties(
  data: Pick<CreateOutcomeIndicatorInput, "impactMetricId" | "indicatorType" | "funderDefined">,
) {
  return {
    surface: "program_detail",
    indicator_type: data.indicatorType ?? "outcome",
    has_metric_link: Boolean(data.impactMetricId),
    funder_defined: Boolean(data.funderDefined),
  };
}

function captureOutcomeFailure(
  error: unknown,
  operation: "create_outcome" | "create_indicator",
  properties: Record<string, unknown>,
) {
  captureEvent(ANALYTICS_EVENTS.outcomeOperationFailed, {
    surface: "program_detail",
    operation,
    failure_type: "api_error",
    ...properties,
  });
  captureAppException(error, {
    tags: { feature: "outcomes", operation },
    extra: {
      surface: "program_detail",
      ...properties,
    },
  });
}

export function useOutcomes(params: OutcomeFilters = {}) {
  return useQuery({
    queryKey: [
      "outcomes",
      params.programId ?? "",
      params.grantId ?? "",
      params.status ?? "",
      params.page ?? 1,
      params.pageSize ?? 25,
    ],
    queryFn: async () => {
      const res = await outcomes.$get({
        query: {
          ...(params.programId ? { programId: params.programId } : {}),
          ...(params.grantId ? { grantId: params.grantId } : {}),
          ...(params.status ? { status: params.status } : {}),
          ...(params.page ? { page: String(params.page) } : {}),
          ...(params.pageSize ? { pageSize: String(params.pageSize) } : {}),
        },
      });
      return readResponseOrThrow(res as never);
    },
    placeholderData: keepPreviousData,
    enabled: params.enabled ?? true,
  });
}

export function useCreateOutcome() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateOutcomeInput) => {
      const res = await outcomes.$post({ json: data as never });
      return readResponseOrThrow(res as never);
    },
    onSuccess: (_outcome, variables) => {
      captureEvent(ANALYTICS_EVENTS.outcomeGoalCreated, outcomeProperties(variables));
      invalidateOutcomes(queryClient);
    },
    onError: (error, variables) => {
      const properties = outcomeProperties(variables);
      captureOutcomeFailure(error, "create_outcome", {
        has_program_link: properties.has_program_link,
        has_grant_link: properties.has_grant_link,
      });
    },
  });
}

export function useCreateOutcomeIndicator(outcomeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateOutcomeIndicatorInput) => {
      const res = await outcomes[":outcomeId"].indicators.$post({
        param: { outcomeId },
        json: data as never,
      });
      return readResponseOrThrow(res as never);
    },
    onSuccess: (_indicator, variables) => {
      captureEvent(ANALYTICS_EVENTS.outcomeIndicatorCreated, indicatorProperties(variables));
      invalidateOutcomes(queryClient);
    },
    onError: (error, variables) => {
      const properties = indicatorProperties(variables);
      captureOutcomeFailure(error, "create_indicator", {
        indicator_type: properties.indicator_type,
        has_metric_link: properties.has_metric_link,
        funder_defined: properties.funder_defined,
      });
    },
  });
}
