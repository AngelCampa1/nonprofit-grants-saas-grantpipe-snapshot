import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  assertTurnstileSiteKey,
  assertTurnstileSiteKeyForBuild,
  type AssertTurnstileOptions,
} from "./assert-turnstile-site-key";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_SKIP = process.env.SKIP_TURNSTILE_GUARD;
const ORIGINAL_KEY = process.env.PUBLIC_TURNSTILE_SITE_KEY;

beforeEach(() => {
  delete process.env.SKIP_TURNSTILE_GUARD;
  delete process.env.PUBLIC_TURNSTILE_SITE_KEY;
  // Ensure we do not inherit test NODE_ENV as "test" (set explicitly per test)
  process.env.NODE_ENV = "production";
});

afterEach(() => {
  if (ORIGINAL_NODE_ENV === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  }
  if (ORIGINAL_SKIP === undefined) {
    delete process.env.SKIP_TURNSTILE_GUARD;
  } else {
    process.env.SKIP_TURNSTILE_GUARD = ORIGINAL_SKIP;
  }
  if (ORIGINAL_KEY === undefined) {
    delete process.env.PUBLIC_TURNSTILE_SITE_KEY;
  } else {
    process.env.PUBLIC_TURNSTILE_SITE_KEY = ORIGINAL_KEY;
  }
});

describe("assertTurnstileSiteKey", () => {
  it("throws when PUBLIC_TURNSTILE_SITE_KEY is unset in production", () => {
    expect(() => assertTurnstileSiteKey()).toThrow(/PUBLIC_TURNSTILE_SITE_KEY/);
  });

  it("throws when PUBLIC_TURNSTILE_SITE_KEY is an empty string in production", () => {
    process.env.PUBLIC_TURNSTILE_SITE_KEY = "";
    expect(() => assertTurnstileSiteKey()).toThrow(/PUBLIC_TURNSTILE_SITE_KEY/);
  });

  it("throws when PUBLIC_TURNSTILE_SITE_KEY is only whitespace in production", () => {
    process.env.PUBLIC_TURNSTILE_SITE_KEY = "   ";
    expect(() => assertTurnstileSiteKey()).toThrow(/PUBLIC_TURNSTILE_SITE_KEY/);
  });

  it("does not throw when PUBLIC_TURNSTILE_SITE_KEY is set to a valid value", () => {
    process.env.PUBLIC_TURNSTILE_SITE_KEY = "0x4ABCtest";
    expect(() => assertTurnstileSiteKey()).not.toThrow();
  });

  it("skips (does not throw) when NODE_ENV is 'test'", () => {
    process.env.NODE_ENV = "test";
    expect(() => assertTurnstileSiteKey()).not.toThrow();
  });

  it("skips (does not throw) when SKIP_TURNSTILE_GUARD is set", () => {
    process.env.SKIP_TURNSTILE_GUARD = "1";
    expect(() => assertTurnstileSiteKey()).not.toThrow();
  });

  it("accepts custom env options overriding process.env", () => {
    const opts: AssertTurnstileOptions = {
      nodeEnv: "production",
      skipGuard: undefined,
      siteKey: "0xCustom",
    };
    expect(() => assertTurnstileSiteKey(opts)).not.toThrow();
  });

  it("throws when custom opts has no siteKey and nodeEnv is production", () => {
    const opts: AssertTurnstileOptions = {
      nodeEnv: "production",
      skipGuard: undefined,
      siteKey: "",
    };
    expect(() => assertTurnstileSiteKey(opts)).toThrow(/PUBLIC_TURNSTILE_SITE_KEY/);
  });

  it("loads local env before asserting a production build", () => {
    const env: Record<string, string | undefined> = {
      NODE_ENV: "production",
    };

    expect(() =>
      assertTurnstileSiteKeyForBuild({
        env,
        loadLocalEnv: () => {
          env.PUBLIC_TURNSTILE_SITE_KEY = "0xLoaded";
        },
      }),
    ).not.toThrow();
  });

  it("still throws after local env loading when the production build key is missing", () => {
    expect(() =>
      assertTurnstileSiteKeyForBuild({
        env: {
          NODE_ENV: "production",
        },
        loadLocalEnv: () => undefined,
      }),
    ).toThrow(/PUBLIC_TURNSTILE_SITE_KEY/);
  });
});
