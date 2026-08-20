import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PLEDGE_TRACKER_STRESS_SCENARIOS,
  assertProductionWrapper,
  evaluateScenarioResult,
  redactForReport,
  selectedScenarios,
} from "../e2e-adhoc/pledge-tracker-prod-stress.mjs";

describe("pledge tracker production stress harness", () => {
  it("uses a file-url CLI guard so relative script paths execute", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/pledge-tracker-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain('import { pathToFileURL } from "node:url"');
    expect(source).toContain('pathToFileURL(process.argv[1] ?? "").href');
  });

  it("uses direct auth and API onboarding instead of stale UI onboarding", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/pledge-tracker-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain("/api/auth/better/sign-up/email");
    expect(source).toContain("/api/auth/better/sign-in/email");
    expect(source).toContain("/api/onboarding/complete");
    expect(source).not.toContain('heading", { name: "Welcome to GrantPipe" }');
  });

  it("keeps scenario exceptions reportable in the live artifact", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/pledge-tracker-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain("runScenario(page, session, scenario, index, accountCodesById).catch");
    expect(source).toContain("actual: {}");
  });

  it("enables accounting before expecting pledge journal postings", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/pledge-tracker-prod-stress.mjs"),
      "utf8",
    );
    const enableAccountingIndex = source.indexOf('"/api/org/settings"');
    const seedAccountsIndex = source.indexOf('"/api/accounting/accounts/seed"');

    expect(enableAccountingIndex).toBeGreaterThan(-1);
    expect(seedAccountsIndex).toBeGreaterThan(-1);
    expect(enableAccountingIndex).toBeLessThan(seedAccountsIndex);
    expect(source).toContain("accountingEnabled: true");
  });

  it("ships generated pledge lifecycle scenarios", () => {
    expect(PLEDGE_TRACKER_STRESS_SCENARIOS.map((scenario) => scenario.key)).toEqual([
      "conditional-promotion-payment",
      "allowance-writeoff",
    ]);
    expect(
      PLEDGE_TRACKER_STRESS_SCENARIOS.every((scenario) => scenario.installments.length >= 2),
    ).toBe(true);
  });

  it("refuses direct production execution outside the cleanup wrapper", () => {
    expect(() =>
      assertProductionWrapper({
        appUrl: "https://app.grantpipe.com",
        env: {},
      }),
    ).toThrow(/cleanup/);

    expect(() =>
      assertProductionWrapper({
        appUrl: "https://app.grantpipe.com",
        env: {
          GRANTPIPE_LIVE_E2E_WRAPPER: "1",
          POSTHOG_PERSONAL_API_KEY: "phx_secret",
          POSTHOG_PROJECT_ID: "390138",
        },
      }),
    ).not.toThrow();
  });

  it("marks an expected pledge scenario result as passing", () => {
    const scenario = PLEDGE_TRACKER_STRESS_SCENARIOS[0]!;
    const result = evaluateScenarioResult(scenario, {
      createdStatus: "conditional",
      createdIsConditional: true,
      faceAmountCents: 1000000,
      presentValueCents: scenario.expected.presentValueCents,
      discountCents: scenario.expected.discountCents,
      prePromotionPaymentRejected: true,
      prePromotionPaymentStatus: 400,
      promotedStatus: "active",
      promotedIsConditional: false,
      overpaymentRejected: true,
      overpaymentStatus: 400,
      paymentCount: 1,
      firstInstallmentStatus: "partial",
      firstInstallmentPaidCents: 250000,
      allowanceCents: 0,
      writeOffStatus: null,
      writtenOffInstallmentCount: 0,
      amortizationPeriodCount: 2,
      journalEntryCount: 3,
      journalEntriesBalanced: true,
      journalRequiredSourceIdsPresent: true,
      journalLineContractValid: true,
      listStatus: "active",
      listOutstandingCents: 750000,
      listAllowanceCents: 0,
      listWrittenOffCents: 0,
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("fails mismatched pledge lifecycle results", () => {
    const scenario = PLEDGE_TRACKER_STRESS_SCENARIOS[0]!;
    const result = evaluateScenarioResult(scenario, {
      createdStatus: "active",
      createdIsConditional: false,
      faceAmountCents: 1,
      presentValueCents: 1,
      discountCents: 0,
      prePromotionPaymentRejected: false,
      prePromotionPaymentStatus: 201,
      promotedStatus: "conditional",
      promotedIsConditional: true,
      overpaymentRejected: false,
      overpaymentStatus: 201,
      paymentCount: 0,
      firstInstallmentStatus: "scheduled",
      firstInstallmentPaidCents: 0,
      allowanceCents: 999,
      writeOffStatus: "written_off",
      writtenOffInstallmentCount: 2,
      amortizationPeriodCount: 0,
      journalEntryCount: 0,
      journalEntriesBalanced: false,
      journalRequiredSourceIdsPresent: false,
      journalLineContractValid: false,
      listStatus: "completed",
      listOutstandingCents: 0,
      listAllowanceCents: 999,
      listWrittenOffCents: 999,
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toContain("createdStatus expected conditional, got active");
    expect(result.failures).toContain("pre-promotion payment was not rejected");
    expect(result.failures).toContain("overpayment was not rejected");
    expect(result.failures).toContain(
      `presentValueCents expected ${scenario.expected.presentValueCents}, got 1`,
    );
    expect(result.failures).toContain("journalEntryCount expected 3, got 0");
    expect(result.failures).toContain("journalEntriesBalanced expected true, got false");
    expect(result.failures).toContain("journalLineContractValid expected true, got false");
    expect(result.failures).toContain("writeOffStatus expected null, got written_off");
  });

  it("expects write-off to mark partially paid installments written off", () => {
    const scenario = PLEDGE_TRACKER_STRESS_SCENARIOS.find(
      (item) => item.key === "allowance-writeoff",
    );

    expect(scenario?.expected.firstInstallmentStatus).toBe("written_off");
  });

  it("redacts emails and secret-like values from reports", () => {
    expect(
      redactForReport(
        'Email e2e-pledges@grantpipe.test password GrantPipe-secret-token-12345 "token":"abc123456789" Authorization: Bearer live-secret Cookie: session=abc',
      ),
    ).toBe(
      'Email [redacted-email] password [redacted-token] "token":"[redacted-token]" Authorization: Bearer [redacted-token] Cookie: [redacted-token]',
    );
  });

  it("falls back to one scenario when the stress limit is invalid", () => {
    expect(
      selectedScenarios({ GRANTPIPE_PLEDGE_TRACKER_STRESS_LIMIT: "not-a-number" }),
    ).toHaveLength(1);
  });
});
