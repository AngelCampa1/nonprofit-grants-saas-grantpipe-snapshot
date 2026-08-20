import type { FeatureArea, PermissionLevel } from "@grantpipe/shared";

import { navSections, type AppRole, type NavIcon, type NavSection } from "./nav";
import {
  donorTabs,
  grantsTabs,
  fundsTabs,
  reportsTabs,
  deadlinesTabs,
  type AppPageTabItem,
} from "./page-tabs";
import { Compass } from "lucide-react";

import { ACCOUNTING_SECTIONS } from "../components/shell/accounting-section-nav";

// Safety net for destinations whose sidebar anchor row is ever removed from
// `navSections` — keeps `Destination.icon` total so the command palette never
// renders an icon-less row.
const FALLBACK_ICON: NavIcon = Compass;

/**
 * A single searchable app destination — the union of every sidebar row,
 * in-page tab, and accounting module page. This is what the command palette
 * renders, so every page that was demoted out of the top-level sidebar during
 * nav consolidation stays reachable via search.
 */
export interface Destination {
  to: string;
  label: string;
  group: string;
  icon: NavIcon;
  feature?: FeatureArea;
  minimumPermission?: Exclude<PermissionLevel, "none">;
  requiredPermissions?: Array<{
    feature: FeatureArea;
    minimumPermission: Exclude<PermissionLevel, "none">;
  }>;
  roles?: AppRole[];
}

interface TabGroup {
  group: string;
  /** Sidebar route whose icon the group's tab destinations inherit. */
  rootTo: string;
  tabs: AppPageTabItem[];
}

const TAB_GROUPS: TabGroup[] = [
  { group: "Donors", rootTo: "/donors", tabs: donorTabs },
  { group: "Grants", rootTo: "/grants", tabs: grantsTabs },
  { group: "Funds", rootTo: "/funds", tabs: fundsTabs },
  { group: "Reports", rootTo: "/reports", tabs: reportsTabs },
  { group: "Deadlines", rootTo: "/deadlines", tabs: deadlinesTabs },
];

// Standalone destinations that are not on the main sidebar and are not part of
// any page-tabs group — reachable only through a page's own section nav (e.g.
// the Settings page's own section nav includes Entities), but must still stay
// searchable from the command palette. All current extras live under the
// Settings page, so they inherit the Settings sidebar icon in
// buildDestinations; give an extra its own icon handling if one ever lives
// elsewhere.
const EXTRA_DESTINATIONS: Array<Omit<Destination, "icon">> = [
  {
    to: "/settings/entities",
    label: "Entities",
    group: "Workspace",
    roles: ["admin"],
  },
];

function toDestination(
  entry: Pick<
    Destination,
    "to" | "label" | "feature" | "minimumPermission" | "requiredPermissions" | "roles"
  >,
  group: string,
  icon: NavIcon,
): Destination {
  return {
    to: entry.to,
    label: entry.label,
    group,
    icon,
    feature: entry.feature,
    minimumPermission: entry.minimumPermission,
    requiredPermissions: entry.requiredPermissions,
    roles: entry.roles,
  };
}

/**
 * Builds the flat, deduped list of every searchable app destination.
 *
 * Union of:
 *   (a) flattened `navSections` items — group = section label ?? "General"
 *   (b) all page-tabs groups (Donors/Grants/Funds/Reports/Deadlines) — tab
 *       items labeled "Overview" are skipped since their parent nav row
 *       already covers that route with a more meaningful label; any other
 *       tab sharing a nav row's route (e.g. the Deadlines "Radar" tab at
 *       /deadlines) is dropped by the first-wins dedupe below
 *   (c) the accounting module's destinations — group = "Accounting"
 *   (d) standalone extras not reachable any other way (e.g. Entities)
 *
 * Deduped by `to` — first occurrence wins, so nav rows (added first) keep
 * their label over same-route tab entries added later.
 *
 * Icons: nav rows keep their own icon; tab and accounting destinations
 * inherit the icon of the sidebar row they live under, so every command
 * palette entry stays visually anchored to its sidebar home.
 */
export function buildDestinations(sections: NavSection[] = navSections): Destination[] {
  const destinations: Destination[] = [];
  const seen = new Set<string>();
  const iconByTo = new Map<string, NavIcon>();

  function add(destination: Destination) {
    if (seen.has(destination.to)) return;
    seen.add(destination.to);
    destinations.push(destination);
  }

  for (const section of sections) {
    for (const item of section.items) {
      iconByTo.set(item.to, item.icon);
    }
  }

  for (const section of sections) {
    const group = section.label ?? "General";
    for (const item of section.items) {
      add(toDestination(item, group, item.icon));
    }
  }

  for (const { group, rootTo, tabs } of TAB_GROUPS) {
    const groupIcon = iconByTo.get(rootTo) ?? FALLBACK_ICON;
    for (const tab of tabs) {
      if (tab.label === "Overview") continue;
      add(toDestination(tab, group, groupIcon));
    }
  }

  const accountingIcon = iconByTo.get("/accounting") ?? FALLBACK_ICON;
  for (const entry of ACCOUNTING_SECTIONS) {
    add(toDestination(entry, "Accounting", accountingIcon));
  }

  const settingsIcon = iconByTo.get("/settings") ?? FALLBACK_ICON;
  for (const extra of EXTRA_DESTINATIONS) {
    add({ ...extra, icon: settingsIcon });
  }

  return destinations;
}
