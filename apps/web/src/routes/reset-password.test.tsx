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
    resetPassword: vi.fn(),
  },
  signIn: { email: vi.fn(), social: vi.fn() },
  signOut: vi.fn(),
}));

// Mock TanStack Router — useSearch is provided on the route config object
const { mockNavigate, mockRouteUseSearch } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockRouteUseSearch: vi.fn().mockReturnValue({ token: "valid-token-123" }),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    (path: string) => (config: { component: React.ComponentType; validateSearch?: unknown }) => ({
      ...config,
      path,
      useSearch: mockRouteUseSearch,
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
  useNavigate: () => mockNavigate,
}));

import { authClient } from "../lib/auth-client";
import { ResetPasswordPage } from "./reset-password";

const mockResetPassword = vi.mocked(authClient.resetPassword);

function renderPage() {
  render(React.createElement(ResetPasswordPage));
}

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCaptureEvent.mockClear();
    mockCaptureAppException.mockClear();
    mockRouteUseSearch.mockReturnValue({ token: "valid-token-123" });
  });

  it("renders heading Set a new password", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: "Set a new password", level: 1 }),
    ).toBeInTheDocument();
  });

  it("renders new password and confirm password inputs", () => {
    renderPage();
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm password")).toBeInTheDocument();
  });

  it("renders Set password submit button", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Set password" })).toBeInTheDocument();
  });

  it("shows invalid token error state when no token in URL", () => {
    mockRouteUseSearch.mockReturnValue({ token: undefined });
    renderPage();
    expect(screen.getByText(/This reset link is invalid or has expired/)).toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
  });

  it("calls authClient.resetPassword with newPassword and token on submit", async () => {
    mockResetPassword.mockResolvedValue({ data: null, error: null });
    mockRouteUseSearch.mockReturnValue({ token: "tok-abc" });

    renderPage();

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "newpassword123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "newpassword123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    await waitFor(() => {
      expect(mockResetPassword).toHaveBeenCalledWith({
        newPassword: "newpassword123",
        token: "tok-abc",
      });
    });
  });

  it("navigates to /login after successful password reset", async () => {
    mockResetPassword.mockResolvedValue({ data: null, error: null });

    renderPage();

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "newpassword123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "newpassword123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({
        to: "/login",
        search: { reset: "true" },
        replace: true,
      });
    });
  });

  it("shows error when passwords do not match", async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "differentpassword" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Passwords do not match.");
    });

    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  it("shows error when password is shorter than 8 characters", async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "short" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "short" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Password must be at least 8 characters.",
      );
    });

    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  it("shows error alert when resetPassword returns an error", async () => {
    mockResetPassword.mockResolvedValue({
      data: null,
      error: { message: "Token expired" },
    });

    renderPage();

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "newpassword123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "newpassword123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Token expired");
    });
  });

  it("shows fallback error when resetPassword error has no message", async () => {
    mockResetPassword.mockResolvedValue({
      data: null,
      error: { message: undefined },
    });

    renderPage();

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "newpassword123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "newpassword123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "An unexpected error occurred. Please try again.",
      );
    });
  });

  it("shows unexpected error and reports when resetPassword throws", async () => {
    const error = new Error("Network error");
    mockResetPassword.mockRejectedValue(error);

    renderPage();

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "newpassword123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "newpassword123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "An unexpected error occurred. Please try again.",
      );
      expect(mockCaptureAppException).toHaveBeenCalledWith(
        error,
        {
          tags: { source: "auth", feature: "reset-password" },
        },
        { sanitize: true },
      );
    });
  });

  it("disables button while submitting", async () => {
    let resolvePromise!: () => void;
    mockResetPassword.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = () => resolve({ data: null, error: null });
      }),
    );

    renderPage();

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "newpassword123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "newpassword123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Setting password…" })).toBeDisabled();
    });

    resolvePromise();

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Setting password..." })).not.toBeInTheDocument();
    });
  });

  it("fires password_reset_completed on successful reset", async () => {
    mockResetPassword.mockResolvedValue({ data: null, error: null });

    renderPage();

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "newpassword123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "newpassword123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    await waitFor(() => {
      expect(mockCaptureEvent).toHaveBeenCalledWith("password_reset_completed");
    });
  });

  it("fires password_reset_completed before navigating", async () => {
    const order: string[] = [];
    mockResetPassword.mockResolvedValue({ data: null, error: null });
    mockCaptureEvent.mockImplementation(() => {
      order.push("captureEvent");
    });
    mockNavigate.mockImplementation(async () => {
      order.push("navigate");
    });

    renderPage();

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "newpassword123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "newpassword123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    await waitFor(() => {
      expect(order).toContain("navigate");
    });

    expect(order.indexOf("captureEvent")).toBeLessThan(order.indexOf("navigate"));
  });

  it("does NOT fire password_reset_completed on API error", async () => {
    mockResetPassword.mockResolvedValue({
      data: null,
      error: { message: "Token expired" },
    });

    renderPage();

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "newpassword123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "newpassword123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(mockCaptureEvent).not.toHaveBeenCalledWith("password_reset_completed");
  });

  it("renders Request a new reset link button when token is missing", () => {
    mockRouteUseSearch.mockReturnValue({ token: undefined });
    renderPage();
    expect(screen.getByRole("link", { name: "Request a new reset link" })).toBeInTheDocument();
  });
});
