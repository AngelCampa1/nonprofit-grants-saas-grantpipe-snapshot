import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { captureEvent } from "../lib/analytics";
import { createOrgRequestInit } from "../lib/org-context";
import { ApiError } from "../lib/http-response";
import { invalidateOverview } from "../lib/overview-invalidation";
import { captureAppException } from "../lib/sentry";
import { useReportAiUsageCap } from "../components/dialogs/ai-usage-cap-provider";

export type DocumentExtractionField = {
  id: string;
  fieldKey: string;
  section: string;
  destinationEntityType: string;
  destinationField: string;
  valueJson: unknown;
  normalizedValueJson?: unknown;
  confidence: number;
  status: string;
  required: boolean;
  sources?: Array<{ pageNumber?: number | null; snippet: string }>;
};

export type DocumentExtractionDetail = {
  id: string;
  documentId: string;
  createdGrantId?: string | null;
  status: string;
  failureMessage?: string | null;
  fields?: DocumentExtractionField[];
};

export function isActiveDocumentExtractionStatus(status: string | undefined): boolean {
  return (
    status === "pending" ||
    status === "processing" ||
    status === "provider_result_pending" ||
    status === "committing"
  );
}

type DocumentExtractionActionPayload = {
  fieldId: string;
  action: "accept" | "edit" | "reject" | "defer" | "map_existing";
  nextValue?: unknown;
  mappedEntityType?: string;
  mappedEntityId?: string;
  note?: string;
};

type DocumentExtractionCommitPayload = {
  funderDecision: { action: "create_new" } | { action: "map_existing"; existingId: string };
  grantDecision: { action: "create_new" } | { action: "map_existing"; existingId: string };
  requiredGrantBasics: {
    name: string;
    amountCents?: number;
    startDate?: string;
    endDate?: string;
  };
};

function getExtractionFailureType(error: unknown): string {
  return error instanceof ApiError ? "api_error" : "unknown_error";
}

function captureAwardIntakeFailure(stage: string, error: unknown): void {
  captureEvent("award_intake_failed", {
    stage,
    failure_type: getExtractionFailureType(error),
  });
}

function extractLocalErrorCode(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const p = payload as Record<string, unknown>;
  return typeof p["errorCode"] === "string" && p["errorCode"].length > 0
    ? p["errorCode"]
    : undefined;
}

async function readResponseOrThrow<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? ((await response.json().catch(() => undefined)) as unknown)
    : await response.text().catch(() => undefined);

  if (!response.ok) {
    if (payload && typeof payload === "object" && "error" in payload) {
      const message = String((payload as { error: unknown }).error);
      throw new ApiError(message, response.status, extractLocalErrorCode(payload), payload);
    }
    throw new ApiError("Request failed", response.status, undefined, payload ?? undefined);
  }

  return payload as T;
}

export function useStartDocumentExtraction() {
  const queryClient = useQueryClient();
  const reportAiUsageCap = useReportAiUsageCap();
  const legacyAttemptIds = useRef(new Map<string, string>());

  return useMutation({
    mutationFn: async (input: string | { documentId: string; attemptId: string }) => {
      let request: { documentId: string; attemptId: string };
      if (typeof input === "string") {
        const stableAttemptId = legacyAttemptIds.current.get(input) ?? crypto.randomUUID();
        legacyAttemptIds.current.set(input, stableAttemptId);
        request = { documentId: input, attemptId: stableAttemptId };
      } else {
        request = input;
      }
      try {
        const response = await fetch(
          "/api/document-extractions",
          createOrgRequestInit({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
          }),
        );
        const result = await readResponseOrThrow<{ id: string; status: string }>(response);
        captureEvent("award_intake_started", {
          intake_surface: "document_extraction",
          status: result.status,
        });
        return result;
      } catch (error) {
        captureAwardIntakeFailure("start", error);
        if (!reportAiUsageCap(error)) {
          captureAppException(error, {
            tags: { feature: "award_intake", operation: "start" },
          });
        }
        throw error;
      }
    },
    onSuccess: (extraction, input) => {
      if (typeof input === "string") {
        legacyAttemptIds.current.delete(input);
      }
      void queryClient.invalidateQueries({ queryKey: ["document-extraction", extraction.id] });
    },
  });
}

export function useDocumentExtraction(extractionId: string) {
  return useQuery({
    queryKey: ["document-extraction", extractionId],
    queryFn: async () => {
      const response = await fetch(
        `/api/document-extractions/${encodeURIComponent(extractionId)}`,
        createOrgRequestInit(),
      );
      return readResponseOrThrow<DocumentExtractionDetail>(response);
    },
    enabled: extractionId.length > 0,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return isActiveDocumentExtractionStatus(status) ? 2_500 : false;
    },
  });
}

export function useRecordDocumentExtractionAction(extractionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: DocumentExtractionActionPayload) => {
      try {
        const response = await fetch(
          `/api/document-extractions/${encodeURIComponent(extractionId)}/actions`,
          createOrgRequestInit({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }),
        );
        const result = await readResponseOrThrow<{ id: string }>(response);
        captureEvent("award_intake_field_actioned", {
          action: payload.action,
          field_destination_type: payload.mappedEntityType ?? "unknown",
        });
        return result;
      } catch (error) {
        captureAwardIntakeFailure("field_action", error);
        throw error;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["document-extraction", extractionId] });
    },
  });
}

export function useCommitDocumentExtraction(extractionId: string) {
  const queryClient = useQueryClient();
  const reportAiUsageCap = useReportAiUsageCap();

  return useMutation({
    mutationFn: async (payload: DocumentExtractionCommitPayload) => {
      try {
        const response = await fetch(
          `/api/document-extractions/${encodeURIComponent(extractionId)}/commit`,
          createOrgRequestInit({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }),
        );
        const result = await readResponseOrThrow<{ grantId: string; funderId: string }>(response);
        captureEvent("award_intake_committed", {
          funder_decision: payload.funderDecision.action,
          grant_decision: payload.grantDecision.action,
        });
        return result;
      } catch (error) {
        captureAwardIntakeFailure("commit", error);
        if (!reportAiUsageCap(error)) {
          captureAppException(error, {
            tags: { feature: "award_intake", operation: "commit" },
          });
        }
        throw error;
      }
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["document-extraction", extractionId] });
      void queryClient.invalidateQueries({ queryKey: ["grants"] });
      void queryClient.invalidateQueries({ queryKey: ["grant", result.grantId] });
      // Committing an award document creates a grant (and, on create_new, a
      // funder), so refresh the same caches useCreateGrant and the funder
      // mutations do — the pipeline board, the dashboard overview's grant/
      // deadline metrics, and the funders list — or those views show the new
      // grant and funder as missing right after intake.
      void queryClient.invalidateQueries({ queryKey: ["grant-pipeline"] });
      invalidateOverview(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["funders"] });
      // The committed grant is tied to the created-or-reused funder, which getFunder
      // embeds via { grants: true } and the funder "Grant History" tab renders from
      // the ["funder", id] query. Refresh the funder detail caches too — the
      // ["funder"] prefix covers every open funder detail page — or that tab omits
      // the just-committed grant until a reload (mirrors useCreateGrant).
      void queryClient.invalidateQueries({ queryKey: ["funder"] });
      // Committing an award intake inserts reporting_requirement rows whose
      // dueDates the calendar embeds as deadline items (calendar-overview is
      // built from reportingRequirements[].dueDate). Refresh it too — every
      // other grant-creation path already does — or those deadlines stay
      // missing from the calendar until a reload.
      void queryClient.invalidateQueries({ queryKey: ["calendar-overview"] });
    },
  });
}
