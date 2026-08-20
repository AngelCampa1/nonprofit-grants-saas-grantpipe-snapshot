---
title: "How to Migrate from Salesforce NPSP: What the Nonprofit Cloud Transition Actually Costs"
description: "Salesforce is sunsetting NPSP in favor of Nonprofit Cloud. For mid-sized nonprofits, the migration cost ($15K-$50K+) is an opportunity to evaluate whether"
seoTitle: "How to Migrate from Salesforce NPSP"
seoDescription: "How to migrate from Salesforce NPSP to Nonprofit Cloud: what the transition actually costs, what data moves, and why many nonprofits choose a different."
targetKeyword: "how to migrate from salesforce npsp"
publishedAt: "2026-03-21"
updatedAt: "2026-05-08"
lastReviewedAt: "2026-05-08"
verifiedAt: "2026-05-08"
buyerStage: "tofu"
targetPersona:
  - "executive-director"
  - "development-director"
  - "finance-operations-staff"
schema: "Article"
bluf: "Salesforce is sunsetting the Nonprofit Success Pack (NPSP) in favor of Nonprofit Cloud, requiring existing NPSP users to migrate. For mid-sized nonprofits that implemented NPSP primarily for donor management and grant tracking, the migration is an opportunity to evaluate whether a purpose-built nonprofit platform is a better fit than a reconfigured Salesforce instance."
faqs:
  - q: "Is Salesforce NPSP being discontinued?"
    a: "NPSP stopped receiving new features in March 2023, replaced by Nonprofit Cloud, which was rebranded to 'Agentforce Nonprofit' in 2026. NPSP is not being immediately shut off, but it is on maintenance-only status. Existing NPSP customers must plan a migration to the new architecture to remain on a supported, actively developed product - and that migration is a full re-implementation, not an upgrade."
  - q: "How much does it cost to migrate from Salesforce NPSP to Nonprofit Cloud?"
    a: "Estimates from Salesforce implementation partners range from $15,000 to $50,000+ for a mid-sized nonprofit. The cost depends on data complexity, custom configurations, integration requirements, and the implementation partner's rates. Organizations with heavy customization built on NPSP's data model may face the higher end of that range or beyond."
  - q: "What are the alternatives to Salesforce NPSP for nonprofits?"
    a: "Alternatives include Bloomerang (strong donor management but no grant compliance), DonorPerfect (established CRM with limited grant tracking), and GrantPipe published self-serve pricing, purpose-built for combined donor management and grant compliance). Each is a fraction of Salesforce's total cost of ownership for mid-sized organizations."
relatedPages:
  - "/resources/guides/salesforce-npsp-guide"
  - "/compare/alternatives/salesforce-nonprofit"
  - "/compare/pricing/salesforce-nonprofit"
  - "/resources/best/best-nonprofit-crm-small-organizations"
  - "/resources/guides/npsp-to-agentforce-migration-cost"
pricingStats:
  - stat: "The NPSP-to-Nonprofit Cloud migration is not an upgrade - it's a full re-implementation on an entirely different architecture, estimated at $7,000-$50,000+"
    source: "Salesforce nonprofit migration cost analysis (2025-2026)"
  - stat: "Only about 25% of Salesforce consultants have completed Nonprofit Cloud implementations so far"
    source: "NonProfit PRO Salesforce consultant survey (2025)"
definitions:
  - term: "NPSP"
    definition: "The Nonprofit Success Pack, Salesforce's legacy nonprofit data model and feature layer. It still runs for existing customers, but Salesforce stopped shipping new features to it in 2023."
  - term: "Nonprofit Cloud"
    definition: "Salesforce's newer nonprofit product architecture, rebranded in 2026 as Agentforce Nonprofit. Moving from NPSP to this platform requires a rebuild, not a simple version upgrade."
  - term: "Data model migration"
    definition: "The work of remapping donor, gift, household, and custom-object data from one platform structure into another. In Salesforce's case, this is one of the main reasons migration costs rise."
  - term: "Re-implementation"
    definition: "A new system build that recreates reports, automations, permissions, and workflows from scratch. That is the practical shape of most NPSP-to-Nonprofit Cloud projects."
tags:
  - "guide"
  - "salesforce npsp"
  - "nonprofit crm"
  - "migration"
answers:
  - question: "Is Salesforce NPSP being discontinued?"
    answer: "NPSP stopped receiving new features in March 2023, replaced by Nonprofit Cloud, which was rebranded to 'Agentforce Nonprofit' in 2026. NPSP continues to function on maintenance-only status but is not receiving new feature development. Organizations on NPSP need to plan a migration to the new architecture or evaluate alternative platforms before their current NPSP configuration becomes a liability."
  - question: "How much does it cost to migrate from Salesforce NPSP to Nonprofit Cloud?"
    answer: "Mid-sized nonprofit NPSP-to-Nonprofit Cloud migrations typically run $15,000-$50,000 in implementation partner fees, depending on data complexity and customization scope. Add ongoing admin costs, user licenses at $36-$65/user/month, and future customization needs, and the total first-year cost often exceeds $60,000 for a 10-person development team."
  - question: "What are the alternatives to Salesforce NPSP for nonprofits?"
    answer: "Purpose-built nonprofit platforms including Bloomerang, DonorPerfect, and GrantPipe are the primary alternatives. All offer month-to-month pricing, no implementation fees, and deploy in days rather than months. For organizations that use Salesforce primarily for donor management and grant tracking rather than advanced CRM workflows, the switch typically reduces cost by 80-90%."
---

Salesforce's announcement of the NPSP-to-Nonprofit Cloud transition landed differently depending on the size of your organization. For large nonprofits with dedicated Salesforce admins, it was a roadmap update to plan around. For mid-sized organizations that implemented NPSP with a consultant years ago and have been maintaining it with minimal ongoing support since, it was an unwelcome cost they had not budgeted for.

If you are in the second group, the migration question is actually a broader one: should you migrate to Nonprofit Cloud at all, or is this the right moment to evaluate whether Salesforce is the right platform?

## What the NPSP to Nonprofit Cloud Transition Actually Means

NPSP stopped receiving new features in March 2023, replaced by Nonprofit Cloud, which was rebranded to "Agentforce Nonprofit" in 2026. Salesforce built NPSP on top of the standard Salesforce CRM data model, with nonprofit-specific objects and components layered on. Nonprofit Cloud is a rebuilt, native nonprofit platform with a different data architecture. The two are not directly compatible.

Migrating from NPSP to Nonprofit Cloud requires:

- Auditing your current NPSP configuration to identify what customizations exist and which will break in the new data model
- Exporting your data (contacts, accounts, donation records, campaign history, custom objects)
- Remapping the data to Nonprofit Cloud's data model
- Rebuilding custom reports, flows, and automation
- Retraining staff on the new interface and data structure
- Completing user acceptance testing before go-live

This is not an upgrade. It is a re-implementation that requires significant consultant involvement. Salesforce has partner resources and migration tools, but they do not reduce the project to something your team can self-service.

## The Real Cost Estimate

Salesforce implementation partners quote NPSP-to-Nonprofit Cloud migrations in the $15,000-$50,000 range for mid-sized nonprofits. The variables that push toward the higher end:

- Custom objects and fields built over years of NPSP use
- Integrations with other systems (accounting, email, event management)
- Complex donation and campaign history that does not map cleanly to the new data model
- Consultants who charge by the hour rather than fixed-price engagements

Add ongoing costs after the migration:

- Salesforce Nonprofit licenses: $36/user/month (Sales Cloud for Nonprofits) to $65/user/month (Nonprofit Cloud), discounted through TechSoup for up to 10 licenses
- A dedicated Salesforce admin or ongoing consultant retainer for customization and maintenance
- Future feature additions will require consultant time

For a mid-sized nonprofit with a 10-person development and operations team, realistic first-year total cost of ownership after migration often lands above $60,000.

## The Case for Evaluating Alternatives During Migration

The moment a migration project is on the table is the best moment to evaluate alternatives. Before you commit $30,000-$50,000 to a migration project, it is worth 48 hours of research on what you would be giving up by switching platforms.

The honest question is: what does your organization actually use Salesforce for?

Most mid-sized nonprofits that implemented NPSP use it for: tracking donor relationships, recording gifts and pledges, managing grant records and compliance deadlines, generating fundraising reports, and segmenting contact lists for appeals. These are core capabilities that every purpose-built nonprofit CRM handles.

Very few mid-sized nonprofits with budgets under $5 million use NPSP for advanced capabilities that justify the Salesforce price point: complex workflow automation across multiple departments, deep integration with other enterprise systems, multi-entity consolidation, or Salesforce-native analytics at scale.

## What to Look For in an Alternative

The features worth evaluating when comparing to Salesforce:

**Unified donor and grant management.** Many nonprofit CRMs handle donor relationships but require a separate tool or manual spreadsheets for grant tracking. If grant compliance is part of your workflow, a platform that handles both eliminates the integration overhead.

**Self-serve configuration.** Can staff make the changes they need without a consultant? Can you add a custom field, update a report, or modify a workflow in-house? This is the defining difference between purpose-built nonprofit platforms and Salesforce.

**Transparent pricing.** Flat monthly pricing without per-seat fees at scale, without implementation fees, without multi-year contracts. This is standard for modern SaaS nonprofit platforms.

**Migration support.** Most alternatives offer data import tools that handle Salesforce exports directly. The practical migration from NPSP to a purpose-built platform is typically simpler than NPSP to Nonprofit Cloud because you are moving from a complex, heavily customized system to a clean purpose-built schema.

## Making the Decision

The decision framework is straightforward: if your Salesforce implementation is primarily serving as a donor database and grant tracker for a nonprofit with a budget under $5 million, the migration cost to Nonprofit Cloud is hard to justify when purpose-built alternatives are available at a fraction of the price.

The organizations that should migrate to Nonprofit Cloud are those with: significant Salesforce customization that has become core to operations, large IT teams capable of managing the platform, and budgets that absorb $50,000+ implementation projects without disrupting program work.

For everyone else, the migration announcement is an exit ramp, not an obligation. Use it.
