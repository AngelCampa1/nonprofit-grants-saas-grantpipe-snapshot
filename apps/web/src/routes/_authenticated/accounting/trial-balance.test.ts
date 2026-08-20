import { describe, expect, it } from "vitest";
import { buildTrialBalanceCsv } from "./trial-balance";

const baseRows = [{ account: { code: "1000", name: "Cash" }, debitTotal: 50000, creditTotal: 0 }];

describe("buildTrialBalanceCsv", () => {
  it("produces title, header, data row, and totals row", () => {
    const csv = buildTrialBalanceCsv("2026-01-31T23:59:59.999Z", baseRows, 50000, 0);
    expect(csv).toContain("Trial Balance as of");
    expect(csv).toContain("Code,Name,Debit,Credit");
    expect(csv).toContain("500.00");
    expect(csv).toContain("TOTALS");
  });

  it("normal row formats code and name correctly", () => {
    const csv = buildTrialBalanceCsv("2026-01-31T23:59:59.999Z", baseRows, 50000, 0);
    expect(csv).toContain("1000");
    expect(csv).toContain("Cash");
  });

  it("escapes an account name containing a double-quote", () => {
    const rows = [
      { account: { code: "2000", name: 'Accounts "Payable"' }, debitTotal: 0, creditTotal: 10000 },
    ];
    const csv = buildTrialBalanceCsv("2026-01-31T23:59:59.999Z", rows, 0, 10000);
    expect(csv).toContain('"Accounts ""Payable"""');
  });

  it("escapes an account name containing a comma", () => {
    const rows = [
      { account: { code: "3000", name: "Smith, Jones Fund" }, debitTotal: 20000, creditTotal: 0 },
    ];
    const csv = buildTrialBalanceCsv("2026-01-31T23:59:59.999Z", rows, 20000, 0);
    expect(csv).toContain('"Smith, Jones Fund"');
  });

  it("escapes an account name containing a newline", () => {
    const rows = [
      { account: { code: "4000", name: "Line1\nLine2" }, debitTotal: 5000, creditTotal: 0 },
    ];
    const csv = buildTrialBalanceCsv("2026-01-31T23:59:59.999Z", rows, 5000, 0);
    expect(csv).toContain('"Line1\nLine2"');
  });

  it("escapes an account name starting with = (formula injection neutralized)", () => {
    const rows = [{ account: { code: "5000", name: "=evil()" }, debitTotal: 100, creditTotal: 0 }];
    const csv = buildTrialBalanceCsv("2026-01-31T23:59:59.999Z", rows, 100, 0);
    expect(csv).toContain("'=evil()");
  });

  it("leaves debit blank and populates credit when only creditTotal > 0", () => {
    const rows = [
      { account: { code: "6000", name: "Revenue" }, debitTotal: 0, creditTotal: 30000 },
    ];
    const csv = buildTrialBalanceCsv("2026-01-31T23:59:59.999Z", rows, 0, 30000);
    // credit cell should be 300.00
    expect(csv).toContain("300.00");
  });

  it("includes totals row with correct totals", () => {
    const csv = buildTrialBalanceCsv("2026-01-31T23:59:59.999Z", baseRows, 50000, 0);
    expect(csv).toContain("TOTALS");
    expect(csv).toContain("500.00");
  });
});
