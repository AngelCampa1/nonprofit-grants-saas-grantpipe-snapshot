# GrantPipe 4-Week Social Batch Analysis And Runbook

Date range: June 15 to July 12, 2026.

Final scope: 3 posts per day per social network, 7 days per week, for LinkedIn, X, and Threads.

Final scheduled total: 252 platform posts.

## Historic Data Source

The planning source was the LinkedIn analytics export at `/Users/angel/Downloads/grantpipe_content_1780933338832.xls`.

Parsed sheets:

- `Metrics`
- `All posts`

Usable post-level data came from `All posts`.

Historic post summary:

- 506 post rows after header cleanup.
- 504 organic rows.
- Date range: April 28, 2026 to June 6, 2026.
- Organic impressions: 53,802.
- Median organic impressions per post: 55.5.
- Organic clicks: 130.
- Organic likes: 45.
- Organic comments: 22.
- Organic reposts: 1.

June 1 to June 6 daily organic pattern:

| Date | Posts | Impressions | Clicks | Likes | Comments |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2026-06-01 | 15 | 2,110 | 4 | 0 | 0 |
| 2026-06-02 | 15 | 1,188 | 3 | 0 | 0 |
| 2026-06-03 | 15 | 1,194 | 2 | 0 | 0 |
| 2026-06-04 | 15 | 869 | 0 | 0 | 0 |
| 2026-06-05 | 15 | 512 | 1 | 1 | 0 |
| 2026-06-06 | 15 | 766 | 3 | 1 | 0 |

## Highest-Performing Patterns

The strongest organic posts were practical and audit-adjacent. They gave the reader a concrete check, a file list, or a board/funder question to answer.

Top organic examples by impressions:

| Date | Impressions | Clicks | Pattern |
| --- | ---: | ---: | --- |
| 2026-05-15 | 2,444 | 1 | SF-425 cash drawn vs. general ledger check |
| 2026-05-12 | 1,671 | 3 | Audit binder list before fieldwork |
| 2026-05-17 | 1,430 | 4 | Executive Director board packet and restricted fund balances |
| 2026-05-28 | 1,311 | 2 | Development calendar list |
| 2026-05-12 | 1,090 | 0 | Donor CRM to general ledger reconciliation |
| 2026-05-15 | 1,033 | 0 | Grant record spread across CRM, QuickBooks, and spreadsheets |
| 2026-05-14 | 784 | 1 | Federal program officer request list |
| 2026-06-01 | 730 | 2 | Grants.gov and post-award reporting systems |
| 2026-05-25 | 711 | 1 | 2 CFR 200 single-audit education |
| 2026-05-23 | 614 | 6 | Board onboarding packet list |

## Lessons Learned

What worked:

- Audit and compliance utility beat broad product claims.
- Board and funder questions worked because they were easy to picture.
- Lists worked when they named real artifacts, not abstract advice.
- Federal compliance posts worked when they named a specific check, such as SF-425, GL tie-out, SEFA, ALN, UEI, or 2 CFR 200.
- Donor CRM plus accounting mismatch posts worked because they named the exact system split.

What did not guide the new plan:

- Sponsored rows were not treated as organic proof.
- Generic product overview posts were not used as the core model.
- Claims about user counts, logos, testimonials, or customer outcomes were excluded.
- Broad competitor claims were excluded unless a current source was available.

The biggest correction from the first scheduling attempt:

- The first run used 3 posts per day across all social networks.
- The requested scope was 3 posts per day per social network.
- The corrected run uses 9 platform posts per local day.

## Strategy For This Batch

The 4-week plan uses a practical operating cadence:

- Week 1: audit binder, SF-425, restricted balances, draw requests, closeout, match file.
- Week 2: monthly close, payroll split, report packet, amendment log, audit sample, closeout prep.
- Week 3: quarter close, SEFA, ALN, UEI, pass-through awards, 2 CFR 200, drawdown log.
- Week 4: renewal prep, award handoff, cash timing, portals, activity log, evidence trail.

Content pillars:

- Compliance and audit.
- Restricted funds.
- Donor plus grant unification.
- Federal grants.
- Executive Director and finance/development work life.
- Product trust and operating model.

## Experiments

The batch tests these ideas:

- Same slot idea, rewritten per platform.
- Shorter, plainer copy after the third-grade review found the first corrected draft was still too dense.
- Grouped Postiz CLI payloads, with LinkedIn, X, and Threads in one create call per slot.
- Three stable local posting slots per day: 08:45, 13:15, and 17:35 America/Matamoros.
- Practical artifact-led posts instead of product-led feature copy.

The grouped CLI shape reduced the live create workload:

- 252 platform posts.
- 84 Postiz CLI create calls.
- Each create call contained 3 integration entries.

## Review And Fix Passes

Required reviews:

- No-lies review.
- Humanizer review.
- Third-grade reading-level review.
- No-em-dash review.
- Brand/account review.
- Duplicate review.
- Schedule-readiness review.

Important review finding:

- The first corrected package had 78 sentences over 14 words and 3 uses of `best`.
- That package was not accepted as final.
- I stopped scheduling, deleted the 15 already-created pre-fix posts, rewrote the full package, and reran the gates.

Final copy gate:

- 252 posts.
- 784 sentences.
- Average sentence length: 4.96 words.
- Longest sentence: 10 words.
- No em dashes.
- No en dashes.
- No curly quotes.
- No `best`.
- No generic blocked terms.
- No placeholders.
- No image prompts without attachments.
- No unsupported testimonials, user counts, private grant database claims, or nonprofit-operator claims.

Repo gate:

- `node scripts/linkedin-post-review-gate.mjs docs/social/cross-platform/2026-06-15-to-2026-07-12/postiz/postiz-socialpost-payload.json`
- Result: `LinkedIn review gate checked 252 posts from 1 files.`

## Live Postiz Execution

Wrong run cleanup:

- Built exact delete manifest from the old 84-row manifest and live Postiz keys.
- Deleted 84 exact matching posts.
- Post-delete live export showed only one older GrantPipe row in the UTC window, landing on June 14 local time.

Readability reset cleanup:

- The first corrected package started scheduling before the spec review came back.
- 5 groups had been created, or 15 platform posts.
- Those 15 pre-fix posts were deleted by exact post id before the final package was scheduled.

Final schedule:

- Scheduler: `<sibling repo>/scripts/postiz-cli-group-scheduler.mjs`.
- State: `<sibling repo>/.postiz-runs/grantpipe-252-2026-06-15/group-state.json`.
- Completed groups: 84.
- Completed rows: 252.
- Unknown rows: 0.
- Failed rows: 0.

Final live export:

- `/tmp/grantpipe-postiz-live-final-252.json`

Final reconciliation:

- Matched reviewed rows: 252.
- Matched groups: 84.
- LinkedIn: 84.
- X: 84.
- Threads: 84.
- State: 252 `QUEUE`.
- Missing reviewed rows: 0.
- Duplicate live keys: 0.
- Bad local day counts: 0.
- Bad local day/platform counts: 0.

## Artifacts

- `strategy.md`: content strategy and schedule shape.
- `validation-report.md`: final counts, gates, and live evidence.
- `weeks/week-1.json` through `weeks/week-4.json`: editable week packages.
- `postiz/postiz-socialpost-payload.json`: master Postiz source payload.
- `postiz/postiz-socialpost-payload.jsonl`: JSONL export.
- `postiz/postiz-import.csv`: CSV export.
- `postiz/payloads/*.postiz.json`: 84 grouped CLI payloads.

## Operational Notes

- Do not rerun from local state alone.
- Always reconcile with `postiz posts:list` before retrying a failed or interrupted run.
- Treat unknown create/delete outcomes as live-reconciliation tasks before retry.
- Keep the June 14 local LinkedIn row out of this campaign's local-day counts.
- Keep platform-specific copy short enough for X first, then adapt for LinkedIn and Threads.
