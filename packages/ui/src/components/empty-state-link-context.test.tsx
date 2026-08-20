import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { EmptyStateLinkProvider, useEmptyStateLink } from "./empty-state-link-context";
import type { EmptyStateLinkProps } from "./empty-state-link-context";

// A tiny consumer that renders whatever the hook resolves.
// We use React.createElement to avoid react-hooks/static-components: the rule
// fires when a hook return value is used directly as a JSX tag.
function Consumer({ href, className }: { href: string; className?: string }) {
  const LinkComp = useEmptyStateLink();
  return React.createElement(LinkComp, { href, className }, "click me");
}

describe("useEmptyStateLink – default (no provider)", () => {
  it("renders a plain <a> anchor with the given href", () => {
    render(<Consumer href="/foo/bar" />);
    const link = screen.getByRole("link", { name: "click me" });
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "/foo/bar");
  });

  it("forwards className to the default anchor", () => {
    render(<Consumer href="/foo" className="my-class" />);
    const link = screen.getByRole("link", { name: "click me" });
    expect(link).toHaveClass("my-class");
  });

  it("renders children inside the default anchor", () => {
    render(<Consumer href="/baz" />);
    expect(screen.getByRole("link", { name: "click me" })).toBeInTheDocument();
  });
});

describe("EmptyStateLinkProvider + useEmptyStateLink", () => {
  it("renders the injected component instead of the default anchor", () => {
    const Custom = ({ href, className, children }: EmptyStateLinkProps) => (
      <span data-testid="custom-link" data-href={href} className={className}>
        {children}
      </span>
    );

    render(
      <EmptyStateLinkProvider component={Custom}>
        <Consumer href="/settings/billing" className="pill-link" />
      </EmptyStateLinkProvider>,
    );

    const el = screen.getByTestId("custom-link");
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("data-href", "/settings/billing");
    expect(el).toHaveClass("pill-link");
    expect(el).toHaveTextContent("click me");
  });

  it("injected component receives children", () => {
    const Custom = ({ children }: EmptyStateLinkProps) => <button type="button">{children}</button>;

    render(
      <EmptyStateLinkProvider component={Custom}>
        <Consumer href="/help" />
      </EmptyStateLinkProvider>,
    );

    expect(screen.getByRole("button", { name: "click me" })).toBeInTheDocument();
  });

  it("nested providers: innermost component wins", () => {
    const Outer = ({ href, children }: EmptyStateLinkProps) => (
      <span data-testid="outer-link" data-href={href}>
        {children}
      </span>
    );
    const Inner = ({ href, children }: EmptyStateLinkProps) => (
      <span data-testid="inner-link" data-href={href}>
        {children}
      </span>
    );

    render(
      <EmptyStateLinkProvider component={Outer}>
        <EmptyStateLinkProvider component={Inner}>
          <Consumer href="/inner" />
        </EmptyStateLinkProvider>
      </EmptyStateLinkProvider>,
    );

    expect(screen.getByTestId("inner-link")).toBeInTheDocument();
    expect(screen.queryByTestId("outer-link")).not.toBeInTheDocument();
  });
});
