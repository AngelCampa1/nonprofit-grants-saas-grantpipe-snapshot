import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
  }),
}));

import { AccountingIntegrationsPage } from "./integrations";

describe("AccountingIntegrationsPage", () => {
  it("shows an unavailable empty state because QuickBooks is not currently shipped", () => {
    render(<AccountingIntegrationsPage />);

    expect(screen.getByRole("heading", { name: "Accounting Integrations" })).toBeInTheDocument();
    expect(screen.getByText("QuickBooks Online is not currently available")).toBeInTheDocument();
    expect(
      screen.getByText(
        "GrantPipe includes native accounting, but it does not connect to QuickBooks Online right now.",
      ),
    ).toBeInTheDocument();
  });

  it("does not render QuickBooks connection or sync actions", () => {
    render(<AccountingIntegrationsPage />);

    expect(screen.queryByRole("button", { name: /connect quickbooks/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reconnect quickbooks/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sync now/i })).not.toBeInTheDocument();
    expect(screen.queryByText("QuickBooks Online via sync")).not.toBeInTheDocument();
  });

  it("does not import accounting integration hooks or shared plan gates", () => {
    const source = readFileSync(join(__dirname, "integrations.tsx"), "utf8");

    expect(source).not.toContain("useAccounting");
    expect(source).not.toContain("useQuickBooksConnectUrl");
    expect(source).not.toContain("hasAccountingIntegrations");
    expect(source).not.toContain("getPlanEntitlementLabelList");
  });
});
