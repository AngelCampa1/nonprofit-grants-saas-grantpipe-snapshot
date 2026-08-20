ALTER TABLE "organizations" ADD COLUMN "trial_wrapup_claimed_for_end_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "trial_wrapup_notified_for_end_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "trial_wrapup_scheduled_for_end_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trial_email_schedule" ADD COLUMN "delivery_snapshot" jsonb;--> statement-breakpoint
UPDATE "organizations"
SET "trial_wrapup_notified_for_end_at" = "trial_ends_at"
WHERE "trial_will_end_notified_at" IS NOT NULL
  AND "trial_ends_at" IS NOT NULL;--> statement-breakpoint
