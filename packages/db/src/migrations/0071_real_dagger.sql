CREATE TABLE "ai_usage_events" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"feature" text NOT NULL,
	"reference_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_events_org_feature_created_idx" ON "ai_usage_events" USING btree ("org_id","feature","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_usage_events_dedupe_idx" ON "ai_usage_events" USING btree ("org_id","feature","reference_id") WHERE reference_id is not null;