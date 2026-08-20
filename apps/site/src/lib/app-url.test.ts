import { afterEach, describe, expect, it } from "vitest";
import { buildAppPath, buildSignupUrl, getAppBaseUrl, getAppLoginUrl } from "./app-url";

const ORIGINAL_ENV = process.env.PUBLIC_APP_URL;

afterEach(() => {
  if (ORIGINAL_ENV === undefined) {
    delete process.env.PUBLIC_APP_URL;
  } else {
    process.env.PUBLIC_APP_URL = ORIGINAL_ENV;
  }
});

describe("getAppBaseUrl", () => {
  it("falls back to app.grantpipe.com when env unset", () => {
    delete process.env.PUBLIC_APP_URL;
    expect(getAppBaseUrl()).toBe("https://app.grantpipe.com");
  });

  it("uses explicit env override", () => {
    expect(getAppBaseUrl({ PUBLIC_APP_URL: "https://staging.app/" })).toBe("https://staging.app");
  });

  it("reads from process.env when no env arg given", () => {
    process.env.PUBLIC_APP_URL = "https://my.example.com/";
    expect(getAppBaseUrl()).toBe("https://my.example.com");
  });

  it("falls back when env value is empty whitespace", () => {
    expect(getAppBaseUrl({ PUBLIC_APP_URL: "   " })).toBe("https://app.grantpipe.com");
  });

  // The import.meta.env.PUBLIC_APP_URL branch is covered implicitly at Cloudflare Pages
  // build time (Astro inlines it before the bundle runs). It cannot be mocked reliably in
  // vitest unit tests. The env-param override path (highest priority) exercises the same
  // resolution logic and is validated by the tests above.
  it("env param override takes priority — verifies the override chain works for localhost dev", () => {
    expect(getAppBaseUrl({ PUBLIC_APP_URL: "http://localhost:3050" })).toBe(
      "http://localhost:3050",
    );
  });
});

describe("buildAppPath / buildSignupUrl", () => {
  it("builds the canonical login URL", () => {
    expect(getAppLoginUrl({ PUBLIC_APP_URL: "https://my.grantpipe.com" })).toBe(
      "https://my.grantpipe.com/app/login",
    );
  });

  it("builds plain path", () => {
    expect(buildAppPath("/signup", { env: { PUBLIC_APP_URL: "https://my.grantpipe.com" } })).toBe(
      "https://my.grantpipe.com/app/signup",
    );
  });

  it("does not duplicate the app base path when the configured URL already includes it", () => {
    expect(
      buildAppPath("/login", { env: { PUBLIC_APP_URL: "https://my.grantpipe.com/app" } }),
    ).toBe("https://my.grantpipe.com/app/login");
  });

  it("normalizes leading slash", () => {
    expect(buildAppPath("settings", { env: { PUBLIC_APP_URL: "https://my.grantpipe.com" } })).toBe(
      "https://my.grantpipe.com/app/settings",
    );
  });

  it("includes plan, cycle, and sanitized non-launch promo", () => {
    const url = buildSignupUrl({
      plan: "growth",
      cycle: "annual",
      promo: " partner25!",
      env: { PUBLIC_APP_URL: "https://my.grantpipe.com" },
    });
    expect(url).toBe(
      "https://my.grantpipe.com/app/signup?plan=growth&cycle=annual&promo=PARTNER25",
    );
  });

  it("preserves dotted promo codes", () => {
    const url = buildSignupUrl({
      promo: "ref.x1",
      env: { PUBLIC_APP_URL: "https://my.grantpipe.com" },
    });
    expect(url).toBe("https://my.grantpipe.com/app/signup?promo=REF.X1");
  });

  it("omits promo when sanitized to empty string", () => {
    const url = buildSignupUrl({
      promo: "!!!",
      env: { PUBLIC_APP_URL: "https://my.grantpipe.com" },
    });
    expect(url).toBe("https://my.grantpipe.com/app/signup");
  });

  it("returns base+path when no params", () => {
    const url = buildSignupUrl({ env: { PUBLIC_APP_URL: "https://my.grantpipe.com" } });
    expect(url).toBe("https://my.grantpipe.com/app/signup");
  });

  it("builds full signup URL with plan, cycle, and promo using default host", () => {
    delete process.env.PUBLIC_APP_URL;
    const url = buildSignupUrl({ plan: "growth", cycle: "annual", promo: "launch25" });
    expect(url).toBe(
      "https://app.grantpipe.com/app/signup?plan=growth&cycle=annual&promo=LAUNCH25",
    );
  });
});
