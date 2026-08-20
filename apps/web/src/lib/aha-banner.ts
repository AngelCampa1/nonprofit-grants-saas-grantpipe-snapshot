import { ONBOARDING_GOALS, type OnboardingGoal } from "@grantpipe/shared";

const PREFIX = "gp:aha-banner:";

export function ahaBannerStorageKey(orgId: string): string {
  return `${PREFIX}${orgId}`;
}

function isGoal(value: unknown): value is OnboardingGoal {
  return typeof value === "string" && (ONBOARDING_GOALS as readonly string[]).includes(value);
}

export function markAhaBannerPending(orgId: string, goal: OnboardingGoal): void {
  try {
    localStorage.setItem(ahaBannerStorageKey(orgId), goal);
  } catch {
    // storage unavailable (private mode / quota) — banner is best-effort
  }
}

export function readPendingAhaGoal(orgId: string | null | undefined): OnboardingGoal | null {
  if (!orgId) return null;
  try {
    const raw = localStorage.getItem(ahaBannerStorageKey(orgId));
    return isGoal(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function clearAhaBannerPending(orgId: string | null | undefined): void {
  if (!orgId) return;
  try {
    localStorage.removeItem(ahaBannerStorageKey(orgId));
  } catch {
    // ignore
  }
}

// One neutral message that reads correctly on every route. The banner mounts
// globally above the app <Outlet/>, so copy that names a specific entity (e.g.
// "your funds") would be false on unrelated pages like Notifications. The goal
// is still tracked for behavior/analytics, but it no longer changes the text.
const SAMPLE_DATA_MESSAGE =
  "We added sample data to your account. It shows how GrantPipe works. Clear it anytime.";

export function ahaBannerCopy(_goal?: OnboardingGoal | null): string {
  return SAMPLE_DATA_MESSAGE;
}
