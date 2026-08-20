import { contacts, events, volunteerHours } from "@grantpipe/db";
import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@grantpipe/db";
import type {
  CreateVolunteerHourInput,
  UpdateVolunteerHourInput,
  VolunteerHourListParams,
} from "@grantpipe/shared";
import { createVolunteerHourSchema } from "@grantpipe/shared";
import { recordActivityLog } from "../../lib/activity-log";
import { badRequest, internalError, notFound } from "../../lib/app-error";

type VolunteerRecord = {
  id: string;
  contactId: string;
  eventId?: string | null;
  program?: string | null;
  hours: string | number;
  date: Date | string;
  createdAt?: Date | string;
  deletedAt?: Date | string | null;
  event?: { id: string; name?: string; orgId?: string; deletedAt?: Date | string | null } | null;
  contact?: { id: string; firstName?: string | null; lastName?: string | null } | null;
};

function parseHours(value: string | number) {
  return typeof value === "number" ? value : Number(value);
}

function normalizeVolunteerHourResponse<T extends { hours?: string | number }>(row: T) {
  if (row.hours === undefined) {
    return row;
  }

  return {
    ...row,
    hours: parseHours(row.hours),
  };
}

function toTimestamp(value: Date | string | null | undefined) {
  return value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER;
}

async function assertContactInOrg(db: Database, orgId: string, contactId: string) {
  if (!db.query?.contacts?.findFirst) return;
  const contact = await db.query.contacts.findFirst({
    where: and(eq(contacts.id, contactId), eq(contacts.orgId, orgId), isNull(contacts.deletedAt)),
  });

  if (!contact) throw notFound("Contact not found");
}

async function assertEventInOrg(db: Database, orgId: string, eventId: string) {
  if (!db.query?.events?.findFirst) return;
  const event = await db.query.events.findFirst({
    where: and(eq(events.id, eventId), eq(events.orgId, orgId), isNull(events.deletedAt)),
  });

  if (!event) throw notFound("Event not found");
}

async function assertVolunteerHourInActiveEvent(
  db: Database,
  params: { orgId: string; volunteerHourId: string; allowDeletedEvent?: boolean },
): Promise<VolunteerRecord | undefined> {
  if (!db.query?.volunteerHours?.findFirst) return undefined;
  const volunteerHour = (await db.query.volunteerHours.findFirst({
    with: {
      event: true,
    },
    where: and(
      eq(volunteerHours.orgId, params.orgId),
      eq(volunteerHours.id, params.volunteerHourId),
      isNull(volunteerHours.deletedAt),
    ),
  })) as VolunteerRecord | undefined;

  if (!volunteerHour) {
    throw notFound("Volunteer hour not found");
  }

  if (
    volunteerHour.eventId &&
    !params.allowDeletedEvent &&
    volunteerHour.event?.deletedAt != null
  ) {
    throw notFound("Volunteer hour not found");
  }

  return volunteerHour;
}

export async function listVolunteerHours(
  db: Database,
  params: VolunteerHourListParams & { orgId: string },
) {
  const rows = ((await db.query.volunteerHours.findMany({
    with: {
      event: true,
      contact: true,
    },
    where: and(eq(volunteerHours.orgId, params.orgId), isNull(volunteerHours.deletedAt)),
  })) ?? []) as VolunteerRecord[];

  const filtered = rows
    .filter((row) => row.deletedAt == null)
    .filter((row) => (params.contactId ? row.contactId === params.contactId : true))
    .filter((row) => (params.eventId ? row.eventId === params.eventId : true));

  filtered.sort((left, right) => {
    const direction = params.sortOrder === "asc" ? 1 : -1;
    if (params.sortBy === "hours") {
      return (parseHours(left.hours) - parseHours(right.hours)) * direction;
    }
    if (params.sortBy === "createdAt") {
      return (toTimestamp(left.createdAt) - toTimestamp(right.createdAt)) * direction;
    }

    return (toTimestamp(left.date) - toTimestamp(right.date)) * direction;
  });

  const start = (params.page - 1) * params.pageSize;
  const data = filtered.slice(start, start + params.pageSize).map((row) => ({
    ...row,
    hours: parseHours(row.hours),
  }));

  return {
    data,
    total: filtered.length,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function createVolunteerHour(
  db: Database,
  params: { orgId: string; actorId?: string; data: CreateVolunteerHourInput },
) {
  const data = createVolunteerHourSchema.parse(params.data);
  await assertContactInOrg(db, params.orgId, data.contactId);
  if (data.eventId) {
    await assertEventInOrg(db, params.orgId, data.eventId);
  }

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(volunteerHours)
      .values({
        orgId: params.orgId,
        contactId: data.contactId,
        eventId: data.eventId ?? null,
        program: data.program ?? null,
        hours: String(data.hours),
        date: new Date(data.date),
        notes: data.notes ?? null,
      })
      .returning();

    if (!row) {
      throw internalError("Failed to create volunteer hour");
    }

    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "created",
        entityType: "volunteer_hour",
        entityId: row.id,
        changes: data,
      });
    }

    return row;
  });

  return normalizeVolunteerHourResponse(created);
}

export async function updateVolunteerHour(
  db: Database,
  params: {
    orgId: string;
    actorId?: string;
    volunteerHourId: string;
    data: UpdateVolunteerHourInput;
  },
) {
  const existingVolunteerHour = await assertVolunteerHourInActiveEvent(db, {
    orgId: params.orgId,
    volunteerHourId: params.volunteerHourId,
  });

  if (params.data.eventId !== undefined && params.data.eventId !== null) {
    await assertEventInOrg(db, params.orgId, params.data.eventId);
  }

  if (existingVolunteerHour) {
    const mergedEventId =
      params.data.eventId !== undefined ? params.data.eventId : existingVolunteerHour.eventId;
    const mergedProgram =
      params.data.program !== undefined ? params.data.program : existingVolunteerHour.program;
    const hasProgram =
      typeof mergedProgram === "string" ? mergedProgram.trim().length > 0 : Boolean(mergedProgram);

    if (!mergedEventId && !hasProgram) {
      throw badRequest("Volunteer hours must reference an event or program");
    }
  }

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(volunteerHours)
      .set({
        ...(params.data.eventId !== undefined ? { eventId: params.data.eventId } : {}),
        ...(params.data.program !== undefined ? { program: params.data.program } : {}),
        ...(params.data.hours !== undefined ? { hours: String(params.data.hours) } : {}),
        ...(params.data.date !== undefined ? { date: new Date(params.data.date) } : {}),
        ...(params.data.notes !== undefined ? { notes: params.data.notes } : {}),
      })
      .where(
        and(
          eq(volunteerHours.orgId, params.orgId),
          eq(volunteerHours.id, params.volunteerHourId),
          isNull(volunteerHours.deletedAt),
        ),
      )
      .returning();

    if (!row) {
      throw notFound("Volunteer hour not found");
    }

    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "updated",
        entityType: "volunteer_hour",
        entityId: row.id,
        changes: params.data,
      });
    }

    return row;
  });

  return normalizeVolunteerHourResponse(updated);
}

export async function deleteVolunteerHour(
  db: Database,
  params: { orgId: string; actorId?: string; volunteerHourId: string },
) {
  await assertVolunteerHourInActiveEvent(db, {
    orgId: params.orgId,
    volunteerHourId: params.volunteerHourId,
    allowDeletedEvent: true,
  });

  await db.transaction(async (tx) => {
    const [deleted] = await tx
      .update(volunteerHours)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(volunteerHours.orgId, params.orgId),
          eq(volunteerHours.id, params.volunteerHourId),
          isNull(volunteerHours.deletedAt),
        ),
      )
      .returning();
    if (!deleted) {
      throw notFound("Volunteer hour not found");
    }
    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "deleted",
        entityType: "volunteer_hour",
        entityId: params.volunteerHourId,
        changes: null,
      });
    }
  });
}
