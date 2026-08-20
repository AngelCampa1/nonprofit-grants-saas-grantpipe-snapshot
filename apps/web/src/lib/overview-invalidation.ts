import type { QueryClient } from "@tanstack/react-query";

type OverviewQueryClient = Pick<QueryClient, "invalidateQueries">;

export function invalidateOverview(queryClient: OverviewQueryClient) {
  // Must match the dashboard query key in use-overview.ts (`useDashboardOverview`).
  // invalidateQueries is prefix-matched, and ["overview"] does NOT prefix ["dashboard-overview"],
  // so this key has to be exact or grant/donor mutations never refresh the dashboard.
  void queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
}
