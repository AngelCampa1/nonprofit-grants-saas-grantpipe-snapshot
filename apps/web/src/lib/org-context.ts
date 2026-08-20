export const ACTIVE_ORG_STORAGE_KEY = "grantpipe.activeOrgId";
export const ACTIVE_ENTITY_STORAGE_KEY = "grantpipe.activeEntityId";

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return { ...headers };
}

export function getActiveOrgHeaders(): Record<string, string> {
  const activeOrgId =
    typeof window !== "undefined" ? localStorage.getItem(ACTIVE_ORG_STORAGE_KEY) : null;
  const activeEntityId =
    typeof window !== "undefined" ? localStorage.getItem(ACTIVE_ENTITY_STORAGE_KEY) : null;

  return {
    ...(activeOrgId ? { "X-Org-Id": activeOrgId } : {}),
    ...(activeEntityId ? { "X-Entity-Id": activeEntityId } : {}),
  };
}

export function clearActiveOrgSelection() {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
  localStorage.removeItem(ACTIVE_ENTITY_STORAGE_KEY);
}

export function clearActiveEntitySelection() {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem(ACTIVE_ENTITY_STORAGE_KEY);
}

export function createOrgRequestInit(init: RequestInit = {}): RequestInit {
  return {
    ...init,
    credentials: "include",
    headers: {
      ...normalizeHeaders(init.headers),
      ...getActiveOrgHeaders(),
    },
  };
}
