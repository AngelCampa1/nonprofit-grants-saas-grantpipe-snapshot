import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { documents, donations, journalLines } from "@grantpipe/db";
import { AppError } from "../../lib/app-error";
import {
  createRestrictionAddition,
  createRestrictionRelease,
  createRestrictionTerm,
  deleteRestrictionTerm,
  generateRestrictedRollforward,
  linkRestrictionEvidence,
  listRestrictionAlerts,
  listRestrictionTerms,
  recoverPendingRestrictedRollforwards,
  updateRestrictionTerm,
} from "./service";

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn(async () => undefined),
}));

const { analyticsCapture } = vi.hoisted(() => ({ analyticsCapture: vi.fn() }));
vi.mock("../../lib/integrations", () => ({
  getIntegrations: vi.fn(() => ({ analytics: { capture: analyticsCapture } })),
}));

vi.mock("@grantpipe/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@grantpipe/shared")>();
  return { ...actual };
});

import { recordActivityLog } from "../../lib/activity-log";
import * as shared from "@grantpipe/shared";

function makeInsertSpy() {
  return vi.fn(() => ({
    values: vi.fn(() => ({
      returning: vi.fn(async () => []),
    })),
  }));
}

function makeSelectResult(result: unknown) {
  const finalize = () =>
    Object.assign(Promise.resolve(result), {
      orderBy: vi.fn(() =>
        Object.assign(Promise.resolve(result), {
          limit: vi.fn(() => ({
            offset: vi.fn(async () => result),
          })),
        }),
      ),
    });
  const builder: Record<string, unknown> = {};
  builder.from = vi.fn(() => builder);
  builder.innerJoin = vi.fn(() => builder);
  builder.leftJoin = vi.fn(() => builder);
  builder.where = vi.fn(() => finalize());
  return builder;
}

function makeMutationResult(result: unknown) {
  return {
    values: vi.fn(() => ({
      returning: vi.fn(async () => result),
    })),
    set: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(async () => result),
      })),
    })),
  };
}

function rollforwardMetadata(overrides: Record<string, unknown> = {}) {
  return {
    periodStart: "2026-01-01T00:00:00.000Z",
    periodEnd: "2026-03-31T00:00:00.000Z",
    includeEvidencePackage: false,
    fundId: null,
    grantId: null,
    title: "Restricted rollforward",
    rows: [],
    ...overrides,
  };
}

function rollforwardReport(overrides: Record<string, unknown> = {}) {
  return {
    id: "report-1",
    orgId: "org-1",
    entityId: "entity-1",
    type: "restricted_rollforward",
    attemptId: "00000000-0000-4000-8000-000000000099",
    recoveryAttemptedAt: null,
    status: "pending",
    format: "csv_bundle",
    title: "Restricted rollforward",
    fileKey: "org-1/reports/restricted-rollforward/report-1/restricted-rollforward.csv",
    fileName: "restricted-rollforward.csv",
    fileSizeBytes: null,
    metadata: rollforwardMetadata(),
    generatedBy: "user-1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    fundId: null,
    grantId: null,
    donationId: null,
    fiscalYear: null,
    ...overrides,
  };
}

function makeDb({
  term,
  release,
  selectResults = [],
  insertResults = [],
  updateResults = [],
  linkedRecord = { id: "linked-1" },
}: {
  term?: Record<string, unknown> | null;
  release?: Record<string, unknown> | null;
  selectResults?: unknown[];
  insertResults?: unknown[];
  updateResults?: unknown[];
  linkedRecord?: Record<string, unknown> | null;
} = {}) {
  // Named spies for the call sites converted from the relational query API to
  // the core query builder (getActiveTerm, the donation/document/journal-line
  // link checks in assertLinkedRecordsInOrg, and the release lookup in
  // linkRestrictionEvidence — see the source-contract regression guard below).
  // Exposed on the returned db object (mirroring anomaly.service.test.ts's
  // makeDb) so tests can assert on the compiled `where` the same way the old
  // db.query.* mocks allowed.
  const activeTermWhereSpy = vi.fn();
  const donationLinkWhereSpy = vi.fn();
  const documentLinkWhereSpy = vi.fn();
  const journalLineLinkWhereSpy = vi.fn();
  const releaseWhereSpy = vi.fn();

  const db: Record<string, unknown> = {
    query: {
      restrictionTerms: { findFirst: vi.fn(async () => term ?? null) },
      restrictionReleases: { findFirst: vi.fn(async () => release ?? null) },
      funds: { findFirst: vi.fn(async () => linkedRecord) },
      grants: { findFirst: vi.fn(async () => linkedRecord) },
      donations: { findFirst: vi.fn(async () => linkedRecord) },
      documents: { findFirst: vi.fn(async () => linkedRecord) },
      expenses: { findFirst: vi.fn(async () => linkedRecord) },
      journalLines: { findFirst: vi.fn(async () => linkedRecord) },
      generatedReports: { findFirst: vi.fn(async () => linkedRecord) },
      chartOfAccounts: { findFirst: vi.fn(async () => linkedRecord) },
    },
    // db.select dispatch. Three call sites were converted from the relational
    // query API to the core query builder (getActiveTerm, the donation-link
    // check, and the document-link check in assertLinkedRecordsInOrg — see
    // the source-contract regression guard below). Those are identified by
    // their distinctive `fields` shape and routed to dedicated fixtures below;
    // every other select() call falls through to the pre-existing generic
    // `selectResults` FIFO queue used throughout this file.
    select: vi.fn((fields?: Record<string, unknown>) => {
      // getActiveTerm: db.select(getTableColumns(restrictionTerms))... — the
      // full restrictionTerms column set. "evidenceRequirement" only appears
      // as a select() key here (partial detector selects elsewhere in this
      // file never include it), so it uniquely identifies this call even
      // though other partial selects here also happen to include
      // "beginningBalanceCents".
      if (fields && "evidenceRequirement" in fields) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn((whereArg: unknown) => {
              activeTermWhereSpy(whereArg);
              return { limit: vi.fn().mockResolvedValue(term ? [term] : []) };
            }),
          }),
        };
      }
      // linkRestrictionEvidence's release lookup:
      // tx.select(getTableColumns(restrictionReleases))... — the full
      // restrictionReleases column set. "journalLineId" only appears as a
      // select() key on this call in this service.
      if (fields && "journalLineId" in fields) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn((whereArg: unknown) => {
              releaseWhereSpy(whereArg);
              return { limit: vi.fn().mockResolvedValue(release ? [release] : []) };
            }),
          }),
        };
      }
      // The donation/document/journal-line link checks: db.select({ id: X.id })
      // — a single-key `{ id }` selection, disambiguated by which table is
      // passed to `.from()`.
      if (fields && Object.keys(fields).length === 1 && "id" in fields) {
        return {
          from: vi.fn((table: unknown) => {
            if (table === donations) {
              return {
                where: vi.fn((whereArg: unknown) => {
                  donationLinkWhereSpy(whereArg);
                  return { limit: vi.fn().mockResolvedValue(linkedRecord ? [linkedRecord] : []) };
                }),
              };
            }
            if (table === documents) {
              return {
                where: vi.fn((whereArg: unknown) => {
                  documentLinkWhereSpy(whereArg);
                  return { limit: vi.fn().mockResolvedValue(linkedRecord ? [linkedRecord] : []) };
                }),
              };
            }
            if (table === journalLines) {
              return {
                where: vi.fn((whereArg: unknown) => {
                  journalLineLinkWhereSpy(whereArg);
                  return { limit: vi.fn().mockResolvedValue(linkedRecord ? [linkedRecord] : []) };
                }),
              };
            }
            return (
              makeSelectResult(selectResults.shift() ?? []) as { from: (t: unknown) => unknown }
            ).from(table);
          }),
        };
      }
      return makeSelectResult(selectResults.shift() ?? []);
    }),
    insert: vi.fn(() => makeMutationResult(insertResults.shift() ?? [])),
    update: vi.fn(() => makeMutationResult(updateResults.shift() ?? [])),
    execute: vi.fn(async () => undefined),
  };
  db.transaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback(db));
  return Object.assign(db, {
    _activeTermWhereSpy: activeTermWhereSpy,
    _donationLinkWhereSpy: donationLinkWhereSpy,
    _documentLinkWhereSpy: documentLinkWhereSpy,
    _journalLineLinkWhereSpy: journalLineLinkWhereSpy,
    _releaseWhereSpy: releaseWhereSpy,
  }) as never;
}

function objectValues(value: object): unknown[] {
  return Object.values(value);
}

function hasObjectProperty(
  value: unknown,
  key: string,
  expected: unknown,
  seen = new WeakSet<object>(),
): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  if (seen.has(value)) {
    return false;
  }

  seen.add(value);
  if (Object.prototype.hasOwnProperty.call(value, key)) {
    if ((value as Record<string, unknown>)[key] === expected) return true;
  }

  return objectValues(value).some((entry) => hasObjectProperty(entry, key, expected, seen));
}

function hasGeneratedReportReadyStatusPredicate(
  value: unknown,
  seen = new WeakSet<object>(),
): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  if (seen.has(value)) {
    return false;
  }

  seen.add(value);
  const queryChunks =
    "queryChunks" in value ? (value as { queryChunks: unknown }).queryChunks : undefined;
  if (Array.isArray(queryChunks)) {
    const hasStatusColumn = queryChunks.some((entry) => hasObjectProperty(entry, "name", "status"));
    const hasReadyParam = queryChunks.some((entry) => hasObjectProperty(entry, "value", "ready"));
    if (hasStatusColumn && hasReadyParam) {
      return true;
    }
  }

  return objectValues(value).some((entry) => hasGeneratedReportReadyStatusPredicate(entry, seen));
}

type GeneratedReportFindFirstMock = {
  mockImplementation: (
    implementation: (call: { where: unknown }) => Promise<{ id: string } | null>,
  ) => unknown;
};

function generatedReportFindFirstMock(db: unknown): GeneratedReportFindFirstMock {
  return (
    db as {
      query: {
        generatedReports: {
          findFirst: GeneratedReportFindFirstMock;
        };
      };
    }
  ).query.generatedReports.findFirst;
}

const activeTerm = {
  id: "term-1",
  orgId: "org-1",
  fundId: "fund-1",
  grantId: null,
  donationId: null,
  sourceDocumentId: null,
  restrictionType: "purpose",
  source: "donor",
  title: "Scholarship",
  purposeStatement: "Scholarships only",
  releaseRule: "Program expenses",
  startDate: new Date("2026-01-01T00:00:00.000Z"),
  endDate: new Date("2026-12-31T00:00:00.000Z"),
  beginningBalanceCents: 1000,
  currency: "USD",
  evidenceRequirement: "Invoice",
};

beforeEach(() => {
  vi.mocked(recordActivityLog).mockClear();
  analyticsCapture.mockReset();
});

describe("restriction lifecycle service", () => {
  it("rejects linked term records that do not belong to the current org before insert", async () => {
    const insert = makeInsertSpy();
    const db = {
      query: {
        funds: { findFirst: vi.fn(async () => null) },
      },
      insert,
    } as never;

    await expect(
      createRestrictionTerm(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        data: {
          fundId: "fund-from-other-org",
          restrictionType: "purpose",
          source: "donor",
          title: "Scholarship",
          purposeStatement: "Scholarships only",
          beginningBalanceCents: 0,
        },
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Linked restriction record does not belong to this organization",
    } satisfies Partial<AppError>);
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects linked update records that do not belong to the current org before update", async () => {
    const update = vi.fn();
    const db = {
      query: {
        grants: { findFirst: vi.fn(async () => null) },
      },
      // getActiveTerm is converted to the core query builder — see the
      // source-contract regression guard below.
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: "term-1", title: "Old" }]),
          }),
        }),
      }),
      update,
    } as never;

    await expect(
      updateRestrictionTerm(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        termId: "term-1",
        data: { grantId: "grant-from-other-org" },
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Linked restriction record does not belong to this organization",
    } satisfies Partial<AppError>);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects allowed category accounts that do not belong to the current org", async () => {
    const insert = makeInsertSpy();
    const db = {
      query: {
        funds: { findFirst: vi.fn(async () => ({ id: "fund-1" })) },
        chartOfAccounts: { findFirst: vi.fn(async () => null) },
      },
      insert,
    } as never;

    await expect(
      createRestrictionTerm(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        data: {
          fundId: "fund-1",
          restrictionType: "purpose",
          source: "donor",
          title: "Scholarship",
          purposeStatement: "Scholarships only",
          beginningBalanceCents: 0,
          allowedCategories: [{ category: "Tuition", accountId: "account-from-other-org" }],
        },
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Linked restriction record does not belong to this organization",
    } satisfies Partial<AppError>);
    expect(insert).not.toHaveBeenCalled();
  });

  it.each([
    ["foreign-org fund", "fundId", "fund-from-other-org"],
    ["nonexistent fund", "fundId", "fund-that-does-not-exist"],
    ["foreign-org grant", "grantId", "grant-from-other-org"],
    ["nonexistent grant", "grantId", "grant-that-does-not-exist"],
  ] as const)(
    "rejects a %s before creating a new rollforward attempt",
    async (_label, linkKey, linkId) => {
      analyticsCapture.mockClear();
      const findLinkedRecord = vi.fn(async () => null);
      const findExistingReport = vi.fn(async () => null);
      const select = vi.fn();
      const insert = vi.fn();
      const put = vi.fn();
      const db = {
        query: {
          funds: { findFirst: linkKey === "fundId" ? findLinkedRecord : vi.fn() },
          grants: { findFirst: linkKey === "grantId" ? findLinkedRecord : vi.fn() },
          generatedReports: { findFirst: findExistingReport },
        },
        select,
        insert,
      } as never;

      await expect(
        generateRestrictedRollforward(db, {
          orgId: "org-1",
          entityId: "entity-1",
          actorId: "user-1",
          planTier: "growth",
          env: { R2: { put } },
          data: {
            [linkKey]: linkId,
            attemptId: "00000000-0000-4000-8000-000000000099",
            periodStart: "2026-01-01T00:00:00.000Z",
            periodEnd: "2026-03-31T00:00:00.000Z",
          },
        }),
      ).rejects.toMatchObject({
        status: 400,
        message: "Linked restriction record does not belong to this organization",
      } satisfies Partial<AppError>);

      expect(findLinkedRecord).toHaveBeenCalledOnce();
      expect(findExistingReport).not.toHaveBeenCalled();
      expect(select).not.toHaveBeenCalled();
      expect(insert).not.toHaveBeenCalled();
      expect(put).not.toHaveBeenCalled();
      expect(analyticsCapture).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["fundId", "fund-sibling", "funds"],
    ["grantId", "grant-sibling", "grants"],
  ] as const)(
    "rejects a sibling-entity %s without probing an existing export attempt",
    async (linkKey, linkId, queryKey) => {
      const findLinkedRecord = vi.fn(async () => ({ id: linkId, entityId: "entity-sibling" }));
      const findExistingReport = vi.fn(async () => null);
      const db = {
        query: {
          [queryKey]: { findFirst: findLinkedRecord },
          generatedReports: { findFirst: findExistingReport },
        },
        select: vi.fn(),
        insert: vi.fn(),
      } as never;

      await expect(
        generateRestrictedRollforward(db, {
          orgId: "org-1",
          entityId: "entity-active",
          actorId: "user-1",
          planTier: "growth",
          data: {
            [linkKey]: linkId,
            attemptId: "00000000-0000-4000-8000-000000000099",
            periodStart: "2026-01-01T00:00:00.000Z",
            periodEnd: "2026-03-31T00:00:00.000Z",
          },
        }),
      ).rejects.toMatchObject({
        status: 400,
        message: "Linked restriction record does not belong to this organization",
      } satisfies Partial<AppError>);

      expect(findLinkedRecord).toHaveBeenCalledOnce();
      expect(findExistingReport).not.toHaveBeenCalled();
      expect((db as { select: ReturnType<typeof vi.fn> }).select).not.toHaveBeenCalled();
      expect((db as { insert: ReturnType<typeof vi.fn> }).insert).not.toHaveBeenCalled();
    },
  );

  it("adds the active entity boundary to unfiltered rollforward term selection", async () => {
    const reportValues = vi.fn(() => ({
      returning: vi.fn(async () => [{ id: "report-1", status: "pending" }]),
    }));
    const select = vi.fn().mockReturnValueOnce({
      from: () => ({
        where: (where: unknown) => ({
          orderBy: async () => {
            const rendered = new PgDialect().sqlToQuery(
              where as Parameters<PgDialect["sqlToQuery"]>[0],
            );
            expect(rendered.params).toContain("entity-active");
            expect(rendered.sql).toContain('"funds"."entity_id"');
            expect(rendered.sql).toContain('"grants"."entity_id"');
            return [];
          },
        }),
      }),
    });
    const db = {
      query: { generatedReports: { findFirst: vi.fn(async () => null) } },
      select,
      insert: vi.fn(() => ({ values: reportValues })),
    } as never;

    await generateRestrictedRollforward(db, {
      orgId: "org-1",
      entityId: "entity-active",
      actorId: "user-1",
      planTier: "growth",
      data: {
        attemptId: "00000000-0000-4000-8000-000000000099",
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-03-31T00:00:00.000Z",
      },
    });

    expect(reportValues).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: "entity-active" }),
    );
  });

  it("adds the active entity boundary when listing restriction terms", async () => {
    let renderedWhere: ReturnType<PgDialect["sqlToQuery"]> | undefined;
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn((where: Parameters<PgDialect["sqlToQuery"]>[0]) => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => ({
                offset: vi.fn(async () => {
                  renderedWhere = new PgDialect().sqlToQuery(where);
                  return [];
                }),
              })),
            })),
          })),
        })),
      })),
    } as never;

    await listRestrictionTerms(db, {
      orgId: "org-1",
      entityId: "entity-active",
      actorId: "user-1",
      planTier: "growth",
      page: 1,
      pageSize: 25,
    });

    expect(renderedWhere?.params).toContain("entity-active");
    expect(renderedWhere?.sql).toContain('"funds"."entity_id"');
    expect(renderedWhere?.sql).toContain('"grants"."entity_id"');
  });

  it.each(["update", "delete", "addition", "release"] as const)(
    "scopes a sibling-entity term before a %s mutation",
    async (operation) => {
      let renderedWhere: ReturnType<PgDialect["sqlToQuery"]> | undefined;
      // getActiveTerm is converted to the core query builder — see the
      // source-contract regression guard below. Capture the compiled `where`
      // the same way the old db.query.restrictionTerms.findFirst mock did.
      const db = {
        query: {},
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn((whereArg: Parameters<PgDialect["sqlToQuery"]>[0]) => {
              renderedWhere = new PgDialect().sqlToQuery(whereArg);
              return { limit: vi.fn().mockResolvedValue([]) };
            }),
          }),
        }),
        transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(db)),
      } as never;
      const context = {
        orgId: "org-1",
        entityId: "entity-active",
        actorId: "user-1",
        planTier: "growth",
        termId: "term-sibling",
      };

      const request =
        operation === "update"
          ? updateRestrictionTerm(db, { ...context, data: { title: "Updated" } })
          : operation === "delete"
            ? deleteRestrictionTerm(db, context)
            : operation === "addition"
              ? createRestrictionAddition(db, {
                  ...context,
                  data: { amountCents: 100, date: "2026-01-01T00:00:00.000Z" },
                })
              : createRestrictionRelease(db, {
                  ...context,
                  data: {
                    amountCents: 100,
                    date: "2026-01-01T00:00:00.000Z",
                    reason: "Program expense",
                  },
                });

      await expect(request).rejects.toMatchObject({ status: 404 });
      expect(renderedWhere?.params).toContain("entity-active");
      expect(renderedWhere?.sql).toContain('"funds"."entity_id"');
      expect(renderedWhere?.sql).toContain('"grants"."entity_id"');
    },
  );

  it("scopes a newly linked fund to the active entity before creating a term", async () => {
    let renderedWhere: ReturnType<PgDialect["sqlToQuery"]> | undefined;
    const insert = vi.fn();
    const db = {
      query: {
        funds: {
          findFirst: vi.fn(async ({ where }: { where: Parameters<PgDialect["sqlToQuery"]>[0] }) => {
            renderedWhere = new PgDialect().sqlToQuery(where);
            return null;
          }),
        },
      },
      insert,
    } as never;

    await expect(
      createRestrictionTerm(db, {
        orgId: "org-1",
        entityId: "entity-active",
        actorId: "user-1",
        planTier: "growth",
        data: {
          title: "Sibling fund term",
          restrictionType: "purpose",
          purposeStatement: "Use only for the sibling program",
          source: "funder",
          beginningBalanceCents: 0,
          currency: "USD",
          fundId: "fund-sibling",
        },
      }),
    ).rejects.toMatchObject({ status: 400 });

    expect(renderedWhere?.params).toContain("entity-active");
    expect(insert).not.toHaveBeenCalled();
  });

  it("allows an unlinked manual term only in the default entity", async () => {
    const data = {
      title: "Manual reserve",
      restrictionType: "board_designated" as const,
      source: "board" as const,
      sourceDocumentId: "doc-manual",
      beginningBalanceCents: 0,
    };
    const childDb = makeDb();
    (childDb as unknown as { query: Record<string, unknown> }).query.organizations = {
      findFirst: vi.fn(async () => null),
    };

    await expect(
      createRestrictionTerm(childDb, {
        orgId: "org-1",
        entityId: "entity-child",
        actorId: "user-1",
        planTier: "growth",
        data,
      }),
    ).rejects.toMatchObject({ status: 400 });

    const defaultDb = makeDb({ insertResults: [[{ id: "term-default", ...data }]] });
    (defaultDb as unknown as { query: Record<string, unknown> }).query.organizations = {
      findFirst: vi.fn(async () => ({ id: "org-1" })),
    };
    await expect(
      createRestrictionTerm(defaultDb, {
        orgId: "org-1",
        entityId: "entity-default",
        actorId: "user-1",
        planTier: "growth",
        data,
      }),
    ).resolves.toMatchObject({ id: "term-default" });
  });

  it("scopes linked expenses to the active entity before creating a release", async () => {
    let renderedWhere: ReturnType<PgDialect["sqlToQuery"]> | undefined;
    const db = makeDb({ term: activeTerm });
    (db as unknown as { query: Record<string, unknown> }).query.expenses = {
      findFirst: vi.fn(async ({ where }: { where: Parameters<PgDialect["sqlToQuery"]>[0] }) => {
        renderedWhere = new PgDialect().sqlToQuery(where);
        return null;
      }),
    };

    await expect(
      createRestrictionRelease(db, {
        orgId: "org-1",
        entityId: "entity-active",
        actorId: "user-1",
        planTier: "growth",
        termId: "term-1",
        data: {
          expenseId: "expense-sibling",
          amountCents: 100,
          date: "2026-01-01T00:00:00.000Z",
          reason: "Program expense",
        },
      }),
    ).rejects.toMatchObject({ status: 400 });

    expect(renderedWhere?.params).toContain("entity-active");
  });

  it("scopes an evidence release and generated report to the active entity", async () => {
    let reportWhere: ReturnType<PgDialect["sqlToQuery"]> | undefined;
    const db = makeDb({ release: null });
    const query = (db as unknown as { query: Record<string, unknown> }).query;
    query.generatedReports = {
      findFirst: vi.fn(async ({ where }: { where: Parameters<PgDialect["sqlToQuery"]>[0] }) => {
        reportWhere = new PgDialect().sqlToQuery(where);
        return { id: "report-1" };
      }),
    };

    await expect(
      linkRestrictionEvidence(db, {
        orgId: "org-1",
        entityId: "entity-active",
        actorId: "user-1",
        planTier: "growth",
        releaseId: "release-sibling",
        data: { generatedReportId: "report-1", evidenceType: "report", label: "Report" },
      }),
    ).rejects.toMatchObject({ status: 404 });

    const releaseWhere = new PgDialect().sqlToQuery(
      (db as unknown as { _releaseWhereSpy: ReturnType<typeof vi.fn> })._releaseWhereSpy.mock
        .calls[0]?.[0] as Parameters<PgDialect["sqlToQuery"]>[0],
    );
    expect(reportWhere?.params).toContain("entity-active");
    expect(releaseWhere?.params).toContain("entity-active");
    // Correctly qualified cross-table references: the foreign tables appear
    // by name and their columns are NOT re-qualified to restriction_releases.
    expect(releaseWhere?.sql).toContain('"restriction_terms"');
    expect(releaseWhere?.sql).toContain('"restriction_terms"."org_id"');
    expect(releaseWhere?.sql).not.toContain('"restriction_releases"."fund_id"');
  });

  it("keeps unlinked donation documents in the organization default entity", async () => {
    const db = makeDb({ release: { id: "release-1" }, linkedRecord: null });

    await expect(
      linkRestrictionEvidence(db, {
        orgId: "org-1",
        entityId: "entity-sibling",
        actorId: "user-1",
        planTier: "growth",
        releaseId: "release-1",
        data: { documentId: "donation-doc", evidenceType: "invoice", label: "Receipt" },
      }),
    ).rejects.toMatchObject({ status: 400 });

    const documentWhere = new PgDialect().sqlToQuery(
      (db as unknown as { _documentLinkWhereSpy: ReturnType<typeof vi.fn> })._documentLinkWhereSpy
        .mock.calls[0]?.[0] as Parameters<PgDialect["sqlToQuery"]>[0],
    );
    const donationBranch = documentWhere?.sql
      .split("WHEN 'donation'")[1]
      ?.split("WHEN 'generated_report'")[0];
    expect(donationBranch).toContain('"organizations"');
    expect(donationBranch).toContain('"organizations"."default_entity_id"');
    expect(documentWhere?.params).toContain("entity-sibling");
  });

  it("scopes every restriction alert detector to the active entity", async () => {
    const db = makeDb({ selectResults: [[], [], [], [], [], []] });

    await expect(
      listRestrictionAlerts(db, {
        orgId: "org-1",
        entityId: "entity-active",
        actorId: "user-1",
        planTier: "growth",
      }),
    ).resolves.toEqual([]);

    expect((db as unknown as { select: ReturnType<typeof vi.fn> }).select).toHaveBeenCalledTimes(6);
  });

  it("keeps generated rollforward artifacts pending when no file body is written", async () => {
    const reportValues = vi.fn(() => ({
      returning: vi.fn(async () => [{ id: "report-1", status: "pending" }]),
    }));
    const balanceValues = vi.fn(() => ({
      onConflictDoNothing: vi.fn(async () => undefined),
    }));
    const insert = vi.fn().mockReturnValueOnce({ values: reportValues });
    const tx = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({ returning: vi.fn(async () => [{ status: "ready" }]) })),
        })),
      })),
      insert: vi.fn(() => ({ values: balanceValues })),
    };
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              orderBy: async () => [
                {
                  id: "term-1",
                  title: "Scholarship",
                  fundId: "fund-1",
                  grantId: null,
                  beginningBalanceCents: 100,
                },
              ],
            }),
          }),
        })
        .mockReturnValue({
          from: () => ({
            where: async () => [{ total: 0 }],
          }),
        }),
      insert,
      transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
    } as never;

    const result = await generateRestrictedRollforward(db, {
      orgId: "org-1",
      actorId: "user-1",
      planTier: "growth",
      data: {
        attemptId: "00000000-0000-4000-8000-000000000099",
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-03-31T00:00:00.000Z",
      },
    });

    expect(reportValues).toHaveBeenCalledWith(expect.objectContaining({ status: "pending" }));
    expect(result.report).toMatchObject({ status: "pending" });
  });

  it("stores rollforward reports against an explicit active entity", async () => {
    const reportValues = vi.fn(() => ({
      returning: vi.fn(async () => [{ id: "report-1", status: "pending" }]),
    }));
    const insert = vi
      .fn()
      .mockReturnValueOnce({ values: reportValues })
      .mockReturnValueOnce({ values: vi.fn(() => undefined) });
    const db = {
      select: vi.fn().mockReturnValueOnce({
        from: () => ({
          where: () => ({
            orderBy: async () => [],
          }),
        }),
      }),
      insert,
    } as never;

    await generateRestrictedRollforward(db, {
      orgId: "org-1",
      entityId: "entity-explicit",
      actorId: "user-1",
      planTier: "growth",
      data: {
        attemptId: "00000000-0000-4000-8000-000000000099",
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-03-31T00:00:00.000Z",
      },
    });

    expect(reportValues).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: "entity-explicit" }),
    );
  });

  it("derives rollforward report entity from the selected grant or fund", async () => {
    async function runCase(
      data: { grantId?: string; fundId?: string },
      linkedKey: "grants" | "funds",
    ) {
      const reportValues = vi.fn(() => ({
        returning: vi.fn(async () => [{ id: "report-1", status: "pending" }]),
      }));
      const insert = vi
        .fn()
        .mockReturnValueOnce({ values: reportValues })
        .mockReturnValueOnce({ values: vi.fn(() => undefined) });
      const db = {
        query: {
          [linkedKey]: {
            findFirst: vi.fn(async () => ({ id: "linked-1", entityId: "entity-linked" })),
          },
        },
        select: vi.fn().mockReturnValueOnce({
          from: () => ({
            where: () => ({
              orderBy: async () => [],
            }),
          }),
        }),
        insert,
      } as never;

      await generateRestrictedRollforward(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        data: {
          ...data,
          attemptId: "00000000-0000-4000-8000-000000000099",
          periodStart: "2026-01-01T00:00:00.000Z",
          periodEnd: "2026-03-31T00:00:00.000Z",
        },
      });

      expect(reportValues).toHaveBeenCalledWith(
        expect.objectContaining({ entityId: "entity-linked" }),
      );
    }

    await runCase({ grantId: "grant-1" }, "grants");
    await runCase({ fundId: "fund-1" }, "funds");
  });

  it("writes a CSV rollforward artifact and marks the report ready when R2 is available", async () => {
    const put = vi.fn(async () => undefined);
    const onFirstReady = vi.fn();
    const reportValues = vi.fn(() => ({
      returning: vi.fn(async () => [{ id: "report-1", status: "ready", format: "csv_bundle" }]),
    }));
    const balanceValues = vi.fn(() => ({
      onConflictDoNothing: vi.fn(async () => undefined),
    }));
    const insert = vi.fn().mockReturnValueOnce({ values: reportValues });
    const tx = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({ returning: vi.fn(async () => [{ status: "ready" }]) })),
        })),
      })),
      insert: vi.fn(() => ({ values: balanceValues })),
    };
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              orderBy: async () => [
                {
                  id: "term-1",
                  title: 'Scholarship "A"',
                  fundId: "fund-1",
                  grantId: null,
                  beginningBalanceCents: 100,
                },
              ],
            }),
          }),
        })
        .mockReturnValue({
          from: () => ({
            where: async () => [{ total: 0 }],
          }),
        }),
      insert,
      transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
    } as never;

    const result = await generateRestrictedRollforward(db, {
      orgId: "org-1",
      actorId: "user-1",
      planTier: "growth",
      env: { R2: { put } },
      trialUsageTier: "growth",
      onFirstReady,
      data: {
        attemptId: "00000000-0000-4000-8000-000000000099",
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-03-31T00:00:00.000Z",
      },
    });

    expect(put).toHaveBeenCalledWith(
      expect.stringMatching(
        /^org-1\/reports\/restricted-rollforward\/.*\/restricted-rollforward\.csv$/,
      ),
      expect.stringContaining('"Scholarship ""A"""'),
      expect.objectContaining({ httpMetadata: { contentType: "text/csv; charset=utf-8" } }),
    );
    expect(reportValues).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "pending",
        format: "csv_bundle",
        readyEffectsStatus: "pending",
        readyEffectsTrialTier: "growth",
      }),
    );
    expect(result.report).toMatchObject({ status: "ready", format: "csv_bundle" });
    expect(onFirstReady).toHaveBeenCalledOnce();
  });

  it("persists pending before upload and finalizes ready with balances in one transaction", async () => {
    const put = vi.fn(async () => undefined);
    const reportValues = vi.fn(() => ({
      returning: vi.fn(async () => [
        {
          id: "report-1",
          orgId: "org-1",
          entityId: "entity-1",
          type: "restricted_rollforward",
          attemptId: "00000000-0000-4000-8000-000000000099",
          status: "pending",
          format: "csv_bundle",
          title: "Restricted rollforward",
          fileKey: "org-1/reports/restricted-rollforward/report-1/restricted-rollforward.csv",
          fileName: "restricted-rollforward.csv",
          metadata: null,
          generatedBy: "user-1",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ]),
    }));
    const reportInsert = vi.fn(() => ({ values: reportValues }));
    const balanceValues = vi.fn(() => ({ onConflictDoNothing: vi.fn(async () => undefined) }));
    const tx = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(async () => [{ status: "ready" }]),
          })),
        })),
      })),
      insert: vi.fn(() => ({ values: balanceValues })),
    };
    const transaction = vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx));
    const db = {
      query: { generatedReports: { findFirst: vi.fn(async () => null) } },
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              orderBy: async () => [
                {
                  id: "term-1",
                  title: "Scholarship",
                  fundId: "fund-1",
                  grantId: null,
                  beginningBalanceCents: 100,
                },
              ],
            }),
          }),
        })
        .mockReturnValue({ from: () => ({ where: async () => [{ total: 0 }] }) }),
      insert: reportInsert,
      transaction,
    } as never;

    const result = await generateRestrictedRollforward(db, {
      orgId: "org-1",
      entityId: "entity-1",
      actorId: "user-1",
      planTier: "growth",
      env: { R2: { put } },
      data: {
        attemptId: "00000000-0000-4000-8000-000000000099",
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-03-31T00:00:00.000Z",
      },
    });

    expect(reportValues).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending", attemptId: expect.any(String) }),
    );
    expect(reportValues.mock.invocationCallOrder[0]!).toBeLessThan(
      put.mock.invocationCallOrder[0]!,
    );
    expect(transaction).toHaveBeenCalledOnce();
    expect(tx.update).toHaveBeenCalledOnce();
    expect(balanceValues).toHaveBeenCalledWith([
      expect.objectContaining({
        generatedReportId: "report-1",
        restrictionTermId: "term-1",
      }),
    ]);
    expect(result.report).toMatchObject({ id: "report-1", status: "ready" });
  });

  it("rejects reuse of a rollforward attempt for different filters", async () => {
    const put = vi.fn(async () => undefined);
    const existing = {
      id: "report-existing",
      orgId: "org-1",
      type: "restricted_rollforward",
      attemptId: "00000000-0000-4000-8000-000000000099",
      status: "ready",
      metadata: {
        periodStart: "2025-01-01T00:00:00.000Z",
        periodEnd: "2025-03-31T00:00:00.000Z",
        includeEvidencePackage: false,
        fundId: null,
        grantId: null,
        title: "Restricted rollforward",
        rows: [],
      },
    };
    const db = {
      query: { generatedReports: { findFirst: vi.fn(async () => existing) } },
    } as never;

    await expect(
      generateRestrictedRollforward(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        env: { R2: { put } },
        data: {
          attemptId: existing.attemptId,
          periodStart: "2026-01-01T00:00:00.000Z",
          periodEnd: "2026-03-31T00:00:00.000Z",
        },
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Export attempt does not match this request",
    });
    expect(put).not.toHaveBeenCalled();
  });

  it.each([
    ["missing metadata", null],
    [
      "period start",
      {
        periodEnd: "2026-03-31",
        includeEvidencePackage: false,
        fundId: null,
        grantId: null,
        title: "Restricted rollforward",
        rows: [],
      },
    ],
    [
      "period end",
      {
        periodStart: "2026-01-01",
        includeEvidencePackage: false,
        fundId: null,
        grantId: null,
        title: "Restricted rollforward",
        rows: [],
      },
    ],
    [
      "evidence flag",
      {
        periodStart: "2026-01-01",
        periodEnd: "2026-03-31",
        fundId: null,
        grantId: null,
        title: "Restricted rollforward",
        rows: [],
      },
    ],
    [
      "fund identity",
      {
        periodStart: "2026-01-01",
        periodEnd: "2026-03-31",
        includeEvidencePackage: false,
        fundId: 42,
        grantId: null,
        title: "Restricted rollforward",
        rows: [],
      },
    ],
    [
      "grant identity",
      {
        periodStart: "2026-01-01",
        periodEnd: "2026-03-31",
        includeEvidencePackage: false,
        fundId: null,
        grantId: 42,
        title: "Restricted rollforward",
        rows: [],
      },
    ],
    [
      "title",
      {
        periodStart: "2026-01-01",
        periodEnd: "2026-03-31",
        includeEvidencePackage: false,
        fundId: null,
        grantId: null,
        rows: [],
      },
    ],
    [
      "rows",
      {
        periodStart: "2026-01-01",
        periodEnd: "2026-03-31",
        includeEvidencePackage: false,
        fundId: null,
        grantId: null,
        title: "Restricted rollforward",
        rows: null,
      },
    ],
  ])("rejects a pending attempt with invalid %s", async (_label, metadata) => {
    const db = {
      query: {
        generatedReports: {
          findFirst: vi.fn(async () => ({
            id: "report-existing",
            orgId: "org-1",
            type: "restricted_rollforward",
            attemptId: "00000000-0000-4000-8000-000000000099",
            status: "pending",
            metadata,
          })),
        },
      },
    } as never;

    await expect(
      generateRestrictedRollforward(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        env: { R2: { put: vi.fn() } },
        data: {
          attemptId: "00000000-0000-4000-8000-000000000099",
          periodStart: "2026-01-01T00:00:00.000Z",
          periodEnd: "2026-03-31T00:00:00.000Z",
        },
      }),
    ).rejects.toMatchObject({ status: 400, message: "Pending report cannot be resumed" });
  });

  it("skips rollforward recovery when object storage is unavailable", async () => {
    await expect(
      recoverPendingRestrictedRollforwards({} as never, {
        APP_URL: "https://app.test",
        INTEGRATION_MODE: "mock",
      }),
    ).resolves.toBe(0);
  });

  it.each([
    ["ready", { R2: { put: vi.fn() } }],
    ["pending", undefined],
  ])("returns a matching %s attempt without creating another report", async (status, env) => {
    const existing = rollforwardReport({ status });
    const insert = vi.fn();
    const db = {
      query: { generatedReports: { findFirst: vi.fn(async () => existing) } },
      insert,
    } as never;

    await expect(
      generateRestrictedRollforward(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        env,
        data: {
          attemptId: "00000000-0000-4000-8000-000000000099",
          periodStart: "2026-01-01T00:00:00.000Z",
          periodEnd: "2026-03-31T00:00:00.000Z",
        },
      }),
    ).resolves.toMatchObject({ report: { id: "report-1", status } });
    expect(insert).not.toHaveBeenCalled();
  });

  it.each([
    ["ready", "fundId", "fund-1"],
    ["pending", "grantId", "grant-1"],
  ] as const)(
    "replays a %s rollforward after its persisted linked record is soft-deleted",
    async (status, linkKey, linkId) => {
      const findLinkedRecord = vi.fn(async () => ({
        id: linkId,
        entityId: "entity-1",
        deletedAt: new Date("2026-01-02T00:00:00.000Z"),
      }));
      const existing = rollforwardReport({
        status,
        [linkKey]: linkId,
        metadata: rollforwardMetadata({ [linkKey]: linkId }),
      });
      const findExistingReport = vi.fn(async () => existing);
      const tx = {
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => ({ returning: vi.fn(async () => [{ status: "ready" }]) })),
          })),
        })),
        insert: vi.fn(),
      };
      const db = {
        query: {
          funds: { findFirst: linkKey === "fundId" ? findLinkedRecord : vi.fn() },
          grants: { findFirst: linkKey === "grantId" ? findLinkedRecord : vi.fn() },
          generatedReports: { findFirst: findExistingReport },
        },
        transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
      } as never;
      const put = vi.fn(async () => undefined);

      await expect(
        generateRestrictedRollforward(db, {
          orgId: "org-1",
          entityId: "entity-1",
          actorId: "user-1",
          planTier: "growth",
          env: { R2: { put } },
          data: {
            [linkKey]: linkId,
            attemptId: "00000000-0000-4000-8000-000000000099",
            periodStart: "2026-01-01T00:00:00.000Z",
            periodEnd: "2026-03-31T00:00:00.000Z",
          },
        }),
      ).resolves.toMatchObject({ report: { id: "report-1", status: "ready" } });

      expect(findExistingReport).toHaveBeenCalledOnce();
      expect(findLinkedRecord).toHaveBeenCalledOnce();
      expect(put).toHaveBeenCalledTimes(status === "pending" ? 1 : 0);
      expect(tx.insert).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["non-unique failure", Object.assign(new Error("offline"), { code: "57P01" })],
    ["unique collision without a winner", Object.assign(new Error("duplicate"), { code: "23505" })],
  ])("preserves a %s while inserting a rollforward", async (_label, insertError) => {
    const findFirst = vi.fn().mockResolvedValue(undefined);
    const db = {
      query: { generatedReports: { findFirst } },
      select: vi.fn(() => ({
        from: () => ({ where: () => ({ orderBy: async () => [] }) }),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({ returning: vi.fn(async () => Promise.reject(insertError)) })),
      })),
    } as never;

    await expect(
      generateRestrictedRollforward(db, {
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        planTier: "growth",
        data: {
          attemptId: "00000000-0000-4000-8000-000000000099",
          periodStart: "2026-01-01T00:00:00.000Z",
          periodEnd: "2026-03-31T00:00:00.000Z",
        },
      }),
    ).rejects.toBe(insertError);
  });

  it("returns a ready concurrent winner without uploading again", async () => {
    const winner = rollforwardReport({ id: "report-winner", status: "ready" });
    const findFirst = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(winner);
    const db = {
      query: { generatedReports: { findFirst } },
      select: vi.fn(() => ({
        from: () => ({ where: () => ({ orderBy: async () => [] }) }),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(async () =>
            Promise.reject(Object.assign(new Error("duplicate"), { code: "23505" })),
          ),
        })),
      })),
    } as never;
    const put = vi.fn();

    await expect(
      generateRestrictedRollforward(db, {
        orgId: "org-1",
        entityId: "entity-1",
        actorId: "user-1",
        planTier: "growth",
        env: { R2: { put } },
        data: {
          attemptId: "00000000-0000-4000-8000-000000000099",
          periodStart: "2026-01-01T00:00:00.000Z",
          periodEnd: "2026-03-31T00:00:00.000Z",
        },
      }),
    ).resolves.toMatchObject({ report: { id: "report-winner", status: "ready" } });
    expect(put).not.toHaveBeenCalled();
  });

  it("treats a missing guarded update as a completed concurrent finish", async () => {
    const existing = rollforwardReport();
    const tx = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({ returning: vi.fn(async () => []) })),
        })),
      })),
      insert: vi.fn(),
    };
    const db = {
      query: { generatedReports: { findFirst: vi.fn(async () => existing) } },
      transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
    } as never;

    await expect(
      generateRestrictedRollforward(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        env: { R2: { put: vi.fn(async () => undefined) } },
        data: {
          attemptId: "00000000-0000-4000-8000-000000000099",
          periodStart: "2026-01-01T00:00:00.000Z",
          periodEnd: "2026-03-31T00:00:00.000Z",
        },
      }),
    ).resolves.toMatchObject({ report: { id: "report-1", status: "ready" } });
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("resumes the winning rollforward when concurrent inserts collide", async () => {
    const put = vi.fn(async () => undefined);
    const metadata = {
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-03-31T00:00:00.000Z",
      includeEvidencePackage: false,
      fundId: null,
      grantId: null,
      title: "Restricted rollforward",
      rows: [
        {
          termId: "term-1",
          title: "Scholarship",
          fundId: "fund-1",
          grantId: null,
          beginningBalanceCents: 100,
          additionsCents: 50,
          releasesCents: 25,
          endingBalanceCents: 125,
          evidenceLinks: [],
        },
      ],
    };
    const winner = {
      id: "report-winner",
      orgId: "org-1",
      entityId: "entity-1",
      type: "restricted_rollforward",
      attemptId: "00000000-0000-4000-8000-000000000099",
      status: "pending",
      format: "csv_bundle",
      title: "Restricted rollforward",
      fileKey: "org-1/reports/restricted-rollforward/report-winner/restricted-rollforward.csv",
      fileName: "restricted-rollforward.csv",
      metadata,
      generatedBy: "original-user",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    const findFirst = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
    const uniqueError = Object.assign(new Error("duplicate"), { code: "23505" });
    const tx = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({ returning: vi.fn(async () => [{ status: "ready" }]) })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({ onConflictDoNothing: vi.fn(async () => undefined) })),
      })),
    };
    const db = {
      query: { generatedReports: { findFirst } },
      select: vi.fn(() => ({
        from: () => ({ where: () => ({ orderBy: async () => [] }) }),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({ returning: vi.fn(async () => Promise.reject(uniqueError)) })),
      })),
      transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
    } as never;

    const result = await generateRestrictedRollforward(db, {
      orgId: "org-1",
      entityId: "entity-1",
      actorId: "retrying-user",
      planTier: "growth",
      env: { R2: { put } },
      data: {
        attemptId: winner.attemptId,
        periodStart: metadata.periodStart,
        periodEnd: metadata.periodEnd,
      },
    });

    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(put).toHaveBeenCalledWith(winner.fileKey, expect.any(String), expect.any(Object));
    expect(result.report).toMatchObject({ id: "report-winner", status: "ready" });
    const balanceValues = tx.insert.mock.results[0]?.value.values;
    expect(balanceValues).toHaveBeenCalledWith([
      expect.objectContaining({ createdBy: "original-user", generatedReportId: winner.id }),
    ]);
  });

  it("recovers stale attempted rollforwards and ignores legacy null-attempt rows", async () => {
    analyticsCapture.mockClear();
    analyticsCapture.mockImplementation(async ({ eventName }: { eventName: string }) => {
      if (eventName === "report_export_recovered") {
        throw new Error("recovery telemetry unavailable");
      }
      return { id: "analytics-event" };
    });
    const put = vi.fn(async () => undefined);
    const metadata = {
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-03-31T00:00:00.000Z",
      includeEvidencePackage: false,
      fundId: null,
      grantId: null,
      title: "Restricted rollforward",
      rows: [],
    };
    const recoverable = {
      id: "report-recover",
      orgId: "org-1",
      entityId: "entity-1",
      type: "restricted_rollforward",
      attemptId: "00000000-0000-4000-8000-000000000099",
      status: "pending",
      format: "csv_bundle",
      title: "Restricted rollforward",
      fileKey: "org-1/reports/restricted-rollforward/report-recover/restricted-rollforward.csv",
      fileName: "restricted-rollforward.csv",
      metadata,
      readyEffectsTrialTier: null,
      generatedBy: "user-1",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    const tx = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({ returning: vi.fn(async () => [{ status: "ready" }]) })),
        })),
      })),
      insert: vi.fn(),
    };
    const effectUpdateRows = [
      [{ ...recoverable, status: "ready", readyEffectsStatus: "sending" }],
      [],
    ];
    const db = {
      query: {
        generatedReports: {
          findMany: vi.fn(async () => [
            { ...recoverable, id: "legacy", attemptId: null },
            recoverable,
          ]),
        },
      },
      transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({ returning: vi.fn(async () => effectUpdateRows.shift() ?? []) })),
        })),
      })),
    } as never;

    await expect(
      recoverPendingRestrictedRollforwards(
        db,
        {
          R2: { put, get: vi.fn() } as never,
          APP_URL: "https://app.test",
          INTEGRATION_MODE: "mock",
        },
        new Date("2026-01-02T00:00:00.000Z"),
      ),
    ).resolves.toBe(1);

    expect(put).toHaveBeenCalledOnce();
    expect(put).toHaveBeenCalledWith(recoverable.fileKey, expect.any(String), expect.any(Object));
    const readySet = tx.update.mock.results[0]?.value.set.mock.calls[0]?.[0];
    expect(readySet).toMatchObject({
      status: "ready",
      readyEffectsStatus: "pending",
      metadata: expect.objectContaining({ recoveredFromPending: true }),
    });
    expect(analyticsCapture).not.toHaveBeenCalled();
  });

  it("contains a backoff-stamp failure for an invalid durable payload", async () => {
    const recoverable = rollforwardReport({ id: "report-invalid", metadata: null });
    const stampWhere = vi.fn(async () => {
      throw new Error("backoff stamp unavailable");
    });
    const db = {
      query: {
        generatedReports: { findMany: vi.fn(async () => [recoverable]) },
      },
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: stampWhere })),
      })),
    } as never;
    const put = vi.fn();

    await expect(
      recoverPendingRestrictedRollforwards(
        db,
        {
          R2: { put, get: vi.fn() } as never,
          APP_URL: "https://app.test",
          INTEGRATION_MODE: "mock",
        },
        new Date("2026-01-02T00:00:00.000Z"),
      ),
    ).resolves.toBe(0);

    expect(put).not.toHaveBeenCalled();
    expect(stampWhere).toHaveBeenCalledOnce();
    expect(analyticsCapture).not.toHaveBeenCalled();
  });

  it("does not count or emit recovery telemetry when another worker wins the transition", async () => {
    analyticsCapture.mockClear();
    const recoverable = rollforwardReport({ id: "report-concurrent" });
    const tx = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({ returning: vi.fn(async () => []) })),
        })),
      })),
      insert: vi.fn(),
    };
    const db = {
      query: { generatedReports: { findMany: vi.fn(async () => [recoverable]) } },
      transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
    } as never;

    await expect(
      recoverPendingRestrictedRollforwards(
        db,
        {
          R2: { put: vi.fn(async () => undefined), get: vi.fn() } as never,
          APP_URL: "https://app.test",
          INTEGRATION_MODE: "mock",
        },
        new Date("2026-01-02T00:00:00.000Z"),
      ),
    ).resolves.toBe(0);

    expect(tx.insert).not.toHaveBeenCalled();
    expect(analyticsCapture).not.toHaveBeenCalled();
  });

  it("includes release evidence rows in Audit-Ready rollforward artifacts", async () => {
    const put = vi.fn(async () => undefined);
    const insert = vi.fn().mockReturnValueOnce({
      values: vi.fn(() => ({
        returning: vi.fn(async () => [{ id: "report-1", status: "pending" }]),
      })),
    });
    const tx = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({ returning: vi.fn(async () => [{ status: "ready" }]) })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({ onConflictDoNothing: vi.fn(async () => undefined) })),
      })),
    };
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              orderBy: async () => [
                {
                  id: "term-1",
                  title: "Scholarship",
                  fundId: "fund-1",
                  grantId: null,
                  beginningBalanceCents: 100,
                },
              ],
            }),
          }),
        })
        .mockReturnValueOnce({ from: () => ({ where: async () => [{ total: 50 }] }) })
        .mockReturnValueOnce({ from: () => ({ where: async () => [{ total: 25 }] }) })
        .mockReturnValueOnce({ from: () => ({ where: async () => [{ total: 0 }] }) })
        .mockReturnValueOnce({ from: () => ({ where: async () => [{ total: 0 }] }) })
        .mockReturnValueOnce({
          from: () => ({
            leftJoin: () => ({
              where: async () => [
                {
                  releaseId: "release-1",
                  evidenceLinkId: "evidence-1",
                  evidenceType: "invoice",
                  label: "Invoice",
                  documentId: "doc-1",
                  generatedReportId: null,
                },
              ],
            }),
          }),
        }),
      insert,
      transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
    } as never;

    await generateRestrictedRollforward(db, {
      orgId: "org-1",
      actorId: "user-1",
      planTier: "audit_ready",
      env: { R2: { put } },
      data: {
        attemptId: "00000000-0000-4000-8000-000000000099",
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-03-31T00:00:00.000Z",
        includeEvidencePackage: true,
      },
    });

    expect(put).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("Evidence Package"),
      expect.any(Object),
    );
    expect(put).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('"release-1","invoice","Invoice","doc-1"'),
      expect.any(Object),
    );
  });

  it("allows Starter orgs to call restriction lifecycle service — feature now available on all plans", async () => {
    const db = makeDb({
      selectResults: [[], [{ total: 0 }], [{ total: 0 }]],
    });

    await expect(
      listRestrictionTerms(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "starter",
        page: 1,
        pageSize: 50,
      }),
    ).resolves.toBeDefined();
  });

  it("rejects restriction lifecycle calls when hasRestrictionLifecycle is false (defense-in-depth branch)", async () => {
    // The guard is unreachable via any real PlanTier since all tiers now have
    // hasRestrictionLifecycle = true. Cover the branch by mocking the helper.
    const spy = vi.spyOn(shared, "hasRestrictionLifecycle").mockReturnValueOnce(false);
    const db = makeDb();

    await expect(
      listRestrictionTerms(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "starter",
        page: 1,
        pageSize: 50,
      }),
    ).rejects.toMatchObject({ status: 402 });
    spy.mockRestore();
  });

  it("lists restriction terms with filters and computed balances", async () => {
    const db = makeDb({
      selectResults: [
        [{ ...activeTerm, beginningBalanceCents: 1000 }],
        [{ total: 250 }],
        [{ total: 75 }],
      ],
    });

    const result = await listRestrictionTerms(db, {
      orgId: "org-1",
      actorId: "user-1",
      planTier: "growth",
      fundId: "fund-1",
      grantId: "grant-1",
      donationId: "donation-1",
      sourceDocumentId: "doc-1",
      restrictionType: "purpose",
      page: 1,
      pageSize: 10,
    });

    expect(result).toMatchObject([
      {
        id: "term-1",
        additionsCents: 250,
        releasesCents: 75,
        endingBalanceCents: 1175,
      },
    ]);
  });

  it("creates, updates, and deletes restriction terms with allow lists and audit entries", async () => {
    const createdTerm = { ...activeTerm, id: "term-new", title: "New Term" };
    const updatedTerm = { ...activeTerm, title: "Updated Term" };
    const deletedTerm = { ...activeTerm, deletedAt: new Date("2026-02-01T00:00:00.000Z") };
    const db = makeDb({
      term: activeTerm,
      insertResults: [[createdTerm], [], [], [], []],
      updateResults: [[], [], [updatedTerm], [], [], [deletedTerm]],
    });

    await expect(
      createRestrictionTerm(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        data: {
          fundId: "fund-1",
          grantId: "grant-1",
          donationId: "donation-1",
          sourceDocumentId: "doc-1",
          restrictionType: "purpose",
          source: "donor",
          title: "New Term",
          purposeStatement: "Scholarships",
          releaseRule: "Tuition",
          startDate: "2026-01-01T00:00:00.000Z",
          endDate: "2026-12-31T00:00:00.000Z",
          beginningBalanceCents: 1000,
          evidenceRequirement: "Invoice",
          allowedPrograms: ["Education"],
          allowedCategories: [{ category: "Tuition", accountId: "account-1" }],
        },
      }),
    ).resolves.toMatchObject({ id: "term-new" });

    await expect(
      updateRestrictionTerm(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        termId: "term-1",
        data: {
          title: "Updated Term",
          startDate: "2026-02-01T00:00:00.000Z",
          endDate: "2026-11-30T00:00:00.000Z",
          allowedPrograms: [],
          allowedCategories: [],
        },
      }),
    ).resolves.toMatchObject({ title: "Updated Term" });

    await expect(
      deleteRestrictionTerm(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        termId: "term-1",
      }),
    ).resolves.toMatchObject({ id: "term-1", deletedAt: expect.any(Date) });
    expect(recordActivityLog).toHaveBeenCalledTimes(3);
  });

  it("returns not found when an active restriction term is missing", async () => {
    const db = makeDb({ term: null });

    await expect(
      deleteRestrictionTerm(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        termId: "missing",
      }),
    ).rejects.toMatchObject({ status: 404, message: "Restriction term not found" });
  });

  it("records additions after validating linked source documents", async () => {
    const addition = { id: "addition-1", amountCents: 500 };
    const db = makeDb({
      term: activeTerm,
      insertResults: [[addition]],
    });

    await expect(
      createRestrictionAddition(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        termId: "term-1",
        data: {
          amountCents: 500,
          date: "2026-01-15T00:00:00.000Z",
          description: "Initial gift",
        },
      }),
    ).resolves.toMatchObject({ id: "addition-1" });
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "restriction_addition" }),
    );
  });

  it("rejects releases with disallowed program or category warnings", async () => {
    const db = makeDb({
      term: activeTerm,
      selectResults: [
        [{ program: "Education" }],
        [{ category: "Tuition", accountId: "account-1" }],
      ],
    });

    await expect(
      createRestrictionRelease(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        termId: "term-1",
        data: {
          expenseId: "expense-1",
          journalLineId: "line-1",
          amountCents: 100,
          date: "2026-02-01T00:00:00.000Z",
          reason: "Spend",
          program: "Healthcare",
          category: "Supplies",
          accountId: "account-2",
        },
      }),
    ).rejects.toMatchObject({
      status: 400,
      message:
        "Release program is not allowed by this restriction term; Release category is not allowed by this restriction term",
    });
  });

  it("rejects releases that exceed available balance", async () => {
    const db = makeDb({
      term: activeTerm,
      selectResults: [[], [], [{ total: 0 }], [{ total: 0 }]],
    });

    await expect(
      createRestrictionRelease(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        termId: "term-1",
        data: {
          amountCents: 1001,
          date: "2026-02-01T00:00:00.000Z",
          reason: "Spend",
        },
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Release exceeds available restricted balance",
    });
  });

  it("creates releases when warnings are clear and balance is available", async () => {
    const release = { id: "release-1", amountCents: 400 };
    const db = makeDb({
      term: activeTerm,
      selectResults: [
        [{ program: "Education" }],
        [{ category: "Tuition", accountId: "account-1" }],
        [{ total: 100 }],
        [{ total: 50 }],
      ],
      insertResults: [[release]],
    });

    await expect(
      createRestrictionRelease(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        termId: "term-1",
        data: {
          expenseId: "expense-1",
          journalLineId: "line-1",
          amountCents: 400,
          date: "2026-02-01T00:00:00.000Z",
          reason: "Spend",
          program: "Education",
          category: "Tuition",
          accountId: "account-1",
        },
      }),
    ).resolves.toMatchObject({ release: { id: "release-1" }, warnings: [] });
  });

  it("scopes a linked journal line's fund/grant/org ownership with correctly-qualified cross-table SQL", async () => {
    const db = makeDb({ term: activeTerm, insertResults: [[{ id: "addition-1" }]] });

    await createRestrictionAddition(db, {
      orgId: "org-1",
      entityId: "entity-active",
      actorId: "user-1",
      planTier: "growth",
      termId: "term-1",
      data: {
        journalLineId: "line-1",
        amountCents: 100,
        date: "2026-02-01T00:00:00.000Z",
      },
    });

    const journalLineWhere = new PgDialect().sqlToQuery(
      (db as unknown as { _journalLineLinkWhereSpy: ReturnType<typeof vi.fn> })
        ._journalLineLinkWhereSpy.mock.calls[0]?.[0] as Parameters<PgDialect["sqlToQuery"]>[0],
    );
    expect(journalLineWhere.params).toContain("entity-active");
    // Cross-table fragments keep their own tables' qualification…
    expect(journalLineWhere.sql).toContain('"funds"."entity_id"');
    expect(journalLineWhere.sql).toContain('"grants"."entity_id"');
    expect(journalLineWhere.sql).toContain('"organizations"."default_entity_id"');
    // …and are NOT re-qualified to the base journal_lines table.
    expect(journalLineWhere.sql).not.toContain('"journal_lines"."entity_id"');
    expect(journalLineWhere.sql).not.toContain('"journal_lines"."default_entity_id"');
  });

  it("links restriction evidence to documents and generated reports", async () => {
    const link = { id: "evidence-1", label: "Invoice" };
    const db = makeDb({
      release: { id: "release-1" },
      insertResults: [[link]],
    });

    await expect(
      linkRestrictionEvidence(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        releaseId: "release-1",
        data: {
          documentId: "doc-1",
          evidenceType: "invoice",
          label: "Invoice",
        },
      }),
    ).resolves.toMatchObject({ id: "evidence-1" });
  });

  it("rejects evidence links to documents outside the organization", async () => {
    const db = makeDb({
      release: { id: "release-1" },
      insertResults: [[{ id: "evidence-1" }]],
      linkedRecord: null,
    });
    const dbMock = db as unknown as {
      _documentLinkWhereSpy: ReturnType<typeof vi.fn>;
      insert: ReturnType<typeof vi.fn>;
    };

    await expect(
      linkRestrictionEvidence(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        releaseId: "release-1",
        data: {
          documentId: "cross-org-doc",
          evidenceType: "invoice",
          label: "Invoice",
        },
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Linked restriction record does not belong to this organization",
    });
    expect(dbMock._documentLinkWhereSpy).toHaveBeenCalled();
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("returns not found when linking evidence to a missing release", async () => {
    const db = makeDb({ release: null });

    await expect(
      linkRestrictionEvidence(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        releaseId: "missing",
        data: { documentId: "doc-1", evidenceType: "invoice", label: "Invoice" },
      }),
    ).rejects.toMatchObject({ status: 404, message: "Restriction release not found" });
  });

  it("lists restriction alerts for unsupported releases", async () => {
    const date = new Date("2026-02-01T00:00:00.000Z");
    const db = makeDb({
      selectResults: [
        [
          {
            releaseId: "release-1",
            termId: "term-1",
            amountCents: 400,
            date,
            title: "Scholarship fund term",
          },
        ],
      ],
    });

    await expect(
      listRestrictionAlerts(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-03-31T00:00:00.000Z",
        fundId: "fund-1",
        grantId: "grant-1",
      }),
    ).resolves.toEqual([
      {
        id: "release-without-support:release-1",
        alertType: "release_without_support",
        termId: "term-1",
        releaseId: "release-1",
        amountCents: 400,
        label: "Release is missing evidence",
        contextLabel: "Scholarship fund term",
        date,
      },
    ]);
  });

  it("flags terms with evidence requirements but no recorded evidence", async () => {
    const createdAt = new Date("2026-02-15T00:00:00.000Z");
    const db = makeDb({
      selectResults: [[], [{ id: "term-2", title: "Capacity grant", createdAt }], [], [], [], []],
    });

    await expect(
      listRestrictionAlerts(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
      }),
    ).resolves.toEqual([
      {
        id: "missing-evidence:term-2",
        alertType: "missing_evidence",
        termId: "term-2",
        releaseId: null,
        amountCents: 0,
        label: "Capacity grant: required evidence has not been recorded",
        contextLabel: null,
        date: createdAt,
      },
    ]);
  });

  it("flags expired time-bound terms that still have an unspent balance and skips drained terms", async () => {
    const endDate = new Date("2025-12-31T00:00:00.000Z");
    const db = makeDb({
      selectResults: [
        [],
        [],
        [
          {
            id: "term-3",
            title: "Spring stipend",
            endDate,
            beginningBalanceCents: 5_000,
            additionsTotal: "10000",
            releasesTotal: "8000",
          },
          {
            id: "term-drained",
            title: "Fully spent term",
            endDate,
            beginningBalanceCents: 0,
            additionsTotal: "10000",
            releasesTotal: "10000",
          },
        ],
        [],
        [],
        [],
      ],
    });

    await expect(
      listRestrictionAlerts(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
      }),
    ).resolves.toEqual([
      {
        id: "expired-time:term-3",
        alertType: "expired_time_restriction",
        termId: "term-3",
        releaseId: null,
        amountCents: 7_000,
        label: "Spring stipend: time restriction expired with 7000 cents unspent",
        contextLabel: null,
        date: endDate,
      },
    ]);
  });

  it("falls back to current time when an expired term lacks an end date", async () => {
    const db = makeDb({
      selectResults: [
        [],
        [],
        [
          {
            id: "term-no-enddate",
            title: "Edge case term",
            endDate: null,
            beginningBalanceCents: 0,
            additionsTotal: null,
            releasesTotal: null,
          },
          {
            id: "term-with-balance",
            title: "Has balance",
            endDate: null,
            beginningBalanceCents: 1_000,
            additionsTotal: null,
            releasesTotal: null,
          },
        ],
        [],
        [],
        [],
      ],
    });

    const result = await listRestrictionAlerts(db, {
      orgId: "org-1",
      actorId: "user-1",
      planTier: "growth",
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "expired-time:term-with-balance",
      alertType: "expired_time_restriction",
      amountCents: 1_000,
    });
    expect(result[0]?.date).toBeInstanceOf(Date);
  });

  it("flags releases dated outside the restriction term window", async () => {
    const releaseDate = new Date("2027-02-01T00:00:00.000Z");
    const db = makeDb({
      selectResults: [
        [],
        [],
        [],
        [
          {
            releaseId: "release-out-of-window",
            termId: "term-window",
            amountCents: 2_500,
            date: releaseDate,
            title: "Time-bound grant term",
          },
        ],
        [],
        [],
      ],
    });

    await expect(
      listRestrictionAlerts(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
      }),
    ).resolves.toEqual([
      {
        id: "release-term-conflict:release-out-of-window",
        alertType: "release_term_conflict",
        termId: "term-window",
        releaseId: "release-out-of-window",
        amountCents: 2_500,
        label: "Release date falls outside the restriction term window",
        contextLabel: "Time-bound grant term",
        date: releaseDate,
      },
    ]);
  });

  it("flags releases linked to expenses that conflict with the term scope", async () => {
    const releaseDate = new Date("2026-02-15T00:00:00.000Z");
    const db = makeDb({
      selectResults: [
        [],
        [],
        [],
        [],
        [
          {
            releaseId: "release-mismatch",
            termId: "term-fund-locked",
            amountCents: 4_000,
            date: releaseDate,
            title: "Purpose-restricted program term",
          },
        ],
        [],
      ],
    });

    await expect(
      listRestrictionAlerts(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
      }),
    ).resolves.toEqual([
      {
        id: "expense-term-conflict:release-mismatch",
        alertType: "expense_term_conflict",
        termId: "term-fund-locked",
        releaseId: "release-mismatch",
        amountCents: 4_000,
        label: "Release expense conflicts with the restriction term scope",
        contextLabel: "Purpose-restricted program term",
        date: releaseDate,
      },
    ]);
  });

  it("flags terms whose computed balance is negative and skips solvent terms", async () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const db = makeDb({
      selectResults: [
        [],
        [],
        [],
        [],
        [],
        [
          {
            id: "term-overdrawn",
            title: "Overdrawn fund",
            createdAt,
            beginningBalanceCents: 1_000,
            additionsTotal: "2000",
            releasesTotal: "5000",
          },
          {
            id: "term-healthy",
            title: "Healthy fund",
            createdAt,
            beginningBalanceCents: 1_000,
            additionsTotal: "5000",
            releasesTotal: "2000",
          },
        ],
      ],
    });

    await expect(
      listRestrictionAlerts(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
      }),
    ).resolves.toEqual([
      {
        id: "negative-balance:term-overdrawn",
        alertType: "negative_restricted_balance",
        termId: "term-overdrawn",
        releaseId: null,
        amountCents: -2_000,
        label: "Overdrawn fund: restricted balance is negative",
        contextLabel: null,
        date: createdAt,
      },
    ]);
  });

  it("treats null addition and release totals as zero when computing the negative balance", async () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const db = makeDb({
      selectResults: [
        [],
        [],
        [],
        [],
        [],
        [
          {
            id: "term-null-totals",
            title: "Null totals term",
            createdAt,
            beginningBalanceCents: -500,
            additionsTotal: null,
            releasesTotal: null,
          },
        ],
      ],
    });

    await expect(
      listRestrictionAlerts(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
      }),
    ).resolves.toEqual([
      {
        id: "negative-balance:term-null-totals",
        alertType: "negative_restricted_balance",
        termId: "term-null-totals",
        releaseId: null,
        amountCents: -500,
        label: "Null totals term: restricted balance is negative",
        contextLabel: null,
        date: createdAt,
      },
    ]);
  });

  it("only runs the requested alert detector when alertType is supplied", async () => {
    const createdAt = new Date("2026-03-01T00:00:00.000Z");
    const select = vi.fn(() => makeSelectResult([{ id: "term-only", title: "Only", createdAt }]));
    const db = {
      query: { restrictionTerms: { findFirst: vi.fn() } },
      select,
    } as never;

    const result = await listRestrictionAlerts(db, {
      orgId: "org-1",
      actorId: "user-1",
      planTier: "growth",
      alertType: "missing_evidence",
    });

    expect(select).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      {
        id: "missing-evidence:term-only",
        alertType: "missing_evidence",
        termId: "term-only",
        releaseId: null,
        amountCents: 0,
        label: "Only: required evidence has not been recorded",
        contextLabel: null,
        date: createdAt,
      },
    ]);
  });

  it("skips the missing_evidence detector when a different alertType is requested", async () => {
    const date = new Date("2026-04-01T00:00:00.000Z");
    const select = vi.fn(() =>
      makeSelectResult([{ releaseId: "release-only", termId: "term-only", amountCents: 1, date }]),
    );
    const db = {
      query: { restrictionTerms: { findFirst: vi.fn() } },
      select,
    } as never;

    const result = await listRestrictionAlerts(db, {
      orgId: "org-1",
      actorId: "user-1",
      planTier: "growth",
      alertType: "release_without_support",
    });

    expect(select).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      {
        id: "release-without-support:release-only",
        alertType: "release_without_support",
        termId: "term-only",
        releaseId: "release-only",
        amountCents: 1,
        label: "Release is missing evidence",
        contextLabel: null,
        date,
      },
    ]);
  });

  it("requires Audit-Ready plan for evidence package exports", async () => {
    const db = makeDb();

    await expect(
      generateRestrictedRollforward(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        data: {
          attemptId: "00000000-0000-4000-8000-000000000099",
          periodStart: "2026-01-01T00:00:00.000Z",
          periodEnd: "2026-03-31T00:00:00.000Z",
          includeEvidencePackage: true,
        },
      }),
    ).rejects.toMatchObject({ status: 402 });
  });

  it.each(["pending", "ready"])(
    "does not replay a %s rollforward from a different active entity",
    async (status) => {
      const oldReport = rollforwardReport({ status, entityId: "entity-1" });
      const db = makeDb({
        selectResults: [[], []],
        insertResults: [[{ id: "report-entity-2", createdAt: new Date() }]],
        updateResults: [[{ status: "ready", entityId: "entity-2" }]],
      });
      generatedReportFindFirstMock(db).mockImplementation(async ({ where }) =>
        hasObjectProperty(where, "value", "entity-2") ? null : oldReport,
      );

      const result = await generateRestrictedRollforward(db, {
        orgId: "org-1",
        entityId: "entity-2",
        actorId: "user-1",
        planTier: "growth",
        env: { R2: { put: vi.fn(async () => undefined) } },
        data: {
          attemptId: "00000000-0000-4000-8000-000000000099",
          periodStart: "2026-01-01T00:00:00.000Z",
          periodEnd: "2026-03-31T00:00:00.000Z",
        },
      });

      expect(result.report.id).toBe("report-entity-2");
      expect((db as unknown as { insert: ReturnType<typeof vi.fn> }).insert).toHaveBeenCalled();
    },
  );

  it("handles empty lists and default filter branches", async () => {
    const db = makeDb({ selectResults: [[], []] });

    await expect(
      listRestrictionTerms(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        page: 1,
        pageSize: 50,
      }),
    ).resolves.toEqual([]);

    await expect(
      listRestrictionAlerts(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
      }),
    ).resolves.toEqual([]);
  });

  it("creates a minimal term without optional dates or allow lists", async () => {
    const createdTerm = { ...activeTerm, id: "term-minimal", startDate: null, endDate: null };
    const db = makeDb({
      insertResults: [[createdTerm]],
    });

    await expect(
      createRestrictionTerm(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        data: {
          fundId: "fund-1",
          restrictionType: "purpose",
          source: "board",
          title: "Board reserve",
          purposeStatement: "Board-designated scholarship reserve",
          beginningBalanceCents: 0,
        },
      }),
    ).resolves.toMatchObject({ id: "term-minimal" });
  });

  it("stores allowed categories without linked accounts as null", async () => {
    const createdTerm = { ...activeTerm, id: "term-category-null" };
    const db = makeDb({
      insertResults: [[createdTerm], []],
      updateResults: [[]],
    });

    await expect(
      createRestrictionTerm(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        data: {
          fundId: "fund-1",
          restrictionType: "purpose",
          source: "donor",
          title: "Category only",
          purposeStatement: "Scholarships",
          beginningBalanceCents: 0,
          allowedCategories: [{ category: "Tuition" }],
        },
      }),
    ).resolves.toMatchObject({ id: "term-category-null" });
  });

  it("surfaces failed term, addition, release, and evidence inserts", async () => {
    const db = makeDb({
      term: { ...activeTerm, beginningBalanceCents: 1000 },
      release: { id: "release-1" },
      selectResults: [[], []],
      insertResults: [[], [], [], []],
      updateResults: [[]],
    });

    await expect(
      createRestrictionTerm(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        data: {
          fundId: "fund-1",
          restrictionType: "purpose",
          source: "donor",
          title: "Broken term",
          purposeStatement: "Scholarships",
          beginningBalanceCents: 0,
        },
      }),
    ).rejects.toMatchObject({ status: 400, message: "Failed to create restriction term" });

    await expect(
      createRestrictionAddition(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        termId: "term-1",
        data: {
          amountCents: 100,
          date: "2026-01-15T00:00:00.000Z",
        },
      }),
    ).rejects.toMatchObject({ status: 400, message: "Failed to create restriction addition" });

    await expect(
      createRestrictionRelease(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        termId: "term-1",
        data: {
          amountCents: 100,
          date: "2026-02-15T00:00:00.000Z",
          reason: "Spend",
        },
      }),
    ).rejects.toMatchObject({ status: 400, message: "Failed to create restriction release" });

    await expect(
      linkRestrictionEvidence(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        releaseId: "release-1",
        data: {
          generatedReportId: "report-1",
          evidenceType: "report",
          label: "Generated report",
        },
      }),
    ).rejects.toMatchObject({ status: 400, message: "Failed to link restriction evidence" });
  });

  it("allows a release whose accountId is provided but the matching allowed-category row has a null accountId", async () => {
    // Bug: the original predicate required row.accountId === data.accountId, so a
    // category row with accountId=null would never satisfy a release that supplies
    // an accountId, even though the category itself is explicitly in the allow-list.
    const release = { id: "release-null-acct", amountCents: 100 };
    const db = makeDb({
      term: activeTerm,
      // Allowed category has category="Tuition" but NO accountId (null).
      // Release supplies accountId="account-1". Should NOT produce a warning.
      // Note: no program in data, so allowedPrograms select is skipped entirely.
      selectResults: [
        [{ category: "Tuition", accountId: null }], // allowedCategories with null accountId
        [{ total: 0 }], // additions for availableBalance
        [{ total: 0 }], // releases for availableBalance
      ],
      insertResults: [[release]],
    });

    await expect(
      createRestrictionRelease(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        termId: "term-1",
        data: {
          amountCents: 100,
          date: "2026-02-01T00:00:00.000Z",
          reason: "Spend",
          category: "Tuition",
          accountId: "account-1",
        },
      }),
    ).resolves.toMatchObject({ release: { id: "release-null-acct" }, warnings: [] });
  });

  it("surfaces not found when an update loses the target row", async () => {
    const db = makeDb({
      term: activeTerm,
      updateResults: [[]],
    });

    await expect(
      updateRestrictionTerm(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        termId: "term-1",
        data: { title: "Missing update" },
      }),
    ).rejects.toMatchObject({ status: 404, message: "Restriction term not found" });
  });

  it("merges every patch field when the update body supplies fresh values", async () => {
    const updatedTerm = { ...activeTerm, title: "Fully Updated" };
    const db = makeDb({
      term: activeTerm,
      updateResults: [[updatedTerm]],
    });

    await expect(
      updateRestrictionTerm(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        termId: "term-1",
        data: {
          fundId: "fund-2",
          grantId: "grant-2",
          donationId: "donation-2",
          sourceDocumentId: "doc-2",
          restrictionType: "purpose_and_time",
          source: "board",
          title: "Fully Updated",
          purposeStatement: "Updated purpose",
          releaseRule: "Updated rule",
          startDate: "2026-04-01T00:00:00.000Z",
          endDate: "2026-12-31T00:00:00.000Z",
          beginningBalanceCents: 5000,
          currency: "USD",
          evidenceRequirement: "Receipts",
        },
      }),
    ).resolves.toMatchObject({ title: "Fully Updated" });
  });

  it("links generated report evidence without a document target", async () => {
    const link = { id: "evidence-report-1", label: "Generated report" };
    const db = makeDb({
      release: { id: "release-1" },
      insertResults: [[link]],
    });

    await expect(
      linkRestrictionEvidence(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        releaseId: "release-1",
        data: {
          generatedReportId: "report-1",
          evidenceType: "report",
          label: "Generated report",
        },
      }),
    ).resolves.toMatchObject({ id: "evidence-report-1" });
  });

  it("links generated report evidence only when the report is ready", async () => {
    const link = { id: "evidence-report-1", label: "Generated report" };
    const db = makeDb({
      release: { id: "release-1" },
      insertResults: [[link]],
      linkedRecord: null,
    });
    generatedReportFindFirstMock(db).mockImplementation(async (call) => {
      const requiresReadyStatus = hasGeneratedReportReadyStatusPredicate(call.where);
      return requiresReadyStatus ? { id: "report-1" } : null;
    });

    await expect(
      linkRestrictionEvidence(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        releaseId: "release-1",
        data: {
          generatedReportId: "report-1",
          evidenceType: "report",
          label: "Generated report",
        },
      }),
    ).resolves.toMatchObject({ id: "evidence-report-1" });
  });

  it("rejects when the rollforward report row fails to persist", async () => {
    const insert = vi.fn().mockReturnValueOnce({
      values: vi.fn(() => ({
        returning: vi.fn(async () => []),
      })),
    });
    const db = {
      query: {
        funds: { findFirst: vi.fn(async () => ({ id: "fund-1", entityId: "entity-1" })) },
        grants: { findFirst: vi.fn(async () => ({ id: "grant-1", entityId: "entity-1" })) },
      },
      select: vi.fn().mockReturnValueOnce({
        from: () => ({
          where: () => ({
            orderBy: async () => [],
          }),
        }),
      }),
      insert,
    } as never;

    await expect(
      generateRestrictedRollforward(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        data: {
          fundId: "fund-1",
          grantId: "grant-1",
          title: "Q1 Rollforward",
          attemptId: "00000000-0000-4000-8000-000000000099",
          periodStart: "2026-01-01T00:00:00.000Z",
          periodEnd: "2026-03-31T00:00:00.000Z",
        },
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("uses zero totals and missing evidence labels in Audit-Ready exports", async () => {
    const put = vi.fn(async () => undefined);
    const db = makeDb({
      selectResults: [
        [
          {
            id: "term-1",
            title: "Scholarship",
            fundId: null,
            grantId: "grant-1",
            beginningBalanceCents: 1000,
          },
        ],
        [],
        [],
        [],
        [],
        [
          {
            releaseId: "release-1",
            evidenceLinkId: null,
            evidenceType: null,
            label: null,
            documentId: null,
            generatedReportId: null,
          },
        ],
      ],
      insertResults: [[{ id: "report-1", status: "ready" }], []],
    });

    const result = await generateRestrictedRollforward(db, {
      orgId: "org-1",
      actorId: "user-1",
      planTier: "audit_ready",
      env: { R2: { put } },
      data: {
        attemptId: "00000000-0000-4000-8000-000000000099",
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-03-31T00:00:00.000Z",
        includeEvidencePackage: true,
      },
    });

    expect(result.rows).toMatchObject([
      {
        beginningBalanceCents: 1000,
        additionsCents: 0,
        releasesCents: 0,
        endingBalanceCents: 1000,
      },
    ]);
    expect(put).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('"release-1","missing","Missing evidence","",""'),
      expect.any(Object),
    );
  });
});

// ---------------------------------------------------------------------------
// orgId join predicate isolation tests
// ---------------------------------------------------------------------------

describe("cross-org join predicate isolation", () => {
  it("scopes restrictionEvidenceLinks leftJoin by orgId in detectReleasesWithoutSupport (line 691)", async () => {
    // Capture the leftJoin call so we can inspect its ON predicate.
    const leftJoinSpy = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    });
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            leftJoin: leftJoinSpy,
          }),
        }),
      }),
      query: {
        restrictionTerms: { findFirst: vi.fn(async () => null) },
        restrictionReleases: { findFirst: vi.fn(async () => null) },
        funds: { findFirst: vi.fn(async () => null) },
        grants: { findFirst: vi.fn(async () => null) },
        donations: { findFirst: vi.fn(async () => null) },
        documents: { findFirst: vi.fn(async () => null) },
        expenses: { findFirst: vi.fn(async () => null) },
        journalLines: { findFirst: vi.fn(async () => null) },
        generatedReports: { findFirst: vi.fn(async () => null) },
        chartOfAccounts: { findFirst: vi.fn(async () => null) },
      },
      insert: vi.fn(() => ({ values: vi.fn(async () => []) })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(async () => []) })) })),
      })),
      execute: vi.fn(async () => undefined),
      transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
        cb({
          update: vi.fn(() => ({
            set: vi.fn(() => ({
              where: vi.fn(() => ({
                returning: vi.fn(async () => [{ status: "ready" }]),
              })),
            })),
          })),
          insert: vi.fn(() => ({
            values: vi.fn(() => ({ onConflictDoNothing: vi.fn(async () => undefined) })),
          })),
        }),
      ),
    } as never;

    await listRestrictionAlerts(db, {
      orgId: "org-isolated",
      actorId: "actor-1",
      planTier: "growth",
      alertType: "release_without_support",
    });

    expect(leftJoinSpy).toHaveBeenCalledTimes(1);
    const onPredicate = leftJoinSpy.mock.calls[0]?.[1];
    // Walk the predicate AST (cycle-safe) and collect string values.
    const found = collectStringValues(onPredicate);
    // The predicate must bind to the orgId value so cross-org evidence links cannot leak.
    expect(found).toContain("org-isolated");
  });

  it("scopes restrictionEvidenceLinks leftJoin by orgId in evidence backfill (line 1070)", async () => {
    // The leftJoin spy is installed on the builder returned for the evidence-package
    // select. generateRestrictedRollforward calls select() sequentially:
    //   1: terms (from+where+orderBy), 2: priorAdditionTotals, 3: priorReleaseTotals,
    //   4: additionsCents total, 5: releasesCents total, 6: evidence links (leftJoin)
    // We model a minimal happy path with one term so the per-term branch executes.
    const leftJoinSpy = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    });

    const termRow = {
      id: "term-1",
      orgId: "org-isolated",
      title: "Term",
      fundId: null,
      grantId: null,
      beginningBalanceCents: 0,
    };

    // makeSelectResult returns a thenable builder; we need it for the terms fetch
    // (which calls .from().where().orderBy()) and simple resolves for totals.
    function makeOrderableBuilder(result: unknown) {
      const p = Object.assign(Promise.resolve(result), {
        orderBy: vi.fn(() => Promise.resolve(result)),
      });
      return { from: vi.fn(() => ({ where: vi.fn(() => p) })) };
    }

    function makeSimpleBuilder(result: unknown) {
      return { from: vi.fn(() => ({ where: vi.fn(() => Promise.resolve(result)) })) };
    }

    function makeEvidenceBuilder() {
      return { from: vi.fn(() => ({ leftJoin: leftJoinSpy })) };
    }

    let selectIdx = 0;
    const db = {
      select: vi.fn().mockImplementation(() => {
        selectIdx++;
        // call 1: terms list
        if (selectIdx === 1) return makeOrderableBuilder([termRow]);
        // calls 2-5: prior additions, prior releases, period additions, period releases (all zero)
        if (selectIdx <= 5) return makeSimpleBuilder([{ total: null }]);
        // call 6: evidence links (includeEvidencePackage path)
        return makeEvidenceBuilder();
      }),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(async () => [{ id: "report-1", status: "ready" }]),
        })),
      })),
      query: {
        restrictionTerms: { findFirst: vi.fn(async () => null) },
        restrictionReleases: { findFirst: vi.fn(async () => null) },
        funds: { findFirst: vi.fn(async () => null) },
        grants: { findFirst: vi.fn(async () => null) },
        donations: { findFirst: vi.fn(async () => null) },
        documents: { findFirst: vi.fn(async () => null) },
        expenses: { findFirst: vi.fn(async () => null) },
        journalLines: { findFirst: vi.fn(async () => null) },
        generatedReports: { findFirst: vi.fn(async () => null) },
        chartOfAccounts: { findFirst: vi.fn(async () => null) },
      },
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(async () => []) })) })),
      })),
      execute: vi.fn(async () => undefined),
      transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
        cb({
          update: vi.fn(() => ({
            set: vi.fn(() => ({
              where: vi.fn(() => ({
                returning: vi.fn(async () => [{ status: "ready" }]),
              })),
            })),
          })),
          insert: vi.fn(() => ({
            values: vi.fn(() => ({ onConflictDoNothing: vi.fn(async () => undefined) })),
          })),
        }),
      ),
    } as never;

    await generateRestrictedRollforward(db, {
      orgId: "org-isolated",
      actorId: "actor-1",
      planTier: "audit_ready",
      env: { R2: { put: vi.fn(async () => undefined) } } as never,
      data: {
        attemptId: "00000000-0000-4000-8000-000000000099",
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-12-31T00:00:00.000Z",
        includeEvidencePackage: true,
      },
    });

    // The leftJoin ON predicate must bind "org-isolated" to prevent cross-org evidence link leakage.
    expect(leftJoinSpy).toHaveBeenCalled();
    const onPredicate = leftJoinSpy.mock.calls[0]?.[1];
    const found = collectStringValues(onPredicate);
    expect(found).toContain("org-isolated");
  });
});

// Cycle-safe string value collector used by the orgId isolation tests above.
function collectStringValues(node: unknown, seen = new WeakSet<object>()): string[] {
  if (node === null || node === undefined) return [];
  if (typeof node === "string") return [node];
  if (typeof node !== "object") return [];
  if (seen.has(node as object)) return [];
  seen.add(node as object);
  if (Array.isArray(node)) return node.flatMap((item) => collectStringValues(item, seen));
  const results: string[] = [];
  for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
    if (key === "table") continue; // skip circular table back-refs
    results.push(...collectStringValues(val, seen));
  }
  return results;
}

describe("soft-delete write guard", () => {
  it("scopes the updateRestrictionTerm write by isNull(deletedAt) so a concurrent soft-delete blocks the write", async () => {
    const whereSpy = vi.fn((_cond: unknown) => ({
      returning: vi.fn(async () => [{ id: "term-1", title: "New title" }]),
    }));
    const db: Record<string, unknown> = {
      query: {
        funds: { findFirst: vi.fn(async () => null) },
        grants: { findFirst: vi.fn(async () => null) },
        donations: { findFirst: vi.fn(async () => null) },
        documents: { findFirst: vi.fn(async () => null) },
        expenses: { findFirst: vi.fn(async () => null) },
        journalLines: { findFirst: vi.fn(async () => null) },
        generatedReports: { findFirst: vi.fn(async () => null) },
        chartOfAccounts: { findFirst: vi.fn(async () => null) },
      },
      // getActiveTerm is converted to the core query builder — see the
      // source-contract regression guard below.
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([activeTerm]),
          }),
        }),
      }),
      insert: makeInsertSpy(),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: whereSpy })) })),
      execute: vi.fn(async () => undefined),
    };
    db.transaction = vi.fn(async (cb: (tx: unknown) => unknown) => cb(db));

    await updateRestrictionTerm(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      planTier: "growth",
      termId: "term-1",
      data: { title: "New title" },
    });

    expect(whereSpy).toHaveBeenCalledTimes(1);
    const wherePredicate = whereSpy.mock.calls[0]?.[0];
    // The UPDATE WHERE must bind the deleted_at column so an already
    // soft-deleted term cannot be mutated under a TOCTOU race.
    expect(hasObjectProperty(wherePredicate, "name", "deleted_at")).toBe(true);
  });
});

describe("activity-log atomicity", () => {
  it("wraps restriction addition insert and audit log in a single transaction", async () => {
    const addition = { id: "addition-1", amountCents: 500 };
    const db = makeDb({ term: activeTerm, insertResults: [[addition]] });

    await createRestrictionAddition(db, {
      orgId: "org-1",
      actorId: "user-1",
      planTier: "growth",
      termId: "term-1",
      data: { amountCents: 500, date: "2026-01-15T00:00:00.000Z", description: "Gift" },
    });

    expect(
      (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction,
    ).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "restriction_addition" }),
    );
  });

  it("rolls back the restriction addition when the audit log write fails", async () => {
    const addition = { id: "addition-1", amountCents: 500 };
    const db = makeDb({ term: activeTerm, insertResults: [[addition]] });
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));

    await expect(
      createRestrictionAddition(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        termId: "term-1",
        data: { amountCents: 500, date: "2026-01-15T00:00:00.000Z", description: "Gift" },
      }),
    ).rejects.toThrow("audit log down");
    expect(
      (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction,
    ).toHaveBeenCalledTimes(1);
  });

  it("wraps restriction term soft-delete and audit log in a single transaction", async () => {
    const deletedTerm = { ...activeTerm, deletedAt: new Date("2026-02-01T00:00:00.000Z") };
    const db = makeDb({ term: activeTerm, updateResults: [[deletedTerm]] });

    await deleteRestrictionTerm(db, {
      orgId: "org-1",
      actorId: "user-1",
      planTier: "growth",
      termId: "term-1",
    });

    expect(
      (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction,
    ).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "restriction_term", action: "deleted" }),
    );
  });

  it("throws not found and skips the audit log when the soft-delete matches no active row", async () => {
    const db = makeDb({ term: activeTerm, updateResults: [[]] });

    await expect(
      deleteRestrictionTerm(db, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "growth",
        termId: "term-1",
      }),
    ).rejects.toMatchObject({ status: 404, message: "Restriction term not found" });
    expect(recordActivityLog).not.toHaveBeenCalled();
  });

  it("wraps restriction evidence link insert and audit log in a single transaction", async () => {
    const link = { id: "link-1" };
    const db = makeDb({
      release: { id: "release-1", orgId: "org-1" },
      insertResults: [[link]],
    });

    await linkRestrictionEvidence(db, {
      orgId: "org-1",
      actorId: "user-1",
      planTier: "growth",
      releaseId: "release-1",
      data: { documentId: "doc-1", evidenceType: "invoice", label: "Receipt" },
    });

    expect(
      (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction,
    ).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "restriction_evidence_link" }),
    );
  });
});

// ---------------------------------------------------------------------------
// Regression guard — relational query API + cross-table sql fragments
//
// getActiveTerm, the donation-link check, and the document-link check in
// assertLinkedRecordsInOrg all pass `where` expressions built from
// restrictionTermEntityScope / an inline donation entity scope /
// restrictionDocumentEntityScope, which embed raw `sql` fragments
// referencing OTHER tables' columns (funds, grants, donations, organizations,
// generatedReports). Under the Drizzle relational query API
// (`db.query.<table>.findFirst`), those fragments get silently re-qualified
// to the wrong table and Postgres 500s. The core query builder
// (`db.select().from().where()`) does not re-qualify columns, so these three
// call sites must use it instead of `db.query.*`.
// ---------------------------------------------------------------------------

describe("restrictions service source contract — no relational API for cross-table scopes", () => {
  const restrictionsServiceSource = readFileSync(
    fileURLToPath(new URL("./service.ts", import.meta.url)),
    "utf8",
  );

  it("does not call db.query.restrictionTerms.findFirst (restrictionTermEntityScope re-qualification hazard)", () => {
    expect(restrictionsServiceSource).not.toContain("db.query.restrictionTerms.findFirst");
  });

  it("does not call db.query.donations.findFirst (donation entity scope re-qualification hazard)", () => {
    expect(restrictionsServiceSource).not.toContain("db.query.donations.findFirst");
  });

  it("does not call db.query.documents.findFirst (restrictionDocumentEntityScope re-qualification hazard)", () => {
    expect(restrictionsServiceSource).not.toContain("db.query.documents.findFirst");
  });

  it("does not call db.query.journalLines.findFirst (inline funds/grants/organizations EXISTS re-qualification hazard)", () => {
    expect(restrictionsServiceSource).not.toContain("db.query.journalLines.findFirst");
  });

  it("does not look up restriction releases through the relational API (restrictionReleaseEntityScope re-qualification hazard)", () => {
    expect(restrictionsServiceSource).not.toContain("query.restrictionReleases.findFirst");
  });
});
