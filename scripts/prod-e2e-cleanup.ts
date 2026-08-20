import { execFileSync } from "node:child_process";
import { basename, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Pool } from "pg";

import { loadRootDotEnv } from "./lib/local-env";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CORE_TABLES = new Set([
  "account",
  "entity_members",
  "entities",
  "org_members",
  "organizations",
  "session",
  "trial_email_schedule",
  "user",
  "verification",
]);
const MAX_DELETE_PASSES = 8;
const POSTHOG_BULK_DELETE_LIMIT = 1000;

type EnvLike = Record<string, string | undefined>;
type QueryResult = { rows: Array<Record<string, unknown>> };

export type CleanupExecutor = (query: string, values?: unknown[]) => Promise<QueryResult>;
export type StorageObjectDeleter = (keys: string[]) => Promise<void>;

export type CleanupConfig = {
  databaseUrl: string;
  confirmed: boolean;
  dryRun: boolean;
  reusableEmail?: string;
  reusableOrgName?: string;
  reviewedPostHogPersonIds: string[];
  postHog: PostHogCleanupConfig;
};

export type CleanupSummary = {
  removableUserIds: string[];
  preservedUserIds: string[];
  removableOrgIds: string[];
  preservedOrgIds: string[];
  deletedTables: string[];
  deletedStorageObjectKeys: string[];
  postHogCleanup?: PostHogCleanupResult;
};

export type PostHogCleanupConfig = {
  enabled: boolean;
  host?: string;
  projectId?: string;
  personalApiKey?: string;
};

export type PostHogCleanupResult = {
  attempted: boolean;
  candidateIds: string[];
  candidateDistinctIds: string[];
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function pnpmExecutableForPlatform(platform = process.platform): string {
  return platform === "win32" ? "pnpm.cmd" : "pnpm";
}

export function shouldRunPnpmThroughShell(platform = process.platform): boolean {
  return platform === "win32";
}

type CleanupTable = {
  tableName: string;
  hasOrgId: boolean;
  hasUserId: boolean;
};

type ForeignKeyLink = {
  childTable: string;
  childColumn: string;
  parentTable: string;
  parentColumn: string;
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function quotedIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function stringValues(rows: Array<Record<string, unknown>>, key: string): string[] {
  return rows.map((row) => asString(row[key])).filter((value): value is string => Boolean(value));
}

function hasFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag);
}

function flagValue(argv: string[], flag: string): string | undefined {
  const equalsPrefix = `${flag}=`;
  const equalsValue = argv.find((arg) => arg.startsWith(equalsPrefix));
  if (equalsValue) return equalsValue.slice(equalsPrefix.length);

  const flagIndex = argv.indexOf(flag);
  if (flagIndex >= 0) return argv[flagIndex + 1];

  return undefined;
}

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function loadCleanupEnv(env: EnvLike): void {
  const loaded = loadRootDotEnv({ env, rootDir: REPO_ROOT });
  const worktreesDir = dirname(REPO_ROOT);
  if (Object.keys(loaded).length === 0 && basename(worktreesDir) === ".worktrees") {
    loadRootDotEnv({ env, rootDir: dirname(worktreesDir) });
  }
}

export function isSupabaseDatabaseUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname.endsWith(".supabase.co") || hostname.endsWith(".supabase.com");
  } catch {
    return false;
  }
}

function assertExpectedProductionProviderTarget(env: EnvLike, databaseUrl: string): void {
  if (env.EXPECTED_PROD_DB_PROVIDER?.toLowerCase() !== "supabase") {
    return;
  }
  if (!env.GRANTPIPE_PROD_DATABASE_URL) {
    throw new Error(
      "GRANTPIPE_PROD_DATABASE_URL is required when EXPECTED_PROD_DB_PROVIDER=supabase.",
    );
  }
  if (!isSupabaseDatabaseUrl(databaseUrl)) {
    throw new Error("Production E2E cleanup target must be a Supabase database URL.");
  }
}

export function buildCleanupConfig({
  argv = process.argv.slice(2),
  env = process.env,
}: {
  argv?: string[];
  env?: EnvLike;
} = {}): CleanupConfig {
  loadCleanupEnv(env);

  const databaseUrl = env.GRANTPIPE_PROD_DATABASE_URL ?? env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL or GRANTPIPE_PROD_DATABASE_URL is required for E2E cleanup.");
  }
  if (
    env.SUPABASE_MIGRATION_DB_URL &&
    databaseUrl.trim() === env.SUPABASE_MIGRATION_DB_URL.trim()
  ) {
    throw new Error("Refusing to use SUPABASE_MIGRATION_DB_URL for production E2E cleanup.");
  }
  assertExpectedProductionProviderTarget(env, databaseUrl);

  const confirmed = hasFlag(argv, "--yes");
  const dryRun = hasFlag(argv, "--dry-run");
  if (!confirmed && !dryRun) {
    throw new Error("Refusing to clean production data without --yes or --dry-run.");
  }

  const reusableEmail = env.GRANTPIPE_E2E_EMAIL?.trim().toLowerCase();
  const reusableOrgName = env.GRANTPIPE_E2E_ORG_NAME?.trim();
  if (!reusableEmail || !reusableOrgName) {
    throw new Error("GRANTPIPE_E2E_EMAIL and GRANTPIPE_E2E_ORG_NAME are required for cleanup.");
  }
  const reviewedPostHogPersonIds = parseList(
    flagValue(argv, "--posthog-person-ids") ?? env.POSTHOG_REVIEWED_PERSON_IDS,
  );

  return {
    databaseUrl,
    confirmed,
    dryRun,
    reusableEmail,
    reusableOrgName,
    reviewedPostHogPersonIds,
    postHog: buildPostHogCleanupConfig(env),
  };
}

function buildPostHogCleanupConfig(env: EnvLike): PostHogCleanupConfig {
  const personalApiKey = env.POSTHOG_PERSONAL_API_KEY?.trim();
  const projectId = (env.POSTHOG_PROJECT_ID ?? env.POSTHOG_ENVIRONMENT_ID)?.trim();
  const host = (env.POSTHOG_APP_HOST ?? "https://us.posthog.com").trim();

  return {
    enabled: Boolean(personalApiKey && projectId),
    host,
    projectId,
    personalApiKey,
  };
}

async function selectE2EUsers(
  executor: CleanupExecutor,
  reusableEmail?: string,
): Promise<Array<{ id: string; email: string }>> {
  const result = await executor(
    `
    select "id", lower("email") as "email"
    from "user"
    where lower("email") like 'e2e-%@grantpipe.test'
      or lower("email") like 'grantpipe.e2e%@%'
      or lower("email") like 'angel+e2e-%@grantpipe.com'
      or lower("email") like 'e2e-%@example.com'
      or lower("email") like '%@grantpipe.test'
      or lower("email") like 'test-paywall-%@grantpipe.com'
      or lower("email") like 'codex-prod-%@mailinator.com'
      or lower("email") like 'operator+pw%@ventoralabs.com'
      or lower("email") like 'operator.smoketest+%@ventoralabs.com'
      or lower("email") like 'smoke-auth-%@ventoralabs.com'
      or lower("email") like 'ads-test+grantpipe-%@ventoralabs.com'
      or lower("email") like 'operator+canary-%@ventoralabs.com'
      or lower("email") like 'operator+grantpipe-canary-%@ventoralabs.com'
      or lower("email") like 'operator+grantpipe-posthog-%@ventoralabs.com'
      or lower("email") like 'operator+grantpipe-url-trace-%@ventoralabs.com'
      or lower("email") like 'operator+grantpipe-nettrace-%@ventoralabs.com'
      or lower("email") like 'codex-smoke-%@example.com'
      or lower("email") like 'codex-tail-%@example.com'
      or lower("email") like 'codex-repro-%@example.com'
      or lower("email") like 'gp-verify-%@example.com'
      or lower("email") = 'operator+test@ventoralabs.com'
      or "name" ilike 'GrantPipe E2E%'
      or "name" ilike '%Production E2E%'
      or "name" ilike '%Sweep E2E%'
      or "name" ilike 'Ventora Ads Test%'
      or "name" ilike 'Playwright Signup Check%'
      or "name" ilike 'Codex Auth Check%'
      or "name" ilike 'Codex Smoke%'
      or "name" ilike 'Codex Tail%'
      or "name" ilike 'Codex Repro%'
      or "name" ilike 'GrantPipe Verify%'
      ${reusableEmail ? `or lower("email") = ${"$1"}` : ""}
  `,
    reusableEmail ? [reusableEmail] : [],
  );

  return result.rows
    .map((row) => {
      const id = asString(row.id);
      const email = asString(row.email);
      return id && email ? { id, email } : null;
    })
    .filter((row): row is { id: string; email: string } => row !== null);
}

async function selectE2EOrgs(
  executor: CleanupExecutor,
  userIds: string[],
  {
    includeMarkerNames,
  }: {
    includeMarkerNames: boolean;
  },
): Promise<string[]> {
  const result = await executor(
    `
      select distinct o."id"
      from "organizations" o
      left join "org_members" m on m."org_id" = o."id"
      where ${
        includeMarkerNames
          ? `o."name" ilike 'GrantPipe E2E%'
        or o."slug" like 'grantpipe-e2e%'
        or o."name" ilike '%Production E2E%'
        or o."slug" like '%production-e2e%'
        or o."name" ilike 'GrantPipe Sweep%'
        or o."slug" like 'sweep-e2e%'
        or o."name" ilike 'Test Paywall%'
        or o."slug" like 'test-paywall%'
        or o."name" ilike 'Ventora Ads Test%'
        or o."slug" like 'ventora-ads-test-%'
        or o."name" ilike 'GrantPipe%Canary''s Organization'
        or o."name" ilike 'Ventora Canary''s Organization'
        or o."name" ilike 'Angel Canary''s Organization'
        or o."name" ilike 'Codex Smoke%'
        or o."slug" like 'codex-smoke-%'
        or o."name" ilike 'GrantPipe Verify%'
        or o."slug" like 'gp-verify-%'
        or`
          : ""
      }
        m."user_id" = any($1::text[])
    `,
    [userIds],
  );

  return stringValues(result.rows, "id");
}

async function selectPreservedE2EOrgs(
  executor: CleanupExecutor,
  reusableOrgName?: string,
): Promise<string[]> {
  if (!reusableOrgName) return [];

  const result = await executor(
    `
      select distinct o."id"
      from "organizations" o
      where o."name" = $1
    `,
    [reusableOrgName],
  );

  return stringValues(result.rows, "id");
}

async function selectUsersForOrgs(executor: CleanupExecutor, orgIds: string[]): Promise<string[]> {
  if (orgIds.length === 0) return [];

  const result = await executor(
    `
      select distinct "user_id" as "id"
      from "org_members"
      where "org_id" = any($1::text[])
    `,
    [orgIds],
  );

  return stringValues(result.rows, "id");
}

async function selectGeneratedReportFileKeys(
  executor: CleanupExecutor,
  orgIds: string[],
): Promise<string[]> {
  if (orgIds.length === 0) return [];

  const result = await executor(
    `
      select "file_key" as "fileKey"
      from "generated_reports"
      where "org_id" = any($1::text[])
    `,
    [orgIds],
  );

  return stringValues(result.rows, "fileKey");
}

async function selectDocumentFileKeys(
  executor: CleanupExecutor,
  orgIds: string[],
): Promise<string[]> {
  if (orgIds.length === 0) return [];

  const result = await executor(
    `
      select "file_key" as "fileKey"
      from "documents"
      where "org_id" = any($1::text[])
    `,
    [orgIds],
  );

  return stringValues(result.rows, "fileKey");
}

function buildWranglerStorageObjectDeleter(env: EnvLike = process.env): StorageObjectDeleter {
  const bucket = env.CLOUDFLARE_R2_BUCKET ?? "grantpipe-documents";
  return async (keys) => {
    for (const key of keys) {
      execFileSync(
        pnpmExecutableForPlatform(),
        [
          "--filter",
          "@grantpipe/api",
          "exec",
          "wrangler",
          "r2",
          "object",
          "delete",
          `${bucket}/${key}`,
          "--remote",
        ],
        { cwd: REPO_ROOT, shell: shouldRunPnpmThroughShell(), stdio: "inherit" },
      );
    }
  };
}

async function selectCleanupTables(executor: CleanupExecutor): Promise<CleanupTable[]> {
  const result = await executor(`
    select
      table_name as "tableName",
      bool_or(column_name = 'org_id') as "hasOrgId",
      bool_or(column_name = 'user_id') as "hasUserId"
    from information_schema.columns
    where table_schema = 'public'
      and column_name in ('org_id', 'user_id')
    group by table_name
    order by table_name
  `);

  return result.rows
    .map((row) => {
      const tableName = asString(row.tableName);
      if (!tableName) return null;
      return {
        tableName,
        hasOrgId: row.hasOrgId === true,
        hasUserId: row.hasUserId === true,
      };
    })
    .filter((row): row is CleanupTable => row !== null);
}

async function selectForeignKeyLinks(executor: CleanupExecutor): Promise<ForeignKeyLink[]> {
  const result = await executor(`
    select
      child_table.relname as "childTable",
      child_column.attname as "childColumn",
      parent_table.relname as "parentTable",
      parent_column.attname as "parentColumn"
    from pg_constraint constraint_info
    join pg_class child_table on child_table.oid = constraint_info.conrelid
    join pg_namespace child_namespace on child_namespace.oid = child_table.relnamespace
    join pg_class parent_table on parent_table.oid = constraint_info.confrelid
    join pg_namespace parent_namespace on parent_namespace.oid = parent_table.relnamespace
    join unnest(constraint_info.conkey) with ordinality child_key(attnum, ordinality) on true
    join unnest(constraint_info.confkey) with ordinality parent_key(attnum, ordinality)
      on parent_key.ordinality = child_key.ordinality
    join pg_attribute child_column
      on child_column.attrelid = child_table.oid
      and child_column.attnum = child_key.attnum
    join pg_attribute parent_column
      on parent_column.attrelid = parent_table.oid
      and parent_column.attnum = parent_key.attnum
    where constraint_info.contype = 'f'
      and child_namespace.nspname = 'public'
      and parent_namespace.nspname = 'public'
      and cardinality(constraint_info.conkey) = 1
      and cardinality(constraint_info.confkey) = 1
  `);

  return result.rows
    .map((row) => {
      const childTable = asString(row.childTable);
      const childColumn = asString(row.childColumn);
      const parentTable = asString(row.parentTable);
      const parentColumn = asString(row.parentColumn);
      return childTable && childColumn && parentTable && parentColumn
        ? { childTable, childColumn, parentTable, parentColumn }
        : null;
    })
    .filter((row): row is ForeignKeyLink => row !== null);
}

function directCondition(table: CleanupTable, orgIds: string[], userIds: string[]): string | null {
  if (table.hasOrgId && orgIds.length > 0) {
    return `"org_id" = any($1::text[])`;
  }
  if (!table.hasOrgId && table.hasUserId && userIds.length > 0) {
    return `"user_id" = any($2::text[])`;
  }
  return null;
}

function buildDeleteConditions({
  tables,
  foreignKeys,
  orgIds,
  userIds,
}: {
  tables: CleanupTable[];
  foreignKeys: ForeignKeyLink[];
  orgIds: string[];
  userIds: string[];
}): Map<string, string> {
  const conditions = new Map<string, string>();
  if (orgIds.length > 0) {
    conditions.set("organizations", `"id" = any($1::text[])`);
  }

  for (const table of tables) {
    const condition = directCondition(table, orgIds, userIds);
    if (condition) {
      conditions.set(table.tableName, condition);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;

    for (const link of foreignKeys) {
      const parentCondition = conditions.get(link.parentTable);
      if (!parentCondition) continue;

      const childCondition = `${quotedIdentifier(link.childColumn)} in (select ${quotedIdentifier(
        link.parentColumn,
      )} from ${quotedIdentifier(link.parentTable)} where ${parentCondition})`;
      if (!conditions.has(link.childTable)) {
        conditions.set(link.childTable, childCondition);
        changed = true;
      } else if (link.parentTable === "organizations") {
        const currentCondition = conditions.get(link.childTable) ?? "";
        if (!currentCondition.includes(childCondition)) {
          conditions.set(link.childTable, `(${currentCondition}) or (${childCondition})`);
          changed = true;
        }
      }
    }
  }

  return conditions;
}

async function tryDelete(
  executor: CleanupExecutor,
  query: string,
  values: unknown[],
  dryRun: boolean,
): Promise<boolean> {
  if (dryRun) return true;

  try {
    await executor(query, values);
    return true;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "23503"
    ) {
      return false;
    }
    throw error;
  }
}

async function deleteMarkedRows({
  executor,
  tables,
  foreignKeys,
  orgIds,
  userIds,
  dryRun,
}: {
  executor: CleanupExecutor;
  tables: CleanupTable[];
  foreignKeys: ForeignKeyLink[];
  orgIds: string[];
  userIds: string[];
  dryRun: boolean;
}): Promise<string[]> {
  const conditions = buildDeleteConditions({ tables, foreignKeys, orgIds, userIds });
  const pending = new Map(
    [...conditions.entries()]
      .filter(([tableName]) => !CORE_TABLES.has(tableName))
      .map(([tableName, condition]) => [tableName, condition]),
  );
  const deletedTables: string[] = [];

  for (let pass = 0; pass < MAX_DELETE_PASSES && pending.size > 0; pass += 1) {
    let progress = false;

    for (const [tableName, condition] of [...pending.entries()]) {
      const normalizedCondition =
        condition.includes("$2") && !condition.includes("$1")
          ? `($1::text[] is not null) and (${condition})`
          : condition;
      const deleted = await tryDelete(
        executor,
        `delete from ${quotedIdentifier(tableName)} where ${normalizedCondition}`,
        normalizedCondition.includes("$2") ? [orgIds, userIds] : [orgIds],
        dryRun,
      );
      if (deleted) {
        deletedTables.push(tableName);
        pending.delete(tableName);
        progress = true;
      }
    }

    if (!progress) break;
  }

  if (pending.size > 0) {
    throw new Error(
      `Could not delete E2E rows due to remaining foreign-key dependencies: ${[
        ...pending.keys(),
      ].join(", ")}`,
    );
  }

  return deletedTables;
}

async function deleteKnownDonorRows(
  executor: CleanupExecutor,
  orgIds: string[],
  dryRun: boolean,
): Promise<string[]> {
  if (dryRun || orgIds.length === 0) return [];

  const queries: Array<{ tableName: string; query: string }> = [
    {
      tableName: "communication_log",
      query: `delete from "communication_log" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "contact_tags",
      query: `delete from "contact_tags" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "volunteer_hours",
      query: `delete from "volunteer_hours" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "event_attendees",
      query: `
        delete from "event_attendees"
        where "contact_id" in (select "id" from "contacts" where "org_id" = any($1::text[]))
           or "donation_id" in (select "id" from "donations" where "org_id" = any($1::text[]))
      `,
    },
    {
      tableName: "pledge_payments",
      query: `delete from "pledge_payments" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "pledge_installments",
      query: `delete from "pledge_installments" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "pledges",
      query: `delete from "pledges" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "restriction_additions",
      query: `delete from "restriction_additions" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "restriction_balances",
      query: `delete from "restriction_balances" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "restriction_evidence_links",
      query: `delete from "restriction_evidence_links" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "restriction_releases",
      query: `delete from "restriction_releases" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "restriction_allowed_categories",
      query: `delete from "restriction_allowed_categories" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "restriction_allowed_programs",
      query: `delete from "restriction_allowed_programs" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "restriction_terms",
      query: `delete from "restriction_terms" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "subrecipient_corrective_actions",
      query: `delete from "subrecipient_corrective_actions" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "subrecipient_findings",
      query: `delete from "subrecipient_findings" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "subrecipient_monitoring_logs",
      query: `delete from "subrecipient_monitoring_logs" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "subrecipient_monitoring_tasks",
      query: `delete from "subrecipient_monitoring_tasks" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "subrecipient_risk_assessments",
      query: `delete from "subrecipient_risk_assessments" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "subawards",
      query: `delete from "subawards" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "subrecipients",
      query: `delete from "subrecipients" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "grant_opportunity_actions",
      query: `delete from "grant_opportunity_actions" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "funder_contacts",
      query: `delete from "funder_contacts" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "generated_reports",
      query: `delete from "generated_reports" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "grant_reporting_requirements",
      query: `delete from "grant_reporting_requirements" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "grant_closeout_items",
      query: `delete from "grant_closeout_items" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "grant_federal_award_metadata",
      query: `delete from "grant_federal_award_metadata" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "grant_budget_line_allocations",
      query: `delete from "grant_budget_line_allocations" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "planned_expenses",
      query: `delete from "planned_expenses" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "grant_budget_amendments",
      query: `delete from "grant_budget_amendments" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "grant_budget_lines",
      query: `delete from "grant_budget_lines" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "grant_budget_periods",
      query: `delete from "grant_budget_periods" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "grant_budget_versions",
      query: `delete from "grant_budget_versions" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "program_budget_lines",
      query: `delete from "program_budget_lines" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "program_budgets",
      query: `delete from "program_budgets" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "expense_program_allocations",
      query: `delete from "expense_program_allocations" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "program_impact_metric_links",
      query: `delete from "program_impact_metric_links" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "program_reporting_requirement_links",
      query: `delete from "program_reporting_requirement_links" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "grant_program_allocations",
      query: `delete from "grant_program_allocations" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "document_extraction_sources",
      query: `delete from "document_extraction_sources" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "document_extraction_actions",
      query: `delete from "document_extraction_actions" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "document_extraction_fields",
      query: `delete from "document_extraction_fields" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "document_extractions",
      query: `delete from "document_extractions" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "custom_field_values",
      query: `
        delete from "custom_field_values"
        where "entity_id" in (select "id" from "contacts" where "org_id" = any($1::text[]))
           or "entity_id" in (select "id" from "donations" where "org_id" = any($1::text[]))
           or "entity_id" in (select "id" from "grants" where "org_id" = any($1::text[]))
           or "entity_id" in (select "id" from "funds" where "org_id" = any($1::text[]))
           or "entity_id" in (select "id" from "funders" where "org_id" = any($1::text[]))
      `,
    },
    {
      tableName: "grant_payments",
      query: `delete from "grant_payments" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "grant_payment_request_adjustments",
      query: `delete from "grant_payment_request_adjustments" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "grant_payment_request_lines",
      query: `delete from "grant_payment_request_lines" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "grant_payment_requests",
      query: `delete from "grant_payment_requests" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "expenses",
      query: `delete from "expenses" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "impact_metric_entries",
      query: `
        delete from "impact_metric_entries"
        where "metric_id" in (
          select "id" from "grant_impact_metrics" where "org_id" = any($1::text[])
        )
      `,
    },
    {
      tableName: "outcome_indicators",
      query: `delete from "outcome_indicators" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "outcome_goals",
      query: `delete from "outcome_goals" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "grant_impact_metrics",
      query: `delete from "grant_impact_metrics" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "grant_fund_allocations",
      query: `
        delete from "grant_fund_allocations"
        where "grant_id" in (select "id" from "grants" where "org_id" = any($1::text[]))
           or "fund_id" in (select "id" from "funds" where "org_id" = any($1::text[]))
      `,
    },
    {
      tableName: "donations",
      query: `delete from "donations" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "contacts",
      query: `delete from "contacts" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "grants",
      query: `delete from "grants" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "funds",
      query: `delete from "funds" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "funders",
      query: `delete from "funders" where "org_id" = any($1::text[])`,
    },
    {
      tableName: "programs",
      query: `delete from "programs" where "org_id" = any($1::text[])`,
    },
  ];

  const deletedTables: string[] = [];
  for (const { tableName, query } of queries) {
    await executor(query, [orgIds]);
    deletedTables.push(tableName);
  }

  return deletedTables;
}

export async function cleanupGrantPipeE2EData({
  executor,
  dryRun,
  reusableEmail,
  reusableOrgName,
  deleteStorageObjects,
  deferStorageObjectDeletion,
}: {
  executor: CleanupExecutor;
  dryRun: boolean;
  reusableEmail?: string;
  reusableOrgName?: string;
  deleteStorageObjects?: StorageObjectDeleter;
  deferStorageObjectDeletion?: boolean;
}): Promise<CleanupSummary> {
  const users = await selectE2EUsers(executor, reusableEmail);
  const preservedUserIds = users
    .filter((row) => reusableEmail && row.email === reusableEmail)
    .map((row) => row.id);
  const markerUserIds = users
    .filter((row) => !preservedUserIds.includes(row.id))
    .map((row) => row.id);
  const orgIds = await selectE2EOrgs(executor, markerUserIds, { includeMarkerNames: true });
  const preservedOrgIds = await selectPreservedE2EOrgs(executor, reusableOrgName);
  const removableOrgIds = orgIds.filter((id) => !preservedOrgIds.includes(id));
  const removableUserIds = [
    ...new Set([...markerUserIds, ...(await selectUsersForOrgs(executor, removableOrgIds))]),
  ].filter((id) => !preservedUserIds.includes(id));
  const tables = await selectCleanupTables(executor);
  const foreignKeys = await selectForeignKeyLinks(executor);
  const generatedReportFileKeys = await selectGeneratedReportFileKeys(executor, removableOrgIds);
  const documentFileKeys = await selectDocumentFileKeys(executor, removableOrgIds);
  const storageObjectKeys = [...new Set([...generatedReportFileKeys, ...documentFileKeys])];
  const deletedTables: string[] = [];
  const deletedStorageObjectKeys =
    !dryRun && (deleteStorageObjects || deferStorageObjectDeletion) ? storageObjectKeys : [];

  deletedTables.push(...(await deleteKnownDonorRows(executor, removableOrgIds, dryRun)));
  deletedTables.push(
    ...(await deleteMarkedRows({
      executor,
      tables,
      foreignKeys,
      orgIds: removableOrgIds,
      userIds: removableUserIds,
      dryRun,
    })),
  );

  if (!dryRun && removableOrgIds.length > 0) {
    await executor(
      `update "organizations" set "default_entity_id" = null where "id" = any($1::text[])`,
      [removableOrgIds],
    );
    await executor(`delete from "documents" where "org_id" = any($1::text[])`, [removableOrgIds]);
    await executor(`delete from "fiscal_periods" where "org_id" = any($1::text[])`, [
      removableOrgIds,
    ]);
    await executor(`delete from "chart_of_accounts" where "org_id" = any($1::text[])`, [
      removableOrgIds,
    ]);
    await executor(`delete from "activity_log" where "org_id" = any($1::text[])`, [
      removableOrgIds,
    ]);
    await executor(`delete from "contacts" where "org_id" = any($1::text[])`, [removableOrgIds]);
    await executor(`delete from "entity_members" where "org_id" = any($1::text[])`, [
      removableOrgIds,
    ]);
    await executor(`delete from "entities" where "org_id" = any($1::text[])`, [removableOrgIds]);
    await executor(`delete from "org_members" where "org_id" = any($1::text[])`, [removableOrgIds]);
    await executor(`delete from "trial_email_schedule" where "org_id" = any($1::text[])`, [
      removableOrgIds,
    ]);
    await executor(`delete from "organizations" where "id" = any($1::text[])`, [removableOrgIds]);
  }

  if (!dryRun && removableUserIds.length > 0) {
    await executor(`delete from "session" where "user_id" = any($1::text[])`, [removableUserIds]);
    await executor(`delete from "account" where "user_id" = any($1::text[])`, [removableUserIds]);
    await executor(`delete from "verification" where "identifier" = any($1::text[])`, [
      users.filter((row) => removableUserIds.includes(row.id)).map((row) => row.email),
    ]);
    await executor(`delete from "user" where "id" = any($1::text[])`, [removableUserIds]);
  }

  if (deletedStorageObjectKeys.length > 0 && deleteStorageObjects && !deferStorageObjectDeletion) {
    await deleteStorageObjects(deletedStorageObjectKeys);
  }

  return {
    removableUserIds,
    preservedUserIds,
    removableOrgIds,
    preservedOrgIds,
    deletedTables,
    deletedStorageObjectKeys,
  };
}

export function formatPostCommitStorageCleanupError(keys: string[], error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(
    [
      "Storage cleanup failed after DB commit.",
      `Keys: ${keys.join(", ")}`,
      `Cause: ${message}`,
    ].join(" "),
  );
}

export async function cleanupWithDatabase(config: CleanupConfig): Promise<CleanupSummary> {
  const pool = new Pool({ connectionString: config.databaseUrl, max: 1 });
  const deleteStorageObjects = buildWranglerStorageObjectDeleter();

  try {
    await pool.query("begin");
    const summary = await cleanupGrantPipeE2EData({
      executor: async (query, values = []) => {
        const result = await pool.query(query, values);
        return { rows: result.rows as Array<Record<string, unknown>> };
      },
      dryRun: config.dryRun,
      reusableEmail: config.reusableEmail,
      reusableOrgName: config.reusableOrgName,
      deleteStorageObjects,
      deferStorageObjectDeletion: true,
    });
    if (config.dryRun) {
      summary.postHogCleanup = await runPostHogCleanup({
        config: config.postHog,
        summary,
        reviewedPersonIds: config.reviewedPostHogPersonIds,
        dryRun: true,
      });
      await pool.query("rollback");
    } else {
      summary.postHogCleanup = await runPostHogCleanup({
        config: config.postHog,
        summary,
        reviewedPersonIds: config.reviewedPostHogPersonIds,
        dryRun: false,
      });
      await pool.query("commit");
      if (summary.deletedStorageObjectKeys.length > 0) {
        try {
          await deleteStorageObjects(summary.deletedStorageObjectKeys);
        } catch (error) {
          throw formatPostCommitStorageCleanupError(summary.deletedStorageObjectKeys, error);
        }
      }
    }
    return summary;
  } catch (error) {
    await pool.query("rollback");
    throw error;
  } finally {
    await pool.end();
  }
}

export function buildPostHogBulkDeleteRequest({
  removableUserIds,
  preservedUserIds,
  removableOrgIds,
  preservedOrgIds,
  reviewedPersonIds = [],
}: {
  removableUserIds: string[];
  preservedUserIds: string[];
  removableOrgIds: string[];
  preservedOrgIds: string[];
  reviewedPersonIds?: string[];
}): {
  ids: string[];
  distinct_ids: string[];
  delete_events: true;
  delete_recordings: true;
} {
  const preserved = new Set([...preservedUserIds, ...preservedOrgIds]);
  const distinctIds = [...new Set([...removableUserIds, ...removableOrgIds])].filter(
    (id) => !preserved.has(id),
  );

  return {
    ids: [...new Set(reviewedPersonIds)],
    distinct_ids: distinctIds,
    delete_events: true,
    delete_recordings: true,
  };
}

function chunkIds(ids: string[]): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += POSTHOG_BULK_DELETE_LIMIT) {
    chunks.push(ids.slice(index, index + POSTHOG_BULK_DELETE_LIMIT));
  }
  return chunks;
}

function normalizePostHogAppHost(host: string): string {
  return host.replace(/\/+$/, "");
}

export async function runPostHogCleanup({
  config,
  summary,
  reviewedPersonIds = [],
  dryRun,
  fetchFn = fetch,
}: {
  config: PostHogCleanupConfig;
  summary: CleanupSummary;
  reviewedPersonIds?: string[];
  dryRun: boolean;
  fetchFn?: FetchLike;
}): Promise<PostHogCleanupResult> {
  const request = buildPostHogBulkDeleteRequest({
    removableUserIds: summary.removableUserIds,
    preservedUserIds: summary.preservedUserIds,
    removableOrgIds: summary.removableOrgIds,
    preservedOrgIds: summary.preservedOrgIds,
    reviewedPersonIds,
  });
  const candidateCount = request.ids.length + request.distinct_ids.length;
  if (candidateCount === 0) {
    return { attempted: false, candidateIds: [], candidateDistinctIds: [] };
  }
  if (dryRun) {
    return {
      attempted: false,
      candidateIds: request.ids,
      candidateDistinctIds: request.distinct_ids,
    };
  }
  if (!config.enabled || !config.host || !config.projectId || !config.personalApiKey) {
    // PostHog credentials are optional. Without them we skip the PostHog purge and
    // let the database cleanup proceed rather than aborting the whole run (the throw
    // used to happen inside the open transaction, so it rolled back the DB cleanup
    // too). The candidate ids are still reported so the leftover PostHog persons can
    // be purged later if the keys are ever provided.
    console.warn(
      `Skipping PostHog cleanup: POSTHOG_PERSONAL_API_KEY / POSTHOG_PROJECT_ID not set. ${candidateCount} candidate PostHog id(s) left in place; database cleanup continues.`,
    );
    return {
      attempted: false,
      candidateIds: request.ids,
      candidateDistinctIds: request.distinct_ids,
    };
  }

  for (const ids of chunkIds(request.ids)) {
    const response = await fetchFn(
      `${normalizePostHogAppHost(config.host)}/api/projects/${config.projectId}/persons/bulk_delete/`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.personalApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...request,
          ids,
          distinct_ids: [],
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`PostHog cleanup failed: ${response.status} ${await response.text()}`);
    }
  }

  for (const distinctIds of chunkIds(request.distinct_ids)) {
    const response = await fetchFn(
      `${normalizePostHogAppHost(config.host)}/api/projects/${config.projectId}/persons/bulk_delete/`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.personalApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...request,
          ids: [],
          distinct_ids: distinctIds,
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`PostHog cleanup failed: ${response.status} ${await response.text()}`);
    }
  }

  return {
    attempted: true,
    candidateIds: request.ids,
    candidateDistinctIds: request.distinct_ids,
  };
}

export async function runCli({
  argv = process.argv,
  scriptUrl = import.meta.url,
  log = console.log,
  logError = console.error,
  exit = process.exit,
}: {
  argv?: string[];
  scriptUrl?: string;
  log?: (message: string) => void;
  logError?: (message: unknown) => void;
  exit?: (code: number) => void;
} = {}): Promise<void> {
  if (scriptUrl !== pathToFileURL(argv[1] ?? "").href) return;

  try {
    const summary = await cleanupWithDatabase(buildCleanupConfig({ argv: argv.slice(2) }));
    const postHogStatus = summary.postHogCleanup
      ? summary.postHogCleanup.attempted
        ? `PostHog deleted person IDs: ${summary.postHogCleanup.candidateIds.length}; distinct IDs: ${summary.postHogCleanup.candidateDistinctIds.length}.`
        : `PostHog cleanup not attempted; candidate person IDs: ${summary.postHogCleanup.candidateIds.length}; distinct IDs: ${summary.postHogCleanup.candidateDistinctIds.length}.`
      : "PostHog cleanup not evaluated.";
    log(
      [
        `GrantPipe production E2E cleanup ${summary.deletedTables.length ? "ran" : "found no rows"}.`,
        `Removed orgs: ${summary.removableOrgIds.length}.`,
        `Deleted storage objects: ${summary.deletedStorageObjectKeys.length}.`,
        `Preserved reusable orgs: ${summary.preservedOrgIds.length}.`,
        postHogStatus,
      ].join(" "),
    );
  } catch (error) {
    logError(error instanceof Error ? error.message : error);
    exit(1);
  }
}

void runCli();
