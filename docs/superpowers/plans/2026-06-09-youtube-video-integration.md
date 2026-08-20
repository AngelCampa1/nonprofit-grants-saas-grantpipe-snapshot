# YouTube Video Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the 11 published @Grantpipe YouTube videos across the marketing site, emails, and the app, driven by one shared registry, so future videos drop in with a single record.

**Architecture:** A typed `VIDEO_REGISTRY` in `@grantpipe/shared` is the single source of truth. Durable `video.json` files in `docs/youtube/` mirror it (guarded by a sync test). The site (Astro), API (email HTML), and app (React) all consume the registry. Build in dependency order: shared → docs → site → emails → app.

**Tech Stack:** TypeScript, Vitest, Astro 5, Hono, React 19, `@grantpipe/ui` (Radix + Tailwind 4), pnpm + turbo.

**Conventions:** TDD (write failing test → confirm fail → implement → confirm pass → commit). 95% coverage on every touched file. No `any`, no TODO/placeholder. Buttons are pills. Light theme only. User-facing copy passes `humanizer` + `third-grade-copy`. Run tests from the worktree root with `pnpm --filter <pkg> test`.

**Canonical video data** (authoritative for Task 1 — IDs, titles, slugs, categories):

| slug                         | youtubeId     | category    | leadMagnetSlug            |
| ---------------------------- | ------------- | ----------- | ------------------------- |
| `launch-preview`             | `aM62cq64cQQ` | overview    | —                         |
| `one-workspace-overview`     | `dd2pJ6ZdEHI` | overview    | —                         |
| `product-tour`               | `o-FVZeO3rjw` | overview    | —                         |
| `grant-tracking-spreadsheet` | `hOjiniNapo0` | educational | `grant-tracking-template` |
| `grant-budget-template`      | `1Cg_DOTSOho` | educational | `grant-budget-template`   |
| `single-audit`               | `AqnkoZGbJY0` | educational | —                         |
| `track-restricted-funds`     | `hvVBvw45iH0` | educational | —                         |
| `fund-accounting`            | `Q2diz34DEP4` | educational | —                         |
| `uniform-guidance`           | `3WUKz3HgCM0` | educational | —                         |
| `getting-started`            | `3c5Txb_PPW0` | product     | —                         |
| `add-grant-allocate`         | `Bh9hr-xiCeU` | product     | —                         |

Full titles are in the spec table. `chapters`, `runtimeSeconds`, and `publishedAt` are sourced from each `docs/youtube/video-*/publish-kit.md` CHAPTERS block where a matching dir exists; for the 3 overview/brand videos and any video without a publish-kit, use an empty `chapters: []` and a `runtimeSeconds` of `0` is NOT allowed — fetch runtime via the YouTube watch page is out of scope, so set `runtimeSeconds` from the publish-kit runtime line, and for the 3 overview videos use the documented runtimes if present else omit them from the JSON-LD `duration` (the schema helper must skip `duration` when `runtimeSeconds <= 0`).

---

## Phase A — Shared registry + durable local metadata

### Task 1: Video registry module

**Files:**

- Create: `packages/shared/src/constants/videos.ts`
- Modify: `packages/shared/src/constants/index.ts` (add `export * from "./videos";`)
- Test: `packages/shared/src/constants/videos.test.ts`

- [ ] **Step 1: Write the failing test** covering the registry contract:

```ts
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
    expect(total).toBe(11);
  });
  it("getVideoForPage and getVideoByLeadMagnet resolve mapped entries", () => {
    expect(getVideoByLeadMagnet("grant-tracking-template")?.slug).toBe(
      "grant-tracking-spreadsheet",
    );
    const v = getVideoForPage("/grant-tracking-software");
    expect(v?.slug).toBe("grant-tracking-spreadsheet");
  });
  it("every targetPages entry is a root-relative path", () => {
    for (const v of VIDEOS) for (const p of v.targetPages) expect(p.startsWith("/")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, confirm fail.** `pnpm --filter @grantpipe/shared test -- videos` → FAIL (module missing).

- [ ] **Step 3: Implement `videos.ts`.** Define `VideoCategory`, `VideoChapter`, `VideoRecord`, `VIDEO_SLUGS` (the 11 slugs above, ordered overview→educational→product), and `VIDEO_REGISTRY` with one full record per row. Source `title` from the spec table, `chapters`/`runtimeSeconds`/`publishedAt` from each `docs/youtube/video-*/publish-kit.md` (read them). Set `targetPages` from the spec "Maps to" column, restricted to routes that exist (confirm against `apps/site/src/pages`). Implement helpers; `youtubeEmbedUrl(id, opts)` returns `https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1` plus `&autoplay=1` when `opts?.autoplay`. `youtubeThumbnailUrl(id, quality = "hqdefault")` returns `https://i.ytimg.com/vi/${id}/${quality}.jpg`. Derive `VIDEOS` as `VIDEO_SLUGS.map((s) => VIDEO_REGISTRY[s])`. No `any`.

- [ ] **Step 4: Run, confirm pass.** Same command → PASS. Then `pnpm --filter @grantpipe/shared test:coverage -- videos` and confirm `videos.ts` ≥95%.

- [ ] **Step 5: Commit** `feat(shared): add YouTube video registry`.

### Task 2: Durable local metadata + sync test

**Files:**

- Create: `docs/youtube/video-*/video.json` (one per existing video dir that maps to a registry slug)
- Create: `docs/youtube/registry.json` (aggregate index)
- Create: `docs/youtube/README.md` (add-a-video pattern)
- Test: `packages/shared/src/constants/videos-docs-sync.test.ts`

- [ ] **Step 1: Write the failing sync test.** It reads every `docs/youtube/*/video.json` (resolve repo root via `path.resolve(__dirname, "../../../../")`), and asserts: each file parses; its `slug` is in `VIDEO_SLUGS`; its `youtubeId` equals `VIDEO_REGISTRY[slug].youtubeId`; and `registry.json` contains exactly the 11 registry records (same slugs + ids).

- [ ] **Step 2: Run, confirm fail** (files missing).

- [ ] **Step 3: Create the JSON files.** Write a `video.json` (the full `VideoRecord`) into each matching `docs/youtube/video-*/` dir, and a `docs/youtube/registry.json` array of all 11. Write `README.md` documenting: "To add a video — (1) append a record to `packages/shared/src/constants/videos.ts`, (2) add `docs/youtube/<dir>/video.json` (and update `registry.json`); it auto-appears in the hub, gets schema, and renders on mapped pages/emails. Tests guard drift."

- [ ] **Step 4: Run, confirm pass.**

- [ ] **Step 5: Commit** `docs(youtube): record published video IDs + sync test`.

---

## Phase B — Marketing site (`apps/site`)

### Task 3: Reusable `VideoEmbed` component + refactor explainer

**Files:**

- Create: `apps/site/src/components/video-embed.astro`
- Modify: `apps/site/src/components/explainer-video.astro` (consume `VideoEmbed`, default `youtubeId` from `getVideo("one-workspace-overview")`)
- Test: `apps/site/src/video-embed-contract.test.ts`; update `apps/site/src/explainer-video-contract.test.ts`

- [ ] **Step 1: Write the failing contract test.** Read `video-embed.astro` as text and assert it: references `youtube-nocookie.com/embed/`, uses a lazy click-to-load facade (a `[data-youtube-embed]` attribute + a play button), and accepts `youtubeId`/`title` props. Update the explainer test to assert the default ID now comes from the registry value `dd2pJ6ZdEHI` (not a hardcoded literal divorced from shared).

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Implement.** Extract the facade markup + inline script from `explainer-video.astro` into `video-embed.astro` (props: `youtubeId`, `iframeTitle`, `posterSrc?`, `playLabel?`). Re-point `explainer-video.astro` to render `VideoEmbed` in its media slot and import the registry for its default. Keep all existing CSS classes/behavior.

- [ ] **Step 4: Run site tests, confirm pass.** `pnpm --filter @grantpipe/site test`.

- [ ] **Step 5: Commit** `refactor(site): extract VideoEmbed, drive explainer from registry`.

### Task 4: `videoSchema` JSON-LD helper

**Files:**

- Create: `apps/site/src/lib/video-schema.ts`
- Test: `apps/site/src/lib/video-schema.test.ts`

- [ ] **Step 1: Failing test.** `videoSchema(getVideo("single-audit"))` returns an object with `@type: "VideoObject"`, `name`, `description`, `thumbnailUrl` (array), `embedUrl` (nocookie), `uploadDate`, and a `duration` ISO-8601 string only when `runtimeSeconds > 0` (assert it's omitted for a record with `runtimeSeconds <= 0`).

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Implement** `videoSchema(record)` producing the schema.org `VideoObject`; format duration as `PT#M#S`.

- [ ] **Step 4: Run, confirm pass** (≥95% coverage on the file).

- [ ] **Step 5: Commit** `feat(site): VideoObject JSON-LD helper`.

### Task 5: `/resources/videos` hub page

**Files:**

- Create: `apps/site/src/pages/resources/videos.astro`
- Modify: `apps/site/src/pages/resources/index.astro` (add a card/link to the hub)
- Test: `apps/site/src/videos-hub-contract.test.ts`

- [ ] **Step 1: Failing contract test.** Build/render assertion (follow the pattern of existing `*-contract.test.ts`): the hub source references all 11 `youtubeId`s, renders three category sections, includes `VideoObject` JSON-LD for each, and links each video with a `leadMagnetSlug` to `/free/<slug>` (or the vanity `/<slug>`). Assert embeds use `youtube-nocookie`.

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Implement** the hub page using the site's standard layout, `getVideosByCategory`, `VideoEmbed`, and `videoSchema`. Group: Overview, Learn the rules (educational), Using GrantPipe (product). Copy (eyebrow/intro) passes humanizer + third-grade. Add hub link on the resources index.

- [ ] **Step 4: Run, confirm pass.**

- [ ] **Step 5: Commit** `feat(site): /resources/videos hub`.

### Task 6: Contextual embeds on mapped pages

**Files:**

- Modify: the existing pages named in each educational/overview record's `targetPages` (e.g. `apps/site/src/pages/grant-tracking-software.astro`, `grant-compliance-software.astro`, `restricted-fund-tracking-software.astro`, `product.astro`, `pages/free/[slug].astro` for the two template freebies, glossary `[slug].astro` where the slug matches).
- Test: extend `apps/site/src/videos-hub-contract.test.ts` or add `contextual-video-contract.test.ts`

- [ ] **Step 1: Failing test.** For each mapped static page file, assert its source embeds the expected video's `VideoEmbed` + `videoSchema`. For the dynamic `free/[slug]` and `glossary/[slug]` pages, assert they call `getVideoForPage`/`getVideoByLeadMagnet` and conditionally render an embed.

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Implement.** On each static target page, add a `VideoEmbed` (variant compact) + `videoSchema` for the mapped video, placed sensibly in the content flow. On `free/[slug].astro` and `glossary/[slug].astro`, resolve the video by lead-magnet/page and render the embed only when one exists. Only embed where the registry record actually maps to an existing route.

- [ ] **Step 4: Run, confirm pass.** Then `pnpm --filter @grantpipe/site build` to confirm no broken refs.

- [ ] **Step 5: Commit** `feat(site): contextual video embeds on mapped pages`.

---

## Phase C — Emails (`apps/api`)

### Task 7: `renderVideoCard` email primitive

**Files:**

- Modify: `apps/api/src/lib/email-layout.ts`
- Test: `apps/api/src/lib/email-layout.test.ts` (create if absent)

- [ ] **Step 1: Failing test.** `renderVideoCard(getVideo("grant-tracking-spreadsheet"))` returns HTML containing: a `<table role="presentation">`, an `<img>` whose `src` is the `youtubeThumbnailUrl`, an `<a href>` to the watch URL wrapping the image, the video `shortTitle`/`title`, and a "Watch on YouTube" anchor. Assert no `<script>` and inline styles only (email-safe).

- [ ] **Step 2: Run, confirm fail.** `pnpm --filter @grantpipe/api test -- email-layout`.

- [ ] **Step 3: Implement** `renderVideoCard(record)` matching the existing raw-HTML + `renderCtaButton` style; width 560, rounded thumbnail, emerald link.

- [ ] **Step 4: Run, confirm pass** (≥95% on touched lines).

- [ ] **Step 5: Commit** `feat(api): renderVideoCard email primitive`.

### Task 8: Video in lead-magnet delivery email

**Files:**

- Modify: `apps/api/src/domains/leads/nurture-copy.ts` (`makeDeliveryStep`)
- Test: `apps/api/src/domains/leads/nurture-copy.test.ts` (extend/create)

- [ ] **Step 1: Failing test.** The delivery email for a lead magnet whose slug maps to a video (`grant-tracking-template`) includes the rendered video card (assert the watch URL / thumbnail appears); the delivery email for a slug with no mapped video does NOT include a video card.

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Implement.** In `makeDeliveryStep`, resolve `getVideoByLeadMagnet(slug)`; when present, insert `renderVideoCard(video)` after the download link with a short humanized line ("Want to see it built? Here's the walkthrough."). Thread the lead-magnet slug into the step factory if it isn't already available. No card when unmapped.

- [ ] **Step 4: Run, confirm pass.**

- [ ] **Step 5: Commit** `feat(api): embed matching video in lead-magnet delivery email`.

---

## Phase D — App (`apps/web`)

### Task 9: `VideoDialog` component

**Files:**

- Create: `apps/web/src/components/video-dialog.tsx`
- Test: `apps/web/src/components/video-dialog.test.tsx`

- [ ] **Step 1: Failing test** (Vitest + Testing Library): renders a trigger; clicking it opens the `Dialog`; the iframe is only mounted after open (lazy facade) and its `src` is the registry `youtubeEmbedUrl`; closing unmounts/stops it. Accepts a `slug: VideoSlug` prop and reads the registry.

- [ ] **Step 2: Run, confirm fail.** `pnpm --filter @grantpipe/web test -- video-dialog`.

- [ ] **Step 3: Implement** using `@grantpipe/ui` `Dialog`/`DialogContent` + an `aspect-video` container; play button mounts the iframe on click; pill-shaped trigger button.

- [ ] **Step 4: Run, confirm pass** (≥95%).

- [ ] **Step 5: Commit** `feat(web): VideoDialog component`.

### Task 10: Wire videos into help, onboarding, empty state

**Files:**

- Modify: `apps/web/src/routes/_authenticated/help.tsx` (replace external `PRODUCT_TOUR_URL` tour card with in-app `one-workspace-overview` `VideoDialog`; add a "Learn" list of `getting-started` + `add-grant-allocate`)
- Modify: `apps/web/src/routes/_authenticated/onboarding.tsx` (step 1 uses `VideoDialog` for `getting-started`)
- Modify: the grants-list empty state usage of `TeachAndActEmptyState` (add a "Watch: Add a grant" action → `VideoDialog` for `add-grant-allocate`)
- Test: extend the relevant route/component tests

- [ ] **Step 1: Failing tests.** help renders a `VideoDialog` for `one-workspace-overview` and lists the two product videos; onboarding step 1 renders the `getting-started` dialog; grants empty state exposes the add-grant video action.

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Implement** the three wirings. Keep the external link as a fallback "Open on YouTube" anchor where sensible. Copy passes humanizer + third-grade.

- [ ] **Step 4: Run, confirm pass.** Then `pnpm --filter @grantpipe/web test`.

- [ ] **Step 5: Commit** `feat(web): surface product videos in help, onboarding, empty states`.

---

## Phase E — Verification, review, merge, deploy

### Task 11: Full verification

- [ ] `turbo typecheck` (worktree root) — clean.
- [ ] `turbo test --force` — all packages green (use `--force` to defeat stale cache after merge per project memory).
- [ ] `pnpm --filter @grantpipe/site build` and `pnpm --filter @grantpipe/web build` — succeed.
- [ ] `pnpm format:check` — clean (run `pnpm format` if needed).
- [ ] Spot-check coverage on every touched file ≥95%.
- [ ] Commit any fixups.

### Task 12: Review / fix cycles

- [ ] Run the permitted review path (`superpowers:requesting-code-review`) on the full branch diff.
- [ ] Fix every issue flagged. Re-review. Repeat until clean.

### Task 13: Merge + deploy

- [ ] Merge `worktree-youtube-video-integration` → `master` (use `superpowers:finishing-a-development-branch`).
- [ ] Remove the worktree.
- [ ] Deploy affected apps: `pnpm run deploy:site`, `pnpm run deploy:api`, `pnpm run deploy:web`.
- [ ] Record a ledger entry consistent with the repo's existing `docs/superpowers/goals/` ledger style.

---

## Self-Review notes

- **Spec coverage:** registry (T1), local metadata + sync (T2), VideoEmbed/explainer refactor (T3), schema (T4), hub (T5), contextual embeds (T6), email primitive + delivery (T7–T8), app dialog + wiring (T9–T10), verify/review/merge/deploy (T11–T13). All spec sections mapped.
- **Type consistency:** `VideoRecord`, `VideoSlug`, `VideoCategory`, `getVideo`, `getVideoForPage`, `getVideoByLeadMagnet`, `youtubeEmbedUrl/WatchUrl/ThumbnailUrl`, `videoSchema`, `renderVideoCard`, `VideoDialog` used consistently across tasks.
- **No placeholders:** known data (IDs/slugs/categories/lead-magnet links) is given; derived data (chapters/runtime) has an explicit sourcing rule from publish-kits.
