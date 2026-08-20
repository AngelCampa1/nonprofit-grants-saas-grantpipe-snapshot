-- Keep old Workers safe during the migration-to-deploy window: legacy writers
-- omit these columns after sending synchronously, so the database default must
-- treat their rows as complete. The new writer explicitly inserts pending.
ALTER TABLE lead_magnet_downloads ADD COLUMN email_status TEXT NOT NULL DEFAULT 'sent';
ALTER TABLE lead_magnet_downloads ADD COLUMN sequencer_status TEXT NOT NULL DEFAULT 'sent';
ALTER TABLE lead_magnet_downloads ADD COLUMN email_attempt INTEGER NOT NULL DEFAULT 1;
ALTER TABLE lead_magnet_downloads ADD COLUMN email_attempt_started_at TEXT;
ALTER TABLE lead_magnet_downloads ADD COLUMN email_claimed_at TEXT;
ALTER TABLE lead_magnet_downloads ADD COLUMN sequencer_attempt INTEGER NOT NULL DEFAULT 1;
ALTER TABLE lead_magnet_downloads ADD COLUMN sequencer_attempt_started_at TEXT;
ALTER TABLE lead_magnet_downloads ADD COLUMN sequencer_claimed_at TEXT;
ALTER TABLE lead_magnet_downloads ADD COLUMN email_only INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lead_magnet_downloads ADD COLUMN email_request_fingerprint TEXT;
ALTER TABLE lead_magnet_downloads ADD COLUMN sequencer_request_fingerprint TEXT;
ALTER TABLE lead_magnet_downloads ADD COLUMN sequencer_contact_id TEXT;
ALTER TABLE lead_magnet_downloads ADD COLUMN sequencer_enrollment_request_fingerprint TEXT;
ALTER TABLE lead_magnet_downloads ADD COLUMN delivery_started_at TEXT;
ALTER TABLE lead_magnet_downloads ADD COLUMN delivery_claimed_at TEXT;
ALTER TABLE lead_magnet_downloads ADD COLUMN email_sent_at TEXT;
ALTER TABLE lead_magnet_downloads ADD COLUMN sequencer_sent_at TEXT;
ALTER TABLE lead_magnet_downloads ADD COLUMN delivery_error TEXT;
ALTER TABLE lead_magnet_downloads ADD COLUMN source_page TEXT;

-- These rows predate durable delivery tracking. Treat them as completed so the
-- first recovery cron cannot resend old magnets or re-enroll historical leads.
-- The durable writer explicitly marks new rows pending after this migration.
UPDATE lead_magnet_downloads
SET email_status = 'sent',
    sequencer_status = 'sent',
    email_sent_at = downloaded_at,
    sequencer_sent_at = downloaded_at,
    email_claimed_at = NULL,
    sequencer_claimed_at = NULL;

CREATE INDEX IF NOT EXISTS lead_magnet_downloads_delivery_state_idx
  ON lead_magnet_downloads (
    email_status, sequencer_status, email_claimed_at, sequencer_claimed_at
  );
