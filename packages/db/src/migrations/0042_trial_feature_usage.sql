CREATE TABLE "org_trial_feature_usage" (
	"org_id" text NOT NULL,
	"required_tier" text NOT NULL,
	"first_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"use_count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "org_trial_feature_usage_org_id_required_tier_pk" PRIMARY KEY("org_id","required_tier")
);
--> statement-breakpoint
ALTER TABLE "org_trial_feature_usage" ADD CONSTRAINT "org_trial_feature_usage_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "org_trial_feature_usage_org_idx" ON "org_trial_feature_usage" USING btree ("org_id");