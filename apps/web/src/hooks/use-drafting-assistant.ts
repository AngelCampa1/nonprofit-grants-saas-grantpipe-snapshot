import { useMutation } from "@tanstack/react-query";
import type { DraftingAssistantGenerateInput, DraftingAssistantResponse } from "@grantpipe/shared";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import { api } from "../lib/api-client";
import { captureEvent } from "../lib/analytics";
import { readResponseOrThrow } from "../lib/http-response";
import { captureAppException } from "../lib/sentry";

const draftingAssistant = api.api["drafting-assistant"];

function countBucket(value: number | undefined): string {
  if (value === undefined) return "unknown";
  if (value <= 0) return "0";
  if (value <= 10) return "1_10";
  if (value <= 25) return "10_25";
  if (value <= 100) return "25_100";
  return "100_plus";
}

function safeDraftProperties(input: DraftingAssistantGenerateInput) {
  const promptLength =
    typeof input.userPrompt === "string" ? input.userPrompt.trim().length : undefined;
  return {
    surface: "reports_drafts",
    operation: "generate",
    draft_type: input.draftType ?? "unknown",
    prompt_length_bucket: countBucket(promptLength),
    period_present: Boolean(input.reportPeriodStart || input.reportPeriodEnd),
  };
}

export function useGenerateDraft() {
  return useMutation({
    mutationFn: async (input: DraftingAssistantGenerateInput) => {
      const properties = safeDraftProperties(input);
      captureEvent(ANALYTICS_EVENTS.draftingAssistantStarted, properties);
      try {
        const res = await draftingAssistant.generate.$post({ json: input as never });
        const draft = await readResponseOrThrow<DraftingAssistantResponse>(res as never);
        captureEvent(ANALYTICS_EVENTS.draftingAssistantGenerated, {
          surface: "reports_drafts",
          operation: "generate",
          draft_type: draft.draftType,
          citation_count_bucket: countBucket(draft.citations.length),
          section_count_bucket: countBucket(draft.sections.length),
          model_id: draft.modelId,
        });
        return draft;
      } catch (error) {
        captureEvent(ANALYTICS_EVENTS.draftingAssistantFailed, {
          ...properties,
          failure_type: "api_error",
        });
        captureAppException(error, {
          tags: {
            feature: "drafting_assistant",
            operation: "generate",
          },
          extra: properties,
        });
        throw error;
      }
    },
  });
}
