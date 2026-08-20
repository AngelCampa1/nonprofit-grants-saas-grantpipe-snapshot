CREATE TABLE "accounting_dimension_mappings" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"integration_id" text NOT NULL,
	"external_object_id" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"status" text DEFAULT 'unmapped' NOT NULL,
	"mapped_by" text,
	"mapped_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "accounting_integrations" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"realm_id" text,
	"company_name" text,
	"encrypted_access_token" text,
	"encrypted_refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"sync_start_date" timestamp with time zone,
	"enabled_object_types" jsonb NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disconnected_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "accounting_sync_conflicts" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"integration_id" text NOT NULL,
	"external_object_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"field_path" text NOT NULL,
	"source_value" jsonb,
	"local_value" jsonb,
	"resolved_by" text,
	"resolution" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounting_sync_events" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"integration_id" text NOT NULL,
	"sync_run_id" text,
	"event_type" text NOT NULL,
	"source_object_type" text,
	"source_object_id" text,
	"message" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounting_sync_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"integration_id" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"requested_by" text,
	"object_types" jsonb NOT NULL,
	"imported_count" integer DEFAULT 0 NOT NULL,
	"unmapped_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_accounting_objects" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"integration_id" text NOT NULL,
	"source_system" text NOT NULL,
	"source_object_type" text NOT NULL,
	"source_object_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"display_name" text,
	"payload" jsonb NOT NULL,
	"payload_hash" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN "external_source_system" text;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN "external_source_object_id" text;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN "external_source_object_type" text;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN "external_source_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN "external_source_status" text;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "external_source_system" text;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "external_source_object_id" text;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "external_source_object_type" text;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "external_source_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "external_source_status" text;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD COLUMN "external_source_system" text;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD COLUMN "external_source_object_id" text;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD COLUMN "external_source_object_type" text;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD COLUMN "external_source_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD COLUMN "external_source_status" text;--> statement-breakpoint
ALTER TABLE "accounting_dimension_mappings" ADD CONSTRAINT "accounting_dimension_mappings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_dimension_mappings" ADD CONSTRAINT "accounting_dimension_mappings_integration_id_accounting_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."accounting_integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_dimension_mappings" ADD CONSTRAINT "accounting_dimension_mappings_external_object_id_external_accounting_objects_id_fk" FOREIGN KEY ("external_object_id") REFERENCES "public"."external_accounting_objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_dimension_mappings" ADD CONSTRAINT "accounting_dimension_mappings_mapped_by_user_id_fk" FOREIGN KEY ("mapped_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_integrations" ADD CONSTRAINT "accounting_integrations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_integrations" ADD CONSTRAINT "accounting_integrations_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_sync_conflicts" ADD CONSTRAINT "accounting_sync_conflicts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_sync_conflicts" ADD CONSTRAINT "accounting_sync_conflicts_integration_id_accounting_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."accounting_integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_sync_conflicts" ADD CONSTRAINT "accounting_sync_conflicts_external_object_id_external_accounting_objects_id_fk" FOREIGN KEY ("external_object_id") REFERENCES "public"."external_accounting_objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_sync_conflicts" ADD CONSTRAINT "accounting_sync_conflicts_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_sync_events" ADD CONSTRAINT "accounting_sync_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_sync_events" ADD CONSTRAINT "accounting_sync_events_integration_id_accounting_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."accounting_integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_sync_events" ADD CONSTRAINT "accounting_sync_events_sync_run_id_accounting_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."accounting_sync_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_sync_runs" ADD CONSTRAINT "accounting_sync_runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_sync_runs" ADD CONSTRAINT "accounting_sync_runs_integration_id_accounting_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."accounting_integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_sync_runs" ADD CONSTRAINT "accounting_sync_runs_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_accounting_objects" ADD CONSTRAINT "external_accounting_objects_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_accounting_objects" ADD CONSTRAINT "external_accounting_objects_integration_id_accounting_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."accounting_integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounting_dimension_mappings_external_idx" ON "accounting_dimension_mappings" USING btree ("org_id","external_object_id");--> statement-breakpoint
CREATE INDEX "accounting_dimension_mappings_target_idx" ON "accounting_dimension_mappings" USING btree ("org_id","target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounting_integrations_org_provider_idx" ON "accounting_integrations" USING btree ("org_id","provider");--> statement-breakpoint
CREATE INDEX "accounting_integrations_org_status_idx" ON "accounting_integrations" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "accounting_sync_conflicts_org_status_idx" ON "accounting_sync_conflicts" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "accounting_sync_conflicts_integration_idx" ON "accounting_sync_conflicts" USING btree ("integration_id");--> statement-breakpoint
CREATE INDEX "accounting_sync_events_integration_created_idx" ON "accounting_sync_events" USING btree ("integration_id","created_at");--> statement-breakpoint
CREATE INDEX "accounting_sync_events_org_type_idx" ON "accounting_sync_events" USING btree ("org_id","event_type");--> statement-breakpoint
CREATE INDEX "accounting_sync_runs_integration_created_idx" ON "accounting_sync_runs" USING btree ("integration_id","created_at");--> statement-breakpoint
CREATE INDEX "accounting_sync_runs_org_status_idx" ON "accounting_sync_runs" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "external_accounting_objects_source_idx" ON "external_accounting_objects" USING btree ("org_id","source_system","source_object_type","source_object_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_accounting_objects_idempotency_idx" ON "external_accounting_objects" USING btree ("org_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "external_accounting_objects_integration_type_idx" ON "external_accounting_objects" USING btree ("integration_id","source_object_type");
