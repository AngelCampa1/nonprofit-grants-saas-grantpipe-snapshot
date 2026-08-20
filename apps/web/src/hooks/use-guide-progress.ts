import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GuideKey, GuideProgressRow, UpdateGuideProgressInput } from "@grantpipe/shared";
import { api } from "../lib/api-client";

const help = api.api.help;

async function readResponseOrThrow<T>(response: Response): Promise<T> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    if (typeof payload === "object" && payload !== null) {
      const record = payload as Record<string, unknown>;
      if (typeof record.error === "string" && record.error.trim().length > 0) {
        throw new Error(record.error);
      }
      if (typeof record.message === "string" && record.message.trim().length > 0) {
        throw new Error(record.message);
      }
    }
    throw new Error("Request failed");
  }

  return payload as T;
}

export function useGuideProgress() {
  return useQuery({
    queryKey: ["guide-progress"],
    queryFn: async () => {
      const response = await help.progress.$get();
      return readResponseOrThrow<GuideProgressRow[]>(response);
    },
  });
}

export function useGuideProgressMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { guideKey: GuideKey; data: UpdateGuideProgressInput }) => {
      const response = await help.progress[":guideKey"].$patch({
        param: { guideKey: params.guideKey },
        json: params.data,
      });
      return readResponseOrThrow<GuideProgressRow>(response);
    },
    onMutate: async (params) => {
      await queryClient.cancelQueries({ queryKey: ["guide-progress"] });
      const previous = queryClient.getQueryData<GuideProgressRow[]>(["guide-progress"]) ?? [];
      const now = new Date().toISOString();
      const nextRow: GuideProgressRow = {
        guideKey: params.guideKey,
        status: params.data.status,
        lastStep: params.data.lastStep ?? null,
        completedAt: params.data.status === "completed" ? now : null,
        dismissedAt: params.data.status === "dismissed" ? now : null,
        updatedAt: now,
      };
      queryClient.setQueryData<GuideProgressRow[]>(
        ["guide-progress"],
        [...previous.filter((row) => row.guideKey !== params.guideKey), nextRow],
      );
      return { previous };
    },
    onError: (_error, _params, context) => {
      queryClient.setQueryData(["guide-progress"], context?.previous ?? []);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["guide-progress"] });
    },
  });
}
