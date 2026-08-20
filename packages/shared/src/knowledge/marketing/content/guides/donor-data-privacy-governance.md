---
title: "Donor Data Privacy for Nonprofits: A Practical Governance Guide"
description: "How mid-sized US nonprofits should handle donor personal data, including privacy laws, opt-out handling, role-based access, retention, and governance."
seoTitle: "Donor Data Privacy for Nonprofits: Practical Guide"
seoDescription: "Which privacy laws apply? How to handle opt-outs, PII, deletion requests? Practical donor data privacy guide for US nonprofits."
targetKeyword: "donor data privacy nonprofit"
publishedAt: "2026-04-29"
updatedAt: "2026-04-29"
lastReviewedAt: "2026-04-29"
buyerStage: "tofu"
contentIntent: "category"
topicCluster: "donor-operations"
schema: "Article"
bluf: "Donor data privacy is partly a legal obligation and partly a trust obligation. Most US nonprofits are not directly covered by HIPAA or sector-specific privacy regimes, but state privacy laws (California, Virginia, Colorado, Connecticut, others) increasingly do apply, GDPR applies to gifts from EU residents, and the donor bill of rights creates an enforceable expectation regardless of law. A working privacy program needs four things: documented opt-out handling, role-based access, a written retention policy, and a process for honoring deletion and access requests."
faqs:
  - q: "Does GDPR apply to US nonprofits?"
    a: "Yes, when you process the personal data of individuals located in the European Union - even if the nonprofit is US-based and the gift was solicited from the US. A donor in France who gives to a US nonprofit through your online donation page is covered by GDPR. The most common compliance gap is the opt-in standard: GDPR requires affirmative consent for marketing communications, where US practice often defaults to opt-out. If you have any meaningful EU donor base, build GDPR-compliant consent flows."
  - q: "What is the donor bill of rights?"
    a: "The Donor Bill of Rights, jointly developed by AFP, AHP, CASE, and the Giving Institute in 1993, is a statement of ten principles that donors can expect from any organization soliciting funds. It includes the right to know how donations will be used, the right to anonymity, the right to be removed from solicitation lists, and the right to know who has access to donor records. It is not a law, but it has become a de facto standard that funders, watchdogs, and sophisticated donors expect nonprofits to honor. Most nonprofit privacy policies cite it directly."
  - q: "How long should we keep donor data?"
    a: "Tax-related records (gift receipts, acknowledgments, IRS filings) must be kept at least 7 years per IRS guidance on charitable contribution substantiation. Donor relationship data - contact information, communication preferences, gift history - is typically kept indefinitely while the relationship is active and for 7 to 10 years after the last gift, then either anonymized or deleted. Retention policies should be documented in writing, reviewed annually, and applied consistently across the database. Avoid keeping data 'just in case' beyond your stated retention window."
  - q: "What is a data subject access request?"
    a: "A data subject access request (DSAR) is a formal request by a donor to see what personal data your nonprofit holds about them, where it came from, who it has been shared with, and how it is being used. GDPR creates a legal right to make this request for EU residents, and several US state laws extend similar rights. Even where law does not require it, granting access requests on demand is good practice. Most CRMs can produce a per-donor data export in 30 minutes; the harder part is the policy decision about who can request, who can fulfill, and how identity is verified."
  - q: "Do we need a written privacy policy?"
    a: "Yes - both as a legal matter and as a trust matter. Your privacy policy should be linked from your website footer, your online donation page, and your email footer. It should cover what data you collect, how you collect it, how you use it, who you share it with (vendors, processors, never sold), how donors can opt out or request deletion, and how to contact you about privacy questions. Keep it readable. Most nonprofit privacy policies are too long, too legalistic, and not actually read by donors. A 600 to 1,000 word policy in plain English is sufficient for most mid-sized nonprofits."
targetPersona:
  - "Executive Director"
  - "Development Director"
  - "Operations Manager"
relatedPages:
  - "/resources/guides/donor-stewardship-plan-12-month-guide"
  - "/resources/guides/donor-thank-you-letter-templates-examples"
  - "/resources/guides/donor-retention-strategies"
  - "/resources/guides/donor-wealth-screening-guide"
  - "/resources/faq/faq-development-operations"
sourceUrls:
  - "https://oag.ca.gov/privacy/ccpa"
  - "https://gdpr-info.eu/"
  - "https://afpglobal.org/donor-bill-rights"
  - "https://www.irs.gov/charities-non-profits/charitable-contributions-substantiation-and-disclosure-requirements"
statistics:
  - stat: "California's CCPA applies to for-profit businesses meeting certain thresholds; nonprofits are generally exempt from CCPA but increasingly subject to comparable state laws like CPRA's downstream service-provider obligations and other state privacy regimes."
    source: "California Office of the Attorney General"
    sourceUrl: "https://oag.ca.gov/privacy/ccpa"
  - stat: "GDPR fines can reach the greater of ¬20 million or 4% of global annual revenue for serious violations, applicable to any organization processing EU residents' personal data."
    source: "European Commission"
    sourceUrl: "https://gdpr-info.eu/art-83-gdpr/"
tags:
  - "donor data"
  - "privacy"
  - "governance"
---

## Definition

Donor data privacy governance is the set of policies and practices that determine how a nonprofit collects, stores, uses, shares, and disposes of personal information about its donors. It covers legal compliance (state and federal privacy laws, sector-specific rules), contractual obligations (vendor data processing agreements), and ethical obligations (the donor bill of rights, basic respect for donor wishes). At a mid-sized US nonprofit, donor data privacy is usually owned by the development director or operations manager rather than by a dedicated privacy officer, but the work is real and increasingly load-bearing as state privacy laws proliferate.

This guide covers what laws actually apply, how to set up the basic controls (opt-outs, role-based access, retention, deletion), and how to handle the request types you will see in practice. It is not legal advice; consult a privacy attorney before publishing your policy or handling a high-stakes request.

## What laws actually apply

US nonprofits are not subject to a single federal privacy law that covers donor data. Instead, you operate in a patchwork:

**HIPAA** applies if you provide healthcare services. Most nonprofits do not, but if you operate a clinic, run a substance use treatment program, or handle protected health information for clients, HIPAA is in scope. Donor data per se is not protected health information, but if a donor is also a client of your healthcare program, the boundary matters.

**State privacy laws** are the fastest-evolving area. California's CCPA exempts most nonprofits as a structural matter (it applies to for-profit "businesses" meeting revenue and data thresholds), but Virginia's CDPA, Colorado's CPA, Connecticut's CTDPA, and several other state laws have varying treatments of nonprofits. Some laws apply when nonprofits process data on behalf of for-profit businesses (vendor relationships); others apply directly. The trend is toward broader nonprofit coverage, not narrower. Track the law in states where you have a meaningful donor base.

**GDPR** applies whenever you process personal data of individuals located in the European Union. A donor in France giving through your online donation page is covered. A US donor traveling in Spain is generally not (location matters, not citizenship). GDPR fines are real - up to ¬20 million or 4% of global annual revenue for serious violations. For a US nonprofit, the practical exposure is reputational more than financial, but the rules apply.

**State charitable solicitation laws** in most states require registration, public disclosure of certain financial information, and adherence to state-specific donor communication rules. These overlap with privacy in a few places - for example, state laws sometimes prohibit selling or sharing donor lists. Check your state's nonprofit registration office.

**The IRS** does not regulate donor privacy directly, but it does require certain donor information to be reported on Schedule B of the Form 990 (for the largest donors) and creates substantiation requirements that shape what records you must keep. Schedule B information is generally not public for public charities, but exceptions apply.

## The four core controls

Regardless of which laws cover you, four operational controls are the foundation of every working donor privacy program.

### 1. Opt-out handling

When a donor asks to be removed from mail, email, phone, or solicitation, that preference must be respected across all channels and all systems. The most common failure pattern is honoring an email opt-out but continuing to mail the donor - because the email platform and the direct mail file live in different places and the opt-out only updated one. The fix is a single source of truth in the CRM with channel-specific opt-out flags that flow downstream to every list export.

Specific requirements:

- Honor opt-outs within 10 business days of receipt (CAN-SPAM standard, applies to email)
- Track the date and channel of each opt-out request
- Apply globally - if a donor opts out of all communications, do not send the next year's annual appeal
- Document an opt-out reversal process for donors who change their mind

### 2. Role-based access

Not every staff member needs full access to every donor record. The development director needs everything; the volunteer coordinator needs contact information for active volunteers; the program staff member needs program participation history but not gift amounts. Role-based access in your CRM enforces this - each user role sees a defined subset of fields and records. Without role-based access, the database is effectively public to anyone on staff, which violates the trust donors expect when they share personal information.

A baseline role set for a mid-sized nonprofit:

- **Admin** - full access, typically the development director and IT lead
- **Editor** - full access except sensitive fields like SSN and full payment data; typically development and operations staff
- **Viewer** - read-only access to constituent records and gift summaries; typically program staff and finance
- **Restricted** - access only to assigned records; typically major gift officers with portfolios

### 3. Written retention policy

Decide how long you will keep each category of donor data and write it down. Apply it. Review it annually. Common categories and retention windows:

- Tax-related records (receipts, IRS filings): 7 years minimum
- Active donor relationship data: indefinite while relationship is active
- Lapsed donor data: 7 to 10 years after last gift, then anonymize
- Email engagement data: 2 to 3 years
- Application form submissions, event registrations: 3 to 5 years
- Wealth screening data: 5 years or until next refresh
- Communication logs and notes: 7 to 10 years

The policy should specify who is responsible for executing retention and how anonymization or deletion is performed. Most CRMs have bulk anonymization functions; the policy's job is to ensure they are actually used.

### 4. Access and deletion request handling

Even where law does not require it, donors increasingly ask: "What do you have on me? Where did it come from? Can you delete it?" A simple process for handling these requests:

1. Verify the requester's identity (typically by matching the email and address on file)
2. Pull a per-donor data export from the CRM (usually a button or a saved report)
3. Provide a structured response within 30 days - copy of records, source attribution where known, retention status
4. For deletion requests: move the record to a "purge queue" and execute deletion or anonymization within 30 days; preserve only what tax law requires
5. Log the request and the resolution in a privacy request register

The first time you handle one of these requests, it takes 2 to 4 hours. After the third, it takes 30 minutes. The investment in setting up the process is small relative to the trust it builds.

## Specific situations

### Anonymous donors

Tag the donor record as anonymous in the CRM. Exclude from public recognition (annual report, donor walls, event programs, press releases, social media). Internally, restrict access to the smallest possible group - often just the executive director, development director, and finance lead. Document the donor's specific anonymity preference in the record so a new development director does not accidentally publish them. The IRS still requires acknowledgment to the donor; the anonymity is from the public, not from the IRS.

### Wealth screening data

Wealth screening produces estimates of capacity, public real estate holdings, securities information, and prior philanthropic activity. This data is sourced from public records, but the aggregated profile is more sensitive than any individual data point. Treat wealth screening output as a restricted field accessible only to development staff actively cultivating the donor. Refresh or delete after 5 years; old wealth screens become inaccurate and can mislead cultivation. See the [donor wealth screening guide](/resources/guides/donor-wealth-screening-guide) for the practice.

### Vendor and service provider relationships

Every vendor with access to donor data - your CRM provider, your payment processor, your email platform, your direct mail house, your wealth screening vendor - needs a written data processing agreement. The agreement should specify what data they may access, how they must protect it, who owns the data, and what happens at contract termination. Most reputable vendors have a standard DPA available on request. Asking for one is normal and expected; if a vendor cannot or will not provide one, that is a flag.

### Payment data (PCI compliance)

If your nonprofit accepts credit card donations and any cardholder data passes through your systems, you are subject to PCI DSS - the Payment Card Industry Data Security Standard. The simplest path to PCI compliance is to use a hosted payment processor (Stripe, Authorize.net, donor-management vendors with built-in payments) so cardholder data never touches your servers. If you use a hosted processor and your CRM only stores the last 4 digits of the card and a token, PCI compliance is mostly handled by the processor. If you ever store full PANs or CVVs, you have a much heavier compliance lift.

## What to do this quarter

If you are starting from zero, the work breaks into a quarter:

**Month 1:** Publish a privacy policy on your website. Document your existing opt-out handling. Audit who has access to your CRM and what role they should have.

**Month 2:** Write a one-page retention policy. Inventory your vendor relationships and request DPAs from any without one. Set up role-based access in your CRM.

**Month 3:** Build a documented process for handling access and deletion requests. Train development staff on the process. Run a tabletop exercise - pretend a donor has requested all their data, and walk through the response end to end.

After the first quarter, the work is maintenance - annual policy review, ongoing opt-out hygiene, vendor DPA renewals, and handling the small stream of access requests that will trickle in.

## Frequently asked questions

### Does GDPR apply to US nonprofits?

Yes, when you process the personal data of individuals located in the European Union - even if the nonprofit is US-based and the gift was solicited from the US. A donor in France who gives to a US nonprofit through your online donation page is covered by GDPR. The most common compliance gap is the opt-in standard: GDPR requires affirmative consent for marketing communications, where US practice often defaults to opt-out. If you have any meaningful EU donor base, build GDPR-compliant consent flows.

### What is the donor bill of rights?

The Donor Bill of Rights, jointly developed by AFP, AHP, CASE, and the Giving Institute in 1993, is a statement of ten principles that donors can expect from any organization soliciting funds. It includes the right to know how donations will be used, the right to anonymity, the right to be removed from solicitation lists, and the right to know who has access to donor records. It is not a law, but it has become a de facto standard that funders, watchdogs, and sophisticated donors expect nonprofits to honor. Most nonprofit privacy policies cite it directly.

### How long should we keep donor data?

Tax-related records (gift receipts, acknowledgments, IRS filings) must be kept at least 7 years per IRS guidance on charitable contribution substantiation. Donor relationship data - contact information, communication preferences, gift history - is typically kept indefinitely while the relationship is active and for 7 to 10 years after the last gift, then either anonymized or deleted. Retention policies should be documented in writing, reviewed annually, and applied consistently across the database. Avoid keeping data "just in case" beyond your stated retention window.

### What is a data subject access request?

A data subject access request (DSAR) is a formal request by a donor to see what personal data your nonprofit holds about them, where it came from, who it has been shared with, and how it is being used. GDPR creates a legal right to make this request for EU residents, and several US state laws extend similar rights. Even where law does not require it, granting access requests on demand is good practice. Most CRMs can produce a per-donor data export in 30 minutes; the harder part is the policy decision about who can request, who can fulfill, and how identity is verified.

### Do we need a written privacy policy?

Yes - both as a legal matter and as a trust matter. Your privacy policy should be linked from your website footer, your online donation page, and your email footer. It should cover what data you collect, how you collect it, how you use it, who you share it with (vendors, processors, never sold), how donors can opt out or request deletion, and how to contact you about privacy questions. Keep it readable. Most nonprofit privacy policies are too long, too legalistic, and not actually read by donors. A 600 to 1,000 word policy in plain English is sufficient for most mid-sized nonprofits.

## Where to go next

For donor relationship discipline that pairs with privacy practice, see the [donor stewardship 12-month plan](/resources/guides/donor-stewardship-plan-12-month-guide). For the broader operational context, see the [development operations FAQ hub](/resources/faq/faq-development-operations). For the wealth screening side, see the [donor wealth screening guide](/resources/guides/donor-wealth-screening-guide).
