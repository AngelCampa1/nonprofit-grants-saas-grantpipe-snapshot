import { useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  IconButton,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@grantpipe/ui";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import {
  useCreateJournalEntry,
  useFiscalPeriods,
  useAccounts,
  type AccountRow,
} from "../../hooks/use-accounting";
import { formatCurrency, formatUtcCalendarDate, todayLocalDateInput } from "../../lib/format";

interface NewJournalEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface LineState {
  id: string;
  accountId: string;
  debitInput: string;
  creditInput: string;
  memo: string;
}

function makeEmptyLine(): LineState {
  return { id: crypto.randomUUID(), accountId: "", debitInput: "", creditInput: "", memo: "" };
}

function centsFromInput(value: string): number {
  const parsed = parseFloat(value);
  if (isNaN(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

const INITIAL_LINES = (): LineState[] => [makeEmptyLine(), makeEmptyLine()];

export function NewJournalEntryDialog({ open, onOpenChange }: NewJournalEntryDialogProps) {
  const navigate = useNavigate();
  const createEntry = useCreateJournalEntry();
  const fiscalPeriodsQuery = useFiscalPeriods();
  const accountsQuery = useAccounts({ pageSize: 500, isActive: true });

  const [date, setDate] = useState(todayLocalDateInput);
  const [reference, setReference] = useState("");
  const [memo, setMemo] = useState("");
  const [fiscalPeriodId, setFiscalPeriodId] = useState("");
  const [lines, setLines] = useState<LineState[]>(INITIAL_LINES());
  const [error, setError] = useState<string | null>(null);
  const [previousOpen, setPreviousOpen] = useState(open);

  if (open !== previousOpen) {
    setPreviousOpen(open);
    if (open) {
      setDate(todayLocalDateInput());
    }
  }

  const fiscalPeriods = fiscalPeriodsQuery.data ?? [];
  const openPeriods = fiscalPeriods.filter((p) => p.status === "open");
  const hasNoOpenPeriod = !fiscalPeriodsQuery.isLoading && openPeriods.length === 0;
  const accounts: AccountRow[] = accountsQuery.data ?? [];

  function handleOpenPeriods() {
    handleOpenChange(false);
    void navigate({ to: "/accounting/periods" });
  }

  const totalDebitCents = lines.reduce((sum, l) => sum + centsFromInput(l.debitInput), 0);
  const totalCreditCents = lines.reduce((sum, l) => sum + centsFromInput(l.creditInput), 0);
  const isBalanced = totalDebitCents > 0 && Math.abs(totalDebitCents - totalCreditCents) < 1;

  const validLines = lines.filter(
    (l) => l.accountId && (centsFromInput(l.debitInput) > 0 || centsFromInput(l.creditInput) > 0),
  );

  const canSubmit = validLines.length >= 2 && isBalanced && !!date && !!fiscalPeriodId;

  function reset() {
    setDate(todayLocalDateInput());
    setReference("");
    setMemo("");
    setFiscalPeriodId("");
    setLines(INITIAL_LINES());
    setError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      reset();
    }
    onOpenChange(nextOpen);
  }

  function addLine() {
    setLines((prev) => [...prev, makeEmptyLine()]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function updateLine(index: number, field: keyof LineState, value: string) {
    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        return { ...line, [field]: value };
      }),
    );
  }

  async function handleSubmit() {
    setError(null);

    // Reference is stored in the memo prefix since CreateJournalEntryInput has no reference field.
    const fullMemo = [reference.trim(), memo.trim()].filter(Boolean).join(": ") || undefined;

    try {
      await createEntry.mutateAsync({
        date: `${date}T00:00:00.000Z`,
        fiscalPeriodId,
        memo: fullMemo,
        isAdjusting: false,
        lines: validLines.map((l) => ({
          accountId: l.accountId,
          debitCents: centsFromInput(l.debitInput),
          creditCents: centsFromInput(l.creditInput),
          memo: l.memo.trim() || undefined,
          fundId: undefined,
        })),
      });
      handleOpenChange(false);
      await navigate({ to: "/accounting/journal" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create journal entry.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>New journal entry</DialogTitle>
          <DialogDescription>
            Post a double-entry journal entry. Debits must equal credits.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive" title="Unable to post entry">
            {error}
          </Alert>
        ) : null}

        {/* Header fields */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="je-date">Date</Label>
            <Input
              id="je-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              placeholder="May 12, 2026"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="je-reference">Reference</Label>
            <Input
              id="je-reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="JE-043"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="je-period">Fiscal period</Label>
            {hasNoOpenPeriod ? (
              <div className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-3">
                <p className="text-sm font-medium text-foreground">No open fiscal period</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Open a fiscal period first, then come back to post this entry.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 rounded-full"
                  onClick={handleOpenPeriods}
                >
                  Open a fiscal period
                </Button>
              </div>
            ) : (
              <Select value={fiscalPeriodId} onValueChange={setFiscalPeriodId}>
                <SelectTrigger id="je-period" aria-label="Fiscal period">
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  {openPeriods.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="flex flex-col">
                        <span>{p.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatUtcCalendarDate(p.startDate)} – {formatUtcCalendarDate(p.endDate)}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="je-memo">Memo</Label>
          <Input
            id="je-memo"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="Describe this entry…"
          />
        </div>

        {/* Line items */}
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_5rem_5rem_1fr_2rem] gap-2 text-xs font-medium text-muted-foreground">
            <span>Account</span>
            <span className="text-right">Debit</span>
            <span className="text-right">Credit</span>
            <span>Line memo</span>
            <span />
          </div>

          {lines.map((line, i) => (
            <div
              key={line.id}
              className="grid grid-cols-[1fr_5rem_5rem_1fr_2rem] gap-2 items-center"
            >
              <Select value={line.accountId} onValueChange={(v) => updateLine(i, "accountId", v)}>
                <SelectTrigger aria-label={`Account line ${i + 1}`}>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.code}: {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                aria-label={`Debit amount, line ${i + 1}`}
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={line.debitInput}
                onChange={(e) => updateLine(i, "debitInput", e.target.value)}
                className="text-right"
              />

              <Input
                aria-label={`Credit amount, line ${i + 1}`}
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={line.creditInput}
                onChange={(e) => updateLine(i, "creditInput", e.target.value)}
                className="text-right"
              />

              <Input
                placeholder="Line memo"
                value={line.memo}
                onChange={(e) => updateLine(i, "memo", e.target.value)}
              />

              <div className="flex justify-center">
                {lines.length > 2 ? (
                  <IconButton
                    size="sm"
                    type="button"
                    aria-label="Remove line"
                    onClick={() => removeLine(i)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </IconButton>
                ) : null}
              </div>
            </div>
          ))}

          <Button type="button" variant="outline" size="sm" onClick={addLine}>
            <Plus className="mr-1 size-4" />
            Add line
          </Button>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {/* Balance indicator */}
          <div className="text-sm">
            {isBalanced ? (
              <span className="font-medium text-success">✓ Balanced</span>
            ) : totalDebitCents > 0 || totalCreditCents > 0 ? (
              <span className="font-medium text-destructive">
                Not balanced · off by {formatCurrency(Math.abs(totalDebitCents - totalCreditCents))}
              </span>
            ) : null}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleSubmit()}
              disabled={!canSubmit || createEntry.isPending}
            >
              {createEntry.isPending ? "Posting…" : "Post entry"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
