import { useQuery } from "@tanstack/react-query";
import type {
  RadarObligation,
  RadarObligationKind,
  RadarObligationStatus,
  RadarUrgencyBand,
} from "@grantpipe/shared";
import { api } from "../lib/api-client";
import { readResponseOrThrow } from "../lib/http-response";

const deadlines = api.api.deadlines;

/** Server response shape for `GET /api/deadlines`. */
export type RadarResponse = {
  asOf: string;
  bands: Record<RadarUrgencyBand, RadarObligation[]>;
  totals: Record<string, number>;
};

export type DeadlineRadarFilters = {
  horizonDays?: number;
  kinds?: RadarObligationKind[];
  status?: RadarObligationStatus;
  includeResolved?: boolean;
};

/**
 * Builds the query string the RPC client sends. Query values must be strings;
 * `kinds` is comma-joined and empty/undefined optionals are omitted so the
 * server falls back to its defaults.
 */
export function buildDeadlineRadarQuery(filters: DeadlineRadarFilters): Record<string, string> {
  const query: Record<string, string> = {};
  if (typeof filters.horizonDays === "number") {
    query.horizonDays = String(filters.horizonDays);
  }
  if (filters.kinds && filters.kinds.length > 0) {
    query.kinds = filters.kinds.join(",");
  }
  if (filters.status) {
    query.status = filters.status;
  }
  if (filters.includeResolved) {
    query.includeResolved = "true";
  }
  return query;
}

export function useDeadlineRadar(filters: DeadlineRadarFilters = {}) {
  const query = buildDeadlineRadarQuery(filters);
  return useQuery({
    queryKey: ["deadline-radar", query],
    queryFn: async (): Promise<RadarResponse> => {
      const res = await deadlines.$get({ query });
      return readResponseOrThrow<RadarResponse>(res);
    },
  });
}
