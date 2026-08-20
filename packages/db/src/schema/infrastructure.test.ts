import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { communicationLog, donorMailMergeDeliveries, notifications } from "./infrastructure";

describe("notification schema", () => {
  it("persists the active entity that produced an entity-scoped alert", () => {
    expect(notifications.activeEntityId.name).toBe("active_entity_id");
  });

  it("stores a durable leased email-delivery request on the deduped notification", () => {
    expect(notifications.emailDeliveryStatus.name).toBe("email_delivery_status");
    expect(notifications.emailRequestSnapshot.name).toBe("email_request_snapshot");
    expect(notifications.emailRequestFingerprint.name).toBe("email_request_fingerprint");
    expect(notifications.emailClaimedAt.name).toBe("email_claimed_at");
    expect(notifications.emailAttemptCount.name).toBe("email_attempt_count");
    expect(notifications.emailProviderMessageId.name).toBe("email_provider_message_id");
  });
});

describe("communication log schema", () => {
  it("deduplicates one donor mail-merge communication per attempt and recipient", () => {
    expect(communicationLog.mailMergeAttemptId.name).toBe("mail_merge_attempt_id");

    const config = getTableConfig(communicationLog);
    expect(
      config.indexes.some((index) => index.config.name === "communication_log_mail_merge_unique"),
    ).toBe(true);
  });
});

describe("donor mail merge delivery schema", () => {
  it("stores one durable delivery state per org, attempt, and recipient", () => {
    expect(donorMailMergeDeliveries.attemptId.name).toBe("attempt_id");
    expect(donorMailMergeDeliveries.status.default).toBe("pending");
    expect(donorMailMergeDeliveries.providerMessageId.name).toBe("provider_message_id");

    const config = getTableConfig(donorMailMergeDeliveries);
    expect(
      config.indexes.some((index) => index.config.name === "donor_mail_merge_delivery_unique"),
    ).toBe(true);
  });
});
