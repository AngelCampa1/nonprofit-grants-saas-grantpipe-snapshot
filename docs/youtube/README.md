# YouTube video integration

These videos are integrated across the marketing site, emails, and the app from a single registry.

## How to add a new video

1. Append a record to `packages/shared/src/constants/videos.ts`: add the slug to `VIDEO_SLUGS` and add the full `VideoRecord` object to `VIDEO_REGISTRY`.
2. Add `docs/youtube/<dir>/video.json` for it (copy the shape of an existing one) and add the same record to `docs/youtube/registry.json`.
3. Map it to pages via `targetPages` and/or a `leadMagnetSlug` on the record.

It then appears automatically in the /resources/videos hub, gets VideoObject schema, and renders on any mapped page or matching lead-magnet email. The `videos-docs-sync` and `videos` contract tests guard against drift.

## VideoRecord fields

| Field | Type | Notes |
|---|---|---|
| `slug` | `VideoSlug` | Unique identifier |
| `youtubeId` | `string` | YouTube video ID |
| `title` | `string` | Full SEO title |
| `shortTitle` | `string` | Display title in UI |
| `description` | `string` | One-sentence description |
| `category` | `"overview" \| "educational" \| "product"` | Content type |
| `pillar` | `string?` | Editorial pillar (educational only) |
| `targetKeyword` | `string?` | Primary SEO keyword |
| `runtimeSeconds` | `number` | Duration; 0 means uncatalogued |
| `publishedAt` | `string` | ISO date (YYYY-MM-DD) |
| `chapters` | `VideoChapter[]` | Timestamp + label pairs |
| `leadMagnetSlug` | `LeadMagnetSlug?` | Paired lead magnet |
| `targetPages` | `string[]` | Site paths where this video renders |

The `video.json` files in each dir also include three computed convenience fields: `url`, `embedUrl`, and `thumbnailUrl`.
