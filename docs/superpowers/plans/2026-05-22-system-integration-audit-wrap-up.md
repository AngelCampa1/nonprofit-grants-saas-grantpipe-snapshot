# 2026-05-22 System Integration Audit Wrap-Up

## Completed

- Added production-preview-backed mobile smoke coverage for the marketing site.
- Hardened the site E2E runner so tests fail on stale preview ports and clean up the exact spawned preview process.
- Fixed mobile tap target regressions across shared site navigation, footer, breadcrumbs, table of contents, lead magnet controls, promo banners, pricing cards, and paid-search landing page links.
- Fixed the pricing mobile sticky CTA trigger by marking the pricing hero and covering hidden-at-top / visible-after-hero behavior.
- Added portal support for generated report quick-share links:
  - public portal hook for `/api/public/portal/generated-reports/:id`
  - `/portal/generated-reports/:id` route
  - portal home and evidence bundle routing for `generated_report` scopes
  - route and hook regression tests

## Missing Or Deferred

- Public portal generated reports are viewable, but there is still no public portal download endpoint for generated report files. Authenticated users can download generated reports through `/api/compliance/reports/:reportId/download`; reviewers cannot yet download report artifacts from the public portal.
- The web app still emits an existing lint warning in `apps/web/src/components/donors/contact-form.tsx` for React Hook Form `form.watch("type")` under the React Compiler incompatible-library rule.
- The web production build still emits the existing large chunk warning for the main bundle.
- The web coverage suite still emits existing noisy stderr from Bing UET script-loading tests and Recharts SVG casing tests, though the suite passes.
