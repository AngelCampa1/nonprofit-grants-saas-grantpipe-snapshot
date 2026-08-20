import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { AppEnv } from "../../types";
import { blockRole, requirePermission } from "../../middleware/require-role";
import {
  ANALYTICS_EVENTS,
  createAttendeeDonationSchema,
  createAttendeeSchema,
  createEventSchema,
  createVolunteerHourSchema,
  eventListSchema,
  linkAttendeeDonationSchema,
  updateAttendeeSchema,
  updateEventSchema,
  updateVolunteerHourSchema,
  volunteerHourListSchema,
} from "@grantpipe/shared";
import { captureApiAnalyticsSafely } from "../../lib/analytics";
import { getIntegrations } from "../../lib/integrations";

function analyticsForContext(c: Context<AppEnv>) {
  return getIntegrations(c.get("db"), c.env ?? ({} as AppEnv["Bindings"])).analytics;
}

import {
  createAttendee,
  createAttendeeDonation,
  deleteAttendee,
  linkAttendeeDonation,
  updateAttendee,
} from "./attendee.service";
import { createEvent, deleteEvent, getEvent, listEvents, updateEvent } from "./event.service";
import {
  createVolunteerHour,
  deleteVolunteerHour,
  listVolunteerHours,
  updateVolunteerHour,
} from "./volunteer.service";

export const eventRoutes = new Hono<AppEnv>()
  .use(blockRole("auditor"))
  .get(
    "/",
    requirePermission("events", "view"),
    zValidator("query", eventListSchema),
    async (c) => {
      const result = await listEvents(c.get("db"), {
        orgId: c.get("orgId")!,
        ...c.req.valid("query"),
      });
      return c.json(result);
    },
  )
  .post(
    "/",
    requirePermission("events", "edit"),
    zValidator("json", createEventSchema),
    async (c) => {
      const event = await createEvent(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        ...c.req.valid("json"),
      });
      captureApiAnalyticsSafely(
        analyticsForContext(c).capture({
          orgId: c.get("orgId")!,
          eventName: ANALYTICS_EVENTS.calendarEventCreated,
          payload: {
            actorId: c.get("user")!.id,
            event_type: c.req.valid("json").type,
          },
        }),
        { c, eventName: ANALYTICS_EVENTS.calendarEventCreated },
      );
      return c.json(event, 201);
    },
  )
  .get(
    "/volunteer-hours",
    requirePermission("events", "view"),
    zValidator("query", volunteerHourListSchema),
    async (c) => {
      const result = await listVolunteerHours(c.get("db"), {
        orgId: c.get("orgId")!,
        ...c.req.valid("query"),
      });
      return c.json(result);
    },
  )
  .post(
    "/volunteer-hours",
    requirePermission("events", "edit"),
    zValidator("json", createVolunteerHourSchema),
    async (c) => {
      const entry = await createVolunteerHour(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        data: c.req.valid("json"),
      });
      return c.json(entry, 201);
    },
  )
  .patch(
    "/volunteer-hours/:volunteerHourId",
    requirePermission("events", "edit"),
    zValidator("json", updateVolunteerHourSchema),
    async (c) => {
      const entry = await updateVolunteerHour(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        volunteerHourId: c.req.param("volunteerHourId"),
        data: c.req.valid("json"),
      });
      return c.json(entry);
    },
  )
  .delete("/volunteer-hours/:volunteerHourId", requirePermission("events", "manage"), async (c) => {
    await deleteVolunteerHour(c.get("db"), {
      orgId: c.get("orgId")!,
      actorId: c.get("user")!.id,
      volunteerHourId: c.req.param("volunteerHourId"),
    });
    return c.body(null, 204);
  })
  .get("/:eventId", requirePermission("events", "view"), async (c) => {
    const event = await getEvent(c.get("db"), {
      orgId: c.get("orgId")!,
      eventId: c.req.param("eventId"),
    });
    return c.json(event);
  })
  .patch(
    "/:eventId",
    requirePermission("events", "edit"),
    zValidator("json", updateEventSchema),
    async (c) => {
      const event = await updateEvent(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        eventId: c.req.param("eventId"),
        data: c.req.valid("json"),
      });
      return c.json(event);
    },
  )
  .delete("/:eventId", requirePermission("events", "manage"), async (c) => {
    await deleteEvent(c.get("db"), {
      orgId: c.get("orgId")!,
      actorId: c.get("user")!.id,
      eventId: c.req.param("eventId"),
    });
    return c.body(null, 204);
  })
  .post(
    "/:eventId/attendees",
    requirePermission("events", "edit"),
    zValidator("json", createAttendeeSchema),
    async (c) => {
      const attendee = await createAttendee(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        eventId: c.req.param("eventId"),
        data: c.req.valid("json"),
      });
      return c.json(attendee, 201);
    },
  )
  .patch(
    "/:eventId/attendees/:attendeeId",
    requirePermission("events", "edit"),
    zValidator("json", updateAttendeeSchema),
    async (c) => {
      const attendee = await updateAttendee(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        eventId: c.req.param("eventId"),
        attendeeId: c.req.param("attendeeId"),
        data: c.req.valid("json"),
      });
      return c.json(attendee);
    },
  )
  .delete("/:eventId/attendees/:attendeeId", requirePermission("events", "manage"), async (c) => {
    await deleteAttendee(c.get("db"), {
      orgId: c.get("orgId")!,
      actorId: c.get("user")!.id,
      eventId: c.req.param("eventId"),
      attendeeId: c.req.param("attendeeId"),
    });
    return c.body(null, 204);
  })
  .post(
    "/:eventId/attendees/:attendeeId/donation-link",
    requirePermission("events", "edit"),
    zValidator("json", linkAttendeeDonationSchema),
    async (c) => {
      const attendee = await linkAttendeeDonation(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        eventId: c.req.param("eventId"),
        attendeeId: c.req.param("attendeeId"),
        ...c.req.valid("json"),
      });
      return c.json(attendee);
    },
  )
  .post(
    "/:eventId/attendees/:attendeeId/donations",
    requirePermission("events", "edit"),
    zValidator("json", createAttendeeDonationSchema),
    async (c) => {
      const donation = await createAttendeeDonation(c.get("db"), {
        orgId: c.get("orgId")!,
        actorId: c.get("user")!.id,
        eventId: c.req.param("eventId"),
        attendeeId: c.req.param("attendeeId"),
        data: c.req.valid("json"),
      });
      return c.json(donation, 201);
    },
  );
