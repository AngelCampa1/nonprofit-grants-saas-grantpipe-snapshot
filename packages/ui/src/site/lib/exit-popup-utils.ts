export const SUPPRESS_KEY = "exit-popup-suppressed";
export const SIGNED_UP_KEY = "exit-popup-signed-up";
export const LEAD_MAGNET_DELIVERED_PREFIX = "lead-magnet-delivered:";
export const SUPPRESS_DAYS = 30;

interface LeadMagnetDelivery {
  email: string;
}

/** Returns true if the user has already signed up via the exit popup */
export function isSignedUp(): boolean {
  try {
    return localStorage.getItem(SIGNED_UP_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Returns true if the popup was dismissed within the last `days` days.
 * Reads a timestamp from localStorage (set by setSuppressed).
 */
export function isWithinSuppressWindow(days: number): boolean {
  try {
    const raw = localStorage.getItem(SUPPRESS_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    if (isNaN(ts)) return false;
    return Date.now() - ts < days * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

/** Records the current timestamp as the dismissal time */
export function setSuppressed(): void {
  try {
    localStorage.setItem(SUPPRESS_KEY, String(Date.now()));
  } catch {
    // storage unavailable — ignore
  }
}

/** Records that the user signed up via the exit popup */
export function setSignedUp(): void {
  try {
    localStorage.setItem(SIGNED_UP_KEY, "true");
  } catch {
    // storage unavailable — ignore
  }
}

export function buildLeadMagnetDeliveryKey(slug: string): string {
  return `${LEAD_MAGNET_DELIVERED_PREFIX}${slug}`;
}

export function getLeadMagnetDelivery(slug?: string): LeadMagnetDelivery | null {
  if (!slug) return null;

  try {
    const raw = localStorage.getItem(buildLeadMagnetDeliveryKey(slug));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { email?: unknown } | null;
    if (!parsed || typeof parsed !== "object") return null;

    return {
      email: typeof parsed.email === "string" ? parsed.email : "",
    };
  } catch {
    return null;
  }
}

export function setLeadMagnetDelivered(slug: string | undefined, email: string): void {
  if (!slug) return;

  try {
    localStorage.setItem(buildLeadMagnetDeliveryKey(slug), JSON.stringify({ email }));
  } catch {
    // storage unavailable — ignore
  }
}

/**
 * Returns true if the user has scrolled back up enough to trigger the popup.
 * @param currentY - current window.scrollY
 * @param peakY - highest scrollY reached this session
 * @param scrolledDownThreshold - minimum scroll down before detection activates
 * @param scrollBackThreshold - how much they must scroll back up
 */
export function detectScrollBack(
  currentY: number,
  peakY: number,
  scrolledDownThreshold: number,
  scrollBackThreshold: number,
): boolean {
  return peakY >= scrolledDownThreshold && peakY - currentY >= scrollBackThreshold;
}
