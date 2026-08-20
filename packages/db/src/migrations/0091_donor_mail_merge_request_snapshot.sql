ALTER TABLE "donor_mail_merge_deliveries" ADD COLUMN "request_fingerprint" text;--> statement-breakpoint
ALTER TABLE "donor_mail_merge_deliveries" ADD COLUMN "request_snapshot" jsonb;