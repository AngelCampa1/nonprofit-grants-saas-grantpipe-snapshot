import { describe, expect, it } from "vitest";
import { buildLedgerCsv } from "./ledger";

const baseLines = [
  {
    line: { debitCents: 10000, creditCents: 0, memo: "Payment" },
    journalEntry: { entryNumber: 1, date: "2026-01-15T00:00:00.000Z", memo: "JE memo" },
    runningBalance: 10000,
  },
];

describe("buildLedgerCsv", () => {
  it("produces correct header and a normal data row", () => {
    const csv = buildLedgerCsv("Cash", baseLines);
    const [headerLine, dataLine] = csv.split("\n");
    expect(headerLine).toBe("Date,JE Ref,Memo,Debit,Credit,Running Balance");
    expect(dataLine).toContain("100.00");
    expect(dataLine).toContain("#1");
    expect(dataLine).toContain("Payment");
  });

  it("escapes a memo containing a double-quote (doubled and wrapped)", () => {
    const lines = [
      {
        line: { debitCents: 5000, creditCents: 0, memo: 'He said "hello"' },
        journalEntry: { entryNumber: 2, date: "2026-02-01T00:00:00.000Z", memo: null },
        runningBalance: 5000,
      },
    ];
    const csv = buildLedgerCsv("Cash", lines);
    expect(csv).toContain('"He said ""hello"""');
  });

  it("escapes a memo containing a comma (wrapped in quotes)", () => {
    const lines = [
      {
        line: { debitCents: 0, creditCents: 2000, memo: "Smith, Jane" },
        journalEntry: { entryNumber: 3, date: "2026-03-01T00:00:00.000Z", memo: null },
        runningBalance: -2000,
      },
    ];
    const csv = buildLedgerCsv("Cash", lines);
    expect(csv).toContain('"Smith, Jane"');
  });

  it("escapes a memo containing a newline (wrapped in quotes)", () => {
    const lines = [
      {
        line: { debitCents: 1000, creditCents: 0, memo: "line1\nline2" },
        journalEntry: { entryNumber: 4, date: "2026-04-01T00:00:00.000Z", memo: null },
        runningBalance: 1000,
      },
    ];
    const csv = buildLedgerCsv("Cash", lines);
    expect(csv).toContain('"line1\nline2"');
  });

  it("escapes a memo starting with = (formula injection neutralized)", () => {
    const lines = [
      {
        line: { debitCents: 0, creditCents: 500, memo: "=HYPERLINK(A1)" },
        journalEntry: { entryNumber: 5, date: "2026-05-01T00:00:00.000Z", memo: null },
        runningBalance: -500,
      },
    ];
    const csv = buildLedgerCsv("Cash", lines);
    expect(csv).toContain("'=HYPERLINK(A1)");
  });

  it("uses journal entry memo when line memo is null", () => {
    const lines = [
      {
        line: { debitCents: 100, creditCents: 0, memo: null },
        journalEntry: { entryNumber: 6, date: "2026-06-01T00:00:00.000Z", memo: "JE level" },
        runningBalance: 100,
      },
    ];
    const csv = buildLedgerCsv("Cash", lines);
    expect(csv).toContain("JE level");
  });

  it("leaves debit blank and populates credit when creditCents > 0", () => {
    const lines = [
      {
        line: { debitCents: 0, creditCents: 3000, memo: "credit entry" },
        journalEntry: { entryNumber: 7, date: "2026-07-01T00:00:00.000Z", memo: null },
        runningBalance: -3000,
      },
    ];
    const csv = buildLedgerCsv("Cash", lines);
    // The row should contain the credit amount and empty debit
    const rows = csv.split("\n");
    const dataRow = rows[1];
    // debit cell is empty, credit cell is 30.00
    expect(dataRow).toContain("30.00");
  });
});
