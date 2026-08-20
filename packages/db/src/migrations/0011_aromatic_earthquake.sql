DELETE FROM "mock_analytics_events" WHERE "org_id" IS NULL;--> statement-breakpoint
ALTER TABLE "mock_analytics_events" ALTER COLUMN "org_id" SET NOT NULL;--> statement-breakpoint
DELETE FROM "mock_error_events" WHERE "org_id" IS NULL;--> statement-breakpoint
ALTER TABLE "mock_error_events" ALTER COLUMN "org_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "donations_org_contact_date_idx" ON "donations" USING btree ("org_id","contact_id","date");--> statement-breakpoint
CREATE INDEX "activity_log_org_created_at_idx" ON "activity_log" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "documents_org_entity_type_id_idx" ON "documents" USING btree ("org_id","entity_type","entity_id");