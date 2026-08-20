CREATE TABLE "grant_federal_award_metadata" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"grant_id" text NOT NULL,
	"assistance_listing_number" text,
	"assistance_listing_title" text,
	"federal_agency" text,
	"fain" text,
	"pass_through_entity_name" text,
	"pass_through_identifying_number" text,
	"program_name" text,
	"cluster_name" text,
	"sefa_inclusion_type" text DEFAULT 'cash' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "grant_federal_award_metadata_inclusion_chk" CHECK ("grant_federal_award_metadata"."sefa_inclusion_type" IN ('cash', 'noncash', 'loan', 'loan_guarantee'))
);
--> statement-breakpoint
ALTER TABLE "grant_federal_award_metadata" ADD CONSTRAINT "grant_federal_award_metadata_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_federal_award_metadata" ADD CONSTRAINT "grant_federal_award_metadata_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_federal_award_metadata" ADD CONSTRAINT "grant_federal_award_metadata_grant_id_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "grant_federal_award_metadata_grant_idx" ON "grant_federal_award_metadata" USING btree ("grant_id");--> statement-breakpoint
CREATE INDEX "grant_federal_award_metadata_org_idx" ON "grant_federal_award_metadata" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "grant_federal_award_metadata_org_aln_idx" ON "grant_federal_award_metadata" USING btree ("org_id","assistance_listing_number");
