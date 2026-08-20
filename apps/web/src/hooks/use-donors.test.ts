import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "../lib/api-client";

const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: mockToastError },
}));

const mockCaptureEvent = vi.fn();
vi.mock("../lib/analytics", () => ({
  captureEvent: (...args: unknown[]) => mockCaptureEvent(...args),
}));

vi.mock("../lib/mutation-error", () => ({
  onMutationError: (error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Something went wrong. Please try again.";
    mockToastError(message);
  },
}));

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

const mockInvalidateQueries = vi.fn();

vi.mock("../lib/api-client", () => ({
  api: {
    api: {
      donors: {
        $get: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue([]) }),
        $post: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }),
        tags: {
          $get: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue([]) }),
          $post: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }),
        },
        segments: {
          $get: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue([]) }),
          $post: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }),
          ":segmentId": {
            $delete: vi.fn().mockResolvedValue({ ok: true, status: 204 }),
          },
        },
        "mail-merge": {
          send: {
            $post: vi.fn().mockResolvedValue({
              ok: true,
              json: vi.fn().mockResolvedValue({ sent: 1, skipped: 0, failed: 0 }),
            }),
          },
        },
        stats: {
          $get: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }),
          retention: {
            $get: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue([]) }),
          },
        },
        ":contactId": {
          $get: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }),
          $patch: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }),
          $delete: vi.fn().mockResolvedValue(undefined),
          stage: {
            $patch: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }),
          },
          donations: {
            $get: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue([]) }),
            $post: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }),
            ":donationId": {
              $patch: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }),
              $delete: vi.fn().mockResolvedValue(undefined),
            },
          },
          tags: {
            $post: vi.fn().mockResolvedValue(undefined),
            ":tagId": {
              $delete: vi.fn().mockResolvedValue(undefined),
            },
          },
          communications: {
            $get: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue([]) }),
            $post: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }),
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
  })),
  keepPreviousData: Symbol("keepPreviousData"),
}));

import { useQuery, useMutation } from "@tanstack/react-query";
import {
  useContacts,
  useContact,
  useCreateContact,
  useUpdateContact,
  useDeleteContact,
  useUpdatePipelineStage,
  useDonations,
  useCreateDonation,
  useUpdateDonation,
  useDeleteDonation,
  useTags,
  useCreateTag,
  useAddContactTags,
  useRemoveContactTag,
  useCommunications,
  useCreateCommunication,
  useSendDonorMailMerge,
  useSegments,
  useCreateSegment,
  useDeleteSegment,
  useDonorStats,
  useRetentionStats,
} from "./use-donors";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function captureQueryFn() {
  const call = vi.mocked(useQuery).mock.calls[0]?.[0];
  return (call as unknown as { queryFn: () => Promise<unknown> }).queryFn;
}

function captureMutationFn() {
  const call = vi.mocked(useMutation).mock.calls[0]?.[0];
  return (call as unknown as { mutationFn: (arg: unknown) => Promise<unknown> }).mutationFn;
}

function captureOnSuccess() {
  const call = vi.mocked(useMutation).mock.calls[0]?.[0];
  const onSuccess = (
    call as unknown as {
      onSuccess?: (...args: unknown[]) => void;
    }
  ).onSuccess;

  if (!onSuccess) {
    throw new Error("Expected mutation onSuccess handler to be defined");
  }

  return onSuccess;
}

function captureOnError() {
  const call = vi.mocked(useMutation).mock.calls[0]?.[0];
  return (
    call as unknown as {
      onError?: (error: unknown) => void;
    }
  ).onError;
}

// resetAllMocks would wipe api mock implementations — only clear call history
function resetMocks() {
  vi.mocked(useQuery).mockClear();
  vi.mocked(useMutation).mockClear();
  mockInvalidateQueries.mockClear();
  mockToastError.mockClear();
  mockCaptureEvent.mockClear();
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

describe("useContacts", () => {
  beforeEach(() => resetMocks());

  it("calls useQuery with correct query key", () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined, isLoading: true } as never);

    useContacts({ page: 1, pageSize: 25, sortBy: "name", sortOrder: "asc" });

    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: expect.arrayContaining(["contacts"]),
      }),
    );
  });

  it("builds a stable primitive query key (no raw object)", () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined, isLoading: true } as never);

    useContacts({
      page: 2,
      pageSize: 10,
      sortBy: "createdAt",
      sortOrder: "desc",
      search: "angel",
      pipelineStage: "prospect",
      tagId: "tag-1",
      type: "individual",
    });

    const call = vi.mocked(useQuery).mock.calls[0]?.[0];
    const queryKey = (call as unknown as { queryKey: unknown[] }).queryKey;
    // All query key entries beyond the first label must be primitives — not objects
    expect(queryKey[0]).toBe("contacts");
    for (const entry of queryKey.slice(1)) {
      expect(
        typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean",
      ).toBe(true);
    }
    expect(queryKey).toContain("angel");
    expect(queryKey).toContain("prospect");
    expect(queryKey).toContain("tag-1");
    expect(queryKey).toContain("individual");
    expect(queryKey).toContain("createdAt");
    expect(queryKey).toContain("desc");
    expect(queryKey).toContain(2);
    expect(queryKey).toContain(10);
  });

  it("uses stable defaults when optional params are absent", () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined, isLoading: true } as never);

    useContacts({ page: 1, pageSize: 25, sortBy: "name", sortOrder: "asc" });

    const call = vi.mocked(useQuery).mock.calls[0]?.[0];
    const queryKey = (call as unknown as { queryKey: unknown[] }).queryKey;
    // Every optional filter should resolve to a primitive (empty string for missing)
    for (const entry of queryKey.slice(1)) {
      expect(
        typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean",
      ).toBe(true);
    }
  });

  it("queryFn calls api and returns json", async () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
    useContacts({ page: 1, pageSize: 25, sortBy: "name", sortOrder: "asc" });
    const queryFn = captureQueryFn();
    const result = await queryFn();
    expect(result).toEqual([]);
  });

  it("queryFn passes optional params when provided", async () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
    useContacts({
      page: 2,
      pageSize: 10,
      sortBy: "createdAt",
      sortOrder: "desc",
      search: "angel",
      pipelineStage: "prospect",
      tagId: "tag-1",
      type: "individual",
    });
    const queryFn = captureQueryFn();
    const result = await queryFn();
    expect(result).toEqual([]);
  });

  it("passes enabled: true when enabled param is not provided", () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined, isLoading: true } as never);
    useContacts({ page: 1, pageSize: 25, sortBy: "name", sortOrder: "asc" });
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
  });

  it("passes enabled: false when enabled is explicitly false", () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined, isLoading: false } as never);
    useContacts({ page: 1, pageSize: 25, sortBy: "name", sortOrder: "asc", enabled: false });
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });
});

describe("useContact", () => {
  beforeEach(() => resetMocks());

  it("calls useQuery with contact query key and enabled flag", () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
    useContact("contact-1");
    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["contact", "contact-1"],
        enabled: true,
      }),
    );
  });

  it("disabled when contactId is empty string", () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
    useContact("");
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it("queryFn calls api and returns json", async () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
    useContact("contact-1");
    const queryFn = captureQueryFn();
    const result = await queryFn();
    expect(result).toEqual({});
  });
});

describe("useCreateContact", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useMutation).mockReturnValue({ mutate: vi.fn() } as never);
  });

  it("calls useMutation", () => {
    useCreateContact();
    expect(useMutation).toHaveBeenCalled();
  });

  it("mutationFn calls api.$post and returns json", async () => {
    useCreateContact();
    const mutationFn = captureMutationFn();
    const result = await mutationFn({ firstName: "Angel" });
    expect(result).toEqual({});
  });

  it("onSuccess invalidates contacts and donor-stats", () => {
    useCreateContact();
    const onSuccess = captureOnSuccess();
    onSuccess();
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["contacts"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["donor-stats"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["retention-stats"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["dashboard-overview"] });
  });

  it("onSuccess fires contact_created event", () => {
    useCreateContact();
    const onSuccess = captureOnSuccess();
    onSuccess();
    expect(mockCaptureEvent).toHaveBeenCalledWith("contact_created");
  });

  it("onError calls toast.error with the error message", () => {
    useCreateContact();
    const onError = captureOnError();
    expect(onError).toBeDefined();
    onError?.(new Error("Create failed"));
    expect(mockToastError).toHaveBeenCalledWith("Create failed");
  });

  it("onError tracks donor failure type without raw error text", () => {
    useCreateContact();
    const onError = captureOnError();
    onError?.(new Error("Name is required"));
    onError?.(new Error("Permission denied"));
    onError?.(new Error("Contact not found"));
    onError?.(new Error("Network request failed"));
    onError?.("bad");

    expect(mockCaptureEvent).toHaveBeenCalledWith("donor_operation_failed", {
      operation: "create_contact",
      failure_type: "validation",
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("donor_operation_failed", {
      operation: "create_contact",
      failure_type: "permission",
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("donor_operation_failed", {
      operation: "create_contact",
      failure_type: "not_found",
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("donor_operation_failed", {
      operation: "create_contact",
      failure_type: "network",
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith("donor_operation_failed", {
      operation: "create_contact",
      failure_type: "unknown",
    });
    expect(mockCaptureEvent).not.toHaveBeenCalledWith(
      "donor_operation_failed",
      expect.objectContaining({ message: expect.any(String) }),
    );
  });
});

describe("useUpdateContact", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useMutation).mockReturnValue({ mutate: vi.fn() } as never);
  });

  it("calls useMutation", () => {
    useUpdateContact("contact-1");
    expect(useMutation).toHaveBeenCalled();
  });

  it("mutationFn calls api.$patch and returns json", async () => {
    useUpdateContact("contact-1");
    const mutationFn = captureMutationFn();
    const result = await mutationFn({ firstName: "Updated" });
    expect(result).toEqual({});
  });

  it("onSuccess invalidates contacts, contact, and activity", () => {
    useUpdateContact("contact-1");
    const onSuccess = captureOnSuccess();
    onSuccess();
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["contacts"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["contact", "contact-1"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["dashboard-overview"] });
    // A contact's name is embedded into the event detail view — getEvent returns
    // attendees with their full contact record, and the event detail page renders
    // each attendee's name via attendeeDisplayName(attendee.contact) from the
    // ["event", id] query. Renaming a contact must refresh the event caches too —
    // the ["event"] prefix covers every open event detail page — or the attendee
    // list keeps showing the old name until a reload.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["event"] });
  });

  it("onSuccess fires contact_updated event", () => {
    useUpdateContact("contact-1");
    const onSuccess = captureOnSuccess();
    onSuccess();
    expect(mockCaptureEvent).toHaveBeenCalledWith("contact_updated");
  });
});

describe("useDeleteContact", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useMutation).mockReturnValue({ mutate: vi.fn() } as never);
  });

  it("calls useMutation", () => {
    useDeleteContact();
    expect(useMutation).toHaveBeenCalled();
  });

  it("mutationFn calls api.$delete", async () => {
    useDeleteContact();
    const mutationFn = captureMutationFn();
    await mutationFn("contact-1");
    // no return value assertion — void
  });

  it("onSuccess invalidates contacts and donor-stats", () => {
    useDeleteContact();
    const onSuccess = captureOnSuccess();
    onSuccess();
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["contacts"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["donor-stats"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["retention-stats"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["dashboard-overview"] });
  });

  it("onSuccess fires contact_deleted event", () => {
    useDeleteContact();
    const onSuccess = captureOnSuccess();
    onSuccess();
    expect(mockCaptureEvent).toHaveBeenCalledWith("contact_deleted");
  });

  it("onSuccess refreshes the accounting views (cascade donation JE reversals)", () => {
    useDeleteContact();
    const onSuccess = captureOnSuccess();
    onSuccess();
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
});

describe("useUpdatePipelineStage", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useMutation).mockReturnValue({ mutate: vi.fn() } as never);
  });

  it("calls useMutation", () => {
    useUpdatePipelineStage();
    expect(useMutation).toHaveBeenCalled();
  });

  it("mutationFn calls stage.$patch and returns json", async () => {
    useUpdatePipelineStage();
    const mutationFn = captureMutationFn();
    const result = await mutationFn({ contactId: "contact-1", stage: "prospect" });
    expect(result).toEqual({});
  });

  it("onSuccess invalidates contacts, contact, and activity", () => {
    useUpdatePipelineStage();
    const onSuccess = captureOnSuccess();
    onSuccess(undefined, { contactId: "contact-1", stage: "prospect" });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["contacts"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["contact", "contact-1"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["activity", "contact", "contact-1"],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["dashboard-overview"] });
  });

  it("onSuccess fires donor_stage_changed event with stage property", () => {
    useUpdatePipelineStage();
    const onSuccess = captureOnSuccess();
    onSuccess(undefined, { contactId: "contact-1", stage: "prospect" });
    expect(mockCaptureEvent).toHaveBeenCalledWith("donor_stage_changed", { stage: "prospect" });
  });
});

// ---------------------------------------------------------------------------
// Donations
// ---------------------------------------------------------------------------

describe("useDonations", () => {
  beforeEach(() => resetMocks());

  it("calls useQuery with donations query key and enabled flag", () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
    useDonations("contact-1", 1, 25);
    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["donations", "contact-1", 1, 25],
        enabled: true,
      }),
    );
  });

  it("disabled when contactId is empty", () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
    useDonations("", 1, 25);
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it("uses default page and pageSize", () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
    useDonations("contact-1");
    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["donations", "contact-1", 1, 25] }),
    );
  });

  it("queryFn calls api and returns json", async () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
    useDonations("contact-1", 1, 10);
    const queryFn = captureQueryFn();
    const result = await queryFn();
    expect(result).toEqual([]);
  });
});

describe("useCreateDonation", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useMutation).mockReturnValue({ mutate: vi.fn() } as never);
  });

  it("calls useMutation", () => {
    useCreateDonation("contact-1");
    expect(useMutation).toHaveBeenCalled();
  });

  it("mutationFn calls donations.$post and returns json", async () => {
    useCreateDonation("contact-1");
    const mutationFn = captureMutationFn();
    const result = await mutationFn({ amountCents: 5000 });
    expect(result).toEqual({});
  });

  it("rejects donation creation when the API returns an error response", async () => {
    vi.mocked(api.api.donors[":contactId"].donations.$post).mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: "Fund not found" }),
    } as never);

    useCreateDonation("contact-1");

    await expect(captureMutationFn()({ amountCents: 5000 })).rejects.toThrow("Fund not found");
  });

  it("onSuccess invalidates donations, contact, donor-stats", () => {
    useCreateDonation("contact-1");
    const onSuccess = captureOnSuccess();
    onSuccess();
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["donations", "contact-1"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["contact", "contact-1"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["donor-stats"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["retention-stats"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["dashboard-overview"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["contacts"] });
  });

  it("onSuccess invalidates accounting views the posted donation journal entry changes", () => {
    useCreateDonation("contact-1");
    const onSuccess = captureOnSuccess();
    onSuccess();
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

  it("onSuccess fires donation_recorded event", () => {
    useCreateDonation("contact-1");
    const onSuccess = captureOnSuccess();
    onSuccess();
    expect(mockCaptureEvent).toHaveBeenCalledWith("donation_recorded");
  });
});

describe("useUpdateDonation", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useMutation).mockReturnValue({ mutate: vi.fn() } as never);
  });

  it("calls useMutation", () => {
    useUpdateDonation("contact-1");
    expect(useMutation).toHaveBeenCalled();
  });

  it("mutationFn calls donations.$patch and returns json", async () => {
    useUpdateDonation("contact-1");
    const mutationFn = captureMutationFn();
    const result = await mutationFn({ donationId: "don-1", data: { amountCents: 1000 } });
    expect(result).toEqual({});
  });

  it("rejects donation updates when the API returns an error response", async () => {
    vi.mocked(api.api.donors[":contactId"].donations[":donationId"].$patch).mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: "Donation not found" }),
    } as never);

    useUpdateDonation("contact-1");

    await expect(
      captureMutationFn()({ donationId: "don-1", data: { amountCents: 1000 } }),
    ).rejects.toThrow("Donation not found");
  });

  it("onSuccess invalidates donations, contact, donor-stats", () => {
    useUpdateDonation("contact-1");
    const onSuccess = captureOnSuccess();
    onSuccess();
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["donations", "contact-1"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["contact", "contact-1"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["donor-stats"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["retention-stats"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["dashboard-overview"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["contacts"] });
    // A donation can be linked to an event attendee; getEvent sums each active
    // attendee's donation into summary.revenueCents, which the event detail page
    // renders from ["event", id]. Editing a donation's amount changes that total,
    // so the event caches must be refreshed too — the ["event"] prefix covers
    // every open event detail page (the mutation has no eventId in scope) — or
    // the event's revenue card stays stale until a reload.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["event"] });
  });

  it("onSuccess invalidates accounting views the re-posted donation journal entry changes", () => {
    useUpdateDonation("contact-1");
    const onSuccess = captureOnSuccess();
    onSuccess();
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

  it("onSuccess fires donation_updated event", () => {
    useUpdateDonation("contact-1");
    const onSuccess = captureOnSuccess();
    onSuccess();
    expect(mockCaptureEvent).toHaveBeenCalledWith("donation_updated");
  });
});

describe("useDeleteDonation", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useMutation).mockReturnValue({ mutate: vi.fn() } as never);
  });

  it("calls useMutation", () => {
    useDeleteDonation("contact-1");
    expect(useMutation).toHaveBeenCalled();
  });

  it("mutationFn calls donations.$delete", async () => {
    useDeleteDonation("contact-1");
    const mutationFn = captureMutationFn();
    await mutationFn("don-1");
  });

  it("onSuccess invalidates donations, contact, donor-stats", () => {
    useDeleteDonation("contact-1");
    const onSuccess = captureOnSuccess();
    onSuccess();
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["donations", "contact-1"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["contact", "contact-1"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["donor-stats"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["retention-stats"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["dashboard-overview"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["contacts"] });
    // A donation can be linked to an event attendee; getEvent sums each active
    // attendee's donation into summary.revenueCents, which the event detail page
    // renders from ["event", id]. Deleting a donation drops it from that total,
    // so the event caches must be refreshed too — the ["event"] prefix covers
    // every open event detail page (the mutation has no eventId in scope) — or
    // the event's revenue card stays stale until a reload.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["event"] });
  });

  it("onSuccess invalidates accounting views the reversed donation journal entry changes", () => {
    useDeleteDonation("contact-1");
    const onSuccess = captureOnSuccess();
    onSuccess();
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

  it("onSuccess fires donation_deleted event", () => {
    useDeleteDonation("contact-1");
    const onSuccess = captureOnSuccess();
    onSuccess();
    expect(mockCaptureEvent).toHaveBeenCalledWith("donation_deleted");
  });
});

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

describe("useTags", () => {
  beforeEach(() => resetMocks());

  it("calls useQuery with tags query key", () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined, isLoading: true } as never);
    useTags();
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["tags"] }));
  });

  it("queryFn calls api and returns json", async () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
    useTags();
    const queryFn = captureQueryFn();
    const result = await queryFn();
    expect(result).toEqual([]);
  });
});

describe("useCreateTag", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useMutation).mockReturnValue({ mutate: vi.fn() } as never);
  });

  it("calls useMutation", () => {
    useCreateTag();
    expect(useMutation).toHaveBeenCalled();
  });

  it("mutationFn calls tags.$post and returns json", async () => {
    useCreateTag();
    const mutationFn = captureMutationFn();
    const result = await mutationFn({ name: "Major Donor" });
    expect(result).toEqual({});
  });

  it("onSuccess invalidates tags", () => {
    useCreateTag();
    const onSuccess = captureOnSuccess();
    onSuccess();
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["tags"] });
  });
});

describe("useAddContactTags", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useMutation).mockReturnValue({ mutate: vi.fn() } as never);
  });

  it("calls useMutation", () => {
    useAddContactTags("contact-1");
    expect(useMutation).toHaveBeenCalled();
  });

  it("mutationFn calls contact tags.$post", async () => {
    useAddContactTags("contact-1");
    const mutationFn = captureMutationFn();
    await mutationFn(["tag-1", "tag-2"]);
  });

  it("onSuccess invalidates contact", () => {
    useAddContactTags("contact-1");
    const onSuccess = captureOnSuccess();
    onSuccess();
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["contact", "contact-1"] });
  });

  it("onSuccess invalidates the contacts list so tag-filtered views refresh", () => {
    // The donors list query (["contacts", ...]) accepts a tagId filter that the
    // API resolves through the contactTags junction. Adding a tag changes which
    // contacts match that filter, so the cached filtered list goes stale unless
    // the ["contacts"] prefix is refreshed here.
    useAddContactTags("contact-1");
    const onSuccess = captureOnSuccess();
    onSuccess();
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["contacts"] });
  });
});

describe("useRemoveContactTag", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useMutation).mockReturnValue({ mutate: vi.fn() } as never);
  });

  it("calls useMutation", () => {
    useRemoveContactTag("contact-1");
    expect(useMutation).toHaveBeenCalled();
  });

  it("mutationFn calls contact tags.$delete", async () => {
    useRemoveContactTag("contact-1");
    const mutationFn = captureMutationFn();
    await mutationFn("tag-1");
  });

  it("onSuccess invalidates contact", () => {
    useRemoveContactTag("contact-1");
    const onSuccess = captureOnSuccess();
    onSuccess();
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["contact", "contact-1"] });
  });

  it("onSuccess invalidates the contacts list so tag-filtered views refresh", () => {
    // Removing a tag changes which contacts match a tagId-filtered donors list
    // (resolved via the contactTags junction on the API), so the cached
    // ["contacts", ...] list must refresh or it keeps showing the contact.
    useRemoveContactTag("contact-1");
    const onSuccess = captureOnSuccess();
    onSuccess();
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["contacts"] });
  });
});

// ---------------------------------------------------------------------------
// Communications
// ---------------------------------------------------------------------------

describe("useCommunications", () => {
  beforeEach(() => resetMocks());

  it("calls useQuery with communications query key and enabled flag", () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
    useCommunications("contact-1", 1, 25);
    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["communications", "contact-1", 1, 25],
        enabled: true,
      }),
    );
  });

  it("disabled when contactId is empty", () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
    useCommunications("", 1, 25);
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it("uses default page and pageSize", () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
    useCommunications("contact-1");
    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["communications", "contact-1", 1, 25] }),
    );
  });

  it("queryFn calls api and returns json", async () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
    useCommunications("contact-1", 1, 10);
    const queryFn = captureQueryFn();
    const result = await queryFn();
    expect(result).toEqual([]);
  });
});

describe("useCreateCommunication", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useMutation).mockReturnValue({ mutate: vi.fn() } as never);
  });

  it("calls useMutation", () => {
    useCreateCommunication("contact-1");
    expect(useMutation).toHaveBeenCalled();
  });

  it("mutationFn calls communications.$post and returns json", async () => {
    useCreateCommunication("contact-1");
    const mutationFn = captureMutationFn();
    const result = await mutationFn({ type: "email", subject: "Hello" });
    expect(result).toEqual({});
  });

  it("onSuccess invalidates communications", () => {
    useCreateCommunication("contact-1");
    const onSuccess = captureOnSuccess();
    onSuccess(undefined, { type: "email", subject: "Hello" });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["communications", "contact-1"],
    });
  });

  it("onSuccess fires communication_logged event with type property", () => {
    useCreateCommunication("contact-1");
    const onSuccess = captureOnSuccess();
    onSuccess(undefined, { type: "call", subject: "Follow up" });
    expect(mockCaptureEvent).toHaveBeenCalledWith("communication_logged", { type: "call" });
  });
});

describe("useSendDonorMailMerge", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useMutation).mockReturnValue({ mutate: vi.fn() } as never);
  });

  it("mutationFn posts to the donor mail merge endpoint", async () => {
    useSendDonorMailMerge();
    const mutationFn = captureMutationFn();
    const payload = {
      attemptId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      contactIds: ["11111111-1111-4111-8111-111111111111"],
      subject: "Hi {{firstName}}",
      body: "Thanks.",
    };

    const result = await mutationFn(payload);

    expect(result).toEqual({ sent: 1, skipped: 0, failed: 0 });
    expect(api.api.donors["mail-merge"].send.$post).toHaveBeenCalledWith({
      json: payload,
    });
  });

  it("onSuccess captures safe counts and invalidates communication timelines", () => {
    useSendDonorMailMerge();
    const onSuccess = captureOnSuccess();

    onSuccess({ sent: 2, skipped: 1, failed: 0 });

    expect(mockCaptureEvent).toHaveBeenCalledWith("donor_mail_merge_sent", {
      sent_count: 2,
      skipped_count: 1,
      failed_count: 0,
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["communications"] });
  });
});

// ---------------------------------------------------------------------------
// Segments
// ---------------------------------------------------------------------------

describe("useSegments", () => {
  beforeEach(() => resetMocks());

  it("calls useQuery with segments query key", () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined, isLoading: true } as never);
    useSegments();
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["segments"] }));
  });

  it("queryFn calls api and returns json", async () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
    useSegments();
    const queryFn = captureQueryFn();
    const result = await queryFn();
    expect(result).toEqual([]);
  });
});

describe("useCreateSegment", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useMutation).mockReturnValue({ mutate: vi.fn() } as never);
  });

  it("calls useMutation", () => {
    useCreateSegment();
    expect(useMutation).toHaveBeenCalled();
  });

  it("mutationFn calls segments.$post and returns json", async () => {
    useCreateSegment();
    const mutationFn = captureMutationFn();
    const result = await mutationFn({ name: "Major Donors", filters: {} });
    expect(result).toEqual({});
  });

  it("onSuccess invalidates segments", () => {
    useCreateSegment();
    const onSuccess = captureOnSuccess();
    onSuccess();
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["segments"] });
  });
});

describe("useDeleteSegment", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useMutation).mockReturnValue({ mutate: vi.fn() } as never);
  });

  it("calls useMutation", () => {
    useDeleteSegment();
    expect(useMutation).toHaveBeenCalled();
  });

  it("mutationFn calls segments.:segmentId.$delete", async () => {
    useDeleteSegment();
    const mutationFn = captureMutationFn();
    await mutationFn("seg-1");
    const mockDelete = (
      api.api.donors.segments as unknown as Record<string, { $delete: ReturnType<typeof vi.fn> }>
    )[":segmentId"]!.$delete;
    expect(mockDelete).toHaveBeenCalledWith({ param: { segmentId: "seg-1" } });
  });

  it("onSuccess invalidates segments", () => {
    useDeleteSegment();
    const onSuccess = captureOnSuccess();
    onSuccess();
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["segments"] });
  });

  it("mutationFn throws when API returns 404", async () => {
    const mockDeleteFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: vi.fn().mockResolvedValue({ error: "Segment not found" }),
    });
    (api.api.donors.segments as unknown as Record<string, { $delete: ReturnType<typeof vi.fn> }>)[
      ":segmentId"
    ]!.$delete = mockDeleteFn;

    useDeleteSegment();
    const mutationFn = captureMutationFn();
    await expect(mutationFn("missing-seg")).rejects.toThrow("Segment not found");

    // Restore default mock
    (api.api.donors.segments as unknown as Record<string, { $delete: ReturnType<typeof vi.fn> }>)[
      ":segmentId"
    ]!.$delete = vi.fn().mockResolvedValue({ ok: true, status: 204 });
  });
});

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

describe("useDonorStats", () => {
  beforeEach(() => resetMocks());

  it("calls useQuery with stats query key", () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined, isLoading: true } as never);
    useDonorStats();
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["donor-stats"] }));
  });

  it("queryFn calls stats.$get and returns json", async () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
    useDonorStats();
    const queryFn = captureQueryFn();
    const result = await queryFn();
    expect(result).toEqual({});
  });
});

describe("useRetentionStats", () => {
  beforeEach(() => resetMocks());

  it("calls useQuery with retention query key", () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined, isLoading: true } as never);
    useRetentionStats();
    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["retention-stats"] }),
    );
  });

  it("queryFn calls stats.retention.$get and returns json", async () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
    useRetentionStats();
    const queryFn = captureQueryFn();
    const result = await queryFn();
    expect(result).toEqual([]);
  });
});
