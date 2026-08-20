CREATE TABLE IF NOT EXISTS "external_reviewers" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL REFERENCES "public"."organizations"("id"),
	"email" text NOT NULL,
	"name" text NOT NULL,
	"reviewer_type" text NOT NULL,
	"organization_name" text,
	"notes" text,
	"created_by" text REFERENCES "public"."user"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "external_review_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL REFERENCES "public"."organizations"("id"),
	"reviewer_id" text NOT NULL REFERENCES "public"."external_reviewers"("id"),
	"token_hash" text NOT NULL,
	"purpose" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" text REFERENCES "public"."user"("id"),
	"last_accessed_at" timestamp with time zone,
	"created_by" text REFERENCES "public"."user"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_review_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "external_review_scopes" (
	"session_id" text NOT NULL REFERENCES "public"."external_review_sessions"("id"),
	"scope_type" text NOT NULL,
	"scope_id" text NOT NULL,
	"granted_by" text REFERENCES "public"."user"("id"),
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_review_scopes_session_id_scope_type_scope_id_pk" PRIMARY KEY("session_id","scope_type","scope_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evidence_bundles" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL REFERENCES "public"."organizations"("id"),
	"title" text NOT NULL,
	"description" text,
	"purpose" text NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"created_by" text REFERENCES "public"."user"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evidence_bundle_items" (
	"id" text PRIMARY KEY NOT NULL,
	"bundle_id" text NOT NULL REFERENCES "public"."evidence_bundles"("id"),
	"item_type" text NOT NULL,
	"item_id" text NOT NULL,
	"caption" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "external_review_audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL REFERENCES "public"."organizations"("id"),
	"session_id" text NOT NULL REFERENCES "public"."external_review_sessions"("id"),
	"reviewer_id" text NOT NULL REFERENCES "public"."external_reviewers"("id"),
	"event_type" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"ip_hash" text,
	"user_agent_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "external_reviewers_org_idx" ON "external_reviewers" USING btree ("org_id","deleted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "external_reviewers_org_email_idx" ON "external_reviewers" USING btree ("org_id","email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "external_review_sessions_org_idx" ON "external_review_sessions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "external_review_sessions_reviewer_idx" ON "external_review_sessions" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "external_review_sessions_token_hash_idx" ON "external_review_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "external_review_scopes_session_idx" ON "external_review_scopes" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "external_review_scopes_scope_idx" ON "external_review_scopes" USING btree ("scope_type","scope_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evidence_bundles_org_active_idx" ON "evidence_bundles" USING btree ("org_id","deleted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evidence_bundles_org_purpose_idx" ON "evidence_bundles" USING btree ("org_id","purpose");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evidence_bundle_items_bundle_idx" ON "evidence_bundle_items" USING btree ("bundle_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evidence_bundle_items_item_idx" ON "evidence_bundle_items" USING btree ("item_type","item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "external_review_audit_events_org_idx" ON "external_review_audit_events" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "external_review_audit_events_session_idx" ON "external_review_audit_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "external_review_audit_events_reviewer_idx" ON "external_review_audit_events" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "external_review_audit_events_created_at_idx" ON "external_review_audit_events" USING btree ("created_at");
