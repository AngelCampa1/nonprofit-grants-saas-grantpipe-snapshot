import React, { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@grantpipe/ui";
import {
  usePaymentRequest,
  usePaymentRequestMutations,
  useEligibleExpenses,
  useIndirectCostRules,
} from "../../../hooks/use-payments";
import {
  formatCurrency,
  formatPaymentRequestStatus,
  formatPaymentRequestType,
  humanizeEnum,
} from "../../../lib/format";
import { RetryButton } from "../../../components/retry-button";
import { EntityActivitySection } from "../../../components/entity-activity-section";
import { EntityDocumentsSection } from "../../../components/entity-documents-section";
import { useSession } from "../../../hooks/use-session";
import { canAccessFeature } from "../../../lib/access-control";
import { captureDetailTabViewed } from "../../../lib/record-discovery-analytics";
import {
  PAYMENT_REQUEST_TYPES,
  ADJUSTMENT_KINDS,
  ADJUSTMENT_KIND_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  STATUS_TRANSITIONS,
  INDIRECT_COST_BASES,
  INDIRECT_COST_BASE_LABELS,
  hasIndirectCostRules,
  type PaymentRequestStatus,
  type IndirectCostBase,
  type AdjustmentKind,
  type PaymentMethod,
  type UniformGuidanceGuardrailResult,
} from "@grantpipe/shared";

export const Route = createFileRoute("/_authenticated/payments/$requestId")({
  component: PaymentRequestDetailPage,
});

type RequestData = {
  id: string;
  requestNumber?: string | null;
  status?: string | null;
  type?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  funderReference?: string | null;
  notes?: string | null;
  autoPostJournalEntry?: boolean | null;
  requestedAmountCents?: number | null;
  approvedAmountCents?: number | null;
  lines?: LineRow[];
  adjustments?: AdjustmentRow[];
  payments?: PaymentRow[];
  grant?: { id?: string; name?: string } | null;
};

type LineRow = {
  id: string;
  description?: string | null;
  category?: string | null;
  amountCents?: number | null;
  approvedAmountCents?: number | null;
  rejectionReason?: string | null;
};

type AdjustmentRow = {
  id: string;
  kind?: string | null;
  amountCents?: number | null;
  reason?: string | null;
  createdAt?: string | null;
};

type PaymentRow = {
  id: string;
  receivedDate?: string | null;
  amountCents?: number | null;
  method?: string | null;
  referenceNumber?: string | null;
};

type EligibleExpense = {
  id: string;
  description?: string | null;
  amountCents?: number | null;
  date?: string | null;
  category?: string | null;
};

function formatShortDate(value: string | null | undefined): string {
  if (!value) return "--";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "--";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

function formatIndirectBase(base: string | null | undefined): string {
  if (!base) return "--";
  return INDIRECT_COST_BASE_LABELS[base as IndirectCostBase] ?? base;
}

function formatAdjustmentKind(kind: string | null | undefined): string {
  if (!kind) return "--";
  return ADJUSTMENT_KIND_LABELS[kind as AdjustmentKind] ?? humanizeEnum(kind);
}

function formatPaymentMethod(method: string | null | undefined): string {
  if (!method) return "--";
  return PAYMENT_METHOD_LABELS[method as PaymentMethod] ?? humanizeEnum(method);
}

function toIsoStartOfDay(value: string): string {
  return `${value}T00:00:00.000Z`;
}

function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

type IndirectRule = {
  id: string;
  grantId?: string | null;
  base?: string | null;
  rateBasisPoints?: number | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
};

type RecomputeResult = {
  ruleId: string;
  base: string;
  rateBasisPoints: number;
  baseAmountCents: number;
  indirectAmountCents: number;
} | null;

function IndirectCostPanel({
  requestId,
  grantId,
  canEdit,
}: {
  requestId: string;
  grantId?: string;
  canEdit: boolean;
}) {
  const rulesQuery = useIndirectCostRules({ grantId });
  const mutations = usePaymentRequestMutations(requestId);
  const [recomputeError, setRecomputeError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<IndirectRule | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [confirmRemoveRuleId, setConfirmRemoveRuleId] = useState<string | null>(null);

  const rules = ((rulesQuery.data as { data?: IndirectRule[] } | undefined)?.data ??
    []) as IndirectRule[];
  const recomputeResult = mutations.recomputeIndirect.data as RecomputeResult | undefined;
  const hasRecomputed = mutations.recomputeIndirect.isSuccess;

  function openCreate() {
    setEditingRule(null);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(rule: IndirectRule) {
    setEditingRule(rule);
    setFormError(null);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Indirect cost calculation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Apply the active indirect cost rule to this request&apos;s direct lines under 2 CFR
            200.414. The calculation is a preview and is not saved as a line.
          </p>
          {canEdit ? (
            <Button
              type="button"
              size="sm"
              onClick={async () => {
                setRecomputeError(null);
                try {
                  await mutations.recomputeIndirect.mutateAsync();
                } catch (err) {
                  setRecomputeError(
                    err instanceof Error ? err.message : "Unable to calculate indirect cost.",
                  );
                }
              }}
              disabled={mutations.recomputeIndirect.isPending}
            >
              {mutations.recomputeIndirect.isPending ? "Calculating…" : "Calculate indirect cost"}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              You do not have permission to calculate indirect cost for this request.
            </p>
          )}
          {recomputeError ? (
            <p role="alert" className="text-sm text-destructive">
              {recomputeError}
            </p>
          ) : null}
          {hasRecomputed && !recomputeError ? (
            recomputeResult ? (
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Basis</dt>
                  <dd className="text-sm font-medium">
                    {formatIndirectBase(recomputeResult.base)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Rate</dt>
                  <dd className="text-sm font-medium tabular-nums">
                    {(recomputeResult.rateBasisPoints / 100).toFixed(2)}%
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Base amount</dt>
                  <dd className="text-sm font-mono tabular-nums">
                    {formatCurrency(recomputeResult.baseAmountCents)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Indirect amount</dt>
                  <dd className="text-sm font-mono tabular-nums">
                    {formatCurrency(recomputeResult.indirectAmountCents)}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                No active indirect cost rule applies to this request.
              </p>
            )
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Indirect cost rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {canEdit ? (
            <Dialog
              open={dialogOpen}
              onOpenChange={(open) => {
                setDialogOpen(open);
                if (!open) {
                  setEditingRule(null);
                  setFormError(null);
                }
              }}
            >
              <DialogTrigger asChild>
                <Button size="sm" onClick={openCreate}>
                  Add rule
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingRule ? "Edit indirect cost rule" : "Add indirect cost rule"}
                  </DialogTitle>
                  <DialogDescription>
                    Define the basis and rate used to calculate indirect cost.
                  </DialogDescription>
                </DialogHeader>
                <form
                  className="space-y-4"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    const base = String(form.get("base") ?? "").trim();
                    const rateRaw = String(form.get("ratePercent") ?? "").trim();
                    const effectiveFrom = String(form.get("effectiveFrom") ?? "").trim();
                    const effectiveTo = String(form.get("effectiveTo") ?? "").trim();
                    const orgWide = form.get("orgWide") === "on";
                    const ratePercent = Number(rateRaw);
                    if (!rateRaw || !Number.isFinite(ratePercent) || ratePercent <= 0) {
                      setFormError("Enter a rate greater than zero.");
                      return;
                    }
                    if (!effectiveFrom) {
                      setFormError("Select an effective-from date.");
                      return;
                    }
                    const rateBasisPoints = Math.round(ratePercent * 100);
                    try {
                      if (editingRule) {
                        await mutations.updateIndirectRule.mutateAsync({
                          ruleId: editingRule.id,
                          data: {
                            base: base as IndirectCostBase,
                            rateBasisPoints,
                            effectiveFrom: toIsoStartOfDay(effectiveFrom),
                            ...(effectiveTo ? { effectiveTo: toIsoStartOfDay(effectiveTo) } : {}),
                            grantId: orgWide ? null : (grantId ?? null),
                          },
                        });
                      } else {
                        await mutations.createIndirectRule.mutateAsync({
                          base: base as IndirectCostBase,
                          rateBasisPoints,
                          effectiveFrom: toIsoStartOfDay(effectiveFrom),
                          ...(effectiveTo ? { effectiveTo: toIsoStartOfDay(effectiveTo) } : {}),
                          ...(orgWide || !grantId ? {} : { grantId }),
                        });
                      }
                      setFormError(null);
                      setEditingRule(null);
                      setDialogOpen(false);
                    } catch (err) {
                      setFormError(
                        err instanceof Error ? err.message : "Unable to save indirect cost rule.",
                      );
                    }
                  }}
                >
                  <div className="space-y-1">
                    <Label htmlFor="rule-base">Basis</Label>
                    <Select name="base" required defaultValue={editingRule?.base ?? ""}>
                      <SelectTrigger id="rule-base">
                        <SelectValue placeholder="Select basis" />
                      </SelectTrigger>
                      <SelectContent>
                        {INDIRECT_COST_BASES.map((b) => (
                          <SelectItem key={b} value={b}>
                            {formatIndirectBase(b)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="rule-rate">Rate (percent)</Label>
                    <Input
                      id="rule-rate"
                      name="ratePercent"
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      defaultValue={
                        editingRule?.rateBasisPoints != null
                          ? String(editingRule.rateBasisPoints / 100)
                          : ""
                      }
                      placeholder="15"
                    />
                    <p className="text-xs text-muted-foreground">
                      De minimis rate under 2 CFR 200.414(f) is 15%.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="rule-from">Effective from</Label>
                    <Input
                      id="rule-from"
                      name="effectiveFrom"
                      type="date"
                      required
                      defaultValue={toDateInput(editingRule?.effectiveFrom)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="rule-to">Effective to (optional)</Label>
                    <Input
                      id="rule-to"
                      name="effectiveTo"
                      type="date"
                      defaultValue={toDateInput(editingRule?.effectiveTo)}
                    />
                  </div>
                  {grantId ? (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="orgWide"
                        defaultChecked={editingRule ? editingRule.grantId == null : false}
                      />
                      Apply org-wide (all grants)
                    </label>
                  ) : null}
                  {formError ? (
                    <p role="alert" className="text-sm text-destructive">
                      {formError}
                    </p>
                  ) : null}
                  <Button
                    className="w-full"
                    type="submit"
                    disabled={
                      mutations.createIndirectRule.isPending ||
                      mutations.updateIndirectRule.isPending
                    }
                  >
                    {editingRule ? "Save rule" : "Create rule"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          ) : null}

          {rowError ? (
            <p role="alert" className="text-sm text-destructive">
              {rowError}
            </p>
          ) : null}

          {rulesQuery.isLoading ? (
            <Skeleton className="h-24 rounded-lg" />
          ) : rulesQuery.isError ? (
            <p className="text-sm text-destructive">Unable to load indirect cost rules.</p>
          ) : rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">No indirect cost rules defined.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border/60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/40">
                    <th className="px-4 py-3 text-left font-medium">Basis</th>
                    <th className="px-4 py-3 text-right font-medium">Rate</th>
                    <th className="px-4 py-3 text-left font-medium">Scope</th>
                    <th className="px-4 py-3 text-left font-medium">Effective from</th>
                    <th className="px-4 py-3 text-left font-medium">Effective to</th>
                    {canEdit ? <th className="px-4 py-3 text-left font-medium">Actions</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {rules.map((rule) => (
                    <tr key={rule.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">{formatIndirectBase(rule.base)}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {rule.rateBasisPoints != null
                          ? `${(rule.rateBasisPoints / 100).toFixed(2)}%`
                          : "--"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {rule.grantId ? "This grant" : "Org-wide"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatShortDate(rule.effectiveFrom)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {rule.effectiveTo ? formatShortDate(rule.effectiveTo) : "--"}
                      </td>
                      {canEdit ? (
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => openEdit(rule)}
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setRowError(null);
                                setConfirmRemoveRuleId(rule.id);
                              }}
                              disabled={mutations.deleteIndirectRule.isPending}
                            >
                              Remove
                            </Button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      {confirmRemoveRuleId !== null ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirmRemoveRuleId(null);
          }}
          title="Remove indirect cost rule?"
          description="This cannot be undone."
          confirmLabel="Remove"
          isPending={mutations.deleteIndirectRule.isPending}
          onConfirm={() => {
            const ruleId = confirmRemoveRuleId;
            setConfirmRemoveRuleId(null);
            setRowError(null);
            void mutations.deleteIndirectRule.mutateAsync(ruleId).catch((err) => {
              setRowError(err instanceof Error ? err.message : "Unable to delete rule.");
            });
          }}
        />
      ) : null}
    </div>
  );
}

function AddLineDialog({ requestId, onClose }: { requestId: string; onClose: () => void }) {
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [guardrailPreview, setGuardrailPreview] = useState<UniformGuidanceGuardrailResult | null>(
    null,
  );
  const eligibleQuery = useEligibleExpenses(requestId, {});
  const mutations = usePaymentRequestMutations(requestId);
  const expenses = ((eligibleQuery.data as { data?: EligibleExpense[] } | undefined)?.data ??
    []) as EligibleExpense[];

  const selectedExpense = expenses.find((e) => e.id === selectedExpenseId) ?? null;
  const selectedExpenseAmountCents = selectedExpense?.amountCents ?? 0;
  const previewGuardrails = mutations.previewUniformGuidanceGuardrails;
  const previewGuardrailsAsync = previewGuardrails.mutateAsync;
  const isBlocked = guardrailPreview?.status === "blocked";

  useEffect(() => {
    let active = true;
    if (!selectedExpenseId) return;

    void previewGuardrailsAsync({
      expenseId: selectedExpenseId,
      amountCents: selectedExpenseAmountCents,
      category: "direct",
      sortOrder: 0,
    })
      .then((result) => {
        if (!active) return;
        setGuardrailPreview(result as UniformGuidanceGuardrailResult);
      })
      .catch((err) => {
        if (!active) return;
        setPreviewError(err instanceof Error ? err.message : "Unable to check this line.");
      });

    return () => {
      active = false;
    };
  }, [previewGuardrailsAsync, selectedExpenseId, selectedExpenseAmountCents]);

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!selectedExpense) {
          setError("Select an expense to add.");
          return;
        }
        if (isBlocked) {
          setError("Fix this item before adding the line.");
          return;
        }
        try {
          await mutations.addLine.mutateAsync({
            expenseId: selectedExpense.id,
            amountCents: selectedExpense.amountCents ?? 0,
            category: "direct",
            sortOrder: 0,
          });
          setError(null);
          onClose();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Unable to add line.");
        }
      }}
    >
      {eligibleQuery.isLoading ? (
        <Skeleton className="h-32 rounded-lg" />
      ) : eligibleQuery.isError ? (
        <p className="text-sm text-destructive">Unable to load eligible expenses.</p>
      ) : expenses.length === 0 ? (
        <p className="text-sm text-muted-foreground">No eligible expenses found for this grant.</p>
      ) : (
        <div className="max-h-64 overflow-y-auto rounded-2xl border border-border/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/40">
                <th className="px-3 py-2 text-left font-medium">Select</th>
                <th className="px-3 py-2 text-left font-medium">Description</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 text-left font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {expenses.map((expense) => (
                <tr
                  key={expense.id}
                  className={
                    selectedExpenseId === expense.id ? "bg-primary/10" : "hover:bg-muted/20"
                  }
                >
                  <td className="px-3 py-2">
                    <input
                      type="radio"
                      name="expenseId"
                      value={expense.id}
                      checked={selectedExpenseId === expense.id}
                      onChange={() => {
                        setSelectedExpenseId(expense.id);
                        setGuardrailPreview(null);
                        setPreviewError(null);
                        setError(null);
                      }}
                      aria-label={`Select expense ${expense.description ?? expense.id}`}
                      className="focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    />
                  </td>
                  <td className="px-3 py-2">{expense.description ?? "--"}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {formatCurrency(expense.amountCents)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatShortDate(expense.date)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {mutations.previewUniformGuidanceGuardrails.isPending ? (
        <p className="text-sm text-muted-foreground">Checking award rules…</p>
      ) : null}
      {previewError ? (
        <p role="alert" className="text-sm text-destructive">
          {previewError}
        </p>
      ) : null}
      {guardrailPreview?.applicable && guardrailPreview.findings.length > 0 ? (
        <Alert variant={guardrailPreview.status === "blocked" ? "destructive" : "warning"}>
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {guardrailPreview.status === "blocked"
                ? "Cost review blocked"
                : "Cost may need review"}
            </p>
            <ul className="space-y-1 text-sm">
              {guardrailPreview.findings.map((finding) => (
                <li key={finding.code}>{finding.message}</li>
              ))}
            </ul>
          </div>
        </Alert>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button
        className="w-full"
        type="submit"
        disabled={!selectedExpense || isBlocked || mutations.addLine.isPending}
      >
        {mutations.addLine.isPending ? "Adding…" : "Add line"}
      </Button>
    </form>
  );
}

export function PaymentRequestDetailPage() {
  const { requestId } = Route.useParams();
  const { memberRole, memberPermissions, effectivePlanTier } = useSession();
  const requestQuery = usePaymentRequest(requestId);
  const mutations = usePaymentRequestMutations(requestId);

  const [transitionOpen, setTransitionOpen] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [addLineOpen, setAddLineOpen] = useState(false);
  const [addAdjustmentOpen, setAddAdjustmentOpen] = useState(false);
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmRemoveLineId, setConfirmRemoveLineId] = useState<string | null>(null);
  const [confirmRemovePaymentId, setConfirmRemovePaymentId] = useState<string | null>(null);
  const previousTabRef = React.useRef("overview");

  function runRowAction(action: () => Promise<unknown>) {
    setActionError(null);
    return action().catch((error) => {
      setActionError(error instanceof Error ? error.message : "Unable to complete this action.");
    });
  }

  const request = requestQuery.data as RequestData | undefined;

  if (requestQuery.isError && !request) {
    return (
      <PageShell>
        <p className="text-sm text-destructive">Unable to load payment request.</p>
        <RetryButton query={requestQuery} />
      </PageShell>
    );
  }

  if (requestQuery.isLoading || !request) {
    return (
      <PageShell>
        <Skeleton className="h-8 w-64 mb-1" />
        <Skeleton className="h-4 w-32 mb-6" />
        <Skeleton className="h-10 w-full mb-6" />
        <Skeleton className="h-40 rounded-lg" />
      </PageShell>
    );
  }

  const currentStatus = (request.status ?? "draft") as PaymentRequestStatus;
  const allowedTransitions = STATUS_TRANSITIONS[currentStatus] ?? [];
  const canApproveStatuses = new Set(["approved", "partially_approved"]);
  const isDraft = currentStatus === "draft";
  const canEditPayments = canAccessFeature(memberRole, memberPermissions, "payments", "edit");
  const canTransitionStatus = canEditPayments && allowedTransitions.length > 0;
  const canEditDraft = canEditPayments && isDraft;
  const canAddAdjustment =
    canEditPayments && !["paid", "closed", "rejected"].includes(currentStatus);
  const canRecordPayment =
    canEditPayments && (currentStatus === "approved" || currentStatus === "partially_approved");
  const canUseIndirect = hasIndirectCostRules(effectivePlanTier);

  const lines = (request.lines ?? []) as LineRow[];
  const adjustments = (request.adjustments ?? []) as AdjustmentRow[];
  const payments = (request.payments ?? []) as PaymentRow[];

  return (
    <PageShell>
      <PageHeader
        variant="workbench"
        title={`Request #${request.requestNumber ?? requestId.slice(0, 8)}`}
        breadcrumb={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/payments">Payments</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>
                  Request #{request.requestNumber ?? requestId.slice(0, 8)}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline">{formatPaymentRequestStatus(currentStatus)}</Badge>
            {canTransitionStatus ? (
              <Dialog
                open={transitionOpen}
                onOpenChange={(open) => {
                  setTransitionOpen(open);
                  if (!open) setTransitionError(null);
                }}
              >
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">
                    Transition status
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Transition status</DialogTitle>
                    <DialogDescription>
                      Move this request from{" "}
                      <strong>{formatPaymentRequestStatus(currentStatus)}</strong> to a new status.
                    </DialogDescription>
                  </DialogHeader>
                  <form
                    className="space-y-4"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      const toStatus = String(form.get("toStatus") ?? "").trim();
                      const approvedRaw = String(form.get("approvedAmountCents") ?? "").trim();
                      const approvedDollars = approvedRaw.length > 0 ? Number(approvedRaw) : null;
                      const requiresApprovedAmount = canApproveStatuses.has(toStatus);
                      if (requiresApprovedAmount && approvedDollars === null) {
                        setTransitionError("Enter the approved amount to approve this request.");
                        return;
                      }
                      try {
                        await mutations.transitionRequest.mutateAsync({
                          fromStatus: currentStatus as PaymentRequestStatus,
                          toStatus: toStatus as PaymentRequestStatus,
                          ...(requiresApprovedAmount &&
                          approvedDollars !== null &&
                          Number.isFinite(approvedDollars)
                            ? { approvedAmountCents: Math.round(approvedDollars * 100) }
                            : {}),
                        });
                        setTransitionError(null);
                        setTransitionOpen(false);
                      } catch (err) {
                        setTransitionError(
                          err instanceof Error ? err.message : "Unable to transition status.",
                        );
                      }
                    }}
                  >
                    <div className="space-y-1">
                      <Label htmlFor="transition-to-status">New status</Label>
                      <Select name="toStatus" required>
                        <SelectTrigger id="transition-to-status">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          {allowedTransitions.map((s) => (
                            <SelectItem key={s} value={s}>
                              {formatPaymentRequestStatus(s)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="approved-amount">Approved amount (dollars)</Label>
                      <Input
                        id="approved-amount"
                        name="approvedAmountCents"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Required when approving"
                      />
                      <p className="text-xs text-muted-foreground">
                        Required when approving or partially approving a request.
                      </p>
                    </div>
                    {transitionError ? (
                      <p role="alert" className="text-sm text-destructive">
                        {transitionError}
                      </p>
                    ) : null}
                    <Button
                      className="w-full"
                      type="submit"
                      disabled={mutations.transitionRequest.isPending}
                    >
                      {mutations.transitionRequest.isPending ? "Saving…" : "Apply transition"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            ) : null}
          </div>
        }
      />

      {actionError ? (
        <Alert variant="destructive" title="Unable to complete the action">
          <p>{actionError}</p>
        </Alert>
      ) : null}
      <Tabs
        defaultValue="overview"
        className="flex-col gap-4"
        onValueChange={(value) => {
          captureDetailTabViewed("payments", value, previousTabRef.current);
          previousTabRef.current = value;
        }}
      >
        <TabsList variant="record">
          <TabsTrigger className="shrink-0 rounded-full px-3" value="overview">
            Overview
          </TabsTrigger>
          <TabsTrigger className="shrink-0 rounded-full px-3" value="lines">
            Lines
          </TabsTrigger>
          <TabsTrigger className="shrink-0 rounded-full px-3" value="adjustments">
            Adjustments
          </TabsTrigger>
          <TabsTrigger className="shrink-0 rounded-full px-3" value="payments">
            Payments
          </TabsTrigger>
          <TabsTrigger className="shrink-0 rounded-full px-3" value="activity">
            Activity
          </TabsTrigger>
          <TabsTrigger className="shrink-0 rounded-full px-3" value="documents">
            Documents
          </TabsTrigger>
          {canUseIndirect ? (
            <TabsTrigger className="shrink-0 rounded-full px-3" value="indirect">
              Indirect
            </TabsTrigger>
          ) : null}
        </TabsList>

        {/* Overview tab */}
        <TabsContent className="w-full" value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Request details</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!canEditDraft) return;
                  const form = new FormData(event.currentTarget);
                  const type = String(form.get("type") ?? "").trim();
                  try {
                    await mutations.updateRequest.mutateAsync({
                      type: (PAYMENT_REQUEST_TYPES as readonly string[]).includes(type)
                        ? (type as (typeof PAYMENT_REQUEST_TYPES)[number])
                        : undefined,
                      notes: String(form.get("notes") ?? "").trim() || undefined,
                      funderReference:
                        String(form.get("funderReference") ?? "").trim() || undefined,
                    });
                  } catch {
                    // error is shown via toast
                  }
                }}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Grant</Label>
                    <p className="text-sm text-foreground">
                      {request.grant ? (
                        <Link
                          to="/grants/$grantId"
                          params={{ grantId: request.grant.id ?? "" }}
                          className="text-primary hover:underline"
                        >
                          {request.grant.name}
                        </Link>
                      ) : (
                        "--"
                      )}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="req-type">Type</Label>
                    {canEditDraft ? (
                      <Select name="type" defaultValue={request.type ?? ""}>
                        <SelectTrigger id="req-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_REQUEST_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {formatPaymentRequestType(t)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm">
                        {request.type ? formatPaymentRequestType(request.type) : "--"}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label>Period start</Label>
                    <p className="text-sm text-muted-foreground">
                      {formatShortDate(request.periodStart)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label>Period end</Label>
                    <p className="text-sm text-muted-foreground">
                      {formatShortDate(request.periodEnd)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label>Requested</Label>
                    <p className="text-sm font-mono tabular-nums">
                      {formatCurrency(request.requestedAmountCents)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label>Approved</Label>
                    <p className="text-sm font-mono tabular-nums">
                      {formatCurrency(request.approvedAmountCents)}
                    </p>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="funder-ref">Funder reference</Label>
                  {canEditDraft ? (
                    <Input
                      id="funder-ref"
                      name="funderReference"
                      defaultValue={request.funderReference ?? ""}
                      placeholder="External reference number"
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {request.funderReference ?? "--"}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="req-notes">Notes</Label>
                  {canEditDraft ? (
                    <Textarea
                      id="req-notes"
                      name="notes"
                      defaultValue={request.notes ?? ""}
                      placeholder="Internal notes"
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">{request.notes ?? "--"}</p>
                  )}
                </div>
                {canEditDraft ? (
                  <Button type="submit" disabled={mutations.updateRequest.isPending}>
                    {mutations.updateRequest.isPending ? "Saving…" : "Save changes"}
                  </Button>
                ) : null}
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Lines tab */}
        <TabsContent className="w-full" value="lines">
          <div className="space-y-4">
            {canEditDraft ? (
              <Dialog
                open={addLineOpen}
                onOpenChange={(open) => {
                  setAddLineOpen(open);
                }}
              >
                <DialogTrigger asChild>
                  <Button size="sm">Add line</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add expense line</DialogTitle>
                    <DialogDescription>
                      Select an eligible expense to include in this payment request.
                    </DialogDescription>
                  </DialogHeader>
                  <AddLineDialog requestId={requestId} onClose={() => setAddLineOpen(false)} />
                </DialogContent>
              </Dialog>
            ) : null}
            {lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No lines added yet.{" "}
                {canEditDraft ? "Add an expense line to build the request." : ""}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-border/60">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/40">
                      <th className="px-4 py-3 text-left font-medium">Description</th>
                      <th className="px-4 py-3 text-left font-medium">Category</th>
                      <th className="px-4 py-3 text-right font-medium">Amount</th>
                      <th className="px-4 py-3 text-right font-medium">Approved</th>
                      <th className="px-4 py-3 text-left font-medium">Rejection reason</th>
                      {canEditDraft ? (
                        <th className="px-4 py-3 text-left font-medium">Actions</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {lines.map((line) => (
                      <tr key={line.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">{line.description ?? "--"}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {line.category ? humanizeEnum(line.category) : "--"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                          {formatCurrency(line.amountCents)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                          {line.approvedAmountCents != null
                            ? formatCurrency(line.approvedAmountCents)
                            : "--"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {line.rejectionReason ?? "--"}
                        </td>
                        {canEditDraft ? (
                          <td className="px-4 py-3">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setConfirmRemoveLineId(line.id);
                              }}
                              disabled={mutations.removeLine.isPending}
                            >
                              Remove
                            </Button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Adjustments tab */}
        <TabsContent className="w-full" value="adjustments">
          <div className="space-y-4">
            <Dialog
              open={addAdjustmentOpen}
              onOpenChange={(open) => {
                setAddAdjustmentOpen(open);
                if (!open) setAdjustmentError(null);
              }}
            >
              {canAddAdjustment && (
                <DialogTrigger asChild>
                  <Button size="sm">Add adjustment</Button>
                </DialogTrigger>
              )}
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add adjustment</DialogTitle>
                  <DialogDescription>
                    Record an adjustment (reduction, increase, or note) for this request.
                  </DialogDescription>
                </DialogHeader>
                <form
                  className="space-y-4"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    const kind = String(form.get("kind") ?? "").trim();
                    const amountRaw = String(form.get("amountDollars") ?? "").trim();
                    const reason = String(form.get("reason") ?? "").trim();
                    const amountDollars = amountRaw.length > 0 ? Number(amountRaw) : null;
                    try {
                      await mutations.createAdjustment.mutateAsync({
                        kind: kind as (typeof ADJUSTMENT_KINDS)[number],
                        reason,
                        ...(amountDollars !== null && Number.isFinite(amountDollars)
                          ? { amountCents: Math.round(amountDollars * 100) }
                          : {}),
                      });
                      setAdjustmentError(null);
                      setAddAdjustmentOpen(false);
                    } catch (err) {
                      setAdjustmentError(
                        err instanceof Error ? err.message : "Unable to create adjustment.",
                      );
                    }
                  }}
                >
                  <div className="space-y-1">
                    <Label htmlFor="adj-kind">Kind</Label>
                    <Select name="kind" required>
                      <SelectTrigger id="adj-kind">
                        <SelectValue placeholder="Select kind" />
                      </SelectTrigger>
                      <SelectContent>
                        {ADJUSTMENT_KINDS.map((k) => (
                          <SelectItem key={k} value={k}>
                            {formatAdjustmentKind(k)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="adj-amount">Amount (dollars, optional)</Label>
                    <Input
                      id="adj-amount"
                      name="amountDollars"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Leave blank for notes-only"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="adj-reason">Reason</Label>
                    <Textarea id="adj-reason" name="reason" required placeholder="Reason" />
                  </div>
                  {adjustmentError ? (
                    <p role="alert" className="text-sm text-destructive">
                      {adjustmentError}
                    </p>
                  ) : null}
                  <Button
                    className="w-full"
                    type="submit"
                    disabled={mutations.createAdjustment.isPending}
                  >
                    {mutations.createAdjustment.isPending ? "Saving…" : "Save adjustment"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>

            {adjustments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No adjustments recorded.</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-border/60">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/40">
                      <th className="px-4 py-3 text-left font-medium">Kind</th>
                      <th className="px-4 py-3 text-right font-medium">Amount</th>
                      <th className="px-4 py-3 text-left font-medium">Reason</th>
                      <th className="px-4 py-3 text-left font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {adjustments.map((adj) => (
                      <tr key={adj.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">{formatAdjustmentKind(adj.kind)}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                          {adj.amountCents != null ? formatCurrency(adj.amountCents) : "--"}
                        </td>
                        <td className="px-4 py-3">{adj.reason ?? "--"}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatShortDate(adj.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Payments tab */}
        <TabsContent className="w-full" value="payments">
          <div className="space-y-4">
            {canRecordPayment ? (
              <Dialog
                open={recordPaymentOpen}
                onOpenChange={(open) => {
                  setRecordPaymentOpen(open);
                  if (!open) setPaymentError(null);
                }}
              >
                <DialogTrigger asChild>
                  <Button size="sm">Record payment</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Record payment received</DialogTitle>
                    <DialogDescription>
                      Record a cash receipt for this payment request.
                    </DialogDescription>
                  </DialogHeader>
                  <form
                    className="space-y-4"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      const receivedDate = String(form.get("receivedDate") ?? "").trim();
                      const amountRaw = String(form.get("amountDollars") ?? "").trim();
                      const method = String(form.get("method") ?? "").trim();
                      const referenceNumber = String(form.get("referenceNumber") ?? "").trim();
                      const amountDollars = Number(amountRaw);
                      if (!amountRaw || !Number.isFinite(amountDollars) || amountDollars <= 0) {
                        setPaymentError("Enter a valid amount greater than zero.");
                        return;
                      }
                      try {
                        await mutations.recordPayment.mutateAsync({
                          receivedDate: receivedDate.includes("T")
                            ? receivedDate
                            : `${receivedDate}T12:00:00.000Z`,
                          amountCents: Math.round(amountDollars * 100),
                          method: (PAYMENT_METHODS as readonly string[]).includes(method)
                            ? (method as (typeof PAYMENT_METHODS)[number])
                            : undefined,
                          referenceNumber: referenceNumber || undefined,
                        });
                        setPaymentError(null);
                        setRecordPaymentOpen(false);
                      } catch (err) {
                        setPaymentError(
                          err instanceof Error ? err.message : "Unable to record payment.",
                        );
                      }
                    }}
                  >
                    <div className="space-y-1">
                      <Label htmlFor="received-date">Date received</Label>
                      <Input id="received-date" name="receivedDate" type="date" required />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="payment-amount">Amount (dollars)</Label>
                      <Input
                        id="payment-amount"
                        name="amountDollars"
                        type="number"
                        min="0.01"
                        step="0.01"
                        required
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="payment-method">Method</Label>
                      <Select name="method">
                        <SelectTrigger id="payment-method">
                          <SelectValue placeholder="Select method (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_METHODS.map((m) => (
                            <SelectItem key={m} value={m}>
                              {formatPaymentMethod(m)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="reference-number">Reference number (optional)</Label>
                      <Input
                        id="reference-number"
                        name="referenceNumber"
                        placeholder="Check number, wire reference, etc."
                      />
                    </div>
                    {paymentError ? (
                      <p role="alert" className="text-sm text-destructive">
                        {paymentError}
                      </p>
                    ) : null}
                    <Button
                      className="w-full"
                      type="submit"
                      disabled={mutations.recordPayment.isPending}
                    >
                      {mutations.recordPayment.isPending ? "Saving…" : "Record payment"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            ) : null}

            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments recorded.</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-border/60">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/40">
                      <th className="px-4 py-3 text-left font-medium">Date received</th>
                      <th className="px-4 py-3 text-right font-medium">Amount</th>
                      <th className="px-4 py-3 text-left font-medium">Method</th>
                      <th className="px-4 py-3 text-left font-medium">Reference</th>
                      {canEditPayments ? (
                        <th className="px-4 py-3 text-left font-medium">Actions</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {payments.map((pmt) => (
                      <tr key={pmt.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">{formatShortDate(pmt.receivedDate)}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                          {formatCurrency(pmt.amountCents)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatPaymentMethod(pmt.method)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {pmt.referenceNumber ?? "--"}
                        </td>
                        {canEditPayments ? (
                          <td className="px-4 py-3">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setConfirmRemovePaymentId(pmt.id);
                              }}
                              disabled={mutations.removePayment.isPending}
                            >
                              Remove
                            </Button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Activity tab */}
        <TabsContent className="w-full" value="activity">
          <EntityActivitySection entityType="payment_request" entityId={requestId} />
        </TabsContent>

        {/* Documents tab */}
        <TabsContent className="w-full" value="documents">
          <EntityDocumentsSection entityType="payment_request" entityId={requestId} />
        </TabsContent>

        {/* Indirect cost tab */}
        {canUseIndirect ? (
          <TabsContent className="w-full" value="indirect">
            <IndirectCostPanel
              requestId={requestId}
              grantId={request.grant?.id}
              canEdit={canEditPayments}
            />
          </TabsContent>
        ) : null}
      </Tabs>
      {confirmRemoveLineId !== null ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirmRemoveLineId(null);
          }}
          title="Remove line item?"
          description="This cannot be undone."
          confirmLabel="Remove"
          isPending={mutations.removeLine.isPending}
          onConfirm={() => {
            void runRowAction(() => mutations.removeLine.mutateAsync(confirmRemoveLineId));
          }}
        />
      ) : null}
      {confirmRemovePaymentId !== null ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirmRemovePaymentId(null);
          }}
          title="Remove payment?"
          description="This cannot be undone."
          confirmLabel="Remove"
          isPending={mutations.removePayment.isPending}
          onConfirm={() => {
            void runRowAction(() => mutations.removePayment.mutateAsync(confirmRemovePaymentId));
          }}
        />
      ) : null}
    </PageShell>
  );
}
