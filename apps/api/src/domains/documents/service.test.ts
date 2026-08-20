import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { and, eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  contacts,
  donations,
  events,
  funders,
  funds,
  generatedReports,
  grantPaymentRequests,
  grants,
  organizations,
  subawards,
  subrecipientCorrectiveActions,
  subrecipientFindings,
  subrecipientMonitoringTasks,
  subrecipients,
} from "@grantpipe/db";
import { AppError } from "../../lib/app-error";
import { getIntegrations, resetLocalMockIntegrationRecords } from "../../lib/integrations";
import { documentParentEntityScope } from "./entityScope";
import { createDocument, downloadDocument, listDocuments, softDeleteDocument } from "./service";

// Relational query builder with NO connection — used only to compile SQL in
// the hazard-demonstration test at the bottom of this file.
const drizzleMock = drizzle.mock.bind(drizzle);

const documentsServiceSource = readFileSync(
  fileURLToPath(new URL("./service.ts", import.meta.url)),
  "utf8",
);

// Table objects for the entityTypes whose entityExists() branch was converted
// from the relational query API (db.query.<table>.findFirst) to the core
// query builder (db.select().from(table).where(...).limit(1)) — see the
// module-level comment on entityExists() in service.ts. Keyed by the same
// string used as the old db.query.<key> lookup so existing it.each tables
// keep working with a lookup by string key.
const CONVERTED_ENTITY_TABLES: Record<string, unknown> = {
  contacts,
  donations,
  events,
  funders,
  funds,
  generatedReports,
  grants,
  grantPaymentRequests,
  organizations,
  subrecipients,
  subawards,
  subrecipientMonitoringTasks,
  subrecipientFindings,
  subrecipientCorrectiveActions,
};

/**
 * Builds a `db.select` mock that answers BOTH the converted entityExists()
 * lookup (select(...).from(entityTable).where(...).limit(1)) and, when
 * `listingRows` is provided, the downstream listDocuments() listing queries
 * (select().from(documents).where().orderBy().limit().offset() for rows, and
 * select({count}).from(documents).where() for the total). Dispatch is by
 * table identity (captured via `.from(table)`), not call order, so this mock
 * is safe regardless of which query gets issued first.
 */
function buildEntitySelectDb(params: {
  entityTable: unknown;
  found: Record<string, unknown> | null | undefined;
  listingRows?: unknown[];
  /**
   * Additional table-identity lookups (e.g. donationExists()'s per-owner
   * funds/grants/organizations checks) answered with `.limit(1)` semantics.
   */
  owners?: Array<{ table: unknown; found: Record<string, unknown> | undefined }>;
}) {
  const whereSpy = vi.fn();
  const select = vi.fn((fields?: Record<string, unknown>) => ({
    from: vi.fn((table: unknown) => {
      if (table === params.entityTable) {
        return {
          where: vi.fn((whereArg: unknown) => {
            whereSpy(whereArg);
            return { limit: vi.fn().mockResolvedValue(params.found ? [params.found] : []) };
          }),
        };
      }
      const owner = params.owners?.find((entry) => entry.table === table);
      if (owner) {
        return {
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(owner.found ? [owner.found] : []),
          }),
        };
      }
      if (fields && "count" in fields) {
        return {
          where: vi.fn().mockResolvedValue([{ count: params.listingRows?.length ?? 0 }]),
        };
      }
      return {
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(params.listingRows ?? []),
            }),
          }),
        }),
      };
    }),
  }));
  return { select, whereSpy };
}

const { mockCaptureBackgroundException } = vi.hoisted(() => ({
  mockCaptureBackgroundException: vi.fn(),
}));

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/sentry", () => ({
  captureBackgroundException: mockCaptureBackgroundException,
}));

import { recordActivityLog } from "../../lib/activity-log";

beforeEach(() => {
  mockCaptureBackgroundException.mockClear();
});

function withTransaction<T extends object>(
  dbMock: T,
): T & { transaction: ReturnType<typeof vi.fn> } {
  const wrapped = {
    query: {
      documents: {
        findFirst: vi.fn().mockResolvedValue({
          id: "doc-1",
          entityType: "contact",
          entityId: "contact-1",
        }),
      },
      ...("query" in dbMock && typeof dbMock.query === "object" ? dbMock.query : {}),
    },
    // Default entity lookup: the contact branch of entityExists() uses the
    // core query builder (db.select), so a default select mock resolving the
    // default contact parent is provided unless the test supplies its own.
    select:
      "select" in dbMock
        ? (dbMock as { select: unknown }).select
        : buildEntitySelectDb({
            entityTable: contacts,
            found: { id: "contact-1", orgId: "org-1" },
          }).select,
    ...dbMock,
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(wrapped)),
  };
  return wrapped as T & { transaction: ReturnType<typeof vi.fn> };
}

function renderSql(condition: unknown) {
  const dialect = new PgDialect();
  return dialect.sqlToQuery(condition as Parameters<PgDialect["sqlToQuery"]>[0]);
}

describe("listDocuments", () => {
  beforeEach(() => {
    resetLocalMockIntegrationRecords();
  });

  it("returns paginated documents", async () => {
    const rows = [{ id: "doc-1" }];
    const { select } = buildEntitySelectDb({
      entityTable: contacts,
      found: { id: "contact-1", orgId: "org-1" },
      listingRows: rows,
    });
    const db = { query: {}, select };

    const result = await listDocuments(db as never, {
      orgId: "org-1",
      selectedEntityId: "entity-active",
      entityType: "contact",
      entityId: "contact-1",
      page: 2,
      pageSize: 10,
      sortBy: "createdAt",
      sortOrder: "desc",
    });

    expect(result).toEqual({
      data: rows,
      total: 1,
      page: 2,
      pageSize: 10,
    });
  });

  it("throws a 404 AppError when the target entity does not exist in the org", async () => {
    const { select } = buildEntitySelectDb({ entityTable: contacts, found: undefined });
    const db = { query: {}, select };

    await expect(
      listDocuments(db as never, {
        orgId: "org-1",
        selectedEntityId: "entity-active",
        entityType: "contact",
        entityId: "missing",
        page: 1,
        pageSize: 10,
        sortBy: "createdAt",
        sortOrder: "desc",
      }),
    ).rejects.toMatchObject({ status: 404 });

    // Only the entity lookup ran; the document-listing selects were skipped.
    expect(select).toHaveBeenCalledOnce();
  });

  it("defaults total to 0 when the count query returns no rows", async () => {
    // buildEntitySelectDb's count branch returns listingRows.length, so build
    // the "count query returns no rows" shape manually: entity lookup found,
    // rows select empty, count select resolves [] (exercising the ?? 0 branch).
    const select = vi.fn((fields?: Record<string, unknown>) => ({
      from: vi.fn((table: unknown) => {
        if (table === contacts) {
          return {
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: "contact-1", orgId: "org-1" }]),
            }),
          };
        }
        if (fields && "count" in fields) {
          return { where: vi.fn().mockResolvedValue([]) };
        }
        return {
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({ offset: vi.fn().mockResolvedValue([]) }),
            }),
          }),
        };
      }),
    }));
    const db = { query: {}, select };

    const result = await listDocuments(db as never, {
      orgId: "org-1",
      selectedEntityId: "entity-active",
      entityType: "contact",
      entityId: "contact-1",
      page: 1,
      pageSize: 10,
      sortBy: "createdAt",
      sortOrder: "desc",
    });

    expect(result.total).toBe(0);
  });

  it("wraps the not-found error in an AppError instance", async () => {
    const { select } = buildEntitySelectDb({ entityTable: contacts, found: undefined });
    const db = { query: {}, select };

    await expect(
      listDocuments(db as never, {
        orgId: "org-1",
        selectedEntityId: "entity-active",
        entityType: "contact",
        entityId: "missing",
        page: 1,
        pageSize: 10,
        sortBy: "createdAt",
        sortOrder: "desc",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it.each([
    ["payment_request", "grantPaymentRequests"],
    ["subrecipient", "subrecipients"],
    ["subaward", "subawards"],
    ["subrecipient_monitoring_task", "subrecipientMonitoringTasks"],
    ["subrecipient_finding", "subrecipientFindings"],
    ["subrecipient_corrective_action", "subrecipientCorrectiveActions"],
  ] as const)("validates %s entities before listing documents", async (entityType, queryKey) => {
    const rows = [{ id: "doc-1" }];
    const { select, whereSpy } = buildEntitySelectDb({
      entityTable: CONVERTED_ENTITY_TABLES[queryKey],
      found: { id: "entity-1", orgId: "org-1" },
      listingRows: rows,
    });
    const db = { query: {}, select };

    await expect(
      listDocuments(db as never, {
        orgId: "org-1",
        selectedEntityId: "entity-active",
        entityType,
        entityId: "entity-1",
        allowedEntityTypes: [entityType],
        page: 1,
        pageSize: 10,
        sortBy: "createdAt",
        sortOrder: "desc",
      }),
    ).resolves.toMatchObject({ data: rows, total: 1 });
    expect(whereSpy).toHaveBeenCalledOnce();
  });

  it("scopes grant document parents to the selected active entity", async () => {
    const rows = [{ id: "doc-1" }];
    const { select, whereSpy } = buildEntitySelectDb({
      entityTable: grants,
      found: { id: "grant-1", orgId: "org-1" },
      listingRows: rows,
    });
    const db = { query: {}, select };

    await listDocuments(db as never, {
      orgId: "org-1",
      entityType: "grant",
      entityId: "grant-1",
      selectedEntityId: "entity-active",
      page: 1,
      pageSize: 10,
      sortBy: "createdAt",
      sortOrder: "desc",
    });

    const sql = renderSql(whereSpy.mock.calls[0]?.[0]).sql;
    expect(sql).toContain('"grants"."entity_id" = $');
  });

  it("throws Forbidden when allowedEntityTypes is set and excludes the requested entityType", async () => {
    const db = {} as never;

    await expect(
      listDocuments(db, {
        orgId: "org-1",
        selectedEntityId: "entity-active",
        entityType: "contact",
        entityId: "contact-1",
        allowedEntityTypes: ["grant", "fund"],
        page: 1,
        pageSize: 10,
        sortBy: "createdAt",
        sortOrder: "asc",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it.each([
    ["grant", "grants"],
    ["funder", "funders"],
    ["fund", "funds"],
    ["generated_report", "generatedReports"],
  ] as const)(
    "requires selected-entity ownership for direct %s parents",
    async (entityType, key) => {
      const { select, whereSpy } = buildEntitySelectDb({
        entityTable: CONVERTED_ENTITY_TABLES[key],
        found: undefined,
      });
      const db = { query: {}, select };

      await expect(
        listDocuments(db as never, {
          orgId: "org-1",
          selectedEntityId: "entity-active",
          entityType,
          entityId: "parent-1",
          page: 1,
          pageSize: 10,
          sortBy: "createdAt",
          sortOrder: "desc",
        }),
      ).rejects.toMatchObject({ status: 404 });

      const rendered = renderSql(whereSpy.mock.calls[0]?.[0]).sql.toLowerCase();
      expect(rendered).toContain('"entity_id" = $');
      expect(rendered).toContain('"org_id" = $');
      expect(select).toHaveBeenCalledOnce();
    },
  );

  it.each([
    ["payment_request", "grantPaymentRequests", ['"grants"', '"grants"."deleted_at" is null']],
    ["subaward", "subawards", ['"grants"', '"grants"."deleted_at" is null']],
    [
      "subrecipient_monitoring_task",
      "subrecipientMonitoringTasks",
      ['"subawards"', '"subawards"."deleted_at" is null', '"grants"."deleted_at" is null'],
    ],
    [
      "subrecipient_finding",
      "subrecipientFindings",
      ['"subawards"', '"subawards"."deleted_at" is null', '"grants"."deleted_at" is null'],
    ],
    [
      "subrecipient_corrective_action",
      "subrecipientCorrectiveActions",
      [
        '"subrecipient_findings"."deleted_at" is null',
        '"subawards"."deleted_at" is null',
        '"grants"."deleted_at" is null',
      ],
    ],
  ] as const)(
    "resolves %s ownership through only active ancestors",
    async (entityType, key, fragments) => {
      const { select, whereSpy } = buildEntitySelectDb({
        entityTable: CONVERTED_ENTITY_TABLES[key],
        found: undefined,
      });
      const db = { query: {}, select };

      await expect(
        listDocuments(db as never, {
          orgId: "org-1",
          selectedEntityId: "entity-active",
          entityType,
          entityId: "parent-1",
          page: 1,
          pageSize: 10,
          sortBy: "createdAt",
          sortOrder: "desc",
        }),
      ).rejects.toMatchObject({ status: 404 });

      const rendered = renderSql(whereSpy.mock.calls[0]?.[0]).sql;
      expect(rendered).toContain('"grants"."entity_id" = $');
      for (const fragment of fragments) {
        expect(rendered.toLowerCase()).toContain(fragment.toLowerCase());
      }
      // Only the entity lookup select ran — the downstream document-listing
      // selects were never reached because entityExists() returned null.
      expect(select).toHaveBeenCalledOnce();
    },
  );

  it.each([
    ["contact", "contacts"],
    ["event", "events"],
    ["subrecipient", "subrecipients"],
  ] as const)(
    "limits org-global %s parents to the default entity (converted select path)",
    async (entityType, key) => {
      const { select, whereSpy } = buildEntitySelectDb({
        entityTable: CONVERTED_ENTITY_TABLES[key],
        found: undefined,
      });
      const db = { query: {}, select };

      await expect(
        listDocuments(db as never, {
          orgId: "org-1",
          selectedEntityId: "entity-sibling",
          entityType,
          entityId: "parent-1",
          page: 1,
          pageSize: 10,
          sortBy: "createdAt",
          sortOrder: "desc",
        }),
      ).rejects.toMatchObject({ status: 404 });

      const rendered = renderSql(whereSpy.mock.calls[0]?.[0]).sql;
      expect(rendered).toContain('"organizations"."default_entity_id" = $');
      expect(select).toHaveBeenCalledOnce();
    },
  );

  describe("donation ownership behavior", () => {
    // All lookups here go through the core query builder: the donation entity
    // lookup, its per-owner checks (funds / grants / organizations), and the
    // downstream document-listing selects. Dispatch is by table identity;
    // per-table spies replace the old db.query.<table>.findFirst assertions.
    function buildDonationDb(params: {
      donation: { id: string; orgId: string; fundId: string | null; grantId: string | null };
      fundOwner?: { id: string };
      grantOwner?: { id: string };
      defaultOrganization?: { id: string };
    }) {
      const rows = [{ id: "doc-1" }];
      const donationWhereSpy = vi.fn();
      const fundOwnerSpy = vi.fn();
      const grantOwnerSpy = vi.fn();
      const organizationOwnerSpy = vi.fn();
      const ownerLookup = (spy: ReturnType<typeof vi.fn>, owner?: { id: string }) => ({
        where: vi.fn((whereArg: unknown) => {
          spy(whereArg);
          return { limit: vi.fn().mockResolvedValue(owner ? [owner] : []) };
        }),
      });
      const select = vi.fn((fields?: Record<string, unknown>) => ({
        from: vi.fn((table: unknown) => {
          if (table === donations) {
            return {
              where: vi.fn((whereArg: unknown) => {
                donationWhereSpy(whereArg);
                return { limit: vi.fn().mockResolvedValue([params.donation]) };
              }),
            };
          }
          if (table === funds) return ownerLookup(fundOwnerSpy, params.fundOwner);
          if (table === grants) return ownerLookup(grantOwnerSpy, params.grantOwner);
          if (table === organizations) {
            return ownerLookup(organizationOwnerSpy, params.defaultOrganization);
          }
          if (fields && "count" in fields) {
            return { where: vi.fn().mockResolvedValue([{ count: rows.length }]) };
          }
          return {
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({ offset: vi.fn().mockResolvedValue(rows) }),
              }),
            }),
          };
        }),
      }));
      return {
        query: {},
        select,
        _donationWhereSpy: donationWhereSpy,
        _fundOwnerSpy: fundOwnerSpy,
        _grantOwnerSpy: grantOwnerSpy,
        _organizationOwnerSpy: organizationOwnerSpy,
      };
    }

    const listParams = {
      orgId: "org-1",
      selectedEntityId: "entity-active",
      entityType: "donation" as const,
      entityId: "donation-1",
      page: 1,
      pageSize: 10,
      sortBy: "createdAt" as const,
      sortOrder: "desc" as const,
    };

    it("allows a both-linked donation only when both owners match", async () => {
      const db = buildDonationDb({
        donation: {
          id: "donation-1",
          orgId: "org-1",
          fundId: "fund-1",
          grantId: "grant-1",
        },
        fundOwner: { id: "fund-1" },
        grantOwner: { id: "grant-1" },
      });

      await expect(listDocuments(db as never, listParams)).resolves.toMatchObject({ total: 1 });
      expect(db._fundOwnerSpy).toHaveBeenCalledOnce();
      expect(db._grantOwnerSpy).toHaveBeenCalledOnce();
      expect(db._organizationOwnerSpy).not.toHaveBeenCalled();
    });

    it("denies a donation linked to a sibling grant before document queries", async () => {
      const db = buildDonationDb({
        donation: {
          id: "donation-1",
          orgId: "org-1",
          fundId: "fund-1",
          grantId: "grant-sibling",
        },
        fundOwner: { id: "fund-1" },
      });

      await expect(listDocuments(db as never, listParams)).rejects.toMatchObject({ status: 404 });
      // The donation lookup and its owner checks ran; only the downstream
      // document-listing selects were skipped once ownership failed.
      expect(db._donationWhereSpy).toHaveBeenCalledOnce();
      expect(db._grantOwnerSpy).toHaveBeenCalledOnce();
      expect(db.select).toHaveBeenCalledTimes(3);
    });

    it("denies a donation linked to a sibling fund before document queries", async () => {
      const db = buildDonationDb({
        donation: {
          id: "donation-1",
          orgId: "org-1",
          fundId: "fund-sibling",
          grantId: "grant-1",
        },
        grantOwner: { id: "grant-1" },
      });

      await expect(listDocuments(db as never, listParams)).rejects.toMatchObject({ status: 404 });
      expect(db._fundOwnerSpy).toHaveBeenCalledOnce();
      expect(db.select).toHaveBeenCalledTimes(3);
    });

    it("allows an unlinked donation in the default entity", async () => {
      const db = buildDonationDb({
        donation: {
          id: "donation-1",
          orgId: "org-1",
          fundId: null,
          grantId: null,
        },
        defaultOrganization: { id: "org-1" },
      });

      await expect(listDocuments(db as never, listParams)).resolves.toMatchObject({ total: 1 });
      expect(db._organizationOwnerSpy).toHaveBeenCalledOnce();
      expect(db._fundOwnerSpy).not.toHaveBeenCalled();
      expect(db._grantOwnerSpy).not.toHaveBeenCalled();
    });

    it("denies an unlinked donation in a sibling entity before document queries", async () => {
      const db = buildDonationDb({
        donation: {
          id: "donation-1",
          orgId: "org-1",
          fundId: null,
          grantId: null,
        },
      });

      await expect(listDocuments(db as never, listParams)).rejects.toMatchObject({ status: 404 });
      expect(db._donationWhereSpy).toHaveBeenCalledOnce();
      expect(db._organizationOwnerSpy).toHaveBeenCalledOnce();
      expect(db.select).toHaveBeenCalledTimes(2);
    });
  });

  it("limits award intake documents to the org default entity", async () => {
    const { select, whereSpy } = buildEntitySelectDb({
      entityTable: organizations,
      found: undefined,
    });
    const db = { query: {}, select };

    await expect(
      listDocuments(db as never, {
        orgId: "org-1",
        selectedEntityId: "entity-sibling",
        entityType: "award_intake",
        entityId: "org-1",
        page: 1,
        pageSize: 10,
        sortBy: "createdAt",
        sortOrder: "desc",
      }),
    ).rejects.toMatchObject({ status: 404 });

    const rendered = renderSql(whereSpy.mock.calls[0]?.[0]).sql;
    expect(rendered).toContain('"organizations"."default_entity_id" = $');
    expect(rendered).toContain('"organizations"."deleted_at" is null');
    expect(select).toHaveBeenCalledOnce();
  });
});

describe("createDocument", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "11111111-1111-1111-1111-111111111111",
    );
  });

  const baseParams = {
    orgId: "org-1",
    selectedEntityId: "entity-active",
    userId: "user-1",
    entityId: "entity-1",
    filename: 'appeal/"draft".pdf',
    mimeType: "application/pdf",
    sizeBytes: 5,
    body: new Uint8Array([1, 2, 3]),
  };

  it.each([
    ["contact", "contacts"],
    ["donation", "donations"],
    ["grant", "grants"],
    ["funder", "funders"],
    ["fund", "funds"],
    ["event", "events"],
    ["generated_report", "generatedReports"],
  ] as const)("uploads a document for %s entities", async (entityType, queryKey) => {
    const put = vi.fn().mockResolvedValue(undefined);
    const returning = vi.fn().mockResolvedValue([
      {
        id: "11111111-1111-1111-1111-111111111111",
        entityType,
        entityId: "entity-1",
        filename: 'appeal/"draft".pdf',
        mimeType: "application/pdf",
        sizeBytes: 5,
      },
    ]);
    const values = vi.fn().mockReturnValue({ returning });
    const insert = vi.fn().mockReturnValue({ values });
    // Every entityExists() branch (including donationExists()'s per-owner
    // checks) is converted to the core query builder (db.select) — see the
    // source-contract guard. For the unlinked donation case, the owner check
    // resolves via the organizations table lookup.
    const found = { id: "entity-1", orgId: "org-1", fundId: null, grantId: null };
    const { select } = buildEntitySelectDb({
      entityTable: CONVERTED_ENTITY_TABLES[queryKey],
      found,
      owners: [{ table: organizations, found: { id: "org-1" } }],
    });
    const db = withTransaction({ query: {}, insert, select });

    const result = await createDocument(
      db as never,
      { R2: { put, get: vi.fn() } },
      {
        ...baseParams,
        entityType,
      },
    );

    expect(put).toHaveBeenCalledWith(
      expect.stringContaining(
        `${entityType}/entity-1/11111111-1111-1111-1111-111111111111-appeal--draft-.pdf`,
      ),
      baseParams.body,
    );
    expect(result.id).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("strips control characters and null bytes from the R2 key", async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const returning = vi.fn().mockResolvedValue([
      {
        id: "11111111-1111-1111-1111-111111111111",
        entityType: "contact",
        entityId: "entity-1",
        filename: "report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 5,
      },
    ]);
    const values = vi.fn().mockReturnValue({ returning });
    const insert = vi.fn().mockReturnValue({ values });
    // Contact entity lookup handled by withTransaction's default select mock.
    const db = withTransaction({ insert });

    await createDocument(
      db as never,
      { R2: { put, get: vi.fn() } },
      {
        ...baseParams,
        entityType: "contact",
        // A null byte plus assorted C0 control characters embedded in the name.
        filename: `re\x00po\x1frt\t.pdf`,
      },
    );

    const key = put.mock.calls[0]?.[0] as string;
    // No control characters (0x00-0x1F) may survive into the R2 object key.
    // eslint-disable-next-line no-control-regex -- intentionally asserting control chars are absent
    expect(key).not.toMatch(/[\x00-\x1f]/);
    expect(key).toContain("11111111-1111-1111-1111-111111111111-re-po-rt-.pdf");
  });

  it("throws when the R2 binding is missing", async () => {
    await expect(
      createDocument({} as never, { INTEGRATION_MODE: "real" } as never, {
        ...baseParams,
        entityType: "contact",
      }),
    ).rejects.toThrow("R2 binding is required for real storage mode");
  });

  it("stores documents through the mock storage provider in default mode", async () => {
    const returning = vi.fn().mockResolvedValue([
      {
        id: "11111111-1111-1111-1111-111111111111",
        entityType: "contact",
        entityId: "entity-1",
        filename: 'appeal/"draft".pdf',
        mimeType: "application/pdf",
        sizeBytes: 5,
      },
    ]);
    const values = vi.fn().mockReturnValue({ returning });
    const db = withTransaction({ insert: vi.fn().mockReturnValue({ values }) });

    const result = await createDocument(
      db as never,
      { APP_URL: "http://localhost:5173" } as never,
      {
        ...baseParams,
        entityType: "contact",
      },
    );

    expect(db.insert).toHaveBeenCalledTimes(2);
    expect(result.id).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("throws when the target entity does not exist", async () => {
    const { select } = buildEntitySelectDb({ entityTable: contacts, found: undefined });
    const db = { query: {}, select };

    const denial = expect(
      createDocument(
        db as never,
        { R2: { put: vi.fn(), get: vi.fn() } },
        {
          ...baseParams,
          entityType: "contact",
        },
      ),
    );
    await denial.rejects.toMatchObject({ status: 404, message: "Entity not found" });
  });

  it("denies sibling-parent uploads before storage or transaction effects", async () => {
    const put = vi.fn();
    const transaction = vi.fn();
    const { select } = buildEntitySelectDb({ entityTable: grants, found: undefined });
    const db = { query: {}, select, transaction };

    await expect(
      createDocument(
        db as never,
        { R2: { put, get: vi.fn() } },
        {
          ...baseParams,
          selectedEntityId: "entity-active",
          entityType: "grant",
          entityId: "grant-sibling",
        },
      ),
    ).rejects.toThrow("Entity not found");

    expect(put).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    expect(recordActivityLog).not.toHaveBeenCalled();
  });

  it("throws when the insert does not return a row", async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    const returning = vi.fn().mockResolvedValue([]);
    const values = vi.fn().mockReturnValue({ returning });
    const insert = vi.fn().mockReturnValue({ values });
    const db = withTransaction({ insert });

    await expect(
      createDocument(
        db as never,
        { R2: { put, get: vi.fn(), delete: deleteObject } },
        {
          ...baseParams,
          entityType: "contact",
        },
      ),
    ).rejects.toThrow("Failed to create document");

    expect(deleteObject).toHaveBeenCalledWith(
      "org-1/contact/entity-1/11111111-1111-1111-1111-111111111111-appeal--draft-.pdf",
    );
  });

  it("keeps the original insert failure when cleanup delete fails", async () => {
    const cleanupError = new Error("cleanup failed");
    const put = vi.fn().mockResolvedValue(undefined);
    const deleteObject = vi.fn().mockRejectedValue(cleanupError);
    const returning = vi.fn().mockResolvedValue([]);
    const values = vi.fn().mockReturnValue({ returning });
    const insert = vi.fn().mockReturnValue({ values });
    const db = withTransaction({ insert });

    await expect(
      createDocument(
        db as never,
        { R2: { put, get: vi.fn(), delete: deleteObject } },
        {
          ...baseParams,
          entityType: "contact",
        },
      ),
    ).rejects.toThrow("Failed to create document");

    expect(deleteObject).toHaveBeenCalledWith(
      "org-1/contact/entity-1/11111111-1111-1111-1111-111111111111-appeal--draft-.pdf",
    );
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(cleanupError, "documents", {
      step: "upload_cleanup",
      entity_type: "contact",
    });
  });

  it("cleans up the stored R2 object when activity logging fails (transaction rolls back)", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("activity failed"));
    const put = vi.fn().mockResolvedValue(undefined);
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    const returning = vi.fn().mockResolvedValue([
      {
        id: "11111111-1111-1111-1111-111111111111",
        entityType: "contact",
        entityId: "entity-1",
        filename: 'appeal/"draft".pdf',
        mimeType: "application/pdf",
        sizeBytes: 5,
      },
    ]);
    const values = vi.fn().mockReturnValue({ returning });
    const insert = vi.fn().mockReturnValue({ values });
    const db = withTransaction({ insert });

    await expect(
      createDocument(
        db as never,
        { R2: { put, get: vi.fn(), delete: deleteObject } },
        {
          ...baseParams,
          entityType: "contact",
        },
      ),
    ).rejects.toThrow("activity failed");

    expect(put).toHaveBeenCalled();
    expect(deleteObject).toHaveBeenCalledWith(
      "org-1/contact/entity-1/11111111-1111-1111-1111-111111111111-appeal--draft-.pdf",
    );
  });
});

describe("downloadDocument", () => {
  it("returns a response with sanitized content disposition", async () => {
    const { select } = buildEntitySelectDb({
      entityTable: contacts,
      found: { id: "contact-1", orgId: "org-1" },
    });
    const db = {
      query: {
        documents: {
          findFirst: vi.fn().mockResolvedValue({
            id: "doc-1",
            fileKey: 'org-1/contact/contact-1/doc-1-appeal/"draft".pdf',
            filename: 'appeal/"draft".pdf',
            mimeType: "application/pdf",
            entityType: "contact",
            entityId: "contact-1",
          }),
        },
      },
      select,
    };

    const response = await downloadDocument(
      db as never,
      { R2: { put: vi.fn(), get: vi.fn().mockResolvedValue({ body: "pdf-bytes" }) } },
      { orgId: "org-1", selectedEntityId: "entity-active", documentId: "doc-1" },
    );

    expect(await response.text()).toBe("pdf-bytes");
    expect(response.headers.get("Content-Disposition")).toContain("appeal--draft-.pdf");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("builds an RFC 5987 content disposition for non-ASCII filenames without throwing", async () => {
    // A filename with code points > 255 (e.g. CJK) cannot be placed directly in
    // an HTTP header value — the Workers/undici Headers API requires a ByteString
    // and throws otherwise, turning the download into a 500 and rendering the
    // document permanently undownloadable.
    const { select } = buildEntitySelectDb({
      entityTable: contacts,
      found: { id: "contact-1", orgId: "org-1" },
    });
    const db = {
      query: {
        documents: {
          findFirst: vi.fn().mockResolvedValue({
            id: "doc-1",
            fileKey: "org-1/contact/contact-1/doc-1-报告.pdf",
            filename: "年度报告 (final).pdf",
            mimeType: "application/pdf",
            entityType: "contact",
            entityId: "contact-1",
          }),
        },
      },
      select,
    };

    const response = await downloadDocument(
      db as never,
      { R2: { put: vi.fn(), get: vi.fn().mockResolvedValue({ body: "pdf-bytes" }) } },
      { orgId: "org-1", selectedEntityId: "entity-active", documentId: "doc-1" },
    );

    const disposition = response.headers.get("Content-Disposition");
    expect(disposition).toContain("attachment;");
    // ASCII fallback for legacy clients: non-ASCII bytes replaced, no raw > 255 chars.
    expect(disposition).toMatch(/filename="[\x20-\x7e]*"/);
    // RFC 5987 UTF-8 encoded parameter carries the real name.
    expect(disposition).toContain("filename*=UTF-8''");
    expect(disposition).toContain(encodeURIComponent("年度报告"));
    expect(await response.text()).toBe("pdf-bytes");
  });

  it("blocks downloads when the document entity type is outside the caller allowlist", async () => {
    const get = vi.fn();
    const db = {
      query: {
        documents: {
          findFirst: vi.fn().mockResolvedValue({
            id: "doc-1",
            fileKey: "org-1/contact/contact-1/doc-1-appeal.pdf",
            filename: "appeal.pdf",
            mimeType: "application/pdf",
            entityType: "contact",
          }),
        },
      },
    };

    await expect(
      downloadDocument(
        db as never,
        { R2: { put: vi.fn(), get } },
        {
          orgId: "org-1",
          selectedEntityId: "entity-active",
          documentId: "doc-1",
          allowedEntityTypes: ["grant", "fund", "generated_report"],
        },
      ),
    ).rejects.toMatchObject({ status: 403 });

    expect(get).not.toHaveBeenCalled();
  });

  it("rejects downloads when the parent entity no longer exists", async () => {
    const get = vi.fn().mockResolvedValue({ body: "pdf-bytes" });
    const { select } = buildEntitySelectDb({ entityTable: grants, found: undefined });
    const db = {
      query: {
        documents: {
          findFirst: vi.fn().mockResolvedValue({
            id: "doc-1",
            fileKey: "org-1/grant/grant-1/doc-1-award.pdf",
            filename: "award.pdf",
            mimeType: "application/pdf",
            entityType: "grant",
            entityId: "grant-1",
          }),
        },
      },
      select,
    };

    await expect(
      downloadDocument(
        db as never,
        { R2: { put: vi.fn(), get } },
        { orgId: "org-1", selectedEntityId: "entity-active", documentId: "doc-1" },
      ),
    ).rejects.toMatchObject({ status: 404 });

    expect(get).not.toHaveBeenCalled();
  });

  it("fails closed for an unknown persisted document entity type before storage", async () => {
    const get = vi.fn();
    const db = {
      query: {
        documents: {
          findFirst: vi.fn().mockResolvedValue({
            id: "doc-1",
            fileKey: "unknown",
            filename: "unknown.pdf",
            mimeType: "application/pdf",
            entityType: "legacy_unknown",
            entityId: "parent-1",
          }),
        },
      },
    };

    await expect(
      downloadDocument(
        db as never,
        { R2: { put: vi.fn(), get } },
        { orgId: "org-1", selectedEntityId: "entity-active", documentId: "doc-1" },
      ),
    ).rejects.toMatchObject({ status: 404 });

    expect(get).not.toHaveBeenCalled();
  });

  it("denies sibling-parent downloads after row lookup but before storage", async () => {
    const get = vi.fn();
    const documentFindFirst = vi.fn().mockResolvedValue({
      id: "doc-1",
      fileKey: "sibling",
      filename: "sibling.pdf",
      mimeType: "application/pdf",
      entityType: "grant",
      entityId: "grant-sibling",
    });
    const { select } = buildEntitySelectDb({ entityTable: grants, found: undefined });
    const db = {
      query: {
        documents: { findFirst: documentFindFirst },
      },
      select,
    };

    await expect(
      downloadDocument(
        db as never,
        { R2: { put: vi.fn(), get } },
        { orgId: "org-1", selectedEntityId: "entity-active", documentId: "doc-1" },
      ),
    ).rejects.toMatchObject({ status: 404 });

    expect(documentFindFirst).toHaveBeenCalledOnce();
    expect(get).not.toHaveBeenCalled();
  });

  it("throws when the R2 binding is missing", async () => {
    await expect(
      downloadDocument({} as never, { INTEGRATION_MODE: "real" } as never, {
        orgId: "org-1",
        selectedEntityId: "entity-active",
        documentId: "doc-1",
      }),
    ).rejects.toThrow("R2 binding is required for real storage mode");
  });

  it("downloads documents from mock storage in default mode", async () => {
    const { select } = buildEntitySelectDb({
      entityTable: contacts,
      found: { id: "contact-1", orgId: "org-1" },
    });
    const db = {
      query: {
        documents: {
          findFirst: vi.fn().mockResolvedValue({
            id: "doc-1",
            fileKey: "org-1/contact/contact-1/doc-1-appeal.pdf",
            filename: "appeal.pdf",
            mimeType: "application/pdf",
            entityType: "contact",
            entityId: "contact-1",
          }),
        },
      },
      select,
    };
    await getIntegrations(db as never, { APP_URL: "http://localhost:5173" } as never).storage.put({
      key: "org-1/contact/contact-1/doc-1-appeal.pdf",
      body: new Uint8Array(Buffer.from("pdf-bytes")),
      contentType: "application/pdf",
      fileName: "appeal.pdf",
      source: { entityType: "contact", entityId: "contact-1", orgId: "org-1" },
    });

    const response = await downloadDocument(
      db as never,
      { APP_URL: "http://localhost:5173" } as never,
      { orgId: "org-1", selectedEntityId: "entity-active", documentId: "doc-1" },
    );

    expect(await response.text()).toBe("pdf-bytes");
  });

  it("returns not found when the document row is missing or deleted", async () => {
    const db = {
      query: {
        documents: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
    };

    await expect(
      downloadDocument(
        db as never,
        { R2: { put: vi.fn(), get: vi.fn() } },
        { orgId: "org-1", selectedEntityId: "entity-active", documentId: "doc-1" },
      ),
    ).rejects.toMatchObject({
      status: 404,
      message: "Document not found",
    });
  });

  it("throws when the backing file is missing", async () => {
    const { select } = buildEntitySelectDb({
      entityTable: contacts,
      found: { id: "contact-1", orgId: "org-1" },
    });
    const db = {
      query: {
        documents: {
          findFirst: vi.fn().mockResolvedValue({
            id: "doc-1",
            fileKey: "missing",
            filename: "appeal.pdf",
            mimeType: "application/pdf",
            entityType: "contact",
            entityId: "contact-1",
          }),
        },
      },
      select,
    };

    await expect(
      downloadDocument(
        db as never,
        { R2: { put: vi.fn(), get: vi.fn().mockResolvedValue(null) } },
        { orgId: "org-1", selectedEntityId: "entity-active", documentId: "doc-1" },
      ),
    ).rejects.toThrow("Document file not found");
  });

  it.each([
    { sizeBytes: 50 * 1024, expectedBucket: "10kb_100kb" },
    { sizeBytes: 500 * 1024, expectedBucket: "100kb_1mb" },
    { sizeBytes: 5 * 1024 * 1024, expectedBucket: "1mb_10mb" },
    { sizeBytes: 15 * 1024 * 1024, expectedBucket: "over_10mb" },
    { sizeBytes: null, expectedBucket: "unknown" },
  ])(
    "X-GrantPipe-Document-Size-Bucket is $expectedBucket for sizeBytes=$sizeBytes",
    async ({ sizeBytes, expectedBucket }) => {
      const { select } = buildEntitySelectDb({
        entityTable: contacts,
        found: { id: "contact-1", orgId: "org-1" },
      });
      const db = {
        query: {
          documents: {
            findFirst: vi.fn().mockResolvedValue({
              id: "doc-1",
              fileKey: "org-1/contact/contact-1/doc-1-report.pdf",
              filename: "report.pdf",
              mimeType: "application/pdf",
              entityType: "contact",
              entityId: "contact-1",
              sizeBytes,
            }),
          },
        },
        select,
      };

      const response = await downloadDocument(
        db as never,
        { R2: { put: vi.fn(), get: vi.fn().mockResolvedValue({ body: "bytes" }) } },
        { orgId: "org-1", selectedEntityId: "entity-active", documentId: "doc-1" },
      );

      expect(response.headers.get("X-GrantPipe-Document-Size-Bucket")).toBe(expectedBucket);
    },
  );
});

describe("softDeleteDocument", () => {
  beforeEach(() => {
    vi.mocked(recordActivityLog).mockClear();
  });

  it("soft deletes the document row without touching the R2 object", async () => {
    const returning = vi.fn().mockResolvedValue([
      {
        id: "doc-1",
        fileKey: "org-1/contact/contact-1/doc-1-appeal.pdf",
        entityType: "contact",
        entityId: "contact-1",
        filename: "appeal.pdf",
      },
    ]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    const db = withTransaction({
      update: vi.fn().mockReturnValue({ set }),
      insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
    });

    const result = await softDeleteDocument(
      db as never,
      { R2: { put: vi.fn(), get: vi.fn(), delete: deleteObject } },
      {
        orgId: "org-1",
        selectedEntityId: "entity-active",
        documentId: "doc-1",
        actorId: "user-1",
      },
    );

    expect(result.id).toBe("doc-1");
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("writes a document_removed activity_log entry on the PARENT entity when soft-deleting", async () => {
    const returning = vi.fn().mockResolvedValue([
      {
        id: "doc-1",
        fileKey: "org-1/contact/contact-1/doc-1-appeal.pdf",
        entityType: "contact",
        entityId: "contact-1",
        filename: "appeal.pdf",
        sizeBytes: 512,
      },
    ]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const db = withTransaction({
      update: vi.fn().mockReturnValue({ set }),
      insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
    });

    await softDeleteDocument(
      db as never,
      { R2: { put: vi.fn(), get: vi.fn() } },
      {
        orgId: "org-1",
        selectedEntityId: "entity-active",
        documentId: "doc-1",
        actorId: "user-1",
      },
    );

    // Must log against the parent entity (contact-1), not the document row.
    // Auditors viewing the contact's feed must see document churn.
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        activeEntityId: "entity-active",
        actorId: "user-1",
        action: "document_removed",
        entityType: "contact",
        entityId: "contact-1",
        changes: expect.objectContaining({
          documentId: "doc-1",
          filename: "appeal.pdf",
        }),
      }),
    );
  });

  it("soft deletes via the database without calling the storage provider in mock mode", async () => {
    const returning = vi.fn().mockResolvedValue([
      {
        id: "doc-1",
        fileKey: "org-1/contact/contact-1/doc-1-appeal.pdf",
        entityType: "contact",
        entityId: "contact-1",
        filename: "appeal.pdf",
      },
    ]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const deleteSpy = vi.fn();
    const db = withTransaction({
      update: vi.fn().mockReturnValue({ set }),
      delete: deleteSpy,
      insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
    });

    const result = await softDeleteDocument(
      db as never,
      { APP_URL: "http://localhost:5173" } as never,
      {
        orgId: "org-1",
        selectedEntityId: "entity-active",
        documentId: "doc-1",
        actorId: "user-1",
      },
    );

    expect(result.id).toBe("doc-1");
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("throws when the document cannot be found", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const db = withTransaction({
      update: vi.fn().mockReturnValue({ set }),
    });

    await expect(
      softDeleteDocument(
        db as never,
        { R2: { put: vi.fn(), get: vi.fn() } },
        {
          orgId: "org-1",
          selectedEntityId: "entity-active",
          documentId: "doc-1",
          actorId: "user-1",
        },
      ),
    ).rejects.toThrow("Document not found");
  });

  it("only soft deletes active document rows", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const db = withTransaction({
      update: vi.fn().mockReturnValue({ set }),
    });

    await expect(
      softDeleteDocument(
        db as never,
        { R2: { put: vi.fn(), get: vi.fn() } },
        {
          orgId: "org-1",
          selectedEntityId: "entity-active",
          documentId: "doc-1",
          actorId: "user-1",
        },
      ),
    ).rejects.toThrow("Document not found");

    const renderedWhere = renderSql(where.mock.calls[0]?.[0]).sql.toLowerCase();
    expect(renderedWhere).toContain('"documents"."deleted_at" is null');
    expect(recordActivityLog).not.toHaveBeenCalled();
  });

  it("denies sibling-parent deletion before update or activity logging", async () => {
    const update = vi.fn();
    const { select } = buildEntitySelectDb({ entityTable: grants, found: undefined });
    const db = withTransaction({
      query: {
        documents: {
          findFirst: vi.fn().mockResolvedValue({
            id: "doc-1",
            entityType: "grant",
            entityId: "grant-sibling",
          }),
        },
      },
      select,
      update,
    });

    await expect(
      softDeleteDocument(
        db as never,
        {},
        {
          orgId: "org-1",
          selectedEntityId: "entity-active",
          documentId: "doc-1",
          actorId: "user-1",
        },
      ),
    ).rejects.toMatchObject({ status: 404 });

    expect(update).not.toHaveBeenCalled();
    expect(recordActivityLog).not.toHaveBeenCalled();
  });

  it("fails closed for unknown persisted types before mutation", async () => {
    const update = vi.fn();
    const db = withTransaction({
      query: {
        documents: {
          findFirst: vi.fn().mockResolvedValue({
            id: "doc-1",
            entityType: "legacy_unknown",
            entityId: "parent-1",
          }),
        },
      },
      update,
    });

    await expect(
      softDeleteDocument(
        db as never,
        {},
        {
          orgId: "org-1",
          selectedEntityId: "entity-active",
          documentId: "doc-1",
          actorId: "user-1",
        },
      ),
    ).rejects.toMatchObject({ status: 404 });

    expect(update).not.toHaveBeenCalled();
    expect(recordActivityLog).not.toHaveBeenCalled();
  });
});

describe("createDocument — activity log", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(recordActivityLog).mockClear();
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "22222222-2222-2222-2222-222222222222",
    );
  });

  it("writes a created activity_log entry after successful upload", async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const returning = vi.fn().mockResolvedValue([
      {
        id: "22222222-2222-2222-2222-222222222222",
        entityType: "grant",
        entityId: "grant-1",
        filename: "report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
      },
    ]);
    const values = vi.fn().mockReturnValue({ returning });
    const insert = vi.fn().mockReturnValue({ values });
    const { select } = buildEntitySelectDb({
      entityTable: grants,
      found: { id: "grant-1", orgId: "org-1" },
    });
    const db = withTransaction({ query: {}, select, insert });

    await createDocument(
      db as never,
      { R2: { put, get: vi.fn() } },
      {
        orgId: "org-1",
        selectedEntityId: "entity-active",
        userId: "user-1",
        entityType: "grant",
        entityId: "grant-1",
        filename: "report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
        body: new Uint8Array([1, 2]),
      },
    );

    // Must log against the parent entity (grant-1), not the document row.
    // Auditors viewing the grant's feed must see "document attached" events.
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        activeEntityId: "entity-active",
        actorId: "user-1",
        action: "document_added",
        entityType: "grant",
        entityId: "grant-1",
        changes: expect.objectContaining({
          documentId: "22222222-2222-2222-2222-222222222222",
          filename: "report.pdf",
          sizeBytes: 1024,
        }),
      }),
    );
  });
});

describe("createDocument — atomicity", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(recordActivityLog).mockClear();
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "33333333-3333-3333-3333-333333333333",
    );
  });

  it("runs insert + log in one transaction (happy path)", async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const returning = vi.fn().mockResolvedValue([
      {
        id: "33333333-3333-3333-3333-333333333333",
        entityType: "grant",
        entityId: "grant-1",
        filename: "report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
      },
    ]);
    const values = vi.fn().mockReturnValue({ returning });
    const db = withTransaction({
      query: {},
      select: buildEntitySelectDb({
        entityTable: grants,
        found: { id: "grant-1", orgId: "org-1" },
      }).select,
      insert: vi.fn().mockReturnValue({ values }),
    });

    await createDocument(
      db as never,
      { R2: { put, get: vi.fn() } },
      {
        orgId: "org-1",
        selectedEntityId: "entity-active",
        userId: "user-1",
        entityType: "grant",
        entityId: "grant-1",
        filename: "report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
        body: new Uint8Array([1]),
      },
    );

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "grant", action: "document_added" }),
    );
  });

  it("cleans up R2 when audit log fails (rollback)", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const put = vi.fn().mockResolvedValue(undefined);
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    const returning = vi.fn().mockResolvedValue([
      {
        id: "33333333-3333-3333-3333-333333333333",
        entityType: "grant",
        entityId: "grant-1",
        filename: "report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
      },
    ]);
    const values = vi.fn().mockReturnValue({ returning });
    const db = withTransaction({
      query: {},
      select: buildEntitySelectDb({
        entityTable: grants,
        found: { id: "grant-1", orgId: "org-1" },
      }).select,
      insert: vi.fn().mockReturnValue({ values }),
    });

    await expect(
      createDocument(
        db as never,
        { R2: { put, get: vi.fn(), delete: deleteObject } },
        {
          orgId: "org-1",
          selectedEntityId: "entity-active",
          userId: "user-1",
          entityType: "grant",
          entityId: "grant-1",
          filename: "report.pdf",
          mimeType: "application/pdf",
          sizeBytes: 100,
          body: new Uint8Array([1]),
        },
      ),
    ).rejects.toThrow("audit log down");

    expect(deleteObject).toHaveBeenCalled();
  });
});

describe("softDeleteDocument — atomicity", () => {
  beforeEach(() => {
    vi.mocked(recordActivityLog).mockClear();
  });

  it("runs update + log in one transaction (happy path)", async () => {
    const returning = vi.fn().mockResolvedValue([
      {
        id: "doc-1",
        entityType: "grant",
        entityId: "grant-1",
        filename: "report.pdf",
        sizeBytes: 100,
      },
    ]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const db = withTransaction({
      update: vi.fn().mockReturnValue({ set }),
      insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
    });

    await softDeleteDocument(
      db as never,
      {},
      {
        orgId: "org-1",
        selectedEntityId: "entity-active",
        documentId: "doc-1",
        actorId: "user-1",
      },
    );

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "grant", action: "document_removed" }),
    );
  });

  it("rolls back when audit log fails", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const returning = vi.fn().mockResolvedValue([
      {
        id: "doc-1",
        entityType: "grant",
        entityId: "grant-1",
        filename: "report.pdf",
        sizeBytes: 100,
      },
    ]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const db = withTransaction({
      update: vi.fn().mockReturnValue({ set }),
      insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
    });

    await expect(
      softDeleteDocument(
        db as never,
        {},
        {
          orgId: "org-1",
          selectedEntityId: "entity-active",
          documentId: "doc-1",
          actorId: "user-1",
        },
      ),
    ).rejects.toThrow("audit log down");
  });
});

// ---------------------------------------------------------------------------
// Regression guard — relational query API + cross-table sql fragments
//
// entityExists()'s ownershipScope (documentParentEntityScope) embeds raw
// `sql` fragments referencing funds/grants/organizations/subawards/
// subrecipientFindings columns. The Drizzle relational query API
// (`db.query.<table>.findFirst`) re-qualifies every bare Column reference in
// its `where` with the base table's own alias, which corrupts those
// cross-table fragments and 500s in Postgres. The core query builder
// (`db.select().from().where()`) does not re-qualify columns, so these
// entityType branches must use it instead of `db.query.*`.
// ---------------------------------------------------------------------------

describe("documents service source contract — no relational API for cross-table scope branches", () => {
  // Every entityExists() switch branch passes ownershipScope
  // (documentParentEntityScope's CASE, which interpolates Columns from
  // contacts/donations/funds/grants/organizations/subawards/etc.) and/or
  // defaultEntityScope (raw EXISTS over organizations Columns) into its
  // `where`, so ALL of them must use the core query builder.
  it.each([
    "db.query.contacts.findFirst",
    "db.query.donations.findFirst",
    "db.query.events.findFirst",
    "db.query.grants.findFirst",
    "db.query.funders.findFirst",
    "db.query.funds.findFirst",
    "db.query.generatedReports.findFirst",
    "db.query.organizations.findFirst",
    "db.query.grantPaymentRequests.findFirst",
    "db.query.subrecipients.findFirst",
    "db.query.subawards.findFirst",
    "db.query.subrecipientMonitoringTasks.findFirst",
    "db.query.subrecipientFindings.findFirst",
    "db.query.subrecipientCorrectiveActions.findFirst",
  ])("does not call %s inside entityExists (cross-table scope re-qualification hazard)", (call) => {
    expect(documentsServiceSource).not.toContain(call);
  });

  // Relational-API calls that legitimately REMAIN in this file — each was
  // checked and its `where` contains ONLY same-table predicates (eq/isNull on
  // the documents table's own Columns, no raw sql`` fragments), so the
  // relational compiler's re-qualification cannot corrupt anything:
  //   • downloadDocument's db.query.documents.findFirst
  //   • softDeleteDocument's tx.query.documents.findFirst
  // If either ever gains a scope helper or sql`` fragment in its where,
  // convert it to the core builder and move it into the banned list above.
  it("keeps only the documented same-table relational lookups", () => {
    const relationalCalls = documentsServiceSource.match(/(?:db|tx)\.query\.\w+\.find\w+/g) ?? [];
    expect(relationalCalls.sort()).toEqual(
      ["db.query.documents.findFirst", "tx.query.documents.findFirst"].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// Hazard demonstration — WHY the relational query API is banned above.
//
// Compiles the exact old pattern (db.query.contacts.findFirst with
// documentParentEntityScope + a defaultEntityScope EXISTS fragment) through a
// real drizzle relational query builder (drizzle.mock — no connection) and
// shows the relational compiler re-qualifying the organizations Columns
// inside the raw sql`` fragment with the BASE table's name:
//   organizations.defaultEntityId  →  "contacts"."default_entity_id"  (column
//     does not exist → runtime failure), and
//   organizations.id               →  "contacts"."id"  (column EXISTS →
//     silently wrong scoping, even more dangerous than the 500).
// The core query builder (db.select().from().where()) compiles the same
// fragment with correct qualification, which the whereSpy-based tests above
// assert per branch.
// ---------------------------------------------------------------------------

describe("relational-API re-qualification hazard demonstration", () => {
  it("re-qualifies cross-table Columns in sql`` fragments with the base table's name", () => {
    const hazardDb = drizzleMock({ schema: { contacts, organizations } });
    const defaultEntityScope = sql`EXISTS (
      SELECT 1 FROM ${organizations}
      WHERE ${organizations.id} = ${"org-1"}
        AND ${organizations.defaultEntityId} = ${"entity-active"}
        AND ${organizations.deletedAt} IS NULL
    )`;

    const compiled = hazardDb.query.contacts
      .findFirst({
        where: and(
          eq(contacts.id, "contact-1"),
          eq(contacts.orgId, "org-1"),
          documentParentEntityScope({
            orgId: "org-1",
            selectedEntityId: "entity-active",
            entityType: "contact",
            entityId: "contact-1",
          }),
          defaultEntityScope,
          isNull(contacts.deletedAt),
        ),
        columns: { id: true, orgId: true },
      })
      .toSQL();

    // The organizations Columns inside the EXISTS fragment are re-qualified
    // to the base table — proving the old pattern was broken.
    expect(compiled.sql).toContain('"contacts"."default_entity_id"');
    expect(compiled.sql).not.toContain('"organizations"."default_entity_id"');

    // Contrast: the same where expression compiled standalone (as the core
    // query builder compiles it) keeps the correct qualification.
    const standalone = renderSql(
      and(
        eq(contacts.id, "contact-1"),
        eq(contacts.orgId, "org-1"),
        defaultEntityScope,
        isNull(contacts.deletedAt),
      ),
    );
    expect(standalone.sql).toContain('"organizations"."default_entity_id"');
    expect(standalone.sql).not.toContain('"contacts"."default_entity_id"');
  });
});
