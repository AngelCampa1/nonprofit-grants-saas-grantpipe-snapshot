import { describe, it, expect } from "vitest";
import { PLAN_ENTITLEMENTS } from "@grantpipe/shared";
import {
  ENTITLEMENT_LABELS,
  PLAN_DISPLAY,
  diffEntitlements,
  formatPriceCents,
  getPlanPriceCents,
} from "./plan-display";

describe("PLAN_DISPLAY", () => {
  it("exposes all current plan tiers", () => {
    expect(Object.keys(PLAN_DISPLAY).sort()).toEqual([
      "audit_ready",
      "enterprise",
      "growth",
      "starter",
    ]);
  });

  it("has Growth highlighted and others not", () => {
    expect(PLAN_DISPLAY.starter.highlighted).toBe(false);
    expect(PLAN_DISPLAY.growth.highlighted).toBe(true);
    expect(PLAN_DISPLAY.audit_ready.highlighted).toBe(false);
    expect(PLAN_DISPLAY.enterprise.highlighted).toBe(false);
  });

  it("uses expected monthly prices in cents", () => {
    expect(PLAN_DISPLAY.starter.monthlyCents).toBe(4900);
    expect(PLAN_DISPLAY.growth.monthlyCents).toBe(9900);
    expect(PLAN_DISPLAY.audit_ready.monthlyCents).toBe(19900);
    expect(PLAN_DISPLAY.enterprise.monthlyCents).toBeUndefined();
  });

  it("exposes annual public anchor prices for self-serve tiers only", () => {
    expect(PLAN_DISPLAY.starter.annualCents).toBe(46800);
    expect(PLAN_DISPLAY.enterprise.annualCents).toBeUndefined();
  });

  it("keeps annual prices below monthly x 12 for paid public tiers", () => {
    for (const tier of ["starter", "growth", "audit_ready"] as const) {
      const { monthlyCents, annualCents } = PLAN_DISPLAY[tier];
      expect(monthlyCents).toBeDefined();
      expect(annualCents).toBeDefined();
      expect(annualCents!).toBeLessThan(monthlyCents! * 12);
    }
  });

  it("populates a non-empty features list for every tier", () => {
    for (const tier of ["starter", "growth", "audit_ready"] as const) {
      expect(PLAN_DISPLAY[tier].features.length).toBeGreaterThan(0);
    }
  });
});

describe("formatPriceCents", () => {
  it("formats monthly prices with /mo suffix", () => {
    expect(formatPriceCents(4900, "monthly")).toBe("$49/mo");
    expect(formatPriceCents(9900, "monthly")).toBe("$99/mo");
  });

  it("formats annual prices with /yr suffix", () => {
    expect(formatPriceCents(46800, "annual")).toBe("$468/yr");
  });

  it("adds thousands separator for large amounts", () => {
    expect(formatPriceCents(496000, "annual")).toBe("$4,960/yr");
  });
});

describe("getPlanPriceCents", () => {
  it("returns monthly cents when cycle is monthly", () => {
    expect(getPlanPriceCents("growth", "monthly")).toBe(PLAN_DISPLAY.growth.monthlyCents);
  });

  it("returns annual cents when cycle is annual", () => {
    expect(getPlanPriceCents("growth", "annual")).toBe(PLAN_DISPLAY.growth.annualCents);
  });
});

describe("ENTITLEMENT_LABELS", () => {
  it("includes a non-empty label for every Starter entitlement key", () => {
    for (const key of Object.keys(PLAN_ENTITLEMENTS.starter)) {
      const label = ENTITLEMENT_LABELS[key as keyof typeof PLAN_ENTITLEMENTS.starter];
      expect(label, `missing label for ${key}`).toBeDefined();
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("includes activeGrantCap explicitly", () => {
    expect(ENTITLEMENT_LABELS.activeGrantCap).toBe("Active grants cap");
  });

  it("describes grant opportunities as multi-source tracking", () => {
    expect(ENTITLEMENT_LABELS.hasGrantOpportunitySearch).toBe(
      "Grants.gov search plus non-federal opportunity tracking",
    );
  });
});

describe("diffEntitlements", () => {
  it("lists features present on the higher tier but missing on the lower tier", () => {
    const lost = diffEntitlements("audit_ready", "growth");
    expect(lost).toContain("Auditor & Funder Portal");
    expect(lost).toContain("Subrecipient monitoring");
    expect(lost).toContain("Guided onboarding, import, and setup");
  });

  it("describes a higher active grants cap as a delta with formatted numbers", () => {
    const lost = diffEntitlements("growth", "starter");
    expect(lost).toContain("Higher active grants cap (10 -> 50)");
  });

  it("describes the enterprise unlimited grant cap delta", () => {
    const lost = diffEntitlements("enterprise", "audit_ready");
    expect(lost).toContain("Higher active grants cap (100 -> Unlimited)");
  });

  it("returns an empty array when comparing the same tier", () => {
    expect(diffEntitlements("growth", "growth")).toEqual([]);
  });

  it("distinguishes retained lower-tier features from Audit-Ready-only features", () => {
    const lost = diffEntitlements("audit_ready", "growth");
    expect(lost).not.toContain("Automated reminder and spend-down emails");
    // QuickBooks accounting now ships on Growth, so it is no longer lost when
    // downgrading from Audit-Ready to Growth.
    expect(lost).not.toContain("QuickBooks Online accounting integration");
    expect(lost).toContain("Restriction evidence package output");
  });
});
