ALTER TABLE "grant_reporting_requirements" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "grant_closeout_items" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "grant_impact_metrics" ADD COLUMN "deleted_at" timestamp with time zone;
