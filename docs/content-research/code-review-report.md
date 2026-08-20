# Code Review Report - `feat/state-100-content-net-new`

**Scope reviewed:** 4 TS files diffed vs master (already merged into master via f6f25e7 + 37ac2c1) plus a sample of 5+ content markdown files from the 100-file content commit.

**Branch state:** `git log master..HEAD` is empty - all work is already on master. This review covers the merged commits.

## Verdict: SHIP (with follow-up)

The TypeScript changes are clean, fully-typed, and registry-consistent. Content quality is high - real .gov source URLs, statute citations (e.g., O.C.G.A. Title 43 Ch. 17, MCL 400.273, Conn. Gen. Stat. Â§ 21a-190c), no fabricated testimonials, builder-perspective tone. The only systemic issue is cosmetic (self-references in `relatedPages`) and does not break the build.

## Issue Counts

- BLOCKER: 0
- MAJOR: 1
- MINOR: 2
- NIT: 2

---

## MAJOR

### M1. Self-references in `relatedPages` frontmatter (18 of 100 files)

The `resolveRelatedPageLinks` function at `packages/ui/src/site/lib/related-page-resolver.ts:28-44` does **not** filter the current page's own href. 18 of the new content files include their own slug in `relatedPages`, so the rendered "Related" sidebar will show a link back to the current page.

**Evidence:**

- `apps/site/src/content/guides/kentucky-nonprofit-startup-guide.md` - relatedPages contains `/resources/guides/kentucky-nonprofit-startup-guide`
- `apps/site/src/content/workflows/indiana-charitable-registration-workflow.md` - relatedPages contains `/workflows/indiana-charitable-registration-workflow`
- `apps/site/src/content/lead-magnets/ohio-compliance-checklist.md` - relatedPages contains `/free/ohio-compliance-checklist` (implied via dedup commit)

Found via: `for f in <new-content>; slug=$(basename $f .md); grep -q "/$slug" $f` â†’ 18 hits / 100 files.

**Recommendation:** Either (a) strip self-href entries in the source content files, or (b) add a one-line filter inside `resolveRelatedPageLinks` (`hrefs.filter(h => normalize(h) !== currentHref)`). Option (b) is the durable fix; spawn a follow-up task.

---

## MINOR

### m1. Test coverage on new state checklists is shallow

`apps/api/src/domains/leads/nurture-copy.test.ts:739-794` - the 80 new tests only assert that the state name string appears in subject/html/text and that the sequence has 4 steps. They do not validate:

- The `formName`, `agency`, or `auditTrigger` actually surface in the rendered copy
- HTML escapes properly when state contains punctuation (none in this batch, but pattern is brittle)
- Step ordering matches expected `dedupeKey` shape

This is "smoke testing that strings exist" rather than behavior validation. Since `makeStateChecklistSteps` is the same factory used by the prior 14 states (already covered), risk is low - but the brief flagged this concern explicitly. Consider one parameterized test that asserts each `auditTrigger` substring renders.

### m2. Audit trigger string for several states is loose

In `apps/api/src/domains/leads/nurture-copy.ts`, several `auditTrigger` values are descriptive prose rather than a clean threshold:

- Colorado/Arizona/Missouri/Indiana/Kentucky/Alabama/Oklahoma/Louisiana/Iowa: `"no state audit threshold; $1M federal Single Audit applies"`
- Oregon (line 286-291): `"$1M revenue (audit) / $500K (review) under ORS 65.815"` mixes two thresholds in one string

These render fine, but the inconsistency means the email copy will read awkwardly when the template interpolates this fragment into a sentence. Spot-check the rendered HTML in dev for the Colorado / Oregon variants before sending live nurture.

---

## NIT

### n1. Comment header inconsistency

`packages/shared/src/constants/lead-magnets.ts:80` uses a Box-drawing `â”€â”€` separator. Fine, but the existing file used a different ASCII separator earlier in the same file. Cosmetic.

### n2. Plan reference unverified

The brief cites `~/.claude/plans/pull-the-latest-changes-inherited-summit.md`. Not read during this review (out of repo). If the plan specified specific states or audit-threshold formats, those weren't cross-checked.

---

## Quality Gate Check

| Gate                                                     | Status                                                                                                               |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| No `any` types                                           | PASS                                                                                                                 |
| No TODO/FIXME/HACK                                       | PASS (grep clean on diff)                                                                                            |
| No `eslint-disable`                                      | PASS                                                                                                                 |
| Registry parity (slugs â†” titles â†” NURTURE_SEQUENCES) | PASS - all 20 new slugs present in all three                                                                         |
| Builder POV / no fake testimonials                       | PASS in sampled files                                                                                                |
| Real .gov source URLs                                    | PASS (sos.ga.gov, ag.ky.gov, ohioattorneygeneral.gov, etc.)                                                          |
| Per-file 95% coverage                                    | NOT MEASURED - recommend running `turbo test:coverage --filter=@grantpipe/api --filter=@grantpipe/shared` to confirm |

## Files Reviewed

- `/Users/angel/Desktop/grantpipe/.worktrees/state-100/packages/shared/src/constants/lead-magnets.ts`
- `/Users/angel/Desktop/grantpipe/.worktrees/state-100/packages/shared/src/constants/lead-magnets.test.ts`
- `/Users/angel/Desktop/grantpipe/.worktrees/state-100/apps/api/src/domains/leads/nurture-copy.ts`
- `/Users/angel/Desktop/grantpipe/.worktrees/state-100/apps/api/src/domains/leads/nurture-copy.test.ts`
- `/Users/angel/Desktop/grantpipe/.worktrees/state-100/packages/ui/src/site/lib/related-page-resolver.ts`
- Sampled content: kentucky-nonprofit-startup-guide.md, ohio-compliance-checklist.md, indiana-charitable-registration-workflow.md, georgia-nonprofit-faq.md, virginia-nonprofit-startup-guide.md
