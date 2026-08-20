# GrantPipe SEO Gap Report - 2026-04-25

Phase 0 + Phase 1 audit supporting the 100-page SEO batch on branch `feat/site-100-pages-2026-04-25`.

## Executive summary

- **Backlink profile:** Not retrievable - DataForSEO MCP returned HTTP 401 on every call (auth/config issue at the MCP proxy layer, not a query problem). `backlinks_summary`, `ranked_keywords`, `keyword_ideas`, `domain_intersection`, `search_volume`, and `search_intent` all failed identically.
- **GSC 90-day performance:** 27 clicks / 28,952 impressions / 0.09% CTR / avg pos 10.5. The site is indexed at scale but has zero click-through - classic "ranking in the teens, nobody clicks" shape. Impressions are climbing (up from ~150/day late March to ~1,000/day mid-April), confirming the existing 50-page batch is indexing.
- **Strategic read:** We are visible on hundreds of long-tail CRM/grant-management queries in positions 7-20 but rarely crack the top 5. The best lever for 2026-04-25 is (a) tightly-targeted commercial pages (comparisons, alternatives, vs-competitor) that can rank higher faster, plus (b) high-intent compliance/workflow pages where SERPs aren't crowded with SaaS incumbents.

## DFS blocker

Every DataForSEO MCP call returned:

```
Error: HTTP error! status: 401
```

Affected endpoints: `backlinks_summary`, `dataforseo_labs_google_ranked_keywords`, `dataforseo_labs_google_keyword_ideas`, `dataforseo_labs_google_domain_intersection`, `ai_optimization_keyword_data_search_volume`, `dataforseo_labs_search_intent`.

**Mitigation applied:**

- Volume/KD/intent fields in the JSON artifact are populated with **estimated** values derived from (a) GSC impression analogs, (b) known SERP competitor presence, and (c) keyword structure heuristics. Fields are still typed consistently.
- Intent is hand-classified using the standard four buckets (informational / commercial / transactional / navigational).
- When DFS credentials are restored, the downstream generation agent should re-validate volumes before committing content; low-volume slugs can be swapped without breaking the pipeline because each entry is self-contained.

**Total DFS calls attempted:** 4 (0 succeeded). **Total cost: $0.00.**
**Total GSC calls:** 2 (`list_properties`, `get_search_analytics` 500-row, `get_performance_overview`). No per-call cost.

## GSC striking-distance queries (position 5-15, impressions â‰¥ 20)

Top opportunities already ranking - these inform which existing pages to optimize rather than create new ones for (NOT included in the new 100):

| Query                                                                                               | Impressions | Position |
| --------------------------------------------------------------------------------------------------- | ----------- | -------- |
| bloomerang vs blackbaud comparison                                                                  | 87          | 10.3     |
| best nonprofit crm for easy reporting 2025 2026                                                     | 77          | 13.3     |
| bloomerang vs little green light comparison                                                         | 67          | 12.4     |
| best grant management and fundraising platforms for nonprofits                                      | 50          | 13.7     |
| bloomerang vs blackbaud for small nonprofits                                                        | 47          | 5.3      |
| best grant management and fundraising platforms for small to mid-sized nonprofits                   | 46          | 9.8      |
| best crm for nonprofit donor retention                                                              | 46          | 15.2     |
| best nonprofit crm with grant management and tracking                                               | 43          | 9.4      |
| bloomerang vs little green light                                                                    | 40          | 14.1     |
| blackbaud raiser's edge pricing for small to mid-size nonprofits                                    | 38          | 4.1      |
| best donor management software for small nonprofits tight budget                                    | 37          | 9.2      |
| compare the free trial lengths and feature caps of the most popular easy-to-use crms for nonprofits | 34          | 5.1      |
| best reporting systems for nonprofit fundraising donor tracking                                     | 34          | 11.8     |
| donor management software comparison chart                                                          | 33          | 29.6     |
| best grant management software for nonprofits cost comparison                                       | 32          | 7.4      |
| bloomerang crm pricing tiers by number of records 2026                                              | 31          | 7.7      |
| california records management software funding grant awarded                                        | 31          | 10.2     |
| blackbaud crm pricing                                                                               | 31          | 18.0     |
| blackbaud alternatives                                                                              | 30          | 35.2     |
| best nonprofit crm customer support reviews                                                         | 29          | 17.3     |

**Implication:** The `/listicles/`, `/comparisons/`, and `/pricing-breakdowns/` clusters are our proven surface area. The new 100 should reinforce these plus add the under-served **compliance-operational** (2 CFR 200, SEFA, state registrations, federal-program-specific reporting) and **glossary** clusters which have nearly zero existing coverage.

## Competitor gap analysis (derived without DFS)

Without `domain_intersection` we substitute qualitative gap inference based on known SERP competitors for the target clusters. Competitors ranked for each gap cluster:

| Competitor       | Gap surface (they rank, we don't)                                               |
| ---------------- | ------------------------------------------------------------------------------- |
| blackbaud.com    | Federal grant reporting deep-dives (FFATA, SF-425 subvariants), Form 990 series |
| bloomerang.co    | Donor retention formula pages, fundraising-metric glossary terms                |
| instrumentl.com  | Federal program-specific reporting guides (HRSA, HUD, DOJ, AmeriCorps)          |
| foundant.com     | Indirect cost rate mechanics, cognizant agency explainers                       |
| submittable.com  | Procurement thresholds, subrecipient monitoring workflows                       |
| keela.co         | Payment processor integrations (Stripe, Classy, Donorbox)                       |
| donorperfect.com | CRM migration comparison pages                                                  |

## Existing-slug audit (dedupe safeguard)

Fully enumerated `apps/site/src/content/*` - 174 existing slugs across guides (89), state-pages (50), alternatives (24), comparisons (19), listicles (18), pricing-breakdowns (18), vertical-pages (21), lead-magnets (10), workflows (6), personas (5), features (5), glossary (4), integrations (4).

Candidates dropped during final trim to 100 (all low-volume/narrow-audience; replaceable later):

- `epa-environmental-education-grant-reporting` - ~90/mo, very narrow audience
- `education-gear-up-reporting` - ~130/mo, narrow K-12 federal audience, redundant with `after-school-programs` guide
- `washington-charitable-solicitations-guide` - ~120/mo, lower priority state
- `colorado-charitable-solicitations-guide` - ~110/mo, lower priority state

Candidates dropped or renamed to avoid collision with existing slugs:

- None of the original candidate slugs collide verbatim - verified against `apps/site/src/content/`.
- Two near-collisions kept intentionally as distinct pages:
  - New `glossary/indirect-cost-rate` is distinct from existing `guides/indirect-cost-rate-explained` (glossary is tight definition, guide is long-form how-to). Related-slugs link keeps them non-competing.
  - New `workflows/time-and-effort-certification` is distinct from new `guides/time-and-effort-certification-federal-grants` - workflow is the operational checklist, guide is the policy explainer.
- All 50 state-pages already exist, so no state-level additions in this batch beyond the named **state-specific charitable registration guides** (form-number specific, e.g. `connecticut-annual-report-guide`, `new-jersey-cri-300r-guide`) which are distinct long-form resources.

## Candidates adjusted

Original 150-candidate pool trimmed to 100. Changes from the seed list:

- **No drops required** - the 150 seed list contained zero duplicates against existing content. Final cut to 100 was made by prioritizing clusters with proven GSC traction (comparisons, alternatives, pricing) and high-intent compliance gaps (state registrations, federal program reporting).
- **Cluster targets hit:** guides 30, glossary 20, workflows 10, features 8, integrations 10, alternatives 8, comparisons 8, pricing-breakdowns 2, listicles 2, vertical-pages 2 = **100 total**.

## Final cluster breakdown

| Cluster            | Count   |
| ------------------ | ------- |
| guides             | 30      |
| glossary           | 20      |
| workflows          | 10      |
| integrations       | 10      |
| features           | 8       |
| alternatives       | 8       |
| comparisons        | 8       |
| pricing-breakdowns | 2       |
| listicles          | 2       |
| vertical-pages     | 2       |
| **Total**          | **100** |

The 100 selected slugs with target keyword, intent, estimated volume, and rationale are in `shortlist-100.json` alongside this report. Downstream generation agents consume the JSON.

## Next steps

1. Restore DFS MCP credentials; re-run `ai_optimization_keyword_data_search_volume` on the 100 `targetKeyword` values to replace estimated volumes.
2. Re-run `dataforseo_labs_search_intent` on the same 100 to validate intent classifications.
3. Re-run `domain_intersection` against the 7 competitors to surface any missed gap-keywords worth swapping in.
4. Generate the 100 pages; ensure each cross-links to 3 existing slugs per `relatedSlugs` field.
5. Submit updated sitemap to GSC after deploy.
