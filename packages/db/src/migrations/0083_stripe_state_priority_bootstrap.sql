ALTER TABLE "organizations" ADD COLUMN "stripe_state_event_priority" integer;--> statement-breakpoint
UPDATE "organizations"
SET "stripe_state_event_priority" = CASE
  WHEN "subscription_status" = 'canceled' THEN 100
  WHEN "subscription_status" = 'past_due' THEN 80
  WHEN "subscription_status" = 'trialing' THEN 70
  WHEN "subscription_status" = 'active' THEN 60
  ELSE 80
END
WHERE "stripe_state_event_created_at" IS NOT NULL
  AND "stripe_state_event_priority" IS NULL;
