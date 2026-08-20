import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We'll import the module after mocking fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.mock("./sentry", () => ({
  captureBackgroundException: vi.fn(),
}));

import { verifyTurnstile } from "./turnstile";
import { captureBackgroundException } from "./sentry";

function makeTurnstileResponse(success: boolean, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ success }),
  } as unknown as Response;
}

beforeEach(() => {
  vi.resetAllMocks();
  // Reset NODE_ENV to "test" before each test
  process.env.NODE_ENV = "test";
});

afterEach(() => {
  process.env.NODE_ENV = "test";
});

describe("verifyTurnstile", () => {
  describe("unset/empty secret — bypass", () => {
    it("returns true when secret is undefined", async () => {
      const result = await verifyTurnstile("some-token", undefined);
      expect(result).toBe(true);
    });

    it("returns true when secret is empty string", async () => {
      const result = await verifyTurnstile("some-token", "");
      expect(result).toBe(true);
    });

    it("fails closed and captures a safe configuration error in real mode", async () => {
      const result = await verifyTurnstile("sensitive-token", undefined, "1.2.3.4", "real");

      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(captureBackgroundException).toHaveBeenCalledWith(expect.any(Error), "turnstile", {
        reason: "missing_secret_protected_environment",
      });
      expect(JSON.stringify(vi.mocked(captureBackgroundException).mock.calls)).not.toContain(
        "sensitive-token",
      );
    });

    it("preserves the missing-secret bypass in mock mode", async () => {
      await expect(verifyTurnstile("some-token", undefined, undefined, "mock")).resolves.toBe(true);
    });

    it("fails closed in production even when integration mode is missing", async () => {
      await expect(
        verifyTurnstile("some-token", undefined, undefined, undefined, "production"),
      ).resolves.toBe(false);
      expect(captureBackgroundException).toHaveBeenCalledWith(expect.any(Error), "turnstile", {
        reason: "missing_secret_protected_environment",
      });
    });

    it("does NOT call fetch when secret is unset", async () => {
      await verifyTurnstile("some-token", undefined);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("suppresses the warn when NODE_ENV is 'test'", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      process.env.NODE_ENV = "test";
      await verifyTurnstile("some-token", undefined);
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it("emits a console.warn when NODE_ENV is not 'test' (once)", async () => {
      // Re-import fresh module instance to reset module-level once-guard
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      process.env.NODE_ENV = "development";

      // Dynamic re-import to get a fresh module with the warn-once flag reset
      vi.resetModules();
      const { verifyTurnstile: freshVerify } = await import("./turnstile");

      await freshVerify(undefined, undefined);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]?.[0]).toMatch(/TURNSTILE_SECRET_KEY/);

      // Second call should NOT warn again (once-guard)
      await freshVerify(undefined, undefined);
      expect(warnSpy).toHaveBeenCalledTimes(1);

      warnSpy.mockRestore();
      process.env.NODE_ENV = "test";
    });
  });

  describe("secret set, token missing/empty — fail closed", () => {
    it("returns false when token is undefined", async () => {
      const result = await verifyTurnstile(undefined, "secret-key");
      expect(result).toBe(false);
    });

    it("returns false when token is empty string", async () => {
      const result = await verifyTurnstile("", "secret-key");
      expect(result).toBe(false);
    });

    it("does NOT call fetch when token is missing", async () => {
      await verifyTurnstile(undefined, "secret-key");
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("success responses", () => {
    it("returns true when Cloudflare reports success: true", async () => {
      mockFetch.mockResolvedValueOnce(makeTurnstileResponse(true));
      const result = await verifyTurnstile("valid-token", "my-secret");
      expect(result).toBe(true);
    });

    it("returns false when Cloudflare reports success: false", async () => {
      mockFetch.mockResolvedValueOnce(makeTurnstileResponse(false));
      const result = await verifyTurnstile("invalid-token", "my-secret");
      expect(result).toBe(false);
      expect(captureBackgroundException).not.toHaveBeenCalled();
    });

    it("sends correct form-encoded body to siteverify", async () => {
      mockFetch.mockResolvedValueOnce(makeTurnstileResponse(true));
      await verifyTurnstile("tok123", "sec456", "1.2.3.4");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        expect.objectContaining({
          method: "POST",
        }),
      );

      const callArgs = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = callArgs[1].body as URLSearchParams;
      expect(body.get("secret")).toBe("sec456");
      expect(body.get("response")).toBe("tok123");
      expect(body.get("remoteip")).toBe("1.2.3.4");
    });

    it("omits remoteip when ip is not provided", async () => {
      mockFetch.mockResolvedValueOnce(makeTurnstileResponse(true));
      await verifyTurnstile("tok123", "sec456");

      const callArgs = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = callArgs[1].body as URLSearchParams;
      expect(body.get("remoteip")).toBeNull();
    });
  });

  describe("error handling — fail closed", () => {
    it("returns false on non-OK HTTP status (e.g. 500)", async () => {
      mockFetch.mockResolvedValueOnce(makeTurnstileResponse(true, 500));
      const result = await verifyTurnstile("tok", "sec");
      expect(result).toBe(false);
      expect(captureBackgroundException).toHaveBeenCalledWith(expect.any(Error), "turnstile", {
        reason: "siteverify_non_ok",
        status: "500",
      });
    });

    it("returns false when fetch throws a network error", async () => {
      const error = new Error("network failure");
      mockFetch.mockRejectedValueOnce(error);
      const result = await verifyTurnstile("tok", "sec");
      expect(result).toBe(false);
      expect(captureBackgroundException).toHaveBeenCalledWith(error, "turnstile", {
        reason: "siteverify_exception",
      });
    });

    it("returns false when response.json() throws", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("parse error");
        },
      } as unknown as Response);
      const result = await verifyTurnstile("tok", "sec");
      expect(result).toBe(false);
      expect(captureBackgroundException).toHaveBeenCalledWith(expect.any(Error), "turnstile", {
        reason: "siteverify_exception",
      });
    });

    it("returns false when response body does not have success field", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ error: "bad-token" }),
      } as unknown as Response);
      const result = await verifyTurnstile("tok", "sec");
      expect(result).toBe(false);
      expect(captureBackgroundException).toHaveBeenCalledWith(expect.any(Error), "turnstile", {
        reason: "siteverify_malformed_response",
      });
    });
  });
});
