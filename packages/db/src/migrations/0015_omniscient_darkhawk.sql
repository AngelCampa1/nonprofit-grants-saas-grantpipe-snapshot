CREATE EXTENSION IF NOT EXISTS citext;
--> statement-breakpoint
ALTER TABLE "lead_nurture_schedule" ALTER COLUMN "step" SET DATA TYPE smallint;--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "email" SET DATA TYPE citext;
