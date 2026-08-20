import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock auth-client before any imports that might use it
vi.mock("../lib/auth-client", () => ({
  signIn: {
    email: vi.fn(),
    social: vi.fn(),
  },
  signOut: vi.fn(),
}));

const mockCaptureEvent = vi.fn();
const mockStorePendingAnalyticsEvents = vi.fn();
vi.mock("../lib/analytics", () => ({
  POSTHOG_PENDING_EVENT_KEY: "posthog_pending_event",
  captureEvent: (...args: unknown[]) => mockCaptureEvent(...args),
  storePendingAnalyticsEvents: (...args: unknown[]) => mockStorePendingAnalyticsEvents(...args),
  appendPendingEventMarker: (callbackURL: string) =>
    callbackURL.includes("?") ? `${callbackURL}&ph_pending=1` : `${callbackURL}?ph_pending=1`,
}));

const mockCaptureAppException = vi.fn();
vi.mock("../lib/sentry", () => ({
  captureAppException: (...args: unknown[]) => mockCaptureAppException(...args),
}));

// Mock TanStack Router — useSearch is provided on the route config object
const { mockNavigate, mockRouteUseSearch } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockRouteUseSearch: vi.fn().mockReturnValue({}),
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
    search,
    children,
    className,
  }: {
    to: string;
    search?: Record<string, string>;
    children: React.ReactNode;
    className?: string;
  }) => {
    const params = search ? `?${new URLSearchParams(search).toString()}` : "";
    return React.createElement("a", { href: `${to}${params}`, className }, children);
  },
  useNavigate: () => mockNavigate,
}));

import { signIn } from "../lib/auth-client";
import { LoginPage } from "./login";

const mockSignIn = vi.mocked(signIn);

function renderLogin() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(React.createElement(QueryClientProvider, { client }, React.createElement(LoginPage)));
  return { client };
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockRouteUseSearch.mockReturnValue({});
  });

  it("calls captureEvent with login_completed and method email after successful email sign-in", async () => {
    mockSignIn.email.mockResolvedValue({ data: { token: "tok-123" }, error: null });

    renderLogin();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "angel@grantpipe.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "supersecret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(mockCaptureEvent).toHaveBeenCalledWith("login_completed", { method: "email" });
    });
  });

  it("does not call captureEvent when email sign-in fails", async () => {
    mockSignIn.email.mockResolvedValue({
      data: null,
      error: { message: "Invalid credentials" },
    });

    renderLogin();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "bad@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrongpass" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Invalid credentials");
    });
    expect(mockCaptureEvent).not.toHaveBeenCalled();
  });

  it("does not call captureEvent when signIn.email throws", async () => {
    mockSignIn.email.mockRejectedValue(new Error("Network error"));

    renderLogin();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "angel@grantpipe.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "supersecret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "An unexpected error occurred. Please try again.",
      );
    });
    expect(mockCaptureEvent).not.toHaveBeenCalled();
  });

  it("stores the pending login_completed event before Google sign-in and does NOT call captureEvent directly", async () => {
    mockSignIn.social.mockResolvedValue({ data: null, error: null });

    renderLogin();

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => {
      expect(mockSignIn.social).toHaveBeenCalled();
    });

    expect(mockStorePendingAnalyticsEvents).toHaveBeenCalledWith({
      event: "login_completed",
      properties: { method: "google" },
    });
    expect(mockCaptureEvent).not.toHaveBeenCalled();
  });

  it("renders email and password input fields", () => {
    renderLogin();

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("renders Sign in submit button", () => {
    renderLogin();

    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("renders Continue with Google button", () => {
    renderLogin();

    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
  });

  it("renders link to signup page with text Create an account", () => {
    renderLogin();

    const link = screen.getByRole("link", { name: "Create an account" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/signup");
  });

  it("calls signIn.email on form submit with correct email and password", async () => {
    mockSignIn.email.mockResolvedValue({ data: { token: "tok-123" }, error: null });

    renderLogin();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "angel@grantpipe.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "supersecret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(mockSignIn.email).toHaveBeenCalledWith({
        email: "angel@grantpipe.com",
        password: "supersecret",
        callbackURL: "/app/dashboard",
      });
    });
  });

  it("preserves invite tokens through email sign-in", async () => {
    mockRouteUseSearch.mockReturnValue({ invite: "invite-token-1" });
    mockSignIn.email.mockResolvedValue({ data: { token: "tok-123" }, error: null });

    renderLogin();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "angel@grantpipe.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "supersecret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(mockSignIn.email).toHaveBeenCalledWith({
        email: "angel@grantpipe.com",
        password: "supersecret",
        callbackURL: "/app/invite/invite-token-1",
      });
    });
  });

  it("shows error message when sign in fails", async () => {
    mockSignIn.email.mockResolvedValue({
      data: null,
      error: { message: "Invalid credentials" },
    });

    renderLogin();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "bad@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrongpass" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Invalid credentials");
    });
  });

  it("shows fallback error message when signIn.email error has no message", async () => {
    mockSignIn.email.mockResolvedValue({
      data: null,
      error: { message: undefined },
    });

    renderLogin();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "bad@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrongpass" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Sign in failed. Please try again.");
    });
  });

  it("shows unexpected error message when signIn.email throws", async () => {
    mockSignIn.email.mockRejectedValue(new Error("Network error"));

    renderLogin();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "angel@grantpipe.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "supersecret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "An unexpected error occurred. Please try again.",
      );
    });
  });

  it("calls signIn.social with google provider when Google button clicked", async () => {
    mockSignIn.social.mockResolvedValue({ data: null, error: null });

    renderLogin();

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => {
      expect(mockSignIn.social).toHaveBeenCalledWith({
        provider: "google",
        callbackURL: "/app/dashboard?ph_pending=1",
      });
    });
  });

  it("preserves invite tokens through Google sign-in", async () => {
    mockRouteUseSearch.mockReturnValue({ invite: "invite-token-1" });
    mockSignIn.social.mockResolvedValue({ data: null, error: null });

    renderLogin();

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => {
      expect(mockSignIn.social).toHaveBeenCalledWith({
        provider: "google",
        callbackURL: "/app/invite/invite-token-1?ph_pending=1",
      });
    });
  });

  it("renders H1 heading Welcome back", () => {
    renderLogin();

    expect(screen.getByRole("heading", { name: "Welcome back", level: 1 })).toBeInTheDocument();
  });

  it("renders Forgot password? link pointing to /forgot-password", () => {
    renderLogin();

    const link = screen.getByRole("link", { name: "Forgot password?" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/forgot-password");
  });

  it("shows password updated success alert when reset=true in search params", () => {
    mockRouteUseSearch.mockReturnValue({ reset: "true" });
    renderLogin();

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent("Password updated");
    expect(alert).toHaveTextContent(
      "Your password has been updated. Sign in with your new password.",
    );
  });

  it("does not show password updated alert when reset param is absent", () => {
    mockRouteUseSearch.mockReturnValue({});
    renderLogin();

    expect(screen.queryByText("Password updated")).not.toBeInTheDocument();
  });

  it("password show/hide toggle changes input type between password and text", () => {
    renderLogin();

    const passwordInput = screen.getByLabelText("Password");
    expect(passwordInput).toHaveAttribute("type", "password");

    const showBtn = screen.getByRole("button", { name: "Show password" });
    fireEvent.click(showBtn);

    expect(passwordInput).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(passwordInput).toHaveAttribute("type", "password");
  });

  it("shows inline email error on blur when email format is invalid", async () => {
    renderLogin();

    const emailInput = screen.getByLabelText("Email");
    fireEvent.change(emailInput, { target: { value: "notanemail" } });
    fireEvent.blur(emailInput);

    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
  });

  it("clears the inline email error on blur once the email becomes valid", async () => {
    renderLogin();

    const emailInput = screen.getByLabelText("Email");
    fireEvent.change(emailInput, { target: { value: "notanemail" } });
    fireEvent.blur(emailInput);
    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();

    fireEvent.change(emailInput, { target: { value: "founder@example.org" } });
    fireEvent.blur(emailInput);

    await waitFor(() =>
      expect(screen.queryByText("Enter a valid email address.")).not.toBeInTheDocument(),
    );
  });

  it("shows inline password error on blur when password is too short", async () => {
    renderLogin();

    const passwordInput = screen.getByLabelText("Password");
    fireEvent.change(passwordInput, { target: { value: "abc" } });
    fireEvent.blur(passwordInput);

    expect(await screen.findAllByText("Password must be at least 8 characters.")).not.toHaveLength(
      0,
    );
  });

  it("clears the inline password error on blur once the password is long enough", async () => {
    renderLogin();

    const passwordInput = screen.getByLabelText("Password");
    fireEvent.change(passwordInput, { target: { value: "abc" } });
    fireEvent.blur(passwordInput);
    expect(await screen.findAllByText("Password must be at least 8 characters.")).not.toHaveLength(
      0,
    );

    fireEvent.change(passwordInput, { target: { value: "longenoughpassword" } });
    fireEvent.blur(passwordInput);

    await waitFor(() =>
      expect(screen.queryByText("Password must be at least 8 characters.")).not.toBeInTheDocument(),
    );
  });

  it("calls captureAppException with correct tags when signIn.email throws", async () => {
    const boom = new Error("Network error");
    mockSignIn.email.mockRejectedValue(boom);

    renderLogin();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "angel@grantpipe.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "supersecret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "An unexpected error occurred. Please try again.",
      );
    });
    expect(mockCaptureAppException).toHaveBeenCalledWith(boom, {
      tags: { source: "login", feature: "email-login" },
    });
  });

  it("wraps a non-Error thrown value in an Error for captureAppException", async () => {
    mockSignIn.email.mockRejectedValue("string error");

    renderLogin();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "angel@grantpipe.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "supersecret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "An unexpected error occurred. Please try again.",
      );
    });
    expect(mockCaptureAppException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { source: "login", feature: "email-login" },
    });
  });
});
