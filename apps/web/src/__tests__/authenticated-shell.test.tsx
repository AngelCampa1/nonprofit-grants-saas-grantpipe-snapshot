import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { mockNavigate, mockSignInEmail, mockSignInSocial, sessionState } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockSignInEmail: vi.fn(),
  mockSignInSocial: vi.fn(),
  sessionState: {
    isLoading: false,
    user: { id: "user-1", email: "user@example.com" } as { id: string; email: string } | null,
  },
}));

const sessionDefaults = {
  isLoading: false,
  user: { id: "user-1", email: "user@example.com" },
};

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    useSearch: vi.fn().mockReturnValue({}),
  }),
  createRootRoute: () => (config: Record<string, unknown>) => config,
  Link: ({
    children,
    to,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  Outlet: () => <div data-testid="outlet" />,
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: "/dashboard" }),
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: "/dashboard" } }),
}));

vi.mock("../hooks/use-session", () => ({
  useSession: () => sessionState,
}));

vi.mock("../hooks/use-org-settings", () => ({
  useBillingCheckoutMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
  useUserMemberships: () => ({ data: undefined }),
  useOrgBilling: () => ({
    data: { subscriptionId: "sub_test", planTier: "growth", status: "active" },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("../lib/auth-client", () => ({
  signIn: {
    email: mockSignInEmail,
    social: mockSignInSocial,
  },
}));

vi.mock("../lib/analytics", () => ({
  POSTHOG_PENDING_EVENT_KEY: "posthog_pending_event",
  identifyUser: vi.fn(),
  resetAnalytics: vi.fn(),
  captureEvent: vi.fn(),
  consumePendingAnalyticsEvents: vi.fn(() => []),
  storePendingAnalyticsEvents: vi.fn(),
  clearPendingAnalyticsEvents: vi.fn(),
  appendPendingEventMarker: (callbackURL: string) =>
    callbackURL.includes("?") ? `${callbackURL}&ph_pending=1` : `${callbackURL}?ph_pending=1`,
}));
vi.mock("../components/trial-banner", () => ({
  TrialBanner: () => null,
}));
vi.mock("../components/feedback-widget", () => ({
  FeedbackWidget: () => null,
}));
vi.mock("../components/ai-cs-support-widget", () => ({
  AiCsSupportWidget: () => <div data-testid="ai-cs-widget" />,
}));
vi.mock("../components/shell/notification-bell", () => ({
  NotificationBell: () => null,
}));
vi.mock("../components/sample-data-banner", () => ({
  SampleDataBanner: () => null,
}));
vi.mock("../main", () => ({
  queryClient: { clear: vi.fn() },
}));

import { Route as AuthenticatedRoute } from "../routes/_authenticated";
import { LoginPage } from "../routes/login";

const AuthenticatedLayout = (AuthenticatedRoute as unknown as { component: React.ComponentType })
  .component as React.ComponentType;

function renderLogin() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <LoginPage />
      </QueryClientProvider>,
    ),
  };
}

describe("AuthenticatedLayout", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    sessionState.isLoading = sessionDefaults.isLoading;
    sessionState.user = sessionDefaults.user;
  });

  it("shows a skeleton shell while the session is resolving", () => {
    sessionState.isLoading = true;
    sessionState.user = null;

    render(<AuthenticatedLayout />);

    expect(document.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThan(0);
  });

  it("redirects to login when no user is present", async () => {
    sessionState.user = null;

    const { container } = render(<AuthenticatedLayout />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/login" });
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the authenticated navigation when a user is present", async () => {
    render(<AuthenticatedLayout />);

    expect(screen.getByRole("link", { name: "Donors" })).toHaveAttribute("href", "/donors");
    expect(screen.getByRole("link", { name: "Grants" })).toHaveAttribute("href", "/grants");
    expect(screen.getByRole("link", { name: "Funds" })).toHaveAttribute("href", "/funds");
    expect(screen.getByRole("link", { name: "Reports" })).toHaveAttribute("href", "/reports");
    expect(await screen.findByTestId("ai-cs-widget")).toBeInTheDocument();
    expect(screen.getByTestId("outlet")).toBeInTheDocument();
  });
});

describe("LoginPage", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockSignInEmail.mockReset();
    mockSignInSocial.mockReset();
  });

  it("submits credentials and delegates redirect to Better Auth callbackURL", async () => {
    mockSignInEmail.mockResolvedValue({ error: null });

    const { client } = renderLogin();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "finance@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "super-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(mockSignInEmail).toHaveBeenCalledWith({
        email: "finance@example.com",
        password: "super-secret",
        callbackURL: "/app/dashboard",
      });
    });

    // Better Auth's callbackURL performs the browser navigation; the component
    // just needs to drop any cached session context so the new session loads.
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["auth-session-context"] });
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("renders an auth error from Better Auth", async () => {
    mockSignInEmail.mockResolvedValue({
      error: { message: "Invalid credentials." },
    });

    renderLogin();

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "finance@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid credentials.");
  });

  it("renders the fallback auth error message when Better Auth omits one", async () => {
    mockSignInEmail.mockResolvedValue({
      error: {},
    });

    renderLogin();

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "finance@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Sign in failed. Please try again.");
  });

  it("renders a generic error when sign in throws", async () => {
    mockSignInEmail.mockRejectedValue(new Error("network down"));

    renderLogin();

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "finance@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "super-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "An unexpected error occurred. Please try again.",
    );
  });

  it("starts Google sign in from the secondary action", async () => {
    mockSignInSocial.mockResolvedValue(undefined);

    renderLogin();

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => {
      expect(mockSignInSocial).toHaveBeenCalledWith({
        provider: "google",
        callbackURL: "/app/dashboard?ph_pending=1",
      });
    });
  });
});
