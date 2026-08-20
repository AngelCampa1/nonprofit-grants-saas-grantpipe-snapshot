import { describe, expect, it, vi } from "vitest";
import { ApiError, readResponseOrThrow, throwIfNotOk } from "./http-response";

describe("http-response", () => {
  it("returns the parsed payload when the response is successful", async () => {
    await expect(
      readResponseOrThrow({
        json: vi.fn().mockResolvedValue({ ok: true }),
      }),
    ).resolves.toEqual({ ok: true });
  });

  it("throws the error field from a failed response payload", async () => {
    await expect(
      readResponseOrThrow({
        ok: false,
        json: vi.fn().mockResolvedValue({ error: "Validation failed" }),
      }),
    ).rejects.toThrow("Validation failed");
  });

  it("throws the message field from a failed response payload", async () => {
    await expect(
      readResponseOrThrow({
        ok: false,
        json: vi.fn().mockResolvedValue({ message: "Permission denied" }),
      }),
    ).rejects.toThrow("Permission denied");
  });

  it("falls back to a generic message when the failed response payload is empty", async () => {
    await expect(
      readResponseOrThrow({
        ok: false,
        json: vi.fn().mockResolvedValue({}),
      }),
    ).rejects.toThrow("Request failed");
  });

  it("falls back to a generic message when the failed response payload is not an object", async () => {
    await expect(
      readResponseOrThrow({
        ok: false,
        json: vi.fn().mockResolvedValue("not-json"),
      }),
    ).rejects.toThrow("Request failed");
  });

  it("ignores missing responses and successful responses without throwing", async () => {
    await expect(throwIfNotOk()).resolves.toBeUndefined();
    await expect(
      throwIfNotOk({
        ok: true,
        json: vi.fn(),
      }),
    ).resolves.toBeUndefined();
  });

  it("throws the parsed error message for failed non-body mutations", async () => {
    await expect(
      throwIfNotOk({
        ok: false,
        json: vi.fn().mockResolvedValue({ error: "Delete failed" }),
      }),
    ).rejects.toThrow("Delete failed");
  });

  it("falls back when the failed response body cannot be parsed", async () => {
    await expect(
      throwIfNotOk({
        ok: false,
        json: vi.fn().mockRejectedValue(new Error("bad json")),
      }),
    ).rejects.toThrow("Request failed");
  });

  it("throws an ApiError exposing status and errorCode from readResponseOrThrow", async () => {
    try {
      await readResponseOrThrow({
        ok: false,
        status: 402,
        json: vi
          .fn()
          .mockResolvedValue({ error: "Plan limit reached", errorCode: "PAYWALL_LIMIT_EXCEEDED" }),
      });
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(402);
      expect((error as ApiError).errorCode).toBe("PAYWALL_LIMIT_EXCEEDED");
      expect((error as ApiError).message).toBe("Plan limit reached");
    }
  });

  it("throws an ApiError exposing status and errorCode from throwIfNotOk", async () => {
    try {
      await throwIfNotOk({
        ok: false,
        status: 402,
        json: vi
          .fn()
          .mockResolvedValue({ error: "Plan limit reached", errorCode: "PAYWALL_LIMIT_EXCEEDED" }),
      });
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(402);
      expect((error as ApiError).errorCode).toBe("PAYWALL_LIMIT_EXCEEDED");
    }
  });

  it("returns undefined for a 204 No Content response without calling json()", async () => {
    const jsonSpy = vi.fn();
    const result = await readResponseOrThrow({
      ok: true,
      status: 204,
      json: jsonSpy,
    });
    expect(result).toBeUndefined();
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it("still throws for a 204 that is flagged as not ok", async () => {
    await expect(
      readResponseOrThrow({
        ok: false,
        status: 204,
        json: vi.fn().mockResolvedValue({ error: "Upstream timeout" }),
      }),
    ).rejects.toThrow("Upstream timeout");
  });

  it("populates details with the full parsed payload on readResponseOrThrow failure", async () => {
    const payload = {
      error: "ai_usage_cap_reached",
      errorCode: "ai_usage_cap_reached",
      feature: "award_intake",
      cap: 5,
      used: 5,
      currentPlan: "starter",
      upgradeToPlan: "growth",
    };
    try {
      await readResponseOrThrow({
        ok: false,
        status: 402,
        json: vi.fn().mockResolvedValue(payload),
      });
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).details).toEqual(payload);
    }
  });

  it("populates details with the full parsed payload on throwIfNotOk failure", async () => {
    const payload = {
      error: "ai_usage_cap_reached",
      errorCode: "ai_usage_cap_reached",
      feature: "ask_your_ledger",
      cap: 20,
      used: 20,
      currentPlan: "starter",
      upgradeToPlan: "growth",
    };
    try {
      await throwIfNotOk({
        ok: false,
        status: 402,
        json: vi.fn().mockResolvedValue(payload),
      });
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).details).toEqual(payload);
    }
  });

  it("details is the parsed payload when readResponseOrThrow throws with a null payload", async () => {
    try {
      await readResponseOrThrow({
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue(null),
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      // null payload coerces to undefined for details
      expect((error as ApiError).details).toBeUndefined();
    }
  });
});
