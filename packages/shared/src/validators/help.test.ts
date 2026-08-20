import { describe, expect, it } from "vitest";
import {
  GUIDE_KEYS,
  GUIDE_PROGRESS_STATUSES,
  guideKeySchema,
  guideParamsSchema,
  guideProgressRowSchema,
  updateGuideProgressSchema,
} from "./help";

describe("help guide validators", () => {
  it("defines the approved guide keys", () => {
    expect(GUIDE_KEYS).toEqual([
      "product_tour",
      "first_setup",
      "import_contacts",
      "record_donation",
      "track_pledges",
      "create_grant",
      "restricted_funds",
      "budget_sentinel",
      "generate_report",
      "statement_of_activities_report",
      "functional_expenses_report",
      "open_pdf_report",
      "invite_teammate",
    ]);
  });

  it("accepts only known guide keys", () => {
    expect(guideKeySchema.parse("product_tour")).toBe("product_tour");
    expect(guideKeySchema.parse("open_pdf_report")).toBe("open_pdf_report");
    expect(guideKeySchema.parse("functional_expenses_report")).toBe("functional_expenses_report");
    expect(guideParamsSchema.parse({ guideKey: "first_setup" })).toEqual({
      guideKey: "first_setup",
    });
    expect(() => guideKeySchema.parse("unknown")).toThrow();
  });

  it("defines progress statuses", () => {
    expect(GUIDE_PROGRESS_STATUSES).toEqual([
      "not_started",
      "in_progress",
      "completed",
      "dismissed",
    ]);
  });

  it("validates update payloads and trims lastStep", () => {
    expect(
      updateGuideProgressSchema.parse({
        status: "in_progress",
        lastStep: "  upload CSV  ",
      }),
    ).toEqual({
      status: "in_progress",
      lastStep: "upload CSV",
    });
  });

  it("validates progress rows returned by the API", () => {
    const row = guideProgressRowSchema.parse({
      guideKey: "first_setup",
      status: "completed",
      lastStep: "dashboard",
      completedAt: "2026-04-23T12:00:00.000Z",
      dismissedAt: null,
      updatedAt: "2026-04-23T12:00:00.000Z",
    });

    expect(row.guideKey).toBe("first_setup");
  });
});
