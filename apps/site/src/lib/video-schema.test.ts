import { describe, it, expect } from "vitest";
import { getVideo, youtubeThumbnailUrl, youtubeEmbedUrl, youtubeWatchUrl } from "@grantpipe/shared";
import { videoSchema, formatIsoDuration } from "./video-schema";

describe("formatIsoDuration", () => {
  it("formats 634 seconds as PT10M34S", () => {
    expect(formatIsoDuration(634)).toBe("PT10M34S");
  });

  it("formats 60 seconds as PT1M0S", () => {
    expect(formatIsoDuration(60)).toBe("PT1M0S");
  });

  it("formats 45 seconds as PT0M45S", () => {
    expect(formatIsoDuration(45)).toBe("PT0M45S");
  });

  it("formats 0 seconds as PT0M0S", () => {
    expect(formatIsoDuration(0)).toBe("PT0M0S");
  });
});

describe("videoSchema", () => {
  it("returns a VideoObject schema with correct fields for single-audit", () => {
    const record = getVideo("single-audit");
    const schema = videoSchema(record);

    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("VideoObject");
    expect(schema["name"]).toBe(record.title);
    expect(schema["description"]).toBe(record.description);
    expect(schema["uploadDate"]).toBe(record.publishedAt);
    expect(schema["embedUrl"]).toBe(youtubeEmbedUrl(record.youtubeId));
    expect(schema["contentUrl"]).toBe(youtubeWatchUrl(record.youtubeId));
  });

  it("thumbnailUrl is an array containing the hqdefault thumbnail", () => {
    const record = getVideo("single-audit");
    const schema = videoSchema(record);
    const thumbnailUrl = schema["thumbnailUrl"];

    expect(Array.isArray(thumbnailUrl)).toBe(true);
    expect(thumbnailUrl as string[]).toContain(youtubeThumbnailUrl(record.youtubeId, "hqdefault"));
  });

  it("embedUrl uses nocookie domain", () => {
    const record = getVideo("single-audit");
    const schema = videoSchema(record);
    expect(schema["embedUrl"] as string).toContain("youtube-nocookie.com");
  });

  it("includes duration for records with runtimeSeconds > 0", () => {
    const record = getVideo("single-audit"); // runtimeSeconds: 682
    const schema = videoSchema(record);
    expect(schema["duration"]).toBe("PT11M22S");
  });

  it("omits duration when runtimeSeconds is 0", () => {
    const record = getVideo("launch-preview"); // runtimeSeconds: 0
    const schema = videoSchema(record);
    expect("duration" in schema).toBe(false);
  });

  it("omits duration when synthesized record has runtimeSeconds 0", () => {
    const base = getVideo("single-audit");
    const record = { ...base, runtimeSeconds: 0 };
    const schema = videoSchema(record);
    expect("duration" in schema).toBe(false);
  });
});
