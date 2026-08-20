import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  buildReportBuilderCsv,
  createReportDefinition,
  deleteReportDefinition,
  getReportBuilderColumnLabel,
  getReportBuilderMetadata,
  listReportDefinitions,
  previewReportDefinition,
  recoverPendingCustomReports,
  runReportDefinition,
  toReportBuilderDefinition,
  updateReportDefinition,
} from "./service";

const storagePut = vi.fn();
const analyticsCapture = vi.fn();

vi.mock("../../lib/integrations", () => ({
  getIntegrations: vi.fn(() => ({
    storage: { put: storagePut },
    analytics: { capture: analyticsCapture },
  })),
}));

const now = new Date("2026-06-18T00:00:00.000Z");

function persistedDefinition(overrides: Record<string, unknown> = {}) {
  return {
    id: "definition-1",
    orgId: "org-1",
    name: "Grant view",
    description: "Board view",
    entity: "grants",
    columns: ["name"],
    customFieldIds: [],
    filters: [],
    sort: [],
    createdBy: "user-1",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

function persistedGeneratedReport(overrides: Record<string, unknown> = {}) {
  return {
    id: "report-1",
    orgId: "org-1",
    entityId: "entity-1",
    generatedBy: "user-1",
    type: "custom_report",
    attemptId: "00000000-0000-4000-8000-000000000099",
    recoveryAttemptedAt: null,
    format: "csv_bundle",
    status: "pending",
    title: "Grant view",
    fileName: "grant-view.csv",
    fileKey: "org-1/custom_report/report-1/grant-view.csv",
    fileSizeBytes: null,
    metadata: {
      preview: { kind: "csv", title: "Grant view", content: "Name\nAlpha" },
      reportBuilder: { definitionId: "definition-1", requestedTitle: null, entity: "grants" },
    },
    grantId: null,
    fundId: null,
    donationId: null,
    fiscalYear: null,
    createdAt: now,
    ...overrides,
  };
}

function thenableRows<T>(rows: T[]) {
  return {
    orderBy: vi.fn(async () => rows),
    then: (resolve: (value: T[]) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
  };
}

function queryContainsValue(
  value: unknown,
  expected: string,
  seen = new WeakSet<object>(),
): boolean {
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if ("value" in value && (value as { value?: unknown }).value === expected) {
    return true;
  }
  return Object.values(value).some((entry) => queryContainsValue(entry, expected, seen));
}

function buildDb(
  options: {
    selectResults?: unknown[][];
    insertRows?: unknown[][];
    updateRows?: unknown[][];
    definitions?: unknown[];
    contacts?: unknown[];
    grants?: unknown[];
    funds?: unknown[];
    donations?: unknown[];
    organization?: unknown;
    generatedReport?: unknown;
    generatedReports?: unknown[];
    insertError?: unknown;
    generatedReportsToRecover?: unknown[];
  } = {},
) {
  const selectResults = [...(options.selectResults ?? [])];
  const insertRows = [...(options.insertRows ?? [])];
  const generatedReportRows = [...(options.generatedReports ?? [])];
  const updateRows = [...(options.updateRows ?? [])];
  const query = {
    contacts: { findMany: vi.fn(async () => options.contacts ?? []) },
    grants: { findMany: vi.fn(async () => options.grants ?? []) },
    funds: { findMany: vi.fn(async () => options.funds ?? []) },
    donations: { findMany: vi.fn(async () => options.donations ?? []) },
    savedReportDefinitions: {
      findMany: vi.fn(async () => options.definitions ?? []),
      findFirst: vi.fn(async () => options.definitions?.[0]),
    },
    generatedReports: {
      findFirst: vi.fn(async () =>
        options.generatedReports ? generatedReportRows.shift() : options.generatedReport,
      ),
      findMany: vi.fn(async () => options.generatedReportsToRecover ?? []),
    },
  };
  if ("organization" in options) {
    Object.assign(query, {
      organizations: { findFirst: vi.fn(async () => options.organization) },
    });
  }
  return {
    query,
    select: vi.fn(() => ({
      from: vi.fn(() => {
        const query = {
          innerJoin: vi.fn(() => query),
          where: vi.fn(() => thenableRows(selectResults.shift() ?? [])),
        };
        return query;
      }),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => {
          if (options.insertError) throw options.insertError;
          return insertRows.shift() ?? [];
        }),
        onConflictDoNothing: vi.fn(async () => []),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => updateRows.shift() ?? []),
        })),
      })),
    })),
  };
}

describe("report-builder service helpers", () => {
  beforeEach(() => {
    storagePut.mockClear();
    analyticsCapture.mockClear();
    vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");
  });

  it("formats known report builder column labels for humans", () => {
    expect(getReportBuilderColumnLabel("amountCents")).toBe("Amount");
    expect(getReportBuilderColumnLabel("netAssetClass")).toBe("Net asset class");
    expect(getReportBuilderColumnLabel("custom:field-1", "Program Site")).toBe("Program Site");
    expect(getReportBuilderColumnLabel("unknownColumn")).toBe("Unknown Column");
  });

  it("escapes CSV cells and preserves selected column order", () => {
    const csv = buildReportBuilderCsv({
      columns: [
        { id: "name", label: "Name" },
        { id: "notes", label: "Notes" },
        { id: "empty", label: "Empty" },
      ],
      rows: [
        { name: "Grant A", notes: "Clean" },
        { name: "Grant, B", notes: "Line\nbreak", empty: null },
      ],
      totalRows: 2,
    });

    expect(csv).toBe('Name,Notes,Empty\nGrant A,Clean,\n"Grant, B","Line\nbreak",');
  });

  it("neutralizes formula-like CSV headers and values", () => {
    const csv = buildReportBuilderCsv({
      columns: [
        { id: "name", label: "Name" },
        { id: "custom:field-1", label: "=HYPERLINK(1,2)" },
      ],
      rows: [
        {
          name: "\t=cmd()",
          "custom:field-1": "@SUM(A1)",
        },
      ],
      totalRows: 1,
    });

    expect(csv).toBe(`Name,"'=HYPERLINK(1,2)"\n'\t=cmd(),'@SUM(A1)`);
  });

  it("normalizes persisted rows into API definitions", () => {
    const row = toReportBuilderDefinition({
      id: "definition-1",
      name: "Grant view",
      description: null,
      entity: "grants",
      columns: ["name"],
      customFieldIds: ["field-1"],
      filters: [],
      sort: [],
      createdBy: "user-1",
      createdAt: new Date("2026-06-18T00:00:00.000Z"),
      updatedAt: new Date("2026-06-18T01:00:00.000Z"),
    });

    expect(row).toMatchObject({
      id: "definition-1",
      entity: "grants",
      createdAt: "2026-06-18T00:00:00.000Z",
    });
    expect(row).not.toHaveProperty("description");
  });

  it("builds metadata with custom fields attached to the right entity", async () => {
    const db = buildDb({
      selectResults: [
        [
          { id: "field-1", entityType: "grant", name: "Grant cycle", fieldType: "text" },
          { id: "field-2", entityType: "contact", name: "Region", fieldType: "select" },
          { id: "ignored", entityType: "project", name: "Ignored", fieldType: "text" },
        ],
      ],
    });

    const metadata = await getReportBuilderMetadata(db as never, { orgId: "org-1" });

    expect(metadata.entities.grants.customFields).toEqual([
      { id: "field-1", entity: "grants", name: "Grant cycle", fieldType: "text" },
    ]);
    expect(metadata.entities.donors.customFields).toEqual([
      { id: "field-2", entity: "donors", name: "Region", fieldType: "select" },
    ]);

    const scopedMetadata = await getReportBuilderMetadata(db as never, {
      orgId: "org-1",
      allowedEntities: ["grants", "funds"],
    });

    expect(scopedMetadata.entities.donors.columns).toEqual([]);
    expect(scopedMetadata.entities.donors.customFields).toEqual([]);
  });

  it("lists, creates, updates, and soft-deletes report definitions", async () => {
    const db = buildDb({
      selectResults: [[persistedDefinition()]],
      insertRows: [[persistedDefinition({ id: "created-1", name: "Created view" })]],
      updateRows: [
        [persistedDefinition({ id: "updated-1", name: "Updated view" })],
        [{ id: "deleted-1" }],
      ],
      definitions: [persistedDefinition()],
    });

    await expect(listReportDefinitions(db as never, { orgId: "org-1" })).resolves.toHaveLength(1);
    await expect(
      listReportDefinitions(db as never, { orgId: "org-1", entity: "grants" }),
    ).resolves.toHaveLength(0);
    await expect(
      createReportDefinition(db as never, {
        orgId: "org-1",
        userId: "user-1",
        data: {
          name: "Created view",
          entity: "grants",
          columns: ["name"],
          customFieldIds: [],
          filters: [],
          sort: [],
        },
      }),
    ).resolves.toMatchObject({ id: "created-1" });
    await expect(
      updateReportDefinition(db as never, {
        orgId: "org-1",
        definitionId: "definition-1",
        data: { name: "Updated view", filters: [], sort: [] },
      }),
    ).resolves.toMatchObject({ id: "updated-1" });
    await expect(
      deleteReportDefinition(db as never, { orgId: "org-1", definitionId: "definition-1" }),
    ).resolves.toBeUndefined();
  });

  it("rejects partial updates that would make saved columns invalid for the entity", async () => {
    const db = buildDb({
      definitions: [persistedDefinition({ entity: "grants", columns: ["name"] })],
    });

    await expect(
      updateReportDefinition(db as never, {
        orgId: "org-1",
        definitionId: "definition-1",
        data: { columns: ["email"], filters: [], sort: [] },
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "email is not available for grants reports.",
    });
  });

  it("hides saved definitions outside the caller's allowed entities during update", async () => {
    const db = buildDb({
      definitions: [persistedDefinition({ entity: "donors", columns: ["email"] })],
    });

    await expect(
      updateReportDefinition(db as never, {
        orgId: "org-1",
        definitionId: "definition-1",
        data: { name: "Donor report", filters: [], sort: [] },
        allowedEntities: ["grants", "funds"],
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects custom fields outside the org and entity", async () => {
    const db = buildDb({ selectResults: [[]] });

    await expect(
      createReportDefinition(db as never, {
        orgId: "org-1",
        userId: "user-1",
        data: {
          name: "Created view",
          entity: "grants",
          columns: ["name"],
          customFieldIds: ["foreign-field"],
          filters: [],
          sort: [],
        },
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "One or more custom fields are not available for this report.",
    });
  });

  it("throws not found when updates, deletes, or generated inserts miss rows", async () => {
    const db = buildDb({
      updateRows: [[], []],
      definitions: [persistedDefinition({ customFieldIds: [] })],
      grants: [],
      insertRows: [[]],
    });

    await expect(
      updateReportDefinition(db as never, {
        orgId: "org-1",
        definitionId: "missing",
        data: { name: "Missing", filters: [], sort: [] },
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      deleteReportDefinition(db as never, { orgId: "org-1", definitionId: "missing" }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      runReportDefinition(
        db as never,
        { R2: {} as never, APP_URL: "https://app.test", INTEGRATION_MODE: "mock" },
        {
          orgId: "org-1",
          userId: "user-1",
          definitionId: "definition-1",
          data: { attemptId: "00000000-0000-4000-8000-000000000099" },
        },
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("previews donor rows with filters, sorting, fallback names, and custom fields", async () => {
    const db = buildDb({
      contacts: [
        {
          id: "contact-0",
          firstName: null,
          lastName: null,
          organizationName: null,
          email: null,
          phone: null,
          type: "individual",
          pipelineStage: null,
          emailOptOut: false,
          createdAt: now,
          deletedAt: null,
        },
        {
          id: "contact-1",
          firstName: "Ada",
          lastName: "Lovelace",
          organizationName: null,
          email: "ada@example.org",
          phone: null,
          type: "individual",
          pipelineStage: "active",
          emailOptOut: false,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          deletedAt: null,
        },
        {
          id: "contact-2",
          firstName: null,
          lastName: null,
          organizationName: "",
          email: "fallback@example.org",
          phone: "555-0100",
          type: "organization",
          pipelineStage: "lead",
          emailOptOut: true,
          createdAt: "bad-date",
          deletedAt: null,
        },
      ],
      selectResults: [
        [{ id: "field-1", name: "Region" }],
        [{ entityId: "contact-1", fieldId: "field-1", value: "North" }],
        [{ id: "field-1", name: "Region" }],
      ],
    });

    const preview = await previewReportDefinition(db as never, {
      orgId: "org-1",
      data: {
        entity: "donors",
        columns: ["displayName", "email", "phone", "createdAt"],
        customFieldIds: ["field-1"],
        filters: [{ field: "email", operator: "is_not_empty" }],
        sort: [{ field: "displayName", direction: "desc" }],
        limit: 10,
      },
    });

    expect(preview.columns.at(-1)).toEqual({ id: "custom:field-1", label: "Region" });
    expect(preview.rows[0]).toMatchObject({
      displayName: "fallback@example.org",
      createdAt: null,
    });
    expect(preview.rows[1]).toMatchObject({ "custom:field-1": "North" });
    expect(preview.totalRows).toBe(2);
  });

  it("previews grants, funds, and donations across filters and computed fields", async () => {
    const grantDb = buildDb({
      grants: [
        {
          id: "grant-1",
          name: "Alpha Grant",
          status: "active",
          funder: { name: "State Fund" },
          amountCents: 5000,
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          endDate: null,
          applicationDeadline: "bad-date",
          createdAt: now,
        },
      ],
    });
    const fundDb = buildDb({
      funds: [
        {
          id: "fund-1",
          name: "Operating",
          type: "restricted",
          grantAllocations: [
            { allocatedAmountCents: 3000, deletedAt: null },
            { allocatedAmountCents: 9000, deletedAt: now },
          ],
          expenses: [
            { amountCents: 750, deletedAt: null },
            { amountCents: 900, deletedAt: now },
          ],
          createdAt: now,
        },
        {
          id: "fund-2",
          name: "Empty Fund",
          type: "unrestricted",
          createdAt: now,
        },
      ],
    });
    const donationDb = buildDb({
      donations: [
        {
          id: "donation-0",
          contact: null,
          amountCents: 100,
          date: null,
          type: "cash",
          restriction: null,
          netAssetClass: null,
          fundId: null,
          grantId: null,
          receiptSent: false,
        },
        {
          id: "donation-1",
          contact: { firstName: null, lastName: null, organizationName: "Main Donor" },
          amountCents: 2500,
          date: now,
          type: "cash",
          restriction: "restricted",
          netAssetClass: "with_donor_restrictions",
          fundId: "fund-1",
          grantId: "grant-1",
          receiptSent: true,
        },
      ],
      selectResults: [
        [{ id: "fund-1", name: "Operating" }],
        [{ id: "grant-1", name: "Alpha Grant" }],
      ],
    });

    await expect(
      previewReportDefinition(grantDb as never, {
        orgId: "org-1",
        data: {
          entity: "grants",
          columns: ["name", "amountCents", "applicationDeadline"],
          customFieldIds: [],
          filters: [{ field: "amountCents", operator: "gte", value: "1000" }],
          sort: [{ field: "name", direction: "asc" }],
          limit: 5,
        },
      }),
    ).resolves.toMatchObject({ rows: [{ name: "Alpha Grant", applicationDeadline: null }] });
    await expect(
      previewReportDefinition(fundDb as never, {
        orgId: "org-1",
        data: {
          entity: "funds",
          columns: ["name", "balanceCents", "restriction"],
          customFieldIds: [],
          filters: [{ field: "balanceCents", operator: "lte", value: "3000" }],
          sort: [],
          limit: 5,
        },
      }),
    ).resolves.toMatchObject({
      rows: [
        { balanceCents: 2250, restriction: "restricted" },
        { balanceCents: 0, restriction: "unrestricted" },
      ],
    });
    await expect(
      previewReportDefinition(donationDb as never, {
        orgId: "org-1",
        data: {
          entity: "donations",
          columns: ["donorName", "fundName", "grantName", "receiptSent"],
          customFieldIds: [],
          filters: [{ field: "fundName", operator: "is_empty" }],
          sort: [],
          limit: 5,
        },
      }),
    ).resolves.toMatchObject({
      rows: [
        {
          donorName: "Donor",
          fundName: null,
          grantName: null,
          receiptSent: false,
        },
      ],
    });
  });

  it("returns stable preview rows when filters and sorts are omitted", async () => {
    const db = buildDb({
      grants: [
        {
          id: "grant-1",
          name: "Alpha Grant",
          status: "active",
          funder: null,
          amountCents: 5000,
          startDate: null,
          endDate: null,
          applicationDeadline: null,
          createdAt: now,
        },
      ],
    });

    const preview = await previewReportDefinition(db as never, {
      orgId: "org-1",
      data: {
        entity: "grants",
        columns: ["name"],
        customFieldIds: [],
        limit: 5,
      } as never,
    });

    expect(preview.rows).toEqual([{ name: "Alpha Grant" }]);
  });

  it.each(["grants", "funds"] as const)(
    "scopes %s preview source rows to the active accounting entity",
    async (entity) => {
      const db = buildDb({ grants: [], funds: [] });

      await previewReportDefinition(db as never, {
        orgId: "org-1",
        entityId: "entity-active",
        data: {
          entity,
          columns: ["name"],
          customFieldIds: [],
          filters: [],
          sort: [],
          limit: 10,
        },
      });

      const findMany = db.query[entity].findMany as ReturnType<typeof vi.fn>;
      expect(queryContainsValue(findMany.mock.calls[0]?.[0]?.where, "entity-active")).toBe(true);
    },
  );

  it("scopes entity-bearing fund balance children to the active entity", async () => {
    const db = buildDb({ funds: [] });

    await previewReportDefinition(db as never, {
      orgId: "org-1",
      entityId: "entity-active",
      data: {
        entity: "funds",
        columns: ["name", "balanceCents"],
        customFieldIds: [],
        filters: [],
        sort: [],
        limit: 10,
      },
    });

    const findMany = db.query.funds.findMany as ReturnType<typeof vi.fn>;
    const relationConfig = findMany.mock.calls[0]?.[0]?.with;
    expect(queryContainsValue(relationConfig?.grantAllocations?.where, "entity-active")).toBe(true);
    expect(queryContainsValue(relationConfig?.expenses?.where, "entity-active")).toBe(true);
  });

  it("excludes donations attributed to a sibling entity from an active-entity preview", async () => {
    const db = buildDb({
      organization: { id: "org-1", defaultEntityId: "entity-default" },
      donations: [
        {
          id: "donation-foreign",
          contact: null,
          fundId: "fund-foreign",
          grantId: null,
          amountCents: 100,
          date: now,
          type: "one_time",
          restriction: "restricted",
          netAssetClass: "temporarily_restricted",
          receiptSent: false,
        },
        {
          id: "donation-active",
          contact: null,
          fundId: "fund-active",
          grantId: null,
          amountCents: 200,
          date: now,
          type: "one_time",
          restriction: "restricted",
          netAssetClass: "temporarily_restricted",
          receiptSent: false,
        },
        {
          id: "donation-unlinked",
          contact: null,
          fundId: null,
          grantId: null,
          amountCents: 300,
          date: now,
          type: "one_time",
          restriction: "unrestricted",
          netAssetClass: "unrestricted",
          receiptSent: false,
        },
      ],
      selectResults: [[{ id: "fund-active", name: "Active fund" }], []],
    });

    const preview = await previewReportDefinition(db as never, {
      orgId: "org-1",
      entityId: "entity-active",
      data: {
        entity: "donations",
        columns: ["amountCents", "fundName"],
        customFieldIds: [],
        filters: [],
        sort: [],
        limit: 10,
      },
    });

    const donationWhere = (db.query.donations.findMany as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0]?.where;
    const rendered = new PgDialect().sqlToQuery(
      donationWhere as Parameters<PgDialect["sqlToQuery"]>[0],
    );
    expect(rendered.params).toContain("entity-active");
    expect(preview.rows).toEqual([{ amountCents: 200, fundName: "Active fund" }]);
  });

  it("covers unmatched filters, missing joins, and ascending sort comparisons", async () => {
    const sortedGrantDb = buildDb({
      grants: [
        {
          id: "grant-2",
          name: "Beta Grant",
          status: "active",
          funder: null,
          amountCents: 2000,
          startDate: null,
          endDate: null,
          applicationDeadline: null,
          createdAt: now,
        },
        {
          id: "grant-1",
          name: "Alpha Grant",
          status: "active",
          funder: null,
          amountCents: 5000,
          startDate: null,
          endDate: null,
          applicationDeadline: null,
          createdAt: now,
        },
      ],
    });
    const unmatchedFilterDb = buildDb({
      grants: [
        {
          id: "grant-1",
          name: "Alpha Grant",
          status: "active",
          funder: null,
          amountCents: 5000,
          startDate: null,
          endDate: null,
          applicationDeadline: null,
          createdAt: now,
        },
      ],
    });
    const missingJoinDb = buildDb({
      donations: [
        {
          id: "donation-1",
          contact: null,
          amountCents: 100,
          date: null,
          type: "cash",
          restriction: null,
          netAssetClass: null,
          fundId: "missing-fund",
          grantId: "missing-grant",
          receiptSent: false,
        },
      ],
      selectResults: [[], []],
    });

    await expect(
      previewReportDefinition(sortedGrantDb as never, {
        orgId: "org-1",
        data: {
          entity: "grants",
          columns: ["name"],
          customFieldIds: [],
          filters: [],
          sort: [{ field: "name", direction: "asc" }],
          limit: 5,
        },
      }),
    ).resolves.toMatchObject({ rows: [{ name: "Alpha Grant" }, { name: "Beta Grant" }] });
    await expect(
      previewReportDefinition(unmatchedFilterDb as never, {
        orgId: "org-1",
        data: {
          entity: "grants",
          columns: ["name", "amountCents"],
          customFieldIds: [],
          filters: [
            { field: "name", operator: "contains", value: "Zeta" },
            { field: "amountCents", operator: "lte", value: "100" },
          ],
          sort: [],
          limit: 5,
        },
      }),
    ).resolves.toMatchObject({ rows: [] });
    await expect(
      previewReportDefinition(missingJoinDb as never, {
        orgId: "org-1",
        data: {
          entity: "donations",
          columns: ["fundName", "grantName"],
          customFieldIds: [],
          filters: [{ field: "fundName", operator: "is_empty" }],
          sort: [{ field: "fundName", direction: "asc" }],
          limit: 5,
        },
      }),
    ).resolves.toMatchObject({ rows: [] });
  });

  it("runs a saved definition, stores CSV, and records a generated artifact", async () => {
    const onFirstReady = vi.fn();
    const db = buildDb({
      definitions: [
        persistedDefinition({
          name: "Grant Export",
          columns: ["name", "amountCents"],
          filters: [{ field: "name", operator: "equals", value: "Alpha Grant" }],
          sort: [{ field: "amountCents", direction: "desc" }],
        }),
      ],
      grants: [
        {
          id: "grant-1",
          name: "Alpha Grant",
          status: "active",
          funder: null,
          amountCents: 5000,
          startDate: null,
          endDate: null,
          applicationDeadline: null,
          createdAt: now,
        },
      ],
      organization: { id: "org-1", defaultEntityId: "entity-default-1" },
      insertRows: [
        [
          {
            id: "report-1",
            type: "custom_report",
            format: "csv_bundle",
            status: "ready",
            title: "Board Export",
            fileName: "board-export.csv",
            metadata: { reportBuilder: { totalRows: 1 } },
            createdAt: now,
          },
        ],
      ],
      updateRows: [[{ status: "ready" }]],
    });

    const artifact = await runReportDefinition(
      db as never,
      { R2: {} as never, APP_URL: "https://app.test", INTEGRATION_MODE: "mock" },
      {
        orgId: "org-1",
        userId: "user-1",
        definitionId: "definition-1",
        data: {
          title: "Board Export",
          attemptId: "00000000-0000-4000-8000-000000000099",
        },
        onFirstReady,
      },
    );

    expect(storagePut).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "org-1/custom_report/00000000-0000-4000-8000-000000000001/board-export.csv",
        body: "Name,Amount\nAlpha Grant,5000",
        source: {
          orgId: "org-1",
          entityType: "saved_report_definition",
          entityId: "definition-1",
        },
      }),
    );
    expect(artifact).toMatchObject({
      id: "report-1",
      downloadPath: "/api/compliance/reports/report-1/download",
      internalPath: "/reports/report-1",
    });
    expect(onFirstReady).toHaveBeenCalledOnce();
    expect(onFirstReady).toHaveBeenCalledWith(expect.objectContaining({ id: "report-1" }));
    expect(
      (db.query as unknown as { organizations: { findFirst: ReturnType<typeof vi.fn> } })
        .organizations.findFirst,
    ).toHaveBeenCalledOnce();
  });

  it("persists a pending custom report before storage and leaves it resumable on failure", async () => {
    const onFirstReady = vi.fn();
    storagePut.mockRejectedValueOnce(new Error("R2 unavailable"));
    const db = buildDb({
      definitions: [persistedDefinition({ columns: ["name"], filters: [], sort: [] })],
      grants: [],
      organization: { id: "org-1", defaultEntityId: "entity-default-1" },
      insertRows: [[{ id: "report-pending", createdAt: now }]],
    });

    await expect(
      runReportDefinition(
        db as never,
        { R2: {} as never, APP_URL: "https://app.test", INTEGRATION_MODE: "mock" },
        {
          orgId: "org-1",
          userId: "user-1",
          definitionId: "definition-1",
          data: { attemptId: "00000000-0000-4000-8000-000000000099" },
          onFirstReady,
        },
      ),
    ).rejects.toThrow("R2 unavailable");

    const values = db.insert.mock.results[0]?.value.values;
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "00000000-0000-4000-8000-000000000001",
        attemptId: "00000000-0000-4000-8000-000000000099",
        status: "pending",
      }),
    );
    expect(db.update).not.toHaveBeenCalled();
    expect(onFirstReady).not.toHaveBeenCalled();
  });

  it("resumes an existing pending custom report without inserting a duplicate", async () => {
    const onFirstReady = vi.fn();
    const pendingReport = {
      id: "report-pending",
      orgId: "org-1",
      entityId: "entity-1",
      generatedBy: "user-1",
      type: "custom_report",
      attemptId: "00000000-0000-4000-8000-000000000099",
      format: "csv_bundle",
      status: "pending",
      title: "Board Export",
      fileName: "board-export.csv",
      fileKey: "org-1/custom_report/report-pending/board-export.csv",
      fileSizeBytes: null,
      metadata: {
        preview: { kind: "csv", title: "Board Export", content: "Name\nAlpha" },
        reportBuilder: {
          definitionId: "definition-1",
          requestedTitle: "Board Export",
          entity: "grants",
        },
      },
      grantId: null,
      fundId: null,
      donationId: null,
      fiscalYear: null,
      createdAt: now,
    };
    const db = buildDb({
      generatedReport: pendingReport,
      definitions: [persistedDefinition()],
      updateRows: [[{ status: "ready" }]],
    });

    const artifact = await runReportDefinition(
      db as never,
      { R2: {} as never, APP_URL: "https://app.test", INTEGRATION_MODE: "mock" },
      {
        orgId: "org-1",
        userId: "user-1",
        definitionId: "definition-1",
        data: {
          attemptId: "00000000-0000-4000-8000-000000000099",
          title: "Board Export",
        },
        onFirstReady,
      },
    );

    expect(db.insert).not.toHaveBeenCalled();
    expect(storagePut).toHaveBeenCalledWith(
      expect.objectContaining({
        key: pendingReport.fileKey,
        body: "Name\nAlpha",
      }),
    );
    expect(artifact).toMatchObject({ id: "report-pending", status: "ready" });
    expect(onFirstReady).toHaveBeenCalledOnce();
  });

  it.each(["pending", "ready"])(
    "does not replay a %s custom report from a different active entity",
    async (status) => {
      const oldReport = persistedGeneratedReport({ status, entityId: "entity-1" });
      const db = buildDb({
        definitions: [persistedDefinition()],
        grants: [],
        organization: { id: "org-1", defaultEntityId: "entity-1" },
        insertRows: [[{ id: "report-entity-2", createdAt: now }]],
        updateRows: [[{ status: "ready", entityId: "entity-2" }]],
      });
      const findFirst = (
        db.query.generatedReports.findFirst as ReturnType<typeof vi.fn>
      ).mockImplementation(async ({ where }: { where: unknown }) =>
        queryContainsValue(where, "entity-2") ? undefined : oldReport,
      );

      const artifact = await runReportDefinition(db as never, {} as never, {
        orgId: "org-1",
        entityId: "entity-2",
        userId: "user-1",
        definitionId: "definition-1",
        data: { attemptId: "00000000-0000-4000-8000-000000000099" },
      });

      expect(findFirst).toHaveBeenCalled();
      expect(artifact.id).toBe("report-entity-2");
      expect(db.insert).toHaveBeenCalledOnce();
    },
  );

  it("rejects reuse of an attempt for a different report definition", async () => {
    const db = buildDb({
      definitions: [persistedDefinition()],
      generatedReport: {
        id: "report-other",
        type: "custom_report",
        attemptId: "00000000-0000-4000-8000-000000000099",
        status: "ready",
        metadata: {
          preview: { title: "Grant view" },
          reportBuilder: {
            definitionId: "other-definition",
            requestedTitle: null,
            entity: "grants",
          },
        },
      },
    });

    await expect(
      runReportDefinition(db as never, {} as never, {
        orgId: "org-1",
        userId: "user-1",
        definitionId: "definition-1",
        data: { attemptId: "00000000-0000-4000-8000-000000000099" },
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Export attempt does not match this request",
    });
    expect(storagePut).not.toHaveBeenCalled();
  });

  it("rejects an idempotency row with missing request identity metadata", async () => {
    const db = buildDb({
      definitions: [persistedDefinition()],
      generatedReport: persistedGeneratedReport({ metadata: null }),
    });

    await expect(
      runReportDefinition(db as never, {} as never, {
        orgId: "org-1",
        userId: "user-1",
        definitionId: "definition-1",
        data: { attemptId: "00000000-0000-4000-8000-000000000099" },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("returns an already-ready matching attempt without rewriting storage", async () => {
    const db = buildDb({
      definitions: [],
      generatedReport: persistedGeneratedReport({ status: "ready" }),
    });

    await expect(
      runReportDefinition(db as never, {} as never, {
        orgId: "org-1",
        userId: "user-1",
        definitionId: "definition-1",
        data: { attemptId: "00000000-0000-4000-8000-000000000099" },
        allowedEntities: ["grants"],
      }),
    ).resolves.toMatchObject({ id: "report-1", status: "ready" });
    expect(db.query.savedReportDefinitions.findFirst).not.toHaveBeenCalled();
    expect(storagePut).not.toHaveBeenCalled();
  });

  it("does not return an existing attempt for a disallowed persisted entity", async () => {
    const db = buildDb({
      generatedReport: persistedGeneratedReport({
        metadata: {
          preview: { title: "Grant view", content: "Name\nAlpha" },
          reportBuilder: {
            definitionId: "definition-1",
            requestedTitle: null,
            entity: "donors",
          },
        },
      }),
    });

    await expect(
      runReportDefinition(db as never, {} as never, {
        orgId: "org-1",
        userId: "user-1",
        definitionId: "definition-1",
        data: { attemptId: "00000000-0000-4000-8000-000000000099" },
        allowedEntities: ["grants"],
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects a pending matching attempt whose stored CSV is malformed", async () => {
    const db = buildDb({
      definitions: [persistedDefinition()],
      generatedReport: persistedGeneratedReport({
        metadata: {
          preview: { title: "Grant view", content: 42 },
          reportBuilder: { definitionId: "definition-1", requestedTitle: null, entity: "grants" },
        },
      }),
    });

    await expect(
      runReportDefinition(db as never, {} as never, {
        orgId: "org-1",
        userId: "user-1",
        definitionId: "definition-1",
        data: { attemptId: "00000000-0000-4000-8000-000000000099" },
      }),
    ).rejects.toMatchObject({ status: 400, message: "Pending report cannot be resumed" });
  });

  it.each([
    [
      "a non-unique insert failure",
      Object.assign(new Error("database offline"), { code: "57P01" }),
    ],
    [
      "a unique collision without a visible winner",
      Object.assign(new Error("duplicate"), { code: "23505" }),
    ],
  ])("preserves %s", async (_label, insertError) => {
    const db = buildDb({
      definitions: [persistedDefinition()],
      generatedReports: [undefined, undefined],
      grants: [],
      organization: { id: "org-1", defaultEntityId: "entity-1" },
      insertError,
    });

    await expect(
      runReportDefinition(db as never, {} as never, {
        orgId: "org-1",
        userId: "user-1",
        definitionId: "definition-1",
        data: { attemptId: "00000000-0000-4000-8000-000000000099" },
      }),
    ).rejects.toBe(insertError);
  });

  it("returns the ready winner after a concurrent unique collision", async () => {
    const winner = persistedGeneratedReport({ id: "report-winner", status: "ready" });
    const db = buildDb({
      definitions: [persistedDefinition()],
      generatedReports: [undefined, winner],
      grants: [],
      organization: { id: "org-1", defaultEntityId: "entity-1" },
      insertError: Object.assign(new Error("duplicate"), { code: "23505" }),
    });

    await expect(
      runReportDefinition(db as never, {} as never, {
        orgId: "org-1",
        userId: "user-1",
        definitionId: "definition-1",
        data: { attemptId: "00000000-0000-4000-8000-000000000099" },
      }),
    ).resolves.toMatchObject({ id: "report-winner", status: "ready" });
    expect(storagePut).not.toHaveBeenCalled();
  });

  it("rejects a concurrent winner whose persisted entity is not allowed", async () => {
    const winner = persistedGeneratedReport({
      id: "report-winner",
      status: "ready",
      metadata: {
        preview: { title: "Grant view", content: "Name\nAlpha" },
        reportBuilder: {
          definitionId: "definition-1",
          requestedTitle: null,
          entity: "donors",
        },
      },
    });
    const db = buildDb({
      definitions: [persistedDefinition()],
      generatedReports: [undefined, winner],
      grants: [],
      organization: { id: "org-1", defaultEntityId: "entity-1" },
      insertError: Object.assign(new Error("duplicate"), { code: "23505" }),
    });

    await expect(
      runReportDefinition(db as never, {} as never, {
        orgId: "org-1",
        userId: "user-1",
        definitionId: "definition-1",
        data: { attemptId: "00000000-0000-4000-8000-000000000099" },
        allowedEntities: ["grants"],
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(storagePut).not.toHaveBeenCalled();
  });

  it("resumes the winning report when concurrent inserts collide", async () => {
    const onFirstReady = vi.fn();
    const winner = {
      id: "report-winner",
      orgId: "org-1",
      entityId: "entity-1",
      generatedBy: "user-1",
      type: "custom_report",
      attemptId: "00000000-0000-4000-8000-000000000099",
      format: "csv_bundle",
      status: "pending",
      title: "Grant view",
      fileName: "grant-view.csv",
      fileKey: "org-1/custom_report/report-winner/grant-view.csv",
      fileSizeBytes: null,
      metadata: {
        preview: { kind: "csv", title: "Grant view", content: "Name\nAlpha" },
        reportBuilder: { definitionId: "definition-1", requestedTitle: null, entity: "grants" },
      },
      grantId: null,
      fundId: null,
      donationId: null,
      fiscalYear: null,
      createdAt: now,
    };
    const uniqueError = Object.assign(new Error("duplicate"), { code: "23505" });
    const db = buildDb({
      generatedReports: [undefined, winner],
      definitions: [persistedDefinition({ columns: ["name"], filters: [], sort: [] })],
      grants: [],
      organization: { id: "org-1", defaultEntityId: "entity-1" },
      insertError: uniqueError,
      updateRows: [[{ status: "ready" }]],
    });

    const artifact = await runReportDefinition(
      db as never,
      { R2: {} as never, APP_URL: "https://app.test", INTEGRATION_MODE: "mock" },
      {
        orgId: "org-1",
        userId: "user-1",
        definitionId: "definition-1",
        data: { attemptId: "00000000-0000-4000-8000-000000000099" },
        onFirstReady,
      },
    );

    expect(storagePut).toHaveBeenCalledWith(
      expect.objectContaining({ key: winner.fileKey, body: "Name\nAlpha" }),
    );
    expect(artifact).toMatchObject({ id: "report-winner", status: "ready" });
    expect(onFirstReady).toHaveBeenCalledOnce();
  });

  it("recovers stale attempted exports and ignores legacy null-attempt rows", async () => {
    const recoverable = {
      id: "report-recover",
      orgId: "org-1",
      entityId: "entity-1",
      generatedBy: "user-1",
      type: "custom_report",
      attemptId: "00000000-0000-4000-8000-000000000099",
      format: "csv_bundle",
      status: "pending",
      title: "Grant view",
      fileName: "grant-view.csv",
      fileKey: "org-1/custom_report/report-recover/grant-view.csv",
      fileSizeBytes: null,
      metadata: {
        preview: { kind: "csv", title: "Grant view", content: "Name\nAlpha" },
        reportBuilder: { definitionId: "definition-1", requestedTitle: null, entity: "grants" },
      },
      grantId: null,
      fundId: null,
      donationId: null,
      fiscalYear: null,
      createdAt: now,
    };
    const db = buildDb({
      generatedReportsToRecover: [{ ...recoverable, id: "legacy", attemptId: null }, recoverable],
      updateRows: [
        [
          {
            ...recoverable,
            status: "ready",
            readyEffectsStatus: "pending",
            metadata: { ...recoverable.metadata, recoveredFromPending: true },
          },
        ],
        [
          {
            ...recoverable,
            status: "ready",
            readyEffectsStatus: "sending",
            metadata: { ...recoverable.metadata, recoveredFromPending: true },
          },
        ],
      ],
    });

    await expect(
      recoverPendingCustomReports(
        db as never,
        { R2: {} as never, APP_URL: "https://app.test", INTEGRATION_MODE: "mock" },
        new Date("2026-06-19T00:00:00.000Z"),
      ),
    ).resolves.toBe(1);

    expect(storagePut).toHaveBeenCalledOnce();
    expect(storagePut).toHaveBeenCalledWith(expect.objectContaining({ key: recoverable.fileKey }));
    expect(analyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        eventName: "report_generated",
        payload: expect.objectContaining({ report_type: "custom_report" }),
      }),
    );
    const updateSets = (db.update as ReturnType<typeof vi.fn>).mock.results.flatMap((result) =>
      result.value.set.mock.calls.map(([values]: [Record<string, unknown>]) => values),
    );
    expect(updateSets).toContainEqual(
      expect.objectContaining({
        status: "ready",
        readyEffectsStatus: "pending",
        metadata: expect.objectContaining({ recoveredFromPending: true }),
      }),
    );
    expect(
      analyticsCapture.mock.calls.filter(
        ([request]) => request.eventName === "report_export_recovered",
      ),
    ).toHaveLength(1);
  });

  it("does not count or emit recovery telemetry when another worker wins the transition", async () => {
    const recoverable = persistedGeneratedReport({ id: "report-concurrent" });
    const db = buildDb({ generatedReportsToRecover: [recoverable], updateRows: [[]] });

    await expect(
      recoverPendingCustomReports(
        db as never,
        { R2: {} as never, APP_URL: "https://app.test", INTEGRATION_MODE: "mock" },
        new Date("2026-06-19T00:00:00.000Z"),
      ),
    ).resolves.toBe(0);

    expect(analyticsCapture).not.toHaveBeenCalled();
  });

  it("lets the 26th pending export progress after the first 25 are backed off", async () => {
    const rows = Array.from({ length: 26 }, (_, index) => ({
      id: `report-${index + 1}`,
      orgId: "org-1",
      entityId: "entity-1",
      generatedBy: "user-1",
      type: "custom_report",
      attemptId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      recoveryAttemptedAt: null as Date | null,
      format: "csv_bundle",
      status: "pending",
      title: "Grant view",
      fileName: "grant-view.csv",
      fileKey: `org-1/custom_report/report-${index + 1}/grant-view.csv`,
      fileSizeBytes: null,
      metadata:
        index === 25
          ? {
              preview: { kind: "csv", title: "Grant view", content: "Name\nAlpha" },
              reportBuilder: {
                definitionId: "definition-1",
                requestedTitle: null,
                entity: "grants",
              },
            }
          : { malformed: true },
      grantId: null,
      fundId: null,
      donationId: null,
      fiscalYear: null,
      createdAt: new Date(`2026-06-18T00:${String(index).padStart(2, "0")}:00.000Z`),
    }));
    const findMany = vi.fn(async () =>
      rows
        .filter((row) => row.status === "pending")
        .sort((left, right) =>
          left.recoveryAttemptedAt === right.recoveryAttemptedAt
            ? left.createdAt.getTime() - right.createdAt.getTime()
            : left.recoveryAttemptedAt === null
              ? -1
              : 1,
        )
        .slice(0, 25),
    );
    let failedIndex = 0;
    const update = vi.fn(() => ({
      set: vi.fn((values: { status?: string; recoveryAttemptedAt?: Date }) => ({
        where: vi.fn(() => {
          const result = Object.assign(Promise.resolve([]), {
            returning: vi.fn(async () => [{ status: "ready" }]),
          });
          if (values.recoveryAttemptedAt) {
            rows[failedIndex++]!.recoveryAttemptedAt = values.recoveryAttemptedAt;
          } else if (values.status === "ready") {
            rows[25]!.status = "ready";
          }
          return result;
        }),
      })),
    }));
    const db = { query: { generatedReports: { findMany } }, update } as never;
    const env = {
      R2: {} as never,
      APP_URL: "https://app.test",
      INTEGRATION_MODE: "mock" as const,
    };

    await expect(recoverPendingCustomReports(db, env)).resolves.toBe(0);
    await expect(recoverPendingCustomReports(db, env)).resolves.toBe(1);

    expect(storagePut).toHaveBeenCalledOnce();
    expect(storagePut).toHaveBeenCalledWith(
      expect.objectContaining({ key: "org-1/custom_report/report-26/grant-view.csv" }),
    );
  });

  it("rejects generated report runs when the organization has no default entity", async () => {
    const db = buildDb({
      definitions: [persistedDefinition({ columns: ["name"], filters: [], sort: [] })],
      grants: [],
      organization: { id: "org-1", defaultEntityId: null },
    });

    await expect(
      runReportDefinition(
        db as never,
        { R2: {} as never, APP_URL: "https://app.test", INTEGRATION_MODE: "mock" },
        {
          orgId: "org-1",
          userId: "user-1",
          definitionId: "definition-1",
          data: { attemptId: "00000000-0000-4000-8000-000000000099" },
        },
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: "Organization default entity is required.",
    });
  });

  it("falls back to definition title and report.csv for blank export titles", async () => {
    const db = buildDb({
      definitions: [
        persistedDefinition({
          name: "!!!",
          columns: ["name"],
          filters: [],
          sort: [],
        }),
      ],
      grants: [
        {
          id: "grant-1",
          name: "Alpha Grant",
          status: "active",
          funder: null,
          amountCents: 5000,
          startDate: null,
          endDate: null,
          applicationDeadline: null,
          createdAt: now,
        },
      ],
      insertRows: [
        [
          {
            id: "report-1",
            type: "custom_report",
            format: "csv_bundle",
            status: "ready",
            title: "!!!",
            fileName: "report.csv",
            metadata: null,
            createdAt: now,
          },
        ],
      ],
    });

    const artifact = await runReportDefinition(
      db as never,
      { R2: {} as never, APP_URL: "https://app.test", INTEGRATION_MODE: "mock" },
      {
        orgId: "org-1",
        userId: "user-1",
        definitionId: "definition-1",
        data: {
          title: "   ",
          attemptId: "00000000-0000-4000-8000-000000000099",
        },
      },
    );

    expect(storagePut).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "org-1/custom_report/00000000-0000-4000-8000-000000000001/report.csv",
      }),
    );
    expect(artifact.metadata).toMatchObject({
      reportBuilder: { definitionId: "definition-1", totalRows: 1 },
    });
  });

  it("throws when a saved definition is missing during run", async () => {
    const db = buildDb({ definitions: [] });

    await expect(
      runReportDefinition(
        db as never,
        { R2: {} as never, APP_URL: "https://app.test", INTEGRATION_MODE: "mock" },
        {
          orgId: "org-1",
          userId: "user-1",
          definitionId: "missing",
          data: { attemptId: "00000000-0000-4000-8000-000000000099" },
        },
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("hides saved definitions outside the caller's allowed entities during run", async () => {
    const db = buildDb({
      definitions: [persistedDefinition({ entity: "donors", columns: ["email"] })],
    });

    await expect(
      runReportDefinition(
        db as never,
        { R2: {} as never, APP_URL: "https://app.test", INTEGRATION_MODE: "mock" },
        {
          orgId: "org-1",
          userId: "user-1",
          definitionId: "definition-1",
          data: { attemptId: "00000000-0000-4000-8000-000000000099" },
          allowedEntities: ["grants", "funds"],
        },
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});
