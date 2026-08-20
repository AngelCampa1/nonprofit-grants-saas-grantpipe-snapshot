import { eq, and, asc, inArray, isNull } from "drizzle-orm";
import { tags, contactTags } from "@grantpipe/db";
import type { Database } from "@grantpipe/db";
import type { AddTagsInput, CreateTagInput, UpdateTagInput } from "@grantpipe/shared";
import { addTagsSchema, createTagSchema, updateTagSchema } from "@grantpipe/shared";
import { recordActivityLog } from "../../lib/activity-log";
import { internalError, notFound } from "../../lib/app-error";
import { assertContactInOrg } from "./donor-guards";

export async function listTags(db: Database, orgId: string): Promise<(typeof tags.$inferSelect)[]> {
  return db
    .select()
    .from(tags)
    .where(and(eq(tags.orgId, orgId), isNull(tags.deletedAt)))
    .orderBy(asc(tags.name));
}

export async function createTag(
  db: Database,
  params: { orgId: string; actorId?: string } & CreateTagInput,
): Promise<typeof tags.$inferSelect> {
  const data = createTagSchema.parse(params);
  const { orgId, actorId } = params;
  return db.transaction(async (tx) => {
    const [tag] = await tx
      .insert(tags)
      .values({ orgId, ...data })
      .returning();
    if (!tag) throw internalError("Failed to create tag");
    if (actorId) {
      await recordActivityLog(tx, {
        orgId,
        actorId,
        action: "created",
        entityType: "tag",
        entityId: tag.id,
        changes: data,
      });
    }
    return tag;
  });
}

export async function updateTag(
  db: Database,
  params: { orgId: string; actorId?: string; tagId: string; data: UpdateTagInput },
): Promise<typeof tags.$inferSelect> {
  const data = updateTagSchema.parse(params.data);
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(tags)
      .set(data)
      .where(and(eq(tags.id, params.tagId), eq(tags.orgId, params.orgId), isNull(tags.deletedAt)))
      .returning();

    if (!updated) throw notFound("Tag not found");
    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "updated",
        entityType: "tag",
        entityId: updated.id,
        changes: data,
      });
    }
    return updated;
  });
}

async function assertTagsInOrg(db: Database, orgId: string, tagIds: string[]): Promise<void> {
  const uniqueTagIds = [...new Set(tagIds)];
  const rows = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.orgId, orgId), inArray(tags.id, uniqueTagIds), isNull(tags.deletedAt)));

  if (rows.length !== uniqueTagIds.length) throw notFound("Tag not found");
}

export async function deleteTag(
  db: Database,
  params: { orgId: string; actorId?: string; tagId: string },
): Promise<void> {
  const tag = await db.query.tags.findFirst({
    where: and(eq(tags.id, params.tagId), eq(tags.orgId, params.orgId), isNull(tags.deletedAt)),
    columns: { id: true },
  });

  if (!tag) throw notFound("Tag not found");

  await db.transaction(async (tx) => {
    await tx
      .delete(contactTags)
      .where(and(eq(contactTags.orgId, params.orgId), eq(contactTags.tagId, params.tagId)));
    const [deleted] = await tx
      .update(tags)
      .set({ deletedAt: new Date() })
      .where(and(eq(tags.id, params.tagId), eq(tags.orgId, params.orgId), isNull(tags.deletedAt)))
      .returning();

    if (!deleted) throw notFound("Tag not found");
    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "deleted",
        entityType: "tag",
        entityId: params.tagId,
        changes: null,
      });
    }
  });
}

export async function addContactTags(
  db: Database,
  params: { orgId: string; actorId?: string; contactId: string } & AddTagsInput,
): Promise<void> {
  const { tagIds } = addTagsSchema.parse({ tagIds: params.tagIds });
  await assertContactInOrg(db, params.orgId, params.contactId);
  await assertTagsInOrg(db, params.orgId, tagIds);

  const rows = tagIds.map((tagId) => ({
    orgId: params.orgId,
    contactId: params.contactId,
    tagId,
  }));
  await db.transaction(async (tx) => {
    await tx.insert(contactTags).values(rows).onConflictDoNothing();
    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "tags_added",
        entityType: "contact",
        entityId: params.contactId,
        changes: { tagIds },
      });
    }
  });
}

export async function removeContactTag(
  db: Database,
  params: { orgId: string; actorId?: string; contactId: string; tagId: string },
): Promise<void> {
  await assertContactInOrg(db, params.orgId, params.contactId);
  await assertTagsInOrg(db, params.orgId, [params.tagId]);

  await db.transaction(async (tx) => {
    await tx
      .delete(contactTags)
      .where(
        and(
          eq(contactTags.orgId, params.orgId),
          eq(contactTags.contactId, params.contactId),
          eq(contactTags.tagId, params.tagId),
        ),
      );
    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "tag_removed",
        entityType: "contact",
        entityId: params.contactId,
        changes: { tagId: params.tagId },
      });
    }
  });
}
