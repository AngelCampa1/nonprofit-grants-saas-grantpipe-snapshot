# Tier Repackaging & Capability Communication — LEDGER

**Status: COMPLETE (2026-06-20).** Merged to master at `af0f429f`, all three apps deployed.

## Goal

Two problems: (1) GrantPipe's new capabilities weren't communicated on the surfaces
that matter; (2) Starter was useless and Growth wasn't compelling. Fix via packaging
and communication only — **prices unchanged** (founder priced 10% under Instrumentl with
an 80%-off first-year promo; this was never about price).

## Decided forks (locked early, do not relitigate)

- **Entry tier:** Beef up the current Starter. No new free tier. The "won't spend a dime"
  nonprofit is served by the 1-month no-credit-card trial + 80%-off promo, not a free plan.
- **AI packaging:** Award Intake is included across paid tiers, capped at 5/mo on
  Starter and unlimited on Growth+. Ask-Your-Ledger is gated to Growth+.
  Framing: AI assists, a human confirms.

## What shipped

- **Metering backend:** `ai_usage_events` table (migration `0071_real_dagger.sql`,
  applied to prod Neon), `recordAiUsage`, `assertAiUsageWithinCap` → `AppError(402,
"ai_usage_cap_reached")`. Caps live in `@grantpipe/shared` (`capForFeature` /
  `nextPlanAboveCap`); `normalizePlanTier` fail-closes garbage → "starter".
- **Enforcement:** Award Intake cap at upload; Ask-Your-Ledger gated to Growth+.
- **Client:** `AiUsageCapProvider` in `main.tsx` surfaces cap errors app-wide with an
  upgrade dialog; api-errors cap-payload mapping; shared cap analytics constants.
- **Marketing/UI copy (passed humanizer → third-grade-copy → zero-lies → fit-context):**
  PLAN_CATALOG repackaged; pricing page rebuilt with AI rows + cap framing; homepage AI
  band; product page positioning; trial/billing unlock copy.
- **Observability:** PostHog + Sentry wired on the metering and cap paths; verified.

## Prod verification (2026-06-20)

- api `cc8bb493`, web `daf05366-3172-4947-b060-fe9ace0651a0`, site `22f5fcbb-ec5a-4c5f-a665-c16b2b790942`.
- grantpipe.com/pricing live after the July repackaging: Starter includes up to 5
  award intakes each month. Ask-Your-Ledger starts on Growth and up. Each answer
  links to its source. Homepage + app shell HTTP 200.

## Don't get wrong next time

- Prices stay fixed. Grant caps are now 10/50/100.
- In a worktree, `MERGE_HEAD` lives in `$(git rev-parse --git-dir)`, not `.git/`.
- This worktree had no `.env`; prod secrets only in `<repo-root>/.env`. Copied in
  (gitignored) for deploys; never commit/print it.

## Post-goal comms sweep (2026-06-20)

Verified AI-CS, AI-SDR, and all marketing pages match the new packaging. AI-SDR and
marketing were already correct. AI-CS had one teaching gap, now closed (master `253b846c`,
ff): added a dedicated `award_intake` FEATURE_KNOWLEDGE entry (route
`/award-intake/$extractionId`) and enriched `ask_ledger`. Both now teach the AI tools
according to `PLAN_ENTITLEMENTS` so copy can't drift, with Award Intake on every
paid plan and Ask-Your-Ledger on Growth+, plus "AI assists, a human confirms" abstention
anchors. `AI_CS_KNOWLEDGE_VERSION` → `2026-06-20.2`. feature-knowledge.ts 100% coverage;
copy passed the third-grade gate. Deployed api `7fb01d27` + web `b7ff46f1`.
