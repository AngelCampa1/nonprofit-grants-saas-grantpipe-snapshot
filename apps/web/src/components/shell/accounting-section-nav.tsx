import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@grantpipe/ui";
import type {
  FeatureArea,
  PermissionLevel,
  PermissionMap,
  PermissionOverrides,
} from "@grantpipe/shared";

import { isNavItemVisible } from "../../config/nav";
import { editorUpRoles, readOnlyRoles, type AppRole } from "../../lib/access-control";
import { captureEvent } from "../../lib/analytics";

export interface AccountingNavEntry {
  to: string;
  label: string;
  roles?: AppRole[];
  feature?: FeatureArea;
  minimumPermission?: Exclude<PermissionLevel, "none">;
  requiredPermissions?: Array<{
    feature: FeatureArea;
    minimumPermission: Exclude<PermissionLevel, "none">;
  }>;
}

// The 14 accounting module destinations, gated the same way the single
// `Accounting` row in `navSections` (config/nav.ts) is gated, plus the
// orphaned `/accounting/integrations` route, which is not on the main
// sidebar but is reachable here so it stays consistent with the module's
// permission model. `destinations.ts` reuses this array (group: "Accounting")
// so every one of these pages stays searchable from the command palette.
export const ACCOUNTING_SECTIONS: AccountingNavEntry[] = [
  {
    to: "/accounting",
    label: "Overview",
    roles: [...readOnlyRoles],
    feature: "accounting",
    minimumPermission: "view",
  },
  {
    to: "/accounting/chart-of-accounts",
    label: "Chart of Accounts",
    roles: [...readOnlyRoles],
    feature: "accounting",
    minimumPermission: "view",
  },
  {
    to: "/accounting/journal",
    label: "Journal",
    roles: [...readOnlyRoles],
    feature: "accounting",
    minimumPermission: "view",
  },
  {
    to: "/accounting/ledger",
    label: "Ledger",
    roles: [...readOnlyRoles],
    feature: "accounting",
    minimumPermission: "view",
  },
  {
    to: "/accounting/trial-balance",
    label: "Trial Balance",
    roles: [...readOnlyRoles],
    feature: "accounting",
    minimumPermission: "view",
    requiredPermissions: [
      { feature: "accounting", minimumPermission: "view" },
      { feature: "reports", minimumPermission: "view" },
    ],
  },
  {
    to: "/accounting/periods",
    label: "Fiscal Periods",
    roles: [...readOnlyRoles],
    feature: "accounting",
    minimumPermission: "view",
  },
  {
    to: "/accounting/recurring",
    label: "Recurring",
    roles: [...readOnlyRoles],
    feature: "accounting",
    minimumPermission: "view",
  },
  {
    to: "/accounting/reports/financial-position",
    label: "Financial Position",
    roles: [...readOnlyRoles],
    feature: "accounting",
    minimumPermission: "view",
    requiredPermissions: [
      { feature: "accounting", minimumPermission: "view" },
      { feature: "reports", minimumPermission: "view" },
    ],
  },
  {
    to: "/accounting/reports/activities",
    label: "Statement of Activities",
    roles: [...readOnlyRoles],
    feature: "accounting",
    minimumPermission: "view",
    requiredPermissions: [
      { feature: "accounting", minimumPermission: "view" },
      { feature: "reports", minimumPermission: "view" },
    ],
  },
  {
    to: "/accounting/reports/functional-expenses",
    label: "Functional Expenses",
    roles: [...readOnlyRoles],
    feature: "accounting",
    minimumPermission: "view",
    requiredPermissions: [
      { feature: "accounting", minimumPermission: "view" },
      { feature: "reports", minimumPermission: "view" },
    ],
  },
  {
    to: "/accounting/bank",
    label: "Bank Accounts",
    roles: [...readOnlyRoles],
    feature: "accounting",
    minimumPermission: "view",
  },
  {
    to: "/accounting/integrations",
    label: "Integrations",
    roles: [...readOnlyRoles],
    feature: "accounting",
    minimumPermission: "view",
  },
  {
    to: "/accounting/anomalies",
    label: "Anomaly Detector",
    roles: [...readOnlyRoles],
    feature: "accounting",
    minimumPermission: "view",
  },
  {
    to: "/accounting/studios/functional-expense-allocation",
    label: "Allocation Studio",
    roles: [...editorUpRoles],
    feature: "accounting",
    minimumPermission: "manage",
    requiredPermissions: [{ feature: "accounting", minimumPermission: "manage" }],
  },
];

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function navLinkClassName(isActive: boolean): string {
  return cn(
    "block rounded-full px-3 py-1.5 text-sm transition-colors hover:bg-muted hover:text-foreground",
    isActive ? "bg-muted font-medium text-foreground" : "text-muted-foreground",
  );
}

export interface AccountingSectionNavProps {
  role: AppRole | undefined;
  permissions?: PermissionOverrides | PermissionMap | null;
  className?: string;
}

export function AccountingSectionNav({ role, permissions, className }: AccountingSectionNavProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const normalizedPath = pathname.replace(/\/+$/, "") || "/accounting";

  const visibleEntries = ACCOUNTING_SECTIONS.filter((entry) =>
    isNavItemVisible(entry, role, permissions),
  );

  // Active state rules mirror AppSidebar: exact match wins; otherwise fall back
  // to the longest `to` that is a true parent prefix of the current path, so a
  // child route like `/accounting/journal/new` still highlights "Journal".
  const exactMatch = visibleEntries.find((entry) => entry.to === normalizedPath);
  const prefixMatch = exactMatch
    ? null
    : visibleEntries
        .filter((entry) => normalizedPath.startsWith(`${entry.to}/`))
        .sort((a, b) => b.to.length - a.to.length)[0];
  const activeTo = exactMatch?.to ?? prefixMatch?.to;

  return (
    <nav aria-label="Accounting sections" className={cn("space-y-1", className)}>
      {visibleEntries.map((entry) => {
        const isActive = entry.to === activeTo;
        return (
          <Link
            key={entry.to}
            to={entry.to}
            aria-current={isActive ? "page" : undefined}
            className={navLinkClassName(isActive)}
            onClick={() => {
              captureEvent("app_nav_item_clicked", {
                nav_item: entry.label,
                nav_item_id: slugify(entry.label),
                destination_path: entry.to,
                nav_area: "accounting_module",
                section: "Accounting",
              });
            }}
          >
            {entry.label}
          </Link>
        );
      })}
    </nav>
  );
}
