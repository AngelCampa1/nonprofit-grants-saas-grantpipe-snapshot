# SEO Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve GrantPipe organic search performance by raising CTR and conversion readiness on pages that already have Google visibility, then expand only into DFS-validated commercial keyword gaps.

**Architecture:** Treat SEO as a content and routing system, not as isolated copy edits. High-impression pages get tighter metadata, clearer above-the-fold intent, stronger internal links, and freshness guards; hub pages expose live child routes; keyword expansion is limited to validated terms that fit GrantPipe's buyer and product boundaries.

**Tech Stack:** Astro site in `apps/site`, markdown content in `packages/shared/src/knowledge/marketing/content`, shared site UI in `packages/ui/src/site`, Vitest contract tests, Google Search Console MCP, DataForSEO MCP.

---

## Open Questions Before Implementation

1. Is the primary 30-day SEO goal trial signups, lead magnet captures, or traffic growth?
2. Should BOFU commercial pages outrank net-new informational pages in this phase?
3. Are compliance/legal-adjacent corrections approved when outdated threshold claims are found?
4. Is this scope limited to `grantpipe.com`, or should `app.grantpipe.com` technical SEO be included?
5. Which competitors must be prioritized beyond Bloomerang, Blackbaud, Salesforce, Neon, DonorPerfect, Instrumentl, Foundant, Submittable, and GrantHub?

## Evidence Collected

- `git pull` on `master`: already up to date.
- GSC property: `sc-domain:grantpipe.com`, permission `siteOwner`.
- GSC sitemap: `https://grantpipe.com/sitemap-index.xml`, last downloaded `2026-05-12 06:33`, `1,327` URLs, `0` errors, `0` warnings.
- GSC 90-day page data, pulled `2026-05-13`:
  - `https://grantpipe.com/`: `24` clicks, `254` impressions, `9.45%` CTR, position `4.5`.
  - `/resources/guides/nonprofit-crm-pricing-guide/`: `2` clicks, `7,774` impressions, `0.01%` CTR, position `8.8`.
  - `/resources/guides/salesforce-nonprofit-cost/`: `1` click, `1,865` impressions, `0.05%` CTR, position `7.5`.
  - `/compare/versus/salesforce-nonprofit-vs-blackbaud/`: `1` click, `1,372` impressions, `0.07%` CTR, position `12.3`.
  - `/compare/pricing/bloomerang/`: `5` clicks, `1,301` impressions, `0.38%` CTR, position `7.3`.
  - `/resources/guides/federal-procurement-thresholds-micro-small-large/`: `2` clicks, `1,025` impressions, `0.20%` CTR, position `8.4`.
- DFS keyword overview, pulled `2026-05-13`:
  - `nonprofit crm`: `2,400` US searches/month, KD `43`, commercial with informational secondary intent.
  - `grant management software`: `1,600` US searches/month, KD `23`, commercial.
  - `nonprofit grant management software`: `320` US searches/month, KD `12`, commercial, CPC `$75.98`.
  - `restricted fund accounting`: `50` US searches/month, informational, low backlink requirement.
  - `grant compliance software`: commercial intent; DFS did not return volume.
- Baseline in worktree: `pnpm install` completed; `pnpm --filter @grantpipe/site test` passed with `70` test files and `699` tests.

## File Structure

- Modify: `apps/site/src/high-impression-pages.fixture.ts` - update GSC snapshot so tests and optimization scope reflect current query/page data.
- Modify: `apps/site/src/high-ctr-title-contract.test.ts` - enforce CTR-focused metadata contracts for the refreshed priority pages.
- Modify: `apps/site/src/technical-seo-content.test.ts` - broaden stale federal Single Audit threshold guards if implementation uncovers phrasing not covered today.
- Modify: `apps/site/src/internal-link-graph-contract.test.ts` - add contract coverage for priority BOFU and compliance internal links.
- Modify: `apps/site/src/resource-hub-pages-source.test.ts` or adjacent hub contract tests - require hub pages to expose live child links instead of placeholder-like states.
- Modify: `packages/shared/src/knowledge/marketing/content/guides/nonprofit-crm-pricing-guide.md` - improve SERP metadata, opener, CTA path, and internal links.
- Modify: `packages/shared/src/knowledge/marketing/content/guides/salesforce-nonprofit-cost.md` - improve SERP metadata, source freshness, CTA path, and GrantPipe differentiation.
- Modify: `packages/shared/src/knowledge/marketing/content/comparisons/salesforce-nonprofit-vs-blackbaud.md` - improve title/description/opening, comparison intent, and related links.
- Modify: `packages/shared/src/knowledge/marketing/content/pricing-breakdowns/bloomerang-pricing.md` - improve title/description/opening and fee/contract scanability.
- Modify: `packages/shared/src/knowledge/marketing/content/guides/federal-procurement-thresholds-micro-small-large.md` - improve CTR and compliance-source presentation.
- Modify as needed: stale threshold content under `packages/shared/src/knowledge/marketing/content/**`.

---

### Task 1: Refresh the GSC Opportunity Fixture

**Files:**

- Modify: `apps/site/src/high-impression-pages.fixture.ts`
- Test: `apps/site/src/high-impression-lead-magnet-contract.test.ts`
- Test: `apps/site/src/high-ctr-title-contract.test.ts`

- [ ] **Step 1: Write the failing test**

Update `apps/site/src/high-ctr-title-contract.test.ts` so the target list includes the currently highest-leverage pages:

```ts
const TARGETS: Target[] = [
  {
    path: "guides/nonprofit-crm-pricing-guide.md",
    primaryToken: /nonprofit crm pricing/i,
  },
  {
    path: "guides/salesforce-nonprofit-cost.md",
    primaryToken: /salesforce nonprofit cost/i,
  },
  {
    path: "comparisons/salesforce-nonprofit-vs-blackbaud.md",
    primaryToken: /salesforce.*blackbaud|blackbaud.*salesforce/i,
  },
  {
    path: "pricing-breakdowns/bloomerang-pricing.md",
    primaryToken: /bloomerang pricing|bloomerang transaction fees/i,
  },
  {
    path: "guides/federal-procurement-thresholds-micro-small-large.md",
    primaryToken: /federal procurement thresholds|micro-purchase threshold/i,
  },
];
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @grantpipe/site test -- src/high-ctr-title-contract.test.ts
```

Expected: FAIL if any target has missing/loose metadata or if the current regex paths do not match existing frontmatter.

- [ ] **Step 3: Update the fixture**

Replace the stale `2026-05-08` metrics for the five priority entries in `apps/site/src/high-impression-pages.fixture.ts` with the `2026-05-13` GSC values:

```ts
{
  collection: "guides",
  slug: "nonprofit-crm-pricing-guide",
  source: "gsc-search-analytics",
  date: "2026-05-13",
  impressions: 7774,
  clicks: 2,
  ctr: 0.0001,
  position: 8.8,
},
```

Use equivalent entries for `salesforce-nonprofit-cost`, `salesforce-nonprofit-vs-blackbaud`, `bloomerang-pricing`, and `federal-procurement-thresholds-micro-small-large`.

- [ ] **Step 4: Run test to verify it still fails only for content**

Run:

```bash
pnpm --filter @grantpipe/site test -- src/high-ctr-title-contract.test.ts
```

Expected: FAIL only on metadata/content assertions that Task 2 will fix.

- [ ] **Step 5: Commit**

```bash
git add apps/site/src/high-impression-pages.fixture.ts apps/site/src/high-ctr-title-contract.test.ts
git commit -m "test(site): refresh SEO opportunity fixture"
```

### Task 2: Improve CTR on Existing High-Impression Pages

**Files:**

- Modify: `packages/shared/src/knowledge/marketing/content/guides/nonprofit-crm-pricing-guide.md`
- Modify: `packages/shared/src/knowledge/marketing/content/guides/salesforce-nonprofit-cost.md`
- Modify: `packages/shared/src/knowledge/marketing/content/comparisons/salesforce-nonprofit-vs-blackbaud.md`
- Modify: `packages/shared/src/knowledge/marketing/content/pricing-breakdowns/bloomerang-pricing.md`
- Modify: `packages/shared/src/knowledge/marketing/content/guides/federal-procurement-thresholds-micro-small-large.md`
- Test: `apps/site/src/high-ctr-title-contract.test.ts`
- Test: `apps/site/src/content-tests/content-quality-regressions.test.ts`

- [ ] **Step 1: Write the failing metadata expectations**

In `apps/site/src/high-ctr-title-contract.test.ts`, keep the target metadata contract strict:

```ts
expect(seoTitle!.length).toBeLessThanOrEqual(60);
expect(seoDescription!.length).toBeGreaterThanOrEqual(140);
expect(seoDescription!.length).toBeLessThanOrEqual(160);
expect(target.primaryToken.test(seoTitle!) || target.primaryToken.test(seoDescription!)).toBe(true);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @grantpipe/site test -- src/high-ctr-title-contract.test.ts
```

Expected: FAIL until all five pages have tight, query-matched metadata.

- [ ] **Step 3: Rewrite metadata and above-the-fold copy**

For each content file, update:

```yaml
seoTitle: "[primary query phrase with specific buyer/result]"
seoDescription: "[140-160 characters; concrete value; no fabricated proof]"
```

Then adjust the first two body sections so the page answers the exact searcher intent in the first screen and links to the next commercial step. Use GrantPipe's builder-honest constraints: no fabricated testimonials, no nonprofit sector tenure claims, no inflated user counts.

- [ ] **Step 4: Run targeted content tests**

Run:

```bash
pnpm --filter @grantpipe/site test -- src/high-ctr-title-contract.test.ts src/content-tests/content-quality-regressions.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/knowledge/marketing/content apps/site/src/high-ctr-title-contract.test.ts
git commit -m "fix(site): improve CTR metadata for SEO opportunity pages"
```

### Task 3: Expand Compliance Freshness Guards

**Files:**

- Modify: `apps/site/src/technical-seo-content.test.ts`
- Modify as needed: `packages/shared/src/knowledge/marketing/content/**/*.md`

- [ ] **Step 1: Write the failing freshness guard**

Add stale threshold phrase variants found during implementation to `staleFederalSingleAuditPatterns`, for example:

```ts
/spending \$1,000,000 or more in federal awards/i,
/expends \$1,000,000 or more in federal awards/i,
/federal single audit threshold is \$1,000,000/i,
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @grantpipe/site test -- src/technical-seo-content.test.ts
```

Expected: FAIL if any published content still contains stale `$1,000,000` Single Audit threshold claims.

- [ ] **Step 3: Correct stale claims**

For each failure, update the claim to the current contextual framing:

```md
The federal Single Audit threshold is $1,000,000 in federal awards expended for fiscal years ending September 30, 2025 or later. Older fiscal years may still require the previous pre-2024 threshold, so verify the fiscal year-end before relying on a summary.
```

- [ ] **Step 4: Run freshness and content tests**

Run:

```bash
pnpm --filter @grantpipe/site test -- src/technical-seo-content.test.ts src/content-tests/content-quality-regressions.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/site/src/technical-seo-content.test.ts packages/shared/src/knowledge/marketing/content
git commit -m "fix(site): harden compliance freshness guards"
```

### Task 4: Strengthen Internal Links From Opportunity Pages

**Files:**

- Modify: `apps/site/src/internal-link-graph-contract.test.ts`
- Modify: affected markdown content in `packages/shared/src/knowledge/marketing/content/**`

- [ ] **Step 1: Write the failing internal-link contract**

Add explicit checks that priority pages link to commercial next steps:

```ts
expect(graph["/resources/guides/nonprofit-crm-pricing-guide/"]).toContain("/pricing/");
expect(graph["/resources/guides/salesforce-nonprofit-cost/"]).toContain(
  "/compare/alternatives/salesforce-nonprofit/",
);
expect(graph["/compare/versus/salesforce-nonprofit-vs-blackbaud/"]).toContain("/pricing/");
```

Use the existing graph helper style in the file rather than creating a parallel parser.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @grantpipe/site test -- src/internal-link-graph-contract.test.ts
```

Expected: FAIL until the pages expose the required next-step links.

- [ ] **Step 3: Add natural internal links**

Add one link near the first answer block and one near the final summary/FAQ section. Use concrete anchors such as `GrantPipe pricing`, `Salesforce nonprofit alternative`, `grant compliance checklist`, and `restricted fund tracking software`.

- [ ] **Step 4: Run link tests**

Run:

```bash
pnpm --filter @grantpipe/site test -- src/internal-link-graph-contract.test.ts src/content-body-link-contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/site/src/internal-link-graph-contract.test.ts packages/shared/src/knowledge/marketing/content
git commit -m "fix(site): route SEO pages toward commercial next steps"
```

### Task 5: Repair Hub Surfacing Where It Blocks Crawl Paths

**Files:**

- Modify: `apps/site/src/resource-hub-pages-source.test.ts`
- Modify as needed: `apps/site/src/pages/workflows/index.astro`
- Modify as needed: `apps/site/src/pages/integrations/index.astro`
- Modify as needed: `apps/site/src/pages/free/[...page].astro`
- Modify as needed: `apps/site/src/pages/compare/index.astro`

- [ ] **Step 1: Write source-level hub tests**

Add assertions that each targeted hub renders live child entries and does not ship placeholder language:

```ts
expect(source).not.toContain("More content coming soon");
expect(source).toContain("buildResourceHubItems(");
```

For compare/free/workflows/integrations, use the local established helper or content collection already used by the page.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm --filter @grantpipe/site test -- src/resource-hub-pages-source.test.ts
```

Expected: FAIL for any hub that still uses placeholder copy or does not expose real child links.

- [ ] **Step 3: Implement hub surfacing**

Render child cards for each hub using existing components. Keep layout consistent with current public-site patterns; do not add a new UI primitive unless existing hub/card components cannot express the needed layout.

- [ ] **Step 4: Run hub and link tests**

Run:

```bash
pnpm --filter @grantpipe/site test -- src/resource-hub-pages-source.test.ts src/content-body-link-contract.test.ts src/internal-link-graph-contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/site/src/pages apps/site/src/resource-hub-pages-source.test.ts
git commit -m "fix(site): expose live SEO hub content"
```

### Task 6: DFS-Validate the Next Publish Queue

**Files:**

- Create: `docs/seo/keyword-validation-2026-05-13.md`

- [ ] **Step 1: Pull DFS keyword overview**

Use `mcp__dfs_mcp__.dataforseo_labs_google_keyword_overview` for:

```text
nonprofit grant management software
grant management software for nonprofits
grant compliance software
restricted fund accounting software
grant reporting software for nonprofits
```

- [ ] **Step 2: Pull DFS keyword suggestions**

Use `mcp__dfs_mcp__.dataforseo_labs_google_keyword_suggestions` with seed `grant management software`, US/en, sorted by search volume.

- [ ] **Step 3: Save the validation summary**

Create `docs/seo/keyword-validation-2026-05-13.md` with:

```md
# SEO Keyword Validation - 2026-05-13

## Source

- DataForSEO MCP
- Location: United States
- Language: English

## Validated Keywords

| Keyword                             | Volume |  KD | Intent     | Decision               |
| ----------------------------------- | -----: | --: | ---------- | ---------------------- |
| nonprofit grant management software |    320 |  12 | commercial | Optimize existing page |
```

- [ ] **Step 4: Commit**

```bash
git add docs/seo/keyword-validation-2026-05-13.md
git commit -m "docs(seo): validate next keyword queue"
```

### Task 7: Final Verification and Release

**Files:**

- All files changed by prior tasks.

- [ ] **Step 1: Run site tests**

```bash
pnpm --filter @grantpipe/site test
```

Expected: PASS.

- [ ] **Step 2: Run site coverage for touched files**

```bash
pnpm --filter @grantpipe/site test:coverage
```

Expected: PASS; inspect touched source/test files for coverage gaps.

- [ ] **Step 3: Run site build**

```bash
pnpm --filter @grantpipe/site build
```

Expected: PASS.

- [ ] **Step 4: Request review**

Use `superpowers:requesting-code-review` and review all changes in the worktree. Fix every blocker found before merge.

- [ ] **Step 5: Merge and deploy**

After review passes:

```bash
git checkout master
git merge --no-ff feat/seo-optimization-plan
git worktree remove .worktrees/seo-optimization-plan
pnpm run deploy:site
```

Expected: site deploy succeeds through the repo's Wrangler deploy path.

---

## Self-Review

- Spec coverage: The plan uses GSC MCP evidence, DFS MCP evidence, asks the required questions, and provides an implementation plan before code changes.
- Placeholder scan: No placeholder markers, deferred-work language, or unbounded test instructions remain.
- Type consistency: Test names, file paths, and content collection paths match the current repo structure inspected before writing this plan.
