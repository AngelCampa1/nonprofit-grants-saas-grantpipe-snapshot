import { formatNumber } from "@grantpipe/shared";
import { useThemeColor } from "@grantpipe/ui";
import { useLayoutEffect, useRef, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";

export interface RetentionDataPoint {
  fiscalYear: string;
  retentionRate: number;
  donorCount: number;
  retainedCount: number;
}

interface RetentionChartProps {
  data: RetentionDataPoint[];
}

interface ChartDataPoint {
  fiscalYear: string;
  rate: number;
  donorCount: number;
  retainedCount: number;
}

interface RetentionTooltipContentProps {
  active?: boolean;
  payload?: { payload: ChartDataPoint }[];
}

export function RetentionTooltip(props: RetentionTooltipContentProps) {
  const { active, payload } = props;
  if (!active || !payload || payload.length === 0) return null;

  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="min-w-44 rounded-2xl border border-border bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground shadow-lg">
      <p className="mb-2 font-semibold">{point.fiscalYear}</p>
      <dl className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted-foreground">Retention rate</dt>
          <dd className="font-medium tabular-nums">{point.rate.toFixed(1)}%</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted-foreground">Donors last year</dt>
          <dd className="font-medium tabular-nums">{formatNumber(point.donorCount)}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted-foreground">Retained this year</dt>
          <dd className="font-medium tabular-nums">{formatNumber(point.retainedCount)}</dd>
        </div>
      </dl>
    </div>
  );
}

export function renderRetentionTooltipContent(props: RetentionTooltipContentProps) {
  return <RetentionTooltip active={props.active} payload={props.payload} />;
}

export function RetentionChart({ data }: RetentionChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState(200);
  const chartColor = useThemeColor("--color-primary", "oklch(0.42 0.13 165)");

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateWidth = () => {
      const nextWidth = Math.round(container.getBoundingClientRect().width);
      setChartWidth(nextWidth > 0 ? nextWidth : 200);
    };

    updateWidth();

    const observer = new ResizeObserver(() => {
      updateWidth();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, []);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-chart-thumb-height text-xs text-muted-foreground">
        No retention data
      </div>
    );
  }

  const chartData: ChartDataPoint[] = data.map((d) => ({
    fiscalYear: d.fiscalYear,
    rate: Number((d.retentionRate * 100).toFixed(1)),
    donorCount: d.donorCount,
    retainedCount: d.retainedCount,
  }));

  return (
    <div ref={containerRef} className="w-full max-w-chart-thumb-width h-chart-thumb-height">
      <AreaChart
        width={chartWidth}
        height={60}
        data={chartData}
        margin={{ top: 2, right: 2, left: 2, bottom: 2 }}
      >
        <defs>
          <linearGradient id="retentionGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
            <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="fiscalYear" hide />
        <YAxis domain={[0, 100]} hide />
        <Tooltip
          content={(props) =>
            renderRetentionTooltipContent({
              active: props.active,
              payload: props.payload as unknown as { payload: ChartDataPoint }[] | undefined,
            })
          }
        />
        <Area
          type="monotone"
          dataKey="rate"
          stroke={chartColor}
          strokeWidth={1.5}
          fill="url(#retentionGradient)"
          dot={false}
          activeDot={{ r: 3 }}
        />
      </AreaChart>
    </div>
  );
}
