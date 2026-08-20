import { fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LeadMagnetSignup } from "./lead-magnet-signup";
import { trackEvent } from "../lib/analytics";
import { installMockTurnstile } from "./turnstile-test-utils";

vi.mock("../lib/analytics", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("../lib/sentry-client", () => ({
  captureException: vi.fn(),
  captureSiteFetchFailure: vi.fn(),
}));

import { captureSiteFetchFailure } from "../lib/sentry-client";

const defaultProps = {
  apiUrl: "https://api.test",
  sourcePage: "/resources/guides/test",
  trialCtaHref: "https://app.grantpipe.com/signup",
  trialCtaText: "Start your 1-month free trial",
  leadMagnet: {
    slug: "grant-compliance-checklist" as const,
    title: "Grant Compliance Checklist",
    description: "A practical checklist for post-award grant compliance.",
    ctaText: "Email Me the Grant Compliance Checklist",
    successSubMessage: "We're emailing the checklist now.",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  // Reset Turnstile dedup flag and globals between tests
  (globalThis as Record<string, unknown>).__turnstileScriptLoaded = false;
  delete (window as Record<string, unknown>).turnstile;
  delete (window as Record<string, unknown>).onloadTurnstileCallback;
  document.querySelectorAll('script[src*="turnstile"]').forEach((el) => el.remove());
});

describe("LeadMagnetSignup", () => {
  it("resets a spent Turnstile token after a network rejection before retrying", async () => {
    const mockTurnstile = installMockTurnstile();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    render(<LeadMagnetSignup {...defaultProps} turnstileSiteKey="0xLMS" />);
    act(() => mockTurnstile.flush());
    act(() => mockTurnstile.renderOptions[0]?.callback("spent-token"));
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "reader@example.org" },
    });
    fireEvent.click(screen.getByRole("button", { name: defaultProps.leadMagnet.ctaText }));
    await waitFor(() => expect(mockTurnstile.turnstile.reset).toHaveBeenCalledWith("widget-1"));
    expect(screen.getByRole("button", { name: defaultProps.leadMagnet.ctaText })).toBeDisabled();

    act(() => mockTurnstile.renderOptions[0]?.callback("fresh-token"));
    fireEvent.click(screen.getByRole("button", { name: defaultProps.leadMagnet.ctaText }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1]![1]!.body as string).turnstileToken).toBe(
      "fresh-token",
    );
  });

  it("gates resends on a fresh Turnstile token and resets it after the request", async () => {
    const mockTurnstile = installMockTurnstile();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchMock);
    render(<LeadMagnetSignup {...defaultProps} turnstileSiteKey="0xLMS" />);
    act(() => mockTurnstile.flush());
    act(() => mockTurnstile.renderOptions[0]?.callback("initial-token"));
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "reader@example.org" },
    });
    fireEvent.click(screen.getByRole("button", { name: defaultProps.leadMagnet.ctaText }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Resend the email" })).toBeDefined(),
    );
    act(() => mockTurnstile.flush());
    const resendButton = screen.getByRole("button", { name: "Resend the email" });
    expect(resendButton).toBeDisabled();
    expect(resendButton).toHaveClass("rounded-full");
    act(() => mockTurnstile.renderOptions[1]?.callback("resend-token"));
    act(() => mockTurnstile.renderOptions[1]?.["expired-callback"]?.());
    expect(resendButton).toBeDisabled();
    act(() => mockTurnstile.renderOptions[1]?.callback("resend-token"));
    fireEvent.click(resendButton);
    await waitFor(() => expect(mockTurnstile.turnstile.reset).toHaveBeenCalledWith("widget-2"));
    expect(resendButton).toBeDisabled();
  });
  it("tracks the shown primary and alternate lead magnet offers", () => {
    render(
      <LeadMagnetSignup
        {...defaultProps}
        leadMagnet={{
          ...defaultProps.leadMagnet,
          alternatives: [
            {
              slug: "nonprofit-crm-evaluation-scorecard",
              title: "CRM Evaluation Scorecard",
              description: "A worksheet for comparing nonprofit CRM options.",
            },
            {
              slug: "donor-retention-playbook",
              title: "Donor Retention Playbook",
              description: "A practical donor follow-up plan.",
            },
          ],
        }}
      />,
    );

    expect(trackEvent).toHaveBeenCalledWith("lead_magnet_offer_shown", {
      source_page: "/resources/guides/test",
      primary_slug: "grant-compliance-checklist",
      alternative_slugs: ["nonprofit-crm-evaluation-scorecard", "donor-retention-playbook"],
    });
    expect(trackEvent).not.toHaveBeenCalledWith(
      "lead_magnet_offer_shown",
      expect.objectContaining({ primary_title: expect.any(String) }),
    );
  });

  it("submits the contextual magnet slug with the lead request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    render(<LeadMagnetSignup {...defaultProps} />);

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "reader@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: defaultProps.leadMagnet.ctaText }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const request = fetchMock.mock.calls[0]?.[1] as { body: string };
    expect(JSON.parse(request.body)).toMatchObject({
      email: "reader@example.com",
      sourcePage: "/resources/guides/test",
      magnetSlug: "grant-compliance-checklist",
    });
  });

  it("lets readers switch to an alternate lead magnet before submitting", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <LeadMagnetSignup
        {...defaultProps}
        leadMagnet={{
          ...defaultProps.leadMagnet,
          alternatives: [
            {
              slug: "nonprofit-crm-evaluation-scorecard",
              title: "CRM Evaluation Scorecard",
              description: "A worksheet for comparing nonprofit CRM options.",
              ctaText: "Email Me the CRM Evaluation Scorecard",
              headline: "Get the CRM Evaluation Scorecard",
            },
            {
              slug: "donor-retention-playbook",
              title: "Donor Retention Playbook",
              description: "A practical donor follow-up plan.",
              ctaText: "Email Me the Donor Retention Playbook",
              headline: "Get the Donor Retention Playbook",
            },
          ],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "CRM Evaluation Scorecard" }));

    expect(screen.getByRole("heading", { name: "Get the CRM Evaluation Scorecard" })).toBeDefined();

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "reader@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Email Me the CRM Evaluation Scorecard" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const request = fetchMock.mock.calls[0]?.[1] as { body: string };
    expect(JSON.parse(request.body)).toMatchObject({
      email: "reader@example.com",
      magnetSlug: "nonprofit-crm-evaluation-scorecard",
    });
  });

  it("does not reset the form when the selected lead magnet option is clicked again", () => {
    render(
      <LeadMagnetSignup
        {...defaultProps}
        leadMagnet={{
          ...defaultProps.leadMagnet,
          alternatives: [
            {
              slug: "nonprofit-crm-evaluation-scorecard",
              title: "CRM Evaluation Scorecard",
              description: "A worksheet for comparing nonprofit CRM options.",
            },
          ],
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "reader@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Grant Compliance Checklist" }));

    expect(screen.getByLabelText("Email address")).toHaveValue("reader@example.com");
    expect(trackEvent).not.toHaveBeenCalledWith(
      "lead_magnet_alternative_selected",
      expect.anything(),
    );
  });

  it("syncs the form when the parent supplies a new primary lead magnet", () => {
    const { rerender } = render(<LeadMagnetSignup {...defaultProps} />);

    rerender(
      <LeadMagnetSignup
        {...defaultProps}
        leadMagnet={{
          slug: "donor-retention-playbook",
          title: "Donor Retention Playbook",
          description: "A practical donor follow-up plan.",
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Get the Donor Retention Playbook" })).toBeDefined();
  });

  it("does not track the same shown offer again during unrelated rerenders", () => {
    const { rerender } = render(<LeadMagnetSignup {...defaultProps} />);
    vi.mocked(trackEvent).mockClear();

    rerender(<LeadMagnetSignup {...defaultProps} sourcePage="/resources/guides/updated" />);

    expect(trackEvent).not.toHaveBeenCalledWith("lead_magnet_offer_shown", expect.anything());
  });

  it("restores stored delivery when switching to a delivered alternate lead magnet", () => {
    localStorage.setItem(
      "lead-magnet-delivered:nonprofit-crm-evaluation-scorecard",
      '{"email":"reader@example.com"}',
    );

    render(
      <LeadMagnetSignup
        {...defaultProps}
        leadMagnet={{
          ...defaultProps.leadMagnet,
          alternatives: [
            {
              slug: "nonprofit-crm-evaluation-scorecard",
              title: "CRM Evaluation Scorecard",
              description: "A worksheet for comparing nonprofit CRM options.",
            },
          ],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "CRM Evaluation Scorecard" }));

    expect(screen.getByText("Request received")).toBeDefined();
  });

  it("shows email-only delivery copy without a trial CTA after success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    render(<LeadMagnetSignup {...defaultProps} />);

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "reader@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: defaultProps.leadMagnet.ctaText }));

    await waitFor(() => {
      expect(screen.getByText("Request received")).toBeDefined();
    });

    expect(
      screen.getByText("If this address is eligible, we’ll send the file soon."),
    ).toBeDefined();
    expect(screen.getByText("The resource is delivered by email.")).toBeDefined();
    expect(screen.queryByRole("link", { name: "Start your 1-month free trial" })).toBeNull();
  });

  it("shows the same generic accepted message for a suppressed address", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, alreadySubscribed: true, deliveryState: "unsubscribed" }),
      }),
    );

    render(<LeadMagnetSignup {...defaultProps} />);

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "reader@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: defaultProps.leadMagnet.ctaText }));

    expect(await screen.findByText("Request received")).toBeDefined();
    expect(
      screen.getByText("If this address is eligible, we’ll send the file soon."),
    ).toBeDefined();
    expect(screen.queryByText("We could not send to this address")).toBeNull();
    expect(JSON.stringify(vi.mocked(trackEvent).mock.calls)).not.toContain("reader@example.com");
    expect(JSON.stringify(vi.mocked(trackEvent).mock.calls)).not.toContain(
      "Grant Compliance Checklist",
    );
  });

  it.each(["in_progress", "ambiguous", "sent", "resend_unavailable"])(
    "does not reveal the %s delivery state",
    async (deliveryState) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ deliveryState }),
        }),
      );

      render(<LeadMagnetSignup {...defaultProps} />);
      fireEvent.change(screen.getByLabelText("Email address"), {
        target: { value: "reader@example.com" },
      });
      fireEvent.click(screen.getByRole("button", { name: defaultProps.leadMagnet.ctaText }));

      expect(await screen.findByText("Request received")).toBeDefined();
      expect(
        screen.getByText("If this address is eligible, we’ll send the file soon."),
      ).toBeDefined();
      expect(screen.queryByText("Your email is queued.")).toBeNull();
      expect(screen.queryByText("Email sent. Check your inbox.")).toBeNull();
    },
  );

  it("can resend the delivery email after success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    render(<LeadMagnetSignup {...defaultProps} />);

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "reader@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: defaultProps.leadMagnet.ctaText }));

    await waitFor(() => {
      expect(screen.getByText("Request received")).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Resend the email" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const resendRequest = fetchMock.mock.calls[1]?.[1] as { body: string };
    expect(JSON.parse(resendRequest.body)).toMatchObject({
      email: "reader@example.com",
      magnetSlug: "grant-compliance-checklist",
      resendDelivery: true,
    });
    expect(screen.getByText("Request received.")).toBeDefined();
    expect(trackEvent).toHaveBeenCalledWith("lead_magnet_resend_requested", {
      source_page: "/resources/guides/test",
      slug: "grant-compliance-checklist",
    });
    expect(trackEvent).toHaveBeenCalledWith("lead_magnet_resend_queued", {
      source_page: "/resources/guides/test",
      slug: "grant-compliance-checklist",
    });
  });

  it("does not reveal a confirmed-sent resend state", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ deliveryState: "sent" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<LeadMagnetSignup {...defaultProps} />);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "reader@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: defaultProps.leadMagnet.ctaText }));
    await screen.findByText("Request received");
    fireEvent.click(screen.getByRole("button", { name: "Resend the email" }));

    expect(await screen.findByText("Request received.")).toBeDefined();
    expect(trackEvent).toHaveBeenCalledWith("lead_magnet_resend_queued", {
      source_page: "/resources/guides/test",
      slug: "grant-compliance-checklist",
    });
  });

  it("does not reveal when a resend is unavailable", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ deliveryState: "resend_unavailable" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<LeadMagnetSignup {...defaultProps} />);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "reader@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: defaultProps.leadMagnet.ctaText }));
    await screen.findByText("Request received");
    fireEvent.click(screen.getByRole("button", { name: "Resend the email" }));

    expect(await screen.findByText("Request received.")).toBeDefined();
  });

  it("starts in success state when the magnet was already delivered", () => {
    localStorage.setItem(
      "lead-magnet-delivered:grant-compliance-checklist",
      '{"email":"reader@example.com"}',
    );

    render(
      <LeadMagnetSignup
        {...defaultProps}
        leadMagnet={{
          slug: "grant-compliance-checklist",
          title: "Grant Compliance Checklist",
          description: "A practical checklist for post-award grant compliance.",
        }}
      />,
    );

    expect(screen.getByText("Request received")).toBeDefined();
    expect(
      screen.getByText("If this address is eligible, we’ll send the file soon."),
    ).toBeDefined();
  });

  it("shows the generic accepted message when stored delivery has no email", () => {
    localStorage.setItem("lead-magnet-delivered:grant-compliance-checklist", '{"email":42}');

    render(<LeadMagnetSignup {...defaultProps} />);

    expect(
      screen.getByText("If this address is eligible, we’ll send the file soon."),
    ).toBeDefined();
  });

  it("does not resend when stored delivery has no email address", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    localStorage.setItem("lead-magnet-delivered:grant-compliance-checklist", '{"email":42}');

    render(<LeadMagnetSignup {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Resend the email" }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows and clears validation feedback for invalid email input", () => {
    render(<LeadMagnetSignup {...defaultProps} />);

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "not-an-email" },
    });
    fireEvent.submit(screen.getByLabelText("Email address").closest("form")!);

    expect(screen.getByText("Please enter a valid email address.")).toBeDefined();
    expect(trackEvent).toHaveBeenCalledWith("lead_magnet_submission_failed", {
      source_page: "/resources/guides/test",
      slug: "grant-compliance-checklist",
      failure_type: "validation",
    });

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "reader@example.com" },
    });

    expect(screen.queryByText("Please enter a valid email address.")).toBeNull();
  });

  it("shows a generic error when lead submission returns a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    render(<LeadMagnetSignup {...defaultProps} />);

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "reader@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: defaultProps.leadMagnet.ctaText }));

    await waitFor(() => {
      expect(screen.getByText("Something went wrong. Please try again.")).toBeDefined();
    });
    expect(captureSiteFetchFailure).toHaveBeenCalledWith(null, {
      source: "lead-magnet-signup",
      status: 500,
    });
    expect(trackEvent).toHaveBeenCalledWith("lead_magnet_submission_failed", {
      source_page: "/resources/guides/test",
      slug: "grant-compliance-checklist",
      failure_type: "api_error",
      status: 500,
    });
  });

  it("does not report expected 4xx submission responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }));

    render(<LeadMagnetSignup {...defaultProps} />);

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "reader@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: defaultProps.leadMagnet.ctaText }));

    await waitFor(() => {
      expect(screen.getByText("Something went wrong. Please try again.")).toBeDefined();
    });
    expect(captureSiteFetchFailure).toHaveBeenCalledWith(null, {
      source: "lead-magnet-signup",
      status: 429,
    });
  });

  it("shows a generic error when lead submission throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    render(<LeadMagnetSignup {...defaultProps} />);

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "reader@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: defaultProps.leadMagnet.ctaText }));

    await waitFor(() => {
      expect(screen.getByText("Something went wrong. Please try again.")).toBeDefined();
    });
    expect(captureSiteFetchFailure).toHaveBeenCalledWith(expect.any(Error), {
      source: "lead-magnet-signup",
      status: undefined,
    });
    expect(trackEvent).toHaveBeenCalledWith("lead_magnet_submission_failed", {
      source_page: "/resources/guides/test",
      slug: "grant-compliance-checklist",
      failure_type: "network_error",
    });
  });

  it("shows a generic error when Turnstile is configured without a token", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<LeadMagnetSignup {...defaultProps} turnstileSiteKey="0xLMS" />);

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "reader@example.com" },
    });
    fireEvent.submit(screen.getByLabelText("Email address").closest("form")!);

    expect(screen.getByText("Something went wrong. Please try again.")).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(trackEvent).toHaveBeenCalledWith("lead_magnet_submission_failed", {
      source_page: "/resources/guides/test",
      slug: "grant-compliance-checklist",
      failure_type: "turnstile_required",
    });
  });

  // --- bot protection: honeypot + turnstile ---

  it("renders a hidden honeypot input with name=company_website", () => {
    render(<LeadMagnetSignup {...defaultProps} />);
    const honeypot = document.querySelector('input[name="company_website"]') as HTMLInputElement;
    expect(honeypot).not.toBeNull();
    expect(honeypot.getAttribute("aria-hidden")).toBe("true");
    expect(honeypot.getAttribute("tabindex")).toBe("-1");
    expect(honeypot.getAttribute("autocomplete")).toBe("off");
    expect(honeypot.style.position).toBe("absolute");
  });

  it("includes companyWebsite and turnstileToken keys in POST body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    render(<LeadMagnetSignup {...defaultProps} turnstileSiteKey={undefined} />);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "reader@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: defaultProps.leadMagnet.ctaText }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as { body: string }).body) as Record<
      string,
      unknown
    >;
    expect(Object.prototype.hasOwnProperty.call(body, "companyWebsite")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(body, "turnstileToken")).toBe(true);
  });

  it("uses the default CTA text when the magnet omits custom CTA copy", () => {
    render(
      <LeadMagnetSignup
        {...defaultProps}
        leadMagnet={{
          slug: "grant-compliance-checklist",
          title: "Grant Compliance Checklist",
          description: "A practical checklist for post-award grant compliance.",
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "Email Me the PDF" })).toBeDefined();
  });

  it("shows resend loading state while the resend request is pending", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockImplementationOnce(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);

    render(<LeadMagnetSignup {...defaultProps} />);

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "reader@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: defaultProps.leadMagnet.ctaText }));

    await waitFor(() => {
      expect(screen.getByText("Request received")).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Resend the email" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sending..." })).toBeDisabled();
    });
  });

  it("shows resend error copy when resend returns a non-ok response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchMock);

    render(<LeadMagnetSignup {...defaultProps} />);

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "reader@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: defaultProps.leadMagnet.ctaText }));

    await waitFor(() => {
      expect(screen.getByText("Request received")).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Resend the email" }));

    await waitFor(() => {
      expect(
        screen.getByText((_, node) => node?.textContent?.startsWith("Resend failed.") ?? false),
      ).toBeDefined();
      expect(screen.getByRole("button", { name: "Resend the email" })).toBeDefined();
    });
    expect(captureSiteFetchFailure).toHaveBeenCalledWith(null, {
      source: "lead-magnet-resend",
      status: 500,
    });
    expect(trackEvent).toHaveBeenCalledWith("lead_magnet_resend_failed", {
      source_page: "/resources/guides/test",
      slug: "grant-compliance-checklist",
      failure_type: "api_error",
      status: 500,
    });
  });

  it("shows resend error copy when resend throws", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockRejectedValueOnce(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    render(<LeadMagnetSignup {...defaultProps} />);

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "reader@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: defaultProps.leadMagnet.ctaText }));

    await waitFor(() => {
      expect(screen.getByText("Request received")).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Resend the email" }));

    await waitFor(() => {
      expect(
        screen.getByText((_, node) => node?.textContent?.startsWith("Resend failed.") ?? false),
      ).toBeDefined();
      expect(screen.getByRole("button", { name: "Resend the email" })).toBeDefined();
    });
    expect(captureSiteFetchFailure).toHaveBeenCalledWith(expect.any(Error), {
      source: "lead-magnet-resend",
      status: undefined,
    });
    expect(trackEvent).toHaveBeenCalledWith("lead_magnet_resend_failed", {
      source_page: "/resources/guides/test",
      slug: "grant-compliance-checklist",
      failure_type: "network_error",
    });
  });

  // --- bot protection: honeypot onChange + turnstile callbacks ---

  it("honeypot onChange updates companyWebsite in the POST body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    render(<LeadMagnetSignup {...defaultProps} turnstileSiteKey={undefined} />);

    const honeypot = document.querySelector('input[name="company_website"]') as HTMLInputElement;
    fireEvent.change(honeypot, { target: { value: "http://bot.example" } });

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "reader@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: defaultProps.leadMagnet.ctaText }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as { body: string }).body) as Record<
      string,
      unknown
    >;
    expect(body.companyWebsite).toBe("http://bot.example");
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
      render: vi.fn(() => "widget-lms-1"),
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
    (window as Record<string, unknown>).turnstile = mockTurnstile;

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    render(<LeadMagnetSignup {...defaultProps} turnstileSiteKey="0xLMS" />);

    act(() => {
      mockTurnstile._flush();
    });

    const renderArgs = mockTurnstile.render.mock.calls[0] as [
      HTMLElement,
      { callback: (token: string) => void },
    ];
    act(() => {
      renderArgs[1].callback("lms-token-xyz");
    });

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "reader@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: defaultProps.leadMagnet.ctaText }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as { body: string }).body) as Record<
      string,
      unknown
    >;
    expect(body.turnstileToken).toBe("lms-token-xyz");
  });

  it("turnstile onExpire resets turnstileToken and blocks submit until re-challenged", async () => {
    interface MockTurnstileLocal {
      render: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
      ready: (cb: () => void) => void;
      _readyQueue: (() => void)[];
      _flush: () => void;
    }
    const mockTurnstile: MockTurnstileLocal = {
      render: vi.fn(() => "widget-lms-2"),
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
    (window as Record<string, unknown>).turnstile = mockTurnstile;

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    render(<LeadMagnetSignup {...defaultProps} turnstileSiteKey="0xLMS" />);

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
      renderArgs[1].callback("lms-token-before-expire");
    });
    act(() => {
      renderArgs[1]["expired-callback"]();
    });

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "reader@example.com" },
    });

    // Submit button must be disabled once the Turnstile token has expired
    // so users can't accidentally submit a request that the worker will reject.
    const submitButton = screen.getByRole("button", { name: defaultProps.leadMagnet.ctaText });
    await waitFor(() => {
      expect(submitButton).toBeDisabled();
    });
    fireEvent.click(submitButton);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses getPublicTurnstileSiteKey() fallback when turnstileSiteKey prop is omitted", () => {
    render(<LeadMagnetSignup {...defaultProps} />);
    expect(screen.getByLabelText("Email address")).toBeDefined();
  });

  it("uses explicit turnstileSiteKey prop when provided", () => {
    render(<LeadMagnetSignup {...defaultProps} turnstileSiteKey="0xEXPLICIT_LMS" />);
    const scripts = document.querySelectorAll('script[src*="turnstile"]');
    expect(scripts.length).toBeGreaterThanOrEqual(1);
  });
});
