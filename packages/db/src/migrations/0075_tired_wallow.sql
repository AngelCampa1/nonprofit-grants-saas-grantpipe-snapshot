ALTER TABLE "funds" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "funds" ADD COLUMN "restriction_purpose" text;--> statement-breakpoint
ALTER TABLE "funds" ADD COLUMN "restriction_source" text;--> statement-breakpoint
ALTER TABLE "funds" ADD COLUMN "start_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "funds" ADD COLUMN "end_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "funds" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;