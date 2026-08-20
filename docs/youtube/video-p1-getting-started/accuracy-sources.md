# P1 Accuracy Sources — Getting Started: Set Up Your Org & Import Your Data

_No-lie backbone. Every claim the script makes about the product must trace to a row here. Citations are to source at the time of writing (2026-06-02); re-verify against captured screens before final review._

## Onboarding wizard (apps/web/src/routes/_authenticated/onboarding.tsx)

| # | Claim allowed | Source | Notes / do-not-overclaim |
| --- | --- | --- | --- |
| O1 | Onboarding is a **4-step** guided wizard: Welcome → Org setup → Import → First action | onboarding.tsx:42-58, ProgressBar :101 | Step count is exactly 4. Don't invent extra steps. |
| O2 | Welcome step lists 3 things GrantPipe does: track donor relationships + giving history; never miss a grant deadline or compliance report; stay audit-ready with restricted fund balances | onboarding.tsx:134-142 | Quote these as the app's own words, not my embellishment. |
| O3 | Welcome offers a "Watch the 5-minute product tour" link | onboarding.tsx:148-152 | The tour is the existing 5:01 product overview. |
| O4 | Org setup collects exactly: **Organization name, Fiscal year start month, Timezone** | onboarding.tsx:160-273 | **Does NOT ask budget size or plan** in the wizard. Plan selection is a separate route (select-plan). Don't claim a budget question. |
| O5 | Org name is what GrantPipe prints on reports, exports, and workspace records | onboarding.tsx:214-216 (help tooltip) | |
| O6 | Fiscal year start month affects dashboards, giving periods, and financial reports | onboarding.tsx:232-235 | |
| O7 | Timezone drives deadlines and reminders so due dates match the staff calendar; default America/New_York | onboarding.tsx:162, 257-259 | |
| O8 | Import step asks "Do you have a spreadsheet of donors or contacts?" with **Import a CSV** or **Skip for now — I'll add data manually** | onboarding.tsx:316, 324-335 | Importing is optional; skipping is a first-class choice. |
| O9 | First-action step lets you jump to Track donors / Manage grants / Handle restricted funds / dashboard | onboarding.tsx:368-405 | |

## CSV import (apps/web/src/routes/_authenticated/import.tsx; apps/api/src/domains/import/*; packages/shared/src/constants/import-presets.ts)

| # | Claim allowed | Source | Notes / do-not-overclaim |
| --- | --- | --- | --- |
| I1 | Import is a **4-step** flow: Choose source → Upload CSV → Preview → Commit | import.tsx:53 | |
| I2 | Importable record types: **Contacts, Donations, Grants, Grant opportunities, Funds, Opening balances, Pledge schedules** | import.tsx:47-55, 412-418; import-presets.ts:2-9 | Do not imply one-click API migration. These are CSV imports. |
| I3 | Required template columns per type — contacts: `type`; donations: `amount, date, type`; grants: `name, funderName`; grant opportunities: `title, sourceName, sourceType`; funds: `name, type`; opening balances: `accountCode, entryDate`; pledge schedules: `pledgeDate, installmentDueDate, installmentAmount` | import-presets.ts; import.tsx | State required columns accurately if shown. |
| I4 | You can **download a template** for the selected record type | import.tsx:277-290, 416-418 | |
| I5 | Dedicated column-mapping presets exist for **Bloomerang, DonorPerfect, Salesforce NPSP**; everything else uses **Generic CSV** | import-presets.ts:9-16, IMPORT_PRESETS | **Only those 3 named presets.** The onboarding copy also says "Excel, Salesforce, Raiser's Edge, Blackbaud" (onboarding.tsx:320) — those work via generic CSV, NOT a one-click preset. Don't imply a one-click Blackbaud/Raiser's Edge importer. |
| I6 | **Nothing is saved during preview**; records are written only when you choose Commit import | import.tsx:336, 519, 484-485 | Strong trust beat — true. |
| I7 | Preview shows total rows detected and the first 5 rows mapped | import.tsx:528, 546 | "first 5" — don't say "all rows." |
| I8 | After commit, GrantPipe reports counts: **inserted / duplicates / failed** | import.tsx:497-498 | |
| I9 | GrantPipe detects **duplicates** (e.g. matches existing contacts) instead of blindly inserting | service.ts:57,119-122,399,528-557,808-819 | Dedupe is real (contact matching + within-file seenKeys). Donations need a matchable contact. |
| I10 | Row-level errors are surfaced as "Line N, field: message"; shows first 5 issues | import.tsx:79-107 | |
| I11 | **Import history** lists each past import with type, status, and inserted/duplicate/failed counts | import.tsx:565-631 | |
| I12 | Max CSV file size is **10 MB**; file must be `.csv` | import.tsx:51, 239-247 | |
| I13 | Import requires **edit access** (admin or editor); viewers/auditors are blocked | import.tsx:147-154, canAccessImport | |
| I14 | CSV parser handles quoted fields, embedded commas/newlines, and BOM | csv.ts:9-69 | Only mention if relevant; it's accurate. |

## Demo org shown on screen (packages/db/src/seed-demo.ts — "Heartland Senior Services")

| # | Fact | Source |
| --- | --- | --- |
| D1 | Org: **Heartland Senior Services** (a senior-care nonprofit); admin user **Sarah Mitchell**, demo@grantpipe.com | seed-demo.ts:21-25, 511, 532 |
| D2 | Funders: U.S. Dept. of Health & Human Services, Ohio Department of Aging, Greater Cincinnati Foundation, Procter & Gamble Fund | seed-demo.ts:558-591 |
| D3 | Funds: Title III-C Nutrition Fund, Caregiver Support Fund, Capacity Building Fund, General Operating Fund | seed-demo.ts:604-635 |
| D4 | Grants: Title III-C Nutrition Services Grant, PASSPORT Home Care Services, Aging in Place Capacity Grant, Senior Wellbeing Initiative, Title III-B Supportive Services | seed-demo.ts:648-711 |
| D5 | Restricted-fund purpose statements are real (e.g. Title III-C "may only be spent on congregate and home-delivered meal programs") | seed-demo.ts:251, 470 |

## Founder / framing guardrails (CLAUDE.md)

- Angel is a **builder**, not a former grants officer. No fabricated sector experience, testimonials, user counts, or social proof.
- Soft, email-gated CTA only. Lead magnet = "we'll send it to your inbox," never "no email."
- Compliance numbers (if any appear): single audit $1,000,000; de minimis 15% MTDC; MTDC subaward cap $50,000; equipment cap $10,000. (P1 likely references none — keep it that way unless sourced.)

## Verified against captured screens (2026-06-02, via `_capture/capture-p1.mjs`)

- [x] Real onboarding screens render with these exact fields/labels. Confirmed: 01-onboarding-welcome (step 1 of 4, three value lines, product-tour link), 02-onboarding-org-setup (step 2, Organization name = "Heartland Senior Services", Fiscal year start = July, Timezone = America/New_York), 03-onboarding-import ("Do you have a spreadsheet…" + Import a CSV / Skip).
- [x] Import page shows the static 4-step bar, the Contacts entity + Generic CSV preset, the ".csv up to 10 MB" requirement, the preview table, and the inserted/duplicate/failed summary on a real commit. Confirmed: 04-import-choose-source, 05-import-upload-selected (donor-contacts.csv), 06-import-preview ("6 rows detected" + first-5 table), 07-import-commit-result, 08-import-history. NOTE: /import is one scrolling page, not a multi-route wizard — the 4-step bar is a legend.
- [x] Real commit result = **2 inserted / 3 duplicates / 1 failed**, with row error **"Line 7, type: Use one of: individual, organization."** Engineered by `_capture/fixtures/donor-contacts.csv` (3 rows reuse seeded emails → duplicates; 2 new → inserts; 1 invalid `type` → fail). This is genuine product output, matched verbatim by the script narration.
- [x] Demo org data on screen matches D1–D5 (no lorem/placeholder). Confirmed: 09-donors-list shows real seeded donors plus the two imported contacts (Helen Whitfield, Frank Delgado), 9 donors total.
