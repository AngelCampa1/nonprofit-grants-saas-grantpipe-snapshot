import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  mockInvalidateQueries: vi.fn(),
  mockOutcomesGet: vi.fn(),
  mockOutcomesPost: vi.fn(),
  mockIndicatorsPost: vi.fn(),
  mockCaptureEvent: vi.fn(),
  mockCaptureAppException: vi.fn(),
}));

vi.mock("../lib/api-client", () => ({
  api: {
    api: {
      outcomes: {
        $get: hoisted.mockOutcomesGet,
        $post: hoisted.mockOutcomesPost,
        ":outcomeId": {
          indicators: {
            $post: hoisted.mockIndicatorsPost,
          },
        },
      },
    },
  },
}));

vi.mock("../lib/analytics", () => ({
  captureEvent: (...args: unknown[]) => hoisted.mockCaptureEvent(...args),
}));

vi.mock("../lib/sentry", () => ({
  captureAppException: (...args: unknown[]) => hoisted.mockCaptureAppException(...args),
}));

vi.mock("@tanstack/react-query", () => ({
  keepPreviousData: Symbol("keepPreviousData"),
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(() => ({
    invalidateQueries: hoisted.mockInvalidateQueries,
  })),
}));

import { useMutation, useQuery } from "@tanstack/react-query";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import { useCreateOutcome, useCreateOutcomeIndicator, useOutcomes } from "./use-outcomes";

function captureQueryFn() {
  const call = vi.mocked(useQuery).mock.calls.at(-1)?.[0];
  return (call as unknown as { queryFn: () => Promise<unknown> }).queryFn;
}

function captureMutationFn<TInput>() {
  const call = vi.mocked(useMutation).mock.calls.at(-1)?.[0];
  return (call as { mutationFn: (input: TInput) => Promise<unknown> }).mutationFn;
}

function captureOnSuccess<TVariables>() {
  const call = vi.mocked(useMutation).mock.calls.at(-1)?.[0];
  return (call as { onSuccess: (data: unknown, variables: TVariables) => void }).onSuccess;
}

function captureOnError<TVariables>() {
  const call = vi.mocked(useMutation).mock.calls.at(-1)?.[0];
  return (call as { onError: (error: unknown, variables: TVariables) => void }).onError;
}

describe("use-outcomes hooks", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockClear();
    vi.mocked(useMutation).mockClear();
    hoisted.mockInvalidateQueries.mockClear();
    hoisted.mockCaptureEvent.mockClear();
    hoisted.mockCaptureAppException.mockClear();
    hoisted.mockOutcomesGet.mockReset();
    hoisted.mockOutcomesPost.mockReset();
    hoisted.mockIndicatorsPost.mockReset();
    hoisted.mockOutcomesGet.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: [] }),
    });
    hoisted.mockOutcomesPost.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: "outcome-1" }),
    });
    hoisted.mockIndicatorsPost.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: "indicator-1" }),
    });
  });

  it("loads outcomes with safe filters", async () => {
    useOutcomes({ programId: "program-1", status: "active" });

    await captureQueryFn()();

    expect(hoisted.mockOutcomesGet).toHaveBeenCalledWith({
      query: { programId: "program-1", status: "active" },
    });
  });

  it("loads outcomes with optional grant filters, pagination, and default enabled state", async () => {
    useOutcomes({ grantId: "grant-1", page: 2, pageSize: 10 });

    await captureQueryFn()();

    expect(vi.mocked(useQuery).mock.calls.at(-1)?.[0]).toMatchObject({
      enabled: true,
      queryKey: ["outcomes", "", "grant-1", "", 2, 10],
    });
    expect(hoisted.mockOutcomesGet).toHaveBeenCalledWith({
      query: { grantId: "grant-1", page: "2", pageSize: "10" },
    });
  });

  it("can disable the outcome list query for lower-tier plans", () => {
    useOutcomes({ programId: "program-1", enabled: false });

    expect(vi.mocked(useQuery).mock.calls.at(-1)?.[0]).toMatchObject({
      enabled: false,
    });
  });

  it("creates an outcome and records safe analytics", async () => {
    useCreateOutcome();

    await captureMutationFn<{
      programId: string;
      name: string;
      statement: string;
      status: "active";
    }>()({
      programId: "program-1",
      name: "School readiness",
      statement: "Students can start school ready.",
      status: "active",
    });
    captureOnSuccess<{
      programId?: string;
      grantId?: string;
      status?: string;
    }>()({}, { programId: "program-1", status: "active" });

    expect(hoisted.mockOutcomesPost).toHaveBeenCalledWith({
      json: {
        programId: "program-1",
        name: "School readiness",
        statement: "Students can start school ready.",
        status: "active",
      },
    });
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.outcomeGoalCreated, {
      surface: "program_detail",
      has_program_link: true,
      has_grant_link: false,
      status: "active",
    });
    expect(JSON.stringify(hoisted.mockCaptureEvent.mock.calls)).not.toContain("School readiness");
  });

  it("records default outcome analytics when optional fields are absent", () => {
    useCreateOutcome();

    captureOnSuccess<{
      programId?: string;
      grantId?: string;
      status?: string;
    }>()({}, {});

    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.outcomeGoalCreated, {
      surface: "program_detail",
      has_program_link: false,
      has_grant_link: false,
      status: "draft",
    });
  });

  it("captures outcome creation failures in PostHog and Sentry", () => {
    useCreateOutcome();
    const error = new Error("network down");

    captureOnError<{
      programId?: string;
      grantId?: string;
      status?: string;
    }>()(error, { programId: "program-1", status: "active" });

    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.outcomeOperationFailed, {
      surface: "program_detail",
      operation: "create_outcome",
      failure_type: "api_error",
      has_program_link: true,
      has_grant_link: false,
    });
    expect(hoisted.mockCaptureAppException).toHaveBeenCalledWith(error, {
      tags: { feature: "outcomes", operation: "create_outcome" },
      extra: {
        surface: "program_detail",
        has_program_link: true,
        has_grant_link: false,
      },
    });
  });

  it("creates an indicator and records safe analytics", async () => {
    useCreateOutcomeIndicator("outcome-1");

    await captureMutationFn<{
      name: string;
      indicatorType: "outcome";
      targetValue: number;
      funderDefined: boolean;
    }>()({
      name: "Reading score",
      indicatorType: "outcome",
      targetValue: 80,
      funderDefined: true,
    });
    captureOnSuccess<{
      impactMetricId?: string;
      indicatorType?: string;
      funderDefined?: boolean;
    }>()({}, { indicatorType: "outcome", funderDefined: true });

    expect(hoisted.mockIndicatorsPost).toHaveBeenCalledWith({
      param: { outcomeId: "outcome-1" },
      json: {
        name: "Reading score",
        indicatorType: "outcome",
        targetValue: 80,
        funderDefined: true,
      },
    });
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.outcomeIndicatorCreated,
      {
        surface: "program_detail",
        indicator_type: "outcome",
        has_metric_link: false,
        funder_defined: true,
      },
    );
  });

  it("records default indicator analytics when optional fields are absent", () => {
    useCreateOutcomeIndicator("outcome-1");

    captureOnSuccess<{
      impactMetricId?: string;
      indicatorType?: string;
      funderDefined?: boolean;
    }>()({}, {});

    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.outcomeIndicatorCreated,
      {
        surface: "program_detail",
        indicator_type: "outcome",
        has_metric_link: false,
        funder_defined: false,
      },
    );
  });

  it("captures indicator creation failures in PostHog and Sentry", () => {
    useCreateOutcomeIndicator("outcome-1");
    const error = new Error("network down");

    captureOnError<{
      impactMetricId?: string;
      indicatorType?: string;
      funderDefined?: boolean;
    }>()(error, {
      impactMetricId: "metric-1",
      indicatorType: "quality",
      funderDefined: false,
    });

    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.outcomeOperationFailed, {
      surface: "program_detail",
      operation: "create_indicator",
      failure_type: "api_error",
      indicator_type: "quality",
      has_metric_link: true,
      funder_defined: false,
    });
    expect(hoisted.mockCaptureAppException).toHaveBeenCalledWith(error, {
      tags: { feature: "outcomes", operation: "create_indicator" },
      extra: {
        surface: "program_detail",
        indicator_type: "quality",
        has_metric_link: true,
        funder_defined: false,
      },
    });
  });
});
