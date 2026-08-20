import { and, asc, count as drizzleCount, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { funderContacts, funders, grants, organizations } from "@grantpipe/db";
import type { Database } from "@grantpipe/db";
import type {
  CreateFunderContactInput,
  CreateFunderInput,
  FunderListParams,
  UpdateFunderContactInput,
  UpdateFunderInput,
} from "@grantpipe/shared";
import { recordActivityLog } from "../../lib/activity-log";
import { conflict, internalError, notFound } from "../../lib/app-error";

type FunderContactRecord = {
  id: string;
  deletedAt?: Date | null;
};

type FunderGrantRecord = {
  id: string;
  deletedAt?: Date | null;
};

type EntityScopedParams = { entityId?: string };

function entityScopeCondition(entityId: string | undefined) {
  return entityId ? eq(funders.entityId, entityId) : undefined;
}

function contactEntityScopeCondition(entityId: string | undefined) {
  return entityId ? eq(funderContacts.entityId, entityId) : undefined;
}

async function assertFunderInOrg(db: Database, orgId: string, funderId: string, entityId?: string) {
  if (!db.query?.funders?.findFirst) return undefined;
  const funder = await db.query.funders.findFirst({
    where: and(
      eq(funders.id, funderId),
      eq(funders.orgId, orgId),
      entityScopeCondition(entityId),
      isNull(funders.deletedAt),
    ),
  });

  if (!funder) throw notFound("Funder not found");
  return funder;
}

async function resolveDefaultEntityId(db: Database, orgId: string) {
  const org = await db.query?.organizations?.findFirst?.({
    where: eq(organizations.id, orgId),
    columns: { defaultEntityId: true },
  });
  if (org?.defaultEntityId) return org.defaultEntityId;
  return "entity-1";
}

export async function listFunders(
  db: Database,
  params: { orgId: string } & EntityScopedParams & FunderListParams,
) {
  const { orgId, page, pageSize, search, type, sortBy, sortOrder } = params;
  const conditions = [
    eq(funders.orgId, orgId),
    entityScopeCondition(params.entityId),
    isNull(funders.deletedAt),
  ];

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(or(ilike(funders.name, pattern), ilike(funders.priorities, pattern))!);
  }

  if (type) {
    conditions.push(eq(funders.type, type));
  }

  const where = and(...conditions);
  const sortFn = sortOrder === "desc" ? desc : asc;
  const sortColumn =
    sortBy === "type" ? funders.type : sortBy === "createdAt" ? funders.createdAt : funders.name;

  const data = await db
    .select()
    .from(funders)
    .where(where)
    .orderBy(sortFn(sortColumn))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [countResult] = await db.select({ count: drizzleCount() }).from(funders).where(where);

  return {
    data,
    total: countResult?.count ?? 0,
    page,
    pageSize,
  };
}

export async function getFunder(
  db: Database,
  params: { orgId: string; funderId: string } & EntityScopedParams,
) {
  const funder = await db.query.funders.findFirst({
    where: and(
      eq(funders.id, params.funderId),
      eq(funders.orgId, params.orgId),
      entityScopeCondition(params.entityId),
      isNull(funders.deletedAt),
    ),
    with: {
      contacts: true,
      grants: true,
    },
  });

  if (!funder) throw notFound("Funder not found");

  const contacts = (funder.contacts as FunderContactRecord[]).filter(
    (contact) => contact.deletedAt === undefined || contact.deletedAt === null,
  );
  const grants = (funder.grants as FunderGrantRecord[]).filter(
    (grant) => grant.deletedAt === undefined || grant.deletedAt === null,
  );

  return {
    ...funder,
    contacts,
    grants,
  };
}

export async function createFunder(
  db: Database,
  params: { orgId: string; actorId?: string } & EntityScopedParams & CreateFunderInput,
) {
  const activeEntityId = params.entityId ?? (await resolveDefaultEntityId(db, params.orgId));
  return db.transaction(async (tx) => {
    const [funder] = await tx
      .insert(funders)
      .values({
        orgId: params.orgId,
        entityId: activeEntityId,
        name: params.name,
        type: params.type,
        website: params.website,
        priorities: params.priorities,
        notes: params.notes,
      })
      .returning();
    if (!funder) throw internalError("Failed to create funder");
    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        activeEntityId,
        actorId: params.actorId,
        action: "created",
        entityType: "funder",
        entityId: funder.id,
        changes: { name: funder.name, type: funder.type },
      });
    }
    return funder;
  });
}

export async function updateFunder(
  db: Database,
  params: {
    orgId: string;
    actorId?: string;
    funderId: string;
    data: UpdateFunderInput;
  } & EntityScopedParams,
) {
  return db.transaction(async (tx) => {
    const [funder] = await tx
      .update(funders)
      .set({
        name: params.data.name,
        type: params.data.type,
        website: params.data.website,
        priorities: params.data.priorities,
        notes: params.data.notes,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(funders.id, params.funderId),
          eq(funders.orgId, params.orgId),
          entityScopeCondition(params.entityId),
          isNull(funders.deletedAt),
        ),
      )
      .returning();

    if (!funder) throw notFound("Funder not found");
    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        activeEntityId: params.entityId,
        actorId: params.actorId,
        action: "updated",
        entityType: "funder",
        entityId: funder.id,
        changes: params.data,
      });
    }
    return funder;
  });
}

export async function deleteFunder(
  db: Database,
  params: { orgId: string; actorId?: string; funderId: string } & EntityScopedParams,
) {
  const [activeGrantCount] = await db
    .select({ count: drizzleCount() })
    .from(grants)
    .where(
      and(
        eq(grants.funderId, params.funderId),
        eq(grants.orgId, params.orgId),
        params.entityId ? eq(grants.entityId, params.entityId) : undefined,
        isNull(grants.deletedAt),
      ),
    );

  if ((activeGrantCount?.count ?? 0) > 0) {
    throw conflict("Cannot delete funder with active grants");
  }

  await db.transaction(async (tx) => {
    const [funder] = await tx
      .update(funders)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(funders.id, params.funderId),
          eq(funders.orgId, params.orgId),
          entityScopeCondition(params.entityId),
          isNull(funders.deletedAt),
        ),
      )
      .returning();

    if (!funder) throw notFound("Funder not found");
    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        activeEntityId: params.entityId,
        actorId: params.actorId,
        action: "deleted",
        entityType: "funder",
        entityId: params.funderId,
        changes: null,
      });
    }
  });
}

export async function createFunderContact(
  db: Database,
  params: { orgId: string; actorId?: string; funderId: string } & EntityScopedParams &
    CreateFunderContactInput,
) {
  const funder = await assertFunderInOrg(db, params.orgId, params.funderId, params.entityId);
  const activeEntityId =
    params.entityId ?? funder?.entityId ?? (await resolveDefaultEntityId(db, params.orgId));
  return db.transaction(async (tx) => {
    const [contact] = await tx
      .insert(funderContacts)
      .values({
        orgId: params.orgId,
        entityId: activeEntityId,
        funderId: params.funderId,
        name: params.name,
        title: params.title,
        email: params.email,
        phone: params.phone,
        notes: params.notes,
      })
      .returning();
    if (!contact) throw internalError("Failed to create funder contact");
    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        activeEntityId,
        actorId: params.actorId,
        action: "created",
        entityType: "funder_contact",
        entityId: contact.id,
        changes: { funderId: params.funderId, name: contact.name, title: contact.title },
      });
    }
    return contact;
  });
}

export async function updateFunderContact(
  db: Database,
  params: {
    orgId: string;
    actorId?: string;
    funderId: string;
    contactId: string;
    data: UpdateFunderContactInput;
  } & EntityScopedParams,
) {
  await assertFunderInOrg(db, params.orgId, params.funderId, params.entityId);
  return db.transaction(async (tx) => {
    const [contact] = await tx
      .update(funderContacts)
      .set({
        name: params.data.name,
        title: params.data.title,
        email: params.data.email,
        phone: params.data.phone,
        notes: params.data.notes,
      })
      .where(
        and(
          eq(funderContacts.id, params.contactId),
          eq(funderContacts.funderId, params.funderId),
          eq(funderContacts.orgId, params.orgId),
          contactEntityScopeCondition(params.entityId),
          isNull(funderContacts.deletedAt),
        ),
      )
      .returning();

    if (!contact) throw notFound("Funder contact not found");
    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        activeEntityId: params.entityId,
        actorId: params.actorId,
        action: "updated",
        entityType: "funder_contact",
        entityId: contact.id,
        changes: params.data,
      });
    }
    return contact;
  });
}

export async function deleteFunderContact(
  db: Database,
  params: {
    orgId: string;
    actorId?: string;
    funderId: string;
    contactId: string;
  } & EntityScopedParams,
) {
  await assertFunderInOrg(db, params.orgId, params.funderId, params.entityId);
  await db.transaction(async (tx) => {
    const [contact] = await tx
      .update(funderContacts)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(funderContacts.id, params.contactId),
          eq(funderContacts.funderId, params.funderId),
          eq(funderContacts.orgId, params.orgId),
          contactEntityScopeCondition(params.entityId),
          isNull(funderContacts.deletedAt),
        ),
      )
      .returning();

    if (!contact) throw notFound("Funder contact not found");
    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        activeEntityId: params.entityId,
        actorId: params.actorId,
        action: "deleted",
        entityType: "funder_contact",
        entityId: params.contactId,
        changes: null,
      });
    }
  });
}
