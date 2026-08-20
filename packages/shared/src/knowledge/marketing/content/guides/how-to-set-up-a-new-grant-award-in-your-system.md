---
title: "How to Set Up a New Grant Award in Your Grant Management System"
description: "The first five things to enter when you receive an award letter, common setup errors that cause downstream problems, and how to link the award to your donor"
seoTitle: "How to Set Up a New Grant Award in Your System"
seoDescription: "How to set up a new grant award in your grant management system: project period, budget, restriction type, reporting schedule, and funder record linkage."
publishedAt: "2026-04-26"
updatedAt: "2026-04-26"
lastReviewedAt: "2026-04-26"
buyerStage: "mofu"
contentIntent: "workflow"
targetKeyword: "set up grant award software"
targetPersona:
  - "development-director"
  - "grants-manager"
  - "finance-director"
schema: "HowTo"
steps:
  - title: "Enter the project period immediately"
    content: "The project period - the start date and end date of the period of performance - is the first field to enter. Costs incurred before the start date or after the end date are unallowable. Enter the exact dates from the Notice of Award, not the approximate dates from the application. Some awards have start dates that differ from the date you receive the letter by weeks or months. Confirm the actual authorized start date before any spending begins."
  - title: "Enter the award amount and approved budget by category"
    content: "Enter the total award amount and then break it down by approved budget category: personnel, fringe benefits, supplies, travel, equipment, consultant/contractual, indirect costs, and any program-specific categories. The approved budget by category is the compliance baseline. Every expenditure must fall within an approved category. Any budget-line variance above the rebudgeting threshold triggers prior approval requirements. If you enter only the total award amount without the line-item breakdown, the system cannot flag potential compliance problems."
  - title: "Record the restriction type"
    content: "Classify the grant's restriction: program-restricted (funds may only be used for a specific program or activity), time-restricted (funds must be spent within the period of performance and cannot be carried over without approval), geography-restricted (funds may only support activities in a defined geographic area), or unrestricted. Some grants carry multiple restrictions. Recording the restriction type at setup is necessary for proper fund accounting and for the compliance alerts that should fire when expenditures approach the boundary of what the restriction permits."
  - title: "Enter the complete reporting schedule"
    content: "Enter every required report for the full period of performance: type of report (interim financial, interim programmatic, final financial, final programmatic, special conditions reports), due date, reporting period covered, and submission method. Do not enter only the final report deadline - enter every deadline. A quarterly SF-425 schedule means four entries per year. A federal grant with both quarterly financial and semi-annual programmatic reporting means six reporting deadlines per year, plus the final reports. All of them belong in the system from day one."
  - title: "Link the award to the funder's donor record"
    content: "In a unified system, the grant award is linked to the funder's constituent record. This connection is important for development purposes (tracking the full relationship history with the funder, including applications and past awards) and for financial reporting (the funder's payment information, address for correspondence, and program officer contact should all be accessible from the grant record without duplicating data)."
  - title: "Enter key contacts and prior approval requirements"
    content: "Enter the name, title, email, and phone number of the program officer responsible for your award. Also enter the grants officer or grants administrator contact if different. Then document the prior approval requirements from the award: what changes require advance funder approval, the threshold above which budget modifications must be pre-approved, and any special conditions attached to this specific award that have their own notification or approval requirements."
  - title: "Set up the grant in the accounting system with matching codes"
    content: "The grant management system and the accounting system must use consistent identifiers for this grant. If the accounting system uses a project code or cost center number for the grant, enter that code in the grant management record. This connection ensures that when you pull a budget-vs-actual report in the grant management system, it pulls from the same transactions coded in the accounting system - with no manual reconciliation required."
bluf: "The setup work done in week one determines how easy or difficult compliance management will be for the entire grant period. Entering only a grant name and a total award amount is the minimum - it is not the setup. A complete setup includes project period, award amount by budget category, restriction type, full reporting schedule, funder contact information, prior approval requirements, and the accounting system grant code that links expenditure tracking to the award record."
faqs:
  - q: "What is the most common grant setup error?"
    a: "Entering the total award amount without breaking it down by approved budget category. Without the line-item budget in the system, there is no baseline for expenditure tracking or compliance monitoring. The system cannot flag that a supply expenditure is approaching the approved supply budget limit if it does not know what the limit is. The second most common error: entering the grant application budget instead of the approved budget from the Notice of Award. These are often different - funders frequently modify budgets when making the award."
  - q: "What if the award letter does not show a budget breakdown?"
    a: "The Notice of Award references the approved budget, which is usually the budget submitted with the application (possibly with modifications noted in the award conditions). If the award letter does not include a detailed budget, request the approved budget document from the program officer or grants officer. For federal awards, the approved budget may be in a separate document accessible through the grants management system (Grants.gov, eRA Commons, Workspace). Do not proceed with the setup using the application budget without confirming whether it was modified during the review process."
  - q: "How do I enter a multi-year award?"
    a: "Multi-year federal awards often have annual budget periods with separate budgets for each year. Enter the overall period of performance and the total award amount, then create budget periods for each year with the year-specific budget breakdown. The reporting schedule will have annual reports and a final report at the end of the full performance period. Year-one funds not spent in year one may require carryover approval before they can be used in year two - note this in the grant record if applicable to the award."
answers:
  - question: "Should I set up the grant before or after the kickoff meeting?"
    answer: "Set up the basic record - project period, award amount, restriction type - immediately when you receive the award letter. Enter the detailed budget breakdown and reporting schedule either in preparation for the kickoff meeting (so you can project the record during the meeting for collaborative review) or immediately after the kickoff (incorporating any clarifications that emerged during the meeting). The record should be complete before any spending begins."
  - question: "What happens if I set up the wrong project period?"
    answer: "If the start date is entered as earlier than the authorized start date, the system may not flag expenditures incurred before the authorized start - and those expenditures are unallowable. If the end date is entered incorrectly, compliance alerts tied to the end date (final report deadlines, equipment inventory reminders, closeout preparation triggers) will fire at the wrong time. Use the exact dates from the Notice of Award, not the dates from the application or from an informal email notification."
relatedPages:
  - "/grant-tracking-software/"
  - "/free/award-setup-worksheet"
leadMagnetSlug: "award-setup-worksheet"
tags:
  - "grant management"
  - "award setup"
  - "grant tracking"
  - "how-to"
---

The grant award letter arrives. It is good news. The instinct is to share it with the team, update the pipeline, and start planning program delivery.

The compliance instinct is different: read the award letter completely, enter every relevant detail into the grant management system before any spending begins, and confirm that the accounting system is set up to track expenditures against the correct grant codes.

These two things can happen at the same time. But the compliance setup cannot wait.

## Why Setup Quality Determines Compliance Quality

The data entered during grant setup is the foundation for everything that happens during the grant period. Every expenditure that will be tracked against this award, every budget-vs-actual report, every compliance alert, and every funder report will be generated from or compared against the information entered during setup.

An incomplete setup produces an incomplete compliance record. A setup that uses approximate figures (the application budget rather than the approved budget, rounded award amounts, estimated project end dates) produces inaccurate compliance data that must be corrected later - usually at the worst possible time, when a report is due.

The hour invested in a complete, accurate setup at week one pays for itself dozens of times over the grant period.

## Reading the Award Letter Before Setting Up

Before opening the grant management system, read the full Notice of Award and grant agreement. Read them, not skim them. The details that matter most are often in sections most people skip:

**Special conditions.** Federal awards sometimes include special conditions attached to the specific award that go beyond the standard program requirements. A nonprofit in its first year of federal funding may be subject to enhanced monitoring or additional reporting. An organization that had a prior finding may have a condition requiring additional documentation. Special conditions are compliance obligations - they belong in the grant record.

**Modified budget.** The budget you submitted in the application is not always the budget the funder approved. Funders frequently reduce awards, redirect funds between categories, or require specific line-item modifications as conditions of the award. Always use the approved budget from the award, not the application budget.

**Prior approval requirements.** Most federal awards include a list of actions that require advance funder approval before they are taken. These should be documented in the grant record and shared at the kickoff meeting - because the program lead needs to know them before making operational decisions.

**Closeout requirements.** The award letter may specify closeout deadlines and processes that differ from the standard 2 CFR 200 requirements. Note these in the grant record so they appear in the compliance calendar for the relevant period.

## The Accounting System Connection

The grant management system and the accounting system are not the same system - but they must be synchronized.

When a purchase order is issued for grant-funded supplies, the accounting system codes it to the grant using whatever identifier the accounting system uses (a project code, a cost center number, a job number). When you run a budget-vs-actual report in the grant management system, it should pull from the same transactions.

This synchronization requires that the same identifier is used in both systems, consistently, from the first day of the grant. If finance codes supplies to grant project code "GR-2026-014" and the grant management system tracks the same award as "Youth Workforce Development - DLTR-2026," the two systems cannot talk to each other without manual reconciliation.

Set up the accounting system grant code during the same setup session as the grant management system record. Confirm with finance that the code is in place before any invoices are approved.

Download the [Award Setup Worksheet](/free/award-setup-worksheet) for a structured template covering every field that should be entered during week-one setup - including a checklist of what to extract from the award letter and grant agreement before you open the grant management system.
