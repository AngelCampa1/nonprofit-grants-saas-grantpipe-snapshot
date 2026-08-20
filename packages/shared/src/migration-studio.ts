import {
  IMPORT_ENTITY_TYPES,
  IMPORT_PRESET_IDS,
  IMPORT_PRESET_LABELS,
  type ImportPresetId,
} from "./constants/import-presets";

export type MigrationSourceId = ImportPresetId | "generic";
export type MigrationPlanStepStatus = "ready" | "needs_mapping" | "not_supported";
export type MigrationPlanPhase = "foundation" | "donor_history" | "finance" | "commitments";
export type MigrationImportEntityType = (typeof IMPORT_ENTITY_TYPES)[number];

export type MigrationPlanStep = {
  entityType: MigrationImportEntityType;
  label: string;
  phase: MigrationPlanPhase;
  description: string;
  whyItMatters: string;
  status: MigrationPlanStepStatus;
};

export type MigrationSourcePlan = {
  sourceId: MigrationSourceId;
  label: string;
  summary: string;
  recommendedOrder: MigrationPlanStep[];
  sourceNotes: string[];
};

export const MIGRATION_SOURCE_IDS = ["generic", ...IMPORT_PRESET_IDS] as const;

export const MIGRATION_ENTITY_LABELS: Record<MigrationImportEntityType, string> = {
  contacts: "Contacts",
  donations: "Donation history",
  grants: "Grants",
  grant_opportunities: "Grant opportunities",
  funds: "Funds",
  opening_balances: "Opening balances",
  pledges: "Pledge schedules",
};

const BASE_STEPS: MigrationPlanStep[] = [
  {
    entityType: "contacts",
    label: "Move donor and organization records",
    phase: "foundation",
    description: "Start with the people and organizations that later gifts and pledges will match.",
    whyItMatters: "Donations and pledges need a clean donor record before they can post.",
    status: "ready",
  },
  {
    entityType: "funds",
    label: "Set up funds and restriction buckets",
    phase: "foundation",
    description: "Bring over the funds that classify restricted and unrestricted activity.",
    whyItMatters: "Fund balances and gift restrictions need the same structure on day one.",
    status: "ready",
  },
  {
    entityType: "grants",
    label: "Move active grants",
    phase: "foundation",
    description:
      "Create active awards and their funder records before importing grant-linked rows.",
    whyItMatters: "Grant-linked gifts, balances, and reports need an award to attach to.",
    status: "ready",
  },
  {
    entityType: "donations",
    label: "Import gift history",
    phase: "donor_history",
    description: "Load historical gifts after donor and fund records are in place.",
    whyItMatters: "Gift history powers donor retention, acknowledgments, and revenue reporting.",
    status: "ready",
  },
  {
    entityType: "opening_balances",
    label: "Seed opening GL balances",
    phase: "finance",
    description: "Post the starting debit and credit balances for the cutover date.",
    whyItMatters: "Reports need a balanced starting ledger before new activity is trusted.",
    status: "ready",
  },
  {
    entityType: "pledges",
    label: "Load pledge schedules",
    phase: "commitments",
    description: "Import multi-row pledge schedules after contacts, funds, and grants exist.",
    whyItMatters: "Future receivables and pledge aging depend on installment due dates.",
    status: "ready",
  },
];

const SOURCE_NOTES: Record<MigrationSourceId, string[]> = {
  generic: [
    "Use GrantPipe templates when the export comes from a spreadsheet or a tool without a preset.",
    "Preview each file before committing it. Preview does not save records.",
  ],
  bloomerang: [
    "Bloomerang exports usually map donors and gifts first.",
    "Fund names often come through gift fund columns, so review restriction mapping before commit.",
  ],
  donorperfect: [
    "DonorPerfect gift exports usually use gift date and amount columns GrantPipe can map.",
    "Use fund or GL code exports to prepare restricted funds before gift history.",
  ],
  quickbooks: [
    "QuickBooks is best for finance cutover data: chart-derived fund names and trial-balance rows.",
    "Bring donor history from the donor CRM first, then use QuickBooks for opening balances.",
  ],
  salesforce_npsp: [
    "Salesforce NPSP exports can seed contacts, opportunities, and pledge IDs.",
    "Review stage values before commit so closed opportunities become the right GrantPipe record type.",
  ],
};

const SOURCE_SUMMARIES: Record<MigrationSourceId, string> = {
  generic: "A guided CSV migration path for spreadsheets and unsupported systems.",
  bloomerang: "A donor-first migration path for Bloomerang exports.",
  donorperfect: "A donor and gift migration path for DonorPerfect exports.",
  quickbooks: "A finance cutover path for QuickBooks classes, funds, and opening balances.",
  salesforce_npsp: "A CRM migration path for Salesforce NPSP contact and opportunity exports.",
};

function cloneStep(step: MigrationPlanStep): MigrationPlanStep {
  return { ...step };
}

function markUnsupported(
  steps: MigrationPlanStep[],
  sourceId: MigrationSourceId,
): MigrationPlanStep[] {
  if (sourceId !== "quickbooks") return steps;

  return steps.map((step) =>
    step.entityType === "pledges"
      ? {
          ...step,
          status: "needs_mapping",
          description:
            "QuickBooks does not usually export pledge schedules. Use a GrantPipe pledge CSV template for this step.",
        }
      : step,
  );
}

export function normalizeMigrationSourceId(value: string | null | undefined): MigrationSourceId {
  return MIGRATION_SOURCE_IDS.includes(value as MigrationSourceId)
    ? (value as MigrationSourceId)
    : "generic";
}

export function getMigrationSourcePlan(value: string | null | undefined): MigrationSourcePlan {
  const sourceId = normalizeMigrationSourceId(value);
  const label = sourceId === "generic" ? "Generic CSV" : IMPORT_PRESET_LABELS[sourceId];
  const recommendedOrder = markUnsupported(BASE_STEPS.map(cloneStep), sourceId);

  return {
    sourceId,
    label,
    summary: SOURCE_SUMMARIES[sourceId],
    recommendedOrder,
    sourceNotes: SOURCE_NOTES[sourceId],
  };
}
