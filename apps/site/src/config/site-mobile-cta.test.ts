/**
 * Tests for shouldShowMobileStickyCta — the allow-list helper that determines
 * whether a given page path should render the sticky mobile CTA bar.
 */
import { describe, expect, it } from "vitest";
import { grantCategoryPages } from "./grant-recipient-seo";
import { shouldShowMobileStickyCta, MOBILE_STICKY_CTA_EXACT_PAGES } from "./site";

describe("shouldShowMobileStickyCta", () => {
  describe("exact allow-list pages return true", () => {
    const exactPages = [
      "/",
      "/pricing",
      "/product",
      "/about",
      ...grantCategoryPages.map((page) => page.href),
      "/granthub/migration",
    ];

    for (const page of exactPages) {
      it(`returns true for ${page}`, () => {
        expect(shouldShowMobileStickyCta(page)).toBe(true);
      });

      it(`returns true for ${page}/ (trailing slash)`, () => {
        if (page !== "/") {
          expect(shouldShowMobileStickyCta(`${page}/`)).toBe(true);
        }
      });
    }
  });

  describe("dynamic prefix routes return true", () => {
    it("returns true for /compare/ prefix routes", () => {
      expect(shouldShowMobileStickyCta("/compare/grantpipe-vs-bloomerang")).toBe(true);
      expect(shouldShowMobileStickyCta("/compare/alternatives/bloomerang")).toBe(true);
    });

    it("returns true for /features/ prefix routes", () => {
      expect(shouldShowMobileStickyCta("/features/grant-management")).toBe(true);
      expect(shouldShowMobileStickyCta("/features/")).toBe(true);
    });

    it("returns true for /for/ prefix routes", () => {
      expect(shouldShowMobileStickyCta("/for/development-directors")).toBe(true);
    });

    it("returns true for /solutions/ prefix routes", () => {
      expect(shouldShowMobileStickyCta("/solutions/community-foundations")).toBe(true);
    });

    it("returns true for /integrations/ prefix routes", () => {
      expect(shouldShowMobileStickyCta("/integrations/quickbooks")).toBe(true);
    });

    it("returns true for /free/ prefix routes", () => {
      expect(shouldShowMobileStickyCta("/free/grant-compliance-checklist")).toBe(true);
    });

    it("returns true for /workflows/ prefix routes", () => {
      expect(shouldShowMobileStickyCta("/workflows/grant-close-out")).toBe(true);
    });

    it("returns true for /nonprofit-software/ prefix routes", () => {
      expect(shouldShowMobileStickyCta("/nonprofit-software/ca/los-angeles")).toBe(true);
    });

    it("returns true for /resources/ prefix routes", () => {
      expect(shouldShowMobileStickyCta("/resources/guides/grant-management")).toBe(true);
    });

    it("returns true for /glossary/ prefix routes", () => {
      expect(shouldShowMobileStickyCta("/glossary/restricted-funds")).toBe(true);
    });

    it("returns true for /lp/ prefix routes", () => {
      expect(shouldShowMobileStickyCta("/lp/grant-management-software")).toBe(true);
    });
  });

  describe("excluded pages return false", () => {
    it("returns false for /privacy", () => {
      expect(shouldShowMobileStickyCta("/privacy")).toBe(false);
    });

    it("returns false for /privacy/", () => {
      expect(shouldShowMobileStickyCta("/privacy/")).toBe(false);
    });

    it("returns false for /terms", () => {
      expect(shouldShowMobileStickyCta("/terms")).toBe(false);
    });

    it("returns false for /404", () => {
      expect(shouldShowMobileStickyCta("/404")).toBe(false);
    });

    it("returns false for /500", () => {
      expect(shouldShowMobileStickyCta("/500")).toBe(false);
    });

    it("returns false for /unsubscribe", () => {
      expect(shouldShowMobileStickyCta("/unsubscribe")).toBe(false);
    });
  });

  describe("unknown pages return false", () => {
    it("returns false for unknown top-level paths", () => {
      expect(shouldShowMobileStickyCta("/some-unknown-page")).toBe(false);
    });

    it("returns false for unknown sub-paths not under a prefix route", () => {
      expect(shouldShowMobileStickyCta("/admin/settings")).toBe(false);
    });
  });

  describe("edge cases for path normalisation", () => {
    it("handles a pathname passed without a leading slash (normalised segment falls back to full path)", () => {
      // A pathname like "pricing" (no leading slash) — normalised segment = "pricing"
      // which is not in the excluded set, and "pricing" (without leading slash) won't
      // match the exact set (which stores "/pricing"), so should return false.
      expect(shouldShowMobileStickyCta("pricing")).toBe(false);
    });

    it("handles a pathname without a leading slash for an excluded segment", () => {
      // "privacy" (no leading slash) — normalised segment = "privacy"
      // which IS in the excluded set, so should still return false.
      expect(shouldShowMobileStickyCta("privacy")).toBe(false);
    });
  });

  describe("MOBILE_STICKY_CTA_EXACT_PAGES set", () => {
    it("is exported and contains the expected pages", () => {
      expect(MOBILE_STICKY_CTA_EXACT_PAGES.has("/")).toBe(true);
      expect(MOBILE_STICKY_CTA_EXACT_PAGES.has("/pricing")).toBe(true);
      expect(MOBILE_STICKY_CTA_EXACT_PAGES.has("/about")).toBe(true);
      expect(MOBILE_STICKY_CTA_EXACT_PAGES.has("/granthub/migration")).toBe(true);
    });

    it("does not contain excluded pages", () => {
      expect(MOBILE_STICKY_CTA_EXACT_PAGES.has("/privacy")).toBe(false);
      expect(MOBILE_STICKY_CTA_EXACT_PAGES.has("/terms")).toBe(false);
      expect(MOBILE_STICKY_CTA_EXACT_PAGES.has("/404")).toBe(false);
    });
  });
});
