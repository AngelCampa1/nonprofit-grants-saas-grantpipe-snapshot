import { and, desc, eq, isNull } from "drizzle-orm";
import {
  grants,
  impactMetricEntries,
  grantImpactMetrics,
  outcomeGoals,
  outcomeIndicators,
  programs,
} from "@grantpipe/db";
import type { Database } from "@grantpipe/db";
import type {
  CreateOutcomeIndicatorInput,
  CreateOutcomeInput,
  OutcomeListQuery,
} from "@grantpipe/shared";
import { internalError, notFound } from "../../lib/app-error";
import { recordActivityLog } from "../../lib/activity-log";

type EntryRow = {
  id?: string;
  value: string | number | null;
  periodEnd: Date | string;
  periodStart?: Date | string;
  deletedAt?: Date | string | null;
};

type IndicatorRow = {
  id: string;
  name: string;
  indicatorType: string;
  direction: string;
  targetValue: string | number | null;
  baselineValue: string | number | null;
  unit: string | null;
  source: string | null;
  funderDefined: boolean;
  reportingCadence: string | null;
  impactMetricId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  impactMetric?: { entries?: EntryRow[] } | null;
};

type OutcomeRow = {
  id: string;
  orgId: string;
  programId: string | null;
  grantId: string | null;
  name: string;
  statement: string;
  targetPopulation: string | null;
  status: string;
  startDate: Date | null;
  endDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  indicators?: IndicatorRow[];
};

export type OutcomeIndicatorStatus = "on_track" | "behind" | "missing";

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toNumericString(value: string | number | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  return String(value);
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

function getLatestLiveEntry(entries: EntryRow[] | undefined): EntryRow | null {
  const liveEntries = (entries ?? []).filter((entry) => !entry.deletedAt);
  liveEntries.sort((a, b) => new Date(b.periodEnd).getTime() - new Date(a.periodEnd).getTime());
  return liveEntries[0] ?? null;
}

function classifyProgress(params: {
  actual: number | null;
  target: number | null;
  direction: string;
}): OutcomeIndicatorStatus {
  if (params.actual === null || params.target === null) return "missing";
  if (params.direction === "decrease")
    return params.actual <= params.target ? "on_track" : "behind";
  if (params.direction === "maintain")
    return params.actual === params.target ? "on_track" : "behind";
  return params.actual >= params.target ? "on_track" : "behind";
}

function calculateProgressPercent(actual: number | null, target: number | null): number | null {
  if (actual === null || target === null || target === 0) return null;
  return Math.round((actual / target) * 100);
}

function toIndicatorResponse(indicator: IndicatorRow) {
  const latestEntry = getLatestLiveEntry(indicator.impactMetric?.entries);
  const actualValue = toNumber(latestEntry?.value);
  const targetValue = toNumber(indicator.targetValue);
  const baselineValue = toNumber(indicator.baselineValue);
  const status = classifyProgress({
    actual: actualValue,
    target: targetValue,
    direction: indicator.direction,
  });

  return {
    id: indicator.id,
    name: indicator.name,
    indicatorType: indicator.indicatorType,
    direction: indicator.direction,
    targetValue,
    baselineValue,
    unit: indicator.unit,
    source: indicator.source,
    funderDefined: indicator.funderDefined,
    reportingCadence: indicator.reportingCadence,
    impactMetricId: indicator.impactMetricId,
    actualValue,
    progressPercent: calculateProgressPercent(actualValue, targetValue),
    status,
    latestEntry: latestEntry
      ? {
          id: latestEntry.id,
          value: actualValue,
          periodStart: toIso(latestEntry.periodStart),
          periodEnd: toIso(latestEntry.periodEnd),
        }
      : null,
    createdAt: indicator.createdAt.toISOString(),
    updatedAt: indicator.updatedAt.toISOString(),
  };
}

export function toOutcomeResponse(outcome: OutcomeRow) {
  const indicators = (outcome.indicators ?? [])
    .filter((indicator) => !indicator.deletedAt)
    .map(toIndicatorResponse);
  const summary = indicators.reduce(
    (acc, indicator) => {
      acc.totalIndicators += 1;
      if (indicator.status === "on_track") acc.onTrack += 1;
      if (indicator.status === "behind") acc.behind += 1;
      if (indicator.status === "missing") acc.missing += 1;
      return acc;
    },
    { totalIndicators: 0, onTrack: 0, behind: 0, missing: 0, atRisk: false },
  );
  summary.atRisk = summary.behind > 0 || summary.missing > 0;

  return {
    id: outcome.id,
    programId: outcome.programId,
    grantId: outcome.grantId,
    name: outcome.name,
    statement: outcome.statement,
    targetPopulation: outcome.targetPopulation,
    status: outcome.status,
    startDate: toIso(outcome.startDate),
    endDate: toIso(outcome.endDate),
    indicators,
    summary,
    createdAt: outcome.createdAt.toISOString(),
    updatedAt: outcome.updatedAt.toISOString(),
  };
}

export async function listOutcomes(
  db: Database,
  params: { orgId: string; query: OutcomeListQuery },
) {
  const offset = (params.query.page - 1) * params.query.pageSize;
  const rows = await db.query.outcomeGoals.findMany({
    where: and(
      eq(outcomeGoals.orgId, params.orgId),
      params.query.status ? eq(outcomeGoals.status, params.query.status) : undefined,
      params.query.programId ? eq(outcomeGoals.programId, params.query.programId) : undefined,
      params.query.grantId ? eq(outcomeGoals.grantId, params.query.grantId) : undefined,
      isNull(outcomeGoals.deletedAt),
    ),
    orderBy: [desc(outcomeGoals.createdAt), desc(outcomeGoals.id)],
    limit: params.query.pageSize + 1,
    offset,
    with: {
      indicators: {
        where: isNull(outcomeIndicators.deletedAt),
        with: {
          impactMetric: {
            with: {
              entries: {
                where: isNull(impactMetricEntries.deletedAt),
                orderBy: [desc(impactMetricEntries.periodEnd)],
                limit: 1,
              },
            },
          },
        },
      },
    },
  });

  const pageRows = rows.slice(0, params.query.pageSize);

  return {
    data: pageRows.map((row) => toOutcomeResponse(row as OutcomeRow)),
    pagination: {
      page: params.query.page,
      pageSize: params.query.pageSize,
      hasNextPage: rows.length > params.query.pageSize,
    },
  };
}

async function assertProgramInOrg(db: Database, orgId: string, programId: string): Promise<void> {
  const program = await db.query.programs.findFirst({
    where: and(eq(programs.id, programId), eq(programs.orgId, orgId), isNull(programs.deletedAt)),
  });
  if (!program) throw notFound("Program not found");
}

async function assertGrantInOrg(db: Database, orgId: string, grantId: string): Promise<void> {
  const grant = await db.query.grants.findFirst({
    where: and(eq(grants.id, grantId), eq(grants.orgId, orgId), isNull(grants.deletedAt)),
  });
  if (!grant) throw notFound("Grant not found");
}

async function assertOutcomeInOrg(db: Database, orgId: string, outcomeId: string): Promise<void> {
  const outcome = await db.query.outcomeGoals.findFirst({
    where: and(
      eq(outcomeGoals.id, outcomeId),
      eq(outcomeGoals.orgId, orgId),
      isNull(outcomeGoals.deletedAt),
    ),
  });
  if (!outcome) throw notFound("Outcome not found");
}

async function assertMetricInOrg(db: Database, orgId: string, metricId: string): Promise<void> {
  const metric = await db.query.grantImpactMetrics.findFirst({
    where: and(
      eq(grantImpactMetrics.id, metricId),
      eq(grantImpactMetrics.orgId, orgId),
      isNull(grantImpactMetrics.deletedAt),
    ),
  });
  if (!metric) throw notFound("Impact metric not found");
}

export async function createOutcome(
  db: Database,
  params: { orgId: string; actorId: string; data: CreateOutcomeInput },
) {
  if (params.data.programId) await assertProgramInOrg(db, params.orgId, params.data.programId);
  if (params.data.grantId) await assertGrantInOrg(db, params.orgId, params.data.grantId);

  return db.transaction(async (tx) => {
    const [outcome] = await tx
      .insert(outcomeGoals)
      .values({
        orgId: params.orgId,
        programId: params.data.programId,
        grantId: params.data.grantId,
        name: params.data.name,
        statement: params.data.statement,
        targetPopulation: params.data.targetPopulation,
        status: params.data.status,
        startDate: params.data.startDate ? new Date(params.data.startDate) : undefined,
        endDate: params.data.endDate ? new Date(params.data.endDate) : undefined,
      })
      .returning();
    if (!outcome) throw internalError("Failed to create outcome");
    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "created",
      entityType: "outcome_goal",
      entityId: outcome.id,
      entityLabel: outcome.name,
      changes: {
        programId: outcome.programId,
        grantId: outcome.grantId,
        status: outcome.status,
      },
    });
    return outcome;
  });
}

export async function createOutcomeIndicator(
  db: Database,
  params: {
    orgId: string;
    actorId: string;
    outcomeId: string;
    data: CreateOutcomeIndicatorInput;
  },
) {
  await assertOutcomeInOrg(db, params.orgId, params.outcomeId);
  if (params.data.impactMetricId) {
    await assertMetricInOrg(db, params.orgId, params.data.impactMetricId);
  }

  return db.transaction(async (tx) => {
    const [indicator] = await tx
      .insert(outcomeIndicators)
      .values({
        orgId: params.orgId,
        outcomeId: params.outcomeId,
        impactMetricId: params.data.impactMetricId,
        name: params.data.name,
        indicatorType: params.data.indicatorType,
        direction: params.data.direction,
        targetValue: toNumericString(params.data.targetValue),
        baselineValue: toNumericString(params.data.baselineValue),
        unit: params.data.unit,
        source: params.data.source,
        funderDefined: params.data.funderDefined,
        reportingCadence: params.data.reportingCadence,
      })
      .returning();
    if (!indicator) throw internalError("Failed to create outcome indicator");
    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "created",
      entityType: "outcome_indicator",
      entityId: indicator.id,
      entityLabel: indicator.name,
      changes: {
        outcomeId: indicator.outcomeId,
        impactMetricId: indicator.impactMetricId,
        indicatorType: indicator.indicatorType,
        funderDefined: indicator.funderDefined,
      },
    });
    return indicator;
  });
}
