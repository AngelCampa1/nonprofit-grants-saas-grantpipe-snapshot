import {
  Activity,
  Bell,
  BookOpen,
  CalendarDays,
  CreditCard,
  FileBarChart,
  Gauge,
  HelpCircle,
  LayoutDashboard,
  PiggyBank,
  Radar,
  Settings,
  Upload,
  Users,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import type {
  FeatureArea,
  PermissionLevel,
  PermissionMap,
  PermissionOverrides,
} from "@grantpipe/shared";
import {
  adminOnlyRoles,
  canAccessFeature,
  editorUpRoles,
  readOnlyRoles,
  standardRoles,
  type AppRole,
} from "../lib/access-control";

export type { AppRole } from "../lib/access-control";

export type NavIcon = ComponentType<SVGProps<SVGSVGElement>>;

export interface NavItem {
  to: string;
  label: string;
  /**
   * Permanent, stable analytics identifier for this nav item. Kebab-case,
   * derived from the item's route at the time it was introduced. Never
   * rename to match a relabeled `label` — this id is what analytics events
   * and dashboards key on, so renaming it breaks historical continuity.
   */
  navItemId: string;
  icon: NavIcon;
  /** Roles permitted to see this nav item. If omitted, all authenticated roles see it. */
  roles?: AppRole[];
  feature?: FeatureArea;
  minimumPermission?: Exclude<PermissionLevel, "none">;
  requiredPermissions?: Array<{
    feature: FeatureArea;
    minimumPermission: Exclude<PermissionLevel, "none">;
  }>;
  /** When true, this item renders pinned at the bottom of the sidebar regardless of section collapse state. */
  pinned?: boolean;
}

export interface NavSection {
  label?: string;
  items: NavItem[];
  /** When true, the section header can be clicked to collapse/expand the items. */
  collapsible?: boolean;
  /** When true, the section starts collapsed on first load (before any localStorage entry exists). */
  defaultCollapsed?: boolean;
}

export const navSections: NavSection[] = [
  {
    items: [
      {
        to: "/dashboard",
        label: "Dashboard",
        navItemId: "dashboard",
        icon: LayoutDashboard,
        roles: [...readOnlyRoles],
        feature: "reports",
        minimumPermission: "view",
      },
    ],
  },
  {
    label: "Fundraising",
    collapsible: true,
    items: [
      {
        to: "/donors",
        label: "Donors",
        navItemId: "donors",
        icon: Users,
        roles: [...readOnlyRoles],
        feature: "donors",
        minimumPermission: "view",
      },
      {
        to: "/events",
        label: "Events",
        navItemId: "events",
        icon: CalendarDays,
        roles: [...standardRoles],
        feature: "events",
        minimumPermission: "view",
      },
    ],
  },
  {
    label: "Grants & Funding",
    collapsible: true,
    items: [
      {
        to: "/grants",
        label: "Grants",
        navItemId: "grants",
        icon: Gauge,
        roles: [...readOnlyRoles],
        feature: "grants",
        minimumPermission: "view",
      },
      {
        to: "/funds",
        label: "Funds",
        navItemId: "funds",
        icon: PiggyBank,
        roles: [...readOnlyRoles],
        feature: "funds",
        minimumPermission: "view",
      },
      {
        to: "/payments",
        label: "Payments",
        navItemId: "payments",
        icon: CreditCard,
        roles: [...readOnlyRoles],
        feature: "payments",
        minimumPermission: "view",
      },
    ],
  },
  {
    label: "Reporting & Compliance",
    collapsible: true,
    items: [
      {
        to: "/reports",
        label: "Reports",
        navItemId: "reports",
        icon: FileBarChart,
        roles: [...readOnlyRoles],
        feature: "reports",
        minimumPermission: "view",
      },
      {
        to: "/deadlines",
        label: "Deadlines",
        navItemId: "deadlines",
        icon: Radar,
        roles: [...readOnlyRoles],
      },
      {
        to: "/activity",
        label: "Activity",
        navItemId: "activity",
        icon: Activity,
        roles: [...standardRoles],
      },
    ],
  },
  {
    label: "Accounting",
    collapsible: true,
    defaultCollapsed: true,
    items: [
      {
        to: "/accounting",
        label: "Accounting",
        navItemId: "accounting",
        icon: BookOpen,
        roles: [...readOnlyRoles],
        feature: "accounting",
        minimumPermission: "view",
      },
    ],
  },
  {
    label: "Workspace",
    collapsible: true,
    items: [
      {
        to: "/import",
        label: "Import",
        navItemId: "import",
        icon: Upload,
        roles: [...editorUpRoles],
        feature: "import",
        minimumPermission: "edit",
      },
      {
        to: "/notifications",
        label: "Notifications",
        navItemId: "notifications",
        icon: Bell,
        roles: [...standardRoles],
      },
      {
        to: "/settings",
        label: "Settings",
        navItemId: "settings",
        icon: Settings,
        roles: [...adminOnlyRoles],
      },
      {
        to: "/help",
        label: "Help",
        navItemId: "help",
        icon: HelpCircle,
        roles: [...readOnlyRoles],
        pinned: true,
      },
    ],
  },
];

/**
 * @deprecated Use `filterNavForAccess` — it handles both role-based and
 * permission-override filtering. This wrapper delegates to it with no overrides,
 * which falls back to role-default behaviour.
 */
export function filterNavForRole(role: AppRole | undefined, sections: NavSection[] = navSections) {
  return filterNavForAccess(role, null, sections);
}

/**
 * Determines whether a single nav item is visible to a role/permission
 * combination. Precedence order:
 *   1. `requiredPermissions` (every entry must pass `canAccessFeature`)
 *   2. `feature` + `minimumPermission` (single `canAccessFeature` check)
 *   3. `roles` array membership
 *   4. visible by default when none of the above are present
 *
 * When `role` is undefined, every item is visible — callers that need to
 * short-circuit unfiltered rendering for an undefined role (e.g.
 * `filterNavForAccess`) may still do so themselves, but this function is
 * safe to call directly with an undefined role as well.
 */
export function isNavItemVisible(
  item: Pick<NavItem, "roles" | "feature" | "minimumPermission" | "requiredPermissions">,
  role: AppRole | undefined,
  permissions?: PermissionOverrides | PermissionMap | null,
): boolean {
  if (!role) return true;

  if (item.requiredPermissions) {
    return item.requiredPermissions.every((requirement) =>
      canAccessFeature(role, permissions, requirement.feature, requirement.minimumPermission),
    );
  }
  if (item.feature && item.minimumPermission) {
    return canAccessFeature(role, permissions, item.feature, item.minimumPermission);
  }
  return !item.roles || item.roles.includes(role);
}

export function filterNavForAccess(
  role: AppRole | undefined,
  permissions?: PermissionOverrides | PermissionMap | null,
  sections: NavSection[] = navSections,
) {
  if (!role) return sections;
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => isNavItemVisible(item, role, permissions)),
    }))
    .filter((section) => section.items.length > 0);
}

export function flattenNavItems(sections: NavSection[] = navSections): NavItem[] {
  return sections.flatMap((s) => s.items);
}

export const NAV_ITEM_COUNT = flattenNavItems().length;
