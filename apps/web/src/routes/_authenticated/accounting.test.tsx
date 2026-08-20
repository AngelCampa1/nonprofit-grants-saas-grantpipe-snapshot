import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockUseOrgProfile, mockUseLocation, mockUseSession } = vi.hoisted(() => ({
  mockUseOrgProfile: vi.fn(),
  mockUseLocation: vi.fn(),
  mockUseSession: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
  }),
  Outlet: () => <div data-testid="outlet">Outlet</div>,
  useLocation: () => mockUseLocation(),
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
    select({ location: mockUseLocation() }),
  Link: ({
    children,
    to,
    className,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string }) => (
    <a href={to ?? ""} className={className} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("../../lib/analytics", () => ({
  captureEvent: vi.fn(),
}));

vi.mock("../../hooks/use-org-settings", () => ({
  useOrgProfile: () => mockUseOrgProfile(),
}));
vi.mock("../../hooks/use-session", () => ({
  useSession: () => mockUseSession(),
}));
vi.mock("../../hooks/use-accounting", () => ({
  useSeedOpeningBalances: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSeedChartOfAccounts: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEnableAccounting: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@grantpipe/ui", () => ({
  cn: (...classes: Array<string | undefined | false | null>) => classes.filter(Boolean).join(" "),
  Alert: ({ children, title }: { children?: React.ReactNode; title?: string }) => (
    <div data-testid="alert">
      {title}
      {children}
    </div>
  ),
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Card: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Dialog: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  PageHeader: ({ title, description }: { title?: string; description?: string }) => (
    <div>
      {title}
      {description ? <p>{description}</p> : null}
    </div>
  ),
  PageShell: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  EmptyState: ({
    icon,
    title,
    description,
    action,
  }: {
    icon?: React.ReactNode;
    title?: string;
    description?: string;
    action?: React.ReactNode;
  }) => (
    <div role="region" aria-label={title}>
      {icon ? <span data-testid="empty-state-icon">{icon}</span> : null}
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  ),
}));
vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("lucide-react")>();
  return {
    ...actual,
    BookOpen: () => null,
    Lock: () => null,
  };
});

import { AccountingLayout } from "./accounting";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderLayout() {
  return render(<AccountingLayout />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSession.mockReturnValue({ memberRole: "admin", memberPermissions: null });
});

describe("AccountingLayout", () => {
  describe("when accounting is enabled", () => {
    it("renders <Outlet /> for any path", () => {
      mockUseOrgProfile.mockReturnValue({
        data: { accountingEnabled: true },
        isLoading: false,
      });
      mockUseLocation.mockReturnValue({ pathname: "/accounting/chart-of-accounts" });

      renderLayout();

      expect(screen.getByTestId("outlet")).toBeInTheDocument();
    });

    it("renders the accounting section nav alongside the Outlet", () => {
      mockUseOrgProfile.mockReturnValue({
        data: { accountingEnabled: true },
        isLoading: false,
      });
      mockUseLocation.mockReturnValue({ pathname: "/accounting/chart-of-accounts" });

      renderLayout();

      const nav = screen.getByRole("navigation", { name: "Accounting sections" });
      expect(nav).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Overview" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Chart of Accounts" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Allocation Studio" })).toBeInTheDocument();
      expect(screen.getByTestId("outlet")).toBeInTheDocument();
    });

    it("renders the section nav unfiltered when memberRole has not loaded yet", () => {
      mockUseSession.mockReturnValue({ memberRole: null, memberPermissions: null });
      mockUseOrgProfile.mockReturnValue({
        data: { accountingEnabled: true },
        isLoading: false,
      });
      mockUseLocation.mockReturnValue({ pathname: "/accounting" });

      renderLayout();

      expect(screen.getByRole("link", { name: "Overview" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Allocation Studio" })).toBeInTheDocument();
    });

    it("filters the section nav for a non-editor role (hides Allocation Studio)", () => {
      mockUseSession.mockReturnValue({ memberRole: "viewer", memberPermissions: null });
      mockUseOrgProfile.mockReturnValue({
        data: { accountingEnabled: true },
        isLoading: false,
      });
      mockUseLocation.mockReturnValue({ pathname: "/accounting" });

      renderLayout();

      expect(screen.queryByRole("link", { name: "Allocation Studio" })).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Overview" })).toBeInTheDocument();
    });
  });

  describe("when accounting is disabled", () => {
    it("renders <Outlet /> for the index path (enable-accounting landing page)", () => {
      mockUseOrgProfile.mockReturnValue({
        data: { accountingEnabled: false },
        isLoading: false,
      });
      mockUseLocation.mockReturnValue({ pathname: "/accounting/" });

      renderLayout();

      expect(screen.getByTestId("outlet")).toBeInTheDocument();
    });

    it("renders <Outlet /> for /accounting (no trailing slash)", () => {
      mockUseOrgProfile.mockReturnValue({
        data: { accountingEnabled: false },
        isLoading: false,
      });
      mockUseLocation.mockReturnValue({ pathname: "/accounting" });

      renderLayout();

      expect(screen.getByTestId("outlet")).toBeInTheDocument();
    });

    it("renders AccountingDisabledCard for chart-of-accounts sub-route", () => {
      mockUseOrgProfile.mockReturnValue({
        data: { accountingEnabled: false },
        isLoading: false,
      });
      mockUseLocation.mockReturnValue({ pathname: "/accounting/chart-of-accounts" });

      renderLayout();

      expect(screen.queryByTestId("outlet")).not.toBeInTheDocument();
      expect(screen.getByText("Chart of accounts is not available yet")).toBeInTheDocument();
      expect(
        screen.queryByRole("navigation", { name: "Accounting sections" }),
      ).not.toBeInTheDocument();
    });

    it("renders AccountingDisabledCard for journal sub-route", () => {
      mockUseOrgProfile.mockReturnValue({
        data: { accountingEnabled: false },
        isLoading: false,
      });
      mockUseLocation.mockReturnValue({ pathname: "/accounting/journal" });

      renderLayout();

      expect(screen.queryByTestId("outlet")).not.toBeInTheDocument();
      expect(screen.getByText("Journal entries are not available yet")).toBeInTheDocument();
    });

    it("renders AccountingDisabledCard for periods sub-route", () => {
      mockUseOrgProfile.mockReturnValue({
        data: { accountingEnabled: false },
        isLoading: false,
      });
      mockUseLocation.mockReturnValue({ pathname: "/accounting/periods" });

      renderLayout();

      expect(screen.queryByTestId("outlet")).not.toBeInTheDocument();
      expect(screen.getByText("Fiscal periods are not available yet")).toBeInTheDocument();
    });

    it("renders <Outlet /> while org profile is loading (prevents flash)", () => {
      mockUseOrgProfile.mockReturnValue({
        data: undefined,
        isLoading: true,
      });
      mockUseLocation.mockReturnValue({ pathname: "/accounting/chart-of-accounts" });

      renderLayout();

      // While loading, we don't know the state so render outlet
      expect(screen.getByTestId("outlet")).toBeInTheDocument();
    });

    it("renders AccountingDisabledCard for bank sub-route", () => {
      mockUseOrgProfile.mockReturnValue({
        data: { accountingEnabled: false },
        isLoading: false,
      });
      mockUseLocation.mockReturnValue({ pathname: "/accounting/bank" });

      renderLayout();

      expect(screen.queryByTestId("outlet")).not.toBeInTheDocument();
    });

    it("explains which disabled accounting area was requested", () => {
      mockUseOrgProfile.mockReturnValue({
        data: { accountingEnabled: false },
        isLoading: false,
      });
      mockUseLocation.mockReturnValue({ pathname: "/accounting/bank" });

      renderLayout();

      expect(
        screen.getByRole("region", { name: "Banking is not available yet" }),
      ).toBeInTheDocument();
      expect(screen.getByTestId("empty-state-icon")).toBeInTheDocument();
      expect(screen.getByText("Banking is not available yet")).toBeInTheDocument();
      expect(
        screen.getByText(/enable accounting before adding bank accounts/i),
      ).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Enable accounting" })).toHaveAttribute(
        "href",
        "/accounting",
      );
    });

    it("explains the disabled ledger route", () => {
      mockUseOrgProfile.mockReturnValue({
        data: { accountingEnabled: false },
        isLoading: false,
      });
      mockUseLocation.mockReturnValue({ pathname: "/accounting/ledger" });

      renderLayout();

      expect(screen.getByText("General ledger is not available yet")).toBeInTheDocument();
      expect(screen.getByText(/reviewing ledger activity/i)).toBeInTheDocument();
    });

    it("explains the disabled recurring entries route", () => {
      mockUseOrgProfile.mockReturnValue({
        data: { accountingEnabled: false },
        isLoading: false,
      });
      mockUseLocation.mockReturnValue({ pathname: "/accounting/recurring" });

      renderLayout();

      expect(screen.getByText("Recurring entries are not available yet")).toBeInTheDocument();
      expect(screen.getByText(/scheduling recurring journal entries/i)).toBeInTheDocument();
    });

    it("explains the disabled trial balance route", () => {
      mockUseOrgProfile.mockReturnValue({
        data: { accountingEnabled: false },
        isLoading: false,
      });
      mockUseLocation.mockReturnValue({ pathname: "/accounting/trial-balance" });

      renderLayout();

      expect(screen.getByText("Trial balance is not available yet")).toBeInTheDocument();
      expect(screen.getByText(/reviewing debits, credits/i)).toBeInTheDocument();
    });

    it("explains the disabled reports route", () => {
      mockUseOrgProfile.mockReturnValue({
        data: { accountingEnabled: false },
        isLoading: false,
      });
      mockUseLocation.mockReturnValue({ pathname: "/accounting/reports/activities" });

      renderLayout();

      expect(screen.getByText("Accounting reports are not available yet")).toBeInTheDocument();
      expect(screen.getByText(/generating financial statements/i)).toBeInTheDocument();
    });

    it("explains the disabled integrations route", () => {
      mockUseOrgProfile.mockReturnValue({
        data: { accountingEnabled: false },
        isLoading: false,
      });
      mockUseLocation.mockReturnValue({ pathname: "/accounting/integrations" });

      renderLayout();

      expect(screen.queryByTestId("outlet")).not.toBeInTheDocument();
      expect(screen.getByText("Accounting integrations are not available yet")).toBeInTheDocument();
      expect(screen.getByText(/GrantPipe includes native accounting/i)).toBeInTheDocument();
    });

    it("uses the generic disabled copy for unknown accounting sub-routes", () => {
      mockUseOrgProfile.mockReturnValue({
        data: { accountingEnabled: false },
        isLoading: false,
      });
      mockUseLocation.mockReturnValue({ pathname: "/accounting/unknown" });

      renderLayout();

      expect(screen.getByText("Accounting is not available yet")).toBeInTheDocument();
      expect(screen.getByText(/using this accounting workspace area/i)).toBeInTheDocument();
    });
  });
});
