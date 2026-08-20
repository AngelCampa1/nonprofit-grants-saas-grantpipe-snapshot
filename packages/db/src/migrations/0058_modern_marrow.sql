ALTER TABLE "grant_opportunities" ALTER COLUMN "award_floor_cents" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "grant_opportunities" ALTER COLUMN "award_ceiling_cents" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "bank_reconciliations" ALTER COLUMN "statement_ending_balance_cents" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "bank_transactions" ALTER COLUMN "amount_cents" SET DATA TYPE bigint;