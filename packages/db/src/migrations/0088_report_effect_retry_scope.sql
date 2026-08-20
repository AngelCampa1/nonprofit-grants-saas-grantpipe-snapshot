DROP INDEX "generated_reports_org_type_attempt_idx";--> statement-breakpoint
ALTER TABLE "generated_reports" ADD COLUMN "ready_effects_attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_reports" ADD COLUMN "ready_effects_last_attempted_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "generated_reports_org_type_attempt_idx" ON "generated_reports" USING btree ("org_id","entity_id","type","attempt_id") WHERE "generated_reports"."attempt_id" is not null;
