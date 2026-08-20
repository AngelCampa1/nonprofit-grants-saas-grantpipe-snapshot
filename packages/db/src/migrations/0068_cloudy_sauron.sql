CREATE TABLE "recurring_gift_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"donation_id" text,
	"stripe_event_id" text,
	"stripe_invoice_id" text,
	"stripe_payment_intent_id" text,
	"amount_cents" bigint NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"status" text NOT NULL,
	"failure_code" text,
	"failure_message" text,
	"attempted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_gift_connect_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"stripe_account_id" text NOT NULL,
	"status" text DEFAULT 'onboarding_required' NOT NULL,
	"charges_enabled" boolean DEFAULT false NOT NULL,
	"details_submitted" boolean DEFAULT false NOT NULL,
	"payouts_enabled" boolean DEFAULT false NOT NULL,
	"onboarding_started_at" timestamp with time zone,
	"onboarded_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_gift_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"created_by" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"interval" text DEFAULT 'month' NOT NULL,
	"status" text DEFAULT 'checkout_pending' NOT NULL,
	"fund_id" text,
	"grant_id" text,
	"restriction" text DEFAULT 'unrestricted' NOT NULL,
	"designation" text,
	"notes" text,
	"stripe_account_id" text NOT NULL,
	"stripe_checkout_session_id" text,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"latest_invoice_id" text,
	"failure_count" bigint DEFAULT 0 NOT NULL,
	"next_charge_at" timestamp with time zone,
	"last_paid_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "recurring_gift_attempts" ADD CONSTRAINT "recurring_gift_attempts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_gift_attempts" ADD CONSTRAINT "recurring_gift_attempts_plan_id_recurring_gift_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."recurring_gift_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_gift_attempts" ADD CONSTRAINT "recurring_gift_attempts_donation_id_donations_id_fk" FOREIGN KEY ("donation_id") REFERENCES "public"."donations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_gift_connect_accounts" ADD CONSTRAINT "recurring_gift_connect_accounts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_gift_plans" ADD CONSTRAINT "recurring_gift_plans_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_gift_plans" ADD CONSTRAINT "recurring_gift_plans_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_gift_plans" ADD CONSTRAINT "recurring_gift_plans_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_gift_attempts_org_plan_created_idx" ON "recurring_gift_attempts" USING btree ("org_id","plan_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_gift_attempts_event_unique" ON "recurring_gift_attempts" USING btree ("stripe_event_id") WHERE "recurring_gift_attempts"."stripe_event_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_gift_attempts_invoice_status_unique" ON "recurring_gift_attempts" USING btree ("stripe_invoice_id","status") WHERE "recurring_gift_attempts"."stripe_invoice_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_gift_attempts_paid_invoice_unique" ON "recurring_gift_attempts" USING btree ("stripe_invoice_id") WHERE "recurring_gift_attempts"."donation_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_gift_connect_accounts_org_id_unique" ON "recurring_gift_connect_accounts" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_gift_connect_accounts_stripe_account_id_unique" ON "recurring_gift_connect_accounts" USING btree ("stripe_account_id");--> statement-breakpoint
CREATE INDEX "recurring_gift_plans_org_status_next_charge_idx" ON "recurring_gift_plans" USING btree ("org_id","status","next_charge_at");--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_gift_plans_subscription_unique" ON "recurring_gift_plans" USING btree ("stripe_subscription_id") WHERE "recurring_gift_plans"."stripe_subscription_id" is not null;
