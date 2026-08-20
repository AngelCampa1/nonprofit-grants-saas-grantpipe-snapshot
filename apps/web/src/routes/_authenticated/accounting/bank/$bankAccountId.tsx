import React, { useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  InlineError,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FilePicker,
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
  TableHead,
  TableHeader,
  TableRow,
} from "@grantpipe/ui";
import { useSession } from "../../../../hooks/use-session";
import {
  useBankAccounts,
  useBankTransactions,
  useImportBankTransactions,
  useMatchBankTransaction,
  useIgnoreBankTransaction,
  useUnmatchBankTransaction,
  useCreateReconciliation,
  useCompleteReconciliation,
  useCancelReconciliation,
  useJournalEntries,
} from "../../../../hooks/use-accounting";
import { canAccessFeature } from "../../../../lib/access-control";
import { formatCurrency, formatUtcCalendarDate, humanizeEnum } from "../../../../lib/format";
import { ArrowLeft, Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/accounting/bank/$bankAccountId")({
  component: BankAccountDetailPage,
});

type StatusFilter = "all" | "unmatched" | "matched" | "ignored";

interface MatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bankTransactionId: string;
  bankAccountId: string;
  transactionAmount: number;
}

function MatchDialog({
  open,
  onOpenChange,
  bankTransactionId,
  bankAccountId,
  transactionAmount,
}: MatchDialogProps) {
  const matchMutation = useMatchBankTransaction(bankAccountId);
  const journalEntriesQuery = useJournalEntries({ page: 1, pageSize: 50 });
  const [selectedEntryId, setSelectedEntryId] = useState("");
  const [matchError, setMatchError] = useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setSelectedEntryId("");
      setMatchError(null);
    }
  }, [open]);

  const entries = journalEntriesQuery.data ?? [];

  async function handleMatch() {
    setMatchError(null);
    try {
      await matchMutation.mutateAsync({
        bankTransactionId,
        journalEntryId: selectedEntryId,
      });
      onOpenChange(false);
    } catch (err) {
      setMatchError(err instanceof Error ? err.message : "Unable to match transaction.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Match transaction</DialogTitle>
          <DialogDescription>
            Select a journal entry to match with this bank transaction (
            {formatCurrency(transactionAmount)}).
          </DialogDescription>
        </DialogHeader>

        {journalEntriesQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No journal entries found.</p>
        ) : (
          <div className="max-h-80 overflow-y-auto rounded-2xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Ref #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Memo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow
                    key={entry.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedEntryId(entry.id)}
                  >
                    <TableCell>
                      <input
                        type="radio"
                        name="journal-entry"
                        value={entry.id}
                        checked={selectedEntryId === entry.id}
                        onChange={() => setSelectedEntryId(entry.id)}
                        aria-label={`Select entry #${entry.entryNumber}`}
                        className="focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm">#{entry.entryNumber}</TableCell>
                    <TableCell>{formatUtcCalendarDate(entry.date)}</TableCell>
                    <TableCell
                      className="max-w-xs truncate text-muted-foreground"
                      title={entry.memo ?? undefined}
                    >
                      {entry.memo ?? "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {matchError ? <InlineError>{matchError}</InlineError> : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleMatch()}
            disabled={matchMutation.isPending || !selectedEntryId}
          >
            {matchMutation.isPending ? "Matching…" : "Match"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ReconciliationPanelProps {
  bankAccountId: string;
  canEdit: boolean;
  canManage: boolean;
}

function ReconciliationPanel({ bankAccountId, canEdit, canManage }: ReconciliationPanelProps) {
  const createReconMutation = useCreateReconciliation();
  const completeReconMutation = useCompleteReconciliation();
  const cancelReconMutation = useCancelReconciliation();

  const [statementDate, setStatementDate] = useState("");
  const [endingBalance, setEndingBalance] = useState("");
  const [reconId, setReconId] = useState<string | null>(null);
  const [reconError, setReconError] = useState<string | null>(null);
  const [reconSuccess, setReconSuccess] = useState(false);

  async function handleStart() {
    setReconError(null);
    if (!statementDate) {
      setReconError("Statement date is required.");
      return;
    }
    const balanceCents = Math.round(parseFloat(endingBalance || "0") * 100);
    if (isNaN(balanceCents)) {
      setReconError("Invalid balance amount.");
      return;
    }

    try {
      const recon = await createReconMutation.mutateAsync({
        bankAccountId,
        statementDate: `${statementDate}T00:00:00.000Z`,
        statementEndingBalanceCents: balanceCents,
      });
      setReconId(recon.id);
    } catch (err) {
      setReconError(err instanceof Error ? err.message : "Unable to start reconciliation.");
    }
  }

  async function handleComplete(activeReconId: string) {
    setReconError(null);
    try {
      await completeReconMutation.mutateAsync(activeReconId);
      setReconSuccess(true);
      setReconId(null);
    } catch (err) {
      setReconError(err instanceof Error ? err.message : "Unable to complete reconciliation.");
    }
  }

  async function handleCancel(activeReconId: string) {
    setReconError(null);
    try {
      await cancelReconMutation.mutateAsync(activeReconId);
      setReconId(null);
      setStatementDate("");
      setEndingBalance("");
    } catch (err) {
      setReconError(err instanceof Error ? err.message : "Unable to cancel reconciliation.");
    }
  }

  if (!canEdit) {
    return (
      <p className="text-sm text-muted-foreground">Editors and admins can start reconciliations.</p>
    );
  }

  if (reconSuccess) {
    return (
      <Alert title="Reconciliation complete." variant="default">
        The reconciliation was completed successfully.
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="recon-statement-date">Statement Date</Label>
          <Input
            id="recon-statement-date"
            type="date"
            value={statementDate}
            onChange={(e) => setStatementDate(e.target.value)}
            disabled={!!reconId}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="recon-ending-balance">Statement Ending Balance ($)</Label>
          <Input
            id="recon-ending-balance"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={endingBalance}
            onChange={(e) => setEndingBalance(e.target.value)}
            disabled={!!reconId}
          />
        </div>
      </div>

      {reconError ? <InlineError>{reconError}</InlineError> : null}

      {!reconId ? (
        <Button onClick={() => void handleStart()} disabled={createReconMutation.isPending}>
          {createReconMutation.isPending ? "Starting…" : "Start reconciliation"}
        </Button>
      ) : (
        <div className="space-y-3">
          <Alert title="Reconciliation in progress." variant="default">
            Review matched transactions, then complete the reconciliation.
          </Alert>
          {canManage ? (
            <div className="flex gap-2">
              <Button
                onClick={() => void handleComplete(reconId)}
                disabled={completeReconMutation.isPending || cancelReconMutation.isPending}
              >
                {completeReconMutation.isPending ? "Completing…" : "Complete reconciliation"}
              </Button>
              <Button
                variant="outline"
                onClick={() => void handleCancel(reconId)}
                disabled={completeReconMutation.isPending || cancelReconMutation.isPending}
              >
                {cancelReconMutation.isPending ? "Cancelling…" : "Cancel"}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Accounting managers can complete or cancel reconciliations.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function BankAccountDetailPage() {
  const { bankAccountId } = useParams({ from: "/_authenticated/accounting/bank/$bankAccountId" });
  const { memberRole, memberPermissions } = useSession();
  const canEditAccounting = canAccessFeature(memberRole, memberPermissions, "accounting", "edit");
  const canManageAccounting = canAccessFeature(
    memberRole,
    memberPermissions,
    "accounting",
    "manage",
  );

  const bankAccountsQuery = useBankAccounts();
  const account = (bankAccountsQuery.data ?? []).find((a) => a.id === bankAccountId);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const transactionsQuery = useBankTransactions(bankAccountId, {
    status: statusFilter === "all" ? undefined : statusFilter,
    page,
    pageSize,
  });

  const importMutation = useImportBankTransactions(bankAccountId);
  const ignoreMutation = useIgnoreBankTransaction(bankAccountId);
  const unmatchMutation = useUnmatchBankTransaction(bankAccountId);

  const [importFormat, setImportFormat] = useState<"csv" | "ofx">("csv");
  const [importContent, setImportContent] = useState("");
  const [importResult, setImportResult] = useState<{ imported: number; duplicates: number } | null>(
    null,
  );
  const [importError, setImportError] = useState<string | null>(null);

  const [matchDialog, setMatchDialog] = useState<{
    bankTransactionId: string;
    amount: number;
  } | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);

  const transactions = transactionsQuery.data ?? [];

  function handleFileUpload(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImportContent((ev.target?.result as string) ?? "");
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    setImportError(null);
    setImportResult(null);
    if (!importContent.trim()) {
      setImportError("Paste or upload file content to import.");
      return;
    }
    try {
      const result = await importMutation.mutateAsync({
        format: importFormat,
        content: importContent,
      });
      setImportResult(result);
      setImportContent("");
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Unable to import transactions.");
    }
  }

  async function handleIgnore(bankTransactionId: string) {
    setActionError(null);
    try {
      await ignoreMutation.mutateAsync({ bankTransactionId });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to ignore transaction.");
    }
  }

  async function handleUnmatch(bankTransactionId: string) {
    setActionError(null);
    try {
      await unmatchMutation.mutateAsync({ bankTransactionId });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to unmatch transaction.");
    }
  }

  function statusBadge(status: string) {
    // `unmatched` is the default state of every freshly imported transaction and
    // the user's reconciliation to-do — an actionable-pending state, not an error.
    // `warning` is the app's "needs attention" signal (due-today, lapsing-soon,
    // unread); `destructive` is reserved for danger/failure and would paint a
    // fresh import a wall of red.
    const variants: Record<string, "default" | "secondary" | "outline" | "warning"> = {
      unmatched: "warning",
      matched: "default",
      ignored: "secondary",
    };
    return <Badge variant={variants[status] ?? "outline"}>{humanizeEnum(status)}</Badge>;
  }

  if (bankAccountsQuery.isLoading) {
    return (
      <PageShell>
        <div className="space-y-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-64" />
        </div>
      </PageShell>
    );
  }

  if (!account) {
    return (
      <PageShell>
        <Alert variant="destructive" title="Bank account not found.">
          <Button variant="outline" asChild>
            <Link to="/accounting/bank">Back to bank accounts</Link>
          </Button>
        </Alert>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="flex items-center gap-2 text-sm text-muted-foreground print:hidden">
        <Link to="/accounting/bank" className="hover:text-foreground">
          Bank Accounts
        </Link>
        <span>/</span>
        <span className="text-foreground">{account.name}</span>
      </div>

      <PageHeader
        variant="workbench"
        title={account.name}
        description={
          account.accountNumber
            ? `Account ending in ${account.accountNumber}`
            : "No account number on file"
        }
      />

      {/* Import panel */}
      {canEditAccounting ? (
        <section className="space-y-4 rounded-2xl border border-border p-4">
          <div className="flex items-center gap-2">
            <Upload className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Import Transactions</h2>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm font-medium leading-none">Format</span>
            <div className="flex items-center gap-3" role="radiogroup" aria-label="Import format">
              <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="import-format"
                  value="csv"
                  checked={importFormat === "csv"}
                  onChange={() => setImportFormat("csv")}
                  className="focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
                CSV
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="import-format"
                  value="ofx"
                  checked={importFormat === "ofx"}
                  onChange={() => setImportFormat("ofx")}
                  className="focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
                OFX
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="import-file">Upload file</Label>
            <FilePicker
              id="import-file"
              accept={importFormat === "csv" ? ".csv,text/csv" : ".ofx,.qfx"}
              onFileChange={handleFileUpload}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="import-content">Or paste file content</Label>
            <textarea
              id="import-content"
              value={importContent}
              onChange={(e) => setImportContent(e.target.value)}
              rows={6}
              placeholder={
                importFormat === "csv"
                  ? "Date,Description,Amount\n2026-01-15,Payment received,1500.00"
                  : "Paste OFX/QFX content here…"
              }
              className="w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>

          {importError ? <InlineError>{importError}</InlineError> : null}

          {importResult ? (
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
              Imported <strong>{importResult.imported}</strong> transaction
              {importResult.imported !== 1 ? "s" : ""}.{" "}
              {importResult.duplicates > 0 ? (
                <span className="text-muted-foreground">
                  {importResult.duplicates} duplicate{importResult.duplicates !== 1 ? "s" : ""}{" "}
                  skipped.
                </span>
              ) : null}
            </div>
          ) : null}

          <Button onClick={() => void handleImport()} disabled={importMutation.isPending}>
            {importMutation.isPending ? "Importing…" : "Import"}
          </Button>
        </section>
      ) : null}

      {/* Transactions section */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Transactions</h2>
          <div className="flex items-center gap-2">
            <Label htmlFor="status-filter" className="text-sm">
              Filter
            </Label>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v as StatusFilter);
                setPage(1);
              }}
            >
              <SelectTrigger id="status-filter" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="unmatched">Unmatched</SelectItem>
                <SelectItem value="matched">Matched</SelectItem>
                <SelectItem value="ignored">Ignored</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {actionError ? (
          <Alert variant="destructive" title="Action failed.">
            {actionError}
          </Alert>
        ) : null}

        {transactionsQuery.isError ? (
          <Alert variant="destructive" title="Unable to load transactions.">
            <Button variant="outline" onClick={() => void transactionsQuery.refetch()}>
              Try again
            </Button>
          </Alert>
        ) : transactionsQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transactions found.</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Status</TableHead>
                  {canEditAccounting ? <TableHead className="w-40" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((txn) => (
                  <TableRow key={txn.id}>
                    <TableCell>{formatUtcCalendarDate(txn.date)}</TableCell>
                    <TableCell className="max-w-xs truncate" title={txn.description}>
                      {txn.description}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono${txn.amountCents < 0 ? " text-destructive" : ""}`}
                    >
                      {formatCurrency(txn.amountCents)}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {txn.referenceNumber ??
                        (txn.journalEntryNumber != null ? `JE #${txn.journalEntryNumber}` : "")}
                    </TableCell>
                    <TableCell>{statusBadge(txn.status)}</TableCell>
                    {canEditAccounting ? (
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {txn.status === "unmatched" ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setMatchDialog({
                                    bankTransactionId: txn.id,
                                    amount: txn.amountCents,
                                  })
                                }
                              >
                                Match
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void handleIgnore(txn.id)}
                                disabled={
                                  ignoreMutation.isPending &&
                                  ignoreMutation.variables?.bankTransactionId === txn.id
                                }
                              >
                                Ignore
                              </Button>
                            </>
                          ) : txn.status === "matched" ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void handleUnmatch(txn.id)}
                              disabled={
                                unmatchMutation.isPending &&
                                unmatchMutation.variables?.bankTransactionId === txn.id
                              }
                            >
                              Unmatch
                            </Button>
                          ) : txn.status === "ignored" ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void handleUnmatch(txn.id)}
                              disabled={
                                unmatchMutation.isPending &&
                                unmatchMutation.variables?.bankTransactionId === txn.id
                              }
                            >
                              Unignore
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination */}
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">Page {page}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={transactions.length < pageSize}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </section>

      {/* Reconciliation section */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Reconciliation</h2>
        <ReconciliationPanel
          bankAccountId={bankAccountId}
          canEdit={canEditAccounting}
          canManage={canManageAccounting}
        />
      </section>

      {/* Match dialog */}
      {matchDialog ? (
        <MatchDialog
          open={matchDialog !== null}
          onOpenChange={(open) => {
            if (!open) setMatchDialog(null);
          }}
          bankTransactionId={matchDialog.bankTransactionId}
          bankAccountId={bankAccountId}
          transactionAmount={matchDialog.amount}
        />
      ) : null}

      {canManageAccounting ? (
        <div className="flex items-center gap-2 pt-4 border-t border-border">
          <Button variant="outline" size="sm" asChild>
            <Link to="/accounting/bank">
              <ArrowLeft className="mr-2 size-4" />
              Back to Bank Accounts
            </Link>
          </Button>
        </div>
      ) : null}
    </PageShell>
  );
}
