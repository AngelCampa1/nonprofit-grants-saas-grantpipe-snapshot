import { events } from "@grantpipe/db";
import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@grantpipe/db";
import type { CreateEventInput, EventListParams, UpdateEventInput } from "@grantpipe/shared";
import { createEventSchema, updateEventSchema } from "@grantpipe/shared";
import { recordActivityLog } from "../../lib/activity-log";
import { internalError, notFound } from "../../lib/app-error";

type EventRecord = {
  id: string;
  name: string;
  type: string;
  date?: Date | string | null;
  createdAt?: Date | string | null;
  location?: string | null;
  description?: string | null;
  revenueGoalCents?: number | null;
  attendees?: Array<{
    id: string;
    deletedAt?: Date | string | null;
    donation?: {
      id?: string | null;
      amountCents?: number | null;
      deletedAt?: Date | string | null;
    } | null;
  }>;
  volunteerHours?: Array<{
    id: string;
    hours?: string | number | null;
    deletedAt?: Date | string | null;
  }>;
};

function parseHours(value: string | number | null | undefined) {
  if (value == null) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toTimestamp(value: Date | string | null | undefined) {
  return value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER;
}

function withSummary(record: EventRecord) {
  const attendees = record.attendees ?? [];
  const activeAttendees = attendees.filter((attendee) => attendee.deletedAt == null);
  const volunteerHours = (record.volunteerHours ?? []).filter((entry) => entry.deletedAt == null);
  // A single donation row can be linked to more than one attendee (donationId
  // has no uniqueness constraint), so dedupe by donation id before summing —
  // otherwise shared donations inflate the event's reported revenue. Donations
  // without an id (cannot be deduped) are each counted once.
  const countedDonationIds = new Set<string>();
  const revenueCents = activeAttendees.reduce((total, attendee) => {
    const donation = attendee.donation;
    if (!donation || donation.deletedAt != null) {
      return total;
    }

    if (donation.id != null) {
      if (countedDonationIds.has(donation.id)) {
        return total;
      }
      countedDonationIds.add(donation.id);
    }

    return total + Number(donation.amountCents ?? 0);
  }, 0);
  const volunteerHoursTotal = volunteerHours.reduce(
    (total, entry) => total + parseHours(entry.hours),
    0,
  );

  return {
    ...record,
    attendees: activeAttendees,
    volunteerHours,
    summary: {
      attendeeCount: activeAttendees.length,
      revenueCents,
      volunteerHoursTotal,
    },
    attendeeCount: activeAttendees.length,
  };
}

export async function listEvents(db: Database, params: EventListParams & { orgId: string }) {
  const rows = ((await db.query.events.findMany({
    with: {
      attendees: {
        with: {
          donation: true,
        },
      },
      volunteerHours: true,
    },
    where: and(eq(events.orgId, params.orgId), isNull(events.deletedAt)),
  })) ?? []) as EventRecord[];

  const now = new Date();
  const filtered = rows.filter((row) => {
    const matchesSearch = params.search
      ? row.name.toLowerCase().includes(params.search.toLowerCase())
      : true;
    const matchesType = params.type ? row.type === params.type : true;
    const eventDate = row.date ? new Date(row.date) : null;
    const matchesTimeframe =
      params.timeframe === "upcoming"
        ? eventDate === null || eventDate >= now
        : params.timeframe === "past"
          ? eventDate !== null && eventDate < now
          : true;

    return matchesSearch && matchesType && matchesTimeframe;
  });

  filtered.sort((left, right) => {
    const direction = params.sortOrder === "desc" ? -1 : 1;
    if (params.sortBy === "name") {
      return left.name.localeCompare(right.name) * direction;
    }
    if (params.sortBy === "createdAt") {
      return (toTimestamp(left.createdAt) - toTimestamp(right.createdAt)) * direction;
    }

    return (toTimestamp(left.date) - toTimestamp(right.date)) * direction;
  });

  const start = (params.page - 1) * params.pageSize;
  const paged = filtered.slice(start, start + params.pageSize).map(withSummary);

  return {
    data: paged,
    total: filtered.length,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function getEvent(db: Database, params: { orgId: string; eventId: string }) {
  const event = (await db.query.events.findFirst({
    with: {
      attendees: {
        with: {
          contact: true,
          donation: true,
        },
      },
      volunteerHours: true,
    },
    where: and(
      eq(events.orgId, params.orgId),
      eq(events.id, params.eventId),
      isNull(events.deletedAt),
    ),
  })) as EventRecord | undefined;

  if (!event) {
    throw notFound("Event not found");
  }

  return withSummary(event);
}

export async function createEvent(
  db: Database,
  params: CreateEventInput & { orgId: string; actorId?: string },
) {
  const data = createEventSchema.parse(params);

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(events)
      .values({
        orgId: params.orgId,
        name: data.name,
        type: data.type,
        date: data.date ? new Date(data.date) : null,
        location: data.location ?? null,
        description: data.description ?? null,
        revenueGoalCents: data.revenueGoalCents ?? null,
      })
      .returning();

    if (!created) {
      throw internalError("Failed to create event");
    }

    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "created",
        entityType: "event",
        entityId: created.id,
        changes: { name: created.name, type: created.type },
      });
    }

    return created;
  });
}

export async function updateEvent(
  db: Database,
  params: { orgId: string; actorId?: string; eventId: string; data: UpdateEventInput },
) {
  const data = updateEventSchema.parse(params.data);

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(events)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.date !== undefined ? { date: data.date ? new Date(data.date) : null } : {}),
        ...(data.location !== undefined ? { location: data.location } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.revenueGoalCents !== undefined ? { revenueGoalCents: data.revenueGoalCents } : {}),
      })
      .where(
        and(
          eq(events.orgId, params.orgId),
          eq(events.id, params.eventId),
          isNull(events.deletedAt),
        ),
      )
      .returning();

    if (!updated) {
      throw notFound("Event not found");
    }

    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "updated",
        entityType: "event",
        entityId: updated.id,
        changes: data,
      });
    }

    return updated;
  });
}

export async function deleteEvent(
  db: Database,
  params: { orgId: string; actorId?: string; eventId: string },
) {
  await db.transaction(async (tx) => {
    const [deleted] = await tx
      .update(events)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(events.orgId, params.orgId),
          eq(events.id, params.eventId),
          isNull(events.deletedAt),
        ),
      )
      .returning();

    if (!deleted) {
      throw notFound("Event not found");
    }

    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "deleted",
        entityType: "event",
        entityId: params.eventId,
        changes: null,
      });
    }
  });
}
