# GrantPipe - Grant Management System

> Donor management, fund accounting, and federal grant compliance for mid-sized nonprofits, in one system instead of three disconnected tools.

Mid-sized nonprofits (roughly $500K to $10M in budget) end up stitching together a donor CRM, a spreadsheet for grant tracking, and a separate process for federal compliance reporting. Each tool works fine on its own. The problem shows up at the seams: a restricted fund tracked in one place but reported in another, a compliance threshold that changed and nobody updated the spreadsheet, an audit trail that lives in someone's email history.

> [!IMPORTANT]
> GrantPipe was completed and deployed as a running product: marketing site, Stripe-billed subscription app, 37 API domains, and a federal compliance reporting pipeline. Development ended August 7, 2026, and the hosted service has been decommissioned. Every number below was measured from this repository. [About this snapshot](#about-this-snapshot) covers what was sanitized before publishing.

> [!NOTE]
> Built solo by **Angel Campa** ([@AngelCampa1](https://github.com/AngelCampa1)), April to August 2026. Source-available for portfolio review. No license to use, copy, or redistribute is granted. See [License](#license).

![GrantPipe dashboard: an executive snapshot reading "4 overdue grants and no board packet generated", counters for urgent work and deadlines in the next 30 days, and a priority-actions column listing three federal grants with overdue reporting and their due dates](portfolio/screenshots/dashboard.png)

_Captured from the local stack against seeded demo data. Reproduction steps are in [Running it locally](#running-it-locally)._

---

I treated this as a data-modeling and compliance-automation problem: put donors, grants, restricted
funds, ledger, and federal reporting in one system, and encode 2 CFR Part 200, the federal Uniform
Guidance that governs nonprofit grants, in code instead of institutional memory.

The most unusual thing in here is a test.
[`apps/site/src/audit-threshold-amount.test.ts`](apps/site/src/audit-threshold-amount.test.ts)
shells out to `git grep` across every tracked file hunting for the federal single-audit dollar
threshold that the 2024 OMB revision retired, and fails the build if it reappears in code, docs, or
any of the 1,526 marketing content entries. The retired figure is never written in the test source;
it is reassembled from string fragments at runtime so the test cannot match itself. An allowlist
covers the two explainer videos that legitimately teach the before-and-after. Compliance software's
worst failure mode is a number that used to be right, and the compiler has no opinion about prose.
[`portfolio/ENGINEERING-LOG.md`](portfolio/ENGINEERING-LOG.md) has eleven more like it.

## Contents

- [If you read one thing](#if-you-read-one-thing)
- [What it did](#what-it-did)
- [Architecture](#architecture)
- [Engineering highlights](#engineering-highlights)
- [By the numbers](#by-the-numbers)
- [Testing](#testing)
- [Screenshots](#screenshots)
- [Repository map](#repository-map)
- [Documentation](#documentation)
- [About this snapshot](#about-this-snapshot)
- [Built with AI agents](#built-with-ai-agents)
- [Running it locally](#running-it-locally)
- [Who built this](#who-built-this)
- [License](#license)

## If you read one thing

[`portfolio/ENGINEERING-LOG.md`](./portfolio/ENGINEERING-LOG.md) covers the twelve parts that were
hardest to get right, each anchored to a real file. If you have fifteen minutes and would rather
read code directly, these five files cover the parts that took the most thought:

1. [`packages/shared/src/validators/allocation-math.ts`](packages/shared/src/validators/allocation-math.ts) is the money-splitting invariant, and the shortest path to how this codebase treats correctness.
2. [`apps/api/src/middleware/org-entity-context.ts`](apps/api/src/middleware/org-entity-context.ts) makes two-level tenancy a structural property rather than a rule each route author has to remember.
3. [`apps/api/src/domains/accounting/postingEngine.ts`](apps/api/src/domains/accounting/postingEngine.ts) handles double-entry posting, pledge present-value accounting, and guarded restriction releases.
4. [`apps/api/src/domains/compliance/sefa.service.ts`](apps/api/src/domains/compliance/sefa.service.ts) is the most domain-heavy service in the repo, where federal rules meet real data.
5. [`packages/db/src/schema`](packages/db/src/schema) is the 115-table model the rest of it stands on.

| Everything else you might want                               | Read                                                           |
| ------------------------------------------------------------ | -------------------------------------------------------------- |
| How the system fits together                                 | [`portfolio/ARCHITECTURE.md`](portfolio/ARCHITECTURE.md)       |
| How it was tested, and the measured coverage                 | [`portfolio/TESTING.md`](portfolio/TESTING.md)                 |
| Every top-level app screen, captured from a running instance | [`docs/screenshots/`](docs/screenshots/)                       |
| How the work accumulated over five months                    | [`portfolio/PROJECT-HISTORY.md`](portfolio/PROJECT-HISTORY.md) |

## What it did

The parts of each area that are not standard. [`docs/screenshots/`](docs/screenshots/) walks all 40
app surfaces with their route paths, and
[`portfolio/ENGINEERING-LOG.md`](portfolio/ENGINEERING-LOG.md) covers the mechanics in depth.

### Fundraising and donors

- Donor CRM with contacts, organizations, donation history, and a configurable pipeline, built for fundraising rather than repurposed from sales software.
- Pledge management with scheduled payments, partial fulfilment, and automated lapse alerts when a pledge falls behind.
- Per-organization custom fields on contacts, donations, and grants using an EAV model, so an org adds a field without a schema migration.

| Donors                                                                                                         | At-risk donors                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| ![Donor list with contact names, lifetime giving totals, and pipeline stage](portfolio/screenshots/donors.png) | ![At-risk donor view flagging lapsed and lapsing givers against their prior giving pattern](portfolio/screenshots/donors-at-risk.png) |

### Grants and restricted funds

- Grants and funds modeled as **separate entities** joined through `grant_fund_allocations`, matching how FASB ASC 958 distinguishes an award from the restricted or unrestricted fund it lands in.
- **Spend-down tracking** that classifies each grant against 80% / 90% / 100% burn thresholds and computes burn rate against time elapsed.
- **Budget sentinel** that classifies budget-line overspend and fund underspend into severity bands and surfaces them before a reporting deadline turns them into a problem.
- Restriction terms with allowed-category rules, additions, and releases. Releasing restricted money against an ineligible category is a rejected operation, not a footnote in a report three months later.

A grant's `status` field (`packages/db/src/schema/grants.ts`) is declared over nine values, not a
three-state "open / closed" flag, but the shape a real award moves through from first sighting to
renewal or decline:

```mermaid
stateDiagram-v2
    [*] --> discovery
    discovery --> application
    application --> submitted
    application --> declined
    submitted --> awarded
    submitted --> declined
    awarded --> active
    active --> reporting
    reporting --> active
    reporting --> closeout
    closeout --> renewal
    renewal --> application
    declined --> [*]
    closeout --> [*]
```

The API does not enforce this as a strict transition graph today: a grant's status can be set
directly to any of the nine values, not just the ones reachable from its current one.

| Grant portfolio                                                                                                                                                    | Restricted funds                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| ![Grant portfolio table: five awards with funder, status badge (Application, Closeout, Active, Reporting), amount, and deadline](portfolio/screenshots/grants.png) | ![Restricted and unrestricted funds with balances and restriction terms](portfolio/screenshots/funds.png) |

Budget Sentinel classifies every grant and fund at risk of overspending or lapsing unspent, with the
amount at stake and how long the window has been closed:

![Budget Sentinel listing two grants graded "Lapsed Unspent", with the amount at risk and how many days the spend window has been closed](portfolio/screenshots/budget-sentinel.png)

### Fund accounting

- **Double-entry posting engine** that writes journal entries and lines for donations, expenses, pledge payments, and restriction movements, with sequential journal-entry numbering and fiscal-period awareness.
- **Anomaly detection** across four classes (category misallocation, release-over-balance, duplicate donation in a 3-day window, and indirect-rate mismatch), each graded `info` / `warning` / `critical`.
- Every monetary value is an integer in cents end to end. Formatting happens only at the display layer.

| Journal                                                                                                                                                         | Trial balance                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![Double-entry journal: donation entries with sequential reference numbers, dates, memo lines, source tag, and total debits](portfolio/screenshots/journal.png) | ![Trial balance as of a chosen date, listing the nonprofit chart of accounts with debit and credit columns](portfolio/screenshots/trial-balance.png) |

### Federal compliance (2 CFR Part 200)

- **SEFA generation** builds the Schedule of Expenditures of Federal Awards from expense and award data against the org's fiscal year, with assistance-listing numbers, FAIN, pass-through attribution, and cluster names.
- **Single-audit tripwire** that flags at 80% of the $1,000,000 threshold, so an org is warned _before_ it trips a mandatory audit rather than after.
- **Uniform Guidance guardrails at data-entry time.** Payment requests are checked against the 15% de minimis indirect rate, the MTDC subaward exclusion cap, and the equipment capitalization threshold, returning structured findings instead of failing an audit months later.
- **Subrecipient monitoring** with risk assessments, findings, corrective actions, and monitoring tasks and logs for pass-through funding obligations.

### Audit and oversight

- **External reviewer portal.** Outside auditors get scoped, time-limited access without an account in the host organization. Session tokens are HMAC-signed over `portal:${sessionId}:${expiresAt}`, so a token issued for one session cannot be replayed against another, and access is bound to an explicit scope target (a grant, fund, program, subrecipient, or evidence bundle).
- **Polymorphic activity log** with a JSONB diff on every entity change, giving every table an audit trail without a bespoke logging path per domain.
- A read-only **Auditor** role scoped to grants, funds, documents, compliance, accounting, and reports, with no donor, event, billing, or team visibility.

### AI where it belongs

- **Award-letter intake.** Upload a notice of award or grant agreement; it goes onto a Cloudflare Queue, gets extracted by a model pinned to a stable release against a strict JSON schema, and comes back as canonical `destinationEntityType` / `destinationField` pairs with a **required source snippet for every extracted field**.
- Extraction proposes; it never commits. A human verifies before anything is written. **No LLM is anywhere near the accounting or compliance math.** That path is deterministic.

→ [ENGINEERING-LOG.md](./portfolio/ENGINEERING-LOG.md) walks the queue, the pinned model, the
source-snippet requirement, and the extraction status pipeline in code

---

## Architecture

**Type safety without codegen.** The API exports its router type; the client imports that type and
calls `hc<AppType>()`. Change a route's input or output shape and the client stops compiling until
it is fixed. That matters in a solo codebase with no second engineer to catch a stale contract.

**Organized by business domain, not technical layer.** Each of the 37 domains owns its `routes.ts`
and `service.ts`, so a change to how grants work stays inside the grants domain instead of touching
a shared controller.

**The platform is used, not just deployed to.** Beyond Workers: Queues for async award intake,
Durable Objects for coordination, R2 for documents, D1 for marketing data, KV for auth rate
limiting, Hyperdrive for Postgres pooling, Browser Rendering for server-side PDF generation, and
cron triggers for scheduled jobs. The Hyperdrive binding runs with query caching explicitly
disabled, documented inline, because Better Auth session reads are not safe to cache.

The full request path (browser through Pages and the Worker to Postgres, Queues, and the external
services) is diagrammed in [`portfolio/ARCHITECTURE.md`](portfolio/ARCHITECTURE.md), along with
the tenancy-resolution rules and the data model. The directory layout itself is in
[Repository map](#repository-map) below.

## Engineering highlights

Five things I would point at in a code review. The full set is in
[`portfolio/ENGINEERING-LOG.md`](portfolio/ENGINEERING-LOG.md).

**Money that cannot drift.** In [`packages/shared/src/validators/allocation-math.ts`](packages/shared/src/validators/allocation-math.ts), splitting a grant across funds uses largest-remainder apportionment over basis-point weights. Weights must be non-negative integers summing to exactly 10,000 bps, and the output array is guaranteed to sum _exactly_ to the input, with the sign extracted for negative amounts and ties broken deterministically by index. No float ever touches a dollar.

**Regulations that cannot go stale.** The `git grep` regression test described at the top of this README is the enforcement half of this. The other half is that federal thresholds are stored as data with a citation and an effective date rather than inlined as literals, so the value and its provenance move together. The 2024 OMB revision changed four numbers that appear constantly in this domain, and this is what stops one of them quietly reappearing.

**Tenancy that is not a discipline problem.** Every table carries `org_id`, and [`apps/api/src/middleware/org-entity-context.ts`](apps/api/src/middleware/org-entity-context.ts) makes the scoped database handle the thing route authors are _given_. Across 37 domains, no one has to remember to filter. A security review early in the project found two cross-tenant bugs of exactly the kind this structure prevents. Both are fixed, and [`portfolio/SECURITY.md`](portfolio/SECURITY.md) is kept in the repo with its resolution status rather than quietly deleted.

**Observability enforced by CI, not by intention.** [`scripts/analytics-event-governance.ts`](scripts/analytics-event-governance.ts) scans every app for `captureEvent` / `trackEvent` literals and fails the build on any event name absent from the canonical registry. "Every feature ships with analytics" is a claim most codebases cannot back. Here it is machine-checked.

**A compliance tripwire with a real threshold.** [`apps/api/src/domains/compliance/sefa.service.ts`](apps/api/src/domains/compliance/sefa.service.ts) holds the SEFA builder and the 80%-of-threshold watch band that turns a compliance cliff into a warning.

→ [ENGINEERING-LOG.md](./portfolio/ENGINEERING-LOG.md) has all twelve with the reasoning ·
the two cross-tenant defects and their fixes are in [SECURITY.md](./portfolio/SECURITY.md)

## By the numbers

**Scale**

|                      |                                                                                                                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application source   | **250,218 lines** across 1,117 files                                                                                                                                                                                    |
| Test code            | **388,074 lines** across 905 files                                                                                                                                                                                      |
| Tracked files        | 5,639                                                                                                                                                                                                                   |
| Commits              | **4,266**, April 7 to August 7, 2026 (the by-identity breakdown in [`METRICS.md`](./portfolio/METRICS.md#development-by-identity) is read as of the commit that added the project's engineering docs, 4,264 commits in) |
| Churn across history | 3,756,905 added / 412,287 removed                                                                                                                                                                                       |

There is more test code here than application code, roughly 1.55 lines of test per line of source.
That ratio is the honest summary of how this repository was built.

**Structure**

|                               |                                                         |
| ----------------------------- | ------------------------------------------------------- |
| API domains                   | 37                                                      |
| API endpoints                 | **383** (142 GET, 139 POST, 53 PATCH, 43 DELETE, 6 PUT) |
| Database tables               | 115                                                     |
| Database indexes              | 167                                                     |
| SQL migrations                | 95                                                      |
| Web route components          | 88                                                      |
| Marketing content entries     | 1,526 (drives the programmatic SEO site)                |
| Unit + integration test files | **905** (686 `.test.ts`, 219 `.test.tsx`)               |
| Test cases                    | **18,248**                                              |
| Playwright end-to-end specs   | 13                                                      |

Every number above is produced by [`scripts/repo-stats.ts`](scripts/repo-stats.ts). Run
`pnpm repo:stats` to re-derive them, or `pnpm repo:stats --json` to write
[`docs/architecture/repo-stats.json`](docs/architecture/repo-stats.json). Source counts exclude
tests, e2e specs, and generated output. The file universe is `git ls-files`, so nothing ignored or
untracked inflates a total. [`portfolio/METRICS.md`](portfolio/METRICS.md) lists the exact command
behind every one of these rows, plus the development-window author breakdown by git identity.

## Testing

Not the gate threshold: the actual result of one uncached
`pnpm exec turbo test:coverage --force` run across all six workspaces:

| Workspace         | Lines  | Statements | Functions / Branches |
| ----------------- | ------ | ---------- | -------------------- |
| `apps/api`        | 99.3%  | 99.3%      | 99.8% / 97.0%        |
| `apps/web`        | 99.6%  | 99.6%      | 99.3% / 97.2%        |
| `apps/site`       | 99.1%  | 99.1%      | 99.1% / 96.4%        |
| `packages/db`     | 100.0% | 100.0%     | 100.0% / 100.0%      |
| `packages/shared` | 99.97% | 99.97%     | 99.6% / 99.2%        |
| `packages/ui`     | 99.6%  | 99.6%      | 100.0% / 98.2%       |

`packages/shared`'s lines and statements are shown to a second decimal because they round to
100.0% at one decimal, which would read as identical to `packages/db`'s genuine 100%. See
[`docs/architecture/repo-stats.json`](./docs/architecture/repo-stats.json).

The gate is 95% **per file**, not 95% averaged across the repo, so a well-covered utility cannot
pay for an untested service. It is enforced by
[`scripts/lib/coverage-gates.ts`](scripts/lib/coverage-gates.ts) and
[`apps/web/scripts/verify-coverage-thresholds.mjs`](apps/web/scripts/verify-coverage-thresholds.mjs)
for changed files, and natively by `vitest.config.ts`'s `thresholds` block in five of the six
workspaces.

The workflow behind those numbers was test-driven development (write the failing test, confirm it
fails, implement, confirm it passes) with a pre-commit pipeline
([`.husky/pre-commit`](.husky/pre-commit)) that runs ESLint and Prettier on staged files, then maps
changed files to workspace packages and runs typecheck plus coverage for only those
([`scripts/run-affected-checks.ts`](scripts/run-affected-checks.ts)).

→ [TESTING.md](./portfolio/TESTING.md) covers the test layers, the coverage-gate mechanism in full,
and a worked example of a real defect the suite caught: tests that hardcoded a date and broke
themselves five weeks later.

## Screenshots

The eight captures used above, together. [`docs/screenshots/`](docs/screenshots/) has the complete
40-surface gallery with route paths; these are the ones referenced in this README, relocated to
[`portfolio/screenshots/`](portfolio/screenshots/) since they are cited claims rather than a raw
capture archive.

<table>
<tr>
<td><img src="portfolio/screenshots/dashboard.png" alt="GrantPipe dashboard: an executive snapshot reading 4 overdue grants and no board packet generated, counters for urgent work and deadlines in the next 30 days, and a priority-actions column listing three federal grants with overdue reporting and their due dates" width="700"></td>
</tr>
<tr>
<td><img src="portfolio/screenshots/donors.png" alt="Donor list with contact names, lifetime giving totals, and pipeline stage" width="700"></td>
</tr>
<tr>
<td><img src="portfolio/screenshots/donors-at-risk.png" alt="At-risk donor view flagging lapsed and lapsing givers against their prior giving pattern" width="700"></td>
</tr>
<tr>
<td><img src="portfolio/screenshots/grants.png" alt="Grant portfolio table: five awards with funder, status badge, amount, and deadline" width="700"></td>
</tr>
<tr>
<td><img src="portfolio/screenshots/funds.png" alt="Restricted and unrestricted funds with balances and restriction terms" width="700"></td>
</tr>
<tr>
<td><img src="portfolio/screenshots/budget-sentinel.png" alt="Budget Sentinel listing two grants graded Lapsed Unspent, with the amount at risk and how many days the spend window has been closed" width="700"></td>
</tr>
<tr>
<td><img src="portfolio/screenshots/journal.png" alt="Double-entry journal: donation entries with sequential reference numbers, dates, memo lines, source tag, and total debits" width="700"></td>
</tr>
<tr>
<td><img src="portfolio/screenshots/trial-balance.png" alt="Trial balance as of a chosen date, listing the nonprofit chart of accounts with debit and credit columns" width="700"></td>
</tr>
</table>

## Repository map

```text
apps/
  site/   Astro 6 marketing site                    -> grantpipe.com
  web/    React 19 + Vite SPA, 88 route components  -> app.grantpipe.com
          TanStack Router + TanStack Query
  api/    Hono on Cloudflare Workers, RPC mode      -> app.grantpipe.com/api
          37 domains: apps/api/src/domains/<domain>/{routes.ts,service.ts}
packages/
  db/       Drizzle ORM: 115 tables, 95 SQL migrations
  ui/       Shadcn/UI components + design tokens (Tailwind CSS 4)
  shared/   Zod validators and types shared by API and client

portfolio/  The write-ups linked throughout this README, indexed at portfolio/README.md
docs/       Working material from the build: plans, audits, campaigns, screenshots, video pipeline
```

## Documentation

The retrospective write-ups behind every claim above live in
[`portfolio/`](./portfolio/), indexed at [`portfolio/README.md`](./portfolio/README.md). Working
material from the build (plans, audits, marketing drafts, and the video-production pipeline)
lives in [`docs/`](./docs/), dated and left unpolished on purpose.

## About this snapshot

The product was completed and deployed. Development ended August 7, 2026, the hosted service has
been decommissioned, and the repository is archived here as it stood.

This is a **snapshot repository**, a single commit holding the final tree. The 4,266-commit history
lives in a private repository, and [`portfolio/PROJECT-HISTORY.md`](portfolio/PROJECT-HISTORY.md)
summarizes what it contains. Rendered audio and video for the marketing content pipeline were
stripped to keep the clone small; the scripts and plans that produced them remain in
[`docs/youtube/`](docs/youtube/), along with the raw QA capture frames pruned as build output rather
than documentation.

Cloudflare resource identifiers in the `wrangler` config (D1, KV, Hyperdrive) and the PostHog
project key are placeholders here, not the values the deployed product used. Nothing else was
altered, so the code reads exactly as it ran.

`docs/offers/` and `docs/social/` hold marketing and pricing working material from the same period.
They are kept for completeness and are not part of the engineering record. The record of how this
snapshot itself was prepared and verified (what moved, what was pruned, and what a repository-wide
sweep found) is [`docs/goal-portfolio-public/LEDGER.md`](docs/goal-portfolio-public/LEDGER.md).

## Built with AI agents

GrantPipe was built with agentic coding tools throughout, and that is not hidden here:
[`.claude/`](./.claude/), [`.agents/`](./.agents/), [`.superpowers/`](./.superpowers/),
[`CLAUDE.md`](./CLAUDE.md), and [`AGENTS.md`](./AGENTS.md) are all committed on purpose and
reviewed like source, not scrubbed for a public audience.

The private repository's git history carries an explicit `AI Alex` git identity, used specifically
for commits an agent session made and committed on its own rather than during interactive pairing.
Across the 4,264-commit development window, 166 commits carry that identity: a real, checkable
lower bound on unattended agent work, not a marketing estimate. All of it, including the
`AI Alex` identity itself, traces back to Angel Campa's own accounts; see
[`portfolio/PROJECT-HISTORY.md`](portfolio/PROJECT-HISTORY.md) for the full breakdown.

What the agent process actually enforced, concretely: the 95%-per-file coverage gate above ran the
same way on every change, whether an agent committed it unattended or it landed during an
interactive pairing session. [`scripts/hunt-lies/founder-rule.ts`](scripts/hunt-lies/founder-rule.ts)
is a build-time linter that blocks fabricated user counts, invented testimonials, and first-person
claims of nonprofit-sector experience the author does not have, written because an agent generating
marketing copy will happily invent exactly that kind of thing if nothing stops it.

## Running it locally

Prerequisites: Node 20+, pnpm, Docker (for local Postgres).

> [!NOTE]
> `pnpm install` will fail on `@ventora/ai-cs`, an internal package that resolves from a private
> registry and is not published publicly. It backed the in-app AI support widget only. Nothing in
> the compliance, accounting, grants, or donor domains depends on it. The widget would not work
> now in any case: the shared platform's workers retired this product explicitly, and both reject
> a `grantpipe` app id with a 403.

```bash
pnpm install
pnpm db:local:start                  # local Postgres on :55439

# drizzle.config.ts falls back to DATABASE_URL in the root .env, which pointed at
# the (now decommissioned) production database. Set it explicitly for local work:
export DATABASE_URL="postgres://postgres:postgres@localhost:55439/grantpipe"
pnpm --filter @grantpipe/db migrate

GRANTPIPE_API_PORT=5050 pnpm dev:server start api
GRANTPIPE_WEB_PORT=3050 pnpm dev:server start web
pnpm --filter @grantpipe/site dev     # Astro dev server on :4321

turbo typecheck
turbo lint
pnpm exec turbo test:coverage --force  # --force: turbo caches on content, and a
                                       # cached "pass" can write no coverage at all
```

The screenshots in this README are reproducible: seed the demo org with
`pnpm --filter @grantpipe/db exec tsx src/seed-demo.ts`, then run `pnpm screenshots` to recapture
all 40 app surfaces.

## Who built this

Angel Campa, Principal SDET. Built solo, April to August 2026.
[github.com/AngelCampa1](https://github.com/AngelCampa1)

Questions about anything in here are welcome.

## License

Source-available for portfolio review. All rights reserved. This is not an open-source project, and
no license to use, copy, or redistribute the code, in whole or in part, is granted for any purpose.
Full terms in [`LICENSE`](./LICENSE).
