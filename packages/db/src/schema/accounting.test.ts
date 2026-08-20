import { describe, expect, it } from "vitest";
import { getTableName } from "drizzle-orm";
import {
  chartOfAccounts,
  fiscalPeriods,
  journalEntries,
  journalLines,
  bankReconciliations,
  bankTransactions,
  accountingIntegrations,
  accountingSyncRuns,
  accountingSyncEvents,
  externalAccountingObjects,
  accountingDimensionMappings,
  accountingSyncConflicts,
  accountingOAuthStates,
  chartOfAccountsRelations,
  fiscalPeriodsRelations,
  journalEntriesRelations,
  journalLinesRelations,
} from "./accounting";

// Helper to get column names from a Drizzle table object.
// Drizzle stores columns on the table symbol keyed by 'drizzle:Columns'.
const DRIZZLE_COLUMNS_KEY = Symbol.for("drizzle:Columns");

function columnNames(table: object): string[] {
  return Object.keys((table as Record<symbol, Record<string, unknown>>)[DRIZZLE_COLUMNS_KEY] ?? {});
}

// ---------------------------------------------------------------------------
// chart_of_accounts
// ---------------------------------------------------------------------------

describe("chartOfAccounts table", () => {
  it("is defined and truthy", () => {
    expect(chartOfAccounts).toBeTruthy();
  });

  it("has the expected columns", () => {
    const cols = columnNames(chartOfAccounts);
    expect(cols).toContain("id");
    expect(cols).toContain("orgId");
    expect(cols).toContain("code");
    expect(cols).toContain("name");
    expect(cols).toContain("type");
    expect(cols).toContain("subtype");
    expect(cols).toContain("parentAccountId");
    expect(cols).toContain("naturalRestriction");
    expect(cols).toContain("functionalClass");
    expect(cols).toContain("isActive");
    expect(cols).toContain("deletedAt");
  });

  it("exposes the table name", () => {
    expect(getTableName(chartOfAccounts)).toBe("chart_of_accounts");
  });
});

// ---------------------------------------------------------------------------
// fiscal_periods
// ---------------------------------------------------------------------------

describe("fiscalPeriods table", () => {
  it("is defined and truthy", () => {
    expect(fiscalPeriods).toBeTruthy();
  });

  it("has the expected columns", () => {
    const cols = columnNames(fiscalPeriods);
    expect(cols).toContain("id");
    expect(cols).toContain("orgId");
    expect(cols).toContain("name");
    expect(cols).toContain("startDate");
    expect(cols).toContain("endDate");
    expect(cols).toContain("status");
    expect(cols).toContain("closedBy");
    expect(cols).toContain("closedAt");
    expect(cols).toContain("createdAt");
  });

  it("exposes the table name", () => {
    expect(getTableName(fiscalPeriods)).toBe("fiscal_periods");
  });
});

// ---------------------------------------------------------------------------
// journal_entries
// ---------------------------------------------------------------------------

describe("journalEntries table", () => {
  it("is defined and truthy", () => {
    expect(journalEntries).toBeTruthy();
  });

  it("has the expected columns", () => {
    const cols = columnNames(journalEntries);
    expect(cols).toContain("id");
    expect(cols).toContain("orgId");
    expect(cols).toContain("entryNumber");
    expect(cols).toContain("date");
    expect(cols).toContain("fiscalPeriodId");
    expect(cols).toContain("memo");
    expect(cols).toContain("source");
    expect(cols).toContain("sourceTable");
    expect(cols).toContain("sourceId");
    expect(cols).toContain("postedAt");
    expect(cols).toContain("postedBy");
    expect(cols).toContain("reversedByEntryId");
    expect(cols).toContain("isAdjusting");
    expect(cols).toContain("externalSourceSystem");
    expect(cols).toContain("externalSourceObjectId");
    expect(cols).toContain("externalSourceObjectType");
    expect(cols).toContain("externalSourceSyncedAt");
    expect(cols).toContain("externalSourceStatus");
    expect(cols).toContain("createdAt");
  });

  it("exposes the table name", () => {
    expect(getTableName(journalEntries)).toBe("journal_entries");
  });
});

// ---------------------------------------------------------------------------
// journal_lines
// ---------------------------------------------------------------------------

describe("journalLines table", () => {
  it("is defined and truthy", () => {
    expect(journalLines).toBeTruthy();
  });

  it("has the expected columns", () => {
    const cols = columnNames(journalLines);
    expect(cols).toContain("id");
    expect(cols).toContain("orgId");
    expect(cols).toContain("journalEntryId");
    expect(cols).toContain("lineNumber");
    expect(cols).toContain("accountId");
    expect(cols).toContain("fundId");
    expect(cols).toContain("grantId");
    expect(cols).toContain("contactId");
    expect(cols).toContain("debitCents");
    expect(cols).toContain("creditCents");
    expect(cols).toContain("memo");
    expect(cols).toContain("externalSourceSystem");
    expect(cols).toContain("externalSourceObjectId");
    expect(cols).toContain("externalSourceObjectType");
    expect(cols).toContain("externalSourceSyncedAt");
    expect(cols).toContain("externalSourceStatus");
  });

  it("exposes the table name", () => {
    expect(getTableName(journalLines)).toBe("journal_lines");
  });

  it("keeps debit and credit cents aligned with the bigint production migration", () => {
    expect(journalLines.debitCents.getSQLType()).toBe("bigint");
    expect(journalLines.creditCents.getSQLType()).toBe("bigint");
  });
});

// ---------------------------------------------------------------------------
// bank_reconciliations
// ---------------------------------------------------------------------------

describe("bankReconciliations table", () => {
  it("has a deletedAt column so canceled reconciliations remain auditable", () => {
    const cols = columnNames(bankReconciliations);
    expect(cols).toContain("deletedAt");
  });

  it("stores the statement ending balance as bigint so large bank balances cannot overflow int4 (~$21.4M)", () => {
    expect(bankReconciliations.statementEndingBalanceCents.getSQLType()).toBe("bigint");
  });
});

describe("bankTransactions table", () => {
  it("stores the transaction amount as bigint so large wires cannot overflow int4 (~$21.4M)", () => {
    expect(bankTransactions.amountCents.getSQLType()).toBe("bigint");
  });
});

describe("accounting integration tables", () => {
  it("defines QuickBooks integration metadata tables", () => {
    expect(getTableName(accountingIntegrations)).toBe("accounting_integrations");
    expect(getTableName(accountingSyncRuns)).toBe("accounting_sync_runs");
    expect(getTableName(accountingSyncEvents)).toBe("accounting_sync_events");
    expect(getTableName(externalAccountingObjects)).toBe("external_accounting_objects");
    expect(getTableName(accountingDimensionMappings)).toBe("accounting_dimension_mappings");
    expect(getTableName(accountingSyncConflicts)).toBe("accounting_sync_conflicts");
    expect(getTableName(accountingOAuthStates)).toBe("accounting_oauth_states");
  });

  it("scopes integration records to orgs and source objects", () => {
    expect(columnNames(accountingIntegrations)).toEqual(
      expect.arrayContaining([
        "id",
        "orgId",
        "provider",
        "status",
        "realmId",
        "companyName",
        "encryptedAccessToken",
        "encryptedRefreshToken",
        "tokenExpiresAt",
        "syncStartDate",
        "enabledObjectTypes",
        "autoCreateMappings",
        "lastSyncedAt",
        "disconnectedAt",
      ]),
    );
    expect(columnNames(externalAccountingObjects)).toEqual(
      expect.arrayContaining([
        "orgId",
        "integrationId",
        "sourceSystem",
        "sourceObjectType",
        "sourceObjectId",
        "idempotencyKey",
        "payload",
        "lastSeenAt",
      ]),
    );
  });

  it("stores single-use OAuth state metadata", () => {
    expect(columnNames(accountingOAuthStates)).toEqual(
      expect.arrayContaining([
        "id",
        "orgId",
        "actorId",
        "provider",
        "nonceHash",
        "expiresAt",
        "consumedAt",
        "createdAt",
      ]),
    );
  });
});

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

describe("relations", () => {
  it("chartOfAccountsRelations is defined", () => {
    expect(chartOfAccountsRelations).toBeTruthy();
  });

  it("fiscalPeriodsRelations is defined", () => {
    expect(fiscalPeriodsRelations).toBeTruthy();
  });

  it("journalEntriesRelations is defined", () => {
    expect(journalEntriesRelations).toBeTruthy();
  });

  it("journalLinesRelations is defined", () => {
    expect(journalLinesRelations).toBeTruthy();
  });
});
