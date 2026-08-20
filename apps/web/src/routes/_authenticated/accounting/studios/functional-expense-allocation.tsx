import React, { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@grantpipe/ui";
import { canUseFunctionalExpenseAllocation, ALLOCATION_METHODS } from "@grantpipe/shared";
import type { AllocationMethod } from "@grantpipe/shared";
import { Layers, PlusIcon, Pencil, Trash2, CreditCard, Link } from "lucide-react";
import {
  useAllocationBases,
  useAllocationTargets,
  useAllocationRules,
  useAllocatedFunctionalExpenses,
  useCreateAllocationBase,
  useUpdateAllocationBase,
  useDeleteAllocationBase,
  useSetAllocationTargets,
  useCreateAllocationRule,
  useDeleteAllocationRule,
  type AllocationBase,
  type AllocationRule,
  type AllocationTarget,
} from "../../../../hooks/use-allocation";
import { useAccounts } from "../../../../hooks/use-accounting";
import { usePrograms } from "../../../../hooks/use-programs";
import { useSession } from "../../../../hooks/use-session";
import { AccessDeniedState } from "../../../../components/access-denied-state";
import { canAccessFeature } from "../../../../lib/access-control";
import { formatCurrency, formatUtcCalendarDate } from "../../../../lib/format";

export const Route = createFileRoute(
  "/_authenticated/accounting/studios/functional-expense-allocation",
)({
  component: FunctionalExpenseAllocationPage,
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const METHOD_LABELS: Record<AllocationMethod, string> = {
  headcount_fte: "Headcount / FTE",
  square_footage: "Square Footage",
  time_study: "Time Study",
  manual_percentage: "Manual Percentage",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function bpToPercent(bp: number): number {
  return bp / 100;
}

export function percentToBp(pct: number): number {
  return Math.round(pct * 100);
}

export function sumWeightsBp(weights: number[]): number {
  return weights.reduce((acc, w) => acc + w, 0);
}

// ---------------------------------------------------------------------------
// Upgrade gate
// ---------------------------------------------------------------------------

function UpgradeCard() {
  const navigate = useNavigate();
  return (
    <PageShell>
      <PageHeader variant="workbench" title="Expense Allocation Studio" />
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
          <Layers className="size-6 text-success" />
        </div>
        <div className="max-w-md space-y-2">
          <h2 className="text-lg font-semibold text-foreground">
            Allocation Studio is on Growth and above
          </h2>
          <p className="text-sm text-muted-foreground">
            Split pooled expenses across program, management, and fundraising automatically. Upgrade
            to unlock.
          </p>
        </div>
        <Button
          className="rounded-full"
          onClick={() => void navigate({ to: "/settings", hash: "billing" })}
        >
          <CreditCard className="mr-2 size-4" />
          View billing
        </Button>
      </div>
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Base dialog
// ---------------------------------------------------------------------------

interface BaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: AllocationBase | null;
}

interface BaseFormState {
  name: string;
  method: AllocationMethod;
  status: "active" | "inactive";
}

const DEFAULT_BASE_FORM: BaseFormState = {
  name: "",
  method: "headcount_fte",
  status: "active",
};

export function BaseDialog({ open, onOpenChange, initial }: BaseDialogProps) {
  const [form, setForm] = useState<BaseFormState>(() =>
    initial
      ? {
          name: initial.name,
          method: initial.method as AllocationMethod,
          status: initial.status as "active" | "inactive",
        }
      : DEFAULT_BASE_FORM,
  );
  const [error, setError] = useState<string | null>(null);

  const createBase = useCreateAllocationBase();
  const updateBase = useUpdateAllocationBase();

  const isEditing = Boolean(initial);
  const isPending = createBase.isPending || updateBase.isPending;

  function handleOpenChange(val: boolean) {
    if (!val) {
      setForm(DEFAULT_BASE_FORM);
      setError(null);
    }
    onOpenChange(val);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    try {
      if (isEditing && initial) {
        await updateBase.mutateAsync({ id: initial.id, data: form });
      } else {
        await createBase.mutateAsync(form);
      }
      handleOpenChange(false);
    } catch {
      setError("Something went wrong. Try again.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit allocation base" : "Add allocation base"}</DialogTitle>
          <DialogDescription>Name the base, choose a method, and set its status.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="base-name">Name</Label>
            <Input
              id="base-name"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Q1 Headcount"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="base-method">Method</Label>
            <Select
              value={form.method}
              onValueChange={(v) => setForm((p) => ({ ...p, method: v as AllocationMethod }))}
            >
              <SelectTrigger id="base-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALLOCATION_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {METHOD_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="base-status">Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => setForm((p) => ({ ...p, status: v as "active" | "inactive" }))}
            >
              <SelectTrigger id="base-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" className="rounded-full" disabled={isPending}>
              {isPending ? (isEditing ? "Saving…" : "Adding…") : isEditing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Targets editor
// ---------------------------------------------------------------------------

interface TargetRow {
  functionalClass: string;
  programId: string;
  pctDisplay: string;
  weightBasisPoints: number;
}

function defaultTargetRow(): TargetRow {
  return { functionalClass: "program", programId: "", pctDisplay: "", weightBasisPoints: 0 };
}

function targetsToRows(targets: AllocationTarget[] | undefined): TargetRow[] {
  if (!targets || targets.length === 0) return [defaultTargetRow()];
  return targets.map((t) => ({
    functionalClass: t.functionalClass,
    programId: t.programId ?? "",
    pctDisplay: String(bpToPercent(t.weightBasisPoints)),
    weightBasisPoints: t.weightBasisPoints,
  }));
}

interface TargetsEditorProps {
  baseId: string;
  onClose: () => void;
}

export function TargetsEditor({ baseId, onClose }: TargetsEditorProps) {
  const targetsQuery = useAllocationTargets(baseId);
  const programsQuery = usePrograms({
    page: 1,
    pageSize: 100,
    sortBy: "name",
    sortOrder: "asc",
  });
  const setTargets = useSetAllocationTargets();

  const programs = programsQuery.data?.data ?? [];

  const [draftRows, setDraftRows] = useState<TargetRow[] | null>(null);
  const rows = draftRows ?? targetsToRows(targetsQuery.data);

  const [error, setError] = useState<string | null>(null);
  const totalBp = sumWeightsBp(rows.map((r) => r.weightBasisPoints));
  const totalPct = bpToPercent(totalBp);
  const totalIsExact = totalBp === 10000;

  function updateRow(i: number, field: keyof TargetRow, value: string) {
    setDraftRows((prev) =>
      (prev ?? rows).map((row, idx) => {
        if (idx !== i) return row;
        if (field === "pctDisplay") {
          const parsed = parseFloat(value);
          const bp = isNaN(parsed) ? 0 : percentToBp(parsed);
          return { ...row, pctDisplay: value, weightBasisPoints: bp };
        }
        return { ...row, [field]: value };
      }),
    );
  }

  function addRow() {
    setDraftRows((prev) => [...(prev ?? rows), defaultTargetRow()]);
  }

  function removeRow(i: number) {
    setDraftRows((prev) => (prev ?? rows).filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    setError(null);
    if (!totalIsExact) {
      setError("Weights must total exactly 100%.");
      return;
    }
    try {
      await setTargets.mutateAsync({
        baseId,
        data: {
          targets: rows.map((r) => ({
            functionalClass: r.functionalClass as "program" | "management" | "fundraising",
            programId: r.functionalClass === "program" && r.programId ? r.programId : undefined,
            weightBasisPoints: r.weightBasisPoints,
          })),
        },
      });
      onClose();
    } catch {
      setError("Unable to save targets.");
    }
  }

  if (targetsQuery.isLoading) {
    return (
      <div className="space-y-2 py-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Functional class</TableHead>
            <TableHead>Program</TableHead>
            <TableHead>Weight %</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              <TableCell>
                <Select
                  value={row.functionalClass}
                  onValueChange={(v) => updateRow(i, "functionalClass", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="program">Program</SelectItem>
                    <SelectItem value="management">Management &amp; General</SelectItem>
                    <SelectItem value="fundraising">Fundraising</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                {row.functionalClass === "program" ? (
                  <Select
                    value={row.programId || "__none__"}
                    onValueChange={(v) => updateRow(i, "programId", v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All programs" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">All programs</SelectItem>
                      {programs.map((p: { id: string; name: string }) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={row.pctDisplay}
                  onChange={(e) => updateRow(i, "pctDisplay", e.target.value)}
                  className="w-24"
                />
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                  onClick={() => removeRow(i)}
                  aria-label="Remove row"
                >
                  <Trash2 className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={2} className="font-semibold">
              Total
            </TableCell>
            <TableCell
              className={`font-semibold font-mono ${totalIsExact ? "text-success" : "text-destructive"}`}
            >
              {totalPct.toFixed(2)}%
            </TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>
      {!totalIsExact && (
        <p className="text-sm text-destructive">Weights must total exactly 100%.</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={addRow}>
          <PlusIcon className="mr-2 size-4" />
          Add row
        </Button>
        <Button
          type="button"
          size="sm"
          className="rounded-full"
          disabled={!totalIsExact || setTargets.isPending}
          onClick={() => void handleSave()}
        >
          {setTargets.isPending ? "Saving…" : "Save targets"}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="rounded-full" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bind rule dialog
// ---------------------------------------------------------------------------

interface BindRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bases: AllocationBase[];
}

interface RuleFormState {
  accountId: string;
  baseId: string;
}

export function BindRuleDialog({ open, onOpenChange, bases }: BindRuleDialogProps) {
  const [form, setForm] = useState<RuleFormState>({ accountId: "", baseId: "" });
  const [error, setError] = useState<string | null>(null);

  const accountsQuery = useAccounts({ type: "expense", isActive: true, pageSize: 200 });
  const accounts =
    (accountsQuery.data as { data?: Array<{ id: string; code: string; name: string }> })?.data ??
    [];
  const createRule = useCreateAllocationRule();

  function handleOpenChange(val: boolean) {
    if (!val) {
      setForm({ accountId: "", baseId: "" });
      setError(null);
    }
    onOpenChange(val);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.accountId || !form.baseId) {
      setError("Select both an account and a base.");
      return;
    }
    try {
      await createRule.mutateAsync({ ...form, status: "active" });
      handleOpenChange(false);
    } catch {
      setError("Unable to bind rule.");
    }
  }

  const activeBases = bases.filter((b) => b.status === "active");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bind account to allocation base</DialogTitle>
          <DialogDescription>
            Pick the shared expense account and the base to use.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="rule-account">Expense account</Label>
            <Select
              value={form.accountId}
              onValueChange={(v) => setForm((p) => ({ ...p, accountId: v }))}
            >
              <SelectTrigger id="rule-account">
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.code} — {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="rule-base">Allocation base</Label>
            <Select
              value={form.baseId}
              onValueChange={(v) => setForm((p) => ({ ...p, baseId: v }))}
            >
              <SelectTrigger id="rule-base">
                <SelectValue placeholder="Select base" />
              </SelectTrigger>
              <SelectContent>
                {activeBases.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name} ({METHOD_LABELS[b.method as AllocationMethod]})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" className="rounded-full" disabled={createRule.isPending}>
              {createRule.isPending ? "Binding…" : "Bind account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Allocated SFE preview
// ---------------------------------------------------------------------------

export function AllocatedPreview() {
  const now = new Date();
  const defaultFrom = `${now.getFullYear()}-01-01`;
  const defaultTo = now.toISOString().slice(0, 10);

  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [generated, setGenerated] = useState(false);

  const fromIso = `${fromDate}T00:00:00.000Z`;
  const toIso = `${toDate}T23:59:59.999Z`;

  const reportQuery = useAllocatedFunctionalExpenses(
    generated ? fromIso : "",
    generated ? toIso : "",
  );

  const report = reportQuery.data;
  const programBreakdown = report?.programBreakdown ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label htmlFor="preview-from">From</Label>
          <Input
            id="preview-from"
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setGenerated(false);
            }}
            className="w-44"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="preview-to">To</Label>
          <Input
            id="preview-to"
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setGenerated(false);
            }}
            className="w-44"
          />
        </div>
        <Button
          className="rounded-full"
          onClick={() => setGenerated(true)}
          disabled={!fromDate || !toDate || reportQuery.isLoading}
        >
          {reportQuery.isLoading ? "Generating…" : "Preview"}
        </Button>
      </div>

      {reportQuery.isError && (
        <Alert variant="destructive" title="Unable to load preview.">
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => void reportQuery.refetch()}
          >
            Try again
          </Button>
        </Alert>
      )}

      {reportQuery.isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {report && !reportQuery.isLoading && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {formatUtcCalendarDate(fromIso)} — {formatUtcCalendarDate(toIso)}
          </p>
          {report.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No allocated expenses in this period.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Program</TableHead>
                  <TableHead className="text-right">M&amp;G</TableHead>
                  <TableHead className="text-right">Fundraising</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((row) => (
                  <React.Fragment key={row.accountId}>
                    <TableRow>
                      <TableCell>{row.name}</TableCell>
                      <TableCell className="text-right font-mono">
                        {row.program > 0 ? formatCurrency(row.program) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {row.management > 0 ? formatCurrency(row.management) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {row.fundraising > 0 ? formatCurrency(row.fundraising) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(row.total)}
                      </TableCell>
                    </TableRow>
                    {row.programBreakdown &&
                      row.programBreakdown.length > 0 &&
                      row.programBreakdown.map((pb) => (
                        <TableRow key={pb.programId} className="bg-muted/30">
                          <TableCell className="pl-8 text-sm text-muted-foreground">
                            {pb.programName}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatCurrency(pb.amountCents)}
                          </TableCell>
                          <TableCell colSpan={3} />
                        </TableRow>
                      ))}
                  </React.Fragment>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="font-semibold">Totals</TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {formatCurrency(report.totals.program)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {formatCurrency(report.totals.management)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {formatCurrency(report.totals.fundraising)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {formatCurrency(report.totals.total)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
          {programBreakdown.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Program breakdown</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Program</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {programBreakdown.map((program) => (
                    <TableRow key={program.programId ?? "__unassigned__"}>
                      <TableCell>{program.programName}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(program.amountCents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function FunctionalExpenseAllocationPage() {
  const session = useSession();
  const plan = session.effectivePlanTier;
  const canManageAccounting = canAccessFeature(
    session.memberRole,
    session.memberPermissions,
    "accounting",
    "manage",
  );

  const [baseDialogOpen, setBaseDialogOpen] = useState(false);
  const [editingBase, setEditingBase] = useState<AllocationBase | null>(null);
  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);

  const basesQuery = useAllocationBases();
  const rulesQuery = useAllocationRules();
  const deleteBase = useDeleteAllocationBase();
  const deleteRule = useDeleteAllocationRule();

  const bases = basesQuery.data ?? [];
  const rules = rulesQuery.data ?? [];

  if (!canManageAccounting) {
    return (
      <AccessDeniedState
        title="You need accounting access."
        description="Ask an admin to update your team permissions before opening the allocation studio."
      />
    );
  }

  if (!canUseFunctionalExpenseAllocation(plan)) {
    return <UpgradeCard />;
  }

  const selectedBase = bases.find((b) => b.id === selectedBaseId) ?? null;

  function handleEditBase(base: AllocationBase) {
    setEditingBase(base);
    setBaseDialogOpen(true);
  }

  function handleDeleteBase(id: string) {
    void deleteBase.mutateAsync(id);
  }

  function handleDeleteRule(id: string) {
    void deleteRule.mutateAsync(id);
  }

  return (
    <PageShell>
      <PageHeader
        variant="workbench"
        title="Expense Allocation Studio"
        actions={
          <Button
            className="rounded-full"
            onClick={() => {
              setEditingBase(null);
              setBaseDialogOpen(true);
            }}
          >
            <PlusIcon className="mr-2 size-4" />
            Add allocation base
          </Button>
        }
      />

      {/* Allocation Bases */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Allocation Bases
        </h2>

        {basesQuery.isError && (
          <Alert variant="destructive" title="Unable to load allocation bases." />
        )}

        {basesQuery.isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {!basesQuery.isLoading && bases.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No allocation bases yet. Create one to start splitting pooled expenses.
          </p>
        )}

        {!basesQuery.isLoading && bases.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {bases.map((base) => (
                <TableRow key={base.id} className={selectedBaseId === base.id ? "bg-muted/30" : ""}>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="rounded-full px-3"
                      aria-expanded={selectedBaseId === base.id}
                      aria-label={`Edit targets for ${base.name}`}
                      onClick={() => setSelectedBaseId(selectedBaseId === base.id ? null : base.id)}
                    >
                      {base.name}
                    </Button>
                  </TableCell>
                  <TableCell>
                    {METHOD_LABELS[base.method as AllocationMethod] ?? base.method}
                  </TableCell>
                  <TableCell>
                    <Badge variant={base.status === "active" ? "default" : "secondary"}>
                      {base.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full"
                        aria-label="Edit base"
                        onClick={() => handleEditBase(base)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full"
                        aria-label="Delete base"
                        onClick={() => handleDeleteBase(base.id)}
                        disabled={deleteBase.isPending}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Targets editor (inline, below selected base) */}
        {selectedBase && (
          <div className="rounded-lg border border-border bg-muted/10 p-4">
            <h3 className="mb-3 text-sm font-semibold">
              Targets for &ldquo;{selectedBase.name}&rdquo;
            </h3>
            <TargetsEditor
              key={selectedBase.id}
              baseId={selectedBase.id}
              onClose={() => setSelectedBaseId(null)}
            />
          </div>
        )}
      </section>

      {/* Allocation Rules */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Account Rules
          </h2>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => setRuleDialogOpen(true)}
          >
            <Link className="mr-2 size-4" />
            Bind account
          </Button>
        </div>

        {rulesQuery.isError && <Alert variant="destructive" title="Unable to load rules." />}

        {rulesQuery.isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {!rulesQuery.isLoading && rules.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No rules yet. Bind an expense account to an allocation base to automate splitting.
          </p>
        )}

        {!rulesQuery.isLoading && rules.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Base</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule: AllocationRule) => (
                <TableRow key={rule.id}>
                  <TableCell>{rule.accountName ?? rule.accountId}</TableCell>
                  <TableCell>{rule.baseName ?? rule.baseId}</TableCell>
                  <TableCell>
                    <Badge variant={rule.status === "active" ? "default" : "secondary"}>
                      {rule.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-full"
                      aria-label="Remove rule"
                      onClick={() => handleDeleteRule(rule.id)}
                      disabled={deleteRule.isPending}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {/* Allocated SFE Preview */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Allocated Expense Preview
        </h2>
        <AllocatedPreview />
      </section>

      {/* Dialogs */}
      <BaseDialog
        key={editingBase?.id ?? "new"}
        open={baseDialogOpen}
        onOpenChange={(v) => {
          setBaseDialogOpen(v);
          if (!v) setEditingBase(null);
        }}
        initial={editingBase}
      />

      <BindRuleDialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen} bases={bases} />
    </PageShell>
  );
}
