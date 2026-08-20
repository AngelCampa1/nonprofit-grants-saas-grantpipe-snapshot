ALTER TABLE "external_review_sessions" ADD COLUMN "invitation_delivery_status" text DEFAULT 'sent' NOT NULL;--> statement-breakpoint
ALTER TABLE "external_review_sessions" ADD COLUMN "invitation_delivery_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "external_review_sessions" ADD COLUMN "invitation_delivery_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "external_review_sessions" ADD COLUMN "invitation_delivery_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "external_review_sessions" ADD COLUMN "invitation_provider_id" text;--> statement-breakpoint
ALTER TABLE "external_review_sessions" ADD COLUMN "invitation_delivery_error" text;--> statement-breakpoint
UPDATE "external_review_sessions"
SET "invitation_delivery_status" = 'sent',
    "invitation_delivery_started_at" = "created_at",
    "invitation_delivery_sent_at" = "created_at";--> statement-breakpoint
CREATE INDEX "external_review_sessions_invitation_delivery_idx" ON "external_review_sessions" USING btree ("invitation_delivery_status","invitation_delivery_claimed_at");
