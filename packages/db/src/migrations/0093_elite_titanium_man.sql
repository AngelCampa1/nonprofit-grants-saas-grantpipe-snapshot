ALTER TABLE "notifications" ADD COLUMN "email_delivery_status" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "email_request_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "email_request_fingerprint" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "email_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "email_attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "email_provider_message_id" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "email_last_error" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "email_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "document_extractions" ADD COLUMN "dispatch_request_fingerprint" text;--> statement-breakpoint
CREATE INDEX "notifications_email_delivery_status_idx" ON "notifications" USING btree ("email_delivery_status","email_claimed_at");