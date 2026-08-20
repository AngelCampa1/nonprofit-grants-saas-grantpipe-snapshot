import { describe, expect, it } from "vitest";
import {
  createCorrectiveActionSchema,
  createFindingSchema,
  createMonitoringLogSchema,
  createRiskAssessmentSchema,
  createSubawardSchema,
  createSubrecipientSchema,
  generateMonitoringTasksSchema,
  subrecipientListSchema,
  updateCorrectiveActionSchema,
  updateSubawardSchema,
} from "./subrecipients";

const iso = "2026-05-06T12:00:00.000Z";

describe("subrecipient monitoring validators", () => {
  it("accepts a complete subrecipient and subaward payload", () => {
    expect(
      createSubrecipientSchema.parse({
        name: "Community Partner",
        uei: "ABC123456789",
        primaryContactId: "contact-1",
        status: "active",
        ownerId: "user-1",
        notes: "Long-running implementation partner",
      }),
    ).toMatchObject({ name: "Community Partner", status: "active" });

    expect(
      createSubawardSchema.parse({
        grantId: "grant-1",
        title: "Youth services subaward",
        subawardNumber: "SA-2026-001",
        amountCents: 1250000,
        startDate: iso,
        endDate: "2026-12-31T12:00:00.000Z",
        status: "active",
        scopeSummary: "Deliver after-school services",
      }),
    ).toMatchObject({ amountCents: 1250000, status: "active" });
  });

  it("rejects invalid money, dates, statuses, and empty names", () => {
    expect(() => createSubrecipientSchema.parse({ name: "" })).toThrow();
    expect(() =>
      createSubawardSchema.parse({
        grantId: "grant-1",
        title: "Bad subaward",
        amountCents: -1,
        startDate: iso,
        endDate: iso,
      }),
    ).toThrow();
    expect(() =>
      updateSubawardSchema.parse({
        status: "bogus",
      }),
    ).toThrow();
    expect(() =>
      createSubawardSchema.parse({
        grantId: "grant-1",
        title: "Bad dates",
        amountCents: 100,
        startDate: "2026-12-31T12:00:00.000Z",
        endDate: iso,
      }),
    ).toThrow("Start date must be before or equal to end date");
  });

  it("requires override reasons when risk assessments override suggested risk", () => {
    const base = {
      checklist: {
        priorFindings: "yes",
        newPartner: "no",
        complexRequirements: "yes",
        highDollarAward: "no",
        weakControls: "unknown",
      },
      suggestedRiskRating: "high",
    };

    expect(createRiskAssessmentSchema.parse(base)).toMatchObject({
      suggestedRiskRating: "high",
      finalRiskRating: "high",
    });
    expect(() =>
      createRiskAssessmentSchema.parse({
        ...base,
        finalRiskRating: "medium",
      }),
    ).toThrow("Manual overrides require a reason");
    expect(
      createRiskAssessmentSchema.parse({
        ...base,
        finalRiskRating: "medium",
        overrideReason: "Recent monitoring cleared the prior concern.",
      }),
    ).toMatchObject({ finalRiskRating: "medium" });
  });

  it("validates monitoring tasks, logs, findings, corrective actions, and filters", () => {
    expect(generateMonitoringTasksSchema.parse({ riskRating: "high" })).toEqual({
      riskRating: "high",
    });
    expect(
      createMonitoringLogSchema.parse({
        logType: "desk_review",
        title: "Desk review",
        occurredAt: iso,
        summary: "Reviewed invoices and reports.",
      }),
    ).toMatchObject({ logType: "desk_review" });
    expect(
      createFindingSchema.parse({
        title: "Missing procurement support",
        severity: "high",
        status: "open",
        description: "Invoices did not include required support.",
      }),
    ).toMatchObject({ severity: "high" });
    expect(
      createCorrectiveActionSchema.parse({
        findingId: "finding-1",
        title: "Upload support",
        dueDate: iso,
        status: "open",
      }),
    ).toMatchObject({ findingId: "finding-1" });
    expect(
      subrecipientListSchema.parse({
        page: "2",
        pageSize: "10",
        status: "watchlist",
        riskRating: "high",
        overdueTasks: "true",
        openFindings: "false",
      }),
    ).toMatchObject({ page: 2, pageSize: 10, overdueTasks: true, openFindings: false });
  });

  it("does not allow re-parenting a corrective action to another finding on update", () => {
    const parsed = updateCorrectiveActionSchema.parse({
      findingId: "finding-in-another-org",
      title: "Updated title",
    });
    expect(parsed).not.toHaveProperty("findingId");
    expect(parsed).toMatchObject({ title: "Updated title" });
  });

  it("still allows updating mutable corrective action fields", () => {
    expect(
      updateCorrectiveActionSchema.parse({
        title: "Upload revised support",
        status: "completed",
        resolutionNotes: "Resolved after document upload.",
      }),
    ).toMatchObject({ title: "Upload revised support", status: "completed" });
  });
});
