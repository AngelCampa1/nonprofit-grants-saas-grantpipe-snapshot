# Video #16 — Build a Grant Tracking Spreadsheet (Free Template)

**Target keyword:** grant tracking spreadsheet
**Narrator:** female, conversational (ElevenLabs "Bella")
**Target length:** ~10 min · **Pass:** stop-slop + humanizer applied, tuned for spoken delivery
**Angle:** Compliance-aware tracking. Builder voice. Honest scale limit, soft GrantPipe outro. Real free template, delivered by email.

> Narration = plain paragraphs. `[VISUAL: …]` cues drive the Hyperframes build. The TTS pipeline extracts narration paragraphs only.

---

### [0:00] Cold open / Hook

[VISUAL: Dark emerald title card. A spreadsheet grid fades up. One empty cell pulses ochre, header reads "Restricted?"]

There's one column missing from almost every grant tracking spreadsheet I've seen. It's also the first thing an auditor asks about. Stick around and I'll hand you the finished template, free. But first, the column that quietly gets nonprofits in trouble.

If you're running your grants on a spreadsheet, this is not a knock on you. A spreadsheet is the right place to start. The trouble is that most grant trackers get built like a to-do list. Applied, approved, money received, done. But your funder and your auditor are asking a completely different question, and a to-do list can't answer it.

So over the next ten minutes, let's build a grant tracking spreadsheet together, from a blank sheet, the way it should be built if you ever expect to sit across from an auditor. The finished template is genuinely free. Drop your email at the link in the description and I'll send you both the Google Sheets and the Excel version, with every column we build today already in place.

[VISUAL: GrantPipe wordmark, small, lower third. A chapter list slides in.]

Quick note on where I'm coming from. I build grant compliance software, so I'm going to show you the structure that survives an audit, not just the one that looks tidy on a Monday morning. Everything I show you here works in plain Google Sheets or Excel. No add-ons, no special tools.

---

### [1:15] Chapter 1 — Why most trackers fail

[VISUAL: A "typical" tracker. Columns: Grant Name, Funder, Amount, Status. A red stamp drops: "FAILS AT AUDIT."]

Picture a typical grant tracker for a second. Grant name, funder, award amount, a status column, maybe a due date. All of it tracks whether the money showed up, and nothing about how you're allowed to spend it.

That sheet falls apart in three places. You can't tell which dollars are promised to a specific program. You know the award was fifty thousand, but not that you've already burned through forty-eight. And when a number changes, nobody knows who changed it, or when. By the end of this, we'll have fixed all three. Let's build.

---

### [2:20] Chapter 2 — The Grant Register

[VISUAL: Blank Google Sheet. Tab renamed "Grant Register." Columns type in one at a time, each highlighting as it's named.]

Open a new sheet. Your first tab is the Grant Register. One row per grant, and this is your master list. These are the columns that earn their place.

Start with a Grant ID, a short code like E-D dash twenty-twenty-six dash oh-one. The funder prefix, the year, then a running number. You'll thank yourself the day you have twenty grants and three of them come from the same funder. Then grant name, funder, and funder type, whether that's federal, state, foundation, or corporate. The funder type matters because the rules change with the source. A federal award comes with a stack of requirements a local family foundation never will.

Then the award amount, a start date, and an end date. That window has a name. It's called the period of performance, and spending outside that window is one of the more common things auditors flag. Money you spend the week before the grant officially starts can get disallowed, even when the expense itself was perfectly reasonable. Last, a real status column: Applied, Awarded, Active, Reporting, Closed. A grant isn't finished when the money lands. It's finished when the final report is accepted.

The register's taking shape. But we still haven't added the column from the start of this video, and it's the one that matters most. That's next.

---

### [3:45] Chapter 3 — Restricted vs. unrestricted (the column everyone forgets)

[VISUAL: Two columns appear: "Restricted?" with a Yes/No dropdown, and "Restriction / Purpose." The pulsing ochre cell from the open fills in.]

Now the column from the very start of this video. Add one called Restricted, with a simple yes-or-no dropdown. Right next to it, add Restriction Purpose.

This one column is the whole game. A restricted grant is money a funder gave you for one specific purpose, say your after-school program. You're obligated, legally or by contract, to spend it on that purpose. Unrestricted money you can put toward general operations. Now, a restricted grant can usually cover a fair share of your overhead, things like rent, but only when the award budget actually allows it. Charge general costs the grant never approved, and that isn't a typo. That's a compliance violation. If your organization spends a million dollars or more in federal money in a year, the place that catches it has a name. It's called the single audit, and we'll do a whole video on that one soon.

A spreadsheet without this column can't tell you whether you're in trouble. So we add it now, to every grant, on day one. The Restriction Purpose field next to it is where you write the actual sentence from the award letter, in plain language. Future you, eighteen months from now, will not remember the terms. The cell will.

[VISUAL: Dropdown demo. Selecting "Yes" turns the row's accent ochre.]

One small tip. Use Data, then Data validation, to make Restricted a real dropdown. It stops the typos before they ever happen, and a typo here is the kind of thing that quietly breaks a formula three tabs away.

---

### [5:05] Chapter 4 — Budget vs. actual

[VISUAL: New tab "Budget vs Actual." A budget table: line items down the left, columns Budgeted, Spent, Remaining.]

Next tab, and this is the one that protects you. Budget versus Actual. Here you track spending against a single grant, not your whole organization, just this one award.

Down the left side, list the budget categories the funder approved. Personnel, supplies, travel, whatever the award spells out. Match their wording, not yours. If the award says "Personnel," don't call it "Staff," because at report time you want your line items to line up with theirs exactly. Then three columns across the top: Budgeted, Spent, and Remaining. Remaining is just budgeted minus spent, so let the sheet do the math. Equals B2 minus C2, and copy it down.

Why break it out by category instead of one big number? Because many funders approve your budget by category, not just as a lump sum. Say they gave you eight thousand for travel and you spend twelve. Your grand total might still be under budget, but you've overspent a category. With federal awards, for example, once you shift more than about ten percent of the total between categories, you usually need the funder's sign-off first. Tracking by line is how you catch that in March, instead of finding out at the audit in November.

[VISUAL: A "Spent" cell ticks past "Budgeted." The Remaining cell flips negative and glows red.]

---

### [6:25] Chapter 5 — The expense log

[VISUAL: Tab "Expense Log." Columns type in: Date, Grant ID, Category, Vendor, Amount, Notes.]

So how does that Spent number fill itself in? With an expense log. One tab, one row for every dollar you charge to a grant.

The columns are simple. Date, Grant ID, Category, Vendor, Amount, and a Notes field for the why. The Grant ID is the key that ties everything together. It's how each expense connects back to the right grant in your register, and it's why we gave every grant a code back in chapter two. Over on the Budget versus Actual tab, your Spent column becomes one formula, called SUMIFS. Think of it as a smart total. It scans your whole expense log and pulls only the rows that match this grant and this budget line. Log a receipt, and the budget updates itself.

[VISUAL: Type a SUMIFS formula. The matching budget line increments live.]

That single connection, expense log feeding the budget, is the difference between a spreadsheet you actually trust and one you rebuild from scratch every quarter. Get this part right and you stop doing math by hand entirely. You just log expenses as they happen, and every other tab stays current on its own.

---

### [7:40] Chapter 6 — Deadlines and a one-glance dashboard

[VISUAL: Tab "Reporting." Columns: Grant ID, Report Type, Due Date, Submitted, Status. Conditional formatting turns near dates amber, overdue red.]

Funders don't only want their money spent correctly. They want to hear about it, on a schedule. So add a Reporting tab. Grant ID, report type, due date, the date you submitted, and a status.

Now for a genuinely useful trick: conditional formatting. Select your due-date column and add a rule. If a date falls within the next thirty days, turn it amber. If it's already passed and nothing's been submitted, turn it red. Your deadlines start finding you, instead of you trying to remember them at midnight. A missed report is one of the fastest ways to lose a renewal, and it's completely avoidable.

[VISUAL: A summary card builds at the top: Total Awarded, Total Spent, % Restricted, Reports Due in 30 Days.]

And put a tiny dashboard at the top of your register. Four numbers: total awarded, total spent, the percentage of your funding that's restricted, and how many reports are due in the next thirty days. Those are just a few SUM and COUNTIFS formulas. That's your entire grant portfolio in a single glance, which is exactly the view your executive director or your board will ask for.

---

### [8:45] Chapter 7 — Lock it down before it bites you

[VISUAL: The sheet with a small lock icon over the "Award Amount" column. A File menu shows version names with dates. A share dialog flips a user from "Editor" to "Viewer."]

Before we talk about where this breaks, here are two minutes that will save you. First, protect the cells that should never change by accident. In Google Sheets that's Data, then Protect sheets and ranges. Lock your award amounts and your formulas, so a well-meaning volunteer can't overwrite the math while they're fixing a vendor name. Second, give people the right level of access. Anyone who only needs to read the numbers gets View access, not Edit. Fewer hands on the keys means fewer mystery changes you can't explain later. Third, name the file like someone will ask you about it, because someday someone will. Pick one pattern, something like Grant Tracker and the year, and save a dated copy at the end of every quarter. When a funder asks what your budget looked like back in June, you can actually show them. None of this is glamorous. It's the difference between a spreadsheet you can defend and one you have to apologize for.

### [9:45] Chapter 8 — Where the spreadsheet breaks (the honest part)

[VISUAL: The clean sheet multiplies into a mess of tabs. A frantic cursor. A filename appears: "grant_tracker_FINAL_v3_real.xlsx."]

I make grant software for a living, so let me be straight with you about where this spreadsheet stops working. Because at some point, it will.

The first crack shows up when more than one person edits the file, and you genuinely can't tell who changed the award amount, or when. There's no audit trail, and the trail is the first thing an auditor asks to see. The second comes when a single expense has to split across two grants, and no clean formula can allocate it cleanly. The third is just volume. Enough grants, and that reporting tab quietly becomes someone's full-time job.

None of that is you doing it wrong. It's a spreadsheet doing exactly what a spreadsheet does, right up until your compliance load outgrows it.

---

### [10:30] Outro / Soft CTA

[VISUAL: Split screen. The finished spreadsheet on the left. On the right, a calm GrantPipe screen showing the same grant with an automatic activity log ticking entries.]

When you hit that wall, the next step is software that keeps the audit trail for you. Every change logged on its own, with a name and a timestamp. Restricted funds kept separate by the system, so you physically can't spend them on the wrong thing. Deadlines tracked without anyone babysitting a tab. That's exactly why I built GrantPipe. It's the same structure you just put in this spreadsheet, except the audit trail and the fund accounting are handled for you, instead of resting on whoever remembers to be careful. I'm not going to pitch it hard here. The spreadsheet you just built is the right tool today, and when it stops being the right tool, you'll know, and you'll know where to look.

So go grab the free template. Drop your email at the link in the description and I'll send you both the Google Sheets and the Excel version, with every column we built today already in there. If this saved you a future headache, subscribe. The next video breaks down the single audit, in plain English, without the jargon.

Build it right the first time. The version of you sitting across from an auditor someday will be very glad you did.

[VISUAL: End card. Template link, GrantPipe wordmark, "Next up: The Single Audit, Explained."]
