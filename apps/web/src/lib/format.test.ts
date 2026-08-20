import { describe, expect, it } from "vitest";
import {
  formatCurrency,
  formatDateKicker,
  formatEventTypeLabel,
  formatFundTypeLabel,
  formatFunderTypeLabel,
  formatActivityEntityLabel,
  formatGrantStatusLabel,
  formatPaymentRequestStatus,
  formatPaymentRequestType,
  formatUtcCalendarDate,
  formatReportStatusLabel,
  formatThresholdLabel,
  todayLocalDateInput,
  localDateInputEndOfDayIso,
  formatUtcDate,
  formatUtcDateTime,
  humanizeEnum,
} from "./format";

describe("humanizeEnum", () => {
  it("title-cases a snake_case value", () => {
    expect(humanizeEnum("payment_request_line")).toBe("Payment Request Line");
  });

  it("returns a single word capitalized", () => {
    expect(humanizeEnum("grant")).toBe("Grant");
  });

  it("ignores leading/trailing/double underscores", () => {
    expect(humanizeEnum("__fund__type__")).toBe("Fund Type");
  });

  it("handles empty input", () => {
    expect(humanizeEnum("")).toBe("");
  });
});

describe("formatActivityEntityLabel", () => {
  it("maps document_extraction to the product name Award Intake", () => {
    expect(formatActivityEntityLabel("document_extraction")).toBe("Award Intake");
  });

  it("shortens generated_report to Report", () => {
    expect(formatActivityEntityLabel("generated_report")).toBe("Report");
  });

  it("shortens import_history to Import", () => {
    expect(formatActivityEntityLabel("import_history")).toBe("Import");
  });

  it("falls back to a humanized enum for unmapped types", () => {
    expect(formatActivityEntityLabel("grant")).toBe("Grant");
    expect(formatActivityEntityLabel("payment_request")).toBe("Payment Request");
  });
});

describe("formatEventTypeLabel", () => {
  it("capitalizes 'gala'", () => {
    expect(formatEventTypeLabel("gala")).toBe("Gala");
  });

  it("capitalizes 'fundraiser'", () => {
    expect(formatEventTypeLabel("fundraiser")).toBe("Fundraiser");
  });

  it("capitalizes the first character and leaves the rest unchanged", () => {
    expect(formatEventTypeLabel("other")).toBe("Other");
  });

  it("handles already-capitalized input", () => {
    expect(formatEventTypeLabel("Campaign")).toBe("Campaign");
  });
});

describe("formatUtcDate", () => {
  it("formats a UTC ISO date string with short month, day, and year", () => {
    const result = formatUtcDate("2026-04-12T00:00:00.000Z");
    expect(result).toBe("Apr 12, 2026");
  });

  it("formats a mid-day date correctly", () => {
    const result = formatUtcDate("2025-01-01T12:00:00.000Z");
    expect(result).toBe("Jan 1, 2025");
  });

  it("does not shift the date due to timezone offset", () => {
    // Late UTC date that could roll over in negative-offset timezones
    const result = formatUtcDate("2026-03-31T23:59:00.000Z");
    expect(result).toBe("Mar 31, 2026");
  });

  it("returns '--' for an invalid date string", () => {
    expect(formatUtcDate("not-a-date")).toBe("--");
  });
});

describe("formatUtcDateTime", () => {
  it("formats a UTC ISO timestamp with short month, day, year, time, and UTC suffix", () => {
    const result = formatUtcDateTime("2026-04-08T18:30:00.000Z");
    expect(result).toMatch(/Apr\s+8,\s+2026/);
    expect(result).toMatch(/6:30\s*PM/);
    expect(result).toMatch(/UTC$/);
  });

  it("includes minutes in two-digit format", () => {
    const result = formatUtcDateTime("2026-04-08T09:05:00.000Z");
    expect(result).toMatch(/9:05\s*AM/);
    expect(result).toMatch(/UTC$/);
  });

  it("does not shift the date due to timezone offset", () => {
    const result = formatUtcDateTime("2026-03-31T23:59:00.000Z");
    expect(result).toMatch(/Mar\s+31,\s+2026/);
    expect(result).not.toMatch(/Apr/);
  });
});

describe("formatDateKicker", () => {
  it("formats a Date object with weekday, month, day, and year", () => {
    const result = formatDateKicker(new Date("2026-04-08T00:00:00.000Z"));
    expect(result).toMatch(/Wednesday/);
    expect(result).toMatch(/April/);
    expect(result).toMatch(/8/);
    expect(result).toMatch(/2026/);
  });

  it("accepts a string input and formats it correctly", () => {
    const result = formatDateKicker("2026-04-08T00:00:00.000Z");
    expect(result).toMatch(/Wednesday/);
    expect(result).toMatch(/April/);
  });

  it("does not shift the date due to timezone offset", () => {
    const result = formatDateKicker("2026-03-31T23:59:00.000Z");
    expect(result).toMatch(/Tuesday/);
    expect(result).toMatch(/March/);
    expect(result).toMatch(/31/);
    expect(result).not.toMatch(/April/);
  });
});

describe("formatReportStatusLabel", () => {
  it("capitalizes a single word status", () => {
    expect(formatReportStatusLabel("ready")).toBe("Ready");
  });

  it("converts underscore-separated words to title case", () => {
    expect(formatReportStatusLabel("ready_to_download")).toBe("Ready To Download");
  });

  it("handles a single underscore segment", () => {
    expect(formatReportStatusLabel("draft")).toBe("Draft");
  });

  it("filters out empty segments from multiple underscores", () => {
    expect(formatReportStatusLabel("in__review")).toBe("In Review");
  });

  it("handles already-capitalized status", () => {
    expect(formatReportStatusLabel("Pending")).toBe("Pending");
  });
});

describe("formatFundTypeLabel", () => {
  it("capitalizes a single-word type", () => {
    expect(formatFundTypeLabel("unrestricted")).toBe("Unrestricted");
  });

  it("uses the shared restricted fund label copy", () => {
    expect(formatFundTypeLabel("temporarily_restricted")).toBe("Temporarily restricted");
  });

  it("uses the shared permanently restricted fund label copy", () => {
    expect(formatFundTypeLabel("permanently_restricted")).toBe("Permanently restricted");
  });

  it("falls back to a humanized label for unknown fund types", () => {
    expect(formatFundTypeLabel("board_designated")).toBe("Board Designated");
  });
});

describe("formatFunderTypeLabel", () => {
  it("capitalizes foundation", () => {
    expect(formatFunderTypeLabel("foundation")).toBe("Foundation");
  });

  it("capitalizes corporate", () => {
    expect(formatFunderTypeLabel("corporate")).toBe("Corporate");
  });

  it("capitalizes government", () => {
    expect(formatFunderTypeLabel("government")).toBe("Government");
  });

  it("capitalizes other", () => {
    expect(formatFunderTypeLabel("other")).toBe("Other");
  });

  it("falls back to a humanized label for unknown funder types", () => {
    expect(formatFunderTypeLabel("family_foundation")).toBe("Family Foundation");
  });
});

describe("formatCurrency", () => {
  it("returns '--' for null", () => {
    expect(formatCurrency(null)).toBe("--");
  });

  it("returns '--' for undefined", () => {
    expect(formatCurrency(undefined)).toBe("--");
  });

  it("formats zero cents as $0", () => {
    expect(formatCurrency(0)).toBe("$0");
  });

  it("formats 100 cents as $1", () => {
    expect(formatCurrency(100)).toBe("$1");
  });

  it("formats 500000 cents as $5,000", () => {
    expect(formatCurrency(500000)).toBe("$5,000");
  });

  it("formats 100000000 cents as $1,000,000", () => {
    expect(formatCurrency(100000000)).toBe("$1,000,000");
  });

  it("shows fractional dollars when amount has cents", () => {
    // 150 cents = $1.50
    expect(formatCurrency(150)).toBe("$1.50");
  });
});

describe("formatUtcCalendarDate", () => {
  it("returns '--' for null", () => {
    expect(formatUtcCalendarDate(null)).toBe("--");
  });

  it("returns '--' for undefined", () => {
    expect(formatUtcCalendarDate(undefined)).toBe("--");
  });

  it("returns '--' for empty string", () => {
    expect(formatUtcCalendarDate("")).toBe("--");
  });

  it("returns '--' for an invalid date string", () => {
    expect(formatUtcCalendarDate("not-a-date")).toBe("--");
  });

  it("formats a UTC midnight ISO string to the correct calendar date", () => {
    // Midnight UTC — must render as Apr 1, not Mar 31 in negative-offset timezones
    const result = formatUtcCalendarDate("2026-04-01T00:00:00.000Z");
    expect(result).toMatch(/Apr\s+1,\s+2026/);
    // Explicitly assert the month is April, not March (regression guard)
    expect(result).not.toMatch(/^Mar/);
  });

  it("does not shift the date due to timezone offset", () => {
    // Late UTC date that could roll over in negative-offset timezones
    const result = formatUtcCalendarDate("2026-03-31T23:59:00.000Z");
    expect(result).toMatch(/Mar\s+31,\s+2026/);
    expect(result).not.toMatch(/^Apr/);
  });

  it("formats a UTC midnight ISO string in a different month correctly", () => {
    const result = formatUtcCalendarDate("2025-06-15T00:00:00.000Z");
    expect(result).toMatch(/Jun\s+15,\s+2025/);
  });
});

describe("formatThresholdLabel", () => {
  it("returns 'Threshold --' for null", () => {
    expect(formatThresholdLabel(null)).toBe("Threshold --");
  });

  it("returns 'Threshold --' for undefined", () => {
    expect(formatThresholdLabel(undefined)).toBe("Threshold --");
  });

  it("returns 'Threshold --' for empty string", () => {
    expect(formatThresholdLabel("")).toBe("Threshold --");
  });

  it("formats a numeric threshold", () => {
    expect(formatThresholdLabel("80")).toBe("Threshold 80%");
  });

  it("strips trailing percent sign from input", () => {
    expect(formatThresholdLabel("90%")).toBe("Threshold 90%");
  });

  it("strips multiple trailing percent signs", () => {
    expect(formatThresholdLabel("75%%")).toBe("Threshold 75%");
  });

  it("handles whitespace-only string as empty", () => {
    expect(formatThresholdLabel("   ")).toBe("Threshold --");
  });
});

describe("formatGrantStatusLabel", () => {
  it("returns 'Discovery' for null", () => {
    expect(formatGrantStatusLabel(null)).toBe("Discovery");
  });

  it("returns 'Discovery' for undefined", () => {
    expect(formatGrantStatusLabel(undefined)).toBe("Discovery");
  });

  it("returns 'Discovery' for empty string", () => {
    expect(formatGrantStatusLabel("")).toBe("Discovery");
  });

  it("returns 'Discovery' for whitespace-only string", () => {
    expect(formatGrantStatusLabel("   ")).toBe("Discovery");
  });

  it("capitalizes a single-word status", () => {
    expect(formatGrantStatusLabel("active")).toBe("Active");
  });

  it("splits underscored status and capitalizes each word", () => {
    expect(formatGrantStatusLabel("in_review")).toBe("In Review");
  });

  it("handles already-capitalized status", () => {
    expect(formatGrantStatusLabel("Awarded")).toBe("Awarded");
  });

  it("handles multi-word underscored status", () => {
    expect(formatGrantStatusLabel("under_final_review")).toBe("Under Final Review");
  });

  it("filters out empty segments from multiple underscores", () => {
    expect(formatGrantStatusLabel("a__b")).toBe("A B");
  });
});

describe("formatPaymentRequestStatus", () => {
  it("uses known labels", () => {
    expect(formatPaymentRequestStatus("partially_approved")).toBe("Partially Approved");
  });

  it("falls back to replacing underscores for unknown statuses", () => {
    expect(formatPaymentRequestStatus("pending_finance_review")).toBe("pending finance review");
  });
});

describe("formatPaymentRequestType", () => {
  it("uses known labels", () => {
    expect(formatPaymentRequestType("advance_liquidation")).toBe("Advance Liquidation");
  });

  it("falls back to replacing underscores for unknown types", () => {
    expect(formatPaymentRequestType("special_draw_request")).toBe("special draw request");
  });
});

describe("todayLocalDateInput", () => {
  it("returns the local calendar date as YYYY-MM-DD", () => {
    expect(todayLocalDateInput(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });

  it("zero-pads single-digit month and day", () => {
    expect(todayLocalDateInput(new Date(2026, 8, 3, 0, 0))).toBe("2026-09-03");
  });
});

describe("localDateInputEndOfDayIso", () => {
  it("returns the final instant of the selected local calendar day", () => {
    expect(localDateInputEndOfDayIso("2026-07-12")).toBe(
      new Date(2026, 6, 12, 23, 59, 59, 999).toISOString(),
    );
  });
});
