import type { FeatureArea, PermissionLevel } from "@grantpipe/shared";
import { readOnlyRoles, standardRoles, type AppRole } from "../lib/access-control";

export type { AppRole } from "../lib/access-control";

export interface AppPageTabItem {
  to: string;
  label: string;
  feature?: FeatureArea;
  minimumPermission?: Exclude<PermissionLevel, "none">;
  requiredPermissions?: Array<{
    feature: FeatureArea;
    minimumPermission: Exclude<PermissionLevel, "none">;
  }>;
  roles?: AppRole[];
}

export const donorTabs: AppPageTabItem[] = [
  {
    to: "/donors",
    label: "Overview",
    feature: "donors",
    minimumPermission: "view",
    roles: [...readOnlyRoles],
  },
  {
    to: "/donors/at-risk",
    label: "At-Risk",
    feature: "donors",
    minimumPermission: "view",
    roles: [...readOnlyRoles],
  },
  {
    to: "/donors/pledges",
    label: "Pledges",
    feature: "donors",
    minimumPermission: "view",
    roles: [...readOnlyRoles],
  },
  {
    to: "/donors/email",
    label: "Email",
    feature: "donors",
    minimumPermission: "edit",
    roles: [...standardRoles],
  },
];

export const grantsTabs: AppPageTabItem[] = [
  {
    to: "/grants",
    label: "Overview",
    feature: "grants",
    minimumPermission: "view",
    roles: [...readOnlyRoles],
  },
  {
    to: "/grants/pipeline",
    label: "Pipeline",
    feature: "grants",
    minimumPermission: "view",
    roles: [...readOnlyRoles],
  },
  {
    to: "/funders",
    label: "Funders",
    feature: "grants",
    minimumPermission: "view",
    roles: [...readOnlyRoles],
  },
  {
    to: "/subrecipients",
    label: "Subrecipients",
    feature: "compliance",
    minimumPermission: "view",
    roles: [...readOnlyRoles],
  },
  {
    to: "/grants/sentinel",
    label: "Budget Sentinel",
    feature: "grants",
    minimumPermission: "view",
    roles: [...readOnlyRoles],
  },
];

export const fundsTabs: AppPageTabItem[] = [
  {
    to: "/funds",
    label: "Overview",
    feature: "funds",
    minimumPermission: "view",
    roles: [...readOnlyRoles],
  },
  {
    to: "/programs",
    label: "Programs",
    feature: "programs",
    minimumPermission: "view",
    roles: [...readOnlyRoles],
  },
];

export const deadlinesTabs: AppPageTabItem[] = [
  {
    to: "/deadlines",
    label: "Radar",
    roles: [...readOnlyRoles],
  },
  {
    to: "/deadlines/calendar",
    label: "Calendar",
    roles: [...standardRoles],
  },
];

export const reportsTabs: AppPageTabItem[] = [
  {
    to: "/reports",
    label: "Overview",
    feature: "reports",
    minimumPermission: "view",
    roles: [...readOnlyRoles],
  },
  {
    to: "/reports/builder",
    label: "Builder",
    feature: "reports",
    minimumPermission: "view",
    roles: [...readOnlyRoles],
  },
  {
    to: "/reports/drafts",
    label: "Drafts",
    feature: "reports",
    minimumPermission: "view",
    roles: [...readOnlyRoles],
  },
  {
    to: "/reports/ask-ledger",
    label: "Ask Ledger",
    feature: "reports",
    minimumPermission: "view",
    roles: [...readOnlyRoles],
    requiredPermissions: [
      { feature: "reports", minimumPermission: "view" },
      { feature: "accounting", minimumPermission: "view" },
    ],
  },
  {
    to: "/evidence-bundles",
    label: "Evidence Bundles",
    feature: "reports",
    minimumPermission: "view",
    roles: [...readOnlyRoles],
  },
];
