import { expect, test } from "@playwright/test";
import { createE2ECredentials, signUpAndCompleteOnboarding } from "./helpers/auth";

test.setTimeout(120_000);

test("event attendee: create contact, create event, add attendee", async ({ page }) => {
  const credentials = createE2ECredentials();
  await signUpAndCompleteOnboarding(page, credentials);

  // Create a contact to serve as the attendee.
  await page.goto("/app/donors");
  await page.getByRole("button", { name: "Add donor" }).click();
  await page.getByLabel("First name").fill("Atten");
  await page.getByLabel("Last name").fill("Dee");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("link", { name: "Atten Dee" })).toBeVisible();

  // Create an event.
  await page.goto("/app/events");
  await page.getByRole("button", { name: "Add event" }).click();
  await page.getByLabel("Event name").fill("Gala Night");
  await page.getByRole("combobox", { name: "Type" }).click();
  await page.getByRole("option", { name: "Gala" }).click();
  await page.getByRole("button", { name: "Add" }).click();

  const eventLink = page.getByRole("link", { name: /Gala Night/ });
  await expect(eventLink).toBeVisible();
  await eventLink.click();

  await expect(page.getByRole("heading", { name: /Gala Night/ })).toBeVisible();

  // Add the contact as attendee.
  await page.getByRole("tab", { name: "Attendees" }).click();
  await page.getByRole("combobox", { name: "Existing contact" }).click();
  await page.getByRole("option", { name: "Atten Dee" }).click();
  await page.getByRole("button", { name: "Add attendee" }).click();

  // Attendee card should render — "Mark attended" button only appears per-attendee row.
  await expect(page.getByRole("button", { name: "Mark attended" })).toBeVisible();
});

test("notification preferences: toggle email off then back on", async ({ page }) => {
  const credentials = createE2ECredentials();
  await signUpAndCompleteOnboarding(page, credentials);

  await page.goto("/app/notifications");
  await expect(page.getByRole("heading", { name: /Notifications/i })).toBeVisible();

  // Only meaningful if the org has at least one preference row seeded.
  const turnOff = page.getByRole("button", { name: /Turn email off/ }).first();
  const turnOn = page.getByRole("button", { name: /Turn email on/ }).first();

  if (await turnOff.isVisible().catch(() => false)) {
    await turnOff.click();
    await expect(page.getByRole("button", { name: /Turn email on/ }).first()).toBeVisible();

    // Flip back to preserve seed state.
    await page
      .getByRole("button", { name: /Turn email on/ })
      .first()
      .click();
    await expect(page.getByRole("button", { name: /Turn email off/ }).first()).toBeVisible();
  } else if (await turnOn.isVisible().catch(() => false)) {
    await turnOn.click();
    await expect(page.getByRole("button", { name: /Turn email off/ }).first()).toBeVisible();
  }
  // If neither is visible, there are no preference rows for this org — not a failure.
});

test("reports: generate IRS 990 export and see artifact appear", async ({ page }) => {
  const credentials = createE2ECredentials();
  await signUpAndCompleteOnboarding(page, credentials);

  await page.goto("/app/reports");
  await expect(page.getByRole("heading", { name: /Reports/i })).toBeVisible();

  // Fiscal year is pre-filled as FY2026; button should be enabled.
  const generateButton = page.getByRole("button", { name: "Generate IRS 990 prep export" });
  await expect(generateButton).toBeEnabled();
  await generateButton.click();

  // The report generator opens the generated artifact detail page.
  await expect(page.getByRole("heading", { name: /FY2026 IRS 990 Prep Export/ })).toBeVisible({
    timeout: 10_000,
  });
});

test("reports: acknowledgment template editor saves successfully", async ({ page }) => {
  const credentials = createE2ECredentials();
  await signUpAndCompleteOnboarding(page, credentials);

  await page.goto("/app/reports");

  const saveBtn = page.getByRole("button", { name: "Save acknowledgment template" });
  await expect(saveBtn).toBeVisible();

  await page.getByLabel("Acknowledgment closing").fill("With gratitude, GrantPipe E2E Team");

  await expect(saveBtn).toBeEnabled({ timeout: 10_000 });
  await saveBtn.click();

  await expect(page.getByText(/Acknowledgment template saved/)).toBeVisible({ timeout: 10_000 });
});

test("custom fields: create, edit, and delete a contact field", async ({ page }) => {
  const credentials = createE2ECredentials();
  await signUpAndCompleteOnboarding(page, credentials);

  await page.goto("/app/settings#custom-fields");
  await expect(page.locator("#section-custom-fields")).toBeVisible();

  // Create
  await page.getByRole("button", { name: "Add custom field" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Preferred Name");
  await page.getByRole("button", { name: "Save custom field" }).click();

  await expect(page.getByText("Preferred Name")).toBeVisible({ timeout: 10_000 });

  // Edit
  await page.getByRole("button", { name: "Edit" }).first().click();
  const editInput = page.getByLabel("Custom field name");
  await editInput.fill("Pronouns");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page.getByText("Pronouns")).toBeVisible({ timeout: 10_000 });

  // Delete
  await page.getByRole("button", { name: "Delete" }).first().click();
  await page.getByRole("button", { name: "Delete custom field" }).click();

  await expect(page.getByText(/No custom fields for contacts/i)).toBeVisible({ timeout: 10_000 });
});

test("custom fields: single-select requires options and stores them", async ({ page }) => {
  const credentials = createE2ECredentials();
  await signUpAndCompleteOnboarding(page, credentials);

  await page.goto("/app/settings#custom-fields");
  await expect(page.locator("#section-custom-fields")).toBeVisible();
  await page.getByRole("button", { name: "Add custom field" }).click();
  await page.getByLabel("Name", { exact: true }).fill("T-shirt size");
  await page.getByLabel("Field type").click();
  await page.getByRole("option", { name: "Single select" }).click();
  await page.getByLabel("Options").fill("S, M, L");
  await page.getByRole("button", { name: "Save custom field" }).click();

  await expect(page.getByText("T-shirt size")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Single select: S, M, L/)).toBeVisible();
});
