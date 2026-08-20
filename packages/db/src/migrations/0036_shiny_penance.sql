CREATE TABLE "grant_indirect_cost_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"grant_id" text,
	"base" text NOT NULL,
	"rate_basis_points" integer NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "grant_payment_request_adjustments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"request_id" text NOT NULL,
	"kind" text NOT NULL,
	"amount_cents" bigint,
	"reason" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "grant_payment_request_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"request_id" text NOT NULL,
	"expense_id" text,
	"budget_line_id" text,
	"category" text DEFAULT 'direct' NOT NULL,
	"description" text,
	"amount_cents" bigint NOT NULL,
	"approved_amount_cents" bigint,
	"rejection_reason" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "grant_payment_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"grant_id" text NOT NULL,
	"request_number" integer NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"requested_amount_cents" bigint DEFAULT 0 NOT NULL,
	"approved_amount_cents" bigint DEFAULT 0 NOT NULL,
	"funder_reference" text,
	"notes" text,
	"auto_post_journal_entry" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "grant_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"request_id" text NOT NULL,
	"grant_id" text NOT NULL,
	"received_date" timestamp with time zone NOT NULL,
	"amount_cents" bigint NOT NULL,
	"reference_number" text,
	"method" text,
	"journal_entry_id" text,
	"bank_transaction_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "reimbursable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "grant_indirect_cost_rules" ADD CONSTRAINT "grant_indirect_cost_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_indirect_cost_rules" ADD CONSTRAINT "grant_indirect_cost_rules_grant_id_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_payment_request_adjustments" ADD CONSTRAINT "grant_payment_request_adjustments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_payment_request_adjustments" ADD CONSTRAINT "grant_payment_request_adjustments_request_id_grant_payment_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."grant_payment_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_payment_request_adjustments" ADD CONSTRAINT "grant_payment_request_adjustments_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_payment_request_lines" ADD CONSTRAINT "grant_payment_request_lines_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_payment_request_lines" ADD CONSTRAINT "grant_payment_request_lines_request_id_grant_payment_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."grant_payment_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_payment_request_lines" ADD CONSTRAINT "grant_payment_request_lines_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_payment_requests" ADD CONSTRAINT "grant_payment_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_payment_requests" ADD CONSTRAINT "grant_payment_requests_grant_id_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_payment_requests" ADD CONSTRAINT "grant_payment_requests_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_payments" ADD CONSTRAINT "grant_payments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_payments" ADD CONSTRAINT "grant_payments_request_id_grant_payment_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."grant_payment_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_payments" ADD CONSTRAINT "grant_payments_grant_id_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_payments" ADD CONSTRAINT "grant_payments_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_payments" ADD CONSTRAINT "grant_payments_bank_transaction_id_bank_transactions_id_fk" FOREIGN KEY ("bank_transaction_id") REFERENCES "public"."bank_transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "grant_indirect_cost_rules_org_grant_idx" ON "grant_indirect_cost_rules" USING btree ("org_id","grant_id");--> statement-breakpoint
CREATE INDEX "grant_payment_request_adjustments_org_request_idx" ON "grant_payment_request_adjustments" USING btree ("org_id","request_id");--> statement-breakpoint
CREATE INDEX "grant_payment_request_lines_org_request_idx" ON "grant_payment_request_lines" USING btree ("org_id","request_id");--> statement-breakpoint
CREATE INDEX "grant_payment_request_lines_expense_idx" ON "grant_payment_request_lines" USING btree ("expense_id");--> statement-breakpoint
CREATE UNIQUE INDEX "grant_payment_requests_org_number_idx" ON "grant_payment_requests" USING btree ("org_id","request_number");--> statement-breakpoint
CREATE INDEX "grant_payment_requests_org_grant_status_idx" ON "grant_payment_requests" USING btree ("org_id","grant_id","status");--> statement-breakpoint
CREATE INDEX "grant_payment_requests_org_status_idx" ON "grant_payment_requests" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "grant_payments_org_grant_date_idx" ON "grant_payments" USING btree ("org_id","grant_id","received_date");--> statement-breakpoint
CREATE INDEX "grant_payments_org_request_idx" ON "grant_payments" USING btree ("org_id","request_id");