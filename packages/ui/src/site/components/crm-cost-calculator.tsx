import { useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { formatCurrencyCents } from "@grantpipe/shared";
import { marketingKnowledge } from "@grantpipe/shared/public-kb";
import { trackEvent } from "../lib/analytics";
import { destinationPathFromHref } from "../lib/analytics-destination";

export type CrmSlug = "salesforce" | "blackbaud" | "bloomerang" | "donorperfect" | "spreadsheets";

export type BudgetTier = "500k-1m" | "1m-2.5m" | "2.5m-5m" | "5m-10m";

export interface TcoInputs {
  crm: CrmSlug;
  budgetTier: BudgetTier;
  grantCount: number;
  teamSize: number;
}

export interface TcoYearResult {
  license: number;
  implementation: number;
  admin: number;
  integrations: number;
  training: number;
  total: number;
}

export interface TcoSeriesResult {
  year1: TcoYearResult;
  year2: TcoYearResult;
  year3: TcoYearResult;
  threeYearTotal: number;
}

export interface TcoResult {
  currentCrm: TcoSeriesResult;
  grantPipe: TcoSeriesResult;
  savings: number;
}

interface CrmBaselineRanges {
  licenseLow: number;
  licenseHigh: number;
  implementationLow: number;
  implementationHigh: number;
  adminLow: number;
  adminHigh: number;
  integrationsLow: number;
  integrationsHigh: number;
  trainingLow: number;
  trainingHigh: number;
}

const CRM_RANGES: Record<CrmSlug, CrmBaselineRanges> = {
  salesforce: {
    // Salesforce NPSP: 10 free + $60/extra user/mo = $720/extra user/yr. License baseline is 0 (users added below).
    licenseLow: 0,
    licenseHigh: 0,
    implementationLow: 30000,
    implementationHigh: 100000,
    adminLow: 55000,
    adminHigh: 85000,
    integrationsLow: 3000,
    integrationsHigh: 8000,
    trainingLow: 3000,
    trainingHigh: 3000,
  },
  blackbaud: {
    licenseLow: 8000,
    licenseHigh: 15000,
    implementationLow: 15000,
    implementationHigh: 40000,
    adminLow: 15000,
    adminHigh: 45000,
    integrationsLow: 2000,
    integrationsHigh: 5000,
    trainingLow: 2500,
    trainingHigh: 2500,
  },
  bloomerang: {
    licenseLow: 1500,
    licenseHigh: 2988,
    implementationLow: 2000,
    implementationHigh: 2000,
    adminLow: 0,
    adminHigh: 15000,
    integrationsLow: 1000,
    integrationsHigh: 3000,
    trainingLow: 500,
    trainingHigh: 500,
  },
  donorperfect: {
    licenseLow: 1188,
    licenseHigh: 3588,
    implementationLow: 5000,
    implementationHigh: 5000,
    adminLow: 0,
    adminHigh: 15000,
    integrationsLow: 1000,
    integrationsHigh: 3000,
    trainingLow: 500,
    trainingHigh: 500,
  },
  spreadsheets: {
    licenseLow: 0,
    licenseHigh: 0,
    implementationLow: 0,
    implementationHigh: 0,
    adminLow: 8000,
    adminHigh: 20000,
    integrationsLow: 0,
    integrationsHigh: 0,
    trainingLow: 0,
    trainingHigh: 0,
  },
};

export const CRM_LABELS: Record<CrmSlug, string> = {
  salesforce: "Salesforce NPSP",
  blackbaud: "Blackbaud RE",
  bloomerang: "Bloomerang",
  donorperfect: "DonorPerfect",
  spreadsheets: "Spreadsheets",
};

export const BUDGET_LABELS: Record<BudgetTier, string> = {
  "500k-1m": "$500K–$1M",
  "1m-2.5m": "$1M–$2.5M",
  "2.5m-5m": "$2.5M–$5M",
  "5m-10m": "$5M–$10M",
};

const BUDGET_ADMIN_FACTORS: Record<BudgetTier, number> = {
  "500k-1m": 0,
  "1m-2.5m": 0.33,
  "2.5m-5m": 0.66,
  "5m-10m": 1,
};

function mid(low: number, high: number): number {
  return Math.round((low + high) / 2);
}

function scaleInRange(low: number, high: number, factor: number): number {
  return Math.round(low + (high - low) * factor);
}

export const GRANTPIPE_ANNUAL_LICENSE = 2988;

export function calculateTco(inputs: TcoInputs): TcoResult {
  const { crm, budgetTier, grantCount, teamSize } = inputs;
  const ranges = CRM_RANGES[crm];

  // License — midpoint; add Salesforce extra users
  let license = mid(ranges.licenseLow, ranges.licenseHigh);
  if (crm === "salesforce" && teamSize > 10) {
    license += (teamSize - 10) * 60 * 12; // $60/user/month
  }

  // Implementation — midpoint
  const implementation = mid(ranges.implementationLow, ranges.implementationHigh);

  // Admin — scaled by budget tier within range
  const budgetFactor = BUDGET_ADMIN_FACTORS[budgetTier];
  let admin = scaleInRange(ranges.adminLow, ranges.adminHigh, budgetFactor);

  // Grant complexity multiplier
  if (grantCount > 10) {
    admin = Math.round(admin * 1.2);
  }

  const integrations = mid(ranges.integrationsLow, ranges.integrationsHigh);
  const training = mid(ranges.trainingLow, ranges.trainingHigh);

  const year1: TcoYearResult = {
    license,
    implementation,
    admin,
    integrations,
    training,
    total: license + implementation + admin + integrations + training,
  };

  const year2: TcoYearResult = {
    license,
    implementation: 0,
    admin,
    integrations,
    training: 0,
    total: license + admin + integrations,
  };

  const year3: TcoYearResult = { ...year2 };

  const currentCrm: TcoSeriesResult = {
    year1,
    year2,
    year3,
    threeYearTotal: year1.total + year2.total + year3.total,
  };

  const gpYear: TcoYearResult = {
    license: GRANTPIPE_ANNUAL_LICENSE,
    implementation: 0,
    admin: 0,
    integrations: 0,
    training: 0,
    total: GRANTPIPE_ANNUAL_LICENSE,
  };

  const grantPipe: TcoSeriesResult = {
    year1: gpYear,
    year2: gpYear,
    year3: gpYear,
    threeYearTotal: GRANTPIPE_ANNUAL_LICENSE * 3,
  };

  return {
    currentCrm,
    grantPipe,
    savings: currentCrm.threeYearTotal - grantPipe.threeYearTotal,
  };
}

// TCO results are whole-dollar numbers; convert to cents before delegating to
// the shared canonical formatter so output matches the sibling calculators.
function formatCurrency(n: number): string {
  return formatCurrencyCents(Math.round(n * 100));
}

export function bucketCount(count: number, buckets: [number, number, string][]): string {
  const bucket = buckets.find(([min, max]) => count >= min && count <= max);
  return bucket?.[2] ?? "unknown";
}

export function bucketSavings(amount: number): string {
  if (amount < 0) return "negative";
  if (amount < 10_000) return "under_10k";
  if (amount < 50_000) return "10k-50k";
  if (amount < 100_000) return "50k-100k";
  return "100k_plus";
}

interface CrmCostCalculatorProps {
  appUrl: string;
}

const CRM_OPTIONS: CrmSlug[] = [
  "salesforce",
  "blackbaud",
  "bloomerang",
  "donorperfect",
  "spreadsheets",
];

const BUDGET_OPTIONS: BudgetTier[] = ["500k-1m", "1m-2.5m", "2.5m-5m", "5m-10m"];

export function CrmCostCalculator({ appUrl }: CrmCostCalculatorProps) {
  const [crm, setCrm] = useState<CrmSlug>("salesforce");
  const [budgetTier, setBudgetTier] = useState<BudgetTier>("1m-2.5m");
  const [grantCount, setGrantCount] = useState<number>(8);
  const [teamSize, setTeamSize] = useState<number>(5);

  const result = calculateTco({ crm, budgetTier, grantCount, teamSize });
  const analyticsProperties = useMemo(
    () => ({
      calculator_id: "crm_cost",
      current_crm: crm,
      budget_tier: budgetTier,
      grant_count_bucket: bucketCount(grantCount, [
        [1, 3, "1-3"],
        [4, 10, "4-10"],
        [11, 25, "11-25"],
        [26, 50, "26-50"],
      ]),
      team_size_bucket: bucketCount(teamSize, [
        [1, 3, "1-3"],
        [4, 10, "4-10"],
        [11, 20, "11-20"],
      ]),
      savings_bucket: bucketSavings(result.savings),
    }),
    [budgetTier, crm, grantCount, result.savings, teamSize],
  );
  const hasTrackedResultView = useRef(false);

  useEffect(() => {
    if (hasTrackedResultView.current) return;
    hasTrackedResultView.current = true;
    trackEvent("calculator_result_viewed", analyticsProperties);
  }, [analyticsProperties]);

  return (
    <section
      aria-label="3-year CRM cost calculator"
      className="mt-10 rounded-lg border border-neutral-200 p-6 sm:p-8"
      style={{ background: "var(--surface-sunken)" }}
    >
      <h2
        className="font-heading font-bold mb-6 text-brand-text"
        style={{ fontSize: "var(--text-heading, 1.5rem)" }}
      >
        Interactive 3-Year Cost Calculator
      </h2>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Inputs — single column on mobile, two columns on md+ */}
        <div className="flex flex-col gap-5">
          <h3 className="font-semibold text-brand-text" style={{ fontSize: "var(--text-body)" }}>
            Your Organization
          </h3>

          <div>
            <span
              className="block mb-2 text-brand-text font-medium"
              style={{ fontSize: "var(--text-caption)" }}
            >
              Current CRM
            </span>
            <div role="radiogroup" aria-label="Current CRM" className="flex flex-wrap gap-2">
              {CRM_OPTIONS.map((option) => {
                const selected = crm === option;
                return (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setCrm(option)}
                    className={clsx(
                      "rounded-full px-3 py-2 text-sm font-medium border min-h-12 flex items-center",
                      selected
                        ? "btn-primary"
                        : "border-neutral-300 text-brand-text bg-transparent",
                    )}
                  >
                    {CRM_LABELS[option]}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label
              htmlFor="crm-calc-budget"
              className="block mb-2 text-brand-text font-medium"
              style={{ fontSize: "var(--text-caption)" }}
            >
              Organization budget
            </label>
            <select
              id="crm-calc-budget"
              value={budgetTier}
              onChange={(e) => setBudgetTier(e.target.value as BudgetTier)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-base bg-surface-sunken text-brand-text min-h-12"
            >
              {BUDGET_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {BUDGET_LABELS[opt]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="crm-calc-grants"
              className="block mb-2 text-brand-text font-medium"
              style={{ fontSize: "var(--text-caption)" }}
            >
              Active grants
            </label>
            <input
              id="crm-calc-grants"
              type="number"
              min={1}
              max={50}
              value={grantCount}
              onChange={(e) =>
                setGrantCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))
              }
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-base bg-surface-sunken text-brand-text min-h-12"
            />
          </div>

          <div>
            <label
              htmlFor="crm-calc-team"
              className="block mb-2 text-brand-text font-medium"
              style={{ fontSize: "var(--text-caption)" }}
            >
              Team size (users)
            </label>
            <input
              id="crm-calc-team"
              type="number"
              min={1}
              max={20}
              value={teamSize}
              onChange={(e) => setTeamSize(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-base bg-surface-sunken text-brand-text min-h-12"
            />
          </div>
        </div>

        {/* Results */}
        <div>
          <h3
            className="font-semibold mb-4 text-brand-text"
            style={{ fontSize: "var(--text-body)" }}
          >
            3-Year Cost Comparison
          </h3>

          {/* Mobile stacked card view — hidden on sm+ */}
          <div className="sm:hidden grid gap-3 mb-4">
            <div className="rounded-md border border-neutral-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted mb-2">
                {CRM_LABELS[crm]}
              </p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-brand-muted">Year 1</span>
                <span className="text-right font-mono text-brand-text">
                  {formatCurrency(result.currentCrm.year1.total)}
                </span>
                <span className="text-brand-muted">Year 2</span>
                <span className="text-right font-mono text-brand-text">
                  {formatCurrency(result.currentCrm.year2.total)}
                </span>
                <span className="text-brand-muted">Year 3</span>
                <span className="text-right font-mono text-brand-text">
                  {formatCurrency(result.currentCrm.year3.total)}
                </span>
                <span className="text-brand-muted font-semibold">3-Year Total</span>
                <span className="text-right font-mono font-semibold text-brand-text">
                  {formatCurrency(result.currentCrm.threeYearTotal)}
                </span>
              </div>
            </div>
            <div className="rounded-md border border-primary-200 bg-primary-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-600 mb-2">
                GrantPipe (Growth)
              </p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-brand-muted">Year 1</span>
                <span className="text-right font-mono text-brand-text">
                  {formatCurrency(result.grantPipe.year1.total)}
                </span>
                <span className="text-brand-muted">Year 2</span>
                <span className="text-right font-mono text-brand-text">
                  {formatCurrency(result.grantPipe.year2.total)}
                </span>
                <span className="text-brand-muted">Year 3</span>
                <span className="text-right font-mono text-brand-text">
                  {formatCurrency(result.grantPipe.year3.total)}
                </span>
                <span className="text-brand-muted font-semibold">3-Year Total</span>
                <span className="text-right font-mono font-semibold text-primary-500">
                  {formatCurrency(result.grantPipe.threeYearTotal)}
                </span>
              </div>
            </div>
            <div className="rounded-md border-2 border-primary-500 p-4 flex items-center justify-between">
              <span className="font-semibold text-brand-text">You Save</span>
              <span
                className="font-mono font-bold"
                style={{
                  color: "var(--color-primary-500)",
                  fontSize: "var(--text-heading, 1.25rem)",
                }}
              >
                {formatCurrency(result.savings)}
              </span>
            </div>
          </div>

          {/* Desktop table view — hidden on mobile */}
          <div className="hidden sm:block overflow-x-auto">
            <table
              aria-label="3-Year Cost Comparison"
              style={{ width: "100%", borderCollapse: "collapse" }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: "2px solid var(--color-neutral-200)",
                  }}
                >
                  <th
                    className="text-left font-semibold text-brand-text"
                    style={{
                      fontSize: "var(--text-caption)",
                      padding: "0.5rem 0.5rem 0.5rem 0",
                    }}
                  >
                    &nbsp;
                  </th>
                  <th
                    className="text-right font-semibold text-brand-text"
                    style={{
                      fontSize: "var(--text-caption)",
                      padding: "0.5rem",
                    }}
                  >
                    Year 1
                  </th>
                  <th
                    className="text-right font-semibold text-brand-text"
                    style={{
                      fontSize: "var(--text-caption)",
                      padding: "0.5rem",
                    }}
                  >
                    Year 2
                  </th>
                  <th
                    className="text-right font-semibold text-brand-text"
                    style={{
                      fontSize: "var(--text-caption)",
                      padding: "0.5rem",
                    }}
                  >
                    Year 3
                  </th>
                  <th
                    className="text-right font-semibold text-brand-text"
                    style={{
                      fontSize: "var(--text-caption)",
                      padding: "0.5rem 0 0.5rem 0.5rem",
                    }}
                  >
                    3-Year Total
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  aria-label="Current CRM row"
                  style={{ borderBottom: "1px solid var(--color-neutral-100)" }}
                >
                  <td
                    className="text-brand-text font-medium"
                    style={{ padding: "0.625rem 0.5rem 0.625rem 0" }}
                  >
                    {CRM_LABELS[crm]}
                  </td>
                  <td
                    className="text-right font-mono text-brand-text"
                    style={{ padding: "0.625rem 0.5rem" }}
                  >
                    {formatCurrency(result.currentCrm.year1.total)}
                  </td>
                  <td
                    className="text-right font-mono text-brand-text"
                    style={{ padding: "0.625rem 0.5rem" }}
                  >
                    {formatCurrency(result.currentCrm.year2.total)}
                  </td>
                  <td
                    className="text-right font-mono text-brand-text"
                    style={{ padding: "0.625rem 0.5rem" }}
                  >
                    {formatCurrency(result.currentCrm.year3.total)}
                  </td>
                  <td
                    className="text-right font-mono font-semibold text-brand-text"
                    style={{ padding: "0.625rem 0 0.625rem 0.5rem" }}
                  >
                    {formatCurrency(result.currentCrm.threeYearTotal)}
                  </td>
                </tr>
                <tr
                  aria-label="GrantPipe row"
                  style={{ borderBottom: "1px solid var(--color-neutral-100)" }}
                >
                  <td
                    className="text-primary-500 font-semibold"
                    style={{ padding: "0.625rem 0.5rem 0.625rem 0" }}
                  >
                    GrantPipe (Growth)
                  </td>
                  <td
                    className="text-right font-mono text-brand-text"
                    style={{ padding: "0.625rem 0.5rem" }}
                  >
                    {formatCurrency(result.grantPipe.year1.total)}
                  </td>
                  <td
                    className="text-right font-mono text-brand-text"
                    style={{ padding: "0.625rem 0.5rem" }}
                  >
                    {formatCurrency(result.grantPipe.year2.total)}
                  </td>
                  <td
                    className="text-right font-mono text-brand-text"
                    style={{ padding: "0.625rem 0.5rem" }}
                  >
                    {formatCurrency(result.grantPipe.year3.total)}
                  </td>
                  <td
                    className="text-right font-mono font-semibold text-primary-500"
                    style={{ padding: "0.625rem 0 0.625rem 0.5rem" }}
                  >
                    {formatCurrency(result.grantPipe.threeYearTotal)}
                  </td>
                </tr>
                <tr aria-label="Savings row">
                  <td
                    className="font-semibold text-brand-text"
                    style={{ padding: "0.75rem 0.5rem 0.75rem 0" }}
                  >
                    You Save
                  </td>
                  <td
                    colSpan={4}
                    className="text-right font-mono font-bold"
                    style={{
                      padding: "0.75rem 0 0.75rem 0.5rem",
                      color: "var(--color-primary-500)",
                      fontSize: "var(--text-heading, 1.25rem)",
                    }}
                  >
                    {formatCurrency(result.savings)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex flex-col gap-3">
            <a
              href={appUrl}
              onClick={() => {
                trackEvent("calculator_cta_clicked", {
                  ...analyticsProperties,
                  destination_path: destinationPathFromHref(appUrl),
                });
              }}
              className="btn-primary inline-flex items-center justify-center gap-2 px-6 py-2.5 min-h-12"
            >
              {marketingKnowledge.ctas.trial.label}
            </a>
            <p className="text-brand-muted" style={{ fontSize: "var(--text-caption)" }}>
              Estimates based on published pricing and industry benchmarks. Actual costs vary.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
