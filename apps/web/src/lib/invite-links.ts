const INVITE_PATH_PREFIX = "/app/invite";
const INVITE_ROUTE_PREFIX = "/invite";

function normalizeInviteToken(token?: string | null): string | null {
  const value = token?.trim();
  return value && value.length > 0 ? value : null;
}

export function buildInvitePath(token?: string | null): string | null {
  const normalizedToken = normalizeInviteToken(token);
  return normalizedToken ? `${INVITE_PATH_PREFIX}/${encodeURIComponent(normalizedToken)}` : null;
}

export function buildInviteRoutePath(token?: string | null): string | null {
  const normalizedToken = normalizeInviteToken(token);
  return normalizedToken ? `${INVITE_ROUTE_PREFIX}/${encodeURIComponent(normalizedToken)}` : null;
}

export function buildInviteUrl(token?: string | null, origin?: string): string | null {
  const path = buildInvitePath(token);
  if (!path) {
    return null;
  }

  const resolvedOrigin = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${resolvedOrigin}${path}`;
}
