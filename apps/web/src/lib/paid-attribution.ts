export const PAID_ATTRIBUTION_STORAGE_KEY = "grantpipe-paid-attribution";

const PAID_ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ATTRIBUTION_VALUE_LENGTH = 200;

const PAID_ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "msclkid",
  "gclid",
  "ve_product",
  "ve_icp",
  "ve_campaign_id",
  "ve_variant",
  "ve_step",
  "ve_offer",
  "ve_instantly_campaign_id",
  "ve_lead_list_id",
  "ve_sender_pool",
  "ve_sequence_day",
  "ve_branding",
] as const;

type PaidAttributionKey = (typeof PAID_ATTRIBUTION_KEYS)[number];

type PaidAttribution = Partial<Record<PaidAttributionKey, string>>;

type StoredPaidAttribution = {
  capturedAt: number;
  attribution: PaidAttribution;
};

type AttributionInput = Partial<Record<PaidAttributionKey, string | number | undefined>>;

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function removeStoredPaidAttribution(storage: Storage): void {
  try {
    storage.removeItem(PAID_ATTRIBUTION_STORAGE_KEY);
  } catch {
    return;
  }
}

function normalizeAttributionValue(value: string | number | undefined): string | undefined {
  const trimmed = value === undefined ? undefined : String(value).trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, MAX_ATTRIBUTION_VALUE_LENGTH);
}

function normalizeAttribution(input: AttributionInput): PaidAttribution {
  const attribution: PaidAttribution = {};
  for (const key of PAID_ATTRIBUTION_KEYS) {
    const value = normalizeAttributionValue(input[key]);
    if (value !== undefined) {
      attribution[key] = value;
    }
  }
  return attribution;
}

function isStoredPaidAttribution(value: unknown): value is StoredPaidAttribution {
  if (!value || typeof value !== "object") return false;

  const candidate = value as {
    capturedAt?: unknown;
    attribution?: unknown;
  };

  return (
    typeof candidate.capturedAt === "number" &&
    Boolean(candidate.attribution) &&
    typeof candidate.attribution === "object"
  );
}

export function storePaidAttribution(input: AttributionInput): void {
  const attribution = normalizeAttribution(input);
  if (Object.keys(attribution).length === 0) return;

  try {
    getStorage()?.setItem(
      PAID_ATTRIBUTION_STORAGE_KEY,
      JSON.stringify({ capturedAt: Date.now(), attribution }),
    );
  } catch {
    return;
  }
}

export function getStoredPaidAttribution(): PaidAttribution {
  const storage = getStorage();
  if (!storage) return {};

  try {
    const raw = storage.getItem(PAID_ATTRIBUTION_STORAGE_KEY);
    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);
    if (!isStoredPaidAttribution(parsed)) {
      removeStoredPaidAttribution(storage);
      return {};
    }

    if (Date.now() - parsed.capturedAt > PAID_ATTRIBUTION_TTL_MS) {
      removeStoredPaidAttribution(storage);
      return {};
    }

    return normalizeAttribution(parsed.attribution);
  } catch {
    removeStoredPaidAttribution(storage);
    return {};
  }
}

export function mergeStoredPaidAttribution(
  properties?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...getStoredPaidAttribution(),
    ...(properties ?? {}),
  };
}
