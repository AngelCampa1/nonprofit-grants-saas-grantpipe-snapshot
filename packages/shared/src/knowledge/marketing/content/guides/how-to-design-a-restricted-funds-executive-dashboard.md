---
title: "How to Design a Restricted Funds Dashboard for Executive Directors"
description: "An executive director needs to see total restricted fund balances, risk flags, upcoming reporting deadlines, and expiring funds - without reading a finance"
seoTitle: "Restricted Funds Dashboard for Executive Directors"
seoDescription: "Design a restricted funds dashboard that gives executive directors what they need: balances, risk flags, deadlines, and expiring funds - in five minutes."
publishedAt: "2026-04-26"
updatedAt: "2026-04-26"
lastReviewedAt: "2026-04-26"
buyerStage: "mofu"
contentIntent: "category"
targetKeyword: "restricted funds dashboard executives"
targetPersona:
  - "executive-director"
  - "finance-operations-staff"
schema: "HowTo"
bluf: "An Executive Director does not need a balance sheet to manage restricted funds. They need to know: how much restricted money do we have, which grants are at risk, when are reports due, and are any restrictions about to expire unused. A well-designed restricted funds dashboard answers those four questions in a single view. The challenge is designing it to be useful at a board meeting and actionable at a staff meeting."
timeEstimate: "4-6 hours to design and build; 15 minutes to review weekly"
difficulty: "intermediate"
steps:
  - title: "Define what the ED needs vs. what finance tracks"
    content: "Finance tracks everything: individual line items, allocation methodology, indirect cost charges, posting dates, variance by account code. An executive director needs the summary that answers strategic questions - not the data that feeds compliance reports. Before building the dashboard, have a conversation with the ED about what decisions she makes based on restricted fund information. Common answers: whether the organization can fund a new staff position without using restricted funds, whether there are unrestricted funds available to cover a cash flow gap while waiting for a drawdown, whether any grants are in danger of not being spent correctly, and when the next major funder report is due. The dashboard is built around those decision points - not around what is easy to display."
  - title: "Build the restricted funds summary view"
    content: "The top-level view shows total restricted assets by type. Three numbers matter: total temporarily restricted funds (purpose and time restrictions combined), total permanently restricted funds (endowments - typically shown separately since they are not expendable), and total unrestricted operating funds for context. Below the totals, show the breakdown by individual fund - grant name, funder, award amount, spent to date, remaining balance, award end date. This list should be sorted by award end date (soonest expiring first) by default. An ED reviewing this list for five minutes at the start of the week can immediately see which grants are approaching expiration with significant balances remaining - the primary operational risk in restricted fund management."
  - title: "Add risk flag indicators"
    content: "Risk flags make the summary list actionable. Three flags cover most situations. Low burn rate flag: any grant where spending is more than 20% below the expected pace given the award start date and current date. Over-budget line flag: any grant where actuals have exceeded approved budget on any budget category - a compliance issue, not just a management issue. Reporting deadline within 60 days: any grant with a required funder report due within the next two months. These flags do not require the ED to understand the underlying cause - that is finance's job. They require the ED to know that a specific fund needs attention, so she can ask the right question in the next finance staff meeting."
  - title: "Design the reporting deadlines view"
    content: "A separate view should show all upcoming reporting deadlines in calendar format. Include: funder name, grant name, report type (financial report, programmatic report, or both), due date, and the responsible staff member. Sort by due date, most imminent first. The ED needs to see the next thirty days at a glance - these are commitments that cannot be missed. The ninety-day view helps with resource planning - when multiple reports are due in the same week, finance and program staff need advance notice to prepare without a crunch. This view is also useful at board meetings when a board member asks whether the organization is current on its reporting obligations."
  - title: "Show expiring funds with clear urgency indicators"
    content: "Expiring restricted funds - awards approaching the end of the award period with remaining balances - are one of the most common and preventable compliance problems. Display funds expiring within ninety days as a highlighted list with the remaining balance and the estimated monthly spend needed to exhaust the balance by the expiration date. If the remaining balance is $40,000 and the award ends in 45 days, the monthly spend needed is approximately $27,000. If the current burn rate is $8,000 per month, that gap is visible immediately. The ED can then authorize the program staff to accelerate approved activities, initiate a no-cost extension request, or begin the conversation about returning funds - all better than discovering the problem at day 89."
  - title: "Design for the board meeting"
    content: "The board version of the restricted funds dashboard is a simplified subset of what the ED sees daily. For board reporting, show three numbers: total restricted funds (with breakdown by fund on hover or in the notes), number of active grants with reports due in the next quarter, and any funds in the red (over-budget line or extreme low burn rate). Include the compliance summary narrative - a two to three sentence statement that a board member who does not read finance reports can understand. Something like: 'All restricted fund balances are within approved budget parameters. Two grants are projecting underspend of more than 15% against remaining award period; staff are reviewing re-programming options.' Boards approve things; they do not manage compliance. Give them enough to fulfill their oversight responsibility without requiring them to read the full restricted fund register."
  - title: "Maintain the dashboard weekly"
    content: "A restricted funds dashboard only works if it is current. Assign the weekly update responsibility to a specific finance staff member - not a shared responsibility, which means no one's responsibility. The update should take fifteen to thirty minutes: reconcile any new fund receipts, post any expenses that were entered in the accounting system, update the reporting deadlines calendar for any dates that changed, and check whether any risk flags are newly triggered. The ED should be able to open the dashboard on Monday morning and trust that what she sees reflects the current state, not last week's state."
definitions:
  - term: Temporarily restricted net assets
    definition: Funds restricted by a donor or funder to a specific purpose or time period. They become available for unrestricted use when the restriction is satisfied. For grant-funded nonprofits, most active grants fall into this category.
  - term: Board-designated funds
    definition: Funds set aside by board action for a specific purpose. These are not donor-restricted - the board can rescind the designation. They appear in the unrestricted net asset class, not the restricted class. A common dashboard error is showing board designations as restricted funds.
  - term: Award end date vs. budget period end date
    definition: The award end date is when the grant agreement expires. The budget period end date may be the same or, for multi-year grants, the end of the current budget period within a longer award. For spend-down monitoring, the relevant date is the budget period end date - that is when unspent funds in the current budget period must be spent or requested for carry-forward.
faqs:
  - q: "What is the most important thing an ED should see on a restricted funds dashboard?"
    a: "The most important indicator is expiring funds with unspent balances. An ED who can see that Grant X has $35,000 remaining with 60 days left in the award period can act: authorize additional program spending on approved activities, initiate a no-cost extension request, or begin a conversation with the program officer. An ED who discovers this on day 75 of a 90-day award end period has almost no options."
  - q: "Should the restricted funds dashboard be shared with the board?"
    a: "A simplified version should be shared at board meetings as part of the financial report. Boards have a fiduciary responsibility to ensure that restricted funds are managed properly - they cannot fulfill that responsibility without seeing the restricted fund summary. The board version should not include the line-item compliance detail that finance staff need; it should show totals, risk flags, and the compliance status narrative."
  - q: "How is the restricted funds dashboard different from a financial statement?"
    a: "Financial statements are backward-looking: they report what happened in a period that has already closed. The restricted funds dashboard is forward-looking: it shows the current state and projects where you will be at the end of active award periods. Both are necessary, but they serve different purposes. The financial statement tells the auditor what happened. The dashboard tells the ED what needs attention now."
  - q: "What software can produce a restricted funds dashboard automatically?"
    a: "Purpose-built grant compliance software like GrantPipe generates the restricted funds dashboard from the same data used for accounting and compliance reporting - no manual assembly required. Organizations using QuickBooks and a separate CRM typically need to build this manually in a spreadsheet or visualization tool, pulling data from multiple sources and updating it regularly. The manual approach is workable but time-consuming; the automated approach is accurate and always current."
answers:
  - q: "What is the most important thing an ED should see on a restricted funds dashboard?"
    a: "The most important indicator is expiring funds with unspent balances. An ED who can see that Grant X has $35,000 remaining with 60 days left in the award period can act: authorize additional program spending on approved activities, initiate a no-cost extension request, or begin a conversation with the program officer. An ED who discovers this on day 75 of a 90-day award end period has almost no options."
  - q: "Should the restricted funds dashboard be shared with the board?"
    a: "A simplified version should be shared at board meetings as part of the financial report. Boards have a fiduciary responsibility to ensure that restricted funds are managed properly - they cannot fulfill that responsibility without seeing the restricted fund summary. The board version should not include the line-item compliance detail that finance staff need; it should show totals, risk flags, and the compliance status narrative."
relatedPages:
  - "/restricted-fund-tracking-software/"
  - "/books/"
  - "/resources/topics/restricted-fund-accounting/"
  - "/resources/guides/restricted-fund-tracking"
leadMagnetSlug: "restricted-funds-release-calculator"
tags:
  - "guide"
  - "dashboard"
  - "restricted funds"
  - "executive director"
---

Executive Directors do not fail at restricted fund management because they do not care about compliance. They fail because nobody designed an information system that makes the right things visible without requiring a finance degree to read.

A finance director who works with restricted funds daily knows what the balance is on every active grant. An ED who gets that information twice a year at audit time, and once a month in a financial report that requires context to interpret, is flying on partial information.

The restricted funds dashboard is the bridge. It translates the finance department's working knowledge into a management-ready view that supports the decisions an ED actually makes.

## The Four Questions That Drive the Design

Before building anything, clarify what decisions the dashboard will support. Most EDs need answers to four questions:

How much restricted money do we have, by fund? This is the basic inventory - what obligations exist and what balances are available to fulfill them.

Are any grants in trouble? Not "is anything wrong in the general ledger?" but specifically: is there a grant where spending is not on pace, a budget line that has been over-spent, or a reporting deadline about to be missed?

What is due soon? Funder reports, drawdown requests, program officer meetings - the obligations that have to happen on specific dates whether the organization is ready or not.

Are any funds about to expire with money left? This is the most actionable question on the dashboard because there is still time to do something about it - if the ED sees it soon enough.

Build the dashboard to answer those four questions. Everything else is detail that finance needs but the ED does not.

## What Finance Tracks vs. What the ED Needs

Finance tracks the underlying data: individual journal entries, allocation percentages, indirect cost rate calculations, chart of accounts coding, period-end reconciliation. This is correct and necessary. It is not what belongs on the ED dashboard.

The dashboard summarizes the finance team's work into a management view. A restricted fund balance on the dashboard is not the same as the fund balance in the general ledger - it is a calculated summary that the finance team has verified and certified as accurate. The ED trusts the number because the finance team stands behind it, not because she can audit it herself.

This distinction matters for dashboard design. Finance staff want dashboards that show them where to look for problems. EDs want dashboards that show them what requires a decision. Design for the decision-maker's needs, not the analyst's needs.

## The Board Meeting Version

Once the ED is using the restricted funds dashboard, the next request is usually a board-ready version. Boards have fiduciary responsibility for restricted fund management but do not need operational detail.

The board version shows: total restricted fund balance (with fund-level detail available on request), compliance status narrative ("all funds within approved budget parameters" or "one fund with low burn rate under review"), reporting deadlines for the quarter, and any material risks that require board awareness.

At a board meeting, this information takes three to five minutes to present - not the twenty minutes that a detailed financial report requires. Board members can ask follow-up questions if they want detail; the dashboard gives them enough to fulfill their oversight responsibility without putting them in the position of managing compliance directly.

## The Weekly Maintenance Habit

The dashboard is only useful if it is current. An ED who opens the restricted funds dashboard on Monday and finds data from the previous Thursday is making decisions based on stale information.

The weekly update is a fifteen-minute process for a finance staff member who is already maintaining the fund records in the accounting system. Post any new transactions, update reporting deadline statuses, check whether any risk flags are newly triggered, and mark the dashboard as reviewed with the current date.

This is not a time-consuming process. It requires discipline - the same discipline as any other weekly reporting practice. When it is built into the close-of-week routine, it becomes automatic. When it is not built in, the dashboard becomes unreliable and eventually stops being used.

The cost of the dashboard being accurate is fifteen minutes per week. The cost of it being inaccurate - an expiring grant discovered too late, a compliance problem not caught until audit - is significantly higher.
