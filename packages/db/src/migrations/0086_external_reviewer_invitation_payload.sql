ALTER TABLE "external_review_sessions" ADD COLUMN "invitation_delivery_attempt" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "external_review_sessions" ADD COLUMN "invitation_delivery_kind" text DEFAULT 'invite' NOT NULL;
--> statement-breakpoint
ALTER TABLE "external_review_sessions" ADD COLUMN "invitation_delivery_payload" jsonb;
