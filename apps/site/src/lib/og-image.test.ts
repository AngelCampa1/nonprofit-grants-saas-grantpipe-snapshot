import { describe, expect, it } from "vitest";

import { resolveGrantPipeOgImage } from "./og-image";

describe("resolveGrantPipeOgImage", () => {
  it("keeps the homepage on the default OG image", () => {
    expect(resolveGrantPipeOgImage("/")).toBe("/og-default.png");
  });

  it("assigns family-specific OG images for audited page types", () => {
    expect(resolveGrantPipeOgImage("/resources/guides/nonprofit-grant-compliance-guide")).toBe(
      "/og-guides.png",
    );
    expect(resolveGrantPipeOgImage("/compare/alternatives/bloomerang")).toBe(
      "/og-alternatives.png",
    );
    expect(resolveGrantPipeOgImage("/compare/pricing/bloomerang")).toBe("/og-pricing.png");
    expect(resolveGrantPipeOgImage("/nonprofit-software/california")).toBe("/og-state-pages.png");
    expect(resolveGrantPipeOgImage("/solutions/churches")).toBe("/og-solutions.png");
  });

  it("falls back to the default image for unknown route families", () => {
    expect(resolveGrantPipeOgImage("/compare")).toBe("/og-default.png");
    expect(resolveGrantPipeOgImage("/privacy")).toBe("/og-default.png");
  });

  it("normalizes trailing slashes and strips query fragments before route matching", () => {
    expect(resolveGrantPipeOgImage("/resources/guides/")).toBe("/og-guides.png");
    expect(resolveGrantPipeOgImage("/solutions/churches/?ref=nav#top")).toBe("/og-solutions.png");
  });

  it("supports an explicit fallback image when no route family matches", () => {
    expect(resolveGrantPipeOgImage("", "/og-custom.png")).toBe("/og-custom.png");
  });
});
