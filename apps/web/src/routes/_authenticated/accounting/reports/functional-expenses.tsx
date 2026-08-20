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
import { useFunctionalExpenses } from "../../../../hooks/use-accounting";
import { formatCurrency, formatUtcCalendarDate } from "../../../../lib/format";
import { escapeCsvCell } from "@grantpipe/shared";
import { BookOpen, Download, Printer } from "lucide-react";
import { ReportBrandHeader } from "../../../../components/report-brand-header";
import { downloadGeneratedCsv } from "../../../../lib/download";

export const Route = createFileRoute("/_authenticated/accounting/reports/functional-expenses")({
  component: FunctionalExpensesPage,
});

type FunctionalExpensesRow = {
  accountId: string;
  name: string;
  program: number;
  management: number;
  fundraising: number;
  total: number;
};

type FunctionalExpensesReport = {
  rows: FunctionalExpensesRow[];
  totals: { program: number; management: number; fundraising: number; total: number };
};

export function buildFunctionalExpensesCsv(report: FunctionalExpensesReport): string {
  const fmt = (cents: number) => (cents / 100).toFixed(2);
  const cell = escapeCsvCell;
  const lines: string[] = ["Account Name,Program,Management,Fundraising,Total"];
  for (const r of report.rows) {
    lines.push(
      [
        cell(r.name),
        cell(fmt(r.program)),
        cell(fmt(r.management)),
        cell(fmt(r.fundraising)),
        cell(fmt(r.total)),
      ].join(","),
    );
  }
  lines.push(
    [
      cell("TOTAL"),
      cell(fmt(report.totals.program)),
      cell(fmt(report.totals.management)),
      cell(fmt(report.totals.fundraising)),
      cell(fmt(report.totals.total)),
    ].join(","),
  );
  return lines.join("\n");
}

export function FunctionalExpensesPage() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const defaultFrom = `${currentYear}-01-01`;
  const defaultTo = now.toISOString().slice(0, 10);

  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [generated, setGenerated] = useState(false);

  const fromIso = `${fromDate}T00:00:00.000Z`;
  const toIso = `${toDate}T23:59:59.999Z`;

  const reportQuery = useFunctionalExpenses(generated ? fromIso : "", generated ? toIso : "");

  const report = reportQuery.data;

  function handleGenerate() {
    setGenerated(true);
  }

  function handleExportCsv(reportToExport: NonNullable<typeof report>) {
    const csv = buildFunctionalExpensesCsv(reportToExport);
    const fromSlug = fromDate.replace(/-/g, "");
    const toSlug = toDate.replace(/-/g, "");
    downloadGeneratedCsv(csv, `functional-expenses-${fromSlug}-${toSlug}.csv`, {
      feature: "accounting",
      operation: "functional_expenses_export_csv",
    });
  }

  function handlePrint() {
    window.print();
  }

  return (
    <PageShell className="print:p-0">
      <PageHeader
        variant="workbench"
        className="print:hidden"
        title="Statement of Functional Expenses"
        actions={
          report ? (
            <div className="flex items-center gap-2 print:hidden">
              <Button variant="outline" size="sm" onClick={() => handleExportCsv(report)}>
                <Download className="mr-2 size-4" />
                Export CSV
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="mr-2 size-4" />
                Print
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-end gap-4 print:hidden">
        <div className="space-y-1">
          <Label htmlFor="sfe-from">From</Label>
          <Input
            id="sfe-from"
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setGenerated(false);
            }}
            className="w-44"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sfe-to">To</Label>
          <Input
            id="sfe-to"
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setGenerated(false);
            }}
            className="w-44"
          />
        </div>
        <Button onClick={handleGenerate} disabled={!fromDate || !toDate || reportQuery.isLoading}>
          {reportQuery.isLoading ? "Generating…" : "Generate"}
        </Button>
      </div>

      {reportQuery.isError ? (
        <Alert variant="destructive" title="Unable to load report.">
          <Button variant="outline" onClick={() => void reportQuery.refetch()}>
            Try again
          </Button>
        </Alert>
      ) : reportQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : report ? (
        <div className="space-y-4">
          <ReportBrandHeader
            title="Statement of Functional Expenses"
            description="Expenses split by program, management, and fundraising"
            dateLabel={`${formatUtcCalendarDate(fromIso)} - ${formatUtcCalendarDate(toIso)}`}
          />

          {report.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses in this period.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Expense Category</TableHead>
                  <TableHead className="text-right">Program</TableHead>
                  <TableHead className="text-right">Management</TableHead>
                  <TableHead className="text-right">Fundraising</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((row) => (
                  <TableRow key={row.accountId}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell className="text-right font-mono">
                      {row.program > 0 ? formatCurrency(row.program) : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {row.management > 0 ? formatCurrency(row.management) : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {row.fundraising > 0 ? formatCurrency(row.fundraising) : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(row.total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="font-semibold">Totals</TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {formatCurrency(report.totals.program)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {formatCurrency(report.totals.management)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {formatCurrency(report.totals.fundraising)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {formatCurrency(report.totals.total)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </div>
      ) : (
        <TeachAndActEmptyState
          icon={<BookOpen className="size-5" />}
          heading="See where your money goes"
          description="Pick your dates above. We sort spending by purpose."
          primaryAction={{
            label: "Generate report",
            onClick: handleGenerate,
          }}
          helpLink={{
            label: "Functional expenses help",
            href: "/help#functional_expenses_report",
          }}
        />
      )}
    </PageShell>
  );
}
