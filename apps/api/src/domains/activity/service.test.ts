import { describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { activityLog, createDbHandle } from "@grantpipe/db";
import { activityEntityScope, listActivity, listOrgActivity } from "./service";

// ---------------------------------------------------------------------------
// Helper — builds a db mock that includes the leftJoin needed for actorName
// ---------------------------------------------------------------------------
function buildActivityDb(rows: unknown[], countValue: number) {
  return {
    select: vi
      .fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  offset: vi.fn().mockResolvedValue(rows),
                }),
              }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: countValue }]),
        }),
      }),
  };
}

describe("listActivity", () => {
  it("keeps the organization alias stable in the relational dashboard query", async () => {
    const { db, close } = await createDbHandle("postgresql://unused:unused@127.0.0.1:5432/unused");

    try {
      const compiled = db.query.activityLog
        .findMany({
          where: and(eq(activityLog.orgId, "org-1"), activityEntityScope("org-1", "entity-1")),
          limit: 10,
        })
        .toSQL();

      expect(compiled.sql).toContain('FROM "organizations" "activity_scope_org"');
      expect(compiled.sql).toContain('"activity_scope_org"."id" = $3');
      expect(compiled.sql).toContain('"activity_scope_org"."default_entity_id" = $4');
      expect(compiled.sql).toContain('"activity_scope_org"."deleted_at" IS NULL');
      expect(compiled.params).toEqual(["org-1", "entity-1", "org-1", "entity-1", 10]);
    } finally {
      await close();
    }
  });

  it("shares the selected/default entity policy across list and count", async () => {
    const predicates: unknown[] = [];
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockReturnValue({
              where: vi.fn((predicate) => {
                predicates.push(predicate);
                return {
                  orderBy: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      offset: vi.fn().mockResolvedValue([]),
                    }),
                  }),
                };
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn((predicate) => {
              predicates.push(predicate);
              return Promise.resolve([{ count: 0 }]);
            }),
          }),
        }),
    };

    await listActivity(db as never, {
      orgId: "org-1",
      activeEntityId: "entity-1",
      entityType: "contact",
      entityId: "contact-1",
      page: 1,
      pageSize: 25,
      sortBy: "createdAt",
      sortOrder: "desc",
    });

    const rendered = predicates.map((predicate) =>
      new PgDialect().sqlToQuery(predicate as Parameters<PgDialect["sqlToQuery"]>[0]),
    );
    expect(rendered).toHaveLength(2);
    expect(rendered[0]).toEqual(rendered[1]);
    expect(rendered[0]?.sql).toContain('"activity_log"."active_entity_id" is null');
    expect(rendered[0]?.sql).toContain('"activity_scope_org"."default_entity_id"');
    expect(rendered[0]?.sql.toLowerCase()).toContain('"activity_scope_org"."deleted_at" is null');
    expect(rendered[0]?.params).toContain("entity-1");
  });

  it("hydrates actorName from the user join", async () => {
    const row = { id: "activity-1", action: "created", actorId: "user-1", actorName: "Alice" };
    const db = buildActivityDb([row], 1);

    const result = await listActivity(db as never, {
      orgId: "org-1",
      activeEntityId: "entity-1",
      entityType: "contact",
      entityId: "contact-1",
      page: 1,
      pageSize: 25,
      sortBy: "createdAt",
      sortOrder: "desc",
    });

    expect(result.total).toBe(1);
    expect(result.data[0]).toMatchObject({ actorName: "Alice" });
  });

  it("returns paginated activity for an entity", async () => {
    const db = buildActivityDb([{ id: "activity-1", action: "created", actorName: null }], 1);

    const result = await listActivity(db as never, {
      orgId: "org-1",
      activeEntityId: "entity-1",
      entityType: "contact",
      entityId: "contact-1",
      page: 1,
      pageSize: 25,
      sortBy: "createdAt",
      sortOrder: "desc",
    });

    expect(result.total).toBe(1);
    expect(result.data[0]?.action).toBe("created");
  });

  it("orders ascending when sortOrder is 'asc'", async () => {
    const db = buildActivityDb([{ id: "activity-asc", action: "created", actorName: null }], 1);

    const result = await listActivity(db as never, {
      orgId: "org-1",
      activeEntityId: "entity-1",
      entityType: "contact",
      entityId: "contact-1",
      page: 1,
      pageSize: 25,
      sortBy: "createdAt",
      sortOrder: "asc",
    });

    expect(result.total).toBe(1);
    expect(result.data[0]?.id).toBe("activity-asc");
  });

  it("orders descending when sortOrder is 'desc'", async () => {
    const db = buildActivityDb([{ id: "activity-desc", action: "deleted", actorName: null }], 1);

    const result = await listActivity(db as never, {
      orgId: "org-1",
      activeEntityId: "entity-1",
      entityType: "contact",
      entityId: "contact-1",
      page: 1,
      pageSize: 25,
      sortBy: "createdAt",
      sortOrder: "desc",
    });

    expect(result.total).toBe(1);
    expect(result.data[0]?.id).toBe("activity-desc");
  });

  it("defaults total to zero when the count query returns no rows", async () => {
    const db = buildActivityDb([], 0);

    const result = await listActivity(db as never, {
      orgId: "org-1",
      activeEntityId: "entity-1",
      entityType: "contact",
      entityId: "contact-1",
      page: 1,
      pageSize: 25,
      sortBy: "createdAt",
      sortOrder: "desc",
    });

    expect(result.total).toBe(0);
  });

  it("defaults total to zero when the count query returns an empty array", async () => {
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    offset: vi.fn().mockResolvedValue([]),
                  }),
                }),
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
    };

    const result = await listActivity(db as never, {
      orgId: "org-1",
      activeEntityId: "entity-1",
      entityType: "contact",
      entityId: "contact-1",
      page: 1,
      pageSize: 25,
      sortBy: "createdAt",
      sortOrder: "desc",
    });

    expect(result.total).toBe(0);
  });
});

describe("listOrgActivity", () => {
  function buildDb(rows: unknown[], countValue: number) {
    return {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    offset: vi.fn().mockResolvedValue(rows),
                  }),
                }),
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: countValue }]),
          }),
        }),
    };
  }

  it("returns paginated org-wide activity", async () => {
    const db = buildDb([{ id: "activity-1", action: "created" }], 1);

    const result = await listOrgActivity(db as never, {
      orgId: "org-1",
      activeEntityId: "entity-1",
      page: 1,
      pageSize: 25,
    });

    expect(result.total).toBe(1);
    expect(result.data[0]).toMatchObject({ action: "created" });
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
  });

  it("defaults total to zero when count returns no rows", async () => {
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    offset: vi.fn().mockResolvedValue([]),
                  }),
                }),
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
    };

    const result = await listOrgActivity(db as never, {
      orgId: "org-1",
      activeEntityId: "entity-1",
      page: 1,
      pageSize: 25,
    });

    expect(result.total).toBe(0);
  });

  it("accepts optional entityType filter", async () => {
    const db = buildDb([{ id: "activity-2", action: "updated" }], 1);

    const result = await listOrgActivity(db as never, {
      orgId: "org-1",
      activeEntityId: "entity-1",
      entityType: "grant",
      page: 1,
      pageSize: 25,
    });

    expect(result.total).toBe(1);
  });

  it("accepts an allowed entity type allowlist when no entityType is provided", async () => {
    const db = buildDb([{ id: "activity-allowed", action: "downloaded" }], 1);

    const result = await listOrgActivity(db as never, {
      orgId: "org-1",
      activeEntityId: "entity-1",
      allowedEntityTypes: ["grant", "fund"],
      page: 1,
      pageSize: 25,
    });

    expect(result.total).toBe(1);
    expect(result.data[0]).toMatchObject({ id: "activity-allowed" });
  });

  it("accepts optional actorId filter", async () => {
    const db = buildDb([{ id: "activity-3", action: "deleted" }], 1);

    const result = await listOrgActivity(db as never, {
      orgId: "org-1",
      activeEntityId: "entity-1",
      actorId: "user-1",
      page: 1,
      pageSize: 25,
    });

    expect(result.total).toBe(1);
  });

  it("accepts optional fromDate and toDate filters", async () => {
    const db = buildDb([{ id: "activity-4", action: "created" }], 1);

    const result = await listOrgActivity(db as never, {
      orgId: "org-1",
      activeEntityId: "entity-1",
      fromDate: new Date("2025-01-01"),
      toDate: new Date("2025-12-31"),
      page: 2,
      pageSize: 10,
    });

    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(10);
  });

  it("orders results ascending when sortOrder is 'asc'", async () => {
    const db = buildDb([{ id: "activity-5", action: "created" }], 1);

    const result = await listOrgActivity(db as never, {
      orgId: "org-1",
      activeEntityId: "entity-1",
      sortOrder: "asc",
      page: 1,
      pageSize: 25,
    });

    expect(result.total).toBe(1);
    expect(result.data[0]).toMatchObject({ action: "created" });
  });

  it("orders results descending when sortOrder is 'desc'", async () => {
    const db = buildDb([{ id: "activity-6", action: "deleted" }], 1);

    const result = await listOrgActivity(db as never, {
      orgId: "org-1",
      activeEntityId: "entity-1",
      sortOrder: "desc",
      page: 1,
      pageSize: 25,
    });

    expect(result.total).toBe(1);
    expect(result.data[0]).toMatchObject({ action: "deleted" });
  });
});
