import { describe, it, expect } from "vitest";
import {
  VIDEO_SLUGS,
  VIDEO_REGISTRY,
  VIDEOS,
  getVideo,
  getVideosByCategory,
  getVideoForPage,
  getVideoByLeadMagnet,
  youtubeEmbedUrl,
  youtubeWatchUrl,
  youtubeThumbnailUrl,
} from "./videos";
import { LEAD_MAGNET_SLUGS } from "./lead-magnets";

describe("video registry", () => {
  it("has 11 videos and every slug resolves", () => {
    expect(VIDEO_SLUGS).toHaveLength(11);
    expect(VIDEOS).toHaveLength(11);
    for (const slug of VIDEO_SLUGS) expect(getVideo(slug).slug).toBe(slug);
  });
  it("every youtubeId is a unique 11-char id", () => {
    const ids = VIDEOS.map((v) => v.youtubeId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{11}$/);
  });
  it("every leadMagnetSlug exists in LEAD_MAGNET_SLUGS", () => {
    for (const v of VIDEOS)
      if (v.leadMagnetSlug) expect(LEAD_MAGNET_SLUGS).toContain(v.leadMagnetSlug);
  });
  it("url/watch/embed/thumbnail helpers agree with the id", () => {
    const v = getVideo("one-workspace-overview");
    expect(v.youtubeId).toBe("dd2pJ6ZdEHI");
    expect(youtubeWatchUrl(v.youtubeId)).toBe("https://www.youtube.com/watch?v=dd2pJ6ZdEHI");
    expect(youtubeEmbedUrl(v.youtubeId)).toContain("youtube-nocookie.com/embed/dd2pJ6ZdEHI");
    expect(youtubeThumbnailUrl(v.youtubeId)).toContain("dd2pJ6ZdEHI");
  });
  it("getVideosByCategory partitions all videos", () => {
    const total =
      getVideosByCategory("overview").length +
      getVideosByCategory("educational").length +
      getVideosByCategory("product").length;
    expect(total).toBe(VIDEOS.length);
    for (const v of VIDEOS) expect(["overview", "educational", "product"]).toContain(v.category);
  });
  it("each targetPage maps to at most one video", () => {
    const allPages = VIDEOS.flatMap((v) => v.targetPages);
    expect(new Set(allPages).size).toBe(allPages.length);
  });
  it("getVideoForPage and getVideoByLeadMagnet resolve mapped entries", () => {
    expect(getVideoByLeadMagnet("grant-tracking-template")?.slug).toBe(
      "grant-tracking-spreadsheet",
    );
    expect(getVideoForPage("/grant-tracking-software")?.slug).toBe("grant-tracking-spreadsheet");
  });
  it("every targetPages entry is a root-relative path", () => {
    for (const v of VIDEOS) for (const p of v.targetPages) expect(p.startsWith("/")).toBe(true);
  });
  it("youtubeEmbedUrl with autoplay adds autoplay param", () => {
    const url = youtubeEmbedUrl("dd2pJ6ZdEHI", { autoplay: true });
    expect(url).toContain("autoplay=1");
  });
  it("youtubeThumbnailUrl with custom quality uses that quality", () => {
    const url = youtubeThumbnailUrl("dd2pJ6ZdEHI", "maxresdefault");
    expect(url).toContain("maxresdefault");
    expect(url).toContain("dd2pJ6ZdEHI");
  });
  it("getVideoForPage returns undefined for unknown page", () => {
    expect(getVideoForPage("/nonexistent-page")).toBeUndefined();
  });
  it("VIDEO_REGISTRY has all slugs as keys", () => {
    for (const slug of VIDEO_SLUGS) expect(VIDEO_REGISTRY[slug]).toBeDefined();
  });
});
