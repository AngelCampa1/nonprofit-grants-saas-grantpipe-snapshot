import { describe, expect, it } from "vitest";

import {
  hasCompleteReply,
  hasNoInternalReasoning,
  isScenarioReplyPass,
  matchedExpectedTerms,
} from "./lib/ai-cs-e2e-scorer.mjs";

describe("AI-CS E2E reply scoring", () => {
  const completeBoardReply =
    "Go to the Reports screen to build a report for your board. The Report Builder lets you pick columns, filters, and saved views.";

  it("matches every expected term case-insensitively", () => {
    expect(matchedExpectedTerms(completeBoardReply, ["reports", "BOARD"])).toEqual([
      "reports",
      "BOARD",
    ]);
  });

  it("matches one term from a synonym group for a required concept", () => {
    const fundReply =
      "Use the Funds screen. A fund is for money that can only be spent on one purpose. Choose Add fund to set it up.";

    expect(matchedExpectedTerms(fundReply, ["fund", "spent", ["program", "purpose"]])).toEqual([
      "fund",
      "spent",
      "purpose",
    ]);
    expect(
      isScenarioReplyPass({
        reply: fundReply,
        expectedTerms: ["fund", "spent", ["program", "purpose"]],
        hasFreshChatResponse: true,
      }),
    ).toMatchObject({
      passed: true,
      hasAllExpectedTerms: true,
    });
  });

  it("matches fund answers that use spending or used language", () => {
    const fundReply =
      "Use the Funds screen. A Fund tracks money that has spending rules, so it can only be used for one purpose or program.";

    expect(
      isScenarioReplyPass({
        reply: fundReply,
        expectedTerms: ["fund", ["spent", "used", "spending"], ["program", "purpose"]],
        hasFreshChatResponse: true,
      }),
    ).toMatchObject({
      passed: true,
      matchedTerms: ["fund", "used", "program"],
      hasAllExpectedTerms: true,
    });
  });

  it("matches restricted fund answers that say one way", () => {
    const fundReply =
      "Use the Funds screen. Funds is for money that can only be spent one way. This keeps the money separate and shows what is left to spend.";

    expect(
      isScenarioReplyPass({
        reply: fundReply,
        expectedTerms: ["fund", ["spent", "used", "spending"], ["program", "purpose", "one way"]],
        hasFreshChatResponse: true,
      }),
    ).toMatchObject({
      passed: true,
      matchedTerms: ["fund", "spent", "one way"],
      hasAllExpectedTerms: true,
    });
  });

  it("matches restricted fund answers that describe spending rules and a separate bucket", () => {
    const fundReply =
      "Use the Funds screen for that. A fund keeps money with spending rules in its own bucket, so you always know what is left and that you followed the rules.";

    expect(
      isScenarioReplyPass({
        reply: fundReply,
        expectedTerms: [
          "fund",
          ["spent", "used", "spending"],
          ["program", "purpose", "one way", "spending rules", "own bucket"],
        ],
        hasFreshChatResponse: true,
      }),
    ).toMatchObject({
      passed: true,
      matchedTerms: ["fund", "spending", "spending rules"],
      hasAllExpectedTerms: true,
    });
  });

  it("matches auditor permission answers that use look or see language", () => {
    const auditorReply =
      "An Auditor can look at the books, but cannot change anything. An Auditor can see grants, funds, documents, compliance, accounting, and reports.";

    expect(
      isScenarioReplyPass({
        reply: auditorReply,
        expectedTerms: ["auditor", ["view", "look", "see"], "cannot"],
        hasFreshChatResponse: true,
      }),
    ).toMatchObject({
      passed: true,
      matchedTerms: ["auditor", "look", "cannot"],
      hasAllExpectedTerms: true,
    });
  });

  it("rejects internal reasoning leakage", () => {
    expect(
      hasNoInternalReasoning(
        "The user is asking where to build a report. Let me find the matching howto.",
      ),
    ).toBe(false);
    expect(hasNoInternalReasoning(completeBoardReply)).toBe(true);
  });

  it("rejects short or unfinished streamed replies", () => {
    expect(hasCompleteReply("An auditor can read your data")).toBe(false);
    expect(hasCompleteReply("Use the Reports screen. Choose Create your")).toBe(false);
    expect(hasCompleteReply(completeBoardReply)).toBe(true);
  });

  it("requires a fresh chat response and a complete matching reply", () => {
    expect(
      isScenarioReplyPass({
        reply: completeBoardReply,
        expectedTerms: ["reports", "board", "report builder"],
        hasFreshChatResponse: true,
      }),
    ).toMatchObject({
      passed: true,
      hasAllExpectedTerms: true,
      hasNoInternalReasoning: true,
      hasCompleteReply: true,
    });

    expect(
      isScenarioReplyPass({
        reply: completeBoardReply,
        expectedTerms: ["csv"],
        hasFreshChatResponse: true,
      }).passed,
    ).toBe(false);

    expect(
      isScenarioReplyPass({
        reply: completeBoardReply,
        expectedTerms: ["reports"],
        hasFreshChatResponse: false,
      }).passed,
    ).toBe(false);
  });
});
