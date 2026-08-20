import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateCustomFieldDefinitionInput,
  CustomFieldEntityType,
  CustomFieldType,
  UpdateCustomFieldDefinitionInput,
} from "@grantpipe/shared";
import { ApiError } from "../lib/http-response";
import { createOrgRequestInit } from "../lib/org-context";

export type CustomFieldDefinition = {
  id: string;
  orgId: string;
  entityType: CustomFieldEntityType;
  name: string;
  fieldType: CustomFieldType;
  options: string[] | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

async function readOrThrow<T>(response: Response): Promise<T> {
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

export function useCustomFieldDefinitions(entityType: CustomFieldEntityType) {
  return useQuery({
    queryKey: ["custom-field-definitions", entityType],
    queryFn: async () => {
      const response = await fetch(
        `/api/org/custom-fields?entityType=${encodeURIComponent(entityType)}`,
        createOrgRequestInit(),
      );
      return readOrThrow<CustomFieldDefinition[]>(response);
    },
  });
}

function invalidateCustomFieldCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  entityType: CustomFieldEntityType,
) {
  void queryClient.invalidateQueries({
    queryKey: ["custom-field-definitions", entityType],
  });
  void queryClient.invalidateQueries({ queryKey: ["custom-fields"] });
}

export function useCreateCustomFieldDefinition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCustomFieldDefinitionInput) => {
      const response = await fetch(
        "/api/org/custom-fields",
        createOrgRequestInit({
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        }),
      );
      return readOrThrow<CustomFieldDefinition>(response);
    },
    onSuccess: (created) => {
      invalidateCustomFieldCaches(queryClient, created.entityType);
    },
  });
}

export function useUpdateCustomFieldDefinition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      definitionId: string;
      entityType: CustomFieldEntityType;
      data: UpdateCustomFieldDefinitionInput;
    }) => {
      const response = await fetch(
        `/api/org/custom-fields/${encodeURIComponent(params.definitionId)}`,
        createOrgRequestInit({
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(params.data),
        }),
      );
      return readOrThrow<CustomFieldDefinition>(response);
    },
    onSuccess: (_data, variables) => {
      invalidateCustomFieldCaches(queryClient, variables.entityType);
    },
  });
}

export function useDeleteCustomFieldDefinition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { definitionId: string; entityType: CustomFieldEntityType }) => {
      const response = await fetch(
        `/api/org/custom-fields/${encodeURIComponent(params.definitionId)}`,
        createOrgRequestInit({ method: "DELETE" }),
      );
      if (!response.ok) {
        await readOrThrow<unknown>(response);
      }
      return params;
    },
    onSuccess: (_data, variables) => {
      invalidateCustomFieldCaches(queryClient, variables.entityType);
    },
  });
}
