---
title: "Donor Management Software FAQ: 13 Questions Before You Switch Platforms"
description: "Answers to 13 common questions about donor management software - what it tracks, how it handles soft credits, what integrations to expect, and what contract terms to read before you sign."
seoTitle: "Donor Management Software FAQ: 13 Questions Before You"
seoDescription: "What is donor management software, how does segmentation work, what is LYBUNT/SYBUNT, and what contract traps should you watch for? 13 direct answers."
targetKeyword: "donor management software"
publishedAt: "2026-04-28"
updatedAt: "2026-05-08"
lastReviewedAt: "2026-05-08"
verifiedAt: "2026-05-08"
buyerStage: "mofu"
targetPersona:
  - "development-director"
bluf: "This FAQ prevents three specific failures: switching platforms and losing 10 years of donor history because you skipped data portability review, paying 40% more in year two because you missed the price-lock expiration clause, and discovering on audit day that your donor records and grant fund records live in separate systems with no connection between them."
faqs:
  - q: "What is donor management software?"
    a: "Donor management software is a database that stores contact records, giving history, communication preferences, and engagement data for every donor, prospect, and lapsed supporter an organization tracks. It replaces spreadsheets by automating acknowledgment letters, tracking cumulative giving, segmenting donors by behavior, and generating LYBUNT/SYBUNT reports. At its most basic, it answers: who gave, how much, when, and how recently. At its most useful, it answers: who is likely to give again, at what level, and when should we ask. The category ranges from lightweight tools designed exclusively for individual giving to full constituent relationship management platforms that also handle grants, foundation relationships, and corporate sponsorships in a unified record."
  - q: "Do I need donor management software or a full CRM?"
    a: "You need donor management software if your primary use case is tracking individual giving, generating acknowledgments, and running retention reports. You need a full CRM if you are also managing major gift cultivation cycles, tracking foundation relationships, running corporate sponsorship pipelines, or managing volunteer and event data in the same system. The cost difference is real: full nonprofit CRMs start around $5,000/year; dedicated donor management tools start around $1,200/year. Buy the tool that matches your actual workflow, not the one with the most features. Organizations that buy a full CRM for three development staff members and then use 20% of its capabilities have paid for complexity they do not need."
  - q: "What data should I track for every donor?"
    a: "Every donor record should include: full legal name and preferred name, mailing address, email, phone, giving history with dates and amounts, acknowledgment status for every gift, communication preferences (mail, email, phone, or none), how they were acquired (event, direct mail, digital, referral), and any relevant notes from personal conversations. For donors above your major gift threshold, also track employment, board affiliations, and capacity indicators. Tracking more than you use creates maintenance burden - fields that are inconsistently populated produce unreliable segments. Start with what drives actual decisions - retention, upgrade asks, acknowledgment compliance - and add fields only when a specific operational need appears."
  - q: "How do I handle soft credits and matching gifts?"
    a: "A soft credit is a donor record entry that attributes a gift to a third party - typically the donor whose referral or relationship generated the contribution - without counting it in that person's hard credit giving total. Matching gifts add a second transaction: the employer's match is a separate donation, linked to the original gift, credited to the employer. Your software needs to support both without inflating individual giving totals in reports. If a donor gives $500 and their employer matches $500, total dollars raised is $1,000 but the individual donor's LYBUNT record shows $500. Platforms that conflate soft credits with hard credits produce incorrect retention and upgrade analysis."
  - q: "What is recurring giving and how does software manage it?"
    a: "Recurring giving is an automatic scheduled donation - monthly, quarterly, or annually - authorized once by the donor and processed without repeated asks. Software manages it by storing the payment authorization, triggering charges on schedule, sending automated receipts, and flagging failed charges for follow-up. The critical feature is failed payment recovery: when a card expires or a charge declines, the system should alert staff and ideally send the donor a self-service update link. Platforms vary significantly in how they handle payment failures. An unrecovered lapsed recurring donor is not a cancelled donor - they still intend to give - so the recovery workflow matters as much as the initial setup."
  - q: "How does donor segmentation work?"
    a: "Segmentation divides your donor database into groups based on shared characteristics for targeted communication. Common segment types: giving level (first-time, mid-level, major), recency (gave in the last 12 months vs. lapsed 13-36 months vs. lapsed 3+ years), acquisition channel, geographic region, and program interest. Effective segmentation requires consistent data entry - if half your records are missing acquisition source, that segment is unreliable. The practical purpose of segmentation is differentiated messaging: a lapsed donor who gave three years ago at $250 should receive a different message than a current donor who gives $50 monthly. Most donor management platforms support basic segmentation; the difference between platforms is how easily you can build and save custom segments without SQL."
  - q: "What acknowledgment features does every system need?"
    a: "At minimum: automated acknowledgment letter generation with mail merge fields, IRS-compliant language for gifts above $250 (written acknowledgment required under IRC 170(f)(8)), a log that shows each gift was acknowledged and when, and the ability to suppress acknowledgments for donors who have opted out of mail. For year-end tax receipts, the system should generate a consolidated giving summary per donor. The compliance risk of missing acknowledgments is real: donors cannot claim a charitable deduction for gifts above $250 without a written acknowledgment from the organization. Any platform that cannot produce that documentation reliably is a compliance liability. The acknowledgment log is also your audit trail if a donor claims they never received the required documentation."
  - q: "How do I migrate donor history when switching platforms?"
    a: "Migration requires four steps: export your complete donor database in a format the new platform accepts (CSV is universal; some platforms accept proprietary formats that create lock-in), map your old data fields to the new system's fields before importing (mismatched fields create silent data loss), import and verify record counts and giving totals match exactly, and retain read-only access to the old system for 90 days while you confirm nothing was lost. The most common migration failure is partial history - the new platform imports the last three years of giving but drops older records because the export was date-filtered. Verify your export includes all historical records before you start."
  - q: "What does donor management software integration with accounting look like?"
    a: "Integration between donor management and accounting should flow gift transactions in one direction: from the donor management system into the general ledger. Each batch of gifts becomes a journal entry with the correct fund allocation - unrestricted, temporarily restricted by program, temporarily restricted by year-end campaign. The integration should not require manual re-entry. If your development director reconciles gift records by typing totals into QuickBooks each month, that is a process gap that creates errors and audit exposure. The specific fund codes that gifts map to should be configured by the finance team, not assumed by the donor management platform."
  - q: "How does donor management connect to grant management?"
    a: "It often doesn't, and that is the problem. Most donor management platforms track individual giving and nothing else. Grant records, restricted fund balances, and compliance documentation live in a separate system - or in spreadsheets. The gap matters when a major donor also funds a restricted grant, when a board member's foundation gives both a personal gift and a program grant, or when you need a complete financial picture of a funder relationship for a renewal conversation. A platform that connects donor management and grant management in a single record shows you the full relationship: personal gifts, grant awards, restricted balances, and compliance status. Platforms that separate these create reconciliation work and relationship blind spots."
  - q: "What is LYBUNT/SYBUNT reporting?"
    a: "LYBUNT stands for Last Year But Unfortunately Not This Year - donors who gave in the prior fiscal year but have not yet given in the current year. SYBUNT stands for Some Year But Unfortunately Not This Year - donors who gave at some point in your history but not in the current year. Both are retention reports that identify lapsed donors for reactivation outreach. LYBUNT donors are the highest-priority reactivation segment because their lapse is recent and their giving intent is likely still active. A donor management system should produce both reports on demand, filterable by date range, giving level, and acquisition source."
  - q: "How do I calculate donor lifetime value?"
    a: "Donor lifetime value (LTV) is the total amount a donor has given across all years, plus a projected value for future giving based on retention probability and average gift. The simple version: total historical giving divided by years as a donor gives you average annual value. Multiply that by estimated remaining giving years and you have a rough LTV. The more useful version adds retention probability: a $500/year donor with 85% annual retention is worth significantly more than a $500/year donor with 40% retention. Most donor management platforms calculate historical LTV automatically. Predictive LTV requires either a platform with built-in modeling or an export to a spreadsheet where you apply retention assumptions manually."
  - q: "What contract terms should I watch for when switching platforms?"
    a: "Four terms to review before signing: data portability - does the contract guarantee you can export your complete donor history in a standard format at any time, including after cancellation? Price lock - is the introductory rate locked for more than one year, and what is the cap on annual increases? Auto-renewal - when does the contract auto-renew, and what is the cancellation notice window? User seat limits - does your current staff size fit in the base tier, and what does adding users cost? The most common contract trap in nonprofit CRM is a price lock that expires after year one, followed by a 20-40% increase at renewal. Read the renewal terms, not just the first-year price."
relatedPages:
  - "/resources/guides/donor-retention-strategies"
  - "/resources/guides/how-to-calculate-donor-retention-rate"
  - "/resources/guides/what-is-a-nonprofit-crm"
  - "/resources/guides/donor-management-software-mistakes"
  - "/resources/benchmarks/donor-retention-benchmarks-2026"
  - "/resources/best/best-donor-management-no-consultants"
tags:
  - "faq-hub"
  - "donor management"
  - "nonprofit CRM"
---

Nonprofits switch donor management platforms and lose a decade of giving history because they did not verify data portability before signing. They pay 40% more in year two because they missed the price-lock expiration clause buried in the renewal terms. They discover on audit day that their donor records and grant fund records live in separate systems with no way to reconcile them. These 13 questions address each of those failure points directly.

### What is donor management software?

Donor management software is a database that stores contact records, giving history, communication preferences, and engagement data for every donor, prospect, and lapsed supporter an organization tracks. It replaces spreadsheets by automating acknowledgment letters, tracking cumulative giving, segmenting donors by behavior, and generating LYBUNT/SYBUNT reports.

At its most basic, it answers: who gave, how much, when, and how recently. At its most useful, it answers: who is likely to give again, at what level, and when should we ask.

### Do I need donor management software or a full CRM?

You need donor management software if your primary use case is tracking individual giving, generating acknowledgments, and running retention reports. You need a full CRM if you are also managing major gift cultivation cycles, tracking foundation relationships, running corporate sponsorship pipelines, or managing volunteer and event data in the same system.

The cost difference is real: full nonprofit CRMs start around $5,000/year; dedicated donor management tools start around $1,200/year. Buy the tool that matches your actual workflow, not the one with the most features.

### What data should I track for every donor?

Every donor record should include: full legal name and preferred name, mailing address, email, phone, giving history with dates and amounts, acknowledgment status for every gift, communication preferences (mail, email, phone, or none), how they were acquired (event, direct mail, digital, referral), and any relevant notes from personal conversations.

For donors above your major gift threshold, also track employment, board affiliations, and capacity indicators. Tracking more than you use creates maintenance burden. Start with what drives actual decisions - retention, upgrade asks, acknowledgment compliance - and add fields only when a specific need appears.

### How do I handle soft credits and matching gifts?

A soft credit is a donor record entry that attributes a gift to a third party - typically the donor whose referral or relationship generated the contribution - without counting it in that person's hard credit giving total. Matching gifts add a second transaction: the employer's match is a separate donation, linked to the original gift, credited to the employer.

Your software needs to support both without inflating individual giving totals in reports. If a donor gives $500 and their employer matches $500, total dollars raised is $1,000 but the individual donor's LYBUNT record shows $500. Platforms that conflate soft credits with hard credits produce incorrect retention and upgrade analysis.

### What is recurring giving and how does software manage it?

Recurring giving is an automatic scheduled donation - monthly, quarterly, or annually - authorized once by the donor and processed without repeated asks. Software manages it by storing the payment authorization, triggering charges on schedule, sending automated receipts, and flagging failed charges for follow-up.

The critical feature is failed payment recovery: when a card expires or a charge declines, the system should alert staff and ideally send the donor a self-service update link. An unrecovered lapsed recurring donor is not a cancelled donor - they still intend to give - so the recovery workflow matters as much as the initial setup.

### How does donor segmentation work?

Segmentation divides your donor database into groups based on shared characteristics for targeted communication. Common segment types: giving level (first-time, mid-level, major), recency (gave in the last 12 months vs. lapsed 13-36 months vs. lapsed 3+ years), acquisition channel, geographic region, and program interest.

Effective segmentation requires consistent data entry - if half your records are missing acquisition source, that segment is unreliable. The practical purpose is differentiated messaging: a lapsed donor who gave three years ago at $250 should receive a different message than a current donor who gives $50 monthly. The difference between platforms is how easily you can build and save custom segments without SQL.

### What acknowledgment features does every system need?

At minimum: automated acknowledgment letter generation with mail merge fields, IRS-compliant language for gifts above $250 (written acknowledgment required under IRC 170(f)(8)), a log that shows each gift was acknowledged and when, and the ability to suppress acknowledgments for donors who have opted out of mail.

For year-end tax receipts, the system should generate a consolidated giving summary per donor. Donors cannot claim a charitable deduction for gifts above $250 without a written acknowledgment from the organization. Any platform that cannot produce that documentation reliably is a compliance liability.

### How do I migrate donor history when switching platforms?

Migration requires four steps: export your complete donor database in a format the new platform accepts, map your old data fields to the new system's fields before importing, import and verify record counts and giving totals match exactly, and retain read-only access to the old system for 90 days while you confirm nothing was lost.

The most common migration failure is partial history - the new platform imports the last three years of giving but drops older records because the export was date-filtered. Verify your export includes all historical records before you start.

### What does donor management software integration with accounting look like?

Integration between donor management and accounting should flow gift transactions in one direction: from the donor management system into the general ledger. Each batch of gifts becomes a journal entry with the correct fund allocation - unrestricted, temporarily restricted by program, temporarily restricted by campaign.

The integration should not require manual re-entry. If your development director reconciles gift records by typing totals into QuickBooks each month, that is a process gap that creates errors and audit exposure. The specific fund codes that gifts map to should be configured by the finance team, not assumed by the donor management platform.

### How does donor management connect to grant management?

It often doesn't, and that is the problem. Most donor management platforms track individual giving and nothing else. Grant records, restricted fund balances, and compliance documentation live in a separate system - or in spreadsheets.

The gap matters when a major donor also funds a restricted grant, when a board member's foundation gives both a personal gift and a program grant, or when you need a complete financial picture of a funder relationship for a renewal conversation. A platform that connects donor management and grant management shows you the full relationship: personal gifts, grant awards, restricted balances, and compliance status.

### What is LYBUNT/SYBUNT reporting?

LYBUNT stands for Last Year But Unfortunately Not This Year - donors who gave in the prior fiscal year but have not yet given in the current year. SYBUNT stands for Some Year But Unfortunately Not This Year - donors who gave at some point in your history but not in the current year.

Both are retention reports that identify lapsed donors for reactivation outreach. LYBUNT donors are the highest-priority reactivation segment because their lapse is recent and their giving intent is likely still active. A donor management system should produce both reports on demand, filterable by date range, giving level, and acquisition source.

### How do I calculate donor lifetime value?

Donor lifetime value (LTV) is the total amount a donor has given across all years, plus a projected value for future giving based on retention probability and average gift. The simple version: total historical giving divided by years as a donor gives you average annual value.

The more useful version adds retention probability: a $500/year donor with 85% annual retention is worth significantly more than a $500/year donor with 40% retention. Most platforms calculate historical LTV automatically. Predictive LTV requires either built-in modeling or an export to a spreadsheet where you apply retention assumptions manually.

### What contract terms should I watch for when switching platforms?

Four terms to review before signing: data portability (does the contract guarantee you can export complete donor history in a standard format at any time, including after cancellation?), price lock (is the introductory rate locked for more than one year, and what is the cap on annual increases?), auto-renewal (when does the contract auto-renew, and what is the cancellation notice window?), and user seat limits (does your current staff size fit in the base tier, and what does adding users cost?).

The most common trap is a price lock that expires after year one, followed by a 20-40% increase at renewal. Read the renewal terms, not just the first-year price.
