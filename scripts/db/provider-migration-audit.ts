import { pathToFileURL } from "node:url";
import { Client } from "pg";

export type TableInventoryRow = {
  schema: string;
  name: string;
  rowCount: number;
};

export type MigrationRow = {
  id: string;
  checksum?: string;
  appliedAt?: string;
  [key: string]: string | number | boolean | null | undefined;
};

export type ExtensionRow = {
  name: string;
  version?: string;
};

export type CriticalTableChecksum = {
  schema: string;
  table: string;
  checksum: string;
  rowCount?: number;
};

export type ConstraintSummaryRow = {
  schema: string;
  table: string;
  name: string;
  type?: string;
};

export type IndexSummaryRow = {
  schema: string;
  table: string;
  name: string;
  definition?: string;
};

export type TriggerSummaryRow = {
  schema: string;
  table: string;
  name: string;
  timing?: string;
  event?: string;
  statement?: string;
};

export type SequenceSummaryRow = {
  schema: string;
  name: string;
  table: string;
  column: string;
  lastValue: number;
  nextValue: number;
  maxId: number;
};

export type PrivilegeExposureRow = {
  schema: string;
  objectName: string;
  objectType:
    | "schema"
    | "table"
    | "sequence"
    | "function"
    | "default-table"
    | "default-sequence"
    | "default-function";
  grantee: "anon" | "authenticated";
  privilege: string;
};

export type ProviderSnapshot = {
  label: string;
  databaseUrl?: string;
  tables: TableInventoryRow[];
  migrationRows: MigrationRow[];
  extensions: ExtensionRow[];
  checksums: CriticalTableChecksum[];
  constraints: ConstraintSummaryRow[];
  indexes: IndexSummaryRow[];
  triggers: TriggerSummaryRow[];
  sequences: SequenceSummaryRow[];
  privilegeExposure: PrivilegeExposureRow[];
};

export type ProviderMigrationAuditInput = {
  source: ProviderSnapshot;
  target: ProviderSnapshot;
  criticalTables?: string[];
};

export type SupabaseInvariantOptions = {
  requiredExtensions?: string[];
  requiredTables?: string[];
};

export type QueryExecutor = <T extends object = Record<string, unknown>>(
  query: string,
  values?: unknown[],
) => Promise<{ rows: T[] }>;

export type SnapshotCollectionOptions = {
  label: string;
  databaseUrl?: string;
  criticalTables?: string[];
};

const DEFAULT_CRITICAL_TABLES = [
  "public.user",
  "public.account",
  "public.session",
  "public.organizations",
  "public.org_members",
  "public.billing_events",
  "public.grants",
  "public.funds",
  "public.documents",
  "public.import_history",
  "public.activity_log",
];

export function redactDatabaseUrl(value: string | undefined): string | undefined {
  if (!value) {
    return value;
  }

  return value
    .replace(/(postgres(?:ql)?:\/\/[^:\s/@]+:)([^@\s]+)(@)/gi, "$1REDACTED$3")
    .replace(/([?&]password=)[^&\s]+/gi, "$1REDACTED");
}

export function buildProviderMigrationAudit(input: ProviderMigrationAuditInput) {
  return {
    connections: {
      source: redactDatabaseUrl(input.source.databaseUrl),
      target: redactDatabaseUrl(input.target.databaseUrl),
    },
    tableInventory: compareTables(input.source.tables, input.target.tables),
    migrations: compareMigrationRows(input.source.migrationRows, input.target.migrationRows),
    extensions: compareNamedRows(input.source.extensions, input.target.extensions),
    criticalTableChecksums: compareChecksums(
      input.source.checksums,
      input.target.checksums,
      input.criticalTables,
    ),
    constraints: compareObjectSummaries(input.source.constraints, input.target.constraints),
    indexes: compareObjectSummaries(input.source.indexes, input.target.indexes),
    triggers: compareObjectSummaries(input.source.triggers, input.target.triggers),
    sequences: {
      source: input.source.sequences.length,
      target: input.target.sequences.length,
      messages: getSequenceLagMessages(input.target.sequences),
    },
    supabasePrivilegeExposure: input.target.privilegeExposure.map(
      (row) =>
        `${row.grantee} has ${row.privilege} on ${row.objectType} ${row.schema}.${row.objectName}`,
    ),
  };
}

export function auditSupabaseInvariants(
  snapshot: ProviderSnapshot,
  options: SupabaseInvariantOptions = {},
) {
  const extensionNames = new Set(snapshot.extensions.map((row) => row.name));
  const tableNames = new Set(snapshot.tables.map(formatTableName));

  return {
    missingRequiredExtensions: (options.requiredExtensions ?? []).filter(
      (name) => !extensionNames.has(name),
    ),
    missingRequiredTables: (options.requiredTables ?? []).filter((name) => !tableNames.has(name)),
    sequenceMessages: getSequenceLagMessages(snapshot.sequences),
    privilegeExposure: snapshot.privilegeExposure.map(
      (row) =>
        `${row.grantee} has ${row.privilege} on ${row.objectType} ${row.schema}.${row.objectName}`,
    ),
  };
}

export async function collectProviderSnapshot(
  executor: QueryExecutor,
  options: SnapshotCollectionOptions,
): Promise<ProviderSnapshot> {
  const tables = await collectTableInventory(executor);
  const checksums = await collectCriticalTableChecksums(
    executor,
    options.criticalTables ?? DEFAULT_CRITICAL_TABLES,
    new Set(tables.map(formatTableName)),
  );

  return {
    label: options.label,
    databaseUrl: options.databaseUrl,
    tables,
    migrationRows: await collectMigrationRows(executor),
    extensions: await collectExtensions(executor),
    checksums,
    constraints: await collectConstraints(executor),
    indexes: await collectIndexes(executor),
    triggers: await collectTriggers(executor),
    sequences: await collectSequences(executor),
    privilegeExposure: await collectPrivilegeExposure(executor),
  };
}

export async function collectProviderSnapshotFromUrl(
  options: Required<Pick<SnapshotCollectionOptions, "label" | "databaseUrl">> &
    Pick<SnapshotCollectionOptions, "criticalTables">,
): Promise<ProviderSnapshot> {
  const client = new Client({ connectionString: options.databaseUrl });
  await client.connect();
  try {
    return await collectProviderSnapshot((query, values) => client.query(query, values), options);
  } finally {
    await client.end();
  }
}

export function hasBlockingAuditFindings(audit: ReturnType<typeof buildProviderMigrationAudit>) {
  return (
    audit.tableInventory.missingInTarget.length > 0 ||
    audit.tableInventory.missingInSource.length > 0 ||
    audit.tableInventory.rowCountMismatches.length > 0 ||
    audit.migrations.missingInTarget.length > 0 ||
    audit.migrations.missingInSource.length > 0 ||
    audit.migrations.changedRows.length > 0 ||
    audit.criticalTableChecksums.missingInTarget.length > 0 ||
    audit.criticalTableChecksums.missingInSource.length > 0 ||
    audit.criticalTableChecksums.mismatches.length > 0 ||
    audit.constraints.missingInTarget.length > 0 ||
    audit.constraints.missingInSource.length > 0 ||
    audit.constraints.changedRows.length > 0 ||
    audit.indexes.missingInTarget.length > 0 ||
    audit.indexes.missingInSource.length > 0 ||
    audit.indexes.changedRows.length > 0 ||
    audit.triggers.missingInTarget.length > 0 ||
    audit.triggers.missingInSource.length > 0 ||
    audit.triggers.changedRows.length > 0 ||
    audit.sequences.messages.length > 0 ||
    audit.supabasePrivilegeExposure.length > 0
  );
}

async function collectTableInventory(executor: QueryExecutor): Promise<TableInventoryRow[]> {
  const result = await executor<{ schema: string; name: string; rowCount: string }>(`
    select
      table_schema as "schema",
      table_name as "name",
      (xpath(
        '/row/c/text()',
        query_to_xml(
          format('select count(*) as c from %I.%I', table_schema, table_name),
          false,
          true,
          ''
        )
      ))[1]::text::bigint as "rowCount"
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
    order by table_schema, table_name
  `);

  return result.rows.map((row) => ({
    schema: row.schema,
    name: row.name,
    rowCount: Number(row.rowCount),
  }));
}

async function collectMigrationRows(executor: QueryExecutor): Promise<MigrationRow[]> {
  const tables = await executor<{ tableSchema: string; tableName: string }>(`
    select table_schema as "tableSchema", table_name as "tableName"
    from information_schema.tables
    where table_schema in ('drizzle', 'public')
      and table_name in ('__drizzle_migrations', 'drizzle_migrations')
    order by case when table_schema = 'drizzle' then 0 else 1 end, table_name
    limit 1
  `);
  const migrationTable = tables.rows[0];
  if (!migrationTable) return [];

  const result = await executor<Record<string, string | number | boolean | null>>(
    `select * from ${quotedIdentifier(migrationTable.tableSchema)}.${quotedIdentifier(
      migrationTable.tableName,
    )} order by 1`,
  );

  return result.rows.map((row, index) => ({
    id: String(row.id ?? row.hash ?? row.name ?? row.idx ?? index),
    ...row,
  }));
}

async function collectExtensions(executor: QueryExecutor): Promise<ExtensionRow[]> {
  const result = await executor<{ name: string; version: string }>(`
    select extname as "name", extversion as "version"
    from pg_extension
    order by extname
  `);
  return result.rows;
}

async function collectCriticalTableChecksums(
  executor: QueryExecutor,
  criticalTables: string[],
  existingTables: Set<string>,
): Promise<CriticalTableChecksum[]> {
  const rows: CriticalTableChecksum[] = [];

  for (const tableName of criticalTables.filter((table) => existingTables.has(table))) {
    const [schema, table] = tableName.split(".");
    if (!schema || !table) continue;

    const result = await executor<{ checksum: string; rowCount: string }>(
      `
        select
          coalesce(md5(string_agg(md5(row_to_json(source_row)::text), '' order by md5(row_to_json(source_row)::text))), '') as "checksum",
          count(*)::text as "rowCount"
        from ${quotedIdentifier(schema)}.${quotedIdentifier(table)} as source_row
      `,
    );
    rows.push({
      schema,
      table,
      checksum: result.rows[0]?.checksum ?? "",
      rowCount: Number(result.rows[0]?.rowCount ?? "0"),
    });
  }

  return rows;
}

async function collectConstraints(executor: QueryExecutor): Promise<ConstraintSummaryRow[]> {
  const result = await executor<ConstraintSummaryRow>(`
    select
      namespace.nspname as "schema",
      class.relname as "table",
      case
        when constraint_row.contype = 'n' then
          format(
            '%s_not_null',
            array_to_string(
              array(
                select attribute.attname
                from unnest(constraint_row.conkey) with ordinality as key(attnum, ordinality)
                join pg_attribute attribute
                  on attribute.attrelid = constraint_row.conrelid
                 and attribute.attnum = key.attnum
                order by key.ordinality
              ),
              '_'
            )
          )
        else constraint_row.conname
      end as "name",
      case constraint_row.contype
        when 'c' then 'CHECK'
        when 'f' then 'FOREIGN KEY'
        when 'n' then 'NOT NULL'
        when 'p' then 'PRIMARY KEY'
        when 'u' then 'UNIQUE'
        when 'x' then 'EXCLUDE'
        else constraint_row.contype::text
      end as "type"
    from pg_constraint constraint_row
    join pg_class class
      on class.oid = constraint_row.conrelid
    join pg_namespace namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
    order by namespace.nspname, class.relname, "name"
  `);
  return result.rows;
}

async function collectIndexes(executor: QueryExecutor): Promise<IndexSummaryRow[]> {
  const result = await executor<IndexSummaryRow>(`
    select
      schemaname as "schema",
      tablename as "table",
      indexname as "name",
      indexdef as "definition"
    from pg_indexes
    where schemaname = 'public'
    order by schemaname, tablename, indexname
  `);
  return result.rows;
}

async function collectTriggers(executor: QueryExecutor): Promise<TriggerSummaryRow[]> {
  const result = await executor<TriggerSummaryRow>(`
    select
      event_object_schema as "schema",
      event_object_table as "table",
      trigger_name as "name",
      action_timing as "timing",
      event_manipulation as "event",
      action_statement as "statement"
    from information_schema.triggers
    where event_object_schema = 'public'
    order by event_object_schema, event_object_table, trigger_name, event_manipulation
  `);
  return result.rows;
}

async function collectSequences(executor: QueryExecutor): Promise<SequenceSummaryRow[]> {
  const result = await executor<{
    schema: string;
    name: string;
    table: string;
    column: string;
    lastValue: string;
    nextValue: string;
    maxId: string;
  }>(`
    with sequence_columns as (
      select
        sequence_namespace.nspname as sequence_schema,
        sequence_class.relname as sequence_name,
        table_namespace.nspname as table_schema,
        table_class.relname as table_name,
        table_attribute.attname as column_name,
        pg_sequences.last_value,
        pg_sequences.start_value,
        pg_sequences.increment_by
      from pg_class sequence_class
      join pg_namespace sequence_namespace
        on sequence_namespace.oid = sequence_class.relnamespace
      join pg_depend dependency
        on dependency.objid = sequence_class.oid
       and dependency.deptype in ('a', 'i')
      join pg_class table_class
        on table_class.oid = dependency.refobjid
      join pg_namespace table_namespace
        on table_namespace.oid = table_class.relnamespace
      join pg_attribute table_attribute
        on table_attribute.attrelid = table_class.oid
       and table_attribute.attnum = dependency.refobjsubid
      join pg_sequences
        on pg_sequences.schemaname = sequence_namespace.nspname
       and pg_sequences.sequencename = sequence_class.relname
      where sequence_class.relkind = 'S'
        and sequence_namespace.nspname = 'public'
        and table_namespace.nspname = 'public'
    )
    select
      sequence_schema as "schema",
      sequence_name as "name",
      table_name as "table",
      column_name as "column",
      coalesce(last_value, start_value)::text as "lastValue",
      (coalesce(last_value, start_value) + increment_by)::text as "nextValue",
      coalesce(
        (xpath(
          '/row/m/text()',
          query_to_xml(
            format('select max(%I) as m from %I.%I', column_name, table_schema, table_name),
            false,
            true,
            ''
          )
        ))[1]::text::bigint,
        0
      )::text as "maxId"
    from sequence_columns
    order by sequence_schema, sequence_name
  `);

  return result.rows.map((row) => ({
    schema: row.schema,
    name: row.name,
    table: row.table,
    column: row.column,
    lastValue: Number(row.lastValue),
    nextValue: Number(row.nextValue),
    maxId: Number(row.maxId),
  }));
}

async function collectPrivilegeExposure(executor: QueryExecutor): Promise<PrivilegeExposureRow[]> {
  const result = await executor<PrivilegeExposureRow>(`
    with exposed_roles(grantee) as (
      select role.rolname
      from pg_roles role
      where role.rolname in ('anon', 'authenticated')
    ),
    table_privileges(privilege) as (
      values
        ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
        ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
    ),
    sequence_privileges(privilege) as (
      values ('USAGE'), ('SELECT'), ('UPDATE')
    ),
    function_privileges(privilege) as (
      values ('EXECUTE')
    ),
    schema_privileges(privilege) as (
      values ('USAGE'), ('CREATE')
    ),
    default_acl_exposure as (
      select
        coalesce(default_namespace.nspname, 'global') as "schema",
        case default_acl.defaclobjtype
          when 'r' then 'future tables'
          when 'S' then 'future sequences'
          when 'f' then 'future functions'
          else 'future objects'
        end as "objectName",
        case default_acl.defaclobjtype
          when 'r' then 'default-table'
          when 'S' then 'default-sequence'
          when 'f' then 'default-function'
          else 'default-table'
        end as "objectType",
        case
          when acl.grantee = 0 then exposed_roles.grantee
          else grantee_role.rolname
        end as grantee,
        acl.privilege_type as "privilege"
      from pg_default_acl default_acl
      left join pg_namespace default_namespace
        on default_namespace.oid = default_acl.defaclnamespace
      join pg_roles owner_role
        on owner_role.oid = default_acl.defaclrole
      cross join lateral aclexplode(default_acl.defaclacl) acl
      left join pg_roles grantee_role
        on grantee_role.oid = acl.grantee
      join exposed_roles
        on acl.grantee = 0
        or grantee_role.rolname = exposed_roles.grantee
      where default_acl.defaclobjtype in ('r', 'S', 'f')
        and (default_namespace.nspname is null or default_namespace.nspname = 'public')
        and owner_role.rolname <> 'supabase_admin'
    )
    select
      namespace.nspname as "schema",
      namespace.nspname as "objectName",
      'schema' as "objectType",
      exposed_roles.grantee,
      schema_privileges.privilege as "privilege"
    from pg_namespace namespace
    cross join exposed_roles
    cross join schema_privileges
    where namespace.nspname = 'public'
      and has_schema_privilege(exposed_roles.grantee, namespace.oid, schema_privileges.privilege)
    union all
    select
      namespace.nspname as "schema",
      class.relname as "objectName",
      'table' as "objectType",
      exposed_roles.grantee,
      table_privileges.privilege as "privilege"
    from pg_class class
    join pg_namespace namespace
      on namespace.oid = class.relnamespace
    cross join exposed_roles
    cross join table_privileges
    where namespace.nspname = 'public'
      and class.relkind in ('r', 'p', 'v', 'm', 'f')
      and has_table_privilege(exposed_roles.grantee, class.oid, table_privileges.privilege)
    union all
    select
      namespace.nspname as "schema",
      class.relname as "objectName",
      'sequence' as "objectType",
      exposed_roles.grantee,
      sequence_privileges.privilege as "privilege"
    from pg_class class
    join pg_namespace namespace
      on namespace.oid = class.relnamespace
    cross join exposed_roles
    cross join sequence_privileges
    where namespace.nspname = 'public'
      and class.relkind = 'S'
      and has_sequence_privilege(exposed_roles.grantee, class.oid, sequence_privileges.privilege)
    union all
    select
      namespace.nspname as "schema",
      procedure.proname as "objectName",
      'function' as "objectType",
      exposed_roles.grantee,
      function_privileges.privilege as "privilege"
    from pg_proc procedure
    join pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    left join pg_depend extension_dependency
      on extension_dependency.objid = procedure.oid
     and extension_dependency.deptype = 'e'
    left join pg_extension extension
      on extension.oid = extension_dependency.refobjid
    cross join exposed_roles
    cross join function_privileges
    where namespace.nspname = 'public'
      and extension.oid is null
      and has_function_privilege(exposed_roles.grantee, procedure.oid, function_privileges.privilege)
    union all
    select * from default_acl_exposure
    order by "schema", "objectName", grantee, "privilege"
  `);

  return result.rows;
}

function compareTables(source: TableInventoryRow[], target: TableInventoryRow[]) {
  const sourceMap = mapRows(source, formatTableName);
  const targetMap = mapRows(target, formatTableName);
  const sharedNames = [...sourceMap.keys()].filter((name) => targetMap.has(name));

  return {
    sourceCount: source.length,
    targetCount: target.length,
    missingInTarget: diffKeys(sourceMap, targetMap),
    missingInSource: diffKeys(targetMap, sourceMap),
    rowCountMismatches: sharedNames
      .map((table) => {
        const sourceRow = sourceMap.get(table);
        const targetRow = targetMap.get(table);

        if (!sourceRow || !targetRow || sourceRow.rowCount === targetRow.rowCount) {
          return undefined;
        }

        return {
          table,
          source: sourceRow.rowCount,
          target: targetRow.rowCount,
        };
      })
      .filter(isDefined),
  };
}

function compareMigrationRows(source: MigrationRow[], target: MigrationRow[]) {
  const sourceMap = mapRows(source, (row) => row.id);
  const targetMap = mapRows(target, (row) => row.id);
  const sharedIds = [...sourceMap.keys()].filter((id) => targetMap.has(id));

  return {
    sourceCount: source.length,
    targetCount: target.length,
    missingInTarget: diffKeys(sourceMap, targetMap),
    missingInSource: diffKeys(targetMap, sourceMap),
    changedRows: sharedIds
      .map((id) => {
        const sourceRow = sourceMap.get(id);
        const targetRow = targetMap.get(id);

        if (!sourceRow || !targetRow || stableStringify(sourceRow) === stableStringify(targetRow)) {
          return undefined;
        }

        return {
          id,
          source: sourceRow,
          target: targetRow,
        };
      })
      .filter(isDefined),
  };
}

function compareNamedRows(source: ExtensionRow[], target: ExtensionRow[]) {
  const sourceMap = mapRows(source, (row) => row.name);
  const targetMap = mapRows(target, (row) => row.name);

  return {
    sourceCount: source.length,
    targetCount: target.length,
    missingInTarget: diffKeys(sourceMap, targetMap),
    missingInSource: diffKeys(targetMap, sourceMap),
  };
}

function compareChecksums(
  source: CriticalTableChecksum[],
  target: CriticalTableChecksum[],
  criticalTables: string[] = [],
) {
  const sourceMap = mapRows(source, formatChecksumTableName);
  const targetMap = mapRows(target, formatChecksumTableName);
  const selectedTables =
    criticalTables.length > 0
      ? criticalTables
      : [...sourceMap.keys()].filter((table) => targetMap.has(table));

  return {
    checkedTables: selectedTables,
    missingInTarget: selectedTables.filter((table) => !targetMap.has(table)),
    missingInSource: selectedTables.filter((table) => !sourceMap.has(table)),
    mismatches: selectedTables
      .map((table) => {
        const sourceRow = sourceMap.get(table);
        const targetRow = targetMap.get(table);

        if (!sourceRow || !targetRow || sourceRow.checksum === targetRow.checksum) {
          return undefined;
        }

        return {
          table,
          source: sourceRow,
          target: targetRow,
        };
      })
      .filter(isDefined),
  };
}

function compareObjectSummaries<
  T extends ConstraintSummaryRow | IndexSummaryRow | TriggerSummaryRow,
>(source: T[], target: T[]) {
  const sourceMap = mapRows(source, formatObjectSummaryName);
  const targetMap = mapRows(target, formatObjectSummaryName);
  const sharedKeys = [...sourceMap.keys()].filter((key) => targetMap.has(key)).sort();

  return {
    source: source.length,
    target: target.length,
    missingInTarget: diffKeys(sourceMap, targetMap),
    missingInSource: diffKeys(targetMap, sourceMap),
    changedRows: sharedKeys
      .map((name) => {
        const sourceRow = sourceMap.get(name);
        const targetRow = targetMap.get(name);

        if (
          !sourceRow ||
          !targetRow ||
          objectSummaryFingerprint(sourceRow) === objectSummaryFingerprint(targetRow)
        ) {
          return undefined;
        }

        return {
          name,
          source: sourceRow,
          target: targetRow,
        };
      })
      .filter(isDefined),
  };
}

function getSequenceLagMessages(sequences: SequenceSummaryRow[]): string[] {
  return sequences
    .filter((sequence) => sequence.nextValue <= sequence.maxId)
    .map(
      (sequence) =>
        `${sequence.schema}.${sequence.name} next value is not above target max(id): ` +
        `${sequence.nextValue} <= ${sequence.maxId} for ` +
        `${sequence.schema}.${sequence.table}.${sequence.column}`,
    );
}

function mapRows<T>(rows: T[], getKey: (row: T) => string): Map<string, T> {
  return new Map(rows.map((row) => [getKey(row), row]));
}

function quotedIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function diffKeys<T>(left: Map<string, T>, right: Map<string, T>): string[] {
  return [...left.keys()].filter((key) => !right.has(key)).sort();
}

function formatTableName(row: TableInventoryRow): string {
  return `${row.schema}.${row.name}`;
}

function formatChecksumTableName(row: CriticalTableChecksum): string {
  return `${row.schema}.${row.table}`;
}

function formatObjectSummaryName(
  row: ConstraintSummaryRow | IndexSummaryRow | TriggerSummaryRow,
): string {
  return `${row.schema}.${row.table}.${row.name}`;
}

function objectSummaryFingerprint(
  row: ConstraintSummaryRow | IndexSummaryRow | TriggerSummaryRow,
): string {
  if ("definition" in row) {
    return JSON.stringify({ definition: row.definition ?? "" });
  }

  if ("type" in row) {
    return JSON.stringify({ type: row.type ?? "" });
  }

  return JSON.stringify({
    event: row.event ?? "",
    statement: row.statement ?? "",
    timing: row.timing ?? "",
  });
}

function stableStringify(row: MigrationRow): string {
  const keys = Object.keys(row).sort();
  const ordered: Record<string, string | number | boolean | null | undefined> = {};

  for (const key of keys) {
    ordered[key] = row[key];
  }

  return JSON.stringify(ordered);
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

export function isNeonDatabaseUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname.endsWith(".neon.tech");
  } catch {
    return false;
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

export async function runCli({
  argv = process.argv,
  env = process.env,
  scriptUrl = import.meta.url,
  log = console.log,
  logError = console.error,
  exit = process.exit,
}: {
  argv?: string[];
  env?: Record<string, string | undefined>;
  scriptUrl?: string;
  log?: (message: string) => void;
  logError?: (message: unknown) => void;
  exit?: (code: number) => void;
} = {}): Promise<void> {
  if (scriptUrl !== pathToFileURL(argv[1] ?? "").href) return;

  const mode = argv.includes("--mode") ? argv[argv.indexOf("--mode") + 1] : "compare";
  if (mode !== "compare" && mode !== "supabase-invariants") {
    logError(`Unsupported provider migration audit mode: ${mode}`);
    exit(1);
    return;
  }
  const targetUrl = env.SUPABASE_MIGRATION_DB_URL;
  if (!targetUrl) {
    logError("SUPABASE_MIGRATION_DB_URL is required.");
    exit(1);
    return;
  }
  if (!isSupabaseDatabaseUrl(targetUrl)) {
    logError("SUPABASE_MIGRATION_DB_URL must point to a Supabase database host.");
    exit(1);
    return;
  }

  try {
    if (mode === "compare") {
      const sourceUrl = env.OLD_DB_URL;
      if (!sourceUrl) {
        logError("OLD_DB_URL and SUPABASE_MIGRATION_DB_URL are required for compare mode.");
        exit(1);
        return;
      }
      if (!isNeonDatabaseUrl(sourceUrl)) {
        logError("OLD_DB_URL must point to a Neon database host.");
        exit(1);
        return;
      }
    }

    const target = await collectProviderSnapshotFromUrl({
      label: "supabase",
      databaseUrl: targetUrl,
    });

    if (mode === "supabase-invariants") {
      const invariants = auditSupabaseInvariants(target, {
        requiredExtensions: ["pgcrypto"],
        requiredTables: ["public.organizations", "public.user", "public.account"],
      });
      log(
        JSON.stringify(
          {
            target: { ...target, databaseUrl: redactDatabaseUrl(target.databaseUrl) },
            invariants,
          },
          null,
          2,
        ),
      );
      if (
        invariants.missingRequiredExtensions.length > 0 ||
        invariants.missingRequiredTables.length > 0 ||
        invariants.sequenceMessages.length > 0 ||
        invariants.privilegeExposure.length > 0
      ) {
        exit(1);
      }
      return;
    }

    const sourceUrl = env.OLD_DB_URL;
    if (!sourceUrl) {
      logError("OLD_DB_URL and SUPABASE_MIGRATION_DB_URL are required for compare mode.");
      exit(1);
      return;
    }

    const source = await collectProviderSnapshotFromUrl({
      label: "neon",
      databaseUrl: sourceUrl,
    });
    const audit = buildProviderMigrationAudit({ source, target });
    log(
      JSON.stringify(
        {
          source: { ...source, databaseUrl: redactDatabaseUrl(source.databaseUrl) },
          target: { ...target, databaseUrl: redactDatabaseUrl(target.databaseUrl) },
          audit,
        },
        null,
        2,
      ),
    );
    if (hasBlockingAuditFindings(audit)) {
      exit(1);
    }
  } catch (error) {
    logError(error instanceof Error ? error.message : error);
    exit(1);
  }
}

void runCli();
