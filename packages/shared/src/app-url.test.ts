import { describe, expect, it } from "vitest";
import { APP_BASE_PATH, buildAppUrl, normalizeAppPath } from "./app-url";

describe("canonical app URLs", () => {
  it("owns the authenticated UI under /app", () => {
    expect(APP_BASE_PATH).toBe("/app");
  });

  it.each([
    ["/login", "/app/login"],
    ["signup", "/app/signup"],
    ["/app/settings", "/app/settings"],
    ["/app", "/app"],
    ["/app?source=email", "/app?source=email"],
    ["/app#billing", "/app#billing"],
  ])("normalizes %s to %s", (path, expected) => {
    expect(normalizeAppPath(path)).toBe(expected);
  });

  it("builds a canonical URL without duplicating the base path", () => {
    expect(buildAppUrl("https://app.grantpipe.com/", "/portal/token-1")).toBe(
      "https://app.grantpipe.com/app/portal/token-1",
    );
    expect(buildAppUrl("https://app.grantpipe.com", "/app/login")).toBe(
      "https://app.grantpipe.com/app/login",
    );
  });

  it("accepts a configured base URL that already ends in /app", () => {
    expect(buildAppUrl("https://app.grantpipe.com/app/", "/login")).toBe(
      "https://app.grantpipe.com/app/login",
    );
  });

  it("preserves query strings and fragments", () => {
    expect(buildAppUrl("https://app.grantpipe.com", "/settings?source=email#billing")).toBe(
      "https://app.grantpipe.com/app/settings?source=email#billing",
    );
  });
});
