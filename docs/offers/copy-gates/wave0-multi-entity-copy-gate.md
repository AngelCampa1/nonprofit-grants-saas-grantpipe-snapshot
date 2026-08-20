# Wave 0.3 Multi-Entity Copy And Observability Gate

Date: 2026-06-25

Status: Task 9 execution record. This is not customer-facing copy.

## Reviewed surfaces

- `apps/web/src/routes/_authenticated/settings.entities.tsx`
- `apps/web/src/components/shell/user-menu.tsx`
- `apps/web/src/routes/_authenticated/settings.team.tsx`
- `packages/shared/src/knowledge/marketing/content/features/role-based-permissions.md`
- `docs/offers/copy-gates/wave0-multi-entity-claims-ledger.md`

## Copy decisions

- Settings entity setup keeps the technical term `entity`.
- The `agency_client` internal value now renders as `Managed entity`, not
  "Agency client", until the public client-management claim is fully proved.
- Public role-permissions copy no longer claims role-per-entity assignment,
  workspace switching, client-only access, under-a-minute setup, support-ticket
  removal, or unverified third-party statistics.
- Public role-permissions copy names the real four roles: Admin, Editor,
  Viewer, and Auditor.
- Multi-entity role assignment is described as planned Enterprise work until
  product proof and pricing proof agree.

## Humanizer pass

Removed AI and sales tells from the touched public copy:

- no "every legitimate access pattern" claim.
- no unsupported time claim.
- no support-ticket claim.
- no broad consultant replacement claim.
- no shipped-sounding entity switcher or client-isolation claim.
- no unverified statistic block.

## Third-grade-copy pass

Commands:

```bash
python <third-grade-copy>/scripts/scan_copy.py apps/web/src/routes/_authenticated/settings.entities.tsx --include-warnings --markdown
python <third-grade-copy>/scripts/scan_copy.py packages/shared/src/knowledge/marketing/content/features/role-based-permissions.md --include-docs --include-warnings --markdown
```

Results:

- Settings entity page: 7 strings checked, 0 failures, 0 warnings.
- Role-based permissions page: 44 strings checked, 0 failures, 8 reading-grade
  warnings. The warnings retain product terms that are needed in this page:
  Admin, Editor, Viewer, Auditor, audit trail, donor, grant, finance, and
  funder.

Focused evaluator:

```bash
@'
Your org starts with one default entity. Add more for legal entities, sponsored projects, or managed entities.
Managed entity
Multi-entity role assignment stays gated until product proof is complete.
GrantPipe uses four roles: Admin, Editor, Viewer, and Auditor. Teams can assign clear access without custom permission sets.
'@ | python <third-grade-copy>/scripts/evaluate_copy.py --required-term "GrantPipe" --required-term "Admin" --required-term "Editor" --required-term "Viewer" --required-term "Auditor"
```

Result: PASS, with one Flesch-Kincaid warning caused by required product terms.

## Zero-lies review

- Claims ledger still blocks public claims for workspace switching,
  client-only access, client-specific invites, roll-up reports, inter-entity
  eliminations, and shared donor records.
- Role-based permissions page now says multi-entity role assignment is planned
  Enterprise work, not shipped behavior.
- Pricing constants keep `hasMultiEntityConsolidation` true only for Enterprise.
- The public claim gate now scans both `multi-entity-consolidation.md` and
  `role-based-permissions.md` for shipped entity-switching and client-isolation
  claims.

## Observability and privacy proof

API Sentry:

- `captureApiException` adds only sanitized request dimensions: method, route,
  status, org id, entity id, entity scope, and user id.
- `captureBackgroundException` and `captureQueueException` redact sensitive tag
  keys and EIN-like values before sending to Sentry, and replace captured
  background/queue error messages when the tags prove sensitive context.
- Entity-scoped `/api/grants` 403/404 `AppError` responses are captured to
  Sentry with a generic `Entity-scoped grants access failure` message so denied
  reads and cross-entity not-found paths have route, entity id, and scope
  evidence without names or financial details.
- Generic 4xx `AppError` responses still do not send Sentry noise.

Analytics:

- Entity setup and switch analytics tests assert ID-only payloads.
- The claim-gate test blocks public copy from implying unsupported client-only
  access or workspace switching.

## Verification

Red tests confirmed before implementation:

- `pnpm --filter @grantpipe/api test -- src/lib/sentry.test.ts`
- `pnpm --filter @grantpipe/api test -- src/middleware/error-handler.test.ts`
- `pnpm --filter @grantpipe/shared test -- src/knowledge/marketing/__tests__/multi-entity-claim-gate.test.ts`
- `pnpm --filter @grantpipe/web test -- src/routes/_authenticated/settings.entities.test.tsx`

Green tests:

```bash
pnpm --filter @grantpipe/api test -- src/lib/sentry.test.ts
pnpm --filter @grantpipe/api test -- src/middleware/error-handler.test.ts
pnpm --filter @grantpipe/shared test -- src/knowledge/marketing/__tests__/multi-entity-claim-gate.test.ts
pnpm --filter @grantpipe/web test -- src/routes/_authenticated/settings.entities.test.tsx
```

All green on 2026-06-25. The final combined API run covered 25 Sentry tests
and 13 error-handler tests.

## Residual risk

The broad role-permissions page still contains necessary product terms that
score above grade 3 mechanically. They are required for accuracy and are now
scanner warnings only, not failures.
