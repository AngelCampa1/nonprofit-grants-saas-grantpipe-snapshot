import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { EmailCapture } from "./email-capture";

vi.mock("../lib/analytics", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("../lib/form-interaction-tracker", () => ({
  trackEmailFocus: vi.fn(),
  trackEmailBlurWithoutSubmit: vi.fn(),
  resetFocusTracking: vi.fn(),
}));

const defaultProps = {
  apiUrl: "/api",
  sourcePage: "/guides/privacy",
  signupFlowConfigUrl: "/signup-flow.json",
};

describe("EmailCapture signup flow config", () => {
  it("loads survey config from a public JSON endpoint before rendering the form", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          surveyQuestions: [{ id: "role", text: "Role?", options: ["User", "Other"] }],
          discoveryCallUrl: "https://cal.test/floriva",
          subtitle: "Stored on your device.",
        }),
      }),
    );

    render(<EmailCapture {...defaultProps} />);

    expect(screen.getByText(/Loading signup form/i)).toBeDefined();

    await waitFor(() => {
      expect(screen.getByLabelText("Email address")).toBeDefined();
      expect(screen.getByText("Stored on your device.")).toBeDefined();
    });
  });

  it("shows a retry state when the signup-flow request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }),
    );

    render(<EmailCapture {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("We couldn't load the signup form.")).toBeDefined();
      expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
    });
  });

  it("retries the signup-flow request after an initial failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          surveyQuestions: [{ id: "role", text: "Role?", options: ["User"] }],
          discoveryCallUrl: "https://cal.test/floriva",
          subtitle: "Stored on your device.",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<EmailCapture {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Email address")).toBeDefined();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  it("shows the loading spinner while the signup-flow config request is in flight", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {}) as Promise<Response>),
    );

    render(<EmailCapture {...defaultProps} />);

    expect(screen.getByText(/Loading signup form/i)).toBeDefined();
    expect(document.querySelector(".animate-spin")).not.toBeNull();
  });

  it("renders the non-fetch loading state without a spinner when no signupFlowConfigUrl is provided", async () => {
    render(<EmailCapture apiUrl="/api" sourcePage="/guides/privacy" />);

    expect(screen.getByText(/Loading signup form/i)).toBeDefined();
    expect(document.querySelector(".animate-spin")).toBeNull();

    await waitFor(() => {
      expect(screen.queryByLabelText("Email address")).toBeNull();
    });
  });

  it("reuses the loaded signup config instead of fetching again after rerender", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        surveyQuestions: [{ id: "role", text: "Role?", options: ["User"] }],
        discoveryCallUrl: "https://cal.test/floriva",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(<EmailCapture {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Email address")).toBeDefined();
    });

    rerender(
      <EmailCapture
        apiUrl="/api"
        sourcePage="/guides/privacy"
        signupFlowConfigUrl="/signup-flow-next.json"
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Email address")).toBeDefined();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it("uses privacy and survey preview copy from the loaded signup config", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (input === "/signup-flow.json") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              surveyQuestions: [{ id: "role", text: "Role?", options: ["User"] }],
              discoveryCallUrl: "https://cal.test/floriva",
              privacyNote: "Stored privately.",
              surveyPreview: "Quick follow-up questions.",
            }),
          });
        }

        return Promise.resolve({
          ok: true,
          json: async () => ({}),
        });
      }),
    );

    render(<EmailCapture {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Email address")).toBeDefined();
      expect(screen.getByText("Stored privately.")).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "person@example.com" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Continue with your email" }));

    await waitFor(() => {
      expect(screen.getByText("Quick follow-up questions.")).toBeDefined();
    });
  });
});
