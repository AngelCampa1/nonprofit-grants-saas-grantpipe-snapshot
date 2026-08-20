import { and, eq, isNull, desc, count } from "drizzle-orm";
import {
  evidenceBundles,
  evidenceBundleItems,
  type EvidenceBundle,
  type EvidenceBundleItem,
} from "@grantpipe/db";
import type { TransactionDatabase } from "@grantpipe/db";
import {
  type CreateBundleInput,
  type UpdateBundleInput,
  type ListBundlesInput,
  type AddBundleItemInput,
  type ReorderBundleItemsInput,
} from "@grantpipe/shared";
import { recordActivityLog } from "../../lib/activity-log";
import { notFound } from "../../lib/app-error";
import { toJsonSafeCount } from "./list-utils";
import { assertScopeTargetBelongsToOrg } from "./scope-targets";

export async function createBundle(
  db: TransactionDatabase,
  orgId: string,
  actorId: string,
  input: CreateBundleInput,
): Promise<EvidenceBundle> {
  return db.transaction(async (tx) => {
    const [bundle] = await tx
      .insert(evidenceBundles)
      .values({
        orgId,
        title: input.title,
        description: input.description ?? null,
        purpose: input.purpose,
        periodStart: input.periodStart ? new Date(input.periodStart) : null,
        periodEnd: input.periodEnd ? new Date(input.periodEnd) : null,
        createdBy: actorId,
      })
      .returning();

    if (!bundle) {
      throw new Error("Failed to create bundle");
    }

    await recordActivityLog(tx, {
      orgId,
      actorId,
      action: "create",
      entityType: "evidence_bundle",
      entityId: bundle.id,
      entityLabel: bundle.title,
      changes: { after: bundle },
    });

    return bundle;
  });
}

export async function updateBundle(
  db: TransactionDatabase,
  orgId: string,
  bundleId: string,
  actorId: string,
  input: UpdateBundleInput,
): Promise<EvidenceBundle> {
  const before = await db.query.evidenceBundles.findFirst({
    where: and(
      eq(evidenceBundles.id, bundleId),
      eq(evidenceBundles.orgId, orgId),
      isNull(evidenceBundles.deletedAt),
    ),
  });

  if (!before) {
    throw notFound("Bundle not found");
  }

  return db.transaction(async (tx) => {
    const [bundle] = await tx
      .update(evidenceBundles)
      .set({
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.purpose !== undefined && { purpose: input.purpose }),
        ...(input.periodStart !== undefined && { periodStart: new Date(input.periodStart) }),
        ...(input.periodEnd !== undefined && { periodEnd: new Date(input.periodEnd) }),
      })
      .where(
        and(
          eq(evidenceBundles.id, bundleId),
          eq(evidenceBundles.orgId, orgId),
          isNull(evidenceBundles.deletedAt),
        ),
      )
      .returning();

    if (!bundle) {
      throw notFound("Bundle not found");
    }

    await recordActivityLog(tx, {
      orgId,
      actorId,
      action: "update",
      entityType: "evidence_bundle",
      entityId: bundle.id,
      entityLabel: bundle.title,
      changes: { before, after: bundle },
    });

    return bundle;
  });
}

export async function softDeleteBundle(
  db: TransactionDatabase,
  orgId: string,
  bundleId: string,
  actorId: string,
): Promise<void> {
  const before = await db.query.evidenceBundles.findFirst({
    where: and(
      eq(evidenceBundles.id, bundleId),
      eq(evidenceBundles.orgId, orgId),
      isNull(evidenceBundles.deletedAt),
    ),
  });

  if (!before) {
    throw notFound("Bundle not found");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(evidenceBundles)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(evidenceBundles.id, bundleId),
          eq(evidenceBundles.orgId, orgId),
          isNull(evidenceBundles.deletedAt),
        ),
      );

    await recordActivityLog(tx, {
      orgId,
      actorId,
      action: "delete",
      entityType: "evidence_bundle",
      entityId: bundleId,
      entityLabel: before.title,
      changes: { before },
    });
  });
}

export async function publishBundle(
  db: TransactionDatabase,
  orgId: string,
  bundleId: string,
  actorId: string,
): Promise<EvidenceBundle> {
  const before = await db.query.evidenceBundles.findFirst({
    where: and(
      eq(evidenceBundles.id, bundleId),
      eq(evidenceBundles.orgId, orgId),
      isNull(evidenceBundles.deletedAt),
    ),
  });

  if (!before) {
    throw notFound("Bundle not found");
  }

  return db.transaction(async (tx) => {
    const [bundle] = await tx
      .update(evidenceBundles)
      .set({ publishedAt: new Date() })
      .where(
        and(
          eq(evidenceBundles.id, bundleId),
          eq(evidenceBundles.orgId, orgId),
          isNull(evidenceBundles.deletedAt),
        ),
      )
      .returning();

    if (!bundle) {
      throw notFound("Bundle not found");
    }

    await recordActivityLog(tx, {
      orgId,
      actorId,
      action: "update",
      entityType: "evidence_bundle",
      entityId: bundle.id,
      entityLabel: bundle.title,
      changes: { before, after: bundle },
    });

    return bundle;
  });
}

export async function getBundle(
  db: TransactionDatabase,
  orgId: string,
  bundleId: string,
): Promise<{ bundle: EvidenceBundle; items: EvidenceBundleItem[] } | null> {
  const bundle = await db.query.evidenceBundles.findFirst({
    where: and(
      eq(evidenceBundles.id, bundleId),
      eq(evidenceBundles.orgId, orgId),
      isNull(evidenceBundles.deletedAt),
    ),
  });

  if (!bundle) return null;

  const items = await db
    .select()
    .from(evidenceBundleItems)
    .where(eq(evidenceBundleItems.bundleId, bundleId))
    .orderBy(evidenceBundleItems.sortOrder);

  return { bundle, items };
}

async function assertBundleBelongsToOrg(
  db: TransactionDatabase,
  orgId: string,
  bundleId: string,
): Promise<void> {
  const bundle = await db.query.evidenceBundles.findFirst({
    where: and(
      eq(evidenceBundles.id, bundleId),
      eq(evidenceBundles.orgId, orgId),
      isNull(evidenceBundles.deletedAt),
    ),
  });

  if (!bundle) {
    throw notFound("Bundle not found");
  }
}

export async function listBundles(
  db: TransactionDatabase,
  orgId: string,
  params: ListBundlesInput,
): Promise<{ items: EvidenceBundle[]; total: number }> {
  const conditions = [eq(evidenceBundles.orgId, orgId)];

  if (!params.includeDeleted) {
    conditions.push(isNull(evidenceBundles.deletedAt));
  }

  if (params.purpose) {
    conditions.push(eq(evidenceBundles.purpose, params.purpose));
  }

  const whereClause = and(...conditions);

  const [countResult] = await db
    .select({ value: count() })
    .from(evidenceBundles)
    .where(whereClause);

  const total = toJsonSafeCount(countResult?.value);

  const items = await db
    .select()
    .from(evidenceBundles)
    .where(whereClause)
    .orderBy(desc(evidenceBundles.createdAt))
    .limit(params.pageSize)
    .offset((params.page - 1) * params.pageSize);

  return { items, total };
}

export async function addBundleItem(
  db: TransactionDatabase,
  orgId: string,
  bundleId: string,
  input: AddBundleItemInput,
): Promise<EvidenceBundleItem> {
  await assertBundleBelongsToOrg(db, orgId, bundleId);
  await assertScopeTargetBelongsToOrg(
    db,
    orgId,
    { scopeType: input.itemType, scopeId: input.itemId },
    "Bundle item not found",
  );

  const [item] = await db
    .insert(evidenceBundleItems)
    .values({
      bundleId,
      itemType: input.itemType,
      itemId: input.itemId,
      caption: input.caption ?? null,
      sortOrder: input.sortOrder,
    })
    .returning();

  if (!item) {
    throw new Error("Failed to add bundle item");
  }

  return item;
}

export async function removeBundleItem(
  db: TransactionDatabase,
  orgId: string,
  bundleId: string,
  itemId: string,
  actorId: string,
): Promise<void> {
  await assertBundleBelongsToOrg(db, orgId, bundleId);

  await db.transaction(async (tx) => {
    const [deletedItem] = await tx
      .delete(evidenceBundleItems)
      .where(and(eq(evidenceBundleItems.bundleId, bundleId), eq(evidenceBundleItems.id, itemId)))
      .returning();

    if (!deletedItem) {
      throw notFound("Bundle item not found");
    }

    await recordActivityLog(tx, {
      orgId,
      actorId,
      action: "delete",
      entityType: "evidence_bundle_item",
      entityId: itemId,
      changes: { bundleId },
    });
  });
}

export async function reorderBundleItems(
  db: TransactionDatabase,
  orgId: string,
  bundleId: string,
  input: ReorderBundleItemsInput,
): Promise<void> {
  await assertBundleBelongsToOrg(db, orgId, bundleId);

  for (let i = 0; i < input.itemIds.length; i++) {
    await db
      .update(evidenceBundleItems)
      .set({ sortOrder: i })
      .where(
        and(
          eq(evidenceBundleItems.bundleId, bundleId),
          eq(evidenceBundleItems.id, input.itemIds[i]!),
        ),
      );
  }
}
