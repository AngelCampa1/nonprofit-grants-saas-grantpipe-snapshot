import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";

const { mockOrgUpdate, mockCompleteOnboarding, mockNavigate, mockUseSearch } = vi.hoisted(() => ({
  mockOrgUpdate: vi.fn(),
  mockCompleteOnboarding: vi.fn(),
  mockNavigate: vi.fn(),
  mockUseSearch: vi.fn().mockReturnValue({}),
}));

const { mockReadPendingPlan, mockClearPendingPlan } = vi.hoisted(() => ({
  mockReadPendingPlan: vi.fn(),
  mockClearPendingPlan: vi.fn(),
}));

const { mockSetQueriesData, mockInvalidateQueries } = vi.hoisted(() => ({
  mockSetQueriesData: vi.fn(),
  mockInvalidateQueries: vi.fn(),
}));

const { mockCaptureEvent } = vi.hoisted(() => ({
  mockCaptureEvent: vi.fn(),
}));

const { mockCaptureAppException } = vi.hoisted(() => ({
  mockCaptureAppException: vi.fn(),
}));

const { mockSeedMutateAsync, mockSeedIsPending } = vi.hoisted(() => ({
  mockSeedMutateAsync: vi.fn(),
  mockSeedIsPending: { value: false },
}));

vi.mock("../../lib/analytics", () => ({
  captureEvent: (...args: unknown[]) => mockCaptureEvent(...args),
}));

vi.mock("../../lib/sentry", () => ({
  captureAppException: (...args: unknown[]) => mockCaptureAppException(...args),
}));

vi.mock("../../hooks/use-sample-data", () => ({
  useSeedSampleData: () => ({
    mutateAsync: mockSeedMutateAsync,
    get isPending() {
      return mockSeedIsPending.value;
    },
  }),
}));

vi.mock("../../hooks/use-session", () => ({
  useSession: () => ({ orgId: "org_1" }),
}));

vi.mock("../../components/onboarding/goal-step", () => ({
  GoalStep: ({
    selected,
    onSelect,
  }: {
    selected: string | null;
    onSelect: (goal: string) => void;
  }) => (
    <div data-testid="goal-step">
      <button
        type="button"
        data-testid="goal-donors"
        aria-pressed={selected === "donors"}
        onClick={() => onSelect("donors")}
      >
        Track donors and gifts
      </button>
      <button
        type="button"
        data-testid="goal-grants"
        aria-pressed={selected === "grants"}
        onClick={() => onSelect("grants")}
      >
        Manage grants and funds
      </button>
      <button
        type="button"
        data-testid="goal-compliance"
        aria-pressed={selected === "compliance"}
        onClick={() => onSelect("compliance")}
      >
        Stay audit-ready
      </button>
    </div>
  ),
}));

vi.mock("../../lib/api-client", () => ({
  api: {
    api: {
      onboarding: {
        $patch: (args: unknown) => mockOrgUpdate(args),
        complete: {
          $post: () => mockCompleteOnboarding(),
        },
      },
    },
  },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (config: { component: React.ComponentType }) =>
    Object.assign({ ...config, path }, { useSearch: mockUseSearch }),
  useNavigate: () => mockNavigate,
}));

vi.mock("../signup", () => ({
  readPendingPlan: () => mockReadPendingPlan(),
  clearPendingPlan: () => mockClearPendingPlan(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    setQueriesData: mockSetQueriesData,
    invalidateQueries: mockInvalidateQueries,
  }),
}));

import { OnboardingPage } from "./onboarding";
import { readPendingAhaGoal } from "../../lib/aha-banner";

/** Forces the browser-detected time zone for detectTimezone() in StepOrgSetup. */
function mockBrowserTimeZone(tz: string) {
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
    () =>
      ({
        resolvedOptions: () => ({ timeZone: tz }) as unknown as Intl.ResolvedDateTimeFormatOptions,
      }) as unknown as Intl.DateTimeFormat,
  );
}

// Advances through step 1 (goal) and step 2 (org setup PATCH) so the wizard lands
// on step 3 ("See how it works"). Onboarding is only completed after the user
// chooses a concrete first-value path.
async function advanceToStep3(goalChoice: "donors" | "grants" | "compliance" = "donors") {
  mockOrgUpdate.mockResolvedValue({ ok: true, json: async () => ({}) });
  render(React.createElement(OnboardingPage));
  fireEvent.click(screen.getByTestId(`goal-${goalChoice}`));
  fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
  fireEvent.change(screen.getByLabelText("Organization name"), {
    target: { value: "Test Nonprofit" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
  await waitFor(() => {
    expect(screen.getByRole("heading", { name: /See how it works/i })).toBeInTheDocument();
  });
}

describe("OnboardingPage — 3-step wizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUseSearch.mockReturnValue({});
    mockReadPendingPlan.mockReturnValue(null);
    mockNavigate.mockResolvedValue(undefined);
    mockCompleteOnboarding.mockResolvedValue({ ok: true, json: async () => ({}) });
    mockCaptureEvent.mockClear();
    mockCaptureAppException.mockClear();
    mockSeedIsPending.value = false;
    mockSeedMutateAsync.mockResolvedValue({ seeded: true, recordCount: 5 });
  });

  afterEach(() => {
    // Restores the Intl.DateTimeFormat spy when a test installs one.
    vi.restoreAllMocks();
  });

  // ─── Step 1: Welcome + Goal ──────────────────────────────────────────────────

  describe("Step 1 — Welcome + Goal", () => {
    it("renders the welcome heading", () => {
      render(React.createElement(OnboardingPage));
      expect(screen.getByRole("heading", { name: /Welcome to GrantPipe/i })).toBeInTheDocument();
    });

    it("renders the sub-heading copy", () => {
      render(React.createElement(OnboardingPage));
      expect(screen.getByText(/What do you want to do first\? Pick one\./i)).toBeInTheDocument();
    });

    it("renders the GoalStep component", () => {
      render(React.createElement(OnboardingPage));
      expect(screen.getByTestId("goal-step")).toBeInTheDocument();
    });

    it("shows step 1 of 3 in progress indicator", () => {
      render(React.createElement(OnboardingPage));
      expect(screen.getByText(/Step 1 of 3/i)).toBeInTheDocument();
    });

    it("carries a free-trial, no-card reassurance in the wizard chrome", () => {
      render(React.createElement(OnboardingPage));
      expect(screen.getByText(/Free for 1 month\. No credit card\./i)).toBeInTheDocument();
    });

    it("tracks the initial welcome step view on mount", () => {
      render(React.createElement(OnboardingPage));
      expect(mockCaptureEvent).toHaveBeenCalledWith("onboarding_step_viewed", {
        step_number: 1,
        step_name: "welcome",
      });
    });

    it("Continue button is disabled when no goal is selected", () => {
      render(React.createElement(OnboardingPage));
      expect(screen.getByRole("button", { name: /Continue/i })).toBeDisabled();
    });

    it("selecting a goal fires onboarding_goal_selected event", () => {
      render(React.createElement(OnboardingPage));
      fireEvent.click(screen.getByTestId("goal-donors"));
      expect(mockCaptureEvent).toHaveBeenCalledWith("onboarding_goal_selected", {
        goal: "donors",
      });
    });

    it("selecting a goal enables the Continue button", () => {
      render(React.createElement(OnboardingPage));
      fireEvent.click(screen.getByTestId("goal-grants"));
      expect(screen.getByRole("button", { name: /Continue/i })).not.toBeDisabled();
    });

    it("clicking Continue (after selecting a goal) advances to Step 2", () => {
      render(React.createElement(OnboardingPage));
      fireEvent.click(screen.getByTestId("goal-donors"));
      fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
      expect(screen.getByLabelText("Organization name")).toBeInTheDocument();
      expect(mockCaptureEvent).toHaveBeenCalledWith("onboarding_step_completed", {
        step_number: 1,
        step_name: "welcome",
      });
      expect(mockCaptureEvent).toHaveBeenCalledWith("onboarding_step_viewed", {
        step_number: 2,
        step_name: "org_setup",
      });
    });

    it("does not have a Back button on Step 1", () => {
      render(React.createElement(OnboardingPage));
      expect(screen.queryByRole("button", { name: /Back/i })).not.toBeInTheDocument();
    });

    it("does not show org form fields on Step 1", () => {
      render(React.createElement(OnboardingPage));
      expect(screen.queryByLabelText("Organization name")).not.toBeInTheDocument();
    });
  });

  // ─── Step 2: Org setup ──────────────────────────────────────────────────────

  describe("Step 2 — Org setup", () => {
    function renderStep2(goalChoice: "donors" | "grants" | "compliance" = "donors") {
      render(React.createElement(OnboardingPage));
      fireEvent.click(screen.getByTestId(`goal-${goalChoice}`));
      fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    }

    it("renders a heading framing the org setup step", () => {
      renderStep2();
      expect(
        screen.getByRole("heading", { name: /Tell us about your organization/i }),
      ).toBeInTheDocument();
    });

    it("renders the org name field with plain helper text", () => {
      renderStep2();
      expect(screen.getByLabelText("Organization name")).toBeInTheDocument();
      expect(
        screen.getByText(/This is the name we put on your reports\. You can change it later\./i),
      ).toBeInTheDocument();
    });

    it("tells the user we set fiscal year and time zone automatically", () => {
      renderStep2();
      expect(
        screen.getByText(
          /We set your fiscal year and time zone for you\. You can change them in Settings\./i,
        ),
      ).toBeInTheDocument();
    });

    it("no longer asks the user to pick a fiscal year or time zone", () => {
      renderStep2();
      expect(screen.queryByLabelText("Fiscal year start month")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Timezone")).not.toBeInTheDocument();
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    });

    it("fires onboarding_timezone_autodetected with detected:true for a supported browser zone", () => {
      mockBrowserTimeZone("America/Chicago");
      renderStep2();
      expect(mockCaptureEvent).toHaveBeenCalledWith("onboarding_timezone_autodetected", {
        detected: true,
      });
    });

    it("fires onboarding_timezone_autodetected with detected:false for an unsupported browser zone", () => {
      mockBrowserTimeZone("Europe/Paris");
      renderStep2();
      expect(mockCaptureEvent).toHaveBeenCalledWith("onboarding_timezone_autodetected", {
        detected: false,
      });
    });

    it("falls back when browser time zone detection throws", () => {
      vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => {
        throw new Error("timezone unavailable");
      });
      renderStep2();
      expect(mockCaptureEvent).toHaveBeenCalledWith("onboarding_timezone_autodetected", {
        detected: false,
      });
    });

    it("renders 'Continue' button", () => {
      renderStep2();
      expect(screen.getByRole("button", { name: /Continue/i })).toBeInTheDocument();
    });

    it("disables 'Continue' until an organization name is entered", () => {
      renderStep2();
      const continueBtn = screen.getByRole("button", { name: /Continue/i });
      expect(continueBtn).toBeDisabled();

      fireEvent.change(screen.getByLabelText("Organization name"), {
        target: { value: "   " },
      });
      expect(continueBtn).toBeDisabled();

      fireEvent.change(screen.getByLabelText("Organization name"), {
        target: { value: "Acme Nonprofit" },
      });
      expect(continueBtn).not.toBeDisabled();
    });

    it("shows step 2 of 3 in progress indicator", () => {
      renderStep2();
      expect(screen.getByText(/Step 2 of 3/i)).toBeInTheDocument();
    });

    it("'← Back' goes back to Step 1", () => {
      renderStep2();
      fireEvent.click(screen.getByRole("button", { name: /Back/i }));
      expect(screen.getByRole("heading", { name: /Welcome to GrantPipe/i })).toBeInTheDocument();
      expect(mockCaptureEvent).toHaveBeenCalledWith("onboarding_back_clicked", {
        step_number: 2,
        step_name: "org_setup",
        to_step_number: 1,
        to_step_name: "welcome",
      });
    });

    it("submits the form with onboardingGoal and advances to Step 3 on success", async () => {
      mockOrgUpdate.mockResolvedValue({ ok: true, json: async () => ({}) });
      renderStep2("grants");

      fireEvent.change(screen.getByLabelText("Organization name"), {
        target: { value: "Test Nonprofit" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

      await waitFor(() => {
        expect(mockOrgUpdate).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /See how it works/i })).toBeInTheDocument();
      });
      expect(mockCaptureEvent).toHaveBeenCalledWith("onboarding_step_completed", {
        step_number: 2,
        step_name: "org_setup",
      });
      expect(mockCaptureEvent).toHaveBeenCalledWith("onboarding_step_viewed", {
        step_number: 3,
        step_name: "get_data",
      });
    });

    it("carries the selected trial plan into onboarding setup and clears it after success", async () => {
      mockReadPendingPlan.mockReturnValue({
        planTier: "growth",
        billingCycle: "annual",
      });
      mockOrgUpdate.mockResolvedValue({ ok: true, json: async () => ({}) });
      renderStep2("grants");

      fireEvent.change(screen.getByLabelText("Organization name"), {
        target: { value: "Test Nonprofit" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

      await waitFor(() => {
        expect(mockOrgUpdate).toHaveBeenCalledWith({
          json: expect.objectContaining({
            orgName: "Test Nonprofit",
            onboardingGoal: "grants",
            planTier: "growth",
            billingCycle: "annual",
          }),
        });
      });
      expect(mockClearPendingPlan).toHaveBeenCalled();
    });

    it("does not mark auth-session-context complete on org setup success", async () => {
      mockOrgUpdate.mockResolvedValue({ ok: true, json: async () => ({}) });
      renderStep2("grants");

      fireEvent.change(screen.getByLabelText("Organization name"), {
        target: { value: "Test Nonprofit" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /See how it works/i })).toBeInTheDocument();
      });

      expect(mockSetQueriesData).not.toHaveBeenCalled();
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["org-profile"],
      });
    });

    it("shows API error message on failure", async () => {
      mockOrgUpdate.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ message: "Setup failed" }),
      });
      renderStep2();

      fireEvent.change(screen.getByLabelText("Organization name"), {
        target: { value: "Test Nonprofit" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Setup failed");
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(mockCaptureEvent).toHaveBeenCalledWith("onboarding_step_failed", {
        step_number: 2,
        step_name: "org_setup",
        failure_type: "api_error",
      });
      expect(mockCaptureAppException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          tags: {
            feature: "onboarding",
            operation: "org_setup",
            failure_type: "api_error",
            status: "400",
          },
        }),
        { includeExpected: true, sanitize: true },
      );
      expect(JSON.stringify(mockCaptureAppException.mock.calls)).not.toContain("Test Nonprofit");
    });

    it("shows fallback error when API fails without a message", async () => {
      mockOrgUpdate.mockResolvedValue({
        ok: false,
        json: async () => ({}),
      });
      renderStep2();

      fireEvent.change(screen.getByLabelText("Organization name"), {
        target: { value: "Test Nonprofit" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Setup failed. Please try again.");
      expect(mockCaptureEvent).toHaveBeenCalledWith("onboarding_step_failed", {
        step_number: 2,
        step_name: "org_setup",
        failure_type: "api_error",
      });
    });

    it("shows unexpected error when request throws", async () => {
      mockOrgUpdate.mockRejectedValue(new Error("network down"));
      renderStep2();

      fireEvent.change(screen.getByLabelText("Organization name"), {
        target: { value: "Test Nonprofit" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "An unexpected error occurred. Please try again.",
      );
      expect(mockCaptureEvent).toHaveBeenCalledWith("onboarding_step_failed", {
        step_number: 2,
        step_name: "org_setup",
        failure_type: "request_error",
      });
      expect(mockCaptureAppException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          tags: {
            feature: "onboarding",
            operation: "org_setup",
            failure_type: "request_error",
          },
        }),
        { sanitize: true },
      );
    });

    it("disables the submit button while submitting", async () => {
      let resolve!: (v: { ok: boolean; json: () => Promise<Record<string, unknown>> }) => void;
      mockOrgUpdate.mockReturnValue(
        new Promise((r) => {
          resolve = r;
        }),
      );
      renderStep2();
      fireEvent.change(screen.getByLabelText("Organization name"), {
        target: { value: "Test Nonprofit" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Saving/i })).toBeDisabled();
      });
      resolve({ ok: true, json: async () => ({}) });
    });

    it("does not offer a skip on step 2 (org name is required to continue)", () => {
      renderStep2();
      expect(screen.queryByRole("button", { name: /Do this later/i })).not.toBeInTheDocument();
    });
  });

  // ─── Step 3: Get data ────────────────────────────────────────────────────────

  describe("Step 3 — Get data", () => {
    async function renderStep3(goalChoice: "donors" | "grants" | "compliance" = "donors") {
      mockOrgUpdate.mockResolvedValue({ ok: true, json: async () => ({}) });
      render(React.createElement(OnboardingPage));
      fireEvent.click(screen.getByTestId(`goal-${goalChoice}`));
      fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
      fireEvent.change(screen.getByLabelText("Organization name"), {
        target: { value: "Test Nonprofit" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /See how it works/i })).toBeInTheDocument();
      });
    }

    it("renders the 'See how it works' heading", async () => {
      await renderStep3();
      expect(screen.getByRole("heading", { name: /See how it works/i })).toBeInTheDocument();
    });

    it("renders the sub-heading copy", async () => {
      await renderStep3();
      expect(
        screen.getByText(/We fill your workspace with example records so you can look around\./i),
      ).toBeInTheDocument();
    });

    it("leads with a hero 'Show me around' sample-data action and its benefit copy", async () => {
      await renderStep3();
      expect(screen.getByRole("button", { name: /Show me around/i })).toBeInTheDocument();
      expect(
        screen.getByText(/See what is due, what is left, and what needs proof/i),
      ).toBeInTheDocument();
    });

    it("offers only the sample-data action (no import/scratch branch or divider)", async () => {
      await renderStep3();
      expect(screen.getByRole("button", { name: /Show me around/i })).toBeInTheDocument();
      expect(screen.queryByText(/Or start your own way/i)).not.toBeInTheDocument();
      expect(screen.queryByText("Import a spreadsheet")).not.toBeInTheDocument();
      expect(screen.queryByText("Start from scratch")).not.toBeInTheDocument();
    });

    it("shows step 3 of 3 in progress indicator", async () => {
      await renderStep3();
      expect(screen.getByText(/Step 3 of 3/i)).toBeInTheDocument();
    });

    it("'← Back' goes back to Step 2", async () => {
      await renderStep3();
      fireEvent.click(screen.getByRole("button", { name: /Back/i }));
      expect(screen.getByLabelText("Organization name")).toBeInTheDocument();
      expect(mockCaptureEvent).toHaveBeenCalledWith("onboarding_back_clicked", {
        step_number: 3,
        step_name: "get_data",
        to_step_number: 2,
        to_step_name: "org_setup",
      });
    });

    it("'Show me around' seeds sample data, arms the aha banner, fires events, and navigates to the aha route (donors→/dashboard)", async () => {
      await renderStep3("donors");
      fireEvent.click(screen.getByRole("button", { name: /Show me around/i }));
      await waitFor(() => {
        expect(mockSeedMutateAsync).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith({ to: "/dashboard" });
      });
      expect(readPendingAhaGoal("org_1")).toBe("donors");
      expect(mockCaptureEvent).toHaveBeenCalledWith("onboarding_sample_data_chosen", {
        goal: "donors",
      });
      expect(mockCaptureEvent).toHaveBeenCalledWith("onboarding_first_action_selected", {
        first_action: "sample_data",
      });
    });

    it("'Show me around' navigates to /funds and arms the grants banner when goal is grants", async () => {
      await renderStep3("grants");
      fireEvent.click(screen.getByRole("button", { name: /Show me around/i }));
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith({ to: "/funds" });
      });
      expect(readPendingAhaGoal("org_1")).toBe("grants");
    });

    it("'Show me around' navigates to /reports when goal is compliance", async () => {
      await renderStep3("compliance");
      fireEvent.click(screen.getByRole("button", { name: /Show me around/i }));
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith({ to: "/reports" });
      });
      expect(readPendingAhaGoal("org_1")).toBe("compliance");
    });

    it("seed failure shows error alert, does not arm the banner, calls step failed, does NOT navigate", async () => {
      mockSeedMutateAsync.mockRejectedValue(new Error("seed failed"));
      await renderStep3();
      fireEvent.click(screen.getByRole("button", { name: /Show me around/i }));
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Something went wrong loading sample data. Please try again.",
      );
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(readPendingAhaGoal("org_1")).toBeNull();
      expect(mockCaptureEvent).toHaveBeenCalledWith("onboarding_step_failed", {
        step_number: 3,
        step_name: "get_data",
        failure_type: "request_error",
      });
    });

    it("completion failure after sample data shows setup error and does not navigate", async () => {
      mockCompleteOnboarding.mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Add one thing first." }),
      });
      await renderStep3("donors");
      fireEvent.click(screen.getByRole("button", { name: /Show me around/i }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Something went wrong finishing setup. Please try again.",
      );
      expect(mockSeedMutateAsync).toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(readPendingAhaGoal("org_1")).toBeNull();
      expect(mockCaptureEvent).toHaveBeenCalledWith("onboarding_step_failed", {
        step_number: 3,
        step_name: "get_data",
        failure_type: "api_error",
      });
    });

    it("sample data button is disabled and shows loading copy while seed is pending", async () => {
      mockSeedIsPending.value = true;
      await renderStep3();
      expect(screen.getByRole("button", { name: /Loading examples/i })).toBeDisabled();
    });

    it("does not offer a skip action that can complete onboarding into a blank app", async () => {
      await renderStep3("grants");
      expect(screen.queryByRole("button", { name: /Do this later/i })).not.toBeInTheDocument();
    });
  });

  // ─── Progress indicator ─────────────────────────────────────────────────────

  describe("Progress indicator", () => {
    it("shows correct step number as user moves through the 3-step wizard", async () => {
      mockOrgUpdate.mockResolvedValue({ ok: true, json: async () => ({}) });
      render(React.createElement(OnboardingPage));

      expect(screen.getByText(/Step 1 of 3/i)).toBeInTheDocument();

      fireEvent.click(screen.getByTestId("goal-donors"));
      fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
      expect(screen.getByText(/Step 2 of 3/i)).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText("Organization name"), {
        target: { value: "Test Nonprofit" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

      await waitFor(() => {
        expect(screen.getByText(/Step 3 of 3/i)).toBeInTheDocument();
      });
    });
  });

  // ─── Friction analytics ─────────────────────────────────────────────────────

  describe("Friction analytics", () => {
    it("tracks onboarding abandonment on page unload with current step metadata", () => {
      render(React.createElement(OnboardingPage));
      fireEvent.click(screen.getByTestId("goal-donors"));
      fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

      window.dispatchEvent(new Event("beforeunload"));

      expect(mockCaptureEvent).toHaveBeenCalledWith("onboarding_abandoned", {
        step_number: 2,
        step_name: "org_setup",
      });
    });

    it("tracks abandonment with step 1 metadata if user hasn't advanced", () => {
      render(React.createElement(OnboardingPage));
      window.dispatchEvent(new Event("beforeunload"));
      expect(mockCaptureEvent).toHaveBeenCalledWith("onboarding_abandoned", {
        step_number: 1,
        step_name: "welcome",
      });
    });
  });

  // ─── Skip (Do this later) on step 3 ─────────────────────────────────────────

  describe("No skip from step 3", () => {
    it("requires a concrete first-value path before completion", async () => {
      await advanceToStep3("donors");
      expect(screen.queryByRole("button", { name: /Do this later/i })).not.toBeInTheDocument();
      expect(mockCompleteOnboarding).not.toHaveBeenCalled();
    });
  });

  // ─── Removed legacy UI ─────────────────────────────────────────────────────

  describe("Removed legacy UI", () => {
    it("does not render the removed checkout success banner", () => {
      mockUseSearch.mockReturnValue({ checkout: "success" });
      render(React.createElement(OnboardingPage));
      expect(screen.queryByTestId("checkout-success-banner")).not.toBeInTheDocument();
    });

    it("does not render the removed pending-plan bridge summary", () => {
      render(React.createElement(OnboardingPage));
      expect(screen.queryByTestId("pending-plan-summary")).not.toBeInTheDocument();
    });

    it("does not render the old 4-step import prompt", () => {
      render(React.createElement(OnboardingPage));
      expect(screen.queryByText(/Do you have data to move\?/i)).not.toBeInTheDocument();
    });

    it("does not render the old 'What matters most to you right now?' step", () => {
      render(React.createElement(OnboardingPage));
      expect(screen.queryByText(/What matters most to you right now\?/i)).not.toBeInTheDocument();
    });
  });

  // ─── Cache updater edge case ─────────────────────────────────────────────────

  describe("Cache updater — null orgSubscription branch", () => {
    it("preserves null orgSubscription when marking onboarding complete via sample data", async () => {
      await advanceToStep3("donors");
      // Clear setup calls so calls[0] is the sample-data completion cache update.
      mockSetQueriesData.mockClear();
      fireEvent.click(screen.getByRole("button", { name: /Show me around/i }));

      await waitFor(() => {
        expect(mockSetQueriesData).toHaveBeenCalledWith(
          { queryKey: ["auth-session-context"] },
          expect.any(Function),
        );
      });

      const updater = mockSetQueriesData.mock.calls[0]![1] as (current: {
        onboardingCompleted: boolean;
        onboardingGoal?: string | null;
        orgSubscription: null;
      }) => unknown;

      const result = updater({
        onboardingCompleted: false,
        onboardingGoal: null,
        orgSubscription: null,
      });

      expect(result).toEqual({
        onboardingCompleted: true,
        onboardingGoal: "donors",
        orgSubscription: null,
      });
    });

    it("returns undefined when context is undefined", async () => {
      await advanceToStep3("donors");
      // Clear setup calls so calls[0] is the sample-data completion cache update.
      mockSetQueriesData.mockClear();
      fireEvent.click(screen.getByRole("button", { name: /Show me around/i }));

      await waitFor(() => {
        expect(mockSetQueriesData).toHaveBeenCalledWith(
          { queryKey: ["auth-session-context"] },
          expect.any(Function),
        );
      });

      const updater = mockSetQueriesData.mock.calls[0]![1] as (current: undefined) => undefined;
      const result = updater(undefined);
      expect(result).toBeUndefined();
    });
  });

  // ─── Removed incentive parameter ────────────────────────────────────────────

  describe("Removed incentive parameter", () => {
    it("does not show an error when a ref param is present", () => {
      mockUseSearch.mockReturnValue({ ref: "ABC12345" });
      render(React.createElement(OnboardingPage));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("renders normally when no ref param is present", async () => {
      mockUseSearch.mockReturnValue({});
      render(React.createElement(OnboardingPage));
      await Promise.resolve();
      expect(screen.getByRole("heading", { name: /Welcome to GrantPipe/i })).toBeInTheDocument();
    });
  });
});
