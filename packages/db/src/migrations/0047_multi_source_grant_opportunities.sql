ALTER TABLE "grant_opportunities" ADD COLUMN "source_type" text DEFAULT 'federal' NOT NULL;--> statement-breakpoint
ALTER TABLE "grant_opportunities" ADD COLUMN "source_name" text DEFAULT 'Grants.gov' NOT NULL;--> statement-breakpoint
ALTER TABLE "grant_opportunities" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "grant_opportunities" ADD COLUMN "funder_type" text DEFAULT 'government' NOT NULL;--> statement-breakpoint
ALTER TABLE "grant_opportunities" ADD COLUMN "deadline_source" text DEFAULT 'grants_gov' NOT NULL;--> statement-breakpoint
ALTER TABLE "grant_opportunities" ADD COLUMN "external_id" text;
