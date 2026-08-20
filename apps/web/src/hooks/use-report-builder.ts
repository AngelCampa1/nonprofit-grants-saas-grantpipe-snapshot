import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import type {
  CreateReportDefinitionInput,
  ReportBuilderDefinition,
  ReportBuilderListParams,
  ReportBuilderMetadata,
  ReportBuilderPreview,
  ReportBuilderPreviewInput,
  ReportBuilderRunInput,
  UpdateReportDefinitionInput,
} from "@grantpipe/shared";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import { api } from "../lib/api-client";
import { captureEvent } from "../lib/analytics";
import { readResponseOrThrow } from "../lib/http-response";
import { captureAppException } from "../lib/sentry";
import { isApiErrorStatus } from "../lib/api-errors";
import { createRetryAttemptRegistry } from "../lib/retry-attempt-registry";
import { ACTIVE_ENTITY_STORAGE_KEY } from "../lib/org-context";

const reportBuilder = api.api["report-builder"];

type ReportBuilderOperation =
  | "definition_save"
  | "definition_update"
  | "definition_delete"
  | "preview"
  | "export";

function countBucket(value: number | string | undefined): string {
  if (value === undefined) return "unknown";
  const count = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(count)) return "unknown";
  if (count <= 0) return "0";
  if (count <= 10) return "1_10";
  if (count <= 25) return "10_25";
  if (count <= 100) return "25_100";
  return "100_plus";
}

function reportBuilderProperties(
  data: Partial<
    Pick<
      CreateReportDefinitionInput,
      "entity" | "columns" | "customFieldIds" | "filters" | "sort" | "description"
    >
  >,
): Record<string, unknown> {
  return {
    entity_type: data.entity,
    report_type: "custom_report",
    surface: "report_builder",
    column_count: data.columns?.length ?? 0,
    custom_field_count: data.customFieldIds?.length ?? 0,
    filter_count: data.filters?.length ?? 0,
    sort_count: data.sort?.length ?? 0,
    has_description: Boolean(data.description?.trim()),
  };
}

function captureReportBuilderFailure(
  error: unknown,
  operation: ReportBuilderOperation,
  data: Partial<
    Pick<
      CreateReportDefinitionInput,
      "entity" | "columns" | "customFieldIds" | "filters" | "sort" | "description"
    >
  >,
): void {
  const properties = reportBuilderProperties(data);
  captureEvent(ANALYTICS_EVENTS.reportBuilderOperationFailed, {
    ...properties,
    operation,
    failure_type: "api_error",
  });
  captureAppException(error, {
    tags: {
      feature: "report_builder",
      operation,
    },
    extra: {
      entity_type: properties.entity_type,
      column_count: properties.column_count,
      custom_field_count: properties.custom_field_count,
      filter_count: properties.filter_count,
      sort_count: properties.sort_count,
      has_description: properties.has_description,
    },
  });
}

function invalidateReportBuilder(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["report-builder"] });
  void queryClient.invalidateQueries({ queryKey: ["reports"] });
}

export function useReportBuilderMetadata() {
  const result = useQuery({
    queryKey: ["report-builder", "metadata"],
    queryFn: async () => {
      const res = await reportBuilder.metadata.$get();
      return readResponseOrThrow<ReportBuilderMetadata>(res as never);
    },
  });
  const isPlanGated = isApiErrorStatus(result.error, 402) || isApiErrorStatus(result.error, 403);
  return { ...result, isPlanGated };
}

export function useReportDefinitions(
  params: ReportBuilderListParams = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ["report-builder", "definitions", params],
    queryFn: async () => {
      const res = await reportBuilder.definitions.$get({
        query: params.entity ? { entity: params.entity } : {},
      });
      return readResponseOrThrow<ReportBuilderDefinition[]>(res as never);
    },
    enabled: options.enabled ?? true,
  });
}

export function useCreateReportDefinition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateReportDefinitionInput) => {
      try {
        const res = await reportBuilder.definitions.$post({ json: data as never });
        const result = await readResponseOrThrow<ReportBuilderDefinition>(res as never);
        captureEvent(ANALYTICS_EVENTS.reportBuilderDefinitionSaved, reportBuilderProperties(data));
        return result;
      } catch (error) {
        captureReportBuilderFailure(error, "definition_save", data);
        throw error;
      }
    },
    onSuccess: () => invalidateReportBuilder(queryClient),
  });
}

export function useUpdateReportDefinition(definitionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: UpdateReportDefinitionInput) => {
      try {
        const res = await reportBuilder.definitions[":definitionId"].$patch({
          param: { definitionId },
          json: data as never,
        });
        return await readResponseOrThrow<ReportBuilderDefinition>(res as never);
      } catch (error) {
        captureReportBuilderFailure(error, "definition_update", data);
        throw error;
      }
    },
    onSuccess: () => invalidateReportBuilder(queryClient),
  });
}

export function useDeleteReportDefinition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (definitionId: string) => {
      try {
        const res = await reportBuilder.definitions[":definitionId"].$delete({
          param: { definitionId },
        });
        return await readResponseOrThrow<{ success: true }>(res as never);
      } catch (error) {
        captureReportBuilderFailure(error, "definition_delete", {});
        throw error;
      }
    },
    onSuccess: () => invalidateReportBuilder(queryClient),
  });
}

export function useReportBuilderPreview() {
  return useMutation({
    mutationFn: async (data: ReportBuilderPreviewInput) => {
      try {
        const res = await reportBuilder.preview.$post({ json: data as never });
        const result = await readResponseOrThrow<ReportBuilderPreview>(res as never);
        captureEvent(ANALYTICS_EVENTS.reportBuilderPreviewGenerated, {
          ...reportBuilderProperties(data),
          limit_bucket: countBucket(data.limit),
          total_rows_bucket: countBucket(result.totalRows),
        });
        return result;
      } catch (error) {
        captureReportBuilderFailure(error, "preview", data);
        throw error;
      }
    },
  });
}

export function useRunReportDefinition() {
  const queryClient = useQueryClient();
  const attemptsRef = useRef(createRetryAttemptRegistry());
  return useMutation({
    mutationFn: async (
      data: Omit<ReportBuilderRunInput, "attemptId"> & { definitionId: string },
    ) => {
      const { definitionId, ...payload } = data;
      const activeEntityId =
        typeof window === "undefined" ? null : localStorage.getItem(ACTIVE_ENTITY_STORAGE_KEY);
      const payloadKey = JSON.stringify([
        activeEntityId,
        definitionId,
        payload.title?.trim() || null,
      ]);
      const attemptId = attemptsRef.current.take(payloadKey);
      try {
        const res = await reportBuilder.definitions[":definitionId"].run.$post({
          param: { definitionId },
          json: { ...payload, attemptId },
        });
        return await readResponseOrThrow(res);
      } catch (error) {
        attemptsRef.current.retain(payloadKey, attemptId);
        captureReportBuilderFailure(error, "export", {});
        throw error;
      }
    },
    onSuccess: () => invalidateReportBuilder(queryClient),
  });
}
