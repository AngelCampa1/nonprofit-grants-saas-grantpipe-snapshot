---
title: "CRM Migration Data Map Template"
description: "A data mapping table for CRM migrations: source field -> target field, data type, required/optional, transformation needed, validation rule, and sample values - organized by record type with pre-migration audit and post-migration validation instructions."
seoTitle: "CRM Migration Data Map Template for Nonprofits"
seoDescription: "Free CRM data migration map: source to target field mapping, transformations, validation rules, and pre- and post-migration checklists for nonprofit CRM."
targetKeyword: "crm migration data map template"
publishedAt: "2026-04-26"
updatedAt: "2026-04-26"
verifiedAt: "2026-05-24"
lastReviewedAt: "2026-05-24"
bluf: "CRM data migrations fail at the field mapping step or the data quality step - not the software step. This template provides a structured approach to mapping every data field from your current system to the target system, documenting the transformations required, and validating that the migration was complete."
sourceUrls:
  - "https://www.irs.gov/charities-non-profits/form-990-resources-and-tools"
  - "https://candid.org/"
freePreviewSections: 2
deliverableType: pdf
deliverableUrl: "/downloads/crm-migration-data-map-template.pdf"
relatedPages:
  - "/compare/"
  - "/resources/guides/how-to-choose-nonprofit-crm"
buyerStage: "bofu"
faqs:
  - q: "What is a data map in a CRM migration"
    a: "A data map shows how each field in the source system corresponds to a field in the target system. It documents what transformation (if any) is needed, whether the field is required in the target, and what validation rules apply. A complete data map prevents the most common migration failures: fields that existed in the source but have no target, data formats that don't match, and records that fail to import because required fields are blank."
  - q: "How long does a CRM migration take"
    a: "A typical nonprofit CRM migration with proper preparation takes 4-8 weeks from start to go-live. The timeline is primarily driven by data quality - how clean and complete the source data is - not by the technical migration process. Organizations that invest 2-3 weeks in pre-migration data audit save that time (and more) during the actual migration."
  - q: "What data should I migrate vs. leave behind"
    a: "Migrate: active donor records (all giving history for past 5-7 years), active grant records, active contacts, organizational affiliations, and giving pledges. Consider migrating: historical contacts with no recent activity (5+ years), closed grants (archive quality). Leave behind: duplicate records you never cleaned up, deprecated fields with no current use, test records, and data you would not use if you found it in the new system."
tags:
  - "CRM migration"
  - "data mapping"
  - "implementation"
leadMagnetSlug: "crm-migration-data-map-template"
schema: "Article"
---

## What This Template Does

The CRM migration data map provides a structured working document for planning and executing a nonprofit CRM migration. It is organized by record type (contacts/donors, grants, organizations, notes/activities, giving history) with field-level mapping tables, transformation documentation, and validation checklists.

A data map is not optional for a CRM migration. Organizations that skip it spend their time fixing migration errors after go-live rather than before. Errors found after go-live affect live operations and damage staff confidence in the new system.

---

## Pre-Migration Data Audit

Before mapping any fields, audit the source system. What you migrate is what you have - and most source systems contain years of accumulated data quality problems that will transfer directly into the new system if not addressed first.

**Audit checklist:**

**Duplicates**

- Run a duplicate report in the source system (duplicate contacts, duplicate organizations, duplicate grant records)
- Establish and apply a merge rule: when in doubt, which record is the authoritative one
- Target: zero duplicate contacts by primary identifier (email address)

**Blank required fields**

- Identify which fields the target system requires (typically: contact name, primary email or mailing address, organization affiliation for institutional contacts)
- Run a report of source records where these fields are blank
- Resolve before migration: update the record with the correct data, flag as incomplete, or determine whether the record should be migrated at all

**Outdated records**

- Identify contacts with no activity in the past [5-7] years
- Decision: migrate (may have historical giving data), archive (move to inactive), or exclude (no useful data)
- Document the decision and the criteria - this protects against complaints after migration that "all our contacts are gone"

**Inconsistent formatting**

- Phone numbers (should be a consistent format: (XXX) XXX-XXXX or XXXXXXXXXX)
- Addresses (should include zip+4 for major gift cultivation; check for obvious errors)
- Salutations (inconsistent capitalization, honorifics mixed with first names)
- Fund designations (are all active restricted funds using consistent naming across all records)

**Data that lives outside the system**

- What is in spreadsheets that needs to be in the new system
- What is in email or shared drives that should be attached to records
- What custom fields does your team use that might not have obvious mapping to the target

Budget two to three weeks for the data audit. Organizations that rush this step find the problems after go-live, when fixing them disrupts staff workflows.

---

## Record Type 1: Contacts / Donors

This is the most important record type. Every other record (gifts, grants, activities) relates back to a contact.

| Source Field         | Source Field Name | Target Field   | Target Field Name | Data Type | Required    | Transformation Needed                  | Validation Rule                  | Sample Source Value | Sample Target Value |
| -------------------- | ----------------- | -------------- | ----------------- | --------- | ----------- | -------------------------------------- | -------------------------------- | ------------------- | ------------------- |
| First name           | FirstName         | First name     | first_name        | Text      | Yes         | None                                   | Not blank                        | "Maria"            | "Maria"            |
| Last name            | LastName          | Last name      | last_name         | Text      | Yes         | None                                   | Not blank                        | "Rodriguez"         | "Rodriguez"         |
| Primary email        | Email             | Email          | email             | Email     | Recommended | Lowercase normalize                    | Valid email format               | "Maria@example.com" | "maria@example.com" |
| Primary phone        | Phone             | Phone          | phone             | Text      | No          | Strip formatting                       | 10-digit numeric after stripping | "(513) 555-1234"    | "5135551234"        |
| Mailing address      | Address1          | Address line 1 | address_line_1    | Text      | No          | None                                   | -                                | "123 Main St"       | "123 Main St"       |
| City                 | City              | City           | city              | Text      | No          | None                                   | -                                | "Cincinnati"        | "Cincinnati"        |
| State                | State             | State          | state             | Text      | No          | Standardize to 2-letter code           | 2-char state code                | "Ohio"              | "OH"                |
| Zip                  | Zip               | Zip code       | zip_code          | Text      | No          | Remove formatting                      | 5 or 9 digit                     | "45202-1234"        | "452021234"         |
| Contact type         | ContactType       | Record type    | record_type       | Enum      | Yes         | Map source values to target values     | Valid enum value                 | "Individual"        | "individual"        |
| Donor status         | Active            | Active         | is_active         | Boolean   | Yes         | Map source values                      | True/False                       | "Y"                 | true                |
| Custom: Giving level | GivingLevel       | Tags           | tags              | Array     | No          | Map source values to target tag labels | Valid tag values                 | "Major Donor"       | ["major-donor"]     |

**Notes column:** Add a notes column to flag records that need manual review. Flag: contact has a spouse or partner record that should be linked; contact was marked Do Not Contact; contact has a relationship note that should be preserved as an activity record.

---

## Record Type 2: Grants

Grant records must migrate with their complete lifecycle history - not just the current status, but the stage history, the proposal documentation reference, and the financial amounts.

| Source Field     | Source Field Name | Target Field     | Target Field Name  | Data Type       | Required    | Transformation                   | Validation               | Sample                           |
| ---------------- | ----------------- | ---------------- | ------------------ | --------------- | ----------- | -------------------------------- | ------------------------ | -------------------------------- |
| Grant name       | GrantName         | Grant name       | grant_name         | Text            | Yes         | None                             | Not blank                | "Smith Foundation Literacy 2025" |
| Funder ID        | FunderContactID   | Funder           | funder_id          | FK to Contact   | Yes         | Match to migrated contact record | Valid contact ID         | 10045                            |
| Award amount     | AwardAmount       | Award amount     | award_amount_cents | Integer (cents) | Yes         | Multiply by 100                  | > 0                      | $75,000 -> 7500000              |
| Award date       | AwardDate         | Award date       | award_date         | Date            | Yes         | Format: YYYY-MM-DD               | Valid date               | 2025-03-01                       |
| Grant start date | StartDate         | Period start     | period_start       | Date            | Yes         | Format: YYYY-MM-DD               | Valid date, <= end date | 2025-04-01                       |
| Grant end date   | EndDate           | Period end       | period_end         | Date            | Yes         | Format: YYYY-MM-DD               | Valid date, >= start    | 2026-03-31                       |
| Status           | Status            | Status           | status             | Enum            | Yes         | Map source values                | Valid enum               | "Active" -> "active"            |
| Restriction type | RestrictionType   | Restriction type | restriction_type   | Enum            | Yes         | Map source values                | Valid enum               | "Purpose" -> "purpose"          |
| Fund code        | FundCode          | Fund code        | fund_code          | Text            | Recommended | None                             | Consistent format        | "SMI-LIT-25"                     |

**What to migrate vs. what to leave:**

- Migrate: all active grants; all closed grants from the past 5 years (audit trail)
- Migrate: grant budget lines if they exist as structured data in the source
- Consider: grant application history, proposal documents (as attachments)
- Leave: declined applications older than 5 years (archive separately if needed)

---

## Record Type 3: Organizations

For grants, the funder is typically an organization contact. Organization records must maintain their relationship to individual contacts (program officers, board members).

| Source Field      | Target Field       | Notes                                                                                |
| ----------------- | ------------------ | ------------------------------------------------------------------------------------ |
| Organization name | org_name           | Standardize legal name vs. common name; note both                                    |
| Organization type | org_type           | Map: Foundation -> foundation, Government -> government, Corporation -> corporate |
| Primary address   | address fields     | Same transformation as individual contacts                                           |
| Website           | website            | Validate URL format                                                                  |
| Tax status        | tax_status         | 501(c)(3), government, etc.                                                          |
| Primary contact   | primary_contact_id | FK to contact record - must be migrated first                                        |
| Grant count       | [calculated field] | Do not migrate; recalculate from migrated grant records                              |

---

## Record Type 4: Notes and Activities

Activity records - call logs, emails, meetings, proposals, site visits - are often the most valuable institutional knowledge in a CRM. They are also the messiest data.

**What to migrate:**

- All activity records for major donors (annual giving > $5,000) going back 5-7 years
- All activity records linked to active grants
- Grant proposal submissions and funder correspondence
- Do not migrate: test records, auto-generated system activities (login events, email opens) unless specifically needed

| Source Field          | Target Field      | Notes                                                             |
| --------------------- | ----------------- | ----------------------------------------------------------------- |
| Activity type         | activity_type     | Map source types to target enum; consolidate similar types        |
| Activity date         | activity_date     | Format: YYYY-MM-DD                                                |
| Subject / description | subject + notes   | May need to split if source uses one field for both               |
| Related contact       | contact_id        | FK - must exist in migrated contacts                              |
| Related grant         | grant_id          | FK - must exist in migrated grants                                |
| Staff member          | assigned_to       | Map source user ID to target user                                 |
| Attachments           | [file references] | Attachments may require separate handling - document storage path |

---

## Record Type 5: Giving History

Giving history is the source of truth for donor retention analytics, major gift qualification, and grant award history.

| Source Field        | Target Field         | Notes                                              |
| ------------------- | -------------------- | -------------------------------------------------- |
| Donor ID            | contact_id           | FK to migrated contact                             |
| Gift amount         | amount_cents         | Multiply by 100; validate > 0                      |
| Gift date           | gift_date            | Format: YYYY-MM-DD                                 |
| Fund designation    | fund_id              | Map to migrated fund/grant record where applicable |
| Gift type           | gift_type            | Cash, pledge, in-kind, etc. - map to target enum   |
| Campaign            | campaign_id          | FK to campaign if campaigns are migrated           |
| Acknowledgment sent | acknowledged_at      | Date format or null if not applicable              |
| Soft credit         | [soft_credit fields] | Handle household and matching gift credits         |

---

## Post-Migration Validation Checklist

After migration, validate before going live:

**Record counts:**

- Total contacts migrated vs. total source records (after deduplication)
- Total grants migrated vs. total source records
- Total giving history records migrated vs. total source records

**Key relationships:**

- Random sample of 20 donors - verify giving history is complete and fund designations match
- All active grants - verify funder link, award amount, dates, and fund code are correct
- All contacts linked to active grants - verify the relationship is intact

**Financial validation:**

- Total giving history in target system = total giving history in source system for same period
- Total active grant award amounts in target = total active grant award amounts in source
- Spot check: 5 specific donors - giving history matches original records

**User acceptance testing:**

- Development staff: can find a donor, see full giving history, and see linked grants
- Finance staff: can find a grant, see budget vs. actual, and pull a funder financial report
- Executive Director: can see restricted fund dashboard

**Sign-off:** Before go-live, require written sign-off from the finance director and development director that validation is complete. This establishes that the migration was accepted - not just completed.
