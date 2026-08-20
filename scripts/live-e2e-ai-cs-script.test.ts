import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = () => readFileSync(join(process.cwd(), "e2e-adhoc/ai-cs-prod-e2e.mjs"), "utf8");
const scorerSource = () =>
  readFileSync(join(process.cwd(), "scripts/lib/ai-cs-e2e-scorer.mjs"), "utf8");

describe("AI-CS production E2E script", () => {
  it("exits non-zero when the widget check fails", () => {
    expect(source()).toContain("process.exit(results.pass ? 0 : 1)");
  });

  it("uses the password input name for password entry so the show-password button is not matched", () => {
    expect(source()).toContain("locator('input[name=\"password\"]')");
    expect(source()).not.toContain('getByLabel("Password").fill');
    expect(source()).not.toContain('getByRole("textbox", { name: "Password" })');
  });

  it("sends an Origin header for production better-auth API sign-in attempts", () => {
    expect(source()).toContain("Origin: baseUrl");
  });

  it("does not print the Better Auth sign-in response body or token", () => {
    expect(source()).not.toContain("Login body");
    expect(source()).not.toContain("body.slice");
    expect(source()).not.toContain("responseText.slice");
  });

  it("stops after production auth rate limiting instead of making a second sign-in attempt", () => {
    expect(source()).toContain("isAuthRateLimitError");
    expect(source()).toContain("Auth rate limited");
    expect(source()).toContain("throw err;");
  });

  it("does not depend on a form-login navigation event that may never fire after auth failures", () => {
    expect(source()).toContain("loginViaForm");
    expect(source()).toContain("waitForURL");
    expect(source()).not.toContain("waitForNavigation");
  });

  it("runs a generated scenario set instead of one hard-coded support prompt", () => {
    const scenarioKeys = [...source().matchAll(/key: "[^"]+"/g)];

    expect(source()).toContain("AI_CS_SCENARIOS");
    expect(scenarioKeys.length).toBeGreaterThanOrEqual(5);
    expect(source()).not.toContain('const question = "How do I start a new grant application?"');
  });

  it("waits for a fresh assistant reply before scoring each scenario", () => {
    expect(source()).toContain("previousReply");
    expect(source()).toContain("latest !== previousReply");
  });

  it("waits for a new chat response for each scenario before reading the answer", () => {
    expect(source()).toContain("beforeChatCount");
    expect(source()).toContain("chatResponsesAfterSend");
    expect(source()).toContain("chatResponsesAfterSend > 0");
  });

  it("scopes the send button lookup to the AI-CS panel", () => {
    expect(source()).toContain("const sendButton = panelRoot");
    expect(source()).not.toContain("const sendButton = page");
  });

  it("keeps polling until the fresh reply matches the scenario topic or times out", () => {
    expect(source()).toContain("matchedLatest");
    expect(source()).toContain("matchedExpectedTerms(latest, expectedTerms).length");
  });

  it("waits for the assistant reply to settle before scoring streamed text", () => {
    expect(source()).toContain("replySettledAt");
    expect(source()).toContain("REPLY_SETTLE_MS");
    expect(source()).toContain("Date.now() - replySettledAt >= REPLY_SETTLE_MS");
  });

  it("captures replies from stable AI-CS widget attributes instead of broad page text", () => {
    expect(source()).toContain("panelRoot");
    expect(source()).toContain("[data-aics-panel]");
    expect(source()).toContain('[data-aics-bubble][data-aics-role="assistant"]');
    expect(source()).not.toContain('p, [class*="message"], [class*="bubble"]');
    expect(source()).not.toContain("page.locator(sel).allTextContents()");
  });

  it("requires every scenario term and a clean error list before passing", () => {
    expect(scorerSource()).toContain("matchedTerms.length === expectedTerms.length");
    expect(source()).toContain('"spending rules"');
    expect(source()).toContain('"own bucket"');
    expect(source()).toContain('expectedTerms: ["auditor", ["view", "look", "see"], "cannot"]');
    expect(source()).toContain('expectedTerms: ["reports", "board"]');
    expect(source()).toContain("results.errors.length === 0");
  });

  it("rejects internal reasoning text and incomplete assistant replies", () => {
    expect(source()).toContain("isScenarioReplyPass");
    expect(scorerSource()).toContain("PROHIBITED_REPLY_PATTERNS");
    expect(scorerSource()).toContain("hasNoInternalReasoning");
    expect(scorerSource()).toContain("hasCompleteReply");
    expect(scorerSource()).toContain("The user is asking");
    expect(scorerSource()).toContain("Let me find");
  });

  it("writes production debugging screenshots only to ignored test-results artifacts", () => {
    expect(source()).toContain("artifactPath");
    expect(source()).toContain("test-results");
    expect(source()).not.toContain('path.join(__dirname, "debug-');
  });

  it("writes a standard live E2E report contract for automated audits", () => {
    expect(source()).toContain("writeFileSync");
    expect(source()).toContain("createdAt: startedAt");
    expect(source()).toContain("scenarioCount: AI_CS_SCENARIOS.length");
    expect(source()).toContain("results.pass");
    expect(source()).toContain("ai-cs-prod-e2e-${Date.now()}.json");
  });
});
