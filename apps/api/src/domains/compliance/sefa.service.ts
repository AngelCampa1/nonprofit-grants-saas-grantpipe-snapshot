import { and, asc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import {
  expenses,
  generatedReports,
  grantFederalAwardMetadata,
  grants,
  organizations,
  type Database,
} from "@grantpipe/db";
import type {
  GenerateSefaReportInput,
  GeneratedReportArtifact,
  SefaTripwireResult,
} from "@grantpipe/shared";
import { escapeCsvCell } from "../../lib/csv";
import { internalError, notFound } from "../../lib/app-error";
import { getIntegrations } from "../../lib/integrations";
import { captureBackgroundException } from "../../lib/sentry";
import type { Bindings } from "../../types";
import { deliverReportReadyEffects } from "../report-builder/ready-effects";

const SINGLE_AUDIT_THRESHOLD_CENTS = 100_000_000;
const WATCH_THRESHOLD_RATIO = 0.8;

type SefaEnv = Pick<Bindings, "APP_URL" | "INTEGRATION_MODE" | "R2">;

type SefaOrganization = {
  id: string;
  name: string;
  ein: string | null;
  fiscalYearStartMonth: number;
};

type SefaSourceRow = {
  grantId: string;
  grantName: string;
  assistanceListingNumber: string | null;
  assistanceListingTitle: string | null;
  federalAgency: string | null;
  fain: string | null;
  passThroughEntityName: string | null;
  passThroughIdentifyingNumber: string | null;
  programName: string | null;
  clusterName: string | null;
  expendituresCents: number;
};

type RawSefaSourceRow = Omit<SefaSourceRow, "expendituresCents"> & {
  expendituresCents: number | string | null;
};

function fiscalYearNumber(label: string) {
  const match = label.match(/\d{4}/);
  if (!match) {
    throw internalError("Fiscal year must include a four-digit year");
  }
  return Number(match[0]);
}

function getFiscalYearBounds(fiscalYear: string, fiscalYearStartMonth: number) {
  const year = fiscalYearNumber(fiscalYear);
  const startYear = fiscalYearStartMonth === 1 ? year : year - 1;
  const start = new Date(Date.UTC(startYear, fiscalYearStartMonth - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(startYear + 1, fiscalYearStartMonth - 1, 0, 23, 59, 59, 999));
  return { start, end };
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function joinCsv(rows: Array<Array<string | number | null | undefined>>) {
  return rows.map((row) => row.map((cell) => escapeCsvCell(cell ?? "")).join(",")).join("\n");
}

function toArtifact(row: typeof generatedReports.$inferSelect): GeneratedReportArtifact {
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
    fiscalYear: row.fiscalYear ?? undefined,
    metadata:
      typeof row.metadata === "object" && row.metadata !== null
        ? (row.metadata as Record<string, unknown>)
        : undefined,
  };
}

async function getOrganization(db: Database, orgId: string): Promise<SefaOrganization> {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: {
      id: true,
      name: true,
      ein: true,
      fiscalYearStartMonth: true,
    },
  });

  if (!org) throw notFound("Organization not found");
  return org;
}

async function getDefaultEntityId(db: Database, orgId: string) {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: { defaultEntityId: true },
  });

  if (!org?.defaultEntityId) {
    throw internalError("Organization default entity is required to store generated reports");
  }
  return org.defaultEntityId;
}

async function loadSefaRows(
  db: Database,
  params: { orgId: string; entityId?: string; start: Date; end: Date },
): Promise<SefaSourceRow[]> {
  const rows = await db
    .select({
      grantId: grants.id,
      grantName: grants.name,
      assistanceListingNumber: grantFederalAwardMetadata.assistanceListingNumber,
      assistanceListingTitle: grantFederalAwardMetadata.assistanceListingTitle,
      federalAgency: grantFederalAwardMetadata.federalAgency,
      fain: grantFederalAwardMetadata.fain,
      passThroughEntityName: grantFederalAwardMetadata.passThroughEntityName,
      passThroughIdentifyingNumber: grantFederalAwardMetadata.passThroughIdentifyingNumber,
      programName: grantFederalAwardMetadata.programName,
      clusterName: grantFederalAwardMetadata.clusterName,
      expendituresCents: sql<number>`COALESCE(SUM(${expenses.amountCents}), 0)`,
    })
    .from(grantFederalAwardMetadata)
    .innerJoin(
      grants,
      and(
        eq(grants.id, grantFederalAwardMetadata.grantId),
        eq(grants.orgId, params.orgId),
        params.entityId ? eq(grants.entityId, params.entityId) : undefined,
        isNull(grants.deletedAt),
      ),
    )
    .leftJoin(
      expenses,
      and(
        eq(expenses.grantId, grants.id),
        eq(expenses.orgId, params.orgId),
        params.entityId ? eq(expenses.entityId, params.entityId) : undefined,
        isNull(expenses.deletedAt),
        gte(expenses.date, params.start),
        lte(expenses.date, params.end),
      ),
    )
    .where(
      and(
        eq(grantFederalAwardMetadata.orgId, params.orgId),
        params.entityId ? eq(grantFederalAwardMetadata.entityId, params.entityId) : undefined,
        isNull(grantFederalAwardMetadata.deletedAt),
      ),
    )
    .groupBy(
      grants.id,
      grants.name,
      grantFederalAwardMetadata.assistanceListingNumber,
      grantFederalAwardMetadata.assistanceListingTitle,
      grantFederalAwardMetadata.federalAgency,
      grantFederalAwardMetadata.fain,
      grantFederalAwardMetadata.passThroughEntityName,
      grantFederalAwardMetadata.passThroughIdentifyingNumber,
      grantFederalAwardMetadata.programName,
      grantFederalAwardMetadata.clusterName,
    )
    .orderBy(asc(grants.name));
  return (rows as RawSefaSourceRow[])
    .map((row) => ({
      ...row,
      expendituresCents: Number(row.expendituresCents ?? 0),
    }))
    .filter((row) => row.expendituresCents > 0);
}

function buildTripwire(params: {
  fiscalYear: string;
  start: Date;
  end: Date;
  rows: SefaSourceRow[];
}): SefaTripwireResult {
  const warnings: SefaTripwireResult["warnings"] = [];
  const rows = params.rows.map((row) => {
    const rowWarnings: SefaTripwireResult["warnings"] = [];
    if (!row.assistanceListingNumber) {
      rowWarnings.push({
        grantId: row.grantId,
        grantName: row.grantName,
        field: "assistanceListingNumber",
        message: "Assistance Listing Number is missing.",
      });
    }
    if (!row.federalAgency) {
      rowWarnings.push({
        grantId: row.grantId,
        grantName: row.grantName,
        field: "federalAgency",
        message: "Federal agency is missing.",
      });
    }
    warnings.push(...rowWarnings);

    return {
      ...row,
      metadataStatus:
        rowWarnings.length === 0 ? ("complete" as const) : ("missing_metadata" as const),
      warnings: rowWarnings,
    };
  });

  const totalFederalExpendituresCents = rows.reduce((sum, row) => sum + row.expendituresCents, 0);
  const thresholdPercent = (totalFederalExpendituresCents / SINGLE_AUDIT_THRESHOLD_CENTS) * 100;
  const state =
    totalFederalExpendituresCents >= SINGLE_AUDIT_THRESHOLD_CENTS
      ? "crossed"
      : totalFederalExpendituresCents >= SINGLE_AUDIT_THRESHOLD_CENTS * WATCH_THRESHOLD_RATIO
        ? "watch"
        : "clear";

  return {
    fiscalYear: params.fiscalYear,
    periodStart: params.start.toISOString(),
    periodEnd: params.end.toISOString(),
    thresholdCents: SINGLE_AUDIT_THRESHOLD_CENTS,
    totalFederalExpendituresCents,
    remainingToThresholdCents: Math.max(
      0,
      SINGLE_AUDIT_THRESHOLD_CENTS - totalFederalExpendituresCents,
    ),
    thresholdPercent,
    state,
    rows,
    warnings,
  };
}

export async function getSefaTripwire(
  db: Database,
  params: { orgId: string; entityId?: string; fiscalYear: string; now?: Date },
) {
  const org = await getOrganization(db, params.orgId);
  const { start, end } = getFiscalYearBounds(params.fiscalYear, org.fiscalYearStartMonth);
  const rows = await loadSefaRows(db, {
    orgId: params.orgId,
    entityId: params.entityId,
    start,
    end,
  });
  return buildTripwire({ fiscalYear: params.fiscalYear, start, end, rows });
}

function buildCsvBundle(org: SefaOrganization, tripwire: SefaTripwireResult) {
  const sefaCsv = joinCsv([
    [
      "Organization",
      "Fiscal Year",
      "Grant ID",
      "Grant Name",
      "Federal Agency",
      "ALN",
      "FAIN",
      "Pass-Through Entity",
      "Pass-Through ID",
      "Program",
      "Cluster",
      "Expenditures",
      "Metadata Status",
    ],
    ...tripwire.rows.map((row) => [
      org.name,
      tripwire.fiscalYear,
      row.grantId,
      row.grantName,
      row.federalAgency ?? "",
      row.assistanceListingNumber ?? "",
      row.fain ?? "",
      row.passThroughEntityName ?? "",
      row.passThroughIdentifyingNumber ?? "",
      row.programName ?? "",
      row.clusterName ?? "",
      row.expendituresCents,
      row.metadataStatus,
    ]),
  ]);
  const summaryCsv = joinCsv([
    ["Metric", "Value"],
    ["Federal expenditures", tripwire.totalFederalExpendituresCents],
    ["Single-audit threshold", tripwire.thresholdCents],
    ["Remaining to threshold", tripwire.remainingToThresholdCents],
    ["Tripwire state", tripwire.state],
  ]);

  return ["# sefa.csv", sefaCsv, "", "# summary.csv", summaryCsv].join("\n");
}

function buildPreview(org: SefaOrganization, title: string, tripwire: SefaTripwireResult) {
  const escapeHtml = (value: string | null | undefined) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char]!,
    );
  const warningItems = tripwire.warnings
    .map(
      (warning) =>
        `<li>${escapeHtml(warning.grantName?.trim() || warning.grantId)}: ${escapeHtml(
          warning.message,
        )}</li>`,
    )
    .join("");
  const rows = tripwire.rows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.grantName)}</td><td>${escapeHtml(
          row.federalAgency,
        )}</td><td>${escapeHtml(row.assistanceListingNumber)}</td><td>${formatCurrency(
          row.expendituresCents,
        )}</td><td>${escapeHtml(row.metadataStatus)}</td></tr>`,
    )
    .join("");

  return `<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(org.name)} ${escapeHtml(tripwire.fiscalYear)}</p>
<h2>Single-audit tripwire</h2>
<p>${formatCurrency(tripwire.totalFederalExpendituresCents)} in federal expenditures against the ${formatCurrency(
    tripwire.thresholdCents,
  )} threshold. Status: ${escapeHtml(tripwire.state)}.</p>
<table><thead><tr><th>Grant</th><th>Agency</th><th>ALN</th><th>Expenditures</th><th>Metadata</th></tr></thead><tbody>${rows}</tbody></table>
${warningItems ? `<h2>Warnings</h2><ul>${warningItems}</ul>` : ""}`;
}

export async function generateSefaReport(
  db: Database,
  env: SefaEnv,
  params: {
    orgId: string;
    entityId?: string;
    userId: string;
    data: GenerateSefaReportInput;
  },
) {
  const org = await getOrganization(db, params.orgId);
  const tripwire = await getSefaTripwire(db, {
    orgId: params.orgId,
    entityId: params.entityId,
    fiscalYear: params.data.fiscalYear,
  });
  const entityId = params.entityId ?? (await getDefaultEntityId(db, params.orgId));
  const reportId = crypto.randomUUID();
  const title = params.data.title?.trim() || `${params.data.fiscalYear} SEFA Draft`;
  const fileName = `sefa-${params.data.fiscalYear.toLowerCase()}.csv`;
  const body = buildCsvBundle(org, tripwire);
  const preview = buildPreview(org, title, tripwire);
  const metadata = {
    preview: { kind: "html" as const, title, content: preview },
    tripwire,
  };
  const fileKey = `${params.orgId}/sefa/${reportId}/${fileName}`;
  const bodySize = new TextEncoder().encode(body).byteLength;

  const [row] = await db
    .insert(generatedReports)
    .values({
      id: reportId,
      orgId: params.orgId,
      entityId,
      type: "sefa",
      format: "csv_bundle",
      status: "pending",
      readyEffectsStatus: "pending",
      title,
      fiscalYear: params.data.fiscalYear,
      fileKey,
      fileName,
      fileSizeBytes: bodySize,
      metadata,
      generatedBy: params.userId,
    })
    .returning();

  if (!row) throw internalError("Failed to create generated report");

  const storage = getIntegrations(db, env as Bindings).storage;

  try {
    await storage.put({
      key: fileKey,
      body,
      contentType: "text/csv; charset=utf-8",
      fileName,
      source: {
        orgId: params.orgId,
        entityType: "generated_report",
        entityId: row.id,
      },
    });

    const [readyRow] = await db
      .update(generatedReports)
      .set({ status: "ready", metadata })
      .where(
        and(
          eq(generatedReports.id, row.id),
          eq(generatedReports.orgId, params.orgId),
          eq(generatedReports.status, "pending"),
        ),
      )
      .returning();

    if (!readyRow) throw internalError("Failed to mark generated report ready");
    await deliverReportReadyEffects(db, env, readyRow.id);
    return toArtifact(readyRow);
  } catch (error) {
    let failureState: "failed" | "not_pending" | "unknown" = "unknown";
    try {
      const [failed] = await db
        .update(generatedReports)
        .set({
          status: "failed",
          metadata: {
            ...metadata,
            failure: {
              stage: "sefa_report_generation",
              errorName: error instanceof Error ? error.name : "UnknownError",
            },
          },
        })
        .where(and(eq(generatedReports.id, row.id), eq(generatedReports.status, "pending")))
        .returning({ id: generatedReports.id });
      failureState = failed ? "failed" : "not_pending";
    } catch (statusError) {
      captureBackgroundException(statusError, "compliance", {
        step: "sefa_report_failed_status",
      });
    }

    if (failureState === "not_pending") {
      try {
        const current = await db.query.generatedReports.findFirst({
          where: and(eq(generatedReports.id, row.id), eq(generatedReports.orgId, params.orgId)),
        });
        if (current?.status === "ready") {
          captureBackgroundException(error, "compliance", {
            step: "sefa_report_ready_reconciled",
          });
          return toArtifact(current);
        }
      } catch (reconcileError) {
        captureBackgroundException(reconcileError, "compliance", {
          step: "sefa_report_failure_reconcile",
        });
      }
    }

    if (failureState === "failed") {
      await storage.delete(fileKey).catch((cleanupError: unknown) => {
        captureBackgroundException(cleanupError, "compliance", {
          step: "sefa_report_cleanup",
        });
      });
    }
    throw error;
  }
}
