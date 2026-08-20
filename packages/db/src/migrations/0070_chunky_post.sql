CREATE TABLE "sample_data_records" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"entity_table" text NOT NULL,
	"entity_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sample_data_records" ADD CONSTRAINT "sample_data_records_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sample_data_records_org_idx" ON "sample_data_records" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "sample_data_records_org_table_idx" ON "sample_data_records" USING btree ("org_id","entity_table");