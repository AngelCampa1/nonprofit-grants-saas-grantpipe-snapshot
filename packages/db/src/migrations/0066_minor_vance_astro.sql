CREATE TABLE "saved_report_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"entity" text NOT NULL,
	"columns" jsonb NOT NULL,
	"custom_field_ids" jsonb NOT NULL,
	"filters" jsonb NOT NULL,
	"sort" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "saved_report_definitions" ADD CONSTRAINT "saved_report_definitions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_report_definitions" ADD CONSTRAINT "saved_report_definitions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_report_definitions_org_entity_idx" ON "saved_report_definitions" USING btree ("org_id","entity");--> statement-breakpoint
CREATE INDEX "saved_report_definitions_org_updated_idx" ON "saved_report_definitions" USING btree ("org_id","updated_at");