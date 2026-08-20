import { expect, test } from "@playwright/test";
import { createE2ECredentials, signUpAndCompleteOnboarding } from "./helpers/auth";

test.setTimeout(420_000);

async function selectEntityType(page: import("@playwright/test").Page, label: string) {
  await page.getByLabel("Entity type").click();
  await page.getByRole("option", { name: label }).click();
}

async function uploadCsv(page: import("@playwright/test").Page, name: string, csv: string) {
  await page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
}

async function previewAndCommitCsv(params: {
  page: import("@playwright/test").Page;
  entityType: string;
  fileName: string;
  csv: string;
}) {
  await selectEntityType(params.page, params.entityType);
  await uploadCsv(params.page, params.fileName, params.csv);
  await params.page.getByRole("button", { name: "Preview import" }).click();
  await expect(params.page.getByText("rows detected")).toBeVisible();
  await params.page.getByRole("button", { name: "Commit import" }).click();
  await expect(params.page.getByText(/Import finished:/)).toBeVisible();
}

async function getAccountingSeed(page: import("@playwright/test").Page) {
  return page.evaluate(async () => {
    async function loadAccounts() {
      const response = await fetch("/api/accounting/accounts?pageSize=500");
      if (!response.ok) throw new Error("Unable to load accounting accounts for import E2E.");
      return (await response.json()) as Array<{
        id: string;
        code: string;
        name: string;
      }>;
    }

    async function loadPeriods() {
      const response = await fetch("/api/accounting/periods");
      if (!response.ok) throw new Error("Unable to load accounting periods for import E2E.");
      return (await response.json()) as Array<{
        id: string;
        status: string;
        startDate: string;
      }>;
    }

    let accounts = await loadAccounts();
    if (accounts.length === 0) {
      const seedResponse = await fetch("/api/accounting/accounts/seed", { method: "POST" });
      if (!seedResponse.ok) throw new Error("Unable to seed chart of accounts for import E2E.");
      accounts = await loadAccounts();
    }

    let periods = await loadPeriods();
    let openPeriod = periods.find((period) => period.status === "open");
    if (!openPeriod) {
      const createPeriodResponse = await fetch("/api/accounting/periods", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "E2E Migration Period",
          startDate: "2026-01-01T00:00:00.000Z",
          endDate: "2026-12-31T23:59:59.999Z",
        }),
      });
      if (!createPeriodResponse.ok) {
        throw new Error("Unable to create fiscal period for import E2E.");
      }
      periods = await loadPeriods();
      openPeriod = periods.find((period) => period.status === "open");
    }

    const cashAccount = accounts.find((account) => account.code === "1000") ?? accounts[0];
    if (!cashAccount || !openPeriod) {
      throw new Error("Accounting setup did not include an account and open fiscal period.");
    }

    return {
      accountId: cashAccount.id,
      accountCode: cashAccount.code,
      fiscalPeriodId: openPeriod.id,
      entryDate: openPeriod.startDate.slice(0, 10),
    };
  });
}

test("CSV import persists names and grant amount/allocation summaries stay in sync", async ({
  page,
}) => {
  const credentials = createE2ECredentials();
  await signUpAndCompleteOnboarding(page, credentials, "/app/signup?plan=growth&cycle=monthly", {
    expectFundsLanding: false,
  });

  // F5: Import contacts using snake_case CSV headers and verify names persist.
  await page.goto("/app/import");
  await uploadCsv(
    page,
    "grantpipe-contacts.csv",
    "first_name,last_name,email\nGrace,Hopper,grace@example.com",
  );
  await page.getByRole("button", { name: "Preview import" }).click();
  await expect(page.getByText("rows detected")).toBeVisible();
  await page.getByRole("button", { name: "Commit import" }).click();
  await expect(page.getByText(/Import finished:/)).toBeVisible();

  await page.goto("/app/donors");
  await expect(page.getByRole("link", { name: "Grace Hopper" })).toBeVisible();

  // Funder + fund scaffolding for the grant flow.
  await page.goto("/app/funders");
  await page.getByRole("button", { name: "Add funder" }).click();
  await page.getByRole("textbox", { name: "Funder name" }).fill("Regression Funder");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("dialog", { name: "Add funder" })).toBeHidden();

  await page.goto("/app/funds");
  await page.getByRole("button", { name: "Add fund" }).click();
  await page.getByRole("textbox", { name: "Fund name" }).fill("Regression Fund");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("dialog", { name: "Create fund" })).toBeHidden();

  await page.goto("/app/grants");
  await page.getByRole("button", { name: "Add grant" }).click();
  await page.getByRole("textbox", { name: "Grant name" }).fill("Regression Grant");
  await page.getByRole("combobox", { name: "grant-funder-select" }).click();
  await page.getByRole("option", { name: "Regression Funder" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  const createGrantResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/grants") &&
      response.request().method() === "POST" &&
      response.status() === 201,
  );
  await page.getByRole("button", { name: "Add" }).click();
  await createGrantResponse;

  await page.getByRole("link", { name: "Regression Grant" }).click();
  await expect(page.getByRole("heading", { name: "Regression Grant" })).toBeVisible();

  // F3: set the grant amount.
  const amountInput = page.getByLabel("Grant amount (USD)");
  await amountInput.fill("100000");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("$100,000").first()).toBeVisible();

  // F2: adding an allocation immediately updates the "Allocated" summary card.
  await page.getByRole("tab", { name: "Allocations" }).click();
  await page.getByRole("button", { name: "Add allocation" }).click();
  await page.getByRole("combobox", { name: "Fund" }).click();
  await page.getByRole("option", { name: "Regression Fund" }).click();
  await page.getByRole("spinbutton", { name: "Amount (USD)" }).fill("30000");
  await page.getByRole("button", { name: "Save allocation" }).click();

  const allocatedCard = page
    .getByText("Allocated", { exact: true })
    .locator("xpath=ancestor::*[contains(@class,'rounded') or @data-slot='card'][1]");
  await expect(allocatedCard).toContainText("$30,000");
});

test("Migration Studio imports mapped contacts, funds, opening balances, and pledges", async ({
  page,
}) => {
  const credentials = createE2ECredentials();
  await signUpAndCompleteOnboarding(page, credentials, "/app/signup", {
    expectFundsLanding: false,
  });

  await page.goto("/app/import");

  await selectEntityType(page, "Contacts");
  await uploadCsv(
    page,
    "mapped-contacts.csv",
    "fname,lname,email_addr\nAda,Lovelace,ada@example.com",
  );
  await page.getByRole("button", { name: "Preview import" }).click();
  await expect(page.getByText("1 rows detected")).toBeVisible();

  await page.getByLabel("Map firstName").click();
  await page.getByRole("option", { name: "fname" }).click();
  await page.getByLabel("Map lastName").click();
  await page.getByRole("option", { name: "lname" }).click();
  await page.getByLabel("Map email").click();
  await page.getByRole("option", { name: "email_addr" }).click();

  await page.getByRole("button", { name: "Commit import" }).click();
  await expect(page.getByText(/Import finished: 1 inserted/)).toBeVisible();

  await previewAndCommitCsv({
    page,
    entityType: "Funds",
    fileName: "funds.csv",
    csv: [
      "externalId,name,type,restrictionPurpose,restrictionSource,startDate,status",
      "fund-e2e-1,Migration Studio Fund,temporarily_restricted,Food access,Foundation,2026-01-01,active",
    ].join("\n"),
  });

  const accounting = await getAccountingSeed(page);

  await selectEntityType(page, "Opening balances");
  await uploadCsv(
    page,
    "unbalanced-opening-balances.csv",
    [
      "accountCode,debit,credit,fiscalPeriodId,date,memo",
      `${accounting.accountCode},100,,${accounting.fiscalPeriodId},${accounting.entryDate},Unbalanced test`,
      `${accounting.accountCode},,50,${accounting.fiscalPeriodId},${accounting.entryDate},Unbalanced test`,
    ].join("\n"),
  );
  await page.getByRole("button", { name: "Preview import" }).click();
  await expect(page.getByText("Opening balance reconciliation")).toBeVisible();
  await expect(page.getByText("Not balanced")).toBeVisible();
  await page.getByRole("button", { name: "Commit import" }).click();
  await expect(page.getByText(/Import finished: 0 inserted/)).toBeVisible();
  await expect(
    page.getByRole("status").getByText(/Opening balance debits must equal credits/),
  ).toBeVisible();

  await previewAndCommitCsv({
    page,
    entityType: "Opening balances",
    fileName: "balanced-opening-balances.csv",
    csv: [
      "accountCode,debit,credit,fiscalPeriodId,date,memo",
      `${accounting.accountCode},100,,${accounting.fiscalPeriodId},${accounting.entryDate},Balanced test`,
      `${accounting.accountCode},,100,${accounting.fiscalPeriodId},${accounting.entryDate},Balanced test`,
    ].join("\n"),
  });

  const ledgerEntries = await page.evaluate(async (accountId) => {
    const response = await fetch(`/api/accounting/accounts/${accountId}/ledger?pageSize=25`);
    if (!response.ok) throw new Error("Unable to load account ledger.");
    const ledger = (await response.json()) as {
      lines?: Array<{
        journalEntry: { source: string; memo: string | null };
      }>;
    };
    return ledger.lines ?? [];
  }, accounting.accountId);
  expect(
    ledgerEntries.some(
      (entry) =>
        entry.journalEntry.source === "opening_balance" &&
        entry.journalEntry.memo === "Imported opening balances from balanced-opening-balances.csv",
    ),
  ).toBe(true);

  await previewAndCommitCsv({
    page,
    entityType: "Pledge schedules",
    fileName: "pledges.csv",
    csv: [
      "externalPledgeId,contactEmail,pledgeDate,dueDate,amount,netAssetClass,hasBarrier,hasRightOfReturn",
      "pledge-e2e-1,ada@example.com,2026-02-01,2026-03-01,25,temporarily_restricted,false,false",
      "pledge-e2e-1,ada@example.com,2026-02-01,2026-04-01,25,temporarily_restricted,false,false",
    ].join("\n"),
  });

  const billingSelection = await page.request.patch("/api/org/billing/selection", {
    data: { planTier: "growth", billingCycle: "monthly" },
    failOnStatusCode: false,
  });
  expect(billingSelection.ok()).toBe(true);

  const pledges = await page.evaluate(async () => {
    const response = await fetch("/api/pledges?pageSize=25");
    if (!response.ok) throw new Error(`Unable to load pledges: ${response.status}`);
    return (await response.json()) as { pledges?: Array<{ faceAmountCents: number }> };
  });
  expect(pledges.pledges?.some((pledge) => pledge.faceAmountCents === 5000)).toBe(true);

  await expect(
    page.getByTestId("import-history-entry").filter({ hasText: "pledges.csv" }),
  ).toContainText("Pledges");
});
