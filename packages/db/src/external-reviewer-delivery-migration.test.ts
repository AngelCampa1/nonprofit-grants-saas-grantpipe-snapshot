import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL("./migrations/0081_external_reviewer_invitation_delivery.sql", import.meta.url),
);
const payloadMigrationPath = fileURLToPath(
  new URL("./migrations/0086_external_reviewer_invitation_payload.sql", import.meta.url),
);

describe("external reviewer invitation delivery migration", () => {
  it("keeps historical sessions out of the new pending invitation queue", () => {
    const sql = readFileSync(migrationPath, "utf8");
    const backfillIndex = sql.indexOf('UPDATE "external_review_sessions"');
    const deliveryIndexIndex = sql.indexOf(
      'CREATE INDEX "external_review_sessions_invitation_delivery_idx"',
    );

    expect(backfillIndex).toBeGreaterThan(-1);
    expect(sql).toContain("\"invitation_delivery_status\" text DEFAULT 'sent' NOT NULL");
    expect(backfillIndex).toBeLessThan(deliveryIndexIndex);
    expect(sql.slice(backfillIndex, deliveryIndexIndex)).toContain(
      "\"invitation_delivery_status\" = 'sent'",
    );
    expect(sql.slice(backfillIndex, deliveryIndexIndex)).toContain(
      '"invitation_delivery_sent_at" = "created_at"',
    );
  });

  it("adds an immutable non-secret payload snapshot without storing portal credentials", () => {
    const sql = readFileSync(payloadMigrationPath, "utf8");

    expect(sql).toContain('ADD COLUMN "invitation_delivery_payload" jsonb');
    expect(sql).toContain('ADD COLUMN "invitation_delivery_attempt" integer DEFAULT 1 NOT NULL');
    expect(sql).toContain("ADD COLUMN \"invitation_delivery_kind\" text DEFAULT 'invite' NOT NULL");
    expect(sql).not.toContain("portal_url");
    expect(sql).not.toContain("raw_token");
  });
});
