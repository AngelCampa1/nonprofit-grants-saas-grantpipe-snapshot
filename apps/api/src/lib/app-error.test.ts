import { describe, expect, it } from "vitest";
import {
  AppError,
  PAYWALL_LIMIT_EXCEEDED,
  badRequest,
  conflict,
  forbidden,
  internalError,
  notFound,
  paymentRequired,
  serviceUnavailable,
} from "./app-error";

describe("AppError helpers", () => {
  it.each([
    [badRequest, 400],
    [forbidden, 403],
    [notFound, 404],
    [conflict, 409],
    [internalError, 500],
    [serviceUnavailable, 503],
  ] as const)("creates a typed %s error", (factory, status) => {
    const error = factory("safe message");

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ name: "AppError", status, message: "safe message" });
  });

  it("uses the paywall code by default and preserves an explicit code", () => {
    expect(paymentRequired("Upgrade required").errorCode).toBe(PAYWALL_LIMIT_EXCEEDED);
    expect(paymentRequired("Upgrade required", "custom_code").errorCode).toBe("custom_code");
  });

  it("preserves structured details", () => {
    expect(new AppError(409, "Conflict", "conflict", { field: "name" })).toMatchObject({
      errorCode: "conflict",
      details: { field: "name" },
    });
  });
});
