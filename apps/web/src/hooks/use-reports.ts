import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api-client";
import { readResponseOrThrow } from "../lib/http-response";
import type {
  AcknowledgmentTemplateInput,
  GeneratedReportArtifact,
  GeneratedReportListParams,
  SefaTripwireResult,
} from "@grantpipe/shared";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import { captureEvent } from "../lib/analytics";
import { invalidateOverview } from "../lib/overview-invalidation";

const compliance = api.api.compliance;
const grants = api.api.grants;

type ReportPreview = {
  kind: "html" | "csv";
  title: string;
  content: string;
};

type ReportGrantOption = {
  id: string;
  name: string;
  funderName?: string | null;
  startDate?: string | null;
};

type ReportGrantOptionsResponse = {
  data?: ReportGrantOption[];
  total?: number;
};

type GeneratedReportType =
  | "grant_compliance"
  | "audit_export"
  | "irs_990"
  | "board_report"
  | "sefa"
  | "acknowledgment_letter"
  | "donor_year_end_statement";

type JsonResponse<T> = {
  json: () => Promise<T>;
  ok?: boolean;
  status?: number;
};

function invalidateReports(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["reports"] });
}

async function readGeneratedReportResponse<T>(
  res: JsonResponse<T>,
  reportType: GeneratedReportType,
): Promise<T> {
  try {
    const result = await readResponseOrThrow(res);
    captureEvent(ANALYTICS_EVENTS.reportGenerated, {
      report_type: reportType,
    });
    return result;
  } catch (error) {
    captureEvent(ANALYTICS_EVENTS.reportGenerationFailed, {
      report_type: reportType,
      failure_type: "api_error",
    });
    throw error;
  }
}

type ReportArtifactsQueryOptions = {
  enabled?: boolean;
};

export function useReportArtifacts(
  params: GeneratedReportListParams,
  options?: ReportArtifactsQueryOptions,
) {
  return useQuery({
    queryKey: ["reports", params],
    enabled: options?.enabled,
    queryFn: async () => {
      const res = await compliance.reports.$get({
        query: {
          page: String(params.page),
          pageSize: String(params.pageSize),
          sortBy: params.sortBy,
          sortOrder: params.sortOrder,
          ...(params.type ? { type: params.type } : {}),
          ...(params.status ? { status: params.status } : {}),
        },
      });
      return readResponseOrThrow(res);
    },
  });
}

export function useReportGrantOptions() {
  return useQuery({
    queryKey: ["report-grant-options"],
    queryFn: async () => {
      const grantOptions: ReportGrantOption[] = [];
      const pageSize = 100;
      let page = 1;
      let total = Number.POSITIVE_INFINITY;

      while (grantOptions.length < total) {
        const res = await grants.$get({
          query: {
            page: String(page),
            pageSize: String(pageSize),
            sortBy: "updatedAt",
            sortOrder: "desc",
          },
        });
        const payload = await readResponseOrThrow<ReportGrantOptionsResponse>(res as never);
        const pageItems = payload.data ?? [];

        grantOptions.push(...pageItems);
        total = payload.total ?? grantOptions.length;

        if (pageItems.length < pageSize) {
          break;
        }

        page += 1;
      }

      return grantOptions;
    },
  });
}

export function useReportArtifact(reportId: string) {
  return useQuery({
    queryKey: ["report", reportId],
    queryFn: async () => {
      const res = await compliance.reports[":reportId"].$get({ param: { reportId } });
      return readResponseOrThrow<GeneratedReportArtifact>(res as never);
    },
    enabled: !!reportId,
    refetchInterval: (query) => (query.state.data?.status === "pending" ? 3000 : false),
  });
}

export function useReportPreview(reportId: string) {
  return useQuery({
    queryKey: ["report-preview", reportId],
    queryFn: async () => {
      const res = await compliance.reports[":reportId"].preview.$get({ param: { reportId } });
      return readResponseOrThrow<ReportPreview>(res as never);
    },
    enabled: !!reportId,
  });
}

export function useGenerateGrantComplianceReport(grantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await compliance.reports.compliance.grants[":grantId"].$post({
        param: { grantId },
        json: data as never,
      });
      return readGeneratedReportResponse(res, "grant_compliance");
    },
    onSuccess: () => invalidateReports(queryClient),
  });
}

export function useGenerateAuditReport(fiscalYear: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await compliance.reports.audit["fiscal-years"][":fiscalYear"].$post({
        param: { fiscalYear },
        json: data as never,
      });
      return readGeneratedReportResponse(res, "audit_export");
    },
    onSuccess: () => invalidateReports(queryClient),
  });
}

export function useSefaTripwire(fiscalYear: string, enabled: boolean) {
  return useQuery({
    queryKey: ["reports", "sefa-tripwire", fiscalYear],
    enabled: enabled && fiscalYear.trim().length > 0,
    queryFn: async () => {
      const res = await compliance.reports.sefa.preview.$get({
        query: { fiscalYear },
      });
      return readResponseOrThrow<SefaTripwireResult>(res as never);
    },
  });
}

export function useGenerateSefaReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await compliance.reports.sefa.$post({ json: data as never });
      return readGeneratedReportResponse(res, "sefa");
    },
    onSuccess: () => invalidateReports(queryClient),
  });
}

export function useGenerateIrs990Report() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await compliance.reports["irs-990"].$post({ json: data as never });
      return readGeneratedReportResponse(res, "irs_990");
    },
    onSuccess: () => invalidateReports(queryClient),
  });
}

export function useGenerateBoardReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await compliance.reports.board.$post({ json: data as never });
      return readGeneratedReportResponse(res, "board_report");
    },
    onSuccess: () => {
      invalidateReports(queryClient);
      invalidateOverview(queryClient);
    },
  });
}

export function useGenerateDonorYearEndStatementRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await compliance.reports["donor-year-end-statements"].$post({
        json: data as never,
      });
      return readGeneratedReportResponse(res, "donor_year_end_statement");
    },
    onSuccess: () => invalidateReports(queryClient),
  });
}

export function useGenerateAcknowledgmentLetter(donationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await compliance.reports.acknowledgments.donations[":donationId"].$post({
        param: { donationId },
        json: data as never,
      });
      return readGeneratedReportResponse(res, "acknowledgment_letter");
    },
    onSuccess: () => invalidateReports(queryClient),
  });
}

export function useAcknowledgmentTemplate() {
  return useQuery({
    queryKey: ["acknowledgment-template"],
    queryFn: async () => {
      const res = await compliance.templates.acknowledgment.$get();
      return readResponseOrThrow(res);
    },
  });
}

export function useUpdateAcknowledgmentTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: AcknowledgmentTemplateInput) => {
      const res = await compliance.templates.acknowledgment.$patch({ json: data as never });
      return readResponseOrThrow(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["acknowledgment-template"] });
      invalidateReports(queryClient);
    },
  });
}
