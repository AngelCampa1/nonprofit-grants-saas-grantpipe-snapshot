ALTER TABLE "grant_payment_request_lines"
ADD COLUMN "dedup_released_at" timestamp with time zone;

UPDATE "grant_payment_request_lines" AS "line"
SET "dedup_released_at" = now()
FROM "grant_payment_requests" AS "request"
WHERE "request"."id" = "line"."request_id"
  AND "request"."org_id" = "line"."org_id"
  AND "request"."status" = 'rejected'
  AND "request"."deleted_at" IS NULL
  AND "line"."expense_id" IS NOT NULL
  AND "line"."deleted_at" IS NULL;

DO $$
DECLARE
  duplicate_summary text;
BEGIN
  SELECT string_agg(
    format('%s/%s (%s lines)', "org_id", "expense_id", "line_count"),
    ', '
    ORDER BY "org_id", "expense_id"
  )
  INTO duplicate_summary
  FROM (
    SELECT
      "org_id",
      "expense_id",
      count(*) AS "line_count"
    FROM "grant_payment_request_lines"
    WHERE "expense_id" IS NOT NULL
      AND "deleted_at" IS NULL
      AND "dedup_released_at" IS NULL
    GROUP BY "org_id", "expense_id"
    HAVING count(*) > 1
  ) AS duplicates;

  IF duplicate_summary IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot create payment request expense dedup index; duplicate active expense lines exist: %',
      duplicate_summary;
  END IF;
END $$;

CREATE UNIQUE INDEX "grant_payment_request_lines_org_expense_active_idx"
ON "grant_payment_request_lines" USING btree ("org_id","expense_id")
WHERE "grant_payment_request_lines"."expense_id" IS NOT NULL
  AND "grant_payment_request_lines"."deleted_at" IS NULL
  AND "grant_payment_request_lines"."dedup_released_at" IS NULL;
