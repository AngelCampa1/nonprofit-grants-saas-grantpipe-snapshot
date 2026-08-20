import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { siteConfig } from "./config/site";

describe("siteConfig.promoBanner", () => {
  it("does not publish the retired limited-offer banner", () => {
    expect(siteConfig.promoBanner).toBeUndefined();
  });

  it("does not import retired promo catalog or deadline wiring", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./config/site.ts", import.meta.url)),
      "utf8",
    );

    expect(source).not.toContain("LAUNCH_PROMO_DEADLINE_ISO");
    expect(source).not.toContain("PROMO_CATALOG");
    expect(source).not.toContain("promoBanner:");
    expect(source).not.toContain("limitedOfferBannerMessage");
  });
});
