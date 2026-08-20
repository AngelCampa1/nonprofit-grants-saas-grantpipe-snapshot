DROP INDEX "notifications_org_user_dedupe_unique";--> statement-breakpoint
ALTER TABLE "donations" ALTER COLUMN "amount_cents" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "amount_cents" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "grant_fund_allocations" ALTER COLUMN "allocated_amount_cents" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "grants" ALTER COLUMN "amount_cents" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "revenue_goal_cents" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "journal_lines" ALTER COLUMN "debit_cents" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "journal_lines" ALTER COLUMN "credit_cents" SET DATA TYPE bigint;--> statement-breakpoint
CREATE INDEX "contacts_org_id_idx" ON "contacts" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "expenses_org_id_idx" ON "expenses" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "funder_contacts_org_id_idx" ON "funder_contacts" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "funders_org_id_idx" ON "funders" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "funds_org_id_idx" ON "funds" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "grant_impact_metrics_org_id_idx" ON "grant_impact_metrics" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "grants_org_id_idx" ON "grants" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fiscal_periods_org_name_unique" ON "fiscal_periods" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "journal_lines_org_id_idx" ON "journal_lines" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "journal_lines_account_id_idx" ON "journal_lines" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "journal_lines_journal_entry_id_idx" ON "journal_lines" USING btree ("journal_entry_id");--> statement-breakpoint
CREATE INDEX "journal_lines_fund_id_idx" ON "journal_lines" USING btree ("fund_id");--> statement-breakpoint
CREATE INDEX "journal_lines_grant_id_idx" ON "journal_lines" USING btree ("grant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_org_user_dedupe_unique" ON "notifications" USING btree ("org_id","user_id","dedupe_key") WHERE "notifications"."dedupe_key" is not null;