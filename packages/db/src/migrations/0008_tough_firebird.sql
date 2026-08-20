BEGIN;
-- growth rows are intentionally unchanged; price is updated out-of-band via new Stripe prices
UPDATE "organizations" SET "plan_tier" = 'starter' WHERE "plan_tier" = 'foundation';
UPDATE "organizations" SET "plan_tier" = 'audit_ready' WHERE "plan_tier" = 'enterprise';
ALTER TABLE "organizations" ALTER COLUMN "plan_tier" SET DEFAULT 'starter';
COMMIT;
