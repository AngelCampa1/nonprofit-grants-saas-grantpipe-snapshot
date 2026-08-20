import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { pledgeInstallments, pledgePayments, pledges } from "./pledges";

function columnSqlType(column: { getSQLType: () => string }) {
  return column.getSQLType();
}

describe("pledges table", () => {
  it("uses bigint for all cents columns", () => {
    expect(columnSqlType(pledges.faceAmountCents)).toBe("bigint");
    expect(columnSqlType(pledges.presentValueCents)).toBe("bigint");
    expect(columnSqlType(pledges.discountCents)).toBe("bigint");
    expect(columnSqlType(pledges.allowanceCents)).toBe("bigint");
  });

  it("has the expected column names", () => {
    expect(pledges.orgId.name).toBe("org_id");
    expect(pledges.contactId.name).toBe("contact_id");
    expect(pledges.fundId.name).toBe("fund_id");
    expect(pledges.grantId.name).toBe("grant_id");
    expect(pledges.status.name).toBe("status");
    expect(pledges.isConditional.name).toBe("is_conditional");
    expect(pledges.hasBarrier.name).toBe("has_barrier");
    expect(pledges.hasRightOfReturn.name).toBe("has_right_of_return");
    expect(pledges.conditionNote.name).toBe("condition_note");
    expect(pledges.pledgeDate.name).toBe("pledge_date");
    expect(pledges.discountRateBasisPoints.name).toBe("discount_rate_basis_points");
    expect(pledges.netAssetClass.name).toBe("net_asset_class");
    expect(pledges.deletedAt.name).toBe("deleted_at");
  });

  it("declares the org+status+pledgeDate composite index", () => {
    const config = getTableConfig(pledges);
    const indexNames = config.indexes.map((idx) => idx.config.name);
    expect(indexNames).toContain("pledges_org_status_pledge_date_idx");
  });

  it("supports soft delete", () => {
    expect(pledges.deletedAt.name).toBe("deleted_at");
  });
});

describe("pledge_installments table", () => {
  it("uses bigint for cents columns", () => {
    expect(columnSqlType(pledgeInstallments.amountCents)).toBe("bigint");
    expect(columnSqlType(pledgeInstallments.paidCents)).toBe("bigint");
  });

  it("has the expected column names", () => {
    expect(pledgeInstallments.pledgeId.name).toBe("pledge_id");
    expect(pledgeInstallments.dueDate.name).toBe("due_date");
    expect(pledgeInstallments.status.name).toBe("status");
    expect(pledgeInstallments.deletedAt.name).toBe("deleted_at");
  });

  it("declares the org+pledgeId+dueDate composite index", () => {
    const config = getTableConfig(pledgeInstallments);
    const indexNames = config.indexes.map((idx) => idx.config.name);
    expect(indexNames).toContain("pledge_installments_org_pledge_due_date_idx");
  });
});

describe("pledge_payments table", () => {
  it("uses bigint for cents columns", () => {
    expect(columnSqlType(pledgePayments.amountCents)).toBe("bigint");
    expect(columnSqlType(pledgePayments.accretionCents)).toBe("bigint");
  });

  it("has the expected column names", () => {
    expect(pledgePayments.pledgeId.name).toBe("pledge_id");
    expect(pledgePayments.installmentId.name).toBe("installment_id");
    expect(pledgePayments.paymentDate.name).toBe("payment_date");
    expect(pledgePayments.deletedAt.name).toBe("deleted_at");
  });

  it("declares the org+pledgeId+paymentDate composite index", () => {
    const config = getTableConfig(pledgePayments);
    const indexNames = config.indexes.map((idx) => idx.config.name);
    expect(indexNames).toContain("pledge_payments_org_pledge_payment_date_idx");
  });
});
