import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

// Mock analytics
const mockCaptureEvent = vi.fn();
vi.mock("../lib/analytics", () => ({
  captureEvent: (...args: unknown[]) => mockCaptureEvent(...args),
}));

const mockCaptureAppException = vi.fn();
vi.mock("../lib/sentry", () => ({
  captureAppException: (...args: unknown[]) => mockCaptureAppException(...args),
}));

// Mock auth-client before any imports that might use it
vi.mock("../lib/auth-client", () => ({
  authClient: {
    requestPasswordReset: vi.fn(),
  },
  signIn: { email: vi.fn(), social: vi.fn() },
  signOut: vi.fn(),
}));

// Mock TanStack Router
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
  }),
  Link: ({
    to,
    children,
    className,
  }: {
    to: string;
    children: React.ReactNode;
    className?: string;
  }) => React.createElement("a", { href: to, className }, children),
  useNavigate: () => vi.fn(),
}));

import { authClient } from "../lib/auth-client";
import { ForgotPasswordPage } from "./forgot-password";

const mockRequestPasswordReset = vi.mocked(authClient.requestPasswordReset);

function renderPage() {
  render(React.createElement(ForgotPasswordPage));
}

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCaptureEvent.mockClear();
    mockCaptureAppException.mockClear();
  });

  it("renders heading Reset your password", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: "Reset your password", level: 1 }),
    ).toBeInTheDocument();
  });

  it("renders email input field", () => {
    renderPage();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("renders Send reset link submit button", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeInTheDocument();
  });

  it("renders link back to login", () => {
    renderPage();
    const link = screen.getByRole("link", { name: "Back to sign in" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/login");
  });

  it("calls authClient.forgetPassword with email and absolute /app/reset-password redirect on submit", async () => {
    mockRequestPasswordReset.mockResolvedValue({ data: null, error: null });

    renderPage();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "angel@grantpipe.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(mockRequestPasswordReset).toHaveBeenCalledWith({
        email: "angel@grantpipe.com",
        redirectTo: `${window.location.origin}/app/reset-password`,
      });
    });
  });

  it("includes the SPA /app basepath in the reset link so reviewers land on the right route", async () => {
    mockRequestPasswordReset.mockResolvedValue({ data: null, error: null });

    renderPage();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ed@grantpipe.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(mockRequestPasswordReset).toHaveBeenCalledTimes(1);
    });
    const call = mockRequestPasswordReset.mock.calls[0]?.[0] as { redirectTo?: string } | undefined;
    expect(call?.redirectTo).toMatch(/\/app\/reset-password$/);
    expect(call?.redirectTo?.startsWith("http")).toBe(true);
  });

  it("shows success state after successful submission with submitted email", async () => {
    mockRequestPasswordReset.mockResolvedValue({ data: null, error: null });

    renderPage();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "angel@grantpipe.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(screen.getByText(/If an account exists for angel@grantpipe\.com/)).toBeInTheDocument();
    });
  });

  it("hides the form and shows instructions after success", async () => {
    mockRequestPasswordReset.mockResolvedValue({ data: null, error: null });

    renderPage();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    });

    expect(screen.getByText(/Check your inbox/)).toBeInTheDocument();
  });

  it("shows error alert when forgetPassword returns an error", async () => {
    mockRequestPasswordReset.mockResolvedValue({
      data: null,
      error: { message: "Something went wrong" },
    });

    renderPage();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "bad@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    });
  });

  it("shows fallback error message when error has no message", async () => {
    mockRequestPasswordReset.mockResolvedValue({
      data: null,
      error: { message: undefined },
    });

    renderPage();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "bad@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "An unexpected error occurred. Please try again.",
      );
    });
  });

  it("shows unexpected error message and reports when forgetPassword throws", async () => {
    const error = new Error("Network error");
    mockRequestPasswordReset.mockRejectedValue(error);

    renderPage();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "angel@grantpipe.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "An unexpected error occurred. Please try again.",
      );
      expect(mockCaptureAppException).toHaveBeenCalledWith(
        error,
        {
          tags: { source: "auth", feature: "forgot-password" },
        },
        { sanitize: true },
      );
    });
  });

  it("fires forgot_password_submitted on successful submit", async () => {
    mockRequestPasswordReset.mockResolvedValue({ data: null, error: null });

    renderPage();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "angel@grantpipe.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(mockCaptureEvent).toHaveBeenCalledWith("forgot_password_submitted");
    });
  });

  it("does NOT fire forgot_password_submitted when API returns an error", async () => {
    mockRequestPasswordReset.mockResolvedValue({
      data: null,
      error: { message: "Something went wrong" },
    });

    renderPage();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "bad@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(mockCaptureEvent).not.toHaveBeenCalledWith("forgot_password_submitted");
  });

  it("does NOT fire forgot_password_submitted when submit throws", async () => {
    mockRequestPasswordReset.mockRejectedValue(new Error("Network error"));

    renderPage();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "angel@grantpipe.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(mockCaptureEvent).not.toHaveBeenCalledWith("forgot_password_submitted");
  });

  it("does not include email address in captureEvent payload", async () => {
    mockRequestPasswordReset.mockResolvedValue({ data: null, error: null });

    renderPage();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "secret@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(mockCaptureEvent).toHaveBeenCalled();
    });

    for (const call of mockCaptureEvent.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("secret@example.com");
    }
  });

  it("disables button while submitting", async () => {
    let resolvePromise!: () => void;
    mockRequestPasswordReset.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = () => resolve({ data: null, error: null });
      }),
    );

    renderPage();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "angel@grantpipe.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
    });

    resolvePromise();

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Sending..." })).not.toBeInTheDocument();
    });
  });
});
