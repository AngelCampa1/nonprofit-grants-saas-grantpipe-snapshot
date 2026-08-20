import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TopbarLeft, TopbarRight, TopbarRoot } from "./topbar";

describe("TopbarRoot", () => {
  it("renders children", () => {
    render(<TopbarRoot>Topbar content</TopbarRoot>);
    expect(screen.getByText("Topbar content")).toBeInTheDocument();
  });

  it("sets data-slot='topbar-root'", () => {
    const { container } = render(<TopbarRoot>Content</TopbarRoot>);
    expect(container.firstChild).toHaveAttribute("data-slot", "topbar-root");
  });

  it("applies custom className", () => {
    const { container } = render(<TopbarRoot className="bg-white">Content</TopbarRoot>);
    expect(container.firstChild).toHaveClass("bg-white");
  });

  it("accepts custom height prop and applies it as inline style", () => {
    const { container } = render(<TopbarRoot height="64px">Content</TopbarRoot>);
    const el = container.firstChild as HTMLElement;
    expect(el.getAttribute("style")).toContain("64px");
  });

  it("accepts custom sidebarWidth prop and applies it as inline style", () => {
    const { container } = render(<TopbarRoot sidebarWidth="280px">Content</TopbarRoot>);
    const el = container.firstChild as HTMLElement;
    expect(el.getAttribute("style")).toContain("280px");
  });

  it("uses the topbar height token when not specified", () => {
    const { container } = render(<TopbarRoot>Content</TopbarRoot>);
    const el = container.firstChild as HTMLElement;
    expect(el.style.getPropertyValue("--topbar-height")).toBe(
      "var(--spacing-layout-topbar-height)",
    );
  });

  it("uses the sidebar token when sidebarWidth is not specified", () => {
    const { container } = render(<TopbarRoot>Content</TopbarRoot>);
    const el = container.firstChild as HTMLElement;
    expect(el.style.getPropertyValue("--topbar-sidebar-width")).toBe(
      "var(--spacing-layout-sidebar)",
    );
  });

  it("keeps the topbar anchored to the full viewport on mobile while preserving desktop sidebar offset", () => {
    const { container } = render(<TopbarRoot>Content</TopbarRoot>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("left-0");
    expect(el.className).toContain("md:left-[var(--topbar-sidebar-width)]");
  });
});

describe("TopbarLeft", () => {
  it("sets data-slot='topbar-left'", () => {
    const { container } = render(<TopbarLeft>Left content</TopbarLeft>);
    expect(container.firstChild).toHaveAttribute("data-slot", "topbar-left");
  });

  it("renders children", () => {
    render(<TopbarLeft>Page title</TopbarLeft>);
    expect(screen.getByText("Page title")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<TopbarLeft className="flex-1">Content</TopbarLeft>);
    expect(container.firstChild).toHaveClass("flex-1");
  });
});

describe("TopbarRight", () => {
  it("sets data-slot='topbar-right'", () => {
    const { container } = render(<TopbarRight>Right content</TopbarRight>);
    expect(container.firstChild).toHaveAttribute("data-slot", "topbar-right");
  });

  it("renders children", () => {
    render(<TopbarRight>Action icons</TopbarRight>);
    expect(screen.getByText("Action icons")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<TopbarRight className="gap-2">Content</TopbarRight>);
    expect(container.firstChild).toHaveClass("gap-2");
  });
});

describe("Topbar composition", () => {
  it("composes a full topbar with left and right slots", () => {
    const { container } = render(
      <TopbarRoot>
        <TopbarLeft>
          <span>Dashboard</span>
        </TopbarLeft>
        <TopbarRight>
          <button type="button">Notifications</button>
        </TopbarRight>
      </TopbarRoot>,
    );

    expect(container.querySelector("[data-slot='topbar-root']")).toBeInTheDocument();
    expect(container.querySelector("[data-slot='topbar-left']")).toBeInTheDocument();
    expect(container.querySelector("[data-slot='topbar-right']")).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
  });
});
