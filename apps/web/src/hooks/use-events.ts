import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import type {
  CreateAttendeeDonationInput,
  CreateAttendeeInput,
  CreateEventInput,
  CreateVolunteerHourInput,
  EventListParams,
  LinkAttendeeDonationInput,
  UpdateAttendeeInput,
  UpdateEventInput,
  UpdateVolunteerHourInput,
  VolunteerHourListParams,
} from "@grantpipe/shared";
import { api } from "../lib/api-client";
import { readResponseOrThrow, throwIfNotOk } from "../lib/http-response";
import { captureEvent } from "../lib/analytics";
import { onMutationError } from "../lib/mutation-error";
import { invalidateOverview } from "../lib/overview-invalidation";
import { invalidateAccountingBalanceViews } from "./use-accounting";

const events = api.api.events;

// Creating a donation through the event attendee panel posts a journal entry on
// the backend (postDonation) when accounting is enabled — debiting cash and
// crediting contribution revenue, which shifts the trial balance, account
// ledger, the journal-entries list, and the three financial reports. Refresh
// those caches too, mirroring the donor-detail donation mutations, or the
// Accounting pages stay stale after an attendee donation is recorded.
function invalidateDonationAccountingViews(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["accounting-journal-entries"] });
  invalidateAccountingBalanceViews(queryClient);
}

function invalidateEvent(queryClient: ReturnType<typeof useQueryClient>, eventId: string) {
  void queryClient.invalidateQueries({ queryKey: ["event", eventId] });
  void queryClient.invalidateQueries({ queryKey: ["events"] });
  void queryClient.invalidateQueries({ queryKey: ["volunteer-hours"] });
}

// On delete the detail route may still be mounted when caches refresh. Invalidating
// ["event", eventId] would refetch the now-soft-deleted event and surface a 404 in the
// console (and Sentry). Remove the detail query outright instead, and only refresh the
// list/related views.
function invalidateAfterEventDelete(
  queryClient: ReturnType<typeof useQueryClient>,
  eventId: string,
) {
  queryClient.removeQueries({ queryKey: ["event", eventId] });
  void queryClient.invalidateQueries({ queryKey: ["events"] });
  void queryClient.invalidateQueries({ queryKey: ["volunteer-hours"] });
}

// A donation created or linked through the event attendee panel also changes the
// contact's giving history and the org-wide donor stats. Refresh those so the
// contact detail page and donors dashboard don't show stale totals afterward.
function invalidateContactGiving(
  queryClient: ReturnType<typeof useQueryClient>,
  contactId: string,
) {
  void queryClient.invalidateQueries({ queryKey: ["donations", contactId] });
  void queryClient.invalidateQueries({ queryKey: ["contact", contactId] });
  void queryClient.invalidateQueries({ queryKey: ["donor-stats"] });
  void queryClient.invalidateQueries({ queryKey: ["retention-stats"] });
  // The donors list renders each contact's lifetime giving total and last gift
  // date from the ["contacts"] query (correlated donation aggregates in
  // listContacts). A donation created or linked here changes those, so refresh
  // the list too — the singular ["contact", id] key above does NOT prefix-match
  // the plural ["contacts", ...] — matching useCreateDonation in use-donors.ts.
  void queryClient.invalidateQueries({ queryKey: ["contacts"] });
}

export function useEvents(params: EventListParams) {
  return useQuery({
    queryKey: ["events", params],
    queryFn: async () => {
      const res = await events.$get({
        query: {
          page: String(params.page),
          pageSize: String(params.pageSize),
          sortBy: params.sortBy,
          sortOrder: params.sortOrder,
          search: params.search,
          type: params.type,
          timeframe: params.timeframe,
        },
      });
      return readResponseOrThrow(res);
    },
    placeholderData: keepPreviousData,
  });
}

export function useEvent(eventId: string) {
  return useQuery({
    queryKey: ["event", eventId],
    queryFn: async () => {
      const res = await events[":eventId"].$get({ param: { eventId } });
      return readResponseOrThrow(res);
    },
    enabled: !!eventId,
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateEventInput) => {
      const res = await events.$post({ json: data as typeof data });
      return readResponseOrThrow(res);
    },
    onSuccess: () => {
      captureEvent("calendar_event_created");
      void queryClient.invalidateQueries({ queryKey: ["events"] });
    },
    onError: onMutationError,
  });
}

export function useEventMutations(eventId: string) {
  const queryClient = useQueryClient();

  return {
    updateEvent: useMutation({
      mutationFn: async (data: UpdateEventInput) => {
        const res = await events[":eventId"].$patch({
          param: { eventId },
          json: data as typeof data,
        });
        return readResponseOrThrow(res);
      },
      onSuccess: () => invalidateEvent(queryClient, eventId),
      onError: onMutationError,
    }),
    deleteEvent: useMutation({
      mutationFn: async () => {
        const res = await events[":eventId"].$delete({ param: { eventId } });
        await throwIfNotOk(res);
      },
      onSuccess: () => invalidateAfterEventDelete(queryClient, eventId),
      onError: onMutationError,
    }),
  };
}

export function useCreateAttendee(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateAttendeeInput) => {
      // Hono RPC infers rsvpStatus as optional while CreateAttendeeInput marks it required —
      // cast to Parameters to bridge the inference gap without widening to `any`.
      type PostInput = Parameters<(typeof events)[":eventId"]["attendees"]["$post"]>[0]["json"];
      const res = await events[":eventId"].attendees.$post({
        param: { eventId },
        json: data as unknown as PostInput,
      });
      return readResponseOrThrow(res);
    },
    onSuccess: () => invalidateEvent(queryClient, eventId),
    onError: onMutationError,
  });
}

export function useUpdateAttendee(eventId: string, attendeeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: UpdateAttendeeInput) => {
      const res = await events[":eventId"].attendees[":attendeeId"].$patch({
        param: { eventId, attendeeId },
        json: data as typeof data,
      });
      return readResponseOrThrow(res);
    },
    onSuccess: () => invalidateEvent(queryClient, eventId),
    onError: onMutationError,
  });
}

export function useLinkAttendeeDonation(eventId: string, attendeeId: string, contactId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: LinkAttendeeDonationInput) => {
      const res = await events[":eventId"].attendees[":attendeeId"]["donation-link"].$post({
        param: { eventId, attendeeId },
        json: data as typeof data,
      });
      return readResponseOrThrow(res);
    },
    onSuccess: () => {
      invalidateEvent(queryClient, eventId);
      if (contactId) invalidateContactGiving(queryClient, contactId);
      // A linked donation changes org-wide giving totals, so the dashboard's
      // donor metrics (current-FY giving, new-donor count) must refresh even
      // when the attendee is not tied to a contact record.
      invalidateOverview(queryClient);
    },
    onError: onMutationError,
  });
}

export function useCreateAttendeeDonation(eventId: string, attendeeId: string, contactId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateAttendeeDonationInput) => {
      const res = await events[":eventId"].attendees[":attendeeId"].donations.$post({
        param: { eventId, attendeeId },
        json: data as typeof data,
      });
      return readResponseOrThrow(res);
    },
    onSuccess: () => {
      invalidateEvent(queryClient, eventId);
      if (contactId) invalidateContactGiving(queryClient, contactId);
      // A new attendee donation changes org-wide giving totals, so the
      // dashboard's donor metrics must refresh even when the attendee is not
      // tied to a contact record.
      invalidateOverview(queryClient);
      // The same posting happens regardless of whether the attendee is linked
      // to a contact, so refresh the accounting views unconditionally.
      invalidateDonationAccountingViews(queryClient);
    },
    onError: onMutationError,
  });
}

export function useVolunteerHours(params: VolunteerHourListParams) {
  return useQuery({
    queryKey: ["volunteer-hours", params],
    queryFn: async () => {
      const res = await events["volunteer-hours"].$get({
        query: {
          page: String(params.page),
          pageSize: String(params.pageSize),
          sortBy: params.sortBy,
          sortOrder: params.sortOrder,
          contactId: params.contactId,
          eventId: params.eventId,
        },
      });
      return readResponseOrThrow(res);
    },
  });
}

export function useCreateVolunteerHour() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateVolunteerHourInput) => {
      const res = await events["volunteer-hours"].$post({ json: data as typeof data });
      return readResponseOrThrow(res);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["volunteer-hours"] });
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      void queryClient.invalidateQueries({ queryKey: ["event", variables.eventId] });
    },
    onError: onMutationError,
  });
}

export function useVolunteerHourMutations(volunteerHourId: string, eventId?: string) {
  const queryClient = useQueryClient();

  // The event detail page derives its "Volunteer hours" summary stat from the
  // ["event", eventId] query, so editing or removing an hour entry from that
  // page must refresh it too — not just the volunteer-hours list and events list.
  const invalidateEventCaches = () => {
    void queryClient.invalidateQueries({ queryKey: ["volunteer-hours"] });
    void queryClient.invalidateQueries({ queryKey: ["events"] });
    if (eventId) void queryClient.invalidateQueries({ queryKey: ["event", eventId] });
  };

  return {
    updateVolunteerHour: useMutation({
      mutationFn: async (data: UpdateVolunteerHourInput) => {
        const res = await events["volunteer-hours"][":volunteerHourId"].$patch({
          param: { volunteerHourId },
          json: data as typeof data,
        });
        return readResponseOrThrow(res);
      },
      onSuccess: invalidateEventCaches,
      onError: onMutationError,
    }),
    deleteVolunteerHour: useMutation({
      mutationFn: async () => {
        const res = await events["volunteer-hours"][":volunteerHourId"].$delete({
          param: { volunteerHourId },
        });
        await throwIfNotOk(res);
      },
      onSuccess: invalidateEventCaches,
      onError: onMutationError,
    }),
  };
}
