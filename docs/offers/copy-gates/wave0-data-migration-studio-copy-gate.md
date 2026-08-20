# Wave 0.4 Data Migration Studio Copy Gate

Date: 2026-06-25

## Scope

- `packages/shared/src/knowledge/marketing/content/features/data-migration-onboarding-studio.md`
- `packages/shared/src/knowledge/marketing/__tests__/data-migration-claim-gate.test.ts`

## Humanizer Pass

Reviewed the touched public feature-page copy for AI-sounding, bloated, or generic phrasing.

Changes made:

- Replaced "common donor tools" with the exact supported presets: Bloomerang, DonorPerfect, QuickBooks, Salesforce NPSP, and Generic CSV.
- Removed the unsupported "day one" migration claim.
- Kept the limitation that GrantPipe does not merge every possible duplicate automatically.

## Third-Grade Copy Pass

Reviewed the changed lines for short sentences and plain wording.

The final changed copy uses direct terms:

- "GrantPipe has presets for Bloomerang, DonorPerfect, QuickBooks, and Salesforce NPSP."
- "Other systems can use Generic CSV."
- "Your team can keep pledge schedules in GrantPipe."

The repo does not include `scripts/evaluate_copy.py`, so the mechanical grade helper could not run in this checkout. The manual pass kept product and integration names intact because they are required source terms.

## Zero-Lies Review

The copy no longer implies:

- direct old-system API migration.
- QuickBooks write-back.
- automatic cleanup of every duplicate.
- no consultant or no migration fee guarantee.
- live in the first session.
- day-one launch value before full implementation proof.

Automated guard:

```bash
pnpm --filter @grantpipe/shared test -- src/knowledge/marketing/__tests__/data-migration-claim-gate.test.ts
```

Result: passed.

## Context Fit Review

The page can still explain the import workflow while the build continues. It names the current CSV/preset scope, keeps limitations visible, and avoids stronger activation claims until the implementation and production checks prove them.
