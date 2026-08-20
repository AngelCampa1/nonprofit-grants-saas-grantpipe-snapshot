import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CAPABILITY_CLAIMS,
  type CapabilityEntitlementKey,
} from "../../../packages/shared/src/capabilities";
import { PLAN_ENTITLEMENTS } from "../../../packages/shared/src/constants";
import { PLAN_ENTITLEMENT_KEYS } from "../../../packages/shared/src/pricing";
import { marketingContentDirectory } from "./lib/marketing-content-root";

const featuresDir = join(marketingContentDirectory, "features");
const featureFiles = readdirSync(featuresDir).filter((f) => f.endsWith(".md"));

function extractFrontmatterEntitlement(content: string): string | undefined {
  const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!fmMatch) return undefined;
  const fm = fmMatch[1] ?? "";
  const line = fm.split(/\r?\n/).find((l) => /^entitlement\s*:/.test(l));
  if (!line) return undefined;
  const valuePart = line.split(":").slice(1).join(":").trim();
  return valuePart.replace(/^["']|["']$/g, "");
}

function entitlementIsIncludedOnEveryPlan(entitlement: string): boolean {
  return Object.values(PLAN_ENTITLEMENTS).every(
    (plan) => plan[entitlement as CapabilityEntitlementKey] === true,
  );
}

describe("feature page entitlement contract", () => {
  it("only sets entitlement to a known PlanEntitlements key", () => {
    const allowed = new Set<string>(PLAN_ENTITLEMENT_KEYS);
    const violations: string[] = [];
    for (const file of featureFiles) {
      const text = readFileSync(join(featuresDir, file), "utf8");
      const value = extractFrontmatterEntitlement(text);
      if (value !== undefined && !allowed.has(value)) {
        violations.push(`${file}: entitlement '${value}' is not a recognized PlanEntitlements key`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("declares an entitlement on the gated, plan-specific feature pages", () => {
    const expectations: Record<string, string> = {
      "accounting-anomaly-detector.md": "hasAccountingAnomalyDetector",
      "acknowledgment-year-end-statement-run.md": "hasComplianceReportPack",
      "ai-award-document-intake.md": "hasAwardDocumentIntake",
      "ask-your-ledger.md": "hasAskYourLedger",
      "audit-readiness-score-binder-starter.md": "hasAuditorFunderPortal",
      "auditor-funder-portal.md": "hasAuditorFunderPortal",
      "board-member-portal.md": "hasAuditorFunderPortal",
      "board-packet-composer.md": "hasComplianceReportPack",
      "funder-reporting-templates.md": "hasComplianceReportPack",
      "grant-budget-sentinel.md": "hasGrantBudgetAlerts",
      "grant-calendar-deadline-alerts.md": "hasAutomationEmails",
      "grant-drawdowns-reimbursements.md": "hasPaymentRequests",
      "outbound-donor-email-mail-merge.md": "hasAutomationEmails",
      "payroll-allocation.md": "canManageProgramAllocations",
      "pledge-multi-year-commitment-tracker.md": "hasPledgeTracker",
      "reimbursement-cash-flow-radar.md": "hasPaymentRequests",
      "restricted-fund-tracking.md": "hasRestrictionLifecycle",
      "sefa-builder-single-audit-tripwire.md": "hasAuditorFunderPortal",
      "subrecipient-monitoring.md": "hasSubrecipientMonitoring",
    };
    for (const [file, expected] of Object.entries(expectations)) {
      const text = readFileSync(join(featuresDir, file), "utf8");
      expect(extractFrontmatterEntitlement(text)).toBe(expected);
    }
  });

  it("keeps feature page entitlement frontmatter aligned with capability claims", () => {
    const violations: string[] = [];

    for (const claim of CAPABILITY_CLAIMS) {
      if (!claim.allowedPublicSurfaces.includes("features")) continue;

      const file = `${claim.featureSlug}.md`;
      const text = readFileSync(join(featuresDir, file), "utf8");
      const entitlement = extractFrontmatterEntitlement(text);

      if (claim.entitlementKey && entitlement !== claim.entitlementKey) {
        violations.push(
          `${file}: capability claim ${claim.key} expects ${claim.entitlementKey}, found ${
            entitlement ?? "none"
          }`,
        );
      }

      if (
        claim.includedEveryPlan &&
        entitlement &&
        !entitlementIsIncludedOnEveryPlan(entitlement)
      ) {
        violations.push(
          `${file}: capability claim ${claim.key} is included on every plan but frontmatter declares ${entitlement}`,
        );
      }
    }

    expect(violations).toEqual([]);
  });
});
