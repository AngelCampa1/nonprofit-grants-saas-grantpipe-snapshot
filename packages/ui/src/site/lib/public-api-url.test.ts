import { afterEach, describe, expect, it } from "vitest";
import { getPublicApiBaseUrl } from "./public-api-url";

const ORIGINAL_ENV = process.env.PUBLIC_APP_URL;

afterEach(() => {
  if (ORIGINAL_ENV === undefined) {
    delete process.env.PUBLIC_APP_URL;
  } else {
    process.env.PUBLIC_APP_URL = ORIGINAL_ENV;
  }
});

describe("getPublicApiBaseUrl", () => {
  it("defaults to the app Worker origin, not the marketing origin", () => {
    delete process.env.PUBLIC_APP_URL;
    expect(getPublicApiBaseUrl()).toBe("https://app.grantpipe.com");
  });

  it("uses an explicit PUBLIC_APP_URL override without a trailing slash", () => {
    expect(getPublicApiBaseUrl({ PUBLIC_APP_URL: "https://staging.app/" })).toBe(
      "https://staging.app",
    );
  });

  it("falls back when the override is blank", () => {
    expect(getPublicApiBaseUrl({ PUBLIC_APP_URL: "   " })).toBe("https://app.grantpipe.com");
  });

  it("uses process env as the Node test fallback", () => {
    process.env.PUBLIC_APP_URL = "http://localhost:8787/";
    expect(getPublicApiBaseUrl()).toBe("http://localhost:8787");
  });
});
