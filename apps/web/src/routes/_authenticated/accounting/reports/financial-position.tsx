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
import { useFinancialPosition } from "../../../../hooks/use-accounting";
import { formatCurrency, formatUtcCalendarDate, todayLocalDateInput } from "../../../../lib/format";
import { escapeCsvCell } from "@grantpipe/shared";
import { BookOpen, Download, Printer } from "lucide-react";
import { ReportBrandHeader } from "../../../../components/report-brand-header";
import { downloadGeneratedCsv } from "../../../../lib/download";

export const Route = createFileRoute("/_authenticated/accounting/reports/financial-position")({
  component: FinancialPositionPage,
});

type FinancialPositionItem = {
  accountId: string;
  code: string;
  name: string;
  balanceCents: number;
};

type FinancialPositionReport = {
  assets: { total: number; items: FinancialPositionItem[] };
  liabilities: { total: number; items: FinancialPositionItem[] };
  netAssets: {
    unrestricted: number;
    temporarilyRestricted: number;
    permanentlyRestricted: number;
    total: number;
  };
  totalLiabilitiesAndNetAssets: number;
};

export function buildFinancialPositionCsv(report: FinancialPositionReport): string {
  const fmt = (cents: number) => (cents / 100).toFixed(2);
  const cell = escapeCsvCell;
  const lines: string[] = ["Section,Account Code,Account Name,Balance"];
  for (const item of report.assets.items) {
    lines.push(
      [cell("Assets"), cell(item.code), cell(item.name), cell(fmt(item.balanceCents))].join(","),
    );
  }
  lines.push(["Assets Total", "", "", cell(fmt(report.assets.total))].join(","));
  for (const item of report.liabilities.items) {
    lines.push(
      [cell("Liabilities"), cell(item.code), cell(item.name), cell(fmt(item.balanceCents))].join(
        ",",
      ),
    );
  }
  lines.push(["Liabilities Total", "", "", cell(fmt(report.liabilities.total))].join(","));
  lines.push(
    [cell("Net Assets - Unrestricted"), "", "", cell(fmt(report.netAssets.unrestricted))].join(","),
  );
  lines.push(
    [
      cell("Net Assets - Temporarily Restricted"),
      "",
      "",
      cell(fmt(report.netAssets.temporarilyRestricted)),
    ].join(","),
  );
  lines.push(
    [
      cell("Net Assets - Permanently Restricted"),
      "",
      "",
      cell(fmt(report.netAssets.permanentlyRestricted)),
    ].join(","),
  );
  lines.push(["Net Assets Total", "", "", cell(fmt(report.netAssets.total))].join(","));
  lines.push(
    [
      cell("Total Liabilities and Net Assets"),
      "",
      "",
      cell(fmt(report.totalLiabilitiesAndNetAssets)),
    ].join(","),
  );
  return lines.join("\n");
}

export function FinancialPositionPage() {
  const today = todayLocalDateInput();
  const [asOfDate, setAsOfDate] = useState(today);
  const [generated, setGenerated] = useState(false);

  const asOfIso = `${asOfDate}T23:59:59.999Z`;
  const reportQuery = useFinancialPosition(generated ? asOfIso : "");

  const report = reportQuery.data;

  function handleGenerate() {
    setGenerated(true);
  }

  function handleExportCsv() {
    if (!report) return;
    const csv = buildFinancialPositionCsv(report);
    const slug = asOfDate.replace(/-/g, "");
    downloadGeneratedCsv(csv, `financial-position-${slug}.csv`, {
      feature: "accounting",
      operation: "financial_position_export_csv",
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
        title="Statement of Financial Position"
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

      <div className="flex items-end gap-4 print:hidden">
        <div className="space-y-1">
          <Label htmlFor="sfp-as-of">As of date</Label>
          <Input
            id="sfp-as-of"
            type="date"
            value={asOfDate}
            onChange={(e) => {
              setAsOfDate(e.target.value);
              setGenerated(false);
            }}
            className="w-44"
          />
        </div>
        <Button onClick={handleGenerate} disabled={!asOfDate || reportQuery.isLoading}>
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
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : report ? (
        <div className="space-y-8">
          <ReportBrandHeader
            title="Statement of Financial Position"
            description="Balance sheet view of assets, liabilities, and net assets"
            dateLabel={`As of ${formatUtcCalendarDate(asOfIso)}`}
          />

          <div className="grid gap-8 lg:grid-cols-2">
            {/* Left column: Assets */}
            <div className="space-y-4">
              <h3 className="border-b border-border pb-2 text-base font-semibold">Assets</h3>
              {report.assets.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No assets.</p>
              ) : (
                <div
                  className="overflow-x-auto print:overflow-visible"
                  data-testid="financial-position-assets-table-scroll"
                >
                  <table className="min-w-[420px] w-full text-sm">
                    <tbody>
                      {report.assets.items.map((item) => (
                        <tr key={item.accountId} className="border-b border-border/30">
                          <td className="py-1.5 font-mono text-xs text-muted-foreground">
                            {item.code}
                          </td>
                          <td className="py-1.5 pl-3">{item.name}</td>
                          <td className="py-1.5 text-right font-mono">
                            {formatCurrency(item.balanceCents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border">
                        <td colSpan={2} className="py-2 font-semibold">
                          Total Assets
                        </td>
                        <td className="py-2 text-right font-mono font-semibold">
                          {formatCurrency(report.assets.total)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Right column: Liabilities + Net Assets */}
            <div className="space-y-6">
              <div className="space-y-4">
                <h3 className="border-b border-border pb-2 text-base font-semibold">Liabilities</h3>
                {report.liabilities.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No liabilities.</p>
                ) : (
                  <div
                    className="overflow-x-auto print:overflow-visible"
                    data-testid="financial-position-liabilities-table-scroll"
                  >
                    <table className="min-w-[420px] w-full text-sm">
                      <tbody>
                        {report.liabilities.items.map((item) => (
                          <tr key={item.accountId} className="border-b border-border/30">
                            <td className="py-1.5 font-mono text-xs text-muted-foreground">
                              {item.code}
                            </td>
                            <td className="py-1.5 pl-3">{item.name}</td>
                            <td className="py-1.5 text-right font-mono">
                              {formatCurrency(item.balanceCents)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-border">
                          <td colSpan={2} className="py-2 font-semibold">
                            Total Liabilities
                          </td>
                          <td className="py-2 text-right font-mono font-semibold">
                            {formatCurrency(report.liabilities.total)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <h3 className="border-b border-border pb-2 text-base font-semibold">Net Assets</h3>
                <div
                  className="overflow-x-auto print:overflow-visible"
                  data-testid="financial-position-net-assets-table-scroll"
                >
                  <table className="min-w-[420px] w-full text-sm">
                    <tbody>
                      <tr className="border-b border-border/30">
                        <td className="py-1.5">Without Donor Restrictions</td>
                        <td className="py-1.5 text-right font-mono">
                          {formatCurrency(report.netAssets.unrestricted)}
                        </td>
                      </tr>
                      <tr className="border-b border-border/30">
                        <td className="py-1.5">With Donor Restrictions (Temporary)</td>
                        <td className="py-1.5 text-right font-mono">
                          {formatCurrency(report.netAssets.temporarilyRestricted)}
                        </td>
                      </tr>
                      <tr className="border-b border-border/30">
                        <td className="py-1.5">With Donor Restrictions (Permanent)</td>
                        <td className="py-1.5 text-right font-mono">
                          {formatCurrency(report.netAssets.permanentlyRestricted)}
                        </td>
                      </tr>
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border">
                        <td className="py-2 font-semibold">Total Net Assets</td>
                        <td className="py-2 text-right font-mono font-semibold">
                          {formatCurrency(report.netAssets.total)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="border-t-2 border-border pt-2">
                  <div className="flex justify-between text-sm font-bold">
                    <span>Total Liabilities and Net Assets</span>
                    <span className="font-mono">
                      {formatCurrency(report.totalLiabilitiesAndNetAssets)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <TeachAndActEmptyState
          icon={<BookOpen className="size-5" />}
          heading="See what you own and owe"
          description="Pick a date above. We build your balance sheet."
          primaryAction={{
            label: "Generate report",
            onClick: handleGenerate,
          }}
        />
      )}
    </PageShell>
  );
}
