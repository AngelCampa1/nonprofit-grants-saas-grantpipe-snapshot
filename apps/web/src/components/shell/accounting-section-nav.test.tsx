import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const locationState = { pathname: "/accounting" };

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    className,
    onClick,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string }) => (
    <a href={to} className={className} onClick={onClick} {...props}>
      {children}
    </a>
  ),
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: locationState.pathname } }),
}));

vi.mock("../../lib/analytics", () => ({
  captureEvent: vi.fn(),
}));

import { AccountingSectionNav } from "./accounting-section-nav";
import { captureEvent } from "../../lib/analytics";

const mockCaptureEvent = vi.mocked(captureEvent);

const ALL_LABELS = [
  "Overview",
  "Chart of Accounts",
  "Journal",
  "Ledger",
  "Trial Balance",
  "Fiscal Periods",
  "Recurring",
  "Financial Position",
  "Statement of Activities",
  "Functional Expenses",
  "Bank Accounts",
  "Integrations",
  "Anomaly Detector",
  "Allocation Studio",
];

describe("AccountingSectionNav", () => {
  beforeEach(() => {
    locationState.pathname = "/accounting";
    mockCaptureEvent.mockClear();
  });

  it("renders all 14 accounting destinations for an admin", () => {
    render(<AccountingSectionNav role="admin" permissions={null} />);

    for (const label of ALL_LABELS) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("link")).toHaveLength(ALL_LABELS.length);
  });

  it("renders the expected landmark", () => {
    render(<AccountingSectionNav role="admin" permissions={null} />);
    expect(screen.getByRole("navigation", { name: "Accounting sections" })).toBeInTheDocument();
  });

  it("links to the correct destination paths", () => {
    render(<AccountingSectionNav role="admin" permissions={null} />);

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/accounting");
    expect(screen.getByRole("link", { name: "Chart of Accounts" })).toHaveAttribute(
      "href",
      "/accounting/chart-of-accounts",
    );
    expect(screen.getByRole("link", { name: "Journal" })).toHaveAttribute(
      "href",
      "/accounting/journal",
    );
    expect(screen.getByRole("link", { name: "Trial Balance" })).toHaveAttribute(
      "href",
      "/accounting/trial-balance",
    );
    expect(screen.getByRole("link", { name: "Financial Position" })).toHaveAttribute(
      "href",
      "/accounting/reports/financial-position",
    );
    expect(screen.getByRole("link", { name: "Statement of Activities" })).toHaveAttribute(
      "href",
      "/accounting/reports/activities",
    );
    expect(screen.getByRole("link", { name: "Functional Expenses" })).toHaveAttribute(
      "href",
      "/accounting/reports/functional-expenses",
    );
    expect(screen.getByRole("link", { name: "Integrations" })).toHaveAttribute(
      "href",
      "/accounting/integrations",
    );
    expect(screen.getByRole("link", { name: "Allocation Studio" })).toHaveAttribute(
      "href",
      "/accounting/studios/functional-expense-allocation",
    );
  });

  it("hides Allocation Studio for an auditor (accounting:view but not :manage)", () => {
    // Auditors get accounting:view + reports:view by default (see
    // packages/shared/src/types/index.ts AUDITOR_PERMISSIONS), so they see every
    // other accounting destination — Allocation Studio requires accounting:manage
    // and editor-up roles, which auditors never have.
    render(<AccountingSectionNav role="auditor" permissions={null} />);

    expect(screen.queryByRole("link", { name: "Allocation Studio" })).not.toBeInTheDocument();
    for (const label of ALL_LABELS.filter((label) => label !== "Allocation Studio")) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("link")).toHaveLength(ALL_LABELS.length - 1);
  });

  it("shows Allocation Studio for an editor with accounting:manage override", () => {
    render(
      <AccountingSectionNav
        role="editor"
        permissions={{ accounting: "manage", reports: "view" }}
      />,
    );

    expect(screen.getByRole("link", { name: "Allocation Studio" })).toBeInTheDocument();
  });

  it("hides Allocation Studio for a viewer role with the default (view-only) permission map", () => {
    // `isNavItemVisible` checks `requiredPermissions` first (accounting:manage),
    // so a viewer without a manage override never sees it — mirrors the same
    // precedence the main sidebar's Allocation Studio entry relies on.
    render(<AccountingSectionNav role="viewer" permissions={null} />);

    expect(screen.queryByRole("link", { name: "Allocation Studio" })).not.toBeInTheDocument();
  });

  it("marks Overview active with aria-current='page' on the exact /accounting path", () => {
    locationState.pathname = "/accounting";
    render(<AccountingSectionNav role="admin" permissions={null} />);

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Journal" })).not.toHaveAttribute("aria-current");
  });

  it("keeps Journal active on its /new child route (prefix match, not Overview)", () => {
    locationState.pathname = "/accounting/journal/new";
    render(<AccountingSectionNav role="admin" permissions={null} />);

    expect(screen.getByRole("link", { name: "Journal" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });

  it("keeps Journal active on an /$entryId child route", () => {
    locationState.pathname = "/accounting/journal/je-123";
    render(<AccountingSectionNav role="admin" permissions={null} />);

    expect(screen.getByRole("link", { name: "Journal" })).toHaveAttribute("aria-current", "page");
  });

  it("keeps Bank Accounts active on a /$bankAccountId child route", () => {
    locationState.pathname = "/accounting/bank/ba-123";
    render(<AccountingSectionNav role="admin" permissions={null} />);

    expect(screen.getByRole("link", { name: "Bank Accounts" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });

  it("falls back to /accounting when the normalized path is empty", () => {
    locationState.pathname = "/";
    render(<AccountingSectionNav role="admin" permissions={null} />);

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  });

  it("marks no link active on an unrelated path", () => {
    locationState.pathname = "/dashboard";
    render(<AccountingSectionNav role="admin" permissions={null} />);

    for (const label of ALL_LABELS) {
      expect(screen.getByRole("link", { name: label })).not.toHaveAttribute("aria-current");
    }
  });

  it("fires an app_nav_item_clicked PostHog event with the expected shape on click", () => {
    render(<AccountingSectionNav role="admin" permissions={null} />);

    fireEvent.click(screen.getByRole("link", { name: "Trial Balance" }));

    expect(mockCaptureEvent).toHaveBeenCalledWith("app_nav_item_clicked", {
      nav_item: "Trial Balance",
      nav_item_id: "trial-balance",
      destination_path: "/accounting/trial-balance",
      nav_area: "accounting_module",
      section: "Accounting",
    });
  });

  it("kebab-slugifies multi-word labels for nav_item_id", () => {
    render(<AccountingSectionNav role="admin" permissions={null} />);

    fireEvent.click(screen.getByRole("link", { name: "Statement of Activities" }));

    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "app_nav_item_clicked",
      expect.objectContaining({ nav_item_id: "statement-of-activities" }),
    );
  });

  it("applies a custom className to the nav landmark", () => {
    render(<AccountingSectionNav role="admin" permissions={null} className="custom-class" />);

    expect(screen.getByRole("navigation", { name: "Accounting sections" })).toHaveClass(
      "custom-class",
    );
  });
});
