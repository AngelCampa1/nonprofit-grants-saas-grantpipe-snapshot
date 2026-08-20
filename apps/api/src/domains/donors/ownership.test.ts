import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { donorContactEntityScope } from "./ownership";

function collectStrings(value: unknown, seen = new Set<object>()): string[] {
  if (typeof value === "string") return [value];
  if (typeof value !== "object" || value === null || seen.has(value)) return [];
  seen.add(value);
  return (Array.isArray(value) ? value : Object.values(value)).flatMap((entry) =>
    collectStrings(entry, seen),
  );
}

describe("donorContactEntityScope", () => {
  it("accepts a correlated outer contact column without losing stable donation aliases", () => {
    const predicate = donorContactEntityScope("org-1", "entity-1", sql`pledge_outer.contact_id`);
    const strings = collectStrings(predicate);

    expect(strings).toContain("pledge_outer.contact_id");
    expect(strings.some((value) => value.includes("entity_donation.contact_id"))).toBe(true);
    expect(strings).toContain("entity-1");
  });
});
