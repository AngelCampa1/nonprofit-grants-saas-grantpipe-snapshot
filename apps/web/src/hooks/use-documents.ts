import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DocumentEntityType } from "@grantpipe/shared";
import { api } from "../lib/api-client";
import { captureEvent } from "../lib/analytics";
import { getDocumentSizeBucket } from "../lib/document-analytics";
import { ApiError } from "../lib/http-response";
import { createOrgRequestInit } from "../lib/org-context";
import { captureAppException } from "../lib/sentry";
import { useReportAiUsageCap } from "../components/dialogs/ai-usage-cap-provider";

type DocumentRecord = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  uploadedBy?: string | null;
};

type DocumentsResponse = {
  data: DocumentRecord[];
  total: number;
  page: number;
  pageSize: number;
};

const documents = api.api.documents;

function getDocumentUploadFailureType(error: unknown): string {
  return error instanceof ApiError ? "api_error" : "unknown_error";
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
  let payload: unknown;

  if (contentType.includes("application/json")) {
    try {
      payload = (await response.json()) as unknown;
    } catch {
      payload = undefined;
    }
  } else {
    try {
      payload = await response.text();
    } catch {
      payload = undefined;
    }
  }

  if (!response.ok) {
    if (typeof payload === "object" && payload !== null) {
      const record = payload as Record<string, unknown>;
      if (typeof record.error === "string" && record.error.trim().length > 0) {
        throw new ApiError(record.error, response.status, extractLocalErrorCode(payload), payload);
      }
      if (typeof record.message === "string" && record.message.trim().length > 0) {
        throw new ApiError(
          record.message,
          response.status,
          extractLocalErrorCode(payload),
          payload,
        );
      }
    }

    if (typeof payload === "string" && payload.trim().length > 0) {
      throw new ApiError(payload, response.status, undefined, payload);
    }

    throw new ApiError("Request failed", response.status, undefined, payload ?? undefined);
  }

  return payload as T;
}

export function useEntityDocuments(entityType: DocumentEntityType, entityId: string) {
  return useQuery({
    queryKey: ["documents", entityType, entityId],
    queryFn: async () => {
      const response = await documents.$get({
        query: {
          entityType,
          entityId,
          page: "1",
          pageSize: "25",
          sortBy: "createdAt",
          sortOrder: "desc",
        },
      });

      return readResponseOrThrow<DocumentsResponse>(response);
    },
    enabled: entityType.length > 0 && entityId.length > 0,
  });
}

export function useUploadDocument(entityType: DocumentEntityType, entityId: string) {
  const queryClient = useQueryClient();
  const reportAiUsageCap = useReportAiUsageCap();

  return useMutation({
    mutationFn: async (file: File) => {
      const analyticsProperties = {
        entity_type: entityType,
        mime_type: file.type || "unknown",
        size_bucket: getDocumentSizeBucket(file.size),
      };
      const formData = new FormData();
      formData.append("entityType", entityType);
      formData.append("entityId", entityId);
      formData.append("file", file);

      try {
        const response = await fetch(
          "/api/documents",
          createOrgRequestInit({ method: "POST", body: formData }),
        );

        const result = await readResponseOrThrow<{ id: string }>(response);
        captureEvent("document_uploaded", analyticsProperties);
        return result;
      } catch (error) {
        captureEvent("document_upload_failed", {
          ...analyticsProperties,
          failure_type: getDocumentUploadFailureType(error),
        });
        if (!reportAiUsageCap(error)) {
          captureAppException(error, {
            tags: { feature: "award_intake", operation: "upload" },
          });
        }
        throw error;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["documents", entityType, entityId] });
    },
  });
}

export function useDeleteDocument(entityType: DocumentEntityType, entityId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (documentId: string) => {
      const response = await fetch(
        `/api/documents/${documentId}`,
        createOrgRequestInit({ method: "DELETE" }),
      );

      return readResponseOrThrow<unknown>(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["documents", entityType, entityId] });
    },
  });
}
