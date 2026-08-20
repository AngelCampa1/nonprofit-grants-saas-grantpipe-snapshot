# YouTube Video Integration — Design Spec

_Created 2026-06-09. Integrates the 11 published @Grantpipe YouTube videos across the marketing site, transactional/nurture emails, and the in-app experience, behind a single reusable registry so future videos drop in with one record._

## Goal

GrantPipe has 11 published YouTube videos but they are wired in almost nowhere (only `explainer-video.astro` hardcodes one ID). Integrate them everywhere it earns its place — marketing site, emails, and the app — driven by **one shared registry** so adding the next video is a one-record change. Keep a durable local metadata copy per video for reference.

## The 11 Published Videos (resolved from the channel)

| Slug                         | YouTube ID    | Title                                                         | Category    | Maps to                                                       |
| ---------------------------- | ------------- | ------------------------------------------------------------- | ----------- | ------------------------------------------------------------- |
| `launch-preview`             | `aM62cq64cQQ` | GrantPipe Launch Preview                                      | overview    | hub only                                                      |
| `one-workspace-overview`     | `dd2pJ6ZdEHI` | One Workspace for Grants, Funds, Donors, and Compliance       | overview    | explainer default, product, index, app help                   |
| `product-tour`               | `o-FVZeO3rjw` | Product Tour: Grants, Restricted Funds, Compliance, Reporting | overview    | product, hub                                                  |
| `grant-tracking-spreadsheet` | `hOjiniNapo0` | The Missing Column in Your Grant Tracking Spreadsheet         | educational | grant-tracking-software, `/free/grant-tracking-template`, hub |
| `grant-budget-template`      | `1Cg_DOTSOho` | Grant Budget Template: Build It Step by Step                  | educational | budget template page/free, hub                                |
| `single-audit`               | `AqnkoZGbJY0` | The Single Audit Explained (2024 Rules)                       | educational | grant-compliance pages, single-audit glossary, hub            |
| `track-restricted-funds`     | `hvVBvw45iH0` | How to Track Restricted Funds Correctly                       | educational | restricted-fund-tracking, restricted glossary, hub            |
| `fund-accounting`            | `Q2diz34DEP4` | What Is Fund Accounting? (Plain-English)                      | educational | fund-accounting glossary/resources, hub                       |
| `uniform-guidance`           | `3WUKz3HgCM0` | Uniform Guidance (2 CFR 200) Explained                        | educational | compliance pages, uniform-guidance glossary, hub              |
| `getting-started`            | `3c5Txb_PPW0` | Getting Started with GrantPipe                                | product     | app onboarding, app help, hub                                 |
| `add-grant-allocate`         | `Bh9hr-xiCeU` | Add a Grant and Split It Across Your Funds                    | product     | app grants empty state, app help, hub                         |

Page mappings are illustrative; the implementation resolves the exact existing routes/slugs (e.g. glossary slugs, free-page slugs) at build time and only maps a video to a page that actually exists.

## Architecture

### 1. Single source of truth — `packages/shared/src/constants/videos.ts`

Mirrors the existing `lead-magnets.ts` convention. Exports:

```ts
export const VIDEO_SLUGS = [...] as const;
export type VideoSlug = (typeof VIDEO_SLUGS)[number];
export type VideoCategory = "overview" | "educational" | "product";

export interface VideoChapter { label: string; seconds: number; }

export interface VideoRecord {
  slug: VideoSlug;
  youtubeId: string;          // 11-char YouTube ID
  url: string;                // canonical watch URL
  title: string;              // full published title
  shortTitle: string;         // UI-friendly label
  description: string;        // 1–2 sentence summary (humanized, third-grade pass)
  category: VideoCategory;
  pillar?: string;            // strategy pillar (Compliance, Accounting, ...)
  targetKeyword?: string;
  runtimeSeconds: number;
  publishedAt: string;        // ISO date
  chapters: VideoChapter[];
  leadMagnetSlug?: string;    // matching email-gated template, if any
  targetPages: string[];      // site routes this video should embed on
}

export const VIDEO_REGISTRY: Record<VideoSlug, VideoRecord>;
export const VIDEOS: VideoRecord[];                 // ordered array

// helpers
export function getVideo(slug: VideoSlug): VideoRecord;
export function getVideosByCategory(c: VideoCategory): VideoRecord[];
export function getVideoForPage(path: string): VideoRecord | undefined;
export function getVideoByLeadMagnet(slug: string): VideoRecord | undefined;
export function youtubeEmbedUrl(id: string, opts?): string;     // youtube-nocookie embed
export function youtubeWatchUrl(id: string): string;
export function youtubeThumbnailUrl(id: string, quality?): string; // i.ytimg.com
```

Re-exported via `packages/shared/src/constants/index.ts` so it flows through the package barrel and is importable as `import { VIDEO_REGISTRY } from "@grantpipe/shared"` from site, API, and app. User-facing strings (`description`, `shortTitle`) pass the `humanizer` + `third-grade-copy` checks.

### 2. Durable local metadata — `docs/youtube/`

- A `video.json` written into each `docs/youtube/video-*/` dir holding the full `VideoRecord` (this finally records the **published YouTube ID**, missing today).
- A generated `docs/youtube/registry.json` aggregate index.
- A `docs/youtube/README.md` documenting the reusable add-a-video pattern.
- A sync test (in `packages/shared`) asserts `VIDEO_REGISTRY` and the `docs/youtube/*/video.json` files agree (same slugs, same IDs), so the local reference never drifts from code.

### 3. Marketing site (`apps/site`)

- **`VideoEmbed` component** — extract the lazy click-to-load YouTube facade from `explainer-video.astro` into a small reusable `VideoEmbed.astro` (poster → swaps in `youtube-nocookie` iframe on click). `explainer-video.astro` keeps its rich layout but consumes `VideoEmbed` + registry defaults instead of a hardcoded ID.
- **`/resources/videos` hub page** — lists all videos grouped by category, each a `VideoEmbed` card with title, summary, and (where present) a link to the matching free template. Added to the resources index nav and sitemap.
- **Contextual embeds** — each educational/overview video embedded on its mapped existing page via `getVideoForPage()`. Only pages that already exist receive an embed.
- **`VideoObject` JSON-LD** — emitted on every page that embeds a video (hub + contextual + product), built from the registry (name, description, thumbnailUrl, uploadDate, embedUrl, duration ISO-8601). Centralized in a `videoSchema(record)` helper.

### 4. Emails (`apps/api`)

- Add `renderVideoCard(record)` to `apps/api/src/lib/email-layout.ts` — an Outlook-safe `<table>` with a clickable thumbnail `<img>` (from `youtubeThumbnailUrl`) linking to the watch URL, plus title + "Watch on YouTube" link. Matches the existing raw-HTML-string + `renderCtaButton` style.
- Inject the matching video into the lead-magnet **delivery** email when `getVideoByLeadMagnet(slug)` resolves (e.g. `grant-tracking-template` delivery email shows the tracking-spreadsheet video). Falls back gracefully to no card when there's no match.
- Email copy passes `humanizer` + `third-grade-copy`.

### 5. App (`apps/web`)

- **`VideoDialog` / `VideoCard`** — a small component (in `apps/web`, using `@grantpipe/ui` `Dialog`/`Card` + an `aspect-video` iframe facade) that plays a registry video in a modal.
- **`/help`** — replace the external `PRODUCT_TOUR_URL` "5-minute tour" link with the in-app `one-workspace-overview` video; add a small "Learn" list of the product how-to videos (`getting-started`, `add-grant-allocate`).
- **Onboarding** — step 1 surfaces `getting-started` via `VideoDialog` instead of the external link.
- **Empty states** — `TeachAndActEmptyState` on the grants list gains a "Watch: Add a grant" `helpLink`/action opening `add-grant-allocate`.

### 6. Reusable pattern (the deliverable)

Documented in `docs/youtube/README.md`: to add a future video, (1) append a record to `videos.ts`, (2) drop a `video.json` in its docs dir. It then auto-appears in the hub, gets `VideoObject` schema, and renders on any page/email it's mapped to. The sync + contract tests guard correctness.

## Testing & Quality

- **TDD**, **95% coverage on every touched file**.
- **Registry contract test** (`packages/shared`): all `youtubeId` are 11 chars and unique; every `leadMagnetSlug` exists in `LEAD_MAGNET_SLUGS`; every `targetPages` entry is a non-empty route; helpers resolve correctly; 11 records present.
- **Docs sync test**: `video.json` files ↔ `VIDEO_REGISTRY` agree.
- **Email test**: `renderVideoCard` emits a thumbnail-linked anchor + title; delivery email includes the card only when a video maps.
- **Site contract tests**: update `explainer-video-contract.test.ts`; add a videos-hub contract test (all videos rendered, embeds use `youtube-nocookie`, JSON-LD `VideoObject` present and valid).
- **App test**: `VideoDialog` opens/closes and lazy-loads the iframe; help/onboarding/empty-state wiring renders the right slug.
- Buttons/CTAs remain pill-shaped (Design Canon). Light theme only.

## Out of Scope

- Generating new videos, Shorts, or thumbnails.
- A blog CMS (reuse existing `resources/guides` if an embed target exists; no new blog engine).
- Auto-publishing to YouTube or Postiz.
- Video sitemap XML beyond the standard sitemap entry for the hub page (can be a follow-up).

## Workflow

Sub-agent-driven, worktree-isolated (`worktree-youtube-video-integration`). Build in dependency order (shared registry + docs → site → emails → app), each phase TDD with its own tests, then multiple review/fix cycles via the permitted review path until clean, merge to `master`, remove worktree, deploy `grantpipe-site`, `grantpipe-api`, `grantpipe-web`.
