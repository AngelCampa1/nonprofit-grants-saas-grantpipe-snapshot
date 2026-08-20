import { describe, expect, it } from "vitest";
import { sampleDataRecords } from "./sample-data";

describe("sampleDataRecords ledger", () => {
  it("declares the org-scoped ledger columns", () => {
    expect(sampleDataRecords.orgId.name).toBe("org_id");
    expect(sampleDataRecords.entityTable.name).toBe("entity_table");
    expect(sampleDataRecords.entityId.name).toBe("entity_id");
    expect(sampleDataRecords.orgId.notNull).toBe(true);
  });
});
