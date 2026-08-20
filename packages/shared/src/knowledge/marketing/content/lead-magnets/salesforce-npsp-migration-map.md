---
title: "Salesforce NPSP Migration Map"
description: "A practical mapping guide for nonprofits deciding whether to migrate from Salesforce NPSP or Agentforce Nonprofit into a purpose-built system. It shows how to inventory exports, custom objects, reports, workflows, and relationships before any rebuild begins."
seoTitle: "Salesforce NPSP Migration Map"
seoDescription: "Free Salesforce NPSP migration map for nonprofits: map exports, custom objects, reports, workflows, and donor/grant data into a clean migration plan."
publishedAt: "2026-04-28"
updatedAt: "2026-04-28"
verifiedAt: "2026-05-24"
lastReviewedAt: "2026-05-24"
bluf: "When a nonprofit is facing the Salesforce NPSP to Agentforce Nonprofit transition, formerly the Nonprofit Cloud transition, the real work is not exporting records. It is mapping the current data model, automations, and reporting structure to decide what should move, what should be rebuilt, and whether a purpose-built platform is the better long-term fit."
sourceUrls:
  - "https://www.irs.gov/charities-non-profits/form-990-resources-and-tools"
  - "https://candid.org/"
freePreviewSections: 2
deliverableType: pdf
deliverableUrl: "/downloads/salesforce-npsp-migration-map.pdf"
relatedPages:
  - "/resources/guides/how-to-migrate-from-salesforce-npsp"
  - "/compare/alternatives/salesforce-nonprofit"
buyerStage: "bofu"
faqs:
  - q: "What is a Salesforce NPSP migration map?"
    a: "It is a working document that lists the Salesforce objects, custom fields, reports, flows, integrations, and record relationships in your current org and shows how each one maps into the target system. The goal is not just to move data, but to preserve the business logic your team relies on."
  - q: "Do we need to migrate everything from Salesforce?"
    a: "No. Most nonprofits should migrate active donor records, active grant records, key notes and activities, and the reporting structures that staff use every week. Historical clutter, obsolete automation, unused custom objects, and old test data usually add cost without adding value."
  - q: "How do we decide whether to stay on Salesforce or switch?"
    a: "Use the map to estimate rebuild effort. If your org depends on custom objects, consultant-built automations, and fragile reporting workarounds, the migration cost can make a purpose-built nonprofit platform more practical than rebuilding Salesforce again."
tags:
  - "salesforce"
  - "npsp"
  - "migration"
  - "nonprofit crm"
leadMagnetSlug: "salesforce-npsp-migration-map"
schema: "Article"
---

## Why This Map Exists

If your nonprofit is on Salesforce NPSP today, the transition to Agentforce Nonprofit, formerly Nonprofit Cloud, can feel like a technical project. In practice, it is a business process project. The source of risk is not the export button. The risk is that your team has built years of donor, grant, and finance logic into a Salesforce org that now needs to be translated into a different structure.

This map is designed to help you do two things before you sign a migration statement of work:

1. Inventory what actually exists in your org.
2. Decide whether the work is a migration, a rebuild, or a sign that you should evaluate a different platform entirely.

That distinction matters. A clean org with limited customization can often be migrated with modest effort. A heavily customized org with multiple automations, custom objects, and reporting dependencies can turn into a long consulting engagement with no clean end state. The point of the map is to surface that reality early, when the options are still open.

For a mid-sized nonprofit, the most useful mindset is operator-first, not platform-first. Do not ask, "How do we preserve Salesforce?" Ask, "How do we preserve donor history, grant tracking, restricted fund visibility, and compliance reporting with the least operational drag?"

## Inventory the Current Salesforce Footprint

Start by listing the building blocks in the current org. Do not rely on memory. Pull the configuration, export the metadata where possible, and ask each functional owner what they actually use.

| Salesforce item                        | What to capture                                                                           | Why it matters                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| NPSP Accounts and Contacts             | Household structure, organization links, primary relationships, communication preferences | These records usually become the core donor/contact model           |
| Opportunities                          | Gift type, amount, close date, stage, campaign, primary contact, general ledger mapping   | This is where donation and pledge history lives                     |
| Recurring Donations                    | Frequency, start date, installment behavior, pause/cancel logic                           | Recurring gift logic often breaks if it is treated as plain history |
| Campaigns                              | Appeal names, source codes, revenue attribution rules                                     | Campaign history helps preserve fundraising reporting               |
| Affiliations and Relationships         | Individual to organization links, spouse/partner ties, committee roles                    | These relationships often hold institutional knowledge              |
| Custom objects                         | Grant-specific, event-specific, finance-specific, or board-specific objects               | Custom objects are where migrations get expensive                   |
| Reports and dashboards                 | Inputs, filters, folder ownership, schedule frequency, recipients                         | A report that cannot be reproduced is a hidden loss                 |
| Flows, Process Builder, workflow rules | Trigger conditions, field updates, approvals, notifications                               | Automation rarely maps one-to-one                                   |
| Integrations                           | Accounting, email, forms, fundraising, document storage, BI tools                         | Each integration can add scope to the migration                     |

Do the same for permissions, record types, sharing rules, validation rules, and duplicate management. These are easy to ignore until users go live and discover they cannot see what they need or cannot enter data in the same way they used to.

If a field, automation, or object is owned by a single consultant or one internal admin, mark it as a risk. Anything that depends on tribal knowledge is expensive to recreate because the migration team has to reverse engineer it before it can be rebuilt.

## Map Salesforce Data to GrantPipe

GrantPipe is built around a simpler operating model: donor management, grant tracking, restricted fund tracking, and compliance reporting in one place. That means many Salesforce constructs do not need a perfect clone. They need a practical landing zone.

Use this crosswalk as a starting point:

| Salesforce source     | What it usually means                                                   | GrantPipe destination                           | Decision                                                      |
| --------------------- | ----------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------- |
| Contact / Household   | Individual donor, household, or family relationship                     | Donor contact and household relationship        | Migrate if it supports giving history or active relationships |
| Opportunity           | Donation, pledge, matching gift, or payment record                      | Gift, pledge, or related revenue record         | Migrate active and reporting-relevant history                 |
| Campaign              | Appeal, channel, or fund development campaign                           | Campaign or attribution label                   | Migrate if used for reporting or segmentation                 |
| Recurring Donation    | Sustaining gift commitment                                              | Recurring gift logic                            | Migrate active recurring commitments only                     |
| Custom grant object   | Grant record with deadlines, status, funder, and reporting requirements | Grant record and compliance timeline            | Migrate if the record drives active operations                |
| Custom finance object | Budget line, allocation, or restricted fund support detail              | Restricted fund or grant allocation logic       | Migrate if it affects current financial controls              |
| Notes and tasks       | Institutional memory, cultivation, follow-up work                       | Activity log or notes                           | Migrate current and high-value history                        |
| Workflow / Flow       | Approval, reminder, assignment, or status update automation             | Rebuild as GrantPipe workflow or process change | Rebuild selectively, not automatically                        |
| Report folders        | Operational reporting packages and board outputs                        | Saved reports or export templates               | Recreate only the reports staff actually use                  |

The most important principle is this: move the data that supports current work, not every historical artifact that happens to exist. A nonprofit that migrates everything often ends up paying to carry its clutter forward.

If your Salesforce org uses custom objects to represent grants, restricted funds, or compliance checkpoints, define the business meaning of each object before deciding how it maps. A field named `Status` can mean five different things depending on context. The same is true for `Stage`, `Type`, and `Category`. Do not map labels before you map intent.

## Decide What Migrates, What Rebuilds, and What Gets Left Behind

This is the section that saves time and money. Every item in the current org should fall into one of three buckets.

**Migrate**

- Active donor and household records
- Active grants and grant history that affect current reporting
- Open pledges, recurring gifts, and any unpaid commitments
- Current restricted fund balances and allocation logic
- Recent notes, tasks, and activities tied to live relationships
- Reports that staff and leadership use on a weekly or monthly cadence

**Rebuild**

- Reports that depend on old custom objects or brittle joins
- Flows that only exist to patch over a bad process
- Approval chains that should be simplified instead of recreated
- Duplicate logic that can be replaced with a clearer data model
- Dashboard layouts that were built for the old org structure, not for the work you do now

**Leave behind**

- Test records
- Deprecated fields with no current use
- Obsolete campaigns and stale list hygiene artifacts
- Automation that no one can explain
- Historical noise that does not support audit, donor stewardship, or compliance reporting

If you are moving off Salesforce entirely, this bucketed approach still helps. It tells you whether the data model in the target system can support the workflows that matter without a consultant layer in between. If the answer is no, the map tells you that before the contract is signed.

## Use the Map to Evaluate the Decision, Not Just the Migration

A migration map is also a decision tool. Once the inventory is complete, score each area by effort and risk.

Ask these questions:

- Can this item be migrated with a direct export and import, or does it require manual transformation?
- Does the item depend on a custom object or automation that only exists in Salesforce?
- Will staff lose critical functionality if the item is not recreated exactly?
- Is the item essential to donor stewardship, grant compliance, restricted fund tracking, or board reporting?
- Is the item there because the business needed it, or because the org had no better place to put it?

When the answers point toward high transformation effort and low operational value, the rational move is often to stop treating the Salesforce transition as an upgrade path. At that point, you are comparing the cost of rebuilding a complex org against the cost of adopting a simpler platform that already matches how your team works.

That is where a purpose-built nonprofit system can win. If your daily workflow is mostly donor management, grant tracking, restricted funds, and compliance reporting, you may not need a generalized CRM with nonprofit add-ons. You may need a system that was built around those workflows from the start.

## A Practical Migration Checklist

Before any vendor starts work, make sure you can answer these questions in writing:

1. Which Salesforce objects are in scope?
2. Which custom fields are required for live operations?
3. Which reports must be reproduced exactly?
4. Which automations can be simplified instead of rebuilt?
5. Which records should be archived instead of migrated?
6. What is the acceptance test for donor data, grant data, and restricted fund data?
7. Who signs off when the target system matches the business requirements?

If the answer to any of those questions is "we will figure it out during implementation," the migration is not ready. A good map turns uncertainty into scope. A bad map becomes a bill.

## Final Read

For a nonprofit running on Salesforce NPSP, the transition window is a chance to make a better decision, not just a harder one. If your org has a relatively simple Salesforce setup, the map may confirm that a migration is worth the effort. If your org has years of customization, consultant-built automation, and reporting stitched together from multiple systems, the map may show that the cleanest path is to move to a simpler platform instead of rebuilding the same complexity somewhere else.

Either outcome is useful. The purpose of this document is to make the tradeoff visible before you commit time, staff attention, and consulting dollars to a direction you have not fully examined.
