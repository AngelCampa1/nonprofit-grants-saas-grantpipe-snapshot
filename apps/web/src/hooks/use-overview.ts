import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ANALYTICS_EVENTS,
  DEFAULT_DASHBOARD_WIDGETS_BY_ROLE,
  type DashboardPreferenceInput,
  type DashboardWidgetId,
} from "@grantpipe/shared";
import { api } from "../lib/api-client";
import { captureEvent } from "../lib/analytics";
import { readResponseOrThrow } from "../lib/http-response";

const overview = api.api.overview;

type ComplianceHealth = {
  overdueGrantCount: number;
  atRiskGrantCount: number;
  upcomingDeadlineCount: number;
  restrictedFundWatchCount: number;
  auditEvidenceEventCount: number;
};

type BoardReportFreshness = {
  latestReportId: string | null;
  latestReportTitle: string | null;
  latestGeneratedAt: string | null;
  daysSinceLatestReport: number | null;
};

type ExecutiveSnapshot = {
  status: "clear" | "watch" | "urgent";
  statusLabel: string;
  statusDescription: string;
  primaryMetricLabel: string;
  primaryMetricValue: string;
  secondaryMetricLabel: string;
  secondaryMetricValue: string;
  priorityActions: Array<{
    id: string;
    kind: string;
    title: string;
    description: string;
    severity: "watch" | "urgent";
    dueDate: string | null;
    targetType: "grant" | "fund" | "reports";
    targetId: string | null;
  }>;
};

type RawDashboardOverview = {
  asOf: string;
  dashboardLayout?: DashboardHomeLayout;
  executiveSnapshot?: ExecutiveSnapshot;
  upcomingDeadlines: Array<{
    kind: string;
    grantId: string;
    grantName: string;
    label: string;
    dueDate: string;
    daysUntilDue: number;
  }>;
  atRiskGrants: Array<{
    grantId: string;
    grantName: string;
    healthState: string;
    riskReasons: string[];
  }>;
  complianceHealth: ComplianceHealth;
  boardReportFreshness: BoardReportFreshness;
  recentActivity: Array<{
    id: string;
    entityType: string;
    entityId: string;
    action: string;
    createdAt: string;
  }>;
  donorMetrics: {
    totalDonors: number;
    totalGivingThisFY: number;
    newDonorsThisFY: number;
    retentionRate: number;
    previousFiscalYearGivingCents?: number;
  };
  pipelineSummary: {
    donor: Array<{ stage: string; count: number }>;
    grants: Array<{ status: string; count: number }>;
  };
  fundBalancesOverview: Array<{
    fundId: string;
    name: string;
    type: string;
    currentBalanceCents: number;
  }>;
};

export type DashboardHomeLayout = {
  pinnedWidgetIds: DashboardWidgetId[];
  source: "default" | "saved";
};

type RawCalendarOverview = {
  month: string;
  days: Array<{
    date: string;
    items: Array<{
      id?: string;
      kind: string;
      grantId: string;
      grantName: string;
      label: string;
      dueDate: string;
      daysUntilDue: number;
      status: string;
      closeoutItemId?: string;
      reportingRequirementId?: string;
    }>;
  }>;
};

export type DashboardOverview = {
  asOf: string;
  dashboardLayout: DashboardHomeLayout;
  executiveSnapshot: ExecutiveSnapshot;
  upcomingDeadlines: Array<{
    id: string;
    title: string;
    date: string;
    kind: string;
    grantId: string;
    grantName?: string;
  }>;
  atRiskGrants: Array<{
    id: string;
    name: string;
    health: string;
    reason: string;
  }>;
  complianceHealth: ComplianceHealth;
  boardReportFreshness: BoardReportFreshness;
  recentActivity: Array<{
    id: string;
    entityType: string;
    entityId: string;
    action: string;
    createdAt: string;
  }>;
  donorMetrics: {
    retentionRate: number;
    currentFiscalYearGivingCents: number;
    previousFiscalYearGivingCents: number;
    newDonorCount: number;
  };
  pipelineSummary: {
    donors: Array<{ label: string; count: number }>;
    grants: Array<{ label: string; count: number }>;
  };
  fundBalances: Array<{
    fundId: string;
    fundName: string;
    fundType: string;
    balanceCents: number;
  }>;
};

export type CalendarMonthOverview = {
  month: string;
  items: Array<{
    id: string;
    title: string;
    date: string;
    status: string;
    kind: string;
    grantId: string;
    grantName?: string;
  }>;
};

function capitalizeFirst(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatRiskSummary(reasons: string[]): string {
  if (reasons.length === 0) return "";

  const budgetConcerns: string[] = [];
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

const emptyExecutiveSnapshot: ExecutiveSnapshot = {
  status: "clear",
  statusLabel: "Under control",
  statusDescription: "No urgent grant or reporting work needs attention.",
  primaryMetricLabel: "Urgent work",
  primaryMetricValue: "0 urgent",
  secondaryMetricLabel: "Upcoming deadlines",
  secondaryMetricValue: "0 next 30 days",
  priorityActions: [],
};

const defaultDashboardHomeLayout: DashboardHomeLayout = {
  pinnedWidgetIds: [...DEFAULT_DASHBOARD_WIDGETS_BY_ROLE.viewer],
  source: "default",
};

export function useDashboardOverview() {
  return useQuery({
    queryKey: ["dashboard-overview"],
    queryFn: async (): Promise<DashboardOverview> => {
      const res = await overview.dashboard.$get();
      const payload = (await readResponseOrThrow<unknown>(res)) as RawDashboardOverview;
      return {
        asOf: payload.asOf,
        dashboardLayout: payload.dashboardLayout ?? defaultDashboardHomeLayout,
        executiveSnapshot: payload.executiveSnapshot ?? emptyExecutiveSnapshot,
        upcomingDeadlines: payload.upcomingDeadlines.map((deadline) => ({
          id: `${deadline.kind}:${deadline.grantId}:${deadline.dueDate}:${deadline.label}`,
          title: deadline.label,
          date: deadline.dueDate,
          kind: deadline.kind,
          grantId: deadline.grantId,
          grantName: deadline.grantName,
        })),
        atRiskGrants: payload.atRiskGrants.map((grant) => ({
          id: grant.grantId,
          name: grant.grantName,
          health: grant.healthState,
          reason: formatRiskSummary(grant.riskReasons),
        })),
        complianceHealth: payload.complianceHealth,
        boardReportFreshness: payload.boardReportFreshness,
        recentActivity: payload.recentActivity,
        donorMetrics: {
          retentionRate: payload.donorMetrics.retentionRate * 100,
          currentFiscalYearGivingCents: payload.donorMetrics.totalGivingThisFY,
          previousFiscalYearGivingCents: payload.donorMetrics.previousFiscalYearGivingCents ?? 0,
          newDonorCount: payload.donorMetrics.newDonorsThisFY,
        },
        pipelineSummary: {
          donors: payload.pipelineSummary.donor.map((item) => ({
            label: item.stage,
            count: item.count,
          })),
          grants: payload.pipelineSummary.grants.map((item) => ({
            label: item.status,
            count: item.count,
          })),
        },
        fundBalances: payload.fundBalancesOverview.map((fund) => ({
          fundId: fund.fundId,
          fundName: fund.name,
          fundType: fund.type,
          balanceCents: fund.currentBalanceCents,
        })),
      };
    },
  });
}

export function useDashboardHomePreferenceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: DashboardPreferenceInput): Promise<DashboardHomeLayout> => {
      const res = await overview.dashboard.preferences.$put({
        json: input,
      });
      return (await readResponseOrThrow<unknown>(res)) as DashboardHomeLayout;
    },
    onSuccess: (_data, input) => {
      captureEvent(ANALYTICS_EVENTS.dashboardHomeCustomized, {
        pinned_count: input.pinnedWidgetIds.length,
      });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
    },
  });
}

export function useCalendarMonth(month: string) {
  return useQuery({
    queryKey: ["calendar-overview", month],
    queryFn: async (): Promise<CalendarMonthOverview> => {
      const res = await overview.calendar.$get({
        query: { month },
      });
      const payload = await readResponseOrThrow<RawCalendarOverview>(res);
      return {
        month: payload.month,
        items: payload.days.flatMap((day) =>
          day.items.map((item) => ({
            id:
              item.reportingRequirementId ??
              item.closeoutItemId ??
              `${item.kind}:${item.grantId}:${item.dueDate}:${item.label}`,
            title: item.label,
            date: item.dueDate,
            status: item.status,
            kind: item.kind,
            grantId: item.grantId,
            grantName: item.grantName,
          })),
        ),
      };
    },
  });
}
