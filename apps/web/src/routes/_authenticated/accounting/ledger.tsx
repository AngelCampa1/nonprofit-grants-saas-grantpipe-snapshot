import React, { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Alert,
  Button,
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
  TeachAndActEmptyState,
} from "@grantpipe/ui";
import { useAccounts, useAccountLedger } from "../../../hooks/use-accounting";
import { formatCurrency, formatUtcDate } from "../../../lib/format";
import { escapeCsvCell } from "@grantpipe/shared";
import { BookOpen, Download } from "lucide-react";
import { downloadGeneratedCsv } from "../../../lib/download";

export const Route = createFileRoute("/_authenticated/accounting/ledger")({
  component: AccountLedgerPage,
});

export function buildLedgerCsv(
  accountName: string,
  lines: Array<{
    line: { debitCents: number; creditCents: number; memo: string | null };
    journalEntry: { entryNumber: number; date: string; memo: string | null };
    runningBalance: number;
  }>,
): string {
  const header = "Date,JE Ref,Memo,Debit,Credit,Running Balance\n";
  const rows = lines.map((row) => {
    const date = formatUtcDate(row.journalEntry.date);
    const ref = `#${row.journalEntry.entryNumber}`;
    const lineMemo = row.line.memo ?? row.journalEntry.memo ?? "";
    const debit = row.line.debitCents > 0 ? (row.line.debitCents / 100).toFixed(2) : "";
    const credit = row.line.creditCents > 0 ? (row.line.creditCents / 100).toFixed(2) : "";
    const balance = (row.runningBalance / 100).toFixed(2);
    return [date, ref, lineMemo, debit, credit, balance].map(escapeCsvCell).join(",");
  });
  return header + rows.join("\n");
}

export function AccountLedgerPage() {
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const accountsQuery = useAccounts({ pageSize: 500, isActive: true });
  const accounts = accountsQuery.data ?? [];

  const ledgerQuery = useAccountLedger(selectedAccountId, {
    from: fromDate ? `${fromDate}T00:00:00.000Z` : undefined,
    to: toDate ? `${toDate}T23:59:59.999Z` : undefined,
  });

  const ledger = ledgerQuery.data;
  const lines = ledger?.lines ?? [];

  function handleExportCsv() {
    if (!ledger) return;
    const csv = buildLedgerCsv(ledger.account.name, lines);
    const slug = ledger.account.code.replace(/\s+/g, "-");
    downloadGeneratedCsv(csv, `ledger-${slug}.csv`, {
      feature: "accounting",
      operation: "ledger_export_csv",
    });
  }

  return (
    <PageShell>
      <PageHeader variant="workbench" title="Account Ledger" />

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label htmlFor="ledger-account">Account</Label>
          <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
            <SelectTrigger id="ledger-account" className="w-72">
              <SelectValue placeholder="Select an account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.code}: {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="ledger-from">From</Label>
          <Input
            id="ledger-from"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ledger-to">To</Label>
          <Input
            id="ledger-to"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-40"
          />
        </div>
        {ledger && lines.length > 0 ? (
          <Button variant="outline" size="sm" onClick={handleExportCsv}>
            <Download className="mr-2 size-4" />
            Export CSV
          </Button>
        ) : null}
      </div>

      {!selectedAccountId ? (
        <TeachAndActEmptyState
          icon={<BookOpen className="size-5" />}
          heading="See every transaction in an account"
          description="Pick an account above. We list each entry and its balance."
          primaryAction={{
            label: "Pick an account",
            onClick: () => document.getElementById("ledger-account")?.click(),
          }}
        />
      ) : ledgerQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : ledgerQuery.isError ? (
        <Alert variant="destructive" title="Unable to load ledger.">
          <Button variant="outline" onClick={() => void ledgerQuery.refetch()}>
            Try again
          </Button>
        </Alert>
      ) : !ledger || lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">No transactions for this account.</p>
      ) : (
        <>
          <div className="text-sm text-muted-foreground">
            Account: <span className="font-medium text-foreground">{ledger.account.name}</span>
            {" · "}
            <span className="capitalize">{ledger.account.type.replaceAll("_", " ")}</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>JE Ref</TableHead>
                <TableHead>Memo</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((row, i) => (
                <TableRow key={`${row.journalEntry.id}-${i}`}>
                  <TableCell>{formatUtcDate(row.journalEntry.date)}</TableCell>
                  <TableCell className="font-mono text-sm">
                    <Link
                      to="/accounting/journal/$entryId"
                      params={{ entryId: row.journalEntry.id }}
                      className="text-primary hover:underline"
                    >
                      #{row.journalEntry.entryNumber}
                    </Link>
                  </TableCell>
                  <TableCell
                    className="max-w-xs whitespace-normal break-words text-muted-foreground"
                    title={row.line.memo ?? row.journalEntry.memo ?? undefined}
                  >
                    {row.line.memo ?? row.journalEntry.memo ?? "-"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {row.line.debitCents > 0 ? formatCurrency(row.line.debitCents) : "-"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {row.line.creditCents > 0 ? formatCurrency(row.line.creditCents) : "-"}
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium">
                    {formatCurrency(row.runningBalance)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </PageShell>
  );
}
