import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { communicationLog, donorMailMergeDeliveries } from "@grantpipe/db";
import { sendDonorMailMerge } from "./mail-merge.service";

vi.mock("../../lib/email-layout", () => ({
  renderEmailLayout: vi.fn(({ body }: { body: string }) => `<html>${body}</html>`),
}));

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn(),
}));

vi.mock("../../lib/sentry", () => ({
  captureBackgroundException: vi.fn(),
}));

import { recordActivityLog } from "../../lib/activity-log";
import { captureBackgroundException } from "../../lib/sentry";

type TestContactRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  organizationName: string | null;
  email: string | null;
  emailOptOut: boolean;
};

const contactRows: TestContactRow[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    firstName: "Jane",
    lastName: "Doe",
    organizationName: null,
    email: "jane@example.org",
    emailOptOut: false,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    firstName: "No",
    lastName: "Email",
    organizationName: null,
    email: null,
    emailOptOut: false,
  },
];

const ATTEMPT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function makeDb(
  rows: TestContactRow[] = contactRows,
  options: { failTransactionCalls?: number[]; failDeliveryStateStatuses?: string[] } = {},
) {
  const persistedKeys = new Set<string>();
  const deliveries = new Map<
    string,
    {
      id: string;
      status: string;
      providerMessageId: string | null;
      lastError: string | null;
      requestFingerprint: string | null;
      requestSnapshot: unknown;
      createdAt: Date;
      updatedAt: Date;
    }
  >();
  let activeDeliveryKey = "";
  const deliveryKey = (row: Record<string, unknown>) =>
    `${String(row.orgId)}:${String(row.contactId)}:${String(row.attemptId)}`;
  const returning = vi.fn(async (row?: Record<string, unknown>) => {
    if (!row) return [{ id: "comm-1" }];
    const key = `${String(row.orgId)}:${String(row.contactId)}:${String(row.mailMergeAttemptId)}`;
    if (persistedKeys.has(key)) return [];
    persistedKeys.add(key);
    return [{ id: `comm-${persistedKeys.size}` }];
  });
  const values = vi.fn();
  const insert = vi.fn((table: unknown) => ({
    values: values.mockImplementationOnce((row: Record<string, unknown>) => {
      if (table === donorMailMergeDeliveries) {
        activeDeliveryKey = deliveryKey(row);
        return {
          onConflictDoNothing: vi.fn(async () => {
            if (!deliveries.has(activeDeliveryKey)) {
              deliveries.set(activeDeliveryKey, {
                id: `delivery-${deliveries.size + 1}`,
                status: "pending",
                providerMessageId: null,
                lastError: null,
                requestFingerprint:
                  typeof row.requestFingerprint === "string" ? row.requestFingerprint : null,
                requestSnapshot: row.requestSnapshot ?? null,
                createdAt: new Date(),
                updatedAt: new Date(),
              });
            }
          }),
        };
      }
      expect(table).toBe(communicationLog);
      return {
        onConflictDoNothing: vi.fn(() => ({ returning: () => returning(row) })),
        returning: () => returning(row),
      };
    }),
  }));
  const update = vi.fn((table: unknown) => {
    expect(table).toBe(donorMailMergeDeliveries);
    return {
      set: vi.fn((changes: Record<string, unknown>) => ({
        where: vi.fn(() => {
          if (options.failDeliveryStateStatuses?.includes(String(changes.status))) {
            return Promise.reject(new Error("simulated delivery state persistence failure"));
          }
          const delivery = deliveries.get(activeDeliveryKey);
          const now = new Date();
          const isRecoveryClaim =
            changes.status === "sending" &&
            (delivery?.status === "sending" || delivery?.status === "ambiguous") &&
            now.getTime() - delivery.updatedAt.getTime() >= 5 * 60 * 1000 &&
            now.getTime() - delivery.createdAt.getTime() < 23 * 60 * 60 * 1000;
          const canUpdate =
            (changes.status === "sending" &&
              (delivery?.status === "pending" ||
                delivery?.status === "failed" ||
                isRecoveryClaim)) ||
            (changes.status !== "sending" && delivery?.status === "sending") ||
            (changes.status === "quarantined" && delivery?.status !== "sent");
          if (delivery && canUpdate) Object.assign(delivery, changes);
          return {
            then: (resolve: (value: unknown) => unknown) => resolve(undefined),
            returning: async () => (delivery && canUpdate ? [{ id: delivery.id }] : []),
          };
        }),
      })),
    };
  });
  const where = vi.fn().mockResolvedValue(rows);
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  const tx = {
    insert,
    update,
    query: {
      donorMailMergeDeliveries: {
        findFirst: vi.fn(async () => deliveries.get(activeDeliveryKey)),
      },
    },
  };
  let transactionCall = 0;
  return {
    select,
    insert,
    update,
    transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => {
      transactionCall += 1;
      if (options.failTransactionCalls?.includes(transactionCall)) {
        throw new Error("simulated communication persistence failure");
      }
      return callback(tx);
    }),
    tx,
    values,
    returning,
    deliveries,
    persistedKeys,
  };
}

describe("sendDonorMailMerge", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(recordActivityLog).mockResolvedValue(undefined);
  });

  afterEach(() => vi.useRealTimers());

  it("sends personalized emails and logs successful recipient communications", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const db = makeDb();

    const result = await sendDonorMailMerge(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      resendApiKey: "resend-key",
      attemptId: ATTEMPT_ID,
      contactIds: contactRows.map((row) => row.id),
      subject: "Hi {{firstName}}",
      body: "Dear {{fullName}}, thanks.",
    });

    expect(result).toMatchObject({ requested: 2, sent: 1, skipped: 1, failed: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      to: string[];
      subject: string;
      text: string;
    };
    expect(payload.to).toEqual(["jane@example.org"]);
    expect(payload.subject).toBe("Hi Jane");
    expect(payload.text).toContain("Dear Jane Doe, thanks.");
    expect(payload.text).toContain("To opt out of donor emails, reply to this email");
    expect(db.tx.insert).toHaveBeenCalledTimes(2);
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        contactId: contactRows[0]?.id,
        loggedBy: "user-1",
        type: "email",
        subject: "Hi Jane",
      }),
    );
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "created_communication",
        entityType: "contact",
        entityId: contactRows[0]?.id,
      }),
    );
  });

  it("rejects a legacy request that omitted its attempt id before delivery", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const db = makeDb([contactRows[0]!]);

    await expect(
      sendDonorMailMerge(
        db as never,
        {
          orgId: "org-1",
          actorId: "user-1",
          resendApiKey: "resend-key",
          contactIds: [contactRows[0]!.id],
          subject: "Hello",
          body: "Message",
        } as never,
      ),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("continues the batch but never resends an ambiguous delivery", async () => {
    const rows = [
      contactRows[0]!,
      {
        id: "77777777-7777-4777-8777-777777777777",
        firstName: "Alex",
        lastName: "Smith",
        organizationName: null,
        email: "alex@example.org",
        emailOptOut: false,
      },
    ];
    const acceptedKeys = new Set<string>();
    let delivered = 0;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const key = new Headers(init?.headers).get("Idempotency-Key");
      if (!key || !acceptedKeys.has(key)) {
        delivered += 1;
        if (key) acceptedKeys.add(key);
      }
      return { ok: true, status: 200, json: async () => ({ id: `msg-${delivered}` }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const db = makeDb(rows, { failTransactionCalls: [2] });
    const params = {
      orgId: "org-1",
      actorId: "user-1",
      resendApiKey: "resend-key",
      attemptId: ATTEMPT_ID,
      contactIds: rows.map((row) => row.id),
      subject: "Hello {{firstName}}",
      body: "Message",
    };

    const first = await sendDonorMailMerge(db as never, params);
    const retry = await sendDonorMailMerge(db as never, params);

    expect(first).toMatchObject({ requested: 2, sent: 1, failed: 1 });
    expect(retry).toMatchObject({ requested: 2, sent: 1, failed: 1 });
    expect(retry.recipients[0]).toMatchObject({
      status: "failed",
      error: "delivery_reconciliation_required",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(delivered).toBe(2);
    expect(
      fetchMock.mock.calls.map(([, init]) => new Headers(init?.headers).get("Idempotency-Key")),
    ).toEqual([
      `donor-mail/${ATTEMPT_ID}/${rows[0]!.id}`,
      `donor-mail/${ATTEMPT_ID}/${rows[1]!.id}`,
    ]);
    expect(recordActivityLog).toHaveBeenCalledTimes(1);
    expect(captureBackgroundException).toHaveBeenCalledWith(
      expect.any(Error),
      "donor-mail-merge",
      expect.objectContaining({
        step: "persist_recipient_communication",
        attempt_id: ATTEMPT_ID,
      }),
    );
    expect(JSON.stringify(vi.mocked(captureBackgroundException).mock.calls)).not.toContain(
      "jane@example.org",
    );
  });

  it("returns failed recipient status without logging when Resend rejects the send", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 429, text: vi.fn().mockResolvedValue("rate") }),
    );
    const db = makeDb([contactRows[0]!]);

    const result = await sendDonorMailMerge(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      resendApiKey: "resend-key",
      attemptId: ATTEMPT_ID,
      contactIds: [contactRows[0]!.id],
      subject: "Hello",
      body: "Message",
    });

    expect(result).toMatchObject({ requested: 1, sent: 0, skipped: 0, failed: 1 });
    expect(result.recipients[0]).toMatchObject({ status: "failed" });
    expect(db.returning).not.toHaveBeenCalled();
  });

  it("marks a network-ambiguous provider request for reconciliation and never resends it", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("connection closed after request write"));
    vi.stubGlobal("fetch", fetchMock);
    const db = makeDb([contactRows[0]!]);
    const params = {
      orgId: "org-1",
      actorId: "user-1",
      resendApiKey: "resend-key",
      attemptId: ATTEMPT_ID,
      contactIds: [contactRows[0]!.id],
      subject: "Hello",
      body: "Message",
    };

    const first = await sendDonorMailMerge(db as never, params);
    const retry = await sendDonorMailMerge(db as never, params);

    expect(first.recipients[0]).toMatchObject({
      status: "failed",
      error: "delivery_reconciliation_required",
    });
    expect(retry.recipients[0]).toMatchObject({
      status: "failed",
      error: "delivery_reconciliation_required",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(captureBackgroundException).toHaveBeenCalledWith(
      expect.any(Error),
      "donor-mail-merge",
      expect.objectContaining({ step: "provider_request_ambiguous" }),
    );
  });

  it.each([408, 425, 429, 500, 503])(
    "treats transient HTTP %s as ambiguous and does not immediately resend",
    async (status) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status, text: async () => "transient failure" });
      vi.stubGlobal("fetch", fetchMock);
      const db = makeDb([contactRows[0]!]);
      const params = {
        orgId: "org-1",
        actorId: "user-1",
        resendApiKey: "resend-key",
        attemptId: ATTEMPT_ID,
        contactIds: [contactRows[0]!.id],
        subject: "Hello",
        body: "Message",
      };

      const first = await sendDonorMailMerge(db as never, params);
      const immediateRetry = await sendDonorMailMerge(db as never, params);

      expect(first.recipients[0]).toMatchObject({
        status: "failed",
        error: "delivery_reconciliation_required",
      });
      expect(immediateRetry.recipients[0]).toMatchObject({
        status: "failed",
        error: "delivery_reconciliation_required",
      });
      expect([...db.deliveries.values()][0]?.status).toBe("ambiguous");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("retries an ambiguous delivery with the same provider key after its lease expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-11T12:00:00.000Z"));
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("connection closed"))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "msg-recovered" }) });
    vi.stubGlobal("fetch", fetchMock);
    const db = makeDb([contactRows[0]!]);
    const params = {
      orgId: "org-1",
      actorId: "user-1",
      resendApiKey: "resend-key",
      attemptId: ATTEMPT_ID,
      contactIds: [contactRows[0]!.id],
      subject: "Hello",
      body: "Message",
    };

    expect((await sendDonorMailMerge(db as never, params)).failed).toBe(1);
    vi.setSystemTime(new Date("2026-07-11T12:06:00.000Z"));
    expect((await sendDonorMailMerge(db as never, params)).sent).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const keys = fetchMock.mock.calls.map(([, init]) =>
      new Headers(init?.headers).get("Idempotency-Key"),
    );
    expect(new Set(keys)).toEqual(new Set([`donor-mail/${ATTEMPT_ID}/${contactRows[0]!.id}`]));
  });

  it("persists the exact provider request before the first provider touch", async () => {
    const db = makeDb([contactRows[0]!]);
    const fetchMock = vi.fn(async () => {
      const delivery = [...db.deliveries.values()][0];
      expect(delivery?.requestFingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(delivery?.requestSnapshot).toMatchObject({
        endpoint: "https://api.resend.com/emails",
        idempotencyKey: `donor-mail/${ATTEMPT_ID}/${contactRows[0]!.id}`,
        payload: expect.objectContaining({
          to: ["jane@example.org"],
          subject: "Hello Jane",
        }),
      });
      return { ok: true, json: async () => ({ id: "msg-snapshot" }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(
      (
        await sendDonorMailMerge(db as never, {
          orgId: "org-1",
          actorId: "user-1",
          resendApiKey: "resend-key",
          attemptId: ATTEMPT_ID,
          contactIds: [contactRows[0]!.id],
          subject: "Hello {{firstName}}",
          body: "Message",
        })
      ).sent,
    ).toBe(1);
  });

  it("quarantines a retry whose current payload drifted from the persisted request", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-11T12:00:00.000Z"));
    const mutableContact = { ...contactRows[0]! };
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("connection closed"));
    vi.stubGlobal("fetch", fetchMock);
    const db = makeDb([mutableContact]);
    const params = {
      orgId: "org-1",
      actorId: "user-1",
      resendApiKey: "resend-key",
      attemptId: ATTEMPT_ID,
      contactIds: [mutableContact.id],
      subject: "Hello {{firstName}}",
      body: "Message",
    };

    expect((await sendDonorMailMerge(db as never, params)).failed).toBe(1);
    mutableContact.firstName = "Changed";
    vi.setSystemTime(new Date("2026-07-11T12:06:00.000Z"));
    const retry = await sendDonorMailMerge(db as never, params);

    expect(retry.recipients[0]).toMatchObject({
      status: "failed",
      error: "delivery_reconciliation_required",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect([...db.deliveries.values()][0]?.status).toBe("quarantined");
  });

  it("keeps a completed delivery sent when later contact data drifts", async () => {
    const mutableContact = { ...contactRows[0]! };
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ id: "msg-complete" }) });
    vi.stubGlobal("fetch", fetchMock);
    const db = makeDb([mutableContact]);
    const params = {
      orgId: "org-1",
      actorId: "user-1",
      resendApiKey: "resend-key",
      attemptId: ATTEMPT_ID,
      contactIds: [mutableContact.id],
      subject: "Hello {{firstName}}",
      body: "Message",
    };

    expect((await sendDonorMailMerge(db as never, params)).sent).toBe(1);
    mutableContact.firstName = "Changed";
    expect((await sendDonorMailMerge(db as never, params)).sent).toBe(1);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect([...db.deliveries.values()][0]?.status).toBe("sent");
  });

  it("quarantines an invalid Resend idempotency conflict instead of retrying it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () =>
        JSON.stringify({ name: "invalid_idempotent_request", message: "payload changed" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const db = makeDb([contactRows[0]!]);
    const params = {
      orgId: "org-1",
      actorId: "user-1",
      resendApiKey: "resend-key",
      attemptId: ATTEMPT_ID,
      contactIds: [contactRows[0]!.id],
      subject: "Hello",
      body: "Message",
    };

    const first = await sendDonorMailMerge(db as never, params);
    const retry = await sendDonorMailMerge(db as never, params);

    expect(first.recipients[0]).toMatchObject({
      status: "failed",
      error: "delivery_reconciliation_required",
    });
    expect(retry.recipients[0]).toMatchObject({
      status: "failed",
      error: "delivery_reconciliation_required",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect([...db.deliveries.values()][0]?.status).toBe("quarantined");
    expect(captureBackgroundException).toHaveBeenCalledWith(
      expect.any(Error),
      "donor-mail-merge",
      expect.objectContaining({ step: "provider_idempotency_conflict" }),
    );
  });

  it("allows only one concurrent sender to hold the delivery lease", async () => {
    let releaseProvider: (value: {
      ok: true;
      json: () => Promise<{ id: string }>;
    }) => void = () => {
      throw new Error("Provider request was not started");
    };
    const fetchMock = vi.fn(
      () =>
        new Promise<{ ok: true; json: () => Promise<{ id: string }> }>((resolve) => {
          releaseProvider = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const db = makeDb([contactRows[0]!]);
    const params = {
      orgId: "org-1",
      actorId: "user-1",
      resendApiKey: "resend-key",
      attemptId: ATTEMPT_ID,
      contactIds: [contactRows[0]!.id],
      subject: "Hello",
      body: "Message",
    };

    const firstSend = sendDonorMailMerge(db as never, params);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const concurrentSend = await sendDonorMailMerge(db as never, params);
    expect(concurrentSend.recipients[0]).toMatchObject({
      status: "failed",
      error: "delivery_reconciliation_required",
    });
    releaseProvider({ ok: true, json: async () => ({ id: "msg-concurrent" }) });
    expect((await firstSend).sent).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("quarantines an ambiguous delivery after the provider idempotency window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-11T12:00:00.000Z"));
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("connection closed"));
    vi.stubGlobal("fetch", fetchMock);
    const db = makeDb([contactRows[0]!]);
    const params = {
      orgId: "org-1",
      actorId: "user-1",
      resendApiKey: "resend-key",
      attemptId: ATTEMPT_ID,
      contactIds: [contactRows[0]!.id],
      subject: "Hello",
      body: "Message",
    };

    await sendDonorMailMerge(db as never, params);
    vi.setSystemTime(new Date("2026-07-12T12:00:01.000Z"));
    const retry = await sendDonorMailMerge(db as never, params);
    const quarantinedRetry = await sendDonorMailMerge(db as never, params);

    expect(retry.recipients[0]).toMatchObject({
      status: "failed",
      error: "delivery_reconciliation_required",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(quarantinedRetry.recipients[0]).toMatchObject({
      status: "failed",
      error: "delivery_reconciliation_required",
    });
    expect([...db.deliveries.values()][0]?.status).toBe("quarantined");
    expect(captureBackgroundException).toHaveBeenCalledWith(
      expect.any(Error),
      "donor-mail-merge",
      expect.objectContaining({ step: "reconcile_quarantined_delivery" }),
    );
  });

  it("does not let an ambiguous provider result overwrite a concurrently sent delivery", async () => {
    const db = makeDb([contactRows[0]!]);
    const fetchMock = vi.fn(async () => {
      const delivery = [...db.deliveries.values()][0]!;
      delivery.status = "sent";
      delivery.updatedAt = new Date();
      throw new Error("late connection reset");
    });
    vi.stubGlobal("fetch", fetchMock);

    await sendDonorMailMerge(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      resendApiKey: "resend-key",
      attemptId: ATTEMPT_ID,
      contactIds: [contactRows[0]!.id],
      subject: "Hello",
      body: "Message",
    });

    expect([...db.deliveries.values()][0]?.status).toBe("sent");
  });

  it("continues when persisting a network-ambiguous provider state fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection reset")));
    const db = makeDb([contactRows[0]!], {
      failDeliveryStateStatuses: ["ambiguous"],
    });

    const result = await sendDonorMailMerge(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      resendApiKey: "resend-key",
      attemptId: ATTEMPT_ID,
      contactIds: [contactRows[0]!.id],
      subject: "Hello",
      body: "Message",
    });

    expect(result.recipients[0]).toMatchObject({
      status: "failed",
      error: "delivery_reconciliation_required",
    });
    expect(captureBackgroundException).toHaveBeenCalledWith(
      expect.any(Error),
      "donor-mail-merge",
      expect.objectContaining({ step: "persist_provider_ambiguity_state" }),
    );
  });

  it("allows retry after a definite provider rejection", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 422, text: async () => "invalid request" })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "msg-retry" }) });
    vi.stubGlobal("fetch", fetchMock);
    const db = makeDb([contactRows[0]!]);
    const params = {
      orgId: "org-1",
      actorId: "user-1",
      resendApiKey: "resend-key",
      attemptId: ATTEMPT_ID,
      contactIds: [contactRows[0]!.id],
      subject: "Hello",
      body: "Message",
    };

    expect((await sendDonorMailMerge(db as never, params)).failed).toBe(1);
    expect((await sendDonorMailMerge(db as never, params)).sent).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("continues the batch when persisting a definite provider rejection fails", async () => {
    const secondContact = {
      ...contactRows[0]!,
      id: "77777777-7777-4777-8777-777777777777",
      email: "alex@example.org",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 422, text: async () => "invalid request" })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "msg-second" }) });
    vi.stubGlobal("fetch", fetchMock);
    const db = makeDb([contactRows[0]!, secondContact], {
      failDeliveryStateStatuses: ["failed"],
    });

    const result = await sendDonorMailMerge(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      resendApiKey: "resend-key",
      attemptId: ATTEMPT_ID,
      contactIds: [contactRows[0]!.id, secondContact.id],
      subject: "Hello",
      body: "Message",
    });

    expect(result).toMatchObject({ requested: 2, sent: 1, failed: 1 });
    expect(result.recipients[0]).toMatchObject({
      status: "failed",
      error: "delivery_reconciliation_required",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(captureBackgroundException).toHaveBeenCalledWith(
      expect.any(Error),
      "donor-mail-merge",
      expect.objectContaining({ step: "persist_provider_rejection_state" }),
    );
  });

  it("continues later recipients when a pre-send delivery claim fails", async () => {
    const secondContact = {
      ...contactRows[0]!,
      id: "77777777-7777-4777-8777-777777777777",
      email: "alex@example.org",
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "msg-second" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const db = makeDb([contactRows[0]!, secondContact], { failTransactionCalls: [1] });

    const result = await sendDonorMailMerge(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      resendApiKey: "resend-key",
      attemptId: ATTEMPT_ID,
      contactIds: [contactRows[0]!.id, secondContact.id],
      subject: "Hello",
      body: "Message",
    });

    expect(result).toMatchObject({ requested: 2, sent: 1, failed: 1 });
    expect(result.recipients[0]).toMatchObject({
      status: "failed",
      error: "delivery_claim_failed",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(captureBackgroundException).toHaveBeenCalledWith(
      expect.any(Error),
      "donor-mail-merge",
      expect.objectContaining({ step: "claim_delivery" }),
    );
  });

  it("marks a delivery sent when its communication log already exists", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "msg-existing-log" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const db = makeDb([contactRows[0]!]);
    db.persistedKeys.add(`org-1:${contactRows[0]!.id}:${ATTEMPT_ID}`);
    const params = {
      orgId: "org-1",
      actorId: "user-1",
      resendApiKey: "resend-key",
      attemptId: ATTEMPT_ID,
      contactIds: [contactRows[0]!.id],
      subject: "Hello",
      body: "Message",
    };

    expect((await sendDonorMailMerge(db as never, params)).sent).toBe(1);
    expect((await sendDonorMailMerge(db as never, params)).sent).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).not.toHaveBeenCalled();
  });

  it("uses organization, email, and missing-contact fallbacks in recipient names", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "msg-1" }) });
    vi.stubGlobal("fetch", fetchMock);
    const orgContact = {
      id: "33333333-3333-4333-8333-333333333333",
      firstName: null,
      lastName: null,
      organizationName: " Food Bank ",
      email: "team@example.org",
      emailOptOut: false,
    };
    const emailOnlyContact = {
      id: "44444444-4444-4444-8444-444444444444",
      firstName: null,
      lastName: null,
      organizationName: null,
      email: "solo@example.org",
      emailOptOut: false,
    };
    const missingContactId = "55555555-5555-4555-8555-555555555555";
    const db = makeDb([orgContact, emailOnlyContact]);

    const result = await sendDonorMailMerge(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      resendApiKey: "resend-key",
      attemptId: ATTEMPT_ID,
      contactIds: [orgContact.id, emailOnlyContact.id, missingContactId],
      subject: "Hello {{organizationName}}{{email}}",
      body: "Hi {{fullName}}",
    });

    expect(result).toMatchObject({ requested: 3, sent: 2, skipped: 1, failed: 0 });
    expect(result.recipients).toEqual([
      expect.objectContaining({ contactId: orgContact.id, name: "Food Bank", status: "sent" }),
      expect.objectContaining({
        contactId: emailOnlyContact.id,
        name: "solo@example.org",
        status: "sent",
      }),
      expect.objectContaining({
        contactId: missingContactId,
        name: "Donor",
        status: "skipped_missing_email",
      }),
    ]);
  });

  it("escapes rendered HTML and preserves single newlines inside paragraphs", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "msg-1" }) });
    vi.stubGlobal("fetch", fetchMock);
    const db = makeDb([contactRows[0]!]);

    await sendDonorMailMerge(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      resendApiKey: "resend-key",
      attemptId: ATTEMPT_ID,
      contactIds: [contactRows[0]!.id],
      subject: "Hello {{firstName}}",
      body: "Line <one>\nLine & two\n\nQuote 'here'",
    });

    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      html: string;
      text: string;
    };
    expect(payload.html).toContain("Line &lt;one&gt;<br/>Line &amp; two");
    expect(payload.html).toContain("Quote &#39;here&#39;");
    expect(payload.text).toContain("Line <one>\nLine & two\n\nQuote 'here'");
  });

  it("treats whitespace-only email addresses as skipped", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const whitespaceEmailContact = {
      id: "66666666-6666-4666-8666-666666666666",
      firstName: "Blank",
      lastName: "Email",
      organizationName: null,
      email: "   ",
      emailOptOut: false,
    };

    const result = await sendDonorMailMerge(makeDb([whitespaceEmailContact]) as never, {
      orgId: "org-1",
      actorId: "user-1",
      resendApiKey: "resend-key",
      attemptId: ATTEMPT_ID,
      contactIds: [whitespaceEmailContact.id],
      subject: "Hello",
      body: "Message",
    });

    expect(result).toMatchObject({ requested: 1, sent: 0, skipped: 1, failed: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("skips opted-out contacts without sending email", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const optedOutContact = {
      id: "88888888-8888-4888-8888-888888888888",
      firstName: "Opted",
      lastName: "Out",
      organizationName: null,
      email: "opted@example.org",
      emailOptOut: true,
    };

    const result = await sendDonorMailMerge(makeDb([optedOutContact]) as never, {
      orgId: "org-1",
      actorId: "user-1",
      resendApiKey: "resend-key",
      attemptId: ATTEMPT_ID,
      contactIds: [optedOutContact.id],
      subject: "Hello",
      body: "Message",
    });

    expect(result).toMatchObject({ requested: 1, sent: 0, skipped: 1, failed: 0 });
    expect(result.recipients[0]).toMatchObject({
      contactId: optedOutContact.id,
      email: "opted@example.org",
      status: "skipped_unsubscribed",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses generic donor fallback for contacts without a name or email", async () => {
    const unnamedContact = {
      id: "77777777-7777-4777-8777-777777777777",
      firstName: null,
      lastName: null,
      organizationName: null,
      email: null,
      emailOptOut: false,
    };

    const result = await sendDonorMailMerge(makeDb([unnamedContact]) as never, {
      orgId: "org-1",
      actorId: "user-1",
      resendApiKey: "resend-key",
      attemptId: ATTEMPT_ID,
      contactIds: [unnamedContact.id],
      subject: "Hello",
      body: "Message",
    });

    expect(result.recipients[0]).toMatchObject({
      contactId: unnamedContact.id,
      name: "Donor",
      status: "skipped_missing_email",
    });
  });

  it("adds unsubscribe headers to donor email payloads", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "msg-1" }) });
    vi.stubGlobal("fetch", fetchMock);

    await sendDonorMailMerge(makeDb([contactRows[0]!]) as never, {
      orgId: "org-1",
      actorId: "user-1",
      resendApiKey: "resend-key",
      attemptId: ATTEMPT_ID,
      contactIds: [contactRows[0]!.id],
      subject: "Hello",
      body: "Message",
    });

    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      headers: Record<string, string>;
      html: string;
    };
    expect(payload.headers["List-Unsubscribe"]).toMatch(/^<mailto:/);
    expect(payload.headers).not.toHaveProperty("List-Unsubscribe-Post");
    expect(payload.html).toContain("To opt out of donor emails");
  });

  it("fails fast when Resend is not configured", async () => {
    await expect(
      sendDonorMailMerge(makeDb() as never, {
        orgId: "org-1",
        actorId: "user-1",
        resendApiKey: "",
        attemptId: ATTEMPT_ID,
        contactIds: [contactRows[0]!.id],
        subject: "Hello",
        body: "Message",
      }),
    ).rejects.toThrow("RESEND_API_KEY is required for donor email delivery");
  });
});
