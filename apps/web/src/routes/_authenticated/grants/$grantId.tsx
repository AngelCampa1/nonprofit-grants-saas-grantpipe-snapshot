import React, { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { QuickShareSheet } from "../../../components/portal/QuickShareSheet";
import { ConfirmDialog } from "../../../components/confirm-dialog";
import {
  Alert,
  Badge,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  PageHeader,
  PageShell,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  StatusPanel,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@grantpipe/ui";
import {
  useAllocationMutations,
  useCloseoutItemMutations,
  useExpenseMutations,
  useFunders,
  useFunds,
  useGrant,
  useGrantBudgetVariance,
  useGenerateSpendDownReport,
  useGrantUpdateMutations,
  useImpactMetricMutations,
  useReportingRequirementMutations,
  useSpendDown,
} from "../../../hooks/use-grants";
import { useOrgBilling } from "../../../hooks/use-org-settings";
import { useSession } from "../../../hooks/use-session";
import { useSubawards } from "../../../hooks/use-subrecipients";
import { EntityActivitySection } from "../../../components/entity-activity-section";
import { RetryButton } from "../../../components/retry-button";
import { EntityCustomFieldsSection } from "../../../components/entity-custom-fields-section";
import { EntityDocumentsSection } from "../../../components/entity-documents-section";
import { RestrictionLifecyclePanel } from "../../../components/restrictions/restriction-lifecycle-panel";
import {
  formatCurrency,
  formatGrantStatusLabel,
  formatThresholdLabel,
  formatPaymentRequestStatus,
  formatPaymentRequestType,
  formatUtcCalendarDate,
  humanizeEnum,
} from "../../../lib/format";
import { GRANT_STAGE_DETAILS, getGrantStageInfo } from "../../../lib/grant-stages";
import { canAccessFeature } from "../../../lib/access-control";
import {
  GRANT_STATUSES,
  REPORT_TYPE_LABELS,
  REPORT_TYPES,
  canUseGrantBudgetAiExtraction,
  canUseGrantBudgetAmendments,
  canUsePlannedExpenses,
  formatMinimumPlanLabelForFeatures,
  getEffectivePlanTier,
  getPlanEntitlementLabelList,
  getPlanLabelsWithEntitlement,
  hasComplianceReportPack,
  hasPaymentRequests,
  hasProgramAllocations,
  hasSubrecipientMonitoring,
  grantProgramAllocationReplaceSchema,
  expenseProgramAllocationReplaceSchema,
  type GrantBudgetLineRollup,
  type CreateReportingRequirementInput,
  type GrantStatus,
} from "@grantpipe/shared";
import { usePaymentRequests, useGrantPaymentSummary } from "../../../hooks/use-payments";
import { useStartDocumentExtraction } from "../../../hooks/use-document-extractions";
import {
  usePrograms,
  useReplaceGrantProgramAllocations,
  useReplaceExpenseProgramAllocations,
} from "../../../hooks/use-programs";
import { centsFromInput } from "../../../lib/money";
import { captureDetailTabViewed } from "../../../lib/record-discovery-analytics";

export const Route = createFileRoute("/_authenticated/grants/$grantId")({
  component: GrantDetailPage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-destructive">
      <p className="font-semibold">Unable to load page</p>
      <p className="text-sm text-muted-foreground">
        {error instanceof Error ? error.message : "Unknown error"}
      </p>
    </div>
  ),
  pendingComponent: () => (
    <div className="p-8 space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-40" />
    </div>
  ),
});

const COMPLIANCE_REPORT_PACK_PLAN_LABELS = getPlanLabelsWithEntitlement("hasComplianceReportPack");
const COMPLIANCE_REPORT_PACK_MIN_PLAN_LABEL = COMPLIANCE_REPORT_PACK_PLAN_LABELS[0] ?? "paid";
const COMPLIANCE_REPORT_PACK_PLAN_LIST = getPlanEntitlementLabelList("hasComplianceReportPack");
const PAYMENT_REQUESTS_MIN_PLAN_LABEL = formatMinimumPlanLabelForFeatures(["hasPaymentRequests"]);
const SUBRECIPIENT_MONITORING_MIN_PLAN_LABEL = formatMinimumPlanLabelForFeatures([
  "hasSubrecipientMonitoring",
]);
const PLANNED_EXPENSES_MIN_PLAN_LABEL = formatMinimumPlanLabelForFeatures(["hasPlannedExpenses"]);
const BUDGET_AI_EXTRACTION_MIN_PLAN_LABEL = formatMinimumPlanLabelForFeatures([
  "hasGrantBudgetAiExtraction",
]);
const BUDGET_AMENDMENTS_MIN_PLAN_LABEL = formatMinimumPlanLabelForFeatures([
  "hasGrantBudgetAmendments",
]);

// Pre-fill a money input from integer cents. Always two decimals so a whole-dollar
// allocation seeds as "1000.00", not "1000" — an editable amount must read like money.
export function centsToAmountInput(amountCents: number): string {
  return (amountCents / 100).toFixed(2);
}

function GrantStageProgressStrip({ currentStatus }: { currentStatus: GrantStatus }) {
  const PIPELINE_STAGES: GrantStatus[] = [
    "discovery",
    "application",
    "submitted",
    "awarded",
    "active",
    "reporting",
    "closeout",
  ];

  const currentIndex = PIPELINE_STAGES.indexOf(currentStatus);
  const isTerminalDeclined = currentStatus === "declined";
  const isRenewal = currentStatus === "renewal";
  const isTerminal = isTerminalDeclined || isRenewal;

  // The strip can be wider than a phone viewport (7 stages + a terminal badge).
  // Keep the active stage in view so the user always sees where the grant
  // stands, even when the current stage would otherwise be scrolled off-screen.
  const currentStageRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    currentStageRef.current?.scrollIntoView?.({ inline: "center", block: "nearest" });
  }, [currentStatus]);

  return (
    <div
      data-testid="stage-progress-strip"
      className="flex items-center gap-0 overflow-x-auto rounded-full border border-border bg-muted px-1 py-1"
    >
      {PIPELINE_STAGES.map((stage, idx) => {
        const isPast = !isTerminal && currentIndex > idx;
        const isCurrent = !isTerminal && currentIndex === idx;

        return (
          <div key={stage} className="flex items-center">
            <div
              ref={isCurrent ? currentStageRef : undefined}
              className={cn(
                "whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors",
                isCurrent
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : isPast
                    ? "text-muted-foreground"
                    : "text-muted-foreground/50",
              )}
            >
              {getGrantStageInfo(stage).label}
            </div>
            {idx < PIPELINE_STAGES.length - 1 ? (
              <div
                className={cn(
                  "mx-0.5 h-px w-4 shrink-0",
                  isPast || isCurrent ? "bg-border" : "bg-border/40",
                )}
              />
            ) : null}
          </div>
        );
      })}
      {isTerminal ? (
        <div
          ref={currentStageRef}
          className={cn(
            "ml-2 shrink-0 rounded-full px-3 py-1 text-xs font-medium",
            isTerminalDeclined ? "bg-destructive/10 text-destructive" : "bg-info/10 text-info",
          )}
        >
          {isTerminalDeclined ? "Declined" : "Renewal"}
        </div>
      ) : null}
    </div>
  );
}

interface LinkedContextPanelProps {
  grant: {
    startDate?: string | null;
    endDate?: string | null;
    applicationDeadline?: string | null;
    funder?: { id: string; name: string } | null;
    description?: string | null;
  };
  allocations: Array<{ fund?: { id: string; name?: string } | null }>;
}

function LinkedContextPanel({ grant, allocations }: LinkedContextPanelProps) {
  const linkedFunds = allocations
    .filter((a) => a.fund != null)
    .map((a) => a.fund!)
    .filter(
      (f, i, arr): f is { id: string; name?: string } =>
        f.id != null && arr.findIndex((x) => x.id === f.id) === i,
    );

  return (
    <aside
      data-testid="linked-context-panel"
      className="space-y-4 rounded-2xl border border-border bg-muted/40 p-4"
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Linked context
      </p>

      {grant.funder ? (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Funder</p>
          <Link
            to="/funders/$funderId"
            params={{ funderId: grant.funder.id }}
            className="text-sm font-medium text-primary hover:underline"
          >
            {grant.funder.name}
          </Link>
        </div>
      ) : null}

      {linkedFunds.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {linkedFunds.length === 1 ? "Fund" : "Funds"}
          </p>
          {linkedFunds.map((f) => (
            <Link
              key={f.id}
              to="/funds/$fundId"
              params={{ fundId: f.id }}
              className="block text-sm font-medium text-primary hover:underline"
            >
              {f.name}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Key dates</p>
        {grant.applicationDeadline ? (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Deadline</span>
            <span className="font-mono text-xs">
              {formatUtcCalendarDate(grant.applicationDeadline)}
            </span>
          </div>
        ) : null}
        {grant.startDate ? (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Start</span>
            <span className="font-mono text-xs">{formatUtcCalendarDate(grant.startDate)}</span>
          </div>
        ) : null}
        {grant.endDate ? (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">End</span>
            <span className="font-mono text-xs">{formatUtcCalendarDate(grant.endDate)}</span>
          </div>
        ) : null}
        {!grant.applicationDeadline && !grant.startDate && !grant.endDate ? (
          <p className="text-xs text-muted-foreground">No dates set</p>
        ) : null}
      </div>
    </aside>
  );
}

function AwardIntakeDocumentAction({ documentId }: { documentId: string }) {
  const navigate = useNavigate();
  const startExtraction = useStartDocumentExtraction();
  const [intakeError, setIntakeError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={startExtraction.isPending}
        onClick={() => {
          setIntakeError(null);
          void startExtraction
            .mutateAsync(documentId)
            .then((extraction) =>
              navigate({
                to: "/award-intake/$extractionId",
                params: { extractionId: extraction.id },
              }),
            )
            .catch((error: unknown) =>
              setIntakeError(error instanceof Error ? error.message : "Unable to start AI intake."),
            );
        }}
      >
        AI intake
      </Button>
      {intakeError ? <p className="text-xs text-destructive">{intakeError}</p> : null}
    </div>
  );
}

function GrantSubrecipientsTab({
  grantId,
  planTier,
}: {
  grantId: string;
  planTier: string | null;
}) {
  const enabled = hasSubrecipientMonitoring(planTier);

  if (!enabled) {
    return (
      <StatusPanel variant="empty">
        <div className="space-y-3">
          <p>
            Subrecipient monitoring requires the {SUBRECIPIENT_MONITORING_MIN_PLAN_LABEL} plan or
            higher.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/settings" hash="billing">
              Review pricing
            </Link>
          </Button>
        </div>
      </StatusPanel>
    );
  }

  return <GrantSubrecipientsTable grantId={grantId} />;
}

function GrantSubrecipientsTable({ grantId }: { grantId: string }) {
  const subawardsQuery = useSubawards({ grantId });
  const rows = subawardsQuery.data?.data ?? [];

  if (subawardsQuery.isError) {
    return (
      <Alert variant="destructive" title="Unable to load linked subawards">
        <p>{subawardsQuery.error instanceof Error ? subawardsQuery.error.message : "Try again."}</p>
        <RetryButton query={subawardsQuery} />
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Subrecipient monitoring</CardTitle>
          <Button asChild variant="outline" size="sm">
            <Link to="/subrecipients" search={{ grantId }}>
              Create or link subaward
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              No subawards are linked to this grant yet.
            </p>
            <Link
              to="/subrecipients"
              search={{ grantId }}
              className="text-sm font-medium text-primary hover:underline"
            >
              Open subrecipient monitoring
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Subaward</th>
                  <th className="px-4 py-3 font-medium">Risk</th>
                  <th className="px-4 py-3 font-medium">Open tasks</th>
                  <th className="px-4 py-3 font-medium">Open findings</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-4 py-3">
                      <Link
                        to="/subrecipients/$subrecipientId"
                        params={{ subrecipientId: row.subrecipientId }}
                        search={{ grantId }}
                        className="font-medium text-primary hover:underline"
                      >
                        {row.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={row.riskRating === "high" ? "destructive" : "outline"}>
                        {row.riskRating ?? "Not assessed"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {row.openTaskCount ?? 0}
                      {row.overdueTaskCount ? ` (${row.overdueTaskCount} overdue)` : ""}
                    </td>
                    <td className="px-4 py-3">{row.openFindingCount ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type ProgramAllocationRow = { programId: string; amount: string };

type GrantProgramAllocation = {
  id: string;
  programId: string;
  amountCents?: number | null;
  program?: { id: string; name?: string | null } | null;
};

type ExpenseProgramAllocation = {
  id: string;
  programId: string;
  amountCents?: number | null;
  percentBasisPoints?: number | null;
  program?: { id: string; name?: string | null } | null;
};

type ExpenseAllocationMode = "amount" | "percent";
type ExpenseAllocationRow = { programId: string; value: string };

function GrantProgramAllocationsEditor({
  grantId,
  canEdit,
  currentAllocations,
}: {
  grantId: string;
  canEdit: boolean;
  currentAllocations: GrantProgramAllocation[];
}) {
  const programsQuery = usePrograms({
    page: 1,
    pageSize: 100,
    sortBy: "name",
    sortOrder: "asc",
  });
  const programs = (programsQuery.data?.data ?? []) as Array<{
    id: string;
    name: string;
    code?: string | null;
  }>;
  const replaceAllocations = useReplaceGrantProgramAllocations(grantId);

  const [rows, setRows] = useState<ProgramAllocationRow[]>(() =>
    currentAllocations.length > 0
      ? currentAllocations.map((allocation) => ({
          programId: allocation.programId,
          amount:
            typeof allocation.amountCents === "number"
              ? centsToAmountInput(allocation.amountCents)
              : "",
        }))
      : [{ programId: "", amount: "" }],
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function updateRow(index: number, patch: Partial<ProgramAllocationRow>) {
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
    setError(null);
    setSaved(false);
  }

  function addRow() {
    setRows((current) => [...current, { programId: "", amount: "" }]);
    setSaved(false);
  }

  function removeRow(index: number) {
    setRows((current) => {
      const next = current.filter((_, rowIndex) => rowIndex !== index);
      return next.length > 0 ? next : [{ programId: "", amount: "" }];
    });
    setError(null);
    setSaved(false);
  }

  async function handleSave() {
    const activeRows = rows.filter((row) => row.programId.length > 0);
    if (activeRows.some((row) => centsFromInput(row.amount) <= 0)) {
      setError("Enter a positive amount for each program allocation.");
      return;
    }
    const allocations = activeRows.map((row) => ({
      programId: row.programId,
      amountCents: centsFromInput(row.amount),
    }));
    const parsed = grantProgramAllocationReplaceSchema.safeParse({ grantId, allocations });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Program allocations are invalid.");
      return;
    }
    try {
      await replaceAllocations.mutateAsync({ grantId, allocations });
      setError(null);
      setSaved(true);
    } catch (mutationError) {
      setSaved(false);
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Unable to save program allocations.",
      );
    }
  }

  function programName(allocation: GrantProgramAllocation) {
    if (allocation.program?.name) {
      return allocation.program.name;
    }
    const match = programs.find((program) => program.id === allocation.programId);
    return match?.name ?? "Unknown program";
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Program allocations</CardTitle>
        <p className="text-sm text-muted-foreground">
          Split this grant across the programs it funds so program budget-vs-actual reporting stays
          accurate.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canEdit ? (
          currentAllocations.length > 0 ? (
            <ul className="space-y-2">
              {currentAllocations.map((allocation) => (
                <li
                  key={allocation.id}
                  className="flex items-center justify-between rounded-xl border px-4 py-2 text-sm"
                >
                  <span className="font-medium">{programName(allocation)}</span>
                  <span>
                    {typeof allocation.amountCents === "number"
                      ? formatCurrency(allocation.amountCents)
                      : "—"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No programs are allocated to this grant yet.
            </p>
          )
        ) : (
          <>
            {error ? (
              <Alert variant="destructive" title="Unable to save program allocations">
                {error}
              </Alert>
            ) : null}
            {saved ? (
              <p className="text-sm font-medium text-success">Program allocations saved.</p>
            ) : null}
            <div className="space-y-3">
              {rows.map((row, index) => (
                <div
                  key={index}
                  className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[1fr_180px_auto] sm:items-end"
                >
                  <div className="space-y-1">
                    <Label htmlFor={`program-alloc-${index}`}>Program</Label>
                    <Select
                      value={row.programId}
                      onValueChange={(value) => updateRow(index, { programId: value })}
                    >
                      <SelectTrigger
                        id={`program-alloc-${index}`}
                        aria-label={`Program for allocation row ${index + 1}`}
                      >
                        <SelectValue placeholder="Select a program" />
                      </SelectTrigger>
                      <SelectContent>
                        {programs.map((program) => (
                          <SelectItem key={program.id} value={program.id}>
                            <span className="flex flex-col">
                              <span>{program.name}</span>
                              {program.code ? (
                                <span className="text-xs text-muted-foreground">
                                  {program.code}
                                </span>
                              ) : null}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`program-alloc-amount-${index}`}>Amount (USD)</Label>
                    <Input
                      id={`program-alloc-amount-${index}`}
                      aria-label={`Program allocation amount ${index + 1}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.amount}
                      onChange={(event) => updateRow(index, { amount: event.target.value })}
                    />
                  </div>
                  {rows.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove program allocation row ${index + 1}`}
                      onClick={() => removeRow(index)}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="outline" size="sm" onClick={addRow}>
                Add program allocation
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={replaceAllocations.isPending}
                onClick={() => {
                  void handleSave();
                }}
              >
                Save program allocations
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ExpenseProgramAllocationsEditor({
  expenseId,
  grantId,
  canEdit,
  currentAllocations,
}: {
  expenseId: string;
  grantId: string;
  canEdit: boolean;
  currentAllocations: ExpenseProgramAllocation[];
}) {
  const programsQuery = usePrograms({
    page: 1,
    pageSize: 100,
    sortBy: "name",
    sortOrder: "asc",
  });
  const programs = (programsQuery.data?.data ?? []) as Array<{
    id: string;
    name: string;
    code?: string | null;
  }>;
  const replaceAllocations = useReplaceExpenseProgramAllocations(expenseId, grantId);

  const initialMode: ExpenseAllocationMode =
    currentAllocations.length > 0 &&
    currentAllocations.every((allocation) => typeof allocation.percentBasisPoints === "number")
      ? "percent"
      : "amount";
  const [mode, setMode] = useState<ExpenseAllocationMode>(initialMode);
  const [rows, setRows] = useState<ExpenseAllocationRow[]>(() =>
    currentAllocations.length > 0
      ? currentAllocations.map((allocation) => ({
          programId: allocation.programId,
          value:
            initialMode === "percent"
              ? typeof allocation.percentBasisPoints === "number"
                ? (allocation.percentBasisPoints / 100).toString()
                : ""
              : typeof allocation.amountCents === "number"
                ? centsToAmountInput(allocation.amountCents)
                : "",
        }))
      : [{ programId: "", value: "" }],
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function updateRow(index: number, patch: Partial<ExpenseAllocationRow>) {
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
    setError(null);
    setSaved(false);
  }

  function addRow() {
    setRows((current) => [...current, { programId: "", value: "" }]);
    setSaved(false);
  }

  function removeRow(index: number) {
    setRows((current) => {
      const next = current.filter((_, rowIndex) => rowIndex !== index);
      return next.length > 0 ? next : [{ programId: "", value: "" }];
    });
    setError(null);
    setSaved(false);
  }

  function changeMode(next: ExpenseAllocationMode) {
    setMode(next);
    setError(null);
    setSaved(false);
  }

  async function handleSave() {
    const activeRows = rows.filter((row) => row.programId.length > 0);
    if (activeRows.length === 0) {
      setError("Add at least one program allocation.");
      return;
    }
    if (activeRows.some((row) => !(Number(row.value) > 0))) {
      setError(
        mode === "percent"
          ? "Enter a positive percentage for each program allocation."
          : "Enter a positive amount for each program allocation.",
      );
      return;
    }
    const allocations = activeRows.map((row) =>
      mode === "percent"
        ? { programId: row.programId, percentBasisPoints: Math.round(Number(row.value) * 100) }
        : { programId: row.programId, amountCents: centsFromInput(row.value) },
    );
    const balanceMode = mode === "percent" ? "replace_and_balance" : "replace";
    const parsed = expenseProgramAllocationReplaceSchema.safeParse({
      expenseId,
      balanceMode,
      allocations,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Expense allocations are invalid.");
      return;
    }
    try {
      await replaceAllocations.mutateAsync({ expenseId, balanceMode, allocations });
      setError(null);
      setSaved(true);
    } catch (mutationError) {
      setSaved(false);
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Unable to save expense allocations.",
      );
    }
  }

  function programName(allocation: ExpenseProgramAllocation) {
    if (allocation.program?.name) {
      return allocation.program.name;
    }
    const match = programs.find((program) => program.id === allocation.programId);
    return match?.name ?? "Unknown program";
  }

  function allocationLabel(allocation: ExpenseProgramAllocation) {
    if (typeof allocation.percentBasisPoints === "number") {
      return `${allocation.percentBasisPoints / 100}%`;
    }
    if (typeof allocation.amountCents === "number") {
      return formatCurrency(allocation.amountCents);
    }
    return "—";
  }

  if (!canEdit) {
    return currentAllocations.length > 0 ? (
      <ul className="space-y-1">
        {currentAllocations.map((allocation) => (
          <li
            key={allocation.id}
            className="flex items-center justify-between rounded-lg border px-3 py-1.5 text-xs"
          >
            <span className="font-medium">{programName(allocation)}</span>
            <span>{allocationLabel(allocation)}</span>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-xs text-muted-foreground">
        No programs are allocated to this expense yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <Alert variant="destructive" title="Unable to save expense allocations">
          {error}
        </Alert>
      ) : null}
      {saved ? (
        <p className="text-xs font-medium text-success">Expense allocations saved.</p>
      ) : null}
      <div className="space-y-1">
        <Label htmlFor={`expense-alloc-mode-${expenseId}`}>Allocation mode</Label>
        <Select value={mode} onValueChange={(value) => changeMode(value as ExpenseAllocationMode)}>
          <SelectTrigger
            id={`expense-alloc-mode-${expenseId}`}
            aria-label="Expense allocation mode"
            className="sm:w-[260px]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="amount">By dollar amount</SelectItem>
            <SelectItem value="percent">By percentage (must total 100%)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-3">
        {rows.map((row, index) => (
          <div
            key={index}
            className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[1fr_160px_auto] sm:items-end"
          >
            <div className="space-y-1">
              <Label htmlFor={`expense-alloc-${expenseId}-${index}`}>Program</Label>
              <Select
                value={row.programId}
                onValueChange={(value) => updateRow(index, { programId: value })}
              >
                <SelectTrigger
                  id={`expense-alloc-${expenseId}-${index}`}
                  aria-label={`Program for expense allocation row ${index + 1}`}
                >
                  <SelectValue placeholder="Select a program" />
                </SelectTrigger>
                <SelectContent>
                  {programs.map((program) => (
                    <SelectItem key={program.id} value={program.id}>
                      <span className="flex flex-col">
                        <span>{program.name}</span>
                        {program.code ? (
                          <span className="text-xs text-muted-foreground">{program.code}</span>
                        ) : null}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`expense-alloc-value-${expenseId}-${index}`}>
                {mode === "percent" ? "Percent (%)" : "Amount (USD)"}
              </Label>
              <Input
                id={`expense-alloc-value-${expenseId}-${index}`}
                aria-label={`Expense allocation ${mode === "percent" ? "percent" : "amount"} ${
                  index + 1
                }`}
                type="number"
                min="0"
                step={mode === "percent" ? "0.01" : "0.01"}
                value={row.value}
                onChange={(event) => updateRow(index, { value: event.target.value })}
              />
            </div>
            {rows.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove expense allocation row ${index + 1}`}
                onClick={() => removeRow(index)}
              >
                Remove
              </Button>
            ) : null}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          Add expense allocation
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={replaceAllocations.isPending}
          onClick={() => {
            void handleSave();
          }}
        >
          Save expense allocations
        </Button>
      </div>
    </div>
  );
}

function nullableText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function trimmedText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

export function normalizeDateInput(value: string) {
  if (value.length === 0) return null;
  return value.includes("T") ? value : `${value}T12:00:00.000Z`;
}

export function formatIsoDateLabel(value: string | null | undefined) {
  if (!value) return "--";
  const datePart = value.slice(0, 10);
  const [yearText, monthText, dayText] = datePart.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return datePart;
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatYearMonthLabel(value: string | null | undefined) {
  if (!value) return "";
  const [yearText, monthText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    month < 1 ||
    month > 12 ||
    yearText?.length !== 4
  ) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

type PaymentsGrantTabProps = {
  grantId: string;
  planTier: string | null;
};

type GrantBudgetTabProps = {
  grantId: string;
  planTier: string | null;
};

type GrantPaymentSummaryData = {
  totalRequestedCents?: number | null;
  totalApprovedCents?: number | null;
  totalPaidCents?: number | null;
  outstandingCents?: number | null;
};

type GrantPaymentRequestRow = {
  id: string;
  requestNumber?: string | null;
  type?: string | null;
  status?: string | null;
  requestedAmountCents?: number | null;
  createdAt?: string | null;
};

function PaymentsGrantTab({ grantId, planTier }: PaymentsGrantTabProps) {
  const paymentsEnabled = hasPaymentRequests(planTier);

  const summaryQuery = useGrantPaymentSummary(grantId, { enabled: paymentsEnabled });
  const requestsQuery = usePaymentRequests(
    { page: 1, pageSize: 20, grantId },
    { enabled: paymentsEnabled },
  );

  if (!paymentsEnabled) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm font-medium text-foreground">
            Grant payment requests require the {PAYMENT_REQUESTS_MIN_PLAN_LABEL} plan or higher.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Upgrade to {PAYMENT_REQUESTS_MIN_PLAN_LABEL} to track grant payment requests,
            reimbursements, and drawdowns.
          </p>
          <Link
            to="/settings"
            hash="billing"
            className="mt-3 inline-block text-sm font-medium text-primary hover:underline underline-offset-4"
          >
            View billing
          </Link>
        </CardContent>
      </Card>
    );
  }

  const summary = summaryQuery.data as GrantPaymentSummaryData | undefined;
  const requests = ((requestsQuery.data as { data?: GrantPaymentRequestRow[] } | undefined)?.data ??
    []) as GrantPaymentRequestRow[];

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      {summaryQuery.isLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total requested
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xl font-semibold">
              {formatCurrency(summary?.totalRequestedCents ?? 0)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total approved
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xl font-semibold">
              {formatCurrency(summary?.totalApprovedCents ?? 0)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total paid
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xl font-semibold">
              {formatCurrency(summary?.totalPaidCents ?? 0)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Outstanding
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xl font-semibold">
              {formatCurrency(summary?.outstandingCents ?? 0)}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Payment requests
        </h3>
        <Link
          to="/payments"
          search={{ grantId }}
          className="text-sm font-medium text-primary hover:underline underline-offset-4"
        >
          Create request
        </Link>
      </div>

      {/* Request list */}
      {requestsQuery.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
        </div>
      ) : requestsQuery.isError ? (
        <Alert variant="destructive" title="Unable to load payment requests.">
          <p>{requestsQuery.error instanceof Error ? requestsQuery.error.message : "Try again."}</p>
          <RetryButton query={requestsQuery} />
        </Alert>
      ) : requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No payment requests yet. Create one to answer what is ready to draw down.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Request #</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                  Requested
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {requests.map((req) => (
                <tr key={req.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      to="/payments/$requestId"
                      params={{ requestId: req.id }}
                      className="font-medium text-primary hover:underline underline-offset-4"
                    >
                      {req.requestNumber ?? req.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {req.type ? formatPaymentRequestType(req.type) : "--"}
                  </td>
                  <td className="px-4 py-3">
                    {req.status ? (
                      <Badge variant="outline">{formatPaymentRequestStatus(req.status)}</Badge>
                    ) : (
                      "--"
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {formatCurrency(req.requestedAmountCents)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {req.createdAt
                      ? new Intl.DateTimeFormat("en-US", {
                          timeZone: "UTC",
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        }).format(new Date(req.createdAt))
                      : "--"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function GrantBudgetTab({ grantId, planTier }: GrantBudgetTabProps) {
  const varianceQuery = useGrantBudgetVariance(grantId);
  const rows = varianceQuery.data?.rows ?? [];
  const plannedExpensesEnabled = planTier !== null && canUsePlannedExpenses(planTier);
  const aiExtractionEnabled = planTier !== null && canUseGrantBudgetAiExtraction(planTier);
  const amendmentsEnabled = planTier !== null && canUseGrantBudgetAmendments(planTier);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Budget-vs-actual</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Track the approved grant budget against expenses and committed spend.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" size="sm" className="rounded-full" asChild>
              <Link to="/grants/sentinel">Open Budget Sentinel</Link>
            </Button>
            <Badge variant="outline">Starter</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {varianceQuery.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full rounded" />
              <Skeleton className="h-8 w-full rounded" />
              <Skeleton className="h-8 w-full rounded" />
            </div>
          ) : varianceQuery.isError ? (
            <Alert variant="destructive" title="Unable to load budget variance." />
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Add budget lines to compare approved amounts, actual expenses, planned expenses, and
              remaining budget.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="py-2 pr-3 text-left font-medium">Category</th>
                    <th className="px-3 py-2 text-right font-medium">Approved</th>
                    <th className="px-3 py-2 text-right font-medium">Actual</th>
                    <th className="px-3 py-2 text-right font-medium">Planned</th>
                    <th className="px-3 py-2 text-right font-medium">Remaining</th>
                    <th className="py-2 pl-3 text-right font-medium">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row: GrantBudgetLineRollup) => (
                    <tr key={row.lineId} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{row.category}</td>
                      <td className="px-3 py-2 text-right">
                        {formatCurrency(row.approvedAmountCents)}
                      </td>
                      <td className="px-3 py-2 text-right">{formatCurrency(row.actualCents)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(row.plannedCents)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(row.remainingCents)}</td>
                      <td className="py-2 pl-3 text-right">{formatCurrency(row.varianceCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Planned expenses</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {plannedExpensesEnabled
              ? `${PLANNED_EXPENSES_MIN_PLAN_LABEL} plan is active. Planned expenses count toward your projected remaining budget.`
              : `${PLANNED_EXPENSES_MIN_PLAN_LABEL} adds planned expenses so you can forecast remaining budget before invoices post.`}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">AI intake</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {aiExtractionEnabled
              ? `${BUDGET_AI_EXTRACTION_MIN_PLAN_LABEL} plan is active. Budget documents can be extracted into reviewable line items.`
              : `${BUDGET_AI_EXTRACTION_MIN_PLAN_LABEL} unlocks document extraction for funder budget attachments.`}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Amendments</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {amendmentsEnabled
              ? `${BUDGET_AMENDMENTS_MIN_PLAN_LABEL} controls are active for approved budget amendments.`
              : `${BUDGET_AMENDMENTS_MIN_PLAN_LABEL} adds formal amendment history for approved budget changes.`}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function GrantDetailPage() {
  const { grantId } = Route.useParams();
  const navigate = useNavigate();
  const { memberRole, memberPermissions } = useSession();
  const canEdit = canAccessFeature(memberRole, memberPermissions, "grants", "edit");
  const canDelete = canAccessFeature(memberRole, memberPermissions, "grants", "manage");
  const grantQuery = useGrant(grantId);
  const grantMutations = useGrantUpdateMutations(grantId);
  const allocationMutations = useAllocationMutations(grantId);
  const expenseMutations = useExpenseMutations(grantId);
  const metricMutations = useImpactMetricMutations(grantId);
  const reportingMutations = useReportingRequirementMutations(grantId);
  const closeoutMutations = useCloseoutItemMutations(grantId);
  const fundsQuery = useFunds({ page: 1, pageSize: 100, sortBy: "name", sortOrder: "asc" });
  const funds = (fundsQuery.data?.data ?? []) as { id: string; name: string }[];
  const fundersQuery = useFunders({ page: 1, pageSize: 100, sortBy: "name", sortOrder: "asc" });
  const funders = (fundersQuery.data?.data ?? []) as { id: string; name: string }[];
  const grant = grantQuery.data as Record<string, unknown> | undefined;
  const spendDownQuery = useSpendDown(grantId);
  const spendDown = spendDownQuery.data;
  const generateSpendDownMutation = useGenerateSpendDownReport();
  const billingQuery = useOrgBilling();
  const planTier = billingQuery.data
    ? getEffectivePlanTier({
        planTier: billingQuery.data.planTier,
        subscriptionStatus: billingQuery.data.status,
        trialEndsAt: billingQuery.data.trialEndsAt,
      })
    : null;
  const spendDownDownloadsEnabled = planTier !== null && hasComplianceReportPack(planTier);
  const [spendDownReportSuccess, setSpendDownReportSuccess] = useState(false);
  const [spendDownReportError, setSpendDownReportError] = useState<string | null>(null);
  const loadedGrantStatus = (GRANT_STATUSES as readonly string[]).includes(String(grant?.status))
    ? (String(grant?.status) as GrantStatus)
    : "discovery";
  const [grantStatusDraft, setGrantStatusDraft] = useState<{
    dirty: boolean;
    grantId: string;
    value: string;
  }>({
    dirty: false,
    grantId,
    value: loadedGrantStatus,
  });
  React.useEffect(() => {
    setGrantStatusDraft((current) => {
      if (current.grantId !== grantId) {
        return { dirty: false, grantId, value: loadedGrantStatus };
      }
      if (current.dirty || current.value === loadedGrantStatus) {
        return current;
      }
      return { dirty: false, grantId, value: loadedGrantStatus };
    });
  }, [grantId, loadedGrantStatus]);
  const grantStatus = grantStatusDraft.value;
  const selectedGrantStatus = (GRANT_STATUSES as readonly string[]).includes(grantStatus)
    ? (grantStatus as GrantStatus)
    : "discovery";
  const loadedFunderId = (grant?.funder as { id: string } | null | undefined)?.id ?? "";
  const [funderDraft, setFunderDraft] = useState<{
    dirty: boolean;
    grantId: string;
    value: string;
  }>({
    dirty: false,
    grantId,
    value: loadedFunderId,
  });
  React.useEffect(() => {
    setFunderDraft((current) => {
      if (current.grantId !== grantId) {
        return { dirty: false, grantId, value: loadedFunderId };
      }
      if (current.dirty || current.value === loadedFunderId) {
        return current;
      }
      return { dirty: false, grantId, value: loadedFunderId };
    });
  }, [grantId, loadedFunderId]);
  const funderId = funderDraft.value;
  const selectedGrantStage = getGrantStageInfo(selectedGrantStatus);
  const [allocationFundId, setAllocationFundId] = useState("");
  const [reportType, setReportType] = useState("");

  const [shareOpen, setShareOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [allocationOpen, setAllocationOpen] = useState(false);
  const [editAllocationId, setEditAllocationId] = useState<string | null>(null);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [metricOpen, setMetricOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [closeoutOpen, setCloseoutOpen] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [deleteGrantError, setDeleteGrantError] = useState<string | null>(null);
  const [allocationError, setAllocationError] = useState<string | null>(null);
  const [editAllocationError, setEditAllocationError] = useState<string | null>(null);
  const [deleteAllocationError, setDeleteAllocationError] = useState<string | null>(null);
  const [expenseError, setExpenseError] = useState<string | null>(null);
  const [deleteExpenseError, setDeleteExpenseError] = useState<string | null>(null);
  const [metricError, setMetricError] = useState<string | null>(null);
  // Per-metric entry-form errors, keyed by metric id, so each metric's
  // "add entry" form surfaces its own inline validation message.
  const [entryErrors, setEntryErrors] = useState<Record<string, string | null>>({});
  const [deleteMetricError, setDeleteMetricError] = useState<string | null>(null);
  const [confirmDeleteEntryKey, setConfirmDeleteEntryKey] = useState<{
    metricId: string;
    entryId: string;
  } | null>(null);
  const [confirmDeleteAllocationId, setConfirmDeleteAllocationId] = useState<string | null>(null);
  const [confirmDeleteExpenseId, setConfirmDeleteExpenseId] = useState<string | null>(null);
  const [confirmDeleteMetricId, setConfirmDeleteMetricId] = useState<string | null>(null);
  const [confirmDeleteRequirementId, setConfirmDeleteRequirementId] = useState<string | null>(null);
  const [confirmDeleteCloseoutItemId, setConfirmDeleteCloseoutItemId] = useState<string | null>(
    null,
  );
  const [reportError, setReportError] = useState<string | null>(null);
  const [closeoutError, setCloseoutError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const previousTabRef = React.useRef("overview");

  function runGrantAction(action: () => Promise<unknown>) {
    setActionError(null);
    return action().catch((error) => {
      setActionError(error instanceof Error ? error.message : "Unable to complete this action.");
    });
  }

  if (grantQuery.isError && !grant) {
    return (
      <PageShell>
        <Alert variant="destructive" title="Unable to load grant.">
          {grantQuery.error instanceof Error && grantQuery.error.message.trim().length > 0
            ? grantQuery.error.message
            : "Refresh the page and try again."}
          <div className="mt-3">
            <RetryButton query={grantQuery} />
          </div>
        </Alert>
      </PageShell>
    );
  }

  if (grantQuery.isLoading || !grant) {
    return (
      <PageShell>
        <Skeleton className="h-8 w-64 mb-1" />
        <Skeleton className="h-4 w-32 mb-6" />
        <Skeleton className="h-10 w-full mb-6" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
        </div>
      </PageShell>
    );
  }

  const summary = (grant.summary ?? {}) as {
    allocatedTotalCents?: number;
    expenseTotalCents?: number;
    remainingBalanceCents?: number | null;
    unallocatedBalanceCents?: number | null;
    thresholdState?: string;
    burnRateCentsPerMonth?: number | null;
  };
  const allocations = (grant.fundAllocations ?? []) as Array<{
    id: string;
    fund?: { id: string; name?: string };
    allocatedAmountCents?: number;
  }>;
  const programAllocations = (grant.programAllocations ?? []) as GrantProgramAllocation[];
  const programAllocationsEnabled = planTier !== null && hasProgramAllocations(planTier);
  const expenses = (grant.expenses ?? []) as Array<{
    id: string;
    description?: string | null;
    amountCents?: number;
    date?: string;
    programAllocations?: ExpenseProgramAllocation[];
  }>;
  const metrics = (grant.impactMetrics ?? []) as Array<{
    id: string;
    name: string;
    unit?: string | null;
    actualValue?: number;
    targetValue?: string | null;
    entries?: Array<{
      id: string;
      value?: string | null;
      periodStart?: string;
      periodEnd?: string;
      notes?: string | null;
    }>;
  }>;
  const requirements = (grant.reportingRequirements ?? []) as Array<{
    id: string;
    reportType: string;
    dueDate: string;
    derivedStatus?: string;
  }>;
  const closeoutItems = (grant.closeoutItems ?? []) as Array<{
    id: string;
    label: string;
    completed: boolean;
    dueDate?: string | null;
    completedAt?: string | null;
    completedBy?: string | null;
    completedByUser?: { name?: string | null } | null;
  }>;

  return (
    <PageShell>
      {grantQuery.isError ? (
        <Alert variant="destructive" title="Grant data may be stale.">
          Unable to refresh the latest grant data, so you are seeing the last successful snapshot.
        </Alert>
      ) : null}

      {actionError ? (
        <Alert variant="destructive" title="Unable to complete the action">
          <p>{actionError}</p>
        </Alert>
      ) : null}

      <PageHeader
        variant="workbench"
        breadcrumb={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/grants">Grants</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{String(grant.name ?? "Grant")}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
        title={String(grant.name ?? "Grant")}
        description={
          [
            formatGrantStatusLabel(String(grant.status ?? "discovery")),
            grant.amountCents != null ? formatCurrency(grant.amountCents as number) : null,
            grant.startDate || grant.endDate
              ? [
                  grant.startDate ? formatIsoDateLabel(String(grant.startDate)) : null,
                  grant.endDate ? formatIsoDateLabel(String(grant.endDate)) : null,
                ]
                  .filter(Boolean)
                  .join(" to ")
              : null,
          ]
            .filter(Boolean)
            .join(" · ") || undefined
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {summary.thresholdState ? (
              <Badge variant="outline">{formatThresholdLabel(summary.thresholdState)}</Badge>
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={() => setShareOpen(true)}>
              Share
            </Button>
            {canDelete ? (
              <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogTrigger asChild>
                  <Button type="button" variant="outline" size="sm">
                    Delete grant
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete grant?</DialogTitle>
                    <DialogDescription>
                      Permanently remove this grant record from your organization.
                    </DialogDescription>
                  </DialogHeader>
                  <p>
                    Are you sure you want to delete{" "}
                    <strong>{String(grant?.name ?? "this grant")}</strong>? This action cannot be
                    undone.
                  </p>
                  {deleteGrantError ? (
                    <p role="alert" className="text-sm text-destructive">
                      {deleteGrantError}
                    </p>
                  ) : null}
                  <div className="flex justify-end gap-2 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setDeleteOpen(false);
                        setDeleteGrantError(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={grantMutations.deleteGrant.isPending}
                      onClick={async () => {
                        try {
                          await grantMutations.deleteGrant.mutateAsync();
                          void navigate({ to: "/grants" });
                        } catch (error) {
                          setDeleteGrantError(
                            error instanceof Error ? error.message : "Unable to delete grant.",
                          );
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            ) : null}
          </div>
        }
      />

      <GrantStageProgressStrip currentStatus={grantStatus as GrantStatus} />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Grant amount
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-foreground">
            {grant.amountCents != null ? (
              formatCurrency(grant.amountCents as number)
            ) : (
              <span className="text-base font-normal text-muted-foreground">Not set</span>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Allocated</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-foreground">
            {summary.allocatedTotalCents != null ? (
              formatCurrency(summary.allocatedTotalCents)
            ) : (
              <span className="text-base font-normal text-muted-foreground">No allocations</span>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Unallocated</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-foreground">
            {summary.unallocatedBalanceCents != null ? (
              formatCurrency(summary.unallocatedBalanceCents)
            ) : grant.amountCents != null && summary.allocatedTotalCents != null ? (
              formatCurrency((grant.amountCents as number) - summary.allocatedTotalCents)
            ) : (
              <span className="text-base font-normal text-muted-foreground">--</span>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Remaining to spend
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-foreground">
            {summary.remainingBalanceCents != null ? (
              formatCurrency(summary.remainingBalanceCents)
            ) : (
              <span className="text-base font-normal text-muted-foreground">--</span>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs
        defaultValue="overview"
        className="flex-col gap-4"
        onValueChange={(value) => {
          captureDetailTabViewed("grants", value, previousTabRef.current);
          previousTabRef.current = value;
        }}
      >
        <TabsList variant="record">
          <TabsTrigger className="shrink-0 rounded-full px-3" value="overview">
            Overview
          </TabsTrigger>
          <TabsTrigger className="shrink-0 rounded-full px-3" value="allocations">
            Allocations
          </TabsTrigger>
          <TabsTrigger className="shrink-0 rounded-full px-3" value="expenses">
            Expenses
          </TabsTrigger>
          <TabsTrigger className="shrink-0 rounded-full px-3" value="metrics">
            Impact Metrics
          </TabsTrigger>
          <TabsTrigger className="shrink-0 rounded-full px-3" value="reporting">
            Reporting
          </TabsTrigger>
          <TabsTrigger className="shrink-0 rounded-full px-3" value="payments">
            Payments
          </TabsTrigger>
          <TabsTrigger className="shrink-0 rounded-full px-3" value="closeout">
            Closeout
          </TabsTrigger>
          <TabsTrigger className="shrink-0 rounded-full px-3" value="spend-down">
            Spend-Down
          </TabsTrigger>
          <TabsTrigger className="shrink-0 rounded-full px-3" value="budget">
            Budget
          </TabsTrigger>
          <TabsTrigger className="shrink-0 rounded-full px-3" value="restrictions">
            Restrictions
          </TabsTrigger>
          <TabsTrigger className="shrink-0 rounded-full px-3" value="subrecipients">
            Subrecipients
          </TabsTrigger>
          <TabsTrigger className="shrink-0 rounded-full px-3" value="custom-fields">
            Custom Fields
          </TabsTrigger>
          <TabsTrigger className="shrink-0 rounded-full px-3" value="activity">
            Activity
          </TabsTrigger>
          <TabsTrigger className="shrink-0 rounded-full px-3" value="documents">
            Documents
          </TabsTrigger>
        </TabsList>

        <TabsContent className="w-full" value="overview">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_272px]">
            <div className="space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Grant details</CardTitle>
                </CardHeader>
                <CardContent>
                  <form
                    className="space-y-4"
                    onChange={() => {
                      if (overviewError) setOverviewError(null);
                    }}
                    onSubmit={async (event) => {
                      event.preventDefault();
                      if (!canEdit) {
                        return;
                      }
                      const form = new FormData(event.currentTarget);
                      const amountRaw = trimmedText(form.get("amountDollars"));
                      const amountDollars = amountRaw.length === 0 ? null : Number(amountRaw);
                      const rawStatus = grantStatus;
                      const rawName = trimmedText(form.get("grantName"));
                      const startDateValue = normalizeDateInput(trimmedText(form.get("startDate")));
                      const endDateValue = normalizeDateInput(trimmedText(form.get("endDate")));
                      // Guard the date order on the client so the user sees a
                      // plain-language message inline. The shared schema enforces
                      // the same rule server-side, but a zValidator rejection only
                      // surfaces as a generic "Request failed", which would leave
                      // the user guessing why the save was blocked.
                      if (
                        startDateValue &&
                        endDateValue &&
                        new Date(startDateValue) > new Date(endDateValue)
                      ) {
                        setOverviewError("End date must be on or after the start date.");
                        return;
                      }
                      try {
                        await grantMutations.updateGrant.mutateAsync({
                          name: rawName.length > 0 ? rawName : undefined,
                          funderId: funderId.length > 0 ? funderId : undefined,
                          description: nullableText(trimmedText(form.get("description"))),
                          notes: nullableText(trimmedText(form.get("notes"))),
                          status: (GRANT_STATUSES as readonly string[]).includes(rawStatus)
                            ? (rawStatus as GrantStatus)
                            : undefined,
                          amountCents:
                            amountDollars != null &&
                            Number.isFinite(amountDollars) &&
                            amountDollars >= 0
                              ? Math.round(amountDollars * 100)
                              : null,
                          applicationDeadline: normalizeDateInput(
                            trimmedText(form.get("applicationDeadline")),
                          ),
                          startDate: startDateValue,
                          endDate: endDateValue,
                        });
                        setOverviewError(null);
                        setGrantStatusDraft((current) =>
                          current.grantId === grantId ? { ...current, dirty: false } : current,
                        );
                        setFunderDraft((current) =>
                          current.grantId === grantId ? { ...current, dirty: false } : current,
                        );
                      } catch (error) {
                        setOverviewError(
                          error instanceof Error ? error.message : "Unable to save grant details.",
                        );
                      }
                    }}
                  >
                    <div className="space-y-1">
                      <Label htmlFor="grant-name">Grant name</Label>
                      <Input
                        id="grant-name"
                        name="grantName"
                        placeholder="Grant name"
                        defaultValue={String(grant.name ?? "")}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="grant-funder">Funder</Label>
                      <Select
                        value={funderId}
                        onValueChange={(value) => {
                          if (!value) return;
                          setFunderDraft({ dirty: true, grantId, value });
                        }}
                      >
                        <SelectTrigger id="grant-funder">
                          <SelectValue placeholder="Select funder" />
                        </SelectTrigger>
                        <SelectContent>
                          {funders.map((funder) => (
                            <SelectItem key={funder.id} value={funder.id}>
                              {funder.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="grant-description">Description</Label>
                      <Textarea
                        id="grant-description"
                        name="description"
                        placeholder="Describe what this grant funds and its goals…"
                        defaultValue={String(grant.description ?? "")}
                        rows={3}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="grant-notes">Notes</Label>
                      <Textarea
                        id="grant-notes"
                        name="notes"
                        placeholder="Internal notes, contacts, context…"
                        defaultValue={String(grant.notes ?? "")}
                        rows={2}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="grant-status">Pipeline status</Label>
                      <Select
                        value={grantStatus}
                        onValueChange={(value) => {
                          if (!value) return;
                          setGrantStatusDraft({ dirty: true, grantId, value });
                        }}
                      >
                        <SelectTrigger id="grant-status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {GRANT_STAGE_DETAILS.map((stage) => (
                            <SelectItem key={stage.status} value={stage.status}>
                              {stage.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                        <p className="text-sm leading-5 text-muted-foreground">
                          {selectedGrantStage.meaning}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {selectedGrantStage.nextAction}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="grant-amount">Grant amount (USD)</Label>
                      <Input
                        id="grant-amount"
                        name="amountDollars"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="e.g. 50000"
                        defaultValue={
                          grant.amountCents != null ? String(Number(grant.amountCents) / 100) : ""
                        }
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-1">
                        <Label htmlFor="grant-deadline">Application deadline</Label>
                        <Input
                          id="grant-deadline"
                          name="applicationDeadline"
                          type="date"
                          defaultValue={
                            grant.applicationDeadline
                              ? String(grant.applicationDeadline).slice(0, 10)
                              : ""
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="grant-start">Start date</Label>
                        <Input
                          id="grant-start"
                          name="startDate"
                          type="date"
                          defaultValue={grant.startDate ? String(grant.startDate).slice(0, 10) : ""}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="grant-end">End date</Label>
                        <Input
                          id="grant-end"
                          name="endDate"
                          type="date"
                          defaultValue={grant.endDate ? String(grant.endDate).slice(0, 10) : ""}
                        />
                      </div>
                    </div>
                    {summary.burnRateCentsPerMonth != null && (
                      <p className="text-sm text-muted-foreground">
                        Burn rate:{" "}
                        <span className="font-medium text-foreground">
                          {formatCurrency(summary.burnRateCentsPerMonth)}/mo
                        </span>
                      </p>
                    )}
                    {overviewError ? (
                      <p role="alert" className="text-sm text-destructive">
                        {overviewError}
                      </p>
                    ) : null}
                    {canEdit ? (
                      <div className="flex gap-2 pt-1">
                        <Button type="submit">Save changes</Button>
                      </div>
                    ) : null}
                  </form>
                </CardContent>
              </Card>
            </div>
            <LinkedContextPanel
              grant={{
                startDate: grant.startDate as string | null | undefined,
                endDate: grant.endDate as string | null | undefined,
                applicationDeadline: grant.applicationDeadline as string | null | undefined,
                funder: (grant.funder as { id: string; name: string } | null | undefined) ?? null,
                description: grant.description as string | null | undefined,
              }}
              allocations={allocations}
            />
          </div>
        </TabsContent>

        <TabsContent className="w-full" value="allocations">
          <div className="space-y-4">
            {canEdit ? (
              <Dialog
                open={allocationOpen}
                onOpenChange={(nextOpen) => {
                  setAllocationOpen(nextOpen);
                  if (nextOpen) {
                    setAllocationError(null);
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button>Add allocation</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add allocation</DialogTitle>
                    <DialogDescription>
                      Document which fund is supporting this grant and how much has been committed.
                    </DialogDescription>
                  </DialogHeader>
                  <form
                    className="space-y-4"
                    onChange={() => {
                      if (allocationError) {
                        setAllocationError(null);
                      }
                    }}
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      const fundId = allocationFundId;
                      const amountRaw = parseFloat(trimmedText(form.get("amountDollars")));
                      const allocatedAmountCents = Number.isFinite(amountRaw)
                        ? Math.round(amountRaw * 100)
                        : 0;
                      if (fundId.length === 0 || allocatedAmountCents <= 0) {
                        setAllocationError("Fund and a positive amount are required.");
                        return;
                      }

                      try {
                        await allocationMutations.createAllocation.mutateAsync({
                          fundId,
                          allocatedAmountCents,
                        });
                        setAllocationError(null);
                        setAllocationFundId("");
                        setAllocationOpen(false);
                      } catch (error) {
                        setAllocationError(
                          error instanceof Error ? error.message : "Unable to save allocation.",
                        );
                      }
                    }}
                  >
                    <div className="space-y-1">
                      <Label htmlFor="alloc-fund">Fund</Label>
                      <Select value={allocationFundId} onValueChange={setAllocationFundId}>
                        <SelectTrigger id="alloc-fund">
                          <SelectValue placeholder="Select fund" />
                        </SelectTrigger>
                        <SelectContent>
                          {funds.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="alloc-amount">Amount (USD)</Label>
                      <Input
                        id="alloc-amount"
                        name="amountDollars"
                        placeholder="0.00"
                        type="number"
                        min="0.01"
                        step="0.01"
                      />
                    </div>
                    {allocationError ? (
                      <p role="alert" className="text-sm text-destructive">
                        {allocationError}
                      </p>
                    ) : null}
                    <Button className="w-full" type="submit">
                      Save allocation
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            ) : null}
            {/* Edit allocation dialog */}
            {editAllocationId !== null && (
              <Dialog
                open={editAllocationId !== null}
                onOpenChange={(nextOpen) => {
                  if (!nextOpen) {
                    setEditAllocationId(null);
                    setEditAllocationError(null);
                  }
                }}
              >
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit allocation</DialogTitle>
                    <DialogDescription>
                      Update the amount committed from this fund to the grant.
                    </DialogDescription>
                  </DialogHeader>
                  <form
                    className="space-y-4"
                    onChange={() => {
                      if (editAllocationError) setEditAllocationError(null);
                    }}
                    onSubmit={async (event) => {
                      event.preventDefault();
                      if (!canEdit) {
                        return;
                      }
                      const form = new FormData(event.currentTarget);
                      const amountRaw = parseFloat(trimmedText(form.get("amountDollars")));
                      const allocatedAmountCents = Number.isFinite(amountRaw)
                        ? Math.round(amountRaw * 100)
                        : 0;
                      if (allocatedAmountCents <= 0) {
                        setEditAllocationError("Amount must be greater than zero.");
                        return;
                      }
                      try {
                        await allocationMutations.updateAllocation.mutateAsync({
                          allocationId: editAllocationId,
                          data: { allocatedAmountCents },
                        });
                        setEditAllocationId(null);
                        setEditAllocationError(null);
                      } catch (error) {
                        setEditAllocationError(
                          error instanceof Error ? error.message : "Unable to update allocation.",
                        );
                      }
                    }}
                  >
                    <div className="space-y-1">
                      <Label htmlFor="edit-alloc-amount">Amount (USD)</Label>
                      <Input
                        id="edit-alloc-amount"
                        name="amountDollars"
                        placeholder="0.00"
                        type="number"
                        min="0.01"
                        step="0.01"
                        defaultValue={(() => {
                          const cents = allocations.find(
                            (a) => a.id === editAllocationId,
                          )?.allocatedAmountCents;
                          return cents != null ? String(cents / 100) : "";
                        })()}
                      />
                    </div>
                    {editAllocationError ? (
                      <p role="alert" className="text-sm text-destructive">
                        {editAllocationError}
                      </p>
                    ) : null}
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setEditAllocationId(null);
                          setEditAllocationError(null);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button className="flex-1" type="submit">
                        Save changes
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            )}
            {deleteAllocationError ? (
              <p role="alert" className="text-sm text-destructive">
                {deleteAllocationError}
              </p>
            ) : null}
            {allocations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No fund allocations yet. Add an allocation to track how much a fund is committing to
                this grant.
              </p>
            ) : (
              <div className="space-y-2">
                {allocations.map((allocation) => (
                  <Card key={allocation.id}>
                    <CardContent className="flex items-center justify-between p-4 text-sm">
                      <span>{allocation.fund?.name ?? "Fund allocation"}</span>
                      <div className="flex items-center gap-3">
                        <span>{formatCurrency(allocation.allocatedAmountCents)}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditAllocationId(allocation.id);
                            setEditAllocationError(null);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          aria-label="Delete allocation"
                          disabled={allocationMutations.deleteAllocation.isPending}
                          onClick={() => {
                            if (!canEdit) {
                              return;
                            }
                            setConfirmDeleteAllocationId(allocation.id);
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            {programAllocationsEnabled ? (
              <GrantProgramAllocationsEditor
                grantId={grantId}
                canEdit={canEdit}
                currentAllocations={programAllocations}
              />
            ) : null}
          </div>
        </TabsContent>

        <TabsContent className="w-full" value="expenses">
          <div className="space-y-4">
            {canEdit ? (
              <Dialog
                open={expenseOpen}
                onOpenChange={(nextOpen) => {
                  setExpenseOpen(nextOpen);
                  if (nextOpen) {
                    setExpenseError(null);
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button>Add expense</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add expense</DialogTitle>
                    <DialogDescription>
                      Capture grant spending so burn rate and remaining balance stay accurate.
                    </DialogDescription>
                  </DialogHeader>
                  <form
                    className="space-y-4"
                    onChange={() => {
                      if (expenseError) {
                        setExpenseError(null);
                      }
                    }}
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      const amountRaw = parseFloat(trimmedText(form.get("amountDollars")));
                      const amountCents = Number.isFinite(amountRaw)
                        ? Math.round(amountRaw * 100)
                        : 0;
                      const date = normalizeDateInput(trimmedText(form.get("date")));
                      const description = trimmedText(form.get("description"));
                      if (amountCents <= 0 || !date) {
                        setExpenseError("Expense amount and date are required.");
                        return;
                      }

                      try {
                        await expenseMutations.createExpense.mutateAsync({
                          amountCents: amountCents,
                          date,
                          ...(description.length > 0 ? { description } : {}),
                        });
                        setExpenseError(null);
                        setExpenseOpen(false);
                      } catch (error) {
                        setExpenseError(
                          error instanceof Error ? error.message : "Unable to save expense.",
                        );
                      }
                    }}
                  >
                    <div className="space-y-1">
                      <Label htmlFor="exp-amount">Amount (USD)</Label>
                      <Input
                        id="exp-amount"
                        name="amountDollars"
                        placeholder="0.00"
                        type="number"
                        min="0.01"
                        step="0.01"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="exp-date">Date</Label>
                      <Input id="exp-date" name="date" type="date" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="exp-desc">Description</Label>
                      <Input
                        id="exp-desc"
                        name="description"
                        placeholder="What was this expense for?"
                      />
                    </div>
                    {expenseError ? (
                      <p role="alert" className="text-sm text-destructive">
                        {expenseError}
                      </p>
                    ) : null}
                    <Button className="w-full" type="submit">
                      Save expense
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            ) : null}
            {deleteExpenseError ? (
              <p role="alert" className="text-sm text-destructive">
                {deleteExpenseError}
              </p>
            ) : null}
            {expenses.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No expenses recorded yet. Log spending to keep the burn rate and remaining balance
                accurate.
              </p>
            ) : (
              <div className="space-y-2">
                {expenses.map((expense) => (
                  <Card key={expense.id}>
                    <CardContent className="space-y-3 p-4 text-sm">
                      <div className="flex items-center justify-between">
                        <span>{expense.description ?? "Expense"}</span>
                        <div className="flex items-center gap-3">
                          <span>{formatCurrency(expense.amountCents)}</span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            aria-label="Delete expense"
                            onClick={() => {
                              if (!canEdit) {
                                return;
                              }
                              setConfirmDeleteExpenseId(expense.id);
                            }}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                      {programAllocationsEnabled ? (
                        <div className="space-y-2 border-t pt-3">
                          <p className="text-xs font-medium text-muted-foreground">
                            Program allocations
                          </p>
                          <ExpenseProgramAllocationsEditor
                            expenseId={expense.id}
                            grantId={grantId}
                            canEdit={canEdit}
                            currentAllocations={expense.programAllocations ?? []}
                          />
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent className="w-full" value="metrics">
          <div className="space-y-4">
            {canEdit ? (
              <Dialog
                open={metricOpen}
                onOpenChange={(nextOpen) => {
                  setMetricOpen(nextOpen);
                  if (nextOpen) {
                    setMetricError(null);
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button>Add metric</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add impact metric</DialogTitle>
                    <DialogDescription>
                      Define the outcomes this grant is funding so progress can be measured over
                      time.
                    </DialogDescription>
                  </DialogHeader>
                  <form
                    className="space-y-4"
                    onChange={() => {
                      if (metricError) {
                        setMetricError(null);
                      }
                    }}
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      const name = trimmedText(form.get("name"));
                      const unit = trimmedText(form.get("unit"));
                      if (name.length === 0) {
                        setMetricError("Metric name is required.");
                        return;
                      }

                      try {
                        await metricMutations.createMetric.mutateAsync({
                          name,
                          ...(unit.length > 0 ? { unit } : {}),
                        });
                        setMetricError(null);
                        setMetricOpen(false);
                      } catch (error) {
                        setMetricError(
                          error instanceof Error ? error.message : "Unable to save metric.",
                        );
                      }
                    }}
                  >
                    <div className="space-y-1">
                      <Label htmlFor="metric-name">Metric name</Label>
                      <Input id="metric-name" name="name" placeholder="Metric name" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="metric-unit">Unit</Label>
                      <Input id="metric-unit" name="unit" placeholder="Unit" />
                    </div>
                    {metricError ? (
                      <p role="alert" className="text-sm text-destructive">
                        {metricError}
                      </p>
                    ) : null}
                    <Button className="w-full" type="submit">
                      Save metric
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            ) : null}
            {deleteMetricError ? (
              <p role="alert" className="text-sm text-destructive">
                {deleteMetricError}
              </p>
            ) : null}
            {metrics.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No impact metrics defined yet. Add a metric to track outcomes funded by this grant.
              </p>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2">
              {metrics.map((metric) => (
                <Card key={metric.id}>
                  <CardHeader className="flex flex-row items-start justify-between gap-2">
                    <CardTitle>{metric.name}</CardTitle>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (!canEdit) {
                          return;
                        }
                        setConfirmDeleteMetricId(metric.id);
                      }}
                    >
                      Delete metric
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm text-muted-foreground">
                    <p>
                      Actual: {metric.actualValue ?? "--"} {metric.unit ?? ""}
                    </p>
                    <p>
                      Target: {metric.targetValue ?? "--"} {metric.unit ?? ""}
                    </p>
                    <form
                      className="space-y-2"
                      onSubmit={async (event) => {
                        event.preventDefault();
                        if (!canEdit) {
                          return;
                        }
                        const form = new FormData(event.currentTarget);
                        const value = trimmedText(form.get("value"));
                        const periodStart = normalizeDateInput(
                          trimmedText(form.get("periodStart")),
                        );
                        const periodEnd = normalizeDateInput(trimmedText(form.get("periodEnd")));
                        const notes = trimmedText(form.get("notes"));
                        if (value.length === 0 || !periodStart || !periodEnd) {
                          return;
                        }
                        // Guard the period order on the client so the user sees a
                        // plain-language message inline. The shared schema enforces
                        // the same rule server-side, but a zValidator rejection only
                        // surfaces as a generic "Request failed".
                        if (new Date(periodStart) > new Date(periodEnd)) {
                          setEntryErrors((prev) => ({
                            ...prev,
                            [metric.id]: "End date must be on or after the start date.",
                          }));
                          return;
                        }
                        setEntryErrors((prev) => ({ ...prev, [metric.id]: null }));

                        try {
                          await metricMutations.createEntry.mutateAsync({
                            metricId: metric.id,
                            data: {
                              value,
                              periodStart,
                              periodEnd,
                              ...(notes.length > 0 ? { notes } : {}),
                            },
                          });
                        } catch (error) {
                          setEntryErrors((prev) => ({
                            ...prev,
                            [metric.id]:
                              error instanceof Error ? error.message : "Unable to save entry.",
                          }));
                        }
                      }}
                    >
                      <div className="space-y-1">
                        <Label htmlFor={`metric-val-${metric.id}`}>Value</Label>
                        <Input id={`metric-val-${metric.id}`} name="value" placeholder="e.g. 42" />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`metric-start-${metric.id}`}>Period start</Label>
                        <Input id={`metric-start-${metric.id}`} name="periodStart" type="date" />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`metric-end-${metric.id}`}>Period end</Label>
                        <Input id={`metric-end-${metric.id}`} name="periodEnd" type="date" />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`metric-notes-${metric.id}`}>Notes</Label>
                        <Input
                          id={`metric-notes-${metric.id}`}
                          name="notes"
                          placeholder="Optional notes"
                        />
                      </div>
                      {entryErrors[metric.id] ? (
                        <p className="text-xs text-destructive" role="alert">
                          {entryErrors[metric.id]}
                        </p>
                      ) : null}
                      <Button type="submit">Save entry</Button>
                    </form>
                    <div className="space-y-1">
                      {(metric.entries ?? []).map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-start justify-between gap-2 rounded-lg border px-3 py-2 text-xs"
                        >
                          <div>
                            <p>
                              {entry.value ?? "--"} from{" "}
                              {entry.periodStart ? formatUtcCalendarDate(entry.periodStart) : "--"}{" "}
                              to {entry.periodEnd ? formatUtcCalendarDate(entry.periodEnd) : "--"}
                            </p>
                            <p>{entry.notes ?? "No notes"}</p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="shrink-0 text-xs"
                            aria-label="Delete entry"
                            disabled={!canEdit || metricMutations.deleteEntry.isPending}
                            onClick={() => {
                              if (!canEdit) return;
                              setConfirmDeleteEntryKey({
                                metricId: metric.id,
                                entryId: entry.id,
                              });
                            }}
                          >
                            Delete
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent className="w-full" value="reporting">
          <div className="space-y-4">
            {canEdit ? (
              <Dialog
                open={reportOpen}
                onOpenChange={(nextOpen) => {
                  setReportOpen(nextOpen);
                  if (nextOpen) {
                    setReportError(null);
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button>Add reporting requirement</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add reporting requirement</DialogTitle>
                    <DialogDescription>
                      Track upcoming deliverables and the cadence required by this funder.
                    </DialogDescription>
                  </DialogHeader>
                  <form
                    className="space-y-4"
                    onChange={() => {
                      if (reportError) {
                        setReportError(null);
                      }
                    }}
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      const selectedReportType = reportType;
                      const dueDate = normalizeDateInput(trimmedText(form.get("dueDate")));
                      if (selectedReportType.length === 0 || !dueDate) {
                        setReportError("Report type and due date are required.");
                        return;
                      }

                      try {
                        await reportingMutations.createRequirement.mutateAsync({
                          reportType:
                            selectedReportType as CreateReportingRequirementInput["reportType"],
                          dueDate,
                        });
                        setReportError(null);
                        setReportType("");
                        setReportOpen(false);
                      } catch (error) {
                        setReportError(
                          error instanceof Error ? error.message : "Unable to save requirement.",
                        );
                      }
                    }}
                  >
                    <div className="space-y-1">
                      <Label htmlFor="req-type">Report type</Label>
                      <Select value={reportType} onValueChange={setReportType}>
                        <SelectTrigger id="req-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          {REPORT_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {REPORT_TYPE_LABELS[type]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="req-due">Due date</Label>
                      <Input id="req-due" name="dueDate" type="date" />
                    </div>
                    {reportError ? (
                      <p role="alert" className="text-sm text-destructive">
                        {reportError}
                      </p>
                    ) : null}
                    <Button className="w-full" type="submit">
                      Save requirement
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            ) : null}
            {requirements.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No reporting requirements added yet. Add one to track deliverables owed to this
                funder.
              </p>
            ) : null}
            <div className="space-y-2">
              {requirements.map((requirement) => (
                <Card key={requirement.id}>
                  <CardContent className="flex items-center justify-between gap-3 p-4 text-sm">
                    <div>
                      <span>{humanizeEnum(requirement.reportType)}</span>
                      <p className="text-xs text-muted-foreground">
                        Due {formatIsoDateLabel(requirement.dueDate)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {humanizeEnum(requirement.derivedStatus ?? "upcoming")}
                      </Badge>
                      {requirement.derivedStatus !== "submitted" ? (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            if (!canEdit) {
                              return;
                            }
                            void runGrantAction(() =>
                              reportingMutations.updateRequirement.mutateAsync({
                                requirementId: requirement.id,
                                data: { status: "submitted" },
                              }),
                            );
                          }}
                        >
                          Mark submitted
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (!canEdit) {
                            return;
                          }
                          setConfirmDeleteRequirementId(requirement.id);
                        }}
                      >
                        Delete requirement
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent className="w-full" value="payments">
          <PaymentsGrantTab grantId={grantId} planTier={planTier} />
        </TabsContent>

        <TabsContent className="w-full" value="closeout">
          <div className="space-y-4">
            {canEdit ? (
              <Dialog
                open={closeoutOpen}
                onOpenChange={(nextOpen) => {
                  setCloseoutOpen(nextOpen);
                  if (nextOpen) {
                    setCloseoutError(null);
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button>Add closeout item</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add closeout item</DialogTitle>
                    <DialogDescription>
                      List the wrap-up tasks that must be completed before this grant is fully
                      closed.
                    </DialogDescription>
                  </DialogHeader>
                  <form
                    className="space-y-4"
                    onChange={() => {
                      if (closeoutError) {
                        setCloseoutError(null);
                      }
                    }}
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      const label = trimmedText(form.get("label"));
                      const dueDate = normalizeDateInput(trimmedText(form.get("dueDate")));
                      if (label.length === 0) {
                        setCloseoutError("Checklist item label is required.");
                        return;
                      }

                      try {
                        await closeoutMutations.createItem.mutateAsync({
                          label,
                          dueDate,
                        });
                        setCloseoutError(null);
                        setCloseoutOpen(false);
                      } catch (error) {
                        setCloseoutError(
                          error instanceof Error ? error.message : "Unable to save checklist item.",
                        );
                      }
                    }}
                  >
                    <div className="space-y-1">
                      <Label htmlFor="closeout-label">Item</Label>
                      <Input
                        id="closeout-label"
                        name="label"
                        placeholder="e.g. Submit final financial report"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="closeout-due">Due date (optional)</Label>
                      <Input id="closeout-due" name="dueDate" type="date" />
                    </div>
                    {closeoutError ? (
                      <p role="alert" className="text-sm text-destructive">
                        {closeoutError}
                      </p>
                    ) : null}
                    <Button className="w-full" type="submit">
                      Save item
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            ) : null}
            {closeoutItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No closeout tasks yet. Add items to track the wrap-up steps required before this
                grant is fully closed.
              </p>
            ) : null}
            <div className="space-y-2">
              {closeoutItems.map((item) => (
                <Card key={item.id}>
                  <CardContent className="flex items-center justify-between gap-3 p-4 text-sm">
                    <div className="space-y-2">
                      <div>
                        <span>{item.label}</span>
                        <p className="text-xs text-muted-foreground">
                          {item.dueDate ? `Due ${formatIsoDateLabel(item.dueDate)}` : "No due date"}
                        </p>
                        {item.completed && item.completedAt ? (
                          <p className="text-xs text-muted-foreground">
                            Completed {formatIsoDateLabel(item.completedAt)}
                            {item.completedByUser?.name ? ` by ${item.completedByUser.name}` : ""}
                          </p>
                        ) : null}
                      </div>
                      <form
                        className="flex items-center gap-2"
                        onSubmit={async (event) => {
                          event.preventDefault();
                          if (!canEdit) {
                            return;
                          }
                          const form = new FormData(event.currentTarget);
                          const dueDate = normalizeDateInput(trimmedText(form.get("dueDate")));
                          void runGrantAction(() =>
                            closeoutMutations.updateItem.mutateAsync({
                              itemId: item.id,
                              data: { dueDate },
                            }),
                          );
                        }}
                      >
                        <Input
                          name="dueDate"
                          aria-label={`Due date for ${item.label}`}
                          defaultValue={item.dueDate ? String(item.dueDate).slice(0, 10) : ""}
                          type="date"
                        />
                        <Button type="submit" size="sm" variant="outline">
                          Save due date
                        </Button>
                      </form>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{item.completed ? "Done" : "Open"}</Badge>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          if (!canEdit) {
                            return;
                          }
                          void runGrantAction(() =>
                            closeoutMutations.updateItem.mutateAsync({
                              itemId: item.id,
                              data: { completed: !item.completed },
                            }),
                          );
                        }}
                      >
                        {item.completed ? "Reopen" : "Mark complete"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (!canEdit) {
                            return;
                          }
                          setConfirmDeleteCloseoutItemId(item.id);
                        }}
                      >
                        Delete item
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent className="w-full" value="spend-down" data-testid="tab-content-spend-down">
          <div className="space-y-6">
            {spendDownQuery.isPending ? (
              <div className="space-y-6" data-testid="spend-down-loading">
                <div className="grid gap-4 md:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Card key={`spend-down-stat-skeleton-${index}`}>
                      <CardHeader>
                        <Skeleton className="h-4 w-20" />
                      </CardHeader>
                      <CardContent>
                        <Skeleton className="h-7 w-28" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
                {Array.from({ length: 2 }).map((_, cardIndex) => (
                  <Card key={`spend-down-section-skeleton-${cardIndex}`}>
                    <CardHeader>
                      <Skeleton className="h-5 w-32" />
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {Array.from({ length: 3 }).map((_, rowIndex) => (
                        <Skeleton
                          key={`spend-down-row-skeleton-${cardIndex}-${rowIndex}`}
                          className="h-4 w-3/4"
                        />
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : spendDownQuery.isError ? (
              <Alert variant="destructive" title="Unable to load spend-down data." />
            ) : spendDown ? (
              <>
                <div className="grid gap-4 md:grid-cols-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Budget
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-2xl font-semibold">
                      {spendDown.budgetCents != null ? formatCurrency(spendDown.budgetCents) : "--"}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Spent
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-2xl font-semibold">
                      {formatCurrency(spendDown.expensesCents)}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Remaining
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-2xl font-semibold">
                      {spendDown.remainingCents != null
                        ? formatCurrency(spendDown.remainingCents)
                        : "--"}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Burn rate
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-2xl font-semibold">
                      {spendDown.burnRateCentsPerMonth != null
                        ? `${formatCurrency(spendDown.burnRateCentsPerMonth)}/mo`
                        : "--"}
                    </CardContent>
                  </Card>
                </div>

                {spendDown.thresholdState && (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {formatThresholdLabel(spendDown.thresholdState)}
                    </Badge>
                  </div>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle>By category</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {spendDown.byCategory.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No expenses recorded.</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr>
                            <th className="text-left font-medium">Category</th>
                            <th className="text-right font-medium">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {spendDown.byCategory.map((row) => (
                            <tr key={row.category}>
                              <td className="py-1">{row.category}</td>
                              <td className="py-1 text-right">{formatCurrency(row.amountCents)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>By fund</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {spendDown.byFund.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No fund allocations.</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr>
                            <th className="text-left font-medium">Fund</th>
                            <th className="text-right font-medium">Allocated</th>
                            <th className="text-right font-medium">Spent</th>
                          </tr>
                        </thead>
                        <tbody>
                          {spendDown.byFund.map((row) => (
                            <tr key={row.fundId}>
                              <td className="py-1">{row.fundName}</td>
                              <td className="py-1 text-right">
                                {formatCurrency(row.allocatedAmountCents)}
                              </td>
                              <td className="py-1 text-right">
                                {formatCurrency(row.expensesCents)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>By month</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {spendDown.byMonth.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No expenses recorded.</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr>
                            <th className="text-left font-medium">Month</th>
                            <th className="text-right font-medium">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {spendDown.byMonth.map((row) => (
                            <tr key={row.month}>
                              <td className="py-1">{formatYearMonthLabel(row.month)}</td>
                              <td className="py-1 text-right">{formatCurrency(row.amountCents)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </CardContent>
                </Card>

                <div className="flex items-center gap-4">
                  <Button
                    type="button"
                    onClick={() => {
                      setSpendDownReportSuccess(false);
                      setSpendDownReportError(null);
                      void generateSpendDownMutation
                        .mutateAsync({ grantId })
                        .then(() => setSpendDownReportSuccess(true))
                        .catch((error: unknown) =>
                          setSpendDownReportError(
                            error instanceof Error
                              ? error.message
                              : "Unable to generate the spend-down report.",
                          ),
                        );
                    }}
                    disabled={!spendDownDownloadsEnabled || generateSpendDownMutation.isPending}
                  >
                    {generateSpendDownMutation.isPending
                      ? "Generating…"
                      : "Download spend-down report"}
                  </Button>
                </div>
                {!spendDownDownloadsEnabled ? (
                  <StatusPanel variant="empty">
                    {COMPLIANCE_REPORT_PACK_MIN_PLAN_LABEL} plan required to download spend-down
                    reports. Available on {COMPLIANCE_REPORT_PACK_PLAN_LIST}.{" "}
                    <Link
                      to="/settings"
                      hash="billing"
                      className="font-medium text-primary hover:underline underline-offset-4"
                    >
                      Go to Billing to upgrade.
                    </Link>
                  </StatusPanel>
                ) : null}
                {spendDownReportError ? (
                  <StatusPanel variant="error">{spendDownReportError}</StatusPanel>
                ) : null}
                {spendDownReportSuccess && (
                  <Alert title="Spend-down report generated.">
                    <p className="text-sm">
                      Download it from the{" "}
                      <Link to="/reports" className="font-medium text-primary underline">
                        Reports page
                      </Link>
                      .
                    </p>
                  </Alert>
                )}
                {generateSpendDownMutation.isError && (
                  <Alert variant="destructive" title="Unable to generate report." />
                )}
              </>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent className="w-full" value="budget">
          <GrantBudgetTab grantId={grantId} planTier={planTier} />
        </TabsContent>

        <TabsContent className="w-full" value="restrictions">
          <RestrictionLifecyclePanel grantId={grantId} />
        </TabsContent>

        <TabsContent className="w-full" value="subrecipients">
          <GrantSubrecipientsTab grantId={grantId} planTier={planTier} />
        </TabsContent>

        <TabsContent className="w-full" value="custom-fields">
          <EntityCustomFieldsSection entityType="grant" entityId={grantId} canEdit={canEdit} />
        </TabsContent>

        <TabsContent className="w-full" value="activity">
          <EntityActivitySection entityType="grant" entityId={grantId} />
        </TabsContent>

        <TabsContent className="w-full" value="documents">
          <EntityDocumentsSection
            entityType="grant"
            entityId={grantId}
            renderDocumentActions={(document) => (
              <AwardIntakeDocumentAction documentId={document.id} />
            )}
          />
        </TabsContent>
      </Tabs>

      <QuickShareSheet
        open={shareOpen}
        onOpenChange={setShareOpen}
        scopeType="grant"
        scopeId={grantId}
        entityName={String(grant.name ?? "Grant")}
      />
      <ConfirmDialog
        open={confirmDeleteEntryKey !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteEntryKey(null);
        }}
        title="Delete entry?"
        description="This cannot be undone."
        confirmLabel="Delete"
        isPending={metricMutations.deleteEntry.isPending}
        onConfirm={() => {
          if (!confirmDeleteEntryKey) return;
          const { metricId, entryId } = confirmDeleteEntryKey;
          void metricMutations.deleteEntry
            .mutateAsync({ metricId, entryId })
            .then(() => setDeleteMetricError(null))
            .catch((error: unknown) => {
              setDeleteMetricError(
                error instanceof Error ? error.message : "Unable to delete metric entry.",
              );
            });
        }}
      />
      {confirmDeleteAllocationId !== null ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirmDeleteAllocationId(null);
          }}
          title="Delete allocation?"
          description="This cannot be undone."
          confirmLabel="Delete"
          isPending={allocationMutations.deleteAllocation.isPending}
          onConfirm={() => {
            void allocationMutations.deleteAllocation
              .mutateAsync(confirmDeleteAllocationId)
              .then(() => setDeleteAllocationError(null))
              .catch((error: unknown) => {
                setDeleteAllocationError(
                  error instanceof Error ? error.message : "Unable to delete allocation.",
                );
              });
          }}
        />
      ) : null}
      {confirmDeleteExpenseId !== null ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirmDeleteExpenseId(null);
          }}
          title="Delete expense?"
          description="This cannot be undone."
          confirmLabel="Delete"
          isPending={expenseMutations.deleteExpense.isPending}
          onConfirm={() => {
            void expenseMutations.deleteExpense
              .mutateAsync(confirmDeleteExpenseId)
              .then(() => setDeleteExpenseError(null))
              .catch((error: unknown) => {
                setDeleteExpenseError(
                  error instanceof Error ? error.message : "Unable to delete expense.",
                );
              });
          }}
        />
      ) : null}
      {confirmDeleteMetricId !== null ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirmDeleteMetricId(null);
          }}
          title="Delete metric?"
          description="This cannot be undone."
          confirmLabel="Delete"
          isPending={metricMutations.deleteMetric.isPending}
          onConfirm={() => {
            void metricMutations.deleteMetric
              .mutateAsync(confirmDeleteMetricId)
              .then(() => setDeleteMetricError(null))
              .catch((error: unknown) => {
                setDeleteMetricError(
                  error instanceof Error ? error.message : "Unable to delete metric.",
                );
              });
          }}
        />
      ) : null}
      {confirmDeleteRequirementId !== null ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirmDeleteRequirementId(null);
          }}
          title="Delete requirement?"
          description="This cannot be undone."
          confirmLabel="Delete"
          isPending={reportingMutations.deleteRequirement.isPending}
          onConfirm={() => {
            void runGrantAction(() =>
              reportingMutations.deleteRequirement.mutateAsync(confirmDeleteRequirementId),
            );
          }}
        />
      ) : null}
      {confirmDeleteCloseoutItemId !== null ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirmDeleteCloseoutItemId(null);
          }}
          title="Delete closeout item?"
          description="This cannot be undone."
          confirmLabel="Delete"
          isPending={closeoutMutations.deleteItem.isPending}
          onConfirm={() => {
            void runGrantAction(() =>
              closeoutMutations.deleteItem.mutateAsync(confirmDeleteCloseoutItemId),
            );
          }}
        />
      ) : null}
    </PageShell>
  );
}
