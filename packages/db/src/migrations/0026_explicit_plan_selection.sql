ALTER TABLE "organizations" ADD COLUMN "plan_selected_at" timestamp with time zone;

UPDATE "organizations"
SET "plan_selected_at" = COALESCE("updated_at", "created_at", now())
WHERE "plan_selected_at" IS NULL;
