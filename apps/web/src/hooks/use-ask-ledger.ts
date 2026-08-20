import { useMutation } from "@tanstack/react-query";
import type { LedgerAssistantAnswer, LedgerAssistantAskInput } from "@grantpipe/shared";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import { api } from "../lib/api-client";
import { captureEvent } from "../lib/analytics";
import { readResponseOrThrow } from "../lib/http-response";
import { captureAppException } from "../lib/sentry";
import { useReportAiUsageCap } from "../components/dialogs/ai-usage-cap-provider";

const askLedger = api.api["ask-ledger"];

function countBucket(value: number | undefined): string {
  if (value === undefined) return "unknown";
  if (value <= 0) return "0";
  if (value <= 10) return "1_10";
  if (value <= 25) return "10_25";
  if (value <= 100) return "25_100";
  return "100_plus";
}

function inferIntentType(question: string): string {
  const normalized = question.toLowerCase();
  if (
    ["over budget", "overspend", "over spend", "budget risk"].some((term) =>
      normalized.includes(term),
    )
  ) {
    return "grant_budget_risk";
  }
  if (
    [
      "restricted fund",
      "fund balance",
      "restricted balance",
      "funds with balances",
      "money left",
      "funds still have money left",
    ].some((term) => normalized.includes(term))
  ) {
    return "restricted_fund_balance";
  }
  return "unsupported";
}

function safeAskLedgerProperties(input: LedgerAssistantAskInput) {
  const questionLength =
    typeof input.question === "string" ? input.question.trim().length : undefined;
  const question = typeof input.question === "string" ? input.question : "";
  return {
    surface: "ask_ledger",
    operation: "ask",
    mode: input.mode ?? "deterministic",
    intent_type: inferIntentType(question),
    date_range_present: /\b(?:today|yesterday|month|quarter|year|fy|fiscal|20\d{2})\b/i.test(
      question,
    ),
    query_length_bucket: countBucket(questionLength),
  };
}

export function useAskLedger() {
  const reportAiUsageCap = useReportAiUsageCap();

  return useMutation({
    mutationFn: async (input: LedgerAssistantAskInput) => {
      const properties = safeAskLedgerProperties(input);
      captureEvent(ANALYTICS_EVENTS.ledgerAssistantAsked, properties);
      try {
        const res = await askLedger.ask.$post({ json: input as never });
        const answer = await readResponseOrThrow<LedgerAssistantAnswer>(res as never);
        captureEvent(ANALYTICS_EVENTS.ledgerAssistantAnswered, {
          surface: "ask_ledger",
          operation: "answer",
          mode: answer.mode,
          confidence: answer.confidence,
          intent_type: properties.intent_type,
          result_count_bucket: countBucket(answer.citations.length),
          citation_count_bucket: countBucket(answer.citations.length),
        });
        return answer;
      } catch (error) {
        captureEvent(ANALYTICS_EVENTS.ledgerAssistantFailed, {
          ...properties,
          operation: "answer",
          failure_type: "api_error",
        });
        if (!reportAiUsageCap(error)) {
          captureAppException(error, {
            tags: {
              feature: "ask_ledger",
              operation: "answer",
            },
            extra: properties,
          });
        }
        throw error;
      }
    },
  });
}
