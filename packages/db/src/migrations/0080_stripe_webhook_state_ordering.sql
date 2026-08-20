ALTER TABLE "organizations" ADD COLUMN "stripe_state_event_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_state_event_id" text;