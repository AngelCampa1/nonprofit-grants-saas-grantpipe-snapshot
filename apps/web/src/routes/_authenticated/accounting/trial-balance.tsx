import React, { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Alert,
  Button,
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
  TeachAndActEmptyState,
} from "@grantpipe/ui";
import { useTrialBalance } from "../../../hooks/use-accounting";
import { formatCurrency, formatUtcCalendarDate, todayLocalDateInput } from "../../../lib/format";
import { escapeCsvCell } from "@grantpipe/shared";
import { BookOpen, Download } from "lucide-react";
import { downloadGeneratedCsv } from "../../../lib/download";

export const Route = createFileRoute("/_authenticated/accounting/trial-balance")({
  component: TrialBalancePage,
});

export function buildTrialBalanceCsv(
  asOf: string,
  rows: Array<{
    account: { code: string; name: string };
    debitTotal: number;
    creditTotal: number;
  }>,
  totalDebits: number,
  totalCredits: number,
): string {
  const header = `Trial Balance as of ${formatUtcCalendarDate(asOf)}\n\nCode,Name,Debit,Credit\n`;
  const lines = rows.map((r) => {
    const debit = r.debitTotal > 0 ? (r.debitTotal / 100).toFixed(2) : "";
    const credit = r.creditTotal > 0 ? (r.creditTotal / 100).toFixed(2) : "";
    return [r.account.code, r.account.name, debit, credit].map(escapeCsvCell).join(",");
  });
  const totalsRow = ["", "TOTALS", (totalDebits / 100).toFixed(2), (totalCredits / 100).toFixed(2)]
    .map(escapeCsvCell)
    .join(",");
  return header + lines.join("\n") + "\n" + totalsRow;
}

export function TrialBalancePage() {
  const today = todayLocalDateInput();
  const [asOfDate, setAsOfDate] = useState(today);

  const asOfIso = `${asOfDate}T23:59:59.999Z`;
  const trialBalanceQuery = useTrialBalance({ asOf: asOfIso });

  const rows = trialBalanceQuery.data ?? [];
  const totalDebits = rows.reduce((sum, r) => sum + r.debitTotal, 0);
  const totalCredits = rows.reduce((sum, r) => sum + r.creditTotal, 0);

  function handleExportCsv() {
    const csv = buildTrialBalanceCsv(asOfIso, rows, totalDebits, totalCredits);
    const slug = asOfDate.replace(/-/g, "");
    downloadGeneratedCsv(csv, `trial-balance-${slug}.csv`, {
      feature: "accounting",
      operation: "trial_balance_export_csv",
    });
  }

  return (
    <PageShell>
      <PageHeader
        variant="workbench"
        title="Trial Balance"
        actions={
          rows.length > 0 ? (
            <Button variant="outline" size="sm" onClick={handleExportCsv}>
              <Download className="mr-2 size-4" />
              Export CSV
            </Button>
          ) : undefined
        }
      />

      <div className="flex items-end gap-4">
        <div className="space-y-1">
          <Label htmlFor="tb-as-of">As of date</Label>
          <Input
            id="tb-as-of"
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="w-44"
          />
        </div>
      </div>

      {trialBalanceQuery.isError ? (
        <Alert variant="destructive" title="Unable to load trial balance.">
          <Button variant="outline" onClick={() => void trialBalanceQuery.refetch()}>
            Try again
          </Button>
        </Alert>
      ) : trialBalanceQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <TeachAndActEmptyState
          icon={<BookOpen className="size-5" />}
          heading="Trial balance"
          primaryAction={{
            label: "View chart of accounts",
            href: "/accounting/chart-of-accounts",
          }}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Debit Balance</TableHead>
              <TableHead className="text-right">Credit Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.account.id}>
                <TableCell className="font-mono text-sm">{row.account.code}</TableCell>
                <TableCell>{row.account.name}</TableCell>
                <TableCell className="text-right font-mono">
                  {row.debitTotal > 0 ? formatCurrency(row.debitTotal) : "-"}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {row.creditTotal > 0 ? formatCurrency(row.creditTotal) : "-"}
                </TableCell>
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
            </TableRow>
          </TableFooter>
        </Table>
      )}
    </PageShell>
  );
}
