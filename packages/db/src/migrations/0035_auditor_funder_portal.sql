CREATE TABLE "external_reviewers" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"reviewer_type" text NOT NULL,
	"organization_name" text,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "external_review_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"reviewer_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"purpose" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	"last_accessed_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_review_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "external_review_scopes" (
	"session_id" text NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" text NOT NULL,
	"granted_by" text,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_review_scopes_session_id_scope_type_scope_id_pk" PRIMARY KEY("session_id","scope_type","scope_id")
);
--> statement-breakpoint
CREATE TABLE "evidence_bundles" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"purpose" text NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "evidence_bundle_items" (
	"id" text PRIMARY KEY NOT NULL,
	"bundle_id" text NOT NULL,
	"item_type" text NOT NULL,
	"item_id" text NOT NULL,
	"caption" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_review_audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"session_id" text NOT NULL,
	"reviewer_id" text NOT NULL,
	"event_type" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"ip_hash" text,
	"user_agent_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "external_reviewers" ADD CONSTRAINT "external_reviewers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_reviewers" ADD CONSTRAINT "external_reviewers_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_review_sessions" ADD CONSTRAINT "external_review_sessions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_review_sessions" ADD CONSTRAINT "external_review_sessions_reviewer_id_external_reviewers_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."external_reviewers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_review_sessions" ADD CONSTRAINT "external_review_sessions_revoked_by_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_review_sessions" ADD CONSTRAINT "external_review_sessions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_review_scopes" ADD CONSTRAINT "external_review_scopes_session_id_external_review_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."external_review_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_review_scopes" ADD CONSTRAINT "external_review_scopes_granted_by_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_bundles" ADD CONSTRAINT "evidence_bundles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_bundles" ADD CONSTRAINT "evidence_bundles_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_bundle_items" ADD CONSTRAINT "evidence_bundle_items_bundle_id_evidence_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."evidence_bundles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_review_audit_events" ADD CONSTRAINT "external_review_audit_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_review_audit_events" ADD CONSTRAINT "external_review_audit_events_session_id_external_review_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."external_review_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_review_audit_events" ADD CONSTRAINT "external_review_audit_events_reviewer_id_external_reviewers_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."external_reviewers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "external_reviewers_org_idx" ON "external_reviewers" USING btree ("org_id","deleted_at");--> statement-breakpoint
CREATE INDEX "external_reviewers_org_email_idx" ON "external_reviewers" USING btree ("org_id","email");--> statement-breakpoint
CREATE INDEX "external_review_sessions_org_idx" ON "external_review_sessions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "external_review_sessions_reviewer_idx" ON "external_review_sessions" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX "external_review_sessions_token_hash_idx" ON "external_review_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "external_review_scopes_session_idx" ON "external_review_scopes" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "external_review_scopes_scope_idx" ON "external_review_scopes" USING btree ("scope_type","scope_id");--> statement-breakpoint
CREATE INDEX "evidence_bundles_org_active_idx" ON "evidence_bundles" USING btree ("org_id","deleted_at");--> statement-breakpoint
CREATE INDEX "evidence_bundles_org_purpose_idx" ON "evidence_bundles" USING btree ("org_id","purpose");--> statement-breakpoint
CREATE INDEX "evidence_bundle_items_bundle_idx" ON "evidence_bundle_items" USING btree ("bundle_id");--> statement-breakpoint
CREATE INDEX "evidence_bundle_items_item_idx" ON "evidence_bundle_items" USING btree ("item_type","item_id");--> statement-breakpoint
CREATE INDEX "external_review_audit_events_org_idx" ON "external_review_audit_events" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "external_review_audit_events_session_idx" ON "external_review_audit_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "external_review_audit_events_reviewer_idx" ON "external_review_audit_events" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX "external_review_audit_events_created_at_idx" ON "external_review_audit_events" USING btree ("created_at");
