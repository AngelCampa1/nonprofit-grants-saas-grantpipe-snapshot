import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInvalidateQueries = vi.fn();
const mockCaptureEvent = vi.fn();
const mockCaptureAppException = vi.fn();

vi.mock("../lib/analytics", () => ({
  captureEvent: (...args: unknown[]) => mockCaptureEvent(...args),
}));

vi.mock("../lib/sentry", () => ({
  captureAppException: (...args: unknown[]) => mockCaptureAppException(...args),
}));

vi.mock("../lib/api-client", () => ({
  api: {
    api: {
      import: {
        $get: vi.fn().mockResolvedValue({
          ok: true,
          headers: { get: () => "application/json" },
          json: vi.fn().mockResolvedValue({
            data: [],
            total: 0,
            page: 1,
            pageSize: 25,
          }),
        }),
        "migration-plan": {
          $get: vi.fn().mockResolvedValue({
            ok: true,
            headers: { get: () => "application/json" },
            json: vi.fn().mockResolvedValue({
              sourceId: "quickbooks",
              sourceLabel: "QuickBooks",
              summary: "Move finance setup from QuickBooks CSV exports.",
              recommendedOrder: [
                {
                  entityType: "contacts",
                  label: "Contacts",
                  phase: "foundation",
                  status: "ready",
                  description: "Import donor records first.",
                  supportedPresetIds: ["quickbooks"],
                },
              ],
              progress: [
                {
                  entityType: "contacts",
                  status: "not_started",
                  latestImportAt: null,
                  insertedRows: 0,
                  failedRows: 0,
                },
              ],
              nextEntityType: "contacts",
            }),
          }),
        },
        preview: {
          $post: vi.fn().mockResolvedValue({
            ok: true,
            headers: { get: () => "application/json" },
            json: vi.fn().mockResolvedValue({
              entityType: "contacts",
              filename: "test.csv",
              headers: ["name", "email"],
              rows: [],
              totalRows: 0,
            }),
          }),
        },
        commit: {
          $post: vi.fn().mockResolvedValue({
            ok: true,
            headers: { get: () => "application/json" },
            json: vi.fn().mockResolvedValue({
              insertedRows: 5,
              duplicateRows: 0,
              failedRows: 0,
              totalRows: 5,
              createdCounts: {
                contacts: 5,
                donations: 0,
                grants: 0,
                funders: 0,
                grantOpportunities: 0,
                funds: 0,
                openingBalanceLines: 0,
                pledges: 0,
                pledgeInstallments: 0,
              },
              history: {
                id: "hist-1",
                status: "completed",
                filename: "contacts.csv",
                entityType: "contacts",
              },
            }),
          }),
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
}));

import { useMutation, useQuery } from "@tanstack/react-query";
import { useImportHistory, useImportMutations, useMigrationPlan } from "./use-imports";

function resetMocks() {
  vi.mocked(useQuery).mockClear();
  vi.mocked(useMutation).mockClear();
  mockInvalidateQueries.mockClear();
  mockCaptureEvent.mockClear();
  mockCaptureAppException.mockClear();
}

function asMutationConfig(value: unknown) {
  return value as {
    mutationFn: (arg?: unknown) => Promise<unknown>;
    onSuccess?: (data: unknown, variables: unknown) => void;
    onError?: (error: unknown, variables: unknown) => void;
  };
}

describe("useImportHistory", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
  });

  it("registers a query for import history", async () => {
    const { api } = await import("../lib/api-client");
    useImportHistory();
    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["import-history"] }),
    );
    const call = vi.mocked(useQuery).mock.calls[0]?.[0];
    const queryFn = (call as unknown as { queryFn: () => Promise<unknown> }).queryFn;
    const result = await queryFn();
    expect(api.api.import.$get).toHaveBeenCalledWith({
      query: {
        page: "1",
        pageSize: "25",
        sortBy: "createdAt",
        sortOrder: "desc",
      },
    });
    expect(result).toMatchObject({ data: [], total: 0, page: 1, pageSize: 25 });
  });

  it("throws the message field from a JSON error response", async () => {
    const { api } = await import("../lib/api-client");
    vi.mocked(api.api.import.$get).mockResolvedValueOnce({
      ok: false,
      status: 422,
      headers: { get: () => "application/json" },
      json: vi.fn().mockResolvedValue({ message: "History unavailable" }),
    } as never);

    useImportHistory();
    const call = vi.mocked(useQuery).mock.calls[0]?.[0];
    const queryFn = (call as unknown as { queryFn: () => Promise<unknown> }).queryFn;

    await expect(queryFn()).rejects.toMatchObject({
      message: "History unavailable",
      status: 422,
    });
  });
});

describe("useMigrationPlan", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
  });

  it("registers a source-specific migration plan query", async () => {
    const { api } = await import("../lib/api-client");

    useMigrationPlan("quickbooks");

    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["migration-plan", "quickbooks"] }),
    );
    const call = vi.mocked(useQuery).mock.calls[0]?.[0];
    const queryFn = (call as unknown as { queryFn: () => Promise<unknown> }).queryFn;
    const result = await queryFn();

    expect(api.api.import["migration-plan"].$get).toHaveBeenCalledWith({
      query: { source: "quickbooks" },
    });
    expect(result).toMatchObject({
      sourceId: "quickbooks",
      nextEntityType: "contacts",
    });
  });
});

describe("useImportMutations", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useMutation).mockImplementation((options) => options as never);
  });

  it("previews an import", async () => {
    const { api } = await import("../lib/api-client");
    const { previewImport } = useImportMutations();
    const payload = {
      entityType: "contacts",
      filename: "test.csv",
      csvText: "name,email\nAlice,alice@example.com",
    };
    const result = await asMutationConfig(previewImport).mutationFn(payload);
    expect(api.api.import.preview.$post).toHaveBeenCalledWith({ json: payload });
    expect(result).toMatchObject({ entityType: "contacts", filename: "test.csv" });
  });

  it("reads a text response when the content type header is missing", async () => {
    const { api } = await import("../lib/api-client");
    vi.mocked(api.api.import.preview.$post).mockResolvedValueOnce({
      ok: true,
      headers: { get: () => null },
      text: vi.fn().mockResolvedValue("preview accepted"),
    } as never);

    const { previewImport } = useImportMutations();
    const result = await asMutationConfig(previewImport).mutationFn({
      entityType: "contacts",
      filename: "test.csv",
      csvText: "name,email\nAlice,alice@example.com",
    });

    expect(result).toBe("preview accepted");
  });

  it("commits an import, fires import_completed event, and invalidates import-history", async () => {
    const { commitImport } = useImportMutations();
    const data = {
      entityType: "contacts" as const,
      filename: "contacts.csv",
      mapping: { name: "name", email: "email" },
      rows: [{ name: "Alice", email: "alice@example.com" }],
    };
    const result = await asMutationConfig(commitImport).mutationFn(data);
    expect(result).toMatchObject({ insertedRows: 5 });

    asMutationConfig(commitImport).onSuccess?.(result, data);
    expect(mockCaptureEvent).toHaveBeenCalledWith("import_completed", {
      entity_type: "contacts",
      total_rows_bucket: "1-10",
      inserted_rows_bucket: "1-10",
      duplicate_rows_bucket: "0",
      failed_rows_bucket: "0",
      contacts_created_bucket: "1-10",
      donations_created_bucket: "0",
      grants_created_bucket: "0",
      funders_created_bucket: "0",
      grant_opportunities_created_bucket: "0",
      funds_created_bucket: "0",
      opening_balance_lines_created_bucket: "0",
      pledges_created_bucket: "0",
      pledge_installments_created_bucket: "0",
    });
    expect(mockCaptureEvent).not.toHaveBeenCalledWith(
      "import_completed",
      expect.objectContaining({
        total_rows: expect.any(Number),
        inserted_rows: expect.any(Number),
        duplicate_rows: expect.any(Number),
        failed_rows: expect.any(Number),
        contacts_created: expect.any(Number),
      }),
    );
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["import-history"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["migration-plan"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["contacts"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["dashboard-overview"] });
    // Importing contacts changes the donors page donor-stats tile (total/new donors).
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["donor-stats"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["org-activity"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["activity"] });
  });

  it("fires import_completed with correct entity_type for donations", async () => {
    const { commitImport } = useImportMutations();
    const data = {
      entityType: "donations" as const,
      filename: "donations.csv",
      mapping: {},
      rows: [],
    };
    const result = await asMutationConfig(commitImport).mutationFn(data);
    asMutationConfig(commitImport).onSuccess?.(result, data);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "import_completed",
      expect.objectContaining({
        entity_type: "donations",
        total_rows_bucket: "1-10",
      }),
    );
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["donations"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["contacts"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["dashboard-overview"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["donor-stats"] });
    // Importing donations changes year-over-year retention shown on the donors page.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["retention-stats"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["org-activity"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["activity"] });
    // The backend posts a journal entry for every imported donation (postDonation
    // in the import service), exactly like the standalone useCreateDonation path
    // which refreshes the accounting caches via invalidateDonationAccountingViews.
    // The import path must refresh them too — the journal-entries list and all
    // balance/report views read these keys — or every Accounting page shows the
    // pre-import state until a reload.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-journal-entries"],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-trial-balance"],
    });
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

  it("fires import_completed with correct entity_type for grants", async () => {
    const { commitImport } = useImportMutations();
    const data = {
      entityType: "grants" as const,
      filename: "grants.csv",
      mapping: {},
      rows: [],
    };
    const result = await asMutationConfig(commitImport).mutationFn(data);
    asMutationConfig(commitImport).onSuccess?.(result, data);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "import_completed",
      expect.objectContaining({
        entity_type: "grants",
        total_rows_bucket: "1-10",
      }),
    );
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["grants"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["grant-pipeline"] });
    // A grant import writes applicationDeadline/startDate/endDate, which the
    // calendar overview (["calendar-overview", month]) reads to build each
    // month's deadline items. The import commit must invalidate the calendar
    // caches too — every other grant mutation already does via invalidateGrant —
    // or the calendar keeps showing the pre-import deadlines until a reload.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["calendar-overview"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["dashboard-overview"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["funders"] });
    // A grant import requires a funder per row and links every imported grant to
    // it (match-or-create by name/ID), so each imported grant shows up in that
    // funder's "Grant History" tab, which the funder detail (["funder", id])
    // embeds via getFunder's grants:true. The ["funders"] plural list key does
    // NOT prefix-match the ["funder", id] singular detail key, so the import
    // commit must invalidate ["funder"] too — or an open funder detail keeps
    // showing the pre-import grant list until a reload.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["funder"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["org-activity"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["activity"] });
  });

  it("invalidates tracked opportunity queries after a grant opportunity import", async () => {
    const { commitImport } = useImportMutations();
    const data = {
      entityType: "grant_opportunities" as const,
      filename: "opportunities.csv",
      mapping: {},
      rows: [],
    };
    const result = await asMutationConfig(commitImport).mutationFn(data);
    asMutationConfig(commitImport).onSuccess?.(result, data);

    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "import_completed",
      expect.objectContaining({
        entity_type: "grant_opportunities",
        total_rows_bucket: "1-10",
      }),
    );
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["tracked-grant-opportunities"],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["grant-opportunities"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["org-activity"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["activity"] });
  });

  it("invalidates fund and accounting queries after a fund import", async () => {
    const { commitImport } = useImportMutations();
    const data = {
      entityType: "funds" as const,
      filename: "funds.csv",
      mapping: {},
      rows: [],
    };
    const result = await asMutationConfig(commitImport).mutationFn(data);
    asMutationConfig(commitImport).onSuccess?.(result, data);

    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "import_completed",
      expect.objectContaining({
        entity_type: "funds",
        funds_created_bucket: "0",
      }),
    );
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["funds"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-trial-balance"],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["org-activity"] });
  });

  it("invalidates accounting reports after an opening balance import", async () => {
    const { commitImport } = useImportMutations();
    const data = {
      entityType: "opening_balances" as const,
      filename: "opening-balances.csv",
      mapping: {},
      rows: [],
    };
    const result = await asMutationConfig(commitImport).mutationFn(data);
    asMutationConfig(commitImport).onSuccess?.(result, data);

    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "import_completed",
      expect.objectContaining({
        entity_type: "opening_balances",
        opening_balance_lines_created_bucket: "0",
      }),
    );
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-journal-entries"],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-report-activities"],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["funds"] });
  });

  it("invalidates pledge and donor queries after a pledge schedule import", async () => {
    const { commitImport } = useImportMutations();
    const data = {
      entityType: "pledges" as const,
      filename: "pledges.csv",
      mapping: {},
      rows: [],
    };
    const result = await asMutationConfig(commitImport).mutationFn(data);
    asMutationConfig(commitImport).onSuccess?.(result, data);

    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "import_completed",
      expect.objectContaining({
        entity_type: "pledges",
        pledges_created_bucket: "0",
        pledge_installments_created_bucket: "0",
      }),
    );
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["pledges"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["contacts"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["accounting-journal-entries"],
    });
  });

  it("does not fire import_completed before onSuccess", async () => {
    const { api } = await import("../lib/api-client");
    vi.mocked(api.api.import.commit.$post).mockResolvedValueOnce({
      ok: false,
      headers: { get: () => "application/json" },
      json: vi.fn().mockResolvedValue({ error: "Commit failed" }),
    } as never);

    const { commitImport } = useImportMutations();
    await expect(
      asMutationConfig(commitImport).mutationFn({
        entityType: "contacts",
        filename: "fail.csv",
        mapping: {},
        rows: [],
      }),
    ).rejects.toThrow();

    expect(mockCaptureEvent).not.toHaveBeenCalled();
  });

  it("fires import_failed with safe import metadata when commit fails", async () => {
    const { commitImport } = useImportMutations();
    const error = new Error("Invalid mapping");
    asMutationConfig(commitImport).onError?.(error, {
      entityType: "contacts",
      filename: "contacts.csv",
      mapping: {},
      rows: [{ name: "Alice" }],
    });

    expect(mockCaptureEvent).toHaveBeenCalledWith("import_failed", {
      entity_type: "contacts",
      error_code: "api_error",
      total_rows_bucket: "1-10",
    });
    expect(mockCaptureAppException).toHaveBeenCalledWith(error, {
      tags: {
        feature: "import",
        operation: "commit",
        entity_type: "contacts",
      },
      extra: {
        totalRowsBucket: "1-10",
      },
    });
    expect(JSON.stringify(mockCaptureAppException.mock.calls)).not.toContain("contacts.csv");
    expect(JSON.stringify(mockCaptureAppException.mock.calls)).not.toContain("Alice");
  });

  it("reports unknown import failures for non-Error rejections", () => {
    const { commitImport } = useImportMutations();

    asMutationConfig(commitImport).onError?.("network down", {
      entityType: "grant_opportunities",
      filename: "opportunities.csv",
      mapping: {},
      rows: [],
    });

    expect(mockCaptureEvent).toHaveBeenCalledWith("import_failed", {
      entity_type: "grant_opportunities",
      error_code: "unknown_error",
      total_rows_bucket: "0",
    });
  });

  it("throws ApiError when commit returns an error response", async () => {
    const { api } = await import("../lib/api-client");
    vi.mocked(api.api.import.commit.$post).mockResolvedValueOnce({
      ok: false,
      headers: { get: () => "application/json" },
      json: vi.fn().mockResolvedValue({ error: "Invalid mapping" }),
    } as never);

    const { commitImport } = useImportMutations();
    await expect(
      asMutationConfig(commitImport).mutationFn({
        entityType: "contacts",
        filename: "bad.csv",
        mapping: {},
        rows: [],
      }),
    ).rejects.toThrow("Invalid mapping");
  });

  it("throws ApiError using the response message field when error is omitted", async () => {
    const { api } = await import("../lib/api-client");
    vi.mocked(api.api.import.preview.$post).mockResolvedValueOnce({
      ok: false,
      status: 400,
      headers: { get: () => "application/json" },
      json: vi.fn().mockResolvedValue({ message: "CSV headers are missing" }),
    } as never);

    const { previewImport } = useImportMutations();
    await expect(
      asMutationConfig(previewImport).mutationFn({
        entityType: "contacts",
        filename: "bad.csv",
        csvText: "",
      }),
    ).rejects.toThrow("CSV headers are missing");
  });

  it("throws ApiError using a non-empty text response body", async () => {
    const { api } = await import("../lib/api-client");
    vi.mocked(api.api.import.preview.$post).mockResolvedValueOnce({
      ok: false,
      status: 422,
      headers: { get: () => "text/plain" },
      text: vi.fn().mockResolvedValue("Unsupported delimiter"),
    } as never);

    const { previewImport } = useImportMutations();
    await expect(
      asMutationConfig(previewImport).mutationFn({
        entityType: "contacts",
        filename: "bad.csv",
        csvText: "name;email",
      }),
    ).rejects.toThrow("Unsupported delimiter");
  });

  it("falls back to a generic ApiError when a JSON error body cannot be parsed", async () => {
    const { api } = await import("../lib/api-client");
    vi.mocked(api.api.import.$get).mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: { get: () => "application/json" },
      json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected token")),
    } as never);

    useImportHistory();
    const call = vi.mocked(useQuery).mock.calls[0]?.[0];
    const queryFn = (call as unknown as { queryFn: () => Promise<unknown> }).queryFn;

    await expect(queryFn()).rejects.toThrow("Request failed");
  });

  it("falls back to a generic ApiError when a text error body cannot be read", async () => {
    const { api } = await import("../lib/api-client");
    vi.mocked(api.api.import.preview.$post).mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: { get: () => "text/plain" },
      text: vi.fn().mockRejectedValue(new Error("stream failed")),
    } as never);

    const { previewImport } = useImportMutations();
    await expect(
      asMutationConfig(previewImport).mutationFn({
        entityType: "contacts",
        filename: "bad.csv",
        csvText: "",
      }),
    ).rejects.toThrow("Request failed");
  });

  it("throws ApiError with generic message when error body is empty", async () => {
    const { api } = await import("../lib/api-client");
    vi.mocked(api.api.import.commit.$post).mockResolvedValueOnce({
      ok: false,
      headers: { get: () => "text/plain" },
      text: vi.fn().mockResolvedValue(""),
    } as never);

    const { commitImport } = useImportMutations();
    await expect(
      asMutationConfig(commitImport).mutationFn({
        entityType: "contacts",
        filename: "bad.csv",
        mapping: {},
        rows: [],
      }),
    ).rejects.toThrow("Request failed");
  });

  it("throws ApiError from a message field when the error payload omits error", async () => {
    const { api } = await import("../lib/api-client");
    vi.mocked(api.api.import.commit.$post).mockResolvedValueOnce({
      ok: false,
      headers: { get: () => "application/json" },
      json: vi.fn().mockResolvedValue({ message: "Commit message failed" }),
    } as never);

    const { commitImport } = useImportMutations();
    await expect(
      asMutationConfig(commitImport).mutationFn({
        entityType: "contacts",
        filename: "bad.csv",
        mapping: {},
        rows: [],
      }),
    ).rejects.toThrow("Commit message failed");
  });

  it("throws ApiError from a non-empty text error body", async () => {
    const { api } = await import("../lib/api-client");
    vi.mocked(api.api.import.commit.$post).mockResolvedValueOnce({
      ok: false,
      headers: { get: () => "text/plain" },
      text: vi.fn().mockResolvedValue("Plain text failure"),
    } as never);

    const { commitImport } = useImportMutations();
    await expect(
      asMutationConfig(commitImport).mutationFn({
        entityType: "contacts",
        filename: "bad.csv",
        mapping: {},
        rows: [],
      }),
    ).rejects.toThrow("Plain text failure");
  });

  it("falls back to a generic ApiError when parsing an error response throws", async () => {
    const { api } = await import("../lib/api-client");
    vi.mocked(api.api.import.commit.$post).mockResolvedValueOnce({
      ok: false,
      headers: { get: () => "application/json" },
      json: vi.fn().mockRejectedValue(new Error("bad json")),
    } as never);

    const { commitImport } = useImportMutations();
    await expect(
      asMutationConfig(commitImport).mutationFn({
        entityType: "contacts",
        filename: "bad.csv",
        mapping: {},
        rows: [],
      }),
    ).rejects.toThrow("Request failed");
  });

  it("falls back to a generic ApiError when reading a text error response throws", async () => {
    const { api } = await import("../lib/api-client");
    vi.mocked(api.api.import.commit.$post).mockResolvedValueOnce({
      ok: false,
      headers: { get: () => "text/plain" },
      text: vi.fn().mockRejectedValue(new Error("bad text")),
    } as never);

    const { commitImport } = useImportMutations();
    await expect(
      asMutationConfig(commitImport).mutationFn({
        entityType: "contacts",
        filename: "bad.csv",
        mapping: {},
        rows: [],
      }),
    ).rejects.toThrow("Request failed");
  });

  it("throws ApiError with text response body when non-JSON request fails", async () => {
    const { api } = await import("../lib/api-client");
    vi.mocked(api.api.import.preview.$post).mockResolvedValueOnce({
      ok: false,
      status: 400,
      headers: { get: () => "text/plain" },
      text: vi.fn().mockResolvedValue("CSV is empty"),
    } as never);

    const { previewImport } = useImportMutations();
    await expect(
      asMutationConfig(previewImport).mutationFn({
        entityType: "contacts",
        filename: "empty.csv",
        csvText: "",
      }),
    ).rejects.toMatchObject({ message: "CSV is empty", status: 400 });
  });

  it("throws a generic ApiError when JSON parsing fails on an error response", async () => {
    const { api } = await import("../lib/api-client");
    vi.mocked(api.api.import.preview.$post).mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: { get: () => "application/json" },
      json: vi.fn().mockRejectedValue(new Error("bad json")),
    } as never);

    const { previewImport } = useImportMutations();
    await expect(
      asMutationConfig(previewImport).mutationFn({
        entityType: "contacts",
        filename: "bad.csv",
        csvText: "nope",
      }),
    ).rejects.toMatchObject({ message: "Request failed", status: 500 });
  });

  it("throws a generic ApiError when text parsing fails on an error response", async () => {
    const { api } = await import("../lib/api-client");
    vi.mocked(api.api.import.preview.$post).mockResolvedValueOnce({
      ok: false,
      status: 502,
      headers: { get: () => "text/plain" },
      text: vi.fn().mockRejectedValue(new Error("stream failed")),
    } as never);

    const { previewImport } = useImportMutations();
    await expect(
      asMutationConfig(previewImport).mutationFn({
        entityType: "contacts",
        filename: "bad.csv",
        csvText: "nope",
      }),
    ).rejects.toMatchObject({ message: "Request failed", status: 502 });
  });
});
