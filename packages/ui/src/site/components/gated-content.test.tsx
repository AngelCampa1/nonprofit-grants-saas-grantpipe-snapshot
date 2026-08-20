import { describe, it, expect, vi, beforeEach, type MockInstance } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { marketingKnowledge } from "@grantpipe/shared/public-kb";

vi.mock("../lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("../lib/sentry-client", () => ({ captureSiteFetchFailure: vi.fn() }));
vi.mock("../lib/exit-popup-utils", () => ({
  isSignedUp: vi.fn(() => false),
  setSignedUp: vi.fn(),
  getLeadMagnetDelivery: vi.fn(() => null),
  setLeadMagnetDelivered: vi.fn(),
}));

import {
  getLeadMagnetDelivery,
  isSignedUp,
  setLeadMagnetDelivered,
  setSignedUp,
} from "../lib/exit-popup-utils";
import { trackEvent } from "../lib/analytics";
import { captureSiteFetchFailure } from "../lib/sentry-client";
import { GatedContent } from "./gated-content";
import { installMockTurnstile } from "./turnstile-test-utils";

const mockGetLeadMagnetDelivery = getLeadMagnetDelivery as unknown as MockInstance;
const mockIsSignedUp = isSignedUp as unknown as MockInstance;
const mockSetLeadMagnetDelivered = setLeadMagnetDelivered as unknown as MockInstance;
const mockSetSignedUp = setSignedUp as unknown as MockInstance;
const mockTrackEvent = trackEvent as unknown as MockInstance;
const mockCaptureSiteFetchFailure = captureSiteFetchFailure as unknown as MockInstance;
const publicEmail = marketingKnowledge.contact.publicEmail;

const defaultProps = {
  apiUrl: "https://api.test",
  leadMagnetTitle: "Free Guide to Testing",
  description: "Get this free guide by entering your email.",
  ctaText: "Get the Free Guide",
  teaserHtml: "<h2>Section 1</h2><p>This is free content.</p>",
  gatedHtml: "<h2>Section 2</h2><p>This is gated content.</p>",
};

function getForm(): HTMLFormElement {
  return screen.getByLabelText("Email address").closest("form")!;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetLeadMagnetDelivery.mockReturnValue(null);
  mockIsSignedUp.mockReturnValue(false);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
  Object.defineProperty(window, "location", {
    value: { search: "" },
    writable: true,
    configurable: true,
  });
  // Reset Turnstile dedup flag and global between tests
  (globalThis as Record<string, unknown>).__turnstileScriptLoaded = false;
  delete (window as Record<string, unknown>).turnstile;
  delete (window as Record<string, unknown>).onloadTurnstileCallback;
  document.querySelectorAll('script[src*="turnstile"]').forEach((el) => el.remove());
});

describe("GatedContent", () => {
  it("resets the initial Turnstile token after an HTTP error and accepts a fresh token", async () => {
    const mockTurnstile = installMockTurnstile();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    render(<GatedContent {...defaultProps} turnstileSiteKey="0xGC" />);
    act(() => mockTurnstile.flush());
    act(() => mockTurnstile.renderOptions[0]?.callback("spent-token"));
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "reader@example.org" },
    });
    fireEvent.submit(getForm());
    await waitFor(() => expect(mockTurnstile.turnstile.reset).toHaveBeenCalledWith("widget-1"));

    fireEvent.submit(getForm());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    act(() => mockTurnstile.renderOptions[0]?.callback("fresh-token"));
    fireEvent.submit(getForm());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1]![1]!.body as string).turnstileToken).toBe(
      "fresh-token",
    );
  });

  it("requires and reacquires a fresh Turnstile token for every resend", async () => {
    const mockTurnstile = installMockTurnstile();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    render(<GatedContent {...defaultProps} magnetSlug="testing-guide" turnstileSiteKey="0xGC" />);
    act(() => mockTurnstile.flush());
    act(() => mockTurnstile.renderOptions[0]?.callback("initial-token"));
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "reader@example.org" },
    });
    fireEvent.submit(getForm());

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Resend the email" })).toBeDefined(),
    );
    await waitFor(() => expect(mockTurnstile.turnstile.ready).toHaveBeenCalledTimes(2));
    act(() => mockTurnstile.flush());
    await waitFor(() => expect(mockTurnstile.turnstile.render).toHaveBeenCalledTimes(2));
    expect(mockTurnstile.renderOptions).toHaveLength(2);
    const resendButton = screen.getByRole("button", { name: "Resend the email" });
    expect(resendButton).toBeDisabled();
    expect(resendButton).toHaveClass("rounded-full");
    act(() => mockTurnstile.renderOptions[1]!.callback("resend-token"));
    fireEvent.click(resendButton);
    await waitFor(() => expect(mockTurnstile.turnstile.reset).toHaveBeenCalledWith("widget-2"));

    const retryButton = await screen.findByRole("button", { name: "Try again" });
    expect(retryButton).toBeDisabled();
    expect(retryButton).toHaveClass("rounded-full");
    act(() => mockTurnstile.renderOptions[1]!.callback("fresh-resend-token"));
    await waitFor(() => expect(retryButton).toBeEnabled());
    fireEvent.click(retryButton);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(JSON.parse(fetchMock.mock.calls[2]![1]!.body as string).turnstileToken).toBe(
      "fresh-resend-token",
    );
  });
  it("renders full content immediately when the current magnet has stored delivery state", () => {
    mockGetLeadMagnetDelivery.mockReturnValue({
      email: "reader@example.com",
    });
    render(<GatedContent {...defaultProps} magnetSlug="testing-guide" />);

    expect(screen.getByText("This is free content.")).toBeDefined();
    expect(screen.getByText("This is gated content.")).toBeDefined();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("unlocks for legacy visitors when only the generic exit-popup signup state exists", () => {
    mockIsSignedUp.mockReturnValue(true);
    render(<GatedContent {...defaultProps} magnetSlug="testing-guide" />);

    expect(screen.getByText("This is free content.")).toBeDefined();
    expect(screen.getByText("This is gated content.")).toBeDefined();
    expect(screen.queryByText("Check your email")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Resend the email" })).toBeNull();
  });

  it("renders only teaser + gate form when isSignedUp() returns false", () => {
    render(<GatedContent {...defaultProps} />);

    expect(screen.getByText("This is free content.")).toBeDefined();
    expect(screen.queryByText("This is gated content.")).toBeNull();
    expect(screen.getByRole("textbox")).toBeDefined();
    expect(screen.getByRole("button", { name: defaultProps.ctaText })).toBeDefined();
    expect(screen.getByText(defaultProps.description)).toBeDefined();
  });

  it("shows email validation error on invalid input", () => {
    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "not-an-email" } });
    fireEvent.submit(getForm());

    expect(screen.getByText("Please enter a valid email address.")).toBeDefined();
    expect(fetch).not.toHaveBeenCalled();
    expect(mockTrackEvent).toHaveBeenCalledWith("gated_content_submission_failed", {
      source_page: "lead-magnet",
      failure_type: "validation",
    });
  });

  it("calls /api/public/leads with correct body on submit", async () => {
    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "https://api.test/api/public/leads",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "test@example.com",
            magnetSlug: undefined,
            sourcePage: "lead-magnet",
            companyWebsite: "",
            turnstileToken: "",
          }),
        }),
      );
    });
  });

  it("includes magnetSlug in POST body when provided", async () => {
    render(<GatedContent {...defaultProps} magnetSlug="my-guide" />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "https://api.test/api/public/leads",
        expect.objectContaining({
          body: JSON.stringify({
            email: "test@example.com",
            magnetSlug: "my-guide",
            sourcePage: "lead-magnet",
            companyWebsite: "",
            turnstileToken: "",
          }),
        }),
      );
    });
  });

  it("includes sourcePage in POST body when sourcePage is a /free/ path", async () => {
    render(<GatedContent {...defaultProps} sourcePage="/free/my-guide" magnetSlug="my-guide" />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "https://api.test/api/public/leads",
        expect.objectContaining({
          body: JSON.stringify({
            email: "test@example.com",
            magnetSlug: "my-guide",
            sourcePage: "/free/my-guide",
            companyWebsite: "",
            turnstileToken: "",
          }),
        }),
      );
    });
  });

  it("reveals full content and stores magnet-specific delivery state on successful response", async () => {
    render(<GatedContent {...defaultProps} magnetSlug="testing-guide" />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(mockSetSignedUp).toHaveBeenCalled();
      expect(mockSetLeadMagnetDelivered).toHaveBeenCalledWith("testing-guide", "test@example.com");
      expect(screen.getByText("This is gated content.")).toBeDefined();
      expect(screen.getByText("Email queued")).toBeDefined();
      expect(screen.queryByText(/We sent your/)).toBeNull();
    });
  });

  it("uses confirmed-sent copy only when the API confirms delivery", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ deliveryState: "sent" }),
      }),
    );
    render(<GatedContent {...defaultProps} magnetSlug="testing-guide" />);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "reader@example.com" },
    });
    fireEvent.submit(getForm());

    expect(await screen.findByText("Check your email")).toBeDefined();
    expect(
      screen.getByText("We sent your Free Guide to Testing to reader@example.com."),
    ).toBeDefined();
  });

  it("shows a suppressed delivery state and keeps content gated when delivery is blocked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, alreadySubscribed: true, deliveryState: "unsubscribed" }),
      }),
    );

    render(<GatedContent {...defaultProps} magnetSlug="testing-guide" />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(screen.getByText("We could not send to this address")).toBeDefined();
    });

    expect(screen.queryByText("This is gated content.")).toBeNull();
    expect(screen.queryByText("Check your email")).toBeNull();
    expect(mockSetSignedUp).not.toHaveBeenCalled();
    expect(mockSetLeadMagnetDelivered).not.toHaveBeenCalled();
    expect(mockTrackEvent).toHaveBeenCalledWith("lead_magnet_delivery_suppressed", {
      source: "gated_content",
      source_page: "lead-magnet",
      magnet_slug: "testing-guide",
      delivery_context: "initial_submit",
    });
    expect(JSON.stringify(mockTrackEvent.mock.calls)).not.toContain("test@example.com");
    expect(JSON.stringify(mockTrackEvent.mock.calls)).not.toContain(defaultProps.leadMagnetTitle);
  });

  it("shows error on non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 409 }));

    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(screen.getByText("Something went wrong. Please try again.")).toBeDefined();
      expect(screen.queryByText("This is gated content.")).toBeNull();
      expect(mockSetSignedUp).not.toHaveBeenCalled();
    });
    expect(mockTrackEvent).toHaveBeenCalledWith("gated_content_submission_failed", {
      source_page: "lead-magnet",
      failure_type: "api_error",
      status: 409,
    });
  });

  it("handles network error with error message", async () => {
    const error = new Error("Network failure");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));

    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(screen.getByText("Something went wrong. Please try again.")).toBeDefined();
      expect(mockCaptureSiteFetchFailure).toHaveBeenCalledWith(error, {
        source: "gated-content",
        status: undefined,
      });
    });
    expect(mockTrackEvent).toHaveBeenCalledWith("gated_content_submission_failed", {
      source_page: "lead-magnet",
      failure_type: "network_error",
    });
  });

  it("handles non-409 error responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(screen.getByText("Something went wrong. Please try again.")).toBeDefined();
    });
    expect(mockCaptureSiteFetchFailure).toHaveBeenCalledWith(null, {
      source: "gated-content",
      status: 500,
    });
  });

  it("tracks lead_magnet_unlocked event on success", async () => {
    render(
      <GatedContent
        {...defaultProps}
        sourcePage="/free/testing-guide"
        magnetSlug="testing-guide"
      />,
    );

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(mockTrackEvent).toHaveBeenCalledWith("lead_magnet_unlocked", {
        slug: "testing-guide",
        source_page: "/free/testing-guide",
      });
    });
    expect(mockTrackEvent).not.toHaveBeenCalledWith(
      "lead_magnet_unlocked",
      expect.objectContaining({ title: expect.any(String) }),
    );
  });

  it("fires signup_submitted alongside lead_magnet_unlocked with source=gated_content", async () => {
    render(
      <GatedContent
        {...defaultProps}
        sourcePage="/free/testing-guide"
        magnetSlug="testing-guide"
      />,
    );

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(mockTrackEvent).toHaveBeenCalledWith("signup_submitted", {
        source: "gated_content",
        source_page: "/free/testing-guide",
        magnet_slug: "testing-guide",
      });
    });
  });

  it("fires signup_submitted with the provided sourcePage when given", async () => {
    render(<GatedContent {...defaultProps} sourcePage="/free/my-guide" />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(mockTrackEvent).toHaveBeenCalledWith("signup_submitted", {
        source: "gated_content",
        source_page: "/free/my-guide",
      });
    });
  });

  it("does NOT fire signup_submitted on error responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(screen.getByText("Something went wrong. Please try again.")).toBeDefined();
    });

    const submittedCall = mockTrackEvent.mock.calls.find(
      (args: unknown[]) => args[0] === "signup_submitted",
    );
    expect(submittedCall).toBeUndefined();
  });

  it("gate form is accessible (labels, aria-invalid, error descriptions)", () => {
    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    expect(input.getAttribute("aria-label")).toBe("Email address");
    expect(input.getAttribute("aria-invalid")).toBe("false");
    expect(input.getAttribute("aria-describedby")).toBe("gated-content-error");

    // Trigger validation error
    fireEvent.change(input, { target: { value: "bad" } });
    fireEvent.submit(getForm());

    expect(input.getAttribute("aria-invalid")).toBe("true");
    const errorEl = document.getElementById("gated-content-error");
    expect(errorEl).not.toBeNull();
    expect(errorEl?.textContent).toBe("Please enter a valid email address.");
  });

  it("renders custom privacy note", () => {
    render(<GatedContent {...defaultProps} privacyNote="Custom privacy text." />);
    expect(screen.getByText("Custom privacy text.")).toBeDefined();
  });

  it("renders default privacy note when none provided", () => {
    render(<GatedContent {...defaultProps} />);
    expect(screen.getByText("Get the resource in your inbox.")).toBeDefined();
  });

  it("disables form during submission", async () => {
    let resolveSubmit!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveSubmit = resolve;
          }),
      ),
    );

    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    const button = screen.getByRole("button", { name: defaultProps.ctaText });

    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    expect(input.hasAttribute("disabled")).toBe(true);
    expect(button.hasAttribute("disabled")).toBe(true);

    resolveSubmit(new Response(null, { status: 200 }));

    await waitFor(() => {
      expect(screen.getByText("This is gated content.")).toBeDefined();
    });
  });

  it("clears error state when user types after validation error", () => {
    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");

    fireEvent.change(input, { target: { value: "bad" } });
    fireEvent.submit(getForm());

    expect(screen.getByText("Please enter a valid email address.")).toBeDefined();

    fireEvent.change(input, { target: { value: "test@example.com" } });

    expect(screen.queryByText("Please enter a valid email address.")).toBeNull();
  });

  // --- WCAG 1.3.5 autocomplete & required ---

  it("email input has autoComplete='email' (WCAG 1.3.5)", () => {
    render(<GatedContent {...defaultProps} />);
    const input = screen.getByLabelText("Email address");
    expect(input.getAttribute("autocomplete")).toBe("email");
  });

  it("email input has required attribute", () => {
    render(<GatedContent {...defaultProps} />);
    const input = screen.getByLabelText("Email address");
    expect((input as HTMLInputElement).required).toBe(true);
  });

  it("shows queued confirmation after successful submit with submitted email", async () => {
    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(screen.getByText("Email queued")).toBeDefined();
      expect(screen.getByText(/test@example\.com/)).toBeDefined();
    });
  });

  it("shows the stored delivery email when the current magnet was already delivered", () => {
    mockGetLeadMagnetDelivery.mockReturnValue({
      email: "reader@example.com",
    });
    render(<GatedContent {...defaultProps} magnetSlug="testing-guide" />);

    expect(screen.getByText("Email queued")).toBeDefined();
    expect(screen.getByText(/reader@example\.com/)).toBeDefined();
  });

  it("does NOT contain a download link after successful submit", async () => {
    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(screen.getByText("This is gated content.")).toBeDefined();
    });

    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows full content (teaser + gated) inline below confirmation panel after unlock", async () => {
    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(screen.getByText("This is free content.")).toBeDefined();
      expect(screen.getByText("This is gated content.")).toBeDefined();
    });
  });

  it("shows spam folder note and sender email in confirmation panel", async () => {
    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(screen.getByText(publicEmail)).toBeDefined();
      expect(screen.getByText(/check spam if you do not see it/i)).toBeDefined();
    });
  });

  // --- ARIA live region ---

  it("confirmation panel has role='status' for screen reader announcements", async () => {
    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeDefined();
    });
  });

  // --- Resend affordance ---

  it("shows resend button after unlock when email was just submitted", async () => {
    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Resend the email" })).toBeDefined();
    });
  });

  it("hides resend button when the current magnet has no stored delivery email", () => {
    mockGetLeadMagnetDelivery.mockReturnValue({ email: "" });
    render(<GatedContent {...defaultProps} magnetSlug="testing-guide" />);

    expect(screen.queryByRole("button", { name: "Resend the email" })).toBeNull();
  });

  it("clicking resend shows queued state until the provider confirms delivery", async () => {
    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Resend the email" })).toBeDefined();
    });

    // Reset fetch mock to track resend call
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    fireEvent.click(screen.getByRole("button", { name: "Resend the email" }));

    await waitFor(() => {
      expect(screen.getByText("Your email is queued.")).toBeDefined();
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.test/api/public/leads",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email: "test@example.com",
          magnetSlug: undefined,
          sourcePage: "lead-magnet",
          resendDelivery: true,
          companyWebsite: "",
          turnstileToken: "",
        }),
      }),
    );
    expect(mockTrackEvent).toHaveBeenCalledWith("gated_content_resend_requested", {
      source_page: "lead-magnet",
    });
    expect(mockTrackEvent).toHaveBeenCalledWith("gated_content_resend_queued", {
      source_page: "lead-magnet",
    });
  });

  it.each([
    ["sent", "Email sent. Check your inbox."],
    ["in_progress", "Your email is queued."],
    ["ambiguous", "We got your request. Delivery may still be in progress."],
    ["resend_unavailable", "We could not send it again. Try another email."],
  ])("shows the %s resend state", async (deliveryState, message) => {
    render(<GatedContent {...defaultProps} />);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "test@example.com" },
    });
    fireEvent.submit(getForm());
    await screen.findByRole("button", { name: "Resend the email" });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ deliveryState }),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Resend the email" }));

    expect(await screen.findByText(message)).toBeDefined();
  });

  it("clicking resend shows error state when API fails", async () => {
    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Resend the email" })).toBeDefined();
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    fireEvent.click(screen.getByRole("button", { name: "Resend the email" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
      expect(screen.getByRole("status").textContent).toContain(`or email ${publicEmail}.`);
    });
    expect(mockCaptureSiteFetchFailure).toHaveBeenCalledWith(null, {
      source: "gated-content-resend",
      status: 500,
    });
    expect(mockTrackEvent).toHaveBeenCalledWith("gated_content_resend_failed", {
      source_page: "lead-magnet",
      failure_type: "api_error",
      status: 500,
    });
  });

  // --- bot protection: honeypot + turnstile ---

  it("renders a hidden honeypot input with name=company_website", () => {
    render(<GatedContent {...defaultProps} />);
    const honeypot = document.querySelector('input[name="company_website"]') as HTMLInputElement;
    expect(honeypot).not.toBeNull();
    expect(honeypot.getAttribute("aria-hidden")).toBe("true");
    expect(honeypot.getAttribute("tabindex")).toBe("-1");
    expect(honeypot.getAttribute("autocomplete")).toBe("off");
    expect(honeypot.style.position).toBe("absolute");
  });

  it("includes companyWebsite and turnstileToken keys in POST body", async () => {
    render(<GatedContent {...defaultProps} turnstileSiteKey={undefined} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls as [string, { body: string }][];
      const body = JSON.parse(calls[0]![1].body) as Record<string, unknown>;
      expect(Object.prototype.hasOwnProperty.call(body, "companyWebsite")).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(body, "turnstileToken")).toBe(true);
    });
  });

  it("honeypot onChange updates companyWebsite in the POST body", async () => {
    render(<GatedContent {...defaultProps} turnstileSiteKey={undefined} />);

    const honeypot = document.querySelector('input[name="company_website"]') as HTMLInputElement;
    fireEvent.change(honeypot, { target: { value: "http://spammer.example" } });

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls as [string, { body: string }][];
      const body = JSON.parse(calls[0]![1].body) as Record<string, unknown>;
      expect(body.companyWebsite).toBe("http://spammer.example");
    });
  });

  it("turnstile onToken updates turnstileToken in the POST body", async () => {
    interface MockTurnstileLocal {
      render: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
      ready: (cb: () => void) => void;
      _readyQueue: (() => void)[];
      _flush: () => void;
    }
    const mockTurnstile: MockTurnstileLocal = {
      render: vi.fn(() => "widget-gc-1"),
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

    render(<GatedContent {...defaultProps} turnstileSiteKey="0xGC" />);

    act(() => {
      mockTurnstile._flush();
    });

    const renderArgs = mockTurnstile.render.mock.calls[0] as [
      HTMLElement,
      { callback: (token: string) => void },
    ];
    act(() => {
      renderArgs[1].callback("gc-token-123");
    });

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls as [string, { body: string }][];
      const body = JSON.parse(calls[0]![1].body) as Record<string, unknown>;
      expect(body.turnstileToken).toBe("gc-token-123");
    });
  });

  it("turnstile onExpire resets turnstileToken — submit is blocked when siteKey is set after expiry", () => {
    interface MockTurnstileLocal {
      render: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
      ready: (cb: () => void) => void;
      _readyQueue: (() => void)[];
      _flush: () => void;
    }
    const mockTurnstile: MockTurnstileLocal = {
      render: vi.fn(() => "widget-gc-2"),
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

    render(<GatedContent {...defaultProps} turnstileSiteKey="0xGC" />);

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
    act(() => {
      renderArgs[1].callback("token-will-expire");
    });
    act(() => {
      renderArgs[1]["expired-callback"]();
    });

    // After expiry, the token is reset to "". With siteKey set, submit must be blocked.
    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    // fetch must NOT be called — token is missing
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByText("Please complete the verification challenge.")).toBeDefined();
  });

  it("uses getPublicTurnstileSiteKey() fallback when turnstileSiteKey prop is omitted", () => {
    // Without a prop, getPublicTurnstileSiteKey() returns undefined → TurnstileWidget renders null
    render(<GatedContent {...defaultProps} />);
    expect(screen.getByLabelText("Email address")).toBeDefined();
  });

  it("uses explicit turnstileSiteKey prop when provided", () => {
    (globalThis as Record<string, unknown>).__turnstileScriptLoaded = false;
    delete (window as Record<string, unknown>).turnstile;

    render(<GatedContent {...defaultProps} turnstileSiteKey="0xEXPLICIT_GC" />);
    const scripts = document.querySelectorAll('script[src*="turnstile"]');
    expect(scripts.length).toBeGreaterThanOrEqual(1);
  });

  // --- SITE-36: Turnstile gate on submit ---

  it("SITE-36: blocks submit and shows error when siteKey is set but turnstile token is empty", () => {
    render(<GatedContent {...defaultProps} turnstileSiteKey="0xTEST" />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByText("Please complete the verification challenge.")).toBeDefined();
  });

  it("SITE-36: turnstile error is shown in the aria-described error element", () => {
    render(<GatedContent {...defaultProps} turnstileSiteKey="0xTEST" />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    const errorEl = document.getElementById("gated-content-error");
    expect(errorEl?.textContent).toBe("Please complete the verification challenge.");
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  it("SITE-36: clears turnstile error when user edits email after error-turnstile", () => {
    render(<GatedContent {...defaultProps} turnstileSiteKey="0xTEST" />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    expect(screen.getByText("Please complete the verification challenge.")).toBeDefined();

    // User edits email — error should clear
    fireEvent.change(input, { target: { value: "other@example.com" } });
    expect(screen.queryByText("Please complete the verification challenge.")).toBeNull();
  });

  it("SITE-36: allows submit when siteKey is set and turnstile token is present", async () => {
    interface MockTurnstileLocal {
      render: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
      ready: (cb: () => void) => void;
      _readyQueue: (() => void)[];
      _flush: () => void;
    }
    const mockTurnstile: MockTurnstileLocal = {
      render: vi.fn(() => "widget-gc-site36"),
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

    render(<GatedContent {...defaultProps} turnstileSiteKey="0xTEST" />);

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

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });
    expect(screen.queryByText("Please complete the verification challenge.")).toBeNull();
  });

  it("SITE-36: allows submit with empty token when no siteKey is configured (no regression)", async () => {
    render(<GatedContent {...defaultProps} turnstileSiteKey={undefined} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });
  });

  // --- SITE-36c: Resend Turnstile gate ---

  it("SITE-36c: resend button is disabled until resend turnstile token is provided when siteKey is set", () => {
    // Use stored delivery to enter unlocked state directly (avoids submit-gate complexity)
    mockGetLeadMagnetDelivery.mockReturnValue({ email: "stored@example.com" });

    render(<GatedContent {...defaultProps} magnetSlug="testing-guide" turnstileSiteKey="0xTEST" />);

    // Should be in unlocked/confirmation view
    expect(screen.getByText("Email queued")).toBeDefined();

    // Resend button should be disabled because no resend token yet
    const resendBtn = screen.getByRole("button", { name: "Resend the email" });
    expect(resendBtn.hasAttribute("disabled")).toBe(true);
  });

  it("SITE-36c: resend token from widget enables the resend button when siteKey is set", () => {
    mockGetLeadMagnetDelivery.mockReturnValue({ email: "stored@example.com" });

    interface MockTurnstileLocal {
      render: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
      ready: (cb: () => void) => void;
      _readyQueue: (() => void)[];
      _flush: () => void;
    }
    const mockTurnstile: MockTurnstileLocal = {
      render: vi.fn(() => "widget-gc-resend"),
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

    render(<GatedContent {...defaultProps} magnetSlug="testing-guide" turnstileSiteKey="0xTEST" />);

    act(() => {
      mockTurnstile._flush();
    });

    // Simulate turnstile solving — provides the resend token
    const renderArgs = mockTurnstile.render.mock.calls[0] as [
      HTMLElement,
      { callback: (token: string) => void },
    ];
    act(() => {
      renderArgs[1].callback("resend-token-123");
    });

    // Resend button should now be enabled
    const resendBtn = screen.getByRole("button", { name: "Resend the email" });
    expect(resendBtn.hasAttribute("disabled")).toBe(false);
  });

  it("SITE-36c: resend with enabled token posts resendTurnstileToken not main token", async () => {
    mockGetLeadMagnetDelivery.mockReturnValue({ email: "stored@example.com" });

    interface MockTurnstileLocal {
      render: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
      ready: (cb: () => void) => void;
      _readyQueue: (() => void)[];
      _flush: () => void;
    }
    const mockTurnstile: MockTurnstileLocal = {
      render: vi.fn(() => "widget-gc-resend-post"),
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

    render(<GatedContent {...defaultProps} magnetSlug="testing-guide" turnstileSiteKey="0xTEST" />);

    act(() => {
      mockTurnstile._flush();
    });

    const renderArgs = mockTurnstile.render.mock.calls[0] as [
      HTMLElement,
      { callback: (token: string) => void },
    ];
    act(() => {
      renderArgs[1].callback("resend-specific-token");
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    fireEvent.click(screen.getByRole("button", { name: "Resend the email" }));

    await waitFor(() => {
      expect(screen.getByText("Your email is queued.")).toBeDefined();
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.test/api/public/leads",
      expect.objectContaining({
        body: JSON.stringify({
          email: "stored@example.com",
          magnetSlug: "testing-guide",
          sourcePage: "lead-magnet",
          resendDelivery: true,
          companyWebsite: "",
          turnstileToken: "resend-specific-token",
        }),
      }),
    );
  });

  it("SITE-36c: handleResend network error path", async () => {
    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Resend the email" })).toBeDefined();
    });

    const networkError = new Error("network error");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(networkError));

    fireEvent.click(screen.getByRole("button", { name: "Resend the email" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
      expect(screen.getByRole("status").textContent).toContain(
        `or email ${marketingKnowledge.contact.publicEmail}.`,
      );
    });
    expect(mockCaptureSiteFetchFailure).toHaveBeenCalledWith(networkError, {
      source: "gated-content-resend",
      status: undefined,
    });
  });

  it("SITE-36c: resend button re-disables when resend turnstile token expires", () => {
    mockGetLeadMagnetDelivery.mockReturnValue({ email: "stored@example.com" });

    interface MockTurnstileLocal {
      render: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
      ready: (cb: () => void) => void;
      _readyQueue: (() => void)[];
      _flush: () => void;
    }
    const mockTurnstile: MockTurnstileLocal = {
      render: vi.fn(() => "widget-gc-expire"),
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

    render(<GatedContent {...defaultProps} magnetSlug="testing-guide" turnstileSiteKey="0xTEST" />);

    act(() => {
      mockTurnstile._flush();
    });

    const renderArgs = mockTurnstile.render.mock.calls[0] as [
      HTMLElement,
      { callback: (token: string) => void; "expired-callback": () => void },
    ];

    // Provide token — button should be enabled
    act(() => {
      renderArgs[1].callback("resend-token");
    });
    expect(screen.getByRole("button", { name: "Resend the email" }).hasAttribute("disabled")).toBe(
      false,
    );

    // Expire token — button should be disabled again
    act(() => {
      renderArgs[1]["expired-callback"]();
    });
    expect(screen.getByRole("button", { name: "Resend the email" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("SITE-36c: resend button works without siteKey (no regression)", async () => {
    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Resend the email" })).toBeDefined();
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const resendBtn = screen.getByRole("button", { name: "Resend the email" });
    // Without siteKey, button should NOT be disabled due to missing token
    expect(resendBtn.hasAttribute("disabled")).toBe(false);

    fireEvent.click(resendBtn);

    await waitFor(() => {
      expect(screen.getByText("Your email is queued.")).toBeDefined();
    });
  });
});
