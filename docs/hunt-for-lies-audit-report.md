# Hunt for Lies — Audit Report

**Date:** 2026-05-11
**Branch:** `hunt-for-lies`
**Scope:** Marketing corpus citation verification + founder-rule guardrails

## Summary

The marketing surface was inventoried for verifiable factual claims, with the central `KEY_STATISTICS` registry verified end-to-end against primary sources, and structural guardrails installed to prevent regressions.

| Result                                             | Count  |
| -------------------------------------------------- | ------ |
| Total claims inventoried across corpus             | 14,519 |
| Frontmatter `statistics:` entries inventoried      | 1,168  |
| KEY_STATISTICS entries before                      | 10     |
| KEY_STATISTICS entries after (folklore removed)    | 8      |
| Founder-rule violations after pattern refinement   | 0      |
| Legacy unsourced frontmatter entries grandfathered | 100    |
| New vitest guardrail tests                         | 4      |

## Changes in this branch

### Central registry (`apps/site/src/lib/key-statistics.ts`)

- **Tightened type**: `KeyStatistic.sourceUrl` is now required (no `?`).
- **Verified and normalized 8 entries** with primary-source URLs:
  - Omatic CRM-switching stat → omaticsoftware.com
  - Fifty & Fifty CRM effectiveness stat → virtuous.org (report summary)
  - Salesforce TCO claim — **rephrased** to defensible component breakdown citing salesforce.com pricing
  - CEP reporting hours — verified against cep.org blog post by Kevin Bolduc; tightened wording to ~8 hours/year
  - NFF operating deficit → nff.org 2025 survey
  - GrantStation indirect-cost stat — **rephrased** for accuracy (about respondents' largest funder, not "42% of funders")
  - Omatic 5+ tools stat → omaticsoftware.com
  - GAO single-audit $1.17T → gao.gov GAO-24-106173 (added FY2017-2021 framing and "severe and persistent" qualifier)
- **Deleted 2 unverifiable entries**:
  - "50-55% of CRM implementations fail" sourced to "Gartner/Forrester 2025" — folklore; widely-misquoted 2001 study
  - "60-70% of Salesforce implementations exceed budgets" sourced to "multiple sources" — no Salesforce-specific authoritative source

### New shared modules (`packages/shared/src/knowledge/marketing/`)

- `allowed-citation-hosts.ts` — citation host allowlist (gao.gov, irs.gov, urban.org, nff.org, cep.org, candid.org, omaticsoftware.com, virtuous.org, grantstation.com, etc.). Includes `isAllowedCitationHost(url)` helper.
- `forbidden-patterns.ts` — 4 regex patterns enforcing the CLAUDE.md founder rule:
  - `grantpipe-fabricated-user-count` — blocks GrantPipe-specific "trusted by N nonprofits" claims (does NOT match competitor characterizations)
  - `grantpipe-testimonial-quote` — blocks customer testimonials attributed to nonprofit roles
  - `first-person-sector-experience` — blocks "as my N years in nonprofits" claims
  - `first-person-grant-achievement` — blocks "I've personally written N grants" claims
- `legacy-claims-snapshot.json` — 100 frontmatter `statistics:` entries currently without `sourceUrl`, grandfathered. Must shrink over time.

Re-exported from `@grantpipe/shared/public-kb`.

### New vitest guardrails

| Test file                                                                          | Asserts                                                                                                                                      |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/knowledge/marketing/__tests__/citations.test.ts`              | Every non-legacy frontmatter statistic has an https `sourceUrl`. Legacy snapshot entries still exist (catches stale snapshot).               |
| `packages/shared/src/knowledge/marketing/__tests__/founder-rule.test.ts`           | Corpus body text matches zero forbidden patterns (one test per pattern).                                                                     |
| `packages/shared/src/knowledge/marketing/__tests__/allowed-citation-hosts.test.ts` | Allowlist helper accepts allowlisted hosts/subdomains, rejects unrelated hosts and substring-spoofing.                                       |
| `packages/shared/src/knowledge/marketing/__tests__/forbidden-patterns.test.ts`     | Each forbidden pattern matches its intended target and ignores legitimate competitor descriptions.                                           |
| `apps/site/src/lib/key-statistics.test.ts` (updated)                               | Every KEY_STATISTICS entry has https sourceUrl on the allowlist; folklore citations ("multiple sources", "research synthesis") are rejected. |

### Dev-only tooling (gitignored output)

`scripts/hunt-lies/`:

- `inventory.ts` — walks corpus, emits `audit/claims-manifest.json` (14,519 claims)
- `founder-rule.ts` — emits `audit/founder-rule-hits.json` (currently 0 hits)
- `generate-legacy-snapshot.ts` — emits the snapshot JSON (used by the citations test)
- `manifest-schema.ts` — Zod types

## Follow-up work (not in this branch)

Items deliberately not addressed in this PR. Each is enforceable mechanically in a future pass:

1. **Shrink the legacy snapshot (100 entries).** Each entry needs WebSearch verification and a `sourceUrl` added to the source markdown frontmatter, then removal from `legacy-claims-snapshot.json`. Highest-leverage entries are competitor-acquisition and competitor-size claims in `content/alternatives/*.md`.
2. **Auto-link inline regulatory references (1,918 occurrences).** Tokens like `FASB ASC 958`, `2 CFR 200.302`, `IRS Form 990` appear in body text without inline links. A mechanical pass can map each token to its canonical URL (fasb.org / ecfr.gov / irs.gov) and surface a markdown link.
3. **Verify the 1,068 currently-sourced frontmatter `statistics:` entries.** Each has a `sourceUrl` but the URL was not fetched in this branch; many cite vendor pages (G2/Capterra) where the underlying data may have shifted. A sampled re-verification pass (~10% sample) is recommended quarterly.
4. **Filter `inline-numeric` claims in inventory.** The 11,239 inline numerics are mostly illustrative dashboard mock data ("$46k of $110k"). A future filter should exclude code blocks and YAML metadata so only prose numerics surface.

## Verification

- `pnpm --filter @grantpipe/shared test` — 909/909 passing (39 test files)
- `pnpm --filter @grantpipe/site test` — 662/662 passing (68 test files)
- `pnpm --filter @grantpipe/shared --filter @grantpipe/site typecheck` — clean
- `pnpm --filter @grantpipe/shared --filter @grantpipe/site lint` — clean
- `pnpm --filter @grantpipe/shared test:coverage` — 99.99% statements, 98.93% branches; marketing modules 100% per file

Pre-existing master failures unrelated to this branch:

- `@grantpipe/api#test` — 12 test files fail to load due to `@sentry/cloudflare` module resolution in the vitest environment. All 4,683 API tests that load still pass.
- `@grantpipe/web#lint` — 1 unused-import error in `apps/web/src/routes/_authenticated/grants/index.test.tsx` plus 1 React Hook Form warning.

## How to verify a regression

```bash
# Add a fake stat without sourceUrl
echo '  - stat: "Fabricated"' >> packages/shared/src/knowledge/marketing/content/benchmarks/grant-compliance-benchmarks-2026.md
echo '    source: "Made up"' >> packages/shared/src/knowledge/marketing/content/benchmarks/grant-compliance-benchmarks-2026.md
pnpm --filter @grantpipe/shared test  # → citations.test.ts fails

# Add forbidden first-person experience claim
echo 'After my 15 years as a fundraising director' >> apps/site/src/pages/about.astro
pnpm --filter @grantpipe/shared test  # → founder-rule.test.ts fails
```
