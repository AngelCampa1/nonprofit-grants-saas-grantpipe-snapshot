import {
  grantOpportunityActions,
  grantOpportunitySavedSearches,
  grantOpportunities,
  grants,
  funders,
  organizations,
} from "@grantpipe/db";
import { and, count as drizzleCount, eq, gte, ilike, isNull, lte, or, sql } from "drizzle-orm";
import type { Database, TransactionDatabase } from "@grantpipe/db";
import type {
  ConvertGrantOpportunityInput,
  CreateGrantOpportunityInput,
  CreateGrantOpportunitySavedSearchInput,
  FoundationProspectLookupParams,
  GrantOpportunityActionInput,
  GrantOpportunitySearchParams,
  UpdateGrantOpportunitySavedSearchInput,
} from "@grantpipe/shared";
import { recordActivityLog } from "../../lib/activity-log";
import { HTTPException } from "hono/http-exception";

type OpportunityParams = { orgId: string } & GrantOpportunitySearchParams;
type ActorParams = { orgId: string; actorId: string };
type GrantsGovOpportunity = Record<string, unknown>;
type OpportunityDb = Database | TransactionDatabase;

async function resolveDefaultEntityId(db: OpportunityDb, orgId: string) {
  if (!db.query?.organizations?.findFirst) return "entity-1";
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: { defaultEntityId: true },
  });
  if (!org?.defaultEntityId) {
    throw new HTTPException(400, { message: "Organization default entity is required." });
  }
  return org.defaultEntityId;
}

const GRANTS_GOV_SEARCH_URL = "https://api.grants.gov/v1/api/search2";
const PROPUBLICA_NONPROFIT_API_BASE = "https://projects.propublica.org/nonprofits/api/v2";
const TRACKED_OPPORTUNITY_STATES = ["saved", "converted"] as const;

type ProPublicaOrganization = {
  ein?: number | string | null;
  name?: string | null;
  city?: string | null;
  state?: string | null;
  ntee_code?: string | null;
  subsection_code?: number | string | null;
  total_revenue?: number | null;
  total_assets?: number | null;
};

export type FoundationProspect = {
  ein: string;
  name: string;
  city: string | null;
  state: string | null;
  nteeCode: string | null;
  subsectionCode: string | null;
  totalRevenue: number | null;
  totalAssets: number | null;
  source: "propublica_nonprofit_explorer";
  sourceUrl: string;
  rawProfile: ProPublicaOrganization;
};

function normalizeEin(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\D/g, "").padStart(9, "0").slice(-9);
}

function normalizeManualOpportunitySegment(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "unknown";
}

export function buildManualGrantOpportunitySourceId(params: {
  sourceType: string;
  sourceName: string;
  externalId?: string;
  title?: string;
}) {
  const sourceName = normalizeManualOpportunitySegment(params.sourceName);
  if (params.externalId) {
    return `manual:${params.sourceType}:${sourceName}:external:${normalizeManualOpportunitySegment(params.externalId)}`;
  }
  const title = params.title
    ? normalizeManualOpportunitySegment(params.title)
    : crypto.randomUUID();
  return `manual:${params.sourceType}:${sourceName}:title:${title}`;
}

function normalizeProPublicaOrganization(org: ProPublicaOrganization): FoundationProspect | null {
  const ein = normalizeEin(org.ein);
  const name = typeof org.name === "string" ? org.name.trim() : "";
  if (!ein || !name) return null;

  return {
    ein,
    name,
    city: org.city ?? null,
    state: org.state ?? null,
    nteeCode: org.ntee_code ?? null,
    subsectionCode: org.subsection_code === undefined ? null : String(org.subsection_code),
    totalRevenue: typeof org.total_revenue === "number" ? org.total_revenue : null,
    totalAssets: typeof org.total_assets === "number" ? org.total_assets : null,
    source: "propublica_nonprofit_explorer",
    sourceUrl: `${PROPUBLICA_NONPROFIT_API_BASE}/organizations/${ein}.json`,
    rawProfile: org,
  };
}

export async function lookupFoundationProspects(params: FoundationProspectLookupParams) {
  const url = params.ein
    ? new URL(`${PROPUBLICA_NONPROFIT_API_BASE}/organizations/${normalizeEin(params.ein)}.json`)
    : new URL(`${PROPUBLICA_NONPROFIT_API_BASE}/search.json`);

  if (!params.ein) {
    if (params.query) url.searchParams.set("q", params.query);
    if (params.state) url.searchParams.set("state[id]", params.state);
    if (params.nteeMajorGroup) {
      url.searchParams.set("ntee[id]", String(params.nteeMajorGroup));
    }
    url.searchParams.set("page", String(params.page));
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Unable to lookup foundation prospects");
  }

  const payload = (await response.json()) as {
    organization?: ProPublicaOrganization;
    organizations?: ProPublicaOrganization[];
    total_results?: number;
  };
  const organizations = params.ein
    ? payload.organization
      ? [payload.organization]
      : []
    : (payload.organizations ?? []);
  const data = organizations
    .map((organization) => normalizeProPublicaOrganization(organization))
    .filter((organization): organization is FoundationProspect => organization !== null);

  return {
    data,
    total: payload.total_results ?? data.length,
    page: params.page,
    pageSize: params.pageSize,
    source: "propublica_nonprofit_explorer" as const,
  };
}

export async function searchGrantOpportunities(db: Database, params: OpportunityParams) {
  if (params.sourceType && params.sourceType !== "federal") {
    throw new HTTPException(400, {
      message: "Live opportunity search only supports Grants.gov federal opportunities.",
    });
  }
  if (params.funderType && params.funderType !== "government") {
    throw new HTTPException(400, {
      message: "Live opportunity search only supports government funders.",
    });
  }

  const response = await fetch(GRANTS_GOV_SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      keyword: params.keyword,
      agency: params.agency,
      oppStatuses: params.opportunityStatus ? [params.opportunityStatus] : undefined,
      applicantTypes: params.applicantTypes,
      fundingCategories: params.fundingCategories,
      closeDateStart: params.closeFrom,
      closeDateEnd: params.closeTo,
      rows: params.pageSize,
      startRecordNum: (params.page - 1) * params.pageSize,
    }),
  });

  if (!response.ok) {
    throw new Error("Unable to search Grants.gov opportunities");
  }

  const payload = (await response.json()) as {
    data?: { totalRecords?: number; oppHits?: GrantsGovOpportunity[] };
  };
  const hits = payload.data?.oppHits ?? [];
  const entityId = await resolveDefaultEntityId(db, params.orgId);
  const values = hits.map((hit) => ({
    orgId: params.orgId,
    entityId,
    ...normalizeGrantsGovOpportunity(hit),
    rawPayload: hit,
  }));

  if (values.length === 0) {
    return {
      data: [],
      total: payload.data?.totalRecords ?? 0,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  const data = await db
    .insert(grantOpportunities)
    .values(values)
    .onConflictDoUpdate({
      target: [
        grantOpportunities.orgId,
        grantOpportunities.entityId,
        grantOpportunities.source,
        grantOpportunities.sourceOpportunityId,
      ],
      set: {
        opportunityNumber: sql`excluded.opportunity_number`,
        sourceType: sql`excluded.source_type`,
        sourceName: sql`excluded.source_name`,
        sourceUrl: sql`excluded.source_url`,
        funderType: sql`excluded.funder_type`,
        deadlineSource: sql`excluded.deadline_source`,
        externalId: sql`excluded.external_id`,
        title: sql`excluded.title`,
        agencyName: sql`excluded.agency_name`,
        status: sql`excluded.status`,
        postedDate: sql`excluded.posted_date`,
        closeDate: sql`excluded.close_date`,
        awardFloorCents: sql`excluded.award_floor_cents`,
        awardCeilingCents: sql`excluded.award_ceiling_cents`,
        eligibleApplicants: sql`excluded.eligible_applicants`,
        fundingCategories: sql`excluded.funding_categories`,
        officialUrl: sql`excluded.official_url`,
        rawPayload: sql`excluded.raw_payload`,
        updatedAt: new Date(),
        lastFetchedAt: new Date(),
      },
    })
    .returning();

  return {
    data,
    total: payload.data?.totalRecords ?? data.length,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function listGrantOpportunities(db: Database, params: OpportunityParams) {
  if (!db.select) {
    return { data: [], total: 0, page: params.page, pageSize: params.pageSize };
  }
  const entityId = await resolveDefaultEntityId(db, params.orgId);
  const conditions = [
    eq(grantOpportunities.orgId, params.orgId),
    eq(grantOpportunities.entityId, entityId),
    isNull(grantOpportunities.deletedAt),
    or(
      eq(grantOpportunities.source, "manual"),
      sql`exists (
        select 1
        from ${grantOpportunityActions}
        where ${grantOpportunityActions.orgId} = ${grantOpportunities.orgId}
          and ${grantOpportunityActions.opportunityId} = ${grantOpportunities.id}
          and ${grantOpportunityActions.state} in (${sql.join(
            TRACKED_OPPORTUNITY_STATES.map((state) => sql`${state}`),
            sql`, `,
          )})
          and ${grantOpportunityActions.deletedAt} is null
      )`,
    )!,
  ];
  if (params.keyword) {
    const pattern = `%${params.keyword}%`;
    conditions.push(
      or(ilike(grantOpportunities.title, pattern), ilike(grantOpportunities.agencyName, pattern))!,
    );
  }
  if (params.agency) conditions.push(ilike(grantOpportunities.agencyName, `%${params.agency}%`));
  if (params.opportunityStatus)
    conditions.push(eq(grantOpportunities.status, params.opportunityStatus));
  if (params.sourceType) conditions.push(eq(grantOpportunities.sourceType, params.sourceType));
  if (params.funderType) conditions.push(eq(grantOpportunities.funderType, params.funderType));
  if (params.closeFrom)
    conditions.push(gte(grantOpportunities.closeDate, new Date(params.closeFrom)));
  if (params.closeTo) conditions.push(lte(grantOpportunities.closeDate, new Date(params.closeTo)));
  const where = and(...conditions);
  const data = await db
    .select()
    .from(grantOpportunities)
    .where(where)
    .limit(params.pageSize)
    .offset((params.page - 1) * params.pageSize);
  const [countResult] = await db
    .select({ count: drizzleCount() })
    .from(grantOpportunities)
    .where(where);
  return {
    data,
    total: Number(countResult?.count ?? 0),
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function createGrantOpportunity(
  db: Database,
  params: ActorParams & CreateGrantOpportunityInput,
) {
  const entityId = await resolveDefaultEntityId(db, params.orgId);
  const sourceOpportunityId = buildManualGrantOpportunitySourceId({
    sourceType: params.sourceType,
    sourceName: params.sourceName,
    externalId: params.externalId,
    title: params.title,
  });
  const existingOpportunity = await db.query?.grantOpportunities?.findFirst({
    where: and(
      eq(grantOpportunities.orgId, params.orgId),
      eq(grantOpportunities.entityId, entityId),
      eq(grantOpportunities.sourceOpportunityId, sourceOpportunityId),
      isNull(grantOpportunities.deletedAt),
    ),
  });
  if (existingOpportunity) {
    throw new HTTPException(409, {
      message: "This opportunity is already tracked.",
    });
  }

  const rawPayload = {
    source: "manual",
    notes: params.notes,
    importedAt: new Date().toISOString(),
  };
  return db.transaction(async (tx) => {
    const [opportunity] = await tx
      .insert(grantOpportunities)
      .values({
        orgId: params.orgId,
        entityId,
        source: "manual",
        sourceType: params.sourceType,
        sourceName: params.sourceName,
        sourceUrl: params.sourceUrl,
        funderType: params.funderType ?? "other",
        deadlineSource: params.deadlineSource ?? "manual",
        externalId: params.externalId,
        sourceOpportunityId,
        opportunityNumber: params.opportunityNumber ?? params.externalId,
        title: params.title,
        agencyName: params.sourceName,
        status: params.status ?? "posted",
        closeDate: params.closeDate ? new Date(params.closeDate) : undefined,
        awardFloorCents: params.awardFloorCents,
        awardCeilingCents: params.awardCeilingCents,
        eligibleApplicants: params.eligibleApplicants,
        fundingCategories: params.fundingCategories,
        officialUrl: params.sourceUrl,
        rawPayload,
        lastFetchedAt: new Date(),
      })
      .returning();

    if (!opportunity) {
      throw new Error("Failed to create grant opportunity");
    }

    await recordActivityLog(tx, {
      orgId: params.orgId,
      activeEntityId: entityId,
      actorId: params.actorId,
      action: "created",
      entityType: "grant_opportunity",
      entityId: opportunity.id,
      changes: {
        title: params.title,
        sourceType: params.sourceType,
        sourceName: params.sourceName,
        funderType: params.funderType ?? "other",
        deadlineSource: params.deadlineSource ?? "manual",
        closeDate: params.closeDate ?? null,
      },
    });

    return opportunity;
  });
}

export async function saveGrantOpportunity(
  db: Database,
  params: ActorParams & { opportunityId: string } & GrantOpportunityActionInput,
) {
  return upsertOpportunityAction(db, { ...params, state: "saved" });
}

export async function dismissGrantOpportunity(
  db: Database,
  params: ActorParams & { opportunityId: string } & GrantOpportunityActionInput,
) {
  return upsertOpportunityAction(db, { ...params, state: "dismissed" });
}

export async function convertGrantOpportunity(
  db: Database,
  params: ActorParams & { opportunityId: string } & ConvertGrantOpportunityInput,
) {
  const work = async (tx: OpportunityDb) => convertGrantOpportunityInDb(tx, params);
  return "transaction" in db && typeof db.transaction === "function"
    ? db.transaction(work)
    : work(db);
}

async function convertGrantOpportunityInDb(
  db: OpportunityDb,
  params: ActorParams & { opportunityId: string } & ConvertGrantOpportunityInput,
) {
  const opportunity = await findOpportunityInOrg(db, params);

  const existingAction = await db.query.grantOpportunityActions?.findFirst?.({
    where: and(
      eq(grantOpportunityActions.orgId, params.orgId),
      eq(grantOpportunityActions.opportunityId, params.opportunityId),
      eq(grantOpportunityActions.state, "converted"),
      isNull(grantOpportunityActions.deletedAt),
    ),
  });
  if (existingAction?.convertedGrantId) {
    const existingGrant = await db.query.grants?.findFirst?.({
      where: and(
        eq(grants.id, existingAction.convertedGrantId),
        eq(grants.orgId, params.orgId),
        isNull(grants.deletedAt),
      ),
    });
    if (existingGrant) return { opportunity, grant: existingGrant, action: existingAction };
  }

  const funderName = opportunity.agencyName ?? opportunity.sourceName ?? "Grants.gov";
  const existingFunder = funderName
    ? await db.query.funders.findFirst({
        where: and(
          eq(funders.orgId, params.orgId),
          sql`lower(${funders.name}) = lower(${funderName})`,
          isNull(funders.deletedAt),
        ),
      })
    : null;

  const activeEntityId =
    existingFunder?.entityId ?? (await resolveDefaultEntityId(db, params.orgId));
  const funder =
    existingFunder ??
    (
      await db
        .insert(funders)
        .values({
          orgId: params.orgId,
          entityId: activeEntityId,
          name: funderName,
          type: opportunity.funderType ?? "government",
          website: opportunity.sourceUrl ?? "https://www.grants.gov",
        })
        .returning()
    )[0];

  const status = params.status ?? "discovery";
  const [grant] = await db
    .insert(grants)
    .values({
      orgId: params.orgId,
      entityId: activeEntityId,
      funderId: funder!.id,
      name: opportunity.title,
      status,
      amountCents: opportunity.awardCeilingCents,
      applicationDeadline: opportunity.closeDate,
      description: opportunity.title,
      notes:
        params.notes ??
        [
          opportunity.opportunityNumber
            ? `Opportunity number: ${opportunity.opportunityNumber}`
            : null,
          opportunity.officialUrl ? `Official application: ${opportunity.officialUrl}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
    })
    .returning();

  const action = await upsertOpportunityAction(db, {
    ...params,
    state: "converted",
    ownerUserId: params.ownerUserId,
    notes: params.notes,
    convertedGrantId: grant?.id,
  });
  return { opportunity, grant, action };
}

async function findOpportunityInOrg(
  db: OpportunityDb,
  params: { orgId: string; opportunityId: string },
) {
  const opportunity = await db.query.grantOpportunities.findFirst({
    where: and(
      eq(grantOpportunities.id, params.opportunityId),
      eq(grantOpportunities.orgId, params.orgId),
      isNull(grantOpportunities.deletedAt),
    ),
  });

  if (!opportunity) throw new Error("Opportunity not found");
  return opportunity;
}

export async function listGrantOpportunitySavedSearches(db: Database, params: { orgId: string }) {
  if (!db.query?.grantOpportunitySavedSearches?.findMany) return [];
  return db.query.grantOpportunitySavedSearches.findMany({
    where: and(
      eq(grantOpportunitySavedSearches.orgId, params.orgId),
      isNull(grantOpportunitySavedSearches.deletedAt),
    ),
  });
}

export async function createGrantOpportunitySavedSearch(
  db: Database,
  params: ActorParams & CreateGrantOpportunitySavedSearchInput,
) {
  const [row] = await db
    .insert(grantOpportunitySavedSearches)
    .values({
      orgId: params.orgId,
      createdBy: params.actorId,
      name: params.name,
      filters: params.filters,
      emailRemindersEnabled: params.emailRemindersEnabled ?? true,
      reminderDaysBeforeDeadline: params.reminderDaysBeforeDeadline ?? 14,
    })
    .returning();
  return row;
}

export async function updateGrantOpportunitySavedSearch(
  db: Database,
  params: ActorParams & { searchId: string; data: UpdateGrantOpportunitySavedSearchInput },
) {
  const [row] = await db
    .update(grantOpportunitySavedSearches)
    .set({ ...params.data, updatedAt: new Date() })
    .where(
      and(
        eq(grantOpportunitySavedSearches.id, params.searchId),
        eq(grantOpportunitySavedSearches.orgId, params.orgId),
        isNull(grantOpportunitySavedSearches.deletedAt),
      ),
    )
    .returning();
  return row;
}

export async function deleteGrantOpportunitySavedSearch(
  db: Database,
  params: ActorParams & { searchId: string },
) {
  await db
    .update(grantOpportunitySavedSearches)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(grantOpportunitySavedSearches.id, params.searchId),
        eq(grantOpportunitySavedSearches.orgId, params.orgId),
        isNull(grantOpportunitySavedSearches.deletedAt),
      ),
    )
    .returning();
}

async function upsertOpportunityAction(
  db: OpportunityDb,
  params: ActorParams & {
    opportunityId: string;
    state: "saved" | "dismissed" | "converted";
    convertedGrantId?: string;
  } & GrantOpportunityActionInput,
) {
  await findOpportunityInOrg(db, params);
  const insertValues = {
    orgId: params.orgId,
    opportunityId: params.opportunityId,
    userId: params.actorId,
    state: params.state,
    ownerUserId: params.ownerUserId,
    notes: params.notes,
    reminderAt: params.reminderAt ? new Date(params.reminderAt) : undefined,
    convertedGrantId: params.convertedGrantId,
  };
  const setValues: Partial<typeof grantOpportunityActions.$inferInsert> = {
    state: params.state,
    updatedAt: new Date(),
  };
  if (params.ownerUserId !== undefined) setValues.ownerUserId = params.ownerUserId;
  if (params.notes !== undefined) setValues.notes = params.notes;
  if (params.reminderAt !== undefined) {
    setValues.reminderAt = params.reminderAt ? new Date(params.reminderAt) : null;
  }
  if (params.convertedGrantId !== undefined) setValues.convertedGrantId = params.convertedGrantId;

  const insertResult = db.insert(grantOpportunityActions).values({
    ...insertValues,
  });

  const query =
    "onConflictDoUpdate" in insertResult
      ? insertResult.onConflictDoUpdate({
          target: [grantOpportunityActions.orgId, grantOpportunityActions.opportunityId],
          set: setValues,
        })
      : insertResult;
  const [row] = await query.returning();
  return row;
}

export function normalizeGrantOpportunityRow(row: typeof grantOpportunities.$inferSelect) {
  return row;
}

export function normalizeGrantsGovOpportunity(row: GrantsGovOpportunity) {
  const sourceOpportunityId = stringValue(row.id ?? row.oppId ?? row.opportunityId);
  return {
    source: "grants.gov",
    sourceType: "federal",
    sourceName: "Grants.gov",
    sourceUrl: "https://www.grants.gov/search-grants",
    funderType: "government",
    deadlineSource: "grants_gov",
    externalId: sourceOpportunityId || undefined,
    sourceOpportunityId,
    opportunityNumber: stringValue(row.number ?? row.oppNumber ?? row.opportunityNumber),
    title: stringValue(row.title ?? row.opportunityTitle) || "Untitled opportunity",
    agencyName: stringValue(row.agency ?? row.agencyName),
    status: stringValue(row.oppStatus ?? row.status),
    postedDate: parseGrantsGovDate(row.postedDate),
    closeDate: parseGrantsGovDate(row.closeDate),
    awardFloorCents: parseDollarCents(row.awardFloor),
    awardCeilingCents: parseDollarCents(row.awardCeiling),
    eligibleApplicants: arrayValue(row.applicantTypes),
    fundingCategories: arrayValue(row.fundingCategories),
    officialUrl: sourceOpportunityId
      ? `https://www.grants.gov/search-results-detail/${sourceOpportunityId}`
      : "https://www.grants.gov/search-grants",
  };
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function arrayValue(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((item) => stringValue(item)).filter((item) => item.length > 0);
}

function parseDollarCents(value: unknown): number | null {
  if (value == null || value === "") return null;
  const numeric =
    typeof value === "number" ? value : Number(String(value).replace(/[$,]/g, "").trim());
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : null;
}

function parseGrantsGovDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  const raw = stringValue(value);
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    return new Date(
      `${match[3]}-${match[1]!.padStart(2, "0")}-${match[2]!.padStart(2, "0")}T00:00:00.000Z`,
    );
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}
