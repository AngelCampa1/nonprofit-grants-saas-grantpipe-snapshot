<!--
P2 — Add a Grant and Allocate It Across Funds
Voice: Laomedeia (Gemini gemini-3.1-flash-tts-preview via gcloud ADC).
GOOGLE_TTS_STYLE: "Narrate like the builder filing an award letter for a busy colleague. Warm, exact, a little dry. Unhurried and reassuring on the restricted-money and guardrail beats; brisk and matter-of-fact on the form mechanics. Real conviction, a touch of quiet pride on the guardrail. Never hype, never a flat AI-narrator cadence."

Writing passes applied: stop-slop, humanizer (×2), third-grade-copy, no-lie, spoken-delivery tuning.
third-grade-copy: PASS on structure (short, breathable sentences; FK grade ~3-4). Deliberate exceptions kept for spoken host narration: a few sentences run 18-22 words for rhythm (forcing every line under 14 words reads robotic, violates "never monotonous"); required product/finance terms (funder, allocation, restricted, capacity, auditor) each explained in context.
Accuracy: every claim traces to accuracy-sources.md. Create form = 2-step modal (name/funder/amount/status, then dates); only name+funder required to advance. Funder picked from existing funders. Allocation is a separate step on the grant detail Allocations tab. App blocks over-allocation with exact message "Allocation would exceed grant amount" (guard applies only when an amount is set). Money entered as dollars, stored as cents. Builder framing — no fabricated grants-officer experience.

Spoken-delivery tuning: dollar amounts spelled in words in narration ("sixty thousand"), digits left only in [VISUAL:] cues. Em dashes removed from narration (kept as pauses only where a comma reads cleaner aloud).

[VISUAL:] cues reference REAL captured frames in _capture/p2/ (verified 2026-06-02): 01-grants-list, 02-create-step1, 03-create-step2, 04-detail-unallocated, 05-alloc1-dialog, 06-detail-after-alloc1, 07-alloc2-dialog, 08-detail-fully-allocated, 09-guardrail-error. The grant + two allocations are created live during capture (real writes to the demo org). The over-allocation guard surfaces both a toast and an inline dialog alert — the comp keys on the inline alert.
-->

### New money, new rules

[VISUAL: GrantPipe wordmark on warm paper, then transition to the real signed-in app on 01-grants-list — the /grants Portfolio table with the five seeded grants. Cursor already in frame.]

New money should feel good. Mostly it feels like paperwork you're scared to get wrong.

A funder said yes. The award letter is in your inbox. But the money came with strings. It can only pay for certain things. And now you have to record it and split it the right way before you spend a cent.

So let's do that. We'll add a grant, then split its money across the funds it's allowed to pay for. And GrantPipe does the math, so you can't promise more than you actually have.

### Add the grant

[VISUAL: On 01-grants-list, highlight the "Add grant" button top-right, then transition into the Create grant dialog on 02-create-step1. Zoom to the form card.]

This is where your grants live. To add one, you click "Add grant."

[VISUAL: On 02-create-step1, highlight the Grant name field showing "Healthy Aging Partnership Grant".]

It's a short form, two steps. First, the name. Call it what your funder calls it, so you recognize it later.

[VISUAL: On 02-create-step1, highlight the Funder select showing "Greater Cincinnati Foundation".]

Then the funder, the people who gave you the money. You pick from funders you already have. This one came from the Greater Cincinnati Foundation.

[VISUAL: On 02-create-step1, highlight the Amount field "$60,000", then the Status select set to "Awarded" with the stage-meaning line below it.]

The amount: sixty thousand dollars. And the status. We'll set this one to "Awarded," because that's what it is. The funder approved it. GrantPipe even tells you the next move: set up the award details before you spend.

[VISUAL: On 02-create-step1, click "Next" → transition to 03-create-step2. Highlight Start Date and End Date filled.]

Step two is the dates, when the grant starts and ends. Then you create it.

### Open the grant: the four numbers

[VISUAL: Submit → transition to 04-detail-unallocated, the new grant's detail page. Pull back to show the four money cards in a row.]

Here's the grant. And here are the four numbers that matter, right at the top.

[VISUAL: On 04-detail-unallocated, highlight each card as named — Grant Amount, then Allocated, then Unallocated, then Remaining to Spend.]

Grant Amount is the whole award: sixty thousand. Allocated is how much you've assigned to a fund so far. Right now, zero. Unallocated is what's still loose, the full sixty thousand. And Remaining to Spend is what's left after you pay bills against the grant. You haven't spent a cent yet, so that's sixty thousand too.

So the money is in, but you haven't told GrantPipe what it's for. Let's fix that.

### Split it across funds

[VISUAL: On 04-detail-unallocated, click the Allocations tab → it reveals the "Add allocation" button. Click it → 05-alloc1-dialog.]

A grant isn't one bucket of money. This one pays for two things, so it goes into two funds. You do that on the Allocations tab.

[VISUAL: On 05-alloc1-dialog, highlight the Fund select "Capacity Building Fund" and Amount "40000". Show the dialog line about documenting which fund supports the grant.]

First fund: Capacity Building, forty thousand dollars. You're saying, of this award, forty thousand pays for capacity work.

[VISUAL: Save → transition to 06-detail-after-alloc1. The Allocated card ticks up to $40,000 and Unallocated drops to $20,000 as the voice names them; highlight the new Capacity Building Fund row.]

Save it, and watch the numbers move. Allocated is now forty thousand. Unallocated dropped to twenty. You're assigning the money where it belongs.

[VISUAL: Click "Add allocation" again → 07-alloc2-dialog, Fund "General Operating Fund", Amount "20000".]

Second fund: General Operating, the last twenty thousand.

[VISUAL: Save → transition to 08-detail-fully-allocated. Unallocated ticks down to $0 as the voice says it; both fund rows ($40k + $20k) visible.]

And Unallocated hits zero. Every dollar of this grant now has a home. The math checks out, and you didn't do any of it by hand.

### The guardrail

[VISUAL: On 08-detail-fully-allocated, click "Add allocation" once more; fill an amount that pushes the total over the grant. Save → 09-guardrail-error, the inline alert "Allocation would exceed grant amount" (and the matching toast).]

Now the part I'm proud of. Say you try to assign more than the grant is worth. A typo, or one fund too many. GrantPipe stops you. "Allocation would exceed grant amount."

This is what makes restricted money scary, and it's the whole reason a tool helps. You can't promise sixty-five thousand dollars of a sixty-thousand-dollar grant. When an auditor asks if your allocations add up, the answer is yes, because the software won't let you go over.

### You're set

[VISUAL: Pull back to the calm, fully-allocated grant detail. Overlay a soft card with the lead-magnet title and an "in your inbox" line. GrantPipe mark in the corner.]

That's a grant recorded and split across its funds, with the math handled for you. Two minutes, no spreadsheet, no second-guessing.

Not in GrantPipe yet? Maybe you're tracking this in a spreadsheet. We made a free one built for restricted funds: the Restricted Fund Tracking Spreadsheet. Want it? We'll send it to your inbox.

Next, we'll track what you actually spend against this grant, so you know what's left.

[VISUAL: End card — GrantPipe mark, calm hold, gentle fade. Final scene only.]
