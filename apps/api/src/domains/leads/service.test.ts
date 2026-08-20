import { beforeEach, describe, expect, it, vi } from "vitest";
import { upsertLead, unsubscribeLead } from "./service";
import type { Bindings } from "../../types";
import type { MarketingLead, MarketingStore } from "./marketing-store";

const { mockCaptureBackgroundException, mockRequestEmailResend, mockDeliveryStore } = vi.hoisted(
  () => ({
    mockCaptureBackgroundException: vi.fn(),
    mockRequestEmailResend: vi.fn().mockResolvedValue("opened"),
    mockDeliveryStore: { kind: "delivery-store", requestEmailResend: vi.fn() },
  }),
);
vi.mock("../../lib/sentry", () => ({
  captureBackgroundException: mockCaptureBackgroundException,
}));

vi.mock("./emails", () => ({
  sendNurtureEmail: vi.fn(),
  verifyUnsubscribeToken: vi.fn(),
  buildDownloadUrl: vi
    .fn()
    .mockResolvedValue("http://localhost:3050/api/public/downloads/fake-token"),
}));

vi.mock("./sequencer", () => ({
  enrollLeadNurture: vi.fn(),
  isSequencerConfigured: vi.fn(() => true),
  unsubscribeLeadNurture: vi.fn(),
}));

vi.mock("./delivery.service", () => ({
  createD1LeadDeliveryStore: vi.fn(() => ({
    ...mockDeliveryStore,
    requestEmailResend: mockRequestEmailResend,
  })),
  dispatchLeadDelivery: vi.fn(() => Promise.resolve()),
}));

import { sendNurtureEmail, verifyUnsubscribeToken, buildDownloadUrl } from "./emails";
import { enrollLeadNurture, isSequencerConfigured, unsubscribeLeadNurture } from "./sequencer";
import { createD1LeadDeliveryStore, dispatchLeadDelivery } from "./delivery.service";

const bindings: Bindings = {
  DATABASE_URL: "postgres://test",
  BETTER_AUTH_SECRET: "auth",
  GOOGLE_CLIENT_ID: "g",
  GOOGLE_CLIENT_SECRET: "g",
  APP_URL: "http://localhost:3050",
  MARKETING_URL: "http://localhost:4321",
  RESEND_API_KEY: "re_test",
  LEAD_UNSUBSCRIBE_SECRET: "unsub",
  MARKETING_DB: {} as D1Database,
};

function lead(overrides: Partial<MarketingLead> = {}): MarketingLead {
  const now = new Date("2026-04-27T00:00:00.000Z");
  return {
    id: "lead-1",
    email: "lead@example.com",
    firstName: null,
    sourcePage: null,
    firstMagnetSlug: null,
    utm: null,
    consentAt: now,
    unsubscribedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeStore(
  options: {
    existingLead?: MarketingLead | null;
    downloadInserted?: boolean;
  } = {},
) {
  const createdLead = lead({ id: "lead-new", email: "new@example.com" });
  const store: MarketingStore = {
    findLeadByEmail: vi.fn(async () => options.existingLead ?? null),
    findLeadById: vi.fn(async () => options.existingLead ?? null),
    createLead: vi.fn(async () => ({ lead: createdLead, created: true })),
    updateLeadTimestamp: vi.fn(async () => undefined),
    markLeadUnsubscribed: vi.fn(async () => undefined),
    insertDownload: vi.fn(async () => options.downloadInserted ?? true),
    findDownloadId: vi.fn(async () => "download-existing"),
  };
  return store;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(enrollLeadNurture).mockResolvedValue(undefined);
  vi.mocked(isSequencerConfigured).mockReturnValue(true);
  vi.mocked(unsubscribeLeadNurture).mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mockRequestEmailResend.mockResolvedValue("opened");
});

describe("upsertLead", () => {
  it("continues a raced first signup against the canonical lead and records its magnet", async () => {
    const canonical = lead({ id: "lead-winner", email: "new@example.com" });
    const store = makeStore();
    vi.mocked(store.createLead).mockResolvedValue({ lead: canonical, created: false });

    const result = await upsertLead(
      store,
      { ...bindings, MARKETING_DB: { prepare: vi.fn() } as never },
      {
        email: "new@example.com",
        magnetSlug: "donor-retention-playbook",
      },
    );

    expect(store.insertDownload).toHaveBeenCalledWith(
      expect.any(String),
      canonical.id,
      "donor-retention-playbook",
      expect.any(Date),
      null,
    );
    expect(result).toMatchObject({ lead: canonical, alreadySubscribed: true });
    expect(dispatchLeadDelivery).toHaveBeenCalledOnce();
  });

  it("suppresses a raced first signup when the canonical lead withdrew consent", async () => {
    const canonical = lead({
      id: "lead-winner",
      email: "new@example.com",
      unsubscribedAt: new Date("2026-07-11T12:00:00.000Z"),
    });
    const store = makeStore();
    vi.mocked(store.createLead).mockResolvedValue({ lead: canonical, created: false });

    const result = await upsertLead(store, bindings, {
      email: "new@example.com",
      magnetSlug: "donor-retention-playbook",
    });

    expect(result).toEqual({
      lead: canonical,
      alreadySubscribed: true,
      deliveryState: "unsubscribed",
    });
    expect(store.insertDownload).not.toHaveBeenCalled();
    expect(dispatchLeadDelivery).not.toHaveBeenCalled();
  });

  it("recovers an existing pending download through deferred durable dispatch", async () => {
    const existing = lead();
    const store = makeStore({ existingLead: existing, downloadInserted: false });
    const defer = vi.fn();
    const durableBindings = {
      ...bindings,
      MARKETING_DB: { prepare: vi.fn() } as never,
    };

    await upsertLead(
      store,
      durableBindings,
      { email: existing.email, magnetSlug: "grant-compliance-checklist" },
      defer,
    );

    expect(createD1LeadDeliveryStore).toHaveBeenCalledWith(durableBindings.MARKETING_DB);
    expect(dispatchLeadDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "delivery-store" }),
      durableBindings,
      "download-existing",
    );
    expect(defer).toHaveBeenCalledWith(expect.any(Promise));
    expect(sendNurtureEmail).not.toHaveBeenCalled();
  });

  it("opens a new durable email attempt before dispatching an explicit resend", async () => {
    const existing = lead();
    const store = makeStore({ existingLead: existing, downloadInserted: false });
    const defer = vi.fn();
    const durableBindings = {
      ...bindings,
      MARKETING_DB: { prepare: vi.fn() } as never,
    };

    await upsertLead(
      store,
      durableBindings,
      {
        email: existing.email,
        magnetSlug: "grant-compliance-checklist",
        resendDelivery: true,
      },
      defer,
    );

    expect(mockRequestEmailResend).toHaveBeenCalledWith("download-existing");
    expect(dispatchLeadDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ requestEmailResend: mockRequestEmailResend }),
      durableBindings,
      "download-existing",
      { emailOnly: true },
    );
  });

  it("treats resendDelivery on a newly inserted magnet as its initial full delivery", async () => {
    const existing = lead();
    const store = makeStore({ existingLead: existing, downloadInserted: true });
    const defer = vi.fn();
    const durableBindings = {
      ...bindings,
      MARKETING_DB: { prepare: vi.fn() } as never,
    };

    const result = await upsertLead(
      store,
      durableBindings,
      {
        email: existing.email,
        magnetSlug: "donor-retention-playbook",
        resendDelivery: true,
      },
      defer,
    );

    expect(mockRequestEmailResend).not.toHaveBeenCalled();
    expect(dispatchLeadDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ requestEmailResend: mockRequestEmailResend }),
      durableBindings,
      expect.any(String),
    );
    expect(result.deliveryState).toBe("queued");
  });

  it("truthfully suppresses an explicit resend when the durable row cannot safely rotate", async () => {
    const existing = lead();
    const store = makeStore({ existingLead: existing, downloadInserted: false });
    const defer = vi.fn();
    const durableBindings = {
      ...bindings,
      MARKETING_DB: { prepare: vi.fn() } as never,
    };
    mockRequestEmailResend.mockResolvedValueOnce("in_progress");

    const result = await upsertLead(
      store,
      durableBindings,
      {
        email: existing.email,
        magnetSlug: "grant-compliance-checklist",
        resendDelivery: true,
      },
      defer,
    );

    expect(result).toEqual({
      lead: existing,
      alreadySubscribed: true,
      deliveryState: "in_progress",
    });
    expect(dispatchLeadDelivery).not.toHaveBeenCalled();
    expect(defer).not.toHaveBeenCalled();
  });

  it("reports an ambiguous durable resend without claiming it was sent", async () => {
    const existing = lead();
    const store = makeStore({ existingLead: existing, downloadInserted: false });
    mockRequestEmailResend.mockResolvedValueOnce("ambiguous");

    const result = await upsertLead(
      store,
      { ...bindings, MARKETING_DB: { prepare: vi.fn() } as never },
      {
        email: existing.email,
        magnetSlug: "grant-compliance-checklist",
        resendDelivery: true,
      },
      vi.fn(),
    );

    expect(result.deliveryState).toBe("ambiguous");
    expect(dispatchLeadDelivery).not.toHaveBeenCalled();
  });

  it("reports a quarantined resend separately from an unsubscribed address", async () => {
    const existing = lead();
    const store = makeStore({ existingLead: existing, downloadInserted: false });
    mockRequestEmailResend.mockResolvedValueOnce("unavailable");

    const result = await upsertLead(
      store,
      { ...bindings, MARKETING_DB: { prepare: vi.fn() } as never },
      {
        email: existing.email,
        magnetSlug: "grant-compliance-checklist",
        resendDelivery: true,
      },
    );

    expect(result.deliveryState).toBe("resend_unavailable");
  });

  it("awaits durable recovery when no execution context defer hook is available", async () => {
    const existing = lead();
    const store = makeStore({ existingLead: existing, downloadInserted: false });
    const durableBindings = { ...bindings, MARKETING_DB: { prepare: vi.fn() } as never };

    await upsertLead(store, durableBindings, {
      email: existing.email,
      magnetSlug: "grant-compliance-checklist",
    });

    expect(dispatchLeadDelivery).toHaveBeenCalledWith(
      expect.anything(),
      durableBindings,
      "download-existing",
    );
  });

  it("dispatches a new lead's durable delivery before returning without a defer hook", async () => {
    const store = makeStore();
    const durableBindings = { ...bindings, MARKETING_DB: { prepare: vi.fn() } as never };

    const result = await upsertLead(store, durableBindings, {
      email: "new@example.com",
      magnetSlug: "grant-compliance-checklist",
    });

    expect(result.alreadySubscribed).toBe(false);
    expect(result.deliveryState).toBe("queued");
    expect(dispatchLeadDelivery).toHaveBeenCalledWith(
      expect.anything(),
      durableBindings,
      expect.any(String),
    );
  });

  it("creates a new lead, records download, sends delivery, and enrolls Sequencer nurture", async () => {
    const store = makeStore();
    vi.mocked(sendNurtureEmail).mockResolvedValueOnce(undefined);

    const result = await upsertLead(store, bindings, {
      email: "new@example.com",
      firstName: "Jane",
      magnetSlug: "grant-compliance-checklist",
      sourcePage: "/resources/x",
      resendDelivery: false,
      utm: { utmSource: "google" },
    });

    expect(result.alreadySubscribed).toBe(false);
    expect(store.createLead).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new@example.com",
        firstName: "Jane",
        firstMagnetSlug: "grant-compliance-checklist",
        utm: { utmSource: "google" },
      }),
    );
    expect(store.insertDownload).toHaveBeenCalledWith(
      expect.any(String),
      "lead-new",
      "grant-compliance-checklist",
      expect.any(Date),
      "/resources/x",
    );
    expect(sendNurtureEmail).toHaveBeenCalledWith(
      bindings,
      expect.objectContaining({
        leadId: "lead-new",
        step: 0,
        magnetSlug: "grant-compliance-checklist",
        downloadUrl: "http://localhost:3050/api/public/downloads/fake-token",
      }),
    );
    expect(enrollLeadNurture).toHaveBeenCalledWith(bindings, {
      email: "new@example.com",
      firstName: null,
      magnetSlug: "grant-compliance-checklist",
      sourcePage: "/resources/x",
    });
    expect(result.deliveryState).toBe("sent");
  });

  it("does not schedule or send when a new lead has no magnet slug", async () => {
    const store = makeStore();

    await upsertLead(store, bindings, { email: "new@example.com", resendDelivery: false });

    expect(store.createLead).toHaveBeenCalled();
    expect(store.insertDownload).not.toHaveBeenCalled();
    expect(buildDownloadUrl).not.toHaveBeenCalled();
    expect(sendNurtureEmail).not.toHaveBeenCalled();
  });

  it("swallows step-0 delivery failures without enrolling Sequencer nurture", async () => {
    const store = makeStore();
    vi.mocked(sendNurtureEmail).mockRejectedValueOnce(new Error("send failed"));

    const result = await upsertLead(store, bindings, {
      email: "new@example.com",
      magnetSlug: "grant-compliance-checklist",
      resendDelivery: false,
    });

    expect(result.alreadySubscribed).toBe(false);
    expect(enrollLeadNurture).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      "[leads] step-0 delivery failed",
      expect.objectContaining({ leadId: "lead-new", error: "send failed" }),
    );
  });

  it("logs non-Error step-0 delivery failures for new leads", async () => {
    const store = makeStore();
    vi.mocked(sendNurtureEmail).mockRejectedValueOnce("send failed");

    await upsertLead(store, bindings, {
      email: "new@example.com",
      magnetSlug: "grant-compliance-checklist",
      resendDelivery: false,
    });

    expect(console.error).toHaveBeenCalledWith(
      "[leads] step-0 delivery failed",
      expect.objectContaining({ leadId: "lead-new", error: "send failed" }),
    );
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith("send failed", "leads", {
      step: "step-0-email",
    });
  });

  it("logs non-Error step-0 delivery failures for existing leads", async () => {
    const existing = lead();
    const store = makeStore({ existingLead: existing });
    vi.mocked(sendNurtureEmail).mockRejectedValueOnce("send failed");

    await upsertLead(store, bindings, {
      email: existing.email,
      magnetSlug: "donor-retention-playbook",
      resendDelivery: false,
    });

    expect(console.error).toHaveBeenCalledWith(
      "[leads] step-0 delivery failed for existing lead",
      expect.objectContaining({
        leadId: existing.id,
        magnetSlug: "donor-retention-playbook",
        error: "send failed",
      }),
    );
  });

  it("surfaces missing Resend configuration for new lead delivery", async () => {
    const store = makeStore();
    vi.mocked(sendNurtureEmail).mockRejectedValueOnce(
      new Error("RESEND_API_KEY is required for nurture email delivery"),
    );

    await expect(
      upsertLead(store, bindings, {
        email: "new@example.com",
        magnetSlug: "grant-compliance-checklist",
        resendDelivery: false,
      }),
    ).rejects.toThrow(/RESEND_API_KEY is required/);
  });

  it("returns unsubscribed true without side effects for an unsubscribed existing lead", async () => {
    const existing = lead({ unsubscribedAt: new Date("2026-04-26T00:00:00.000Z") });
    const store = makeStore({ existingLead: existing });

    const result = await upsertLead(store, bindings, {
      email: existing.email,
      magnetSlug: "grant-compliance-checklist",
      resendDelivery: false,
    });

    expect(result).toEqual({
      lead: existing,
      alreadySubscribed: true,
      deliveryState: "unsubscribed",
    });
    expect(store.insertDownload).not.toHaveBeenCalled();
    expect(store.updateLeadTimestamp).not.toHaveBeenCalled();
    expect(buildDownloadUrl).not.toHaveBeenCalled();
    expect(sendNurtureEmail).not.toHaveBeenCalled();
  });

  it("records a download and updates timestamp for an existing subscribed lead", async () => {
    const existing = lead();
    const store = makeStore({ existingLead: existing, downloadInserted: false });

    await upsertLead(store, bindings, {
      email: existing.email,
      magnetSlug: "grant-compliance-checklist",
      resendDelivery: false,
    });

    expect(store.insertDownload).toHaveBeenCalledWith(
      expect.any(String),
      existing.id,
      "grant-compliance-checklist",
      expect.any(Date),
      null,
    );
    expect(store.updateLeadTimestamp).toHaveBeenCalledWith(existing.id, expect.any(Date));
    expect(sendNurtureEmail).not.toHaveBeenCalled();
    expect(enrollLeadNurture).not.toHaveBeenCalled();
  });

  it("does not send a delivery email when the download row already existed (atomic insert guard)", async () => {
    // Models a concurrent double-submit: the pre-insert read saw no row, but the
    // INSERT OR IGNORE found one already present and inserted nothing. Delivery
    // must be gated on the atomic insert result, not the earlier read, so the
    // second concurrent request does not fire a duplicate delivery email.
    const existing = lead();
    const store = makeStore({
      existingLead: existing,
      downloadInserted: false,
    });

    await upsertLead(store, bindings, {
      email: existing.email,
      magnetSlug: "grant-compliance-checklist",
      resendDelivery: false,
    });

    expect(store.insertDownload).toHaveBeenCalled();
    expect(sendNurtureEmail).not.toHaveBeenCalled();
    expect(enrollLeadNurture).not.toHaveBeenCalled();
    expect(store.updateLeadTimestamp).toHaveBeenCalledWith(existing.id, expect.any(Date));
  });

  it("resends an existing magnet only when resendDelivery is requested", async () => {
    const existing = lead({ firstName: "A" });
    const store = makeStore({ existingLead: existing, downloadInserted: false });

    await upsertLead(store, bindings, {
      email: existing.email,
      magnetSlug: "grant-compliance-checklist",
      resendDelivery: true,
    });

    expect(sendNurtureEmail).toHaveBeenCalledWith(bindings, {
      leadId: existing.id,
      email: existing.email,
      firstName: "A",
      step: 0,
      magnetSlug: "grant-compliance-checklist",
      downloadUrl: "http://localhost:3050/api/public/downloads/fake-token",
    });
  });

  it("enrolls an existing lead for a new magnet in Sequencer", async () => {
    const existing = lead();
    const store = makeStore({ existingLead: existing });
    vi.mocked(sendNurtureEmail).mockResolvedValueOnce(undefined);

    await upsertLead(store, bindings, {
      email: existing.email,
      magnetSlug: "donor-retention-playbook",
      resendDelivery: false,
    });

    expect(enrollLeadNurture).toHaveBeenCalledWith(bindings, {
      email: existing.email,
      firstName: existing.firstName,
      magnetSlug: "donor-retention-playbook",
      sourcePage: null,
    });
  });

  it("logs and skips central nurture enrollment when Sequencer is not configured", async () => {
    const store = makeStore();
    vi.mocked(sendNurtureEmail).mockResolvedValueOnce(undefined);
    vi.mocked(isSequencerConfigured).mockReturnValueOnce(false);

    await upsertLead(store, bindings, {
      email: "new@example.com",
      magnetSlug: "grant-compliance-checklist",
      resendDelivery: false,
    });

    expect(enrollLeadNurture).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      "[leads] sequencer not configured; skipping central nurture enrollment",
      expect.objectContaining({
        magnetSlug: "grant-compliance-checklist",
      }),
    );
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("new@example.com");
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(expect.any(Error), "leads", {
      step: "sequencer-config-missing",
    });
  });

  it("does not fail signup when Sequencer enrollment rejects", async () => {
    const store = makeStore();
    vi.mocked(sendNurtureEmail).mockResolvedValueOnce(undefined);
    vi.mocked(enrollLeadNurture).mockRejectedValueOnce(new Error("sequencer down"));

    const result = await upsertLead(store, bindings, {
      email: "new@example.com",
      magnetSlug: "grant-compliance-checklist",
      resendDelivery: false,
    });

    expect(result.alreadySubscribed).toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      "[leads] sequencer enrollment failed",
      expect.objectContaining({
        magnetSlug: "grant-compliance-checklist",
        error: "sequencer down",
      }),
    );
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("new@example.com");
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(expect.any(Error), "leads", {
      step: "sequencer-enroll",
    });
  });

  it("logs non-Error Sequencer enrollment failures", async () => {
    const store = makeStore();
    vi.mocked(sendNurtureEmail).mockResolvedValueOnce(undefined);
    vi.mocked(enrollLeadNurture).mockRejectedValueOnce("sequencer down");

    await upsertLead(store, bindings, {
      email: "new@example.com",
      magnetSlug: "grant-compliance-checklist",
      resendDelivery: false,
    });

    expect(console.error).toHaveBeenCalledWith(
      "[leads] sequencer enrollment failed",
      expect.objectContaining({
        magnetSlug: "grant-compliance-checklist",
        error: "sequencer down",
      }),
    );
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("new@example.com");
  });

  it("swallows existing-lead step-0 delivery failures for a new magnet", async () => {
    const existing = lead();
    const store = makeStore({ existingLead: existing });
    vi.mocked(sendNurtureEmail).mockRejectedValueOnce(new Error("send failed"));

    await upsertLead(store, bindings, {
      email: existing.email,
      magnetSlug: "donor-retention-playbook",
      resendDelivery: false,
    });

    expect(enrollLeadNurture).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      "[leads] step-0 delivery failed for existing lead",
      expect.objectContaining({
        leadId: existing.id,
        magnetSlug: "donor-retention-playbook",
        error: "send failed",
      }),
    );
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(expect.any(Error), "leads", {
      step: "step-0-email",
    });
  });

  it("surfaces missing Resend configuration for existing-lead new-magnet delivery", async () => {
    const existing = lead();
    const store = makeStore({ existingLead: existing });
    vi.mocked(sendNurtureEmail).mockRejectedValueOnce(
      new Error("RESEND_API_KEY is required for nurture email delivery"),
    );

    await expect(
      upsertLead(store, bindings, {
        email: existing.email,
        magnetSlug: "donor-retention-playbook",
        resendDelivery: false,
      }),
    ).rejects.toThrow(/RESEND_API_KEY is required/);
  });

  it("swallows existing-lead resend failures", async () => {
    const existing = lead();
    const store = makeStore({ existingLead: existing, downloadInserted: false });
    vi.mocked(sendNurtureEmail).mockRejectedValueOnce(new Error("resend failed"));

    await upsertLead(store, bindings, {
      email: existing.email,
      magnetSlug: "grant-compliance-checklist",
      resendDelivery: true,
    });

    expect(console.error).toHaveBeenCalledWith(
      "[leads] step-0 resend failed for existing lead",
      expect.objectContaining({
        leadId: existing.id,
        magnetSlug: "grant-compliance-checklist",
        error: "resend failed",
      }),
    );
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(expect.any(Error), "leads", {
      step: "step-0-email",
    });
  });

  it("logs non-Error existing-lead resend failures", async () => {
    const existing = lead();
    const store = makeStore({ existingLead: existing, downloadInserted: false });
    vi.mocked(sendNurtureEmail).mockRejectedValueOnce("resend failed");

    await upsertLead(store, bindings, {
      email: existing.email,
      magnetSlug: "grant-compliance-checklist",
      resendDelivery: true,
    });

    expect(console.error).toHaveBeenCalledWith(
      "[leads] step-0 resend failed for existing lead",
      expect.objectContaining({
        leadId: existing.id,
        magnetSlug: "grant-compliance-checklist",
        error: "resend failed",
      }),
    );
  });

  it("surfaces missing Resend configuration for existing-lead resend", async () => {
    const existing = lead();
    const store = makeStore({ existingLead: existing, downloadInserted: false });
    vi.mocked(sendNurtureEmail).mockRejectedValueOnce(
      new Error("RESEND_API_KEY is required for nurture email delivery"),
    );

    await expect(
      upsertLead(store, bindings, {
        email: existing.email,
        magnetSlug: "grant-compliance-checklist",
        resendDelivery: true,
      }),
    ).rejects.toThrow(/RESEND_API_KEY is required/);
  });

  it("does not resend when resendDelivery is true but no magnet slug is provided", async () => {
    const existing = lead();
    const store = makeStore({ existingLead: existing });

    await upsertLead(store, bindings, {
      email: existing.email,
      resendDelivery: true,
    });

    expect(sendNurtureEmail).not.toHaveBeenCalled();
  });
});

describe("unsubscribeLead", () => {
  it("returns ok:false on invalid token", async () => {
    const store = makeStore();
    vi.mocked(verifyUnsubscribeToken).mockResolvedValueOnce(null);

    await expect(unsubscribeLead(store, "bad", "secret")).resolves.toEqual({ ok: false });
    expect(store.findLeadById).not.toHaveBeenCalled();
  });

  it("returns ok:true when lead is missing or already unsubscribed", async () => {
    const store = makeStore({ existingLead: null });
    vi.mocked(verifyUnsubscribeToken).mockResolvedValue("lead-missing");
    await expect(unsubscribeLead(store, "token", "secret")).resolves.toEqual({ ok: true });
    expect(store.markLeadUnsubscribed).not.toHaveBeenCalled();

    vi.mocked(store.findLeadById).mockResolvedValueOnce(
      lead({ unsubscribedAt: new Date("2026-04-26T00:00:00.000Z") }),
    );
    await expect(unsubscribeLead(store, "token", "secret")).resolves.toEqual({ ok: true });
    expect(store.markLeadUnsubscribed).not.toHaveBeenCalled();
  });

  it("marks subscribed leads unsubscribed", async () => {
    const store = makeStore();
    vi.mocked(verifyUnsubscribeToken).mockResolvedValueOnce("lead-1");
    vi.mocked(store.findLeadById).mockResolvedValueOnce(lead({ id: "lead-1" }));

    await expect(unsubscribeLead(store, "token", "secret", bindings)).resolves.toEqual({
      ok: true,
    });

    expect(store.markLeadUnsubscribed).toHaveBeenCalledWith("lead-1", expect.any(Date));
    expect(unsubscribeLeadNurture).toHaveBeenCalledWith(bindings, { email: "lead@example.com" });
  });

  it("logs and keeps unsubscribe idempotent when Sequencer unsubscribe rejects", async () => {
    const store = makeStore();
    vi.mocked(verifyUnsubscribeToken).mockResolvedValueOnce("lead-1");
    vi.mocked(store.findLeadById).mockResolvedValueOnce(lead({ id: "lead-1" }));
    vi.mocked(unsubscribeLeadNurture).mockRejectedValueOnce(new Error("sequencer unavailable"));

    await expect(unsubscribeLead(store, "token", "secret", bindings)).resolves.toEqual({
      ok: true,
    });

    expect(store.markLeadUnsubscribed).toHaveBeenCalledWith("lead-1", expect.any(Date));
    expect(console.error).toHaveBeenCalledWith(
      "[leads] sequencer unsubscribe failed",
      expect.objectContaining({ leadId: "lead-1", error: "sequencer unavailable" }),
    );
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(expect.any(Error), "leads", {
      step: "sequencer-unsubscribe",
    });
  });

  it("logs non-Error Sequencer unsubscribe failures", async () => {
    const store = makeStore();
    vi.mocked(verifyUnsubscribeToken).mockResolvedValueOnce("lead-1");
    vi.mocked(store.findLeadById).mockResolvedValueOnce(lead({ id: "lead-1" }));
    vi.mocked(unsubscribeLeadNurture).mockRejectedValueOnce("sequencer unavailable");

    await expect(unsubscribeLead(store, "token", "secret", bindings)).resolves.toEqual({
      ok: true,
    });

    expect(console.error).toHaveBeenCalledWith(
      "[leads] sequencer unsubscribe failed",
      expect.objectContaining({ leadId: "lead-1", error: "sequencer unavailable" }),
    );
  });
});
