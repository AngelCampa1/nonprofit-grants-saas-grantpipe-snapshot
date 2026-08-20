---
title: Restriction Auto-Classifier for Nonprofit Gifts
entitlement: hasRestrictionLifecycle
description: "Suggests the right net-asset class at gift entry from the linked fund, grant, and donor designation, so restricted gifts are classified correctly the first time."
seoTitle: Automatic Net-Asset Classification for Nonprofit Gifts
seoDescription: "Classify restricted and unrestricted gifts correctly at entry. GrantPipe reads the linked fund, grant, and designation and suggests the net-asset class."
targetKeyword: net asset classification
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
bluf: "GrantPipe suggests the net-asset class on every gift at entry. It reads the linked fund type, any linked grant, an existing restriction term, and the donor's written designation, then prefills the restriction and shows the reason. Staff stay in control and can override with one click."
faqs:
  - q: Does the system pick the restriction for me?
    a: "It suggests one and tells you why. You can accept it or change it. The final choice is always yours."
  - q: How does it decide?
    a: "It follows clear rules in order: an existing restriction term on the fund or grant, then the fund's net-asset type, then a linked grant, then keywords in the donor's written designation. If nothing matches, it suggests unrestricted."
  - q: Does it use AI to guess?
    a: "No. The suggestion comes from fixed rules you can read and test. There is no AI guessing on your gift data here."
  - q: What if the suggestion is wrong?
    a: "Change the restriction control. Your manual choice wins, and GrantPipe warns you when saved records point to a different class."
  - q: Does accepting a suggestion create a restriction term?
    a: "If you accept a restricted suggestion on a linked fund, GrantPipe links or creates the restriction term and release schedule for you using the existing restriction lifecycle."
relatedPages:
  - /features/restricted-fund-tracking
  - /features/grant-pipeline-management
  - /resources/guides/grant-compliance-101-for-nonprofits
  - /free/grant-compliance-checklist
  - /for/finance-operations-staff
  - /product
  - /pricing
proscons:
  - subject: GrantPipe restriction auto-classifier
    pros:
      - Reads the linked fund, grant, and donor designation at entry
      - Shows the reason for every suggestion
      - Prefills the restriction but lets staff override in one click
      - Links or creates the restriction term when you accept
    cons:
      - Suggestions are only as good as the fund types and terms you set up
      - Designation keyword rules cover common phrasing, not every wording
      - Does not replace CPA judgment on net-asset classification
answers:
  - q: Why does correct net-asset classification matter?
    a: "Under FASB ASC 958, gifts are classified as with or without donor restrictions. A wrong class at entry flows into every fund balance, release, and board report after it. Fixing it at entry is far cheaper than finding it at audit."
  - q: What signals does the classifier read?
    a: "An existing restriction term on the fund or grant, the fund's net-asset type, whether a grant is linked, and keywords in the donor's written designation such as endowment, in perpetuity, or restricted to a program."
  - q: Can staff still set the restriction by hand?
    a: "Yes. The classifier only suggests. A manual change to the restriction control always overrides the suggestion."
pricingStats:
  - stat: FASB ASC 958-205 requires nonprofits to classify net assets as with or without donor restrictions and present the composition of each class on the statement of financial position
    source: FASB Accounting Standards Codification 958-205
    sourceUrl: "https://asc.fasb.org/958"
  - stat: Nonprofits with $500K-$10M budgets spend an average of 3.5 percent of operating budget on software per Nonprofit Tech for Good's 2024 report
    source: Nonprofit Tech for Good 2024 Technology Report
    sourceUrl: "https://www.nptechforgood.com/research-reports/"
tableData:
  name: Net-asset classification at gift entry
  description: How GrantPipe classifies gifts compared to spreadsheet and generalist CRM approaches.
  columns:
    - Capability
    - Spreadsheet
    - Generalist CRM
    - GrantPipe
  rows:
    - - Suggests net-asset class at entry
      - "No"
      - "No"
      - "Yes"
    - - Shows the reason for the suggestion
      - "No"
      - "No"
      - "Yes"
    - - Reads linked fund and grant
      - Manual lookup
      - Not supported
      - Native
    - - Links restriction term on accept
      - Manual journal entry
      - Not supported
      - Automatic
    - - Staff override
      - Always manual
      - Always manual
      - One click
sourceUrls:
  - "https://asc.fasb.org/958"
  - "https://www.nptechforgood.com/research-reports/"
  - "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200"
---

## The problem

Restricted gifts go wrong at the first step. A staff member enters a gift and picks the restriction by hand. One wrong guess spreads. It hits the fund balance, the board report, and the audit. The error is cheap to fix now. It is costly to find later.

## How GrantPipe solves it

GrantPipe suggests the net-asset class as you enter the gift. It reads what you already set up. That means the fund you linked, any grant you linked, the restriction term, and the donor's written designation. Then it prefills the restriction and shows a short reason. For example: "Suggested: Temporarily restricted, because the linked fund is temporarily restricted."

You stay in control. Accept the suggestion with one click. Or change the restriction yourself. A manual change always wins. If the manual choice conflicts with the suggestion, GrantPipe shows a warning so staff can check the record before saving.

## TL;DR

- Suggests the net-asset class on every gift at entry
- Reads the linked fund, linked grant, existing term, and donor designation
- Shows the reason and a confidence level for each suggestion
- Prefills the restriction but lets staff override in one click
- Links or creates the restriction term when you accept a restricted gift
- Uses fixed rules, not AI guessing, so the logic is clear and testable
- Does not replace CPA judgment on net-asset classification

## How it works

1. Link a fund or grant, or type the donor's designation on the gift
2. GrantPipe reads those signals and suggests a net-asset class
3. A banner shows the suggestion, the reason, and a confidence level
4. Accept the suggestion or change the restriction by hand
5. When you accept a restricted gift on a fund, the restriction term and release schedule are linked or created for you

## Who it's for

Gift-entry staff who should not have to be fund-accounting experts. Finance leads who inherit whatever class was picked at entry. Executive directors who want the board balance to match the audit balance.

## Why GrantPipe built it this way

The classifier uses fixed rules in a clear order, not a model that guesses on your data. Every suggestion comes with the reason behind it, so a reviewer can check the logic. The rules read your real setup: fund types, restriction terms, and grant links. Better setup means better suggestions. This is a guardrail for clean data, not accounting advice, and it never overrides a person's choice.

## What it replaces

- The hand guess on restriction at every gift entry
- The wrong class that quietly flows into fund balances and board reports
- The audit finding on a misclassified net-asset release
- The cleanup project to reclassify a year of gifts after the fact

This feature builds on [Restricted Fund Tracking](/features/restricted-fund-tracking). The classifier picks the class at entry; restricted fund tracking owns the term, balance, releases, and evidence after that. It also works alongside [Grant Pipeline Management](/features/grant-pipeline-management), where the fund and grant links on a gift originate.

## The classification rules in order

The classifier reads signals in a fixed priority order. You can read the same rules and predict the output before you enter a gift.

1. **Existing restriction term.** If the linked fund or grant already has a restriction term with a net-asset type, that type wins. The term was set deliberately and the classifier respects it.
2. **Fund net-asset type.** If no term exists, the classifier reads the fund's net-asset type directly. A permanently restricted fund produces a permanently restricted suggestion.
3. **Linked grant.** If no fund type is set, a linked grant moves the suggestion to temporarily restricted. Grant funds are donor-restricted by default until the award terms are spent.
4. **Donor designation keywords.** If nothing above applies, the classifier scans the donor's written designation for words like endowment, in perpetuity, restricted to, or named fund. A match produces a restricted suggestion with a low confidence flag.
5. **No signal.** If none of the above apply, the suggestion is unrestricted. Staff can still set a restriction by hand.

Each step is transparent. The suggestion banner names the rule that fired so a reviewer can check the logic without opening a separate screen.

## What good fund setup looks like

The classifier is only as good as the fund and restriction term data you maintain. A fund with a net-asset type set gives better suggestions than one left blank. Restriction terms on recurring grants remove the need for keyword matching entirely.

GrantPipe shows a warning during gift entry when a manual restriction choice conflicts with the classifier. That warning is an invitation to check the fund, grant, and donor designation before saving. It is not a blocker.

## How finance leads review the choice

The saved gift keeps the final restriction choice. When staff accept a restricted suggestion on a linked fund, GrantPipe can link or create the restriction term and release schedule. Finance leads can review the gift and linked fund record to see what class was used.

## Common questions from finance leads

Finance leads sometimes ask what is saved from the classifier. GrantPipe saves the final restriction on the gift. It does not put classifier notes in donor-facing communications.

Finance leads also ask what happens when a fund changes its net-asset type after gifts have been entered. Old gifts keep their existing restriction. The classifier only runs at entry. Retroactive reclassification is a separate process that goes through the restriction lifecycle and requires a deliberate journal entry, not an automatic update.

## Start a free trial

[Start a trial](/pricing).

## Related feature pages

- [Restricted fund tracking](/features/restricted-fund-tracking)
- [Grant pipeline management](/features/grant-pipeline-management)
- [Product overview](/product)
- [Pricing and plan fit](/pricing)
