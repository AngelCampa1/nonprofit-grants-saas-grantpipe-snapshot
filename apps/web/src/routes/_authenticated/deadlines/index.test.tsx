import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RadarObligation, RadarUrgencyBand } from "@grantpipe/shared";

const hoisted = vi.hoisted(() => ({
  mockCreateFileRoute: vi.fn((path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
  })),
  mockUseDeadlineRadar: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: hoisted.mockCreateFileRoute,
  Link: ({
    children,
    to,
    params,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    to?: string;
    params?: Record<string, string>;
  }) => (
    <a
      href={Object.entries(params ?? {}).reduce(
        (path, [key, value]) => path.replace(`$${key}`, value),
        to ?? "",
      )}
      data-to={to}
      data-params={JSON.stringify(params ?? {})}
      {...props}
    >
      {children}
    </a>
  ),
}));

vi.mock("@grantpipe/ui", () => ({
  Card: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  CardContent: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  CardHeader: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  CardTitle: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 {...props}>{children}</h2>
  ),
  Badge: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  PageShell: ({ children }: React.HTMLAttributes<HTMLDivElement>) => (
    <div data-slot="page-shell">{children}</div>
  ),
  PageHeader: ({ title }: { title: React.ReactNode }) => (
    <div data-slot="page-header">
      <h1 data-slot="page-header-title">{title}</h1>
    </div>
  ),
  StatusPanel: ({
    title,
    children,
    variant,
  }: React.HTMLAttributes<HTMLDivElement> & { title?: React.ReactNode; variant?: string }) => (
    <div data-slot="status-panel" data-variant={variant}>
      {title ? <p data-slot="status-panel-title">{title}</p> : null}
      <div data-slot="status-panel-description">{children}</div>
    </div>
  ),
}));

vi.mock("../../../hooks/use-deadline-radar", () => ({
  useDeadlineRadar: hoisted.mockUseDeadlineRadar,
}));

vi.mock("../../../components/shell/page-tabs", () => ({
  AppPageTabs: ({
    groupId,
    items,
  }: {
    groupId: string;
    items: Array<{ to: string; label: string }>;
  }) => (
    <nav aria-label={`${groupId.charAt(0).toUpperCase()}${groupId.slice(1)} sections`}>
      {items.map((item) => (
        <a key={item.to} href={item.to}>
          {item.label}
        </a>
      ))}
    </nav>
  ),
}));

import { RadarPage, formatDueLabel, getBandBadgeVariant, getObligationLink } from "./index";

function makeObligation(overrides: Partial<RadarObligation> = {}): RadarObligation {
  return {
    id: "reporting_requirement:r1",
    kind: "reporting_requirement",
    title: "Q2 financial report",
    contextLabel: "City Wellness Grant",
    dueDate: "2026-06-20",
    daysUntilDue: 5,
    status: "upcoming",
    urgencyBand: "this_week",
    target: { type: "grant", id: "grant-1" },
    ...overrides,
  };
}

const emptyBands: Record<RadarUrgencyBand, RadarObligation[]> = {
  overdue: [],
  due_today: [],
  this_week: [],
  this_month: [],
  later: [],
};

describe("getBandBadgeVariant", () => {
  it("maps each band to a tone", () => {
    expect(getBandBadgeVariant("overdue")).toBe("destructive");
    expect(getBandBadgeVariant("due_today")).toBe("warning");
    expect(getBandBadgeVariant("this_week")).toBe("warning");
    expect(getBandBadgeVariant("this_month")).toBe("secondary");
    expect(getBandBadgeVariant("later")).toBe("secondary");
  });
});

describe("formatDueLabel", () => {
  it("labels due today, overdue, and upcoming obligations", () => {
    expect(formatDueLabel(makeObligation({ daysUntilDue: 0, dueDate: "2026-06-15" }))).toContain(
      "Due today",
    );
    expect(formatDueLabel(makeObligation({ daysUntilDue: -1 }))).toContain("1 day overdue");
    expect(formatDueLabel(makeObligation({ daysUntilDue: -3 }))).toContain("3 days overdue");
    expect(formatDueLabel(makeObligation({ daysUntilDue: 1 }))).toContain("In 1 day");
    expect(formatDueLabel(makeObligation({ daysUntilDue: 5 }))).toContain("In 5 days");
  });
});

describe("getObligationLink", () => {
  it("routes grant, fund, and fiscal period targets", () => {
    expect(getObligationLink(makeObligation({ target: { type: "grant", id: "g1" } }))).toEqual({
      to: "/grants/$grantId",
      params: { grantId: "g1" },
      ariaLabel: "Open grant for Q2 financial report",
    });
    expect(getObligationLink(makeObligation({ target: { type: "fund", id: "f1" } }))).toEqual({
      to: "/funds/$fundId",
      params: { fundId: "f1" },
      ariaLabel: "Open fund for Q2 financial report",
    });
    expect(
      getObligationLink(makeObligation({ target: { type: "fiscal_period", id: "p1" } })),
    ).toEqual({
      to: "/accounting/periods",
      params: {},
      ariaLabel: "Open fiscal periods for Q2 financial report",
    });
  });
});

describe("RadarPage", () => {
  it("renders the Deadlines tab strip with Radar and Calendar links", () => {
    hoisted.mockUseDeadlineRadar.mockReturnValue({ isLoading: true, isError: false });
    render(<RadarPage />);
    const tabNav = screen.getByRole("navigation", { name: "Deadlines sections" });
    expect(within(tabNav).getByText("Radar")).toBeInTheDocument();
    expect(within(tabNav).getByText("Calendar")).toBeInTheDocument();
  });

  beforeEach(() => {
    hoisted.mockUseDeadlineRadar.mockReset();
    hoisted.mockCreateFileRoute.mockClear();
  });

  it("renders the loading state", () => {
    hoisted.mockUseDeadlineRadar.mockReturnValue({ isLoading: true, isError: false });
    render(<RadarPage />);
    expect(screen.getByText("Loading deadlines…")).toBeInTheDocument();
  });

  it("renders the error state", () => {
    hoisted.mockUseDeadlineRadar.mockReturnValue({ isLoading: false, isError: true });
    render(<RadarPage />);
    expect(screen.getByText("Unable to load deadlines.")).toBeInTheDocument();
  });

  it("renders an honest empty state when nothing is due", () => {
    hoisted.mockUseDeadlineRadar.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { asOf: "2026-06-15", bands: emptyBands, totals: {} },
    });
    render(<RadarPage />);
    expect(screen.getByText("Nothing is due")).toBeInTheDocument();
  });

  it("renders the banded feed with counts and source links", () => {
    hoisted.mockUseDeadlineRadar.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        asOf: "2026-06-15",
        bands: {
          ...emptyBands,
          overdue: [
            makeObligation({
              id: "period_close:p1",
              kind: "period_close",
              title: "May close",
              status: "overdue",
              urgencyBand: "overdue",
              daysUntilDue: -2,
              target: { type: "fiscal_period", id: "period-1" },
            }),
          ],
          this_week: [makeObligation()],
        },
        totals: { reporting_requirement: 1, period_close: 1 },
      },
    });
    render(<RadarPage />);

    expect(screen.getByRole("heading", { name: "Deadline Radar" })).toBeInTheDocument();
    const feed = screen.getByTestId("radar-feed");
    expect(within(feed).getByText("Overdue")).toBeInTheDocument();
    expect(within(feed).getByText("This week")).toBeInTheDocument();
    expect(screen.getAllByTestId("radar-row")).toHaveLength(2);

    const grantLink = screen.getByRole("link", { name: "Open grant for Q2 financial report" });
    expect(grantLink).toHaveAttribute("data-to", "/grants/$grantId");
    const periodLink = screen.getByRole("link", { name: "Open fiscal periods for May close" });
    expect(periodLink).toHaveAttribute("data-to", "/accounting/periods");
  });

  it("toggles kind chips and updates the radar filters", () => {
    hoisted.mockUseDeadlineRadar.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { asOf: "2026-06-15", bands: emptyBands, totals: {} },
    });
    render(<RadarPage />);

    const kindGroup = screen.getByRole("group", { name: "Filter by obligation type" });
    const reportingChip = within(kindGroup).getByRole("button", { name: "Reporting" });
    expect(reportingChip).toHaveAttribute("aria-pressed", "false");
    expect(reportingChip).toHaveClass("rounded-full");

    fireEvent.click(reportingChip);
    expect(hoisted.mockUseDeadlineRadar.mock.calls.at(-1)?.[0]).toEqual({
      kinds: ["reporting_requirement"],
      status: undefined,
    });

    fireEvent.click(reportingChip);
    expect(hoisted.mockUseDeadlineRadar.mock.calls.at(-1)?.[0]).toEqual({
      kinds: undefined,
      status: undefined,
    });
  });

  it("applies the status filter", () => {
    hoisted.mockUseDeadlineRadar.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { asOf: "2026-06-15", bands: emptyBands, totals: {} },
    });
    render(<RadarPage />);

    const statusGroup = screen.getByRole("group", { name: "Filter by status" });
    fireEvent.click(within(statusGroup).getByRole("button", { name: "Overdue" }));
    expect(hoisted.mockUseDeadlineRadar.mock.calls.at(-1)?.[0]).toEqual({
      kinds: undefined,
      status: "overdue",
    });
  });
});
