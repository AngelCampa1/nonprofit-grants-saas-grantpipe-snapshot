import { afterEach, describe, expect, it } from "vitest";
import { getPublicTurnstileSiteKey } from "./public-turnstile";

const ORIGINAL_ENV = process.env.PUBLIC_TURNSTILE_SITE_KEY;

afterEach(() => {
  if (ORIGINAL_ENV === undefined) {
    delete process.env.PUBLIC_TURNSTILE_SITE_KEY;
  } else {
    process.env.PUBLIC_TURNSTILE_SITE_KEY = ORIGINAL_ENV;
  }
});

describe("getPublicTurnstileSiteKey", () => {
  it("returns undefined when PUBLIC_TURNSTILE_SITE_KEY is not set", () => {
    delete process.env.PUBLIC_TURNSTILE_SITE_KEY;
    expect(getPublicTurnstileSiteKey()).toBeUndefined();
  });

  it("returns the value when explicitly passed via env arg", () => {
    expect(getPublicTurnstileSiteKey({ PUBLIC_TURNSTILE_SITE_KEY: "0x4ABCtest" })).toBe(
      "0x4ABCtest",
    );
  });

  it("returns undefined when the explicit env arg value is an empty string", () => {
    expect(getPublicTurnstileSiteKey({ PUBLIC_TURNSTILE_SITE_KEY: "" })).toBeUndefined();
  });

  it("returns undefined when the explicit env arg value is only whitespace", () => {
    expect(getPublicTurnstileSiteKey({ PUBLIC_TURNSTILE_SITE_KEY: "   " })).toBeUndefined();
  });

  it("uses process.env as the Node test fallback", () => {
    process.env.PUBLIC_TURNSTILE_SITE_KEY = "0xPROCESSENV";
    expect(getPublicTurnstileSiteKey()).toBe("0xPROCESSENV");
  });

  it("trims whitespace from the value", () => {
    expect(getPublicTurnstileSiteKey({ PUBLIC_TURNSTILE_SITE_KEY: "  0xTrimmed  " })).toBe(
      "0xTrimmed",
    );
  });
});
