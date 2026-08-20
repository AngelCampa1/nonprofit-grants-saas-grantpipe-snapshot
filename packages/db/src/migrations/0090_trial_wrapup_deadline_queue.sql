DROP INDEX "trial_email_schedule_org_wrapup_unique";--> statement-breakpoint
ALTER TABLE "trial_email_schedule" ADD COLUMN "trial_deadline_at" timestamp with time zone;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "trial_email_schedule_set_wrapup_deadline"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parsed_deadline timestamp with time zone;
BEGIN
  IF NEW.email_kind = 'trial_wrapup' AND NEW.trial_deadline_at IS NULL THEN
    BEGIN
      parsed_deadline := (NEW.delivery_snapshot ->> 'trialEndsAt')::timestamp with time zone;
    EXCEPTION
      WHEN invalid_datetime_format OR datetime_field_overflow THEN
        parsed_deadline := NULL;
    END;

    IF parsed_deadline IS NULL THEN
      SELECT organization.trial_ends_at
      INTO parsed_deadline
      FROM organizations AS organization
      WHERE organization.id = NEW.org_id;
    END IF;

    IF parsed_deadline IS NULL THEN
      RAISE EXCEPTION 'trial wrapup deadline is required';
    END IF;

    NEW.trial_deadline_at := parsed_deadline;
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
DO $$
DECLARE
  candidate RECORD;
  snapshot_deadline timestamp with time zone;
BEGIN
  FOR candidate IN
    SELECT schedule."id" AS schedule_id,
           schedule.delivery_snapshot ->> 'trialEndsAt' AS snapshot_value,
           org."trial_ends_at" AS current_deadline
    FROM "trial_email_schedule" schedule
    JOIN "organizations" org ON org."id" = schedule."org_id"
    WHERE schedule."email_kind" = 'trial_wrapup'
  LOOP
    snapshot_deadline := NULL;
    BEGIN
      snapshot_deadline := candidate.snapshot_value::timestamp with time zone;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      snapshot_deadline := NULL;
    END;

    UPDATE "trial_email_schedule"
    SET "trial_deadline_at" = COALESCE(snapshot_deadline, candidate.current_deadline)
    WHERE "id" = candidate.schedule_id;
  END LOOP;
END $$;--> statement-breakpoint
UPDATE "trial_email_schedule"
SET "email_kind" = 'trial_wrapup_quarantined:missing_deadline:' || "id",
    "error" = COALESCE("error", 'delivery_ambiguous:missing_deadline'),
    "updated_at" = now()
WHERE "email_kind" = 'trial_wrapup'
  AND "sent_at" IS NULL
  AND "trial_deadline_at" IS NULL;--> statement-breakpoint
CREATE TRIGGER "trial_email_schedule_set_wrapup_deadline"
BEFORE INSERT OR UPDATE OF email_kind, delivery_snapshot, trial_deadline_at
ON "trial_email_schedule"
FOR EACH ROW
EXECUTE FUNCTION "trial_email_schedule_set_wrapup_deadline"();--> statement-breakpoint
CREATE UNIQUE INDEX "trial_email_schedule_org_wrapup_deadline_unique" ON "trial_email_schedule" USING btree ("org_id","trial_deadline_at") WHERE "trial_email_schedule"."email_kind" = 'trial_wrapup' AND "trial_email_schedule"."sent_at" IS NULL;
