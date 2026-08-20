import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildDownloadUrl,
  buildUnsubscribeUrl,
  createNurtureEmailRequestFingerprint,
  sendNurtureEmail,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from "./emails";
import type { Bindings } from "../../types";
import { marketingKnowledge } from "@grantpipe/shared/public-kb";

const baseBindings: Bindings = {
  DATABASE_URL: "postgres://test",
  BETTER_AUTH_SECRET: "auth-secret",
  GOOGLE_CLIENT_ID: "g",
  GOOGLE_CLIENT_SECRET: "g",
  APP_URL: "http://localhost:3050",
  MARKETING_URL: "http://localhost:4321",
  RESEND_API_KEY: "re_test",
  LEAD_UNSUBSCRIBE_SECRET: "unsub-secret",
  DOWNLOAD_LINK_SECRET: "dl-secret",
};

describe("signUnsubscribeToken / verifyUnsubscribeToken", () => {
  it("roundtrips a leadId", async () => {
    const token = await signUnsubscribeToken("lead-123", "secret");

    expect(token.startsWith("lead-123.")).toBe(true);
    await expect(verifyUnsubscribeToken(token, "secret")).resolves.toBe("lead-123");
  });

  it("rejects malformed or tampered tokens", async () => {
    const token = await signUnsubscribeToken("lead-123", "secret");

    await expect(verifyUnsubscribeToken(token.slice(0, -2) + "00", "secret")).resolves.toBeNull();
    await expect(verifyUnsubscribeToken(token, "other-secret")).resolves.toBeNull();
    await expect(verifyUnsubscribeToken("nodot", "secret")).resolves.toBeNull();
  });
});

describe("lead email URLs", () => {
  it("builds an unsubscribe URL from MARKETING_URL", () => {
    expect(buildUnsubscribeUrl(baseBindings, "a b+c")).toBe(
      "http://localhost:4321/unsubscribe?token=a%20b%2Bc",
    );
  });

  it("falls back to the canonical marketing URL for unsubscribe links", () => {
    const fallbackBindings = { ...baseBindings, MARKETING_URL: undefined };

    expect(buildUnsubscribeUrl(fallbackBindings, "token")).toBe(
      `${marketingKnowledge.brand.siteUrl}/unsubscribe?token=token`,
    );
  });

  it("builds a signed 7-day download URL", async () => {
    const before = Date.now();
    const url = await buildDownloadUrl("lead-1", "grant-compliance-checklist", baseBindings);
    const after = Date.now();

    expect(url).toMatch(/^http:\/\/localhost:3050\/api\/public\/downloads\//);
    const token = url.split("/api/public/downloads/")[1]!;
    expect(token).toMatch(/^lead-1\.grant-compliance-checklist\.\d+\.[0-9a-f]{64}$/);
    const expiresAt = Number(token.split(".").at(-2));
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(expiresAt).toBeGreaterThanOrEqual(before + sevenDays);
    expect(expiresAt).toBeLessThanOrEqual(after + sevenDays);
  });

  it("falls back to app URL and resource slug defaults for download links", async () => {
    const fallbackBindings: Bindings = { ...baseBindings };
    delete (fallbackBindings as Partial<Bindings>).APP_URL;
    delete fallbackBindings.DOWNLOAD_LINK_SECRET;

    const url = await buildDownloadUrl("lead-1", null, fallbackBindings);

    expect(url).toMatch(new RegExp(`^${marketingKnowledge.brand.appUrl}/api/public/downloads/`));
    expect(url.split("/api/public/downloads/")[1]).toMatch(/^lead-1\.resource\.\d+\.[0-9a-f]{64}$/);
  });
});

describe("sendNurtureEmail", () => {
  it("fingerprints the exact rendered Resend request without credential headers", async () => {
    const params = {
      leadId: "lead-1",
      email: "lead@example.com",
      firstName: "Lead",
      step: 0,
      magnetSlug: "grant-compliance-checklist",
      downloadUrl: "https://dl.example.com/stable",
      idempotencyKey: "lead-magnet/download-1/1",
    };
    const original = await createNurtureEmailRequestFingerprint(baseBindings, params);

    expect(original).toMatch(/^[0-9a-f]{64}$/);
    expect(original).not.toContain("lead@example.com");
    expect(original).not.toContain("re_test");
    expect(original).not.toContain("dl.example.com");

    await expect(createNurtureEmailRequestFingerprint(baseBindings, params)).resolves.toBe(
      original,
    );
    await expect(
      createNurtureEmailRequestFingerprint(
        { ...baseBindings, RESEND_API_KEY: "re_rotated" },
        params,
      ),
    ).resolves.toBe(original);
    await expect(
      createNurtureEmailRequestFingerprint(baseBindings, {
        ...params,
        email: "changed@example.com",
      }),
    ).resolves.not.toBe(original);
    await expect(
      createNurtureEmailRequestFingerprint(
        { ...baseBindings, MARKETING_URL: "https://changed.example.com" },
        params,
      ),
    ).resolves.not.toBe(original);
  });

  it("uses the durable download delivery key for Resend idempotency", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    await sendNurtureEmail(baseBindings, {
      leadId: "lead-1",
      email: "lead@example.com",
      step: 0,
      magnetSlug: "grant-compliance-checklist",
      idempotencyKey: "lead-magnet/download-1",
    });

    expect(fetchMock.mock.calls[0]![1].headers["Idempotency-Key"]).toBe("lead-magnet/download-1");
  });
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts only the immediate delivery email to Resend", async () => {
    await sendNurtureEmail(baseBindings, {
      leadId: "lead-1",
      email: "lead@example.com",
      step: 0,
      magnetSlug: "grant-compliance-checklist",
      downloadUrl: "https://dl.example.com/file",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer re_test" }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.to).toEqual(["lead@example.com"]);
    expect(body.subject).toBe("Your Grant Compliance Checklist from GrantPipe");
    expect(body.html).toContain("https://dl.example.com/file");
    expect(body.headers["List-Unsubscribe"]).toMatch(/^<http:\/\/localhost:4321\/unsubscribe/);
  });

  it("uses production URL fallbacks and default resource copy when optional inputs are absent", async () => {
    const fallbackBindings: Bindings = { ...baseBindings };
    delete (fallbackBindings as Partial<Bindings>).APP_URL;
    delete fallbackBindings.MARKETING_URL;
    delete fallbackBindings.LEAD_UNSUBSCRIBE_SECRET;
    delete fallbackBindings.DOWNLOAD_LINK_SECRET;

    await sendNurtureEmail(fallbackBindings, {
      leadId: "lead-1",
      email: "lead@example.com",
      step: 0,
    });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.subject).toBe("Your resource from GrantPipe");
    expect(body.html).toContain(marketingKnowledge.brand.appUrl);
    expect(body.html).toContain(marketingKnowledge.brand.siteUrl);
    expect(body.html).toContain("/api/public/downloads/lead-1.resource.");
    expect(body.text).toContain("/api/public/downloads/lead-1.resource.");
    expect(body.headers["List-Unsubscribe"]).toMatch(
      new RegExp(`^<${marketingKnowledge.brand.siteUrl}/unsubscribe\\?token=`),
    );
  });

  it("rejects local follow-up steps because Sequencer owns them", async () => {
    await expect(
      sendNurtureEmail(baseBindings, {
        leadId: "lead-1",
        email: "lead@example.com",
        step: 1,
      }),
    ).rejects.toThrow("Invalid local delivery step: 1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws when Resend is not configured or rejects the send", async () => {
    const missingResend = { ...baseBindings };
    delete missingResend.RESEND_API_KEY;
    await expect(
      sendNurtureEmail(missingResend as Bindings, {
        leadId: "lead-1",
        email: "lead@example.com",
        step: 0,
      }),
    ).rejects.toThrow(/RESEND_API_KEY is required/);

    fetchMock.mockResolvedValueOnce(new Response("bad", { status: 500 }));
    await expect(
      sendNurtureEmail(baseBindings, {
        leadId: "lead-1",
        email: "lead@example.com",
        step: 0,
      }),
    ).rejects.toThrow("Resend returned 500: bad");
  });

  it("keeps the canonical request fingerprint stable across Resend credential rotation", async () => {
    const params = {
      leadId: "lead-1",
      email: "lead@example.com",
      step: 0,
      magnetSlug: "grant-compliance-checklist",
      downloadUrl: "https://dl.example.com/file",
      idempotencyKey: "lead-magnet/download-1/1",
    };

    const original = await createNurtureEmailRequestFingerprint(baseBindings, params);
    const rotated = await createNurtureEmailRequestFingerprint(
      { ...baseBindings, RESEND_API_KEY: "rotated-secret" },
      params,
    );
    const missing = await createNurtureEmailRequestFingerprint(
      { ...baseBindings, RESEND_API_KEY: undefined },
      params,
    );

    expect(rotated).toBe(original);
    expect(missing).toBe(original);
  });
});
