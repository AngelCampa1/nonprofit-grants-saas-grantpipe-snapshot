import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  grantPaymentRequests,
  grantPaymentRequestLines,
  grantPaymentRequestAdjustments,
  grantPayments,
  activityLog,
  documents,
} from "@grantpipe/db";
import type { Database } from "@grantpipe/db";
import { notFound } from "../../lib/app-error";
import {
  paymentRequestEntityScope,
  paymentGrantEntityScope,
  type PaymentEntityScope,
} from "./entity-scope";

type EvidencePacketManifest = {
  request: Record<string, unknown>;
  lines: unknown[];
  adjustments: unknown[];
  payments: unknown[];
  activityHistory: unknown[];
  linkedDocuments: unknown[];
  generatedAt: unknown;
};

// ---------------------------------------------------------------------------
// getEvidenceManifest
// ---------------------------------------------------------------------------

export async function getEvidenceManifest(
  db: Database,
  params: PaymentEntityScope & { requestId: string },
) {
  const { orgId, requestId } = params;

  const request = await db.query.grantPaymentRequests.findFirst({
    where: and(
      eq(grantPaymentRequests.id, requestId),
      eq(grantPaymentRequests.orgId, orgId),
      isNull(grantPaymentRequests.deletedAt),
      paymentRequestEntityScope(grantPaymentRequests.grantId, params),
    ),
    with: {
      grant: true,
      lines: {
        where: isNull(grantPaymentRequestLines.deletedAt),
      },
      adjustments: {
        where: isNull(grantPaymentRequestAdjustments.deletedAt),
      },
      payments: {
        where: isNull(grantPayments.deletedAt),
      },
    },
  });

  if (!request) throw notFound("Payment request not found");

  const lineIds = (request.lines ?? []).map((l) => l.id);
  const adjustmentIds = (request.adjustments ?? []).map((a) => a.id);
  const paymentIds = (request.payments ?? []).map((p) => p.id);

  // Collect all entity IDs for activity log query
  const allEntityIds = [requestId, ...lineIds, ...adjustmentIds, ...paymentIds];

  const activityHistory = await db
    .select()
    .from(activityLog)
    .where(
      and(
        eq(activityLog.orgId, orgId),
        inArray(activityLog.entityType, [
          "payment_request",
          "payment_request_line",
          "payment_request_adjustment",
          "payment",
        ]),
        inArray(activityLog.entityId, allEntityIds),
      ),
    )
    .orderBy(asc(activityLog.createdAt));

  const linkedDocuments = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.orgId, orgId),
        eq(documents.entityType, "payment_request"),
        eq(documents.entityId, requestId),
        isNull(documents.deletedAt),
      ),
    );

  const grant = request.grant as { id: string; name: string } | null;

  return {
    request: {
      id: request.id,
      orgId: request.orgId,
      grantId: request.grantId,
      requestNumber: request.requestNumber,
      type: request.type,
      status: request.status,
      periodStart: request.periodStart,
      periodEnd: request.periodEnd,
      submittedAt: request.submittedAt,
      approvedAt: request.approvedAt,
      rejectedAt: request.rejectedAt,
      closedAt: request.closedAt,
      requestedAmountCents: request.requestedAmountCents,
      approvedAmountCents: request.approvedAmountCents,
      funderReference: request.funderReference,
      notes: request.notes,
      autoPostJournalEntry: request.autoPostJournalEntry,
      createdBy: request.createdBy,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      grant: grant ? { id: grant.id, name: grant.name } : null,
    },
    lines: request.lines ?? [],
    adjustments: request.adjustments ?? [],
    payments: request.payments ?? [],
    activityHistory,
    linkedDocuments,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// getGrantPaymentSummary
// ---------------------------------------------------------------------------

export async function getGrantPaymentSummary(
  db: Database,
  params: PaymentEntityScope & { grantId: string },
) {
  const { orgId, grantId } = params;

  const [summaryRow] = await db
    .select({
      totalRequestedCents: sql<number>`COALESCE(SUM(${grantPaymentRequests.requestedAmountCents}), 0)`,
      totalApprovedCents: sql<number>`COALESCE(SUM(CASE WHEN ${grantPaymentRequests.status} IN ('approved', 'partially_approved', 'paid', 'closed') THEN ${grantPaymentRequests.approvedAmountCents} ELSE 0 END), 0)`,
      requestCount: sql<number>`COUNT(*)`,
    })
    .from(grantPaymentRequests)
    .where(
      and(
        eq(grantPaymentRequests.orgId, orgId),
        eq(grantPaymentRequests.grantId, grantId),
        isNull(grantPaymentRequests.deletedAt),
        paymentRequestEntityScope(grantPaymentRequests.grantId, params),
      ),
    );

  const [paymentRow] = await db
    .select({
      totalPaidCents: sql<number>`COALESCE(SUM(${grantPayments.amountCents}), 0)`,
      lastPaymentDate: sql<Date | null>`MAX(${grantPayments.receivedDate})`,
    })
    .from(grantPayments)
    .where(
      and(
        eq(grantPayments.orgId, orgId),
        eq(grantPayments.grantId, grantId),
        isNull(grantPayments.deletedAt),
        paymentGrantEntityScope(grantPayments.grantId, params),
      ),
    );

  const totalRequestedCents = Number(summaryRow?.totalRequestedCents ?? 0);
  const totalApprovedCents = Number(summaryRow?.totalApprovedCents ?? 0);
  const totalPaidCents = Number(paymentRow?.totalPaidCents ?? 0);
  const outstandingCents = Math.max(0, totalApprovedCents - totalPaidCents);
  const requestCount = Number(summaryRow?.requestCount ?? 0);
  const lastPaymentDate = paymentRow?.lastPaymentDate ?? null;

  return {
    totalRequestedCents,
    totalApprovedCents,
    totalPaidCents,
    outstandingCents,
    requestCount,
    lastPaymentDate: lastPaymentDate ? new Date(lastPaymentDate) : null,
  };
}

// ---------------------------------------------------------------------------
// renderEvidencePacketPdf
// ---------------------------------------------------------------------------

export function renderEvidencePacketPdf(manifest: EvidencePacketManifest) {
  const request = manifest.request;
  const grant = asRecord(request.grant);
  const lines = [
    "Payment request evidence packet",
    `Generated at: ${formatPdfValue(manifest.generatedAt)}`,
    "",
    "Request",
    `Request number: ${formatPdfValue(request.requestNumber)}`,
    `Grant: ${formatPdfValue(grant.name ?? "Unassigned")}`,
    `Type: ${formatPdfValue(request.type)}`,
    `Status: ${formatPdfValue(request.status)}`,
    `Requested: ${formatCents(request.requestedAmountCents)}`,
    `Approved: ${formatCents(request.approvedAmountCents)}`,
    `Funder reference: ${formatPdfValue(request.funderReference)}`,
    "",
    "Lines",
    ...formatRows(manifest.lines, (line, index) => {
      const row = asRecord(line);
      return `${index + 1}. ${formatPdfValue(row.description ?? row.category ?? row.id)} - ${formatCents(row.amountCents)}`;
    }),
    "",
    "Adjustments",
    ...formatRows(manifest.adjustments, (adjustment, index) => {
      const row = asRecord(adjustment);
      return `${index + 1}. ${formatPdfValue(row.kind ?? row.id)} - ${formatCents(row.amountCents)}`;
    }),
    "",
    "Payments",
    ...formatRows(manifest.payments, (payment, index) => {
      const row = asRecord(payment);
      return `${index + 1}. ${formatPdfValue(row.receivedDate)} - ${formatCents(row.amountCents)}`;
    }),
    "",
    "Linked documents",
    ...formatRows(manifest.linkedDocuments, (document, index) => {
      const row = asRecord(document);
      return `${index + 1}. ${formatPdfValue(row.filename ?? row.id)}`;
    }),
    "",
    "Activity history",
    ...formatRows(manifest.activityHistory, (entry, index) => {
      const row = asRecord(entry);
      return `${index + 1}. ${formatPdfValue(row.action ?? row.id)} - ${formatPdfValue(row.createdAt)}`;
    }),
  ];

  return buildSimplePdf(lines);
}

function formatRows<T>(rows: T[], formatter: (row: T, index: number) => string) {
  if (rows.length === 0) return ["None"];
  return rows.map(formatter);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function formatPdfValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "None";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function formatCents(value: unknown) {
  const cents = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(cents)) return "$0.00";
  return `$${(cents / 100).toFixed(2)}`;
}

function normalizePdfText(value: string) {
  return value
    .replaceAll(/[^\x20-\x7E]/g, "?")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function buildPdfDocument(objects: string[]) {
  const header = "%PDF-1.4\n";
  let body = "";
  const offsets: number[] = [0];
  let cursor = header.length;

  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(cursor);
    const objectText = `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
    body += objectText;
    cursor += objectText.length;
  }

  const xrefOffset = cursor;
  const xrefLines = [
    `xref\n0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.slice(1).map((offset) => `${offset.toString().padStart(10, "0")} 00000 n `),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    `${xrefOffset}`,
    "%%EOF",
  ];

  return new TextEncoder().encode(`${header}${body}${xrefLines.join("\n")}\n`);
}

function buildSimplePdf(lines: string[]) {
  const pageLineCount = 44;
  const pages: string[][] = [];

  for (let start = 0; start < lines.length; start += pageLineCount) {
    pages.push(lines.slice(start, start + pageLineCount));
  }

  const fontObjectNumber = pages.length * 2 + 3;
  const pageObjectNumbers = pages.map((_, index) => 3 + index * 2);
  const contentObjectNumbers = pages.map((_, index) => 4 + index * 2);
  const objects: string[] = [];

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(
    `<< /Type /Pages /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  );

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const pageObjectNumber = pageObjectNumbers[pageIndex];
    const contentObjectNumber = contentObjectNumbers[pageIndex];
    const page = pages[pageIndex];
    if (page == null || pageObjectNumber == null || contentObjectNumber == null) continue;

    const commands = ["BT", "/F1 12 Tf", "50 742 Td"];
    for (let lineIndex = 0; lineIndex < page.length; lineIndex += 1) {
      const line = normalizePdfText(page[lineIndex] ?? "");
      commands.push(lineIndex === 0 ? `(${line}) Tj` : `0 -16 Td (${line}) Tj`);
    }
    commands.push("ET");

    const stream = commands.join("\n");
    objects[pageObjectNumber - 1] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`;
    objects[contentObjectNumber - 1] =
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  }

  objects[fontObjectNumber - 1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  return buildPdfDocument(objects);
}
