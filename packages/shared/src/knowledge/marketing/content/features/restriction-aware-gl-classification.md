---
title: Restriction-Aware Gift-to-GL Classification for Nonprofits
entitlement: hasRestrictionLifecycle
description: "When a gift is entered, GrantPipe credits the right net-asset revenue account based on the gift's net-asset class. Unrestricted, temporarily restricted, and permanently restricted gifts each post to the correct account the first time."
seoTitle: Automatic Gift-to-GL Classification by Net-Asset Class
seoDescription: "Post restricted gifts to the right GL account at entry. GrantPipe credits 4000, 4100, or 4200 by net-asset class so gifts land in the right revenue account."
targetKeyword: restricted gift general ledger classification
publishedAt: "2026-06-15"
updatedAt: "2026-06-15"
lastReviewedAt: "2026-06-15"
buyerStage: bofu
schema: SoftwareApplication
topicCluster: restricted-fund-accounting
contentIntent: category
primaryCta: trial
ctaMode: convert
refreshCadenceMonths: 12
leadMagnetSlug: nonprofit-crm-evaluation-scorecard
targetPersona:
  - executive-director
  - finance-operations-staff
tags:
  - feature
  - restricted-funds
  - fund-accounting
  - general-ledger
bluf: "GrantPipe reads the net-asset class on every gift at entry and credits the matching revenue account: 4000 for unrestricted, 4100 for temporarily restricted, 4200 for permanently restricted. Each gift posts to the right revenue account from the start, so finance has less reclassification work later."
faqs:
  - q: What accounts does GrantPipe use for restricted gifts?
    a: "Contributions from unrestricted gifts credit account 4000. Temporarily restricted gifts credit account 4100. Permanently restricted gifts, like endowment contributions, credit account 4200. The net-asset class set at gift entry drives that choice."
  - q: What happens if a fund's net-asset type changes later?
    a: "Past journal entries are not touched. Reclassifying a past gift requires a separate, deliberate journal entry. GrantPipe will not silently rewrite history when a fund record changes."
  - q: Where does the net-asset class come from?
    a: "The class comes from the same Restriction Auto-Classifier that runs at gift entry. It reads the linked fund, any grant, an existing restriction term, and the donor's written designation. Staff can override it before saving the gift."
  - q: Do I need an accountant to set this up?
    a: "No. The accounts and routing rules ship with the system. You set up your funds with the correct net-asset types and GrantPipe takes it from there."
  - q: Does the journal entry reverse when a gift is edited or deleted?
    a: "Yes. GrantPipe auto-posts a reversal when a gift is edited or deleted, then posts the corrected entry if the gift was edited. The general ledger stays in balance without manual intervention."
relatedPages:
  - /features/restriction-auto-classifier
  - /features/restricted-fund-tracking
  - /features/audit-trail-activity-log
  - /product
  - /pricing
proscons:
  - subject: GrantPipe restriction-aware GL classification
    pros:
      - Credits the right net-asset revenue account at gift entry
      - No manual journal entries to reclassify a wrong account after the fact
      - Gifts post to the matching net-asset revenue account from the start
      - Past entries stay unchanged when a fund type is updated later
      - Auto-reversal keeps the ledger in balance on edit or delete
    cons:
      - Routing is only as good as the net-asset types set on your funds
      - Permanently restricted gifts require the fund to be marked endowment
      - Does not replace CPA judgment on account structure or chart of accounts design
answers:
  - q: Why does the credit account matter on a restricted gift?
    a: "FASB ASC 958-205 requires nonprofits to present net assets in two classes: with donor restrictions and without donor restrictions. Each class must flow through the statement of activities separately. If all restricted gifts credit the same unrestricted revenue account, the two classes are mixed and finance has to review and reclassify the activity before final reporting. Fixing that at audit means tracking down every misclassified gift and posting reclassifying entries, which takes time and creates a messy audit trail."
  - q: How does GrantPipe know which account to credit?
    a: "The net-asset class is resolved at gift entry by the Restriction Auto-Classifier. Once the class is set, the GL classification rule is simple: unrestricted goes to 4000, temporarily restricted goes to 4100, permanently restricted goes to 4200. The debit always goes to the cash account. No manual mapping required after setup."
  - q: What if I need different account numbers?
    a: "The default chart of accounts uses 4000, 4100, and 4200. If your organization uses different account numbers, contact our team to configure the mapping to match your existing chart of accounts."
pricingStats:
  - stat: FASB ASC 958-205 requires nonprofits to classify net assets as with or without donor restrictions and present the composition of each class on the statement of financial position
    source: FASB Accounting Standards Codification 958-205
    sourceUrl: "https://asc.fasb.org/958"
  - stat: FASB ASC 958-225 requires the statement of activities to report the change in each class of net assets for the period
    source: FASB Accounting Standards Codification 958-225
    sourceUrl: "https://asc.fasb.org/958"
tableData:
  name: Gift-to-GL classification by net-asset class
  description: How GrantPipe posts restricted gifts compared to manual processes and generalist systems.
  columns:
    - Capability
    - Spreadsheet
    - Generalist CRM
    - GrantPipe
  rows:
    - - Credits correct net-asset revenue account at entry
      - Manual journal entry required
      - Single account, manual reclassification
      - Automatic at entry
    - - Reverses on gift edit or delete
      - Manual reversal
      - Not supported
      - Automatic
    - - Gifts post to the matching net-asset revenue account
      - "No"
      - Requires manual reclassification
      - "Yes"
    - - Past entries protected from fund-type changes
      - No version control
      - No version control
      - Entry locked at posting
    - - Supports all three net-asset classes
      - Manual setup
      - Rarely
      - Native
sourceUrls:
  - "https://asc.fasb.org/958"
  - "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200"
---

## The problem

Most donor systems credit all restricted gifts to one revenue account. The entry goes in, the cash hits the bank, and the general ledger shows a credit to "Contributions Revenue" regardless of whether the gift was unrestricted, temporarily restricted, or a permanent endowment contribution.

That creates review work. FASB ASC 958-225 requires nonprofits to report the change in each class of net assets on the statement of activities. If gifts are posted without a reliable net-asset class, finance has to review the activity before final reporting and may need reclassifying entries.

The fix is usually discovered at audit or at year-end close. By that point, a finance lead or outside CPA has to trace every misclassified gift and post reclassifying journal entries by hand. That is a bad way to spend close week.

## How GrantPipe solves it

GrantPipe credits the correct net-asset revenue account at the moment the gift is saved.

- Unrestricted gift: debit cash, credit Contributions Unrestricted (account 4000)
- Temporarily restricted gift: debit cash, credit Contributions Temporarily Restricted (account 4100)
- Permanently restricted gift (endowment): debit cash, credit Contributions Permanently Restricted (account 4200)

The net-asset class is set by the [Restriction Auto-Classifier](/features/restriction-auto-classifier) at entry. It reads the linked fund, any linked grant, an existing restriction term, and the donor's written designation. Staff can review and override the class before saving. Once the gift is saved, the journal entry posts with the right credit account. The gift lands in the right revenue class from day one, with no mapping step required.

## TL;DR

- Three net-asset revenue accounts: 4000 (unrestricted), 4100 (temporarily restricted), 4200 (permanently restricted)
- The journal entry credits the right account at the moment the gift is saved
- Net-asset class comes from the deterministic Restriction Auto-Classifier, not AI guessing
- Auto-reversal posts when a gift is edited or deleted, then the corrected entry follows
- Past entries do not change when a fund's net-asset type is updated later
- Gifts post to the matching net-asset revenue account without manual reclassification

## How it works

1. A gift is entered and linked to a fund or grant
2. The Restriction Auto-Classifier reads the fund type, grant, restriction term, and donor designation
3. The net-asset class is set: unrestricted, temporarily restricted, or permanently restricted
4. The gift is saved
5. GrantPipe posts the journal entry, crediting the matching revenue account (4000, 4100, or 4200)
6. If the gift is later edited, a reversal posts and a corrected entry follows
7. If the gift is deleted, only the reversal posts

## Who it is for

Finance leads who close the books and need gifts routed to the right revenue class. Gift-entry staff who should not have to know which account gets the credit on a restricted gift. Executive directors who present board reports and need the restricted vs. unrestricted split to be easier to check.

## Why past entries do not change

A fund's net-asset type can change. An organization might recategorize a fund from temporarily restricted to permanently restricted after a donor adds perpetuity language. When that happens, GrantPipe does not go back and rewrite past journal entries.

Silently changing historical entries would corrupt the audit trail. Reclassification of past gifts is a separate accounting action. It requires a deliberate journal entry, a reason, and a date. GrantPipe supports that through the restriction lifecycle, but it does not happen automatically. Your historical records stay as posted.

## What it replaces

- The year-end hunt for misclassified restricted gifts
- The manual journal entries after discovering a wrong credit account at audit
- The hand-reconciliation between the donor database and the general ledger

This feature builds on [Restricted Fund Tracking](/features/restricted-fund-tracking), which owns the restriction term, release schedule, and fund balance after the gift is posted. It relies on the [Restriction Auto-Classifier](/features/restriction-auto-classifier) to set the net-asset class at entry. The classifier picks the class; the GL classification rule picks the account.

## FASB ASC 958 and the account split

FASB ASC 958-205 requires nonprofits to classify net assets as with or without donor restrictions and present the composition of each class on the statement of financial position. FASB ASC 958-225 requires the statement of activities to report the change in each class for the period.

GrantPipe uses separate revenue accounts for each net-asset class so the class is visible at posting. A gift from an endowment donor and a gift from an unrestricted annual fund donor land in different GrantPipe revenue accounts. That supports statement-of-activities review without claiming to replace CPA judgment or a final close process.

## Common questions from finance leads

If an auditor wants to see the detail behind a net-asset class total, every gift that contributed to that total is in GrantPipe with its journal entry and the net-asset class that was set.

The auto-classification only affects the revenue account on the gift. Releases from temporarily restricted funds run through the restriction lifecycle in [Restricted Fund Tracking](/features/restricted-fund-tracking) and post to separate release accounts. Classification at entry and release tracking are connected but governed by different rules.

## Start a free trial

[Start a trial](/pricing).

## Related feature pages

- [Restriction auto-classifier](/features/restriction-auto-classifier)
- [Restricted fund tracking](/features/restricted-fund-tracking)
- [Audit trail and activity log](/features/audit-trail-activity-log)
- [Product overview](/product)
- [Pricing and plan fit](/pricing)
