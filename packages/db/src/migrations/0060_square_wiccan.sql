ALTER TABLE "donations" ADD COLUMN "net_asset_class" text DEFAULT 'unrestricted' NOT NULL;
--> statement-breakpoint
-- Backfill the three-way net-asset class from the binary restriction flag.
-- Every restricted gift is at least temporarily restricted; the next statement
-- upgrades the subset on permanently restricted funds. This replays the only
-- DB-derivable permanent path the runtime classifier uses (fund type). The
-- classifier's other permanent path — a "permanent"-family donor designation
-- keyword on a gift whose fund is not typed permanently_restricted — is medium
-- confidence and staff-overridable, so those legacy rows stay
-- temporarily_restricted here and self-heal on next edit. New gifts resolve the
-- full class at entry, so this only affects pre-migration history.
UPDATE "donations" SET "net_asset_class" = 'temporarily_restricted' WHERE "restriction" = 'restricted';
--> statement-breakpoint
UPDATE "donations" SET "net_asset_class" = 'permanently_restricted'
  WHERE "restriction" = 'restricted'
    AND "fund_id" IN (SELECT "id" FROM "funds" WHERE "type" = 'permanently_restricted');