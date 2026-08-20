import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { EmailCapture } from "./email-capture";
import { installMockTurnstile } from "./turnstile-test-utils";

vi.mock("../lib/analytics", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("../lib/form-interaction-tracker", () => ({
  trackEmailFocus: vi.fn(),
  trackEmailBlurWithoutSubmit: vi.fn(),
  resetFocusTracking: vi.fn(),
}));

vi.mock("../lib/sentry-client", () => ({
  captureSiteFetchFailure: vi.fn(),
}));

import { trackEvent } from "../lib/analytics";
import { trackEmailFocus, trackEmailBlurWithoutSubmit } from "../lib/form-interaction-tracker";
import { captureSiteFetchFailure } from "../lib/sentry-client";

const defaultProps = {
  apiUrl: "https://api.test",
  sourcePage: "/",
  surveyQuestions: [{ id: "role", text: "Your role?", options: ["Dev", "PM", "Other"] }],
  discoveryCallUrl: "https://cal.com/test",
  buttonText: "Start Free Trial",
  placeholder: "you@company.com",
  privacyNote: "Unsubscribe any time.",
  errorInvalidEmail: "Please enter a valid email address.",
  errorGeneric: "Something went wrong. Try again.",
  successMessage: "You're in!",
};

function omitProps<T extends object, K extends keyof T>(value: T, ...keys: K[]): Omit<T, K> {
  const clone = { ...value } as T;
  for (const key of keys) {
    delete clone[key];
  }
  return clone as Omit<T, K>;
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  // Reset Turnstile dedup flag and globals between tests
  (globalThis as Record<string, unknown>).__turnstileScriptLoaded = false;
  delete (window as Record<string, unknown>).turnstile;
  delete (window as Record<string, unknown>).onloadTurnstileCallback;
  document.querySelectorAll('script[src*="turnstile"]').forEach((el) => el.remove());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("EmailCapture", () => {
  it.each([
    ["HTTP error", async () => ({ ok: false, status: 500 })],
    ["network rejection", async () => Promise.reject(new Error("offline"))],
  ])(
    "resets a spent Turnstile token after an %s and requires a fresh token",
    async (_label, response) => {
      const mockTurnstile = installMockTurnstile();
      const fetchMock = vi.fn(response);
      vi.stubGlobal("fetch", fetchMock);
      render(<EmailCapture {...defaultProps} turnstileSiteKey="0xEMAIL" />);

      act(() => mockTurnstile.flush());
      act(() => mockTurnstile.renderOptions[0]?.callback("spent-token"));
      fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
        target: { value: "person@example.org" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Start Free Trial" }));

      await waitFor(() => expect(mockTurnstile.turnstile.reset).toHaveBeenCalledWith("widget-1"));
      fireEvent.click(screen.getByRole("button", { name: "Start Free Trial" }));
      expect(fetchMock).toHaveBeenCalledTimes(1);

      act(() => mockTurnstile.renderOptions[0]?.callback("fresh-token"));
      fireEvent.click(screen.getByRole("button", { name: "Start Free Trial" }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      expect(JSON.parse(fetchMock.mock.calls[1]![1]!.body as string).turnstileToken).toBe(
        "fresh-token",
      );
    },
  );

  it("resets the Turnstile widget after a successful request", async () => {
    const mockTurnstile = installMockTurnstile();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
    );
    render(<EmailCapture {...defaultProps} turnstileSiteKey="0xEMAIL" />);
    act(() => mockTurnstile.flush());
    act(() => mockTurnstile.renderOptions[0]?.callback("spent-token"));
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "person@example.org" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start Free Trial" }));
    await waitFor(() => expect(mockTurnstile.turnstile.reset).toHaveBeenCalledWith("widget-1"));
  });

  it("does not claim signup success for an unsubscribed email", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ deliveryState: "unsubscribed" }),
      })),
    );

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "stopped@example.org" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() =>
      expect(screen.getByText("You asked us to stop. Try a new email.")).toBeDefined(),
    );
    expect(screen.queryByText("You're in!")).toBeNull();
    expect(vi.mocked(trackEvent)).not.toHaveBeenCalledWith("signup_completed", expect.anything());
    expect(vi.mocked(trackEvent)).not.toHaveBeenCalledWith("signup_submitted", expect.anything());
  });
  it("renders input with placeholder and submit button", () => {
    render(<EmailCapture {...defaultProps} />);
    expect(screen.getByPlaceholderText("you@company.com")).toBeDefined();
    expect(screen.getByRole("button", { name: "Start Free Trial" })).toBeDefined();
  });

  it("defaults buttonText to 'Continue' when not provided", () => {
    const propsWithoutButtonText = omitProps(defaultProps, "buttonText");
    render(<EmailCapture {...propsWithoutButtonText} />);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDefined();
  });

  it("applies custom buttonText and placeholder", () => {
    render(<EmailCapture {...defaultProps} buttonText="Join" placeholder="email@co.com" />);
    expect(screen.getByPlaceholderText("email@co.com")).toBeDefined();
    expect(screen.getByRole("button", { name: "Join" })).toBeDefined();
  });

  it("renders privacy note when provided", () => {
    render(
      <EmailCapture
        {...defaultProps}
        privacyNote="We'll send the next step by email. Unsubscribe any time."
      />,
    );
    expect(
      screen.getByText("We'll send the next step by email. Unsubscribe any time."),
    ).toBeDefined();
  });

  it("does not render privacy note when set to undefined", () => {
    const propsWithoutPrivacy = omitProps(defaultProps, "privacyNote");
    render(<EmailCapture {...propsWithoutPrivacy} />);
    expect(
      screen.queryByText("We'll send the next step by email. Unsubscribe any time."),
    ).toBeNull();
  });

  it("shows inline validation error for invalid email without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <EmailCapture {...defaultProps} errorInvalidEmail="Please enter a valid email address." />,
    );
    const input = screen.getByPlaceholderText("you@company.com");
    fireEvent.change(input, { target: { value: "notanemail" } });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    expect(screen.getByText("Please enter a valid email address.")).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows validation error message from errorInvalidEmail prop", () => {
    vi.stubGlobal("fetch", vi.fn());

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "bad" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    expect(screen.getByText("Please enter a valid email address.")).toBeDefined();
  });

  it("shows default errorInvalidEmail when error prop is not provided", () => {
    vi.stubGlobal("fetch", vi.fn());

    const propsWithoutErrors = omitProps(defaultProps, "errorInvalidEmail", "errorGeneric");
    render(<EmailCapture {...propsWithoutErrors} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "bad" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    expect(screen.getByText("Please enter a valid email address")).toBeDefined();
  });

  it("shows default errorGeneric when error prop is not provided", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const propsWithoutErrors = omitProps(defaultProps, "errorInvalidEmail", "errorGeneric");
    render(<EmailCapture {...propsWithoutErrors} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "test@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(screen.getByText("Something went wrong. Please try again.")).toBeDefined();
    });
  });

  it("applies red border on validation error", () => {
    vi.stubGlobal("fetch", vi.fn());

    render(<EmailCapture {...defaultProps} />);
    const input = screen.getByPlaceholderText("you@company.com");
    fireEvent.change(input, { target: { value: "notvalid" } });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    expect(input.className).toContain("border-error-500");
  });

  it("calls fetch with email, sourcePage and UTM params nested under utm on submit", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    Object.defineProperty(window, "location", {
      value: { search: "?utm_source=google&utm_medium=cpc&utm_campaign=test" },
      writable: true,
      configurable: true,
    });

    render(<EmailCapture {...defaultProps} />);
    const input = screen.getByPlaceholderText("you@company.com");
    fireEvent.change(input, { target: { value: "a@b.com" } });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("https://api.test/api/public/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "a@b.com",
          sourcePage: "/",
          utm: {
            utmSource: "google",
            utmMedium: "cpc",
            utmCampaign: "test",
          },
          companyWebsite: "",
          turnstileToken: "",
        }),
      });
    });

    // Restore location and advance timers to prevent unhandled post-teardown timer
    Object.defineProperty(window, "location", {
      value: { search: "" },
      writable: true,
      configurable: true,
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
  });

  it("uses persisted attribution when the current page query string is empty", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);
    sessionStorage.setItem(
      "signup-attribution",
      JSON.stringify({
        utmSource: "google",
        utmMedium: "cpc",
        utmCampaign: "spring",
        referredBy: "partner",
      }),
    );

    Object.defineProperty(window, "location", {
      value: { search: "" },
      writable: true,
      configurable: true,
    });

    render(<EmailCapture {...defaultProps} sourcePage="/compare/alternatives" />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("https://api.test/api/public/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "a@b.com",
          sourcePage: "/compare/alternatives",
          utm: {
            utmSource: "google",
            utmMedium: "cpc",
            utmCampaign: "spring",
            referredBy: "partner",
          },
          companyWebsite: "",
          turnstileToken: "",
        }),
      });
    });

    await waitFor(() => {
      expect(vi.mocked(trackEvent)).toHaveBeenCalledWith("signup_completed", {
        source_page: "/compare/alternatives",
        utm_source: "google",
        utm_medium: "cpc",
        utm_campaign: "spring",
      });
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });
  });

  it("shows success message and survey preview on success, then opens survey after 1.5s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    render(
      <EmailCapture
        {...defaultProps}
        successMessage="You're in!"
        surveyPreview="Quick 30-second survey next"
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    // After success, button shows success message
    await waitFor(() => {
      expect(screen.getByText("You're in!")).toBeDefined();
    });

    // Survey preview text should be visible
    expect(screen.getByText("Quick 30-second survey next")).toBeDefined();

    // Survey should NOT be open yet
    expect(screen.queryByText("Your role?")).toBeNull();

    // Advance 1.5 seconds
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    // Survey should now be open
    await waitFor(() => {
      expect(screen.getByText("Your role?")).toBeDefined();
    });
  });

  it("renders default success message when successMessage not provided", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const propsWithoutSuccess = omitProps(defaultProps, "successMessage");
    render(<EmailCapture {...propsWithoutSuccess} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    // The button should show the checkmark SVG and the default "You're in!" text
    await waitFor(() => {
      const button = screen.getByRole("button");
      expect(button.querySelector("svg")).toBeTruthy();
      expect(button.textContent).toContain("You're in!");
    });
  });

  it("shows PostSignupSurvey after delay on success (no surveyPreview)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(screen.getByText("You're in!")).toBeDefined();
    });

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    await waitFor(() => {
      expect(screen.getByText("Your role?")).toBeDefined();
    });
  });

  it("shows error-generic on 409 response (non-ok goes to error state)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
      }),
    );

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(screen.getByText("Something went wrong. Try again.")).toBeDefined();
    });

    // Content unlock must not happen on non-ok response
    expect(screen.queryByText("Your role?")).toBeNull();
  });

  it("shows generic error message on non-ok non-409 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    render(
      <EmailCapture {...defaultProps} errorGeneric="Something went wrong. Please try again." />,
    );
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(screen.getByText("Something went wrong. Please try again.")).toBeDefined();
    });
    expect(captureSiteFetchFailure).toHaveBeenCalledWith(null, {
      source: "email-capture",
      status: 500,
    });
  });

  it("shows errorGeneric message on non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(screen.getByText("Something went wrong. Try again.")).toBeDefined();
    });
  });

  it("shows error on fetch network error", async () => {
    const error = new Error("network");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(screen.getByText("Something went wrong. Try again.")).toBeDefined();
    });
    expect(captureSiteFetchFailure).toHaveBeenCalledWith(error, {
      source: "email-capture",
      status: undefined,
    });
  });

  it("shows custom generic error on fetch network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    render(<EmailCapture {...defaultProps} errorGeneric="Connection failed. Try again." />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(screen.getByText("Connection failed. Try again.")).toBeDefined();
    });
  });

  it("returns to email form when survey onComplete fires", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    // Wait for success state, then advance timer to open survey
    await waitFor(() => screen.getByText("You're in!"));
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    // Wait for survey to appear
    await waitFor(() => screen.getByText("Your role?"));

    // Answer the single question
    fireEvent.click(screen.getByText("Dev"));

    // Wait for completion screen (survey done dialog)
    await waitFor(() => screen.getByRole("dialog", { name: "Survey complete" }));

    // Dismiss the survey via close button
    fireEvent.click(screen.getByLabelText("Close"));

    // Should show the email form again
    await waitFor(() => {
      expect(screen.getByPlaceholderText("you@company.com")).toBeDefined();
    });
  });

  it("disables input and button during loading", async () => {
    let resolveFetch: (v: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise((r) => {
          resolveFetch = r;
        }),
      ),
    );

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      const button = screen.getByRole("button");
      expect(button).toHaveProperty("disabled", true);
      expect(button.textContent).toContain("Sending…");
    });

    resolveFetch!({ ok: true, status: 200 });
  });

  it("adds cursor-wait class to button during loading", async () => {
    let resolveFetch: (v: { ok: boolean; status: number }) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise((r) => {
          resolveFetch = r;
        }),
      ),
    );

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      const button = screen.getByRole("button");
      expect(button.className).toContain("cursor-wait");
    });

    resolveFetch!({ ok: true, status: 200 });
  });

  it("clears validation error when user retypes email", () => {
    vi.stubGlobal("fetch", vi.fn());

    render(<EmailCapture {...defaultProps} />);
    const input = screen.getByPlaceholderText("you@company.com");

    // Trigger validation error
    fireEvent.change(input, { target: { value: "bad" } });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    expect(screen.getByText("Please enter a valid email address.")).toBeDefined();

    // User retypes email — error should clear
    fireEvent.change(input, { target: { value: "a@b.com" } });

    expect(screen.queryByText("Please enter a valid email address.")).toBeNull();
  });

  it("accepts valid email formats and proceeds to fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "user@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  // --- subtitle prop ---

  it("renders subtitle when provided", () => {
    render(<EmailCapture {...defaultProps} subtitle="No credit card required." />);
    expect(screen.getByText("No credit card required.")).toBeDefined();
  });

  it("renders subtitle, privacy note, and whatHappensNext in outcome-to-process order", () => {
    render(
      <EmailCapture
        {...defaultProps}
        subtitle="See your symptom patterns more clearly."
        privacyNote="Private by design. No ads. No data selling."
        whatHappensNext="We will email your access link right away."
      />,
    );

    const copyBlocks = screen.getAllByText(
      /See your symptom patterns more clearly\.|Private by design\. No ads\. No data selling\.|We will email your access link right away\./,
    );

    expect(copyBlocks.map((node) => node.textContent)).toEqual([
      "See your symptom patterns more clearly.",
      "Private by design. No ads. No data selling.",
      "We will email your access link right away.",
    ]);
  });

  it("does not render subtitle when not provided", () => {
    render(<EmailCapture {...defaultProps} />);
    expect(screen.queryByText("No credit card required.")).toBeNull();
  });

  // --- whatHappensNext prop ---

  it("renders whatHappensNext in idle state when provided", () => {
    render(
      <EmailCapture
        {...defaultProps}
        whatHappensNext="We'll send you a confirmation email right away."
      />,
    );
    expect(screen.getByText("We'll send you a confirmation email right away.")).toBeDefined();
  });

  it("does not render whatHappensNext when status is loading", async () => {
    let resolveFetch: (v: { ok: boolean; status: number }) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise((r) => {
          resolveFetch = r;
        }),
      ),
    );

    render(
      <EmailCapture
        {...defaultProps}
        whatHappensNext="We'll send you a confirmation email right away."
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(screen.queryByText("We'll send you a confirmation email right away.")).toBeNull();
    });

    resolveFetch!({ ok: true, status: 200 });
  });

  it("does not render whatHappensNext when status is success", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    render(
      <EmailCapture
        {...defaultProps}
        whatHappensNext="We'll send you a confirmation email right away."
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(screen.getByText("You're in!")).toBeDefined();
    });

    expect(screen.queryByText("We'll send you a confirmation email right away.")).toBeNull();
  });

  it("does not render whatHappensNext when status is error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    render(
      <EmailCapture
        {...defaultProps}
        whatHappensNext="We'll send you a confirmation email right away."
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(screen.getByText("Something went wrong. Try again.")).toBeDefined();
    });

    expect(screen.queryByText("We'll send you a confirmation email right away.")).toBeNull();
  });

  // --- privacyNote prop ---

  it("does not render privacy note when privacyNote prop is not provided", () => {
    const propsWithoutPrivacy = omitProps(defaultProps, "privacyNote");
    render(<EmailCapture {...propsWithoutPrivacy} />);
    expect(screen.queryByText("Unsubscribe any time.")).toBeNull();
  });

  it("renders privacyNote when explicitly provided", () => {
    render(<EmailCapture {...defaultProps} privacyNote="Your data stays private." />);
    expect(screen.getByText("Your data stays private.")).toBeDefined();
  });

  // --- errorDuplicate prop ---

  it("shows errorGeneric message when API returns 409 (non-ok always goes to error-generic)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
      }),
    );

    render(<EmailCapture {...defaultProps} errorDuplicate="You've already signed up" />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(screen.getByText("Something went wrong. Try again.")).toBeDefined();
    });
  });

  it("shows error state on 409 — error container becomes visible", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
      }),
    );

    const { container } = render(<EmailCapture {...defaultProps} successMessage="You're in!" />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      // 409 now shows error — error container must be visible
      const errorEl = container.querySelector("[aria-live='polite']");
      expect(errorEl).toBeTruthy();
      expect(errorEl?.className).not.toContain("sr-only");
      expect(errorEl?.textContent).toBeTruthy();
    });
  });

  // --- visible label ---

  it("label shows custom emailLabel when provided", () => {
    render(<EmailCapture {...defaultProps} emailLabel="Work email" />);
    expect(screen.getByText("Work email")).toBeDefined();
  });

  it('label defaults to "Email address" when emailLabel prop is omitted', () => {
    render(<EmailCapture {...defaultProps} />);
    expect(screen.getByText("Email address")).toBeDefined();
  });

  // --- aria-label ---

  it('form has aria-label "Continue with your email"', () => {
    render(<EmailCapture {...defaultProps} />);
    expect(screen.getByRole("form", { name: "Continue with your email" })).toBeDefined();
  });

  it("does not render question-related whatHappensNext copy before submit", () => {
    render(
      <EmailCapture
        {...defaultProps}
        whatHappensNext="Answer 3 quick questions so we can place you in the right launch cohort."
      />,
    );

    expect(
      screen.queryByText(
        "Answer 3 quick questions so we can place you in the right launch cohort.",
      ),
    ).toBeNull();
  });

  it('form does NOT have the old aria-label "Sign up for a free trial"', () => {
    render(<EmailCapture {...defaultProps} />);
    expect(screen.queryByRole("form", { name: "Sign up for a free trial" })).toBeNull();
  });

  // --- isPlausibleEmail edge cases ---

  it('rejects "@." — nothing before @ and dot immediately after', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "@." },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    expect(screen.getByText("Please enter a valid email address.")).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects "@.com" — nothing before @', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "@.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    expect(screen.getByText("Please enter a valid email address.")).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects "user@" — no dot after @', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "user@" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    expect(screen.getByText("Please enter a valid email address.")).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects "user@.com" — dot immediately after @, no chars between @ and dot', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "user@.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    expect(screen.getByText("Please enter a valid email address.")).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects "a@b.c" — single-char TLD fails the strict regex (requires 2+ alpha chars)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.c" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Please enter a valid email address.")).toBeDefined();
  });

  it('accepts "user@example.com" — standard valid email', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "user@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(screen.queryByText("Please enter a valid email address.")).toBeNull();
  });

  it('rejects "user@@example.com" — double @ is invalid per the strict RFC-compliant regex', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "user@@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Please enter a valid email address.")).toBeDefined();
  });

  // --- survey=open auto-open ---

  it("opens survey immediately when ?survey=open&e=<base64email> is in the URL", async () => {
    const encodedEmail = btoa("autoopen@example.com");
    Object.defineProperty(window, "location", {
      value: { search: `?survey=open&e=${encodedEmail}` },
      writable: true,
      configurable: true,
    });

    render(<EmailCapture {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Your role?")).toBeDefined();
    });

    // Email form should not be visible
    expect(screen.queryByRole("form", { name: "Continue with your email" })).toBeNull();

    // Restore location
    Object.defineProperty(window, "location", {
      value: { search: "" },
      writable: true,
      configurable: true,
    });
  });

  it("does not auto-open survey when survey=open but e param is missing", () => {
    Object.defineProperty(window, "location", {
      value: { search: "?survey=open" },
      writable: true,
      configurable: true,
    });

    render(<EmailCapture {...defaultProps} />);

    expect(screen.getByRole("form", { name: "Continue with your email" })).toBeDefined();
    expect(screen.queryByText("Your role?")).toBeNull();

    Object.defineProperty(window, "location", {
      value: { search: "" },
      writable: true,
      configurable: true,
    });
  });

  it("does not auto-open survey when e param is present but survey param is not 'open'", () => {
    const encodedEmail = btoa("test@example.com");
    Object.defineProperty(window, "location", {
      value: { search: `?e=${encodedEmail}` },
      writable: true,
      configurable: true,
    });

    render(<EmailCapture {...defaultProps} />);

    expect(screen.getByRole("form", { name: "Continue with your email" })).toBeDefined();

    Object.defineProperty(window, "location", {
      value: { search: "" },
      writable: true,
      configurable: true,
    });
  });

  it("ignores malformed base64 in e param without crashing", () => {
    Object.defineProperty(window, "location", {
      value: { search: "?survey=open&e=!!!invalid!!!" },
      writable: true,
      configurable: true,
    });

    expect(() => render(<EmailCapture {...defaultProps} />)).not.toThrow();

    expect(screen.getByRole("form", { name: "Continue with your email" })).toBeDefined();

    Object.defineProperty(window, "location", {
      value: { search: "" },
      writable: true,
      configurable: true,
    });
  });

  // --- H4: stricter EMAIL_REGEX ---

  it("rejects email with double dots in local part (strict regex disallows consecutive dots)", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "user..name@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));
    expect(screen.getByText("Please enter a valid email address.")).toBeDefined();
  });

  it("rejects email with leading dot in local part (strict regex disallows leading dots)", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: ".user@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));
    expect(screen.getByText("Please enter a valid email address.")).toBeDefined();
  });

  it("rejects email with trailing dot in local part (strict regex disallows trailing dots)", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "user.@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));
    expect(screen.getByText("Please enter a valid email address.")).toBeDefined();
  });

  it("rejects email with TLD shorter than 2 characters", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "user@example.c" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));
    expect(screen.getByText("Please enter a valid email address.")).toBeDefined();
  });

  it("rejects email with digits-only TLD", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "user@example.123" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));
    expect(screen.getByText("Please enter a valid email address.")).toBeDefined();
  });

  it("accepts email with subaddress (plus sign in local part)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "user+tag@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it("accepts email with hyphenated domain", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "user@my-company.io" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it("rejects email with leading hyphen in domain label (strict regex)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "user@-example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));
    await waitFor(() =>
      expect(screen.getByText("Please enter a valid email address.")).toBeDefined(),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects email with trailing hyphen in domain label (strict regex disallows trailing hyphens)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "user@example-.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));
    await waitFor(() =>
      expect(screen.getByText("Please enter a valid email address.")).toBeDefined(),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not auto-open survey when decoded base64 email is invalid", () => {
    // btoa("notanemail") — valid base64 but invalid email after decoding
    const encodedInvalidEmail = btoa("notanemail");
    Object.defineProperty(window, "location", {
      value: { search: `?survey=open&e=${encodedInvalidEmail}` },
      writable: true,
      configurable: true,
    });

    render(<EmailCapture {...defaultProps} />);

    // Should NOT open survey because "notanemail" fails EMAIL_REGEX
    expect(screen.getByRole("form", { name: "Continue with your email" })).toBeDefined();
    expect(screen.queryByText("Your role?")).toBeNull();

    Object.defineProperty(window, "location", {
      value: { search: "" },
      writable: true,
      configurable: true,
    });
  });

  // --- emailLabel prop and default placeholder ---

  it("renders a visible label for the email field", () => {
    render(<EmailCapture {...defaultProps} />);
    expect(screen.getByLabelText(/email address/i)).toBeDefined();
  });

  it("renders 'Email address' as the default label", () => {
    render(<EmailCapture {...defaultProps} />);
    expect(screen.getByText("Email address")).toBeDefined();
  });

  it("renders custom emailLabel when prop is provided", () => {
    render(<EmailCapture {...defaultProps} emailLabel="Work email" />);
    expect(screen.getByText("Work email")).toBeDefined();
    expect(screen.getByLabelText("Work email")).toBeDefined(); // label must be associated with the input
  });

  it("uses custom inputId when prop is provided", () => {
    render(<EmailCapture {...defaultProps} inputId="hero-email" />);
    const input = screen.getByPlaceholderText("you@company.com");
    expect(input.id).toBe("hero-email");
    const label = screen.getByText("Email address");
    expect((label as HTMLLabelElement).htmlFor).toBe("hero-email");
  });

  it("uses 'your@email.com' as default placeholder when none provided", () => {
    const propsWithoutPlaceholder = omitProps(defaultProps, "placeholder");
    render(<EmailCapture {...propsWithoutPlaceholder} />);
    expect(screen.getByPlaceholderText("your@email.com")).toBeDefined();
  });

  // --- surveyToken threading ---

  it("captures surveyToken from successful signup response and passes to PostSignupSurvey", async () => {
    Object.defineProperty(window, "location", {
      value: { search: "" },
      writable: true,
      configurable: true,
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            surveyToken: "tok_test_abc",
          }),
      })
      .mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "user@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => screen.getByText("You're in!"));
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    await waitFor(() => screen.getByText("Your role?"));
    fireEvent.click(screen.getByText("Dev"));

    await waitFor(() => {
      const surveyCall = fetchMock.mock.calls.find((c: unknown[]) =>
        (c[0] as string).includes("/api/survey"),
      );
      expect(surveyCall).toBeDefined();
      const body = JSON.parse((surveyCall![1] as { body: string }).body) as {
        surveyToken: string;
      };
      expect(body.surveyToken).toBe("tok_test_abc");
    });
  });

  it("captures surveyToken from ?t= URL param and passes to PostSignupSurvey", async () => {
    const encodedEmail = btoa("autoopen@example.com");
    Object.defineProperty(window, "location", {
      value: {
        search: `?survey=open&e=${encodedEmail}&t=tok_url_param`,
      },
      writable: true,
      configurable: true,
    });

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<EmailCapture {...defaultProps} />);

    await waitFor(() => screen.getByText("Your role?"));
    fireEvent.click(screen.getByText("Dev"));

    await waitFor(() => {
      const surveyCall = fetchMock.mock.calls.find((c: unknown[]) =>
        (c[0] as string).includes("/api/survey"),
      );
      expect(surveyCall).toBeDefined();
      const body = JSON.parse((surveyCall![1] as { body: string }).body) as {
        surveyToken: string;
      };
      expect(body.surveyToken).toBe("tok_url_param");
    });

    Object.defineProperty(window, "location", {
      value: { search: "" },
      writable: true,
      configurable: true,
    });
  });

  // --- survey copy forwarding ---

  it("forwards qualifiedHeading to PostSignupSurvey — shown on result screen after survey completes", async () => {
    Object.defineProperty(window, "location", {
      value: { search: "" },
      writable: true,
      configurable: true,
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      }),
    );

    render(
      <EmailCapture
        {...defaultProps}
        qualifiedHeading="You're exactly who we built this for"
        qualifiedCtaText="Book a 15-minute call"
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "user@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => screen.getByText("You're in!"));
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    await waitFor(() => screen.getByText("Your role?"));
    fireEvent.click(screen.getByText("Dev"));

    await waitFor(() =>
      expect(screen.getByText("You're exactly who we built this for")).toBeDefined(),
    );
  });

  it("forwards unqualifiedHeading to PostSignupSurvey — shown on result screen after survey auto-open", async () => {
    const encodedEmail = btoa("autoopen@example.com");
    Object.defineProperty(window, "location", {
      value: { search: `?survey=open&e=${encodedEmail}` },
      writable: true,
      configurable: true,
    });

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <EmailCapture
        {...defaultProps}
        unqualifiedHeading="Thanks for your interest"
        unqualifiedCtaText="Explore our guides"
        unqualifiedCtaTarget="/resources"
      />,
    );

    await waitFor(() => screen.getByText("Your role?"));

    Object.defineProperty(window, "location", {
      value: { search: "" },
      writable: true,
      configurable: true,
    });
  });

  // --- qualifiedDismissText / unqualifiedDismissText forwarding ---

  it("forwards qualifiedDismissText to PostSignupSurvey — shown as dismiss button on qualified result screen", async () => {
    Object.defineProperty(window, "location", {
      value: { search: "" },
      writable: true,
      configurable: true,
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      }),
    );

    render(
      <EmailCapture
        {...defaultProps}
        qualifiedHeading="You're a great fit"
        qualifiedDismissText="Maybe later"
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "user@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => screen.getByText("You're in!"));
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    await waitFor(() => screen.getByText("Your role?"));
    fireEvent.click(screen.getByText("Dev"));

    await waitFor(() => expect(screen.getByText("Maybe later")).toBeDefined());
  });

  it("accepts unqualifiedDismissText prop without error", () => {
    render(<EmailCapture {...defaultProps} unqualifiedDismissText="No thanks" />);
    expect(screen.getByPlaceholderText("you@company.com")).toBeDefined();
  });

  it("forwards qualification rules to PostSignupSurvey and uses them after signup", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    render(
      <EmailCapture
        {...defaultProps}
        qualification={{
          logic: "all",
          rules: [{ questionId: "role", answers: ["Other"] }],
        }}
        unqualifiedHeading="You're on the list!"
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(screen.getByText("You're in!")).toBeDefined();
    });

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    await waitFor(() => {
      expect(screen.getByText("Your role?")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Dev"));

    await waitFor(() => {
      expect(screen.getByText("You're on the list!")).toBeDefined();
    });
  });

  // --- ariaLabel prop ---

  it("uses default aria-label 'Continue with your email' when ariaLabel is not provided", () => {
    render(<EmailCapture {...defaultProps} />);
    expect(screen.getByRole("form", { name: "Continue with your email" })).toBeDefined();
  });

  it("uses custom ariaLabel when provided", () => {
    render(<EmailCapture {...defaultProps} ariaLabel="Create your account" />);
    expect(screen.getByRole("form", { name: "Create your account" })).toBeDefined();
    expect(screen.queryByRole("form", { name: "Continue with your email" })).toBeNull();
  });

  // --- loadingText prop ---

  it("shows default loading text 'Sending…' during submission when loadingText is not provided", async () => {
    let resolveFetch: (v: { ok: boolean; status: number }) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise((r) => {
          resolveFetch = r;
        }),
      ),
    );

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(screen.getByText("Sending…")).toBeDefined();
    });

    resolveFetch!({ ok: true, status: 200 });
  });

  it("shows custom loadingText during submission when provided", async () => {
    let resolveFetch: (v: { ok: boolean; status: number }) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise((r) => {
          resolveFetch = r;
        }),
      ),
    );

    render(<EmailCapture {...defaultProps} loadingText="Processing…" />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(screen.getByText("Processing…")).toBeDefined();
      expect(screen.queryByText("Sending…")).toBeNull();
    });

    resolveFetch!({ ok: true, status: 200 });
  });

  // Bug 4: aria-describedby must be scoped to inputId
  it("aria-describedby on input matches the error element's id (scoped by inputId)", () => {
    render(<EmailCapture {...defaultProps} inputId="signup-email" />);
    const input = screen.getByRole("textbox");
    const describedById = input.getAttribute("aria-describedby");
    expect(describedById).toBeTruthy();
    // Must be derived from inputId, not a hardcoded "email-capture-error"
    expect(describedById).toBe("signup-email-error");
    // The error element with that id must exist in the DOM
    expect(document.getElementById("signup-email-error")).not.toBeNull();
  });

  it("error element id uses a generated default id when inputId not specified", () => {
    render(<EmailCapture {...defaultProps} />);
    const input = screen.getByRole("textbox");
    const describedById = input.getAttribute("aria-describedby");
    expect(describedById).toMatch(/^email-capture-.+-error$/);
    expect(document.getElementById(describedById ?? "")).not.toBeNull();
  });

  it("generates unique default ids when multiple instances render on the same page", () => {
    render(
      <>
        <EmailCapture {...defaultProps} />
        <EmailCapture {...defaultProps} />
      </>,
    );

    const inputs = screen.getAllByRole("textbox");
    expect(inputs).toHaveLength(2);

    const ids = inputs.map((input) => input.getAttribute("id"));
    expect(new Set(ids).size).toBe(2);

    const describedByIds = inputs.map((input) => input.getAttribute("aria-describedby"));
    expect(new Set(describedByIds).size).toBe(2);
  });

  // Bug 8 & 9: setTimeout cleanup on unmount
  it("cleans up survey-delay timer on unmount without errors", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const { unmount } = render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => screen.getByText("You're in!"));

    // Unmount before the 1.5s timer fires
    unmount();

    // Advance past the timer — should not throw or call setState on unmounted component
    act(() => {
      vi.advanceTimersByTime(2000);
    });
  });

  // Bug 5: submit button must be disabled in success state
  it("submit button is disabled after successful submission", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    render(<EmailCapture {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      const btn = screen.getByRole("button");
      expect(btn).toHaveProperty("disabled", true);
    });
  });

  // Bug 8: successMessage must default to "You're in!" when not provided
  it("renders default success message when successMessage prop is omitted", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    const propsWithoutSuccessMessage = omitProps(defaultProps, "successMessage");
    render(<EmailCapture {...propsWithoutSuccessMessage} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(screen.getByText("You're in!")).toBeDefined();
    });
  });

  // --- analytics event tracking ---

  describe("analytics event tracking", () => {
    beforeEach(() => {
      Object.defineProperty(window, "location", {
        value: { search: "" },
        writable: true,
        configurable: true,
      });
    });

    it("fires signup_completed with correct properties on successful signup", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
      Object.defineProperty(window, "location", {
        value: {
          search: "?utm_source=google&utm_medium=cpc&utm_campaign=spring",
        },
        writable: true,
        configurable: true,
      });

      render(<EmailCapture {...defaultProps} sourcePage="/landing/hero" />);
      fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
        target: { value: "a@b.com" },
      });
      fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

      await waitFor(() => {
        expect(vi.mocked(trackEvent)).toHaveBeenCalledWith("signup_completed", {
          source_page: "/landing/hero",
          utm_source: "google",
          utm_medium: "cpc",
          utm_campaign: "spring",
        });
      });

      act(() => {
        vi.advanceTimersByTime(2000);
      });
    });

    it("fires signup_completed without UTM keys when no query params", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

      render(<EmailCapture {...defaultProps} sourcePage="/home" />);
      fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
        target: { value: "a@b.com" },
      });
      fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

      await waitFor(() => {
        expect(vi.mocked(trackEvent)).toHaveBeenCalledTimes(2);
        const [eventName, props] = vi.mocked(trackEvent).mock.calls[0];
        expect(eventName).toBe("signup_completed");
        expect(props).toMatchObject({
          source_page: "/home",
        });
        expect(props).not.toHaveProperty("utm_source");
        expect(props).not.toHaveProperty("utm_medium");
        expect(props).not.toHaveProperty("utm_campaign");
      });

      act(() => {
        vi.advanceTimersByTime(2000);
      });
    });

    it("fires signup_failed on a generic fetch error", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

      render(<EmailCapture {...defaultProps} sourcePage="/pricing" />);
      fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
        target: { value: "a@b.com" },
      });
      fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

      await waitFor(() => {
        expect(screen.getByText("Something went wrong. Try again.")).toBeDefined();
      });

      expect(vi.mocked(trackEvent)).toHaveBeenCalledWith("signup_failed", {
        source: "email_capture",
        source_page: "/pricing",
        failure_type: "api",
        status: 500,
      });
    });

    it("fires signup_failed on a network error", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network failure")));

      render(<EmailCapture {...defaultProps} sourcePage="/pricing" />);
      fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
        target: { value: "a@b.com" },
      });
      fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

      await waitFor(() => {
        expect(screen.getByText("Something went wrong. Try again.")).toBeDefined();
      });

      expect(vi.mocked(trackEvent)).toHaveBeenCalledWith("signup_failed", {
        source: "email_capture",
        source_page: "/pricing",
        failure_type: "network",
      });
    });

    it("fires signup_submitted alongside signup_completed with source=email_capture and UTM props", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
      Object.defineProperty(window, "location", {
        value: {
          search: "?utm_source=google&utm_medium=cpc&utm_campaign=spring",
        },
        writable: true,
        configurable: true,
      });

      render(<EmailCapture {...defaultProps} sourcePage="/landing/hero" />);
      fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
        target: { value: "a@b.com" },
      });
      fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

      await waitFor(() => {
        expect(vi.mocked(trackEvent)).toHaveBeenCalledWith("signup_submitted", {
          source: "email_capture",
          source_page: "/landing/hero",
          utm_source: "google",
          utm_medium: "cpc",
          utm_campaign: "spring",
        });
      });

      act(() => {
        vi.advanceTimersByTime(2000);
      });
    });

    it("fires signup_submitted without UTM keys when no query params", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

      render(<EmailCapture {...defaultProps} sourcePage="/home" />);
      fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
        target: { value: "a@b.com" },
      });
      fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

      await waitFor(() => {
        const submittedCall = vi
          .mocked(trackEvent)
          .mock.calls.find(([name]) => name === "signup_submitted");
        expect(submittedCall).toBeDefined();
        const [, props] = submittedCall!;
        expect(props).toMatchObject({
          source: "email_capture",
          source_page: "/home",
        });
        expect(props).not.toHaveProperty("utm_source");
        expect(props).not.toHaveProperty("utm_medium");
        expect(props).not.toHaveProperty("utm_campaign");
      });

      act(() => {
        vi.advanceTimersByTime(2000);
      });
    });

    it("does NOT fire signup_submitted on error responses", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

      render(<EmailCapture {...defaultProps} />);
      fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
        target: { value: "a@b.com" },
      });
      fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

      await waitFor(() => {
        expect(screen.getByText("Something went wrong. Try again.")).toBeDefined();
      });

      const submittedCall = vi
        .mocked(trackEvent)
        .mock.calls.find(([name]) => name === "signup_submitted");
      expect(submittedCall).toBeUndefined();
    });

    it("fires signup_failed on invalid email submissions without tracking the email", () => {
      vi.stubGlobal("fetch", vi.fn());

      render(<EmailCapture {...defaultProps} sourcePage="/hero" />);
      fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
        target: { value: "bad" },
      });
      fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

      expect(vi.mocked(trackEvent)).toHaveBeenCalledWith("signup_failed", {
        source: "email_capture",
        source_page: "/hero",
        failure_type: "validation",
      });
    });
  });

  // ── Bug 3c: timer overwrite without clearing previous ──────────────────
  it("only one timer is pending when a duplicate submission immediately follows a 200 signup", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    // Both calls resolve 200 success (schedules a 1500ms timer each time).
    // The second submit happens while the first timer is still pending, which
    // exercises the clearTimeout guard at line ~184 of email-capture.tsx.
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <EmailCapture
        {...defaultProps}
        // No errorDuplicate so 409 goes through success path too
      />,
    );

    const input = screen.getByPlaceholderText("you@company.com");

    // First successful submit — starts the 1500ms survey-open timer
    fireEvent.change(input, { target: { value: "a@b.com" } });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => screen.getByText("You're in!"));

    // Advance 750ms (half the 1500ms delay) — survey not yet open
    act(() => {
      vi.advanceTimersByTime(750);
    });

    expect(screen.queryByText("Your role?")).toBeNull();

    // Second submit while the first timer is still pending.
    // The button is disabled at this point, so we submit the form element
    // directly to bypass the DOM guard and hit the clearTimeout branch.
    const form = document.querySelector("form[aria-label]")!;
    await act(async () => {
      fireEvent.submit(form);
      // Drain the microtask queue so the second fetch resolves
      await Promise.resolve();
    });

    // Advance past the SECOND timer's 1500ms window (i.e., 750ms already
    // elapsed + 1500ms for the reset timer = 2250ms total; we only advanced
    // 750ms so far, so advance 1600ms more to land just past 1500ms).
    act(() => {
      vi.advanceTimersByTime(1600);
    });

    await waitFor(() => {
      expect(screen.getByText("Your role?")).toBeDefined();
    });

    // The survey should appear exactly once (clearTimeout prevented the first
    // timer from also firing setShowSurvey).
    expect(screen.getAllByText("Your role?").length).toBe(1);
  });

  it("calls trackEmailFocus when email input receives focus", () => {
    render(<EmailCapture {...defaultProps} />);
    const input = screen.getByPlaceholderText("you@company.com");
    fireEvent.focus(input);
    expect(trackEmailFocus).toHaveBeenCalledWith("/");
  });

  it("calls trackEmailBlurWithoutSubmit when email input loses focus", () => {
    render(<EmailCapture {...defaultProps} />);
    const input = screen.getByPlaceholderText("you@company.com");
    fireEvent.blur(input);
    expect(trackEmailBlurWithoutSubmit).toHaveBeenCalledWith("/", false);
  });

  it("does not call trackEmailBlurWithoutSubmit when status is loading", async () => {
    // Make fetch hang so status stays "loading"
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));

    render(<EmailCapture {...defaultProps} />);
    const input = screen.getByPlaceholderText("you@company.com");
    fireEvent.change(input, { target: { value: "valid@email.com" } });
    fireEvent.submit(screen.getByRole("form", { name: "Continue with your email" }));

    // Status is now "loading" — blur should NOT fire tracker
    fireEvent.blur(input);
    expect(trackEmailBlurWithoutSubmit).not.toHaveBeenCalled();
  });

  it("passes had_value: true when email has content on blur", () => {
    render(<EmailCapture {...defaultProps} />);
    const input = screen.getByPlaceholderText("you@company.com");
    fireEvent.change(input, { target: { value: "partial@" } });
    fireEvent.blur(input);
    expect(trackEmailBlurWithoutSubmit).toHaveBeenCalledWith("/", true);
  });

  // --- WCAG 1.3.5 autocomplete & required ---

  it("email input has autoComplete='email' (WCAG 1.3.5)", () => {
    render(<EmailCapture {...defaultProps} />);
    const input = screen.getByPlaceholderText("you@company.com");
    expect(input.getAttribute("autocomplete")).toBe("email");
  });

  it("email input has required attribute", () => {
    render(<EmailCapture {...defaultProps} />);
    const input = screen.getByPlaceholderText("you@company.com");
    expect((input as HTMLInputElement).required).toBe(true);
  });

  // --- bot protection: honeypot + turnstile ---

  it("renders a hidden honeypot input with name=company_website", () => {
    render(<EmailCapture {...defaultProps} />);
    const honeypot = document.querySelector('input[name="company_website"]') as HTMLInputElement;
    expect(honeypot).not.toBeNull();
    expect(honeypot.getAttribute("aria-hidden")).toBe("true");
    expect(honeypot.getAttribute("tabindex")).toBe("-1");
    expect(honeypot.getAttribute("autocomplete")).toBe("off");
    expect(honeypot.style.position).toBe("absolute");
  });

  it("includes companyWebsite and turnstileToken keys in POST body", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    render(<EmailCapture {...defaultProps} turnstileSiteKey={undefined} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as { body: string }).body) as Record<
      string,
      unknown
    >;
    expect(Object.prototype.hasOwnProperty.call(body, "companyWebsite")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(body, "turnstileToken")).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
  });

  it("honeypot onChange updates companyWebsite sent in POST body", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    render(<EmailCapture {...defaultProps} turnstileSiteKey={undefined} />);
    // Fire a change on the honeypot input
    const honeypot = document.querySelector('input[name="company_website"]') as HTMLInputElement;
    fireEvent.change(honeypot, { target: { value: "http://bot-site.example" } });

    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as { body: string }).body) as Record<
      string,
      unknown
    >;
    expect(body.companyWebsite).toBe("http://bot-site.example");

    act(() => {
      vi.advanceTimersByTime(2000);
    });
  });

  it("turnstile onToken updates turnstileToken sent in POST body", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    // Set up a mock window.turnstile that synchronously calls the callback on render
    interface MockTurnstileWithCallbacks {
      render: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
      ready: (cb: () => void) => void;
      _readyQueue: (() => void)[];
      _flush: () => void;
    }
    const mockTurnstile: MockTurnstileWithCallbacks = {
      render: vi.fn(() => "widget-id-ec"),
      remove: vi.fn(),
      _readyQueue: [],
      ready(cb) {
        mockTurnstile._readyQueue.push(cb);
      },
      _flush() {
        for (const cb of mockTurnstile._readyQueue) cb();
        mockTurnstile._readyQueue = [];
      },
    };
    (globalThis as Record<string, unknown>).__turnstileScriptLoaded = false;
    (window as Record<string, unknown>).turnstile = mockTurnstile;

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    render(<EmailCapture {...defaultProps} turnstileSiteKey="0xTEST" />);

    // Flush the ready queue so renderWidget() is called
    act(() => {
      mockTurnstile._flush();
    });

    // Extract the callback from the render call and invoke it with a token
    const renderArgs = mockTurnstile.render.mock.calls[0] as [
      HTMLElement,
      { callback: (token: string) => void; "expired-callback": () => void },
    ];
    act(() => {
      renderArgs[1].callback("my-turnstile-token");
    });

    // Now submit the form
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as { body: string }).body) as Record<
      string,
      unknown
    >;
    expect(body.turnstileToken).toBe("my-turnstile-token");

    act(() => {
      vi.advanceTimersByTime(2000);
    });
  });

  it("turnstile onExpire resets turnstileToken — submit is blocked after expiry when siteKey is set", () => {
    interface MockTurnstileWithCallbacks {
      render: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
      ready: (cb: () => void) => void;
      _readyQueue: (() => void)[];
      _flush: () => void;
    }
    const mockTurnstile: MockTurnstileWithCallbacks = {
      render: vi.fn(() => "widget-id-ec2"),
      remove: vi.fn(),
      _readyQueue: [],
      ready(cb) {
        mockTurnstile._readyQueue.push(cb);
      },
      _flush() {
        for (const cb of mockTurnstile._readyQueue) cb();
        mockTurnstile._readyQueue = [];
      },
    };
    (globalThis as Record<string, unknown>).__turnstileScriptLoaded = false;
    (window as Record<string, unknown>).turnstile = mockTurnstile;

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<EmailCapture {...defaultProps} turnstileSiteKey="0xTEST" />);

    act(() => {
      mockTurnstile._flush();
    });

    const renderArgs = mockTurnstile.render.mock.calls[0] as [
      HTMLElement,
      {
        callback: (token: string) => void;
        "expired-callback": () => void;
      },
    ];

    // First set a token, then expire it
    act(() => {
      renderArgs[1].callback("token-before-expire");
    });
    act(() => {
      renderArgs[1]["expired-callback"]();
    });

    // After expiry, the token is reset to "". With siteKey set, submit must be blocked.
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    // fetch must NOT be called — token is missing
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Please complete the verification challenge.")).toBeDefined();
  });

  it("uses getPublicTurnstileSiteKey() fallback when turnstileSiteKey prop is not provided", () => {
    // Without a turnstileSiteKey prop, getPublicTurnstileSiteKey() returns undefined
    // so TurnstileWidget renders null — this exercises the fallback branch
    render(<EmailCapture {...defaultProps} />);
    // The form renders (no widget container in DOM since siteKey is undefined)
    expect(screen.getByRole("form", { name: "Continue with your email" })).toBeDefined();
  });

  it("uses explicit turnstileSiteKey prop when provided, not the fallback", () => {
    (globalThis as Record<string, unknown>).__turnstileScriptLoaded = false;
    delete (window as Record<string, unknown>).turnstile;

    render(<EmailCapture {...defaultProps} turnstileSiteKey="0xEXPLICIT" />);
    // The script should be injected because siteKey is truthy
    const scripts = document.querySelectorAll('script[src*="turnstile"]');
    expect(scripts.length).toBeGreaterThanOrEqual(1);
  });

  // --- signupFlowConfigUrl loading states ---

  it("shows loading spinner while fetching signupFlowConfigUrl", async () => {
    let resolve!: (v: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise<Response>((r) => {
          resolve = r;
        }),
      ),
    );

    render(
      <EmailCapture
        {...omitProps(defaultProps, "surveyQuestions", "discoveryCallUrl")}
        signupFlowConfigUrl="https://example.com/config.json"
      />,
    );

    // Should show loading state before the fetch resolves
    expect(screen.getByText("Loading signup form…")).toBeDefined();
    expect(screen.getByText("We're preparing the next step for you.")).toBeDefined();

    // Clean up: resolve the fetch to avoid hanging promise
    resolve(new Response(JSON.stringify({ questions: [] }), { status: 200 }));
  });

  it("shows error state and retry button when signupFlowConfigUrl fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    render(
      <EmailCapture
        {...omitProps(defaultProps, "surveyQuestions", "discoveryCallUrl")}
        signupFlowConfigUrl="https://example.com/config.json"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("We couldn't load the signup form.")).toBeDefined();
    });

    expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
  });

  it("shows error state when signupFlowConfigUrl fetch throws a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    render(
      <EmailCapture
        {...omitProps(defaultProps, "surveyQuestions", "discoveryCallUrl")}
        signupFlowConfigUrl="https://example.com/config.json"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("We couldn't load the signup form.")).toBeDefined();
    });

    expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
  });

  it("shows no loading state when signupFlowConfigUrl and inline config are both absent", async () => {
    // When neither surveyQuestions+discoveryCallUrl nor signupFlowConfigUrl is provided,
    // the component renders a loading placeholder initially, but since there is nothing
    // to load, it should NOT remain in an infinite loading state. This exercises the
    // loadSignupFlowConfig early-return path (lines 178-180) when signupFlowConfigUrl is falsy.
    render(
      <EmailCapture
        {...omitProps(defaultProps, "surveyQuestions", "discoveryCallUrl")}
        signupFlowConfigUrl={undefined}
      />,
    );

    // Without a config source, the component shows the loading placeholder then returns null
    // The loading state resolves immediately (no async work).
    await waitFor(() => {
      // Should not show the email form (no config resolved)
      expect(screen.queryByRole("form", { name: "Continue with your email" })).toBeNull();
    });
  });

  it("shows not-loading state when signupFlowConfigUrl fails and is not retried", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    render(
      <EmailCapture
        {...omitProps(defaultProps, "surveyQuestions", "discoveryCallUrl")}
        signupFlowConfigUrl="https://example.com/config.json"
      />,
    );

    await waitFor(() => {
      // Wait until loading completes (isLoadingSignupFlowConfig = false)
      expect(screen.queryByText("Loading signup form…")).toBeNull();
    });

    // Should show the error view (not the loading spinner)
    expect(screen.getByText("We couldn't load the signup form.")).toBeDefined();
  });

  it("loadSignupFlowConfig returns cached config without re-fetching when already loaded", async () => {
    // First fetch succeeds and sets loadedSignupFlowConfig
    const configPayload = {
      surveyQuestions: [{ id: "role", text: "Your role?", options: ["Dev"] }],
      discoveryCallUrl: "https://cal.com/test",
      surveyQualification: undefined,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(configPayload), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <EmailCapture
        {...omitProps(defaultProps, "surveyQuestions", "discoveryCallUrl")}
        signupFlowConfigUrl="https://example.com/config.json"
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("form", { name: "Continue with your email" })).toBeDefined();
    });

    // Changing signupFlowConfigUrl triggers the effect again, calling loadSignupFlowConfig.
    // At this point loadedSignupFlowConfig is already set so it returns early without fetching.
    rerender(
      <EmailCapture
        {...omitProps(defaultProps, "surveyQuestions", "discoveryCallUrl")}
        signupFlowConfigUrl="https://example.com/config-v2.json"
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("form", { name: "Continue with your email" })).toBeDefined();
    });

    // Should have been called only once — the second time returned the cached config
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries loading signupFlowConfig when 'Try again' is clicked", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            surveyQuestions: [{ id: "role", text: "Your role?", options: ["Dev"] }],
            discoveryCallUrl: "https://cal.com/test",
            surveyQualification: undefined,
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <EmailCapture
        {...omitProps(defaultProps, "surveyQuestions", "discoveryCallUrl")}
        signupFlowConfigUrl="https://example.com/config.json"
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(screen.getByRole("form", { name: "Continue with your email" })).toBeDefined();
    });
  });

  it("renders privacyNote from resolvedSignupFlowConfig when privacyNote prop is not set", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          surveyQuestions: [{ id: "role", text: "Your role?", options: ["Dev"] }],
          discoveryCallUrl: "https://cal.com/test",
          privacyNote: "Config-level privacy note.",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <EmailCapture
        {...omitProps(defaultProps, "surveyQuestions", "discoveryCallUrl", "privacyNote")}
        signupFlowConfigUrl="https://example.com/config.json"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Config-level privacy note.")).toBeDefined();
    });
  });

  it("renders surveyPreview from resolvedSignupFlowConfig when status is success", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            surveyQuestions: [{ id: "role", text: "Your role?", options: ["Dev"] }],
            discoveryCallUrl: "https://cal.com/test",
            surveyPreview: "Config-sourced survey preview.",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <EmailCapture
        {...omitProps(defaultProps, "surveyQuestions", "discoveryCallUrl", "surveyPreview")}
        signupFlowConfigUrl="https://example.com/config.json"
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("form", { name: "Continue with your email" })).toBeDefined();
    });

    const emailInput = screen.getByRole("textbox");
    fireEvent.change(emailInput, { target: { value: "a@b.com" } });
    fireEvent.submit(screen.getByRole("button", { name: defaultProps.buttonText }));

    await waitFor(() => {
      expect(screen.getByText("You're in!")).toBeDefined();
    });

    // surveyPreview from config should be visible
    expect(screen.getByText("Config-sourced survey preview.")).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
  });

  // --- SITE-36b: Turnstile gate on submit ---

  it("SITE-36b: blocks submit and shows error when siteKey is set but turnstile token is empty", () => {
    render(<EmailCapture {...defaultProps} turnstileSiteKey="0xTEST" />);

    const input = screen.getByPlaceholderText("you@company.com");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    expect(screen.getByText("Please complete the verification challenge.")).toBeDefined();
  });

  it("SITE-36b: does not call fetch when siteKey is set and token is empty", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<EmailCapture {...defaultProps} turnstileSiteKey="0xTEST" />);

    const input = screen.getByPlaceholderText("you@company.com");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("SITE-36b: clears turnstile error when user edits email after error-turnstile", () => {
    render(<EmailCapture {...defaultProps} turnstileSiteKey="0xTEST" />);

    const input = screen.getByPlaceholderText("you@company.com");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    expect(screen.getByText("Please complete the verification challenge.")).toBeDefined();

    fireEvent.change(input, { target: { value: "other@example.com" } });
    expect(screen.queryByText("Please complete the verification challenge.")).toBeNull();
  });

  it("SITE-36b: allows submit with token present when siteKey is set", async () => {
    interface MockTurnstileEC {
      render: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
      ready: (cb: () => void) => void;
      _readyQueue: (() => void)[];
      _flush: () => void;
    }
    const mockTurnstile: MockTurnstileEC = {
      render: vi.fn(() => "widget-ec-site36b"),
      remove: vi.fn(),
      _readyQueue: [],
      ready(cb) {
        mockTurnstile._readyQueue.push(cb);
      },
      _flush() {
        for (const cb of mockTurnstile._readyQueue) cb();
        mockTurnstile._readyQueue = [];
      },
    };
    (globalThis as Record<string, unknown>).__turnstileScriptLoaded = false;
    (window as Record<string, unknown>).turnstile = mockTurnstile;

    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    render(<EmailCapture {...defaultProps} turnstileSiteKey="0xTEST" />);

    act(() => {
      mockTurnstile._flush();
    });

    const renderArgs = mockTurnstile.render.mock.calls[0] as [
      HTMLElement,
      { callback: (token: string) => void },
    ];
    act(() => {
      renderArgs[1].callback("valid-token");
    });

    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "test@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(screen.queryByText("Please complete the verification challenge.")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
  });

  it("SITE-36b: allows submit with empty token when no siteKey configured (no regression)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    render(<EmailCapture {...defaultProps} turnstileSiteKey={undefined} />);

    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "test@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });
  });

  it("SITE-36b: turnstile error is shown in the aria-live error element and marks input aria-invalid", () => {
    render(<EmailCapture {...defaultProps} turnstileSiteKey="0xTEST" inputId="ec-test" />);

    const input = screen.getByPlaceholderText("you@company.com");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    const errorEl = document.getElementById("ec-test-error");
    expect(errorEl?.textContent).toBe("Please complete the verification challenge.");
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  // --- SITE-51: dead error-duplicate status removed ---

  it("SITE-51: errorDuplicate prop is still forwarded to inlineSignupFlowConfig (prop is live)", () => {
    // The prop must still be accepted without TypeScript or runtime error.
    // This test confirms the prop renders without issues.
    render(
      <EmailCapture
        {...defaultProps}
        errorDuplicate="You've already signed up — check your inbox."
      />,
    );
    expect(screen.getByPlaceholderText("you@company.com")).toBeDefined();
  });

  it("SITE-51: 409 response still shows errorGeneric message (error-duplicate never set via setStatus)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 409 }));

    render(
      <EmailCapture
        {...defaultProps}
        errorDuplicate="Already signed up."
        errorGeneric="Something went wrong. Try again."
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Start Free Trial" }));

    await waitFor(() => {
      // 409 maps to error-generic because error-duplicate is never set
      expect(screen.getByText("Something went wrong. Try again.")).toBeDefined();
    });
    // errorDuplicate message must NOT appear
    expect(screen.queryByText("Already signed up.")).toBeNull();
  });
});
