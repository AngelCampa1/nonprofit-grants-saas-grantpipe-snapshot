CREATE TABLE "expense_program_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"expense_id" text NOT NULL,
	"program_id" text NOT NULL,
	"fund_id" text,
	"grant_id" text,
	"amount_cents" bigint,
	"percent_basis_points" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "grant_program_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"grant_id" text NOT NULL,
	"program_id" text NOT NULL,
	"amount_cents" bigint,
	"percent_basis_points" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "program_budget_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"budget_id" text NOT NULL,
	"category" text NOT NULL,
	"budgeted_cents" bigint NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "program_budgets" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"program_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "program_impact_metric_links" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"program_id" text NOT NULL,
	"impact_metric_id" text NOT NULL,
	"grant_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "program_reporting_requirement_links" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"program_id" text NOT NULL,
	"reporting_requirement_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"description" text,
	"owner_user_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "expense_program_allocations" ADD CONSTRAINT "expense_program_allocations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_program_allocations" ADD CONSTRAINT "expense_program_allocations_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_program_allocations" ADD CONSTRAINT "expense_program_allocations_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_program_allocations" ADD CONSTRAINT "expense_program_allocations_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_program_allocations" ADD CONSTRAINT "expense_program_allocations_grant_id_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_program_allocations" ADD CONSTRAINT "grant_program_allocations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_program_allocations" ADD CONSTRAINT "grant_program_allocations_grant_id_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_program_allocations" ADD CONSTRAINT "grant_program_allocations_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_budget_lines" ADD CONSTRAINT "program_budget_lines_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_budget_lines" ADD CONSTRAINT "program_budget_lines_budget_id_program_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."program_budgets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_budgets" ADD CONSTRAINT "program_budgets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_budgets" ADD CONSTRAINT "program_budgets_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_impact_metric_links" ADD CONSTRAINT "program_impact_metric_links_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_impact_metric_links" ADD CONSTRAINT "program_impact_metric_links_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_impact_metric_links" ADD CONSTRAINT "program_impact_metric_links_impact_metric_id_grant_impact_metrics_id_fk" FOREIGN KEY ("impact_metric_id") REFERENCES "public"."grant_impact_metrics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_impact_metric_links" ADD CONSTRAINT "program_impact_metric_links_grant_id_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_reporting_requirement_links" ADD CONSTRAINT "program_reporting_requirement_links_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_reporting_requirement_links" ADD CONSTRAINT "program_reporting_requirement_links_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_reporting_requirement_links" ADD CONSTRAINT "program_reporting_requirement_links_reporting_requirement_id_grant_reporting_requirements_id_fk" FOREIGN KEY ("reporting_requirement_id") REFERENCES "public"."grant_reporting_requirements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expense_program_allocations_org_expense_idx" ON "expense_program_allocations" USING btree ("org_id","expense_id");--> statement-breakpoint
CREATE INDEX "expense_program_allocations_org_program_idx" ON "expense_program_allocations" USING btree ("org_id","program_id");--> statement-breakpoint
CREATE INDEX "grant_program_allocations_org_grant_idx" ON "grant_program_allocations" USING btree ("org_id","grant_id");--> statement-breakpoint
CREATE INDEX "grant_program_allocations_org_program_idx" ON "grant_program_allocations" USING btree ("org_id","program_id");--> statement-breakpoint
CREATE INDEX "program_budget_lines_org_budget_idx" ON "program_budget_lines" USING btree ("org_id","budget_id");--> statement-breakpoint
CREATE INDEX "program_budgets_org_program_period_idx" ON "program_budgets" USING btree ("org_id","program_id","period_start","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "program_impact_metric_links_org_metric_idx" ON "program_impact_metric_links" USING btree ("org_id","impact_metric_id","program_id") WHERE "program_impact_metric_links"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "program_impact_metric_links_org_program_idx" ON "program_impact_metric_links" USING btree ("org_id","program_id");--> statement-breakpoint
CREATE UNIQUE INDEX "program_reporting_requirement_links_org_requirement_idx" ON "program_reporting_requirement_links" USING btree ("org_id","reporting_requirement_id","program_id") WHERE "program_reporting_requirement_links"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "program_reporting_requirement_links_org_program_idx" ON "program_reporting_requirement_links" USING btree ("org_id","program_id");--> statement-breakpoint
CREATE INDEX "programs_org_name_idx" ON "programs" USING btree ("org_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "programs_org_code_active_idx" ON "programs" USING btree ("org_id","code") WHERE "programs"."deleted_at" is null;
