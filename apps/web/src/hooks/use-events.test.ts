import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInvalidateQueries = vi.fn();
const mockRemoveQueries = vi.fn();
const mockCaptureEvent = vi.fn();

vi.mock("../lib/analytics", () => ({
  captureEvent: (...args: unknown[]) => mockCaptureEvent(...args),
}));

vi.mock("../lib/api-client", () => ({
  api: {
    api: {
      events: {
        $get: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue([]) }),
        $post: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({ id: "evt-1" }) }),
        ":eventId": {
          $get: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({ id: "evt-1" }) }),
          $patch: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({ id: "evt-1" }) }),
          $delete: vi.fn().mockResolvedValue(undefined),
          attendees: {
            $post: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({ id: "att-1" }) }),
            ":attendeeId": {
              $patch: vi
                .fn()
                .mockResolvedValue({ json: vi.fn().mockResolvedValue({ id: "att-1" }) }),
              "donation-link": {
                $post: vi
                  .fn()
                  .mockResolvedValue({ json: vi.fn().mockResolvedValue({ id: "dl-1" }) }),
              },
              donations: {
                $post: vi
                  .fn()
                  .mockResolvedValue({ json: vi.fn().mockResolvedValue({ id: "don-1" }) }),
              },
            },
          },
        },
        "volunteer-hours": {
          $get: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue([]) }),
          $post: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({ id: "vh-1" }) }),
          ":volunteerHourId": {
            $patch: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({ id: "vh-1" }) }),
            $delete: vi.fn().mockResolvedValue(undefined),
          },
        },
      },
    },
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(() => ({
    invalidateQueries: mockInvalidateQueries,
    removeQueries: mockRemoveQueries,
  })),
  keepPreviousData: Symbol("keepPreviousData"),
}));

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  useCreateAttendee,
  useCreateAttendeeDonation,
  useCreateEvent,
  useCreateVolunteerHour,
  useEvent,
  useEventMutations,
  useEvents,
  useLinkAttendeeDonation,
  useUpdateAttendee,
  useVolunteerHourMutations,
  useVolunteerHours,
} from "./use-events";

function resetMocks() {
  vi.mocked(useQuery).mockClear();
  vi.mocked(useMutation).mockClear();
  mockInvalidateQueries.mockClear();
  mockRemoveQueries.mockClear();
  mockCaptureEvent.mockClear();
}

function captureQueryFn() {
  const call = vi.mocked(useQuery).mock.calls[0]?.[0];
  return (call as unknown as { queryFn: () => Promise<unknown> }).queryFn;
}

function captureMutationFn() {
  const call = vi.mocked(useMutation).mock.calls[0]?.[0];
  return (call as { mutationFn: (arg: unknown) => Promise<unknown> }).mutationFn;
}

function captureOnSuccess() {
  const call = vi.mocked(useMutation).mock.calls[0]?.[0];
  return (call as { onSuccess: (data: unknown, vars: unknown) => void }).onSuccess;
}

function asMutationConfig(value: unknown) {
  return value as {
    mutationFn: (arg?: unknown) => Promise<unknown>;
    onSuccess?: (data: unknown, variables: unknown) => void;
  };
}

describe("event queries", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
  });

  it("loads events list", async () => {
    useEvents({ page: 1, pageSize: 25, timeframe: "all", sortBy: "date", sortOrder: "desc" });
    const result = await captureQueryFn()();
    expect(result).toEqual([]);
  });

  it("loads a single event", async () => {
    useEvent("evt-1");
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    const result = await captureQueryFn()();
    expect(result).toMatchObject({ id: "evt-1" });
  });

  it("disables event query when id is empty", () => {
    useEvent("");
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });
});

describe("useCreateEvent", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useMutation).mockImplementation((options) => options as never);
  });

  it("creates a calendar event, fires calendar_event_created, and invalidates events", async () => {
    useCreateEvent();
    const result = await captureMutationFn()({ name: "Spring Gala", date: "2026-05-15" });
    expect(result).toMatchObject({ id: "evt-1" });
    captureOnSuccess()(result, {});
    expect(mockCaptureEvent).toHaveBeenCalledWith("calendar_event_created");
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["events"] });
  });

  it("does not fire calendar_event_created before onSuccess is called", async () => {
    useCreateEvent();
    await captureMutationFn()({ name: "Spring Gala", date: "2026-05-15" });
    expect(mockCaptureEvent).not.toHaveBeenCalled();
  });
});

describe("useEventMutations", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useMutation).mockImplementation((options) => options as never);
  });

  it("updates an event and invalidates event caches", async () => {
    const actions = useEventMutations("evt-1");
    const result = await asMutationConfig(actions.updateEvent).mutationFn({ name: "Updated Gala" });
    asMutationConfig(actions.updateEvent).onSuccess?.(result, {});
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["event", "evt-1"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["events"] });
  });

  it("deletes an event, removes the detail query, and invalidates list caches", async () => {
    const actions = useEventMutations("evt-1");
    await asMutationConfig(actions.deleteEvent).mutationFn();
    asMutationConfig(actions.deleteEvent).onSuccess?.(undefined, {});
    // The detail query is removed (not invalidated) so it does not refetch the
    // soft-deleted event and surface a 404 while the route is still mounted.
    expect(mockRemoveQueries).toHaveBeenCalledWith({ queryKey: ["event", "evt-1"] });
    expect(mockInvalidateQueries).not.toHaveBeenCalledWith({ queryKey: ["event", "evt-1"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["events"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["volunteer-hours"] });
  });
});

describe("attendee mutations", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useMutation).mockImplementation((options) => options as never);
  });

  it("creates an attendee", async () => {
    useCreateAttendee("evt-1");
    const result = await captureMutationFn()({ contactId: "c-1", rsvpStatus: "confirmed" });
    expect(result).toMatchObject({ id: "att-1" });
    captureOnSuccess()(result, {});
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["event", "evt-1"] });
  });

  it("updates an attendee", async () => {
    useUpdateAttendee("evt-1", "att-1");
    const result = await captureMutationFn()({ rsvpStatus: "declined" });
    captureOnSuccess()(result, {});
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["event", "evt-1"] });
  });

  it("links an attendee donation and refreshes the linked contact's giving", async () => {
    useLinkAttendeeDonation("evt-1", "att-1", "c-1");
    const result = await captureMutationFn()({ donationId: "don-1" });
    captureOnSuccess()(result, {});
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["event", "evt-1"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["donations", "c-1"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["contact", "c-1"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["donor-stats"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["retention-stats"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["dashboard-overview"] });
    // The donors list renders each contact's lifetime giving total and last gift
    // date from the ["contacts"] query (correlated donation aggregates). Linking a
    // donation to a contact must refresh that list too — the singular
    // ["contact", id] key does NOT prefix-match the plural ["contacts", ...] — or
    // the donors list keeps showing the old total/last-gift until a reload.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["contacts"] });
  });

  it("links an attendee donation without a contact id and still refreshes the dashboard", async () => {
    useLinkAttendeeDonation("evt-1", "att-1");
    const result = await captureMutationFn()({ donationId: "don-1" });
    captureOnSuccess()(result, {});
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["event", "evt-1"] });
    expect(mockInvalidateQueries).not.toHaveBeenCalledWith({ queryKey: ["donor-stats"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["dashboard-overview"] });
  });

  it("creates an attendee donation and refreshes the linked contact's giving", async () => {
    useCreateAttendeeDonation("evt-1", "att-1", "c-1");
    const result = await captureMutationFn()({ amountCents: 5000, date: "2026-05-15T00:00:00Z" });
    captureOnSuccess()(result, {});
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["event", "evt-1"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["donations", "c-1"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["contact", "c-1"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["donor-stats"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["retention-stats"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["dashboard-overview"] });
    // The donors list renders each contact's lifetime giving total and last gift
    // date from the ["contacts"] query (correlated donation aggregates). Creating a
    // donation for a contact must refresh that list too — the singular
    // ["contact", id] key does NOT prefix-match the plural ["contacts", ...] — or
    // the donors list keeps showing the old total/last-gift until a reload.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["contacts"] });
  });

  it("creates an attendee donation without a contact id and still refreshes the dashboard", async () => {
    useCreateAttendeeDonation("evt-1", "att-1");
    const result = await captureMutationFn()({ amountCents: 5000, date: "2026-05-15T00:00:00Z" });
    captureOnSuccess()(result, {});
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["event", "evt-1"] });
    expect(mockInvalidateQueries).not.toHaveBeenCalledWith({ queryKey: ["donor-stats"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["dashboard-overview"] });
  });

  it("creates an attendee donation and refreshes accounting views the posted journal entry changes", async () => {
    useCreateAttendeeDonation("evt-1", "att-1", "c-1");
    const result = await captureMutationFn()({ amountCents: 5000, date: "2026-05-15T00:00:00Z" });
    captureOnSuccess()(result, {});
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-journal-entries"],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["accounting-trial-balance"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["accounting-ledger"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-report-financial-position"],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-report-activities"],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-report-functional-expenses"],
    });
  });

  it("creates an attendee donation without a contact id and still refreshes accounting views", async () => {
    useCreateAttendeeDonation("evt-1", "att-1");
    const result = await captureMutationFn()({ amountCents: 5000, date: "2026-05-15T00:00:00Z" });
    captureOnSuccess()(result, {});
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-journal-entries"],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["accounting-trial-balance"] });
  });
});

describe("volunteer hours", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
    vi.mocked(useMutation).mockImplementation((options) => options as never);
  });

  it("loads volunteer hours", async () => {
    useVolunteerHours({ page: 1, pageSize: 25, sortBy: "date", sortOrder: "desc" });
    const result = await captureQueryFn()();
    expect(result).toEqual([]);
  });

  it("creates a volunteer hour and invalidates caches", async () => {
    useCreateVolunteerHour();
    const result = await captureMutationFn()({
      contactId: "c-1",
      eventId: "evt-1",
      hours: 2,
      date: "2026-05-15T00:00:00Z",
    });
    expect(result).toMatchObject({ id: "vh-1" });
    captureOnSuccess()(result, { contactId: "c-1", eventId: "evt-1", hours: 2 });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["volunteer-hours"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["events"] });
  });

  it("updates a volunteer hour", async () => {
    const actions = useVolunteerHourMutations("vh-1");
    const result = await asMutationConfig(actions.updateVolunteerHour).mutationFn({ hours: 3 });
    asMutationConfig(actions.updateVolunteerHour).onSuccess?.(result, {});
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["volunteer-hours"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["events"] });
  });

  it("deletes a volunteer hour", async () => {
    const actions = useVolunteerHourMutations("vh-1");
    await asMutationConfig(actions.deleteVolunteerHour).mutationFn();
    asMutationConfig(actions.deleteVolunteerHour).onSuccess?.(undefined, {});
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["volunteer-hours"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["events"] });
  });

  it("refreshes the event detail summary when updating with an eventId", async () => {
    const actions = useVolunteerHourMutations("vh-1", "evt-1");
    const result = await asMutationConfig(actions.updateVolunteerHour).mutationFn({ hours: 3 });
    asMutationConfig(actions.updateVolunteerHour).onSuccess?.(result, {});
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["event", "evt-1"] });
  });

  it("refreshes the event detail summary when deleting with an eventId", async () => {
    const actions = useVolunteerHourMutations("vh-1", "evt-1");
    await asMutationConfig(actions.deleteVolunteerHour).mutationFn();
    asMutationConfig(actions.deleteVolunteerHour).onSuccess?.(undefined, {});
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["event", "evt-1"] });
  });

  it("skips the event detail key when no eventId is supplied", async () => {
    const actions = useVolunteerHourMutations("vh-1");
    await asMutationConfig(actions.updateVolunteerHour).mutationFn({ hours: 3 });
    asMutationConfig(actions.updateVolunteerHour).onSuccess?.(undefined, {});
    expect(mockInvalidateQueries).not.toHaveBeenCalledWith({ queryKey: ["event", undefined] });
  });
});
