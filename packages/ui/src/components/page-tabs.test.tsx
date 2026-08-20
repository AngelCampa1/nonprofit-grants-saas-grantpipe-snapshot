import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentType, ReactNode } from "react";
import { PageTabs, type PageTabItem } from "./page-tabs";

interface StubLinkProps {
  to: string;
  className?: string;
  "aria-current"?: "page";
  onClick?: () => void;
  children: ReactNode;
}

const StubLink: ComponentType<StubLinkProps> = ({
  to,
  className,
  "aria-current": ariaCurrent,
  onClick,
  children,
}) => (
  <a href={to} className={className} aria-current={ariaCurrent} onClick={onClick}>
    {children}
  </a>
);

const items: PageTabItem[] = [
  { to: "/grants", label: "Overview" },
  { to: "/grants/reports", label: "Reports" },
  { to: "/grants/compliance", label: "Compliance" },
];

describe("PageTabs", () => {
  it("renders all item labels", () => {
    render(
      <PageTabs
        items={items}
        activePath="/grants"
        linkComponent={StubLink}
        ariaLabel="Grants sections"
      />,
    );

    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Reports")).toBeInTheDocument();
    expect(screen.getByText("Compliance")).toBeInTheDocument();
  });

  it("marks the exact-match active item with aria-current=page and others without it", () => {
    render(
      <PageTabs
        items={items}
        activePath="/grants/reports"
        linkComponent={StubLink}
        ariaLabel="Grants sections"
      />,
    );

    expect(screen.getByRole("link", { name: "Reports" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Compliance" })).not.toHaveAttribute("aria-current");
  });

  it("no item is active when activePath matches none exactly", () => {
    render(
      <PageTabs
        items={items}
        activePath="/grants/reports/detail"
        linkComponent={StubLink}
        ariaLabel="Grants sections"
      />,
    );

    for (const item of items) {
      expect(screen.getByRole("link", { name: item.label })).not.toHaveAttribute("aria-current");
    }
  });

  it("calls onSelect with the clicked item", () => {
    const onSelect = vi.fn();
    render(
      <PageTabs
        items={items}
        activePath="/grants"
        linkComponent={StubLink}
        ariaLabel="Grants sections"
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole("link", { name: "Reports" }));
    expect(onSelect).toHaveBeenCalledWith(items[1]);
  });

  it("does not throw when onSelect is not provided", () => {
    render(
      <PageTabs
        items={items}
        activePath="/grants"
        linkComponent={StubLink}
        ariaLabel="Grants sections"
      />,
    );
    expect(() => fireEvent.click(screen.getByRole("link", { name: "Overview" }))).not.toThrow();
  });

  it("renders a nav landmark with the given aria-label", () => {
    render(
      <PageTabs
        items={items}
        activePath="/grants"
        linkComponent={StubLink}
        ariaLabel="Grants sections"
      />,
    );

    expect(screen.getByRole("navigation", { name: "Grants sections" })).toBeInTheDocument();
  });

  it("renders links using the injected linkComponent with correct href", () => {
    render(
      <PageTabs
        items={items}
        activePath="/grants"
        linkComponent={StubLink}
        ariaLabel="Grants sections"
      />,
    );

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/grants");
    expect(screen.getByRole("link", { name: "Reports" })).toHaveAttribute(
      "href",
      "/grants/reports",
    );
    expect(screen.getByRole("link", { name: "Compliance" })).toHaveAttribute(
      "href",
      "/grants/compliance",
    );
  });

  it("merges custom className onto the nav wrapper", () => {
    const { container } = render(
      <PageTabs
        items={items}
        activePath="/grants"
        linkComponent={StubLink}
        ariaLabel="Grants sections"
        className="custom-page-tabs"
      />,
    );

    expect(container.querySelector("nav")).toHaveClass("custom-page-tabs");
  });

  it("does not render Radix tab role attributes", () => {
    const { container } = render(
      <PageTabs
        items={items}
        activePath="/grants"
        linkComponent={StubLink}
        ariaLabel="Grants sections"
      />,
    );

    expect(container.querySelector('[role="tab"]')).not.toBeInTheDocument();
    expect(container.querySelector('[role="tablist"]')).not.toBeInTheDocument();
  });
});
