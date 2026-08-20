import React, { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Alert,
  Badge,
  Breadcrumb,
  InlineError,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
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
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@grantpipe/ui";
import { useSession } from "../../../../hooks/use-session";
import {
  useJournalEntry,
  useReverseJournalEntry,
  useFiscalPeriods,
  useAccounts,
} from "../../../../hooks/use-accounting";
import { formatCurrency, formatUtcDate } from "../../../../lib/format";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/accounting/journal/$entryId")({
  component: JournalEntryDetailPage,
});

export function JournalEntryDetailPage() {
  const { entryId } = Route.useParams();
  const { memberRole } = useSession();
  const isAdmin = memberRole === "admin";
  const navigate = useNavigate();

  const entryQuery = useJournalEntry(entryId);
  const reverseMutation = useReverseJournalEntry(entryId);
  const fiscalPeriodsQuery = useFiscalPeriods();
  const accountsQuery = useAccounts({ pageSize: 500, isActive: true });

  const [reverseOpen, setReverseOpen] = useState(false);
  const [reverseMemo, setReverseMemo] = useState("");
  const [reverseError, setReverseError] = useState<string | null>(null);

  const entry = entryQuery.data;
  const fiscalPeriods = fiscalPeriodsQuery.data ?? [];
  const accounts = accountsQuery.data ?? [];
  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  if (entryQuery.isLoading) {
    return (
      <PageShell>
        <div className="space-y-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-64" />
        </div>
      </PageShell>
    );
  }

  if (entryQuery.isError || !entry) {
    return (
      <PageShell>
        <Alert variant="destructive" title="Unable to load journal entry.">
          <Button variant="outline" onClick={() => void entryQuery.refetch()}>
            Try again
          </Button>
        </Alert>
      </PageShell>
    );
  }

  const isLocked = entry.lines.some((l) => l.reconciliationId !== null);
  const isReversed = entry.reversedByEntryId !== null && entry.reversedByEntryId !== undefined;
  const period = fiscalPeriods.find((p) => p.id === entry.fiscalPeriodId);

  const totalDebits = entry.lines.reduce((sum, l) => sum + l.debitCents, 0);
  const totalCredits = entry.lines.reduce((sum, l) => sum + l.creditCents, 0);

  async function handleReverse() {
    setReverseError(null);
    try {
      const reversed = await reverseMutation.mutateAsync({
        memo: reverseMemo.trim() || undefined,
      });
      setReverseOpen(false);
      if (reversed?.id) {
        await navigate({
          to: "/accounting/journal/$entryId",
          params: { entryId: reversed.id },
        });
      }
    } catch (err) {
      setReverseError(err instanceof Error ? err.message : "Unable to reverse entry.");
    }
  }

  return (
    <PageShell>
      <PageHeader
        variant="workbench"
        breadcrumb={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/accounting/journal">Journal</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>#{entry.entryNumber}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
        title={`Journal Entry #${entry.entryNumber}`}
        description={entry.memo ?? "No memo"}
        actions={
          <div className="flex items-center gap-2">
            {isLocked ? <Badge variant="destructive">LOCKED</Badge> : null}
            {isReversed ? <Badge variant="secondary">REVERSED</Badge> : null}
            {entry.isAdjusting ? <Badge variant="outline">Adjusting</Badge> : null}
            {isAdmin && !isReversed && !isLocked ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setReverseMemo("");
                  setReverseError(null);
                  setReverseOpen(true);
                }}
              >
                Reverse
              </Button>
            ) : null}
          </div>
        }
      />

      {/* Metadata */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-caps text-muted-foreground">Date</p>
          <p className="text-sm font-medium">{formatUtcDate(entry.date)}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-caps text-muted-foreground">
            Fiscal Period
          </p>
          <p className="text-sm font-medium">{period?.name ?? entry.fiscalPeriodId}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-caps text-muted-foreground">
            Source
          </p>
          <Badge variant="outline" className="capitalize">
            {entry.source.replaceAll("_", " ")}
          </Badge>
        </div>
      </div>

      {/* Line items */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Line Items</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Account</TableHead>
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Credit</TableHead>
              <TableHead>Memo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entry.lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell className="text-muted-foreground">{line.lineNumber}</TableCell>
                <TableCell className="text-sm">
                  {(() => {
                    const acct = accountMap.get(line.accountId);
                    return acct ? `${acct.code}: ${acct.name}` : line.accountId;
                  })()}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {line.debitCents > 0 ? formatCurrency(line.debitCents) : "-"}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {line.creditCents > 0 ? formatCurrency(line.creditCents) : "-"}
                </TableCell>
                <TableCell className="text-muted-foreground">{line.memo ?? "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2} className="font-semibold">
                Totals
              </TableCell>
              <TableCell className="text-right font-mono font-semibold">
                {formatCurrency(totalDebits)}
              </TableCell>
              <TableCell className="text-right font-mono font-semibold">
                {formatCurrency(totalCredits)}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </section>

      {/* Reverse dialog */}
      <Dialog open={reverseOpen} onOpenChange={setReverseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reverse journal entry #{entry.entryNumber}</DialogTitle>
            <DialogDescription>
              A new reversing entry will be posted with swapped debits and credits.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="reverse-memo">Reversal Memo (optional)</Label>
              <Input
                id="reverse-memo"
                value={reverseMemo}
                onChange={(e) => setReverseMemo(e.target.value)}
                placeholder={`Reversal of entry #${entry.entryNumber}`}
              />
            </div>
            {reverseError ? <InlineError>{reverseError}</InlineError> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReverseOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleReverse()} disabled={reverseMutation.isPending}>
              {reverseMutation.isPending ? "Reversing…" : "Reverse"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
