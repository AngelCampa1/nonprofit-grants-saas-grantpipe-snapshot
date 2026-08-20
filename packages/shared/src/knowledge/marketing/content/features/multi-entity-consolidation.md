---
title: Planned Multi-Entity Consolidation for Nonprofits
entitlement: hasMultiEntityConsolidation
status: planned
description: "GrantPipe is planning multi-entity support for nonprofits that manage more than one legal entity or sponsored project. This feature is not live yet."
seoTitle: Planned Multi-Entity Consolidation for Nonprofits
seoDescription: "GrantPipe is planning multi-entity support for nonprofits with related entities, fiscal sponsors, and agency-style client work. This feature is not live yet."
publishedAt: "2026-04-25"
updatedAt: "2026-06-25"
lastReviewedAt: "2026-06-25"
buyerStage: bofu
schema: SoftwareApplication
topicCluster: restricted-fund-accounting
contentIntent: category
primaryCta: contact
ctaMode: evaluate
refreshCadenceMonths: 3
noindex: true
targetPersona:
  - executive-director
  - finance-operations-staff
tags:
  - feature
  - multi-entity
  - restricted-fund-accounting
  - nonprofit-crm
targetKeyword: nonprofit multi entity consolidation
bluf: "Multi-entity support is planned, not live yet. GrantPipe is first building the data model, access rules, and tests that keep client and entity records apart."
faqs:
  - q: Is multi-entity support live in GrantPipe today?
    a: "No. GrantPipe is planning this feature now. It should not be sold or described as shipped until the access model, entity setup, and tested data isolation are complete."
  - q: What structures is GrantPipe planning to support?
    a: "The planned work covers related legal entities, fiscal sponsors, sponsored projects, and agency-style client work. Final availability depends on the shipped entity model."
  - q: Which plan will include multi-entity support?
    a: "Treat multi-entity support as an Enterprise planning item until the pricing catalog and shipped product say otherwise."
  - q: What has to ship before this page can say more?
    a: "GrantPipe needs entity setup, entity access rules, a client switcher, tested data isolation, and approved report paths before stronger public copy can go live."
relatedPages:
  - /features/role-based-permissions
  - /resources/guides/fasb-asc-958-nonprofit-reporting
  - /resources/guides/nonprofit-crm-features
  - /features/grant-pipeline-management
  - /product
  - /pricing
  - /features/payroll-allocation
  - /features/restricted-fund-tracking
proscons:
  - subject: Planned GrantPipe multi-entity support
    pros:
      - Planned for teams that manage more than one entity or client group
      - Planned to keep entity access clear before public claims expand
      - Planned as part of the Enterprise product path
    cons:
      - Not live yet
      - Public claims stay limited until isolation tests pass
      - Final setup flow and reporting scope are still being built
answers:
  - q: When does a nonprofit need multi-entity support in its CRM?
    a: "A nonprofit may need it when one team manages more than one legal entity, sponsored project, or client group. That work can create access and reporting problems if every record lives in one flat account."
  - q: What is GrantPipe building first?
    a: "GrantPipe is building the entity data model first. Then it needs access rules, entity setup, user assignment, a switcher, and tests that prove records stay in the right place."
  - q: Why not publish the full feature claim now?
    a: "The feature is not live yet. Public copy must wait until the shipped product proves the claim."
tableData:
  name: Planned multi-entity scope
  description: Current planning scope for GrantPipe multi-entity work.
  columns:
    - Structure type
    - Current copy status
    - Required proof
  rows:
    - - Related legal entities
      - Planned
      - Entity setup and access tests
    - - Fiscal sponsors
      - Planned
      - Sponsored project model and client access tests
    - - Agency client work
      - Planned
      - Client setup and assignment tests
    - - Group reporting
      - Gated
      - Approved report path and authorization tests
sourceUrls:
  - "https://www.fasb.org/page/PageContent?pageId=/projects/recentlycompleted/not-for-profit-financial-statements.html"
---

## The problem

Some nonprofits manage more than one entity. Others manage many client groups.
A flat account can make that work hard to control.

Teams often start with tags, naming rules, and side notes. That can work for a
small team. It gets harder when records need clear homes.

Fiscal sponsors have a related problem. One sponsor may help many sponsored
projects. Each project needs clean records. Each project may need its own staff
view.

Client-service teams see the same issue. One team may help many nonprofit
clients. The work needs one paid account. Client data still needs clear walls.

GrantPipe is building this with care. This page names the plan. It does not
present the feature as live.

## How GrantPipe plans to solve it

GrantPipe is building the foundation first. That means the data model comes
before the sales claim.

The first build keeps the paid account as the billing home. It adds an entity
layer under that account. The entity is the place where client or project data
will live.

This matters because billing and data access are not the same thing. One team
may pay for the account. Each user may need different entity access inside it.

The first build must prove that each record stays in the right entity.

It must also prove one more thing. Users should only see the entities they can
access.

## Current status.

Multi-entity support is not live yet.

GrantPipe is planning the foundation now. The first build must prove that each
record stays in the right entity.

That is why this page stays narrow. It explains the build path. It does not ask
buyers to trust a feature that is not ready.

## Planned work.

GrantPipe plans support for related legal entities. It also plans support for
fiscal sponsors, sponsored projects, and agency client work.

The first build is about safety. It covers the data model, access rules, entity
setup, user assignment, and tests.

The first build gives each current account a default entity. Current team
members need default access. That keeps current customers from losing access.

The next build adds active entity selection. The app needs to know where each
user is working.

The team settings flow comes after that. Admins need a way to create entities
and assign access. Invite flows need to support one entity without opening every
other entity.

The app shell also needs a clear switcher. Some users may access more than one
entity. Those users need to choose where they work. Single-entity users should
not see other entity names.

GrantPipe needs one tested data slice before stronger copy can go live. The
first slice should cover grants and funds. It should also cover related grant
records and activity logs.

## Safe claims.

- GrantPipe plans multi-entity support.
- The first build keeps the account and billing model in place.
- Public claims stay limited until tests prove the feature.
- Treat plan access as Enterprise planning only.

## Proof needed.

GrantPipe needs these pieces before stronger claims go live:

1. Entity setup in the app.
2. Entity access rules.
3. User assignment by entity.
4. A client or entity switcher.
5. A tested data slice for one entity.
6. Approved report paths for broader views.

## What still needs proof.

Client switching still needs product proof.

Limited client access still needs product proof.

Broader reports still need product proof.

Donor data rules still need product proof.

Plan access stays Enterprise planning only.

Those points need tests before public copy can say more.

## Who needs this.

Teams need this when they manage more than one entity.

It may also help fiscal sponsors. It may help teams with many clients.

Leaders may need one view of the whole structure. Finance teams may need clean
data for each entity. Admin teams may need a way to grant the right access.

Those needs are real. GrantPipe still needs to finish the build. After that,
this page can say more.

## Why the claim stays gated.

Multi-entity support touches tenant safety. That means it has to be built with
tests from the start.

A shallow page would be easy to write. It would also be too broad. GrantPipe
keeps the copy narrow until tests prove the feature.

The first proof is access. The second proof is data scope. The third proof is a
safe report path. Each proof needs tests before stronger copy can ship.

## Related pages.

- [payroll allocation](/features/payroll-allocation).
- [fund tracking](/features/restricted-fund-tracking).
- [Product overview](/product).
- [Pricing and plan fit](/pricing).
