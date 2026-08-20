import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api } from "../lib/api-client";
import { readResponseOrThrow, throwIfNotOk } from "../lib/http-response";
import { onMutationError } from "../lib/mutation-error";
import { captureEvent } from "../lib/analytics";
import { invalidateOverview } from "../lib/overview-invalidation";
import { invalidateAccountingBalanceViews } from "./use-accounting";
import type {
  ContactListParams,
  CreateContactInput,
  UpdateContactInput,
  CreateDonationInput,
  UpdateDonationInput,
  CreateCommunicationInput,
  DonorMailMergeSendInput,
  DonorMailMergeSendResult,
  CreateSegmentInput,
  CreateTagInput,
  AddTagsInput,
  UpdatePipelineStageInput,
} from "@grantpipe/shared";

const donors = api.api.donors;

function getFailureType(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";

  const message = error.message.toLowerCase();
  if (message.includes("valid") || message.includes("required")) return "validation";
  if (message.includes("permission") || message.includes("forbidden")) return "permission";
  if (message.includes("not found")) return "not_found";
  if (message.includes("network") || message.includes("fetch")) return "network";
  return "unknown";
}

function handleDonorOperationError(operation: string) {
  return (error: unknown) => {
    captureEvent("donor_operation_failed", {
      operation,
      failure_type: getFailureType(error),
    });
    onMutationError(error);
  };
}

// Creating, editing, or deleting a donation posts, re-posts, or reverses a
// journal entry on the backend (postDonation) when accounting is enabled —
// debiting cash and crediting contribution revenue, which shifts the trial
// balance, the account ledger, the journal-entries list, and the three
// financial reports. Refresh those caches too, mirroring the payment and
// expense mutations, or the Accounting pages stay stale after a donation is
// recorded, edited, or removed.
function invalidateDonationAccountingViews(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["accounting-journal-entries"] });
  invalidateAccountingBalanceViews(queryClient);
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export function useContacts(params: ContactListParams & { enabled?: boolean }) {
  return useQuery({
    queryKey: [
      "contacts",
      params.search ?? "",
      params.pipelineStage ?? "",
      params.tagId ?? "",
      params.type ?? "",
      params.page,
      params.pageSize,
      params.sortBy,
      params.sortOrder,
    ],
    enabled: params.enabled !== false,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const res = await donors.$get({
        query: {
          page: String(params.page),
          pageSize: String(params.pageSize),
          sortBy: params.sortBy,
          sortOrder: params.sortOrder,
          ...(params.search ? { search: params.search } : {}),
          ...(params.pipelineStage ? { pipelineStage: params.pipelineStage } : {}),
          ...(params.tagId ? { tagId: params.tagId } : {}),
          ...(params.type ? { type: params.type } : {}),
        },
      });
      return readResponseOrThrow(res);
    },
  });
}

export function useContact(contactId: string) {
  return useQuery({
    queryKey: ["contact", contactId],
    queryFn: async () => {
      const res = await donors[":contactId"].$get({ param: { contactId } });
      return readResponseOrThrow(res);
    },
    enabled: !!contactId,
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateContactInput) => {
      const res = await donors.$post({ json: data as CreateContactInput });
      return readResponseOrThrow(res);
    },
    onSuccess: () => {
      captureEvent("contact_created");
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
      void queryClient.invalidateQueries({ queryKey: ["donor-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["retention-stats"] });
      invalidateOverview(queryClient);
    },
    onError: handleDonorOperationError("create_contact"),
  });
}

export function useUpdateContact(contactId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: UpdateContactInput) => {
      const res = await donors[":contactId"].$patch({
        param: { contactId },
        json: data as UpdateContactInput,
      });
      return readResponseOrThrow(res);
    },
    onSuccess: () => {
      captureEvent("contact_updated");
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
      void queryClient.invalidateQueries({ queryKey: ["contact", contactId] });
      void queryClient.invalidateQueries({ queryKey: ["activity", "contact", contactId] });
      // The contact's name is also embedded into the event detail view — getEvent
      // returns attendees with their full contact record, and the event detail
      // page renders each attendee's name via attendeeDisplayName(attendee.contact)
      // from the ["event", id] query. Renaming a contact must refresh the event
      // caches too — the ["event"] prefix covers every open event detail page — or
      // the attendee list keeps showing the old name until a reload.
      void queryClient.invalidateQueries({ queryKey: ["event"] });
      invalidateOverview(queryClient);
    },
    onError: handleDonorOperationError("update_contact"),
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contactId: string) => {
      const res = await donors[":contactId"].$delete({ param: { contactId } });
      await throwIfNotOk(res);
    },
    onSuccess: () => {
      captureEvent("contact_deleted");
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
      void queryClient.invalidateQueries({ queryKey: ["donor-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["retention-stats"] });
      invalidateOverview(queryClient);
      // Deleting a contact cascade-soft-deletes every donation they recorded,
      // and the backend reverses each donation's journal entry (postDonation
      // "delete") when accounting is enabled — backing out the cash debit and
      // contribution-revenue credit, which shifts the trial balance, account
      // ledger, journal-entries list, and the three financial reports. Refresh
      // those caches too, or the Accounting pages stay stale after a donor with
      // recorded gifts is removed.
      invalidateDonationAccountingViews(queryClient);
    },
    onError: handleDonorOperationError("delete_contact"),
  });
}

export function useUpdatePipelineStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ contactId, stage }: { contactId: string } & UpdatePipelineStageInput) => {
      const res = await donors[":contactId"].stage.$patch({
        param: { contactId },
        json: { stage } as UpdatePipelineStageInput,
      });
      return readResponseOrThrow(res);
    },
    onSuccess: (_data, { contactId, stage }) => {
      captureEvent("donor_stage_changed", { stage });
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
      void queryClient.invalidateQueries({ queryKey: ["contact", contactId] });
      void queryClient.invalidateQueries({ queryKey: ["activity", "contact", contactId] });
      invalidateOverview(queryClient);
    },
    onError: handleDonorOperationError("update_pipeline_stage"),
  });
}

// ---------------------------------------------------------------------------
// Donations
// ---------------------------------------------------------------------------

export function useDonations(contactId: string, page = 1, pageSize = 25) {
  return useQuery({
    queryKey: ["donations", contactId, page, pageSize],
    queryFn: async () => {
      const res = await donors[":contactId"].donations.$get({
        param: { contactId },
        query: { page: String(page), pageSize: String(pageSize) },
      });
      return readResponseOrThrow(res);
    },
    enabled: !!contactId,
  });
}

export function useCreateDonation(contactId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateDonationInput) => {
      const res = await donors[":contactId"].donations.$post({
        param: { contactId },
        json: data as CreateDonationInput,
      });
      return readResponseOrThrow(res);
    },
    onSuccess: () => {
      captureEvent("donation_recorded");
      void queryClient.invalidateQueries({ queryKey: ["donations", contactId] });
      void queryClient.invalidateQueries({ queryKey: ["contact", contactId] });
      void queryClient.invalidateQueries({ queryKey: ["donor-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["retention-stats"] });
      // The donors list renders each contact's lifetime giving total and last
      // gift date from the ["contacts"] query, so a donation change makes those
      // rows stale until that list is refetched too.
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
      invalidateOverview(queryClient);
      invalidateDonationAccountingViews(queryClient);
    },
    onError: handleDonorOperationError("create_donation"),
  });
}

export function useUpdateDonation(contactId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ donationId, data }: { donationId: string; data: UpdateDonationInput }) => {
      const res = await donors[":contactId"].donations[":donationId"].$patch({
        param: { contactId, donationId },
        json: data as UpdateDonationInput,
      });
      return readResponseOrThrow(res);
    },
    onSuccess: () => {
      captureEvent("donation_updated");
      void queryClient.invalidateQueries({ queryKey: ["donations", contactId] });
      void queryClient.invalidateQueries({ queryKey: ["contact", contactId] });
      void queryClient.invalidateQueries({ queryKey: ["donor-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["retention-stats"] });
      // The donors list renders each contact's lifetime giving total and last
      // gift date from the ["contacts"] query, so a donation change makes those
      // rows stale until that list is refetched too.
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
      // A donation can be linked to an event attendee; getEvent sums each active
      // attendee's donation into summary.revenueCents (rendered on the event
      // detail page from ["event", id]). Editing the amount changes that total,
      // so refresh the event caches too — the ["event"] prefix covers every open
      // event detail page (this mutation has no eventId in scope), matching how
      // useCreateAttendeeDonation invalidates the event after recording a gift.
      void queryClient.invalidateQueries({ queryKey: ["event"] });
      invalidateOverview(queryClient);
      invalidateDonationAccountingViews(queryClient);
    },
    onError: handleDonorOperationError("update_donation"),
  });
}

export function useDeleteDonation(contactId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (donationId: string) => {
      const res = await donors[":contactId"].donations[":donationId"].$delete({
        param: { contactId, donationId },
      });
      await throwIfNotOk(res);
    },
    onSuccess: () => {
      captureEvent("donation_deleted");
      void queryClient.invalidateQueries({ queryKey: ["donations", contactId] });
      void queryClient.invalidateQueries({ queryKey: ["contact", contactId] });
      void queryClient.invalidateQueries({ queryKey: ["donor-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["retention-stats"] });
      // The donors list renders each contact's lifetime giving total and last
      // gift date from the ["contacts"] query, so a donation change makes those
      // rows stale until that list is refetched too.
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
      // A donation can be linked to an event attendee; getEvent sums each active
      // attendee's donation into summary.revenueCents (rendered on the event
      // detail page from ["event", id]). Deleting the donation drops it from that
      // total, so refresh the event caches too — the ["event"] prefix covers
      // every open event detail page (this mutation has no eventId in scope),
      // matching how useCreateAttendeeDonation invalidates the event.
      void queryClient.invalidateQueries({ queryKey: ["event"] });
      invalidateOverview(queryClient);
      invalidateDonationAccountingViews(queryClient);
    },
    onError: handleDonorOperationError("delete_donation"),
  });
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export function useTags() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: async () => {
      const res = await donors.tags.$get();
      return readResponseOrThrow(res);
    },
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateTagInput) => {
      const res = await donors.tags.$post({ json: data as CreateTagInput });
      return readResponseOrThrow(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tags"] });
    },
    onError: handleDonorOperationError("create_tag"),
  });
}

export function useAddContactTags(contactId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tagIds: AddTagsInput["tagIds"]) => {
      const res = await donors[":contactId"].tags.$post({
        param: { contactId },
        json: { tagIds } as AddTagsInput,
      });
      await throwIfNotOk(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["contact", contactId] });
      // The donors list (["contacts", ...]) supports a tagId filter resolved
      // through the contactTags junction, so adding a tag changes which contacts
      // match that filter — refresh the list or the filtered view stays stale.
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: handleDonorOperationError("add_contact_tags"),
  });
}

export function useRemoveContactTag(contactId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tagId: string) => {
      const res = await donors[":contactId"].tags[":tagId"].$delete({
        param: { contactId, tagId },
      });
      await throwIfNotOk(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["contact", contactId] });
      // Removing a tag changes which contacts match a tagId-filtered donors list
      // (resolved via the contactTags junction), so refresh the ["contacts"]
      // list too or it keeps showing the contact under that tag filter.
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: handleDonorOperationError("remove_contact_tag"),
  });
}

// ---------------------------------------------------------------------------
// Communications
// ---------------------------------------------------------------------------

export function useCommunications(contactId: string, page = 1, pageSize = 25) {
  return useQuery({
    queryKey: ["communications", contactId, page, pageSize],
    queryFn: async () => {
      const res = await donors[":contactId"].communications.$get({
        param: { contactId },
        query: { page: String(page), pageSize: String(pageSize) },
      });
      return readResponseOrThrow(res);
    },
    enabled: !!contactId,
  });
}

export function useCreateCommunication(contactId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateCommunicationInput) => {
      const res = await donors[":contactId"].communications.$post({
        param: { contactId },
        json: data as CreateCommunicationInput,
      });
      return readResponseOrThrow(res);
    },
    onSuccess: (_data, variables) => {
      captureEvent("communication_logged", { type: variables.type });
      void queryClient.invalidateQueries({ queryKey: ["communications", contactId] });
    },
    onError: handleDonorOperationError("create_communication"),
  });
}

export function useSendDonorMailMerge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: DonorMailMergeSendInput) => {
      const res = await donors["mail-merge"].send.$post({
        json: data,
      });
      await throwIfNotOk(res);
      return (await res.json()) as DonorMailMergeSendResult;
    },
    onSuccess: (result) => {
      captureEvent("donor_mail_merge_sent", {
        sent_count: result.sent,
        skipped_count: result.skipped,
        failed_count: result.failed,
      });
      void queryClient.invalidateQueries({ queryKey: ["communications"] });
    },
    onError: handleDonorOperationError("send_donor_mail_merge"),
  });
}

// ---------------------------------------------------------------------------
// Segments
// ---------------------------------------------------------------------------

export function useSegments() {
  return useQuery({
    queryKey: ["segments"],
    queryFn: async () => {
      const res = await donors.segments.$get();
      return readResponseOrThrow(res);
    },
  });
}

export function useCreateSegment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateSegmentInput) => {
      const res = await donors.segments.$post({ json: data as CreateSegmentInput });
      return readResponseOrThrow(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["segments"] });
    },
    onError: handleDonorOperationError("create_segment"),
  });
}

export function useDeleteSegment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (segmentId: string) => {
      const res = await donors.segments[":segmentId"].$delete({ param: { segmentId } });
      await throwIfNotOk(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["segments"] });
    },
    onError: handleDonorOperationError("delete_segment"),
  });
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export function useDonorStats() {
  return useQuery({
    queryKey: ["donor-stats"],
    queryFn: async () => {
      const res = await donors.stats.$get();
      return readResponseOrThrow(res);
    },
  });
}

export function useRetentionStats() {
  return useQuery({
    queryKey: ["retention-stats"],
    queryFn: async () => {
      const res = await donors.stats.retention.$get();
      return readResponseOrThrow(res);
    },
  });
}
