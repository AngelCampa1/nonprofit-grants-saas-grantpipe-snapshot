import { Hono } from "hono";
import { and, eq, isNull, lt, ne, or, type SQL } from "drizzle-orm";
import { billingEvents, organizations } from "@grantpipe/db";
import type { Database, TransactionDatabase } from "@grantpipe/db";
import type { BillingCycle, PlanTier, SubscriptionStatus } from "@grantpipe/shared";
import {
  ANALYTICS_EVENTS,
  BILLING_CYCLES,
  PLAN_TIERS,
  SUBSCRIPTION_STATUSES,
  normalizePromoCode,
} from "@grantpipe/shared";
import type { AppEnv, Bindings } from "../../types";
import { findOrgAdminRecipient } from "./emails";
import { enqueueTrialWrapupEmail } from "../trial-emails/service";
import { getIntegrations } from "../../lib/integrations";
import { captureBackgroundException } from "../../lib/sentry";
import { jsonBodyLimit } from "../../middleware/json-body-limit";

type SelfServePlanTier = Exclude<PlanTier, "enterprise">;

type StripeEvent = {
  id: string;
  type: string;
  created?: number;
  account?: string;
  data: { object: Record<string, unknown> };
};

const encoder = new TextEncoder();
const STRIPE_WEBHOOK_MAX_BODY_BYTES = 1_048_576;

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  const bytes = new Uint8Array(signatureBuffer);
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

function parseStripeSignatureHeader(header: string | null) {
  if (!header) return null;
  const parts = header.split(",").map((part) => part.trim());
  const timestamps: string[] = [];
  const signatures: string[] = [];
  for (const part of parts) {
    const [key, value] = part.split("=");
    if (!key || !value) continue;
    if (key === "t") timestamps.push(value);
    if (key === "v1") signatures.push(value);
  }
  // A well-formed Stripe header has exactly one timestamp. Duplicate `t=`
  // entries indicate a malformed or tampered header and must be rejected.
  if (timestamps.length !== 1 || signatures.length === 0) return null;
  return { timestamp: timestamps[0]!, signatures };
}

const TOLERANCE_SECONDS = 5 * 60;

export async function verifyStripeSignature(params: {
  payload: string;
  header: string | null;
  secret: string;
  now?: number;
}): Promise<boolean> {
  const parsed = parseStripeSignatureHeader(params.header);
  if (!parsed) return false;
  const timestampSeconds = Number(parsed.timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  const nowSeconds = Math.floor((params.now ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > TOLERANCE_SECONDS) return false;
  const expected = await hmacSha256Hex(params.secret, `${parsed.timestamp}.${params.payload}`);
  return parsed.signatures.some((signature) => timingSafeEqualHex(signature, expected));
}

function isPlanTier(value: unknown): value is PlanTier {
  return typeof value === "string" && (PLAN_TIERS as readonly string[]).includes(value);
}

function isBillingCycle(value: unknown): value is BillingCycle {
  return typeof value === "string" && (BILLING_CYCLES as readonly string[]).includes(value);
}

function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return typeof value === "string" && (SUBSCRIPTION_STATUSES as readonly string[]).includes(value);
}

const STRIPE_PRICE_BINDING_KEYS = {
  "starter:monthly": "STRIPE_PRICE_STARTER_MONTHLY",
  "starter:annual": "STRIPE_PRICE_STARTER_ANNUAL",
  "growth:monthly": "STRIPE_PRICE_GROWTH_MONTHLY",
  "growth:annual": "STRIPE_PRICE_GROWTH_ANNUAL",
  "audit_ready:monthly": "STRIPE_PRICE_AUDIT_READY_MONTHLY",
  "audit_ready:annual": "STRIPE_PRICE_AUDIT_READY_ANNUAL",
} as const satisfies Record<`${SelfServePlanTier}:${BillingCycle}`, keyof Bindings>;

function pickString(input: Record<string, unknown> | undefined, key: string): string | undefined {
  if (!input) return undefined;
  const value = input[key];
  return typeof value === "string" ? value : undefined;
}

function pickRecord(
  input: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  if (!input) return undefined;
  const value = input[key];
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function pickAmountCents(input: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function pickArray(input: Record<string, unknown> | undefined, key: string): unknown[] {
  if (!input) return [];
  const value = input[key];
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function billingCycleFromStripeInterval(value: string | undefined): BillingCycle | undefined {
  if (value === "month") return "monthly";
  if (value === "year") return "annual";
  return undefined;
}

function pickPriceBillingCycle(
  price: Record<string, unknown> | undefined,
): BillingCycle | undefined {
  return billingCycleFromStripeInterval(pickString(pickRecord(price, "recurring"), "interval"));
}

function collectStripePrices(
  object: Record<string, unknown>,
): Array<{ id: string; billingCycle?: BillingCycle }> {
  const prices = new Map<string, BillingCycle | undefined>();

  function addPrice(id: string | undefined, billingCycle?: BillingCycle) {
    if (!id) return;
    prices.set(id, prices.get(id) ?? billingCycle);
  }

  const planId = pickString(pickRecord(object, "plan"), "id");
  addPrice(planId, pickPriceBillingCycle(pickRecord(object, "plan")));

  for (const item of pickArray(pickRecord(object, "items"), "data")) {
    const itemRecord = asRecord(item);
    const price = pickRecord(itemRecord, "price");
    addPrice(pickString(price, "id"), pickPriceBillingCycle(price));
  }

  for (const line of pickArray(pickRecord(object, "lines"), "data")) {
    const lineRecord = asRecord(line);
    const price = pickRecord(lineRecord, "price");
    addPrice(pickString(price, "id"), pickPriceBillingCycle(price));

    const pricing = pickRecord(lineRecord, "pricing");
    const priceDetails = pickRecord(pricing, "price_details");
    const priceDetailsId = pickString(priceDetails, "price");
    addPrice(priceDetailsId);
  }

  return [...prices.entries()].map(([id, billingCycle]) => ({ id, billingCycle }));
}

function resolvePlanFromPriceId(
  bindings: Bindings | undefined,
  object: Record<string, unknown>,
  metadata: Record<string, unknown>,
): { planTier?: PlanTier; billingCycle?: BillingCycle } {
  if (!bindings) return {};

  const stripePrices = collectStripePrices(object);
  const candidates: Array<{ planTier: PlanTier; billingCycle: BillingCycle }> = [];
  for (const [key, bindingKey] of Object.entries(STRIPE_PRICE_BINDING_KEYS)) {
    const configuredPriceId = bindings[bindingKey];
    if (!configuredPriceId || !stripePrices.some((price) => price.id === configuredPriceId)) {
      continue;
    }

    const [planTier, billingCycle] = key.split(":");
    if (isPlanTier(planTier) && isBillingCycle(billingCycle)) {
      candidates.push({ planTier, billingCycle });
    }
  }

  if (candidates.length === 0) return {};
  if (candidates.length === 1) return candidates[0]!;

  const observedBillingCycles = new Set(
    stripePrices.map((price) => price.billingCycle).filter(isBillingCycle),
  );
  if (observedBillingCycles.size === 1) {
    const [observedBillingCycle] = [...observedBillingCycles];
    const intervalMatch = candidates.find(
      (candidate) => candidate.billingCycle === observedBillingCycle,
    );
    if (intervalMatch) return intervalMatch;
  }

  const metadataPlanTier = isPlanTier(metadata.planTier) ? metadata.planTier : undefined;
  const metadataBillingCycle = isBillingCycle(metadata.billingCycle)
    ? metadata.billingCycle
    : undefined;
  const metadataMatch = candidates.find(
    (candidate) =>
      candidate.planTier === metadataPlanTier && candidate.billingCycle === metadataBillingCycle,
  );

  return metadataMatch ?? candidates[0]!;
}

function resolvePlanSelection(
  bindings: Bindings | undefined,
  object: Record<string, unknown>,
  metadata: Record<string, unknown>,
): { planTier?: PlanTier; billingCycle?: BillingCycle } {
  const fromPrice = resolvePlanFromPriceId(bindings, object, metadata);
  return {
    planTier: fromPrice.planTier ?? (isPlanTier(metadata.planTier) ? metadata.planTier : undefined),
    billingCycle:
      fromPrice.billingCycle ??
      (isBillingCycle(metadata.billingCycle) ? metadata.billingCycle : undefined),
  };
}

function analyticsEnvironment(bindings: Bindings | undefined): string {
  if (bindings?.SENTRY_ENVIRONMENT) return bindings.SENTRY_ENVIRONMENT;
  return bindings?.APP_URL?.includes("app.grantpipe.com") ? "production" : "development";
}

async function captureBillingAnalytics(
  db: Database,
  bindings: Bindings | undefined,
  params: {
    orgId: string;
    eventName: string;
    stripeEventType: string;
    planTier?: PlanTier;
    billingCycle?: BillingCycle;
    subscriptionStatus?: SubscriptionStatus;
    amountCents?: number;
  },
) {
  if (!bindings) return;
  await getIntegrations(db, bindings)
    .analytics.capture({
      orgId: params.orgId,
      eventName: params.eventName,
      payload: {
        org_id: params.orgId,
        plan_tier: params.planTier,
        billing_cycle: params.billingCycle,
        subscription_status: params.subscriptionStatus,
        stripe_event_type: params.stripeEventType,
        amount_cents: params.amountCents,
        environment: analyticsEnvironment(bindings),
      },
    })
    .catch((error: unknown) => {
      captureBackgroundException(error, "billing", {
        step: "webhook_analytics",
        analytics_event: params.eventName,
        stripe_event_type: params.stripeEventType,
      });
    });
}

/** Inserts a billing event audit row. Returns true if inserted (new event),
 *  false if the event was already seen (duplicate — caller should skip mutations).
 *  Accepts both a full Database and a transaction object so it can participate
 *  in an atomic transaction alongside the billing state mutation. */
async function insertAuditEventOrSkip(
  db: TransactionDatabase,
  orgId: string,
  event: StripeEvent,
): Promise<boolean> {
  const rows = await db
    .insert(billingEvents)
    .values({
      orgId,
      stripeEventId: event.id,
      eventType: event.type,
      payload: { id: event.id, data: event.data.object as Record<string, unknown> },
    })
    .onConflictDoNothing()
    .returning();
  return rows.length > 0;
}

function stripeEventCreatedAt(event: StripeEvent): Date {
  if (typeof event.created === "number" && Number.isFinite(event.created)) {
    return new Date(event.created * 1000);
  }
  return new Date(0);
}

function stripeStateEventPriority(event: StripeEvent): number {
  if (event.type === "customer.subscription.deleted") return 100;
  if (event.type === "invoice.payment_failed") return 80;
  if (event.type === "invoice.payment_succeeded") return 60;

  const object = event.data.object;
  const normalizedStatus = normalizeSubscriptionStatus(object.status);
  if (normalizedStatus === "canceled") return 100;
  if (normalizedStatus === "past_due") return 80;
  if (normalizedStatus === "trialing") return 70;
  if (normalizedStatus === "active") return 60;

  const paymentStatus = pickString(object, "payment_status");
  if (paymentStatus === "no_payment_required") return 70;
  if (paymentStatus === "paid") return 60;
  return 80;
}

function stripeStateMutation(event: StripeEvent) {
  return {
    stripeStateEventCreatedAt: stripeEventCreatedAt(event),
    stripeStateEventId: event.id,
    stripeStateEventPriority: stripeStateEventPriority(event),
  };
}

function freshStripeStateWhere(
  orgId: string,
  event: StripeEvent,
  extraConditions: SQL<unknown>[] = [],
) {
  const eventCreatedAt = stripeEventCreatedAt(event);
  const eventPriority = stripeStateEventPriority(event);
  return and(
    eq(organizations.id, orgId),
    or(
      isNull(organizations.stripeStateEventCreatedAt),
      lt(organizations.stripeStateEventCreatedAt, eventCreatedAt),
      and(
        eq(organizations.stripeStateEventCreatedAt, eventCreatedAt),
        or(
          isNull(organizations.stripeStateEventPriority),
          lt(organizations.stripeStateEventPriority, eventPriority),
        ),
      ),
    ),
    ...extraConditions,
  );
}

type ReplacementGenerationSnapshot = {
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  stripeStateEventCreatedAt: Date | null;
  stripeStateEventPriority: number | null;
};

function checkoutGenerationWhere(orgId: string, expected: ReplacementGenerationSnapshot) {
  return and(
    eq(organizations.id, orgId),
    expected.stripeSubscriptionId
      ? eq(organizations.stripeSubscriptionId, expected.stripeSubscriptionId)
      : isNull(organizations.stripeSubscriptionId),
    expected.stripeCustomerId
      ? eq(organizations.stripeCustomerId, expected.stripeCustomerId)
      : isNull(organizations.stripeCustomerId),
    expected.stripeStateEventCreatedAt
      ? eq(organizations.stripeStateEventCreatedAt, expected.stripeStateEventCreatedAt)
      : isNull(organizations.stripeStateEventCreatedAt),
    expected.stripeStateEventPriority === null
      ? isNull(organizations.stripeStateEventPriority)
      : eq(organizations.stripeStateEventPriority, expected.stripeStateEventPriority),
  );
}

async function handleCheckoutCompleted(
  db: Database,
  event: StripeEvent,
  bindings: Bindings | undefined,
) {
  const session = event.data.object;
  const mode = pickString(session, "mode");
  const customer = pickString(session, "customer")?.trim() || null;
  const subscription = pickString(session, "subscription")?.trim() || null;
  if (mode !== "subscription" || !customer || !subscription) return;

  const orgId =
    pickString(session, "client_reference_id") ??
    pickString(pickRecord(session, "metadata"), "orgId");
  if (!orgId) return;

  const metadata = pickRecord(session, "metadata") ?? {};
  const planTier = isPlanTier(metadata.planTier) ? metadata.planTier : undefined;
  const billingCycle = isBillingCycle(metadata.billingCycle) ? metadata.billingCycle : undefined;
  const promoCode = normalizePromoCode(pickString(metadata, "promoCode"));
  const currentGeneration = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: {
      stripeSubscriptionId: true,
      stripeCustomerId: true,
      stripeStateEventCreatedAt: true,
      stripeStateEventPriority: true,
    },
  });
  if (currentGeneration?.stripeCustomerId && currentGeneration.stripeCustomerId !== customer) {
    return;
  }
  if (!currentGeneration?.stripeCustomerId) {
    const customerOwner = await db.query.organizations.findFirst({
      where: eq(organizations.stripeCustomerId, customer),
      columns: { id: true },
    });
    if (customerOwner && customerOwner.id !== orgId) return;
  }
  const startsReplacementGeneration =
    !!currentGeneration?.stripeSubscriptionId &&
    currentGeneration.stripeSubscriptionId !== subscription;
  const startsFirstGeneration =
    !!currentGeneration && currentGeneration.stripeSubscriptionId === null;
  let canonicalCheckoutSubscription: Record<string, unknown> | undefined;
  if (startsFirstGeneration) {
    const secret = bindings?.STRIPE_SECRET_KEY;
    if (!secret) {
      const error = new StripeReconciliationUnavailableError(
        "Stripe subscription reconciliation unavailable",
      );
      captureBackgroundException(error, "billing", {
        reason: "missing_stripe_secret",
        stripe_event_type: event.type,
      });
      throw error;
    }
    canonicalCheckoutSubscription = await retrieveCanonicalStripeSubscription(
      event,
      secret,
      subscription,
      customer,
    );
  } else if (startsReplacementGeneration) {
    const expectedCustomerId = currentGeneration.stripeCustomerId;
    if (!expectedCustomerId || customer !== expectedCustomerId) return;
    const secret = bindings?.STRIPE_SECRET_KEY;
    if (!secret) {
      const error = new StripeReconciliationUnavailableError(
        "Stripe subscription reconciliation unavailable",
      );
      captureBackgroundException(error, "billing", {
        reason: "missing_stripe_secret",
        stripe_event_type: event.type,
      });
      throw error;
    }
    const [currentSubscription, incomingSubscription] = await Promise.all([
      retrieveCanonicalStripeSubscription(
        event,
        secret,
        currentGeneration.stripeSubscriptionId!,
        expectedCustomerId,
      ),
      retrieveCanonicalStripeSubscription(event, secret, subscription, expectedCustomerId),
    ]);
    const currentCreated = canonicalSubscriptionCreated(currentSubscription);
    const incomingCreated = canonicalSubscriptionCreated(incomingSubscription);
    const incomingStatus = pickString(incomingSubscription, "status");
    const safeSameSecondReplacement =
      currentCreated !== null &&
      incomingCreated === currentCreated &&
      isSafeSameSecondReplacement(currentSubscription, incomingSubscription);
    if (
      currentCreated === null ||
      incomingCreated === null ||
      (incomingCreated <= currentCreated && !safeSameSecondReplacement) ||
      !incomingStatus ||
      incomingStatus === "canceled" ||
      incomingStatus === "incomplete_expired"
    ) {
      return;
    }
    canonicalCheckoutSubscription = incomingSubscription;
  }

  // Derive status from payment_status: no_payment_required → trial, paid → active.
  const paymentStatus = pickString(session, "payment_status");
  const subscriptionStatus: SubscriptionStatus =
    paymentStatus === "paid"
      ? "active"
      : paymentStatus === "no_payment_required"
        ? "trialing"
        : "past_due";
  const reconciliation = await reconcileEqualPrioritySubscription(
    db,
    bindings,
    orgId,
    event,
    subscription,
    {
      allowSubscriptionSwitch: startsReplacementGeneration,
      expectedCustomerId: customer,
      canonicalSubscription: canonicalCheckoutSubscription,
    },
  );
  const reconciledSubscription = canonicalCheckoutSubscription ?? reconciliation?.subscription;
  const reconciledMetadata = pickRecord(reconciledSubscription, "metadata") ?? {};
  const reconciledPlan = reconciledSubscription
    ? resolvePlanSelection(bindings, reconciledSubscription, reconciledMetadata)
    : undefined;
  const effectiveStatus = reconciledSubscription
    ? (normalizeSubscriptionStatus(reconciledSubscription.status) ?? subscriptionStatus)
    : subscriptionStatus;
  const effectiveTrialEndsAt = reconciledSubscription
    ? trialEndsAtFromSubscription(reconciledSubscription)
    : undefined;
  const checkoutMutation = {
    stripeCustomerId: customer ?? undefined,
    stripeSubscriptionId: subscription ?? undefined,
    planTier: reconciledPlan?.planTier ?? planTier ?? undefined,
    billingCycle: reconciledPlan?.billingCycle ?? billingCycle ?? undefined,
    subscriptionStatus: effectiveStatus,
    trialEndsAt: effectiveTrialEndsAt,
    promoCodeApplied: promoCode,
    planSelectedAt: new Date(),
    updatedAt: new Date(),
    ...(startsFirstGeneration
      ? stripeStateMutation({ ...event, data: { object: canonicalCheckoutSubscription! } })
      : startsReplacementGeneration
        ? stripeStateMutation(event)
        : stripeMutationAfterReconciliation(event, reconciliation)),
  };

  const accepted = await db.transaction(async (tx) => {
    // Idempotency check + mutation are atomic: if mutation fails, audit event rolls back
    // so Stripe retries will correctly re-apply the billing state.
    const isNew = await insertAuditEventOrSkip(tx, orgId, event);
    if (!isNew) return false;

    const rows = await tx
      .update(organizations)
      .set(checkoutMutation)
      .where(
        startsFirstGeneration || startsReplacementGeneration
          ? checkoutGenerationWhere(orgId, currentGeneration)
          : stripeWhereAfterReconciliation(orgId, event, reconciliation),
      )
      .returning({ id: organizations.id });

    if (rows.length > 0) return true;
    if (!startsFirstGeneration && !startsReplacementGeneration) {
      if (reconciliation) throw new StripeConcurrentStateChangeError();
      return false;
    }

    const freshGeneration = await tx.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
      columns: {
        stripeSubscriptionId: true,
        stripeCustomerId: true,
        stripeStateEventCreatedAt: true,
        stripeStateEventPriority: true,
      },
    });
    if (
      freshGeneration?.stripeSubscriptionId === subscription &&
      freshGeneration.stripeCustomerId === customer
    ) {
      if (startsFirstGeneration) throw new StripeConcurrentStateChangeError();
      return false;
    }
    if (
      !freshGeneration ||
      freshGeneration.stripeSubscriptionId !== currentGeneration.stripeSubscriptionId ||
      freshGeneration.stripeCustomerId !== currentGeneration.stripeCustomerId
    ) {
      throw new StripeConcurrentStateChangeError();
    }

    const retryRows = await tx
      .update(organizations)
      .set(checkoutMutation)
      .where(checkoutGenerationWhere(orgId, freshGeneration))
      .returning({ id: organizations.id });
    if (retryRows.length === 0) throw new StripeConcurrentStateChangeError();
    return true;
  });
  if (!accepted) return;

  await captureBillingAnalytics(db, bindings, {
    orgId,
    eventName: ANALYTICS_EVENTS.checkoutCompleted,
    stripeEventType: event.type,
    planTier: reconciledPlan?.planTier ?? planTier,
    billingCycle: reconciledPlan?.billingCycle ?? billingCycle,
    subscriptionStatus: effectiveStatus,
    amountCents: pickAmountCents(session, ["amount_total", "amount_subtotal"]),
  });
}

async function resolveOrgIdForSubscription(
  db: Database,
  object: Record<string, unknown>,
): Promise<string | null> {
  // Always resolve via stripeCustomerId when a customer field is present —
  // metadata.orgId cannot be trusted because it may be stale or spoofed.
  const customer = pickString(object, "customer");
  if (customer) {
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.stripeCustomerId, customer),
      columns: { id: true },
    });
    return org?.id ?? null;
  }
  // Metadata is only a fallback for legacy objects that carry no customer.
  // A present customer must match the organization record exactly.
  const metadata = pickRecord(object, "metadata") ?? {};
  return pickString(metadata, "orgId") ?? null;
}

function normalizeSubscriptionStatus(status: unknown): SubscriptionStatus | undefined {
  if (typeof status !== "string") return undefined;
  if (isSubscriptionStatus(status)) return status;
  // Map Stripe-only statuses that we don't carry in our union to the closest equivalent.
  if (status === "unpaid" || status === "incomplete_expired") return "past_due";
  if (status === "paused") return "past_due";
  return undefined;
}

function trialEndsAtFromSubscription(
  subscription: Record<string, unknown>,
): Date | null | undefined {
  const trialEnd = subscription.trial_end;
  const trialEndNum: number | null | undefined =
    typeof trialEnd === "string"
      ? Number.isFinite(Number(trialEnd))
        ? Number(trialEnd)
        : undefined
      : typeof trialEnd === "number"
        ? trialEnd
        : trialEnd === null
          ? null
          : undefined;

  return typeof trialEndNum === "number" && trialEndNum !== 0
    ? new Date(trialEndNum * 1000)
    : trialEndNum === null || trialEndNum === 0
      ? null
      : undefined;
}

type StripeSubscriptionReconciliation = {
  subscription: Record<string, unknown>;
  expectedCreatedAt: Date | null;
  expectedEventId: string | null;
  expectedPriority: number | null;
  subscriptionId: string;
};

class StripeReconciliationUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "StripeReconciliationUnavailableError";
  }
}

class StripeSubscriptionIdentityMismatchError extends Error {
  constructor() {
    super("Stripe subscription identity mismatch");
    this.name = "StripeSubscriptionIdentityMismatchError";
  }
}

class StripeConcurrentStateChangeError extends Error {
  constructor() {
    super("Stripe billing state changed during reconciliation");
    this.name = "StripeConcurrentStateChangeError";
  }
}

function canonicalSubscriptionCreated(subscription: Record<string, unknown>): number | null {
  const created = subscription.created;
  return typeof created === "number" && Number.isFinite(created) ? created : null;
}

function isSafeSameSecondReplacement(
  currentSubscription: Record<string, unknown>,
  incomingSubscription: Record<string, unknown>,
): boolean {
  const currentStatus = pickString(currentSubscription, "status");
  const incomingStatus = pickString(incomingSubscription, "status");
  const incomingIsNonterminal =
    incomingStatus === "active" ||
    incomingStatus === "trialing" ||
    incomingStatus === "incomplete" ||
    incomingStatus === "past_due" ||
    incomingStatus === "paused" ||
    incomingStatus === "unpaid";
  return (
    (currentStatus === "canceled" || currentStatus === "incomplete_expired") &&
    incomingIsNonterminal
  );
}

async function retrieveCanonicalStripeSubscription(
  event: StripeEvent,
  secret: string,
  subscriptionId: string,
  expectedCustomerId?: string | null,
): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(
      `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    if (!response.ok) throw new Error(`Stripe subscription lookup failed: ${response.status}`);
    const subscription = asRecord(await response.json());
    if (!subscription || pickString(subscription, "id") !== subscriptionId) {
      throw new StripeSubscriptionIdentityMismatchError();
    }
    if (expectedCustomerId && pickString(subscription, "customer") !== expectedCustomerId) {
      throw new StripeSubscriptionIdentityMismatchError();
    }
    return subscription;
  } catch (error) {
    if (error instanceof StripeSubscriptionIdentityMismatchError) {
      captureBackgroundException(error, "billing", {
        reason: "stripe_lookup_identity_mismatch",
        stripe_event_type: event.type,
      });
      throw error;
    }
    captureBackgroundException(
      error instanceof Error ? error : new Error("Stripe subscription reconciliation failed"),
      "billing",
      { reason: "stripe_lookup_failed", stripe_event_type: event.type },
    );
    throw new StripeReconciliationUnavailableError(
      "Stripe subscription reconciliation unavailable",
      { cause: error },
    );
  }
}

async function reconcileEqualPrioritySubscription(
  db: Database,
  bindings: Bindings | undefined,
  orgId: string,
  event: StripeEvent,
  subscriptionId: string | null,
  options: {
    allowSubscriptionSwitch?: boolean;
    expectedCustomerId?: string | null;
    requireBootstrapReconciliation?: boolean;
    canonicalSubscription?: Record<string, unknown>;
  } = {},
): Promise<StripeSubscriptionReconciliation | undefined> {
  const current = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: {
      stripeSubscriptionId: true,
      stripeCustomerId: true,
      stripeStateEventCreatedAt: true,
      stripeStateEventId: true,
      stripeStateEventPriority: true,
    },
  });
  const eventCreatedAt = stripeEventCreatedAt(event);
  const eventPriority = stripeStateEventPriority(event);
  const needsBootstrap = current?.stripeStateEventCreatedAt == null;
  const matchesCurrentSubscription =
    !!subscriptionId && current?.stripeSubscriptionId === subscriptionId;
  const canSwitchSubscription =
    !!options.allowSubscriptionSwitch &&
    !!subscriptionId &&
    !!options.expectedCustomerId &&
    current?.stripeCustomerId === options.expectedCustomerId;
  const canReconcileCurrent =
    !!bindings?.STRIPE_SECRET_KEY && (matchesCurrentSubscription || canSwitchSubscription);
  const requiresSameTimestampReconciliation =
    !needsBootstrap &&
    current?.stripeStateEventCreatedAt?.getTime() === eventCreatedAt.getTime() &&
    (matchesCurrentSubscription || canSwitchSubscription);
  if (
    !current ||
    current.stripeStateEventId === event.id ||
    (!needsBootstrap &&
      (current.stripeStateEventCreatedAt?.getTime() !== eventCreatedAt.getTime() ||
        current.stripeStateEventPriority !== eventPriority) &&
      !canReconcileCurrent &&
      !requiresSameTimestampReconciliation)
  ) {
    return undefined;
  }
  const secret = bindings?.STRIPE_SECRET_KEY;
  if (needsBootstrap && !bindings && !options.requireBootstrapReconciliation) return undefined;
  if (!matchesCurrentSubscription && !canSwitchSubscription) return undefined;
  if (!secret) {
    const error = new StripeReconciliationUnavailableError(
      "Stripe subscription reconciliation unavailable",
    );
    captureBackgroundException(error, "billing", {
      reason: "missing_stripe_secret",
      stripe_event_type: event.type,
    });
    throw error;
  }

  const subscription =
    options.canonicalSubscription ??
    (await retrieveCanonicalStripeSubscription(
      event,
      secret,
      subscriptionId,
      options.expectedCustomerId,
    ));
  return {
    subscription,
    expectedCreatedAt: needsBootstrap
      ? null
      : (current.stripeStateEventCreatedAt ?? eventCreatedAt),
    expectedEventId: current.stripeStateEventId,
    expectedPriority: needsBootstrap ? null : (current.stripeStateEventPriority ?? eventPriority),
    subscriptionId,
  };
}

function stripeMutationAfterReconciliation(
  event: StripeEvent,
  reconciliation: StripeSubscriptionReconciliation | undefined,
) {
  if (!reconciliation) return stripeStateMutation(event);
  const reconciledEvent = { ...event, data: { object: reconciliation.subscription } };
  const eventCreatedAt = stripeEventCreatedAt(event);
  const canonicalCreatedAt =
    reconciliation.expectedCreatedAt && reconciliation.expectedCreatedAt > eventCreatedAt
      ? reconciliation.expectedCreatedAt
      : eventCreatedAt;
  const canonicalPriority = stripeStateEventPriority(reconciledEvent);
  const preservesExistingTimestamp =
    reconciliation.expectedCreatedAt?.getTime() === canonicalCreatedAt.getTime();
  return {
    stripeStateEventCreatedAt: canonicalCreatedAt,
    stripeStateEventId: event.id,
    stripeStateEventPriority:
      preservesExistingTimestamp && reconciliation.expectedPriority !== null
        ? Math.max(reconciliation.expectedPriority, canonicalPriority)
        : canonicalPriority,
  };
}

function stripeWhereAfterReconciliation(
  orgId: string,
  event: StripeEvent,
  reconciliation: StripeSubscriptionReconciliation | undefined,
) {
  return reconciliation
    ? and(
        eq(organizations.id, orgId),
        eq(organizations.stripeSubscriptionId, reconciliation.subscriptionId),
        reconciliation.expectedCreatedAt
          ? eq(organizations.stripeStateEventCreatedAt, reconciliation.expectedCreatedAt)
          : isNull(organizations.stripeStateEventCreatedAt),
        reconciliation.expectedEventId
          ? eq(organizations.stripeStateEventId, reconciliation.expectedEventId)
          : isNull(organizations.stripeStateEventId),
        reconciliation.expectedPriority === null
          ? isNull(organizations.stripeStateEventPriority)
          : eq(organizations.stripeStateEventPriority, reconciliation.expectedPriority),
      )
    : freshStripeStateWhere(orgId, event);
}

async function subscriptionEventMatchesCurrentOrg(
  tx: TransactionDatabase,
  orgId: string,
  subscriptionId: string | null,
): Promise<boolean> {
  if (!subscriptionId) return true;
  const org = await tx.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: { stripeSubscriptionId: true },
  });
  const currentSubscriptionId = org?.stripeSubscriptionId;
  return !currentSubscriptionId || currentSubscriptionId === subscriptionId;
}

async function handleSubscriptionUpdated(
  db: Database,
  event: StripeEvent,
  bindings: Bindings | undefined,
) {
  const incomingSubscription = event.data.object;
  const orgId = await resolveOrgIdForSubscription(db, incomingSubscription);
  if (!orgId) return;

  const incomingSubscriptionId = pickString(incomingSubscription, "id") ?? null;
  const reconciliation = await reconcileEqualPrioritySubscription(
    db,
    bindings,
    orgId,
    event,
    incomingSubscriptionId,
  );
  const subscription = reconciliation?.subscription ?? incomingSubscription;
  const metadata = pickRecord(subscription, "metadata") ?? {};
  const status = normalizeSubscriptionStatus(subscription.status);
  const { planTier, billingCycle } = resolvePlanSelection(bindings, subscription, metadata);
  const subscriptionId = pickString(subscription, "id") ?? null;

  // Normalize trial_end to a number — Stripe occasionally sends it as a string.
  // Guard against "NaN" strings: Number("NaN") === NaN, which would silently
  // leave trialEndsAt as undefined and the org stuck in trial forever.
  const trialEndsAt = trialEndsAtFromSubscription(subscription);

  const accepted = await db.transaction(async (tx) => {
    const isNew = await insertAuditEventOrSkip(tx, orgId, event);
    if (!isNew) return false;
    if (!(await subscriptionEventMatchesCurrentOrg(tx, orgId, subscriptionId))) {
      return false;
    }

    const rows = await tx
      .update(organizations)
      .set({
        stripeSubscriptionId: subscriptionId ?? undefined,
        subscriptionStatus: status,
        trialEndsAt,
        planTier: planTier ?? undefined,
        billingCycle: billingCycle ?? undefined,
        updatedAt: new Date(),
        ...stripeMutationAfterReconciliation(event, reconciliation),
      })
      .where(stripeWhereAfterReconciliation(orgId, event, reconciliation))
      .returning({ id: organizations.id });

    if (rows.length === 0 && reconciliation) throw new StripeConcurrentStateChangeError();
    return rows.length > 0;
  });
  if (!accepted || event.type !== "customer.subscription.created") return;

  await captureBillingAnalytics(db, bindings, {
    orgId,
    eventName: ANALYTICS_EVENTS.subscriptionStarted,
    stripeEventType: event.type,
    planTier,
    billingCycle,
    subscriptionStatus: status,
    amountCents: pickAmountCents(subscription, ["amount", "amount_due"]),
  });
}

async function handleSubscriptionDeleted(
  db: Database,
  event: StripeEvent,
  bindings: Bindings | undefined,
) {
  const subscription = event.data.object;
  const orgId = await resolveOrgIdForSubscription(db, subscription);
  if (!orgId) return;

  const metadata = pickRecord(subscription, "metadata") ?? {};
  const { planTier, billingCycle } = resolvePlanSelection(bindings, subscription, metadata);
  const subscriptionId = pickString(subscription, "id") ?? null;

  const accepted = await db.transaction(async (tx) => {
    const isNew = await insertAuditEventOrSkip(tx, orgId, event);
    if (!isNew) return false;
    if (!(await subscriptionEventMatchesCurrentOrg(tx, orgId, subscriptionId))) return false;

    const rows = await tx
      .update(organizations)
      .set({
        stripeSubscriptionId: subscriptionId ?? undefined,
        subscriptionStatus: "canceled",
        updatedAt: new Date(),
        ...stripeStateMutation(event),
      })
      .where(freshStripeStateWhere(orgId, event))
      .returning({ id: organizations.id });

    return rows.length > 0;
  });
  if (!accepted) return;

  await captureBillingAnalytics(db, bindings, {
    orgId,
    eventName: ANALYTICS_EVENTS.subscriptionCanceled,
    stripeEventType: event.type,
    planTier,
    billingCycle,
    subscriptionStatus: "canceled",
    amountCents: pickAmountCents(subscription, ["amount", "amount_due"]),
  });
}

const SUBSCRIPTION_INVOICE_BILLING_REASONS = new Set(["subscription_cycle", "subscription_update"]);

function isSubscriptionInvoice(invoice: Record<string, unknown>): boolean {
  const billingReason = pickString(invoice, "billing_reason");
  const subscription = pickString(invoice, "subscription");
  return (
    typeof subscription === "string" &&
    subscription.length > 0 &&
    typeof billingReason === "string" &&
    SUBSCRIPTION_INVOICE_BILLING_REASONS.has(billingReason)
  );
}

async function handleInvoicePaymentSucceeded(
  db: Database,
  event: StripeEvent,
  bindings: Bindings | undefined,
) {
  const invoice = event.data.object;
  // Only handle renewal/update invoices (subscription_cycle, subscription_update) — these
  // represent recovery or ongoing billing. subscription_create (first invoice) and
  // non-subscription invoices are excluded because the initial subscription is already
  // captured by checkout.session.completed; treating it here would double-count.
  if (!isSubscriptionInvoice(invoice)) return;

  const orgId = await resolveOrgIdForSubscription(db, invoice);
  if (!orgId) return;

  const invoiceSubscriptionId = pickString(invoice, "subscription") ?? null;
  const reconciliation = await reconcileEqualPrioritySubscription(
    db,
    bindings,
    orgId,
    event,
    invoiceSubscriptionId,
    { requireBootstrapReconciliation: true },
  );
  const billingObject = reconciliation?.subscription ?? invoice;
  const metadata = pickRecord(billingObject, "metadata") ?? {};
  const { planTier, billingCycle } = resolvePlanSelection(bindings, billingObject, metadata);
  const effectiveStatus = reconciliation
    ? normalizeSubscriptionStatus(reconciliation.subscription.status)
    : "active";

  const accepted = await db.transaction(async (tx) => {
    const isNew = await insertAuditEventOrSkip(tx, orgId, event);
    if (!isNew) return false;

    const currentOrg = await tx.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
      columns: {
        stripeSubscriptionId: true,
        subscriptionStatus: true,
      },
    });
    if (
      !currentOrg ||
      currentOrg.stripeSubscriptionId !== invoiceSubscriptionId ||
      currentOrg.subscriptionStatus === "canceled"
    ) {
      return false;
    }
    const currentSubscriptionId = currentOrg.stripeSubscriptionId;
    if (!currentSubscriptionId) return false;

    const rows = await tx
      .update(organizations)
      .set({
        subscriptionStatus: effectiveStatus ?? "active",
        planTier: planTier ?? undefined,
        billingCycle: billingCycle ?? undefined,
        updatedAt: new Date(),
        ...stripeMutationAfterReconciliation(event, reconciliation),
      })
      .where(
        reconciliation
          ? stripeWhereAfterReconciliation(orgId, event, reconciliation)
          : freshStripeStateWhere(orgId, event, [
              eq(organizations.stripeSubscriptionId, currentSubscriptionId),
              ne(organizations.subscriptionStatus, "canceled"),
            ]),
      )
      .returning({ id: organizations.id });

    if (rows.length === 0 && reconciliation) throw new StripeConcurrentStateChangeError();
    return rows.length > 0;
  });
  if (!accepted) return;

  await captureBillingAnalytics(db, bindings, {
    orgId,
    eventName: ANALYTICS_EVENTS.paymentRecovered,
    stripeEventType: event.type,
    planTier,
    billingCycle,
    subscriptionStatus: effectiveStatus ?? "active",
    amountCents: pickAmountCents(invoice, ["amount_paid", "amount"]),
  });
}

async function handleInvoicePaymentFailed(
  db: Database,
  event: StripeEvent,
  bindings: Bindings | undefined,
) {
  const invoice = event.data.object;
  if (!isSubscriptionInvoice(invoice)) return;

  // Use resolveOrgIdForSubscription so customer DB lookup always takes
  // precedence over metadata.orgId — metadata cannot be trusted as authoritative.
  const orgId = await resolveOrgIdForSubscription(db, invoice);
  if (!orgId) return;

  const invoiceSubscriptionId = pickString(invoice, "subscription") ?? null;
  const reconciliation = await reconcileEqualPrioritySubscription(
    db,
    bindings,
    orgId,
    event,
    invoiceSubscriptionId,
    { requireBootstrapReconciliation: true },
  );
  const billingObject = reconciliation?.subscription ?? invoice;
  const metadata = pickRecord(billingObject, "metadata") ?? {};
  const { planTier, billingCycle } = resolvePlanSelection(bindings, billingObject, metadata);
  const effectiveStatus = reconciliation
    ? normalizeSubscriptionStatus(reconciliation.subscription.status)
    : "past_due";

  const accepted = await db.transaction(async (tx) => {
    const isNew = await insertAuditEventOrSkip(tx, orgId, event);
    if (!isNew) return false;

    const currentOrg = await tx.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
      columns: {
        stripeSubscriptionId: true,
        subscriptionStatus: true,
      },
    });
    if (
      !currentOrg ||
      currentOrg.stripeSubscriptionId !== invoiceSubscriptionId ||
      currentOrg.subscriptionStatus === "canceled"
    ) {
      return false;
    }
    const currentSubscriptionId = currentOrg.stripeSubscriptionId;
    if (!currentSubscriptionId) return false;

    const rows = await tx
      .update(organizations)
      .set({
        subscriptionStatus: effectiveStatus ?? "past_due",
        planTier: planTier ?? undefined,
        billingCycle: billingCycle ?? undefined,
        updatedAt: new Date(),
        ...stripeMutationAfterReconciliation(event, reconciliation),
      })
      .where(
        reconciliation
          ? stripeWhereAfterReconciliation(orgId, event, reconciliation)
          : freshStripeStateWhere(orgId, event, [
              eq(organizations.stripeSubscriptionId, currentSubscriptionId),
              ne(organizations.subscriptionStatus, "canceled"),
            ]),
      )
      .returning({ id: organizations.id });

    if (rows.length === 0 && reconciliation) throw new StripeConcurrentStateChangeError();
    return rows.length > 0;
  });
  if (!accepted) return;

  await captureBillingAnalytics(db, bindings, {
    orgId,
    eventName: ANALYTICS_EVENTS.paymentFailed,
    stripeEventType: event.type,
    planTier,
    billingCycle,
    subscriptionStatus: effectiveStatus ?? "past_due",
    amountCents: pickAmountCents(invoice, ["amount_due", "amount_remaining"]),
  });
}

async function handleSubscriptionTrialWillEnd(
  db: Database,
  bindings: Bindings | undefined,
  event: StripeEvent,
) {
  const subscription = event.data.object;
  const orgId = await resolveOrgIdForSubscription(db, subscription);
  if (!orgId) return;

  // Look up the org outside the tx, then re-read the notification timestamp
  // inside the transaction to keep Stripe retries idempotent.
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: { id: true, stripeSubscriptionId: true, trialWillEndNotifiedAt: true },
  });
  const subscriptionId = pickString(subscription, "id");
  if (!org || !subscriptionId || org.stripeSubscriptionId !== subscriptionId) return;

  const adminRecipient = await findOrgAdminRecipient(db, orgId);
  if (!adminRecipient) {
    console.warn("[billing] no admin member for org; skipping trial-ending email", { orgId });
    captureBackgroundException(
      new Error("Trial wrapup email skipped: missing admin member"),
      "billing",
      {
        org_id: orgId,
        lifecycle: "trial_wrapup",
        reason: "missing_admin_member",
      },
    );
    return;
  }
  if (!adminRecipient.email) {
    console.warn("[billing] no admin email for org; skipping trial-ending email", { orgId });
    captureBackgroundException(
      new Error("Trial wrapup email skipped: missing admin email"),
      "billing",
      {
        org_id: orgId,
        lifecycle: "trial_wrapup",
        reason: "missing_admin_email",
      },
    );
    return;
  }

  const incomingTrialEndsAt = trialEndsAtFromSubscription(subscription);

  const newlyScheduled = await db.transaction(async (tx) => {
    const isNew = await insertAuditEventOrSkip(tx, orgId, event);
    if (!isNew) return false;

    // Re-check notification timestamp inside the tx — guards against an
    // in-flight second delivery that slipped past the event idempotency.
    const fresh = await tx.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
      columns: {
        stripeSubscriptionId: true,
        trialEndsAt: true,
        trialWillEndNotifiedAt: true,
        trialWrapupNotifiedForEndAt: true,
      },
    });
    const wrapupTrialEndsAt =
      incomingTrialEndsAt instanceof Date ? incomingTrialEndsAt : fresh?.trialEndsAt;
    const notifiedForThisDeadline =
      wrapupTrialEndsAt instanceof Date &&
      (fresh?.trialWrapupNotifiedForEndAt
        ? fresh.trialWrapupNotifiedForEndAt.getTime() === wrapupTrialEndsAt.getTime()
        : fresh?.trialWillEndNotifiedAt != null);
    if (
      !fresh ||
      fresh.stripeSubscriptionId !== subscriptionId ||
      !(wrapupTrialEndsAt instanceof Date) ||
      (incomingTrialEndsAt instanceof Date &&
        fresh.trialEndsAt?.getTime() !== incomingTrialEndsAt.getTime()) ||
      notifiedForThisDeadline
    ) {
      return false;
    }

    return enqueueTrialWrapupEmail(tx, {
      orgId,
      userId: adminRecipient.userId,
      trialEndsAt: wrapupTrialEndsAt,
    });
  });
  if (!newlyScheduled) return;

  const metadata = pickRecord(subscription, "metadata") ?? {};
  const planTier = isPlanTier(metadata.planTier) ? metadata.planTier : undefined;
  const billingCycle = isBillingCycle(metadata.billingCycle) ? metadata.billingCycle : undefined;
  const subscriptionStatus = normalizeSubscriptionStatus(subscription.status);
  await captureBillingAnalytics(db, bindings, {
    orgId,
    eventName: ANALYTICS_EVENTS.trialWrapupScheduled,
    stripeEventType: event.type,
    planTier,
    billingCycle,
    subscriptionStatus,
  });
}

export async function processStripeEvent(db: Database, event: StripeEvent, bindings?: Bindings) {
  if (typeof event.account === "string" && event.account.length > 0) {
    return;
  }

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(db, event, bindings);
      break;
    case "customer.subscription.updated":
    case "customer.subscription.created":
      await handleSubscriptionUpdated(db, event, bindings);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(db, event, bindings);
      break;
    case "customer.subscription.trial_will_end":
      await handleSubscriptionTrialWillEnd(db, bindings, event);
      break;
    case "invoice.payment_succeeded":
      await handleInvoicePaymentSucceeded(db, event, bindings);
      break;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(db, event, bindings);
      break;
    default:
      // Unhandled events still acknowledged (Stripe expects 2xx).
      break;
  }
}

function isValidSignedStripeEventShape(event: StripeEvent): boolean {
  return (
    typeof event?.id === "string" &&
    event.id.length > 0 &&
    typeof event.type === "string" &&
    typeof event.created === "number" &&
    Number.isInteger(event.created) &&
    event.created >= 0 &&
    !!event.data?.object
  );
}

export async function handleStripeWebhookRequest(params: {
  db: Database;
  bindings: Bindings;
  request: Request;
  now?: number;
}): Promise<{ status: 200 | 400 | 503; body: Record<string, unknown> }> {
  const secret = params.bindings.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    captureBackgroundException(new Error("Stripe webhook secret is not configured"), "billing", {
      step: "webhook_config",
    });
    return { status: 503, body: { error: "stripe_webhook_unconfigured" } };
  }
  const payload = await params.request.text();
  const valid = await verifyStripeSignature({
    payload,
    header: params.request.headers.get("stripe-signature"),
    secret,
    now: params.now,
  });
  if (!valid) {
    return { status: 400, body: { error: "invalid_signature" } };
  }
  let event: StripeEvent;
  try {
    event = JSON.parse(payload) as StripeEvent;
  } catch {
    return { status: 400, body: { error: "invalid_payload" } };
  }
  if (!isValidSignedStripeEventShape(event)) {
    return { status: 400, body: { error: "invalid_event_shape" } };
  }
  try {
    await processStripeEvent(params.db, event, params.bindings);
  } catch (error) {
    if (error instanceof StripeSubscriptionIdentityMismatchError) {
      return { status: 200, body: { received: true } };
    }
    if (error instanceof StripeReconciliationUnavailableError) {
      return { status: 503, body: { error: "stripe_reconciliation_unavailable" } };
    }
    if (error instanceof StripeConcurrentStateChangeError) {
      captureBackgroundException(error, "billing", {
        reason: "stripe_concurrent_state_change",
        step: "webhook_reconciliation",
      });
      return { status: 503, body: { error: "stripe_reconciliation_unavailable" } };
    }
    throw error;
  }
  return { status: 200, body: { received: true } };
}

export const billingWebhookRoutes = new Hono<AppEnv>().post(
  "/webhook",
  jsonBodyLimit(STRIPE_WEBHOOK_MAX_BODY_BYTES),
  async (c) => {
    const result = await handleStripeWebhookRequest({
      db: c.get("db"),
      bindings: c.env,
      request: c.req.raw,
    });
    return c.json(result.body, result.status);
  },
);
