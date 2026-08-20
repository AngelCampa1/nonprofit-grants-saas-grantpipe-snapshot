import { describe, expect, it } from "vitest";
import {
  GRANTPIPE_OS_BOILERPLATE,
  GRANTPIPE_OS_CATEGORY,
  GRANTPIPE_OS_MODULES,
  GRANTPIPE_OS_PLAN_LANGUAGE,
  getGrantPipeOsModuleList,
} from "./positioning";

const bannedPhrases = [
  new RegExp(["one", "operating system"].join(" "), "i"),
  new RegExp(["same", "operating system"].join(" "), "i"),
  new RegExp(["audit-ready", "reporting"].join(" "), "i"),
  new RegExp(["no", "consultants required"].join(" "), "i"),
  new RegExp(["30-day", "trial"].join(" "), "i"),
  new RegExp(["compliance-heavy", "nonprofits"].join(" "), "i"),
  new RegExp(["grant-funded", "nonprofits"].join(" "), "i"),
];

describe("GrantPipe OS positioning", () => {
  it("defines the canonical category sentence", () => {
    expect(GRANTPIPE_OS_CATEGORY).toBe("Compliance-first grant management system.");
  });

  it("keeps the eight OS modules in canonical order", () => {
    expect(GRANTPIPE_OS_MODULES).toEqual([
      "Compliance calendar",
      "Evidence trail",
      "Restricted funds",
      "Grant pipeline",
      "Donor CRM",
      "Multi-source grant pipeline",
      "Fund accounting",
      "Auditor and funder portal",
    ]);
  });

  it("publishes plan language without internal product jargon", () => {
    expect(GRANTPIPE_OS_PLAN_LANGUAGE).toBe(
      "GrantPipe spans eight connected areas of work; the pricing page shows what each plan includes.",
    );
  });

  it("publishes reusable boilerplate that mentions the audience and modules", () => {
    expect(GRANTPIPE_OS_BOILERPLATE).toBe(
      "GrantPipe is a compliance-first grant management system. It helps nonprofits manage awards, deadlines, restricted funds, evidence, reports, donor context, and audit trails in one workspace.",
    );
    expect(GRANTPIPE_OS_BOILERPLATE).toContain("nonprofits");
    expect(GRANTPIPE_OS_BOILERPLATE).toContain("awards");
    expect(GRANTPIPE_OS_BOILERPLATE).toContain("deadlines");
    expect(GRANTPIPE_OS_BOILERPLATE).toContain("donor context");
    expect(GRANTPIPE_OS_BOILERPLATE).toContain("evidence");
    expect(GRANTPIPE_OS_BOILERPLATE).toContain("restricted funds");
    expect(GRANTPIPE_OS_BOILERPLATE).toContain("audit trails");
  });

  it("renders a stable comma-separated module list", () => {
    expect(getGrantPipeOsModuleList()).toBe(
      "Compliance calendar, Evidence trail, Restricted funds, Grant pipeline, Donor CRM, Multi-source grant pipeline, Fund accounting, and Auditor and funder portal",
    );
  });

  it("does not introduce banned or legacy positioning phrases", () => {
    const copy = [
      GRANTPIPE_OS_CATEGORY,
      GRANTPIPE_OS_PLAN_LANGUAGE,
      GRANTPIPE_OS_BOILERPLATE,
      getGrantPipeOsModuleList(),
    ].join("\n");

    for (const pattern of bannedPhrases) {
      expect(copy).not.toMatch(pattern);
    }
  });
});
