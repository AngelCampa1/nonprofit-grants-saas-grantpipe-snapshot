---
title: Custom Fields in GrantPipe
description: "Add typed custom fields to donors, grants, and gifts without touching the core schema. Per-org definitions, required flags, and full inclusion in filters and reports."
seoTitle: "Custom Fields for Nonprofit CRM: Donors, Grants, Gifts"
seoDescription: "Add unlimited custom fields to donors, grants, and gifts. Per-org definitions, typed values, and reporting without re-architecting your data."
publishedAt: "2026-04-25"
updatedAt: "2026-04-25"
lastReviewedAt: "2026-04-25"
buyerStage: bofu
schema: SoftwareApplication
topicCluster: nonprofit-crm
contentIntent: category
primaryCta: trial
ctaMode: convert
refreshCadenceMonths: 12
targetPersona:
  - executive-director
  - development-director
  - finance-operations-staff
tags:
  - feature
  - nonprofit-crm
  - data-model
  - customization
targetKeyword: nonprofit crm custom fields
bluf: "Custom fields extend GrantPipe's data model without replacing it. Define typed fields for donors, grants, and gifts - text, number, date, select, or boolean - and they appear in filters, exports, and reports alongside the standard fields. The data stays structured, not buried in a notes column."
faqs:
  - q: What entity types support custom fields?
    a: "Donors (contacts), grants, and gift records. Custom fields are defined per entity type and are available org-wide."
  - q: What field types are available?
    a: "Text (single line), text area (multi-line), number, currency, date, single select (dropdown), multi-select (checkboxes), and boolean (yes/no). Each type validates on entry."
  - q: Are custom fields available in filters and reports?
    a: Yes. Custom fields appear in the filter builder alongside standard fields. They can also be included as columns in exported CSVs and in saved donor or grant segments.
  - q: Can I mark a custom field as required?
    a: Yes. Required custom fields appear in the create and edit forms for that entity type. A record cannot be saved without a value in a required field.
  - q: Can I reorder custom fields?
    a: Yes. The field order in the admin configuration determines the display order in record views and forms. Drag-and-drop reordering is available in the configuration panel.
  - q: What happens to data if I delete a custom field?
    a: Deleting a custom field removes the field definition and all stored values for that field across all records. This action is irreversible and requires admin confirmation. Archiving a field (rather than deleting) hides it from forms and filters while preserving the data.
relatedPages:
  - /features/donor-segmentation
  - /features/csv-donor-import
  - /resources/guides/nonprofit-crm-features
  - /features/role-based-permissions
  - /product
  - /pricing
  - /features/donor-retention-reporting
proscons:
  - subject: GrantPipe custom fields
    pros:
      - Typed fields prevent the freeform notes problem - data is structured and filterable
      - "Custom fields appear in filters, segments, and exports without extra configuration"
      - Required-field enforcement ensures completeness for fields that matter to your workflow
      - Archive option preserves data while removing the field from active forms
      - Applies uniformly across all staff - no per-user field configuration needed
    cons:
      - Custom fields are org-wide; there is no way to make a field visible to only certain roles
      - Deleting a field deletes all stored values - archive instead if you might want the data later
      - Field labels are plain text; formatted help text within a field is not currently supported
answers:
  - q: When should I use a custom field vs a note or tag?
    a: "Use a custom field when the information needs to be filtered, reported on, or exported as a column. Use a note when the information is unstructured narrative. Use a tag when the value is categorical and shared across many records. The rule: if you will ever need to find or count records by this value, it belongs in a typed custom field."
  - q: Can custom fields be populated via CSV import?
    a: "Yes. During a CSV import, custom fields appear in the field mapper alongside standard fields. Map a CSV column to a custom field and the values import as typed data. Custom fields must be defined before the import runs."
  - q: How are custom fields handled in the audit trail?
    a: "Changes to custom field values are logged in the activity log alongside changes to standard fields. Each entry records the old value, the new value, the timestamp, and the user who made the change."
pricingStats:
  - stat: 69% of nonprofits report that their donor data includes information they cannot filter or report on because it is stored in notes or unstructured fields
    source: NTEN Nonprofit Technology Survey 2024
    sourceUrl: "https://www.nten.org/research"
  - stat: Mid-sized nonprofits average 12 data fields per donor record beyond the standard CRM schema according to a 2023 Bloomerang product benchmarking study
    source: Bloomerang Nonprofit CRM Benchmarks 2023
    sourceUrl: "https://bloomerang.co/resources"
  - stat: Nonprofits with $500K-$10M budgets spend an average of 3.5% of operating budget on software
    source: Nonprofit Tech for Good 2024 Technology Report
    sourceUrl: "https://www.nptechforgood.com/research-reports/"
tableData:
  name: Custom field types and use cases
  description: "Available field types in GrantPipe custom fields, with example use cases for each."
  columns:
    - Field type
    - Validation
    - Example use case
  rows:
    - - Text (single line)
      - "Max length: 500 characters"
      - "Preferred salutation, pronouns, relationship manager name"
    - - Text area (multi-line)
      - "Max length: 5,000 characters"
      - "Site visit notes, relationship history summary"
    - - Number
      - Numeric values only
      - "Cultivation score, constituent ID from legacy system"
    - - Currency
      - "Numeric, stored as cents"
      - "Ask amount, estimated capacity"
    - - Date
      - ISO 8601 or US format
      - "Board term expiration, last site visit date"
    - - Single select
      - Must match defined options
      - "Portfolio tier (major, mid-level, annual), funding priority"
    - - Multi-select
      - One or more defined options
      - "Interest areas, program affiliations"
    - - Boolean
      - Yes / No
      - "Opted into newsletter, matched gift eligible"
sourceUrls:
  - "https://www.nten.org/research"
  - "https://www.nptechforgood.com/research-reports/"
  - "https://bloomerang.co/resources"
  - "https://www.grants.gov/learn-grants"
---

## The problem

Every nonprofit has a few fields that matter locally, but uncontrolled custom fields become a second database inside the CRM. Staff need flexibility without losing reporting discipline or making future cleanup harder.

## How GrantPipe solves it

GrantPipe keeps custom fields structured by organization and record type. Teams can capture local details while keeping reporting, permissions, and future exports predictable.

For bounded rollout path questions, this page explains how GrantPipe lets a team capture local details without turning implementation into a custom database project. The setup stays close to shipped record types, with typed fields that can be reviewed and governed later.

Custom fields extend the GrantPipe data model without overwriting it. When the standard schema does not capture everything your organization tracks about donors, grants, or gifts, custom fields add the missing structure - typed, filterable, and reportable from day one.

## TL;DR

- Eight field types: text, text area, number, currency, date, single select, multi-select, boolean
- Available on donors, grants, and gift records
- Appear in filters, segments, and CSV exports without additional setup
- Required-field enforcement at the form level
- Archive to hide without deleting; delete to remove permanently

## What this feature does

The standard donor record covers the fields nearly every nonprofit needs: name, contact information, giving history, source, and relationship manager. Custom fields cover everything else your specific organization tracks - cultivation scores, board relationships, interest areas, ask amounts, legacy system IDs, capacity ratings, constituent tiers.

The critical design choice: custom fields are typed. A number field accepts numbers. A date field accepts dates. A single-select field only accepts values from the defined option list. This means the data you put in is the data you can filter on, export, and count - not freeform text that requires manual parsing to be useful.

Custom fields appear automatically in the filter builder for the entity type they are defined on. A custom "Portfolio Tier" field on donors appears as a filter option in the donor list, in segment definitions, and in the export column selector. No additional configuration required.

## Who it's for

Development directors who need fields their current CRM does not have, without paying for a customization project. Finance staff who want to track grant-specific metadata - cognizant agency, indirect rate agreement date, program officer contact - alongside the standard grant record. Operations teams migrating from a legacy system that had custom fields they do not want to lose.

## Workflow example

1. Navigate to Settings > Custom Fields > Donors (or Grants, or Gifts)
2. Click "Add field," choose the field type, enter the label and optional help text
3. Mark the field required if it should be enforced on create/edit
4. Set display order by dragging the field to the desired position
5. The field appears immediately on all donor create/edit forms and in the filter builder
6. Existing records show the field as empty until populated

## What custom fields are not for

Custom fields extend structured data. They are not a replacement for the notes field (unstructured narrative that does not need to be filtered), tags (categorical labels you want to apply across records quickly), or documents (attachments stored against a record).

If you find yourself creating a custom text area field and then never filtering on it, it probably belongs in notes. If you find yourself creating fifteen single-select fields with overlapping option lists, the data model design needs review before adding more fields.

## Integration with the rest of GrantPipe

Custom field values move with records. If a donor record is merged with a duplicate, the custom field values from both records appear in the merge-review step so you choose which value to keep. If a record is exported as part of a segment, custom fields are included as columns in the export. If a record appears in an audit trail entry, custom field changes are logged alongside standard field changes.

## What it replaces

- Notes columns used as a catch-all for structured data that should have been typed fields
- Separate tracking spreadsheets maintained alongside the CRM to capture information the CRM schema could not hold
- The consultant engagement some platforms require to add fields outside the standard schema
- Manual tagging systems that were created as workarounds for missing field types

## Start a free trial

[Start a trial](/pricing).

## Related feature pages

- [donor retention reporting](/features/donor-retention-reporting)
- [donor segmentation](/features/donor-segmentation)
- [Product overview](/product)
- [Pricing and plan fit](/pricing)
