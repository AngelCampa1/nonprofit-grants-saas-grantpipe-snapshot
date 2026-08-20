---
title: "Workflow: Processing a Nonprofit Donor Refund"
description: "Processing a donor refund: tax-receipt reversal, payment-processor refund, board policy triggers, and year-end 990 implications."
seoTitle: "Nonprofit Donor Refund Workflow (Tax Receipt Reversal)"
seoDescription: "Step-by-step nonprofit donor refund workflow. Tax receipt reversal, CRM adjustment, Form 990 reporting, and cross-year refund treatment under FASB ASC 958."
targetKeyword: "donor refund"
publishedAt: "2026-04-25"
updatedAt: "2026-04-25"
lastReviewedAt: "2026-04-25"
buyerStage: "mofu"
schema: "HowTo"
topicCluster: "donor-operations"
contentIntent: "workflow"
primaryCta: "trial"
ctaMode: "evaluate"
refreshCadenceMonths: 12
targetPersona:
  - "development-director"
  - "finance-operations-staff"
tags:
  - "workflow"
  - "donor refund"
  - "tax receipt"
  - "donor management"
  - "Form 990"
timeEstimate: "1-3 hours per refund, longer for cross-year or restricted gifts"
difficulty: "intermediate"
prerequisites:
  - "Original gift record with date, amount, fund designation, and payment method"
  - "Donor's tax receipt or acknowledgment letter if already issued"
  - "Payment processor access for refund processing (Stripe, PayPal, check reversal, etc.)"
  - "Board or management policy on refund eligibility and approval thresholds"
  - "Determination of whether the gift is in the same or a different tax year than the refund"
outputs:
  - "Refund processed through the original payment method"
  - "Revised or voided tax receipt provided to the donor"
  - "General ledger entry reversing the original contribution"
  - "CRM or donor database updated to reflect the refund and corrected gift history"
bluf: "Refunds crossing a tax year require a correction to the donor's prior receipt - easy to miss and legally important. A nonprofit that processes a refund in January for a December gift has reduced the donor's charitable deduction for the prior tax year. The donor needs written documentation of the refund to correct their tax records, and the organization's Form 990 must reflect the net contribution total accurately."
steps:
  - title: "Confirm the refund request and eligibility"
    content: "Receive the refund request in writing - email is sufficient - and document the reason. Verify the original gift details: amount, date, fund designation, and payment method. Check whether your organization's refund policy covers the situation. Most organizations have clear policies for refunding duplicate gifts, erroneous charges, or gifts made in error; situations like a donor who changed their mind on a restricted gift may require board or management decision."
  - title: "Determine the tax-year treatment"
    content: "If the original gift and the refund are in the same calendar year, the treatment is straightforward - the donation and its reversal both occur in the same tax period. If the refund crosses a tax year (gift in December, refund in January), the donor's prior-year charitable deduction is affected. Document which scenario applies before proceeding. Cross-year refunds require additional communication to the donor regarding their tax records."
  - title: "Process the payment refund"
    content: "Refund through the original payment method where possible: credit card refunds to the same card, ACH returns to the originating account, check refunds via organization check. Retain the transaction confirmation - refund receipt, bank transaction ID, or check copy - as the primary documentation of funds returned. For credit card gifts where the card is no longer valid, coordinate with your payment processor on alternative return methods."
  - title: "Void or revise the tax acknowledgment"
    content: "If a written acknowledgment was issued for the refunded gift, it must be corrected. Issue a revised letter stating the original gift amount, the refund amount and date, and the net contribution received (zero for a full refund). For same-year refunds, this document is the donor's record for tax purposes. For cross-year refunds, explicitly note in the letter that the refund was processed in a different tax year than the original contribution, so the donor knows to consult their tax advisor about how to handle any previously claimed deduction."
  - title: "Book the general ledger reversal"
    content: "Enter a journal entry reversing the original contribution. The entry credits cash (or refund payable) and debits contribution revenue. If the original gift was donor-restricted, also reverse the net asset restriction - the restricted net asset cannot remain on the books once the cash has been returned. Date the entry as the actual refund date, not the original gift date."
  - title: "Update the donor CRM record"
    content: "Adjust the gift record in the donor database. The refunded gift should be flagged or reversed in the system so it does not inflate giving totals, LYBUNT/SYBUNT reports, or retention metrics. The donor's total giving history should reflect the net amounts actually retained by the organization. A refund that is not reflected in the CRM creates discrepancies between financial statements and donor records."
  - title: "Handle restricted fund implications"
    content: "If the refunded gift was restricted to a specific program or fund, the organization must also address any expenditures already made against that restriction. If program costs were incurred in reliance on the gift before the refund request was received, the situation may require management decision about whether to continue the program activity from other funds or pause it. Do not leave a restricted fund with a negative balance."
  - title: "Assess Form 990 reporting impact"
    content: "Contributions on Form 990 are reported on a gross basis, and refunds in the same year reduce the gross total on Part VIII. Refunds crossing tax years appear as reduction in net assets in the year the refund is processed, not in the year the gift was received. Ensure the accounting system captures the refund in the correct fiscal year and that the gift officer and CFO are aware of any significant refund amounts affecting current-year 990 reporting."
faqs:
  - q: "Are we required to refund a donor's gift?"
    a: "No general legal requirement exists to refund charitable gifts. However, most organizations have policies requiring refunds for duplicate charges, erroneous gifts (donor intended to give to a different organization), and certain error situations. For restricted gifts, if the organization cannot fulfill the restricted purpose, it may have an ethical obligation to refund or negotiate a new restriction with the donor. State charitable solicitation laws vary on refund obligations."
  - q: "How should we handle a cross-year refund on the donor's tax receipt?"
    a: "Issue a correction letter stating the original gift date and amount, the refund date and amount, and the net contribution of zero (for a full refund). Because the refund is in a different tax year than the gift, the donor's prior-year return may need amendment. The correction letter should make this clear and recommend the donor consult their tax advisor."
  - q: "What if the donor disputes the refund amount?"
    a: "Handle as you would any donor service issue - document the dispute, escalate to the development director or executive director if needed, and resolve before processing a partial or modified refund. If the dispute is about whether a refund is owed at all, the board refund policy should govern. Never process a partial refund without written agreement on the amount."
  - q: "Does a donor refund appear on the organization's Form 990?"
    a: "Yes. Form 990 Part VIII line 1 reports gross contributions. A same-year refund reduces the gross contribution total. A cross-year refund reduces net assets in the year processed and may appear in the reconciliation of beginning and ending net asset balances. Discuss significant refund amounts with your CPA to ensure correct 990 treatment."
  - q: "What if the donor already filed their taxes and claimed the deduction?"
    a: "That is the donor's responsibility to resolve with their tax advisor, not the organization's. The organization's obligation is to provide accurate documentation of what was received and what was refunded. Issue the correction letter promptly. The IRS rules on whether the donor must amend their prior return depend on factors outside the organization's control."
relatedPages:
  - "/resources/guides/donor-retention-strategies"
  - "/features/audit-trail-activity-log"
  - "/resources/guides/fasb-asc-958-nonprofit-reporting"
  - "/resources/guides/nonprofit-audit-readiness"
  - "/resources/guides/restricted-fund-accounting-basics"
definitions:
  - term: "Tax acknowledgment letter"
    definition: "Written confirmation to a donor of a contribution, required by IRS rules for gifts of $250 or more. Must state the amount donated and whether any goods or services were provided in exchange."
  - term: "Cross-year refund"
    definition: "A donor refund processed in a different tax year than the original contribution, which may affect the donor's prior-year charitable deduction and require a correction letter separate from the original acknowledgment."
  - term: "Net asset reversal"
    definition: "When a restricted gift is refunded, the associated net assets with donor restrictions must be reversed to zero, since the funds no longer exist and the restriction has no effect."
  - term: "LYBUNT / SYBUNT"
    definition: "Donor segment acronyms: Last Year But Unfortunately Not This year, and Some Year But Unfortunately Not This year. Refunded gifts that remain in CRM records inflate these retention metrics if not properly flagged."
answers:
  - question: "Who approves a donor refund?"
    answer: "Approval depends on the amount and circumstances. Operational-level staff can typically approve refunds for clear errors (duplicate charges, erroneous amounts) below a threshold like $250. Management approval is needed for larger amounts or policy-edge cases. Board-level involvement is appropriate for significant restricted gifts being refunded due to program cancellation or donor dispute."
  - question: "How do we process a refund for a stock gift?"
    answer: "Stock gifts that have been liquidated cannot be refunded in kind. If a refund is warranted, it is issued in cash equal to the proceeds received, less any transaction costs, at the time the refund is processed - not at the original stock value. This distinction should be disclosed in the organization's gift acceptance policy."
  - question: "Do online giving platform fees get refunded to the donor?"
    answer: "Platform and processing fees on refunded gifts are generally borne by the organization, not passed to the donor. Most payment processors do not return processing fees on refunded transactions. The organization refunds the full gift amount to the donor and absorbs the processing fee as an expense. This should be reflected in the GL entry."
pricingStats:
  - stat: "IRS regulations require nonprofits to provide written acknowledgment for contributions of $250 or more; revised acknowledgments for refunded gifts must be issued promptly to allow donors to correct their tax records"
    source: "IRS Publication 1771"
    sourceUrl: "https://www.irs.gov/pub/irs-pdf/p1771.pdf"
  - stat: "Form 990 Part VIII reports gross contributions received, and organizations must reduce reported contribution totals by any refunds made in the same fiscal year"
    source: "IRS Form 990 Instructions"
    sourceUrl: "https://www.irs.gov/instructions/i990"
  - stat: "Under FASB ASC 958, refunds of restricted contributions require reversal of the associated donor restriction; net assets with donor restrictions cannot be maintained when the underlying funds have been returned"
    source: "FASB Accounting Standards Codification 958"
    sourceUrl: "https://asc.fasb.org/"
sourceUrls:
  - "https://www.irs.gov/pub/irs-pdf/p1771.pdf"
  - "https://www.irs.gov/instructions/i990"
  - "https://asc.fasb.org/"
  - "https://www.irs.gov/charities-non-profits/charitable-organizations/charitable-contribution-deductions"
statistics:
  - stat: "Written acknowledgment is required for all charitable contributions of $250 or more; revised acknowledgments for refunded gifts are necessary to protect donor's tax records per IRS Publication 1771"
    source: "IRS Publication 1771"
    sourceUrl: "https://www.irs.gov/pub/irs-pdf/p1771.pdf"
  - stat: "Form 990 Part VIII reports gross contributions received; refunds in the same fiscal year reduce the gross contribution total reported to the IRS per Form 990 instructions"
    source: "IRS Form 990 Instructions"
    sourceUrl: "https://www.irs.gov/instructions/i990"
  - stat: "Under FASB ASC 958, refunds of restricted contributions require elimination of the associated donor restriction from net assets with donor restrictions"
    source: "FASB Accounting Standards Codification 958"
    sourceUrl: "https://asc.fasb.org/"
---

A donor refund is one of the less common and more procedurally precise events in nonprofit finance. The mechanics are not complicated - return the money, reverse the entry, update the records - but the tax acknowledgment implication, especially across tax years, is where organizations create problems for donors without realizing it.

## When to run this workflow

Run this workflow whenever a donor requests a refund, a duplicate charge is discovered, a gift was processed in error, or a restricted gift cannot be applied to its intended purpose. Also run it proactively when a monthly payment-processor reconciliation reveals an unmatched charge that should not have been processed.

The sooner a refund is processed after the trigger event, the simpler the treatment. A same-calendar-year refund requires only a standard reversal and an updated acknowledgment. A refund that crosses into a new calendar year - particularly one that crosses a January 1 boundary - requires careful communication with the donor and may affect their prior-year tax filing.

## Common pitfalls

**Failing to void or revise the tax acknowledgment.** The original acknowledgment letter understates the organization's receipts if the gift was refunded. Issuing a correction letter is not optional - it is what allows the donor to accurately represent their charitable giving on their tax return.

**Not updating the CRM record.** A refund that is processed in the payment system but not reflected in the donor database creates a permanent discrepancy. Development staff will see giving totals that include the refunded amount, retention calculations will be inflated, and year-end giving summaries will be wrong. Every refund requires a CRM update.

**Leaving restricted fund balances unaddressed.** If the refunded gift was restricted and program expenses were already incurred, the fund has a deficit. Leaving it in that state distorts the restricted fund reporting. Management must decide how to fund the deficit - from operating reserves, an emergency designation, or a funding reallocation.

**Processing the refund from the wrong account.** Always refund through the original payment method where possible. Refunding a credit card gift by check creates a different transaction record that is harder to reconcile and may confuse the donor's bank statement.

## Audit trail requirements

The complete refund file should contain:

- The refund request in writing from the donor (email is sufficient)
- The original gift record showing date, amount, method, and fund designation
- Payment processor confirmation of the refund (transaction ID, timestamp, amount)
- The revised or voided tax acknowledgment letter issued to the donor
- The general ledger journal entry reversing the contribution
- CRM record showing the updated gift history
- Management or board approval documentation if above threshold

For audit purposes, the refund trail must connect the cash movement, the accounting entry, the tax documentation, and the donor record. Any of these links missing weakens the audit evidence.

## How GrantPipe automates this

GrantPipe connects the donor CRM record to the gift accounting record, so processing a refund updates both simultaneously. The tax acknowledgment status flag prevents the original letter from remaining "sent" after a refund voids it. Cross-year refund dates are captured at the transaction level, so the 990 reporting reconciliation is accurate without manual year-end reconstruction. [Start a trial](/signup).
