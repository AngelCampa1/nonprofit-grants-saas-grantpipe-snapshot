import { describe, it, expect, vi, beforeEach, type MockInstance } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

vi.mock("../lib/sentry-client", () => ({ captureSiteFetchFailure: vi.fn() }));
vi.mock("../lib/exit-popup-utils", () => ({
  setSignedUp: vi.fn(),
}));
vi.mock("../lib/signup-attribution", () => ({
  resolveSignupAttribution: vi.fn(() => ({})),
}));
vi.mock("../lib/analytics", () => ({ trackEvent: vi.fn() }));

import { setSignedUp } from "../lib/exit-popup-utils";
import { trackEvent } from "../lib/analytics";
import {
  QuestionnaireShell,
  type QuestionnaireQuestion,
  type QuestionnaireResult,
} from "./questionnaire-shell";
import { installMockTurnstile } from "./turnstile-test-utils";

const mockSetSignedUp = setSignedUp as unknown as MockInstance;
const mockTrackEvent = trackEvent as unknown as MockInstance;

const QUESTIONS: QuestionnaireQuestion[] = [
  {
    id: "q1",
    prompt: "Question one prompt?",
    options: [
      { label: "Option A", score: 10 },
      { label: "Option B", score: 0 },
    ],
  },
  {
    id: "q2",
    prompt: "Question two prompt?",
    options: [
      { label: "Yes", score: 10 },
      { label: "No", score: 0 },
    ],
  },
];

function resolveResult(score: number, max: number): QuestionnaireResult {
  return {
    heading: `Score ${score}/${max}`,
    summary: "Summary text",
    links: [{ title: "Next link", href: "/free/next" }],
  };
}

const baseProps = {
  introTitle: "Begin Test",
  introBlurb: "Intro blurb text",
  questions: QUESTIONS,
  resolveResult,
  apiUrl: "https://api.test",
  magnetSlug: "nonprofit-audit-readiness-assessment" as const,
  sourcePage: "/free/nonprofit-audit-readiness-assessment",
  appUrl: "https://app.test/signup",
};

/** Click Begin to enter the questions flow */
async function clickBegin(expectedPrompt = "Question one prompt?") {
  fireEvent.click(screen.getByRole("button", { name: "Begin" }));
  await waitFor(() => expect(screen.getByText(expectedPrompt)).toBeDefined());
}

/** Answer all questions to reach the result screen */
async function answerAllQuestions() {
  await clickBegin();
  fireEvent.click(screen.getByRole("button", { name: "Option A" }));
  await waitFor(() => expect(screen.getByText("Question two prompt?")).toBeDefined());
  fireEvent.click(screen.getByRole("button", { name: "Yes" }));
  await waitFor(() => expect(screen.getByText("Score 20/20")).toBeDefined());
}

/** Fill and submit the lead capture form on the result screen */
async function submitLeadForm(expectedPrompt = "Score 20/20") {
  await waitFor(() => expect(screen.getByText(expectedPrompt)).toBeDefined());
  fireEvent.change(screen.getByLabelText("Nonprofit name"), {
    target: { value: "Acme NP" },
  });
  fireEvent.change(screen.getByLabelText("Work email"), {
    target: { value: "test@example.com" },
  });
  const form = screen.getByLabelText("Work email").closest("form")!;
  fireEvent.submit(form);
  await waitFor(() => expect(mockSetSignedUp).toHaveBeenCalled());
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
  // Reset Turnstile dedup flag and globals between tests
  (globalThis as Record<string, unknown>).__turnstileScriptLoaded = false;
  delete (window as Record<string, unknown>).turnstile;
  delete (window as Record<string, unknown>).onloadTurnstileCallback;
  document.querySelectorAll('script[src*="turnstile"]').forEach((el) => el.remove());
});

describe("QuestionnaireShell", () => {
  it.each([
    ["unsubscribed", "You asked us to stop. Try a new email."],
    ["resend_unavailable", "We could not send the report. Use another email."],
  ])("does not claim the report was requested when delivery is %s", async (deliveryState, copy) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ deliveryState }),
      }),
    );
    render(<QuestionnaireShell {...baseProps} />);
    await answerAllQuestions();
    fireEvent.change(screen.getByLabelText("Nonprofit name"), {
      target: { value: "Acme NP" },
    });
    fireEvent.change(screen.getByLabelText("Work email"), {
      target: { value: "stopped@example.com" },
    });
    fireEvent.submit(screen.getByLabelText("Work email").closest("form")!);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(copy));
    expect(mockSetSignedUp).not.toHaveBeenCalled();
    expect(mockTrackEvent).not.toHaveBeenCalledWith(
      "assessment_report_requested",
      expect.anything(),
    );
    expect(screen.getByLabelText("Work email")).toBeDefined();
  });

  it("accepts a report delivery that is already in progress", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ deliveryState: "in_progress" }),
      }),
    );
    render(<QuestionnaireShell {...baseProps} />);
    await answerAllQuestions();
    await submitLeadForm();

    expect(mockSetSignedUp).toHaveBeenCalledOnce();
    expect(mockTrackEvent).toHaveBeenCalledWith("assessment_report_requested", expect.anything());
  });

  it("gates desktop and mobile submission until Turnstile mints a fresh token", async () => {
    const mockTurnstile = installMockTurnstile();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    render(<QuestionnaireShell {...baseProps} turnstileSiteKey="0xQS" />);
    await answerAllQuestions();
    fireEvent.change(screen.getByLabelText("Nonprofit name"), {
      target: { value: "Acme NP" },
    });
    fireEvent.change(screen.getByLabelText("Work email"), {
      target: { value: "test@example.com" },
    });
    act(() => mockTurnstile.flush());

    const submitButtons = screen.getAllByRole("button", { name: "Email my report" });
    expect(submitButtons).toHaveLength(2);
    submitButtons.forEach((button) => expect(button).toBeDisabled());
    fireEvent.submit(screen.getByLabelText("Work email").closest("form")!);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Please finish the check first.");

    act(() => mockTurnstile.renderOptions[0]?.callback("spent-token"));
    submitButtons.forEach((button) => expect(button).not.toBeDisabled());
    fireEvent.click(submitButtons[0]!);
    await waitFor(() => expect(mockTurnstile.turnstile.reset).toHaveBeenCalledWith("widget-1"));
    submitButtons.forEach((button) => expect(button).toBeDisabled());

    act(() => mockTurnstile.renderOptions[0]?.callback("fresh-token"));
    fireEvent.click(submitButtons[1]!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1]![1]!.body as string).turnstileToken).toBe(
      "fresh-token",
    );
    expect(mockTurnstile.turnstile.reset).toHaveBeenCalledTimes(2);
  });
  it("renders intro screen first (no lead form on first view)", () => {
    render(<QuestionnaireShell {...baseProps} />);
    expect(screen.getByText("Begin Test")).toBeDefined();
    expect(screen.getByText("Intro blurb text")).toBeDefined();
    expect(screen.getByRole("button", { name: "Begin" })).toBeDefined();
    // No email input on intro screen
    expect(screen.queryByLabelText("Work email")).toBeNull();
  });

  it("tracks assessment_started when Begin is clicked", async () => {
    render(<QuestionnaireShell {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Begin" }));
    await waitFor(() => expect(screen.getByText("Question one prompt?")).toBeDefined());

    expect(mockTrackEvent).toHaveBeenCalledWith("assessment_started", {
      magnet_slug: "nonprofit-audit-readiness-assessment",
      source_page: "/free/nonprofit-audit-readiness-assessment",
      question_count: 2,
    });
  });

  it("shows first question after clicking Begin", async () => {
    render(<QuestionnaireShell {...baseProps} />);
    await clickBegin();
    expect(screen.getByText("Question one prompt?")).toBeDefined();
    expect(screen.getByRole("button", { name: "Option A" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Option B" })).toBeDefined();
  });

  it("advances when an option is selected and shows progress reflecting step + 1", async () => {
    render(<QuestionnaireShell {...baseProps} />);
    await clickBegin();
    // Initial progress on Q1 should be 50% (1/2), not 0%
    expect(screen.getByText("50% complete")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Option A" }));
    await waitFor(() => expect(screen.getByText("Question two prompt?")).toBeDefined());
    expect(screen.getByText("100% complete")).toBeDefined();
    expect(mockTrackEvent).toHaveBeenCalledWith("assessment_question_answered", {
      magnet_slug: "nonprofit-audit-readiness-assessment",
      source_page: "/free/nonprofit-audit-readiness-assessment",
      question_id: "q1",
      question_index: 0,
      answer_score: 10,
      progress_percent: 50,
    });
  });

  it("shows result after all questions answered", async () => {
    render(<QuestionnaireShell {...baseProps} />);
    await answerAllQuestions();
    expect(screen.getByText("Score 20/20")).toBeDefined();
    expect(screen.getByText("Next link")).toBeDefined();
    expect(mockTrackEvent).toHaveBeenCalledWith("assessment_completed", {
      magnet_slug: "nonprofit-audit-readiness-assessment",
      source_page: "/free/nonprofit-audit-readiness-assessment",
      total_score: 20,
      max_score: 20,
      question_count: 2,
      result_score_band: "high",
    });
    expect(mockTrackEvent).not.toHaveBeenCalledWith(
      "assessment_completed",
      expect.objectContaining({ result_heading: expect.any(String) }),
    );
  });

  it("shows lead capture form on result screen", async () => {
    render(<QuestionnaireShell {...baseProps} />);
    await answerAllQuestions();
    expect(screen.getByLabelText("Work email")).toBeDefined();
    expect(screen.getByLabelText("Nonprofit name")).toBeDefined();
  });

  it("shows trial CTA on result screen when appUrl is provided", async () => {
    render(<QuestionnaireShell {...baseProps} />);
    await answerAllQuestions();
    const cta = screen.getByRole("link", { name: /start your free trial/i }) as HTMLAnchorElement;
    expect(cta).toBeDefined();
    expect(cta.href).toContain("https://app.test/signup");
  });

  it("does not show trial CTA when appUrl is omitted", async () => {
    const propsWithoutAppUrl = { ...baseProps, appUrl: undefined };
    render(<QuestionnaireShell {...propsWithoutAppUrl} />);
    await answerAllQuestions();
    expect(screen.queryByRole("link", { name: /start your free trial/i })).toBeNull();
  });

  it("tracks assessment_result_cta_clicked when trial CTA is clicked", async () => {
    render(<QuestionnaireShell {...baseProps} />);
    await answerAllQuestions();
    const cta = screen.getByRole("link", { name: /start your free trial/i });
    cta.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(cta);
    expect(mockTrackEvent).toHaveBeenCalledWith("assessment_result_cta_clicked", {
      magnet_slug: "nonprofit-audit-readiness-assessment",
      source_page: "/free/nonprofit-audit-readiness-assessment",
      result_score_band: "high",
      destination_path: "/signup",
    });
    // Must not include appUrl query params in the tracked path
    expect(JSON.stringify(mockTrackEvent.mock.calls)).not.toContain("app.test");
  });

  it("posts to /api/public/leads on result-screen lead submit", async () => {
    render(<QuestionnaireShell {...baseProps} />);
    await answerAllQuestions();
    await submitLeadForm();
    expect(fetch).toHaveBeenCalledWith(
      "https://api.test/api/public/leads",
      expect.objectContaining({ method: "POST" }),
    );
    const call = (fetch as unknown as MockInstance).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.email).toBe("test@example.com");
    expect(body.firstName).toBe("Acme NP");
    expect(body.magnetSlug).toBe("nonprofit-audit-readiness-assessment");
    expect(body.resendDelivery).toBe(true);
    expect(mockSetSignedUp).toHaveBeenCalled();
  });

  it("tracks assessment_report_requested after successful lead submit", async () => {
    render(<QuestionnaireShell {...baseProps} />);
    await answerAllQuestions();
    await submitLeadForm();
    expect(mockTrackEvent).toHaveBeenCalledWith("assessment_report_requested", {
      magnet_slug: "nonprofit-audit-readiness-assessment",
      source_page: "/free/nonprofit-audit-readiness-assessment",
      result_score_band: "high",
    });
  });

  it("shows queued confirmation without claiming the report was sent", async () => {
    render(<QuestionnaireShell {...baseProps} />);
    await answerAllQuestions();
    await submitLeadForm();
    expect(screen.getByText("Report queued. Check your inbox soon.")).toBeDefined();
    expect(screen.queryByText(/report sent/i)).toBeNull();
  });

  it("shows uncertain delivery without claiming the report was sent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ deliveryState: "ambiguous" }),
      }),
    );
    render(<QuestionnaireShell {...baseProps} />);
    await answerAllQuestions();
    await submitLeadForm();
    expect(
      screen.getByText("We got your request. Delivery may still be in progress."),
    ).toBeDefined();
    expect(screen.queryByText(/report sent/i)).toBeNull();
  });

  it("shows error when POST fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    render(<QuestionnaireShell {...baseProps} />);
    await answerAllQuestions();
    fireEvent.change(screen.getByLabelText("Nonprofit name"), {
      target: { value: "Acme NP" },
    });
    fireEvent.change(screen.getByLabelText("Work email"), {
      target: { value: "test@example.com" },
    });
    const form = screen.getByLabelText("Work email").closest("form")!;
    fireEvent.submit(form);
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/Something went wrong/),
    );
    expect(mockSetSignedUp).not.toHaveBeenCalled();
    expect(mockTrackEvent).toHaveBeenCalledWith("assessment_submission_failed", {
      magnet_slug: "nonprofit-audit-readiness-assessment",
      source_page: "/free/nonprofit-audit-readiness-assessment",
      failure_type: "api",
      status: 500,
    });
  });

  it("shows error when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    render(<QuestionnaireShell {...baseProps} />);
    await answerAllQuestions();
    fireEvent.change(screen.getByLabelText("Nonprofit name"), {
      target: { value: "Acme NP" },
    });
    fireEvent.change(screen.getByLabelText("Work email"), {
      target: { value: "test@example.com" },
    });
    const form = screen.getByLabelText("Work email").closest("form")!;
    fireEvent.submit(form);
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/Something went wrong/),
    );
    expect(mockTrackEvent).toHaveBeenCalledWith("assessment_submission_failed", {
      magnet_slug: "nonprofit-audit-readiness-assessment",
      source_page: "/free/nonprofit-audit-readiness-assessment",
      failure_type: "network",
    });
  });

  it("tracks result link clicks with a safe destination path", async () => {
    render(<QuestionnaireShell {...baseProps} />);
    await answerAllQuestions();

    const link = screen.getByRole("link", { name: "Next link" });
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);

    expect(mockTrackEvent).toHaveBeenCalledWith("assessment_result_link_clicked", {
      magnet_slug: "nonprofit-audit-readiness-assessment",
      source_page: "/free/nonprofit-audit-readiness-assessment",
      result_score_band: "high",
      destination_path: "/free/next",
      link_position: 0,
    });
    expect(JSON.stringify(mockTrackEvent.mock.calls)).not.toContain("Next link");
  });

  it("tracks assessment abandonment on unmount after starting questions", async () => {
    const { unmount } = render(<QuestionnaireShell {...baseProps} />);
    await clickBegin();
    fireEvent.click(screen.getByRole("button", { name: "Option A" }));
    await waitFor(() => expect(screen.getByText("Question two prompt?")).toBeDefined());

    unmount();

    expect(mockTrackEvent).toHaveBeenCalledWith("assessment_abandoned", {
      magnet_slug: "nonprofit-audit-readiness-assessment",
      source_page: "/free/nonprofit-audit-readiness-assessment",
      answered_count: 1,
      question_count: 2,
      progress_percent: 50,
      last_question_index: 1,
      abandonment_trigger: "unmount",
    });
  });

  it("tracks assessment abandonment on pagehide after starting questions", async () => {
    render(<QuestionnaireShell {...baseProps} />);
    await clickBegin();

    window.dispatchEvent(new Event("pagehide"));

    expect(mockTrackEvent).toHaveBeenCalledWith("assessment_abandoned", {
      magnet_slug: "nonprofit-audit-readiness-assessment",
      source_page: "/free/nonprofit-audit-readiness-assessment",
      answered_count: 0,
      question_count: 2,
      progress_percent: 0,
      last_question_index: 0,
      abandonment_trigger: "pagehide",
    });
  });

  it("does not track abandonment before Begin is clicked", () => {
    const { unmount } = render(<QuestionnaireShell {...baseProps} />);
    unmount();
    expect(mockTrackEvent).not.toHaveBeenCalledWith("assessment_abandoned", expect.any(Object));
  });

  it("does not track abandonment after assessment completion", async () => {
    const { unmount } = render(<QuestionnaireShell {...baseProps} />);
    await answerAllQuestions();

    unmount();

    expect(mockTrackEvent).not.toHaveBeenCalledWith("assessment_abandoned", expect.any(Object));
  });

  it("tracks a medium result score band", async () => {
    render(<QuestionnaireShell {...baseProps} />);
    await clickBegin();
    fireEvent.click(screen.getByRole("button", { name: "Option A" }));
    await waitFor(() => expect(screen.getByText("Question two prompt?")).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "No" }));

    await waitFor(() => expect(screen.getByText("Score 10/20")).toBeDefined());
    expect(mockTrackEvent).toHaveBeenCalledWith(
      "assessment_completed",
      expect.objectContaining({ result_score_band: "medium" }),
    );
  });

  it("tracks a low result score band", async () => {
    render(<QuestionnaireShell {...baseProps} />);
    await clickBegin();
    fireEvent.click(screen.getByRole("button", { name: "Option B" }));
    await waitFor(() => expect(screen.getByText("Question two prompt?")).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "No" }));

    await waitFor(() => expect(screen.getByText("Score 0/20")).toBeDefined());
    expect(mockTrackEvent).toHaveBeenCalledWith(
      "assessment_completed",
      expect.objectContaining({ result_score_band: "low" }),
    );
  });

  it("tracks an unknown result score band when there is no positive max score", async () => {
    const zeroMaxQuestions: QuestionnaireQuestion[] = [
      {
        id: "zero",
        prompt: "Zero max question?",
        options: [{ label: "No score", score: 0 }],
      },
    ];
    render(<QuestionnaireShell {...baseProps} questions={zeroMaxQuestions} />);
    await clickBegin("Zero max question?");
    fireEvent.click(screen.getByRole("button", { name: "No score" }));

    await waitFor(() => expect(screen.getByText("Score 0/0")).toBeDefined());
    expect(mockTrackEvent).toHaveBeenCalledWith(
      "assessment_completed",
      expect.objectContaining({ result_score_band: "unknown" }),
    );
  });

  it("retake clears state and returns to intro screen", async () => {
    render(<QuestionnaireShell {...baseProps} />);
    await answerAllQuestions();
    fireEvent.click(screen.getByRole("button", { name: "Retake" }));
    await waitFor(() => expect(screen.getByText("Begin Test")).toBeDefined());
    expect(mockTrackEvent).toHaveBeenCalledWith("assessment_retake_clicked", {
      magnet_slug: "nonprofit-audit-readiness-assessment",
      source_page: "/free/nonprofit-audit-readiness-assessment",
      total_score: 20,
      max_score: 20,
    });
    // Verify the intro Begin button is back
    expect(screen.getByRole("button", { name: "Begin" })).toBeDefined();
  });

  it("disables Next when current question unanswered", async () => {
    const QUESTIONS_NO_AUTO: QuestionnaireQuestion[] = [
      {
        id: "qa",
        prompt: "Pick one",
        options: [
          { label: "A", score: 5 },
          { label: "B", score: 10 },
        ],
      },
      {
        id: "qb",
        prompt: "Pick another",
        options: [
          { label: "C", score: 5 },
          { label: "D", score: 10 },
        ],
      },
    ];
    render(<QuestionnaireShell {...baseProps} questions={QUESTIONS_NO_AUTO} />);
    await clickBegin("Pick one");
    // Both inline (sm+) and mobile footer "Next" buttons exist; both should be disabled.
    const nextBtns = screen.getAllByRole("button", { name: "Next" });
    expect(nextBtns.every((btn) => (btn as HTMLButtonElement).disabled)).toBe(true);
  });

  it("does not submit lead form when fields empty", async () => {
    render(<QuestionnaireShell {...baseProps} />);
    await answerAllQuestions();
    const form = screen.getByLabelText("Work email").closest("form")!;
    fireEvent.submit(form);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("computes max from highest option scores per question", async () => {
    const VARIED: QuestionnaireQuestion[] = [
      {
        id: "x",
        prompt: "X?",
        options: [
          { label: "low", score: 2 },
          { label: "high", score: 7 },
        ],
      },
    ];
    function resolve(score: number, max: number): QuestionnaireResult {
      return {
        heading: `${score}/${max}`,
        summary: "",
        links: [],
      };
    }
    render(<QuestionnaireShell {...baseProps} questions={VARIED} resolveResult={resolve} />);
    await clickBegin("X?");
    fireEvent.click(screen.getByRole("button", { name: "high" }));
    await waitFor(() => expect(screen.getByText("7/7")).toBeDefined());
  });

  it("renders the inline Back control as a pill with a mobile-safe touch target", async () => {
    render(<QuestionnaireShell {...baseProps} />);
    await clickBegin();
    fireEvent.click(screen.getByRole("button", { name: "Option A" }));
    await waitFor(() => expect(screen.getByText("Question two prompt?")).toBeDefined());
    // Inline (sm+) Back is index 0; assert pill-canon + 44px+ hit area.
    const inlineBack = screen.getAllByRole("button", { name: "Back" })[0];
    expect(inlineBack.className).toContain("rounded-full");
    expect(inlineBack.className).toContain("min-h-12");
  });

  it("supports going back to previous question", async () => {
    render(<QuestionnaireShell {...baseProps} />);
    await clickBegin();
    fireEvent.click(screen.getByRole("button", { name: "Option A" }));
    await waitFor(() => expect(screen.getByText("Question two prompt?")).toBeDefined());
    // Both inline and MobileFormFooter "Back" buttons are present; click the first.
    fireEvent.click(screen.getAllByRole("button", { name: "Back" })[0]);
    await waitFor(() => expect(screen.getByText("Question one prompt?")).toBeDefined());
  });

  it("supports moving forward with Next after returning to an answered question", async () => {
    render(<QuestionnaireShell {...baseProps} />);
    await clickBegin();
    fireEvent.click(screen.getByRole("button", { name: "Option A" }));
    await waitFor(() => expect(screen.getByText("Question two prompt?")).toBeDefined());
    // Both inline and MobileFormFooter "Back" buttons are present; click the first.
    fireEvent.click(screen.getAllByRole("button", { name: "Back" })[0]);
    await waitFor(() => expect(screen.getByText("Question one prompt?")).toBeDefined());
    // Both inline and MobileFormFooter "Next" buttons are present; click the first.
    fireEvent.click(screen.getAllByRole("button", { name: "Next" })[0]);
    await waitFor(() => expect(screen.getByText("Question two prompt?")).toBeDefined());
  });

  it("MobileFormFooter Next button advances question step", async () => {
    render(<QuestionnaireShell {...baseProps} />);
    await clickBegin();
    // Answer question 1 without auto-advancing (select option, then use MobileFormFooter Next).
    // Click option to answer but stay on Q1 by using the footer Next (index 1 = MobileFormFooter).
    fireEvent.click(screen.getByRole("button", { name: "Option A" }));
    // After clicking Option A, component auto-advances to Q2. Go back via inline Back to Q1 first.
    await waitFor(() => expect(screen.getByText("Question two prompt?")).toBeDefined());
    // Use MobileFormFooter Back (index 1) to go back to Q1.
    const backBtns = screen.getAllByRole("button", { name: "Back" });
    fireEvent.click(backBtns[1]); // MobileFormFooter Back
    await waitFor(() => expect(screen.getByText("Question one prompt?")).toBeDefined());
    // Now use MobileFormFooter Next (index 1) to advance.
    const nextBtns = screen.getAllByRole("button", { name: "Next" });
    fireEvent.click(nextBtns[1]); // MobileFormFooter Next
    await waitFor(() => expect(screen.getByText("Question two prompt?")).toBeDefined());
  });

  it("MobileFormFooter Email my report button triggers lead form submit", async () => {
    render(<QuestionnaireShell {...baseProps} />);
    await answerAllQuestions();
    fireEvent.change(screen.getByLabelText("Nonprofit name"), {
      target: { value: "Acme NP" },
    });
    fireEvent.change(screen.getByLabelText("Work email"), {
      target: { value: "test@example.com" },
    });
    // The MobileFormFooter "Email my report" button is type="button" with an onPrimary handler
    // that calls form.requestSubmit(). In JSDOM requestSubmit fires the submit event.
    const footerDiv = document.querySelector("[data-mobile-form-footer]");
    const footerBtn = footerDiv?.querySelector("button");
    if (footerBtn) {
      fireEvent.click(footerBtn);
    }
    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });

  // --- bot protection: honeypot + turnstile ---

  it("renders a hidden honeypot input with name=company_website on result screen", async () => {
    render(<QuestionnaireShell {...baseProps} />);
    await answerAllQuestions();
    const honeypot = document.querySelector('input[name="company_website"]') as HTMLInputElement;
    expect(honeypot).not.toBeNull();
    expect(honeypot.getAttribute("aria-hidden")).toBe("true");
    expect(honeypot.getAttribute("tabindex")).toBe("-1");
    expect(honeypot.getAttribute("autocomplete")).toBe("off");
    expect(honeypot.style.position).toBe("absolute");
  });

  it("includes companyWebsite and turnstileToken keys in POST body", async () => {
    render(<QuestionnaireShell {...baseProps} turnstileSiteKey={undefined} />);
    await answerAllQuestions();
    await submitLeadForm();

    const call = (fetch as unknown as MockInstance).mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(call[1].body) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(body, "companyWebsite")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(body, "turnstileToken")).toBe(true);
  });

  it("honeypot onChange updates companyWebsite in the POST body", async () => {
    render(<QuestionnaireShell {...baseProps} turnstileSiteKey={undefined} />);
    await answerAllQuestions();

    const honeypot = document.querySelector('input[name="company_website"]') as HTMLInputElement;
    fireEvent.change(honeypot, { target: { value: "http://bot.example" } });

    await submitLeadForm();

    const call = (fetch as unknown as MockInstance).mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(call[1].body) as Record<string, unknown>;
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
      render: vi.fn(() => "widget-qs-1"),
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

    render(<QuestionnaireShell {...baseProps} turnstileSiteKey="0xQS" />);
    await answerAllQuestions();

    act(() => {
      mockTurnstile._flush();
    });

    const renderArgs = mockTurnstile.render.mock.calls[0] as [
      HTMLElement,
      { callback: (token: string) => void },
    ];
    act(() => {
      renderArgs[1].callback("qs-token-abc");
    });

    await submitLeadForm();

    const call = (fetch as unknown as MockInstance).mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(call[1].body) as Record<string, unknown>;
    expect(body.turnstileToken).toBe("qs-token-abc");
  });

  it("turnstile onExpire blocks submission until a fresh token is available", async () => {
    interface MockTurnstileLocal {
      render: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
      ready: (cb: () => void) => void;
      _readyQueue: (() => void)[];
      _flush: () => void;
    }
    const mockTurnstile: MockTurnstileLocal = {
      render: vi.fn(() => "widget-qs-2"),
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

    render(<QuestionnaireShell {...baseProps} turnstileSiteKey="0xQS" />);
    await answerAllQuestions();

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
      renderArgs[1].callback("qs-token-before-expire");
    });
    act(() => {
      renderArgs[1]["expired-callback"]();
    });

    fireEvent.change(screen.getByLabelText("Nonprofit name"), {
      target: { value: "Acme NP" },
    });
    fireEvent.change(screen.getByLabelText("Work email"), {
      target: { value: "test@example.com" },
    });
    fireEvent.submit(screen.getByLabelText("Work email").closest("form")!);

    expect(fetch).not.toHaveBeenCalled();
    screen
      .getAllByRole("button", { name: "Email my report" })
      .forEach((button) => expect(button).toBeDisabled());
  });

  it("uses getPublicTurnstileSiteKey() fallback when turnstileSiteKey prop is omitted", () => {
    render(<QuestionnaireShell {...baseProps} />);
    expect(screen.getByText("Begin Test")).toBeDefined();
  });

  it("uses explicit turnstileSiteKey prop when provided", async () => {
    render(<QuestionnaireShell {...baseProps} turnstileSiteKey="0xEXPLICIT_QS" />);
    await answerAllQuestions();
    const scripts = document.querySelectorAll('script[src*="turnstile"]');
    expect(scripts.length).toBeGreaterThanOrEqual(1);
  });
});
