# Neon to Supabase Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move GrantPipe's production transactional Postgres database from Neon to Supabase without changing the app's auth model, tenant model, billing, storage, analytics, or public routes.

**Architecture:** Keep Supabase as managed Postgres first, not as a full backend rewrite. The API continues to use Hono, Better Auth, Drizzle, Cloudflare Workers, Hyperdrive, R2, Stripe, Resend, Sentry, and PostHog; the migration swaps the Postgres provider, removes Neon-specific runtime assumptions, rehearses data copy, then cuts Cloudflare secrets and a new Supabase Hyperdrive binding over during a mandatory write-freeze window.

**No-deletion constraint:** This is not a Neon decommission. Neon stays intact after cutover for rollback, audit, and forensic reference. Do not delete the Neon project, mutate the old Neon Hyperdrive config, or discard the old production database secret until a later retirement plan explicitly covers retention, reconciliation, and deletion approval.

**Tech Stack:** TypeScript ESM, pnpm, Turborepo, Drizzle ORM, node-postgres `pg`, Cloudflare Workers with `nodejs_compat`, Cloudflare Hyperdrive, Supabase Postgres, `pg_dump`, `psql`, Vitest, Playwright.

---

## Current Implementation Status

- Code provider swap is implemented on branch `codex/neon-to-supabase`.
- Maintenance/read-only gating is implemented for HTTP writes, queue writes, and scheduled jobs.
- Production E2E config and rehearsal/cleanup guards are implemented.
- Provider migration audit and rehearsal wrapper are implemented.
- `docs/operations/neon-to-supabase-runbook.md` is the operator runbook for the actual cutover and states that Neon remains intact.
- Local Supabase CLI/Docker app verification has passed against `supabase_db_supabase-grantpipe` on `127.0.0.1:55522`, including 19 Playwright tests across onboarding, imports, grants/funds, advanced flows, deep flows, and authenticated surface sweep.
- Local unit, typecheck, script, and migration-safety gates have been run where local tooling allows.
- Remote Supabase rehearsal from the live Neon source, production cutover, and post-cutover production E2E remain blocked until `OLD_DB_URL`, Supabase production/rehearsal connection details, a new Supabase Hyperdrive ID, and production cutover approval are available.
- Pre-cutover production baseline is partially complete on Neon: public production Playwright passed, and two production-funnel checks passed. The throwaway signup/checkout path is stopped pending diagnosis, and additional production E2E is blocked until production cleanup returns to zero.
- Production cleanup currently has 1 removable E2E org and 2 PostHog distinct IDs. Confirmed cleanup correctly refuses to commit because `POSTHOG_PERSONAL_API_KEY` and `POSTHOG_PROJECT_ID` are not available in the local ignored env.

## Current-State Findings

- `packages/db/src/client.ts` now uses provider-neutral `pg` handles for direct and Hyperdrive Postgres connections.
- Scheduled jobs now use the same provider-neutral database path as request traffic.
- Remaining Neon references in current docs are intentionally scoped to source-provider retention, rollback/reference, and the old Hyperdrive ID guard.
- `apps/api/wrangler.toml` has a production Hyperdrive binding whose ID currently points at Neon.
- `packages/db/src/migrations` already owns the Drizzle migration history. Supabase should receive the current live schema/data as a migrated database, then Drizzle remains the source for future schema changes.
- Supabase's current Neon migration guide uses the unpooled Neon connection string as the source and a Supabase database connection as the target, with `pg_dump` plus `psql`; GrantPipe's production runbook must harden that baseline with fail-fast restore, explicit schema scope, separated migration/runtime URLs, and no password-bearing command-line arguments.
- Supabase's 2026 platform default change means public-schema objects are not automatically exposed to the Data API in new projects. GrantPipe should keep using direct Postgres connections and should not add Supabase REST/GraphQL access grants unless a later feature intentionally uses those APIs.
- Cloudflare Hyperdrive should point at the Supabase Direct connection string, not the Supabase pooler, because Hyperdrive performs pooling itself.
- Production rollback is data-safe only before writes are reopened on Supabase. After public writes resume, rollback to Neon is no longer a simple connection-string swap and must be treated as a forward-fix or an explicit data reconciliation project.

## File Structure

- Modify: `packages/db/src/client.ts` - remove Neon serverless driver selection and make provider-neutral Postgres handles explicit.
- Modify: `packages/db/src/client.test.ts` - replace Neon-specific expectations with direct `pg` and Hyperdrive expectations.
- Modify: `packages/db/package.json` and `pnpm-lock.yaml` - remove `@neondatabase/serverless` if no longer used.
- Modify: `apps/api/src/app.ts` - rename prewarm helpers, pass Hyperdrive to scheduled DB handle after the provider switch, and update provider-specific comments/log labels.
- Modify: `apps/api/src/app.test.ts` - update scheduled-job expectations and names away from Neon.
- Modify: `apps/api/src/lib/db-retry.ts` and `apps/api/src/lib/db-retry.test.ts` - keep generic transient Postgres handling, remove Neon-only framing where it no longer applies.
- Modify: `apps/api/wrangler.toml` - update comments from Neon to Supabase and keep the current binding ID until cutover.
- Modify: `apps/api/src/types.ts` only if a clearer binding type name is needed; otherwise leave the existing `HYPERDRIVE` shape.
- Modify: `CLAUDE.md`, `AGENTS.md`, `docs/architecture/third-party-dependency-map.md`, `docs/go-live-manual.md`, `docs/production-readiness.md`, and `docs/production-e2e-cleanup.md` - update provider docs.
- Defer: `apps/site/src/pages/privacy.astro` must stay provider-neutral until the Supabase cutover is complete; update and deploy the public subprocessor copy only in the post-cutover verification commit.
- Create: `scripts/db/provider-migration-audit.ts` - provider-neutral table inventory, row counts, deterministic critical-table checksums, migration history equality, extension/constraint/index/trigger summaries, sequence checks, and post-cutover Supabase-only invariants.
- Create: `scripts/db/provider-migration-audit.test.ts` - verifies the audit script redacts connection strings and reports mismatches.
- Create: `scripts/db/neon-to-supabase-rehearsal.ps1` - local-only PowerShell wrapper for dump, restore, and audit rehearsal. It must never print passwords.
- Create: `scripts/db/neon-to-supabase-rehearsal.test.ts` - validates command construction and redaction.
- Create: `docs/operations/neon-to-supabase-runbook.md` - human cutover runbook with exact rollback and verification steps.
- Create: `playwright.prod-full.config.ts` - production Playwright config without the current `production-funnel.spec.ts` `testMatch` restriction.
- Modify: `package.json` - add an `e2e:prod:full` script that runs production specs through the existing cleanup wrapper.
- Create: `apps/api/src/middleware/maintenance-mode.ts`
- Create: `apps/api/src/middleware/maintenance-mode.test.ts`
- Modify: `apps/api/src/app.ts`, `apps/api/src/types.ts`, and `apps/api/wrangler.toml` - add a production write gate controlled by a Worker var during cutover.

## Task 1: Prepare Isolated Migration Worktree

**Files:**

- No repo file changes.

- [ ] **Step 1: Sync `master`**

Run:

```powershell
git checkout master
git pull
git status --short --branch
```

Expected: `master` is current. If unrelated local changes exist, leave them untouched and continue in a new worktree.

- [ ] **Step 2: Create the worktree**

Run:

```powershell
git worktree add .worktrees/neon-to-supabase -b codex/neon-to-supabase master
Set-Location .worktrees/neon-to-supabase
git status --short --branch
```

Expected: branch `codex/neon-to-supabase` with no tracked changes.

- [ ] **Step 3: Confirm provider tooling**

Run:

```powershell
pnpm install --frozen-lockfile
pnpm exec tsx --version
psql --version
pg_dump --version
supabase --version
supabase db --help
```

Expected: `pnpm`, `psql`, `pg_dump`, and `supabase` are available. If Supabase CLI is missing, install it before continuing and rerun `supabase --version`.

- [ ] **Step 4: Commit nothing**

Run:

```powershell
git status --short
```

Expected: clean worktree. Do not commit preparation-only state.

## Task 2: Add Provider Migration Audit Script

**Files:**

- Create: `scripts/db/provider-migration-audit.ts`
- Create: `scripts/db/provider-migration-audit.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `scripts/db/provider-migration-audit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildAuditSummary,
  redactConnectionString,
  type DatabaseAuditSnapshot,
} from "./provider-migration-audit";

describe("provider migration audit", () => {
  it("redacts database passwords", () => {
    expect(
      redactConnectionString(
        "postgresql://postgres.secret-project:super-secret@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
      ),
    ).toBe(
      "postgresql://postgres.secret-project:***@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
    );
  });

  it("reports matching source and target snapshots", () => {
    const source: DatabaseAuditSnapshot = {
      label: "neon",
      tableCount: 2,
      migrationCount: 79,
      tables: [
        { schema: "public", table: "organizations", rows: 3 },
        { schema: "public", table: "users", rows: 4 },
      ],
    };
    const target: DatabaseAuditSnapshot = {
      label: "supabase",
      tableCount: 2,
      migrationCount: 79,
      tables: [
        { schema: "public", table: "organizations", rows: 3 },
        { schema: "public", table: "users", rows: 4 },
      ],
    };

    expect(buildAuditSummary(source, target)).toEqual({
      ok: true,
      mismatches: [],
    });
  });

  it("reports row-count and migration mismatches", () => {
    const source: DatabaseAuditSnapshot = {
      label: "neon",
      tableCount: 1,
      migrationCount: 79,
      tables: [{ schema: "public", table: "organizations", rows: 3 }],
    };
    const target: DatabaseAuditSnapshot = {
      label: "supabase",
      tableCount: 1,
      migrationCount: 78,
      tables: [{ schema: "public", table: "organizations", rows: 2 }],
    };

    expect(buildAuditSummary(source, target)).toEqual({
      ok: false,
      mismatches: [
        "migration count differs: neon=79 supabase=78",
        "public.organizations row count differs: neon=3 supabase=2",
      ],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
pnpm exec vitest run scripts/db/provider-migration-audit.test.ts
```

Expected: FAIL because `scripts/db/provider-migration-audit.ts` does not exist.

- [ ] **Step 3: Implement the script**

Create `scripts/db/provider-migration-audit.ts`:

```ts
import { Client } from "pg";

export type TableAuditRow = {
  schema: string;
  table: string;
  rows: number;
};

export type DatabaseAuditSnapshot = {
  label: string;
  tableCount: number;
  migrationCount: number;
  tables: TableAuditRow[];
};

export function redactConnectionString(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.password) parsed.password = "***";
    return parsed.toString();
  } catch {
    return value.replace(/:\/\/([^:\s]+):([^@\s]+)@/, "://$1:***@");
  }
}

function tableKey(row: TableAuditRow): string {
  return `${row.schema}.${row.table}`;
}

export function buildAuditSummary(
  source: DatabaseAuditSnapshot,
  target: DatabaseAuditSnapshot,
): { ok: boolean; mismatches: string[] } {
  const mismatches: string[] = [];
  if (source.tableCount !== target.tableCount) {
    mismatches.push(
      `table count differs: ${source.label}=${source.tableCount} ${target.label}=${target.tableCount}`,
    );
  }
  if (source.migrationCount !== target.migrationCount) {
    mismatches.push(
      `migration count differs: ${source.label}=${source.migrationCount} ${target.label}=${target.migrationCount}`,
    );
  }

  const targetRows = new Map(target.tables.map((row) => [tableKey(row), row.rows]));
  for (const sourceRow of source.tables) {
    const key = tableKey(sourceRow);
    const targetCount = targetRows.get(key);
    if (targetCount === undefined) {
      mismatches.push(`${key} missing from ${target.label}`);
      continue;
    }
    if (sourceRow.rows !== targetCount) {
      mismatches.push(
        `${key} row count differs: ${source.label}=${sourceRow.rows} ${target.label}=${targetCount}`,
      );
    }
  }

  return { ok: mismatches.length === 0, mismatches };
}

async function snapshotDatabase(
  label: string,
  connectionString: string,
): Promise<DatabaseAuditSnapshot> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const tableResult = await client.query<{
      schema: string;
      table: string;
      rows: string;
    }>(`
      select table_schema as schema, table_name as table,
        (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint as rows
      from information_schema.tables
      where table_schema = 'public'
        and table_type = 'BASE TABLE'
      order by table_schema, table_name
    `);
    const migrationResult = await client.query<{ count: string }>(`
      select count(*)::text as count
      from information_schema.tables
      where table_schema = 'drizzle'
        and table_name = '__drizzle_migrations'
    `);
    const migrationTableExists = migrationResult.rows[0]?.count === "1";
    const migrationCount = migrationTableExists
      ? Number(
          (
            await client.query<{ count: string }>(
              `select count(*)::text as count from drizzle.__drizzle_migrations`,
            )
          ).rows[0]?.count ?? "0",
        )
      : 0;

    return {
      label,
      tableCount: tableResult.rows.length,
      migrationCount,
      tables: tableResult.rows.map((row) => ({
        schema: row.schema,
        table: row.table,
        rows: Number(row.rows),
      })),
    };
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const oldDbUrl = process.env.OLD_DB_URL;
  const newDbUrl = process.env.SUPABASE_MIGRATION_DB_URL;
  if (!oldDbUrl || !newDbUrl) {
    throw new Error("OLD_DB_URL and SUPABASE_MIGRATION_DB_URL are required.");
  }

  console.log("Auditing source", redactConnectionString(oldDbUrl));
  console.log("Auditing target", redactConnectionString(newDbUrl));
  const source = await snapshotDatabase("neon", oldDbUrl);
  const target = await snapshotDatabase("supabase", newDbUrl);
  const summary = buildAuditSummary(source, target);
  console.log(JSON.stringify({ source, target, summary }, null, 2));
  if (!summary.ok) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
```

- [ ] **Step 4: Expand audit beyond counts before it can be committed**

Add tests and implementation for these non-negotiable checks before this task is considered complete:

```ts
expect(buildAuditSummary(source, target).mismatches).toContain(
  "public.organizations checksum differs",
);
expect(buildAuditSummary(source, target).mismatches).toContain(
  "extension inventory differs: source has citext target is missing citext",
);
expect(buildAuditSummary(source, target).mismatches).toContain(
  "sequence public.some_id_seq last_value is behind target max(id)",
);
expect(buildAuditSummary(source, target).mismatches).toContain(
  "migration history differs at row 42",
);
```

The final script must compare:

- App table inventory in both directions, not only source-to-target.
- Row counts for all app tables.
- Deterministic per-table checksums for critical tables: `user`, `account`, `session`, `organizations`, `org_members`, Stripe subscription/billing tables, grants, funds, documents, imports, and `activity_log`.
- Exact Drizzle migration history rows, not only migration count.
- Extension inventory, including `citext`.
- Constraint, index, trigger, and sequence/identity summaries.
- Supabase-only post-cutover invariants, where Neon equality is no longer valid after Supabase accepts writes.

- [ ] **Step 5: Run test to verify it passes**

Run:

```powershell
pnpm exec vitest run scripts/db/provider-migration-audit.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add scripts/db/provider-migration-audit.ts scripts/db/provider-migration-audit.test.ts
git commit -m "test(db): add provider migration audit"
```

## Task 3: Make the DB Client Provider-Neutral

**Files:**

- Modify: `packages/db/src/client.ts`
- Modify: `packages/db/src/client.test.ts`
- Modify: `packages/db/package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Write failing client tests**

Edit `packages/db/src/client.test.ts` so the first test expects `pg.Pool` for a Supabase-style remote URL and no Neon driver import path:

```ts
it("creates a closeable node-postgres handle for remote database URLs", async () => {
  const end = vi.fn().mockResolvedValue(undefined);
  const pool = { end, query: vi.fn() };
  const dbClient = { select: vi.fn() };
  pgPoolMock.mockReturnValue(pool);
  drizzleNodePostgresMock.mockReturnValue(dbClient);

  const { createDbHandle } = await import("./client");

  const result = await createDbHandle(
    "postgres://postgres.project:pass@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
  );

  expect(result.db).toBe(dbClient);
  expect(pgPoolMock).toHaveBeenCalledWith({
    connectionString:
      "postgres://postgres.project:pass@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
    max: 5,
    connectionTimeoutMillis: 25_000,
    idleTimeoutMillis: 0,
  });
  expect(drizzleNodePostgresMock).toHaveBeenCalledWith(pool, {
    schema: schemaMock,
  });
  await result.close();
  expect(end).toHaveBeenCalledTimes(1);
});
```

Remove mocks and expectations for `@neondatabase/serverless` and `drizzle-orm/neon-serverless`.

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
pnpm --filter @grantpipe/db test -- src/client.test.ts
```

Expected: FAIL because non-local URLs still use the Neon serverless branch.

- [ ] **Step 3: Implement provider-neutral client**

Edit `packages/db/src/client.ts`:

```ts
import { drizzle as drizzleNodePostgres } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const WORKER_PG_POOL_MAX = 5;
const WORKER_PG_CONNECT_TIMEOUT_MS = 25_000;

function shouldUseBoundedWorkerPool(
  databaseUrl: string,
  hyperdrive?: { connectionString: string },
): boolean {
  if (hyperdrive) return true;
  const hostname = new URL(databaseUrl).hostname;
  return !(
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "host.docker.internal"
  );
}

export async function createDbHandle(
  databaseUrl: string,
  hyperdrive?: { connectionString: string },
) {
  const url = hyperdrive?.connectionString ?? databaseUrl;
  const pool = new Pool(
    shouldUseBoundedWorkerPool(databaseUrl, hyperdrive)
      ? {
          connectionString: url,
          max: WORKER_PG_POOL_MAX,
          connectionTimeoutMillis: WORKER_PG_CONNECT_TIMEOUT_MS,
          idleTimeoutMillis: 0,
        }
      : { connectionString: url, max: WORKER_PG_POOL_MAX },
  );

  return {
    db: drizzleNodePostgres(pool, { schema }),
    close: () => pool.end(),
  };
}

type NodeDbWithSchema = ReturnType<typeof drizzleNodePostgres<typeof schema, Pool>>;
export type Database = NodeDbWithSchema;
type NodeTx = Parameters<NodeDbWithSchema["transaction"]>[0] extends (
  tx: infer T,
) => Promise<unknown>
  ? T
  : never;
export type TransactionDatabase = Database | NodeTx;
```

- [ ] **Step 4: Remove unused Neon dependency**

Run:

```powershell
pnpm --filter @grantpipe/db remove @neondatabase/serverless
pnpm install --lockfile-only
```

Expected: `packages/db/package.json` no longer lists `@neondatabase/serverless`, and `pnpm-lock.yaml` updates.

- [ ] **Step 5: Run tests**

Run:

```powershell
pnpm --filter @grantpipe/db test -- src/client.test.ts
pnpm --filter @grantpipe/db typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add packages/db/src/client.ts packages/db/src/client.test.ts packages/db/package.json pnpm-lock.yaml
git commit -m "refactor(db): use provider-neutral postgres client"
```

## Task 4: Update Scheduled Worker DB Behavior

**Files:**

- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/app.test.ts`

- [ ] **Step 1: Write failing scheduled tests**

In `apps/api/src/app.test.ts`, update the scheduled DB tests to assert:

```ts
expect(vi.mocked(createDbHandle)).toHaveBeenCalledWith(
  "postgres://user:pass@db.supabase.co:5432/postgres",
  hyperdrive,
);
```

Rename test descriptions from "Neon" to "database" or "Postgres", for example:

```ts
it("opens one shared Postgres handle for scheduled jobs", async () => {
  // existing assertion body, with HYPERDRIVE passed to createDbHandle
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
pnpm --filter @grantpipe/api test -- src/app.test.ts
```

Expected: FAIL because scheduled jobs still call `createDbHandle(env.DATABASE_URL)` without `env.HYPERDRIVE`.

- [ ] **Step 3: Implement scheduled behavior**

In `apps/api/src/app.ts`:

```ts
async function preWarmDatabaseHandle(db: Database): Promise<void> {
  await withDbRetry(() => db.execute(sql`select 1`), {
    backoffMs: SCHEDULED_PRE_WARM_BACKOFF_MS,
    isRetryable: isRetryableScheduledDbError,
  });
}
```

Replace scheduled handle creation with:

```ts
const handle = await createDbHandle(env.DATABASE_URL, env.HYPERDRIVE);
```

Replace the log label:

```ts
console.error("[scheduled] database.pre-warm failed", {
  cron: controller.cron,
  error: error instanceof Error ? error.message : String(error),
});
```

Update comments to say the scheduled handler pre-warms the shared Postgres pool and retries transient Postgres infrastructure failures.

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
pnpm --filter @grantpipe/api test -- src/app.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add apps/api/src/app.ts apps/api/src/app.test.ts
git commit -m "refactor(api): remove neon-specific scheduled db path"
```

## Task 5: Generalize Retry Naming Without Weakening Behavior

**Files:**

- Modify: `apps/api/src/lib/db-retry.ts`
- Modify: `apps/api/src/lib/db-retry.test.ts`
- Modify only if needed: Neon-named comments in domain tests that assert generic transient DB behavior.

- [ ] **Step 1: Write failing naming tests**

In `apps/api/src/lib/db-retry.test.ts`, add:

```ts
it("matches Supabase pooler transient connection failures", () => {
  expect(isTransientDbError(new Error("Connection terminated unexpectedly"))).toBe(true);
  expect(isTransientDbError(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }))).toBe(true);
});
```

Rename Neon-only test titles to Postgres or provider-neutral names while keeping the same assertions for legacy messages that may still appear in production history.

- [ ] **Step 2: Run test**

Run:

```powershell
pnpm --filter @grantpipe/api test -- src/lib/db-retry.test.ts
```

Expected: PASS or FAIL only on test-title imports if the edit is incomplete.

- [ ] **Step 3: Update comments**

Edit `apps/api/src/lib/db-retry.ts` comments so they describe:

```ts
// Transient infrastructure failures we want to retry inside scheduled jobs.
// This helper is scoped to DB query closures. Do not wrap general HTTP
// `fetch()` callers with `withDbRetry`.
```

Keep the existing SQLSTATE and socket-code behavior.

- [ ] **Step 4: Run focused tests**

Run:

```powershell
pnpm --filter @grantpipe/api test -- src/lib/db-retry.test.ts src/app.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add apps/api/src/lib/db-retry.ts apps/api/src/lib/db-retry.test.ts apps/api/src/app.test.ts
git commit -m "refactor(api): generalize transient postgres retry labels"
```

## Task 6: Add Cutover Maintenance Write Gate

**Files:**

- Create: `apps/api/src/middleware/maintenance-mode.ts`
- Create: `apps/api/src/middleware/maintenance-mode.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/types.ts`
- Modify: `apps/api/wrangler.toml`

- [ ] **Step 1: Write failing middleware tests**

Create `apps/api/src/middleware/maintenance-mode.test.ts`:

```ts
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { maintenanceMode } from "./maintenance-mode";

describe("maintenanceMode", () => {
  function appWithMode(mode: "off" | "read_only" | undefined) {
    const app = new Hono<{ Bindings: { MAINTENANCE_MODE?: "off" | "read_only" } }>();
    app.use("*", maintenanceMode());
    app.get("/api/health", (c) => c.text("ok"));
    app.get("/api/grants", (c) => c.json({ ok: true }));
    app.post("/api/grants", (c) => c.json({ ok: true }));
    return { app, env: { MAINTENANCE_MODE: mode } };
  }

  it("allows health and reads during read-only maintenance", async () => {
    const { app, env } = appWithMode("read_only");

    expect((await app.request("/api/health", {}, env)).status).toBe(200);
    expect((await app.request("/api/grants", {}, env)).status).toBe(200);
  });

  it("blocks mutating requests during read-only maintenance", async () => {
    const { app, env } = appWithMode("read_only");

    const response = await app.request("/api/grants", { method: "POST" }, env);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "GrantPipe is temporarily read-only for maintenance.",
    });
  });

  it("allows writes when maintenance is off", async () => {
    const { app, env } = appWithMode("off");

    expect((await app.request("/api/grants", { method: "POST" }, env)).status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
pnpm --filter @grantpipe/api test -- src/middleware/maintenance-mode.test.ts
```

Expected: FAIL because `maintenance-mode.ts` does not exist.

- [ ] **Step 3: Implement the write gate**

Create `apps/api/src/middleware/maintenance-mode.ts`:

```ts
import type { MiddlewareHandler } from "hono";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function maintenanceMode(): MiddlewareHandler<{
  Bindings: { MAINTENANCE_MODE?: "off" | "read_only" };
}> {
  return async (c, next) => {
    if (c.env.MAINTENANCE_MODE !== "read_only" || !MUTATING_METHODS.has(c.req.method)) {
      await next();
      return;
    }

    const path = new URL(c.req.url).pathname;
    if (path === "/api/health") {
      await next();
      return;
    }

    return c.json({ error: "GrantPipe is temporarily read-only for maintenance." }, 503);
  };
}
```

Wire it near the top of `apps/api/src/app.ts`, after security headers and before DB/session setup:

```ts
.use("*", maintenanceMode())
```

Add to `apps/api/src/types.ts`:

```ts
MAINTENANCE_MODE?: "off" | "read_only";
```

Add to `apps/api/wrangler.toml` and `[env.production.vars]`:

```toml
MAINTENANCE_MODE = "off"
```

- [ ] **Step 4: Run focused tests**

Run:

```powershell
pnpm --filter @grantpipe/api test -- src/middleware/maintenance-mode.test.ts src/app.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add apps/api/src/middleware/maintenance-mode.ts apps/api/src/middleware/maintenance-mode.test.ts apps/api/src/app.ts apps/api/src/types.ts apps/api/wrangler.toml
git commit -m "feat(api): add read-only maintenance gate"
```

## Task 6A: Add Full Production Playwright Config

**Files:**

- Create: `playwright.prod-full.config.ts`
- Modify: `package.json`
- Create or modify: focused script/config test if available

- [ ] **Step 1: Write failing config test**

Add a focused test that proves `playwright.prod-full.config.ts` does not contain the `production-funnel`-only `testMatch` restriction and that `package.json` exposes `e2e:prod:full`.

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
pnpm exec vitest run scripts/public-prod-e2e-contract.test.ts
```

Expected: FAIL until the new script/config exists.

- [ ] **Step 3: Create the full production config**

Create `playwright.prod-full.config.ts` by copying `playwright.prod.config.ts`, then remove the `testMatch: /production-funnel\.spec\.ts/` line. Keep `baseURL`, metadata, single Chromium project, and cleanup-wrapper guard behavior.

Add to `package.json`:

```json
"e2e:prod:full": "tsx scripts/run-live-e2e.ts -- pnpm exec playwright test --config=playwright.prod-full.config.ts"
```

- [ ] **Step 4: Run focused validation**

Run:

```powershell
pnpm exec vitest run scripts/public-prod-e2e-contract.test.ts scripts/run-live-e2e.test.ts
pnpm run e2e:prod:full -- --list e2e/auth-onboarding.spec.ts
```

Expected: the list command includes `auth-onboarding.spec.ts`, proving the full config can run named production specs.

- [ ] **Step 5: Commit**

Run:

```powershell
git add playwright.prod-full.config.ts package.json scripts/public-prod-e2e-contract.test.ts
git commit -m "test(e2e): add full production playwright config"
```

## Task 7: Add Dump/Restore Rehearsal Wrapper

**Files:**

- Create: `scripts/db/neon-to-supabase-rehearsal.ps1`
- Create: `scripts/db/neon-to-supabase-rehearsal.test.ts`

- [ ] **Step 1: Write failing command-construction tests**

Create `scripts/db/neon-to-supabase-rehearsal.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { redactConnectionString } from "./provider-migration-audit";

describe("neon to supabase rehearsal command safety", () => {
  it("redacts source and target connection strings for logs", () => {
    expect(redactConnectionString("postgres://user:secret@old.example/db")).toBe(
      "postgres://user:***@old.example/db",
    );
    expect(redactConnectionString("postgres://postgres.project:secret@new.example/postgres")).toBe(
      "postgres://postgres.project:***@new.example/postgres",
    );
  });
});
```

- [ ] **Step 2: Run test to verify current helper passes**

Run:

```powershell
pnpm exec vitest run scripts/db/neon-to-supabase-rehearsal.test.ts
```

Expected: PASS. This test prevents accidental credential logging through the shared helper.

- [ ] **Step 3: Create the PowerShell wrapper**

Create `scripts/db/neon-to-supabase-rehearsal.ps1`:

```powershell
param(
  [Parameter(Mandatory = $true)]
  [string]$DumpPath,

  [switch]$SkipDump,
  [switch]$SkipRestore
)

$ErrorActionPreference = "Stop"

if (-not $env:OLD_DB_URL) {
  throw "OLD_DB_URL is required. Use the unpooled Neon connection string."
}

if (-not $env:SUPABASE_MIGRATION_DB_URL) {
  throw "SUPABASE_MIGRATION_DB_URL is required. Use the Supabase direct or Session Pooler URL tested for restore/migrations."
}

if (-not $env:SUPABASE_DIRECT_DB_URL) {
  throw "SUPABASE_DIRECT_DB_URL is required for the Hyperdrive origin. Do not use a Supabase pooler URL for Hyperdrive."
}

$dumpFullPath = [System.IO.Path]::GetFullPath($DumpPath)
$dumpDirectory = [System.IO.Path]::GetDirectoryName($dumpFullPath)
if (-not [System.IO.Directory]::Exists($dumpDirectory)) {
  [System.IO.Directory]::CreateDirectory($dumpDirectory) | Out-Null
}

function Assert-NativeSuccess([string]$CommandName) {
  if ($LASTEXITCODE -ne 0) {
    throw "$CommandName failed with exit code $LASTEXITCODE"
  }
}

if ($PSVersionTable.PSVersion.Major -ge 7) {
  $PSNativeCommandUseErrorActionPreference = $true
}

if (-not $SkipDump) {
  pg_dump `
    --dbname $env:OLD_DB_URL `
    --schema public `
    --schema drizzle `
    --clean `
    --if-exists `
    --quote-all-identifiers `
    --no-owner `
    --no-privileges `
    --no-subscriptions `
    --file $dumpFullPath
  Assert-NativeSuccess "pg_dump"
}

if (-not $SkipRestore) {
  psql `
    --set ON_ERROR_STOP=1 `
    --single-transaction `
    --dbname $env:SUPABASE_MIGRATION_DB_URL `
    --file $dumpFullPath
  Assert-NativeSuccess "psql"
}

pnpm exec tsx scripts/db/provider-migration-audit.ts
Assert-NativeSuccess "provider-migration-audit"
```

- [ ] **Step 4: Commit**

Run:

```powershell
git add scripts/db/neon-to-supabase-rehearsal.ps1 scripts/db/neon-to-supabase-rehearsal.test.ts
git commit -m "chore(db): add neon to supabase rehearsal wrapper"
```

## Task 8: Update Provider Docs and Public Subprocessor Copy

**Files:**

- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `docs/architecture/third-party-dependency-map.md`
- Modify: `docs/go-live-manual.md`
- Modify: `docs/production-readiness.md`
- Modify: `docs/production-e2e-cleanup.md`
- Modify: `apps/site/src/pages/privacy.astro`
- Create: `docs/operations/neon-to-supabase-runbook.md`

- [ ] **Step 1: Write failing documentation assertions**

Add or update a focused source test if one exists for privacy subprocessors. If none exists, add a small text assertion to the closest existing site content test:

```ts
expect(privacySource).toContain("<strong>Supabase</strong>");
expect(privacySource).not.toContain("<strong>Neon</strong>");
```

- [ ] **Step 2: Run the failing source test**

Run the focused test file that contains the privacy source assertion.

Expected: FAIL because the privacy page still lists Neon.

- [ ] **Step 3: Update docs and privacy copy**

Use this exact privacy line in `apps/site/src/pages/privacy.astro`:

```astro
<li><strong>Supabase</strong> - managed PostgreSQL database hosting (US region).</li>
```

Update repository docs to say:

```md
- **Database:** Supabase Postgres, Drizzle ORM, row-level multi-tenancy (`org_id` on every tenant table)
- `DATABASE_URL` - Supabase Postgres connection string
```

In `docs/operations/neon-to-supabase-runbook.md`, include:

```md
# Neon to Supabase Cutover Runbook

## Preconditions

- Supabase project exists in the target US region.
- Supabase database password is stored in the password manager.
- `OLD_DB_URL` uses the unpooled Neon connection string.
- `SUPABASE_MIGRATION_DB_URL` uses the Supabase direct or Session Pooler connection string verified for dump restore and Drizzle migrations.
- `SUPABASE_DIRECT_DB_URL` uses the Supabase Direct connection string and is reserved for Cloudflare Hyperdrive.
- Supabase Transaction Pooler is not used unless a separate test proves Drizzle/node-postgres prepared statement behavior is safe.
- Current production `DATABASE_URL` and Hyperdrive ID are recorded in the rollback section.
- `pnpm --filter @grantpipe/db migrate` reports no pending local migration surprises against the current source database.
- Supabase Data API exposure is locked down: app tables in `public` are not exposed to `anon`/`authenticated`, or RLS is enabled with deny-by-default policies and advisors are clean.
- A rollback cutoff is recorded. Before writes reopen on Supabase, rollback can switch traffic back to Neon. After writes reopen, rollback requires forward-fix or tested reverse reconciliation.

## Rehearsal

1. Run `.\scripts\db\neon-to-supabase-rehearsal.ps1 -DumpPath .\output\db\neon-to-supabase-rehearsal.sql`.
2. Run `pnpm exec tsx scripts/db/provider-migration-audit.ts`.
3. Run `pnpm --filter @grantpipe/db migrate` against `SUPABASE_MIGRATION_DB_URL` and verify it is a no-op after restore.
4. Run `pnpm --filter @grantpipe/api test -- src/app.test.ts src/lib/db-retry.test.ts`.

## Cutover

1. Deploy `MAINTENANCE_MODE=read_only` and verify mutating API requests return 503 while `/api/health` and reads still work.
2. Confirm scheduled jobs, queue consumers, public signups, Stripe webhooks, and authenticated mutations are blocked or drained.
3. Record the cutoff timestamp and source database WAL/transaction position where available.
4. Take a final Neon dump with `pg_dump`.
5. Restore into Supabase with fail-fast `psql`.
6. Run the provider audit until source and target match. This is the last valid Neon-vs-Supabase equality check.
7. Create a new Cloudflare Hyperdrive config named `grantpipe-db-supabase` using `SUPABASE_DIRECT_DB_URL`; keep the old Neon Hyperdrive ID unchanged for rollback.
8. Update `apps/api/wrangler.toml` to the new Supabase Hyperdrive ID.
9. Set the Cloudflare Worker `DATABASE_URL` secret to the Supabase migration/runtime URL chosen for fallback.
10. Set local `$env:DATABASE_URL = $env:SUPABASE_MIGRATION_DB_URL` before `pnpm run deploy:api` so the deploy preflight does not migrate Neon by accident.
11. Deploy API with `pnpm run deploy:api`.
12. Run production health checks while `MAINTENANCE_MODE=read_only`.
13. If checks pass, switch `MAINTENANCE_MODE=off`, deploy API, then run the full production test suite.

## Rollback

1. Only use this simple rollback before `MAINTENANCE_MODE=off` reopens writes on Supabase.
2. Restore the previous Cloudflare `DATABASE_URL` secret.
3. Restore the previous Neon Hyperdrive binding ID in `apps/api/wrangler.toml`.
4. Redeploy API.
5. Verify `/api/health`, signup/login, billing settings, grant CRUD, and scheduled-job Sentry silence.
```

- [ ] **Step 4: Run docs tests**

Run:

```powershell
pnpm --filter @grantpipe/site test -- privacy
pnpm format:check
```

Expected: PASS. If no focused privacy test exists, run the smallest affected site/content test.

- [ ] **Step 5: Commit**

Run:

```powershell
git add AGENTS.md CLAUDE.md docs/architecture/third-party-dependency-map.md docs/go-live-manual.md docs/production-readiness.md docs/production-e2e-cleanup.md apps/site/src/pages/privacy.astro docs/operations/neon-to-supabase-runbook.md
git commit -m "docs: document supabase postgres migration"
```

## Task 9: Rehearse Supabase Import on a Throwaway Project

**Files:**

- No committed code changes expected.

- [ ] **Step 1: Create or select throwaway Supabase project**

In Supabase dashboard, create `grantpipe-migration-rehearsal` in the target region. Record the project ref in private notes, not in the repo.

- [ ] **Step 2: Set environment variables without printing secrets**

Run in PowerShell:

```powershell
$env:OLD_DB_URL = "<unpooled Neon source URL>"
$env:SUPABASE_MIGRATION_DB_URL = "<Supabase direct or Session Pooler URL for restore/migrations>"
$env:SUPABASE_DIRECT_DB_URL = "<Supabase Direct connection URL for Hyperdrive>"
```

Expected: no command output containing secrets.

- [ ] **Step 3: Run rehearsal**

Run:

```powershell
.\scripts\db\neon-to-supabase-rehearsal.ps1 -DumpPath .\output\db\neon-to-supabase-rehearsal.sql
```

Expected: dump succeeds, restore succeeds, provider audit prints matching table counts, row counts, and migration count.

- [ ] **Step 4: Test Drizzle against Supabase**

Run:

```powershell
$env:DATABASE_URL = $env:SUPABASE_MIGRATION_DB_URL
pnpm --filter @grantpipe/db migrate
pnpm --filter @grantpipe/db test
```

Expected: no migration drift and DB package tests pass.

- [ ] **Step 5: Capture rehearsal notes**

Add only non-secret outcomes to `docs/operations/neon-to-supabase-runbook.md`:

```md
## Rehearsal Results

- Rehearsal date: 2026-07-04
- Source provider: Neon
- Target provider: Supabase throwaway project
- Result: provider audit matched
- Issues found: none
```

If issues occur, list the actual issue and the exact fix. Do not include database URLs, project passwords, or user data.

- [ ] **Step 6: Commit runbook update**

Run:

```powershell
git add docs/operations/neon-to-supabase-runbook.md
git commit -m "docs: record supabase migration rehearsal"
```

## Task 10: Run Local Provider and Unit Quality Gates

**Files:**

- No planned source changes.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
pnpm --filter @grantpipe/db test
pnpm --filter @grantpipe/api test -- src/app.test.ts src/lib/db-retry.test.ts
pnpm exec vitest run scripts/db/provider-migration-audit.test.ts scripts/db/neon-to-supabase-rehearsal.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck and coverage for touched packages**

Run:

```powershell
pnpm --filter @grantpipe/db typecheck
pnpm --filter @grantpipe/api typecheck
turbo test:coverage --filter=@grantpipe/db --filter=@grantpipe/api --concurrency=2
pnpm exec vitest run --config scripts/vitest.config.ts --coverage scripts/db/provider-migration-audit.test.ts scripts/db/neon-to-supabase-rehearsal.test.ts
```

Expected: PASS and touched files meet the repo's 95% per-file requirement. If `scripts/vitest.config.ts` does not collect coverage for `scripts/db`, add coverage include/threshold configuration for those files before proceeding.

- [ ] **Step 3: Run provider-specific grep audit**

Run:

```powershell
rg -n "@neondatabase/serverless|drizzle-orm/neon-serverless|preWarmNeon|NeonServerless|neon\.pre-warm|Neon Postgres|Neon connection string" apps packages scripts docs AGENTS.md CLAUDE.md
```

Expected: no runtime/provider references remain except competitor content, historical migration filenames such as `0028_remove_neon_marketing_tables.sql`, and the migration runbook's source-provider instructions.

- [ ] **Step 4: Run build gate**

Run:

```powershell
turbo build --filter=@grantpipe/api --filter=@grantpipe/db
```

Expected: PASS.

- [ ] **Step 5: Run aggregate affected checks**

Run:

```powershell
turbo typecheck --filter=@grantpipe/db --filter=@grantpipe/api
turbo test --filter=@grantpipe/db --filter=@grantpipe/api --concurrency=2
turbo test:coverage --filter=@grantpipe/db --filter=@grantpipe/api --concurrency=2
```

Expected: PASS. If coverage misses the 95% per-file bar on any touched file, add focused tests before continuing.

- [ ] **Step 6: Commit any final fixes**

Run:

```powershell
git status --short
```

Expected: clean. If not clean because of legitimate fixes, commit them with a Conventional Commit message.

## Task 11: Run Local Full-App Supabase Verification

**Files:**

- No planned source changes unless verification reveals defects.

- [ ] **Step 1: Start or verify the local Supabase stack**

If using local Supabase CLI/Docker rather than a remote rehearsal target, run:

```powershell
supabase --version
supabase start
supabase status
$env:SUPABASE_MIGRATION_DB_URL = "<local DB URL from supabase status>"
docker ps --filter "name=supabase_db_" --format "table {{.Names}}\t{{.Ports}}"
```

Expected: `supabase status` prints the local DB URL, and Docker shows the
matching `supabase_db_` container and port. Do not hard-code a port from a
previous machine; use the current local stack.

- [ ] **Step 2: Point local app processes at the Supabase rehearsal DB**

Run in the isolated worktree shell:

```powershell
$env:DATABASE_URL = $env:SUPABASE_MIGRATION_DB_URL
Remove-Item Env:\GRANTPIPE_PROD_DATABASE_URL -ErrorAction SilentlyContinue
$env:APP_URL = "http://localhost:5173"
$env:MARKETING_URL = "http://localhost:4321"
```

Expected: local app variables are set in the current shell only, and the production cleanup override is removed so rehearsal DB settings cannot leak into live cleanup. Do not print either connection string.

- [ ] **Step 3: Apply migrations against the rehearsal Supabase DB**

Run:

```powershell
pnpm --filter @grantpipe/db migrate
pnpm exec tsx scripts/db/provider-migration-audit.ts
```

Expected: no pending migration surprises, audit still matches the source snapshot, and no secrets appear in output.

- [ ] **Step 4: Build all deployable apps locally**

Run:

```powershell
turbo build --filter=@grantpipe/api --filter=@grantpipe/web --filter=@grantpipe/site
```

Expected: API, web, and site builds pass with the Supabase-backed DB package.

- [ ] **Step 5: Restart local servers and prove API DB target**

Run after setting the Supabase environment:

```powershell
pnpm dev:server stop all
docker ps --filter "name=supabase_db_" --format "table {{.Names}}\t{{.Ports}}"
pnpm dev:server start all
curl.exe -fsS -H "x-grantpipe-cutover-secret: $env:CUTOVER_DB_HEALTH_SECRET" http://localhost:8787/api/health/db
```

Expected: health reports `status=ok`, `host=127.0.0.1`, and `mode=direct` only
when the Docker port proof matches the local Supabase stack. Stop if it reports
the old Neon host or a default non-Supabase local Postgres target.

- [ ] **Step 6: Run local browser E2E across core flows**

Run:

```powershell
pnpm e2e -- e2e/auth-onboarding.spec.ts
pnpm e2e -- e2e/import-and-grant-flow.spec.ts
pnpm e2e -- e2e/production-funnel.spec.ts
pnpm e2e -- e2e/surface-sweep.spec.ts
pnpm e2e -- e2e/advanced-flows.spec.ts
pnpm e2e -- e2e/deep-flows.spec.ts
```

Expected: PASS. These cover signup/onboarding/session persistence, import, grant creation, billing-intent routing, authenticated route rendering, and deeper CRUD surfaces.

- [ ] **Step 7: Prove E2E writes landed in Supabase**

Run with the local host and port from `supabase status` or the Docker proof:

```powershell
$env:PGPASSWORD = "<local Supabase database password>"
psql -h 127.0.0.1 -p <supabase-db-port> -U postgres -d postgres -c "select count(*) from organizations where name = 'GrantPipe E2E Org';"
```

Expected: count is greater than zero for the current local E2E run. Stop if the
query points at Neon, the default plain local Postgres container, or any
production database.

- [ ] **Step 8: Run local production-stress harness contract tests**

Run:

```powershell
pnpm exec vitest run scripts/auth-boundary-prod-stress.test.ts scripts/billing-settings-prod-stress.test.ts scripts/import-prod-stress.test.ts scripts/documents-prod-stress.test.ts scripts/activity-prod-stress.test.ts
pnpm exec vitest run scripts/accounting-reconciliation-prod-stress.test.ts scripts/program-allocation-prod-stress.test.ts scripts/restriction-rollforward-prod-stress.test.ts scripts/report-builder-prod-stress.test.ts scripts/sample-data-prod-stress.test.ts
pnpm exec vitest run scripts/team-management-prod-stress.test.ts scripts/subrecipient-monitoring-prod-stress.test.ts scripts/award-intake-prod-stress.test.ts scripts/notifications-prod-stress.test.ts scripts/live-e2e-direct-run-guard.test.ts scripts/run-live-e2e.test.ts scripts/prod-e2e-cleanup.test.ts
```

Expected: PASS. The harnesses must still refuse direct production execution outside the cleanup wrapper, redact secrets, and point at current API routes.

- [ ] **Step 9: Run local cleanup dry-run against rehearsal DB**

Run:

```powershell
pnpm e2e:live:cleanup:dry-run
```

Expected: dry-run is able to connect to the Supabase rehearsal DB and reports only removable E2E/test rows. If it still logs "Neon" wording, update `scripts/prod-e2e-cleanup.ts`, `scripts/prod-e2e-cleanup.test.ts`, and `docs/production-e2e-cleanup.md` before continuing.

- [ ] **Step 10: Commit verification-driven fixes**

Run:

```powershell
git status --short
```

Expected: clean. If local verification required fixes, commit them with focused messages before production testing.

## Task 12: Run Pre-Cutover Production Baseline on Current Neon

**Files:**

- No planned source changes.

- [ ] **Step 1: Start a fresh production shell and verify cleanup target**

Open a new PowerShell session before running production cleanup or E2E. Do not reuse the local Supabase rehearsal shell.

Run:

```powershell
Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:\GRANTPIPE_PROD_DATABASE_URL -ErrorAction SilentlyContinue
pnpm e2e:live:cleanup:dry-run
```

Expected: cleanup loads the current production DB from the ignored `.env`; its redacted host is the current production Neon host before cutover. If the redacted host is Supabase or the rehearsal project, stop.

- [ ] **Step 2: Confirm production cleanup is safe before baseline**

Run:

```powershell
pnpm e2e:live:cleanup:dry-run
pnpm e2e:live:cleanup
```

Expected: cleanup removes only known E2E/test data. If PostHog cleanup credentials are missing and candidate IDs exist, stop and configure them before running live tests.

- [ ] **Step 3: Run public production regression**

Run:

```powershell
pnpm run e2e:prod:public -- e2e/public-prod-site.spec.ts
```

Expected: public site pages, pricing CTAs, and public API/lead endpoints pass against current production.

- [ ] **Step 4: Run authenticated production browser baseline**

Run:

```powershell
pnpm run e2e:prod -- e2e/production-funnel.spec.ts
pnpm run e2e:prod:full -- e2e/auth-onboarding.spec.ts
pnpm run e2e:prod:full -- e2e/import-and-grant-flow.spec.ts
pnpm run e2e:prod:full -- e2e/surface-sweep.spec.ts
```

Expected: current Neon-backed production passes. This establishes that any post-cutover failure is caused by the provider migration rather than a pre-existing broken flow.

- [ ] **Step 5: Run production stress baseline**

Run:

```powershell
Get-ChildItem e2e-adhoc -Filter *-prod-stress.mjs |
  Sort-Object Name |
  ForEach-Object {
    pnpm e2e:live -- node $_.FullName
    if ($LASTEXITCODE -ne 0) { throw "production stress baseline failed: $($_.Name)" }
  }
```

Expected: all current production stress harnesses pass. Each command runs through the live cleanup wrapper and leaves no stranded production test rows.

- [ ] **Step 6: Run post-baseline cleanup and record results**

Run:

```powershell
pnpm e2e:live:cleanup:dry-run
pnpm e2e:live:cleanup
```

Expected: no unexpected leftover data. Add a non-secret summary to `docs/operations/neon-to-supabase-runbook.md`:

```md
## Production Baseline Results

- Baseline date: 2026-07-04 pre-cutover partial baseline
- Provider before cutover: Neon retained
- Public production Playwright: passed after fixture refresh
- Authenticated production Playwright: partial; pricing CTA and reusable-account
  billing checks passed, throwaway signup/checkout timed out after sample-data
  onboarding
- Production stress harnesses: not run; blocked behind cleanup and production
  funnel baseline completion
- Cleanup: blocked; dry-run found 1 removable E2E org and 2 PostHog distinct
  IDs, and confirmed cleanup refused to commit without PostHog API credentials
```

- [ ] **Step 7: Commit baseline notes**

Run:

```powershell
git add docs/operations/neon-to-supabase-runbook.md
git commit -m "docs: record neon production baseline"
```

## Task 13: Review, Merge, and Production Cutover

**Files:**

- No planned source changes after review fixes.

- [ ] **Step 1: Get code review**

Use the active Codex runtime's permitted review path. If subagents are unavailable because the runtime tool policy allows subagents only after explicit subagent permission, record that blocker in the final release notes and perform local review.

Review scope:

```text
Review all changes on codex/neon-to-supabase. Focus on provider migration risk, Cloudflare Worker runtime compatibility, secret handling, tests, rollback safety, and any user-facing docs/copy affected by the provider change.
```

- [ ] **Step 2: Fix every review issue**

For each issue:

```powershell
git add <changed-files>
git commit -m "fix: address supabase migration review finding"
```

Expected: no unresolved review findings.

- [ ] **Step 3: Merge to master**

Run:

```powershell
git checkout master
git pull
git merge --no-ff codex/neon-to-supabase
git status --short --branch
```

Expected: merge succeeds and `master` is clean.

- [ ] **Step 4: Push**

Run:

```powershell
git push origin master
```

Expected: push succeeds.

- [ ] **Step 5: Execute production cutover**

Run the runbook exactly:

```powershell
pnpm --filter @grantpipe/api exec wrangler whoami
pnpm --filter @grantpipe/api exec wrangler hyperdrive get 048a27bd483549d2b9def7cf44ce25c3
pnpm --filter @grantpipe/api exec wrangler secret list --env production
pnpm --filter @grantpipe/api exec wrangler secret put MAINTENANCE_MODE --env production
pnpm run deploy:api
.\scripts\db\neon-to-supabase-rehearsal.ps1 -DumpPath .\output\db\neon-to-supabase-final.sql
$env:DATABASE_URL = $env:SUPABASE_MIGRATION_DB_URL
pnpm --filter @grantpipe/api exec wrangler secret put DATABASE_URL --env production
# Create grantpipe-db-supabase Hyperdrive with SUPABASE_DIRECT_DB_URL through Cloudflare Dashboard or a controlled one-time shell.
# Do not update the existing Neon Hyperdrive config in place.
# Update apps/api/wrangler.toml to the new Supabase Hyperdrive ID, commit it, then deploy.
pnpm run deploy:api
```

Expected: API deploy succeeds with `MAINTENANCE_MODE=read_only`, final Neon-vs-Supabase audit matches before writes reopen, the old Neon Hyperdrive ID remains untouched for rollback, and no Supabase connection string is printed in logs or persisted in shell history.

- [ ] **Step 6: Verify immediate production health**

Run:

```powershell
curl.exe -fsS https://app.grantpipe.com/api/health
pnpm exec tsx scripts/db/provider-migration-audit.ts
pnpm run e2e:live:cleanup:dry-run
```

Expected: health returns success, mutating requests still return 503 while read-only maintenance is active, provider audit confirms final Neon and Supabase equality before writes reopen, and cleanup dry-run can connect to the new Supabase production database.

- [ ] **Step 6A: Reopen writes only after equality proof**

Run:

```powershell
pnpm --filter @grantpipe/api exec wrangler secret put MAINTENANCE_MODE --env production
pnpm run deploy:api
```

Expected: set `MAINTENANCE_MODE` to `off`, deploy succeeds, and this timestamp becomes the rollback cutoff. After this point, do not use simple rollback to Neon unless Supabase writes have been reverse-reconciled or explicitly accepted as data loss.

- [ ] **Step 7: Run full post-cutover production browser tests**

Run:

```powershell
pnpm run e2e:prod:public -- e2e/public-prod-site.spec.ts
pnpm run e2e:prod -- e2e/production-funnel.spec.ts
pnpm run e2e:prod:full -- e2e/auth-onboarding.spec.ts
pnpm run e2e:prod:full -- e2e/import-and-grant-flow.spec.ts
pnpm run e2e:prod:full -- e2e/surface-sweep.spec.ts
pnpm run e2e:prod:full -- e2e/advanced-flows.spec.ts
pnpm run e2e:prod:full -- e2e/deep-flows.spec.ts
```

Expected: PASS. These must prove signup/login/session, onboarding, billing routing, imports, grant/fund persistence, authenticated route loading, and deeper app flows work against Supabase in production.

- [ ] **Step 8: Run full post-cutover production stress suite**

Run:

```powershell
Get-ChildItem e2e-adhoc -Filter *-prod-stress.mjs |
  Sort-Object Name |
  ForEach-Object {
    pnpm e2e:live -- node $_.FullName
    if ($LASTEXITCODE -ne 0) { throw "post-cutover production stress failed: $($_.Name)" }
  }
```

Expected: all current production stress harnesses pass. Failures here block completion and trigger either forward-fix or rollback based on the rollback criteria below.

- [ ] **Step 9: Run final cleanup and data audit**

Run:

```powershell
pnpm e2e:live:cleanup:dry-run
pnpm e2e:live:cleanup
pnpm e2e:live:cleanup:dry-run
pnpm exec tsx scripts/db/provider-migration-audit.ts --mode supabase-invariants
```

Expected: first dry-run finds only expected E2E rows, confirmed cleanup succeeds, second dry-run is empty or contains only explicitly preserved reusable E2E account rows, and post-cutover Supabase-only invariants pass. Do not require Neon-vs-Supabase equality after Supabase has accepted writes.

- [ ] **Step 10: Verify observability**

Run concrete checks for the UTC window from the Supabase deploy start through the end of production tests:

```powershell
sentry-cli issues list --org ventora --project grantpipe-api --query "is:unresolved database OR pre-warm OR postgres OR hyperdrive"
pnpm --filter @grantpipe/api exec wrangler tail grantpipe-api --env production --format pretty
```

PostHog check: query GrantPipe project `390138` for the smoke-test distinct IDs/events generated by the production E2E run and confirm the events arrived after cutover. Cloudflare check: observe the next production cron fire (`0 * * * *`) and confirm there are zero new `database.pre-warm failed`, connection, or scheduled job Sentry events in the same UTC window.

- [ ] **Step 11: Record post-cutover production results**

Add a non-secret section to `docs/operations/neon-to-supabase-runbook.md`:

```md
## Supabase Production Cutover Results

- Cutover date: 2026-07-04
- API health: passed
- Provider audit: matched
- Public production Playwright: passed
- Authenticated production Playwright: passed
- Production stress harnesses: passed
- Cleanup: passed
- Sentry database errors after deploy: none observed
- Scheduled job prewarm after deploy: passed
- Git SHA: record the deployed `git rev-parse HEAD`
- Worker deployment ID: record the ID returned by Wrangler after deploy
- Old Hyperdrive ID: 048a27bd483549d2b9def7cf44ce25c3
- New Hyperdrive ID: record the new `grantpipe-db-supabase` Hyperdrive ID
- Redacted runtime DB host and mode: record the Supabase Direct host and `direct-via-hyperdrive`
- Cutover write-freeze start UTC: record the timestamp when `MAINTENANCE_MODE=read_only` was deployed
- Writes reopened UTC / simple rollback cutoff: record the timestamp when `MAINTENANCE_MODE=off` was deployed
- Sentry query window UTC: record the exact start and end timestamps used for the Sentry check
- PostHog project: 390138
- Cleanup counts: record the dry-run and confirmed cleanup row counts
```

Commit it:

```powershell
git add docs/operations/neon-to-supabase-runbook.md
git commit -m "docs: record supabase production cutover verification"
git push origin master
```

- [ ] **Step 12: Deploy affected site/web/docs surfaces**

Run:

```powershell
pnpm run deploy:changed:dry-run
pnpm run deploy:changed
curl.exe -fsS https://grantpipe.com/privacy
```

Expected: deploy targets include API plus any affected site/web surfaces. Privacy/subprocessor copy should only go live after the database cutover is complete so production does not claim Supabase before it is true.

Before this deploy, update `apps/site/src/pages/privacy.astro` from the provider-neutral managed PostgreSQL wording to the final Supabase subprocessor entry, then include that change in the post-cutover verification commit. Do not merge or deploy public privacy copy that names Supabase before `/api/health/db` proves production is active on Supabase.

- [ ] **Step 13: Remove worktree**

Run:

```powershell
git worktree remove .worktrees/neon-to-supabase
git branch -d codex/neon-to-supabase
```

Expected: worktree and branch are removed. If ignored artifacts block removal, boundary-check the path under `.worktrees\neon-to-supabase` before deleting leftovers.

## Rollback Criteria

Rollback immediately if any of these happen after cutover:

- API cannot establish database connections through Supabase or Hyperdrive.
- Better Auth login/signup fails against migrated users.
- Stripe webhook processing fails to write subscription state.
- Row-count audit finds source/target mismatch after final restore.
- Scheduled jobs emit persistent database prewarm or connection failures.
- Public production Playwright fails on routes that passed the pre-cutover baseline.
- Authenticated production E2E fails signup, login, onboarding, import, grant CRUD, billing settings, or authenticated shell rendering after those same flows passed the pre-cutover baseline.
- Production stress harnesses leave stranded data that cleanup cannot remove.

Rollback path:

```powershell
pnpm --filter @grantpipe/api exec wrangler secret put DATABASE_URL --env production
# Restore the previous Neon Hyperdrive ID in apps/api/wrangler.toml; do not mutate the Supabase config in place.
pnpm run deploy:api
curl.exe -fsS https://app.grantpipe.com/api/health
pnpm run e2e:prod -- e2e/production-funnel.spec.ts
pnpm e2e:live:cleanup:dry-run
```

## Self-Review

- Spec coverage: The plan covers code provider swap, migration rehearsal, docs/subprocessor updates, local unit/build/coverage checks, local Supabase-backed full-app E2E, pre-cutover production baseline, post-cutover production browser tests, post-cutover production stress tests, cleanup verification, rollback, review, merge, deploy, and cleanup.
- Placeholder scan: No placeholder markers or undefined future work remains in the task steps.
- Type consistency: `Database`, `TransactionDatabase`, `createDbHandle`, and `HYPERDRIVE` names are consistent with existing code. Supabase is treated as Postgres, not a new application auth/storage provider.
- Risk note: This plan intentionally does not migrate Better Auth to Supabase Auth or R2 to Supabase Storage. Those would be separate migrations with different security and data-retention risk.
