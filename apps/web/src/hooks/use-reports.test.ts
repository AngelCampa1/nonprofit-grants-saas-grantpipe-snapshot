import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  mockInvalidateQueries: vi.fn(),
  mockGrantsGet: vi.fn(),
  mockReportsGet: vi.fn(),
  mockReportGet: vi.fn(),
  mockPreviewGet: vi.fn(),
  mockGrantPost: vi.fn(),
  mockAuditPost: vi.fn(),
  mockSefaPreviewGet: vi.fn(),
  mockSefaPost: vi.fn(),
  mockIrsPost: vi.fn(),
  mockBoardPost: vi.fn(),
  mockYearEndStatementPost: vi.fn(),
  mockAcknowledgmentPost: vi.fn(),
  mockTemplateGet: vi.fn(),
  mockTemplatePatch: vi.fn(),
  mockCaptureEvent: vi.fn(),
}));

vi.mock("../lib/api-client", () => ({
  api: {
    api: {
      grants: {
        $get: hoisted.mockGrantsGet,
      },
      compliance: {
        reports: {
          $get: hoisted.mockReportsGet,
          ":reportId": {
            $get: hoisted.mockReportGet,
            preview: {
              $get: hoisted.mockPreviewGet,
            },
            download: {
              $get: vi.fn().mockResolvedValue(new Response("ok")),
            },
          },
          compliance: {
            grants: {
              ":grantId": {
                $post: hoisted.mockGrantPost,
              },
            },
          },
          audit: {
            "fiscal-years": {
              ":fiscalYear": {
                $post: hoisted.mockAuditPost,
              },
            },
          },
          sefa: {
            preview: {
              $get: hoisted.mockSefaPreviewGet,
            },
            $post: hoisted.mockSefaPost,
          },
          "irs-990": {
            $post: hoisted.mockIrsPost,
          },
          board: {
            $post: hoisted.mockBoardPost,
          },
          "donor-year-end-statements": {
            $post: hoisted.mockYearEndStatementPost,
          },
          acknowledgments: {
            donations: {
              ":donationId": {
                $post: hoisted.mockAcknowledgmentPost,
              },
            },
          },
        },
        templates: {
          acknowledgment: {
            $get: hoisted.mockTemplateGet,
            $patch: hoisted.mockTemplatePatch,
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
    invalidateQueries: hoisted.mockInvalidateQueries,
  })),
}));

vi.mock("../lib/analytics", () => ({
  captureEvent: (...args: unknown[]) => hoisted.mockCaptureEvent(...args),
}));

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  useAcknowledgmentTemplate,
  useGenerateAcknowledgmentLetter,
  useGenerateAuditReport,
  useGenerateBoardReport,
  useGenerateDonorYearEndStatementRun,
  useGenerateGrantComplianceReport,
  useGenerateIrs990Report,
  useGenerateSefaReport,
  useReportArtifact,
  useReportArtifacts,
  useReportGrantOptions,
  useReportPreview,
  useSefaTripwire,
  useUpdateAcknowledgmentTemplate,
} from "./use-reports";

function captureQueryFn() {
  const call = vi.mocked(useQuery).mock.calls[0]?.[0];
  return (call as unknown as { queryFn: () => Promise<unknown> }).queryFn;
}

function captureRefetchInterval() {
  const call = vi.mocked(useQuery).mock.calls[0]?.[0];
  return (
    call as unknown as {
      refetchInterval: (query: { state: { data?: { status?: string } } }) => number | false;
    }
  ).refetchInterval;
}

function captureMutationFn() {
  const call = vi.mocked(useMutation).mock.calls[0]?.[0];
  return (call as { mutationFn: (arg: unknown) => Promise<unknown> }).mutationFn;
}

function captureOnSuccess() {
  const call = vi.mocked(useMutation).mock.calls[0]?.[0];
  return (call as { onSuccess: () => void }).onSuccess;
}

function resetMocks() {
  vi.mocked(useQuery).mockClear();
  vi.mocked(useMutation).mockClear();
  hoisted.mockInvalidateQueries.mockClear();
  hoisted.mockGrantsGet.mockClear();
  hoisted.mockReportsGet.mockClear();
  hoisted.mockReportGet.mockClear();
  hoisted.mockPreviewGet.mockClear();
  hoisted.mockGrantPost.mockClear();
  hoisted.mockAuditPost.mockClear();
  hoisted.mockSefaPreviewGet.mockClear();
  hoisted.mockSefaPost.mockClear();
  hoisted.mockIrsPost.mockClear();
  hoisted.mockBoardPost.mockClear();
  hoisted.mockYearEndStatementPost.mockClear();
  hoisted.mockAcknowledgmentPost.mockClear();
  hoisted.mockTemplateGet.mockClear();
  hoisted.mockTemplatePatch.mockClear();
  hoisted.mockCaptureEvent.mockClear();
  hoisted.mockGrantsGet.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue([]) });
  hoisted.mockReportsGet.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue([]) });
  hoisted.mockReportGet.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({}) });
  hoisted.mockPreviewGet.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({}) });
  hoisted.mockGrantPost.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({}) });
  hoisted.mockAuditPost.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({}) });
  hoisted.mockSefaPreviewGet.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({}) });
  hoisted.mockSefaPost.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({}) });
  hoisted.mockIrsPost.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({}) });
  hoisted.mockBoardPost.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({}) });
  hoisted.mockYearEndStatementPost.mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({}),
  });
  hoisted.mockAcknowledgmentPost.mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({}),
  });
  hoisted.mockTemplateGet.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({}) });
  hoisted.mockTemplatePatch.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({}) });
}

describe("report queries", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
  });

  it("loads report artifacts with filters", async () => {
    useReportArtifacts({
      page: 1,
      pageSize: 25,
      sortBy: "createdAt",
      sortOrder: "desc",
      type: "board",
      status: "ready",
    });
    const result = await captureQueryFn()();
    expect(hoisted.mockReportsGet).toHaveBeenCalledWith({
      query: {
        page: "1",
        pageSize: "25",
        sortBy: "createdAt",
        sortOrder: "desc",
        type: "board",
        status: "ready",
      },
    });
    expect(result).toEqual([]);
  });

  it("loads report artifacts without optional filters", async () => {
    resetMocks();
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);

    useReportArtifacts({ page: 2, pageSize: 10, sortBy: "title", sortOrder: "asc" });
    const result = await captureQueryFn()();

    expect(hoisted.mockReportsGet).toHaveBeenCalledWith({
      query: {
        page: "2",
        pageSize: "10",
        sortBy: "title",
        sortOrder: "asc",
      },
    });
    expect(result).toEqual([]);
  });

  it("loads the SEFA tripwire preview for the selected fiscal year", async () => {
    useSefaTripwire("FY2026", true);
    await captureQueryFn()();

    expect(hoisted.mockSefaPreviewGet).toHaveBeenCalledWith({
      query: { fiscalYear: "FY2026" },
    });
  });

  it("loads every paginated grant option needed by the reports selector", async () => {
    hoisted.mockGrantsGet
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: Array.from({ length: 100 }, (_, index) => ({
            id: `grant-${index + 1}`,
            name: `Grant ${index + 1}`,
          })),
          total: 205,
          page: 1,
          pageSize: 100,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: Array.from({ length: 100 }, (_, index) => ({
            id: `grant-${index + 101}`,
            name: `Grant ${index + 101}`,
          })),
          total: 205,
          page: 2,
          pageSize: 100,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: Array.from({ length: 5 }, (_, index) => ({
            id: `grant-${index + 201}`,
            name: `Grant ${index + 201}`,
          })),
          total: 205,
          page: 3,
          pageSize: 100,
        }),
      });

    useReportGrantOptions();
    const result = (await captureQueryFn()()) as Array<{ id: string; name: string }>;

    expect(hoisted.mockGrantsGet).toHaveBeenNthCalledWith(1, {
      query: {
        page: "1",
        pageSize: "100",
        sortBy: "updatedAt",
        sortOrder: "desc",
      },
    });
    expect(hoisted.mockGrantsGet).toHaveBeenNthCalledWith(2, {
      query: {
        page: "2",
        pageSize: "100",
        sortBy: "updatedAt",
        sortOrder: "desc",
      },
    });
    expect(hoisted.mockGrantsGet).toHaveBeenNthCalledWith(3, {
      query: {
        page: "3",
        pageSize: "100",
        sortBy: "updatedAt",
        sortOrder: "desc",
      },
    });
    expect(result).toHaveLength(205);
    expect(result.at(-1)).toEqual({ id: "grant-205", name: "Grant 205" });
  });

  it("treats missing grant option data and total as an empty selector result", async () => {
    hoisted.mockGrantsGet.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({}),
    });

    useReportGrantOptions();
    const result = await captureQueryFn()();

    expect(result).toEqual([]);
    expect(hoisted.mockGrantsGet).toHaveBeenCalledOnce();
  });

  it("loads report artifact detail and preview", async () => {
    useReportArtifact("report-1");
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    let result = await captureQueryFn()();
    expect(result).toEqual({});

    resetMocks();
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
    useReportPreview("report-1");
    result = await captureQueryFn()();
    expect(result).toEqual({});
  });

  it("polls a pending report artifact every 3s and stops once it resolves", () => {
    useReportArtifact("report-1");
    const refetchInterval = captureRefetchInterval();
    expect(refetchInterval({ state: { data: { status: "pending" } } })).toBe(3000);
    expect(refetchInterval({ state: { data: { status: "ready" } } })).toBe(false);
    expect(refetchInterval({ state: { data: { status: "failed" } } })).toBe(false);
    expect(refetchInterval({ state: { data: undefined } })).toBe(false);
  });

  it("disables report detail queries when the report id is empty", () => {
    useReportArtifact("");
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));

    resetMocks();
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
    useReportPreview("");
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it("loads acknowledgment template", async () => {
    useAcknowledgmentTemplate();
    const result = await captureQueryFn()();
    expect(result).toEqual({});
  });

  it("throws when the API returns a non-ok response", async () => {
    hoisted.mockReportGet.mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: "Generated report not found" }),
    });

    useReportArtifact("report-1");

    await expect(captureQueryFn()()).rejects.toThrow("Generated report not found");
  });

  it("falls back to the message field when the API omits error", async () => {
    hoisted.mockReportGet.mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ message: "Report generation failed" }),
    });

    useReportArtifact("report-1");

    await expect(captureQueryFn()()).rejects.toThrow("Report generation failed");
  });

  it("falls back to a generic message when the API returns an empty error payload", async () => {
    hoisted.mockReportGet.mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({}),
    });

    useReportArtifact("report-1");

    await expect(captureQueryFn()()).rejects.toThrow("Request failed");
  });
});

describe("report mutations", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(useMutation).mockImplementation((options) => options as never);
  });

  it("generates each report type and invalidates report queries", async () => {
    useGenerateGrantComplianceReport("grant-1");
    expect(await captureMutationFn()({ title: "Grant report" })).toEqual({});
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("report_generated", {
      report_type: "grant_compliance",
    });
    captureOnSuccess()();
    expect(hoisted.mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["reports"] });

    resetMocks();
    vi.mocked(useMutation).mockImplementation((options) => options as never);
    useGenerateAuditReport("FY2026");
    expect(await captureMutationFn()({ title: "Audit export" })).toEqual({});
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("report_generated", {
      report_type: "audit_export",
    });
    captureOnSuccess()();
    expect(hoisted.mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["reports"] });

    resetMocks();
    vi.mocked(useMutation).mockImplementation((options) => options as never);
    useGenerateIrs990Report();
    expect(await captureMutationFn()({ fiscalYear: "FY2026", title: "IRS 990" })).toEqual({});
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("report_generated", {
      report_type: "irs_990",
    });
    captureOnSuccess()();
    expect(hoisted.mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["reports"] });

    resetMocks();
    vi.mocked(useMutation).mockImplementation((options) => options as never);
    useGenerateBoardReport();
    expect(await captureMutationFn()({ fiscalYear: "FY2026", title: "Board" })).toEqual({});
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("report_generated", {
      report_type: "board_report",
    });
    captureOnSuccess()();
    expect(hoisted.mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["reports"] });
    expect(hoisted.mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["dashboard-overview"],
    });

    resetMocks();
    vi.mocked(useMutation).mockImplementation((options) => options as never);
    useGenerateSefaReport();
    expect(await captureMutationFn()({ fiscalYear: "FY2026", title: "FY2026 SEFA Draft" })).toEqual(
      {},
    );
    expect(hoisted.mockSefaPost).toHaveBeenCalledWith({
      json: { fiscalYear: "FY2026", title: "FY2026 SEFA Draft" },
    });
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("report_generated", {
      report_type: "sefa",
    });
    captureOnSuccess()();
    expect(hoisted.mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["reports"] });

    resetMocks();
    vi.mocked(useMutation).mockImplementation((options) => options as never);
    useGenerateDonorYearEndStatementRun();
    expect(
      await captureMutationFn()({
        year: 2026,
        deliveryMode: "download",
        minimumAmountCents: 0,
      }),
    ).toEqual({});
    expect(hoisted.mockYearEndStatementPost).toHaveBeenCalledWith({
      json: {
        year: 2026,
        deliveryMode: "download",
        minimumAmountCents: 0,
      },
    });
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("report_generated", {
      report_type: "donor_year_end_statement",
    });
    captureOnSuccess()();
    expect(hoisted.mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["reports"] });

    resetMocks();
    vi.mocked(useMutation).mockImplementation((options) => options as never);
    useGenerateAcknowledgmentLetter("donation-1");
    expect(await captureMutationFn()({ title: "Receipt" })).toEqual({});
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("report_generated", {
      report_type: "acknowledgment_letter",
    });
    captureOnSuccess()();
    expect(hoisted.mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["reports"] });
  });

  it("captures report generation failures before rethrowing", async () => {
    hoisted.mockBoardPost.mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: "Board report failed" }),
    });

    useGenerateBoardReport();

    await expect(captureMutationFn()({ fiscalYear: "FY2026" })).rejects.toThrow(
      "Board report failed",
    );
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("report_generation_failed", {
      report_type: "board_report",
      failure_type: "api_error",
    });

    resetMocks();
    vi.mocked(useMutation).mockImplementation((options) => options as never);
    hoisted.mockSefaPost.mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: "SEFA generation failed" }),
    });

    useGenerateSefaReport();

    await expect(captureMutationFn()({ fiscalYear: "FY2026" })).rejects.toThrow(
      "SEFA generation failed",
    );
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("report_generation_failed", {
      report_type: "sefa",
      failure_type: "api_error",
    });
  });

  it("updates the acknowledgment template and invalidates template queries", async () => {
    useUpdateAcknowledgmentTemplate();
    expect(
      await captureMutationFn()({
        intro: "Intro",
        body: "Body",
        closing: "Closing",
      }),
    ).toEqual({});
    captureOnSuccess()();
    expect(hoisted.mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["acknowledgment-template"],
    });
    expect(hoisted.mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["reports"] });
  });
});
