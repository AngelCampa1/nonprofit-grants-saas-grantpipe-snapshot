# Goal Ledger — Complete Analytics + Observability

**Goal (verbatim):** "track every single thing on posthog from every part of the system, be able to make
marketing, product, business decisions from the data and visualize it perfectly on dashboards. Also make
sure we're tracking errors properly and that errors are not falling through the cracks in sentry."

**Three pillars:** (1) complete PostHog event coverage across site/web/api, (2) decision-ready dashboards
(marketing/product/business), (3) airtight Sentry — no errors lost.

Each wave: worktree → TDD → 95% per-file coverage → review → fix → merge to master → remove worktree → deploy.

---

## Wave 1 — Sentry queue/auth cracks ✅ DONE (deployed `deb44f67`)

- captureQueueException + captureAuthServerError helpers (lib/sentry.ts), hardened (try/catch, path redaction).
- award-intake per-message capture (no double-capture of rethrown first error).
- accounting-sync permanent-4xx capture.
- Better Auth 5xx capture in app.ts.
- 3919 api tests green; touched files 100% coverage. Reviewed (opus) + fixes applied.

---

## Wave 2 — Sentry remaining cracks ✅ DONE

New helper: `captureBackgroundException(error, surface, tags?)` in lib/sentry.ts — try/catch-hardened
(never throws from a best-effort path), tags `{ surface, ...tags }`. 100% covered.

Blockers (real silent failures / data loss) — all wired:

- [x] recurringService.ts tickRecurring per-template catch → `captureBackgroundException(err, "accounting-recurring", {template_id, org_id})` (the whole-job wrapper already uses captureScheduledException; per-template needs its own capture so a single bad template is visible, not just a job-level error)
- [x] ai-cs/routes.ts persistEscalation catch → `captureBackgroundException(err, "ai-cs", {step:"escalation-persist"})`
- [x] lib/activity-log.ts recordActivityLogBestEffort catch → `captureBackgroundException(error, "activity-log", {action, entity_type})`

Majors — all wired:

- [x] leads/service.ts sequencer enroll/unsubscribe catches → `{step:"sequencer-enroll"|"sequencer-unsubscribe"}`
- [x] leads/service.ts step-0 nurture email non-config catches (both existing + resend) → `{step:"step-0-email"}` (config errors still rethrow first)
- [x] trial-expiry.ts runTrialExpiryTick analytics catch → `{step:"analytics"}`
- [x] paywall.ts requirePlanTier recordTrialFeatureUsage catch → `{step:"trial-feature-usage"}`

Minor / hygiene:

- [x] apps/site client Sentry.init — ALREADY PRESENT (base-layout.astro:157-163 calls `initSentry` from ui/site/lib/sentry-client.ts; PROD+DSN-gated, ignoreErrors/denyUrls configured). No crack — verified, not a gap.
- [x] Documented SENTRY_DSN (api secret + SENTRY_ENVIRONMENT/SENTRY_RELEASE vars), PUBLIC_SENTRY_DSN (site), VITE_SENTRY_DSN (web) in CLAUDE.md

Verify: 3922 api tests green; all 7 touched source files ≥95% per-file (most 100%; ai-cs/routes.ts 95.78% branch — pre-existing uncovered branches unrelated to this wave). typecheck clean.

## Wave 3 — PostHog server-side coverage ✅ DONE (merged `8fb15d49`, api deployed `cbfeefbb`)

17 server-side captures across 12 production files. TDD red→green, all touched files ≥95% per-file,
opus review verdict NONE (clean), full api gate 3974 tests + 0 coverage errors on merged master.

HIGH:

- [x] onboarding_completed — onboarding/routes.ts PATCH handler
- [x] signup_completed / signup_failed — lib/auth.ts databaseHooks.user.create.after (login_completed
      DEFERRED to Wave 4 — no server hook; needs client-side capture)
- [x] first_contact/grant/fund/import/report — count==1 guard; best-effort reads (.catch fallback, never
      alter HTTP status); isNull(deletedAt) on contacts/grants/funds, omitted on importHistory/generatedReports
- [x] accounting_enabled (org/routes.ts PATCH /settings) + accounting_integration_connect_started +
      ...\_sync_started — accounting-integrations/routes.ts
- [x] report_generated / first_report_generated / report_generation_failed — compliance/routes.ts (6 generate
      handlers wrapped; catch emits failure w/ failure_type=error.name then rethrows)
      MEDIUM:
- [x] calendar_event_created — events/routes.ts POST /
- [x] trial_ending_soon (new taxonomy event + dashboard tile) — billing/webhooks.ts handleSubscriptionTrialWillEnd (guarded once/org)
- [x] accounting_operation_failed — accounting/routes.ts 3 write handlers (bank_import/journal_entry_create/reconciliation_create)
- [x] lead_magnet_delivery_suppressed — leads/routes.ts suppression branch

## Wave 4 — PostHog client-side coverage ✅ DONE (merged `d5de90a1`, web deployed)

19 client-side captures across dashboard, 5 detail pages, 5 list pages, help, billing, password-reset, and
error-boundary surfaces. 4 new taxonomy keys (detail_tab_viewed, forgot_password_submitted,
password_reset_completed, error_boundary_triggered), all placed in dashboard tiles (governance + dashboard
guards green). Logic centralized in fully-tested helpers (record-discovery-analytics.ts) with thin route
one-liners; every touched file has a matching extended .test. TDD red→green, opus review verdict NONE (clean),
full web suite + shared suite green on merged master; build-output entry guard bumped 859_000 → 861_000
(combined entry 860,269 — Wave 202 base + Wave 4 instrumentation; no route leak).

HIGH:

- [x] dashboard interactions — dashboard.tsx view switch (record_view_changed) + QuickActionsCard quick
      actions (cta_clicked, source "dashboard_quick_actions")
- [x] cancellation_started — settings-billing-panel.tsx manage-subscription portal button
- [x] login_completed — already wired client-side (deferred from Wave 3, confirmed present)
- [ ] AI SDR 5 events (ai*sdr*\*) — DEFERRED: UI not yet built; wire when the AI SDR surface ships

MED:

- [x] detail-page tab navigation — 5 detail pages (donors/grants/funds/funders/payments) via captureDetailTabViewed
- [x] help_opened — help.tsx on mount
- [x] filter/search on funders/programs/payments/evidence-bundles/subrecipients lists — captureRecordFilterChanged
      (keys-only; text search on route-sync or onBlur to avoid per-keystroke spam)
- [x] password-reset funnel — forgot-password.tsx (forgot_password_submitted) + reset-password.tsx (password_reset_completed)
- [x] error-boundary PostHog event — error-boundary.tsx (error_boundary_triggered, component_stack_present only, no PII)

LOW (still open, optional polish): pipeline view, calendar_viewed, notifications interactions, portal audit
export, compare/pricing data-\* attributes, LP raw-string cleanup, hooks raw-string → ANALYTICS_EVENTS constants.

## Wave 5 — Dashboards ✅ DONE (merged `144604d0`, executive dashboard live in PostHog 390138)

Extended `scripts/posthog-dashboards.ts` (dashboards-as-code) with trends `sum`/`weekly_active`
math (sum guarded against a missing mathProperty) and a `RetentionQuery` insight kind, then added a
sixth dashboard **"GrantPipe - Executive Decisions"** (6 insights). Governance guard still proves
0 uncovered taxonomy events (dry-run: 6 dashboards, 33 insights, 256 events, 0 uncovered). 18 dashboard

- governance tests green on merged master.

The six executive insights (review-corrected for breakdown honesty):

- [x] Leads and signup starts by UTM source — trends, events `lead_created`+`signup_started`, breakdown
      `utm_source`. **Corrected:** dropped `signup_completed` (captured server-side without `utm_source`,
      would bucket "(empty)"); attribution stays on top-of-funnel events that carry the source.
- [x] Trial to paid conversion — funnel `trial_started`→`checkout_started`→`checkout_completed`→`subscription_started`
- [x] Subscription revenue trend — trends `sum(amount_cents)` on `subscription_started`, breakdown `billing_cycle`
- [x] AI SDR conversion funnel — funnel `ai_sdr_session_started`→`ai_sdr_draft_generated`→`ai_sdr_draft_sent`
- [x] Feature stickiness (weekly active users) — trends `weekly_active` over 6 core-creation events.
      **Corrected:** removed the `entity_type` breakdown (it included `report_generated`, which emits
      `report_type`, not `entity_type`); each event is now its own per-feature WAU series.
- [x] New org retention by signup cohort — first-time weekly retention, target `signup_completed`,
      returning `report_generated` (8 weekly intervals).

### IMPORTANT — script lineage ≠ live dashboards

`pnpm run posthog:dashboards --apply` was NOT runnable here: no `POSTHOG_PERSONAL_API_KEY` /
`POSTHOG_ENVIRONMENT_ID` in `.env`. The committed script is the version-controlled source of truth and
its dashboards (`GrantPipe - …`, hyphen) have **never** been `--applied` to the live project.

The live PostHog project 390138 already holds a **separate, hand/MCP-curated lineage** (6 dashboards,
`GrantPipe · …` middle-dot, tags `grantpipe,business-suite`, pinned, actively viewed; created 2026-06-09):
Acquisition & Marketing, Product Engagement, Activation & Onboarding, Retention, Revenue & Billing,
Reliability & Health. These are what the user actually views.

Wave 5 deploy: rather than `--apply` (which would duplicate the live set with a parallel hyphen lineage),
the one genuinely-missing **executive lens** was created live via the PostHog MCP to match the `·`
convention — dashboard **id 1711635** "GrantPipe · Executive Decisions" (pinned, tags
`grantpipe,business-suite,analytics-as-code`) with all 6 insights above (short_ids JOUurqWw, s9gPnZga,
xm1ah6Yw, wq0S5h3R, cZARkkmn, P0C24YLN). The script remains the code artifact; if the API key is ever
provisioned, reconcile the two lineages before running `--apply` to avoid duplicates.
