import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  auditSupabaseInvariants,
  buildProviderMigrationAudit,
  collectProviderSnapshot,
  hasBlockingAuditFindings,
  isNeonDatabaseUrl,
  isSupabaseDatabaseUrl,
  redactDatabaseUrl,
  runCli,
  type QueryExecutor,
} from "./provider-migration-audit";

const sourceSnapshot = {
  label: "neon",
  databaseUrl:
    "postgres://grantpipe:neon-secret@ep-example.us-east-2.aws.neon.tech/grantpipe?sslmode=require",
  tables: [
    { schema: "public", name: "donors", rowCount: 10 },
    { schema: "public", name: "grants", rowCount: 4 },
    { schema: "public", name: "neon_only", rowCount: 1 },
  ],
  migrationRows: [
    { id: "0001_initial", checksum: "aaa", appliedAt: "2026-01-01T00:00:00Z" },
    { id: "0002_billing", checksum: "bbb", appliedAt: "2026-01-02T00:00:00Z" },
    { id: "0003_reports", checksum: "ccc", appliedAt: "2026-01-03T00:00:00Z" },
  ],
  extensions: [
    { name: "pgcrypto", version: "1.3" },
    { name: "uuid-ossp", version: "1.1" },
  ],
  checksums: [
    { schema: "public", table: "donors", checksum: "donors-ok", rowCount: 10 },
    { schema: "public", table: "grants", checksum: "grants-old", rowCount: 4 },
  ],
  constraints: [{ schema: "public", table: "donors", name: "donors_pkey", type: "PRIMARY KEY" }],
  indexes: [{ schema: "public", table: "donors", name: "donors_pkey", definition: "btree (id)" }],
  triggers: [{ schema: "public", table: "donors", name: "donors_updated_at" }],
  sequences: [
    {
      schema: "public",
      name: "donors_id_seq",
      table: "donors",
      column: "id",
      lastValue: 12,
      nextValue: 13,
      maxId: 10,
    },
  ],
  privilegeExposure: [],
};

const targetSnapshot = {
  label: "supabase",
  databaseUrl:
    "postgresql://postgres:target-secret@db.supabase.co:5432/postgres?password=query-secret",
  tables: [
    { schema: "public", name: "donors", rowCount: 9 },
    { schema: "public", name: "grants", rowCount: 4 },
    { schema: "public", name: "supabase_only", rowCount: 2 },
  ],
  migrationRows: [
    { id: "0001_initial", checksum: "aaa", appliedAt: "2026-01-01T00:00:00Z" },
    { id: "0002_billing", checksum: "changed", appliedAt: "2026-01-02T00:00:00Z" },
    { id: "0004_storage", checksum: "ddd", appliedAt: "2026-01-04T00:00:00Z" },
  ],
  extensions: [
    { name: "pgcrypto", version: "1.3" },
    { name: "pg_stat_statements", version: "1.11" },
  ],
  checksums: [
    { schema: "public", table: "donors", checksum: "donors-ok", rowCount: 9 },
    { schema: "public", table: "grants", checksum: "grants-new", rowCount: 4 },
  ],
  constraints: [
    { schema: "public", table: "donors", name: "donors_pkey", type: "UNIQUE" },
    { schema: "public", table: "grants", name: "grants_org_id_fkey", type: "FOREIGN KEY" },
  ],
  indexes: [
    { schema: "public", table: "donors", name: "donors_pkey", definition: "btree (id, org_id)" },
    { schema: "public", table: "grants", name: "grants_org_id_idx", definition: "btree (org_id)" },
  ],
  triggers: [],
  sequences: [
    {
      schema: "public",
      name: "donors_id_seq",
      table: "donors",
      column: "id",
      lastValue: 8,
      nextValue: 9,
      maxId: 10,
    },
  ],
  privilegeExposure: [
    {
      schema: "public",
      objectName: "organizations",
      objectType: "table",
      grantee: "anon",
      privilege: "SELECT",
    },
  ],
};

describe("redactDatabaseUrl", () => {
  it("redacts passwords from authority and query parameters", () => {
    expect(redactDatabaseUrl(targetSnapshot.databaseUrl)).toBe(
      "postgresql://postgres:REDACTED@db.supabase.co:5432/postgres?password=REDACTED",
    );
    expect(redactDatabaseUrl("DATABASE_URL=postgres://user:s3cr3t@localhost/db")).not.toContain(
      "s3cr3t",
    );
  });
});

describe("buildProviderMigrationAudit", () => {
  it("compares provider snapshots without leaking database passwords", () => {
    const audit = buildProviderMigrationAudit({
      source: sourceSnapshot,
      target: targetSnapshot,
      criticalTables: ["public.donors", "public.grants"],
    });

    expect(JSON.stringify(audit)).not.toContain("neon-secret");
    expect(JSON.stringify(audit)).not.toContain("target-secret");
    expect(JSON.stringify(audit)).not.toContain("query-secret");
    expect(audit.connections).toEqual({
      source: sourceSnapshot.databaseUrl.replace("neon-secret", "REDACTED"),
      target: "postgresql://postgres:REDACTED@db.supabase.co:5432/postgres?password=REDACTED",
    });

    expect(audit.tableInventory.missingInTarget).toEqual(["public.neon_only"]);
    expect(audit.tableInventory.missingInSource).toEqual(["public.supabase_only"]);
    expect(audit.tableInventory.rowCountMismatches).toEqual([
      { table: "public.donors", source: 10, target: 9 },
    ]);

    expect(audit.migrations.missingInTarget).toEqual(["0003_reports"]);
    expect(audit.migrations.missingInSource).toEqual(["0004_storage"]);
    expect(audit.migrations.changedRows).toEqual([
      {
        id: "0002_billing",
        source: sourceSnapshot.migrationRows[1],
        target: targetSnapshot.migrationRows[1],
      },
    ]);

    expect(audit.extensions.missingInTarget).toEqual(["uuid-ossp"]);
    expect(audit.extensions.missingInSource).toEqual(["pg_stat_statements"]);
    expect(audit.criticalTableChecksums.mismatches).toEqual([
      {
        table: "public.grants",
        source: sourceSnapshot.checksums[1],
        target: targetSnapshot.checksums[1],
      },
    ]);

    expect(audit.constraints).toEqual({
      source: 1,
      target: 2,
      missingInTarget: [],
      missingInSource: ["public.grants.grants_org_id_fkey"],
      changedRows: [
        {
          name: "public.donors.donors_pkey",
          source: sourceSnapshot.constraints[0],
          target: targetSnapshot.constraints[0],
        },
      ],
    });
    expect(audit.indexes).toEqual({
      source: 1,
      target: 2,
      missingInTarget: [],
      missingInSource: ["public.grants.grants_org_id_idx"],
      changedRows: [
        {
          name: "public.donors.donors_pkey",
          source: sourceSnapshot.indexes[0],
          target: targetSnapshot.indexes[0],
        },
      ],
    });
    expect(audit.triggers).toEqual({
      source: 1,
      target: 0,
      missingInTarget: ["public.donors.donors_updated_at"],
      missingInSource: [],
      changedRows: [],
    });

    expect(audit.sequences.messages).toContain(
      "public.donors_id_seq next value is not above target max(id): 9 <= 10 for public.donors.id",
    );
    expect(audit.supabasePrivilegeExposure).toEqual([
      "anon has SELECT on table public.organizations",
    ]);
    expect(hasBlockingAuditFindings(audit)).toBe(true);
  });
});

describe("object summary drift", () => {
  it("collects stable not-null constraint names instead of oid-derived names", () => {
    const source = readFileSync(
      join(process.cwd(), "scripts/db/provider-migration-audit.ts"),
      "utf8",
    );

    expect(source).toContain("when constraint_row.contype = 'n'");
    expect(source).toContain("'%s_not_null'");
    expect(source).toContain("array_to_string");
    expect(source).toContain("join pg_attribute attribute");
    expect(source).toContain("when 'n' then 'NOT NULL'");
  });

  it("does not block on Supabase-owned extension and default ACL exposure", () => {
    const source = readFileSync(
      join(process.cwd(), "scripts/db/provider-migration-audit.ts"),
      "utf8",
    );

    expect(source).toContain("owner_role.rolname <> 'supabase_admin'");
    expect(source).toContain("left join pg_depend extension_dependency");
    expect(source).toContain("left join pg_extension extension");
    expect(source).toContain("and extension.oid is null");
  });

  it("blocks same-name trigger behavior changes", () => {
    const audit = buildProviderMigrationAudit({
      source: {
        ...sourceSnapshot,
        triggers: [
          {
            schema: "public",
            table: "donors",
            name: "donors_updated_at",
            timing: "BEFORE",
            event: "UPDATE",
            statement: "execute function set_updated_at()",
          },
        ],
      },
      target: {
        ...sourceSnapshot,
        triggers: [
          {
            schema: "public",
            table: "donors",
            name: "donors_updated_at",
            timing: "AFTER",
            event: "UPDATE",
            statement: "execute function set_updated_at()",
          },
        ],
      },
    });

    expect(audit.triggers.changedRows).toEqual([
      {
        name: "public.donors.donors_updated_at",
        source: {
          schema: "public",
          table: "donors",
          name: "donors_updated_at",
          timing: "BEFORE",
          event: "UPDATE",
          statement: "execute function set_updated_at()",
        },
        target: {
          schema: "public",
          table: "donors",
          name: "donors_updated_at",
          timing: "AFTER",
          event: "UPDATE",
          statement: "execute function set_updated_at()",
        },
      },
    ]);
    expect(hasBlockingAuditFindings(audit)).toBe(true);
  });
});

describe("auditSupabaseInvariants", () => {
  it("checks Supabase-only invariants without a Neon snapshot", () => {
    const audit = auditSupabaseInvariants(targetSnapshot, {
      requiredExtensions: ["pgcrypto", "uuid-ossp"],
      requiredTables: ["public.donors", "public.organizations"],
    });

    expect(audit.missingRequiredExtensions).toEqual(["uuid-ossp"]);
    expect(audit.missingRequiredTables).toEqual(["public.organizations"]);
    expect(audit.sequenceMessages).toEqual([
      "public.donors_id_seq next value is not above target max(id): 9 <= 10 for public.donors.id",
    ]);
    expect(audit.privilegeExposure).toEqual(["anon has SELECT on table public.organizations"]);
  });
});

describe("collectProviderSnapshot", () => {
  it("collects provider audit facts from a Postgres executor", async () => {
    const queries: string[] = [];
    const executor: QueryExecutor = async (query) => {
      queries.push(query);
      if (query.includes("from information_schema.tables") && query.includes("rowCount")) {
        return {
          rows: [
            { schema: "public", name: "organizations", rowCount: "2" },
            { schema: "public", name: "activity_log", rowCount: "5" },
          ],
        };
      }
      if (query.includes("from information_schema.tables") && query.includes("tableSchema")) {
        return { rows: [{ tableSchema: "drizzle", tableName: "__drizzle_migrations" }] };
      }
      if (query.includes('"drizzle"."__drizzle_migrations"')) {
        return {
          rows: [
            { id: 1, hash: "aaa", created_at: "2026-07-04T00:00:00.000Z" },
            { id: 2, hash: "bbb", created_at: "2026-07-04T00:01:00.000Z" },
          ],
        };
      }
      if (query.includes("from pg_extension")) {
        return { rows: [{ name: "pgcrypto", version: "1.3" }] };
      }
      if (query.includes("from pg_constraint")) {
        return {
          rows: [
            {
              schema: "public",
              table: "organizations",
              name: "organizations_pkey",
              type: "PRIMARY KEY",
            },
          ],
        };
      }
      if (query.includes("from pg_indexes")) {
        return {
          rows: [
            {
              schema: "public",
              table: "organizations",
              name: "organizations_pkey",
              definition: "btree (id)",
            },
          ],
        };
      }
      if (query.includes("from information_schema.triggers")) {
        return {
          rows: [
            {
              schema: "public",
              table: "organizations",
              name: "updated_at",
              timing: "BEFORE",
              event: "UPDATE",
              statement: "execute function update_timestamp()",
            },
          ],
        };
      }
      if (query.includes("from information_schema.sequences")) {
        throw new Error("sequence audit must use pg_catalog dependencies");
      }
      if (query.includes("pg_depend") && !query.includes("has_function_privilege")) {
        return {
          rows: [
            {
              schema: "public",
              name: "organizations_id_seq",
              table: "organizations",
              column: "id",
              lastValue: "10",
              nextValue: "11",
              maxId: "9",
            },
          ],
        };
      }
      if (query.includes("role_table_grants")) {
        throw new Error("privilege audit must use pg_catalog effective privilege checks");
      }
      if (query.includes("has_function_privilege")) {
        return {
          rows: [
            {
              schema: "public",
              objectName: "organizations",
              objectType: "table",
              grantee: "authenticated",
              privilege: "SELECT",
            },
            {
              schema: "public",
              objectName: "future functions",
              objectType: "default-function",
              grantee: "anon",
              privilege: "EXECUTE",
            },
          ],
        };
      }
      if (query.includes('from "public"."organizations"')) {
        return { rows: [{ checksum: "org-checksum", rowCount: "2" }] };
      }
      if (query.includes('from "public"."activity_log"')) {
        return { rows: [{ checksum: "activity-checksum", rowCount: "5" }] };
      }
      throw new Error(`Unhandled query: ${query}`);
    };

    const snapshot = await collectProviderSnapshot(executor, {
      label: "supabase",
      databaseUrl: "postgres://postgres:secret@db.supabase.co/postgres",
      criticalTables: ["public.organizations", "public.activity_log", "public.missing"],
    });

    expect(snapshot.tables).toEqual([
      { schema: "public", name: "organizations", rowCount: 2 },
      { schema: "public", name: "activity_log", rowCount: 5 },
    ]);
    expect(snapshot.migrationRows).toHaveLength(2);
    expect(snapshot.checksums).toEqual([
      { schema: "public", table: "organizations", checksum: "org-checksum", rowCount: 2 },
      { schema: "public", table: "activity_log", checksum: "activity-checksum", rowCount: 5 },
    ]);
    expect(snapshot.privilegeExposure).toEqual([
      {
        schema: "public",
        objectName: "organizations",
        objectType: "table",
        grantee: "authenticated",
        privilege: "SELECT",
      },
      {
        schema: "public",
        objectName: "future functions",
        objectType: "default-function",
        grantee: "anon",
        privilege: "EXECUTE",
      },
    ]);
    expect(queries.join("\n")).toContain("row_to_json(source_row)");
    expect(queries.join("\n")).toContain("pg_depend");
    expect(queries.join("\n")).toContain("pg_default_acl");
    expect(queries.join("\n")).toContain("has_function_privilege");
    expect(queries.join("\n")).not.toContain("public.missing");
  });

  it("checksums the real billing events table by default", async () => {
    const queries: string[] = [];
    const executor: QueryExecutor = async (query) => {
      queries.push(query);
      if (query.includes("from information_schema.tables") && query.includes("rowCount")) {
        return {
          rows: [{ schema: "public", name: "billing_events", rowCount: "1" }],
        };
      }
      if (query.includes("from information_schema.tables") && query.includes("tableSchema")) {
        return { rows: [] };
      }
      if (query.includes("from pg_extension")) {
        return { rows: [] };
      }
      if (query.includes("from pg_constraint")) {
        return { rows: [] };
      }
      if (query.includes("from pg_indexes")) {
        return { rows: [] };
      }
      if (query.includes("from information_schema.triggers")) {
        return { rows: [] };
      }
      if (query.includes("pg_depend")) {
        return { rows: [] };
      }
      if (query.includes("has_table_privilege") || query.includes("pg_default_acl")) {
        return { rows: [] };
      }
      if (query.includes('from "public"."billing_events"')) {
        return { rows: [{ checksum: "billing-events-checksum", rowCount: "1" }] };
      }
      throw new Error(`Unhandled query: ${query}`);
    };

    const snapshot = await collectProviderSnapshot(executor, {
      label: "supabase",
      databaseUrl: "postgres://postgres:secret@db.supabase.co/postgres",
    });

    expect(snapshot.checksums).toEqual([
      {
        schema: "public",
        table: "billing_events",
        checksum: "billing-events-checksum",
        rowCount: 1,
      },
    ]);
    expect(queries.join("\n")).toContain('from "public"."billing_events"');
    expect(queries.join("\n")).not.toContain('from "public"."mock_billing_customers"');
    expect(queries.join("\n")).not.toContain('from "public"."mock_billing_subscriptions"');
  });
});

describe("runCli", () => {
  it("fails without required environment without printing secrets", async () => {
    const errors: unknown[] = [];
    const exitCodes: number[] = [];

    await runCli({
      argv: ["node", "scripts/db/provider-migration-audit.ts"],
      env: {},
      scriptUrl: new URL("../db/provider-migration-audit.ts", import.meta.url).href,
      logError: (message) => errors.push(message),
      exit: (code) => exitCodes.push(code),
    });

    expect(errors).toEqual(["SUPABASE_MIGRATION_DB_URL is required."]);
    expect(exitCodes).toEqual([1]);
  });

  it("rejects unsupported audit modes before reading database URLs", async () => {
    const errors: unknown[] = [];
    const exitCodes: number[] = [];

    await runCli({
      argv: ["node", "scripts/db/provider-migration-audit.ts", "--mode", "typo"],
      env: {},
      scriptUrl: new URL("../db/provider-migration-audit.ts", import.meta.url).href,
      logError: (message) => errors.push(message),
      exit: (code) => exitCodes.push(code),
    });

    expect(errors).toEqual(["Unsupported provider migration audit mode: typo"]);
    expect(exitCodes).toEqual([1]);
  });

  it("rejects Supabase invariant checks pointed at Neon", async () => {
    const errors: unknown[] = [];
    const exitCodes: number[] = [];

    await runCli({
      argv: ["node", "scripts/db/provider-migration-audit.ts", "--mode", "supabase-invariants"],
      env: {
        SUPABASE_MIGRATION_DB_URL: "postgres://user:secret@ep-old.us-east-2.aws.neon.tech/app",
      },
      scriptUrl: new URL("../db/provider-migration-audit.ts", import.meta.url).href,
      logError: (message) => errors.push(message),
      exit: (code) => exitCodes.push(code),
    });

    expect(errors).toEqual(["SUPABASE_MIGRATION_DB_URL must point to a Supabase database host."]);
    expect(exitCodes).toEqual([1]);
  });

  it("rejects swapped compare source and target URLs before connecting", async () => {
    const errors: unknown[] = [];
    const exitCodes: number[] = [];

    await runCli({
      argv: ["node", "scripts/db/provider-migration-audit.ts"],
      env: {
        OLD_DB_URL: "postgres://postgres:secret@db.project.supabase.co/postgres",
        SUPABASE_MIGRATION_DB_URL: "postgres://user:secret@ep-old.us-east-2.aws.neon.tech/app",
      },
      scriptUrl: new URL("../db/provider-migration-audit.ts", import.meta.url).href,
      logError: (message) => errors.push(message),
      exit: (code) => exitCodes.push(code),
    });

    expect(errors).toEqual(["SUPABASE_MIGRATION_DB_URL must point to a Supabase database host."]);
    expect(exitCodes).toEqual([1]);
  });

  it("rejects compare mode when the source URL is not Neon", async () => {
    const errors: unknown[] = [];
    const exitCodes: number[] = [];

    await runCli({
      argv: ["node", "scripts/db/provider-migration-audit.ts"],
      env: {
        OLD_DB_URL: "postgres://postgres:secret@db.source-project.supabase.co/postgres",
        SUPABASE_MIGRATION_DB_URL:
          "postgres://postgres:secret@db.target-project.supabase.co/postgres",
      },
      scriptUrl: new URL("../db/provider-migration-audit.ts", import.meta.url).href,
      logError: (message) => errors.push(message),
      exit: (code) => exitCodes.push(code),
    });

    expect(errors).toEqual(["OLD_DB_URL must point to a Neon database host."]);
    expect(exitCodes).toEqual([1]);
  });
});

describe("provider URL guards", () => {
  it("recognizes Neon and Supabase database hosts", () => {
    expect(isNeonDatabaseUrl("postgres://user:pass@ep-old.us-east-2.aws.neon.tech/app")).toBe(true);
    expect(isNeonDatabaseUrl("postgres://postgres:pass@db.project.supabase.co/postgres")).toBe(
      false,
    );
    expect(isSupabaseDatabaseUrl("postgres://postgres:pass@db.project.supabase.co/postgres")).toBe(
      true,
    );
    expect(
      isSupabaseDatabaseUrl(
        "postgres://postgres:pass@aws-0-us-east-1.pooler.supabase.com/postgres",
      ),
    ).toBe(true);
    expect(isSupabaseDatabaseUrl("postgres://user:pass@ep-old.aws.neon.tech/app")).toBe(false);
  });
});
