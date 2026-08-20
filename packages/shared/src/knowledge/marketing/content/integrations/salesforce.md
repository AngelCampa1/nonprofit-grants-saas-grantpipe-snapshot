---
title: "GrantPipe + Salesforce Integration"
description: "Migrate or sync from Salesforce NPSP into GrantPipe. Map contacts, accounts, opportunities, and soft credits with full audit trail."
seoTitle: "Salesforce Integration for Nonprofit CRM Migration"
seoDescription: "Migrate from Salesforce NPSP to GrantPipe or run a phased sync. Full contact, opportunity, and soft-credit mapping - no consultant required."
publishedAt: "2026-04-25"
updatedAt: "2026-04-25"
lastReviewedAt: "2026-04-25"
buyerStage: "bofu"
schema: "SoftwareApplication"
topicCluster: "donor-operations"
contentIntent: "category"
primaryCta: "trial"
ctaMode: "convert"
refreshCadenceMonths: 12
targetKeyword: "salesforce nonprofit data sync"
targetPersona:
  - "finance-operations-staff"
  - "executive-director"
tags:
  - "integration"
  - "migration"
  - "salesforce"
  - "npsp"
bluf: "Most Salesforce-to-GrantPipe migrations finish in under 60 days without consultants. The integration provides a phased migration path - map NPSP contacts to GrantPipe donors, opportunities to gifts and pledges, and soft credits to GrantPipe's soft-credit model - with a parallel-run period so neither system is abandoned cold."
faqs:
  - q: "Does GrantPipe support a live sync with Salesforce or only migration?"
    a: "Both. The integration supports a phased migration mode (Salesforce as source, GrantPipe as destination, one-time or scheduled sync until cutover) and a post-migration state where Salesforce is no longer used. A permanent live two-way sync is not a design goal - both systems would then be authoritative, which creates reconciliation problems."
  - q: "How does GrantPipe map NPSP objects to its own data model?"
    a: "NPSP Contact †’ GrantPipe Donor. NPSP Account (household) †’ GrantPipe household record. NPSP Opportunity with RecordType=Donation †’ GrantPipe Donation. NPSP Opportunity with RecordType=Grant †’ GrantPipe Grant. NPSP Soft Credit †’ GrantPipe Soft Credit. Custom field mappings are configured in the migration wizard."
  - q: "Does GrantPipe authenticate to Salesforce via OAuth?"
    a: "Yes. GrantPipe connects to Salesforce via OAuth 2.0 using a Connected App you create in your Salesforce org. The Connected App grants GrantPipe access to the NPSP objects it needs to read. No Salesforce password is stored."
  - q: "How long does a typical migration take?"
    a: "For an organization with 5,000-20,000 donor records and 5-15 years of donation history, the migration phase takes 2-4 weeks including deduplication review, custom field mapping, and a parallel-run verification period. Larger histories take proportionally longer."
  - q: "What about Salesforce custom objects?"
    a: "Custom Salesforce objects that do not map to a GrantPipe standard object can be exported as CSV and imported via GrantPipe's custom field and CSV import tools. The migration wizard surfaces custom objects in your NPSP org and guides you through mapping decisions."
  - q: "Will GrantPipe help with the Salesforce cutover?"
    a: "GrantPipe's onboarding team provides migration documentation and supports a parallel-run period where both systems are active. The cutover decision - when to stop using Salesforce - is made by your organization based on the parallel-run validation results."
relatedPages:
  - "/resources/guides/how-to-migrate-from-salesforce-npsp"
  - "/compare/alternatives/salesforce-nonprofit"
  - "/resources/guides/npsp-to-agentforce-migration-cost"
  - "/features/csv-donor-import"
  - "/features/audit-trail-activity-log"
sourceUrls:
  - "https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/intro_what_is_rest_api.htm"
  - "https://developer.salesforce.com/docs/atlas.en-us.sfFieldRef.meta/sfFieldRef/salesforce_field_reference.htm"
  - "https://developer.salesforce.com/docs/atlas.en-us.packagingGuide.meta/packagingGuide/connected_app_create.htm"
  - "https://www.salesforce.org/nonprofit/"
statistics:
  - stat: "Salesforce for Nonprofits (NPSP) is used by more than 50,000 nonprofit organizations worldwide, making it the largest installed base of any nonprofit CRM"
    source: "Salesforce.org Nonprofit Overview"
    sourceUrl: "https://www.salesforce.org/nonprofit/"
  - stat: "The average Salesforce NPSP implementation for a mid-sized nonprofit costs $25,000-$75,000 in consulting fees according to nonprofit technology benchmarks"
    source: "Idealware - A Consumers Guide to Nonprofit CRM"
    sourceUrl: "https://www.idealware.org/"
  - stat: "Salesforce announced Agentforce AI integration with NPSP in 2025, with migration paths from classic NPSP to Agentforce-compatible configurations projected to require consultant assistance for most organizations"
    source: "Salesforce Agentforce for Nonprofits Announcement"
    sourceUrl: "https://www.salesforce.org/blog/"
partner:
  name: "Salesforce"
  slug: "salesforce"
  url: "https://www.salesforce.org"
category: "other"
setupSteps:
  - title: "Create a Salesforce Connected App"
    content: "In your Salesforce org, navigate to Setup †’ App Manager †’ New Connected App. Configure OAuth settings with the GrantPipe callback URL and grant access to the API and NPSP package objects. Save the consumer key and secret."
  - title: "Connect Salesforce in GrantPipe"
    content: "In GrantPipe, go to Settings †’ Integrations †’ Salesforce and click Connect. Authorize via the Salesforce OAuth screen using your admin credentials. GrantPipe validates access to the NPSP objects it needs."
  - title: "Run the object discovery scan"
    content: "GrantPipe scans your Salesforce org for NPSP Contact, Account, Opportunity, and Soft Credit records, plus any custom objects. The scan report shows record counts and custom fields that need mapping decisions."
  - title: "Configure field mappings"
    content: "Map NPSP standard fields to GrantPipe fields using the migration wizard. For custom fields, either map to a GrantPipe custom field or note them as out-of-scope for the migration."
  - title: "Run a pilot migration"
    content: "Migrate a sample set (for example, 500 donors with full giving history) to a GrantPipe sandbox environment. Review the pilot output for deduplication quality, field accuracy, and data completeness."
  - title: "Resolve deduplication and mapping issues"
    content: "Address any duplicate contacts or mapping errors surfaced in the pilot. Adjust field mappings and deduplication rules before running the full migration."
  - title: "Run the full migration and parallel period"
    content: "Migrate the full dataset. Run a parallel period of 2-4 weeks where both systems are active. Compare report outputs between Salesforce and GrantPipe. When satisfied, set the cutover date and decommission Salesforce."
supportedFeatures:
  - "OAuth 2.0 Connected App authentication"
  - "NPSP Contact †’ GrantPipe Donor mapping"
  - "NPSP Household Account †’ GrantPipe household record"
  - "NPSP Opportunity (Donation) †’ GrantPipe Donation"
  - "NPSP Opportunity (Grant) †’ GrantPipe Grant"
  - "NPSP Soft Credit †’ GrantPipe Soft Credit"
  - "Custom field mapping via migration wizard"
  - "Pilot migration to sandbox environment"
  - "Parallel-run period with both systems active"
  - "Full cutover documentation and timeline"
useCases:
  - "Migrate off Salesforce NPSP without a consultant engagement"
  - "Validate GrantPipe data accuracy during a parallel-run period before committing to cutover"
  - "Preserve 10+ years of donor giving history through a migration"
  - "Map Salesforce soft credits to GrantPipe's soft-credit model for accurate major-donor attribution"
  - "Consolidate NPSP grant records and donation records into GrantPipe's unified grant-donor model"
tableData:
  name: "NPSP to GrantPipe object mapping"
  description: "Salesforce NPSP objects and their GrantPipe equivalents"
  columns: ["NPSP Object", "GrantPipe Object", "Notes"]
  rows:
    - ["Contact", "Donor", "Email is the primary deduplication key"]
    - ["Account (Household)", "Household record", "Household giving rollup preserved"]
    - ["Opportunity (Donation)", "Donation", "Close Date †’ Gift Date; Amount †’ Donation Amount"]
    - ["Opportunity (Grant)", "Grant", "Grant tracking fields mapped to GrantPipe grant model"]
    - ["Soft Credit", "Soft Credit", "Primary/soft credit relationship preserved"]
    - [
        "Campaign Member",
        "Campaign attribution tag",
        "Campaign source preserved on donation record",
      ]
    - ["Custom Object", "CSV import or custom field", "Evaluated case by case in migration wizard"]
proscons:
  - subject: "Salesforce migration integration"
    pros:
      - "No consultant required for standard NPSP migrations - wizard handles the common object mappings"
      - "Parallel-run period lets you validate GrantPipe data against Salesforce before committing"
      - "Soft-credit model maps cleanly between NPSP and GrantPipe"
    cons:
      - "Custom Salesforce objects and heavily customized NPSP orgs require more mapping decisions and extend the migration timeline"
      - "Salesforce custom reports and dashboards do not migrate - GrantPipe equivalents must be rebuilt"
      - "Agentforce-integrated NPSP orgs may have additional object dependencies to untangle"
answers:
  - question: "What if we have heavily customized Salesforce workflows and process builders?"
    answer: "Salesforce workflow automations do not migrate to GrantPipe. During the migration wizard, you document which Salesforce automations are in place and map each to a GrantPipe equivalent or determine it is no longer needed. Most mid-sized nonprofits find GrantPipe's native workflows replace 80-90% of what they built in Salesforce Flow."
  - question: "Do we have to migrate everything at once?"
    answer: "No. You can migrate donors and giving history first, then grant records in a second pass, then historical data. The migration wizard supports staged migration with configurable record type filtering."
  - question: "What happens to data that does not map to a GrantPipe field?"
    answer: "Unmapped data can be exported as a CSV archive from Salesforce and stored separately for record-keeping. GrantPipe's custom fields accommodate most common nonprofit data shapes. Data that genuinely does not fit GrantPipe's model is documented in the migration report."
pricingStats:
  - stat: "Salesforce NPSP (now Nonprofit Success Pack) is available free for up to 10 users for qualifying nonprofits through the Power of Us program; beyond 10 users, Salesforce Enterprise pricing applies at $150-$300 per user per month"
    source: "Salesforce Power of Us Program"
    sourceUrl: "https://www.salesforce.org/power-of-us/"
  - stat: "Nonprofit organizations leaving Salesforce report average consulting savings of $30,000-$60,000 in the first year after migration to purpose-built nonprofit CRM tools"
    source: "TechSoup Nonprofit Software Market Survey, 2024"
    sourceUrl: "https://www.techsoup.org/"
---

Salesforce NPSP is the most widely deployed nonprofit CRM in the world - and the most commonly outgrown. Mid-sized nonprofits that implemented it five or ten years ago often find themselves maintaining a system that requires a consultant to change a picklist value, where grant compliance lives in a spreadsheet because NPSP was never designed for it, and where the annual Salesforce bill has become the largest line item in the operations budget.

GrantPipe's Salesforce integration provides a structured migration path. The wizard maps the core NPSP objects - contacts, opportunities, soft credits - to GrantPipe equivalents, runs a pilot migration for validation, and supports a parallel-run period so the cutover is not a leap of faith.

## What the integration does

GrantPipe authenticates to Salesforce via OAuth 2.0 using a Connected App. The migration wizard scans your org for NPSP objects and custom fields, displays record counts, and guides you through field mapping decisions. Standard NPSP mappings (Contact †’ Donor, Opportunity/Donation †’ Donation, Opportunity/Grant †’ Grant, Soft Credit †’ Soft Credit) are pre-configured. Custom fields require one-time mapping setup.

A pilot migration to a GrantPipe sandbox environment lets you validate the mapping quality before running the full migration. The full migration can be staged - donors first, grants second, historical data third - or run in a single pass. A parallel period where both systems are active allows you to compare report outputs and confirm data integrity before committing to cutover.

## Roadmap status

The Salesforce migration integration is **on the GrantPipe roadmap**. Given Salesforce NPSP's installed base, this is the highest-priority migration integration. The migration wizard is designed to cover standard NPSP configurations. Heavily customized orgs or Agentforce-integrated setups may need extra scoping before migration begins. If you are evaluating GrantPipe and moving off Salesforce, contact the team to discuss timeline.

## Data flows

Migration mode:

- **Salesforce NPSP †’ GrantPipe** (one-directional, batch migration)
- **Parallel period:** both systems active, manual comparison

Post-migration:

- Salesforce is decommissioned; GrantPipe is the system of record

## Setup steps

1. Create a Salesforce Connected App with the required OAuth scopes
2. Connect Salesforce in GrantPipe Settings †’ Integrations †’ Salesforce
3. Run the object discovery scan and review the migration report
4. Configure field mappings in the migration wizard
5. Run a pilot migration to a GrantPipe sandbox
6. Review and resolve mapping issues from the pilot
7. Run the full migration, conduct the parallel period, and cut over

## Common use cases

A nonprofit that implemented NPSP with a consulting firm in 2016 is spending $40,000 per year on Salesforce licenses plus another $15,000 annually on a managed services contract to keep it running. The migration to GrantPipe takes six weeks using the migration wizard, with a two-week parallel period for validation. No consultant is engaged.

An organization switching from Salesforce to GrantPipe has 12 years of donation history and 22,000 donor records. The pilot migration shows a 97% auto-match rate on deduplication. The remaining 3% - about 660 records - are reviewed manually before the full migration runs.

## Limitations and gotchas

Custom Salesforce objects that have no GrantPipe equivalent require manual decisions: either map data to GrantPipe custom fields, archive as CSV, or accept the data will not migrate. The migration wizard surfaces all custom objects and their record counts before migration begins.

Salesforce custom reports, dashboards, and email templates do not migrate. GrantPipe's reporting layer must be rebuilt separately. Most mid-sized nonprofits find this less time-consuming than expected because GrantPipe's standard reports cover most common use cases.

Very old NPSP data (pre-2015) may use deprecated field schemas. The migration wizard tests compatibility against current NPSP field references and flags any deprecated fields before migration begins.

## Pricing implications

Leaving Salesforce typically saves $150-$300 per user per month in licensing beyond the free 10-seat Power of Us tier. Organizations with 15-25 Salesforce users commonly recover $30,000-$60,000 annually in licensing and managed services costs after migration. GrantPipe's pricing is flat per organization, not per user.

## Start a free trial

[Start a trial](/signup).
