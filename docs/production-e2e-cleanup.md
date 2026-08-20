# Production E2E Cleanup

Live E2E checks must run through the cleanup wrapper so the database does not
keep one-off test users, orgs, or storage objects after a test run.

```bash
pnpm e2e:live -- node e2e-adhoc/ai-cs-prod-e2e.mjs
```

The wrapper runs production cleanup before and after the command. The second
cleanup runs even when the test command fails.

For a cleanup-only pass:

```bash
pnpm e2e:live:cleanup
```

For a no-write preview:

```bash
pnpm e2e:live:cleanup:dry-run
```

The cleanup script loads `.env` from the current checkout, or from the parent
repo when it is running inside `.worktrees/<branch>`. It uses
`GRANTPIPE_PROD_DATABASE_URL` or `DATABASE_URL`. It refuses to treat
`SUPABASE_MIGRATION_DB_URL` as the production cleanup target, even when that
same URL is supplied through `GRANTPIPE_PROD_DATABASE_URL`.

## Permanent E2E Account

The reusable production E2E account is the only test account that should remain
in production between test runs.

- `GRANTPIPE_E2E_EMAIL` protects the reusable user.
- `GRANTPIPE_E2E_ORG_NAME` protects the reusable org.
- `GRANTPIPE_E2E_PASSWORD` must stay only in the ignored local `.env`.
- `GRANTPIPE_E2E_CREATED_AT` is an audit hint for humans; cleanup does not use
  it as a delete or preserve condition.

Do not create one-off production accounts when the reusable account can test the
workflow. If a test must create a throwaway account, it must use a cleanup marker
that the script already recognizes.

## One-Off Account Markers

Allowed throwaway markers include:

- `e2e-%@grantpipe.test`
- `grantpipe.e2e%@%`
- `angel+e2e-%@grantpipe.com`
- `codex-smoke-%@example.com`
- `codex-tail-%@example.com`
- `codex-repro-%@example.com`
- `gp-verify-%@example.com`
- `operator+grantpipe-canary-%@ventoralabs.com`
- `operator+grantpipe-posthog-%@ventoralabs.com`
- `operator+grantpipe-url-trace-%@ventoralabs.com`
- `operator+grantpipe-nettrace-%@ventoralabs.com`
- org names/slugs beginning with `GrantPipe E2E`, `GrantPipe Sweep`,
  `Codex Smoke`, `GrantPipe Verify`, or the matching explicit canary org names
  used by those throwaway users.

Do not add new ad-hoc email/name patterns in an E2E script without first adding
the marker to `scripts/prod-e2e-cleanup.ts` and covering it in
`scripts/prod-e2e-cleanup.test.ts`.

## PostHog Cleanup

PostHog person cleanup runs from the same removable user and org IDs selected
for the database. The app identifies authenticated browser users with the database user
ID, and server-side analytics uses org IDs for org-scoped events. Deleting
PostHog persons by those `distinct_ids` removes matching one-off test events and
recordings while preserving the reusable E2E user and org IDs.

Set these ignored `.env` values before confirmed cleanup if you also want the
cleanup pass to remove matching PostHog persons/events:

- `POSTHOG_APP_HOST=https://us.posthog.com`
- `POSTHOG_PROJECT_ID=390138`
- `POSTHOG_PERSONAL_API_KEY=<personal key with person:write>`

The key must have PostHog `person:write` scope. If these values are absent,
confirmed cleanup still removes database and storage residue and skips PostHog
cleanup.

If database rows were already removed before PostHog cleanup had write access, use
only reviewed PostHog person IDs. Do not use broad person searches for deletion.

```bash
pnpm e2e:live:cleanup:dry-run -- --posthog-person-ids=<id-1>,<id-2>
pnpm e2e:live:cleanup -- --posthog-person-ids=<id-1>,<id-2>
```

`POSTHOG_REVIEWED_PERSON_IDS` can also hold the same comma-separated list in
the ignored local `.env`. This path deletes the exact reviewed PostHog persons,
their events, and recordings; it does not infer candidates from already-deleted
database rows.

## Run Protocol

Before running any mutating production E2E, run
`pnpm e2e:live:cleanup:dry-run`. If it reports removable database rows,
complete confirmed cleanup first.
Do not create more production E2E data while cleanup is already non-zero.

Before any new production E2E script is merged:

1. Use the reusable `GRANTPIPE_E2E_*` account when possible.
2. If a throwaway account is required, use one of the markers above.
3. Wrap the production run with `pnpm e2e:live -- <command>`.
4. Run `pnpm e2e:live:cleanup:dry-run` and confirm only expected test rows are
   selected.
5. Run `pnpm e2e:live:cleanup` after the test run.
6. Run the dry-run again. It should report no removable rows. It should still
   report the reusable org as preserved when the reusable org exists in
   production.
