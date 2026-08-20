import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  createPostgresInvitationDeliveryStore,
  createInvitationRequestFingerprint,
  fingerprintReviewerInviteRequestPayload,
  dispatchInvitationDelivery,
  dispatchInvitationDeliveryWithDedicatedHandle,
  redispatchPendingInvitations,
  isInvitationDeliveryEligible,
  type InvitationDeliveryStore,
} from "./invitation-delivery.service";
import { sendReviewerInviteEmail, sendSessionExtendedEmail } from "./email";
import { signPortalToken } from "./tokens";

vi.mock("./email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./email")>()),
  sendReviewerInviteEmail: vi.fn(),
  sendSessionExtendedEmail: vi.fn(),
}));

function renderSql(condition: unknown) {
  const dialect = new PgDialect();
  return dialect.sqlToQuery(condition as Parameters<PgDialect["sqlToQuery"]>[0]);
}

const intent = {
  sessionId: "session-1",
  reviewerId: "reviewer-1",
  orgId: "org-1",
  attempt: 1,
  claimedAt: new Date("2026-07-11T12:00:00Z"),
  deliveryKind: "invite" as const,
  reviewerEmail: "reviewer@example.com",
  reviewerName: "Reviewer",
  inviterName: "Inviter",
  orgName: "Org",
  purpose: "Audit",
  expiresAt: new Date("2026-08-01T00:00:00Z"),
  portalUrl: "https://app.grantpipe.com/portal/token",
};

function fakeStore(): InvitationDeliveryStore {
  return {
    claim: vi.fn().mockResolvedValue(intent),
    authorize: vi.fn().mockResolvedValue("authorized"),
    suppress: vi.fn().mockResolvedValue(undefined),
    markSent: vi.fn().mockResolvedValue(undefined),
    markUnavailable: vi.fn().mockResolvedValue(undefined),
    markRetryable: vi.fn().mockResolvedValue(undefined),
    markAmbiguous: vi.fn().mockResolvedValue(undefined),
    markQuarantined: vi.fn().mockResolvedValue(undefined),
  };
}

describe("external reviewer invitation delivery", () => {
  // `claim()` gates on `isInvitationDeliveryEligible(session, new Date())` using
  // the real clock, which it does not accept as a parameter. The fixtures above
  // expire on 2026-08-01, so once that date passed every claim started returning
  // null and seven tests broke without a line of source changing. Freeze the
  // clock instead of moving the constant forward, which would only re-arm it.
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-11T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("owns and closes a dedicated database handle for background delivery", async () => {
    const order: string[] = [];
    const close = vi.fn(async () => {
      order.push("dedicated-close");
    });
    const openHandle = vi.fn(async () => ({
      db: { marker: "dedicated-db" } as never,
      close,
    }));
    const dispatch = vi.fn(async () => {
      order.push("dispatch");
    });

    await dispatchInvitationDeliveryWithDedicatedHandle(
      {
        DATABASE_URL: "postgres://dedicated",
        HYPERDRIVE: { connectionString: "postgres://hd" },
      } as never,
      "session-1",
      { openHandle, dispatch },
    );

    expect(openHandle).toHaveBeenCalledWith("postgres://dedicated", {
      connectionString: "postgres://hd",
    });
    expect(dispatch).toHaveBeenCalledWith(expect.anything(), expect.anything(), "session-1");
    expect(order).toEqual(["dispatch", "dedicated-close"]);
    expect(close).toHaveBeenCalledOnce();
  });

  it("closes the dedicated handle when background delivery fails", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const failure = new Error("delivery failed");

    await expect(
      dispatchInvitationDeliveryWithDedicatedHandle(
        { DATABASE_URL: "postgres://db" } as never,
        "session-1",
        {
          openHandle: vi.fn(async () => ({ db: {} as never, close })),
          dispatch: vi.fn().mockRejectedValue(failure),
        },
      ),
    ).rejects.toThrow(failure);
    expect(close).toHaveBeenCalledOnce();
  });

  it("suppresses revoked and expired sessions before any provider call", () => {
    const now = new Date("2026-07-11T12:00:00Z");

    expect(
      isInvitationDeliveryEligible(
        { revokedAt: new Date("2026-07-11T11:00:00Z"), expiresAt: intent.expiresAt },
        now,
      ),
    ).toBe(false);
    expect(
      isInvitationDeliveryEligible(
        { revokedAt: null, expiresAt: new Date("2026-07-11T11:59:59Z") },
        now,
      ),
    ).toBe(false);
    expect(
      isInvitationDeliveryEligible({ revokedAt: null, expiresAt: intent.expiresAt }, now),
    ).toBe(true);
  });

  it("reuses one stable provider key and marks the intent sent", async () => {
    const store = fakeStore();
    vi.mocked(sendReviewerInviteEmail).mockResolvedValue(undefined);

    await dispatchInvitationDelivery(store, { RESEND_API_KEY: "resend" } as never, "session-1");

    expect(sendReviewerInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "external-review-invite/session-1/1" }),
    );
    expect(store.markSent).toHaveBeenCalledWith("session-1", 1, intent.claimedAt);
  });

  it("uses the durable extension template and attempt-scoped provider key", async () => {
    const store = fakeStore();
    vi.mocked(store.claim).mockResolvedValue({
      ...intent,
      attempt: 2,
      deliveryKind: "extension",
      orgName: "Actual Org Name",
    });
    vi.mocked(sendSessionExtendedEmail).mockResolvedValue(undefined);

    await dispatchInvitationDelivery(store, { RESEND_API_KEY: "resend" } as never, "session-1");

    expect(sendSessionExtendedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        orgName: "Actual Org Name",
        idempotencyKey: "external-review-invite/session-1/2",
      }),
    );
    expect(sendReviewerInviteEmail).not.toHaveBeenCalled();
    expect(store.markSent).toHaveBeenCalledWith("session-1", 2, intent.claimedAt);
  });

  it("restores a missing Resend credential under the original invitation key", async () => {
    const store = fakeStore();
    vi.mocked(store.claim).mockResolvedValue({
      ...intent,
      attempt: 2,
      deliveryKind: "extension",
    });
    await dispatchInvitationDelivery(store, {} as never, "session-1");
    await dispatchInvitationDelivery(store, { RESEND_API_KEY: "restored" } as never, "session-1");

    expect(store.markUnavailable).toHaveBeenCalledWith(
      "session-1",
      2,
      intent.claimedAt,
      "RESEND_API_KEY is not configured",
    );
    expect(store.markRetryable).not.toHaveBeenCalled();
    expect(sendSessionExtendedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "external-review-invite/session-1/2" }),
    );
    expect(store.markSent).toHaveBeenCalledWith("session-1", 2, intent.claimedAt);
  });

  it("rechecks reviewer eligibility immediately before provider delivery", async () => {
    const store = fakeStore();
    vi.mocked(store.authorize).mockResolvedValue("ineligible");

    await dispatchInvitationDelivery(store, { RESEND_API_KEY: "resend" } as never, "session-1");

    expect(store.suppress).toHaveBeenCalledWith("session-1", 1, intent.claimedAt);
    expect(sendReviewerInviteEmail).not.toHaveBeenCalled();
  });

  it("does not call the provider when revoke wins the authorization race", async () => {
    const store = fakeStore();
    let releaseAuthorization!: (authorized: boolean) => void;
    vi.mocked(store.authorize).mockImplementation(
      () =>
        new Promise<"authorized" | "ineligible" | "contended">((resolve) => {
          releaseAuthorization = (authorized) => resolve(authorized ? "authorized" : "ineligible");
        }),
    );

    const delivery = dispatchInvitationDelivery(
      store,
      { RESEND_API_KEY: "resend" } as never,
      "session-1",
    );
    await vi.waitFor(() =>
      expect(store.authorize).toHaveBeenCalledWith(
        "session-1",
        1,
        intent.claimedAt,
        "reviewer-1",
        "org-1",
      ),
    );
    releaseAuthorization(false);
    await delivery;

    expect(sendReviewerInviteEmail).not.toHaveBeenCalled();
    expect(store.suppress).toHaveBeenCalledWith("session-1", 1, intent.claimedAt);
  });

  it("does not let a stale authorization loser suppress a reclaimed sender", async () => {
    const store = fakeStore();
    vi.mocked(store.authorize).mockResolvedValue("contended");

    await dispatchInvitationDelivery(store, { RESEND_API_KEY: "resend" } as never, "session-1");

    expect(store.suppress).not.toHaveBeenCalled();
    expect(sendReviewerInviteEmail).not.toHaveBeenCalled();
  });

  it("contains eligibility read failures before the provider call", async () => {
    const store = fakeStore();
    vi.mocked(store.authorize).mockRejectedValue(new Error("Postgres unavailable"));

    await expect(
      dispatchInvitationDelivery(store, { RESEND_API_KEY: "resend" } as never, "session-1"),
    ).resolves.toBeUndefined();

    expect(sendReviewerInviteEmail).not.toHaveBeenCalled();
    expect(sendSessionExtendedEmail).not.toHaveBeenCalled();
  });

  it("keeps response-loss ambiguity recoverable under the same key", async () => {
    const store = fakeStore();
    vi.mocked(sendReviewerInviteEmail).mockRejectedValue(new TypeError("network lost"));

    await dispatchInvitationDelivery(store, { RESEND_API_KEY: "resend" } as never, "session-1");

    expect(store.markAmbiguous).toHaveBeenCalledWith(
      "session-1",
      1,
      intent.claimedAt,
      expect.any(String),
    );
    expect(store.markSent).not.toHaveBeenCalled();
  });

  it.each([400, 401])("quarantines permanent provider rejection %s", async (status) => {
    const store = fakeStore();
    vi.mocked(sendReviewerInviteEmail).mockRejectedValue(
      new Error(`Resend returned ${status}: invalid request`),
    );

    await dispatchInvitationDelivery(store, { RESEND_API_KEY: "resend" } as never, "session-1");

    expect(store.markQuarantined).toHaveBeenCalledWith(
      "session-1",
      1,
      intent.claimedAt,
      expect.any(String),
    );
    expect(store.markRetryable).not.toHaveBeenCalled();
  });

  it.each(["invite", "extension"] as const)(
    "keeps %s HTTP 500 outcomes ambiguous under the same attempt key",
    async (deliveryKind) => {
      const store = fakeStore();
      vi.mocked(store.claim).mockResolvedValue({ ...intent, deliveryKind });
      const error = new Error("Resend returned 500: accepted then failed");
      if (deliveryKind === "extension") {
        vi.mocked(sendSessionExtendedEmail).mockRejectedValue(error);
      } else {
        vi.mocked(sendReviewerInviteEmail).mockRejectedValue(error);
      }

      await dispatchInvitationDelivery(store, { RESEND_API_KEY: "resend" } as never, "session-1");

      expect(store.markAmbiguous).toHaveBeenCalledWith(
        "session-1",
        1,
        intent.claimedAt,
        error.message,
      );
      expect(store.markRetryable).not.toHaveBeenCalled();
    },
  );

  it("keeps Resend rate-limit outcomes ambiguous", async () => {
    const store = fakeStore();
    vi.mocked(sendReviewerInviteEmail).mockRejectedValue(
      new Error("Resend returned 429: rate limited"),
    );

    await dispatchInvitationDelivery(store, { RESEND_API_KEY: "resend" } as never, "session-1");

    expect(store.markAmbiguous).toHaveBeenCalledWith(
      "session-1",
      1,
      intent.claimedAt,
      "Resend returned 429: rate limited",
    );
    expect(store.markRetryable).not.toHaveBeenCalled();
  });

  it.each([408, 425])("keeps retryable Resend status %s ambiguous", async (status) => {
    const store = fakeStore();
    vi.mocked(sendReviewerInviteEmail).mockRejectedValue(
      new Error(`Resend returned ${status}: uncertain`),
    );

    await dispatchInvitationDelivery(store, { RESEND_API_KEY: "resend" } as never, "session-1");

    expect(store.markAmbiguous).toHaveBeenCalledWith(
      "session-1",
      1,
      intent.claimedAt,
      `Resend returned ${status}: uncertain`,
    );
    expect(store.markQuarantined).not.toHaveBeenCalled();
  });

  it("does nothing when another worker owns the invitation", async () => {
    const store = fakeStore();
    vi.mocked(store.claim).mockResolvedValue(null);

    await dispatchInvitationDelivery(store, {} as never, "session-1");

    expect(sendReviewerInviteEmail).not.toHaveBeenCalled();
  });

  it("contains claim dependency failures so later invitations can continue", async () => {
    const store = fakeStore();
    vi.mocked(store.claim).mockRejectedValue(new Error("dependency missing"));

    await expect(
      dispatchInvitationDelivery(store, {} as never, "session-1"),
    ).resolves.toBeUndefined();
    expect(sendReviewerInviteEmail).not.toHaveBeenCalled();
  });

  it("uses a generic stored error for non-Error provider failures", async () => {
    const store = fakeStore();
    vi.mocked(sendReviewerInviteEmail).mockRejectedValue("network lost");

    await dispatchInvitationDelivery(store, { RESEND_API_KEY: "resend" } as never, "session-1");

    expect(store.markAmbiguous).toHaveBeenCalledWith(
      "session-1",
      1,
      intent.claimedAt,
      "Unknown delivery error",
    );
  });

  it("contains delivery-state write failures so later invitations can continue", async () => {
    const store = fakeStore();
    vi.mocked(sendReviewerInviteEmail).mockRejectedValue(new Error("Resend returned 503: down"));
    vi.mocked(store.markRetryable).mockRejectedValue(new Error("Postgres unavailable"));

    await expect(
      dispatchInvitationDelivery(store, { RESEND_API_KEY: "resend" } as never, "session-1"),
    ).resolves.toBeUndefined();
  });

  it("claims a session and rebuilds its deterministic portal delivery intent", async () => {
    const claimed = {
      id: "session-1",
      reviewerId: "reviewer-1",
      orgId: "org-1",
      createdBy: "user-1",
      purpose: "Audit",
      expiresAt: new Date("2026-08-01T00:00:00Z"),
      revokedAt: null,
    };
    let updateCall = 0;
    const sets: Array<Record<string, unknown>> = [];
    const db = {
      update: vi.fn(() => {
        updateCall += 1;
        return {
          set: vi.fn((values: Record<string, unknown>) => {
            sets.push(values);
            return {
              where: vi.fn(() =>
                updateCall === 2
                  ? { returning: vi.fn().mockResolvedValue([claimed]) }
                  : updateCall === 3
                    ? { returning: vi.fn().mockResolvedValue([{ id: "session-1" }]) }
                    : Promise.resolve(undefined),
              ),
            };
          }),
        };
      }),
      query: {
        externalReviewers: {
          findFirst: vi.fn().mockResolvedValue({
            email: "reviewer@example.com",
            name: "Reviewer",
          }),
        },
        organizations: { findFirst: vi.fn().mockResolvedValue({ name: "Org" }) },
        user: { findFirst: vi.fn().mockResolvedValue({ name: "Inviter" }) },
      },
    };

    const result = await createPostgresInvitationDeliveryStore(
      db as never,
      {
        APP_URL: "https://app.grantpipe.com",
        PORTAL_TOKEN_SECRET: "portal-secret",
      } as never,
    ).claim("session-1");

    expect(result).toEqual(
      expect.objectContaining({
        sessionId: "session-1",
        reviewerEmail: "reviewer@example.com",
        inviterName: "Inviter",
      }),
    );
    expect(result?.portalUrl).toMatch(/^https:\/\/app\.grantpipe\.com\/app\/portal\//);
    const snapshot = sets
      .map((values) => values.invitationDeliveryPayload)
      .find(
        (value): value is Record<string, unknown> =>
          typeof value === "object" && value !== null && "reviewerEmail" in value,
      );
    expect(snapshot).toEqual(
      expect.objectContaining({
        reviewerEmail: "reviewer@example.com",
        requestFingerprint: expect.any(String),
      }),
    );
    expect(JSON.stringify(snapshot)).not.toContain("raw-token");
    expect(JSON.stringify(snapshot)).not.toContain("/portal/");
  });

  it("atomically rotates a definite failed invitation to a fresh attempt and snapshot", async () => {
    const claimed = {
      id: "session-1",
      reviewerId: "reviewer-1",
      orgId: "org-1",
      createdBy: "user-1",
      purpose: "Audit",
      expiresAt: new Date("2026-08-01T00:00:00Z"),
      revokedAt: null,
      invitationDeliveryAttempt: 2,
      invitationDeliveryKind: "invite",
      invitationDeliveryPayload: null,
    };
    let updateCall = 0;
    const sets: Array<Record<string, unknown>> = [];
    const db = {
      update: vi.fn(() => {
        updateCall += 1;
        return {
          set: vi.fn((values: Record<string, unknown>) => {
            sets.push(values);
            return {
              where: vi.fn(() =>
                updateCall === 2
                  ? { returning: vi.fn().mockResolvedValue([claimed]) }
                  : updateCall === 3
                    ? { returning: vi.fn().mockResolvedValue([{ id: "session-1" }]) }
                    : Promise.resolve(undefined),
              ),
            };
          }),
        };
      }),
      query: {
        externalReviewers: {
          findFirst: vi.fn().mockResolvedValue({
            email: "reviewer@example.com",
            name: "Reviewer",
          }),
        },
        organizations: { findFirst: vi.fn().mockResolvedValue({ name: "Org" }) },
        user: { findFirst: vi.fn().mockResolvedValue({ name: "Inviter" }) },
      },
    };

    const result = await createPostgresInvitationDeliveryStore(
      db as never,
      {
        APP_URL: "https://app.grantpipe.com",
        PORTAL_TOKEN_SECRET: "portal-secret",
      } as never,
    ).claim("session-1");

    const claimSet = sets[1]!;
    const attemptSql = renderSql(claimSet.invitationDeliveryAttempt).sql;
    expect(attemptSql).toContain("\"invitation_delivery_status\" = 'failed'");
    expect(attemptSql).toContain('"invitation_delivery_attempt" + 1');
    expect(renderSql(claimSet.invitationDeliveryPayload).sql).toContain("then null");
    const startedAt = renderSql(claimSet.invitationDeliveryStartedAt);
    expect(startedAt.sql).toContain("\"invitation_delivery_status\" = 'failed'");
    expect(startedAt.params[0]).toBeInstanceOf(Date);
    expect(renderSql(claimSet.invitationProviderId).sql).toContain("then null");
    expect(renderSql(claimSet.invitationDeliverySentAt).sql).toContain("then null");
    expect(claimSet.invitationDeliveryError).toBeNull();
    expect(result).toEqual(expect.objectContaining({ attempt: 2 }));

    const retryStore = fakeStore();
    vi.mocked(retryStore.claim).mockResolvedValue(result);
    vi.mocked(sendReviewerInviteEmail).mockResolvedValue(undefined);
    await dispatchInvitationDelivery(
      retryStore,
      { RESEND_API_KEY: "resend" } as never,
      "session-1",
    );
    expect(sendReviewerInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "external-review-invite/session-1/2" }),
    );
  });

  it("quarantines before send when the reconstructed token does not match the stored hash", async () => {
    const expiresAt = new Date("2026-08-01T00:00:00Z");
    const fields = {
      reviewerEmail: "reviewer@example.com",
      reviewerName: "Reviewer",
      inviterName: "Inviter",
      orgName: "Org",
      purpose: "Audit",
      expiresAt: expiresAt.toISOString(),
      deliveryKind: "invite" as const,
    };
    const rawToken = await signPortalToken("session-1", expiresAt.getTime(), "portal-secret");
    const portalUrl = `https://app.grantpipe.com/app/portal/${rawToken}`;
    const claimed = {
      id: "session-1",
      reviewerId: "reviewer-1",
      orgId: "org-1",
      createdBy: "user-1",
      purpose: "Audit",
      expiresAt,
      revokedAt: null,
      tokenHash: "wrong-token-hash",
      invitationDeliveryAttempt: 1,
      invitationDeliveryKind: "invite",
      invitationDeliveryPayload: {
        ...fields,
        requestFingerprint: await createInvitationRequestFingerprint(
          fields,
          portalUrl,
          "portal-secret",
        ),
      },
    };
    const sets: Array<Record<string, unknown>> = [];
    let updateCall = 0;
    const db = {
      update: vi.fn(() => {
        updateCall += 1;
        return {
          set: vi.fn((values: Record<string, unknown>) => {
            sets.push(values);
            return {
              where: vi.fn(() =>
                updateCall === 2
                  ? { returning: vi.fn().mockResolvedValue([claimed]) }
                  : Promise.resolve(undefined),
              ),
            };
          }),
        };
      }),
      query: {},
    };

    await expect(
      createPostgresInvitationDeliveryStore(
        db as never,
        { APP_URL: "https://app.grantpipe.com", PORTAL_TOKEN_SECRET: "portal-secret" } as never,
      ).claim("session-1"),
    ).resolves.toBeNull();
    expect(sets).toContainEqual(
      expect.objectContaining({ invitationDeliveryStatus: "quarantined" }),
    );
  });

  it("retries from immutable copy fields even after reviewer, inviter, and org edits", async () => {
    const expiresAt = new Date("2026-08-01T00:00:00Z");
    const snapshotFields = {
      reviewerEmail: "original@example.com",
      reviewerName: "Original Reviewer",
      inviterName: "Original Inviter",
      orgName: "Original Org",
      purpose: "Original purpose",
      expiresAt: expiresAt.toISOString(),
      deliveryKind: "invite" as const,
    };
    const rawToken = await signPortalToken("session-1", expiresAt.getTime(), "portal-secret");
    const portalUrl = `https://app.grantpipe.com/app/portal/${rawToken}`;
    const requestFingerprint = await createInvitationRequestFingerprint(
      snapshotFields,
      portalUrl,
      "portal-secret",
      "external-review-invite/session-1/1",
    );
    const claimed = {
      id: "session-1",
      reviewerId: "reviewer-1",
      orgId: "org-1",
      createdBy: "user-1",
      purpose: "Edited purpose",
      expiresAt,
      revokedAt: null,
      invitationDeliveryPayload: { ...snapshotFields, requestFingerprint },
    };
    let updateCall = 0;
    const db = {
      update: vi.fn(() => {
        updateCall += 1;
        return {
          set: vi.fn(() => ({
            where: vi.fn(() =>
              updateCall === 2
                ? { returning: vi.fn().mockResolvedValue([claimed]) }
                : Promise.resolve(undefined),
            ),
          })),
        };
      }),
      query: {
        externalReviewers: { findFirst: vi.fn() },
        organizations: { findFirst: vi.fn() },
        user: { findFirst: vi.fn() },
      },
    };

    const result = await createPostgresInvitationDeliveryStore(
      db as never,
      { APP_URL: "https://app.grantpipe.com", PORTAL_TOKEN_SECRET: "portal-secret" } as never,
    ).claim("session-1");

    expect(result).toEqual(
      expect.objectContaining({
        reviewerEmail: "original@example.com",
        reviewerName: "Original Reviewer",
        inviterName: "Original Inviter",
        orgName: "Original Org",
        purpose: "Original purpose",
      }),
    );
    expect(db.query.externalReviewers.findFirst).not.toHaveBeenCalled();
    expect(db.query.organizations.findFirst).not.toHaveBeenCalled();
  });

  it("does not expose a provider intent when the immutable snapshot write is unacknowledged", async () => {
    const claimed = {
      id: "session-1",
      reviewerId: "reviewer-1",
      orgId: "org-1",
      createdBy: "user-1",
      purpose: "Audit",
      expiresAt: new Date("2026-08-01T00:00:00Z"),
      revokedAt: null,
      invitationDeliveryPayload: null,
    };
    let updateCall = 0;
    const db = {
      update: vi.fn(() => {
        updateCall += 1;
        return {
          set: vi.fn(() => ({
            where: vi.fn(() =>
              updateCall === 2
                ? { returning: vi.fn().mockResolvedValue([claimed]) }
                : updateCall === 3
                  ? { returning: vi.fn().mockResolvedValue([]) }
                  : Promise.resolve(undefined),
            ),
          })),
        };
      }),
      query: {
        externalReviewers: {
          findFirst: vi.fn().mockResolvedValue({
            email: "reviewer@example.com",
            name: "Reviewer",
          }),
        },
        organizations: { findFirst: vi.fn().mockResolvedValue({ name: "Org" }) },
        user: { findFirst: vi.fn().mockResolvedValue({ name: "Inviter" }) },
      },
    };

    await expect(
      createPostgresInvitationDeliveryStore(
        db as never,
        { APP_URL: "https://app.grantpipe.com", PORTAL_TOKEN_SECRET: "secret" } as never,
      ).claim("session-1"),
    ).rejects.toThrow("Failed to persist immutable invitation payload");
  });

  it("quarantines a retry when secret rotation changes the reconstructed request", async () => {
    const expiresAt = new Date("2026-08-01T00:00:00Z");
    const snapshotFields = {
      reviewerEmail: "reviewer@example.com",
      reviewerName: "Reviewer",
      inviterName: "Inviter",
      orgName: "Org",
      purpose: "Audit",
      expiresAt: expiresAt.toISOString(),
      deliveryKind: "invite" as const,
    };
    const claimed = {
      id: "session-1",
      reviewerId: "reviewer-1",
      orgId: "org-1",
      createdBy: "user-1",
      purpose: "Audit",
      expiresAt,
      revokedAt: null,
      invitationDeliveryPayload: {
        ...snapshotFields,
        requestFingerprint: "fingerprint-from-old-secret",
      },
    };
    const sets: Array<Record<string, unknown>> = [];
    let updateCall = 0;
    const db = {
      update: vi.fn(() => {
        updateCall += 1;
        return {
          set: vi.fn((values: Record<string, unknown>) => {
            sets.push(values);
            return {
              where: vi.fn(() =>
                updateCall === 2
                  ? { returning: vi.fn().mockResolvedValue([claimed]) }
                  : Promise.resolve(undefined),
              ),
            };
          }),
        };
      }),
      query: {},
    };

    await expect(
      createPostgresInvitationDeliveryStore(
        db as never,
        { APP_URL: "https://app.grantpipe.com", PORTAL_TOKEN_SECRET: "new-secret" } as never,
      ).claim("session-1"),
    ).resolves.toBeNull();
    expect(sets).toContainEqual(
      expect.objectContaining({ invitationDeliveryStatus: "quarantined" }),
    );
  });

  it.each([
    { reviewerEmail: "reviewer@example.com" },
    [],
    {
      reviewerEmail: "reviewer@example.com",
      reviewerName: "Reviewer",
      inviterName: "Inviter",
      orgName: "Org",
      purpose: "Audit",
      expiresAt: "2026-08-01T00:00:00.000Z",
      requestFingerprint: "fingerprint",
      deliveryKind: "unknown",
    },
  ])(
    "quarantines malformed persisted snapshot %# without reconstructing recipient data",
    async (invitationDeliveryPayload) => {
      const claimed = {
        id: "session-1",
        reviewerId: "reviewer-1",
        orgId: "org-1",
        createdBy: "user-1",
        purpose: "Audit",
        expiresAt: new Date("2026-08-01T00:00:00Z"),
        revokedAt: null,
        invitationDeliveryPayload,
      };
      const sets: Array<Record<string, unknown>> = [];
      let updateCall = 0;
      const db = {
        update: vi.fn(() => {
          updateCall += 1;
          return {
            set: vi.fn((values: Record<string, unknown>) => {
              sets.push(values);
              return {
                where: vi.fn(() =>
                  updateCall === 2
                    ? { returning: vi.fn().mockResolvedValue([claimed]) }
                    : Promise.resolve(undefined),
                ),
              };
            }),
          };
        }),
        query: {},
      };

      await expect(
        createPostgresInvitationDeliveryStore(db as never, {} as never).claim("session-1"),
      ).resolves.toBeNull();
      expect(sets).toContainEqual(
        expect.objectContaining({ invitationDeliveryStatus: "quarantined" }),
      );
    },
  );

  it("changes the fingerprint when a deploy changes rendered invitation copy", async () => {
    const request = {
      from: "GrantPipe <notifications@grantpipe.com>",
      to: ["reviewer@example.com"],
      subject: "Invitation",
      html: "<p>Original invitation</p>",
      text: "Original invitation",
    };

    const before = await fingerprintReviewerInviteRequestPayload(request, "portal-secret");
    const after = await fingerprintReviewerInviteRequestPayload(
      { ...request, html: "<p>Updated invitation template</p>" },
      "portal-secret",
    );

    expect(after).not.toBe(before);
  });

  it("includes idempotency identity but never provider credentials in invitation fingerprints", async () => {
    const fields = {
      reviewerEmail: "reviewer@example.com",
      reviewerName: "Reviewer",
      inviterName: "Inviter",
      orgName: "Org",
      purpose: "Audit",
      expiresAt: "2026-08-01T00:00:00.000Z",
      deliveryKind: "invite" as const,
    };
    const first = await createInvitationRequestFingerprint(
      fields,
      "https://app.grantpipe.com/portal/token",
      "portal-secret",
      "external-review-invite/session-1/1",
    );
    const same = await createInvitationRequestFingerprint(
      fields,
      "https://app.grantpipe.com/portal/token",
      "portal-secret",
      "external-review-invite/session-1/1",
    );
    const nextAttempt = await createInvitationRequestFingerprint(
      fields,
      "https://app.grantpipe.com/portal/token",
      "portal-secret",
      "external-review-invite/session-1/2",
    );

    expect(same).toBe(first);
    expect(nextAttempt).not.toBe(first);
    expect(first).not.toContain("resend");
  });

  it("fingerprints the exact rendered extension request", async () => {
    const fingerprint = await createInvitationRequestFingerprint(
      {
        reviewerEmail: "reviewer@example.com",
        reviewerName: "Reviewer",
        inviterName: "Inviter",
        orgName: "Actual Org",
        purpose: "Audit",
        expiresAt: "2026-08-01T00:00:00.000Z",
        deliveryKind: "extension",
      },
      "https://app.grantpipe.com/app/portal/token",
      "portal-secret",
    );

    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("suppresses a claimed invitation when the reviewer was deleted", async () => {
    const claimed = {
      id: "session-1",
      reviewerId: "reviewer-1",
      orgId: "org-1",
      createdBy: "user-1",
      purpose: "Audit",
      expiresAt: new Date("2026-08-01T00:00:00Z"),
      revokedAt: null,
    };
    const sets: Array<Record<string, unknown>> = [];
    let updateCall = 0;
    const db = {
      update: vi.fn(() => {
        updateCall += 1;
        return {
          set: vi.fn((values: Record<string, unknown>) => {
            sets.push(values);
            return {
              where: vi.fn(() =>
                updateCall === 2
                  ? { returning: vi.fn().mockResolvedValue([claimed]) }
                  : Promise.resolve(undefined),
              ),
            };
          }),
        };
      }),
      query: {
        externalReviewers: { findFirst: vi.fn().mockResolvedValue(null) },
        organizations: { findFirst: vi.fn().mockResolvedValue({ name: "Org" }) },
        user: { findFirst: vi.fn().mockResolvedValue({ name: "Inviter" }) },
      },
    };

    await expect(
      createPostgresInvitationDeliveryStore(db as never, {} as never).claim("session-1"),
    ).resolves.toBeNull();
    expect(sets).toContainEqual(
      expect.objectContaining({ invitationDeliveryStatus: "suppressed" }),
    );
  });

  it("renews its claim lease without resetting the first-attempt ambiguity clock", async () => {
    const setValues: Array<Record<string, unknown>> = [];
    let updateCall = 0;
    const db = {
      update: vi.fn(() => {
        updateCall += 1;
        return {
          set: vi.fn((value: Record<string, unknown>) => {
            setValues.push(value);
            return {
              where: vi.fn(() =>
                updateCall % 2 === 0
                  ? { returning: vi.fn().mockResolvedValue([]) }
                  : Promise.resolve(undefined),
              ),
            };
          }),
        };
      }),
      query: {},
    };
    const store = createPostgresInvitationDeliveryStore(db as never, {} as never);

    await store.claim("session-1");
    await store.claim("session-1");

    expect(setValues[1]).toHaveProperty("invitationDeliveryClaimedAt");
    expect(setValues[1]!.invitationDeliveryStartedAt).not.toBeInstanceOf(Date);
    expect(setValues[3]).toHaveProperty("invitationDeliveryClaimedAt");
  });

  it("returns null when the session claim loses its compare-and-set", async () => {
    let updateCall = 0;
    const db = {
      update: vi.fn(() => {
        updateCall += 1;
        return {
          set: vi.fn(() => ({
            where: vi.fn(() =>
              updateCall === 2
                ? { returning: vi.fn().mockResolvedValue([]) }
                : Promise.resolve(undefined),
            ),
          })),
        };
      }),
      query: {},
    };

    await expect(
      createPostgresInvitationDeliveryStore(db as never, {} as never).claim("session-1"),
    ).resolves.toBeNull();
  });

  it("returns null if a claimed row is no longer eligible", async () => {
    let updateCall = 0;
    const db = {
      update: vi.fn(() => {
        updateCall += 1;
        return {
          set: vi.fn(() => ({
            where: vi.fn(() =>
              updateCall === 2
                ? {
                    returning: vi.fn().mockResolvedValue([
                      {
                        id: "session-1",
                        revokedAt: null,
                        expiresAt: new Date("2020-01-01T00:00:00Z"),
                      },
                    ]),
                  }
                : Promise.resolve(undefined),
            ),
          })),
        };
      }),
      query: {},
    };

    await expect(
      createPostgresInvitationDeliveryStore(db as never, {} as never).claim("session-1"),
    ).resolves.toBeNull();
  });

  it("fails closed when invitation dependencies are missing", async () => {
    let updateCall = 0;
    const db = {
      update: vi.fn(() => {
        updateCall += 1;
        return {
          set: vi.fn(() => ({
            where: vi.fn(() =>
              updateCall === 2
                ? {
                    returning: vi.fn().mockResolvedValue([
                      {
                        id: "session-1",
                        reviewerId: "missing",
                        orgId: "missing",
                        createdBy: null,
                        purpose: "Audit",
                        expiresAt: new Date("2026-08-01T00:00:00Z"),
                        revokedAt: null,
                      },
                    ]),
                  }
                : updateCall === 3
                  ? { returning: vi.fn().mockResolvedValue([{ id: "session-1" }]) }
                  : Promise.resolve(undefined),
            ),
          })),
        };
      }),
      query: {
        externalReviewers: {
          findFirst: vi.fn().mockResolvedValue({
            email: "reviewer@example.com",
            name: "Reviewer",
          }),
        },
        organizations: { findFirst: vi.fn().mockResolvedValue(null) },
        user: { findFirst: vi.fn() },
      },
    };

    await expect(
      createPostgresInvitationDeliveryStore(db as never, {} as never).claim("session-1"),
    ).rejects.toThrow("Invitation delivery dependencies are missing");
    expect(db.query.user.findFirst).not.toHaveBeenCalled();
  });

  it("persists sent, retryable, and ambiguous outcomes with compare-and-set guards", async () => {
    const sets: unknown[] = [];
    const conditions: unknown[] = [];
    const db = {
      update: vi.fn(() => ({
        set: vi.fn((value: unknown) => {
          sets.push(value);
          return {
            where: vi.fn((condition: unknown) => {
              conditions.push(condition);
              return Promise.resolve(undefined);
            }),
          };
        }),
      })),
    };
    const store = createPostgresInvitationDeliveryStore(db as never, {} as never);

    await store.markSent("session-1", 1, intent.claimedAt);
    await store.markUnavailable("session-1", 1, intent.claimedAt, "config");
    await store.markRetryable("session-1", 1, intent.claimedAt, "retry");
    await store.markRetryable("session-1", 3, intent.claimedAt, "retry");
    await store.markAmbiguous("session-1", 1, intent.claimedAt, "ambiguous");

    expect(sets).toEqual([
      expect.objectContaining({ invitationDeliveryStatus: "sent" }),
      expect.objectContaining({ invitationDeliveryStatus: "pending" }),
      expect.objectContaining({ invitationDeliveryStatus: "failed" }),
      expect.objectContaining({ invitationDeliveryStatus: "quarantined" }),
      expect.objectContaining({ invitationDeliveryStatus: "ambiguous" }),
    ]);
    for (const [index, condition] of conditions.entries()) {
      const rendered = renderSql(condition);
      expect(rendered.sql).toContain('"invitation_delivery_attempt" = $2');
      expect(rendered.params).toContain(index === 3 ? 3 : 1);
      expect(rendered.params).toContain("sending");
      expect(rendered.params).toContain(intent.claimedAt.toISOString());
      expect(rendered.sql).toContain('"invitation_delivery_claimed_at" =');
      expect(rendered.sql).toContain('"revoked_at" is null');
    }
  });

  it("fences a late old-lease 4xx from a newer successful sender", async () => {
    const conditions: unknown[] = [];
    const db = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn((condition: unknown) => {
            conditions.push(condition);
            return Promise.resolve(undefined);
          }),
        })),
      })),
    };
    const store = createPostgresInvitationDeliveryStore(db as never, {} as never);

    const oldLease = new Date("2026-07-11T12:00:00Z");
    const newLease = new Date("2026-07-11T12:06:00Z");
    await store.markRetryable("session-1", 1, oldLease, "Resend returned 401: old key");
    await store.markSent("session-1", 1, newLease);

    const oldAttempt = renderSql(conditions[0]);
    const newAttempt = renderSql(conditions[1]);
    expect(oldAttempt.params).toEqual(["session-1", 1, "sending", oldLease.toISOString()]);
    expect(newAttempt.params).toEqual(["session-1", 1, "sending", newLease.toISOString()]);
  });

  it("checks current session/reviewer eligibility and can suppress the intent", async () => {
    const reviewerFind = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: "reviewer-1" });
    const sets: Array<Record<string, unknown>> = [];
    const authorizationConditions: unknown[] = [];
    let suppressionCondition: unknown;
    let updateCall = 0;
    const db = {
      query: {
        externalReviewers: { findFirst: reviewerFind },
      },
      update: vi.fn(() => {
        updateCall += 1;
        return {
          set: vi.fn((values: Record<string, unknown>) => {
            sets.push(values);
            return {
              where: vi.fn((condition: unknown) => {
                if (updateCall <= 2) {
                  authorizationConditions.push(condition);
                  return {
                    returning: vi
                      .fn()
                      .mockResolvedValue(
                        updateCall === 1 ? [] : [{ reviewerId: "reviewer-1", orgId: "org-1" }],
                      ),
                  };
                }
                suppressionCondition = condition;
                return Promise.resolve(undefined);
              }),
            };
          }),
        };
      }),
    };
    const store = createPostgresInvitationDeliveryStore(db as never, {} as never);

    const claimedAt = new Date("2026-07-11T12:00:00Z");
    await expect(store.authorize("session-1", 1, claimedAt, "reviewer-1", "org-1")).resolves.toBe(
      "ineligible",
    );
    await expect(store.authorize("session-1", 1, claimedAt, "reviewer-1", "org-1")).resolves.toBe(
      "contended",
    );
    await expect(store.authorize("session-1", 1, claimedAt, "reviewer-1", "org-1")).resolves.toBe(
      "authorized",
    );
    await store.suppress("session-1", 1, claimedAt);

    expect(reviewerFind).toHaveBeenCalledTimes(3);
    expect(sets.slice(0, 2)).toEqual([
      expect.objectContaining({ invitationDeliveryStatus: "sending" }),
      expect.objectContaining({ invitationDeliveryStatus: "sending" }),
    ]);
    for (const condition of authorizationConditions) {
      const rendered = renderSql(condition);
      expect(rendered.sql).toContain('"invitation_delivery_attempt" =');
      expect(rendered.sql).toContain('"invitation_delivery_status" =');
      expect(rendered.sql).toContain('"invitation_delivery_claimed_at" =');
      expect(rendered.sql).toContain('"revoked_at" is null');
    }
    expect(sets).toContainEqual(
      expect.objectContaining({ invitationDeliveryStatus: "suppressed" }),
    );
    const renderedSuppression = renderSql(suppressionCondition);
    expect(renderedSuppression.params).toEqual([
      "session-1",
      1,
      "processing",
      claimedAt.toISOString(),
    ]);
  });

  it("skips hourly recovery when the database adapter is unavailable", async () => {
    await expect(redispatchPendingInvitations({} as never, {} as never)).resolves.toBeUndefined();
  });

  it("terminalizes every expired active invitation before selecting deliverable work", async () => {
    const sets: Record<string, unknown>[] = [];
    const conditions: unknown[] = [];
    const db = {
      update: vi.fn(() => ({
        set: vi.fn((values: Record<string, unknown>) => {
          sets.push(values);
          return {
            where: vi.fn((condition: unknown) => {
              conditions.push(condition);
              return Promise.resolve(undefined);
            }),
          };
        }),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })),
          })),
        })),
      })),
    };

    await redispatchPendingInvitations(db as never, {} as never);

    expect(db.update).toHaveBeenCalledOnce();
    expect(sets[0]).toEqual(
      expect.objectContaining({
        invitationDeliveryStatus: "suppressed",
        invitationDeliveryPayload: null,
        invitationDeliveryClaimedAt: null,
        invitationDeliveryError: null,
      }),
    );
    const query = renderSql(conditions[0]);
    expect(query.sql).toContain('"expires_at" <=');
    expect(query.sql).toContain('"revoked_at" is null');
    expect(query.params).toEqual(
      expect.arrayContaining(["pending", "failed", "processing", "sending", "ambiguous"]),
    );
  });

  it("redispatches each hourly Postgres candidate without coupling the batch", async () => {
    let updateCall = 0;
    let candidateWhere: unknown;
    const orderBy = vi.fn(() => ({
      limit: vi.fn().mockResolvedValue([{ id: "session-1" }]),
    }));
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn((condition: unknown) => {
            candidateWhere = condition;
            return { orderBy };
          }),
        })),
      })),
      update: vi.fn(() => {
        updateCall += 1;
        return {
          set: vi.fn(() => ({
            where: vi.fn(() =>
              updateCall === 2
                ? { returning: vi.fn().mockResolvedValue([]) }
                : Promise.resolve(undefined),
            ),
          })),
        };
      }),
      query: {},
    };

    await redispatchPendingInvitations(db as never, {} as never);

    expect(db.select).toHaveBeenCalledOnce();
    expect(orderBy).toHaveBeenCalledOnce();
    expect(db.update).toHaveBeenCalledTimes(3);
    const query = renderSql(candidateWhere);
    expect(query.sql).toContain("invitation_delivery_status");
    expect(query.params).toEqual(expect.arrayContaining(["pending", "failed"]));
    expect(query.params).not.toContain("not_requested");
  });

  it("uses auth-secret fallback and the default inviter for system-created sessions", async () => {
    let updateCall = 0;
    const db = {
      update: vi.fn(() => {
        updateCall += 1;
        return {
          set: vi.fn(() => ({
            where: vi.fn(() =>
              updateCall === 2
                ? {
                    returning: vi.fn().mockResolvedValue([
                      {
                        id: "session-1",
                        reviewerId: "reviewer-1",
                        orgId: "org-1",
                        createdBy: null,
                        purpose: "Audit",
                        expiresAt: new Date("2026-08-01T00:00:00Z"),
                        revokedAt: null,
                      },
                    ]),
                  }
                : updateCall === 3
                  ? { returning: vi.fn().mockResolvedValue([{ id: "session-1" }]) }
                  : Promise.resolve(undefined),
            ),
          })),
        };
      }),
      query: {
        externalReviewers: {
          findFirst: vi.fn().mockResolvedValue({
            email: "reviewer@example.com",
            name: "Reviewer",
          }),
        },
        organizations: { findFirst: vi.fn().mockResolvedValue({ name: "Org" }) },
        user: { findFirst: vi.fn() },
      },
    };

    const result = await createPostgresInvitationDeliveryStore(
      db as never,
      { APP_URL: "https://app.grantpipe.com", BETTER_AUTH_SECRET: "auth-secret" } as never,
    ).claim("session-1");

    expect(result?.inviterName).toBe("A teammate");
    expect(db.query.user.findFirst).not.toHaveBeenCalled();
  });
});
