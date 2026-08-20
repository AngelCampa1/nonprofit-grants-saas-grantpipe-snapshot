import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildPasswordResetEmail, sendPasswordResetEmail } from "./password-reset-email";
import type { Bindings } from "../types";

const hoisted = vi.hoisted(() => ({
  mockCaptureBackgroundException: vi.fn(),
}));

vi.mock("./sentry", () => ({
  captureBackgroundException: hoisted.mockCaptureBackgroundException,
}));

const baseBindings: Bindings = {
  DATABASE_URL: "postgres://test",
  BETTER_AUTH_SECRET: "secret",
  GOOGLE_CLIENT_ID: "g",
  GOOGLE_CLIENT_SECRET: "g",
  APP_URL: "http://localhost:3050",
  RESEND_API_KEY: "re_test_key",
};

describe("buildPasswordResetEmail", () => {
  it("returns correct subject", () => {
    const { subject } = buildPasswordResetEmail({
      userEmail: "user@example.com",
      userName: "Jane Doe",
      resetUrl: "https://app.grantpipe.com/reset-password?token=abc123",
    });
    expect(subject).toBe("Reset your GrantPipe password");
  });

  it("includes the reset URL in html body", () => {
    const { html } = buildPasswordResetEmail({
      userEmail: "user@example.com",
      userName: "Jane Doe",
      resetUrl: "https://app.grantpipe.com/reset-password?token=abc123",
    });
    expect(html).toContain("https://app.grantpipe.com/reset-password?token=abc123");
  });

  it("includes the shared GrantPipe branded HTML header without affecting text", () => {
    const { html, text } = buildPasswordResetEmail({
      userEmail: "user@example.com",
      userName: "Jane Doe",
      resetUrl: "https://app.grantpipe.com/reset-password?token=abc123",
    });

    expect(html).toContain('alt="GrantPipe logo"');
    expect(html).toContain("https://grantpipe.com/logo-email.png");
    expect(html).toContain("data-email-brand");
    expect(html).toContain('data-cta="true"');
    expect(text).not.toContain("logo");
    expect(text).not.toContain("https://grantpipe.com/logo-email.png");
  });

  it("includes the user name in html body", () => {
    const { html } = buildPasswordResetEmail({
      userEmail: "user@example.com",
      userName: "Jane Doe",
      resetUrl: "https://app.grantpipe.com/reset-password?token=abc123",
    });
    expect(html).toContain("Jane Doe");
  });

  it("includes the reset URL in text body", () => {
    const { text } = buildPasswordResetEmail({
      userEmail: "user@example.com",
      userName: "Jane Doe",
      resetUrl: "https://app.grantpipe.com/reset-password?token=abc123",
    });
    expect(text).toContain("https://app.grantpipe.com/reset-password?token=abc123");
  });

  it("includes the user name in text body", () => {
    const { text } = buildPasswordResetEmail({
      userEmail: "user@example.com",
      userName: "Jane Doe",
      resetUrl: "https://app.grantpipe.com/reset-password?token=abc123",
    });
    expect(text).toContain("Jane Doe");
  });

  it("includes expiry notice in html body", () => {
    const { html } = buildPasswordResetEmail({
      userEmail: "user@example.com",
      userName: "Jane Doe",
      resetUrl: "https://app.grantpipe.com/reset-password?token=abc123",
    });
    expect(html).toContain("1 hour");
  });

  it("includes ignore message in html body", () => {
    const { html } = buildPasswordResetEmail({
      userEmail: "user@example.com",
      userName: "Jane Doe",
      resetUrl: "https://app.grantpipe.com/reset-password?token=abc123",
    });
    expect(html).toContain("ignore");
    expect(html).not.toContain("We received a request to reset the password");
  });

  it("uses 'there' as fallback when user name is empty", () => {
    const { html, text } = buildPasswordResetEmail({
      userEmail: "user@example.com",
      userName: "",
      resetUrl: "https://app.grantpipe.com/reset-password?token=abc123",
    });
    expect(html).toContain("Hi there");
    expect(text).toContain("Hi there");
  });

  it("uses the shorter reset explanation in html and text", () => {
    const { html, text } = buildPasswordResetEmail({
      userEmail: "user@example.com",
      userName: "Jane Doe",
      resetUrl: "https://app.grantpipe.com/reset-password?token=abc123",
    });

    expect(html).toContain(
      "Use the link below to choose a new password for your GrantPipe account.",
    );
    expect(text).toContain(
      "Use the link below to choose a new password for your GrantPipe account.",
    );
    expect(text).not.toContain("We received a request to reset the password");
  });

  it("escapes HTML special characters in user name", () => {
    const { html } = buildPasswordResetEmail({
      userEmail: "user@example.com",
      userName: "<script>alert('xss')</script>",
      resetUrl: "https://app.grantpipe.com/reset-password?token=abc123",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("sendPasswordResetEmail", () => {
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
    await sendPasswordResetEmail({
      env: baseBindings,
      userEmail: "user@example.com",
      userName: "Jane Doe",
      token: "tok123",
      appUrl: "http://localhost:3050",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { body: string; headers: Record<string, string> },
    ];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers["Authorization"]).toBe("Bearer re_test_key");
    expect(init.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body.from).toBe("GrantPipe <angel.campa@grantpipe.com>");
    expect(body.to).toEqual(["user@example.com"]);
    expect(body.subject).toBe("Reset your GrantPipe password");
    expect(body.html).toContain("tok123");
    expect(body.text).toContain("tok123");
  });

  it("constructs reset URL from appUrl and token", async () => {
    await sendPasswordResetEmail({
      env: baseBindings,
      userEmail: "user@example.com",
      userName: "Jane Doe",
      token: "my-token-xyz",
      appUrl: "https://app.grantpipe.com",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit & { body: string }];
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body.html).toContain("https://app.grantpipe.com/app/reset-password?token=my-token-xyz");
    expect(body.text).toContain("https://app.grantpipe.com/app/reset-password?token=my-token-xyz");
  });

  it("URL-encodes the token in the reset URL", async () => {
    await sendPasswordResetEmail({
      env: baseBindings,
      userEmail: "user@example.com",
      userName: "Jane Doe",
      token: "token with spaces",
      appUrl: "https://app.grantpipe.com",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit & { body: string }];
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body.html).toContain("token%20with%20spaces");
  });

  it("reports and fails when RESEND_API_KEY is missing", async () => {
    const bindingsWithoutKey = {
      ...baseBindings,
      RESEND_API_KEY: undefined,
    } as Bindings;

    await expect(
      sendPasswordResetEmail({
        env: bindingsWithoutKey,
        userEmail: "user@example.com",
        userName: "Jane Doe",
        token: "tok123",
        appUrl: "http://localhost:3050",
      }),
    ).rejects.toThrow("Password reset email is not configured");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(hoisted.mockCaptureBackgroundException).toHaveBeenCalledWith(expect.any(Error), "auth", {
      step: "password_reset_email_config",
    });
    const calls = JSON.stringify(hoisted.mockCaptureBackgroundException.mock.calls);
    expect(calls).not.toContain("user@example.com");
    expect(calls).not.toContain("tok123");
  });

  it("throws when Resend returns a non-ok response", async () => {
    fetchMock.mockResolvedValue(new Response("Internal Server Error", { status: 500 }));

    await expect(
      sendPasswordResetEmail({
        env: baseBindings,
        userEmail: "user@example.com",
        userName: "Jane Doe",
        token: "tok123",
        appUrl: "http://localhost:3050",
      }),
    ).rejects.toThrow("Failed to send password reset email: 500");
  });
});
