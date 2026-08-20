# Grant Management Positioning Design

## Goal

Reposition GrantPipe's public marketing and machine-readable product language around:

> Compliance-first grant management system.

This is a positioning change, not a product-scope reduction. Donor context, restricted funds, reporting, evidence, fund accounting support, compliance calendars, and audit trails remain part of the product story. The change is that those capabilities support the core category instead of competing with it.

## Strategic Center

GrantPipe should be legible as a grant management system first. The sharper claim is that compliance comes first, especially the post-award work that nonprofit teams must defend to funders, auditors, and internal finance stakeholders.

The core message hierarchy is:

- Category: grant management system
- Main phrase: compliance-first grant management system
- SEO phrase: grant management software built for compliance
- Operational wedge: post-award grant management
- Proof points: awards, deadlines, restricted funds, evidence, reports, donor context, fund accounting support, audit trails
- Boundary: not a generic donor CRM, not a spreadsheet process, not prospecting-only grant software, and not a consultant-led implementation

The public site should stop leading with broad "operating system" language. "System" can still be used in plain English, but "operating system" should not be the category anchor.

## Audience

The primary reader is a nonprofit operator or finance-adjacent leader who owns grant delivery after an award is won. They need a tool that helps them keep records, deadlines, fund restrictions, and reporting evidence together without buying a broad donor CRM or hiring consultants to build a process.

The secondary reader is an evaluator comparing GrantPipe against donor CRMs, spreadsheets, prospecting tools, grant databases, and compliance-heavy enterprise platforms. They should quickly understand that GrantPipe is designed around the recipient side of grant management.

## Copy Principles

Use direct, plain copy:

- Say "compliance-first grant management system" on primary brand surfaces.
- Use "grant management software built for compliance" in SEO titles, descriptions, and comparison contexts where buyers search for software.
- Say "post-award grant management" where it clarifies that GrantPipe is not mainly a prospecting database.
- Explain compliance with concrete work: awards, deadlines, restricted funds, evidence, reports, donor context, and audit trails.
- Avoid unsupported claims about market rank, customer count, nonprofit experience, implementation time, or unique superiority.
- Avoid inflated platform claims when a specific workflow claim is stronger.
- Keep founder voice as builder-led. Do not imply firsthand nonprofit sector experience.

## Source Of Truth

The shared positioning module should become the root source for category, tagline, boilerplate, and machine-readable descriptions. Downstream site config, public KB output, pricing text, LLM metadata, and generated knowledge should consume or match that language.

Expected canonical strings:

```ts
category = "Compliance-first grant management system";
tagline = "Compliance-first grant management system.";
boilerplate =
  "GrantPipe is a compliance-first grant management system. It helps nonprofits manage awards, deadlines, restricted funds, evidence, reports, donor context, and audit trails in one workspace.";
```

The exact implementation can preserve existing exported constant names if renaming them would create unnecessary churn.

## Public Surface Design

### Homepage

The homepage should establish the category immediately. The first screen should make clear that GrantPipe is a compliance-first grant management system, not a general nonprofit operating system.

Desired shape:

- SEO title centered on "Compliance-First Grant Management System"
- Hero heading or subheading using the main phrase
- Supporting paragraph naming post-award work and proof points
- CTAs unchanged in function and visual treatment
- Existing product capabilities reframed as grant compliance workflows

### Product Page

The product page should explain how the system works. It should lead with "compliance-first grant management system" and use "grant management software" only when helpful for search or comparison language.

Required story:

- Awards create obligations.
- Obligations need deadlines, evidence, reports, and restricted fund visibility.
- Donor and fund accounting context are supporting records inside the grant workflow.
- Audit trails and compliance reporting are core outcomes.

### Canonical Category Page

`/grant-management-software` should become the canonical SEO category page for the phrase. It should not sound like a thin keyword page or a minor variant of the old operating-system story.

Required story:

- Who the page is for
- What a compliance-first grant management system means
- Why generic CRMs, spreadsheets, and prospecting tools miss post-award work
- How GrantPipe connects records across awards, funds, evidence, and reporting
- Clear internal links to pricing, product, comparisons, and role/use-case pages

### Comparison And CRM Pages

Comparison pages should keep their search intent but subordinate CRM language to the grant management category.

Examples:

- Donor CRM pages should say donor context matters because grant reports, restricted gifts, and funder records affect compliance work.
- Instrumentl, GrantHub, and related comparisons should distinguish prospecting or tracking from post-award grant management.
- "Best nonprofit CRM with grant management" pages should avoid fragile uniqueness claims and use published pricing or feature facts only.

### Machine-Readable Assets

The following surfaces should match the source of truth:

- Site config
- Public KB
- Pricing text
- LLM and machine-readable product descriptions
- Marketing knowledge files
- Metadata contracts
- Internal link and cannibalization guards

These assets should make GrantPipe easy for search engines, LLMs, and comparison tools to classify as a compliance-first grant management system and as grant management software built for compliance.

## Tests And Quality Gates

The implementation should be test-first. The first implementation task should add or update a focused positioning contract test that fails on the current old positioning.

Test coverage should prove:

- Shared positioning exports the new category, tagline, and boilerplate.
- Homepage, product page, and category page expose the main phrase in expected places.
- SEO metadata retains the software phrase where search intent calls for it.
- Machine-readable assets no longer lead with the old operating-system category.
- CRM and comparison pages keep their intent while pointing back to grant management.
- Content quality guards reject unsupported claims, generic AI phrasing, and stale count or pricing claims.

The implementation should also run the required copy checks:

- Humanizer pass for marketing and explanatory copy
- Third-grade-copy pass for public marketing and UI copy
- Zero-lies review against product source material
- Fit review across page intent, audience, and surrounding copy

## Review And Verification Design

Use sub-agents where the runtime permits them:

- SEO/content review: check search intent, keyword cannibalization, and internal links.
- Product-marketing review: check clarity, hierarchy, and claim boundaries.
- Test/release review: check tests, generated assets, and deploy risk.

The main session should integrate feedback, fix issues, and keep the worktree isolated until the branch is ready.

Verification should include:

- Targeted shared-package positioning tests
- Targeted site contract and content tests
- Knowledge generation/check commands if the touched assets require regeneration
- Site build
- Local preview or browser smoke check for primary public pages if layout or visible copy changes materially
- Final review before merge
- Production deploy through the repo's Wrangler scripts after merge
- Live checks for the affected public routes

## Scope Boundaries

In scope:

- Positioning source of truth
- Public marketing copy needed to make the new category coherent
- SEO titles/descriptions and canonical category content
- Machine-readable metadata and public KB descriptions
- Tests and gates that prevent regression to old positioning

Out of scope:

- Removing product capabilities
- Redesigning navigation or page layout beyond copy-level needs
- Changing pricing or packaging
- Adding unsupported integrations, metrics, testimonials, customer counts, or implementation guarantees
- Reworking authenticated app UX

## Spec Self-Review

- Completion scan: no incomplete planning markers remain.
- Consistency check: every public surface points back to the same category center.
- Scope check: this is one positioning and SEO coherence project, not a product rebuild.
- Ambiguity check: "compliance-first" means concrete post-award records, deadlines, restrictions, evidence, reports, and audit trails.
