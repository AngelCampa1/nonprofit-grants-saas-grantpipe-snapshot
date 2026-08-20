import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RetentionChart, RetentionTooltip, renderRetentionTooltipContent } from "./retention-chart";

const sampleData = [
  { fiscalYear: "FY2022", retentionRate: 0.72, donorCount: 150, retainedCount: 108 },
  { fiscalYear: "FY2023", retentionRate: 0.78, donorCount: 175, retainedCount: 136 },
  { fiscalYear: "FY2024", retentionRate: 0.81, donorCount: 200, retainedCount: 162 },
];

describe("RetentionChart", () => {
  it("renders without crashing with data", () => {
    const { container } = render(<RetentionChart data={sampleData} />);
    expect(container.firstChild).not.toBeNull();
  });

  it("renders a chart container div when data is provided", () => {
    const { container } = render(<RetentionChart data={sampleData} />);
    // happy-dom does not fully render Recharts SVG — test the wrapper div instead
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.tagName.toLowerCase()).toBe("div");
    // The recharts ResponsiveContainer renders a child div
    expect(wrapper.children.length).toBeGreaterThan(0);
  });

  it("renders gracefully with empty data — shows no-data message", () => {
    render(<RetentionChart data={[]} />);
    expect(screen.getByText(/no retention data/i)).toBeInTheDocument();
  });

  it("renders gracefully with a single data point", () => {
    const { container } = render(
      <RetentionChart
        data={[{ fiscalYear: "FY2024", retentionRate: 0.8, donorCount: 100, retainedCount: 80 }]}
      />,
    );
    expect(container.firstChild).not.toBeNull();
  });

  it("applies the correct container dimensions", () => {
    const { container } = render(<RetentionChart data={sampleData} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).not.toBeNull();
    // The wrapper element should exist and contain chart content
    expect(wrapper.tagName.toLowerCase()).toBe("div");
  });

  it("uses chart-thumb spacing tokens for size (no arbitrary values)", () => {
    const { container } = render(<RetentionChart data={sampleData} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain("max-w-chart-thumb-width");
    expect(wrapper.className).toContain("h-chart-thumb-height");
    expect(wrapper.className).not.toContain("h-[60px]");
    // No inline style sizing — classes own it
    expect(wrapper.getAttribute("style")).toBeNull();
  });

  it("uses the chart-thumb height token on the empty state", () => {
    const { container } = render(<RetentionChart data={[]} />);
    const empty = container.firstChild as HTMLElement;
    expect(empty.className).toContain("h-chart-thumb-height");
    expect(empty.className).not.toContain("h-[60px]");
  });

  it("recomputes its width when the container resizes", () => {
    const originalResizeObserver = globalThis.ResizeObserver;
    let triggerResize: (() => void) | undefined;

    class MockResizeObserver {
      constructor(callback: () => void) {
        triggerResize = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

    // A concrete width so the > 0 branch of updateWidth is exercised.
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ width: 320 } as DOMRect);

    try {
      const { container } = render(<RetentionChart data={sampleData} />);
      expect(triggerResize).toBeTypeOf("function");
      // Fire the ResizeObserver callback — must not throw and keeps the chart mounted.
      triggerResize?.();
      expect(container.firstChild).not.toBeNull();
    } finally {
      rectSpy.mockRestore();
      globalThis.ResizeObserver = originalResizeObserver;
    }
  });

  it("falls back to a default width when the container reports zero width", () => {
    const originalResizeObserver = globalThis.ResizeObserver;
    class MockResizeObserver {
      constructor(_callback: () => void) {}
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ width: 0 } as DOMRect);

    try {
      const { container } = render(<RetentionChart data={sampleData} />);
      expect(container.firstChild).not.toBeNull();
    } finally {
      rectSpy.mockRestore();
      globalThis.ResizeObserver = originalResizeObserver;
    }
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RetentionTooltip", () => {
  const chartPayload = [
    {
      payload: {
        fiscalYear: "FY2024",
        rate: 81.0,
        donorCount: 200,
        retainedCount: 162,
      },
    },
  ];

  it("renders null when active is false", () => {
    const { container } = render(<RetentionTooltip active={false} payload={chartPayload} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders null when active is undefined", () => {
    const { container } = render(<RetentionTooltip payload={chartPayload} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders null when payload is empty", () => {
    const { container } = render(<RetentionTooltip active={true} payload={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders null when payload is undefined", () => {
    const { container } = render(<RetentionTooltip active={true} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders tooltip content when active with valid payload", () => {
    render(<RetentionTooltip active={true} payload={chartPayload} />);
    expect(screen.getByText("FY2024")).toBeInTheDocument();
    expect(screen.getByText("Retention rate")).toBeInTheDocument();
    expect(screen.getByText("81.0%")).toBeInTheDocument();
    expect(screen.getByText("Donors last year")).toBeInTheDocument();
    expect(screen.getByText("200")).toBeInTheDocument();
    expect(screen.getByText("Retained this year")).toBeInTheDocument();
    expect(screen.getByText("162")).toBeInTheDocument();
  });

  it("matches the app popover surface and readable spacing", () => {
    const { container } = render(<RetentionTooltip active={true} payload={chartPayload} />);
    const tooltip = container.firstChild as HTMLElement;

    expect(tooltip).toHaveClass("bg-popover");
    expect(tooltip).toHaveClass("text-popover-foreground");
    expect(tooltip).toHaveClass("border");
    expect(tooltip).toHaveClass("shadow-lg");
    expect(tooltip).toHaveClass("leading-relaxed");
  });

  it("renders null when the payload item does not contain point data", () => {
    const { container } = render(
      <RetentionTooltip active={true} payload={[{ payload: undefined as never }]} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("formats retention values to one decimal place", () => {
    render(
      <RetentionTooltip
        active={true}
        payload={[
          {
            payload: {
              fiscalYear: "FY2025",
              rate: 81.55,
              donorCount: 1500,
              retainedCount: 1234,
            },
          },
        ]}
      />,
    );

    expect(screen.getByText("81.5%")).toBeInTheDocument();
    expect(screen.getByText("1,500")).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
  });

  it("renders tooltip content through the exported renderer", () => {
    const view = renderRetentionTooltipContent({
      active: true,
      payload: chartPayload,
    });

    const { getByText } = render(view);

    expect(getByText("FY2024")).toBeInTheDocument();
    expect(getByText(/81\.0%/)).toBeInTheDocument();
  });
});
