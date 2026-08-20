CREATE TABLE "referrals" (
	"id" text PRIMARY KEY NOT NULL,
	"referrer_org_id" text NOT NULL,
	"referred_org_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "referral_bonus_3_granted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "referral_bonus_10_granted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing_events" ADD COLUMN "stripe_event_id" text;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_org_id_organizations_id_fk" FOREIGN KEY ("referrer_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_org_id_organizations_id_fk" FOREIGN KEY ("referred_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_events_stripe_event_id_unique" ON "billing_events" USING btree ("stripe_event_id") WHERE "billing_events"."stripe_event_id" is not null;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_referral_code_unique" UNIQUE("referral_code");