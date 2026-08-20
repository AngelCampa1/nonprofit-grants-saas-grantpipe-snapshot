import { describe, expect, it } from "vitest";

import { resolveCanonicalHostRedirect } from "./canonical-host";

describe("resolveCanonicalHostRedirect", () => {
  it("redirects www traffic to the canonical apex host", () => {
    expect(
      resolveCanonicalHostRedirect(
        new URL("https://www.grantpipe.com/resources/?utm=ai"),
      )?.toString(),
    ).toBe("https://grantpipe.com/resources/?utm=ai");
  });

  it("does not redirect apex traffic", () => {
    expect(resolveCanonicalHostRedirect(new URL("https://grantpipe.com/pricing/"))).toBeNull();
  });

  it("does not redirect unrelated preview hosts", () => {
    expect(resolveCanonicalHostRedirect(new URL("https://preview.example.com/"))).toBeNull();
  });
});
