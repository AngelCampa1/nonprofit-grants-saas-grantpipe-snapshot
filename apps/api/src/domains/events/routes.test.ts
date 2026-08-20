import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { eventRoutes } from "./routes";
import type { PermissionMap } from "@grantpipe/shared";

vi.mock("./event.service", () => ({
  listEvents: vi.fn(),
  getEvent: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
}));

vi.mock("./attendee.service", () => ({
  createAttendee: vi.fn(),
  updateAttendee: vi.fn(),
  deleteAttendee: vi.fn(),
  linkAttendeeDonation: vi.fn(),
  createAttendeeDonation: vi.fn(),
}));

vi.mock("./volunteer.service", () => ({
  listVolunteerHours: vi.fn(),
  createVolunteerHour: vi.fn(),
  updateVolunteerHour: vi.fn(),
  deleteVolunteerHour: vi.fn(),
}));

const { mockAnalyticsCapture } = vi.hoisted(() => ({
  mockAnalyticsCapture: vi.fn(),
}));

vi.mock("../../lib/integrations", () => ({
  getIntegrations: vi.fn(() => ({
    analytics: { capture: mockAnalyticsCapture },
  })),
}));

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

function buildApp(
  role: "admin" | "editor" | "viewer" = "admin",
  permissions?: PermissionMap | null,
) {
  return new Hono<AppEnv>()
    .use("/events/*", async (c, next) => {
      c.set("db", {} as never);
      c.set("orgId", "org-1");
      c.set("user", { id: "user-1", email: "test@example.com", name: "Test" });
      c.set("session", { id: "sess-1", userId: "user-1" });
      c.set("memberRole", role);
      c.set("memberPermissions", permissions ?? null);
      await next();
    })
    .route("/events", eventRoutes);
}

describe("event routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAnalyticsCapture.mockResolvedValue({ id: "analytics-1" });
  });

  it("lists and fetches event detail for viewers", async () => {
    vi.mocked(listEvents).mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 25 } as never);
    vi.mocked(getEvent).mockResolvedValue({ id: "event-1", summary: {} } as never);
    const app = buildApp("viewer");

    expect((await app.request("/events")).status).toBe(200);
    expect((await app.request("/events/event-1")).status).toBe(200);
  });

  it("creates, updates, and deletes events with role enforcement", async () => {
    vi.mocked(createEvent).mockResolvedValue({ id: "event-1" } as never);
    vi.mocked(updateEvent).mockResolvedValue({ id: "event-1" } as never);
    vi.mocked(deleteEvent).mockResolvedValue(undefined as never);
    const editorApp = buildApp("editor");
    const adminApp = buildApp("admin");

    expect(
      await editorApp.request("/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Spring Gala", type: "gala" }),
      }),
    ).toMatchObject({ status: 201 });
    expect(
      await editorApp.request("/events/event-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated Gala" }),
      }),
    ).toMatchObject({ status: 200 });
    expect(await adminApp.request("/events/event-1", { method: "DELETE" })).toMatchObject({
      status: 204,
    });
    expect(createEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        name: "Spring Gala",
      }),
    );
    expect(updateEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        eventId: "event-1",
      }),
    );
    expect(deleteEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        eventId: "event-1",
      }),
    );
  });

  it("rejects invalid event payloads", async () => {
    const app = buildApp("editor");
    const res = await app.request("/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "", type: "gala" }),
    });

    expect(res.status).toBe(400);
  });

  it("captures calendar_event_created after successful POST /", async () => {
    vi.mocked(createEvent).mockResolvedValue({ id: "event-1", type: "gala" } as never);
    const app = buildApp("editor");

    const res = await app.request("/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Spring Gala", type: "gala" }),
    });

    expect(res.status).toBe(201);
    expect(mockAnalyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        eventName: ANALYTICS_EVENTS.calendarEventCreated,
        payload: expect.objectContaining({ actorId: "user-1" }),
      }),
    );
  });

  it("blocks an editor when explicit permissions remove event view access", async () => {
    const app = buildApp("editor", { events: "none" } as PermissionMap);

    const res = await app.request("/events");

    expect(res.status).toBe(403);
    expect(listEvents).not.toHaveBeenCalled();
  });

  it("allows a viewer with explicit event edit permission to create events", async () => {
    vi.mocked(createEvent).mockResolvedValue({ id: "event-1" } as never);
    const app = buildApp("viewer", { events: "edit" } as PermissionMap);

    const res = await app.request("/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Community Open House", type: "other" }),
    });

    expect(res.status).toBe(201);
    expect(createEvent).toHaveBeenCalledOnce();
  });
});

describe("attendee routes", () => {
  beforeEach(() => vi.resetAllMocks());

  it("creates, updates, deletes, links donations, and creates attendee donations", async () => {
    vi.mocked(createAttendee).mockResolvedValue({ id: "attendee-1" } as never);
    vi.mocked(updateAttendee).mockResolvedValue({ id: "attendee-1" } as never);
    vi.mocked(deleteAttendee).mockResolvedValue(undefined as never);
    vi.mocked(linkAttendeeDonation).mockResolvedValue({ id: "attendee-1" } as never);
    vi.mocked(createAttendeeDonation).mockResolvedValue({ id: "donation-1" } as never);
    const editorApp = buildApp("editor");
    const adminApp = buildApp("admin");

    expect(
      await editorApp.request("/events/event-1/attendees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "existing_contact", contactId: "contact-1" }),
      }),
    ).toMatchObject({ status: 201 });
    expect(
      await editorApp.request("/events/event-1/attendees/attendee-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rsvpStatus: "attended" }),
      }),
    ).toMatchObject({ status: 200 });
    expect(
      await editorApp.request("/events/event-1/attendees/attendee-1/donation-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ donationId: "donation-1" }),
      }),
    ).toMatchObject({ status: 200 });
    expect(
      await editorApp.request("/events/event-1/attendees/attendee-1/donations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountCents: 50000,
          date: "2026-05-01T00:00:00.000Z",
          type: "one_time",
        }),
      }),
    ).toMatchObject({ status: 201 });
    expect(
      await adminApp.request("/events/event-1/attendees/attendee-1", { method: "DELETE" }),
    ).toMatchObject({ status: 204 });
    expect(createAttendee).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        eventId: "event-1",
      }),
    );
    expect(updateAttendee).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        eventId: "event-1",
        attendeeId: "attendee-1",
      }),
    );
    expect(linkAttendeeDonation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        eventId: "event-1",
        attendeeId: "attendee-1",
      }),
    );
    expect(createAttendeeDonation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        eventId: "event-1",
        attendeeId: "attendee-1",
      }),
    );
    expect(deleteAttendee).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        eventId: "event-1",
        attendeeId: "attendee-1",
      }),
    );
  });
});

describe("volunteer routes", () => {
  beforeEach(() => vi.resetAllMocks());

  it("lists and mutates volunteer hours", async () => {
    vi.mocked(listVolunteerHours).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      pageSize: 25,
    } as never);
    vi.mocked(createVolunteerHour).mockResolvedValue({ id: "vh-1" } as never);
    vi.mocked(updateVolunteerHour).mockResolvedValue({ id: "vh-1" } as never);
    vi.mocked(deleteVolunteerHour).mockResolvedValue(undefined as never);
    const editorApp = buildApp("editor");
    const adminApp = buildApp("admin");

    expect((await editorApp.request("/events/volunteer-hours")).status).toBe(200);
    expect(
      await editorApp.request("/events/volunteer-hours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: "contact-1",
          eventId: "event-1",
          hours: "2.5",
          date: "2026-05-01T12:00:00Z",
        }),
      }),
    ).toMatchObject({ status: 201 });
    expect(
      await editorApp.request("/events/volunteer-hours/vh-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ program: "Food Pantry", eventId: null }),
      }),
    ).toMatchObject({ status: 200 });
    expect(
      await adminApp.request("/events/volunteer-hours/vh-1", { method: "DELETE" }),
    ).toMatchObject({
      status: 204,
    });
    expect(createVolunteerHour).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
      }),
    );
    expect(updateVolunteerHour).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        volunteerHourId: "vh-1",
      }),
    );
    expect(deleteVolunteerHour).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        volunteerHourId: "vh-1",
      }),
    );
  });
});
