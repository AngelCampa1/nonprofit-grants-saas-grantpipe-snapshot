import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";

const mockNavigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    className,
    ...props
  }: {
    to: string;
    children: React.ReactNode;
    className?: string;
  } & React.HTMLAttributes<HTMLAnchorElement>) =>
    React.createElement("a", { href: to, className, ...props }, children),
  useNavigate: () => mockNavigate,
}));

const mockQueryClientClear = vi.fn();
vi.mock("../../main", () => ({
  queryClient: {
    clear: () => mockQueryClientClear(),
  },
}));

const mockCaptureEvent = vi.fn();
vi.mock("../../lib/analytics", () => ({
  captureEvent: (...args: unknown[]) => mockCaptureEvent(...args),
}));

const mockCaptureAppException = vi.fn();
vi.mock("../../lib/sentry", () => ({
  captureAppException: (...args: unknown[]) => mockCaptureAppException(...args),
}));

vi.mock("@grantpipe/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@grantpipe/ui")>();
  return {
    ...actual,
    Avatar: ({ children, size }: { children: React.ReactNode; size?: string }) =>
      React.createElement("div", { "data-testid": "avatar", "data-size": size }, children),
    AvatarFallback: ({ children }: { children: React.ReactNode }) =>
      React.createElement("span", { "data-testid": "avatar-fallback" }, children),
    DropdownMenu: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "dropdown-menu" }, children),
    DropdownMenuTrigger: ({
      children,
      "aria-label": ariaLabel,
      className,
      ...props
    }: {
      children: React.ReactNode;
      "aria-label"?: string;
      className?: string;
    } & React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      React.createElement(
        "button",
        {
          "data-testid": "dropdown-trigger",
          "aria-label": ariaLabel,
          className,
          type: "button",
          ...props,
        },
        children,
      ),
    DropdownMenuContent: ({
      children,
      align,
      className,
    }: {
      children: React.ReactNode;
      align?: string;
      className?: string;
    }) =>
      React.createElement(
        "div",
        { "data-testid": "dropdown-content", "data-align": align, className },
        children,
      ),
    DropdownMenuLabel: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "dropdown-label" }, children),
    DropdownMenuSeparator: () => React.createElement("hr", { "data-testid": "dropdown-separator" }),
    DropdownMenuItem: ({
      children,
      onSelect,
      asChild,
      className,
    }: {
      children: React.ReactNode;
      onSelect?: () => void;
      asChild?: boolean;
      className?: string;
    }) => {
      if (asChild && React.isValidElement(children)) {
        return children;
      }
      return React.createElement(
        "div",
        {
          "data-testid": "dropdown-menu-item",
          role: "menuitem",
          onClick: onSelect,
          className,
        },
        children,
      );
    },
  };
});

const mockUseUserMemberships = vi.fn();

vi.mock("../../hooks/use-org-settings", () => ({
  useUserMemberships: () => mockUseUserMemberships(),
}));

vi.mock("../../lib/api-client", () => ({
  ACTIVE_ENTITY_STORAGE_KEY: "grantpipe.activeEntityId",
  ACTIVE_ORG_STORAGE_KEY: "grantpipe.activeOrgId",
  createApiClient: vi.fn(),
  api: {},
}));

import { UserMenu } from "./user-menu";

describe("UserMenu", () => {
  const defaultProps = {
    name: "Angel Campa",
    email: "angel@grantpipe.com",
    onSignOut: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: single org — no switcher shown
    mockUseUserMemberships.mockReturnValue({ data: undefined });
    // Reset localStorage
    localStorage.clear();
  });

  it("renders without crashing", () => {
    render(<UserMenu {...defaultProps} />);
    expect(screen.getByTestId("dropdown-menu")).toBeInTheDocument();
  });

  it("renders user name", () => {
    render(<UserMenu {...defaultProps} />);
    expect(screen.getAllByText("Angel Campa").length).toBeGreaterThan(0);
  });

  it("renders user email", () => {
    render(<UserMenu {...defaultProps} />);
    expect(screen.getAllByText("angel@grantpipe.com").length).toBeGreaterThan(0);
  });

  it("renders Avatar component", () => {
    render(<UserMenu {...defaultProps} />);
    expect(screen.getByTestId("avatar")).toBeInTheDocument();
  });

  it("renders initials from name — two-word name gives two characters", () => {
    render(<UserMenu {...defaultProps} />);
    expect(screen.getByTestId("avatar-fallback").textContent).toBe("AC");
  });

  it("computes initials for a single-word name", () => {
    render(<UserMenu name="Angel" email="angel@grantpipe.com" onSignOut={vi.fn()} />);
    expect(screen.getByTestId("avatar-fallback").textContent).toBe("A");
  });

  it("falls back to 'U' when name is empty", () => {
    render(<UserMenu name="" email="angel@grantpipe.com" onSignOut={vi.fn()} />);
    expect(screen.getByTestId("avatar-fallback").textContent).toBe("U");
  });

  it("renders initials as uppercase", () => {
    render(<UserMenu name="angel campa" email="a@b.com" onSignOut={vi.fn()} />);
    expect(screen.getByTestId("avatar-fallback").textContent).toBe("AC");
  });

  it("limits initials to 2 characters for names with many parts", () => {
    render(<UserMenu name="First Middle Last" email="a@b.com" onSignOut={vi.fn()} />);
    expect(screen.getByTestId("avatar-fallback").textContent).toBe("FM");
  });

  it("calls onSignOut when the sign out item is clicked", () => {
    const onSignOut = vi.fn();
    render(<UserMenu {...defaultProps} onSignOut={onSignOut} />);
    fireEvent.click(screen.getByRole("menuitem", { name: /sign out/i }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it("renders the Settings link when showSettings=true", () => {
    render(<UserMenu {...defaultProps} showSettings={true} />);
    const settingsLink = screen.getByRole("link", { name: /settings/i });
    expect(settingsLink).toBeInTheDocument();
    expect(settingsLink).toHaveAttribute("href", "/settings");
  });

  it("does NOT render Settings link when showSettings=false", () => {
    render(<UserMenu {...defaultProps} showSettings={false} />);
    expect(screen.queryByRole("link", { name: /settings/i })).not.toBeInTheDocument();
  });

  it("shows Settings by default (showSettings defaults to true)", () => {
    render(<UserMenu name="Angel Campa" email="a@b.com" onSignOut={vi.fn()} />);
    expect(screen.getByRole("link", { name: /settings/i })).toBeInTheDocument();
  });

  it("renders the account menu trigger with aria-label", () => {
    render(<UserMenu {...defaultProps} />);
    expect(screen.getByRole("button", { name: "Account menu" })).toBeInTheDocument();
  });

  it("trigger uses pill shape and standard focus ring", () => {
    render(<UserMenu {...defaultProps} />);
    const trigger = screen.getByRole("button", { name: "Account menu" });
    expect(trigger).toHaveClass("rounded-full");
    expect(trigger.className).toContain("focus-visible:ring-[3px]");
    expect(trigger.className).toContain("focus-visible:ring-ring/50");
  });

  it("can render a compact account trigger for narrow topbars", () => {
    render(<UserMenu {...defaultProps} compact />);

    const trigger = screen.getByRole("button", { name: "Account menu" });
    expect(trigger).toHaveClass("size-9");
    expect(trigger).toHaveClass("w-9");
    expect(trigger).toHaveClass("flex-none");
    expect(trigger).toHaveClass("justify-center");
    expect(trigger).toHaveClass("gap-0");
    expect(trigger.querySelector(".hidden")).toHaveTextContent("Angel Campa");
    expect(trigger.querySelector(".hidden")).toHaveTextContent("angel@grantpipe.com");
  });

  it("renders a Book a call link pointing to the discovery call booking URL", () => {
    render(<UserMenu {...defaultProps} />);
    const bookLink = screen.getByRole("link", { name: /book a call/i });
    expect(bookLink).toHaveAttribute("href", "https://cal.com/angel-campa-grantpipe/30min");
    expect(bookLink).toHaveAttribute("target", "_blank");
    expect(bookLink).toHaveAttribute("rel", "noopener noreferrer");
  });
});

describe("UserMenu — org switcher", () => {
  const defaultProps = {
    name: "Angel Campa",
    email: "angel@grantpipe.com",
    onSignOut: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("does NOT render the org switcher when the user has only one org", () => {
    mockUseUserMemberships.mockReturnValue({
      data: {
        data: [{ orgId: "org-1", orgName: "Foundation Alpha", role: "admin" }],
      },
    });

    render(<UserMenu {...defaultProps} />);
    expect(screen.queryByText(/switch organization/i)).not.toBeInTheDocument();
  });

  it("renders the org switcher when the user has two or more orgs", () => {
    mockUseUserMemberships.mockReturnValue({
      data: {
        data: [
          { orgId: "org-1", orgName: "Foundation Alpha", role: "admin" },
          { orgId: "org-2", orgName: "Fund Beta", role: "editor" },
        ],
      },
    });

    render(<UserMenu {...defaultProps} />);
    expect(screen.getByText(/switch organization/i)).toBeInTheDocument();
    expect(screen.getByText("Foundation Alpha")).toBeInTheDocument();
    expect(screen.getByText("Fund Beta")).toBeInTheDocument();
  });

  it("does NOT render the org switcher when memberships data is not yet loaded", () => {
    mockUseUserMemberships.mockReturnValue({ data: undefined });

    render(<UserMenu {...defaultProps} />);
    expect(screen.queryByText(/switch organization/i)).not.toBeInTheDocument();
  });

  it("sets localStorage, clears the query cache, and navigates to /dashboard when switching orgs", () => {
    mockUseUserMemberships.mockReturnValue({
      data: {
        data: [
          { orgId: "org-1", orgName: "Foundation Alpha", role: "admin" },
          { orgId: "org-2", orgName: "Fund Beta", role: "editor" },
        ],
      },
    });

    render(<UserMenu {...defaultProps} currentOrgId="org-1" />);
    const fundBetaItem = screen.getByText("Fund Beta").closest("[role='menuitem']");
    expect(fundBetaItem).not.toBeNull();
    fireEvent.click(fundBetaItem!);

    expect(localStorage.getItem("grantpipe.activeOrgId")).toBe("org-2");
    expect(mockQueryClientClear).toHaveBeenCalledOnce();
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/dashboard", replace: true });
  });

  it("clears stale active entity selection when switching orgs", () => {
    localStorage.setItem("grantpipe.activeEntityId", "entity-stale");
    mockUseUserMemberships.mockReturnValue({
      data: {
        data: [
          { orgId: "org-1", orgName: "Foundation Alpha", role: "admin" },
          { orgId: "org-2", orgName: "Fund Beta", role: "editor" },
        ],
      },
    });

    render(<UserMenu {...defaultProps} currentOrgId="org-1" />);
    const fundBetaItem = screen.getByText("Fund Beta").closest("[role='menuitem']");
    expect(fundBetaItem).not.toBeNull();
    fireEvent.click(fundBetaItem!);

    expect(localStorage.getItem("grantpipe.activeEntityId")).toBeNull();
  });

  it("captures failed org switches with sanitized context", async () => {
    const originalSetItem = localStorage.setItem.bind(localStorage);
    const setItemSpy = vi.spyOn(localStorage, "setItem").mockImplementation((key, value) => {
      if (key === "grantpipe.activeOrgId" && value === "org-2") {
        throw new Error("storage denied for Fund Beta");
      }
      return originalSetItem(key, value);
    });
    mockUseUserMemberships.mockReturnValue({
      data: {
        data: [
          { orgId: "org-1", orgName: "Foundation Alpha", role: "admin" },
          { orgId: "org-2", orgName: "Fund Beta", role: "editor" },
        ],
      },
    });

    try {
      render(<UserMenu {...defaultProps} currentOrgId="org-1" />);
      const fundBetaItem = screen.getByText("Fund Beta").closest("[role='menuitem']");
      expect(fundBetaItem).not.toBeNull();
      fireEvent.click(fundBetaItem!);

      await waitFor(() => {
        expect(mockCaptureAppException).toHaveBeenCalledWith(
          expect.any(Error),
          expect.objectContaining({
            tags: { feature: "org_switcher", operation: "switch_org" },
            extra: {
              previous_org_id: "org-1",
              requested_org_id: "org-2",
            },
          }),
          { includeExpected: true, sanitize: true },
        );
      });
      expect(localStorage.getItem("grantpipe.activeOrgId")).toBe("org-1");
      expect(JSON.stringify(mockCaptureAppException.mock.calls)).not.toContain("Fund Beta");
      expect(JSON.stringify(mockCaptureAppException.mock.calls)).not.toContain("Foundation Alpha");
    } finally {
      setItemSpy.mockRestore();
    }
  });

  it("captures rejected org switch navigation and restores the prior org id", async () => {
    mockNavigate.mockRejectedValueOnce(new Error("navigation failed for Fund Beta"));
    localStorage.setItem("grantpipe.activeOrgId", "org-1");
    mockUseUserMemberships.mockReturnValue({
      data: {
        data: [
          { orgId: "org-1", orgName: "Foundation Alpha", role: "admin" },
          { orgId: "org-2", orgName: "Fund Beta", role: "editor" },
        ],
      },
    });

    render(<UserMenu {...defaultProps} currentOrgId="org-1" />);
    const fundBetaItem = screen.getByText("Fund Beta").closest("[role='menuitem']");
    expect(fundBetaItem).not.toBeNull();
    fireEvent.click(fundBetaItem!);

    await waitFor(() => {
      expect(mockCaptureAppException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          tags: { feature: "org_switcher", operation: "switch_org" },
          extra: {
            previous_org_id: "org-1",
            requested_org_id: "org-2",
          },
        }),
        { includeExpected: true, sanitize: true },
      );
    });

    expect(localStorage.getItem("grantpipe.activeOrgId")).toBe("org-1");
    expect(JSON.stringify(mockCaptureAppException.mock.calls)).not.toContain("Fund Beta");
  });

  it("captures org switch failures even when restore cleanup storage also throws", async () => {
    const setItemSpy = vi.spyOn(localStorage, "setItem").mockImplementation((key, value) => {
      if (key === "grantpipe.activeOrgId" && value === "org-2") {
        throw new Error("storage denied for Fund Beta");
      }
    });
    const removeItemSpy = vi.spyOn(localStorage, "removeItem").mockImplementation((key) => {
      if (key === "grantpipe.activeOrgId") {
        throw new Error("remove denied");
      }
    });
    mockUseUserMemberships.mockReturnValue({
      data: {
        data: [
          { orgId: "org-1", orgName: "Foundation Alpha", role: "admin" },
          { orgId: "org-2", orgName: "Fund Beta", role: "editor" },
        ],
      },
    });

    try {
      render(<UserMenu {...defaultProps} />);
      const fundBetaItem = screen.getByText("Fund Beta").closest("[role='menuitem']");
      expect(fundBetaItem).not.toBeNull();
      fireEvent.click(fundBetaItem!);

      await waitFor(() => {
        expect(mockCaptureAppException).toHaveBeenCalledWith(
          expect.any(Error),
          expect.objectContaining({
            tags: { feature: "org_switcher", operation: "switch_org" },
            extra: {
              previous_org_id: undefined,
              requested_org_id: "org-2",
            },
          }),
          { includeExpected: true, sanitize: true },
        );
      });
    } finally {
      setItemSpy.mockRestore();
      removeItemSpy.mockRestore();
    }
  });

  it("does nothing when the user picks the org that is already active", () => {
    localStorage.setItem("grantpipe.activeOrgId", "org-1");
    mockUseUserMemberships.mockReturnValue({
      data: {
        data: [
          { orgId: "org-1", orgName: "Foundation Alpha", role: "admin" },
          { orgId: "org-2", orgName: "Fund Beta", role: "editor" },
        ],
      },
    });

    render(<UserMenu {...defaultProps} currentOrgId="org-1" />);
    const alphaItem = screen.getByText("Foundation Alpha").closest("[role='menuitem']");
    expect(alphaItem).not.toBeNull();
    fireEvent.click(alphaItem!);

    expect(mockQueryClientClear).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("highlights the currently active org using currentOrgId prop when no localStorage value", () => {
    mockUseUserMemberships.mockReturnValue({
      data: {
        data: [
          { orgId: "org-1", orgName: "Foundation Alpha", role: "admin" },
          { orgId: "org-2", orgName: "Fund Beta", role: "editor" },
        ],
      },
    });

    render(<UserMenu {...defaultProps} currentOrgId="org-1" />);
    // The check icon for org-1 should be visible (opacity-100), org-2 hidden (opacity-0)
    const menuItems = screen.getAllByRole("menuitem");
    // Find the org switcher items (not Settings/Sign out)
    const orgItems = menuItems.filter(
      (el) => el.textContent?.includes("Alpha") || el.textContent?.includes("Beta"),
    );
    expect(orgItems).toHaveLength(2);
    expect(orgItems[0]?.querySelector("svg")).toHaveClass("opacity-100");
    expect(orgItems[1]?.querySelector("svg")).toHaveClass("opacity-0");
  });

  it("prefers localStorage activeOrgId over currentOrgId prop for active highlight", () => {
    localStorage.setItem("grantpipe.activeOrgId", "org-2");
    mockUseUserMemberships.mockReturnValue({
      data: {
        data: [
          { orgId: "org-1", orgName: "Foundation Alpha", role: "admin" },
          { orgId: "org-2", orgName: "Fund Beta", role: "editor" },
        ],
      },
    });

    render(<UserMenu {...defaultProps} currentOrgId="org-1" />);
    const orgItems = screen
      .getAllByRole("menuitem")
      .filter((el) => el.textContent?.includes("Alpha") || el.textContent?.includes("Beta"));

    expect(orgItems[0]?.querySelector("svg")).toHaveClass("opacity-0");
    expect(orgItems[1]?.querySelector("svg")).toHaveClass("opacity-100");
  });

  it("hides all active-org markers when no active organization is known", () => {
    mockUseUserMemberships.mockReturnValue({
      data: {
        data: [
          { orgId: "org-1", orgName: "Foundation Alpha", role: "admin" },
          { orgId: "org-2", orgName: "Fund Beta", role: "editor" },
        ],
      },
    });

    render(<UserMenu {...defaultProps} />);
    const orgItems = screen
      .getAllByRole("menuitem")
      .filter((el) => el.textContent?.includes("Alpha") || el.textContent?.includes("Beta"));

    expect(orgItems[0]?.querySelector("svg")).toHaveClass("opacity-0");
    expect(orgItems[1]?.querySelector("svg")).toHaveClass("opacity-0");
  });

  it("falls back to currentOrgId when rendered without a window object", () => {
    mockUseUserMemberships.mockReturnValue({
      data: {
        data: [
          { orgId: "org-1", orgName: "Foundation Alpha", role: "admin" },
          { orgId: "org-2", orgName: "Fund Beta", role: "editor" },
        ],
      },
    });

    vi.stubGlobal("window", undefined);

    try {
      const html = renderToString(<UserMenu {...defaultProps} currentOrgId="org-2" />);
      expect(html).toContain("Fund Beta");
      expect(html).toContain("opacity-100");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("falls back to currentOrgId when window is unavailable", () => {
    mockUseUserMemberships.mockReturnValue({
      data: {
        data: [
          { orgId: "org-1", orgName: "Foundation Alpha", role: "admin" },
          { orgId: "org-2", orgName: "Fund Beta", role: "editor" },
        ],
      },
    });
    vi.stubGlobal("window", undefined);

    try {
      const html = renderToString(<UserMenu {...defaultProps} currentOrgId="org-1" />);
      expect(html).toContain("Foundation Alpha");
      expect(html).toContain("opacity-100");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("UserMenu — entity switcher", () => {
  const defaultProps = {
    name: "Angel Campa",
    email: "angel@grantpipe.com",
    onSignOut: vi.fn(),
    currentOrgId: "org-1",
    activeEntityId: "entity-root",
    availableEntities: [
      {
        id: "entity-root",
        name: "Main Organization",
        kind: "root",
        status: "active",
        fiscalSponsorModel: "none",
        parentEntityId: null,
        role: "admin",
        permissions: {
          grants: "manage",
          reports: "manage",
          entitySettings: "manage",
          entityTeam: "manage",
        },
        isDefault: true,
      },
      {
        id: "entity-client",
        name: "Client Project",
        kind: "agency_client",
        status: "active",
        fiscalSponsorModel: "none",
        parentEntityId: null,
        role: "viewer",
        permissions: {
          grants: "view",
          reports: "view",
          entitySettings: "none",
          entityTeam: "none",
        },
        isDefault: false,
      },
    ],
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUseUserMemberships.mockReturnValue({ data: undefined });
  });

  it("renders a visible entity switcher when more than one entity is available", () => {
    render(<UserMenu {...defaultProps} />);

    expect(screen.getByText(/switch entity/i)).toBeInTheDocument();
    expect(screen.getByText("Main Organization")).toBeInTheDocument();
    expect(screen.getByText("Client Project")).toBeInTheDocument();
  });

  it("does not render the entity switcher when only one entity is available", () => {
    render(<UserMenu {...defaultProps} availableEntities={[defaultProps.availableEntities[0]]} />);

    expect(screen.queryByText(/switch entity/i)).not.toBeInTheDocument();
  });

  it("does nothing when the selected entity is already active", () => {
    render(<UserMenu {...defaultProps} />);

    const rootItem = screen.getByText("Main Organization").closest("[role='menuitem']");
    expect(rootItem).not.toBeNull();
    fireEvent.click(rootItem!);

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockQueryClientClear).not.toHaveBeenCalled();
    expect(mockCaptureEvent).not.toHaveBeenCalled();
  });

  it("sets active entity id, clears query cache, navigates, and tracks only ids", async () => {
    render(<UserMenu {...defaultProps} />);

    const clientItem = screen.getByText("Client Project").closest("[role='menuitem']");
    expect(clientItem).not.toBeNull();
    fireEvent.click(clientItem!);

    expect(localStorage.getItem("grantpipe.activeEntityId")).toBe("entity-client");
    expect(mockQueryClientClear).toHaveBeenCalledOnce();
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/dashboard", replace: true });
    await waitFor(() => {
      expect(mockCaptureEvent).toHaveBeenCalledWith("entity_switch_completed", {
        org_id: "org-1",
        previous_entity_id: "entity-root",
        active_entity_id: "entity-client",
      });
    });
    expect(JSON.stringify(mockCaptureEvent.mock.calls)).not.toContain("Client Project");
    expect(JSON.stringify(mockCaptureEvent.mock.calls)).not.toContain("Main Organization");
  });

  it("captures denied entity switches with sanitized context and without entity names", () => {
    localStorage.setItem("grantpipe.activeEntityId", "entity-unknown");

    render(
      <UserMenu
        {...defaultProps}
        activeEntityId="entity-root"
        availableEntities={defaultProps.availableEntities}
      />,
    );

    expect(mockCaptureAppException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: { feature: "entity_switcher", operation: "validate_active_entity" },
        extra: {
          org_id: "org-1",
          active_entity_id: "entity-unknown",
          available_entity_ids: ["entity-root", "entity-client"],
        },
      }),
      { includeExpected: true, sanitize: true },
    );
    expect(localStorage.getItem("grantpipe.activeEntityId")).toBeNull();
    expect(JSON.stringify(mockCaptureAppException.mock.calls)).not.toContain("Client Project");
    expect(JSON.stringify(mockCaptureAppException.mock.calls)).not.toContain("Main Organization");
  });

  it("captures failed entity switches with sanitized context and does not store stale ids", async () => {
    const originalSetItem = localStorage.setItem.bind(localStorage);
    const setItemSpy = vi.spyOn(localStorage, "setItem").mockImplementation((key, value) => {
      if (key === "grantpipe.activeEntityId" && value === "entity-client") {
        throw new Error("storage denied for Client Project");
      }
      return originalSetItem(key, value);
    });

    try {
      render(<UserMenu {...defaultProps} />);
      const clientItem = screen.getByText("Client Project").closest("[role='menuitem']");
      expect(clientItem).not.toBeNull();
      fireEvent.click(clientItem!);

      await waitFor(() => {
        expect(mockCaptureAppException).toHaveBeenCalledWith(
          expect.any(Error),
          expect.objectContaining({
            tags: { feature: "entity_switcher", operation: "switch_entity" },
            extra: {
              org_id: "org-1",
              previous_entity_id: "entity-root",
              requested_entity_id: "entity-client",
            },
          }),
          { includeExpected: true, sanitize: true },
        );
      });
      expect(localStorage.getItem("grantpipe.activeEntityId")).toBeNull();
      expect(JSON.stringify(mockCaptureAppException.mock.calls)).not.toContain("Client Project");
    } finally {
      setItemSpy.mockRestore();
    }
  });

  it("restores a stored entity and delays success analytics when navigation rejects", async () => {
    mockNavigate.mockRejectedValueOnce(new Error("navigation failed"));
    localStorage.setItem("grantpipe.activeEntityId", "entity-client");

    render(<UserMenu {...defaultProps} />);
    const rootItem = screen.getByText("Main Organization").closest("[role='menuitem']");
    expect(rootItem).not.toBeNull();
    fireEvent.click(rootItem!);

    await waitFor(() => {
      expect(mockCaptureAppException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          tags: { feature: "entity_switcher", operation: "switch_entity" },
        }),
        { includeExpected: true, sanitize: true },
      );
    });

    expect(localStorage.getItem("grantpipe.activeEntityId")).toBe("entity-client");
    expect(mockCaptureEvent).not.toHaveBeenCalledWith("entity_switch_completed", expect.anything());
  });

  it("captures entity switch failures even when stale-id cleanup storage also throws", async () => {
    const setItemSpy = vi.spyOn(localStorage, "setItem").mockImplementation((key, value) => {
      if (key === "grantpipe.activeEntityId" && value === "entity-client") {
        throw new Error("storage denied for Client Project");
      }
    });
    const removeItemSpy = vi.spyOn(localStorage, "removeItem").mockImplementation((key) => {
      if (key === "grantpipe.activeEntityId") {
        throw new Error("remove denied");
      }
    });

    try {
      render(<UserMenu {...defaultProps} />);
      const clientItem = screen.getByText("Client Project").closest("[role='menuitem']");
      expect(clientItem).not.toBeNull();
      fireEvent.click(clientItem!);

      await waitFor(() => {
        expect(mockCaptureAppException).toHaveBeenCalledWith(
          expect.any(Error),
          expect.objectContaining({
            tags: { feature: "entity_switcher", operation: "switch_entity" },
            extra: {
              org_id: "org-1",
              previous_entity_id: "entity-root",
              requested_entity_id: "entity-client",
            },
          }),
          { includeExpected: true, sanitize: true },
        );
      });
      expect(JSON.stringify(mockCaptureAppException.mock.calls)).not.toContain("Client Project");
    } finally {
      setItemSpy.mockRestore();
      removeItemSpy.mockRestore();
    }
  });

  it("shows full name as title attribute on truncated name spans", () => {
    render(<UserMenu {...defaultProps} />);
    const nameEls = screen.getAllByTitle("Angel Campa");
    expect(nameEls.length).toBeGreaterThan(0);
  });

  it("shows full email as title attribute on truncated email spans", () => {
    render(<UserMenu {...defaultProps} />);
    const emailEls = screen.getAllByTitle("angel@grantpipe.com");
    expect(emailEls.length).toBeGreaterThan(0);
  });

  it("shows full org name as title attribute on org switcher items", () => {
    mockUseUserMemberships.mockReturnValue({
      data: {
        data: [
          { orgId: "org-1", orgName: "Foundation Alpha", role: "admin" },
          { orgId: "org-2", orgName: "Fund Beta", role: "editor" },
        ],
      },
    });
    render(<UserMenu {...defaultProps} />);
    expect(screen.getByTitle("Foundation Alpha")).toBeInTheDocument();
  });

  it("shows full entity name as title attribute on entity switcher items", () => {
    render(<UserMenu {...defaultProps} />);
    expect(screen.getByTitle("Main Organization")).toBeInTheDocument();
  });
});
