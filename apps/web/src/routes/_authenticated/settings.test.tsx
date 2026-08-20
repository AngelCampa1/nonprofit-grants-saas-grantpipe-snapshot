import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

const {
  mockUseSession,
  mockUseOrgProfile,
  mockUseOrgTeam,
  mockUseOrgBilling,
  mockUseOrgDebugData,
  mockUseOrgSettingsMutations,
  mockRouteUseSearch,
  mockUseLocation,
  mockUseNavigate,
  mockDeleteAccount,
  mockSignOut,
  mockCaptureAppException,
} = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseOrgProfile: vi.fn(),
  mockUseOrgTeam: vi.fn(),
  mockUseOrgBilling: vi.fn(),
  mockUseOrgDebugData: vi.fn(),
  mockUseOrgSettingsMutations: vi.fn(),
  mockRouteUseSearch: vi.fn().mockReturnValue({}),
  mockUseLocation: vi.fn().mockReturnValue({ pathname: "/settings" }),
  mockUseNavigate: vi.fn(),
  mockDeleteAccount: vi.fn(),
  mockSignOut: vi.fn(),
  mockCaptureAppException: vi.fn(),
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
    hash,
    children,
    className,
    ...props
  }: {
    to: string;
    hash?: string;
    children: React.ReactNode;
    className?: string;
  }) =>
    React.createElement(
      "a",
      { href: `${to}${hash ? `#${hash}` : ""}`, className, ...props },
      children,
    ),
  Outlet: () => React.createElement("div", { "data-testid": "settings-child-outlet" }),
  useLocation: () => mockUseLocation(),
  useNavigate: () => mockUseNavigate,
}));

vi.mock("../../lib/api-client", () => ({
  api: {
    api: {
      auth: {
        account: {
          $delete: (...args: unknown[]) => mockDeleteAccount(...args),
        },
      },
    },
  },
}));

vi.mock("../../lib/auth-client", () => ({
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

vi.mock("../../lib/sentry", () => ({
  captureAppException: (...args: unknown[]) => mockCaptureAppException(...args),
}));

vi.mock("../../hooks/use-session", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../../hooks/use-org-settings", () => ({
  useOrgProfile: () => mockUseOrgProfile(),
  useOrgTeam: () => mockUseOrgTeam(),
  useOrgBilling: () => mockUseOrgBilling(),
  useOrgDebugData: () => mockUseOrgDebugData(),
  useOrgSettingsMutations: () => mockUseOrgSettingsMutations(),
}));

vi.mock("../../hooks/use-trial-feature-usage", () => ({
  useTrialFeatureUsage: () => ({
    data: { highestTier: null, tiersUsed: [] },
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

vi.mock("../../components/custom-fields-settings-section", () => ({
  CustomFieldsSettingsSection: () =>
    React.createElement("div", { "data-testid": "custom-fields-settings" }, "custom fields"),
}));

vi.mock("../../components/confirm-dialog", () => ({
  ConfirmDialog: ({
    open,
    onConfirm,
    confirmLabel = "Confirm",
    isPending,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    confirmLabel?: string;
    onConfirm: () => void;
    isPending?: boolean;
  }) =>
    open
      ? React.createElement(
          "div",
          { role: "dialog" },
          React.createElement("button", { onClick: onConfirm, disabled: isPending }, confirmLabel),
        )
      : null,
}));

import {
  SettingsPage,
  SettingsRoute,
  getDeleteAccountConfirmationError,
  getHashSection,
  getRouteSection,
  isAllowedBillingUrl,
  settingsSearchSchema,
} from "./settings";

describe("settings source contracts", () => {
  it("does not contain inline team JSX block", () => {
    const source = readFileSync(
      join(process.cwd(), "src/routes/_authenticated/settings.tsx"),
      "utf8",
    );

    // The inline team section heading should not exist in settings.tsx
    expect(source).not.toContain('id="team"');
    // The canonical route link still uses /settings/team
    expect(source).toContain("/settings/team");
  });

  it("keeps direct plan-selection search params available to billing", () => {
    expect(
      settingsSearchSchema.parse({
        checkout: "success",
        plan: "growth",
        cycle: "monthly",
        promo: "M80OFF",
      }),
    ).toEqual({
      checkout: "success",
      plan: "growth",
      cycle: "monthly",
      promo: "M80OFF",
    });
  });
});

describe("settings route helpers", () => {
  it("normalizes supported route sections", () => {
    expect(getRouteSection("/settings/team/")).toBe("team");
    expect(getRouteSection("/settings/entities")).toBe("entities");
    expect(getRouteSection("")).toBeNull();
  });

  it("validates destructive account deletion confirmation text", () => {
    expect(getDeleteAccountConfirmationError("delete")).toBe(
      "Type DELETE to confirm account deletion.",
    );
    expect(getDeleteAccountConfirmationError("DELETE")).toBeNull();
  });

  it("returns an empty hash section outside the browser", () => {
    const originalWindow = globalThis.window;

    try {
      vi.stubGlobal("window", undefined);

      expect(getHashSection()).toBe("");
    } finally {
      vi.stubGlobal("window", originalWindow);
    }
  });
});

describe("SettingsRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/settings");
    mockUseLocation.mockReturnValue({ pathname: "/settings" });
    mockUseNavigate.mockReturnValue(undefined);
    mockDeleteAccount.mockResolvedValue(new Response(JSON.stringify({ status: "deleted" })));
    mockSignOut.mockResolvedValue(undefined);
    mockRouteUseSearch.mockReturnValue({});
    mockUseSession.mockReturnValue({ memberRole: "admin" });
    mockUseOrgProfile.mockReturnValue({
      data: {
        name: "GrantPipe Foundation",
        timezone: "America/New_York",
        fiscalYearStartMonth: 1,
        ein: null,
        logoUrl: null,
        address: null,
      },
      isLoading: false,
      isError: false,
      error: null,
    });
    mockUseOrgTeam.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    });
    mockUseOrgBilling.mockReturnValue({
      data: {
        planTier: "starter",
        billingCycle: "monthly",
        status: "trialing",
        trialEndsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      },
      isLoading: false,
      isError: false,
      error: null,
    });
    mockUseOrgDebugData.mockReturnValue({
      emails: { data: { total: 0 }, isLoading: false, isError: false, error: null },
      storage: { data: { total: 0 }, isLoading: false, isError: false, error: null },
      billing: { data: { total: 0 }, isLoading: false, isError: false, error: null },
      analytics: { data: { total: 0 }, isLoading: false, isError: false, error: null },
      errors: { data: { total: 0 }, isLoading: false, isError: false, error: null },
    });
    mockUseOrgSettingsMutations.mockReturnValue({
      updateProfile: { mutateAsync: vi.fn(), isPending: false },
      saveBillingSelection: { mutateAsync: vi.fn(), isPending: false },
      startCheckout: { mutateAsync: vi.fn(), isPending: false },
      openPortal: { mutateAsync: vi.fn(), isPending: false },
    });
  });

  it("renders the settings index page for /settings", () => {
    render(React.createElement(SettingsRoute));

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.queryByTestId("settings-child-outlet")).not.toBeInTheDocument();
  });

  it("renders child settings routes inside the settings shell", () => {
    mockUseLocation.mockReturnValue({ pathname: "/settings/team" });

    render(React.createElement(SettingsRoute));

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Settings sections" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Team" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("settings-child-outlet")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Organization profile" })).not.toBeInTheDocument();
  });

  it("marks portal access active when rendering the child route shell", () => {
    mockUseLocation.mockReturnValue({ pathname: "/settings/portal-access" });

    render(React.createElement(SettingsRoute));

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Settings sections" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Portal access" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByTestId("settings-child-outlet")).toBeInTheDocument();
  });

  it("keeps the shared shell for the billing child route", () => {
    mockUseLocation.mockReturnValue({ pathname: "/settings/billing" });

    render(React.createElement(SettingsRoute));

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Billing" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("settings-child-outlet")).toBeInTheDocument();
  });

  it("does not render hash panels behind child route content", () => {
    window.history.replaceState(null, "", "/settings/team#billing");
    mockUseLocation.mockReturnValue({ pathname: "/settings/team", hash: "billing" });

    render(React.createElement(SettingsRoute));

    expect(screen.getByTestId("settings-child-outlet")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Billing" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("custom-fields-settings")).not.toBeInTheDocument();
  });

  it("keeps restricted settings links hidden for non-admin child routes", () => {
    mockUseSession.mockReturnValue({ memberRole: "viewer" });
    mockUseLocation.mockReturnValue({ pathname: "/settings/team" });

    render(React.createElement(SettingsRoute));

    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    expect(nav.querySelector("a[href='/settings#organization']")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Team" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Portal access" })).not.toBeInTheDocument();
    expect(screen.getByTestId("settings-child-outlet")).toBeInTheDocument();
  });
});

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    window.history.replaceState(null, "", "/settings");
    mockUseLocation.mockReturnValue({ pathname: "/settings" });
    mockUseNavigate.mockReturnValue(undefined);
    mockDeleteAccount.mockResolvedValue(new Response(JSON.stringify({ status: "deleted" })));
    mockSignOut.mockResolvedValue(undefined);
    mockRouteUseSearch.mockReturnValue({});
    mockUseSession.mockReturnValue({ memberRole: "admin" });
    mockUseOrgProfile.mockReturnValue({
      data: {
        name: "GrantPipe Foundation",
        timezone: "America/New_York",
        fiscalYearStartMonth: 1,
        ein: null,
        logoUrl: null,
        address: null,
      },
      isLoading: false,
      isError: false,
      error: null,
    });
    mockUseOrgTeam.mockReturnValue({
      data: [{ id: "member-1", role: "viewer", user: { name: "Angel Campa" } }],
      isLoading: false,
      isError: false,
      error: null,
    });
    mockUseOrgBilling.mockReturnValue({
      data: {
        planTier: "starter",
        billingCycle: "monthly",
        status: "trialing",
        trialEndsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      },
      isLoading: false,
      isError: false,
      error: null,
    });
    mockUseOrgDebugData.mockReturnValue({
      emails: { data: { total: 1 }, isLoading: false, isError: false, error: null },
      storage: { data: { total: 2 }, isLoading: false, isError: false, error: null },
      billing: { data: { total: 3 }, isLoading: false, isError: false, error: null },
      analytics: { data: { total: 4 }, isLoading: false, isError: false, error: null },
      errors: { data: { total: 5 }, isLoading: false, isError: false, error: null },
    });
    mockUseOrgSettingsMutations.mockReturnValue({
      updateProfile: { mutateAsync: vi.fn(), isPending: false },
      saveBillingSelection: { mutateAsync: vi.fn(), isPending: false },
      startCheckout: { mutateAsync: vi.fn(), isPending: false },
      openPortal: { mutateAsync: vi.fn(), isPending: false },
    });
  });

  it("redirects to /settings/team when hash is #team and no routeSection", async () => {
    window.history.replaceState(null, "", "/settings#team");
    mockUseLocation.mockReturnValue({ pathname: "/settings", hash: "team" });

    render(React.createElement(SettingsPage));

    await waitFor(() => {
      expect(mockUseNavigate).toHaveBeenCalledWith({ to: "/settings/team", replace: true });
    });
  });

  it("does not redirect when activeSection is organization (non-team path)", () => {
    window.history.replaceState(null, "", "/settings");
    mockUseLocation.mockReturnValue({ pathname: "/settings", hash: "" });

    render(React.createElement(SettingsPage));

    expect(mockUseNavigate).not.toHaveBeenCalledWith({ to: "/settings/team", replace: true });
  });

  it("does not redirect when already on the /settings/team route", () => {
    mockUseLocation.mockReturnValue({ pathname: "/settings/team" });

    render(React.createElement(SettingsPage));

    expect(mockUseNavigate).not.toHaveBeenCalledWith({ to: "/settings/team", replace: true });
  });

  it("renders organization as the default settings panel", () => {
    render(React.createElement(SettingsPage));

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Organization profile" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Delete account" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Team" })).not.toBeInTheDocument();
    const removedPanelName = ["Refer", "& earn"].join(" ");
    expect(screen.queryByRole("heading", { name: removedPanelName })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Billing" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("custom-fields-settings")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /open portal/i })).not.toBeInTheDocument();
  });

  it("keeps account deletion disabled until exact confirmation is entered", () => {
    render(React.createElement(SettingsPage));

    const deleteButton = screen.getByRole("button", { name: "Delete account" });
    expect(deleteButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), {
      target: { value: "delete" },
    });
    expect(deleteButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), {
      target: { value: "DELETE" },
    });
    expect(deleteButton).toBeEnabled();
  });

  it("deletes the account, signs out, and redirects to login", async () => {
    render(React.createElement(SettingsPage));

    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), {
      target: { value: "DELETE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));

    await waitFor(() => {
      expect(mockDeleteAccount).toHaveBeenCalledWith({ json: { confirmation: "DELETE" } });
      expect(mockSignOut).toHaveBeenCalledOnce();
      expect(mockUseNavigate).toHaveBeenCalledWith({ to: "/login", replace: true });
    });
  });

  it("shows account deletion API errors without signing out", async () => {
    mockDeleteAccount.mockResolvedValue(
      new Response(JSON.stringify({ message: "This account is linked to activity log." }), {
        status: 400,
      }),
    );

    render(React.createElement(SettingsPage));

    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), {
      target: { value: "DELETE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));

    await waitFor(() => {
      expect(screen.getByText("This account is linked to activity log.")).toBeInTheDocument();
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(mockUseNavigate).not.toHaveBeenCalledWith({ to: "/login", replace: true });
    });
    expect(mockCaptureAppException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: {
          feature: "account_settings",
          operation: "delete_account",
        },
      }),
      { sanitize: true },
    );
    expect(JSON.stringify(mockCaptureAppException.mock.calls)).not.toContain("DELETE");
  });

  it("falls back to the generic account deletion error when the API body is not JSON", async () => {
    mockDeleteAccount.mockResolvedValue(new Response("not json", { status: 500 }));

    render(React.createElement(SettingsPage));

    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), {
      target: { value: "DELETE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));

    expect(
      await screen.findByText("Account deletion failed. Please contact support."),
    ).toBeInTheDocument();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("falls back to organization settings for the removed incentive hash", () => {
    const removedHash = ["refer", "rals"].join("");
    const removedPanelName = ["Refer", "& earn"].join(" ");
    window.history.replaceState(null, "", `/settings#${removedHash}`);

    render(React.createElement(SettingsPage));

    expect(screen.getByRole("heading", { name: "Organization profile" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: removedPanelName })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: removedPanelName })).not.toBeInTheDocument();
  });

  it("saves organization profile edits with profile defaults", async () => {
    render(React.createElement(SettingsPage));

    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "GrantPipe Community Fund" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    const mutations = mockUseOrgSettingsMutations.mock.results[0]?.value;

    await waitFor(() => {
      expect(mutations.updateProfile.mutateAsync).toHaveBeenCalledWith({
        name: "GrantPipe Community Fund",
        fiscalYearStartMonth: 1,
        timezone: "America/New_York",
        ein: null,
        logoUrl: null,
        address: null,
      });
      expect(screen.getByText("Organization profile saved.")).toBeInTheDocument();
    });
  });

  it("saves fallback profile fields and custom timezone values", async () => {
    mockUseOrgProfile.mockReturnValue({
      data: {
        name: "GrantPipe Foundation",
        timezone: "America/GrantPipe",
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    render(React.createElement(SettingsPage));

    expect(screen.getByText("America/GrantPipe")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    const mutations = mockUseOrgSettingsMutations.mock.results[0]?.value;

    await waitFor(() => {
      expect(mutations.updateProfile.mutateAsync).toHaveBeenCalledWith({
        name: "GrantPipe Foundation",
        fiscalYearStartMonth: 1,
        timezone: "America/GrantPipe",
        ein: null,
        logoUrl: null,
        address: null,
      });
    });
  });

  it("shows profile mutation errors and clears them when the input changes", async () => {
    const updateProfile = vi.fn().mockRejectedValue("not an error instance");
    mockUseOrgSettingsMutations.mockReturnValue({
      updateProfile: { mutateAsync: updateProfile, isPending: false },
      saveBillingSelection: { mutateAsync: vi.fn(), isPending: false },
      startCheckout: { mutateAsync: vi.fn(), isPending: false },
      openPortal: { mutateAsync: vi.fn(), isPending: false },
    });

    render(React.createElement(SettingsPage));

    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => {
      expect(screen.getByText("Something went wrong. Please try again.")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "GrantPipe Community Fund" },
    });

    expect(screen.queryByText("Something went wrong. Please try again.")).not.toBeInTheDocument();
  });

  it("switches visible settings panels when the section navigation is clicked", () => {
    render(React.createElement(SettingsPage));

    fireEvent.click(screen.getByRole("link", { name: "Custom fields" }));

    expect(screen.getByTestId("custom-fields-settings")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Organization profile" })).not.toBeInTheDocument();
  });

  it("renders billing as a settings panel from the billing hash", () => {
    window.history.replaceState(null, "", "/settings#billing");

    render(React.createElement(SettingsPage));

    expect(screen.getByRole("heading", { name: "Billing" })).toBeInTheDocument();
    expect(screen.getByText("You're picking")).toBeInTheDocument();
    expect(screen.getByTestId("billing-trial-countdown")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Billing" })).toHaveAttribute(
      "href",
      "/settings#billing",
    );
    expect(screen.getByRole("link", { name: "Billing" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Open billing" })).not.toBeInTheDocument();
  });

  it("syncs settings panel changes from router hash navigation without a hashchange event", () => {
    mockUseLocation.mockReturnValue({ pathname: "/settings", hash: "" });
    const { rerender } = render(React.createElement(SettingsPage));

    expect(screen.getByRole("heading", { name: "Organization profile" })).toBeInTheDocument();

    window.history.replaceState(null, "", "/settings#billing");
    mockUseLocation.mockReturnValue({ pathname: "/settings", hash: "billing" });
    rerender(React.createElement(SettingsPage));

    expect(screen.getByRole("heading", { name: "Billing" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Organization profile" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Billing" })).toHaveAttribute("aria-current", "page");
  });

  it("renders billing loading only on the active billing panel", () => {
    mockUseOrgBilling.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });

    window.history.replaceState(null, "", "/settings#billing");
    render(React.createElement(SettingsPage));

    expect(screen.getByText("Loading billing details…")).toBeInTheDocument();
    expect(screen.queryByText("Loading debug metrics...")).not.toBeInTheDocument();
  });

  it("renders organization loading, missing, and stale profile states", () => {
    mockUseOrgProfile.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });
    const { container, rerender } = render(React.createElement(SettingsPage));

    expect(container.querySelector("[data-testid='org-profile-loading']")).toBeInTheDocument();

    mockUseOrgProfile.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Profile unavailable"),
    });
    rerender(React.createElement(SettingsPage));

    expect(screen.getByText("Unable to load organization profile.")).toBeInTheDocument();
    expect(screen.getByText("Profile unavailable")).toBeInTheDocument();

    mockUseOrgProfile.mockReturnValue({
      data: {
        name: "GrantPipe Foundation",
        timezone: "America/Chicago",
        fiscalYearStartMonth: 7,
        ein: "12-3456789",
        logoUrl: "https://cdn.example/logo.png",
        address: "123 Main St",
      },
      isLoading: false,
      isError: true,
      error: new Error("Using cached profile"),
    });
    rerender(React.createElement(SettingsPage));

    expect(screen.getByText("Organization profile may be stale.")).toBeInTheDocument();
    expect(screen.getByText("Using cached profile")).toBeInTheDocument();
  });

  it("shows billing status messages from settings search params", () => {
    window.history.replaceState(null, "", "/settings#billing");
    mockRouteUseSearch.mockReturnValue({ checkout: "success", portal: "opened" });

    render(React.createElement(SettingsPage));

    expect(screen.getByText("Billing details added successfully.")).toBeInTheDocument();
    expect(screen.getByText("Stripe billing portal opened.")).toBeInTheDocument();
  });

  it("shows a billing error panel when the billing summary fails", () => {
    mockUseOrgBilling.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Billing lookup failed"),
    });

    window.history.replaceState(null, "", "/settings#billing");

    render(React.createElement(SettingsPage));

    expect(screen.getByText("Unable to load billing details.")).toBeInTheDocument();
    expect(screen.getByText("Billing lookup failed")).toBeInTheDocument();
  });

  it("updates the timezone select", async () => {
    const updateProfile = vi.fn().mockResolvedValue({});
    mockUseOrgSettingsMutations.mockReturnValue({
      updateProfile: { mutateAsync: updateProfile, isPending: false },
      saveBillingSelection: { mutateAsync: vi.fn(), isPending: false },
      startCheckout: { mutateAsync: vi.fn(), isPending: false },
      openPortal: { mutateAsync: vi.fn(), isPending: false },
    });

    render(React.createElement(SettingsPage));

    fireEvent.click(screen.getByRole("combobox", { name: "Timezone" }));
    fireEvent.click(await screen.findByRole("option", { name: "America/Chicago" }));
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => {
      expect(updateProfile).toHaveBeenCalledWith({
        name: "GrantPipe Foundation",
        fiscalYearStartMonth: 1,
        timezone: "America/Chicago",
        ein: null,
        logoUrl: null,
        address: null,
      });
    });
  });

  it("renders one-day and non-trial billing summaries", () => {
    mockUseOrgBilling.mockReturnValue({
      data: {
        planTier: "growth",
        billingCycle: "monthly",
        status: "trialing",
        trialEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
      isLoading: false,
      isError: false,
      error: null,
    });
    window.history.replaceState(null, "", "/settings#billing");
    const { rerender } = render(React.createElement(SettingsPage));

    expect(screen.getByText(/1 day left in your free trial/)).toBeInTheDocument();

    mockUseOrgBilling.mockReturnValue({
      data: {
        planTier: "growth",
        billingCycle: "monthly",
        status: "active",
        trialEndsAt: null,
      },
      isLoading: false,
      isError: false,
      error: null,
    });
    rerender(React.createElement(SettingsPage));

    expect(screen.getByText("You're picking")).toBeInTheDocument();
    expect(screen.getAllByText("Growth").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Free trial:/)).not.toBeInTheDocument();
  });

  it("renders hash-based admin sidebar navigation", () => {
    render(React.createElement(SettingsPage));

    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    expect(nav.querySelector("a[href='/settings#billing']")).toBeInTheDocument();
    // Team is a standalone route (/settings/team), not a hash anchor
    expect(nav.querySelector("a[href='/settings/team']")).toBeInTheDocument();
    expect(nav.querySelector("a[href='/settings#debug']")).not.toBeInTheDocument();
    expect(mockUseOrgDebugData).not.toHaveBeenCalled();
  });

  it("falls back to the organization panel for the removed debug hash", () => {
    window.history.replaceState(null, "", "/settings#debug");

    render(React.createElement(SettingsPage));

    expect(screen.getByRole("heading", { name: "Organization profile" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Debug inspection" })).not.toBeInTheDocument();
    expect(mockUseOrgDebugData).not.toHaveBeenCalled();
  });

  it("falls back to the organization panel for non-admin restricted hashes", () => {
    mockUseSession.mockReturnValue({ memberRole: "viewer" });
    window.history.replaceState(null, "", "/settings#team");

    render(React.createElement(SettingsPage));

    expect(screen.getByRole("heading", { name: "Organization profile" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Admin controls" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Team" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Billing" })).not.toBeInTheDocument();
  });

  it("renders profile loading, missing, and stale states", () => {
    mockUseOrgProfile.mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });
    const { container, rerender } = render(React.createElement(SettingsPage));

    expect(container.querySelector("[data-testid='org-profile-loading']")).toBeInTheDocument();

    mockUseOrgProfile.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      isError: false,
      error: "plain failure",
    });
    rerender(React.createElement(SettingsPage));

    expect(screen.getByText("Unable to load organization profile.")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong. Please try again.")).toBeInTheDocument();

    mockUseOrgProfile.mockReturnValueOnce({
      data: {
        name: "GrantPipe Foundation",
        timezone: "America/Monterrey",
        fiscalYearStartMonth: 7,
        ein: "12-3456789",
        logoUrl: "https://example.com/logo.png",
        address: "123 Main",
      },
      isLoading: false,
      isError: true,
      error: new Error("Profile cache is stale"),
    });
    rerender(React.createElement(SettingsPage));

    expect(screen.getByText("Organization profile may be stale.")).toBeInTheDocument();
    expect(screen.getByText("Profile cache is stale")).toBeInTheDocument();
  });

  it("updates the organization profile and shows the saved state", async () => {
    const updateProfile = vi.fn().mockResolvedValue({});
    mockUseOrgSettingsMutations.mockReturnValue({
      updateProfile: { mutateAsync: updateProfile, isPending: false },
      saveBillingSelection: { mutateAsync: vi.fn(), isPending: false },
      startCheckout: { mutateAsync: vi.fn(), isPending: false },
      openPortal: { mutateAsync: vi.fn(), isPending: false },
    });

    render(React.createElement(SettingsPage));

    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "GrantPipe Collective" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => {
      expect(updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "GrantPipe Collective",
          timezone: "America/New_York",
        }),
      );
    });
    expect(screen.getByText("Organization profile saved.")).toBeInTheDocument();
  });

  it("surfaces profile save errors", async () => {
    mockUseOrgSettingsMutations.mockReturnValue({
      updateProfile: {
        mutateAsync: vi.fn().mockRejectedValue(new Error("Profile update failed")),
        isPending: false,
      },
      saveBillingSelection: { mutateAsync: vi.fn(), isPending: false },
      startCheckout: { mutateAsync: vi.fn(), isPending: false },
      openPortal: { mutateAsync: vi.fn(), isPending: false },
    });

    render(React.createElement(SettingsPage));
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByText("Profile update failed")).toBeInTheDocument();
  });

  it("clears existing save-profile timeout when saving a second time", async () => {
    const updateProfile = vi.fn().mockResolvedValue({});
    mockUseOrgSettingsMutations.mockReturnValue({
      updateProfile: { mutateAsync: updateProfile, isPending: false },
      saveBillingSelection: { mutateAsync: vi.fn(), isPending: false },
      startCheckout: { mutateAsync: vi.fn(), isPending: false },
      openPortal: { mutateAsync: vi.fn(), isPending: false },
    });

    render(React.createElement(SettingsPage));

    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() =>
      expect(screen.getByText("Organization profile saved.")).toBeInTheDocument(),
    );

    // Second save before 3-second timeout — exercises the clearTimeout branch
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Organization profile saved.")).toBeInTheDocument();
  });

  it("renders non-trial billing summaries", () => {
    mockUseOrgBilling.mockReturnValue({
      data: {
        planTier: "growth",
        billingCycle: "annual",
        status: "active",
        trialEndsAt: null,
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    window.history.replaceState(null, "", "/settings#billing");
    render(React.createElement(SettingsPage));

    expect(screen.getByText("You're picking")).toBeInTheDocument();
    expect(screen.getAllByText("Growth").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Free trial:/)).not.toBeInTheDocument();
  });

  it("renders PageHeader with kicker='Account'", () => {
    render(React.createElement(SettingsPage));

    const heading = screen.getByRole("heading", { name: "Settings" });
    expect(heading).toBeInTheDocument();
    // The kicker renders as a sibling element containing "Account"
    expect(screen.getByText("Account")).toBeInTheDocument();
  });

  it("nav links use rounded-full pill shape", () => {
    render(React.createElement(SettingsPage));

    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    const links = nav.querySelectorAll("a");
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.className).toContain("rounded-full");
      expect(link.className).not.toContain("rounded-md");
    }
  });

  it("does not redirect when hash changes to billing (non-team)", () => {
    window.history.replaceState(null, "", "/settings#billing");
    mockUseLocation.mockReturnValue({ pathname: "/settings", hash: "billing" });

    render(React.createElement(SettingsPage));

    expect(mockUseNavigate).not.toHaveBeenCalledWith({ to: "/settings/team", replace: true });
  });

  it("renders delete-account controls inside a visually-quarantined Danger zone card", () => {
    render(React.createElement(SettingsPage));

    // The "Danger zone" section heading must be present
    const dangerHeading = screen.getByRole("heading", { name: "Danger zone" });
    expect(dangerHeading).toBeInTheDocument();

    // The delete-account button must still be present
    const deleteButton = screen.getByRole("button", { name: "Delete account" });
    expect(deleteButton).toBeInTheDocument();

    // Both elements must share a common danger-zone container that is distinct
    // from the org-profile form — verified by the data-testid we add to the wrapper.
    const dangerZone = screen.getByTestId("danger-zone-card");
    expect(dangerZone).toBeInTheDocument();
    expect(dangerZone).toContainElement(dangerHeading);
    expect(dangerZone).toContainElement(deleteButton);

    // The org-profile heading must NOT be inside the danger zone card
    const orgHeading = screen.getByRole("heading", { name: "Organization profile" });
    expect(dangerZone).not.toContainElement(orgHeading);
  });
});

describe("isAllowedBillingUrl", () => {
  it("allows same-origin app routes", () => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...window.location,
        origin: "https://app.grantpipe.com",
      },
    });

    expect(isAllowedBillingUrl("/settings/billing?checkout=success")).toBe(true);
  });

  it("allows trusted Stripe hosts", () => {
    expect(isAllowedBillingUrl("https://billing.stripe.com/p/session_123")).toBe(true);
    expect(isAllowedBillingUrl("https://checkout.stripe.com/c/pay_123")).toBe(true);
  });

  it("rejects untrusted external hosts", () => {
    expect(isAllowedBillingUrl("https://phish.example/billing")).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(isAllowedBillingUrl("http://[")).toBe(false);
  });
});
