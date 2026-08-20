PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  first_name TEXT,
  source_page TEXT,
  first_magnet_slug TEXT,
  utm TEXT,
  consent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unsubscribed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS leads_email_unique ON leads (email);

CREATE TABLE IF NOT EXISTS lead_magnet_downloads (
  id TEXT PRIMARY KEY NOT NULL,
  lead_id TEXT NOT NULL,
  magnet_slug TEXT NOT NULL,
  downloaded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS lead_magnet_downloads_lead_magnet_unique
  ON lead_magnet_downloads (lead_id, magnet_slug);

CREATE TABLE IF NOT EXISTS lead_nurture_schedule (
  id TEXT PRIMARY KEY NOT NULL,
  lead_id TEXT NOT NULL,
  magnet_slug TEXT NOT NULL,
  step INTEGER NOT NULL,
  send_after TEXT NOT NULL,
  sent_at TEXT,
  skipped INTEGER NOT NULL DEFAULT 0 CHECK (skipped IN (0, 1)),
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS lead_nurture_schedule_lead_magnet_step_unique
  ON lead_nurture_schedule (lead_id, magnet_slug, step);

CREATE INDEX IF NOT EXISTS lead_nurture_schedule_send_after_lead_idx
  ON lead_nurture_schedule (send_after, lead_id);

CREATE INDEX IF NOT EXISTS lead_nurture_schedule_lead_magnet_idx
  ON lead_nurture_schedule (lead_id, magnet_slug);
