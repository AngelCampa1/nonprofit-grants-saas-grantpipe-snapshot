import { describe, expect, it } from "vitest";
import { federalAwardMetadataSchema, updateFederalAwardMetadataSchema } from "./federal-awards";

describe("federalAwardMetadataSchema", () => {
  it("accepts SEFA-ready federal award metadata", () => {
    const result = federalAwardMetadataSchema.safeParse({
      grantId: "grant-1",
      assistanceListingNumber: "14.218",
      federalAgency: "Department of Housing and Urban Development",
      fain: "B-26-MC-11-0001",
      passThroughEntityName: "District of Columbia",
      passThroughIdentifyingNumber: "PT-2026-001",
      programName: "Community Development Block Grant",
      clusterName: "CDBG Entitlement Grants",
      sefaInclusionType: "cash",
    });

    expect(result.success).toBe(true);
  });

  it("requires grant id and inclusion type while allowing missing ALN and agency warnings", () => {
    const result = federalAwardMetadataSchema.safeParse({});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(
        expect.arrayContaining(["grantId", "sefaInclusionType"]),
      );
      expect(result.error.issues.map((issue) => issue.path.join("."))).not.toEqual(
        expect.arrayContaining(["assistanceListingNumber", "federalAgency"]),
      );
    }
  });

  it("accepts incomplete federal award metadata so SEFA warnings can be shown", () => {
    const result = federalAwardMetadataSchema.safeParse({
      grantId: "grant-1",
      assistanceListingNumber: null,
      federalAgency: null,
      sefaInclusionType: "cash",
    });

    expect(result.success).toBe(true);
  });

  it("accepts partial metadata updates without clearing required persisted fields", () => {
    expect(
      updateFederalAwardMetadataSchema.safeParse({
        passThroughEntityName: "State pass-through office",
      }).success,
    ).toBe(true);
  });

  it("rejects empty optional strings when metadata is updated", () => {
    expect(updateFederalAwardMetadataSchema.safeParse({ fain: "" }).success).toBe(false);
  });

  it("rejects blank ALN and agency values when they are supplied", () => {
    const result = updateFederalAwardMetadataSchema.safeParse({
      assistanceListingNumber: "",
      federalAgency: "",
    });

    expect(result.success).toBe(false);
  });
});
