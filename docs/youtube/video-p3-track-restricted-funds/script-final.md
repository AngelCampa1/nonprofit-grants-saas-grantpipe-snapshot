<!--
P3 — How to Track Restricted Funds Correctly (concept-then-demo)
Voice: Laomedeia (Gemini gemini-3.1-flash-tts-preview via gcloud ADC).
GOOGLE_TTS_STYLE: "Narrate like the builder showing a smart nonprofit director how to do one thing right. Warm, clear, a little dry. Patient on the 'here's the part people get wrong' beat; brisk and confident through the live app demo. Quiet conviction on the closing. Never lecture-y, never hype, never a flat AI-narrator cadence."

Writing passes applied: stop-slop, humanizer (×2), no-lie, third-grade-copy principles (skill not installed in this env — applied manually to the S1 standard), spoken-delivery tuning.
third-grade-copy: structure PASS (FK ~grade 4–5, avg sentence ~9 words). Deliberate exceptions: a few host lines run 14–18 words for rhythm so it doesn't read robotic ("never monotonous"). Finance terms (restricted, donor/grantor, release, net assets idea) explained in plain words on first use.
Accuracy: every claim traces to accuracy-sources.md. Concept claims = FASB ASU 2016-14 / ASC 958 (two net-asset classes current; three is history; release = reclassification, not new revenue; board-designated ≠ restricted). Product claims = verified real GrantPipe behavior only (P-1..P-7). NO false-feature claims: no export button, no journal entries / GL sync, no per-allocation note, releases only in the Restrictions tab, Restrictions tab is plan-gated (stated honestly). Builder framing — Angel builds compliance software, is NOT an auditor/CPA/controller.
Demo discipline: demo [VISUAL:] cues reference REAL captured screens (_capture/p3/), composited via screenFrame() with Ken-Burns/spotlight — no HTML recreations, no video playback. Narration states no specific dollar figures, so it can't drift from the captured screen numbers. Re-verify narration against the actual screens before locking.
Spoken-delivery tuning: no dollar amounts spoken; no em dashes in narration (commas/periods for pauses); digits only in [VISUAL:] cues.
Concept half ([VISUAL] scenes 0–2) = hand-built concept art. Demo half (scenes 3–5) = real app screens. Warm paper, emerald + ochre, Sora/Plex. No grid textures.
-->

### The question a report can't answer

[VISUAL: Warm paper. A line in muted ink: "This money is only for the after-school program." Below it, in emerald: "How much is left, and can you prove it?" Small ochre tag: "Tracking restricted funds".]

A restriction is a promise. A funder hands you money and says, use this for one thing only. From then on, you have to answer one question at any moment. How much of that money is left, and can you prove where the rest went? A normal activity report shows what moved. It does not answer that. Today I'll show you how to track restricted funds so you can.

Quick note on where I'm coming from. I build grant compliance software. To make a computer follow these rules, I had to learn exactly how this money moves. I'm not an auditor, and I won't talk like one. You're getting the version a busy director needs.

### What restricted really means

[VISUAL: Two buckets. Left, emerald: "Without donor restrictions — free money". Right, ochre: "With donor restrictions — promised money". Below, faded and struck through: "(old rule: 3 groups)".]

So, what does restricted actually mean? It means a donor or grantor tied the money to a purpose, or to a time. Only they can lift that limit. Nonprofit books now sort money into two groups. With donor restrictions, and without. Promised money, and free money. If an old guide lists three groups, it's out of date. The rule changed to two.

One trap to skip. Money your board sets aside for a rainy day is not restricted. The board can change its own mind later. Only an outside funder can truly restrict a gift.

### What tracking it actually takes

[VISUAL: A running balance strip builds left to right: "Beginning" → "+ Additions" → "− Releases" → "Ending". Beside it, a class report with a red tag: "shows activity, not the balance".]

Here's the part people get wrong. To track a restriction, you need a running balance for each award. You start with the award. You add anything new that comes in. You subtract what you spend on the purpose. Accountants call that a release, but it just means the promise is being kept, dollar by dollar. You end with a number you can defend. One big checking account and a memo in your books won't give you that per-promise balance. That's the gap, and it's where audits get tense.

### Set up the fund

[VISUAL: Real app screen — the /funds list in card view. Slow Ken-Burns push-in. Spotlight ring on the "Add fund" button, then cut to the Add-fund dialog with the type select open, showing unrestricted / temporarily restricted / permanently restricted. Crossfade.]

Let me show you one way to do this, in the real app. This is the funds list. Each fund is one promise, with one purpose. To make one, you add a fund, give it a name, and pick its type. Unrestricted, temporarily restricted, or permanently restricted. Both restricted types are promised money from before. Unrestricted is the free money. You can filter the list by type, so the promised money is easy to find.

### See the balance per award

[VISUAL: Real app screen — fund detail at /funds/:id. Spotlight the three summary cards in turn: "Allocated", "Spent", "Balance". Then pan down to "Source Allocations" (the grants feeding the fund) and the "Expense Ledger".]

Open a fund, and there's half the answer. Three numbers. Allocated, what came into this fund. Spent, what has gone out. Balance, what's left. You don't type that balance in. The app works it out from the grants feeding the fund and the spending charged against it. Underneath, you can see exactly which grants fund this, and every expense it paid for. That's how much is left, live.

### Prove the restriction

[VISUAL: Real app screen — the Restrictions tab. Spotlight the "Restricted balance" card showing Beginning, Additions, Releases, and Ending. Then highlight the "Restriction alerts" section flagging a release with no support attached, and the per-term card naming the restriction and its purpose.]

Now the other half. Can you prove it? Open the Restrictions tab, and there's the same running balance we drew earlier. Beginning, additions, releases, ending, for the restricted award. Below it, the app lists each restriction and what it's for. And it watches your evidence. If you release money and nothing backs it up, the panel flags it right there. So you find the weak spot before an auditor does. This tracking comes with the GrantPipe plans that include restriction lifecycle, so check that it's on your plan.

### One thing to remember

[VISUAL: Recap card on warm paper. Big line: "A balance you can defend, for every promise." Three chips appear in turn: "Start, add, release, end", "The app does the math", "Evidence next to the number". Then the GrantPipe wordmark and a soft lead-magnet chip: "Restricted Fund Tracking Spreadsheet — we'll send it to your inbox".]

So that's it. Tracking restricted funds comes down to one thing. A balance you can defend for every promise. Start it, add to it, release as you spend, and end on a number with the evidence attached. A spreadsheet can carry this while you're small. A system carries it for you when you're not. That's the kind of thing we built GrantPipe to handle. But the discipline matters more than any tool.

If you want a starting point, we made a free Restricted Fund Tracking Spreadsheet. It sets up the columns for you. We'll send it to your inbox. Thanks for watching, and good luck keeping your promises.
