# Wave 0.3 Multi-Entity Claims Ledger

Date: 2026-06-25

Status: publication gate. This is not customer-facing copy.

## Supported Structures

These structures are allowed in product planning:

- Related legal entities under one nonprofit family.
- Fiscal sponsor Model A projects, where the project is a program of the
  sponsor and not a separate legal entity.
- Fiscal sponsor Model C sponsored projects, where the project keeps separate
  legal identity and the sponsor receives and re-grants funds.
- Agency or consultant clients managed by one operating account.
- Internal consolidation groups used for reporting structure.

## Vocabulary

Use these terms consistently:

- Organization: the paid account, billing, trial, and subscription boundary.
- Entity: a data boundary inside an organization.
- Client: an entity managed by a sponsor, agency, or consultant.
- Sponsored project: a fiscal-sponsor entity. Specify Model A or Model C when
  the legal distinction matters.
- Roll-up: a read-only reporting view across authorized entities.
- Workspace: a user-facing view of the active entity. Avoid saying a workspace
  is separate unless entity isolation is implemented.

## Claim States

| Claim                                                      | Publication state | Required proof before live copy                                        |
| ---------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------- |
| Users can switch between entities/clients                  | Blocked           | Entity switcher UI, `X-Entity-Id` validation, cache invalidation tests |
| Client users see only their client/entity                  | Blocked           | Entity memberships, route-level denial tests, migrated vertical slice  |
| Sponsor admins can invite users to one client              | Blocked           | Team matrix UI, entity invite API, last-admin/client-admin invariants  |
| Roll-up reports consolidate multiple entities              | Blocked           | Explicit roll-up report service, authorization tests, export labels    |
| Inter-entity eliminations prevent double counting          | Blocked           | Inter-entity transaction tagging and elimination tests                 |
| Donor records can be shared while gifts stay entity-scoped | Blocked           | Shared contact identity model and entity-scoped gift history           |
| Multi-entity is an Enterprise planning item                | Draft allowed     | Pricing constants and entitlement checks agree                         |
| Multi-entity is available on Professional                  | Do not publish    | There is no Professional plan in current pricing constants             |

## Existing Copy Quarantine

`packages/shared/src/knowledge/marketing/content/features/multi-entity-consolidation.md`
previously contained shipped-sounding claims for:

- isolated workspaces.
- role-per-entity permissions.
- roll-up reporting.
- intercompany eliminations.
- shared donor records.
- Professional plan availability.

Those claims were quarantined in merge `2a859696`. The noindexed planned feature
page now uses planned-language only, sets `status: planned`, uses the
contact/evaluate CTA path, and is marked `noindex`. The live page was verified
with `noindex, follow` robots metadata and the feature URL was verified absent
from the sitemap.

Keep the blocked claims out of live buyer-facing surfaces until the proof in
this ledger exists. The Professional-plan line must stay unpublished because the
current plan set is Starter, Growth, Audit-Ready, and Enterprise.

### Quarantine Guardrails

- `packages/shared/src/knowledge/marketing/__tests__/multi-entity-claim-gate.test.ts`
  fails if the feature page or generated knowledge index reintroduces shipped
  multi-entity claims, Professional-plan availability, client-only access,
  roll-up reporting, inter-entity eliminations, or shared donor records.
- `apps/site/src/feature-page-cta-contract.test.ts` verifies that feature-page
  `noindex` frontmatter reaches `ArticleLayout` and that this planned feature is
  excluded from the sitemap.
- `apps/site/src/feature-landing-pages-contract.test.ts` permits the planned
  heading `## How GrantPipe plans to solve it` only for planned features, while
  live features still need the shipped-feature heading.

## Copy Gate Checklist

Before any Wave 0.3 public copy is approved:

- Run `humanizer`.
- Run `third-grade-copy`.
- Verify the exact feature claim against implemented routes, UI, tests, and
  pricing constants.
- Verify fiscal sponsorship wording distinguishes Model A and Model C when
  relevant.
- Verify no claim says or implies intercompany elimination, shared donors,
  entity switcher, or consolidated reporting before the matching product proof
  exists.
- Verify the claim fits the surrounding page and does not overstate availability
  on Starter, Growth, or Audit-Ready.

## Approved Interim Message

Until the product proof exists, use planning language only:

GrantPipe is designing multi-client/entity support for Enterprise customers who
manage related entities, fiscal-sponsor projects, or agency-style client
portfolios. Public claims stay gated until client isolation, entity
permissions, and roll-up reporting are implemented and verified.
