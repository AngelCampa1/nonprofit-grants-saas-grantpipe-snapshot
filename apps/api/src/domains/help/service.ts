import { and, asc, eq } from "drizzle-orm";
import { userGuideProgress, type Database } from "@grantpipe/db";
import type { GuideKey, UpdateGuideProgressInput } from "@grantpipe/shared";

type GuideProgressParams = {
  orgId: string;
  userId: string;
};

function toApiRow(row: typeof userGuideProgress.$inferSelect) {
  return {
    guideKey: row.guideKey as GuideKey,
    status: row.status,
    lastStep: row.lastStep,
    completedAt: row.completedAt?.toISOString() ?? null,
    dismissedAt: row.dismissedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function getStatusTimestamps(status: UpdateGuideProgressInput["status"]) {
  const now = new Date();
  return {
    completedAt: status === "completed" ? now : null,
    dismissedAt: status === "dismissed" ? now : null,
  };
}

export async function listGuideProgress(db: Database, params: GuideProgressParams) {
  const rows = await db
    .select()
    .from(userGuideProgress)
    .where(
      and(eq(userGuideProgress.orgId, params.orgId), eq(userGuideProgress.userId, params.userId)),
    )
    .orderBy(asc(userGuideProgress.guideKey));

  return rows.map(toApiRow);
}

export async function upsertGuideProgress(
  db: Database,
  params: GuideProgressParams & {
    guideKey: GuideKey;
    data: UpdateGuideProgressInput;
  },
) {
  const now = new Date();
  const timestamps = getStatusTimestamps(params.data.status);
  const values = {
    orgId: params.orgId,
    userId: params.userId,
    guideKey: params.guideKey,
    status: params.data.status,
    lastStep: params.data.lastStep ?? null,
    completedAt: timestamps.completedAt,
    dismissedAt: timestamps.dismissedAt,
    updatedAt: now,
  };

  const [row] = await db
    .insert(userGuideProgress)
    .values(values)
    .onConflictDoUpdate({
      target: [userGuideProgress.orgId, userGuideProgress.userId, userGuideProgress.guideKey],
      set: values,
    })
    .returning();

  if (!row) {
    throw new Error("Failed to save guide progress");
  }

  return toApiRow(row);
}
