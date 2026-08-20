import { eq, and, desc, count as drizzleCount, getTableColumns } from "drizzle-orm";
import { communicationLog, user } from "@grantpipe/db";
import type { Database } from "@grantpipe/db";
import type { CreateCommunicationInput } from "@grantpipe/shared";
import { createCommunicationSchema } from "@grantpipe/shared";
import { recordActivityLog } from "../../lib/activity-log";
import { internalError } from "../../lib/app-error";
import { assertContactInOrg } from "./donor-guards";

export async function createCommunication(
  db: Database,
  params: {
    orgId: string;
    actorId?: string;
    contactId: string;
    loggedBy: string;
  } & CreateCommunicationInput,
): Promise<typeof communicationLog.$inferSelect> {
  const data = createCommunicationSchema.parse(params);
  const { orgId, actorId, contactId, loggedBy } = params;

  await assertContactInOrg(db, orgId, contactId);

  return db.transaction(async (tx) => {
    const [entry] = await tx
      .insert(communicationLog)
      .values({ orgId, contactId, loggedBy, ...data })
      .returning();

    if (!entry) throw internalError("Failed to create communication");
    if (actorId) {
      await recordActivityLog(tx, {
        orgId,
        actorId,
        action: "created_communication",
        entityType: "contact",
        entityId: contactId,
        changes: {
          communicationId: entry.id,
          type: entry.type,
          subject: entry.subject,
        },
      });
    }
    return entry;
  });
}

type CommunicationWithLoggerName = typeof communicationLog.$inferSelect & {
  loggedByName: string | null;
};

export async function listCommunications(
  db: Database,
  params: { orgId: string; contactId: string; page: number; pageSize: number },
): Promise<{
  data: CommunicationWithLoggerName[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const { orgId, contactId, page, pageSize } = params;

  const where = and(eq(communicationLog.orgId, orgId), eq(communicationLog.contactId, contactId));

  const data = await db
    .select({
      ...getTableColumns(communicationLog),
      loggedByName: user.name,
    })
    .from(communicationLog)
    .leftJoin(user, eq(communicationLog.loggedBy, user.id))
    .where(where)
    .orderBy(desc(communicationLog.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [countResult] = await db
    .select({ count: drizzleCount() })
    .from(communicationLog)
    .where(where);

  return {
    data: data as CommunicationWithLoggerName[],
    total: countResult?.count ?? 0,
    page,
    pageSize,
  };
}
