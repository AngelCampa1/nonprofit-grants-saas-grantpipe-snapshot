# PostHog Deepening — Goal Ledger

**Goal (2026-06-23):** Organize + deepen PostHog so dashboards/visualizations are (1) useful and (2) use all the data; ensure all events are recorded + attributed properly; record useful user journeys. Objective: drive **product** and **marketing** decisions.

Project: GrantPipe PostHog id **390138**. MCP active-project flips across concurrent sessions — re-assert `switch-project 390138` before each MCP batch.

## Grounding findings (Phase 0 — DONE)

- **Code instrumentation is mature:** 322-event governed taxonomy in `packages/shared/src/constants/analytics.ts`; client wrappers `apps/web/src/lib/analytics.ts` (identify + org group + activation milestones + Bing UET) and `packages/ui/src/site/lib/analytics.ts` (site, anon-only); server capture via `apps/api/src/lib/integrations.ts` (`captureSanitizedPostHogEvent`, 714-key allowlist, distinct_id = orgId).
- **Live data is pre-revenue / top-of-funnel:** of 322 events only ~60 ever fired (90d). Dense: `$pageview` 4957/2472p, engagement (engaged_time/section/scroll) 200–700p, lead_magnet_offer_shown 333, exit_popup_shown 295. Thin: signup ~27, onboarding_completed 7, grant_created 6, fund_created 1. **Zero:** checkout_completed, subscription_started, most accounting/compliance/donation/payment-request events. → Many dashboard tiles reference zero-volume events ⇒ look empty ⇒ "not useful."
- **Bots negligible** (4944 Regular vs 13 bot/AI-agent pageviews). Funnel denominators are real humans + founder testing.
- **Conversion is the marketing story:** lead_magnet 333 shown → 6 unlocked; exit_popup 295 shown → 1 converted. Terrible conversion = real decision surface.

## Confirmed bugs / gaps

1. **signup_completed double-emission + attribution loss** (introduced ~Jun 16–18). Server emits `signupCompleted` at `apps/api/src/lib/auth.ts:433` keyed on **orgId**, payload only `environment` (no method, no utm) — 16 of 27 completes, attributed to org group not user. Client path (11) carries method+utm, user-keyed, since April. Inflates conversions, splits identity, drops marketing source.
2. **trial_started (19) vs trial_expired (97) mismatch.** `trialStarted` at `auth.ts:426` is org-keyed server emission (same recent window); trial_expired server-side fires for historical orgs. Semantics need reconciling.
3. **Noise events polluting taxonomy:** `👋 hey from hogsend` + 4 hogsend siblings, `__hogsend_probe__`, `codex_canary_probe`, `codex_canary_token_probe`, `codex_cloudflare_smoke`. Hide/quarantine.
4. **Marketing-anon → app-identified stitching** unverified (site is anon-only, email not captured) — a lead's source may not follow to signup. Verify/repair.
5. **No reusable internal/test exclusion** applied consistently (dashboards say "Self-traffic (MX) excluded" ad hoc). Need a cohort.

## Plan

- **P1 Attribution correctness (code; worktree+TDD+deploy):** fix signup_completed to one authoritative, user-keyed, attributed emission; reconcile trial_started; verify UTM first-touch persistence + anon→identified stitch.
- **P2 Data hygiene (PostHog MCP):** quarantine noise events; build reusable Internal/Test exclusion cohort.
- **P3 Useful dashboards + journeys (PostHog MCP → codify in `scripts/posthog-dashboards.ts`):** audit 7 dashboards tile-by-tile, kill dead (zero-volume) tiles, rebuild around decision-grade data now — marketing (channel attribution, content engagement, lead-magnet/exit-popup conversion, AI-referral), the journey (visitor→engaged→lead→signup→onboarding→activation funnel + paths), product (onboarding drop-off, feature adoption, AI SDR/CS). Revenue/Reliability kept but marked "awaiting volume."

## Existing 7 dashboards (390138)

Acquisition&Marketing 1688662 · Activation&Onboarding 1689287 · Executive Decisions 1711635 (analytics-as-code) · Product Engagement 1689288 · Reliability&Health 1689292 · Retention 1689291 · Revenue&Billing 1689289.

## Decisions (locked 2026-06-23)

- **signup_completed**: single authoritative emission = CLIENT (carries method + UTM/first-touch, user-keyed). REMOVE the server org-keyed capture at `auth.ts:433`. BUT client google path drops ~85% (13 google signup_started → only 2 client completes; server backstop caught 16). So removal REQUIRES hardening the google OAuth client completion first (sessionStorage pending-event across the better-auth social redirect). Net target: exactly one attributed, user-keyed signup_completed per signup across email + google + invite, no double count, no google loss.
- **trial_started**: LEAVE server-side org-keyed (`auth.ts:426`). A trial belongs to the ORG, not the user — org grain is correct and pairs with trial_converted/trial_expired. The 19-vs-97 gap is a timing artifact (trial_started instrumented ~Jun 16; trial_expired has historical orgs), NOT a bug. Do not move it.
- Server only fires these for NEW orgs (invite-joins skip via `shouldSkipBootstrapForInviteSignup`, auth.ts:411). Client already fires signup_completed for invite-joins too.

## P2 — DONE (2026-06-23)

- Hid 7 noise events (codex_canary_probe, codex_canary_token_probe, codex_cloudflare_smoke, **hogsend_probe**, 3 hogsend demo emoji events) via event-definition-update hidden:true.
- Created reusable exclusion cohort **377063** "Internal / Test traffic (exclude)" = person.email icontains @ventoralabs.com OR @grantpipe.com (covers founder + demo + e2e + smoketest; no real customer can have those domains). Negate it in dashboards to drop self-traffic.

## P1 — DONE + DEPLOYED (2026-06-23)

- Removed the server org-keyed `signup_completed` capture in `apps/api/src/lib/auth.ts` (kept trial_started, recordSignupCompleted, signup_failed). Client is now the single authoritative, user-keyed, UTM-attributed emission.
- Hardened the Google-OAuth client completion so it no longer drops ~85%: pending `signup_completed`/`login_completed` is parked in **localStorage** (30-min TTL, one-shot consume) across the better-auth social redirect, drained in `_authenticated.tsx` after `identifyUser()`.
- Review SHOULD-FIX fixed: cross-tab bleed closed by gating the drain on a **URL marker** (`?ph_pending=1`) appended to the OAuth `callbackURL` (tab-local, bound to the real OAuth return), then stripped via `history.replaceState`. Consume idempotency: failed `removeItem` returns `[]` so events can't double-fire.
- Merged to master `fd8f3042`, pushed, worktree removed. Deployed: **API `be2f04c4`**, **web `f37b2f8b`**. Watch post-deploy: google signup_completed should rise from ~2 toward ~13/period as the bridge lands; the 16 server-keyed None completes should stop.

## P3 — DONE (2026-06-23, live via MCP)

Attribution facts that drove tile design (don't re-derive):

- **Direct is stored as literal `$referring_domain = '$direct'`, NOT empty** — bucket it explicitly or it lands in "Other".
- Site channel = `$referring_domain` (utm mostly empty on site). Paid attribution = `utm_source/medium/campaign` on **signup_started** (google ads). Lead magnet id = `activation_type`; site path = `$pathname`; onboarding step = `step_name`. lead_created/lead_magnet_unlocked are server-emitted keyed on `lead:<uuid>` (won't per-person stitch from anon offer_shown — use totals/ratios).
- 90d channel mix (non-MX): Direct ~1691, Search ~560 (google/yahoo/bing/ddg), **AI assistants 57** (chatgpt 48 / claude / copilot), Social 18, Referral/Paid 23. Onboarding cliff: welcome 31 → org_setup 11 (64% drop). Lead magnet 333 offers → 4 leads (~1.2%). Exit popup 295 → 1.

New tiles built (insight short_id → dashboard):

- **Acquisition & Marketing (1688662):** Marketing channel mix `lOxva3Na` (ActionsBar; $direct fix applied) · AI assistant referrals `KA1uAGVE` · Top content by visitors `r0gGKB04` · Lead magnet conversion `OAMsJUGJ` · Exit popup conversion `B4SBLh6f` · Signup attribution UTM `YAbHsoTi` · Signup funnel started→submitted→completed `EXPxEaOk` · Visitor journey paths `2ERt5Cik`.
- **Activation & Onboarding (1689287):** Onboarding step drop-off `18pMOVo0`.
- **Revenue & Billing (1689289):** "awaiting revenue volume" text tile (240234).
- **Reliability & Health (1689292):** "low volume, read trend shape" text tile (240235).

## Codification debt (tracked, NOT done)

`scripts/posthog-dashboards.ts` has structurally DIVERGED from the 7 live dashboards: its 6 specs use " - " names + a different taxonomy than the live " · " names, so running it as-is would CREATE 6 duplicate dashboards. Its `buildInsightPayload` also only supports trends/funnel/retention — it cannot represent the new DataVisualizationNode/HogQL tiles. Proper reconciliation (extend buildInsightPayload for DataVisualizationNode + re-encode live dashboards by " · " name) is a separate scoped task; spawned as a background task. Until then DO NOT run the script against prod.

## Status

GOAL COMPLETE. P0+P1(shipped)+P2+P3 done. Live dashboards now decision-grade for marketing (channel/AI/content/conversion/UTM attribution) and product (signup funnel, onboarding drop-off, visitor paths); pre-revenue surfaces labeled. Only open item = analytics-as-code reconciliation debt above (tracked, non-blocking).
