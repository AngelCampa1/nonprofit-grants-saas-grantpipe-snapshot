import type { PersonaDefinition } from "@grantpipe/ui/site";

/**
 * Canonical persona navigation list. Each `slug` matches a markdown file in
 * `packages/shared/.../content/personas` and renders at `/for/{slug}`. This is
 * the single source of truth for the "By Role" megamenu group and footer links.
 */
export const personas = [
  {
    slug: "executive-directors",
    label: "Executive Directors",
    description: "Audit risk, board trust, and budget control in one view.",
  },
  {
    slug: "development-directors",
    label: "Development Directors",
    description: "Donor pipeline, retention, and board reports that match.",
  },
  {
    slug: "finance-operations-staff",
    label: "Finance & Operations",
    description: "Restricted funds, the 990, and a clean audit trail.",
  },
  {
    slug: "grants-managers",
    label: "Grants Managers",
    description: "Deadlines, drawdowns, and grant compliance in one place.",
  },
  {
    slug: "grant-writers",
    label: "Grant Writers",
    description: "Track every application, deadline, and funder ask.",
  },
  {
    slug: "program-directors",
    label: "Program Directors",
    description: "Spend programs to plan without breaking grant rules.",
  },
  {
    slug: "operations-managers",
    label: "Operations Managers",
    description: "Run donors, grants, and funds without spreadsheet glue.",
  },
  {
    slug: "board-treasurers",
    label: "Board Treasurers",
    description: "See restricted balances and risk before the meeting.",
  },
] as const satisfies readonly PersonaDefinition[];

export type PersonaSlug = (typeof personas)[number]["slug"];
