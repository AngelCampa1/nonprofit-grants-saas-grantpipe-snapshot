import type {
  DraftingAssistantCitation,
  DraftingAssistantResponse,
  ParsedDraftingAssistantGenerateInput,
} from "@grantpipe/shared";
import {
  DRAFTING_ASSISTANT_MODEL_ID,
  DRAFTING_ASSISTANT_PROMPT_VERSION,
  draftingAssistantResponseSchema,
} from "@grantpipe/shared";
import { internalError, notFound } from "../../lib/app-error";
import type { Database } from "@grantpipe/db";
import { generateDraftWithOpenRouter } from "./openrouter";

export type GenerateDraftParams = {
  orgId: string;
  actorId: string;
  input: ParsedDraftingAssistantGenerateInput;
  appUrl?: string;
  openRouterApiKey?: string;
};

type DateLike = Date | string | null | undefined;

type GrantDraftRow = {
  id: string;
  name: string;
  status: string;
  amountCents: number | null;
  startDate: DateLike;
  endDate: DateLike;
  description: string | null;
  funder?: { name: string } | null;
  reportingRequirements?: Array<{
    id: string;
    reportType: string;
    dueDate: DateLike;
    notes: string | null;
    deletedAt?: DateLike;
  }>;
  impactMetrics?: Array<{
    id: string;
    name: string;
    targetValue: string | number | null;
    unit: string | null;
    deletedAt?: DateLike;
    entries?: Array<{
      id: string;
      value: string | number | null;
      periodStart: DateLike;
      periodEnd: DateLike;
      deletedAt?: DateLike;
    }>;
  }>;
  budgetVersions?: Array<{
    id: string;
    status: string;
    deletedAt?: DateLike;
    lines?: Array<{
      id: string;
      category: string;
      approvedAmountCents: number;
      costType: string;
      deletedAt?: DateLike;
    }>;
  }>;
};

type OutcomeGoalDraftRow = {
  id: string;
  programId: string | null;
  name: string;
  statement: string;
  targetPopulation: string | null;
  status: string;
  deletedAt?: DateLike;
  indicators?: Array<{
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
    deletedAt?: DateLike;
  }>;
};

function toIsoDate(value: DateLike): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function formatCurrency(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "not recorded";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function liveRows<T extends { deletedAt?: DateLike }>(rows: T[] | undefined): T[] {
  return (rows ?? []).filter((row) => !row.deletedAt);
}

async function loadGrantForDrafting(
  db: Database,
  params: { orgId: string; grantId: string },
): Promise<GrantDraftRow | null> {
  const row = await db.query.grants.findFirst({
    where: (table, { and, eq, isNull }) =>
      and(eq(table.id, params.grantId), eq(table.orgId, params.orgId), isNull(table.deletedAt)),
    with: {
      funder: true,
      reportingRequirements: true,
      impactMetrics: {
        with: {
          entries: true,
        },
      },
      budgetVersions: {
        with: {
          lines: true,
        },
      },
    },
  });
  return (row ?? null) as GrantDraftRow | null;
}

async function loadOutcomeGoalsForDrafting(
  db: Database,
  params: { orgId: string; grantId: string },
): Promise<OutcomeGoalDraftRow[]> {
  if (!("outcomeGoals" in db.query)) {
    return [];
  }

  const rows = await db.query.outcomeGoals.findMany({
    where: (table, { and, eq, isNull }) =>
      and(
        eq(table.orgId, params.orgId),
        eq(table.grantId, params.grantId),
        isNull(table.deletedAt),
      ),
    with: {
      indicators: true,
    },
  });
  return rows as OutcomeGoalDraftRow[];
}

function buildSourceContext(
  grant: GrantDraftRow,
  outcomeGoals: OutcomeGoalDraftRow[],
  input: ParsedDraftingAssistantGenerateInput,
) {
  const reportingRows = liveRows(grant.reportingRequirements);
  const metricRows = liveRows(grant.impactMetrics);
  const approvedBudget = liveRows(grant.budgetVersions).find(
    (version) => version.status === "approved",
  );
  const budgetLines = liveRows(approvedBudget?.lines);
  const outcomeRows = liveRows(outcomeGoals);

  const lines = [
    `Draft type: ${input.draftType}`,
    `Grant: ${grant.name}`,
    `Funder: ${grant.funder?.name ?? "not recorded"}`,
    `Status: ${grant.status}`,
    `Award amount: ${formatCurrency(grant.amountCents)}`,
    `Grant period: ${toIsoDate(grant.startDate) ?? "not recorded"} to ${
      toIsoDate(grant.endDate) ?? "not recorded"
    }`,
    `Description: ${grant.description ?? "not recorded"}`,
  ];

  if (input.reportPeriodStart || input.reportPeriodEnd) {
    lines.push(
      `Requested report period: ${input.reportPeriodStart ?? "not specified"} to ${
        input.reportPeriodEnd ?? "not specified"
      }`,
    );
  }

  lines.push("Reporting requirements:");
  if (reportingRows.length === 0) {
    lines.push("- No reporting requirements are recorded.");
  } else {
    for (const requirement of reportingRows.slice(0, 8)) {
      lines.push(
        `- ${requirement.reportType}; due ${toIsoDate(requirement.dueDate) ?? "not recorded"}; ${
          requirement.notes ?? "no notes"
        }`,
      );
    }
  }

  lines.push("Impact metrics:");
  if (metricRows.length === 0) {
    lines.push("- No impact metrics are recorded.");
  } else {
    for (const metric of metricRows.slice(0, 8)) {
      const latest = liveRows(metric.entries).sort((a, b) =>
        (toIsoDate(b.periodEnd) ?? "").localeCompare(toIsoDate(a.periodEnd) ?? ""),
      )[0];
      lines.push(
        `- ${metric.name}: target ${metric.targetValue ?? "not recorded"} ${
          metric.unit ?? ""
        }; latest ${latest?.value ?? "not recorded"} through ${
          toIsoDate(latest?.periodEnd) ?? "not recorded"
        }`,
      );
    }
  }

  lines.push("Approved budget lines:");
  if (budgetLines.length === 0) {
    lines.push("- No approved budget lines are recorded.");
  } else {
    for (const line of budgetLines.slice(0, 10)) {
      lines.push(
        `- ${line.category}: ${formatCurrency(line.approvedAmountCents)} (${line.costType})`,
      );
    }
  }

  lines.push("Outcome goals:");
  if (outcomeRows.length === 0) {
    lines.push("- No outcome goals are recorded for this grant.");
  } else {
    for (const goal of outcomeRows.slice(0, 6)) {
      lines.push(
        `- ${goal.name}: ${goal.statement}; population ${
          goal.targetPopulation ?? "not recorded"
        }; status ${goal.status}`,
      );
      for (const indicator of liveRows(goal.indicators).slice(0, 5)) {
        lines.push(
          `  - ${indicator.name}: ${indicator.indicatorType}; target ${
            indicator.targetValue ?? "not recorded"
          } ${indicator.unit ?? ""}; source ${
            indicator.source ?? "not recorded"
          }; cadence ${indicator.reportingCadence ?? "not recorded"}; funder defined ${
            indicator.funderDefined ? "yes" : "no"
          }`,
        );
      }
    }
  }

  return lines.join("\n");
}

function buildCitations(
  grant: GrantDraftRow,
  outcomeGoals: OutcomeGoalDraftRow[],
): DraftingAssistantCitation[] {
  const citations: DraftingAssistantCitation[] = [
    {
      type: "grant",
      label: grant.name,
      href: `/grants/${grant.id}`,
      value: grant.status,
    },
  ];

  for (const requirement of liveRows(grant.reportingRequirements).slice(0, 8)) {
    citations.push({
      type: "report_row",
      label: requirement.reportType,
      href: `/grants/${grant.id}`,
      value: toIsoDate(requirement.dueDate) ?? undefined,
    });
  }

  for (const metric of liveRows(grant.impactMetrics).slice(0, 8)) {
    citations.push({
      type: "metric",
      label: metric.name,
      href: `/grants/${grant.id}`,
      value: metric.unit ?? undefined,
    });
  }

  const approvedBudget = liveRows(grant.budgetVersions).find(
    (version) => version.status === "approved",
  );
  for (const budgetLine of liveRows(approvedBudget?.lines).slice(0, 10)) {
    citations.push({
      type: "budget",
      label: budgetLine.category,
      href: `/grants/${grant.id}/budget`,
      value: formatCurrency(budgetLine.approvedAmountCents),
    });
  }

  for (const goal of liveRows(outcomeGoals).slice(0, 6)) {
    citations.push({
      type: "outcome",
      label: goal.name,
      href: goal.programId ? `/programs/${goal.programId}` : `/grants/${grant.id}`,
      value: goal.status,
    });
  }

  return citations;
}

function draftSafeguards(): string[] {
  return [
    "Editable draft only. A human must review, edit, and submit outside GrantPipe.",
    "GrantPipe never auto-submits proposals or reports to a funder portal.",
    "The draft is limited to the cited GrantPipe records. Do not add uncited claims without review.",
  ];
}

export async function generateDraft(
  db: Database,
  params: GenerateDraftParams,
): Promise<DraftingAssistantResponse> {
  if (!params.openRouterApiKey) {
    throw internalError("OPENROUTER_API_KEY is not configured");
  }

  const grant = await loadGrantForDrafting(db, {
    orgId: params.orgId,
    grantId: params.input.grantId,
  });
  if (!grant) throw notFound("Grant not found");
  const outcomeGoals = await loadOutcomeGoalsForDrafting(db, {
    orgId: params.orgId,
    grantId: params.input.grantId,
  });

  const providerDraft = await generateDraftWithOpenRouter({
    apiKey: params.openRouterApiKey,
    appUrl: params.appUrl ?? "https://app.grantpipe.com",
    draftType: params.input.draftType,
    userPrompt: params.input.userPrompt,
    sourceContext: buildSourceContext(grant, outcomeGoals, params.input),
  });

  return draftingAssistantResponseSchema.parse({
    ...providerDraft,
    draftType: params.input.draftType,
    citations: buildCitations(grant, outcomeGoals),
    safeguards: draftSafeguards(),
    modelId: DRAFTING_ASSISTANT_MODEL_ID,
    promptVersion: DRAFTING_ASSISTANT_PROMPT_VERSION,
    generatedAt: new Date().toISOString(),
  });
}
