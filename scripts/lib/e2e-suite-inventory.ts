type PlaywrightSpecEntry = {
  file: string;
  local: boolean;
  authenticatedProduction: boolean;
  funnelProduction: boolean;
  publicProduction: boolean;
  productionOnly: boolean;
  helper: boolean;
};

export const playwrightSpecInventory: PlaywrightSpecEntry[] = [
  {
    file: "advanced-flows.spec.ts",
    local: true,
    authenticatedProduction: true,
    funnelProduction: false,
    publicProduction: false,
    productionOnly: false,
    helper: false,
  },
  {
    file: "auth-onboarding.spec.ts",
    local: true,
    authenticatedProduction: true,
    funnelProduction: false,
    publicProduction: false,
    productionOnly: false,
    helper: false,
  },
  {
    file: "canonical-app-links.spec.ts",
    local: true,
    authenticatedProduction: false,
    funnelProduction: false,
    publicProduction: false,
    productionOnly: false,
    helper: false,
  },
  {
    file: "crm-feedback-widget.spec.ts",
    local: true,
    authenticatedProduction: false,
    funnelProduction: false,
    publicProduction: false,
    productionOnly: false,
    helper: false,
  },
  {
    file: "deep-flows.spec.ts",
    local: true,
    authenticatedProduction: true,
    funnelProduction: false,
    publicProduction: false,
    productionOnly: false,
    helper: false,
  },
  {
    file: "help-onboarding.spec.ts",
    local: true,
    authenticatedProduction: false,
    funnelProduction: false,
    publicProduction: false,
    productionOnly: false,
    helper: false,
  },
  {
    file: "import-and-grant-flow.spec.ts",
    local: true,
    authenticatedProduction: true,
    funnelProduction: false,
    publicProduction: false,
    productionOnly: false,
    helper: false,
  },
  {
    file: "marketing-to-trial.spec.ts",
    local: true,
    authenticatedProduction: false,
    funnelProduction: false,
    publicProduction: false,
    productionOnly: false,
    helper: false,
  },
  {
    file: "product-proof.spec.ts",
    local: true,
    authenticatedProduction: false,
    funnelProduction: false,
    publicProduction: false,
    productionOnly: false,
    helper: false,
  },
  {
    file: "surface-sweep.spec.ts",
    local: true,
    authenticatedProduction: true,
    funnelProduction: false,
    publicProduction: false,
    productionOnly: false,
    helper: false,
  },
  {
    file: "production-funnel.spec.ts",
    local: false,
    authenticatedProduction: false,
    funnelProduction: true,
    publicProduction: false,
    productionOnly: true,
    helper: false,
  },
  {
    file: "public-prod-site.spec.ts",
    local: false,
    authenticatedProduction: false,
    funnelProduction: false,
    publicProduction: true,
    productionOnly: true,
    helper: false,
  },
  {
    file: "helpers/visual-qa.spec.ts",
    local: false,
    authenticatedProduction: false,
    funnelProduction: false,
    publicProduction: false,
    productionOnly: false,
    helper: true,
  },
];

function filesWhere(predicate: (entry: PlaywrightSpecEntry) => boolean): string[] {
  return playwrightSpecInventory.filter(predicate).map(({ file }) => file);
}

export const localE2ESpecs = filesWhere(({ local }) => local);
export const authenticatedProductionE2ESpecs = filesWhere(
  ({ authenticatedProduction }) => authenticatedProduction,
);
export const productionFunnelE2ESpecs = filesWhere(({ funnelProduction }) => funnelProduction);
export const publicProductionE2ESpecs = filesWhere(({ publicProduction }) => publicProduction);
export const helperE2ESpecs = filesWhere(({ helper }) => helper);

type ProductionStressScript = {
  file: string;
  mutatesProduction: true;
  requiresLiveWrapper: true;
  owner: "grantpipe";
};

const productionStressFiles = [
  "accounting-anomalies-prod-stress.mjs",
  "accounting-integrations-prod-stress.mjs",
  "accounting-reconciliation-prod-stress.mjs",
  "activity-prod-stress.mjs",
  "ai-cs-prod-e2e.mjs",
  "ask-ledger-prod-stress.mjs",
  "auth-boundary-prod-stress.mjs",
  "award-intake-prod-stress.mjs",
  "billing-settings-prod-stress.mjs",
  "budget-sentinel-prod-stress.mjs",
  "compliance-reports-prod-stress.mjs",
  "custom-fields-prod-stress.mjs",
  "deadline-radar-prod-stress.mjs",
  "documents-prod-stress.mjs",
  "donor-lapse-prod-stress.mjs",
  "donors-prod-stress.mjs",
  "downloads-prod-stress.mjs",
  "entity-settings-prod-stress.mjs",
  "events-prod-stress.mjs",
  "external-reviewer-prod-stress.mjs",
  "feedback-prod-stress.mjs",
  "help-prod-stress.mjs",
  "import-prod-stress.mjs",
  "notifications-prod-stress.mjs",
  "org-settings-prod-stress.mjs",
  "outcomes-prod-stress.mjs",
  "overview-prod-stress.mjs",
  "payment-request-prod-stress.mjs",
  "pledge-tracker-prod-stress.mjs",
  "program-allocation-prod-stress.mjs",
  "report-builder-prod-stress.mjs",
  "restriction-rollforward-prod-stress.mjs",
  "sample-data-prod-stress.mjs",
  "subrecipient-monitoring-prod-stress.mjs",
  "team-management-prod-stress.mjs",
] as const;

export const productionStressScripts: ProductionStressScript[] = productionStressFiles.map(
  (file) => ({
    file,
    mutatesProduction: true,
    requiresLiveWrapper: true,
    owner: "grantpipe",
  }),
);

export const liveE2EHelperScripts = ["app-route.mjs", "live-e2e-guard.mjs"];
