import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PAYMENT_REQUEST_STRESS_SCENARIOS,
  assertProductionWrapper,
  evaluateScenarioResult,
  redactForReport,
  selectedScenarios,
} from "../e2e-adhoc/payment-request-prod-stress.mjs";

describe("payment request production stress harness", () => {
  it("uses a file-url CLI guard so relative script paths execute", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/payment-request-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain('import { pathToFileURL } from "node:url"');
    expect(source).toContain('pathToFileURL(process.argv[1] ?? "").href');
  });

  it("creates the disposable org through auth and onboarding APIs", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/payment-request-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain("/api/auth/better/sign-up/email");
    expect(source).toContain("/api/auth/better/sign-in/email");
    expect(source).toContain("/api/onboarding/complete");
    expect(source).not.toContain('heading", { name: "Welcome to GrantPipe" }');
  });

  it("ships generated reimbursement workflow scenarios", () => {
    expect(PAYMENT_REQUEST_STRESS_SCENARIOS.length).toBeGreaterThanOrEqual(3);
    expect(PAYMENT_REQUEST_STRESS_SCENARIOS.map((scenario) => scenario.key)).toEqual([
      "full-reimbursement-payment",
      "partial-payment-overpay-guard",
      "duplicate-expense-claim-guard",
    ]);
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

  it("marks a valid scenario result as passing", () => {
    const result = evaluateScenarioResult(PAYMENT_REQUEST_STRESS_SCENARIOS[0]!, {
      requestStatus: "paid",
      requestedAmountCents: 800000,
      approvedAmountCents: 800000,
      paidAmountCents: 800000,
      outstandingCents: 0,
      lineCount: 2,
      eligibleExpenseCountBeforeClaim: 2,
      eligibleExpenseCountAfterClaim: 0,
      duplicateClaimRejected: true,
      duplicateClaimStatus: 409,
      overpaymentRejected: true,
      overpaymentStatus: 400,
      summaryOutstandingCents: 0,
      orgOutstandingCents: 0,
      radarItemCount: 0,
      guardrailStatus: "clear",
      guardrailApplicable: false,
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("fails exact amount, status, and guard expectations", () => {
    const result = evaluateScenarioResult(PAYMENT_REQUEST_STRESS_SCENARIOS[0]!, {
      requestStatus: "approved",
      requestedAmountCents: 799999,
      approvedAmountCents: 800000,
      paidAmountCents: 0,
      outstandingCents: 800000,
      lineCount: 1,
      eligibleExpenseCountBeforeClaim: 1,
      eligibleExpenseCountAfterClaim: 2,
      duplicateClaimRejected: false,
      duplicateClaimStatus: 500,
      overpaymentRejected: false,
      overpaymentStatus: 401,
      summaryOutstandingCents: 800000,
      orgOutstandingCents: 800000,
      radarItemCount: 1,
      guardrailStatus: "blocked",
      guardrailApplicable: true,
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toContain("requestStatus expected paid, got approved");
    expect(result.failures).toContain("requestedAmountCents expected 800000, got 799999");
    expect(result.failures).toContain("eligibleExpenseCountAfterClaim expected 0, got 2");
    expect(result.failures).toContain("duplicate claim was not rejected");
    expect(result.failures).toContain("duplicateClaimStatus expected 409, got 500");
    expect(result.failures).toContain("overpayment was not rejected");
    expect(result.failures).toContain("overpaymentStatus expected 400, got 401");
    expect(result.failures).toContain("guardrailStatus expected clear, got blocked");
  });

  it("redacts emails and secret-like values from reports", () => {
    expect(
      redactForReport(
        'Email e2e-123@grantpipe.test password GrantPipe-secret-token-12345 "token":"abc123456789" Authorization: Bearer live-secret Cookie: session=abc',
      ),
    ).toBe(
      'Email [redacted-email] password [redacted-token] "token":"[redacted-token]" Authorization: Bearer [redacted-token] Cookie: [redacted-token]',
    );
  });

  it("falls back to one scenario when the stress limit is invalid", () => {
    expect(selectedScenarios({ GRANTPIPE_PAYMENT_STRESS_LIMIT: "not-a-number" })).toHaveLength(1);
  });
});
