import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import { ApiError } from "../../../lib/http-response";

const {
  mockUseAnomalies,
  mockCaptureEvent,
  mockCaptureAppException,
  mockUseSession,
  mockUseQueryClient,
  mockRemoveQueries,
  mockInvalidateQueries,
  mockRouteSearch,
} = vi.hoisted(() => ({
  mockUseAnomalies: vi.fn(),
  mockCaptureEvent: vi.fn(),
  mockCaptureAppException: vi.fn(),
  mockUseSession: vi.fn(),
  mockUseQueryClient: vi.fn(),
  mockRemoveQueries: vi.fn(),
  mockInvalidateQueries: vi.fn().mockResolvedValue(undefined),
  mockRouteSearch: {
    entityId: undefined as string | undefined,
    highlightEntityId: undefined as string | undefined,
  },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: { component: unknown }) =>
    Object.assign(config, { useSearch: () => mockRouteSearch }),
  Link: ({ children, to, hash }: { children: React.ReactNode; to: string; hash?: string }) => (
    <a href={`${to}${hash ? `#${hash}` : ""}`}>{children}</a>
  ),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQueryClient: mockUseQueryClient,
}));

vi.mock("../../../hooks/use-anomalies", () => ({
  useAnomalies: mockUseAnomalies,
  ANOMALY_CLASSES: [
    "category_misallocation",
    "release_over_balance",
    "duplicate_donation",
    "indirect_rate_mismatch",
  ],
}));

vi.mock("../../../lib/format", () => ({
  formatCurrency: (cents: number) => `$${(cents / 100).toFixed(2)}`,
}));

vi.mock("../../../lib/analytics", () => ({
  captureEvent: mockCaptureEvent,
}));

vi.mock("../../../lib/sentry", () => ({
  captureAppException: mockCaptureAppException,
}));

vi.mock("../../../hooks/use-session", () => ({
  useSession: mockUseSession,
}));

import {
  AnomalyDetectorPage,
  getSeverityVariant,
  CLASS_LABELS,
  formatCategoryMisallocationSummary,
  formatReleaseOverBalanceSummary,
  formatDuplicateDonationSummary,
  formatIndirectRateMismatchSummary,
  formatAnomalySummary,
  getAnomalyRecordHref,
  countBucket,
} from "./anomalies";
import type {
  CategoryMisallocationItem,
  ReleaseOverBalanceItem,
  DuplicateDonationItem,
  IndirectRateMismatchItem,
} from "../../../hooks/use-anomalies";

const MOCK_MISALLOCATION: CategoryMisallocationItem = {
  class: "category_misallocation",
  severity: "warning",
  reason: "Category not allowed",
  entityId: "exp-1",
  entityType: "expense",
  expenseCategory: "Travel",
  expenseAccountId: null,
  termId: "term-1",
  fundId: "fund-1",
};

const MOCK_RELEASE: ReleaseOverBalanceItem = {
  class: "release_over_balance",
  severity: "critical",
  reason: "Release over balance",
  entityId: "rel-1",
  entityType: "restriction_release",
  releaseAmountCents: 200000,
  availableBalanceCents: 100000,
  overByCents: 100000,
  termId: "term-2",
  fundId: "fund-2",
  grantId: null,
  donationId: null,
  contactId: null,
};

const MOCK_DUPLICATE: DuplicateDonationItem = {
  class: "duplicate_donation",
  severity: "warning",
  reason: "Likely duplicate",
  entityId: "don-1",
  entityType: "donation",
  contactId: "contact-1",
  duplicateGroupIds: ["don-1", "don-2", "don-3"],
};

const MOCK_RATE_MISMATCH: IndirectRateMismatchItem = {
  class: "indirect_rate_mismatch",
  severity: "info",
  reason: "Rate differs",
  entityId: "pr-1",
  entityType: "payment_request",
  postedRateBasisPoints: 1000,
  postedAmountCents: 5000,
  expectedRateBasisPoints: 1500,
  expectedAmountCents: 7500,
  deltaCents: 2500,
};

const BASE_TOTALS = {
  category_misallocation: 1,
  release_over_balance: 1,
  duplicate_donation: 3,
  indirect_rate_mismatch: 1,
};

const ALL_ITEMS = [MOCK_MISALLOCATION, MOCK_RELEASE, MOCK_DUPLICATE, MOCK_RATE_MISMATCH];

// ---------------------------------------------------------------------------
// Pure function unit tests
// ---------------------------------------------------------------------------

describe("getSeverityVariant", () => {
  it("maps critical to destructive", () => {
    expect(getSeverityVariant("critical")).toBe("destructive");
  });

  it("maps warning to warning", () => {
    expect(getSeverityVariant("warning")).toBe("warning");
  });

  it("maps info to secondary", () => {
    expect(getSeverityVariant("info")).toBe("secondary");
  });
});

describe("CLASS_LABELS", () => {
  it("has a label for every anomaly class", () => {
    expect(CLASS_LABELS.category_misallocation).toBeTruthy();
    expect(CLASS_LABELS.release_over_balance).toBeTruthy();
    expect(CLASS_LABELS.duplicate_donation).toBeTruthy();
    expect(CLASS_LABELS.indirect_rate_mismatch).toBeTruthy();
  });
});

describe("formatCategoryMisallocationSummary", () => {
  it("includes the expense category name", () => {
    const result = formatCategoryMisallocationSummary(MOCK_MISALLOCATION);
    expect(result).toContain("Travel");
  });

  it("falls back to 'unknown category' when expenseCategory is null", () => {
    const item: CategoryMisallocationItem = { ...MOCK_MISALLOCATION, expenseCategory: null };
    expect(formatCategoryMisallocationSummary(item)).toContain("unknown category");
  });
});

describe("formatReleaseOverBalanceSummary", () => {
  it("formats release, available, and over-by amounts", () => {
    const result = formatReleaseOverBalanceSummary(MOCK_RELEASE);
    expect(result).toContain("$2000.00");
    expect(result).toContain("$1000.00");
    expect(result).toContain("$1000.00");
  });
});

describe("formatDuplicateDonationSummary", () => {
  it("shows the count of duplicate group ids (plural)", () => {
    const result = formatDuplicateDonationSummary(MOCK_DUPLICATE);
    expect(result).toContain("3 donations");
  });

  it("uses singular when count is 1", () => {
    const item: DuplicateDonationItem = {
      ...MOCK_DUPLICATE,
      duplicateGroupIds: ["don-1"],
    };
    const result = formatDuplicateDonationSummary(item);
    expect(result).toContain("1 donation");
    expect(result).not.toContain("1 donations");
  });
});

describe("formatIndirectRateMismatchSummary", () => {
  it("formats posted rate, expected rate, and delta", () => {
    const result = formatIndirectRateMismatchSummary(MOCK_RATE_MISMATCH);
    expect(result).toContain("10.00%");
    expect(result).toContain("15.00%");
    expect(result).toContain("$25.00");
  });

  it("shows absolute delta even when deltaCents is negative", () => {
    const item: IndirectRateMismatchItem = { ...MOCK_RATE_MISMATCH, deltaCents: -2500 };
    const result = formatIndirectRateMismatchSummary(item);
    expect(result).toContain("$25.00");
  });
});

describe("formatAnomalySummary", () => {
  it("delegates to the correct formatter per class", () => {
    expect(formatAnomalySummary(MOCK_MISALLOCATION)).toContain("Travel");
    expect(formatAnomalySummary(MOCK_RELEASE)).toContain("$2000.00");
    expect(formatAnomalySummary(MOCK_DUPLICATE)).toContain("3 donations");
    expect(formatAnomalySummary(MOCK_RATE_MISMATCH)).toContain("10.00%");
  });
});

describe("getAnomalyRecordHref", () => {
  it("links expense anomalies to the accounting ledger with the expense id", () => {
    expect(getAnomalyRecordHref(MOCK_MISALLOCATION)).toBe(
      "/funds/fund-1?tab=overview&highlightExpenseId=exp-1",
    );
  });

  it("links release anomalies to the restriction term that owns the release", () => {
    expect(getAnomalyRecordHref(MOCK_RELEASE)).toBe(
      "/funds/fund-2?tab=restrictions&highlightRestrictionTermId=term-2",
    );
  });

  it("links grant-owned releases to the grant restriction term", () => {
    expect(
      getAnomalyRecordHref({
        ...MOCK_RELEASE,
        fundId: null,
        grantId: "grant-2",
      }),
    ).toBe("/grants/grant-2/restrictions/term-2");
  });

  it("links donation-owned releases to the donor donation", () => {
    expect(
      getAnomalyRecordHref({
        ...MOCK_RELEASE,
        fundId: null,
        grantId: null,
        donationId: "don-2",
        contactId: "contact-2",
      }),
    ).toBe("/donors/contact-2?tab=donations&highlightDonation=don-2");
  });

  it("falls back to the anomaly row only when the release has no resolvable parent", () => {
    expect(
      getAnomalyRecordHref({
        ...MOCK_RELEASE,
        fundId: null,
        grantId: null,
        donationId: null,
        contactId: null,
      }),
    ).toBe("/accounting/anomalies?highlightEntityId=rel-1");
  });

  it("links duplicate donation anomalies to the donor record with the donation anchor", () => {
    expect(getAnomalyRecordHref(MOCK_DUPLICATE)).toBe(
      "/donors/contact-1?tab=donations&highlightDonation=don-1",
    );
  });

  it("links indirect rate anomalies to the payment request detail page", () => {
    expect(getAnomalyRecordHref(MOCK_RATE_MISMATCH)).toBe("/payments/pr-1");
  });
});

describe("countBucket", () => {
  it("buckets anomaly counts for analytics", () => {
    expect(countBucket(0)).toBe("0");
    expect(countBucket(1)).toBe("1-10");
    expect(countBucket(11)).toBe("11-100");
    expect(countBucket(101)).toBe("101-1000");
    expect(countBucket(1001)).toBe("1000+");
  });
});

// ---------------------------------------------------------------------------
// Page component tests
// ---------------------------------------------------------------------------

describe("AnomalyDetectorPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockRouteSearch.entityId = undefined;
    mockRouteSearch.highlightEntityId = undefined;
    mockUseSession.mockReturnValue({
      isLoading: false,
      orgId: "org-1",
      activeEntity: { id: "entity-a" },
      availableEntities: [
        { id: "entity-a", name: "Entity A" },
        { id: "entity-b", name: "Entity B" },
      ],
    });
    mockUseQueryClient.mockReturnValue({
      removeQueries: mockRemoveQueries,
      invalidateQueries: mockInvalidateQueries,
    });
  });

  it("validates an entity deep link before switching and loading anomalies", async () => {
    mockRouteSearch.entityId = "entity-b";
    localStorage.setItem("grantpipe.activeEntityId", "entity-a");
    mockUseAnomalies.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: { asOf: "", items: [], totals: BASE_TOTALS },
    });

    render(<AnomalyDetectorPage />);

    await waitFor(() => {
      expect(localStorage.getItem("grantpipe.activeEntityId")).toBe("entity-b");
      expect(mockUseAnomalies).toHaveBeenCalled();
    });
    expect(mockRemoveQueries).toHaveBeenCalledWith({ queryKey: ["accounting-anomalies"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith(
      {
        queryKey: ["auth-session-context"],
      },
      { throwOnError: true },
    );
  });

  it("keeps one entity switch in flight while session context refreshes", async () => {
    mockRouteSearch.entityId = "entity-b";
    localStorage.setItem("grantpipe.activeEntityId", "entity-a");
    let finishRefresh!: () => void;
    mockInvalidateQueries.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishRefresh = resolve;
      }),
    );
    mockUseAnomalies.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: { asOf: "", items: [], totals: BASE_TOTALS },
    });

    const view = render(<AnomalyDetectorPage />);
    await waitFor(() => expect(mockInvalidateQueries).toHaveBeenCalledTimes(1));

    mockUseSession.mockReturnValue({
      isLoading: false,
      orgId: "org-1",
      activeEntity: { id: "entity-b" },
      availableEntities: [
        { id: "entity-a", name: "Entity A" },
        { id: "entity-b", name: "Entity B" },
      ],
    });
    view.rerender(<AnomalyDetectorPage />);

    expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);
    expect(mockUseAnomalies).not.toHaveBeenCalled();

    await act(async () => {
      finishRefresh();
    });
    await waitFor(() => expect(mockUseAnomalies).toHaveBeenCalled());
  });

  it("rejects an unauthorized entity deep link without loading anomaly data", () => {
    mockRouteSearch.entityId = "entity-unknown";
    localStorage.setItem("grantpipe.activeEntityId", "entity-a");
    mockUseAnomalies.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: { asOf: "", items: [MOCK_DUPLICATE], totals: BASE_TOTALS },
    });

    render(<AnomalyDetectorPage />);

    expect(screen.getByText("We can't show anomalies here.")).toBeInTheDocument();
    expect(localStorage.getItem("grantpipe.activeEntityId")).toBe("entity-a");
    expect(mockUseAnomalies).not.toHaveBeenCalled();
    expect(mockCaptureAppException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: { feature: "entity_switcher", operation: "validate_anomaly_deep_link" },
      }),
      { includeExpected: true, sanitize: true },
    );
  });

  it("loads the active entity after the entity query is removed", async () => {
    mockRouteSearch.entityId = "entity-unknown";
    localStorage.setItem("grantpipe.activeEntityId", "entity-a");
    mockUseAnomalies.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: { asOf: "", items: [MOCK_DUPLICATE], totals: BASE_TOTALS },
    });

    const view = render(<AnomalyDetectorPage />);

    expect(screen.getByText("We can't show anomalies here.")).toBeInTheDocument();
    expect(mockUseAnomalies).not.toHaveBeenCalled();

    mockRouteSearch.entityId = undefined;
    view.rerender(<AnomalyDetectorPage />);

    await waitFor(() => expect(mockUseAnomalies).toHaveBeenCalled());
  });

  it("restores the prior entity when the active session query refetch fails", async () => {
    mockRouteSearch.entityId = "entity-b";
    localStorage.setItem("grantpipe.activeEntityId", "entity-a");
    const sessionRefreshError = new Error("session refresh failed");
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const failingSessionQuery = vi.fn().mockRejectedValue(sessionRefreshError);
    const sessionObserver = new QueryObserver(queryClient, {
      queryKey: ["auth-session-context"],
      queryFn: failingSessionQuery,
      initialData: { activeEntity: { id: "entity-a" } },
      staleTime: Infinity,
    });
    const unsubscribe = sessionObserver.subscribe(() => undefined);
    mockUseQueryClient.mockReturnValue(queryClient);
    mockUseAnomalies.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: { asOf: "", items: [MOCK_DUPLICATE], totals: BASE_TOTALS },
    });

    try {
      render(<AnomalyDetectorPage />);

      expect(await screen.findByText("We can't show anomalies here.")).toBeInTheDocument();
      expect(failingSessionQuery).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem("grantpipe.activeEntityId")).toBe("entity-a");
      expect(mockUseAnomalies).not.toHaveBeenCalled();
      expect(mockCaptureAppException).toHaveBeenCalledWith(
        sessionRefreshError,
        expect.objectContaining({
          tags: { feature: "entity_switcher", operation: "switch_anomaly_deep_link" },
        }),
        { includeExpected: true, sanitize: true },
      );
    } finally {
      unsubscribe();
      queryClient.clear();
    }
  });

  it("renders loading state", () => {
    mockUseAnomalies.mockReturnValue({
      isLoading: true,
      isError: false,
      isPlanGated: false,
      data: undefined,
    });

    render(<AnomalyDetectorPage />);
    expect(screen.getByText(/loading anomalies/i)).toBeInTheDocument();
  });

  it("renders plan-gate upgrade state on 402", () => {
    mockUseAnomalies.mockReturnValue({
      isLoading: false,
      isError: true,
      isPlanGated: true,
      error: new ApiError("insufficient_plan", 402, "insufficient_plan"),
      data: undefined,
    });

    render(<AnomalyDetectorPage />);
    expect(screen.getByText("Audit-Ready plan required")).toBeInTheDocument();
    expect(
      screen.getByText(/Anomaly Detector is available on the Audit-Ready and Enterprise plans\./),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /go to billing/i })).toHaveAttribute(
      "href",
      "/settings#billing",
    );
  });

  it("renders generic error state on non-402 errors", () => {
    mockUseAnomalies.mockReturnValue({
      isLoading: false,
      isError: true,
      isPlanGated: false,
      error: new Error("Server error"),
      data: undefined,
    });

    render(<AnomalyDetectorPage />);
    expect(screen.getByText(/unable to load anomalies/i)).toBeInTheDocument();
  });

  it("renders empty state when no items", () => {
    mockUseAnomalies.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: {
        asOf: "2026-06-16T00:00:00.000Z",
        items: [],
        totals: {
          category_misallocation: 0,
          release_over_balance: 0,
          duplicate_donation: 0,
          indirect_rate_mismatch: 0,
        },
      },
    });

    render(<AnomalyDetectorPage />);
    expect(screen.getByText(/no anomalies found/i)).toBeInTheDocument();
    expect(screen.getByText(/all accounting entries look clean/i)).toBeInTheDocument();
  });

  it("renders all class filter chips including All", () => {
    mockUseAnomalies.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: {
        asOf: "2026-06-16T00:00:00.000Z",
        items: [],
        totals: {
          category_misallocation: 0,
          release_over_balance: 0,
          duplicate_donation: 0,
          indirect_rate_mismatch: 0,
        },
      },
    });

    render(<AnomalyDetectorPage />);
    expect(screen.getByRole("button", { name: /^All/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Category Misallocation/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Release Over Balance/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Duplicate Donation/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Indirect Rate Mismatch/i })).toBeInTheDocument();
  });

  it("All chip has aria-pressed=true by default", () => {
    mockUseAnomalies.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: {
        asOf: "",
        items: [],
        totals: {
          category_misallocation: 0,
          release_over_balance: 0,
          duplicate_donation: 0,
          indirect_rate_mismatch: 0,
        },
      },
    });

    render(<AnomalyDetectorPage />);
    expect(screen.getByRole("button", { name: /^All/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking a class chip toggles its aria-pressed and deactivates All", async () => {
    const user = userEvent.setup();
    mockUseAnomalies.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: {
        asOf: "",
        items: [],
        totals: {
          category_misallocation: 0,
          release_over_balance: 0,
          duplicate_donation: 0,
          indirect_rate_mismatch: 0,
        },
      },
    });

    render(<AnomalyDetectorPage />);

    const misallocationChip = screen.getByRole("button", { name: /Category Misallocation/i });
    expect(misallocationChip).toHaveAttribute("aria-pressed", "false");

    await user.click(misallocationChip);
    expect(misallocationChip).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^All/i })).toHaveAttribute("aria-pressed", "false");

    await user.click(misallocationChip);
    expect(misallocationChip).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /^All/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking All resets class selection", async () => {
    const user = userEvent.setup();
    mockUseAnomalies.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: {
        asOf: "",
        items: [],
        totals: {
          category_misallocation: 0,
          release_over_balance: 0,
          duplicate_donation: 0,
          indirect_rate_mismatch: 0,
        },
      },
    });

    render(<AnomalyDetectorPage />);

    const misallocationChip = screen.getByRole("button", { name: /Category Misallocation/i });
    await user.click(misallocationChip);
    expect(misallocationChip).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: /^All/i }));
    expect(misallocationChip).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /^All/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("renders category_misallocation row with expense category", () => {
    mockUseAnomalies.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: { asOf: "", items: [MOCK_MISALLOCATION], totals: BASE_TOTALS },
    });

    render(<AnomalyDetectorPage />);
    expect(screen.getByText(/Travel/)).toBeInTheDocument();
    expect(screen.getAllByTestId("anomaly-row")).toHaveLength(1);
    expect(screen.getByRole("link", { name: /open record/i })).toHaveAttribute(
      "href",
      "/funds/fund-1?tab=overview&highlightExpenseId=exp-1",
    );
  });

  it("highlights a fallback deep-linked anomaly row", () => {
    mockRouteSearch.highlightEntityId = "rel-1";
    mockUseAnomalies.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: { asOf: "", items: [MOCK_RELEASE], totals: BASE_TOTALS },
    });

    render(<AnomalyDetectorPage />);

    expect(screen.getByTestId("anomaly-row")).toHaveAttribute("data-highlighted", "true");
  });

  it("renders release_over_balance row with over-by amount", () => {
    mockUseAnomalies.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: { asOf: "", items: [MOCK_RELEASE], totals: BASE_TOTALS },
    });

    render(<AnomalyDetectorPage />);
    expect(screen.getByText(/\$2000\.00/)).toBeInTheDocument();
    expect(screen.getByText(/critical/i)).toBeInTheDocument();
  });

  it("renders duplicate_donation row with count", () => {
    mockUseAnomalies.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: { asOf: "", items: [MOCK_DUPLICATE], totals: BASE_TOTALS },
    });

    render(<AnomalyDetectorPage />);
    expect(screen.getByText(/3 donations/i)).toBeInTheDocument();
  });

  it("renders indirect_rate_mismatch row with rate percentages", () => {
    mockUseAnomalies.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: { asOf: "", items: [MOCK_RATE_MISMATCH], totals: BASE_TOTALS },
    });

    render(<AnomalyDetectorPage />);
    expect(screen.getByText(/10\.00%/)).toBeInTheDocument();
    expect(screen.getByText(/15\.00%/)).toBeInTheDocument();
  });

  it("shows per-class counts on chips when totals are available", () => {
    mockUseAnomalies.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: { asOf: "", items: ALL_ITEMS, totals: BASE_TOTALS },
    });

    render(<AnomalyDetectorPage />);
    // duplicate_donation count is 3
    expect(screen.getByText("(3)")).toBeInTheDocument();
  });

  it("renders all four items as rows", () => {
    mockUseAnomalies.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: { asOf: "", items: ALL_ITEMS, totals: BASE_TOTALS },
    });

    render(<AnomalyDetectorPage />);
    expect(screen.getAllByTestId("anomaly-row")).toHaveLength(4);
  });

  it("captures a privacy-safe viewed event when anomaly data renders", async () => {
    mockUseAnomalies.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: { asOf: "", items: ALL_ITEMS, totals: BASE_TOTALS },
    });

    render(<AnomalyDetectorPage />);

    await waitFor(() => {
      expect(mockCaptureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.accountingAnomalyViewed, {
        has_class_filter: false,
        visible_items_bucket: "1-10",
        total_items_bucket: "1-10",
      });
    });
    expect(JSON.stringify(mockCaptureEvent.mock.calls)).not.toContain("exp-1");
    expect(JSON.stringify(mockCaptureEvent.mock.calls)).not.toContain("don-1");
  });

  it("captures filter changes without record identifiers", async () => {
    const user = userEvent.setup();
    mockUseAnomalies.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: { asOf: "", items: ALL_ITEMS, totals: BASE_TOTALS },
    });

    render(<AnomalyDetectorPage />);
    await user.click(screen.getByRole("button", { name: /Category Misallocation/i }));

    expect(mockCaptureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.accountingAnomalyFilterChanged, {
      anomaly_class: "category_misallocation",
      active: true,
      selected_class_count: 1,
    });
    expect(JSON.stringify(mockCaptureEvent.mock.calls)).not.toContain("term-1");
  });

  it("captures record-open clicks without record identifiers", async () => {
    const user = userEvent.setup();
    mockUseAnomalies.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: { asOf: "", items: [MOCK_DUPLICATE], totals: BASE_TOTALS },
    });

    render(<AnomalyDetectorPage />);
    await user.click(screen.getByRole("link", { name: /open record/i }));

    expect(mockCaptureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.accountingAnomalyItemOpened, {
      anomaly_class: "duplicate_donation",
      severity: "warning",
      entity_type: "donation",
    });
    expect(JSON.stringify(mockCaptureEvent.mock.calls)).not.toContain("contact-1");
    expect(JSON.stringify(mockCaptureEvent.mock.calls)).not.toContain("don-1");
  });

  it("shows severity badge for info items", () => {
    mockUseAnomalies.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: { asOf: "", items: [MOCK_RATE_MISMATCH], totals: BASE_TOTALS },
    });

    render(<AnomalyDetectorPage />);
    expect(screen.getByText(/^info$/i)).toBeInTheDocument();
  });

  it("shows severity badge for warning items", () => {
    mockUseAnomalies.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: { asOf: "", items: [MOCK_MISALLOCATION], totals: BASE_TOTALS },
    });

    render(<AnomalyDetectorPage />);
    expect(screen.getByText(/^warning$/i)).toBeInTheDocument();
  });

  it("renders category_misallocation with null expenseCategory gracefully", () => {
    const item: CategoryMisallocationItem = { ...MOCK_MISALLOCATION, expenseCategory: null };
    mockUseAnomalies.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: { asOf: "", items: [item], totals: BASE_TOTALS },
    });

    render(<AnomalyDetectorPage />);
    expect(screen.getByText(/unknown category/i)).toBeInTheDocument();
  });
});
