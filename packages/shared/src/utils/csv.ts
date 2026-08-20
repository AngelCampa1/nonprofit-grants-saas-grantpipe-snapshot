// Canonical CSV cell escaping for all server-generated exports.
//
// Two concerns are handled together:
//
// 1. CSV formula injection. Spreadsheet apps (Excel, Google Sheets, LibreOffice)
//    treat a cell whose first non-whitespace character is `=`, `+`, `-`, or `@`
//    as a formula. An attacker who controls an exported field (donor name,
//    description, vendor, account name, restriction title, etc.) can smuggle a
//    formula that exfiltrates data or runs commands on whoever opens the file.
//    We neutralize this by prefixing such cells with a single quote, which forces
//    the spreadsheet to treat the content as literal text. Leading tabs, spaces,
//    and carriage returns are considered too, since they can precede the trigger
//    character and still be honored by spreadsheet parsers.
//
// 2. RFC 4180 quoting. A cell containing a comma, double quote, line feed, or
//    carriage return is wrapped in double quotes with embedded quotes doubled,
//    so the value cannot break out of its field or row.
// Prefix a value with a single quote when it would otherwise be parsed as a
// spreadsheet formula. Shared by both the conditional-quoting `escapeCsvCell`
// and writers that always wrap every cell in quotes (machine-readable exports),
// so formula neutralization stays in one place.
export function neutralizeCsvFormula(value: string | number | boolean | null | undefined): string {
  const raw = value == null ? "" : String(value);
  return /^[\t\r ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
}

export function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  const normalized = neutralizeCsvFormula(value);
  if (
    normalized.includes(",") ||
    normalized.includes('"') ||
    normalized.includes("\n") ||
    normalized.includes("\r")
  ) {
    return `"${normalized.replaceAll('"', '""')}"`;
  }
  return normalized;
}
