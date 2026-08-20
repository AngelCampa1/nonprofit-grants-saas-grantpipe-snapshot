import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ACCOUNTING_RECONCILIATION_STRESS_SCENARIOS,
  assertProductionWrapper,
  evaluateScenarioResult,
  redactForReport,
  selectedScenarios,
} from "../e2e-adhoc/accounting-reconciliation-prod-stress.mjs";

describe("accounting reconciliation production stress harness", () => {
  it("uses a file-url CLI guard so relative script paths execute", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/accounting-reconciliation-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain('import { pathToFileURL } from "node:url"');
    expect(source).toContain('pathToFileURL(process.argv[1] ?? "").href');
  });

  it("uses direct auth and API onboarding instead of stale signup UI copy", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/accounting-reconciliation-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain("/signup?plan=growth&cycle=monthly");
    expect(source).toContain("/api/auth/better/sign-up/email");
    expect(source).toContain("/api/auth/better/sign-in/email");
    expect(source).toContain("/api/onboarding/complete");
    expect(source).not.toContain('heading", { name: "Welcome to GrantPipe" }');
    expect(source).not.toContain('button", { name: "Start your free trial" }');
    expect(source).not.toContain('button", { name: "Show me how it works" }');
  });

  it("ships generated accounting reconciliation scenarios", () => {
    expect(ACCOUNTING_RECONCILIATION_STRESS_SCENARIOS.map((scenario) => scenario.key)).toEqual([
      "bank-import-match-reconcile",
      "ofx-ignore-unmatch-guardrails",
    ]);
    expect(
      ACCOUNTING_RECONCILIATION_STRESS_SCENARIOS.every(
        (scenario) => scenario.bankTransactions.length >= 2,
      ),
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

  it("marks an expected accounting reconciliation scenario result as passing", () => {
    const scenario = ACCOUNTING_RECONCILIATION_STRESS_SCENARIOS[0]!;
    const result = evaluateScenarioResult(scenario, {
      accountCount: 3,
      periodStatus: "open",
      unbalancedJournalRejected: true,
      unbalancedJournalStatus: 400,
      journalLineCount: 2,
      imported: 3,
      duplicateImported: 0,
      duplicateRows: 3,
      unmatchedBefore: 3,
      matchedStatus: "matched",
      ignoredStatus: "ignored",
      unmatchedAfterUnmatchStatus: "unmatched",
      outOfBalanceRejected: true,
      outOfBalanceStatus: 400,
      badReconciliationCancelled: true,
      badReconciliationCancelStatus: 204,
      completedReconciliation: true,
      duplicateCompleteRejected: true,
      duplicateCompleteStatus: 400,
      lockedReversalRejected: true,
      lockedReversalStatus: 403,
      finalMatchedCount: 1,
      finalIgnoredCount: 1,
      trialBalanceRows: [
        {
          code: "E2E-CASH",
          debitTotal: 500000,
          creditTotal: 0,
          balance: 500000,
        },
        {
          code: "E2E-REV",
          debitTotal: 0,
          creditTotal: 500000,
          balance: 500000,
        },
        {
          code: "E2E-EXP",
          debitTotal: 0,
          creditTotal: 0,
          balance: 0,
        },
      ],
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("fails mismatched accounting reconciliation results", () => {
    const scenario = ACCOUNTING_RECONCILIATION_STRESS_SCENARIOS[0]!;
    const result = evaluateScenarioResult(scenario, {
      accountCount: 2,
      periodStatus: "closed",
      unbalancedJournalRejected: false,
      unbalancedJournalStatus: 201,
      journalLineCount: 1,
      imported: 2,
      duplicateImported: 1,
      duplicateRows: 2,
      unmatchedBefore: 2,
      matchedStatus: "unmatched",
      ignoredStatus: "unmatched",
      unmatchedAfterUnmatchStatus: "matched",
      outOfBalanceRejected: false,
      outOfBalanceStatus: 200,
      badReconciliationCancelled: false,
      badReconciliationCancelStatus: 500,
      completedReconciliation: false,
      duplicateCompleteRejected: false,
      duplicateCompleteStatus: 200,
      lockedReversalRejected: false,
      lockedReversalStatus: 201,
      finalMatchedCount: 0,
      finalIgnoredCount: 0,
      trialBalanceRows: [
        {
          code: "E2E-CASH",
          debitTotal: 1,
          creditTotal: 0,
          balance: 1,
        },
        {
          code: "E2E-EXTRA",
          debitTotal: 1,
          creditTotal: 0,
          balance: 1,
        },
      ],
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toContain("accountCount expected 3, got 2");
    expect(result.failures).toContain("periodStatus expected open, got closed");
    expect(result.failures).toContain("unbalanced journal was not rejected");
    expect(result.failures).toContain("out-of-balance reconciliation was not rejected");
    expect(result.failures).toContain("duplicate reconciliation completion was not rejected");
    expect(result.failures).toContain("locked journal reversal was not rejected");
    expect(result.failures).toContain("badReconciliationCancelled expected true, got false");
    expect(result.failures).toContain("trial balance E2E-CASH debitTotal expected 500000, got 1");
    expect(result.failures).toContain("missing trial balance row E2E-REV");
    expect(result.failures).toContain("unexpected trial balance row E2E-EXTRA");
  });

  it("redacts emails and secret-like values from reports", () => {
    expect(
      redactForReport(
        'Email e2e-accounting@grantpipe.test password GrantPipe-secret-token-12345 "token":"abc123456789" Authorization: Bearer live-secret Cookie: session=abc',
      ),
    ).toBe(
      'Email [redacted-email] password [redacted-token] "token":"[redacted-token]" Authorization: Bearer [redacted-token] Cookie: [redacted-token]',
    );
  });

  it("falls back to one scenario when the stress limit is invalid", () => {
    expect(
      selectedScenarios({ GRANTPIPE_ACCOUNTING_RECONCILIATION_STRESS_LIMIT: "not-a-number" }),
    ).toHaveLength(1);
  });
});
