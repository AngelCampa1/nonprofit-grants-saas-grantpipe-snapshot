import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { readResponseOrThrow } from "../lib/http-response";

const PORTAL_BASE = "/api/public/portal";
const PORTAL_RESOURCE_STALE_TIME = 1000 * 60 * 5;

const portalKeys = {
  session: ["portal-session"] as const,
  resources: ["portal-resource"] as const,
  resource: (sessionId: string, resourceType: string, id: string) =>
    [...portalKeys.resources, sessionId, resourceType, id] as const,
};

const legacyPortalResourcePrefixes = [
  "portal-grant",
  "portal-fund",
  "portal-program",
  "portal-restriction-term",
  "portal-document",
  "portal-bundle",
  "portal-generated-report",
] as const;

function isPortalResourceQuery(queryKey: readonly unknown[]): boolean {
  const root = queryKey[0];
  return root === portalKeys.resources[0] || legacyPortalResourcePrefixes.includes(root as never);
}

function purgePortalResourceQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.removeQueries({ queryKey: portalKeys.resources });
  for (const prefix of legacyPortalResourcePrefixes) {
    queryClient.removeQueries({ queryKey: [prefix] });
  }
}

function cancelPortalResourceQueries(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.cancelQueries({
    predicate: (query) => isPortalResourceQuery(query.queryKey),
  });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PortalReviewer = {
  id: string;
  email: string;
  name: string;
  reviewerType: string;
  organizationName?: string | null;
};

export type PortalSession = {
  id: string;
  purpose: string;
  expiresAt: string;
  revokedAt: string | null;
  orgId: string;
};

export type PortalScope = {
  id: string;
  sessionId: string;
  scopeType: string;
  scopeId: string;
  scopeName?: string | null;
};

export type PortalMe = {
  reviewer: PortalReviewer;
  session: PortalSession;
  scopes: PortalScope[];
};

type PortalSessionCache = PortalMe | null;

// ---------------------------------------------------------------------------
// Hook: usePortalSession
// ---------------------------------------------------------------------------

export function usePortalSession() {
  return useQuery({
    queryKey: portalKeys.session,
    queryFn: async (): Promise<PortalSessionCache> => {
      const response = await fetch(`${PORTAL_BASE}/me`, {
        credentials: "include",
      });
      return readResponseOrThrow<PortalMe>(response);
    },
    enabled: true, // always attempt; server returns 401 if no session
    retry: false,
    staleTime: PORTAL_RESOURCE_STALE_TIME,
  });
}

// ---------------------------------------------------------------------------
// Hook: usePortalAuth — exchanges a raw token for a cookie session
// ---------------------------------------------------------------------------

export function usePortalAuth() {
  const queryClient = useQueryClient();

  const authenticate = useMutation({
    onMutate: () => {
      void queryClient.cancelQueries({ queryKey: portalKeys.session });
      queryClient.setQueryData(portalKeys.session, null);
      cancelPortalResourceQueries(queryClient);
      purgePortalResourceQueries(queryClient);
    },
    mutationFn: async (token: string): Promise<PortalMe> => {
      const response = await fetch(`${PORTAL_BASE}/auth`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      return readResponseOrThrow<PortalMe>(response);
    },
    onSuccess: (data) => {
      purgePortalResourceQueries(queryClient);
      queryClient.setQueryData(portalKeys.session, data);
    },
    onError: () => {
      queryClient.setQueryData(portalKeys.session, null);
    },
  });

  return { authenticate };
}

// ---------------------------------------------------------------------------
// Hook: usePortalLogout
// ---------------------------------------------------------------------------

export function usePortalLogout() {
  const queryClient = useQueryClient();

  const logout = useMutation({
    onMutate: () => {
      cancelPortalResourceQueries(queryClient);
    },
    mutationFn: async () => {
      const response = await fetch(`${PORTAL_BASE}/logout`, {
        method: "POST",
        credentials: "include",
      });
      await readResponseOrThrow<{ ok?: boolean }>(response);
    },
    onSuccess: () => {
      purgePortalResourceQueries(queryClient);
      queryClient.removeQueries({ queryKey: portalKeys.session });
    },
  });

  return { logout };
}

// ---------------------------------------------------------------------------
// Hook: usePortalGrant
// ---------------------------------------------------------------------------

function usePortalResource(resourceType: string, id: string, path: string, enabled = true) {
  const portalSession = usePortalSession();
  const sessionId = portalSession.data?.session?.id;

  return useQuery({
    queryKey: portalKeys.resource(sessionId ?? "pending", resourceType, id),
    queryFn: async ({ signal }) => {
      if (!sessionId) throw new Error("Portal session is required before loading portal data.");
      const response = await fetch(`${PORTAL_BASE}/${path}`, {
        credentials: "include",
        signal,
      });
      return readResponseOrThrow<Record<string, unknown>>(response);
    },
    enabled: enabled && Boolean(sessionId),
    staleTime: PORTAL_RESOURCE_STALE_TIME,
  });
}

export function usePortalGrant(id: string, enabled = true) {
  return usePortalResource("grant", id, `grants/${id}`, enabled);
}

// ---------------------------------------------------------------------------
// Hook: usePortalFund
// ---------------------------------------------------------------------------

export function usePortalFund(id: string, enabled = true) {
  return usePortalResource("fund", id, `funds/${id}`, enabled);
}

// ---------------------------------------------------------------------------
// Hook: usePortalProgram
// ---------------------------------------------------------------------------

export function usePortalProgram(id: string, enabled = true) {
  return usePortalResource("program", id, `programs/${id}`, enabled);
}

// ---------------------------------------------------------------------------
// Hook: usePortalRestrictionTerm
// ---------------------------------------------------------------------------

export function usePortalRestrictionTerm(id: string, enabled = true) {
  return usePortalResource("restriction-term", id, `restriction-terms/${id}`, enabled);
}

// ---------------------------------------------------------------------------
// Hook: usePortalDocument
// ---------------------------------------------------------------------------

export function usePortalDocument(id: string, enabled = true) {
  return usePortalResource("document", id, `documents/${id}`, enabled);
}

// ---------------------------------------------------------------------------
// Hook: usePortalBundle
// ---------------------------------------------------------------------------

export function usePortalBundle(id: string, enabled = true) {
  return usePortalResource("bundle", id, `evidence-bundles/${id}`, enabled);
}

// ---------------------------------------------------------------------------
// Hook: usePortalGeneratedReport
// ---------------------------------------------------------------------------

export function usePortalGeneratedReport(id: string, enabled = true) {
  return usePortalResource("generated-report", id, `generated-reports/${id}`, enabled);
}

// ---------------------------------------------------------------------------
// Helper: days until expiry
// ---------------------------------------------------------------------------

export function daysUntilExpiry(expiresAt: string): number {
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

// ---------------------------------------------------------------------------
// Helper: document download URL
// ---------------------------------------------------------------------------

export function portalDocumentDownloadUrl(documentId: string): string {
  return `${PORTAL_BASE}/documents/${documentId}/download`;
}

// ---------------------------------------------------------------------------
// Helper: generated-report download URL
// ---------------------------------------------------------------------------

export function portalGeneratedReportDownloadUrl(reportId: string): string {
  return `${PORTAL_BASE}/generated-reports/${reportId}/download`;
}
