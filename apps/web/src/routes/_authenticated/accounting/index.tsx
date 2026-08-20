import React, { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { NewJournalEntryDialog } from "../../../components/dialogs/new-journal-entry-dialog";
import {
  ActionPanel,
  Alert,
  Badge,
  Button,
  InlineError,
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
  PageHeader,
  PageShell,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@grantpipe/ui";
import { useOrgProfile } from "../../../hooks/use-org-settings";
import { useSession } from "../../../hooks/use-session";
import { canAccessFeature } from "../../../lib/access-control";
import {
  useTrialBalance,
  useFiscalPeriods,
  useJournalEntries,
  useSeedOpeningBalances,
  useSeedChartOfAccounts,
  useEnableAccounting,
  useBankAccounts,
  type SeedResult,
} from "../../../hooks/use-accounting";
import { formatCurrency, formatUtcDate } from "../../../lib/format";
import { BookOpen, Landmark } from "lucide-react";

export const Route = createFileRoute("/_authenticated/accounting/")({
  component: AccountingDashboardPage,
});

export function AccountingDisabledCard() {
  const { memberRole } = useSession();
  const isAdmin = memberRole === "admin";
  const seedMutation = useSeedOpeningBalances();
  const seedCoaMutation = useSeedChartOfAccounts();
  const enableMutation = useEnableAccounting();

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<SeedResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAcknowledged, setConfirmAcknowledged] = useState(false);
  const [enableError, setEnableError] = useState<string | null>(null);
  const [enableDone, setEnableDone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handlePreview() {
    setEnableError(null);
    try {
      const result = await seedMutation.mutateAsync({ dryRun: true });
      setPreviewData(result);
      setPreviewOpen(true);
    } catch (err) {
      setEnableError(err instanceof Error ? err.message : "Unable to preview seeding.");
    }
  }

  async function handleEnable() {
    // Guard against a double-click re-firing the sequence before the first await resolves.
    if (isSubmitting) return;
    setIsSubmitting(true);
    setEnableError(null);
    try {
      await enableMutation.mutateAsync();
      await seedCoaMutation.mutateAsync();
      await seedMutation.mutateAsync({ dryRun: false });
      setConfirmOpen(false);
      setPreviewOpen(false);
      setConfirmAcknowledged(false);
      setEnableDone(true);
    } catch (err) {
      setEnableError(err instanceof Error ? err.message : "Unable to enable accounting.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (enableDone) {
    return (
      <PageShell>
        <Alert title="Accounting enabled." variant="default">
          Refresh the page to see your accounting dashboard.
        </Alert>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader variant="workbench" title="Accounting" />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="size-5" />
            Enable Double-Entry Accounting
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            GrantPipe will set up your chart of accounts. It will post opening journal entries from
            your existing donations and expenses. This cannot be undone.
          </p>
          {enableError ? <InlineError>{enableError}</InlineError> : null}
          {isAdmin ? (
            <Button onClick={() => void handlePreview()} disabled={seedMutation.isPending}>
              {seedMutation.isPending ? "Loading…" : "Preview & enable"}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              Ask an admin to enable accounting for your organization.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Preview: Opening Balances Seeding</DialogTitle>
            <DialogDescription>
              Review what will be posted when accounting is enabled.
            </DialogDescription>
          </DialogHeader>
          {previewData ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-border p-3 text-center">
                  <p className="text-2xl font-semibold">{previewData.donations}</p>
                  <p className="text-xs text-muted-foreground">Donations</p>
                </div>
                <div className="rounded-lg border border-border p-3 text-center">
                  <p className="text-2xl font-semibold">{previewData.expenses}</p>
                  <p className="text-xs text-muted-foreground">Expenses</p>
                </div>
                <div className="rounded-lg border border-border p-3 text-center">
                  <p className="text-2xl font-semibold">{previewData.estimatedJEs}</p>
                  <p className="text-xs text-muted-foreground">Est. JEs</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                These records will be posted into an "Opening Balances" fiscal period. That period
                will be closed automatically.
              </p>
            </div>
          ) : null}
          {enableError ? <InlineError>{enableError}</InlineError> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setPreviewOpen(false);
                setConfirmAcknowledged(false);
                setConfirmOpen(true);
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enable accounting?</DialogTitle>
            <DialogDescription>
              This will post opening journal entries. It cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-foreground">
            <input
              type="checkbox"
              checked={confirmAcknowledged}
              onChange={(event) => setConfirmAcknowledged(event.target.checked)}
              className="mt-0.5 size-4 rounded border-border text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            <span>I understand this will post opening balances. It cannot be undone.</span>
          </label>
          {enableError ? <InlineError>{enableError}</InlineError> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleEnable()}
              disabled={!confirmAcknowledged || isSubmitting}
            >
              {isSubmitting ? "Enabling…" : "Enable"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

export function AccountingDashboardPage() {
  const orgProfileQuery = useOrgProfile();
  const accountingEnabled = orgProfileQuery.data?.accountingEnabled ?? false;

  if (orgProfileQuery.isLoading) {
    return (
      <PageShell>
        <div className="space-y-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-64" />
        </div>
      </PageShell>
    );
  }

  if (!accountingEnabled) {
    return <AccountingDisabledCard />;
  }

  return <AccountingDashboardContent />;
}

function AccountingDashboardContent() {
  const { memberRole, memberPermissions } = useSession();
  const canEdit = canAccessFeature(memberRole, memberPermissions, "accounting", "edit");
  const [journalEntryOpen, setJournalEntryOpen] = useState(false);

  // Stable end-of-day string — computed once outside render, not per render,
  // so the query key is stable and does not cause an infinite refetch loop.
  const today = `${new Date().toISOString().slice(0, 10)}T23:59:59.999Z`;
  const trialBalanceQuery = useTrialBalance({ asOf: today });
  const fiscalPeriodsQuery = useFiscalPeriods();
  const recentEntriesQuery = useJournalEntries({ page: 1, pageSize: 10 });
  const bankAccountsQuery = useBankAccounts();

  const trialBalanceRows = trialBalanceQuery.data ?? [];
  const fiscalPeriods = fiscalPeriodsQuery.data ?? [];
  const recentEntries = recentEntriesQuery.data ?? [];
  const bankAccountCount = bankAccountsQuery.data?.length ?? 0;

  // Cash accounts are in the 1000–1099 range of the nonprofit COA (FASB ASC 958).
  // Filtering by subtype="cash" is wrong — the seeded subtype is "current_asset".
  const cashBalanceCents = trialBalanceRows
    .filter((row) => row.account.type === "asset" && row.account.code.startsWith("10"))
    .reduce((sum, row) => sum + row.balance, 0);

  const openPeriod = fiscalPeriods.find((p) => p.status === "open");

  const netAssetsUnrestricted = trialBalanceRows
    .filter(
      (row) =>
        row.account.type === "net_assets" && row.account.naturalRestriction === "unrestricted",
    )
    .reduce((sum, row) => sum + row.balance, 0);

  const netAssetsTempRestricted = trialBalanceRows
    .filter(
      (row) =>
        row.account.type === "net_assets" &&
        row.account.naturalRestriction === "temporarily_restricted",
    )
    .reduce((sum, row) => sum + row.balance, 0);

  const netAssetsPermanentRestricted = trialBalanceRows
    .filter(
      (row) =>
        row.account.type === "net_assets" &&
        row.account.naturalRestriction === "permanently_restricted",
    )
    .reduce((sum, row) => sum + row.balance, 0);

  return (
    <PageShell>
      <PageHeader
        variant="workbench"
        title="Accounting"
        actions={
          canEdit ? (
            <Button size="sm" onClick={() => setJournalEntryOpen(true)}>
              New journal entry
            </Button>
          ) : undefined
        }
      />

      <NewJournalEntryDialog open={journalEntryOpen} onOpenChange={setJournalEntryOpen} />

      {trialBalanceQuery.isError ? (
        <Alert variant="destructive" title="Unable to load accounting data.">
          <Button
            variant="outline"
            onClick={() => {
              void trialBalanceQuery.refetch();
            }}
          >
            Try again
          </Button>
        </Alert>
      ) : null}

      {/* KPI cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Cash Balance</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {trialBalanceQuery.isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              formatCurrency(cashBalanceCents)
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Open Fiscal Period</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {fiscalPeriodsQuery.isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : openPeriod ? (
              <div className="space-y-2">
                <div className="text-2xl font-semibold">{openPeriod.name}</div>
                <p className="text-muted-foreground">
                  <Link
                    to="/accounting/periods"
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    View periods
                  </Link>
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-2xl font-semibold text-muted-foreground">None</div>
                <p className="text-muted-foreground">
                  <Link
                    to="/accounting/periods"
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    Set up a period
                  </Link>
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Bank Accounts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {bankAccountsQuery.isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : bankAccountCount === 0 ? (
              <p className="text-muted-foreground">No bank accounts added.</p>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-2xl font-semibold">
                  <Landmark className="size-5 text-muted-foreground" />
                  {bankAccountCount}
                </div>
                <p className="text-muted-foreground">
                  bank account{bankAccountCount !== 1 ? "s" : ""} added.{" "}
                  <Link
                    to="/accounting/bank"
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    Manage
                  </Link>
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Net Assets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {trialBalanceQuery.isLoading ? (
              <Skeleton className="h-8 w-full" />
            ) : (
              <>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Unrestricted</span>
                  <span className="whitespace-nowrap font-semibold">
                    {formatCurrency(netAssetsUnrestricted)}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Temporarily restricted</span>
                  <span className="whitespace-nowrap font-semibold">
                    {formatCurrency(netAssetsTempRestricted)}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Permanently restricted</span>
                  <span className="whitespace-nowrap font-semibold">
                    {formatCurrency(netAssetsPermanentRestricted)}
                  </span>
                </div>
                {netAssetsUnrestricted === 0 &&
                netAssetsTempRestricted === 0 &&
                netAssetsPermanentRestricted === 0 ? (
                  <p className="pt-1 text-xs text-muted-foreground">
                    {recentEntries.length > 0 ||
                    cashBalanceCents !== 0 ||
                    trialBalanceRows.some((r) => r.balance !== 0)
                      ? "Net assets update after you close a fiscal period."
                      : "No journal entries yet. This fills in as you post them."}
                  </p>
                ) : (
                  <p className="pt-1 text-xs text-muted-foreground">From posted journal entries.</p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent journal entries */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Recent Journal Entries</h2>
          <Button variant="outline" size="sm" asChild>
            <Link to="/accounting/journal">View all</Link>
          </Button>
        </div>

        {recentEntriesQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : recentEntries.length === 0 ? (
          <ActionPanel
            variant="empty"
            title="No journal entries yet"
            description="Use journal entries to fix balances. Add one for anything outside donations or grants."
            action={
              <Link
                to="/accounting/journal/new"
                className="text-sm font-medium text-primary hover:underline underline-offset-4"
              >
                Create journal entry
              </Link>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Memo</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Total Debits</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentEntries.map((entry) => {
                const totalDebits = entry.lines.reduce((sum, l) => sum + l.debitCents, 0);
                return (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <Link
                        to="/accounting/journal/$entryId"
                        params={{ entryId: entry.id }}
                        className="font-medium text-primary hover:underline"
                      >
                        #{entry.entryNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{formatUtcDate(entry.date)}</TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {entry.memo ?? "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {entry.source.replaceAll("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(totalDebits)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>
    </PageShell>
  );
}
