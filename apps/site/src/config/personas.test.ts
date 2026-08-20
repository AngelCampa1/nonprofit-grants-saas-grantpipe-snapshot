import { describe, expect, it } from "vitest";

import { personas } from "./personas";

describe("personas", () => {
  it("defines the full public persona navigation options", () => {
    expect(personas).toEqual([
      {
        slug: "executive-directors",
        label: "Executive Directors",
        description: "Audit risk, board trust, and budget control in one view.",
      },
      {
        slug: "development-directors",
        label: "Development Directors",
        description: "Donor pipeline, retention, and board reports that match.",
      },
      {
        slug: "finance-operations-staff",
        label: "Finance & Operations",
        description: "Restricted funds, the 990, and a clean audit trail.",
      },
      {
        slug: "grants-managers",
        label: "Grants Managers",
        description: "Deadlines, drawdowns, and grant compliance in one place.",
      },
      {
        slug: "grant-writers",
        label: "Grant Writers",
        description: "Track every application, deadline, and funder ask.",
      },
      {
        slug: "program-directors",
        label: "Program Directors",
        description: "Spend programs to plan without breaking grant rules.",
      },
      {
        slug: "operations-managers",
        label: "Operations Managers",
        description: "Run donors, grants, and funds without spreadsheet glue.",
      },
      {
        slug: "board-treasurers",
        label: "Board Treasurers",
        description: "See restricted balances and risk before the meeting.",
      },
    ]);
  });

  it("uses persona slugs that match the /for content routes", () => {
    for (const persona of personas) {
      expect(persona.slug).toMatch(/^[a-z][a-z-]*[a-z]$/);
    }
  });
});
