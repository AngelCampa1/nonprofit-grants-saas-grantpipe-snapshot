---
title: "GrantPipe + Classy Integration"
description: "Sync Classy donations and peer-to-peer campaigns into GrantPipe with donor de-duplication."
seoTitle: "Classy Integration for Nonprofit CRM + GrantPipe"
seoDescription: "Pull Classy campaign donations into GrantPipe. Sync peer-to-peer fundraising totals. Includes practical checks and reporting."
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
targetKeyword: "classy crm integration"
targetPersona:
  - "finance-operations-staff"
  - "executive-director"
tags:
  - "integration"
  - "payments"
  - "classy"
  - "peer-to-peer"
bluf: "Classy gives you the campaign page and peer-to-peer fundraising infrastructure - GrantPipe gives you the donor-lifetime view across every campaign. The integration pulls Classy donations via API, deduplicates donors, maps fundraising page owners to GrantPipe contacts, and surfaces the full giving history in a single record regardless of how many Classy campaigns a donor has participated in."
faqs:
  - q: "How does GrantPipe authenticate with Classy?"
    a: "GrantPipe uses Classy's OAuth 2.0 API authentication. You connect from GrantPipe Settings with your Classy admin credentials. GrantPipe stores the access and refresh tokens - not your Classy password."
  - q: "Does the integration sync peer-to-peer fundraiser pages?"
    a: "Yes. Classy peer-to-peer fundraiser pages are synced as campaign records in GrantPipe. The fundraiser (the person who created the page) is linked as a donor record, and donations made through their page are attributed to both the donor and the fundraiser."
  - q: "How does donor deduplication work?"
    a: "GrantPipe matches Classy supporters to existing GrantPipe donors by email first, then by name. An exact email match links the records without creating a duplicate. When a Classy supporter has no match, a new donor record is created with the Classy supporter ID stored for future matching."
  - q: "Does GrantPipe process Classy recurring plans?"
    a: "No. Classy stays the payment system for recurring plans. GrantPipe can import donation history, but it does not process donor payments or manage payment failures."
  - q: "Can I see Classy campaign totals in GrantPipe reporting?"
    a: "Yes. Classy campaigns sync as campaign records in GrantPipe. You can filter donor lists and giving reports by campaign to see which campaigns drove the most donors, the highest average gifts, and the best retention."
  - q: "Is Classy's GoFundMe Charity product covered?"
    a: "The integration targets Classy's core API, which covers campaigns created on the Classy platform. GoFundMe Charity campaigns use a separate product architecture; coverage of GoFundMe Charity campaigns is on the roadmap."
relatedPages:
  - "/integrations/donorbox"
  - "/features/donor-segmentation"
  - "/resources/guides/donor-retention-strategies"
  - "/compare/alternatives/classy"
sourceUrls:
  - "https://developers.classy.org/overview/authentication"
  - "https://developers.classy.org/api-reference/donations"
  - "https://developers.classy.org/api-reference/recurring-giving-plans"
  - "https://www.classy.org/blog/nonprofit-fundraising-statistics/"
statistics:
  - stat: "Classy (GoFundMe's nonprofit arm) processed more than $1 billion in donations annually at peak, serving thousands of nonprofits with peer-to-peer and campaign fundraising tools"
    source: "Classy Company Overview"
    sourceUrl: "https://www.classy.org/about/"
  - stat: "Peer-to-peer fundraising campaigns on Classy generate an average of 1.7x more revenue per donor compared to standard donation pages, driven by social proof and personal networks"
    source: "Classy - The State of Modern Philanthropy Report"
    sourceUrl: "https://www.classy.org/blog/state-of-modern-philanthropy/"
  - stat: "Recurring donors give 42% more per year on average than one-time donors, according to Classy's giving research"
    source: "Classy - The Recurring Giving Report"
    sourceUrl: "https://www.classy.org/blog/recurring-giving-report/"
partner:
  name: "Classy"
  slug: "classy"
  url: "https://www.classy.org"
category: "payments"
setupSteps:
  - title: "Connect Classy via OAuth"
    content: "In GrantPipe, go to Settings †’ Integrations †’ Classy and click Connect. You will be prompted for your Classy organization credentials. GrantPipe requests read access to donations, supporters, campaigns, and fundraiser pages."
  - title: "Select the Classy organization"
    content: "If your Classy account manages multiple organizations, select the correct organization. GrantPipe scopes the integration to that organization's campaigns and donors."
  - title: "Run the donor deduplication pass"
    content: "GrantPipe compares Classy supporters against existing GrantPipe donors. Review the match report: confirmed matches are linked; ambiguous matches are queued for manual review; unmatched supporters become new donors."
  - title: "Map campaigns to GrantPipe funds"
    content: "Map each Classy campaign to a GrantPipe restricted fund or to the general operating fund. Donations from that campaign will be attributed to the selected fund in GrantPipe reporting."
  - title: "Configure fundraiser page sync"
    content: "Decide whether peer-to-peer fundraiser page owners should be imported as GrantPipe donors. Most organizations import them as donor records to track their future giving potential."
  - title: "Set the historical import date"
    content: "Choose a cutoff date for importing historical Classy donations. GrantPipe imports all donations from that date forward, running deduplication on each batch."
  - title: "Enable ongoing sync"
    content: "Ongoing sync pulls new Classy donations into GrantPipe on a nightly schedule. New donations appear the morning after they are processed in Classy."
supportedFeatures:
  - "OAuth 2.0 authentication via Classy API"
  - "Donation sync with gross and net amounts"
  - "Peer-to-peer campaign and fundraiser page sync"
  - "Donor deduplication by email and name"
  - "Campaign-to-fund mapping for restricted fund attribution"
  - "Historical donation import with configurable cutoff date"
  - "Nightly ongoing sync"
useCases:
  - "See a donor's complete giving history across every Classy campaign in a single GrantPipe record"
  - "Attribute Classy campaign revenue to the correct restricted fund automatically"
  - "Track which peer-to-peer fundraisers have become repeat donors or major gift prospects"
  - "Report on campaign-level donor retention without manual Classy exports"
tableData:
  name: "Classy data objects synced"
  description: "What Classy data GrantPipe imports and how it maps"
  columns: ["Classy Object", "GrantPipe Record", "Sync Direction"]
  rows:
    - ["Supporter", "Donor", "Classy †’ GrantPipe (with dedup)"]
    - ["Donation", "Donation", "Classy †’ GrantPipe"]
    - ["Campaign", "Campaign record", "Classy †’ GrantPipe"]
    - ["Fundraising page", "Donor (fundraiser) + campaign link", "Classy †’ GrantPipe"]
proscons:
  - subject: "Classy integration"
    pros:
      - "Peer-to-peer fundraiser tracking brings event-driven acquisition data into the long-term donor record"
      - "Campaign-to-fund mapping automates restricted fund attribution for Classy-sourced gifts"
      - "Deduplication logic handles the email-variation problem common in Classy supporter imports"
    cons:
      - "Classy's API does not expose real-time webhooks for all events; sync is nightly rather than immediate"
      - "GoFundMe Charity campaign coverage requires a separate integration milestone"
      - "Soft credits for peer-to-peer fundraisers require manual assignment in GrantPipe after import"
answers:
  - question: "How does GrantPipe handle donors who give through multiple Classy campaigns?"
    answer: "Each Classy donation is linked to the donor record matched by email. If a donor gives to three different Classy campaigns over three years, all three donations appear on a single GrantPipe donor record. Campaign attribution is preserved as a tag on each donation."
  - question: "What about the fundraiser's soft credit for peer-to-peer gifts?"
    answer: "Peer-to-peer gifts are hard-credited to the actual donor (the person who gave). The fundraiser page owner receives a soft credit for gifts made through their page. GrantPipe's soft-credit tracking records this relationship so the fundraiser's influence on total giving is visible in reporting."
  - question: "Can I use the Classy integration alongside payment exports?"
    answer: "Yes. Some organizations use Classy for campaign fundraising and another processor for direct gifts. GrantPipe deduplicates imported gifts by email, so a donor who gives through both sources has one record."
pricingStats:
  - stat: "Classy charges a platform fee on donations in addition to Stripe processing fees; Classy's standard platform fee structure is tiered starting at 3-5% of donated volume, varying by plan"
    source: "Classy Pricing Overview"
    sourceUrl: "https://www.classy.org/pricing/"
  - stat: "Organizations using Classy's peer-to-peer tools see an average fundraiser page raise $568, based on Classy's own platform data"
    source: "Classy - State of Modern Philanthropy"
    sourceUrl: "https://www.classy.org/blog/state-of-modern-philanthropy/"
---

Classy is where many mid-sized nonprofits run campaign fundraising and peer-to-peer events. Its data lives inside Classy until you export it. GrantPipe pulls campaigns and donor history into one CRM record, so teams can track retention, lifetime value, and fund attribution with other gift sources.

## What the integration does

GrantPipe connects to Classy via OAuth 2.0, requesting read access to donations, supporters, campaigns, and fundraising pages. Authentication uses standard OAuth credentials. GrantPipe does not store your Classy password.

On first connect, GrantPipe runs a deduplication pass across your Classy supporter list and your existing GrantPipe donors. Email is the primary key. Exact matches are linked; ambiguous matches are reviewed manually; unmatched Classy supporters become new donor records. Historical donations are imported from a configurable cutoff date.

Ongoing sync is nightly. New donations processed in Classy the previous day appear in GrantPipe the next morning, attributed to the fund mapped for that campaign.

Peer-to-peer fundraiser pages are treated as campaign records. The fundraiser who owns the page is a donor record; gifts made through their page carry a soft credit linking the fundraiser's influence to the donation total.

## Roadmap status

This integration is **on the GrantPipe roadmap**. The Classy API architecture and OAuth 2.0 flow are documented and planned. Given Classy's prevalence among mid-market nonprofits running campaign and peer-to-peer fundraising, this integration is prioritized in the payments cluster. Contact the team for timeline estimates.

## Data flows

- **Classy supporters †’ GrantPipe donors** (with deduplication, historical import + nightly)
- **Classy donations †’ GrantPipe donations** (historical import + nightly, one-way)
- **Classy campaigns †’ GrantPipe campaign records** (nightly)
- **Classy fundraising pages †’ GrantPipe campaign + soft credit links** (nightly)

## Setup steps

1. Connect via OAuth from Settings †’ Integrations †’ Classy
2. Select the correct Classy organization
3. Review and resolve the deduplication match report
4. Map campaigns to GrantPipe restricted funds
5. Configure peer-to-peer fundraiser import settings
6. Set the historical import cutoff date
7. Enable nightly ongoing sync

## Common use cases

A nonprofit runs two major Classy campaigns annually - a year-end giving campaign and a spring gala peer-to-peer drive. After the GrantPipe integration, every gift from both campaigns appears on the donor's unified record. The development director can filter donors who gave to last year's peer-to-peer campaign and segment them for a major gift ask - something impossible from Classy's reports alone.

The finance team maps each campaign to a restricted fund. When the annual report pulls, restricted fund revenue from Classy flows automatically into the GrantPipe fund ledger alongside gifts from other sources.

## Limitations and gotchas

Classy's API does not support real-time webhooks for all event types. Sync is nightly, meaning a same-day gift will not appear in GrantPipe until the next morning. For high-volume event days, a manual sync can be triggered from Settings.

GoFundMe Charity campaigns, which use a different platform architecture from Classy, are not covered in the initial integration. If your organization uses both platforms, GoFundMe Charity data will need a separate import.

Soft credits for peer-to-peer fundraisers are created automatically, but they require the fundraiser to have a GrantPipe donor record. Fundraisers who are themselves donors are matched by email; fundraisers with no prior giving history create new donor records.

## Pricing implications

Classy charges a platform fee on donations in addition to Stripe's processing fee. GrantPipe records the gross donation amount as the donor's gift and separately tracks the platform fee as a cost line - consistent with how most nonprofits record fundraising expenses under FASB ASC 958. GrantPipe's own subscription pricing is not affected by Classy volume.

## Start a free trial

[Start a trial](/signup).
