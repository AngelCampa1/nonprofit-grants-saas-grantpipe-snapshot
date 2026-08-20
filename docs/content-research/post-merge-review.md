# Post-Merge Review - commit 0c29253

**Scope:** 100 net-new content markdown files (guides, state-pages, lead-magnets, faq-hubs), 20 new lead-magnet slugs in `packages/shared/src/constants/lead-magnets.ts`, 20 new state nurture entries in `apps/api/src/domains/leads/nurture-copy.ts`, plus DataForSEO research artifacts.

## Verdict: SHIP AS-IS

The previously-flagged MAJOR issue (M1 self-references) is fully resolved on master. Tests, parity, voice, and source URLs all check out.

## Issue counts

- BLOCKER: 0
- MAJOR: 0
- MINOR: 1 (carried from prior review)
- NIT: 1

## Verification of prior reviewer's M1 (self-references)

Prior reviewer reported 18 self-referencing files; the merge fixup commit (37ac2c1) claimed 7 strips. I re-ran the check across all 107 markdown files in commit 0c29253: **0 self-references remain**. Detection script: for each new `.md`, check whether `relatedPages` contains an `href:` whose final path component equals the file's slug. Both numbers (18 and 7) appear to have been counted with different heuristics; what matters is the master state, which is clean.

## Registry parity

All 20 new state-checklist slugs appear in: `LEAD_MAGNET_SLUGS`, `LEAD_MAGNET_TITLES`, `apps/site/src/content/lead-magnets/{slug}.md`, and `NURTURE_SEQUENCES`. PDF builder reads from `LEAD_MAGNET_SLUGS` and validates coverage at build time. (`comm -23` of the four slug sets returns empty.)

## Cannibalization (Houston/NYC spot check)

- `metro-houston.md` targetKeyword `"nonprofits in houston"` vs `texas.md` `"texas"` - distinct intent.
- `metro-new-york-city.md` targetKeyword `"nonprofits in nyc"` vs `new-york.md` `"new york"` - distinct intent.

No cannibalization risk.

## AI-slop sample (6 files)

`kentucky-nonprofit-startup-guide.md`, `metro-houston.md`, `colorado-compliance-checklist.md`, `california-nonprofit-grant-compliance-faq.md`, `oregon-nonprofit-audit-requirements.md`, `new-york-char410-registration-guide.md`: zero hits across the standard AI-tell list ("delve", "tapestry", "in today's", "navigate the complexities", "robust", "seamlessly", etc.).

## .gov source URL integrity (5 files)

Sampled URLs are real and on the correct agency: `sos.maryland.gov/Charity/Documents/COR-92.pdf`, `sos.oregon.gov/business/Pages/default.aspx`, `www.sos.state.tx.us/corp/forms/802_boc.pdf`, `illinoisattorneygeneral.gov/charities/forms.html`, `apps.legislature.ky.gov/law/statutes/`. No fake or wrong-agency redirects in the sample.

## Voice / fabrication

No fabricated user counts, testimonials, or "we serve X nonprofits" copy in the new content. Existing "we served Y" hits are inside templates teaching nonprofits how to write their own copy - unchanged by this commit.

## Nurture-copy interpolation (Colorado, Oregon, Alabama)

Reading the rendered subject + html for the 20 new state entries: `formName`, `agency`, and `auditTrigger` interpolate correctly into both step1 and step2 templates. The factory at `apps/api/src/domains/leads/nurture-copy.ts:103` is the same one that produced the existing 14 state entries (already coverage-tested).

## Tests

`pnpm --filter @grantpipe/api test` â†’ **85 files, 3746/3746 pass** (166s). `pnpm --filter @grantpipe/shared test` not run separately but covered by the same parity check.

---

## MINOR

### m1. Awkward `auditTrigger` strings render as parenthetical sentence fragments (carried from prior review)

`apps/api/src/domains/leads/nurture-copy.ts` - Colorado, Arizona, Missouri, Indiana, Kentucky, Alabama, Oklahoma, Louisiana, Iowa all use `"no state audit threshold; $1M federal Single Audit applies"`. Oregon uses `"$1M revenue (audit) / $500K (review) under ORS 65.815"`. These get interpolated as `(${cfg.auditTrigger})` inside both step1 and step2, producing sentences like:

> "If your audit threshold (no state audit threshold; $1M federal Single Audit applies) triggers next fiscal year..."

Grammatically awkward but not broken. Recommend rewording to fragment-form (e.g., `"the federal $1M Single Audit threshold (no separate state requirement)"`) so the parenthetical reads cleanly. Spawn a follow-up; not ship-blocking.

## NIT

### n1. Test depth on new state entries

`apps/api/src/domains/leads/nurture-copy.test.ts` - new state tests assert state-name string presence and 4-step sequence length. They don't explicitly assert `formName`/`agency`/`auditTrigger` interpolation. Risk is low (same factory as the 14 prior states), but a single parameterized test asserting `formName` substring per state would lock in regression coverage.

---

## Files reviewed

- `/Users/angel/Desktop/grantpipe/docs/content-research/code-review-report.md`
- `/Users/angel/Desktop/grantpipe/packages/shared/src/constants/lead-magnets.ts`
- `/Users/angel/Desktop/grantpipe/apps/api/src/domains/leads/nurture-copy.ts`
- `/Users/angel/Desktop/grantpipe/apps/site/src/content/state-pages/{metro-houston,metro-new-york-city,texas,new-york}.md`
- `/Users/angel/Desktop/grantpipe/apps/site/src/content/guides/{kentucky-nonprofit-startup-guide,oregon-nonprofit-audit-requirements,new-york-char410-registration-guide,texas-form-802-periodic-report-guide,maryland-cor-92-charitable-registration-guide,illinois-cor-pmt-1-charity-bureau-fee-guide}.md`
- `/Users/angel/Desktop/grantpipe/apps/site/src/content/lead-magnets/colorado-compliance-checklist.md`
- `/Users/angel/Desktop/grantpipe/apps/site/src/content/faq-hubs/california-nonprofit-grant-compliance-faq.md`
- `/Users/angel/Desktop/grantpipe/apps/site/scripts/build-lead-magnet-pdfs.ts`
