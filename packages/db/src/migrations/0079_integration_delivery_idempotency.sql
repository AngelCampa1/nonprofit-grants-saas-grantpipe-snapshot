CREATE TABLE "donor_mail_merge_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"attempt_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider_message_id" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "communication_log" ADD COLUMN "mail_merge_attempt_id" text;--> statement-breakpoint
ALTER TABLE "document_extractions" ADD COLUMN "dispatch_attempt_id" text;--> statement-breakpoint
ALTER TABLE "donor_mail_merge_deliveries" ADD CONSTRAINT "donor_mail_merge_deliveries_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donor_mail_merge_deliveries" ADD CONSTRAINT "donor_mail_merge_deliveries_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "donor_mail_merge_delivery_unique" ON "donor_mail_merge_deliveries" USING btree ("org_id","contact_id","attempt_id");--> statement-breakpoint
CREATE INDEX "donor_mail_merge_delivery_status_idx" ON "donor_mail_merge_deliveries" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "communication_log_mail_merge_unique" ON "communication_log" USING btree ("org_id","contact_id","mail_merge_attempt_id") WHERE "communication_log"."mail_merge_attempt_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "document_extractions_dispatch_attempt_unique" ON "document_extractions" USING btree ("org_id","dispatch_attempt_id") WHERE "document_extractions"."dispatch_attempt_id" is not null;
