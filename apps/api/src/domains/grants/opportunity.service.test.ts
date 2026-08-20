import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { recordActivityLog } from "../../lib/activity-log";
import {
  createGrantOpportunitySavedSearch,
  createGrantOpportunity,
  convertGrantOpportunity,
  deleteGrantOpportunitySavedSearch,
  dismissGrantOpportunity,
  listGrantOpportunitySavedSearches,
  listGrantOpportunities,
  lookupFoundationProspects,
  normalizeGrantOpportunityRow,
  normalizeGrantsGovOpportunity,
  saveGrantOpportunity,
  searchGrantOpportunities,
  updateGrantOpportunitySavedSearch,
} from "./opportunity.service";

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn(),
}));

function withTransaction<T extends object>(
  dbMock: T,
): T & { transaction: ReturnType<typeof vi.fn> } {
  const wrapped = {
    ...dbMock,
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(wrapped)),
  };
  return wrapped as T & { transaction: ReturnType<typeof vi.fn> };
}

function collectStrings(value: unknown, seen = new WeakSet<object>()): string[] {
  if (typeof value === "string") return [value];
  if (typeof value !== "object" || value === null) return [];
  if (seen.has(value)) return [];
  seen.add(value);

  const record = value as Record<PropertyKey, unknown>;
  const result: string[] = [];
  for (const key of Reflect.ownKeys(record)) {
    result.push(...collectStrings(record[key], seen));
  }
  return result;
}

function mockOpportunityListDb(data: unknown[], countRows: Array<{ count: number }>) {
  const dataOffset = vi.fn().mockResolvedValue(data);
  const dataLimit = vi.fn().mockReturnValue({ offset: dataOffset });
  const dataWhere = vi.fn().mockReturnValue({ limit: dataLimit });
  const dataFrom = vi.fn().mockReturnValue({ where: dataWhere });
  const countWhere = vi.fn().mockResolvedValue(countRows);
  const countFrom = vi.fn().mockReturnValue({ where: countWhere });
  const select = vi.fn((selection?: unknown) =>
    selection === undefined ? { from: dataFrom } : { from: countFrom },
  );

  return {
    db: { select },
    select,
    dataWhere,
    dataLimit,
    dataOffset,
    countWhere,
  };
}

function renderSql(condition: unknown) {
  const dialect = new PgDialect();
  return dialect.sqlToQuery(condition as Parameters<PgDialect["sqlToQuery"]>[0]);
}

describe("normalizeGrantsGovOpportunity", () => {
  it("maps Grants.gov fields into GrantPipe opportunity fields", () => {
    const result = normalizeGrantsGovOpportunity({
      id: "345678",
      number: "HHS-2026-001",
      title: "Community Food Access",
      agency: "Department of Health and Human Services",
      oppStatus: "posted",
      postedDate: "04/15/2026",
      closeDate: "06/30/2026",
      awardFloor: "10000",
      awardCeiling: "50000",
      applicantTypes: ["Nonprofits"],
      fundingCategories: ["Food and Nutrition"],
    });

    expect(result).toMatchObject({
      source: "grants.gov",
      sourceOpportunityId: "345678",
      opportunityNumber: "HHS-2026-001",
      title: "Community Food Access",
      agencyName: "Department of Health and Human Services",
      status: "posted",
      awardFloorCents: 1_000_000,
      awardCeilingCents: 5_000_000,
      eligibleApplicants: ["Nonprofits"],
      fundingCategories: ["Food and Nutrition"],
    });
    expect(result.officialUrl).toContain("345678");
  });

  it("parses numeric Grants.gov award amounts", () => {
    const result = normalizeGrantsGovOpportunity({
      id: "345679",
      awardFloor: 1250.5,
      awardCeiling: 5000,
    });

    expect(result.awardFloorCents).toBe(125050);
    expect(result.awardCeilingCents).toBe(500000);
  });

  it("falls back across alternate field names and ignores malformed values", () => {
    const result = normalizeGrantsGovOpportunity({
      oppId: 12345,
      opportunityNumber: 67890,
      opportunityTitle: "",
      agencyName: null,
      status: "forecasted",
      postedDate: "not-a-date",
      closeDate: "2026-09-30T00:00:00.000Z",
      awardFloor: "$1,250.49",
      awardCeiling: "not-money",
      applicantTypes: ["Nonprofits", "", null],
      fundingCategories: "education",
    });

    expect(result).toMatchObject({
      sourceOpportunityId: "12345",
      opportunityNumber: "67890",
      title: "Untitled opportunity",
      agencyName: "",
      status: "forecasted",
      postedDate: null,
      awardFloorCents: 125049,
      awardCeilingCents: null,
      eligibleApplicants: ["Nonprofits"],
      fundingCategories: undefined,
      officialUrl: "https://www.grants.gov/search-results-detail/12345",
    });
    expect(result.closeDate?.toISOString()).toBe("2026-09-30T00:00:00.000Z");
  });

  it("uses the generic search URL when no source opportunity id exists", () => {
    expect(normalizeGrantsGovOpportunity({}).officialUrl).toBe(
      "https://www.grants.gov/search-grants",
    );
  });
});

describe("normalizeGrantOpportunityRow", () => {
  it("returns persisted opportunity rows unchanged", () => {
    const row = { id: "opp-1", title: "Food Access" };

    expect(normalizeGrantOpportunityRow(row as never)).toBe(row);
  });
});

describe("searchGrantOpportunities", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls Grants.gov search and caches normalized rows", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          totalRecords: 1,
          oppHits: [
            {
              id: "345678",
              number: "HHS-2026-001",
              title: "Community Food Access",
              agency: "HHS",
              oppStatus: "posted",
            },
          ],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const returning = vi.fn().mockResolvedValue([{ id: "opp-1", title: "Community Food Access" }]);
    const onConflictDoUpdate = vi.fn(() => ({ returning }));
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    const db = { insert: vi.fn(() => ({ values })) };

    const result = await searchGrantOpportunities(db as never, {
      orgId: "org-1",
      keyword: "food",
      page: 1,
      pageSize: 25,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/api/search2"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(values).toHaveBeenCalledWith([
      expect.objectContaining({
        orgId: "org-1",
        sourceOpportunityId: "345678",
        title: "Community Food Access",
      }),
    ]);
    expect(result).toEqual({
      data: [{ id: "opp-1", title: "Community Food Access" }],
      total: 1,
      page: 1,
      pageSize: 25,
    });
  });

  it("rejects non-federal filters for live Grants.gov search", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      searchGrantOpportunities({} as never, {
        orgId: "org-1",
        sourceType: "private_foundation",
        page: 1,
        pageSize: 25,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();

    await expect(
      searchGrantOpportunities({} as never, {
        orgId: "org-1",
        funderType: "foundation",
        page: 1,
        pageSize: 25,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes cached fields when Grants.gov returns an existing opportunity", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            totalRecords: 1,
            oppHits: [{ id: "345678", title: "Updated title", closeDate: "07/31/2026" }],
          },
        }),
      }),
    );
    const returning = vi.fn().mockResolvedValue([{ id: "opp-1", title: "Updated title" }]);
    const onConflictDoUpdate = vi.fn(() => ({ returning }));
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    const db = { insert: vi.fn(() => ({ values })) };

    await searchGrantOpportunities(db as never, {
      orgId: "org-1",
      keyword: "food",
      applicantTypes: ["nonprofits"],
      fundingCategories: ["food"],
      closeFrom: "2026-07-01T00:00:00.000Z",
      closeTo: "2026-08-01T00:00:00.000Z",
      page: 1,
      pageSize: 25,
    });

    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          title: expect.anything(),
          closeDate: expect.anything(),
          rawPayload: expect.anything(),
        }),
      }),
    );
  });

  it("returns an empty page without writing when Grants.gov has no hits", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { totalRecords: 0, oppHits: [] } }),
      }),
    );
    const db = { insert: vi.fn() };

    await expect(
      searchGrantOpportunities(db as never, {
        orgId: "org-1",
        page: 3,
        pageSize: 10,
      }),
    ).resolves.toEqual({ data: [], total: 0, page: 3, pageSize: 10 });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("falls back when Grants.gov omits result containers and totals", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      }),
    );
    const db = { insert: vi.fn() };

    await expect(
      searchGrantOpportunities(db as never, {
        orgId: "org-1",
        page: 1,
        pageSize: 25,
      }),
    ).resolves.toEqual({ data: [], total: 0, page: 1, pageSize: 25 });

    const returning = vi.fn().mockResolvedValue([{ id: "opp-1" }]);
    const onConflictDoUpdate = vi.fn(() => ({ returning }));
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    const dbWithInsert = { insert: vi.fn(() => ({ values })) };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            oppHits: [{ id: "345678", title: "Community Food Access" }],
          },
        }),
      }),
    );

    await expect(
      searchGrantOpportunities(dbWithInsert as never, {
        orgId: "org-1",
        page: 1,
        pageSize: 25,
      }),
    ).resolves.toMatchObject({ total: 1 });
  });

  it("throws when Grants.gov rejects the search", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    await expect(
      searchGrantOpportunities({} as never, {
        orgId: "org-1",
        keyword: "food",
        agency: "USDA",
        opportunityStatus: "posted",
        page: 1,
        pageSize: 25,
      }),
    ).rejects.toThrow("Unable to search Grants.gov opportunities");
  });
});

describe("listGrantOpportunities", () => {
  it("returns an empty page when the select API is unavailable", async () => {
    await expect(
      listGrantOpportunities({ query: {} } as never, {
        orgId: "org-1",
        page: 2,
        pageSize: 10,
      }),
    ).resolves.toEqual({ data: [], total: 0, page: 2, pageSize: 10 });
  });

  it("queries cached opportunities with org, search, status, and deadline filters", async () => {
    const { db, dataLimit, dataOffset } = mockOpportunityListDb(
      [{ id: "opp-1", title: "Community Food Access" }],
      [{ count: 42 }],
    );

    const result = await listGrantOpportunities(db as never, {
      orgId: "org-1",
      keyword: "food",
      opportunityStatus: "posted",
      sourceType: "private_foundation",
      funderType: "foundation",
      closeFrom: "2026-06-01T00:00:00.000Z",
      closeTo: "2026-07-01T00:00:00.000Z",
      page: 2,
      pageSize: 10,
    });

    expect(dataLimit).toHaveBeenCalledWith(10);
    expect(dataOffset).toHaveBeenCalledWith(10);
    expect(result).toEqual({
      data: [{ id: "opp-1", title: "Community Food Access" }],
      total: 42,
      page: 2,
      pageSize: 10,
    });
  });

  it("limits tracked opportunities to manual rows and saved or converted federal rows", async () => {
    const { db, dataWhere } = mockOpportunityListDb([], [{ count: 0 }]);

    await listGrantOpportunities(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
    });

    const whereClauseStrings = collectStrings(dataWhere.mock.calls[0]?.[0]);
    expect(whereClauseStrings).toContain("grant_opportunity_actions");
    expect(whereClauseStrings).toContain("saved");
    expect(whereClauseStrings).toContain("converted");
  });

  it("uses the core select builder for opportunity rows to avoid relational aliases", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const { db, select, dataWhere, dataLimit, dataOffset } = mockOpportunityListDb(
      [{ id: "opp-1", title: "Community Food Access" }],
      [{ count: 1 }],
    );
    const dbWithFindMany = { ...db, query: { grantOpportunities: { findMany } } };

    const result = await listGrantOpportunities(dbWithFindMany as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
    });

    expect(findMany).not.toHaveBeenCalled();
    expect(select).toHaveBeenCalledWith();
    expect(dataLimit).toHaveBeenCalledWith(25);
    expect(dataOffset).toHaveBeenCalledWith(0);
    const whereClauseStrings = collectStrings(dataWhere.mock.calls[0]?.[0]);
    const renderedWhere = renderSql(dataWhere.mock.calls[0]?.[0]).sql;
    expect(whereClauseStrings).toContain("grant_opportunity_actions");
    expect(whereClauseStrings).not.toContain('"grantOpportunities"."opportunity_id"');
    expect(renderedWhere).toContain('"grant_opportunity_actions"."opportunity_id"');
    expect(renderedWhere).not.toContain('"grantOpportunities"."opportunity_id"');
    expect(result).toEqual({
      data: [{ id: "opp-1", title: "Community Food Access" }],
      total: 1,
      page: 1,
      pageSize: 25,
    });
  });

  it("returns total matching rows instead of current page length", async () => {
    const { db, select } = mockOpportunityListDb(
      [{ id: "opp-11" }, { id: "opp-12" }],
      [{ count: 37 }],
    );

    const result = await listGrantOpportunities(db as never, {
      orgId: "org-1",
      page: 3,
      pageSize: 2,
    });

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(37);
    expect(select).toHaveBeenCalledWith({ count: expect.anything() });
  });

  it("defaults opportunity list totals when the count query returns no row", async () => {
    const { db } = mockOpportunityListDb([{ id: "opp-11" }], []);

    await expect(
      listGrantOpportunities(db as never, {
        orgId: "org-1",
        page: 1,
        pageSize: 25,
      }),
    ).resolves.toMatchObject({ total: 0 });
  });

  it("adds an agency filter when agency search is provided", async () => {
    const { db, dataWhere } = mockOpportunityListDb([], [{ count: 0 }]);

    await listGrantOpportunities(db as never, {
      orgId: "org-1",
      agency: "Health",
      page: 1,
      pageSize: 25,
    });

    expect(dataWhere).toHaveBeenCalledWith(expect.anything());
  });
});

describe("lookupFoundationProspects", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes ProPublica search results as funder prospect context", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        total_results: 1,
        organizations: [
          {
            ein: 123456789,
            name: "Community Foundation",
            city: "Austin",
            state: "TX",
            ntee_code: "T31",
            subsection_code: 3,
            total_revenue: 1000000,
            total_assets: 5000000,
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await lookupFoundationProspects({
      query: "community",
      state: "TX",
      nteeMajorGroup: 4,
      page: 1,
      pageSize: 25,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining("/nonprofits/api/v2/search.json"),
      }),
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("q=community");
    expect(result).toMatchObject({
      total: 1,
      source: "propublica_nonprofit_explorer",
      data: [
        {
          ein: "123456789",
          name: "Community Foundation",
          city: "Austin",
          state: "TX",
          nteeCode: "T31",
          subsectionCode: "3",
          totalRevenue: 1000000,
          totalAssets: 5000000,
          source: "propublica_nonprofit_explorer",
        },
      ],
    });
    expect(result.data[0]?.sourceUrl).toContain("/organizations/123456789.json");
  });

  it("looks up a single EIN and rejects upstream failures", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        organization: {
          ein: "12-3456789",
          name: "Sample Foundation",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await lookupFoundationProspects({
      ein: "12-3456789",
      page: 1,
      pageSize: 25,
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/organizations/123456789.json");
    expect(result.data[0]).toMatchObject({ ein: "123456789", name: "Sample Foundation" });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(
      lookupFoundationProspects({ query: "foundation", page: 1, pageSize: 25 }),
    ).rejects.toThrow("Unable to lookup foundation prospects");
  });

  it("drops incomplete ProPublica organizations and handles missing EIN payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          organizations: [
            { ein: null, name: "Missing EIN Foundation" },
            { ein: 123456789, name: "   " },
          ],
        }),
      }),
    );

    await expect(lookupFoundationProspects({ page: 1, pageSize: 25 })).resolves.toMatchObject({
      data: [],
      total: 0,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      }),
    );

    await expect(
      lookupFoundationProspects({ ein: "12-3456789", page: 1, pageSize: 25 }),
    ).resolves.toMatchObject({
      data: [],
      total: 0,
    });
  });

  it("uses search defaults and normalizes sparse ProPublica prospect data", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        organizations: [
          {
            ein: "98-7654321",
            name: " Sparse Foundation ",
            total_revenue: "unknown",
            total_assets: null,
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await lookupFoundationProspects({
      page: 2,
      pageSize: 10,
    });

    const url = fetchMock.mock.calls[0]?.[0] as URL;
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.has("q")).toBe(false);
    expect(url.searchParams.has("state[id]")).toBe(false);
    expect(url.searchParams.has("ntee[id]")).toBe(false);
    expect(result).toMatchObject({
      total: 1,
      page: 2,
      pageSize: 10,
      data: [
        {
          ein: "987654321",
          name: "Sparse Foundation",
          city: null,
          state: null,
          nteeCode: null,
          subsectionCode: null,
          totalRevenue: null,
          totalAssets: null,
        },
      ],
    });
  });

  it("handles empty ProPublica search payloads and non-string names", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      }),
    );

    await expect(lookupFoundationProspects({ page: 1, pageSize: 25 })).resolves.toMatchObject({
      data: [],
      total: 0,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          organizations: [{ ein: 123456789, name: null }],
        }),
      }),
    );

    await expect(lookupFoundationProspects({ page: 1, pageSize: 25 })).resolves.toMatchObject({
      data: [],
      total: 0,
    });
  });
});

describe("createGrantOpportunity", () => {
  it("creates a manual opportunity with source metadata and activity log", async () => {
    const returning = vi.fn().mockResolvedValue([
      {
        id: "opp-manual",
        title: "Neighborhood Resilience Fund",
        sourceType: "community_foundation",
      },
    ]);
    const values = vi.fn(() => ({ returning }));
    const db = withTransaction({ insert: vi.fn(() => ({ values })) });

    const result = await createGrantOpportunity(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      title: "Neighborhood Resilience Fund",
      sourceType: "community_foundation",
      sourceName: "Community Foundation of Central Texas",
      sourceUrl: "https://example.org/apply",
      funderType: "foundation",
      deadlineSource: "funder_website",
      closeDate: "2026-08-15T00:00:00.000Z",
      awardFloorCents: 1000000,
      awardCeilingCents: 5000000,
      eligibleApplicants: ["501(c)(3) nonprofits"],
      fundingCategories: ["Community development"],
      notes: "LOI required.",
    });

    expect(result).toMatchObject({
      id: "opp-manual",
      sourceType: "community_foundation",
    });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        source: "manual",
        sourceType: "community_foundation",
        sourceName: "Community Foundation of Central Texas",
        sourceUrl: "https://example.org/apply",
        funderType: "foundation",
        deadlineSource: "funder_website",
        sourceOpportunityId: expect.stringContaining(
          "manual:community_foundation:community-foundation-of-central-texas:title:",
        ),
        officialUrl: "https://example.org/apply",
        closeDate: new Date("2026-08-15T00:00:00.000Z"),
        rawPayload: expect.objectContaining({ notes: "LOI required." }),
      }),
    );
  });

  it("uses a deterministic title source ID for manual opportunities without external IDs", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "opp-manual" }]);
    const values = vi.fn(() => ({ returning }));
    const findFirst = vi.fn().mockResolvedValue(undefined);
    const db = withTransaction({
      query: { grantOpportunities: { findFirst } },
      insert: vi.fn(() => ({ values })),
    });

    await createGrantOpportunity(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      title: "Neighborhood Resilience Fund",
      sourceType: "community_foundation",
      sourceName: "Community Foundation",
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceOpportunityId:
          "manual:community_foundation:community-foundation:title:neighborhood-resilience-fund",
      }),
    );
  });

  it("returns a controlled duplicate error for already tracked manual opportunities", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "existing-opp" });
    const db = { query: { grantOpportunities: { findFirst } }, insert: vi.fn() };

    await expect(
      createGrantOpportunity(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        title: "Neighborhood Resilience Fund",
        sourceType: "community_foundation",
        sourceName: "Community Foundation",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("namespaces manual opportunity external IDs by source", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "opp-manual" }]);
    const values = vi.fn(() => ({ returning }));
    const db = withTransaction({ insert: vi.fn(() => ({ values })) });

    await createGrantOpportunity(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      title: "Neighborhood Resilience Fund",
      sourceType: "private_foundation",
      sourceName: "Community Foundation",
      externalId: "SPRING-2026",
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        externalId: "SPRING-2026",
        sourceOpportunityId: "manual:private_foundation:community-foundation:external:spring-2026",
      }),
    );
  });

  it("throws when the manual opportunity insert does not return a row", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const values = vi.fn(() => ({ returning }));
    const db = withTransaction({ insert: vi.fn(() => ({ values })) });

    await expect(
      createGrantOpportunity(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        title: "Neighborhood Resilience Fund",
        sourceType: "community_foundation",
        sourceName: "Community Foundation",
      }),
    ).rejects.toThrow("Failed to create grant opportunity");
  });

  it("uses manual opportunity defaults when optional metadata is omitted", async () => {
    const returning = vi.fn().mockResolvedValue([
      {
        id: "opp-manual",
        title: "Neighborhood Resilience Fund",
        sourceType: "community_foundation",
      },
    ]);
    const values = vi.fn(() => ({ returning }));
    const db = withTransaction({ insert: vi.fn(() => ({ values })) });

    await createGrantOpportunity(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      title: "Neighborhood Resilience Fund",
      sourceType: "community_foundation",
      sourceName: "Community Foundation",
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        funderType: "other",
        deadlineSource: "manual",
      }),
    );
  });

  it("createGrantOpportunity: transaction called and log fires — happy path atomicity", async () => {
    vi.mocked(recordActivityLog).mockClear();
    const returning = vi
      .fn()
      .mockResolvedValue([
        {
          id: "opp-manual",
          title: "Neighborhood Resilience Fund",
          sourceType: "community_foundation",
        },
      ]);
    const values = vi.fn(() => ({ returning }));
    const db = withTransaction({ insert: vi.fn(() => ({ values })) });

    await createGrantOpportunity(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      title: "Neighborhood Resilience Fund",
      sourceType: "community_foundation",
      sourceName: "Community Foundation",
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordActivityLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "grant_opportunity", action: "created" }),
    );
  });

  it("createGrantOpportunity: rolls back when recordActivityLog throws", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const returning = vi
      .fn()
      .mockResolvedValue([
        {
          id: "opp-manual",
          title: "Neighborhood Resilience Fund",
          sourceType: "community_foundation",
        },
      ]);
    const values = vi.fn(() => ({ returning }));
    const db = withTransaction({ insert: vi.fn(() => ({ values })) });

    await expect(
      createGrantOpportunity(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        title: "Neighborhood Resilience Fund",
        sourceType: "community_foundation",
        sourceName: "Community Foundation",
      }),
    ).rejects.toThrow("audit log down");
  });
});

describe("convertGrantOpportunity", () => {
  it("creates a government funder and grant from a cached opportunity", async () => {
    const opportunity = {
      id: "opp-1",
      orgId: "org-1",
      source: "grants.gov",
      sourceOpportunityId: "345678",
      opportunityNumber: "HHS-2026-001",
      title: "Community Food Access",
      agencyName: "HHS",
      closeDate: new Date("2026-06-30T00:00:00.000Z"),
      awardCeilingCents: 5000000,
    };
    let insertCall = 0;
    const db = {
      query: {
        grantOpportunities: { findFirst: vi.fn().mockResolvedValue(opportunity) },
        funders: { findFirst: vi.fn().mockResolvedValue(null) },
      },
      insert: vi.fn(() => {
        insertCall += 1;
        return {
          values: vi.fn((payload) => ({
            returning: vi
              .fn()
              .mockResolvedValue(
                insertCall === 1
                  ? [{ id: "funder-1", ...payload }]
                  : insertCall === 2
                    ? [{ id: "grant-1", ...payload }]
                    : [{ id: "action-1", ...payload }],
              ),
          })),
        };
      }),
    };

    const result = await convertGrantOpportunity(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      opportunityId: "opp-1",
      status: "application",
    });

    expect(result.grant).toMatchObject({
      id: "grant-1",
      funderId: "funder-1",
      name: "Community Food Access",
      status: "application",
    });
  });

  it("returns the existing converted grant instead of creating a duplicate", async () => {
    const db = {
      query: {
        grantOpportunities: {
          findFirst: vi.fn().mockResolvedValue({ id: "opp-1", orgId: "org-1" }),
        },
        grantOpportunityActions: {
          findFirst: vi.fn().mockResolvedValue({ convertedGrantId: "grant-1" }),
        },
        grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1", name: "Existing" }) },
      },
      insert: vi.fn(),
    };

    const result = await convertGrantOpportunity(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      opportunityId: "opp-1",
      status: "application",
    });

    expect(db.insert).not.toHaveBeenCalled();
    expect(result.grant).toEqual({ id: "grant-1", name: "Existing" });
  });

  it("uses transactions when the database provides one", async () => {
    const tx = {
      query: {
        grantOpportunities: {
          findFirst: vi.fn().mockResolvedValue({
            id: "opp-1",
            orgId: "org-1",
            title: "Clean Water",
            agencyName: null,
            awardCeilingCents: null,
            closeDate: null,
          }),
        },
        grantOpportunityActions: { findFirst: vi.fn().mockResolvedValue(null) },
        funders: { findFirst: vi.fn() },
      },
      insert: vi.fn((table) => ({
        values: vi.fn((payload) => ({
          returning: vi
            .fn()
            .mockResolvedValue(
              table && "name" in table
                ? [{ id: "unknown", ...payload }]
                : [{ id: "row", ...payload }],
            ),
        })),
      })),
    };
    let insertCall = 0;
    tx.insert.mockImplementation(() => {
      insertCall += 1;
      return {
        values: vi.fn((payload) => ({
          returning: vi
            .fn()
            .mockResolvedValue(
              insertCall === 1
                ? [{ id: "funder-1", ...payload }]
                : insertCall === 2
                  ? [{ id: "grant-1", ...payload }]
                  : [{ id: "action-1", ...payload }],
            ),
        })),
      };
    });
    const db = { transaction: vi.fn((work) => work(tx)) };

    const result = await convertGrantOpportunity(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      opportunityId: "opp-1",
      status: "discovery",
      notes: "Review later",
    });

    expect(db.transaction).toHaveBeenCalled();
    expect(result.grant).toMatchObject({
      id: "grant-1",
      name: "Clean Water",
      status: "discovery",
      description: "Clean Water",
      notes: "Review later",
    });
  });

  it("reuses an existing funder and records generated notes when converting", async () => {
    let insertCall = 0;
    const db = {
      query: {
        grantOpportunities: {
          findFirst: vi.fn().mockResolvedValue({
            id: "opp-1",
            orgId: "org-1",
            title: "Food Access",
            agencyName: "HHS",
            opportunityNumber: "HHS-1",
            officialUrl: "https://example.test/apply",
            awardCeilingCents: 1000,
            closeDate: new Date("2026-10-01T00:00:00.000Z"),
          }),
        },
        grantOpportunityActions: { findFirst: vi.fn().mockResolvedValue(null) },
        funders: { findFirst: vi.fn().mockResolvedValue({ id: "funder-1", name: "HHS" }) },
      },
      insert: vi.fn(() => {
        insertCall += 1;
        return {
          values: vi.fn((payload) => ({
            returning: vi
              .fn()
              .mockResolvedValue(
                insertCall === 1
                  ? [{ id: "grant-1", ...payload }]
                  : [{ id: "action-1", ...payload }],
              ),
          })),
        };
      }),
    };

    const result = await convertGrantOpportunity(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      opportunityId: "opp-1",
      status: "application",
    });

    expect(db.query.funders.findFirst).toHaveBeenCalled();
    expect(result.grant).toMatchObject({
      funderId: "funder-1",
      notes: "Opportunity number: HHS-1\nOfficial application: https://example.test/apply",
    });
  });

  it("reuses an existing funder when a non-federal opportunity differs only by casing", async () => {
    const opportunity = {
      id: "opp-1",
      orgId: "org-1",
      source: "manual",
      sourceType: "community_foundation",
      sourceName: "Community Foundation",
      sourceUrl: "https://example.org/apply",
      funderType: "foundation",
      sourceOpportunityId: "manual:community_foundation:community-foundation:title:resilience",
      title: "Neighborhood Resilience Fund",
      agencyName: "community foundation",
    };
    let insertCall = 0;
    const db = {
      query: {
        grantOpportunities: { findFirst: vi.fn().mockResolvedValue(opportunity) },
        grantOpportunityActions: { findFirst: vi.fn().mockResolvedValue(null) },
        funders: {
          findFirst: vi.fn().mockResolvedValue({ id: "funder-1", name: "Community Foundation" }),
        },
      },
      insert: vi.fn(() => {
        insertCall += 1;
        return {
          values: vi.fn((payload) => ({
            returning: vi
              .fn()
              .mockResolvedValue(
                insertCall === 1
                  ? [{ id: "grant-1", ...payload }]
                  : [{ id: "action-1", ...payload }],
              ),
          })),
        };
      }),
    };

    const result = await convertGrantOpportunity(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      opportunityId: "opp-1",
      status: "application",
    });

    expect(db.query.funders.findFirst).toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalledTimes(2);
    expect(result.grant).toMatchObject({ funderId: "funder-1" });
  });

  it("creates a fresh grant when the prior converted action points to a deleted grant", async () => {
    let insertCall = 0;
    const db = {
      query: {
        grantOpportunities: {
          findFirst: vi.fn().mockResolvedValue({
            id: "opp-1",
            orgId: "org-1",
            title: "Housing",
            agencyName: "HUD",
          }),
        },
        grantOpportunityActions: {
          findFirst: vi.fn().mockResolvedValue({ convertedGrantId: "grant-old" }),
        },
        grants: { findFirst: vi.fn().mockResolvedValue(null) },
        funders: { findFirst: vi.fn().mockResolvedValue({ id: "funder-1" }) },
      },
      insert: vi.fn(() => {
        insertCall += 1;
        return {
          values: vi.fn((payload) => ({
            returning: vi
              .fn()
              .mockResolvedValue(
                insertCall === 1
                  ? [{ id: "grant-new", ...payload }]
                  : [{ id: "action-1", ...payload }],
              ),
          })),
        };
      }),
    };

    const result = await convertGrantOpportunity(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      opportunityId: "opp-1",
      status: "application",
      ownerUserId: "owner-1",
    });

    expect(result.grant).toMatchObject({ id: "grant-new" });
  });

  it("throws when converting an opportunity outside the org", async () => {
    const db = {
      query: {
        grantOpportunities: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    };

    await expect(
      convertGrantOpportunity(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        opportunityId: "missing",
        status: "application",
      }),
    ).rejects.toThrow("Opportunity not found");
  });
});

describe("grant opportunity actions", () => {
  function actionDb(row = { id: "action-1" }) {
    const returning = vi.fn().mockResolvedValue([row]);
    const onConflictDoUpdate = vi.fn(() => ({ returning }));
    const values = vi.fn(() => ({ onConflictDoUpdate, returning }));
    return {
      returning,
      onConflictDoUpdate,
      values,
      db: {
        query: {
          grantOpportunities: { findFirst: vi.fn().mockResolvedValue({ id: "opp-1" }) },
        },
        insert: vi.fn(() => ({ values })),
      },
    };
  }

  it("saves an opportunity action with reminder fields", async () => {
    const { db, onConflictDoUpdate } = actionDb();

    const result = await saveGrantOpportunity(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      opportunityId: "opp-1",
      ownerUserId: "owner-1",
      notes: "Worth pursuing",
      reminderAt: "2026-05-01T00:00:00.000Z",
    });

    expect(result).toEqual({ id: "action-1" });
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          state: "saved",
          ownerUserId: "owner-1",
          notes: "Worth pursuing",
          reminderAt: expect.any(Date),
        }),
      }),
    );
  });

  it("dismisses an opportunity and clears a reminder when requested", async () => {
    const { db, onConflictDoUpdate } = actionDb();

    await dismissGrantOpportunity(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      opportunityId: "opp-1",
      reminderAt: null,
    });

    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({ state: "dismissed", reminderAt: null }),
      }),
    );
  });

  it("falls back to insert returning when conflict update is unavailable", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "action-1" }]);
    const db = {
      query: {
        grantOpportunities: { findFirst: vi.fn().mockResolvedValue({ id: "opp-1" }) },
      },
      insert: vi.fn(() => ({
        values: vi.fn(() => ({ returning })),
      })),
    };

    await expect(
      saveGrantOpportunity(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        opportunityId: "opp-1",
      }),
    ).resolves.toEqual({ id: "action-1" });
  });
});

describe("grant opportunity saved searches", () => {
  it("lists saved searches when the query API exists", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "search-1" }]);
    const db = { query: { grantOpportunitySavedSearches: { findMany } } };

    await expect(
      listGrantOpportunitySavedSearches(db as never, { orgId: "org-1" }),
    ).resolves.toEqual([{ id: "search-1" }]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.anything() }));
  });

  it("returns no saved searches when the query API is unavailable", async () => {
    await expect(
      listGrantOpportunitySavedSearches({ query: {} } as never, { orgId: "org-1" }),
    ).resolves.toEqual([]);
  });

  it("creates saved searches with reminder defaults", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "search-1" }]);
    const values = vi.fn(() => ({ returning }));
    const db = { insert: vi.fn(() => ({ values })) };

    await expect(
      createGrantOpportunitySavedSearch(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        name: "Food grants",
        filters: { keyword: "food" },
      }),
    ).resolves.toEqual({ id: "search-1" });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        emailRemindersEnabled: true,
        reminderDaysBeforeDeadline: 14,
      }),
    );
  });

  it("updates saved searches within the org", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "search-1", name: "Updated" }]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    const db = { update: vi.fn(() => ({ set })) };

    await expect(
      updateGrantOpportunitySavedSearch(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        searchId: "search-1",
        data: { name: "Updated" },
      }),
    ).resolves.toEqual({ id: "search-1", name: "Updated" });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ name: "Updated" }));
  });

  it("soft deletes saved searches", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    const db = { update: vi.fn(() => ({ set })) };

    await deleteGrantOpportunitySavedSearch(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      searchId: "search-1",
    });

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        deletedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    );
  });
});
