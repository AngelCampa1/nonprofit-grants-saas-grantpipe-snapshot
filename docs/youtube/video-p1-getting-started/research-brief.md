# P1 Research Brief — Getting Started: Set Up Your Org & Import Your Data

## Slot & role

- **Slot:** P1 (first in the production sequence; gates the email onboarding sequence and the Help section).
- **Type:** Short screen-record, real running app. 3–4 min target.
- **Distribution:** in-app Help (`/help/getting-started`) + email #1 (Welcome) + LinkedIn 30–60s cut. **Not** an SEO play — no keyword target.
- **Home truth:** this is the video a brand-new user watches in their first ten minutes. Its only job is to remove the fear of "I have a spreadsheet and no idea how to start." It must feel like a calm walk-through by the person who built it.

## Audience & emotional job

- Executive Director / Development Director at a $500K–$10M nonprofit. Time-poor, risk-averse, likely burned by Salesforce/Blackbaud or living in spreadsheets.
- They are NOT excited — they are wary. They've been promised "easy setup" before and got a consultant invoice.
- **Emotional target: confidence and control.** By the end they should think "okay, I could actually do this myself, and nothing bad happens if I get it wrong."
- The single strongest trust beat we have: **nothing is saved during preview** (I6). Lead with the safety, not the speed.

## The one job this video shows

Take a real person from "I just signed up" to "my donors are in GrantPipe, and I trust what I see." Two acts:

1. **Set up your org** — the 4-step onboarding wizard (name, fiscal year start, timezone), why each field matters, and that it's three fields, not a questionnaire.
2. **Import your data** — the CSV import flow: pick what you're importing, upload, preview safely, commit, read the result (inserted / duplicate / failed), and where to find import history.

## Angle / spine

"You don't need a consultant, a data migration project, or a perfect spreadsheet. You need three fields and a CSV — and GrantPipe shows you exactly what it's going to do before it does anything." Builder-to-operator, plain, unhurried.

## What we show on screen (real app, demo org "Heartland Senior Services")

Every beat = the actual app. Screens to capture (handled by the capture agent → `_capture/p1/`):

1. Onboarding **Welcome** step — the 3 value bullets + "Get started".
2. Onboarding **Org setup** — name, fiscal-year-start month dropdown, timezone.
3. Onboarding **Import** step — "Do you have a spreadsheet…" with Import a CSV / Skip.
4. **Import — Choose source** — entity type (contacts) + preset dropdown (Generic CSV / Bloomerang / DonorPerfect / Salesforce NPSP) + template download + 10MB note.
5. **Import — Upload** — a real CSV file selected.
6. **Import — Preview** — total rows + first-5 table, with the "nothing is saved during preview" line visible.
7. **Import — Commit result** — inserted / duplicate / failed counts.
8. **Import history** row showing the completed import.
9. (Optional payoff) the **Donors** list now populated with the imported contacts — proof the data landed.

If any screen can't be captured cleanly from the real app, the beat is cut, not faked (real-product rule).

## Hard accuracy guardrails (see `accuracy-sources.md` for citations)

- Org setup = **exactly 3 fields** (name, fiscal year start month, timezone). Do **not** say it asks budget or plan.
- CSV import covers **contacts, donations, grants, grant opportunities** — **NOT funds**. Never "import your funds."
- Only **Bloomerang, DonorPerfect, Salesforce NPSP** are named one-click presets. Everything else = Generic CSV mapping. Do not imply a one-click Blackbaud / Raiser's Edge importer.
- **Nothing is saved during preview**; records write only on Commit. This is true — use it as the emotional anchor.
- Preview shows the **first 5 rows**, not all rows.
- File cap is **10 MB**, `.csv` only.
- Import needs **edit access** (admin/editor). Don't tell a viewer they can import.
- No compliance numbers needed in P1. If any appear, they must match CLAUDE.md verified facts.

## Tone & style direction (for the TTS style header)

- Register: the builder showing a colleague around, sleeves rolled up. Warm, exact, a little dry. Never hype-y, never "in this video we will."
- Pace: unhurried on the scary parts (preview/commit), brisk on the obvious parts (typing a name).
- Variation: open with a small honest admission of the user's dread ("Setting up new software is where good intentions go to die"), land on quiet confidence.

## Structure (chapters — refine against captured timing)

1. **Cold open / why this is painless** — name the dread, promise the safety net (preview).
2. **Set up your org** — 3 fields, why each one matters (reports, periods, deadlines).
3. **Bring your data in: choose what you're importing** — the 4 record types, presets, template.
4. **Upload + preview (the safe part)** — nothing saved yet; read the preview.
5. **Commit + read the result** — inserted/duplicate/failed; dedupe explained honestly.
6. **You're set up — soft CTA** — where Help lives, the email-gated checklist offer, what to do next (add a grant → teases P2).

## CTA (LOCKED)

Soft, email-gated. Offer the **CRM Migration Data Map Template** — a real, published lead magnet (`/downloads/crm-migration-data-map-template.pdf`, verified 2026-05-24). It's the exact companion to this video: a field-mapping worksheet (source column → GrantPipe field, transformations, validation, required/optional) you fill out *before* you import, so the preview comes back clean. Say "we'll send it to your inbox," never "no email." Then tease P2 ("next, add your first grant and split it across funds"). No hard pitch — they already signed up.

Title to speak: "the CRM Migration Data Map template." Frame: "if your spreadsheet is messy, map your columns first — we made a free template for exactly that."

## Open dependencies

- [ ] Capture agent delivers the 9 screens + `_capture/RECIPE.md`.
- [x] CTA lead magnet locked: **CRM Migration Data Map Template** (real, published, email-gated).
- [ ] Lock chapter timing to captured screen availability before writing `[VISUAL:]` cues.
