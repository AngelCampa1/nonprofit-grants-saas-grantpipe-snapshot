import { describe, it, expect } from "vitest";
import {
  renderReportDocument,
  computeCurrentFiscalQuarterLabel,
  type ReportDocumentInput,
  type ReportSection,
} from "./report-template";

// ─── Helpers ────────────────────────────────────────────────────────────────

function baseInput(overrides: Partial<ReportDocumentInput> = {}): ReportDocumentInput {
  return {
    org: { name: "Acme Nonprofit" },
    title: "Annual Compliance Report",
    sections: [],
    ...overrides,
  };
}

// ─── renderReportDocument ────────────────────────────────────────────────────

describe("renderReportDocument", () => {
  it("returns a valid HTML document starting with <!doctype html>", () => {
    const html = renderReportDocument(baseInput());
    expect(html.trimStart().toLowerCase()).toMatch(/^<!doctype html>/);
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
  });

  it("renders org name in the header", () => {
    const html = renderReportDocument(baseInput({ org: { name: "River Valley Foundation" } }));
    expect(html).toContain("River Valley Foundation");
  });

  it("uses GrantPipe brand colors in the report top treatment", () => {
    const html = renderReportDocument(baseInput());
    expect(html).toContain("background: #047857");
    expect(html).toContain("border-top: 4px solid #d99a18");
    expect(html).toContain("color: #047857");
    expect(html).toContain("background: #fffdf8");
  });

  it("renders the inline GrantPipe logo mark and wordmark in the report masthead", () => {
    const html = renderReportDocument(
      baseInput({
        org: { name: "River Valley Foundation" },
        title: "Grant Compliance Report",
      }),
    );
    expect(html).toContain('data-report-brand-logo="true"');
    expect(html).toContain('data-logo-mark="grantpipe-mark"');
    expect(html).toContain('fill="#047857"');
    expect(html).toContain('fill="#ffffff"');
    expect(html).toContain('fill="#d99a18"');
    expect(html).toContain('data-gold-accent="1"');
    expect(html).toContain('data-gold-accent="2"');
    expect(html).toContain('class="brand-wordmark">GrantPipe</span>');
    expect(html).toContain('class="brand-kicker">Prepared report</span>');
    expect(html).toContain("River Valley Foundation");
    expect(html).toContain("Grant Compliance Report");
  });

  it("does not render the old text-only GrantPipe masthead", () => {
    const html = renderReportDocument(baseInput());
    expect(html).not.toContain(
      '<div class="brand-bar">\n      <span class="brand-wordmark">GrantPipe</span>',
    );
  });

  it("keeps safe org metadata inside the branded report header without remote logos", () => {
    const html = renderReportDocument(
      baseInput({
        org: {
          name: "Acme Nonprofit",
          logoUrl: "https://cdn.example.test/acme-logo.png",
          address: "123 Main St, Cincinnati, OH 45202",
          ein: "12-3456789",
        },
        periodLabel: "FY2026 Q2",
      }),
    );
    expect(html).not.toContain("https://cdn.example.test/acme-logo.png");
    expect(html).not.toContain('class="org-logo"');
    expect(html).toContain("123 Main St, Cincinnati, OH 45202");
    expect(html).toContain("EIN: 12-3456789");
    expect(html).toContain("FY2026 Q2");
  });

  it("renders report title", () => {
    const html = renderReportDocument(baseInput({ title: "Grant Compliance Report FY2026" }));
    expect(html).toContain("Grant Compliance Report FY2026");
  });

  it("renders subtitle when provided", () => {
    const html = renderReportDocument(baseInput({ subtitle: "Year-End Summary" }));
    expect(html).toContain("Year-End Summary");
  });

  it("omits subtitle when not provided", () => {
    const html = renderReportDocument(baseInput({ subtitle: undefined }));
    // Should not have an empty subtitle element — just check no blank subtitle tag
    expect(html).not.toContain('class="subtitle"');
  });

  it("renders period label in a badge when provided", () => {
    const html = renderReportDocument(
      baseInput({ periodLabel: "FY2026 Q2 (Jan 1 – Mar 31, 2026)" }),
    );
    expect(html).toContain("FY2026 Q2 (Jan 1 \u2013 Mar 31, 2026)");
    expect(html).toContain('class="period-badge"');
  });

  it("omits period badge when periodLabel is absent", () => {
    const html = renderReportDocument(baseInput({ periodLabel: undefined }));
    expect(html).not.toContain('class="period-badge"');
  });

  it("renders EIN when present", () => {
    const html = renderReportDocument(baseInput({ org: { name: "Acme", ein: "12-3456789" } }));
    expect(html).toContain("EIN: 12-3456789");
  });

  it("omits EIN when null", () => {
    const html = renderReportDocument(baseInput({ org: { name: "Acme", ein: null } }));
    expect(html).not.toContain("EIN:");
  });

  it("omits EIN when undefined", () => {
    const html = renderReportDocument(baseInput({ org: { name: "Acme" } }));
    expect(html).not.toContain("EIN:");
  });

  it("renders org address when present", () => {
    const html = renderReportDocument(
      baseInput({ org: { name: "Acme", address: "123 Main St, Cincinnati, OH 45202" } }),
    );
    expect(html).toContain("123 Main St, Cincinnati, OH 45202");
  });

  it("omits org address when null", () => {
    const html = renderReportDocument(baseInput({ org: { name: "Acme", address: null } }));
    expect(html).not.toContain("123 Main St");
  });

  it("includes @page CSS with Letter size", () => {
    const html = renderReportDocument(baseInput());
    expect(html).toContain("@page");
    expect(html).toContain("Letter");
    expect(html).toContain("0.6in");
  });

  it("uses system font stack (no external fonts)", () => {
    const html = renderReportDocument(baseInput());
    expect(html).toContain("system-ui");
    expect(html).toContain("-apple-system");
  });

  // ─── keyValue section ───────────────────────────────────────────────────

  it("renders keyValue section heading and rows", () => {
    const section: ReportSection = {
      kind: "keyValue",
      heading: "Grant Details",
      rows: [
        { label: "Funder", value: "Gates Foundation" },
        { label: "Amount", value: "$50,000" },
      ],
    };
    const html = renderReportDocument(baseInput({ sections: [section] }));
    expect(html).toContain("Grant Details");
    expect(html).toContain("Funder");
    expect(html).toContain("Gates Foundation");
    expect(html).toContain("Amount");
    expect(html).toContain("$50,000");
  });

  it("renders keyValue section as a table", () => {
    const section: ReportSection = {
      kind: "keyValue",
      heading: "Details",
      rows: [{ label: "Status", value: "Active" }],
    };
    const html = renderReportDocument(baseInput({ sections: [section] }));
    expect(html).toContain("<table");
    expect(html).toContain("<td");
  });

  // ─── table section ──────────────────────────────────────────────────────

  it("renders table section with heading, columns, and rows", () => {
    const section: ReportSection = {
      kind: "table",
      heading: "Transaction Ledger",
      columns: ["Date", "Description", "Amount"],
      rows: [
        ["2026-01-15", "Payroll", "$12,000"],
        ["2026-02-01", "Supplies", "$3,500"],
      ],
    };
    const html = renderReportDocument(baseInput({ sections: [section] }));
    expect(html).toContain("Transaction Ledger");
    expect(html).toContain("Date");
    expect(html).toContain("Description");
    expect(html).toContain("Amount");
    expect(html).toContain("Payroll");
    expect(html).toContain("$12,000");
    expect(html).toContain("<thead");
    expect(html).toContain("<tbody");
  });

  it("renders table totals row in tfoot when provided", () => {
    const section: ReportSection = {
      kind: "table",
      heading: "Summary",
      columns: ["Category", "Total"],
      rows: [["Program", "$10,000"]],
      totalsRow: ["Total", "$10,000"],
    };
    const html = renderReportDocument(baseInput({ sections: [section] }));
    expect(html).toContain("<tfoot");
    expect(html).toContain("$10,000");
  });

  it("omits tfoot when totalsRow is absent", () => {
    const section: ReportSection = {
      kind: "table",
      heading: "Summary",
      columns: ["Category", "Total"],
      rows: [["Program", "$10,000"]],
    };
    const html = renderReportDocument(baseInput({ sections: [section] }));
    expect(html).not.toContain("<tfoot");
  });

  // ─── list section ───────────────────────────────────────────────────────

  it("renders list items", () => {
    const section: ReportSection = {
      kind: "list",
      heading: "Required Documents",
      items: ["Audit Report", "990 Form", "Board Minutes"],
      emptyText: "No documents required.",
    };
    const html = renderReportDocument(baseInput({ sections: [section] }));
    expect(html).toContain("Required Documents");
    expect(html).toContain("Audit Report");
    expect(html).toContain("990 Form");
    expect(html).toContain("Board Minutes");
    expect(html).toContain("<ul");
    expect(html).toContain("<li");
  });

  it("renders emptyText when list items is empty", () => {
    const section: ReportSection = {
      kind: "list",
      heading: "Required Documents",
      items: [],
      emptyText: "No documents required.",
    };
    const html = renderReportDocument(baseInput({ sections: [section] }));
    expect(html).toContain("No documents required.");
    expect(html).not.toContain("<li");
  });

  // ─── checklist section ──────────────────────────────────────────────────

  it("renders ☑ for done checklist items", () => {
    const section: ReportSection = {
      kind: "checklist",
      heading: "Compliance Checklist",
      items: [
        { label: "Submit 990", done: true },
        { label: "File audit", done: false },
      ],
    };
    const html = renderReportDocument(baseInput({ sections: [section] }));
    expect(html).toContain("☑");
    expect(html).toContain("☐");
    expect(html).toContain("Submit 990");
    expect(html).toContain("File audit");
  });

  it("renders muted text when checklist items is empty", () => {
    const section: ReportSection = {
      kind: "checklist",
      heading: "Compliance Checklist",
      items: [],
    };
    const html = renderReportDocument(baseInput({ sections: [section] }));
    expect(html).toContain("No items recorded.");
  });

  // ─── paragraph section ──────────────────────────────────────────────────

  it("renders paragraph text", () => {
    const section: ReportSection = {
      kind: "paragraph",
      text: "This report covers fiscal year 2026.",
    };
    const html = renderReportDocument(baseInput({ sections: [section] }));
    expect(html).toContain("This report covers fiscal year 2026.");
    expect(html).toContain("<p");
  });

  it("renders optional paragraph heading when provided", () => {
    const section: ReportSection = {
      kind: "paragraph",
      heading: "Executive Summary",
      text: "This report covers fiscal year 2026.",
    };
    const html = renderReportDocument(baseInput({ sections: [section] }));
    expect(html).toContain("Executive Summary");
    expect(html).toContain("<h2");
  });

  it("renders paragraph without heading when heading is omitted", () => {
    const section: ReportSection = {
      kind: "paragraph",
      text: "Plain text paragraph.",
    };
    const html = renderReportDocument(baseInput({ sections: [section] }));
    // No h2 at all since no sections have headings
    expect(html).not.toContain("<h2");
    expect(html).toContain("Plain text paragraph.");
  });

  it("preserves line breaks in paragraph text for letter-style sections", () => {
    const section: ReportSection = {
      kind: "paragraph",
      heading: "Closing",
      text: "With gratitude,\nAcme Nonprofit",
    };
    const html = renderReportDocument(baseInput({ sections: [section] }));

    expect(html).toContain("With gratitude,\nAcme Nonprofit");
    expect(html).toContain("white-space: pre-line");
  });

  // ─── attestation ────────────────────────────────────────────────────────

  it("renders attestation block when provided", () => {
    const html = renderReportDocument(
      baseInput({
        attestation: {
          lineLabels: ["Executive Director", "Board Chair"],
        },
      }),
    );
    expect(html).toContain("Executive Director");
    expect(html).toContain("Board Chair");
    expect(html).toContain("Date:");
  });

  it("omits attestation block when not provided", () => {
    const html = renderReportDocument(baseInput({ attestation: undefined }));
    expect(html).not.toContain("Date:");
  });

  // ─── footer ─────────────────────────────────────────────────────────────

  it("includes CSS page counter for pagination", () => {
    const html = renderReportDocument(baseInput());
    expect(html).toContain("counter(page)");
    expect(html).toContain("counter(pages)");
  });

  it("includes org name in footer CSS", () => {
    const html = renderReportDocument(baseInput({ org: { name: "River Valley Foundation" } }));
    expect(html).toContain("River Valley Foundation");
  });

  // ─── footerNote ─────────────────────────────────────────────────────────

  it("renders footerNote when provided", () => {
    const html = renderReportDocument(
      baseInput({ footerNote: "Confidential — not for public distribution." }),
    );
    expect(html).toContain("Confidential — not for public distribution.");
  });

  it("omits footerNote element when not provided", () => {
    const html = renderReportDocument(baseInput({ footerNote: undefined }));
    expect(html).not.toContain('class="footer-note"');
  });

  // ─── HTML escaping ──────────────────────────────────────────────────────

  it("escapes <script> tags in org name", () => {
    const html = renderReportDocument(
      baseInput({ org: { name: "<script>alert('xss')</script>" } }),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes double quotes in values", () => {
    const section: ReportSection = {
      kind: "keyValue",
      heading: "Details",
      rows: [{ label: "Name", value: 'He said "hello"' }],
    };
    const html = renderReportDocument(baseInput({ sections: [section] }));
    expect(html).not.toContain('"hello"');
    expect(html).toContain("&quot;hello&quot;");
  });

  it("escapes ampersands in values", () => {
    const section: ReportSection = {
      kind: "keyValue",
      heading: "Details",
      rows: [{ label: "Org", value: "Smith & Jones Foundation" }],
    };
    const html = renderReportDocument(baseInput({ sections: [section] }));
    expect(html).toContain("Smith &amp; Jones Foundation");
  });

  it("escapes single quotes in org name", () => {
    const html = renderReportDocument(baseInput({ org: { name: "O'Brien Foundation" } }));
    expect(html).toContain("O&#39;Brien Foundation");
  });

  it("contains no external URLs even when a remote logoUrl is provided", () => {
    const html = renderReportDocument({
      ...baseInput(),
      org: { ...baseInput().org, logoUrl: "https://example.com/logo.png" },
    });
    const matches = html.match(/https?:\/\//gi) ?? [];
    expect(matches.length).toBe(0);
  });

  it("contains no external URLs when logoUrl is not provided", () => {
    const html = renderReportDocument({
      ...baseInput(),
      org: { ...baseInput().org, logoUrl: null },
    });
    expect(html).not.toMatch(/https?:\/\//i);
  });

  it("does not render remote logo URLs as img tags", () => {
    const html = renderReportDocument(
      baseInput({ org: { name: "Acme", logoUrl: "https://example.com/logo.png" } }),
    );
    expect(html).not.toContain("<img");
    expect(html).not.toContain("https://example.com/logo.png");
  });

  it("omits img tag when logoUrl is null", () => {
    const html = renderReportDocument(baseInput({ org: { name: "Acme", logoUrl: null } }));
    expect(html).not.toContain("<img");
  });

  it("handles empty sections array and returns valid HTML", () => {
    const html = renderReportDocument(baseInput({ sections: [] }));
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("</html>");
  });

  it("renders multiple sections in order", () => {
    const sections: ReportSection[] = [
      { kind: "paragraph", heading: "First", text: "First section text." },
      { kind: "paragraph", heading: "Second", text: "Second section text." },
    ];
    const html = renderReportDocument(baseInput({ sections }));
    const firstIdx = html.indexOf("First section text.");
    const secondIdx = html.indexOf("Second section text.");
    expect(firstIdx).toBeLessThan(secondIdx);
  });

  it("each section is wrapped in a <section> tag", () => {
    const sections: ReportSection[] = [{ kind: "paragraph", text: "Section one." }];
    const html = renderReportDocument(baseInput({ sections }));
    expect(html).toContain("<section");
  });
});

// ─── computeCurrentFiscalQuarterLabel ────────────────────────────────────────

describe("computeCurrentFiscalQuarterLabel", () => {
  it("FY Jan 1, now Feb 15 2026 → FY2026 Q1 (Jan 1 – Mar 31, 2026)", () => {
    const result = computeCurrentFiscalQuarterLabel(1, new Date(2026, 1, 15));
    expect(result).toBe("FY2026 Q1 (Jan 1 – Mar 31, 2026)");
  });

  it("FY Jan 1, now May 1 2026 → FY2026 Q2 (Apr 1 – Jun 30, 2026)", () => {
    const result = computeCurrentFiscalQuarterLabel(1, new Date(2026, 4, 1));
    expect(result).toBe("FY2026 Q2 (Apr 1 – Jun 30, 2026)");
  });

  it("FY Jan 1, now Dec 31 2026 → FY2026 Q4 (Oct 1 – Dec 31, 2026)", () => {
    const result = computeCurrentFiscalQuarterLabel(1, new Date(2026, 11, 31));
    expect(result).toBe("FY2026 Q4 (Oct 1 – Dec 31, 2026)");
  });

  it("FY Jul 1, now Sep 15 2025 → FY2026 Q1 (Jul 1 – Sep 30, 2025)", () => {
    const result = computeCurrentFiscalQuarterLabel(7, new Date(2025, 8, 15));
    expect(result).toBe("FY2026 Q1 (Jul 1 – Sep 30, 2025)");
  });

  it("FY Oct 1, now Oct 15 2025 → FY2026 Q1 (Oct 1 – Dec 31, 2025)", () => {
    const result = computeCurrentFiscalQuarterLabel(10, new Date(2025, 9, 15));
    expect(result).toBe("FY2026 Q1 (Oct 1 – Dec 31, 2025)");
  });

  it("FY Oct 1, now Jan 15 2026 → FY2026 Q2 (Jan 1 – Mar 31, 2026)", () => {
    const result = computeCurrentFiscalQuarterLabel(10, new Date(2026, 0, 15));
    expect(result).toBe("FY2026 Q2 (Jan 1 – Mar 31, 2026)");
  });

  it("FY Oct 1, now Sep 30 2026 → FY2026 Q4 (Jul 1 – Sep 30, 2026)", () => {
    const result = computeCurrentFiscalQuarterLabel(10, new Date(2026, 8, 30));
    expect(result).toBe("FY2026 Q4 (Jul 1 – Sep 30, 2026)");
  });

  it("FY Jan 1, now Aug 15 2026 → FY2026 Q3 (Jul 1 – Sep 30, 2026)", () => {
    const result = computeCurrentFiscalQuarterLabel(1, new Date(2026, 7, 15));
    expect(result).toBe("FY2026 Q3 (Jul 1 – Sep 30, 2026)");
  });

  it("FY Apr 1, now Mar 15 2026 → correct quarter (within same calendar year FY start)", () => {
    // FY Apr 2025 – Mar 2026. now = Mar 15, 2026 → before Apr in same calendar year
    // So FY started Apr 2025, ends Mar 2026 → FY2026 Q4
    // Q1 = Apr–Jun 2025, Q2 = Jul–Sep 2025, Q3 = Oct–Dec 2025, Q4 = Jan–Mar 2026
    const result = computeCurrentFiscalQuarterLabel(4, new Date(2026, 2, 15));
    expect(result).toBe("FY2026 Q4 (Jan 1 – Mar 31, 2026)");
  });

  it("FY Apr 1, now Apr 1 2026 → FY2027 Q1 (Apr 1 – Jun 30, 2026)", () => {
    // FY starts Apr 2026, ends Mar 2027 → FY2027 Q1
    const result = computeCurrentFiscalQuarterLabel(4, new Date(2026, 3, 1));
    expect(result).toBe("FY2027 Q1 (Apr 1 – Jun 30, 2026)");
  });

  it("FY Nov 1, now Nov 15 2025 → FY2026 Q1 (Nov 1 – Jan 31, 2026) — quarter end wraps calendar year", () => {
    // Q1 of FY starting Nov 2025: Nov, Dec 2025, Jan 2026
    // FY ends Oct 2026 → FY2026
    const result = computeCurrentFiscalQuarterLabel(11, new Date(2025, 10, 15));
    expect(result).toBe("FY2026 Q1 (Nov 1 – Jan 31, 2026)");
  });

  it("throws when fiscalYearStartMonth is 0", () => {
    expect(() => computeCurrentFiscalQuarterLabel(0, new Date(2026, 0, 1))).toThrow(
      "fiscalYearStartMonth must be an integer between 1 and 12, got 0",
    );
  });

  it("throws when fiscalYearStartMonth is 13", () => {
    expect(() => computeCurrentFiscalQuarterLabel(13, new Date(2026, 0, 1))).toThrow(
      "fiscalYearStartMonth must be an integer between 1 and 12, got 13",
    );
  });

  it("throws when fiscalYearStartMonth is not an integer (1.5)", () => {
    expect(() => computeCurrentFiscalQuarterLabel(1.5, new Date(2026, 0, 1))).toThrow(
      "fiscalYearStartMonth must be an integer between 1 and 12, got 1.5",
    );
  });
});

// ─── Security and robustness ──────────────────────────────────────────────────

describe("CSS injection guard (escapeCssString)", () => {
  it("backslash in org name produces escaped CSS — no unclosed string", () => {
    const html = renderReportDocument(baseInput({ org: { name: "Acme\\Evil" } }));
    // In the CSS @bottom-left content, the backslash must be doubled
    expect(html).toContain('content: "Acme\\\\Evil"');
    // The raw single backslash followed by a quote must not appear (which would break CSS)
    expect(html).not.toMatch(/content: "Acme\\[^\\]/);
  });

  it("double-quote in title produces safe CSS — no unclosed string", () => {
    const html = renderReportDocument(baseInput({ title: 'Report "FY2026"' }));
    // double-quotes are HTML-escaped to &quot; before entering the CSS string,
    // so the CSS content value never contains a raw unescaped double-quote that
    // would prematurely close the CSS string literal
    expect(html).toContain('content: "Report &quot;FY2026&quot;"');
  });

  it("backslash in title is escaped in CSS but HTML title uses HTML-escaped value", () => {
    // 'A\\B' in JS source = the 2-char string A\B
    const html = renderReportDocument(baseInput({ title: "A\\B" }));
    // CSS @bottom-right content must double the backslash
    expect(html).toContain('content: "A\\\\B"');
    // HTML <title> element passes through the backslash unchanged (HTML has no backslash entity)
    expect(html).toContain("<title>A\\B</title>");
  });
});

describe("logo URL safety (isSafeImageUrl)", () => {
  it("does NOT render img tag for javascript: URL", () => {
    const html = renderReportDocument(
      baseInput({ org: { name: "Acme", logoUrl: "javascript:alert(1)" } }),
    );
    expect(html).not.toContain("<img");
  });

  it("does NOT render img tag for data:text/html URL", () => {
    const html = renderReportDocument(
      baseInput({ org: { name: "Acme", logoUrl: "data:text/html,<script>alert(1)</script>" } }),
    );
    expect(html).not.toContain("<img");
  });

  it("does NOT render img tag for https:// URL", () => {
    const html = renderReportDocument(
      baseInput({ org: { name: "Acme", logoUrl: "https://cdn.example.com/logo.png" } }),
    );
    expect(html).not.toContain("<img");
    expect(html).not.toContain("https://cdn.example.com/logo.png");
  });

  it("does NOT render img tag for http:// URL", () => {
    const html = renderReportDocument(
      baseInput({ org: { name: "Acme", logoUrl: "http://cdn.example.com/logo.png" } }),
    );
    expect(html).not.toContain("<img");
  });

  it("does NOT render img tag for localhost URL", () => {
    const html = renderReportDocument(
      baseInput({ org: { name: "Acme", logoUrl: "https://localhost/logo.png" } }),
    );
    expect(html).not.toContain("<img");
  });

  it("renders img tag for relative URL starting with /", () => {
    const html = renderReportDocument(
      baseInput({ org: { name: "Acme", logoUrl: "/static/logo.png" } }),
    );
    expect(html).toContain("<img");
    expect(html).toContain("/static/logo.png");
  });

  it("does NOT render img tag for protocol-relative URL (//evil.com/logo.png)", () => {
    const html = renderReportDocument(
      baseInput({ org: { name: "Acme", logoUrl: "//evil.com/logo.png" } }),
    );
    expect(html).not.toContain("<img");
  });

  it("renders img tag for data:image/ URL", () => {
    const html = renderReportDocument(
      baseInput({ org: { name: "Acme", logoUrl: "data:image/png;base64,abc123" } }),
    );
    expect(html).toContain("<img");
  });
});

describe("renderTable row/column count mismatch", () => {
  it("trims rows with more cells than columns — extra cell content absent from output", () => {
    const section: ReportSection = {
      kind: "table",
      heading: "Ledger",
      columns: ["Date", "Amount"],
      rows: [["2026-01-01", "$100", "EXTRA_CELL_CONTENT"]],
    };
    const html = renderReportDocument(baseInput({ sections: [section] }));
    expect(html).toContain("2026-01-01");
    expect(html).toContain("$100");
    expect(html).not.toContain("EXTRA_CELL_CONTENT");
  });

  it("renders rows with fewer cells than columns without error", () => {
    const section: ReportSection = {
      kind: "table",
      heading: "Ledger",
      columns: ["Date", "Amount", "Notes"],
      rows: [["2026-01-01", "$100"]],
    };
    const html = renderReportDocument(baseInput({ sections: [section] }));
    expect(html).toContain("2026-01-01");
    expect(html).toContain("$100");
  });
});
