import { and, eq, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import {
  documents,
  donations,
  fiscalPeriods,
  funds,
  grantCloseoutItems,
  grantReportingRequirements,
  grants,
  organizations,
  restrictionAdditions,
  restrictionReleases,
  restrictionTerms,
  type Database,
} from "@grantpipe/db";
import {
  RADAR_OBLIGATION_KINDS,
  REPORT_TYPE_LABELS,
  type RadarObligation,
  type RadarObligationKind,
  type RadarObligationStatus,
  type RadarUrgencyBand,
  type ReportType,
} from "@grantpipe/shared";
import { getDaysUntilDeadline } from "../notifications/reminders";
import { documentParentEntityScope } from "../documents/entityScope";

type RadarTotals = Record<RadarObligationKind, number>;

export type BandedObligations = {
  asOf: string;
  bands: Record<RadarUrgencyBand, RadarObligation[]>;
  totals: RadarTotals;
};

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function deriveStatus(daysUntilDue: number): Exclude<RadarObligationStatus, "resolved"> {
  if (daysUntilDue < 0) return "overdue";
  if (daysUntilDue === 0) return "due_today";
  return "upcoming";
}

function deriveBand(daysUntilDue: number): RadarUrgencyBand {
  if (daysUntilDue < 0) return "overdue";
  if (daysUntilDue === 0) return "due_today";
  if (daysUntilDue <= 7) return "this_week";
  if (daysUntilDue <= 30) return "this_month";
  return "later";
}

function emptyTotals(): RadarTotals {
  return {
    application_deadline: 0,
    reporting_requirement: 0,
    closeout_item: 0,
    restriction_release: 0,
    period_close: 0,
  };
}

/**
 * Pure banding/sorting. Sorts obligations chronologically (then by kind for a
 * stable order) and groups them into the five urgency bands, with per-kind
 * totals. No DB access — fully unit-testable.
 */
export function bandObligations(obligations: RadarObligation[], now: Date): BandedObligations {
  const bands: Record<RadarUrgencyBand, RadarObligation[]> = {
    overdue: [],
    due_today: [],
    this_week: [],
    this_month: [],
    later: [],
  };
  const totals = emptyTotals();

  const sorted = [...obligations].sort((left, right) => {
    const dateOrder = left.dueDate.localeCompare(right.dueDate);
    if (dateOrder !== 0) return dateOrder;
    const kindOrder =
      RADAR_OBLIGATION_KINDS.indexOf(left.kind) - RADAR_OBLIGATION_KINDS.indexOf(right.kind);
    if (kindOrder !== 0) return kindOrder;
    return left.id.localeCompare(right.id);
  });

  for (const obligation of sorted) {
    bands[obligation.urgencyBand].push(obligation);
    totals[obligation.kind] += 1;
  }

  return {
    asOf: now.toISOString(),
    bands,
    totals,
  };
}

// ---------------------------------------------------------------------------
// Pure per-source mappers — each turns one source row into a RadarObligation,
// computing status + daysUntilDue. Resolved rows return null unless
// includeResolved is true.
// ---------------------------------------------------------------------------

type MapperContext = {
  now: Date;
  timeZone: string;
  includeResolved: boolean;
};

function buildObligation(params: {
  kind: RadarObligationKind;
  sourceId: string;
  title: string;
  contextLabel: string;
  dueDate: Date;
  resolved: boolean;
  target: RadarObligation["target"];
  context: MapperContext;
}): RadarObligation | null {
  if (params.resolved && !params.context.includeResolved) return null;
  const daysUntilDue = getDaysUntilDeadline(
    params.dueDate,
    params.context.timeZone,
    params.context.now,
  );
  return {
    id: `${params.kind}:${params.sourceId}`,
    kind: params.kind,
    title: params.title,
    contextLabel: params.contextLabel,
    dueDate: params.dueDate.toISOString(),
    daysUntilDue,
    status: params.resolved ? "resolved" : deriveStatus(daysUntilDue),
    urgencyBand: deriveBand(daysUntilDue),
    target: params.target,
  };
}

export type ApplicationDeadlineRow = {
  id: string;
  name: string;
  applicationDeadline: Date | string | null;
};

export function mapApplicationDeadline(
  row: ApplicationDeadlineRow,
  context: MapperContext,
): RadarObligation | null {
  if (!row.applicationDeadline) return null;
  return buildObligation({
    kind: "application_deadline",
    sourceId: row.id,
    title: "Application deadline",
    contextLabel: row.name,
    dueDate: asDate(row.applicationDeadline),
    // Application deadlines have no resolved state in the data model.
    resolved: false,
    target: { type: "grant", id: row.id },
    context,
  });
}

export type ReportingRequirementRow = {
  id: string;
  grantId: string;
  grantName: string;
  reportType: string;
  dueDate: Date | string | null;
  status: string;
};

/**
 * Builds a human-readable title for a reporting requirement. `reportType` is a
 * free-text column: the create form constrains it to the REPORT_TYPES enum, but
 * the AI document-extraction path stores whatever descriptive name the source
 * document used. So we (a) humanize known enum keys via REPORT_TYPE_LABELS and
 * (b) only append " report" when the value does not already read as a report,
 * avoiding "... Report report".
 */
export function buildReportingTitle(reportType: string): string {
  const normalized = reportType.trim();
  if (!normalized) return "Report";
  const label = REPORT_TYPE_LABELS[normalized as ReportType];
  if (label) return `${label} report`;
  return /\breports?\b/i.test(normalized) ? normalized : `${normalized} report`;
}

export function mapReportingRequirement(
  row: ReportingRequirementRow,
  context: MapperContext,
): RadarObligation | null {
  if (!row.dueDate) return null;
  return buildObligation({
    kind: "reporting_requirement",
    sourceId: row.id,
    title: buildReportingTitle(row.reportType),
    contextLabel: row.grantName,
    dueDate: asDate(row.dueDate),
    resolved: row.status === "submitted",
    target: { type: "grant", id: row.grantId },
    context,
  });
}

export type CloseoutItemRow = {
  id: string;
  grantId: string;
  grantName: string;
  label: string;
  dueDate: Date | string | null;
  completed: boolean;
};

export function mapCloseoutItem(
  row: CloseoutItemRow,
  context: MapperContext,
): RadarObligation | null {
  if (!row.dueDate) return null;
  return buildObligation({
    kind: "closeout_item",
    sourceId: row.id,
    title: row.label,
    contextLabel: row.grantName,
    dueDate: asDate(row.dueDate),
    resolved: row.completed,
    target: { type: "grant", id: row.grantId },
    context,
  });
}

export type RestrictionReleaseRow = {
  id: string;
  title: string;
  fundId: string | null;
  grantId: string | null;
  endDate: Date | string | null;
  remainingCents: number;
};

export function mapRestrictionRelease(
  row: RestrictionReleaseRow,
  context: MapperContext,
): RadarObligation | null {
  if (!row.endDate) return null;
  // A restriction is "released"/resolved once nothing remains to spend down.
  const resolved = row.remainingCents <= 0;
  // Link through to the fund, then the grant. A term tied only to a donation has
  // no target the web UI can navigate to (it handles grant/fund/fiscal_period
  // only), so it is dropped from the feed.
  const target: RadarObligation["target"] | null = row.fundId
    ? { type: "fund", id: row.fundId }
    : row.grantId
      ? { type: "grant", id: row.grantId }
      : null;
  if (!target) return null;
  return buildObligation({
    kind: "restriction_release",
    sourceId: row.id,
    title: row.title,
    contextLabel: "Restriction release",
    dueDate: asDate(row.endDate),
    resolved,
    target,
    context,
  });
}

export type PeriodCloseRow = {
  id: string;
  name: string;
  endDate: Date | string;
  status: string;
};

export function mapPeriodClose(
  row: PeriodCloseRow,
  context: MapperContext,
): RadarObligation | null {
  // A period is resolved once it is closed or locked; open periods are due to
  // close after their endDate.
  const resolved = row.status === "closed" || row.status === "locked";
  return buildObligation({
    kind: "period_close",
    sourceId: row.id,
    title: `Close ${row.name}`,
    contextLabel: row.name,
    dueDate: asDate(row.endDate),
    resolved,
    target: { type: "fiscal_period", id: row.id },
    context,
  });
}

// ---------------------------------------------------------------------------
// Collector — runs the five org-scoped, soft-delete-aware queries and returns
// the normalized obligations. Read-only over existing tables.
// ---------------------------------------------------------------------------

export type CollectObligationsParams = {
  orgId: string;
  entityId: string;
  now: Date;
  horizonDays: number;
  kinds?: RadarObligationKind[];
  includeResolved?: boolean;
};

export type ResolvedRestrictionOwner<T> = { linked: false } | { linked: true; record: T | null };

type EntityOwnedRecord = {
  orgId: string;
  entityId: string;
  deletedAt?: Date | null;
};

type DonationOwnedRecord = {
  orgId: string;
  deletedAt?: Date | null;
  fund: ResolvedRestrictionOwner<EntityOwnedRecord>;
  grant: ResolvedRestrictionOwner<EntityOwnedRecord>;
};

type DocumentOwnedRecord = {
  orgId: string;
  deletedAt?: Date | null;
} & (
  | {
      entityType: "fund" | "grant" | "generated_report";
      owner: ResolvedRestrictionOwner<EntityOwnedRecord>;
    }
  | {
      entityType: "donation";
      owner: ResolvedRestrictionOwner<DonationOwnedRecord>;
    }
  | { entityType: "org_global" }
);

type RestrictionOwnershipBindings<T> = {
  isDefaultEntity: T;
  fund: { linked: T; unlinked: T; matches: T };
  grant: { linked: T; unlinked: T; matches: T };
  donation: { linked: T; unlinked: T; matches: T };
  document: { linked: T; unlinked: T; matches: T };
};

function combineRestrictionOwnershipBindings<T>(
  operations: {
    and: (...values: T[]) => T;
    or: (...values: T[]) => T;
  },
  bindings: RestrictionOwnershipBindings<T>,
) {
  return operations.and(
    operations.or(bindings.fund.unlinked, bindings.fund.matches),
    operations.or(bindings.grant.unlinked, bindings.grant.matches),
    operations.or(bindings.donation.unlinked, bindings.donation.matches),
    operations.or(bindings.document.unlinked, bindings.document.matches),
    operations.or(
      bindings.fund.linked,
      bindings.grant.linked,
      bindings.donation.linked,
      bindings.document.linked,
      bindings.isDefaultEntity,
    ),
  );
}

function entityOwnerMatches(
  owner: ResolvedRestrictionOwner<EntityOwnedRecord>,
  orgId: string,
  entityId: string,
) {
  return (
    owner.linked &&
    owner.record != null &&
    owner.record.orgId === orgId &&
    owner.record.entityId === entityId &&
    owner.record.deletedAt == null
  );
}

function donationOwnerMatches(
  owner: ResolvedRestrictionOwner<DonationOwnedRecord>,
  params: { orgId: string; entityId: string; isDefaultEntity: boolean },
) {
  if (!owner.linked || !owner.record) return false;
  return (
    owner.record.orgId === params.orgId &&
    owner.record.deletedAt == null &&
    (!owner.record.fund.linked ||
      entityOwnerMatches(owner.record.fund, params.orgId, params.entityId)) &&
    (!owner.record.grant.linked ||
      entityOwnerMatches(owner.record.grant, params.orgId, params.entityId)) &&
    (owner.record.fund.linked || owner.record.grant.linked || params.isDefaultEntity)
  );
}

function documentOwnerMatches(
  owner: ResolvedRestrictionOwner<DocumentOwnedRecord>,
  params: { orgId: string; entityId: string; isDefaultEntity: boolean },
) {
  if (
    !owner.linked ||
    !owner.record ||
    owner.record.orgId !== params.orgId ||
    owner.record.deletedAt != null
  ) {
    return false;
  }
  if (owner.record.entityType === "org_global") return params.isDefaultEntity;
  if (owner.record.entityType === "donation") {
    return donationOwnerMatches(owner.record.owner, params);
  }
  return entityOwnerMatches(owner.record.owner, params.orgId, params.entityId);
}

export function restrictionTermOwnershipAllows(params: {
  orgId: string;
  entityId: string;
  defaultEntityId: string | null;
  fund: ResolvedRestrictionOwner<EntityOwnedRecord>;
  grant: ResolvedRestrictionOwner<EntityOwnedRecord>;
  donation: ResolvedRestrictionOwner<DonationOwnedRecord>;
  document: ResolvedRestrictionOwner<DocumentOwnedRecord>;
}) {
  const isDefaultEntity = params.defaultEntityId === params.entityId;
  return combineRestrictionOwnershipBindings(
    {
      and: (...values) => values.every(Boolean),
      or: (...values) => values.some(Boolean),
    },
    {
      isDefaultEntity,
      fund: {
        linked: params.fund.linked,
        unlinked: !params.fund.linked,
        matches: entityOwnerMatches(params.fund, params.orgId, params.entityId),
      },
      grant: {
        linked: params.grant.linked,
        unlinked: !params.grant.linked,
        matches: entityOwnerMatches(params.grant, params.orgId, params.entityId),
      },
      donation: {
        linked: params.donation.linked,
        unlinked: !params.donation.linked,
        matches: donationOwnerMatches(params.donation, {
          orgId: params.orgId,
          entityId: params.entityId,
          isDefaultEntity,
        }),
      },
      document: {
        linked: params.document.linked,
        unlinked: !params.document.linked,
        matches: documentOwnerMatches(params.document, {
          orgId: params.orgId,
          entityId: params.entityId,
          isDefaultEntity,
        }),
      },
    },
  );
}

function defaultEntityScope(orgId: string, entityId: string) {
  return sql`EXISTS (
    SELECT 1 FROM ${organizations}
    WHERE ${organizations.id} = ${orgId}
      AND ${organizations.defaultEntityId} = ${entityId}
  )`;
}

function donationEntityScope(
  donationId: SQL | typeof restrictionTerms.donationId | typeof documents.entityId,
  orgId: string,
  entityId: string,
) {
  const isDefaultEntity = defaultEntityScope(orgId, entityId);
  return sql`EXISTS (
    SELECT 1 FROM ${donations}
    WHERE ${donations.id} = ${donationId}
      AND ${donations.orgId} = ${orgId}
      AND ${donations.deletedAt} IS NULL
      AND (
        ${donations.fundId} IS NULL
        OR EXISTS (
          SELECT 1 FROM ${funds}
          WHERE ${funds.id} = ${donations.fundId}
            AND ${funds.orgId} = ${orgId}
            AND ${funds.entityId} = ${entityId}
            AND ${funds.deletedAt} IS NULL
        )
      )
      AND (
        ${donations.grantId} IS NULL
        OR EXISTS (
          SELECT 1 FROM ${grants}
          WHERE ${grants.id} = ${donations.grantId}
            AND ${grants.orgId} = ${orgId}
            AND ${grants.entityId} = ${entityId}
            AND ${grants.deletedAt} IS NULL
        )
      )
      AND (
        ${donations.fundId} IS NOT NULL
        OR ${donations.grantId} IS NOT NULL
        OR ${isDefaultEntity}
      )
  )`;
}

function restrictionDocumentEntityScope(orgId: string, entityId: string) {
  return sql`EXISTS (
    SELECT 1 FROM ${documents}
    WHERE ${documents.id} = ${restrictionTerms.sourceDocumentId}
      AND ${documents.orgId} = ${orgId}
      AND ${documents.deletedAt} IS NULL
      AND ${documentParentEntityScope({
        orgId,
        selectedEntityId: entityId,
        entityType: documents.entityType,
        entityId: documents.entityId,
      })}
  )`;
}

function restrictionTermEntityScope(orgId: string, entityId: string) {
  const isDefaultEntity = defaultEntityScope(orgId, entityId);
  const fundIsInEntity = sql`EXISTS (
    SELECT 1 FROM ${funds}
    WHERE ${funds.id} = ${restrictionTerms.fundId}
      AND ${funds.orgId} = ${orgId}
      AND ${funds.entityId} = ${entityId}
      AND ${funds.deletedAt} IS NULL
  )`;
  const grantIsInEntity = sql`EXISTS (
    SELECT 1 FROM ${grants}
    WHERE ${grants.id} = ${restrictionTerms.grantId}
      AND ${grants.orgId} = ${orgId}
      AND ${grants.entityId} = ${entityId}
      AND ${grants.deletedAt} IS NULL
  )`;

  return combineRestrictionOwnershipBindings(
    { and: (...values) => and(...values)!, or: (...values) => or(...values)! },
    {
      isDefaultEntity,
      fund: {
        linked: isNotNull(restrictionTerms.fundId),
        unlinked: isNull(restrictionTerms.fundId),
        matches: fundIsInEntity,
      },
      grant: {
        linked: isNotNull(restrictionTerms.grantId),
        unlinked: isNull(restrictionTerms.grantId),
        matches: grantIsInEntity,
      },
      donation: {
        linked: isNotNull(restrictionTerms.donationId),
        unlinked: isNull(restrictionTerms.donationId),
        matches: donationEntityScope(restrictionTerms.donationId, orgId, entityId),
      },
      document: {
        linked: isNotNull(restrictionTerms.sourceDocumentId),
        unlinked: isNull(restrictionTerms.sourceDocumentId),
        matches: restrictionDocumentEntityScope(orgId, entityId),
      },
    },
  );
}

function isKindEnabled(kind: RadarObligationKind, kinds?: RadarObligationKind[]): boolean {
  return !kinds || kinds.includes(kind);
}

/**
 * Pure horizon post-filter. Overdue and due-today obligations are always kept so
 * nothing urgent is ever hidden. Any other (non-overdue) obligation due more
 * than `horizonDays` ahead is excluded — that is the documented bound on how far
 * forward upcoming obligations are surfaced.
 */
export function applyHorizon(
  obligations: RadarObligation[],
  horizonDays: number,
): RadarObligation[] {
  return obligations.filter(
    (obligation) => obligation.daysUntilDue <= 0 || obligation.daysUntilDue <= horizonDays,
  );
}

export async function collectObligations(
  db: Database,
  params: CollectObligationsParams,
): Promise<RadarObligation[]> {
  const organization = await db.query.organizations.findFirst({
    where: eq(organizations.id, params.orgId),
    columns: { timezone: true },
  });

  if (!organization) {
    throw new Error("Organization not found");
  }

  const context: MapperContext = {
    now: params.now,
    timeZone: organization.timezone,
    includeResolved: params.includeResolved ?? false,
  };

  const obligations: RadarObligation[] = [];

  if (isKindEnabled("application_deadline", params.kinds)) {
    const rows = await db
      .select({
        id: grants.id,
        name: grants.name,
        applicationDeadline: grants.applicationDeadline,
      })
      .from(grants)
      .where(
        and(
          eq(grants.orgId, params.orgId),
          eq(grants.entityId, params.entityId),
          isNull(grants.deletedAt),
        ),
      );
    for (const row of rows) {
      const obligation = mapApplicationDeadline(row, context);
      if (obligation) obligations.push(obligation);
    }
  }

  if (isKindEnabled("reporting_requirement", params.kinds)) {
    const rows = await db
      .select({
        id: grantReportingRequirements.id,
        grantId: grantReportingRequirements.grantId,
        grantName: grants.name,
        reportType: grantReportingRequirements.reportType,
        dueDate: grantReportingRequirements.dueDate,
        status: grantReportingRequirements.status,
      })
      .from(grantReportingRequirements)
      .innerJoin(grants, eq(grants.id, grantReportingRequirements.grantId))
      .where(
        and(
          eq(grantReportingRequirements.orgId, params.orgId),
          eq(grantReportingRequirements.entityId, params.entityId),
          isNull(grantReportingRequirements.deletedAt),
          eq(grants.orgId, params.orgId),
          eq(grants.entityId, params.entityId),
          isNull(grants.deletedAt),
        ),
      );
    for (const row of rows) {
      const obligation = mapReportingRequirement(row, context);
      if (obligation) obligations.push(obligation);
    }
  }

  if (isKindEnabled("closeout_item", params.kinds)) {
    const rows = await db
      .select({
        id: grantCloseoutItems.id,
        grantId: grantCloseoutItems.grantId,
        grantName: grants.name,
        label: grantCloseoutItems.label,
        dueDate: grantCloseoutItems.dueDate,
        completed: grantCloseoutItems.completed,
      })
      .from(grantCloseoutItems)
      .innerJoin(grants, eq(grants.id, grantCloseoutItems.grantId))
      .where(
        and(
          eq(grantCloseoutItems.orgId, params.orgId),
          eq(grantCloseoutItems.entityId, params.entityId),
          isNull(grantCloseoutItems.deletedAt),
          eq(grants.orgId, params.orgId),
          eq(grants.entityId, params.entityId),
          isNull(grants.deletedAt),
        ),
      );
    for (const row of rows) {
      const obligation = mapCloseoutItem(row, context);
      if (obligation) obligations.push(obligation);
    }
  }

  if (isKindEnabled("restriction_release", params.kinds)) {
    const additionsTotal = sql<string | null>`(
      SELECT SUM(amount_cents)::text FROM ${restrictionAdditions}
      WHERE restriction_term_id = ${restrictionTerms.id}
        AND org_id = ${params.orgId}
        AND deleted_at IS NULL
    )`;
    const releasesTotal = sql<string | null>`(
      SELECT SUM(amount_cents)::text FROM ${restrictionReleases}
      WHERE restriction_term_id = ${restrictionTerms.id}
        AND org_id = ${params.orgId}
        AND deleted_at IS NULL
    )`;
    const rows = await db
      .select({
        id: restrictionTerms.id,
        title: restrictionTerms.title,
        fundId: restrictionTerms.fundId,
        grantId: restrictionTerms.grantId,
        endDate: restrictionTerms.endDate,
        beginningBalanceCents: restrictionTerms.beginningBalanceCents,
        additionsTotal,
        releasesTotal,
      })
      .from(restrictionTerms)
      .where(
        and(
          eq(restrictionTerms.orgId, params.orgId),
          isNull(restrictionTerms.deletedAt),
          restrictionTermEntityScope(params.orgId, params.entityId),
        ),
      );
    for (const row of rows) {
      const remainingCents =
        row.beginningBalanceCents +
        Number(row.additionsTotal ?? 0) -
        Number(row.releasesTotal ?? 0);
      const obligation = mapRestrictionRelease(
        {
          id: row.id,
          title: row.title,
          fundId: row.fundId,
          grantId: row.grantId,
          endDate: row.endDate,
          remainingCents,
        },
        context,
      );
      if (obligation) obligations.push(obligation);
    }
  }

  if (isKindEnabled("period_close", params.kinds)) {
    // Fiscal periods are intentionally organization-global in the current schema:
    // they have neither entity ownership nor soft-delete columns.
    const rows = await db
      .select({
        id: fiscalPeriods.id,
        name: fiscalPeriods.name,
        endDate: fiscalPeriods.endDate,
        status: fiscalPeriods.status,
      })
      .from(fiscalPeriods)
      .where(eq(fiscalPeriods.orgId, params.orgId));
    for (const row of rows) {
      const obligation = mapPeriodClose(row, context);
      if (obligation) obligations.push(obligation);
    }
  }

  return applyHorizon(obligations, params.horizonDays);
}
