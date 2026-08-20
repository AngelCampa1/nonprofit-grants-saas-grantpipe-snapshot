ALTER TABLE "organizations" ADD COLUMN "trial_wrapup_claimed_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "trial_email_schedule_org_user_non_wrapup_unique" ON "trial_email_schedule" USING btree ("org_id","user_id","email_kind") WHERE "trial_email_schedule"."email_kind" <> 'trial_wrapup';--> statement-breakpoint
DROP INDEX "trial_email_schedule_org_user_kind_unique";--> statement-breakpoint
WITH ranked_wrapups AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "org_id"
    ORDER BY CASE
      WHEN "error" LIKE 'delivery_in_progress:%' THEN 0
      WHEN "error" LIKE 'delivery_ambiguous:%' THEN 0
      ELSE 1
    END,
    "created_at" DESC, "id" DESC
  ) AS keep_rank
  FROM "trial_email_schedule"
  WHERE "email_kind" = 'trial_wrapup' AND "sent_at" IS NULL
)
UPDATE "trial_email_schedule"
SET "email_kind" = 'trial_wrapup_superseded',
    "error" = 'superseded_by_org_wrapup_dedupe',
    "updated_at" = now()
WHERE "id" IN (SELECT "id" FROM ranked_wrapups WHERE keep_rank > 1);--> statement-breakpoint
UPDATE "trial_email_schedule"
SET "error" = 'delivery_ambiguous:migration_0084_uncertain_delivery',
    "updated_at" = now()
WHERE "email_kind" = 'trial_wrapup'
  AND "sent_at" IS NULL
  AND "error" LIKE 'delivery_in_progress:%';--> statement-breakpoint
CREATE UNIQUE INDEX "trial_email_schedule_org_wrapup_unique" ON "trial_email_schedule" USING btree ("org_id") WHERE "trial_email_schedule"."email_kind" = 'trial_wrapup' AND "trial_email_schedule"."sent_at" IS NULL;
