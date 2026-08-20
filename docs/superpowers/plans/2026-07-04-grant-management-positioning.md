# Compliance-First Grant Management Positioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reposition GrantPipe around "compliance-first grant management system" while preserving the supported product scope: awards, deadlines, restricted funds, evidence, reports, donor context, fund accounting support, and audit trails.

**Architecture:** Update positioning source-of-truth tests first, then update shared positioning, machine-readable outputs, public pages, SEO category content, and regression gates. Keep "compliance-first grant management system" as the brand center and use "grant management software built for compliance" only where software-search intent is useful.

**Tech Stack:** TypeScript ESM, Astro, shared marketing knowledge, Vitest content contracts, repo copy gates (`humanizer`, `third-grade-copy`), Wrangler deploy scripts.

---

## Current Worktree State

The worktree may contain scratch implementation edits from an earlier direction. Before executing tasks, inspect the diff and reconcile stale strings such as:

```text
Grant management software built for compliance-heavy nonprofits.
Grant management software for grant-funded nonprofits.
```

The approved source is:

```text
Compliance-first grant management system.
```

Do not merge the scratch copy as-is.

## File Map

- `docs/superpowers/specs/2026-07-04-grant-management-positioning-design.md`: approved design source.
- `packages/shared/src/positioning.ts`: canonical category, boilerplate, module list, plan language.
- `packages/shared/src/positioning.test.ts`: source-of-truth regression tests.
- `packages/shared/src/knowledge/marketing/index.ts`: public KB and machine-readable marketing facts.
- `packages/shared/src/public-kb/public-kb.test.ts`: public KB expectations.
- `apps/site/src/config/site.ts`: site tagline, metadata, product category, footer copy, machine-readable config.
- `apps/site/src/config/site.test.ts`: site config regression tests.
- `apps/site/src/pages/index.astro`: homepage metadata and first-screen copy.
- `apps/site/src/pages/product.astro`: product page metadata, hero, product story, schema-adjacent descriptions.
- `apps/site/src/pages/grant-management-software.astro`: canonical category page override.
- `apps/site/src/config/grant-recipient-seo.ts`: grant-recipient category page source content.
- `apps/site/src/lib/machine-readable.test.ts`: LLM/machine-readable contract tests.
- `apps/site/src/lib/pricing-txt.test.ts`: pricing text contract tests.
- `apps/site/src/marketing-redesign-contract.test.ts`: homepage and marketing surface contracts.
- `apps/site/src/product-page-contract.test.ts`: product page contracts.
- `apps/site/src/site-template-regressions.test.ts`: shared site template text contracts.
- `apps/site/src/content-tests/content-quality-regressions.test.ts`: broad public-copy guardrails.
- Priority content pages found by search under `content/` and `packages/shared/src/knowledge/marketing/`: comparison, CRM, and category pages that still lead with old operating-system language.

## Task 1: Source-Of-Truth Positioning

**Files:**

- Modify: `packages/shared/src/positioning.test.ts`
- Modify: `packages/shared/src/positioning.ts`

- [ ] **Step 1: Write the failing shared positioning test**

Replace the category and boilerplate expectations in `packages/shared/src/positioning.test.ts` with the approved language:

```ts
it("defines the canonical category sentence", () => {
  expect(GRANTPIPE_OS_CATEGORY).toBe("Compliance-first grant management system.");
});

it("publishes reusable boilerplate that mentions the audience and modules", () => {
  expect(GRANTPIPE_OS_BOILERPLATE).toBe(
    "GrantPipe is a compliance-first grant management system. It helps nonprofits manage awards, deadlines, restricted funds, evidence, reports, donor context, and audit trails in one workspace.",
  );
  expect(GRANTPIPE_OS_BOILERPLATE).toContain("nonprofits");
  expect(GRANTPIPE_OS_BOILERPLATE).toContain("awards");
  expect(GRANTPIPE_OS_BOILERPLATE).toContain("deadlines");
  expect(GRANTPIPE_OS_BOILERPLATE).toContain("donor context");
  expect(GRANTPIPE_OS_BOILERPLATE).toContain("evidence");
  expect(GRANTPIPE_OS_BOILERPLATE).toContain("restricted funds");
  expect(GRANTPIPE_OS_BOILERPLATE).toContain("audit trails");
});
```

Also add these banned phrases to the existing `bannedPhrases` array:

```ts
new RegExp(["compliance-heavy", "nonprofits"].join(" "), "i"),
new RegExp(["grant-funded", "nonprofits"].join(" "), "i"),
```

- [ ] **Step 2: Run the test and confirm red**

Run:

```powershell
pnpm --filter @grantpipe/shared exec vitest run src/positioning.test.ts
```

Expected: FAIL because `GRANTPIPE_OS_CATEGORY` and `GRANTPIPE_OS_BOILERPLATE` still use the scratch/old wording.

- [ ] **Step 3: Implement the minimal source update**

Update `packages/shared/src/positioning.ts`:

```ts
export const GRANTPIPE_OS_CATEGORY = "Compliance-first grant management system.";

export const GRANTPIPE_OS_BOILERPLATE =
  "GrantPipe is a compliance-first grant management system. It helps nonprofits manage awards, deadlines, restricted funds, evidence, reports, donor context, and audit trails in one workspace.";
```

Keep `GRANTPIPE_OS_MODULES`, `GRANTPIPE_OS_PLAN_LANGUAGE`, and `getGrantPipeOsModuleList()` unless a test proves they need changing.

- [ ] **Step 4: Run the test and confirm green**

Run:

```powershell
pnpm --filter @grantpipe/shared exec vitest run src/positioning.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit source-of-truth positioning**

Run:

```powershell
git add packages/shared/src/positioning.ts packages/shared/src/positioning.test.ts
git commit -m "feat(shared): define compliance-first grant positioning"
```

## Task 2: Machine-Readable And Site Config Contracts

**Files:**

- Modify: `packages/shared/src/knowledge/marketing/index.ts`
- Modify: `packages/shared/src/public-kb/public-kb.test.ts`
- Modify: `apps/site/src/config/site.ts`
- Modify: `apps/site/src/config/site.test.ts`
- Modify: `apps/site/src/lib/machine-readable.test.ts`
- Modify: `apps/site/src/lib/pricing-txt.test.ts`

- [ ] **Step 1: Write failing machine-readable expectations**

Update tests so they expect the approved brand center and reject stale source text. Add assertions like these to the relevant existing test blocks:

```ts
expect(serializedOutput).toContain("Compliance-first grant management system");
expect(serializedOutput).toContain("grant management software built for compliance");
expect(serializedOutput).not.toMatch(/compliance-heavy nonprofits/i);
expect(serializedOutput).not.toMatch(/Compliance-first operating system/i);
```

Use the real variable already present in each test file instead of creating a duplicate fixture. In `public-kb.test.ts`, assert against the generated public KB text. In `site.test.ts`, assert against `siteConfig.tagline`, `siteConfig.metaDescription`, and `siteConfig.product.category`.

- [ ] **Step 2: Run targeted tests and confirm red**

Run:

```powershell
pnpm --filter @grantpipe/shared exec vitest run src/public-kb/public-kb.test.ts
pnpm --filter @grantpipe/site exec vitest run src/config/site.test.ts src/lib/machine-readable.test.ts src/lib/pricing-txt.test.ts
```

Expected: FAIL on stale category/tagline/machine-readable copy.

- [ ] **Step 3: Update shared marketing knowledge**

In `packages/shared/src/knowledge/marketing/index.ts`, set the product summary/tagline fields that currently describe the category to:

```ts
"Compliance-first grant management system.";
```

Where an SEO-oriented sentence is needed, use:

```ts
"GrantPipe is grant management software built for compliance.";
```

Do not add claims about rankings, customer count, implementation speed, or nonprofit operator experience.

- [ ] **Step 4: Update site config**

In `apps/site/src/config/site.ts`, align the relevant fields to this pattern:

```ts
tagline: "Compliance-first grant management system.",
metaDescription:
  "GrantPipe is a compliance-first grant management system for nonprofits. Manage awards, deadlines, restricted funds, evidence, reports, donor context, and audit trails in one workspace.",
product: {
  category: "Compliance-first grant management system",
}
```

Preserve existing object structure and any unrelated config fields.

- [ ] **Step 5: Run targeted tests and confirm green**

Run:

```powershell
pnpm --filter @grantpipe/shared exec vitest run src/public-kb/public-kb.test.ts
pnpm --filter @grantpipe/site exec vitest run src/config/site.test.ts src/lib/machine-readable.test.ts src/lib/pricing-txt.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit machine-readable alignment**

Run:

```powershell
git add packages/shared/src/knowledge/marketing/index.ts packages/shared/src/public-kb/public-kb.test.ts apps/site/src/config/site.ts apps/site/src/config/site.test.ts apps/site/src/lib/machine-readable.test.ts apps/site/src/lib/pricing-txt.test.ts
git commit -m "feat(site): align machine-readable grant positioning"
```

## Task 3: Homepage And Product Page Copy

**Files:**

- Modify: `apps/site/src/content-tests/content-quality-regressions.test.ts`
- Modify: `apps/site/src/marketing-redesign-contract.test.ts`
- Modify: `apps/site/src/product-page-contract.test.ts`
- Modify: `apps/site/src/site-template-regressions.test.ts`
- Modify: `apps/site/src/pages/index.astro`
- Modify: `apps/site/src/pages/product.astro`

- [ ] **Step 1: Add failing public-page contracts**

Add or update assertions so homepage and product page tests require the approved phrase:

```ts
expect(pageText).toMatch(/compliance-first grant management system/i);
expect(pageText).toMatch(/awards/i);
expect(pageText).toMatch(/restricted funds/i);
expect(pageText).toMatch(/evidence/i);
expect(pageText).toMatch(/audit trails|activity history/i);
expect(pageText).not.toMatch(/compliance-heavy nonprofits/i);
expect(pageText).not.toMatch(/Compliance-first operating system/i);
```

Use the existing parsed HTML/page-text helper in each test file.

- [ ] **Step 2: Run page contracts and confirm red**

Run:

```powershell
pnpm --filter @grantpipe/site exec vitest run src/content-tests/content-quality-regressions.test.ts src/marketing-redesign-contract.test.ts src/product-page-contract.test.ts src/site-template-regressions.test.ts
```

Expected: FAIL because scratch page copy still leads with old or weaker positioning.

- [ ] **Step 3: Update homepage metadata and hero**

In `apps/site/src/pages/index.astro`, use this copy shape:

```ts
const pageDescription =
  "GrantPipe is a compliance-first grant management system for nonprofits. " +
  "It connects awards, deadlines, restricted funds, donor context, evidence, " +
  "reports, and audit trails in one workspace.";
```

Update `<BaseLayout title>`:

```astro
title="Compliance-First Grant Management System | GrantPipe"
```

Update first-screen visible copy:

```astro
<p class="gp-eyebrow-pill gp-hero-stagger__item" style="--stagger-index: 0;">
  Compliance-first grant management system
</p>
<h1 class="gp-hero-stagger__title">
  Keep awards, restrictions, deadlines, and evidence ready for review.
</h1>
<p class="gp-hero-lede gp-hero-stagger__item" style="--stagger-index: 1;">
  GrantPipe helps nonprofits manage post-award grant work in one workspace:
  awards, restricted funds, donor context, deadlines, evidence, reports, and
  audit trails.
</p>
```

Keep CTA labels and pill button classes unchanged unless tests show they already require an update.

- [ ] **Step 4: Update product page metadata and hero**

In `apps/site/src/pages/product.astro`, update the description:

```astro
description="See how GrantPipe's compliance-first grant management system connects awards, restricted funds, deadlines, donor context, evidence, reports, and audit trails in one workspace."
```

Update first-screen visible copy:

```astro
<p class="gp-eyebrow-pill">How GrantPipe works</p>
<h1 class="gp-page-title mt-4">
  Compliance-first grant management system for post-award work.
</h1>
<p class="gp-page-intro mt-5">
  GrantPipe connects the records nonprofits need after an award is won:
  deadlines, restricted funds, evidence, reports, donor context, fund
  accounting support, and audit trails.
</p>
```

Keep the eight-module structure and schema feature list intact.

- [ ] **Step 5: Run copy gates locally**

Review changed public copy with `humanizer` and `third-grade-copy`. Apply only changes that preserve accuracy and the approved positioning. Record any no-change decision in the final implementation notes.

- [ ] **Step 6: Run page contracts and confirm green**

Run:

```powershell
pnpm --filter @grantpipe/site exec vitest run src/content-tests/content-quality-regressions.test.ts src/marketing-redesign-contract.test.ts src/product-page-contract.test.ts src/site-template-regressions.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit homepage and product copy**

Run:

```powershell
git add apps/site/src/content-tests/content-quality-regressions.test.ts apps/site/src/marketing-redesign-contract.test.ts apps/site/src/product-page-contract.test.ts apps/site/src/site-template-regressions.test.ts apps/site/src/pages/index.astro apps/site/src/pages/product.astro
git commit -m "feat(site): lead with compliance-first grant system"
```

## Task 4: Canonical Category And SEO Content

**Files:**

- Modify: `apps/site/src/pages/grant-management-software.astro`
- Modify: `apps/site/src/config/grant-recipient-seo.ts`
- Modify: priority comparison/content files found by the search commands below.
- Modify tests as needed under `apps/site/src/content-tests/`.

- [ ] **Step 1: Search for stale positioning**

Run:

```powershell
rg -n "operating system|compliance-heavy|grant-funded nonprofits|grant management software built for compliance|grant management system" apps packages content docs -g "!docs/superpowers/specs/2026-07-04-grant-management-positioning-design.md" -g "!docs/superpowers/plans/2026-07-04-grant-management-positioning.md"
```

Expected: list of public and machine-readable surfaces to triage. Do not change internal docs unless they feed public copy or agent instructions.

- [ ] **Step 2: Add or update SEO/content guards**

Where the existing content tests parse category/comparison pages, add expectations:

```ts
expect(pageText).toMatch(/compliance-first grant management system/i);
expect(pageText).toMatch(/grant management software built for compliance/i);
expect(pageText).not.toMatch(/compliance-heavy nonprofits/i);
```

For comparison pages, also require fair category boundaries:

```ts
expect(pageText).toMatch(/post-award/i);
expect(pageText).toMatch(/prospecting|CRM|spreadsheet/i);
```

- [ ] **Step 3: Run SEO/content tests and confirm red**

Run:

```powershell
pnpm --filter @grantpipe/site exec vitest run src/content-tests/content-quality-regressions.test.ts src/content-tests/cannibalization-guard.test.ts src/metadata-contract.test.ts src/technical-seo-content.test.ts src/internal-link-graph-contract.test.ts src/content-body-link-contract.test.ts
```

Expected: FAIL on stale copy or missing approved phrase.

- [ ] **Step 4: Update `/grant-management-software`**

In `apps/site/src/pages/grant-management-software.astro`, set the override to:

```ts
const page = {
  ...basePage,
  heroDescription:
    "GrantPipe is a compliance-first grant management system and grant management software built for compliance. Use this page to evaluate post-award fit across awards, restricted funds, evidence, reports, donor context, and audit trails.",
};
```

- [ ] **Step 5: Update category source content**

In `apps/site/src/config/grant-recipient-seo.ts`, update the `"grant-management-software"` entry so the title, description, hero, and internal links support both phrases:

```ts
title: "Grant Management Software Built for Compliance",
description:
  "Compare grant management software for post-award compliance work: awards, deadlines, restricted funds, evidence, reports, donor context, and audit trails.",
```

Keep existing supported feature references and citations. Do not add unsupported competitor claims.

- [ ] **Step 6: Update priority comparison and CRM pages**

For pages found in Step 1 that currently position GrantPipe mainly as CRM or a broad operating system, rewrite the first-screen or summary sentence to this pattern:

```text
GrantPipe is a compliance-first grant management system. Donor CRM, restricted funds, reporting, and evidence live inside the grant workflow instead of becoming parallel trackers.
```

For software-search pages, use this pattern:

```text
GrantPipe is grant management software built for compliance: awards, deadlines, restricted funds, evidence, reports, donor context, and audit trails in one workspace.
```

- [ ] **Step 7: Regenerate knowledge if required**

If any generated knowledge or public KB output changes, run:

```powershell
pnpm run knowledge:generate
pnpm run knowledge:check
```

Expected: both commands complete without generated drift.

- [ ] **Step 8: Run SEO/content tests and confirm green**

Run:

```powershell
pnpm --filter @grantpipe/site exec vitest run src/content-tests/content-quality-regressions.test.ts src/content-tests/cannibalization-guard.test.ts src/metadata-contract.test.ts src/technical-seo-content.test.ts src/internal-link-graph-contract.test.ts src/content-body-link-contract.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit category and SEO content**

Run:

```powershell
git add apps/site/src/pages/grant-management-software.astro apps/site/src/config/grant-recipient-seo.ts apps/site/src/content-tests content packages/shared/src/knowledge
git commit -m "feat(site): sharpen grant management SEO positioning"
```

## Task 5: Review, Full Verification, Merge, Deploy

**Files:**

- All changed files.

- [ ] **Step 1: Run a delegated product-marketing review**

Use the active sub-agent path. Ask the reviewer to check:

```text
Review the branch against docs/superpowers/specs/2026-07-04-grant-management-positioning-design.md.
Focus on positioning clarity, unsupported claims, stale operating-system language, and whether CRM/fund/accounting features support the grant management story instead of replacing it.
```

Expected: reviewer returns findings or explicitly says no findings.

- [ ] **Step 2: Fix every product-marketing review finding**

Apply fixes with tests where the finding is enforceable. Re-run the relevant targeted tests from Tasks 1-4.

- [ ] **Step 3: Run a delegated SEO/test review**

Use the active sub-agent path. Ask the reviewer to check:

```text
Review tests and SEO contracts for the compliance-first grant management positioning branch.
Focus on missing regression coverage, keyword cannibalization, internal links, generated knowledge drift, and stale machine-readable metadata.
```

Expected: reviewer returns findings or explicitly says no findings.

- [ ] **Step 4: Fix every SEO/test review finding**

Apply fixes with tests. Re-run the relevant targeted test commands.

- [ ] **Step 5: Run final local gates**

Run:

```powershell
pnpm --filter @grantpipe/shared exec vitest run src/positioning.test.ts src/public-kb/public-kb.test.ts
pnpm --filter @grantpipe/site exec vitest run src/config/site.test.ts src/lib/machine-readable.test.ts src/lib/pricing-txt.test.ts src/marketing-redesign-contract.test.ts src/product-page-contract.test.ts src/site-template-regressions.test.ts src/content-tests/content-quality-regressions.test.ts src/content-tests/cannibalization-guard.test.ts src/metadata-contract.test.ts src/technical-seo-content.test.ts src/internal-link-graph-contract.test.ts src/content-body-link-contract.test.ts
pnpm run knowledge:check
pnpm --filter @grantpipe/site build
```

Expected: all commands PASS.

- [ ] **Step 6: Commit final fixes if needed**

Run:

```powershell
git status --short
git add <only-files-changed-by-final-fixes>
git commit -m "fix(site): close grant positioning review findings"
```

Skip this commit only if `git status --short` shows no uncommitted implementation changes.

- [ ] **Step 7: Merge to master**

From the main checkout:

```powershell
git checkout master
git pull --ff-only
git merge --no-ff feat/grant-management-positioning
```

Expected: merge succeeds without conflicts. If conflicts occur, resolve them without reverting user or unrelated changes.

- [ ] **Step 8: Deploy affected public site**

Run:

```powershell
pnpm run deploy:site
```

Expected: Wrangler deploy completes for the public site path.

- [ ] **Step 9: Live production checks**

Run:

```powershell
curl.exe -L https://grantpipe.com/ | Select-String -Pattern "Compliance-first grant management system"
curl.exe -L https://grantpipe.com/product/ | Select-String -Pattern "Compliance-first grant management system"
curl.exe -L https://grantpipe.com/grant-management-software/ | Select-String -Pattern "grant management software built for compliance"
curl.exe -L https://grantpipe.com/llms.txt | Select-String -Pattern "Compliance-first grant management system"
```

Expected: each command returns at least one matching line.

- [ ] **Step 10: Remove worktree**

After deploy and live checks pass:

```powershell
git worktree remove .worktrees/grant-management-positioning
```

Expected: worktree removed. If dirty files remain, inspect them and either commit intended work or deliberately discard only agent-created scratch after confirming it is not needed.

## Plan Self-Review

- Spec coverage: tasks cover source of truth, machine-readable assets, homepage, product page, category page, SEO content, copy gates, reviews, merge, deploy, and live proof.
- Marker scan: no incomplete planning markers are intentionally left for implementers.
- Type consistency: all snippets use existing exported names and file paths from the current repo.
- Scope check: this is a positioning and SEO coherence plan, not a product rebuild or feature cut.
