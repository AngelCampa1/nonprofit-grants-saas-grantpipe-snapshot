import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import { useGenerateDraft } from "./use-drafting-assistant";
import { captureEvent } from "../lib/analytics";
import { captureAppException } from "../lib/sentry";

const mocks = vi.hoisted(() => ({
  generatePost: vi.fn(),
}));

vi.mock("../lib/api-client", () => ({
  api: {
    api: {
      "drafting-assistant": {
        generate: { $post: mocks.generatePost },
      },
    },
  },
}));

vi.mock("../lib/http-response", () => ({
  readResponseOrThrow: vi.fn(async (response: { json: () => Promise<unknown> }) => response.json()),
}));

vi.mock("../lib/analytics", () => ({
  captureEvent: vi.fn(),
}));

vi.mock("../lib/sentry", () => ({
  captureAppException: vi.fn(),
}));

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe("useGenerateDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts draft requests and captures safe success telemetry", async () => {
    mocks.generatePost.mockResolvedValueOnce({
      json: async () => ({
        draftTitle: "Draft Youth Services report",
        draftType: "interim_report",
        draftBody: "Draft body.",
        sections: [{ heading: "Progress", body: "Draft body." }],
        citations: [{ type: "grant", label: "Youth Services", href: "/grants/grant-1" }],
        safeguards: [
          "Editable draft only. A human must review, edit, and submit outside GrantPipe.",
        ],
        modelId: "minimax/minimax-m2.7",
        promptVersion: "proposal-report-drafting-v1",
        generatedAt: "2026-06-18T12:00:00.000Z",
      }),
    });

    const { result } = renderHook(() => useGenerateDraft(), { wrapper });
    await result.current.mutateAsync({
      grantId: "123e4567-e89b-12d3-a456-426614174000",
      draftType: "interim_report",
      userPrompt: "Draft the interim report for Jane Smith's program.",
    });

    expect(mocks.generatePost).toHaveBeenCalledWith({
      json: {
        grantId: "123e4567-e89b-12d3-a456-426614174000",
        draftType: "interim_report",
        userPrompt: "Draft the interim report for Jane Smith's program.",
      },
    });
    expect(captureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.draftingAssistantStarted, {
      surface: "reports_drafts",
      operation: "generate",
      draft_type: "interim_report",
      prompt_length_bucket: "25_100",
      period_present: false,
    });
    expect(captureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.draftingAssistantGenerated, {
      surface: "reports_drafts",
      operation: "generate",
      draft_type: "interim_report",
      citation_count_bucket: "1_10",
      section_count_bucket: "1_10",
      model_id: "minimax/minimax-m2.7",
    });
    expect(JSON.stringify(vi.mocked(captureEvent).mock.calls)).not.toContain("Jane Smith");
  });

  it("captures failures without raw prompt text", async () => {
    const error = new Error("Request failed");
    mocks.generatePost.mockRejectedValueOnce(error);

    const { result } = renderHook(() => useGenerateDraft(), { wrapper });
    await expect(
      result.current.mutateAsync({
        grantId: "123e4567-e89b-12d3-a456-426614174000",
        draftType: "final_report",
        userPrompt: "Write about Jane Smith and her family.",
      }),
    ).rejects.toThrow("Request failed");

    expect(captureEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.draftingAssistantFailed,
      expect.objectContaining({
        surface: "reports_drafts",
        operation: "generate",
        draft_type: "final_report",
        failure_type: "api_error",
      }),
    );
    expect(captureAppException).toHaveBeenCalledWith(error, {
      tags: { feature: "drafting_assistant", operation: "generate" },
      extra: expect.objectContaining({
        draft_type: "final_report",
        prompt_length_bucket: "25_100",
      }),
    });
    expect(JSON.stringify(vi.mocked(captureEvent).mock.calls)).not.toContain("Jane Smith");
  });

  it("buckets prompt, citation, and section counts without raw text", async () => {
    mocks.generatePost.mockResolvedValue({
      json: async () => ({
        draftTitle: "Draft Youth Services report",
        draftType: "proposal_narrative",
        draftBody: "Draft body.",
        sections: Array.from({ length: 101 }, (_, index) => ({
          heading: `Section ${index + 1}`,
          body: "Draft body.",
        })),
        citations: Array.from({ length: 12 }, (_, index) => ({
          type: "grant",
          label: `Source ${index + 1}`,
          href: `/grants/${index + 1}`,
        })),
        safeguards: [
          "Editable draft only. A human must review, edit, and submit outside GrantPipe.",
        ],
        modelId: "minimax/minimax-m2.7",
        promptVersion: "proposal-report-drafting-v1",
        generatedAt: "2026-06-18T12:00:00.000Z",
      }),
    });

    const { result } = renderHook(() => useGenerateDraft(), { wrapper });
    await result.current.mutateAsync({
      grantId: "123e4567-e89b-12d3-a456-426614174000",
      draftType: "proposal_narrative",
      userPrompt: "x".repeat(101),
      reportPeriodStart: "2026-01-01",
    });
    await result.current.mutateAsync({
      grantId: "123e4567-e89b-12d3-a456-426614174000",
      draftType: "proposal_narrative",
      userPrompt: "short",
    });
    await result.current.mutateAsync({
      grantId: "123e4567-e89b-12d3-a456-426614174000",
      draftType: "proposal_narrative",
      userPrompt: "",
    });
    await result.current.mutateAsync({
      grantId: "123e4567-e89b-12d3-a456-426614174000",
      draftType: "proposal_narrative",
    } as never);

    expect(captureEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.draftingAssistantStarted,
      expect.objectContaining({
        prompt_length_bucket: "100_plus",
        period_present: true,
      }),
    );
    expect(captureEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.draftingAssistantStarted,
      expect.objectContaining({ prompt_length_bucket: "1_10" }),
    );
    expect(captureEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.draftingAssistantStarted,
      expect.objectContaining({ prompt_length_bucket: "0" }),
    );
    expect(captureEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.draftingAssistantStarted,
      expect.objectContaining({ prompt_length_bucket: "unknown" }),
    );
    expect(captureEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.draftingAssistantGenerated,
      expect.objectContaining({
        citation_count_bucket: "10_25",
        section_count_bucket: "100_plus",
      }),
    );
  });
});
