---
title: "Development Operations FAQ: 20 Questions Nonprofits Ask About Running a Modern Dev Shop"
description: "Plain answers to 20 development operations questions covering CRM hygiene, gift processing, data integrity, donor segmentation, fundraising metrics, and the back-office systems that make a development team run."
seoTitle: "Development Operations FAQ: 20 Questions Nonprofits Ask"
seoDescription: "How do you process gifts faster? What CRM hygiene matters? How do you segment donors? 20 plain answers for nonprofit operations and development teams."
targetKeyword: "nonprofit development operations"
publishedAt: "2026-04-29"
updatedAt: "2026-04-29"
lastReviewedAt: "2026-04-29"
buyerStage: "mofu"
contentIntent: "category"
topicCluster: "donor-operations"
schema: "FAQPage"
bluf: "Development operations is the back-office work that turns donor relationships into revenue. Done well, it is invisible. Done poorly, it shows up as missed gifts, late acknowledgments, dirty data, and lost donors. A working dev ops function needs four disciplines: gift processing, data hygiene, segmentation, and reporting - in that order."
faqs:
  - q: "What is development operations?"
    a: "Development operations (often shortened to dev ops, advancement services, or fundraising operations) is the back-office function that supports fundraising activity: gift processing, acknowledgment and receipting, data entry and CRM management, prospect research, donor segmentation, fundraising analytics, and the systems that hold all of it. It is distinct from fundraising itself - the relationship work - and from finance, which records gifts in the general ledger. At small nonprofits, dev ops is one part of the development director's role. At mid-sized nonprofits, it is a 0.5 to 2 FTE function. At large institutions, it is a department of 10 or more."
  - q: "How quickly should we acknowledge a gift?"
    a: "Within 48 hours of receipt is the goal for any gift over $100. Within 7 days is acceptable for smaller gifts. The acknowledgment must include the standard IRS-required language for gifts of $250 or more - the donor's name, the gift amount, the date, a statement that no goods or services were provided in exchange (or a description and good-faith estimate of any goods or services), and the nonprofit's name and tax ID. Slow acknowledgments are the most common reason donors stop giving. The Association of Fundraising Professionals' research suggests donor retention drops sharply when first-time donors are not acknowledged within two weeks."
  - q: "What is gift processing?"
    a: "Gift processing is the workflow that moves a donation from receipt to recorded gift in the CRM and accounting system. The full cycle includes: opening the mail or downloading the online deposit, recording the gift (donor, amount, date, source, fund, restriction, soft credits), depositing the funds, generating the acknowledgment, updating donor history and segmentation flags, and reconciling totals with the finance team. The standard target for a mid-sized nonprofit is gifts processed within 3 business days of receipt. Bottlenecks at this stage cascade - late processing means late acknowledgments means lower retention."
  - q: "What does CRM hygiene mean?"
    a: "CRM hygiene is the ongoing work of keeping donor records accurate: deduplication of contact records, address updates from NCOA (National Change of Address) and returned mail, deceased donor flags, household and relationship linking, employer updates, and consistent coding of source, appeal, and fund. Hygiene is unglamorous and never finished. The standard is at least one full-database NCOA run per year, monthly deduplication checks during gift processing, and quarterly reviews of segmentation flags. A development team running clean data spends 5% to 10% of staff time on hygiene; a team running dirty data wastes 20% to 30% of fundraiser time on lookups and corrections."
  - q: "How do I segment donors?"
    a: "Start with the basics: recency (when was the last gift), frequency (how many gifts in the last 24 months), and monetary (lifetime giving and largest gift). Add: source (how the donor first connected), appeal (which campaigns they respond to), interest (which programs they have given to or attended events for), and relationship (who on staff knows them). For a mid-sized nonprofit, 5 to 8 segments are usually enough: new donors, lapsed donors, recurring donors, mid-level donors, major donors, board members, lapsed major donors, and special interest groups. More segments produce more work without more revenue."
  - q: "What is donor retention rate?"
    a: "Donor retention rate is the percentage of donors who gave in one year and gave again the next year. The first-time donor retention rate (donors retained from their very first gift) is usually 20% to 30% across the sector - meaning 70% to 80% of first-time donors do not give again. The repeat donor retention rate (donors who have given two or more times) is usually 60% to 70%. Tracked monthly and reviewed quarterly, retention is the single most diagnostic fundraising metric - it reveals problems with stewardship, gift processing, and acknowledgment quality before they show up in revenue."
  - q: "How do I calculate cost per dollar raised?"
    a: "Cost per dollar raised (CPDR) is total fundraising expenses divided by total revenue raised, expressed as a ratio. Direct mail typically runs $0.20 to $0.40 per dollar. Major gifts typically run $0.05 to $0.15. Special events typically run $0.40 to $0.60 (often higher for the first year of a new event). Online acquisition is highly variable, often $1.00+ in the first year and dropping to $0.20 in subsequent years through retention. Aggregate CPDR for a healthy mid-sized fundraising program runs $0.20 to $0.30 across all channels. The ratio is most useful as a trend for a single channel over time, not as a snapshot."
  - q: "What is a soft credit?"
    a: "A soft credit is the recognition of a gift to a person or entity who did not actually make the donation - usually a spouse who shares household giving, a donor whose donor-advised fund made the grant, an estate executor, or a corporation whose matching gift was triggered by an employee. Hard credits go to the legal donor (the entity whose name appears on the check or the DAF account). Soft credits go to the related party. CRMs handle this with parallel hard and soft credit fields. Get this right or major donor reports will undercount engaged households by 20% or more."
  - q: "How do I handle anonymous donors?"
    a: "Tag the donor record as anonymous in the CRM, exclude them from public recognition lists (annual report, donor walls, event programs), but keep their information internally for stewardship and acknowledgment. Anonymous gifts still require IRS-compliant acknowledgments to the donor - the anonymity is from the public, not from the IRS. Some donors request full anonymity even internally; in that case, restrict CRM access to a small set of staff who need to know. Document the donor's specific anonymity preference in the record so a new development director does not accidentally publish them."
  - q: "What is a recurring giving program?"
    a: "A recurring giving program (sometimes called sustainer giving or monthly giving) lets donors set up automatic gifts on a regular cadence, usually monthly. Recurring donors retain at far higher rates than one-time donors - typically 80% to 90% year-over-year compared with 40% to 50% for one-time donors - and the revenue is more predictable. Setup requires a payment processor that supports recurring billing (Stripe, Authorize.net, or specialized vendors), a donor-facing landing page, automated thank-you emails, automatic card-update flows for expired cards, and a clear cancellation path. Card decline recovery is the most under-implemented feature; declined cards left unhandled lose 5% to 10% of recurring revenue per year."
  - q: "How do I report fundraising results to the board?"
    a: "A standard quarterly board fundraising report includes: revenue year-to-date by source (individual, foundation, corporate, government, events) compared to budget and prior year, donor counts by segment with retention rates, major gift pipeline status (qualified prospects, asks in process, recent closed gifts), upcoming campaigns and their projected revenue, and the one-page fundraising scorecard with key ratios. Length: 3 to 5 pages. Cadence: quarterly. The most common mistake is presenting only revenue without donor counts; a flat year of revenue from fewer donors is a worse result than a flat year from more donors, and the difference predicts next year's performance."
  - q: "What is a development calendar?"
    a: "A development calendar is the master schedule of all fundraising activity for the fiscal year - direct mail drops, email campaigns, events, grant deadlines, board solicitations, major gift cultivation visits, donor stewardship touches, and reporting cycles. It is usually maintained as a shared spreadsheet or in the CRM's calendar module, reviewed monthly with the team, and locked in by quarter so program staff can plan around fundraising activity. The calendar is the most important coordination tool in dev ops; without it, channels collide (an email goes the same week as a major gift ask, depressing both) and donors receive contradictory communications."
  - q: "Should we use a separate database for grants?"
    a: "Probably not. The grant lifecycle - opportunity research, proposal pipeline, award tracking, restricted fund accounting, reporting - touches the same donors and the same restricted funds as individual giving. Splitting the data across two systems creates reconciliation work, missed connections (the major donor who serves on the family foundation board, the corporate sponsor who is also a corporate foundation grantor), and dual data entry. The right architecture is one CRM with both individual and grant pipelines, sharing the same fund records and contact records. GrantPipe was built for exactly this need at mid-sized nonprofits."
  - q: "What is a fundraising audit?"
    a: "A fundraising audit (different from a financial audit) is a structured review of the fundraising program - staffing, donor portfolio, channels, ratios, technology, and process - usually done by an outside consultant every 3 to 5 years or after a major leadership change. The output is a written report with recommendations, typically focused on highest-leverage moves: improving retention by 5 percentage points, building out a missing channel, fixing a CRM that has accumulated technical debt, restructuring portfolios. Costs run $15K to $60K depending on scope. AFP and CASE both maintain consultant directories. Skip the audit if you have a clear-eyed development director and a strong board chair; do it if you do not."
  - q: "How do I handle a stock gift?"
    a: "Provide the donor's broker with your nonprofit's brokerage account number and DTC instructions. Once the stock arrives, sell it the same day - your gift acceptance policy should require this - to avoid market exposure. Record the gift at the average of the high and low trading prices on the date of transfer (this is the IRS-recognized fair market value). Send the donor an acknowledgment that names the security and the number of shares but does not state a dollar value (the donor's tax advisor calculates that). Track the transaction date, the broker, the share count, and the realized cash. Stock gifts are often a donor's largest annual contribution and frequently underrecorded in CRMs."
  - q: "What is the difference between a donor and a constituent?"
    a: "A donor is a person or entity who has made a financial gift. A constituent is anyone in your CRM - donors, volunteers, board members, alumni, prospects, event attendees, vendors, advisory council members, and so on. The constituent record is the master record; donor history is one set of fields on that record. Treating donors as a separate database from constituents creates duplicate records and breaks the relational model. The right structure is one constituent record per person with role flags (donor, volunteer, board, etc.) that can apply individually or in combination."
  - q: "How do I prevent gift entry errors?"
    a: "Three controls: (1) double-entry verification - a second person reviews high-dollar gifts and a sample of routine gifts before posting, (2) automated balancing - daily reconciliation between the CRM gift batch total and the bank deposit total catches discrepancies in 24 hours, (3) clear coding rules - written documentation of which fund codes go with which appeals and campaigns, refreshed annually. Error rates above 0.5% of gift count or 1% of gift dollars indicate process problems, not human problems. Most error patterns trace to ambiguous coding rules or rushed end-of-year processing."
  - q: "What software does a mid-sized nonprofit need?"
    a: "Five categories: a CRM that holds constituents and gifts (Salesforce NPSP, Bloomerang, Virtuous, GrantPipe, or others), an accounting system that tracks restricted funds (QuickBooks for smaller orgs, Sage Intacct or NetSuite for larger), a payment processor (Stripe, Authorize.net), an email marketing platform (Mailchimp, Constant Contact, or a CRM-integrated tool), and an online donation page (often integrated with the CRM). Larger organizations add wealth screening, marketing automation, and BI tools. The integration between CRM and accounting is usually the weakest link; mid-sized nonprofits commonly run on monthly manual reconciliation rather than real-time sync, which is acceptable but error-prone."
  - q: "How do I manage data privacy for donors?"
    a: "Three obligations: (1) honor opt-outs - when a donor asks to be removed from mail, email, or solicitation, that preference must be respected across all channels, not just the one they used to opt out, (2) protect personally identifiable information (PII) - restrict CRM access by role, encrypt at rest and in transit, never email full credit card numbers or SSNs, (3) follow applicable privacy laws - California's CCPA, Virginia's CDPA, and similar state laws apply to nonprofits with sufficient state-level activity, and the GDPR applies to gifts from EU residents. The donor bill of rights (AFP) is a useful internal policy starting point even where law does not require it."
  - q: "How does GrantPipe support development operations?"
    a: "GrantPipe combines donor management and grant management in one system, eliminating the most painful operations problem at mid-sized nonprofits - reconciling constituents, gifts, and restricted funds across two databases. It includes gift workflows, acknowledgment templates, soft credit handling, donor segmentation, household linking, restricted fund tracking, custom fields, role-based access, the activity log audit trail, and email platform integrations. It is built for $500K to $10M nonprofits with one to three development staff who need a serious operations stack without the cost or complexity of Salesforce or Blackbaud."
relatedPages:
  - "/resources/guides/donor-retention-strategies"
  - "/resources/guides/donor-retention-reporting-for-boards"
  - "/resources/guides/how-to-calculate-donor-retention-rate"
  - "/resources/guides/donor-stewardship-plan-12-month-guide"
  - "/resources/guides/donor-thank-you-letter-templates-examples"
  - "/resources/faq/faq-donor-management-software"
sourceUrls:
  - "https://www.irs.gov/charities-non-profits/charitable-contributions-substantiation-and-disclosure-requirements"
  - "https://afpglobal.org/"
  - "https://mrbenchmarks.com/"
tags:
  - "development operations"
  - "fundraising operations"
  - "donor management"
---

## Who this is for

This FAQ is for development directors, operations managers, and executive directors at mid-sized US nonprofits who need to make the back-office side of fundraising actually work. It is also useful for new dev ops hires who inherited a system someone else built, and for board treasurers who want to understand why fundraising data and accounting data do not always agree.

It assumes you know what a CRM is and what a gift is. It does not assume any prior dev ops training or technical background. The recommendations are calibrated for organizations with $500K to $10M operating budgets and one to three development staff.

## How to navigate

The questions move from speed and accuracy basics (gift processing, acknowledgments) through data quality (hygiene, segmentation) to reporting and infrastructure (board reports, software stack, privacy). Skim the table of contents and jump to whatever is breaking right now. The related pages dig deeper into retention, stewardship, and donor management software comparisons.

A reminder about scale: most published "best practices" for fundraising operations describe what universities and large national charities do. Their staffing, technology budgets, and donor volumes are different from yours. The advice here is calibrated for a one or two-person dev ops function, not a 15-person advancement services department.

## Frequently asked questions

### What is development operations?

Development operations (often shortened to dev ops, advancement services, or fundraising operations) is the back-office function that supports fundraising activity: gift processing, acknowledgment and receipting, data entry and CRM management, prospect research, donor segmentation, fundraising analytics, and the systems that hold all of it. It is distinct from fundraising itself - the relationship work - and from finance, which records gifts in the general ledger. At small nonprofits, dev ops is one part of the development director's role. At mid-sized nonprofits, it is a 0.5 to 2 FTE function. At large institutions, it is a department of 10 or more.

### How quickly should we acknowledge a gift?

Within 48 hours of receipt is the goal for any gift over $100. Within 7 days is acceptable for smaller gifts. The acknowledgment must include the standard IRS-required language for gifts of $250 or more - the donor's name, the gift amount, the date, a statement that no goods or services were provided in exchange (or a description and good-faith estimate of any goods or services), and the nonprofit's name and tax ID. Slow acknowledgments are the most common reason donors stop giving. The Association of Fundraising Professionals' research suggests donor retention drops sharply when first-time donors are not acknowledged within two weeks.

### What is gift processing?

Gift processing is the workflow that moves a donation from receipt to recorded gift in the CRM and accounting system. The full cycle includes: opening the mail or downloading the online deposit, recording the gift (donor, amount, date, source, fund, restriction, soft credits), depositing the funds, generating the acknowledgment, updating donor history and segmentation flags, and reconciling totals with the finance team. The standard target for a mid-sized nonprofit is gifts processed within 3 business days of receipt. Bottlenecks at this stage cascade - late processing means late acknowledgments means lower retention.

### What does CRM hygiene mean?

CRM hygiene is the ongoing work of keeping donor records accurate: deduplication of contact records, address updates from NCOA (National Change of Address) and returned mail, deceased donor flags, household and relationship linking, employer updates, and consistent coding of source, appeal, and fund. Hygiene is unglamorous and never finished. The standard is at least one full-database NCOA run per year, monthly deduplication checks during gift processing, and quarterly reviews of segmentation flags. A development team running clean data spends 5% to 10% of staff time on hygiene; a team running dirty data wastes 20% to 30% of fundraiser time on lookups and corrections.

### How do I segment donors?

Start with the basics: recency (when was the last gift), frequency (how many gifts in the last 24 months), and monetary (lifetime giving and largest gift). Add: source (how the donor first connected), appeal (which campaigns they respond to), interest (which programs they have given to or attended events for), and relationship (who on staff knows them). For a mid-sized nonprofit, 5 to 8 segments are usually enough: new donors, lapsed donors, recurring donors, mid-level donors, major donors, board members, lapsed major donors, and special interest groups. More segments produce more work without more revenue.

### What is donor retention rate?

Donor retention rate is the percentage of donors who gave in one year and gave again the next year. The first-time donor retention rate (donors retained from their very first gift) is usually 20% to 30% across the sector - meaning 70% to 80% of first-time donors do not give again. The repeat donor retention rate (donors who have given two or more times) is usually 60% to 70%. Tracked monthly and reviewed quarterly, retention is the single most diagnostic fundraising metric - it reveals problems with stewardship, gift processing, and acknowledgment quality before they show up in revenue.

### How do I calculate cost per dollar raised?

Cost per dollar raised (CPDR) is total fundraising expenses divided by total revenue raised, expressed as a ratio. Direct mail typically runs $0.20 to $0.40 per dollar. Major gifts typically run $0.05 to $0.15. Special events typically run $0.40 to $0.60 (often higher for the first year of a new event). Online acquisition is highly variable, often $1.00+ in the first year and dropping to $0.20 in subsequent years through retention. Aggregate CPDR for a healthy mid-sized fundraising program runs $0.20 to $0.30 across all channels. The ratio is most useful as a trend for a single channel over time, not as a snapshot.

### What is a soft credit?

A soft credit is the recognition of a gift to a person or entity who did not actually make the donation - usually a spouse who shares household giving, a donor whose donor-advised fund made the grant, an estate executor, or a corporation whose matching gift was triggered by an employee. Hard credits go to the legal donor (the entity whose name appears on the check or the DAF account). Soft credits go to the related party. CRMs handle this with parallel hard and soft credit fields. Get this right or major donor reports will undercount engaged households by 20% or more.

### How do I handle anonymous donors?

Tag the donor record as anonymous in the CRM, exclude them from public recognition lists (annual report, donor walls, event programs), but keep their information internally for stewardship and acknowledgment. Anonymous gifts still require IRS-compliant acknowledgments to the donor - the anonymity is from the public, not from the IRS. Some donors request full anonymity even internally; in that case, restrict CRM access to a small set of staff who need to know. Document the donor's specific anonymity preference in the record so a new development director does not accidentally publish them.

### What is a recurring giving program?

A recurring giving program (sometimes called sustainer giving or monthly giving) lets donors set up automatic gifts on a regular cadence, usually monthly. Recurring donors retain at far higher rates than one-time donors - typically 80% to 90% year-over-year compared with 40% to 50% for one-time donors - and the revenue is more predictable. Setup requires a payment processor that supports recurring billing (Stripe, Authorize.net, or specialized vendors), a donor-facing landing page, automated thank-you emails, automatic card-update flows for expired cards, and a clear cancellation path. Card decline recovery is the most under-implemented feature; declined cards left unhandled lose 5% to 10% of recurring revenue per year.

### How do I report fundraising results to the board?

A standard quarterly board fundraising report includes: revenue year-to-date by source (individual, foundation, corporate, government, events) compared to budget and prior year, donor counts by segment with retention rates, major gift pipeline status (qualified prospects, asks in process, recent closed gifts), upcoming campaigns and their projected revenue, and the one-page fundraising scorecard with key ratios. Length: 3 to 5 pages. Cadence: quarterly. The most common mistake is presenting only revenue without donor counts; a flat year of revenue from fewer donors is a worse result than a flat year from more donors, and the difference predicts next year's performance.

### What is a development calendar?

A development calendar is the master schedule of all fundraising activity for the fiscal year - direct mail drops, email campaigns, events, grant deadlines, board solicitations, major gift cultivation visits, donor stewardship touches, and reporting cycles. It is usually maintained as a shared spreadsheet or in the CRM's calendar module, reviewed monthly with the team, and locked in by quarter so program staff can plan around fundraising activity. The calendar is the most important coordination tool in dev ops; without it, channels collide (an email goes the same week as a major gift ask, depressing both) and donors receive contradictory communications.

### Should we use a separate database for grants?

Probably not. The grant lifecycle - opportunity research, proposal pipeline, award tracking, restricted fund accounting, reporting - touches the same donors and the same restricted funds as individual giving. Splitting the data across two systems creates reconciliation work, missed connections (the major donor who serves on the family foundation board, the corporate sponsor who is also a corporate foundation grantor), and dual data entry. The right architecture is one CRM with both individual and grant pipelines, sharing the same fund records and contact records. GrantPipe was built for exactly this need at mid-sized nonprofits.

### What is a fundraising audit?

A fundraising audit (different from a financial audit) is a structured review of the fundraising program - staffing, donor portfolio, channels, ratios, technology, and process - usually done by an outside consultant every 3 to 5 years or after a major leadership change. The output is a written report with recommendations, typically focused on highest-leverage moves: improving retention by 5 percentage points, building out a missing channel, fixing a CRM that has accumulated technical debt, restructuring portfolios. Costs run $15K to $60K depending on scope. AFP and CASE both maintain consultant directories. Skip the audit if you have a clear-eyed development director and a strong board chair; do it if you do not.

### How do I handle a stock gift?

Provide the donor's broker with your nonprofit's brokerage account number and DTC instructions. Once the stock arrives, sell it the same day - your gift acceptance policy should require this - to avoid market exposure. Record the gift at the average of the high and low trading prices on the date of transfer (this is the IRS-recognized fair market value). Send the donor an acknowledgment that names the security and the number of shares but does not state a dollar value (the donor's tax advisor calculates that). Track the transaction date, the broker, the share count, and the realized cash. Stock gifts are often a donor's largest annual contribution and frequently underrecorded in CRMs.

### What is the difference between a donor and a constituent?

A donor is a person or entity who has made a financial gift. A constituent is anyone in your CRM - donors, volunteers, board members, alumni, prospects, event attendees, vendors, advisory council members, and so on. The constituent record is the master record; donor history is one set of fields on that record. Treating donors as a separate database from constituents creates duplicate records and breaks the relational model. The right structure is one constituent record per person with role flags (donor, volunteer, board, etc.) that can apply individually or in combination.

### How do I prevent gift entry errors?

Three controls: (1) double-entry verification - a second person reviews high-dollar gifts and a sample of routine gifts before posting, (2) automated balancing - daily reconciliation between the CRM gift batch total and the bank deposit total catches discrepancies in 24 hours, (3) clear coding rules - written documentation of which fund codes go with which appeals and campaigns, refreshed annually. Error rates above 0.5% of gift count or 1% of gift dollars indicate process problems, not human problems. Most error patterns trace to ambiguous coding rules or rushed end-of-year processing.

### What software does a mid-sized nonprofit need?

Five categories: a CRM that holds constituents and gifts (Salesforce NPSP, Bloomerang, Virtuous, GrantPipe, or others), an accounting system that tracks restricted funds (QuickBooks for smaller orgs, Sage Intacct or NetSuite for larger), a payment processor (Stripe, Authorize.net), an email marketing platform (Mailchimp, Constant Contact, or a CRM-integrated tool), and an online donation page (often integrated with the CRM). Larger organizations add wealth screening, marketing automation, and BI tools. The integration between CRM and accounting is usually the weakest link; mid-sized nonprofits commonly run on monthly manual reconciliation rather than real-time sync, which is acceptable but error-prone.

### How do I manage data privacy for donors?

Three obligations: (1) honor opt-outs - when a donor asks to be removed from mail, email, or solicitation, that preference must be respected across all channels, not just the one they used to opt out, (2) protect personally identifiable information (PII) - restrict CRM access by role, encrypt at rest and in transit, never email full credit card numbers or SSNs, (3) follow applicable privacy laws - California's CCPA, Virginia's CDPA, and similar state laws apply to nonprofits with sufficient state-level activity, and the GDPR applies to gifts from EU residents. The donor bill of rights (AFP) is a useful internal policy starting point even where law does not require it.

### How does GrantPipe support development operations?

GrantPipe combines donor management and grant management in one system, eliminating the most painful operations problem at mid-sized nonprofits - reconciling constituents, gifts, and restricted funds across two databases. It includes gift workflows, acknowledgment templates, soft credit handling, donor segmentation, household linking, restricted fund tracking, custom fields, role-based access, the activity log audit trail, and email platform integrations. It is built for $500K to $10M nonprofits with one to three development staff who need a serious operations stack without the cost or complexity of Salesforce or Blackbaud.

## Where to go next

For retention deep-dives, see the [donor retention strategies guide](/resources/guides/donor-retention-strategies) and [how to calculate donor retention rate](/resources/guides/how-to-calculate-donor-retention-rate). For board-facing reporting, see [donor retention reporting for boards](/resources/guides/donor-retention-reporting-for-boards). For acknowledgment templates, see [donor thank you letter templates](/resources/guides/donor-thank-you-letter-templates-examples).
