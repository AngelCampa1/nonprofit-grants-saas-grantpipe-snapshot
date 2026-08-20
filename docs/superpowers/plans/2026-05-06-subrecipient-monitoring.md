# Subrecipient Monitoring Plan

Date: 2026-05-06

## Scope

Implement the PRD MVP as an Audit-Ready+ compliance workflow:

- Shared subrecipient monitoring constants, entitlements, and validators
- Drizzle schema and migration
- API domain mounted at `/api/subrecipients`
- Risk-based monitoring task generation
- Evidence bundle creation backed by generated reports metadata
- Pricing and marketing feature inventory updates

## Implementation Tasks

1. Add shared contracts and tests.
2. Add DB tables, relations, schema tests, and migration.
3. Add API route and service tests.
4. Implement API service operations with org scoping, soft delete, activity logging, and plan gating.
5. Mount API routes behind active billing.
6. Update pricing catalog and pricing tests.
7. Add feature-page content and source-backed compliance framing.
8. Run targeted tests, typecheck, formatting, and package verification.

## Out Of Scope

- External UEI/SAM.gov validation
- Full web UI route implementation
- Portal UI changes beyond evidence bundle compatibility
- New production deploy in this branch before explicit final release approval

## Verification

Targeted tests:

- `pnpm --filter @grantpipe/shared test -- src/constants/index.test.ts src/validators/subrecipients.test.ts src/pricing.test.ts`
- `pnpm --filter @grantpipe/db test -- src/schema/subrecipients.test.ts`
- `pnpm --filter @grantpipe/api test -- src/domains/subrecipients/service.test.ts src/domains/subrecipients/routes.test.ts`

Final checks:

- `turbo typecheck`
- Targeted coverage for touched packages where feasible
- `pnpm format:check`
