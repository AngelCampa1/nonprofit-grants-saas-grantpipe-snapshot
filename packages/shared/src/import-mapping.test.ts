import { describe, expect, it } from "vitest";
import { buildResolvedImportMapping } from "./import-mapping";

describe("buildResolvedImportMapping", () => {
  it("keeps explicit mappings unchanged", () => {
    expect(buildResolvedImportMapping(["First Name"], { firstName: "Given" }, "contacts")).toEqual({
      firstName: "Given",
    });
  });

  it("resolves contact header aliases without identity-mapping unknown headers", () => {
    expect(
      buildResolvedImportMapping(["First Name", "Volunteer", "Unknown"], {}, "contacts"),
    ).toEqual({ firstName: "First Name", isVolunteer: "Volunteer" });
  });

  it("resolves donation contact prefix aliases", () => {
    expect(
      buildResolvedImportMapping(["Contact Email", "Gift Date", "Amount"], {}, "donations"),
    ).toEqual({
      contactEmail: "Contact Email",
      date: "Gift Date",
      amountCents: "Amount",
    });
  });

  it("ignores presetId when generic is passed", () => {
    expect(buildResolvedImportMapping(["First Name"], {}, "contacts", "generic")).toEqual({
      firstName: "First Name",
    });
  });

  it("prefers preset-specific aliases over base aliases when a preset is given", () => {
    expect(
      buildResolvedImportMapping(
        ["First Name", "Last Name", "Email"],
        {},
        "contacts",
        "bloomerang",
      ),
    ).toMatchObject({
      firstName: "First Name",
      lastName: "Last Name",
      email: "Email",
    });
  });

  it("merges preset keys not present in base aliases for grants entity", () => {
    expect(
      buildResolvedImportMapping(["Award Amount", "Funder"], {}, "grants", "salesforce_npsp"),
    ).toMatchObject({
      amountCents: "Award Amount",
      funderName: "Funder",
    });
  });

  it("resolves grant opportunity aliases for non-federal opportunity imports", () => {
    expect(
      buildResolvedImportMapping(
        ["Opportunity Title", "Funder", "Grant Source", "Due Date", "Application URL"],
        {},
        "grant_opportunities",
      ),
    ).toMatchObject({
      title: "Opportunity Title",
      sourceName: "Funder",
      sourceType: "Grant Source",
      deadline: "Due Date",
      sourceUrl: "Application URL",
    });
  });

  it("resolves QuickBooks opening balance headers for the finance cutover step", () => {
    expect(
      buildResolvedImportMapping(
        ["Account No.", "Debit", "Credit", "As of Date", "Memo"],
        {},
        "opening_balances",
        "quickbooks",
      ),
    ).toEqual({
      accountCode: "Account No.",
      debitCents: "Debit",
      creditCents: "Credit",
      date: "As of Date",
      memo: "Memo",
    });
  });

  it("resolves fund setup aliases for migration studio metadata fields", () => {
    expect(
      buildResolvedImportMapping(
        [
          "Fund ID",
          "Fund Name",
          "Restriction Purpose",
          "Restriction Source",
          "Start Date",
          "End Date",
          "Status",
        ],
        {},
        "funds",
      ),
    ).toMatchObject({
      externalId: "Fund ID",
      name: "Fund Name",
      restrictionPurpose: "Restriction Purpose",
      restrictionSource: "Restriction Source",
      startDate: "Start Date",
      endDate: "End Date",
      status: "Status",
    });
  });

  it("resolves name-based fund and grant references for finance cutover files", () => {
    expect(
      buildResolvedImportMapping(
        ["Account Code", "Fund Name", "Grant Name", "Debit", "Credit"],
        {},
        "opening_balances",
      ),
    ).toMatchObject({
      accountCode: "Account Code",
      fundName: "Fund Name",
      grantName: "Grant Name",
      debitCents: "Debit",
      creditCents: "Credit",
    });

    expect(
      buildResolvedImportMapping(
        ["Pledge ID", "Email", "Pledge Date", "Due Date", "Amount", "Fund Name", "Grant Name"],
        {},
        "pledges",
      ),
    ).toMatchObject({
      externalPledgeId: "Pledge ID",
      contactEmail: "Email",
      pledgeDate: "Pledge Date",
      dueDate: "Due Date",
      amountCents: "Amount",
      fundName: "Fund Name",
      grantName: "Grant Name",
    });
  });
});
