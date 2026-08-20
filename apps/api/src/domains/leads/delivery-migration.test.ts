import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL("../../../migrations/d1-marketing/0003_lead_magnet_delivery_state.sql", import.meta.url),
);

describe("lead magnet delivery D1 migration", () => {
  it("keeps historical downloads out of the new pending-delivery queue", () => {
    const sql = readFileSync(migrationPath, "utf8");
    const backfillIndex = sql.indexOf("UPDATE lead_magnet_downloads");
    const deliveryIndexIndex = sql.indexOf("CREATE INDEX IF NOT EXISTS");

    expect(backfillIndex).toBeGreaterThan(-1);
    expect(sql).toContain("email_status TEXT NOT NULL DEFAULT 'sent'");
    expect(sql).toContain("sequencer_status TEXT NOT NULL DEFAULT 'sent'");
    expect(sql).toContain("email_attempt INTEGER NOT NULL DEFAULT 1");
    expect(sql).toContain("email_attempt_started_at TEXT");
    expect(sql).toContain("email_claimed_at TEXT");
    expect(sql).toContain("sequencer_attempt INTEGER NOT NULL DEFAULT 1");
    expect(sql).toContain("sequencer_attempt_started_at TEXT");
    expect(sql).toContain("sequencer_claimed_at TEXT");
    expect(sql).toContain("email_only INTEGER NOT NULL DEFAULT 0");
    expect(sql).toContain("email_request_fingerprint TEXT");
    expect(sql).toContain("sequencer_request_fingerprint TEXT");
    expect(sql).toContain("sequencer_contact_id TEXT");
    expect(sql).toContain("sequencer_enrollment_request_fingerprint TEXT");
    expect(sql).not.toContain("request_payload");
    expect(sql).not.toContain("authorization_header");
    expect(sql).not.toContain("api_key");
    expect(backfillIndex).toBeLessThan(deliveryIndexIndex);
    expect(sql.slice(backfillIndex, deliveryIndexIndex)).toContain("email_status = 'sent'");
    expect(sql.slice(backfillIndex, deliveryIndexIndex)).toContain("sequencer_status = 'sent'");
    expect(sql.slice(backfillIndex, deliveryIndexIndex)).toContain("email_sent_at = downloaded_at");
    expect(sql.slice(backfillIndex, deliveryIndexIndex)).toContain(
      "sequencer_sent_at = downloaded_at",
    );
    expect(sql.slice(backfillIndex, deliveryIndexIndex)).toContain("email_claimed_at = NULL");
    expect(sql.slice(backfillIndex, deliveryIndexIndex)).toContain("sequencer_claimed_at = NULL");
  });
});
