import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  scrollMask,
  SidebarFooter,
  SidebarHeader,
  SidebarNav,
  SidebarNavItem,
  SidebarNavSection,
  SidebarRoot,
} from "./sidebar";

/**
 * Stub the layout-derived scroll metrics jsdom never computes, so the
 * SidebarNav overflow detection has something real to read.
 */
function stubScrollMetrics(
  el: HTMLElement,
  {
    scrollTop,
    clientHeight,
    scrollHeight,
  }: { scrollTop: number; clientHeight: number; scrollHeight: number },
) {
  Object.defineProperty(el, "scrollTop", { configurable: true, value: scrollTop });
  Object.defineProperty(el, "clientHeight", { configurable: true, value: clientHeight });
  Object.defineProperty(el, "scrollHeight", { configurable: true, value: scrollHeight });
}

describe("SidebarRoot", () => {
  it("renders children", () => {
    render(<SidebarRoot>Content</SidebarRoot>);
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("sets data-slot='sidebar-root'", () => {
    const { container } = render(<SidebarRoot>Content</SidebarRoot>);
    expect(container.firstChild).toHaveAttribute("data-slot", "sidebar-root");
  });

  it("applies custom className", () => {
    const { container } = render(<SidebarRoot className="custom-class">Content</SidebarRoot>);
    expect(container.firstChild).toHaveClass("custom-class");
  });

  it("accepts custom width prop", () => {
    const { container } = render(<SidebarRoot width="280px">Content</SidebarRoot>);
    const el = container.firstChild as HTMLElement;
    expect(el.style.getPropertyValue("--sidebar-width") || el.getAttribute("style")).toContain(
      "280px",
    );
  });

  it("applies transition-[width] classes for animated collapse", () => {
    const { container } = render(<SidebarRoot>Content</SidebarRoot>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("transition-[width]");
    expect(el.className).toContain("duration-150");
    expect(el.className).toContain("ease-in-out");
  });
});

describe("SidebarHeader", () => {
  it("sets data-slot='sidebar-header'", () => {
    const { container } = render(<SidebarHeader>Logo</SidebarHeader>);
    expect(container.firstChild).toHaveAttribute("data-slot", "sidebar-header");
  });

  it("renders children", () => {
    render(<SidebarHeader>Logo area</SidebarHeader>);
    expect(screen.getByText("Logo area")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<SidebarHeader className="border-b">Logo</SidebarHeader>);
    expect(container.firstChild).toHaveClass("border-b");
  });
});

describe("SidebarNav", () => {
  it("sets data-slot='sidebar-nav'", () => {
    const { container } = render(<SidebarNav>Nav content</SidebarNav>);
    expect(container.firstChild).toHaveAttribute("data-slot", "sidebar-nav");
  });

  it("renders children", () => {
    render(<SidebarNav>Nav items</SidebarNav>);
    expect(screen.getByText("Nav items")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<SidebarNav className="py-4">Nav</SidebarNav>);
    expect(container.firstChild).toHaveClass("py-4");
  });

  it("shows no scroll-fade affordance when content fits without overflow", () => {
    const { container } = render(<SidebarNav>Nav</SidebarNav>);
    const nav = container.firstChild as HTMLElement;
    // jsdom defaults (all metrics 0) => not scrollable in either direction
    expect(nav).not.toHaveAttribute("data-can-scroll-up");
    expect(nav).not.toHaveAttribute("data-can-scroll-down");
    expect(nav.style.maskImage).toBe("");
  });

  it("fades the bottom edge when more content lies below the fold", () => {
    const { container } = render(<SidebarNav>Nav</SidebarNav>);
    const nav = container.firstChild as HTMLElement;
    stubScrollMetrics(nav, { scrollTop: 0, clientHeight: 100, scrollHeight: 400 });
    act(() => {
      fireEvent.scroll(nav);
    });
    expect(nav).not.toHaveAttribute("data-can-scroll-up");
    expect(nav).toHaveAttribute("data-can-scroll-down", "true");
    expect(nav.style.maskImage).toContain("transparent");
  });

  it("fades the top edge when scrolled to the very bottom", () => {
    const { container } = render(<SidebarNav>Nav</SidebarNav>);
    const nav = container.firstChild as HTMLElement;
    stubScrollMetrics(nav, { scrollTop: 300, clientHeight: 100, scrollHeight: 400 });
    act(() => {
      fireEvent.scroll(nav);
    });
    expect(nav).toHaveAttribute("data-can-scroll-up", "true");
    expect(nav).not.toHaveAttribute("data-can-scroll-down");
    expect(nav.style.maskImage).toContain("transparent");
  });

  it("fades both edges when scrolled to the middle of a long list", () => {
    const { container } = render(<SidebarNav>Nav</SidebarNav>);
    const nav = container.firstChild as HTMLElement;
    stubScrollMetrics(nav, { scrollTop: 150, clientHeight: 100, scrollHeight: 400 });
    act(() => {
      fireEvent.scroll(nav);
    });
    expect(nav).toHaveAttribute("data-can-scroll-up", "true");
    expect(nav).toHaveAttribute("data-can-scroll-down", "true");
    expect(nav.style.maskImage).toContain("calc(100% - 16px)");
  });
});

describe("scrollMask", () => {
  it("returns undefined when neither edge can scroll", () => {
    expect(scrollMask(false, false)).toBeUndefined();
  });

  it("fades only the top when the top edge can scroll", () => {
    const mask = scrollMask(true, false);
    expect(mask).toBe("linear-gradient(to bottom, transparent, black 16px)");
  });

  it("fades only the bottom when the bottom edge can scroll", () => {
    const mask = scrollMask(false, true);
    expect(mask).toBe("linear-gradient(to bottom, black calc(100% - 16px), transparent)");
  });

  it("fades both edges when both can scroll", () => {
    const mask = scrollMask(true, true);
    expect(mask).toBe(
      "linear-gradient(to bottom, transparent, black 16px, black calc(100% - 16px), transparent)",
    );
  });
});

describe("SidebarFooter", () => {
  it("sets data-slot='sidebar-footer'", () => {
    const { container } = render(<SidebarFooter>Footer</SidebarFooter>);
    expect(container.firstChild).toHaveAttribute("data-slot", "sidebar-footer");
  });

  it("renders children", () => {
    render(<SidebarFooter>User menu</SidebarFooter>);
    expect(screen.getByText("User menu")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<SidebarFooter className="border-t">Footer</SidebarFooter>);
    expect(container.firstChild).toHaveClass("border-t");
  });
});

describe("SidebarNavItem", () => {
  it("sets data-slot='sidebar-nav-item'", () => {
    const { container } = render(<SidebarNavItem label="Dashboard" />);
    expect(container.firstChild).toHaveAttribute("data-slot", "sidebar-nav-item");
  });

  it("renders the label", () => {
    render(<SidebarNavItem label="Grants" />);
    expect(screen.getByText("Grants")).toBeInTheDocument();
  });

  it("renders an icon when provided", () => {
    render(<SidebarNavItem label="Grants" icon={<span data-testid="icon">G</span>} />);
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("does not render icon slot when icon is not provided", () => {
    render(<SidebarNavItem label="Grants" />);
    expect(document.querySelector("[data-slot='sidebar-nav-item-icon']")).not.toBeInTheDocument();
  });

  it("applies active state attribute when isActive=true", () => {
    const { container } = render(<SidebarNavItem label="Dashboard" isActive />);
    expect(container.firstChild).toHaveAttribute("data-active", "true");
  });

  it("does not apply active state when isActive=false", () => {
    const { container } = render(<SidebarNavItem label="Dashboard" isActive={false} />);
    expect(container.firstChild).not.toHaveAttribute("data-active", "true");
  });

  it("applies custom className", () => {
    const { container } = render(<SidebarNavItem label="Grants" className="font-bold" />);
    expect(container.firstChild).toHaveClass("font-bold");
  });

  it("renders as child element when asChild=true", () => {
    render(
      <SidebarNavItem label="Grants" asChild>
        <a href="/grants">Grants</a>
      </SidebarNavItem>,
    );
    expect(screen.getByRole("link", { name: /Grants/ })).toBeInTheDocument();
  });

  it("applies nav item styles to the child element when asChild=true", () => {
    render(
      <SidebarNavItem label="Grants" asChild>
        <a href="/grants">Grants</a>
      </SidebarNavItem>,
    );
    const link = screen.getByRole("link", { name: /Grants/ });
    expect(link).toHaveAttribute("data-slot", "sidebar-nav-item");
  });

  it("uses pill (rounded-full) item radius per the button design canon", () => {
    const { container } = render(<SidebarNavItem label="Dashboard" />);
    expect(container.firstChild).toHaveClass("rounded-full");
    expect(container.firstChild).not.toHaveClass("rounded-lg");
    expect(container.firstChild).not.toHaveClass("rounded-md");
  });

  it("applies active state to child element when asChild=true and isActive=true", () => {
    render(
      <SidebarNavItem label="Dashboard" isActive asChild>
        <a href="/dashboard">Dashboard</a>
      </SidebarNavItem>,
    );
    const link = screen.getByRole("link", { name: /Dashboard/ });
    expect(link).toHaveAttribute("data-active", "true");
  });
});

describe("SidebarNavSection", () => {
  it("sets data-slot='sidebar-nav-section'", () => {
    const { container } = render(
      <SidebarNavSection>
        <SidebarNavItem label="Item" />
      </SidebarNavSection>,
    );
    expect(container.firstChild).toHaveAttribute("data-slot", "sidebar-nav-section");
  });

  it("renders section label when provided", () => {
    render(
      <SidebarNavSection label="Management">
        <SidebarNavItem label="Item" />
      </SidebarNavSection>,
    );
    expect(screen.getByText("Management")).toBeInTheDocument();
  });

  it("does not render label element when omitted", () => {
    render(
      <SidebarNavSection>
        <SidebarNavItem label="Item" />
      </SidebarNavSection>,
    );
    expect(
      document.querySelector("[data-slot='sidebar-nav-section-label']"),
    ).not.toBeInTheDocument();
  });

  it("renders children", () => {
    render(
      <SidebarNavSection>
        <SidebarNavItem label="Grants" />
        <SidebarNavItem label="Donors" />
      </SidebarNavSection>,
    );
    expect(screen.getByText("Grants")).toBeInTheDocument();
    expect(screen.getByText("Donors")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <SidebarNavSection className="mb-4">
        <SidebarNavItem label="Item" />
      </SidebarNavSection>,
    );
    expect(container.firstChild).toHaveClass("mb-4");
  });
});

describe("Sidebar composition", () => {
  it("composes full sidebar without nested card wrappers", () => {
    const { container } = render(
      <SidebarRoot>
        <SidebarHeader>Logo</SidebarHeader>
        <SidebarNav>
          <SidebarNavSection label="Main">
            <SidebarNavItem label="Dashboard" isActive />
            <SidebarNavItem label="Grants" />
          </SidebarNavSection>
        </SidebarNav>
        <SidebarFooter>User</SidebarFooter>
      </SidebarRoot>,
    );

    expect(container.querySelector("[data-slot='sidebar-root']")).toBeInTheDocument();
    expect(container.querySelector("[data-slot='sidebar-header']")).toBeInTheDocument();
    expect(container.querySelector("[data-slot='sidebar-nav']")).toBeInTheDocument();
    expect(container.querySelector("[data-slot='sidebar-footer']")).toBeInTheDocument();
    // Ensure no nested rounded border shadow card wrappers (anti-pattern check)
    const cardWrappers = container.querySelectorAll(".rounded-3xl.border.shadow-sm");
    expect(cardWrappers).toHaveLength(0);
  });
});

describe("SidebarRoot collapsed behavior", () => {
  it("uses the collapsed sidebar token when collapsed=true", () => {
    const { container } = render(<SidebarRoot collapsed>Content</SidebarRoot>);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe("var(--spacing-layout-sidebar-collapsed)");
  });

  it("uses the width prop when collapsed=false", () => {
    const { container } = render(
      <SidebarRoot collapsed={false} width="280px">
        Content
      </SidebarRoot>,
    );
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe("280px");
  });

  it("uses the sidebar token when collapsed=false and no width prop", () => {
    const { container } = render(<SidebarRoot collapsed={false}>Content</SidebarRoot>);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe("var(--spacing-layout-sidebar)");
  });
});

describe("SidebarNavSection collapsed behavior", () => {
  it("hides label text when sidebar is collapsed", () => {
    render(
      <SidebarRoot collapsed>
        <SidebarNavSection label="Fundraising">
          <SidebarNavItem label="Donors" />
        </SidebarNavSection>
      </SidebarRoot>,
    );
    expect(
      document.querySelector("[data-slot='sidebar-nav-section-label']"),
    ).not.toBeInTheDocument();
  });

  it("shows label text when sidebar is not collapsed", () => {
    render(
      <SidebarRoot>
        <SidebarNavSection label="Fundraising">
          <SidebarNavItem label="Donors" />
        </SidebarNavSection>
      </SidebarRoot>,
    );
    expect(screen.getByText("Fundraising")).toBeInTheDocument();
  });
});

describe("SidebarNavItem collapsed behavior", () => {
  it("hides label span when sidebar is collapsed", () => {
    render(
      <SidebarRoot collapsed>
        <SidebarNavItem label="Dashboard" />
      </SidebarRoot>,
    );
    expect(document.querySelector("[data-slot='sidebar-nav-item-label']")).not.toBeInTheDocument();
  });

  it("shows label span when sidebar is not collapsed", () => {
    render(
      <SidebarRoot>
        <SidebarNavItem label="Dashboard" />
      </SidebarRoot>,
    );
    expect(document.querySelector("[data-slot='sidebar-nav-item-label']")).toBeInTheDocument();
  });

  it("adds title attribute with label when collapsed", () => {
    render(
      <SidebarRoot collapsed>
        <SidebarNavItem label="Dashboard" />
      </SidebarRoot>,
    );
    const item = document.querySelector("[data-slot='sidebar-nav-item']");
    expect(item).toHaveAttribute("title", "Dashboard");
  });

  it("does not add title attribute when not collapsed", () => {
    render(
      <SidebarRoot>
        <SidebarNavItem label="Dashboard" />
      </SidebarRoot>,
    );
    const item = document.querySelector("[data-slot='sidebar-nav-item']");
    expect(item).not.toHaveAttribute("title");
  });

  it("adds title attribute when collapsed with asChild", () => {
    render(
      <SidebarRoot collapsed>
        <SidebarNavItem label="Grants" asChild>
          <a href="/grants">Grants</a>
        </SidebarNavItem>
      </SidebarRoot>,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("title", "Grants");
  });

  it("applies justify-center and removes padding/gap when collapsed", () => {
    render(
      <SidebarRoot collapsed>
        <SidebarNavItem label="Dashboard" />
      </SidebarRoot>,
    );
    const item = document.querySelector("[data-slot='sidebar-nav-item']") as HTMLElement;
    expect(item.className).toContain("justify-center");
    expect(item.className).toContain("px-0");
    expect(item.className).toContain("gap-0");
  });

  it("does not apply collapsed centering classes when not collapsed", () => {
    render(
      <SidebarRoot>
        <SidebarNavItem label="Dashboard" />
      </SidebarRoot>,
    );
    const item = document.querySelector("[data-slot='sidebar-nav-item']") as HTMLElement;
    expect(item.className).not.toContain("justify-center");
    expect(item.className).not.toContain("px-0");
    expect(item.className).not.toContain("gap-0");
  });

  it("applies collapsed centering to asChild element when collapsed", () => {
    render(
      <SidebarRoot collapsed>
        <SidebarNavItem label="Grants" asChild>
          <a href="/grants">Grants</a>
        </SidebarNavItem>
      </SidebarRoot>,
    );
    const link = screen.getByRole("link");
    expect(link.className).toContain("justify-center");
  });
});
