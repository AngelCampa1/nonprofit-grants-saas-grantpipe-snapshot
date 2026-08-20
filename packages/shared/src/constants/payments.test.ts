import { describe, expect, it } from "vitest";
import {
  ACTIVITY_ENTITY_TYPES,
  ADJUSTMENT_KINDS,
  INDIRECT_COST_BASES,
  PAYMENT_METHODS,
  PAYMENT_REQUEST_LINE_CATEGORIES,
  PAYMENT_REQUEST_STATUSES,
  PAYMENT_REQUEST_TYPES,
  getPlanEntitlements,
  hasIndirectCostRules,
  hasPaymentEvidencePackage,
  hasPaymentRequests,
  hasProgramAllocations,
} from "./index";

describe("PAYMENT_REQUEST_TYPES", () => {
  it("includes all expected values", () => {
    expect(PAYMENT_REQUEST_TYPES).toContain("drawdown");
    expect(PAYMENT_REQUEST_TYPES).toContain("reimbursement");
    expect(PAYMENT_REQUEST_TYPES).toContain("invoice");
    expect(PAYMENT_REQUEST_TYPES).toContain("advance_liquidation");
    expect(PAYMENT_REQUEST_TYPES).toContain("other");
  });

  it("has exactly 5 values", () => {
    expect(PAYMENT_REQUEST_TYPES).toHaveLength(5);
  });
});

describe("PAYMENT_REQUEST_STATUSES", () => {
  it("includes all expected values", () => {
    expect(PAYMENT_REQUEST_STATUSES).toContain("draft");
    expect(PAYMENT_REQUEST_STATUSES).toContain("submitted");
    expect(PAYMENT_REQUEST_STATUSES).toContain("partially_approved");
    expect(PAYMENT_REQUEST_STATUSES).toContain("approved");
    expect(PAYMENT_REQUEST_STATUSES).toContain("rejected");
    expect(PAYMENT_REQUEST_STATUSES).toContain("paid");
    expect(PAYMENT_REQUEST_STATUSES).toContain("closed");
  });

  it("has exactly 7 values", () => {
    expect(PAYMENT_REQUEST_STATUSES).toHaveLength(7);
  });
});

describe("PAYMENT_REQUEST_LINE_CATEGORIES", () => {
  it("includes all expected values", () => {
    expect(PAYMENT_REQUEST_LINE_CATEGORIES).toContain("direct");
    expect(PAYMENT_REQUEST_LINE_CATEGORIES).toContain("indirect");
    expect(PAYMENT_REQUEST_LINE_CATEGORIES).toContain("adjustment");
    expect(PAYMENT_REQUEST_LINE_CATEGORIES).toContain("other");
  });
});

describe("PAYMENT_METHODS", () => {
  it("includes all expected values", () => {
    expect(PAYMENT_METHODS).toContain("ach");
    expect(PAYMENT_METHODS).toContain("wire");
    expect(PAYMENT_METHODS).toContain("check");
    expect(PAYMENT_METHODS).toContain("card");
    expect(PAYMENT_METHODS).toContain("other");
  });
});

describe("INDIRECT_COST_BASES", () => {
  it("includes all expected values", () => {
    expect(INDIRECT_COST_BASES).toContain("direct_costs");
    expect(INDIRECT_COST_BASES).toContain("salaries_only");
    expect(INDIRECT_COST_BASES).toContain("modified_total_direct");
  });
});

describe("ADJUSTMENT_KINDS", () => {
  it("includes all expected values", () => {
    expect(ADJUSTMENT_KINDS).toContain("reduction");
    expect(ADJUSTMENT_KINDS).toContain("increase");
    expect(ADJUSTMENT_KINDS).toContain("note");
    expect(ADJUSTMENT_KINDS).toContain("dedup_override");
  });
});

describe("ACTIVITY_ENTITY_TYPES", () => {
  it("includes payment_request", () => {
    expect(ACTIVITY_ENTITY_TYPES).toContain("payment_request");
  });

  it("includes payment_request_line", () => {
    expect(ACTIVITY_ENTITY_TYPES).toContain("payment_request_line");
  });

  it("includes payment_request_adjustment", () => {
    expect(ACTIVITY_ENTITY_TYPES).toContain("payment_request_adjustment");
  });

  it("includes payment", () => {
    expect(ACTIVITY_ENTITY_TYPES).toContain("payment");
  });
});

describe("PlanEntitlements — payment flags", () => {
  it("starter has all three payment flags as false", () => {
    const entitlements = getPlanEntitlements("starter");
    expect(entitlements.hasPaymentRequests).toBe(false);
    expect(entitlements.hasIndirectCostRules).toBe(false);
    expect(entitlements.hasPaymentEvidencePackage).toBe(false);
  });

  it("growth has all three payment flags as true", () => {
    const entitlements = getPlanEntitlements("growth");
    expect(entitlements.hasPaymentRequests).toBe(true);
    expect(entitlements.hasIndirectCostRules).toBe(true);
    expect(entitlements.hasPaymentEvidencePackage).toBe(true);
  });

  it("audit_ready has all three payment flags as true", () => {
    const entitlements = getPlanEntitlements("audit_ready");
    expect(entitlements.hasPaymentRequests).toBe(true);
    expect(entitlements.hasIndirectCostRules).toBe(true);
    expect(entitlements.hasPaymentEvidencePackage).toBe(true);
  });

  it("enterprise has all three payment flags as true", () => {
    const entitlements = getPlanEntitlements("enterprise");
    expect(entitlements.hasPaymentRequests).toBe(true);
    expect(entitlements.hasIndirectCostRules).toBe(true);
    expect(entitlements.hasPaymentEvidencePackage).toBe(true);
  });

  it("null/undefined falls back to starter (all three false)", () => {
    expect(getPlanEntitlements(null).hasPaymentRequests).toBe(false);
    expect(getPlanEntitlements(undefined).hasPaymentRequests).toBe(false);
    expect(getPlanEntitlements("unknown_plan").hasPaymentRequests).toBe(false);
  });
});

describe("hasPaymentRequests helper function", () => {
  it("returns false for starter plan", () => {
    expect(hasPaymentRequests("starter")).toBe(false);
  });

  it("returns true for growth plan", () => {
    expect(hasPaymentRequests("growth")).toBe(true);
  });

  it("returns true for audit_ready plan", () => {
    expect(hasPaymentRequests("audit_ready")).toBe(true);
  });

  it("returns false for null", () => {
    expect(hasPaymentRequests(null)).toBe(false);
  });
});

describe("hasIndirectCostRules helper function", () => {
  it("returns false for starter plan", () => {
    expect(hasIndirectCostRules("starter")).toBe(false);
  });

  it("returns true for growth plan", () => {
    expect(hasIndirectCostRules("growth")).toBe(true);
  });

  it("returns true for audit_ready plan", () => {
    expect(hasIndirectCostRules("audit_ready")).toBe(true);
  });

  it("returns true for enterprise plan", () => {
    expect(hasIndirectCostRules("enterprise")).toBe(true);
  });

  it("returns false for null", () => {
    expect(hasIndirectCostRules(null)).toBe(false);
  });
});

describe("hasProgramAllocations helper function", () => {
  it("returns true for starter plan", () => {
    expect(hasProgramAllocations("starter")).toBe(true);
  });

  it("returns true for growth plan", () => {
    expect(hasProgramAllocations("growth")).toBe(true);
  });

  it("returns true for audit_ready plan", () => {
    expect(hasProgramAllocations("audit_ready")).toBe(true);
  });

  it("returns true for enterprise plan", () => {
    expect(hasProgramAllocations("enterprise")).toBe(true);
  });

  it("returns true for null because starter is the default entitlement tier", () => {
    expect(hasProgramAllocations(null)).toBe(true);
  });

  it("returns true for undefined because starter is the default entitlement tier", () => {
    expect(hasProgramAllocations(undefined)).toBe(true);
  });
});

describe("hasPaymentEvidencePackage helper function", () => {
  it("returns false for starter plan", () => {
    expect(hasPaymentEvidencePackage("starter")).toBe(false);
  });

  it("returns true for growth plan", () => {
    expect(hasPaymentEvidencePackage("growth")).toBe(true);
  });

  it("returns true for audit_ready plan", () => {
    expect(hasPaymentEvidencePackage("audit_ready")).toBe(true);
  });

  it("returns true for enterprise plan", () => {
    expect(hasPaymentEvidencePackage("enterprise")).toBe(true);
  });

  it("returns false for undefined", () => {
    expect(hasPaymentEvidencePackage(undefined)).toBe(false);
  });
});
