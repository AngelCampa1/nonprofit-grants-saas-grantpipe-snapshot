# Goal: portfolio-public

> Make this snapshot readable by a skeptical senior engineer in ninety seconds.
> Split the retrospective, evidence-backed write-ups from the working residue of the
> build, put the write-ups where GitHub's file listing shows them without scrolling,
> and verify every number the README asserts against the tree it describes.

## Method

Each cycle takes one surface (the docs tree, the README, the images, the numeric
claims) and asks a single question: would a reviewer who checks this find what
was promised? Claims are re-derived from the repository rather than trusted. A
finding is only closed when the check that produced it passes on a clean run.

The split rule for every document:

- **`portfolio/`**: retrospective, reader-addressed, finite, and every claim
  traceable to a file you can open.
- **`docs/`**: prospective, self-addressed, dated, open-ended. Plans, audit runs,
  checklists, campaign material. These stay where they are and stay unpolished.

## Cycle log

### Cycle 1 (2026-08-13): Docs tree split

Fourteen markdown files sat at the root of `docs/` alongside sixteen directories,
with no distinction between a write-up meant for a reader and a working note meant
for the author. Five documents met the portfolio rule and moved to a new root-level
`portfolio/`, with `git mv` so history follows:

| From                                            | To                             |
| ----------------------------------------------- | ------------------------------ |
| `docs/engineering.md`                           | `portfolio/ENGINEERING.md`     |
| `docs/architecture/system-design.md`            | `portfolio/ARCHITECTURE.md`    |
| `docs/testing.md`                               | `portfolio/TESTING.md`         |
| `security_best_practices_report.md` (repo root) | `portfolio/SECURITY.md`        |
| `docs/project-history.md`                       | `portfolio/PROJECT-HISTORY.md` |

`docs/production-readiness.md` was considered and deliberately left behind: it is a
dated checklist carrying 65 `[TODO]` items against 5 `[DONE]`, which is the
definition of working residue rather than a retrospective.

Every inbound link was repointed and then verified by resolving each relative
markdown target against the filesystem. Zero unresolved links across `README.md`,
`portfolio/*.md`, `docs/architecture/README.md`, and `docs/screenshots/README.md`.

### Cycle 2 (2026-08-13): Claim verification

Re-derived the load-bearing numbers from the tree rather than trusting the prose,
and re-ran the repository-wide sweep that the flagship regression test performs.

### Cycle 3 (2026-08-13): Images and README surfacing

Read the screenshot candidates as a viewer rather than judging them by filename,
chose the hero on that basis, and rejected the embeds that showed something other
than what their caption promised. Surfaced `portfolio/` three ways: an entry in the
repository map, a `## Documentation` table, and inline callouts where a section has
a deeper write-up.

### Cycle 4 (2026-08-13): Ledger self-audit

Checked this ledger against the tree the way it asks every other claim to be
checked. One of its own entries did not survive: retraction R2 asserted that a
sweep for Windows user-profile absolute paths came back clean. It did not: 22
matches across 10 tracked files. The assertion was false when it was written.

The correction is recorded in place rather than edited away. R2 now states what
the sweep actually returns and that the earlier wording was wrong.

Fixing the underlying 22 split into three kinds:

- **Markdown**: paths rewritten repo-relative where the file being pointed at
  is in this repo, and replaced with a named placeholder where it is not (an
  agent skill directory, a scheduled-task working directory, a local plan file).
  Each sentence was checked to make sure it stayed true after the edit.
- **Two test files**: `scripts/deploy-changed.test.ts` and
  `scripts/lib/dev-server-guards.test.ts` used the path as fixture data. Both
  exercise pure string functions that never touch the filesystem, so the values
  only need the shape of an absolute Windows path, not a real one. Swapped for
  neutral fixture paths; the assertions and what they assert are unchanged.
- **One archive note**: a diagnosis that identified a stray global npm install
  by its full path. Reworded to name the install location descriptively, which
  is what the sentence was actually about.

### Cycle 5 (2026-08-14): Repository-root path residue in `docs/superpowers/` and `docs/offers/_research/`

Cycle 4 closed the Windows user-profile (`C:\Users\...`) sweep but did not check for
the separate local repository-root path baked into the same class of working notes.
Re-swept `docs/superpowers/plans/`, `docs/superpowers/goals/`, `docs/superpowers/notes/`,
and `docs/offers/_research/` for the author's local repo-root path, found it in
nineteen tracked documents (seventeen from the initial pattern, three more from a
git-bash-style path variant of the same thing), and rewrote each occurrence
repo-relative or to a neutral `<repo-root>` / `dev` placeholder, matching Cycle 4's
precedent. Only the path tokens changed: no prose, dates, or surrounding content.

One test file, `apps/api/src/scripts/verify-dashboard-prod-readonly.test.ts`, used the
same path as a mocked pass-through value (set on the input side, then asserted via
`toHaveBeenCalledWith` on the output side) rather than testing anything about the path
itself. Swapped for a neutral fixture path; the assertion and what it proves are
unchanged. Re-ran the file's own suite after the edit: 8/8 pass.

### Cycle 6 (2026-08-14): Broken-link sweep across `packages/shared/src/knowledge/marketing/content/`

Ran the markdown link checker across the tree. It separates true `MISSING` targets
from root-relative site routes and encoded/placeholder false positives, because a
naive checker had previously reported an inflated number. It found 127 `MISSING`
links, all reducing to the same root cause: a pseudo-URI scheme (`grantpipe:signup`)
used as a call-to-action target inside the marketing knowledge-base markdown. It is
not a file path and never resolved to one.

The repo already has a real route for this destination (`apps/site/src/pages/signup.astro`)
and a repo-wide test (`apps/site/src/feature-landing-pages-contract.test.ts`) that
fails a build if that same pseudo-scheme appears in the Astro feature pages it
covers. That guard was never extended to the markdown knowledge base, so the
pattern accumulated there instead. Every other internal CTA in the same content
tree already links with a root-relative path (`/pricing`, `/for/grants-managers`,
`/free/...`), confirming what the correct form is.

Fixed at the root cause in one pass: replaced the link target in all 127 occurrences
across 126 files with the site's real route. No prose changed, no files were
retargeted individually, and no stub was created. Re-ran the checker after: 0
`MISSING`, 0 `ROOT-REL-IN-DOC`.

### Cycle 7 (2026-08-18): Portfolio-standard compliance pass

Brought this repository up to the shared portfolio spec (`PORTFOLIO-STANDARD.md`), which none of
the prior cycles had checked this repo against directly.

**`portfolio/` completeness.** `METRICS.md` was missing entirely: added, with every row citing the
command that produces it, mirroring the "Verified claims" table below rather than duplicating it.
`portfolio/README.md`, the required index, did not exist: added, listing all six other files with
one-line summaries and the `portfolio/` vs `docs/` split stated explicitly. `ENGINEERING.md` was
renamed to `ENGINEERING-LOG.md` per the spec's name-resolution table, and every inbound link
(`README.md`, `ARCHITECTURE.md`, `TESTING.md`, `portfolio/README.md`) was repointed and verified
to resolve. `PROJECT-HISTORY.md` was 76 lines, under the spec's 120-line floor. Rather than pad it,
it was deepened with three more real sections pulled from the private repository's own `git log`:
the ten most-touched files across the development window (led by the 314-edit frontend
adversarial-sweep ledger, still in this tree at `docs/superpowers/goals/frontend-system-sweep-LEDGER.md`),
a by-identity commit breakdown showing all three git identities in the history resolve to Angel
Campa's own accounts, and the single busiest day. It now runs 130 lines. The identity breakdown
also supplied real, checkable content for a `## Built with AI agents` section the README did not
previously have: an explicit `AI Alex` git identity accounts for 166 of the 4,264 development-window
commits, used specifically when an agent session committed unattended.

**README restructure.** The README was 291 lines with no `## Contents` despite clearing the
250-line threshold that requires one, no `## License` heading (the terms were folded into a
trailing paragraph), and several required headings missing outright: `## Testing`, `## Screenshots`,
`## Repository map`, `## Built with AI agents`, `## Known gaps`. `## What it does` was retitled
`## What it did` to agree with the "shut down" status alert, per the spec's tense-honesty check. The
hand-bolded status and byline paragraphs became `> [!IMPORTANT]` and `> [!NOTE]` alerts. The
`## Documentation` section printed the full file-by-file table a second time (the first copy is now
only in `portfolio/README.md`); it is now two sentences and two links, matching the spec's
one-copy-only rule. Five untagged code fences across the README and `portfolio/*.md` were tagged
(directory trees as `text`, one inline throw statement as `ts`).

**Mermaid.** This repo had exactly one diagram, in `portfolio/ARCHITECTURE.md`, and none in the
README, despite grants and document extractions both being real state machines. Two were added,
both sourced from schema and service code rather than invented: a nine-state grant lifecycle
(`packages/db/src/schema/grants.ts`, the `status` column's declared value set) in the README's
"Grants and restricted funds" section, with an explicit note that the API does not enforce it as a
strict transition graph today, a gap also listed under the new `## Known gaps`; and the
document-extraction pipeline's status states (`pending` through `committed`, with `failed` and
`canceled` branches, read out of `apps/api/src/domains/document-extractions/service.ts`) in
`portfolio/ENGINEERING-LOG.md` section 8.

**Images.** The eight screenshots the README actually embeds
(`dashboard`, `donors`, `donors-at-risk`, `grants`, `funds`, `budget-sentinel`, `journal`,
`trial-balance`) were copied into the new `portfolio/screenshots/`, and every README image
reference was repointed there. `docs/screenshots/` was left untouched at its full 40 files plus its
own `README.md` gallery index: Cycle 3's finding 2 already established that the gallery is
deliberately a complete catalogue, including the one embed the README itself does not use, so
duplicating the curated subset rather than moving it out of `docs/` was the choice that kept both
claims true. The eight marketing-asset PNGs under `docs/getting-badges/assets/generated/` and the
five pasted screenshots under the marketing-redesign uploads folder (below) are neither referenced
by the README nor curated proof of the shipped product, so they stayed in `docs/` as working
material.

**`docs/` naming and pruning.** `docs/Marketing redesign/` (capital M, embedded space) is now
`docs/marketing-redesign/`, matching every other `docs/` directory's lowercase-hyphenated
convention; nothing inside it changed, since its HTML prototypes and `design_handoff_grantpipe_marketing/README.md`
are genuine design-handoff documentation. `docs/ux impromenets grantpipe/` (a typo for
"improvements") is now `docs/ux-improvements-grantpipe/`. Its raw prototype dump, 20 `.jsx`
component files plus the two standalone HTML shells (`GrantPipe.html`, `Wireframes.html`) that
existed only to load them via in-browser Babel, plus a duplicate copy of two brand SVGs the
prototype referenced, was removed; none of it was documentation, and the two HTML shells cannot
run without the `.jsx` files they `<script src>` in. The one real write-up in that directory,
`design_handoff_grantpipe_ui/README.md` (657 lines documenting the design-token system that
shipped into `packages/ui`), was kept, with a `[!NOTE]` added at its top disclosing that the file
bundle it describes was removed and why, so the document does not silently claim files are present
that are not.

`docs/youtube/` carried three kinds of build-output frame dumps, all raw captures with scripts or
planning docs sitting alongside them that were kept: `docs/youtube/_capture/p1/` through `p4/` held
30 raw screenshot PNGs that `_capture/capture-p1.mjs` through `capture-p4.mjs` produce as
intermediate output before a human promotes the good ones into each video's own
`production/assets/screens/` (which were left alone: those are real build inputs consumed by
`build-compositions.mjs`, not QA residue); `video-p1-getting-started/output/_frames/` (4.5 MB) and
`output/_vfy/` (1.8 MB) were per-frame verification captures from a render QA pass; and
`video-p4-track-grant-spending/review/frames/` (166 JPGs), `review/probe/` (9 JPGs), and
`review/sheets/` (7 contact-sheet JPGs) were the same kind of render-review artifact for that video.
All of it was deleted; none of it is referenced by any tracked markdown. What stayed: every capture
and build script (`_capture/*.mjs`, `_capture/RECIPE.md`, `_capture/p2-regions.json`,
`_capture/fixtures/`), the `_lib/voiceover-gemini.mjs` TTS script, the `_publish/` upload scripts
and post copy, `video-p4.../review/REVIEW-BRIEF.md` and `review/build_sheets.py`, and
`video-p1.../output/captions.srt` and `output/concat.txt`. `docs/youtube/` dropped from 30 MB to
11 MB. Nothing under `production/`, `audio/`, or `assets/` in any video folder was touched.

### Cycle 8 (2026-08-18): Reviewer findings fix pass

A second-reviewer pass on Cycle 7's output, checked directly against source rather than trusted.

**Document-extraction diagram (P0).** `portfolio/ENGINEERING-LOG.md` section 8's mermaid diagram
showed `ready_for_review --> edited --> ready_for_review` and `ready_for_review --> accepted -->
committing`, as if `edited` and `accepted` were `documentExtractions.status` values. They are not.
Verified against `DOCUMENT_EXTRACTION_STATUSES` in
`packages/shared/src/validators/document-extractions.ts:9-18` (the canonical enum: `pending`,
`processing`, `provider_result_pending`, `ready_for_review`, `committing`, `committed`, `failed`,
`canceled`) and against every `documentExtractions.status` read/write in
`apps/api/src/domains/document-extractions/service.ts`. `commitDocumentExtraction`
(`service.ts:1070-1078`) moves `ready_for_review` straight to `committing`; there is no `accepted`
extraction state. `accepted`/`edited`/`rejected`/`deferred`/`mapped_existing` are written only to
`documentExtractionFields.status`, a separate per-field column
(`recordDocumentExtractionAction`, `service.ts:551-634`), and nothing gates a field's prior status
before that function overwrites it: a field can be accepted, then edited, then accepted again, any
number of times, with no enforced order, while the extraction itself stays in `ready_for_review`
throughout. The diagram also omitted a real edge: `cancelDocumentExtraction` (`service.ts:649-670`)
permits cancelling from `provider_result_pending`, not just from `pending`, `processing`, and
`ready_for_review`. Redrawn using only real `documentExtractions.status` values plus the missing
cancel edge, with the field-level review states demoted to prose describing them as a separate,
unordered column on a different table rather than a nested state machine (a fully-connected graph
of five mutually reachable states isn't a meaningful diagram). The README's grant-lifecycle diagram
was checked separately and confirmed still accurate; not touched.

**Index line counts (P1).** Recomputed every row in `portfolio/README.md`'s file table with
`wc -l`. Only `ENGINEERING-LOG.md` had drifted (318 to 339, from the diagram fix above plus its new
surrounding prose); corrected. `ARCHITECTURE.md` (170), `METRICS.md` (89), `SECURITY.md` (335), and
`TESTING.md` (170) all still matched.

**Dangling video-review artifacts (P1).** `docs/youtube/video-p4-track-grant-spending/review/
build_sheets.py` still pointed at `review/frames` and `review/sheets`, both deleted in Cycle 7's
19 MB prune, so its glob returned empty and it exited 0 having silently done nothing.
`review/REVIEW-BRIEF.md` still told a reviewer to open seven `review/sheets/chapter-NN.jpg` files
that no longer exist. Kept both rather than deleting them: they're the record of a real review
methodology (a scoring rubric and a sheet-generation script), the same reasoning Cycle 7 already
applied to `design_handoff_grantpipe_ui/README.md`, and added a disclosure at the top of each
(a `[!NOTE]` block in the brief; a comment in the script) plus an explicit `sys.exit` in the script
if its input frames are missing, so a future reader gets an error instead of a silent no-op.

**Commit-count mismatch (P1).** `README.md` gave the private repository's total commit count as
4,266 in `## By the numbers` and, three sections later in `## Built with AI agents`, cited a
"4,264-commit development window" for the identity breakdown: same repository, two numbers, no
explanation in the README itself. The reconciliation (a boundary-commit cutoff: the identity
breakdown is read as of the "add engineering, system-design and project-history docs" commit,
slightly before the tree's final commits) already existed in `portfolio/METRICS.md`'s "Development,
by identity" section. Added a parenthetical at `## By the numbers`' commit row, the first place
either number appears, pointing at that section instead of leaving the second number unexplained.

**`packages/shared` coverage rounding (P2).** `README.md`, `portfolio/METRICS.md`, and
`portfolio/TESTING.md` all rounded `packages/shared`'s lines and statements coverage to 100.0%,
which reads as identical to `packages/db`'s genuine 100% two rows down.
`docs/architecture/repo-stats.json:74-75` has the real figures: 99.97 for both. All three tables
now show `packages/shared`'s lines/statements to a second decimal (99.97%), with a one-line note
in each pointing at the source JSON.

**Mobile-viewport legibility (P2).** The README's screenshot grid packed two 400px-wide images per
row in an HTML table; on a 375px viewport that collapses each image to roughly 185px, too small to
read a dense dashboard. Changed to one image per row (still an HTML `<table>`, per the shared
spec's grid requirement), width raised to 700 so it still reads well on desktop. Two tables lost
columns off the right edge at 375px: `portfolio/README.md`'s file index had a `Length` column that
existed only for reference, so it was folded into the `Covers` cell as a trailing parenthetical, dropping
the table to two columns. `README.md`'s coverage table had `Functions` and `Branches` as its two
rightmost columns, the ones actually clipped: merged into one `Functions / Branches` column
(`"99.8% / 97.0%"` style), dropping the table from five columns to four. The same coverage table
in `portfolio/METRICS.md` and `portfolio/TESTING.md` was not restructured; only `README.md`'s
was reported as clipped and only it was changed.

**Link check.** Every relative link and `#anchor` in `README.md` and all `portfolio/*.md` was
extracted programmatically and checked against the real file tree and the real heading list of
each target (GitHub-slug rules, duplicate-heading suffixing included), not spot-checked by eye.
Zero broken links or anchors, including every link and anchor added by this cycle's own edits.

No secret literal was found in any file this cycle touched or read.

## Findings registry

**P0 = broken or blocking · P1 = looks bad or confusing · P2 = polish**

| #   | Pri | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Status |
| --- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | P0  | `docs/engineering.md:109` spelled out the retired single-audit threshold as a literal while describing the very test that forbids it. The sweep in `apps/site/src/audit-threshold-amount.test.ts` matched the file, and the file is not on the test's allowlist, so the flagship test failed against this tree. Rewritten to name the retired figure descriptively, exactly as `CLAUDE.md` already does for the same reason. The test was not weakened and its allowlist was not extended.                                                                                                                                                                                                                                                          | Fixed  |
| 2   | P1  | `docs/screenshots/anomaly-detector.png` was embedded in the README directly beneath the claim that anomaly detection grades findings across four classes. The image shows none of that: it shows the plan-gate notice reading "Audit-Ready plan required". The caption promised what the image did not show. Embed removed; the file stays in the gallery, which is a complete catalogue of all 40 surfaces and is honest about being one.                                                                                                                                                                                                                                                                                                          | Fixed  |
| 3   | P1  | Every README screenshot carried alt text that restated the caption or the filename. Rewritten to describe what is actually visible in each frame.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Fixed  |
| 4   | P1  | `portfolio/` was reachable only by scrolling into prose. Added a repository-map entry, a `## Documentation` table, and inline `→` callouts in the three sections that have a deeper write-up.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Fixed  |
| 5   | P2  | `docs/architecture/README.md` pointed at `system-design.md` in its own directory after that file moved. Repointed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Fixed  |
| 6   | P2  | Two documents now published were written as internal working material and read that way. Recorded for the owner's judgement rather than altered, and neither is in `portfolio/`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Owner  |
| 7   | P2  | The author's local repository-root path was hardcoded into nineteen dated working documents and one test fixture, left over from when they were written as local session logs. Not a credential or personal-data leak: it names a directory layout, and the account name that appears in a couple of the older ones is already the same public handle this repo is published under. Rewritten repo-relative or to a neutral placeholder in all twenty files; the underlying path no longer appears anywhere in the tracked tree.                                                                                                                                                                                                                    | Fixed  |
| 8   | P0  | 127 markdown links across `packages/shared/src/knowledge/marketing/content/` (comparisons, guides, personas, workflows, listicles) pointed at `grantpipe:signup`, a pseudo-URI scheme with no resolvable target, GitHub renders it as a dead link on every one of those 126 pages. Same root cause everywhere: a CTA meant to reach the real `/signup` route, written before that route existed or copy-pasted forward without it. A sibling test already forbids this exact string in the Astro feature pages but was never extended to this content tree. Replaced all 127 occurrences with `/signup`, the route that actually serves this destination. Checker confirms 0 `MISSING` remain in this repo.                                         | Fixed  |
| 9   | P0  | `portfolio/METRICS.md`, the file the spec requires, did not exist, and `portfolio/README.md`, the required index, did not exist either: the six write-ups in `portfolio/` were reachable only by already knowing their filenames. Both added; `portfolio/README.md`'s table was cross-checked against `ls portfolio/*.md` and lists all six non-index files.                                                                                                                                                                                                                                                                                                                                                                                        | Fixed  |
| 10  | P1  | The README had no `## Testing`, `## Screenshots`, `## Repository map`, `## Built with AI agents`, or `## Known gaps` heading, and printed the `portfolio/` file table a second time inside `## Documentation`, which the shared spec forbids as a drift risk. Added the five missing sections with real, sourced content and cut `## Documentation` to two sentences and two links.                                                                                                                                                                                                                                                                                                                                                                 | Fixed  |
| 11  | P1  | `## What it does` used present tense against a README whose own status alert says the product shut down in August 2026, the tense-honesty check the shared spec asks for. Retitled `## What it did`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Fixed  |
| 12  | P2  | `docs/ux impromenets grantpipe/` mixed a typo'd directory name with 20 raw `.jsx` prototype-component dumps and two HTML shells that only exist to load them via in-browser Babel, none of it documentation, and the shells cannot run without the files removed. Renamed to `docs/ux-improvements-grantpipe/`, the dump deleted, and the one genuine write-up inside it (`design_handoff_grantpipe_ui/README.md`) kept with a note disclosing the removal. `docs/Marketing redesign/` (capital M, embedded space) renamed to `docs/marketing-redesign/` to match every other `docs/` directory; nothing inside it changed.                                                                                                                         | Fixed  |
| 13  | P2  | `docs/youtube/` carried 19 MB of raw frame-dump build output: 30 staged capture PNGs in `_capture/p1/` through `_capture/p4/`, two render-QA directories (`output/_frames/`, `output/_vfy/`) on one video, and three render-review directories (`review/frames/`, `review/probe/`, `review/sheets/`) on another, none referenced by any tracked markdown. Deleted. Every script, plan, and working doc alongside them (`_capture/*.mjs`, `RECIPE.md`, `_lib/voiceover-gemini.mjs`, `_publish/`, `REVIEW-BRIEF.md`, `build_sheets.py`) and every file each video's production pipeline actually consumes (`production/assets/screens/*.png`, `audio/`, `output/captions.srt`) was left in place. `docs/youtube/` dropped from 30 MB to 11 MB.        | Fixed  |
| 14  | P0  | `portfolio/ENGINEERING-LOG.md`'s document-extraction mermaid diagram (Cycle 7) contradicted the schema it claimed to source from: `edited` and `accepted` were drawn as `documentExtractions.status` values, but those two plus `rejected`/`deferred`/`mapped_existing` are written only to the separate `documentExtractionFields.status` column, and the diagram also omitted the real `provider_result_pending --> canceled` edge. Redrawn to only the eight real `documentExtractions.status` values (`packages/shared/src/validators/document-extractions.ts:9-18`), the missing cancel edge added, and field-level review status demoted to prose describing it as a separate, unordered per-field column rather than a nested state machine. | Fixed  |
| 15  | P1  | `portfolio/README.md`'s file-length table had drifted from the real files: `ENGINEERING-LOG.md` was listed at 318 lines but had grown to 339 (partly from finding 14's fix). Recomputed every row with `wc -l`; only that one row was wrong.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Fixed  |
| 16  | P1  | The 19 MB `docs/youtube/` prune (finding 13) left two dangling references: `review/build_sheets.py` still pointed its `FR`/`OUT` globs at the deleted `review/frames`/`review/sheets` and silently exited 0 doing nothing, and `review/REVIEW-BRIEF.md` still told a reviewer to open seven now-deleted `review/sheets/chapter-NN.jpg` files. Kept both as the record of a real review methodology (same reasoning already applied to `design_handoff_grantpipe_ui/README.md`) rather than deleting them; added a disclosure note to each and made the script exit with an error instead of a silent no-op when its input frames are missing.                                                                                                       | Fixed  |
| 17  | P1  | `README.md` stated the private repository's commit count as 4,266 in one section and a "4,264-commit development window" in another, with no reconciliation in the README itself: only in `portfolio/METRICS.md`. Added a parenthetical at the first appearance pointing at the boundary-commit explanation already on file.                                                                                                                                                                                                                                                                                                                                                                                                                        | Fixed  |
| 18  | P2  | `README.md`, `portfolio/METRICS.md`, and `portfolio/TESTING.md` all rounded `packages/shared`'s lines/statements coverage to 100.0%, matching `packages/db`'s genuine 100% on the row below, when `docs/architecture/repo-stats.json` records 99.97 for both. All three tables now show that row to a second decimal with a note pointing at the source JSON.                                                                                                                                                                                                                                                                                                                                                                                       | Fixed  |
| 19  | P2  | Visual review at a 375px viewport found the README's two-per-row 400px screenshot grid shrinking each image to roughly 185px (unreadable), plus two tables losing their rightmost column off-screen: `portfolio/README.md`'s reference-only `Length` column and `README.md`'s `Functions`/`Branches` coverage columns. Screenshot grid changed to one larger (700px) image per row; `Length` folded into the adjacent `Covers` cell; `Functions` and `Branches` merged into one `Functions / Branches` cell. The equivalent coverage table in `portfolio/METRICS.md` and `portfolio/TESTING.md` was not flagged as clipped and was left as five columns.                                                                                            | Fixed  |

### Retracted

| #   | Claim                                                                                                                   | Why it was withdrawn                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | That committed build and tooling output needed deleting from the snapshot.                                              | Swept for `lint-output`, `typecheck-*.txt`, `test_output`, `test_results_*`, `build-output.txt`, `audit_results.json`, `coverage/` dumps, `.log` files, and `tsbuildinfo`. None are tracked. `apps/web/build-output.test.ts` matched on name only and is a genuine test. Nothing deleted.                                                                                                                                                                                                                                                                                                                                                                                                       |
| R2  | ~~That local absolute paths still needed making repo-relative.~~ **This retraction was itself wrong and is withdrawn.** | The row previously claimed that a fresh sweep for Windows user-profile absolute paths across every tracked file returned nothing, so none had regressed. That was false. Re-running the sweep on 2026-08-13 returned 22 matches across 10 tracked files. The claim is left on the record rather than quietly replaced, because a ledger that hides a bad entry is worth less than one that catches it. The paths were an accuracy defect, not an exposure: they name a directory layout that no longer exists on any machine. All 22 are now repo-relative, replaced with a placeholder, or reworded; the sweep returns zero. Also re-checked that no `github.com/<private-org>/` URL survives. |

## Verified claims

Re-derived from this tree on 2026-08-13, with the command that produced each:

| Claim                                          | Command                                                                                                                                                                                                                               | Result                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 37 API domains                                 | `git ls-files \| grep '^apps/api/src/domains/' \| cut -d/ -f5 \| sort -u \| wc -l`                                                                                                                                                    | 37 (matches)                                                                                      |
| 1,526 marketing content entries                | `git ls-files \| grep '^packages/shared/src/knowledge/marketing/content/' \| grep '\.md$' \| wc -l`                                                                                                                                   | 1,526 (matches)                                                                                   |
| 12 engineering write-ups                       | `grep -c '^## [0-9]' portfolio/ENGINEERING-LOG.md`                                                                                                                                                                                    | 12, so the README's "eleven more like it" is right                                                |
| The audit-threshold sweep passes               | the test's own `git grep` for the retired figure, minus its allowlist                                                                                                                                                                 | zero offenders after finding 1                                                                    |
| 166 AI Alex commits (Cycle 7)                  | `git log <2026-08-07 boundary commit> --pretty=format:"%an" \| sort \| uniq -c`, run against the private repository                                                                                                                   | 3,848 Angel Campa / 250 VentoraLabs / 166 AI Alex, summing to the 4,264-commit development window |
| Every README image resolves (Cycle 7)          | `grep -oE 'portfolio/screenshots/[a-z-]+\.png' README.md \| sort -u`, checked against `ls portfolio/screenshots/`                                                                                                                     | all 8 present                                                                                     |
| `portfolio/*.md` line counts (Cycle 8)         | `wc -l` on each of `ARCHITECTURE.md`, `ENGINEERING-LOG.md`, `METRICS.md`, `SECURITY.md`, `TESTING.md`, checked against `portfolio/README.md`'s index                                                                                  | only `ENGINEERING-LOG.md` had drifted (318 to 339); corrected                                     |
| `documentExtractions.status` values (Cycle 8)  | read `DOCUMENT_EXTRACTION_STATUSES` in `packages/shared/src/validators/document-extractions.ts` against every status literal in `apps/api/src/domains/document-extractions/service.ts`                                                | 8 real values, no `accepted`/`edited`; diagram redrawn to match                                   |
| `packages/shared` coverage precision (Cycle 8) | read `docs/architecture/repo-stats.json`                                                                                                                                                                                              | 99.97 lines/statements, not 100. Three tables corrected to a second decimal                       |
| Every link and anchor resolves (Cycle 8)       | a script extracting every `[text](target)` in `README.md` and `portfolio/*.md`, checking relative paths against the real tree and `#anchor`s against each target's real heading list (GitHub slug rules, duplicate-heading suffixing) | 0 broken links or anchors                                                                         |

The `git grep` re-run is the meaningful one: it is what the test executes, so a clean
result is the test passing rather than a proxy for it.

### Cycle 9 (2026-08-18): Corpus-wide index length column, and the snapshot-provenance section rename/move

- The cross-repo standard fixed `portfolio/README.md`'s index table column order as link,
  length, summary, with length as a bare `N lines` cell. This repo's `## Files in this
folder` table had no length column; the figure was buried in each prose cell as
  `(N lines)`. Extracted it into its own `Length` column (second position) and removed the
  parenthetical from the prose; `PROJECT-HISTORY.md`'s row kept `see file` rather than a
  number, unchanged, since its `git log`-derived content has no stable line count.
- Spec item 15a fixes the snapshot-provenance section as `## About this snapshot`, placed
  immediately after `## Documentation` and before `## Built with AI agents`. `README.md` had
  it as `## Status and provenance`, between `## Known gaps` and `## Who built this`. Renamed
  and moved the section (prose untouched) to the required slot, and reordered its
  `## Contents` entry to match.
- Found one inbound link to the old anchor: the status alert at the top of `README.md` linked
  `#status-and-provenance`. Repointed it to `#about-this-snapshot` and updated the link text.
- Recomputed every length cell in `portfolio/README.md` against `wc -l` after all edits: all
  six rows match exactly.
- Ran a relative-link and `#anchor` resolution sweep over `README.md` and every
  `portfolio/*.md` file, using GitHub's slug rules: all resolve, including the repointed
  anchor.

### Cycle 10 (2026-08-18): The `@ventora/ai-cs` note was true about the package and stale about the service

`README.md`'s install note said `@ventora/ai-cs` "powers the in-app AI support widget only." A
cross-repo reviewer read that as a false claim, because no `grantpipe` origin appears in either of
the shared platform's allowlists.

Checked rather than assumed, and the reality is sharper than "absent": the platform's workers
**retire this product explicitly**. `packages/ai-sdr-worker/src/index.ts:128` defines
`RETIRED_PRODUCT_IDS = new Set(["grantpipe"])`, and `packages/ai-cs-worker/src/index.ts` carries a
matching `isRetiredAiCsAppId` check. Both return 403.

The sentence was nonetheless describing what the _package_ is for, inside a note explaining why
`pnpm install` fails, not asserting a live service. So this was staleness, not a false claim.
Changed "powers" to "backed" and added the concrete fact that both workers now reject a `grantpipe`
app id with a 403, so a reader who tries it knows why.
