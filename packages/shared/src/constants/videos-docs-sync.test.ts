import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { VIDEO_REGISTRY, VIDEO_SLUGS } from "./videos";

const REPO_ROOT = path.resolve(__dirname, "../../../../");

const SLUG_TO_DIR: Record<string, string> = {
  "launch-preview": "docs/youtube/video-o1-launch-preview",
  "one-workspace-overview": "docs/youtube/video-o2-one-workspace-overview",
  "product-tour": "docs/youtube/video-o3-product-tour",
  "grant-tracking-spreadsheet": "docs/youtube/video-01-grant-tracking-spreadsheet",
  "grant-budget-template": "docs/youtube/video-02-grant-budget-template",
  "single-audit": "docs/youtube/video-03-single-audit",
  "getting-started": "docs/youtube/video-p1-getting-started",
  "add-grant-allocate": "docs/youtube/video-p2-add-grant-allocate",
  "track-restricted-funds": "docs/youtube/video-p3-track-restricted-funds",
  "fund-accounting": "docs/youtube/video-s1-fund-accounting",
  "uniform-guidance": "docs/youtube/video-s4-uniform-guidance",
};

describe("videos-docs-sync", () => {
  it("maps every registry slug to a local video.json directory (no silent skips)", () => {
    expect(Object.keys(SLUG_TO_DIR).sort()).toEqual([...VIDEO_SLUGS].sort());
  });

  it("registry.json contains exactly the 11 expected slugs with matching youtubeIds", () => {
    const registryPath = path.join(REPO_ROOT, "docs/youtube/registry.json");
    expect(fs.existsSync(registryPath), `registry.json not found at ${registryPath}`).toBe(true);

    const registry = JSON.parse(fs.readFileSync(registryPath, "utf-8")) as Array<{
      slug: string;
      youtubeId: string;
    }>;

    const registrySlugs = new Set(registry.map((r) => r.slug));
    const expectedSlugs = new Set(VIDEO_SLUGS as readonly string[]);

    expect(registrySlugs).toEqual(expectedSlugs);
    expect(registry).toHaveLength(VIDEO_SLUGS.length);

    for (const entry of registry) {
      const slug = entry.slug as (typeof VIDEO_SLUGS)[number];
      expect(VIDEO_REGISTRY[slug], `Slug ${slug} not in VIDEO_REGISTRY`).toBeDefined();
      expect(entry.youtubeId).toBe(VIDEO_REGISTRY[slug].youtubeId);
    }
  });

  it.each(Object.entries(SLUG_TO_DIR))(
    "video.json for %s exists, parses, and matches registry",
    (slug, relDir) => {
      const videoJsonPath = path.join(REPO_ROOT, relDir, "video.json");
      expect(fs.existsSync(videoJsonPath), `video.json not found at ${videoJsonPath}`).toBe(true);

      const parsed = JSON.parse(fs.readFileSync(videoJsonPath, "utf-8")) as {
        slug: string;
        youtubeId: string;
      };

      const validSlugs: ReadonlyArray<string> = VIDEO_SLUGS;
      expect(validSlugs.includes(parsed.slug), `slug ${parsed.slug} not in VIDEO_SLUGS`).toBe(true);
      expect(parsed.slug).toBe(slug);

      const key = parsed.slug as (typeof VIDEO_SLUGS)[number];
      expect(parsed.youtubeId).toBe(VIDEO_REGISTRY[key].youtubeId);
    },
  );
});
