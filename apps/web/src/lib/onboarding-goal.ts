import type { GuideKey, OnboardingGoal } from "@grantpipe/shared";

/**
 * Returns the aha-moment route for a given onboarding goal.
 * - grants   → /funds        (restricted fund tracking is the grants aha moment)
 * - compliance → /reports    (compliance/reporting lives at /reports, no /compliance route)
 * - donors   → /dashboard
 * - null/unknown → /dashboard
 */
export function ahaRouteForGoal(goal: OnboardingGoal | null | undefined): string {
  switch (goal) {
    case "grants":
      return "/funds";
    case "compliance":
      return "/reports";
    case "donors":
      return "/dashboard";
    default:
      return "/dashboard";
  }
}

/**
 * The five checklist guide keys shown in the onboarding checklist.
 * These are a subset of all GuideKey values — only the ones surfaced in the
 * onboarding checklist UI.
 */
const DEFAULT_CHECKLIST_ORDER: GuideKey[] = [
  "first_setup",
  "import_contacts",
  "create_grant",
  "generate_report",
  "open_pdf_report",
];

const DONOR_FIRST_ORDER: GuideKey[] = [
  "import_contacts",
  "first_setup",
  "create_grant",
  "generate_report",
  "open_pdf_report",
];

const GRANT_FIRST_ORDER: GuideKey[] = [
  "create_grant",
  "import_contacts",
  "first_setup",
  "generate_report",
  "open_pdf_report",
];

/**
 * Returns an ordered permutation of the five onboarding checklist guide keys,
 * personalised to the user's declared goal.
 *
 * - donors     → import_contacts first (donor-first flow)
 * - grants     → create_grant first (grant-first flow)
 * - compliance → create_grant first (compliance mirrors the grant-first flow)
 * - null/unknown → default order
 *
 * All five keys are always present in the returned array — no key is dropped.
 */
export function checklistOrderForGoal(goal: OnboardingGoal | null | undefined): GuideKey[] {
  switch (goal) {
    case "donors":
      return DONOR_FIRST_ORDER;
    case "grants":
    case "compliance":
      return GRANT_FIRST_ORDER;
    default:
      return DEFAULT_CHECKLIST_ORDER;
  }
}
