import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ANALYTICS_EVENTS,
  type CreateCorrectiveActionInput,
  type CreateFindingInput,
  type CreateMonitoringLogInput,
  type CreateRiskAssessmentInput,
  type CreateSubawardInput,
  type CreateSubrecipientInput,
  type GenerateMonitoringTasksInput,
  type SubrecipientListParams,
  type UpdateCorrectiveActionInput,
  type UpdateFindingInput,
  type UpdateMonitoringTaskInput,
  type UpdateSubawardInput,
  type UpdateSubrecipientInput,
} from "@grantpipe/shared";
import { api } from "../lib/api-client";
import { captureEvent } from "../lib/analytics";
import { readResponseOrThrow, throwIfNotOk } from "../lib/http-response";
import { onMutationError } from "../lib/mutation-error";

const subrecipients = api.api.subrecipients;

export type SubrecipientPortfolioRow = {
  id: string;
  name: string;
  uei?: string | null;
  status: string;
  ownerId?: string | null;
  primaryContactId?: string | null;
  highestRiskRating?: "low" | "medium" | "high" | null;
  subawardCount: number;
  activeSubawardCount: number;
  openTaskCount: number;
  overdueTaskCount: number;
  openFindingCount: number;
};

export type SubawardMonitoringRow = {
  id: string;
  subrecipientId: string;
  grantId: string;
  title: string;
  subawardNumber?: string | null;
  amountCents: number;
  startDate: string;
  endDate: string;
  status: string;
  scopeSummary?: string | null;
  riskRating?: string | null;
  openTaskCount?: number;
  overdueTaskCount?: number;
  openFindingCount?: number;
};

type MonitoringTask = {
  id: string;
  subawardId: string;
  title: string;
  description?: string | null;
  dueDate: string;
  status: string;
  ownerId?: string | null;
  evidenceDocumentId?: string | null;
};

type MonitoringLog = {
  id: string;
  subawardId: string;
  logType: string;
  title: string;
  occurredAt: string;
  summary: string;
};

type Finding = {
  id: string;
  subawardId: string;
  title: string;
  severity: string;
  status: string;
  description: string;
};

type CorrectiveAction = {
  id: string;
  findingId: string;
  title: string;
  dueDate: string;
  status: string;
};

export type SubrecipientDetail = {
  subrecipient: {
    id: string;
    name: string;
    uei?: string | null;
    status: string;
    notes?: string | null;
  };
  subawards: SubawardMonitoringRow[];
  riskAssessments: Array<{
    id: string;
    subawardId: string;
    suggestedRiskRating: string;
    finalRiskRating: string;
    overrideReason?: string | null;
    assessedAt: string;
  }>;
  monitoringTasks: MonitoringTask[];
  monitoringLogs: MonitoringLog[];
  findings: Finding[];
  correctiveActions: CorrectiveAction[];
  documents: Array<{ id: string; filename: string; entityType: string; entityId: string }>;
};

type EvidenceBundleResult = {
  bundle: { id: string; title: string };
  items: Array<{ id: string; itemType: string; itemId: string; caption?: string | null }>;
};

function queryBoolean(value: boolean | undefined) {
  return value === undefined ? undefined : value ? "true" : "false";
}

function enumProperty(key: string, value: unknown): Record<string, string> {
  return typeof value === "string" && value.trim().length > 0 ? { [key]: value } : {};
}

type RiskAssessmentAnalyticsInput = {
  finalRiskRating?: unknown;
  suggestedRiskRating?: unknown;
};

type TaskGenerationAnalyticsInput = {
  riskRating?: unknown;
};

function hasTaskRiskRating(
  value: RiskAssessmentAnalyticsInput | TaskGenerationAnalyticsInput,
): value is TaskGenerationAnalyticsInput {
  return Object.prototype.hasOwnProperty.call(value, "riskRating");
}

function riskRatingProperty(
  value: RiskAssessmentAnalyticsInput | TaskGenerationAnalyticsInput,
): Record<string, string> {
  if (hasTaskRiskRating(value)) {
    return enumProperty("risk_rating", value.riskRating);
  }
  return enumProperty("risk_rating", value.finalRiskRating ?? value.suggestedRiskRating);
}

type SubrecipientQueryOptions = {
  enabled?: boolean;
};

export type SubrecipientPortfolioSummary = {
  subrecipients: number;
  overdueTasks: number;
  openFindings: number;
  highRisk: number;
};

export function useSubrecipients(
  params: SubrecipientListParams,
  options: SubrecipientQueryOptions = {},
) {
  return useQuery({
    queryKey: ["subrecipients", params],
    queryFn: async (): Promise<{
      data: SubrecipientPortfolioRow[];
      total: number;
      summary: SubrecipientPortfolioSummary;
    }> => {
      const res = await subrecipients.$get({
        query: {
          page: String(params.page),
          pageSize: String(params.pageSize),
          ...(params.status ? { status: params.status } : {}),
          ...(params.riskRating ? { riskRating: params.riskRating } : {}),
          ...(params.ownerId ? { ownerId: params.ownerId } : {}),
          ...(params.grantId ? { grantId: params.grantId } : {}),
          ...(params.search ? { search: params.search } : {}),
          ...(params.overdueTasks !== undefined
            ? { overdueTasks: queryBoolean(params.overdueTasks) }
            : {}),
          ...(params.openFindings !== undefined
            ? { openFindings: queryBoolean(params.openFindings) }
            : {}),
        },
      });
      return readResponseOrThrow<{
        data: SubrecipientPortfolioRow[];
        total: number;
        summary: SubrecipientPortfolioSummary;
      }>(res);
    },
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

export function useSubrecipient(subrecipientId: string, options: SubrecipientQueryOptions = {}) {
  return useQuery({
    queryKey: ["subrecipient", subrecipientId],
    queryFn: async (): Promise<SubrecipientDetail> => {
      const res = await subrecipients[":subrecipientId"].$get({
        param: { subrecipientId },
      });
      return readResponseOrThrow<SubrecipientDetail>(res);
    },
    enabled: subrecipientId.trim().length > 0 && (options.enabled ?? true),
  });
}

export function useSubawards(
  params: { grantId?: string; subrecipientId?: string },
  options: SubrecipientQueryOptions = {},
) {
  return useQuery({
    queryKey: ["subawards", params],
    queryFn: async (): Promise<{ data: SubawardMonitoringRow[] }> => {
      const res = await subrecipients.subawards.$get({
        query: {
          ...(params.grantId ? { grantId: params.grantId } : {}),
          ...(params.subrecipientId ? { subrecipientId: params.subrecipientId } : {}),
        },
      });
      return readResponseOrThrow<{ data: SubawardMonitoringRow[] }>(res);
    },
    enabled: Boolean(params.grantId || params.subrecipientId) && (options.enabled ?? true),
  });
}

export function useSubrecipientMutations(subrecipientId?: string) {
  const queryClient = useQueryClient();

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["subrecipients"] });
    void queryClient.invalidateQueries({ queryKey: ["subawards"] });
    if (subrecipientId) {
      void queryClient.invalidateQueries({ queryKey: ["subrecipient", subrecipientId] });
    }
  }

  return {
    createSubrecipient: useMutation({
      mutationFn: async (data: CreateSubrecipientInput) => {
        const res = await subrecipients.$post({ json: data as never });
        return readResponseOrThrow(res);
      },
      onSuccess: () => {
        captureEvent(ANALYTICS_EVENTS.subrecipientCreated);
        invalidate();
      },
      onError: onMutationError,
    }),
    updateSubrecipient: useMutation({
      mutationFn: async (data: UpdateSubrecipientInput) => {
        if (!subrecipientId) throw new Error("Subrecipient id is required.");
        const res = await subrecipients[":subrecipientId"].$patch({
          param: { subrecipientId },
          json: data as never,
        });
        return readResponseOrThrow(res);
      },
      onSuccess: (_data, variables) => {
        captureEvent(
          ANALYTICS_EVENTS.subrecipientUpdated,
          enumProperty("status", variables.status),
        );
        invalidate();
      },
      onError: onMutationError,
    }),
    deleteSubrecipient: useMutation({
      mutationFn: async () => {
        if (!subrecipientId) throw new Error("Subrecipient id is required.");
        const res = await subrecipients[":subrecipientId"].$delete({
          param: { subrecipientId },
        });
        await throwIfNotOk(res);
      },
      onSuccess: () => {
        captureEvent(ANALYTICS_EVENTS.subrecipientDeleted);
        invalidate();
      },
      onError: onMutationError,
    }),
    createSubaward: useMutation({
      mutationFn: async (data: CreateSubawardInput) => {
        if (!subrecipientId) throw new Error("Subrecipient id is required.");
        const res = await subrecipients[":subrecipientId"].subawards.$post({
          param: { subrecipientId },
          json: data as never,
        });
        return readResponseOrThrow(res);
      },
      onSuccess: () => {
        captureEvent(ANALYTICS_EVENTS.subawardCreated);
        invalidate();
      },
      onError: onMutationError,
    }),
  };
}

export function useSubawardMonitoringMutations(subawardId: string) {
  const queryClient = useQueryClient();

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["subrecipients"] });
    void queryClient.invalidateQueries({ queryKey: ["subrecipient"] });
    void queryClient.invalidateQueries({ queryKey: ["subawards"] });
  }

  return {
    updateSubaward: useMutation({
      mutationFn: async (data: UpdateSubawardInput) => {
        const res = await subrecipients.subawards[":subawardId"].$patch({
          param: { subawardId },
          json: data as never,
        });
        return readResponseOrThrow(res);
      },
      onSuccess: (_data, variables) => {
        captureEvent(ANALYTICS_EVENTS.subawardUpdated, enumProperty("status", variables.status));
        invalidate();
      },
      onError: onMutationError,
    }),
    createRiskAssessment: useMutation({
      mutationFn: async (data: CreateRiskAssessmentInput) => {
        const res = await subrecipients.subawards[":subawardId"]["risk-assessments"].$post({
          param: { subawardId },
          json: data as never,
        });
        return readResponseOrThrow(res);
      },
      onSuccess: (_data, variables) => {
        captureEvent(ANALYTICS_EVENTS.subawardRiskAssessmentCreated, riskRatingProperty(variables));
        invalidate();
      },
      onError: onMutationError,
    }),
    generateTasks: useMutation({
      mutationFn: async (data: GenerateMonitoringTasksInput) => {
        const res = await subrecipients.subawards[":subawardId"]["monitoring-tasks"].generate.$post(
          {
            param: { subawardId },
            json: data as never,
          },
        );
        return readResponseOrThrow(res);
      },
      onSuccess: (_data, variables) => {
        captureEvent(
          ANALYTICS_EVENTS.subawardMonitoringTasksGenerated,
          riskRatingProperty(variables),
        );
        invalidate();
      },
      onError: onMutationError,
    }),
    createMonitoringLog: useMutation({
      mutationFn: async (data: CreateMonitoringLogInput) => {
        const res = await subrecipients.subawards[":subawardId"]["monitoring-logs"].$post({
          param: { subawardId },
          json: data as never,
        });
        return readResponseOrThrow(res);
      },
      onSuccess: (_data, variables) => {
        captureEvent(
          ANALYTICS_EVENTS.subawardMonitoringLogCreated,
          enumProperty("log_type", variables.logType),
        );
        invalidate();
      },
      onError: onMutationError,
    }),
    createFinding: useMutation({
      mutationFn: async (data: CreateFindingInput) => {
        const res = await subrecipients.subawards[":subawardId"].findings.$post({
          param: { subawardId },
          json: data as never,
        });
        return readResponseOrThrow(res);
      },
      onSuccess: (_data, variables) => {
        captureEvent(
          ANALYTICS_EVENTS.subawardFindingCreated,
          enumProperty("severity", variables.severity),
        );
        invalidate();
      },
      onError: onMutationError,
    }),
    createEvidenceBundle: useMutation({
      mutationFn: async (): Promise<EvidenceBundleResult> => {
        const res = await subrecipients.subawards[":subawardId"]["evidence-bundle"].$post({
          param: { subawardId },
        });
        return readResponseOrThrow(res);
      },
      onSuccess: () => {
        captureEvent(ANALYTICS_EVENTS.subawardEvidenceBundleCreated);
        invalidate();
      },
      onError: onMutationError,
    }),
  };
}

export function useSubrecipientRecordMutations() {
  const queryClient = useQueryClient();

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["subrecipients"] });
    void queryClient.invalidateQueries({ queryKey: ["subrecipient"] });
    void queryClient.invalidateQueries({ queryKey: ["subawards"] });
  }

  return {
    updateTask: useMutation({
      mutationFn: async (params: { taskId: string; data: UpdateMonitoringTaskInput }) => {
        const res = await subrecipients["monitoring-tasks"][":taskId"].$patch({
          param: { taskId: params.taskId },
          json: params.data as never,
        });
        return readResponseOrThrow(res);
      },
      onSuccess: (_data, variables) => {
        captureEvent(
          ANALYTICS_EVENTS.monitoringTaskUpdated,
          enumProperty("status", variables.data.status),
        );
        invalidate();
      },
      onError: onMutationError,
    }),
    updateFinding: useMutation({
      mutationFn: async (params: { findingId: string; data: UpdateFindingInput }) => {
        const res = await subrecipients.findings[":findingId"].$patch({
          param: { findingId: params.findingId },
          json: params.data as never,
        });
        return readResponseOrThrow(res);
      },
      onSuccess: (_data, variables) => {
        captureEvent(
          ANALYTICS_EVENTS.findingUpdated,
          enumProperty("status", variables.data.status),
        );
        invalidate();
      },
      onError: onMutationError,
    }),
    createCorrectiveAction: useMutation({
      mutationFn: async (params: { findingId: string; data: CreateCorrectiveActionInput }) => {
        const res = await subrecipients.findings[":findingId"]["corrective-actions"].$post({
          param: { findingId: params.findingId },
          json: params.data as never,
        });
        return readResponseOrThrow(res);
      },
      onSuccess: () => {
        captureEvent(ANALYTICS_EVENTS.correctiveActionCreated);
        invalidate();
      },
      onError: onMutationError,
    }),
    updateCorrectiveAction: useMutation({
      mutationFn: async (params: { actionId: string; data: UpdateCorrectiveActionInput }) => {
        const res = await subrecipients["corrective-actions"][":actionId"].$patch({
          param: { actionId: params.actionId },
          json: params.data as never,
        });
        return readResponseOrThrow(res);
      },
      onSuccess: (_data, variables) => {
        captureEvent(
          ANALYTICS_EVENTS.correctiveActionUpdated,
          enumProperty("status", variables.data.status),
        );
        invalidate();
      },
      onError: onMutationError,
    }),
  };
}
