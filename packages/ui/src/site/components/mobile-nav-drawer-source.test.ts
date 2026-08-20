import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function readSource(): string {
  return readFileSync(resolve(import.meta.dirname, "./mobile-nav-drawer.astro"), "utf8");
}

describe("mobile-nav-drawer source regressions", () => {
  it("defaults the id to mobile-nav-drawer", () => {
    const source = readSource();

    expect(source).toContain('id = "mobile-nav-drawer"');
  });

  it("defaults the drawerLabel to Navigation", () => {
    const source = readSource();

    expect(source).toContain('drawerLabel = "Navigation"');
  });

  it("uses role=dialog and aria-modal=true on the panel", () => {
    const source = readSource();

    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
  });

  it("exposes a trigger named slot with a default hamburger fallback", () => {
    const source = readSource();

    expect(source).toContain('Astro.slots.has("trigger")');
    expect(source).toContain('<slot name="trigger"');
    expect(source).toContain("mobile-drawer-hamburger");
  });

  it("hamburger button meets the 48px minimum tap target requirement", () => {
    const source = readSource();

    expect(source).toContain("min-width: 3rem");
    expect(source).toContain("min-height: 3rem");
  });

  it("renders the square hamburger icon button as a pill per the buttons-are-pills canon", () => {
    const source = readSource();

    // The hamburger is a 48x48 square icon button; canon requires square icon
    // buttons to be circular (full radius), not a rounded square.
    const hamburgerBlock = source.match(/\.mobile-drawer-hamburger\s*\{[\s\S]*?\}/)?.[0] ?? "";
    expect(hamburgerBlock).toContain("border-radius: 9999px");
    expect(hamburgerBlock).not.toContain("border-radius: 0.375rem");
  });

  it("implements aria-expanded toggling on the trigger button", () => {
    const source = readSource();

    expect(source).toContain('setAttribute("aria-expanded", "true")');
    expect(source).toContain('setAttribute("aria-expanded", "false")');
  });

  it("traps focus within the panel using Tab and Shift+Tab", () => {
    const source = readSource();

    expect(source).toContain('e.key === "Tab"');
    expect(source).toContain("e.shiftKey");
    expect(source).toContain("getFocusable(panel)");
  });

  it("closes on ESC keydown", () => {
    const source = readSource();

    expect(source).toContain('e.key === "Escape"');
    expect(source).toContain("close()");
  });

  it("closes when a backdrop click occurs outside the panel", () => {
    const source = readSource();

    expect(source).toContain("data-mobile-drawer-backdrop");
    expect(source).toContain("backdrop?.addEventListener");
  });

  it("locks body scroll while the drawer is open", () => {
    const source = readSource();

    expect(source).toContain("lockScroll");
    expect(source).toContain("unlockScroll");
  });

  it("closes on any anchor link click inside the panel", () => {
    const source = readSource();

    expect(source).toContain("e.target instanceof HTMLAnchorElement");
    expect(source).toContain('panel.addEventListener("click"');
  });

  it("unlocks scroll before astro:before-swap to prevent stuck body scroll", () => {
    const source = readSource();

    expect(source).toContain("astro:before-swap");
    expect(source).toContain("unlockScroll()");
  });

  it("hides the root element at min-width 768px so desktop nav takes over", () => {
    const source = readSource();

    expect(source).toContain("@media (min-width: 768px)");
    expect(source).toContain("display: none");
  });

  it("re-initializes on astro:page-load with a per-root bound guard so ViewTransitions soft navigation doesn't leave the drawer dead", () => {
    const source = readSource();

    expect(source).toContain("function initMobileDrawers()");
    expect(source).toContain('root.dataset.mobileDrawerBound === "true"');
    expect(source).toContain('root.dataset.mobileDrawerBound = "true"');
    expect(source).toContain("initMobileDrawers();");
    expect(source).toContain('document.addEventListener("astro:page-load", initMobileDrawers)');
  });

  it("cleans up document listeners on astro:before-swap and re-registers on astro:page-load (no accumulation across navigations)", () => {
    const source = readSource();

    // The drawer re-inits on every soft navigation...
    expect(source).toContain('document.addEventListener("astro:page-load", initMobileDrawers)');
    // ...and each init's before-swap cleanup unlocks scroll AND removes the
    // keydown listener it added, so document-level listeners don't pile up.
    // Because init re-runs per navigation, this cleanup still fires every nav.
    expect(source).toContain("astro:before-swap");
    expect(source).toContain("unlockScroll()");
    expect(source).toContain('document.removeEventListener("keydown", handleKeydown)');
  });

  it("keeps the Props contract free of any", () => {
    const source = readSource();

    expect(source).not.toContain(": any");
    expect(source).toContain("id?: string");
    expect(source).toContain("drawerLabel?: string");
    expect(source).toContain("class?: string");
  });
});
