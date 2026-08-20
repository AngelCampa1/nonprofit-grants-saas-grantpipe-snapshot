import { readFileSync } from "node:fs";

import { VIDEOS } from "@grantpipe/shared";
import { describe, expect, it } from "vitest";

const source = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const videosHub = source("./pages/resources/videos.astro");
const resourcesIndex = source("./pages/resources/index.astro");

describe("videos hub page contract", () => {
  it("imports from @grantpipe/shared, video-embed.astro, and video-schema.ts", () => {
    expect(videosHub).toContain("@grantpipe/shared");
    expect(videosHub).toContain("video-embed.astro");
    expect(videosHub).toContain("video-schema.ts");
  });

  it("iterates all three categories", () => {
    expect(videosHub).toContain('"overview"');
    expect(videosHub).toContain('"educational"');
    expect(videosHub).toContain('"product"');
    expect(videosHub).toContain("getVideosByCategory(");
  });

  it("wires all three categories to getVideosByCategory", () => {
    expect(videosHub).toContain('getVideosByCategory("overview")');
    expect(videosHub).toContain('getVideosByCategory("educational")');
    expect(videosHub).toContain('getVideosByCategory("product")');
  });

  it("renders VideoEmbed components", () => {
    expect(videosHub).toContain("<VideoEmbed");
  });

  it("emits videoSchema JSON-LD for each video", () => {
    expect(videosHub).toContain("videoSchema(");
    expect(videosHub).toContain("application/ld+json");
  });

  it("links lead-magnet videos to /free/<slug>/", () => {
    expect(videosHub).toContain("/free/");
    expect(videosHub).toContain("leadMagnetSlug");
  });

  it("covers all 11 videos by mapping each category", () => {
    // 3 overview + 6 educational + 2 product = 11 total
    const overviewCount = VIDEOS.filter((v) => v.category === "overview").length;
    const educationalCount = VIDEOS.filter((v) => v.category === "educational").length;
    const productCount = VIDEOS.filter((v) => v.category === "product").length;
    expect(overviewCount).toBe(3);
    expect(educationalCount).toBe(6);
    expect(productCount).toBe(2);
    expect(overviewCount + educationalCount + productCount).toBe(11);
  });

  it("includes category heading labels", () => {
    expect(videosHub).toContain("Overview");
    expect(videosHub).toContain("Learn the rules");
    expect(videosHub).toContain("Using GrantPipe");
  });

  it("resources/index.astro links to the videos hub", () => {
    expect(resourcesIndex).toContain("/resources/videos/");
  });
});
