import type { FeatureKnowledge } from "@grantpipe/shared/knowledge";
import type { FeatureArea, Role } from "@grantpipe/shared";
import { FEATURE_AREAS, getDefaultPermissionsForRole, ROLE_LABELS, ROLES } from "@grantpipe/shared";

/**
 * Keep only the feature-knowledge entries a member with `memberRole` may reach.
 *
 * - `undefined` means "no role context" (e.g. an internal preview) and returns
 *   the full set unfiltered.
 * - `null` means a request with no membership; only role-agnostic features
 *   (those without a `roles` allow-list) survive.
 * - A concrete role keeps role-agnostic features plus any feature whose
 *   allow-list includes that role.
 */
export function filterFeaturesByRole(
  features: FeatureKnowledge[],
  memberRole: Role | null | undefined,
): FeatureKnowledge[] {
  if (memberRole === undefined) {
    return features;
  }
  return features.filter(
    (feature) => !feature.roles || (memberRole !== null && feature.roles.includes(memberRole)),
  );
}

// These are `type` aliases rather than `interface`s on purpose: object-literal
// type aliases get an implicit index signature, so they remain assignable to the
// worker's recursive `StableJsonValue` context payload. Interfaces would not.
export type TeachingHowtoStep = {
  n: number;
  instruction: string;
  screen: string;
  button: string;
  path: string;
};

export type TeachingHowto = {
  id: string;
  goal: string;
  prerequisites: string[] | undefined;
  steps: TeachingHowtoStep[];
};

export type TeachingConcept = {
  term: string;
  plainDefinition: string;
  whyItMatters: string;
  path: string;
};

export type TeachingFaq = {
  question: string;
  answer: string;
  path: string;
};

export type TeachingFields = {
  concepts: TeachingConcept[];
  howtos: TeachingHowto[];
  faqs: TeachingFaq[];
};

// Ordered most-specific-first so a settings sub-route resolves to its own area
// before falling through to the general `settings` catch-all. A KB `route` is
// the screen the how-to teaches; we map it to the permission area that gates
// write actions on that screen so the assistant never tells a user a role can
// do something the permission model forbids.
const ROUTE_AREA_RULES: ReadonlyArray<readonly [string, FeatureArea]> = [
  ["/settings/team", "team"],
  ["/settings/billing", "billing"],
  ["/settings", "settings"],
  ["/donors", "donors"],
  ["/grants", "grants"],
  ["/funds", "funds"],
  ["/events", "events"],
  ["/documents", "documents"],
  ["/compliance", "compliance"],
  ["/programs", "programs"],
  ["/accounting", "accounting"],
  ["/import", "import"],
  ["/reports", "reports"],
  ["/payments", "payments"],
];

/**
 * Resolve the permission `FeatureArea` that gates write actions on a screen
 * route, or `undefined` for navigation-only screens (dashboard, radar, help)
 * that have no write-gated area of their own.
 */
export function featureAreaForRoute(route: string): FeatureArea | undefined {
  for (const [prefix, area] of ROUTE_AREA_RULES) {
    if (route === prefix || route.startsWith(`${prefix}/`)) {
      return area;
    }
  }
  return undefined;
}

const AREA_LABELS: Record<FeatureArea, string> = {
  donors: "donors",
  grants: "grants",
  funds: "funds",
  events: "events",
  documents: "documents",
  compliance: "compliance",
  programs: "programs",
  accounting: "accounting",
  import: "imports",
  reports: "reports",
  payments: "payments",
  settings: "settings",
  billing: "billing",
  team: "the team",
};

/** Join a short list with an Oxford-comma final conjunction. */
function formatList(items: string[], conjunction: "or" | "and"): string {
  if (items.length === 1) {
    return items[0] ?? "";
  }
  if (items.length === 2) {
    return `${items[0]} ${conjunction} ${items[1]}`;
  }
  return `${items.slice(0, -1).join(", ")}, ${conjunction} ${items[items.length - 1]}`;
}

function roleLabelsFor(roles: readonly Role[]): string[] {
  return roles.map((role) => ROLE_LABELS[role]);
}

function rolesWhoChange(area: FeatureArea): Role[] {
  return ROLES.filter((role) => {
    const level = getDefaultPermissionsForRole(role)[area];
    return level === "edit" || level === "manage";
  });
}

function rolesWhoViewOnly(area: FeatureArea): Role[] {
  return ROLES.filter((role) => getDefaultPermissionsForRole(role)[area] === "view");
}

/**
 * Build the prerequisite lines for a how-to. When the screen maps to a write
 * area we state action permission straight from the permission map: who can add
 * or change things, and (separately) who can only look. When it does not map to
 * a write area we fall back to a plain screen-open note for gated routes.
 */
function buildPrerequisites(feature: FeatureKnowledge): string[] | undefined {
  const area = featureAreaForRoute(feature.route);
  if (area) {
    // A screen may gate navigation tighter than its permission area (for
    // example a donor sub-screen open only to admin/editor even though viewers
    // can view donors in general). Intersect both role sets with the screen's
    // own allow-list so we never name a role that cannot even open the screen.
    const allowList = feature.roles;
    const reaches = (role: Role): boolean => !allowList || allowList.includes(role);
    const changeRoles = rolesWhoChange(area).filter(reaches);
    const viewOnlyRoles = rolesWhoViewOnly(area).filter(reaches);
    const lines: string[] = [];
    if (changeRoles.length > 0) {
      lines.push(
        `Only ${formatList(roleLabelsFor(changeRoles), "or")} can add or change things here.`,
      );
    }
    if (viewOnlyRoles.length > 0) {
      lines.push(
        `${formatList(roleLabelsFor(viewOnlyRoles), "and")} can look here but cannot change anything.`,
      );
    }
    // A gated screen whose allow-list excludes every change role still needs a
    // clear access note rather than an empty list.
    if (lines.length === 0 && allowList) {
      return [`Only ${formatList(roleLabelsFor(allowList), "or")} can open this screen.`];
    }
    return lines;
  }
  if (feature.roles) {
    return [`Only ${formatList(roleLabelsFor(feature.roles), "or")} can open this screen.`];
  }
  return undefined;
}

/**
 * Project curated feature knowledge into the prompt-stuffed teaching fields the
 * AI-CS app context exposes: step-by-step how-tos, plain-language concepts, and
 * disambiguating FAQs derived from each screen's `notFeatures`.
 */
export function buildTeachingFields(features: FeatureKnowledge[]): TeachingFields {
  const howtos: TeachingHowto[] = features.map((feature) => ({
    id: feature.key,
    goal: `${feature.title}: ${feature.what}`,
    prerequisites: buildPrerequisites(feature),
    steps: feature.how.map((step, index) => ({
      n: index + 1,
      instruction: step.action,
      screen: feature.title,
      button: step.label,
      path: feature.route,
    })),
  }));

  const concepts: TeachingConcept[] = features.map((feature) => ({
    term: feature.title,
    plainDefinition: feature.what,
    whyItMatters: feature.why,
    path: feature.route,
  }));

  const faqs: TeachingFaq[] = features.flatMap((feature) =>
    (feature.notFeatures ?? []).map((notFeature) => ({
      question: `Is the ${feature.title} screen where I do this: ${notFeature}`,
      answer: `No. ${notFeature}`,
      path: feature.route,
    })),
  );

  return { concepts, howtos, faqs };
}

function buildRoleAnswer(role: Role): string {
  const label = ROLE_LABELS[role];
  const article = /^[AEIOU]/.test(label) ? "An" : "A";
  const perms = getDefaultPermissionsForRole(role);
  const changeAreas = FEATURE_AREAS.filter(
    (area) => perms[area] === "edit" || perms[area] === "manage",
  );
  const viewAreas = FEATURE_AREAS.filter((area) => perms[area] === "view");
  const noneAreas = FEATURE_AREAS.filter((area) => perms[area] === "none");

  // A role that can manage every area is simplest stated plainly.
  if (changeAreas.length === FEATURE_AREAS.length) {
    return `${article} ${label} can do everything. That means add, change, and delete records, import data, run reports, and manage the team and billing.`;
  }

  const sentences: string[] = [];
  if (changeAreas.length > 0) {
    sentences.push(
      `${article} ${label} can add or change ${formatList(changeAreas.map((a) => AREA_LABELS[a]), "and")}.`,
    );
  } else {
    sentences.push(`${article} ${label} cannot add or change anything.`);
  }
  if (viewAreas.length > 0) {
    sentences.push(
      `${article} ${label} can also view ${formatList(viewAreas.map((a) => AREA_LABELS[a]), "and")}.`,
    );
  }
  if (noneAreas.length > 0) {
    sentences.push(
      `${article} ${label} cannot open ${formatList(noneAreas.map((a) => AREA_LABELS[a]), "or")}.`,
    );
  }
  return sentences.join(" ");
}

/**
 * Build one capability FAQ per role, derived from the permission map so the
 * assistant can answer "what can a viewer do?" without guessing. These are the
 * single source of truth for role answers and stay in sync as permissions
 * change.
 */
export function buildRoleCapabilityFaqs(): TeachingFaq[] {
  return ROLES.map((role) => ({
    question: `What can ${/^[AEIOU]/.test(ROLE_LABELS[role]) ? "an" : "a"} ${ROLE_LABELS[role]} do in GrantPipe?`,
    answer: buildRoleAnswer(role),
    path: "/settings/team",
  }));
}
