# Persona Landing Pages — Deepen, Link, and Optimize

**Date:** 2026-06-01
**Branch:** `goal/persona-landing-pages`
**Status:** Approved scope (autonomous /goal execution)

## Goal

Make each user-persona landing page ultra-specific, strongly internally linked
(surfaced in a nav submenu but individually linkable), and maximally optimized
for both traditional SEO and AI/answer-engine SEO. Every page gets a humanizer
pass and a third-grade reading-level pass. Sub-agent driven, with multiple
review/fix cycles until nothing is left to fix.

## Current State

- 8 persona markdown files live in
  `packages/shared/src/knowledge/marketing/content/personas/`:
  `executive-directors`, `development-directors`, `finance-operations-staff`,
  `grants-managers`, `grant-writers`, `program-directors`,
  `operations-managers`, `board-treasurers`.
- They render at `/for/[slug]` via `ArticleLayout` (apps/site `src/pages/for/[slug].astro`),
  with a `/for` hub (`CategoryHub`).
- `personaSchema` (packages/ui `src/site/content/schemas.ts`) supports rich,
  AI-extractable blocks: `painPoints`, `jobsToBeDone`, `featureMap`, `answers`,
  `faqs`, `definitions`, `pricingStats`, `tableData`, `proscons`,
  `expertQuotes`, `sourceUrls`, `relatedPages`, `recommendedTier`, `entitlement`.
- "By Role" → `/for` already appears in the Resources megamenu (`resource-hubs.ts`,
  "By Audience" group) and footer — but **individual persona pages are not**
  directly linked from global navigation.
- `apps/site/src/config/personas.ts` lists only 3 of the 8 personas.

## Scope Decisions (locked)

1. **Deepen the existing 8** personas to be ultra-specific. No net-new personas
   (avoids thin content / keyword cannibalization).
2. **Internal linking:** keep `/for` in the Resources megamenu + footer, **add a
   dedicated "By Role" submenu group listing each of the 8 personas** so every
   persona is one click from the global nav, and add contextual cross-links
   (persona↔persona siblings, and from product/features → relevant personas).

## What "ultra specific" means here (per page)

Each persona page must read like it was written by someone who has done that
exact job. Concretely:

- A sharp BLUF and TL;DR naming the role's real daily reality.
- "A day/week in the life" friction narrative specific to the role.
- Role-specific pain points, jobs-to-be-done, and a feature→benefit map where
  every benefit is phrased in that role's language and stakes.
- Role-specific objections answered (FAQs + `answers` blocks).
- Concrete, sourced statistics relevant to the role (`pricingStats`/`statistics`).
- A comparison/decision `tableData` block where it adds value (e.g. "before vs
  with GrantPipe" for that role, or tools-the-role-juggles).
- 2–4 `definitions` for the role's jargon (feeds DefinedTerm/AI extraction).
- `recommendedTier` + tier badge appropriate to the role.

## SEO / AI-SEO requirements (per page)

- Unique `seoTitle` (≤ snippet length) and `seoDescription`.
- `answers`, `faqs`, and `sourceUrls` all present and non-empty.
- At least one of `statistics` / `pricingStats` / `tableData` present.
- ≥ 500 body words.
- `relatedPages` (≥ 3) all resolve to real public routes; include sibling
  personas and topically-relevant guides/features.
- Correct 2024 Uniform Guidance numbers; never the retired three-quarter-million
  single-audit figure, never the retired 10% de minimis as current.
- No banned generic phrases (`empower`, `transform`, `revolutionize`, `robust`,
  `... landscape`, `leading/premier/top-rated/world-class`, triple
  "built/designed for").
- No slop phrases (`no consultants required`, `audit-ready reporting`,
  `one operating system`, etc.).
- No mojibake; no lossy `?` punctuation; no question text ending in hyphens.
- `lastReviewedAt`/`verifiedAt`/`updatedAt` = 2026-06-01 (within 180-day gate).
- Humanizer + third-grade-copy passes applied to all prose (domain terms kept
  but defined; sentences short and plain).

## Test/Gate Changes (TDD — write/extend first, then make green)

1. Add the persona collection to `getIndexedSeoContentFiles()` (500-word floor,
   lossy-punctuation, hyphen-question gates now cover personas).
2. Add the 8 persona files to `getPriorityAiSeoContentFiles()` (extractable
   answers/faqs/sources/stats + banned-generic-phrase gate now cover personas).
3. Add a focused persona-quality test: every persona has `painPoints`,
   `jobsToBeDone`, `featureMap`, ≥3 `relatedPages`, `recommendedTier`, and links
   to ≥1 sibling persona.
4. Update `personas.test.ts` if `personas.ts` config is expanded to all 8.
5. Megamenu: extend `resource-hubs.test.ts` for the new "By Role" persona group.

## Workflow

Sub-agent driven. Personas processed in parallel batches (independent files).
Each persona: rewrite → humanizer pass → third-grade pass → self-check against
gates. Then global passes: nav/linking wiring, test extensions, full
`turbo typecheck test` for `@grantpipe/site` + `@grantpipe/ui`, build, code
review, fix every finding, repeat until clean. Merge to master, remove worktree,
deploy site.

## Out of Scope

- New personas, web-app (`apps/web`) changes, pricing changes, redesign of
  `ArticleLayout`/`CategoryHub` internals beyond what linking requires.
