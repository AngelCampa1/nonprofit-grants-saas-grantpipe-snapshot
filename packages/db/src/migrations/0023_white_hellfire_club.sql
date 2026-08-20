DROP INDEX "lead_nurture_schedule_lead_step_unique";--> statement-breakpoint
ALTER TABLE "lead_nurture_schedule" ADD COLUMN "magnet_slug" text;--> statement-breakpoint
ALTER TABLE "lead_nurture_schedule" ADD COLUMN "skipped" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE lead_nurture_schedule
SET magnet_slug = leads.first_magnet_slug
FROM leads
WHERE leads.id = lead_nurture_schedule.lead_id
  AND leads.first_magnet_slug IS NOT NULL;--> statement-breakpoint
DELETE FROM lead_nurture_schedule WHERE magnet_slug IS NULL;--> statement-breakpoint
ALTER TABLE "lead_nurture_schedule" ALTER COLUMN "magnet_slug" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "lead_nurture_schedule_lead_magnet_step_unique" ON "lead_nurture_schedule" USING btree ("lead_id","magnet_slug","step");--> statement-breakpoint
CREATE INDEX "lead_nurture_schedule_lead_magnet_idx" ON "lead_nurture_schedule" USING btree ("lead_id","magnet_slug");
