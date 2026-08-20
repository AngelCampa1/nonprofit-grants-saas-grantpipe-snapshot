import { contacts, donations, eventAttendees, events, funds, grants } from "@grantpipe/db";
import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@grantpipe/db";
import type {
  CreateAttendeeDonationInput,
  CreateAttendeeInput,
  LinkAttendeeDonationInput,
  UpdateAttendeeInput,
} from "@grantpipe/shared";
import { createAttendeeSchema, updateAttendeeSchema } from "@grantpipe/shared";
import { recordActivityLog } from "../../lib/activity-log";
import { internalError, notFound } from "../../lib/app-error";
import { postDonation } from "../accounting/postingEngine";
import { assertFundAllocatedToGrant } from "../donors/donation.service";

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

async function assertAffiliatedOrgInTenant(
  db: Database,
  orgId: string,
  affiliatedOrgId: string | null | undefined,
) {
  if (!affiliatedOrgId || !db.query?.contacts?.findFirst) return;

  const affiliatedOrg = await db.query.contacts.findFirst({
    where: and(
      eq(contacts.id, affiliatedOrgId),
      eq(contacts.orgId, orgId),
      isNull(contacts.deletedAt),
    ),
  });

  if (!affiliatedOrg) throw notFound("Affiliated organization not found");
}

async function assertDonationInOrgForContact(
  db: Database,
  orgId: string,
  contactId: string,
  donationId: string,
) {
  if (!db.query?.donations?.findFirst) return;
  const donation = await db.query.donations.findFirst({
    where: and(
      eq(donations.id, donationId),
      eq(donations.contactId, contactId),
      eq(donations.orgId, orgId),
      isNull(donations.deletedAt),
    ),
  });

  if (
    !donation ||
    donation.contactId !== contactId ||
    donation.orgId !== orgId ||
    donation.deletedAt != null
  ) {
    throw notFound("Donation not found for attendee contact");
  }
}

async function getAttendee(
  db: Database,
  params: { orgId: string; eventId: string; attendeeId: string; allowDeletedEvent?: boolean },
) {
  const attendee = await db.query.eventAttendees.findFirst({
    with: {
      event: true,
    },
    where: and(
      eq(eventAttendees.eventId, params.eventId),
      eq(eventAttendees.id, params.attendeeId),
      isNull(eventAttendees.deletedAt),
    ),
  });

  if (!attendee || attendee.event?.orgId !== params.orgId) {
    return undefined;
  }

  if (!params.allowDeletedEvent && attendee.event.deletedAt != null) {
    return undefined;
  }

  return attendee;
}

export async function createAttendee(
  db: Database,
  params: { orgId?: string; actorId?: string; eventId: string; data: CreateAttendeeInput },
) {
  const data = createAttendeeSchema.parse(params.data);
  if (params.orgId) {
    await assertEventInOrg(db, params.orgId, params.eventId);
  }
  let contactId = data.mode === "existing_contact" ? data.contactId : "";

  if (data.mode === "existing_contact") {
    await assertContactInOrg(db, params.orgId!, data.contactId);
  }

  if (data.mode === "new_contact") {
    await assertAffiliatedOrgInTenant(db, params.orgId!, data.contact.affiliatedOrgId);
  }

  return db.transaction(async (tx) => {
    if (data.mode === "new_contact") {
      const [createdContact] = await tx
        .insert(contacts)
        .values({
          orgId: params.orgId!,
          type: data.contact.type,
          firstName: data.contact.firstName ?? null,
          lastName: data.contact.lastName ?? null,
          organizationName: data.contact.organizationName ?? null,
          email: data.contact.email ?? null,
          phone: data.contact.phone ?? null,
          address: data.contact.address ?? null,
          pipelineStage: data.contact.pipelineStage,
          affiliatedOrgId: data.contact.affiliatedOrgId ?? null,
          notes: data.contact.notes ?? null,
          isVolunteer: data.contact.isVolunteer ?? false,
        })
        .returning();

      if (!createdContact) {
        throw internalError("Failed to create contact");
      }

      if (params.actorId && params.orgId) {
        await recordActivityLog(tx, {
          orgId: params.orgId,
          actorId: params.actorId,
          action: "created",
          entityType: "contact",
          entityId: createdContact.id,
          changes: data.contact,
        });
      }

      contactId = createdContact.id;
    }

    const [attendee] = await tx
      .insert(eventAttendees)
      .values({
        eventId: params.eventId,
        contactId,
        rsvpStatus: data.rsvpStatus,
      })
      .returning();

    if (!attendee) {
      throw internalError("Failed to create attendee");
    }

    if (params.actorId && params.orgId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "created",
        entityType: "attendee",
        entityId: attendee.id,
        changes: { eventId: params.eventId, contactId, rsvpStatus: attendee.rsvpStatus },
      });
    }

    return attendee;
  });
}

export async function updateAttendee(
  db: Database,
  params: {
    orgId: string;
    actorId?: string;
    eventId: string;
    attendeeId: string;
    data: UpdateAttendeeInput;
  },
) {
  const data = updateAttendeeSchema.parse(params.data);
  const attendee = await getAttendee(db, params);
  if (!attendee) {
    throw notFound("Attendee not found");
  }

  if (data.donationId !== undefined && data.donationId !== null) {
    await assertDonationInOrgForContact(db, params.orgId, attendee.contactId, data.donationId);
  }

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(eventAttendees)
      .set({
        ...(data.rsvpStatus !== undefined ? { rsvpStatus: data.rsvpStatus } : {}),
        ...(data.donationId !== undefined ? { donationId: data.donationId } : {}),
      })
      .where(
        and(
          eq(eventAttendees.eventId, params.eventId),
          eq(eventAttendees.id, params.attendeeId),
          isNull(eventAttendees.deletedAt),
        ),
      )
      .returning();

    if (!updated) {
      throw notFound("Attendee not found");
    }

    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "updated",
        entityType: "attendee",
        entityId: updated.id,
        changes: data,
      });
    }

    return updated;
  });
}

export async function deleteAttendee(
  db: Database,
  params: { orgId: string; actorId?: string; eventId: string; attendeeId: string },
) {
  const attendee = await getAttendee(db, { ...params, allowDeletedEvent: true });
  if (!attendee) {
    throw notFound("Attendee not found");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(eventAttendees)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(eventAttendees.eventId, params.eventId),
          eq(eventAttendees.id, params.attendeeId),
          isNull(eventAttendees.deletedAt),
        ),
      );
    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "deleted",
        entityType: "attendee",
        entityId: params.attendeeId,
        changes: null,
      });
    }
  });
}

export async function linkAttendeeDonation(
  db: Database,
  params: {
    orgId: string;
    actorId?: string;
    eventId: string;
    attendeeId: string;
  } & LinkAttendeeDonationInput,
) {
  const attendee = await getAttendee(db, params);
  if (!attendee) {
    throw notFound("Attendee not found");
  }

  const donation = await db.query.donations.findFirst({
    where: and(
      eq(donations.id, params.donationId),
      eq(donations.contactId, attendee.contactId),
      eq(donations.orgId, params.orgId),
      isNull(donations.deletedAt),
    ),
  });
  if (!donation) {
    throw notFound("Donation not found for attendee contact");
  }

  return updateAttendee(db, {
    orgId: params.orgId,
    actorId: params.actorId,
    eventId: params.eventId,
    attendeeId: params.attendeeId,
    data: { donationId: donation.id },
  });
}

export async function createAttendeeDonation(
  db: Database,
  params: {
    orgId: string;
    actorId?: string;
    eventId: string;
    attendeeId: string;
    data: CreateAttendeeDonationInput;
  },
) {
  const attendee = await getAttendee(db, params);
  if (!attendee) {
    throw notFound("Attendee not found");
  }

  await assertContactInOrg(db, params.orgId, attendee.contactId);
  if (params.data.fundId !== undefined && params.data.fundId !== null) {
    const fund = await db.query.funds.findFirst({
      where: and(
        eq(funds.id, params.data.fundId),
        eq(funds.orgId, params.orgId),
        isNull(funds.deletedAt),
      ),
    });
    if (!fund) {
      throw notFound("Fund not found");
    }
  }
  if (params.data.grantId !== undefined && params.data.grantId !== null) {
    const grant = await db.query.grants.findFirst({
      where: and(
        eq(grants.id, params.data.grantId),
        eq(grants.orgId, params.orgId),
        isNull(grants.deletedAt),
      ),
    });
    if (!grant) {
      throw notFound("Grant not found");
    }
  }
  await assertFundAllocatedToGrant(db, {
    fundId: params.data.fundId,
    grantId: params.data.grantId,
  });

  const createdDonation = await db.transaction(async (tx) => {
    const [donation] = await tx
      .insert(donations)
      .values({
        orgId: params.orgId,
        contactId: attendee.contactId,
        amountCents: params.data.amountCents,
        currency: params.data.currency,
        date: new Date(params.data.date),
        type: params.data.type,
        restriction: params.data.restriction,
        fundId: params.data.fundId ?? null,
        grantId: params.data.grantId ?? null,
        paymentMethod: params.data.paymentMethod ?? null,
        notes: params.data.notes ?? null,
        receiptSent: false,
      })
      .returning();

    if (!donation) {
      throw internalError("Failed to create donation");
    }

    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "created",
        entityType: "donation",
        entityId: donation.id,
        changes: {
          contactId: attendee.contactId,
          amountCents: donation.amountCents,
          eventId: params.eventId,
        },
      });
      await postDonation(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        donationId: donation.id,
        action: "create",
      });
    }

    await updateAttendee(tx as unknown as Database, {
      orgId: params.orgId,
      actorId: params.actorId,
      eventId: params.eventId,
      attendeeId: params.attendeeId,
      data: { donationId: donation.id },
    });

    return donation;
  });

  return createdDonation;
}
