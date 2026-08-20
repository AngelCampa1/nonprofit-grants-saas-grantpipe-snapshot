# Metrics

Every number here traces to a command you can re-run against this tree. Where the source is
`scripts/repo-stats.ts`, that script counts tracked files only (`git ls-files`), so nothing
ignored or untracked inflates a total. Re-derive all of it with `pnpm repo:stats`, or
`pnpm repo:stats --json` for the machine-readable form at
[`docs/architecture/repo-stats.json`](../docs/architecture/repo-stats.json).

## Scale

|                      |                                       | Command                                                                        |
| -------------------- | ------------------------------------- | ------------------------------------------------------------------------------ |
| Application source   | **250,218 lines** across 1,117 files  | `pnpm repo:stats`                                                              |
| Test code            | **388,074 lines** across 905 files    | `pnpm repo:stats`                                                              |
| Test-to-source ratio | 1.55 lines of test per line of source | derived from the two rows above                                                |
| Tracked files        | 5,639                                 | `git ls-files \| wc -l`                                                        |
| Commits              | **4,266**, April 7 to August 7, 2026  | private repository `git log`, see [`PROJECT-HISTORY.md`](./PROJECT-HISTORY.md) |
| Churn across history | 3,756,905 added / 412,287 removed     | private repository `git log --shortstat`                                       |

## Structure

|                               |                                                         | Command                                                                                             |
| ----------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| API domains                   | 37                                                      | `git ls-files \| grep '^apps/api/src/domains/' \| cut -d/ -f5 \| sort -u \| wc -l`                  |
| API endpoints                 | **383** (142 GET, 139 POST, 53 PATCH, 43 DELETE, 6 PUT) | `pnpm repo:stats`                                                                                   |
| Database tables               | 115                                                     | `pnpm repo:stats`                                                                                   |
| Database indexes              | 167                                                     | `pnpm repo:stats`                                                                                   |
| SQL migrations                | 95                                                      | `pnpm repo:stats`                                                                                   |
| Web route components          | 88                                                      | `pnpm repo:stats`                                                                                   |
| Marketing content entries     | 1,526 (drives the programmatic SEO site)                | `git ls-files \| grep '^packages/shared/src/knowledge/marketing/content/' \| grep '\.md$' \| wc -l` |
| Unit + integration test files | **905** (686 `.test.ts`, 219 `.test.tsx`)               | `pnpm repo:stats`                                                                                   |
| Test cases                    | **18,248**                                              | `pnpm repo:stats`                                                                                   |
| Playwright end-to-end specs   | 13                                                      | `pnpm repo:stats`                                                                                   |
| Engineering write-ups         | 12, in [`ENGINEERING-LOG.md`](./ENGINEERING-LOG.md)     | `grep -c '^## [0-9]' portfolio/ENGINEERING-LOG.md`                                                  |
| App surfaces captured         | 40, in [`docs/screenshots/`](../docs/screenshots/)      | `ls docs/screenshots/*.png \| wc -l`                                                                |

## Measured coverage

Not the gate threshold: the actual result of one uncached
`pnpm exec turbo test:coverage --force` run across all six workspaces. Turbo caches on content,
so a plain `pnpm test:coverage` can replay a cached pass without writing new coverage files at
all; `--force` is what makes this table honest.

| Workspace         | Lines  | Statements | Functions | Branches |
| ----------------- | ------ | ---------- | --------- | -------- |
| `apps/api`        | 99.3%  | 99.3%      | 99.8%     | 97.0%    |
| `apps/web`        | 99.6%  | 99.6%      | 99.3%     | 97.2%    |
| `apps/site`       | 99.1%  | 99.1%      | 99.1%     | 96.4%    |
| `packages/db`     | 100.0% | 100.0%     | 100.0%    | 100.0%   |
| `packages/shared` | 99.97% | 99.97%     | 99.6%     | 99.2%    |
| `packages/ui`     | 99.6%  | 99.6%      | 100.0%    | 98.2%    |

`packages/shared`'s lines and statements are shown to a second decimal, not rounded to 100.0%,
because at one decimal they would read as identical to `packages/db`'s genuine 100%. Raw figures
in [`docs/architecture/repo-stats.json`](../docs/architecture/repo-stats.json).

The gate is 95% **per file touched**, not 95% averaged across the repo. Full mechanism and the
one gap it has (the root `scripts/` runner carries no native coverage gate) in
[`TESTING.md`](./TESTING.md).

## Development, by identity

Read out of the private repository's `git log` across the 4,264 development-window commits
ending at the "add engineering, system-design and project-history docs" commit on 2026-08-07
(`git rev-list --count <that commit>`). All three names below resolve to Angel Campa's own
accounts (`operator@ventoralabs.com` and two project-specific addresses), not a second
contributor.

| Git identity | Commits | What it was used for                                                                                                                     |
| ------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Angel Campa  | 3,848   | The default identity for engineering and product work                                                                                    |
| VentoraLabs  | 250     | A studio-level identity, used for cross-cutting sweep and infra work                                                                     |
| AI Alex      | 166     | An explicit agent identity, used when a Claude Code session committed a change outright rather than pairing under Angel Campa's identity |

That 166-commit figure is the number cited in
[`README.md`](../README.md#built-with-ai-agents)'s "Built with AI agents" section. It undercounts
total agent involvement, since most agent-assisted work landed under the `Angel Campa` identity
during a pairing session: it is only the commits where an agent session ran and committed on its
own.

## Verified claims

Re-derived from this tree, with the command that produced each. The full log of every
verification pass, including two that turned up real defects, is
[`docs/goal-portfolio-public/LEDGER.md`](../docs/goal-portfolio-public/LEDGER.md).

| Claim                            | Command                                                                                             | Result          |
| -------------------------------- | --------------------------------------------------------------------------------------------------- | --------------- |
| 37 API domains                   | `git ls-files \| grep '^apps/api/src/domains/' \| cut -d/ -f5 \| sort -u \| wc -l`                  | 37 (matches)    |
| 1,526 marketing content entries  | `git ls-files \| grep '^packages/shared/src/knowledge/marketing/content/' \| grep '\.md$' \| wc -l` | 1,526 (matches) |
| 12 engineering write-ups         | `grep -c '^## [0-9]' portfolio/ENGINEERING-LOG.md`                                                  | 12              |
| The audit-threshold sweep passes | the test's own `git grep` for the retired figure, minus its allowlist                               | zero offenders  |
| 40 app surfaces captured         | `ls docs/screenshots/*.png \| wc -l`                                                                | 40 (matches)    |
