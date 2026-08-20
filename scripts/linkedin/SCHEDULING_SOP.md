# LinkedIn Scheduling SOP

Use this SOP when scheduling reviewed content from `linkedin-output/` to the
Grantpipe LinkedIn Page.

## 1. Build and Verify the Manifest

1. Generate the schedule manifest:

   ```bash
   pnpm tsx scripts/linkedin/build-schedule-manifest.ts
   ```

2. Confirm the expected counts before opening LinkedIn:
   - 363 total items
   - 330 posts
   - 33 articles
   - Dates: `2026-04-29` through `2026-05-31`

3. Run the manifest audit:

   ```bash
   pnpm tsx scripts/linkedin/audit-schedule-manifest.ts
   ```

   The audit must pass before scheduling anything. It checks:
   - no `link is in the comments` CTA variants
   - no leading spaces at the start of paragraphs
   - no single-newline paragraph joins in regular posts
   - expected manifest counts

4. Treat `linkedin-output/schedule-manifest.json` as the audit source of truth.
   Each item must move from `pending` to `scheduled` only after LinkedIn shows a
   scheduling confirmation.

## 2. Native LinkedIn Post Scheduling Flow

Use the Grantpipe Page admin composer:

1. Open the Grantpipe Page posts screen:

   `https://www.linkedin.com/company/113210122/admin/page-posts/published/`

2. Confirm the page state before every scheduled item:
   - URL contains `/admin/page-posts/published`
   - The visible composer says `Start a post`
   - The actor is `Grantpipe`

3. Click `Start a post`.
4. Paste the post text exactly from the manifest.
5. Click the clock / `Schedule post` control.
6. Set the date and time from the manifest.
7. For exact custom minutes such as `5:13 AM`, type the time and then move focus
   away from the field with `Tab`. Do not click `Next` until LinkedIn updates the
   preview text to the exact intended time.
8. Click `Next`.
9. Confirm the composer preview says the exact intended date and time.
10. Click `Schedule`.
11. Wait for the `Post scheduled.` confirmation toast.
12. Mark that manifest item as `scheduled`.

## 3. Native Article Scheduling Flow

Use the Page article link:

`https://www.linkedin.com/article/new/?author=urn%3Ali%3Afs_normalized_company%3A113210122`

For each article:

1. Open the article editor from the Grantpipe Page context.
2. Paste the `#` heading from `article.md` as the title.
3. Paste the remaining body exactly as reviewed.
4. Schedule for `4:25 PM` on the manifest date, if LinkedIn exposes article
   scheduling for the Page editor.
5. If article scheduling is not exposed, stop and record the item as
   `manual_follow_up` instead of improvising a normal post.

## 4. Automation Rules

These rules are mandatory:

- Do not use blind screen-coordinate loops for LinkedIn scheduling.
- Do not start a scheduling batch unless
  `pnpm tsx scripts/linkedin/audit-schedule-manifest.ts` passes.
- Before every automated click, confirm the current UI state by named control,
  URL, or visible text.
- If automation lands on the wrong tab, such as `Page ads`, reset to the
  published Page posts URL before doing anything else.
- Do not repeat a failed click pattern. If the same automation action misfires
  once, inspect the state and change the method before continuing.
- Do not mark an item as scheduled until LinkedIn shows the confirmation toast.
- If browser automation becomes unreliable, stop scheduling and leave the
  remaining items as `pending` with a note explaining the blocker.

## 5. Audit Notes

Record these fields after each item:

- `id`
- `date`
- `time`
- `kind`
- `sourceFile`
- `status`
- `scheduledAt`
- `notes`, when anything deviates from the SOP

The final report should include:

- Scheduled count
- Pending count
- Manual follow-up count
- First and last scheduled item
- Any failures or skipped items
