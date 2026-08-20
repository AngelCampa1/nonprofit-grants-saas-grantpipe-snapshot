ALTER TABLE "generated_reports" ADD COLUMN "ready_effects_status" text;--> statement-breakpoint
ALTER TABLE "generated_reports" ADD COLUMN "ready_effects_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "generated_reports" ADD COLUMN "ready_effects_analytics_delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "generated_reports" ADD COLUMN "ready_effects_trial_tier" text;--> statement-breakpoint
ALTER TABLE "generated_reports" ADD COLUMN "ready_effects_trial_usage_recorded_at" timestamp with time zone;
