ALTER TABLE "referrals" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "referrals" CASCADE;--> statement-breakpoint
ALTER TABLE "organizations" DROP CONSTRAINT "organizations_referral_code_unique";--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN "referral_code";--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN "referral_bonus_3_granted_at";--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN "referral_bonus_10_granted_at";