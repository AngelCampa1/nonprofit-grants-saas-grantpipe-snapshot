import { describe, expect, it } from "vitest";
import {
  DEFAULT_BILLING_CYCLE,
  GRANTPIPE_GUARANTEE_COPY,
  LAUNCH_PROMO,
  PLAN_CATALOG,
  UNIVERSAL_PLAN_INCLUSIONS,
} from "./pricing";
import {
  GRANTPIPE_OS_BOILERPLATE,
  GRANTPIPE_OS_CATEGORY,
  GRANTPIPE_OS_MODULES,
  GRANTPIPE_OS_PLAN_LANGUAGE,
} from "./positioning";
import { marketingKnowledge } from "./knowledge/marketing";
import { OFFERING } from "./offering";

describe("OFFERING", () => {
  it("plans reference the same PLAN_CATALOG", () => {
    expect(OFFERING.plans).toBe(PLAN_CATALOG);
  });

  it("universalInclusions reference UNIVERSAL_PLAN_INCLUSIONS", () => {
    expect(OFFERING.universalInclusions).toBe(UNIVERSAL_PLAN_INCLUSIONS);
  });

  it("promo references LAUNCH_PROMO", () => {
    expect(OFFERING.promo).toBe(LAUNCH_PROMO);
  });

  it("guarantee matches GRANTPIPE_GUARANTEE_COPY", () => {
    expect(OFFERING.guarantee).toBe(GRANTPIPE_GUARANTEE_COPY);
  });

  it("trial references marketingKnowledge.trial", () => {
    expect(OFFERING.trial).toBe(marketingKnowledge.trial);
  });

  it("billing.defaultCycle matches DEFAULT_BILLING_CYCLE", () => {
    expect(OFFERING.billing.defaultCycle).toBe(DEFAULT_BILLING_CYCLE);
  });

  it("icp references marketingKnowledge.icp", () => {
    expect(OFFERING.icp).toBe(marketingKnowledge.icp);
  });

  it("positioning.category matches GRANTPIPE_OS_CATEGORY", () => {
    expect(OFFERING.positioning.category).toBe(GRANTPIPE_OS_CATEGORY);
  });

  it("positioning.boilerplate matches GRANTPIPE_OS_BOILERPLATE", () => {
    expect(OFFERING.positioning.boilerplate).toBe(GRANTPIPE_OS_BOILERPLATE);
  });

  it("positioning.modules references GRANTPIPE_OS_MODULES", () => {
    expect(OFFERING.positioning.modules).toBe(GRANTPIPE_OS_MODULES);
  });

  it("positioning.tagline matches marketingKnowledge productPositioning tagline", () => {
    expect(OFFERING.positioning.tagline).toBe(marketingKnowledge.productPositioning.tagline);
  });

  it("positioning.planLanguage matches GRANTPIPE_OS_PLAN_LANGUAGE", () => {
    expect(OFFERING.positioning.planLanguage).toBe(GRANTPIPE_OS_PLAN_LANGUAGE);
  });

  it("has display helpers", () => {
    expect(typeof OFFERING.display.getPlanDisplayPrice).toBe("function");
    expect(typeof OFFERING.display.getLaunchPromoDisplayPrice).toBe("function");
  });

  it("every plan has a name, features, bestFit, and description", () => {
    for (const plan of OFFERING.plans) {
      expect(plan.name).toBeTruthy();
      expect(plan.features.length).toBeGreaterThan(0);
      expect(plan.bestFit).toBeTruthy();
      expect(plan.description).toBeTruthy();
    }
  });
});
