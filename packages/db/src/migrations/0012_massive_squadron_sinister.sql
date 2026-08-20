ALTER TABLE "contact_tags" ADD COLUMN "org_id" text;--> statement-breakpoint
UPDATE "contact_tags"
SET "org_id" = (
  SELECT "org_id" FROM "contacts" WHERE "contacts"."id" = "contact_tags"."contact_id"
);--> statement-breakpoint
DELETE FROM "contact_tags" WHERE "org_id" IS NULL;--> statement-breakpoint
ALTER TABLE "contact_tags" ALTER COLUMN "org_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_tags_org_contact_idx" ON "contact_tags" USING btree ("org_id","contact_id");
