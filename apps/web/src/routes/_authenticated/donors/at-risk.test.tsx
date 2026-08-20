import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../lib/http-response";

const { mockCaptureEvent, mockUseAtRiskDonors } = vi.hoisted(() => ({
  mockUseAtRiskDonors: vi.fn(),
  mockCaptureEvent: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: { component: unknown }) => config,
  Link: ({
    children,
    to,
    params,
    hash,
  }: {
    children: React.ReactNode;
    to: string;
    params?: Record<string, string>;
    hash?: string;
  }) => {
    const href = params
      ? Object.entries(params).reduce((s, [k, v]) => s.replace(`$${k}`, v), to)
      : to;
    return <a href={`${href}${hash ? `#${hash}` : ""}`}>{children}</a>;
  },
}));

vi.mock("../../../hooks/use-at-risk-donors", () => ({
  useAtRiskDonors: mockUseAtRiskDonors,
  getLapseBandVariant: (band: string) => {
    if (band === "lapsing") return "warning";
    if (band === "at_risk") return "destructive";
    return "secondary";
  },
  LAPSE_BAND_LABELS: { lapsing: "Lapsing", at_risk: "At Risk", lapsed: "Lapsed" },
}));

vi.mock("../../../lib/format", () => ({
  formatCurrency: (cents: number) => `$${(cents / 100).toFixed(2)}`,
  formatUtcCalendarDate: (d: string) => d,
}));

vi.mock("../../../lib/analytics", () => ({
  captureEvent: mockCaptureEvent,
}));

vi.mock("../../../components/shell/page-tabs", () => ({
  AppPageTabs: ({
    groupId,
    items,
    ariaLabel,
  }: {
    groupId: string;
    items: Array<{ label: string; to: string }>;
    ariaLabel?: string;
  }) => (
    <nav aria-label={ariaLabel || `${groupId.charAt(0).toUpperCase()}${groupId.slice(1)} sections`}>
      {items.map((item) => (
        <a key={item.to} href={item.to}>
          {item.label}
        </a>
      ))}
    </nav>
  ),
}));

import { AtRiskDonorsPage, formatDaysSince, getLapseBandVariant } from "./at-risk";

const MOCK_DONORS = [
  {
    contactId: "c1",
    displayName: "Jane Doe",
    email: "jane@example.com",
    band: "lapsing" as const,
    daysSinceLastGift: 95,
    typicalCadenceDays: 90,
    riskScore: 55,
    lifetimeGivingCents: 50000,
    lastGiftDate: "2026-03-01",
  },
  {
    contactId: "c2",
    displayName: "John Smith",
    email: null,
    band: "lapsed" as const,
    daysSinceLastGift: 400,
    typicalCadenceDays: 365,
    riskScore: 80,
    lifetimeGivingCents: 120000,
    lastGiftDate: null,
  },
];

describe("formatDaysSince", () => {
  it("returns '1 day ago' for 1", () => {
    expect(formatDaysSince(1)).toBe("1 day ago");
  });

  it("returns plural for values other than 1", () => {
    expect(formatDaysSince(0)).toBe("0 days ago");
    expect(formatDaysSince(95)).toBe("95 days ago");
  });
});

describe("getLapseBandVariant (re-export from page)", () => {
  it("maps lapsing to warning", () => {
    expect(getLapseBandVariant("lapsing")).toBe("warning");
  });

  it("maps at_risk to destructive", () => {
    expect(getLapseBandVariant("at_risk")).toBe("destructive");
  });

  it("maps lapsed to secondary", () => {
    expect(getLapseBandVariant("lapsed")).toBe("secondary");
  });
});

describe("AtRiskDonorsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the page-tabs navigation with Overview, At-Risk, and Pledges links", () => {
    mockUseAtRiskDonors.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: {
        asOf: "2026-06-16T00:00:00.000Z",
        donors: MOCK_DONORS,
        totals: { lapsing: 1, at_risk: 0, lapsed: 1, total: 2 },
      },
    });

    render(<AtRiskDonorsPage />);

    const nav = screen.getByRole("navigation", { name: "Donors sections" });
    expect(nav).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "At-Risk" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pledges" })).toBeInTheDocument();
  });

  it("renders loading state", () => {
    mockUseAtRiskDonors.mockReturnValue({
      isLoading: true,
      isError: false,
      isPlanGated: false,
      data: undefined,
    });

    render(<AtRiskDonorsPage />);
    expect(screen.getByText(/loading at-risk donors/i)).toBeInTheDocument();
  });

  it("renders plan-gate upgrade state on 402", () => {
    mockUseAtRiskDonors.mockReturnValue({
      isLoading: false,
      isError: true,
      isPlanGated: true,
      error: new ApiError("insufficient_plan", 402, "insufficient_plan"),
      data: undefined,
    });

    render(<AtRiskDonorsPage />);
    expect(screen.getByText(/growth plan required/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /go to billing/i })).toHaveAttribute(
      "href",
      "/settings#billing",
    );
  });

  it("renders generic error state on non-402 errors", () => {
    mockUseAtRiskDonors.mockReturnValue({
      isLoading: false,
      isError: true,
      isPlanGated: false,
      error: new Error("Server error"),
      data: undefined,
    });

    render(<AtRiskDonorsPage />);
    expect(screen.getByText(/unable to load at-risk donors/i)).toBeInTheDocument();
  });

  it("renders empty state when no at-risk donors", () => {
    mockUseAtRiskDonors.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: {
        asOf: "2026-06-16T00:00:00.000Z",
        donors: [],
        totals: { lapsing: 0, at_risk: 0, lapsed: 0, total: 0 },
      },
    });

    render(<AtRiskDonorsPage />);
    expect(screen.getByText(/no at-risk donors right now/i)).toBeInTheDocument();
  });

  it("renders the donor table with correct data", () => {
    mockUseAtRiskDonors.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: {
        asOf: "2026-06-16T00:00:00.000Z",
        donors: MOCK_DONORS,
        totals: { lapsing: 1, at_risk: 0, lapsed: 1, total: 2 },
      },
    });

    render(<AtRiskDonorsPage />);

    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
    // John Smith has no email; the email cell should not exist
    expect(screen.queryByText("john@example.com")).not.toBeInTheDocument();
    expect(screen.getByText("John Smith")).toBeInTheDocument();
    expect(screen.getByText("$500.00")).toBeInTheDocument();
    expect(screen.getByText("$1200.00")).toBeInTheDocument();
    expect(screen.getByText("95 days ago")).toBeInTheDocument();
    expect(screen.getByText("400 days ago")).toBeInTheDocument();
  });

  it("renders totals summary", () => {
    mockUseAtRiskDonors.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: {
        asOf: "2026-06-16T00:00:00.000Z",
        donors: MOCK_DONORS,
        totals: { lapsing: 1, at_risk: 0, lapsed: 1, total: 2 },
      },
    });

    render(<AtRiskDonorsPage />);
    expect(screen.getByTestId("at-risk-totals")).toBeInTheDocument();
  });

  it("tracks a privacy-safe donor lapse view event after data loads", async () => {
    mockUseAtRiskDonors.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: {
        asOf: "2026-06-16T00:00:00.000Z",
        donors: MOCK_DONORS,
        totals: { lapsing: 1, at_risk: 0, lapsed: 1, total: 2 },
      },
    });

    render(<AtRiskDonorsPage />);

    await waitFor(() => {
      expect(mockCaptureEvent).toHaveBeenCalledWith("donor_lapse_viewed", {
        has_filters: false,
        selected_bands: [],
        selected_band_count: 0,
        visible_donor_count_bucket: "1-10",
        total_donor_count_bucket: "1-10",
      });
    });
  });

  it("shows '—' when lastGiftDate is null", () => {
    mockUseAtRiskDonors.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: {
        asOf: "2026-06-16T00:00:00.000Z",
        donors: [MOCK_DONORS[1]],
        totals: { lapsing: 0, at_risk: 0, lapsed: 1, total: 1 },
      },
    });

    render(<AtRiskDonorsPage />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("links donor name to the contact detail page", () => {
    mockUseAtRiskDonors.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: {
        asOf: "2026-06-16T00:00:00.000Z",
        donors: [MOCK_DONORS[0]],
        totals: { lapsing: 1, at_risk: 0, lapsed: 0, total: 1 },
      },
    });

    render(<AtRiskDonorsPage />);
    const link = screen.getByRole("link", { name: "Jane Doe" });
    expect(link).toHaveAttribute("href", "/donors/c1");
  });

  it("toggles band filter chips and calls hook with selected bands", async () => {
    const user = userEvent.setup();
    mockUseAtRiskDonors.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: { asOf: "", donors: [], totals: { lapsing: 0, at_risk: 0, lapsed: 0, total: 0 } },
    });

    render(<AtRiskDonorsPage />);

    const lapsingChip = screen.getByRole("button", { name: "Lapsing" });
    expect(lapsingChip).toHaveAttribute("aria-pressed", "false");
    // Inactive chips read as outline, not the filled active state.
    expect(lapsingChip.className).not.toContain("bg-primary");

    await user.click(lapsingChip);
    expect(lapsingChip).toHaveAttribute("aria-pressed", "true");
    // Active chips use the emerald fill so selection is unmistakable.
    expect(lapsingChip.className).toContain("bg-primary");

    await user.click(lapsingChip);
    expect(lapsingChip).toHaveAttribute("aria-pressed", "false");
    expect(lapsingChip.className).not.toContain("bg-primary");
  });

  it("tracks a privacy-safe donor lapse filter change event", async () => {
    const user = userEvent.setup();
    mockUseAtRiskDonors.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: { asOf: "", donors: [], totals: { lapsing: 0, at_risk: 0, lapsed: 0, total: 0 } },
    });

    render(<AtRiskDonorsPage />);

    await user.click(screen.getByRole("button", { name: "At Risk" }));

    expect(mockCaptureEvent).toHaveBeenCalledWith("donor_lapse_filter_changed", {
      has_filters: true,
      selected_bands: ["at_risk"],
      selected_band_count: 1,
    });
  });

  it("renders all three band filter chips", () => {
    mockUseAtRiskDonors.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: { asOf: "", donors: [], totals: { lapsing: 0, at_risk: 0, lapsed: 0, total: 0 } },
    });

    render(<AtRiskDonorsPage />);

    expect(screen.getByRole("button", { name: "Lapsing" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "At Risk" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lapsed" })).toBeInTheDocument();
  });
});
