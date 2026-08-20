---
title: "GrantHub Migration Checklist"
description: "A step-by-step checklist for grants managers migrating from GrantHub Pro after the January 2026 sunset. Covers data export, field mapping, data validation, parallel period, and replacement evaluation."
seoTitle: "GrantHub Migration Checklist"
seoDescription: "Free GrantHub migration checklist: what to export, field mapping, data validation, parallel period recommendations, and what to look for in a replacement."
targetKeyword: "granthub migration checklist"
publishedAt: "2026-04-26"
updatedAt: "2026-04-26"
verifiedAt: "2026-05-24"
lastReviewedAt: "2026-05-24"
bluf: "GrantHub Pro was sunset January 31, 2026. This checklist covers the migration process for grants managers who exported their data before access ended - and for those working from alternative sources. The migration involves more than data transfer: setting up the post-award compliance infrastructure that GrantHub never provided is the most important part of the work."
sourceUrls:
  - "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200"
freePreviewSections: 2
deliverableType: pdf
deliverableUrl: "/downloads/granthub-migration-checklist.pdf"
relatedPages:
  - "/compare/alternatives/granthub/"
  - "/grant-tracking-software/"
  - "/free/award-setup-worksheet"
  - "/resources/guides/switching-from-granthub/"
buyerStage: "mofu"
---

## Before You Begin

GrantHub Pro was sunset on January 31, 2026. Access to the platform ended on that date.

**If you exported your data before January 31:** You have a GrantHub export file containing grant records, funder contacts, application history, and deadline records. This checklist guides you through using that export to build your replacement system.

**If you did not export before January 31:** Contact Foundant Technologies (the company behind GrantHub) to ask whether data retrieval is possible. If no retrieval is available, work through the Active Grant Reconstruction section of this checklist to rebuild your grant records from alternative sources (award letters, email, accounting records, institutional memory).

---

## Phase 1: Prepare Your GrantHub Export

### Export Contents to Confirm

Before relying on your export file, verify that it contains the following data types:

- [ ] Grant/opportunity records (grant name, funder, award amount, status, project period dates)
- [ ] Funder/contact records (organization name, contact names, titles, email addresses, phone numbers)
- [ ] Application history (submission dates, deadline dates, decision dates and outcomes)
- [ ] Award notes (any notes or documents attached to individual grant records)
- [ ] Deadline records (all scheduled deadlines by grant)

**What GrantHub exports did NOT contain:**

- Expenditure data (GrantHub never tracked expenditures)
- Restricted fund balances (GrantHub never modeled fund restrictions)
- Approved budget by category (GrantHub recorded total award amounts, not line-item budgets)
- Compliance documentation or report attachments

The absence of post-award data in the export is expected - not a corruption of the file. That data must come from other sources.

### Export File Formats

GrantHub exported data in CSV format. Common file names in a GrantHub export:

- `opportunities.csv` or `grants.csv` - grant/opportunity records
- `contacts.csv` or `funders.csv` - funder and contact records
- `notes.csv` - attached notes and documents
- `deadlines.csv` - scheduled deadline records

If your export contains differently named files, review the column headers to identify the data type.

---

## Phase 2: Active Grant Reconstruction

This phase captures data that GrantHub never held - the post-award compliance data for every active grant. Budget 30-60 minutes per active grant.

### For Each Active Grant, Gather:

**From the award letter and grant agreement:**

- [ ] Exact project period start and end dates (not estimates - exact dates from the Notice of Award)
- [ ] Total award amount
- [ ] Approved budget by category (personnel, fringe, supplies, travel, equipment, consultant, indirect, other)
- [ ] Any approved budget modifications during the award period with modification dates and amounts
- [ ] Restriction type (program-restricted, time-restricted, unrestricted, or combination)
- [ ] Reporting schedule: every required report type, exact due dates, and submission method
- [ ] Prior approval requirements listed in the award
- [ ] Special conditions attached to this award

**From your accounting system:**

- [ ] Year-to-date expenditures by budget category for each active grant
- [ ] Grant cost center code or project code used in the accounting system
- [ ] Any pending invoices or open purchase orders charged to the grant

**From your email and files:**

- [ ] All submitted reports with submission confirmation documentation
- [ ] Any prior approval approvals or denials during the grant period
- [ ] Budget modification approvals
- [ ] Funder correspondence about the award

**From institutional knowledge (outgoing grants manager, if applicable):**

- [ ] Funder relationship notes (program officer preferences, relationship history, renewal discussions)
- [ ] Any verbal understandings about award terms that should be documented in writing
- [ ] Compliance issues during the grant period and how they were resolved

---

## Phase 3: Replacement System Evaluation

Before migrating, confirm your replacement system can cover what GrantHub did and what GrantHub did not do.

### GrantHub Capabilities Your Replacement Must Cover

- [ ] Grant application pipeline with stage management
- [ ] Deadline calendar with multiple alert settings
- [ ] Funder contact management with relationship history
- [ ] Application and award notes and document attachment
- [ ] Reporting deadline tracking with named ownership

### Capabilities GrantHub Lacked (Your Replacement Should Provide)

- [ ] Restricted fund balance tracking by grant and budget category
- [ ] Expenditure tracking linked to grant budget lines
- [ ] Budget-vs-actual view by grant (always current, not just at reporting time)
- [ ] Compliance report generation (SF-425, custom foundation formats) from actual expenditure data
- [ ] Donor CRM for individual giving alongside grant management (if applicable)
- [ ] Compliance calendar with recurring task scheduling (not just reporting deadlines)
- [ ] Audit documentation trail linking each expenditure to its grant, budget line, and supporting document

### Evaluation Questions to Ask Each Vendor

1. Can the system model a grant's restriction type and track expenditures against approved budget categories?
2. What does the migration from a GrantHub CSV export look like - is there an import tool?
3. Does the system generate SF-425 federal financial reports from actual expenditure data?
4. Is a donor CRM included, or is that a separate product or add-on?
5. How are compliance deadlines and recurring tasks managed - manual calendar entries or system-generated task schedules?

---

## Phase 4: Field Mapping

Map your GrantHub data fields to your replacement system's fields before importing.

### Grant Records Field Mapping

| GrantHub Field         | Replacement Field     | Notes                                  |
| ---------------------- | --------------------- | -------------------------------------- |
| Opportunity/Grant name | Grant name            | Direct mapping                         |
| Funder name            | Funder / Organization | Link to funder contact record          |
| Award amount           | Award amount          | Direct mapping                         |
| Start date             | Project period start  | Confirm against Notice of Award        |
| End date               | Project period end    | Confirm against Notice of Award        |
| Status                 | Grant status / stage  | Map stage labels; "Awarded" → "Active" |
| Program officer        | Funder contact        | Link to contact record                 |
| Application deadline   | Pre-award deadline    | Map to appropriate deadline type       |
| Report deadline        | Compliance deadline   | Map to specific report type            |
| Notes                  | Internal notes        | Review for institutional knowledge     |

### Funder Contact Field Mapping

| GrantHub Field     | Replacement Field     | Notes                           |
| ------------------ | --------------------- | ------------------------------- |
| Organization name  | Organization / Funder | Direct mapping                  |
| Contact first name | First name            | Direct mapping                  |
| Contact last name  | Last name             | Direct mapping                  |
| Email              | Email                 | Direct mapping                  |
| Phone              | Phone                 | Direct mapping                  |
| Notes              | Relationship notes    | Review for relationship history |

### Fields to Add That GrantHub Did Not Have

For each active grant, you must add:

- Approved budget by category (all line items from the approved budget)
- Restriction type (program-restricted / time-restricted / unrestricted)
- Year-to-date expenditures by category (from accounting system)
- Full reporting schedule (all report types, exact due dates, submission methods)
- Prior approval requirements
- Accounting system grant code

---

## Phase 5: Data Import and Validation

### Import Sequence

1. Import funder/contact records first (grants will link to these)
2. Import grant records, linking each to the appropriate funder contact
3. Import deadline records, linking each to the appropriate grant
4. Manually enter post-award data for active grants (approved budgets, restrictions, expenditures, compliance schedules)

### Data Validation Checks

After import, verify:

- [ ] Total number of grant records imported matches the number in the GrantHub export
- [ ] Total number of funder contact records imported matches the export
- [ ] All active grants have a project period start and end date from the Notice of Award (not an estimate)
- [ ] All active grants have an approved budget entered by category
- [ ] All active grants have at least one reporting deadline entered
- [ ] All active grants have their restriction type recorded
- [ ] All funder contact records have at least an email address

**Common import errors to check:**

- [ ] Date format mismatches (GrantHub may export MM/DD/YYYY; your replacement system may expect YYYY-MM-DD)
- [ ] Funder name inconsistencies (same funder entered multiple ways in GrantHub)
- [ ] Duplicate contact records (same person entered as a contact for multiple grants in GrantHub)

---

## Phase 6: Parallel Period

Run a parallel period of 30-60 days during which you maintain both the replacement system and any existing compliance workflow.

### Parallel Period Protocol

- [ ] Enter all new grant activity (new applications, decisions, deadline updates) in the replacement system from day one of the parallel period
- [ ] Continue maintaining existing compliance spreadsheets or workflow in parallel
- [ ] At each reporting event during the parallel period, produce the report from both systems and verify the numbers match
- [ ] Document any discrepancies and investigate the source before concluding the parallel period
- [ ] Run at least one full monthly budget-vs-actual comparison in the new system and verify it matches the accounting system

### Parallel Period Exit Criteria

Do not end the parallel period until:

- [ ] At least one complete reporting cycle has been run in the new system and verified against accounting records
- [ ] All active grants have complete budget and restriction data entered
- [ ] All compliance deadlines for the next 90 days are visible in the new system with named owners
- [ ] Finance has confirmed that expenditure coding against the replacement system's grant identifiers works correctly

---

## Phase 7: Decommission and Archive

### Decommission Old Workflow

- [ ] Archive GrantHub export files in your document management system
- [ ] Archive all compliance spreadsheets used in the parallel period
- [ ] Update internal documentation to reflect the new system
- [ ] Update staff procedures for new grant intake, expenditure approval, and report preparation

### Record Retention for GrantHub Data

GrantHub export files contain grant records that may be subject to your organization's grant record retention policy. Federal regulations require retention of grant records for a minimum of three years from the date of the final expenditure report submission (not the grant end date). The specific regulatory citation and any exceptions should be verified against the current version of 2 CFR Part 200 at ecfr.gov before relying on this requirement for compliance purposes. Archive GrantHub exports in accordance with your retention policy and confirmed regulatory requirements.

---

## What to Look for in a Replacement System: Scorecard

Rate each capability on importance (1-5) and the candidate system's coverage (1-5):

| Capability                               | Importance | System A | System B |
| ---------------------------------------- | ---------- | -------- | -------- |
| Application pipeline management          |            |          |          |
| Deadline calendar with ownership         |            |          |          |
| Funder contact history                   |            |          |          |
| Restricted fund balance tracking         |            |          |          |
| Expenditure tracking by budget line      |            |          |          |
| Budget-vs-actual by grant                |            |          |          |
| SF-425 report generation                 |            |          |          |
| Foundation report generation             |            |          |          |
| Donor CRM (if needed)                    |            |          |          |
| GrantHub import tool                     |            |          |          |
| Compliance calendar with recurring tasks |            |          |          |
| Audit documentation trail                |            |          |          |
| Pricing within budget                    |            |          |          |

Multiply importance by coverage for each capability. Sum the scores. The system with the higher total across the capabilities that matter most to your organization is the stronger fit.
