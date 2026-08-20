import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const { mockAnalyticsCapture, mockCaptureBackgroundException } = vi.hoisted(() => ({
  mockAnalyticsCapture: vi.fn().mockResolvedValue(undefined),
  mockCaptureBackgroundException: vi.fn(),
}));

vi.mock("../../lib/integrations", () => ({
  getIntegrations: vi.fn(() => ({ analytics: { capture: mockAnalyticsCapture } })),
}));

vi.mock("../../lib/sentry", () => ({
  captureBackgroundException: mockCaptureBackgroundException,
}));
import {
  TRIAL_EMAIL_KINDS,
  enqueueTrialWrapupEmail,
  enqueueTrialEmailSequence,
  findDueTrialEmailRows,
  runTrialEmailTick,
  runTrialWrapupDiscoveryTick,
  sendTrialLifecycleEmail,
} from "./service";
import { orgMembers, type Database, type TransactionDatabase } from "@grantpipe/db";
import type { Bindings } from "../../types";

function buildInsertDb() {
  const inserted: Record<string, unknown>[] = [];
  const values = vi.fn((row: Record<string, unknown>) => {
    inserted.push(row);
    return {
      onConflictDoNothing: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: "schedule-new" }]),
      })),
    };
  });
  const insert = vi.fn(() => ({ values }));
  const update = vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })),
    })),
  }));
  return {
    db: {
      insert,
      update,
      query: { trialEmailSchedule: { findFirst: vi.fn().mockResolvedValue(null) } },
    } as unknown as Database,
    inserted,
    values,
  };
}

function buildTickDb(
  rows: Array<Record<string, unknown>>,
  preferences: Array<Record<string, unknown>> = [],
  options: {
    failFirstSentUpdate?: boolean;
    rejectAuthorization?: boolean;
    rejectSentUpdate?: boolean;
    pages?: Array<Array<Record<string, unknown>>>;
    snapshotRaceWinner?: unknown;
    authorizationResults?: boolean[];
    wrapupNotificationMiss?: "newer_claim" | "owned_claim" | "deadline_changed";
    enforceWrapupLeaseState?: boolean;
  } = {},
) {
  const updates: Record<string, unknown>[] = [];
  const authorizationConditions: unknown[] = [];
  let shouldFailSentUpdate = options.failFirstSentUpdate ?? false;
  // The live query now selects organizations.timezone; default it so fixtures
  // that don't care about the send window still resolve to a real zone.
  const withDefaults = (row: Record<string, unknown>): Record<string, unknown> => ({
    timezone: "America/New_York",
    sendAfter: new Date("2026-04-01T12:00:00.000Z"),
    trialEndsAt: new Date("2026-04-11T16:00:00.000Z"),
    trialWillEndNotifiedAt: null,
    trialWrapupNotifiedForEndAt: null,
    deliverySnapshot: null,
    error: null,
    sentAt: null,
    ...row,
  });
  const defaultRows = rows.map(withDefaults);
  const pages = options.pages?.map((page) => page.map(withDefaults));
  let pageIndex = 0;
  let claimAvailable = true;
  let currentClaimToken: string | null = null;
  let notifiedForEndAt: Date | null = null;
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn(() => Promise.resolve(pages ? (pages[pageIndex++] ?? []) : defaultRows)),
  };
  const updateSet = vi.fn((value: Record<string, unknown>) => {
    updates.push(value);
    if ("deliverySnapshot" in value && !options.enforceWrapupLeaseState) {
      for (const row of defaultRows) {
        row.deliverySnapshot = options.snapshotRaceWinner ?? value.deliverySnapshot;
      }
    }
    if (
      "error" in value &&
      !(typeof value.error === "string" && value.error.startsWith("delivery_in_progress:")) &&
      !options.enforceWrapupLeaseState
    ) {
      for (const row of defaultRows) row.error = value.error;
    }
    return {
      where: vi.fn((condition: unknown) => {
        const conditionParams = options.enforceWrapupLeaseState
          ? new PgDialect().sqlToQuery(condition as Parameters<PgDialect["sqlToQuery"]>[0]).params
          : [];
        const targetRow = defaultRows.find(
          (row) => conditionParams.includes(row.id) || conditionParams.includes(row.orgId),
        );
        const expectedLease = conditionParams.find(
          (param): param is string =>
            typeof param === "string" && param.startsWith("delivery_in_progress:"),
        );
        if (shouldFailSentUpdate && "sentAt" in value) {
          shouldFailSentUpdate = false;
          throw new Error("simulated sentAt persistence failure");
        }
        return {
          returning: vi.fn(async () => {
            if ("sentAt" in value && options.rejectSentUpdate) return [];
            if ("sentAt" in value) {
              if (
                options.enforceWrapupLeaseState &&
                (!targetRow ||
                  targetRow.sentAt ||
                  !expectedLease ||
                  targetRow.error !== expectedLease)
              ) {
                return [];
              }
              if (targetRow) {
                targetRow.sentAt = value.sentAt;
                targetRow.error = value.error;
              }
              return [{ id: "schedule-sent" }];
            }
            if ("trialWrapupNotifiedForEndAt" in value) {
              if (
                options.enforceWrapupLeaseState &&
                (!expectedLease || expectedLease !== currentClaimToken)
              ) {
                return [];
              }
              if (options.enforceWrapupLeaseState) {
                notifiedForEndAt = value.trialWrapupNotifiedForEndAt as Date;
                currentClaimToken = null;
              }
              return options.wrapupNotificationMiss ? [] : [{ id: "org-notified" }];
            }
            if ("deliverySnapshot" in value) {
              if (options.enforceWrapupLeaseState && targetRow) {
                targetRow.deliverySnapshot = value.deliverySnapshot;
              }
              return options.snapshotRaceWinner
                ? []
                : [{ deliverySnapshot: value.deliverySnapshot }];
            }
            if (
              typeof value.error === "string" &&
              value.error.startsWith("delivery_in_progress:")
            ) {
              authorizationConditions.push(condition);
              const authorized =
                options.authorizationResults?.shift() ?? !options.rejectAuthorization;
              if (
                options.enforceWrapupLeaseState &&
                (!targetRow ||
                  targetRow.sentAt ||
                  (targetRow.error ?? null) !== (expectedLease ?? null))
              ) {
                return [];
              }
              if (authorized) {
                if (options.enforceWrapupLeaseState && targetRow) {
                  targetRow.error = value.error;
                } else {
                  for (const row of defaultRows) row.error = value.error;
                }
              }
              return authorized ? [{ id: "schedule-authorized" }] : [];
            }
            if (!(value.trialWrapupClaimedAt instanceof Date) || !claimAvailable) return [];
            claimAvailable = false;
            currentClaimToken =
              typeof value.trialWrapupClaimToken === "string" ? value.trialWrapupClaimToken : null;
            return [{ id: "org-claimed" }];
          }),
        };
      }),
    };
  });
  const update = vi.fn(() => ({ set: updateSet }));
  const transaction = vi.fn(async (callback: (transactionDb: unknown) => Promise<unknown>) =>
    callback({
      update,
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue({
            trialEndsAt:
              options.wrapupNotificationMiss === "deadline_changed"
                ? new Date((defaultRows[0]?.trialEndsAt as Date).getTime() + 24 * 60 * 60 * 1000)
                : defaultRows[0]?.trialEndsAt,
            trialWrapupNotifiedForEndAt: options.enforceWrapupLeaseState ? notifiedForEndAt : null,
            trialWrapupClaimToken:
              options.wrapupNotificationMiss === "newer_claim"
                ? "delivery_in_progress:newer-owner"
                : options.wrapupNotificationMiss === "owned_claim"
                  ? currentClaimToken
                  : null,
          }),
        },
        trialEmailSchedule: {
          findFirst: vi.fn().mockImplementation(() =>
            Promise.resolve(
              defaultRows[0]
                ? {
                    sentAt: defaultRows[0].sentAt,
                    deliverySnapshot: defaultRows[0].deliverySnapshot,
                  }
                : null,
            ),
          ),
        },
      },
    }),
  );
  return {
    db: {
      select: vi.fn(() => {
        claimAvailable = true;
        return selectChain;
      }),
      update,
      transaction,
      query: {
        notificationPreferences: {
          findFirst: vi.fn().mockImplementation(({ where }: { where: unknown }) => {
            void where;
            return Promise.resolve(preferences[0] ?? null);
          }),
        },
        trialEmailSchedule: {
          findFirst: vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(
                defaultRows[0] ? { deliverySnapshot: defaultRows[0].deliverySnapshot } : null,
              ),
            ),
        },
      },
    } as unknown as Database,
    updates,
    transaction,
    rowsState: defaultRows,
    authorizationConditions,
  };
}

describe("enqueueTrialEmailSequence", () => {
  it("creates one schedule row for each trial lifecycle email", async () => {
    const { db, inserted } = buildInsertDb();
    const trialStartedAt = new Date("2026-04-01T12:00:00.000Z");
    const trialEndsAt = new Date("2026-05-01T12:00:00.000Z");

    await enqueueTrialEmailSequence(db, {
      orgId: "org-1",
      userId: "user-1",
      trialStartedAt,
      trialEndsAt,
    });

    expect(inserted.map((row) => row.emailKind)).toEqual([...TRIAL_EMAIL_KINDS]);
    expect(inserted.map((row) => (row.sendAfter as Date).toISOString())).toEqual([
      "2026-04-01T12:00:00.000Z",
      "2026-04-02T12:00:00.000Z",
      "2026-04-03T12:00:00.000Z",
      "2026-04-04T12:00:00.000Z",
      "2026-04-05T12:00:00.000Z",
      "2026-04-06T12:00:00.000Z",
      "2026-04-07T12:00:00.000Z",
      "2026-04-28T12:00:00.000Z",
    ]);
  });

  it("normalizes timestamp strings before scheduling trial emails", async () => {
    const { db, inserted } = buildInsertDb();

    await enqueueTrialEmailSequence(db, {
      orgId: "org-1",
      userId: "user-1",
      trialStartedAt: "2026-04-01T12:00:00.000Z",
      trialEndsAt: "2026-05-01T12:00:00.000Z",
    });

    expect(inserted.every((row) => row.sendAfter instanceof Date)).toBe(true);
    expect(inserted.map((row) => (row.sendAfter as Date).toISOString())).toEqual([
      "2026-04-01T12:00:00.000Z",
      "2026-04-02T12:00:00.000Z",
      "2026-04-03T12:00:00.000Z",
      "2026-04-04T12:00:00.000Z",
      "2026-04-05T12:00:00.000Z",
      "2026-04-06T12:00:00.000Z",
      "2026-04-07T12:00:00.000Z",
      "2026-04-28T12:00:00.000Z",
    ]);
  });

  it("defaults missing trial dates without duplicating schedule kinds", async () => {
    const { db, inserted } = buildInsertDb();
    const trialStartedAt = new Date("2026-04-01T12:00:00.000Z");

    await enqueueTrialEmailSequence(db, {
      orgId: "org-1",
      userId: "user-1",
      trialStartedAt,
      trialEndsAt: null,
    });

    expect(inserted).toHaveLength(TRIAL_EMAIL_KINDS.length);
    expect(inserted.at(-1)).toMatchObject({
      emailKind: "trial_wrapup",
      sendAfter: new Date("2026-04-28T12:00:00.000Z"),
    });
  });

  it("uses now when the trial start is missing", async () => {
    const { db, inserted } = buildInsertDb();
    const before = Date.now();

    await enqueueTrialEmailSequence(db, {
      orgId: "org-1",
      userId: "user-1",
      trialStartedAt: null,
      trialEndsAt: null,
    });

    const welcomeAt = inserted[0]!.sendAfter as Date;
    const wrapupAt = inserted.at(-1)!.sendAfter as Date;
    expect(welcomeAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(wrapupAt.getTime() - welcomeAt.getTime()).toBe(27 * 24 * 60 * 60 * 1000);
  });

  it("falls back to default trial dates for invalid timestamp strings", async () => {
    const { db, inserted } = buildInsertDb();
    const before = Date.now();

    await enqueueTrialEmailSequence(db, {
      orgId: "org-1",
      userId: "user-1",
      trialStartedAt: "not-a-date",
      trialEndsAt: "also-not-a-date",
    });

    const welcomeAt = inserted[0]!.sendAfter as Date;
    const wrapupAt = inserted.at(-1)!.sendAfter as Date;
    expect(welcomeAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(wrapupAt.getTime() - welcomeAt.getTime()).toBe(27 * 24 * 60 * 60 * 1000);
  });
});

describe("enqueueTrialWrapupEmail", () => {
  it("creates only the Stripe-compatible trial wrapup row", async () => {
    const { db, inserted } = buildInsertDb();

    await enqueueTrialWrapupEmail(db, {
      orgId: "org-1",
      userId: "user-1",
      trialEndsAt: new Date("2026-04-04T12:00:00.000Z"),
    });

    expect(inserted).toEqual([
      expect.objectContaining({
        orgId: "org-1",
        userId: "user-1",
        emailKind: "trial_wrapup",
        trialDeadlineAt: new Date("2026-04-04T12:00:00.000Z"),
        sendAfter: expect.any(Date),
        deliverySnapshot: expect.objectContaining({
          intent: "trial_wrapup",
          trialEndsAt: "2026-04-04T12:00:00.000Z",
        }),
      }),
    ]);
  });

  function buildStatefulWrapupDb(
    existing: Record<string, unknown>,
    options: { missSupersede?: boolean; authorizationWinsBeforeWrite?: boolean } = {},
  ) {
    const rows = [existing];
    const update = vi.fn(() => ({
      set: vi.fn((value: Record<string, unknown>) => ({
        where: vi.fn((condition: unknown) => {
          const active = [...rows].reverse().find((row) => row.emailKind === "trial_wrapup");
          const superseding =
            typeof value.emailKind === "string" &&
            value.emailKind.startsWith("trial_wrapup_superseded:");
          let authorizationRaceLost = false;
          if (active && options.authorizationWinsBeforeWrite) {
            active.error = "delivery_in_progress:2026-04-01T12:00:00.000Z";
            const rendered = new PgDialect().sqlToQuery(
              condition as Parameters<PgDialect["sqlToQuery"]>[0],
            );
            authorizationRaceLost = rendered.sql.includes('"trial_email_schedule"."error" is null');
          }
          const accepted =
            !!active && !authorizationRaceLost && !(superseding && options.missSupersede);
          if (accepted) Object.assign(active, value);
          return {
            returning: vi.fn().mockResolvedValue(accepted ? [{ id: active!.id }] : []),
          };
        }),
      })),
    }));
    const insert = vi.fn(() => ({
      values: vi.fn((value: Record<string, unknown>) => ({
        onConflictDoNothing: vi.fn(() => ({
          returning: vi.fn(async () => {
            rows.push({ id: `schedule-${rows.length + 1}`, ...value });
            return [{ id: rows.at(-1)!.id }];
          }),
        })),
      })),
    }));
    return {
      db: {
        query: {
          trialEmailSchedule: {
            findFirst: vi.fn(() =>
              Promise.resolve(
                [...rows].reverse().find((row) => row.emailKind === "trial_wrapup") ?? null,
              ),
            ),
          },
        },
        update,
        insert,
      } as unknown as TransactionDatabase,
      rows,
    };
  }

  it("supersedes a definitely failed same-deadline attempt when the admin changes", async () => {
    const deadline = new Date("2026-04-04T12:00:00.000Z");
    const oldSnapshot = {
      version: 1,
      idempotencyKey: "trial-wrapup/old-attempt",
      firstAttemptAt: "2026-04-01T12:00:00.000Z",
      trialEndsAt: deadline.toISOString(),
      request: {
        from: "GrantPipe <hello@grantpipe.com>",
        to: ["old-admin@example.org"],
        subject: "Old body",
        html: "<p>Old</p>",
        text: "Old",
        headers: { "List-Unsubscribe": "<https://app.grantpipe.com/notifications>" },
      },
    };
    const fixture = buildStatefulWrapupDb({
      id: "schedule-old",
      orgId: "org-1",
      userId: "old-admin",
      emailKind: "trial_wrapup",
      sentAt: null,
      error: "resend_status_500:failed",
      deliverySnapshot: oldSnapshot,
    });

    await expect(
      enqueueTrialWrapupEmail(fixture.db, {
        orgId: "org-1",
        userId: "new-admin",
        trialEndsAt: deadline,
      }),
    ).resolves.toBe(true);

    expect(fixture.rows).toEqual([
      expect.objectContaining({
        id: "schedule-old",
        emailKind: "trial_wrapup_superseded:schedule-old",
      }),
      expect.objectContaining({
        userId: "new-admin",
        deliverySnapshot: {
          version: 1,
          intent: "trial_wrapup",
          trialEndsAt: deadline.toISOString(),
        },
      }),
    ]);
  });

  it("preserves an uncertain old deadline while scheduling exactly one extended deadline", async () => {
    const oldDeadline = new Date("2026-04-04T12:00:00.000Z");
    const newDeadline = new Date("2026-04-06T12:00:00.000Z");
    const fixture = buildStatefulWrapupDb({
      id: "schedule-old",
      orgId: "org-1",
      userId: "old-admin",
      emailKind: "trial_wrapup",
      sentAt: null,
      trialDeadlineAt: oldDeadline,
      error: "delivery_ambiguous:provider_possible_send",
      deliverySnapshot: {
        version: 1,
        intent: "trial_wrapup",
        trialEndsAt: oldDeadline.toISOString(),
      },
    });

    await expect(
      enqueueTrialWrapupEmail(fixture.db, {
        orgId: "org-1",
        userId: "new-admin",
        trialEndsAt: newDeadline,
      }),
    ).resolves.toBe(true);
    await expect(
      enqueueTrialWrapupEmail(fixture.db, {
        orgId: "org-1",
        userId: "new-admin",
        trialEndsAt: newDeadline,
      }),
    ).resolves.toBe(false);

    expect(fixture.rows).toEqual([
      expect.objectContaining({
        id: "schedule-old",
        emailKind: "trial_wrapup",
        userId: "old-admin",
        error: "delivery_ambiguous:provider_possible_send",
      }),
      expect.objectContaining({
        emailKind: "trial_wrapup",
        userId: "new-admin",
        trialDeadlineAt: newDeadline,
        deliverySnapshot: expect.objectContaining({
          intent: "trial_wrapup",
          trialEndsAt: newDeadline.toISOString(),
        }),
      }),
    ]);
  });

  it("loses the supersede CAS when a worker authorizes the observed row first", async () => {
    const deadline = new Date("2026-04-04T12:00:00.000Z");
    const fixture = buildStatefulWrapupDb(
      {
        id: "schedule-authorizing",
        orgId: "org-1",
        userId: "old-admin",
        emailKind: "trial_wrapup",
        sentAt: null,
        error: null,
        deliverySnapshot: {
          version: 1,
          idempotencyKey: "trial-wrapup/authorizing",
          firstAttemptAt: "2026-04-01T12:00:00.000Z",
          trialEndsAt: deadline.toISOString(),
          request: {
            from: "GrantPipe <hello@grantpipe.com>",
            to: ["old-admin@example.org"],
            subject: "Old body",
            html: "<p>Old</p>",
            text: "Old",
            headers: { "List-Unsubscribe": "<https://app.grantpipe.com/notifications>" },
          },
        },
      },
      { authorizationWinsBeforeWrite: true },
    );

    await expect(
      enqueueTrialWrapupEmail(fixture.db, {
        orgId: "org-1",
        userId: "new-admin",
        trialEndsAt: deadline,
      }),
    ).resolves.toBe(false);
    expect(fixture.rows).toEqual([
      expect.objectContaining({
        id: "schedule-authorizing",
        emailKind: "trial_wrapup",
        error: "delivery_in_progress:2026-04-01T12:00:00.000Z",
      }),
    ]);
  });

  it("loses the refresh CAS when a worker authorizes the observed row first", async () => {
    const deadline = new Date("2026-04-04T12:00:00.000Z");
    const fixture = buildStatefulWrapupDb(
      {
        id: "schedule-refreshing",
        orgId: "org-1",
        userId: "admin-1",
        emailKind: "trial_wrapup",
        sentAt: null,
        error: null,
        deliverySnapshot: {
          version: 1,
          intent: "trial_wrapup",
          trialEndsAt: deadline.toISOString(),
        },
      },
      { authorizationWinsBeforeWrite: true },
    );

    await expect(
      enqueueTrialWrapupEmail(fixture.db, {
        orgId: "org-1",
        userId: "admin-1",
        trialEndsAt: deadline,
      }),
    ).resolves.toBe(false);
    expect(fixture.rows[0]).toMatchObject({
      emailKind: "trial_wrapup",
      error: "delivery_in_progress:2026-04-01T12:00:00.000Z",
    });
  });

  it("does not insert a replacement when the supersede CAS loses to a completed send", async () => {
    const deadline = new Date("2026-04-04T12:00:00.000Z");
    const fixture = buildStatefulWrapupDb(
      {
        id: "schedule-completing",
        orgId: "org-1",
        userId: "old-admin",
        emailKind: "trial_wrapup",
        sentAt: null,
        error: "delivery_in_progress:2026-04-01T12:00:00.000Z",
        deliverySnapshot: {
          version: 1,
          intent: "trial_wrapup",
          trialEndsAt: deadline.toISOString(),
        },
      },
      { missSupersede: true },
    );

    await expect(
      enqueueTrialWrapupEmail(fixture.db, {
        orgId: "org-1",
        userId: "new-admin",
        trialEndsAt: deadline,
      }),
    ).resolves.toBe(false);
    expect(fixture.rows).toHaveLength(1);
  });

  it("supersedes a recipient-less legacy intent with a fenced replacement", async () => {
    const deadline = new Date("2026-04-04T12:00:00.000Z");
    const fixture = buildStatefulWrapupDb({
      id: "schedule-legacy-intent",
      orgId: "org-1",
      userId: "old-admin",
      emailKind: "trial_wrapup",
      sentAt: null,
      error: null,
      deliverySnapshot: null,
    });

    await expect(
      enqueueTrialWrapupEmail(fixture.db, {
        orgId: "org-1",
        userId: "new-admin",
        trialEndsAt: deadline,
      }),
    ).resolves.toBe(true);
    expect(fixture.rows).toHaveLength(2);
  });

  it("supersedes a deadline-scoped legacy row without a frozen intent", async () => {
    const deadline = new Date("2026-04-04T12:00:00.000Z");
    const fixture = buildStatefulWrapupDb({
      id: "schedule-deadline-only",
      orgId: "org-1",
      userId: "admin-1",
      emailKind: "trial_wrapup",
      sentAt: null,
      trialDeadlineAt: deadline,
      error: null,
      deliverySnapshot: null,
    });

    await expect(
      enqueueTrialWrapupEmail(fixture.db, {
        orgId: "org-1",
        userId: "admin-1",
        trialEndsAt: deadline,
      }),
    ).resolves.toBe(true);
    expect(fixture.rows).toEqual([
      expect.objectContaining({
        id: "schedule-deadline-only",
        emailKind: "trial_wrapup_superseded:schedule-deadline-only",
        error: `superseded_by_deadline:${deadline.toISOString()}`,
      }),
      expect.objectContaining({
        emailKind: "trial_wrapup",
        userId: "admin-1",
        trialDeadlineAt: deadline,
      }),
    ]);
  });

  it("fences an uncertain same-deadline attempt when the recipient changes", async () => {
    const deadline = new Date("2026-04-04T12:00:00.000Z");
    const snapshot = {
      version: 1,
      idempotencyKey: "trial-wrapup/frozen-attempt",
      firstAttemptAt: "2026-04-01T12:00:00.000Z",
      trialEndsAt: deadline.toISOString(),
      request: {
        from: "GrantPipe <hello@grantpipe.com>",
        to: ["admin@example.org"],
        subject: "Frozen",
        html: "<p>Frozen</p>",
        text: "Frozen",
        headers: { "List-Unsubscribe": "<https://app.grantpipe.com/notifications>" },
      },
    };
    const uncertain = buildStatefulWrapupDb({
      id: "schedule-uncertain",
      orgId: "org-1",
      userId: "admin-1",
      emailKind: "trial_wrapup",
      error: "delivery_ambiguous:provider",
      deliverySnapshot: snapshot,
    });
    await expect(
      enqueueTrialWrapupEmail(uncertain.db, {
        orgId: "org-1",
        userId: "admin-2",
        trialEndsAt: deadline,
      }),
    ).resolves.toBe(false);
    expect(uncertain.rows).toEqual([
      expect.objectContaining({
        userId: "admin-1",
        emailKind: "trial_wrapup",
        error: "delivery_ambiguous:provider",
        deliverySnapshot: snapshot,
      }),
    ]);

    const retryable = buildStatefulWrapupDb({
      id: "schedule-retryable",
      orgId: "org-1",
      userId: "admin-1",
      emailKind: "trial_wrapup",
      error: "resend_status_503:retry",
      deliverySnapshot: snapshot,
    });
    await enqueueTrialWrapupEmail(retryable.db, {
      orgId: "org-1",
      userId: "admin-1",
      trialEndsAt: deadline,
    });
    expect(retryable.rows[0]).toMatchObject({ error: null, deliverySnapshot: snapshot });
  });
});

function buildWrapupDiscoveryDb(options: {
  dueOrgs: Array<Record<string, unknown>>;
  discoveryPages?: Array<Array<Record<string, unknown>>>;
  adminsByOrg?: Record<string, Array<Record<string, unknown>>>;
  txAdminsByOrg?: Record<string, Array<Record<string, unknown>>>;
  freshOrgsById?: Record<string, Record<string, unknown> | null>;
  existingScheduleKeys?: string[];
  transactionErrors?: Array<Error | undefined>;
}) {
  const inserted: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const scheduleKeys = new Set(options.existingScheduleKeys ?? []);
  const scheduleRows = new Map<string, Record<string, unknown>>();
  for (const key of scheduleKeys) {
    const [orgId, userId, emailKind] = key.split(":");
    const deadline = options.dueOrgs.find((row) => row.id === orgId)?.trialEndsAt as
      | Date
      | undefined;
    scheduleRows.set(orgId!, {
      id: `schedule-${orgId}`,
      orgId,
      userId,
      emailKind,
      error: null,
      deliverySnapshot: deadline
        ? { version: 1, intent: "trial_wrapup", trialEndsAt: deadline.toISOString() }
        : null,
    });
  }
  const txAdminLookupOrder = [...options.dueOrgs.map((row) => String(row.id))];
  const discoveryPages = options.discoveryPages ?? [options.dueOrgs, []];
  let discoveryPage = 0;
  const select = vi.fn(() => {
    return {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn(() => Promise.resolve(discoveryPages[discoveryPage++] ?? [])),
    };
  });
  const insert = vi.fn(() => ({
    values: vi.fn((row: Record<string, unknown>) => {
      const key = `${String(row.orgId)}:${String(row.userId)}:${String(row.emailKind)}`;
      if (!scheduleKeys.has(key)) {
        scheduleKeys.add(key);
        inserted.push(row);
        scheduleRows.set(String(row.orgId), { id: "schedule-new", ...row, error: null });
      }
      const insertedNow = inserted.at(-1) === row;
      return {
        onConflictDoNothing: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue(insertedNow ? [{ id: "schedule-new" }] : []),
        })),
      };
    }),
  }));
  const update = vi.fn(() => ({
    set: vi.fn((row: Record<string, unknown>) => {
      const isScheduleClaim = "trialWrapupScheduledForEndAt" in row;
      if (!isScheduleClaim) updates.push(row);
      if ("userId" in row && currentOrgId && scheduleRows.has(currentOrgId)) {
        scheduleRows.set(currentOrgId, { ...scheduleRows.get(currentOrgId), ...row });
      }
      if (
        "emailKind" in row &&
        typeof row.emailKind === "string" &&
        row.emailKind.startsWith("trial_wrapup_superseded:")
      ) {
        for (const [orgId, schedule] of scheduleRows) {
          if (schedule.emailKind === "trial_wrapup") {
            scheduleRows.set(orgId, { ...schedule, ...row });
          }
        }
      }
      return {
        where: vi.fn(() => ({
          returning: vi
            .fn()
            .mockResolvedValue(
              isScheduleClaim ||
                (typeof row.emailKind === "string" &&
                  row.emailKind.startsWith("trial_wrapup_superseded:"))
                ? [{ id: "updated" }]
                : [],
            ),
        })),
      };
    }),
  }));
  const txSelect = vi.fn(() => {
    const orgId = txAdminLookupOrder.shift() ?? "";
    return {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi
        .fn()
        .mockResolvedValue(options.txAdminsByOrg?.[orgId] ?? options.adminsByOrg?.[orgId] ?? []),
    };
  });
  let currentOrgId = "";
  const findFirst = vi.fn(({ where }: { where: unknown }) => {
    void where;
    const org = options.dueOrgs[findFirst.mock.calls.length - 1];
    const orgId = String(org?.id ?? "");
    currentOrgId = orgId;
    return Promise.resolve(
      options.freshOrgsById?.[orgId] ??
        org ?? {
          id: orgId,
          subscriptionStatus: "trialing",
          trialEndsAt: new Date("2026-04-04T12:00:00.000Z"),
          trialWillEndNotifiedAt: null,
          trialWrapupNotifiedForEndAt: null,
        },
    );
  });
  const tx = {
    query: {
      organizations: { findFirst },
      trialEmailSchedule: {
        findFirst: vi.fn(() => Promise.resolve(scheduleRows.get(currentOrgId) ?? null)),
      },
    },
    select: txSelect,
    insert,
    update,
  };
  const transactionErrors = [...(options.transactionErrors ?? [])];
  const transaction = vi.fn(async (callback: (transactionDb: unknown) => Promise<unknown>) => {
    const error = transactionErrors.shift();
    if (error) {
      txAdminLookupOrder.shift();
      throw error;
    }
    return callback(tx);
  });

  return {
    db: { select, transaction } as unknown as Database,
    inserted,
    updates,
    findFirst,
    transaction,
    txSelect,
  };
}

describe("runTrialWrapupDiscoveryTick", () => {
  const now = new Date("2026-04-01T12:00:00.000Z");

  beforeEach(() => {
    mockCaptureBackgroundException.mockClear();
    mockAnalyticsCapture.mockClear();
  });

  it("discovers due trialing orgs and enqueues the unique wrapup row without stamping the marker", async () => {
    const { db, inserted, updates, transaction } = buildWrapupDiscoveryDb({
      dueOrgs: [
        {
          id: "org-1",
          subscriptionStatus: "trialing",
          trialEndsAt: new Date("2026-04-04T12:00:00.000Z"),
          trialWillEndNotifiedAt: null,
        },
      ],
      adminsByOrg: {
        "org-1": [{ userId: "user-1", email: "admin@example.org" }],
      },
    });

    await expect(
      runTrialWrapupDiscoveryTick(db, now, { INTEGRATION_MODE: "mock" } as Bindings),
    ).resolves.toEqual({
      eligible: 1,
      scheduled: 1,
      missingAdmin: 0,
      skipped: 0,
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(inserted).toEqual([
      expect.objectContaining({
        orgId: "org-1",
        userId: "user-1",
        emailKind: "trial_wrapup",
        sendAfter: expect.any(Date),
      }),
    ]);
    expect(updates).toEqual([]);
    expect(mockCaptureBackgroundException).not.toHaveBeenCalled();
    expect(mockAnalyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: "org-1", eventName: "trial_wrapup_discovered" }),
    );
  });

  it("uses the same stable admin tie-break as the Stripe wrapup path", async () => {
    const fixture = buildWrapupDiscoveryDb({
      dueOrgs: [
        {
          id: "org-tied-admins",
          subscriptionStatus: "trialing",
          trialEndsAt: new Date("2026-04-04T12:00:00.000Z"),
          trialWillEndNotifiedAt: null,
          trialWrapupNotifiedForEndAt: null,
        },
      ],
      txAdminsByOrg: {
        "org-tied-admins": [{ userId: "admin-a", email: "a@example.org" }],
      },
    });

    await runTrialWrapupDiscoveryTick(fixture.db, now);

    const selectChain = fixture.txSelect.mock.results[0]?.value;
    expect(selectChain.orderBy).toHaveBeenCalledWith(orgMembers.joinedAt, orgMembers.userId);
  });

  it("does not create duplicate schedule rows when discovery repeats before delivery", async () => {
    const fixture = buildWrapupDiscoveryDb({
      dueOrgs: [
        {
          id: "org-1",
          subscriptionStatus: "trialing",
          trialEndsAt: new Date("2026-04-04T12:00:00.000Z"),
          trialWillEndNotifiedAt: null,
        },
      ],
      adminsByOrg: {
        "org-1": [{ userId: "user-1", email: "admin@example.org" }],
      },
    });

    const analyticsBindings = { INTEGRATION_MODE: "mock" } as Bindings;
    await runTrialWrapupDiscoveryTick(fixture.db, now, analyticsBindings);
    await runTrialWrapupDiscoveryTick(fixture.db, now, analyticsBindings);

    expect(fixture.inserted).toEqual([
      expect.objectContaining({
        orgId: "org-1",
        userId: "user-1",
        emailKind: "trial_wrapup",
      }),
    ]);
    expect(fixture.updates).toEqual([]);
    expect(mockAnalyticsCapture).toHaveBeenCalledTimes(1);
  });

  it("can enqueue a replacement admin when an old deleted-member schedule exists", async () => {
    const { db, inserted, updates } = buildWrapupDiscoveryDb({
      dueOrgs: [
        {
          id: "org-1",
          subscriptionStatus: "trialing",
          trialEndsAt: new Date("2026-04-04T12:00:00.000Z"),
          trialWillEndNotifiedAt: null,
        },
      ],
      adminsByOrg: {
        "org-1": [{ userId: "user-replacement", email: "new-admin@example.org" }],
      },
      existingScheduleKeys: ["org-1:user-deleted:trial_wrapup"],
    });

    await expect(runTrialWrapupDiscoveryTick(db, now)).resolves.toEqual({
      eligible: 1,
      scheduled: 1,
      missingAdmin: 0,
      skipped: 0,
    });

    expect(inserted).toEqual([
      expect.objectContaining({
        userId: "user-replacement",
        emailKind: "trial_wrapup",
        deliverySnapshot: expect.objectContaining({
          intent: "trial_wrapup",
          trialEndsAt: "2026-04-04T12:00:00.000Z",
        }),
      }),
    ]);
    expect(updates).toContainEqual(
      expect.objectContaining({ emailKind: "trial_wrapup_superseded:schedule-org-1" }),
    );
  });

  it("leaves a due org eligible for the next tick when no active admin can be resolved", async () => {
    const { db, inserted, updates, transaction } = buildWrapupDiscoveryDb({
      dueOrgs: [
        {
          id: "org-missing-admin",
          subscriptionStatus: "trialing",
          trialEndsAt: new Date("2026-04-04T12:00:00.000Z"),
          trialWillEndNotifiedAt: null,
        },
      ],
      adminsByOrg: { "org-missing-admin": [] },
    });

    await expect(runTrialWrapupDiscoveryTick(db, now)).resolves.toEqual({
      eligible: 1,
      scheduled: 0,
      missingAdmin: 1,
      skipped: 0,
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(inserted).toEqual([]);
    expect(updates).toEqual([]);
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Trial wrapup discovery skipped org without an active admin",
      }),
      "trial-email-discovery",
      { orgId: "org-missing-admin", reason: "missing_admin" },
    );
    expect(JSON.stringify(mockCaptureBackgroundException.mock.calls)).not.toContain(
      "admin@example.org",
    );
  });

  it("does not enqueue or stamp when the org marker changed before the transaction", async () => {
    const alreadyNotifiedAt = new Date("2026-04-01T12:01:00.000Z");
    const { db, inserted, updates } = buildWrapupDiscoveryDb({
      dueOrgs: [
        {
          id: "org-1",
          subscriptionStatus: "trialing",
          trialEndsAt: new Date("2026-04-04T12:00:00.000Z"),
          trialWillEndNotifiedAt: null,
        },
      ],
      adminsByOrg: {
        "org-1": [{ userId: "user-1", email: "admin@example.org" }],
      },
      freshOrgsById: {
        "org-1": {
          id: "org-1",
          subscriptionStatus: "trialing",
          trialEndsAt: new Date("2026-04-04T12:00:00.000Z"),
          trialWillEndNotifiedAt: alreadyNotifiedAt,
        },
      },
    });

    await expect(runTrialWrapupDiscoveryTick(db, now)).resolves.toEqual({
      eligible: 1,
      scheduled: 0,
      missingAdmin: 0,
      skipped: 1,
    });

    expect(inserted).toEqual([]);
    expect(updates).toEqual([]);
  });

  it("keeps the org eligible when the admin is deleted before the transaction", async () => {
    const { db, inserted, updates, transaction } = buildWrapupDiscoveryDb({
      dueOrgs: [
        {
          id: "org-1",
          subscriptionStatus: "trialing",
          trialEndsAt: new Date("2026-04-04T12:00:00.000Z"),
          trialWillEndNotifiedAt: null,
        },
      ],
      adminsByOrg: {
        "org-1": [{ userId: "user-1", email: "admin@example.org" }],
      },
      txAdminsByOrg: {
        "org-1": [],
      },
    });

    await expect(runTrialWrapupDiscoveryTick(db, now)).resolves.toEqual({
      eligible: 1,
      scheduled: 0,
      missingAdmin: 1,
      skipped: 0,
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(inserted).toEqual([]);
    expect(updates).toEqual([]);
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Trial wrapup discovery skipped org without an active admin",
      }),
      "trial-email-discovery",
      { orgId: "org-1", reason: "missing_admin" },
    );
  });

  it("continues past a full first page of unresolved orgs", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: `org-missing-${index}`,
      subscriptionStatus: "trialing",
      trialEndsAt: new Date(`2026-04-02T${String(index % 24).padStart(2, "0")}:00:00.000Z`),
      trialWillEndNotifiedAt: null,
    }));
    const finalOrg = {
      id: "org-page-2",
      subscriptionStatus: "trialing",
      trialEndsAt: new Date("2026-04-04T12:00:00.000Z"),
      trialWillEndNotifiedAt: null,
    };
    const dueOrgs = [...firstPage, finalOrg];
    const { db, inserted } = buildWrapupDiscoveryDb({
      dueOrgs,
      discoveryPages: [firstPage, [finalOrg], []],
      adminsByOrg: { "org-page-2": [{ userId: "admin-2", email: "admin@example.org" }] },
    });

    const result = await runTrialWrapupDiscoveryTick(db, now);

    expect(result).toMatchObject({ eligible: 101, scheduled: 1, missingAdmin: 100 });
    expect(inserted).toContainEqual(
      expect.objectContaining({ orgId: "org-page-2", userId: "admin-2" }),
    );
  });

  it("captures one broken org and continues discovery for later orgs", async () => {
    const dueOrgs = [
      {
        id: "org-broken",
        subscriptionStatus: "trialing",
        trialEndsAt: new Date("2026-04-02T12:00:00.000Z"),
        trialWillEndNotifiedAt: null,
      },
      {
        id: "org-healthy",
        subscriptionStatus: "trialing",
        trialEndsAt: new Date("2026-04-03T12:00:00.000Z"),
        trialWillEndNotifiedAt: null,
      },
    ];
    const { db, inserted } = buildWrapupDiscoveryDb({
      dueOrgs,
      adminsByOrg: { "org-healthy": [{ userId: "admin-2", email: "admin@example.org" }] },
      transactionErrors: [new Error("broken org row"), undefined],
    });

    await expect(runTrialWrapupDiscoveryTick(db, now)).resolves.toMatchObject({
      eligible: 2,
      scheduled: 1,
      skipped: 1,
    });
    expect(inserted).toContainEqual(expect.objectContaining({ orgId: "org-healthy" }));
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "broken org row" }),
      "trial-email-discovery",
      { orgId: "org-broken", reason: "schedule_failed" },
    );
  });

  it("skips fresh orgs that are no longer trialing or already notified for the deadline", async () => {
    const deadlines = [2, 3, 4].map((day) => new Date(`2026-04-0${day}T12:00:00.000Z`));
    const dueOrgs = deadlines.map((trialEndsAt, index) => ({
      id: `org-stale-${index}`,
      subscriptionStatus: "trialing",
      trialEndsAt,
      trialWillEndNotifiedAt: null,
    }));
    const { db } = buildWrapupDiscoveryDb({
      dueOrgs,
      freshOrgsById: {
        "org-stale-0": { ...dueOrgs[0], subscriptionStatus: "active" },
        "org-stale-1": { ...dueOrgs[1], trialWillEndNotifiedAt: now },
        "org-stale-2": {
          ...dueOrgs[2],
          trialWrapupNotifiedForEndAt: deadlines[2],
        },
      },
    });

    await expect(runTrialWrapupDiscoveryTick(db, now)).resolves.toEqual({
      eligible: 3,
      scheduled: 0,
      missingAdmin: 0,
      skipped: 3,
    });
  });

  it("captures analytics failures after persisting a discovered wrapup intent", async () => {
    const analyticsError = new Error("analytics unavailable");
    mockAnalyticsCapture.mockRejectedValueOnce(analyticsError);
    const { db } = buildWrapupDiscoveryDb({
      dueOrgs: [
        {
          id: "org-analytics-failure",
          subscriptionStatus: "trialing",
          trialEndsAt: new Date("2026-04-04T12:00:00.000Z"),
          trialWillEndNotifiedAt: null,
        },
      ],
      adminsByOrg: {
        "org-analytics-failure": [{ userId: "admin-1", email: "admin@example.org" }],
      },
    });

    await runTrialWrapupDiscoveryTick(db, now, { INTEGRATION_MODE: "mock" } as Bindings);

    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      analyticsError,
      "trial-email-analytics",
      { analytics_event: "trial_wrapup_discovered" },
    );
  });
});

describe("sendTrialLifecycleEmail", () => {
  const originalFetch = globalThis.fetch;
  const bindings = {
    RESEND_API_KEY: "re_test",
    APP_URL: "https://app.grantpipe.com",
    MARKETING_URL: "https://grantpipe.com",
  } as Bindings;

  beforeEach(() => {
    vi.resetAllMocks();
    mockAnalyticsCapture.mockResolvedValue(undefined);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends a welcome confirmation email via Resend", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("{}"),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      sendTrialLifecycleEmail(bindings, {
        emailKind: "welcome",
        toEmail: "admin@example.org",
        userName: "Alice",
        orgName: "Acme",
      }),
    ).resolves.toEqual({ ok: true });

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body) as {
      subject: string;
      html: string;
      text: string;
      from: string;
    };
    expect(body.from).toBe("GrantPipe <angel.campa@grantpipe.com>");
    expect(body.subject).toBe("Start with one award");
    expect(body.html).toContain("data-cta");
    expect(body.html).toContain("https://app.grantpipe.com/app/import?source=trial-email");
    expect(body.html).toContain("Start with one award letter or grant file");
    expect(body.html).toContain("dates, amounts, fund limits, and proof");
    expect(body.html).toContain('href="https://grantpipe.com/product/#product-tour"');
    expect(body.text).toContain("Your GrantPipe trial is active");
    expect(body.text).toContain("Add one award: https://app.grantpipe.com/app/import");
    expect(body.text).toContain(
      "Watch the product tour: https://grantpipe.com/product/#product-tour",
    );
  });

  it("uses aha-driven trial activation subjects and CTAs", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("{}"),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    for (const emailKind of TRIAL_EMAIL_KINDS) {
      await sendTrialLifecycleEmail(bindings, {
        emailKind,
        toEmail: "admin@example.org",
        userName: "Alice",
        orgName: "Acme",
      });
    }

    const payloads = fetchMock.mock.calls.map(
      (call) =>
        JSON.parse((call[1] as { body: string }).body) as {
          subject: string;
          html: string;
          text: string;
        },
    );

    expect(payloads.map((payload) => payload.subject)).toEqual([
      "Start with one award",
      "Add the next report date",
      "Attach one proof file",
      "Invite the person who owns the report",
      "Open your first report view",
      "Ask where the money went",
      "Pick the plan that fits",
      "Your GrantPipe trial ends in less than a day",
    ]);
    expect(payloads[0]?.html).toContain("Add one award");
    expect(payloads[0]?.html).toContain("/import?source=trial-email");
    expect(payloads[1]?.html).toContain("Add a report date");
    expect(payloads[1]?.html).toContain("what is due, what is left, and what needs proof");
    // Pin the onboarding deep link so nav consolidation cannot silently break it.
    expect(payloads[1]?.html).toContain('href="https://app.grantpipe.com/app/onboarding"');
    expect(payloads[2]?.html).toContain("Attach proof");
    expect(payloads[2]?.html).toContain("/documents?source=trial-email");
    expect(payloads[3]?.html).toContain("Invite a teammate");
    expect(payloads[3]?.html).toContain("/settings/team?source=trial-email");
    expect(payloads[4]?.html).toContain("Open reports");
    expect(payloads[4]?.html).toContain("/reports?source=trial-email");
    expect(payloads[5]?.html).toContain("Ask a ledger question");
    expect(payloads[5]?.html).toContain("/reports/ask-ledger?source=trial-email");
    expect(payloads[6]?.html).toContain("Review plan fit");
    expect(payloads[6]?.html).toContain("/settings/billing");
    expect(JSON.stringify(payloads)).not.toContain("$30K");
    expect(JSON.stringify(payloads)).not.toContain("10 seconds");
  });

  it("builds product tour links from the configured marketing URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("{}"),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await sendTrialLifecycleEmail(
      {
        ...bindings,
        MARKETING_URL: "https://preview.grantpipe.com/",
      },
      {
        emailKind: "welcome",
        toEmail: "admin@example.org",
        userName: "Alice",
        orgName: "Acme",
      },
    );

    const payload = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body) as {
      html: string;
      text: string;
    };

    expect(payload.html).toContain('href="https://preview.grantpipe.com/product/#product-tour"');
    expect(payload.text).toContain(
      "Watch the product tour: https://preview.grantpipe.com/product/#product-tour",
    );
  });

  it.each([
    ["quick_start", "Add the next report date", "/grants?source=trial-email"],
    ["proof_file", "Attach one proof file", "/documents?source=trial-email"],
    ["team_invite", "Invite the person who owns the report", "/settings/team?source=trial-email"],
    ["report_view", "Open your first report view", "/reports?source=trial-email"],
    ["plan_nudge", "Ask where the money went", "/reports/ask-ledger?source=trial-email"],
    ["billing_prompt", "Pick the plan that fits", "/settings/billing"],
    ["trial_wrapup", "Your GrantPipe trial ends in less than a day", "/settings/billing"],
  ] as const)("sends %s copy through the shared email layout", async (emailKind, subject, path) => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("{}"),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      sendTrialLifecycleEmail(
        { RESEND_API_KEY: "re_test", APP_URL: "https://app.grantpipe.com" } as Bindings,
        {
          emailKind,
          toEmail: "admin@example.org",
          userName: "A & <B>",
          orgName: "Grant & Fund <Ops>",
        },
      ),
    ).resolves.toEqual({ ok: true });

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body) as {
      subject: string;
      html: string;
    };
    expect(body.subject).toBe(subject);
    expect(body.html).toContain(`https://app.grantpipe.com/app${path}`);
    expect(body.html).toContain("A &amp; &lt;B&gt;");
    expect(body.html).not.toContain("Grant & Fund <Ops>");
  });

  it("states one day at the 24-hour boundary and less than a day below it", async () => {
    const payloads: Array<{ subject: string }> = [];
    globalThis.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      payloads.push(JSON.parse(String(init?.body)) as { subject: string });
      return { ok: true, status: 200, text: () => Promise.resolve("{}") };
    }) as unknown as typeof fetch;
    const now = new Date("2026-04-08T16:00:00.000Z");
    for (const remainingMs of [24 * 60 * 60 * 1000, 23 * 60 * 60 * 1000]) {
      await sendTrialLifecycleEmail(bindings, {
        emailKind: "trial_wrapup",
        toEmail: "admin@example.org",
        orgName: "Acme",
        trialEndsAt: new Date(now.getTime() + remainingMs),
        now,
      });
    }
    expect(payloads.map((payload) => payload.subject)).toEqual([
      "Your GrantPipe trial ends in 1 day",
      "Your GrantPipe trial ends in less than a day",
    ]);
  });

  it("uses canonical URLs and the current clock when optional rendering inputs are absent", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("{}"),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await sendTrialLifecycleEmail({ RESEND_API_KEY: "re_test" } as Bindings, {
      emailKind: "trial_wrapup",
      toEmail: "admin@example.org",
      orgName: "Acme",
      trialEndsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    });

    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain("https://app.grantpipe.com");
  });

  it("keeps trial lifecycle copy clear of legacy positioning phrases", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("{}"),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const banned = [
      ["one", "operating system"].join(" "),
      ["same", "operating system"].join(" "),
      ["audit-ready", "reporting"].join(" "),
      ["no consultants", "required"].join(" "),
      ["30-day", "trial"].join(" "),
      ["without", "consultants"].join(" "),
    ];

    for (const emailKind of TRIAL_EMAIL_KINDS) {
      await sendTrialLifecycleEmail(bindings, {
        emailKind,
        toEmail: "admin@example.org",
        userName: "Alice",
        orgName: "Acme",
      });
    }

    const payloads = fetchMock.mock.calls.map(
      (call) => JSON.parse((call[1] as { body: string }).body) as { html: string; text: string },
    );
    for (const payload of payloads) {
      const copy = `${payload.html}\n${payload.text}`.toLowerCase();
      for (const phrase of banned) {
        expect(copy).not.toContain(phrase);
      }
    }
  });

  it("adds a footer unsubscribe preference link to every trial lifecycle email", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("{}"),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    for (const emailKind of TRIAL_EMAIL_KINDS) {
      await sendTrialLifecycleEmail(bindings, {
        emailKind,
        toEmail: "admin@example.org",
        userName: "Alice",
        orgName: "Acme",
      });
    }

    for (const call of fetchMock.mock.calls) {
      const payload = JSON.parse((call[1] as { body: string }).body) as {
        headers?: Record<string, string>;
        html: string;
        text: string;
      };
      expect(payload.html).toContain("Unsubscribe");
      expect(payload.html).toContain(
        "https://app.grantpipe.com/app/notifications?source=trial-email",
      );
      expect(payload.html).toContain(
        "You're receiving this because you're using a GrantPipe trial.",
      );
      expect(payload.text).toContain(
        "Manage trial emails: https://app.grantpipe.com/app/notifications?source=trial-email",
      );
      expect(payload.headers).toEqual({
        "List-Unsubscribe":
          "<mailto:angel.campa@grantpipe.com?subject=Unsubscribe>, <https://app.grantpipe.com/app/notifications?source=trial-email>",
      });
    }
  });

  it("returns a retryable error when Resend is not configured", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      sendTrialLifecycleEmail({ APP_URL: "https://app.grantpipe.com" } as Bindings, {
        emailKind: "welcome",
        toEmail: "admin@example.org",
        userName: "Alice",
        orgName: "Acme",
      }),
    ).resolves.toEqual({
      ok: false,
      error: "RESEND_API_KEY is required for trial email delivery",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records Resend status even when the error body cannot be read", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.reject(new Error("body unavailable")),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      sendTrialLifecycleEmail(bindings, {
        emailKind: "welcome",
        toEmail: "admin@example.org",
        userName: null,
        orgName: "Acme",
      }),
    ).resolves.toEqual({ ok: false, error: "resend_status_503:", ambiguous: true });
  });

  it.each([
    [400, undefined],
    [429, true],
  ] as const)("classifies Resend status %s by delivery ambiguity", async (status, ambiguous) => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status,
      text: () => Promise.resolve("provider response"),
    }) as unknown as typeof fetch;

    const result = await sendTrialLifecycleEmail(bindings, {
      emailKind: "welcome",
      toEmail: "admin@example.org",
      orgName: "Acme",
    });

    expect(result).toMatchObject({ ok: false, error: `resend_status_${status}:provider response` });
    expect(result.ambiguous).toBe(ambiguous);
  });

  it.each([
    ["concurrent_idempotent_requests", true],
    ["invalid_idempotent_request", undefined],
    ["unknown_conflict", true],
  ] as const)(
    "classifies Resend 409 error name %s by delivery ambiguity",
    async (name, ambiguous) => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        text: () => Promise.resolve(JSON.stringify({ name, message: "provider detail" })),
      }) as unknown as typeof fetch;

      const result = await sendTrialLifecycleEmail(bindings, {
        emailKind: "welcome",
        toEmail: "admin@example.org",
        orgName: "Acme",
      });

      expect(result).toMatchObject({ ok: false, error: `resend_status_409:${name}` });
      expect(result.ambiguous).toBe(ambiguous);
    },
  );
});

describe("findDueTrialEmailRows", () => {
  it("drops rows with unknown email kinds before sending", async () => {
    const { db } = buildTickDb([
      {
        id: "schedule-good",
        orgId: "org-1",
        userId: "user-1",
        emailKind: "welcome",
        toEmail: "admin@example.org",
        userName: "Alice",
        orgName: "Acme",
        subscriptionStatus: "trialing",
        memberRole: "admin",
        memberDeletedAt: null,
      },
      {
        id: "schedule-unknown",
        orgId: "org-1",
        userId: "user-1",
        emailKind: "surprise",
        toEmail: "admin@example.org",
        userName: "Alice",
        orgName: "Acme",
        subscriptionStatus: "trialing",
        memberRole: "admin",
        memberDeletedAt: null,
      },
    ]);

    await expect(findDueTrialEmailRows(db, new Date("2026-04-01T00:00:00Z"))).resolves.toEqual([
      expect.objectContaining({ id: "schedule-good", emailKind: "welcome" }),
    ]);
  });

  it("retries a transient database control-plane failure on the read (GRANTPIPE-API-Z)", async () => {
    vi.useFakeTimers();
    try {
      const rows = [
        {
          id: "schedule-1",
          orgId: "org-1",
          userId: "user-1",
          emailKind: "welcome",
          toEmail: "admin@example.org",
          userName: "Alice",
          orgName: "Acme",
          subscriptionStatus: "trialing",
          memberRole: "admin",
          memberDeletedAt: null,
        },
      ];
      const transient = Object.assign(new Error("Failed query: select trial_email_schedule ..."), {
        cause: new Error("Control plane request failed"),
      });
      const limit = vi.fn().mockRejectedValueOnce(transient).mockResolvedValue(rows);
      const selectChain = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit,
      };
      const db = { select: vi.fn(() => selectChain) } as unknown as Database;

      const promise = findDueTrialEmailRows(db, new Date("2026-04-01T00:00:00Z"));
      // Advance past the first withDbRetry backoff (250 ms) so the retry runs
      // without consuming wall-clock time in CI.
      await vi.advanceTimersByTimeAsync(250);
      await expect(promise).resolves.toEqual([
        expect.objectContaining({ id: "schedule-1", emailKind: "welcome" }),
      ]);

      expect(limit).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries a wrapper-only Drizzle failed-query error on the due-email read", async () => {
    vi.useFakeTimers();
    try {
      const rows = [
        {
          id: "schedule-1",
          orgId: "org-1",
          userId: "user-1",
          emailKind: "welcome",
          toEmail: "admin@example.org",
          userName: "Alice",
          orgName: "Acme",
          subscriptionStatus: "trialing",
          memberRole: "admin",
          memberDeletedAt: null,
        },
      ];
      const wrapperOnly = new Error(
        'Failed query: select "trial_email_schedule"."id" from "trial_email_schedule"\nparams: 2026-05-21T14:01:35.303Z,active,100',
      );
      const limit = vi.fn().mockRejectedValueOnce(wrapperOnly).mockResolvedValue(rows);
      const selectChain = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit,
      };
      const db = { select: vi.fn(() => selectChain) } as unknown as Database;

      const promise = findDueTrialEmailRows(db, new Date("2026-04-01T00:00:00Z"));
      await vi.advanceTimersByTimeAsync(250);
      await expect(promise).resolves.toEqual([
        expect.objectContaining({ id: "schedule-1", emailKind: "welcome" }),
      ]);

      expect(limit).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry a non-transient query failure", async () => {
    const fatal = Object.assign(new Error('syntax error at or near "WHERE"'), {
      code: "42601",
    });
    const limit = vi.fn().mockRejectedValue(fatal);
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit,
    };
    const db = { select: vi.fn(() => selectChain) } as unknown as Database;

    await expect(findDueTrialEmailRows(db, new Date("2026-04-01T00:00:00Z"))).rejects.toBe(fatal);
    expect(limit).toHaveBeenCalledTimes(1);
  });
});

describe("runTrialEmailTick", () => {
  const bindings = {
    RESEND_API_KEY: "re_test",
    APP_URL: "https://app.grantpipe.com",
  } as Bindings;
  // 2026-04-08 is a Wednesday; 16:00Z === 12:00 in America/New_York (EDT),
  // squarely inside the 9am–5pm business-hours send window.
  const businessHoursNow = new Date("2026-04-08T16:00:00.000Z");
  // 2026-04-08 06:00Z === 02:00 EDT — the middle of the night locally.
  const middleOfNightNow = new Date("2026-04-08T06:00:00.000Z");
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends due trial emails and marks them sent", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("{}"),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db, updates } = buildTickDb([
      {
        id: "schedule-1",
        orgId: "org-1",
        userId: "user-1",
        emailKind: "quick_start",
        toEmail: "admin@example.org",
        userName: "Alice",
        orgName: "Acme",
        subscriptionStatus: "trialing",
        memberRole: "admin",
        memberDeletedAt: null,
      },
    ]);

    await runTrialEmailTick(db, bindings, businessHoursNow);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(updates).toContainEqual(
      expect.objectContaining({ sentAt: expect.any(Date), error: null }),
    );
  });

  it("marks the org notified in the same transaction as a successful trial_wrapup send", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("{}"),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db, updates, transaction } = buildTickDb([
      {
        id: "schedule-wrapup",
        orgId: "org-1",
        userId: "user-1",
        emailKind: "trial_wrapup",
        toEmail: "admin@example.org",
        userName: "Alice",
        orgName: "Acme",
        subscriptionStatus: "trialing",
        memberRole: "admin",
        memberDeletedAt: null,
      },
    ]);

    await runTrialEmailTick(db, bindings, businessHoursNow);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          error: expect.stringContaining("delivery_in_progress:"),
        }),
        expect.objectContaining({
          sentAt: businessHoursNow,
          error: null,
          updatedAt: businessHoursNow,
        }),
        expect.objectContaining({
          trialWillEndNotifiedAt: businessHoursNow,
          updatedAt: businessHoursNow,
        }),
      ]),
    );
    expect(mockAnalyticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: "org-1", eventName: "trial_wrapup_delivered" }),
    );
  });

  it("captures a definite wrapup provider failure", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve("invalid request"),
    }) as unknown as typeof fetch;
    const { db } = buildTickDb([
      {
        id: "wrapup-failed",
        orgId: "org-failed",
        userId: "admin-failed",
        emailKind: "trial_wrapup",
        toEmail: "admin@example.org",
        orgName: "Failed",
        subscriptionStatus: "trialing",
        memberRole: "admin",
        memberDeletedAt: null,
      },
    ]);

    await runTrialEmailTick(db, bindings, businessHoursNow);

    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Trial email provider delivery failed" }),
      "trial-email-delivery",
      { emailKind: "trial_wrapup", reason: "provider_failed" },
    );
  });

  it("captures a definite non-wrapup provider failure without recipient data", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve("invalid request"),
    }) as unknown as typeof fetch;
    const { db } = buildTickDb([
      {
        id: "quick-start-failed",
        orgId: "org-failed",
        userId: "admin-failed",
        emailKind: "quick_start",
        toEmail: "private@example.org",
        orgName: "Failed",
        subscriptionStatus: "trialing",
        memberRole: "admin",
        memberDeletedAt: null,
      },
    ]);

    await runTrialEmailTick(db, bindings, businessHoursNow);

    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Trial email provider delivery failed" }),
      "trial-email-delivery",
      { emailKind: "quick_start", reason: "provider_failed" },
    );
  });

  it("rotates a definite failure so a corrected recipient uses a new request and key", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve("invalid recipient"),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve("{}"),
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db, rowsState } = buildTickDb([
      {
        id: "schedule-corrected-recipient",
        orgId: "org-corrected-recipient",
        userId: "admin-corrected-recipient",
        emailKind: "quick_start",
        toEmail: "old-invalid@example.org",
        userName: "Admin",
        orgName: "Acme",
        subscriptionStatus: "trialing",
        memberRole: "admin",
        memberDeletedAt: null,
      },
    ]);

    await runTrialEmailTick(db, bindings, businessHoursNow);
    rowsState[0]!.toEmail = "corrected@example.org";
    await runTrialEmailTick(db, bindings, new Date(businessHoursNow.getTime() + 60 * 60 * 1000));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstInit = fetchMock.mock.calls[0]?.[1];
    const secondInit = fetchMock.mock.calls[1]?.[1];
    expect(firstInit?.body).toContain("old-invalid@example.org");
    expect(secondInit?.body).toContain("corrected@example.org");
    expect(new Headers(secondInit?.headers).get("Idempotency-Key")).not.toBe(
      new Headers(firstInit?.headers).get("Idempotency-Key"),
    );
  });

  it("does not let an old wrapup attempt mark a replacement recipient intent delivered", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("{}"),
    }) as unknown as typeof fetch;
    const { db, updates } = buildTickDb(
      [
        {
          id: "wrapup-replaced-in-flight",
          orgId: "org-replaced-in-flight",
          userId: "old-admin",
          emailKind: "trial_wrapup",
          toEmail: "old-admin@example.org",
          orgName: "Race",
          subscriptionStatus: "trialing",
          memberRole: "admin",
          memberDeletedAt: null,
        },
      ],
      [],
      { wrapupNotificationMiss: "newer_claim" },
    );

    await runTrialEmailTick(db, bindings, businessHoursNow);

    expect(updates).not.toContainEqual(expect.objectContaining({ sentAt: businessHoursNow }));
  });

  it("does not call the provider when a non-wrapup attempt loses authorization", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db } = buildTickDb(
      [
        {
          id: "quick-start-replaced",
          orgId: "org-replaced",
          userId: "admin-replaced",
          emailKind: "quick_start",
          toEmail: "admin@example.org",
          orgName: "Replaced",
          subscriptionStatus: "trialing",
          memberRole: "admin",
          memberDeletedAt: null,
        },
      ],
      [],
      { rejectAuthorization: true },
    );

    await runTrialEmailTick(db, bindings, businessHoursNow);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rechecks membership, opt-out, and live trial state in the final delivery CAS", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("{}"),
    }) as unknown as typeof fetch;
    const { db, authorizationConditions } = buildTickDb([
      {
        id: "quick-start-final-authorization",
        orgId: "org-final-authorization",
        userId: "admin-final-authorization",
        emailKind: "quick_start",
        toEmail: "admin@example.org",
        orgName: "Final authorization",
        subscriptionStatus: "trialing",
        memberRole: "admin",
        memberDeletedAt: null,
      },
    ]);

    await runTrialEmailTick(db, bindings, businessHoursNow);

    const condition = authorizationConditions[0];
    expect(condition).toBeDefined();
    const rendered = new PgDialect().sqlToQuery(
      condition as Parameters<PgDialect["sqlToQuery"]>[0],
    );
    expect(rendered.sql).toContain('from "org_members"');
    expect(rendered.sql).toContain('from "notification_preferences"');
    expect(rendered.sql).toContain('from "organizations"');
    expect(rendered.sql).toContain('from "user"');
    expect(rendered.sql).toContain('"trial_email_schedule"."error" is null');
    expect(rendered.params).toEqual(
      expect.arrayContaining(["admin", "admin@example.org", "trial_lifecycle", false, "trialing"]),
    );
  });

  it("lets only one concurrent tick call the provider for a delivery snapshot", async () => {
    let releaseFirst!: () => void;
    let firstStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });
    const released = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const fetchMock = vi.fn(async () => {
      if (fetchMock.mock.calls.length === 1) {
        firstStarted();
        await released;
        return { ok: true, status: 200, text: () => Promise.resolve("{}") };
      }
      return { ok: false, status: 409, text: () => Promise.resolve("conflict") };
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db, rowsState } = buildTickDb([
      {
        id: "quick-start-single-writer",
        orgId: "org-single-writer",
        userId: "admin-single-writer",
        emailKind: "quick_start",
        toEmail: "admin@example.org",
        orgName: "Single writer",
        subscriptionStatus: "trialing",
        memberRole: "admin",
        memberDeletedAt: null,
      },
    ]);

    const firstTick = runTrialEmailTick(db, bindings, businessHoursNow);
    await started;
    await runTrialEmailTick(db, bindings, businessHoursNow);
    releaseFirst();
    await firstTick;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(rowsState[0]?.deliverySnapshot).not.toBeNull();
  });

  it("rotates a certain frozen request when the admin email changes before delivery", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("{}"),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db, rowsState } = buildTickDb(
      [
        {
          id: "quick-start-email-race",
          orgId: "org-email-race",
          userId: "admin-email-race",
          emailKind: "quick_start",
          toEmail: "old@example.org",
          orgName: "Email race",
          subscriptionStatus: "trialing",
          memberRole: "admin",
          memberDeletedAt: null,
        },
      ],
      [],
      { authorizationResults: [false, true] },
    );

    await runTrialEmailTick(db, bindings, businessHoursNow);
    rowsState[0]!.toEmail = " New@Example.org ";
    await runTrialEmailTick(db, bindings, new Date(businessHoursNow.getTime() + 60 * 60 * 1000));
    await runTrialEmailTick(
      db,
      bindings,
      new Date(businessHoursNow.getTime() + 2 * 60 * 60 * 1000),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain("New@Example.org");
  });

  it("fences an uncertain frozen request when the admin email changes", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const firstAttemptAt = businessHoursNow.toISOString();
    const { db, rowsState } = buildTickDb([
      {
        id: "quick-start-uncertain-email-race",
        orgId: "org-uncertain-email-race",
        userId: "admin-uncertain-email-race",
        emailKind: "quick_start",
        toEmail: "new@example.org",
        orgName: "Uncertain email race",
        subscriptionStatus: "trialing",
        memberRole: "admin",
        memberDeletedAt: null,
        error: `delivery_in_progress:${firstAttemptAt}`,
        deliverySnapshot: {
          version: 1,
          idempotencyKey: "trial-email/uncertain-email-race",
          firstAttemptAt,
          trialEndsAt: null,
          request: {
            from: "GrantPipe <hello@grantpipe.com>",
            to: ["old@example.org"],
            subject: "Frozen",
            html: "<p>Frozen</p>",
            text: "Frozen",
            headers: { "List-Unsubscribe": "<https://app.grantpipe.com/notifications>" },
          },
        },
      },
    ]);

    await runTrialEmailTick(db, bindings, businessHoursNow);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(rowsState[0]?.error).toContain("delivery_ambiguous:recipient_changed");
  });

  it("does not acquire a wrapup claim when the delivery attempt loses authorization", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db, updates } = buildTickDb(
      [
        {
          id: "wrapup-replaced",
          orgId: "org-wrapup-replaced",
          userId: "admin-wrapup-replaced",
          emailKind: "trial_wrapup",
          toEmail: "admin@example.org",
          orgName: "Replaced",
          subscriptionStatus: "trialing",
          memberRole: "admin",
          memberDeletedAt: null,
        },
      ],
      [],
      { rejectAuthorization: true },
    );

    await runTrialEmailTick(db, bindings, businessHoursNow);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(updates).not.toContainEqual(
      expect.objectContaining({ trialWrapupClaimedAt: expect.any(Date) }),
    );
  });

  it("sends one org wrapup when two admin rows were preloaded", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("{}"),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const base = {
      orgId: "org-one",
      emailKind: "trial_wrapup",
      orgName: "One",
      subscriptionStatus: "trialing",
      memberRole: "admin",
      memberDeletedAt: null,
    };
    const { db } = buildTickDb([
      { ...base, id: "wrapup-one", userId: "admin-one", toEmail: "one@example.org" },
      { ...base, id: "wrapup-two", userId: "admin-two", toEmail: "two@example.org" },
    ]);

    await runTrialEmailTick(db, bindings, businessHoursNow);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not resend a superseded admin wrapup after the org marker is committed", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db } = buildTickDb([
      {
        id: "schedule-old-admin",
        orgId: "org-1",
        userId: "old-admin",
        emailKind: "trial_wrapup",
        toEmail: "old@example.org",
        userName: "Old Admin",
        orgName: "Acme",
        subscriptionStatus: "trialing",
        memberRole: "admin",
        memberDeletedAt: null,
        trialWillEndNotifiedAt: new Date("2026-04-08T15:00:00.000Z"),
      },
    ]);

    await runTrialEmailTick(db, bindings, businessHoursNow);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips a wrapup already notified for its exact deadline", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const deadline = new Date("2026-04-11T16:00:00.000Z");
    const { db } = buildTickDb([
      {
        id: "schedule-notified-deadline",
        orgId: "org-notified-deadline",
        userId: "admin-notified",
        emailKind: "trial_wrapup",
        toEmail: "admin@example.org",
        orgName: "Notified",
        subscriptionStatus: "trialing",
        trialEndsAt: deadline,
        trialWrapupNotifiedForEndAt: deadline,
        memberRole: "admin",
        memberDeletedAt: null,
      },
    ]);

    await runTrialEmailTick(db, bindings, businessHoursNow);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("holds an ambiguous provider outcome for reconciliation", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db } = buildTickDb([
      {
        id: "schedule-provider-ambiguous",
        orgId: "org-provider-ambiguous",
        userId: "admin-ambiguous",
        emailKind: "quick_start",
        toEmail: "admin@example.org",
        orgName: "Ambiguous",
        subscriptionStatus: "trialing",
        memberRole: "admin",
        memberDeletedAt: null,
        error: "delivery_ambiguous:provider",
      },
    ]);

    await runTrialEmailTick(db, bindings, businessHoursNow);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not send wrapups for expired or non-trial organizations", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db } = buildTickDb([
      {
        id: "schedule-canceled",
        orgId: "org-canceled",
        userId: "admin-1",
        emailKind: "trial_wrapup",
        toEmail: "admin@example.org",
        orgName: "Canceled",
        subscriptionStatus: "canceled",
        memberRole: "admin",
        memberDeletedAt: null,
      },
      {
        id: "schedule-expired",
        orgId: "org-expired",
        userId: "admin-2",
        emailKind: "trial_wrapup",
        toEmail: "admin2@example.org",
        orgName: "Expired",
        subscriptionStatus: "trialing",
        trialEndsAt: new Date("2026-04-07T16:00:00.000Z"),
        memberRole: "admin",
        memberDeletedAt: null,
      },
    ]);

    await runTrialEmailTick(db, bindings, businessHoursNow);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not send a wrapup more than three days before the current trial end", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db } = buildTickDb([
      {
        id: "schedule-too-early",
        orgId: "org-too-early",
        userId: "admin-too-early",
        emailKind: "trial_wrapup",
        toEmail: "admin@example.org",
        orgName: "Too Early",
        subscriptionStatus: "trialing",
        trialEndsAt: new Date(businessHoursNow.getTime() + 3 * 24 * 60 * 60 * 1000 + 1),
        memberRole: "admin",
        memberDeletedAt: null,
      },
    ]);

    await runTrialEmailTick(db, bindings, businessHoursNow);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("continues past a full page of permanently skipped delivery rows", async () => {
    const skippedPage = Array.from({ length: 100 }, (_, index) => ({
      id: `schedule-invalid-${index}`,
      orgId: `org-invalid-${index}`,
      userId: `user-invalid-${index}`,
      emailKind: "quick_start",
      toEmail: null,
      orgName: "Invalid",
      subscriptionStatus: "trialing",
      memberRole: "admin",
      memberDeletedAt: null,
      sendAfter: new Date(`2026-04-01T${String(index % 24).padStart(2, "0")}:00:00.000Z`),
    }));
    const validRow = {
      id: "schedule-page-2",
      orgId: "org-page-2",
      userId: "user-page-2",
      emailKind: "quick_start",
      toEmail: "admin@example.org",
      userName: "Admin",
      orgName: "Healthy",
      subscriptionStatus: "trialing",
      memberRole: "admin",
      memberDeletedAt: null,
      sendAfter: new Date("2026-04-02T12:00:00.000Z"),
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("{}"),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db } = buildTickDb([], [], { pages: [skippedPage, [validRow], []] });

    await runTrialEmailTick(db, bindings, businessHoursNow);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain("admin@example.org");
  });

  it("fences a provider-accepted attempt when the recipient changes before persistence retry", async () => {
    const acceptedKeys = new Set<string>();
    let delivered = 0;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const key = headers.get("Idempotency-Key");
      if (!key || !acceptedKeys.has(key)) {
        delivered += 1;
        if (key) acceptedKeys.add(key);
      }
      return { ok: true, status: 200, text: () => Promise.resolve("{}") };
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db, rowsState } = buildTickDb(
      [
        {
          id: "schedule-stable",
          orgId: "org-1",
          userId: "user-1",
          emailKind: "quick_start",
          toEmail: "admin@example.org",
          userName: "Alice",
          orgName: "Acme",
          subscriptionStatus: "trialing",
          memberRole: "admin",
          memberDeletedAt: null,
        },
      ],
      [],
      { failFirstSentUpdate: true },
    );

    await expect(runTrialEmailTick(db, bindings, businessHoursNow)).rejects.toThrow(
      "simulated sentAt persistence failure",
    );
    const frozenAttempt = rowsState[0]!.deliverySnapshot as { firstAttemptAt: string };
    rowsState[0]!.error = `delivery_in_progress:${frozenAttempt.firstAttemptAt}`;
    rowsState[0]!.toEmail = "replacement@example.org";
    rowsState[0]!.userName = "Replacement";
    rowsState[0]!.orgName = "Renamed org";
    await runTrialEmailTick(
      db,
      { ...bindings, MARKETING_URL: "https://changed-template.example" },
      businessHoursNow,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(delivered).toBe(1);
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Idempotency-Key")).toMatch(
      /^trial-email\/schedule-stable\//,
    );
    expect(rowsState[0]?.error).toContain("delivery_ambiguous:recipient_changed");
  });

  it("uses one provider idempotency key when trial_wrapup sentAt and marker persistence fails", async () => {
    const acceptedKeys = new Set<string>();
    let delivered = 0;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const key = headers.get("Idempotency-Key");
      if (!key || !acceptedKeys.has(key)) {
        delivered += 1;
        if (key) acceptedKeys.add(key);
      }
      return { ok: true, status: 200, text: () => Promise.resolve("{}") };
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db } = buildTickDb(
      [
        {
          id: "schedule-wrapup-stable",
          orgId: "org-1",
          userId: "user-1",
          emailKind: "trial_wrapup",
          toEmail: "admin@example.org",
          userName: "Alice",
          orgName: "Acme",
          subscriptionStatus: "trialing",
          memberRole: "admin",
          memberDeletedAt: null,
        },
      ],
      [],
      { failFirstSentUpdate: true },
    );

    await expect(runTrialEmailTick(db, bindings, businessHoursNow)).rejects.toThrow(
      "simulated sentAt persistence failure",
    );
    await runTrialEmailTick(db, bindings, businessHoursNow);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(delivered).toBe(1);
    const keys = fetchMock.mock.calls.map(([, init]) =>
      new Headers(init?.headers).get("Idempotency-Key"),
    );
    expect(keys[0]).toMatch(/^trial-wrapup\/org-1\/1775923200000\//);
    expect(keys[1]).toBe(keys[0]);
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(fetchMock.mock.calls[0]?.[1]?.body);
  });

  it("does not let a stale wrapup sender clear the newer claim after losing the schedule lease", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("{}"),
    }) as unknown as typeof fetch;
    const { db, updates } = buildTickDb(
      [
        {
          id: "schedule-wrapup-stale-claim",
          orgId: "org-stale-claim",
          userId: "user-stale-claim",
          emailKind: "trial_wrapup",
          toEmail: "admin@example.org",
          userName: "Alice",
          orgName: "Acme",
          subscriptionStatus: "trialing",
          memberRole: "admin",
          memberDeletedAt: null,
        },
      ],
      [],
      { wrapupNotificationMiss: "newer_claim" },
    );

    await runTrialEmailTick(db, bindings, businessHoursNow);

    expect(
      updates.filter(
        (update) =>
          update.trialWrapupClaimedAt === null && !("trialWrapupNotifiedForEndAt" in update),
      ),
    ).toEqual([]);
    expect(updates).not.toContainEqual(expect.objectContaining({ sentAt: expect.any(Date) }));
  });

  it("converges a stale wrapup success after a newer lease finalizes and continues later rows", async () => {
    let releaseFirst!: () => void;
    let firstStarted!: () => void;
    const firstProviderStarted = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });
    const releaseFirstProvider = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const fetchMock = vi.fn(async () => {
      if (fetchMock.mock.calls.length === 1) {
        firstStarted();
        await releaseFirstProvider;
      }
      return { ok: true, status: 200, text: () => Promise.resolve("{}") };
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const deadline = new Date("2026-04-11T16:00:00.000Z");
    const { db, rowsState } = buildTickDb(
      [
        {
          id: "schedule-wrapup-stale-success",
          orgId: "org-stale-success",
          userId: "admin-stale-success",
          emailKind: "trial_wrapup",
          toEmail: "admin@example.org",
          userName: "Alice",
          orgName: "Stale success",
          subscriptionStatus: "trialing",
          memberRole: "admin",
          memberDeletedAt: null,
          trialEndsAt: deadline,
        },
        {
          id: "schedule-later-due",
          orgId: "org-later-due",
          userId: "admin-later-due",
          emailKind: "quick_start",
          toEmail: "later@example.org",
          userName: "Lee",
          orgName: "Later due",
          subscriptionStatus: "trialing",
          memberRole: "admin",
          memberDeletedAt: null,
          trialEndsAt: deadline,
        },
      ],
      [],
      { enforceWrapupLeaseState: true },
    );

    const staleTick = runTrialEmailTick(db, bindings, businessHoursNow);
    await firstProviderStarted;
    await runTrialEmailTick(db, bindings, new Date(businessHoursNow.getTime() + 6 * 60 * 1000));
    releaseFirst();

    await expect(staleTick).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(rowsState[0]?.sentAt).toBeInstanceOf(Date);
    expect(rowsState[1]?.sentAt).toBeInstanceOf(Date);
  });

  it("retries persistence when the owned current-deadline wrapup claim cannot be marked notified", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("{}"),
    }) as unknown as typeof fetch;
    const { db } = buildTickDb(
      [
        {
          id: "schedule-wrapup-owned-claim",
          orgId: "org-owned-claim",
          userId: "user-owned-claim",
          emailKind: "trial_wrapup",
          toEmail: "admin@example.org",
          orgName: "Owned claim",
          subscriptionStatus: "trialing",
          memberRole: "admin",
          memberDeletedAt: null,
        },
      ],
      [],
      { wrapupNotificationMiss: "owned_claim" },
    );

    await expect(runTrialEmailTick(db, bindings, businessHoursNow)).rejects.toThrow(
      "Trial wrapup claim could not be finalized",
    );
  });

  it("finalizes the old wrapup schedule when the live trial deadline changed after delivery", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("{}"),
    }) as unknown as typeof fetch;
    const { db, updates } = buildTickDb(
      [
        {
          id: "schedule-wrapup-deadline-changed",
          orgId: "org-deadline-changed",
          userId: "user-deadline-changed",
          emailKind: "trial_wrapup",
          toEmail: "admin@example.org",
          orgName: "Deadline changed",
          subscriptionStatus: "trialing",
          memberRole: "admin",
          memberDeletedAt: null,
        },
      ],
      [],
      { wrapupNotificationMiss: "deadline_changed" },
    );

    await runTrialEmailTick(db, bindings, businessHoursNow);

    expect(updates).toContainEqual(expect.objectContaining({ sentAt: businessHoursNow }));
  });

  it("rolls back the owned notification marker when the schedule lease cannot be finalized", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("{}"),
    }) as unknown as typeof fetch;
    const { db } = buildTickDb(
      [
        {
          id: "schedule-wrapup-finalize-miss",
          orgId: "org-finalize-miss",
          userId: "user-finalize-miss",
          emailKind: "trial_wrapup",
          toEmail: "admin@example.org",
          orgName: "Finalize miss",
          subscriptionStatus: "trialing",
          memberRole: "admin",
          memberDeletedAt: null,
        },
      ],
      [],
      { rejectSentUpdate: true },
    );

    await expect(runTrialEmailTick(db, bindings, businessHoursNow)).rejects.toThrow(
      "Trial wrapup schedule lease could not be finalized",
    );
  });

  it("uses the persisted snapshot winner when concurrent ticks capture different profiles", async () => {
    const winner = {
      version: 1,
      idempotencyKey: "trial-email/schedule-race",
      firstAttemptAt: businessHoursNow.toISOString(),
      trialEndsAt: "2026-04-11T16:00:00.000Z",
      request: {
        from: "GrantPipe <hello@grantpipe.com>",
        to: ["winner@example.org"],
        subject: "Persisted winner",
        html: "<p>Winner body</p>",
        text: "Winner body",
        headers: { "List-Unsubscribe": "<https://app.grantpipe.com/notifications>" },
      },
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("{}"),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db } = buildTickDb(
      [
        {
          id: "schedule-race",
          orgId: "org-1",
          userId: "user-1",
          emailKind: "quick_start",
          toEmail: "winner@example.org",
          userName: "Loser",
          orgName: "Loser org",
          subscriptionStatus: "trialing",
          memberRole: "admin",
          memberDeletedAt: null,
        },
      ],
      [],
      { snapshotRaceWinner: winner },
    );

    await runTrialEmailTick(db, bindings, businessHoursNow);

    const init = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(String(init?.body))).toEqual(winner.request);
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(winner.idempotencyKey);
  });

  it("upgrades a persisted wrapup deadline intent to one exact provider request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("{}"),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const deadline = new Date("2026-04-11T16:00:00.000Z");
    const { db, rowsState } = buildTickDb([
      {
        id: "schedule-intent",
        orgId: "org-1",
        userId: "user-1",
        emailKind: "trial_wrapup",
        toEmail: "admin@example.org",
        userName: "Alice",
        orgName: "Acme",
        subscriptionStatus: "trialing",
        memberRole: "admin",
        memberDeletedAt: null,
        trialEndsAt: deadline,
        deliverySnapshot: {
          version: 1,
          intent: "trial_wrapup",
          trialEndsAt: deadline.toISOString(),
        },
      },
    ]);

    await runTrialEmailTick(db, bindings, businessHoursNow);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(rowsState[0]?.deliverySnapshot).toMatchObject({
      version: 1,
      trialEndsAt: deadline.toISOString(),
      request: expect.objectContaining({ to: ["admin@example.org"] }),
    });
  });

  it("replaces an unattempted old wrapup intent when the live trial deadline changes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("{}"),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const oldDeadline = new Date("2026-04-10T16:00:00.000Z");
    const currentDeadline = new Date("2026-04-11T16:00:00.000Z");
    const { db, rowsState, updates } = buildTickDb([
      {
        id: "schedule-extended-intent",
        orgId: "org-1",
        userId: "user-1",
        emailKind: "trial_wrapup",
        toEmail: "admin@example.org",
        userName: "Alice",
        orgName: "Acme",
        subscriptionStatus: "trialing",
        memberRole: "admin",
        memberDeletedAt: null,
        trialEndsAt: currentDeadline,
        deliverySnapshot: {
          version: 1,
          intent: "trial_wrapup",
          trialEndsAt: oldDeadline.toISOString(),
        },
      },
    ]);

    await runTrialEmailTick(db, bindings, businessHoursNow);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(updates).not.toContainEqual(
      expect.objectContaining({ error: "delivery_ambiguous:invalid_snapshot" }),
    );
    expect(rowsState[0]?.deliverySnapshot).toMatchObject({
      version: 1,
      trialEndsAt: currentDeadline.toISOString(),
      request: expect.objectContaining({ to: ["admin@example.org"] }),
    });
  });

  it("quarantines an invalid persisted snapshot without calling the provider", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db, updates } = buildTickDb([
      {
        id: "schedule-invalid-snapshot",
        orgId: "org-1",
        userId: "user-1",
        emailKind: "quick_start",
        toEmail: "admin@example.org",
        userName: "Alice",
        orgName: "Acme",
        subscriptionStatus: "trialing",
        memberRole: "admin",
        memberDeletedAt: null,
        deliverySnapshot: { version: 1, request: "invalid" },
      },
    ]);

    await runTrialEmailTick(db, bindings, businessHoursNow);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(updates).toContainEqual(
      expect.objectContaining({ error: "delivery_ambiguous:invalid_snapshot" }),
    );
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      expect.any(Error),
      "trial-email-delivery",
      { emailKind: "quick_start", reason: "invalid_delivery_snapshot" },
    );
  });

  it("quarantines an exact wrapup request frozen for a different trial deadline", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db, updates } = buildTickDb([
      {
        id: "schedule-wrong-wrapup-deadline",
        orgId: "org-1",
        userId: "user-1",
        emailKind: "trial_wrapup",
        toEmail: "admin@example.org",
        userName: "Alice",
        orgName: "Acme",
        subscriptionStatus: "trialing",
        memberRole: "admin",
        memberDeletedAt: null,
        deliverySnapshot: {
          version: 1,
          idempotencyKey: "trial-wrapup/wrong-deadline",
          firstAttemptAt: businessHoursNow.toISOString(),
          trialEndsAt: "2026-04-10T16:00:00.000Z",
          request: {
            from: "GrantPipe <hello@grantpipe.com>",
            to: ["admin@example.org"],
            subject: "Frozen",
            html: "<p>Frozen</p>",
            text: "Frozen",
            headers: { "List-Unsubscribe": "<https://app.grantpipe.com/notifications>" },
          },
        },
      },
    ]);

    await runTrialEmailTick(db, bindings, businessHoursNow);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(updates).toContainEqual(
      expect.objectContaining({ error: "delivery_ambiguous:invalid_snapshot" }),
    );
  });

  it("quarantines malformed snapshot primitives, missing requests, and invalid intents", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const invalidSnapshots = [
      42,
      { version: 1, idempotencyKey: "missing-request" },
      {
        version: 1,
        idempotencyKey: "invalid-request-fields",
        trialEndsAt: null,
        request: {},
      },
      { version: 1, intent: "trial_wrapup", trialEndsAt: "not-a-date" },
    ];
    const { db, updates } = buildTickDb(
      invalidSnapshots.map((deliverySnapshot, index) => ({
        id: `schedule-invalid-${index}`,
        orgId: `org-${index}`,
        userId: `user-${index}`,
        emailKind: "quick_start",
        toEmail: `admin-${index}@example.org`,
        userName: "Alice",
        orgName: "Acme",
        subscriptionStatus: "trialing",
        memberRole: "admin",
        memberDeletedAt: null,
        deliverySnapshot,
      })),
    );

    await runTrialEmailTick(db, bindings, businessHoursNow);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      updates.filter((update) => update.error === "delivery_ambiguous:invalid_snapshot"),
    ).toHaveLength(invalidSnapshots.length);
  });

  it("quarantines a stale ambiguous delivery instead of sending after provider dedupe expires", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db, updates } = buildTickDb([
      {
        id: "schedule-ambiguous",
        orgId: "org-1",
        userId: "user-1",
        emailKind: "quick_start",
        toEmail: "admin@example.org",
        userName: "Alice",
        orgName: "Acme",
        subscriptionStatus: "trialing",
        memberRole: "admin",
        memberDeletedAt: null,
        error: "delivery_in_progress:2026-04-07T12:00:00.000Z",
      },
    ]);

    await runTrialEmailTick(db, bindings, businessHoursNow);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(updates).toContainEqual(
      expect.objectContaining({
        error: expect.stringContaining("delivery_ambiguous:"),
      }),
    );
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      expect.any(Error),
      "trial-email-delivery",
      { emailKind: "quick_start", reason: "provider_outcome_ambiguous" },
    );
  });

  it("preserves the first provider-attempt age across 5xx retries and quarantines at retention", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.resolve("resend unavailable"),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db, rowsState, updates } = buildTickDb([
      {
        id: "schedule-retention",
        orgId: "org-1",
        userId: "user-1",
        emailKind: "quick_start",
        toEmail: "admin@example.org",
        userName: "Alice",
        orgName: "Acme",
        subscriptionStatus: "trialing",
        memberRole: "admin",
        memberDeletedAt: null,
      },
    ]);

    await runTrialEmailTick(db, bindings, businessHoursNow);
    const firstSnapshot = rowsState[0]?.deliverySnapshot as { firstAttemptAt?: string };
    expect(firstSnapshot.firstAttemptAt).toBe(businessHoursNow.toISOString());

    await runTrialEmailTick(db, bindings, new Date(businessHoursNow.getTime() + 60 * 60 * 1000));
    expect((rowsState[0]?.deliverySnapshot as { firstAttemptAt?: string }).firstAttemptAt).toBe(
      firstSnapshot.firstAttemptAt,
    );

    await runTrialEmailTick(
      db,
      bindings,
      new Date(businessHoursNow.getTime() + 24 * 60 * 60 * 1000),
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(updates).toContainEqual(
      expect.objectContaining({ error: expect.stringContaining("delivery_ambiguous:") }),
    );
  });

  it("retries a concurrent Resend idempotency conflict with the same frozen request and key", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              name: "concurrent_idempotent_requests",
              message: "The original request is still in progress.",
            }),
          ),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve("{}"),
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db, rowsState, updates } = buildTickDb([
      {
        id: "schedule-concurrent-idempotency",
        orgId: "org-1",
        userId: "user-1",
        emailKind: "quick_start",
        toEmail: "admin@example.org",
        userName: "Alice",
        orgName: "Acme",
        subscriptionStatus: "trialing",
        memberRole: "admin",
        memberDeletedAt: null,
      },
    ]);

    await runTrialEmailTick(db, bindings, businessHoursNow);
    const firstSnapshot = rowsState[0]?.deliverySnapshot;
    await runTrialEmailTick(db, bindings, new Date(businessHoursNow.getTime() + 60 * 60 * 1000));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstInit = fetchMock.mock.calls[0]?.[1];
    const secondInit = fetchMock.mock.calls[1]?.[1];
    expect(secondInit?.body).toBe(firstInit?.body);
    expect(new Headers(secondInit?.headers).get("Idempotency-Key")).toBe(
      new Headers(firstInit?.headers).get("Idempotency-Key"),
    );
    expect(rowsState[0]?.deliverySnapshot).toBe(firstSnapshot);
    expect(updates).toContainEqual(
      expect.objectContaining({
        sentAt: new Date(businessHoursNow.getTime() + 60 * 60 * 1000),
        error: null,
      }),
    );
  });

  it.each([408, 425])(
    "retries an uncertain Resend %s with the same frozen request, key, and owner lease",
    async (status) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status,
          text: () => Promise.resolve("uncertain provider response"),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve("{}"),
        });
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      const deadline = new Date("2026-04-10T16:00:00.000Z");
      const { db, rowsState, updates } = buildTickDb([
        {
          id: `schedule-resend-${status}`,
          orgId: `org-resend-${status}`,
          userId: `admin-resend-${status}`,
          emailKind: "trial_wrapup",
          trialDeadlineAt: deadline,
          toEmail: "admin@example.org",
          userName: "Alice",
          orgName: "Acme",
          subscriptionStatus: "trialing",
          memberRole: "admin",
          memberDeletedAt: null,
          trialEndsAt: deadline,
        },
      ]);

      await runTrialEmailTick(db, bindings, businessHoursNow);
      const firstSnapshot = rowsState[0]?.deliverySnapshot;
      const firstLease = rowsState[0]?.error;
      await runTrialEmailTick(db, bindings, new Date(businessHoursNow.getTime() + 60 * 60 * 1000));

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(fetchMock.mock.calls[0]?.[1]?.body);
      expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("Idempotency-Key")).toBe(
        new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Idempotency-Key"),
      );
      expect(rowsState[0]?.deliverySnapshot).toBe(firstSnapshot);
      expect(firstLease).toMatch(/^delivery_in_progress:/);
      expect(updates).not.toContainEqual(expect.objectContaining({ deliverySnapshot: null }));
      expect(updates).toContainEqual(
        expect.objectContaining({ sentAt: expect.any(Date), error: null }),
      );
    },
  );

  it("releases a wrapup claim and rotates the request after an invalid Resend idempotency conflict", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              name: "invalid_idempotent_request",
              message: "The idempotency key was used with a different payload.",
            }),
          ),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve("{}"),
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db, updates } = buildTickDb([
      {
        id: "schedule-invalid-idempotency",
        orgId: "org-invalid-idempotency",
        userId: "admin-invalid-idempotency",
        emailKind: "trial_wrapup",
        toEmail: "admin@example.org",
        userName: "Alice",
        orgName: "Acme",
        subscriptionStatus: "trialing",
        memberRole: "admin",
        memberDeletedAt: null,
      },
    ]);

    await runTrialEmailTick(db, bindings, businessHoursNow);
    await runTrialEmailTick(db, bindings, new Date(businessHoursNow.getTime() + 60 * 60 * 1000));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("Idempotency-Key")).not.toBe(
      new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Idempotency-Key"),
    );
    expect(updates).toContainEqual(
      expect.objectContaining({
        error: "resend_status_409:invalid_idempotent_request",
        deliverySnapshot: null,
      }),
    );
    expect(updates).toContainEqual(
      expect.objectContaining({
        trialWrapupClaimedAt: null,
        trialWrapupClaimToken: null,
        trialWrapupClaimedForEndAt: null,
      }),
    );
  });

  it("treats network failures as ambiguous without replacing the persisted request", async () => {
    const networkError = new Error("socket reset");
    globalThis.fetch = vi.fn().mockRejectedValue(networkError) as unknown as typeof fetch;
    const { db, rowsState } = buildTickDb([
      {
        id: "schedule-network",
        orgId: "org-1",
        userId: "user-1",
        emailKind: "quick_start",
        toEmail: "admin@example.org",
        userName: "Alice",
        orgName: "Acme",
        subscriptionStatus: "trialing",
        memberRole: "admin",
        memberDeletedAt: null,
      },
    ]);

    await expect(runTrialEmailTick(db, bindings, businessHoursNow)).resolves.toBeUndefined();
    expect(rowsState[0]?.error).toMatch(
      new RegExp(
        `^delivery_in_progress:${businessHoursNow.toISOString().replaceAll(".", "\\.")}\\|`,
      ),
    );
  });

  it("skips trial lifecycle sends when the admin disabled trial lifecycle email", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db, updates } = buildTickDb(
      [
        {
          id: "schedule-1",
          orgId: "org-1",
          userId: "user-1",
          emailKind: "quick_start",
          toEmail: "admin@example.org",
          userName: "Alice",
          orgName: "Acme",
          subscriptionStatus: "trialing",
          memberRole: "admin",
          memberDeletedAt: null,
        },
      ],
      [
        {
          id: "pref-1",
          notificationType: "trial_lifecycle",
          emailEnabled: false,
          inAppEnabled: true,
        },
      ],
    );

    await runTrialEmailTick(db, bindings, businessHoursNow);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("defers a due email queued outside the recipient's business hours", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db, updates } = buildTickDb([
      {
        id: "schedule-night",
        orgId: "org-1",
        userId: "user-1",
        emailKind: "quick_start",
        toEmail: "admin@example.org",
        userName: "Alice",
        orgName: "Acme",
        subscriptionStatus: "trialing",
        timezone: "America/New_York",
        memberRole: "admin",
        memberDeletedAt: null,
      },
    ]);

    // 02:00 local — the row is due (sentAt is still null) but must not be sent
    // until the next tick that lands inside business hours.
    await runTrialEmailTick(db, bindings, middleOfNightNow);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("skips non-trialing, expired, and inactive-admin lifecycle recipients", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db, updates } = buildTickDb([
      {
        id: "schedule-active",
        orgId: "org-1",
        userId: "user-1",
        emailKind: "plan_nudge",
        toEmail: "admin@example.org",
        userName: "Alice",
        orgName: "Acme",
        subscriptionStatus: "active",
        memberRole: "admin",
        memberDeletedAt: null,
      },
      {
        id: "schedule-viewer",
        orgId: "org-1",
        userId: "user-2",
        emailKind: "billing_prompt",
        toEmail: "viewer@example.org",
        userName: "Bob",
        orgName: "Acme",
        subscriptionStatus: "trialing",
        memberRole: "viewer",
        memberDeletedAt: null,
      },
      ...["canceled", "past_due", "trial_expired"].map((subscriptionStatus) => ({
        id: `schedule-${subscriptionStatus}`,
        orgId: `org-${subscriptionStatus}`,
        userId: `user-${subscriptionStatus}`,
        emailKind: "quick_start",
        toEmail: `${subscriptionStatus}@example.org`,
        userName: "Alice",
        orgName: "Acme",
        subscriptionStatus,
        memberRole: "admin",
        memberDeletedAt: null,
      })),
      {
        id: "schedule-expired-deadline",
        orgId: "org-expired-deadline",
        userId: "user-expired-deadline",
        emailKind: "quick_start",
        toEmail: "expired@example.org",
        userName: "Alice",
        orgName: "Acme",
        subscriptionStatus: "trialing",
        trialEndsAt: new Date(businessHoursNow.getTime() - 1),
        memberRole: "admin",
        memberDeletedAt: null,
      },
      {
        id: "schedule-deleted",
        orgId: "org-1",
        userId: "user-3",
        emailKind: "welcome",
        toEmail: "deleted@example.org",
        userName: "Deleted",
        orgName: "Acme",
        subscriptionStatus: "trialing",
        memberRole: "admin",
        memberDeletedAt: new Date("2026-04-01T00:00:00Z"),
      },
      {
        id: "schedule-missing-email",
        orgId: "org-1",
        userId: "user-4",
        emailKind: "welcome",
        toEmail: null,
        userName: "Missing",
        orgName: "Acme",
        subscriptionStatus: "trialing",
        memberRole: "admin",
        memberDeletedAt: null,
      },
    ]);

    await runTrialEmailTick(db, bindings, businessHoursNow);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("records delivery failures for retry", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("resend down"),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db, updates } = buildTickDb([
      {
        id: "schedule-1",
        orgId: "org-1",
        userId: "user-1",
        emailKind: "billing_prompt",
        toEmail: "admin@example.org",
        userName: "Alice",
        orgName: "Acme",
        subscriptionStatus: "trialing",
        memberRole: "admin",
        memberDeletedAt: null,
      },
    ]);

    await runTrialEmailTick(db, bindings, businessHoursNow);

    const failedUpdate = updates.find((update) =>
      String(update.error).startsWith("delivery_in_progress:"),
    );
    expect(failedUpdate).toMatchObject({ error: expect.stringContaining("delivery_in_progress:") });
    expect(failedUpdate).not.toHaveProperty("sentAt");
  });

  it("records missing Resend configuration for retry", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db, updates } = buildTickDb([
      {
        id: "schedule-1",
        orgId: "org-1",
        userId: "user-1",
        emailKind: "welcome",
        toEmail: "admin@example.org",
        userName: "Alice",
        orgName: "Acme",
        subscriptionStatus: "trialing",
        memberRole: "admin",
        memberDeletedAt: null,
      },
    ]);

    await runTrialEmailTick(
      db,
      { APP_URL: "https://app.grantpipe.com" } as Bindings,
      businessHoursNow,
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(updates).toContainEqual(
      expect.objectContaining({
        error: "RESEND_API_KEY is required for trial email delivery",
      }),
    );
  });
});
