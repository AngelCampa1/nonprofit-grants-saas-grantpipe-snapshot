import { describe, expect, it } from "vitest";
import {
  getMigrationSourcePlan,
  MIGRATION_ENTITY_LABELS,
  MIGRATION_SOURCE_IDS,
  normalizeMigrationSourceId,
} from "./migration-studio";

describe("migration studio plans", () => {
  it("publishes QuickBooks as a supported migration source", () => {
    expect(MIGRATION_SOURCE_IDS).toContain("quickbooks");
    expect(normalizeMigrationSourceId("quickbooks")).toBe("quickbooks");
  });

  it("falls back to generic CSV for unknown sources", () => {
    expect(normalizeMigrationSourceId("unknown")).toBe("generic");
    expect(getMigrationSourcePlan("unknown").label).toBe("Generic CSV");
  });

  it("orders the core onboarding migration from foundations to pledges", () => {
    const plan = getMigrationSourcePlan("bloomerang");

    expect(plan.recommendedOrder.map((step) => step.entityType)).toEqual([
      "contacts",
      "funds",
      "grants",
      "donations",
      "opening_balances",
      "pledges",
    ]);
    expect(plan.recommendedOrder.every((step) => step.status === "ready")).toBe(true);
  });

  it("marks QuickBooks as finance-cutover first and pledge schedules as template-backed", () => {
    const plan = getMigrationSourcePlan("quickbooks");

    expect(plan.summary).toContain("finance cutover");
    expect(plan.sourceNotes.join(" ")).toContain("opening balances");
    expect(
      plan.recommendedOrder.find((step) => step.entityType === "opening_balances"),
    ).toMatchObject({
      phase: "finance",
      status: "ready",
    });
    expect(plan.recommendedOrder.find((step) => step.entityType === "pledges")).toMatchObject({
      status: "needs_mapping",
    });
  });

  it("keeps user-facing labels for every importable entity", () => {
    expect(MIGRATION_ENTITY_LABELS).toEqual({
      contacts: "Contacts",
      donations: "Donation history",
      grants: "Grants",
      grant_opportunities: "Grant opportunities",
      funds: "Funds",
      opening_balances: "Opening balances",
      pledges: "Pledge schedules",
    });
  });
});
