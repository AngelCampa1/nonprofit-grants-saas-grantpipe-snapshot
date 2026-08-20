CREATE TABLE "restriction_additions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"restriction_term_id" text NOT NULL,
	"donation_id" text,
	"grant_id" text,
	"journal_line_id" text,
	"amount_cents" bigint NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"description" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "restriction_allowed_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"restriction_term_id" text NOT NULL,
	"category" text NOT NULL,
	"account_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "restriction_allowed_programs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"restriction_term_id" text NOT NULL,
	"program" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "restriction_balances" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"restriction_term_id" text NOT NULL,
	"fund_id" text,
	"grant_id" text,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"beginning_balance_cents" bigint NOT NULL,
	"additions_cents" bigint NOT NULL,
	"releases_cents" bigint NOT NULL,
	"ending_balance_cents" bigint NOT NULL,
	"generated_report_id" text,
	"source" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "restriction_evidence_links" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"restriction_release_id" text NOT NULL,
	"document_id" text,
	"generated_report_id" text,
	"label" text NOT NULL,
	"evidence_type" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "restriction_releases" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"restriction_term_id" text NOT NULL,
	"expense_id" text,
	"journal_line_id" text,
	"amount_cents" bigint NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "restriction_terms" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"fund_id" text,
	"grant_id" text,
	"donation_id" text,
	"source_document_id" text,
	"restriction_type" text NOT NULL,
	"source" text NOT NULL,
	"title" text NOT NULL,
	"purpose_statement" text,
	"release_rule" text,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"beginning_balance_cents" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"evidence_requirement" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DROP INDEX "org_members_org_user_idx";--> statement-breakpoint
DROP INDEX "grant_opportunities_org_source_idx";--> statement-breakpoint
DROP INDEX "program_impact_metric_links_org_metric_idx";--> statement-breakpoint
DROP INDEX "program_reporting_requirement_links_org_requirement_idx";--> statement-breakpoint
ALTER TABLE "restriction_additions" ADD CONSTRAINT "restriction_additions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restriction_additions" ADD CONSTRAINT "restriction_additions_restriction_term_id_restriction_terms_id_fk" FOREIGN KEY ("restriction_term_id") REFERENCES "public"."restriction_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restriction_additions" ADD CONSTRAINT "restriction_additions_donation_id_donations_id_fk" FOREIGN KEY ("donation_id") REFERENCES "public"."donations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restriction_additions" ADD CONSTRAINT "restriction_additions_grant_id_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restriction_additions" ADD CONSTRAINT "restriction_additions_journal_line_id_journal_lines_id_fk" FOREIGN KEY ("journal_line_id") REFERENCES "public"."journal_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restriction_additions" ADD CONSTRAINT "restriction_additions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restriction_allowed_categories" ADD CONSTRAINT "restriction_allowed_categories_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restriction_allowed_categories" ADD CONSTRAINT "restriction_allowed_categories_restriction_term_id_restriction_terms_id_fk" FOREIGN KEY ("restriction_term_id") REFERENCES "public"."restriction_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restriction_allowed_categories" ADD CONSTRAINT "restriction_allowed_categories_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restriction_allowed_programs" ADD CONSTRAINT "restriction_allowed_programs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restriction_allowed_programs" ADD CONSTRAINT "restriction_allowed_programs_restriction_term_id_restriction_terms_id_fk" FOREIGN KEY ("restriction_term_id") REFERENCES "public"."restriction_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restriction_balances" ADD CONSTRAINT "restriction_balances_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restriction_balances" ADD CONSTRAINT "restriction_balances_restriction_term_id_restriction_terms_id_fk" FOREIGN KEY ("restriction_term_id") REFERENCES "public"."restriction_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restriction_balances" ADD CONSTRAINT "restriction_balances_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restriction_balances" ADD CONSTRAINT "restriction_balances_grant_id_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restriction_balances" ADD CONSTRAINT "restriction_balances_generated_report_id_generated_reports_id_fk" FOREIGN KEY ("generated_report_id") REFERENCES "public"."generated_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restriction_balances" ADD CONSTRAINT "restriction_balances_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restriction_evidence_links" ADD CONSTRAINT "restriction_evidence_links_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restriction_evidence_links" ADD CONSTRAINT "restriction_evidence_links_restriction_release_id_restriction_releases_id_fk" FOREIGN KEY ("restriction_release_id") REFERENCES "public"."restriction_releases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restriction_evidence_links" ADD CONSTRAINT "restriction_evidence_links_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restriction_evidence_links" ADD CONSTRAINT "restriction_evidence_links_generated_report_id_generated_reports_id_fk" FOREIGN KEY ("generated_report_id") REFERENCES "public"."generated_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restriction_evidence_links" ADD CONSTRAINT "restriction_evidence_links_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restriction_releases" ADD CONSTRAINT "restriction_releases_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restriction_releases" ADD CONSTRAINT "restriction_releases_restriction_term_id_restriction_terms_id_fk" FOREIGN KEY ("restriction_term_id") REFERENCES "public"."restriction_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restriction_releases" ADD CONSTRAINT "restriction_releases_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restriction_releases" ADD CONSTRAINT "restriction_releases_journal_line_id_journal_lines_id_fk" FOREIGN KEY ("journal_line_id") REFERENCES "public"."journal_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restriction_releases" ADD CONSTRAINT "restriction_releases_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restriction_terms" ADD CONSTRAINT "restriction_terms_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restriction_terms" ADD CONSTRAINT "restriction_terms_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restriction_terms" ADD CONSTRAINT "restriction_terms_grant_id_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restriction_terms" ADD CONSTRAINT "restriction_terms_donation_id_donations_id_fk" FOREIGN KEY ("donation_id") REFERENCES "public"."donations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restriction_terms" ADD CONSTRAINT "restriction_terms_source_document_id_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restriction_terms" ADD CONSTRAINT "restriction_terms_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "restriction_additions_org_term_idx" ON "restriction_additions" USING btree ("org_id","restriction_term_id");--> statement-breakpoint
CREATE INDEX "restriction_additions_org_date_idx" ON "restriction_additions" USING btree ("org_id","date");--> statement-breakpoint
CREATE INDEX "restriction_allowed_categories_org_term_idx" ON "restriction_allowed_categories" USING btree ("org_id","restriction_term_id");--> statement-breakpoint
CREATE INDEX "restriction_allowed_programs_org_term_idx" ON "restriction_allowed_programs" USING btree ("org_id","restriction_term_id");--> statement-breakpoint
CREATE INDEX "restriction_balances_org_term_idx" ON "restriction_balances" USING btree ("org_id","restriction_term_id");--> statement-breakpoint
CREATE INDEX "restriction_balances_org_period_idx" ON "restriction_balances" USING btree ("org_id","period_start","period_end");--> statement-breakpoint
CREATE INDEX "restriction_evidence_links_org_release_idx" ON "restriction_evidence_links" USING btree ("org_id","restriction_release_id");--> statement-breakpoint
CREATE INDEX "restriction_releases_org_term_idx" ON "restriction_releases" USING btree ("org_id","restriction_term_id");--> statement-breakpoint
CREATE INDEX "restriction_releases_org_date_idx" ON "restriction_releases" USING btree ("org_id","date");--> statement-breakpoint
CREATE INDEX "restriction_terms_org_active_idx" ON "restriction_terms" USING btree ("org_id","deleted_at");--> statement-breakpoint
CREATE INDEX "restriction_terms_org_fund_idx" ON "restriction_terms" USING btree ("org_id","fund_id");--> statement-breakpoint
CREATE INDEX "restriction_terms_org_grant_idx" ON "restriction_terms" USING btree ("org_id","grant_id");--> statement-breakpoint
CREATE INDEX "restriction_terms_org_donation_idx" ON "restriction_terms" USING btree ("org_id","donation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_members_org_user_idx" ON "org_members" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "grant_opportunities_org_source_idx" ON "grant_opportunities" USING btree ("org_id","source","source_opportunity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "program_impact_metric_links_org_metric_idx" ON "program_impact_metric_links" USING btree ("org_id","impact_metric_id","program_id") WHERE "program_impact_metric_links"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "program_reporting_requirement_links_org_requirement_idx" ON "program_reporting_requirement_links" USING btree ("org_id","reporting_requirement_id","program_id") WHERE "program_reporting_requirement_links"."deleted_at" is null;