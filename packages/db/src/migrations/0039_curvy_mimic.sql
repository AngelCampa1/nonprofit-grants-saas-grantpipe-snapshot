CREATE TABLE "grant_budget_amendments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"grant_id" text NOT NULL,
	"previous_budget_version_id" text NOT NULL,
	"new_budget_version_id" text NOT NULL,
	"reason" text NOT NULL,
	"effective_date" timestamp with time zone NOT NULL,
	"supporting_document_id" text,
	"requested_by_user_id" text,
	"approved_by_user_id" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "grant_budget_line_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"expense_id" text,
	"journal_line_id" text,
	"budget_line_id" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"notes" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "grant_budget_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"budget_version_id" text NOT NULL,
	"budget_period_id" text,
	"category" text NOT NULL,
	"description" text,
	"approved_amount_cents" bigint NOT NULL,
	"allowable" boolean DEFAULT true NOT NULL,
	"cost_type" text DEFAULT 'direct' NOT NULL,
	"program_id" text,
	"fund_id" text,
	"accounting_dimension_code" text,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "grant_budget_periods" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"budget_version_id" text NOT NULL,
	"label" text NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"due_date" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "grant_budget_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"grant_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"source_document_id" text,
	"approved_at" timestamp with time zone,
	"approved_by_user_id" text,
	"superseded_at" timestamp with time zone,
	"superseded_by_version_id" text,
	"notes" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "planned_expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"grant_id" text NOT NULL,
	"budget_line_id" text NOT NULL,
	"budget_period_id" text,
	"description" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"expected_date" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"converted_expense_id" text,
	"notes" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "grant_budget_amendments" ADD CONSTRAINT "grant_budget_amendments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_budget_amendments" ADD CONSTRAINT "grant_budget_amendments_grant_id_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_budget_amendments" ADD CONSTRAINT "grant_budget_amendments_previous_budget_version_id_grant_budget_versions_id_fk" FOREIGN KEY ("previous_budget_version_id") REFERENCES "public"."grant_budget_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_budget_amendments" ADD CONSTRAINT "grant_budget_amendments_new_budget_version_id_grant_budget_versions_id_fk" FOREIGN KEY ("new_budget_version_id") REFERENCES "public"."grant_budget_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_budget_amendments" ADD CONSTRAINT "grant_budget_amendments_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_budget_amendments" ADD CONSTRAINT "grant_budget_amendments_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_budget_line_allocations" ADD CONSTRAINT "grant_budget_line_allocations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_budget_line_allocations" ADD CONSTRAINT "grant_budget_line_allocations_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_budget_line_allocations" ADD CONSTRAINT "grant_budget_line_allocations_budget_line_id_grant_budget_lines_id_fk" FOREIGN KEY ("budget_line_id") REFERENCES "public"."grant_budget_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_budget_line_allocations" ADD CONSTRAINT "grant_budget_line_allocations_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_budget_lines" ADD CONSTRAINT "grant_budget_lines_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_budget_lines" ADD CONSTRAINT "grant_budget_lines_budget_version_id_grant_budget_versions_id_fk" FOREIGN KEY ("budget_version_id") REFERENCES "public"."grant_budget_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_budget_lines" ADD CONSTRAINT "grant_budget_lines_budget_period_id_grant_budget_periods_id_fk" FOREIGN KEY ("budget_period_id") REFERENCES "public"."grant_budget_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_budget_lines" ADD CONSTRAINT "grant_budget_lines_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_budget_periods" ADD CONSTRAINT "grant_budget_periods_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_budget_periods" ADD CONSTRAINT "grant_budget_periods_budget_version_id_grant_budget_versions_id_fk" FOREIGN KEY ("budget_version_id") REFERENCES "public"."grant_budget_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_budget_versions" ADD CONSTRAINT "grant_budget_versions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_budget_versions" ADD CONSTRAINT "grant_budget_versions_grant_id_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_budget_versions" ADD CONSTRAINT "grant_budget_versions_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_budget_versions" ADD CONSTRAINT "grant_budget_versions_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_expenses" ADD CONSTRAINT "planned_expenses_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_expenses" ADD CONSTRAINT "planned_expenses_grant_id_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_expenses" ADD CONSTRAINT "planned_expenses_budget_line_id_grant_budget_lines_id_fk" FOREIGN KEY ("budget_line_id") REFERENCES "public"."grant_budget_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_expenses" ADD CONSTRAINT "planned_expenses_budget_period_id_grant_budget_periods_id_fk" FOREIGN KEY ("budget_period_id") REFERENCES "public"."grant_budget_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_expenses" ADD CONSTRAINT "planned_expenses_converted_expense_id_expenses_id_fk" FOREIGN KEY ("converted_expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_expenses" ADD CONSTRAINT "planned_expenses_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_budget_versions" ADD CONSTRAINT "grant_budget_versions_status_chk" CHECK ("grant_budget_versions"."status" IN ('draft', 'approved', 'superseded'));--> statement-breakpoint
ALTER TABLE "grant_budget_versions" ADD CONSTRAINT "grant_budget_versions_source_chk" CHECK ("grant_budget_versions"."source" IN ('manual', 'document_intake', 'amendment'));--> statement-breakpoint
ALTER TABLE "grant_budget_lines" ADD CONSTRAINT "grant_budget_lines_amount_nonnegative_chk" CHECK ("grant_budget_lines"."approved_amount_cents" >= 0);--> statement-breakpoint
ALTER TABLE "grant_budget_lines" ADD CONSTRAINT "grant_budget_lines_cost_type_chk" CHECK ("grant_budget_lines"."cost_type" IN ('direct', 'indirect'));--> statement-breakpoint
ALTER TABLE "grant_budget_line_allocations" ADD CONSTRAINT "grant_budget_line_allocations_amount_positive_chk" CHECK ("grant_budget_line_allocations"."amount_cents" > 0);--> statement-breakpoint
ALTER TABLE "planned_expenses" ADD CONSTRAINT "planned_expenses_amount_positive_chk" CHECK ("planned_expenses"."amount_cents" > 0);--> statement-breakpoint
ALTER TABLE "planned_expenses" ADD CONSTRAINT "planned_expenses_status_chk" CHECK ("planned_expenses"."status" IN ('planned', 'committed', 'cancelled', 'converted'));--> statement-breakpoint
ALTER TABLE "grant_budget_periods" ADD CONSTRAINT "grant_budget_periods_date_order_chk" CHECK ("grant_budget_periods"."start_date" <= "grant_budget_periods"."end_date");--> statement-breakpoint
CREATE INDEX "grant_budget_amendments_org_grant_idx" ON "grant_budget_amendments" USING btree ("org_id","grant_id");--> statement-breakpoint
CREATE INDEX "grant_budget_amendments_org_previous_idx" ON "grant_budget_amendments" USING btree ("org_id","previous_budget_version_id");--> statement-breakpoint
CREATE INDEX "grant_budget_line_allocations_org_expense_idx" ON "grant_budget_line_allocations" USING btree ("org_id","expense_id");--> statement-breakpoint
CREATE INDEX "grant_budget_line_allocations_org_line_idx" ON "grant_budget_line_allocations" USING btree ("org_id","budget_line_id");--> statement-breakpoint
CREATE INDEX "grant_budget_lines_org_version_idx" ON "grant_budget_lines" USING btree ("org_id","budget_version_id");--> statement-breakpoint
CREATE INDEX "grant_budget_lines_org_period_idx" ON "grant_budget_lines" USING btree ("org_id","budget_period_id");--> statement-breakpoint
CREATE INDEX "grant_budget_lines_org_fund_idx" ON "grant_budget_lines" USING btree ("org_id","fund_id");--> statement-breakpoint
CREATE INDEX "grant_budget_periods_org_version_idx" ON "grant_budget_periods" USING btree ("org_id","budget_version_id");--> statement-breakpoint
CREATE INDEX "grant_budget_versions_org_grant_idx" ON "grant_budget_versions" USING btree ("org_id","grant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "grant_budget_versions_org_grant_number_idx" ON "grant_budget_versions" USING btree ("org_id","grant_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "grant_budget_versions_one_approved_idx" ON "grant_budget_versions" USING btree ("org_id","grant_id") WHERE "grant_budget_versions"."status" = 'approved' AND "grant_budget_versions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "planned_expenses_org_grant_idx" ON "planned_expenses" USING btree ("org_id","grant_id");--> statement-breakpoint
CREATE INDEX "planned_expenses_org_line_idx" ON "planned_expenses" USING btree ("org_id","budget_line_id");--> statement-breakpoint
