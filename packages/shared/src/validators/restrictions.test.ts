import { describe, expect, it } from "vitest";
import {
  createRestrictionAdditionSchema,
  createRestrictionEvidenceLinkSchema,
  createRestrictionReleaseSchema,
  createRestrictionTermSchema,
  restrictedRollforwardFilterSchema,
  restrictedRollforwardExportSchema,
  restrictionAlertFilterSchema,
  restrictionBalanceSnapshotSchema,
  updateRestrictionTermSchema,
} from "./restrictions";

describe("restriction validators", () => {
  const baseTerm = {
    restrictionType: "purpose",
    source: "donor",
    title: "Scholarship restriction",
    fundId: "fund-1",
    purposeStatement: "Scholarships only",
    beginningBalanceCents: 100_00,
  };

  it("requires purpose statement and end date based on lifecycle type", () => {
    expect(createRestrictionTermSchema.safeParse(baseTerm).success).toBe(true);
    expect(
      createRestrictionTermSchema.safeParse({
        ...baseTerm,
        restrictionType: "purpose",
        purposeStatement: "",
      }).success,
    ).toBe(false);
    expect(
      createRestrictionTermSchema.safeParse({
        ...baseTerm,
        restrictionType: "time",
        purposeStatement: undefined,
      }).success,
    ).toBe(false);
    expect(
      createRestrictionTermSchema.safeParse({
        ...baseTerm,
        restrictionType: "purpose_and_time",
        endDate: "2026-12-31T00:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("rejects a term whose end date precedes its start date", () => {
    const result = createRestrictionTermSchema.safeParse({
      ...baseTerm,
      startDate: "2026-12-31T00:00:00.000Z",
      endDate: "2026-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("endDate"))).toBe(true);
    }
  });

  it("accepts a term whose start and end dates are equal", () => {
    expect(
      createRestrictionTermSchema.safeParse({
        ...baseTerm,
        startDate: "2026-06-01T00:00:00.000Z",
        endDate: "2026-06-01T00:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("rejects a term update whose end date precedes its start date", () => {
    expect(
      updateRestrictionTermSchema.safeParse({
        startDate: "2026-12-31T00:00:00.000Z",
        endDate: "2026-01-01T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("requires a linked source for new terms but allows partial updates", () => {
    expect(
      createRestrictionTermSchema.safeParse({
        restrictionType: "board_designated",
        source: "board",
        title: "Operating reserve",
        beginningBalanceCents: 0,
      }).success,
    ).toBe(false);
  });

  it("requires positive integer cents for additions and releases", () => {
    expect(
      createRestrictionAdditionSchema.safeParse({
        amountCents: 1,
        date: "2026-05-02T00:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(
      createRestrictionReleaseSchema.safeParse({
        amountCents: 0,
        date: "2026-05-02T00:00:00.000Z",
        reason: "bad",
      }).success,
    ).toBe(false);
  });

  it("requires exactly one evidence target", () => {
    expect(
      createRestrictionEvidenceLinkSchema.safeParse({
        documentId: "doc-1",
        label: "Invoice",
        evidenceType: "invoice",
      }).success,
    ).toBe(true);
    expect(
      createRestrictionEvidenceLinkSchema.safeParse({
        documentId: "doc-1",
        generatedReportId: "report-1",
        label: "Both",
        evidenceType: "report",
      }).success,
    ).toBe(false);
    expect(
      createRestrictionEvidenceLinkSchema.safeParse({
        label: "Neither",
        evidenceType: "report",
      }).success,
    ).toBe(false);
  });

  it("requires valid rollforward period ranges", () => {
    expect(
      restrictedRollforwardFilterSchema.safeParse({
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-12-31T00:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(
      restrictedRollforwardFilterSchema.safeParse({
        periodStart: "2026-12-31T00:00:00.000Z",
        periodEnd: "2026-01-01T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("accepts alert filters with no period or one period bound", () => {
    expect(restrictionAlertFilterSchema.safeParse({ fundId: "fund-1" }).success).toBe(true);
    expect(
      restrictionAlertFilterSchema.safeParse({
        periodStart: "2026-01-01T00:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(
      restrictionAlertFilterSchema.safeParse({
        periodStart: "2026-12-31T00:00:00.000Z",
        periodEnd: "2026-01-01T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("validates balance snapshots and rejects inverted snapshot periods", () => {
    const snapshot = {
      restrictionTermId: "term-1",
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-12-31T00:00:00.000Z",
      beginningBalanceCents: 100,
      additionsCents: 50,
      releasesCents: 25,
      endingBalanceCents: 125,
      source: "rollforward_generation",
    };
    expect(restrictionBalanceSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(
      restrictionBalanceSnapshotSchema.safeParse({
        ...snapshot,
        periodStart: "2026-12-31T00:00:00.000Z",
        periodEnd: "2026-01-01T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("requires a UUID attempt id for rollforward exports", () => {
    const attemptId = "f7bc1df2-5375-4a8e-a43d-c61f863a034b";
    const input = {
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-12-31T23:59:59.999Z",
      attemptId,
    };
    expect(restrictedRollforwardExportSchema.parse(input).attemptId).toBe(attemptId);
    expect(
      restrictedRollforwardExportSchema.safeParse({ ...input, attemptId: undefined }).success,
    ).toBe(false);
    expect(
      restrictedRollforwardExportSchema.safeParse({ ...input, attemptId: "bad" }).success,
    ).toBe(false);
  });
});
