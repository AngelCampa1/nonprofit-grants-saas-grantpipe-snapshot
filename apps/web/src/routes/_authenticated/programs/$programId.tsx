import React, { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  programBudgetCreateSchema,
  programBudgetUpdateSchema,
  programUpdateSchema,
  createOutcomeIndicatorSchema,
  createOutcomeSchema,
  OUTCOME_INDICATOR_TYPES,
  OUTCOME_REPORTING_CADENCES,
  PROGRAM_BUDGET_STATUSES,
  PROGRAM_STATUSES,
  formatMinimumPlanLabelForFeatures,
  getEffectivePlanTier,
  getPlanEntitlements,
  type ProgramBudgetStatus,
  type ProgramStatus,
} from "@grantpipe/shared";
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
  Checkbox,
  DataTable,
  numericSortingFn,
  type DataTableProps,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  TeachAndActEmptyState,
  Textarea,
} from "@grantpipe/ui";
import { Shapes, Target } from "lucide-react";
import { RetryButton } from "../../../components/retry-button";
import {
  useCreateOutcome,
  useCreateOutcomeIndicator,
  useOutcomes,
} from "../../../hooks/use-outcomes";
import { useOrgBilling, useOrgTeam } from "../../../hooks/use-org-settings";
import {
  useCreateProgramBudget,
  useProgram,
  useProgramMutations,
  useUpdateProgramBudget,
} from "../../../hooks/use-programs";
import { useSession } from "../../../hooks/use-session";
import { canAccessFeature } from "../../../lib/access-control";
import { formatCurrency, formatUtcCalendarDate, humanizeEnum } from "../../../lib/format";
import { centsFromInput } from "../../../lib/money";

export const Route = createFileRoute("/_authenticated/programs/$programId")({
  component: ProgramDetailPage,
  errorComponent: ({ error }) => (
    <div className="p-4 sm:p-6 lg:p-8">
      <Alert variant="destructive" title="Unable to load page">
        <p>{error instanceof Error ? error.message : "Unknown error"}</p>
      </Alert>
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

type ProgramBudgetLine = {
  id: string;
  category: string;
  budgetedCents: number;
  notes?: string | null;
};

type ProgramBudget = {
  id: string;
  name: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  lines?: ProgramBudgetLine[];
};

type ProgramDetail = {
  id: string;
  name: string;
  code?: string | null;
  description?: string | null;
  status?: string | null;
  ownerUserId?: string | null;
  budgets?: ProgramBudget[];
  grantAllocations?: Array<{ id: string; grantId: string; amountCents?: number | null }>;
  expenseAllocations?: Array<{ id: string; expenseId: string; amountCents?: number | null }>;
  impactMetricLinks?: Array<{ id: string; impactMetricId: string }>;
  reportingRequirementLinks?: Array<{ id: string; reportingRequirementId: string }>;
};

type BudgetRow = ProgramBudget & { totalBudgetedCents: number };
type BudgetColumn = DataTableProps<BudgetRow, unknown>["columns"][number];
type OutcomeIndicatorType = (typeof OUTCOME_INDICATOR_TYPES)[number];
type OutcomeReportingCadence = (typeof OUTCOME_REPORTING_CADENCES)[number];

type OutcomeIndicator = {
  id: string;
  name: string;
  status: "on_track" | "behind" | "missing";
  actualValue: number | null;
  targetValue: number | null;
  unit: string | null;
  funderDefined: boolean;
};

type OutcomeGoal = {
  id: string;
  name: string;
  statement: string;
  status: string;
  indicators?: OutcomeIndicator[];
};

type OutcomeListResponse = {
  data?: OutcomeGoal[];
  pagination?: {
    page: number;
    pageSize: number;
    hasNextPage: boolean;
  };
};

const OUTCOME_PAGE_SIZE = 10;
const OUTCOME_MIN_PLAN_LABEL = formatMinimumPlanLabelForFeatures(["hasOutcomeImpactMeasurement"]);

function formatOutcomeValue(indicator: OutcomeIndicator) {
  const actual = indicator.actualValue ?? "Missing";
  const target = indicator.targetValue ?? "Missing";
  const unit = indicator.unit ? ` ${indicator.unit}` : "";
  return `${actual} / ${target}${unit}`;
}

function ProgramDetailPage() {
  const { programId } = Route.useParams();
  const programQuery = useProgram(programId);
  const { memberRole, memberPermissions } = useSession();
  const billingQuery = useOrgBilling();
  const orgTeamQuery = useOrgTeam();
  const { updateProgram } = useProgramMutations(programId);
  const createBudget = useCreateProgramBudget();
  const createOutcome = useCreateOutcome();
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const updateBudget = useUpdateProgramBudget(editingBudgetId ?? "", programId);
  const [indicatorOutcomeId, setIndicatorOutcomeId] = useState<string>("");
  const createIndicator = useCreateOutcomeIndicator(indicatorOutcomeId);

  const planTier = getEffectivePlanTier({
    planTier: billingQuery.data?.planTier,
    subscriptionStatus: billingQuery.data?.status,
    trialEndsAt: billingQuery.data?.trialEndsAt,
  });
  const entitlements = getPlanEntitlements(planTier);
  const canUseOutcomes = entitlements.hasOutcomeImpactMeasurement;
  const [outcomePageSize, setOutcomePageSize] = useState(OUTCOME_PAGE_SIZE);
  const outcomesQuery = useOutcomes({
    programId,
    enabled: canUseOutcomes,
    page: 1,
    pageSize: outcomePageSize,
  });
  const outcomeResponse = outcomesQuery.data as OutcomeListResponse | undefined;
  const canEdit =
    entitlements.canManagePrograms &&
    (memberRole === "admin" || memberRole === "editor") &&
    canAccessFeature(memberRole, memberPermissions, "programs", "edit");
  const canEditOutcomes = canUseOutcomes && canEdit;

  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<{
    name: string;
    code: string;
    description: string;
    status: ProgramStatus;
    ownerUserId: string;
  }>({
    name: "",
    code: "",
    description: "",
    status: "active",
    ownerUserId: "",
  });

  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [outcomeError, setOutcomeError] = useState<string | null>(null);
  const [outcomeForm, setOutcomeForm] = useState({
    name: "",
    statement: "",
    targetPopulation: "",
    status: "active",
    startDate: "",
    endDate: "",
  });

  const [indicatorOpen, setIndicatorOpen] = useState(false);
  const [indicatorError, setIndicatorError] = useState<string | null>(null);
  const [indicatorForm, setIndicatorForm] = useState<{
    name: string;
    indicatorType: OutcomeIndicatorType;
    targetValue: string;
    baselineValue: string;
    unit: string;
    source: string;
    funderDefined: boolean;
    reportingCadence: OutcomeReportingCadence;
  }>({
    name: "",
    indicatorType: "outcome",
    targetValue: "",
    baselineValue: "",
    unit: "",
    source: "",
    funderDefined: false,
    reportingCadence: "quarterly",
  });

  function handleEditOpenChange(nextOpen: boolean) {
    if (!nextOpen && updateProgram.isPending) {
      return;
    }
    setEditOpen(nextOpen);
    setEditError(null);
    if (nextOpen) {
      const program = programQuery.data as ProgramDetail | undefined;
      setEditFormData({
        name: program?.name ?? "",
        code: program?.code ?? "",
        description: program?.description ?? "",
        status: (program?.status as ProgramStatus) ?? "active",
        ownerUserId: program?.ownerUserId ?? "",
      });
    }
  }

  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [budgetForm, setBudgetForm] = useState<{
    name: string;
    periodStart: string;
    periodEnd: string;
    status: ProgramBudgetStatus;
    lines: Array<{ category: string; amount: string; notes: string }>;
  }>({
    name: "",
    periodStart: "",
    periodEnd: "",
    status: "draft",
    lines: [{ category: "", amount: "", notes: "" }],
  });

  const budgetPending = createBudget.isPending || updateBudget.isPending;

  function handleBudgetOpenChange(nextOpen: boolean) {
    if (!nextOpen && budgetPending) {
      return;
    }
    setBudgetOpen(nextOpen);
    if (!nextOpen) {
      setBudgetError(null);
    }
  }

  function handleOutcomeOpenChange(nextOpen: boolean) {
    if (!nextOpen && createOutcome.isPending) return;
    setOutcomeOpen(nextOpen);
    if (!nextOpen) setOutcomeError(null);
  }

  function openCreateOutcome() {
    setOutcomeError(null);
    setOutcomeForm({
      name: "",
      statement: "",
      targetPopulation: "",
      status: "active",
      startDate: "",
      endDate: "",
    });
    setOutcomeOpen(true);
  }

  function openCreateIndicator(outcomeId: string) {
    setIndicatorOutcomeId(outcomeId);
    setIndicatorError(null);
    setIndicatorForm({
      name: "",
      indicatorType: "outcome",
      targetValue: "",
      baselineValue: "",
      unit: "",
      source: "",
      funderDefined: false,
      reportingCadence: "quarterly",
    });
    setIndicatorOpen(true);
  }

  function handleIndicatorOpenChange(nextOpen: boolean) {
    if (!nextOpen && createIndicator.isPending) return;
    setIndicatorOpen(nextOpen);
    if (!nextOpen) setIndicatorError(null);
  }

  function openCreateBudget() {
    setEditingBudgetId(null);
    setBudgetError(null);
    setBudgetForm({
      name: "",
      periodStart: "",
      periodEnd: "",
      status: "draft",
      lines: [{ category: "", amount: "", notes: "" }],
    });
    setBudgetOpen(true);
  }

  function openEditBudget(budget: BudgetRow) {
    setEditingBudgetId(budget.id);
    setBudgetError(null);
    const lines = (budget.lines ?? []).map((line) => ({
      category: line.category,
      amount: (line.budgetedCents / 100).toString(),
      notes: line.notes ?? "",
    }));
    setBudgetForm({
      name: budget.name,
      periodStart: budget.periodStart.slice(0, 10),
      periodEnd: budget.periodEnd.slice(0, 10),
      status: (PROGRAM_BUDGET_STATUSES as readonly string[]).includes(budget.status)
        ? (budget.status as ProgramBudgetStatus)
        : "draft",
      lines: lines.length > 0 ? lines : [{ category: "", amount: "", notes: "" }],
    });
    setBudgetOpen(true);
  }

  function updateBudgetLine(index: number, field: "category" | "amount" | "notes", value: string) {
    setBudgetForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [field]: value } : line,
      ),
    }));
  }

  function addBudgetLine() {
    setBudgetForm((current) => ({
      ...current,
      lines: [...current.lines, { category: "", amount: "", notes: "" }],
    }));
  }

  function removeBudgetLine(index: number) {
    setBudgetForm((current) =>
      current.lines.length <= 1
        ? current
        : { ...current, lines: current.lines.filter((_, lineIndex) => lineIndex !== index) },
    );
  }

  async function handleBudgetSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBudgetError(null);
    const lines = budgetForm.lines.map((line) => ({
      category: line.category.trim(),
      budgetedCents: centsFromInput(line.amount),
      notes: line.notes.trim() || undefined,
    }));
    if (editingBudgetId) {
      const parsed = programBudgetUpdateSchema.safeParse({
        name: budgetForm.name.trim() || undefined,
        periodStart: budgetForm.periodStart || undefined,
        periodEnd: budgetForm.periodEnd || undefined,
        status: budgetForm.status,
        lines,
      });
      if (!parsed.success) {
        setBudgetError(parsed.error.issues[0]!.message);
        return;
      }
      try {
        await updateBudget.mutateAsync(parsed.data);
        handleBudgetOpenChange(false);
      } catch (error) {
        setBudgetError(error instanceof Error ? error.message : "Unable to save budget.");
      }
      return;
    }
    const parsed = programBudgetCreateSchema.safeParse({
      programId,
      name: budgetForm.name.trim(),
      periodStart: budgetForm.periodStart,
      periodEnd: budgetForm.periodEnd,
      status: budgetForm.status,
      lines,
    });
    if (!parsed.success) {
      setBudgetError(parsed.error.issues[0]!.message);
      return;
    }
    try {
      await createBudget.mutateAsync(parsed.data);
      handleBudgetOpenChange(false);
    } catch (error) {
      setBudgetError(error instanceof Error ? error.message : "Unable to save budget.");
    }
  }

  async function handleOutcomeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOutcomeError(null);
    const parsed = createOutcomeSchema.safeParse({
      programId,
      name: outcomeForm.name.trim(),
      statement: outcomeForm.statement.trim(),
      targetPopulation: outcomeForm.targetPopulation.trim() || undefined,
      status: outcomeForm.status,
      startDate: outcomeForm.startDate || undefined,
      endDate: outcomeForm.endDate || undefined,
    });
    if (!parsed.success) {
      setOutcomeError(parsed.error.issues[0]!.message);
      return;
    }
    try {
      await createOutcome.mutateAsync(parsed.data);
      handleOutcomeOpenChange(false);
    } catch (error) {
      setOutcomeError(error instanceof Error ? error.message : "Unable to save outcome.");
    }
  }

  async function handleIndicatorSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIndicatorError(null);
    const targetValue = indicatorForm.targetValue.trim()
      ? Number(indicatorForm.targetValue)
      : undefined;
    const baselineValue = indicatorForm.baselineValue.trim()
      ? Number(indicatorForm.baselineValue)
      : undefined;
    const parsed = createOutcomeIndicatorSchema.safeParse({
      name: indicatorForm.name.trim(),
      indicatorType: indicatorForm.indicatorType,
      targetValue,
      baselineValue,
      unit: indicatorForm.unit.trim() || undefined,
      source: indicatorForm.source.trim() || undefined,
      funderDefined: indicatorForm.funderDefined,
      reportingCadence: indicatorForm.reportingCadence,
    });
    if (!parsed.success) {
      setIndicatorError(parsed.error.issues[0]!.message);
      return;
    }
    try {
      await createIndicator.mutateAsync({
        ...parsed.data,
        targetValue:
          parsed.data.targetValue === undefined ? undefined : Number(parsed.data.targetValue),
        baselineValue:
          parsed.data.baselineValue === undefined ? undefined : Number(parsed.data.baselineValue),
      });
      handleIndicatorOpenChange(false);
    } catch (error) {
      setIndicatorError(error instanceof Error ? error.message : "Unable to save number.");
    }
  }

  async function handleEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEditError(null);
    const trimmedName = editFormData.name.trim();
    const parsed = programUpdateSchema.safeParse({
      name: trimmedName || undefined,
      code: editFormData.code.trim() || undefined,
      description: editFormData.description.trim() || undefined,
      status: editFormData.status,
      ownerUserId: editFormData.ownerUserId || undefined,
    });
    if (parsed.success && !trimmedName) {
      setEditError("Program name is required.");
      return;
    }
    if (!parsed.success) {
      setEditError(parsed.error.issues[0]!.message);
      return;
    }
    try {
      await updateProgram.mutateAsync(parsed.data);
      handleEditOpenChange(false);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Unable to save program.");
    }
  }

  if (programQuery.isLoading) {
    return (
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (programQuery.isError) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Alert variant="destructive" title="Unable to load program.">
          <p>Refresh the page or try again in a moment.</p>
          <RetryButton query={programQuery} />
        </Alert>
      </div>
    );
  }

  const program = programQuery.data as ProgramDetail | undefined;
  const budgets: BudgetRow[] = (program?.budgets ?? []).map((budget) => ({
    ...budget,
    totalBudgetedCents: (budget.lines ?? []).reduce((total, line) => total + line.budgetedCents, 0),
  }));
  const totalOperatingBudgetCents = budgets.reduce(
    (total, budget) => total + budget.totalBudgetedCents,
    0,
  );
  const outcomes = (outcomeResponse?.data ?? []).filter((outcome) => outcome.id);
  const hasMoreOutcomes = Boolean(outcomeResponse?.pagination?.hasNextPage);
  const columns: BudgetColumn[] = [
    { id: "name", accessorKey: "name", header: "Budget" },
    {
      id: "status",
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant="outline">{humanizeEnum(row.original.status ?? "active")}</Badge>
      ),
    },
    {
      id: "period",
      header: "Period",
      cell: ({ row }) =>
        `${formatUtcCalendarDate(row.original.periodStart)} - ${formatUtcCalendarDate(
          row.original.periodEnd,
        )}`,
    },
    {
      id: "total",
      accessorKey: "totalBudgetedCents",
      header: "Budgeted",
      sortingFn: numericSortingFn,
      cell: ({ row }) => formatCurrency(row.original.totalBudgetedCents),
    },
    ...(canEdit
      ? [
          {
            id: "actions",
            header: "",
            cell: ({ row }) => (
              <Button variant="outline" size="sm" onClick={() => openEditBudget(row.original)}>
                Edit budget
              </Button>
            ),
          } satisfies BudgetColumn,
        ]
      : []),
  ];

  const headerActions = canEdit ? (
    <Dialog open={editOpen} onOpenChange={handleEditOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">Edit program</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit program details</DialogTitle>
          <DialogDescription>
            Update the program name, code, description, and status.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleEditSubmit}>
          {editError ? (
            <Alert variant="destructive" title="Unable to save program">
              {editError}
            </Alert>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="edit-program-name">
              Program name <span aria-hidden="true">*</span>
            </Label>
            <Input
              id="edit-program-name"
              placeholder="Program name"
              value={editFormData.name}
              required
              aria-required="true"
              disabled={updateProgram.isPending}
              onChange={(event) =>
                setEditFormData((current) => ({ ...current, name: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-program-code">Code</Label>
            <Input
              id="edit-program-code"
              placeholder="HEALTH"
              value={editFormData.code}
              disabled={updateProgram.isPending}
              onChange={(event) =>
                setEditFormData((current) => ({ ...current, code: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-program-description">Description</Label>
            <Textarea
              id="edit-program-description"
              placeholder="What does this program track?"
              value={editFormData.description}
              disabled={updateProgram.isPending}
              onChange={(event) =>
                setEditFormData((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-program-owner">Owner</Label>
            <Select
              value={editFormData.ownerUserId}
              onValueChange={(next) =>
                setEditFormData((current) => ({ ...current, ownerUserId: next }))
              }
            >
              <SelectTrigger id="edit-program-owner" aria-label="Owner">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                {(orgTeamQuery.data ?? [])
                  .filter(
                    (
                      member,
                    ): member is typeof member & {
                      user: { id: string };
                    } => !!member.user?.id,
                  )
                  .map((member) => (
                    <SelectItem key={member.user.id} value={member.user.id}>
                      {member.user.name ?? member.user.email ?? member.user.id}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-program-status">Status</Label>
            <Select
              value={editFormData.status}
              onValueChange={(next) =>
                setEditFormData((current) => ({
                  ...current,
                  status: next as ProgramStatus,
                }))
              }
            >
              <SelectTrigger id="edit-program-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROGRAM_STATUSES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {humanizeEnum(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={updateProgram.isPending || editFormData.name.trim().length === 0}
          >
            {updateProgram.isPending ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  ) : null;

  return (
    <div className="space-y-8 p-4 sm:p-6 lg:p-8">
      <PageHeader
        variant="workbench"
        breadcrumb={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/programs">Programs</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{program?.name ?? "Program"}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
        kicker={program?.code ?? "Program"}
        title={program?.name ?? "Program"}
        help={program?.description ?? "Program funding, budgets, grants, expenses, and outcomes."}
        actions={headerActions}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border bg-background p-4">
          <p className="text-xs font-medium text-muted-foreground">Operating budget</p>
          <p className="mt-1 text-xl font-semibold">{formatCurrency(totalOperatingBudgetCents)}</p>
        </div>
        <div className="rounded-2xl border bg-background p-4">
          <p className="text-xs font-medium text-muted-foreground">Grant allocations</p>
          <p className="mt-1 text-xl font-semibold">{program?.grantAllocations?.length ?? 0}</p>
        </div>
        <div className="rounded-2xl border bg-background p-4">
          <p className="text-xs font-medium text-muted-foreground">Expense allocations</p>
          <p className="mt-1 text-xl font-semibold">{program?.expenseAllocations?.length ?? 0}</p>
        </div>
        <div className="rounded-2xl border bg-background p-4">
          <p className="text-xs font-medium text-muted-foreground">Outcome links</p>
          <p className="mt-1 text-xl font-semibold">{program?.impactMetricLinks?.length ?? 0}</p>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Outcome goals</h2>
            <p className="text-sm text-muted-foreground">
              Track what should change and how you will measure it.
            </p>
          </div>
          {canEditOutcomes ? (
            <Button variant="outline" onClick={openCreateOutcome}>
              Add outcome
            </Button>
          ) : null}
        </div>
        {!canUseOutcomes ? (
          <div className="rounded-2xl border bg-background p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-muted p-2">
                <Target className="size-4 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <h3 className="text-base font-semibold">Outcome tracking is locked</h3>
                <p className="max-w-prose text-sm text-muted-foreground">
                  Upgrade to {OUTCOME_MIN_PLAN_LABEL}. Then track goals for this program.
                </p>
              </div>
            </div>
          </div>
        ) : outcomesQuery.isError ? (
          <Alert variant="destructive" title="Unable to load outcomes.">
            Refresh the page or try again in a moment.
          </Alert>
        ) : outcomesQuery.isLoading ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
          </div>
        ) : outcomes.length === 0 ? (
          <div className="rounded-2xl border bg-background p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-muted p-2">
                <Target className="size-5 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <h3 className="text-base font-semibold">No outcome goals yet</h3>
                <p className="max-w-prose text-sm text-muted-foreground">
                  Add one goal. Then add the numbers a funder asks you to track.
                </p>
                {canEditOutcomes ? (
                  <Button size="sm" onClick={openCreateOutcome}>
                    Add outcome
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              {outcomes.map((outcome) => (
                <article key={outcome.id} className="rounded-2xl border bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{outcome.name}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{outcome.statement}</p>
                    </div>
                    <Badge variant="outline">{humanizeEnum(outcome.status)}</Badge>
                  </div>
                  <div className="mt-4 space-y-2">
                    {(outcome.indicators ?? []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">No indicators yet.</p>
                    ) : (
                      (outcome.indicators ?? []).map((indicator) => (
                        <div
                          key={indicator.id}
                          className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                        >
                          <div>
                            <p className="font-medium">{indicator.name}</p>
                            <p className="text-muted-foreground">
                              {indicator.funderDefined ? "Funder-defined" : "Internal"} indicator
                            </p>
                          </div>
                          <div className="text-right">
                            <Badge
                              variant={indicator.status === "behind" ? "destructive" : "outline"}
                            >
                              {humanizeEnum(indicator.status)}
                            </Badge>
                            <p className="mt-1 text-muted-foreground">
                              {formatOutcomeValue(indicator)}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  {canEditOutcomes ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => openCreateIndicator(outcome.id)}
                    >
                      Add indicator
                    </Button>
                  ) : null}
                </article>
              ))}
            </div>
            {hasMoreOutcomes ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setOutcomePageSize((current) => current + OUTCOME_PAGE_SIZE)}
                disabled={outcomesQuery.isFetching}
              >
                {outcomesQuery.isFetching ? "Loading…" : "Load more"}
              </Button>
            ) : null}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Funding and budget</h2>
            <p className="text-sm text-muted-foreground">
              Budget periods and lines owned by this program.
            </p>
          </div>
          {canEdit ? (
            <Button variant="outline" onClick={openCreateBudget}>
              Add budget
            </Button>
          ) : null}
        </div>
        <DataTable<BudgetRow, unknown>
          columns={columns}
          data={budgets}
          emptyState={
            <TeachAndActEmptyState
              icon={<Shapes className="size-5" />}
              heading="No program budgets recorded yet"
              description="Add a budget period. It tracks what grants and expenses belong to this program."
              primaryAction={
                canEdit
                  ? { label: "Add budget period", onClick: openCreateBudget }
                  : { label: "Open help", href: "/help" }
              }
            />
          }
        />
      </section>

      {canEditOutcomes ? (
        <Dialog open={outcomeOpen} onOpenChange={handleOutcomeOpenChange}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add outcome</DialogTitle>
              <DialogDescription>Name the change this program is trying to make.</DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={handleOutcomeSubmit}>
              {outcomeError ? (
                <Alert variant="destructive" title="Unable to save outcome">
                  {outcomeError}
                </Alert>
              ) : null}
              <div className="space-y-1">
                <Label htmlFor="outcome-name">Outcome name</Label>
                <Input
                  id="outcome-name"
                  value={outcomeForm.name}
                  disabled={createOutcome.isPending}
                  onChange={(event) =>
                    setOutcomeForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="outcome-statement">What should change?</Label>
                <Textarea
                  id="outcome-statement"
                  value={outcomeForm.statement}
                  disabled={createOutcome.isPending}
                  onChange={(event) =>
                    setOutcomeForm((current) => ({ ...current, statement: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="outcome-population">Who is this for?</Label>
                <Input
                  id="outcome-population"
                  value={outcomeForm.targetPopulation}
                  disabled={createOutcome.isPending}
                  onChange={(event) =>
                    setOutcomeForm((current) => ({
                      ...current,
                      targetPopulation: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="outcome-start">Start date</Label>
                  <Input
                    id="outcome-start"
                    type="date"
                    value={outcomeForm.startDate}
                    disabled={createOutcome.isPending}
                    onChange={(event) =>
                      setOutcomeForm((current) => ({ ...current, startDate: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="outcome-end">End date</Label>
                  <Input
                    id="outcome-end"
                    type="date"
                    value={outcomeForm.endDate}
                    disabled={createOutcome.isPending}
                    onChange={(event) =>
                      setOutcomeForm((current) => ({ ...current, endDate: event.target.value }))
                    }
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={
                  createOutcome.isPending ||
                  outcomeForm.name.trim().length === 0 ||
                  outcomeForm.statement.trim().length === 0
                }
              >
                {createOutcome.isPending ? "Saving…" : "Save outcome"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}

      {canEditOutcomes ? (
        <Dialog open={indicatorOpen} onOpenChange={handleIndicatorOpenChange}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add indicator</DialogTitle>
              <DialogDescription>Add the number this outcome needs to track.</DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={handleIndicatorSubmit}>
              {indicatorError ? (
                <Alert variant="destructive" title="Unable to save number">
                  {indicatorError}
                </Alert>
              ) : null}
              <div className="space-y-1">
                <Label htmlFor="indicator-name">Indicator name</Label>
                <Input
                  id="indicator-name"
                  value={indicatorForm.name}
                  disabled={createIndicator.isPending}
                  onChange={(event) =>
                    setIndicatorForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="indicator-type">Indicator type</Label>
                  <Select
                    value={indicatorForm.indicatorType}
                    onValueChange={(next) =>
                      setIndicatorForm((current) => ({
                        ...current,
                        indicatorType: next as OutcomeIndicatorType,
                      }))
                    }
                  >
                    <SelectTrigger id="indicator-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OUTCOME_INDICATOR_TYPES.map((option) => (
                        <SelectItem key={option} value={option}>
                          {humanizeEnum(option)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="indicator-cadence">Report cadence</Label>
                  <Select
                    value={indicatorForm.reportingCadence}
                    onValueChange={(next) =>
                      setIndicatorForm((current) => ({
                        ...current,
                        reportingCadence: next as OutcomeReportingCadence,
                      }))
                    }
                  >
                    <SelectTrigger id="indicator-cadence">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OUTCOME_REPORTING_CADENCES.map((option) => (
                        <SelectItem key={option} value={option}>
                          {humanizeEnum(option)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="indicator-target">Target value</Label>
                  <Input
                    id="indicator-target"
                    inputMode="decimal"
                    value={indicatorForm.targetValue}
                    disabled={createIndicator.isPending}
                    onChange={(event) =>
                      setIndicatorForm((current) => ({
                        ...current,
                        targetValue: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="indicator-baseline">Baseline</Label>
                  <Input
                    id="indicator-baseline"
                    inputMode="decimal"
                    value={indicatorForm.baselineValue}
                    disabled={createIndicator.isPending}
                    onChange={(event) =>
                      setIndicatorForm((current) => ({
                        ...current,
                        baselineValue: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="indicator-unit">Unit</Label>
                  <Input
                    id="indicator-unit"
                    value={indicatorForm.unit}
                    disabled={createIndicator.isPending}
                    onChange={(event) =>
                      setIndicatorForm((current) => ({ ...current, unit: event.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="indicator-source">Source</Label>
                <Input
                  id="indicator-source"
                  value={indicatorForm.source}
                  disabled={createIndicator.isPending}
                  onChange={(event) =>
                    setIndicatorForm((current) => ({ ...current, source: event.target.value }))
                  }
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="indicator-funder-defined"
                  checked={indicatorForm.funderDefined}
                  disabled={createIndicator.isPending}
                  onCheckedChange={(checked) =>
                    setIndicatorForm((current) => ({
                      ...current,
                      funderDefined: checked === true,
                    }))
                  }
                />
                <Label htmlFor="indicator-funder-defined">Funder-defined</Label>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={createIndicator.isPending || indicatorForm.name.trim().length === 0}
              >
                {createIndicator.isPending ? "Saving…" : "Save number"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}

      {canEdit ? (
        <Dialog open={budgetOpen} onOpenChange={handleBudgetOpenChange}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingBudgetId ? "Edit budget" : "Add budget"}</DialogTitle>
              <DialogDescription>Set a budget period. Then add line items.</DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={handleBudgetSubmit}>
              {budgetError ? (
                <Alert variant="destructive" title="Unable to save budget">
                  {budgetError}
                </Alert>
              ) : null}
              <div className="space-y-1">
                <Label htmlFor="budget-name">
                  Budget name <span aria-hidden="true">*</span>
                </Label>
                <Input
                  id="budget-name"
                  placeholder="FY26 Operations"
                  value={budgetForm.name}
                  disabled={budgetPending}
                  onChange={(event) =>
                    setBudgetForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="budget-period-start">
                    Period start <span aria-hidden="true">*</span>
                  </Label>
                  <Input
                    id="budget-period-start"
                    type="date"
                    value={budgetForm.periodStart}
                    disabled={budgetPending}
                    onChange={(event) =>
                      setBudgetForm((current) => ({
                        ...current,
                        periodStart: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="budget-period-end">
                    Period end <span aria-hidden="true">*</span>
                  </Label>
                  <Input
                    id="budget-period-end"
                    type="date"
                    value={budgetForm.periodEnd}
                    disabled={budgetPending}
                    onChange={(event) =>
                      setBudgetForm((current) => ({ ...current, periodEnd: event.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="budget-status">Status</Label>
                <Select
                  value={budgetForm.status}
                  onValueChange={(next) =>
                    setBudgetForm((current) => ({
                      ...current,
                      status: next as ProgramBudgetStatus,
                    }))
                  }
                >
                  <SelectTrigger id="budget-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROGRAM_BUDGET_STATUSES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {humanizeEnum(option)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Budget lines</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addBudgetLine}
                    disabled={budgetPending}
                  >
                    Add line
                  </Button>
                </div>
                {budgetForm.lines.map((line, index) => (
                  <div key={index} className="grid gap-2 sm:grid-cols-[1fr_8rem_1fr_auto]">
                    <Input
                      aria-label={`Line ${index + 1} category`}
                      placeholder="Category"
                      value={line.category}
                      disabled={budgetPending}
                      onChange={(event) => updateBudgetLine(index, "category", event.target.value)}
                    />
                    <Input
                      aria-label={`Line ${index + 1} amount`}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={line.amount}
                      disabled={budgetPending}
                      onChange={(event) => updateBudgetLine(index, "amount", event.target.value)}
                    />
                    <Input
                      aria-label={`Line ${index + 1} notes`}
                      placeholder="Notes (optional)"
                      value={line.notes}
                      disabled={budgetPending}
                      onChange={(event) => updateBudgetLine(index, "notes", event.target.value)}
                    />
                    {budgetForm.lines.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove line ${index + 1}`}
                        disabled={budgetPending}
                        onClick={() => removeBudgetLine(index)}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
              <Button type="submit" className="w-full" disabled={budgetPending}>
                {budgetPending
                  ? editingBudgetId
                    ? "Saving…"
                    : "Adding…"
                  : editingBudgetId
                    ? "Save"
                    : "Add"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
