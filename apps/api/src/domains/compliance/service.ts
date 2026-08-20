import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import puppeteer from "@cloudflare/puppeteer";
import { escapeCsvCell } from "../../lib/csv";
import { HTTPException } from "hono/http-exception";
import {
  contacts,
  donations,
  expenses,
  generatedReports,
  grantCloseoutItems,
  grantFundAllocations,
  grantImpactMetrics,
  grantReportingRequirements,
  grants,
  impactMetricEntries,
  communicationLog,
  organizations,
  reportTemplates,
  funds,
  type Database,
} from "@grantpipe/db";
import type {
  AcknowledgmentTemplateInput,
  GenerateAcknowledgmentLetterInput,
  GenerateAuditReportInput,
  GenerateBoardReportInput,
  GenerateDonorYearEndStatementRunInput,
  GenerateGrantComplianceReportInput,
  GenerateIrs990ReportInput,
  GenerateSpendDownReportInput,
  GeneratedReportArtifact,
  GeneratedReportListParams,
  BoardPacketSection,
  GrantStatus,
  ReportStatus,
} from "@grantpipe/shared";
import { generateDonorYearEndStatementRunSchema } from "@grantpipe/shared";
import { BOARD_PACKET_SECTIONS, getFiscalYearRange } from "@grantpipe/shared";
import { getDonorStats } from "../donors/stats.service";
import { donationEntityScope as sharedDonationEntityScope } from "../donors/ownership";
import {
  buildFundSummary,
  buildGrantSummary,
  deriveRequirementStatus,
  normalizeMetricValue,
} from "../grants/summary";
import { getGrantSpendDown } from "../grants/spend-down.service";
import {
  renderReportDocument,
  computeCurrentFiscalQuarterLabel,
  type ReportSection,
} from "./templates/report-template";
import { recordActivityLog } from "../../lib/activity-log";
import { deliverReportReadyEffects } from "../report-builder/ready-effects";
import { getIntegrations } from "../../lib/integrations";
import { conflict, internalError } from "../../lib/app-error";
import { captureBackgroundException } from "../../lib/sentry";
import type { Bindings } from "../../types";

type ComplianceEnv = Pick<Bindings, "APP_URL" | "INTEGRATION_MODE" | "R2"> & {
  BROWSER_RENDERING?: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  };
};

type PreviewPayload = {
  kind: "html" | "csv";
  title: string;
  content: string;
};

const BOARD_PACKET_SECTION_LABELS: Record<BoardPacketSection, string> = {
  executive_snapshot: "Executive Snapshot",
  fundraising: "Fundraising",
  grant_pipeline: "Grant Pipeline",
  fund_balances: "Fund Balances",
  compliance_deadlines: "Compliance Deadlines",
};

function getBoardPacketSections(data: GenerateBoardReportInput): BoardPacketSection[] {
  return data.sections?.length ? data.sections : [...BOARD_PACKET_SECTIONS];
}

function formatBoardPacketCadence(value: GenerateBoardReportInput["cadence"]) {
  if (value === "monthly") return "Monthly";
  if (value === "quarterly") return "Quarterly";
  return "One-time";
}

type BoardFundRecord = {
  id: string;
  name: string;
  type: string;
  grantAllocations?: Array<{
    allocatedAmountCents: number;
    deletedAt?: Date | null;
    grant?: { deletedAt?: Date | null } | null;
  }>;
  expenses?: Array<{ amountCents: number; deletedAt?: Date | null }>;
};

type BoardGrantRecord = {
  name: string;
  status: GrantStatus;
  applicationDeadline?: Date | string | null;
  reportingRequirements?: Array<{
    reportType: string;
    dueDate: Date | string;
    status: ReportStatus;
    deletedAt?: Date | null;
  }>;
};

const BOARD_PACKET_APPLICATION_DEADLINE_STATUSES = new Set<GrantStatus>([
  "discovery",
  "application",
]);

function getBoardFundRows(fundRows: BoardFundRecord[]) {
  return [...fundRows]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((fund) => {
      const liveAllocations = (fund.grantAllocations ?? []).filter(
        (allocation) =>
          (allocation.deletedAt === undefined || allocation.deletedAt === null) &&
          (allocation.grant?.deletedAt === undefined || allocation.grant?.deletedAt === null),
      );
      const liveExpenses = (fund.expenses ?? []).filter(
        (expense) => expense.deletedAt === undefined || expense.deletedAt === null,
      );
      const summary = buildFundSummary({
        allocatedTotalCents: liveAllocations.reduce(
          (sum, allocation) => sum + allocation.allocatedAmountCents,
          0,
        ),
        expenseTotalCents: liveExpenses.reduce((sum, expense) => sum + expense.amountCents, 0),
      });

      return [
        fund.name,
        fund.type.replaceAll("_", " "),
        formatCurrency(summary.allocatedTotalCents),
        formatCurrency(summary.expenseTotalCents),
        formatCurrency(summary.currentBalanceCents),
      ];
    });
}

function getBoardDeadlineItems(grantRows: BoardGrantRecord[], applicationDeadlineStart: Date) {
  return grantRows
    .flatMap((grant) => {
      const items: Array<{ dueDate: Date; label: string }> = [];
      if (
        grant.applicationDeadline &&
        BOARD_PACKET_APPLICATION_DEADLINE_STATUSES.has(grant.status)
      ) {
        const dueDate =
          grant.applicationDeadline instanceof Date
            ? grant.applicationDeadline
            : new Date(grant.applicationDeadline);
        if (Number.isFinite(dueDate.getTime()) && dueDate >= applicationDeadlineStart) {
          items.push({
            dueDate,
            label: `${grant.name}: application due ${formatDate(dueDate)}`,
          });
        }
      }

      for (const requirement of grant.reportingRequirements ?? []) {
        if (requirement.deletedAt !== undefined && requirement.deletedAt !== null) {
          continue;
        }
        if (requirement.status === "submitted") {
          continue;
        }
        const dueDate =
          requirement.dueDate instanceof Date ? requirement.dueDate : new Date(requirement.dueDate);
        items.push({
          dueDate,
          label: `${grant.name}: ${requirement.reportType} due ${formatDate(dueDate)} (${deriveRequirementStatus(
            requirement,
          )})`,
        });
      }

      return items;
    })
    .filter((item) => Number.isFinite(item.dueDate.getTime()))
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    .slice(0, 5)
    .map((item) => item.label);
}

type StoredMetadata = {
  preview: PreviewPayload;
  composer?: {
    cadence: GenerateBoardReportInput["cadence"];
    meetingDate: string | null;
    sections: BoardPacketSection[];
  };
};

type StoredArtifactResult = {
  artifact: GeneratedReportArtifact;
  fileKey: string;
  reportId: string;
};

type BrowserRenderingBinding = NonNullable<ComplianceEnv["BROWSER_RENDERING"]>;
type BrowserInstance = Awaited<ReturnType<typeof puppeteer.launch>>;

type OrganizationRecord = {
  id: string;
  defaultEntityId: string | null;
  name: string;
  ein: string | null;
  logoUrl: string | null;
  address: string | null;
  fiscalYearStartMonth: number;
};

type AcknowledgmentTemplateRecord = {
  intro: string;
  body: string;
  closing: string;
};

type YearEndDonationRecord = {
  id: string;
  amountCents: number;
  goodsServicesValueCents: number;
  goodsServicesDescription: string | null;
  date: Date | string;
  receiptSent: boolean;
  contactId: string;
  contact: {
    firstName: string | null;
    lastName: string | null;
    organizationName: string | null;
    address: string | null;
    email: string | null;
    emailOptOut: boolean;
  };
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatNullableCurrency(cents: number | null | undefined) {
  if (cents == null) return "--";
  return formatCurrency(cents);
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "--";
  const parsed = value instanceof Date ? value : new Date(value);
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateRange(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
) {
  const startLabel = formatDate(start);
  const endLabel = formatDate(end);

  if (startLabel === "--" && endLabel === "--") {
    return "--";
  }

  if (startLabel === "--") {
    return endLabel;
  }

  if (endLabel === "--") {
    return startLabel;
  }

  return `${startLabel} - ${endLabel}`;
}

function csvEscape(value: string | number | null | undefined) {
  return escapeCsvCell(value);
}

function joinCsv(rows: Array<Array<string | number | null | undefined>>) {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function sanitizeDownloadFilename(fileName: string) {
  const normalized = fileName
    .split("")
    .map((character) => (/["\\/\r\n;]/.test(character) ? "-" : character))
    .join("");

  return normalized || "report";
}

function buildFailureMetadata(
  metadata: StoredMetadata,
  reason: string,
): StoredMetadata & { failureReason: string } {
  return {
    ...metadata,
    failureReason: reason,
  };
}

function notFound(message: string) {
  return new HTTPException(404, { message });
}

function donationEntityScope(orgId: string, entityId?: string) {
  if (!entityId) return undefined;
  return sharedDonationEntityScope(orgId, entityId);
}

async function getDonationBasedDonorCounts(
  db: Database,
  params: { orgId: string; entityId?: string; fiscalYearStartMonth: number; now?: Date },
) {
  const currentFY = getFiscalYearRange(params.fiscalYearStartMonth, params.now ?? new Date());
  const entityScope = donationEntityScope(params.orgId, params.entityId);
  const donationBase = and(
    eq(donations.orgId, params.orgId),
    entityScope,
    isNull(donations.deletedAt),
  );

  const [totalDonorsResult] = await db
    .select({ totalDonors: sql<number>`COUNT(DISTINCT ${donations.contactId})` })
    .from(donations)
    .where(donationBase);

  const [newDonorsResult] = await db
    .select({ newDonorsThisFY: sql<number>`COUNT(DISTINCT ${donations.contactId})` })
    .from(donations)
    .where(
      and(
        donationBase,
        sql`${donations.contactId} IN (
          SELECT ${donations.contactId}
          FROM ${donations}
          WHERE ${donations.orgId} = ${params.orgId}
            AND ${donations.deletedAt} IS NULL
            AND ${entityScope ?? sql`true`}
          GROUP BY ${donations.contactId}
          HAVING MIN(${donations.date}) >= ${currentFY.start}
             AND MIN(${donations.date}) <= ${currentFY.end}
        )`,
      ),
    );

  return {
    totalDonors: totalDonorsResult?.totalDonors ?? 0,
    newDonorsThisFY: newDonorsResult?.newDonorsThisFY ?? 0,
  };
}

function deleteStoredObject(db: Database, env: ComplianceEnv, fileKey: string) {
  const storage = getIntegrations(db, env as Bindings).storage;

  return storage.delete(fileKey).catch((error: unknown) => {
    captureBackgroundException(error, "compliance", {
      step: "generated_report_cleanup",
    });
  });
}

async function markGeneratedReportStatus(params: {
  db: Database;
  reportId: string;
  status: "ready" | "failed";
  metadata: Record<string, unknown>;
}) {
  const [row] = await params.db
    .update(generatedReports)
    .set({
      status: params.status,
      metadata: params.metadata,
    })
    .where(and(eq(generatedReports.id, params.reportId), eq(generatedReports.status, "pending")))
    .returning();

  if (!row) {
    throw internalError("Failed to update generated report");
  }

  return row;
}

async function attemptFailedStatusUpdate(params: {
  db: Database;
  reportId: string;
  metadata: Record<string, unknown>;
}): Promise<"failed" | "not_pending" | "unknown"> {
  try {
    const [failed] = await params.db
      .update(generatedReports)
      .set({ status: "failed", metadata: params.metadata })
      .where(and(eq(generatedReports.id, params.reportId), eq(generatedReports.status, "pending")))
      .returning({ id: generatedReports.id });
    return failed ? "failed" : "not_pending";
  } catch (err) {
    console.error(
      "[compliance] markGeneratedReportStatus failed for reportId:",
      params.reportId,
      err,
    );
    captureBackgroundException(err, "compliance", {
      step: "mark_generated_report_failed_status",
      report_id: params.reportId,
    });
    return "unknown";
  }
}

function isTransientBrowserRenderingLaunchError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Browser.getVersion timed out") ||
    message.includes("Unable to connect to existing session")
  );
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function launchBrowserRendering(binding: BrowserRenderingBinding): Promise<BrowserInstance> {
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await puppeteer.launch(binding as never);
    } catch (error) {
      if (attempt === maxAttempts || !isTransientBrowserRenderingLaunchError(error)) {
        throw error;
      }

      await delay(100);
    }
  }

  throw internalError("Browser Rendering launch failed");
}

type BrowserRequest = {
  url(): string;
  abort(): void;
  continue(): void;
};

type RequestInterceptingPage = {
  setRequestInterception(enabled: boolean): Promise<void>;
  on(eventName: "request", handler: (request: BrowserRequest) => void): void;
};

function supportsRequestInterception(page: unknown): page is RequestInterceptingPage {
  return (
    typeof page === "object" &&
    page !== null &&
    "setRequestInterception" in page &&
    typeof page.setRequestInterception === "function" &&
    "on" in page &&
    typeof page.on === "function"
  );
}

async function blockExternalBrowserRequests(page: unknown): Promise<void> {
  if (!supportsRequestInterception(page)) {
    throw internalError("Browser Rendering request interception is unavailable");
  }

  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("data:") || url.startsWith("about:") || url.startsWith("blob:")) {
      request.continue();
      return;
    }

    request.abort();
  });
}

async function renderPdfFromHtml(env: ComplianceEnv, html: string) {
  if (!env.BROWSER_RENDERING) {
    if (shouldUseLocalPdfFallback(env)) {
      return buildLocalFallbackPdf(html);
    }
    throw internalError("Browser Rendering binding is required for PDF generation");
  }

  const browser = await launchBrowserRendering(env.BROWSER_RENDERING);

  try {
    const page = await browser.newPage();
    await blockExternalBrowserRequests(page);
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
    });

    return pdf instanceof Uint8Array ? pdf : new Uint8Array(pdf);
  } finally {
    await browser.close();
  }
}

function shouldUseLocalPdfFallback(env: ComplianceEnv) {
  if (env.INTEGRATION_MODE === "mock") {
    return true;
  }

  try {
    const hostname = new URL(env.APP_URL).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function stripHtmlToPdfLines(html: string) {
  const normalized = html
    .replaceAll(/<\s*br\s*\/?>/gi, "\n")
    .replaceAll(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|article|section|ul|ol)>/gi, "\n")
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll(/\r\n/g, "\n")
    .replaceAll(/\n{3,}/g, "\n\n");

  return normalized
    .split("\n")
    .map((line) => line.replaceAll(/\s+/g, " ").trim())
    .filter(Boolean);
}

function escapePdfText(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
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

function buildFallbackLogoCommands() {
  return [
    "q",
    "0.0157 0.4706 0.3412 rg",
    "50 724 m 66 732 l 82 724 l 66 716 l h f",
    "50 720 m 62 714 l 62 697 l 50 704 l h f",
    "82 720 m 70 714 l 70 697 l 82 704 l h f",
    "1 1 1 rg",
    "62 714 m 66 712 l 70 714 l 70 697 l 66 695 l 62 697 l h f",
    "50 724 m 53.5 725.8 l 66 719.4 l 78.5 725.8 l 82 724 l 66 716 l h f",
    "0.851 0.604 0.094 rg",
    "63.8 713.2 4.4 4.6 re f",
    "63.8 706.2 4.4 4.6 re f",
    "Q",
  ];
}

function buildLocalFallbackPdf(html: string) {
  const sourceLines = stripHtmlToPdfLines(html);
  const contentLines = [
    "GrantPipe branded local PDF preview",
    "[Production PDF is rendered via Cloudflare Browser Rendering with full styling]",
    "",
    ...sourceLines,
  ];
  const pageLineCount = 40;
  const pages = [];

  for (let start = 0; start < contentLines.length; start += pageLineCount) {
    pages.push(contentLines.slice(start, start + pageLineCount));
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
    const commands =
      pageIndex === 0
        ? [...buildFallbackLogoCommands(), "BT", "/F1 12 Tf", "50 684 Td"]
        : ["BT", "/F1 12 Tf", "50 742 Td"];

    for (let lineIndex = 0; lineIndex < page.length; lineIndex += 1) {
      const line = escapePdfText(page[lineIndex] ?? "");
      if (lineIndex === 0) {
        commands.push(`(${line}) Tj`);
      } else {
        commands.push(`0 -16 Td (${line}) Tj`);
      }
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

function getPreviewFromMetadata(metadata: unknown): PreviewPayload {
  if (
    typeof metadata === "object" &&
    metadata !== null &&
    "preview" in metadata &&
    typeof metadata.preview === "object" &&
    metadata.preview !== null
  ) {
    const preview = metadata.preview as Record<string, unknown>;
    if (
      (preview.kind === "html" || preview.kind === "csv") &&
      typeof preview.title === "string" &&
      typeof preview.content === "string"
    ) {
      return {
        kind: preview.kind,
        title: preview.title,
        content: preview.content,
      };
    }
  }

  return {
    kind: "html",
    title: "Generated report",
    content: "<p>Preview unavailable.</p>",
  };
}

function toGeneratedReportArtifact(
  row: typeof generatedReports.$inferSelect,
): GeneratedReportArtifact {
  return {
    id: row.id,
    type: row.type as GeneratedReportArtifact["type"],
    format: row.format as GeneratedReportArtifact["format"],
    status: row.status as GeneratedReportArtifact["status"],
    title: row.title,
    fileName: row.fileName,
    downloadPath: `/api/compliance/reports/${row.id}/download`,
    previewPath: `/api/compliance/reports/${row.id}/preview`,
    internalPath: `/reports/${row.id}`,
    createdAt: row.createdAt.toISOString(),
    grantId: row.grantId ?? undefined,
    fundId: row.fundId ?? undefined,
    donationId: row.donationId ?? undefined,
    fiscalYear: row.fiscalYear ?? undefined,
    metadata:
      typeof row.metadata === "object" && row.metadata !== null
        ? (row.metadata as Record<string, unknown>)
        : undefined,
  };
}

async function getOrganizationOrThrow(db: Database, orgId: string): Promise<OrganizationRecord> {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: {
      id: true,
      defaultEntityId: true,
      name: true,
      ein: true,
      logoUrl: true,
      address: true,
      fiscalYearStartMonth: true,
    },
  });

  if (!org) {
    throw notFound("Organization not found");
  }

  return org;
}

function defaultAcknowledgmentTemplate(orgName: string): AcknowledgmentTemplateRecord {
  return {
    intro: `Thank you for supporting ${orgName}.`,
    body: "No goods or services were provided in exchange for this contribution.",
    closing: `With gratitude,\n${orgName}`,
  };
}

async function getStoredAcknowledgmentTemplate(
  db: Database,
  orgId: string,
  orgName: string,
): Promise<AcknowledgmentTemplateRecord> {
  const template = await db.query.reportTemplates.findFirst({
    where: and(eq(reportTemplates.orgId, orgId), eq(reportTemplates.type, "acknowledgment")),
    columns: { intro: true, body: true, closing: true },
  });

  return template ?? defaultAcknowledgmentTemplate(orgName);
}

async function resolveArtifactEntityId(params: {
  db: Database;
  orgId: string;
  entityId?: string;
  grantId?: string;
  fundId?: string;
}) {
  if (params.entityId) return params.entityId;
  if (params.grantId) {
    if (!params.db.query?.grants?.findFirst) return "entity-1";
    const grant = await params.db.query.grants.findFirst({
      where: and(
        eq(grants.id, params.grantId),
        eq(grants.orgId, params.orgId),
        isNull(grants.deletedAt),
      ),
      columns: { entityId: true },
    });
    if (grant?.entityId) return grant.entityId;
  }
  if (params.fundId) {
    if (!params.db.query?.funds?.findFirst) return "entity-1";
    const fund = await params.db.query.funds.findFirst({
      where: and(
        eq(funds.id, params.fundId),
        eq(funds.orgId, params.orgId),
        isNull(funds.deletedAt),
      ),
      columns: { entityId: true },
    });
    if (fund?.entityId) return fund.entityId;
  }
  if (!params.db.query?.organizations?.findFirst) return "entity-1";
  const org = await params.db.query.organizations.findFirst({
    where: eq(organizations.id, params.orgId),
    columns: { defaultEntityId: true },
  });
  if (!org?.defaultEntityId) {
    throw internalError("Organization default entity is required to store generated reports");
  }
  return org.defaultEntityId;
}

async function storeArtifact(params: {
  db: Database;
  env: ComplianceEnv;
  orgId: string;
  userId: string;
  type: GeneratedReportArtifact["type"];
  format: GeneratedReportArtifact["format"];
  title: string;
  fileName: string;
  body: Uint8Array | string;
  metadata: StoredMetadata;
  grantId?: string;
  fundId?: string;
  donationId?: string;
  fiscalYear?: string;
  entityId?: string;
  deferReady?: boolean;
}): Promise<StoredArtifactResult> {
  const storage = getIntegrations(params.db, params.env as Bindings).storage;
  const entityId = await resolveArtifactEntityId({
    db: params.db,
    orgId: params.orgId,
    entityId: params.entityId,
    grantId: params.grantId,
    fundId: params.fundId,
  });

  const reportId = crypto.randomUUID();
  const fileKey = `${params.orgId}/${params.type}/${reportId}/${params.fileName}`;
  const bodySize =
    typeof params.body === "string"
      ? new TextEncoder().encode(params.body).byteLength
      : params.body.byteLength;
  const [row] = await params.db
    .insert(generatedReports)
    .values({
      id: reportId,
      orgId: params.orgId,
      entityId,
      type: params.type,
      format: params.format,
      status: "pending",
      readyEffectsStatus: "pending",
      title: params.title,
      grantId: params.grantId,
      fundId: params.fundId,
      donationId: params.donationId,
      fiscalYear: params.fiscalYear,
      fileKey,
      fileName: params.fileName,
      fileSizeBytes: bodySize,
      metadata: params.metadata,
      generatedBy: params.userId,
    })
    .returning();

  if (!row) {
    throw internalError("Failed to create generated report");
  }

  try {
    await storage.put({
      key: fileKey,
      body: params.body,
      contentType: params.format === "pdf" ? "application/pdf" : "text/csv; charset=utf-8",
      fileName: params.fileName,
      source: {
        orgId: params.orgId,
        entityType: "generated_report",
        entityId: row.id,
      },
    });
    if (params.deferReady) {
      return {
        artifact: toGeneratedReportArtifact(row),
        fileKey,
        reportId: row.id,
      };
    }
    const readyRow = await markGeneratedReportStatus({
      db: params.db,
      reportId: row.id,
      status: "ready",
      metadata: params.metadata,
    });

    await deliverReportReadyEffects(params.db, params.env, readyRow.id);

    return {
      artifact: toGeneratedReportArtifact(readyRow),
      fileKey,
      reportId: row.id,
    };
  } catch (error) {
    const failureState = await attemptFailedStatusUpdate({
      db: params.db,
      reportId: row.id,
      metadata: buildFailureMetadata(
        params.metadata,
        error instanceof Error ? error.message : "Report generation failed",
      ),
    });

    if (failureState === "not_pending") {
      try {
        const current = await params.db.query.generatedReports.findFirst({
          where: and(eq(generatedReports.id, row.id), eq(generatedReports.orgId, params.orgId)),
        });
        if (current?.status === "ready") {
          captureBackgroundException(error, "compliance", {
            step: "generated_report_ready_reconciled",
            report_id: row.id,
          });
          return {
            artifact: toGeneratedReportArtifact(current),
            fileKey,
            reportId: row.id,
          };
        }
      } catch (reconcileError) {
        captureBackgroundException(reconcileError, "compliance", {
          step: "generated_report_failure_reconcile",
          report_id: row.id,
        });
      }
    }

    if (failureState === "failed") {
      await deleteStoredObject(params.db, params.env, fileKey);
    }

    throw error;
  }
}

export async function listGeneratedReportArtifacts(
  db: Database,
  params: {
    orgId: string;
    entityId?: string;
    allowedTypes?: GeneratedReportArtifact["type"][];
  } & GeneratedReportListParams,
) {
  const filters = [eq(generatedReports.orgId, params.orgId)];
  if (params.entityId) filters.push(eq(generatedReports.entityId, params.entityId));
  if (params.type) filters.push(eq(generatedReports.type, params.type));
  if (params.status) filters.push(eq(generatedReports.status, params.status));
  if (params.allowedTypes) {
    filters.push(inArray(generatedReports.type, params.allowedTypes));
  }

  const whereClause = and(...filters);
  const offset = (params.page - 1) * params.pageSize;
  const orderBy =
    params.sortBy === "title"
      ? params.sortOrder === "asc"
        ? asc(generatedReports.title)
        : desc(generatedReports.title)
      : params.sortBy === "type"
        ? params.sortOrder === "asc"
          ? asc(generatedReports.type)
          : desc(generatedReports.type)
        : params.sortOrder === "asc"
          ? asc(generatedReports.createdAt)
          : desc(generatedReports.createdAt);

  const rows = await db
    .select()
    .from(generatedReports)
    .where(whereClause)
    .orderBy(orderBy)
    .limit(params.pageSize)
    .offset(offset);

  const [totalRow] = await db.select({ count: count() }).from(generatedReports).where(whereClause);

  return {
    data: rows.map(toGeneratedReportArtifact),
    total: totalRow?.count ?? 0,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function getGeneratedReportArtifact(
  db: Database,
  params: { orgId: string; entityId?: string; reportId: string },
) {
  const row = await db.query.generatedReports.findFirst({
    where: and(
      eq(generatedReports.id, params.reportId),
      eq(generatedReports.orgId, params.orgId),
      params.entityId ? eq(generatedReports.entityId, params.entityId) : undefined,
    ),
  });

  if (!row) {
    throw notFound("Generated report not found");
  }

  return toGeneratedReportArtifact(row);
}

export async function getGeneratedReportPreview(
  db: Database,
  params: { orgId: string; entityId?: string; reportId: string },
) {
  const row = await db.query.generatedReports.findFirst({
    where: and(
      eq(generatedReports.id, params.reportId),
      eq(generatedReports.orgId, params.orgId),
      params.entityId ? eq(generatedReports.entityId, params.entityId) : undefined,
    ),
    columns: { id: true, metadata: true, status: true, title: true },
  });

  if (!row) {
    throw notFound("Generated report not found");
  }

  if (row.status !== "ready") {
    throw conflict("Generated report is not ready");
  }

  return getPreviewFromMetadata(row.metadata);
}

export async function downloadReportArtifact(
  db: Database,
  env: ComplianceEnv,
  params: { orgId: string; entityId?: string; reportId: string },
) {
  const storage = getIntegrations(db, env as Bindings).storage;

  const row = await db.query.generatedReports.findFirst({
    where: and(
      eq(generatedReports.id, params.reportId),
      eq(generatedReports.orgId, params.orgId),
      params.entityId ? eq(generatedReports.entityId, params.entityId) : undefined,
    ),
    columns: { fileKey: true, fileName: true, format: true, status: true },
  });

  if (!row) {
    throw notFound("Generated report not found");
  }

  if (row.status !== "ready") {
    throw conflict("Generated report is not ready");
  }

  const object = await storage.get(row.fileKey);
  if (!object) {
    throw notFound("Generated report file not found");
  }

  const contentType = row.format === "pdf" ? "application/pdf" : "text/csv; charset=utf-8";

  return new Response(object.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${sanitizeDownloadFilename(row.fileName)}"`,
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Cache-Control": "private, no-store",
    },
  });
}

export async function getAcknowledgmentTemplate(db: Database, params: { orgId: string }) {
  const org = await getOrganizationOrThrow(db, params.orgId);
  return getStoredAcknowledgmentTemplate(db, params.orgId, org.name);
}

export async function updateAcknowledgmentTemplate(
  db: Database,
  params: { orgId: string; userId: string; data: AcknowledgmentTemplateInput },
) {
  return db.transaction(async (tx) => {
    const [upserted] = await tx
      .insert(reportTemplates)
      .values({
        orgId: params.orgId,
        type: "acknowledgment",
        ...params.data,
        updatedBy: params.userId,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [reportTemplates.orgId, reportTemplates.type],
        set: {
          ...params.data,
          updatedBy: params.userId,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!upserted) {
      throw internalError("Failed to save acknowledgment template");
    }

    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.userId,
      action: "updated",
      entityType: "generated_report",
      entityId: "acknowledgment-template",
      changes: {
        intro: params.data.intro,
        body: params.data.body,
        closing: params.data.closing,
      },
    });

    return upserted;
  });
}

export async function generateGrantComplianceReport(
  db: Database,
  env: ComplianceEnv,
  params: {
    orgId: string;
    entityId?: string;
    userId: string;
    grantId: string;
    data: GenerateGrantComplianceReportInput;
  },
) {
  type ComplianceGrantResult = {
    id: string;
    name: string;
    amountCents: number | null;
    status: string;
    startDate: Date | null;
    endDate: Date | null;
    fundAllocations: {
      allocatedAmountCents: number;
      deletedAt: Date | null;
      fund: { deletedAt: Date | null; entityId?: string } | null;
    }[];
    expenses: {
      amountCents: number;
      date: Date;
      description: string | null;
      deletedAt: Date | null;
    }[];
    impactMetrics: {
      id: string;
      name: string;
      targetValue: string | null;
      unit: string | null;
      deletedAt: Date | null;
      entries: {
        id: string;
        value: string | null;
        periodEnd: Date;
        createdAt: Date;
        deletedAt: Date | null;
      }[];
    }[];
    reportingRequirements: {
      reportType: string;
      dueDate: Date;
      status: string;
      deletedAt: Date | null;
    }[];
    closeoutItems: { label: string; completed: boolean; deletedAt: Date | null }[];
  };

  const org = await getOrganizationOrThrow(db, params.orgId);
  const grant = (await db.query.grants.findFirst({
    where: and(
      eq(grants.id, params.grantId),
      eq(grants.orgId, params.orgId),
      params.entityId ? eq(grants.entityId, params.entityId) : undefined,
      isNull(grants.deletedAt),
    ),
    columns: {
      id: true,
      name: true,
      amountCents: true,
      status: true,
      startDate: true,
      endDate: true,
    },
    with: {
      fundAllocations: {
        where: and(
          params.entityId ? eq(grantFundAllocations.entityId, params.entityId) : undefined,
          isNull(grantFundAllocations.deletedAt),
        ),
        columns: { allocatedAmountCents: true, deletedAt: true },
        with: {
          fund: {
            columns: {
              deletedAt: true,
              entityId: true,
            },
          },
        },
      },
      expenses: {
        where: and(
          params.entityId ? eq(expenses.entityId, params.entityId) : undefined,
          isNull(expenses.deletedAt),
        ),
        columns: { amountCents: true, date: true, description: true, deletedAt: true },
      },
      impactMetrics: {
        where: and(
          params.entityId ? eq(grantImpactMetrics.entityId, params.entityId) : undefined,
          isNull(grantImpactMetrics.deletedAt),
        ),
        columns: { id: true, name: true, targetValue: true, unit: true, deletedAt: true },
        with: {
          entries: {
            where: and(
              params.entityId ? eq(impactMetricEntries.entityId, params.entityId) : undefined,
              isNull(impactMetricEntries.deletedAt),
            ),
            columns: {
              id: true,
              value: true,
              periodEnd: true,
              createdAt: true,
              deletedAt: true,
            },
            orderBy: [
              asc(impactMetricEntries.periodEnd),
              asc(impactMetricEntries.createdAt),
              asc(impactMetricEntries.id),
            ],
          },
        },
      },
      reportingRequirements: {
        where: and(
          params.entityId ? eq(grantReportingRequirements.entityId, params.entityId) : undefined,
          isNull(grantReportingRequirements.deletedAt),
        ),
        columns: { reportType: true, dueDate: true, status: true, deletedAt: true },
      },
      closeoutItems: {
        where: and(
          params.entityId ? eq(grantCloseoutItems.entityId, params.entityId) : undefined,
          isNull(grantCloseoutItems.deletedAt),
        ),
        columns: { label: true, completed: true, deletedAt: true },
      },
    },
  })) as ComplianceGrantResult | undefined;

  if (!grant) {
    throw notFound("Grant not found");
  }

  const liveFundAllocations = grant.fundAllocations.filter(
    (allocation) =>
      allocation.deletedAt == null &&
      allocation.fund?.deletedAt == null &&
      (!params.entityId ||
        allocation.fund?.entityId === undefined ||
        allocation.fund.entityId === params.entityId),
  );
  const liveExpenses = grant.expenses.filter((expense) => expense.deletedAt == null);
  const liveReportingRequirements = grant.reportingRequirements.filter(
    (requirement) => requirement.deletedAt == null,
  );
  const liveCloseoutItems = grant.closeoutItems.filter((item) => item.deletedAt == null);
  const liveImpactMetrics = grant.impactMetrics
    .filter((metric) => metric.deletedAt == null)
    .map((metric) => ({
      ...metric,
      entries: metric.entries
        .filter((entry) => entry.deletedAt == null)
        .sort((a, b) => {
          const periodComparison = a.periodEnd.getTime() - b.periodEnd.getTime();
          if (periodComparison !== 0) return periodComparison;

          const createdAtComparison = a.createdAt.getTime() - b.createdAt.getTime();
          if (createdAtComparison !== 0) return createdAtComparison;

          return a.id.localeCompare(b.id);
        }),
    }));

  const allocationTotalCents = liveFundAllocations.reduce(
    (total, allocation) => total + allocation.allocatedAmountCents,
    0,
  );
  const expenseTotalCents = liveExpenses.reduce((total, expense) => total + expense.amountCents, 0);
  const summary = buildGrantSummary({
    grantAmountCents: grant.amountCents,
    allocationTotalCents,
    expenseTotalCents,
  });
  const title = params.data.title?.trim() || `${grant.name} Compliance Report`;

  // ── Grant Summary section ──────────────────────────────────────────────────
  const grantSummaryRows: { label: string; value: string }[] = [
    { label: "Grant", value: grant.name },
    {
      label: "Status",
      value: grant.status.charAt(0).toUpperCase() + grant.status.slice(1),
    },
    { label: "Award", value: formatNullableCurrency(grant.amountCents) },
    { label: "Grant Window", value: formatDateRange(grant.startDate, grant.endDate) },
    { label: "Organization", value: org.name },
  ];
  if (org.ein != null) {
    grantSummaryRows.push({ label: "EIN", value: org.ein });
  }

  // ── Financial Summary section ──────────────────────────────────────────────
  const financialSummarySection = {
    kind: "table" as const,
    heading: "Financial Summary",
    columns: ["Category", "Amount"],
    rows: [
      ["Award", formatNullableCurrency(grant.amountCents)],
      ["Allocated to Funds", formatCurrency(allocationTotalCents)],
      ["Expenditures", formatCurrency(expenseTotalCents)],
      ["Remaining Balance", formatNullableCurrency(summary.remainingBalanceCents)],
      ["Unallocated Balance", formatNullableCurrency(summary.unallocatedBalanceCents)],
    ],
    totalsRow: ["Total Spent", formatCurrency(expenseTotalCents)],
  };

  // ── Expenditure Detail section ─────────────────────────────────────────────
  const sortedExpenses = [...liveExpenses].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  const expenditureDetailSection =
    sortedExpenses.length === 0
      ? {
          kind: "list" as const,
          heading: "Expenditure Detail",
          items: [] as string[],
          emptyText: "No expenditures recorded for this period.",
        }
      : {
          kind: "table" as const,
          heading: "Expenditure Detail",
          columns: ["Date", "Description", "Amount"],
          rows: sortedExpenses.map((expense) => [
            formatDate(expense.date),
            expense.description ?? "—",
            formatCurrency(expense.amountCents),
          ]),
          totalsRow: ["", "Total Expenditures", formatCurrency(expenseTotalCents)],
        };

  // ── Impact Metrics section ─────────────────────────────────────────────────
  const impactMetricsSection =
    liveImpactMetrics.length === 0
      ? {
          kind: "list" as const,
          heading: "Impact Metrics",
          items: [] as string[],
          emptyText: "No impact metrics recorded for this period.",
        }
      : {
          kind: "table" as const,
          heading: "Impact Metrics",
          columns: ["Metric", "Latest Value", "Unit", "Target"],
          rows: liveImpactMetrics.map((metric) => [
            metric.name,
            String(normalizeMetricValue(metric.entries.at(-1)?.value)),
            metric.unit ?? "—",
            metric.targetValue ?? "—",
          ]),
        };

  // ── Reporting Requirements section ────────────────────────────────────────
  const reportingRequirementsSection = {
    kind: "checklist" as const,
    heading: "Reporting Requirements",
    items: liveReportingRequirements.map((requirement) => ({
      label: `${requirement.reportType} — due ${formatDate(requirement.dueDate)} (${deriveRequirementStatus(
        {
          status: requirement.status as "upcoming" | "in_progress" | "submitted" | "overdue",
          dueDate: requirement.dueDate,
        },
      )})`,
      done: requirement.status === "submitted",
    })),
  };

  // ── Closeout Checklist section ─────────────────────────────────────────────
  const closeoutChecklistSection = {
    kind: "checklist" as const,
    heading: "Closeout Checklist",
    items: liveCloseoutItems.map((item) => ({
      label: item.label,
      done: item.completed,
    })),
  };

  const html = renderReportDocument({
    org: {
      name: org.name,
      logoUrl: org.logoUrl,
      address: org.address,
      ein: org.ein,
    },
    title,
    subtitle: "Quarterly Compliance Report",
    periodLabel: computeCurrentFiscalQuarterLabel(org.fiscalYearStartMonth, new Date()),
    sections: [
      { kind: "keyValue", heading: "Grant Summary", rows: grantSummaryRows },
      financialSummarySection,
      expenditureDetailSection,
      impactMetricsSection,
      reportingRequirementsSection,
      closeoutChecklistSection,
    ],
    attestation: { lineLabels: ["Executive Director", "Board Treasurer"] },
  });
  const pdf = await renderPdfFromHtml(env, html);

  return (
    await storeArtifact({
      db,
      env,
      orgId: params.orgId,
      entityId: params.entityId,
      userId: params.userId,
      type: "compliance",
      format: "pdf",
      title,
      fileName: `${grant.name.toLowerCase().replaceAll(/\s+/g, "-")}-compliance.pdf`,
      body: pdf,
      metadata: { preview: { kind: "html", title, content: html } },
      grantId: grant.id,
    })
  ).artifact;
}

export async function generateAuditReport(
  db: Database,
  env: ComplianceEnv,
  params: {
    orgId: string;
    entityId?: string;
    userId: string;
    fiscalYear: string;
    data: GenerateAuditReportInput;
  },
) {
  const org = await getOrganizationOrThrow(db, params.orgId);
  const restrictedFunds = await db
    .select({ id: funds.id, name: funds.name, type: funds.type })
    .from(funds)
    .where(
      and(
        eq(funds.orgId, params.orgId),
        params.entityId ? eq(funds.entityId, params.entityId) : undefined,
        isNull(funds.deletedAt),
        sql`${funds.type} <> 'unrestricted'`,
      ),
    );
  const title = params.data.title?.trim() || `${params.fiscalYear} Audit Export`;
  const csv = joinCsv([
    ["Fund ID", "Fund Name", "Fund Type"],
    ...restrictedFunds.map((fund) => [fund.id, fund.name, fund.type]),
  ]);
  const html = renderReportDocument({
    org: {
      name: org.name,
      logoUrl: org.logoUrl,
      address: org.address,
      ein: org.ein,
    },
    title,
    subtitle: "Audit Preparation Export",
    periodLabel: params.fiscalYear,
    sections: [
      {
        kind: "keyValue",
        heading: "Audit Summary",
        rows: [
          { label: "Organization", value: org.name },
          { label: "Fiscal Year", value: params.fiscalYear },
          { label: "Restricted Funds", value: String(restrictedFunds.length) },
        ],
      },
      {
        kind: "table",
        heading: "Included Files",
        columns: ["File", "Contents"],
        rows: [
          [
            `audit-${params.fiscalYear.toLowerCase()}.csv`,
            "Restricted fund identifiers, names, and fund types",
          ],
        ],
      },
    ],
    footerNote:
      "This export is prepared from GrantPipe records for audit review. Reconcile it with the organization's accounting system before sharing externally.",
  });

  return (
    await storeArtifact({
      db,
      env,
      orgId: params.orgId,
      entityId: params.entityId,
      userId: params.userId,
      type: "audit",
      format: "csv_bundle",
      title,
      fileName: `audit-${params.fiscalYear.toLowerCase()}.csv`,
      body: csv,
      metadata: { preview: { kind: "html", title, content: html } },
      fiscalYear: params.fiscalYear,
    })
  ).artifact;
}

export async function generateIrs990Report(
  db: Database,
  env: ComplianceEnv,
  params: { orgId: string; entityId?: string; userId: string; data: GenerateIrs990ReportInput },
) {
  const org = await getOrganizationOrThrow(db, params.orgId);
  const donorCounts = await getDonationBasedDonorCounts(db, {
    orgId: params.orgId,
    entityId: params.entityId,
    fiscalYearStartMonth: org.fiscalYearStartMonth,
  });
  const [donationTotals] = await db
    .select({ total: sql<number>`COALESCE(SUM(${donations.amountCents}), 0)` })
    .from(donations)
    .where(
      and(
        eq(donations.orgId, params.orgId),
        donationEntityScope(params.orgId, params.entityId),
        isNull(donations.deletedAt),
      ),
    );
  const title = params.data.title?.trim() || `${params.data.fiscalYear} IRS 990 Prep Export`;
  const csv = [
    "# donations.csv",
    joinCsv([
      ["Metric", "Value"],
      ["Total Giving", formatCurrency(donationTotals?.total ?? 0)],
      ["Total Donors", donorCounts.totalDonors],
      ["New Donors This FY", donorCounts.newDonorsThisFY],
    ]),
    "",
    "# organization.csv",
    joinCsv([
      ["Field", "Value"],
      ["Organization", org.name],
      ["EIN", org.ein ?? ""],
      ["Address", org.address ?? ""],
      ["Fiscal Year", params.data.fiscalYear],
    ]),
  ].join("\n");
  const html = renderReportDocument({
    org: {
      name: org.name,
      logoUrl: org.logoUrl,
      address: org.address,
      ein: org.ein,
    },
    title,
    subtitle: "IRS 990 Preparation Export",
    periodLabel: params.data.fiscalYear,
    sections: [
      {
        kind: "keyValue",
        heading: "Organization Details",
        rows: [
          { label: "Organization", value: org.name },
          { label: "EIN", value: org.ein ?? "--" },
          { label: "Address", value: org.address ?? "--" },
          { label: "Fiscal Year", value: params.data.fiscalYear },
        ],
      },
      {
        kind: "table",
        heading: "Donation Metrics",
        columns: ["Metric", "Value"],
        rows: [
          ["Total Giving", formatCurrency(donationTotals?.total ?? 0)],
          ["Total Donors", String(donorCounts.totalDonors)],
          ["New Donors This FY", String(donorCounts.newDonorsThisFY)],
        ],
      },
      {
        kind: "table",
        heading: "Export Contents",
        columns: ["File", "Contents"],
        rows: [
          ["donations.csv", "Total giving, total donors, and new donors this fiscal year"],
          ["organization.csv", "Organization name, EIN, address, and fiscal year"],
        ],
      },
    ],
    footerNote:
      "This IRS 990 preparation export is for review and accountant handoff only. It is not an official IRS filing and does not replace the IRS Form 990 or e-file submission process.",
  });

  return (
    await storeArtifact({
      db,
      env,
      orgId: params.orgId,
      entityId: params.entityId,
      userId: params.userId,
      type: "irs_990",
      format: "csv_bundle",
      title,
      fileName: `irs-990-${params.data.fiscalYear.toLowerCase()}.csv`,
      body: csv,
      metadata: { preview: { kind: "html", title, content: html } },
      fiscalYear: params.data.fiscalYear,
    })
  ).artifact;
}

export async function generateBoardReport(
  db: Database,
  env: ComplianceEnv,
  params: { orgId: string; entityId?: string; userId: string; data: GenerateBoardReportInput },
) {
  const org = await getOrganizationOrThrow(db, params.orgId);
  const entityId = params.entityId ?? org.defaultEntityId;
  if (!entityId) {
    throw internalError("Organization default entity is required to generate board reports");
  }
  const donorStats = await getDonorStats(db, {
    orgId: params.orgId,
    entityId,
    fiscalYearStartMonth: org.fiscalYearStartMonth,
  });
  const donorCounts = await getDonationBasedDonorCounts(db, {
    orgId: params.orgId,
    entityId,
    fiscalYearStartMonth: org.fiscalYearStartMonth,
  });
  const title = params.data.title?.trim() || `${params.data.fiscalYear} Board Report`;
  const cadence = params.data.cadence ?? "one_time";
  const selectedSections = getBoardPacketSections(params.data);
  const selectedSectionSet = new Set<BoardPacketSection>(selectedSections);
  const sections: ReportSection[] = [];
  const [grantTotals] = await db
    .select({
      count: count(),
      totalAmount: sql<number>`COALESCE(SUM(${grants.amountCents}), 0)`,
    })
    .from(grants)
    .where(
      and(eq(grants.orgId, params.orgId), eq(grants.entityId, entityId), isNull(grants.deletedAt)),
    );
  const [fundTotals] = await db
    .select({
      count: count(),
    })
    .from(funds)
    .where(
      and(eq(funds.orgId, params.orgId), eq(funds.entityId, entityId), isNull(funds.deletedAt)),
    );
  const boardFundRows = selectedSectionSet.has("fund_balances")
    ? await db.query.funds.findMany({
        where: and(
          eq(funds.orgId, params.orgId),
          eq(funds.entityId, entityId),
          isNull(funds.deletedAt),
        ),
        columns: {
          id: true,
          name: true,
          type: true,
        },
        with: {
          grantAllocations: {
            where: and(
              eq(grantFundAllocations.entityId, entityId),
              isNull(grantFundAllocations.deletedAt),
            ),
            with: { grant: { columns: { deletedAt: true } } },
          },
          expenses: {
            where: and(eq(expenses.entityId, entityId), isNull(expenses.deletedAt)),
          },
        },
        orderBy: [asc(funds.name)],
      })
    : [];
  const boardGrantRows = selectedSectionSet.has("compliance_deadlines")
    ? await db.query.grants.findMany({
        where: and(
          eq(grants.orgId, params.orgId),
          eq(grants.entityId, entityId),
          isNull(grants.deletedAt),
        ),
        columns: {
          name: true,
          status: true,
          applicationDeadline: true,
        },
        with: {
          reportingRequirements: {
            where: and(
              eq(grantReportingRequirements.entityId, entityId),
              isNull(grantReportingRequirements.deletedAt),
            ),
          },
        },
      })
    : [];

  if (selectedSectionSet.has("executive_snapshot")) {
    sections.push({
      kind: "keyValue",
      heading: BOARD_PACKET_SECTION_LABELS.executive_snapshot,
      rows: [
        { label: "Fiscal year", value: params.data.fiscalYear },
        { label: "Meeting date", value: params.data.meetingDate ?? "Not scheduled" },
        { label: "Cadence", value: formatBoardPacketCadence(cadence) },
        { label: "Total giving", value: formatCurrency(donorStats.totalGivingThisFY) },
        { label: "Grant value", value: formatCurrency(grantTotals?.totalAmount ?? 0) },
        { label: "Funds tracked", value: String(fundTotals?.count ?? 0) },
      ],
    });
  }

  if (selectedSectionSet.has("fundraising")) {
    sections.push({
      kind: "table",
      heading: BOARD_PACKET_SECTION_LABELS.fundraising,
      columns: ["Metric", "Value"],
      rows: [
        ["Total Giving", formatCurrency(donorStats.totalGivingThisFY)],
        ["Total Donors", String(donorCounts.totalDonors)],
        ["New Donors", String(donorCounts.newDonorsThisFY)],
        ["Retention Rate", `${(donorStats.retentionRate * 100).toFixed(0)}%`],
      ],
    });
  }

  if (selectedSectionSet.has("grant_pipeline")) {
    sections.push({
      kind: "table",
      heading: BOARD_PACKET_SECTION_LABELS.grant_pipeline,
      columns: ["Metric", "Value"],
      rows: [
        ["Open Grants", String(grantTotals?.count ?? 0)],
        ["Grant Value", formatCurrency(grantTotals?.totalAmount ?? 0)],
      ],
    });
  }

  if (selectedSectionSet.has("fund_balances")) {
    const fundRows = getBoardFundRows(boardFundRows as BoardFundRecord[]);
    sections.push({
      kind: "table",
      heading: BOARD_PACKET_SECTION_LABELS.fund_balances,
      columns: ["Fund", "Type", "Allocated", "Spent", "Current Balance"],
      rows:
        fundRows.length > 0
          ? fundRows
          : [["Funds Tracked", "--", "--", "--", String(fundTotals?.count ?? 0)]],
    });
  }

  if (selectedSectionSet.has("compliance_deadlines")) {
    const applicationDeadlineStart = params.data.meetingDate
      ? new Date(`${params.data.meetingDate}T00:00:00.000Z`)
      : new Date(new Date().toISOString().slice(0, 10));
    const deadlineItems = getBoardDeadlineItems(
      boardGrantRows as BoardGrantRecord[],
      applicationDeadlineStart,
    );
    sections.push({
      kind: "list",
      heading: BOARD_PACKET_SECTION_LABELS.compliance_deadlines,
      items: deadlineItems,
      emptyText: "No open deadlines in the current board packet window.",
    });
  }

  const html = renderReportDocument({
    org: {
      name: org.name,
      logoUrl: org.logoUrl,
      address: org.address,
      ein: org.ein,
    },
    title,
    subtitle: "Board Reporting Packet",
    periodLabel: params.data.fiscalYear,
    sections,
  });
  const pdf = await renderPdfFromHtml(env, html);

  return (
    await storeArtifact({
      db,
      env,
      orgId: params.orgId,
      entityId,
      userId: params.userId,
      type: "board",
      format: "pdf",
      title,
      fileName: `board-report-${params.data.fiscalYear.toLowerCase()}.pdf`,
      body: pdf,
      metadata: {
        preview: { kind: "html", title, content: html },
        composer: {
          cadence,
          meetingDate: params.data.meetingDate ?? null,
          sections: selectedSections,
        },
      },
      fiscalYear: params.data.fiscalYear,
    })
  ).artifact;
}

export async function generateAcknowledgmentLetter(
  db: Database,
  env: ComplianceEnv,
  params: {
    orgId: string;
    entityId?: string;
    userId: string;
    donationId: string;
    data: GenerateAcknowledgmentLetterInput;
  },
) {
  const org = await getOrganizationOrThrow(db, params.orgId);
  const template = await getStoredAcknowledgmentTemplate(db, params.orgId, org.name);
  // Core query builder, not the relational query API — donationEntityScope
  // embeds raw `sql` fragments referencing funds/grants/organizations
  // columns. The relational compiler re-qualifies every bare Column
  // reference in `where` with the base table's own alias, which would
  // corrupt those cross-table fragments and 500 in Postgres. The `with:
  // { contact }` relation eager-load becomes an explicit inner join.
  const [donationRow] = await db
    .select({
      id: donations.id,
      amountCents: donations.amountCents,
      date: donations.date,
      receiptSent: donations.receiptSent,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
      contactOrganizationName: contacts.organizationName,
      contactAddress: contacts.address,
      contactEmail: contacts.email,
    })
    .from(donations)
    .innerJoin(contacts, eq(contacts.id, donations.contactId))
    .where(
      and(
        eq(donations.id, params.donationId),
        eq(donations.orgId, params.orgId),
        donationEntityScope(params.orgId, params.entityId),
        isNull(donations.deletedAt),
      ),
    )
    .limit(1);

  if (!donationRow) {
    throw notFound("Donation not found");
  }

  const donation = {
    id: donationRow.id,
    amountCents: donationRow.amountCents,
    date: donationRow.date,
    receiptSent: donationRow.receiptSent,
    contact: {
      firstName: donationRow.contactFirstName,
      lastName: donationRow.contactLastName,
      organizationName: donationRow.contactOrganizationName,
      address: donationRow.contactAddress,
      email: donationRow.contactEmail,
    },
  };

  const donorName =
    donation.contact.organizationName ||
    [donation.contact.firstName, donation.contact.lastName].filter(Boolean).join(" ") ||
    donation.contact.email ||
    "Donor";
  const title = params.data.title?.trim() || `${donorName} Acknowledgment Letter`;
  const letterSections: ReportSection[] = [
    {
      kind: "paragraph",
      heading: "Acknowledgment",
      text: template.intro,
    },
    {
      kind: "keyValue",
      heading: "Contribution Summary",
      rows: [
        { label: "Donor", value: donorName },
        { label: "Contribution Date", value: formatDate(donation.date) },
        { label: "Contribution Amount", value: formatCurrency(donation.amountCents) },
      ],
    },
    {
      kind: "paragraph",
      heading: "Receipt Statement",
      text: template.body,
    },
    {
      kind: "paragraph",
      heading: "Closing",
      text: template.closing,
    },
  ];
  const bodyHtml = renderReportDocument({
    org: {
      name: org.name,
      logoUrl: org.logoUrl,
      address: org.address,
      ein: org.ein,
    },
    title,
    subtitle: "Donation Acknowledgment Letter",
    sections: letterSections,
  });
  const pdf = await renderPdfFromHtml(env, bodyHtml);

  const storedArtifact = await storeArtifact({
    db,
    env,
    orgId: params.orgId,
    userId: params.userId,
    type: "acknowledgment",
    format: "pdf",
    title,
    fileName: `acknowledgment-${params.donationId}.pdf`,
    body: pdf,
    metadata: { preview: { kind: "html", title, content: bodyHtml } },
    donationId: donation.id,
    entityId: params.entityId,
    deferReady: true,
  });

  try {
    const readyReport = await db.transaction(async (tx) => {
      const [updatedDonation] = await tx
        .update(donations)
        .set({ receiptSent: true })
        .where(
          and(
            eq(donations.id, donation.id),
            eq(donations.orgId, params.orgId),
            donationEntityScope(params.orgId, params.entityId),
            isNull(donations.deletedAt),
          ),
        )
        .returning({ id: donations.id });
      if (!updatedDonation) throw internalError("Failed to mark donation receipt as sent");

      const [ready] = await tx
        .update(generatedReports)
        .set({ status: "ready" })
        .where(
          and(
            eq(generatedReports.id, storedArtifact.reportId),
            eq(generatedReports.orgId, params.orgId),
            eq(generatedReports.status, "pending"),
          ),
        )
        .returning();
      if (!ready) throw internalError("Failed to mark generated report ready");
      return ready;
    });

    await deliverReportReadyEffects(db, env, readyReport.id);
    return toGeneratedReportArtifact(readyReport);
  } catch (error) {
    const failureState = await attemptFailedStatusUpdate({
      db,
      reportId: storedArtifact.reportId,
      metadata: buildFailureMetadata(
        { preview: { kind: "html", title, content: bodyHtml } },
        error instanceof Error ? error.message : "Failed to complete acknowledgment",
      ),
    });
    if (failureState === "failed") {
      await deleteStoredObject(db, env, storedArtifact.fileKey);
      throw error;
    }
    if (failureState === "not_pending") {
      const current = await db.query.generatedReports.findFirst({
        where: and(
          eq(generatedReports.id, storedArtifact.reportId),
          eq(generatedReports.orgId, params.orgId),
        ),
      });
      if (current?.status === "ready") {
        await deliverReportReadyEffects(db, env, current.id);
        return toGeneratedReportArtifact(current);
      }
    }
    throw error;
  }
}

function getDonorDisplayName(contact: YearEndDonationRecord["contact"]) {
  const individualName = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
  return contact.organizationName?.trim() || individualName || contact.email || "Donor";
}

function getCalendarYearRange(year: number) {
  return {
    start: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
  };
}

function getDeductibleAmountCents(donation: YearEndDonationRecord) {
  return Math.max(0, donation.amountCents - donation.goodsServicesValueCents);
}

function buildYearEndStatementSections(
  groupedDonations: Map<string, YearEndDonationRecord[]>,
): ReportSection[] {
  return [...groupedDonations.entries()].map(([, donorDonations]) => {
    const firstDonation = donorDonations[0]!;
    const donorName = getDonorDisplayName(firstDonation.contact);
    const totalGiftCents = donorDonations.reduce((sum, donation) => sum + donation.amountCents, 0);
    const goodsServicesCents = donorDonations.reduce(
      (sum, donation) => sum + donation.goodsServicesValueCents,
      0,
    );
    const deductibleCents = donorDonations.reduce(
      (sum, donation) => sum + getDeductibleAmountCents(donation),
      0,
    );
    const rows = donorDonations.map((donation) => [
      formatDate(donation.date),
      formatCurrency(donation.amountCents),
      formatCurrency(donation.goodsServicesValueCents),
      formatCurrency(getDeductibleAmountCents(donation)),
      donation.goodsServicesDescription ?? "None recorded",
    ]);

    return {
      kind: "table",
      heading: donorName,
      columns: ["Date", "Gift", "Goods/services", "Deductible", "Description"],
      rows,
      totalsRow: [
        "Total",
        formatCurrency(totalGiftCents),
        formatCurrency(goodsServicesCents),
        formatCurrency(deductibleCents),
        "",
      ],
    };
  });
}

export async function generateDonorYearEndStatementRun(
  db: Database,
  env: ComplianceEnv,
  params: {
    orgId: string;
    entityId?: string;
    userId: string;
    data: GenerateDonorYearEndStatementRunInput;
  },
) {
  const input = generateDonorYearEndStatementRunSchema.parse(params.data);
  const org = await getOrganizationOrThrow(db, params.orgId);
  const { start, end } = getCalendarYearRange(input.year);
  const title = input.title?.trim() || `${input.year} Donor Year-End Statements`;
  // Core query builder, not the relational query API — see the note on
  // generateAcknowledgmentLetter above for the re-qualification hazard this
  // avoids. The `with: { contact }` relation eager-load becomes an explicit
  // inner join, reshaped back into YearEndDonationRecord's nested shape.
  const donationRows = await db
    .select({
      id: donations.id,
      amountCents: donations.amountCents,
      goodsServicesValueCents: donations.goodsServicesValueCents,
      goodsServicesDescription: donations.goodsServicesDescription,
      date: donations.date,
      receiptSent: donations.receiptSent,
      contactId: donations.contactId,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
      contactOrganizationName: contacts.organizationName,
      contactAddress: contacts.address,
      contactEmail: contacts.email,
      contactEmailOptOut: contacts.emailOptOut,
    })
    .from(donations)
    .innerJoin(contacts, eq(contacts.id, donations.contactId))
    .where(
      and(
        eq(donations.orgId, params.orgId),
        donationEntityScope(params.orgId, params.entityId),
        isNull(donations.deletedAt),
        sql`${donations.date} >= ${start}`,
        sql`${donations.date} <= ${end}`,
        sql`${donations.amountCents} >= ${input.minimumAmountCents}`,
      ),
    )
    .orderBy(asc(donations.date));

  const rows: YearEndDonationRecord[] = donationRows.map((row) => ({
    id: row.id,
    amountCents: row.amountCents,
    goodsServicesValueCents: row.goodsServicesValueCents,
    goodsServicesDescription: row.goodsServicesDescription,
    date: row.date,
    receiptSent: row.receiptSent,
    contactId: row.contactId,
    contact: {
      firstName: row.contactFirstName,
      lastName: row.contactLastName,
      organizationName: row.contactOrganizationName,
      address: row.contactAddress,
      email: row.contactEmail,
      emailOptOut: row.contactEmailOptOut,
    },
  }));

  const groupedDonations = new Map<string, YearEndDonationRecord[]>();
  for (const donation of rows) {
    const existing = groupedDonations.get(donation.contactId) ?? [];
    existing.push(donation);
    groupedDonations.set(donation.contactId, existing);
  }

  const totalGiftCents = rows.reduce((sum, donation) => sum + donation.amountCents, 0);
  const goodsServicesCents = rows.reduce(
    (sum, donation) => sum + donation.goodsServicesValueCents,
    0,
  );
  const deductibleCents = rows.reduce(
    (sum, donation) => sum + getDeductibleAmountCents(donation),
    0,
  );

  const sections: ReportSection[] = [
    {
      kind: "keyValue",
      heading: "Run Summary",
      rows: [
        { label: "Calendar year", value: String(input.year) },
        { label: "Donors included", value: String(groupedDonations.size) },
        { label: "Gifts included", value: String(rows.length) },
        { label: "Total gifts", value: formatCurrency(totalGiftCents) },
        { label: "Goods and services", value: formatCurrency(goodsServicesCents) },
        { label: "Potentially deductible", value: formatCurrency(deductibleCents) },
      ],
    },
    ...buildYearEndStatementSections(groupedDonations),
  ];

  const html = renderReportDocument({
    org: {
      name: org.name,
      logoUrl: org.logoUrl,
      address: org.address,
      ein: org.ein,
    },
    title,
    subtitle: "Donor Year-End Statement Run",
    periodLabel: String(input.year),
    sections,
    footerNote:
      "This statement summarizes gifts recorded in GrantPipe for donor records. Donors should consult their tax advisor about deductibility.",
  });
  const pdf = await renderPdfFromHtml(env, html);

  const storedArtifact = await storeArtifact({
    db,
    env,
    orgId: params.orgId,
    entityId: params.entityId,
    userId: params.userId,
    type: "donor_year_end_statement",
    format: "pdf",
    title,
    fileName: `donor-year-end-statements-${input.year}.pdf`,
    body: pdf,
    metadata: {
      preview: { kind: "html", title, content: html },
    },
    fiscalYear: String(input.year),
    deferReady: true,
  });

  try {
    const readyReport = await db.transaction(async (tx) => {
      if (rows.length > 0) {
        const updatedDonations = await tx
          .update(donations)
          .set({ receiptSent: true })
          .where(
            and(
              eq(donations.orgId, params.orgId),
              donationEntityScope(params.orgId, params.entityId),
              isNull(donations.deletedAt),
              inArray(
                donations.id,
                rows.map((row) => row.id),
              ),
            ),
          )
          .returning({ id: donations.id });
        if (updatedDonations.length !== rows.length) {
          throw internalError("Failed to mark year-end statement donations as receipted");
        }
      }

      if (groupedDonations.size > 0) {
        await tx
          .insert(communicationLog)
          .values(
            [...groupedDonations.entries()].map(([contactId, donorDonations]) => {
              const totalDeductibleCents = donorDonations.reduce(
                (sum, donation) => sum + getDeductibleAmountCents(donation),
                0,
              );
              return {
                orgId: params.orgId,
                contactId,
                loggedBy: params.userId,
                type: "note",
                subject: `${input.year} year-end statement prepared`,
                body: `Prepared ${input.year} year-end statement. Potentially deductible total: ${formatCurrency(
                  totalDeductibleCents,
                )}.`,
                mailMergeAttemptId: storedArtifact.reportId,
              };
            }),
          )
          .onConflictDoNothing();
      }

      const [ready] = await tx
        .update(generatedReports)
        .set({ status: "ready" })
        .where(
          and(
            eq(generatedReports.id, storedArtifact.reportId),
            eq(generatedReports.orgId, params.orgId),
            eq(generatedReports.status, "pending"),
          ),
        )
        .returning();
      if (!ready) throw internalError("Failed to mark generated report ready");
      return ready;
    });

    await deliverReportReadyEffects(db, env, readyReport.id);
    return toGeneratedReportArtifact(readyReport);
  } catch (error) {
    const failureState = await attemptFailedStatusUpdate({
      db,
      reportId: storedArtifact.reportId,
      metadata: buildFailureMetadata(
        { preview: { kind: "html", title, content: html } },
        error instanceof Error ? error.message : "Failed to complete year-end statements",
      ),
    });
    if (failureState === "failed") {
      await deleteStoredObject(db, env, storedArtifact.fileKey);
      throw error;
    }
    if (failureState === "not_pending") {
      const current = await db.query.generatedReports.findFirst({
        where: and(
          eq(generatedReports.id, storedArtifact.reportId),
          eq(generatedReports.orgId, params.orgId),
        ),
      });
      if (current?.status === "ready") {
        await deliverReportReadyEffects(db, env, current.id);
        return toGeneratedReportArtifact(current);
      }
    }
    throw error;
  }
}

export async function generateSpendDownReport(
  db: Database,
  env: ComplianceEnv,
  params: {
    orgId: string;
    entityId?: string;
    userId: string;
    data: GenerateSpendDownReportInput;
  },
) {
  const org = await getOrganizationOrThrow(db, params.orgId);
  const spendDown = await getGrantSpendDown(db, {
    orgId: params.orgId,
    entityId: params.entityId,
    grantId: params.data.grantId,
    from: params.data.from ? new Date(params.data.from) : undefined,
    to: params.data.to ? new Date(params.data.to) : undefined,
  });

  const title = params.data.title?.trim() || `Spend-Down Report — Grant ${params.data.grantId}`;

  // ── Summary section ──────────────────────────────────────────────────────
  const summaryRows: [string, string][] = [
    ["Budget", spendDown.budgetCents != null ? formatCurrency(spendDown.budgetCents) : "--"],
    ["Spent", formatCurrency(spendDown.expensesCents)],
    [
      "Remaining",
      spendDown.remainingCents != null ? formatCurrency(spendDown.remainingCents) : "--",
    ],
    [
      "Burn Rate",
      spendDown.burnRateCentsPerMonth != null
        ? `${formatCurrency(spendDown.burnRateCentsPerMonth)}/mo`
        : "--",
    ],
    [
      "Projected Exhaustion",
      spendDown.projectedExhaustionDate ? formatDate(spendDown.projectedExhaustionDate) : "--",
    ],
    ["Threshold", spendDown.thresholdState ? `${spendDown.thresholdState}%` : "--"],
  ];

  const summarySection = {
    kind: "table" as const,
    heading: "Spend-Down Summary",
    columns: ["Metric", "Value"],
    rows: summaryRows,
  };

  // ── By Category section ───────────────────────────────────────────────────
  const byCategorySection =
    spendDown.byCategory.length === 0
      ? {
          kind: "list" as const,
          heading: "By Category",
          items: [] as string[],
          emptyText: "No expenses recorded.",
        }
      : {
          kind: "table" as const,
          heading: "By Category",
          columns: ["Category", "Amount"],
          rows: spendDown.byCategory.map((c) => [c.category, formatCurrency(c.amountCents)]),
          totalsRow: ["Total", formatCurrency(spendDown.expensesCents)],
        };

  // ── By Fund section ───────────────────────────────────────────────────────
  const byFundSection =
    spendDown.byFund.length === 0
      ? {
          kind: "list" as const,
          heading: "By Fund",
          items: [] as string[],
          emptyText: "No fund allocations recorded.",
        }
      : {
          kind: "table" as const,
          heading: "By Fund",
          columns: ["Fund", "Allocated", "Spent"],
          rows: spendDown.byFund.map((f) => [
            f.fundName,
            formatCurrency(f.allocatedAmountCents),
            formatCurrency(f.expensesCents),
          ]),
        };

  // ── By Month section ──────────────────────────────────────────────────────
  const byMonthSection =
    spendDown.byMonth.length === 0
      ? {
          kind: "list" as const,
          heading: "By Month",
          items: [] as string[],
          emptyText: "No expenses recorded.",
        }
      : {
          kind: "table" as const,
          heading: "By Month",
          columns: ["Month", "Amount"],
          rows: spendDown.byMonth.map((m) => [m.month, formatCurrency(m.amountCents)]),
          totalsRow: ["Total", formatCurrency(spendDown.expensesCents)],
        };

  const html = renderReportDocument({
    org: {
      name: org.name,
      logoUrl: org.logoUrl,
      address: org.address,
      ein: org.ein,
    },
    title,
    subtitle: "Spend-Down Analysis",
    periodLabel:
      params.data.from && params.data.to
        ? `${formatDate(params.data.from)} – ${formatDate(params.data.to)}`
        : "All time",
    sections: [summarySection, byCategorySection, byFundSection, byMonthSection],
  });

  const pdf = await renderPdfFromHtml(env, html);

  return (
    await storeArtifact({
      db,
      env,
      orgId: params.orgId,
      entityId: params.entityId,
      userId: params.userId,
      type: "spend_down",
      format: "pdf",
      title,
      fileName: `spend-down-${params.data.grantId}.pdf`,
      body: pdf,
      metadata: { preview: { kind: "html", title, content: html } },
      grantId: params.data.grantId,
    })
  ).artifact;
}
