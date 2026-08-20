import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  grantIndirectCostRules,
  grantPaymentRequestAdjustments,
  grantPaymentRequestLines,
  grantPaymentRequests,
  grantPayments,
} from "./payments";

function columnSqlType(column: { getSQLType: () => string }) {
  return column.getSQLType();
}

describe("grant payments schema", () => {
  describe("grantPaymentRequests", () => {
    it("is org-scoped and soft-delete-aware", () => {
      expect(grantPaymentRequests.orgId.name).toBe("org_id");
      expect(grantPaymentRequests.grantId.name).toBe("grant_id");
      expect(grantPaymentRequests.deletedAt.name).toBe("deleted_at");
    });

    it("has per-org sequential request number", () => {
      expect(grantPaymentRequests.requestNumber.name).toBe("request_number");
      expect(columnSqlType(grantPaymentRequests.requestNumber)).toBe("integer");
    });

    it("has full status lifecycle timestamp columns", () => {
      expect(grantPaymentRequests.status.name).toBe("status");
      expect(grantPaymentRequests.submittedAt.name).toBe("submitted_at");
      expect(grantPaymentRequests.approvedAt.name).toBe("approved_at");
      expect(grantPaymentRequests.rejectedAt.name).toBe("rejected_at");
      expect(grantPaymentRequests.closedAt.name).toBe("closed_at");
    });

    it("stores money as bigint cents", () => {
      expect(columnSqlType(grantPaymentRequests.requestedAmountCents)).toBe("bigint");
      expect(columnSqlType(grantPaymentRequests.approvedAmountCents)).toBe("bigint");
    });

    it("has auto-post boolean flag for accounting integration", () => {
      expect(grantPaymentRequests.autoPostJournalEntry.name).toBe("auto_post_journal_entry");
      expect(columnSqlType(grantPaymentRequests.autoPostJournalEntry)).toBe("boolean");
    });

    it("defaults status to draft", () => {
      expect(grantPaymentRequests.status.default).toBe("draft");
    });

    it("has funder reference and notes fields", () => {
      expect(grantPaymentRequests.funderReference.name).toBe("funder_reference");
      expect(grantPaymentRequests.notes.name).toBe("notes");
    });

    it("has createdBy and period range fields", () => {
      expect(grantPaymentRequests.createdBy.name).toBe("created_by");
      expect(grantPaymentRequests.periodStart.name).toBe("period_start");
      expect(grantPaymentRequests.periodEnd.name).toBe("period_end");
    });
  });

  describe("grantPaymentRequestLines", () => {
    it("is org-scoped and soft-delete-aware", () => {
      expect(grantPaymentRequestLines.orgId.name).toBe("org_id");
      expect(grantPaymentRequestLines.requestId.name).toBe("request_id");
      expect(grantPaymentRequestLines.deletedAt.name).toBe("deleted_at");
    });

    it("has nullable expenseId for indirect and adjustment lines", () => {
      expect(grantPaymentRequestLines.expenseId.name).toBe("expense_id");
    });

    it("stores money as bigint cents", () => {
      expect(columnSqlType(grantPaymentRequestLines.amountCents)).toBe("bigint");
      expect(columnSqlType(grantPaymentRequestLines.approvedAmountCents)).toBe("bigint");
    });

    it("has category defaulting to direct and sort order", () => {
      expect(grantPaymentRequestLines.category.name).toBe("category");
      expect(grantPaymentRequestLines.sortOrder.name).toBe("sort_order");
      expect(grantPaymentRequestLines.category.default).toBe("direct");
    });

    it("has rejection reason for partial approval workflows", () => {
      expect(grantPaymentRequestLines.rejectionReason.name).toBe("rejection_reason");
    });

    it("tracks when a rejected request releases an expense claim", () => {
      expect(grantPaymentRequestLines.dedupReleasedAt.name).toBe("dedup_released_at");
      expect(columnSqlType(grantPaymentRequestLines.dedupReleasedAt)).toBe(
        "timestamp with time zone",
      );
    });

    it("declares a database guard against duplicate active expense claims", () => {
      const config = getTableConfig(grantPaymentRequestLines);

      expect(config.indexes.map((index) => index.config.name)).toContain(
        "grant_payment_request_lines_org_expense_active_idx",
      );
    });
  });

  describe("grantPaymentRequestAdjustments", () => {
    it("is org-scoped and soft-delete-aware", () => {
      expect(grantPaymentRequestAdjustments.orgId.name).toBe("org_id");
      expect(grantPaymentRequestAdjustments.requestId.name).toBe("request_id");
      expect(grantPaymentRequestAdjustments.deletedAt.name).toBe("deleted_at");
    });

    it("has nullable amountCents for note-only adjustments", () => {
      expect(grantPaymentRequestAdjustments.amountCents.name).toBe("amount_cents");
      expect(columnSqlType(grantPaymentRequestAdjustments.amountCents)).toBe("bigint");
    });

    it("requires kind and reason fields", () => {
      expect(grantPaymentRequestAdjustments.kind.name).toBe("kind");
      expect(grantPaymentRequestAdjustments.reason.name).toBe("reason");
    });

    it("tracks who created the adjustment", () => {
      expect(grantPaymentRequestAdjustments.createdBy.name).toBe("created_by");
    });
  });

  describe("grantPayments", () => {
    it("is org-scoped and soft-delete-aware", () => {
      expect(grantPayments.orgId.name).toBe("org_id");
      expect(grantPayments.requestId.name).toBe("request_id");
      expect(grantPayments.deletedAt.name).toBe("deleted_at");
    });

    it("denormalizes grantId for fast org-level reporting", () => {
      expect(grantPayments.grantId.name).toBe("grant_id");
    });

    it("stores money as bigint cents", () => {
      expect(columnSqlType(grantPayments.amountCents)).toBe("bigint");
    });

    it("has optional journal entry and bank transaction links for GL integration", () => {
      expect(grantPayments.journalEntryId.name).toBe("journal_entry_id");
      expect(grantPayments.bankTransactionId.name).toBe("bank_transaction_id");
    });

    it("has received date, payment method, and reference number", () => {
      expect(grantPayments.receivedDate.name).toBe("received_date");
      expect(grantPayments.method.name).toBe("method");
      expect(grantPayments.referenceNumber.name).toBe("reference_number");
    });
  });

  describe("grantIndirectCostRules", () => {
    it("is org-scoped and soft-delete-aware", () => {
      expect(grantIndirectCostRules.orgId.name).toBe("org_id");
      expect(grantIndirectCostRules.deletedAt.name).toBe("deleted_at");
    });

    it("has nullable grantId supporting org-default fallback rules", () => {
      expect(grantIndirectCostRules.grantId.name).toBe("grant_id");
    });

    it("stores rate as basis points integer (1000 = 10.00%)", () => {
      expect(grantIndirectCostRules.rateBasisPoints.name).toBe("rate_basis_points");
      expect(columnSqlType(grantIndirectCostRules.rateBasisPoints)).toBe("integer");
    });

    it("has effective date window for time-bounded rates", () => {
      expect(grantIndirectCostRules.effectiveFrom.name).toBe("effective_from");
      expect(grantIndirectCostRules.effectiveTo.name).toBe("effective_to");
    });

    it("has base calculation type for indirect cost computation", () => {
      expect(grantIndirectCostRules.base.name).toBe("base");
    });
  });

  describe("all payment tables", () => {
    it("are org-scoped and soft-delete-aware", () => {
      for (const table of [
        grantPaymentRequests,
        grantPaymentRequestLines,
        grantPaymentRequestAdjustments,
        grantPayments,
        grantIndirectCostRules,
      ]) {
        expect(table.orgId.name).toBe("org_id");
        expect(table.deletedAt.name).toBe("deleted_at");
      }
    });
  });
});
