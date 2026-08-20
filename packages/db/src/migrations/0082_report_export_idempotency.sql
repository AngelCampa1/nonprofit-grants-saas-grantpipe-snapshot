ALTER TABLE "generated_reports" ADD COLUMN "attempt_id" text;--> statement-breakpoint
ALTER TABLE "generated_reports" ADD COLUMN "recovery_attempted_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "generated_reports_org_type_attempt_idx" ON "generated_reports" USING btree ("org_id","type","attempt_id") WHERE "generated_reports"."attempt_id" is not null;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    WITH ranked AS (
      SELECT
        "restriction_balances".*,
        first_value("id") OVER (
          PARTITION BY "generated_report_id", "restriction_term_id"
          ORDER BY "created_at", "id"
        ) AS "canonical_id",
        row_number() OVER (
          PARTITION BY "generated_report_id", "restriction_term_id"
          ORDER BY "created_at", "id"
        ) AS "duplicate_rank"
      FROM "restriction_balances"
      WHERE "generated_report_id" IS NOT NULL
    )
    SELECT 1
    FROM ranked AS duplicate_row
    INNER JOIN "restriction_balances" AS canonical
      ON canonical."id" = duplicate_row."canonical_id"
    WHERE duplicate_row."duplicate_rank" > 1
      AND ROW(
        duplicate_row."org_id",
        duplicate_row."fund_id",
        duplicate_row."grant_id",
        duplicate_row."period_start",
        duplicate_row."period_end",
        duplicate_row."beginning_balance_cents",
        duplicate_row."additions_cents",
        duplicate_row."releases_cents",
        duplicate_row."ending_balance_cents",
        duplicate_row."source",
        duplicate_row."created_by",
        duplicate_row."deleted_at"
      ) IS DISTINCT FROM ROW(
        canonical."org_id",
        canonical."fund_id",
        canonical."grant_id",
        canonical."period_start",
        canonical."period_end",
        canonical."beginning_balance_cents",
        canonical."additions_cents",
        canonical."releases_cents",
        canonical."ending_balance_cents",
        canonical."source",
        canonical."created_by",
        canonical."deleted_at"
      )
  ) THEN
    RAISE EXCEPTION
      'Cannot deduplicate divergent restriction balance snapshots; inspect duplicate generated_report_id/restriction_term_id rows before retrying migration 0082';
  END IF;
END $$;--> statement-breakpoint
WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "generated_report_id", "restriction_term_id"
      ORDER BY "created_at", "id"
    ) AS "duplicate_rank"
  FROM "restriction_balances"
  WHERE "generated_report_id" IS NOT NULL
)
DELETE FROM "restriction_balances" AS duplicate_row
USING ranked
WHERE duplicate_row."id" = ranked."id"
  AND ranked."duplicate_rank" > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "restriction_balances_report_term_idx" ON "restriction_balances" USING btree ("generated_report_id","restriction_term_id") WHERE "restriction_balances"."generated_report_id" is not null;
