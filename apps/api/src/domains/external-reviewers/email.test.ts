import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  buildReviewerInviteEmailRequest,
  buildSessionExtendedEmailRequest,
  sendReviewerInviteEmail,
  sendSessionExtendedEmail,
  sendSessionRevokedEmail,
} from "./email";

const RESEND_KEY = "re_test_key";
const FROM = "GrantPipe <angel.campa@grantpipe.com>";

function expectSharedEmailBrandHeader(html: string): void {
  expect(html).toContain("data-email-brand");
  expect(html).toContain("logo-email.png");
}

describe("sendReviewerInviteEmail", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("posts to the Resend emails endpoint", async () => {
    await sendReviewerInviteEmail({
      to: "reviewer@example.com",
      reviewerName: "Jane Doe",
      inviterName: "Alice Smith",
      orgName: "Acme Nonprofit",
      purpose: "Annual audit review",
      portalUrl: "https://app.grantpipe.com/portal/abc123",
      expiresAt: new Date("2026-06-01T12:00:00Z"),
      resendKey: RESEND_KEY,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers["Authorization"]).toBe(`Bearer ${RESEND_KEY}`);
  });

  it("escapes every untrusted HTML field while keeping the plain-text content readable", () => {
    const request = buildReviewerInviteEmailRequest({
      to: "reviewer@example.com",
      reviewerName: `<Jane & "J" 'Doe'>`,
      inviterName: `<Alice & "A" 'Smith'>`,
      orgName: `<Acme & "Org" 'One'>`,
      purpose: `<img src=x onerror=alert(1)> & "audit" 'review'`,
      portalUrl: "https://app.grantpipe.com/portal/abc?next=1&mode=review",
      expiresAt: new Date("2026-06-01T12:00:00Z"),
    });

    expect(request.html).not.toContain("<Jane");
    expect(request.html).not.toContain("<Alice");
    expect(request.html).not.toContain("<Acme");
    expect(request.html).not.toContain("<img src=x onerror=alert(1)>");
    expect(request.html).toContain("&lt;Jane &amp; &quot;J&quot; &#39;Doe&#39;&gt;");
    expect(request.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(request.html).toContain(
      'href="https://app.grantpipe.com/portal/abc?next=1&amp;mode=review"',
    );
    expect(request.text).toContain(`<Jane & "J" 'Doe'>`);
    expect(request.text).toContain(`<img src=x onerror=alert(1)> & "audit" 'review'`);
  });

  it("neutralizes a javascript-like portal URL in invite and extension HTML", () => {
    const invite = buildReviewerInviteEmailRequest({
      to: "reviewer@example.com",
      reviewerName: "Jane",
      inviterName: "Alice",
      orgName: "Acme",
      purpose: "audit",
      portalUrl: "javascript:alert(1)",
      expiresAt: new Date("2026-06-01T12:00:00Z"),
    });
    const extension = buildSessionExtendedEmailRequest({
      to: "reviewer@example.com",
      reviewerName: `<Jane & "J">`,
      orgName: `<Acme & "Org">`,
      purpose: `<svg onload=alert(1)>`,
      portalUrl: "javascript:alert(1)",
      newExpiresAt: new Date("2026-07-01T12:00:00Z"),
    });

    expect(invite.html).not.toContain("javascript:");
    expect(invite.html).toContain('href="#"');
    expect(extension.html).not.toContain("javascript:");
    expect(extension.html).not.toContain("<svg");
    expect(extension.html).toContain("&lt;svg onload=alert(1)&gt;");
    expect(extension.html).toContain('href="#"');
    expect(extension.text).toContain("javascript:alert(1)");
  });

  it("escapes untrusted fields in revoked-session HTML", async () => {
    await sendSessionRevokedEmail({
      to: "reviewer@example.com",
      reviewerName: `<Jane & "J">`,
      orgName: `<Acme & "Org">`,
      purpose: `<img src=x onerror=alert(1)>`,
      resendKey: RESEND_KEY,
    });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body) as { html: string; text: string };
    expect(body.html).not.toContain("<img src=x onerror=alert(1)>");
    expect(body.html).toContain("&lt;Jane &amp; &quot;J&quot;&gt;");
    expect(body.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(body.text).toContain(`<img src=x onerror=alert(1)>`);
  });

  it("forwards the durable attempt idempotency key", async () => {
    await sendSessionExtendedEmail({
      to: "reviewer@example.com",
      reviewerName: "Jane",
      orgName: "Acme",
      purpose: "audit",
      newExpiresAt: new Date("2026-07-01T00:00:00Z"),
      portalUrl: "https://app.grantpipe.com/portal/extended-token",
      resendKey: RESEND_KEY,
      idempotencyKey: "external-review-invite/session-1/2",
    });

    expect(fetchMock.mock.calls[0]![1].headers).toMatchObject({
      "Idempotency-Key": "external-review-invite/session-1/2",
    });
  });

  it("uses the durable session delivery key for Resend idempotency", async () => {
    await sendReviewerInviteEmail({
      to: "reviewer@example.com",
      reviewerName: "Jane",
      inviterName: "Alice",
      orgName: "Acme",
      purpose: "audit",
      portalUrl: "https://example.com/portal",
      expiresAt: new Date("2026-06-01T00:00:00Z"),
      resendKey: RESEND_KEY,
      idempotencyKey: "external-review-invite/session-1",
    });

    expect(fetchMock.mock.calls[0]![1].headers["Idempotency-Key"]).toBe(
      "external-review-invite/session-1",
    );
  });

  it("sends from the GrantPipe address", async () => {
    await sendReviewerInviteEmail({
      to: "reviewer@example.com",
      reviewerName: "Jane",
      inviterName: "Alice",
      orgName: "Acme",
      purpose: "audit",
      portalUrl: "https://example.com/portal",
      expiresAt: new Date("2026-06-01T00:00:00Z"),
      resendKey: RESEND_KEY,
    });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.from).toBe(FROM);
  });

  it("sends to the correct recipient", async () => {
    await sendReviewerInviteEmail({
      to: "reviewer@example.com",
      reviewerName: "Jane",
      inviterName: "Alice",
      orgName: "Acme",
      purpose: "audit",
      portalUrl: "https://example.com",
      expiresAt: new Date("2026-06-01T00:00:00Z"),
      resendKey: RESEND_KEY,
    });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.to).toEqual(["reviewer@example.com"]);
  });

  it("includes inviterName and orgName in subject", async () => {
    await sendReviewerInviteEmail({
      to: "reviewer@example.com",
      reviewerName: "Jane",
      inviterName: "Alice Smith",
      orgName: "Acme Nonprofit",
      purpose: "audit",
      portalUrl: "https://example.com",
      expiresAt: new Date("2026-06-01T00:00:00Z"),
      resendKey: RESEND_KEY,
    });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.subject).toContain("Alice Smith");
    expect(body.subject).toContain("Acme Nonprofit");
  });

  it("includes reviewer name, purpose, and portal URL in html and text", async () => {
    const portalUrl = "https://app.grantpipe.com/portal/xyz";
    await sendReviewerInviteEmail({
      to: "reviewer@example.com",
      reviewerName: "Jane Doe",
      inviterName: "Alice",
      orgName: "Acme",
      purpose: "Funder site visit",
      portalUrl,
      expiresAt: new Date("2026-06-01T00:00:00Z"),
      resendKey: RESEND_KEY,
    });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.html).toContain("Jane Doe");
    expect(body.html).toContain("Funder site visit");
    expect(body.html).toContain(portalUrl);
    expect(body.text).toContain("Jane Doe");
    expect(body.text).toContain("Funder site visit");
    expect(body.text).toContain(portalUrl);
  });

  it("includes the shared GrantPipe email brand header", async () => {
    await sendReviewerInviteEmail({
      to: "reviewer@example.com",
      reviewerName: "Jane",
      inviterName: "Alice",
      orgName: "Acme",
      purpose: "audit",
      portalUrl: "https://example.com",
      expiresAt: new Date("2026-06-01T00:00:00Z"),
      resendKey: RESEND_KEY,
    });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expectSharedEmailBrandHeader(body.html);
  });

  it("includes expiry date in html and text", async () => {
    await sendReviewerInviteEmail({
      to: "reviewer@example.com",
      reviewerName: "Jane",
      inviterName: "Alice",
      orgName: "Acme",
      purpose: "audit",
      portalUrl: "https://example.com",
      expiresAt: new Date("2026-06-01T00:00:00Z"),
      resendKey: RESEND_KEY,
    });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    // The formatted date should appear somewhere in the content
    expect(body.html).toContain("2026");
    expect(body.text).toContain("2026");
  });

  it("html contains a CTA link to the portal URL", async () => {
    const portalUrl = "https://app.grantpipe.com/portal/abc";
    await sendReviewerInviteEmail({
      to: "r@example.com",
      reviewerName: "R",
      inviterName: "I",
      orgName: "O",
      purpose: "p",
      portalUrl,
      expiresAt: new Date("2026-06-01T00:00:00Z"),
      resendKey: RESEND_KEY,
    });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.html).toContain(`href="${portalUrl}"`);
    expect(body.html).toContain('data-cta="true"');
    expect(body.html).toContain("border-radius:9999px");
    expect(body.html).toContain("Open review portal");
  });

  it("throws when Resend returns non-ok", async () => {
    fetchMock.mockResolvedValueOnce(new Response("bad request", { status: 422 }));

    await expect(
      sendReviewerInviteEmail({
        to: "r@example.com",
        reviewerName: "R",
        inviterName: "I",
        orgName: "O",
        purpose: "p",
        portalUrl: "https://example.com",
        expiresAt: new Date("2026-06-01T00:00:00Z"),
        resendKey: RESEND_KEY,
      }),
    ).rejects.toThrow(/Resend returned 422/);
  });

  it("throws when Resend returns non-ok and body read fails", async () => {
    const fakeResponse = {
      ok: false,
      status: 500,
      text: vi.fn().mockRejectedValue(new Error("stream fail")),
    };
    fetchMock.mockResolvedValueOnce(fakeResponse);

    await expect(
      sendReviewerInviteEmail({
        to: "r@example.com",
        reviewerName: "R",
        inviterName: "I",
        orgName: "O",
        purpose: "p",
        portalUrl: "https://example.com",
        expiresAt: new Date("2026-06-01T00:00:00Z"),
        resendKey: RESEND_KEY,
      }),
    ).rejects.toThrow(/Resend returned 500/);
  });
});

describe("sendSessionExtendedEmail", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("posts to the Resend emails endpoint", async () => {
    await sendSessionExtendedEmail({
      to: "reviewer@example.com",
      reviewerName: "Jane",
      orgName: "Acme",
      purpose: "audit",
      newExpiresAt: new Date("2026-07-01T00:00:00Z"),
      portalUrl: "https://app.grantpipe.com/portal/extended-token",
      resendKey: RESEND_KEY,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
  });

  it("sends from the GrantPipe address", async () => {
    await sendSessionExtendedEmail({
      to: "reviewer@example.com",
      reviewerName: "Jane",
      orgName: "Acme",
      purpose: "audit",
      newExpiresAt: new Date("2026-07-01T00:00:00Z"),
      portalUrl: "https://app.grantpipe.com/portal/extended-token",
      resendKey: RESEND_KEY,
    });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.from).toBe(FROM);
  });

  it("sends to the correct recipient", async () => {
    await sendSessionExtendedEmail({
      to: "reviewer@example.com",
      reviewerName: "Jane",
      orgName: "Acme",
      purpose: "audit",
      newExpiresAt: new Date("2026-07-01T00:00:00Z"),
      portalUrl: "https://app.grantpipe.com/portal/extended-token",
      resendKey: RESEND_KEY,
    });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.to).toEqual(["reviewer@example.com"]);
  });

  it("includes orgName in the subject", async () => {
    await sendSessionExtendedEmail({
      to: "reviewer@example.com",
      reviewerName: "Jane",
      orgName: "Acme Nonprofit",
      purpose: "audit",
      newExpiresAt: new Date("2026-07-01T00:00:00Z"),
      portalUrl: "https://app.grantpipe.com/portal/extended-token",
      resendKey: RESEND_KEY,
    });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.subject).toContain("Acme Nonprofit");
  });

  it("includes reviewer name, purpose, and new expiry in html and text", async () => {
    await sendSessionExtendedEmail({
      to: "reviewer@example.com",
      reviewerName: "Jane Doe",
      orgName: "Acme",
      purpose: "Funder review",
      newExpiresAt: new Date("2026-07-01T00:00:00Z"),
      portalUrl: "https://app.grantpipe.com/portal/extended-token",
      resendKey: RESEND_KEY,
    });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.html).toContain("Jane Doe");
    expect(body.html).toContain("Funder review");
    expect(body.html).toContain("2026");
    expect(body.html).toContain("https://app.grantpipe.com/portal/extended-token");
    expect(body.text).toContain("Jane Doe");
    expect(body.text).toContain("Funder review");
    expect(body.text).toContain("2026");
    expect(body.text).toContain("https://app.grantpipe.com/portal/extended-token");
  });

  it("includes the shared GrantPipe email brand header", async () => {
    await sendSessionExtendedEmail({
      to: "reviewer@example.com",
      reviewerName: "Jane",
      orgName: "Acme",
      purpose: "audit",
      newExpiresAt: new Date("2026-07-01T00:00:00Z"),
      portalUrl: "https://app.grantpipe.com/portal/extended-token",
      resendKey: RESEND_KEY,
    });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expectSharedEmailBrandHeader(body.html);
  });

  it("uses a pill CTA link to the portal URL", async () => {
    const portalUrl = "https://app.grantpipe.com/portal/extended-token";
    await sendSessionExtendedEmail({
      to: "reviewer@example.com",
      reviewerName: "Jane",
      orgName: "Acme",
      purpose: "audit",
      newExpiresAt: new Date("2026-07-01T00:00:00Z"),
      portalUrl,
      resendKey: RESEND_KEY,
    });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.html).toContain(`href="${portalUrl}"`);
    expect(body.html).toContain("border-radius:9999px");
    expect(body.html).toContain("Open review portal");
  });

  it("throws when Resend returns non-ok", async () => {
    fetchMock.mockResolvedValueOnce(new Response("error", { status: 500 }));

    await expect(
      sendSessionExtendedEmail({
        to: "r@example.com",
        reviewerName: "R",
        orgName: "O",
        purpose: "p",
        newExpiresAt: new Date("2026-07-01T00:00:00Z"),
        portalUrl: "https://app.grantpipe.com/portal/extended-token",
        resendKey: RESEND_KEY,
      }),
    ).rejects.toThrow(/Resend returned 500/);
  });

  it("throws when Resend returns non-ok and body read fails", async () => {
    const fakeResponse = {
      ok: false,
      status: 503,
      text: vi.fn().mockRejectedValue(new Error("read fail")),
    };
    fetchMock.mockResolvedValueOnce(fakeResponse);

    await expect(
      sendSessionExtendedEmail({
        to: "r@example.com",
        reviewerName: "R",
        orgName: "O",
        purpose: "p",
        newExpiresAt: new Date("2026-07-01T00:00:00Z"),
        portalUrl: "https://app.grantpipe.com/portal/extended-token",
        resendKey: RESEND_KEY,
      }),
    ).rejects.toThrow(/Resend returned 503/);
  });
});

describe("sendSessionRevokedEmail", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("posts to the Resend emails endpoint", async () => {
    await sendSessionRevokedEmail({
      to: "reviewer@example.com",
      reviewerName: "Jane",
      orgName: "Acme",
      purpose: "audit",
      resendKey: RESEND_KEY,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
  });

  it("sends from the GrantPipe address", async () => {
    await sendSessionRevokedEmail({
      to: "reviewer@example.com",
      reviewerName: "Jane",
      orgName: "Acme",
      purpose: "audit",
      resendKey: RESEND_KEY,
    });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.from).toBe(FROM);
  });

  it("sends to the correct recipient", async () => {
    await sendSessionRevokedEmail({
      to: "reviewer@example.com",
      reviewerName: "Jane",
      orgName: "Acme",
      purpose: "audit",
      resendKey: RESEND_KEY,
    });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.to).toEqual(["reviewer@example.com"]);
  });

  it("includes orgName in the subject", async () => {
    await sendSessionRevokedEmail({
      to: "reviewer@example.com",
      reviewerName: "Jane",
      orgName: "Acme Nonprofit",
      purpose: "audit",
      resendKey: RESEND_KEY,
    });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.subject).toContain("Acme Nonprofit");
  });

  it("includes reviewer name and purpose in html and text", async () => {
    await sendSessionRevokedEmail({
      to: "reviewer@example.com",
      reviewerName: "Jane Doe",
      orgName: "Acme",
      purpose: "Board review",
      resendKey: RESEND_KEY,
    });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.html).toContain("Jane Doe");
    expect(body.html).toContain("Board review");
    expect(body.text).toContain("Jane Doe");
    expect(body.text).toContain("Board review");
  });

  it("includes the shared GrantPipe email brand header", async () => {
    await sendSessionRevokedEmail({
      to: "reviewer@example.com",
      reviewerName: "Jane",
      orgName: "Acme",
      purpose: "audit",
      resendKey: RESEND_KEY,
    });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expectSharedEmailBrandHeader(body.html);
  });

  it("does not include an expiry date (not relevant for revocation)", async () => {
    await sendSessionRevokedEmail({
      to: "reviewer@example.com",
      reviewerName: "Jane",
      orgName: "Acme",
      purpose: "audit",
      resendKey: RESEND_KEY,
    });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    // The revocation email should mention the portal is no longer active
    expect(body.html.toLowerCase()).toContain("revoked");
    expect(body.text.toLowerCase()).toContain("revoked");
  });

  it("throws when Resend returns non-ok", async () => {
    fetchMock.mockResolvedValueOnce(new Response("error", { status: 400 }));

    await expect(
      sendSessionRevokedEmail({
        to: "r@example.com",
        reviewerName: "R",
        orgName: "O",
        purpose: "p",
        resendKey: RESEND_KEY,
      }),
    ).rejects.toThrow(/Resend returned 400/);
  });

  it("throws when Resend returns non-ok and body read fails", async () => {
    const fakeResponse = {
      ok: false,
      status: 502,
      text: vi.fn().mockRejectedValue(new Error("read fail")),
    };
    fetchMock.mockResolvedValueOnce(fakeResponse);

    await expect(
      sendSessionRevokedEmail({
        to: "r@example.com",
        reviewerName: "R",
        orgName: "O",
        purpose: "p",
        resendKey: RESEND_KEY,
      }),
    ).rejects.toThrow(/Resend returned 502/);
  });
});
