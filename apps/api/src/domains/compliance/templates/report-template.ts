// ─── Types ───────────────────────────────────────────────────────────────────

export type ReportSection =
  | { kind: "keyValue"; heading: string; rows: { label: string; value: string }[] }
  | {
      kind: "table";
      heading: string;
      columns: string[];
      rows: string[][];
      totalsRow?: string[];
    }
  | { kind: "list"; heading: string; items: string[]; emptyText: string }
  | { kind: "checklist"; heading: string; items: { label: string; done: boolean }[] }
  | { kind: "paragraph"; heading?: string; text: string };

export type ReportDocumentInput = {
  org: {
    name: string;
    logoUrl?: string | null;
    address?: string | null;
    ein?: string | null;
  };
  title: string;
  subtitle?: string;
  periodLabel?: string;
  sections: ReportSection[];
  attestation?: { lineLabels: string[] };
  footerNote?: string;
};

// ─── Internal utilities ───────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeCssString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function isSafeImageUrl(url: string): boolean {
  return (
    /^\/(?!\/)/.test(url) || /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(url)
  );
}

const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Format a date as "Mon D" (no year). */
function fmtDateShort(month0: number, day: number): string {
  return `${MONTH_ABBR[month0]} ${day}`;
}

/** Format a date as "Mon D, YYYY". */
function fmtDateLong(year: number, month0: number, day: number): string {
  return `${MONTH_ABBR[month0]} ${day}, ${year}`;
}

// ─── Section renderers ────────────────────────────────────────────────────────

function renderKeyValue(section: Extract<ReportSection, { kind: "keyValue" }>): string {
  const rows = section.rows
    .map(
      (r) => `
    <tr>
      <td class="kv-label">${escapeHtml(r.label)}</td>
      <td class="kv-value">${escapeHtml(r.value)}</td>
    </tr>`,
    )
    .join("");
  return `
  <section>
    <h2>${escapeHtml(section.heading)}</h2>
    <table class="kv-table">
      <tbody>${rows}
      </tbody>
    </table>
  </section>`;
}

function renderTable(section: Extract<ReportSection, { kind: "table" }>): string {
  const lastColIdx = section.columns.length - 1;

  const headerCells = section.columns
    .map((col, i) => `<th class="${i === lastColIdx ? "right" : ""}">${escapeHtml(col)}</th>`)
    .join("");

  const bodyRows = section.rows
    .map((row, ri) => {
      // Trim each row to columns.length to guard against mismatched data
      const normalizedRow = row.slice(0, section.columns.length);
      return (
        `<tr class="${ri % 2 === 1 ? "zebra" : ""}">` +
        normalizedRow
          .map(
            (cell, ci) =>
              `<td class="${ci === lastColIdx ? "right" : ""}">${escapeHtml(cell)}</td>`,
          )
          .join("") +
        "</tr>"
      );
    })
    .join("\n      ");

  const tfoot = section.totalsRow
    ? `<tfoot><tr class="totals-row">` +
      section.totalsRow
        .map(
          (cell, ci) => `<td class="${ci === lastColIdx ? "right" : ""}">${escapeHtml(cell)}</td>`,
        )
        .join("") +
      `</tr></tfoot>`
    : "";

  return `
  <section>
    <h2>${escapeHtml(section.heading)}</h2>
    <table class="data-table">
      <thead><tr>${headerCells}</tr></thead>
      <tbody>
      ${bodyRows}
      </tbody>
      ${tfoot}
    </table>
  </section>`;
}

function renderList(section: Extract<ReportSection, { kind: "list" }>): string {
  const body =
    section.items.length === 0
      ? `<p class="muted-italic">${escapeHtml(section.emptyText)}</p>`
      : `<ul>${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
  return `
  <section>
    <h2>${escapeHtml(section.heading)}</h2>
    ${body}
  </section>`;
}

function renderChecklist(section: Extract<ReportSection, { kind: "checklist" }>): string {
  const body =
    section.items.length === 0
      ? `<p class="muted-italic">No items recorded.</p>`
      : `<ul class="checklist">${section.items
          .map(
            (item) =>
              `<li><span class="check-icon">${item.done ? "\u2611" : "\u2610"}</span> ${escapeHtml(item.label)}</li>`,
          )
          .join("")}</ul>`;
  return `
  <section>
    <h2>${escapeHtml(section.heading)}</h2>
    ${body}
  </section>`;
}

function renderParagraph(section: Extract<ReportSection, { kind: "paragraph" }>): string {
  const heading = section.heading ? `<h2>${escapeHtml(section.heading)}</h2>` : "";
  return `
  <section>
    ${heading}
    <p>${escapeHtml(section.text)}</p>
  </section>`;
}

function renderSection(section: ReportSection): string {
  switch (section.kind) {
    case "keyValue":
      return renderKeyValue(section);
    case "table":
      return renderTable(section);
    case "list":
      return renderList(section);
    case "checklist":
      return renderChecklist(section);
    case "paragraph":
      return renderParagraph(section);
  }
}

function renderAttestation(attestation: { lineLabels: string[] }): string {
  const lines = attestation.lineLabels
    .map(
      (label) => `
    <div class="sig-row">
      <span class="sig-label">${escapeHtml(label)}</span>
      <span class="sig-line"></span>
      <span class="sig-date">Date: _______________</span>
    </div>`,
    )
    .join("");
  return `
  <section class="attestation">
    <h2>Attestation</h2>
    ${lines}
  </section>`;
}

const grantPipeReportLogo = `<span class="brand-logo" data-report-brand-logo="true" aria-label="GrantPipe">
        <svg
          class="brand-mark"
          data-logo-mark="grantpipe-mark"
          width="36"
          height="36"
          viewBox="0 0 64 64"
          role="img"
          aria-hidden="true"
        >
          <g transform="translate(6 4)">
            <path d="M26 0 52 13.5 26 27 0 13.5Z" fill="#047857" />
            <path d="M0 19 20 29.5v28L0 47Z" fill="#047857" />
            <path d="M52 19 32 29.5v28L52 47Z" fill="#047857" />
            <path d="M20 29.5 26 32.7 32 29.5v28L26 61 20 57.5Z" fill="#ffffff" />
            <path d="M0 13.5 5.6 10.6 26 21.2 46.4 10.6 52 13.5 26 27Z" fill="#ffffff" />
            <rect data-gold-accent="1" x="22.1" y="30.8" width="7.8" height="8" rx="1.4" fill="#d99a18" />
            <rect data-gold-accent="2" x="22.1" y="43.2" width="7.8" height="8" rx="1.4" fill="#d99a18" />
          </g>
        </svg>
        <span class="brand-wordmark">GrantPipe</span>
      </span>`;

// ─── Main renderer ────────────────────────────────────────────────────────────

export function renderReportDocument(input: ReportDocumentInput): string {
  const { org, title, subtitle, periodLabel, sections, attestation, footerNote } = input;

  const logoHtml =
    org.logoUrl && isSafeImageUrl(org.logoUrl)
      ? `<img src="${escapeHtml(org.logoUrl)}" alt="${escapeHtml(org.name)} logo" class="org-logo" />`
      : "";

  const subtitleHtml = subtitle ? `<div class="subtitle">${escapeHtml(subtitle)}</div>` : "";

  const periodHtml = periodLabel
    ? `<span class="period-badge">${escapeHtml(periodLabel)}</span>`
    : "";

  const addressHtml = org.address ? `<div class="org-meta">${escapeHtml(org.address)}</div>` : "";

  const einHtml = org.ein ? `<div class="org-meta">EIN: ${escapeHtml(org.ein)}</div>` : "";

  const sectionsHtml = sections.map(renderSection).join("\n");

  const attestationHtml = attestation ? renderAttestation(attestation) : "";

  const footerNoteHtml = footerNote
    ? `<div class="footer-note">${escapeHtml(footerNote)}</div>`
    : "";

  const escapedOrgName = escapeHtml(org.name);
  const escapedTitle = escapeHtml(title);
  // CSS content strings need backslashes and double-quotes escaped.
  // We also HTML-escape first so angle brackets don't appear as raw tags in the document.
  const cssOrgName = escapeCssString(escapedOrgName);
  const cssTitle = escapeCssString(escapedTitle);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapedTitle}</title>
  <style>
    @page {
      size: Letter;
      margin: 0.6in;
      @bottom-left {
        content: "${cssOrgName}";
        font-size: 9px;
        color: #6b7280;
      }
      @bottom-right {
        content: "${cssTitle}";
        font-size: 9px;
        color: #6b7280;
      }
      @bottom-center {
        content: "Page " counter(page) " of " counter(pages);
        font-size: 9px;
        color: #6b7280;
      }
    }

    *, *::before, *::after {
      box-sizing: border-box;
    }

    body {
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 13px;
      color: #111827;
      margin: 0;
      padding: 0;
      line-height: 1.5;
      background: #fffdf8;
    }

    /* ── Branded masthead ── */
    .brand-masthead {
      background: #047857;
      color: #fff;
      border-top: 4px solid #d99a18;
      border-radius: 0 0 10px 10px;
      margin-bottom: 22px;
      overflow: hidden;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    .brand-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 12px 16px 10px;
    }

    .brand-logo {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      min-width: 0;
    }

    .brand-mark {
      display: block;
      flex: 0 0 auto;
    }

    .brand-wordmark {
      font-weight: 700;
      font-size: 16px;
      letter-spacing: 0.01em;
    }

    .brand-kicker {
      color: #d1fae5;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    /* ── Report header ── */
    .report-header {
      background: #fffdf8;
      border: 1px solid #e7ddd2;
      border-top: 4px solid #d99a18;
      border-radius: 8px;
      margin: 0 16px 16px;
      padding: 14px 16px;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    .report-header-grid {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }

    .report-header-main {
      min-width: 0;
      flex: 1;
    }

    .org-name {
      color: #047857;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      margin: 0 0 4px;
      text-transform: uppercase;
    }

    .report-title {
      font-size: 22px;
      font-weight: 700;
      color: #111827;
      margin: 0 0 4px;
    }

    .subtitle {
      font-size: 14px;
      color: #374151;
      margin: 0 0 8px;
    }

    .report-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 12px;
      margin-top: 8px;
    }

    .period-badge {
      display: inline-block;
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      color: #047857;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 999px;
    }

    .org-meta {
      font-size: 11px;
      color: #5f6b76;
    }

    .org-logo {
      max-height: 48px;
      max-width: 150px;
      display: block;
      object-fit: contain;
    }

    /* ── Sections ── */
    section {
      margin-bottom: 24px;
      page-break-inside: avoid;
    }

    h2 {
      font-size: 13px;
      font-weight: 700;
      color: #047857;
      border-bottom: 1px solid #d1fae5;
      padding-bottom: 4px;
      margin: 0 0 10px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    p {
      white-space: pre-line;
    }

    /* ── Key-value table ── */
    .kv-table {
      width: 100%;
      border-collapse: collapse;
    }

    .kv-table tr + tr td {
      padding-top: 4px;
    }

    .kv-label {
      width: 35%;
      color: #6b7280;
      text-align: right;
      padding-right: 12px;
      vertical-align: top;
    }

    .kv-value {
      color: #111;
    }

    /* ── Data table ── */
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    .data-table thead tr {
      background: #047857;
      color: #ffffff;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    .data-table th {
      font-weight: 700;
      text-align: left;
      padding: 6px 8px;
      color: #ffffff;
    }

    .data-table td {
      padding: 5px 8px;
      vertical-align: top;
      border-bottom: 1px solid #f5efe8;
    }

    .data-table tr.zebra td {
      background: #fbf8f4;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    .data-table tfoot tr.totals-row td {
      font-weight: 700;
      border-top: 2px solid #d99a18;
      color: #047857;
      padding-top: 6px;
    }

    .right {
      text-align: right;
    }

    /* ── List ── */
    ul {
      margin: 0;
      padding-left: 20px;
    }

    ul li {
      margin-bottom: 4px;
    }

    /* ── Checklist ── */
    .checklist {
      list-style: none;
      padding-left: 0;
    }

    .checklist li {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      margin-bottom: 5px;
    }

    .check-icon {
      font-size: 14px;
      line-height: 1.4;
      flex-shrink: 0;
    }

    /* ── Muted text ── */
    .muted-italic {
      color: #9ca3af;
      font-style: italic;
      margin: 0;
    }

    /* ── Attestation ── */
    .attestation {
      margin-top: 32px;
      page-break-inside: avoid;
    }

    .sig-row {
      display: flex;
      align-items: flex-end;
      gap: 12px;
      margin-bottom: 20px;
    }

    .sig-label {
      width: 160px;
      flex-shrink: 0;
      font-size: 12px;
      color: #374151;
    }

    .sig-line {
      flex: 1;
      border-bottom: 1px solid #6b7280;
      height: 1px;
      margin-bottom: 3px;
    }

    .sig-date {
      font-size: 12px;
      color: #374151;
      white-space: nowrap;
    }

    /* ── Footer note ── */
    .footer-note {
      margin-top: 24px;
      padding-top: 12px;
      border-top: 1px solid #e5e7eb;
      font-size: 11px;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <header class="brand-masthead">
    <div class="brand-bar">
      ${grantPipeReportLogo}
      <span class="brand-kicker">Prepared report</span>
    </div>
    <div class="report-header">
      <div class="report-header-grid">
        <div class="report-header-main">
          <p class="org-name">${escapedOrgName}</p>
          <h1 class="report-title">${escapedTitle}</h1>
          ${subtitleHtml}
          <div class="report-meta">
            ${periodHtml}
            ${addressHtml}
            ${einHtml}
          </div>
        </div>
        ${logoHtml}
      </div>
    </div>
  </header>

  ${sectionsHtml}

  ${attestationHtml}

  ${footerNoteHtml}
</body>
</html>`;
}

// ─── computeCurrentFiscalQuarterLabel ────────────────────────────────────────

export function computeCurrentFiscalQuarterLabel(fiscalYearStartMonth: number, now: Date): string {
  if (
    !Number.isInteger(fiscalYearStartMonth) ||
    fiscalYearStartMonth < 1 ||
    fiscalYearStartMonth > 12
  ) {
    throw new Error(
      `fiscalYearStartMonth must be an integer between 1 and 12, got ${fiscalYearStartMonth}`,
    );
  }

  const nowYear = now.getFullYear();
  const nowMonth0 = now.getMonth(); // 0-based
  const fyStart0 = fiscalYearStartMonth - 1; // 0-based

  // Determine the calendar year in which the current FY started.
  // If we haven't yet reached the FY start month this calendar year, the FY started last year.
  let fyStartCalYear: number;
  if (nowMonth0 >= fyStart0) {
    fyStartCalYear = nowYear;
  } else {
    fyStartCalYear = nowYear - 1;
  }

  // The FY label = the calendar year in which the FY ENDS.
  // The FY runs for 12 months starting from fyStart0 of fyStartCalYear.
  // It ends on (fyStart0 - 1 + 12) % 12 of (fyStartCalYear + 1).
  const fyEndCalYear = fyStartCalYear + 1;
  // Special case: if FY starts in January, it ends in December of the same calendar year.
  const fyLabel = fyStart0 === 0 ? fyStartCalYear : fyEndCalYear;

  // Months elapsed since fiscal year start (0-based within FY).
  const monthsElapsed = nowMonth0 >= fyStart0 ? nowMonth0 - fyStart0 : 12 - fyStart0 + nowMonth0;

  // Q1=0–2, Q2=3–5, Q3=6–8, Q4=9–11 months within FY
  const quarterIndex = Math.floor(monthsElapsed / 3); // 0-based
  const quarterNumber = quarterIndex + 1;

  // Compute the start month of this quarter (0-based absolute calendar month within FY)
  const qStartMonthOffsetInFY = quarterIndex * 3; // 0, 3, 6, or 9
  const qStartMonth0 = (fyStart0 + qStartMonthOffsetInFY) % 12;
  const qStartYear = fyStart0 + qStartMonthOffsetInFY < 12 ? fyStartCalYear : fyEndCalYear;

  // End month = start + 2 months (0-based)
  const qEndMonth0 = (qStartMonth0 + 2) % 12;
  const qEndYear = qStartMonth0 + 2 < 12 ? qStartYear : qStartYear + 1;

  // Last day of end month
  const qEndDay = new Date(qEndYear, qEndMonth0 + 1, 0).getDate();

  // Format: "Mon D – Mon D, YYYY" — year only appears once, at the end.
  const startLabel = fmtDateShort(qStartMonth0, 1);
  const endLabel = fmtDateLong(qEndYear, qEndMonth0, qEndDay);

  return `FY${fyLabel} Q${quarterNumber} (${startLabel} \u2013 ${endLabel})`;
}
