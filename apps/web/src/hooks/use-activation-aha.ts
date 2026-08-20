import { useEffect } from "react";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import { captureEvent } from "../lib/analytics";

/** In-memory guard prevents double-firing within a single session even when localStorage is unavailable. */
const firedOrgIds = new Set<string>();

function storageKey(orgId: string): string {
  return `gp:activation:${orgId}`;
}

/**
 * Fires the PostHog "activation_first_value_viewed" event exactly once per org per browser.
 * - Guarded by localStorage so repeat visits never re-fire.
 * - Guarded by an in-memory Set so the event never fires twice in the same JS session.
 * - All localStorage access is wrapped in try/catch so private-mode or unavailable storage
 *   never breaks render.
 */
export function useActivationAha(orgId: string | null | undefined): void {
  useEffect(() => {
    if (!orgId) return;

    // In-memory guard: already fired this session.
    if (firedOrgIds.has(orgId)) return;

    const key = storageKey(orgId);

    // Persistent guard: already fired in a previous session.
    try {
      if (localStorage.getItem(key) !== null) return;
    } catch {
      // localStorage unavailable (private mode, SSR, security error).
      // Treat as "not yet fired" and fall through to fire the event below.
    }

    // Mark in-memory first so a double render in the same tick won't duplicate.
    firedOrgIds.add(orgId);

    captureEvent(ANALYTICS_EVENTS.activationFirstValueViewed, {});

    // Best-effort write — swallow any storage error so it never breaks render.
    try {
      localStorage.setItem(key, "1");
    } catch {
      // setItem can throw in private mode or when storage is full.
    }
  }, [orgId]);
}
