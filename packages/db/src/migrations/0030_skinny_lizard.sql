CREATE TABLE "grant_opportunities" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"source" text DEFAULT 'grants.gov' NOT NULL,
	"source_opportunity_id" text NOT NULL,
	"opportunity_number" text,
	"title" text NOT NULL,
	"agency_name" text,
	"status" text,
	"posted_date" timestamp with time zone,
	"close_date" timestamp with time zone,
	"award_floor_cents" integer,
	"award_ceiling_cents" integer,
	"eligible_applicants" jsonb,
	"funding_categories" jsonb,
	"official_url" text,
	"raw_payload" jsonb,
	"last_fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "grant_opportunity_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"opportunity_id" text NOT NULL,
	"user_id" text,
	"state" text NOT NULL,
	"owner_user_id" text,
	"notes" text,
	"reminder_at" timestamp with time zone,
	"converted_grant_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "grant_opportunity_saved_searches" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_by" text,
	"name" text NOT NULL,
	"filters" jsonb NOT NULL,
	"email_reminders_enabled" boolean DEFAULT true NOT NULL,
	"reminder_days_before_deadline" integer DEFAULT 14 NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "grant_opportunities" ADD CONSTRAINT "grant_opportunities_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_opportunity_actions" ADD CONSTRAINT "grant_opportunity_actions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_opportunity_actions" ADD CONSTRAINT "grant_opportunity_actions_opportunity_id_grant_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."grant_opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_opportunity_actions" ADD CONSTRAINT "grant_opportunity_actions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_opportunity_actions" ADD CONSTRAINT "grant_opportunity_actions_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_opportunity_actions" ADD CONSTRAINT "grant_opportunity_actions_converted_grant_id_grants_id_fk" FOREIGN KEY ("converted_grant_id") REFERENCES "public"."grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_opportunity_saved_searches" ADD CONSTRAINT "grant_opportunity_saved_searches_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_opportunity_saved_searches" ADD CONSTRAINT "grant_opportunity_saved_searches_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "grant_opportunities_org_source_idx" ON "grant_opportunities" USING btree ("org_id","source","source_opportunity_id");--> statement-breakpoint
CREATE INDEX "grant_opportunities_org_close_date_idx" ON "grant_opportunities" USING btree ("org_id","close_date");--> statement-breakpoint
CREATE UNIQUE INDEX "grant_opportunity_actions_org_opportunity_idx" ON "grant_opportunity_actions" USING btree ("org_id","opportunity_id");--> statement-breakpoint
CREATE INDEX "grant_opportunity_actions_org_state_idx" ON "grant_opportunity_actions" USING btree ("org_id","state");--> statement-breakpoint
CREATE INDEX "grant_opportunity_saved_searches_org_idx" ON "grant_opportunity_saved_searches" USING btree ("org_id");