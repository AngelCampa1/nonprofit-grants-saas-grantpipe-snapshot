import { useQuery } from "@tanstack/react-query";
import type { ActivityEntityType } from "@grantpipe/shared";
import { api } from "../lib/api-client";
import { ApiError } from "../lib/http-response";

type OrgActivityFilters = {
  entityType?: ActivityEntityType;
  actorId?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
  sortOrder?: "asc" | "desc";
};

export type ActivityRecord = {
  id: string;
  action: string;
  entityType: ActivityEntityType;
  entityId: string;
  entityLabel?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  changes?: Record<string, unknown> | null;
  createdAt: string;
};

type ActivityResponse = {
  data: ActivityRecord[];
  total: number;
  page: number;
  pageSize: number;
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

export function useEntityActivity(entityType: ActivityEntityType, entityId: string) {
  return useQuery({
    queryKey: ["activity", entityType, entityId],
    queryFn: async () => {
      const response = await api.api.activity.$get({
        query: {
          entityType,
          entityId,
          page: "1",
          pageSize: "25",
        },
      });

      return readResponseOrThrow<ActivityResponse>(response);
    },
    enabled: entityType.length > 0 && entityId.length > 0,
  });
}

export function useOrgActivity(filters: OrgActivityFilters) {
  const { entityType, actorId, fromDate, toDate, page = 1, pageSize = 25, sortOrder } = filters;

  return useQuery({
    queryKey: ["org-activity", entityType, actorId, fromDate, toDate, page, pageSize, sortOrder],
    queryFn: async () => {
      const response = await api.api.activity.org.$get({
        query: {
          page: String(page),
          pageSize: String(pageSize),
          ...(entityType !== undefined && { entityType }),
          ...(actorId !== undefined && { actorId }),
          ...(fromDate !== undefined && { fromDate }),
          ...(toDate !== undefined && { toDate }),
          ...(sortOrder !== undefined && { sortOrder }),
        },
      });
      return readResponseOrThrow<ActivityResponse>(response);
    },
  });
}
