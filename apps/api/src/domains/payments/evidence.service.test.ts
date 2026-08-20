import { describe, it, expect, vi } from "vitest";
import type { Database } from "@grantpipe/db";

import {
  getEvidenceManifest,
  getGrantPaymentSummary,
  renderEvidencePacketPdf,
} from "./evidence.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: "req-1",
    orgId: "org-1",
    grantId: "grant-1",
    requestNumber: 1,
    type: "reimbursement",
    status: "approved",
    periodStart: null,
    periodEnd: null,
    submittedAt: null,
    approvedAt: new Date("2026-03-01"),
    rejectedAt: null,
    closedAt: null,
    requestedAmountCents: 10000,
    approvedAmountCents: 9500,
    funderReference: "REF-001",
    notes: null,
    autoPostJournalEntry: false,
    createdBy: "user-1",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-03-01"),
    deletedAt: null,
    grant: { id: "grant-1", name: "Community Support Grant" },
    lines: [
      { id: "line-1", amountCents: 5000, description: "Salaries", deletedAt: null },
      { id: "line-2", amountCents: 5000, description: "Supplies", deletedAt: null },
    ],
    adjustments: [
      {
        id: "adj-1",
        kind: "reduction",
        amountCents: 500,
        reason: "Receipt missing",
        deletedAt: null,
      },
    ],
    payments: [
      { id: "pay-1", amountCents: 9500, receivedDate: new Date("2026-03-15"), deletedAt: null },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getEvidenceManifest
// ---------------------------------------------------------------------------

describe("getEvidenceManifest", () => {
  it("returns full manifest with all components", async () => {
    const request = makeRequest();
    const activityEntries = [
      {
        id: "act-1",
        orgId: "org-1",
        entityType: "payment_request",
        entityId: "req-1",
        action: "created",
        actorId: "user-1",
        createdAt: new Date("2026-01-01"),
      },
    ];
    const linkedDocs = [
      {
        id: "doc-1",
        orgId: "org-1",
        entityType: "payment_request",
        entityId: "req-1",
        filename: "invoice.pdf",
        fileKey: "key/invoice.pdf",
        mimeType: "application/pdf",
        sizeBytes: 12345,
        uploadedBy: "user-1",
        createdAt: new Date(),
        deletedAt: null,
      },
    ];

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue(activityEntries),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(linkedDocs),
          }),
        }),
    } as unknown as Database;

    const result = await getEvidenceManifest(db, { orgId: "org-1", requestId: "req-1" });

    expect(result.request.id).toBe("req-1");
    expect(result.request.grant).toEqual({ id: "grant-1", name: "Community Support Grant" });
    expect(result.lines).toHaveLength(2);
    expect(result.adjustments).toHaveLength(1);
    expect(result.payments).toHaveLength(1);
    expect(result.activityHistory).toHaveLength(1);
    expect(result.linkedDocuments).toHaveLength(1);
    expect(result.generatedAt).toBeDefined();
  });

  it("queries adjustment activity for evidence packets", async () => {
    const request = makeRequest();
    const activityWhere = vi.fn().mockReturnValue({
      orderBy: vi.fn().mockResolvedValue([]),
    });
    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: activityWhere,
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
    } as unknown as Database;

    await getEvidenceManifest(db, { orgId: "org-1", requestId: "req-1" });

    const seen = new WeakSet<object>();
    const conditionText = JSON.stringify(activityWhere.mock.calls[0]?.[0], (_key, value) => {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) return "[Circular]";
        seen.add(value);
      }
      if (typeof value === "function") return "[Function]";
      return value;
    });
    expect(conditionText).toContain("payment_request_adjustment");
    expect(conditionText).toContain("adj-1");
  });

  it("throws notFound when request not found", async () => {
    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    } as unknown as Database;

    await expect(
      getEvidenceManifest(db, { orgId: "org-1", requestId: "bad" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("handles request with no lines, adjustments, or payments", async () => {
    const request = makeRequest({ lines: [], adjustments: [], payments: [] });
    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
    } as unknown as Database;

    const result = await getEvidenceManifest(db, { orgId: "org-1", requestId: "req-1" });

    expect(result.lines).toHaveLength(0);
    expect(result.adjustments).toHaveLength(0);
    expect(result.payments).toHaveLength(0);
    expect(result.activityHistory).toHaveLength(0);
    expect(result.linkedDocuments).toHaveLength(0);
  });

  it("handles null grant gracefully", async () => {
    const request = makeRequest({ grant: null });
    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
    } as unknown as Database;

    const result = await getEvidenceManifest(db, { orgId: "org-1", requestId: "req-1" });
    expect(result.request.grant).toBeNull();
  });

  it("includes generatedAt as ISO string", async () => {
    const request = makeRequest();
    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
    } as unknown as Database;

    const before = new Date().toISOString();
    const result = await getEvidenceManifest(db, { orgId: "org-1", requestId: "req-1" });
    const after = new Date().toISOString();

    expect(result.generatedAt >= before).toBe(true);
    expect(result.generatedAt <= after).toBe(true);
  });

  it("includes all request fields in the manifest", async () => {
    const request = makeRequest();
    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
    } as unknown as Database;

    const result = await getEvidenceManifest(db, { orgId: "org-1", requestId: "req-1" });

    expect(result.request).toMatchObject({
      id: "req-1",
      orgId: "org-1",
      grantId: "grant-1",
      requestNumber: 1,
      type: "reimbursement",
      status: "approved",
      requestedAmountCents: 10000,
      approvedAmountCents: 9500,
      funderReference: "REF-001",
      autoPostJournalEntry: false,
    });
  });
});

// ---------------------------------------------------------------------------
// getGrantPaymentSummary
// ---------------------------------------------------------------------------

describe("getGrantPaymentSummary", () => {
  it("returns aggregated summary for a grant", async () => {
    const summaryRow = {
      totalRequestedCents: "50000",
      totalApprovedCents: "45000",
      requestCount: "3",
    };
    const paymentRow = {
      totalPaidCents: "30000",
      lastPaymentDate: new Date("2026-03-15"),
    };

    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([summaryRow]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([paymentRow]),
          }),
        }),
    } as unknown as Database;

    const result = await getGrantPaymentSummary(db, { orgId: "org-1", grantId: "grant-1" });

    expect(result.totalRequestedCents).toBe(50000);
    expect(result.totalApprovedCents).toBe(45000);
    expect(result.totalPaidCents).toBe(30000);
    expect(result.outstandingCents).toBe(15000); // 45000 - 30000
    expect(result.requestCount).toBe(3);
    expect(result.lastPaymentDate).toBeInstanceOf(Date);
  });

  it("only counts approved-or-later requests toward totalApprovedCents", async () => {
    // Regression: rejected/draft/submitted requests retain a stale
    // approvedAmountCents that must NOT inflate the grant's approved total or
    // outstanding balance. The aggregate guards the sum with a status filter.
    const selectArgs: Record<string, unknown>[] = [];
    const db = {
      select: vi.fn().mockImplementation((projection: Record<string, unknown>) => {
        selectArgs.push(projection);
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{}]),
          }),
        };
      }),
    } as unknown as Database;

    await getGrantPaymentSummary(db, { orgId: "org-1", grantId: "grant-1" });

    // Drizzle SQL templates hold a circular column ref, so flatten only the raw
    // string chunks to inspect the literal SQL text.
    const rawSql = (value: unknown): string => {
      const chunks = (value as { queryChunks?: { value?: string[] }[] })?.queryChunks ?? [];
      return chunks.flatMap((chunk) => chunk?.value ?? []).join(" ");
    };

    const approvedSql = rawSql(selectArgs[0]?.totalApprovedCents);
    expect(approvedSql).toContain("CASE WHEN");
    expect(approvedSql).toContain("approved");
    expect(approvedSql).toContain("partially_approved");
    expect(approvedSql).toContain("paid");
    expect(approvedSql).toContain("closed");
    // The bare requested-amount sum stays unguarded for contrast.
    expect(rawSql(selectArgs[0]?.totalRequestedCents)).not.toContain("CASE");
  });

  it("returns zeros and null lastPaymentDate when no data", async () => {
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([undefined]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([undefined]),
          }),
        }),
    } as unknown as Database;

    const result = await getGrantPaymentSummary(db, { orgId: "org-1", grantId: "grant-1" });

    expect(result.totalRequestedCents).toBe(0);
    expect(result.totalApprovedCents).toBe(0);
    expect(result.totalPaidCents).toBe(0);
    expect(result.outstandingCents).toBe(0);
    expect(result.requestCount).toBe(0);
    expect(result.lastPaymentDate).toBeNull();
  });

  it("outstandingCents is 0 when paid exceeds approved", async () => {
    const summaryRow = {
      totalRequestedCents: "5000",
      totalApprovedCents: "3000",
      requestCount: "1",
    };
    const paymentRow = { totalPaidCents: "5000", lastPaymentDate: new Date() };

    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([summaryRow]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([paymentRow]),
          }),
        }),
    } as unknown as Database;

    const result = await getGrantPaymentSummary(db, { orgId: "org-1", grantId: "grant-1" });
    expect(result.outstandingCents).toBe(0);
  });

  it("handles null lastPaymentDate from DB", async () => {
    const summaryRow = {
      totalRequestedCents: "1000",
      totalApprovedCents: "1000",
      requestCount: "1",
    };
    const paymentRow = { totalPaidCents: "0", lastPaymentDate: null };

    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([summaryRow]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([paymentRow]),
          }),
        }),
    } as unknown as Database;

    const result = await getGrantPaymentSummary(db, { orgId: "org-1", grantId: "grant-1" });
    expect(result.lastPaymentDate).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getEvidenceManifest — null coalescing branch coverage
// ---------------------------------------------------------------------------

describe("getEvidenceManifest — undefined lines/payments/adjustments", () => {
  it("handles undefined lines and payments on request object", async () => {
    // Simulate DB returning request without lines/payments/adjustments properties
    const request = {
      id: "req-1",
      orgId: "org-1",
      grantId: "grant-1",
      requestNumber: 1,
      type: "reimbursement",
      status: "draft",
      periodStart: null,
      periodEnd: null,
      submittedAt: null,
      approvedAt: null,
      rejectedAt: null,
      closedAt: null,
      requestedAmountCents: 0,
      approvedAmountCents: 0,
      funderReference: null,
      notes: null,
      autoPostJournalEntry: false,
      createdBy: "user-1",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
      deletedAt: null,
      grant: { id: "grant-1", name: "Test Grant" },
      // lines, adjustments, payments are intentionally omitted (undefined)
    };

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
    } as unknown as Database;

    const result = await getEvidenceManifest(db, { orgId: "org-1", requestId: "req-1" });

    expect(result.lines).toEqual([]);
    expect(result.adjustments).toEqual([]);
    expect(result.payments).toEqual([]);
    expect(result.activityHistory).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// renderEvidencePacketPdf
// ---------------------------------------------------------------------------

describe("renderEvidencePacketPdf", () => {
  it("renders a valid PDF packet containing the request summary", () => {
    const manifest = {
      request: {
        id: "req-1",
        requestNumber: 7,
        type: "reimbursement",
        status: "approved",
        requestedAmountCents: 10000,
        approvedAmountCents: 9500,
        funderReference: "REF-001",
        grant: { id: "grant-1", name: "Community Support Grant" },
      },
      lines: [{ id: "line-1", amountCents: 5000, description: "Salaries" }],
      adjustments: [{ id: "adj-1", kind: "reduction", amountCents: 500 }],
      payments: [{ id: "pay-1", amountCents: 9500, receivedDate: new Date("2026-03-15") }],
      activityHistory: [{ id: "act-1", action: "approved", createdAt: new Date("2026-03-01") }],
      linkedDocuments: [{ id: "doc-1", filename: "invoice.pdf" }],
      generatedAt: "2026-05-26T00:00:00.000Z",
    };

    const pdf = renderEvidencePacketPdf(manifest);
    const text = new TextDecoder().decode(pdf);

    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("Payment request evidence packet");
    expect(text).toContain("Request number: 7");
    expect(text).toContain("Community Support Grant");
    expect(text).toContain("invoice.pdf");
    expect(text).toContain("%%EOF");
  });

  it("escapes PDF text and normalizes non-ASCII characters", () => {
    const pdf = renderEvidencePacketPdf({
      request: {
        id: "req-1",
        requestNumber: "A/1",
        type: "reimbursement",
        status: "draft",
        requestedAmountCents: 0,
        approvedAmountCents: 0,
        grant: { id: "grant-1", name: "Grant (pilot) \\ phase" },
      },
      lines: [{ id: "line-1", description: "Café supplies", amountCents: 0 }],
      adjustments: [],
      payments: [],
      activityHistory: [],
      linkedDocuments: [],
      generatedAt: "2026-05-26T00:00:00.000Z",
    });
    const text = new TextDecoder().decode(pdf);

    expect(text).toContain("Grant \\(pilot\\) \\\\ phase");
    expect(text).toContain("Caf? supplies");
  });

  it("renders empty and malformed packet values defensively", () => {
    const pdf = renderEvidencePacketPdf({
      request: {
        id: "req-1",
        requestNumber: "",
        type: null,
        status: undefined,
        requestedAmountCents: "not-a-number",
        approvedAmountCents: null,
        funderReference: "",
        grant: null,
      },
      lines: [null],
      adjustments: [undefined],
      payments: [{ id: "pay-1", amountCents: "bad", receivedDate: "" }],
      activityHistory: [null],
      linkedDocuments: [null],
      generatedAt: new Date("2026-05-26T00:00:00.000Z"),
    });
    const text = new TextDecoder().decode(pdf);

    expect(text).toContain("Generated at: 2026-05-26T00:00:00.000Z");
    expect(text).toContain("Request number: None");
    expect(text).toContain("Grant: Unassigned");
    expect(text).toContain("Requested: $0.00");
  });

  it("renders packets that span multiple PDF pages", () => {
    const pdf = renderEvidencePacketPdf({
      request: {
        id: "req-1",
        requestNumber: 8,
        type: "reimbursement",
        status: "approved",
        requestedAmountCents: 10000,
        approvedAmountCents: 10000,
        grant: { id: "grant-1", name: "Grant" },
      },
      lines: Array.from({ length: 60 }, (_, index) => ({
        id: `line-${index}`,
        description: `Line ${index}`,
        amountCents: 100,
      })),
      adjustments: [],
      payments: [],
      activityHistory: [],
      linkedDocuments: [],
      generatedAt: "2026-05-26T00:00:00.000Z",
    });
    const text = new TextDecoder().decode(pdf);

    expect(text).toContain("/Count 2");
    expect(text).toContain("Line 59");
  });
});
