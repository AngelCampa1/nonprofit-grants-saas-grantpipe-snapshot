<!--
P4 — How to Track Grant Spending Without Losing Your Mind (concept-then-demo)
Voice: Laomedeia (Gemini gemini-3.1-flash-tts-preview via gcloud ADC).
GOOGLE_TTS_STYLE: "Narrate like the builder showing a smart, busy nonprofit director one thing done right. Warm, clear, a little dry. Patient and slightly knowing on the 'here's how it falls apart' beat; brisk and confident through the live app demo; quiet relief on 'report time is boring.' Never lecture-y, never hype, never a flat AI-narrator cadence."

Writing passes applied: stop-slop, humanizer (×2), no-lie, third-grade-copy (evaluate_copy.py: PASS — FK grade 1.8, avg sentence 7.5 words, max 13; "Allocated"/"Unallocated"/"GrantPipe" allowed as required terms), spoken-delivery tuning.
Accuracy: every claim traces to accuracy-sources.md. Product claims = verified real GrantPipe behavior only. The grant page shows Grant Amount / Allocated / Unallocated / Remaining to Spend (A1); Remaining to Spend = award − expenses (A2); Expenses tab + Add-expense form has exactly Amount/Date/Description (A4); burn rate on Overview (A7) and a plan-gated Spend-Down view (A8, C8). NO false-feature claims: no journal entries / GL sync, no bank-feed import, no auto 2 CFR cost-category classification, no per-expense receipt attachment, no budget-vs-actual demo (Budget tab is empty for the seed — C1), no generic spending-report export. Builder framing — Angel builds compliance software, is NOT an accountant/grants officer.
Demo discipline: demo [VISUAL:] cues reference REAL captured screens (_capture/p4/), composited via screenFrame() with Ken-Burns/spotlight — no HTML recreations, no video playback. Narration states no specific dollar figures, so it can't drift from the captured screen numbers. Re-verify narration against the actual screens before locking.
Spoken-delivery tuning: no dollar amounts spoken; no em dashes in narration (commas/periods for pauses); digits only in [VISUAL:] cues.
Concept half ([VISUAL] scenes 0–2) = hand-built concept art. Demo half (scenes 3–5) = real app screens. Scene 6 = recap + CTA. Warm paper, emerald + ochre, Sora/Plex. No grid textures.
-->

### The question your bank balance can't answer

[VISUAL: Warm paper. A bank balance line in muted ink: "Checking: one big number". Below it, in emerald: "How much is left on THIS grant?" Small ochre tag: "Tracking grant spending".]

You got the grant. Now you have to spend it. And at some point, someone asks a simple question. How much of this grant is left, and where did the rest go? Your bank balance won't tell you. One account holds every grant and your own money, all mixed together. Today I'll show you how to track grant spending. You'll be able to answer that any day of the week. Without losing your mind.

Quick note on where I'm coming from. I build grant compliance software. I'm not a former grants officer or an accountant. I won't pretend to be. You're getting the version a busy director needs.

### What tracking spending really means

[VISUAL: Simple equation builds: "Award amount" − "What you've spent" = "What's left" (emerald). Two red side-tags fade in: "spend wrong → you eat it", "spend too slow → clawed back".]

So what does tracking grant spending really mean? Every dollar you spend belongs to one grant. The number that matters is what's left. Take the award amount. Subtract what you've spent against it. What's left is your remaining balance. Simple math. It only works if each cost points to the right grant.

Get it wrong in two directions, and both cost you. Spend on something the grant doesn't cover, and you eat the cost. Go over the award, same thing. Spend too slowly, and the funder takes the rest back. Your next grant shrinks too. A clear remaining number keeps both from happening.

### What it actually takes

[VISUAL: Three chips appear in turn: "A running total you trust", "A list of every cost", "A sense of pace". Beside them, a faded drawer of receipts with a red tag: "no per-grant view".]

It takes three things. A running total for each grant that you can trust. A list of every cost, so you can show your work. And a sense of pace, so the deadline doesn't sneak up on you.

The way this falls apart is familiar. One checking account. Receipts in a drawer. No per-grant view. You feel fine until month eleven. Then you add it all up. You're over on one line, and behind on another. By then it's too late to fix.

### The grant's four numbers

[VISUAL: Real app screen — grant detail Overview at /grants/:id (Title III-C Nutrition Services Grant). Slow Ken-Burns push-in. Spotlight the four cards in turn: "Grant Amount", "Allocated", "Unallocated", "Remaining to Spend". Hold on Remaining to Spend.]

Let me show you one way to do this, in the real app. Open a grant, and the four numbers sit right at the top. Grant Amount, the full award. Allocated, how much you've assigned to your funds. Unallocated, the rest. And the one you'll watch most, Remaining to Spend. That's the live answer to how much is left. You don't type it in. The app takes the award and subtracts every expense charged to the grant. Spend more, and it ticks down on its own.

### Record what you spend

[VISUAL: Real app screen — the Expenses tab, the itemized ledger of six months of entries. Then the "Add expense" dialog open, showing the three fields: Amount, Date, Description. Crossfade back to the ledger.]

How does it know what you spent? You tell it, on the Expenses tab. This is every cost on the grant. Each line shows a short note and what it cost. To add one, you open a small form. Amount, date, a quick description. That's it. Save it, and two things happen. The cost joins the list, and Remaining to Spend drops by that much. So the list and the running total stay in step on their own. That list is what you hand a funder. When they ask where the money went, it's right there.

### Know your pace

[VISUAL: Real app screen — spotlight the "Burn rate: $X/mo" line on the Overview, then the Spend-Down view showing pace toward the close date.]

Now the part that saves you. Pace. The grant shows your burn rate. That's just how much you spend each month, on average. That one number tells you a lot. At this rate, will you land near zero by the close date? Or run out early? Or sit on money you'll have to give back? The Spend-Down view lays it out. You see the drift early. Early enough to still steer. Quick note. That view comes with the larger GrantPipe plans. Check that it's on yours.

### One thing to remember

[VISUAL: Recap card on warm paper. Big line: "One number you can trust: what's left." Three chips appear in turn: "Tie every cost to its grant", "Keep the list", "Watch your pace". Then the GrantPipe wordmark and a soft lead-magnet chip: "Free grant spending spreadsheet — we'll send it to your inbox".]

So that's the whole job. Tracking grant spending comes down to one number you can trust. What's left on this grant. Tie every cost to its grant, keep the list, and watch your pace. Do that, and report time gets boring. That's exactly what you want.

A spreadsheet can carry this while you're small. A system carries it for you when you're not. That's the kind of thing we built GrantPipe to handle. But the habit matters more than the tool.

Want a starting point? We made a free spreadsheet. It sets up these columns for you. We'll send it to your inbox. Next up, how to keep this straight across a dozen grants at once. Thanks for watching, and good luck spending it down.
