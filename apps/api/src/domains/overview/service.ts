import { and, count as drizzleCount, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  activityLog,
  dashboardHomePreferences,
  expenses,
  funds,
  grantCloseoutItems,
  grantFundAllocations,
  grantReportingRequirements,
  generatedReports,
  grants,
  organizations,
  type Database,
} from "@grantpipe/db";
import {
  DEFAULT_DASHBOARD_WIDGETS_BY_ROLE,
  DASHBOARD_WIDGET_IDS,
  DONOR_PIPELINE_STAGES,
  GRANT_STATUSES,
  normalizeDashboardWidgetIds,
  type DashboardWidgetId,
  type DonorPipelineStage,
  type GrantStatus,
  type Role,
} from "@grantpipe/shared";
import { getDonorStats, getPipelineGroups } from "../donors/stats.service";
import { listGrantPipeline } from "../grants/grant.service";
import { activityEntityScope } from "../activity/service";
import { buildFundSummary, buildGrantSummary, deriveRequirementStatus } from "../grants/summary";
import { getDaysUntilDeadline } from "../notifications/reminders";
import { buildReportingTitle } from "../deadlines/service";

type OverviewGrantRow = {
  id: string;
  name: string;
  status: string;
  amountCents: number | null;
  applicationDeadline: Date | string | null;
  updatedAt?: Date | string;
  fundAllocations: Array<{
    allocatedAmountCents: number;
    fund?: { deletedAt?: Date | null } | null;
  }>;
  expenses: Array<{ amountCents: number; deletedAt?: Date | null }>;
  reportingRequirements: Array<{
    id: string;
    reportType: string;
    dueDate: Date | string | null;
    status: "upcoming" | "in_progress" | "submitted" | "overdue";
    deletedAt?: Date | null;
  }>;
  closeoutItems: Array<{
    id: string;
    label: string;
    dueDate: Date | string | null;
    completed: boolean;
    deletedAt?: Date | null;
  }>;
};

type OverviewFundRow = {
  id: string;
  name: string;
  type: string;
  grantAllocations: Array<{
    allocatedAmountCents: number;
    grant?: { deletedAt?: Date | null } | null;
  }>;
  expenses: Array<{ amountCents: number; deletedAt?: Date | null }>;
};

type OverviewActivityRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorId: string;
  changes: Record<string, unknown> | null;
  createdAt: Date | string;
};

type DeadlineKind = "application_deadline" | "reporting_requirement" | "closeout_item";
type GrantHealthState = "on_track" | "at_risk" | "overdue";

type DashboardUpcomingDeadline = {
  kind: DeadlineKind;
  grantId: string;
  grantName: string;
  label: string;
  dueDate: string;
  daysUntilDue: number;
  reportType?: string;
  closeoutItemId?: string;
  reportingRequirementId?: string;
};

type DashboardAtRiskGrant = {
  grantId: string;
  grantName: string;
  grantStatus: string;
  healthState: GrantHealthState;
  riskReasons: string[];
  nextDeadlineAt: string | null;
  summary: ReturnType<typeof buildGrantSummary>;
};

type DashboardFundBalance = {
  fundId: string;
  name: string;
  type: string;
  allocatedTotalCents: number;
  expenseTotalCents: number;
  currentBalanceCents: number;
  expenseRatio: number;
  thresholdState: ReturnType<typeof buildFundSummary>["thresholdState"];
};

type DashboardComplianceHealth = {
  overdueGrantCount: number;
  atRiskGrantCount: number;
  upcomingDeadlineCount: number;
  restrictedFundWatchCount: number;
  auditEvidenceEventCount: number;
};

type DashboardBoardReportFreshness = {
  latestReportId: string | null;
  latestReportTitle: string | null;
  latestGeneratedAt: string | null;
  daysSinceLatestReport: number | null;
};

type DashboardExecutiveSnapshotStatus = "clear" | "watch" | "urgent";
type DashboardPriorityActionSeverity = "watch" | "urgent";
type DashboardPriorityAction = {
  id: string;
  kind: "grant_risk" | "reporting_readiness" | "fund_watch";
  title: string;
  description: string;
  severity: DashboardPriorityActionSeverity;
  dueDate: string | null;
  targetType: "grant" | "fund" | "reports";
  targetId: string | null;
};

type DashboardExecutiveSnapshot = {
  status: DashboardExecutiveSnapshotStatus;
  statusLabel: string;
  statusDescription: string;
  primaryMetricLabel: string;
  primaryMetricValue: string;
  secondaryMetricLabel: string;
  secondaryMetricValue: string;
  priorityActions: DashboardPriorityAction[];
};

type DashboardPayload = {
  asOf: string;
  dashboardLayout: {
    pinnedWidgetIds: DashboardWidgetId[];
    source: "default" | "saved";
  };
  executiveSnapshot: DashboardExecutiveSnapshot;
  upcomingDeadlines: DashboardUpcomingDeadline[];
  atRiskGrants: DashboardAtRiskGrant[];
  complianceHealth: DashboardComplianceHealth;
  boardReportFreshness: DashboardBoardReportFreshness;
  recentActivity: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    actorId: string;
    changes: Record<string, unknown> | null;
    createdAt: string;
  }>;
  donorMetrics: Awaited<ReturnType<typeof getDonorStats>>;
  pipelineSummary: {
    donor: Array<{ stage: DonorPipelineStage; count: number }>;
    grants: Array<{ status: GrantStatus; count: number }>;
  };
  fundBalancesOverview: DashboardFundBalance[];
};

type CalendarItem = {
  kind: DeadlineKind;
  grantId: string;
  grantName: string;
  label: string;
  dueDate: string;
  daysUntilDue: number;
  status: "overdue" | "due_today" | "upcoming" | "submitted" | "completed";
  reportType?: string;
  closeoutItemId?: string;
  reportingRequirementId?: string;
};

type CalendarDay = {
  date: string;
  items: CalendarItem[];
};

type CalendarPayload = {
  month: string;
  days: CalendarDay[];
  totals: {
    applicationDeadlines: number;
    reportingRequirements: number;
    closeoutItems: number;
  };
};

type CalendarGrantRow = {
  id: string;
  name: string;
  applicationDeadline: Date | string | null;
  reportingRequirements: Array<{
    id: string;
    reportType: string;
    dueDate: Date | string | null;
    status: "upcoming" | "in_progress" | "submitted" | "overdue";
    deletedAt?: Date | null;
  }>;
  closeoutItems: Array<{
    id: string;
    label: string;
    dueDate: Date | string | null;
    completed: boolean;
    deletedAt?: Date | null;
  }>;
};

const AUDIT_EVIDENCE_ENTITY_TYPES = ["generated_report", "import_history"] as const;

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toIso(value: Date | string): string {
  return asDate(value).toISOString();
}

function getLocalDateKey(value: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

function getDaysInMonth(month: string) {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function getDeadlineSortValue(kind: DeadlineKind) {
  if (kind === "application_deadline") return 0;
  if (kind === "reporting_requirement") return 1;
  return 2;
}

function mapPipelineSummary<TStage extends string, TKey extends string>(
  stages: readonly TStage[],
  counts: Record<TStage, { count: number }>,
  keyName: TKey,
) {
  return stages.map((stage) => ({ [keyName]: stage, count: counts[stage]?.count ?? 0 })) as Array<
    Record<TKey, TStage> & { count: number }
  >;
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function capitalizeFirst(value: string) {
  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);
}

function joinSummaryParts(parts: string[]) {
  if (parts.length === 0) return "";
  // Fragments are authored lowercase so they read correctly mid-sentence
  // (e.g. "... and no board packet generated."), but the joined sentence is a
  // user-facing line on the dashboard hero card and must start capitalized.
  const sentence =
    parts.length === 1
      ? `${parts[0]}.`
      : parts.length === 2
        ? `${parts[0]} and ${parts[1]}.`
        : `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}.`;
  return capitalizeFirst(sentence);
}

export function formatPriorityRiskSummary(reasons: string[]): string {
  if (reasons.length === 0) return "";

  const budgetConcerns: string[] = [];
  // subject → { overdue: bool, dueSoon: bool }
  const subjectMap = new Map<string, { overdue: boolean; dueSoon: boolean }>();
  const subjectOrder: string[] = [];
  const bareConcerns: string[] = [];

  for (const reason of reasons) {
    if (reason.startsWith("spend_down_")) {
      const state = reason.replace("spend_down_", "");
      budgetConcerns.push(`Budget ${state}% spent`);
      continue;
    }
    if (reason.endsWith("_overdue")) {
      const subject = reason.replace(/_overdue$/, "");
      if (!subjectMap.has(subject)) {
        subjectMap.set(subject, { overdue: false, dueSoon: false });
        subjectOrder.push(subject);
      }
      subjectMap.get(subject)!.overdue = true;
      continue;
    }
    if (reason.endsWith("_due_soon")) {
      const subject = reason.replace(/_due_soon$/, "");
      if (!subjectMap.has(subject)) {
        subjectMap.set(subject, { overdue: false, dueSoon: false });
        subjectOrder.push(subject);
      }
      subjectMap.get(subject)!.dueSoon = true;
      continue;
    }
    // bare reason — no recognized prefix or suffix
    bareConcerns.push(capitalizeFirst(reason.replaceAll("_", " ")));
  }

  const subjectLabel = (subject: string): string => {
    if (subject === "reporting_requirement") return "Reporting";
    return capitalizeFirst(subject.replaceAll("_", " "));
  };

  const subjectConcerns: string[] = subjectOrder.map((subject) => {
    const { overdue, dueSoon } = subjectMap.get(subject)!;
    const label = subjectLabel(subject);
    if (overdue && dueSoon) return `${label} overdue and due soon`;
    if (overdue) return `${label} overdue`;
    return `${label} due soon`;
  });

  return [...budgetConcerns, ...subjectConcerns, ...bareConcerns].join(" · ");
}

function getPrioritySeverityRank(severity: DashboardPriorityActionSeverity) {
  return severity === "urgent" ? 0 : 1;
}

function getPriorityDueDateRank(action: DashboardPriorityAction) {
  return action.dueDate ? new Date(action.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
}

function buildDashboardDeadlinePayload(params: {
  kind: DeadlineKind;
  grantId: string;
  grantName: string;
  dueDate: Date;
  now: Date;
  timezone: string;
  label: string;
  reportType?: string;
  closeoutItemId?: string;
  reportingRequirementId?: string;
}): DashboardUpcomingDeadline {
  const daysUntilDue = getDaysUntilDeadline(params.dueDate, params.timezone, params.now);
  return {
    kind: params.kind,
    grantId: params.grantId,
    grantName: params.grantName,
    label: params.label,
    dueDate: toIso(params.dueDate),
    daysUntilDue,
    reportType: params.reportType,
    closeoutItemId: params.closeoutItemId,
    reportingRequirementId: params.reportingRequirementId,
  };
}

function buildCalendarDeadlineItem(params: {
  kind: DeadlineKind;
  grantId: string;
  grantName: string;
  dueDate: Date;
  now: Date;
  timezone: string;
  label: string;
  status?: CalendarItem["status"];
  reportType?: string;
  closeoutItemId?: string;
  reportingRequirementId?: string;
}): CalendarItem {
  const daysUntilDue = getDaysUntilDeadline(params.dueDate, params.timezone, params.now);
  return {
    kind: params.kind,
    grantId: params.grantId,
    grantName: params.grantName,
    label: params.label,
    dueDate: toIso(params.dueDate),
    daysUntilDue,
    status:
      params.status ??
      (daysUntilDue < 0 ? "overdue" : daysUntilDue === 0 ? "due_today" : "upcoming"),
    reportType: params.reportType,
    closeoutItemId: params.closeoutItemId,
    reportingRequirementId: params.reportingRequirementId,
  };
}

function buildExecutiveSnapshot(params: {
  atRiskGrants: DashboardAtRiskGrant[];
  upcomingDeadlineCount: number;
  fundBalancesOverview: DashboardFundBalance[];
  complianceHealth: DashboardComplianceHealth;
  boardReportFreshness: DashboardBoardReportFreshness;
}): DashboardExecutiveSnapshot {
  const overdueCount = params.complianceHealth.overdueGrantCount;

  const summaryParts: string[] = [];
  if (overdueCount > 0) {
    summaryParts.push(pluralize(overdueCount, "overdue grant"));
  }
  if (params.complianceHealth.atRiskGrantCount > 0) {
    summaryParts.push(pluralize(params.complianceHealth.atRiskGrantCount, "at-risk grant"));
  }
  if (params.complianceHealth.restrictedFundWatchCount > 0) {
    summaryParts.push(
      pluralize(params.complianceHealth.restrictedFundWatchCount, "restricted fund on watch"),
    );
  }
  if (!params.boardReportFreshness.latestGeneratedAt) {
    summaryParts.push("no board packet generated");
  }

  const grantActions: DashboardPriorityAction[] = params.atRiskGrants.map((grant) => ({
    id: `grant:${grant.grantId}`,
    kind: "grant_risk",
    title: grant.grantName,
    description: formatPriorityRiskSummary(grant.riskReasons),
    severity: grant.healthState === "overdue" ? "urgent" : "watch",
    dueDate: grant.nextDeadlineAt,
    targetType: "grant",
    targetId: grant.grantId,
  }));

  const fundActions: DashboardPriorityAction[] = params.fundBalancesOverview
    .filter(
      (fund) =>
        fund.type !== "unrestricted" &&
        (fund.thresholdState === "80" ||
          fund.thresholdState === "90" ||
          fund.thresholdState === "100"),
    )
    .sort((left, right) => {
      const severityOrder =
        (right.thresholdState === "100" ? 1 : 0) - (left.thresholdState === "100" ? 1 : 0);
      if (severityOrder !== 0) return severityOrder;
      const ratioOrder = right.expenseRatio - left.expenseRatio;
      if (ratioOrder !== 0) return ratioOrder;
      return left.name.localeCompare(right.name);
    })
    .map((fund) => ({
      id: `fund:${fund.fundId}`,
      kind: "fund_watch",
      title: fund.name,
      description: `Restricted fund is ${Math.round(fund.expenseRatio * 100)}% spent.`,
      severity: fund.thresholdState === "100" ? "urgent" : "watch",
      dueDate: null,
      targetType: "fund",
      targetId: fund.fundId,
    }));

  const priorityActions: DashboardPriorityAction[] = [...grantActions, ...fundActions];

  if (!params.boardReportFreshness.latestGeneratedAt) {
    priorityActions.push({
      id: "reporting:board-packet",
      kind: "reporting_readiness",
      title: "Generate a board packet",
      description: "No board packet has been generated yet.",
      severity: "watch",
      dueDate: null,
      targetType: "reports",
      targetId: null,
    });
  }

  const rankedPriorityActions = priorityActions
    .sort((left, right) => {
      const severityOrder =
        getPrioritySeverityRank(left.severity) - getPrioritySeverityRank(right.severity);
      if (severityOrder !== 0) return severityOrder;
      const dueDateOrder = getPriorityDueDateRank(left) - getPriorityDueDateRank(right);
      if (dueDateOrder !== 0) return dueDateOrder;
      return left.title.localeCompare(right.title);
    })
    .slice(0, 3);
  const urgentConditionCount = priorityActions.filter(
    (action) => action.severity === "urgent",
  ).length;
  const status: DashboardExecutiveSnapshotStatus =
    urgentConditionCount > 0
      ? "urgent"
      : rankedPriorityActions.length > 0 ||
          params.complianceHealth.atRiskGrantCount > 0 ||
          params.complianceHealth.restrictedFundWatchCount > 0
        ? "watch"
        : "clear";

  return {
    status,
    statusLabel:
      status === "urgent"
        ? "Action needed"
        : status === "watch"
          ? "Watch closely"
          : "Under control",
    statusDescription:
      summaryParts.length > 0
        ? joinSummaryParts(summaryParts)
        : "No urgent grant or reporting work needs attention.",
    primaryMetricLabel: "Urgent work",
    primaryMetricValue: urgentConditionCount === 0 ? "0 urgent" : `${urgentConditionCount} urgent`,
    secondaryMetricLabel: "Upcoming deadlines",
    secondaryMetricValue:
      params.upcomingDeadlineCount === 0
        ? "0 next 30 days"
        : `${params.upcomingDeadlineCount} next 30 days`,
    priorityActions: rankedPriorityActions,
  };
}

function summarizeGrant(params: {
  grant: OverviewGrantRow;
  now: Date;
  timezone: string;
  deadlineWindowDays: number;
}) {
  const liveFundAllocations = params.grant.fundAllocations.filter(
    (allocation) => allocation.fund?.deletedAt == null,
  );
  const liveExpenses = params.grant.expenses.filter(
    (expense) => expense.deletedAt === undefined || expense.deletedAt === null,
  );

  const allocationTotalCents = liveFundAllocations.reduce(
    (sum, allocation) => sum + allocation.allocatedAmountCents,
    0,
  );
  const expenseTotalCents = liveExpenses.reduce((sum, expense) => sum + expense.amountCents, 0);
  const summary = buildGrantSummary({
    grantAmountCents: params.grant.amountCents,
    allocationTotalCents,
    expenseTotalCents,
  });

  const deadlineRecords: Array<{
    kind: DeadlineKind;
    dueDate: Date;
    label: string;
    reportType?: string;
    closeoutItemId?: string;
    reportingRequirementId?: string;
    resolved: boolean;
  }> = [];

  if (params.grant.applicationDeadline) {
    deadlineRecords.push({
      kind: "application_deadline",
      dueDate: asDate(params.grant.applicationDeadline),
      label: "Application deadline",
      resolved: false,
    });
  }

  for (const requirement of params.grant.reportingRequirements) {
    if (requirement.deletedAt != null) continue;
    const dueDate = requirement.dueDate ? asDate(requirement.dueDate) : null;
    if (!dueDate) continue;
    const derivedStatus = deriveRequirementStatus(
      {
        status: requirement.status,
        dueDate,
      },
      params.now,
    );
    deadlineRecords.push({
      kind: "reporting_requirement",
      dueDate,
      label: buildReportingTitle(requirement.reportType),
      reportType: requirement.reportType,
      reportingRequirementId: requirement.id,
      resolved: derivedStatus === "submitted",
    });
  }

  for (const item of params.grant.closeoutItems) {
    if (item.deletedAt != null) continue;
    if (!item.dueDate || item.completed) continue;
    deadlineRecords.push({
      kind: "closeout_item",
      dueDate: asDate(item.dueDate),
      label: item.label,
      closeoutItemId: item.id,
      resolved: item.completed,
    });
  }

  const upcomingDeadlines = deadlineRecords
    .filter((record) => !record.resolved)
    .map((record) => ({
      record,
      daysUntilDue: getDaysUntilDeadline(record.dueDate, params.timezone, params.now),
    }));

  const overdueRecords = upcomingDeadlines.filter((entry) => entry.daysUntilDue < 0);
  const dueSoonRecords = upcomingDeadlines.filter(
    (entry) => entry.daysUntilDue >= 0 && entry.daysUntilDue <= params.deadlineWindowDays,
  );
  const overdueReportingRecords = overdueRecords.filter(
    (entry) => entry.record.kind === "reporting_requirement",
  );
  const dueSoonReportingRecords = dueSoonRecords.filter(
    (entry) => entry.record.kind === "reporting_requirement",
  );

  const riskReasons = new Set<string>();
  if (summary.thresholdState && summary.thresholdState !== "100") {
    riskReasons.add(`spend_down_${summary.thresholdState}`);
  }
  for (const overdueRecord of overdueReportingRecords) {
    riskReasons.add(`${overdueRecord.record.kind}_overdue`);
  }
  for (const dueSoonRecord of dueSoonReportingRecords) {
    riskReasons.add(`${dueSoonRecord.record.kind}_due_soon`);
  }

  const healthState: GrantHealthState =
    summary.thresholdState === "100" || overdueReportingRecords.length > 0
      ? "overdue"
      : riskReasons.size > 0
        ? "at_risk"
        : "on_track";

  const nextDeadline = [...upcomingDeadlines].sort(
    (left, right) => left.record.dueDate.getTime() - right.record.dueDate.getTime(),
  )[0];

  return {
    summary,
    upcomingDeadlines: dueSoonRecords.map((entry) =>
      buildDashboardDeadlinePayload({
        kind: entry.record.kind,
        grantId: params.grant.id,
        grantName: params.grant.name,
        dueDate: entry.record.dueDate,
        now: params.now,
        timezone: params.timezone,
        label: entry.record.label,
        reportType: entry.record.reportType,
        closeoutItemId: entry.record.closeoutItemId,
        reportingRequirementId: entry.record.reportingRequirementId,
      }),
    ),
    atRiskGrant:
      healthState === "on_track"
        ? null
        : ({
            grantId: params.grant.id,
            grantName: params.grant.name,
            grantStatus: params.grant.status,
            healthState,
            riskReasons: [...riskReasons].sort(),
            nextDeadlineAt: nextDeadline ? nextDeadline.record.dueDate.toISOString() : null,
            summary,
          } satisfies DashboardAtRiskGrant),
  };
}

function buildCalendarDayBuckets(month: string) {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  const daysInMonth = getDaysInMonth(month);
  return Array.from({ length: daysInMonth }, (_value, index) => {
    const day = String(index + 1).padStart(2, "0");
    return {
      date: `${yearText}-${monthText}-${day}`,
      monthNumber,
      year,
      items: [] as CalendarItem[],
    };
  });
}

export async function buildDashboardOverview(
  db: Database,
  params: {
    orgId: string;
    entityId: string;
    userId?: string;
    memberRole?: Role;
    now?: Date;
    deadlineWindowDays?: number;
    includeDonorData?: boolean;
  },
): Promise<DashboardPayload> {
  const now = params.now ?? new Date();
  const deadlineWindowDays = params.deadlineWindowDays ?? 30;
  const includeDonorData = params.includeDonorData ?? true;

  const organization = await db.query.organizations.findFirst({
    where: eq(organizations.id, params.orgId),
    columns: {
      timezone: true,
      fiscalYearStartMonth: true,
    },
  });

  if (!organization) {
    throw new Error("Organization not found");
  }

  const grantAllocationFundAlias = sql.identifier("grant_allocation_fund");
  const fundAllocationGrantAlias = sql.identifier("fund_allocation_grant");

  const [
    donorMetrics,
    donorPipeline,
    grantPipeline,
    grantRows,
    fundRows,
    activityRows,
    auditEvidenceRows,
    latestBoardReport,
  ] = await Promise.all([
    includeDonorData
      ? getDonorStats(db, {
          orgId: params.orgId,
          entityId: params.entityId,
          fiscalYearStartMonth: organization.fiscalYearStartMonth,
          now,
        })
      : Promise.resolve({
          totalDonors: 0,
          totalGivingThisFY: 0,
          previousFiscalYearGivingCents: 0,
          newDonorsThisFY: 0,
          retentionRate: 0,
        }),
    includeDonorData
      ? getPipelineGroups(db, { orgId: params.orgId, entityId: params.entityId })
      : Promise.resolve(
          Object.fromEntries(DONOR_PIPELINE_STAGES.map((stage) => [stage, { count: 0 }])) as Record<
            DonorPipelineStage,
            { count: number }
          >,
        ),
    listGrantPipeline(db, { orgId: params.orgId, entityId: params.entityId }),
    db.query.grants.findMany({
      where: and(
        eq(grants.orgId, params.orgId),
        eq(grants.entityId, params.entityId),
        isNull(grants.deletedAt),
      ),
      with: {
        fundAllocations: {
          where: and(
            eq(grantFundAllocations.entityId, params.entityId),
            isNull(grantFundAllocations.deletedAt),
            sql`EXISTS (
              SELECT 1 FROM ${sql.identifier("funds")} ${grantAllocationFundAlias}
              WHERE ${grantAllocationFundAlias}.${sql.identifier("id")} = ${grantFundAllocations.fundId}
                AND ${grantAllocationFundAlias}.${sql.identifier("org_id")} = ${params.orgId}
                AND ${grantAllocationFundAlias}.${sql.identifier("entity_id")} = ${params.entityId}
                AND ${grantAllocationFundAlias}.${sql.identifier("deleted_at")} IS NULL
            )`,
          ),
          with: {
            fund: {
              columns: {
                deletedAt: true,
              },
            },
          },
        },
        expenses: {
          where: and(
            eq(expenses.orgId, params.orgId),
            eq(expenses.entityId, params.entityId),
            isNull(expenses.deletedAt),
          ),
        },
        reportingRequirements: {
          where: and(
            eq(grantReportingRequirements.orgId, params.orgId),
            eq(grantReportingRequirements.entityId, params.entityId),
            isNull(grantReportingRequirements.deletedAt),
          ),
        },
        closeoutItems: {
          where: and(
            eq(grantCloseoutItems.orgId, params.orgId),
            eq(grantCloseoutItems.entityId, params.entityId),
            isNull(grantCloseoutItems.deletedAt),
          ),
        },
      },
    }),
    db.query.funds.findMany({
      where: and(
        eq(funds.orgId, params.orgId),
        eq(funds.entityId, params.entityId),
        isNull(funds.deletedAt),
      ),
      with: {
        grantAllocations: {
          where: and(
            eq(grantFundAllocations.entityId, params.entityId),
            isNull(grantFundAllocations.deletedAt),
            sql`EXISTS (
              SELECT 1 FROM ${sql.identifier("grants")} ${fundAllocationGrantAlias}
              WHERE ${fundAllocationGrantAlias}.${sql.identifier("id")} = ${grantFundAllocations.grantId}
                AND ${fundAllocationGrantAlias}.${sql.identifier("org_id")} = ${params.orgId}
                AND ${fundAllocationGrantAlias}.${sql.identifier("entity_id")} = ${params.entityId}
                AND ${fundAllocationGrantAlias}.${sql.identifier("deleted_at")} IS NULL
            )`,
          ),
          with: {
            grant: {
              columns: {
                deletedAt: true,
              },
            },
          },
        },
        expenses: {
          where: and(
            eq(expenses.orgId, params.orgId),
            eq(expenses.entityId, params.entityId),
            isNull(expenses.deletedAt),
          ),
        },
      },
    }),
    includeDonorData
      ? db.query.activityLog.findMany({
          where: and(
            eq(activityLog.orgId, params.orgId),
            activityEntityScope(params.orgId, params.entityId),
          ),
          orderBy: desc(activityLog.createdAt),
          limit: 10,
        })
      : Promise.resolve([]),
    db
      .select({ count: drizzleCount() })
      .from(activityLog)
      .where(
        and(
          eq(activityLog.orgId, params.orgId),
          activityEntityScope(params.orgId, params.entityId),
          or(
            inArray(activityLog.entityType, [...AUDIT_EVIDENCE_ENTITY_TYPES]),
            sql`${activityLog.changes} ? 'documentId'`,
          ),
        ),
      ),
    db.query.generatedReports.findFirst({
      where: and(
        eq(generatedReports.orgId, params.orgId),
        eq(generatedReports.entityId, params.entityId),
        eq(generatedReports.type, "board"),
        eq(generatedReports.status, "ready"),
      ),
      orderBy: desc(generatedReports.createdAt),
      columns: {
        id: true,
        title: true,
        createdAt: true,
      },
    }),
  ]);

  const upcomingDeadlines: DashboardUpcomingDeadline[] = [];
  const atRiskGrants: DashboardAtRiskGrant[] = [];

  for (const grant of grantRows as OverviewGrantRow[]) {
    const result = summarizeGrant({
      grant,
      now,
      timezone: organization.timezone,
      deadlineWindowDays,
    });
    upcomingDeadlines.push(...result.upcomingDeadlines);
    if (result.atRiskGrant) {
      atRiskGrants.push(result.atRiskGrant);
    }
  }

  const fundBalancesOverview: DashboardFundBalance[] = (fundRows as OverviewFundRow[])
    .map((fund) => {
      const liveGrantAllocations = fund.grantAllocations.filter(
        (allocation) => allocation.grant?.deletedAt == null,
      );
      const liveExpenses = fund.expenses.filter(
        (expense) => expense.deletedAt === undefined || expense.deletedAt === null,
      );

      const allocatedTotalCents = liveGrantAllocations.reduce(
        (sum, allocation) => sum + allocation.allocatedAmountCents,
        0,
      );
      const expenseTotalCents = liveExpenses.reduce((sum, expense) => sum + expense.amountCents, 0);
      const summary = buildFundSummary({
        allocatedTotalCents,
        expenseTotalCents,
      });

      return {
        fundId: fund.id,
        name: fund.name,
        type: fund.type,
        allocatedTotalCents,
        expenseTotalCents,
        currentBalanceCents: summary.currentBalanceCents,
        expenseRatio: summary.expenseRatio,
        thresholdState: summary.thresholdState,
      };
    })
    .sort((left, right) => right.currentBalanceCents - left.currentBalanceCents);

  const dashboardUpcomingDeadlines = upcomingDeadlines
    .sort((left, right) => {
      const dateOrder = left.dueDate.localeCompare(right.dueDate);
      if (dateOrder !== 0) return dateOrder;
      return getDeadlineSortValue(left.kind) - getDeadlineSortValue(right.kind);
    })
    .slice(0, 20);

  const dashboardAtRiskGrants = atRiskGrants.sort((left, right) => {
    const severityOrder =
      left.healthState === right.healthState ? 0 : left.healthState === "overdue" ? -1 : 1;
    if (severityOrder !== 0) return severityOrder;
    if (left.nextDeadlineAt && right.nextDeadlineAt) {
      return left.nextDeadlineAt.localeCompare(right.nextDeadlineAt);
    }
    if (left.nextDeadlineAt) return -1;
    if (right.nextDeadlineAt) return 1;
    return left.grantName.localeCompare(right.grantName);
  });

  const recentActivity = (activityRows as OverviewActivityRow[]).map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    actorId: row.actorId,
    changes: row.changes ?? null,
    createdAt: toIso(row.createdAt),
  }));

  const complianceHealth: DashboardComplianceHealth = {
    overdueGrantCount: dashboardAtRiskGrants.filter((grant) => grant.healthState === "overdue")
      .length,
    atRiskGrantCount: dashboardAtRiskGrants.filter((grant) => grant.healthState === "at_risk")
      .length,
    upcomingDeadlineCount: upcomingDeadlines.length,
    restrictedFundWatchCount: fundBalancesOverview.filter(
      (fund) =>
        fund.type !== "unrestricted" &&
        (fund.thresholdState === "80" ||
          fund.thresholdState === "90" ||
          fund.thresholdState === "100"),
    ).length,
    auditEvidenceEventCount: auditEvidenceRows[0]?.count ?? 0,
  };
  const boardReportFreshness: DashboardBoardReportFreshness = latestBoardReport
    ? {
        latestReportId: latestBoardReport.id,
        latestReportTitle: latestBoardReport.title,
        latestGeneratedAt: toIso(latestBoardReport.createdAt),
        daysSinceLatestReport: Math.floor(
          (now.getTime() - new Date(latestBoardReport.createdAt).getTime()) / (1000 * 60 * 60 * 24),
        ),
      }
    : {
        latestReportId: null,
        latestReportTitle: null,
        latestGeneratedAt: null,
        daysSinceLatestReport: null,
      };
  const executiveSnapshot = buildExecutiveSnapshot({
    atRiskGrants: dashboardAtRiskGrants,
    upcomingDeadlineCount: complianceHealth.upcomingDeadlineCount,
    fundBalancesOverview,
    complianceHealth,
    boardReportFreshness,
  });
  const memberRole = params.memberRole ?? "viewer";
  const dashboardLayout = params.userId
    ? await getDashboardHomePreference(db, {
        orgId: params.orgId,
        userId: params.userId,
        memberRole,
      })
    : {
        pinnedWidgetIds: [...DEFAULT_DASHBOARD_WIDGETS_BY_ROLE[memberRole]],
        source: "default" as const,
      };

  return {
    asOf: now.toISOString(),
    dashboardLayout,
    executiveSnapshot,
    upcomingDeadlines: dashboardUpcomingDeadlines,
    atRiskGrants: dashboardAtRiskGrants,
    complianceHealth,
    boardReportFreshness,
    recentActivity,
    donorMetrics,
    pipelineSummary: {
      donor: mapPipelineSummary(DONOR_PIPELINE_STAGES, donorPipeline, "stage"),
      grants: mapPipelineSummary(GRANT_STATUSES, grantPipeline, "status"),
    },
    fundBalancesOverview,
  };
}

export async function getDashboardHomePreference(
  db: Database,
  params: { orgId: string; userId: string; memberRole: Role },
): Promise<DashboardPayload["dashboardLayout"]> {
  const fallback: DashboardPayload["dashboardLayout"] = {
    pinnedWidgetIds: [...DEFAULT_DASHBOARD_WIDGETS_BY_ROLE[params.memberRole]],
    source: "default",
  };

  if (!db.query?.dashboardHomePreferences?.findFirst) {
    return fallback;
  }

  const row = await db.query.dashboardHomePreferences.findFirst({
    where: and(
      eq(dashboardHomePreferences.orgId, params.orgId),
      eq(dashboardHomePreferences.userId, params.userId),
    ),
    columns: {
      layout: true,
    },
  });

  if (!row) {
    return fallback;
  }

  const savedWidgetIds = row.layout.pinnedWidgetIds.filter((id): id is DashboardWidgetId =>
    (DASHBOARD_WIDGET_IDS as readonly string[]).includes(id),
  );

  return {
    pinnedWidgetIds: normalizeDashboardWidgetIds(savedWidgetIds, params.memberRole),
    source: "saved",
  };
}

export async function upsertDashboardHomePreference(
  db: Database,
  params: {
    orgId: string;
    userId: string;
    memberRole: Role;
    pinnedWidgetIds: DashboardWidgetId[];
  },
): Promise<DashboardPayload["dashboardLayout"]> {
  const pinnedWidgetIds = normalizeDashboardWidgetIds(params.pinnedWidgetIds, params.memberRole);
  const now = new Date();

  await db
    .insert(dashboardHomePreferences)
    .values({
      orgId: params.orgId,
      userId: params.userId,
      layout: { pinnedWidgetIds },
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [dashboardHomePreferences.orgId, dashboardHomePreferences.userId],
      set: {
        layout: { pinnedWidgetIds },
        updatedAt: now,
      },
    });

  return { pinnedWidgetIds, source: "saved" };
}

export async function buildCalendarOverview(
  db: Database,
  params: { orgId: string; entityId: string; month: string; now?: Date },
): Promise<CalendarPayload> {
  const now = params.now ?? new Date();
  const organization = await db.query.organizations.findFirst({
    where: eq(organizations.id, params.orgId),
    columns: {
      timezone: true,
    },
  });

  if (!organization) {
    throw new Error("Organization not found");
  }

  const grantRows = await db.query.grants.findMany({
    where: and(
      eq(grants.orgId, params.orgId),
      eq(grants.entityId, params.entityId),
      isNull(grants.deletedAt),
    ),
    with: {
      reportingRequirements: {
        where: and(
          eq(grantReportingRequirements.orgId, params.orgId),
          eq(grantReportingRequirements.entityId, params.entityId),
          isNull(grantReportingRequirements.deletedAt),
        ),
      },
      closeoutItems: {
        where: and(
          eq(grantCloseoutItems.orgId, params.orgId),
          eq(grantCloseoutItems.entityId, params.entityId),
          isNull(grantCloseoutItems.deletedAt),
        ),
      },
    },
  });

  const dayBuckets = buildCalendarDayBuckets(params.month);
  const totals = {
    applicationDeadlines: 0,
    reportingRequirements: 0,
    closeoutItems: 0,
  };

  for (const grant of grantRows as CalendarGrantRow[]) {
    if (grant.applicationDeadline) {
      const dueDate = asDate(grant.applicationDeadline);
      const localDateKey = getLocalDateKey(dueDate, organization.timezone);
      if (localDateKey.startsWith(params.month)) {
        const item = buildCalendarDeadlineItem({
          kind: "application_deadline",
          grantId: grant.id,
          grantName: grant.name,
          dueDate,
          now,
          timezone: organization.timezone,
          label: "Application deadline",
        });
        const bucket = dayBuckets.find((entry) => entry.date === localDateKey);
        if (bucket) {
          bucket.items.push(item);
          totals.applicationDeadlines += 1;
        }
      }
    }

    for (const requirement of grant.reportingRequirements) {
      if (requirement.deletedAt != null) continue;
      if (!requirement.dueDate) continue;
      const dueDate = asDate(requirement.dueDate);
      const localDateKey = getLocalDateKey(dueDate, organization.timezone);
      if (!localDateKey.startsWith(params.month)) continue;
      const derivedStatus = deriveRequirementStatus(
        {
          status: requirement.status,
          dueDate,
        },
        now,
      );

      const item = buildCalendarDeadlineItem({
        kind: "reporting_requirement",
        grantId: grant.id,
        grantName: grant.name,
        dueDate,
        now,
        timezone: organization.timezone,
        label: buildReportingTitle(requirement.reportType),
        status:
          derivedStatus === "submitted"
            ? "submitted"
            : derivedStatus === "overdue"
              ? "overdue"
              : getDaysUntilDeadline(dueDate, organization.timezone, now) === 0
                ? "due_today"
                : "upcoming",
        reportType: requirement.reportType,
        reportingRequirementId: requirement.id,
      });
      const bucket = dayBuckets.find((entry) => entry.date === localDateKey);
      if (bucket) {
        bucket.items.push(item);
        totals.reportingRequirements += 1;
      }
    }

    for (const item of grant.closeoutItems) {
      if (item.deletedAt != null) continue;
      if (!item.dueDate) continue;
      const dueDate = asDate(item.dueDate);
      const localDateKey = getLocalDateKey(dueDate, organization.timezone);
      if (!localDateKey.startsWith(params.month)) continue;

      const deadlineItem = buildCalendarDeadlineItem({
        kind: "closeout_item",
        grantId: grant.id,
        grantName: grant.name,
        dueDate,
        now,
        timezone: organization.timezone,
        label: item.label,
        status: item.completed
          ? "completed"
          : getDaysUntilDeadline(dueDate, organization.timezone, now) < 0
            ? "overdue"
            : getDaysUntilDeadline(dueDate, organization.timezone, now) === 0
              ? "due_today"
              : "upcoming",
        closeoutItemId: item.id,
      });
      const bucket = dayBuckets.find((entry) => entry.date === localDateKey);
      if (bucket) {
        bucket.items.push(deadlineItem);
        totals.closeoutItems += 1;
      }
    }
  }

  for (const bucket of dayBuckets) {
    bucket.items.sort((left, right) => {
      const leftPriority = getDeadlineSortValue(left.kind);
      const rightPriority = getDeadlineSortValue(right.kind);
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return left.dueDate.localeCompare(right.dueDate);
    });
  }

  return {
    month: params.month,
    days: dayBuckets.map(({ date, items }) => ({ date, items })),
    totals,
  };
}

export const getDashboardOverview = buildDashboardOverview;
export const getCalendarOverview = buildCalendarOverview;
