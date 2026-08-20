# P2 Accuracy Sources — Add a Grant and Allocate It Across Funds

Every factual/visual claim in the script traces to a citation here. No claim may be broader than its source. Re-read the script against this file in the no-lie pass.

## Demo org / login (what appears on screen)

| Claim | Source |
| --- | --- |
| Demo login email `demo@grantpipe.com` (password never printed) | `packages/db/src/seed-demo.ts:24` (`DEMO_EMAIL`), `:1555` |
| Demo user "Sarah Mitchell" | `packages/db/src/seed-demo.ts:26` (`DEMO_NAME`) |
| Demo org "Heartland Senior Services" | `packages/db/src/seed-demo.ts:27` (`DEMO_ORG_NAME`) |

## Seeded funders (selectable in the create-grant Funder dropdown)

| Funder | Source |
| --- | --- |
| U.S. Dept. of Health & Human Services | `seed-demo.ts:558` |
| Ohio Department of Aging | `seed-demo.ts:569` |
| **Greater Cincinnati Foundation** (used in the demo grant) | `seed-demo.ts:580` |
| Procter & Gamble Fund | `seed-demo.ts:591` |

Create-grant Funder select is populated from existing funders only (`useFunders`) — no inline funder creation. Source: `apps/web/src/components/dialogs/new-grant-dialog.tsx:62-63, 184-200`.

## Seeded funds (selectable in the Add-allocation Fund dropdown)

| Fund | Type | Source |
| --- | --- | --- |
| Title III-C Nutrition Fund | temporarily_restricted | `seed-demo.ts:604-606` |
| Caregiver Support Fund | temporarily_restricted | `seed-demo.ts:614-616` |
| **Capacity Building Fund** (alloc target 1) | temporarily_restricted | `seed-demo.ts:624-627` |
| **General Operating Fund** (alloc target 2) | unrestricted | `seed-demo.ts:635-637` |

## Seeded grants (the existing rows in the /grants table)

| Grant | Funder | Status | Amount | Allocation | Source |
| --- | --- | --- | --- | --- | --- |
| Title III-C Nutrition Services Grant | HHS | active | $185,000 | Title III-C Nutrition Fund $185k | `seed-demo.ts:648-657, 724-728` |
| PASSPORT Home Care Services | Ohio Dept of Aging | reporting | $94,000 | Caregiver Support Fund $94k | `seed-demo.ts:664-673, 729-733` |
| Aging in Place Capacity Grant | Greater Cincinnati Foundation | active | $35,000 | Capacity Building Fund $35k | `seed-demo.ts:680-689, 734` |
| Senior Wellbeing Initiative | Procter & Gamble Fund | closeout | $15,000 | General Operating Fund $15k | `seed-demo.ts:696-704, 735` |
| Title III-B Supportive Services | HHS | application | $62,000 | none (in application) | `seed-demo.ts:711-718` |

**Key fact driving the script:** every seeded *awarded/active* grant is fully allocated to exactly one fund — none is split across multiple funds. So a real multi-fund split must be created live. Source: allocations block `seed-demo.ts:723-736` (one allocation per grant).

## Create-grant form (the modal dialog)

| Claim | Source |
| --- | --- |
| Titled "Create grant"; description "Set up a new grant record and connect it to the right funder." | `new-grant-dialog.tsx:143-146` |
| It is a **2-step** dialog (step bar with 2 segments) | `new-grant-dialog.tsx:58, 150-161` |
| Step 1 fields: **Grant name**, **Funder**, **Amount** ($), **Status** | `new-grant-dialog.tsx:173, 184, 204, 226` |
| Grant name placeholder "e.g. NSF STEM Education Award 2026" | `new-grant-dialog.tsx:176` |
| Funder is a select, placeholder "Select funder" | `new-grant-dialog.tsx:185-200` |
| Amount has a "$" prefix, placeholder "0.00", decimal input | `new-grant-dialog.tsx:204-220` |
| Status select shows stage labels; the selected stage's meaning text renders below | `new-grant-dialog.tsx:232-247` |
| Only **name + funder required** to advance (Next disabled otherwise) | `new-grant-dialog.tsx:83-85, 317` |
| Step 2 fields: **Start Date**, **End Date**, **Application Deadline**, **Description**, **Notes** | `new-grant-dialog.tsx:254, 264, 276, 287, 299` |
| Submit button "Create grant" | `new-grant-dialog.tsx:331` |
| Amount entered as dollars, converted to cents (`Math.round(parsedAmount*100)`) | `new-grant-dialog.tsx:110` |
| Buttons are pills (`rounded-full`) | `new-grant-dialog.tsx:314, 317, 323, 327` |

## Grant status "Awarded"

| Claim | Source |
| --- | --- |
| Label "Awarded" | `apps/web/src/lib/grant-stages.ts:42` |
| Meaning: "The funder approved it; now set up the award details before spending." | `grant-stages.ts:43` |
| Next action: "enter award amount, dates, restrictions, and linked funds." | `grant-stages.ts:45` |
| Status options include Discovery, Application, Submitted, Awarded, Active, Reporting | `grant-stages.ts:20-60` |

## Grant detail page — money cards

| Card | Source |
| --- | --- |
| **Grant Amount** (shows grant amount or "Not set") | `apps/web/src/routes/_authenticated/grants/$grantId.tsx:1010-1020` |
| **Allocated** (sum of allocations, or "No allocations") | `$grantId.tsx:1022-1033` |
| **Unallocated** (amount − allocated) | `$grantId.tsx:1034-1047` |
| **Remaining to Spend** | `$grantId.tsx:1048-1061` |
| Tabs include Overview, **Allocations**, Expenses, … | `$grantId.tsx:1064-1099` |

## Add-allocation dialog (Allocations tab)

| Claim | Source |
| --- | --- |
| Triggered by "Add allocation" button (only when `canEdit`) | `$grantId.tsx:1306, 1316-1318` |
| Dialog title "Add allocation" | `$grantId.tsx:1321` |
| Dialog description "Document which fund is supporting this grant and how much has been committed." | `$grantId.tsx:1322-1324` |
| Field "Fund" — select, placeholder "Select fund", options = org funds | `$grantId.tsx:1361-1375` |
| Field "Amount (USD)" — number input, min 0.01 | `$grantId.tsx:1376-1386` |
| Validation: fund + positive amount required ("Fund and a positive amount are required.") | `$grantId.tsx:1341-1343` |
| Submit "Save allocation" | `$grantId.tsx:1392-1394` |
| Allocations can be edited/deleted later (Edit allocation dialog) | `$grantId.tsx:1399-1473` |

## Over-allocation guard (the trust beat)

| Claim | Source |
| --- | --- |
| Server rejects an allocation if existing sum + new amount > grant amount | `apps/api/src/domains/grants/grant.service.ts:755-758` |
| Error message exactly: "Allocation would exceed grant amount" | `grant.service.ts:757` |
| Guard applies only when the grant has an amount set (`grant.amountCents != null`) | `grant.service.ts:750` |
| Cap is computed from the sum of non-deleted allocations | `grant.service.ts:711-728` |
| Updating an allocation enforces the same cap | `grant.service.ts:805` (comment + logic) |

## Data model (grants ↔ funds many-to-many)

| Claim | Source |
| --- | --- |
| `grant_fund_allocations` join table (grant_id, fund_id, allocated_amount_cents) | `packages/db/src/schema/grants.ts` (grantFundAllocations); CLAUDE.md "Grants and funds are separate entities — many-to-many via grant_fund_allocations" |
| Money stored as integer cents | CLAUDE.md "Money as cents"; `new-grant-dialog.tsx:110`, `$grantId.tsx:1338-1340` |
| Soft delete via `deletedAt` (allocations excluded when deleted) | `grant.service.ts:718` |

## Roles / permissions

| Claim | Source |
| --- | --- |
| Create/edit records (grants, allocations) require Admin or Editor; Viewer cannot | CLAUDE.md Roles table; `$grantId.tsx:1306` (`canEdit` gates Add allocation) |

## Compliance numbers (only if narrated — default: not narrated in P2)

If any compliance dollar figure appears, it must match CLAUDE.md Verified Facts: single audit **$1,000,000**; de minimis **15% MTDC**; MTDC subaward cap **$50,000**; equipment cap **$10,000**; FFATA/SAM debarment stay **$25,000**. The seeded Title III-C grant note mentions an 8% indirect cap — that is a funder-specific restriction, **not** the federal de minimis rate, and is **not** narrated.

## Founder framing

Angel is a **builder**, not a former grants officer. No fabricated sector experience, testimonials, user counts, or social proof. Source: CLAUDE.md Founder Context.
