import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PROGRAM_ALLOCATION_STRESS_SCENARIOS,
  assertProductionWrapper,
  evaluateScenarioResult,
  redactForReport,
  selectedScenarios,
} from "../e2e-adhoc/program-allocation-prod-stress.mjs";

describe("program allocation production stress harness", () => {
  it("uses a file-url CLI guard so relative script paths execute", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/program-allocation-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain('import { pathToFileURL } from "node:url"');
    expect(source).toContain('pathToFileURL(process.argv[1] ?? "").href');
  });

  it("uses direct auth and API onboarding instead of stale UI onboarding", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/program-allocation-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain("/api/auth/better/sign-up/email");
    expect(source).toContain("/api/auth/better/sign-in/email");
    expect(source).toContain("/api/onboarding/complete");
    expect(source).not.toContain('heading", { name: "Welcome to GrantPipe" }');
  });

  it("ships generated program budget and allocation scenarios", () => {
    expect(PROGRAM_ALLOCATION_STRESS_SCENARIOS.map((scenario) => scenario.key)).toEqual([
      "balanced-budget-actuals",
      "allocation-guardrails",
    ]);
    expect(
      PROGRAM_ALLOCATION_STRESS_SCENARIOS.every((scenario) => scenario.programs.length >= 2),
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

  it("marks an expected program allocation scenario result as passing", () => {
    const scenario = PROGRAM_ALLOCATION_STRESS_SCENARIOS[0]!;
    const result = evaluateScenarioResult(scenario, {
      createdProgramCount: 2,
      searchMatchedProgramCount: 2,
      updatedProgramStatus: "active",
      budgetStatus: "approved",
      budgetLineCount: 3,
      grantAllocationCount: 2,
      grantOverAllocationWarning: false,
      expenseAllocationCount: 2,
      expenseAllocationWarning: false,
      invalidExpenseAllocationRejected: true,
      invalidExpenseAllocationStatus: 400,
      detailBudgetCount: 1,
      detailGrantAllocationCount: 1,
      detailExpenseAllocationCount: 1,
      budgetVsActualRows: [
        {
          programCode: "E2E-PROG-A",
          category: "Program supplies",
          budgetedCents: 450000,
          actualCents: 300000,
          remainingCents: 150000,
        },
        {
          programCode: "E2E-PROG-A",
          category: "Staff training",
          budgetedCents: 120000,
          actualCents: 0,
          remainingCents: 120000,
        },
        {
          programCode: "E2E-PROG-A",
          category: "Mileage",
          budgetedCents: 80000,
          actualCents: 0,
          remainingCents: 80000,
        },
        {
          programCode: "E2E-PROG-B",
          category: "Program supplies",
          budgetedCents: 300000,
          actualCents: 200000,
          remainingCents: 100000,
        },
      ],
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("fails mismatched program allocation results", () => {
    const scenario = PROGRAM_ALLOCATION_STRESS_SCENARIOS[0]!;
    const result = evaluateScenarioResult(scenario, {
      createdProgramCount: 1,
      searchMatchedProgramCount: 1,
      updatedProgramStatus: "archived",
      budgetStatus: "draft",
      budgetLineCount: 1,
      grantAllocationCount: 1,
      grantOverAllocationWarning: true,
      expenseAllocationCount: 1,
      expenseAllocationWarning: true,
      invalidExpenseAllocationRejected: false,
      invalidExpenseAllocationStatus: 200,
      detailBudgetCount: 0,
      detailGrantAllocationCount: 0,
      detailExpenseAllocationCount: 0,
      budgetVsActualRows: [
        {
          programCode: "E2E-PROG-A",
          category: "Program supplies",
          budgetedCents: 450000,
          actualCents: 1,
          remainingCents: 449999,
        },
        {
          programCode: "E2E-PROG-X",
          category: "Unexpected",
          budgetedCents: 1,
          actualCents: 0,
          remainingCents: 1,
        },
      ],
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toContain("createdProgramCount expected 2, got 1");
    expect(result.failures).toContain("updatedProgramStatus expected active, got archived");
    expect(result.failures).toContain("budgetStatus expected approved, got draft");
    expect(result.failures).toContain("grant over-allocation warning was unexpected");
    expect(result.failures).toContain("invalid expense allocation was not rejected");
    expect(result.failures).toContain(
      "budget-vs-actual E2E-PROG-A/Program supplies actualCents expected 300000, got 1",
    );
    expect(result.failures).toContain("missing budget-vs-actual row E2E-PROG-B/Program supplies");
    expect(result.failures).toContain("unexpected budget-vs-actual row E2E-PROG-X/Unexpected");
  });

  it("redacts emails and secret-like values from reports", () => {
    expect(
      redactForReport(
        'Email e2e-program@grantpipe.test password GrantPipe-secret-token-12345 "token":"abc123456789" Authorization: Bearer live-secret Cookie: session=abc',
      ),
    ).toBe(
      'Email [redacted-email] password [redacted-token] "token":"[redacted-token]" Authorization: Bearer [redacted-token] Cookie: [redacted-token]',
    );
  });

  it("falls back to one scenario when the stress limit is invalid", () => {
    expect(
      selectedScenarios({ GRANTPIPE_PROGRAM_ALLOCATION_STRESS_LIMIT: "not-a-number" }),
    ).toHaveLength(1);
  });
});
