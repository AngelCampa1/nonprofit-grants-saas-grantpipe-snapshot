# GrantPipe Onboarding Overhaul — "First Light" Design Spec

**Date:** 2026-06-20
**Status:** Approved for implementation (autonomous /goal directive)
**Author:** Claude (Opus 4.8), sub-agent-driven
**Supersedes the experience of:** `2026-06-19` activation-onboarding redesign (the wizard shipped then is the foundation we are curating)

---

## 1. Problem

The current first-run experience is functional but **bland and transactional**. It asks for _setup before value_:

1. **Welcome + goal** (good — keep the idea)
2. **Org setup** — org name **+ fiscal year month + a 100+ entry timezone dropdown**. This is a cold form. It is the single biggest friction point and the biggest "boring" moment.
3. **Add your data** — three equal-weight cards; the "aha" path (sample data) is not curated as the hero, and "Start from scratch" reads as the hard way.

After finishing, the user lands on a dashboard with **two competing onboarding widgets** (a checklist card _and_ a floating 30-day overlay), which fight for attention and contradict "one thing at a time."

The user feels nothing has been _shown_ to them — they have only been _asked_ for things. There is no aha moment and no payoff.

### North star

An 80-year-old who has never used a computer, and hasn't learned anything new since 1987, should reach an **aha moment fast**: _"Oh — this is GrantPipe, and I can already see how it helps me."_ Calm, confident, one clear thing at a time. Apple/Jobs-grade curation.

---

## 2. Principles (from research; see `2026-06-20-onboarding-research` synthesis in commit body)

1. **Value first, setup second.** Deliver the outcome (a populated, real-feeling workspace) before asking for configuration work.
2. **One decision per screen.** Never more than 2–5 choices; ideally one primary action.
3. **Pre-populate, don't present blank.** Sample data is the aha engine.
4. **Calm milestone at the aha** — one warm sentence, no confetti. Matches brand: "rigorous, humane, earned."
5. **Senior/novice-first accessibility:** ≥18px body text in onboarding, ≥44px tap targets, single column, 4.5:1 contrast, plain 6th–8th grade language, **no time pressure**, "you can change this later" on every reversible choice.
6. **Remove every step that doesn't advance toward the aha.** Defer fiscal year + timezone out of onboarding entirely.

---

## 3. The redesigned flow — "First Light"

Three calm screens, reordered and stripped so the user reaches a populated workspace fast.

### Screen 1 — Welcome & goal (one question)

- Warm, large headline. One question: _what matters most to you first?_
- Three large goal cards (donors / grants / compliance), benefit-forward copy, big icons, ≥44px targets, clear selected state.
- Reassurance line: "Pick one. You can do the rest whenever you like."
- Single primary action: **Continue**.
- Keeps `onboarding_goal` personalization (drives the aha route + sample-data emphasis).

### Screen 2 — Name (one field)

- One warm question: _"What's your organization called?"_
- **Single text input.** Large. Reassuring helper line: "This is the name we'll put on your reports. You can change it later."
- **Removed from onboarding:** fiscal-year-start-month and the timezone dropdown.
  - Timezone: **auto-detected** from the browser (`Intl.DateTimeFormat().resolvedOptions().timeZone`), validated against the allowed list, falling back to `America/New_York`.
  - Fiscal year start month: defaults to January (1).
  - Both remain fully editable in **Settings** (already exists). A quiet "You can fine-tune fiscal year and timezone in Settings later" line acknowledges this.
- The PATCH `/api/onboarding` here remains the **authoritative server completion** (sets `onboarding_completed = true`), now sending the auto-detected timezone + default fiscal month + chosen goal. No backend contract change required beyond accepting the same fields.
- Primary action: **Continue**.

### Screen 3 — See it work (the aha launcher)

- Headline: _"Want to see GrantPipe in action first?"_
- **Hero primary path (curated, recommended):** "Show me an example" → seeds sample data, navigates to the goal's aha route. This is the engineered aha. Visually the dominant choice.
- **Secondary, quieter options:** "I'll add my own data" (→ aha route, no seed) and "Import a spreadsheet" (→ /import).
- Removes the "all three equal weight" problem; sample data is clearly the fast, safe, recommended way to _see_ value.
- "Do this later" remains available and quiet.

### The aha landing (payoff)

- On the goal's destination route, a **calm, dismissible celebration banner** appears once after a sample-data seed:
  - e.g. (donors) _"This is your donor list, filled with example data so you can see how GrantPipe works. Clear the examples anytime."_
- One sentence, warm, no confetti, brand-aligned. Includes a one-click **"Clear examples"** affordance (reuses existing clear-sample-data flow) so the safety net is visible at the moment of highest attention.

---

## 4. Dashboard curation (post-onboarding)

**Problem:** the checklist card and the 30-day floating overlay overlap and compete.

**Decision:** consolidate to **one** calm "next step" guide.

- Keep the **inline checklist** (role-aware, lives in content flow) as the single source of guided next steps.
- **Retire the floating 30-day overlay** as a competing always-on widget. Its useful "first 30 days" content, if retained, becomes a calm, optional, collapsible section _inside_ the checklist card — never a second floating layer.
- Ensure only one onboarding nudge is ever visible at a time.

---

## 5. Visual & accessibility polish (applies to all three screens + aha banner)

- Base body text in onboarding ≥ 18px; headings ≥ 28px; line-height ≥ 1.5; line length ≤ 75ch.
- All interactive targets ≥ 44×44px effective area (pills already help; ensure padding).
- Single-column, generous vertical rhythm ("earned space").
- 4.5:1 contrast on every text element including helper/secondary text and placeholders.
- Calm, intentional motion only (gentle step transitions); `prefers-reduced-motion` respected.
- Progress indicator stays ("Step n of 3") — short flows benefit from it.
- Buttons remain pills (design canon).

---

## 6. Copy

All user-facing strings pass the required repo gate, in order:

1. `humanizer` (remove AI/bloat/generic),
2. `third-grade-copy` (plain, ~3rd-grade reading level, audit),
3. zero-lies check (no invented claims; "1-month trial / no card" framing already true),
4. fit-the-context check.

Tone: calm authority with warmth. No "Get started on your journey," no exclamation spam, no "You're all set!" Use "you can change this later" liberally.

---

## 7. Observability (required gate)

Reuse the existing taxonomy; do not double-count.

- `onboarding_completed` stays **server-authoritative** (the PATCH), fired once.
- Keep `onboarding_step_viewed/completed`, `onboarding_goal_selected`, `onboarding_first_action_selected` (import|sample_data|scratch|skipped), `onboarding_sample_data_chosen`, `onboarding_back_clicked`, `onboarding_abandoned`, `onboarding_step_failed`.
- Add (privacy-safe, no PII): `onboarding_timezone_autodetected { detected: boolean }` and `onboarding_aha_banner_viewed { goal }` / `onboarding_aha_examples_cleared { goal }`.
- Sentry: keep `captureBackgroundException` (API/seed) and client `captureQueryError` on the seed mutation and the PATCH.
- Tests prove analytics + Sentry hooks on success and failure paths, or document shared-wrapper coverage.

---

## 8. Out of scope (YAGNI)

- No backend schema migration (org name still required by the PATCH; timezone/fiscal still stored — we just stop _asking_ in onboarding).
- No multi-session email re-engagement (separate future goal).
- No goal-filtered sample-data seeding rework (the aha _route_ already branches by goal; seed contents unchanged this pass). Note as a possible follow-up.
- No change to signup/auth.

---

## 9. Quality gates / completion sequence

- TDD; 95% per-file coverage on touched files.
- Sub-agent-driven implementation + verification + UX critique + code review.
- Multiple review/fix cycles until no findings remain.
- Worktree under `.worktrees/`; merge to `master`; remove worktree; deploy `grantpipe-web` (and `grantpipe-api` only if the onboarding route changes there — it should not need to).
- Verify in a real browser (preview) before completion.

---

## 10. Acceptance criteria

1. New user reaches a **populated, real-feeling workspace** in ≤ 3 calm screens, with sample data, faster than today.
2. No timezone dropdown or fiscal-year question appears during onboarding; both still default correctly and remain editable in Settings.
3. A calm aha banner appears once on the goal's landing route after seeding, with a visible "clear examples" path.
4. Only one onboarding nudge is visible on the dashboard at a time.
5. All onboarding text ≥18px, targets ≥44px, contrast ≥4.5:1, copy passes the writing gates.
6. All existing onboarding tests updated/passing; new behavior covered; analytics + Sentry asserted.
