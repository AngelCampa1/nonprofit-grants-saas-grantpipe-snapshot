# Project history

This repository is a **snapshot**. It contains a single commit holding the tree
as it stood at the end of development, so the commit history is not browsable
here. The working repository it was exported from is private and retains the
full record.

The numbers below come from that private repository, read out of `git log`
rather than written by hand.

## Shape of the work

|                              |            |
| ---------------------------- | ---------- |
| Commits                      | **4,266**  |
| First commit                 | 2026-04-07 |
| Last commit                  | 2026-08-07 |
| Active months                | 5          |
| Merge commits                | 831        |
| Non-merge commits            | 3,435      |
| Lines added across history   | 3,756,905  |
| Lines removed across history | 412,287    |

Total churn is far larger than the roughly 657,000 lines in the final tree. That
gap is the honest shape of the project: large amounts of code were written,
replaced, and deleted. Several subsystems were built twice, and one (the
QuickBooks accounting sync) was built and then removed deliberately, with a
contract test added to keep it removed.

## Commits per month

```text
2026-04  █████████████████████████                1,049
2026-05  ████████████████████████████████████████ 1,654
2026-06  ██████████████████████████████           1,261
2026-07  ███████                                    293
2026-08  ▏                                            9
```

April through June is the build. July is a hardening month: the frontend sweep,
observability recovery, and production stress work. August is wind-down, plus the
pass that produced this documentation.

## Commits by type

Parsed from conventional-commit prefixes on the 3,435 non-merge commits. 3,256 of
them (94.8%) match a `type(scope):` pattern.

| Type       | Count |
| ---------- | ----- |
| `fix`      | 1,608 |
| `feat`     | 766   |
| `docs`     | 524   |
| `test`     | 173   |
| `chore`    | 86    |
| `refactor` | 80    |
| `ci`       | 7     |
| `style`    | 4     |
| `perf`     | 4     |
| `content`  | 4     |

### On the fix-to-feature ratio

`fix` outnumbers `feat` by roughly two to one. That is worth addressing directly
rather than leaving a reader to draw their own conclusion.

The project ran a tight loop: ship a feature slice, then hunt it. A large share
of those 1,608 fixes come from deliberate adversarial passes, meaning stress-test
rounds, UI sweeps, and production verification runs whose entire purpose was to
find defects in code that already worked. Bugs found that way get their own
commit, so the ratio counts the hunting rather than hiding it.

A codebase built solo with no reviewer has to get its adversarial pressure from
somewhere. Here it came from writing tests first, then going looking for what the
tests missed. The 1.55:1 test-to-source line ratio and this 2:1 fix-to-feat ratio
are two views of the same habit.

## Where the churn concentrated

The ten most frequently touched files across the 4,264 development-window commits (`git log
<boundary-commit> --pretty=format: --name-only | sort | uniq -c | sort -rn`, where the boundary
commit is the last one before the post-development snapshot-preparation work):

|                                                              |     |
| ------------------------------------------------------------ | --- |
| `docs/superpowers/goals/frontend-system-sweep-LEDGER.md`     | 314 |
| `apps/site/src/config/site.ts`                               | 157 |
| `apps/api/src/app.ts`                                        | 140 |
| `apps/web/src/routes/_authenticated/grants/$grantId.tsx`     | 123 |
| `apps/site/src/pages/pricing.astro`                          | 119 |
| `apps/api/src/app.test.ts`                                   | 118 |
| `apps/site/src/config/site.test.ts`                          | 116 |
| `apps/web/src/__tests__/grants-funds-funders-pages.test.tsx` | 115 |
| `packages/db/src/migrations/meta/_journal.json`              | 113 |
| `apps/web/src/routes/_authenticated/grants/index.tsx`        | 109 |

The most-touched file in the entire history is not application code. It is the working ledger for
the frontend adversarial-sweep process referenced above: 314 edits, more than double the next
file on the list. That ledger is still in the tree, at the path above, and its own header explains
why it stays short: a 730 KB, roughly 182,000-token wave-by-wave history was compacted out of
it on 2026-06-15 into a separate archive file, specifically so the live ledger would keep fitting
in a single agent session's context window. `apps/app.ts` (the Hono router mount point) and
`config/site.ts` (the marketing site's central config) round out the top three for the ordinary
reason: nearly every new domain or page touches its central registration point once.

## Not solo in the git identity sense, still solo in the human sense

Three git identities appear across the 4,264-commit development window:

|             |       |                                                                         |
| ----------- | ----- | ----------------------------------------------------------------------- |
| Angel Campa | 3,848 | The default identity for engineering and product work                   |
| VentoraLabs | 250   | A studio-level identity used for cross-cutting sweep and infra work     |
| AI Alex     | 166   | An explicit agent identity for commits an agent session made on its own |

All three resolve to Angel Campa's own accounts (`operator@ventoralabs.com` and two
project-scoped addresses on the same two domains), not a second contributor. "Built solo" is a
claim about the _person_, not the _tooling_: the `AI Alex` identity exists precisely so that
agent-authored commits are attributable and searchable rather than blended silently into a human
author's history. `portfolio/METRICS.md` and the README's "Built with AI agents" section use that
same 166-commit figure. It undercounts total agent involvement, since most agent-assisted work
landed under the `Angel Campa` identity during an interactive pairing session; it only captures the
commits where an agent session ran and committed unattended.

## The busiest single day

2026-06-10 produced 177 commits, the most of any day in the project. It falls inside the June peak
visible in the per-month chart above and is consistent with the adversarial-sweep pattern described
under "On the fix-to-feature ratio": a day like that is a review-and-fix cycle running through many
short commits rather than one large one.
