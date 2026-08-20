import React, { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Button,
  IconButton,
  InlineError,
  Input,
  Label,
  PageHeader,
  PageShell,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@grantpipe/ui";
import { useSession } from "../../../../hooks/use-session";
import {
  useCreateJournalEntry,
  useFiscalPeriods,
  useAccounts,
  type AccountRow,
} from "../../../../hooks/use-accounting";
import { useFunds } from "../../../../hooks/use-grants";
import { canAccessFeature } from "../../../../lib/access-control";
import { formatCurrency, formatUtcCalendarDate, todayLocalDateInput } from "../../../../lib/format";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/accounting/journal/new")({
  component: NewJournalEntryPage,
});

interface JournalLineInput {
  id: string;
  accountId: string;
  debitCents: number;
  creditCents: number;
  memo: string;
  fundId: string;
}

function emptyLine(): JournalLineInput {
  return {
    id: crypto.randomUUID(),
    accountId: "",
    debitCents: 0,
    creditCents: 0,
    memo: "",
    fundId: "",
  };
}

function centsFromInput(value: string): number {
  const parsed = parseFloat(value);
  if (isNaN(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

function formatDollars(cents: number): string {
  if (cents === 0) return "";
  return (cents / 100).toFixed(2);
}

export function NewJournalEntryPage() {
  const { memberRole, memberPermissions } = useSession();
  const canCreate = canAccessFeature(memberRole, memberPermissions, "accounting", "edit");
  const navigate = useNavigate();
  const fiscalPeriodsQuery = useFiscalPeriods();
  const accountsQuery = useAccounts({ pageSize: 500, isActive: true });
  const fundsQuery = useFunds({ page: 1, pageSize: 500, sortBy: "name", sortOrder: "asc" });
  const createEntry = useCreateJournalEntry();

  const today = todayLocalDateInput();
  const [date, setDate] = useState(today);
  const [fiscalPeriodId, setFiscalPeriodId] = useState("");
  const [memo, setMemo] = useState("");
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [lines, setLines] = useState<JournalLineInput[]>(() => [emptyLine(), emptyLine()]);
  const [formError, setFormError] = useState<string | null>(null);

  if (!canCreate) {
    return (
      <PageShell>
        <p className="text-sm text-muted-foreground">
          You do not have permission to create journal entries.
        </p>
      </PageShell>
    );
  }

  const fiscalPeriods = fiscalPeriodsQuery.data ?? [];
  const openPeriods = fiscalPeriods.filter((p) => p.status === "open");
  const accounts: AccountRow[] = accountsQuery.data ?? [];
  const funds = fundsQuery.data?.data ?? [];

  const totalDebits = lines.reduce((sum, l) => sum + l.debitCents, 0);
  const totalCredits = lines.reduce((sum, l) => sum + l.creditCents, 0);
  const isBalanced = totalDebits > 0 && totalDebits === totalCredits;

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function updateLine(index: number, field: keyof JournalLineInput, value: string) {
    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        if (field === "debitCents" || field === "creditCents") {
          return { ...line, [field]: centsFromInput(value) };
        }
        return { ...line, [field]: value };
      }),
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!date) {
      setFormError("Date is required.");
      return;
    }
    if (!fiscalPeriodId) {
      setFormError("Fiscal period is required.");
      return;
    }
    if (!isBalanced) {
      setFormError("Debits must equal credits.");
      return;
    }
    const validLines = lines.filter((l) => l.accountId && (l.debitCents > 0 || l.creditCents > 0));
    if (validLines.length < 2) {
      setFormError("At least 2 lines with account and amount are required.");
      return;
    }

    try {
      const entry = await createEntry.mutateAsync({
        date: `${date}T00:00:00.000Z`,
        fiscalPeriodId,
        memo: memo.trim() || undefined,
        isAdjusting,
        lines: validLines.map((l) => ({
          accountId: l.accountId,
          debitCents: l.debitCents,
          creditCents: l.creditCents,
          memo: l.memo.trim() || undefined,
          fundId: l.fundId || undefined,
        })),
      });
      if (entry?.id) {
        await navigate({ to: "/accounting/journal/$entryId", params: { entryId: entry.id } });
      } else {
        await navigate({ to: "/accounting/journal" });
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to create journal entry.");
    }
  }

  return (
    <PageShell>
      <PageHeader variant="workbench" title="New Journal Entry" />

      <form className="space-y-6 max-w-4xl" onSubmit={(e) => void handleSubmit(e)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="je-date">Date</Label>
            <Input
              id="je-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="je-period">Fiscal Period</Label>
            <Select value={fiscalPeriodId} onValueChange={setFiscalPeriodId}>
              <SelectTrigger id="je-period">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                {openPeriods.length === 0 ? (
                  <SelectItem value="__none__" disabled>
                    No open periods
                  </SelectItem>
                ) : (
                  openPeriods.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="flex flex-col">
                        <span>{p.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatUtcCalendarDate(p.startDate)} – {formatUtcCalendarDate(p.endDate)}
                        </span>
                      </span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="je-memo">Memo (optional)</Label>
          <Input
            id="je-memo"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="Describe this entry…"
          />
        </div>

        <div className="flex items-center gap-3">
          <Switch id="je-adjusting" checked={isAdjusting} onCheckedChange={setIsAdjusting} />
          <Label htmlFor="je-adjusting">Adjusting entry</Label>
        </div>

        {/* Line items */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Line Items</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-64">Account</TableHead>
                <TableHead className="w-40">Fund</TableHead>
                <TableHead className="w-32 text-right">Debit</TableHead>
                <TableHead className="w-32 text-right">Credit</TableHead>
                <TableHead>Memo</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line, i) => (
                <TableRow key={line.id}>
                  <TableCell>
                    <Select
                      value={line.accountId}
                      onValueChange={(v) => updateLine(i, "accountId", v)}
                    >
                      <SelectTrigger aria-label={`Account for line ${i + 1}`}>
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
                  </TableCell>
                  <TableCell>
                    <Select
                      value={line.fundId ?? ""}
                      onValueChange={(v) => updateLine(i, "fundId", v === "__none__" ? "" : v)}
                    >
                      <SelectTrigger aria-label={`Fund for line ${i + 1}`}>
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {funds.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={formatDollars(line.debitCents)}
                      onChange={(e) => updateLine(i, "debitCents", e.target.value)}
                      className="text-right"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={formatDollars(line.creditCents)}
                      onChange={(e) => updateLine(i, "creditCents", e.target.value)}
                      className="text-right"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      placeholder="Line memo"
                      value={line.memo}
                      onChange={(e) => updateLine(i, "memo", e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    {lines.length > 2 ? (
                      <IconButton
                        type="button"
                        aria-label="Remove line"
                        onClick={() => removeLine(i)}
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </IconButton>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Button type="button" variant="outline" size="sm" onClick={addLine}>
            <Plus className="mr-1 size-4" />
            Add Line
          </Button>
        </div>

        {/* Running totals */}
        <div
          className={`flex items-center justify-end gap-8 rounded-lg border p-4 text-sm font-medium ${
            isBalanced
              ? "border-border bg-muted/50"
              : totalDebits > 0 || totalCredits > 0
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-border bg-muted/50"
          }`}
        >
          <span>
            Debits: <span className="font-mono">{formatCurrency(totalDebits)}</span>
          </span>
          <span>
            Credits: <span className="font-mono">{formatCurrency(totalCredits)}</span>
          </span>
          {!isBalanced && (totalDebits > 0 || totalCredits > 0) ? (
            <span className="text-destructive">
              Off by {formatCurrency(Math.abs(totalDebits - totalCredits))}
            </span>
          ) : isBalanced ? (
            <span className="text-success">Balanced</span>
          ) : null}
        </div>

        {formError ? <InlineError>{formError}</InlineError> : null}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={createEntry.isPending || !isBalanced}>
            {createEntry.isPending ? "Posting…" : "Post entry"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void navigate({ to: "/accounting/journal" })}
          >
            Cancel
          </Button>
        </div>
      </form>
    </PageShell>
  );
}
