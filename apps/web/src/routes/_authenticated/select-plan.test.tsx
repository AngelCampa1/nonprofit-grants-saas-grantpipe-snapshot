import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const navigateMock = vi.fn();
const mutateAsyncMock = vi.fn().mockResolvedValue({});

// Mutable mock state so individual tests can vary the session goal, the pending
// flag, and the URL search params without re-mocking the modules.
let onboardingGoalValue: string | null = "grants";
let isPendingValue = false;
let searchValue: { plan?: string; cycle?: string } = {};

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) =>
    Object.assign(config, { useSearch: () => searchValue }),
  useNavigate: () => navigateMock,
}));

vi.mock("../../hooks/use-session", () => ({
  useSession: () => ({ onboardingGoal: onboardingGoalValue }),
}));

vi.mock("../../hooks/use-org-settings", () => ({
  useOrgSettingsMutations: () => ({
    saveBillingSelection: { mutateAsync: mutateAsyncMock, isPending: isPendingValue },
  }),
}));

import { SelectPlanPage } from "./select-plan";

describe("SelectPlanPage", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    mutateAsyncMock.mockClear();
    mutateAsyncMock.mockResolvedValue({});
    onboardingGoalValue = "grants";
    isPendingValue = false;
    searchValue = {};
  });

  it("shows the three self-serve plans and a no-card reassurance", () => {
    render(<SelectPlanPage />);
    expect(screen.getByText(/No credit card required/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start Starter/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start Growth/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start Audit-Ready/i })).toBeInTheDocument();
  });

  it("frames the trial as free for a month with the price shown as what comes after", () => {
    render(<SelectPlanPage />);
    // Outcome-first heading and reassurance that no card is taken now.
    expect(
      screen.getByRole("heading", { name: /Try any plan free for a month/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/You won't pay today/i)).toBeInTheDocument();
    // Every plan card leads with the free month and reframes its price as "then …".
    expect(screen.getAllByText(/Free for 1 month/i)).toHaveLength(3);
    expect(screen.getAllByText(/^then \$/i)).toHaveLength(3);
    // A single closing reassurance sits under the plan grid.
    expect(screen.getByText(/No card needed to start\. Add billing later/i)).toBeInTheDocument();
  });

  it("saves the chosen plan (no card) and routes to the goal's aha page", async () => {
    render(<SelectPlanPage />);
    await userEvent.click(screen.getByRole("button", { name: /Start Growth/i }));
    await waitFor(() =>
      expect(mutateAsyncMock).toHaveBeenCalledWith(expect.objectContaining({ planTier: "growth" })),
    );
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: "/funds" }));
    expect(navigateMock).not.toHaveBeenCalledWith(expect.objectContaining({ to: "/settings" }));
  });

  it("falls back to the dashboard aha route when the session has no goal", async () => {
    onboardingGoalValue = null;
    render(<SelectPlanPage />);
    await userEvent.click(screen.getByRole("button", { name: /Start Starter/i }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: "/dashboard" }));
  });

  it("surfaces an error and does not navigate when saving fails", async () => {
    mutateAsyncMock.mockRejectedValueOnce(new Error("nope"));
    render(<SelectPlanPage />);
    await userEvent.click(screen.getByRole("button", { name: /Start Starter/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("honors a monthly billing cycle from the URL and lets the user switch cycles", async () => {
    searchValue = { cycle: "monthly" };
    render(<SelectPlanPage />);
    expect(screen.getByRole("button", { name: "Monthly" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: /Annual/i }));
    expect(screen.getByRole("button", { name: /Annual/i })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: /Start Growth/i }));
    await waitFor(() =>
      expect(mutateAsyncMock).toHaveBeenCalledWith(
        expect.objectContaining({ billingCycle: "annual" }),
      ),
    );
  });

  it("shows a Starting… label on the chosen plan while the save is pending", async () => {
    // Buttons start enabled; the save flips isPending on and never resolves, so the
    // clicked plan keeps its pendingTier and renders the in-flight label.
    mutateAsyncMock.mockImplementation(() => {
      isPendingValue = true;
      return new Promise(() => {});
    });
    render(<SelectPlanPage />);
    await userEvent.click(screen.getByRole("button", { name: /Start Growth/i }));
    expect(await screen.findByText("Starting…")).toBeInTheDocument();
  });

  it("forwards an explicit plan intent to the billing page instead of the picker", async () => {
    searchValue = { plan: "growth", cycle: "monthly" };
    render(<SelectPlanPage />);
    expect(screen.getByTestId("select-plan-redirecting")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start Growth/i })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/settings",
        hash: "billing",
        search: { plan: "growth", cycle: "monthly" },
        replace: true,
      }),
    );
    // The trial picker's card-free save must not run for a billing-intent visit.
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });
});
