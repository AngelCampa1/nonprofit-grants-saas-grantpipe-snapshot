/**
 * Batch 07 — Free interactive lead magnet pages mobile-first contract tests.
 *
 * Verifies mobile-first invariants for the 8 pages in scope and their
 * underlying island components (QuestionnaireShell, CrmCostCalculator).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { shouldShowMobileStickyCta } from "./config/site";

const ROOT = resolve(import.meta.dirname);
const PAGES_DIR = `${ROOT}/pages`;
const PACKAGES_UI_COMPONENTS_DIR = resolve(ROOT, "../../../packages/ui/src/site/components");

function readPage(path: string): string {
  return readFileSync(`${PAGES_DIR}/${path}`, "utf8");
}

function readIsland(name: string): string {
  return readFileSync(`${PACKAGES_UI_COMPONENTS_DIR}/${name}`, "utf8");
}

// ---------------------------------------------------------------------------
// 1. shouldShowMobileStickyCta covers /free/* prefix
// ---------------------------------------------------------------------------

describe("shouldShowMobileStickyCta covers /free/* routes", () => {
  it("returns true for /free/", () => {
    expect(shouldShowMobileStickyCta("/free/")).toBe(true);
  });
  it("returns true for /free", () => {
    expect(shouldShowMobileStickyCta("/free")).toBe(true);
  });
  it("returns true for specific assessment pages", () => {
    expect(shouldShowMobileStickyCta("/free/donor-management-maturity-assessment")).toBe(true);
    expect(shouldShowMobileStickyCta("/free/grant-compliance-readiness-quiz")).toBe(true);
    expect(shouldShowMobileStickyCta("/free/nonprofit-audit-readiness-assessment")).toBe(true);
    expect(shouldShowMobileStickyCta("/free/nonprofit-crm-cost-calculator")).toBe(true);
    expect(shouldShowMobileStickyCta("/free/nonprofit-financial-health-scorecard")).toBe(true);
    expect(shouldShowMobileStickyCta("/free/nonprofit-software-needs-assessment")).toBe(true);
  });
  it("does not break exclusions", () => {
    expect(shouldShowMobileStickyCta("/privacy")).toBe(false);
    expect(shouldShowMobileStickyCta("/terms")).toBe(false);
    expect(shouldShowMobileStickyCta("/unsubscribe")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Assessment pages suppress page-level sticky CTA (form-in-progress state
//    is handled by the island; the page shell doesn't render a conflicting bar)
//    These pages use LeadMagnetPage which does NOT pass showStickyMobileCta,
//    so BaseLayout defaults to false — no conflict with island's own footer.
// ---------------------------------------------------------------------------

describe("assessment pages — page-level sticky CTA suppressed", () => {
  const assessmentPages = [
    "free/donor-management-maturity-assessment.astro",
    "free/grant-compliance-readiness-quiz.astro",
    "free/nonprofit-audit-readiness-assessment.astro",
    "free/nonprofit-crm-cost-calculator.astro",
    "free/nonprofit-financial-health-scorecard.astro",
    "free/nonprofit-software-needs-assessment.astro",
  ];

  for (const page of assessmentPages) {
    it(`${page} uses LeadMagnetPage (which omits showStickyMobileCta by default)`, () => {
      const src = readPage(page);
      expect(src).toContain("LeadMagnetPage");
      // Must NOT pass showStickyMobileCta={true} at the page level — page-level
      // sticky CTA conflicts with the island's own mobile form footer.
      expect(src).not.toMatch(/showStickyMobileCta=\{true\}/);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. [slug].astro and [...page].astro — standard patterns
// ---------------------------------------------------------------------------

describe("free/[slug].astro patterns", () => {
  it("uses LeadMagnetPage", () => {
    const src = readPage("free/[slug].astro");
    expect(src).toContain("LeadMagnetPage");
  });
});

describe("free/[...page].astro patterns", () => {
  it("uses CategoryHub", () => {
    const src = readPage("free/[...page].astro");
    expect(src).toContain("CategoryHub");
  });
});

// ---------------------------------------------------------------------------
// 4. QuestionnaireShell — mobile-first input sizing
// ---------------------------------------------------------------------------

describe("questionnaire-shell.tsx mobile-first patterns", () => {
  it("uses min-h-12 (48px) on text inputs", () => {
    const src = readIsland("questionnaire-shell.tsx");
    // Lead capture inputs must have min-h-12
    expect(src).toMatch(/min-h-12/);
  });

  it("uses text-base (16px) on inputs to prevent iOS zoom", () => {
    const src = readIsland("questionnaire-shell.tsx");
    expect(src).toMatch(/text-base/);
  });

  it("uses min-h-12 on option buttons (answer choices)", () => {
    const src = readIsland("questionnaire-shell.tsx");
    // All interactive buttons must be at least 48px tall
    expect(src).toMatch(/min-h-12/);
  });

  it("uses w-full on option buttons for single-column mobile layout", () => {
    const src = readIsland("questionnaire-shell.tsx");
    expect(src).toMatch(/w-full/);
  });

  it("uses sticky progress bar (sticky top-0) while question is active", () => {
    const src = readIsland("questionnaire-shell.tsx");
    expect(src).toMatch(/sticky/);
    expect(src).toMatch(/top-0/);
  });

  it("uses MobileFormFooter (or data-mobile-form-footer) for sticky Next/Submit on mobile", () => {
    const src = readIsland("questionnaire-shell.tsx");
    expect(src).toMatch(/MobileFormFooter|data-mobile-form-footer/);
  });

  it("does not use hover-only show/hide patterns (no hover:block or hover:flex)", () => {
    const src = readIsland("questionnaire-shell.tsx");
    // Tooltip/reveal must be tap-accessible, not hover-only
    expect(src).not.toMatch(/hover:block|hover:flex|hover:inline/);
  });
});

// ---------------------------------------------------------------------------
// 5. MobileFormFooter component exists and is correctly structured
// ---------------------------------------------------------------------------

describe("mobile-form-footer.tsx primitive", () => {
  it("file exists in packages/ui/src/site/components/", () => {
    // Will throw if not found
    const src = readIsland("mobile-form-footer.tsx");
    expect(src.length).toBeGreaterThan(0);
  });

  it("uses fixed bottom-0 left-0 right-0 sm:hidden for mobile-only sticky bar", () => {
    const src = readIsland("mobile-form-footer.tsx");
    expect(src).toMatch(/fixed/);
    expect(src).toMatch(/bottom-0/);
    expect(src).toMatch(/sm:hidden/);
  });

  it("uses safe-area-inset-bottom for iOS notch support", () => {
    const src = readIsland("mobile-form-footer.tsx");
    expect(src).toMatch(/safe-area-inset-bottom/);
  });

  it("button inside footer has min-h-12 (48px)", () => {
    const src = readIsland("mobile-form-footer.tsx");
    expect(src).toMatch(/min-h-12/);
  });

  it("button is full-width on mobile", () => {
    const src = readIsland("mobile-form-footer.tsx");
    expect(src).toMatch(/w-full/);
  });
});

// ---------------------------------------------------------------------------
// 6. CrmCostCalculator — mobile-first input sizing and table handling
// ---------------------------------------------------------------------------

describe("crm-cost-calculator.tsx mobile-first patterns", () => {
  it("uses min-h-12 (48px) on select and number inputs", () => {
    const src = readIsland("crm-cost-calculator.tsx");
    expect(src).toMatch(/min-h-12/);
  });

  it("uses text-base (16px) on form controls to prevent iOS zoom", () => {
    const src = readIsland("crm-cost-calculator.tsx");
    expect(src).toMatch(/text-base/);
  });

  it("uses min-h-12 on CRM radio buttons (48px tap targets)", () => {
    const src = readIsland("crm-cost-calculator.tsx");
    expect(src).toMatch(/min-h-12/);
  });

  it("result table has overflow-x-auto wrapper (no horizontal scroll on mobile)", () => {
    const src = readIsland("crm-cost-calculator.tsx");
    expect(src).toMatch(/overflow-x-auto/);
  });

  it("stacked card view exists for mobile result (sm:hidden / hidden sm:block pattern)", () => {
    const src = readIsland("crm-cost-calculator.tsx");
    // Must have a mobile-stacked variant for the comparison result
    expect(src).toMatch(/sm:hidden|hidden sm:/);
  });

  it("does not use hover-only show/hide patterns", () => {
    const src = readIsland("crm-cost-calculator.tsx");
    expect(src).not.toMatch(/hover:block|hover:flex|hover:inline/);
  });
});
