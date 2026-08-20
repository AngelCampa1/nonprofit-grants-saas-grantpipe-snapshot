---
title: "How to Set Up a Monthly Giving Program: Step-by-Step"
description: "A step-by-step workflow for launching a monthly giving program - from payment processor setup through welcome sequences, failed payment recovery, and CRM configuration."
seoTitle: "How to Set Up a Monthly Giving Program"
seoDescription: "Step-by-step workflow to launch a monthly giving program for nonprofits. Covers payment processing, CRM setup, welcome sequences, and failed payment recovery."
targetKeyword: "set up monthly giving program nonprofit"
publishedAt: "2026-04-29"
updatedAt: "2026-04-29"
lastReviewedAt: "2026-04-29"
buyerStage: "mofu"
schema: "HowTo"
topicCluster: "donor-operations"
contentIntent: "workflow"
primaryCta: "lead-magnet"
ctaMode: "educate"
refreshCadenceMonths: 12
targetPersona:
  - "development-director"
  - "executive-director"
tags:
  - "workflow"
timeEstimate: "4-6 weeks"
difficulty: "intermediate"
bluf: "Setting up a monthly giving program is largely a technical and operational project before it's a fundraising project. Getting the payment processing, failed payment handling, CRM tagging, and welcome sequence right before you launch determines whether the program retains donors or leaks them through preventable attrition."
relatedPages:
  - "/free/monthly-giving-program-launch-checklist"
  - "/resources/guides/monthly-giving-program-complete-guide"
  - "/features/donor-retention-reporting"
steps:
  - title: "Choose your payment processor and set up recurring billing"
    content: "Monthly giving requires a payment processor that handles recurring charges reliably and sends automated failed payment notifications. Stripe, PayPal Giving Fund, and most major CRM platforms (Bloomerang, Salesforce NPSP) have recurring billing built in. Key requirements: automatic credit card updater (reduces failed payments when cards expire), clear donor portal for self-service cancellation, and automated receipts for each monthly charge."
  - title: "Create a distinct monthly giving identity and messaging"
    content: "Monthly giving programs with names and specific impact messaging outperform generic recurring giving pages. A named program ('The Monthly Circle', 'The Forward Fund') creates group identity and makes monthly donors feel like members rather than subscribers. The core message: 'Your monthly gift of $X provides [specific, concrete impact each month].' Avoid vague impact statements - 'helps us serve more people' loses to 'covers the cost of one counseling session per month.'"
  - title: "Set your ask amounts and default options"
    content: "Monthly giving ask amounts should be lower than your one-time annual ask. A donor who gives $100 annually might give $10-$15/month (totaling $120-$180). The sweet spot for online monthly giving is $15-$25/month - achievable for a wide range of donors and meaningful at scale. Present three to four options with one pre-selected. Include a free-form amount for donors who want to give more."
  - title: "Build your upgrade and acquisition flows"
    content: "Monthly programs grow through two channels: new donor acquisition (defaulting recurring at checkout) and existing donor upgrade asks. For acquisition: make recurring the default option on donation pages with a clear opt-down for one-time gifts. For upgrades: segment your one-time donor base and send a specific monthly upgrade appeal - 'Would you consider switching to monthly?' with a concrete impact statement and a suggested monthly amount equal to 10% of their last annual gift."
  - title: "Build your retention program for monthly donors"
    content: "Monthly donors cancel when they feel forgotten, not when they disagree with your mission. Retention requires: an immediate welcome series (3 emails over 30 days), a monthly or quarterly impact email, an annual thank-you that acknowledges their giving total, and a card or personal note at year-end. Monthly donors who receive zero stewardship cancel at 2-3x the rate of those who receive regular impact updates."
prerequisites:
  - "Payment processor with recurring billing capability"
  - "Online donation page or CRM"
  - "Email capability for donor communications"
  - "Commitment to ongoing stewardship communications"
outputs:
  - "Active monthly giving program with dedicated page and messaging"
  - "Recurring billing configured with automatic updater"
  - "Donor stewardship email sequence for monthly givers"
---

## What This Workflow Covers

A monthly giving program requires more setup infrastructure than a one-time appeal. You're building a recurring billing system, a donor lifecycle workflow, and a retention process that runs continuously - not a campaign with a start and end date.

This workflow covers the full setup from payment processor configuration through CRM tagging, with a recommended soft-launch sequence to test before promoting broadly. Estimated total time from start to launch: 4-6 weeks.

**Who runs this workflow:** Development Director, supported by staff or consultant handling technical platform configuration.

**Before starting:** Confirm which online donation platform and CRM you're using - the specific technical steps vary. This workflow describes the decisions and sequence; your platform's documentation covers the mechanics.

---

## Step 1: Choose Your Payment Processor and Configure Recurring Billing

**Time: 1 week**

Your payment processor needs to support recurring (subscription) billing - not all processors do, or not with the flexibility monthly giving requires.

**What to confirm before selecting or sticking with your current processor:**

- Can donors choose their monthly billing date? (Recommended: yes - donors billing on the 1st, 15th, or a date of their choosing have higher retention than those forced into a single billing date)
- Does the processor support ACH/bank draft in addition to credit cards? (Bank draft has significantly lower administrative decline rates)
- What is the failed payment retry schedule? Is it configurable?
- Does the processor support account updater services for automatically refreshing expired card numbers?
- What are the per-transaction fees for recurring credit card vs. ACH charges?
- How does the processor handle the donor experience for updating payment information? Is there a self-service portal?

If your current processor doesn't support the above, evaluate alternatives. Common processors used by nonprofits for monthly giving: Stripe (widely supported), Authorize.net, and processors built into platforms like Classy, Bloomerang, or DonorPerfect.

**Configure your recurring billing product:**

- Set up the monthly giving "product" or "plan" in your processor
- Define the available giving levels ($10, $15, $25, $50, $100/month are common starting points - consider your average one-time gift and what a monthly equivalent would look like)
- Confirm that a custom amount option is available (some donors will give non-standard amounts)

---

## Step 2: Set Up Failed Payment Retry Logic

**Time: concurrent with Step 1**

This step is the most commonly skipped and the most consequential for program retention. Do it before launch, not after.

**Configure retry schedule:**
Most processors allow you to configure how many times a failed charge is retried and at what intervals. A standard retry schedule: retry on day 3, day 7, and day 14 after the initial failure. Three attempts over two weeks gives donors time to update expired cards or resolve temporary insufficient funds before being lapsed.

**Configure donor notification emails:**
Set up automated emails that go to the donor when a charge fails:

- **Failure notification (immediate):** "Your monthly gift of $X to [Organization] didn't process on [date]. Please update your payment method to continue your support." Include a direct link to the self-service payment update page.
- **Second reminder (if not updated after 5 days):** A follow-up if the donor hasn't updated their information. Warmer tone: "We want to make sure your monthly support continues - it only takes a minute to update your payment info."

These emails should come from a named staff member's address, not a no-reply system address.

**Define lapse threshold:**
After all retries are exhausted, what is the donor's status? They should be automatically flagged as lapsed in your CRM, removed from active monthly donor count, and entered into your lapsed donor recovery workflow (see the [lapsed donor reactivation workflow](/resources/guides/donor-retention-strategies)).

---

## Step 3: Create Your Monthly Giving Landing Page and Ask

**Time: 1 week**

Your monthly giving landing page serves two purposes: converting new donors to monthly giving, and receiving existing donors who click through from conversion emails.

**Landing page required elements:**

- A specific ask amount with impact framing: "$25/month = X. $50/month = Y."
- Clear statement of how recurring billing works (the donor will be charged automatically each month; they can cancel anytime)
- ACH/bank draft option prominently featured or encouraged
- A specific security and trust statement (donor data handling, how to cancel, contact information)
- Tax statement (recurring monthly gifts are tax-deductible to the extent permitted by law; donors will receive annual summaries)

**The ask amount choice:** Your landing page should default to suggesting a specific monthly amount based on the acquisition context. A donor converting from an annual gift should see a suggested monthly equivalent to their annual giving; a new donor coming from a social media ad may see $15 or $25 as the default ask.

**Test before promoting:** Complete a test transaction yourself through the full flow - from landing page through payment through confirmation email - to confirm that every system is working, every email triggers correctly, and the confirmation email contains the right information before you promote to donors.

---

## Step 4: Write the Upgrade Conversion Email for Existing Donors

**Time: concurrent with Step 3**

Your highest-converting acquisition source for monthly giving is your existing annual donor base. Write a specific email to convert annual donors to monthly.

**Effective conversion email structure:**

Opening: Acknowledge their existing giving history - reference their most recent gift. "You've been a consistent supporter for [X] years."

The conversion ask: Frame it as convenience and equivalent impact, not an upgrade. "Instead of your annual gift at year-end, would you consider giving $[monthly equivalent] each month? Same impact, delivered throughout the year when our programs need it most."

The mechanics: One paragraph explaining how it works. One link to the monthly giving page (or a pre-populated form that suggests their monthly equivalent amount).

An easy out: "If monthly giving doesn't work for your situation, no problem - you can continue giving as you always have."

**Segment before sending:**

- Multi-year donors (highest conversion probability)
- Prior-year donors who haven't yet given this year (good conversion candidates with a win-back element)
- Exclude donors who've given in the past 30 days to avoid over-asking

---

## Step 5: Set Up the Welcome Sequence for New Monthly Donors

**Time: 1 week**

The donor welcome sequence is the highest-return retention investment in the program. New monthly donors who receive a strong onboarding experience in their first 60 days retain at significantly higher rates.

**Welcome sequence (minimum viable):**

**Email 1 - Immediately after first charge:** Confirmation and welcome. Tax receipt, confirmation of monthly amount and billing date, and one specific impact statement. This email should feel personal, not automated - even if it's automated, it should read like a note from a person.

**Email 2 - Day 7:** Introduction to your organization's work. Not a pitch - a welcome into your community. A photo or short video from program staff or participants (with permission) works well here.

**Email 3 - Day 30:** One month in. A brief impact update specific to what your organization accomplished that month, framed for someone who has just started their giving relationship with you.

**Email 4 - Day 45-60:** A stewardship touchpoint: invitation to visit a program, a behind-the-scenes update, a personal note from your ED. Something that deepens the connection beyond transactional giving.

**After the onboarding sequence:** Monthly donors enter your standard donor communication calendar but should receive at least one stewardship-specific communication per quarter that isn't also a fundraising ask.

---

## Step 6: Set Up the Failed Payment Recovery Sequence

**Time: concurrent with Step 5, once processor settings are confirmed**

In addition to the automated system notifications from Step 2, build a personal follow-up process for high-value monthly donors whose payments fail.

**For donors giving $50/month or more:**
When a charge fails and the automated notifications don't result in payment update within 7 days, route that donor to a staff queue for personal outreach - a phone call or personal email, not another automated message.

The tone: assume the donor wants to keep giving. "Hi [Name], I noticed your monthly gift didn't process this month and I wanted to reach out personally to make sure everything is okay. It's easy to update your payment information, and I'm happy to help if you'd like." This outreach recovers a meaningfully higher percentage of lapsed monthly donors than automation alone.

---

## Step 7: Configure Your CRM to Tag and Track Monthly Donors

**Time: concurrent with Steps 5-6**

Your CRM needs to clearly distinguish monthly giving donors from one-time or annual donors for reporting, communication, and retention tracking.

**Required CRM configuration:**

- Tag all monthly donors with a "Monthly Donor" designation
- Record giving status: Active / Payment Failed / Cancelled / Lapsed
- Track enrollment date (when did they start monthly giving?)
- Track most recent successful charge date
- Track credit card vs. bank draft payment method
- Suppress monthly donors from standard annual fund appeal sequences (you want separate, stewardship-focused communication for this group, not the same ask-heavy appeals you send to one-time donors)

**Reporting setup:**
Establish the monthly reporting routine before you launch so you have baseline data from month one:

- Active monthly donor count
- Monthly recurring revenue (total of all active monthly amounts)
- New enrollments this month
- Cancellations this month (with reason if captured)
- Administrative lapses (failed payment, unrecovered)
- Net change in active donor count

---

## Step 8: Establish Monthly Reporting Routine

**Ongoing from launch**

Monthly giving programs need regular monitoring to catch attrition before it compounds. Schedule a monthly review (20-30 minutes) to track:

- Active donor count vs. prior month
- Gross vs. net monthly revenue (what you billed vs. what you collected after declines)
- Churn rate: what percentage of active monthly donors cancelled or lapsed?
- Cause of churn: voluntary cancellation vs. administrative decline

A churn rate above 2% per month (roughly 22% annual) signals that either your decline recovery process is underperforming or voluntary cancellations are higher than expected.

[Donor retention reporting](/features/donor-retention-reporting) in GrantPipe tracks these metrics by segment, separating monthly giving retention from your overall donor retention rate so you can see program performance clearly.

---

## Step 9: Soft Launch to Existing Top Donors First

**Time: 1 week before public launch**

Before promoting monthly giving broadly, run a soft launch with your top 20-50 annual donors.

Send a personalized email or make personal calls to this group, asking if they'd be willing to convert to monthly giving as part of a new program you're launching. Frame it as: "We're asking our most committed supporters to help us build this program - your participation would mean a lot."

The soft launch achieves two things:

1. **Tests your systems** under real conditions with donors whose relationships you can manage carefully if something goes wrong
2. **Builds an initial monthly donor base** that makes your program look active and established when you promote it more broadly

After the soft launch, validate that all CRM tagging, email sequences, payment confirmations, and failed payment workflows are operating correctly before scaling.

---

## How GrantPipe Supports This Workflow

GrantPipe tracks monthly giving status, payment history, and donor lifecycle stage alongside your full donor relationship and grant data. [Donor segmentation](/features/donor-segmentation) tools let you manage monthly donor communications separately from standard annual fund appeals, and [soft credit tracking](/features/soft-credit-tracking) keeps referral relationships visible for stewardship purposes.

For the full monthly giving program strategy behind this workflow, see the [Monthly Giving Program Complete Guide](/resources/guides/monthly-giving-program-complete-guide).

[Start a free trial](/signup) to see how monthly giving program tracking works alongside your other donor management operations.
