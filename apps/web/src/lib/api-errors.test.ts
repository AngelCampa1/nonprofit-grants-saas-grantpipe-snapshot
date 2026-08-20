import { describe, expect, it } from "vitest";
import { ApiError } from "./http-response";
import {
  getAiUsageCapPayload,
  isApiErrorStatus,
  isAuditReadyPlanGate,
  AUDIT_READY_PLAN_GATE_TITLE,
  AUDIT_READY_PLAN_GATE_MESSAGE,
} from "./api-errors";

describe("getAiUsageCapPayload", () => {
  function makeCapError(details: Record<string, unknown>) {
    const err = new ApiError("ai_usage_cap_reached", 402, "ai_usage_cap_reached");
    (err as ApiError & { details: unknown }).details = {
      error: "ai_usage_cap_reached",
      ...details,
    };
    return err;
  }

  it("returns the payload for a valid award_intake cap error", () => {
    const err = makeCapError({
      feature: "award_intake",
      cap: 5,
      used: 5,
      currentPlan: "starter",
      upgradeToPlan: "growth",
    });
    const result = getAiUsageCapPayload(err);
    expect(result).toEqual({
      error: "ai_usage_cap_reached",
      feature: "award_intake",
      cap: 5,
      used: 5,
      currentPlan: "starter",
      upgradeToPlan: "growth",
    });
  });

  it("returns the payload for a valid ask_your_ledger cap error", () => {
    const err = makeCapError({
      feature: "ask_your_ledger",
      cap: 20,
      used: 20,
      currentPlan: "starter",
      upgradeToPlan: "growth",
    });
    const result = getAiUsageCapPayload(err);
    expect(result).not.toBeNull();
    expect(result?.feature).toBe("ask_your_ledger");
  });

  it("returns the payload when upgradeToPlan is null", () => {
    const err = makeCapError({
      feature: "award_intake",
      cap: 5,
      used: 5,
      currentPlan: "growth",
      upgradeToPlan: null,
    });
    const result = getAiUsageCapPayload(err);
    expect(result).not.toBeNull();
    expect(result?.upgradeToPlan).toBeNull();
  });

  it("returns null for a non-ApiError", () => {
    expect(getAiUsageCapPayload(new Error("boom"))).toBeNull();
    expect(getAiUsageCapPayload("string")).toBeNull();
    expect(getAiUsageCapPayload(null)).toBeNull();
  });

  it("returns null for ApiError with wrong status", () => {
    const err = new ApiError("cap", 403, "ai_usage_cap_reached");
    expect(getAiUsageCapPayload(err)).toBeNull();
  });

  it("returns null for ApiError with wrong errorCode", () => {
    const err = makeCapError({
      feature: "award_intake",
      cap: 5,
      used: 5,
      currentPlan: "starter",
      upgradeToPlan: "growth",
    });
    Object.defineProperty(err, "errorCode", { value: "OTHER_ERROR" });
    expect(getAiUsageCapPayload(err)).toBeNull();
  });

  it("returns null when details is missing", () => {
    const err = new ApiError("ai_usage_cap_reached", 402, "ai_usage_cap_reached");
    expect(getAiUsageCapPayload(err)).toBeNull();
  });

  it("returns null when feature is an invalid value", () => {
    const err = makeCapError({
      feature: "bad_feature",
      cap: 5,
      used: 5,
      currentPlan: "starter",
      upgradeToPlan: "growth",
    });
    expect(getAiUsageCapPayload(err)).toBeNull();
  });

  it("returns null when cap is not a finite number", () => {
    const err = makeCapError({
      feature: "award_intake",
      cap: Infinity,
      used: 5,
      currentPlan: "starter",
      upgradeToPlan: "growth",
    });
    expect(getAiUsageCapPayload(err)).toBeNull();
  });

  it("returns null when used is not a finite number", () => {
    const err = makeCapError({
      feature: "award_intake",
      cap: 5,
      used: "not-a-number",
      currentPlan: "starter",
      upgradeToPlan: "growth",
    });
    expect(getAiUsageCapPayload(err)).toBeNull();
  });

  it("returns null when currentPlan is not a string", () => {
    const err = makeCapError({
      feature: "award_intake",
      cap: 5,
      used: 5,
      currentPlan: 42,
      upgradeToPlan: "growth",
    });
    expect(getAiUsageCapPayload(err)).toBeNull();
  });

  it("returns null when upgradeToPlan is a non-null non-string", () => {
    const err = makeCapError({
      feature: "award_intake",
      cap: 5,
      used: 5,
      currentPlan: "starter",
      upgradeToPlan: 42,
    });
    expect(getAiUsageCapPayload(err)).toBeNull();
  });

  it("returns null when currentPlan is a string but not a valid plan tier", () => {
    const err = makeCapError({
      feature: "award_intake",
      cap: 5,
      used: 5,
      currentPlan: "foobar",
      upgradeToPlan: "growth",
    });
    expect(getAiUsageCapPayload(err)).toBeNull();
  });

  it("returns null when upgradeToPlan is a string but not a valid plan tier", () => {
    const err = makeCapError({
      feature: "award_intake",
      cap: 5,
      used: 5,
      currentPlan: "starter",
      upgradeToPlan: "foobar",
    });
    expect(getAiUsageCapPayload(err)).toBeNull();
  });
});

describe("isApiErrorStatus", () => {
  it("returns true when the error is an ApiError with the given status", () => {
    const err = new ApiError("not found", 404);
    expect(isApiErrorStatus(err, 404)).toBe(true);
  });

  it("returns false when the status does not match", () => {
    const err = new ApiError("not found", 404);
    expect(isApiErrorStatus(err, 500)).toBe(false);
  });

  it("returns false for a non-ApiError", () => {
    expect(isApiErrorStatus(new Error("boom"), 404)).toBe(false);
  });
});

describe("isAuditReadyPlanGate", () => {
  it("returns true for a 402 with errorCode insufficient_plan", () => {
    const err = new ApiError("insufficient_plan", 402, "insufficient_plan");
    expect(isAuditReadyPlanGate(err)).toBe(true);
  });

  it("returns true for a 402 with errorCode INSUFFICIENT_PLAN", () => {
    const err = new ApiError("cap", 402, "INSUFFICIENT_PLAN");
    expect(isAuditReadyPlanGate(err)).toBe(true);
  });

  it("returns true for a 402 with message insufficient_plan", () => {
    const err = new ApiError("insufficient_plan", 402, "other_code");
    expect(isAuditReadyPlanGate(err)).toBe(true);
  });

  it("returns false for wrong status", () => {
    const err = new ApiError("insufficient_plan", 403, "insufficient_plan");
    expect(isAuditReadyPlanGate(err)).toBe(false);
  });

  it("returns false for non-ApiError", () => {
    expect(isAuditReadyPlanGate(new Error("insufficient_plan"))).toBe(false);
  });
});

describe("audit-ready plan gate copy constants", () => {
  it("exports a non-empty AUDIT_READY_PLAN_GATE_TITLE", () => {
    expect(typeof AUDIT_READY_PLAN_GATE_TITLE).toBe("string");
    expect(AUDIT_READY_PLAN_GATE_TITLE.length).toBeGreaterThan(0);
  });

  it("exports a non-empty AUDIT_READY_PLAN_GATE_MESSAGE", () => {
    expect(typeof AUDIT_READY_PLAN_GATE_MESSAGE).toBe("string");
    expect(AUDIT_READY_PLAN_GATE_MESSAGE.length).toBeGreaterThan(0);
  });
});
