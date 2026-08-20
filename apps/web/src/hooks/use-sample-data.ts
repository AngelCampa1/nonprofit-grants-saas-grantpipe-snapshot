import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api-client";
import { captureQueryError } from "../lib/sentry";
import { readResponseOrThrow } from "../lib/http-response";

export type SampleDataStatus = {
  seeded: boolean;
  recordCount: number;
};

type SeedResult = {
  seeded: true;
  recordCount: number;
};

type ClearResult = {
  cleared: boolean;
  recordCount: number;
};

/**
 * Fetches whether sample data is currently seeded and how many records exist.
 * Errors are forwarded to Sentry with a feature tag before being rethrown.
 */
export function useSampleDataStatus() {
  return useQuery({
    queryKey: ["sample-data-status"],
    queryFn: async (): Promise<SampleDataStatus> => {
      try {
        const res = await api.api["sample-data"].status.$get();
        return (await readResponseOrThrow<unknown>(res)) as SampleDataStatus;
      } catch (error) {
        captureQueryError(error, "query", { feature: "sample_data" });
        throw error;
      }
    },
  });
}

/**
 * Seeds the org with a representative set of sample data.
 * On success: invalidates sample-data-status, dashboard-overview, and the
 * affected list queries. The sample_data_seeded analytics event is emitted
 * server-side (apps/api sample-data routes) so the record-count bucket is
 * recorded once from a single authoritative source.
 */
export function useSeedSampleData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<SeedResult> => {
      const res = await api.api["sample-data"].$post();
      return (await readResponseOrThrow<unknown>(res)) as SeedResult;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sample-data-status"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
      void queryClient.invalidateQueries({ queryKey: ["grants"] });
      void queryClient.invalidateQueries({ queryKey: ["funds"] });
    },
    onError: (error) => {
      captureQueryError(error, "mutation", { feature: "sample_data_seed" });
    },
  });
}

/**
 * Removes all sample data from the org.
 * On success: invalidates sample-data-status, dashboard-overview, and the
 * affected list queries. The sample_data_cleared analytics event is emitted
 * server-side (apps/api sample-data routes) so it is recorded once.
 */
export function useClearSampleData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<ClearResult> => {
      const res = await api.api["sample-data"].$delete();
      return (await readResponseOrThrow<unknown>(res)) as ClearResult;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sample-data-status"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
      void queryClient.invalidateQueries({ queryKey: ["grants"] });
      void queryClient.invalidateQueries({ queryKey: ["funds"] });
    },
    onError: (error) => {
      captureQueryError(error, "mutation", { feature: "sample_data_clear" });
    },
  });
}
