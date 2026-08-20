import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  billingWebhookRoutes,
  handleStripeWebhookRequest,
  processStripeEvent,
  verifyStripeSignature,
} from "./webhooks";
import { enqueueTrialWrapupEmail } from "../trial-emails/service";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";

const { mockCaptureBackgroundException } = vi.hoisted(() => ({
  mockCaptureBackgroundException: vi.fn(),
}));

vi.mock("../trial-emails/service", () => ({
  enqueueTrialWrapupEmail: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../lib/sentry", () => ({
  captureBackgroundException: mockCaptureBackgroundException,
}));

const SECRET = "whsec_test_secret";

beforeEach(() => {
  vi.clearAllMocks();
});

async function hmacHex(message: string, secret: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function signedRequest(body: string, opts: { secret?: string; tamper?: boolean } = {}) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await hmacHex(`${timestamp}.${body}`, opts.secret ?? SECRET);
  const lastChar = signature.slice(-1);
  const tamperedChar = lastChar === "0" ? "1" : "0";
  const headerSig = opts.tamper ? `${signature.slice(0, -1)}${tamperedChar}` : signature;
  return new Request("https://example.com/api/billing/webhook", {
    method: "POST",
    headers: {
      "stripe-signature": `t=${timestamp},v1=${headerSig}`,
      "content-type": "application/json",
    },
    body,
  });
}

function buildDb() {
  const updates: Record<string, unknown>[] = [];
  const inserts: Record<string, unknown>[] = [];
  let orgLookup: Record<string, unknown> | undefined;
  let nextInsertConflict = false;
  let nextAnalyticsInsertError: Error | undefined;
  let nextUpdateUsesExactCas = false;
  const updateMissOrgLookups: Record<string, unknown>[] = [];
  const findFirstMock = vi.fn().mockImplementation(async () => orgLookup);

  // Helper that builds the insert mock using shared state so it works both on
  // the outer db and the transaction object passed to callbacks.
  function makeInsertMethod() {
    return vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation((val: Record<string, unknown>) => {
        inserts.push(val);
        if ("eventName" in val && nextAnalyticsInsertError) {
          const error = nextAnalyticsInsertError;
          nextAnalyticsInsertError = undefined;
          throw error;
        }
        const isConflict = nextInsertConflict;
        // reset after use so only the next call is affected
        nextInsertConflict = false;
        return {
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue(isConflict ? [] : [{ id: "row-id" }]),
          }),
        };
      }),
    }));
  }

  function makeUpdateMethod() {
    return vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation((val: Record<string, unknown>) => {
        const applyUpdate = () => {
          const missedUpdateState = updateMissOrgLookups.shift();
          if (missedUpdateState) {
            orgLookup = missedUpdateState;
            return false;
          }
          const usesExactCas = nextUpdateUsesExactCas;
          nextUpdateUsesExactCas = false;
          let accepted = true;
          const eventCreatedAt = val.stripeStateEventCreatedAt;
          const eventPriority = val.stripeStateEventPriority;
          if (
            !usesExactCas &&
            eventCreatedAt instanceof Date &&
            typeof eventPriority === "number" &&
            orgLookup
          ) {
            const currentCreatedAt = orgLookup.stripeStateEventCreatedAt;
            const currentPriority = orgLookup.stripeStateEventPriority;
            const startsReplacementGeneration =
              typeof val.stripeSubscriptionId === "string" &&
              typeof orgLookup.stripeSubscriptionId === "string" &&
              val.stripeSubscriptionId !== orgLookup.stripeSubscriptionId;
            accepted =
              startsReplacementGeneration ||
              !(currentCreatedAt instanceof Date) ||
              eventCreatedAt.getTime() > currentCreatedAt.getTime() ||
              (eventCreatedAt.getTime() === currentCreatedAt.getTime() &&
                (typeof currentPriority !== "number" ||
                  eventPriority > currentPriority ||
                  (eventPriority === currentPriority &&
                    typeof val.stripeStateEventId === "string")));
          }
          if (accepted) {
            updates.push(val);
            if (orgLookup) orgLookup = { ...orgLookup, ...val };
          }
          return accepted;
        };
        return {
          where: vi.fn().mockImplementation(() => {
            const accepted = applyUpdate();
            return {
              returning: vi.fn().mockResolvedValue(accepted ? [{ id: "org-row" }] : []),
            };
          }),
        };
      }),
    }));
  }

  // The tx object passed inside db.transaction() shares the same state arrays
  // so that test assertions on `updates` and `inserts` work transparently.
  const txObj = {
    query: {
      organizations: {
        findFirst: findFirstMock,
      },
    },
    get update() {
      return makeUpdateMethod();
    },
    get insert() {
      return makeInsertMethod();
    },
  };

  return {
    setOrgLookup(value: Record<string, unknown> | undefined) {
      orgLookup = value;
    },
    setNextInsertConflict(conflict: boolean) {
      nextInsertConflict = conflict;
    },
    setNextAnalyticsInsertError(error: Error) {
      nextAnalyticsInsertError = error;
    },
    setNextUpdateMissOrgLookup(value: Record<string, unknown>) {
      updateMissOrgLookups.push(value);
    },
    setUpdateMissOrgLookups(values: Record<string, unknown>[]) {
      updateMissOrgLookups.push(...values);
    },
    allowNextExactCasUpdate() {
      nextUpdateUsesExactCas = true;
    },
    /** Expose the findFirst spy for call-count assertions. */
    findFirstMock,
    updates,
    inserts,
    db: {
      query: {
        organizations: {
          findFirst: findFirstMock,
        },
      },
      update: makeUpdateMethod(),
      insert: makeInsertMethod(),
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn(txObj);
      }),
    } as never,
  };
}

describe("verifyStripeSignature", () => {
  it("returns true for a valid signature within tolerance", async () => {
    const payload = '{"hello":"world"}';
    const ts = Math.floor(Date.now() / 1000);
    const sig = await hmacHex(`${ts}.${payload}`, SECRET);
    const ok = await verifyStripeSignature({
      payload,
      header: `t=${ts},v1=${sig}`,
      secret: SECRET,
    });
    expect(ok).toBe(true);
  });

  it("returns false for a missing or malformed header", async () => {
    expect(await verifyStripeSignature({ payload: "{}", header: null, secret: SECRET })).toBe(
      false,
    );
    expect(await verifyStripeSignature({ payload: "{}", header: "garbage", secret: SECRET })).toBe(
      false,
    );
  });

  it("returns false when the signature does not match", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const ok = await verifyStripeSignature({
      payload: "{}",
      header: `t=${ts},v1=${"a".repeat(64)}`,
      secret: SECRET,
    });
    expect(ok).toBe(false);
  });

  it("returns false when timestamp is outside tolerance", async () => {
    const payload = "{}";
    const ts = Math.floor(Date.now() / 1000) - 60 * 60;
    const sig = await hmacHex(`${ts}.${payload}`, SECRET);
    const ok = await verifyStripeSignature({
      payload,
      header: `t=${ts},v1=${sig}`,
      secret: SECRET,
    });
    expect(ok).toBe(false);
  });

  it("returns false when timestamp is not a number", async () => {
    const ok = await verifyStripeSignature({
      payload: "{}",
      header: `t=NaN,v1=${"a".repeat(64)}`,
      secret: SECRET,
    });
    expect(ok).toBe(false);
  });

  it("rejects headers with multiple timestamps", async () => {
    const payload = "{}";
    const ts = Math.floor(Date.now() / 1000);
    const sig = await hmacHex(`${ts}.${payload}`, SECRET);
    const ok = await verifyStripeSignature({
      payload,
      header: `t=${ts},t=${ts - 1},v1=${sig}`,
      secret: SECRET,
    });
    expect(ok).toBe(false);
  });

  it("skips header parts with no value (e.g. bare key with no '=')", async () => {
    // A part like "noequals" has no "=" — key="noequals", value=undefined → skipped.
    // The header is still valid as long as t= and v1= are present and correct.
    const payload = "{}";
    const ts = Math.floor(Date.now() / 1000);
    const sig = await hmacHex(`${ts}.${payload}`, SECRET);
    const ok = await verifyStripeSignature({
      payload,
      header: `t=${ts},noequals,v1=${sig}`,
      secret: SECRET,
    });
    expect(ok).toBe(true);
  });
});

describe("handleStripeWebhookRequest", () => {
  it("returns 503 when the webhook secret is missing", async () => {
    const { db } = buildDb();
    const result = await handleStripeWebhookRequest({
      db,
      bindings: {} as never,
      request: new Request("https://x", { method: "POST", body: "{}" }),
    });
    expect(result.status).toBe(503);
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(expect.any(Error), "billing", {
      step: "webhook_config",
    });
  });

  it("returns 400 for invalid signature", async () => {
    const { db } = buildDb();
    const request = await signedRequest('{"type":"x","data":{"object":{}}}', { tamper: true });
    const result = await handleStripeWebhookRequest({
      db,
      bindings: { STRIPE_WEBHOOK_SECRET: SECRET } as never,
      request,
    });
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "invalid_signature" });
  });

  it("returns 400 for malformed JSON payload", async () => {
    const { db } = buildDb();
    const request = await signedRequest("not-json");
    const result = await handleStripeWebhookRequest({
      db,
      bindings: { STRIPE_WEBHOOK_SECRET: SECRET } as never,
      request,
    });
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "invalid_payload" });
  });

  it("returns 400 for event missing required fields", async () => {
    const { db } = buildDb();
    const request = await signedRequest('{"hello":"world"}');
    const result = await handleStripeWebhookRequest({
      db,
      bindings: { STRIPE_WEBHOOK_SECRET: SECRET } as never,
      request,
    });
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "invalid_event_shape" });
  });

  it("returns 400 for signed events missing Stripe created ordering metadata", async () => {
    const { db } = buildDb();
    const request = await signedRequest(
      JSON.stringify({
        id: "evt_missing_created",
        type: "customer.subscription.updated",
        data: { object: { metadata: { orgId: "org-1" }, status: "active" } },
      }),
    );

    const result = await handleStripeWebhookRequest({
      db,
      bindings: { STRIPE_WEBHOOK_SECRET: SECRET } as never,
      request,
    });

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "invalid_event_shape" });
  });

  it("dispatches a valid event and returns 200", async () => {
    const { db, updates, inserts } = buildDb();
    const event = {
      id: "evt_1",
      type: "checkout.session.completed",
      created: 1_784_000_000,
      data: {
        object: {
          mode: "subscription",
          client_reference_id: "org-1",
          customer: "cus_1",
          subscription: "sub_1",
          payment_status: "paid",
          metadata: {
            orgId: "org-1",
            planTier: "growth",
            billingCycle: "annual",
            promoCode: "Y80OFF",
          },
        },
      },
    };
    const request = await signedRequest(JSON.stringify(event));
    const result = await handleStripeWebhookRequest({
      db,
      bindings: { STRIPE_WEBHOOK_SECRET: SECRET } as never,
      request,
    });
    expect(result.status).toBe(200);
    expect(updates[0]).toMatchObject({
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      planTier: "growth",
      billingCycle: "annual",
      subscriptionStatus: "active",
      promoCodeApplied: "Y80OFF",
      planSelectedAt: expect.any(Date),
    });
    expect(inserts[0]).toMatchObject({
      orgId: "org-1",
      eventType: "checkout.session.completed",
    });
  });

  it("persists M80OFF phase-2 promo metadata from checkout webhooks", async () => {
    const { db, updates } = buildDb();
    const event = {
      id: "evt_retired_promo",
      type: "checkout.session.completed",
      created: 1_784_000_001,
      data: {
        object: {
          mode: "subscription",
          client_reference_id: "org-1",
          customer: "cus_1",
          subscription: "sub_1",
          payment_status: "paid",
          metadata: {
            orgId: "org-1",
            planTier: "starter",
            billingCycle: "monthly",
            promoCode: "M80OFF",
          },
        },
      },
    };
    const request = await signedRequest(JSON.stringify(event));
    const result = await handleStripeWebhookRequest({
      db,
      bindings: { STRIPE_WEBHOOK_SECRET: SECRET } as never,
      request,
    });

    expect(result.status).toBe(200);
    expect(updates[0]).toMatchObject({
      promoCodeApplied: "M80OFF",
    });
  });

  it("returns 200 for a duplicate Stripe event (idempotency — no retry storm)", async () => {
    // Stripe retries indefinitely on non-2xx responses. A duplicate event that
    // has already been processed must still return 200 so Stripe stops retrying.
    const fixture = buildDb();
    const event = {
      id: "evt_dup_http",
      type: "checkout.session.completed",
      created: 1_784_000_002,
      data: {
        object: {
          mode: "subscription",
          client_reference_id: "org-dup-http",
          customer: "cus_dup",
          subscription: "sub_dup",
          metadata: { orgId: "org-dup-http", planTier: "starter", billingCycle: "monthly" },
        },
      },
    };

    // First delivery — processed normally
    const firstRequest = await signedRequest(JSON.stringify(event));
    const firstResult = await handleStripeWebhookRequest({
      db: fixture.db,
      bindings: { STRIPE_WEBHOOK_SECRET: SECRET } as never,
      request: firstRequest,
    });
    expect(firstResult.status).toBe(200);

    // Second delivery — simulate duplicate (insert conflict)
    fixture.setNextInsertConflict(true);
    const secondRequest = await signedRequest(JSON.stringify(event));
    const secondResult = await handleStripeWebhookRequest({
      db: fixture.db,
      bindings: { STRIPE_WEBHOOK_SECRET: SECRET } as never,
      request: secondRequest,
    });
    // Must still be 200, not 500 — Stripe must stop retrying
    expect(secondResult.status).toBe(200);
    expect(secondResult.body).toEqual({ received: true });
  });

  it("returns a retryable response when reconciliation fails, then succeeds", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-reconcile-retry",
      stripeCustomerId: "cus_reconcile_retry",
      stripeSubscriptionId: "sub_reconcile_retry",
      stripeStateEventCreatedAt: new Date(1_784_000_004_000),
      stripeStateEventId: "evt_existing_tie",
      stripeStateEventPriority: 60,
      subscriptionStatus: "active",
    });
    const event = {
      id: "evt_reconcile_retry",
      type: "customer.subscription.updated",
      created: 1_784_000_004,
      data: {
        object: {
          id: "sub_reconcile_retry",
          customer: "cus_reconcile_retry",
          status: "active",
        },
      },
    };
    const originalFetch = globalThis.fetch;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "sub_reconcile_retry",
            customer: "cus_reconcile_retry",
            status: "active",
            trial_end: null,
            items: { data: [{ price: { id: "price_growth" } }] },
          }),
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const bindings = {
      STRIPE_WEBHOOK_SECRET: SECRET,
      STRIPE_SECRET_KEY: "sk_test",
      STRIPE_PRICE_GROWTH_MONTHLY: "price_growth",
    } as never;

    try {
      const failed = await handleStripeWebhookRequest({
        db: fixture.db,
        bindings,
        request: await signedRequest(JSON.stringify(event)),
      });
      expect(failed.status).toBe(503);
      expect(fixture.inserts).toHaveLength(0);

      const retried = await handleStripeWebhookRequest({
        db: fixture.db,
        bindings,
        request: await signedRequest(JSON.stringify(event)),
      });
      expect(retried.status).toBe(200);
      expect(fixture.updates.at(-1)).toMatchObject({
        planTier: "growth",
        subscriptionStatus: "active",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("canonically reconciles a first Checkout after subscription.created arrived before customer ownership", async () => {
    const fixture = buildDb();
    const createdEvent = {
      id: "evt_first_created_before_checkout",
      type: "customer.subscription.created",
      created: 1_784_000_003,
      data: {
        object: {
          id: "sub_first_generation",
          customer: "cus_first_generation",
          status: "trialing",
          trial_end: 1_784_100_000,
          metadata: { orgId: "org-first-generation" },
        },
      },
    };

    await processStripeEvent(fixture.db, createdEvent);
    expect(fixture.inserts).toHaveLength(0);
    expect(fixture.updates).toHaveLength(0);

    fixture.setOrgLookup({
      id: "org-first-generation",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: "trialing",
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "sub_first_generation",
          customer: "cus_first_generation",
          status: "active",
          created: 1_784_000_002,
          trial_end: null,
          items: { data: [{ price: { id: "price_growth", recurring: { interval: "year" } } }] },
        }),
    }) as unknown as typeof fetch;
    const checkoutEvent = {
      id: "evt_first_checkout_after_created",
      type: "checkout.session.completed",
      created: 1_784_000_004,
      data: {
        object: {
          mode: "subscription",
          client_reference_id: "org-first-generation",
          customer: "cus_first_generation",
          subscription: "sub_first_generation",
          payment_status: "no_payment_required",
          metadata: { planTier: "starter", billingCycle: "monthly" },
        },
      },
    };

    try {
      const result = await handleStripeWebhookRequest({
        db: fixture.db,
        bindings: {
          STRIPE_WEBHOOK_SECRET: SECRET,
          STRIPE_SECRET_KEY: "sk_test",
          STRIPE_PRICE_GROWTH_ANNUAL: "price_growth",
        } as never,
        request: await signedRequest(JSON.stringify(checkoutEvent)),
      });

      expect(result).toEqual({ status: 200, body: { received: true } });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.stripe.com/v1/subscriptions/sub_first_generation",
        expect.objectContaining({ headers: { Authorization: "Bearer sk_test" } }),
      );
      expect(fixture.updates.at(-1)).toMatchObject({
        stripeCustomerId: "cus_first_generation",
        stripeSubscriptionId: "sub_first_generation",
        subscriptionStatus: "active",
        trialEndsAt: null,
        planTier: "growth",
        billingCycle: "annual",
      });
      expect(fixture.inserts).toContainEqual(
        expect.objectContaining({ stripeEventId: "evt_first_checkout_after_created" }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns 503 before auditing a first Checkout when canonical reconciliation is unavailable", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-first-missing-secret",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    });
    const event = {
      id: "evt_first_checkout_missing_secret",
      type: "checkout.session.completed",
      created: 1_784_000_006,
      data: {
        object: {
          mode: "subscription",
          client_reference_id: "org-first-missing-secret",
          customer: "cus_first_missing_secret",
          subscription: "sub_first_missing_secret",
          payment_status: "paid",
        },
      },
    };

    const result = await handleStripeWebhookRequest({
      db: fixture.db,
      bindings: { STRIPE_WEBHOOK_SECRET: SECRET } as never,
      request: await signedRequest(JSON.stringify(event)),
    });

    expect(result).toEqual({
      status: 503,
      body: { error: "stripe_reconciliation_unavailable" },
    });
    expect(fixture.inserts).toHaveLength(0);
    expect(fixture.updates).toHaveLength(0);
  });

  it("does not audit a first Checkout whose canonical subscription belongs to another customer", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-first-mismatch",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "sub_first_mismatch",
          customer: "cus_other_customer",
          status: "active",
          created: 1_784_000_006,
        }),
    }) as unknown as typeof fetch;
    const event = {
      id: "evt_first_checkout_mismatch",
      type: "checkout.session.completed",
      created: 1_784_000_007,
      data: {
        object: {
          mode: "subscription",
          client_reference_id: "org-first-mismatch",
          customer: "cus_first_mismatch",
          subscription: "sub_first_mismatch",
          payment_status: "paid",
        },
      },
    };

    try {
      const result = await handleStripeWebhookRequest({
        db: fixture.db,
        bindings: { STRIPE_WEBHOOK_SECRET: SECRET, STRIPE_SECRET_KEY: "sk_test" } as never,
        request: await signedRequest(JSON.stringify(event)),
      });

      expect(result).toEqual({ status: 200, body: { received: true } });
      expect(fixture.inserts).toHaveLength(0);
      expect(fixture.updates).toHaveLength(0);
      expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
        expect.any(Error),
        "billing",
        expect.objectContaining({ reason: "stripe_lookup_identity_mismatch" }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns 503 before auditing a bootstrap invoice, then reconciles it on retry", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-invoice-retry",
      stripeCustomerId: "cus_invoice_retry",
      stripeSubscriptionId: "sub_invoice_retry",
      subscriptionStatus: "trialing",
    });
    const event = {
      id: "evt_invoice_retry",
      type: "invoice.payment_failed",
      created: 1_784_000_005,
      data: {
        object: {
          customer: "cus_invoice_retry",
          subscription: "sub_invoice_retry",
          billing_reason: "subscription_cycle",
        },
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "sub_invoice_retry",
            customer: "cus_invoice_retry",
            status: "active",
            trial_end: null,
            items: { data: [] },
          }),
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const bindings = {
      STRIPE_WEBHOOK_SECRET: SECRET,
      STRIPE_SECRET_KEY: "sk_test",
    } as never;

    const failed = await handleStripeWebhookRequest({
      db: fixture.db,
      bindings,
      request: await signedRequest(JSON.stringify(event)),
    });
    expect(failed.status).toBe(503);
    expect(fixture.inserts).toHaveLength(0);

    const retried = await handleStripeWebhookRequest({
      db: fixture.db,
      bindings,
      request: await signedRequest(JSON.stringify(event)),
    });
    expect(retried.status).toBe(200);
    expect(fixture.updates.at(-1)).toMatchObject({ subscriptionStatus: "active" });
  });

  it("returns 503 for a bootstrap invoice without a Stripe secret, then accepts the same retry", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-invoice-missing-secret",
      stripeCustomerId: "cus_invoice_missing_secret",
      stripeSubscriptionId: "sub_invoice_missing_secret",
      subscriptionStatus: "trialing",
    });
    const event = {
      id: "evt_invoice_missing_secret",
      type: "invoice.payment_failed",
      created: 1_784_000_009,
      data: {
        object: {
          customer: "cus_invoice_missing_secret",
          subscription: "sub_invoice_missing_secret",
          billing_reason: "subscription_cycle",
        },
      },
    };

    const missingSecret = await handleStripeWebhookRequest({
      db: fixture.db,
      bindings: { STRIPE_WEBHOOK_SECRET: SECRET } as never,
      request: await signedRequest(JSON.stringify(event)),
    });
    expect(missingSecret.status).toBe(503);
    expect(fixture.inserts).toHaveLength(0);
    expect(fixture.updates).toHaveLength(0);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "sub_invoice_missing_secret",
          customer: "cus_invoice_missing_secret",
          status: "active",
          trial_end: null,
          items: { data: [] },
        }),
    }) as unknown as typeof fetch;
    const retried = await handleStripeWebhookRequest({
      db: fixture.db,
      bindings: { STRIPE_WEBHOOK_SECRET: SECRET, STRIPE_SECRET_KEY: "sk_test" } as never,
      request: await signedRequest(JSON.stringify(event)),
    });
    expect(retried.status).toBe(200);
    expect(fixture.updates.at(-1)).toMatchObject({ subscriptionStatus: "active" });
  });

  it("returns 503 before auditing a same-second lower-priority recovery without a Stripe secret", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-same-second-recovery",
      stripeCustomerId: "cus_same_second_recovery",
      stripeSubscriptionId: "sub_same_second_recovery",
      subscriptionStatus: "past_due",
      stripeStateEventCreatedAt: new Date(1_784_000_010_000),
      stripeStateEventId: "evt_payment_failed_same_second",
      stripeStateEventPriority: 80,
    });
    const event = {
      id: "evt_active_same_second",
      type: "customer.subscription.updated",
      created: 1_784_000_010,
      data: {
        object: {
          id: "sub_same_second_recovery",
          customer: "cus_same_second_recovery",
          status: "active",
        },
      },
    };

    const result = await handleStripeWebhookRequest({
      db: fixture.db,
      bindings: { STRIPE_WEBHOOK_SECRET: SECRET } as never,
      request: await signedRequest(JSON.stringify(event)),
    });

    expect(result.status).toBe(503);
    expect(result.body).toEqual({ error: "stripe_reconciliation_unavailable" });
    expect(fixture.inserts).toHaveLength(0);
    expect(fixture.updates).toHaveLength(0);
  });

  it("does not audit a replacement Checkout until its canonical subscription lookup succeeds", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-replacement-retry",
      stripeCustomerId: "cus_replacement_retry",
      stripeSubscriptionId: "sub_old",
      subscriptionStatus: "canceled",
      stripeStateEventCreatedAt: new Date(1_784_000_000_000),
      stripeStateEventId: "evt_old_deleted",
      stripeStateEventPriority: 100,
    });
    const event = {
      id: "evt_replacement_checkout_retry",
      type: "checkout.session.completed",
      created: 1_784_000_006,
      data: {
        object: {
          mode: "subscription",
          client_reference_id: "org-replacement-retry",
          customer: "cus_replacement_retry",
          subscription: "sub_new",
          payment_status: "no_payment_required",
        },
      },
    };
    let failNextLookup = true;
    globalThis.fetch = vi.fn((input: string | URL | Request) => {
      if (failNextLookup) {
        failNextLookup = false;
        return Promise.resolve({ ok: false, status: 503 });
      }
      const isIncoming = String(input).endsWith("/sub_new");
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            id: isIncoming ? "sub_new" : "sub_old",
            customer: "cus_replacement_retry",
            status: isIncoming ? "trialing" : "canceled",
            created: isIncoming ? 200 : 100,
            trial_end: 1_784_100_000,
            items: { data: [] },
          }),
      });
    }) as unknown as typeof fetch;
    const bindings = {
      STRIPE_WEBHOOK_SECRET: SECRET,
      STRIPE_SECRET_KEY: "sk_test",
    } as never;

    const failed = await handleStripeWebhookRequest({
      db: fixture.db,
      bindings,
      request: await signedRequest(JSON.stringify(event)),
    });
    expect(failed.status).toBe(503);
    expect(fixture.inserts).toHaveLength(0);

    const retried = await handleStripeWebhookRequest({
      db: fixture.db,
      bindings,
      request: await signedRequest(JSON.stringify(event)),
    });
    expect(retried.status).toBe(200);
    expect(fixture.updates.at(-1)).toMatchObject({
      stripeSubscriptionId: "sub_new",
      subscriptionStatus: "trialing",
      trialEndsAt: new Date(1_784_100_000_000),
    });
  });

  it("retries a valid replacement Checkout when a concurrent old-generation watermark wins its first CAS", async () => {
    const fixture = buildDb();
    const originalGeneration = {
      id: "org-replacement-cas",
      stripeCustomerId: "cus_replacement_cas",
      stripeSubscriptionId: "sub_old",
      subscriptionStatus: "active",
      stripeStateEventCreatedAt: new Date(1_784_000_000_000),
      stripeStateEventId: "evt_old_active",
      stripeStateEventPriority: 60,
    };
    fixture.setOrgLookup(originalGeneration);
    fixture.setNextUpdateMissOrgLookup({
      ...originalGeneration,
      subscriptionStatus: "past_due",
      stripeStateEventCreatedAt: new Date(1_784_000_003_000),
      stripeStateEventId: "evt_concurrent_payment_failed",
      stripeStateEventPriority: 80,
    });
    globalThis.fetch = vi.fn((input: string | URL | Request) => {
      const isIncoming = String(input).endsWith("/sub_new");
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            id: isIncoming ? "sub_new" : "sub_old",
            customer: "cus_replacement_cas",
            status: isIncoming ? "trialing" : "past_due",
            created: isIncoming ? 200 : 100,
            trial_end: 1_784_100_000,
            items: { data: [] },
          }),
      });
    }) as unknown as typeof fetch;

    await processStripeEvent(
      fixture.db,
      {
        id: "evt_replacement_checkout_cas",
        type: "checkout.session.completed",
        created: 1_784_000_006,
        data: {
          object: {
            mode: "subscription",
            client_reference_id: "org-replacement-cas",
            customer: "cus_replacement_cas",
            subscription: "sub_new",
            payment_status: "no_payment_required",
          },
        },
      },
      { STRIPE_SECRET_KEY: "sk_test" } as never,
    );

    expect(fixture.updates.at(-1)).toMatchObject({
      stripeSubscriptionId: "sub_new",
      subscriptionStatus: "trialing",
      stripeStateEventId: "evt_replacement_checkout_cas",
    });
    expect(fixture.findFirstMock).toHaveBeenCalledTimes(3);
  });

  it("applies Checkout-only state when a concurrent event makes the first subscription generation current", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-first-generation-race",
      stripeCustomerId: "cus_first_generation_race",
      stripeSubscriptionId: null,
      subscriptionStatus: "trialing",
      stripeStateEventCreatedAt: null,
      stripeStateEventId: null,
      stripeStateEventPriority: null,
    });
    fixture.setNextUpdateMissOrgLookup({
      id: "org-first-generation-race",
      stripeCustomerId: "cus_first_generation_race",
      stripeSubscriptionId: "sub_first_generation_race",
      subscriptionStatus: "trialing",
      stripeStateEventCreatedAt: new Date(1_784_000_006_000),
      stripeStateEventId: "evt_concurrent_subscription_created",
      stripeStateEventPriority: 70,
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "sub_first_generation_race",
          customer: "cus_first_generation_race",
          status: "trialing",
          created: 200,
          trial_end: 1_784_100_000,
          metadata: { planTier: "growth", billingCycle: "annual" },
          items: { data: [] },
        }),
    }) as unknown as typeof fetch;

    const event = {
      id: "evt_first_generation_checkout_race",
      type: "checkout.session.completed",
      created: 1_784_000_006,
      data: {
        object: {
          mode: "subscription",
          client_reference_id: "org-first-generation-race",
          customer: "cus_first_generation_race",
          subscription: "sub_first_generation_race",
          payment_status: "no_payment_required",
          metadata: {
            planTier: "starter",
            billingCycle: "monthly",
            promoCode: "Y80OFF",
          },
        },
      },
    };
    const bindings = {
      STRIPE_WEBHOOK_SECRET: SECRET,
      STRIPE_SECRET_KEY: "sk_test",
    } as never;

    const raced = await handleStripeWebhookRequest({
      db: fixture.db,
      bindings,
      request: await signedRequest(JSON.stringify(event)),
    });
    expect(raced.status).toBe(503);

    const retried = await handleStripeWebhookRequest({
      db: fixture.db,
      bindings,
      request: await signedRequest(JSON.stringify(event)),
    });
    expect(retried.status).toBe(200);

    expect(fixture.updates.at(-1)).toMatchObject({
      stripeSubscriptionId: "sub_first_generation_race",
      planTier: "growth",
      billingCycle: "annual",
      promoCodeApplied: "Y80OFF",
      planSelectedAt: expect.any(Date),
    });
  });

  it("rolls back a replacement audit after repeated CAS misses so the same Stripe event can retry", async () => {
    const fixture = buildDb();
    const originalGeneration = {
      id: "org-replacement-cas-retry",
      stripeCustomerId: "cus_replacement_cas_retry",
      stripeSubscriptionId: "sub_old",
      subscriptionStatus: "active",
      stripeStateEventCreatedAt: new Date(1_784_000_000_000),
      stripeStateEventId: "evt_old_active",
      stripeStateEventPriority: 60,
    };
    const firstConcurrentState = {
      ...originalGeneration,
      subscriptionStatus: "past_due",
      stripeStateEventCreatedAt: new Date(1_784_000_001_000),
      stripeStateEventId: "evt_concurrent_failure_1",
      stripeStateEventPriority: 80,
    };
    const secondConcurrentState = {
      ...firstConcurrentState,
      stripeStateEventCreatedAt: new Date(1_784_000_002_000),
      stripeStateEventId: "evt_concurrent_failure_2",
    };
    fixture.setOrgLookup(originalGeneration);
    fixture.setUpdateMissOrgLookups([firstConcurrentState, secondConcurrentState]);
    globalThis.fetch = vi.fn((input: string | URL | Request) => {
      const isIncoming = String(input).endsWith("/sub_new");
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            id: isIncoming ? "sub_new" : "sub_old",
            customer: "cus_replacement_cas_retry",
            status: isIncoming ? "trialing" : "past_due",
            created: isIncoming ? 200 : 100,
            trial_end: 1_784_100_000,
            items: { data: [] },
          }),
      });
    }) as unknown as typeof fetch;
    const event = {
      id: "evt_replacement_checkout_cas_retry",
      type: "checkout.session.completed",
      created: 1_784_000_006,
      data: {
        object: {
          mode: "subscription",
          client_reference_id: "org-replacement-cas-retry",
          customer: "cus_replacement_cas_retry",
          subscription: "sub_new",
          payment_status: "no_payment_required",
        },
      },
    };
    const bindings = {
      STRIPE_WEBHOOK_SECRET: SECRET,
      STRIPE_SECRET_KEY: "sk_test",
    } as never;

    const raced = await handleStripeWebhookRequest({
      db: fixture.db,
      bindings,
      request: await signedRequest(JSON.stringify(event)),
    });
    expect(raced).toMatchObject({
      status: 503,
      body: { error: "stripe_reconciliation_unavailable" },
    });
    expect(fixture.updates).toHaveLength(0);

    const retried = await handleStripeWebhookRequest({
      db: fixture.db,
      bindings,
      request: await signedRequest(JSON.stringify(event)),
    });
    expect(retried.status).toBe(200);
    expect(fixture.updates.at(-1)).toMatchObject({
      stripeSubscriptionId: "sub_new",
      subscriptionStatus: "trialing",
      stripeStateEventId: "evt_replacement_checkout_cas_retry",
    });
    expect(
      fixture.inserts.filter((row) => row.stripeEventId === "evt_replacement_checkout_cas_retry"),
    ).toHaveLength(2);
  });

  it("accepts a replacement audit when the missed CAS reveals the same generation is already current", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-replacement-already-current",
      stripeCustomerId: "cus_replacement_already_current",
      stripeSubscriptionId: "sub_old",
      subscriptionStatus: "active",
      stripeStateEventCreatedAt: new Date(1_784_000_000_000),
      stripeStateEventPriority: 60,
    });
    fixture.setNextUpdateMissOrgLookup({
      id: "org-replacement-already-current",
      stripeCustomerId: "cus_replacement_already_current",
      stripeSubscriptionId: "sub_new",
      subscriptionStatus: "trialing",
      stripeStateEventCreatedAt: new Date(1_784_000_006_000),
      stripeStateEventPriority: 70,
    });
    globalThis.fetch = vi.fn((input: string | URL | Request) => {
      const isIncoming = String(input).endsWith("/sub_new");
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            id: isIncoming ? "sub_new" : "sub_old",
            customer: "cus_replacement_already_current",
            status: isIncoming ? "trialing" : "active",
            created: isIncoming ? 200 : 100,
            items: { data: [] },
          }),
      });
    }) as unknown as typeof fetch;

    await processStripeEvent(
      fixture.db,
      {
        id: "evt_replacement_already_current",
        type: "checkout.session.completed",
        created: 1_784_000_006,
        data: {
          object: {
            mode: "subscription",
            client_reference_id: "org-replacement-already-current",
            customer: "cus_replacement_already_current",
            subscription: "sub_new",
            payment_status: "no_payment_required",
          },
        },
      },
      { STRIPE_SECRET_KEY: "sk_test" } as never,
    );

    expect(fixture.updates).toHaveLength(0);
    expect(
      fixture.inserts.filter((row) => row.stripeEventId === "evt_replacement_already_current"),
    ).toHaveLength(1);
  });

  it("acknowledges a wrong-customer replacement Checkout without mutation or retry storm", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-wrong-customer",
      stripeCustomerId: "cus_expected",
      stripeSubscriptionId: "sub_old",
      subscriptionStatus: "canceled",
      stripeStateEventCreatedAt: new Date(1_784_000_000_000),
      stripeStateEventId: "evt_old_deleted",
      stripeStateEventPriority: 100,
    });
    const event = {
      id: "evt_wrong_customer_checkout",
      type: "checkout.session.completed",
      created: 1_784_000_008,
      data: {
        object: {
          mode: "subscription",
          client_reference_id: "org-wrong-customer",
          customer: "cus_expected",
          subscription: "sub_new",
          payment_status: "no_payment_required",
        },
      },
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "sub_new",
          customer: "cus_different",
          status: "trialing",
          trial_end: 1_784_100_000,
          items: { data: [] },
        }),
    }) as unknown as typeof fetch;

    const result = await handleStripeWebhookRequest({
      db: fixture.db,
      bindings: { STRIPE_WEBHOOK_SECRET: SECRET, STRIPE_SECRET_KEY: "sk_test" } as never,
      request: await signedRequest(JSON.stringify(event)),
    });

    expect(result.status).toBe(200);
    expect(fixture.inserts).toHaveLength(0);
    expect(fixture.updates).toHaveLength(0);
  });

  it("returns 503 for a replacement Checkout when canonical Stripe lookup is not configured", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-replacement-missing-secret",
      stripeCustomerId: "cus_replacement_missing_secret",
      stripeSubscriptionId: "sub_old",
      subscriptionStatus: "canceled",
      stripeStateEventCreatedAt: new Date(1_784_000_000_000),
      stripeStateEventId: "evt_old_deleted",
      stripeStateEventPriority: 100,
    });
    const event = {
      id: "evt_replacement_missing_secret",
      type: "checkout.session.completed",
      created: 1_784_000_007,
      data: {
        object: {
          mode: "subscription",
          client_reference_id: "org-replacement-missing-secret",
          customer: "cus_replacement_missing_secret",
          subscription: "sub_new",
          payment_status: "no_payment_required",
        },
      },
    };

    const result = await handleStripeWebhookRequest({
      db: fixture.db,
      bindings: { STRIPE_WEBHOOK_SECRET: SECRET } as never,
      request: await signedRequest(JSON.stringify(event)),
    });

    expect(result.status).toBe(503);
    expect(fixture.inserts).toHaveLength(0);
  });
});

describe("processStripeEvent dispatch", () => {
  const analyticsBindings = {
    APP_URL: "https://app.grantpipe.com",
    INTEGRATION_MODE: "mock",
  } as never;

  function analyticsInserts(inserts: Record<string, unknown>[]) {
    return inserts.filter((insert) => "eventName" in insert);
  }

  async function expectNoDuplicateAnalytics(
    fixture: ReturnType<typeof buildDb>,
    event: {
      id: string;
      type: string;
      data: { object: Record<string, unknown> };
    },
  ) {
    fixture.setNextInsertConflict(true);
    fixture.inserts.length = 0;
    await processStripeEvent(fixture.db, event, analyticsBindings);
    expect(analyticsInserts(fixture.inserts)).toHaveLength(0);
  }

  it("ignores donor-side Connect invoices after recurring gifts are removed", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({ id: "org-saas" });
    const event = {
      id: "evt_connect_failed",
      type: "invoice.payment_failed",
      account: "acct_123",
      data: {
        object: {
          id: "in_connect_invoice",
          customer: "cus_saas",
          subscription: "sub_donor",
          billing_reason: "subscription_cycle",
          amount_due: 2500,
          metadata: {
            orgId: "org-saas",
            purpose: "retired_donor_payment",
          },
        },
      },
    };

    await processStripeEvent(fixture.db, event);

    expect(fixture.findFirstMock).not.toHaveBeenCalled();
    expect(fixture.updates).toHaveLength(0);
    expect(fixture.inserts).toHaveLength(0);
  });

  it("handles customer.subscription.updated and writes trialEndsAt from unix seconds", async () => {
    const { db, updates } = buildDb();
    await processStripeEvent(db, {
      id: "evt_2",
      type: "customer.subscription.updated",
      data: {
        object: {
          status: "active",
          trial_end: 1700000000,
          metadata: { orgId: "org-2", planTier: "starter", billingCycle: "monthly" },
        },
      },
    });
    expect(updates[0]).toMatchObject({
      subscriptionStatus: "active",
      planTier: "starter",
      billingCycle: "monthly",
    });
    expect((updates[0] as { trialEndsAt: Date }).trialEndsAt.getTime()).toBe(1700000000 * 1000);
  });

  it("emits checkout_completed analytics only after a new checkout webhook is accepted", async () => {
    const fixture = buildDb();
    const event = {
      id: "evt_checkout_analytics",
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "subscription",
          client_reference_id: "org-analytics",
          customer: "cus_should_not_emit",
          subscription: "sub_should_not_emit",
          amount_total: 15900,
          customer_email: "billing@example.org",
          payment_status: "paid",
          metadata: {
            orgId: "org-analytics",
            planTier: "growth",
            billingCycle: "annual",
          },
        },
      },
    };

    await processStripeEvent(fixture.db, event, analyticsBindings);

    expect(analyticsInserts(fixture.inserts)[0]).toMatchObject({
      orgId: "org-analytics",
      eventName: ANALYTICS_EVENTS.checkoutCompleted,
      payload: {
        org_id: "org-analytics",
        plan_tier: "growth",
        billing_cycle: "annual",
        subscription_status: "active",
        stripe_event_type: "checkout.session.completed",
        amount_cents: 15900,
        environment: "production",
      },
    });
    const serialized = JSON.stringify(analyticsInserts(fixture.inserts)[0]);
    expect(serialized).not.toContain("billing@example.org");
    expect(serialized).not.toContain("cus_should_not_emit");
    expect(serialized).not.toContain("sub_should_not_emit");

    fixture.setNextInsertConflict(true);
    fixture.inserts.length = 0;
    await processStripeEvent(fixture.db, event, analyticsBindings);
    expect(analyticsInserts(fixture.inserts)).toHaveLength(0);
  });

  it.each([
    ["payment mode", { mode: "payment", customer: "cus_shape", subscription: "sub_shape" }],
    ["setup mode", { mode: "setup", customer: "cus_shape", subscription: "sub_shape" }],
    ["missing mode", { customer: "cus_shape", subscription: "sub_shape" }],
    ["missing customer", { mode: "subscription", subscription: "sub_shape" }],
    ["missing subscription", { mode: "subscription", customer: "cus_shape" }],
    ["blank customer", { mode: "subscription", customer: "   ", subscription: "sub_shape" }],
    ["blank subscription", { mode: "subscription", customer: "cus_shape", subscription: "   " }],
  ])("ignores checkout completion with %s", async (_label, shape) => {
    const fixture = buildDb();
    fixture.setOrgLookup({ id: "org-shape", stripeCustomerId: null });

    await processStripeEvent(fixture.db, {
      id: `evt_checkout_${_label.replaceAll(" ", "_")}`,
      type: "checkout.session.completed",
      created: 1_784_000_010,
      data: {
        object: {
          client_reference_id: "org-shape",
          payment_status: "paid",
          ...shape,
        },
      },
    });

    expect(fixture.inserts).toHaveLength(0);
    expect(fixture.updates).toHaveLength(0);
  });

  it("does not rebind an org that already owns a different Stripe customer", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-existing-customer",
      stripeCustomerId: "cus_existing",
      stripeSubscriptionId: null,
    });

    await processStripeEvent(fixture.db, {
      id: "evt_checkout_customer_rebind",
      type: "checkout.session.completed",
      created: 1_784_000_011,
      data: {
        object: {
          mode: "subscription",
          client_reference_id: "org-existing-customer",
          customer: "cus_incoming",
          subscription: "sub_incoming",
          payment_status: "paid",
        },
      },
    });

    expect(fixture.inserts).toHaveLength(0);
    expect(fixture.updates).toHaveLength(0);
  });

  it("does not bind a Stripe customer that belongs to another org", async () => {
    const fixture = buildDb();
    fixture.findFirstMock
      .mockResolvedValueOnce({
        id: "org-checkout-target",
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      })
      .mockResolvedValueOnce({ id: "org-customer-owner" });

    await processStripeEvent(fixture.db, {
      id: "evt_checkout_cross_org_customer",
      type: "checkout.session.completed",
      created: 1_784_000_012,
      data: {
        object: {
          mode: "subscription",
          client_reference_id: "org-checkout-target",
          customer: "cus_other_org",
          subscription: "sub_incoming",
          payment_status: "paid",
        },
      },
    });

    expect(fixture.inserts).toHaveLength(0);
    expect(fixture.updates).toHaveLength(0);
  });

  it("reports checkout analytics capture failures without failing the accepted webhook", async () => {
    const fixture = buildDb();
    const analyticsError = new Error("PostHog unavailable");
    fixture.setNextAnalyticsInsertError(analyticsError);
    const event = {
      id: "evt_checkout_analytics_failure",
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "subscription",
          client_reference_id: "org-analytics-failure",
          customer: "cus_should_not_emit",
          subscription: "sub_should_not_emit",
          amount_total: 15900,
          payment_status: "paid",
          metadata: {
            orgId: "org-analytics-failure",
            planTier: "growth",
            billingCycle: "annual",
          },
        },
      },
    };

    await expect(processStripeEvent(fixture.db, event, analyticsBindings)).resolves.toBeUndefined();

    expect(fixture.updates[0]).toMatchObject({
      subscriptionStatus: "active",
      planTier: "growth",
      billingCycle: "annual",
    });
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(analyticsError, "billing", {
      step: "webhook_analytics",
      analytics_event: ANALYTICS_EVENTS.checkoutCompleted,
      stripe_event_type: "checkout.session.completed",
    });
  });

  it("emits subscription_started analytics for a new subscription.created webhook", async () => {
    const fixture = buildDb();
    const event = {
      id: "evt_subscription_started",
      type: "customer.subscription.created",
      data: {
        object: {
          status: "trialing",
          metadata: {
            orgId: "org-subscription",
            planTier: "starter",
            billingCycle: "monthly",
          },
        },
      },
    };
    await processStripeEvent(fixture.db, event, analyticsBindings);

    expect(analyticsInserts(fixture.inserts)[0]).toMatchObject({
      orgId: "org-subscription",
      eventName: ANALYTICS_EVENTS.subscriptionStarted,
      payload: {
        org_id: "org-subscription",
        plan_tier: "starter",
        billing_cycle: "monthly",
        subscription_status: "trialing",
        stripe_event_type: "customer.subscription.created",
        environment: "production",
      },
    });

    await expectNoDuplicateAnalytics(fixture, event);
  });

  it("emits subscription_canceled and payment_failed analytics for accepted webhooks", async () => {
    const canceledFixture = buildDb();
    const canceledEvent = {
      id: "evt_subscription_canceled",
      type: "customer.subscription.deleted",
      data: {
        object: {
          metadata: {
            orgId: "org-canceled",
            planTier: "growth",
            billingCycle: "annual",
          },
        },
      },
    };
    await processStripeEvent(canceledFixture.db, canceledEvent, analyticsBindings);

    expect(analyticsInserts(canceledFixture.inserts)[0]).toMatchObject({
      orgId: "org-canceled",
      eventName: ANALYTICS_EVENTS.subscriptionCanceled,
      payload: {
        org_id: "org-canceled",
        plan_tier: "growth",
        billing_cycle: "annual",
        subscription_status: "canceled",
        stripe_event_type: "customer.subscription.deleted",
        environment: "production",
      },
    });
    await expectNoDuplicateAnalytics(canceledFixture, canceledEvent);

    const failedFixture = buildDb();
    failedFixture.setOrgLookup({
      id: "org-failed",
      stripeSubscriptionId: "sub_failed",
      stripeStateEventCreatedAt: new Date(1_000),
      stripeStateEventPriority: 60,
    });
    const failedEvent = {
      id: "evt_payment_failed",
      type: "invoice.payment_failed",
      created: 2,
      data: {
        object: {
          amount_due: 4900,
          subscription: "sub_failed",
          billing_reason: "subscription_cycle",
          metadata: {
            orgId: "org-failed",
            planTier: "starter",
            billingCycle: "monthly",
          },
        },
      },
    };
    await processStripeEvent(failedFixture.db, failedEvent, analyticsBindings);

    expect(analyticsInserts(failedFixture.inserts)[0]).toMatchObject({
      orgId: "org-failed",
      eventName: ANALYTICS_EVENTS.paymentFailed,
      payload: {
        org_id: "org-failed",
        plan_tier: "starter",
        billing_cycle: "monthly",
        subscription_status: "past_due",
        stripe_event_type: "invoice.payment_failed",
        amount_cents: 4900,
        environment: "production",
      },
    });
    await expectNoDuplicateAnalytics(failedFixture, failedEvent);
  });

  it("handles customer.subscription.created the same way as updated", async () => {
    const { db, updates } = buildDb();
    await processStripeEvent(db, {
      id: "evt_3",
      type: "customer.subscription.created",
      data: { object: { status: "trialing", metadata: { orgId: "org-3" } } },
    });
    expect(updates[0]).toMatchObject({ subscriptionStatus: "trialing" });
  });

  it("ignores subscription updates without orgId metadata or customer match", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup(undefined);
    await processStripeEvent(fixture.db, {
      id: "evt_4",
      type: "customer.subscription.updated",
      data: { object: { status: "active", metadata: {} } },
    });
    expect(fixture.updates).toHaveLength(0);
  });

  it("does not use subscription metadata when a present customer has no DB match", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-metadata-target",
      stripeSubscriptionId: null,
      stripeStateEventCreatedAt: null,
      stripeStateEventPriority: null,
    });
    fixture.findFirstMock.mockResolvedValueOnce(undefined);

    await processStripeEvent(fixture.db, {
      id: "evt_unknown_customer_metadata",
      type: "customer.subscription.updated",
      created: 1_784_000_000,
      data: {
        object: {
          id: "sub_unknown_customer",
          customer: "cus_unknown",
          status: "active",
          metadata: { orgId: "org-metadata-target" },
        },
      },
    });

    expect(fixture.updates).toHaveLength(0);
    expect(fixture.inserts).toHaveLength(0);
  });

  it("does not cancel a metadata org when a present customer has no DB match", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-metadata-target",
      stripeSubscriptionId: null,
      stripeStateEventCreatedAt: null,
      stripeStateEventPriority: null,
    });
    fixture.findFirstMock.mockResolvedValueOnce(undefined);

    await processStripeEvent(fixture.db, {
      id: "evt_unknown_customer_deleted",
      type: "customer.subscription.deleted",
      created: 1_784_000_001,
      data: {
        object: {
          id: "sub_unknown_customer",
          customer: "cus_unknown",
          metadata: { orgId: "org-metadata-target" },
        },
      },
    });

    expect(fixture.updates).toHaveLength(0);
    expect(fixture.inserts).toHaveLength(0);
  });

  it("does not apply an invoice to metadata when a present customer has no DB match", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-metadata-target",
      stripeSubscriptionId: "sub_unknown_customer",
      subscriptionStatus: "active",
      stripeStateEventCreatedAt: new Date(1_000),
      stripeStateEventPriority: 60,
    });
    fixture.findFirstMock.mockResolvedValueOnce(undefined);

    await processStripeEvent(fixture.db, {
      id: "evt_unknown_customer_invoice",
      type: "invoice.payment_failed",
      created: 1_784_000_002,
      data: {
        object: {
          customer: "cus_unknown",
          subscription: "sub_unknown_customer",
          billing_reason: "subscription_cycle",
          metadata: { orgId: "org-metadata-target" },
        },
      },
    });

    expect(fixture.updates).toHaveLength(0);
    expect(fixture.inserts).toHaveLength(0);
  });

  it("resolves orgId from stripe customer when subscription metadata is missing", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({ id: "org-4b" });
    await processStripeEvent(fixture.db, {
      id: "evt_4b",
      type: "customer.subscription.updated",
      data: {
        object: { status: "active", customer: "cus_known", metadata: {} },
      },
    });
    expect(fixture.updates[0]).toMatchObject({ subscriptionStatus: "active" });
  });

  it("derives subscription plan and cycle from Stripe price when metadata is stale", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({ id: "org-price-change" });
    await processStripeEvent(
      fixture.db,
      {
        id: "evt_price_change",
        type: "customer.subscription.updated",
        data: {
          object: {
            status: "active",
            customer: "cus_price_change",
            metadata: {
              orgId: "org-spoofed",
              planTier: "growth",
              billingCycle: "annual",
            },
            items: {
              data: [
                {
                  price: { id: "price_audit_ready_monthly" },
                },
              ],
            },
          },
        },
      },
      {
        STRIPE_PRICE_GROWTH_ANNUAL: "price_growth_annual",
        STRIPE_PRICE_AUDIT_READY_MONTHLY: "price_audit_ready_monthly",
      } as never,
    );

    expect(fixture.updates[0]).toMatchObject({
      subscriptionStatus: "active",
      planTier: "audit_ready",
      billingCycle: "monthly",
    });
  });

  it("uses metadata to disambiguate duplicate Growth monthly and annual Stripe price ids", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({ id: "org-growth-annual" });
    await processStripeEvent(
      fixture.db,
      {
        id: "evt_duplicate_growth_price",
        type: "customer.subscription.updated",
        data: {
          object: {
            status: "active",
            customer: "cus_growth_annual",
            metadata: {
              orgId: "org-growth-annual",
              planTier: "growth",
              billingCycle: "annual",
            },
            items: {
              data: [
                {
                  price: { id: "price_1TpHERLcwbPKn2Kg7LC3F5h5" },
                },
              ],
            },
          },
        },
      },
      {
        STRIPE_PRICE_GROWTH_MONTHLY: "price_1TpHERLcwbPKn2Kg7LC3F5h5",
        STRIPE_PRICE_GROWTH_ANNUAL: "price_1TpHERLcwbPKn2Kg7LC3F5h5",
      } as never,
    );

    expect(fixture.updates[0]).toMatchObject({
      subscriptionStatus: "active",
      planTier: "growth",
      billingCycle: "annual",
    });
  });

  it("falls back to the first duplicate price candidate when metadata does not match", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({ id: "org-growth-fallback" });
    await processStripeEvent(
      fixture.db,
      {
        id: "evt_duplicate_growth_price_fallback",
        type: "customer.subscription.updated",
        data: {
          object: {
            status: "active",
            customer: "cus_growth_fallback",
            metadata: {
              orgId: "org-growth-fallback",
              planTier: "starter",
              billingCycle: "annual",
            },
            items: {
              data: [
                {
                  price: { id: "price_duplicate_growth" },
                },
              ],
            },
          },
        },
      },
      {
        STRIPE_PRICE_GROWTH_MONTHLY: "price_duplicate_growth",
        STRIPE_PRICE_GROWTH_ANNUAL: "price_duplicate_growth",
      } as never,
    );

    expect(fixture.updates[0]).toMatchObject({
      subscriptionStatus: "active",
      planTier: "growth",
      billingCycle: "monthly",
    });
  });

  it("falls back to the first duplicate price candidate when metadata is absent", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({ id: "org-growth-no-metadata" });
    await processStripeEvent(
      fixture.db,
      {
        id: "evt_duplicate_growth_price_no_metadata",
        type: "customer.subscription.updated",
        data: {
          object: {
            status: "active",
            customer: "cus_growth_no_metadata",
            items: {
              data: [
                {
                  price: { id: "price_duplicate_growth_no_metadata" },
                },
              ],
            },
          },
        },
      },
      {
        STRIPE_PRICE_GROWTH_MONTHLY: "price_duplicate_growth_no_metadata",
        STRIPE_PRICE_GROWTH_ANNUAL: "price_duplicate_growth_no_metadata",
      } as never,
    );

    expect(fixture.updates[0]).toMatchObject({
      subscriptionStatus: "active",
      planTier: "growth",
      billingCycle: "monthly",
    });
  });

  it("uses Stripe recurring interval to disambiguate duplicate price ids without metadata", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({ id: "org-growth-interval" });
    await processStripeEvent(
      fixture.db,
      {
        id: "evt_duplicate_growth_price_interval",
        type: "customer.subscription.updated",
        data: {
          object: {
            status: "active",
            customer: "cus_growth_interval",
            items: {
              data: [
                {
                  price: {
                    id: "price_duplicate_growth_interval",
                    recurring: { interval: "year" },
                  },
                },
              ],
            },
          },
        },
      },
      {
        STRIPE_PRICE_GROWTH_MONTHLY: "price_duplicate_growth_interval",
        STRIPE_PRICE_GROWTH_ANNUAL: "price_duplicate_growth_interval",
      } as never,
    );

    expect(fixture.updates[0]).toMatchObject({
      subscriptionStatus: "active",
      planTier: "growth",
      billingCycle: "annual",
    });
  });

  it("derives subscription plan and cycle from a flat Stripe plan price id", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({ id: "org-flat-price" });
    await processStripeEvent(
      fixture.db,
      {
        id: "evt_flat_price_change",
        type: "customer.subscription.updated",
        data: {
          object: {
            status: "active",
            customer: "cus_flat_price",
            metadata: { orgId: "org-flat-price" },
            plan: { id: "price_starter_annual" },
          },
        },
      },
      {
        STRIPE_PRICE_STARTER_ANNUAL: "price_starter_annual",
      } as never,
    );

    expect(fixture.updates[0]).toMatchObject({
      subscriptionStatus: "active",
      planTier: "starter",
      billingCycle: "annual",
    });
  });

  it("derives invoice plan and cycle from Stripe line pricing details", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-line-price",
      stripeSubscriptionId: "sub_line_price",
      stripeStateEventCreatedAt: new Date(1_000),
      stripeStateEventPriority: 60,
    });
    await processStripeEvent(
      fixture.db,
      {
        id: "evt_line_price_change",
        type: "invoice.payment_succeeded",
        created: 2,
        data: {
          object: {
            customer: "cus_line_price",
            subscription: "sub_line_price",
            billing_reason: "subscription_update",
            metadata: { orgId: "org-line-price", planTier: "starter", billingCycle: "monthly" },
            lines: {
              data: [
                {
                  pricing: {
                    price_details: {
                      price: "price_growth_annual",
                    },
                  },
                },
              ],
            },
          },
        },
      },
      {
        STRIPE_PRICE_GROWTH_ANNUAL: "price_growth_annual",
      } as never,
    );

    expect(fixture.updates[0]).toMatchObject({
      subscriptionStatus: "active",
      planTier: "growth",
      billingCycle: "annual",
    });
  });

  it("keeps inline Growth annual invoice analytics keyed by metadata when Stripe generates a price id", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-inline-growth",
      stripeSubscriptionId: "sub_inline_growth",
      stripeStateEventCreatedAt: new Date(1_000),
      stripeStateEventPriority: 60,
    });
    await processStripeEvent(
      fixture.db,
      {
        id: "evt_inline_growth_invoice",
        type: "invoice.payment_succeeded",
        created: 2,
        data: {
          object: {
            customer: "cus_inline_growth",
            subscription: "sub_inline_growth",
            billing_reason: "subscription_cycle",
            amount_paid: 94800,
            metadata: {
              orgId: "org-spoofed",
              planTier: "growth",
              billingCycle: "annual",
            },
            lines: {
              data: [
                {
                  price: {
                    id: "price_generated_by_stripe_inline_price_data",
                    recurring: { interval: "year" },
                  },
                },
              ],
            },
          },
        },
      },
      {
        APP_URL: "https://app.grantpipe.com",
        INTEGRATION_MODE: "mock",
        STRIPE_PRICE_GROWTH_MONTHLY: "price_1TpHERLcwbPKn2Kg7LC3F5h5",
        STRIPE_PRICE_GROWTH_ANNUAL: "price_1TpHERLcwbPKn2Kg7LC3F5h5",
      } as never,
    );

    expect(fixture.updates[0]).toMatchObject({
      subscriptionStatus: "active",
      planTier: "growth",
      billingCycle: "annual",
    });
    expect(analyticsInserts(fixture.inserts)[0]).toMatchObject({
      orgId: "org-inline-growth",
      eventName: ANALYTICS_EVENTS.paymentRecovered,
      payload: expect.objectContaining({
        org_id: "org-inline-growth",
        plan_tier: "growth",
        billing_cycle: "annual",
        amount_cents: 94800,
        stripe_event_type: "invoice.payment_succeeded",
      }),
    });
  });

  it("clears trialEndsAt when Stripe reports trial_end as null", async () => {
    const { db, updates } = buildDb();
    await processStripeEvent(db, {
      id: "evt_4c",
      type: "customer.subscription.updated",
      data: {
        object: { status: "active", trial_end: null, metadata: { orgId: "org-4c" } },
      },
    });
    expect(updates[0]).toMatchObject({ trialEndsAt: null });
  });

  it("maps stripe-only statuses like unpaid to past_due", async () => {
    const { db, updates } = buildDb();
    await processStripeEvent(db, {
      id: "evt_4d",
      type: "customer.subscription.updated",
      data: { object: { status: "unpaid", metadata: { orgId: "org-4d" } } },
    });
    expect(updates[0]).toMatchObject({ subscriptionStatus: "past_due" });
  });

  it("maps stripe-only status paused to past_due", async () => {
    const { db, updates } = buildDb();
    await processStripeEvent(db, {
      id: "evt_4e",
      type: "customer.subscription.updated",
      data: { object: { status: "paused", metadata: { orgId: "org-4e" } } },
    });
    expect(updates[0]).toMatchObject({ subscriptionStatus: "past_due" });
  });

  it("leaves subscriptionStatus undefined for completely unknown stripe status", async () => {
    const { db, updates } = buildDb();
    await processStripeEvent(db, {
      id: "evt_4f",
      type: "customer.subscription.updated",
      data: { object: { status: "some_future_status", metadata: { orgId: "org-4f" } } },
    });
    expect(updates[0]).toMatchObject({ subscriptionStatus: undefined });
  });

  it("handles customer.subscription.deleted by canceling the subscription", async () => {
    const { db, updates } = buildDb();
    await processStripeEvent(db, {
      id: "evt_5",
      type: "customer.subscription.deleted",
      data: { object: { metadata: { orgId: "org-5" } } },
    });
    expect(updates[0]).toMatchObject({ subscriptionStatus: "canceled" });
  });

  it("handles invoice.payment_failed via metadata.orgId", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-6",
      stripeSubscriptionId: "sub_6",
      stripeStateEventCreatedAt: new Date(1_000),
      stripeStateEventPriority: 60,
    });
    await processStripeEvent(fixture.db, {
      id: "evt_6",
      type: "invoice.payment_failed",
      created: 2,
      data: {
        object: {
          customer: "cus_x",
          subscription: "sub_6",
          billing_reason: "subscription_cycle",
          metadata: { orgId: "org-6" },
        },
      },
    });
    expect(fixture.updates[0]).toMatchObject({ subscriptionStatus: "past_due" });
  });

  it("handles invoice.payment_failed via customer lookup when metadata missing", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-7",
      stripeSubscriptionId: "sub_7",
      stripeStateEventCreatedAt: new Date(1_000),
      stripeStateEventPriority: 60,
    });
    await processStripeEvent(fixture.db, {
      id: "evt_7",
      type: "invoice.payment_failed",
      created: 2,
      data: {
        object: {
          customer: "cus_match",
          subscription: "sub_7",
          billing_reason: "subscription_cycle",
          metadata: {},
        },
      },
    });
    expect(fixture.updates[0]).toMatchObject({ subscriptionStatus: "past_due" });
  });

  it("ignores invoice.payment_failed for non-subscription invoices even when customer resolves", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({ id: "org-manual-invoice" });

    await processStripeEvent(
      fixture.db,
      {
        id: "evt_manual_invoice_failed",
        type: "invoice.payment_failed",
        data: {
          object: {
            customer: "cus_match",
            billing_reason: "manual",
            amount_due: 2500,
            metadata: { orgId: "org-spoofed", planTier: "growth", billingCycle: "annual" },
          },
        },
      },
      analyticsBindings,
    );

    expect(fixture.updates).toHaveLength(0);
    expect(analyticsInserts(fixture.inserts)).toHaveLength(0);
  });

  it("ignores invoice.payment_failed when neither metadata nor customer match", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup(undefined);
    await processStripeEvent(fixture.db, {
      id: "evt_8",
      type: "invoice.payment_failed",
      data: { object: { customer: "cus_unknown", metadata: {} } },
    });
    expect(fixture.updates).toHaveLength(0);
  });

  it("ignores invoice.payment_failed without customer or metadata", async () => {
    const { db, updates } = buildDb();
    await processStripeEvent(db, {
      id: "evt_9",
      type: "invoice.payment_failed",
      data: { object: { metadata: {} } },
    });
    expect(updates).toHaveLength(0);
  });

  it("ignores invoice.payment_failed when invoice is a subscription invoice but org cannot be resolved", async () => {
    // Passes isSubscriptionInvoice (has subscription + subscription_cycle billing_reason),
    // but resolveOrgIdForSubscription returns null — covers the !orgId early-return at line 526.
    const fixture = buildDb();
    fixture.setOrgLookup(undefined);
    await processStripeEvent(fixture.db, {
      id: "evt_pf_no_org",
      type: "invoice.payment_failed",
      data: {
        object: {
          customer: "cus_unresolvable",
          subscription: "sub_pf_no_org",
          billing_reason: "subscription_cycle",
          metadata: {},
        },
      },
    });
    expect(fixture.updates).toHaveLength(0);
  });

  it("handles invoice.payment_succeeded by restoring active billing", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-recovered",
      stripeSubscriptionId: "sub_recovered",
      stripeStateEventCreatedAt: new Date(1_000),
      stripeStateEventPriority: 60,
    });
    const event = {
      id: "evt_inv_succ_basic",
      type: "invoice.payment_succeeded",
      created: 1_784_000_100,
      data: {
        object: {
          customer: "cus_recovered",
          subscription: "sub_recovered",
          billing_reason: "subscription_cycle",
          metadata: { orgId: "org-recovered", planTier: "growth", billingCycle: "annual" },
        },
      },
    };
    await processStripeEvent(fixture.db, event);
    expect(fixture.updates[0]).toMatchObject({
      subscriptionStatus: "active",
      planTier: "growth",
      billingCycle: "annual",
    });
  });

  it("ignores older subscription updates after a newer cancellation watermark", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-ordered",
      stripeCustomerId: "cus_ordered",
      stripeSubscriptionId: "sub_ordered",
    });

    await processStripeEvent(
      fixture.db,
      {
        id: "evt_cancel_newer",
        type: "customer.subscription.deleted",
        created: 200,
        data: {
          object: {
            id: "sub_ordered",
            customer: "cus_ordered",
            metadata: { orgId: "org-ordered" },
          },
        },
      },
      analyticsBindings,
    );

    await processStripeEvent(
      fixture.db,
      {
        id: "evt_update_older",
        type: "customer.subscription.updated",
        created: 100,
        data: {
          object: {
            id: "sub_ordered",
            customer: "cus_ordered",
            status: "active",
            metadata: { orgId: "org-ordered", planTier: "growth", billingCycle: "annual" },
          },
        },
      },
      analyticsBindings,
    );

    expect(fixture.updates).toHaveLength(1);
    expect(fixture.updates[0]).toMatchObject({
      subscriptionStatus: "canceled",
      stripeStateEventId: "evt_cancel_newer",
    });
    expect(analyticsInserts(fixture.inserts).map((row) => row.eventName)).toEqual([
      ANALYTICS_EVENTS.subscriptionCanceled,
    ]);
  });

  it("ignores newer subscription updates for an old subscription on the same customer", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-current-subscription",
      stripeCustomerId: "cus_current_subscription",
      stripeSubscriptionId: "sub_new_current",
      subscriptionStatus: "active",
    });

    await processStripeEvent(
      fixture.db,
      {
        id: "evt_old_sub_update_newer",
        type: "customer.subscription.updated",
        created: 300,
        data: {
          object: {
            id: "sub_old_replayed",
            customer: "cus_current_subscription",
            status: "canceled",
            metadata: { orgId: "org-current-subscription" },
          },
        },
      },
      analyticsBindings,
    );

    expect(fixture.updates).toHaveLength(0);
    expect(analyticsInserts(fixture.inserts)).toHaveLength(0);
  });

  it("audits but does not activate a replacement subscription.created before Checkout", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-replacement",
      stripeCustomerId: "cus_replacement",
      stripeSubscriptionId: "sub_old",
      subscriptionStatus: "canceled",
    });

    await processStripeEvent(fixture.db, {
      id: "evt_replacement_created",
      type: "customer.subscription.created",
      created: 400,
      data: {
        object: {
          id: "sub_new",
          customer: "cus_replacement",
          status: "trialing",
          trial_end: 500,
          metadata: { orgId: "org-replacement", planTier: "growth" },
        },
      },
    });

    expect(fixture.updates).toHaveLength(0);
    expect(fixture.inserts).toContainEqual(
      expect.objectContaining({ stripeEventId: "evt_replacement_created" }),
    );
  });

  it("keeps canonical Stripe state through bootstrap and a delayed intermediate event", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-bootstrap",
      stripeCustomerId: "cus_bootstrap",
      stripeSubscriptionId: "sub_bootstrap",
      subscriptionStatus: "active",
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "sub_bootstrap",
          customer: "cus_bootstrap",
          status: "active",
          trial_end: null,
          items: { data: [{ price: { id: "price_growth" } }] },
        }),
    }) as unknown as typeof fetch;
    try {
      await processStripeEvent(
        fixture.db,
        {
          id: "evt_distinct_old_unseen",
          type: "customer.subscription.updated",
          created: 10,
          data: {
            object: {
              id: "sub_bootstrap",
              customer: "cus_bootstrap",
              status: "canceled",
            },
          },
        },
        { STRIPE_SECRET_KEY: "sk_test", STRIPE_PRICE_GROWTH_MONTHLY: "price_growth" } as never,
      );
      await processStripeEvent(
        fixture.db,
        {
          id: "evt_delayed_intermediate",
          type: "customer.subscription.updated",
          created: 15,
          data: {
            object: {
              id: "sub_bootstrap",
              customer: "cus_bootstrap",
              status: "canceled",
            },
          },
        },
        { STRIPE_SECRET_KEY: "sk_test", STRIPE_PRICE_GROWTH_MONTHLY: "price_growth" } as never,
      );
      expect(fixture.updates.at(-1)).toMatchObject({
        subscriptionStatus: "active",
        planTier: "growth",
        trialEndsAt: null,
      });
      expect(fixture.inserts).toContainEqual(
        expect.objectContaining({ stripeEventId: "evt_distinct_old_unseen" }),
      );
      expect(fixture.inserts).toContainEqual(
        expect.objectContaining({ stripeEventId: "evt_delayed_intermediate" }),
      );
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("advances the canonical watermark so a delayed raw payload cannot later look fresh", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-monotonic-watermark",
      stripeCustomerId: "cus_monotonic_watermark",
      stripeSubscriptionId: "sub_monotonic_watermark",
      subscriptionStatus: "trialing",
      stripeStateEventCreatedAt: new Date(800_000),
      stripeStateEventId: "evt_watermark_800",
      stripeStateEventPriority: 70,
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "sub_monotonic_watermark",
          customer: "cus_monotonic_watermark",
          status: "trialing",
          trial_end: 2_000,
          items: { data: [] },
        }),
    }) as unknown as typeof fetch;
    await processStripeEvent(
      fixture.db,
      {
        id: "evt_watermark_900",
        type: "customer.subscription.updated",
        created: 900,
        data: {
          object: {
            id: "sub_monotonic_watermark",
            customer: "cus_monotonic_watermark",
            status: "trialing",
          },
        },
      },
      { STRIPE_SECRET_KEY: "sk_test" } as never,
    );

    expect(fixture.updates.at(-1)).toMatchObject({
      stripeStateEventCreatedAt: new Date(900_000),
      stripeStateEventPriority: 70,
    });
    fixture.updates.length = 0;

    await processStripeEvent(fixture.db, {
      id: "evt_delayed_raw_850",
      type: "customer.subscription.updated",
      created: 850,
      data: {
        object: {
          id: "sub_monotonic_watermark",
          customer: "cus_monotonic_watermark",
          status: "active",
        },
      },
    });

    expect(fixture.updates).toHaveLength(0);
  });

  it("does not regress the canonical watermark when a delayed event reveals higher priority", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-priority-watermark",
      stripeCustomerId: "cus_priority_watermark",
      stripeSubscriptionId: "sub_priority_watermark",
      subscriptionStatus: "active",
      stripeStateEventCreatedAt: new Date(900_000),
      stripeStateEventId: "evt_watermark_900",
      stripeStateEventPriority: 60,
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "sub_priority_watermark",
          customer: "cus_priority_watermark",
          status: "past_due",
          trial_end: null,
          items: { data: [] },
        }),
    }) as unknown as typeof fetch;

    await processStripeEvent(
      fixture.db,
      {
        id: "evt_delayed_priority_800",
        type: "customer.subscription.updated",
        created: 800,
        data: {
          object: {
            id: "sub_priority_watermark",
            customer: "cus_priority_watermark",
            status: "active",
          },
        },
      },
      { STRIPE_SECRET_KEY: "sk_test" } as never,
    );

    expect(fixture.updates.at(-1)).toMatchObject({
      subscriptionStatus: "past_due",
      stripeStateEventCreatedAt: new Date(900_000),
      stripeStateEventPriority: 80,
    });
  });

  it("preserves a newer higher-priority watermark after canonical recovery", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-canonical-fence",
      stripeCustomerId: "cus_canonical_fence",
      stripeSubscriptionId: "sub_canonical_fence",
      subscriptionStatus: "past_due",
      stripeStateEventCreatedAt: new Date(900_000),
      stripeStateEventId: "evt_failed_900",
      stripeStateEventPriority: 80,
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "sub_canonical_fence",
          customer: "cus_canonical_fence",
          status: "active",
          trial_end: null,
          items: { data: [] },
        }),
    }) as unknown as typeof fetch;
    fixture.allowNextExactCasUpdate();

    await processStripeEvent(
      fixture.db,
      {
        id: "evt_delayed_recovery_800",
        type: "customer.subscription.updated",
        created: 800,
        data: {
          object: {
            id: "sub_canonical_fence",
            customer: "cus_canonical_fence",
            status: "past_due",
          },
        },
      },
      { STRIPE_SECRET_KEY: "sk_test" } as never,
    );

    expect(fixture.updates.at(-1)).toMatchObject({
      subscriptionStatus: "active",
      stripeStateEventCreatedAt: new Date(900_000),
      stripeStateEventPriority: 80,
    });
    const updateCount = fixture.updates.length;

    await expect(
      processStripeEvent(fixture.db, {
        id: "evt_stale_trial_900",
        type: "customer.subscription.updated",
        created: 900,
        data: {
          object: {
            id: "sub_canonical_fence",
            customer: "cus_canonical_fence",
            status: "trialing",
          },
        },
      }),
    ).rejects.toThrow("Stripe subscription reconciliation unavailable");

    expect(fixture.updates).toHaveLength(updateCount);
  });

  it("reconciles a bootstrap payment failure to the current Stripe subscription before audit", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-invoice-bootstrap",
      stripeCustomerId: "cus_invoice_bootstrap",
      stripeSubscriptionId: "sub_invoice_bootstrap",
      subscriptionStatus: "trialing",
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "sub_invoice_bootstrap",
          customer: "cus_invoice_bootstrap",
          status: "active",
          trial_end: null,
          items: { data: [{ price: { id: "price_growth" } }] },
        }),
    }) as unknown as typeof fetch;
    try {
      await processStripeEvent(
        fixture.db,
        {
          id: "evt_invoice_bootstrap_failed",
          type: "invoice.payment_failed",
          created: 20,
          data: {
            object: {
              customer: "cus_invoice_bootstrap",
              subscription: "sub_invoice_bootstrap",
              billing_reason: "subscription_cycle",
            },
          },
        },
        { STRIPE_SECRET_KEY: "sk_test", STRIPE_PRICE_GROWTH_MONTHLY: "price_growth" } as never,
      );

      expect(fixture.updates.at(-1)).toMatchObject({
        subscriptionStatus: "active",
        planTier: "growth",
      });
      expect(fixture.inserts).toContainEqual(
        expect.objectContaining({ stripeEventId: "evt_invoice_bootstrap_failed" }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("reconciles a bootstrap payment success without overwriting canonical past-due state", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-success-bootstrap",
      stripeCustomerId: "cus_success_bootstrap",
      stripeSubscriptionId: "sub_success_bootstrap",
      subscriptionStatus: "trialing",
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "sub_success_bootstrap",
          customer: "cus_success_bootstrap",
          status: "past_due",
          trial_end: null,
          items: { data: [] },
        }),
    }) as unknown as typeof fetch;

    await processStripeEvent(
      fixture.db,
      {
        id: "evt_success_bootstrap",
        type: "invoice.payment_succeeded",
        created: 21,
        data: {
          object: {
            customer: "cus_success_bootstrap",
            subscription: "sub_success_bootstrap",
            billing_reason: "subscription_cycle",
          },
        },
      },
      { STRIPE_SECRET_KEY: "sk_test" } as never,
    );

    expect(fixture.updates.at(-1)).toMatchObject({ subscriptionStatus: "past_due" });
  });

  it("lets authoritative Checkout replace an old subscription cancellation generation", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-new-generation",
      stripeCustomerId: "cus_new_generation",
      stripeSubscriptionId: "sub_old_generation",
      subscriptionStatus: "canceled",
      stripeStateEventCreatedAt: new Date(300_000),
      stripeStateEventId: "evt_old_deleted",
      stripeStateEventPriority: 100,
    });
    globalThis.fetch = vi.fn((input: string | URL | Request) => {
      const isIncoming = String(input).endsWith("/sub_new_generation");
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            id: isIncoming ? "sub_new_generation" : "sub_old_generation",
            customer: "cus_new_generation",
            status: isIncoming ? "future_status" : "canceled",
            created: isIncoming ? 200 : 100,
            trial_end: 900,
            items: {
              data: [{ price: { id: "price_growth", recurring: { interval: "year" } } }],
            },
          }),
      });
    }) as unknown as typeof fetch;

    await processStripeEvent(fixture.db, {
      id: "evt_new_created_first",
      type: "customer.subscription.created",
      created: 250,
      data: {
        object: {
          id: "sub_new_generation",
          customer: "cus_new_generation",
          status: "trialing",
          metadata: { orgId: "org-new-generation" },
        },
      },
    });
    await processStripeEvent(
      fixture.db,
      {
        id: "evt_new_checkout_second",
        type: "checkout.session.completed",
        created: 301,
        data: {
          object: {
            mode: "subscription",
            client_reference_id: "org-new-generation",
            customer: "cus_new_generation",
            subscription: "sub_new_generation",
            payment_status: "no_payment_required",
          },
        },
      },
      { STRIPE_SECRET_KEY: "sk_test", STRIPE_PRICE_GROWTH_ANNUAL: "price_growth" } as never,
    );

    expect(fixture.updates.at(-1)).toMatchObject({
      stripeSubscriptionId: "sub_new_generation",
      subscriptionStatus: "trialing",
      trialEndsAt: new Date(900_000),
      planTier: "growth",
      billingCycle: "annual",
      stripeStateEventId: "evt_new_checkout_second",
    });
    expect(fixture.updates).not.toContainEqual(
      expect.objectContaining({
        stripeSubscriptionId: "sub_new_generation",
        stripeStateEventId: "evt_new_created_first",
      }),
    );
  });

  it("keeps a newer Checkout generation when its older created event arrives afterward", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-checkout-generation",
      stripeCustomerId: "cus_checkout_generation",
      stripeSubscriptionId: "sub_old",
      subscriptionStatus: "canceled",
      stripeStateEventCreatedAt: new Date(300_000),
      stripeStateEventId: "evt_old_deleted",
      stripeStateEventPriority: 100,
    });

    globalThis.fetch = vi.fn((input: string | URL | Request) => {
      const isIncoming = String(input).endsWith("/sub_new");
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            id: isIncoming ? "sub_new" : "sub_old",
            customer: "cus_checkout_generation",
            status: isIncoming ? "trialing" : "canceled",
            created: isIncoming ? 200 : 100,
            items: { data: [] },
          }),
      });
    }) as unknown as typeof fetch;

    await processStripeEvent(
      fixture.db,
      {
        id: "evt_checkout_generation",
        type: "checkout.session.completed",
        created: 400,
        data: {
          object: {
            mode: "subscription",
            client_reference_id: "org-checkout-generation",
            customer: "cus_checkout_generation",
            subscription: "sub_new",
            payment_status: "no_payment_required",
          },
        },
      },
      { STRIPE_SECRET_KEY: "sk_test" } as never,
    );
    await processStripeEvent(fixture.db, {
      id: "evt_created_older_generation",
      type: "customer.subscription.created",
      created: 350,
      data: {
        object: {
          id: "sub_new",
          customer: "cus_checkout_generation",
          status: "active",
        },
      },
    });

    expect(fixture.updates.at(-1)).toMatchObject({
      stripeSubscriptionId: "sub_new",
      subscriptionStatus: "trialing",
      stripeStateEventId: "evt_checkout_generation",
    });
  });

  it("ignores a delayed older Checkout instead of rewinding a newer active generation", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-delayed-checkout",
      stripeCustomerId: "cus_delayed_checkout",
      stripeSubscriptionId: "sub_current_newer",
      subscriptionStatus: "active",
      stripeStateEventCreatedAt: new Date(600_000),
      stripeStateEventId: "evt_current_generation",
      stripeStateEventPriority: 60,
    });
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const isIncoming = String(input).endsWith("/sub_abandoned_older");
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            id: isIncoming ? "sub_abandoned_older" : "sub_current_newer",
            customer: "cus_delayed_checkout",
            status: "active",
            created: isIncoming ? 100 : 200,
            trial_end: null,
            items: { data: [] },
          }),
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await processStripeEvent(
      fixture.db,
      {
        id: "evt_delayed_old_checkout",
        type: "checkout.session.completed",
        created: 500,
        data: {
          object: {
            mode: "subscription",
            client_reference_id: "org-delayed-checkout",
            customer: "cus_delayed_checkout",
            subscription: "sub_abandoned_older",
            payment_status: "paid",
          },
        },
      },
      { STRIPE_SECRET_KEY: "sk_test" } as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fixture.updates).toHaveLength(0);
    expect(fixture.inserts).toHaveLength(0);
  });

  it("accepts a demonstrably newer Checkout transition from an active generation", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-fresh-checkout",
      stripeCustomerId: "cus_fresh_checkout",
      stripeSubscriptionId: "sub_current",
      subscriptionStatus: "active",
      stripeStateEventCreatedAt: new Date(500_000),
      stripeStateEventId: "evt_current",
      stripeStateEventPriority: 60,
    });
    globalThis.fetch = vi.fn((input: string | URL | Request) => {
      const isIncoming = String(input).endsWith("/sub_fresh");
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            id: isIncoming ? "sub_fresh" : "sub_current",
            customer: "cus_fresh_checkout",
            status: isIncoming ? "trialing" : "active",
            created: isIncoming ? 200 : 100,
            trial_end: 900,
            items: { data: [] },
          }),
      });
    }) as unknown as typeof fetch;

    await processStripeEvent(
      fixture.db,
      {
        id: "evt_fresh_checkout",
        type: "checkout.session.completed",
        created: 600,
        data: {
          object: {
            mode: "subscription",
            client_reference_id: "org-fresh-checkout",
            customer: "cus_fresh_checkout",
            subscription: "sub_fresh",
            payment_status: "no_payment_required",
          },
        },
      },
      { STRIPE_SECRET_KEY: "sk_test" } as never,
    );

    expect(fixture.updates.at(-1)).toMatchObject({
      stripeSubscriptionId: "sub_fresh",
      subscriptionStatus: "trialing",
      trialEndsAt: new Date(900_000),
    });
  });

  it("accepts a same-second replacement when the current subscription is terminal and the incoming subscription is live", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-same-second-terminal-replacement",
      stripeCustomerId: "cus_same_second_terminal_replacement",
      stripeSubscriptionId: "sub_terminal",
      subscriptionStatus: "canceled",
      stripeStateEventCreatedAt: new Date(500_000),
      stripeStateEventId: "evt_terminal",
      stripeStateEventPriority: 100,
    });
    globalThis.fetch = vi.fn((input: string | URL | Request) => {
      const isIncoming = String(input).endsWith("/sub_live");
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            id: isIncoming ? "sub_live" : "sub_terminal",
            customer: "cus_same_second_terminal_replacement",
            status: isIncoming ? "active" : "canceled",
            created: 200,
            trial_end: null,
            items: { data: [] },
          }),
      });
    }) as unknown as typeof fetch;

    await processStripeEvent(
      fixture.db,
      {
        id: "evt_same_second_terminal_replacement",
        type: "checkout.session.completed",
        created: 600,
        data: {
          object: {
            mode: "subscription",
            client_reference_id: "org-same-second-terminal-replacement",
            customer: "cus_same_second_terminal_replacement",
            subscription: "sub_live",
            payment_status: "paid",
          },
        },
      },
      { STRIPE_SECRET_KEY: "sk_test" } as never,
    );

    expect(fixture.updates.at(-1)).toMatchObject({
      stripeSubscriptionId: "sub_live",
      subscriptionStatus: "active",
      trialEndsAt: null,
    });
  });

  it.each([
    ["canceled", "incomplete", "incomplete"],
    ["canceled", "past_due", "past_due"],
    ["incomplete_expired", "trialing", "trialing"],
    ["incomplete_expired", "paused", "past_due"],
    ["incomplete_expired", "unpaid", "past_due"],
  ] as const)(
    "adopts a same-second %s replacement in %s without granting active access, then accepts its active update",
    async (currentStatus, incomingStatus, expectedStatus) => {
      const fixture = buildDb();
      const orgId = `org-same-second-${incomingStatus}`;
      const customerId = `cus_same_second_${incomingStatus}`;
      const subscriptionId = `sub_same_second_${incomingStatus}`;
      fixture.setOrgLookup({
        id: orgId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: "sub_terminal",
        subscriptionStatus: currentStatus === "canceled" ? "canceled" : "past_due",
        stripeStateEventCreatedAt: new Date(500_000),
        stripeStateEventId: "evt_terminal",
        stripeStateEventPriority: 100,
      });
      globalThis.fetch = vi.fn((input: string | URL | Request) => {
        const isIncoming = String(input).endsWith(`/${subscriptionId}`);
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: isIncoming ? subscriptionId : "sub_terminal",
              customer: customerId,
              status: isIncoming ? incomingStatus : currentStatus,
              created: 200,
              trial_end: null,
              items: { data: [] },
            }),
        });
      }) as unknown as typeof fetch;

      await processStripeEvent(
        fixture.db,
        {
          id: `evt_checkout_${incomingStatus}`,
          type: "checkout.session.completed",
          created: 600,
          data: {
            object: {
              mode: "subscription",
              client_reference_id: orgId,
              customer: customerId,
              subscription: subscriptionId,
              payment_status: "paid",
            },
          },
        },
        { STRIPE_SECRET_KEY: "sk_test" } as never,
      );

      expect(fixture.updates.at(-1)).toMatchObject({
        stripeSubscriptionId: subscriptionId,
        subscriptionStatus: expectedStatus,
      });
      expect(fixture.updates.at(-1)).not.toMatchObject({ subscriptionStatus: "active" });

      await processStripeEvent(fixture.db, {
        id: `evt_subscription_active_${incomingStatus}`,
        type: "customer.subscription.updated",
        created: 601,
        data: {
          object: {
            id: subscriptionId,
            customer: customerId,
            status: "active",
            created: 200,
            trial_end: null,
            items: { data: [] },
          },
        },
      });

      expect(fixture.updates.at(-1)).toMatchObject({
        stripeSubscriptionId: subscriptionId,
        subscriptionStatus: "active",
        stripeStateEventId: `evt_subscription_active_${incomingStatus}`,
      });
    },
  );

  it("rejects an ambiguous same-second active-to-active replacement", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-same-second-active-replacement",
      stripeCustomerId: "cus_same_second_active_replacement",
      stripeSubscriptionId: "sub_current_active",
      subscriptionStatus: "active",
      stripeStateEventCreatedAt: new Date(500_000),
      stripeStateEventId: "evt_current_active",
      stripeStateEventPriority: 60,
    });
    globalThis.fetch = vi.fn((input: string | URL | Request) => {
      const isIncoming = String(input).endsWith("/sub_incoming_active");
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            id: isIncoming ? "sub_incoming_active" : "sub_current_active",
            customer: "cus_same_second_active_replacement",
            status: "active",
            created: 200,
            trial_end: null,
            items: { data: [] },
          }),
      });
    }) as unknown as typeof fetch;

    await processStripeEvent(
      fixture.db,
      {
        id: "evt_same_second_active_replacement",
        type: "checkout.session.completed",
        created: 600,
        data: {
          object: {
            mode: "subscription",
            client_reference_id: "org-same-second-active-replacement",
            customer: "cus_same_second_active_replacement",
            subscription: "sub_incoming_active",
            payment_status: "paid",
          },
        },
      },
      { STRIPE_SECRET_KEY: "sk_test" } as never,
    );

    expect(fixture.updates).toHaveLength(0);
    expect(fixture.inserts).toHaveLength(0);
  });

  it.each([500, 600])(
    "accepts a canonically newer Checkout at event time %i despite an active 600-second watermark",
    async (checkoutEventCreated) => {
      const fixture = buildDb();
      fixture.setOrgLookup({
        id: "org-late-valid-checkout",
        stripeCustomerId: "cus_late_valid_checkout",
        stripeSubscriptionId: "sub_old_active",
        subscriptionStatus: "active",
        stripeStateEventCreatedAt: new Date(600_000),
        stripeStateEventId: "evt_old_active",
        stripeStateEventPriority: 60,
      });
      const fetchMock = vi.fn((input: string | URL | Request) => {
        const isIncoming = String(input).endsWith("/sub_new_active");
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: isIncoming ? "sub_new_active" : "sub_old_active",
              customer: "cus_late_valid_checkout",
              status: "active",
              created: isIncoming ? 200 : 100,
              items: { data: [] },
            }),
        });
      });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      await processStripeEvent(
        fixture.db,
        {
          id: `evt_late_valid_checkout_${checkoutEventCreated}`,
          type: "checkout.session.completed",
          created: checkoutEventCreated,
          data: {
            object: {
              mode: "subscription",
              client_reference_id: "org-late-valid-checkout",
              customer: "cus_late_valid_checkout",
              subscription: "sub_new_active",
              payment_status: "paid",
            },
          },
        },
        { STRIPE_SECRET_KEY: "sk_test" } as never,
      );

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fixture.updates.at(-1)).toMatchObject({
        stripeSubscriptionId: "sub_new_active",
        subscriptionStatus: "active",
      });
    },
  );

  it("accepts a canonically newer Checkout replacement for a legacy active generation", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-legacy-newer-checkout",
      stripeCustomerId: "cus_legacy_newer_checkout",
      stripeSubscriptionId: "sub_legacy_current",
      subscriptionStatus: "active",
      stripeStateEventCreatedAt: null,
      stripeStateEventPriority: null,
    });
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);
      const isIncoming = url.endsWith("/sub_legacy_newer");
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            id: isIncoming ? "sub_legacy_newer" : "sub_legacy_current",
            customer: "cus_legacy_newer_checkout",
            status: "active",
            created: isIncoming ? 300 : 200,
            trial_end: null,
            items: { data: [] },
          }),
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await processStripeEvent(
      fixture.db,
      {
        id: "evt_legacy_newer_checkout",
        type: "checkout.session.completed",
        created: 400,
        data: {
          object: {
            mode: "subscription",
            client_reference_id: "org-legacy-newer-checkout",
            customer: "cus_legacy_newer_checkout",
            subscription: "sub_legacy_newer",
            payment_status: "paid",
          },
        },
      },
      { STRIPE_SECRET_KEY: "sk_test" } as never,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("sub_legacy_current"),
      expect.anything(),
    );
    expect(fixture.updates.at(-1)).toMatchObject({
      stripeSubscriptionId: "sub_legacy_newer",
      subscriptionStatus: "active",
    });
  });

  it("ignores a canonically older delayed Checkout for a legacy active generation", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-legacy-delayed-checkout",
      stripeCustomerId: "cus_legacy_delayed_checkout",
      stripeSubscriptionId: "sub_legacy_current_newer",
      subscriptionStatus: "active",
      stripeStateEventCreatedAt: null,
      stripeStateEventPriority: null,
    });
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);
      const isIncoming = url.endsWith("/sub_legacy_older");
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            id: isIncoming ? "sub_legacy_older" : "sub_legacy_current_newer",
            customer: "cus_legacy_delayed_checkout",
            status: "active",
            created: isIncoming ? 100 : 200,
            items: { data: [] },
          }),
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await processStripeEvent(
      fixture.db,
      {
        id: "evt_legacy_delayed_checkout",
        type: "checkout.session.completed",
        created: 500,
        data: {
          object: {
            mode: "subscription",
            client_reference_id: "org-legacy-delayed-checkout",
            customer: "cus_legacy_delayed_checkout",
            subscription: "sub_legacy_older",
            payment_status: "paid",
          },
        },
      },
      { STRIPE_SECRET_KEY: "sk_test" } as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fixture.updates).toHaveLength(0);
    expect(fixture.inserts).toHaveLength(0);
  });

  it("does not revive an older canceled subscription after the newer generation is canceled", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-terminal-delayed-checkout",
      stripeCustomerId: "cus_terminal_delayed_checkout",
      stripeSubscriptionId: "sub_newer_canceled",
      subscriptionStatus: "canceled",
      stripeStateEventCreatedAt: new Date(600_000),
      stripeStateEventPriority: 100,
    });
    globalThis.fetch = vi.fn((input: string | URL | Request) => {
      const url = String(input);
      const isIncoming = url.endsWith("/sub_older_canceled");
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            id: isIncoming ? "sub_older_canceled" : "sub_newer_canceled",
            customer: "cus_terminal_delayed_checkout",
            status: "canceled",
            created: isIncoming ? 100 : 200,
            items: { data: [] },
          }),
      });
    }) as unknown as typeof fetch;

    await processStripeEvent(
      fixture.db,
      {
        id: "evt_terminal_delayed_checkout",
        type: "checkout.session.completed",
        created: 700,
        data: {
          object: {
            mode: "subscription",
            client_reference_id: "org-terminal-delayed-checkout",
            customer: "cus_terminal_delayed_checkout",
            subscription: "sub_older_canceled",
            payment_status: "paid",
          },
        },
      },
      { STRIPE_SECRET_KEY: "sk_test" } as never,
    );

    expect(fixture.updates).toHaveLength(0);
    expect(fixture.inserts).toHaveLength(0);
  });

  it("lets same-second Checkout start a new generation after the old subscription was deleted", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-same-second-generation",
      stripeCustomerId: "cus_same_second_generation",
      stripeSubscriptionId: "sub_old",
      subscriptionStatus: "canceled",
      stripeStateEventCreatedAt: new Date(500_000),
      stripeStateEventId: "evt_old_deleted_same_second",
      stripeStateEventPriority: 100,
    });

    globalThis.fetch = vi.fn((input: string | URL | Request) => {
      const isIncoming = String(input).endsWith("/sub_new");
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            id: isIncoming ? "sub_new" : "sub_old",
            customer: "cus_same_second_generation",
            status: isIncoming ? "active" : "canceled",
            created: isIncoming ? 200 : 100,
            items: { data: [] },
          }),
      });
    }) as unknown as typeof fetch;

    await processStripeEvent(
      fixture.db,
      {
        id: "evt_checkout_new_same_second",
        type: "checkout.session.completed",
        created: 500,
        data: {
          object: {
            mode: "subscription",
            client_reference_id: "org-same-second-generation",
            customer: "cus_same_second_generation",
            subscription: "sub_new",
            payment_status: "paid",
          },
        },
      },
      { STRIPE_SECRET_KEY: "sk_test" } as never,
    );

    expect(fixture.updates.at(-1)).toMatchObject({
      stripeSubscriptionId: "sub_new",
      subscriptionStatus: "active",
      stripeStateEventId: "evt_checkout_new_same_second",
    });
  });

  it("reconciles checkout then subscription.created in the same second from the current Stripe object", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-checkout-created",
      stripeCustomerId: "cus_checkout_created",
    });
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "sub_checkout_created",
          customer: "cus_checkout_created",
          status: "trialing",
          trial_end: 900,
          items: { data: [{ price: { id: "price_growth", recurring: { interval: "year" } } }] },
        }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const bindings = {
      STRIPE_SECRET_KEY: "sk_test",
      STRIPE_PRICE_GROWTH_ANNUAL: "price_growth",
    } as never;

    try {
      await processStripeEvent(
        fixture.db,
        {
          id: "evt_checkout_same_second",
          type: "checkout.session.completed",
          created: 600,
          data: {
            object: {
              mode: "subscription",
              client_reference_id: "org-checkout-created",
              customer: "cus_checkout_created",
              subscription: "sub_checkout_created",
              payment_status: "no_payment_required",
              metadata: { planTier: "starter", billingCycle: "monthly" },
            },
          },
        },
        bindings,
      );
      await processStripeEvent(
        fixture.db,
        {
          id: "evt_created_same_second",
          type: "customer.subscription.created",
          created: 600,
          data: {
            object: {
              id: "sub_checkout_created",
              customer: "cus_checkout_created",
              status: "trialing",
            },
          },
        },
        bindings,
      );

      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.stripe.com/v1/subscriptions/sub_checkout_created",
        expect.objectContaining({ headers: { Authorization: "Bearer sk_test" } }),
      );
      expect(fixture.updates.at(-1)).toMatchObject({
        subscriptionStatus: "trialing",
        trialEndsAt: new Date(900_000),
        planTier: "growth",
        billingCycle: "annual",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("reconciles subscription.created then checkout without losing subscription state", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-created-checkout",
      stripeCustomerId: "cus_created_checkout",
      stripeSubscriptionId: "sub_created_checkout",
    });
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "sub_created_checkout",
          customer: "cus_created_checkout",
          status: "trialing",
          trial_end: 1_200,
          items: { data: [{ price: { id: "price_growth", recurring: { interval: "year" } } }] },
        }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const bindings = {
      STRIPE_SECRET_KEY: "sk_test",
      STRIPE_PRICE_GROWTH_ANNUAL: "price_growth",
    } as never;

    try {
      await processStripeEvent(
        fixture.db,
        {
          id: "evt_created_first",
          type: "customer.subscription.created",
          created: 900,
          data: {
            object: {
              id: "sub_created_checkout",
              customer: "cus_created_checkout",
              status: "trialing",
              trial_end: 1_200,
              items: { data: [{ price: { id: "price_growth" } }] },
            },
          },
        },
        bindings,
      );
      await processStripeEvent(
        fixture.db,
        {
          id: "evt_checkout_second",
          type: "checkout.session.completed",
          created: 900,
          data: {
            object: {
              mode: "subscription",
              client_reference_id: "org-created-checkout",
              customer: "cus_created_checkout",
              subscription: "sub_created_checkout",
              payment_status: "no_payment_required",
              metadata: { promoCode: "Y80OFF", planTier: "starter" },
            },
          },
        },
        bindings,
      );

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fixture.updates.at(-1)).toMatchObject({
        stripeCustomerId: "cus_created_checkout",
        stripeSubscriptionId: "sub_created_checkout",
        subscriptionStatus: "trialing",
        trialEndsAt: new Date(1_200_000),
        planTier: "growth",
        billingCycle: "annual",
        promoCodeApplied: "Y80OFF",
        planSelectedAt: expect.any(Date),
      });
      expect(analyticsInserts(fixture.inserts).map((row) => row.eventName)).toContain(
        ANALYTICS_EVENTS.checkoutCompleted,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("reconciles same-second active plan changes to Stripe's current subscription", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-plan-change",
      stripeCustomerId: "cus_plan_change",
      stripeSubscriptionId: "sub_plan_change",
    });
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "sub_plan_change",
          customer: "cus_plan_change",
          status: "active",
          trial_end: null,
          items: { data: [{ price: { id: "price_growth", recurring: { interval: "year" } } }] },
        }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const bindings = {
      STRIPE_SECRET_KEY: "sk_test",
      STRIPE_PRICE_STARTER_MONTHLY: "price_starter",
      STRIPE_PRICE_GROWTH_ANNUAL: "price_growth",
    } as never;

    try {
      for (const [id, price] of [
        ["evt_plan_starter", "price_starter"],
        ["evt_plan_growth", "price_growth"],
      ] as const) {
        await processStripeEvent(
          fixture.db,
          {
            id,
            type: "customer.subscription.updated",
            created: 700,
            data: {
              object: {
                id: "sub_plan_change",
                customer: "cus_plan_change",
                status: "active",
                items: { data: [{ price: { id } }] },
                metadata: { planTier: price === "price_growth" ? "growth" : "starter" },
              },
            },
          },
          bindings,
        );
      }

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fixture.updates.at(-1)).toMatchObject({
        subscriptionStatus: "active",
        planTier: "growth",
        billingCycle: "annual",
        trialEndsAt: null,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("retries when a concurrent reconciliation changes the CAS generation", async () => {
    const fixture = buildDb();
    const original = {
      id: "org-reconcile-race",
      stripeCustomerId: "cus_reconcile_race",
      stripeSubscriptionId: "sub_reconcile_race",
      subscriptionStatus: "active",
      planTier: "starter",
      stripeStateEventCreatedAt: new Date(700_000),
      stripeStateEventId: "evt_generation_original",
      stripeStateEventPriority: 80,
    };
    fixture.setOrgLookup(original);
    fixture.setNextUpdateMissOrgLookup({
      ...original,
      planTier: "growth",
      stripeStateEventId: "evt_generation_winner",
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "sub_reconcile_race",
          customer: "cus_reconcile_race",
          status: "active",
          items: { data: [{ price: { id: "price_starter" } }] },
        }),
    }) as unknown as typeof fetch;

    await expect(
      processStripeEvent(
        fixture.db,
        {
          id: "evt_generation_loser",
          type: "customer.subscription.updated",
          created: 600,
          data: {
            object: {
              id: "sub_reconcile_race",
              customer: "cus_reconcile_race",
              status: "active",
            },
          },
        },
        {
          STRIPE_SECRET_KEY: "sk_test",
          STRIPE_PRICE_STARTER_MONTHLY: "price_starter",
        } as never,
      ),
    ).rejects.toThrow("Stripe billing state changed during reconciliation");
    expect(fixture.updates).toHaveLength(0);
  });

  it.each([
    ["invoice.payment_succeeded", "subscription_cycle"],
    ["invoice.payment_failed", "subscription_update"],
  ] as const)(
    "retries %s when its reconciled generation CAS loses",
    async (type, billingReason) => {
      const fixture = buildDb();
      const original = {
        id: "org-invoice-generation-race",
        stripeCustomerId: "cus_invoice_generation_race",
        stripeSubscriptionId: "sub_invoice_generation_race",
        subscriptionStatus: "active",
        stripeStateEventCreatedAt: new Date(900_000),
        stripeStateEventId: "evt_invoice_generation_original",
        stripeStateEventPriority: 80,
      };
      fixture.setOrgLookup(original);
      fixture.setNextUpdateMissOrgLookup({
        ...original,
        stripeStateEventId: "evt_invoice_generation_winner",
      });
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "sub_invoice_generation_race",
            customer: "cus_invoice_generation_race",
            status: "active",
            items: { data: [] },
          }),
      }) as unknown as typeof fetch;

      await expect(
        processStripeEvent(
          fixture.db,
          {
            id: `evt_${type}_generation_loser`,
            type,
            created: 800,
            data: {
              object: {
                customer: "cus_invoice_generation_race",
                subscription: "sub_invoice_generation_race",
                billing_reason: billingReason,
              },
            },
          },
          { STRIPE_SECRET_KEY: "sk_test" } as never,
        ),
      ).rejects.toThrow("Stripe billing state changed during reconciliation");
    },
  );

  it("safely leaves an equal-priority collision unchanged when Stripe reconciliation is unavailable", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-no-stripe-config",
      stripeCustomerId: "cus_no_stripe_config",
      stripeSubscriptionId: "sub_no_stripe_config",
      subscriptionStatus: "trialing",
      stripeStateEventCreatedAt: new Date(800_000),
      stripeStateEventId: "evt_checkout_existing",
      stripeStateEventPriority: 70,
    });
    const fetchMock = vi.fn();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      await expect(
        processStripeEvent(fixture.db, {
          id: "evt_created_no_config",
          type: "customer.subscription.created",
          created: 800,
          data: {
            object: {
              id: "sub_no_stripe_config",
              customer: "cus_no_stripe_config",
              status: "trialing",
              trial_end: 1_000,
            },
          },
        }),
      ).rejects.toThrow("Stripe subscription reconciliation unavailable");

      expect(fetchMock).not.toHaveBeenCalled();
      expect(fixture.updates).toHaveLength(0);
      expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Stripe subscription reconciliation unavailable" }),
        "billing",
        expect.objectContaining({ reason: "missing_stripe_secret" }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("ignores newer subscription deletions for an old subscription on the same customer", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-current-subscription",
      stripeCustomerId: "cus_current_subscription",
      stripeSubscriptionId: "sub_new_current",
      subscriptionStatus: "active",
    });

    await processStripeEvent(
      fixture.db,
      {
        id: "evt_old_sub_deleted_newer",
        type: "customer.subscription.deleted",
        created: 301,
        data: {
          object: {
            id: "sub_old_replayed",
            customer: "cus_current_subscription",
            metadata: { orgId: "org-current-subscription" },
          },
        },
      },
      analyticsBindings,
    );

    expect(fixture.updates).toHaveLength(0);
    expect(analyticsInserts(fixture.inserts)).toHaveLength(0);
  });

  it("requires canonical reconciliation for same-second events instead of event id ordering", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-tie",
      stripeCustomerId: "cus_tie",
      stripeSubscriptionId: "sub_tie",
      stripeStateEventCreatedAt: new Date(200 * 1000),
      stripeStateEventId: "evt_z_newer",
      stripeStateEventPriority: 100,
      subscriptionStatus: "canceled",
    });

    await expect(
      processStripeEvent(fixture.db, {
        id: "evt_a_older_tie",
        type: "customer.subscription.updated",
        created: 200,
        data: {
          object: {
            id: "sub_tie",
            customer: "cus_tie",
            status: "active",
            metadata: { orgId: "org-tie" },
          },
        },
      }),
    ).rejects.toThrow("Stripe subscription reconciliation unavailable");

    expect(fixture.updates).toHaveLength(0);
  });

  it("lets same-second cancellation dominate payment failure regardless of event id order", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-same-second-cancel",
      stripeCustomerId: "cus_same_second_cancel",
      stripeSubscriptionId: "sub_same_second_cancel",
      subscriptionStatus: "active",
      stripeStateEventCreatedAt: new Date(499 * 1000),
      stripeStateEventPriority: 60,
    });

    await processStripeEvent(fixture.db, {
      id: "evt_z_payment_failed",
      type: "invoice.payment_failed",
      created: 500,
      data: {
        object: {
          customer: "cus_same_second_cancel",
          subscription: "sub_same_second_cancel",
          billing_reason: "subscription_cycle",
        },
      },
    });
    await processStripeEvent(fixture.db, {
      id: "evt_a_deleted",
      type: "customer.subscription.deleted",
      created: 500,
      data: {
        object: {
          id: "sub_same_second_cancel",
          customer: "cus_same_second_cancel",
        },
      },
    });

    expect(fixture.updates.at(-1)).toMatchObject({ subscriptionStatus: "canceled" });
  });

  it("ignores invoice.payment_succeeded for canceled subscriptions", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-canceled-invoice",
      stripeCustomerId: "cus_canceled_invoice",
      stripeSubscriptionId: "sub_canceled_invoice",
      subscriptionStatus: "canceled",
      stripeStateEventCreatedAt: new Date(200 * 1000),
      stripeStateEventId: "evt_cancel_invoice",
    });

    await processStripeEvent(
      fixture.db,
      {
        id: "evt_invoice_older_success",
        type: "invoice.payment_succeeded",
        created: 100,
        data: {
          object: {
            customer: "cus_canceled_invoice",
            subscription: "sub_canceled_invoice",
            billing_reason: "subscription_cycle",
            metadata: { orgId: "org-canceled-invoice", planTier: "growth" },
          },
        },
      },
      analyticsBindings,
    );

    expect(fixture.updates).toHaveLength(0);
    expect(analyticsInserts(fixture.inserts)).toHaveLength(0);
  });

  it("ignores invoice.payment_failed for non-current subscriptions", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-current-sub",
      stripeCustomerId: "cus_current_sub",
      stripeSubscriptionId: "sub_current",
      subscriptionStatus: "active",
    });

    await processStripeEvent(
      fixture.db,
      {
        id: "evt_invoice_old_sub_failed",
        type: "invoice.payment_failed",
        created: 300,
        data: {
          object: {
            customer: "cus_current_sub",
            subscription: "sub_old",
            billing_reason: "subscription_cycle",
            metadata: { orgId: "org-current-sub" },
          },
        },
      },
      analyticsBindings,
    );

    expect(fixture.updates).toHaveLength(0);
    expect(analyticsInserts(fixture.inserts)).toHaveLength(0);
  });

  it("emits payment_recovered analytics only after an accepted payment success webhook", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-recovered-analytics",
      stripeSubscriptionId: "sub_recovered",
      stripeStateEventCreatedAt: new Date(1_000),
      stripeStateEventPriority: 60,
    });
    const event = {
      id: "evt_inv_succ_analytics",
      type: "invoice.payment_succeeded",
      created: 2,
      data: {
        object: {
          customer: "cus_recovered",
          subscription: "sub_recovered",
          billing_reason: "subscription_cycle",
          amount_paid: 14900,
          customer_email: "billing@example.org",
          metadata: { orgId: "org-spoofed", planTier: "growth", billingCycle: "annual" },
        },
      },
    };
    await processStripeEvent(fixture.db, event, analyticsBindings);

    expect(analyticsInserts(fixture.inserts)[0]).toMatchObject({
      orgId: "org-recovered-analytics",
      eventName: ANALYTICS_EVENTS.paymentRecovered,
      payload: {
        org_id: "org-recovered-analytics",
        plan_tier: "growth",
        billing_cycle: "annual",
        subscription_status: "active",
        stripe_event_type: "invoice.payment_succeeded",
        amount_cents: 14900,
        environment: "production",
      },
    });

    const serialized = JSON.stringify(analyticsInserts(fixture.inserts)[0]);
    expect(serialized).not.toContain("billing@example.org");
    expect(serialized).not.toContain("cus_recovered");
    expect(serialized).not.toContain("sub_recovered");

    await expectNoDuplicateAnalytics(fixture, event);
  });

  it("handles invoice.payment_succeeded via customer lookup when metadata is missing", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-recovered-from-customer",
      stripeSubscriptionId: "sub_recovered",
      stripeStateEventCreatedAt: new Date(1_000),
      stripeStateEventPriority: 60,
    });
    const event = {
      id: "evt_inv_succ_customer",
      type: "invoice.payment_succeeded",
      created: 2,
      data: {
        object: {
          customer: "cus_recovered",
          subscription: "sub_recovered",
          billing_reason: "subscription_update",
          metadata: {},
        },
      },
    };
    await processStripeEvent(fixture.db, event, analyticsBindings);
    expect(fixture.updates[0]).toMatchObject({ subscriptionStatus: "active" });
    expect(analyticsInserts(fixture.inserts)[0]).toMatchObject({
      orgId: "org-recovered-from-customer",
    });
  });

  it("uses customer subscription lookup over conflicting invoice.payment_succeeded metadata", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-from-customer-subscription",
      stripeSubscriptionId: "sub_real",
      stripeStateEventCreatedAt: new Date(1_000),
      stripeStateEventPriority: 60,
    });
    const event = {
      id: "evt_inv_succ_spoof",
      type: "invoice.payment_succeeded",
      created: 2,
      data: {
        object: {
          customer: "cus_real",
          subscription: "sub_real",
          billing_reason: "subscription_cycle",
          metadata: { orgId: "org-spoofed" },
        },
      },
    };
    await processStripeEvent(fixture.db, event, analyticsBindings);
    expect(fixture.updates[0]).toMatchObject({ subscriptionStatus: "active" });
    expect(analyticsInserts(fixture.inserts)[0]).toMatchObject({
      orgId: "org-from-customer-subscription",
    });
  });

  it("ignores invoice.payment_succeeded when customer subscription lookup misses", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup(undefined);
    await processStripeEvent(fixture.db, {
      id: "evt_inv_succ_no_org",
      type: "invoice.payment_succeeded",
      data: {
        object: {
          customer: "cus_unknown",
          subscription: "sub_unknown",
          billing_reason: "subscription_cycle",
          metadata: {},
        },
      },
    });
    expect(fixture.updates).toHaveLength(0);
    expect(analyticsInserts(fixture.inserts)).toHaveLength(0);
  });

  it("ignores invoice.payment_succeeded for non-subscription invoices", async () => {
    const fixture = buildDb();
    await processStripeEvent(fixture.db, {
      id: "evt_inv_succ_manual",
      type: "invoice.payment_succeeded",
      data: {
        object: {
          billing_reason: "manual",
          metadata: { orgId: "org-manual" },
        },
      },
    });
    expect(fixture.updates).toHaveLength(0);
    expect(analyticsInserts(fixture.inserts)).toHaveLength(0);
  });

  it("ignores initial invoice.payment_succeeded subscription_create events", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({ id: "org-create" });
    await processStripeEvent(fixture.db, {
      id: "evt_inv_succ_create",
      type: "invoice.payment_succeeded",
      data: {
        object: {
          customer: "cus_create",
          subscription: "sub_create",
          billing_reason: "subscription_create",
          amount_paid: 0,
          metadata: { orgId: "org-create" },
        },
      },
    });
    expect(fixture.updates).toHaveLength(0);
    expect(analyticsInserts(fixture.inserts)).toHaveLength(0);
  });

  it("ignores invoice.payment_succeeded when a subscription id is absent", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({ id: "org-no-sub" });
    await processStripeEvent(fixture.db, {
      id: "evt_inv_succ_no_sub",
      type: "invoice.payment_succeeded",
      data: {
        object: {
          customer: "cus_no_sub",
          billing_reason: "subscription_cycle",
          metadata: { orgId: "org-no-sub" },
        },
      },
    });
    expect(fixture.updates).toHaveLength(0);
    expect(analyticsInserts(fixture.inserts)).toHaveLength(0);
  });

  it("skips org mutation for duplicate invoice.payment_succeeded event (idempotency)", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-inv-succ-dup",
      stripeSubscriptionId: "sub_dup",
      stripeStateEventCreatedAt: new Date(1_000),
      stripeStateEventPriority: 60,
    });
    const event = {
      id: "evt_inv_succ_dup",
      type: "invoice.payment_succeeded",
      created: 2,
      data: {
        object: {
          customer: "cus_dup",
          subscription: "sub_dup",
          billing_reason: "subscription_cycle",
          metadata: { orgId: "org-inv-succ-dup" },
        },
      },
    };
    await processStripeEvent(fixture.db, event);
    expect(fixture.updates).toHaveLength(1);

    fixture.setNextInsertConflict(true);
    fixture.updates.length = 0;
    await processStripeEvent(fixture.db, event);
    expect(fixture.updates).toHaveLength(0);
  });

  it("ignores unknown event types without errors", async () => {
    const { db, updates, inserts } = buildDb();
    await processStripeEvent(db, {
      id: "evt_10",
      type: "ping",
      data: { object: {} },
    });
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it("ignores checkout.session.completed events without orgId", async () => {
    const { db, updates } = buildDb();
    await processStripeEvent(db, {
      id: "evt_11",
      type: "checkout.session.completed",
      data: { object: { metadata: {} } },
    });
    expect(updates).toHaveLength(0);
  });

  // Bug #15 — idempotency: duplicate event must not apply org mutation a second time
  it("skips org mutation when the same event id is received a second time (idempotency)", async () => {
    const fixture = buildDb();
    const event = {
      id: "evt_dup",
      type: "customer.subscription.updated",
      data: {
        object: { status: "active", metadata: { orgId: "org-dup" } },
      },
    };
    // First call — not a conflict, mutation should happen
    await processStripeEvent(fixture.db, event);
    expect(fixture.updates).toHaveLength(1);

    // Simulate Stripe retry: the insert now conflicts (already seen)
    fixture.setNextInsertConflict(true);
    fixture.updates.length = 0; // clear so we can assert nothing new is written

    await processStripeEvent(fixture.db, event);
    expect(fixture.updates).toHaveLength(0);
  });

  // Bug #16 — resolveOrgIdForSubscription must query DB by customer first
  it("resolves orgId via customer DB lookup even when metadata.orgId is present", async () => {
    const fixture = buildDb();
    // DB returns an org for the customer
    fixture.setOrgLookup({ id: "org-from-db" });
    await processStripeEvent(fixture.db, {
      id: "evt_b16",
      type: "customer.subscription.updated",
      data: {
        object: {
          status: "active",
          customer: "cus_real",
          metadata: { orgId: "org-spoofed" },
        },
      },
    });
    // The update must target org-from-db (the DB-resolved org), not org-spoofed
    expect(fixture.findFirstMock).toHaveBeenCalled();
    // The update should still happen (org exists)
    expect(fixture.updates).toHaveLength(1);
    // Verify the audit insert used the DB-resolved orgId, not the spoofed one
    expect(fixture.inserts[0]).toMatchObject({ orgId: "org-from-db" });
  });

  // Bug #17 — checkout with payment_status "no_payment_required" → "trialing"
  it("sets subscriptionStatus to trialing when payment_status is no_payment_required", async () => {
    const { db, updates } = buildDb();
    await processStripeEvent(db, {
      id: "evt_b17",
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "subscription",
          client_reference_id: "org-trial",
          customer: "cus_trial",
          subscription: "sub_trial",
          payment_status: "no_payment_required",
          metadata: { planTier: "starter", billingCycle: "monthly" },
        },
      },
    });
    expect(updates[0]).toMatchObject({ subscriptionStatus: "trialing" });
  });

  it("does not mark checkout complete as active for unpaid payment statuses", async () => {
    const { db, updates } = buildDb();
    await processStripeEvent(db, {
      id: "evt_unpaid_checkout",
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "subscription",
          client_reference_id: "org-unpaid",
          customer: "cus_unpaid",
          subscription: "sub_unpaid",
          payment_status: "unpaid",
          metadata: { planTier: "growth", billingCycle: "monthly" },
        },
      },
    });
    expect(updates[0]).toMatchObject({ subscriptionStatus: "past_due" });
  });

  // Bug #18 — string trial_end must be normalized to a Date
  it("converts string trial_end to a Date for trialEndsAt", async () => {
    const { db, updates } = buildDb();
    await processStripeEvent(db, {
      id: "evt_b18",
      type: "customer.subscription.updated",
      data: {
        object: {
          status: "trialing",
          trial_end: "1700000000",
          metadata: { orgId: "org-b18" },
        },
      },
    });
    expect((updates[0] as { trialEndsAt: Date }).trialEndsAt).toBeInstanceOf(Date);
    expect((updates[0] as { trialEndsAt: Date }).trialEndsAt.getTime()).toBe(1700000000 * 1000);
  });

  // Important #1 — "NaN" string trial_end must not silently freeze the org in trial
  it("leaves trialEndsAt undefined when trial_end is the string 'NaN'", async () => {
    const { db, updates } = buildDb();
    await processStripeEvent(db, {
      id: "evt_nan_trial",
      type: "customer.subscription.updated",
      data: {
        object: {
          status: "active",
          trial_end: "NaN",
          metadata: { orgId: "org-nan-trial" },
        },
      },
    });
    expect((updates[0] as { trialEndsAt: unknown }).trialEndsAt).toBeUndefined();
  });

  // Important #1 — negative finite string trial_end is a valid unix timestamp
  it("converts negative string trial_end to a Date for trialEndsAt", async () => {
    const { db, updates } = buildDb();
    await processStripeEvent(db, {
      id: "evt_neg_trial",
      type: "customer.subscription.updated",
      data: {
        object: {
          status: "active",
          trial_end: "-100",
          metadata: { orgId: "org-neg-trial" },
        },
      },
    });
    // -100 is a valid finite number (negative unix seconds); trialEndsAt = new Date(-100 * 1000)
    expect((updates[0] as { trialEndsAt: Date }).trialEndsAt).toBeInstanceOf(Date);
    expect((updates[0] as { trialEndsAt: Date }).trialEndsAt.getTime()).toBe(-100 * 1000);
  });

  // Suggestion #5 — incomplete_expired must map to past_due
  it("maps incomplete_expired to past_due", async () => {
    const { db, updates } = buildDb();
    await processStripeEvent(db, {
      id: "evt_incomplete",
      type: "customer.subscription.updated",
      data: { object: { status: "incomplete_expired", metadata: { orgId: "org-x" } } },
    });
    expect(updates[0]).toMatchObject({ subscriptionStatus: "past_due" });
  });

  it("ignores customer.subscription.deleted when neither metadata nor customer match", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup(undefined);
    await processStripeEvent(fixture.db, {
      id: "evt_del_no_org",
      type: "customer.subscription.deleted",
      data: { object: { customer: "cus_gone", metadata: {} } },
    });
    expect(fixture.updates).toHaveLength(0);
  });

  it("skips org mutation for duplicate customer.subscription.deleted event (idempotency)", async () => {
    const fixture = buildDb();
    const event = {
      id: "evt_del_dup",
      type: "customer.subscription.deleted",
      data: { object: { metadata: { orgId: "org-del-dup" } } },
    };
    await processStripeEvent(fixture.db, event);
    expect(fixture.updates).toHaveLength(1);

    fixture.setNextInsertConflict(true);
    fixture.updates.length = 0;
    await processStripeEvent(fixture.db, event);
    expect(fixture.updates).toHaveLength(0);
  });

  it("skips org mutation for duplicate invoice.payment_failed event (idempotency)", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({
      id: "org-inv-dup",
      stripeSubscriptionId: "sub_inv_dup",
      stripeStateEventCreatedAt: new Date(1_000),
      stripeStateEventPriority: 60,
    });
    const event = {
      id: "evt_inv_dup",
      type: "invoice.payment_failed",
      created: 2,
      data: {
        object: {
          customer: "cus_inv",
          subscription: "sub_inv_dup",
          billing_reason: "subscription_cycle",
          metadata: { orgId: "org-inv-dup" },
        },
      },
    };
    await processStripeEvent(fixture.db, event);
    expect(fixture.updates).toHaveLength(1);

    fixture.setNextInsertConflict(true);
    fixture.updates.length = 0;
    await processStripeEvent(fixture.db, event);
    expect(fixture.updates).toHaveLength(0);
  });

  // Branch: normalizeSubscriptionStatus called with non-string status value
  it("leaves subscriptionStatus undefined when status is a non-string value", async () => {
    const { db, updates } = buildDb();
    await processStripeEvent(db, {
      id: "evt_num_status",
      type: "customer.subscription.updated",
      data: { object: { status: 42, metadata: { orgId: "org-num-status" } } },
    });
    expect(updates[0]).toMatchObject({ subscriptionStatus: undefined });
  });

  // Branch: subscription object has no metadata field at all (pickRecord returns undefined, ?? {} fallback)
  it("handles subscription with no metadata field gracefully", async () => {
    const { db, updates } = buildDb();
    await processStripeEvent(db, {
      id: "evt_no_meta",
      type: "customer.subscription.updated",
      // Omit metadata entirely — forces the `pickRecord(...) ?? {}` fallback
      data: {
        object: { status: "active", metadata: null, customer: undefined, orgId: "org-no-meta" },
      },
    });
    // orgId is on root object, not in metadata — resolveOrgIdForSubscription
    // looks in metadata (which is null here), so orgId will be null → no update
    expect(updates).toHaveLength(0);
  });

  // Branch: subscription.metadata is null but orgId resolved via customer DB lookup
  it("handles subscription.updated with null metadata when customer resolves orgId", async () => {
    const fixture = buildDb();
    fixture.setOrgLookup({ id: "org-null-meta" });
    await processStripeEvent(fixture.db, {
      id: "evt_null_meta_customer",
      type: "customer.subscription.updated",
      data: {
        object: {
          status: "active",
          customer: "cus_has_db_record",
          metadata: null, // pickRecord → undefined, ?? {} fires
        },
      },
    });
    expect(fixture.updates[0]).toMatchObject({ subscriptionStatus: "active" });
  });

  // Branch: checkout.session.completed with no customer/subscription/planTier/billingCycle
  it("ignores checkout.session.completed with missing subscription identity", async () => {
    const { db, updates } = buildDb();
    await processStripeEvent(db, {
      id: "evt_checkout_minimal",
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "subscription",
          client_reference_id: "org-minimal",
          // No customer, subscription, planTier, billingCycle — null coalescing branches
          metadata: {},
        },
      },
    });
    expect(updates).toHaveLength(0);
  });
});

describe("webhook transaction atomicity", () => {
  it("rolls back the audit event when the mutation throws (no partial state)", async () => {
    // Build a db where the transaction mock actually executes the callback but the
    // mutation (update) throws — the audit insert should be rolled back, meaning
    // it is NOT visible outside the transaction.
    const inserts: Record<string, unknown>[] = [];
    let nextInsertConflict = false;
    let updateCallCount = 0;

    const transactionalDb = {
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
      update: vi.fn().mockImplementation(() => ({
        set: vi.fn().mockImplementation(() => {
          updateCallCount += 1;
          throw new Error("DB mutation failure");
        }),
      })),
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((_val: Record<string, unknown>) => {
          const isConflict = nextInsertConflict;
          nextInsertConflict = false;
          return {
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue(isConflict ? [] : [{ id: "row-id" }]),
            }),
          };
        }),
      })),
      // The transaction callback runs synchronously; if it throws, we simulate
      // rollback by NOT pushing to `inserts` — the callback itself manages inserts
      // through the tx object which shares state here for test simplicity.
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        // We track inserts inside the transaction callback via the same mock,
        // but simulate rollback: if the callback throws, we do not commit.
        const committed: Record<string, unknown>[] = [];
        const txDb = {
          query: {
            organizations: {
              findFirst: vi.fn().mockResolvedValue(undefined),
            },
          },
          update: vi.fn().mockImplementation(() => ({
            set: vi.fn().mockImplementation(() => {
              updateCallCount += 1;
              throw new Error("DB mutation failure");
            }),
          })),
          insert: vi.fn().mockImplementation(() => ({
            values: vi.fn().mockImplementation((val: Record<string, unknown>) => {
              committed.push(val);
              return {
                onConflictDoNothing: vi.fn().mockReturnValue({
                  returning: vi.fn().mockResolvedValue([{ id: "row-id" }]),
                }),
              };
            }),
          })),
        };
        try {
          await fn(txDb);
          // Only persist if no throw (commit)
          inserts.push(...committed);
        } catch {
          // Transaction rolled back — committed entries are discarded
        }
      }),
    };

    await processStripeEvent(transactionalDb as never, {
      id: "evt_atomic",
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "subscription",
          client_reference_id: "org-atomic",
          customer: "cus_atomic",
          subscription: "sub_atomic",
          metadata: { orgId: "org-atomic", planTier: "growth", billingCycle: "annual" },
        },
      },
    });

    // The mutation threw, so the transaction was rolled back.
    // The audit event insert should NOT be in the committed inserts list.
    expect(inserts).toHaveLength(0);
    expect(updateCallCount).toBe(1); // mutation was attempted
  });
});

describe("customer.subscription.trial_will_end", () => {
  const originalFetch = globalThis.fetch;

  function buildTrialDb(options: {
    orgRow: Record<string, unknown> | undefined;
    freshRow?: Record<string, unknown> | undefined;
    nextInsertConflict?: boolean;
    nextAnalyticsInsertError?: Error;
    adminEmail?: string | null;
    adminMemberUserId?: string | null;
    adminRecipientUserId?: string;
  }) {
    const updates: Record<string, unknown>[] = [];
    const inserts: Record<string, unknown>[] = [];
    const warn: unknown[][] = [];

    const orgRow = options.orgRow
      ? {
          stripeSubscriptionId: "sub_trial",
          trialEndsAt: new Date("2026-04-11T16:00:00.000Z"),
          ...options.orgRow,
        }
      : undefined;
    const freshRow = options.freshRow
      ? {
          stripeSubscriptionId: "sub_trial",
          trialEndsAt: new Date("2026-04-11T16:00:00.000Z"),
          ...options.freshRow,
        }
      : orgRow;
    const findFirstSequence: Array<Record<string, unknown> | undefined> = [orgRow, freshRow];
    const findFirstMock = vi.fn().mockImplementation(async () => {
      return findFirstSequence.length > 0 ? findFirstSequence.shift() : freshRow;
    });

    function makeInsertMethod() {
      return vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((val: Record<string, unknown>) => {
          if ("eventName" in val && options.nextAnalyticsInsertError) {
            throw options.nextAnalyticsInsertError;
          }
          inserts.push(val);
          const isConflict = options.nextInsertConflict === true;
          return {
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue(isConflict ? [] : [{ id: "row-id" }]),
            }),
          };
        }),
      }));
    }
    function makeUpdateMethod() {
      return vi.fn().mockImplementation(() => ({
        set: vi.fn().mockImplementation((val: Record<string, unknown>) => {
          updates.push(val);
          return { where: vi.fn().mockResolvedValue(undefined) };
        }),
      }));
    }

    // Mock the drizzle select() chain used by findOrgAdminEmail.
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(
        options.adminMemberUserId === null
          ? []
          : options.adminEmail === undefined
            ? [
                {
                  email: "admin@example.org",
                  userId: options.adminRecipientUserId ?? "user-admin",
                },
              ]
            : options.adminEmail === null
              ? [
                  {
                    email: null,
                    userId: options.adminRecipientUserId ?? "user-admin",
                  },
                ]
              : [
                  {
                    email: options.adminEmail,
                    userId: options.adminRecipientUserId ?? "user-admin",
                  },
                ],
      ),
    };

    const txObj = {
      query: {
        organizations: { findFirst: findFirstMock },
        orgMembers: {
          findFirst: vi
            .fn()
            .mockResolvedValue(
              options.adminMemberUserId === null
                ? null
                : { userId: options.adminMemberUserId ?? "user-admin" },
            ),
        },
      },
      select: vi.fn().mockReturnValue(selectChain),
      get update() {
        return makeUpdateMethod();
      },
      get insert() {
        return makeInsertMethod();
      },
    };

    const db = {
      query: {
        organizations: { findFirst: findFirstMock },
        orgMembers: txObj.query.orgMembers,
      },
      select: vi.fn().mockReturnValue(selectChain),
      update: makeUpdateMethod(),
      insert: makeInsertMethod(),
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        try {
          return await fn(txObj);
        } catch (err) {
          // simulate rollback (nothing to undo in our mocks)
          return Promise.reject(err);
        }
      }),
    } as never;
    return { db, updates, inserts, warn, findFirstMock };
  }

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(enqueueTrialWrapupEmail).mockResolvedValue(true);
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const originalConsoleWarn = console.warn;
  beforeEach(() => {
    console.warn = vi.fn();
  });
  afterEach(() => {
    console.warn = originalConsoleWarn;
  });

  const event = {
    id: "evt_trial_end",
    type: "customer.subscription.trial_will_end",
    data: {
      object: {
        id: "sub_trial",
        metadata: { orgId: "org-trial" },
      },
    },
  };

  it("enqueues the trial wrapup email without marking org notified", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("{}"),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db, updates, inserts } = buildTrialDb({
      orgRow: { id: "org-trial", name: "Acme", trialWillEndNotifiedAt: null },
    });
    await processStripeEvent(db, event, {
      RESEND_API_KEY: "re_test",
      APP_URL: "https://app.grantpipe.com",
    } as never);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.mocked(enqueueTrialWrapupEmail)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-trial",
        userId: "user-admin",
      }),
    );
    expect(inserts[0]).toMatchObject({
      orgId: "org-trial",
      eventType: "customer.subscription.trial_will_end",
    });
    expect(updates).toHaveLength(0);
  });

  it("enqueues the same deterministic admin whose email passed validation", async () => {
    const { db } = buildTrialDb({
      orgRow: { id: "org-trial", name: "Acme", trialWillEndNotifiedAt: null },
      adminEmail: "first-admin@example.org",
      adminRecipientUserId: "first-admin",
      adminMemberUserId: "unordered-other-admin",
    });

    await processStripeEvent(db, event, { APP_URL: "https://app.grantpipe.com" } as never);

    expect(vi.mocked(enqueueTrialWrapupEmail)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-trial",
        userId: "first-admin",
      }),
    );
  });

  it("no-ops on a duplicate Stripe event (insert conflict)", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db, updates } = buildTrialDb({
      orgRow: { id: "org-trial", name: "Acme", trialWillEndNotifiedAt: null },
      nextInsertConflict: true,
    });
    await processStripeEvent(db, event, {
      RESEND_API_KEY: "re_test",
      APP_URL: "https://app.grantpipe.com",
    } as never);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("audits a distinct replay event without duplicating scheduled analytics", async () => {
    vi.mocked(enqueueTrialWrapupEmail).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const { db, inserts } = buildTrialDb({
      orgRow: { id: "org-trial", name: "Acme", trialWillEndNotifiedAt: null },
    });
    const analyticsBindings = {
      APP_URL: "https://app.grantpipe.com",
      INTEGRATION_MODE: "mock",
    } as never;

    await processStripeEvent(db, event, analyticsBindings);
    await processStripeEvent(
      db,
      { ...event, id: "evt_trial_end_distinct_replay" },
      analyticsBindings,
    );

    const webhookAudits = inserts.filter(
      (insert) => insert.eventType === "customer.subscription.trial_will_end",
    );
    const scheduledAnalytics = inserts.filter(
      (insert) => insert.eventName === ANALYTICS_EVENTS.trialWrapupScheduled,
    );
    expect(webhookAudits).toHaveLength(2);
    expect(scheduledAnalytics).toHaveLength(1);
  });

  it("rejects trial_will_end for a subscription that is not current before audit or enqueue", async () => {
    const { db, inserts } = buildTrialDb({
      orgRow: {
        id: "org-trial",
        stripeSubscriptionId: "sub_current",
        trialWillEndNotifiedAt: null,
      },
    });

    await processStripeEvent(db, {
      id: "evt_old_trial_end",
      type: "customer.subscription.trial_will_end",
      data: {
        object: {
          id: "sub_old",
          metadata: { orgId: "org-trial" },
        },
      },
    });

    expect(inserts).toHaveLength(0);
    expect(vi.mocked(enqueueTrialWrapupEmail)).not.toHaveBeenCalled();
    expect((db as { transaction: ReturnType<typeof vi.fn> }).transaction).not.toHaveBeenCalled();
  });

  it("no-ops when trialWillEndNotifiedAt is already set", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const already = new Date("2026-04-10T00:00:00Z");
    const { db, updates } = buildTrialDb({
      orgRow: { id: "org-trial", name: "Acme", trialWillEndNotifiedAt: already },
      freshRow: { id: "org-trial", name: "Acme", trialWillEndNotifiedAt: already },
    });
    await processStripeEvent(db, event, {
      RESEND_API_KEY: "re_test",
      APP_URL: "https://app.grantpipe.com",
    } as never);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("schedules an extended trial deadline even when the prior deadline was notified", async () => {
    const priorDeadline = new Date("2026-04-11T16:00:00.000Z");
    const extendedDeadline = new Date("2026-04-18T16:00:00.000Z");
    const already = new Date("2026-04-08T16:00:00.000Z");
    const { db, inserts } = buildTrialDb({
      orgRow: {
        id: "org-trial",
        name: "Acme",
        trialEndsAt: extendedDeadline,
        trialWillEndNotifiedAt: already,
        trialWrapupNotifiedForEndAt: priorDeadline,
      },
      freshRow: {
        id: "org-trial",
        name: "Acme",
        trialEndsAt: extendedDeadline,
        trialWillEndNotifiedAt: already,
        trialWrapupNotifiedForEndAt: priorDeadline,
      },
    });

    await processStripeEvent(
      db,
      {
        ...event,
        id: "evt_trial_end_extended",
        data: {
          object: {
            ...event.data.object,
            trial_end: extendedDeadline.getTime() / 1000,
          },
        },
      },
      { APP_URL: "https://app.grantpipe.com", INTEGRATION_MODE: "mock" } as never,
    );

    expect(vi.mocked(enqueueTrialWrapupEmail)).toHaveBeenCalledOnce();
    expect(vi.mocked(enqueueTrialWrapupEmail)).toHaveBeenCalledWith(expect.anything(), {
      orgId: "org-trial",
      userId: "user-admin",
      trialEndsAt: extendedDeadline,
    });
    expect(
      inserts.filter((insert) => insert.eventName === ANALYTICS_EVENTS.trialWrapupScheduled),
    ).toHaveLength(1);
  });

  it("enqueues without requiring a Resend API key", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db, updates } = buildTrialDb({
      orgRow: { id: "org-trial", name: "Acme", trialWillEndNotifiedAt: null },
    });
    await processStripeEvent(db, event, {
      APP_URL: "https://app.grantpipe.com",
    } as never);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.mocked(enqueueTrialWrapupEmail)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-trial",
        userId: "user-admin",
      }),
    );
    expect(updates).toHaveLength(0);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("skips when the org has no admin email", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db, updates } = buildTrialDb({
      orgRow: { id: "org-trial", name: "Acme", trialWillEndNotifiedAt: null },
      adminEmail: null,
    });
    await processStripeEvent(db, event, {
      RESEND_API_KEY: "re_test",
      APP_URL: "https://app.grantpipe.com",
    } as never);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
    expect((db as { transaction: unknown }).transaction).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Trial wrapup email skipped: missing admin email" }),
      "billing",
      {
        org_id: "org-trial",
        lifecycle: "trial_wrapup",
        reason: "missing_admin_email",
      },
    );
  });

  it("skips when the org has no active admin member", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db, updates } = buildTrialDb({
      orgRow: { id: "org-trial", name: "Acme", trialWillEndNotifiedAt: null },
      adminMemberUserId: null,
    });
    await processStripeEvent(db, event, {
      RESEND_API_KEY: "re_test",
      APP_URL: "https://app.grantpipe.com",
    } as never);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.mocked(enqueueTrialWrapupEmail)).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
    expect((db as { transaction: unknown }).transaction).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      "[billing] no admin member for org; skipping trial-ending email",
      { orgId: "org-trial" },
    );
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Trial wrapup email skipped: missing admin member" }),
      "billing",
      {
        org_id: "org-trial",
        lifecycle: "trial_wrapup",
        reason: "missing_admin_member",
      },
    );
  });

  it("awaits trial_ending_soon analytics failure reporting before returning", async () => {
    const analyticsError = new Error("analytics down");
    const { db } = buildTrialDb({
      orgRow: { id: "org-trial", name: "Acme", trialWillEndNotifiedAt: null },
      nextAnalyticsInsertError: analyticsError,
    });

    await processStripeEvent(
      db,
      {
        id: "evt_trial_analytics_error",
        type: "customer.subscription.trial_will_end",
        data: {
          object: {
            id: "sub_trial",
            status: "trialing",
            metadata: { orgId: "org-trial", planTier: "growth", billingCycle: "annual" },
          },
        },
      },
      {
        APP_URL: "https://app.grantpipe.com",
        INTEGRATION_MODE: "mock",
      } as never,
    );

    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(analyticsError, "billing", {
      step: "webhook_analytics",
      analytics_event: ANALYTICS_EVENTS.trialWrapupScheduled,
      stripe_event_type: "customer.subscription.trial_will_end",
    });
  });

  it("does not mark notified when wrapup enqueue fails", async () => {
    vi.mocked(enqueueTrialWrapupEmail).mockRejectedValueOnce(new Error("enqueue failed"));
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db, updates } = buildTrialDb({
      orgRow: { id: "org-trial", name: "Acme", trialWillEndNotifiedAt: null },
    });
    await expect(
      processStripeEvent(db, event, {
        RESEND_API_KEY: "re_test",
        APP_URL: "https://app.grantpipe.com",
      } as never),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("no-ops when org is not found", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db, updates, inserts } = buildTrialDb({
      orgRow: undefined,
    });
    await processStripeEvent(db, event, {
      RESEND_API_KEY: "re_test",
      APP_URL: "https://app.grantpipe.com",
    } as never);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it("no-ops when orgId cannot be resolved from the event", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db, updates, inserts } = buildTrialDb({
      orgRow: undefined,
    });
    await processStripeEvent(
      db,
      {
        id: "evt_no_org",
        type: "customer.subscription.trial_will_end",
        data: { object: { metadata: {} } },
      },
      {
        RESEND_API_KEY: "re_test",
        APP_URL: "https://app.grantpipe.com",
      } as never,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it("enqueues the wrapup email when bindings.APP_URL is absent", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db } = buildTrialDb({
      orgRow: { id: "org-trial", name: "Acme", trialWillEndNotifiedAt: null },
    });
    await processStripeEvent(db, event, { RESEND_API_KEY: "re_test" } as never);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.mocked(enqueueTrialWrapupEmail)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-trial",
        userId: "user-admin",
      }),
    );
  });

  it("resolves planTier and billingCycle from subscription metadata in trial_ending_soon analytics", async () => {
    // Covers the isPlanTier / isBillingCycle truthy branches at lines 614-616.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("{}"),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { db, inserts } = buildTrialDb({
      orgRow: { id: "org-trial", name: "Acme", trialWillEndNotifiedAt: null },
    });
    await processStripeEvent(
      db,
      {
        id: "evt_trial_with_plan",
        type: "customer.subscription.trial_will_end",
        data: {
          object: {
            id: "sub_trial",
            status: "trialing",
            metadata: { orgId: "org-trial", planTier: "growth", billingCycle: "annual" },
          },
        },
      },
      {
        APP_URL: "https://app.grantpipe.com",
        INTEGRATION_MODE: "mock",
      } as never,
    );
    const analyticsRows = inserts.filter((insert) => "eventName" in insert);
    expect(analyticsRows).toHaveLength(1);
    expect(analyticsRows[0]).toMatchObject({
      orgId: "org-trial",
      eventName: ANALYTICS_EVENTS.trialWrapupScheduled,
      payload: expect.objectContaining({
        plan_tier: "growth",
        billing_cycle: "annual",
      }),
    });
  });

  it("captures trial_ending_soon analytics exactly once when not already notified, and not when already notified", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("{}"),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    // Case 1: not yet notified — analytics event should be captured
    const { db: db1, inserts: inserts1 } = buildTrialDb({
      orgRow: { id: "org-trial", name: "Acme", trialWillEndNotifiedAt: null },
    });
    const analyticsBindings = {
      APP_URL: "https://app.grantpipe.com",
      INTEGRATION_MODE: "mock",
    } as never;
    await processStripeEvent(db1, event, analyticsBindings);
    const analyticsRows1 = inserts1.filter((insert) => "eventName" in insert);
    expect(analyticsRows1).toHaveLength(1);
    expect(analyticsRows1[0]).toMatchObject({
      orgId: "org-trial",
      eventName: ANALYTICS_EVENTS.trialWrapupScheduled,
      payload: expect.objectContaining({
        org_id: "org-trial",
        stripe_event_type: "customer.subscription.trial_will_end",
      }),
    });

    // Case 2: already notified — guard should prevent analytics capture
    const already = new Date("2026-04-10T00:00:00Z");
    const { db: db2, inserts: inserts2 } = buildTrialDb({
      orgRow: { id: "org-trial", name: "Acme", trialWillEndNotifiedAt: already },
      freshRow: { id: "org-trial", name: "Acme", trialWillEndNotifiedAt: already },
    });
    await processStripeEvent(db2, event, analyticsBindings);
    const analyticsRows2 = inserts2.filter((insert) => "eventName" in insert);
    expect(analyticsRows2).toHaveLength(0);
  });
});

describe("billingWebhookRoutes Hono integration", () => {
  it("rejects oversized webhook bodies before signature verification", async () => {
    const { db } = buildDb();
    const testApp = new Hono<{
      Bindings: { STRIPE_WEBHOOK_SECRET: string };
      Variables: { db: typeof db };
    }>();
    testApp.use("*", async (c, next) => {
      c.set("db", db);
      await next();
    });
    testApp.route("/", billingWebhookRoutes);

    const res = await testApp.request(
      "/webhook",
      {
        method: "POST",
        headers: {
          "content-length": "1048577",
          "content-type": "application/json",
          "stripe-signature": "t=1,v1=invalid",
        },
        body: "{}",
      },
      { STRIPE_WEBHOOK_SECRET: SECRET },
    );

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "Payload too large" });
  });

  it("routes POST /webhook through the Hono app", async () => {
    const { db } = buildDb();
    const body = JSON.stringify({
      id: "evt_ping_route",
      type: "ping",
      created: 1_784_000_003,
      data: { object: { note: "exact bytes: café" } },
    });
    const ts = Math.floor(Date.now() / 1000);
    const sig = await hmacHex(`${ts}.${body}`, SECRET);
    const request = new Request("http://localhost/webhook", {
      method: "POST",
      headers: {
        "stripe-signature": `t=${ts},v1=${sig}`,
        "content-type": "application/json",
      },
      body,
    });
    // Mount billingWebhookRoutes under a wrapper app that injects db and env bindings
    const testApp = new Hono<{
      Bindings: { STRIPE_WEBHOOK_SECRET: string };
      Variables: { db: typeof db };
    }>();
    testApp.use("*", async (c, next) => {
      c.set("db", db);
      await next();
    });
    testApp.route("/", billingWebhookRoutes);
    const res = await testApp.request("/webhook", request, {
      STRIPE_WEBHOOK_SECRET: SECRET,
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { received: boolean };
    expect(json).toEqual({ received: true });
  });
});
