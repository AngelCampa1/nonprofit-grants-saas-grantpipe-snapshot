CREATE TABLE "pledge_installments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"pledge_id" text NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"amount_cents" bigint NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"paid_cents" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pledge_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"pledge_id" text NOT NULL,
	"installment_id" text,
	"amount_cents" bigint NOT NULL,
	"payment_date" timestamp with time zone NOT NULL,
	"accretion_cents" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pledges" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"fund_id" text,
	"grant_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"is_conditional" boolean DEFAULT false NOT NULL,
	"has_barrier" boolean DEFAULT false NOT NULL,
	"has_right_of_return" boolean DEFAULT false NOT NULL,
	"condition_note" text,
	"face_amount_cents" bigint NOT NULL,
	"pledge_date" timestamp with time zone NOT NULL,
	"discount_rate_basis_points" integer DEFAULT 0 NOT NULL,
	"present_value_cents" bigint NOT NULL,
	"discount_cents" bigint DEFAULT 0 NOT NULL,
	"net_asset_class" text DEFAULT 'temporarily_restricted' NOT NULL,
	"allowance_cents" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "pledge_installments" ADD CONSTRAINT "pledge_installments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pledge_installments" ADD CONSTRAINT "pledge_installments_pledge_id_pledges_id_fk" FOREIGN KEY ("pledge_id") REFERENCES "public"."pledges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pledge_payments" ADD CONSTRAINT "pledge_payments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pledge_payments" ADD CONSTRAINT "pledge_payments_pledge_id_pledges_id_fk" FOREIGN KEY ("pledge_id") REFERENCES "public"."pledges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pledge_payments" ADD CONSTRAINT "pledge_payments_installment_id_pledge_installments_id_fk" FOREIGN KEY ("installment_id") REFERENCES "public"."pledge_installments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pledges" ADD CONSTRAINT "pledges_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pledges" ADD CONSTRAINT "pledges_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pledge_installments_org_pledge_due_date_idx" ON "pledge_installments" USING btree ("org_id","pledge_id","due_date");--> statement-breakpoint
CREATE INDEX "pledge_payments_org_pledge_payment_date_idx" ON "pledge_payments" USING btree ("org_id","pledge_id","payment_date");--> statement-breakpoint
CREATE INDEX "pledges_org_status_pledge_date_idx" ON "pledges" USING btree ("org_id","status","pledge_date");