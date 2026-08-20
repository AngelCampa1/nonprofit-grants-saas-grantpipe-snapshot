import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getIntegrations: vi.fn(),
  captureScheduledException: vi.fn(),
}));

vi.mock("../../lib/integrations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/integrations")>()),
  getIntegrations: mocks.getIntegrations,
}));

vi.mock("../../lib/sentry", () => ({
  captureScheduledException: mocks.captureScheduledException,
}));

import {
  buildNotificationEmailDeliveryFields,
  deliverClaimedNotificationEmail,
  dispatchPendingNotificationEmails,
  dispatchNotificationEmail,
  prepareNotificationEmailClaims,
} from "./email-delivery";

function makeUpdateDb(updateRows: unknown[][]) {
  const rows = [...updateRows];
  const setCalls: Array<Record<string, unknown>> = [];
  const db = {
    update: vi.fn(() => {
      const chain = {
        set: vi.fn((values: Record<string, unknown>) => {
          setCalls.push(values);
          return chain;
        }),
        where: vi.fn(() => chain),
        returning: vi.fn(async () => rows.shift() ?? []),
      };
      return chain;
    }),
  };
  return { db, setCalls };
}

describe("scheduled notification email delivery", () => {
  it("freezes an exact provider request with a stable notification idempotency key", async () => {
    const fields = await buildNotificationEmailDeliveryFields("notification-1", {
      orgId: "org-1",
      to: ["person@example.com"],
      subject: "Deadline soon",
      text: "A grant is due soon.",
      source: { orgId: "org-1", entityType: "grant", entityId: "grant-1" },
    });

    expect(fields.emailDeliveryStatus).toBe("pending");
    expect(fields.emailRequestSnapshot).toMatchObject({
      idempotencyKey: "notification-email/notification-1",
      subject: "Deadline soon",
    });
    expect(fields.emailRequestFingerprint).toMatch(/^[a-f0-9]{64}$/);

    const htmlFields = await buildNotificationEmailDeliveryFields("notification-2", {
      orgId: "org-1",
      to: ["person@example.com"],
      subject: "HTML",
      text: "Text",
      html: "<p>HTML</p>",
      source: { entityType: "grant", entityId: "grant-1" },
    });
    expect(htmlFields.emailRequestSnapshot.html).toBe("<p>HTML</p>");
  });

  it("fingerprints equivalent requests identically when nested object keys are reordered", async () => {
    const first = await buildNotificationEmailDeliveryFields("notification-1", {
      orgId: "org-1",
      to: ["person@example.com"],
      subject: "Deadline soon",
      text: "A grant is due soon.",
      source: { orgId: "org-1", entityType: "grant", entityId: "grant-1" },
    });
    const second = await buildNotificationEmailDeliveryFields("notification-1", {
      orgId: "org-1",
      to: ["person@example.com"],
      subject: "Deadline soon",
      text: "A grant is due soon.",
      source: { entityId: "grant-1", entityType: "grant", orgId: "org-1" },
    });

    expect(second.emailRequestFingerprint).toBe(first.emailRequestFingerprint);
  });

  it("accepts a valid frozen request after a JSONB-like recursive key reorder", async () => {
    const fields = await buildNotificationEmailDeliveryFields("notification-1", {
      orgId: "org-1",
      to: ["person@example.com"],
      subject: "Deadline soon",
      text: "A grant is due soon.",
      source: { orgId: "org-1", entityType: "grant", entityId: "grant-1" },
    });
    const snapshot = fields.emailRequestSnapshot;
    const jsonbLikeSnapshot = {
      to: snapshot.to,
      text: snapshot.text,
      source: {
        entityId: snapshot.source.entityId,
        orgId: snapshot.source.orgId,
        entityType: snapshot.source.entityType,
      },
      version: snapshot.version,
      subject: snapshot.subject,
      orgId: snapshot.orgId,
      idempotencyKey: snapshot.idempotencyKey,
    };
    const claimedAt = new Date("2026-07-12T12:00:00Z");
    const { db } = makeUpdateDb([
      [
        {
          id: "notification-1",
          orgId: "org-1",
          type: "grant_deadline",
          emailRequestSnapshot: jsonbLikeSnapshot,
          emailRequestFingerprint: fields.emailRequestFingerprint,
          emailClaimedAt: claimedAt,
          createdAt: new Date("2026-07-12T11:00:00Z"),
        },
      ],
      [],
    ]);
    const send = vi.fn(async () => ({ id: "resend-1" }));

    await expect(
      dispatchNotificationEmail(
        db as never,
        { email: { send }, analytics: { capture: vi.fn() } } as never,
        "notification-1",
        claimedAt,
      ),
    ).resolves.toBe("sent");
    expect(send).toHaveBeenCalledWith(jsonbLikeSnapshot);
  });

  it("prepares only rows with both a dedupe key and an email request", async () => {
    const rows = [
      { orgId: "org-1", userId: "user-1", type: "one", title: "One", dedupeKey: null },
      { orgId: "org-1", userId: "user-1", type: "two", title: "Two", dedupeKey: "two" },
      { orgId: "org-1", userId: "user-1", type: "three", title: "Three", dedupeKey: "three" },
    ];
    const now = new Date("2026-07-12T12:00:00Z");
    const claims = await prepareNotificationEmailClaims(
      rows,
      new Map([
        [
          "three",
          {
            orgId: "org-1",
            to: ["person@example.com"],
            subject: "Three",
            text: "Three",
            source: { entityType: "grant", entityId: "grant-1" },
          },
        ],
      ]),
      now,
    );

    expect(claims.size).toBe(1);
    expect(rows[2]).toMatchObject({
      emailDeliveryStatus: "sending",
      emailClaimedAt: now,
      emailAttemptCount: 1,
    });
  });

  it("replays the frozen request under a CAS lease and marks provider success sent", async () => {
    const fields = await buildNotificationEmailDeliveryFields("notification-1", {
      orgId: "org-1",
      to: ["person@example.com"],
      subject: "Deadline soon",
      text: "A grant is due soon.",
      source: { orgId: "org-1", entityType: "grant", entityId: "grant-1" },
    });
    const snapshot = fields.emailRequestSnapshot;
    const setCalls: Array<Record<string, unknown>> = [];
    const updateRows = [
      [
        {
          id: "notification-1",
          orgId: "org-1",
          type: "grant_deadline",
          emailRequestSnapshot: snapshot,
          emailRequestFingerprint: fields.emailRequestFingerprint,
          emailClaimedAt: new Date("2026-07-12T12:00:00Z"),
          createdAt: new Date("2026-07-12T11:00:00Z"),
        },
      ],
      [],
    ];
    const db = {
      update: vi.fn(() => {
        const chain = {
          set: vi.fn((values: Record<string, unknown>) => {
            setCalls.push(values);
            return chain;
          }),
          where: vi.fn(() => chain),
          returning: vi.fn(async () => updateRows.shift() ?? []),
        };
        return chain;
      }),
    };
    const send = vi.fn(async () => ({ id: "resend-1" }));

    await dispatchNotificationEmail(
      db as never,
      { email: { send }, analytics: { capture: vi.fn() } } as never,
      "notification-1",
      new Date("2026-07-12T12:00:00Z"),
    );

    expect(send).toHaveBeenCalledWith(snapshot);
    expect(setCalls).toContainEqual(
      expect.objectContaining({
        emailDeliveryStatus: "sent",
        emailProviderMessageId: "resend-1",
      }),
    );
  });

  it("skips an email when another worker owns the lease", async () => {
    const { db } = makeUpdateDb([[]]);
    const send = vi.fn();

    await expect(
      dispatchNotificationEmail(
        db as never,
        { email: { send }, analytics: { capture: vi.fn() } } as never,
        "notification-1",
      ),
    ).resolves.toBe("skipped");
    expect(send).not.toHaveBeenCalled();
  });

  it("quarantines a drifted or malformed frozen request without sending", async () => {
    const claimedAt = new Date("2026-07-12T12:00:00Z");
    const { db, setCalls } = makeUpdateDb([
      [
        {
          id: "notification-1",
          orgId: "org-1",
          type: "grant_deadline",
          emailRequestSnapshot: { version: 1, to: [123] },
          emailRequestFingerprint: "wrong",
          emailClaimedAt: claimedAt,
          createdAt: new Date("2026-07-12T11:00:00Z"),
        },
      ],
      [],
    ]);
    const send = vi.fn();

    await expect(
      dispatchNotificationEmail(
        db as never,
        { email: { send }, analytics: { capture: vi.fn() } } as never,
        "notification-1",
        claimedAt,
      ),
    ).resolves.toBe("failed");
    expect(send).not.toHaveBeenCalled();
    expect(setCalls).toContainEqual(
      expect.objectContaining({
        emailDeliveryStatus: "quarantined",
        emailLastError: "provider_request_drift",
      }),
    );
  });

  it("still quarantines a structurally valid request whose content drifted", async () => {
    const fields = await buildNotificationEmailDeliveryFields("notification-1", {
      orgId: "org-1",
      to: ["person@example.com"],
      subject: "Original subject",
      text: "Soon",
      source: { entityType: "grant", entityId: "grant-1" },
    });
    const claimedAt = new Date("2026-07-12T12:00:00Z");
    const { db, setCalls } = makeUpdateDb([
      [
        {
          id: "notification-1",
          orgId: "org-1",
          type: "grant_deadline",
          emailRequestSnapshot: {
            ...fields.emailRequestSnapshot,
            subject: "Changed subject",
          },
          emailRequestFingerprint: fields.emailRequestFingerprint,
          emailClaimedAt: claimedAt,
          createdAt: new Date("2026-07-12T11:00:00Z"),
        },
      ],
      [],
    ]);
    const send = vi.fn();

    await expect(
      dispatchNotificationEmail(
        db as never,
        { email: { send }, analytics: { capture: vi.fn() } } as never,
        "notification-1",
        claimedAt,
      ),
    ).resolves.toBe("failed");
    expect(send).not.toHaveBeenCalled();
    expect(setCalls).toContainEqual(
      expect.objectContaining({
        emailDeliveryStatus: "quarantined",
        emailLastError: "provider_request_drift",
      }),
    );
  });

  it("quarantines stale claims after the provider idempotency window", async () => {
    const now = new Date("2026-07-12T12:00:00Z");
    const fields = await buildNotificationEmailDeliveryFields("notification-1", {
      orgId: "org-1",
      to: ["person@example.com"],
      subject: "Deadline",
      text: "Soon",
      source: { entityType: "grant", entityId: "grant-1" },
    });
    const { db, setCalls } = makeUpdateDb([
      [
        {
          id: "notification-1",
          orgId: "org-1",
          type: "grant_deadline",
          ...fields,
          emailClaimedAt: now,
          createdAt: new Date(now.getTime() - 23 * 60 * 60 * 1000),
        },
      ],
      [],
    ]);
    const send = vi.fn();

    await expect(
      dispatchNotificationEmail(
        db as never,
        { email: { send }, analytics: { capture: vi.fn() } } as never,
        "notification-1",
        now,
      ),
    ).resolves.toBe("failed");
    expect(send).not.toHaveBeenCalled();
    expect(setCalls).toContainEqual(
      expect.objectContaining({ emailLastError: "provider_idempotency_window_expired" }),
    );
  });

  it.each([
    [new Error("Resend API error 409: conflict"), "quarantined"],
    [new Error("Resend API error 422: invalid"), "failed"],
    [new Error("Resend API error 500: down"), "ambiguous"],
    ["network reset", "ambiguous"],
  ])("persists provider failure state and preserves the original failure", async (error, state) => {
    const fields = await buildNotificationEmailDeliveryFields("notification-1", {
      orgId: "org-1",
      to: ["person@example.com"],
      subject: "Deadline",
      text: "Soon",
      source: { entityType: "grant", entityId: "grant-1" },
    });
    const { db, setCalls } = makeUpdateDb([[]]);
    const claim = {
      id: "notification-1",
      orgId: "org-1",
      type: "grant_deadline",
      emailRequestSnapshot: fields.emailRequestSnapshot,
      emailRequestFingerprint: fields.emailRequestFingerprint,
      emailClaimedAt: new Date(),
    };

    await expect(
      deliverClaimedNotificationEmail(
        db as never,
        { email: { send: vi.fn(async () => Promise.reject(error)) } } as never,
        claim,
      ),
    ).rejects.toBe(error);
    expect(setCalls).toContainEqual(expect.objectContaining({ emailDeliveryStatus: state }));
  });

  it("isolates analytics and per-row backlog failures", async () => {
    const fields = await buildNotificationEmailDeliveryFields("notification-1", {
      orgId: "org-1",
      to: ["person@example.com"],
      subject: "Deadline",
      text: "Soon",
      source: { entityType: "grant", entityId: "grant-1" },
    });
    const claimedAt = new Date();
    const { db } = makeUpdateDb([
      [
        {
          id: "notification-1",
          orgId: "org-1",
          type: "grant_deadline",
          ...fields,
          emailClaimedAt: claimedAt,
          createdAt: new Date(claimedAt.getTime() - 60 * 60 * 1000),
        },
      ],
      [],
    ]);
    Object.assign(db, {
      query: { notifications: { findMany: vi.fn(async () => [{ id: "notification-1" }]) } },
    });
    const integrations = {
      email: { send: vi.fn(async () => ({ id: "resend-1" })) },
      analytics: { capture: vi.fn(async () => Promise.reject(new Error("analytics down"))) },
    };
    mocks.getIntegrations.mockReturnValue(integrations);

    await dispatchPendingNotificationEmails(db as never, {} as never, claimedAt);

    expect(integrations.email.send).toHaveBeenCalledOnce();
    expect(mocks.captureScheduledException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "analytics down" }),
      "notifications.email-delivery.analytics",
      "scheduled",
    );
  });

  it("captures state-persistence and backlog-dispatch failures", async () => {
    const fields = await buildNotificationEmailDeliveryFields("notification-1", {
      orgId: "org-1",
      to: ["person@example.com"],
      subject: "Deadline",
      text: "Soon",
      source: { entityType: "grant", entityId: "grant-1" },
    });
    const persistenceError = new Error("database down");
    const providerError = new Error("network down");
    const failingDb = {
      update: vi.fn(() => {
        const chain = {
          set: vi.fn(() => chain),
          where: vi.fn(async () => Promise.reject(persistenceError)),
        };
        return chain;
      }),
    };
    const claim = {
      id: "notification-1",
      orgId: "org-1",
      type: "grant_deadline",
      emailRequestSnapshot: fields.emailRequestSnapshot,
      emailRequestFingerprint: fields.emailRequestFingerprint,
      emailClaimedAt: new Date(),
    };

    await expect(
      deliverClaimedNotificationEmail(
        failingDb as never,
        { email: { send: vi.fn(async () => Promise.reject(providerError)) } } as never,
        claim,
      ),
    ).rejects.toBe(providerError);
    expect(mocks.captureScheduledException).toHaveBeenCalledWith(
      persistenceError,
      "notifications.email-delivery.persist-failure",
      "scheduled",
    );

    const backlogDb = makeUpdateDb([
      [
        {
          id: "notification-1",
          orgId: "org-1",
          type: "grant_deadline",
          ...fields,
          emailClaimedAt: claim.emailClaimedAt,
          createdAt: new Date(claim.emailClaimedAt.getTime() - 60 * 60 * 1000),
        },
      ],
      [],
    ]).db;
    Object.assign(backlogDb, {
      query: { notifications: { findMany: vi.fn(async () => [{ id: "notification-1" }]) } },
    });
    mocks.getIntegrations.mockReturnValue({
      email: { send: vi.fn(async () => Promise.reject(providerError)) },
    });

    await dispatchPendingNotificationEmails(backlogDb as never, {} as never, claim.emailClaimedAt);
    expect(mocks.captureScheduledException).toHaveBeenCalledWith(
      providerError,
      "notifications.email-delivery.dispatch",
      "scheduled",
    );
  });
});
