ALTER TABLE "expenses" ALTER COLUMN "amount_cents" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "grant_fund_allocations" ALTER COLUMN "allocated_amount_cents" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "grants" ALTER COLUMN "amount_cents" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "volunteer_hours" ADD COLUMN "deleted_at" timestamp with time zone;