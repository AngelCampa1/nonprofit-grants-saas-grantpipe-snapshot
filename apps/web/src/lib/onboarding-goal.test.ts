import { describe, expect, it } from "vitest";
import type { GuideKey } from "@grantpipe/shared";
import { ahaRouteForGoal, checklistOrderForGoal } from "./onboarding-goal";

describe("ahaRouteForGoal", () => {
  it("returns /funds for grants goal", () => {
    expect(ahaRouteForGoal("grants")).toBe("/funds");
  });

  it("returns /reports for compliance goal", () => {
    expect(ahaRouteForGoal("compliance")).toBe("/reports");
  });

  it("returns /dashboard for donors goal", () => {
    expect(ahaRouteForGoal("donors")).toBe("/dashboard");
  });

  it("returns /dashboard for null", () => {
    expect(ahaRouteForGoal(null)).toBe("/dashboard");
  });

  it("returns /dashboard for undefined", () => {
    expect(ahaRouteForGoal(undefined)).toBe("/dashboard");
  });

  it("pins the full aha-route map so nav consolidation cannot silently break it", () => {
    expect({
      grants: ahaRouteForGoal("grants"),
      compliance: ahaRouteForGoal("compliance"),
      donors: ahaRouteForGoal("donors"),
    }).toEqual({
      grants: "/funds",
      compliance: "/reports",
      donors: "/dashboard",
    });
  });
});

const CHECKLIST_KEYS: GuideKey[] = [
  "first_setup",
  "import_contacts",
  "create_grant",
  "generate_report",
  "open_pdf_report",
];

describe("checklistOrderForGoal", () => {
  it("returns donor-first order for donors goal", () => {
    const result = checklistOrderForGoal("donors");
    expect(result).toEqual<GuideKey[]>([
      "import_contacts",
      "first_setup",
      "create_grant",
      "generate_report",
      "open_pdf_report",
    ]);
  });

  it("returns grant-first order for grants goal", () => {
    const result = checklistOrderForGoal("grants");
    expect(result).toEqual<GuideKey[]>([
      "create_grant",
      "import_contacts",
      "first_setup",
      "generate_report",
      "open_pdf_report",
    ]);
  });

  it("returns grant-first order for compliance goal", () => {
    const result = checklistOrderForGoal("compliance");
    expect(result).toEqual<GuideKey[]>([
      "create_grant",
      "import_contacts",
      "first_setup",
      "generate_report",
      "open_pdf_report",
    ]);
  });

  it("returns default order for null", () => {
    const result = checklistOrderForGoal(null);
    expect(result).toEqual<GuideKey[]>([
      "first_setup",
      "import_contacts",
      "create_grant",
      "generate_report",
      "open_pdf_report",
    ]);
  });

  it("returns default order for undefined", () => {
    const result = checklistOrderForGoal(undefined);
    expect(result).toEqual<GuideKey[]>([
      "first_setup",
      "import_contacts",
      "create_grant",
      "generate_report",
      "open_pdf_report",
    ]);
  });

  it("returns all 5 checklist keys for every goal", () => {
    for (const goal of ["donors", "grants", "compliance", null, undefined] as const) {
      const result = checklistOrderForGoal(goal);
      expect(result).toHaveLength(5);
      for (const key of CHECKLIST_KEYS) {
        expect(result).toContain(key);
      }
    }
  });
});
