# Real-app screen capture — recipe

Canonical way to capture real GrantPipe app screens for the YouTube videos. Every product video (P1–P8) shows the actual running app, never a mockup. If a screen can't be captured cleanly from the real app, the beat is cut, not faked.

## Why a standalone Node script (not the Playwright MCP)

The Playwright MCP screenshot path (`browser_take_screenshot`, and `page.screenshot({path})` via `browser_run_code_unsafe`) hangs forever against this app at `waiting for fonts to load... fonts loaded` — a Playwright stability-wait bug. The MCP `run_code` sandbox also has no `fs`/`Buffer`/`require`/dynamic-import, so it cannot write bytes to disk at all.

The fix, used by every capture script here:

- Drive the real signed-in app with the repo's own Playwright (`node_modules/.pnpm/playwright@1.59.1`), loaded via `createRequire` (it is not hoisted to top-level `node_modules`).
- Capture via the CDP command **`Page.captureScreenshot`** on a `newCDPSession` — this bypasses Playwright's font/stability wait and returns base64 instantly.
- Write PNGs with native Node `fs.writeFileSync(file, Buffer.from(data, "base64"))`.
- Never call `page.screenshot()` / the MCP screenshot tools against this app.

## Prerequisites

1. Local app running on port 3050 with seeded demo data:
   - Postgres (local docker, port 55439) migrated + `seed-demo` run.
   - `GRANTPIPE_WEB_PORT=3050 GRANTPIPE_API_PORT=5050` web + api dev servers up.
   - Verify: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3050/` returns `200`.
2. Chromium present in the Playwright cache (`~/Library/Caches/ms-playwright/chromium-1217`). Already installed.
3. Demo credentials: defaults to the committed seed account `demo@grantpipe.com` (password in `packages/db/src/seed-demo.ts`). Override with `GRANTPIPE_E2E_EMAIL` / `GRANTPIPE_E2E_PASSWORD`. The script never prints the password.

## Run

```bash
cd /Users/angel/Code/grantpipe
node docs/youtube/_capture/capture-p1.mjs
```

PNGs land in `docs/youtube/_capture/p1/` at 1920×1080 logical, `deviceScaleFactor: 2` (3840×2160 actual) so they downscale crisply into 1080p video.

## Conventions for new capture scripts (P2+)

- One script per video: `capture-<slug>.mjs`. Output dir `_capture/<pN>/`.
- Reusable input data (CSV fixtures, etc.) lives in `_capture/fixtures/`.
- Freeze motion before shooting: inject a style tag zeroing `animation`/`transition` durations and hiding the caret (see `addInitScript` in `capture-p1.mjs`).
- Do **not** wait on `networkidle` — PostHog polling keeps the network busy and it never settles. Wait on explicit selectors + a short fixed `settle()` delay.
- Keep captures non-destructive to the demo org where possible. Re-submitting onboarding org-setup with the demo org's existing values (Heartland Senior Services / fiscal July / America/New_York) is an idempotent no-op used here only to reach the onboarding Import step.

## P1 screens (verified 2026-06-02)

| File | Screen | Notes |
| --- | --- | --- |
| `01-onboarding-welcome.png` | Onboarding Welcome (step 1 of 4) | 3 value lines + Get started + product-tour link |
| `02-onboarding-org-setup.png` | Onboarding Org setup (step 2), filled pre-submit | Heartland Senior Services / July / America/New_York |
| `03-onboarding-import.png` | Onboarding Import prompt (step 3) | "Do you have a spreadsheet…" Import a CSV / Skip |
| `04-import-choose-source.png` | /import top — Source file | Contacts + Generic CSV + template + 4-step bar |
| `05-import-upload-selected.png` | /import — file selected | `donor-contacts.csv (294 B)` |
| `06-import-preview.png` | /import — Preview | "6 rows detected" + first-5 mapped table |
| `07-import-commit-result.png` | /import — Commit result | **2 inserted, 3 duplicates, 1 failed** + "Line 7, type: Use one of: individual, organization." |
| `08-import-history.png` | /import — Import history | The committed `donor-contacts.csv` entry with counts |
| `09-donors-list.png` | /donors — populated | 9 donors incl. the 2 imported (Helen Whitfield, Frank Delgado, both Prospect/$0) |

The `/import` flow is a single scrolling page (Source file → Preview → Import history sections), with the 4-step bar as a static legend — not a multi-route wizard. Compose video "steps" by cropping/zooming to each section.

The P1 fixture `_capture/fixtures/donor-contacts.csv` is engineered so the real dedupe (by exact email) yields the narrated three-number result: 3 rows reuse seeded emails (duplicates), 2 are new (inserted), 1 has an invalid `type` (failed). This is genuine product behavior, not staged numbers.

## P2 screens (verified 2026-06-02)

`capture-p2.mjs` makes **real writes** to the demo org: it creates one grant ("Healthy Aging Partnership Grant", Greater Cincinnati Foundation, $60,000, Awarded, Jul 1 2026 – Jun 30 2027) and two allocations, then trips the over-allocation guard. **Re-seed the demo org before each run** (`pnpm --filter @grantpipe/db exec tsx src/seed-demo.ts`) so it starts pristine — the create flow is not idempotent (re-running adds duplicate grants).

| File | Screen | Notes |
| --- | --- | --- |
| `01-grants-list.png` | `/grants` Portfolio tab | 5 seeded grants (Name / Funder / Status / Amount / Deadline); header action is **"Add grant"** (not "New grant") |
| `02-create-step1.png` | Create grant — step 1 | Name, Funder (Greater Cincinnati Foundation), Amount $60,000, Status Awarded; stage-meaning line visible |
| `03-create-step2.png` | Create grant — step 2 | Start 01/07/2026, End 30/06/2027 filled (headless browser renders date inputs in dd/mm/yyyy); App Deadline empty; "Create grant" submit |
| `04-detail-unallocated.png` | Grant detail, just created | Grant Amount $60,000 / **Allocated $0** / Unallocated $60,000 / Remaining $60,000. Default tab Overview (inline grant-details form + Linked context: Funder + Start/End dates Jul 1 2026–Jun 30 2027) |
| `05-alloc1-dialog.png` | Add allocation dialog (1st) | Allocations tab; Fund = Capacity Building Fund, Amount (USD) = 40000 |
| `06-detail-after-alloc1.png` | Detail after 1st allocation | Allocated $40,000 / Unallocated $20,000; Capacity Building Fund row |
| `07-alloc2-dialog.png` | Add allocation dialog (2nd) | Fund = General Operating Fund, Amount = 20000 |
| `08-detail-fully-allocated.png` | Detail fully allocated | Allocated $60,000 / Unallocated $0; both fund rows ($40k + $20k) |
| `09-guardrail-error.png` | Over-allocation guard (trust beat) | A 3rd allocation ($5,000) on a maxed grant → real server error "Allocation would exceed grant amount" shown as **both** a toast (top-right) and an inline dialog alert |

Notes for the editor:
- `formatCurrency` uses "auto" cents — whole-dollar amounts render **without** decimals (`$60,000`, not `$60,000.00`). Key any selector wait on the no-decimal form.
- A brand-new grant's Allocated card shows **"$0"**, not "No allocations" (that placeholder only renders when the allocated total is null, e.g. some seeded states).
- Capturing the dates on the create form depends on a product fix: date-only `<input type="date">` values were rejected by the grant validators until `packages/shared/src/validators/grants.ts` was relaxed to accept and normalize them. Run captures against an app built from master at/after that fix.
