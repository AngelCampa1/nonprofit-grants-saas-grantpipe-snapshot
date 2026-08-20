WITH ranked_open_conflicts AS (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY "org_id", "integration_id", "external_object_id", "target_type", "target_id", "field_path"
			ORDER BY "created_at" DESC, "id" DESC
		) AS duplicate_rank
	FROM "accounting_sync_conflicts"
	WHERE "status" = 'open'
)
UPDATE "accounting_sync_conflicts"
SET
	"status" = 'resolved',
	"resolution" = 'duplicate_open_conflict',
	"resolved_at" = COALESCE("resolved_at", now())
WHERE "id" IN (
	SELECT "id"
	FROM ranked_open_conflicts
	WHERE duplicate_rank > 1
);--> statement-breakpoint
WITH ranked_active_runs AS (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY "org_id", "integration_id"
			ORDER BY CASE WHEN "status" = 'running' THEN 0 ELSE 1 END, "created_at" DESC, "id" DESC
		) AS duplicate_rank
	FROM "accounting_sync_runs"
	WHERE "status" IN ('queued', 'running')
)
UPDATE "accounting_sync_runs"
SET
	"status" = 'failed',
	"error_count" = GREATEST("error_count", 1),
	"completed_at" = COALESCE("completed_at", now())
WHERE "id" IN (
	SELECT "id"
	FROM ranked_active_runs
	WHERE duplicate_rank > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX "accounting_sync_conflicts_open_identity_idx" ON "accounting_sync_conflicts" USING btree ("org_id","integration_id","external_object_id","target_type","target_id","field_path") WHERE "accounting_sync_conflicts"."status" = 'open';--> statement-breakpoint
CREATE UNIQUE INDEX "accounting_sync_runs_one_active_idx" ON "accounting_sync_runs" USING btree ("org_id","integration_id") WHERE "accounting_sync_runs"."status" IN ('queued', 'running');
