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
  TeachAndActEmptyState,
} from "@grantpipe/ui";
import { useStatementOfActivities } from "../../../../hooks/use-accounting";
import { formatCurrency, formatUtcCalendarDate } from "../../../../lib/format";
import { escapeCsvCell } from "@grantpipe/shared";
import { BookOpen, Download, Printer } from "lucide-react";
import { ReportBrandHeader } from "../../../../components/report-brand-header";
import { downloadGeneratedCsv } from "../../../../lib/download";

export const Route = createFileRoute("/_authenticated/accounting/reports/activities")({
  component: ActivitiesPage,
});

type ActivitiesRow = {
  name: string;
  withoutRestrictions: number;
  withRestrictions: number;
  total: number;
};

type ActivitiesReport = {
  revenue: ActivitiesRow[];
  releases: { withoutRestrictions: number; withRestrictions: number };
  expenses: ActivitiesRow[];
  changeInNetAssets: { withoutRestrictions: number; withRestrictions: number; total: number };
  beginningNetAssets: { withoutRestrictions: number; withRestrictions: number; total: number };
  endingNetAssets: { withoutRestrictions: number; withRestrictions: number; total: number };
};

export function buildActivitiesCsv(report: ActivitiesReport): string {
  const fmt = (cents: number) => (cents / 100).toFixed(2);
  const cell = escapeCsvCell;
  const row = (section: string, name: string, wo: number, w: number, total: number) =>
    [cell(section), cell(name), cell(fmt(wo)), cell(fmt(w)), cell(fmt(total))].join(",");

  const lines: string[] = ["Section,Account Name,Without Restrictions,With Restrictions,Total"];
  for (const r of report.revenue) {
    lines.push(row("Revenue", r.name, r.withoutRestrictions, r.withRestrictions, r.total));
  }
  lines.push(
    row(
      "Releases from Restrictions",
      "",
      report.releases.withoutRestrictions,
      report.releases.withRestrictions,
      report.releases.withoutRestrictions + report.releases.withRestrictions,
    ),
  );
  for (const r of report.expenses) {
    lines.push(row("Expenses", r.name, r.withoutRestrictions, r.withRestrictions, r.total));
  }
  lines.push(
    row(
      "Change in Net Assets",
      "",
      report.changeInNetAssets.withoutRestrictions,
      report.changeInNetAssets.withRestrictions,
      report.changeInNetAssets.total,
    ),
  );
  lines.push(
    row(
      "Beginning Net Assets",
      "",
      report.beginningNetAssets.withoutRestrictions,
      report.beginningNetAssets.withRestrictions,
      report.beginningNetAssets.total,
    ),
  );
  lines.push(
    row(
      "Ending Net Assets",
      "",
      report.endingNetAssets.withoutRestrictions,
      report.endingNetAssets.withRestrictions,
      report.endingNetAssets.total,
    ),
  );

  return lines.join("\n");
}

export function ActivitiesPage() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const defaultFrom = `${currentYear}-01-01`;
  const defaultTo = now.toISOString().slice(0, 10);

  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [generated, setGenerated] = useState(false);

  const fromIso = `${fromDate}T00:00:00.000Z`;
  const toIso = `${toDate}T23:59:59.999Z`;

  const reportQuery = useStatementOfActivities(generated ? fromIso : "", generated ? toIso : "");

  const report = reportQuery.data;

  function handleGenerate() {
    setGenerated(true);
  }

  function handleExportCsv() {
    if (!report) return;
    const csv = buildActivitiesCsv(report);
    const fromSlug = fromDate.replace(/-/g, "");
    const toSlug = toDate.replace(/-/g, "");
    downloadGeneratedCsv(csv, `activities-${fromSlug}-${toSlug}.csv`, {
      feature: "accounting",
      operation: "activities_export_csv",
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
        title="Statement of Activities"
        actions={
          report ? (
            <div className="flex items-center gap-2 print:hidden">
              <Button variant="outline" size="sm" onClick={handleExportCsv}>
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
          <Label htmlFor="soa-from">From</Label>
          <Input
            id="soa-from"
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
          <Label htmlFor="soa-to">To</Label>
          <Input
            id="soa-to"
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
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : report ? (
        <div className="max-w-3xl space-y-8">
          <ReportBrandHeader
            title="Statement of Activities"
            description="Revenue, expenses, and changes in net assets"
            dateLabel={`${formatUtcCalendarDate(fromIso)} - ${formatUtcCalendarDate(toIso)}`}
          />

          <div
            className="overflow-x-auto print:overflow-visible"
            data-testid="activities-report-table-scroll"
          >
            <table className="min-w-[720px] w-full text-sm">
              <thead>
                <tr className="border-b-2 border-border">
                  <th className="pb-2 text-left font-semibold">Account</th>
                  <th className="pb-2 text-right font-semibold">Without Restrictions</th>
                  <th className="pb-2 text-right font-semibold">With Restrictions</th>
                  <th className="pb-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {/* Revenue */}
                <tr>
                  <td
                    colSpan={4}
                    className="py-2 font-semibold text-muted-foreground uppercase text-xs tracking-wider"
                  >
                    Revenue
                  </td>
                </tr>
                {report.revenue.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-1.5 text-muted-foreground italic">
                      No revenue in this period.
                    </td>
                  </tr>
                ) : (
                  report.revenue.map((row) => (
                    <tr key={row.accountId} className="border-b border-border/30">
                      <td className="py-1.5 pl-4">{row.name}</td>
                      <td className="py-1.5 text-right font-mono">
                        {formatCurrency(row.withoutRestrictions)}
                      </td>
                      <td className="py-1.5 text-right font-mono">
                        {formatCurrency(row.withRestrictions)}
                      </td>
                      <td className="py-1.5 text-right font-mono">{formatCurrency(row.total)}</td>
                    </tr>
                  ))
                )}

                {/* Releases from restrictions */}
                <tr className="border-b border-border/30 italic">
                  <td className="py-1.5 pl-4 text-muted-foreground">
                    Net assets released from restrictions
                  </td>
                  <td className="py-1.5 text-right font-mono">
                    {formatCurrency(report.releases.withoutRestrictions)}
                  </td>
                  <td className="py-1.5 text-right font-mono">
                    {formatCurrency(report.releases.withRestrictions)}
                  </td>
                  <td className="py-1.5 text-right font-mono">
                    {formatCurrency(
                      report.releases.withoutRestrictions + report.releases.withRestrictions,
                    )}
                  </td>
                </tr>

                {/* Total Revenue spacer */}
                <tr className="border-b border-border">
                  <td className="py-2 font-semibold">Total Revenue</td>
                  <td className="py-2 text-right font-mono font-semibold">
                    {formatCurrency(
                      report.revenue.reduce((s, r) => s + r.withoutRestrictions, 0) +
                        report.releases.withoutRestrictions,
                    )}
                  </td>
                  <td className="py-2 text-right font-mono font-semibold">
                    {formatCurrency(
                      report.revenue.reduce((s, r) => s + r.withRestrictions, 0) +
                        report.releases.withRestrictions,
                    )}
                  </td>
                  <td className="py-2 text-right font-mono font-semibold">
                    {formatCurrency(
                      report.revenue.reduce((s, r) => s + r.total, 0) +
                        report.releases.withoutRestrictions +
                        report.releases.withRestrictions,
                    )}
                  </td>
                </tr>

                {/* Expenses */}
                <tr>
                  <td
                    colSpan={4}
                    className="py-2 font-semibold text-muted-foreground uppercase text-xs tracking-wider"
                  >
                    Expenses
                  </td>
                </tr>
                {report.expenses.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-1.5 text-muted-foreground italic">
                      No expenses in this period.
                    </td>
                  </tr>
                ) : (
                  report.expenses.map((row) => (
                    <tr key={row.accountId} className="border-b border-border/30">
                      <td className="py-1.5 pl-4">{row.name}</td>
                      <td className="py-1.5 text-right font-mono">
                        {formatCurrency(row.withoutRestrictions)}
                      </td>
                      <td className="py-1.5 text-right font-mono">
                        {formatCurrency(row.withRestrictions)}
                      </td>
                      <td className="py-1.5 text-right font-mono">{formatCurrency(row.total)}</td>
                    </tr>
                  ))
                )}

                {/* Total Expenses */}
                <tr className="border-b-2 border-border">
                  <td className="py-2 font-semibold">Total Expenses</td>
                  <td className="py-2 text-right font-mono font-semibold">
                    {formatCurrency(report.expenses.reduce((s, r) => s + r.withoutRestrictions, 0))}
                  </td>
                  <td className="py-2 text-right font-mono font-semibold">
                    {formatCurrency(report.expenses.reduce((s, r) => s + r.withRestrictions, 0))}
                  </td>
                  <td className="py-2 text-right font-mono font-semibold">
                    {formatCurrency(report.expenses.reduce((s, r) => s + r.total, 0))}
                  </td>
                </tr>

                {/* Change in Net Assets */}
                <tr className="border-b border-border font-bold">
                  <td className="py-2">Change in Net Assets</td>
                  <td className="py-2 text-right font-mono">
                    {formatCurrency(report.changeInNetAssets.withoutRestrictions)}
                  </td>
                  <td className="py-2 text-right font-mono">
                    {formatCurrency(report.changeInNetAssets.withRestrictions)}
                  </td>
                  <td className="py-2 text-right font-mono">
                    {formatCurrency(report.changeInNetAssets.total)}
                  </td>
                </tr>

                {/* Net Assets at Beginning */}
                <tr className="border-b border-border/30">
                  <td className="py-1.5 text-muted-foreground">Net Assets, Beginning of Period</td>
                  <td className="py-1.5 text-right font-mono">
                    {formatCurrency(report.beginningNetAssets.withoutRestrictions)}
                  </td>
                  <td className="py-1.5 text-right font-mono">
                    {formatCurrency(report.beginningNetAssets.withRestrictions)}
                  </td>
                  <td className="py-1.5 text-right font-mono">
                    {formatCurrency(report.beginningNetAssets.total)}
                  </td>
                </tr>

                {/* Net Assets at End */}
                <tr className="font-bold">
                  <td className="py-2 border-t-2 border-border">Net Assets, End of Period</td>
                  <td className="py-2 border-t-2 border-border text-right font-mono">
                    {formatCurrency(report.endingNetAssets.withoutRestrictions)}
                  </td>
                  <td className="py-2 border-t-2 border-border text-right font-mono">
                    {formatCurrency(report.endingNetAssets.withRestrictions)}
                  </td>
                  <td className="py-2 border-t-2 border-border text-right font-mono">
                    {formatCurrency(report.endingNetAssets.total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <TeachAndActEmptyState
          icon={<BookOpen className="size-5" />}
          heading="See your income and spending"
          description="Pick your dates above. We build the report."
          primaryAction={{
            label: "Generate report",
            onClick: handleGenerate,
          }}
          helpLink={{
            label: "Statement of activities help",
            href: "/help#statement_of_activities_report",
          }}
        />
      )}
    </PageShell>
  );
}
