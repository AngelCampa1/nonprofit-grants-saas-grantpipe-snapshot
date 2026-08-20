import { describe, expect, it } from "vitest";

import { getContentEntrySlug } from "./content-entry-slug";

describe("getContentEntrySlug", () => {
  it("removes markdown file extensions from content entry ids", () => {
    expect(getContentEntrySlug({ id: "guides/grant-calendar.md" })).toBe("guides/grant-calendar");
    expect(getContentEntrySlug({ id: "free/grant-checklist.mdx" })).toBe("free/grant-checklist");
  });

  it("leaves extensionless content entry ids unchanged", () => {
    expect(getContentEntrySlug({ id: "grant-compliance-checklist" })).toBe(
      "grant-compliance-checklist",
    );
  });
});
