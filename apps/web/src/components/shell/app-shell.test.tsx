import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import React from "react";

vi.mock("@grantpipe/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@grantpipe/ui")>();
  return {
    ...actual,
  };
});

import { AppShell } from "./app-shell";

describe("AppShell", () => {
  describe("default variant", () => {
    it("renders children", () => {
      render(
        <AppShell>
          <div data-testid="outlet">content</div>
        </AppShell>,
      );
      expect(screen.getByTestId("outlet")).toBeInTheDocument();
    });

    it("renders the sidebar slot when provided", () => {
      render(
        <AppShell sidebar={<nav data-testid="sidebar">sidebar</nav>}>
          <div>children</div>
        </AppShell>,
      );
      expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    });

    it("renders the topbar slot when provided", () => {
      render(
        <AppShell topbar={<header data-testid="topbar">topbar</header>}>
          <div>children</div>
        </AppShell>,
      );
      expect(screen.getByTestId("topbar")).toBeInTheDocument();
    });

    it("reserves topbar space above the content stack when a fixed topbar is present", () => {
      const { container } = render(
        <AppShell topbar={<header data-testid="topbar">topbar</header>}>
          <div>children</div>
        </AppShell>,
      );
      const contentStack = container.querySelector(".flex.min-h-screen.min-w-0.flex-col > div");
      expect(contentStack?.className).toContain("pt-[var(--spacing-layout-topbar-offset)]");
    });

    it("offsets beforeMain content below the fixed topbar", () => {
      const { container } = render(
        <AppShell
          topbar={<header data-testid="topbar">topbar</header>}
          beforeMain={<div data-testid="before-main">before</div>}
        >
          <div>children</div>
        </AppShell>,
      );
      const contentStack = container.querySelector(".flex.min-h-screen.min-w-0.flex-col > div");
      expect(contentStack?.className).toContain("pt-[var(--spacing-layout-topbar-offset)]");
      expect(screen.getByTestId("before-main")).toBeInTheDocument();
    });

    it("renders beforeMain slot when provided", () => {
      render(
        <AppShell beforeMain={<div data-testid="before-main">before</div>}>
          <div>children</div>
        </AppShell>,
      );
      expect(screen.getByTestId("before-main")).toBeInTheDocument();
    });

    it("renders afterMain slot when provided", () => {
      render(
        <AppShell afterMain={<div data-testid="after-main">after</div>}>
          <div>children</div>
        </AppShell>,
      );
      expect(screen.getByTestId("after-main")).toBeInTheDocument();
    });

    it("does not render sidebar area when no sidebar prop is passed", () => {
      const { container } = render(
        <AppShell>
          <div>children</div>
        </AppShell>,
      );
      // The sidebar wrapper (hidden md:block) should not be present
      expect(container.querySelector(".hidden.md\\:block")).toBeNull();
    });

    it("uses the sidebar token when sidebarCollapsed is false and sidebar is provided", () => {
      const { container } = render(
        <AppShell sidebarCollapsed={false} sidebar={<nav>sidebar</nav>}>
          <div>children</div>
        </AppShell>,
      );
      const root = container.firstChild as HTMLElement;
      expect(root.style.gridTemplateColumns).toBe("var(--spacing-layout-sidebar) minmax(0,1fr)");
    });

    it("uses the collapsed sidebar token when sidebarCollapsed is true and sidebar is provided", () => {
      const { container } = render(
        <AppShell sidebarCollapsed={true} sidebar={<nav>sidebar</nav>}>
          <div>children</div>
        </AppShell>,
      );
      const root = container.firstChild as HTMLElement;
      expect(root.style.gridTemplateColumns).toBe(
        "var(--spacing-layout-sidebar-collapsed) minmax(0,1fr)",
      );
    });

    it("constrains main content with the shell layout token", () => {
      const { container } = render(
        <AppShell>
          <div>children</div>
        </AppShell>,
      );
      const inner = container.querySelector("main > div");
      expect(inner).not.toBeNull();
      expect(inner?.className).toContain("max-w-layout-shell");
      expect(inner?.className).not.toContain("max-w-[1400px]");
    });

    it("reserves bottom space so content clears the fixed help launcher", () => {
      const { container } = render(
        <AppShell>
          <div>children</div>
        </AppShell>,
      );
      const inner = container.querySelector("main > div");
      expect(inner).not.toBeNull();
      expect(inner?.className).toContain("pb-24");
    });

    it("does not apply inline grid style when no sidebar is provided", () => {
      const { container } = render(
        <AppShell sidebarCollapsed={false}>
          <div>children</div>
        </AppShell>,
      );
      const root = container.firstChild as HTMLElement;
      expect(root.style.gridTemplateColumns).toBe("");
    });
  });

  describe("minimal variant", () => {
    it("renders children in minimal variant", () => {
      render(
        <AppShell variant="minimal">
          <div data-testid="outlet">content</div>
        </AppShell>,
      );
      expect(screen.getByTestId("outlet")).toBeInTheDocument();
    });

    it("does NOT render sidebar slot in minimal variant", () => {
      render(
        <AppShell variant="minimal" sidebar={<nav data-testid="sidebar">sidebar</nav>}>
          <div>children</div>
        </AppShell>,
      );
      // In minimal variant, sidebar prop is ignored — no sidebar slot rendered
      expect(screen.queryByTestId("sidebar")).not.toBeInTheDocument();
    });

    it("does NOT render topbar slot in minimal variant", () => {
      render(
        <AppShell variant="minimal" topbar={<header data-testid="topbar">topbar</header>}>
          <div>children</div>
        </AppShell>,
      );
      expect(screen.queryByTestId("topbar")).not.toBeInTheDocument();
    });

    it("renders afterMain slot in minimal variant", () => {
      render(
        <AppShell variant="minimal" afterMain={<div data-testid="after-main">after</div>}>
          <div>children</div>
        </AppShell>,
      );
      expect(screen.getByTestId("after-main")).toBeInTheDocument();
    });

    it("wraps content in a full-height background container", () => {
      const { container } = render(
        <AppShell variant="minimal">
          <div>children</div>
        </AppShell>,
      );
      expect(container.querySelector(".min-h-screen")).toBeInTheDocument();
    });

    it("renders main#main-content with tabIndex -1 in minimal variant", () => {
      const { container } = render(
        <AppShell variant="minimal">
          <div>children</div>
        </AppShell>,
      );
      const main = container.querySelector("main#main-content");
      expect(main).not.toBeNull();
      expect(main).toHaveAttribute("tabindex", "-1");
    });
  });

  describe("skip-link target — FIX 4 WEB-SHELL-06", () => {
    it("renders main#main-content with tabIndex -1 in default variant", () => {
      const { container } = render(
        <AppShell>
          <div>children</div>
        </AppShell>,
      );
      const main = container.querySelector("main#main-content");
      expect(main).not.toBeNull();
      expect(main).toHaveAttribute("tabindex", "-1");
    });
  });
});
