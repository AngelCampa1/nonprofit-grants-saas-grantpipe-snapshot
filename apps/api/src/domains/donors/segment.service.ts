import { eq, and, asc, isNull } from "drizzle-orm";
import { savedSegments } from "@grantpipe/db";
import type { Database } from "@grantpipe/db";
import type { CreateSegmentInput, UpdateSegmentInput } from "@grantpipe/shared";
import { createSegmentSchema, updateSegmentSchema } from "@grantpipe/shared";
import { recordActivityLog } from "../../lib/activity-log";
import { internalError, notFound } from "../../lib/app-error";

export async function listSegments(
  db: Database,
  orgId: string,
): Promise<(typeof savedSegments.$inferSelect)[]> {
  return db
    .select()
    .from(savedSegments)
    .where(and(eq(savedSegments.orgId, orgId), isNull(savedSegments.deletedAt)))
    .orderBy(asc(savedSegments.name));
}

export async function createSegment(
  db: Database,
  params: { orgId: string; actorId?: string; createdBy: string } & CreateSegmentInput,
): Promise<typeof savedSegments.$inferSelect> {
  const data = createSegmentSchema.parse(params);
  const { orgId, actorId, createdBy } = params;

  return db.transaction(async (tx) => {
    const [segment] = await tx
      .insert(savedSegments)
      .values({ orgId, createdBy, ...data, entityType: "contact" })
      .returning();

    if (!segment) throw internalError("Failed to create segment");
    if (actorId) {
      await recordActivityLog(tx, {
        orgId,
        actorId,
        action: "created",
        entityType: "saved_segment",
        entityId: segment.id,
        changes: { ...data, entityType: "contact" },
      });
    }
    return segment;
  });
}

export async function updateSegment(
  db: Database,
  params: { orgId: string; actorId?: string; segmentId: string; data: UpdateSegmentInput },
): Promise<typeof savedSegments.$inferSelect> {
  const data = updateSegmentSchema.parse(params.data);
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(savedSegments)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(savedSegments.id, params.segmentId),
          eq(savedSegments.orgId, params.orgId),
          isNull(savedSegments.deletedAt),
        ),
      )
      .returning();

    if (!updated) throw notFound("Segment not found");
    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "updated",
        entityType: "saved_segment",
        entityId: updated.id,
        changes: data,
      });
    }
    return updated;
  });
}

export async function deleteSegment(
  db: Database,
  params: { orgId: string; actorId?: string; segmentId: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [deleted] = await tx
      .update(savedSegments)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(savedSegments.id, params.segmentId),
          eq(savedSegments.orgId, params.orgId),
          isNull(savedSegments.deletedAt),
        ),
      )
      .returning();

    if (!deleted) throw notFound("Segment not found");
    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "deleted",
        entityType: "saved_segment",
        entityId: deleted.id,
        changes: { name: deleted.name },
      });
    }
  });
}
