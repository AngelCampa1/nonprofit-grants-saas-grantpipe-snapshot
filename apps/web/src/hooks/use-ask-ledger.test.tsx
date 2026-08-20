import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import { useAskLedger } from "./use-ask-ledger";
import { captureEvent } from "../lib/analytics";
import { captureAppException } from "../lib/sentry";
import { ApiError } from "../lib/http-response";
import { getAiUsageCapPayload } from "../lib/api-errors";

const mocks = vi.hoisted(() => ({
  askPost: vi.fn(),
}));

vi.mock("../lib/api-client", () => ({
  api: {
    api: {
      "ask-ledger": {
        ask: { $post: mocks.askPost },
      },
    },
  },
}));

vi.mock("../lib/http-response", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/http-response")>();
  return {
    ...actual,
    readResponseOrThrow: vi.fn(async (response: { json: () => Promise<unknown> }) =>
      response.json(),
    ),
  };
});

vi.mock("../lib/analytics", () => ({
  captureEvent: vi.fn(),
}));

vi.mock("../lib/sentry", () => ({
  captureAppException: vi.fn(),
}));

const { mockReportAiUsageCap } = vi.hoisted(() => ({
  mockReportAiUsageCap: vi.fn(() => false),
}));

vi.mock("../components/dialogs/ai-usage-cap-provider", () => ({
  useReportAiUsageCap: () => mockReportAiUsageCap,
}));

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe("useAskLedger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReportAiUsageCap.mockReturnValue(false);
  });

  it("posts questions and captures safe success telemetry", async () => {
    mocks.askPost.mockResolvedValueOnce({
      json: async () => ({
        answer: "No grants are over budget.",
        mode: "deterministic",
        confidence: "high",
        safeguards: ["Numbers are calculated from posted GrantPipe records only."],
        citations: [{ type: "report_row", label: "Budget sentinel", href: "/grants/sentinel" }],
        suggestedFollowUps: [],
      }),
    });

    const { result } = renderHook(() => useAskLedger(), { wrapper });
    await result.current.mutateAsync({ question: "Which grants are over budget?" });

    expect(mocks.askPost).toHaveBeenCalledWith({
      json: { question: "Which grants are over budget?" },
    });
    expect(captureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.ledgerAssistantAsked, {
      surface: "ask_ledger",
      operation: "ask",
      mode: "deterministic",
      intent_type: "grant_budget_risk",
      date_range_present: false,
      query_length_bucket: "25_100",
    });
    expect(captureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.ledgerAssistantAnswered, {
      surface: "ask_ledger",
      operation: "answer",
      mode: "deterministic",
      confidence: "high",
      intent_type: "grant_budget_risk",
      result_count_bucket: "1_10",
      citation_count_bucket: "1_10",
    });
    expect(JSON.stringify(vi.mocked(captureEvent).mock.calls)).not.toContain(
      "Which grants are over budget",
    );
  });

  it("captures failures without raw question text", async () => {
    const error = new Error("Request failed");
    mocks.askPost.mockRejectedValueOnce(error);

    const { result } = renderHook(() => useAskLedger(), { wrapper });

    await expect(
      result.current.mutateAsync({ question: "Show Jane Smith donor giving history" }),
    ).rejects.toThrow("Request failed");
    expect(captureEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.ledgerAssistantFailed,
      expect.objectContaining({
        surface: "ask_ledger",
        operation: "answer",
        failure_type: "api_error",
      }),
    );
    expect(captureAppException).toHaveBeenCalledWith(error, {
      tags: {
        feature: "ask_ledger",
        operation: "answer",
      },
      extra: expect.objectContaining({
        surface: "ask_ledger",
        query_length_bucket: "25_100",
        intent_type: "unsupported",
      }),
    });
    expect(JSON.stringify(vi.mocked(captureEvent).mock.calls)).not.toContain("Jane Smith");
  });

  it("captures restricted-fund intent, fiscal dates, AI mode, and source buckets", async () => {
    mocks.askPost.mockResolvedValueOnce({
      json: async () => ({
        answer: "No restricted fund balances matched.",
        mode: "ai_assisted",
        confidence: "low",
        safeguards: ["No answer is shown without GrantPipe records behind it."],
        citations: [
          {
            type: "report_row",
            label: "Fund balance snapshot",
            href: "/reports/builder",
            value: "0 fund rows",
          },
        ],
        suggestedFollowUps: [],
      }),
    });

    const { result } = renderHook(() => useAskLedger(), { wrapper });
    await result.current.mutateAsync({
      question: "fund balance this FY",
      mode: "ai_assisted",
    });

    expect(captureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.ledgerAssistantAsked, {
      surface: "ask_ledger",
      operation: "ask",
      mode: "ai_assisted",
      intent_type: "restricted_fund_balance",
      date_range_present: true,
      query_length_bucket: "10_25",
    });
    expect(captureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.ledgerAssistantAnswered, {
      surface: "ask_ledger",
      operation: "answer",
      mode: "ai_assisted",
      confidence: "low",
      intent_type: "restricted_fund_balance",
      result_count_bucket: "1_10",
      citation_count_bucket: "1_10",
    });
  });

  it("buckets very large answers without sending row labels", async () => {
    mocks.askPost.mockResolvedValueOnce({
      json: async () => ({
        answer: "Many rows matched.",
        mode: "deterministic",
        confidence: "medium",
        safeguards: ["Numbers are calculated from posted GrantPipe records only."],
        citations: Array.from({ length: 101 }, (_, index) => ({
          type: "fund",
          label: `Private fund ${index}`,
          href: "/reports/builder",
          value: "$1",
        })),
        suggestedFollowUps: [],
      }),
    });

    const { result } = renderHook(() => useAskLedger(), { wrapper });
    await result.current.mutateAsync({ question: "Which funds still have money left?" });

    expect(captureEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.ledgerAssistantAsked,
      expect.objectContaining({
        intent_type: "restricted_fund_balance",
        query_length_bucket: "25_100",
      }),
    );
    expect(captureEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.ledgerAssistantAnswered,
      expect.objectContaining({
        result_count_bucket: "100_plus",
        citation_count_bucket: "100_plus",
      }),
    );
    expect(JSON.stringify(vi.mocked(captureEvent).mock.calls)).not.toContain("Private fund");
  });

  it("falls back to unknown telemetry for malformed local input", async () => {
    mocks.askPost.mockResolvedValueOnce({
      json: async () => ({
        answer: "A guarded fallback was returned.",
        mode: "deterministic",
        confidence: "low",
        safeguards: ["No answer is shown without GrantPipe records behind it."],
        citations: Array.from({ length: 11 }, (_, index) => ({
          type: "report_row",
          label: `Row ${index}`,
          href: "/reports/builder",
        })),
        suggestedFollowUps: [],
      }),
    });

    const { result } = renderHook(() => useAskLedger(), { wrapper });
    await result.current.mutateAsync({} as never);

    expect(captureEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.ledgerAssistantAsked,
      expect.objectContaining({
        mode: "deterministic",
        intent_type: "unsupported",
        date_range_present: false,
        query_length_bucket: "unknown",
      }),
    );
    expect(captureEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.ledgerAssistantAnswered,
      expect.objectContaining({
        result_count_bucket: "10_25",
        citation_count_bucket: "10_25",
      }),
    );
  });

  it("suppresses captureAppException when reportAiUsageCap returns true for a cap error", async () => {
    const capBody = {
      error: "ai_usage_cap_reached",
      errorCode: "ai_usage_cap_reached",
      feature: "ask_your_ledger",
      cap: 20,
      used: 20,
      currentPlan: "starter",
      upgradeToPlan: "growth",
    };
    const capError = new ApiError("ai_usage_cap_reached", 402, "ai_usage_cap_reached", capBody);
    mocks.askPost.mockRejectedValueOnce(capError);
    mockReportAiUsageCap.mockReturnValue(true);

    const { result } = renderHook(() => useAskLedger(), { wrapper });

    await expect(
      result.current.mutateAsync({ question: "Which grants are over budget?" }),
    ).rejects.toThrow("ai_usage_cap_reached");

    expect(getAiUsageCapPayload(capError)).not.toBeNull();
    expect(mockReportAiUsageCap).toHaveBeenCalledWith(capError);
    expect(captureAppException).not.toHaveBeenCalled();
  });
});
