import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLeadNurtureRequestFingerprint,
  createLeadNurtureEnrollmentRequestFingerprint,
  enrollLeadNurtureContact,
  enrollLeadNurture,
  isSequencerConfigured,
  recordLifecycleEvent,
  recordSignupCompleted,
  SequencerResponseError,
  upsertLeadNurtureContact,
  unsubscribeLeadNurture,
} from "./sequencer";
import type { Bindings } from "../../types";

const bindings: Bindings = {
  DATABASE_URL: "postgres://test",
  BETTER_AUTH_SECRET: "auth",
  GOOGLE_CLIENT_ID: "g",
  GOOGLE_CLIENT_SECRET: "g",
  APP_URL: "http://localhost:3050",
  SEQUENCER_BASE_URL: "https://sequencer.example.com/",
  SEQUENCER_CF_ACCESS_CLIENT_ID: "client-id",
  SEQUENCER_CF_ACCESS_CLIENT_SECRET: "client-secret",
};

describe("GrantPipe Sequencer client", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ id: "contact-1", email: "lead@example.com", is_new: true }),
      )
      .mockResolvedValueOnce(Response.json({ enrollment: { id: "run-1" } }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fingerprints the canonical Sequencer request without credential headers", async () => {
    const input = {
      email: "lead@example.com",
      firstName: "Lead",
      magnetSlug: "nonprofit-crm-cost-calculator",
      sourcePage: "/free/nonprofit-crm-cost-calculator",
      idempotencyKey: "lead-magnet/download-1",
    };
    const original = await createLeadNurtureRequestFingerprint(bindings, input);

    expect(original).toMatch(/^[0-9a-f]{64}$/);
    expect(original).not.toContain("lead@example.com");
    expect(original).not.toContain("client-secret");

    await expect(createLeadNurtureRequestFingerprint(bindings, input)).resolves.toBe(original);
    await expect(
      createLeadNurtureRequestFingerprint(
        { ...bindings, SEQUENCER_CF_ACCESS_CLIENT_SECRET: "rotated-secret" },
        input,
      ),
    ).resolves.toBe(original);
    await expect(
      createLeadNurtureRequestFingerprint(bindings, {
        ...input,
        sourcePage: "/changed",
      }),
    ).resolves.not.toBe(original);
    await expect(
      createLeadNurtureRequestFingerprint(
        { ...bindings, SEQUENCER_BASE_URL: "https://changed.example.com" },
        input,
      ),
    ).resolves.not.toBe(original);
  });

  it("fingerprints and sends an exact enrollment request for a persisted contact id", async () => {
    const input = {
      email: "lead@example.com",
      magnetSlug: "grant-compliance-checklist",
      idempotencyKey: "lead-magnet/download-1",
    };
    const original = await createLeadNurtureEnrollmentRequestFingerprint(
      bindings,
      input,
      "contact-1",
    );

    expect(original).toMatch(/^[0-9a-f]{64}$/);
    expect(original).not.toContain("lead@example.com");
    expect(original).not.toContain("client-secret");
    expect(original).not.toContain("contact-1");

    await expect(
      createLeadNurtureEnrollmentRequestFingerprint(bindings, input, "contact-2"),
    ).resolves.not.toBe(original);
    await expect(upsertLeadNurtureContact(bindings, input)).resolves.toBe("contact-1");
    await enrollLeadNurtureContact(bindings, input, "contact-1");

    expect(JSON.parse(fetchMock.mock.calls[1]![1].body).properties.contactId).toBe("contact-1");
  });

  it("detects whether Sequencer service-token configuration is present", () => {
    expect(isSequencerConfigured(bindings)).toBe(true);
    expect(
      isSequencerConfigured({ ...bindings, SEQUENCER_CF_ACCESS_CLIENT_SECRET: undefined }),
    ).toBe(false);
    expect(
      isSequencerConfigured({
        ...bindings,
        SEQUENCER_CF_ACCESS_CLIENT_ID: undefined,
        SEQUENCER_CF_ACCESS_CLIENT_SECRET: undefined,
        SEQUENCER_CLIENT_SECRET: "shared-secret",
      }),
    ).toBe(true);
  });

  it("keeps canonical request fingerprints stable across provider credential rotation", async () => {
    const input = {
      email: "lead@example.com",
      magnetSlug: "grant-compliance-checklist",
      idempotencyKey: "lead-magnet/download-1/1",
    };
    const original = await createLeadNurtureRequestFingerprint(bindings, input);
    const enrollment = await createLeadNurtureEnrollmentRequestFingerprint(
      bindings,
      input,
      "contact-1",
    );
    const rotated = {
      ...bindings,
      SEQUENCER_CF_ACCESS_CLIENT_ID: "rotated-id",
      SEQUENCER_CF_ACCESS_CLIENT_SECRET: "rotated-secret",
    };

    await expect(createLeadNurtureRequestFingerprint(rotated, input)).resolves.toBe(original);
    await expect(
      createLeadNurtureEnrollmentRequestFingerprint(rotated, input, "contact-1"),
    ).resolves.toBe(enrollment);
  });

  it("upserts the contact and enrolls the topical GrantPipe nurture sequence", async () => {
    await enrollLeadNurture(bindings, {
      email: "lead@example.com",
      firstName: "Lead",
      magnetSlug: "nonprofit-crm-cost-calculator",
      sourcePage: "/free/nonprofit-crm-cost-calculator",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://sequencer.example.com/api/v1/contacts",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "CF-Access-Client-Id": "client-id",
          "CF-Access-Client-Secret": "client-secret",
        }),
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toMatchObject({
      product: "grantpipe",
      email: "lead@example.com",
      first_name: "Lead",
      properties: {
        magnetSlug: "nonprofit-crm-cost-calculator",
        sourcePage: "/free/nonprofit-crm-cost-calculator",
        sequenceFamily: "crm-evaluation",
        buyerStage: "mofu",
        topicCluster: "nonprofit-crm",
        expectedSequenceSlug: "grantpipe-lead-magnet-nurture",
        cadence: "daily",
        nextStepGoal: "start_trial",
        stopCondition: "signup_completed",
      },
    });
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toMatchObject({
      product: "grantpipe",
      email: "lead@example.com",
      sequence_slug: "grantpipe-lead-magnet-nurture",
      source: "lead_magnet:nonprofit-crm-cost-calculator",
      properties: {
        magnetSlug: "nonprofit-crm-cost-calculator",
        sourcePage: "/free/nonprofit-crm-cost-calculator",
        sequenceFamily: "crm-evaluation",
        buyerStage: "mofu",
        topicCluster: "nonprofit-crm",
        expectedSequenceSlug: "grantpipe-lead-magnet-nurture",
        firstFollowUpAngle:
          "Help the prospect compare CRM cost, migration effort, and grant workflow fit before a trial.",
        cadence: "daily",
        nextStepGoal: "start_trial",
        stopCondition: "signup_completed",
      },
    });
  });

  it("sends a stable idempotency key on durable lead-magnet enrollment", async () => {
    await enrollLeadNurture(bindings, {
      email: "lead@example.com",
      magnetSlug: "nonprofit-crm-cost-calculator",
      idempotencyKey: "lead-magnet/download-1",
    });

    expect(new Headers(fetchMock.mock.calls[1]![1].headers).get("Idempotency-Key")).toBe(
      "lead-magnet/download-1",
    );
  });

  it("omits optional contact fields when name and source page are absent", async () => {
    await enrollLeadNurture(bindings, {
      email: "lead@example.com",
      firstName: null,
      magnetSlug: "grant-compliance-checklist",
      sourcePage: null,
    });

    const contactBody = JSON.parse(fetchMock.mock.calls[0]![1].body);
    const enrollmentBody = JSON.parse(fetchMock.mock.calls[1]![1].body);
    expect(contactBody).not.toHaveProperty("first_name");
    expect(contactBody.properties).toEqual({
      magnetSlug: "grant-compliance-checklist",
      sequenceFamily: "grant-compliance",
      buyerStage: "mofu",
      topicCluster: "grant-compliance",
      expectedSequenceSlug: "grantpipe-lead-magnet-nurture",
      cadence: "daily",
      nextStepGoal: "start_trial",
      stopCondition: "signup_completed",
    });
    expect(enrollmentBody.properties).toMatchObject({
      magnetSlug: "grant-compliance-checklist",
      sequenceFamily: "grant-compliance",
      buyerStage: "mofu",
      topicCluster: "grant-compliance",
      expectedSequenceSlug: "grantpipe-lead-magnet-nurture",
    });
    expect(enrollmentBody.properties).not.toHaveProperty("sourcePage");
  });

  it("falls back to empty Cloudflare Access headers when credentials are absent", async () => {
    await enrollLeadNurture(
      {
        ...bindings,
        SEQUENCER_CF_ACCESS_CLIENT_ID: undefined,
        SEQUENCER_CF_ACCESS_CLIENT_SECRET: undefined,
      },
      {
        email: "lead@example.com",
        magnetSlug: "grant-compliance-checklist",
      },
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://sequencer.example.com/api/v1/contacts",
      expect.objectContaining({
        headers: expect.objectContaining({
          "CF-Access-Client-Id": "",
          "CF-Access-Client-Secret": "",
        }),
      }),
    );
  });

  it("uses the client-auth Sequencer path when a shared client secret is configured", async () => {
    await enrollLeadNurture(
      {
        ...bindings,
        SEQUENCER_CLIENT_SECRET: "shared-secret",
      },
      {
        email: "lead@example.com",
        magnetSlug: "grant-compliance-checklist",
      },
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://sequencer.example.com/api/client/v1/contacts",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Sequencer-Product": "grantpipe",
          "X-Sequencer-Client-Secret": "shared-secret",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://sequencer.example.com/api/client/v1/enrollments",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Sequencer-Product": "grantpipe",
          "X-Sequencer-Client-Secret": "shared-secret",
        }),
      }),
    );
  });

  it("strips BOM and whitespace from Cloudflare Access secret headers", async () => {
    await enrollLeadNurture(
      {
        ...bindings,
        SEQUENCER_CF_ACCESS_CLIENT_ID: "\uFEFFclient-id\n",
        SEQUENCER_CF_ACCESS_CLIENT_SECRET: "\uFEFFclient-secret\r\n",
      },
      {
        email: "lead@example.com",
        magnetSlug: "grant-compliance-checklist",
      },
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://sequencer.example.com/api/v1/contacts",
      expect.objectContaining({
        headers: expect.objectContaining({
          "CF-Access-Client-Id": "client-id",
          "CF-Access-Client-Secret": "client-secret",
        }),
      }),
    );
  });

  it("unsubscribes the product scope in Sequencer", async () => {
    fetchMock.mockReset().mockResolvedValueOnce(Response.json({ ok: true }));

    await unsubscribeLeadNurture(bindings, { email: "lead@example.com" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://sequencer.example.com/api/v1/unsubscribe",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      product: "grantpipe",
      email: "lead@example.com",
      scope: "product",
    });
  });

  it("records signup completion as an internal Sequencer event", async () => {
    fetchMock.mockReset().mockResolvedValueOnce(Response.json({ ok: true }));

    await recordSignupCompleted(bindings, {
      email: "founder@example.org",
      userId: "user-1",
      orgId: "org-1",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://sequencer.example.com/api/v1/events",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Idempotency-Key": "signup_completed:grantpipe:user:user-1",
        }),
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      product: "grantpipe",
      email: "founder@example.org",
      event: "signup_completed",
      properties: {
        userId: "user-1",
        orgId: "org-1",
        source: "better_auth",
      },
    });
  });

  it("records signup completion through the client-auth Sequencer path when configured", async () => {
    fetchMock.mockReset().mockResolvedValueOnce(Response.json({ ok: true }));

    await recordSignupCompleted(
      {
        ...bindings,
        SEQUENCER_CLIENT_SECRET: "shared-secret",
      },
      {
        email: "founder@example.org",
        userId: "user-1",
        orgId: "org-1",
      },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://sequencer.example.com/api/client/v1/events",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Idempotency-Key": "signup_completed:grantpipe:user:user-1",
          "X-Sequencer-Product": "grantpipe",
          "X-Sequencer-Client-Secret": "shared-secret",
        }),
      }),
    );
  });

  it("records a lifecycle event with a stable idempotency key", async () => {
    fetchMock.mockReset().mockResolvedValueOnce(Response.json({ ok: true }));

    await recordLifecycleEvent(bindings, {
      email: "founder@example.org",
      event: "onboarding_completed",
      idempotencyKey: "onboarding_completed:grantpipe:org:org-1",
      properties: {
        orgId: "org-1",
        userId: "user-1",
        onboardingGoal: "compliance",
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://sequencer.example.com/api/v1/events",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Idempotency-Key": "onboarding_completed:grantpipe:org:org-1",
        }),
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      product: "grantpipe",
      email: "founder@example.org",
      event: "onboarding_completed",
      properties: {
        orgId: "org-1",
        userId: "user-1",
        onboardingGoal: "compliance",
      },
    });
  });

  it("throws when Sequencer returns an error", async () => {
    fetchMock.mockReset().mockResolvedValueOnce(new Response("bad", { status: 500 }));

    const delivery = enrollLeadNurture(bindings, {
      email: "lead@example.com",
      magnetSlug: "grant-compliance-checklist",
    });

    await expect(delivery).rejects.toEqual(
      expect.objectContaining<Partial<SequencerResponseError>>({
        name: "SequencerResponseError",
        status: 500,
        message: "Sequencer contact upsert failed with 500: bad",
      }),
    );
  });

  it("throws before fetch when the Sequencer base URL is missing", async () => {
    await expect(
      enrollLeadNurture(
        {
          ...bindings,
          SEQUENCER_BASE_URL: undefined,
        },
        {
          email: "lead@example.com",
          magnetSlug: "grant-compliance-checklist",
        },
      ),
    ).rejects.toThrow("SEQUENCER_BASE_URL is required");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws when contact upsert succeeds without a contact id", async () => {
    fetchMock.mockReset().mockResolvedValueOnce(Response.json({ contact: {} }));

    await expect(
      enrollLeadNurture(bindings, {
        email: "lead@example.com",
        magnetSlug: "grant-compliance-checklist",
      }),
    ).rejects.toThrow("Sequencer contact upsert did not return id");
  });

  it("throws a diagnostic error when contact upsert returns non-JSON", async () => {
    fetchMock.mockReset().mockResolvedValueOnce(
      new Response("<html>login</html>", {
        headers: { "Content-Type": "text/html" },
      }),
    );

    await expect(
      enrollLeadNurture(bindings, {
        email: "lead@example.com",
        magnetSlug: "grant-compliance-checklist",
      }),
    ).rejects.toThrow(/Sequencer contact upsert returned a non-JSON response/);
  });

  it("does not follow redirects so a Cloudflare Access challenge is surfaced as a failure", async () => {
    fetchMock.mockReset().mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: {
          Location: "https://ventoralabs.cloudflareaccess.com/cdn-cgi/access/login/sequencer",
        },
      }),
    );

    await expect(
      enrollLeadNurture(bindings, {
        email: "lead@example.com",
        magnetSlug: "grant-compliance-checklist",
      }),
    ).rejects.toThrow(/Cloudflare Access/);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://sequencer.example.com/api/v1/contacts",
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("surfaces a redirect with no Location header as a Cloudflare Access failure", async () => {
    fetchMock.mockReset().mockResolvedValueOnce(new Response(null, { status: 303 }));

    await expect(
      enrollLeadNurture(bindings, {
        email: "lead@example.com",
        magnetSlug: "grant-compliance-checklist",
      }),
    ).rejects.toThrow(/was redirected \(303\) to ""/);
  });

  it("reports unknown content-type when a non-JSON body has no Content-Type header", async () => {
    // A binary body sets no Content-Type header, exercising the "unknown" fallback.
    fetchMock.mockReset().mockResolvedValueOnce(new Response(new Uint8Array([0xff, 0xfe, 0x00])));

    await expect(
      enrollLeadNurture(bindings, {
        email: "lead@example.com",
        magnetSlug: "grant-compliance-checklist",
      }),
    ).rejects.toThrow(/content-type unknown/);
  });

  it("throws when Sequencer unsubscribe returns an error", async () => {
    fetchMock.mockReset().mockResolvedValueOnce(new Response("bad", { status: 502 }));

    await expect(unsubscribeLeadNurture(bindings, { email: "lead@example.com" })).rejects.toThrow(
      "Sequencer unsubscribe failed with 502: bad",
    );
  });
});
