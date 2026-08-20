import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(__dirname, "./site-header.astro"), "utf8");

describe("site-header mobile nav source", () => {
  it("uses the trigger button as the only mobile close affordance", () => {
    expect(source).toContain("data-mobile-nav-trigger");
    expect(source).not.toContain("data-mobile-nav-close");
    expect(source).not.toContain('aria-label="Close navigation menu"');
  });

  it("keeps the simplified editorial desktop shell instead of the old pill nav wrapper", () => {
    expect(source).not.toContain("border-l border-[color-mix");
    expect(source).toContain("font-medium text-neutral-700");
    expect(source).not.toContain("uppercase tracking-[0.12em]");
    expect(source).not.toContain("site-header-shell rounded-[");
  });

  it("keeps the mobile CTA eyebrow aligned to the trial-first posture", () => {
    expect(source).toContain('mobileCtaEyebrow = "Start free trial"');
    expect(source).not.toContain('mobileCtaEyebrow = "Get started"');
  });

  it("renders Resources megamenu groups as crawlable desktop and mobile links", () => {
    expect(source).toContain("item.groups");
    expect(source).toContain("data-site-nav-group");
    expect(source).toContain("data-mobile-nav-group");
    expect(source).toContain("navGroup.links.map");
    expect(source).toContain("getMobileNavLinks(navGroup).map");
    expect(source).toContain("aria-label={`${item.label} menu`}");
  });

  it("uses mobile-priority grouped links when a nav group opts into a shorter drawer", () => {
    expect(source).toContain("function getMobileNavLinks");
    expect(source).toContain("link.mobilePriority");
    expect(source).toContain("priorityLinks.length > 0 ? priorityLinks : navGroup.links");
    expect(source.split("getMobileNavLinks(navGroup).map").length - 1).toBe(2);
  });

  it("uses the shared active matcher for generated pages and megamenu child routes", () => {
    expect(source).toContain('import { isActiveSiteNavItem } from "../lib/site-nav-active"');
    expect(source).toContain("isActiveSiteNavItem(currentPath, item, navItems)");
    expect(source).not.toContain("function isActiveNavHref");
  });

  it("ships a no-JS fallback without flashing the expanded menu before hydration", () => {
    expect(source).toContain("data-mobile-nav-fallback");
    expect(source).toContain("<noscript>");
    expect(source).not.toContain('id="mobile-nav-details" data-mobile-nav-ready="true"');
    expect(source).toContain('data-mobile-nav-overlay class="mobile-nav-overlay" hidden');
    expect(source).toContain('[data-mobile-nav-ready="true"] [data-mobile-nav-fallback]');
  });

  it("anchors the Resources megamenu under its trigger as a balanced, viewport-safe panel", () => {
    expect(source).toContain("data-site-nav-shell");
    expect(source).toContain("lg:flex");
    expect(source).not.toContain("left-1/2 top-full");
    expect(source).not.toContain("-translate-x-1/2");
    // The panel is anchored to the nav item, not stretched edge-to-edge.
    expect(source).toContain('data-site-nav-item class="relative');
    expect(source).toContain("absolute left-0 top-full");
    expect(source).not.toContain("inset-inline: max(1rem, calc((100vw - 80rem) / 2));");
    expect(source).not.toContain("grid-template-columns: repeat(4, minmax(0, 1fr));");
    // Sized to its content and clamped so it never overflows narrow viewports.
    expect(source).toContain("max-w-[calc(100vw-2rem)]");
    // Groups are balanced across two columns via multi-column flow.
    expect(source).toContain("[column-count:2]");
    expect(source).toContain("break-inside-avoid");
    // A persistent link to the full hub closes out the panel.
    expect(source).toContain("data-megamenu-footer-link");
  });

  it("supports an opt-in pill CTA shape via the ctaPill prop", () => {
    expect(source).toContain("ctaPill?: boolean");
    expect(source).toContain("ctaPill = false");
    expect(source).toContain('ctaPillVariant = ctaVariant === "primary" ? "primary" : "ghost"');
    expect(source).toContain("`gp-mkt-btn ${ctaPillVariant} md`");
    expect(source).toContain("`btn-${ctaVariant}`");
  });

  it("renders the optional promo banner and header as one sticky stack", () => {
    expect(source).toContain('import PromoBanner from "./promo-banner.astro"');
    expect(source).toContain("promoBanner?:");
    expect(source).toContain("<PromoBanner");
    expect(source).toContain("data-site-sticky-stack");
    expect(source).toContain("sticky top-0 z-50");
    expect(source).toContain('class="site-header');
    expect(source).not.toContain('class="site-header sticky top-0');
    // The banner must precede the <header id="site-header"> element inside the sticky stack.
    const bannerIndex = source.indexOf("<PromoBanner");
    const headerIndex = source.indexOf('id="site-header"');
    expect(bannerIndex).toBeGreaterThan(-1);
    expect(headerIndex).toBeGreaterThan(-1);
    expect(bannerIndex).toBeLessThan(headerIndex);
  });
});
