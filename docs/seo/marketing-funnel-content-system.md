# GrantPipe marketing funnel content system

Date: 2026-07-01
Owner: GrantPipe product, marketing, and sales
Status: internal operating map

This map tells future agents where public marketing and SEO pages belong, what
source proves each claim, and what next step each page should create. Use it
with `docs/offers/marketing-sales-operating-system.md`.

## Source of truth order

Check these sources before adding or changing a public page:

1. `.agents/product-marketing.md` for audience, positioning, opportunity-search
   boundaries, and forbidden claims.
2. `packages/shared/src/pricing.ts` for plan prices, plan names, guarantee copy,
   founder links, plan features, and public pricing language.
3. `packages/shared/src/promos.ts` for promo codes, deadlines, active phases,
   and discount display rules.
4. `docs/offers/wave0-messaging-claims-ledger.md` for safe and gated messaging
   claims.
5. `packages/shared/src/capabilities.ts` for `CAPABILITY_CLAIMS`, the shipped
   status, entitlement key, feature slug, and proof references for public
   capability claims.
6. `apps/site/src/lib/marketed-capabilities.ts` for capability anchors shown by
   the public site.
7. `packages/shared/src/constants/lead-magnets.ts` for lead magnet names, slugs,
   assets, and delivery assumptions.
8. Product specs under `docs/superpowers/specs/` and implemented code under
   `apps/web`, `apps/api`, `packages/shared`, and `packages/db` when a claim
   depends on shipped behavior.

Do not use generated JSON, rendered HTML, old social posts, or one-off planning
notes as the first source for a product claim. Trace the claim back to the
source above or keep it out of public copy.

## Routing source files

Keep this map aligned with the files that actually load, type, and render
marketing content:

- `packages/shared/src/knowledge/marketing/content-root.ts` defines the shared
  repository root for Markdown content.
- `packages/shared/src/knowledge/types.ts` defines
  `MARKETING_CONTENT_COLLECTIONS`, the collection names that must stay mapped.
- `apps/site/src/content.config.ts` wires each shared content collection into
  Astro.
- `apps/site/src/config/grant-recipient-seo.ts` defines `grantCategoryPages`,
  the root commercial SEO pages for GrantPipe's core software categories.
- `apps/site/src/lib/page-helpers.ts` maps shared content entries to public URL
  paths for search, related pages, and comparison routes.
- `packages/ui/src/site/content/schemas.ts` defines required content fields such
  as `buyerStage`, `primaryCta`, `relatedPages`, `sourceUrls`, `targetPersona`,
  and `topicCluster`.

If a new collection, route prefix, or required field is added in those files,
update this document and `apps/site/src/content-tests` in the same change.

## URL families

| URL family                                                                                                                                                                                                                               | Source path                                                                                                                                                                                                                                       | Buyer stage                | Job                                                                                               | Required next step                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `/`                                                                                                                                                                                                                                      | `apps/site/src/pages/index.astro`, `apps/site/src/config/site.ts`                                                                                                                                                                                 | Awareness                  | Explain the one-record thesis for grants, donors, restricted funds, evidence, and reporting       | Trial, pricing, or a high-fit resource    |
| `/pricing`                                                                                                                                                                                                                               | `apps/site/src/pages/pricing.astro`, `packages/shared/src/pricing.ts`, `packages/shared/src/promos.ts`                                                                                                                                            | Decision                   | Show plans, prices, trial terms, promo state, and plan fit                                        | Signup or founder contact                 |
| `/books`                                                                                                                                                                                                                                 | `apps/site/src/pages/books.astro`, `packages/shared/src/pricing.ts`                                                                                                                                                                               | Decision                   | Explain Books as GrantPipe's fund-accounting context while QuickBooks stays the accounting system | Pricing or Audit-Ready trial              |
| `/features/`                                                                                                                                                                                                                             | `apps/site/src/pages/features/[slug].astro`, `apps/site/src/lib/marketed-capabilities.ts`                                                                                                                                                         | Consideration              | Prove one shipped capability and its plan boundary                                                | Pricing, signup, or a related workflow    |
| `/solutions/`                                                                                                                                                                                                                            | `apps/site/src/pages/solutions/[slug].astro`, `apps/site/src/config/site.ts`                                                                                                                                                                      | Consideration              | Map GrantPipe to a buyer role or nonprofit operating context                                      | Trial or role-specific resource           |
| `/integrations/`                                                                                                                                                                                                                         | `apps/site/src/pages/integrations/[slug].astro`, `packages/shared/src/knowledge/marketing/content/integrations`                                                                                                                                   | Consideration              | Explain one integration or migration-adjacent path with its real support boundary                 | Feature, workflow, pricing, or trial      |
| `/nonprofit-software/`                                                                                                                                                                                                                   | `apps/site/src/pages/nonprofit-software/[slug].astro`, `apps/site/src/pages/nonprofit-software/[state]/[city].astro`, `packages/shared/src/knowledge/marketing/content/state-pages`, `packages/shared/src/knowledge/marketing/content/city-pages` | Awareness                  | Localize software, funding, compliance, or funder context only when sources support it            | Local lead magnet, guide, or trial        |
| `/grant-management-software/`, `/grant-compliance-software/`, `/grant-tracking-software/`, `/restricted-fund-tracking-software/`, `/grant-reporting-software/`, `/auditor-funder-portal-software/`, `/subrecipient-monitoring-software/` | `apps/site/src/pages/*software.astro`, `apps/site/src/config/grant-recipient-seo.ts`                                                                                                                                                              | Consideration              | Anchor root commercial SEO pages to the core GrantPipe software categories                        | Pricing, feature proof, or trial          |
| `/lp/`                                                                                                                                                                                                                                   | `apps/site/src/pages/lp`, paid landing page contracts, `apps/site/src/config/site.ts`                                                                                                                                                             | Campaign decision          | Match one campaign promise to a scoped offer and a working signup or contact path                 | Signup, pricing, or founder contact       |
| `/for/`                                                                                                                                                                                                                                  | `apps/site/src/pages/for/[slug].astro`, `packages/shared/src/knowledge/marketing/content/personas`                                                                                                                                                | Consideration              | Speak to one buyer role without changing the product promise                                      | Role-specific resource, trial, or pricing |
| `/free/`                                                                                                                                                                                                                                 | `apps/site/src/pages/free/[slug].astro`, `packages/shared/src/knowledge/marketing/content/lead-magnets`                                                                                                                                           | Lead capture               | Offer a free tool or asset that solves one narrow job                                             | Lead capture, then trial                  |
| `/workflows/`                                                                                                                                                                                                                            | `apps/site/src/pages/workflows/[slug].astro`, `packages/shared/src/knowledge/marketing/content/workflows`                                                                                                                                         | Activation intent          | Give a concrete process the buyer can run                                                         | Lead magnet, feature, or trial            |
| `/glossary/`                                                                                                                                                                                                                             | `apps/site/src/pages/glossary/[slug].astro`, `packages/shared/src/knowledge/marketing/content/glossary`                                                                                                                                           | Awareness                  | Define a term and point to deeper operational content                                             | Guide, workflow, or feature               |
| `/compare/`                                                                                                                                                                                                                              | `apps/site/src/pages/compare`, `packages/shared/src/knowledge/marketing/content/alternatives`, `packages/shared/src/knowledge/marketing/content/comparisons`, `packages/shared/src/knowledge/marketing/content/pricing-breakdowns`                | Consideration              | Compare categories, tools, pricing, or operating choices without fake rankings                    | Pricing, feature, or trial                |
| `/resources/guides/`                                                                                                                                                                                                                     | `packages/shared/src/knowledge/marketing/content/guides`                                                                                                                                                                                          | Awareness                  | Teach one search-backed problem with sourced nonprofit guidance                                   | Lead magnet, workflow, feature, or trial  |
| `/resources/best/`                                                                                                                                                                                                                       | `apps/site/src/pages/resources/best/[slug].astro`, `packages/shared/src/knowledge/marketing/content/listicles`                                                                                                                                    | Awareness or consideration | Help buyers compare options by need without unsupported rankings                                  | Comparison, pricing, or trial             |
| `/resources/faq/`                                                                                                                                                                                                                        | `apps/site/src/pages/resources/faq/[slug].astro`, `packages/shared/src/knowledge/marketing/content/faq-hubs`                                                                                                                                      | Awareness                  | Answer a recurring buying or operating question                                                   | Guide, workflow, or pricing               |
| `/resources/topics/`                                                                                                                                                                                                                     | `apps/site/src/pages/resources/topics/[slug].astro`, `apps/site/src/lib/topic-hubs.ts`, shared content collections                                                                                                                                | Awareness                  | Hub a topic cluster and route readers to spokes                                                   | Related guide, workflow, or feature       |
| `/resources/comparisons/`                                                                                                                                                                                                                | `packages/shared/src/knowledge/marketing/content/comparisons`                                                                                                                                                                                     | Legacy content family      | Keep source content organized even when public rendering uses `/compare/`                         | Pricing, feature, or trial                |
| `/resources/alternatives/`                                                                                                                                                                                                               | `packages/shared/src/knowledge/marketing/content/alternatives`                                                                                                                                                                                    | Legacy content family      | Keep source content organized even when public rendering uses `/compare/alternatives/`            | Pricing or trial                          |
| `/resources/lead-magnets/`                                                                                                                                                                                                               | `packages/shared/src/knowledge/marketing/content/lead-magnets`, `packages/shared/src/constants/lead-magnets.ts`                                                                                                                                   | Source content family      | Keep lead magnet source content tied to `/free/` routes and lead capture assets                   | Lead capture, then trial                  |
| `/resources/benchmarks/`                                                                                                                                                                                                                 | `packages/shared/src/knowledge/marketing/content/benchmarks`                                                                                                                                                                                      | Awareness                  | Explain sourced public data without overclaiming category proof                                   | Guide, workflow, or trial                 |

Every new public page must have one next step. Use `primaryCta` for the main
action and `relatedPages` for the internal path forward. No orphan page may ship:
it needs at least one inbound internal link and at least one outbound contextual
link to a relevant next step.

Root commercial SEO pages are not Markdown collections. Keep them in
`grantCategoryPages` so topic hubs, pricing text, link-graph checks, and
machine-readable pages share one category-page source.

## Content collection route map

Use this table when adding Markdown under
`packages/shared/src/knowledge/marketing/content`. The source collection names
come from `MARKETING_CONTENT_COLLECTIONS`; public prefixes come from the site
runtime: some are mapped in `apps/site/src/lib/page-helpers.ts`, and some are
defined by Astro page files.

| Collection source path                                               | Public route prefix      | Notes                                                                 |
| -------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------- |
| `packages/shared/src/knowledge/marketing/content/alternatives`       | `/compare/alternatives/` | One competitor alternative page.                                      |
| `packages/shared/src/knowledge/marketing/content/benchmarks`         | `/resources/benchmarks/` | Sourced benchmark content; do not imply market proof without sources. |
| `packages/shared/src/knowledge/marketing/content/city-pages`         | `/nonprofit-software/`   | Localized city pages under state/city routes.                         |
| `packages/shared/src/knowledge/marketing/content/comparisons`        | `/compare/versus/`       | Versus pages; GrantPipe should be ordered first when present.         |
| `packages/shared/src/knowledge/marketing/content/faq-hubs`           | `/resources/faq/`        | FAQ hub pages with sourced answers.                                   |
| `packages/shared/src/knowledge/marketing/content/features`           | `/features/`             | Shipped capability pages tied to plan and entitlement truth.          |
| `packages/shared/src/knowledge/marketing/content/glossary`           | `/glossary/`             | Definitions that link to deeper guides, workflows, or features.       |
| `packages/shared/src/knowledge/marketing/content/guides`             | `/resources/guides/`     | Educational guides with source URLs and a next action.                |
| `packages/shared/src/knowledge/marketing/content/integrations`       | `/integrations/`         | Integration or migration boundary pages.                              |
| `packages/shared/src/knowledge/marketing/content/lead-magnets`       | `/free/`                 | Lead magnet landing pages tied to real assets.                        |
| `packages/shared/src/knowledge/marketing/content/listicles`          | `/resources/best/`       | Option lists without unsupported rankings.                            |
| `packages/shared/src/knowledge/marketing/content/personas`           | `/for/`                  | Buyer-role pages that keep the same product promise.                  |
| `packages/shared/src/knowledge/marketing/content/pricing-breakdowns` | `/compare/pricing/`      | Competitor pricing pages backed by dated sources.                     |
| `packages/shared/src/knowledge/marketing/content/state-pages`        | `/nonprofit-software/`   | State pages; check indexability before adding batches.                |
| `packages/shared/src/knowledge/marketing/content/vertical-pages`     | `/solutions/`            | Nonprofit operating-context pages.                                    |
| `packages/shared/src/knowledge/marketing/content/workflows`          | `/workflows/`            | Step-by-step process pages that route to a useful next step.          |

## When to add a page

Add a page only when it clears all four gates:

1. The buyer problem is real for GrantPipe's ICP: mid-sized US nonprofits with
   donors, grants, restricted funds, deadlines, evidence, and reporting work.
2. The page fits one URL family above. If it does not fit, update this map before
   adding the page.
3. The page can cite sources for educational claims and source code or docs for
   product claims.
4. The page has a clear next step: a lead magnet, workflow, feature page, pricing
   page, signup path, or founder contact path.

Do not add thin pages for keywords that only restate another page. Strengthen
the existing page or add internal links instead.

## Content fields

For Markdown content in `packages/shared/src/knowledge/marketing/content`, keep
these fields aligned:

- `buyerStage`: Use `tofu`, `mofu`, `bofu`, or the local convention already used
  by nearby files.
- `primaryCta`: Name the next action. Do not use a generic label.
- `relatedPages`: Include enough relevant links to keep the page connected to
  its cluster.
- `sourceUrls`: Include real source URLs for factual claims.
- `topicCluster`: Use a cluster that maps back to product and ICP problems.

If a page mentions GrantPipe capabilities, compare that copy against
`.agents/product-marketing.md`, `packages/shared/src/pricing.ts`, and
`apps/site/src/lib/marketed-capabilities.ts`.

## Capability claim proof ladder

Use this ladder before adding or expanding any public capability claim. Do not
market a capability from a feature landing page alone.

1. Positioning boundary: check `.agents/product-marketing.md` and
   `.agents/product-marketing-context.md` for ICP, product category,
   opportunity-search boundaries, forbidden claims, and builder-perspective
   language.
2. Plan and entitlement truth: check `packages/shared/src/pricing.ts` for
   `PLAN_CATALOG`, plan feature copy, and trial language. Check
   `packages/shared/src/constants/index.ts` for `PLAN_ENTITLEMENTS` before
   naming the tier that gets the capability.
3. Product proof anchor: check `apps/site/src/lib/marketed-capabilities.ts` for
   the product-page narrative and `FEATURE_PAGE_BY_CAPABILITY_ITEM` mapping.
   Every high-level capability item shown on `/product` needs a real feature
   route or it stays out of the product proof surface.
4. Capability claim registry: check `packages/shared/src/capabilities.ts` for
   `CAPABILITY_CLAIMS`. The registry ties each public claim to shipped status,
   the feature slug, the entitlement key or every-plan inclusion, implementation
   proof, and contract tests.
5. Feature-page proof: check
   `packages/shared/src/knowledge/marketing/content/features`. Capability pages
   should carry `entitlement:` when the feature is plan-gated and `sourceUrls`
   for factual, regulatory, or market claims.
6. Implementation proof: for shipped behavior, inspect implemented code under
   `apps/web`, `apps/api`, `packages/shared`, and `packages/db`. A planned spec,
   generated page, old doc, or public landing page is not enough proof that the
   product can do the thing.

If the ladder disagrees, use the lower-level source as current truth: shipped
code and shared pricing/entitlements over page copy, page copy over generated
artifacts, and explicit product-marketing boundaries over opportunistic SEO
phrasing.

## Topic clusters

Use these clusters first:

| Cluster                    | Fits when the page is about                                                     | Product connection                                                |
| -------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Grant management           | Grant pipeline, awards, reporting, deadlines, closeout, renewals                | Grants, tasks, reports, activity log                              |
| Grant compliance           | federal rules, evidence, audit files, drawdowns, closeout, Single Audit prep    | Compliance calendar, evidence, reports, auditor portal            |
| Restricted fund accounting | restricted gifts, releases, fund balances, rollforwards, board reporting        | Funds, allocations, restricted fund lifecycle, QuickBooks context |
| Donor and grant handoff    | donor CRM gaps, development to finance handoff, board reporting                 | Donors, grants, funds, imports, dashboards                        |
| Opportunity tracking       | Grants.gov, manual imports, state or foundation opportunities, prospect context | Grants.gov search plus manual/imported non-federal tracking       |

Opportunity tracking has a hard boundary: GrantPipe includes Grants.gov federal
opportunity search, manual/imported non-federal opportunity tracking, and public
foundation prospect context where available. Do not claim a proprietary private
foundation, corporate, association, or state/local opportunity database.

## Redirect rule

If a URL moves, add a 301 redirect in the site routing or Cloudflare deploy path
before deleting the old URL. Then test the old URL and the new URL. Preserve the
old URL in the redirect map until production proves the redirect works.

Do not rename slugs during a copy cleanup unless the redirect is part of the same
change. Slug cleanup without a redirect is a broken funnel step.

## Indexability proof

Route existence is not indexability. A route can exist for users, links, or paid
traffic and still be intentionally excluded from search.

Use these sources before calling a page indexable:

- `apps/site/astro.config.mjs` owns sitemap exclusion rules. Check
  `noindexPages`, `paidLandingPagePattern`, and `paginatedHubPattern` before
  exporting indexer URLs.
- `apps/site/src/lib/marketing-link-graph.ts` owns crawl graph rules used by
  orphan-route tests. Check `crawlExcludedRoutes` before treating a reachable
  route as an organic SEO page.
- The production sitemap endpoints are
  `https://grantpipe.com/sitemap-index.xml` and
  `https://grantpipe.com/sitemap.xml`. Confirm the deployed URL appears there
  when the page is meant to be indexed.
- Use `curl.exe -I` or a browser check against production after deploy to prove
  the final URL returns a healthy status and does not redirect unexpectedly.

Do not add paid landing pages, noindex pages, paginated hubs, or redirected
legacy URLs to indexer handoff files. If a page is useful but not indexable,
keep it in the route map and out of the production URL artifact.

## Production URL handoff

When a shipped SEO expansion needs indexer submission, export a plain `.txt`
file under `docs/seo/` after deploy and after live checks. The existing ICP
handoff is `docs/seo/icp-seo-prod-urls-2026-06-29.txt`.

The artifact format is strict:

- one production URL per line
- production host only
- trailing slash normalized
- no blank lines
- no duplicates

Only include URLs that are live, canonical, intended for organic indexing, and
safe to hand to an external indexer.

Older URL files are historical inventories, not handoff-ready artifacts:

- `apps/site/public/new-pages-2026-04-24.txt`
- `apps/site/public/new-pages-2026-04-25.txt`
- `marketing-indexing-urls.txt`

Do not copy those files into a fresh indexer submission without rechecking each
URL against production status, canonical host, trailing slash format, sitemap
inclusion, and noindex rules.

## Generation and checks

Run these checks after adding or moving public content:

```bash
pnpm run knowledge:generate
pnpm run knowledge:check
pnpm --filter @grantpipe/site test
```

Use targeted tests first while working, then broaden the run before merge. The
ICP SEO production URL artifact lives at
`docs/seo/icp-seo-prod-urls-2026-06-29.txt`; keep a plain `.txt` production URL
export when a new SEO expansion ships.

Useful guards live under `apps/site/src/content-tests`. Add or update a contract
test when a new drift class appears, such as wrong plan copy, stale capability
claims, orphan pages, missing source URLs, missing `primaryCta`, weak
`relatedPages`, or a moved URL without a 301 redirect.

## Known cleanup queue

- Sitemap and indexability rules are narrower than route existence. Before
  claiming a URL family is indexed, check the Astro sitemap output, robots rules,
  and production response.

## Copy and claim gates

For public copy, run the repo copy gate in this order:

1. `stop-slop`
2. `humanizer`
3. `third-grade-copy`
4. Zero-lies review against product, pricing, promo, lead magnet, and capability
   sources.
5. Fit review against the page, buyer stage, CTA, and surrounding funnel step.

Do not publish testimonials, customer counts, nonprofit operator experience,
rankings, "most teams" claims, or private database claims unless a named source
of truth approves them.

## Agent workflow

When a future agent adds pages:

1. Pick the URL family and topic cluster first.
2. Identify the source file and the product claim sources.
3. Write or update a failing content contract test.
4. Add the page, source URLs, `primaryCta`, and `relatedPages`.
5. Run generation and targeted tests.
6. Export production URLs after deploy.
7. Run local and production E2E checks for the funnel path touched by the page.
