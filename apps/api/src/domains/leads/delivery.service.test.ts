import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureBackgroundException } from "../../lib/sentry";
import {
  createD1LeadDeliveryStore,
  dispatchLeadDelivery,
  redispatchPendingLeadDeliveries,
  type LeadDeliveryStore,
} from "./delivery.service";
import {
  buildDownloadUrl,
  createNurtureEmailRequestFingerprint,
  isNurtureEmailConfigured,
  NurtureEmailConfigurationError,
  sendNurtureEmail,
} from "./emails";
import {
  createLeadNurtureRequestFingerprint,
  createLeadNurtureEnrollmentRequestFingerprint,
  enrollLeadNurtureContact,
  isSequencerConfigured,
  SequencerResponseError,
  unsubscribeLeadNurture,
  upsertLeadNurtureContact,
} from "./sequencer";

vi.mock("./emails", () => ({
  NurtureEmailConfigurationError: class NurtureEmailConfigurationError extends Error {},
  sendNurtureEmail: vi.fn(),
  buildDownloadUrl: vi.fn().mockResolvedValue("https://app.test/download"),
  createNurtureEmailRequestFingerprint: vi.fn().mockResolvedValue("email-request-v1"),
  isNurtureEmailConfigured: vi.fn(() => true),
}));
vi.mock("./sequencer", () => ({
  SequencerConfigurationError: class SequencerConfigurationError extends Error {},
  SequencerResponseError: class SequencerResponseError extends Error {
    constructor(
      public readonly status: number,
      message: string,
    ) {
      super(message);
    }
  },
  isSequencerConfigured: vi.fn(() => true),
  createLeadNurtureRequestFingerprint: vi.fn().mockResolvedValue("sequencer-request-v1"),
  createLeadNurtureEnrollmentRequestFingerprint: vi
    .fn()
    .mockResolvedValue("sequencer-enrollment-v1"),
  upsertLeadNurtureContact: vi.fn().mockResolvedValue("contact-1"),
  enrollLeadNurtureContact: vi.fn(),
  unsubscribeLeadNurture: vi.fn(),
}));
vi.mock("../../lib/sentry", () => ({ captureBackgroundException: vi.fn() }));

const intent = {
  downloadId: "download-1",
  leadId: "lead-1",
  email: "lead@example.com",
  firstName: "Lead",
  magnetSlug: "grant-compliance-checklist",
  sourcePage: "/guide",
  emailAttempt: 1,
  emailAttemptStartedAt: "2026-07-11T12:00:00.000Z",
  emailClaimedAt: "2026-07-11T12:01:00.000Z",
  sequencerAttempt: 1,
  sequencerClaimedAt: "2026-07-11T12:02:00.000Z",
  emailOnly: false,
  emailPending: true,
  sequencerPending: true,
  emailRequestFingerprint: null,
  sequencerRequestFingerprint: null,
  sequencerContactId: null,
  sequencerEnrollmentRequestFingerprint: null,
};

function store(): LeadDeliveryStore {
  return {
    claim: vi.fn().mockResolvedValue(intent),
    isEligible: vi.fn().mockResolvedValue(true),
    suppress: vi.fn(),
    authorizeEmailSend: vi.fn().mockResolvedValue(intent.emailAttemptStartedAt),
    markEmailSent: vi.fn().mockResolvedValue(true),
    markEmailUnavailable: vi.fn(),
    markEmailRetryable: vi.fn(),
    markEmailAmbiguous: vi.fn(),
    markEmailQuarantined: vi.fn(),
    saveEmailRequestFingerprint: vi.fn().mockResolvedValue(true),
    requestEmailResend: vi.fn().mockResolvedValue("opened"),
    authorizeSequencerSend: vi.fn().mockResolvedValue(intent.emailAttemptStartedAt),
    confirmSequencerSend: vi.fn().mockResolvedValue(true),
    markSequencerSent: vi.fn().mockResolvedValue(true),
    markSequencerUnavailable: vi.fn(),
    markSequencerRetryable: vi.fn(),
    markSequencerAmbiguous: vi.fn(),
    markSequencerQuarantined: vi.fn(),
    saveSequencerRequestFingerprint: vi.fn().mockResolvedValue(true),
    saveSequencerEnrollmentRequest: vi.fn().mockResolvedValue(true),
  };
}

describe("lead magnet durable fulfillment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isNurtureEmailConfigured).mockReturnValue(true);
    vi.mocked(isSequencerConfigured).mockReturnValue(true);
    vi.mocked(createNurtureEmailRequestFingerprint).mockResolvedValue("email-request-v1");
    vi.mocked(createLeadNurtureRequestFingerprint).mockResolvedValue("sequencer-request-v1");
    vi.mocked(createLeadNurtureEnrollmentRequestFingerprint).mockResolvedValue(
      "sequencer-enrollment-v1",
    );
    vi.mocked(upsertLeadNurtureContact).mockResolvedValue("contact-1");
    vi.mocked(enrollLeadNurtureContact).mockResolvedValue(undefined);
    vi.mocked(unsubscribeLeadNurture).mockResolvedValue(undefined);
  });

  it("persists the exact Sequencer enrollment request before its first provider call", async () => {
    const deliveryStore = store();

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(deliveryStore.saveSequencerEnrollmentRequest).toHaveBeenCalledWith(
      "download-1",
      1,
      intent.sequencerClaimedAt,
      "contact-1",
      "sequencer-enrollment-v1",
    );
    expect(
      vi.mocked(deliveryStore.saveSequencerEnrollmentRequest).mock.invocationCallOrder[0]!,
    ).toBeLessThan(vi.mocked(enrollLeadNurtureContact).mock.invocationCallOrder[0]!);
  });

  it("retries an ambiguous Sequencer enrollment with its persisted contact and exact request", async () => {
    const deliveryStore = store();
    vi.mocked(deliveryStore.claim).mockResolvedValue({
      ...intent,
      emailPending: false,
      sequencerRequestFingerprint: "sequencer-request-v1",
      sequencerContactId: "contact-1",
      sequencerEnrollmentRequestFingerprint: "sequencer-enrollment-v1",
    });

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(upsertLeadNurtureContact).not.toHaveBeenCalled();
    expect(enrollLeadNurtureContact).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ idempotencyKey: "lead-magnet/download-1/1" }),
      "contact-1",
    );
  });

  it("quarantines a drifted Sequencer enrollment without exposing the contact or lead", async () => {
    const deliveryStore = store();
    vi.mocked(deliveryStore.claim).mockResolvedValue({
      ...intent,
      emailPending: false,
      sequencerRequestFingerprint: "sequencer-request-v1",
      sequencerContactId: "contact-1",
      sequencerEnrollmentRequestFingerprint: "sequencer-enrollment-original",
    });
    vi.mocked(createLeadNurtureEnrollmentRequestFingerprint).mockResolvedValue(
      "sequencer-enrollment-drifted",
    );

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(enrollLeadNurtureContact).not.toHaveBeenCalled();
    expect(deliveryStore.markSequencerQuarantined).toHaveBeenCalledWith(
      "download-1",
      1,
      intent.sequencerClaimedAt,
      "Lead Sequencer enrollment request changed before retry",
    );
    expect(captureBackgroundException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Lead Sequencer enrollment request changed before retry",
      }),
      "leads",
      { step: "lead-magnet-sequencer-enrollment-drift" },
    );
    const sentryPayload = JSON.stringify(vi.mocked(captureBackgroundException).mock.calls);
    expect(sentryPayload).not.toContain("contact-1");
    expect(sentryPayload).not.toContain("lead@example.com");
  });

  it("quarantines when the exact Sequencer enrollment request is not durably persisted", async () => {
    const deliveryStore = store();
    vi.mocked(deliveryStore.claim).mockResolvedValue({
      ...intent,
      emailPending: false,
      sequencerRequestFingerprint: "sequencer-request-v1",
    });
    vi.mocked(deliveryStore.saveSequencerEnrollmentRequest).mockResolvedValue(false);

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(enrollLeadNurtureContact).not.toHaveBeenCalled();
    expect(deliveryStore.markSequencerQuarantined).toHaveBeenCalledWith(
      "download-1",
      1,
      intent.sequencerClaimedAt,
      "Lead Sequencer enrollment request could not be persisted",
    );
    expect(captureBackgroundException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Lead Sequencer enrollment request could not be persisted",
      }),
      "leads",
      { step: "lead-magnet-sequencer-enrollment-persistence" },
    );
  });

  it("persists both exact request fingerprints before the first provider calls", async () => {
    const deliveryStore = store();

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(deliveryStore.saveEmailRequestFingerprint).toHaveBeenCalledWith(
      "download-1",
      1,
      intent.emailClaimedAt,
      "email-request-v1",
    );
    expect(deliveryStore.saveSequencerRequestFingerprint).toHaveBeenCalledWith(
      "download-1",
      1,
      intent.sequencerClaimedAt,
      "sequencer-request-v1",
    );
    expect(
      vi.mocked(deliveryStore.saveEmailRequestFingerprint).mock.invocationCallOrder[0]!,
    ).toBeLessThan(vi.mocked(sendNurtureEmail).mock.invocationCallOrder[0]!);
    expect(
      vi.mocked(deliveryStore.saveSequencerRequestFingerprint).mock.invocationCallOrder[0]!,
    ).toBeLessThan(vi.mocked(enrollLeadNurtureContact).mock.invocationCallOrder[0]!);
  });

  it("quarantines an ambiguous email retry when profile, template, or env drift changes the request", async () => {
    const deliveryStore = store();
    vi.mocked(deliveryStore.claim).mockResolvedValue({
      ...intent,
      emailRequestFingerprint: "email-request-original",
      sequencerPending: false,
    });
    vi.mocked(createNurtureEmailRequestFingerprint).mockResolvedValue("email-request-drifted");

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(deliveryStore.markEmailQuarantined).toHaveBeenCalledWith(
      "download-1",
      1,
      intent.emailClaimedAt,
      "Lead email request changed before retry",
    );
    expect(sendNurtureEmail).not.toHaveBeenCalled();
    expect(captureBackgroundException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Lead email request changed before retry" }),
      "leads",
      { step: "lead-magnet-email-request-drift" },
    );
    expect(JSON.stringify(vi.mocked(captureBackgroundException).mock.calls)).not.toContain(
      "lead@example.com",
    );
  });

  it("quarantines and reports a privacy-safe reason when a fingerprint write is not acknowledged", async () => {
    const deliveryStore = store();
    vi.mocked(deliveryStore.saveEmailRequestFingerprint).mockResolvedValue(false);
    vi.mocked(deliveryStore.saveSequencerRequestFingerprint).mockResolvedValue(false);

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(sendNurtureEmail).not.toHaveBeenCalled();
    expect(upsertLeadNurtureContact).not.toHaveBeenCalled();
    expect(captureBackgroundException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Lead email request fingerprint could not be persisted",
      }),
      "leads",
      { step: "lead-magnet-email-fingerprint-persistence" },
    );
    expect(captureBackgroundException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Lead Sequencer request fingerprint could not be persisted",
      }),
      "leads",
      { step: "lead-magnet-sequencer-fingerprint-persistence" },
    );
    const sentryPayload = JSON.stringify(vi.mocked(captureBackgroundException).mock.calls);
    expect(sentryPayload).not.toContain("lead@example.com");
    expect(sentryPayload).not.toContain("contact-1");
  });

  it("quarantines with a fixed Sentry reason when fingerprint persistence throws", async () => {
    const deliveryStore = store();
    vi.mocked(deliveryStore.saveEmailRequestFingerprint).mockRejectedValue(
      new Error("D1 row for lead@example.com rejected re_secret"),
    );
    vi.mocked(deliveryStore.saveSequencerRequestFingerprint).mockRejectedValue(
      new Error("D1 row for lead@example.com rejected client-secret"),
    );

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(deliveryStore.markEmailQuarantined).toHaveBeenCalled();
    expect(deliveryStore.markSequencerQuarantined).toHaveBeenCalled();
    expect(
      vi
        .mocked(captureBackgroundException)
        .mock.calls.map(([error]) => (error instanceof Error ? error.message : "")),
    ).toEqual([
      "Lead email request fingerprint could not be persisted",
      "Lead Sequencer request fingerprint could not be persisted",
    ]);
    const sentryPayload = JSON.stringify(vi.mocked(captureBackgroundException).mock.calls);
    expect(sentryPayload).not.toContain("lead@example.com");
    expect(sentryPayload).not.toContain("re_secret");
    expect(sentryPayload).not.toContain("client-secret");
  });

  it("quarantines an ambiguous Sequencer retry when profile, template, or env drift changes the request", async () => {
    const deliveryStore = store();
    vi.mocked(deliveryStore.claim).mockResolvedValue({
      ...intent,
      emailPending: false,
      sequencerRequestFingerprint: "sequencer-request-original",
    });
    vi.mocked(createLeadNurtureRequestFingerprint).mockResolvedValue("sequencer-request-drifted");

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(deliveryStore.markSequencerQuarantined).toHaveBeenCalledWith(
      "download-1",
      1,
      intent.sequencerClaimedAt,
      "Lead Sequencer request changed before retry",
    );
    expect(enrollLeadNurtureContact).not.toHaveBeenCalled();
  });

  it("retries ambiguous delivery with the identical requests and stable keys", async () => {
    const deliveryStore = store();
    vi.mocked(deliveryStore.claim).mockResolvedValue({
      ...intent,
      emailRequestFingerprint: "email-request-v1",
      sequencerRequestFingerprint: "sequencer-request-v1",
    });

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(deliveryStore.saveEmailRequestFingerprint).not.toHaveBeenCalled();
    expect(deliveryStore.saveSequencerRequestFingerprint).not.toHaveBeenCalled();
    expect(sendNurtureEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ idempotencyKey: "lead-magnet/download-1/1" }),
    );
    expect(enrollLeadNurtureContact).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ idempotencyKey: "lead-magnet/download-1/1" }),
      "contact-1",
    );
  });

  it("dispatches email and Sequencer independently with a stable email key", async () => {
    const deliveryStore = store();
    vi.mocked(sendNurtureEmail).mockResolvedValue(undefined);
    vi.mocked(enrollLeadNurtureContact).mockResolvedValue(undefined);

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(sendNurtureEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ idempotencyKey: "lead-magnet/download-1/1" }),
    );
    expect(buildDownloadUrl).toHaveBeenCalledWith(
      "lead-1",
      "grant-compliance-checklist",
      expect.anything(),
      new Date("2026-07-11T12:00:00.000Z").getTime() + 7 * 24 * 60 * 60 * 1000,
    );
    expect(deliveryStore.markEmailSent).toHaveBeenCalledWith(
      "download-1",
      1,
      intent.emailClaimedAt,
    );
    expect(deliveryStore.markSequencerSent).toHaveBeenCalledWith(
      "download-1",
      1,
      intent.sequencerClaimedAt,
    );
    expect(enrollLeadNurtureContact).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ idempotencyKey: "lead-magnet/download-1/1" }),
      "contact-1",
    );
  });

  it("suppresses both channels when the lead unsubscribed before delivery", async () => {
    const deliveryStore = store();
    vi.mocked(deliveryStore.isEligible).mockResolvedValue(false);

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(deliveryStore.suppress).toHaveBeenCalledWith("download-1");
    expect(sendNurtureEmail).not.toHaveBeenCalled();
    expect(enrollLeadNurtureContact).not.toHaveBeenCalled();
  });

  it("does not call Resend when consent is withdrawn between eligibility and send authorization", async () => {
    const deliveryStore = store();
    vi.mocked(deliveryStore.authorizeEmailSend).mockResolvedValue(null);

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(deliveryStore.authorizeEmailSend).toHaveBeenCalledWith(
      "download-1",
      1,
      intent.emailClaimedAt,
    );
    expect(sendNurtureEmail).not.toHaveBeenCalled();
  });

  it("does not let a late Resend outcome overwrite unsubscribe suppression", async () => {
    const deliveryStore = store();
    vi.mocked(deliveryStore.markEmailSent).mockResolvedValue(false);

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(sendNurtureEmail).toHaveBeenCalledOnce();
    expect(deliveryStore.markEmailSent).toHaveBeenCalledWith(
      "download-1",
      1,
      intent.emailClaimedAt,
    );
  });

  it("fails closed when eligibility cannot be verified", async () => {
    const deliveryStore = store();
    vi.mocked(deliveryStore.isEligible).mockRejectedValue(new Error("D1 unavailable"));

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(sendNurtureEmail).not.toHaveBeenCalled();
    expect(upsertLeadNurtureContact).not.toHaveBeenCalled();
    expect(captureBackgroundException).toHaveBeenCalledWith(expect.any(Error), "leads", {
      step: "lead-magnet-delivery-eligibility",
    });
  });

  it("rechecks consent before Sequencer enrollment after sending the requested email", async () => {
    const deliveryStore = store();
    vi.mocked(deliveryStore.isEligible).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    vi.mocked(sendNurtureEmail).mockResolvedValue(undefined);

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(deliveryStore.markEmailSent).toHaveBeenCalledWith(
      "download-1",
      1,
      intent.emailClaimedAt,
    );
    expect(deliveryStore.suppress).toHaveBeenCalledWith("download-1");
    expect(enrollLeadNurtureContact).not.toHaveBeenCalled();
  });

  it("compensates in Sequencer when consent changes after contact upsert but before enrollment", async () => {
    const deliveryStore = store();
    vi.mocked(deliveryStore.claim).mockResolvedValue({ ...intent, emailPending: false });
    vi.mocked(deliveryStore.confirmSequencerSend).mockResolvedValue(false);
    vi.mocked(deliveryStore.isEligible)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(upsertLeadNurtureContact).toHaveBeenCalledOnce();
    expect(enrollLeadNurtureContact).not.toHaveBeenCalled();
    expect(unsubscribeLeadNurture).toHaveBeenCalledWith(expect.anything(), {
      email: "lead@example.com",
    });
  });

  it("compensates after an accepted contact upsert loses its response during unsubscribe", async () => {
    const deliveryStore = store();
    let loseResponse: ((error: Error) => void) | undefined;
    vi.mocked(deliveryStore.claim).mockResolvedValue({ ...intent, emailPending: false });
    vi.mocked(deliveryStore.isEligible)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    vi.mocked(upsertLeadNurtureContact).mockImplementationOnce(
      () =>
        new Promise<string>((_resolve, reject) => {
          loseResponse = reject;
        }),
    );

    const dispatch = dispatchLeadDelivery(deliveryStore, {} as never, "download-1");
    await vi.waitFor(() => expect(upsertLeadNurtureContact).toHaveBeenCalledOnce());
    loseResponse?.(new TypeError("contact response lost"));
    await dispatch;

    expect(deliveryStore.markSequencerAmbiguous).toHaveBeenCalledWith(
      "download-1",
      1,
      intent.sequencerClaimedAt,
      "contact response lost",
    );
    expect(unsubscribeLeadNurture).toHaveBeenCalledWith(expect.anything(), {
      email: "lead@example.com",
    });
  });

  it("compensates when unsubscribe suppresses the row before the contact outcome is persisted", async () => {
    const deliveryStore = store();
    vi.mocked(deliveryStore.claim).mockResolvedValue({ ...intent, emailPending: false });
    vi.mocked(deliveryStore.saveSequencerEnrollmentRequest).mockResolvedValue(false);
    vi.mocked(deliveryStore.isEligible)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(upsertLeadNurtureContact).toHaveBeenCalledOnce();
    expect(enrollLeadNurtureContact).not.toHaveBeenCalled();
    expect(unsubscribeLeadNurture).toHaveBeenCalledWith(expect.anything(), {
      email: "lead@example.com",
    });
  });

  it("compensates in Sequencer when consent changes after enrollment but before its outcome", async () => {
    const deliveryStore = store();
    vi.mocked(deliveryStore.claim).mockResolvedValue({ ...intent, emailPending: false });
    vi.mocked(deliveryStore.markSequencerSent).mockResolvedValue(false);
    vi.mocked(deliveryStore.isEligible)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(enrollLeadNurtureContact).toHaveBeenCalledOnce();
    expect(deliveryStore.markSequencerSent).toHaveBeenCalledWith(
      "download-1",
      1,
      intent.sequencerClaimedAt,
    );
    expect(unsubscribeLeadNurture).toHaveBeenCalledWith(expect.anything(), {
      email: "lead@example.com",
    });
  });

  it("reports Sequencer compensation failures without exposing provider or lead data", async () => {
    const deliveryStore = store();
    vi.mocked(deliveryStore.claim).mockResolvedValue({ ...intent, emailPending: false });
    vi.mocked(deliveryStore.markSequencerSent).mockResolvedValue(false);
    vi.mocked(deliveryStore.isEligible)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    vi.mocked(unsubscribeLeadNurture).mockRejectedValueOnce(
      new Error("lead@example.com rejected client-secret"),
    );

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(captureBackgroundException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Sequencer compensation failed" }),
      "leads",
      { step: "lead-magnet-sequencer-compensation" },
    );
    const sentryPayload = JSON.stringify(vi.mocked(captureBackgroundException).mock.calls);
    expect(sentryPayload).not.toContain("lead@example.com");
    expect(sentryPayload).not.toContain("client-secret");
  });

  it("fails compensation eligibility closed without exposing its database error", async () => {
    const deliveryStore = store();
    vi.mocked(deliveryStore.claim).mockResolvedValue({ ...intent, emailPending: false });
    vi.mocked(deliveryStore.markSequencerSent).mockResolvedValue(false);
    vi.mocked(deliveryStore.isEligible)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error("D1 leaked lead@example.com"));

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(captureBackgroundException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Sequencer compensation eligibility failed" }),
      "leads",
      { step: "lead-magnet-sequencer-compensation-eligibility" },
    );
    expect(unsubscribeLeadNurture).toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(captureBackgroundException).mock.calls)).not.toContain(
      "lead@example.com",
    );
  });

  it.each([400, 401])(
    "quarantines a permanent Resend %s rejection and still enrolls Sequencer",
    async (status) => {
      const deliveryStore = store();
      vi.mocked(sendNurtureEmail).mockRejectedValue(
        new Error(`Resend returned ${status}: rejected`),
      );
      vi.mocked(enrollLeadNurtureContact).mockResolvedValue(undefined);

      await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

      expect(deliveryStore.markEmailQuarantined).toHaveBeenCalledWith(
        "download-1",
        1,
        intent.emailClaimedAt,
        expect.any(String),
      );
      expect(deliveryStore.markEmailRetryable).not.toHaveBeenCalled();
      expect(deliveryStore.markSequencerSent).toHaveBeenCalled();
    },
  );

  it("releases a manual email-only intent after permanent rejection so pending Sequencer can run", async () => {
    const deliveryStore = store();
    vi.mocked(deliveryStore.claim)
      .mockResolvedValueOnce({ ...intent, emailOnly: true })
      .mockResolvedValueOnce({
        ...intent,
        emailOnly: false,
        emailPending: false,
        sequencerPending: true,
      });
    vi.mocked(sendNurtureEmail).mockRejectedValueOnce(new Error("Resend returned 400: rejected"));

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");
    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(sendNurtureEmail).toHaveBeenCalledOnce();
    expect(deliveryStore.markEmailQuarantined).toHaveBeenCalledWith(
      "download-1",
      1,
      intent.emailClaimedAt,
      "Resend returned 400: rejected",
    );
    expect(enrollLeadNurtureContact).toHaveBeenCalledOnce();
  });

  it("lets the next full claim deliver Sequencer after an aged email-only ambiguity is quarantined", async () => {
    const deliveryStore = store();
    vi.mocked(deliveryStore.claim)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        ...intent,
        emailOnly: false,
        emailPending: false,
        sequencerPending: true,
      });

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");
    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(sendNurtureEmail).not.toHaveBeenCalled();
    expect(enrollLeadNurtureContact).toHaveBeenCalledOnce();
  });

  it("restores missing Resend credentials without rotating the original provider key", async () => {
    const deliveryStore = store();
    vi.mocked(sendNurtureEmail)
      .mockRejectedValueOnce(new NurtureEmailConfigurationError("RESEND_API_KEY is required"))
      .mockResolvedValueOnce(undefined);

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");
    await dispatchLeadDelivery(
      deliveryStore,
      { RESEND_API_KEY: "restored" } as never,
      "download-1",
    );

    expect(deliveryStore.markEmailUnavailable).toHaveBeenCalledWith(
      "download-1",
      1,
      intent.emailClaimedAt,
      "RESEND_API_KEY is required",
    );
    expect(deliveryStore.markEmailRetryable).not.toHaveBeenCalled();
    expect(deliveryStore.markEmailAmbiguous).not.toHaveBeenCalled();
    expect(sendNurtureEmail).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ idempotencyKey: "lead-magnet/download-1/1" }),
    );
    expect(deliveryStore.markEmailSent).toHaveBeenCalledWith(
      "download-1",
      1,
      intent.emailClaimedAt,
    );
  });

  it("starts the email clock and signs the link only after Resend is restored", async () => {
    vi.useFakeTimers();
    try {
      const outageStartedAt = new Date("2026-07-01T12:00:00.000Z");
      const restoredAt = new Date("2026-07-09T12:00:00.000Z");
      vi.setSystemTime(outageStartedAt);
      const deliveryStore = store();
      vi.mocked(deliveryStore.claim).mockResolvedValue({
        ...intent,
        emailAttemptStartedAt: null,
        sequencerPending: false,
      });
      vi.mocked(isNurtureEmailConfigured).mockReturnValue(false);

      await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

      expect(deliveryStore.authorizeEmailSend).not.toHaveBeenCalled();
      expect(buildDownloadUrl).not.toHaveBeenCalled();
      expect(createNurtureEmailRequestFingerprint).not.toHaveBeenCalled();
      expect(deliveryStore.markEmailUnavailable).toHaveBeenCalledWith(
        "download-1",
        1,
        intent.emailClaimedAt,
        "RESEND_API_KEY is required for nurture email delivery",
      );

      vi.setSystemTime(restoredAt);
      vi.mocked(isNurtureEmailConfigured).mockReturnValue(true);
      vi.mocked(deliveryStore.authorizeEmailSend).mockResolvedValue(restoredAt.toISOString());

      await dispatchLeadDelivery(
        deliveryStore,
        { RESEND_API_KEY: "restored" } as never,
        "download-1",
      );

      expect(buildDownloadUrl).toHaveBeenCalledOnce();
      expect(buildDownloadUrl).toHaveBeenCalledWith(
        "lead-1",
        "grant-compliance-checklist",
        expect.anything(),
        restoredAt.getTime() + 7 * 24 * 60 * 60 * 1000,
      );
      expect(sendNurtureEmail).toHaveBeenCalledOnce();
      expect(sendNurtureEmail).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ idempotencyKey: "lead-magnet/download-1/1" }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives restored Resend delivery a fresh ambiguity window without rotating its key", async () => {
    vi.useFakeTimers();
    try {
      const restoredAt = new Date("2026-07-02T12:00:00.000Z");
      const deliveryStore = store();
      vi.mocked(deliveryStore.claim).mockResolvedValue({
        ...intent,
        emailAttemptStartedAt: null,
        sequencerPending: false,
      });
      vi.mocked(isNurtureEmailConfigured).mockReturnValue(false);
      vi.setSystemTime(new Date("2026-07-01T12:00:00.000Z"));
      await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

      vi.setSystemTime(restoredAt);
      vi.mocked(isNurtureEmailConfigured).mockReturnValue(true);
      vi.mocked(deliveryStore.authorizeEmailSend).mockResolvedValue(restoredAt.toISOString());
      vi.mocked(sendNurtureEmail).mockRejectedValueOnce(new TypeError("network lost"));
      await dispatchLeadDelivery(
        deliveryStore,
        { RESEND_API_KEY: "restored" } as never,
        "download-1",
      );

      expect(deliveryStore.markEmailAmbiguous).toHaveBeenCalledWith(
        "download-1",
        1,
        intent.emailClaimedAt,
        "network lost",
      );
      expect(sendNurtureEmail).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ idempotencyKey: "lead-magnet/download-1/1" }),
      );
      expect(deliveryStore.markEmailRetryable).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives restored Sequencer delivery a fresh ambiguity window without rotating its key", async () => {
    vi.useFakeTimers();
    try {
      const restoredAt = new Date("2026-07-02T12:00:00.000Z");
      const deliveryStore = store();
      vi.mocked(deliveryStore.claim).mockResolvedValue({
        ...intent,
        emailPending: false,
      });
      vi.mocked(isSequencerConfigured).mockReturnValue(false);
      vi.setSystemTime(new Date("2026-07-01T12:00:00.000Z"));
      await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

      expect(deliveryStore.authorizeSequencerSend).not.toHaveBeenCalled();
      expect(createLeadNurtureRequestFingerprint).not.toHaveBeenCalled();

      vi.setSystemTime(restoredAt);
      vi.mocked(isSequencerConfigured).mockReturnValue(true);
      vi.mocked(deliveryStore.authorizeSequencerSend).mockResolvedValue(restoredAt.toISOString());
      vi.mocked(enrollLeadNurtureContact).mockRejectedValueOnce(new TypeError("network lost"));
      await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

      expect(deliveryStore.markSequencerAmbiguous).toHaveBeenCalledWith(
        "download-1",
        1,
        intent.sequencerClaimedAt,
        "network lost",
      );
      expect(enrollLeadNurtureContact).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ idempotencyKey: "lead-magnet/download-1/1" }),
        "contact-1",
      );
      expect(deliveryStore.markSequencerRetryable).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("allows only one restored email worker to materialize and send the stable attempt", async () => {
    const deliveryStore = store();
    vi.mocked(deliveryStore.claim).mockResolvedValue({
      ...intent,
      emailAttemptStartedAt: null,
      sequencerPending: false,
    });
    vi.mocked(deliveryStore.authorizeEmailSend)
      .mockResolvedValueOnce("2026-07-12T12:00:00.000Z")
      .mockResolvedValueOnce(null);

    await Promise.all([
      dispatchLeadDelivery(deliveryStore, {} as never, "download-1"),
      dispatchLeadDelivery(deliveryStore, {} as never, "download-1"),
    ]);

    expect(deliveryStore.authorizeEmailSend).toHaveBeenCalledTimes(2);
    expect(buildDownloadUrl).toHaveBeenCalledOnce();
    expect(createNurtureEmailRequestFingerprint).toHaveBeenCalledOnce();
    expect(sendNurtureEmail).toHaveBeenCalledOnce();
    expect(sendNurtureEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ idempotencyKey: "lead-magnet/download-1/1" }),
    );
  });

  it("keeps any local email preparation failure retryable before Resend is touched", async () => {
    const deliveryStore = store();
    vi.mocked(buildDownloadUrl).mockRejectedValueOnce(new Error("local signing unavailable"));

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(sendNurtureEmail).not.toHaveBeenCalled();
    expect(deliveryStore.markEmailRetryable).toHaveBeenCalledWith(
      "download-1",
      1,
      intent.emailClaimedAt,
      "local signing unavailable",
    );
    expect(deliveryStore.markEmailAmbiguous).not.toHaveBeenCalled();
  });

  it("keeps any local Sequencer preparation failure retryable before its API is touched", async () => {
    const deliveryStore = store();
    vi.mocked(deliveryStore.claim).mockResolvedValue({ ...intent, emailPending: false });
    vi.mocked(createLeadNurtureRequestFingerprint).mockRejectedValueOnce(
      new Error("local fingerprint unavailable"),
    );

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(upsertLeadNurtureContact).not.toHaveBeenCalled();
    expect(deliveryStore.markSequencerRetryable).toHaveBeenCalledWith(
      "download-1",
      1,
      intent.sequencerClaimedAt,
      "local fingerprint unavailable",
    );
    expect(deliveryStore.markSequencerAmbiguous).not.toHaveBeenCalled();
  });

  it.each([399, 408, 425, 429, 500, 503])(
    "keeps a Resend %s outcome ambiguous because provider acceptance is uncertain",
    async (status) => {
      const deliveryStore = store();
      vi.mocked(sendNurtureEmail).mockRejectedValue(
        new Error(`Resend returned ${status}: uncertain`),
      );

      await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

      expect(deliveryStore.markEmailAmbiguous).toHaveBeenCalledWith(
        "download-1",
        1,
        intent.emailClaimedAt,
        expect.any(String),
      );
      expect(deliveryStore.markEmailRetryable).not.toHaveBeenCalled();
    },
  );

  it("keeps accepted-then-lost email ambiguous and recoverable", async () => {
    const deliveryStore = store();
    vi.mocked(sendNurtureEmail).mockRejectedValue(new TypeError("network lost"));
    vi.mocked(enrollLeadNurtureContact).mockResolvedValue(undefined);

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(deliveryStore.markEmailAmbiguous).toHaveBeenCalledWith(
      "download-1",
      1,
      intent.emailClaimedAt,
      expect.any(String),
    );
  });

  it("keeps accepted-then-lost Sequencer enrollment ambiguous under one stable key", async () => {
    const deliveryStore = store();
    vi.mocked(sendNurtureEmail).mockResolvedValue(undefined);
    vi.mocked(enrollLeadNurtureContact).mockRejectedValue(new TypeError("network lost"));

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(deliveryStore.markSequencerAmbiguous).toHaveBeenCalledWith(
      "download-1",
      1,
      intent.sequencerClaimedAt,
      expect.any(String),
    );
    expect(deliveryStore.markSequencerRetryable).not.toHaveBeenCalled();
  });

  it.each([408, 425, 429, 500, 503])(
    "keeps a Sequencer %s response ambiguous under the same attempt and key",
    async (status) => {
      const deliveryStore = store();
      vi.mocked(deliveryStore.claim).mockResolvedValue({ ...intent, emailPending: false });
      vi.mocked(enrollLeadNurtureContact).mockRejectedValueOnce(
        new SequencerResponseError(status, `Sequencer enrollment failed with ${status}`),
      );

      await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

      expect(deliveryStore.markSequencerAmbiguous).toHaveBeenCalledWith(
        "download-1",
        1,
        intent.sequencerClaimedAt,
        expect.any(String),
      );
      expect(deliveryStore.markSequencerRetryable).not.toHaveBeenCalled();
      expect(enrollLeadNurtureContact).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ idempotencyKey: "lead-magnet/download-1/1" }),
        "contact-1",
      );
    },
  );

  it("quarantines a definite Sequencer 400 rejection without rotating fresh keys", async () => {
    const deliveryStore = store();
    vi.mocked(deliveryStore.claim).mockResolvedValue({ ...intent, emailPending: false });
    vi.mocked(enrollLeadNurtureContact).mockRejectedValueOnce(
      new SequencerResponseError(400, "Sequencer enrollment failed with 400"),
    );

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(deliveryStore.markSequencerQuarantined).toHaveBeenCalledWith(
      "download-1",
      1,
      intent.sequencerClaimedAt,
      expect.any(String),
    );
    expect(deliveryStore.markSequencerRetryable).not.toHaveBeenCalled();
    expect(deliveryStore.markSequencerAmbiguous).not.toHaveBeenCalled();
  });

  it("rotates a definite Access redirect and succeeds after credentials are corrected", async () => {
    const deliveryStore = store();
    const correctedIntent = {
      ...intent,
      emailPending: false,
      sequencerAttempt: 2,
      sequencerClaimedAt: "2026-07-11T12:07:00.000Z",
    };
    vi.mocked(deliveryStore.claim)
      .mockResolvedValueOnce({ ...intent, emailPending: false })
      .mockResolvedValueOnce(correctedIntent);
    vi.mocked(enrollLeadNurtureContact)
      .mockRejectedValueOnce(new SequencerResponseError(302, "Sequencer enrollment was redirected"))
      .mockResolvedValueOnce(undefined);

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");
    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(deliveryStore.markSequencerRetryable).toHaveBeenCalledWith(
      "download-1",
      1,
      intent.sequencerClaimedAt,
      expect.any(String),
    );
    expect(deliveryStore.markSequencerAmbiguous).not.toHaveBeenCalled();
    expect(enrollLeadNurtureContact).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ idempotencyKey: "lead-magnet/download-1/2" }),
      "contact-1",
    );
    expect(deliveryStore.markSequencerSent).toHaveBeenCalledWith(
      "download-1",
      2,
      correctedIntent.sequencerClaimedAt,
    );
  });

  it("atomically opens one new email attempt after a completed or definitely failed delivery", async () => {
    const statements: string[] = [];
    const db = {
      prepare: vi.fn((sql: string) => {
        statements.push(sql);
        return {
          bind: vi.fn(() => ({ run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }) })),
        };
      }),
    };

    await expect(
      createD1LeadDeliveryStore(db as never).requestEmailResend("download-1"),
    ).resolves.toBe("opened");

    expect(statements[0]).toContain("email_attempt = email_attempt + 1");
    expect(statements[0]).toContain("email_attempt_started_at = NULL");
    expect(statements[0]).toContain("email_only = 1");
    expect(statements[0]).toContain("email_request_fingerprint = NULL");
    expect(statements[0]).not.toContain("delivery_started_at = NULL");
    expect(statements[0]).toContain("email_status IN ('sent','failed','quarantined')");
    expect(statements[0]).not.toContain("'ambiguous'");
  });

  it("starts a new email attempt for every definite-failure claim", async () => {
    const statements: string[] = [];
    const db = {
      prepare: vi.fn((sql: string) => {
        statements.push(sql);
        return {
          bind: vi.fn(() => ({
            run: vi.fn().mockResolvedValue(undefined),
            first: vi.fn().mockResolvedValue(null),
          })),
        };
      }),
    };

    await createD1LeadDeliveryStore(db as never).claim("download-1");

    const claimSql = statements.find((sql) => sql.includes("RETURNING id"))!;
    expect(claimSql).toContain("email_status = 'failed'");
    expect(claimSql).toContain(
      "WHEN email_status = 'failed'\n                 THEN email_attempt + 1",
    );
    expect(claimSql).toContain("email_request_fingerprint = CASE");
    expect(claimSql).toContain("THEN NULL ELSE email_request_fingerprint");
  });

  it("uses a fresh key and signed-link lifetime for a rotated definite-failure attempt", async () => {
    const deliveryStore = store();
    vi.mocked(createNurtureEmailRequestFingerprint).mockResolvedValue("email-secret-v2");
    vi.mocked(deliveryStore.claim).mockResolvedValue({
      ...intent,
      emailAttempt: 2,
      emailAttemptStartedAt: "2026-07-18T12:00:00.000Z",
      sequencerPending: false,
    });
    vi.mocked(deliveryStore.authorizeEmailSend).mockResolvedValue("2026-07-18T12:00:00.000Z");

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(sendNurtureEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ idempotencyKey: "lead-magnet/download-1/2" }),
    );
    expect(buildDownloadUrl).toHaveBeenCalledWith(
      "lead-1",
      "grant-compliance-checklist",
      expect.anything(),
      new Date("2026-07-18T12:00:00.000Z").getTime() + 7 * 24 * 60 * 60 * 1000,
    );
    expect(deliveryStore.saveEmailRequestFingerprint).toHaveBeenCalledWith(
      "download-1",
      2,
      intent.emailClaimedAt,
      "email-secret-v2",
    );
  });

  it("persists a new Sequencer request after a definite failure and credential rotation", async () => {
    const deliveryStore = store();
    vi.mocked(deliveryStore.claim).mockResolvedValue({
      ...intent,
      emailPending: false,
      sequencerAttempt: 2,
      sequencerRequestFingerprint: null,
      sequencerContactId: null,
      sequencerEnrollmentRequestFingerprint: null,
    });
    vi.mocked(createLeadNurtureRequestFingerprint).mockResolvedValue("sequencer-secret-v2");

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(deliveryStore.saveSequencerRequestFingerprint).toHaveBeenCalledWith(
      "download-1",
      2,
      intent.sequencerClaimedAt,
      "sequencer-secret-v2",
    );
    expect(upsertLeadNurtureContact).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ idempotencyKey: "lead-magnet/download-1/2" }),
    );
    expect(deliveryStore.saveSequencerEnrollmentRequest).toHaveBeenCalledWith(
      "download-1",
      2,
      intent.sequencerClaimedAt,
      "contact-1",
      "sequencer-enrollment-v1",
    );
  });

  it("rotates only definite Sequencer failures and clears their authenticated request state", async () => {
    const statements: string[] = [];
    const db = {
      prepare: vi.fn((sql: string) => {
        statements.push(sql);
        return {
          bind: vi.fn(() => ({
            run: vi.fn().mockResolvedValue(undefined),
            first: vi.fn().mockResolvedValue(null),
          })),
        };
      }),
    };

    await createD1LeadDeliveryStore(db as never).claim("download-1");

    const claimSql = statements.find((sql) => sql.includes("RETURNING id"))!;
    expect(claimSql).toContain("WHEN sequencer_status = 'failed'");
    expect(claimSql).toContain("THEN sequencer_attempt + 1");
    expect(claimSql).toContain("sequencer_request_fingerprint = CASE");
    expect(claimSql).toContain("sequencer_contact_id = CASE");
    expect(claimSql).toContain("sequencer_enrollment_request_fingerprint = CASE");
    expect(claimSql).toContain("sequencer_attempt_started_at = CASE");
    expect(claimSql).toContain("THEN NULL");
    expect(statements[1]).toContain("sequencer_attempt_started_at IS NOT NULL");
    expect(statements[1]).toContain("sequencer_attempt_started_at < ?");
    expect(claimSql).toContain("sequencer_attempt_started_at > ?");
    expect(claimSql).not.toContain(
      "sequencer_status IN ('processing','sending','ambiguous')\n                     AND delivery_claimed_at < ?)\n                 THEN sequencer_attempt + 1",
    );
  });

  it("persists only opaque fingerprints and the non-secret Sequencer contact id", async () => {
    const statements: Array<{ sql: string; values: unknown[] }> = [];
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn((...values: unknown[]) => {
          statements.push({ sql, values });
          return { run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }) };
        }),
      })),
    };
    const deliveryStore = createD1LeadDeliveryStore(db as never);

    await expect(
      deliveryStore.saveEmailRequestFingerprint(
        "download-1",
        1,
        intent.emailClaimedAt,
        "a".repeat(64),
      ),
    ).resolves.toBe(true);
    await expect(
      deliveryStore.saveSequencerRequestFingerprint(
        "download-1",
        1,
        intent.sequencerClaimedAt,
        "b".repeat(64),
      ),
    ).resolves.toBe(true);
    await expect(
      deliveryStore.saveSequencerEnrollmentRequest(
        "download-1",
        1,
        intent.sequencerClaimedAt,
        "contact-1",
        "c".repeat(64),
      ),
    ).resolves.toBe(true);

    expect(statements.flatMap(({ values }) => values)).toEqual([
      "a".repeat(64),
      "download-1",
      1,
      intent.emailClaimedAt,
      "b".repeat(64),
      "download-1",
      1,
      intent.sequencerClaimedAt,
      "contact-1",
      "c".repeat(64),
      "download-1",
      1,
      intent.sequencerClaimedAt,
    ]);
    expect(statements[0]?.sql).toContain("email_claimed_at = ?");
    expect(statements[1]?.sql).toContain("sequencer_claimed_at = ?");
    expect(statements[2]?.sql).toContain("sequencer_claimed_at = ?");
    expect(JSON.stringify(statements)).not.toContain("lead@example.com");
    expect(JSON.stringify(statements)).not.toContain("client-secret");
    expect(JSON.stringify(statements)).not.toContain("re_secret");
  });

  it("reports unacknowledged D1 fingerprint writes", async () => {
    const db = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({ run: vi.fn().mockResolvedValue({ meta: { changes: 0 } }) })),
      })),
    };
    const deliveryStore = createD1LeadDeliveryStore(db as never);

    await expect(
      deliveryStore.saveEmailRequestFingerprint(
        "download-1",
        1,
        intent.emailClaimedAt,
        "a".repeat(64),
      ),
    ).resolves.toBe(false);
    await expect(
      deliveryStore.saveSequencerRequestFingerprint(
        "download-1",
        1,
        intent.sequencerClaimedAt,
        "b".repeat(64),
      ),
    ).resolves.toBe(false);
    await expect(
      deliveryStore.saveSequencerEnrollmentRequest(
        "download-1",
        1,
        intent.sequencerClaimedAt,
        "contact-1",
        "c".repeat(64),
      ),
    ).resolves.toBe(false);
  });

  it.each(["pending", "processing", "sending"])(
    "reports %s email delivery as already in progress",
    async (emailStatus) => {
      const db = {
        prepare: vi
          .fn()
          .mockImplementationOnce(() => ({
            bind: vi.fn(() => ({ run: vi.fn().mockResolvedValue({ meta: { changes: 0 } }) })),
          }))
          .mockImplementationOnce(() => ({
            bind: vi.fn(() => ({
              first: vi.fn().mockResolvedValue({ email_status: emailStatus }),
            })),
          })),
      };

      await expect(
        createD1LeadDeliveryStore(db as never).requestEmailResend("download-1"),
      ).resolves.toBe("in_progress");
    },
  );

  it("reports ambiguous email delivery separately from known in-progress work", async () => {
    const db = {
      prepare: vi
        .fn()
        .mockImplementationOnce(() => ({
          bind: vi.fn(() => ({ run: vi.fn().mockResolvedValue({ meta: { changes: 0 } }) })),
        }))
        .mockImplementationOnce(() => ({
          bind: vi.fn(() => ({
            first: vi.fn().mockResolvedValue({ email_status: "ambiguous" }),
          })),
        })),
    };

    await expect(
      createD1LeadDeliveryStore(db as never).requestEmailResend("download-1"),
    ).resolves.toBe("ambiguous");
  });

  it("opens a fresh manual resend after quarantine so corrected input or config can recover", async () => {
    const statements: string[] = [];
    const db = {
      prepare: vi.fn((sql: string) => {
        statements.push(sql);
        return {
          bind: vi.fn(() => ({ run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }) })),
        };
      }),
    };

    await expect(
      createD1LeadDeliveryStore(db as never).requestEmailResend("download-1"),
    ).resolves.toBe("opened");
    expect(statements[0]).toContain("'quarantined'");
  });

  it.each(["suppressed"])(
    "reports %s email delivery as unavailable for automatic resend",
    async (emailStatus) => {
      const db = {
        prepare: vi
          .fn()
          .mockImplementationOnce(() => ({
            bind: vi.fn(() => ({ run: vi.fn().mockResolvedValue({ meta: { changes: 0 } }) })),
          }))
          .mockImplementationOnce(() => ({
            bind: vi.fn(() => ({
              first: vi.fn().mockResolvedValue({ email_status: emailStatus }),
            })),
          })),
      };

      await expect(
        createD1LeadDeliveryStore(db as never).requestEmailResend("download-1"),
      ).resolves.toBe("unavailable");
    },
  );

  it("reports a missing durable download as unavailable for automatic resend", async () => {
    const db = {
      prepare: vi
        .fn()
        .mockImplementationOnce(() => ({
          bind: vi.fn(() => ({ run: vi.fn().mockResolvedValue({ meta: { changes: 0 } }) })),
        }))
        .mockImplementationOnce(() => ({
          bind: vi.fn(() => ({ first: vi.fn().mockResolvedValue(null) })),
        })),
    };

    await expect(
      createD1LeadDeliveryStore(db as never).requestEmailResend("download-1"),
    ).resolves.toBe("unavailable");
  });

  it("claims an explicit resend as email-only without redispatching unresolved Sequencer work", async () => {
    const deliveryStore = store();
    vi.mocked(sendNurtureEmail).mockResolvedValue(undefined);
    vi.mocked(deliveryStore.claim).mockResolvedValue({ ...intent, emailOnly: true });

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(sendNurtureEmail).toHaveBeenCalledOnce();
    expect(enrollLeadNurtureContact).not.toHaveBeenCalled();
  });

  it.each(["failed", "ambiguous"] as const)(
    "leaves a %s Sequencer attempt and lease untouched when claiming an email-only resend",
    async (sequencerStatus) => {
      const statements: string[] = [];
      const sequencerState: {
        status: string;
        attempt: number;
        attemptStartedAt: string;
        claimedAt: string;
        requestFingerprint: string;
        contactId: string;
        enrollmentFingerprint: string;
      } = {
        status: sequencerStatus,
        attempt: 7,
        attemptStartedAt: "2026-07-10T13:10:00.000Z",
        claimedAt: "2026-07-11T11:00:00.000Z",
        requestFingerprint: "sequencer-request-existing",
        contactId: "contact-existing",
        enrollmentFingerprint: "sequencer-enrollment-existing",
      };
      const before = structuredClone(sequencerState);
      const db = {
        prepare: vi.fn((sql: string) => {
          statements.push(sql);
          return {
            bind: vi.fn(() => ({
              run: vi.fn().mockImplementation(async () => {
                if (sql.includes("sequencer_status = 'quarantined'")) {
                  sequencerState.status = "quarantined";
                }
              }),
              first: vi.fn().mockImplementation(async () => {
                if (sql.includes("RETURNING id")) {
                  if (sql.includes("sequencer_attempt = CASE")) {
                    if (sequencerState.status === "failed") {
                      sequencerState.attempt += 1;
                      sequencerState.attemptStartedAt = "renewed";
                      sequencerState.requestFingerprint = "";
                      sequencerState.contactId = "";
                      sequencerState.enrollmentFingerprint = "";
                    }
                    sequencerState.status = "processing";
                    sequencerState.claimedAt = "renewed";
                  }
                  return {
                    id: "download-1",
                    lead_id: "lead-1",
                    magnet_slug: "guide",
                    source_page: "/guide",
                    email_attempt: 2,
                    email_attempt_started_at: "2026-07-11T12:00:00.000Z",
                    email_claimed_at: "2026-07-11T12:01:00.000Z",
                    email_only: 1,
                    email_status: "processing",
                  };
                }
                return { email: "lead@example.com", first_name: "Lead" };
              }),
            })),
          };
        }),
      };

      const claimed = await createD1LeadDeliveryStore(db as never).claim("download-1", {
        emailOnly: true,
      });

      expect(claimed).toEqual(expect.objectContaining({ emailOnly: true, emailPending: true }));
      expect(sequencerState).toEqual(before);
      expect(statements.join("\n")).not.toContain("sequencer_");
    },
  );

  it("atomically moves each claimed channel to processing", async () => {
    const statements: string[] = [];
    const db = {
      prepare: vi.fn((sql: string) => {
        statements.push(sql);
        return {
          bind: vi.fn(() => ({
            run: vi.fn().mockResolvedValue(undefined),
            first: vi.fn().mockResolvedValue(
              sql.includes("RETURNING id")
                ? {
                    id: "download-1",
                    lead_id: "lead-1",
                    magnet_slug: "guide",
                    source_page: "/guide",
                    email_attempt: 1,
                    email_attempt_started_at: "2026-07-11T12:00:00.000Z",
                    email_claimed_at: "2026-07-11T12:01:00.000Z",
                    sequencer_claimed_at: "2026-07-11T12:02:00.000Z",
                    email_status: "processing",
                    sequencer_status: "processing",
                  }
                : { email: "lead@example.com", first_name: "Lead" },
            ),
          })),
        };
      }),
    };

    const claimed = await createD1LeadDeliveryStore(db as never).claim("download-1");

    expect(statements[2]).toContain("email_status = CASE");
    expect(statements[2]).toContain("sequencer_status = CASE");
    expect(claimed).toEqual(
      expect.objectContaining({ emailPending: true, sequencerPending: true }),
    );
  });

  it("renews only each claimed channel lease without resetting its ambiguity clock", async () => {
    const statements: string[] = [];
    const db = {
      prepare: vi.fn((sql: string) => {
        statements.push(sql);
        return {
          bind: vi.fn(() => ({
            run: vi.fn().mockResolvedValue(undefined),
            first: vi.fn().mockResolvedValue(null),
          })),
        };
      }),
    };
    const deliveryStore = createD1LeadDeliveryStore(db as never);

    await deliveryStore.claim("download-1");
    await deliveryStore.claim("download-1");

    expect(statements[0]).toContain("email_attempt_started_at IS NOT NULL");
    expect(statements[0]).toContain("email_attempt_started_at < ?");
    expect(statements[0]).toContain("email_status IN ('processing','sending','ambiguous')");
    expect(statements[1]).toContain("sequencer_status IN ('processing','sending','ambiguous')");
    expect(statements[2]).toContain("delivery_started_at = COALESCE(delivery_started_at, ?)");
    expect(statements[2]).toContain("email_claimed_at = CASE");
    expect(statements[2]).toContain("sequencer_claimed_at = CASE");
    expect(statements[2]).toContain("email_attempt_started_at = CASE");
    expect(statements[2]).toContain("unsubscribed_at IS NULL");
    expect(statements[2]).toContain("email_claimed_at < ?");
    expect(statements[2]).toContain("sequencer_claimed_at < ?");
    expect(statements[2]).not.toContain("delivery_claimed_at < ?");
    const emailClaimSection = statements[2]!
      .split("email_claimed_at = CASE")[1]!
      .split("sequencer_attempt = CASE")[0]!;
    const sequencerClaimSection = statements[2]!
      .split("sequencer_claimed_at = CASE")[1]!
      .split("WHERE id = ?")[0]!;
    expect(emailClaimSection).not.toContain("sequencer_claimed_at");
    expect(sequencerClaimSection).not.toContain("email_claimed_at");
    expect(statements[5]).toBe(statements[2]);
  });

  it("starts provider clocks only in the channel authorization CAS", async () => {
    const statements: string[] = [];
    const db = {
      prepare: vi.fn((sql: string) => {
        statements.push(sql);
        return {
          bind: vi.fn(() => ({
            run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
            first: vi.fn().mockResolvedValue(null),
          })),
        };
      }),
    };
    const deliveryStore = createD1LeadDeliveryStore(db as never);

    await deliveryStore.claim("download-1");
    await deliveryStore.authorizeEmailSend("download-1", 1, intent.emailClaimedAt);
    await deliveryStore.authorizeSequencerSend("download-1", 1, intent.sequencerClaimedAt);

    const emailQuarantine = statements.find((sql) => sql.includes("email_status IN"))!;
    const sequencerQuarantine = statements.find((sql) => sql.includes("sequencer_status IN"))!;
    const claimSql = statements.find((sql) => sql.includes("RETURNING id"))!;
    const emailAuthorize = statements.find((sql) => sql.includes("SET email_status = 'sending'"))!;
    const sequencerAuthorize = statements.find((sql) =>
      sql.includes("SET sequencer_status = 'sending'"),
    )!;

    expect(emailQuarantine).toContain("email_attempt_started_at IS NOT NULL");
    expect(emailQuarantine).not.toContain(
      "COALESCE(email_attempt_started_at, delivery_started_at)",
    );
    expect(sequencerQuarantine).toContain("sequencer_attempt_started_at IS NOT NULL");
    expect(sequencerQuarantine).not.toContain(
      "COALESCE(sequencer_attempt_started_at, delivery_started_at)",
    );
    expect(claimSql).not.toContain("COALESCE(email_attempt_started_at, delivery_started_at, ?)");
    expect(claimSql).not.toContain(
      "COALESCE(sequencer_attempt_started_at, delivery_started_at, ?)",
    );
    expect(emailAuthorize).toContain(
      "email_attempt_started_at = COALESCE(email_attempt_started_at, ?)",
    );
    expect(emailAuthorize).toContain("RETURNING email_attempt_started_at");
    expect(sequencerAuthorize).toContain(
      "sequencer_attempt_started_at = COALESCE(sequencer_attempt_started_at, ?)",
    );
    expect(sequencerAuthorize).toContain("sequencer_status = 'processing'");
    expect(sequencerAuthorize).not.toContain("sequencer_status IN ('processing','sending')");
    expect(sequencerAuthorize).toContain("RETURNING sequencer_attempt_started_at");
  });

  it("atomically releases email-only mode on every terminal email quarantine", async () => {
    const statements: string[] = [];
    const db = {
      prepare: vi.fn((sql: string) => {
        statements.push(sql);
        return {
          bind: vi.fn(() => ({
            run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
            first: vi.fn().mockResolvedValue(null),
          })),
        };
      }),
    };
    const deliveryStore = createD1LeadDeliveryStore(db as never);

    await deliveryStore.claim("download-1");
    await deliveryStore.markEmailRetryable("download-1", 1, intent.emailClaimedAt, "retryable");
    await deliveryStore.markEmailRetryable("download-1", 3, intent.emailClaimedAt, "max retries");
    await deliveryStore.markEmailQuarantined(
      "download-1",
      1,
      intent.emailClaimedAt,
      "fingerprint drift",
    );
    await deliveryStore.markEmailUnavailable(
      "download-1",
      1,
      intent.emailClaimedAt,
      "configuration missing",
    );
    await deliveryStore.markEmailAmbiguous(
      "download-1",
      1,
      intent.emailClaimedAt,
      "provider uncertain",
    );

    expect(statements[0]).toContain("SET email_status = 'quarantined', email_only = 0");
    expect(statements[3]).not.toContain("email_only = 0");
    expect(statements[4]).toContain("email_status = 'quarantined'");
    expect(statements[4]).toContain("email_only = 0");
    expect(statements[4]).toContain("email_attempt = ?");
    expect(statements[4]).toContain("email_claimed_at = ?");
    expect(statements[5]).toContain("email_status = 'quarantined'");
    expect(statements[5]).toContain("email_only = 0");
    expect(statements[5]).toContain("email_attempt = ?");
    expect(statements[5]).toContain("email_claimed_at = ?");
    expect(statements[6]).not.toContain("email_only = 0");
    expect(statements[7]).not.toContain("email_only = 0");
  });

  it("fences late old-lease 4xx outcomes from newer successful channel senders", async () => {
    const statements: Array<{ sql: string; values: unknown[] }> = [];
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn((...values: unknown[]) => {
          statements.push({ sql, values });
          return { run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }) };
        }),
      })),
    };
    const deliveryStore = createD1LeadDeliveryStore(db as never);

    const newerEmailLease = "2026-07-11T12:06:00.000Z";
    const newerSequencerLease = "2026-07-11T12:07:00.000Z";
    await deliveryStore.markEmailRetryable(
      "download-1",
      1,
      intent.emailClaimedAt,
      "Resend returned 401: old key",
    );
    await deliveryStore.markEmailSent("download-1", 1, newerEmailLease);
    await deliveryStore.markSequencerRetryable(
      "download-1",
      1,
      intent.sequencerClaimedAt,
      "Sequencer returned 401: old key",
    );
    await deliveryStore.markSequencerSent("download-1", 1, newerSequencerLease);

    expect(statements[0]!.sql).toContain("email_claimed_at = ?");
    expect(statements[1]!.sql).toContain("email_claimed_at = ?");
    expect(statements[2]!.sql).toContain("sequencer_claimed_at = ?");
    expect(statements[3]!.sql).toContain("sequencer_claimed_at = ?");
    expect(statements[0]!.values).toContain(intent.emailClaimedAt);
    expect(statements[1]!.values).toContain(newerEmailLease);
    expect(statements[2]!.values).toContain(intent.sequencerClaimedAt);
    expect(statements[3]!.values).toContain(newerSequencerLease);
  });

  it("does nothing when another worker owns the intent", async () => {
    const deliveryStore = store();
    vi.mocked(deliveryStore.claim).mockResolvedValue(null);

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(sendNurtureEmail).not.toHaveBeenCalled();
    expect(enrollLeadNurtureContact).not.toHaveBeenCalled();
  });

  it("contains claim dependency failures so a recovery batch can continue", async () => {
    const deliveryStore = store();
    vi.mocked(deliveryStore.claim).mockRejectedValue(new Error("dependency missing"));

    await expect(
      dispatchLeadDelivery(deliveryStore, {} as never, "download-1"),
    ).resolves.toBeUndefined();
    expect(sendNurtureEmail).not.toHaveBeenCalled();
  });

  it("only dispatches channels claimed as processing", async () => {
    const deliveryStore = store();
    vi.mocked(deliveryStore.claim).mockResolvedValue({
      ...intent,
      emailPending: false,
      sequencerPending: false,
    });

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(sendNurtureEmail).not.toHaveBeenCalled();
    expect(enrollLeadNurtureContact).not.toHaveBeenCalled();
  });

  it("restores local Sequencer configuration without rotating its attempt or key", async () => {
    const deliveryStore = store();
    vi.mocked(sendNurtureEmail).mockResolvedValue(undefined);
    vi.mocked(isSequencerConfigured).mockReturnValueOnce(false).mockReturnValueOnce(true);

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");
    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(deliveryStore.markEmailSent).toHaveBeenCalled();
    expect(deliveryStore.markSequencerUnavailable).toHaveBeenCalledWith(
      "download-1",
      1,
      intent.sequencerClaimedAt,
      "Sequencer is not configured",
    );
    expect(deliveryStore.markSequencerRetryable).not.toHaveBeenCalled();
    expect(deliveryStore.markSequencerAmbiguous).not.toHaveBeenCalled();
    expect(enrollLeadNurtureContact).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ idempotencyKey: "lead-magnet/download-1/1" }),
      "contact-1",
    );
    expect(deliveryStore.markSequencerSent).toHaveBeenCalledWith(
      "download-1",
      1,
      intent.sequencerClaimedAt,
    );
  });

  it("uses a privacy-safe generic message for non-Error failures", async () => {
    const deliveryStore = store();
    vi.mocked(sendNurtureEmail).mockRejectedValue("provider disconnected");
    vi.mocked(enrollLeadNurtureContact).mockRejectedValue("provider disconnected");

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(deliveryStore.markEmailAmbiguous).toHaveBeenCalledWith(
      "download-1",
      1,
      intent.emailClaimedAt,
      "Unknown delivery error",
    );
    expect(deliveryStore.markSequencerAmbiguous).toHaveBeenCalledWith(
      "download-1",
      1,
      intent.sequencerClaimedAt,
      "Unknown delivery error",
    );
  });

  it("contains delivery-state write failures so later rows can continue", async () => {
    const deliveryStore = store();
    vi.mocked(sendNurtureEmail).mockRejectedValue(new Error("Resend returned 503: down"));
    vi.mocked(deliveryStore.markEmailRetryable).mockRejectedValue(new Error("D1 unavailable"));
    vi.mocked(enrollLeadNurtureContact).mockResolvedValue(undefined);

    await expect(
      dispatchLeadDelivery(deliveryStore, {} as never, "download-1"),
    ).resolves.toBeUndefined();
    expect(deliveryStore.markSequencerSent).toHaveBeenCalled();
  });

  it("reports delivery-state write failures without exposing persisted lead data", async () => {
    const deliveryStore = store();
    vi.mocked(sendNurtureEmail).mockRejectedValue(new Error("Resend returned 400: rejected"));
    vi.mocked(deliveryStore.markEmailQuarantined).mockRejectedValue(
      new Error("D1 rejected lead@example.com and re_secret"),
    );

    await dispatchLeadDelivery(deliveryStore, {} as never, "download-1");

    expect(captureBackgroundException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Lead delivery state persistence failed" }),
      "leads",
      { step: "lead-magnet-email-state" },
    );
    const sentryPayload = JSON.stringify(vi.mocked(captureBackgroundException).mock.calls);
    expect(sentryPayload).not.toContain("lead@example.com");
    expect(sentryPayload).not.toContain("re_secret");
  });

  it("persists every channel outcome through guarded updates", async () => {
    const sql: string[] = [];
    const db = {
      prepare: vi.fn((statement: string) => {
        sql.push(statement);
        return {
          bind: vi.fn(() => ({
            run: vi.fn().mockResolvedValue(undefined),
            first: vi.fn().mockResolvedValue({ eligible: 1 }),
          })),
        };
      }),
    };
    const deliveryStore = createD1LeadDeliveryStore(db as never);

    await deliveryStore.authorizeEmailSend("download-1", 1, intent.emailClaimedAt);
    await deliveryStore.markEmailSent("download-1", 1, intent.emailClaimedAt);
    await deliveryStore.markEmailUnavailable("download-1", 1, intent.emailClaimedAt, "config");
    await deliveryStore.markEmailRetryable("download-1", 1, intent.emailClaimedAt, "retry");
    await deliveryStore.markEmailRetryable("download-1", 3, intent.emailClaimedAt, "retry");
    await deliveryStore.markEmailAmbiguous("download-1", 1, intent.emailClaimedAt, "ambiguous");
    await deliveryStore.markEmailQuarantined("download-1", 1, intent.emailClaimedAt, "quarantined");
    await deliveryStore.authorizeSequencerSend("download-1", 1, intent.sequencerClaimedAt);
    await deliveryStore.confirmSequencerSend("download-1", 1, intent.sequencerClaimedAt);
    await deliveryStore.markSequencerSent("download-1", 1, intent.sequencerClaimedAt);
    await deliveryStore.markSequencerUnavailable(
      "download-1",
      1,
      intent.sequencerClaimedAt,
      "config",
    );
    await deliveryStore.markSequencerRetryable("download-1", 1, intent.sequencerClaimedAt, "retry");
    await deliveryStore.markSequencerRetryable("download-1", 3, intent.sequencerClaimedAt, "retry");
    await deliveryStore.markSequencerAmbiguous(
      "download-1",
      1,
      intent.sequencerClaimedAt,
      "ambiguous",
    );
    await deliveryStore.markSequencerQuarantined(
      "download-1",
      1,
      intent.sequencerClaimedAt,
      "quarantined",
    );
    await deliveryStore.suppress("download-1");
    await deliveryStore.isEligible("download-1");

    expect(sql).toHaveLength(17);
    expect(sql[0]).toContain("email_status = 'sending'");
    expect(sql[0]).toContain("email_attempt = ?");
    expect(sql[0]).toContain("unsubscribed_at IS NULL");
    expect(sql[1]).toContain("email_status = 'sending'");
    expect(sql[1]).toContain("email_attempt = ?");
    expect(sql[1]).toContain("unsubscribed_at IS NULL");
    expect(sql[2]).toContain("email_status = 'pending'");
    expect(sql[3]).toContain("email_status = 'failed'");
    expect(sql[4]).toContain("email_status = 'quarantined'");
    expect(sql[7]).toContain("sequencer_status = 'sending'");
    expect(sql[7]).toContain("sequencer_attempt = ?");
    expect(sql[7]).toContain("unsubscribed_at IS NULL");
    expect(sql[8]).toContain("sequencer_status = 'sending'");
    expect(sql[10]).toContain("sequencer_status = 'pending'");
    expect(sql[11]).toContain("sequencer_status = 'failed'");
    expect(sql[12]).toContain("sequencer_status = 'quarantined'");
    expect(sql[15]).toContain("ELSE 'suppressed'");
    expect(sql[16]).toContain("unsubscribed_at IS NULL");
  });

  it("returns null when the row cannot be claimed", async () => {
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn(() => ({
          run: vi.fn().mockResolvedValue(undefined),
          first: vi.fn().mockResolvedValue(sql.includes("RETURNING id") ? null : undefined),
        })),
      })),
    };

    await expect(createD1LeadDeliveryStore(db as never).claim("download-1")).resolves.toBeNull();
  });

  it("fails closed when a claimed download has no lead", async () => {
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn(() => ({
          run: vi.fn().mockResolvedValue(undefined),
          first: vi.fn().mockResolvedValue(
            sql.includes("RETURNING id")
              ? {
                  id: "download-1",
                  lead_id: "missing",
                  magnet_slug: "guide",
                  source_page: null,
                  email_status: "processing",
                  sequencer_status: "sent",
                }
              : null,
          ),
        })),
      })),
    };

    await expect(createD1LeadDeliveryStore(db as never).claim("download-1")).rejects.toThrow(
      "Lead delivery dependency is missing",
    );
  });

  it("skips hourly recovery when the D1 binding is unavailable", async () => {
    await expect(redispatchPendingLeadDeliveries({} as never)).resolves.toBeUndefined();
    await expect(
      redispatchPendingLeadDeliveries({ MARKETING_DB: {} } as never),
    ).resolves.toBeUndefined();
  });

  it("redispatches each hourly D1 candidate without coupling the batch", async () => {
    const candidateQueries: string[] = [];
    const db = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes("SELECT id, email_only FROM lead_magnet_downloads")) {
          candidateQueries.push(sql);
          return {
            all: vi.fn().mockResolvedValue({
              results: [{ id: "download-1", email_only: 0 }],
            }),
          };
        }
        return {
          bind: vi.fn(() => ({
            run: vi.fn().mockResolvedValue(undefined),
            first: vi.fn().mockResolvedValue(
              sql.includes("RETURNING id")
                ? {
                    id: "download-1",
                    lead_id: "lead-1",
                    magnet_slug: "guide",
                    source_page: null,
                    email_status: "sent",
                    sequencer_status: "sent",
                  }
                : { email: "lead@example.com", first_name: null },
            ),
          })),
        };
      }),
    };

    await redispatchPendingLeadDeliveries({ MARKETING_DB: db } as never);

    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining("LIMIT 100"));
    expect(candidateQueries[0]).toContain("'sending'");
    expect(candidateQueries[0]).toContain("COALESCE(email_claimed_at, '')");
    expect(candidateQueries[0]).toContain("COALESCE(sequencer_claimed_at, '')");
    expect(candidateQueries[0]).not.toContain("COALESCE(delivery_claimed_at, '')");
  });

  it("bounds concurrent recovery claims while continuing through every candidate", async () => {
    const candidates = Array.from({ length: 8 }, (_, index) => ({
      id: `download-${index}`,
      email_only: 0,
    }));
    let activeClaims = 0;
    let maxActiveClaims = 0;
    let completedClaims = 0;
    const db = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes("SELECT id, email_only FROM lead_magnet_downloads")) {
          return { all: vi.fn().mockResolvedValue({ results: candidates }) };
        }
        return {
          bind: vi.fn(() => ({
            run: vi.fn().mockResolvedValue(undefined),
            first: vi.fn(async () => {
              if (!sql.includes("RETURNING id")) return null;
              activeClaims += 1;
              maxActiveClaims = Math.max(maxActiveClaims, activeClaims);
              await new Promise((resolve) => setTimeout(resolve, 5));
              activeClaims -= 1;
              completedClaims += 1;
              return null;
            }),
          })),
        };
      }),
    };

    await redispatchPendingLeadDeliveries({ MARKETING_DB: db } as never);

    expect(completedClaims).toBe(candidates.length);
    expect(maxActiveClaims).toBeLessThanOrEqual(3);
  });
});
