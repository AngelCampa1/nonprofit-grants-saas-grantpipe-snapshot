import { eq, and, isNull, sql, count as drizzleCount, desc, inArray } from "drizzle-orm";
import { contacts, contactTags, donations, tags } from "@grantpipe/db";
import type { Database } from "@grantpipe/db";
import {
  DONOR_PIPELINE_STAGES,
  type DonorPipelineStage,
  getFiscalYearRange,
  getFiscalYearsBack,
} from "@grantpipe/shared";
import { donationEntityScope, donorContactEntityScope } from "./ownership";

// ---------------------------------------------------------------------------
// getDonorStats
// ---------------------------------------------------------------------------

type DonorStats = {
  totalDonors: number;
  totalGivingThisFY: number;
  previousFiscalYearGivingCents: number;
  newDonorsThisFY: number;
  retentionRate: number;
};

export async function getDonorStats(
  db: Database,
  params: { orgId: string; entityId: string; fiscalYearStartMonth: number; now?: Date },
): Promise<DonorStats> {
  const { orgId, entityId, fiscalYearStartMonth, now = new Date() } = params;
  const currentFY = getFiscalYearRange(fiscalYearStartMonth, now);

  // Shift back one year to get previous FY
  const prevRef = new Date(currentFY.start);
  prevRef.setUTCFullYear(prevRef.getUTCFullYear() - 1);
  prevRef.setUTCMonth(prevRef.getUTCMonth() + 1);
  const previousFY = getFiscalYearRange(fiscalYearStartMonth, prevRef);

  const entityScope = donationEntityScope(orgId, entityId);
  const donationBase = and(eq(donations.orgId, orgId), entityScope, isNull(donations.deletedAt));

  const contactBase = and(
    eq(contacts.orgId, orgId),
    isNull(contacts.deletedAt),
    donorContactEntityScope(orgId, entityId),
  );

  // Total donor contacts (all time)
  const [totalDonorsResult] = await db
    .select({ count: drizzleCount() })
    .from(contacts)
    .where(contactBase);

  // Total giving this FY
  const [totalGivingResult] = await db
    .select({ total: sql<number>`COALESCE(SUM(${donations.amountCents}), 0)` })
    .from(donations)
    .where(
      and(
        donationBase,
        sql`${donations.date} >= ${currentFY.start}`,
        sql`${donations.date} <= ${currentFY.end}`,
      ),
    );

  const [previousFiscalYearGivingResult] = await db
    .select({ total: sql<number>`COALESCE(SUM(${donations.amountCents}), 0)` })
    .from(donations)
    .where(
      and(
        donationBase,
        sql`${donations.date} >= ${previousFY.start}`,
        sql`${donations.date} <= ${previousFY.end}`,
      ),
    );

  // New donors this FY are active contacts created in the current fiscal year.
  const [newDonorsResult] = await db
    .select({ count: drizzleCount() })
    .from(contacts)
    .where(
      and(
        contactBase,
        sql`${contacts.createdAt} >= ${currentFY.start}`,
        sql`${contacts.createdAt} <= ${currentFY.end}`,
      ),
    );

  // Retention: donors in previous FY who also donated in current FY
  const [prevFYDonorsResult] = await db
    .select({ count: sql<number>`COUNT(DISTINCT ${donations.contactId})` })
    .from(donations)
    .where(
      and(
        donationBase,
        sql`${donations.date} >= ${previousFY.start}`,
        sql`${donations.date} <= ${previousFY.end}`,
      ),
    );

  const prevFYDonorCount = Number(prevFYDonorsResult?.count ?? 0);
  let retentionRate = 0;

  if (prevFYDonorCount > 0) {
    // Donors who gave in both previous FY and current FY
    const [retainedResult] = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${donations.contactId})` })
      .from(donations)
      .where(
        and(
          donationBase,
          sql`${donations.date} >= ${previousFY.start}`,
          sql`${donations.date} <= ${previousFY.end}`,
          sql`${donations.contactId} IN (
            SELECT DISTINCT ${donations.contactId}
            FROM ${donations}
            WHERE ${donations.orgId} = ${orgId}
              AND ${donations.deletedAt} IS NULL
              AND ${entityScope}
              AND ${donations.date} >= ${currentFY.start}
              AND ${donations.date} <= ${currentFY.end}
          )`,
        ),
      );

    retentionRate = Number(retainedResult?.count ?? 0) / prevFYDonorCount;
  }

  return {
    totalDonors: totalDonorsResult?.count ?? 0,
    totalGivingThisFY: Number(totalGivingResult?.total ?? 0),
    previousFiscalYearGivingCents: Number(previousFiscalYearGivingResult?.total ?? 0),
    newDonorsThisFY: newDonorsResult?.count ?? 0,
    retentionRate,
  };
}

// ---------------------------------------------------------------------------
// getRetentionStats
// ---------------------------------------------------------------------------

type RetentionEntry = {
  fiscalYear: string;
  retentionRate: number;
  donorCount: number;
  retainedCount: number;
};

export async function getRetentionStats(
  db: Database,
  params: {
    orgId: string;
    entityId: string;
    fiscalYearStartMonth: number;
    count: number;
    now?: Date;
  },
): Promise<RetentionEntry[]> {
  const { orgId, entityId, fiscalYearStartMonth, count, now = new Date() } = params;
  const fiscalYears = getFiscalYearsBack(fiscalYearStartMonth, count, now);
  const results: RetentionEntry[] = [];

  const entityScope = donationEntityScope(orgId, entityId);
  const donationBase = and(eq(donations.orgId, orgId), entityScope, isNull(donations.deletedAt));

  for (let i = 0; i < fiscalYears.length; i++) {
    const fy = fiscalYears[i]!;

    // Donor count for this FY
    const [donorResult] = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${donations.contactId})` })
      .from(donations)
      .where(
        and(
          donationBase,
          sql`${donations.date} >= ${fy.start}`,
          sql`${donations.date} <= ${fy.end}`,
        ),
      );

    const donorCount = Number(donorResult?.count ?? 0);

    if (i === 0) {
      // First FY — no previous to compare against
      results.push({
        fiscalYear: fy.label,
        retentionRate: 0,
        donorCount,
        retainedCount: 0,
      });
      continue;
    }

    // Retained from previous FY: donors who gave in prevFY and also gave in current FY
    const prevFY = fiscalYears[i - 1]!;
    const [retainedResult] = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${donations.contactId})` })
      .from(donations)
      .where(
        and(
          donationBase,
          sql`${donations.date} >= ${prevFY.start}`,
          sql`${donations.date} <= ${prevFY.end}`,
          sql`${donations.contactId} IN (
            SELECT DISTINCT ${donations.contactId}
            FROM ${donations}
            WHERE ${donations.orgId} = ${orgId}
              AND ${donations.deletedAt} IS NULL
              AND ${entityScope}
              AND ${donations.date} >= ${fy.start}
              AND ${donations.date} <= ${fy.end}
          )`,
        ),
      );

    const prevDonorCount = results[i - 1]!.donorCount;
    const retainedCount = Number(retainedResult?.count ?? 0);

    results.push({
      fiscalYear: fy.label,
      retentionRate: prevDonorCount > 0 ? retainedCount / prevDonorCount : 0,
      donorCount,
      retainedCount,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// getPipelineGroups
// ---------------------------------------------------------------------------

type PipelineContact = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  organizationName: string | null;
  email: string | null;
  type: string;
  pipelineStage: string;
  tags: { id: string; name: string; color: string | null }[];
  lastDonationDate: Date | null;
  totalGiving: number;
};

type PipelineGroups = Record<DonorPipelineStage, { contacts: PipelineContact[]; count: number }>;

const PIPELINE_LIMIT = 50;

export async function getPipelineGroups(
  db: Database,
  params: { orgId: string; entityId: string },
): Promise<PipelineGroups> {
  const { orgId, entityId } = params;
  const groups = {} as PipelineGroups;

  const contactEntityScope = donorContactEntityScope(orgId, entityId);
  const entityScope = donationEntityScope(orgId, entityId);

  for (const stage of DONOR_PIPELINE_STAGES) {
    const where = and(
      eq(contacts.orgId, orgId),
      contactEntityScope,
      eq(contacts.pipelineStage, stage),
      isNull(contacts.deletedAt),
    );

    const stageContacts = await db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        organizationName: contacts.organizationName,
        email: contacts.email,
        type: contacts.type,
        pipelineStage: contacts.pipelineStage,
      })
      .from(contacts)
      .where(where)
      .orderBy(desc(contacts.updatedAt))
      .limit(PIPELINE_LIMIT);

    const [countResult] = await db.select({ count: drizzleCount() }).from(contacts).where(where);

    // Enrich with donation stats and tags for the batch of contacts
    const contactIds = stageContacts.map((c) => c.id);

    // Donation stats per contact
    type DonationStatRow = {
      contactId: string;
      lastDonationDate: Date | null;
      totalGiving: number;
    };
    let donationStats: DonationStatRow[] = [];
    if (contactIds.length > 0) {
      donationStats = await db
        .select({
          contactId: donations.contactId,
          lastDonationDate: sql<Date | null>`MAX(${donations.date})`,
          totalGiving: sql<number>`COALESCE(SUM(${donations.amountCents}), 0)`,
        })
        .from(donations)
        .where(
          and(
            eq(donations.orgId, orgId),
            entityScope,
            inArray(donations.contactId, contactIds),
            isNull(donations.deletedAt),
          ),
        )
        .groupBy(donations.contactId);
    }

    const donationStatsByContactId = new Map<string, DonationStatRow>(
      donationStats.map((row) => [row.contactId, row]),
    );

    // Tags per contact
    type TagRow = { contactId: string; tagId: string; tagName: string; tagColor: string | null };
    let tagRows: TagRow[] = [];
    if (contactIds.length > 0) {
      tagRows = await db
        .select({
          contactId: contactTags.contactId,
          tagId: tags.id,
          tagName: tags.name,
          tagColor: tags.color,
        })
        .from(contactTags)
        .innerJoin(
          tags,
          and(eq(contactTags.tagId, tags.id), eq(tags.orgId, orgId), isNull(tags.deletedAt)),
        )
        .where(and(eq(contactTags.orgId, orgId), inArray(contactTags.contactId, contactIds)));
    }

    const tagsByContactId = new Map<string, { id: string; name: string; color: string | null }[]>();
    for (const row of tagRows) {
      const existing = tagsByContactId.get(row.contactId) ?? [];
      existing.push({ id: row.tagId, name: row.tagName, color: row.tagColor });
      tagsByContactId.set(row.contactId, existing);
    }

    const enrichedContacts: PipelineContact[] = stageContacts.map((c) => {
      const ds = donationStatsByContactId.get(c.id);
      return {
        ...c,
        tags: tagsByContactId.get(c.id) ?? [],
        lastDonationDate: ds?.lastDonationDate ?? null,
        totalGiving: Number(ds?.totalGiving ?? 0),
      };
    });

    groups[stage] = {
      contacts: enrichedContacts,
      count: countResult?.count ?? 0,
    };
  }

  return groups;
}
