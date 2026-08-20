import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { sendFeedbackEmail } from "./service";
import type { Bindings } from "../../types";
import type { SubmitFeedbackInput } from "@grantpipe/shared";

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn(),
  recordActivityLogBestEffort: vi.fn(),
}));

import { recordActivityLogBestEffort } from "../../lib/activity-log";

const baseBindings: Bindings = {
  DATABASE_URL: "postgres://test",
  BETTER_AUTH_SECRET: "secret",
  GOOGLE_CLIENT_ID: "g",
  GOOGLE_CLIENT_SECRET: "g",
  APP_URL: "http://localhost:3050",
  MARKETING_URL: "http://localhost:4321",
  RESEND_API_KEY: "re_test",
  FEEDBACK_RECIPIENT_EMAIL: "to@example.com",
};

const baseInput: SubmitFeedbackInput = {
  message: "Something is broken",
  category: "bug",
  reporterEmail: "reporter@example.com",
  reporterName: "Jane Doe",
  pageUrl: "https://app.example.com/grants",
  userAgent: "Mozilla/5.0",
};

describe("sendFeedbackEmail", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the correct payload to Resend", async () => {
    await sendFeedbackEmail(baseBindings, baseInput);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers["Authorization"]).toBe("Bearer re_test");
    expect(init.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init.body);
    expect(body.from).toBe("GrantPipe Feedback <angel.campa@grantpipe.com>");
    expect(body.to).toEqual(["to@example.com"]);
    expect(body.reply_to).toBe("reporter@example.com");
    expect(body.subject).toBe("[GrantPipe Feedback · bug] Something is broken");
    expect(body.html).toContain('alt="GrantPipe logo"');
    expect(body.html).toContain("http://localhost:4321/logo-email.png");
    expect(body.html).toContain("data-email-brand");
    expect(body.html).toContain("Something is broken");
    expect(body.html).toContain("reporter@example.com");
    expect(body.html).toContain("Jane Doe");
    expect(body.text).toContain("Something is broken");
    expect(body.text).toContain("reporter@example.com");
    expect(body.text).not.toContain("logo");
    expect(body.text).not.toContain("http://localhost:4321/logo-email.png");
  });

  it("throws when RESEND_API_KEY is missing", async () => {
    await expect(
      sendFeedbackEmail({ ...baseBindings, RESEND_API_KEY: "" }, baseInput),
    ).rejects.toThrow("RESEND_API_KEY is not configured");
  });

  it("throws when RESEND_API_KEY is undefined", async () => {
    const bindingsWithoutKey = Object.fromEntries(
      Object.entries(baseBindings).filter(([k]) => k !== "RESEND_API_KEY"),
    ) as Bindings;
    await expect(sendFeedbackEmail(bindingsWithoutKey, baseInput)).rejects.toThrow(
      "RESEND_API_KEY is not configured",
    );
  });

  it("throws when FEEDBACK_RECIPIENT_EMAIL is missing", async () => {
    await expect(
      sendFeedbackEmail({ ...baseBindings, FEEDBACK_RECIPIENT_EMAIL: "" }, baseInput),
    ).rejects.toThrow("FEEDBACK_RECIPIENT_EMAIL is not configured");
  });

  it("throws when FEEDBACK_RECIPIENT_EMAIL is undefined", async () => {
    const bindingsWithoutRecipient = Object.fromEntries(
      Object.entries(baseBindings).filter(([k]) => k !== "FEEDBACK_RECIPIENT_EMAIL"),
    ) as Bindings;
    await expect(sendFeedbackEmail(bindingsWithoutRecipient, baseInput)).rejects.toThrow(
      "FEEDBACK_RECIPIENT_EMAIL is not configured",
    );
  });

  it("throws when Resend returns 4xx", async () => {
    fetchMock.mockResolvedValueOnce(new Response("bad", { status: 422 }));
    await expect(sendFeedbackEmail(baseBindings, baseInput)).rejects.toThrow(
      "Failed to send feedback email",
    );
  });

  it("truncates long messages in the subject", async () => {
    const longMessage = "a".repeat(200);
    await sendFeedbackEmail(baseBindings, { ...baseInput, message: longMessage });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.subject).toBe(`[GrantPipe Feedback · bug] ${"a".repeat(60)}…`);
  });

  it("includes context fields in the email body when present", async () => {
    await sendFeedbackEmail(baseBindings, baseInput, {
      orgId: "org-123",
      orgName: "Acme Nonprofit",
      planTier: "growth",
      userId: "user-1",
    });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.text).toContain("Acme Nonprofit");
    expect(body.text).toContain("org-123");
    expect(body.text).toContain("growth");
    expect(body.html).toContain("Acme Nonprofit");
    expect(body.html).toContain("org-123");
    expect(body.html).toContain("growth");
  });

  it("omits context fields when not provided", async () => {
    await sendFeedbackEmail(baseBindings, {
      message: "Hi",
      category: "idea",
    });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.text).not.toContain("Organization");
    expect(body.text).not.toContain("Plan tier");
    expect(body.reply_to).toBeUndefined();
  });

  it("records feedback activity best-effort when db, orgId, and userId provided", async () => {
    const db = {} as never;
    await sendFeedbackEmail(baseBindings, baseInput, { orgId: "org-1", userId: "user-1" }, db);
    expect(recordActivityLogBestEffort).toHaveBeenCalledTimes(1);
    expect(recordActivityLogBestEffort).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        action: "feedback.submitted",
        entityType: "feedback",
      }),
    );
  });

  it("does not call activity log when db is missing", async () => {
    await sendFeedbackEmail(baseBindings, baseInput, { orgId: "org-1", userId: "user-1" });
    expect(recordActivityLogBestEffort).not.toHaveBeenCalled();
  });

  it("does not call activity log when orgId is missing", async () => {
    await sendFeedbackEmail(baseBindings, baseInput, { userId: "user-1" }, {} as never);
    expect(recordActivityLogBestEffort).not.toHaveBeenCalled();
  });

  it("escapes html in message and context", async () => {
    await sendFeedbackEmail(baseBindings, {
      ...baseInput,
      message: "<script>alert(1)</script>",
      reporterName: "<b>x</b>",
    });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.html).not.toContain("<script>alert(1)</script>");
    expect(body.html).toContain("&lt;script&gt;");
    expect(body.html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("does not append ellipsis when message is exactly 60 characters", async () => {
    const msg = "b".repeat(60);
    await sendFeedbackEmail(baseBindings, { ...baseInput, message: msg });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.subject).toBe(`[GrantPipe Feedback · bug] ${msg}`);
    expect(body.subject.endsWith("…")).toBe(false);
  });
});
