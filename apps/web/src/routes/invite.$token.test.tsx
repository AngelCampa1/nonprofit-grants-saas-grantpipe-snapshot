import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

const { mockAcceptInvite, mockValidateToken, mockCaptureEvent, mockInvalidateQueries } = vi.hoisted(
  () => ({
    mockAcceptInvite: vi.fn(),
    mockValidateToken: vi.fn(),
    mockCaptureEvent: vi.fn(),
    mockInvalidateQueries: vi.fn(),
  }),
);

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

vi.mock("../lib/analytics", () => ({
  captureEvent: (...args: unknown[]) => mockCaptureEvent(...args),
}));

const mockUseSession = vi.fn();
vi.mock("../hooks/use-session", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../lib/api-client", () => ({
  api: {
    api: {
      auth: {
        invites: {
          ":token": {
            $get: (...args: unknown[]) => mockValidateToken(...args),
            accept: {
              $post: (...args: unknown[]) => mockAcceptInvite(...args),
            },
          },
        },
      },
    },
  },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
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
  useParams: () => ({ token: "test-invite-token" }),
}));

import { InvitePage } from "./invite.$token";

describe("InvitePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateToken.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    mockAcceptInvite.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
  });

  it("renders the invite heading", async () => {
    mockUseSession.mockReturnValue({ user: null, isLoading: false });

    render(React.createElement(InvitePage));

    expect(await screen.findByRole("heading", { name: "You've been invited" })).toBeInTheDocument();
  });

  it("shows signup and login links when not authenticated", async () => {
    mockUseSession.mockReturnValue({ user: null, isLoading: false });

    render(React.createElement(InvitePage));

    const signupLink = await screen.findByRole("link", { name: "Sign up" });
    expect(signupLink).toBeInTheDocument();
    expect(signupLink).toHaveAttribute("href", "/signup?invite=test-invite-token");

    const loginLink = screen.getByRole("link", { name: "Sign in" });
    expect(loginLink).toBeInTheDocument();
    expect(loginLink).toHaveAttribute("href", "/login?invite=test-invite-token");
  });

  it("shows Accept invite button when user is authenticated", async () => {
    mockUseSession.mockReturnValue({
      user: { id: "user-1", name: "Angel Campa", email: "angel@grantpipe.com" },
      isLoading: false,
    });

    render(React.createElement(InvitePage));

    expect(await screen.findByRole("button", { name: "Accept invite" })).toBeInTheDocument();
  });

  it("does not show signup/login links when authenticated", async () => {
    mockUseSession.mockReturnValue({
      user: { id: "user-1", name: "Angel Campa", email: "angel@grantpipe.com" },
      isLoading: false,
    });

    render(React.createElement(InvitePage));

    // Wait for token validation to complete (Accept invite button appears)
    await screen.findByRole("button", { name: "Accept invite" });

    expect(screen.queryByRole("link", { name: "Sign up" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
  });

  it("accepts invite through the typed auth client and shows success", async () => {
    mockUseSession.mockReturnValue({
      user: { id: "user-1", name: "Angel Campa", email: "angel@grantpipe.com" },
      isLoading: false,
    });

    render(React.createElement(InvitePage));

    fireEvent.click(await screen.findByRole("button", { name: "Accept invite" }));

    await waitFor(() => {
      expect(screen.getByText(/Invite accepted/)).toBeInTheDocument();
    });

    expect(mockAcceptInvite).toHaveBeenCalledWith({
      param: { token: "test-invite-token" },
    });
    expect(screen.getByRole("link", { name: "Continue to dashboard" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("refreshes session and org context after successful acceptance", async () => {
    mockUseSession.mockReturnValue({
      user: { id: "user-1", name: "Angel Campa", email: "angel@grantpipe.com" },
      isLoading: false,
    });

    render(React.createElement(InvitePage));

    fireEvent.click(await screen.findByRole("button", { name: "Accept invite" }));

    await waitFor(() => {
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["auth-session-context"],
      });
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["org-profile"] });
  });

  it("shows error message when invite acceptance fails with message", async () => {
    mockUseSession.mockReturnValue({
      user: { id: "user-1", name: "Angel Campa", email: "angel@grantpipe.com" },
      isLoading: false,
    });
    mockAcceptInvite.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Invite expired" }), { status: 400 }),
    );

    render(React.createElement(InvitePage));

    fireEvent.click(await screen.findByRole("button", { name: "Accept invite" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Invite expired");
    });
  });

  it("shows fallback error when invite acceptance fails without message", async () => {
    mockUseSession.mockReturnValue({
      user: { id: "user-1", name: "Angel Campa", email: "angel@grantpipe.com" },
      isLoading: false,
    });
    mockAcceptInvite.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 400 }));

    render(React.createElement(InvitePage));

    fireEvent.click(await screen.findByRole("button", { name: "Accept invite" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Unable to accept invite. Please try again.",
      );
    });
  });

  it("shows fallback error when an invalid json error response is returned", async () => {
    mockUseSession.mockReturnValue({
      user: { id: "user-1", name: "Angel Campa", email: "angel@grantpipe.com" },
      isLoading: false,
    });
    mockAcceptInvite.mockResolvedValueOnce(
      new Response("not-json", {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );

    render(React.createElement(InvitePage));

    fireEvent.click(await screen.findByRole("button", { name: "Accept invite" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Unable to accept invite. Please try again.",
      );
    });
  });

  it("shows an explicit error field from the invite response", async () => {
    mockUseSession.mockReturnValue({
      user: { id: "user-1", name: "Angel Campa", email: "angel@grantpipe.com" },
      isLoading: false,
    });
    mockAcceptInvite.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Access denied" }), { status: 400 }),
    );

    render(React.createElement(InvitePage));

    fireEvent.click(await screen.findByRole("button", { name: "Accept invite" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Access denied");
    });
  });

  it("shows unexpected error when invite acceptance throws", async () => {
    mockUseSession.mockReturnValue({
      user: { id: "user-1", name: "Angel Campa", email: "angel@grantpipe.com" },
      isLoading: false,
    });
    mockAcceptInvite.mockRejectedValueOnce(new Error("Network error"));

    render(React.createElement(InvitePage));

    fireEvent.click(await screen.findByRole("button", { name: "Accept invite" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Network error");
    });
  });

  it("shows the invalid invite screen when token validation returns a non-ok response", async () => {
    mockUseSession.mockReturnValue({ user: null, isLoading: false });
    mockValidateToken.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Invite expired" }), { status: 400 }),
    );

    render(React.createElement(InvitePage));

    expect(await screen.findByRole("heading", { name: "Invalid invite" })).toBeInTheDocument();
    expect(screen.getByText("Invite expired")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute("href", "/login");
  });

  it("falls back to a generic message when invalid invite has no message field", async () => {
    mockUseSession.mockReturnValue({ user: null, isLoading: false });
    mockValidateToken.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 400 }));

    render(React.createElement(InvitePage));

    expect(await screen.findByRole("heading", { name: "Invalid invite" })).toBeInTheDocument();
    expect(screen.getByText("This invite link is invalid.")).toBeInTheDocument();
  });

  it("shows a verification error when the token validation request throws", async () => {
    mockUseSession.mockReturnValue({ user: null, isLoading: false });
    mockValidateToken.mockRejectedValueOnce(new Error("network"));

    render(React.createElement(InvitePage));

    expect(await screen.findByRole("heading", { name: "Invalid invite" })).toBeInTheDocument();
    expect(screen.getByText("Unable to verify this invite link.")).toBeInTheDocument();
  });

  it("calls captureEvent with invite_accepted after successful acceptance", async () => {
    mockUseSession.mockReturnValue({
      user: { id: "user-1", name: "Angel Campa", email: "angel@grantpipe.com" },
      isLoading: false,
    });

    render(React.createElement(InvitePage));

    fireEvent.click(await screen.findByRole("button", { name: "Accept invite" }));

    await waitFor(() => {
      expect(mockCaptureEvent).toHaveBeenCalledWith("invite_accepted");
    });
  });

  it("does not call captureEvent when invite acceptance fails", async () => {
    mockUseSession.mockReturnValue({
      user: { id: "user-1", name: "Angel Campa", email: "angel@grantpipe.com" },
      isLoading: false,
    });
    mockAcceptInvite.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Invite expired" }), { status: 400 }),
    );

    render(React.createElement(InvitePage));

    fireEvent.click(await screen.findByRole("button", { name: "Accept invite" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Invite expired");
    });
    expect(mockCaptureEvent).not.toHaveBeenCalled();
  });

  it("does not call captureEvent when invite acceptance throws", async () => {
    mockUseSession.mockReturnValue({
      user: { id: "user-1", name: "Angel Campa", email: "angel@grantpipe.com" },
      isLoading: false,
    });
    mockAcceptInvite.mockRejectedValueOnce(new Error("Network error"));

    render(React.createElement(InvitePage));

    fireEvent.click(await screen.findByRole("button", { name: "Accept invite" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Network error");
    });
    expect(mockCaptureEvent).not.toHaveBeenCalled();
  });

  it("shows the generic unexpected error when the thrown value is not an Error", async () => {
    mockUseSession.mockReturnValue({
      user: { id: "user-1", name: "Angel Campa", email: "angel@grantpipe.com" },
      isLoading: false,
    });
    mockAcceptInvite.mockRejectedValueOnce("boom");

    render(React.createElement(InvitePage));

    fireEvent.click(await screen.findByRole("button", { name: "Accept invite" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "An unexpected error occurred. Please try again.",
      );
    });
  });
});
