import {
  eq,
  and,
  isNull,
  ilike,
  or,
  sql,
  count as drizzleCount,
  desc,
  asc,
  getTableColumns,
} from "drizzle-orm";
import { contacts, contactTags, donations, customFieldValues, tags } from "@grantpipe/db";
import type { Database } from "@grantpipe/db";
import type { CreateContactInput, UpdateContactInput, DonorPipelineStage } from "@grantpipe/shared";
import { escapeCsvCell } from "../../lib/csv";
import { createContactSchema, getFiscalYearRange, updateContactSchema } from "@grantpipe/shared";
import { recordActivityLog } from "../../lib/activity-log";
import { internalError, notFound } from "../../lib/app-error";
import { postDonation } from "../accounting/postingEngine";

/**
 * Escapes Postgres LIKE pattern special characters in a user-supplied search
 * string so that literal '%' and '_' characters are matched exactly.
 */
export function escapeLike(s: string): string {
  return s.replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function contactLabel(c: {
  firstName?: string | null;
  lastName?: string | null;
  organizationName?: string | null;
}): string {
  const full = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return full || c.organizationName || "Unknown";
}

async function assertAffiliatedOrgInTenant(
  db: Database,
  orgId: string,
  affiliatedOrgId: string | null | undefined,
): Promise<void> {
  if (!affiliatedOrgId) return;

  const affiliatedOrg = await db.query.contacts.findFirst({
    where: and(
      eq(contacts.id, affiliatedOrgId),
      eq(contacts.orgId, orgId),
      isNull(contacts.deletedAt),
    ),
    columns: { id: true },
  });

  if (!affiliatedOrg) throw notFound("Affiliated organization not found");
}

// ---------------------------------------------------------------------------
// createContact
// ---------------------------------------------------------------------------

export async function createContact(
  db: Database,
  params: { orgId: string; actorId?: string } & CreateContactInput,
): Promise<typeof contacts.$inferSelect> {
  const data = createContactSchema.parse(params);
  const { orgId, actorId } = params;
  await assertAffiliatedOrgInTenant(db, orgId, data.affiliatedOrgId);

  return db.transaction(async (tx) => {
    const [contact] = await tx
      .insert(contacts)
      .values({ orgId, ...data })
      .returning();

    if (!contact) throw internalError("Failed to create contact");
    if (actorId) {
      await recordActivityLog(tx, {
        orgId,
        actorId,
        action: "created",
        entityType: "contact",
        entityId: contact.id,
        entityLabel: contactLabel(contact),
        changes: data,
      });
    }
    return contact;
  });
}

// ---------------------------------------------------------------------------
// updateContact
// ---------------------------------------------------------------------------

export async function updateContact(
  db: Database,
  params: { orgId: string; actorId?: string; contactId: string; data: UpdateContactInput },
): Promise<typeof contacts.$inferSelect> {
  const data = updateContactSchema.parse(params.data);
  await assertAffiliatedOrgInTenant(db, params.orgId, data.affiliatedOrgId);

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(contacts)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(contacts.id, params.contactId),
          eq(contacts.orgId, params.orgId),
          isNull(contacts.deletedAt),
        ),
      )
      .returning();

    if (!updated) throw notFound("Contact not found");
    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "updated",
        entityType: "contact",
        entityId: updated.id,
        entityLabel: contactLabel(updated),
        changes: data,
      });
    }
    return updated;
  });
}

// ---------------------------------------------------------------------------
// deleteContact
// ---------------------------------------------------------------------------

export async function deleteContact(
  db: Database,
  params: { orgId: string; actorId?: string; contactId: string },
): Promise<void> {
  const now = new Date();

  const deleted = await db.transaction(async (tx) => {
    const [contact] = await tx
      .update(contacts)
      .set({ deletedAt: now })
      .where(
        and(
          eq(contacts.id, params.contactId),
          eq(contacts.orgId, params.orgId),
          isNull(contacts.deletedAt),
        ),
      )
      .returning();

    if (!contact) return null;

    // Collect IDs of donations to reverse before soft-deleting them.
    const affectedDonations = await tx
      .select({ id: donations.id })
      .from(donations)
      .where(
        and(
          eq(donations.contactId, params.contactId),
          eq(donations.orgId, params.orgId),
          isNull(donations.deletedAt),
        ),
      );

    // Cascade soft-delete to donations
    await tx
      .update(donations)
      .set({ deletedAt: now })
      .where(
        and(
          eq(donations.contactId, params.contactId),
          eq(donations.orgId, params.orgId),
          isNull(donations.deletedAt),
        ),
      );

    // Hard-delete junction rows (contactTags has no deletedAt column)
    await tx
      .delete(contactTags)
      .where(and(eq(contactTags.contactId, params.contactId), eq(contactTags.orgId, params.orgId)));

    // Hard-delete custom field values (no deletedAt or orgId column on this table)
    await tx.delete(customFieldValues).where(eq(customFieldValues.entityId, params.contactId));

    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "deleted",
        entityType: "contact",
        entityId: params.contactId,
        entityLabel: contactLabel(contact),
        changes: { deletedAt: contact.deletedAt?.toISOString?.() ?? null },
      });
    }

    // Reverse journal entries inside the transaction so a fiscal-period conflict
    // rolls back the entire delete atomically (contact + donations remain intact).
    if (params.actorId) {
      for (const donation of affectedDonations) {
        await postDonation(tx, {
          orgId: params.orgId,
          donationId: donation.id,
          action: "delete",
          actorId: params.actorId,
        });
      }
    }

    return contact;
  });

  if (!deleted) throw notFound("Contact not found");
}

// ---------------------------------------------------------------------------
// updatePipelineStage
// ---------------------------------------------------------------------------

export async function updatePipelineStage(
  db: Database,
  params: { orgId: string; actorId?: string; contactId: string; stage: DonorPipelineStage },
): Promise<typeof contacts.$inferSelect> {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(contacts)
      .set({ pipelineStage: params.stage, updatedAt: new Date() })
      .where(
        and(
          eq(contacts.id, params.contactId),
          eq(contacts.orgId, params.orgId),
          isNull(contacts.deletedAt),
        ),
      )
      .returning();

    if (!updated) throw notFound("Contact not found");
    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "updated_pipeline_stage",
        entityType: "contact",
        entityId: updated.id,
        entityLabel: contactLabel(updated),
        changes: { pipelineStage: params.stage },
      });
    }
    return updated;
  });
}

// ---------------------------------------------------------------------------
// getContact
// ---------------------------------------------------------------------------

type GivingStats = {
  totalLifetimeGiving: number;
  donationCount: number;
  firstGiftDate: Date | null;
  lastGiftDate: Date | null;
  averageGiftAmount: number;
  totalThisFY: number;
  totalLastFY: number;
};

type TagInfo = { id: string; name: string; color: string | null };

export async function getContact(
  db: Database,
  params: { orgId: string; contactId: string; fiscalYearStartMonth?: number; now?: Date },
): Promise<{
  contact: typeof contacts.$inferSelect;
  givingStats: GivingStats;
  tags: TagInfo[];
  affiliatedOrg: typeof contacts.$inferSelect | null;
}> {
  const { orgId, contactId, fiscalYearStartMonth = 1, now = new Date() } = params;

  const contact = await db.query.contacts.findFirst({
    where: and(eq(contacts.id, contactId), eq(contacts.orgId, orgId), isNull(contacts.deletedAt)),
  });

  if (!contact) throw notFound("Contact not found");

  // FY date ranges
  const currentFY = getFiscalYearRange(fiscalYearStartMonth, now);
  const prevRef = new Date(currentFY.start);
  prevRef.setUTCFullYear(prevRef.getUTCFullYear() - 1);
  prevRef.setUTCMonth(prevRef.getUTCMonth() + 1);
  const previousFY = getFiscalYearRange(fiscalYearStartMonth, prevRef);

  const donationBase = and(
    eq(donations.contactId, contactId),
    eq(donations.orgId, orgId),
    isNull(donations.deletedAt),
  );

  // Lifetime giving stats
  const [stats] = await db
    .select({
      totalLifetimeGiving: sql<number>`COALESCE(SUM(${donations.amountCents}), 0)`,
      donationCount: drizzleCount(),
      firstGiftDate: sql<Date | null>`MIN(${donations.date})`,
      lastGiftDate: sql<Date | null>`MAX(${donations.date})`,
      averageGiftAmount: sql<number>`COALESCE(AVG(${donations.amountCents}), 0)`,
    })
    .from(donations)
    .where(donationBase);

  // This FY giving
  const [thisFYResult] = await db
    .select({ total: sql<number>`COALESCE(SUM(${donations.amountCents}), 0)` })
    .from(donations)
    .where(
      and(
        donationBase,
        sql`${donations.date} >= ${currentFY.start}`,
        sql`${donations.date} <= ${currentFY.end}`,
      ),
    );

  // Last FY giving
  const [lastFYResult] = await db
    .select({ total: sql<number>`COALESCE(SUM(${donations.amountCents}), 0)` })
    .from(donations)
    .where(
      and(
        donationBase,
        sql`${donations.date} >= ${previousFY.start}`,
        sql`${donations.date} <= ${previousFY.end}`,
      ),
    );

  // Tags — cap at 100 to avoid unbounded relation fetches
  const tagRows = await db.query.contactTags.findMany({
    where: and(eq(contactTags.contactId, contactId), eq(contactTags.orgId, orgId)),
    with: { tag: true },
    limit: 100,
  });

  const contactTagsList: TagInfo[] = tagRows
    .filter((row) => row.tag.orgId === orgId && row.tag.deletedAt == null)
    .map((row) => ({
      id: row.tag.id,
      name: row.tag.name,
      color: row.tag.color,
    }));

  // Affiliated org lookup
  let affiliatedOrg: typeof contacts.$inferSelect | null = null;
  if (contact.affiliatedOrgId) {
    affiliatedOrg =
      (await db.query.contacts.findFirst({
        where: and(
          eq(contacts.id, contact.affiliatedOrgId),
          eq(contacts.orgId, orgId),
          isNull(contacts.deletedAt),
        ),
      })) ?? null;
  }

  return {
    contact,
    givingStats: {
      ...(stats ?? {
        totalLifetimeGiving: 0,
        donationCount: 0,
        firstGiftDate: null,
        lastGiftDate: null,
        averageGiftAmount: 0,
      }),
      totalThisFY: thisFYResult?.total ?? 0,
      totalLastFY: lastFYResult?.total ?? 0,
    },
    tags: contactTagsList,
    affiliatedOrg,
  };
}

// ---------------------------------------------------------------------------
// listContacts
// ---------------------------------------------------------------------------

type ListContactsParams = {
  orgId: string;
  page: number;
  pageSize: number;
  sortBy: "name" | "createdAt" | "lastDonationDate" | "totalGiving";
  sortOrder: "asc" | "desc";
  search?: string;
  pipelineStage?: string;
  tagId?: string;
  type?: string;
};

type ContactListRow = typeof contacts.$inferSelect & {
  lastDonationDate: string | null;
  totalGivingCents: number;
};

export async function listContacts(
  db: Database,
  params: ListContactsParams,
): Promise<{
  data: ContactListRow[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const { orgId, page, pageSize, sortBy, sortOrder, search, pipelineStage, tagId, type } = params;

  // Build WHERE conditions
  const conditions = [eq(contacts.orgId, orgId), isNull(contacts.deletedAt)];

  if (pipelineStage) {
    conditions.push(eq(contacts.pipelineStage, pipelineStage));
  }
  if (type) {
    conditions.push(eq(contacts.type, type));
  }
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    conditions.push(
      or(
        ilike(contacts.firstName, pattern),
        ilike(contacts.lastName, pattern),
        ilike(contacts.email, pattern),
        ilike(contacts.organizationName, pattern),
      )!,
    );
  }
  if (tagId) {
    // Subquery: contacts that have this tag
    conditions.push(
      sql`${contacts.id} IN (
        SELECT ${contactTags.contactId}
        FROM ${contactTags}
        INNER JOIN ${tags} ON ${tags.id} = ${contactTags.tagId}
        WHERE ${contactTags.tagId} = ${tagId}
          AND ${tags.orgId} = ${orgId}
          AND ${tags.deletedAt} IS NULL
      )`,
    );
  }

  const where = and(...conditions);

  // Sort expression
  const sortDir = sortOrder === "desc" ? desc : asc;
  let orderExpr;
  switch (sortBy) {
    case "name":
      orderExpr = sortDir(sql`COALESCE(${contacts.lastName}, ${contacts.organizationName})`);
      break;
    case "createdAt":
      orderExpr = sortDir(contacts.createdAt);
      break;
    case "lastDonationDate":
      orderExpr = sortDir(
        sql`(SELECT MAX(${donations.date}) FROM ${donations} WHERE ${donations.contactId} = ${contacts.id} AND ${donations.orgId} = ${orgId} AND ${donations.deletedAt} IS NULL)`,
      );
      break;
    case "totalGiving":
      orderExpr = sortDir(
        sql`(SELECT COALESCE(SUM(${donations.amountCents}), 0) FROM ${donations} WHERE ${donations.contactId} = ${contacts.id} AND ${donations.orgId} = ${orgId} AND ${donations.deletedAt} IS NULL)`,
      );
      break;
  }

  // Data query — include donation aggregate subqueries so list shows last gift date and total giving.
  // Use raw SQL column names in the correlated subqueries to avoid Drizzle ORM rendering issues
  // with column references inside nested sql templates.
  const rows = await db
    .select({
      ...getTableColumns(contacts),
      lastDonationDate: sql<
        string | null
      >`(SELECT MAX(d.date) FROM donations d WHERE d.contact_id = contacts.id AND d.org_id = ${orgId} AND d.deleted_at IS NULL)`,
      totalGivingCents:
        sql<number>`COALESCE((SELECT SUM(d.amount_cents) FROM donations d WHERE d.contact_id = contacts.id AND d.org_id = ${orgId} AND d.deleted_at IS NULL), 0)`.mapWith(
          Number,
        ),
    })
    .from(contacts)
    .where(where)
    .orderBy(orderExpr)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  // Count query
  const [countResult] = await db.select({ count: drizzleCount() }).from(contacts).where(where);

  return {
    data: rows as ContactListRow[],
    total: countResult?.count ?? 0,
    page,
    pageSize,
  };
}

// ---------------------------------------------------------------------------
// exportContactsCsv
// ---------------------------------------------------------------------------

type ExportContactsParams = {
  orgId: string;
  search?: string;
  pipelineStage?: string;
  tagId?: string;
  type?: string;
};

export async function exportContactsCsv(
  db: Database,
  params: ExportContactsParams,
): Promise<string> {
  const { orgId, search, pipelineStage, tagId, type } = params;

  const conditions = [eq(contacts.orgId, orgId), isNull(contacts.deletedAt)];

  if (pipelineStage) conditions.push(eq(contacts.pipelineStage, pipelineStage));
  if (type) conditions.push(eq(contacts.type, type));
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    conditions.push(
      or(
        ilike(contacts.firstName, pattern),
        ilike(contacts.lastName, pattern),
        ilike(contacts.email, pattern),
        ilike(contacts.organizationName, pattern),
      )!,
    );
  }
  if (tagId) {
    conditions.push(
      sql`${contacts.id} IN (
        SELECT ${contactTags.contactId}
        FROM ${contactTags}
        INNER JOIN ${tags} ON ${tags.id} = ${contactTags.tagId}
        WHERE ${contactTags.tagId} = ${tagId}
          AND ${tags.orgId} = ${orgId}
          AND ${tags.deletedAt} IS NULL
      )`,
    );
  }

  const where = and(...conditions);

  const rows = await db
    .select({
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      organizationName: contacts.organizationName,
      type: contacts.type,
      email: contacts.email,
      phone: contacts.phone,
      pipelineStage: contacts.pipelineStage,
      lastDonationDate: sql<
        string | null
      >`(SELECT MAX(d.date) FROM donations d WHERE d.contact_id = contacts.id AND d.org_id = ${orgId} AND d.deleted_at IS NULL)`,
      totalGivingCents:
        sql<number>`COALESCE((SELECT SUM(d.amount_cents) FROM donations d WHERE d.contact_id = contacts.id AND d.org_id = ${orgId} AND d.deleted_at IS NULL), 0)`.mapWith(
          Number,
        ),
    })
    .from(contacts)
    .where(where)
    .orderBy(asc(sql`COALESCE(${contacts.lastName}, ${contacts.organizationName})`))
    .limit(10_000);

  function escapeCsv(value: string | null | undefined): string {
    return escapeCsvCell(value);
  }

  function formatDateCsv(isoDate: string | null): string {
    if (!isoDate) return "";
    const d = new Date(isoDate);
    return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }

  function formatName(row: (typeof rows)[0]): string {
    if (row.type === "organization") {
      return row.organizationName ?? [row.firstName, row.lastName].filter(Boolean).join(" ");
    }
    return [row.firstName, row.lastName].filter(Boolean).join(" ");
  }

  const header = "Name,Email,Phone,Type,Pipeline Stage,Last Donation Date,Total Giving (USD)";
  const dataLines = rows.map((row) => {
    const totalUsd = (row.totalGivingCents / 100).toFixed(2);
    return [
      escapeCsv(formatName(row)),
      escapeCsv(row.email),
      escapeCsv(row.phone),
      escapeCsv(row.type),
      escapeCsv(row.pipelineStage),
      escapeCsv(formatDateCsv(row.lastDonationDate)),
      escapeCsv(totalUsd),
    ].join(",");
  });

  return [header, ...dataLines].join("\n");
}
