---
title: Ask Finance Questions
entitlement: hasAskYourLedger
description: "GrantPipe answers narrow grant budget and fund balance questions from your records. Each answer shows source links."
seoTitle: Ask-Your-Ledger for Nonprofit Grant Finance
seoDescription: "Ask GrantPipe about grant budget risk and restricted fund balances. Get grounded answers with source links from your records."
targetKeyword: nonprofit ledger assistant
publishedAt: "2026-06-18"
updatedAt: "2026-06-18"
lastReviewedAt: "2026-06-18"
buyerStage: bofu
schema: SoftwareApplication
topicCluster: grant-management
contentIntent: category
primaryCta: trial
ctaMode: convert
refreshCadenceMonths: 12
targetPersona:
  - executive-director
  - finance-operations-staff
tags:
  - feature
  - reporting
  - grant-management
  - compliance
  - accounting
bluf: "Ask-Your-Ledger answers narrow finance questions. It uses GrantPipe records. Each answer includes source links."
faqs:
  - q: What can I ask?
    a: "The first version answers grant budget risk and restricted fund balance questions."
  - q: Does it write SQL?
    a: "No. It uses a fixed set of safe queries."
  - q: Does it replace accounting advice?
    a: "No. It helps staff find records and check numbers. It is not legal or accounting advice."
  - q: Which plan includes Ask-Your-Ledger?
    a: "It starts on Growth. Growth and higher plans include unlimited questions."
relatedPages:
  - /product
  - /pricing
  - /features/cross-entity-report-builder
  - /features/restricted-fund-tracking
  - /features/grant-budget-sentinel
proscons:
  - subject: Ask-Your-Ledger
    pros:
      - Answers supported questions from GrantPipe records.
      - Shows source links with each answer.
      - Blocks raw SQL generation.
      - Respects role and plan access.
    cons:
      - It answers a narrow question set in this release.
      - It does not replace formal accounting review.
      - It does not answer donor-specific questions.
answers:
  - q: What is Ask-Your-Ledger?
    a: "It is a grounded question tool for grant budget risk and restricted fund balances."
  - q: Why do answers include links?
    a: "Links let staff check the records behind the number."
  - q: How does it protect data?
    a: "It respects roles and uses safe analytics. Raw questions are not sent to PostHog."
sourceUrls:
  - "https://www.councilofnonprofits.org/running-nonprofit/administration-and-financial-management/financial-management"
  - "https://www.fasb.org/page/PageContent?pageId=/projects/recentlycompleted/accounting-standards-update-no-201614-not-for-profit-entities-topic-958.html"
tableData:
  name: Supported questions
  description: What Ask-Your-Ledger can answer first.
  columns:
    - Question type
    - Source
    - Output
  rows:
    - - Grant budget risk
      - Budget sentinel records
      - Grant lines with overage exposure
    - - Restricted fund balances
      - Fund report preview
      - Funds with positive restricted balances
    - - Unsupported questions
      - Report builder fallback
      - Low-confidence next step
---

## The problem

Finance questions often start small.

A leader may ask which grants are over budget. A program lead may ask which
restricted funds still have balances. Staff can find the answer, but they may
need to open several screens first.

That slows down review work. It also raises the chance that someone quotes a
number without checking the source.

## How GrantPipe solves it

Ask-Your-Ledger answers supported questions from GrantPipe records.

Type a question. GrantPipe checks the safe question set. If the question is
supported, it runs the matching query. The answer shows the result and the
records behind it.

Every answer includes source links. Staff can open the grant budget or report
view before they act.

## What you can ask first

The first version answers two kinds of questions.

Ask which grants are over budget. GrantPipe checks budget sentinel records and
shows grant lines that need review.

Ask for restricted fund balances. GrantPipe checks restricted funds with a
positive balance and shows source rows.

If the question is outside that set, GrantPipe says so. It sends staff to the
report builder instead.

## Built for review

Ask-Your-Ledger is a review aid. It is not accounting advice.

The answer is short. The source links matter more. Staff can open the record,
check the math, and decide what to do next.

Role access still applies. A user must have report view and accounting view
access. Auditor access stays read-only.

Ask-Your-Ledger starts on Growth. Growth and higher plans include unlimited
questions.

## Example checks

Use it before a staff meeting. Ask which grants are over budget. The answer can
show the grant line, the approved budget, and the projected amount.

Use it during month close. Ask which restricted funds still have money left. The
answer can show the fund rows that have a positive balance.

Use it before a board update. Staff can ask the narrow question first. Then they
can open the linked record. They can check the detail before they share a
number.

Ask-Your-Ledger also helps when a question is too broad. The tool may not
support the view yet. In that case, GrantPipe sends staff to the report builder.
That keeps the answer honest.

## Why the source links matter

Hidden sources cause mistakes.

GrantPipe keeps the source visible. A budget answer links to the grant budget.
A fund balance answer links to the report view. Staff can check the record
instead of trusting a loose summary.

That matters for small teams. One person may own grants. Another may own
finance. A third may prepare the board packet. Source links help each person see
the same record.

The tool also keeps analytics safe. GrantPipe tracks safe buckets, such as
question length and answer count. It does not send raw question text to PostHog.

## What it replaces

- Opening many screens for a quick budget check.
- Quoting a number without a source.
- Asking a teammate for a simple fund balance lookup.
- Using a chat tool that can invent a number.

## Who it is for

Finance leads use it for quick review before they act.

Grants managers use it to spot budget risk without rebuilding a report.

Auditors can use it with read-only access. They can review grants and funds
without opening donor data.

Leaders can use the answer as a starting point. Staff still need to check the
linked records. Then the number can go into a report.

## How it stays narrow

Ask-Your-Ledger starts from an allowlist. The app checks the question against
supported intents. Then it runs the matching query.

That means the tool can say no. A question may need a custom view. If so,
GrantPipe points staff to the report builder. The source data may not be ready.
When that happens, the tool does not make up an answer.

## What to know before you use it

Ask-Your-Ledger does not write SQL. It does not choose tables on its own. It
does not answer donor-specific questions.

The first release is narrow on purpose. It answers finance questions that have
good source data today. The team can add more question types after the data and
tests are ready.

## Start a free trial

[Start a trial](/pricing).

## Related feature pages

See [custom report builder](/features/cross-entity-report-builder). See
[restricted fund tracking](/features/restricted-fund-tracking). See [grant
budget checks](/features/grant-budget-sentinel).
