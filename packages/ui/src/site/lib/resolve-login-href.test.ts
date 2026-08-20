import { describe, expect, it } from "vitest";

import { resolveLoginHref } from "./resolve-login-href";

describe("resolveLoginHref", () => {
  it("returns the origin + /login for an absolute URL", () => {
    expect(resolveLoginHref("https://app.grantpipe.com/signup")).toBe(
      "https://app.grantpipe.com/app/login",
    );
  });

  it("strips path, query, and hash from the input origin", () => {
    expect(resolveLoginHref("https://app.grantpipe.com/path/deep?utm=1#frag")).toBe(
      "https://app.grantpipe.com/app/login",
    );
  });

  it("returns the fallback for a relative path", () => {
    expect(resolveLoginHref("/signup", "https://fallback.test/login")).toBe(
      "https://fallback.test/login",
    );
  });

  it("returns undefined for a relative path when no fallback is provided", () => {
    expect(resolveLoginHref("/signup")).toBeUndefined();
  });

  it("returns the fallback for unparseable input", () => {
    expect(resolveLoginHref("not a url", "https://fallback.test/login")).toBe(
      "https://fallback.test/login",
    );
  });

  it("returns the fallback when the input is undefined", () => {
    expect(resolveLoginHref(undefined, "https://fallback.test/login")).toBe(
      "https://fallback.test/login",
    );
  });

  it("returns undefined when the input is undefined and no fallback is provided", () => {
    expect(resolveLoginHref(undefined)).toBeUndefined();
  });

  it("returns the fallback when the input is null", () => {
    expect(resolveLoginHref(null, "https://fallback.test/login")).toBe(
      "https://fallback.test/login",
    );
  });

  it("returns the fallback when the input is an empty string", () => {
    expect(resolveLoginHref("", "https://fallback.test/login")).toBe("https://fallback.test/login");
  });
});
