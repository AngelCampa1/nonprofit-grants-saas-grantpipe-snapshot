import { hc } from "hono/client";
import type { AppType } from "@grantpipe/api";
import { getActiveOrgHeaders } from "./org-context";

export { ACTIVE_ORG_STORAGE_KEY } from "./org-context";

type ApiClient = ReturnType<typeof hc<AppType>>;

export function createApiClient(): ApiClient {
  return hc<AppType>("/", {
    // headers at the top level merges into headerValues before Content-Type is set,
    // so it does not overwrite the computed Content-Type: application/json header.
    // Passing headers inside init would spread after headers and overwrite Content-Type.
    headers: getActiveOrgHeaders,
    init: {
      credentials: "include",
    },
  });
}

export const api: ApiClient = createApiClient();
