import { Card, CardContent, CardHeader, CardTitle, Skeleton } from "@grantpipe/ui";
import { formatCurrency } from "../../lib/format";
import { RetentionChart, type RetentionDataPoint } from "./retention-chart";

export interface DonorStats {
  totalDonors: number;
  newDonorsThisFY: number;
  retentionRate: number;
  totalGivingThisFY: number;
}

interface StatsBarProps {
  stats: DonorStats | undefined;
  retentionData: RetentionDataPoint[] | undefined;
  isLoading: boolean;
}

function formatRetentionRate(rate: number): string {
  return (rate * 100).toFixed(1) + "%";
}

function StatCardSkeleton() {
  return (
    <Card className="min-w-0 rounded-2xl border-border bg-card shadow-sm">
      <CardHeader>
        <Skeleton className="h-4 w-28" />
      </CardHeader>
      <CardContent>
        <Skeleton className="mb-1 h-8 w-20" />
        <Skeleton className="h-3 w-16" />
      </CardContent>
    </Card>
  );
}

export function StatsBar({ stats, retentionData, isLoading }: StatsBarProps) {
  if (isLoading) {
    return (
      <div data-testid="donor-stats-grid" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
    );
  }

  const totalDonors = stats !== undefined ? String(stats.totalDonors) : "--";
  const newDonors = stats !== undefined ? String(stats.newDonorsThisFY) : "--";
  const retentionRate = stats !== undefined ? formatRetentionRate(stats.retentionRate) : "--";
  const totalGiving = stats !== undefined ? formatCurrency(stats.totalGivingThisFY) : "--";

  return (
    <div data-testid="donor-stats-grid" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Card className="min-w-0 rounded-2xl border-border bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Total Donors</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{totalDonors}</p>
        </CardContent>
      </Card>

      <Card className="min-w-0 rounded-2xl border-border bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">New This FY</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{newDonors}</p>
        </CardContent>
      </Card>

      <Card className="min-w-0 rounded-2xl border-border bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Retention Rate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{retentionRate}</p>
          <RetentionChart data={retentionData ?? []} />
        </CardContent>
      </Card>

      <Card className="min-w-0 rounded-2xl border-border bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Giving This FY
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{totalGiving}</p>
        </CardContent>
      </Card>
    </div>
  );
}
