import type { VideoRecord } from "@grantpipe/shared";
import { youtubeThumbnailUrl, youtubeEmbedUrl, youtubeWatchUrl } from "@grantpipe/shared";

export function formatIsoDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `PT${minutes}M${secs}S`;
}

export function videoSchema(record: VideoRecord): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: record.title,
    description: record.description,
    thumbnailUrl: [youtubeThumbnailUrl(record.youtubeId, "hqdefault")],
    embedUrl: youtubeEmbedUrl(record.youtubeId),
    contentUrl: youtubeWatchUrl(record.youtubeId),
    uploadDate: record.publishedAt,
  };

  if (record.runtimeSeconds > 0) {
    schema["duration"] = formatIsoDuration(record.runtimeSeconds);
  }

  return schema;
}
