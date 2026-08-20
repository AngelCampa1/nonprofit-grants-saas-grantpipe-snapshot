PRAGMA foreign_keys = ON;

-- Nonce store for AI-CS context endpoint replay protection.
-- Nonces expire after 5 minutes (300 000 ms); the cleanup query in the
-- context handler deletes rows where expires_at <= now() (Unix ms) before
-- attempting the INSERT, so the table stays small.
CREATE TABLE IF NOT EXISTS ai_cs_nonces (
  nonce TEXT PRIMARY KEY NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_cs_nonces_expires_at_idx
  ON ai_cs_nonces (expires_at);

-- Durable escalation tickets. Persisted by the BFF before forwarding to the
-- AI-CS Worker so a human-actionable record survives Worker unavailability.
CREATE TABLE IF NOT EXISTS ai_cs_escalations (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  reason TEXT,
  message TEXT,
  contact TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS ai_cs_escalations_user_id_idx
  ON ai_cs_escalations (user_id);

CREATE INDEX IF NOT EXISTS ai_cs_escalations_session_id_idx
  ON ai_cs_escalations (session_id);

CREATE INDEX IF NOT EXISTS ai_cs_escalations_created_at_idx
  ON ai_cs_escalations (created_at);
