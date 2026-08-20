import { badRequest } from "../../lib/app-error";

export type ParsedCsv = {
  headers: string[];
  rows: Array<Record<string, string>>;
  totalRows: number;
};

function parseCsvRows(csvText: string): string[][] {
  const text = csvText.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
        continue;
      }

      // Drop carriage returns inside quoted fields too, so Windows-exported
      // CSVs with multiline quoted cells normalize to "\n" consistently with
      // unquoted content rather than storing stray "\r" characters.
      if (char === "\r") {
        continue;
      }

      field += char;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\r") {
      continue;
    }

    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (inQuotes) {
    throw badRequest("CSV contains an unterminated quoted field.");
  }

  row.push(field);
  rows.push(row);

  return rows.filter((parsedRow) => parsedRow.some((cell) => cell.trim().length > 0));
}

export function parseCsvText(csvText: string): ParsedCsv {
  const rows = parseCsvRows(csvText);
  const headers = rows[0]?.map((header) => header.trim()) ?? [];
  const dataRows = rows.slice(1);

  return {
    headers,
    rows: dataRows.map((dataRow) =>
      headers.reduce<Record<string, string>>((accumulator, header, index) => {
        const value = dataRow[index] ?? "";
        accumulator[header] = value;
        return accumulator;
      }, {}),
    ),
    totalRows: dataRows.length,
  };
}
