import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  AreaChart: ({
    children,
    data,
    height,
    margin,
    width,
  }: {
    children: React.ReactNode;
    data: unknown[];
    height?: number;
    margin: Record<string, number>;
    width?: number;
  }) => (
    <div
      data-testid="area-chart"
      data-height={String(height)}
      data-margin={JSON.stringify(margin)}
      data-points={data.length}
      data-width={String(width)}
    >
      {children}
    </div>
  ),
  Area: ({
    activeDot,
    dataKey,
    dot,
    fill,
    stroke,
    strokeWidth,
  }: {
    activeDot: Record<string, number>;
    dataKey: string;
    dot: boolean;
    fill: string;
    stroke: string;
    strokeWidth: number;
  }) => (
    <div
      data-testid="area"
      data-active-dot={JSON.stringify(activeDot)}
      data-data-key={dataKey}
      data-dot={String(dot)}
      data-fill={fill}
      data-stroke={stroke}
      data-stroke-width={String(strokeWidth)}
    />
  ),
  Tooltip: ({
    content,
  }: {
    content: (props: {
      active?: boolean;
      payload?: Array<{ payload: unknown }>;
    }) => React.ReactNode;
  }) => (
    <div data-testid="tooltip">
      {content({
        active: true,
        payload: [
          {
            payload: {
              fiscalYear: "FY2024",
              rate: 81,
              donorCount: 200,
              retainedCount: 162,
            },
          },
        ],
      })}
    </div>
  ),
  XAxis: ({ dataKey }: { dataKey: string }) => <div data-testid="x-axis" data-key={dataKey} />,
  YAxis: ({ domain }: { domain: [number, number] }) => (
    <div data-testid="y-axis" data-domain={domain.join(",")} />
  ),
}));

import { RetentionChart } from "./retention-chart";

describe("RetentionChart with mocked Recharts primitives", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the chart with a measured width instead of a responsive wrapper", () => {
    const { queryByTestId } = render(
      <RetentionChart
        data={[
          {
            fiscalYear: "FY2024",
            retentionRate: 0.812,
            donorCount: 200,
            retainedCount: 162,
          },
        ]}
      />,
    );

    expect(queryByTestId("responsive-container")).not.toBeInTheDocument();
    expect(screen.getByTestId("area-chart")).toHaveAttribute("data-width", "200");
    expect(screen.getByTestId("area-chart")).toHaveAttribute("data-height", "60");
  });

  it("adapts the chart width to a narrower container", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 140,
      height: 60,
      top: 0,
      left: 0,
      right: 140,
      bottom: 60,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    render(
      <RetentionChart
        data={[
          {
            fiscalYear: "FY2024",
            retentionRate: 0.812,
            donorCount: 200,
            retainedCount: 162,
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("area-chart")).toHaveAttribute("data-width", "140");
    });
  });

  it("passes the computed chart data and area configuration into Recharts", () => {
    render(
      <RetentionChart
        data={[
          {
            fiscalYear: "FY2024",
            retentionRate: 0.812,
            donorCount: 200,
            retainedCount: 162,
          },
        ]}
      />,
    );

    expect(screen.getByTestId("area-chart")).toHaveAttribute("data-points", "1");
    expect(screen.getByTestId("area-chart")).toHaveAttribute("data-width", "200");
    expect(screen.getByTestId("area-chart")).toHaveAttribute("data-height", "60");
    expect(screen.getByTestId("x-axis")).toHaveAttribute("data-key", "fiscalYear");
    expect(screen.getByTestId("y-axis")).toHaveAttribute("data-domain", "0,100");
    expect(screen.getByTestId("area")).toHaveAttribute("data-data-key", "rate");
    // The stroke uses the resolved --color-primary CSS variable; in a jsdom
    // environment without the stylesheet loaded this falls back to the
    // light-mode primary oklch.
    expect(screen.getByTestId("area")).toHaveAttribute("data-stroke", "oklch(0.42 0.13 165)");
    expect(screen.getByTestId("area")).toHaveAttribute("data-fill", "url(#retentionGradient)");
    expect(screen.getByTestId("area")).toHaveAttribute("data-dot", "false");
    expect(screen.getByTestId("area")).toHaveAttribute("data-stroke-width", "1.5");
    expect(screen.getByTestId("tooltip")).toHaveTextContent("Retention rate81.0%");
    expect(screen.queryByTestId("responsive-container")).not.toBeInTheDocument();
  });
});
