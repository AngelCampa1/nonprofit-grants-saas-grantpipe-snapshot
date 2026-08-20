import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CustomFieldEntityType } from "@grantpipe/shared";
import { ApiError } from "../lib/http-response";
import { createOrgRequestInit } from "../lib/org-context";

type CustomFieldDefinition = {
  id: string;
  name: string;
  fieldType: string;
  options: string[] | null;
};

type CustomFieldValue = {
  id: string;
  fieldId: string;
  entityId: string;
  value: string;
} | null;

export type CustomFieldValueRecord = {
  definition: CustomFieldDefinition;
  value: CustomFieldValue;
};

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
        throw new ApiError(record.error, response.status);
      }
      if (typeof record.message === "string" && record.message.trim().length > 0) {
        throw new ApiError(record.message, response.status);
      }
    }

    if (typeof payload === "string" && payload.trim().length > 0) {
      throw new ApiError(payload, response.status);
    }

    throw new ApiError("Request failed", response.status);
  }

  return payload as T;
}

export function useEntityCustomFields(entityType: CustomFieldEntityType, entityId: string) {
  return useQuery({
    queryKey: ["custom-fields", entityType, entityId],
    queryFn: async () => {
      const response = await fetch(
        `/api/org/custom-fields/${entityType}/${entityId}/values`,
        createOrgRequestInit(),
      );
      return readResponseOrThrow<CustomFieldValueRecord[]>(response);
    },
    enabled: entityType.length > 0 && entityId.length > 0,
  });
}

export function useUpsertCustomFieldValue(entityType: CustomFieldEntityType, entityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ fieldId, value }: { fieldId: string; value: string }) => {
      const response = await fetch(
        `/api/org/custom-fields/${entityType}/${entityId}/values/${fieldId}`,
        createOrgRequestInit({
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ value }),
        }),
      );
      return readResponseOrThrow<CustomFieldValueRecord>(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["custom-fields", entityType, entityId] });
    },
  });
}
