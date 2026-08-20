import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";

// The consolidated banner merges the old aha banner and the persistent sample-data
// banner. useClearSampleData owns the clear success/failure observability; this
// banner adds the aha view/clear events, which we assert here.
const mockUseSampleDataStatus = vi.fn();
const mockMutateAsync = vi.fn();
const mockUseClearSampleData = vi.fn();
const mockUseSession = vi.fn();
const mockCaptureEvent = vi.fn();
const mockClearAhaBannerPending = vi.fn();
let pendingGoal: string | null = "grants";

vi.mock("../hooks/use-sample-data", () => ({
  useSampleDataStatus: () => mockUseSampleDataStatus(),
  useClearSampleData: () => mockUseClearSampleData(),
}));

vi.mock("../hooks/use-session", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../lib/analytics", () => ({
  captureEvent: (...args: unknown[]) => mockCaptureEvent(...args),
}));

vi.mock("../lib/aha-banner", async (importActual) => {
  const actual = await importActual<typeof import("../lib/aha-banner")>();
  return {
    ...actual,
    readPendingAhaGoal: () => pendingGoal,
    clearAhaBannerPending: (...args: unknown[]) => mockClearAhaBannerPending(...args),
  };
});

vi.mock("@grantpipe/ui", () => ({
  Button: ({
    children,
    disabled,
    onClick,
    variant,
    size,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
  }) => (
    <button
      data-slot="button"
      data-variant={variant ?? "default"}
      data-size={size ?? "default"}
      disabled={disabled}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  ),
}));

import { SampleDataBanner } from "./sample-data-banner";

function makeClear(overrides: Partial<ReturnType<typeof mockUseClearSampleData>> = {}) {
  return {
    mutateAsync: mockMutateAsync,
    isPending: false,
    isError: false,
    ...overrides,
  };
}

function seed() {
  mockUseSampleDataStatus.mockReturnValue({
    isLoading: false,
    data: { seeded: true, recordCount: 5 },
  });
}

describe("SampleDataBanner (consolidated)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pendingGoal = "grants";
    mockMutateAsync.mockResolvedValue(undefined);
    mockUseClearSampleData.mockReturnValue(makeClear());
    mockUseSession.mockReturnValue({ orgId: "org_1", memberRole: "admin" });
  });

  it("renders nothing when status is loading", () => {
    mockUseSampleDataStatus.mockReturnValue({ isLoading: true, data: undefined });
    const { container } = render(<SampleDataBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when data is undefined", () => {
    mockUseSampleDataStatus.mockReturnValue({ isLoading: false, data: undefined });
    const { container } = render(<SampleDataBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when seeded is false", () => {
    mockUseSampleDataStatus.mockReturnValue({
      isLoading: false,
      data: { seeded: false, recordCount: 0 },
    });
    const { container } = render(<SampleDataBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the aha copy on first view and fires the viewed event once", () => {
    seed();
    render(<SampleDataBanner />);
    expect(screen.getByText(/We added sample data to your account/i)).toBeDefined();
    expect(mockCaptureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.onboardingAhaBannerViewed, {
      goal: "grants",
    });
  });

  it("settles to the persistent message after the aha goal is dismissed", async () => {
    seed();
    const user = userEvent.setup();
    render(<SampleDataBanner />);
    await user.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.getByText(/exploring sample data/i)).toBeDefined();
    expect(screen.queryByText(/We added sample data to your account/i)).toBeNull();
    expect(mockClearAhaBannerPending).toHaveBeenCalledWith("org_1");
  });

  it("shows the persistent message (no dismiss control) when no aha goal is pending", () => {
    pendingGoal = null;
    seed();
    render(<SampleDataBanner />);
    expect(screen.getByText(/exploring sample data/i)).toBeDefined();
    expect(screen.queryByRole("button", { name: /dismiss/i })).toBeNull();
    expect(mockCaptureEvent).not.toHaveBeenCalled();
  });

  it("clears sample data for admins and fires the aha-cleared event", async () => {
    seed();
    const user = userEvent.setup();
    render(<SampleDataBanner />);
    await user.click(screen.getByRole("button", { name: "Clear sample data" }));
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(mockCaptureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.onboardingAhaExamplesCleared, {
        goal: "grants",
      }),
    );
    expect(mockClearAhaBannerPending).toHaveBeenCalledWith("org_1");
  });

  it("does not fire the aha-cleared event when there is no pending aha goal", async () => {
    pendingGoal = null;
    seed();
    const user = userEvent.setup();
    render(<SampleDataBanner />);
    await user.click(screen.getByRole("button", { name: "Clear sample data" }));
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockCaptureEvent).not.toHaveBeenCalledWith(
      ANALYTICS_EVENTS.onboardingAhaExamplesCleared,
      expect.anything(),
    );
  });

  it("disables the button and shows Clearing… while isPending is true", () => {
    seed();
    mockUseClearSampleData.mockReturnValue(makeClear({ isPending: true }));
    render(<SampleDataBanner />);
    const btn = screen.getByRole("button", { name: "Clearing…" });
    expect(btn).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Clear sample data" })).toBeNull();
  });

  it("shows inline error copy with role=alert and fires the clear-failed event when mutateAsync rejects", async () => {
    seed();
    mockMutateAsync.mockRejectedValue(new Error("network error"));
    const user = userEvent.setup();
    render(<SampleDataBanner />);
    await user.click(screen.getByRole("button", { name: "Clear sample data" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined());
    expect(screen.getByText(/That didn’t work\. Try again\./)).toBeDefined();
    expect(screen.getByTestId("sample-data-banner")).toBeDefined();
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.onboardingAhaExamplesClearFailed,
      { goal: "grants" },
    );
    // A failed clear must not report success or drop the pending aha flag.
    expect(mockCaptureEvent).not.toHaveBeenCalledWith(
      ANALYTICS_EVENTS.onboardingAhaExamplesCleared,
      expect.anything(),
    );
    expect(mockClearAhaBannerPending).not.toHaveBeenCalled();
  });

  it("fires the clear-failed event even when no aha goal is pending", async () => {
    pendingGoal = null;
    seed();
    mockMutateAsync.mockRejectedValue(new Error("network error"));
    const user = userEvent.setup();
    render(<SampleDataBanner />);
    await user.click(screen.getByRole("button", { name: "Clear sample data" }));
    await waitFor(() =>
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        ANALYTICS_EVENTS.onboardingAhaExamplesClearFailed,
        undefined,
      ),
    );
  });

  it("does not fire the clear-failed event on a successful clear", async () => {
    seed();
    const user = userEvent.setup();
    render(<SampleDataBanner />);
    await user.click(screen.getByRole("button", { name: "Clear sample data" }));
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockClearAhaBannerPending).toHaveBeenCalledWith("org_1"));
    expect(mockCaptureEvent).not.toHaveBeenCalledWith(
      ANALYTICS_EVENTS.onboardingAhaExamplesClearFailed,
      expect.anything(),
    );
  });

  it("resets the error flag at the start of the next attempt", async () => {
    seed();
    mockMutateAsync.mockRejectedValueOnce(new Error("fail")).mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<SampleDataBanner />);
    await user.click(screen.getByRole("button", { name: "Clear sample data" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined());
    await user.click(screen.getByRole("button", { name: "Clear sample data" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("shows the Clear button for editors", () => {
    seed();
    mockUseSession.mockReturnValue({ orgId: "org_1", memberRole: "editor" });
    render(<SampleDataBanner />);
    expect(screen.getByRole("button", { name: "Clear sample data" })).toBeDefined();
  });

  it("hides the Clear button for viewers but still shows the banner and persistent copy", () => {
    pendingGoal = null;
    seed();
    mockUseSession.mockReturnValue({ orgId: "org_1", memberRole: "viewer" });
    render(<SampleDataBanner />);
    expect(screen.getByTestId("sample-data-banner")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Clear sample data" })).toBeNull();
    expect(screen.getByText(/An admin can clear it\./)).toBeDefined();
  });

  it("hides the Clear button for auditors", () => {
    seed();
    mockUseSession.mockReturnValue({ orgId: "org_1", memberRole: "auditor" });
    render(<SampleDataBanner />);
    expect(screen.getByTestId("sample-data-banner")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Clear sample data" })).toBeNull();
  });

  it("hides the Clear button when memberRole is null", () => {
    seed();
    mockUseSession.mockReturnValue({ orgId: "org_1", memberRole: null });
    render(<SampleDataBanner />);
    expect(screen.queryByRole("button", { name: "Clear sample data" })).toBeNull();
  });
});
