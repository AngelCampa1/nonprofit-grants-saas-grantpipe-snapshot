import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  mockCreateFileRoute: vi.fn((path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
  })),
  mockUseCalendarMonth: vi.fn(),
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
  AttentionBanner: ({
    title,
    description,
  }: React.HTMLAttributes<HTMLDivElement> & {
    title?: React.ReactNode;
    description?: React.ReactNode;
  }) => (
    <div data-slot="attention-banner" role="status">
      {title ? <p>{title}</p> : null}
      {description ? <p>{description}</p> : null}
    </div>
  ),
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  PageShell: ({ children, className }: React.HTMLAttributes<HTMLDivElement>) => (
    <div
      data-slot="page-shell"
      className={["space-y-8", "p-4", "sm:p-6", "lg:p-8", className].filter(Boolean).join(" ")}
    >
      {children}
    </div>
  ),
  PageHeader: ({
    title,
    description,
    kicker,
    actions,
  }: {
    title: React.ReactNode;
    description?: React.ReactNode;
    kicker?: React.ReactNode;
    actions?: React.ReactNode;
  }) => (
    <div data-slot="page-header">
      {kicker ? <p data-slot="page-header-kicker">{kicker}</p> : null}
      <h1 data-slot="page-header-title">{title}</h1>
      {description ? <p data-slot="page-header-description">{description}</p> : null}
      {actions ? <div data-slot="page-header-actions">{actions}</div> : null}
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

vi.mock("../../../hooks/use-overview", () => ({
  useCalendarMonth: hoisted.mockUseCalendarMonth,
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

import { CalendarPage, MONTH_KEY_RE, parseMonthKey } from "./calendar";

describe("MONTH_KEY_RE", () => {
  it("matches valid month keys", () => {
    expect(MONTH_KEY_RE.test("2026-04")).toBe(true);
    expect(MONTH_KEY_RE.test("2000-01")).toBe(true);
    expect(MONTH_KEY_RE.test("9999-12")).toBe(true);
  });

  it("does not match invalid month keys", () => {
    expect(MONTH_KEY_RE.test("2026-4")).toBe(false);
    expect(MONTH_KEY_RE.test("26-04")).toBe(false);
    expect(MONTH_KEY_RE.test("2026")).toBe(false);
    expect(MONTH_KEY_RE.test("not-a-date")).toBe(false);
    expect(MONTH_KEY_RE.test("")).toBe(false);
  });
});

describe("parseMonthKey", () => {
  it("parses valid month keys", () => {
    expect(parseMonthKey("2026-04")).toEqual({ year: 2026, month: 4 });
    expect(parseMonthKey("2000-01")).toEqual({ year: 2000, month: 1 });
    expect(parseMonthKey("9999-12")).toEqual({ year: 9999, month: 12 });
  });

  it("throws on malformed format", () => {
    expect(() => parseMonthKey("2026-4")).toThrow('Invalid monthKey format: "2026-4"');
    expect(() => parseMonthKey("26-04")).toThrow('Invalid monthKey format: "26-04"');
    expect(() => parseMonthKey("not-a-date")).toThrow('Invalid monthKey format: "not-a-date"');
    expect(() => parseMonthKey("")).toThrow('Invalid monthKey format: ""');
  });

  it("throws when month value is out of range", () => {
    expect(() => parseMonthKey("2026-00")).toThrow('Invalid monthKey values: "2026-00"');
    expect(() => parseMonthKey("2026-13")).toThrow('Invalid monthKey values: "2026-13"');
  });
});

describe("CalendarPage", () => {
  it("renders the Deadlines tab strip with Radar and Calendar links", () => {
    hoisted.mockUseCalendarMonth.mockReturnValue({
      data: { month: "2026-04", items: [] },
      isLoading: false,
      isError: false,
    });
    render(<CalendarPage />);
    const tabNav = screen.getByRole("navigation", { name: "Deadlines sections" });
    expect(within(tabNav).getByText("Radar")).toBeInTheDocument();
    expect(within(tabNav).getByText("Calendar")).toBeInTheDocument();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T12:00:00.000Z"));
    hoisted.mockUseCalendarMonth.mockReset();
    hoisted.mockCreateFileRoute.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders an empty calendar state", () => {
    hoisted.mockUseCalendarMonth.mockReturnValue({
      data: { month: "2026-04", items: [] },
      isLoading: false,
      isError: false,
    });

    render(<CalendarPage />);

    expect(screen.getByRole("heading", { name: "Calendar" })).toBeInTheDocument();
    expect(screen.getByText("Reporting & Compliance")).toBeInTheDocument();
    expect(screen.getByText("No deadlines scheduled this month")).toBeInTheDocument();
    expect(screen.getByText("No deadlines scheduled for April 2026.")).toBeInTheDocument();
    expect(screen.getByText("Sun")).toBeInTheDocument();
    expect(screen.getByText("Wed")).toBeInTheDocument();
    expect(screen.queryByText("No deadlines")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "April 8, 2026" })).toHaveAttribute(
      "data-calendar-day-state",
      "selected",
    );
    expect(screen.getByRole("button", { name: "April 1, 2026" })).toHaveAttribute(
      "data-calendar-day-state",
      "clear",
    );
    expect(screen.getByRole("button", { name: "April 2, 2026" })).toHaveAttribute(
      "data-calendar-day-state",
      "clear",
    );
    expect(screen.getByTestId("calendar-month-controls")).toHaveClass("grid-cols-3");
    expect(screen.getByTestId("calendar-day-grid")).toHaveClass("grid-cols-2");
    expect(screen.getByRole("button", { name: "April 1, 2026" })).toHaveClass("whitespace-normal");
  });

  it("renders a month grid and updates the selected-day agenda", () => {
    hoisted.mockUseCalendarMonth.mockImplementation((month: string) => ({
      data: {
        month,
        items:
          month === "2026-04"
            ? [
                {
                  id: "item-1",
                  title: "Application deadline",
                  date: "2026-04-14T00:00:00.000Z",
                  status: "upcoming",
                  kind: "application_deadline",
                  grantId: "grant-1",
                  grantName: "STEM Access",
                },
                {
                  id: "item-2",
                  title: "Final report",
                  date: "2026-04-18T00:00:00.000Z",
                  status: "submitted",
                  kind: "reporting_requirement",
                  grantId: "grant-1",
                  grantName: "STEM Access",
                },
                {
                  id: "item-3",
                  title: "Archive files",
                  date: "2026-04-18T00:00:00.000Z",
                  status: "completed",
                  kind: "closeout_item",
                },
                {
                  id: "item-5",
                  title: "Board packet",
                  date: "2026-04-18T00:00:00.000Z",
                  status: "upcoming",
                  kind: "reporting_requirement",
                  grantId: "grant-1",
                  grantName: "STEM Access",
                },
              ]
            : [
                {
                  id: "item-4",
                  title: "Closeout checklist due",
                  date: "2026-05-01T00:00:00.000Z",
                  status: "overdue",
                  kind: "closeout_item",
                  grantName: "Arts Bridge",
                },
              ],
      },
      isLoading: false,
      isError: false,
    }));

    render(<CalendarPage />);

    const dayGrid = screen.getByTestId("calendar-day-grid");
    expect(dayGrid.children[0]).toHaveAttribute("aria-hidden", "true");
    expect(dayGrid.children[1]).toHaveAttribute("aria-hidden", "true");
    expect(dayGrid.children[2]).toHaveAttribute("aria-hidden", "true");
    expect(dayGrid.children[3]).toHaveAttribute("aria-label", "April 1, 2026");
    const april14Button = screen.getByRole("button", {
      name: "April 14, 2026, 1 deadline due: Application deadline",
    });
    const april18Button = screen.getByRole("button", {
      name: "April 18, 2026, 3 deadlines due: Final report, Archive files, plus 1 more",
    });
    expect(april14Button).toBeInTheDocument();
    expect(april18Button).toBeInTheDocument();
    expect(april14Button).toHaveAttribute("data-has-deadlines", "true");
    expect(screen.getByRole("button", { name: "April 1, 2026" })).toHaveAttribute(
      "data-has-deadlines",
      "false",
    );
    expect(screen.getAllByText("Application deadline").length).toBeGreaterThan(0);
    expect(screen.getByText("Final report")).toBeInTheDocument();
    expect(screen.getByText("1 due")).toBeInTheDocument();
    expect(screen.getByText("3 due")).toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(april14Button).toHaveAttribute("data-calendar-day-state", "selected");
    expect(april18Button).toHaveAttribute("data-calendar-day-state", "deadline");
    expect(screen.getAllByText("Application deadline").length).toBeGreaterThan(0);
    expect(screen.getByText("Upcoming")).toBeInTheDocument();
    expect(screen.getByTestId("calendar-day-grid")).toHaveClass("md:grid-cols-7");
    expect(
      within(screen.getByRole("complementary", { name: "Selected day agenda" })).getByRole("link", {
        name: "Open grant STEM Access",
      }),
    ).toHaveAttribute("data-params", JSON.stringify({ grantId: "grant-1" }));

    fireEvent.click(april18Button);

    const agenda = screen.getByRole("complementary", { name: "Selected day agenda" });
    expect(agenda).toBeInTheDocument();
    expect(within(agenda).getByText("Final report")).toBeInTheDocument();
    expect(within(agenda).getByText("Archive files")).toBeInTheDocument();
    expect(within(agenda).getByText("3 deadlines queued")).toBeInTheDocument();
    expect(within(agenda).getByText("Submitted")).toBeInTheDocument();
    expect(within(agenda).getByText("Completed")).toBeInTheDocument();
    expect(within(agenda).getAllByText(/Reporting Requirement/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Next month" }));

    expect(dayGrid.children[0]).toHaveAttribute("aria-hidden", "true");
    expect(dayGrid.children[1]).toHaveAttribute("aria-hidden", "true");
    expect(dayGrid.children[2]).toHaveAttribute("aria-hidden", "true");
    expect(dayGrid.children[3]).toHaveAttribute("aria-hidden", "true");
    expect(dayGrid.children[4]).toHaveAttribute("aria-hidden", "true");
    expect(dayGrid.children[5]).toHaveAttribute(
      "aria-label",
      "May 1, 2026, 1 deadline due: Closeout checklist due",
    );
    expect(
      screen.getByRole("button", {
        name: "May 1, 2026, 1 deadline due: Closeout checklist due",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Closeout checklist due").length).toBeGreaterThan(0);
    expect(
      within(screen.getByRole("complementary", { name: "Selected day agenda" })).getByText(
        "Overdue",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));

    expect(
      screen.getByRole("button", {
        name: "April 14, 2026, 1 deadline due: Application deadline",
      }),
    ).toBeInTheDocument();
  });

  it("returns to the current month from the Today control", () => {
    hoisted.mockUseCalendarMonth.mockImplementation((month: string) => ({
      data: { month, items: [] },
      isLoading: false,
      isError: false,
    }));

    render(<CalendarPage />);

    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getAllByText("May 2026")).not.toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Today" }));

    expect(screen.getAllByText("April 2026")).not.toHaveLength(0);
    expect(hoisted.mockUseCalendarMonth).toHaveBeenLastCalledWith("2026-04");
  });

  it("renders loading and error states", () => {
    hoisted.mockUseCalendarMonth.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { rerender } = render(<CalendarPage />);

    expect(screen.getByText("Loading calendar…")).toBeInTheDocument();
    expect(screen.getByText("Loading deadlines…")).toBeInTheDocument();
    expect(screen.getAllByText("April 2026")).toHaveLength(2);

    hoisted.mockUseCalendarMonth.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    rerender(<CalendarPage />);

    expect(screen.getByText("Unable to load calendar data.")).toBeInTheDocument();
    expect(screen.getByText("Calendar unavailable")).toBeInTheDocument();
    expect(screen.getByText("Refresh to retry")).toBeInTheDocument();
  });

  it("restyles the summary row as stat cards with short labels and prominent numeric values", () => {
    hoisted.mockUseCalendarMonth.mockReturnValue({
      data: {
        month: "2026-04",
        items: [
          {
            id: "item-1",
            title: "Application deadline",
            date: "2026-04-05T00:00:00.000Z",
            status: "upcoming",
            kind: "application_deadline",
          },
          {
            id: "item-2",
            title: "Grant report",
            date: "2026-04-05T00:00:00.000Z",
            status: "upcoming",
            kind: "reporting_requirement",
          },
          {
            id: "item-3",
            title: "Closeout checklist",
            date: "2026-04-20T00:00:00.000Z",
            status: "overdue",
            kind: "closeout_item",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<CalendarPage />);

    const summary = screen.getByTestId("calendar-summary-stats");
    expect(summary).toHaveClass("grid-cols-3");
    expect(within(summary).getByText("Scheduled deadlines")).toBeInTheDocument();
    expect(within(summary).getByText("Deadline days")).toBeInTheDocument();
    expect(within(summary).getByText("Overdue")).toBeInTheDocument();
    // 3 items total, spread across 2 distinct days, 1 of them overdue.
    expect(within(summary).getByText("3")).toBeInTheDocument();
    expect(within(summary).getByText("2")).toBeInTheDocument();
    expect(within(summary).getByText("1")).toBeInTheDocument();
  });

  it("shows 'None' for the overdue stat card when nothing is overdue", () => {
    hoisted.mockUseCalendarMonth.mockReturnValue({
      data: {
        month: "2026-04",
        items: [
          {
            id: "item-1",
            title: "Application deadline",
            date: "2026-04-05T00:00:00.000Z",
            status: "upcoming",
            kind: "application_deadline",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<CalendarPage />);

    const summary = screen.getByTestId("calendar-summary-stats");
    expect(within(summary).getByText("None")).toBeInTheDocument();
  });

  it("highlights today's date with today class", () => {
    hoisted.mockUseCalendarMonth.mockReturnValue({
      data: { month: "2026-04", items: [] },
      isLoading: false,
      isError: false,
    });

    render(<CalendarPage />);

    // System time is 2026-04-08; with no deadlines, today is auto-selected,
    // so the selected state takes precedence over the today state.
    const todayButton = screen.getByRole("button", { name: /April 8, 2026/ });
    expect(todayButton).toHaveAttribute("data-calendar-day-state", "selected");
    expect(todayButton).toHaveAttribute("aria-current", "date");
  });

  it('today cell has aria-current="date"', () => {
    hoisted.mockUseCalendarMonth.mockReturnValue({
      data: { month: "2026-04", items: [] },
      isLoading: false,
      isError: false,
    });

    render(<CalendarPage />);

    const todayButton = screen.getByRole("button", { name: /April 8, 2026/ });
    expect(todayButton).toHaveAttribute("aria-current", "date");
  });

  it("today cell shows dot indicator", () => {
    hoisted.mockUseCalendarMonth.mockReturnValue({
      data: { month: "2026-04", items: [] },
      isLoading: false,
      isError: false,
    });

    render(<CalendarPage />);

    const todayButton = screen.getByRole("button", { name: /April 8, 2026/ });
    const dot = todayButton.querySelector("[aria-label='Today']");
    expect(dot).toBeInTheDocument();
  });

  it("shows full item title as title attribute on truncated day-grid pills", () => {
    hoisted.mockUseCalendarMonth.mockImplementation((month: string) => ({
      data: {
        month,
        items:
          month === "2026-04"
            ? [
                {
                  id: "item-1",
                  title: "Application deadline",
                  date: "2026-04-14T00:00:00.000Z",
                  status: "upcoming",
                  kind: "application_deadline",
                  grantId: "grant-1",
                  grantName: "STEM Access",
                },
              ]
            : [],
      },
      isLoading: false,
      isError: false,
    }));

    render(<CalendarPage />);

    const titleEl = screen.getByTitle("Application deadline");
    expect(titleEl).toBeInTheDocument();
    expect(titleEl).toHaveClass("line-clamp-2", "break-words");
    expect(titleEl.className).not.toContain("truncate");
  });

  it("shows grantName as title on agenda items across the link, plain, and absent branches", () => {
    hoisted.mockUseCalendarMonth.mockImplementation((month: string) => ({
      data: {
        month,
        items:
          month === "2026-04"
            ? [
                {
                  id: "item-1",
                  title: "Application deadline",
                  date: "2026-04-14T00:00:00.000Z",
                  status: "upcoming",
                  kind: "application_deadline",
                  grantId: "grant-1",
                  grantName: "STEM Access",
                },
                {
                  id: "item-2",
                  title: "Closeout task",
                  date: "2026-04-14T00:00:00.000Z",
                  status: "upcoming",
                  kind: "closeout_item",
                },
                {
                  id: "item-3",
                  title: "Reporting reminder",
                  date: "2026-04-14T00:00:00.000Z",
                  status: "upcoming",
                  kind: "report_due",
                  grantName: "Community Wellness Initiative",
                },
              ]
            : [],
      },
      isLoading: false,
      isError: false,
    }));

    render(<CalendarPage />);

    // grantName + grantId — rendered as a link carrying the full name as title
    const stemLink = screen.getByRole("link", { name: "Open grant STEM Access" });
    expect(stemLink).toHaveAttribute("title", "STEM Access");

    // grantName without grantId — rendered as a plain <p> carrying the full name as title
    const plainGrant = screen.getByText("Community Wellness Initiative");
    expect(plainGrant.tagName).toBe("P");
    expect(plainGrant).toHaveAttribute("title", "Community Wellness Initiative");

    // grantName absent (item-2 "Closeout task") — the guard renders null, so no grant
    // link or grant paragraph is emitted for it; STEM Access is the only grant link.
    expect(screen.queryAllByRole("link", { name: /^Open grant/ })).toHaveLength(1);
  });

  it("reselects the first deadline day once month data finishes loading", () => {
    const monthState = {
      data: { month: "2026-04", items: [] as Array<Record<string, string>> },
      isLoading: false,
      isError: false,
    };

    hoisted.mockUseCalendarMonth.mockImplementation(() => monthState);

    const { rerender } = render(<CalendarPage />);

    expect(screen.getByText("No deadlines scheduled for April 2026.")).toBeInTheDocument();

    monthState.data = {
      month: "2026-04",
      items: [
        {
          id: "item-1",
          title: "Application deadline",
          date: "2026-04-14T00:00:00.000Z",
          status: "upcoming",
          kind: "application_deadline",
          grantName: "STEM Access",
        },
      ],
    };

    rerender(<CalendarPage />);

    expect(screen.getByText("April 14, 2026")).toBeInTheDocument();
    expect(screen.getAllByText("Application deadline").length).toBeGreaterThan(0);
  });
});
