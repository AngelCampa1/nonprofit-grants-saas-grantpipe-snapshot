import { describe, expect, it, vi } from "vitest";
import {
  SCRIPT_PATH,
  ensureSentryReleaseEnv,
  isEntrypoint,
  runCli,
} from "./check-sentry-release-env";

describe("ensureSentryReleaseEnv", () => {
  it("accepts a complete site release env", () => {
    expect(
      ensureSentryReleaseEnv("site", {
        SENTRY_AUTH_TOKEN: "token",
        SENTRY_ORG: "grantpipe",
        SENTRY_PROJECT_SITE: "grantpipe-site",
      } as never),
    ).toBeUndefined();
  });

  it("rejects missing web release env vars with a clear message", () => {
    expect(() =>
      ensureSentryReleaseEnv("web", {
        SENTRY_AUTH_TOKEN: "token",
        SENTRY_ORG: "grantpipe",
      } as never),
    ).toThrow("SENTRY_PROJECT_WEB");
  });
});

describe("runCli", () => {
  it("loads missing Sentry vars from a local env file before validating", () => {
    const exit = vi.fn();
    const logError = vi.fn();
    const loadLocalEnv = vi.fn((env: Record<string, string | undefined>) => {
      env.SENTRY_PROJECT_WEB = "grantpipe-web";
    });

    runCli({
      argv: ["node", SCRIPT_PATH, "--app", "web"],
      env: {
        SENTRY_AUTH_TOKEN: "token",
        SENTRY_ORG: "grantpipe",
      } as never,
      exit,
      loadLocalEnv,
      logError,
    });

    expect(loadLocalEnv).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  it("exits non-zero when the required env vars are missing", () => {
    const exit = vi.fn();
    const logError = vi.fn();

    runCli({
      argv: ["node", SCRIPT_PATH, "--app", "site"],
      env: {
        SENTRY_AUTH_TOKEN: "token",
        SENTRY_ORG: "grantpipe",
      } as never,
      exit,
      loadLocalEnv: vi.fn(),
      logError,
    });

    expect(logError).toHaveBeenCalledTimes(1);
    expect((logError.mock.calls[0]?.[0] as string).includes("SENTRY_PROJECT_SITE")).toBe(true);
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("isEntrypoint", () => {
  it("matches direct tsx invocation on Windows-style paths", () => {
    expect(
      isEntrypoint(
        "file:///C:/repo/scripts/check-sentry-release-env.ts",
        "C:\\repo\\scripts\\check-sentry-release-env.ts",
      ),
    ).toBe(true);
  });
});
