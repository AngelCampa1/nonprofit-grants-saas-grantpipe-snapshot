import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// Mock TanStack Router Link — captures the to/hash props for assertion
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    hash,
    className,
    children,
  }: {
    to: string;
    hash?: string;
    className?: string;
    children: React.ReactNode;
  }) =>
    React.createElement(
      "a",
      { href: hash ? `${to}#${hash}` : to, "data-to": to, "data-hash": hash, className },
      children,
    ),
}));

import { RouterEmptyStateLink } from "./router-empty-state-link";

describe("RouterEmptyStateLink", () => {
  it("renders an anchor with the correct href for a path without hash", () => {
    render(<RouterEmptyStateLink href="/settings/billing">Plans</RouterEmptyStateLink>);
    const link = screen.getByRole("link", { name: "Plans" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("data-to", "/settings/billing");
    expect(link).not.toHaveAttribute("data-hash");
  });

  it("splits hash from href and passes to Link hash prop", () => {
    render(
      <RouterEmptyStateLink href="/help#functional_expenses_report">
        Learn more
      </RouterEmptyStateLink>,
    );
    const link = screen.getByRole("link", { name: "Learn more" });
    expect(link).toHaveAttribute("data-to", "/help");
    expect(link).toHaveAttribute("data-hash", "functional_expenses_report");
  });

  it("handles href with only a hash (no path)", () => {
    render(<RouterEmptyStateLink href="#billing">Billing</RouterEmptyStateLink>);
    const link = screen.getByRole("link", { name: "Billing" });
    expect(link).toHaveAttribute("data-to", "");
    expect(link).toHaveAttribute("data-hash", "billing");
  });

  it("forwards className to Link", () => {
    render(
      <RouterEmptyStateLink href="/subrecipients" className="pill-link">
        Subrecipients
      </RouterEmptyStateLink>,
    );
    const link = screen.getByRole("link", { name: "Subrecipients" });
    expect(link).toHaveClass("pill-link");
  });

  it("renders children inside the link", () => {
    render(
      <RouterEmptyStateLink href="/help">
        <span data-testid="child">Help text</span>
      </RouterEmptyStateLink>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("handles href with multiple # signs (only first split)", () => {
    render(<RouterEmptyStateLink href="/page#section#extra">text</RouterEmptyStateLink>);
    const link = screen.getByRole("link", { name: "text" });
    // Everything after first # is the hash
    expect(link).toHaveAttribute("data-to", "/page");
    expect(link).toHaveAttribute("data-hash", "section#extra");
  });
});
