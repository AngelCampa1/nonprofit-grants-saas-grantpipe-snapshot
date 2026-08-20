# Video #16 — Build a Grant Tracking Spreadsheet (Free Template)

**Target keyword:** grant tracking spreadsheet
**Narrator:** female, conversational (ElevenLabs "Charlotte")
**Target length:** ~10 min
**Angle:** Compliance-aware tracking — the columns most trackers forget. Builder perspective. Honest scale limit, soft GrantPipe outro. Free template is real and downloadable.

> NOTE: This is the DRAFT (pre-humanizer). Narration in plain prose. `[VISUAL: …]` cues drive the Hyperframes build. Final spoken text lives in `script-final.md`.

---

## 0:00 — Cold open / Hook

[VISUAL: Dark emerald title card. A spreadsheet grid fades up. One cell pulses ochre: a blank "Restricted?" column.]

Here's the column most grant trackers are missing. And it's the one an auditor asks about first.

If you run grants on a spreadsheet, this isn't a knock on you. A spreadsheet is the right place to start. The problem is that most grant tracking spreadsheets are built like a to-do list — applied, approved, received — when the people who fund you, and the people who audit you, are asking a completely different set of questions.

So in the next ten minutes I'm going to build a grant tracking spreadsheet with you, from a blank sheet, the way it should be built if you ever expect to be audited. And the finished template is free — link's in the description, no email wall on the Google Sheets version.

[VISUAL: GrantPipe wordmark, small, lower third. Chapter list slides in.]

I'm building this from the software side — I make grant compliance tools — so I'm going to show you the structure that holds up, not just the one that looks tidy on a Monday.

---

## 1:10 — Chapter 1: Why most trackers fail

[VISUAL: A "typical" tracker — columns: Grant Name, Amount, Status. A red stamp: "FAILS AT AUDIT."]

Let's start with what a typical grant tracker looks like, because I want you to see the gap. Grant name. Funder. Amount. Status. Maybe a due date if you're organized. That tracks whether you got the money. It tells you nothing about how you're allowed to spend it, whether you've spent it correctly, or what you owe the funder in return.

Three things break this kind of sheet. First, no restriction tracking — you can't tell which dollars are promised to a specific program. Second, no budget-versus-actual — you know the award was fifty thousand, but not that you've already spent forty-eight. Third, no audit trail — when a number changes, nobody knows who changed it or when. We're going to fix all three.

---

## 2:10 — Chapter 2: The Grant Register

[VISUAL: Blank Google Sheet. Tab renamed "Grant Register." Columns type in one at a time, highlighting as named.]

Open a new sheet. The first tab is your Grant Register — one row per grant, the master list. Here are the columns that matter.

Grant ID — a short code like ED-2026-01. You'll thank yourself when you have twenty grants and three of them are from the same funder. Grant name. Funder. Funder type — federal, state, foundation, corporate — because the rules change with the source. Award amount. Start date and end date. That window has a name: the period of performance, and spending outside it is one of the most common findings in a grant audit.

Then status — but a real status: Applied, Awarded, Active, Reporting, Closed. Not just "got it." A grant isn't done when the money lands. It's done when the final report is accepted.

---

## 3:30 — Chapter 3: Restricted vs. unrestricted (the column everyone forgets)

[VISUAL: Two columns appear: "Restricted?" (Yes/No dropdown) and "Restriction / Purpose." The earlier pulsing ochre cell fills in.]

Now the column from the cold open. Add a column called Restricted, with a simple yes-or-no dropdown. And next to it, Restriction Purpose.

Here's why this is the whole game. A restricted grant is money a funder gave you for one specific thing — say, your after-school program. You are legally obligated to spend it on that and only that. Unrestricted money you can put toward general operations. If you mix them up — if you pay the rent out of restricted program money — that's not a typo, that's a compliance violation, and it's exactly what a single audit is designed to catch.

A spreadsheet that doesn't have this column literally cannot answer the question. So we add it now, on every grant, on day one.

[VISUAL: Dropdown demo — selecting "Yes" turns the row's accent ochre.]

Quick tip: use Data, then Data validation, to make Restricted a dropdown. It stops the typos before they start.

---

## 4:50 — Chapter 4: Budget vs. actual

[VISUAL: New tab "Budget vs Actual." A small budget table per grant: line items, Budgeted, Spent, Remaining.]

Next tab: Budget versus Actual. This is where you track spending against the grant — not your whole organization, just this grant.

Down the left, your budget categories — personnel, supplies, travel, whatever the award specifies. Then three columns: Budgeted, Spent, and Remaining. Remaining is just Budgeted minus Spent, so let the sheet do it: equals B2 minus C2.

Why per-category and not one big number? Because most funders approve a budget by line. If they gave you eight thousand for travel and you spent twelve, it doesn't matter that your total is under — you overspent a restricted line, and you'll be asked to move money back or give it back. Tracking by line is how you catch that in March instead of at the audit in November.

[VISUAL: A "Spent" cell ticks past "Budgeted"; the Remaining cell flips negative and glows red.]

---

## 6:00 — Chapter 5: The expense log

[VISUAL: Tab "Expense Log." Columns type in: Date, Grant ID, Category, Vendor, Amount, Notes.]

So how does the Spent number fill itself in? With an expense log. One tab, one row per expense, every dollar you charge to a grant.

Columns: Date, Grant ID, Category, Vendor, Amount, and a Notes field for the why. The Grant ID is the key — it's how this expense connects back to the right grant in your register. Then on your Budget versus Actual tab, the Spent column is a SUMIFS — sum every expense where the Grant ID matches and the category matches. Now your budget updates itself every time you log a receipt.

[VISUAL: Type a SUMIFS formula; the matching budget line increments live.]

This one connection — expense log to budget — is the difference between a spreadsheet you trust and a spreadsheet you rebuild from scratch every quarter.

---

## 7:20 — Chapter 6: Deadlines and a simple dashboard

[VISUAL: Tab "Reporting." Columns: Grant ID, Report Type, Due Date, Submitted, Status. Conditional formatting turns near dates amber, overdue red.]

Funders don't just want their money spent right. They want to hear about it, on a schedule. So: a Reporting tab. Grant ID, report type, due date, submitted date, status.

Then one piece of real spreadsheet magic — conditional formatting. Highlight the due-date column, add a rule: if the date is within thirty days, turn it amber; if it's past and not submitted, turn it red. Now your deadlines find you, instead of you remembering them at midnight.

[VISUAL: A small summary card builds: Total awarded, Total spent, % restricted, Reports due in 30 days.]

And up top, a tiny dashboard. Four numbers: total awarded, total spent, percent of your funding that's restricted, and reports due in the next thirty days. A few SUM and COUNTIFS formulas. That's your whole grant portfolio in one glance.

---

## 8:30 — Chapter 7: Where the spreadsheet breaks (the honest part)

[VISUAL: The clean sheet slowly multiplies into many tabs; cursor frantic; a "version_FINAL_v3.xlsx" filename appears.]

I built grant software for a living, so let me be honest about where this spreadsheet stops working — because it will.

It breaks at three points. When more than one person edits it, and you can't tell who changed the award amount or when — there's no audit trail, and an auditor wants the trail. When one expense has to split across two grants, and your SUMIFS can't cleanly allocate it. And when you're juggling enough grants that the reporting tab becomes its own full-time job.

That's not a spreadsheet failure. It's a spreadsheet doing exactly what spreadsheets do — until the compliance load outgrows it.

---

## 9:20 — Outro / Soft CTA

[VISUAL: Side-by-side: the spreadsheet, then a calm GrantPipe screen showing the same data with an automatic activity log.]

When you hit that wall, the next step is software that keeps the audit trail for you — every change logged, restricted funds enforced, deadlines tracked automatically. That's the category GrantPipe is in, and that's all I'll say about it, because today the spreadsheet is the right tool and you should use it well.

So grab the free template — Google Sheets and Excel, link in the description, the columns we built are all there. If this saved you a future headache, subscribe; the next video is the single audit, explained without the jargon.

Build it right the first time. Your future self, the one sitting across from the auditor, will be very glad you did.

[VISUAL: End card — template link, GrantPipe wordmark, "Next: The Single Audit Explained."]
