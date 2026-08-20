import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { generatedReports } from "./compliance";

describe("generated reports schema", () => {
  it("stores nullable client attempts and deduplicates non-legacy exports", () => {
    expect(generatedReports.attemptId.name).toBe("attempt_id");
    expect(generatedReports.attemptId.notNull).toBe(false);
    expect(generatedReports.recoveryAttemptedAt.name).toBe("recovery_attempted_at");
    expect(generatedReports.recoveryAttemptedAt.notNull).toBe(false);
    expect(generatedReports.readyEffectsStatus.name).toBe("ready_effects_status");
    expect(generatedReports.readyEffectsClaimedAt.name).toBe("ready_effects_claimed_at");
    expect(generatedReports.readyEffectsAnalyticsDeliveredAt.name).toBe(
      "ready_effects_analytics_delivered_at",
    );
    expect(generatedReports.readyEffectsTrialTier.name).toBe("ready_effects_trial_tier");
    expect(generatedReports.readyEffectsTrialUsageRecordedAt.name).toBe(
      "ready_effects_trial_usage_recorded_at",
    );
    expect(generatedReports.readyEffectsAttemptCount.name).toBe("ready_effects_attempt_count");
    expect(generatedReports.readyEffectsAttemptCount.notNull).toBe(true);
    expect(generatedReports.readyEffectsAttemptCount.default).toBe(0);
    expect(generatedReports.readyEffectsLastAttemptedAt.name).toBe(
      "ready_effects_last_attempted_at",
    );

    const attemptIndex = getTableConfig(generatedReports).indexes.find(
      (index) => index.config.name === "generated_reports_org_type_attempt_idx",
    );
    expect(attemptIndex?.config.unique).toBe(true);
    expect(
      attemptIndex?.config.columns.map((column) => ("name" in column ? column.name : null)),
    ).toEqual(["org_id", "entity_id", "type", "attempt_id"]);
    expect(attemptIndex?.config.where).toBeDefined();
  });
});
