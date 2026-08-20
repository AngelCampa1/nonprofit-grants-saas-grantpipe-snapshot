# System Integration Bug Hunt Ledger - 2026-07-11

Statuses: `candidate`, `reproduced`, `fixing`, `verified`, `contradicted`.

| ID     | Severity | Boundary                                          | Status     | Current evidence                                                                                                                                                                                                                                                                                                                                                                                                                  | Required proof                                                                                                                                       |
| ------ | -------- | ------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| SI-001 | P0       | Canonical web route / marketing / email / portal  | verified   | Router basepath is `/app`; maintained sources generated root `/login`, `/signup`, `/reset-password`, `/portal`, and lifecycle links. Cross-package contracts and production browser proof pass.                                                                                                                                                                                                                                   | Preserve through later cycles.                                                                                                                       |
| SI-002 | P0       | Local E2E harness / production safety             | verified   | Local config now selects an explicit inventory and excludes production/helper specs; membership contracts and `--list` proof pass.                                                                                                                                                                                                                                                                                                | Preserve through final review and merge.                                                                                                             |
| SI-003 | P1       | Full production E2E inventory                     | verified   | The former `prod:full` gate covered five files. It is now honestly named `prod:authenticated`, with every Playwright spec assigned to an explicit suite.                                                                                                                                                                                                                                                                          | Preserve through final review and merge.                                                                                                             |
| SI-004 | P1       | Unit-test orchestration                           | verified   | The concurrent run failed with `ERR_IPC_CHANNEL_CLOSED`; root unit and coverage gates are now serialized. A complete unit run and a complete coverage run both passed without IPC recurrence.                                                                                                                                                                                                                                     | Preserve through final review and merge.                                                                                                             |
| SI-005 | P1       | QuickBooks product / deploy truth                 | verified   | Current product canon and production say unavailable. Dormant service, queue, hooks, validators, secrets, and active stress expectations are removed. Production shows the canonical disabled UI, no connect/sync controls, and exact 410 tombstones.                                                                                                                                                                             | Preserve through later cycles.                                                                                                                       |
| SI-006 | P1       | Stripe Checkout / idempotency                     | fixing     | Stripe recommends a new Session for each payment attempt, but the deterministic org/plan/cycle/promo key reused Stripe's cached first result for distinct attempts. The checkout request now carries a privacy-safe UUID and the provider keys each logical attempt separately.                                                                                                                                                   | Focused coverage/typecheck, independent review, deploy, and guarded live proof after Stripe secrets are restored.                                    |
| SI-007 | P1       | Award intake / queue / usage persistence          | fixing     | Accepted-then-throw queue delivery could be destructively marked failed and unmetered, while retry created a second logical extraction. Extraction plus usage now persist atomically under a required stable attempt key; only the creator queues/logs/tracks start effects, and send failures remain pending for safe scheduled redispatch.                                                                                      | Independent review, deploy migration/API/web, and guarded production recovery proof.                                                                 |
| SI-008 | P1       | Trial lifecycle email / persistence               | fixing     | A two-tick test reproduced duplicate delivery when Resend succeeded and the first `sentAt` update failed. Each schedule row now sends with one stable Resend idempotency key, and transient cron retry is safe.                                                                                                                                                                                                                   | Integrated API coverage/typecheck, independent review, deploy, and scheduled production observation.                                                 |
| SI-009 | P1       | Donor mail merge / persistence                    | fixing     | A durable pre-send delivery claim uses a five-minute lease and the same provider key to recover uncertain sends inside a conservative 23-hour window, then quarantines them. Compare-and-set transitions cannot regress a concurrent `sent` result. The UI reuses one required attempt ID for failed retries; stale clients fail with controlled 400 responses.                                                                   | Apply migration 0079, deploy API before web, then run guarded provider/database verification. Cached old tabs must refresh after a controlled 400.   |
| SI-010 | P1       | Auth rate limits / KV concurrency                 | fixing     | A deterministic concurrent-read store admitted 20 of 20 sign-in checks against the cap of 10 and persisted `1`. Auth throttling now uses a transactional SQLite Durable Object in production; 23 focused tests pass with 100% statements, lines, and functions plus 98.41% branches.                                                                                                                                              | Deploy the Durable Object migration, run guarded live concurrency proof, and preserve fail-open behavior with Sentry capture on coordinator failure. |
| SI-011 | P1       | Turnstile / production config                     | fixing     | Production secret inventory confirms `TURNSTILE_SECRET_KEY` is present, so the suspected live omission is contradicted. The source still failed open on real-mode misconfiguration; it now returns the existing 403 response and emits a token-free Sentry event while mock/local mode retains its bypass.                                                                                                                        | Full gates, deploy, and guarded live invalid-token proof without changing the production secret.                                                     |
| SI-012 | P1       | Local marketing site / app environment            | verified   | The `/signup/` bridge ignored `PUBLIC_APP_URL` and redirected local E2E into production. It now uses the configured app URL; the two-case browser regression passes.                                                                                                                                                                                                                                                              | Preserve through final review and merge.                                                                                                             |
| SI-013 | P1       | Nurture email / canonical app route               | verified   | Nurture HTML and text CTAs used an insecure hard-coded root signup URL. Both now use the configured canonical app URL; eight focused tests pass.                                                                                                                                                                                                                                                                                  | Preserve through final review and merge.                                                                                                             |
| SI-014 | P1       | Production stress inventory / execution           | verified   | The migration runbook glob omitted the AI-CS E2E script. A single package runner now consumes the authoritative 35-script inventory through the live wrapper; runner and membership contracts pass.                                                                                                                                                                                                                               | Preserve through final review and merge; execute only in a cleanup-guarded production window.                                                        |
| SI-015 | P2       | Site URL builder / configured base path           | verified   | A configured `PUBLIC_APP_URL` already ending in `/app` produced `/app/app/...`. Site URL construction now delegates to the shared builder; the reproduced edge case passes.                                                                                                                                                                                                                                                       | Preserve through final review and merge.                                                                                                             |
| SI-016 | P1       | Root test pipeline / web build output             | verified   | The root test pipeline ran `build-output.test.ts` without first producing `apps/web/dist`. Root unit and coverage commands now build the web artifact first; both complete gates pass.                                                                                                                                                                                                                                            | Preserve through final review and merge.                                                                                                             |
| SI-017 | P1       | QuickBooks public-copy / product truth            | verified   | Active landing pages, knowledge articles, and brochures promised ingestion, integration, or automated reconciliation despite the unavailable connector. The recursive 1,632-artifact gate, regenerated artifact review, deployment, and live page sampling pass.                                                                                                                                                                  | Preserve through later cycles.                                                                                                                       |
| SI-018 | P2       | Unavailable feature / plan recommendation         | verified   | `PremiumFeatureKey` admitted `hasAccountingIntegrations`, so typed callers could map an unavailable capability to Enterprise. The narrowed type, compile-time regression, full gates, and independent review pass.                                                                                                                                                                                                                | Preserve through later cycles.                                                                                                                       |
| SI-019 | P1       | Accounting integration live stress / parent gate  | verified   | The guarded production run reaches the truthful parent `Accounting integrations are not available yet` gate. The harness accepts that canonical parent state while preserving exact API tombstones, canonical URL proof, and absent connect/sync controls. Live proof passes.                                                                                                                                                     | Preserve through later cycles.                                                                                                                       |
| SI-020 | P0       | Stripe production bindings / billing availability | fixing     | Production `INTEGRATION_MODE=real`, but neither production vars nor remote secrets contain the two Stripe secrets or any of the six required price bindings. This makes `GET /api/org/billing` return 500, checkout unusable, and the webhook return 503. Production schema and reusable-account billing data are valid. Code now keeps the DB summary readable and returns controlled observed 503s for unready checkout/portal. | Securely restore all eight bindings, deploy, and prove summary, checkout, portal, and signed webhook behavior without exposing values.               |
| SI-021 | P1       | Public rate limits / atomic concurrency           | verified   | Transactional Durable Object counters cover auth and public limits; identities are HMAC-derived. Unit concurrency proof and a production sign-in probe both enforce the ten-request cap, returning 429 on requests 11 and 12.                                                                                                                                                                                                     | Preserve through later cycles.                                                                                                                       |
| SI-022 | P1       | Public Turnstile token lifecycle / questionnaire  | verified   | Every transmitted token is reset, gated controls require a fresh challenge, and the widget retries bounded script-load failures. Production invalid-token proof returns 403 before persistence.                                                                                                                                                                                                                                   | Preserve through later cycles.                                                                                                                       |
| SI-023 | P2       | Public JSON body size / pre-parse abuse control   | verified   | Streaming 16 KiB limits run before auth, feedback, lead, analytics, and portal parsing. Production oversized Better Auth proof returns 413 before the handler.                                                                                                                                                                                                                                                                    | Preserve through later cycles.                                                                                                                       |
| SI-024 | P1       | Lead magnet email / Sequencer fulfillment         | verified   | Independent durable channel states, attempts, clocks, leases, stable provider keys, credential-free fingerprints, bounded recovery, unsubscribe fencing, and truthful UI states are deployed. D1 migration 0003 and live column proof pass.                                                                                                                                                                                       | Restore the approved Sequencer secret and observe recovered enrollment without changing code.                                                        |
| SI-025 | P1       | External reviewer invitation delivery             | verified   | Invitation payloads, attempts, leases, provider outcomes, expiry cleanup, recipient changes, and bearer revocation are durable and fenced. Background sends own their database handle, and reviewer email changes invalidate every old token.                                                                                                                                                                                     | Preserve through later cycles.                                                                                                                       |
| SI-026 | P1       | Report export / R2 and database idempotency       | verified   | Entity-scoped attempt UUIDs, pending-first rows, deterministic objects, atomic rollforward balances, fair recovery, and durable ready effects are deployed through migrations 0082, 0087, and 0088.                                                                                                                                                                                                                               | Preserve through later cycles.                                                                                                                       |
| SI-027 | P2       | Compliance report / R2 compensation               | verified   | Generic, SEFA, acknowledgment, and year-end paths now use awaited fenced compensation, response-loss reconciliation, active-entity sources, specialized stale cleanup, and durable success effects.                                                                                                                                                                                                                               | Preserve through later cycles.                                                                                                                       |
| SI-028 | P1       | Stripe webhook state ordering                     | verified   | Canonical subscription lookup, strict customer ownership, monotonic watermark tuples, generation CAS, and current-subscription invoice guards pass exhaustive race tests and are deployed through migrations 0080 and 0083.                                                                                                                                                                                                       | Restore approved Stripe bindings before guarded signed-webhook/Checkout live proof.                                                                  |
| SI-029 | P2       | Stripe trial-ending delivery recovery             | verified   | Deadline-scoped intents, immutable Resend requests, single-writer leases, organization claim tokens, recipient fencing, durable analytics, and deploy-skew migration 0090 are deployed.                                                                                                                                                                                                                                           | Restore approved Stripe bindings and observe a real provider-driven deadline lifecycle.                                                              |
| SI-030 | P1       | Production provider secret inventory              | reproduced | The deployed secret audit confirms Google OAuth, AI-CS handshake/context, and Sequencer secrets are absent in addition to Stripe. These paths are unavailable or silently disabled even though production selects real integrations.                                                                                                                                                                                              | Restore values from an approved secret source, rerun strict audit, and live-prove each provider boundary without exposing secret material.           |

## Run Log

### 2026-07-11 - Baseline

- `git pull`: already up to date; local `master` ahead of `origin/master` by two.
- `pnpm install --frozen-lockfile`: passed after the offline attempt identified
  nine missing public tarballs.
- Delegated inventory: completed across API/provider, route/component, and
  cross-system surfaces.
- Targeted API integration tests from the delegated pass: 157 passed; the
  candidate post-success failure windows are not covered.
- `pnpm test`: failed in web/UI worker orchestration with
  `ERR_IPC_CHANNEL_CLOSED`; this is baseline evidence, not a product-test
  assertion failure.

### 2026-07-11 - Cycle 1 red-green evidence

- Canonical URL contracts failed first in shared, site, API, and web packages.
- Added shared `buildAppUrl`/`normalizeAppPath`, used it across marketing
  knowledge, site login/signup producers, API emails/portal links, AI-CS, and
  internal billing CTAs.
- Targeted green evidence: shared 24 tests; site URL/config 47 tests; API 307
  tests; web route contracts 15 tests; UI login resolver 9 tests.
- Typecheck passed for shared, API, web, and site (site reported six existing
  Astro hints and no errors).
- Harness contracts passed 12 tests. Local discovery excludes production and
  helper specs; production suites are explicitly named and inventoried.
- Browser red: `/signup/` escaped the local stack to production because the
  bridge ignored `PUBLIC_APP_URL`.
- Browser green: marketing Sign in and the signup bridge both landed on the
  configured local `/app` routes and rendered their expected screens (2/2).

### 2026-07-11 - Cycle 1 independent review and fixes

- Independent review reported four actionable findings; none were deferred.
- Added the missing site-base edge test and fixed `/app/app` duplication.
- Replaced both runbook stress globs with `pnpm e2e:prod:stress`, backed by the
  authoritative inventory and a package/runbook contract.
- Strengthened every stress-script contract to require a live mutation guard
  invocation, not merely an import.
- Corrected the stale content guard to reject production root app-domain signup
  URLs while accepting the canonical `/app/signup` route.
- Review-fix proof: 82 site tests and four stress runner/membership tests pass.
- Full serial typecheck passed all six packages. Full serial lint passed with
  one existing TanStack Table compatibility warning and no errors.
- The first full serial test run passed 5,328 of 5,329 web tests and reproduced
  SI-016 at `build-output.test.ts`. The build-first orchestration contract failed
  before implementation and passed afterward.
- Final root `pnpm test` passed all six package tasks after a production web
  build, including 5,329 web tests and 3,297 UI tests.
- Final root `pnpm test:coverage` passed all six package coverage tasks in
  21m50s with the web build prerequisite and serial package execution.
- Final independent review reported no findings. The combined harness suite
  passed 21 tests across seven contract files, and `git diff --check` passed.

### 2026-07-11 - Cycle 1 release closeout

- Committed as `ec99d3f20`, fast-forwarded to `master`, deleted the feature
  branch, and removed the isolated worktree plus its verified generated residue.
- Production deployments succeeded: API
  `39ad7bea-4ef9-46e3-8b16-4672cf63fe6b`, web
  `2d54e70b-3cc6-4585-adfc-c2588f718758`, and site
  `9d2ae4b0-967f-477d-90d7-c5ee61aa4856` are each at 100% traffic.
- Live HTTP proof: marketing home, `/app/login`, `/app/signup`, and API health
  returned 200; `/signup/` returned 301 to the canonical
  `https://app.grantpipe.com/app/signup`; health returned `{ "status": "ok" }`.
- Live browser proof: marketing Sign in landed on `/app/login` with the
  `Welcome back` heading; the signup bridge landed on `/app/signup` with the
  `Start a 1-month GrantPipe trial` heading; both checks had zero console errors.

### 2026-07-11 - Cycle 2 QuickBooks truth reconciliation

- Three independent delegated traces converged on the same product truth:
  external accounting sync is unavailable on every plan, the API and app are
  intentional tombstones, and QuickBooks CSV/opening-balance import is a
  separate supported migration path.
- Production inventory found no QBO secrets, accounting queue binding, or
  accounting queue dispatch. Focused retirement contracts failed before the
  cleanup and now pass across API, web, shared, stress, and documentation.
- Removed the unreachable OAuth/sync service, queue processor, web hooks,
  integration validators, analytics constants, and environment bindings while
  preserving database history and the explicit 410 routes.
- Replaced the obsolete positive-path production stress scenario with an
  authenticated unavailable-state proof that checks every endpoint, the app
  tombstone, and the absence of connect/sync controls.
- The first public-copy contract covered only 12 named files. An independent
  re-audit found more drift, so the gate now discovers all active site pages,
  marketing knowledge, and brochure HTML recursively. All 1,632 cases pass.
- Required copy review used humanizer judgment first, then the third-grade
  evaluator. The core no-connector FAQ scored grade 2.0 with no findings; the
  rewritten ledger-boundary blocks also passed after sentence simplification.
- A compile-time red test reproduced the plan-recommendation type leak for the
  unavailable feature. The narrowed type and 90 pricing tests now pass.
- Independent review found stale tracked PDFs, newer contradictory June plans,
  a malformed proof metric, and missing live-report metadata. All findings were
  fixed with red-green contracts. Both regenerated PDFs pass text extraction
  and visual checks on the affected pages with no clipping or overlap.
- The review follow-up caught the assembled phrase `0 entries in journal
entries written back`. A full-phrase regression failed first; the corrected
  `0 entries written back to QuickBooks` copy passes the required humanizer and
  third-grade checks. The final independent review reported no findings.
- Final focused proof: 12 retirement/stress tests and 1,634 site claim/metadata
  cases passed. `git diff --check`, all six typecheck tasks, and all lint tasks
  passed; lint retained one pre-existing TanStack compiler warning.
- Final root `pnpm test` passed all six package tasks, including 5,311 web tests
  and 3,518 site tests. Final root `pnpm test:coverage` passed all six coverage
  tasks in 21m36s.

### 2026-07-11 - Cycle 3 accounting integration stress gate

- The production stress artifact reproduced SI-019: a reusable org with native
  accounting disabled renders the route-specific parent gate, which prevents
  the nested integration route from rendering its own heading.
- A source contract failed first because the harness accepted only the nested
  QuickBooks tombstone and treated the suppressed child page heading as route
  proof.
- The harness now accepts either truthful unavailable heading and verifies the
  canonical integration URL separately. It still requires every integration
  endpoint to return its exact HTTP 410/error code and fails if connect or sync
  controls appear. All six focused stress tests pass.

### 2026-07-11 - Cycle 3 auth rate-limit concurrency

- A deterministic microtask barrier reproduced SI-010: all 20 concurrent
  sign-in checks read the same empty KV value, all passed a limit of 10, and
  each wrote `1`.
- Cloudflare documents KV as unsuitable for atomic read/write transactions. The
  production auth boundary now routes through a SQLite-backed Durable Object
  transaction, while local development retains a serialized in-memory fallback.
- Storage/coordinator failure remains fail-open so an infrastructure fault does
  not take down public authentication. The newly observable swallowed failure
  is captured in Sentry without IP addresses or other sensitive request data.
- A missing Durable Object binding in protected real mode also fails open, but
  now emits one privacy-safe configuration event per Worker isolate instead of
  silently degrading or flooding Sentry on every sign-in request.
- Each per-counter object schedules expiry cleanup. Its alarm deletes expired
  state and reschedules instead if a new window won the boundary race.
- Focused proof passes 23 tests with 100% statements, lines, and functions and
  98.41% branches for `auth-rate-limit.ts`. API typecheck, focused app route
  tests, lint, and Wrangler's production binding/migration dry-run pass.

### 2026-07-11 - Cycle 3 SI-007 award intake persistence ordering

- Deterministic reproduction: the first usage-event insert failed after queue
  acceptance; retrying created `ext-2`, while both `ext-1` and `ext-2` had
  already been accepted by the queue.
- Follow-up red proof reproduced the remaining ambiguity window: a queue send
  that accepted the message and then threw caused the persisted extraction to
  be marked failed and its usage event removed. A client retry then created a
  second accepted logical extraction.
- Extraction creation and its usage event now commit in one transaction before
  dispatch, protected by a required privacy-safe per-org attempt UUID and a
  partial unique index. The creator alone queues work, records the creation
  audit event, and emits started analytics. Concurrent or idempotent callers
  return the winning row without repeating those effects; the consumer still
  atomically claims only pending or stale-processing work.
- Queue send errors are treated as delivery-ambiguous: the row stays pending
  and metered, Sentry records only the org and recovery step, and the scheduled
  `award-intake.dispatch` job retries persisted pending rows. Definite
  non-acceptance and accepted-then-throw therefore share the same recoverable
  path without destructive compensation.
- The award-intake entry keeps both the uploaded document ID and attempt UUID
  across a client retry, preventing a second logical extraction even if the
  first HTTP response is lost. The HTTP contract now rejects missing attempt
  IDs, so cached pre-release tabs fail safely with 400 instead of creating a
  second extraction across the API cutover. Migration 0079 keeps the database
  column nullable only for existing rows while enforcing uniqueness for all new
  keyed requests.
- Focused coverage passes 63 API service/route assertions, 199 web assertions,
  and 11 shared assertions. The extraction service is 99.17% statements /
  95.3% branches, routes are 100% / 97.36%, and the shared validator is 100%.
  API, web, and shared typechecks pass.

### 2026-07-11 - Cycle 3 SI-008 trial email delivery idempotency

- Two-tick red proof: Resend accepted the first request, the `sentAt` write
  failed, and the next tick delivered the same scheduled email again.
- Trial lifecycle requests now send `Idempotency-Key: trial-email/<scheduleId>`.
  The schedule row ID is stable across cron retries and contains no recipient
  email or message content. Resend documents a 256-character maximum and a
  24-hour idempotency window for this API header.
- The same two-tick provider simulation now receives two requests with one key
  and records one delivery. The cron dispatcher can retry transient persistence
  errors immediately and keeps its existing terminal Sentry capture path.
- The schedule row now persists `delivery_in_progress:<timestamp>` before the
  provider call. Retries reuse the stable key only inside a conservative
  23-hour window; older uncertain outcomes are quarantined as
  `delivery_ambiguous` with privacy-safe Sentry capture instead of risking a
  duplicate after Resend's 24-hour dedupe record expires.
- Focused tests passed 128 assertions. `service.ts` reached 100% statements and
  96.92% branches; integrated `app.ts` coverage reached 97.4% statements and
  95.65% branches, including the SI-010 Durable Object route.

### 2026-07-11 - Cycle 3 SI-009 donor mail-merge persistence

- Red proof: Resend accepted the first recipient, its communication transaction
  failed, the second recipient was never attempted, and retry sent the first
  recipient again.
- The UI keeps one UUID attempt ID while a matching recipient/subject/body send
  is incomplete, including transport failures and partial recipient failures.
  It rotates the ID after full success or when the message changes. The shared
  and API boundary requires the ID; stale cached clients receive a controlled
  400 before any provider or database delivery work.
- Before calling Resend, the API atomically claims a durable recipient delivery
  row. `sent` rows return success without another provider call. Active
  `sending` or `ambiguous` rows hold a five-minute lease. After the lease, the
  API retries the same provider key only inside a conservative 23-hour window;
  older uncertain sends move to durable `quarantined` state and require manual
  reconciliation. Definite HTTP rejections move to `failed` and remain
  retryable.
- Migration 0079 adds the delivery state table, provider message ID, nullable
  `mail_merge_attempt_id`, and uniqueness indexes. It also contains Cycle 3's
  document-extraction dispatch ID, so its generated SQL/journal tag is named
  `0079_integration_delivery_idempotency`; `0079_snapshot.json` is generated.
- Claim, provider, and persistence errors are captured in Sentry without donor
  email or message content and remain recipient-local. If failure-state storage
  itself fails, the row stays `sending`, safely suppressing retry and requiring
  reconciliation. Claim and outcome transitions compare the status and claim
  timestamp, so a late ambiguous result cannot overwrite concurrent `sent`.
  Later donors continue.
- Deployment order: apply migration 0079, deploy API, then deploy web. Tabs
  opened before the web deploy receive a controlled 400 and must refresh; this
  is intentionally safer than letting the old API strip the new attempt ID and
  deliver without the durable idempotency state.
- Focused proof: API mail-merge service 21 tests and donor routes 66, web
  donor-email UI 15, shared
  validator 119, DB schema 2, and migration metadata 21. Service coverage is
  99.75% statements, 100% functions, and 95.70% branches.

### 2026-07-11 - Cycle 3 Stripe checkout and production configuration

- Stripe's current API contract caches the first result for an idempotency key
  and returns it for later requests, while Checkout recommends a new Session
  for every payment attempt. The deterministic org/plan/cycle/promo key
  therefore aliased separate cancel, completed, and expired attempts for at
  least the key-retention window.
- Red tests proved that two logical attempts emitted the same key. Checkout now
  generates a UUID in the web mutation, validates and passes it through the API,
  and uses it as the provider idempotency boundary. A failed retry of the same
  serialized payload keeps the UUID, payload changes rotate it, and successful
  Checkout URL creation clears it so cancel/back starts a new attempt.
- The UUID is required at both the HTTP validator and internal billing-provider
  type boundary. During deployment, cached old clients can receive HTTP 400
  until the new web bundle loads; Checkout is already unavailable until the
  eight missing production bindings are restored, so API and web can be
  deployed before operational restoration without creating a payment window.
- Read-only production evidence reproduced SI-020. Cloudflare's production
  vars and secret inventory contain neither Stripe secret and none of the six
  required Stripe price bindings, while the production Worker explicitly
  selects real integrations. All expected organization billing
  columns exist and the reusable account has a valid trial row with no Stripe
  identifiers, ruling out schema and account-data causes.
- Real-mode billing summaries now remain DB-readable when Stripe is
  unconfigured. Checkout requires its API key plus all six prices; portal
  requires its API key. Both fail closed with a structured
  `billing_unavailable` 503, and both failure boundaries emit
  privacy-safe error capture without checkout URLs, Stripe IDs, or secrets.
- Focused verification passed 288 API assertions, 19 shared-validator
  assertions, and 27 web-hook assertions. Every touched implementation file
  exceeded the 95% per-file gate: API branches were 95.4%-100%, the shared
  validator was 100%, and the web hook reached 95.89% branches with 100%
  statements, functions, and lines. Focused ESLint and `git diff --check`
  also passed.

### 2026-07-11 - Cycle 3 Turnstile configuration boundary

- Read-only production inventory contradicted the suspected live omission:
  `TURNSTILE_SECRET_KEY` is present. No remote configuration was changed.
- A red unit proof showed that real mode returned success when its secret was
  absent; a second red proof covered a production environment with a missing
  integration-mode flag. Either boundary now fails closed through the existing
  `Verification failed` 403 UX on both public lead and feedback forms.
- Mock/local mode retains the intentional missing-secret bypass. A real-mode
  configuration failure emits a Sentry background event tagged only with
  `missing_secret_protected_environment`; the challenge token and remote IP are
  not captured.
- The invalid-token `success: false` path remains a controlled 403 with no
  downstream lead upsert or feedback email. The focused Turnstile suite passes
  all 100 tests across the library and both route boundaries; `turnstile.ts`
  reaches 100% statements, branches, functions, and lines.

### 2026-07-11 - Cycle 3 pre-release closeout

- An independent settled-diff review found no remaining issues after the award
  intake and donor delivery follow-up fixes. The reviewer made no edits.
- Full repository typecheck, lint, test, and coverage gates pass across all six
  packages. The coverage run completed in 16 minutes 34 seconds.
- Every touched implementation file meets the 95% per-file requirement for
  statements, branches, functions, and lines. The lowest touched-file branch
  result is 95.3% in document extraction dispatch; all other touched-file
  branch results are at least 95.4%.
- `git diff --check` passes. The only full-suite diagnostics are existing
  dependency/config warnings, including the unavailable local private-registry
  token and existing UI dialog-description warnings; neither is introduced by
  this cycle.
- Production Stripe restoration remains an external configuration blocker:
  the Worker is missing both Stripe secrets and all six price bindings. No
  secret or price value was invented, copied, or changed during this cycle.

### 2026-07-11 - Cycle 3 release closeout

- Committed and merged as `c7d203a59` after migration 0079 was applied.
- Production deployments succeeded: API
  `1ae11301-6b78-4758-8dc1-a16dd928162d` and web
  `9c64eae5-9011-45c8-997d-f21b6c429536`; the site remained on the unchanged
  `845405ca-d9c0-48d5-82f9-6336c38d348a` deployment.
- The isolated Cycle 3 worktree was removed. A Windows junction traversal
  briefly exposed root worktree deletions during cleanup; every tracked file
  was restored and the root worktree was verified clean before Cycle 4 began.

### 2026-07-11 - Cycle 4 integration durability sweep

- Reproduced SI-021 through SI-029 across public concurrency, single-use
  Turnstile challenges, unbounded JSON parsing, lead/reviewer delivery,
  report persistence, R2 compensation, Stripe ordering, and trial lifecycle
  delivery. The cycle also found follow-on races at the same boundaries during
  repeated independent review.
- Public rate limiting now uses transactional Durable Object counters with
  HMAC-derived identities. Public JSON endpoints stream-limit actual bytes
  before verification, parsing, rate limiting, or persistence. Turnstile-gated
  forms reset transmitted tokens and recover from transient script failures.
- Lead magnet email and Sequencer enrollment use independent durable attempts,
  clocks, leases, request fingerprints, provider keys, bounded recovery, and
  truthful queued/ambiguous/sent UI states. Provider credentials are excluded
  from fingerprints, pre-provider outages do not consume delivery clocks, and
  permanent provider failures cannot create unbounded fresh-key retries.
- External reviewer invitations use durable exact-payload delivery state,
  dedicated background database handles, claim-lease fencing, expiry cleanup,
  recipient-change invalidation, and bearer-token revocation. Reviewer email
  changes cannot leave a valid old-address portal link.
- Report exports now require explicit attempt UUIDs, bind identity to active
  entity, persist pending rows before deterministic R2 writes, atomically
  finalize rollforward balances, and recover stale work with fair bounded
  concurrency. Durable ready effects replay activity, analytics, trial usage,
  and recovery telemetry with deterministic identities.
- Compliance, SEFA, acknowledgment, and donor year-end artifacts use
  pending-first transitions, active-entity source queries, fenced compensation,
  response-loss reconciliation, specialized stale cleanup, and durable success
  effects. Storage cleanup never deletes an artifact after a concurrent ready
  transition.
- Stripe webhook state uses canonical subscription lookups, customer and
  subscription ownership checks, monotonic event watermarks, exact generation
  CAS, current-subscription invoice fences, and retryable pre-audit failures.
  Trial wrapup delivery uses deadline-scoped intents, exact request snapshots,
  single-writer delivery and organization claim tokens, and provider-specific
  idempotency handling. Migrations 0080 through 0090 cover the durable state.
- Required user-facing copy review ran humanizer first and the third-grade
  evaluator second. New delivery-state copy passed at grades between 0.6 and
  3.2; no fabricated claims, proof, prices, or guarantees were introduced.

### 2026-07-11 - Cycle 4 pre-release closeout

- Twenty fresh independent review passes were run after successive fixes. The
  final pass reported zero new actionable findings across billing/trial,
  reports/compliance, and delivery/public scopes. No review finding was
  deferred.
- Full forced serial typecheck passed all six packages after clearing an
  inherited Node inspector option that conflicted on port 9229. Full serial
  lint passed with one existing TanStack Table compatibility warning.
- Root `pnpm test` passed all six packages in 20 minutes 4 seconds. Root
  `pnpm test:coverage` passed all six packages in 21 minutes 13 seconds and
  enforced the 95% per-file coverage requirement.
- Every changed file passes Prettier and `git diff --check`. Repository-wide
  Prettier still identifies 37 unrelated baseline files; they were not rewritten
  as part of this integration cycle.
- Wrangler's production API dry-run succeeded with the expected Durable Object,
  D1, Queue, Hyperdrive, R2, Browser, and environment bindings.
- Production provider configuration remains incomplete: Google OAuth, Stripe
  secrets and price IDs, and the Sequencer secret still require approved source
  values. Code paths fail safely or remain recoverable; no value was invented or
  exposed by this cycle.

### 2026-07-12 - Cycle 4 release closeout

- Committed and fast-forwarded to `master` as `aab46cc7f`. The isolated
  worktree and feature branch were removed after deleting only the exact
  verified generated `node_modules` directory; root remained clean throughout.
- PostgreSQL migrations 0080 through 0090 applied successfully. D1 migration
  `0003_lead_magnet_delivery_state.sql` applied successfully to `grantpipe-db`.
- Production deployments succeeded at 100% traffic: API
  `d9dd46da-731a-430d-a1b0-9d0b6439ac4d`, web
  `ef45e3c5-ba2f-46be-8cdc-491df568d408`, and site
  `89036acd-4e0d-4325-a0e9-6e18be01419e`.
- Live HTTP proof: API health, app login, marketing home, and a public lead
  resource returned 200; health returned the expected status payload. An
  oversized Better Auth JSON request returned 413. An invalid Turnstile public
  feedback request returned 403. A synthetic `.invalid` sign-in identity
  received ten controlled 401 responses followed by 429 on attempts 11 and 12.
- The deployed site references both updated delivery-state bundles. Remote D1
  schema proof confirms independent email/Sequencer claimed-at and
  attempt-started-at columns plus `email_only`.
- The deploy audit still flags missing Stripe secrets and six price IDs plus
  `SEQUENCER_CLIENT_SECRET`. Optional download/unsubscribe secrets use the
  documented Better Auth secret fallback. No missing value was fabricated or
  printed.
- Cycle 4 found bugs and therefore does not count as a clean hunt cycle. The
  consecutive-clean-cycle counter remains zero; Cycle 5 starts from this
  released production state.

### 2026-07-12 - Cycle 5 pre-release

- Concurrent quota proof reproduced an AI monthly-usage race. Atomic usage
  reservation now prevents parallel requests from exceeding the monthly limit.
- Donor mail merge now binds retries to the original request snapshot and
  idempotency identity. Request drift is rejected, while transient provider
  ambiguity remains recoverable without silently changing the message.
- Better Auth signup now passes through the public authentication throttle, so
  account creation cannot bypass the shared rate-limit boundary.
- Accounting anomaly reads, scheduled scans, and notifications are isolated to
  the active entity and exclude archived records. Alert emails carry an
  entity-aware deep link; the web route validates membership before switching,
  and a failed TanStack session refetch propagates into rollback instead of
  loading a cross-entity feed.
- External reviewer portal exchange is now truly one-time. The exchanged token
  cannot be replayed, the scoped cookie owns the session, and browser history no
  longer retains a reusable bearer credential.
- Public lead responses no longer expose an enumeration oracle for existing
  email addresses.
- The Turnstile resend test harness now waits for the actual widget callback and
  widget creation instead of racing a passive effect. The synchronized test
  passed 20 consecutive isolated runs without sleeps.
- Independent review findings were fixed and the final review reported no
  remaining actionable issue. Full coverage passed 810 files and 19,658 tests;
  forced serial typecheck, full lint, changed-file Prettier, `git diff --check`,
  and the production API Wrangler dry-run are green.
- Final root `pnpm test` passed the exact tree with exit 0: all six packages,
  810 files, and 19,658 tests completed in 18m16.3s. The previously flaky
  Turnstile test passed. Cycle 5 is still not released or deployed, and this
  entry makes no production-verification claim.
- Cycle 5 found bugs, so it is not a clean hunt cycle. The clean-cycle counter
  remains zero.

### 2026-07-12 - Cycle 5 release closeout

- Cycle 5 merged to `master` as `6574f418b`. PostgreSQL migrations 0091 and
  0092 applied successfully.
- Production deployments succeeded: API
  `cad3cc4c-c211-40dd-8596-da00b9b54d20`, web
  `eb797182-6a2b-4181-b017-27a370bbc3f3`, and site
  `4e5cd49a-992b-45a5-b34c-4f4fc6ae5c87`. The site build produced 1,295
  sitemap `lastmod` entries and synchronized and verified 117 R2 PDFs.
- Live HTTP proof returned 200 for API health, the app, and the marketing site.
  The public lead honeypot returned the exact generic `{"ok":true}`
  response, an invalid Turnstile request returned 403, and an oversized Better
  Auth request returned 413.
- Live authentication throttling proof returned ten controlled 401 responses
  followed by two 429 responses for sign-in. Invalid-password sign-up proof
  returned five controlled 400 responses followed by two 429 responses.
- Live bundles contain the generic eligible lead copy without
  `alreadySubscribed` or `deliveryState`, use history replacement for portal
  exchange, and include the anomaly `entityId` deep link plus denied-state copy.
- Production schema proof confirms `donor_mail_merge_deliveries` has
  `request_fingerprint` as `text` and `request_snapshot` as `jsonb`, and
  `notifications.active_entity_id` is `text`.
- The production feature audit still reports both Stripe secrets, all six
  Stripe price bindings, and `SEQUENCER_CLIENT_SECRET` as missing. Optional
  download and unsubscribe fallback secrets are also absent; their documented
  Better Auth fallback remains in effect. No missing value was fabricated or
  printed.
- Cycle 5 found bugs and therefore does not count as a clean hunt cycle. The
  clean-cycle counter remains zero.

### 2026-07-12 - Cycle 6 RELEASED

- Seven original integration findings were reproduced and fixed with regression
  coverage:
  1. Stripe webhook ingestion now enforces its body-size cap before buffering or
     signature verification, including requests without a declared content
     length.
  2. External-reviewer portal resources are session-scoped and purged across
     reviewer exchange and logout. A pending or failed exchange cannot render
     the previous reviewer. Public reviewer, session, and scope responses use
     explicit allowlisted DTOs, and portal view audits are durably awaited.
  3. Scheduled notification emails now use a shared durable outbox with leases,
     stable provider identities, bounded recovery, and systemic replay across
     reminder, lapse, pledge, anomaly, and sentinel jobs.
  4. Document extraction attempts bind retries to a privacy-safe request
     fingerprint and stage the provider result before database finalization, so
     post-provider persistence failures remain recoverable.
  5. Extraction fingerprints now use canonical JSONB serialization, preventing
     semantically identical structured inputs from producing different attempt
     identities because of object-key order.
  6. Public notification responses now use an explicit DTO and do not expose
     delivery, provider, retry, or other internal persistence fields.
  7. Extraction workers use fenced claim tokens and a persisted winner. The web
     client follows the winning row and shows a truthful `provider_result_pending`
     state while a staged provider result awaits recovery.
- Independent review found and fixed a scope-layering regression introduced by
  the public DTO hardening. `listScopes()` again preserves enriched internal and
  authenticated-admin fields, including `grantedBy` and `grantedAt`; only public
  `/auth` and `/me` responses project through the allowlisted scope DTO. The
  final independent reviews reported no remaining actionable findings.
- Full root test and coverage gates pass across all six packages: 812 files and
  19,695 tests. Touched implementation files meet the 95% per-file coverage
  requirement.
- Forced serial typecheck passed all six packages after clearing `NODE_OPTIONS`.
  Forced full lint, changed-maintained-file Prettier, the added-line forbidden
  token scan, and `git diff --check` are green. Wrangler's production API
  dry-run also succeeded with the expected Durable Object, KV, Queue, D1,
  Hyperdrive, R2, Browser, version metadata, and production environment
  bindings.
- Cycle 6 merged to `master` as `713bc4b8b`. PostgreSQL migrations 0093 and
  0094 applied successfully.
- Production deployments succeeded: API
  `06aac363-06c6-44c2-91e3-aca0ae25fc0b`, web
  `a46264b0-2d8d-44f3-858c-97370f0f4bc7`, and site
  `83897be4-2e27-426b-ba36-f91f826461c0`. The full site pipeline completed,
  including the sitemap build and synchronization and verification of all 117
  R2 PDFs.
- Live HTTP proof returned 200 for API health, the app, and the marketing site.
  An invalid portal session returned 401. Oversized portal authentication and
  Stripe webhook requests both returned 413 before their handlers processed
  the bodies.
- The deployed web bundle contains the portal resource/session isolation,
  `provider_result_pending`, and history-replacement markers. Production
  PostgreSQL schema proof confirms all eight notification email outbox columns,
  `dispatch_request_fingerprint`, and `processing_claim_token`.
- The production feature-secret audit is unchanged: Stripe secrets and price
  bindings, `SEQUENCER_CLIENT_SECRET`, and the documented optional secrets
  remain missing. No missing value was fabricated, exposed, or changed during
  this release.
- Cycle 6 found bugs and therefore does not count as a clean hunt cycle. The
  consecutive-clean-cycle counter remains zero.

### 2026-07-12 - Cycle 7 final-review pre-release

- The final whole-branch review reproduced five follow-up gaps after the four
  scoped Cycle 7 task waves:
  1. Document create/delete activity writes omitted the selected entity, so a
     sibling parent's document event could be stored as a legacy null/default
     activity row.
  2. Deadline restriction ownership duplicated only part of the documents
     parent policy and treated payment requests, subawards, monitoring tasks,
     findings, and corrective actions as default-entity records.
  3. Opening-balance import retained a local `MAX + 1` journal allocator and a
     direct insert outside the conflict/retry helper.
  4. Dashboard recent activity and audit evidence required an exact entity ID,
     unlike activity list/count, so the default entity omitted legacy null
     rows.
  5. The journal helper modeled `onConflictDoNothing` as optional and silently
     fell back to an ordinary insert in incomplete test doubles.
- RED proof: the consolidated document/deadline/activity/overview run exited 1
  with four expected failures; the isolated opening-balance conflict test
  exited 1 at the direct `.returning()` call. Requiring the journal conflict
  handler then exposed 82 incomplete accounting test-double paths in the
  expanded focused run.
- GREEN fix: document activity now records `activeEntityId`; documents and
  deadlines share one complete polymorphic parent predicate; opening-balance
  import uses `insertJournalEntryWithNextNumber`; activity list/count and both
  dashboard activity consumers share one predicate; and the journal conflict
  builder is required with every focused double exercising it.
- Focused proof passed 301 accounting tests and 337 document, deadline,
  activity, overview, and import route/service tests. The focused coverage run
  passed 265 tests. All seven touched implementation files exceed 95% in every
  metric: the lowest branch result is 95.19% in import service; the journal,
  activity, and shared document-scope files are 100% in all four metrics.
- API typecheck, scoped ESLint, changed-file Prettier, forbidden-added-token
  scan, stale-allocator scan, and `git diff --check` pass. The reviewed fix is
  committed as `b5b2d6a07`.
- This is pre-release evidence only. Forced broad/root tests and coverage,
  final whole-cycle review, Wrangler dry-run, merge, migration assessment,
  deploy, and live production proof remain pending for the orchestrator. No
  deployment or production-verification claim is made here.

### 2026-07-12 - Cycle 7 broad pre-release verification

- The final whole-branch re-review of `dfa7e48f5..a32e4046c` reported no
  Critical, Important, or Minor findings and judged the branch ready to merge
  from code review. All prior document activity, polymorphic deadline,
  opening-balance allocator, dashboard activity, and journal-builder findings
  were confirmed fixed.
- Forced serial typecheck passed all six packages with exit 0 in 2m18.978s.
  Astro reported six existing inline-script hints and no errors or warnings.
- Forced full lint passed all six workspace packages with exit 0 in 1m38.298s.
  The only lint diagnostic was the existing non-error TanStack Table React
  Compiler warning in `packages/ui/src/components/data-table.tsx`.
- Prettier checked all 65 changed maintained files successfully. The refined
  added-line scan found no TypeScript `any`, TODO, FIXME, HACK, or
  `eslint-disable` additions, and `git diff --check` passed.
- Fresh root `pnpm test` with `NODE_OPTIONS` cleared passed all six Turbo tasks
  with exit 0 in 13m52.463s. The uncached API slice passed 187 files and 5,709
  tests; the web production build and analytics verification also passed.
- Fresh root `pnpm test:coverage` with `NODE_OPTIONS` cleared passed all six
  Turbo tasks with exit 0 in 15m28.671s. Repository coverage enforcement
  passed, including the documented legacy web baselines, and every Cycle 7
  touched implementation file retains at least 95% in every metric.
- `deploy:changed:dry-run --base dfa7e48f5 --head HEAD` selected exactly API
  and web. The production API Wrangler dry-run packaged successfully with the
  expected Durable Object, KV, Queue, D1, Hyperdrive, R2, Browser, version
  metadata, and production variables. The web Wrangler dry-run successfully
  read 57 built assets. No migration file changed, so no new Cycle 7 migration
  is expected.
- This remains pre-deploy evidence. Merge, worktree removal, API/web deployment,
  and live production proof are still required before Cycle 7 release closeout.
  Cycle 7 found bugs, so the consecutive-clean counter remains zero.

### 2026-07-12 - Cycle 7 RELEASED

- Cycle 7 merged to `master` through `7135f0d74`. Its isolated worktree and
  feature branch were removed while preserving the unrelated automatic
  lint-staged stash and all other registered worktrees.
- The release deployed API version `2e7dd127-fb21-4c52-9c45-30f88f40195b`
  and web version `b808fb5f-3c4d-4a3b-8195-7c8dc7861afd`. PostgreSQL and D1
  reported no new migrations to apply.
- Live HTTP proof returned 200 for the API health route, authenticated app, and
  marketing site. The deployed web bundle carried release `7135f0d74` and the
  Cycle 7 local-date behavior.
- Authenticated production proof then exposed a release-blocking dashboard 500
  caused by Drizzle rewriting relational raw-SQL aliases in the shared activity
  scope and nested grant/fund allocation predicates. The defect was reproduced
  with a read-only production query, fixed test-first with stable SQL
  identifiers, and independently reviewed with no remaining findings.
- The hotfix merged to `master` through `5125660ac`. API typecheck, lint, and
  the full API test suite passed on the exact integrated tree. Production API
  version `a02139a8-ab20-44d7-9ea8-ff835d8270e6` then deployed successfully;
  migrations again reported no work.
- Post-deploy proof returned 200 from API health and from a fresh authenticated
  `/api/overview/dashboard` request. The dashboard rendered its complete
  actions, pipeline, grant health, and recent-activity surfaces with zero new
  console errors.
- The production feature-secret audit is unchanged: Stripe secrets and all six
  price bindings, `SEQUENCER_CLIENT_SECRET`, and the documented optional
  fallback secrets remain missing. No missing value was fabricated, exposed,
  or changed.
- Cycle 7 found bugs, including one during live release proof, and therefore is
  not a clean hunt cycle. The consecutive-clean-cycle counter remains zero;
  Cycle 8 starts from hotfixed production version
  `a02139a8-ab20-44d7-9ea8-ff835d8270e6`.

### 2026-07-12 - Cycle 8 RELEASED

- Cycle 8 reproduced and fixed active-entity isolation defects across grant
  payment requests and pledges, including sibling-entity reads/mutations,
  cross-org or deleted pledge references, and concurrent pledge payment/write-
  off accounting races. Stable SQL aliases and real Drizzle compilation tests
  protect the derived ownership predicates.
- External-reviewer metadata now uses explicit public DTOs and `private,
no-store` caching. Internal storage, actor, recovery, provider, and free-form
  persistence fields are no longer serialized through portal metadata routes.
- Activity end-date filtering, entity-switch rollback, and accounting anomaly
  deep links were repaired. Exact fund, grant, and donation destinations now
  locate the referenced child record; the grant restriction and pipeline
  routes are lazy-loaded and keep the initial entry below its unchanged byte
  budget.
- Independent task, cross-wave, final-branch, and post-merge reviews found and
  fixed all Critical and Important findings. The final review of
  `dd934bc21` reported no remaining blocker.
- On the exact integrated tree, all-package typecheck and lint passed. Direct
  shared, site, and web production builds passed, including the Turnstile
  guard, 117 lead-magnet PDFs, analytics validation, and Sentry source maps.
  Root tests passed all six tasks; the web slice passed 230 files and 5,542
  tests. Full coverage passed all six tasks and repository per-file
  enforcement.
- Cycle 8 fast-forwarded to `master` at `dd934bc21` and was pushed to
  `origin/master`. PostgreSQL and D1 reported no pending migrations.
- Production deployments succeeded: API
  `2997fb2e-877e-4da1-9fce-0e716797b217` and web
  `fe9237aa-2510-4704-a7af-fd3336d52ad5`.
- Live proof returned 200 for app, API health, marketing site, authenticated
  session, and dashboard. A clean authenticated dashboard reload produced zero
  console errors, and both new lazy route assets returned 200. The limited E2E
  account correctly received plan/permission denials for gated anomaly,
  payment, and pledge probes.
- The production secret audit remains unchanged: Stripe secrets and six price
  bindings, `SEQUENCER_CLIENT_SECRET`, and the documented optional fallback
  secrets remain missing. No missing value was fabricated, exposed, or
  changed.
- Cycle 8 found bugs and therefore does not count as a clean cycle. Per the
  user's closeout instruction, the continuing clean-cycle hunt stops here and
  the Cycle 8 branch/worktree are removed after this release record is merged.
