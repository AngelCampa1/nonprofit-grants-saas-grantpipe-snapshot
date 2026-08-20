import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  contacts,
  donations,
  funds,
  funders,
  grantOpportunities,
  grants,
  importHistory,
  journalEntries,
  journalLines,
  pledgeInstallments,
  pledges,
} from "@grantpipe/db";
import { getActiveGrantCap, getGrantCapWithSoftHeadroom } from "@grantpipe/shared";
vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn(),
}));
vi.mock("../accounting/postingEngine", () => ({
  postDonation: vi.fn().mockResolvedValue(undefined),
  postPledgeRecognition: vi.fn().mockResolvedValue(undefined),
}));
import { commitImport, getImportMigrationPlan, listImportHistory, previewImport } from "./service";
import { recordActivityLog } from "../../lib/activity-log";
import { postDonation, postPledgeRecognition } from "../accounting/postingEngine";

function renderSql(condition: unknown) {
  const dialect = new PgDialect();
  return dialect.sqlToQuery(condition as Parameters<PgDialect["sqlToQuery"]>[0]);
}

function withTx<T extends { query: unknown; insert: unknown }>(base: T) {
  const tx = {
    ...base,
    transaction: (fn: (t: unknown) => Promise<unknown>) => fn(tx),
  };
  return tx;
}

describe("previewImport", () => {
  it("parses CSV text into headers and row objects and echoes orgId", async () => {
    const result = await previewImport({ query: {} } as never, {
      orgId: "org-1",
      entityType: "contacts",
      filename: "contacts.csv",
      csvText:
        'email,first_name,last_name\njane@example.com,Jane,Doe\n"bob@example.com","Bob","Smith"',
    });

    expect(result).toEqual({
      orgId: "org-1",
      entityType: "contacts",
      filename: "contacts.csv",
      headers: ["email", "first_name", "last_name"],
      rows: [
        {
          email: "jane@example.com",
          first_name: "Jane",
          last_name: "Doe",
        },
        {
          email: "bob@example.com",
          first_name: "Bob",
          last_name: "Smith",
        },
      ],
      totalRows: 2,
    });
  });

  it("handles escaped quotes and blank lines", async () => {
    const result = await previewImport({ query: {} } as never, {
      orgId: "org-1",
      entityType: "contacts",
      filename: "contacts.csv",
      csvText: 'name,notes\r\nAcme,"Line with ""quotes"" inside"\r\n\r\nBeta,Second',
    });

    expect(result.rows).toEqual([
      {
        name: "Acme",
        notes: 'Line with "quotes" inside',
      },
      {
        name: "Beta",
        notes: "Second",
      },
    ]);
    expect(result.totalRows).toBe(2);
    expect(result.orgId).toBe("org-1");
  });

  it("rejects CSV text with an unterminated quoted field", async () => {
    await expect(
      previewImport({ query: {} } as never, {
        orgId: "org-1",
        entityType: "contacts",
        filename: "contacts.csv",
        csvText: 'type,firstName\nindividual,"unterminated',
      }),
    ).rejects.toThrow("CSV contains an unterminated quoted field.");
  });

  it("returns an empty preview for whitespace-only CSV text", async () => {
    const result = await previewImport({ query: {} } as never, {
      orgId: "org-2",
      entityType: "contacts",
      filename: "empty.csv",
      csvText: "   ",
    });

    expect(result).toEqual({
      orgId: "org-2",
      entityType: "contacts",
      filename: "empty.csv",
      headers: [],
      rows: [],
      totalRows: 0,
    });
  });

  it("throws when orgId is missing", async () => {
    await expect(
      previewImport(
        { query: {} } as never,
        {
          entityType: "contacts",
          filename: "contacts.csv",
          csvText: "email\nfoo@example.com",
        } as never,
      ),
    ).rejects.toThrow(/orgId/);
  });

  it("returns opening balance reconciliation details before commit", async () => {
    const query = {
      chartOfAccounts: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ id: "cash-1", orgId: "org-1", code: "1000" })
          .mockResolvedValueOnce(undefined),
      },
      funds: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
      grants: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
      fiscalPeriods: {
        findFirst: vi.fn().mockResolvedValue({
          id: "period-1",
          orgId: "org-1",
          status: "locked",
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          endDate: new Date("2026-12-31T23:59:59.999Z"),
        }),
      },
    };

    const result = await previewImport({ query } as never, {
      orgId: "org-1",
      entityId: "entity-1",
      entityType: "opening_balances",
      filename: "opening-balances.csv",
      csvText:
        "accountCode,debit,credit,fiscalPeriodId,date,fundId,grantId\n" +
        "1000,100.00,,period-1,2026-01-01,fund-missing,grant-missing\n" +
        "9999,,50.00,period-1,2026-01-01,,",
    });

    expect(result).toMatchObject({
      entityId: "entity-1",
      reconciliation: {
        debitTotalCents: 10000,
        creditTotalCents: 5000,
        balanced: false,
        commitBlocked: true,
        fiscalPeriod: {
          id: "period-1",
          status: "locked",
          open: false,
          dateInRange: true,
        },
        unresolvedAccounts: [{ rowNumber: 3, accountCode: "9999" }],
        unresolvedFunds: [{ rowNumber: 2, fundId: "fund-missing" }],
        unresolvedGrants: [{ rowNumber: 2, grantId: "grant-missing" }],
        errors: expect.arrayContaining([
          expect.objectContaining({ code: "opening_balance_unbalanced" }),
          expect.objectContaining({ code: "invalid_fiscal_period" }),
          expect.objectContaining({ code: "missing_account" }),
          expect.objectContaining({ code: "invalid_fund" }),
          expect.objectContaining({ code: "invalid_grant" }),
        ]),
      },
    });
  });

  it("reports opening balance preview fiscal-period and date blockers", async () => {
    const account = { id: "cash-1", orgId: "org-1", code: "1000" };
    const makeQuery = (period?: Record<string, unknown>) => ({
      chartOfAccounts: { findFirst: vi.fn().mockResolvedValue(account) },
      funds: { findFirst: vi.fn() },
      grants: { findFirst: vi.fn() },
      fiscalPeriods: { findFirst: vi.fn().mockResolvedValue(period) },
      organizations: { findFirst: vi.fn().mockResolvedValue({ defaultEntityId: "entity-1" }) },
    });

    const missing = await previewImport({ query: makeQuery() } as never, {
      orgId: "org-1",
      entityType: "opening_balances",
      filename: "opening-balances.csv",
      csvText: "accountCode,debit,credit\n1000,10.00,\n1000,,10.00",
    });

    expect(missing.reconciliation).toMatchObject({
      commitBlocked: true,
      fiscalPeriod: { id: null, status: null, open: false, dateInRange: null },
      errors: expect.arrayContaining([
        expect.objectContaining({ code: "missing_fiscal_period" }),
        expect.objectContaining({ code: "missing_date" }),
      ]),
    });

    const mixed = await previewImport({ query: makeQuery() } as never, {
      orgId: "org-1",
      entityId: "entity-1",
      entityType: "opening_balances",
      filename: "opening-balances.csv",
      csvText:
        "accountCode,debit,credit,fiscalPeriodId,date\n" +
        "1000,10.00,,period-1,2026-01-01\n" +
        "1000,,10.00,period-2,2026-01-02",
    });

    expect(mixed.reconciliation?.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "mixed_fiscal_periods" }),
        expect.objectContaining({ code: "mixed_dates" }),
      ]),
    );

    const outside = await previewImport(
      {
        query: makeQuery({
          id: "period-1",
          orgId: "org-1",
          status: "open",
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          endDate: new Date("2026-12-31T23:59:59.999Z"),
        }),
      } as never,
      {
        orgId: "org-1",
        entityId: "entity-1",
        entityType: "opening_balances",
        filename: "opening-balances.csv",
        csvText:
          "accountCode,debit,credit,fiscalPeriodId,date\n" +
          "1000,10.00,,period-1,2025-12-31\n" +
          "1000,,10.00,period-1,2025-12-31",
      },
    );

    expect(outside.reconciliation).toMatchObject({
      fiscalPeriod: { id: "period-1", status: "open", open: true, dateInRange: false },
      errors: expect.arrayContaining([expect.objectContaining({ code: "date_outside_period" })]),
    });

    const invalidAmounts = await previewImport(
      {
        query: makeQuery({
          id: "period-1",
          orgId: "org-1",
          status: "open",
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          endDate: new Date("2026-12-31T23:59:59.999Z"),
        }),
      } as never,
      {
        orgId: "org-1",
        entityId: "entity-1",
        entityType: "opening_balances",
        filename: "opening-balances.csv",
        csvText:
          "accountCode,debit,credit,fiscalPeriodId,date\n" +
          "1000,bad-debit,,period-1,2026-01-01\n" +
          "1000,,bad-credit,period-1,2026-01-01",
      },
    );

    expect(invalidAmounts.reconciliation?.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "debitCents", code: "invalid_amount" }),
        expect.objectContaining({ field: "creditCents", code: "invalid_amount" }),
      ]),
    );
  });
});

describe("commitImport", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("creates contacts, donations, grants, funders, and history rows when rows are importable", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
      donations: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
      grants: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
      funders: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
    };

    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === contacts
          ? [{ id: "contact-1", orgId: "org-1", email: "jane@example.com" }]
          : table === donations
            ? [{ id: "donation-1", orgId: "org-1", amountCents: 5000 }]
            : table === grants
              ? [{ id: "grant-1", orgId: "org-1", name: "General Operating" }]
              : table === funders
                ? [{ id: "funder-1", orgId: "org-1", name: "Open Society" }]
                : table === importHistory
                  ? [{ id: "history-1", orgId: "org-1", userId: "user-1", status: "completed" }]
                  : [];

      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      };
    });

    const db = withTx({ query, insert });

    const contactsResult = await commitImport(db as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "contacts",
      filename: "contacts.csv",
      mapping: {
        email: "email",
        firstName: "first_name",
        lastName: "last_name",
        type: "type",
      },
      rows: [
        {
          email: "jane@example.com",
          first_name: "Jane",
          last_name: "Doe",
          type: "individual",
        },
        {
          email: "jane@example.com",
          first_name: "Jane",
          last_name: "Doe",
          type: "individual",
        },
      ],
    });

    expect(contactsResult.totalRows).toBe(2);
    expect(contactsResult.insertedRows).toBe(1);
    expect(contactsResult.duplicateRows).toBe(1);
    expect(contactsResult.failedRows).toBe(0);
    expect(contactsResult.createdCounts.contacts).toBe(1);

    const donationsResult = await commitImport(db as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "donations",
      filename: "donations.csv",
      mapping: {
        amountCents: "amount_cents",
        date: "date",
        type: "type",
        contactEmail: "email",
        contactFirstName: "first_name",
        contactLastName: "last_name",
      },
      rows: [
        {
          amount_cents: 5000,
          date: "2026-04-01T00:00:00.000Z",
          type: "one_time",
          email: "jane@example.com",
          first_name: "Jane",
          last_name: "Doe",
        },
      ],
    });

    expect(donationsResult.insertedRows).toBe(1);
    expect(donationsResult.createdCounts.contacts).toBe(1);
    expect(donationsResult.createdCounts.donations).toBe(1);

    const grantsResult = await commitImport(db as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "grants",
      filename: "grants.csv",
      mapping: {
        name: "grant_name",
        funderName: "funder_name",
        amountCents: "amount_cents",
        status: "status",
      },
      rows: [
        {
          grant_name: "General Operating",
          funder_name: "Open Society",
          amount_cents: 120000,
          status: "awarded",
        },
      ],
    });

    expect(grantsResult.insertedRows).toBe(1);
    expect(grantsResult.createdCounts.funders).toBe(1);
    expect(grantsResult.createdCounts.grants).toBe(1);
    expect(insert).toHaveBeenCalledWith(importHistory);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        entityType: "contact",
      }),
    );
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        entityType: "donation",
      }),
    );
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        entityType: "funder",
      }),
    );
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        entityType: "grant",
      }),
    );
  });

  it("imports restricted funds and skips duplicate fund names", async () => {
    const query = {
      entities: {
        findFirst: vi.fn().mockResolvedValue({ id: "entity-active", orgId: "org-1" }),
      },
      funds: {
        findFirst: vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce({
          id: "fund-1",
          orgId: "org-1",
          entityId: "entity-active",
          name: "Youth Restricted",
        }),
      },
    };
    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === funds
          ? [
              {
                id: "fund-1",
                orgId: "org-1",
                entityId: "entity-active",
                externalId: "FUND-100",
                name: "Youth Restricted",
                type: "temporarily_restricted",
                restrictionPurpose: "Youth program costs",
                restrictionSource: "Donor restriction",
                startDate: new Date("2026-01-01T00:00:00.000Z"),
                endDate: new Date("2026-12-31T00:00:00.000Z"),
                status: "active",
              },
            ]
          : table === importHistory
            ? [{ id: "history-1", orgId: "org-1", userId: "user-1", status: "completed" }]
            : [];

      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityId: "entity-active",
      entityType: "funds",
      filename: "funds.csv",
      mapping: {
        name: "name",
        type: "type",
        description: "description",
        externalId: "external_id",
        restrictionPurpose: "purpose",
        restrictionSource: "source",
        startDate: "start_date",
        endDate: "end_date",
        status: "status",
      },
      rows: [
        {
          external_id: "FUND-100",
          name: "Youth Restricted",
          type: "temporarily_restricted",
          description: "Board-designated youth fund",
          purpose: "Youth program costs",
          source: "Donor restriction",
          start_date: "2026-01-01",
          end_date: "2026-12-31",
          status: "active",
        },
        {
          name: "Youth Restricted",
          type: "temporarily_restricted",
          description: "Duplicate",
        },
      ],
    });

    expect(result.insertedRows).toBe(1);
    expect(result.duplicateRows).toBe(1);
    expect(result.failedRows).toBe(0);
    expect(result.createdCounts.funds).toBe(1);
    expect(query.entities.findFirst).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalledWith(funds);
    const fundInsert = insert.mock.results.find(
      (_result, index) => insert.mock.calls[index]?.[0] === funds,
    )?.value;
    expect(fundInsert?.values).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        entityId: "entity-active",
        externalId: "FUND-100",
        name: "Youth Restricted",
        restrictionPurpose: "Youth program costs",
        restrictionSource: "Donor restriction",
        status: "active",
      }),
    );
    const historyInsert = insert.mock.results.find(
      (_result, index) => insert.mock.calls[index]?.[0] === importHistory,
    )?.value;
    expect(historyInsert?.values).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        entityId: "entity-active",
        entityType: "funds",
      }),
    );
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        activeEntityId: "entity-active",
        action: "created",
        entityType: "fund",
        entityId: "fund-1",
      }),
    );
  });

  it("reports fund import validation and insert failures", async () => {
    const query = {
      funds: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
    };
    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === importHistory
          ? [{ id: "history-1", orgId: "org-1", userId: "user-1", status: "failed" }]
          : [];

      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "funds",
      filename: "funds.csv",
      mapping: {
        name: "name",
        type: "type",
        status: "status",
      },
      rows: [
        { type: "temporarily_restricted" },
        { name: "Bad Type", type: "not-a-fund-type" },
        { name: "Bad Status", type: "temporarily_restricted", status: "paused" },
        { name: "No Insert", type: "temporarily_restricted", status: "active" },
      ],
    });

    expect(result.insertedRows).toBe(0);
    expect(result.failedRows).toBe(4);
    expect(result.createdCounts.funds).toBe(0);
    expect(query.funds.findFirst).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(funds);
    const historyValues = insert.mock.results.at(-1)?.value.values.mock.calls[0]?.[0];
    expect(historyValues.summary.errorDetails).toEqual([
      expect.objectContaining({ field: "name", code: "missing_name" }),
      expect.objectContaining({ field: "type", code: "invalid_enum" }),
      expect.objectContaining({ field: "status", code: "invalid_enum" }),
      expect.objectContaining({ field: "fund", code: "insert_failed" }),
    ]);
  });

  it("skips fund imports when the fund already exists in the active entity", async () => {
    const query = {
      funds: {
        findFirst: vi.fn().mockResolvedValue({
          id: "fund-existing",
          orgId: "org-1",
          entityId: "entity-active",
          name: "Existing Fund",
        }),
      },
    };
    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === importHistory
          ? [{ id: "history-1", orgId: "org-1", userId: "user-1", status: "completed" }]
          : [];

      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityId: "entity-active",
      entityType: "funds",
      filename: "funds.csv",
      mapping: {
        name: "name",
        type: "type",
      },
      rows: [{ name: "Existing Fund", type: "unrestricted" }],
    });

    expect(result.insertedRows).toBe(0);
    expect(result.duplicateRows).toBe(1);
    expect(insert).not.toHaveBeenCalledWith(funds);
  });

  it("rejects an active entity that is outside the organization", async () => {
    const query = {
      entities: { findFirst: vi.fn().mockResolvedValue(undefined) },
      contacts: { findFirst: vi.fn() },
    };
    const insert = vi.fn();

    await expect(
      commitImport(withTx({ query, insert }) as never, {
        orgId: "org-1",
        userId: "user-1",
        entityId: "entity-other",
        entityType: "contacts",
        filename: "contacts.csv",
        mapping: { email: "email", type: "type" },
        rows: [{ email: "a@example.com", type: "individual" }],
      }),
    ).rejects.toThrow("Active entity must belong to this organization.");
    expect(insert).not.toHaveBeenCalled();
  });

  it("imports opening balance rows into one balanced opening-balance journal entry", async () => {
    const query = {
      fiscalPeriods: {
        findFirst: vi.fn().mockResolvedValue({
          id: "period-1",
          orgId: "org-1",
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          endDate: new Date("2026-12-31T23:59:59.999Z"),
          status: "open",
        }),
      },
      chartOfAccounts: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ id: "cash-1", orgId: "org-1" })
          .mockResolvedValueOnce({ id: "net-assets-1", orgId: "org-1" }),
      },
      funds: { findFirst: vi.fn() },
      grants: { findFirst: vi.fn() },
      contacts: { findFirst: vi.fn() },
    };
    const entryReturning = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "je-1", orgId: "org-1", entryNumber: 2 }]);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning: entryReturning });
    const entryValues = vi.fn().mockReturnValue({ onConflictDoNothing });
    const lineValues = vi.fn().mockResolvedValue(undefined);
    const historyValues = vi.fn().mockReturnValue({
      returning: vi
        .fn()
        .mockResolvedValue([
          { id: "history-1", orgId: "org-1", userId: "user-1", status: "completed" },
        ]),
    });
    const insert = vi.fn((table: unknown) => {
      if (table === journalEntries) return { values: entryValues };
      if (table === journalLines) return { values: lineValues };
      if (table === importHistory) return { values: historyValues };
      return { values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }) };
    });
    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ max: 0 }]),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ max: 1 }]),
        }),
      });

    const result = await commitImport(withTx({ query, insert, select }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "opening_balances",
      filename: "opening-balances.csv",
      mapping: {
        accountCode: "account_code",
        debitCents: "debit",
        creditCents: "credit",
        fiscalPeriodId: "period_id",
        date: "date",
        memo: "memo",
      },
      rows: [
        {
          account_code: "1000",
          debit: "5000.00",
          credit: "",
          period_id: "period-1",
          date: "2026-01-01",
          memo: "Opening cash",
        },
        {
          account_code: "3000",
          debit: "",
          credit: "5000.00",
          period_id: "period-1",
          date: "2026-01-01",
          memo: "Opening net assets",
        },
      ],
    });

    expect(result.insertedRows).toBe(2);
    expect(result.failedRows).toBe(0);
    expect(result.createdCounts.openingBalanceLines).toBe(2);
    expect(entryValues).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        fiscalPeriodId: "period-1",
        source: "opening_balance",
        memo: "Imported opening balances from opening-balances.csv",
      }),
    );
    expect(onConflictDoNothing).toHaveBeenCalledTimes(2);
    expect(entryReturning).toHaveBeenCalledTimes(2);
    expect(select).toHaveBeenCalledTimes(2);
    expect(lineValues).toHaveBeenCalledWith([
      expect.objectContaining({
        journalEntryId: "je-1",
        accountId: "cash-1",
        debitCents: 500000,
        creditCents: 0,
      }),
      expect.objectContaining({
        journalEntryId: "je-1",
        accountId: "net-assets-1",
        debitCents: 0,
        creditCents: 500000,
      }),
    ]);
  });

  it("rejects unbalanced opening balance imports without writing a journal entry", async () => {
    const query = {
      fiscalPeriods: {
        findFirst: vi.fn().mockResolvedValue({
          id: "period-1",
          orgId: "org-1",
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          endDate: new Date("2026-12-31T23:59:59.999Z"),
          status: "open",
        }),
      },
      chartOfAccounts: { findFirst: vi.fn().mockResolvedValue({ id: "cash-1", orgId: "org-1" }) },
    };
    let historyPayload: Record<string, unknown> | undefined;
    const insert = vi.fn((table: unknown) => {
      const values = vi.fn((payload: Record<string, unknown>) => {
        if (table === importHistory) {
          historyPayload = payload;
        }
        return {
          returning: vi.fn().mockImplementation(() => {
            if (table === importHistory) {
              return Promise.resolve([
                { id: "history-1", orgId: "org-1", userId: "user-1", status: "failed" },
              ]);
            }
            return Promise.resolve([]);
          }),
        };
      });
      return {
        values,
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "opening_balances",
      filename: "opening-balances.csv",
      mapping: {
        accountCode: "account_code",
        debitCents: "debit",
        creditCents: "credit",
        fiscalPeriodId: "period_id",
        date: "date",
      },
      rows: [
        {
          account_code: "1000",
          debit: "100.00",
          credit: "",
          period_id: "period-1",
          date: "2026-01-01",
        },
      ],
    });

    expect(result.insertedRows).toBe(0);
    expect(result.failedRows).toBe(1);
    expect(historyPayload?.summary).toMatchObject({
      errorDetails: [
        expect.objectContaining({
          code: "opening_balance_unbalanced",
        }),
      ],
    });
    expect(insert).not.toHaveBeenCalledWith(journalEntries);
  });

  it("reports opening balance row validation errors before posting", async () => {
    const query = {
      chartOfAccounts: { findFirst: vi.fn().mockResolvedValue(undefined) },
      funds: { findFirst: vi.fn().mockResolvedValue(undefined) },
      grants: { findFirst: vi.fn().mockResolvedValue(undefined) },
      fiscalPeriods: { findFirst: vi.fn() },
    };
    const insert = vi.fn((table: unknown) => ({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue(
            table === importHistory
              ? [{ id: "history-1", orgId: "org-1", userId: "user-1", status: "failed" }]
              : [],
          ),
      }),
    }));

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "opening_balances",
      filename: "opening-balances.csv",
      mapping: {
        accountCode: "account_code",
        debitCents: "debit",
        creditCents: "credit",
        fiscalPeriodId: "period",
        date: "date",
        fundId: "fund_id",
        grantId: "grant_id",
      },
      rows: [
        {
          account_code: "9999",
          debit: "bad-money",
          period: "",
          date: "not-a-date",
          fund_id: "foreign-fund",
          grant_id: "foreign-grant",
        },
        {
          account_code: "9999",
          debit: "10.00",
          credit: "10.00",
          period: "period-1",
          date: "2026-01-01",
        },
      ],
    });

    expect(result.insertedRows).toBe(0);
    expect(result.failedRows).toBeGreaterThanOrEqual(2);
    expect(query.fiscalPeriods.findFirst).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalledWith(journalEntries);
    const historyValues = insert.mock.results[0]?.value.values.mock.calls[0]?.[0];
    expect(historyValues.summary.errorDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "account", code: "missing_account" }),
        expect.objectContaining({ field: "debitCents", code: "invalid_amount" }),
        expect.objectContaining({ field: "fiscalPeriodId", code: "missing_fiscal_period" }),
        expect.objectContaining({ field: "date", code: "missing_date" }),
        expect.objectContaining({ field: "fundId", code: "invalid_fund" }),
        expect.objectContaining({ field: "grantId", code: "invalid_grant" }),
        expect.objectContaining({ field: "amount", code: "invalid_debit_credit" }),
      ]),
    );
  });

  it("reports opening balance rows with no account lookup field", async () => {
    const query = {
      chartOfAccounts: { findFirst: vi.fn() },
      funds: { findFirst: vi.fn() },
      grants: { findFirst: vi.fn() },
      fiscalPeriods: { findFirst: vi.fn() },
    };
    const insert = vi.fn((table: unknown) => ({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue(
            table === importHistory
              ? [{ id: "history-1", orgId: "org-1", userId: "user-1", status: "failed" }]
              : [],
          ),
      }),
    }));

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "opening_balances",
      filename: "opening-balances.csv",
      mapping: {
        debitCents: "debit",
        fiscalPeriodId: "period",
        date: "date",
      },
      rows: [{ debit: "10.00", period: "period-1", date: "2026-01-01" }],
    });

    expect(result.failedRows).toBe(1);
    expect(query.chartOfAccounts.findFirst).not.toHaveBeenCalled();
    const historyInsert = insert.mock.results.find(
      (_result, index) => insert.mock.calls[index]?.[0] === importHistory,
    )?.value;
    expect(historyInsert?.values.mock.calls[0]?.[0].summary.errorDetails).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "missing_account" })]),
    );
  });

  it("rejects opening balances in closed or out-of-range fiscal periods", async () => {
    const account = { id: "account-1", orgId: "org-1" };
    const makeDb = (period: Record<string, unknown>) => {
      const query = {
        chartOfAccounts: { findFirst: vi.fn().mockResolvedValue(account) },
        funds: { findFirst: vi.fn() },
        grants: { findFirst: vi.fn() },
        fiscalPeriods: { findFirst: vi.fn().mockResolvedValue(period) },
      };
      const insert = vi.fn((table: unknown) => ({
        values: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue(
              table === importHistory
                ? [{ id: "history-1", orgId: "org-1", userId: "user-1", status: "failed" }]
                : [],
            ),
        }),
      }));
      return { insert, db: withTx({ query, insert }) };
    };
    const baseInput = {
      orgId: "org-1",
      userId: "user-1",
      entityType: "opening_balances" as const,
      filename: "opening-balances.csv",
      mapping: {
        accountCode: "account_code",
        debitCents: "debit",
        creditCents: "credit",
        fiscalPeriodId: "period",
        date: "date",
      },
      rows: [
        { account_code: "1000", debit: "10.00", period: "period-1", date: "2026-01-01" },
        { account_code: "2000", credit: "10.00", period: "period-1", date: "2026-01-01" },
      ],
    };

    const closed = makeDb({
      id: "period-1",
      orgId: "org-1",
      status: "closed",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
    });
    const closedResult = await commitImport(closed.db as never, baseInput);
    expect(closedResult.insertedRows).toBe(0);
    expect(closed.insert).not.toHaveBeenCalledWith(journalEntries);
    expect(closed.insert.mock.results[0]?.value.values.mock.calls[0]?.[0].summary).toMatchObject({
      errorDetails: [expect.objectContaining({ code: "invalid_fiscal_period" })],
    });

    const outside = makeDb({
      id: "period-1",
      orgId: "org-1",
      status: "open",
      startDate: new Date("2025-01-01"),
      endDate: new Date("2025-12-31"),
    });
    const outsideResult = await commitImport(outside.db as never, baseInput);
    expect(outsideResult.insertedRows).toBe(0);
    expect(outside.insert).not.toHaveBeenCalledWith(journalEntries);
    expect(outside.insert.mock.results[0]?.value.values.mock.calls[0]?.[0].summary).toMatchObject({
      errorDetails: [expect.objectContaining({ code: "date_outside_period" })],
    });
  });

  it("imports pledge schedules grouped by external pledge id", async () => {
    const contactLookup = vi.fn().mockResolvedValue({
      id: "contact-1",
      orgId: "org-1",
      email: "jane@example.org",
    });
    const query = {
      contacts: { findFirst: contactLookup },
      funds: { findFirst: vi.fn().mockResolvedValue(undefined) },
      grants: { findFirst: vi.fn().mockResolvedValue(undefined) },
      pledges: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === pledges
          ? [
              {
                id: "pledge-1",
                orgId: "org-1",
                contactId: "contact-1",
                status: "active",
                faceAmountCents: 100000,
              },
            ]
          : table === pledgeInstallments
            ? [
                { id: "inst-1", orgId: "org-1", pledgeId: "pledge-1", amountCents: 50000 },
                { id: "inst-2", orgId: "org-1", pledgeId: "pledge-1", amountCents: 50000 },
              ]
            : table === importHistory
              ? [{ id: "history-1", orgId: "org-1", userId: "user-1", status: "completed" }]
              : [];

      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "pledges",
      filename: "pledges.csv",
      mapping: {
        externalPledgeId: "pledge_id",
        contactEmail: "email",
        pledgeDate: "pledge_date",
        dueDate: "due_date",
        amountCents: "amount",
        discountRateBasisPoints: "discount_bps",
        netAssetClass: "net_asset_class",
        hasBarrier: "has_barrier",
        hasRightOfReturn: "right_of_return",
      },
      rows: [
        {
          pledge_id: "P-100",
          email: "jane@example.org",
          pledge_date: "2026-01-15",
          due_date: "2026-06-30",
          amount: "500.00",
          discount_bps: "0",
          net_asset_class: "temporarily_restricted",
          has_barrier: "false",
          right_of_return: "false",
        },
        {
          pledge_id: "P-100",
          email: "jane@example.org",
          pledge_date: "2026-01-15",
          due_date: "2026-12-31",
          amount: "500.00",
          discount_bps: "0",
          net_asset_class: "temporarily_restricted",
          has_barrier: "false",
          right_of_return: "false",
        },
      ],
    });

    expect(result.insertedRows).toBe(2);
    expect(result.createdCounts.pledges).toBe(1);
    expect(result.createdCounts.pledgeInstallments).toBe(2);
    expect(insert).toHaveBeenCalledWith(pledges);
    expect(insert).toHaveBeenCalledWith(pledgeInstallments);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "created",
        entityType: "pledge",
        entityId: "pledge-1",
      }),
    );
    expect(postPledgeRecognition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1", pledgeId: "pledge-1" }),
    );
  });

  it("imports pledge schedules with active-entity fund and grant name references", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn().mockResolvedValue({
          id: "contact-1",
          orgId: "org-1",
          email: "jane@example.org",
        }),
      },
      funds: {
        findFirst: vi.fn().mockResolvedValue({
          id: "fund-1",
          orgId: "org-1",
          entityId: "entity-1",
          name: "Youth Program Restricted Fund",
        }),
      },
      grants: {
        findFirst: vi.fn().mockResolvedValue({
          id: "grant-1",
          orgId: "org-1",
          entityId: "entity-1",
          name: "Youth Services Grant",
        }),
      },
      pledges: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    let pledgeValues: Record<string, unknown> | undefined;
    const insert = vi.fn((table: unknown) => ({
      values: vi.fn((payload: Record<string, unknown>) => {
        if (table === pledges) pledgeValues = payload;
        return {
          returning: vi.fn().mockResolvedValue(
            table === pledges
              ? [{ id: "pledge-1", orgId: "org-1", contactId: "contact-1" }]
              : table === pledgeInstallments
                ? [{ id: "installment-1", orgId: "org-1", pledgeId: "pledge-1" }]
                : table === importHistory
                  ? [
                      {
                        id: "history-1",
                        orgId: "org-1",
                        userId: "user-1",
                        status: "completed",
                      },
                    ]
                  : [],
          ),
        };
      }),
    }));

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityId: "entity-1",
      entityType: "pledges",
      filename: "pledges.csv",
      mapping: {
        externalPledgeId: "pledge_id",
        contactEmail: "email",
        pledgeDate: "pledge_date",
        dueDate: "due_date",
        amountCents: "amount",
        netAssetClass: "net_asset_class",
        fundName: "fund_name",
        grantName: "grant_name",
      },
      rows: [
        {
          pledge_id: "P-200",
          email: "jane@example.org",
          pledge_date: "2026-01-15",
          due_date: "2026-06-30",
          amount: "500.00",
          net_asset_class: "temporarily_restricted",
          fund_name: "Youth Program Restricted Fund",
          grant_name: "Youth Services Grant",
        },
      ],
    });

    expect(result.insertedRows).toBe(1);
    expect(pledgeValues).toMatchObject({ fundId: "fund-1", grantId: "grant-1" });
  });

  it("reports pledge schedule validation failures by row", async () => {
    const query = {
      contacts: { findFirst: vi.fn().mockResolvedValue(undefined) },
      funds: { findFirst: vi.fn().mockResolvedValue(undefined) },
      grants: { findFirst: vi.fn().mockResolvedValue(undefined) },
      pledges: { findFirst: vi.fn() },
    };
    const insert = vi.fn((table: unknown) => ({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue(
            table === importHistory
              ? [{ id: "history-1", orgId: "org-1", userId: "user-1", status: "failed" }]
              : [],
          ),
      }),
    }));

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "pledges",
      filename: "pledges.csv",
      mapping: {
        externalPledgeId: "pledge_id",
        contactEmail: "email",
        pledgeDate: "pledge_date",
        dueDate: "due_date",
        amountCents: "amount",
        discountRateBasisPoints: "discount_bp",
        netAssetClass: "net_asset",
        fundId: "fund_id",
        grantId: "grant_id",
      },
      rows: [
        {},
        {
          pledge_id: "P-1",
          email: "",
          pledge_date: "not-a-date",
          due_date: "not-a-date",
          amount: "bad-money",
          discount_bp: "-1",
          net_asset: "bad-class",
          fund_id: "foreign-fund",
          grant_id: "foreign-grant",
        },
      ],
    });

    expect(result.insertedRows).toBe(0);
    expect(result.failedRows).toBeGreaterThanOrEqual(2);
    expect(insert).not.toHaveBeenCalledWith(pledges);
    const historyValues = insert.mock.results[0]?.value.values.mock.calls[0]?.[0];
    expect(historyValues.summary.errorDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "externalPledgeId", code: "missing_pledge_lookup" }),
        expect.objectContaining({ field: "contact", code: "missing_contact_lookup" }),
        expect.objectContaining({ field: "pledgeDate", code: "missing_pledge_date" }),
        expect.objectContaining({ field: "discountRateBasisPoints", code: "invalid_integer" }),
        expect.objectContaining({ field: "netAssetClass", code: "invalid_enum" }),
        expect.objectContaining({ field: "fundId", code: "invalid_fund" }),
        expect.objectContaining({ field: "grantId", code: "invalid_grant" }),
        expect.objectContaining({ field: "dueDate", code: "missing_due_date" }),
        expect.objectContaining({ field: "amount", code: "invalid_amount" }),
      ]),
    );
  });

  it("propagates unexpected contact lookup errors during pledge imports", async () => {
    const query = {
      contacts: { findFirst: vi.fn().mockRejectedValue(new Error("contact lookup failed")) },
      funds: { findFirst: vi.fn() },
      grants: { findFirst: vi.fn() },
      pledges: { findFirst: vi.fn() },
    };
    const insert = vi.fn();

    await expect(
      commitImport(withTx({ query, insert }) as never, {
        orgId: "org-1",
        userId: "user-1",
        entityType: "pledges",
        filename: "pledges.csv",
        mapping: {
          externalPledgeId: "pledge_id",
          contactEmail: "email",
          pledgeDate: "pledge_date",
          dueDate: "due_date",
          amountCents: "amount",
          netAssetClass: "net_asset",
        },
        rows: [
          {
            pledge_id: "P-1",
            email: "donor@example.com",
            pledge_date: "2026-01-01",
            due_date: "2026-02-01",
            amount: "25.00",
            net_asset: "unrestricted",
          },
        ],
      }),
    ).rejects.toThrow("contact lookup failed");
    expect(insert).not.toHaveBeenCalledWith(pledges);
  });

  it("skips existing pledges and does not post recognition", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn().mockResolvedValue({
          id: "contact-1",
          orgId: "org-1",
          email: "jane@example.com",
        }),
      },
      funds: { findFirst: vi.fn() },
      grants: { findFirst: vi.fn() },
      pledges: { findFirst: vi.fn().mockResolvedValue({ id: "existing-pledge" }) },
    };
    const insert = vi.fn((table: unknown) => ({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue(
            table === importHistory
              ? [{ id: "history-1", orgId: "org-1", userId: "user-1", status: "completed" }]
              : [],
          ),
      }),
    }));

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "pledges",
      filename: "pledges.csv",
      mapping: {
        externalPledgeId: "pledge_id",
        contactEmail: "email",
        pledgeDate: "pledge_date",
        dueDate: "due_date",
        amountCents: "amount",
        netAssetClass: "net_asset",
      },
      rows: [
        {
          pledge_id: "P-1",
          email: "jane@example.com",
          pledge_date: "2026-01-15",
          due_date: "2026-06-30",
          amount: "100.00",
          net_asset: "temporarily_restricted",
        },
      ],
    });

    expect(result.insertedRows).toBe(0);
    expect(result.failedRows).toBe(0);
    expect(result.createdCounts.pledges).toBe(0);
    expect(insert).not.toHaveBeenCalledWith(pledges);
    expect(postPledgeRecognition).not.toHaveBeenCalled();
  });

  it("reports mixed opening balance fiscal periods and dates", async () => {
    const query = {
      chartOfAccounts: {
        findFirst: vi.fn().mockResolvedValue({ id: "acct-1", orgId: "org-1", code: "1000" }),
      },
      funds: { findFirst: vi.fn() },
      grants: { findFirst: vi.fn() },
      fiscalPeriods: { findFirst: vi.fn() },
      journalEntries: { findFirst: vi.fn() },
    };
    const insert = vi.fn((table: unknown) => ({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue(
            table === importHistory
              ? [{ id: "history-1", orgId: "org-1", userId: "user-1", status: "failed" }]
              : [],
          ),
      }),
    }));

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "opening_balances",
      filename: "opening-balances.csv",
      mapping: {
        accountCode: "account_code",
        debitCents: "debit",
        creditCents: "credit",
        fiscalPeriodId: "period",
        date: "date",
      },
      rows: [
        { account_code: "1000", debit: "10.00", period: "period-1", date: "2026-01-01" },
        { account_code: "1000", credit: "10.00", period: "period-2", date: "2026-01-02" },
      ],
    });

    expect(result.insertedRows).toBe(0);
    expect(result.failedRows).toBe(3);
    const historyValues = insert.mock.results[0]?.value.values.mock.calls[0]?.[0];
    expect(historyValues.summary.errorDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "fiscalPeriodId", code: "mixed_fiscal_periods" }),
        expect.objectContaining({ field: "date", code: "mixed_dates" }),
      ]),
    );
  });

  it("posts opening balances using account ids with valid fund and grant references", async () => {
    const query = {
      chartOfAccounts: {
        findFirst: vi.fn().mockResolvedValue({ id: "acct-1", orgId: "org-1", code: "1000" }),
      },
      funds: {
        findFirst: vi.fn().mockResolvedValue({ id: "fund-1", orgId: "org-1", name: "General" }),
      },
      grants: {
        findFirst: vi.fn().mockResolvedValue({ id: "grant-1", orgId: "org-1", name: "Grant" }),
      },
      fiscalPeriods: {
        findFirst: vi.fn().mockResolvedValue({
          id: "period-1",
          orgId: "org-1",
          status: "open",
          startDate: new Date("2026-01-01"),
          endDate: new Date("2026-12-31"),
        }),
      },
      journalEntries: {
        findFirst: vi.fn().mockResolvedValue({ entryNumber: "JE-00000041" }),
      },
    };
    const insert = vi.fn((table: unknown) => {
      const returning = vi
        .fn()
        .mockResolvedValue(
          table === journalEntries
            ? [{ id: "journal-1", orgId: "org-1", entryNumber: "JE-00000042" }]
            : table === importHistory
              ? [{ id: "history-1", orgId: "org-1", userId: "user-1", status: "completed" }]
              : [],
        );
      return {
        values: vi.fn().mockReturnValue({
          returning,
          onConflictDoNothing: vi.fn().mockReturnValue({ returning }),
        }),
      };
    });
    const select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ max: "JE-00000041" }]),
      }),
    });

    const result = await commitImport(withTx({ query, insert, select }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "opening_balances",
      filename: "opening-balances.csv",
      mapping: {
        accountId: "account_id",
        debitCents: "debit",
        creditCents: "credit",
        fiscalPeriodId: "period",
        date: "date",
        fundId: "fund_id",
        grantId: "grant_id",
        memo: "memo",
      },
      rows: [
        {
          account_id: "acct-1",
          debit: "10.00",
          period: "period-1",
          date: "2026-01-01",
          fund_id: "fund-1",
          grant_id: "grant-1",
          memo: "Cash",
        },
        {
          account_id: "acct-1",
          credit: "10.00",
          period: "period-1",
          date: "2026-01-01",
          fund_id: "fund-1",
          grant_id: "grant-1",
          memo: "Equity",
        },
      ],
    });

    expect(result.insertedRows).toBe(2);
    expect(result.createdCounts.openingBalanceLines).toBe(2);
    expect(query.chartOfAccounts.findFirst).toHaveBeenCalledTimes(2);
    expect(insert).toHaveBeenCalledWith(journalEntries);
    expect(insert).toHaveBeenCalledWith(journalLines);
  });

  it("throws when an opening balance journal entry cannot be inserted", async () => {
    const query = {
      chartOfAccounts: {
        findFirst: vi.fn().mockResolvedValue({ id: "acct-1", orgId: "org-1", code: "1000" }),
      },
      funds: { findFirst: vi.fn() },
      grants: { findFirst: vi.fn() },
      fiscalPeriods: {
        findFirst: vi.fn().mockResolvedValue({
          id: "period-1",
          orgId: "org-1",
          status: "open",
          startDate: new Date("2026-01-01"),
          endDate: new Date("2026-12-31"),
        }),
      },
    };
    const insert = vi.fn((table: unknown) => {
      const returning = vi
        .fn()
        .mockResolvedValue(
          table === importHistory
            ? [{ id: "history-1", orgId: "org-1", userId: "user-1", status: "completed" }]
            : [],
        );
      return {
        values: vi.fn().mockReturnValue({
          returning,
          onConflictDoNothing: vi.fn().mockReturnValue({ returning }),
        }),
      };
    });
    const select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ max: 0 }]),
      }),
    });

    await expect(
      commitImport(withTx({ query, insert, select }) as never, {
        orgId: "org-1",
        userId: "user-1",
        entityType: "opening_balances",
        filename: "opening-balances.csv",
        mapping: {
          accountCode: "account_code",
          debitCents: "debit",
          creditCents: "credit",
          fiscalPeriodId: "period",
          date: "date",
        },
        rows: [
          { account_code: "1000", debit: "10.00", period: "period-1", date: "2026-01-01" },
          { account_code: "1000", credit: "10.00", period: "period-1", date: "2026-01-01" },
        ],
      }),
    ).rejects.toThrow("Could not allocate a journal entry number");
  });

  it("throws when import history cannot be inserted for opening balances", async () => {
    const query = {
      chartOfAccounts: { findFirst: vi.fn() },
      funds: { findFirst: vi.fn() },
      grants: { findFirst: vi.fn() },
      fiscalPeriods: { findFirst: vi.fn() },
    };
    const insert = vi.fn(() => ({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }));

    await expect(
      commitImport(withTx({ query, insert }) as never, {
        orgId: "org-1",
        userId: "user-1",
        entityType: "opening_balances",
        filename: "opening-balances.csv",
        mapping: {},
        rows: [],
      }),
    ).rejects.toThrow("Failed to create import history");
  });

  it("imports conditional pledges from fallback keys without posting recognition", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn().mockResolvedValue({
          id: "contact-1",
          orgId: "org-1",
          email: "jane@example.com",
        }),
      },
      funds: {
        findFirst: vi.fn().mockResolvedValue({ id: "fund-1", orgId: "org-1", name: "General" }),
      },
      grants: {
        findFirst: vi.fn().mockResolvedValue({ id: "grant-1", orgId: "org-1", name: "Grant" }),
      },
      pledges: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const insert = vi.fn((table: unknown) => ({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(
          table === pledges
            ? [
                {
                  id: "pledge-1",
                  orgId: "org-1",
                  contactId: "contact-1",
                  status: "conditional",
                },
              ]
            : table === pledgeInstallments
              ? [{ id: "inst-1", orgId: "org-1", pledgeId: "pledge-1", amountCents: 25000 }]
              : table === importHistory
                ? [{ id: "history-1", orgId: "org-1", userId: "user-1", status: "completed" }]
                : [],
        ),
      }),
    }));

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "pledges",
      filename: "pledges.csv",
      mapping: {
        contactEmail: "email",
        pledgeDate: "pledge_date",
        dueDate: "due_date",
        amountCents: "amount",
        netAssetClass: "net_asset",
        fundId: "fund_id",
        grantId: "grant_id",
        hasBarrier: "has_barrier",
        hasRightOfReturn: "right_of_return",
        conditionNote: "condition_note",
        notes: "notes",
      },
      rows: [
        {
          email: "jane@example.com",
          pledge_date: "2026-01-15",
          due_date: "2026-06-30",
          amount: "250.00",
          net_asset: "temporarily_restricted",
          fund_id: "fund-1",
          grant_id: "grant-1",
          has_barrier: "true",
          right_of_return: "true",
          condition_note: "Board approval",
          notes: "Imported pledge",
        },
      ],
    });

    expect(result.insertedRows).toBe(1);
    expect(result.createdCounts.pledges).toBe(1);
    const pledgeValues = insert.mock.calls.find(([table]) => table === pledges);
    expect(pledgeValues).toBeDefined();
    expect(postPledgeRecognition).not.toHaveBeenCalled();
  });

  it("throws when a pledge group cannot be inserted", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn().mockResolvedValue({
          id: "contact-1",
          orgId: "org-1",
          email: "jane@example.com",
        }),
      },
      funds: { findFirst: vi.fn() },
      grants: { findFirst: vi.fn() },
      pledges: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const insert = vi.fn((table: unknown) => ({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(table === pledgeInstallments ? [] : []),
      }),
    }));

    await expect(
      commitImport(withTx({ query, insert }) as never, {
        orgId: "org-1",
        userId: "user-1",
        entityType: "pledges",
        filename: "pledges.csv",
        mapping: {
          externalPledgeId: "pledge_id",
          contactEmail: "email",
          pledgeDate: "pledge_date",
          dueDate: "due_date",
          amountCents: "amount",
          netAssetClass: "net_asset",
        },
        rows: [
          {
            pledge_id: "P-1",
            email: "jane@example.com",
            pledge_date: "2026-01-15",
            due_date: "2026-06-30",
            amount: "100.00",
            net_asset: "temporarily_restricted",
          },
        ],
      }),
    ).rejects.toThrow("Failed to create pledge for import group P-1");
  });

  it("posts accounting entries for imported donations when userId is present", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn().mockResolvedValue({
          id: "contact-1",
          orgId: "org-1",
          email: "jane@example.com",
        }),
      },
      donations: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
    };
    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === donations
          ? [{ id: "donation-1", orgId: "org-1", amountCents: 5000 }]
          : table === importHistory
            ? [{ id: "history-1", orgId: "org-1", userId: "user-1", status: "completed" }]
            : [];

      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      };
    });
    const db = withTx({ query, insert });

    const result = await commitImport(db as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "donations",
      filename: "donations.csv",
      mapping: {
        amountCents: "amount_cents",
        date: "date",
        type: "type",
        contactEmail: "email",
      },
      rows: [
        {
          amount_cents: 5000,
          date: "2026-04-01T00:00:00.000Z",
          type: "one_time",
          email: "jane@example.com",
        },
      ],
    });

    expect(result.insertedRows).toBe(1);
    expect(postDonation).toHaveBeenCalledWith(db, {
      orgId: "org-1",
      actorId: "user-1",
      donationId: "donation-1",
      action: "create",
    });
  });

  it("rejects imported contacts with affiliatedOrgId outside the caller org", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined),
      },
    };
    const insert = vi.fn((table: unknown) => ({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue(
            table === importHistory
              ? [{ id: "history-1", orgId: "org-1", userId: "user-1", status: "failed" }]
              : [],
          ),
      }),
    }));

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "contacts",
      filename: "contacts.csv",
      mapping: {
        email: "email",
        firstName: "first_name",
        lastName: "last_name",
        type: "type",
        affiliatedOrgId: "affiliated_org_id",
      },
      rows: [
        {
          email: "jane@example.com",
          first_name: "Jane",
          last_name: "Doe",
          type: "individual",
          affiliated_org_id: "foreign-contact-id",
        },
      ],
    });

    expect(result.insertedRows).toBe(0);
    expect(result.failedRows).toBe(1);
    expect(insert).not.toHaveBeenCalledWith(contacts);
    const historyValues = insert.mock.results[0]?.value.values.mock.calls[0]?.[0];
    expect(historyValues.summary.errorDetails).toEqual([
      expect.objectContaining({
        field: "affiliatedOrgId",
        code: "invalid_affiliated_org",
      }),
    ]);
  });

  it("propagates contact affiliated organization lookup infrastructure errors", async () => {
    const query = {
      contacts: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error("contact lookup failed")),
      },
    };
    const insert = vi.fn();

    await expect(
      commitImport(withTx({ query, insert }) as never, {
        orgId: "org-1",
        userId: "user-1",
        entityType: "contacts",
        filename: "contacts.csv",
        mapping: {
          type: "type",
          firstName: "first_name",
          affiliatedOrgId: "affiliated_org_id",
        },
        rows: [
          {
            type: "individual",
            first_name: "Jane",
            affiliated_org_id: "org-contact-1",
          },
        ],
      }),
    ).rejects.toThrow("contact lookup failed");
    expect(insert).not.toHaveBeenCalled();
  });

  it("does not treat a failed affiliatedOrgId row as a duplicate for later valid rows", async () => {
    const query = {
      contacts: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce({ id: "affiliate-1", orgId: "org-1", deletedAt: null }),
      },
    };
    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === contacts
          ? [{ id: "contact-1", orgId: "org-1", email: "jane@example.com" }]
          : table === importHistory
            ? [
                {
                  id: "history-1",
                  orgId: "org-1",
                  userId: "user-1",
                  status: "completed_with_duplicates",
                },
              ]
            : [];

      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "contacts",
      filename: "contacts.csv",
      mapping: {
        email: "email",
        firstName: "first_name",
        lastName: "last_name",
        type: "type",
        affiliatedOrgId: "affiliated_org_id",
      },
      rows: [
        {
          email: "jane@example.com",
          first_name: "Jane",
          last_name: "Doe",
          type: "individual",
          affiliated_org_id: "foreign-contact-id",
        },
        {
          email: "jane@example.com",
          first_name: "Jane",
          last_name: "Doe",
          type: "individual",
          affiliated_org_id: "affiliate-1",
        },
      ],
    });

    expect(result.insertedRows).toBe(1);
    expect(result.failedRows).toBe(1);
    expect(result.duplicateRows).toBe(0);
    expect(result.createdCounts.contacts).toBe(1);
    expect(insert).toHaveBeenCalledWith(contacts);
  });

  it("rejects donation-created contacts with affiliatedOrgId outside the caller org", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
      donations: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
    };
    const insert = vi.fn((table: unknown) => ({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue(
            table === importHistory
              ? [{ id: "history-1", orgId: "org-1", userId: "user-1", status: "failed" }]
              : [],
          ),
      }),
    }));

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "donations",
      filename: "donations.csv",
      mapping: {
        amountCents: "amount_cents",
        date: "date",
        type: "type",
        contactEmail: "email",
        contactFirstName: "first_name",
        contactLastName: "last_name",
        contactAffiliatedOrgId: "affiliated_org_id",
      },
      rows: [
        {
          amount_cents: 5000,
          date: "2026-04-01T00:00:00.000Z",
          type: "one_time",
          email: "jane@example.com",
          first_name: "Jane",
          last_name: "Doe",
          affiliated_org_id: "foreign-contact-id",
        },
      ],
    });

    expect(result.insertedRows).toBe(0);
    expect(result.failedRows).toBe(1);
    expect(insert).not.toHaveBeenCalledWith(contacts);
    expect(insert).not.toHaveBeenCalledWith(donations);
    const historyValues = insert.mock.results[0]?.value.values.mock.calls[0]?.[0];
    expect(historyValues.summary.errorDetails).toEqual([
      expect.objectContaining({
        field: "contactAffiliatedOrgId",
        code: "invalid_affiliated_org",
      }),
    ]);
  });

  it("does not treat failed donation contact affiliatedOrgId rows as duplicate contact lookups", async () => {
    const query = {
      contacts: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce({
            id: "affiliate-1",
            orgId: "org-1",
            email: "affiliate@example.org",
          }),
      },
      donations: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
    };
    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === contacts
          ? [{ id: "contact-1", orgId: "org-1", email: "jane@example.com" }]
          : table === donations
            ? [{ id: "donation-1", orgId: "org-1", amountCents: 5000 }]
            : table === importHistory
              ? [{ id: "history-1", orgId: "org-1", userId: "user-1", status: "completed" }]
              : [];

      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "donations",
      filename: "donations.csv",
      mapping: {
        amountCents: "amount_cents",
        date: "date",
        type: "type",
        contactEmail: "email",
        contactFirstName: "first_name",
        contactLastName: "last_name",
        contactAffiliatedOrgId: "affiliated_org_id",
      },
      rows: [
        {
          amount_cents: 5000,
          date: "2026-04-01T00:00:00.000Z",
          type: "one_time",
          email: "jane@example.com",
          first_name: "Jane",
          last_name: "Doe",
          affiliated_org_id: "foreign-contact-id",
        },
        {
          amount_cents: 5000,
          date: "2026-04-02T00:00:00.000Z",
          type: "one_time",
          email: "jane@example.com",
          first_name: "Jane",
          last_name: "Doe",
          affiliated_org_id: "affiliate-1",
        },
      ],
    });

    expect(result.insertedRows).toBe(1);
    expect(result.failedRows).toBe(1);
    expect(result.duplicateRows).toBe(0);
    expect(result.createdCounts.contacts).toBe(1);
    expect(result.createdCounts.donations).toBe(1);
    expect(insert).toHaveBeenCalledWith(contacts);
    expect(insert).toHaveBeenCalledWith(donations);
  });

  it("imports non-federal grant opportunities with source metadata and activity", async () => {
    const query = {
      grantOpportunities: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
    };
    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === grantOpportunities
          ? [{ id: "opportunity-1", orgId: "org-1", title: "Neighborhood Resilience Fund" }]
          : table === importHistory
            ? [{ id: "history-1", orgId: "org-1", userId: "user-1", status: "completed" }]
            : [];

      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "grant_opportunities",
      filename: "opportunities.csv",
      mapping: {
        title: "title",
        sourceName: "sourceName",
        sourceType: "sourceType",
        deadline: "deadline",
        sourceUrl: "sourceUrl",
        amountCeiling: "amountCeiling",
        eligibilityNotes: "eligibilityNotes",
        internalNotes: "internalNotes",
      },
      rows: [
        {
          title: "Neighborhood Resilience Fund",
          sourceName: "Community Foundation",
          sourceType: "community_foundation",
          deadline: "2026-06-30",
          sourceUrl: "https://example.org/apply",
          amountCeiling: "50000.00",
          eligibilityNotes: "County nonprofits",
          internalNotes: "Review match terms",
        },
      ],
    });

    expect(result.insertedRows).toBe(1);
    expect(result.createdCounts.grantOpportunities).toBe(1);
    expect(insert).toHaveBeenCalledWith(grantOpportunities);
    expect(insert).toHaveBeenCalledWith(importHistory);
    expect(insert.mock.calls[0]?.[0]).toBe(grantOpportunities);
    const opportunityValues = insert.mock.results[0]?.value.values.mock.calls[0]?.[0];
    expect(opportunityValues).toMatchObject({
      orgId: "org-1",
      source: "manual",
      sourceType: "community_foundation",
      sourceName: "Community Foundation",
      sourceUrl: "https://example.org/apply",
      funderType: "foundation",
      deadlineSource: "import",
      title: "Neighborhood Resilience Fund",
      agencyName: "Community Foundation",
      status: "posted",
      awardCeilingCents: 5000000,
      eligibleApplicants: ["County nonprofits"],
      officialUrl: "https://example.org/apply",
    });
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        entityType: "grant_opportunity",
        entityId: "opportunity-1",
      }),
    );
  });

  it("rejects federal grant opportunities in CSV import", async () => {
    const query = {
      grantOpportunities: {
        findFirst: vi.fn(),
      },
    };
    const insert = vi.fn((table: unknown) => ({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue(
            table === importHistory
              ? [{ id: "history-1", orgId: "org-1", userId: "user-1", status: "failed" }]
              : [],
          ),
      }),
    }));

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "grant_opportunities",
      filename: "opportunities.csv",
      mapping: {
        title: "title",
        sourceName: "sourceName",
        sourceType: "sourceType",
      },
      rows: [
        {
          title: "Federal Opportunity",
          sourceName: "Grants.gov",
          sourceType: "federal",
        },
      ],
    });

    expect(result.insertedRows).toBe(0);
    expect(result.failedRows).toBe(1);
    expect(query.grantOpportunities.findFirst).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalledWith(grantOpportunities);
    const historyValues = insert.mock.results[0]?.value.values.mock.calls[0]?.[0];
    expect(historyValues.summary).toMatchObject({
      errorDetails: [
        expect.objectContaining({
          field: "sourceType",
          code: "federal_import_not_supported",
        }),
      ],
    });
  });

  it("fails grant opportunity rows with invalid amount ranges", async () => {
    const insert = vi.fn((table: unknown) => ({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue(
            table === importHistory
              ? [{ id: "history-1", orgId: "org-1", userId: "user-1", status: "failed" }]
              : [],
          ),
      }),
    }));

    const db = withTx({
      query: { grantOpportunities: { findFirst: vi.fn() } },
      insert,
    });

    const result = await commitImport(db as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "grant_opportunities",
      filename: "opportunities.csv",
      mapping: {
        title: "title",
        sourceName: "sourceName",
        sourceType: "sourceType",
        amountCeiling: "amountCeiling",
      },
      rows: [
        {
          title: "Neighborhood Resilience Fund",
          sourceName: "Community Foundation",
          sourceType: "community_foundation",
          amountCeiling: "not-money",
        },
      ],
    });

    expect(result.insertedRows).toBe(0);
    expect(result.failedRows).toBe(1);
    const historyValues = insert.mock.results[0]?.value.values.mock.calls[0]?.[0];
    expect(historyValues.summary.errorDetails).toEqual([
      expect.objectContaining({
        field: "amountCeiling",
        code: "invalid_amount",
      }),
    ]);
  });

  it("rejects grant opportunity CSV rows with unsafe source URLs", async () => {
    const insert = vi.fn((table: unknown) => ({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue(
            table === importHistory
              ? [{ id: "history-1", orgId: "org-1", userId: "user-1", status: "failed" }]
              : [],
          ),
      }),
    }));
    const db = withTx({
      query: { grantOpportunities: { findFirst: vi.fn() } },
      insert,
    });

    const result = await commitImport(db as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "grant_opportunities",
      filename: "opportunities.csv",
      mapping: {
        title: "title",
        sourceName: "sourceName",
        sourceType: "sourceType",
        sourceUrl: "sourceUrl",
      },
      rows: [
        {
          title: "Neighborhood Resilience Fund",
          sourceName: "Community Foundation",
          sourceType: "community_foundation",
          sourceUrl: "javascript:alert(1)",
        },
      ],
    });

    expect(result.failedRows).toBe(1);
    expect(insert).not.toHaveBeenCalledWith(grantOpportunities);
    const historyValues = insert.mock.results[0]?.value.values.mock.calls[0]?.[0];
    expect(historyValues.summary.errorDetails).toEqual([
      expect.objectContaining({
        field: "sourceUrl",
        code: "invalid_source_url",
      }),
    ]);
  });

  it("defaults non-foundation opportunity funder types during CSV import", async () => {
    const query = {
      grantOpportunities: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
    };
    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === grantOpportunities
          ? [{ id: `opportunity-${insert.mock.calls.length}`, orgId: "org-1" }]
          : table === importHistory
            ? [{ id: "history-1", orgId: "org-1", userId: "user-1", status: "completed" }]
            : [];

      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "grant_opportunities",
      filename: "opportunities.csv",
      mapping: {
        title: "title",
        sourceName: "sourceName",
        sourceType: "sourceType",
        externalId: "externalId",
        amountFloor: "amountFloor",
        funderType: "funderType",
      },
      rows: [
        {
          title: "Corporate Fund",
          sourceName: "Acme",
          sourceType: "corporate",
          externalId: "ACME-1",
          amountFloor: "1000",
        },
        {
          title: "City Fund",
          sourceName: "Austin",
          sourceType: "state_local",
          externalId: "CITY-1",
        },
        {
          title: "Association Fund",
          sourceName: "Membership Group",
          sourceType: "association",
          externalId: "ASSOC-1",
        },
        {
          title: "Other Fund",
          sourceName: "Regional Collaborative",
          sourceType: "other",
          externalId: "OTHER-1",
          funderType: "corporate",
        },
      ],
    });

    expect(result.insertedRows).toBe(4);
    const opportunityPayloads = insert.mock.results
      .filter((_, index) => insert.mock.calls[index]?.[0] === grantOpportunities)
      .map((result) => result.value.values.mock.calls[0]?.[0]);
    expect(opportunityPayloads.map((payload) => payload.funderType)).toEqual([
      "corporate",
      "government",
      "other",
      "corporate",
    ]);
    expect(opportunityPayloads[0]).toMatchObject({
      externalId: "ACME-1",
      sourceOpportunityId: "manual:corporate:acme:external:acme-1",
      awardFloorCents: 100000,
    });
  });

  it("namespaces grant opportunity import external IDs by source", async () => {
    const query = {
      grantOpportunities: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
    };
    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === grantOpportunities
          ? [{ id: `opportunity-${insert.mock.calls.length}`, orgId: "org-1" }]
          : table === importHistory
            ? [{ id: "history-1", orgId: "org-1", userId: "user-1", status: "completed" }]
            : [];

      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "grant_opportunities",
      filename: "opportunities.csv",
      mapping: {
        title: "title",
        sourceName: "sourceName",
        sourceType: "sourceType",
        externalId: "externalId",
      },
      rows: [
        {
          title: "Spring Fund",
          sourceName: "Community Foundation",
          sourceType: "community_foundation",
          externalId: "SPRING-2026",
        },
        {
          title: "Spring Fund",
          sourceName: "Corporate Giving",
          sourceType: "corporate",
          externalId: "SPRING-2026",
        },
      ],
    });

    expect(result.insertedRows).toBe(2);
    const opportunityPayloads = insert.mock.results
      .filter((_, index) => insert.mock.calls[index]?.[0] === grantOpportunities)
      .map((result) => result.value.values.mock.calls[0]?.[0]);
    expect(opportunityPayloads.map((payload) => payload.sourceOpportunityId)).toEqual([
      "manual:community_foundation:community-foundation:external:spring-2026",
      "manual:corporate:corporate-giving:external:spring-2026",
    ]);
  });

  it("deduplicates grant opportunity imports by external ID and existing records", async () => {
    const query = {
      grantOpportunities: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce({ id: "existing-opp" }),
      },
    };
    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === grantOpportunities
          ? [{ id: "opportunity-1", orgId: "org-1" }]
          : table === importHistory
            ? [
                {
                  id: "history-1",
                  orgId: "org-1",
                  userId: "user-1",
                  status: "completed_with_duplicates",
                },
              ]
            : [];

      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "grant_opportunities",
      filename: "opportunities.csv",
      mapping: {
        title: "title",
        sourceName: "sourceName",
        sourceType: "sourceType",
        externalId: "externalId",
      },
      rows: [
        {
          title: "First Fund",
          sourceName: "Foundation",
          sourceType: "private_foundation",
          externalId: "FOUND-1",
        },
        {
          title: "First Fund Duplicate",
          sourceName: "Foundation",
          sourceType: "private_foundation",
          externalId: "FOUND-1",
        },
        {
          title: "Existing Fund",
          sourceName: "Foundation",
          sourceType: "private_foundation",
          externalId: "FOUND-2",
        },
      ],
    });

    expect(result.insertedRows).toBe(1);
    expect(result.duplicateRows).toBe(2);
    expect(query.grantOpportunities.findFirst).toHaveBeenCalledTimes(2);
    expect(insert.mock.calls.filter(([table]) => table === grantOpportunities)).toHaveLength(1);
  });

  it("reports grant opportunity import field validation failures", async () => {
    const insert = vi.fn((table: unknown) => ({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue(
            table === importHistory
              ? [{ id: "history-1", orgId: "org-1", userId: "user-1", status: "failed" }]
              : [],
          ),
      }),
    }));

    const db = withTx({
      query: { grantOpportunities: { findFirst: vi.fn() } },
      insert,
    });

    const result = await commitImport(db as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "grant_opportunities",
      filename: "opportunities.csv",
      mapping: {
        title: "title",
        sourceName: "sourceName",
        sourceType: "sourceType",
        funderType: "funderType",
        amountFloor: "amountFloor",
      },
      rows: [
        { sourceName: "Foundation", sourceType: "private_foundation" },
        { title: "Missing Source", sourceType: "private_foundation" },
        { title: "Missing Type", sourceName: "Foundation" },
        {
          title: "Bad Type",
          sourceName: "Foundation",
          sourceType: "private_foundation",
          funderType: "not-a-funder",
        },
        {
          title: "Bad Floor",
          sourceName: "Foundation",
          sourceType: "private_foundation",
          amountFloor: "not-money",
        },
      ],
    });

    expect(result.failedRows).toBe(5);
    const historyValues = insert.mock.results[0]?.value.values.mock.calls[0]?.[0];
    expect(historyValues.summary.errorDetails).toEqual([
      expect.objectContaining({ field: "title", code: "missing_title" }),
      expect.objectContaining({ field: "sourceName", code: "missing_source_name" }),
      expect.objectContaining({ field: "sourceType", code: "missing_source_type" }),
      expect.objectContaining({ field: "funderType", code: "invalid_enum" }),
      expect.objectContaining({ field: "amountFloor", code: "invalid_amount" }),
    ]);
  });

  it("reports grant opportunity invalid source type and insert failures", async () => {
    const query = {
      grantOpportunities: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === importHistory
          ? [{ id: "history-1", orgId: "org-1", userId: "user-1", status: "failed" }]
          : [];
      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityId: "entity-active",
      entityType: "grant_opportunities",
      filename: "opportunities.csv",
      mapping: {
        title: "title",
        sourceName: "source",
        sourceType: "type",
      },
      rows: [
        { title: "Bad source", source: "City", type: "local" },
        { title: "No insert", source: "Foundation", type: "private_foundation" },
      ],
    });

    expect(result.insertedRows).toBe(0);
    expect(result.failedRows).toBe(2);
    expect(result.history.status).toBe("failed");
    const historyValues = insert.mock.results.at(-1)?.value.values.mock.calls[0]?.[0];
    expect(historyValues.summary.errorDetails).toEqual([
      expect.objectContaining({ field: "sourceType", code: "invalid_enum" }),
      expect.objectContaining({ field: "grantOpportunity", code: "insert_failed" }),
    ]);
  });

  it("marks an organization contact as a duplicate when it already exists", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn().mockResolvedValue({
          id: "contact-1",
          orgId: "org-1",
          type: "organization",
          organizationName: "Acme Foundation",
        }),
      },
      donations: {
        findFirst: vi.fn(),
      },
      grants: {
        findFirst: vi.fn(),
      },
      funders: {
        findFirst: vi.fn(),
      },
    };

    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === importHistory
          ? [
              {
                id: "history-2",
                orgId: "org-1",
                userId: "user-1",
                status: "completed_with_duplicates",
              },
            ]
          : [];

      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "contacts",
      filename: "contacts.csv",
      mapping: {
        type: "type",
        organizationName: "organization_name",
      },
      rows: [
        {
          type: "organization",
          organization_name: "Acme Foundation",
        },
      ],
    });

    expect(result.insertedRows).toBe(0);
    expect(result.duplicateRows).toBe(1);
    expect(result.history.status).toBe("completed_with_duplicates");
  });

  it("fails rows with no usable contact data", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn(),
      },
      donations: {
        findFirst: vi.fn(),
      },
      grants: {
        findFirst: vi.fn(),
      },
      funders: {
        findFirst: vi.fn(),
      },
    };

    let historyValues: Record<string, unknown> | undefined;
    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === importHistory
          ? [{ id: "history-3", orgId: "org-1", userId: "user-1", status: "failed" }]
          : [];

      return {
        values: vi.fn((v: Record<string, unknown>) => {
          if (table === importHistory) {
            historyValues = v;
          }
          return {
            returning: vi.fn().mockResolvedValue(inserted),
          };
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "contacts",
      filename: "contacts.csv",
      mapping: {},
      rows: [{}],
    });

    expect(result.insertedRows).toBe(0);
    expect(result.failedRows).toBe(1);
    expect(result.insertedRows).toBe(0);
    const summary = historyValues?.summary as {
      errorDetails: Array<{
        rowIndex: number;
        rowNumber: number;
        field: string;
        code: string;
        message: string;
      }>;
    };
    expect(summary.errorDetails).toEqual([
      {
        rowIndex: 0,
        rowNumber: 2,
        field: "contact",
        code: "missing_contact_lookup",
        message:
          "Add an email, organization name, or first/last name so GrantPipe can identify this contact.",
      },
    ]);
  });

  it("parses regular donation amount dollars into cents", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn().mockResolvedValue({
          id: "contact-1",
          orgId: "org-1",
          email: "jane@example.com",
        }),
      },
      donations: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
      grants: {
        findFirst: vi.fn(),
      },
      funders: {
        findFirst: vi.fn(),
      },
    };

    let donationValues: Record<string, unknown> | undefined;
    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === donations
          ? [{ id: "donation-dollar", orgId: "org-1", amountCents: 2500 }]
          : table === importHistory
            ? [{ id: "history-dollar", orgId: "org-1", userId: "user-1", status: "completed" }]
            : [];

      return {
        values: vi.fn((v: Record<string, unknown>) => {
          if (table === donations) {
            donationValues = v;
          }
          return {
            returning: vi.fn().mockResolvedValue(inserted),
          };
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "donations",
      filename: "donations.csv",
      mapping: {
        contactEmail: "Email",
        amountCents: "Amount",
        date: "Date",
        type: "Type",
      },
      rows: [
        {
          Email: "jane@example.com",
          Amount: "$25.00",
          Date: "2026-04-01",
          Type: "one_time",
        },
      ],
    });

    expect(result.insertedRows).toBe(1);
    expect(result.failedRows).toBe(0);
    expect(donationValues).toMatchObject({ amountCents: 2500 });
  });

  it("keeps explicit donation cents columns as cents", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn().mockResolvedValue({
          id: "contact-1",
          orgId: "org-1",
          email: "jane@example.com",
        }),
      },
      donations: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
      grants: {
        findFirst: vi.fn(),
      },
      funders: {
        findFirst: vi.fn(),
      },
    };

    let donationValues: Record<string, unknown> | undefined;
    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === donations
          ? [{ id: "donation-cents", orgId: "org-1", amountCents: 2500 }]
          : table === importHistory
            ? [{ id: "history-cents", orgId: "org-1", userId: "user-1", status: "completed" }]
            : [];

      return {
        values: vi.fn((v: Record<string, unknown>) => {
          if (table === donations) {
            donationValues = v;
          }
          return {
            returning: vi.fn().mockResolvedValue(inserted),
          };
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "donations",
      filename: "donations.csv",
      mapping: {
        contactEmail: "email",
        amountCents: "amount_cents",
        date: "date",
        type: "type",
      },
      rows: [
        {
          email: "jane@example.com",
          amount_cents: "2500",
          date: "2026-04-01",
          type: "one_time",
        },
      ],
    });

    expect(result.insertedRows).toBe(1);
    expect(result.failedRows).toBe(0);
    expect(donationValues).toMatchObject({ amountCents: 2500 });
  });

  it("fails donation rows with fundId or grantId outside the org", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn().mockResolvedValue({
          id: "contact-1",
          orgId: "org-1",
          email: "jane@example.com",
        }),
      },
      donations: { findFirst: vi.fn().mockResolvedValue(undefined) },
      funds: { findFirst: vi.fn().mockResolvedValue(undefined) },
      grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1", orgId: "org-1" }) },
      funders: { findFirst: vi.fn() },
    };

    let historyValues: Record<string, unknown> | undefined;
    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === importHistory
          ? [{ id: "history-ref", orgId: "org-1", userId: "user-1", status: "failed" }]
          : [];

      return {
        values: vi.fn((v: Record<string, unknown>) => {
          if (table === importHistory) historyValues = v;
          return { returning: vi.fn().mockResolvedValue(inserted) };
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "donations",
      filename: "donations.csv",
      mapping: {
        contactEmail: "email",
        amountCents: "amount_cents",
        date: "date",
        type: "type",
        fundId: "fund_id",
        grantId: "grant_id",
      },
      rows: [
        {
          email: "jane@example.com",
          amount_cents: "2500",
          date: "2026-04-01",
          type: "one_time",
          fund_id: "foreign-fund",
          grant_id: "grant-1",
        },
      ],
    });

    expect(result.failedRows).toBe(1);
    expect(insert).not.toHaveBeenCalledWith(donations);
    expect(historyValues?.summary).toMatchObject({
      errorDetails: [{ field: "fundId", code: "invalid_fund" }],
    });
  });

  it("does not create donation contacts when the row later fails fund validation", async () => {
    const query = {
      contacts: { findFirst: vi.fn().mockResolvedValue(undefined) },
      donations: { findFirst: vi.fn().mockResolvedValue(undefined) },
      funds: { findFirst: vi.fn().mockResolvedValue(undefined) },
      grants: { findFirst: vi.fn() },
      funders: { findFirst: vi.fn() },
    };

    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === contacts
          ? [{ id: "contact-side-effect", orgId: "org-1", email: "new@example.com" }]
          : table === importHistory
            ? [{ id: "history-invalid-fund", orgId: "org-1", userId: "user-1" }]
            : [];

      return {
        values: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue(inserted),
        })),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "donations",
      filename: "donations.csv",
      mapping: {
        contactEmail: "email",
        amountCents: "amount_cents",
        date: "date",
        type: "type",
        fundId: "fund_id",
      },
      rows: [
        {
          email: "new@example.com",
          amount_cents: "2500",
          date: "2026-04-01",
          type: "one_time",
          fund_id: "foreign-fund",
        },
      ],
    });

    expect(result.failedRows).toBe(1);
    expect(result.createdCounts.contacts).toBe(0);
    expect(result.createdCounts.donations).toBe(0);
    expect(insert).not.toHaveBeenCalledWith(contacts);
    expect(insert).not.toHaveBeenCalledWith(donations);
    expect(recordActivityLog).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "contact" }),
    );
  });

  it("fails donation rows when grantId is outside the org", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn().mockResolvedValue({
          id: "contact-1",
          orgId: "org-1",
          email: "jane@example.com",
        }),
      },
      donations: { findFirst: vi.fn().mockResolvedValue(undefined) },
      funds: { findFirst: vi.fn().mockResolvedValue({ id: "fund-1", orgId: "org-1" }) },
      grants: { findFirst: vi.fn().mockResolvedValue(undefined) },
      funders: { findFirst: vi.fn() },
    };

    let historyValues: Record<string, unknown> | undefined;
    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === importHistory
          ? [{ id: "history-ref", orgId: "org-1", userId: "user-1", status: "failed" }]
          : [];

      return {
        values: vi.fn((v: Record<string, unknown>) => {
          if (table === importHistory) historyValues = v;
          return { returning: vi.fn().mockResolvedValue(inserted) };
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "donations",
      filename: "donations.csv",
      mapping: {
        contactEmail: "email",
        amountCents: "amount_cents",
        date: "date",
        type: "type",
        fundId: "fund_id",
        grantId: "grant_id",
      },
      rows: [
        {
          email: "jane@example.com",
          amount_cents: "2500",
          date: "2026-04-01",
          type: "one_time",
          fund_id: "fund-1",
          grant_id: "foreign-grant",
        },
      ],
    });

    expect(result.failedRows).toBe(1);
    expect(insert).not.toHaveBeenCalledWith(donations);
    expect(historyValues?.summary).toMatchObject({
      errorDetails: [{ field: "grantId", code: "invalid_grant" }],
    });
  });

  it("imports same contact/date/amount/type donations when fundId or grantId differs", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn().mockResolvedValue({
          id: "contact-1",
          orgId: "org-1",
          email: "jane@example.com",
        }),
      },
      donations: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
      funds: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ id: "fund-1", orgId: "org-1" })
          .mockResolvedValueOnce({ id: "fund-2", orgId: "org-1" }),
      },
      grants: {
        findFirst: vi.fn().mockResolvedValue({ id: "grant-1", orgId: "org-1" }),
      },
      grantFundAllocations: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ id: "allocation-1" })
          .mockResolvedValueOnce({ id: "allocation-2" }),
      },
      funders: { findFirst: vi.fn() },
    };

    const donationPayloads: Array<Record<string, unknown>> = [];
    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === donations
          ? [{ id: `donation-${donationPayloads.length + 1}`, orgId: "org-1" }]
          : table === importHistory
            ? [{ id: "history-splits", orgId: "org-1", userId: "user-1", status: "completed" }]
            : [];

      return {
        values: vi.fn((v: Record<string, unknown>) => {
          if (table === donations) donationPayloads.push(v);
          return { returning: vi.fn().mockResolvedValue(inserted) };
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "donations",
      filename: "donations.csv",
      mapping: {
        contactEmail: "email",
        amountCents: "amount_cents",
        date: "date",
        type: "type",
        restriction: "restriction",
        fundId: "fund_id",
        grantId: "grant_id",
      },
      rows: [
        {
          email: "jane@example.com",
          amount_cents: "2500",
          date: "2026-04-01",
          type: "one_time",
          restriction: "restricted",
          fund_id: "fund-1",
          grant_id: "grant-1",
        },
        {
          email: "jane@example.com",
          amount_cents: "2500",
          date: "2026-04-01",
          type: "one_time",
          restriction: "restricted",
          fund_id: "fund-2",
          grant_id: "grant-1",
        },
      ],
    });

    expect(result.insertedRows).toBe(2);
    expect(result.duplicateRows).toBe(0);
    expect(donationPayloads).toEqual([
      expect.objectContaining({ fundId: "fund-1", grantId: "grant-1" }),
      expect.objectContaining({ fundId: "fund-2", grantId: "grant-1" }),
    ]);
  });

  it("imports donation rows when an existing donation differs by fundId or grantId", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn().mockResolvedValue({
          id: "contact-1",
          orgId: "org-1",
          email: "jane@example.com",
        }),
      },
      donations: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
      funds: {
        findFirst: vi.fn().mockResolvedValue({ id: "fund-2", orgId: "org-1" }),
      },
      grants: {
        findFirst: vi.fn().mockResolvedValue({ id: "grant-1", orgId: "org-1" }),
      },
      grantFundAllocations: {
        findFirst: vi.fn().mockResolvedValue({ id: "allocation-2" }),
      },
      funders: { findFirst: vi.fn() },
    };

    let donationValues: Record<string, unknown> | undefined;
    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === donations
          ? [{ id: "donation-new-fund", orgId: "org-1" }]
          : table === importHistory
            ? [{ id: "history-new-fund", orgId: "org-1", userId: "user-1", status: "completed" }]
            : [];

      return {
        values: vi.fn((v: Record<string, unknown>) => {
          if (table === donations) donationValues = v;
          return { returning: vi.fn().mockResolvedValue(inserted) };
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "donations",
      filename: "donations.csv",
      mapping: {
        contactEmail: "email",
        amountCents: "amount_cents",
        date: "date",
        type: "type",
        restriction: "restriction",
        fundId: "fund_id",
        grantId: "grant_id",
      },
      rows: [
        {
          email: "jane@example.com",
          amount_cents: "2500",
          date: "2026-04-01",
          type: "one_time",
          restriction: "restricted",
          fund_id: "fund-2",
          grant_id: "grant-1",
        },
      ],
    });

    expect(result.insertedRows).toBe(1);
    expect(result.duplicateRows).toBe(0);
    expect(query.donations.findFirst).toHaveBeenCalledOnce();
    const renderedWhere = renderSql(query.donations.findFirst.mock.calls[0]?.[0].where);
    expect(renderedWhere.sql).toContain('"donations"."currency" = $');
    expect(renderedWhere.sql).toContain('"donations"."restriction" = $');
    expect(renderedWhere.sql).toContain('"donations"."fund_id" = $');
    expect(renderedWhere.sql).toContain('"donations"."grant_id" = $');
    expect(renderedWhere.params).toEqual(
      expect.arrayContaining(["USD", "restricted", "fund-2", "grant-1"]),
    );
    expect(donationValues).toMatchObject({
      fundId: "fund-2",
      grantId: "grant-1",
    });
  });

  it("fails donation import rows when fundId is not allocated to grantId", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn().mockResolvedValue({
          id: "contact-1",
          orgId: "org-1",
          email: "jane@example.com",
        }),
      },
      donations: { findFirst: vi.fn().mockResolvedValue(undefined) },
      funds: { findFirst: vi.fn().mockResolvedValue({ id: "fund-1", orgId: "org-1" }) },
      grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1", orgId: "org-1" }) },
      grantFundAllocations: { findFirst: vi.fn().mockResolvedValue(undefined) },
      funders: { findFirst: vi.fn() },
    };

    let historyValues: Record<string, unknown> | undefined;
    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === importHistory
          ? [{ id: "history-invalid-allocation", orgId: "org-1", userId: "user-1" }]
          : [];

      return {
        values: vi.fn((v: Record<string, unknown>) => {
          if (table === importHistory) historyValues = v;
          return { returning: vi.fn().mockResolvedValue(inserted) };
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "donations",
      filename: "donations.csv",
      mapping: {
        contactEmail: "email",
        amountCents: "amount_cents",
        date: "date",
        type: "type",
        fundId: "fund_id",
        grantId: "grant_id",
      },
      rows: [
        {
          email: "jane@example.com",
          amount_cents: "2500",
          date: "2026-04-01",
          type: "one_time",
          fund_id: "fund-1",
          grant_id: "grant-1",
        },
      ],
    });

    expect(result.failedRows).toBe(1);
    expect(insert).not.toHaveBeenCalledWith(donations);
    expect(historyValues?.summary).toMatchObject({
      errorDetails: [{ field: "fundId", code: "fund_not_allocated_to_grant" }],
    });
  });

  it("normalizes supported import enum labels and fails invalid enum values", async () => {
    const query = {
      contacts: { findFirst: vi.fn().mockResolvedValue(undefined) },
      donations: { findFirst: vi.fn().mockResolvedValue(undefined) },
      funds: { findFirst: vi.fn() },
      grants: { findFirst: vi.fn().mockResolvedValue(undefined) },
      funders: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };

    const insertedValues: Array<Record<string, unknown>> = [];
    let historyValues: Record<string, unknown> | undefined;
    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === contacts
          ? [{ id: "contact-1", orgId: "org-1" }]
          : table === funders
            ? [{ id: "funder-1", orgId: "org-1" }]
            : table === grants
              ? [{ id: "grant-1", orgId: "org-1" }]
              : table === importHistory
                ? [{ id: "history-enum", orgId: "org-1", userId: "user-1", status: "completed" }]
                : [];

      return {
        values: vi.fn((v: Record<string, unknown>) => {
          insertedValues.push(v);
          if (table === importHistory) historyValues = v;
          return { returning: vi.fn().mockResolvedValue(inserted) };
        }),
      };
    });

    await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "contacts",
      filename: "contacts.csv",
      mapping: {
        type: "type",
        firstName: "first_name",
        pipelineStage: "stage",
      },
      rows: [{ type: "Individual", first_name: "Jane", stage: "Major Donor" }],
    });
    expect(insertedValues).toContainEqual(expect.objectContaining({ pipelineStage: "donor" }));

    const invalidResult = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "grants",
      filename: "grants.csv",
      mapping: {
        name: "name",
        funderName: "funder",
        status: "status",
        funderType: "funder_type",
      },
      rows: [{ name: "Summer", funder: "Acme", status: "Definitely Won", funder_type: "Alien" }],
    });

    expect(invalidResult.failedRows).toBe(1);
    expect(historyValues?.summary).toMatchObject({
      errorDetails: [{ field: "funderType", code: "invalid_enum" }],
    });

    const invalidContactResult = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "contacts",
      filename: "contacts.csv",
      mapping: {
        type: "type",
        firstName: "first_name",
        pipelineStage: "stage",
      },
      rows: [{ type: "individual", first_name: "Jane", stage: "Not A Stage" }],
    });

    expect(invalidContactResult.failedRows).toBe(1);
    expect(historyValues?.summary).toMatchObject({
      errorDetails: [{ field: "pipelineStage", code: "invalid_enum" }],
    });

    const invalidContactTypeResult = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "contacts",
      filename: "contacts.csv",
      mapping: {
        type: "type",
        firstName: "first_name",
      },
      rows: [{ type: "partner", first_name: "Jane" }],
    });

    expect(invalidContactTypeResult.failedRows).toBe(1);
    expect(historyValues?.summary).toMatchObject({
      errorDetails: [{ field: "type", code: "invalid_enum" }],
    });
  });

  it("does not create grant funders when the row later fails amount validation", async () => {
    const query = {
      contacts: { findFirst: vi.fn() },
      donations: { findFirst: vi.fn() },
      grants: { findFirst: vi.fn().mockResolvedValue(undefined) },
      funders: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };

    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === funders
          ? [{ id: "funder-side-effect", orgId: "org-1", name: "New Funder" }]
          : table === importHistory
            ? [{ id: "history-invalid-amount", orgId: "org-1", userId: "user-1" }]
            : [];

      return {
        values: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue(inserted),
        })),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "grants",
      filename: "grants.csv",
      mapping: {
        name: "name",
        funderName: "funder_name",
        amountCents: "amount",
      },
      rows: [{ name: "Summer Program", funder_name: "New Funder", amount: "12,34" }],
    });

    expect(result.failedRows).toBe(1);
    expect(result.createdCounts.funders).toBe(0);
    expect(result.createdCounts.grants).toBe(0);
    expect(insert).not.toHaveBeenCalledWith(funders);
    expect(insert).not.toHaveBeenCalledWith(grants);
    expect(recordActivityLog).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "funder" }),
    );
  });

  it("accepts comma-formatted explicit donation cents columns as cents", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn().mockResolvedValue({
          id: "contact-1",
          orgId: "org-1",
          email: "jane@example.com",
        }),
      },
      donations: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
      grants: {
        findFirst: vi.fn(),
      },
      funders: {
        findFirst: vi.fn(),
      },
    };

    let donationValues: Record<string, unknown> | undefined;
    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === donations
          ? [{ id: "donation-cents-comma", orgId: "org-1", amountCents: 2500 }]
          : table === importHistory
            ? [
                {
                  id: "history-cents-comma",
                  orgId: "org-1",
                  userId: "user-1",
                  status: "completed",
                },
              ]
            : [];

      return {
        values: vi.fn((v: Record<string, unknown>) => {
          if (table === donations) {
            donationValues = v;
          }
          return {
            returning: vi.fn().mockResolvedValue(inserted),
          };
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "donations",
      filename: "donations.csv",
      mapping: {
        contactEmail: "email",
        amountCents: "amount_cents",
        date: "date",
        type: "type",
      },
      rows: [
        {
          email: "jane@example.com",
          amount_cents: "2,500",
          date: "2026-04-01",
          type: "one_time",
        },
      ],
    });

    expect(result.insertedRows).toBe(1);
    expect(result.failedRows).toBe(0);
    expect(donationValues).toMatchObject({ amountCents: 2500 });
  });

  it("rejects malformed comma grouping in donation amount fields", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn().mockResolvedValue({
          id: "contact-bad-commas",
          orgId: "org-1",
          email: "jane@example.com",
        }),
      },
      donations: {
        findFirst: vi.fn(),
      },
      grants: {
        findFirst: vi.fn(),
      },
      funders: {
        findFirst: vi.fn(),
      },
    };

    let historyValues: Record<string, unknown> | undefined;
    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === donations
          ? [{ id: "donation-bad-commas", orgId: "org-1", amountCents: 1234 }]
          : table === importHistory
            ? [
                {
                  id: "history-bad-commas",
                  orgId: "org-1",
                  userId: "user-1",
                  status: "failed",
                },
              ]
            : [];

      return {
        values: vi.fn((v: Record<string, unknown>) => {
          if (table === importHistory) {
            historyValues = v;
          }
          return {
            returning: vi.fn().mockResolvedValue(inserted),
          };
        }),
      };
    });

    const dollarResult = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "donations",
      filename: "donations.csv",
      mapping: {
        contactEmail: "email",
        amountCents: "amount",
        date: "date",
        type: "type",
      },
      rows: [
        {
          email: "jane@example.com",
          amount: "12,34",
          date: "2026-04-01",
          type: "one_time",
        },
      ],
    });

    expect(dollarResult.failedRows).toBe(1);
    expect(historyValues?.summary).toMatchObject({
      errorDetails: [
        {
          field: "amount",
          code: "invalid_amount",
        },
      ],
    });

    const centsResult = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "donations",
      filename: "donations.csv",
      mapping: {
        contactEmail: "email",
        amountCents: "amount_cents",
        date: "date",
        type: "type",
      },
      rows: [
        {
          email: "jane@example.com",
          amount_cents: "2,5,0,0",
          date: "2026-04-01",
          type: "one_time",
        },
      ],
    });

    expect(centsResult.failedRows).toBe(1);
    expect(historyValues?.summary).toMatchObject({
      errorDetails: [
        {
          field: "amount",
          code: "invalid_amount_cents",
        },
      ],
    });
  });

  it("propagates contact creation infrastructure errors during donation imports", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
      donations: {
        findFirst: vi.fn(),
      },
      grants: {
        findFirst: vi.fn(),
      },
      funders: {
        findFirst: vi.fn(),
      },
    };

    const insert = vi.fn((table: unknown) => {
      if (table === contacts) {
        return {
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockRejectedValue(new Error("database unavailable")),
          }),
        };
      }

      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      };
    });

    await expect(
      commitImport(withTx({ query, insert }) as never, {
        orgId: "org-1",
        userId: "user-1",
        entityType: "donations",
        filename: "donations.csv",
        mapping: {
          contactEmail: "email",
          amountCents: "amount",
          date: "date",
          type: "type",
        },
        rows: [
          {
            email: "jane@example.com",
            amount: "25.00",
            date: "2026-04-01",
            type: "one_time",
          },
        ],
      }),
    ).rejects.toThrow("database unavailable");
  });

  it("records specific donation validation errors for amount, date, type, and restriction fields", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn(),
      },
      donations: {
        findFirst: vi.fn(),
      },
      grants: {
        findFirst: vi.fn(),
      },
      funders: {
        findFirst: vi.fn(),
      },
    };

    let historyValues: Record<string, unknown> | undefined;
    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === importHistory
          ? [{ id: "history-donation-errors", orgId: "org-1", userId: "user-1", status: "failed" }]
          : [];

      return {
        values: vi.fn((v: Record<string, unknown>) => {
          if (table === importHistory) {
            historyValues = v;
          }
          return {
            returning: vi.fn().mockResolvedValue(inserted),
          };
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "donations",
      filename: "donations.csv",
      mapping: {
        contactEmail: "email",
        amountCents: "amount",
        date: "date",
        type: "type",
        restriction: "restriction",
      },
      rows: [
        {
          email: "jane@example.com",
          amount: "12.999",
          date: "2026-04-01",
          type: "one_time",
        },
        {
          email: "jane@example.com",
          amount: "90071992547409.92",
          date: "2026-04-01",
          type: "one_time",
        },
        {
          email: "jane@example.com",
          amount: "25.00",
          date: "not-a-date",
          type: "one_time",
        },
        {
          email: "jane@example.com",
          amount: "25.00",
          date: "2026-04-01",
          type: "not-a-type",
        },
        {
          email: "jane@example.com",
          amount: "25.00",
          date: "2026-04-01",
          type: "",
        },
        {
          email: "jane@example.com",
          amount: "25.00",
          date: "2026-04-01",
          type: "one_time",
          restriction: "invalid",
        },
      ],
    });

    expect(result.failedRows).toBe(6);
    const summary = historyValues?.summary as {
      errorDetails: Array<{
        rowIndex: number;
        rowNumber: number;
        field: string;
        code: string;
        message: string;
      }>;
    };
    expect(summary.errorDetails).toEqual([
      {
        rowIndex: 0,
        rowNumber: 2,
        field: "amount",
        code: "invalid_amount",
        message: "Use a positive dollar amount with up to 2 decimals, such as 25.00.",
      },
      {
        rowIndex: 1,
        rowNumber: 3,
        field: "amount",
        code: "invalid_amount",
        message: "Use a positive dollar amount with up to 2 decimals, such as 25.00.",
      },
      {
        rowIndex: 2,
        rowNumber: 4,
        field: "date",
        code: "missing_or_invalid_date",
        message: "Add a valid donation date for this row.",
      },
      {
        rowIndex: 3,
        rowNumber: 5,
        field: "type",
        code: "invalid_enum",
        message: "Use one of: one_time, recurring, pledge.",
      },
      {
        rowIndex: 4,
        rowNumber: 6,
        field: "type",
        code: "missing_type",
        message: "Add a donation type for this row.",
      },
      {
        rowIndex: 5,
        rowNumber: 7,
        field: "restriction",
        code: "invalid_enum",
        message: "Use one of: unrestricted, restricted.",
      },
    ]);
  });

  it("propagates contact insert infrastructure errors", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn(),
      },
      donations: {
        findFirst: vi.fn(),
      },
      grants: {
        findFirst: vi.fn(),
      },
      funders: {
        findFirst: vi.fn(),
      },
    };

    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === contacts
          ? []
          : table === importHistory
            ? [{ id: "history-17", orgId: "org-1", userId: "user-1", status: "failed" }]
            : [];

      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      };
    });

    await expect(
      commitImport(withTx({ query, insert }) as never, {
        orgId: "org-1",
        userId: "user-1",
        entityType: "contacts",
        filename: "contacts.csv",
        mapping: {
          email: "email",
          firstName: "first_name",
          lastName: "last_name",
          type: "type",
          isVolunteer: "is_volunteer",
          notes: "notes",
        },
        rows: [
          {
            email: "jane@example.com",
            first_name: "",
            last_name: "Doe",
            type: "individual",
            is_volunteer: true,
            notes: { foo: "bar" },
          },
        ],
      }),
    ).rejects.toThrow("Failed to create contact");
  });

  it("fails donation rows that are missing contact lookup details", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn(),
      },
      donations: {
        findFirst: vi.fn(),
      },
      grants: {
        findFirst: vi.fn(),
      },
      funders: {
        findFirst: vi.fn(),
      },
    };

    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === importHistory
          ? [{ id: "history-12", orgId: "org-1", userId: "user-1", status: "failed" }]
          : [];

      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "donations",
      filename: "donations.csv",
      mapping: {
        amountCents: "amount_cents",
        date: "date",
        type: "type",
      },
      rows: [
        {
          amount_cents: 5000,
          date: "2026-04-01T00:00:00.000Z",
          type: "one_time",
        },
      ],
    });

    expect(result.insertedRows).toBe(0);
    expect(result.failedRows).toBe(1);
    expect(result.insertedRows).toBe(0);
  });

  it("rejects fractional donation amount_cents values instead of truncating them", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn().mockResolvedValue({
          id: "contact-1",
          orgId: "org-1",
          email: "jane@example.com",
        }),
      },
      donations: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
      grants: {
        findFirst: vi.fn(),
      },
      funders: {
        findFirst: vi.fn(),
      },
    };

    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === importHistory
          ? [{ id: "history-16", orgId: "org-1", userId: "user-1", status: "failed" }]
          : [];

      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "donations",
      filename: "donations.csv",
      mapping: {
        contactId: "contact_id",
        amountCents: "amount_cents",
        date: "date",
        type: "type",
      },
      rows: [
        {
          contact_id: "contact-1",
          amount_cents: 12.75,
          date: "2026-04-01T00:00:00.000Z",
          type: "one_time",
        },
      ],
    });

    expect(result.insertedRows).toBe(0);
    expect(result.failedRows).toBe(1);
    expect(result.history.status).toBe("failed");
  });

  it("uses contactId lookups for donation imports and skips duplicates", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn().mockResolvedValue({
          id: "contact-1",
          orgId: "org-1",
          email: "jane@example.com",
        }),
      },
      donations: {
        findFirst: vi.fn().mockResolvedValue({
          id: "donation-1",
          orgId: "org-1",
        }),
      },
      grants: {
        findFirst: vi.fn(),
      },
      funders: {
        findFirst: vi.fn(),
      },
    };

    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === importHistory
          ? [
              {
                id: "history-4",
                orgId: "org-1",
                userId: "user-1",
                status: "completed_with_duplicates",
              },
            ]
          : [];

      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "donations",
      filename: "donations.csv",
      mapping: {
        contactId: "contact_id",
        amountCents: "amount_cents",
        date: "date",
        type: "type",
      },
      rows: [
        {
          contact_id: "contact-1",
          amount_cents: 5000,
          date: "2026-04-01T00:00:00.000Z",
          type: "one_time",
        },
      ],
    });

    expect(result.insertedRows).toBe(0);
    expect(result.duplicateRows).toBe(1);
    expect(result.history.status).toBe("completed_with_duplicates");
  });

  it("imports organization-contact donations and flags duplicate donation rows", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn().mockResolvedValue({
          id: "contact-1",
          orgId: "org-1",
          organizationName: "Acme Foundation",
        }),
      },
      donations: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
      grants: {
        findFirst: vi.fn(),
      },
      funders: {
        findFirst: vi.fn(),
      },
    };

    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === donations
          ? [{ id: "donation-2", orgId: "org-1", amountCents: 5000 }]
          : table === importHistory
            ? [
                {
                  id: "history-18",
                  orgId: "org-1",
                  userId: "user-1",
                  status: "completed_with_duplicates",
                },
              ]
            : [];

      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "donations",
      filename: "donations.csv",
      mapping: {
        contactOrganizationName: "organization_name",
        amountCents: "amount_cents",
        date: "date",
        type: "type",
        receiptSent: "receipt_sent",
        notes: "notes",
      },
      rows: [
        {
          organization_name: "Acme Foundation",
          amount_cents: 5000,
          date: "2026-04-01T00:00:00.000Z",
          type: "one_time",
          receipt_sent: true,
          notes: { foo: "bar" },
        },
        {
          organization_name: "Acme Foundation",
          amount_cents: 5000,
          date: "2026-04-01T00:00:00.000Z",
          type: "one_time",
          receipt_sent: true,
          notes: { foo: "bar" },
        },
      ],
    });

    expect(result.insertedRows).toBe(1);
    expect(result.duplicateRows).toBe(1);
    expect(result.history.status).toBe("completed_with_duplicates");
  });

  it("marks a donation row as failed when the donation insert does not return a row", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn().mockResolvedValue({
          id: "contact-1",
          orgId: "org-1",
          email: "jane@example.com",
        }),
      },
      donations: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
      grants: {
        findFirst: vi.fn(),
      },
      funders: {
        findFirst: vi.fn(),
      },
    };

    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === donations
          ? []
          : table === importHistory
            ? [{ id: "history-15", orgId: "org-1", userId: "user-1", status: "failed" }]
            : [];

      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "donations",
      filename: "donations.csv",
      mapping: {
        contactId: "contact_id",
        amountCents: "amount_cents",
        date: "date",
        type: "type",
      },
      rows: [
        {
          contact_id: "contact-1",
          amount_cents: 5000,
          date: "2026-04-01T00:00:00.000Z",
          type: "one_time",
        },
      ],
    });

    expect(result.insertedRows).toBe(0);
    expect(result.failedRows).toBe(1);
    expect(result.history.status).toBe("failed");
  });

  it("uses existing funders by name when importing grants", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn(),
      },
      donations: {
        findFirst: vi.fn(),
      },
      grants: {
        findFirst: vi.fn().mockResolvedValue({
          id: "grant-1",
          orgId: "org-1",
          name: "General Operating",
        }),
      },
      funders: {
        findFirst: vi.fn().mockResolvedValue({
          id: "funder-1",
          orgId: "org-1",
          name: "Open Society",
        }),
      },
    };

    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === importHistory
          ? [
              {
                id: "history-5",
                orgId: "org-1",
                userId: "user-1",
                status: "completed_with_duplicates",
              },
            ]
          : [];

      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "grants",
      filename: "grants.csv",
      mapping: {
        name: "grant_name",
        funderName: "funder_name",
      },
      rows: [
        {
          grant_name: "General Operating",
          funder_name: "Open Society",
        },
      ],
    });

    expect(result.insertedRows).toBe(0);
    expect(result.duplicateRows).toBe(1);
    expect(result.history.status).toBe("completed_with_duplicates");
  });

  it("normalizes grant data while importing and keeps weird scalar inputs from failing the row", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn(),
      },
      donations: {
        findFirst: vi.fn(),
      },
      grants: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
      funders: {
        findFirst: vi.fn().mockResolvedValue({
          id: "funder-5",
          orgId: "org-1",
          name: "Open Society",
        }),
      },
    };

    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === grants
          ? [{ id: "grant-5", orgId: "org-1", name: "Grant with edge cases" }]
          : table === importHistory
            ? [{ id: "history-19", orgId: "org-1", userId: "user-1", status: "completed" }]
            : [];

      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "grants",
      filename: "grants.csv",
      mapping: {
        name: "grant_name",
        funderName: "funder_name",
        amountCents: "amount",
        startDate: "start_date",
        endDate: "end_date",
        applicationDeadline: "deadline",
        status: "status",
        description: "description",
        notes: "notes",
      },
      rows: [
        {
          grant_name: "Grant with edge cases",
          funder_name: "Open Society",
          amount: 12.7,
          start_date: "not-a-date",
          end_date: "",
          deadline: "2026-10-01T00:00:00Z",
          status: "",
          description: { html: "<p>ignore</p>" },
          notes: "   ",
        },
        {
          grant_name: "Grant with dates",
          funder_name: "Open Society",
          amount: "25.00",
          start_date: "2026-01-01",
          end_date: "2026-12-31",
          deadline: "2025-11-15",
          status: "awarded",
          description: "Grant period test",
          notes: "Dates should be logged",
        },
      ],
    });

    expect(result.insertedRows).toBe(2);
    expect(result.failedRows).toBe(0);
    expect(result.history.status).toBe("completed");
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: "grant",
        changes: expect.objectContaining({
          amountCents: 2500,
          startDate: expect.stringContaining("2026-01-01"),
          endDate: expect.stringContaining("2026-12-31"),
          applicationDeadline: expect.stringContaining("2025-11-15"),
        }),
      }),
    );
  });

  it("imports grants with blank optional amount values", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn(),
      },
      donations: {
        findFirst: vi.fn(),
      },
      grants: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
      funders: {
        findFirst: vi.fn().mockResolvedValue({
          id: "funder-blank-amount",
          orgId: "org-1",
          name: "Open Society",
        }),
      },
    };

    let grantValues: Record<string, unknown> | undefined;
    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === grants
          ? [{ id: "grant-blank-amount", orgId: "org-1", name: "Capacity Building" }]
          : table === importHistory
            ? [{ id: "history-blank-amount", orgId: "org-1", userId: "user-1" }]
            : [];

      return {
        values: vi.fn((v: Record<string, unknown>) => {
          if (table === grants) {
            grantValues = v;
          }
          return {
            returning: vi.fn().mockResolvedValue(inserted),
          };
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "grants",
      filename: "grants.csv",
      mapping: {
        name: "grant_name",
        funderName: "funder_name",
        amountCents: "amount",
      },
      rows: [
        {
          grant_name: "Capacity Building",
          funder_name: "Open Society",
          amount: "",
        },
      ],
    });

    expect(result.insertedRows).toBe(1);
    expect(result.failedRows).toBe(0);
    expect(grantValues).toMatchObject({
      amountCents: undefined,
    });
  });

  it("propagates funder lookup infrastructure errors during grant imports", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn(),
      },
      donations: {
        findFirst: vi.fn(),
      },
      grants: {
        findFirst: vi.fn(),
      },
      funders: {
        findFirst: vi.fn().mockRejectedValue(new Error("lookup failed")),
      },
    };

    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === importHistory
          ? [{ id: "history-16", orgId: "org-1", userId: "user-1", status: "failed" }]
          : [];

      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      };
    });

    await expect(
      commitImport(withTx({ query, insert }) as never, {
        orgId: "org-1",
        userId: "user-1",
        entityType: "grants",
        filename: "grants.csv",
        mapping: {
          name: "grant_name",
          funderName: "funder_name",
        },
        rows: [
          {
            grant_name: "Capital Campaign",
            funder_name: "Unlisted Funder",
          },
        ],
      }),
    ).rejects.toThrow("lookup failed");
  });

  it("uses funderId lookups for grants and parses string amounts", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn(),
      },
      donations: {
        findFirst: vi.fn(),
      },
      grants: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
      funders: {
        findFirst: vi.fn().mockResolvedValue({
          id: "funder-2",
          orgId: "org-1",
          name: "United Way",
        }),
      },
    };

    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === grants
          ? [{ id: "grant-2", orgId: "org-1", name: "Emergency Fund" }]
          : table === importHistory
            ? [{ id: "history-6", orgId: "org-1", userId: "user-1", status: "completed" }]
            : [];

      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "grants",
      filename: "grants.csv",
      mapping: {
        funderId: "funder_id",
        name: "grant_name",
        amountCents: "amount_cents",
      },
      rows: [
        {
          funder_id: "funder-2",
          grant_name: "Emergency Fund",
          amount_cents: "45000",
        },
      ],
    });

    expect(result.insertedRows).toBe(1);
    expect(result.createdCounts.funders).toBe(0);
    expect(result.createdCounts.grants).toBe(1);
    expect(result.history.status).toBe("completed");
  });

  it("rejects zero and negative grant amount_cents values", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn(),
      },
      donations: {
        findFirst: vi.fn(),
      },
      grants: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
      funders: {
        findFirst: vi.fn().mockResolvedValue({
          id: "funder-6",
          orgId: "org-1",
          name: "Emergency Fund",
        }),
      },
    };

    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === importHistory
          ? [{ id: "history-19", orgId: "org-1", userId: "user-1", status: "failed" }]
          : [];

      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "grants",
      filename: "grants.csv",
      mapping: {
        funderName: "funder_name",
        name: "grant_name",
        amountCents: "amount_cents",
      },
      rows: [
        {
          funder_name: "Emergency Fund",
          grant_name: "No Budget Grant",
          amount_cents: 0,
        },
        {
          funder_name: "Emergency Fund",
          grant_name: "Negative Grant",
          amount_cents: -100,
        },
      ],
    });

    expect(result.insertedRows).toBe(0);
    expect(result.failedRows).toBe(2);
    expect(result.history.status).toBe("failed");
  });

  it("marks a grant row as failed when the insert does not return a row", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn(),
      },
      donations: {
        findFirst: vi.fn(),
      },
      grants: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
      funders: {
        findFirst: vi.fn().mockResolvedValue({
          id: "funder-3",
          orgId: "org-1",
          name: "Small Foundation",
        }),
      },
    };

    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === grants
          ? []
          : table === importHistory
            ? [{ id: "history-8", orgId: "org-1", userId: "user-1", status: "failed" }]
            : [];

      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "grants",
      filename: "grants.csv",
      mapping: {
        funderName: "funder_name",
        name: "grant_name",
      },
      rows: [
        {
          funder_name: "Small Foundation",
          grant_name: "Capacity Building",
        },
      ],
    });

    expect(result.insertedRows).toBe(0);
    expect(result.failedRows).toBe(1);
    expect(result.history.status).toBe("failed");
  });

  it("propagates unexpected database errors so the transaction can roll back", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn().mockRejectedValue(new Error("lookup failed")),
      },
      donations: {
        findFirst: vi.fn(),
      },
      grants: {
        findFirst: vi.fn(),
      },
      funders: {
        findFirst: vi.fn(),
      },
    };

    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === importHistory
          ? [{ id: "history-9", orgId: "org-1", userId: "user-1", status: "failed" }]
          : [];

      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      };
    });

    await expect(
      commitImport(withTx({ query, insert }) as never, {
        orgId: "org-1",
        userId: "user-1",
        entityType: "contacts",
        filename: "contacts.csv",
        mapping: {
          email: "email",
          type: "type",
        },
        rows: [
          {
            email: "jane@example.com",
            type: "individual",
          },
        ],
      }),
    ).rejects.toThrow("lookup failed");
  });

  it("fails grant rows that do not include a funder reference", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn(),
      },
      donations: {
        findFirst: vi.fn(),
      },
      grants: {
        findFirst: vi.fn(),
      },
      funders: {
        findFirst: vi.fn(),
      },
    };

    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === importHistory
          ? [{ id: "history-10", orgId: "org-1", userId: "user-1", status: "failed" }]
          : [];

      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "grants",
      filename: "grants.csv",
      mapping: {
        name: "grant_name",
      },
      rows: [
        {
          grant_name: "Capital Campaign",
        },
      ],
    });

    expect(result.insertedRows).toBe(0);
    expect(result.failedRows).toBe(1);
    expect(result.history.status).toBe("failed");
  });

  it("fails grant rows that do not include a name", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn(),
      },
      donations: {
        findFirst: vi.fn(),
      },
      grants: {
        findFirst: vi.fn(),
      },
      funders: {
        findFirst: vi.fn(),
      },
    };

    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === importHistory
          ? [{ id: "history-13", orgId: "org-1", userId: "user-1", status: "failed" }]
          : [];

      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "grants",
      filename: "grants.csv",
      mapping: {
        funderName: "funder_name",
      },
      rows: [
        {
          funder_name: "Small Foundation",
        },
      ],
    });

    expect(result.insertedRows).toBe(0);
    expect(result.failedRows).toBe(1);
    expect(result.history.status).toBe("failed");
  });

  it("fails grant rows when the funder cannot be created", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn(),
      },
      donations: {
        findFirst: vi.fn(),
      },
      grants: {
        findFirst: vi.fn(),
      },
      funders: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
    };

    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === funders
          ? []
          : table === importHistory
            ? [{ id: "history-14", orgId: "org-1", userId: "user-1", status: "failed" }]
            : [];

      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "grants",
      filename: "grants.csv",
      mapping: {
        name: "grant_name",
        funderName: "funder_name",
      },
      rows: [
        {
          grant_name: "Capital Campaign",
          funder_name: "Unlisted Funder",
        },
      ],
    });

    expect(result.insertedRows).toBe(0);
    expect(result.failedRows).toBe(1);
    expect(result.history.status).toBe("failed");
  });

  it("marks repeated grant rows in the same import as duplicates", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn(),
      },
      donations: {
        findFirst: vi.fn(),
      },
      grants: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
      funders: {
        findFirst: vi.fn().mockResolvedValue({
          id: "funder-4",
          orgId: "org-1",
          name: "United Way",
        }),
      },
    };

    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === grants
          ? [{ id: "grant-4", orgId: "org-1", name: "Neighborhood Fund" }]
          : table === importHistory
            ? [
                {
                  id: "history-11",
                  orgId: "org-1",
                  userId: "user-1",
                  status: "completed_with_duplicates",
                },
              ]
            : [];

      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "grants",
      filename: "grants.csv",
      mapping: {
        funderName: "funder_name",
        name: "grant_name",
      },
      rows: [
        {
          funder_name: "United Way",
          grant_name: "Neighborhood Fund",
        },
        {
          funder_name: "United Way",
          grant_name: "Neighborhood Fund",
        },
      ],
    });

    expect(result.insertedRows).toBe(1);
    expect(result.duplicateRows).toBe(1);
    expect(result.history.status).toBe("completed_with_duplicates");
  });

  it("rejects when the import history row cannot be created", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn(),
      },
      donations: {
        findFirst: vi.fn(),
      },
      grants: {
        findFirst: vi.fn(),
      },
      funders: {
        findFirst: vi.fn(),
      },
    };

    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === contacts
          ? [{ id: "contact-9", orgId: "org-1" }]
          : table === importHistory
            ? []
            : [];

      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      };
    });

    await expect(
      commitImport(withTx({ query, insert }) as never, {
        orgId: "org-1",
        userId: "user-1",
        entityType: "contacts",
        filename: "contacts.csv",
        mapping: {
          email: "email",
          type: "type",
        },
        rows: [
          {
            email: "jane@example.com",
            type: "individual",
          },
        ],
      }),
    ).rejects.toThrow("Failed to create import history");
  });

  it("reads boolean values and name-only contact matches while importing donations", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
      donations: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
      grants: {
        findFirst: vi.fn(),
      },
      funders: {
        findFirst: vi.fn(),
      },
    };

    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === contacts
          ? [{ id: "contact-3", orgId: "org-1", firstName: "Jane" }]
          : table === donations
            ? [{ id: "donation-3", orgId: "org-1" }]
            : table === importHistory
              ? [{ id: "history-7", orgId: "org-1", userId: "user-1", status: "completed" }]
              : [];

      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      };
    });

    const result = await commitImport(withTx({ query, insert }) as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "donations",
      filename: "donations.csv",
      mapping: {
        amountCents: "amount_cents",
        date: "date",
        type: "type",
        contactFirstName: "first_name",
        contactLastName: "last_name",
        contactType: "contact_type",
        contactIsVolunteer: "is_volunteer",
        receiptSent: "receipt_sent",
      },
      rows: [
        {
          amount_cents: 5000,
          date: "2026-04-01T00:00:00.000Z",
          type: "one_time",
          first_name: "Jane",
          last_name: "Doe",
          contact_type: "individual",
          is_volunteer: "false",
          receipt_sent: "true",
        },
      ],
    });

    expect(result.insertedRows).toBe(1);
    expect(result.createdCounts.contacts).toBe(1);
    expect(result.createdCounts.donations).toBe(1);
    expect(result.history.status).toBe("completed");
  });

  it("wraps the entire commit in a single transaction", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
      donations: { findFirst: vi.fn() },
      grants: { findFirst: vi.fn() },
      funders: { findFirst: vi.fn() },
    };

    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === contacts
          ? [{ id: "contact-tx", orgId: "org-1" }]
          : table === importHistory
            ? [{ id: "history-tx", orgId: "org-1", userId: "user-1", status: "completed" }]
            : [];
      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      };
    });

    const transaction = vi.fn(
      async (fn: (tx: unknown) => Promise<unknown>) => await fn({ query, insert }),
    );

    const db = { query, insert, transaction };

    await commitImport(db as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "contacts",
      filename: "contacts.csv",
      mapping: { email: "email", type: "type" },
      rows: [{ email: "jane@example.com", type: "individual" }],
    });

    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("records an import_history activity log entry inside the transaction", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
      donations: { findFirst: vi.fn() },
      grants: { findFirst: vi.fn() },
      funders: { findFirst: vi.fn() },
    };

    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === contacts
          ? [{ id: "contact-tx", orgId: "org-1" }]
          : table === importHistory
            ? [
                {
                  id: "history-tx",
                  orgId: "org-1",
                  userId: "user-1",
                  entityType: "contacts",
                  filename: "contacts.csv",
                  status: "completed",
                },
              ]
            : [];
      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(inserted),
        }),
      };
    });

    const txDb = { query, insert };
    const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => await fn(txDb));

    const db = { query, insert, transaction };

    await commitImport(db as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "contacts",
      filename: "contacts.csv",
      mapping: { email: "email", type: "type" },
      rows: [{ email: "jane@example.com", type: "individual" }],
    });

    expect(recordActivityLog).toHaveBeenCalledWith(
      txDb,
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        action: "created",
        entityType: "import_history",
        entityId: "history-tx",
        changes: expect.objectContaining({
          entityType: "contacts",
          filename: "contacts.csv",
          insertedRows: 1,
          duplicateRows: 0,
          failedRows: 0,
        }),
      }),
    );
  });

  it("propagates processor errors instead of storing them as row failures", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn().mockRejectedValue(new Error("lookup boom")),
      },
      donations: { findFirst: vi.fn() },
      grants: { findFirst: vi.fn() },
      funders: { findFirst: vi.fn() },
    };

    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === importHistory
          ? [{ id: "history-err-1", orgId: "org-1", userId: "user-1", status: "failed" }]
          : [];
      return {
        values: vi.fn(() => {
          return {
            returning: vi.fn().mockResolvedValue(inserted),
          };
        }),
      };
    });

    await expect(
      commitImport(withTx({ query, insert }) as never, {
        orgId: "org-1",
        userId: "user-1",
        entityType: "contacts",
        filename: "contacts.csv",
        mapping: { email: "email", type: "type" },
        rows: [
          { email: "jane@example.com", type: "individual" },
          { email: "bob@example.com", type: "individual" },
        ],
      }),
    ).rejects.toThrow("lookup boom");
  });

  it("propagates non-Error processor rejections", async () => {
    const query = {
      contacts: {
        findFirst: vi.fn().mockRejectedValue("nope"),
      },
      donations: { findFirst: vi.fn() },
      grants: { findFirst: vi.fn() },
      funders: { findFirst: vi.fn() },
    };

    const insert = vi.fn((table: unknown) => {
      const inserted =
        table === importHistory
          ? [{ id: "history-err-2", orgId: "org-1", userId: "user-1", status: "failed" }]
          : [];
      return {
        values: vi.fn(() => {
          return {
            returning: vi.fn().mockResolvedValue(inserted),
          };
        }),
      };
    });

    await expect(
      commitImport(withTx({ query, insert }) as never, {
        orgId: "org-1",
        userId: "user-1",
        entityType: "contacts",
        filename: "contacts.csv",
        mapping: { email: "email", type: "type" },
        rows: [{ email: "jane@example.com", type: "individual" }],
      }),
    ).rejects.toBe("nope");
  });

  it("propagates errors from the transaction wrapper so the DB can roll back", async () => {
    const query = {
      contacts: { findFirst: vi.fn() },
      donations: { findFirst: vi.fn() },
      grants: { findFirst: vi.fn() },
      funders: { findFirst: vi.fn() },
    };

    const insert = vi.fn();
    const transaction = vi.fn(async () => {
      throw new Error("connection lost");
    });

    await expect(
      commitImport({ query, insert, transaction } as never, {
        orgId: "org-1",
        userId: "user-1",
        entityType: "contacts",
        filename: "contacts.csv",
        mapping: { email: "email", type: "type" },
        rows: [{ email: "jane@example.com", type: "individual" }],
      }),
    ).rejects.toThrow("connection lost");
  });

  it("rejects grant imports that would exceed the active grant cap", async () => {
    const select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 4 }]),
      }),
    });
    const query = {
      organizations: {
        findFirst: vi.fn().mockResolvedValue({ planTier: "starter" }),
      },
      funders: { findFirst: vi.fn().mockResolvedValue({ id: "funder-1", name: "Funder A" }) },
      grants: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const insert = vi.fn((table) => ({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue(
            table === grants
              ? [{ id: "grant-1", name: "Grant A", status: "active" }]
              : [{ id: "history-1" }],
          ),
      }),
    }));
    const db = {
      query,
      select,
      insert,
      transaction: vi.fn((fn) => fn({ query, insert })),
    };

    await expect(
      commitImport(db as never, {
        orgId: "org-1",
        userId: "user-1",
        entityType: "grants",
        filename: "grants.csv",
        mapping: {
          name: "name",
          funderName: "funder",
          status: "status",
        },
        rows: [
          { name: "Grant A", funder: "Funder A", status: "active" },
          { name: "Grant B", funder: "Funder B", status: "reporting" },
        ],
      }),
    ).resolves.toMatchObject({ insertedRows: 2 });
    expect(db.transaction).toHaveBeenCalled();
  });

  it("hard-blocks grant imports above the 10 grant headroom", async () => {
    const select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 20 }]),
      }),
    });
    const query = {
      organizations: {
        findFirst: vi.fn().mockResolvedValue({ planTier: "starter" }),
      },
      funders: { findFirst: vi.fn().mockResolvedValue({ id: "funder-1", name: "Funder A" }) },
      grants: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const insert = vi.fn((table) => ({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue(
            table === grants
              ? [{ id: "grant-1", name: "Grant A", status: "active" }]
              : [{ id: "history-1" }],
          ),
      }),
    }));
    const db = withTx({ query, insert, select });

    await expect(
      commitImport(db as never, {
        orgId: "org-1",
        userId: "user-1",
        entityType: "grants",
        filename: "grants.csv",
        mapping: {
          name: "name",
          funderName: "funder",
          status: "status",
        },
        rows: [{ name: "Grant A", funder: "Funder A", status: "active" }],
      }),
    ).rejects.toThrow("includes 10 active grants plus 10 grant headroom");
  });

  it("pins Growth grant import headroom at 50 active grants plus 10 soft headroom", () => {
    expect(getActiveGrantCap("growth")).toBe(50);
    expect(getGrantCapWithSoftHeadroom(50)).toBe(60);
  });

  it("does not count submitted grant import rows against the billing grant cap", async () => {
    const select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 15 }]),
      }),
    });
    const query = {
      organizations: {
        findFirst: vi.fn().mockResolvedValue({ planTier: "starter" }),
      },
      funders: { findFirst: vi.fn().mockResolvedValue({ id: "funder-1", name: "Funder A" }) },
      grants: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const insert = vi.fn((table) => ({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue(
            table === grants
              ? [{ id: "grant-1", name: "Grant A", status: "submitted" }]
              : [{ id: "history-1" }],
          ),
      }),
    }));
    const db = withTx({ query, insert, select });

    const result = await commitImport(db as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "grants",
      filename: "grants.csv",
      mapping: {
        name: "name",
        funderName: "funder",
        status: "status",
      },
      rows: [{ name: "Grant A", funder: "Funder A", status: "submitted" }],
    });

    expect(result.insertedRows).toBe(1);
  });

  it("does not count inactive grant import rows against the active grant cap", async () => {
    const select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 5 }]),
      }),
    });
    const query = {
      organizations: {
        findFirst: vi.fn().mockResolvedValue({ planTier: "starter" }),
      },
      funders: { findFirst: vi.fn().mockResolvedValue({ id: "funder-1", name: "Funder A" }) },
      grants: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const insert = vi.fn((table) => ({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue(
            table === grants
              ? [{ id: "grant-1", name: "Grant A", status: "declined" }]
              : [{ id: "history-1" }],
          ),
      }),
    }));
    const db = withTx({ query, insert, select });

    const result = await commitImport(db as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "grants",
      filename: "grants.csv",
      mapping: {
        name: "name",
        funderName: "funder",
        status: "status",
      },
      rows: [{ name: "Grant A", funder: "Funder A", status: "declined" }],
    });

    expect(result.insertedRows).toBe(1);
  });

  it("allows grant imports that stay within the active grant cap", async () => {
    const select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 4 }]),
      }),
    });
    const query = {
      organizations: {
        findFirst: vi.fn().mockResolvedValue({ planTier: "starter" }),
      },
      funders: { findFirst: vi.fn().mockResolvedValue({ id: "funder-1", name: "Funder A" }) },
      grants: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const insert = vi.fn((table) => ({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue(
            table === grants
              ? [{ id: "grant-1", name: "Grant A", status: "active" }]
              : [{ id: "history-1" }],
          ),
      }),
    }));
    const db = withTx({ query, insert, select });

    const result = await commitImport(db as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "grants",
      filename: "grants.csv",
      mapping: {
        name: "name",
        funderName: "funder",
        status: "status",
      },
      rows: [{ name: "Grant A", funder: "Funder A", status: "active" }],
    });

    expect(result.insertedRows).toBe(1);
  });

  it("does not count duplicate active grant rows against the active grant cap", async () => {
    const select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 4 }]),
      }),
    });
    const query = {
      organizations: {
        findFirst: vi.fn().mockResolvedValue({ planTier: "starter" }),
      },
      funders: { findFirst: vi.fn().mockResolvedValue({ id: "funder-1", name: "Funder A" }) },
      grants: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ id: "existing-grant", name: "Existing Grant" })
          .mockResolvedValueOnce(undefined),
      },
    };
    const insert = vi.fn((table) => ({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue(
            table === grants
              ? [{ id: "grant-1", name: "New Grant", status: "active" }]
              : [{ id: "history-1" }],
          ),
      }),
    }));
    const db = withTx({ query, insert, select });

    const result = await commitImport(db as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "grants",
      filename: "grants.csv",
      mapping: {
        name: "name",
        funderName: "funder",
        status: "status",
      },
      rows: [
        { name: "Existing Grant", funder: "Funder A", status: "active" },
        { name: "New Grant", funder: "Funder A", status: "active" },
      ],
    });

    expect(result.insertedRows).toBe(1);
    expect(result.duplicateRows).toBe(1);
  });

  it("does not count invalid grant statuses against the active grant cap before row validation", async () => {
    const select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 5 }]),
      }),
    });
    const query = {
      organizations: {
        findFirst: vi.fn().mockResolvedValue({ planTier: "starter" }),
      },
      funders: { findFirst: vi.fn().mockResolvedValue({ id: "funder-1", name: "Funder A" }) },
      grants: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const insert = vi.fn((table) => ({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(table === importHistory ? [{ id: "history-1" }] : []),
      }),
    }));
    const db = withTx({ query, insert, select });

    const result = await commitImport(db as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "grants",
      filename: "grants.csv",
      mapping: {
        name: "name",
        funderName: "funder",
        status: "status",
      },
      rows: [{ name: "Grant A", funder: "Funder A", status: "not-a-status" }],
    });

    expect(result.failedRows).toBe(1);
    expect(result.insertedRows).toBe(0);
  });

  it("does not check active grant caps for unlimited plans", async () => {
    const select = vi.fn();
    const query = {
      organizations: {
        findFirst: vi.fn().mockResolvedValue({ planTier: "enterprise" }),
      },
      funders: { findFirst: vi.fn().mockResolvedValue({ id: "funder-1", name: "Funder A" }) },
      grants: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const insert = vi.fn((table) => ({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue(
            table === grants
              ? [{ id: "grant-1", name: "Grant A", status: "active" }]
              : [{ id: "history-1" }],
          ),
      }),
    }));
    const db = withTx({ query, insert, select });

    const result = await commitImport(db as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "grants",
      filename: "grants.csv",
      mapping: {
        name: "name",
        funderName: "funder",
        status: "status",
      },
      rows: [{ name: "Grant A", funder: "Funder A", status: "active" }],
    });

    expect(result.insertedRows).toBe(1);
    expect(select).not.toHaveBeenCalled();
  });

  it("enforces the selected Starter active grant cap for active Starter trials", async () => {
    // Trials use the selected tier. A Starter trial keeps the Starter cap, and a
    // single in-range import stays well under that cap.
    const select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 4 }]),
      }),
    });
    const query = {
      organizations: {
        findFirst: vi.fn().mockResolvedValue({
          planTier: "starter",
          subscriptionStatus: "trialing",
          trialEndsAt: new Date("2099-01-01T00:00:00.000Z"),
        }),
      },
      funders: { findFirst: vi.fn().mockResolvedValue({ id: "funder-1", name: "Funder A" }) },
      grants: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };
    const insert = vi.fn((table) => ({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue(
            table === grants
              ? [{ id: "grant-1", name: "Grant A", status: "active" }]
              : [{ id: "history-1" }],
          ),
      }),
    }));
    const db = withTx({ query, insert, select });

    const result = await commitImport(db as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "grants",
      filename: "grants.csv",
      mapping: {
        name: "name",
        funderName: "funder",
        status: "status",
      },
      rows: [{ name: "Grant A", funder: "Funder A", status: "active" }],
    });

    expect(result.insertedRows).toBe(1);
    expect(select).toHaveBeenCalled();
  });
});

describe("listImportHistory", () => {
  it("returns paginated history rows for the org", async () => {
    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue([
                  {
                    id: "history-1",
                    entityType: "contacts",
                    status: "completed",
                  },
                ]),
              }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 1 }]),
        }),
      });

    const db = { select };

    const result = await listImportHistory(db as never, {
      orgId: "org-1",
      entityType: "contacts",
      status: "completed",
      page: 2,
      pageSize: 10,
      sortBy: "createdAt",
      sortOrder: "desc",
    });

    expect(result).toEqual({
      data: [
        {
          id: "history-1",
          entityType: "contacts",
          status: "completed",
        },
      ],
      total: 1,
      page: 2,
      pageSize: 10,
    });
  });

  it("returns ascending history rows and defaults missing count results to zero", async () => {
    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

    const db = { select };

    const result = await listImportHistory(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 10,
      sortBy: "createdAt",
      sortOrder: "asc",
    });

    expect(result.total).toBe(0);
  });

  it("filters history rows by active entity when provided", async () => {
    const whereCalls: unknown[] = [];
    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn((where: unknown) => {
            whereCalls.push(where);
            return {
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  offset: vi.fn().mockResolvedValue([]),
                }),
              }),
            };
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn((where: unknown) => {
            whereCalls.push(where);
            return Promise.resolve([{ count: 0 }]);
          }),
        }),
      });

    await listImportHistory({ select } as never, {
      orgId: "org-1",
      entityId: "entity-active",
      page: 1,
      pageSize: 10,
      sortBy: "createdAt",
      sortOrder: "desc",
    });

    expect(whereCalls).toHaveLength(2);
    const renderedWhere = renderSql(whereCalls[0]);
    expect(renderedWhere.sql).toContain('"import_history"."entity_id"');
    expect(renderedWhere.params).toContain("entity-active");
  });
});

describe("getImportMigrationPlan", () => {
  it("returns source-specific plan progress and the first incomplete step", async () => {
    const select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          {
            entityType: "contacts",
            insertedRows: 14,
            failedRows: 0,
            createdAt: new Date("2026-01-02T00:00:00.000Z"),
          },
          {
            entityType: "funds",
            insertedRows: 0,
            failedRows: 3,
            createdAt: new Date("2026-01-03T00:00:00.000Z"),
          },
        ]),
      }),
    });

    const result = await getImportMigrationPlan({ select } as never, {
      orgId: "org-1",
      source: "quickbooks",
    });

    expect(result.sourceId).toBe("quickbooks");
    expect(result.nextEntityType).toBe("funds");
    expect(result.recommendedOrder[0]).toMatchObject({
      entityType: "contacts",
      status: "ready",
    });
    expect(result.progress[0]).toMatchObject({
      entityType: "contacts",
      status: "completed",
      insertedRows: 14,
      failedRows: 0,
      latestImportAt: new Date("2026-01-02T00:00:00.000Z"),
    });
    expect(result.recommendedOrder[1]).toMatchObject({
      entityType: "funds",
    });
    expect(result.progress[1]).toMatchObject({
      entityType: "funds",
      status: "has_errors",
      insertedRows: 0,
      failedRows: 3,
      latestImportAt: new Date("2026-01-03T00:00:00.000Z"),
    });
  });

  it("builds migration progress from the active entity import history only", async () => {
    const where = vi.fn().mockResolvedValue([]);
    const select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({ where }),
    });

    await getImportMigrationPlan({ select } as never, {
      orgId: "org-1",
      entityId: "entity-active",
      source: "generic",
    });

    const renderedWhere = renderSql(where.mock.calls[0]?.[0]);
    expect(renderedWhere.sql).toContain('"import_history"."entity_id"');
    expect(renderedWhere.params).toContain("entity-active");
  });

  it("falls back to the generic migration source when the source is unknown", async () => {
    const select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    const result = await getImportMigrationPlan({ select } as never, {
      orgId: "org-1",
      source: "unknown" as never,
    });

    expect(result.sourceId).toBe("generic");
    expect(result.nextEntityType).toBe("contacts");
    expect(result.progress.every((step) => step.status === "not_started")).toBe(true);
  });

  it("keeps partial-failure steps in needs-fix status instead of skipping ahead", async () => {
    const select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          {
            entityType: "contacts",
            insertedRows: 5,
            failedRows: 1,
            createdAt: new Date("2026-01-04T00:00:00.000Z"),
          },
        ]),
      }),
    });

    const result = await getImportMigrationPlan({ select } as never, {
      orgId: "org-1",
      source: "generic",
    });

    expect(result.nextEntityType).toBe("contacts");
    expect(result.progress[0]).toMatchObject({
      entityType: "contacts",
      status: "has_errors",
      insertedRows: 5,
      failedRows: 1,
    });
  });

  it("marks a step complete when the latest import fixes an earlier failed attempt", async () => {
    const select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          {
            entityType: "contacts",
            insertedRows: 5,
            failedRows: 1,
            createdAt: new Date("2026-01-04T00:00:00.000Z"),
          },
          {
            entityType: "contacts",
            insertedRows: 6,
            failedRows: 0,
            createdAt: new Date("2026-01-05T00:00:00.000Z"),
          },
        ]),
      }),
    });

    const result = await getImportMigrationPlan({ select } as never, {
      orgId: "org-1",
      source: "generic",
    });

    expect(result.nextEntityType).toBe("funds");
    expect(result.progress[0]).toMatchObject({
      entityType: "contacts",
      status: "completed",
      insertedRows: 11,
      failedRows: 1,
      latestImportAt: new Date("2026-01-05T00:00:00.000Z"),
    });
  });
});

describe("findExistingContact — case-insensitive dedup", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("matches an existing contact by email regardless of case difference (no duplicate created)", async () => {
    // Simulate DB row stored with mixed-case email; incoming import has lowercase.
    const existingContact = {
      id: "contact-existing",
      orgId: "org-1",
      email: "John@Example.com",
      type: "individual",
      firstName: "John",
      lastName: "Doe",
      deletedAt: null,
    };

    const contactsFindFirst = vi.fn().mockResolvedValue(existingContact);
    const insert = vi.fn((table: unknown) => {
      const rows =
        table === importHistory
          ? [{ id: "history-1", orgId: "org-1", userId: "user-1", status: "completed" }]
          : [{ id: "new-row", orgId: "org-1" }];
      return { values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(rows) }) };
    });

    const query = {
      contacts: { findFirst: contactsFindFirst },
      donations: { findFirst: vi.fn().mockResolvedValue(undefined) },
      grants: { findFirst: vi.fn().mockResolvedValue(undefined) },
      funders: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };

    const db = withTx({ query, insert });

    const result = await commitImport(db as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "contacts",
      filename: "contacts.csv",
      mapping: {
        email: "email",
        firstName: "first_name",
        lastName: "last_name",
        type: "type",
      },
      rows: [
        { email: "john@example.com", first_name: "John", last_name: "Doe", type: "individual" },
      ],
    });

    // The incoming row matched the existing DB contact — no new contact inserted.
    expect(result.createdCounts.contacts).toBe(0);
    expect(result.duplicateRows).toBe(1);

    // Verify the query used lower() on both sides (case-insensitive comparison).
    const callArg = contactsFindFirst.mock.calls[0]?.[0] as { where: unknown };
    const dialect = new PgDialect();
    const rendered = dialect.sqlToQuery(callArg.where as Parameters<PgDialect["sqlToQuery"]>[0]);
    expect(rendered.sql.toLowerCase()).toContain("lower(");
    expect(rendered.params).toContain("john@example.com");
  });

  it("matches an existing organization contact by organizationName regardless of case", async () => {
    const existingContact = {
      id: "contact-org",
      orgId: "org-1",
      email: null,
      type: "organization",
      organizationName: "ACME CORP",
      deletedAt: null,
    };

    const contactsFindFirst = vi.fn().mockResolvedValue(existingContact);
    const insert = vi.fn((table: unknown) => {
      const rows =
        table === importHistory
          ? [{ id: "history-1", orgId: "org-1", userId: "user-1", status: "completed" }]
          : [{ id: "new-row", orgId: "org-1" }];
      return { values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(rows) }) };
    });

    const query = {
      contacts: { findFirst: contactsFindFirst },
      donations: { findFirst: vi.fn().mockResolvedValue(undefined) },
      grants: { findFirst: vi.fn().mockResolvedValue(undefined) },
      funders: { findFirst: vi.fn().mockResolvedValue(undefined) },
    };

    const db = withTx({ query, insert });

    const result = await commitImport(db as never, {
      orgId: "org-1",
      userId: "user-1",
      entityType: "contacts",
      filename: "contacts.csv",
      mapping: {
        organizationName: "org_name",
        type: "type",
      },
      rows: [{ org_name: "acme corp", type: "organization" }],
    });

    expect(result.createdCounts.contacts).toBe(0);
    expect(result.duplicateRows).toBe(1);

    const callArg = contactsFindFirst.mock.calls[0]?.[0] as { where: unknown };
    const dialect = new PgDialect();
    const rendered = dialect.sqlToQuery(callArg.where as Parameters<PgDialect["sqlToQuery"]>[0]);
    expect(rendered.sql.toLowerCase()).toContain("lower(");
    expect(rendered.params).toContain("acme corp");
  });
});
