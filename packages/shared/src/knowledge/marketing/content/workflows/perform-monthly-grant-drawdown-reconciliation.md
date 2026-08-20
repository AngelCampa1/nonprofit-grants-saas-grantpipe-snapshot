---
title: "How to Perform a Monthly Grant Drawdown Reconciliation"
entitlement: "hasPaymentRequests"
description: "Step-by-step workflow for reconciling federal grant drawdowns from Treasury PMS or ASAP.gov against general ledger expenditures each month, including interest remittance and FFR alignment."
seoTitle: "Monthly Grant Drawdown Reconciliation Workflow"
seoDescription: "Reconcile federal grant drawdowns from PMS and ASAP.gov to the general ledger monthly: cost-reimbursement vs advance, interest remittance, FFR alignment."
targetKeyword: "perform monthly grant drawdown reconciliation"
publishedAt: "2026-04-24"
updatedAt: "2026-04-24"
lastReviewedAt: "2026-04-24"
buyerStage: "tofu"
schema: "HowTo"
topicCluster: "grant-compliance"
contentIntent: "workflow"
primaryCta: "lead-magnet"
ctaMode: "educate"
refreshCadenceMonths: 12
leadMagnetSlug: "grant-reporting-calendar-template"
targetPersona:
  - "grants-manager"
  - "finance-operations-staff"
tags:
  - "workflow"
  - "drawdown"
  - "federal grants"
  - "cash management"
timeEstimate: "2-4 hours per month"
difficulty: "intermediate"
prerequisites:
  - "Access to Treasury PMS or ASAP.gov for the awarding agency"
  - "General ledger detail with grant coding for the month"
  - "Current award budget and approved expenditure categories"
  - "Prior-month drawdown history and balances"
  - "Bank statement showing federal deposit dates"
outputs:
  - "Reconciled drawdown log tying each draw to GL expenditures"
  - "Interest earned calculation on advance balances"
  - "Variance schedule explaining drawdown vs expenditure differences"
  - "Signed reconciliation ready for quarterly FFR preparation"
bluf: "Federal grant drawdowns must be reconciled to the general ledger every month. For cost-reimbursement awards, each draw must be supported by actual expenditures already incurred. For advance awards, any interest earned on balances above $500 must be remitted annually under 2 CFR 200.305(b)(9). Monthly reconciliation catches errors while they are fixable and makes quarterly Federal Financial Report (FFR) preparation routine instead of a fire drill."
steps:
  - title: "Pull the drawdown history for the month"
    content: "Log in to Treasury PMS (for HHS, DOL, ED, and most civilian agencies) or ASAP.gov (for agencies including USDA and DOJ) and export the transaction history for each award. Capture draw date, amount, account, and reference number. Confirm each draw hit the bank account on the expected date."
  - title: "Extract grant expenditures from the general ledger"
    content: "Pull expenditures by grant for the reconciliation month. Use grant coding, class tracking, or dimension tags - whichever structure your accounting system uses. Total direct costs plus allocated indirect for each award."
  - title: "Classify each award as cost-reimbursement or advance"
    content: "Cost-reimbursement awards require expenditures to occur before the draw. Advance awards allow the draw first with expenditure tracking after. The award terms dictate which rule applies. Mixing the two is a common finding source."
  - title: "Match draws to supporting expenditures"
    content: "For cost-reimbursement awards, each draw must trace to specific GL expenditures already posted. Build a line-by-line tie-out: draw amount equals sum of expenditures supporting it. Any unsupported draw is a cash management finding waiting to happen."
  - title: "Calculate interest on advance balances"
    content: "For advance awards, compute the average daily cash balance and apply your organization's interest rate (from a money market or operating account). Interest earned above $500 per year across all federal awards must be remitted annually to HHS PSC under 2 CFR 200.305(b)(9). Track monthly so the annual total is ready."
  - title: "Document variances and reclassifications"
    content: "If a draw exceeded expenditures for the month, document the reason: timing difference, accrual, or overdraw requiring return. If expenditures exceeded draws, plan the next draw to close the gap. Every variance needs a written explanation filed with the reconciliation."
  - title: "Tie the monthly total to the quarterly FFR"
    content: "The FFR (SF-425) is due quarterly for most federal awards. Cumulative drawdowns, cumulative expenditures, and unliquidated obligations must match your reconciled records. Doing the math monthly means FFR preparation is a copy-paste instead of a three-day scramble."
  - title: "Sign and file the reconciliation"
    content: "Have the preparer and a reviewer sign and date the monthly reconciliation. File it with supporting PMS/ASAP exports and GL reports. Auditors test drawdown reconciliation controls during Single Audit fieldwork - signed monthly reconciliations are the primary evidence."
faqs:
  - q: "What is the difference between Treasury PMS and ASAP.gov?"
    a: "Both are federal payment systems, but they serve different agencies. PMS (Payment Management System, operated by HHS) handles draws for HHS, ED, DOL, and most civilian agencies. ASAP.gov (Automated Standard Application for Payments, operated by Treasury Bureau of the Fiscal Service) handles draws for USDA, DOJ, and several others. Your award document identifies which system to use."
  - q: "How quickly must a cost-reimbursement draw be spent?"
    a: "Under 2 CFR 200.305(b), federal cash must be disbursed within a reasonable period - Treasury guidance interprets this as typically within three business days of receipt. Holding federal cash longer than needed creates cash management findings."
  - q: "What is the $500 interest threshold?"
    a: "Under 2 CFR 200.305(b)(9), nonprofits may keep up to $500 of interest earned on advance federal funds per year for administrative expenses. Any interest above $500 must be remitted annually to HHS Program Support Center. This threshold is cumulative across all federal awards."
  - q: "Do we reconcile drawdowns for foundation grants too?"
    a: "Foundation grants do not use PMS or ASAP - they typically arrive via check or ACH on a milestone schedule. Reconciliation still matters (payment receipt tied to reporting milestones), but the interest and cash management rules under 2 CFR 200 do not apply."
  - q: "What happens if we over-drew a federal award?"
    a: "Return the excess promptly through PMS or ASAP. Document the return with the reconciliation. Chronic over-draws can trigger cash management findings and restrict future draw access - auditing agencies can require prior approval for each draw until the issue is resolved."
relatedPages:
  - "/resources/guides/federal-grant-reporting-requirements"
  - "/resources/guides/uniform-guidance-2-cfr-200-practical-guide"
  - "/resources/guides/nonprofit-grant-compliance-guide"
  - "/workflows/prepare-sefa-for-single-audit"
  - "/free/grant-reporting-calendar-template"
  - "/for/grants-managers"
definitions:
  - term: "PMS (Payment Management System)"
    definition: "HHS-operated federal payment system used by most civilian agencies for grant draws. Grantees log in to request disbursements and view transaction history."
  - term: "ASAP.gov"
    definition: "Automated Standard Application for Payments, operated by Treasury Bureau of the Fiscal Service. Used by USDA, DOJ, and select other agencies for grant draws and payment tracking."
  - term: "Cost-reimbursement"
    definition: "Award type where the grantee must incur allowable expenditures before drawing federal funds. Each draw must be supported by expenditures already posted to the general ledger."
  - term: "FFR (SF-425)"
    definition: "Federal Financial Report. Quarterly report of cumulative drawdowns, expenditures, and unliquidated obligations. Required for most federal awards under 2 CFR 200.328."
answers:
  - question: "How often should drawdown reconciliation happen?"
    answer: "Monthly, at minimum. Quarterly is too late - an error that compounds across three months is harder to trace and fix than a single-month variance. Organizations that reconcile monthly almost never see cash management findings in the Single Audit."
  - question: "Who should sign the drawdown reconciliation?"
    answer: "A preparer (typically the grants accountant or bookkeeper) and a reviewer (typically the finance director or controller). Segregation of duties between the person pulling draws and the person reviewing reconciliation is a standard internal control tested during audit."
  - question: "Can we draw federal funds in advance of spending?"
    answer: "Only if the award explicitly permits advance payment. Even then, 2 CFR 200.305(b) requires minimizing the time between draw and disbursement. Advance draws also trigger the interest remittance requirement above $500 per year."
  - question: "What documentation does an auditor expect for drawdowns?"
    answer: "Signed monthly reconciliations, PMS/ASAP transaction exports, general ledger detail supporting each draw, bank statements showing receipt, and interest calculations for advance awards. Organizations missing monthly reconciliations typically receive a significant deficiency or material weakness finding."
pricingStats:
  - stat: "Cash management findings are consistently among the top Single Audit findings, including drawdown timing and interest remittance issues"
    source: "GAO April 2024 analysis (GAO-24-106173)"
  - stat: "Nonprofits may retain up to $500 of interest earned on advance federal funds per year under 2 CFR 200.305(b)(9); amounts above must be remitted annually"
    source: "OMB 2 CFR 200.305(b)(9)"
  - stat: "Federal cash must be disbursed within a reasonable period - Treasury guidance interprets this as typically within three business days of receipt"
    source: "OMB 2 CFR 200.305(b); Treasury Financial Manual"
sourceUrls:
  - "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-D/subject-group-ECFRd93b1e4470b4ba8/section-200.305"
  - "https://pms.psc.gov/"
  - "https://www.fiscal.treasury.gov/asap/"
  - "https://www.gao.gov/products/gao-24-106173"
---

Monthly drawdown reconciliation is the smallest piece of federal grant compliance that prevents the largest category of findings. Organizations that skip it discover the problem during Single Audit fieldwork, when every error is now 12 months old and spread across four quarters of FFRs.

## TL;DR

- Reconcile every federal drawdown in PMS or ASAP.gov to GL expenditures every month.
- Cost-reimbursement draws must be supported by prior expenditures; advance draws must be disbursed quickly.
- Interest earned above $500/year on advance balances must be remitted annually (2 CFR 200.305(b)(9)).
- Monthly reconciliation makes quarterly FFR preparation routine.
- Missing or late reconciliations are a common cash management finding in Single Audits.

## Step-by-step

1. Pull PMS or ASAP.gov drawdown history for the month.
2. Extract matching GL expenditures by grant.
3. Classify each award as cost-reimbursement or advance.
4. Match draws line-by-line to supporting expenditures.
5. Calculate interest on any advance balances held.
6. Document variances and reclassifications in writing.
7. Tie the reconciled total to the quarterly FFR schedule.
8. Sign and file with supporting exports.

## Why Monthly Cadence Matters

Federal cash rules under 2 CFR 200.305 expect near-immediate disbursement of drawn funds. An organization that draws $50,000 on the 1st of the month and disburses it across the following four weeks is within tolerance. An organization that draws $50,000 and still holds $30,000 of it 90 days later has a cash management problem - and no quarterly reconciliation will catch it in time to correct.

Monthly cadence produces 12 reconciliation artifacts per year. Auditors sample two or three. With monthly records, sampling is a formality. Without them, one bad month becomes the whole year's finding.

## Cost-Reimbursement vs Advance

Most federal grants to nonprofits are cost-reimbursement. Expenditures come first, drawdown follows. The reconciliation is straightforward: sum expenditures for the month, verify draws did not exceed them, document the tie.

Advance awards flip the sequence. The draw arrives first; expenditures follow. Advances are common for programs with predictable monthly cash needs (some Head Start awards, some research grants). The added burden is interest tracking - any balance held in an interest-bearing account generates interest the organization may owe back.

Mixing the two on a single award by accident is a classic finding. Always check the award terms before changing draw behavior.

## Interest Remittance

The $500 threshold in 2 CFR 200.305(b)(9) is cumulative across all federal awards for the fiscal year, not per-award. An organization with six federal awards earning $100 of interest each on advance balances owes $100 remittance (total $600 minus $500 allowance) - not zero.

HHS Program Support Center processes interest remittances for most agencies. Document the calculation monthly and remit annually.

## Tying to the Quarterly FFR

The SF-425 asks for cumulative drawdowns, cumulative expenditures, and unliquidated obligations. A monthly reconciliation produces the first two numbers directly. Unliquidated obligations come from open purchase orders and encumbrances at quarter-end. Organizations that treat the FFR as the reconciliation itself inevitably submit errors.

## What GrantPipe Does Here

GrantPipe maintains drawdown records alongside the general ledger grant coding, flagging variances as they happen rather than waiting for quarter-end. Advance balance interest tracking is continuous, and FFR-ready totals are produced from the same data the reconciliation uses. [Start a trial](/signup).
