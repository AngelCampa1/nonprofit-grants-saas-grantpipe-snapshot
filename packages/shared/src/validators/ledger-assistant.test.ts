import { describe, expect, it } from "vitest";
import { ledgerAssistantAnswerSchema, ledgerAssistantAskSchema } from "./ledger-assistant";

describe("ledger-assistant validators", () => {
  it("trims questions and defaults to deterministic answers", () => {
    const parsed = ledgerAssistantAskSchema.parse({
      question: "  Which grants are over budget?  ",
    });

    expect(parsed).toEqual({
      question: "Which grants are over budget?",
      mode: "deterministic",
    });
  });

  it("rejects vague or oversized questions before they reach AI", () => {
    expect(() => ledgerAssistantAskSchema.parse({ question: "why?" })).toThrow(
      "at least 8 characters",
    );
    expect(() => ledgerAssistantAskSchema.parse({ question: "x".repeat(501) })).toThrow(
      "Ask a shorter question",
    );
  });

  it("requires grounded citations and safeguards on every answer", () => {
    const answer = ledgerAssistantAnswerSchema.parse({
      answer: "Two active grants have spent more than 90% of their approved budget.",
      mode: "deterministic",
      confidence: "high",
      safeguards: ["Numbers are calculated from posted GrantPipe records only."],
      citations: [
        {
          type: "grant",
          label: "Youth Services Grant",
          href: "/grants/grant-1",
          value: "$9,100 of $10,000 spent",
        },
      ],
      suggestedFollowUps: ["Show the top restricted fund balances."],
    });

    expect(answer.citations[0]?.href).toBe("/grants/grant-1");
    expect(() =>
      ledgerAssistantAnswerSchema.parse({
        ...answer,
        citations: [],
      }),
    ).toThrow();
  });
});
