import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { externalReviewSessions } from "./external-reviewers";

describe("external reviewer invitation delivery schema", () => {
  it("persists recoverable invitation delivery state on the session intent", () => {
    const columns = getTableConfig(externalReviewSessions).columns.map((column) => column.name);

    expect(columns).toEqual(
      expect.arrayContaining([
        "invitation_delivery_status",
        "invitation_delivery_started_at",
        "invitation_delivery_claimed_at",
        "invitation_delivery_sent_at",
        "invitation_provider_id",
        "invitation_delivery_error",
      ]),
    );
  });
});
