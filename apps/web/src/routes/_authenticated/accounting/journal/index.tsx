import React, { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Badge,
  Button,
  Input,
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
  TeachAndActEmptyState,
} from "@grantpipe/ui";
import { useSession } from "../../../../hooks/use-session";
import { useJournalEntries, useFiscalPeriods } from "../../../../hooks/use-accounting";
import { JOURNAL_ENTRY_SOURCES, type JournalEntrySource } from "@grantpipe/shared";
import { formatCurrency, formatUtcDate } from "../../../../lib/format";
import { BookOpen } from "lucide-react";
import { canAccessFeature } from "../../../../lib/access-control";

export const Route = createFileRoute("/_authenticated/accounting/journal/")({
  component: JournalIndexPage,
});

export function JournalIndexPage() {
  const { memberRole, memberPermissions } = useSession();
  const canCreate = canAccessFeature(memberRole, memberPermissions, "accounting", "edit");

  const [fiscalPeriodId, setFiscalPeriodId] = useState("");
  const [source, setSource] = useState<JournalEntrySource | "">("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const fiscalPeriodsQuery = useFiscalPeriods();
  const fiscalPeriods = fiscalPeriodsQuery.data ?? [];

  const entriesQuery = useJournalEntries({
    fiscalPeriodId: fiscalPeriodId || undefined,
    source: source || undefined,
    from: fromDate ? `${fromDate}T00:00:00.000Z` : undefined,
    to: toDate ? `${toDate}T23:59:59.999Z` : undefined,
    page: 1,
    pageSize: 100,
  });

  const entries = entriesQuery.data ?? [];
  const hasJournalFilterChrome =
    entries.length > 0 || Boolean(fiscalPeriodId || source || fromDate || toDate);

  return (
    <PageShell>
      <PageHeader
        variant="workbench"
        title="Journal"
        actions={
          canCreate ? (
            <Button size="sm" asChild>
              <Link to="/accounting/journal/new">New Entry</Link>
            </Button>
          ) : undefined
        }
      />

      {/* Filters */}
      {hasJournalFilterChrome ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Select
            value={fiscalPeriodId || "all"}
            onValueChange={(v) => setFiscalPeriodId(v === "all" ? "" : v)}
          >
            <SelectTrigger className="w-full sm:w-48" aria-label="Filter by fiscal period">
              <SelectValue placeholder="All periods" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All periods</SelectItem>
              {fiscalPeriods.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={source || "all"}
            onValueChange={(v) => setSource(v === "all" ? "" : (v as JournalEntrySource))}
          >
            <SelectTrigger className="w-full sm:w-40" aria-label="Filter by source">
              <SelectValue placeholder="All sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {JOURNAL_ENTRY_SOURCES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s.replaceAll("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Input
              type="date"
              aria-label="From date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full sm:w-40"
            />
            <span className="text-sm text-muted-foreground">to</span>
            <Input
              type="date"
              aria-label="To date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full sm:w-40"
            />
          </div>
        </div>
      ) : null}

      {entriesQuery.isLoading ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Ref #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Memo</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Total Debits</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 6 }, (_, i) => `journal-skeleton-${i}`).map((rowKey) => (
              <TableRow key={rowKey}>
                <TableCell>
                  <Skeleton className="h-4 w-8" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-24" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-48" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-16" />
                </TableCell>
                <TableCell className="text-right">
                  <Skeleton className="ml-auto h-4 w-16" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : entriesQuery.isError ? (
        <p role="alert" className="text-destructive text-sm p-4">
          Unable to load journal entries. Please try again.
        </p>
      ) : entries.length === 0 ? (
        <TeachAndActEmptyState
          icon={<BookOpen className="size-5" />}
          heading="Journal entries"
          description="Use journal entries to fix balances. Add one for anything outside donations or grants."
          primaryAction={
            canCreate
              ? { label: "New entry", href: "/accounting/journal/new" }
              : { label: "View chart of accounts", href: "/accounting/chart-of-accounts" }
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Ref #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Memo</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Total Debits</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => {
              const totalDebits = entry.lines.reduce((sum, l) => sum + l.debitCents, 0);
              const isLocked = entry.lines.some((l) => l.reconciliationId !== null);
              return (
                <TableRow key={entry.id} className="hover:bg-muted/50">
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
                  <TableCell
                    className="max-w-xs truncate text-muted-foreground"
                    title={entry.memo ?? undefined}
                  >
                    {entry.memo ?? "-"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize">
                        {entry.externalSourceSystem === "quickbooks_online"
                          ? "QuickBooks"
                          : entry.source.replaceAll("_", " ")}
                      </Badge>
                      {entry.externalSourceSyncedAt ? (
                        <Badge variant="secondary" className="text-xs">
                          {formatUtcDate(entry.externalSourceSyncedAt)}
                        </Badge>
                      ) : null}
                      {isLocked ? (
                        <Badge variant="secondary" className="text-xs">
                          LOCKED
                        </Badge>
                      ) : null}
                    </div>
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
    </PageShell>
  );
}
