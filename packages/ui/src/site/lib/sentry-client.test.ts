import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock @sentry/browser before importing the module under test
vi.mock("@sentry/browser", () => ({
  init: vi.fn(),
  captureException: vi.fn(),
}));

import * as Sentry from "@sentry/browser";
import { DENY_URLS, initSentry, captureException, captureSiteFetchFailure } from "./sentry-client";

const TEST_DSN = "https://public@example.ingest.sentry.io/1";

describe("sentry-client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("MODE", "production");
    vi.stubEnv("PROD", true);
    vi.stubEnv("PUBLIC_SENTRY_DSN", TEST_DSN);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("initSentry", () => {
    it("does not hardcode a public DSN in source", () => {
      const source = readFileSync(join(process.cwd(), "src/site/lib/sentry-client.ts"), "utf8");

      expect(source).not.toContain("ingest.us.sentry.io");
      expect(source).toContain("PUBLIC_SENTRY_DSN");
    });

    it("does not initialize Sentry when PUBLIC_SENTRY_DSN is unset", () => {
      vi.stubEnv("PUBLIC_SENTRY_DSN", "");

      initSentry("grantpipe");

      expect(Sentry.init).not.toHaveBeenCalled();
    });

    it("does not initialize Sentry outside production", () => {
      vi.stubEnv("MODE", "development");
      vi.stubEnv("PROD", false);

      initSentry("crewroute");

      expect(Sentry.init).not.toHaveBeenCalled();
    });

    it("calls Sentry.init with the correct DSN", () => {
      initSentry("crewroute");
      expect(Sentry.init).toHaveBeenCalledOnce();
      expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({ dsn: TEST_DSN }));
    });

    it("does not set tracesSampleRate", () => {
      initSentry("crewroute");
      const call = (Sentry.init as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(call).not.toHaveProperty("tracesSampleRate");
    });

    it("sets environment from import.meta.env.MODE", () => {
      initSentry("crewroute");
      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({ environment: "production" }),
      );
    });

    it("prefers PUBLIC_SENTRY_ENVIRONMENT and release when provided", () => {
      vi.stubEnv("PUBLIC_SENTRY_ENVIRONMENT", "staging");
      vi.stubEnv("PUBLIC_SENTRY_RELEASE", "site-release");

      initSentry("grantpipe");

      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: "staging",
          release: "site-release",
          sendDefaultPii: false,
        }),
      );
    });

    it("tags the scope with the given site name", () => {
      initSentry("birvix");
      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          initialScope: { tags: { site: "birvix" } },
        }),
      );
    });

    it("passes the site name through to the tag for a different site", () => {
      initSentry("sweepops");
      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          initialScope: { tags: { site: "sweepops" } },
        }),
      );
    });

    it("filters out dynamic import chunk-load failures via ignoreErrors", () => {
      initSentry("crewroute");
      const call = (Sentry.init as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
        string,
        unknown
      >;
      const ignoreErrors = call.ignoreErrors as Array<string | RegExp>;
      expect(ignoreErrors).toBeDefined();
      expect(ignoreErrors.length).toBeGreaterThan(0);

      const hasChunkPattern = ignoreErrors.some((pattern) => {
        if (pattern instanceof RegExp) {
          return pattern.test(
            "Failed to fetch dynamically imported module: https://horiva.app/_astro/feedback-widget.BnR-9d-F.js",
          );
        }
        return false;
      });
      expect(hasChunkPattern).toBe(true);
    });

    it("also filters ChunkLoadError and Loading chunk failed patterns", () => {
      initSentry("crewroute");
      const call = (Sentry.init as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
        string,
        unknown
      >;
      const ignoreErrors = call.ignoreErrors as Array<string | RegExp>;

      const matchesChunkLoadError = ignoreErrors.some((pattern) => {
        if (pattern instanceof RegExp) return pattern.test("ChunkLoadError");
        return pattern === "ChunkLoadError";
      });
      expect(matchesChunkLoadError).toBe(true);

      const matchesLoadingChunk = ignoreErrors.some((pattern) => {
        if (pattern instanceof RegExp) return pattern.test("Loading chunk 123 failed");
        return false;
      });
      expect(matchesLoadingChunk).toBe(true);
    });

    it("filters Safari 'Load failed' TypeError variant", () => {
      initSentry("crewroute");
      const call = (Sentry.init as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
        string,
        unknown
      >;
      const ignoreErrors = call.ignoreErrors as Array<string | RegExp>;

      const matchesSafari = ignoreErrors.some((pattern) => {
        if (pattern instanceof RegExp) return pattern.test("Load failed");
        return false;
      });
      expect(matchesSafari).toBe(true);
    });

    it("filters Safari host-suffixed fetch failure titles", () => {
      initSentry("grantpipe");
      const call = (Sentry.init as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
        string,
        unknown
      >;
      const ignoreErrors = call.ignoreErrors as Array<string | RegExp>;

      const matchesSafariHostSuffix = ignoreErrors.some((pattern) => {
        if (pattern instanceof RegExp) return pattern.test("Load failed (app.grantpipe.com)");
        return false;
      });
      expect(matchesSafariHostSuffix).toBe(true);
    });

    it("filters network-level 'Failed to fetch' TypeError from bots and offline users", () => {
      initSentry("crewroute");
      const call = (Sentry.init as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
        string,
        unknown
      >;
      const ignoreErrors = call.ignoreErrors as Array<string | RegExp>;

      const matchesFailedToFetch = ignoreErrors.some((pattern) => {
        if (pattern instanceof RegExp) return pattern.test("Failed to fetch");
        return pattern === "Failed to fetch";
      });
      expect(matchesFailedToFetch).toBe(true);
    });

    it("filters browser extension pluginConfig errors", () => {
      initSentry("crewroute");
      const call = (Sentry.init as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
        string,
        unknown
      >;
      const ignoreErrors = call.ignoreErrors as Array<string | RegExp>;

      const matchesPluginConfig = ignoreErrors.some((pattern) => {
        if (pattern instanceof RegExp) {
          return pattern.test("undefined is not an object (evaluating 'o.pluginConfig')");
        }
        return false;
      });
      expect(matchesPluginConfig).toBe(true);
    });

    it("filters PostHog SDK 'options is not defined' during pageleave", () => {
      initSentry("crewroute");
      const call = (Sentry.init as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
        string,
        unknown
      >;
      const ignoreErrors = call.ignoreErrors as Array<string | RegExp>;

      const matchesOptions = ignoreErrors.some((pattern) => {
        if (pattern instanceof RegExp) {
          return pattern.test("options is not defined");
        }
        return false;
      });
      expect(matchesOptions).toBe(true);
    });

    it("filters browser extension runtime.sendMessage errors", () => {
      initSentry("crewroute");
      const call = (Sentry.init as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
        string,
        unknown
      >;
      const ignoreErrors = call.ignoreErrors as Array<string | RegExp>;

      const matchesSendMessage = ignoreErrors.some((pattern) => {
        if (pattern instanceof RegExp) {
          return pattern.test("Invalid call to runtime.sendMessage(). Tab not found.");
        }
        return false;
      });
      expect(matchesSendMessage).toBe(true);
    });

    it("filters Chrome extension object update promise rejections", () => {
      initSentry("grantpipe");
      const call = (Sentry.init as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
        string,
        unknown
      >;
      const ignoreErrors = call.ignoreErrors as Array<string | RegExp>;

      const matchesExtensionUpdateRejection = ignoreErrors.some((pattern) => {
        const message =
          "Non-Error promise rejection captured with value: Object Not Found Matching Id:2, MethodName:update, ParamCount:4";
        if (pattern instanceof RegExp) return pattern.test(message);
        return pattern === message;
      });
      expect(matchesExtensionUpdateRejection).toBe(true);
    });

    it("does not broadly filter app errors that only contain the extension update fragment", () => {
      initSentry("grantpipe");
      const call = (Sentry.init as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
        string,
        unknown
      >;
      const ignoreErrors = call.ignoreErrors as Array<string | RegExp>;

      const matchesAppError = ignoreErrors.some((pattern) => {
        const message =
          "GrantPipe app update failed: Object Not Found Matching Id:2, MethodName:update, ParamCount:4";
        if (pattern instanceof RegExp) return pattern.test(message);
        return pattern === message;
      });
      expect(matchesAppError).toBe(false);
    });

    it("passes denyUrls to filter browser extension sources", () => {
      initSentry("crewroute");
      const call = (Sentry.init as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
        string,
        unknown
      >;
      const denyUrls = call.denyUrls as Array<string | RegExp>;

      expect(denyUrls).toBeDefined();
      expect(denyUrls).toBe(DENY_URLS);
    });

    it("denyUrls blocks webkit-masked-url origins", () => {
      const matchesWebkit = DENY_URLS.some((pattern) => {
        if (pattern instanceof RegExp) {
          return pattern.test("webkit-masked-url://hidden/:2:6140");
        }
        return false;
      });
      expect(matchesWebkit).toBe(true);
    });

    it("denyUrls blocks the Cloudflare Web Analytics beacon script", () => {
      const matchesBeacon = DENY_URLS.some((pattern) => {
        if (pattern instanceof RegExp) {
          return pattern.test(
            "https://grantpipe.com/beacon.min.js/v4513226cdae34746b4dedf0b4dfa099e1781791509496",
          );
        }
        return false;
      });
      expect(matchesBeacon).toBe(true);
    });

    it("denyUrls does not block first-party Astro bundles", () => {
      const matchesAppBundle = DENY_URLS.some((pattern) => {
        if (pattern instanceof RegExp) {
          return pattern.test("https://grantpipe.com/_astro/feedback-widget.BnR-9d-F.js");
        }
        return false;
      });
      expect(matchesAppBundle).toBe(false);
    });

    it("denyUrls blocks chrome-extension origins", () => {
      const matchesChrome = DENY_URLS.some((pattern) => {
        if (pattern instanceof RegExp) {
          return pattern.test("chrome-extension://abc123/content.js");
        }
        return false;
      });
      expect(matchesChrome).toBe(true);
    });

    it("filters stale React runtime mismatch signatures", () => {
      initSentry("crewroute");
      const call = (Sentry.init as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
        string,
        unknown
      >;
      const ignoreErrors = call.ignoreErrors as Array<string | RegExp>;

      const matchesRuntimeMismatch = ignoreErrors.some((pattern) => {
        if (pattern instanceof RegExp) {
          return pattern.test("TypeError: jsxDEV is not a function");
        }
        return false;
      });

      expect(matchesRuntimeMismatch).toBe(true);
    });
  });

  describe("captureException", () => {
    it("forwards an Error to Sentry.captureException", () => {
      const err = new Error("boom");
      captureException(err);
      expect(Sentry.captureException).toHaveBeenCalledOnce();
      expect(Sentry.captureException).toHaveBeenCalledWith(err);
    });

    it("forwards a string error to Sentry.captureException", () => {
      captureException("string error");
      expect(Sentry.captureException).toHaveBeenCalledWith("string error");
    });

    it("forwards null to Sentry.captureException", () => {
      captureException(null);
      expect(Sentry.captureException).toHaveBeenCalledWith(null);
    });

    it("forwards undefined to Sentry.captureException", () => {
      captureException(undefined);
      expect(Sentry.captureException).toHaveBeenCalledWith(undefined);
    });

    it("forwards a provided capture context through to Sentry.captureException", () => {
      const err = new Error("with context");
      const context = { tags: { feature: "island-boundary" } };

      captureException(err, context);

      expect(Sentry.captureException).toHaveBeenCalledOnce();
      expect(Sentry.captureException).toHaveBeenCalledWith(err, context);
    });
  });

  describe("captureSiteFetchFailure", () => {
    it("captures network exceptions with a safe message", () => {
      const error = new Error("failed for jane@example.com https://api.test token=secret");

      captureSiteFetchFailure(error, { source: "lead-magnet", status: undefined });

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({ message: "lead-magnet request failed" }),
        expect.objectContaining({
          tags: { source: "lead-magnet" },
          extra: { status: undefined },
        }),
      );
      const calls = JSON.stringify(vi.mocked(Sentry.captureException).mock.calls);
      expect(calls).not.toContain("jane@example.com");
      expect(calls).not.toContain("api.test");
      expect(calls).not.toContain("secret");
    });

    it("captures conversion-surface browser fetch failures", () => {
      const error = new TypeError("Load failed");

      captureSiteFetchFailure(error, { source: "gated-content", status: undefined });

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({ message: "gated-content browser request failed" }),
        expect.objectContaining({
          tags: { source: "gated-content" },
          extra: { status: undefined, browserFetchFailure: true },
        }),
      );
    });

    it("does not throw when Sentry capture fails for conversion fetch failures", () => {
      vi.mocked(Sentry.captureException).mockImplementationOnce(() => {
        throw new Error("sentry transport down");
      });

      expect(() =>
        captureSiteFetchFailure(new TypeError("Failed to fetch"), {
          source: "lead-magnet-signup",
          status: undefined,
        }),
      ).not.toThrow();
    });

    it("does not capture expected browser fetch failures outside conversion surfaces", () => {
      const error = new TypeError("Load failed");

      captureSiteFetchFailure(error, { source: "ambient-widget", status: undefined });

      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it("captures 5xx responses as handled errors", () => {
      captureSiteFetchFailure(null, { source: "feedback", status: 503 });

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({ message: "feedback request failed with status 503" }),
        expect.objectContaining({
          tags: { source: "feedback" },
          extra: { status: 503 },
        }),
      );
    });

    it("does not throw when Sentry capture fails for status failures", () => {
      vi.mocked(Sentry.captureException).mockImplementationOnce(() => {
        throw new Error("sentry transport down");
      });

      expect(() =>
        captureSiteFetchFailure(null, { source: "feedback", status: 503 }),
      ).not.toThrow();
    });

    it("does not capture expected 4xx responses", () => {
      captureSiteFetchFailure(null, { source: "lead-magnet", status: 429 });

      expect(Sentry.captureException).not.toHaveBeenCalled();
    });
  });
});
