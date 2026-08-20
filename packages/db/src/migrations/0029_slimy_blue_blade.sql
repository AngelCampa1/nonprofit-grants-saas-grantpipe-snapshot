ALTER TABLE "invite_links" ADD COLUMN "mode" text DEFAULT 'shareable' NOT NULL;--> statement-breakpoint
ALTER TABLE "invite_links" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "invite_links" ADD COLUMN "permissions" jsonb;--> statement-breakpoint
ALTER TABLE "org_members" ADD COLUMN "permissions" jsonb;