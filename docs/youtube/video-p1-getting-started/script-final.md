<!--
P1 — Getting Started: Set Up Your Org & Import Your Data
Voice: Laomedeia (Gemini gemini-3.1-flash-tts-preview via gcloud ADC).
GOOGLE_TTS_STYLE: "Narrate like the person who built the product, showing a busy colleague around. Warm, exact, a little dry. Unhurried and reassuring on the careful parts (preview, commit); brisk on the obvious parts. Real conviction, never hype, never a flat AI-narrator cadence."

Writing passes applied: stop-slop, humanizer, third-grade-copy, no-lie, spoken-delivery tuning.
third-grade-copy evaluator: PASS on structure (avg ~8.7 words/sentence, FK grade ~3.6). Two checks left as DELIBERATE exceptions for spoken host narration:
  (1) a handful of sentences run 18-22 words — intentional rhythm; forcing every spoken line under 14 words produces robotic staccato and violates the "never monotonous" mandate.
  (2) "hard words" DonorPerfect / Salesforce / grant opportunities / duplicates / megabytes are required product terms + units, each explained in context (the skill permits required terms).
Accuracy: every claim traces to accuracy-sources.md. Org setup = 3 fields. CSV import = contacts/donations/grants/grant opportunities (NOT funds). Preview saves nothing. Only Bloomerang/DonorPerfect/Salesforce NPSP are named presets. 10MB cap.

[VISUAL:] cues reference REAL captured frames in _capture/p1/ (verified 2026-06-02). Files: 01-onboarding-welcome, 02-onboarding-org-setup, 03-onboarding-import, 04-import-choose-source, 05-import-upload-selected, 06-import-preview, 07-import-commit-result, 08-import-history, 09-donors-list.
Reality check baked into cues: /import is ONE scrolling page (Source file -> Preview -> Import history sections); the 4-step bar is a static legend, not a wizard. The HyperFrames comp moves between sections with pan/zoom, NOT page navigations. Commit result is the real product output: 2 inserted, 3 duplicates, 1 failed; row error "Line 7, type: Use one of: individual, organization."
-->

### The part everyone dreads

[VISUAL: GrantPipe wordmark on warm paper, then transition to the real signed-in app on 01-onboarding-welcome (step 1 of 4). Cursor already in frame.]

Setting up new software is where good intentions go to die. You sign up, you get a blank screen, and somewhere there's a spreadsheet you're scared to touch.

So let's just do it. In the next few minutes you'll set up your nonprofit and get your donors into GrantPipe. Three fields, one file. And before anything saves, you'll see exactly what GrantPipe is about to do.

I built this. Let me show you around.

### Set up your org. It's three fields, not a quiz.

[VISUAL: On 01-onboarding-welcome, highlight the three value lines, then transition to 02-onboarding-org-setup (step 2 of 4). Zoom to the centered form card.]

When you first sign in, GrantPipe asks you three things. Not a long form. Three.

[VISUAL: On 02-onboarding-org-setup, highlight the Organization name field showing "Heartland Senior Services".]

Your nonprofit's name. This is what shows up on your reports and exports, so spell it the way you want a funder to see it.

[VISUAL: On 02-onboarding-org-setup, highlight the Fiscal year start month field (July).]

The month your fiscal year starts. Most nonprofits don't run on a January calendar, and that's why year-end numbers can feel impossible to line up. Set it once here, and your dashboards and reports follow it.

[VISUAL: On 02-onboarding-org-setup, highlight the Timezone field (America/New_York).]

And your timezone. This one's quiet, but it counts. It's how GrantPipe knows when a deadline is really due. So a report doesn't get marked late just because some server runs on a different clock.

That's the whole setup. Save it, and you've got a workspace.

### Bring your data in. Pick what you're importing.

[VISUAL: 03-onboarding-import — "Do you have a spreadsheet of donors or contacts?" with Import a CSV / Skip. Transition to the top of the /import page (04-import-choose-source): Source file section with the Contacts entity, Generic CSV preset, template link, and the static 4-step bar above it.]

Now your data. If you've got a spreadsheet of donors, you are not typing them in one by one.

GrantPipe imports four kinds of records: contacts, donations, grants, and grant opportunities. Start with contacts. That's the donor list almost everyone already has sitting in a file somewhere.

[VISUAL: On 04-import-choose-source, zoom the preset control — Generic CSV, Bloomerang, DonorPerfect, Salesforce NPSP.]

Came out of Bloomerang, DonorPerfect, or Salesforce's nonprofit pack? Pick that preset, and the columns line up for you. Anything else, like a plain Excel sheet or an old Blackbaud export, choose Generic CSV and match the columns yourself. It's simple. And you can download a template to follow.

### Upload and preview. The part where nothing can go wrong.

[VISUAL: On 04-import-choose-source, note the ".csv up to 10 MB" requirement. Cut to 05-import-upload-selected with donor-contacts.csv attached, then to 06-import-preview after Preview import is clicked.]

Upload your file. Any CSV up to ten megabytes. Then GrantPipe shows you a preview.

[VISUAL: On 06-import-preview, zoom to "6 rows detected" then the first-five mapped table. Hold on the line stating nothing is saved during preview.]

Here's the part I want you to relax about. This is a preview. Nothing saves. GrantPipe reads your file and tells you how many rows it found. It shows you the first five, so you can check the columns landed where you expected. If something looks wrong, back out and fix the spreadsheet. Nothing has touched your account.

That's the idea. You look before anything happens.

### Commit, and read the result honestly.

[VISUAL: Commit import clicked. Cut to 07-import-commit-result: "Import finished: 2 inserted, 3 duplicates, 1 failed".]

When the preview looks right, you commit. Now GrantPipe writes the records, and it tells you the truth about what happened.

[VISUAL: Highlight each number as it's named — inserted, then duplicates, then failed.]

Three numbers. Two added. Three skipped as duplicates. When GrantPipe spots a contact you already have, it skips it instead of making a second copy. And one failed, with the line and the field, so you know what to fix.

[VISUAL: On 07-import-commit-result, highlight the row error "Line 7, type: Use one of: individual, organization." Then 08-import-history with the completed donor-contacts.csv entry and its counts.]

A few rows failing is normal. Here, line seven used a contact type GrantPipe doesn't know, so it tells you the two it accepts. A blank required field or a date it can't read fail the same clear way. Fix those lines and re-import just them. GrantPipe logs every import you run right here, with its counts, so you've got a record of what came in and when.

[VISUAL: 09-donors-list — the populated Donors list; briefly settle on the two just-imported contacts (Helen Whitfield, Frank Delgado), now real records.]

And there they are. Your donors, in GrantPipe.

### You're set up

[VISUAL: Pull back to a calm dashboard view. Overlay a soft card with the lead-magnet title and an "in your inbox" line. GrantPipe mark in the corner.]

That's your org set up and your data in. No consultant, no migration project, and nobody had to dread it.

One tip before you go. If your spreadsheet is messy, and most are, map your columns before you import. We made a free template for that: the CRM Migration Data Map. It tells you which column goes where and what to clean up first. Want it? We'll send it to your inbox.

Next, we'll add your first grant and split it across your funds. That's where GrantPipe really starts earning its keep.

[VISUAL: End card — GrantPipe mark, calm hold, gentle fade. Final scene only.]
