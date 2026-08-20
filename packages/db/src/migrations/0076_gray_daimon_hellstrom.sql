DROP INDEX "grant_opportunities_org_source_idx";--> statement-breakpoint
DROP INDEX "grant_opportunities_org_close_date_idx";--> statement-breakpoint
ALTER TABLE "grant_opportunities" ADD COLUMN "entity_id" text;--> statement-breakpoint
UPDATE "grant_opportunities" SET "entity_id" = "organizations"."default_entity_id" FROM "organizations" WHERE "grant_opportunities"."org_id" = "organizations"."id" AND "grant_opportunities"."entity_id" IS NULL;--> statement-breakpoint
ALTER TABLE "grant_opportunities" ALTER COLUMN "entity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "grant_opportunities" ADD CONSTRAINT "grant_opportunities_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "grant_opportunities_org_source_idx" ON "grant_opportunities" USING btree ("org_id","entity_id","source","source_opportunity_id");--> statement-breakpoint
CREATE INDEX "grant_opportunities_org_close_date_idx" ON "grant_opportunities" USING btree ("org_id","entity_id","close_date");
