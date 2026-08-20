import { describe, expect, it } from "vitest";
import { appRouteUrl } from "../e2e-adhoc/app-route.mjs";

describe("production E2E app route URLs", () => {
  it.each([
    ["https://app.grantpipe.com", "/login", "https://app.grantpipe.com/app/login"],
    ["https://app.grantpipe.com/", "signup", "https://app.grantpipe.com/app/signup"],
    [
      "https://app.grantpipe.com/app",
      "/signup?plan=growth",
      "https://app.grantpipe.com/app/signup?plan=growth",
    ],
    ["https://app.grantpipe.com", "/app/login", "https://app.grantpipe.com/app/login"],
  ])("builds %s + %s as %s", (base, path, expected) => {
    expect(appRouteUrl(base, path)).toBe(expected);
  });
});
