import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  funderContacts,
  funders,
  expenses,
  grantBudgetAmendments,
  grantBudgetLineAllocations,
  grantBudgetLines,
  grantBudgetPeriods,
  grantBudgetVersions,
  grantFederalAwardMetadata,
  grantFundAllocations,
  grantImpactMetrics,
  grants,
  plannedExpenses,
  funds,
} from "./grants";
import {
  generatedReports,
  grantCloseoutItems,
  grantReportingRequirements,
  impactMetricEntries,
} from "./compliance";
import { activityLog } from "./infrastructure";

function columnSqlType(column: { getSQLType: () => string }) {
  return column.getSQLType();
}

describe("grant money columns", () => {
  it("uses bigint for grant amount cents to match migrations", () => {
    expect(columnSqlType(grants.amountCents)).toBe("bigint");
  });

  it("uses bigint for grant fund allocation cents to match migrations", () => {
    expect(columnSqlType(grantFundAllocations.allocatedAmountCents)).toBe("bigint");
  });

  it("uses bigint for expense amount cents to match migrations", () => {
    expect(columnSqlType(expenses.amountCents)).toBe("bigint");
  });
});

describe("grant budget schema", () => {
  it("uses bigint cents columns for all budget money", () => {
    expect(columnSqlType(grantBudgetLines.approvedAmountCents)).toBe("bigint");
    expect(columnSqlType(grantBudgetLineAllocations.amountCents)).toBe("bigint");
    expect(columnSqlType(plannedExpenses.amountCents)).toBe("bigint");
  });

  it("exports the core budget version, period, line, allocation, planned expense, and amendment tables", () => {
    expect(grantBudgetVersions.grantId.name).toBe("grant_id");
    expect(grantBudgetVersions.status.name).toBe("status");
    expect(grantBudgetVersions.source.name).toBe("source");
    expect(grantBudgetVersions.approvedAt.name).toBe("approved_at");
    expect(grantBudgetPeriods.budgetVersionId.name).toBe("budget_version_id");
    expect(grantBudgetPeriods.dueDate.name).toBe("due_date");
    expect(grantBudgetLines.budgetPeriodId.name).toBe("budget_period_id");
    expect(grantBudgetLines.allowable.name).toBe("allowable");
    expect(grantBudgetLines.costType.name).toBe("cost_type");
    expect(grantBudgetLineAllocations.expenseId.name).toBe("expense_id");
    expect(grantBudgetLineAllocations.journalLineId.name).toBe("journal_line_id");
    expect(plannedExpenses.status.name).toBe("status");
    expect(plannedExpenses.convertedExpenseId.name).toBe("converted_expense_id");
    expect(grantBudgetAmendments.supportingDocumentId.name).toBe("supporting_document_id");
  });

  it("declares budget guardrail indexes and checks in the Drizzle schema", () => {
    const versionConfig = getTableConfig(grantBudgetVersions);
    const lineConfig = getTableConfig(grantBudgetLines);
    const allocationConfig = getTableConfig(grantBudgetLineAllocations);
    const periodConfig = getTableConfig(grantBudgetPeriods);
    const plannedConfig = getTableConfig(plannedExpenses);

    expect(versionConfig.indexes.map((index) => index.config.name)).toContain(
      "grant_budget_versions_one_approved_idx",
    );
    expect(
      [
        ...versionConfig.checks,
        ...lineConfig.checks,
        ...allocationConfig.checks,
        ...periodConfig.checks,
        ...plannedConfig.checks,
      ].map((check) => check.name),
    ).toEqual(
      expect.arrayContaining([
        "grant_budget_versions_status_chk",
        "grant_budget_versions_source_chk",
        "grant_budget_lines_amount_nonnegative_chk",
        "grant_budget_lines_cost_type_chk",
        "grant_budget_line_allocations_amount_positive_chk",
        "planned_expenses_amount_positive_chk",
        "planned_expenses_status_chk",
        "grant_budget_periods_date_order_chk",
      ]),
    );
  });
});

describe("grant domain entity scope", () => {
  it("declares an entity_id column on every operational grant-domain table", () => {
    for (const table of [
      funders,
      funderContacts,
      grants,
      grantFederalAwardMetadata,
      funds,
      grantFundAllocations,
      expenses,
      grantBudgetVersions,
      grantBudgetPeriods,
      grantBudgetLines,
      grantBudgetLineAllocations,
      plannedExpenses,
      grantBudgetAmendments,
      grantImpactMetrics,
      grantReportingRequirements,
      impactMetricEntries,
      grantCloseoutItems,
      generatedReports,
    ]) {
      expect(table.entityId.name).toBe("entity_id");
    }
  });

  it("records the active entity scope separately from the activity subject id", () => {
    expect(activityLog.activeEntityId.name).toBe("active_entity_id");
  });
});

describe("grant federal award metadata schema", () => {
  it("defines the one-to-one SEFA metadata shape for grants", () => {
    expect(grantFederalAwardMetadata.grantId.name).toBe("grant_id");
    expect(grantFederalAwardMetadata.assistanceListingNumber.name).toBe(
      "assistance_listing_number",
    );
    expect(grantFederalAwardMetadata.federalAgency.name).toBe("federal_agency");
    expect(grantFederalAwardMetadata.sefaInclusionType.name).toBe("sefa_inclusion_type");
  });

  it("declares SEFA metadata indexes and inclusion-type guardrails", () => {
    const config = getTableConfig(grantFederalAwardMetadata);

    expect(config.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "grant_federal_award_metadata_grant_idx",
        "grant_federal_award_metadata_org_idx",
        "grant_federal_award_metadata_org_aln_idx",
      ]),
    );
    expect(config.checks.map((check) => check.name)).toContain(
      "grant_federal_award_metadata_inclusion_chk",
    );
  });
});
