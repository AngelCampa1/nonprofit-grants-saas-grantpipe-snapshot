import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { HandshakeIcon, PlusIcon } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  StatusPanel,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "@grantpipe/ui";
import type { PledgeStatus, InstallmentAgingBucket } from "@grantpipe/shared";
import { AppPageTabs } from "../../../components/shell/page-tabs";
import { donorTabs } from "../../../config/page-tabs";
import {
  usePledges,
  usePledge,
  useCreatePledge,
  useRecordPledgePayment,
  useSetPledgeAllowance,
  useWriteOffPledge,
  usePromotePledge,
  type PledgeWithComputedFields,
} from "../../../hooks/use-pledges";
import { useContacts } from "../../../hooks/use-donors";
import { useSession } from "../../../hooks/use-session";
import { canAccessFeature } from "../../../lib/access-control";
import { formatCurrency, formatUtcCalendarDate } from "../../../lib/format";

export const Route = createFileRoute("/_authenticated/donors/pledges")({
  component: PledgesPage,
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<PledgeStatus, string> = {
  conditional: "Conditional",
  active: "Active",
  completed: "Completed",
  written_off: "Written Off",
  cancelled: "Cancelled",
};

export function getPledgeStatusVariant(
  status: PledgeStatus,
): "default" | "secondary" | "warning" | "destructive" {
  if (status === "active") return "default";
  if (status === "conditional") return "warning";
  if (status === "written_off" || status === "cancelled") return "destructive";
  return "secondary";
}

const AGING_BUCKET_LABELS: Record<InstallmentAgingBucket, string> = {
  current: "Current",
  "1_30": "1 to 30 days",
  "31_60": "31 to 60 days",
  "61_90": "61 to 90 days",
  "90_plus": "90+ days",
};

const STATUS_OPTIONS: Array<{ value: PledgeStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "conditional", label: "Conditional" },
  { value: "completed", label: "Completed" },
  { value: "written_off", label: "Written Off" },
];

const NET_ASSET_CLASSES = [
  { value: "temporarily_restricted", label: "Temporarily restricted" },
  { value: "unrestricted", label: "Unrestricted" },
  { value: "permanently_restricted", label: "Permanently restricted" },
];

// ---------------------------------------------------------------------------
// Installment row in the create dialog
// ---------------------------------------------------------------------------

interface InstallmentRowData {
  dueDate: string;
  amountCents: number;
  amountDisplay: string;
}

function defaultInstallmentRow(): InstallmentRowData {
  return { dueDate: "", amountCents: 0, amountDisplay: "" };
}

// ---------------------------------------------------------------------------
// Create pledge dialog
// ---------------------------------------------------------------------------

interface CreatePledgeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PledgeFormState {
  contactId: string;
  pledgeDate: string;
  discountRateBasisPoints: string;
  netAssetClass: string;
  hasBarrier: boolean;
  hasRightOfReturn: boolean;
  conditionNote: string;
  notes: string;
  fundId: string;
  grantId: string;
  installments: InstallmentRowData[];
}

const DEFAULT_FORM: PledgeFormState = {
  contactId: "",
  pledgeDate: "",
  discountRateBasisPoints: "400",
  netAssetClass: "temporarily_restricted",
  hasBarrier: false,
  hasRightOfReturn: false,
  conditionNote: "",
  notes: "",
  fundId: "",
  grantId: "",
  installments: [defaultInstallmentRow()],
};

export function CreatePledgeDialog({ open, onOpenChange }: CreatePledgeDialogProps) {
  const [form, setForm] = useState<PledgeFormState>(DEFAULT_FORM);
  const [error, setError] = useState<string | null>(null);

  const createPledge = useCreatePledge();
  const contactsQuery = useContacts({
    page: 1,
    pageSize: 100,
    sortBy: "name",
    sortOrder: "asc",
    type: "individual",
  });
  const contacts = contactsQuery.data?.data ?? [];

  function updateInstallment(index: number, field: keyof InstallmentRowData, value: string) {
    setForm((prev) => {
      const rows = prev.installments.map((row, i) => {
        if (i !== index) return row;
        if (field === "amountDisplay") {
          const parsed = parseFloat(value.replace(/[^0-9.]/g, ""));
          const amountCents = isNaN(parsed) ? 0 : Math.round(parsed * 100);
          return { ...row, amountDisplay: value, amountCents };
        }
        return { ...row, [field]: value };
      });
      return { ...prev, installments: rows };
    });
  }

  function addInstallment() {
    setForm((prev) => ({
      ...prev,
      installments: [...prev.installments, defaultInstallmentRow()],
    }));
  }

  function removeInstallment(index: number) {
    setForm((prev) => ({
      ...prev,
      installments: prev.installments.filter((_, i) => i !== index),
    }));
  }

  function resetAndClose() {
    setForm(DEFAULT_FORM);
    setError(null);
    onOpenChange(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.contactId) {
      setError("Select a donor.");
      return;
    }
    if (!form.pledgeDate) {
      setError("Enter a pledge date.");
      return;
    }
    if (form.installments.length === 0) {
      setError("Add at least one installment.");
      return;
    }
    const hasInvalidInstallment = form.installments.some(
      (row) => !row.dueDate || row.amountCents <= 0,
    );
    if (hasInvalidInstallment) {
      setError("Each installment needs a due date and a positive amount.");
      return;
    }

    try {
      await createPledge.mutateAsync({
        contactId: form.contactId,
        pledgeDate: new Date(form.pledgeDate),
        discountRateBasisPoints: Math.round(parseFloat(form.discountRateBasisPoints || "0") * 100),
        netAssetClass: form.netAssetClass as
          | "unrestricted"
          | "temporarily_restricted"
          | "permanently_restricted",
        hasBarrier: form.hasBarrier,
        hasRightOfReturn: form.hasRightOfReturn,
        conditionNote: form.conditionNote || undefined,
        notes: form.notes || undefined,
        fundId: form.fundId || undefined,
        grantId: form.grantId || undefined,
        installments: form.installments.map((row) => ({
          dueDate: new Date(row.dueDate),
          amountCents: row.amountCents,
        })),
      });
      resetAndClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
    }
  }

  const isConditional = form.hasBarrier && form.hasRightOfReturn;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add pledge</DialogTitle>
          <DialogDescription>
            Create a pledge schedule and choose when GrantPipe should post it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          {error && (
            <Alert variant="destructive">
              <p className="text-sm">{error}</p>
            </Alert>
          )}

          {/* Donor */}
          <div className="grid gap-1.5">
            <Label htmlFor="pledge-contact">Donor</Label>
            <Select
              value={form.contactId}
              onValueChange={(v) => setForm((p) => ({ ...p, contactId: v }))}
            >
              <SelectTrigger id="pledge-contact" className="rounded-full">
                <SelectValue placeholder="Select a donor" />
              </SelectTrigger>
              <SelectContent>
                {contacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.firstName && c.lastName
                      ? `${c.firstName} ${c.lastName}`
                      : (c.organizationName ?? c.id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Pledge date */}
          <div className="grid gap-1.5">
            <Label htmlFor="pledge-date">Pledge date</Label>
            <Input
              id="pledge-date"
              type="date"
              className="rounded-full"
              value={form.pledgeDate}
              onChange={(e) => setForm((p) => ({ ...p, pledgeDate: e.target.value }))}
            />
          </div>

          {/* Net asset class */}
          <div className="grid gap-1.5">
            <Label htmlFor="pledge-nac">Net asset class</Label>
            <Select
              value={form.netAssetClass}
              onValueChange={(v) => setForm((p) => ({ ...p, netAssetClass: v }))}
            >
              <SelectTrigger id="pledge-nac" className="rounded-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NET_ASSET_CLASSES.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Discount rate */}
          <div className="grid gap-1.5">
            <Label htmlFor="pledge-rate">Discount rate (%)</Label>
            <Input
              id="pledge-rate"
              type="number"
              step="0.01"
              min="0"
              max="100"
              className="rounded-full"
              placeholder="4.00"
              value={
                form.discountRateBasisPoints
                  ? String(parseFloat(form.discountRateBasisPoints) / 100)
                  : ""
              }
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  discountRateBasisPoints: String(
                    Math.round(parseFloat(e.target.value || "0") * 100),
                  ),
                }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Locked at recognition per ASC 958-605. Installments due within 1 year are not
              discounted.
            </p>
          </div>

          {/* Conditional flags */}
          <fieldset className="grid gap-3 rounded-lg border border-border p-4">
            <legend className="px-1 text-sm font-medium">Conditional flags</legend>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Has barrier</p>
                <p className="text-xs text-muted-foreground">Donor must overcome a condition</p>
              </div>
              <Switch
                checked={form.hasBarrier}
                onCheckedChange={(v) => setForm((p) => ({ ...p, hasBarrier: v }))}
                aria-label="Has barrier"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Has right of return</p>
                <p className="text-xs text-muted-foreground">
                  Organization can return assets if condition fails
                </p>
              </div>
              <Switch
                checked={form.hasRightOfReturn}
                onCheckedChange={(v) => setForm((p) => ({ ...p, hasRightOfReturn: v }))}
                aria-label="Has right of return"
              />
            </div>
            {isConditional && (
              <Alert>
                <p className="text-sm">
                  This pledge is conditional. GrantPipe stores it now and posts no journal entry
                  until you promote it.
                </p>
              </Alert>
            )}
            {isConditional && (
              <div className="grid gap-1.5">
                <Label htmlFor="pledge-condition-note">Condition note</Label>
                <Textarea
                  id="pledge-condition-note"
                  placeholder="Describe the condition…"
                  value={form.conditionNote}
                  onChange={(e) => setForm((p) => ({ ...p, conditionNote: e.target.value }))}
                  rows={2}
                />
              </div>
            )}
          </fieldset>

          {/* Installments */}
          <fieldset className="grid gap-3">
            <legend className="text-sm font-medium">Installment schedule</legend>
            {form.installments.map((row, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1 grid gap-1.5">
                  <Label htmlFor={`inst-date-${i}`} className="sr-only">
                    Due date {i + 1}
                  </Label>
                  <Input
                    id={`inst-date-${i}`}
                    type="date"
                    className="rounded-full"
                    placeholder="Due date"
                    value={row.dueDate}
                    onChange={(e) => updateInstallment(i, "dueDate", e.target.value)}
                  />
                </div>
                <div className="flex-1 grid gap-1.5">
                  <Label htmlFor={`inst-amt-${i}`} className="sr-only">
                    Amount {i + 1}
                  </Label>
                  <Input
                    id={`inst-amt-${i}`}
                    type="text"
                    className="rounded-full"
                    placeholder="Amount (e.g. 5000.00)"
                    value={row.amountDisplay}
                    onChange={(e) => updateInstallment(i, "amountDisplay", e.target.value)}
                  />
                </div>
                {form.installments.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="rounded-full"
                    onClick={() => removeInstallment(i)}
                    aria-label={`Remove installment ${i + 1}`}
                  >
                    ×
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full w-fit"
              onClick={addInstallment}
            >
              Add installment
            </Button>
          </fieldset>

          {/* Notes */}
          <div className="grid gap-1.5">
            <Label htmlFor="pledge-notes">Notes</Label>
            <Textarea
              id="pledge-notes"
              placeholder="Optional notes…"
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={resetAndClose}
            >
              Cancel
            </Button>
            <Button type="submit" className="rounded-full" disabled={createPledge.isPending}>
              {createPledge.isPending ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Record payment dialog
// ---------------------------------------------------------------------------

interface RecordPaymentDialogProps {
  pledgeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PaymentFormState {
  amountDisplay: string;
  amountCents: number;
  paymentDate: string;
  notes: string;
}

const DEFAULT_PAYMENT_FORM: PaymentFormState = {
  amountDisplay: "",
  amountCents: 0,
  paymentDate: "",
  notes: "",
};

export function RecordPaymentDialog({ pledgeId, open, onOpenChange }: RecordPaymentDialogProps) {
  const [form, setForm] = useState<PaymentFormState>(DEFAULT_PAYMENT_FORM);
  const [error, setError] = useState<string | null>(null);
  const recordPayment = useRecordPledgePayment();

  function resetAndClose() {
    setForm(DEFAULT_PAYMENT_FORM);
    setError(null);
    onOpenChange(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.amountCents <= 0) {
      setError("Enter a positive amount.");
      return;
    }
    if (!form.paymentDate) {
      setError("Enter a payment date.");
      return;
    }
    try {
      await recordPayment.mutateAsync({
        pledgeId,
        amountCents: form.amountCents,
        paymentDate: new Date(form.paymentDate),
        notes: form.notes || undefined,
      });
      resetAndClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            Apply a payment to this pledge and update its balance.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          {error && (
            <Alert variant="destructive">
              <p className="text-sm">{error}</p>
            </Alert>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="pay-amount">Amount</Label>
            <Input
              id="pay-amount"
              type="text"
              className="rounded-full"
              placeholder="5000.00"
              value={form.amountDisplay}
              onChange={(e) => {
                const parsed = parseFloat(e.target.value.replace(/[^0-9.]/g, ""));
                setForm((p) => ({
                  ...p,
                  amountDisplay: e.target.value,
                  amountCents: isNaN(parsed) ? 0 : Math.round(parsed * 100),
                }));
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pay-date">Payment date</Label>
            <Input
              id="pay-date"
              type="date"
              className="rounded-full"
              value={form.paymentDate}
              onChange={(e) => setForm((p) => ({ ...p, paymentDate: e.target.value }))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pay-notes">Notes</Label>
            <Textarea
              id="pay-notes"
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={resetAndClose}
            >
              Cancel
            </Button>
            <Button type="submit" className="rounded-full" disabled={recordPayment.isPending}>
              {recordPayment.isPending ? "Saving…" : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Set allowance dialog
// ---------------------------------------------------------------------------

interface SetAllowanceDialogProps {
  pledgeId: string;
  currentAllowanceCents: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SetAllowanceDialog({
  pledgeId,
  currentAllowanceCents,
  open,
  onOpenChange,
}: SetAllowanceDialogProps) {
  const [amountDisplay, setAmountDisplay] = useState(String(currentAllowanceCents / 100));
  const [amountCents, setAmountCents] = useState(currentAllowanceCents);
  const [error, setError] = useState<string | null>(null);
  const setAllowance = useSetPledgeAllowance();

  function resetAndClose() {
    setError(null);
    onOpenChange(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await setAllowance.mutateAsync({ pledgeId, allowanceCents: amountCents });
      resetAndClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Set allowance for uncollectible</DialogTitle>
          <DialogDescription>
            Record the part of this pledge you no longer expect to collect.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          {error && (
            <Alert variant="destructive">
              <p className="text-sm">{error}</p>
            </Alert>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="allowance-amount">Allowance amount</Label>
            <Input
              id="allowance-amount"
              type="text"
              className="rounded-full"
              value={amountDisplay}
              onChange={(e) => {
                const parsed = parseFloat(e.target.value.replace(/[^0-9.]/g, ""));
                setAmountDisplay(e.target.value);
                setAmountCents(isNaN(parsed) ? 0 : Math.round(parsed * 100));
              }}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={resetAndClose}
            >
              Cancel
            </Button>
            <Button type="submit" className="rounded-full" disabled={setAllowance.isPending}>
              {setAllowance.isPending ? "Saving…" : "Update allowance"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Write-off dialog
// ---------------------------------------------------------------------------

interface WriteOffDialogProps {
  pledgeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WriteOffDialog({ pledgeId, open, onOpenChange }: WriteOffDialogProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const writeOff = useWriteOffPledge();

  function resetAndClose() {
    setReason("");
    setError(null);
    onOpenChange(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await writeOff.mutateAsync({ pledgeId, reason: reason || undefined });
      resetAndClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Write off pledge</DialogTitle>
          <DialogDescription>
            Close the remaining pledge balance and keep the audit trail.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          {error && (
            <Alert variant="destructive">
              <p className="text-sm">{error}</p>
            </Alert>
          )}
          <p className="text-sm text-muted-foreground">
            Writing off a pledge closes the receivable and posts the appropriate journal entries.
            This cannot be undone.
          </p>
          <div className="grid gap-1.5">
            <Label htmlFor="writeoff-reason">Reason (optional)</Label>
            <Textarea
              id="writeoff-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Donor became unreachable…"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={resetAndClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              className="rounded-full"
              disabled={writeOff.isPending}
            >
              {writeOff.isPending ? "Writing off…" : "Write off"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Pledge detail sheet
// ---------------------------------------------------------------------------

interface PledgeDetailSheetProps {
  pledgeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManageAccounting?: boolean;
}

export function PledgeDetailSheet({
  pledgeId,
  open,
  onOpenChange,
  canManageAccounting = true,
}: PledgeDetailSheetProps) {
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [allowanceOpen, setAllowanceOpen] = useState(false);
  const [writeOffOpen, setWriteOffOpen] = useState(false);
  const { data, isLoading, isError } = usePledge(pledgeId);
  const promoteP = usePromotePledge();

  const pledge = data?.pledge;
  const installments = data?.installments ?? [];
  const payments = data?.payments ?? [];
  const schedule = data?.amortizationSchedule ?? [];

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Pledge detail</SheetTitle>
            <SheetDescription>Installments, payments, and amortization schedule</SheetDescription>
          </SheetHeader>

          {isLoading ? (
            <StatusPanel variant="loading" title="Loading pledge…">
              Fetching installments and amortization schedule.
            </StatusPanel>
          ) : isError ? (
            <StatusPanel variant="error" title="Unable to load pledge.">
              Refresh the page or try again.
            </StatusPanel>
          ) : pledge ? (
            <div className="mt-6 grid gap-6">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge
                    variant={getPledgeStatusVariant(pledge.status)}
                    className="rounded-full mt-0.5"
                  >
                    {STATUS_LABELS[pledge.status]}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Face amount</p>
                  <p className="font-medium tabular-nums">
                    {formatCurrency(pledge.faceAmountCents)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Present value</p>
                  <p className="font-medium tabular-nums">
                    {formatCurrency(pledge.presentValueCents)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Carrying value</p>
                  <p className="font-medium tabular-nums">
                    {formatCurrency(data.carryingValueCents)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Outstanding</p>
                  <p className="font-medium tabular-nums">
                    {formatCurrency(pledge.outstandingCents)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Allowance</p>
                  <p className="font-medium tabular-nums">
                    {formatCurrency(pledge.allowanceCents)}
                  </p>
                </div>
              </div>

              {canManageAccounting ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="rounded-full"
                    onClick={() => setPaymentOpen(true)}
                    disabled={
                      pledge.status === "written_off" ||
                      pledge.status === "completed" ||
                      pledge.status === "cancelled"
                    }
                  >
                    Record payment
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => setAllowanceOpen(true)}
                    disabled={pledge.status === "written_off" || pledge.status === "cancelled"}
                  >
                    Set allowance
                  </Button>
                  {pledge.status === "conditional" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      onClick={() => void promoteP.mutateAsync(pledgeId)}
                      disabled={promoteP.isPending}
                    >
                      {promoteP.isPending ? "Promoting…" : "Promote to active"}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    className="rounded-full"
                    onClick={() => setWriteOffOpen(true)}
                    disabled={
                      pledge.status === "written_off" ||
                      pledge.status === "completed" ||
                      pledge.status === "cancelled"
                    }
                  >
                    Write off
                  </Button>
                </div>
              ) : (
                <Alert>
                  <p className="text-sm">Accounting managers can post pledge changes.</p>
                </Alert>
              )}

              {/* Installments */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Installments</h3>
                {installments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No installments.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Due date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {installments.map((inst) => (
                        <TableRow key={inst.id}>
                          <TableCell className="text-sm">
                            {formatUtcCalendarDate(inst.dueDate)}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {formatCurrency(inst.amountCents)}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {formatCurrency(inst.paidCents)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="rounded-full text-xs">
                              {inst.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              {/* Payments */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Payments</h3>
                {payments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Accretion</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((pmt) => (
                        <TableRow key={pmt.id}>
                          <TableCell className="text-sm">
                            {formatUtcCalendarDate(pmt.paymentDate)}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {formatCurrency(pmt.amountCents)}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {formatCurrency(pmt.accretionCents)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {pmt.notes ?? "--"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              {/* Amortization schedule */}
              {schedule.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Amortization schedule</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Period</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Accretion</TableHead>
                        <TableHead className="text-right">Carrying value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {schedule.map((entry) => (
                        <TableRow key={entry.period}>
                          <TableCell className="text-sm tabular-nums">{entry.period}</TableCell>
                          <TableCell className="text-sm">
                            {formatUtcCalendarDate(entry.date)}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {formatCurrency(entry.accretionCents)}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {formatCurrency(entry.carryingValueCents)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {pledge && paymentOpen && (
        <RecordPaymentDialog pledgeId={pledgeId} open={paymentOpen} onOpenChange={setPaymentOpen} />
      )}
      {pledge && allowanceOpen && (
        <SetAllowanceDialog
          pledgeId={pledgeId}
          currentAllowanceCents={pledge.allowanceCents}
          open={allowanceOpen}
          onOpenChange={setAllowanceOpen}
        />
      )}
      {pledge && writeOffOpen && (
        <WriteOffDialog pledgeId={pledgeId} open={writeOffOpen} onOpenChange={setWriteOffOpen} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Aging summary tiles
// ---------------------------------------------------------------------------

interface AgingTilesProps {
  pledges: PledgeWithComputedFields[];
  totalFaceCents: number;
  totalPVCents: number;
  totalOutstandingCents: number;
}

export function AgingTiles({
  pledges,
  totalFaceCents,
  totalPVCents,
  totalOutstandingCents,
}: AgingTilesProps) {
  const buckets: Record<InstallmentAgingBucket, number> = {
    current: 0,
    "1_30": 0,
    "31_60": 0,
    "61_90": 0,
    "90_plus": 0,
  };

  for (const pledge of pledges) {
    for (const [bucket, count] of Object.entries(pledge.agingBuckets) as Array<
      [InstallmentAgingBucket, number]
    >) {
      buckets[bucket] += count;
    }
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="aging-tiles">
      <Card className="rounded-2xl border-border bg-card shadow-sm">
        <CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Total face</p>
          <p className="text-lg font-semibold tabular-nums">{formatCurrency(totalFaceCents)}</p>
        </CardContent>
      </Card>
      <Card className="rounded-2xl border-border bg-card shadow-sm">
        <CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Present value</p>
          <p className="text-lg font-semibold tabular-nums">{formatCurrency(totalPVCents)}</p>
        </CardContent>
      </Card>
      <Card className="rounded-2xl border-border bg-card shadow-sm">
        <CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Outstanding</p>
          <p className="text-lg font-semibold tabular-nums">
            {formatCurrency(totalOutstandingCents)}
          </p>
        </CardContent>
      </Card>
      <Card className="rounded-2xl border-border bg-card shadow-sm">
        <CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Overdue (90+ days)</p>
          <p className="text-lg font-semibold tabular-nums text-destructive">
            {buckets["90_plus"]}
          </p>
        </CardContent>
      </Card>

      {/* Aging breakdown */}
      <div
        className="col-span-2 sm:col-span-4 flex flex-wrap gap-3 text-sm text-muted-foreground"
        data-testid="aging-breakdown"
      >
        {(["current", "1_30", "31_60", "61_90", "90_plus"] as InstallmentAgingBucket[]).map(
          (bucket) => (
            <span key={bucket}>
              <span className="font-medium text-foreground tabular-nums">{buckets[bucket]}</span>{" "}
              {AGING_BUCKET_LABELS[bucket]}
            </span>
          ),
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function PledgesPage() {
  const [statusFilter, setStatusFilter] = useState<PledgeStatus | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedPledgeId, setSelectedPledgeId] = useState<string | null>(null);
  const { memberRole, memberPermissions } = useSession();
  const canManageAccounting = canAccessFeature(
    memberRole,
    memberPermissions,
    "accounting",
    "manage",
  );

  const { data, isLoading, isError, isPlanGated } = usePledges(
    statusFilter !== "all" ? { status: statusFilter } : {},
  );

  const pledges = data?.pledges ?? [];
  const totals = data?.totals;

  return (
    <PageShell>
      <PageHeader
        variant="workbench"
        kicker="Fundraising"
        title="Pledges"
        description="Multi-year commitments with ASC 958 present-value accounting."
        actions={
          canManageAccounting ? (
            <Button
              className="rounded-full"
              onClick={() => setCreateOpen(true)}
              disabled={isPlanGated}
            >
              <PlusIcon className="size-4 mr-1" aria-hidden="true" />
              Add pledge
            </Button>
          ) : null
        }
      />

      <AppPageTabs groupId="donors" items={donorTabs} />

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {STATUS_OPTIONS.map((opt) => {
          const active = statusFilter === opt.value;
          return (
            <Button
              key={opt.value}
              type="button"
              size="sm"
              variant={active ? "secondary" : "outline"}
              aria-pressed={active}
              className="rounded-full"
              onClick={() => setStatusFilter(opt.value as PledgeStatus | "all")}
            >
              {opt.label}
            </Button>
          );
        })}
      </div>

      {isLoading ? (
        <StatusPanel variant="loading" title="Loading pledges…">
          Fetching your pledge commitments.
        </StatusPanel>
      ) : isPlanGated ? (
        <StatusPanel variant="empty" title="Growth plan required">
          Pledge tracking is available on the Growth plan.{" "}
          <Link
            to="/settings"
            hash="billing"
            className="font-medium text-primary hover:underline underline-offset-4"
          >
            Go to Billing to upgrade.
          </Link>
        </StatusPanel>
      ) : isError ? (
        <StatusPanel variant="error" title="Unable to load pledges.">
          Refresh the page or try again in a moment.
        </StatusPanel>
      ) : pledges.length === 0 ? (
        <StatusPanel variant="empty" title="No pledges yet">
          Record a multi-year commitment to get started.
          {canManageAccounting ? (
            <div className="mt-3">
              <Button className="rounded-full" onClick={() => setCreateOpen(true)}>
                <PlusIcon className="size-4 mr-1" aria-hidden="true" />
                Add your first pledge
              </Button>
            </div>
          ) : null}
        </StatusPanel>
      ) : (
        <>
          {totals && (
            <AgingTiles
              pledges={pledges}
              totalFaceCents={totals.totalFaceCents}
              totalPVCents={totals.totalPVCents}
              totalOutstandingCents={totals.totalOutstandingCents}
            />
          )}

          <Card className="rounded-2xl border-border bg-card shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <HandshakeIcon className="size-4 text-primary" aria-hidden="true" />
                Pledges
              </CardTitle>
              <Badge variant="secondary" className="rounded-full">
                {pledges.length}
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Donor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Pledge date</TableHead>
                    <TableHead className="text-right">Face amount</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="text-right">Allowance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pledges.map((pledge) => (
                    <TableRow key={pledge.id} data-testid="pledge-row">
                      <TableCell className="font-medium text-foreground">
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-auto rounded-full px-2 py-1 text-left font-medium"
                          onClick={() => setSelectedPledgeId(pledge.id)}
                          aria-label={`Open pledge ${pledge.contactId} details`}
                        >
                          {pledge.contactId}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={getPledgeStatusVariant(pledge.status)}
                          className="rounded-full"
                        >
                          {STATUS_LABELS[pledge.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatUtcCalendarDate(pledge.pledgeDate)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatCurrency(pledge.faceAmountCents)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatCurrency(pledge.outstandingCents)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {pledge.allowanceCents > 0 ? formatCurrency(pledge.allowanceCents) : "--"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      <CreatePledgeDialog open={createOpen} onOpenChange={setCreateOpen} />

      {selectedPledgeId && (
        <PledgeDetailSheet
          pledgeId={selectedPledgeId}
          open={Boolean(selectedPledgeId)}
          onOpenChange={(o) => {
            if (!o) setSelectedPledgeId(null);
          }}
          canManageAccounting={canManageAccounting}
        />
      )}
    </PageShell>
  );
}
