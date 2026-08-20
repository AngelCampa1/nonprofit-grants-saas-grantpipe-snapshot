import { contacts, donations } from "@grantpipe/db";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, it, expect, vi } from "vitest";
import { getDonorStats, getRetentionStats, getPipelineGroups } from "./stats.service";

function renderPredicate(predicate: unknown) {
  return new PgDialect().sqlToQuery(predicate as Parameters<PgDialect["sqlToQuery"]>[0]);
}

// ---------------------------------------------------------------------------
// getDonorStats
// ---------------------------------------------------------------------------

describe("getDonorStats", () => {
  it("fences donor and donation aggregates by active selected-entity ownership", async () => {
    const predicates: Array<{ table: unknown; predicate: unknown }> = [];
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn((table) => ({
          where: vi.fn((predicate) => {
            predicates.push({ table, predicate });
            return Promise.resolve([{ count: 0, total: 0 }]);
          }),
        })),
      }),
    };

    await getDonorStats(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      fiscalYearStartMonth: 1,
      now: new Date("2026-06-15"),
    });

    const contactSql = renderPredicate(
      predicates.find(({ table }) => table === contacts)?.predicate,
    );
    expect(contactSql.sql.toLowerCase()).toContain("not exists");
    expect(contactSql.sql).toContain('"donor_scope_org"."default_entity_id"');

    const donationSql = renderPredicate(
      predicates.find(({ table }) => table === donations)?.predicate,
    );
    expect(donationSql.sql.toLowerCase()).toContain('"donor_scope_fund"."deleted_at" is null');
    expect(donationSql.sql.toLowerCase()).toContain('"donor_scope_grant"."deleted_at" is null');
    expect(donationSql.params).toContain("org-1");
    expect(donationSql.params).toContain("entity-1");
  });

  function collectStrings(node: unknown, seen = new WeakSet<object>()): string[] {
    if (node === null || node === undefined) return [];
    if (typeof node === "string") return [node];
    if (typeof node !== "object") return [];
    if (seen.has(node)) return [];
    seen.add(node);
    const result = Array.isArray(node)
      ? node.flatMap((item) => collectStrings(item, seen))
      : Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
          key === "table" ? [] : collectStrings(value, seen),
        );
    seen.delete(node);
    return result;
  }

  it("returns contact-based donor counts alongside donation aggregates", async () => {
    const db = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockImplementation((table) => {
          if (table === contacts) {
            const contactCallCount = db.select.mock.results
              .slice(0, db.select.mock.calls.length)
              .filter((result) => result.type === "return").length;
            const contactCount = contactCallCount === 1 ? 10 : 3;
            return {
              where: vi.fn().mockResolvedValue([{ count: contactCount }]),
            };
          }

          if (table === donations) {
            const donationCallCount = db.select.mock.calls.length;
            switch (donationCallCount) {
              case 2:
                return {
                  where: vi.fn().mockResolvedValue([{ total: 50_000 }]),
                };
              case 3:
                return {
                  where: vi.fn().mockResolvedValue([{ total: 42_000 }]),
                };
              case 5:
                return {
                  where: vi.fn().mockResolvedValue([{ count: 8 }]),
                };
              case 6:
                return {
                  where: vi.fn().mockResolvedValue([{ count: 6 }]),
                };
              default:
                return {
                  where: vi.fn().mockResolvedValue([{ count: 0 }]),
                };
            }
          }

          return {
            where: vi.fn().mockResolvedValue([{ count: 0 }]),
          };
        }),
      })),
    };

    const result = await getDonorStats(db as never, {
      orgId: "org-1",
      entityId: "entity-2",
      fiscalYearStartMonth: 1,
      now: new Date("2026-06-15"),
    });

    expect(result.totalDonors).toBe(10);
    expect(result.totalGivingThisFY).toBe(50_000);
    expect(result.previousFiscalYearGivingCents).toBe(42_000);
    expect(result.newDonorsThisFY).toBe(3);
    expect(result.retentionRate).toBeCloseTo(0.75);
  });

  it("returns 0 retention when no donors in previous FY", async () => {
    const db = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 0, total: 0 }]),
        }),
      })),
    };

    const result = await getDonorStats(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      fiscalYearStartMonth: 1,
      now: new Date("2026-06-15"),
    });

    expect(result.retentionRate).toBe(0);
    expect(result.previousFiscalYearGivingCents).toBe(0);
  });

  it("requires the current-year retention gift to belong to the active entity", async () => {
    const donationPredicates: unknown[] = [];
    let selectCall = 0;
    const db = {
      select: vi.fn(() => {
        selectCall += 1;
        return {
          from: vi.fn((table) => ({
            where: vi.fn((predicate) => {
              if (table === donations) donationPredicates.push(predicate);
              if (selectCall === 5) return Promise.resolve([{ count: 1 }]);
              if (selectCall === 6) return Promise.resolve([{ count: 1 }]);
              return Promise.resolve([{ count: 1, total: 0 }]);
            }),
          })),
        };
      }),
    };

    await getDonorStats(db as never, {
      orgId: "org-1",
      entityId: "entity-active",
      fiscalYearStartMonth: 1,
      now: new Date("2026-06-15"),
    });

    const retainedPredicate = donationPredicates.at(-1);
    const entityOccurrences = collectStrings(retainedPredicate).filter(
      (value) => value === "entity-active",
    );
    expect(entityOccurrences).toHaveLength(6);
  });

  it("defaults totals to 0 when all queries return empty arrays", async () => {
    const db = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      })),
    };

    const result = await getDonorStats(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      fiscalYearStartMonth: 1,
      now: new Date("2026-06-15"),
    });

    expect(result.totalDonors).toBe(0);
    expect(result.totalGivingThisFY).toBe(0);
    expect(result.previousFiscalYearGivingCents).toBe(0);
    expect(result.newDonorsThisFY).toBe(0);
    expect(result.retentionRate).toBe(0);
  });

  it("defaults retainedResult to 0 when retained query returns empty array", async () => {
    const db = {
      select: vi.fn().mockImplementation(() => {
        const callCount = db.select.mock.calls.length;
        switch (callCount) {
          case 1:
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{ count: 5 }]),
              }),
            };
          case 2:
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{ total: 10_000 }]),
              }),
            };
          case 3:
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{ total: 7_000 }]),
              }),
            };
          case 4:
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{ count: 2 }]),
              }),
            };
          case 5:
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{ count: 3 }]),
              }),
            };
          case 6:
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([]),
              }),
            };
          default:
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{ count: 0 }]),
              }),
            };
        }
      }),
    };

    const result = await getDonorStats(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      fiscalYearStartMonth: 1,
      now: new Date("2026-06-15"),
    });

    expect(result.retentionRate).toBe(0);
    expect(result.previousFiscalYearGivingCents).toBe(7_000);
  });

  it("coerces string aggregate values from the pg driver into numbers", async () => {
    // Postgres SUM()/COUNT(DISTINCT ...) come back as strings through the
    // node-postgres driver. The raw sql<number> reads do not get drizzle's
    // .mapWith(Number), so the service must coerce them explicitly.
    const db = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockImplementation((table) => {
          if (table === contacts) {
            const contactCallCount = db.select.mock.results
              .slice(0, db.select.mock.calls.length)
              .filter((result) => result.type === "return").length;
            const contactCount = contactCallCount === 1 ? "10" : "3";
            return {
              where: vi.fn().mockResolvedValue([{ count: contactCount }]),
            };
          }

          if (table === donations) {
            const donationCallCount = db.select.mock.calls.length;
            switch (donationCallCount) {
              case 2:
                return { where: vi.fn().mockResolvedValue([{ total: "50000" }]) };
              case 3:
                return { where: vi.fn().mockResolvedValue([{ total: "42000" }]) };
              case 5:
                return { where: vi.fn().mockResolvedValue([{ count: "8" }]) };
              case 6:
                return { where: vi.fn().mockResolvedValue([{ count: "6" }]) };
              default:
                return { where: vi.fn().mockResolvedValue([{ count: "0" }]) };
            }
          }

          return { where: vi.fn().mockResolvedValue([{ count: "0" }]) };
        }),
      })),
    };

    const result = await getDonorStats(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      fiscalYearStartMonth: 1,
      now: new Date("2026-06-15"),
    });

    expect(result.totalGivingThisFY).toBe(50_000);
    expect(typeof result.totalGivingThisFY).toBe("number");
    expect(result.previousFiscalYearGivingCents).toBe(42_000);
    expect(typeof result.previousFiscalYearGivingCents).toBe("number");
    expect(result.retentionRate).toBeCloseTo(0.75);
  });
});

// ---------------------------------------------------------------------------
// getRetentionStats
// ---------------------------------------------------------------------------

describe("getRetentionStats", () => {
  it("applies selected-entity ownership to donor counts and retained gifts", async () => {
    const predicates: unknown[] = [];
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn((predicate) => {
            predicates.push(predicate);
            return Promise.resolve([{ count: 1 }]);
          }),
        }),
      }),
    };

    await getRetentionStats(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      fiscalYearStartMonth: 1,
      count: 2,
      now: new Date("2026-06-15"),
    });

    expect(predicates).toHaveLength(3);
    for (const predicate of predicates) {
      const rendered = renderPredicate(predicate);
      expect(rendered.sql.toLowerCase()).toContain('"donor_scope_fund"."deleted_at" is null');
      expect(rendered.sql.toLowerCase()).toContain('"donor_scope_grant"."deleted_at" is null');
      expect(rendered.params).toContain("entity-1");
    }
  });

  it("defaults counts to 0 when queries return empty arrays", async () => {
    let callIdx = 0;
    const mockResults: unknown[][] = [[], [], []];

    const db = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockResults[callIdx++] ?? []),
        }),
      })),
    };

    const result = await getRetentionStats(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      fiscalYearStartMonth: 1,
      count: 2,
      now: new Date("2026-06-15"),
    });

    expect(result[0]!.donorCount).toBe(0);
    expect(result[1]!.donorCount).toBe(0);
    expect(result[1]!.retainedCount).toBe(0);
  });

  it("handles zero prevDonorCount in a non-first FY", async () => {
    let callIdx = 0;
    const mockResults = [[{ count: 0 }], [{ count: 5 }], [{ count: 0 }]];

    const db = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockResults[callIdx++] ?? [{ count: 0 }]),
        }),
      })),
    };

    const result = await getRetentionStats(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      fiscalYearStartMonth: 1,
      count: 2,
      now: new Date("2025-06-15"),
    });

    expect(result).toHaveLength(2);
    expect(result[0]!.retentionRate).toBe(0);
    expect(result[1]!.retentionRate).toBe(0);
  });

  it("returns retention rates for multiple fiscal years", async () => {
    let callIdx = 0;
    const mockResults = [
      [{ count: 5 }],
      [{ count: 6 }],
      [{ count: 4 }],
      [{ count: 9 }],
      [{ count: 3 }],
    ];

    const db = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockResults[callIdx++] ?? [{ count: 0 }]),
        }),
      })),
    };

    const result = await getRetentionStats(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      fiscalYearStartMonth: 1,
      count: 3,
      now: new Date("2026-06-15"),
    });

    expect(result).toHaveLength(3);
    expect(result[0]!.fiscalYear).toBe("FY2024");
    expect(result[0]!.retentionRate).toBe(0);
    expect(result[1]!.fiscalYear).toBe("FY2025");
    expect(result[1]!.retentionRate).toBeCloseTo(0.8);
    expect(result[2]!.fiscalYear).toBe("FY2026");
    expect(result[2]!.retentionRate).toBeCloseTo(0.5);
  });

  it("coerces string COUNT(DISTINCT) values into numeric donor/retained counts", async () => {
    let callIdx = 0;
    const mockResults = [
      [{ count: "5" }],
      [{ count: "6" }],
      [{ count: "4" }],
      [{ count: "9" }],
      [{ count: "3" }],
    ];

    const db = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockResults[callIdx++] ?? [{ count: "0" }]),
        }),
      })),
    };

    const result = await getRetentionStats(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
      fiscalYearStartMonth: 1,
      count: 3,
      now: new Date("2026-06-15"),
    });

    expect(result[0]!.donorCount).toBe(5);
    expect(typeof result[0]!.donorCount).toBe("number");
    expect(result[1]!.retainedCount).toBe(4);
    expect(typeof result[1]!.retainedCount).toBe("number");
    expect(result[1]!.retentionRate).toBeCloseTo(0.8);
  });
});

// ---------------------------------------------------------------------------
// getPipelineGroups
// ---------------------------------------------------------------------------

describe("getPipelineGroups", () => {
  it("uses the same fail-closed ownership policy for pipeline list and count", async () => {
    const predicates: unknown[] = [];
    const db = {
      select: vi.fn().mockImplementation((selection: Record<string, unknown>) => {
        if (!("count" in selection)) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn((predicate) => {
                predicates.push(predicate);
                return {
                  orderBy: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue([]),
                  }),
                };
              }),
            }),
          };
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn((predicate) => {
              predicates.push(predicate);
              return Promise.resolve([{ count: 0 }]);
            }),
          }),
        };
      }),
    };

    await getPipelineGroups(db as never, {
      orgId: "org-1",
      entityId: "entity-1",
    });

    expect(predicates).toHaveLength(12);
    for (let index = 0; index < predicates.length; index += 2) {
      const listSql = renderPredicate(predicates[index]);
      const countSql = renderPredicate(predicates[index + 1]);
      expect(listSql).toEqual(countSql);
      expect(listSql.sql.toLowerCase()).toContain("not exists");
      expect(listSql.sql.toLowerCase()).toContain('"donor_scope_fund"."deleted_at" is null');
      expect(listSql.sql.toLowerCase()).toContain('"donor_scope_grant"."deleted_at" is null');
    }
  });

  function makeDataQuery(rows: unknown[]) {
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(rows),
          }),
        }),
      }),
    };
  }

  function makeCountQuery(count: number | null) {
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(count !== null ? [{ count }] : []),
      }),
    };
  }

  function makeDonationStatsQuery(rows: unknown[]) {
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          groupBy: vi.fn().mockResolvedValue(rows),
        }),
      }),
    };
  }

  function makeTagsQuery(rows: unknown[]) {
    return {
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(rows),
        }),
      }),
    };
  }

  it("returns contacts grouped by pipeline stage with enriched fields", async () => {
    const stageContacts = [{ id: "c-1", firstName: "Jane", pipelineStage: "prospect" }];
    const donationStats = [
      { contactId: "c-1", lastDonationDate: new Date("2026-01-01"), totalGiving: 5_000 },
    ];
    const tagRows = [
      { contactId: "c-1", tagId: "t-1", tagName: "Major Donor", tagColor: "#e07a5f" },
    ];

    let callCount = 0;
    const db = {
      select: vi.fn().mockImplementation(() => {
        callCount++;
        const posInStage = ((callCount - 1) % 4) + 1;
        switch (posInStage) {
          case 1:
            return makeDataQuery(stageContacts);
          case 2:
            return makeCountQuery(1);
          case 3:
            return makeDonationStatsQuery(donationStats);
          default:
            return makeTagsQuery(tagRows);
        }
      }),
    };

    const result = await getPipelineGroups(db as never, { orgId: "org-1", entityId: "entity-1" });

    expect(result).toHaveProperty("prospect");
    expect(result).toHaveProperty("cultivation");
    expect(result).toHaveProperty("solicitation");
    expect(result).toHaveProperty("stewardship");
    expect(result.prospect).toHaveProperty("contacts");
    expect(result.prospect).toHaveProperty("count");
    expect(result.prospect.count).toBe(1);

    const firstContact = result.prospect.contacts[0]!;
    expect(firstContact).toHaveProperty("tags");
    expect(firstContact).toHaveProperty("lastDonationDate");
    expect(firstContact).toHaveProperty("totalGiving");
    expect(firstContact.tags).toEqual([{ id: "t-1", name: "Major Donor", color: "#e07a5f" }]);
    expect(firstContact.totalGiving).toBe(5_000);
  });

  it("coerces string SUM totalGiving from the pg driver into a number", async () => {
    const stageContacts = [{ id: "c-1", firstName: "Jane", pipelineStage: "prospect" }];
    const donationStats = [
      { contactId: "c-1", lastDonationDate: new Date("2026-01-01"), totalGiving: "5000" },
    ];

    let callCount = 0;
    const db = {
      select: vi.fn().mockImplementation(() => {
        callCount++;
        const posInStage = ((callCount - 1) % 4) + 1;
        switch (posInStage) {
          case 1:
            return makeDataQuery(stageContacts);
          case 2:
            return makeCountQuery(1);
          case 3:
            return makeDonationStatsQuery(donationStats);
          default:
            return makeTagsQuery([]);
        }
      }),
    };

    const result = await getPipelineGroups(db as never, { orgId: "org-1", entityId: "entity-1" });

    const firstContact = result.prospect.contacts[0]!;
    expect(firstContact.totalGiving).toBe(5_000);
    expect(typeof firstContact.totalGiving).toBe("number");
  });

  it("defaults count to 0 when count query returns empty", async () => {
    let callCount = 0;
    const db = {
      select: vi.fn().mockImplementation(() => {
        callCount++;
        const posInStage = ((callCount - 1) % 2) + 1;
        if (posInStage === 1) {
          return makeDataQuery([]);
        }
        return makeCountQuery(null);
      }),
    };

    const result = await getPipelineGroups(db as never, { orgId: "org-1", entityId: "entity-1" });

    expect(result.prospect.count).toBe(0);
    expect(result.cultivation.count).toBe(0);
    expect(result.prospect.contacts).toEqual([]);
  });

  it("returns empty tags and zero totalGiving when no matching enrichment data", async () => {
    const stageContacts = [{ id: "c-99", firstName: "Bob", pipelineStage: "cultivation" }];
    let callCount = 0;
    const db = {
      select: vi.fn().mockImplementation(() => {
        callCount++;
        const posInStage = ((callCount - 1) % 4) + 1;
        switch (posInStage) {
          case 1:
            return makeDataQuery(stageContacts);
          case 2:
            return makeCountQuery(1);
          case 3:
            return makeDonationStatsQuery([]);
          default:
            return makeTagsQuery([]);
        }
      }),
    };

    const result = await getPipelineGroups(db as never, { orgId: "org-1", entityId: "entity-1" });

    const contact = result.prospect.contacts[0]!;
    expect(contact.tags).toEqual([]);
    expect(contact.lastDonationDate).toBeNull();
    expect(contact.totalGiving).toBe(0);
  });

  it("scopes tags innerJoin by tags.orgId to prevent cross-org tag leakage (fix #8)", async () => {
    // The tag query runs once per pipeline stage (4 stages) when contacts exist.
    // We set up one stage with a contact and capture the innerJoin call.
    const innerJoinSpy = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    });

    const stageContact = [{ id: "c-isolated", pipelineStage: "prospect" }];
    let callCount = 0;
    const db = {
      select: vi.fn().mockImplementation(() => {
        callCount++;
        const posInStage = ((callCount - 1) % 4) + 1;
        switch (posInStage) {
          case 1:
            // contacts data
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue(stageContact),
                  }),
                }),
              }),
            };
          case 2:
            // count query
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{ count: 1 }]),
              }),
            };
          case 3:
            // donation stats
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  groupBy: vi.fn().mockResolvedValue([]),
                }),
              }),
            };
          default:
            // tags query — capture innerJoin spy
            return {
              from: vi.fn().mockReturnValue({ innerJoin: innerJoinSpy }),
            };
        }
      }),
    };

    await getPipelineGroups(db as never, { orgId: "org-isolated", entityId: "entity-isolated" });

    // innerJoinSpy must have been called at least once (prospect stage has 1 contact).
    expect(innerJoinSpy).toHaveBeenCalled();
    const onPredicate = innerJoinSpy.mock.calls[0]?.[1];

    // Walk predicate AST and collect string values (cycle-safe).
    function collectStr(node: unknown, seen = new WeakSet<object>()): string[] {
      if (node === null || node === undefined) return [];
      if (typeof node === "string") return [node];
      if (typeof node !== "object") return [];
      if (seen.has(node as object)) return [];
      seen.add(node as object);
      if (Array.isArray(node)) return node.flatMap((i) => collectStr(i, seen));
      const results: string[] = [];
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (k === "table") continue;
        results.push(...collectStr(v, seen));
      }
      return results;
    }
    const values = collectStr(onPredicate);
    expect(values).toContain("org-isolated");
    expect(values).toContain("deleted_at");
  });
});
