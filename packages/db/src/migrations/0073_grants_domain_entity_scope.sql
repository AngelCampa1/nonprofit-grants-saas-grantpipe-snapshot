ALTER TABLE "expenses" ADD COLUMN "entity_id" text;--> statement-breakpoint
ALTER TABLE "funder_contacts" ADD COLUMN "entity_id" text;--> statement-breakpoint
ALTER TABLE "funders" ADD COLUMN "entity_id" text;--> statement-breakpoint
ALTER TABLE "funds" ADD COLUMN "entity_id" text;--> statement-breakpoint
ALTER TABLE "grant_budget_amendments" ADD COLUMN "entity_id" text;--> statement-breakpoint
ALTER TABLE "grant_budget_line_allocations" ADD COLUMN "entity_id" text;--> statement-breakpoint
ALTER TABLE "grant_budget_lines" ADD COLUMN "entity_id" text;--> statement-breakpoint
ALTER TABLE "grant_budget_periods" ADD COLUMN "entity_id" text;--> statement-breakpoint
ALTER TABLE "grant_budget_versions" ADD COLUMN "entity_id" text;--> statement-breakpoint
ALTER TABLE "grant_fund_allocations" ADD COLUMN "entity_id" text;--> statement-breakpoint
ALTER TABLE "grant_impact_metrics" ADD COLUMN "entity_id" text;--> statement-breakpoint
ALTER TABLE "grants" ADD COLUMN "entity_id" text;--> statement-breakpoint
ALTER TABLE "planned_expenses" ADD COLUMN "entity_id" text;--> statement-breakpoint
ALTER TABLE "generated_reports" ADD COLUMN "entity_id" text;--> statement-breakpoint
ALTER TABLE "grant_closeout_items" ADD COLUMN "entity_id" text;--> statement-breakpoint
ALTER TABLE "grant_reporting_requirements" ADD COLUMN "entity_id" text;--> statement-breakpoint
ALTER TABLE "impact_metric_entries" ADD COLUMN "entity_id" text;--> statement-breakpoint
ALTER TABLE "activity_log" ADD COLUMN "active_entity_id" text;--> statement-breakpoint
UPDATE "funders" SET "entity_id" = "organizations"."default_entity_id" FROM "organizations" WHERE "funders"."org_id" = "organizations"."id" AND "funders"."entity_id" IS NULL;--> statement-breakpoint
UPDATE "funder_contacts" SET "entity_id" = "funders"."entity_id" FROM "funders" WHERE "funder_contacts"."funder_id" = "funders"."id" AND "funder_contacts"."entity_id" IS NULL;--> statement-breakpoint
UPDATE "grants" SET "entity_id" = COALESCE("funders"."entity_id", "organizations"."default_entity_id") FROM "organizations" LEFT JOIN "funders" ON "funders"."org_id" = "organizations"."id" WHERE "grants"."org_id" = "organizations"."id" AND "grants"."funder_id" = "funders"."id" AND "grants"."entity_id" IS NULL;--> statement-breakpoint
UPDATE "funds" SET "entity_id" = "organizations"."default_entity_id" FROM "organizations" WHERE "funds"."org_id" = "organizations"."id" AND "funds"."entity_id" IS NULL;--> statement-breakpoint
UPDATE "grant_fund_allocations" SET "entity_id" = "grants"."entity_id" FROM "grants" WHERE "grant_fund_allocations"."grant_id" = "grants"."id" AND "grant_fund_allocations"."entity_id" IS NULL;--> statement-breakpoint
UPDATE "expenses" SET "entity_id" = COALESCE((SELECT "grants"."entity_id" FROM "grants" WHERE "grants"."id" = "expenses"."grant_id"), (SELECT "funds"."entity_id" FROM "funds" WHERE "funds"."id" = "expenses"."fund_id"), (SELECT "organizations"."default_entity_id" FROM "organizations" WHERE "organizations"."id" = "expenses"."org_id")) WHERE "expenses"."entity_id" IS NULL;--> statement-breakpoint
UPDATE "grant_budget_versions" SET "entity_id" = "grants"."entity_id" FROM "grants" WHERE "grant_budget_versions"."grant_id" = "grants"."id" AND "grant_budget_versions"."entity_id" IS NULL;--> statement-breakpoint
UPDATE "grant_budget_periods" SET "entity_id" = "grant_budget_versions"."entity_id" FROM "grant_budget_versions" WHERE "grant_budget_periods"."budget_version_id" = "grant_budget_versions"."id" AND "grant_budget_periods"."entity_id" IS NULL;--> statement-breakpoint
UPDATE "grant_budget_lines" SET "entity_id" = "grant_budget_versions"."entity_id" FROM "grant_budget_versions" WHERE "grant_budget_lines"."budget_version_id" = "grant_budget_versions"."id" AND "grant_budget_lines"."entity_id" IS NULL;--> statement-breakpoint
UPDATE "grant_budget_line_allocations" SET "entity_id" = "grant_budget_lines"."entity_id" FROM "grant_budget_lines" WHERE "grant_budget_line_allocations"."budget_line_id" = "grant_budget_lines"."id" AND "grant_budget_line_allocations"."entity_id" IS NULL;--> statement-breakpoint
UPDATE "planned_expenses" SET "entity_id" = "grants"."entity_id" FROM "grants" WHERE "planned_expenses"."grant_id" = "grants"."id" AND "planned_expenses"."entity_id" IS NULL;--> statement-breakpoint
UPDATE "grant_budget_amendments" SET "entity_id" = "grants"."entity_id" FROM "grants" WHERE "grant_budget_amendments"."grant_id" = "grants"."id" AND "grant_budget_amendments"."entity_id" IS NULL;--> statement-breakpoint
UPDATE "grant_impact_metrics" SET "entity_id" = "grants"."entity_id" FROM "grants" WHERE "grant_impact_metrics"."grant_id" = "grants"."id" AND "grant_impact_metrics"."entity_id" IS NULL;--> statement-breakpoint
UPDATE "grant_reporting_requirements" SET "entity_id" = "grants"."entity_id" FROM "grants" WHERE "grant_reporting_requirements"."grant_id" = "grants"."id" AND "grant_reporting_requirements"."entity_id" IS NULL;--> statement-breakpoint
UPDATE "impact_metric_entries" SET "entity_id" = "grant_impact_metrics"."entity_id" FROM "grant_impact_metrics" WHERE "impact_metric_entries"."metric_id" = "grant_impact_metrics"."id" AND "impact_metric_entries"."entity_id" IS NULL;--> statement-breakpoint
UPDATE "grant_closeout_items" SET "entity_id" = "grants"."entity_id" FROM "grants" WHERE "grant_closeout_items"."grant_id" = "grants"."id" AND "grant_closeout_items"."entity_id" IS NULL;--> statement-breakpoint
UPDATE "generated_reports" SET "entity_id" = COALESCE((SELECT "grants"."entity_id" FROM "grants" WHERE "grants"."id" = "generated_reports"."grant_id"), (SELECT "funds"."entity_id" FROM "funds" WHERE "funds"."id" = "generated_reports"."fund_id"), (SELECT "organizations"."default_entity_id" FROM "organizations" WHERE "organizations"."id" = "generated_reports"."org_id")) WHERE "generated_reports"."entity_id" IS NULL;--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "entity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "funder_contacts" ALTER COLUMN "entity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "funders" ALTER COLUMN "entity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "funds" ALTER COLUMN "entity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "grant_budget_amendments" ALTER COLUMN "entity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "grant_budget_line_allocations" ALTER COLUMN "entity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "grant_budget_lines" ALTER COLUMN "entity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "grant_budget_periods" ALTER COLUMN "entity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "grant_budget_versions" ALTER COLUMN "entity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "grant_fund_allocations" ALTER COLUMN "entity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "grant_impact_metrics" ALTER COLUMN "entity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "grants" ALTER COLUMN "entity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "planned_expenses" ALTER COLUMN "entity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_reports" ALTER COLUMN "entity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "grant_closeout_items" ALTER COLUMN "entity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "grant_reporting_requirements" ALTER COLUMN "entity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "impact_metric_entries" ALTER COLUMN "entity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funder_contacts" ADD CONSTRAINT "funder_contacts_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funders" ADD CONSTRAINT "funders_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funds" ADD CONSTRAINT "funds_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_budget_amendments" ADD CONSTRAINT "grant_budget_amendments_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_budget_line_allocations" ADD CONSTRAINT "grant_budget_line_allocations_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_budget_lines" ADD CONSTRAINT "grant_budget_lines_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_budget_periods" ADD CONSTRAINT "grant_budget_periods_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_budget_versions" ADD CONSTRAINT "grant_budget_versions_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_fund_allocations" ADD CONSTRAINT "grant_fund_allocations_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_impact_metrics" ADD CONSTRAINT "grant_impact_metrics_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_expenses" ADD CONSTRAINT "planned_expenses_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_reports" ADD CONSTRAINT "generated_reports_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_closeout_items" ADD CONSTRAINT "grant_closeout_items_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_reporting_requirements" ADD CONSTRAINT "grant_reporting_requirements_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impact_metric_entries" ADD CONSTRAINT "impact_metric_entries_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_active_entity_id_entities_id_fk" FOREIGN KEY ("active_entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;
