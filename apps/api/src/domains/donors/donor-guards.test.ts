import { describe, it, expect, vi } from "vitest";
import { assertContactInOrg } from "./donor-guards";

// ---------------------------------------------------------------------------
// assertContactInOrg
// ---------------------------------------------------------------------------

describe("assertContactInOrg", () => {
  it("resolves without throwing when the contact belongs to the org", async () => {
    const db = {
      query: {
        contacts: {
          findFirst: vi.fn().mockResolvedValue({ id: "c-1", orgId: "org-1" }),
        },
      },
    };

    await expect(assertContactInOrg(db as never, "org-1", "c-1")).resolves.toBeUndefined();
  });

  it("throws 404 when contact does not belong to the org", async () => {
    const db = {
      query: {
        contacts: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
    };

    await expect(assertContactInOrg(db as never, "org-attacker", "c-victim")).rejects.toThrow(
      "Contact not found",
    );
  });

  it("throws 404 when contact is soft-deleted (findFirst returns undefined)", async () => {
    // Drizzle's isNull(deletedAt) filter means findFirst returns undefined for deleted contacts
    const db = {
      query: {
        contacts: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
    };

    await expect(assertContactInOrg(db as never, "org-1", "c-deleted")).rejects.toThrow(
      "Contact not found",
    );
  });
});
