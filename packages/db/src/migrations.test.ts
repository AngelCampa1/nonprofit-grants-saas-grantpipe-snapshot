import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = join(import.meta.dirname, "migrations");
const migrationsMetaDir = join(migrationsDir, "meta");
// Legacy mock integration tables that were created during early local-provider
// work. They must be removed from the current Neon schema.
const legacyMockIntegrationTables = [
  "mock_storage_objects",
  "mock_emails",
  "mock_billing_customers",
  "mock_billing_subscriptions",
  "mock_billing_events",
  "mock_analytics_events",
  "mock_error_events",
];

// Tables that must exist in the latest snapshot. billing_events is retained
// because it is the real Stripe audit log as well as the local checkout log.
const latestSnapshotRequiredTables = [
  "billing_events",
  "entities",
  "entity_members",
  "programs",
  "program_budgets",
  "program_budget_lines",
  "grant_program_allocations",
  "expense_program_allocations",
  "program_impact_metric_links",
  "program_reporting_requirement_links",
  "accounting_oauth_states",
  "dashboard_home_preferences",
];

const grantDomainEntityScopedTables = [
  "funders",
  "funder_contacts",
  "grants",
  "funds",
  "grant_fund_allocations",
  "expenses",
  "grant_budget_versions",
  "grant_budget_periods",
  "grant_budget_lines",
  "grant_budget_line_allocations",
  "planned_expenses",
  "grant_budget_amendments",
  "grant_impact_metrics",
  "grant_reporting_requirements",
  "impact_metric_entries",
  "grant_closeout_items",
  "generated_reports",
];

type MigrationJournal = {
  entries: Array<{
    idx: number;
    tag: string;
  }>;
};

type MigrationSnapshot = {
  id: string;
  prevId: string;
  tables: Record<string, unknown>;
};

function readMigrationSql() {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => readFileSync(join(migrationsDir, file), "utf8"))
    .join("\n");
}

function readMigrationFileNames() {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

function readMigrationJournal() {
  return JSON.parse(
    readFileSync(join(migrationsMetaDir, "_journal.json"), "utf8"),
  ) as MigrationJournal;
}

function readSnapshot(fileName: string) {
  return JSON.parse(readFileSync(join(migrationsMetaDir, fileName), "utf8")) as MigrationSnapshot;
}

describe("database migrations", () => {
  it("keeps cumulative snapshot defaults aligned with migration SQL", () => {
    const snapshot81 = readSnapshot("0081_snapshot.json") as {
      tables: Record<string, { columns: Record<string, { default?: string }> }>;
    };
    const snapshot82 = readSnapshot("0082_snapshot.json") as {
      tables: Record<string, { columns: Record<string, { default?: string }> }>;
    };

    expect(snapshot81.tables["public.generated_reports"]?.columns.status?.default).toBe(
      "'pending'",
    );
    expect(snapshot81.tables["public.donor_mail_merge_deliveries"]?.columns.status?.default).toBe(
      "'pending'",
    );
    expect(
      snapshot81.tables["public.external_review_sessions"]?.columns.invitation_delivery_status
        ?.default,
    ).toBe("'sent'");
    expect(snapshot82.tables["public.generated_reports"]?.columns.status?.default).toBe(
      "'pending'",
    );
    expect(
      snapshot82.tables["public.external_review_sessions"]?.columns.invitation_delivery_status
        ?.default,
    ).toBe("'sent'");
  });

  it("records the exact wrapup uniqueness predicate from migration 0084", () => {
    const snapshot84 = readSnapshot("0084_snapshot.json") as {
      tables: Record<string, { indexes: Record<string, { where?: string }> }>;
    };
    const snapshot85 = readSnapshot("0085_snapshot.json") as {
      tables: Record<string, { indexes: Record<string, { where?: string }> }>;
    };
    const expectedPredicate =
      '"trial_email_schedule"."email_kind" = \'trial_wrapup\' AND "trial_email_schedule"."sent_at" IS NULL';

    expect(
      snapshot84.tables["public.trial_email_schedule"]?.indexes
        .trial_email_schedule_org_wrapup_unique?.where,
    ).toBe(expectedPredicate);
    expect(
      snapshot85.tables["public.trial_email_schedule"]?.indexes
        .trial_email_schedule_org_wrapup_unique?.where,
    ).toBe(expectedPredicate);
  });

  it("only bootstraps priority for organizations with a real Stripe watermark", () => {
    const sql = readFileSync(
      join(migrationsDir, "0083_stripe_state_priority_bootstrap.sql"),
      "utf8",
    );

    expect(sql).toContain('ADD COLUMN "stripe_state_event_priority" integer');
    expect(sql).toContain('WHERE "stripe_state_event_created_at" IS NOT NULL');
    expect(sql).not.toContain("clock_timestamp()");
    expect(sql).not.toContain("bootstrap:migration-0083");
  });

  it("adds the org-level wrapup delivery guard in 0084", () => {
    const sql = readFileSync(join(migrationsDir, "0084_trial_wrapup_delivery_guard.sql"), "utf8");
    expect(sql).toContain('ADD COLUMN "trial_wrapup_claimed_at" timestamp with time zone');
    expect(sql).toContain('"trial_email_schedule_org_wrapup_unique"');
    expect(sql).toContain("\"email_kind\" = 'trial_wrapup'");
    expect(sql).toContain('"sent_at" IS NULL');
    expect(sql).toContain("trial_wrapup_superseded");
    expect(sql).toContain("WHEN \"error\" LIKE 'delivery_in_progress:%' THEN 0");
    expect(sql).toContain("WHEN \"error\" LIKE 'delivery_ambiguous:%' THEN 0");
    expect(sql).toContain('"created_at" DESC, "id" DESC');
    expect(sql).toContain("delivery_ambiguous:migration_0084_uncertain_delivery");
    const replacementIndex = sql.indexOf(
      'CREATE UNIQUE INDEX "trial_email_schedule_org_user_non_wrapup_unique"',
    );
    const oldIndexDrop = sql.indexOf('DROP INDEX "trial_email_schedule_org_user_kind_unique"');
    expect(replacementIndex).toBeGreaterThanOrEqual(0);
    expect(sql).toContain('WHERE "trial_email_schedule"."email_kind" <> \'trial_wrapup\'');
    expect(oldIndexDrop).toBeGreaterThan(replacementIndex);
    const followupSql = readFileSync(
      join(migrationsDir, "0085_trial_wrapup_deadline_identity.sql"),
      "utf8",
    );
    expect(followupSql).not.toContain('DROP INDEX "trial_email_schedule_org_wrapup_unique"');
  });

  it("scopes unsent wrapup uniqueness to the frozen trial deadline in 0090", () => {
    const sql = readFileSync(join(migrationsDir, "0090_trial_wrapup_deadline_queue.sql"), "utf8");
    expect(sql).toContain('ADD COLUMN "trial_deadline_at" timestamp with time zone');
    expect(sql).toContain('DROP INDEX "trial_email_schedule_org_wrapup_unique"');
    expect(sql).toContain('"trial_email_schedule_org_wrapup_deadline_unique"');
    expect(sql).toContain('("org_id","trial_deadline_at")');
    expect(sql).toContain("delivery_snapshot ->> 'trialEndsAt'");
    expect(sql).toContain("trial_wrapup_quarantined:missing_deadline");
    expect(sql).toContain("trial_email_schedule_set_wrapup_deadline");
    expect(sql).toContain("BEFORE INSERT OR UPDATE");
    expect(sql).toContain("NEW.trial_deadline_at IS NULL");

    const backfillIndex = sql.indexOf("DO $$", sql.indexOf('ADD COLUMN "trial_deadline_at"'));
    const quarantineIndex = sql.indexOf(
      'SET "email_kind" = \'trial_wrapup_quarantined:missing_deadline:\' || "id"',
    );
    const triggerIndex = sql.indexOf('CREATE TRIGGER "trial_email_schedule_set_wrapup_deadline"');
    const deadlineUniqueIndex = sql.indexOf(
      'CREATE UNIQUE INDEX "trial_email_schedule_org_wrapup_deadline_unique"',
    );
    expect(backfillIndex).toBeGreaterThanOrEqual(0);
    expect(quarantineIndex).toBeGreaterThan(backfillIndex);
    expect(triggerIndex).toBeGreaterThan(quarantineIndex);
    expect(deadlineUniqueIndex).toBeGreaterThan(triggerIndex);

    const triggerFunction = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION "trial_email_schedule_set_wrapup_deadline"'),
      triggerIndex,
    );
    expect(triggerFunction).toContain("NEW.delivery_snapshot ->> 'trialEndsAt'");
    expect(triggerFunction).toContain("organization.trial_ends_at");
    expect(triggerFunction).toContain("RAISE EXCEPTION 'trial wrapup deadline is required'");
  });

  it("removes legacy mock integration tables from the current schema", () => {
    const migrationSql = readMigrationSql();
    const migrationFiles = readMigrationFileNames();
    const latestSnapshotFile = `${migrationFiles.at(-1)!.slice(0, 4)}_snapshot.json`;
    const latestSnapshot = readSnapshot(latestSnapshotFile);

    for (const tableName of legacyMockIntegrationTables) {
      expect(migrationSql).toContain(`"${tableName}"`);
      expect(latestSnapshot.tables).not.toHaveProperty(`public.${tableName}`);
    }
  });

  it("keep sql migrations, journal entries, and snapshots in sync", () => {
    const migrationFiles = readMigrationFileNames();
    const journal = readMigrationJournal();

    expect(journal.entries).toHaveLength(migrationFiles.length);

    for (const [index, fileName] of migrationFiles.entries()) {
      const expectedTag = fileName.replace(/\.sql$/, "");
      const expectedSnapshotFile = `${expectedTag.slice(0, 4)}_snapshot.json`;
      const journalEntry = journal.entries[index];

      expect(journalEntry).toMatchObject({
        idx: index,
        tag: expectedTag,
      });

      const snapshot = readSnapshot(expectedSnapshotFile);
      expect(snapshot.id).toBeTruthy();

      if (index > 0) {
        const previousSnapshotFile = `${migrationFiles[index - 1]!.slice(0, 4)}_snapshot.json`;
        const previousSnapshot = readSnapshot(previousSnapshotFile);
        expect(snapshot.prevId).toBe(previousSnapshot.id);
      }
    }
  });

  it("includes required application tables in the latest snapshot metadata", () => {
    const migrationFiles = readMigrationFileNames();
    const latestSnapshotFile = `${migrationFiles.at(-1)!.slice(0, 4)}_snapshot.json`;
    const latestSnapshot = readSnapshot(latestSnapshotFile);

    for (const tableName of latestSnapshotRequiredTables) {
      expect(latestSnapshot.tables).toHaveProperty(`public.${tableName}`);
    }
  });

  it("adds QuickBooks OAuth state and sync idempotency guards", () => {
    const migrationSql = readMigrationSql();
    const migrationFiles = readMigrationFileNames();
    const latestSnapshotFile = `${migrationFiles.at(-1)!.slice(0, 4)}_snapshot.json`;
    const latestSnapshot = readSnapshot(latestSnapshotFile);

    expect(migrationSql).toContain('"accounting_oauth_states"');
    expect(migrationSql).toContain("ranked_open_conflicts");
    expect(migrationSql).toContain("'duplicate_open_conflict'");
    expect(migrationSql).toContain("ranked_active_runs");
    expect(migrationSql).toContain(`ORDER BY CASE WHEN "status" = 'running' THEN 0 ELSE 1 END`);
    expect(migrationSql).toContain('"accounting_sync_runs_one_active_idx"');
    expect(migrationSql).toContain(
      `WHERE "accounting_sync_runs"."status" IN ('queued', 'running')`,
    );
    expect(migrationSql).toContain('"accounting_sync_conflicts_open_identity_idx"');
    expect(migrationSql).toContain(`WHERE "accounting_sync_conflicts"."status" = 'open'`);
    expect(latestSnapshot.tables).toHaveProperty("public.accounting_oauth_states");
  });

  it("includes deleted_at on custom field definitions in the latest snapshot metadata", () => {
    const migrationFiles = readMigrationFileNames();
    const latestSnapshotFile = `${migrationFiles.at(-1)!.slice(0, 4)}_snapshot.json`;
    const latestSnapshot = readSnapshot(latestSnapshotFile);

    expect(latestSnapshot.tables).toHaveProperty("public.custom_field_definitions");
    expect(latestSnapshot.tables["public.custom_field_definitions"]).toHaveProperty(
      "columns.deleted_at",
    );
  });

  it("includes organizations.plan_selected_at in the latest snapshot metadata", () => {
    const migrationFiles = readMigrationFileNames();
    const latestSnapshotFile = `${migrationFiles.at(-1)!.slice(0, 4)}_snapshot.json`;
    const latestSnapshot = readSnapshot(latestSnapshotFile);

    expect(latestSnapshot.tables).toHaveProperty("public.organizations");
    expect(latestSnapshot.tables["public.organizations"]).toHaveProperty(
      "columns.plan_selected_at",
    );
  });

  it("adds organizations.trial_expired_event_at for the trial_expired dedup guard", () => {
    const migrationSql = readMigrationSql();
    const migrationFiles = readMigrationFileNames();
    const latestSnapshotFile = `${migrationFiles.at(-1)!.slice(0, 4)}_snapshot.json`;
    const latestSnapshot = readSnapshot(latestSnapshotFile);

    expect(migrationSql).toContain('ADD COLUMN "trial_expired_event_at" timestamp with time zone');
    expect(latestSnapshot.tables["public.organizations"]).toHaveProperty(
      "columns.trial_expired_event_at",
    );
  });

  it("adds organizations Stripe state event ordering columns", () => {
    const migrationSql = readMigrationSql();
    const migrationFiles = readMigrationFileNames();
    const latestSnapshotFile = `${migrationFiles.at(-1)!.slice(0, 4)}_snapshot.json`;
    const latestSnapshot = readSnapshot(latestSnapshotFile);

    expect(migrationSql).toContain(
      'ADD COLUMN "stripe_state_event_created_at" timestamp with time zone',
    );
    expect(migrationSql).toContain('ADD COLUMN "stripe_state_event_id" text');
    expect(latestSnapshot.tables["public.organizations"]).toHaveProperty(
      "columns.stripe_state_event_created_at",
    );
    expect(latestSnapshot.tables["public.organizations"]).toHaveProperty(
      "columns.stripe_state_event_id",
    );
  });

  it("adds the multi-entity foundation tables and invite scope column", () => {
    const migrationSql = readMigrationSql();
    const migrationFiles = readMigrationFileNames();
    const latestSnapshotFile = `${migrationFiles.at(-1)!.slice(0, 4)}_snapshot.json`;
    const latestSnapshot = readSnapshot(latestSnapshotFile);

    expect(migrationSql).toContain('CREATE TABLE "entities"');
    expect(migrationSql).toContain('CREATE TABLE "entity_members"');
    expect(migrationSql).toContain('ALTER TABLE "organizations" ADD COLUMN "default_entity_id"');
    expect(migrationSql).toContain('ALTER TABLE "invite_links" ADD COLUMN "entity_id"');
    expect(migrationSql).toContain('"entities_org_id_organizations_id_fk"');
    expect(migrationSql).toContain('"entities_parent_entity_id_entities_id_fk"');
    expect(migrationSql).toContain('"entity_members_entity_id_entities_id_fk"');
    expect(migrationSql).toContain('"entity_members_org_member_id_org_members_id_fk"');
    expect(migrationSql).toContain('"organizations_default_entity_id_entities_id_fk"');
    expect(migrationSql).toContain('"invite_links_entity_id_entities_id_fk"');
    expect(migrationSql).toContain('"entities_org_id_id_unique"');
    expect(migrationSql).toContain('"org_members_org_id_id_unique"');
    expect(migrationSql).toContain('"entities_parent_same_org_fk"');
    expect(migrationSql).toContain('"entity_members_org_entity_fk"');
    expect(migrationSql).toContain('"entity_members_org_member_same_org_fk"');
    expect(migrationSql).toContain('"invite_links_org_entity_fk"');
    expect(migrationSql).toContain('"organizations_default_entity_same_org_fk"');
    expect(migrationSql).toContain(
      'CONSTRAINT "entities_parent_same_org_fk" FOREIGN KEY ("org_id","parent_entity_id") REFERENCES "public"."entities"("org_id","id")',
    );
    expect(migrationSql).toContain(
      'CONSTRAINT "entity_members_org_entity_fk" FOREIGN KEY ("org_id","entity_id") REFERENCES "public"."entities"("org_id","id")',
    );
    expect(migrationSql).toContain(
      'CONSTRAINT "entity_members_org_member_same_org_fk" FOREIGN KEY ("org_id","org_member_id") REFERENCES "public"."org_members"("org_id","id")',
    );
    expect(migrationSql).toContain(
      'CONSTRAINT "invite_links_org_entity_fk" FOREIGN KEY ("org_id","entity_id") REFERENCES "public"."entities"("org_id","id")',
    );
    expect(migrationSql).toContain(
      'CONSTRAINT "organizations_default_entity_same_org_fk" FOREIGN KEY ("id","default_entity_id") REFERENCES "public"."entities"("org_id","id")',
    );

    expect(latestSnapshot.tables).toHaveProperty("public.entities");
    expect(latestSnapshot.tables).toHaveProperty("public.entity_members");
    expect(latestSnapshot.tables["public.organizations"]).toHaveProperty(
      "columns.default_entity_id",
    );
    expect(latestSnapshot.tables["public.invite_links"]).toHaveProperty("columns.entity_id");
    expect(latestSnapshot.tables["public.entities"]).toHaveProperty(
      "foreignKeys.entities_parent_same_org_fk.onDelete",
      "no action",
    );
  });

  it("backfills default entities and active entity memberships", () => {
    const migrationSql = readMigrationSql();

    expect(migrationSql).toContain("default_entity_id");
    expect(migrationSql).toContain('INSERT INTO "entities"');
    expect(migrationSql).toContain('INSERT INTO "entity_members"');
    expect(migrationSql).toContain('"org_members"."deleted_at" IS NULL');
    expect(migrationSql).toContain('"organizations"."deleted_at" IS NULL');
    expect(migrationSql).toContain("'root'");
  });

  it("adds active entity scope to the full grants domain graph", () => {
    const migrationSql = readMigrationSql();
    const migrationFiles = readMigrationFileNames();
    const latestSnapshotFile = `${migrationFiles.at(-1)!.slice(0, 4)}_snapshot.json`;
    const latestSnapshot = readSnapshot(latestSnapshotFile);

    for (const tableName of grantDomainEntityScopedTables) {
      expect(migrationSql).toContain(`ALTER TABLE "${tableName}" ADD COLUMN "entity_id"`);
      expect(migrationSql).toContain(`UPDATE "${tableName}"`);
      expect(migrationSql).toContain(
        `ALTER TABLE "${tableName}" ALTER COLUMN "entity_id" SET NOT NULL`,
      );
      expect(latestSnapshot.tables[`public.${tableName}`]).toHaveProperty("columns.entity_id");
    }

    expect(migrationSql).toContain('ALTER TABLE "activity_log" ADD COLUMN "active_entity_id"');
    expect(latestSnapshot.tables["public.activity_log"]).toHaveProperty("columns.active_entity_id");
  });

  it("persists active entity scope for scheduled notifications", () => {
    const migrationSql = readFileSync(
      join(migrationsDir, "0092_notification_entity_scope.sql"),
      "utf8",
    );
    const latestSnapshot = readSnapshot("0092_snapshot.json");

    expect(migrationSql).toContain('ALTER TABLE "notifications" ADD COLUMN "active_entity_id"');
    expect(migrationSql).toContain("WHERE n.\"type\" = 'accounting_anomaly'");
    expect(migrationSql).toContain('JOIN "expenses" e');
    expect(migrationSql).toContain('JOIN "grant_payment_requests" r');
    expect(migrationSql).toContain('JOIN "donations" d');
    expect(migrationSql).toContain('JOIN "restriction_releases" rr');
    expect(latestSnapshot.tables["public.notifications"]).toHaveProperty(
      "columns.active_entity_id",
    );
  });

  it("keeps grant money columns as bigint in the latest snapshot metadata", () => {
    const migrationFiles = readMigrationFileNames();
    const latestSnapshotFile = `${migrationFiles.at(-1)!.slice(0, 4)}_snapshot.json`;
    const latestSnapshot = readSnapshot(latestSnapshotFile);

    expect(latestSnapshot.tables["public.grants"]).toHaveProperty(
      "columns.amount_cents.type",
      "bigint",
    );
    expect(latestSnapshot.tables["public.grant_fund_allocations"]).toHaveProperty(
      "columns.allocated_amount_cents.type",
      "bigint",
    );
    expect(latestSnapshot.tables["public.expenses"]).toHaveProperty(
      "columns.amount_cents.type",
      "bigint",
    );
  });

  it("keeps journal line money columns as bigint in the latest snapshot metadata", () => {
    const migrationFiles = readMigrationFileNames();
    const latestSnapshotFile = `${migrationFiles.at(-1)!.slice(0, 4)}_snapshot.json`;
    const latestSnapshot = readSnapshot(latestSnapshotFile);

    expect(latestSnapshot.tables["public.journal_lines"]).toHaveProperty(
      "columns.debit_cents.type",
      "bigint",
    );
    expect(latestSnapshot.tables["public.journal_lines"]).toHaveProperty(
      "columns.credit_cents.type",
      "bigint",
    );
  });

  it("adds the program allocation tables with org scoping and audit columns", () => {
    const migrationSql = readMigrationSql();
    const migrationFiles = readMigrationFileNames();
    const latestSnapshotFile = `${migrationFiles.at(-1)!.slice(0, 4)}_snapshot.json`;
    const latestSnapshot = readSnapshot(latestSnapshotFile);

    for (const tableName of [
      "programs",
      "program_budgets",
      "program_budget_lines",
      "grant_program_allocations",
      "expense_program_allocations",
      "program_impact_metric_links",
      "program_reporting_requirement_links",
    ]) {
      expect(migrationSql).toContain(`"${tableName}"`);
      expect(latestSnapshot.tables).toHaveProperty(`public.${tableName}`);
      expect(latestSnapshot.tables[`public.${tableName}`]).toHaveProperty("columns.org_id");
      expect(latestSnapshot.tables[`public.${tableName}`]).toHaveProperty("columns.created_at");
    }

    for (const mutableTable of [
      "programs",
      "program_budgets",
      "program_budget_lines",
      "grant_program_allocations",
      "expense_program_allocations",
      "program_impact_metric_links",
      "program_reporting_requirement_links",
    ]) {
      expect(latestSnapshot.tables[`public.${mutableTable}`]).toHaveProperty("columns.deleted_at");
    }
  });

  it("adds indexes for program list, budget period, allocation, and report lookups", () => {
    const migrationSql = readMigrationSql();

    for (const indexName of [
      "programs_org_name_idx",
      "programs_org_code_active_idx",
      "program_budgets_org_program_period_idx",
      "grant_program_allocations_org_grant_idx",
      "expense_program_allocations_org_expense_idx",
      "expense_program_allocations_org_program_idx",
    ]) {
      expect(migrationSql).toContain(`"${indexName}"`);
    }

    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "program_impact_metric_links_org_metric_idx" ON "program_impact_metric_links" USING btree ("org_id","impact_metric_id","program_id") WHERE "program_impact_metric_links"."deleted_at" is null',
    );
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "program_reporting_requirement_links_org_requirement_idx" ON "program_reporting_requirement_links" USING btree ("org_id","reporting_requirement_id","program_id") WHERE "program_reporting_requirement_links"."deleted_at" is null',
    );
  });

  it("adds volunteer_hours.deleted_at in the latest snapshot metadata", () => {
    const migrationFiles = readMigrationFileNames();
    const latestSnapshotFile = `${migrationFiles.at(-1)!.slice(0, 4)}_snapshot.json`;
    const latestSnapshot = readSnapshot(latestSnapshotFile);

    expect(latestSnapshot.tables["public.volunteer_hours"]).toHaveProperty("columns.deleted_at");
  });

  it("adds grant budget guardrail constraints", () => {
    const migrationSql = readMigrationSql();

    for (const constraintName of [
      "grant_budget_versions_status_chk",
      "grant_budget_versions_source_chk",
      "grant_budget_lines_amount_nonnegative_chk",
      "grant_budget_lines_cost_type_chk",
      "grant_budget_line_allocations_amount_positive_chk",
      "planned_expenses_amount_positive_chk",
      "planned_expenses_status_chk",
      "grant_budget_periods_date_order_chk",
    ]) {
      expect(migrationSql).toContain(`"${constraintName}"`);
    }

    expect(migrationSql).toContain('"grant_budget_versions_one_approved_idx"');
    expect(migrationSql).toContain(
      `WHERE "grant_budget_versions"."status" = 'approved' AND "grant_budget_versions"."deleted_at" IS NULL`,
    );
    expect(migrationSql).toContain(
      `"grant_budget_versions_source_chk" CHECK ("grant_budget_versions"."source" IN ('manual', 'document_intake', 'amendment'))`,
    );
    expect(migrationSql).toContain(
      `"grant_budget_lines_cost_type_chk" CHECK ("grant_budget_lines"."cost_type" IN ('direct', 'indirect'))`,
    );
    expect(migrationSql).toContain(
      `"planned_expenses_status_chk" CHECK ("planned_expenses"."status" IN ('planned', 'committed', 'cancelled', 'converted'))`,
    );
  });

  it("adds a payment request line expense deduplication guard", () => {
    const migrationSql = readMigrationSql();

    expect(migrationSql).toContain('"grant_payment_request_lines_org_expense_active_idx"');
    expect(migrationSql).toContain('"dedup_released_at" timestamp with time zone');
    expect(migrationSql).toContain(
      "Cannot create payment request expense dedup index; duplicate active expense lines exist",
    );
    expect(migrationSql).toContain("HAVING count(*) > 1");
    expect(migrationSql).toContain(`AND "grant_payment_request_lines"."dedup_released_at" IS NULL`);
  });

  it("does not drop legacy Neon marketing tables during the D1 cutover", () => {
    const migrationSql = readMigrationSql();

    expect(migrationSql).not.toMatch(/DROP TABLE IF EXISTS "lead_magnet_downloads"/);
    const retiredTable = ["lead", "nurture", "schedule"].join("_");
    expect(migrationSql).not.toContain(`DROP TABLE IF EXISTS "${retiredTable}"`);
    expect(migrationSql).not.toMatch(/DROP TABLE IF EXISTS "leads"/);
  });

  it("creates each table at most once across the migration chain so a fresh migrate succeeds", () => {
    const migrationFiles = readMigrationFileNames();

    // A fresh `drizzle-kit migrate` replays every .sql file in order against an
    // empty database. A plain `CREATE TABLE "x"` (no IF NOT EXISTS) appearing in
    // two different migrations aborts the run with `relation "x" already exists`.
    // Count plain creates per table name and require <= 1; idempotent
    // `CREATE TABLE IF NOT EXISTS` repairs are allowed to repeat.
    const plainCreate = /CREATE TABLE "([a-z0-9_]+)"/gi;
    const createCounts = new Map<string, string[]>();

    for (const fileName of migrationFiles) {
      const sql = readFileSync(join(migrationsDir, fileName), "utf8");
      for (const match of sql.matchAll(plainCreate)) {
        const tableName = match[1]!;
        const seenIn = createCounts.get(tableName) ?? [];
        seenIn.push(fileName);
        createCounts.set(tableName, seenIn);
      }
    }

    const duplicated = [...createCounts.entries()].filter(([, files]) => files.length > 1);
    expect(duplicated).toEqual([]);
  });

  it("never creates an index that already exists or drops one that is absent across the chain", () => {
    // drizzle-kit migrate applies DDL statements without a per-migration
    // transaction, so a plain `CREATE INDEX "x"` against an index that an
    // earlier migration already created (a merge/renumber duplicate) aborts the
    // run mid-migration and can leave the schema half-applied. Replay the index
    // DDL across the whole chain and require every plain create/drop to be valid
    // at the point it runs. Idempotent `IF [NOT] EXISTS` forms are exempt.
    const migrationFiles = readMigrationFileNames();
    const existing = new Set<string>();
    const violations: string[] = [];

    const dropRe = /DROP INDEX\s+(IF EXISTS\s+)?"([a-z0-9_]+)"/gi;
    const createRe =
      /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(CONCURRENTLY\s+)?(IF NOT EXISTS\s+)?"([a-z0-9_]+)"/gi;

    for (const fileName of migrationFiles) {
      const sql = readFileSync(join(migrationsDir, fileName), "utf8");
      for (const statement of sql.split("--> statement-breakpoint")) {
        const dropMatch = dropRe.exec(statement);
        dropRe.lastIndex = 0;
        if (dropMatch) {
          const [, ifExists, name] = dropMatch;
          if (!name) continue;
          if (!existing.has(name) && !ifExists) {
            violations.push(`${fileName}: DROP INDEX "${name}" but it does not exist`);
          }
          existing.delete(name);
          continue;
        }
        const createMatch = createRe.exec(statement);
        createRe.lastIndex = 0;
        if (createMatch) {
          const [, , ifNotExists, name] = createMatch;
          if (!name) continue;
          if (existing.has(name) && !ifNotExists) {
            violations.push(`${fileName}: CREATE INDEX "${name}" but it already exists`);
          }
          existing.add(name);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("has an idempotent repair migration for external reviewer portal tables", () => {
    const migrationSql = readFileSync(
      join(migrationsDir, "0043_restore_external_review_portal_tables.sql"),
      "utf8",
    );

    for (const tableName of [
      "external_reviewers",
      "external_review_sessions",
      "external_review_scopes",
      "evidence_bundles",
      "evidence_bundle_items",
      "external_review_audit_events",
    ]) {
      expect(migrationSql).toContain(`CREATE TABLE IF NOT EXISTS "${tableName}"`);
    }

    expect(migrationSql).toContain('CREATE INDEX IF NOT EXISTS "external_reviewers_org_idx"');
    expect(migrationSql).toContain('CREATE INDEX IF NOT EXISTS "evidence_bundles_org_active_idx"');
  });

  it("adds report export attempt and balance idempotency guards in 0082", () => {
    const migrationSql = readFileSync(
      join(migrationsDir, "0082_report_export_idempotency.sql"),
      "utf8",
    );

    expect(migrationSql).toContain('ADD COLUMN "attempt_id" text');
    expect(migrationSql).toContain('ADD COLUMN "recovery_attempted_at" timestamp with time zone');
    expect(migrationSql).toContain('"generated_reports_org_type_attempt_idx"');
    expect(migrationSql).toContain('WHERE "generated_reports"."attempt_id" is not null');
    expect(migrationSql).toContain('"restriction_balances_report_term_idx"');
    expect(migrationSql).toContain(
      'WHERE "restriction_balances"."generated_report_id" is not null',
    );
    const divergenceGuard = migrationSql.indexOf(
      "Cannot deduplicate divergent restriction balance snapshots",
    );
    const deterministicRepair = migrationSql.lastIndexOf("row_number() OVER (");
    const balanceIndex = migrationSql.indexOf(
      'CREATE UNIQUE INDEX "restriction_balances_report_term_idx"',
    );
    expect(divergenceGuard).toBeGreaterThan(-1);
    expect(deterministicRepair).toBeGreaterThan(divergenceGuard);
    expect(balanceIndex).toBeGreaterThan(deterministicRepair);
    expect(migrationSql.slice(deterministicRepair, balanceIndex)).toContain(
      'PARTITION BY "generated_report_id", "restriction_term_id"',
    );
    expect(migrationSql.slice(deterministicRepair, balanceIndex)).toContain(
      'ORDER BY "created_at", "id"',
    );
    expect(migrationSql).toContain("IS DISTINCT FROM ROW(");
    expect(migrationSql).not.toContain("stripe_state_event_priority");
    expect(migrationSql).not.toContain("invitation_delivery_status");
  });

  it("scopes export attempts by entity and persists ready-effect retry state in 0088", () => {
    const migrationSql = readFileSync(
      join(migrationsDir, "0088_report_effect_retry_scope.sql"),
      "utf8",
    );

    expect(migrationSql).toContain(
      'ADD COLUMN "ready_effects_attempt_count" integer DEFAULT 0 NOT NULL',
    );
    expect(migrationSql).toContain(
      'ADD COLUMN "ready_effects_last_attempted_at" timestamp with time zone',
    );
    expect(migrationSql).toContain(
      '("org_id","entity_id","type","attempt_id") WHERE "generated_reports"."attempt_id" is not null',
    );
  });

  it("carries report export recovery metadata into later migration snapshots", () => {
    const snapshot = JSON.parse(
      readFileSync(join(migrationsDir, "meta", "0083_snapshot.json"), "utf8"),
    ) as {
      tables: Record<string, { columns: Record<string, unknown> }>;
    };

    expect(snapshot.tables["public.generated_reports"]?.columns).toHaveProperty(
      "recovery_attempted_at",
    );
  });
});
