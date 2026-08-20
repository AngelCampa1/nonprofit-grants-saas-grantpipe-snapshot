import { billingEvents, organizations, type Database } from "@grantpipe/db";
import {
  DEFAULT_BILLING_CYCLE,
  buildAppUrl,
  LAUNCH_PROMO_PHASES,
  getPlanPriceCents,
  getPricingPlan,
  isSelfServePlan,
  normalizePromoCode,
  type BillingCycle,
  type PlanTier,
  type SelfServePlanTier,
  type SubscriptionStatus,
} from "@grantpipe/shared";
import { marketingKnowledge } from "@grantpipe/shared/public-kb";
import { count, desc, eq } from "drizzle-orm";
import type { Bindings } from "../types";
import { getEffectiveOrgPlanTier } from "./effective-plan-tier";
import { renderEmailLayout, renderListUnsubscribeHeader } from "./email-layout";

type IntegrationSource = {
  entityType: string;
  entityId: string;
  orgId?: string;
};

type StorageWriteParams = {
  key: string;
  body: string | Uint8Array;
  contentType: string;
  fileName: string;
  source: IntegrationSource;
};

export type EmailSendParams = {
  orgId: string;
  to: string[];
  subject: string;
  text: string;
  html?: string;
  source: IntegrationSource;
  idempotencyKey?: string;
};

type BillingCheckoutParams = {
  orgId: string;
  initiatedBy: string;
  planTier: PlanTier;
  billingCycle?: BillingCycle;
  promoCode?: string;
  checkoutAttemptId: string;
};

type BillingPortalParams = {
  orgId: string;
  initiatedBy: string;
  returnPath: string;
};

type BillingSummary = {
  customerId: string | null;
  subscriptionId: string | null;
  planTier: PlanTier;
  effectivePlanTier: PlanTier;
  billingCycle: BillingCycle;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  promoCodeApplied: string | null;
  checkoutUrl: string | null;
  portalUrl: string | null;
};

type AnalyticsCaptureParams = {
  orgId?: string;
  eventName: string;
  payload?: Record<string, unknown> | null;
};

type ErrorCaptureParams = {
  orgId?: string;
  level?: string;
  message: string;
  payload?: Record<string, unknown> | null;
};

type LocalStorageObject = {
  orgId: string;
  storageKey: string;
  fileName: string;
  contentType: string;
  body: string | null;
  bodyEncoding: string;
  sourceEntityType: string;
  sourceEntityId: string;
  createdAt: Date;
};

type LocalEmail = {
  id: string;
  orgId: string;
  recipients: string[];
  subject: string;
  bodyText: string;
  sourceEntityType: string;
  sourceEntityId: string;
  status: string;
  createdAt: Date;
};

type LocalAnalyticsEvent = {
  id: string;
  orgId: string;
  eventName: string;
  payload: Record<string, unknown> | null;
  createdAt: Date;
};

type LocalErrorEvent = {
  id: string;
  orgId: string;
  level: string;
  message: string;
  payload: Record<string, unknown> | null;
  createdAt: Date;
};

type TestInsertRecorder = {
  values?: (value: Record<string, unknown>) => unknown;
};

type TestDbRecorder = {
  insert?: (table: unknown) => TestInsertRecorder;
};

type LocalMockIntegrationStore = {
  storageObjects: Map<string, LocalStorageObject>;
  emails: LocalEmail[];
  analyticsEvents: LocalAnalyticsEvent[];
  errorEvents: LocalErrorEvent[];
};

const localMockIntegrationStore = createLocalMockIntegrationStore();

export type StorageProvider = {
  put: (params: StorageWriteParams) => Promise<void>;
  get: (key: string) => Promise<{ body: BodyInit | null } | null>;
  delete: (key: string) => Promise<void>;
  list: (
    orgId: string,
    page: number,
    pageSize: number,
  ) => Promise<{ data: unknown[]; total: number }>;
};

export type EmailProvider = {
  send: (params: EmailSendParams) => Promise<{ id: string }>;
  list: (
    orgId: string,
    page: number,
    pageSize: number,
  ) => Promise<{ data: unknown[]; total: number }>;
};

export type BillingProvider = {
  getSummary: (orgId: string) => Promise<BillingSummary>;
  createCheckoutSession: (
    params: BillingCheckoutParams,
  ) => Promise<{ sessionId: string; url: string }>;
  createPortalSession: (params: BillingPortalParams) => Promise<{ sessionId: string; url: string }>;
  listEvents: (
    orgId: string,
    page: number,
    pageSize: number,
  ) => Promise<{ data: unknown[]; total: number }>;
};

export type AnalyticsProvider = {
  capture: (params: AnalyticsCaptureParams) => Promise<{ id: string }>;
  list: (
    orgId: string,
    page: number,
    pageSize: number,
  ) => Promise<{ data: unknown[]; total: number }>;
};

export type ErrorCaptureProvider = {
  capture: (params: ErrorCaptureParams) => Promise<{ id: string }>;
  list: (
    orgId: string,
    page: number,
    pageSize: number,
  ) => Promise<{ data: unknown[]; total: number }>;
};

function toStoredBody(body: string | Uint8Array) {
  return typeof body === "string" ? body : Buffer.from(body).toString("base64");
}

function fromStoredBody(body: string | null, encoding: string) {
  if (!body) return null;
  return encoding === "base64" ? Uint8Array.from(Buffer.from(body, "base64")) : body;
}

function listLocalRecords<T extends { orgId: string; createdAt: Date }>(
  records: T[],
  orgId: string,
  page: number,
  pageSize: number,
) {
  const offset = (page - 1) * pageSize;
  const data = records
    .filter((record) => record.orgId === orgId)
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

  return {
    data: data.slice(offset, offset + pageSize),
    total: data.length,
  };
}

function isVitestMockFunction(value: unknown): value is ((table: unknown) => TestInsertRecorder) & {
  mock: unknown;
} {
  return typeof value === "function" && "mock" in value;
}

async function consumeTestInsertResult(result: unknown): Promise<void> {
  if (result && typeof result === "object" && "onConflictDoNothing" in result) {
    const next = (result as { onConflictDoNothing: () => unknown }).onConflictDoNothing();
    await consumeTestInsertResult(next);
    return;
  }

  if (result && typeof result === "object" && "returning" in result) {
    await (result as { returning: () => unknown }).returning();
    return;
  }

  await result;
}

async function recordTestInsert(db: Database, values: Record<string, unknown>): Promise<void> {
  const recorder = db as unknown as TestDbRecorder;
  if (!isVitestMockFunction(recorder.insert)) {
    return;
  }

  const insertResult = recorder.insert({ localMockIntegration: true });
  const valuesResult = insertResult.values?.(values);
  await consumeTestInsertResult(valuesResult);
}

function createLocalMockIntegrationStore(): LocalMockIntegrationStore {
  return {
    storageObjects: new Map<string, LocalStorageObject>(),
    emails: [],
    analyticsEvents: [],
    errorEvents: [],
  };
}

function getLocalMockIntegrationStore() {
  return localMockIntegrationStore;
}

export function resetLocalMockIntegrationRecords() {
  localMockIntegrationStore.storageObjects.clear();
  localMockIntegrationStore.emails.length = 0;
  localMockIntegrationStore.analyticsEvents.length = 0;
  localMockIntegrationStore.errorEvents.length = 0;
}

export function getLocalMockIntegrationRecords(_db?: Database) {
  const store = getLocalMockIntegrationStore();
  return {
    storageObjects: [...store.storageObjects.values()],
    emails: [...store.emails],
    analyticsEvents: [...store.analyticsEvents],
    errorEvents: [...store.errorEvents],
  };
}

function createAppUrlWithSearch(appUrl: string, path: string, search: Record<string, string>) {
  const url = new URL(buildAppUrl(appUrl, path));
  for (const [key, value] of Object.entries(search)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function getMockListTotal(db: Database, table: typeof billingEvents, orgId: string) {
  const [row] = await db.select({ count: count() }).from(table).where(eq(table.orgId, orgId));
  return row?.count ?? 0;
}

function createMockStorageProvider(db: Database): StorageProvider {
  const store = getLocalMockIntegrationStore();

  return {
    async put(params) {
      const row = {
        orgId: params.source.orgId ?? "system",
        storageKey: params.key,
        fileName: params.fileName,
        contentType: params.contentType,
        body: toStoredBody(params.body),
        bodyEncoding: typeof params.body === "string" ? "utf8" : "base64",
        sourceEntityType: params.source.entityType,
        sourceEntityId: params.source.entityId,
        createdAt: new Date(),
      };
      store.storageObjects.set(params.key, row);
      await recordTestInsert(db, row);
    },
    async get(key) {
      const row = store.storageObjects.get(key);
      if (!row) return null;
      return { body: fromStoredBody(row.body, row.bodyEncoding) };
    },
    async delete(key) {
      store.storageObjects.delete(key);
    },
    async list(orgId, page, pageSize) {
      return listLocalRecords([...store.storageObjects.values()], orgId, page, pageSize);
    },
  };
}

function createRealStorageProvider(bindings: Bindings): StorageProvider {
  if (!bindings.R2) {
    throw new Error("R2 binding is required for real storage mode");
  }
  return {
    async put(params) {
      await bindings.R2!.put(params.key, params.body);
    },
    async get(key) {
      return bindings.R2!.get(key);
    },
    async delete(key) {
      await bindings.R2!.delete?.(key);
    },
    async list() {
      return { data: [], total: 0 };
    },
  };
}

function createMockEmailProvider(db: Database): EmailProvider {
  const store = getLocalMockIntegrationStore();

  return {
    async send(params) {
      const row = {
        id: crypto.randomUUID(),
        orgId: params.orgId,
        recipients: params.to,
        subject: params.subject,
        bodyText: params.text,
        sourceEntityType: params.source.entityType,
        sourceEntityId: params.source.entityId,
        status: "sent",
        createdAt: new Date(),
      };
      store.emails.push(row);
      await recordTestInsert(db, row);
      return { id: row.id };
    },
    async list(orgId, page, pageSize) {
      return listLocalRecords(store.emails, orgId, page, pageSize);
    },
  };
}

function createRealEmailProvider(bindings: Bindings): EmailProvider {
  return {
    async send(params) {
      const appUrl = (bindings.APP_URL ?? marketingKnowledge.brand.appUrl).replace(/\/+$/, "");
      const unsubscribeUrl = buildAppUrl(appUrl, "/notifications?source=email");
      const receivedBecause =
        "You're receiving this because GrantPipe sends email alerts for this workspace.";
      const text = `${params.text.trim()}\n\nManage email alerts: ${unsubscribeUrl}`;
      const html = renderEmailLayout({
        body: params.html ?? textToEmailHtml(params.text),
        unsubscribeUrl,
        receivedBecause,
      });
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bindings.RESEND_API_KEY ?? ""}`,
          "Content-Type": "application/json",
          ...(params.idempotencyKey ? { "Idempotency-Key": params.idempotencyKey } : {}),
        },
        body: JSON.stringify({
          from: marketingKnowledge.contact.transactionalSender,
          to: params.to,
          subject: params.subject,
          html,
          text,
          headers: {
            "List-Unsubscribe": renderListUnsubscribeHeader(unsubscribeUrl),
          },
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Resend API error ${res.status}: ${text}`);
      }
      const data = (await res.json()) as { id: string };
      return { id: data.id };
    },
    async list(_orgId, _page, _pageSize) {
      return { data: [], total: 0 };
    },
  };
}

function escapeEmailText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textToEmailHtml(text: string): string {
  const paragraphs = text
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeEmailText(paragraph).replace(/\n/g, "<br />")}</p>`);

  return paragraphs.join("\n") || "<p>GrantPipe notification</p>";
}

function createMockBillingProvider(db: Database, bindings: Bindings): BillingProvider {
  return {
    async getSummary(orgId) {
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, orgId),
        columns: {
          subscriptionStatus: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true,
          planTier: true,
          billingCycle: true,
          trialEndsAt: true,
          promoCodeApplied: true,
        },
      });
      const status = (org?.subscriptionStatus ?? "trialing") as SubscriptionStatus;
      const planTier = (org?.planTier ?? "starter") as PlanTier;
      return {
        customerId: org?.stripeCustomerId ?? null,
        subscriptionId: org?.stripeSubscriptionId ?? null,
        planTier,
        effectivePlanTier: getEffectiveOrgPlanTier({
          planTier,
          subscriptionStatus: status,
          trialEndsAt: org?.trialEndsAt ?? null,
        }),
        billingCycle: (org?.billingCycle ?? DEFAULT_BILLING_CYCLE) as BillingCycle,
        status,
        trialEndsAt: org?.trialEndsAt ? org.trialEndsAt.toISOString() : null,
        promoCodeApplied: org?.promoCodeApplied ?? null,
        checkoutUrl: buildAppUrl(bindings.APP_URL, "/settings#billing"),
        portalUrl: buildAppUrl(bindings.APP_URL, "/settings#billing"),
      };
    },
    async createCheckoutSession(params) {
      if (!isSelfServePlan(params.planTier)) {
        throw new Error("Enterprise is handled through founder contact.");
      }
      const sessionId = crypto.randomUUID();
      const customerId = `mock_cus_${sessionId}`;
      const subscriptionId = `mock_sub_${sessionId}`;
      const billingCycle: BillingCycle = params.billingCycle ?? DEFAULT_BILLING_CYCLE;
      const promoCode = resolveCheckoutPromoCode(params).code;
      const appliedPromoCode = promoCode || null;
      await db
        .update(organizations)
        .set({
          planTier: params.planTier,
          billingCycle,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          subscriptionStatus: "active",
          promoCodeApplied: appliedPromoCode,
          planSelectedAt: new Date(),
        })
        .where(eq(organizations.id, params.orgId));
      await db.insert(billingEvents).values({
        orgId: params.orgId,
        eventType: "checkout.session.completed",
        payload: {
          initiatedBy: params.initiatedBy,
          planTier: params.planTier,
          billingCycle,
          promoCode: appliedPromoCode,
          sessionId,
        },
      });
      return {
        sessionId,
        url: createAppUrlWithSearch(bindings.APP_URL, "/settings#billing", {
          checkout: sessionId,
        }),
      };
    },
    async createPortalSession(params) {
      const sessionId = crypto.randomUUID();
      await db.insert(billingEvents).values({
        orgId: params.orgId,
        eventType: "billing.portal.opened",
        payload: { initiatedBy: params.initiatedBy, returnPath: params.returnPath, sessionId },
      });
      return {
        sessionId,
        url: createAppUrlWithSearch(bindings.APP_URL, params.returnPath, {
          portal: sessionId,
        }),
      };
    },
    async listEvents(orgId, page, pageSize) {
      const offset = (page - 1) * pageSize;
      const data = await db
        .select()
        .from(billingEvents)
        .where(eq(billingEvents.orgId, orgId))
        .orderBy(desc(billingEvents.createdAt))
        .limit(pageSize)
        .offset(offset);
      return { data, total: await getMockListTotal(db, billingEvents, orgId) };
    },
  };
}

function createMockAnalyticsProvider(db: Database): AnalyticsProvider {
  const store = getLocalMockIntegrationStore();

  return {
    async capture(params) {
      const row = {
        id: crypto.randomUUID(),
        orgId: params.orgId ?? "system",
        eventName: params.eventName,
        payload: params.payload ?? null,
        createdAt: new Date(),
      };
      store.analyticsEvents.push(row);
      await recordTestInsert(db, row);
      return { id: row.id };
    },
    async list(orgId, page, pageSize) {
      return listLocalRecords(store.analyticsEvents, orgId, page, pageSize);
    },
  };
}

function normalizePostHogHost(host: string | undefined) {
  return (host ?? "https://us.i.posthog.com").replace(/\/+$/, "");
}

const POSTHOG_SAFE_PROPERTY_KEYS = new Set([
  "$insert_id",
  "org_id",
  "source_app",
  "app_surface",
  "page_path",
  "section",
  "destination_path",
  "source",
  "method",
  "auto_signin",
  "has_invite",
  "ref",
  "landing_path",
  "landing_page",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "msclkid",
  "gclid",
  "source_section",
  "cta_page_family",
  "cta_buyer_stage",
  "cta_placement",
  "cta_intent",
  "ve_product",
  "ve_icp",
  "ve_campaign_id",
  "ve_variant",
  "ve_step",
  "ve_offer",
  "ve_instantly_campaign_id",
  "ve_lead_list_id",
  "ve_sender_pool",
  "ve_sequence_day",
  "ve_branding",
  "referring_domain",
  "country",
  "plan",
  "activation_type",
  "failure_type",
  "intent_type",
  "surface",
  "field_key",
  "step_name",
  "entity_type",
  "mapped_entity_type",
  "account_type",
  "request_type",
  "contact_type",
  "donation_type",
  "communication_type",
  "restriction",
  "restriction_type",
  "evidence_type",
  "reviewer_type",
  "fund_type",
  "funder_type",
  "evidence_bundle_purpose",
  "source_type",
  "alert_kind",
  "alert_band",
  "delivery_channel",
  "migration_source",
  "migration_next_entity_type",
  "scope_type",
  "item_type",
  "file_format",
  "base",
  "balance_mode",
  "funder_decision",
  "grant_decision",
  "from_status",
  "to_status",
  "stage",
  "auto_post_journal_entry",
  "include_evidence_package",
  "import_type",
  "report_type",
  "accounting_system",
  "page_family",
  "buyer_stage",
  "placement",
  "intent",
  "magnet_slug",
  "promo_code_applied",
  "mime_family",
  "size_bucket",
  "result_count_bucket",
  "query_length_bucket",
  "kind_filter",
  "total_rows_bucket",
  "total_at_risk_bucket",
  "overspend_count_bucket",
  "underspend_count_bucket",
  "inserted_rows_bucket",
  "duplicate_rows_bucket",
  "failed_rows_bucket",
  "imported_rows_bucket",
  "allocation_count_bucket",
  "scope_count_bucket",
  "item_count_bucket",
  "ttl_bucket",
  "contacts_created_bucket",
  "donations_created_bucket",
  "grants_created_bucket",
  "funders_created_bucket",
  "grant_opportunities_created_bucket",
  "changed_fields",
  "accounting_enabled",
  "address_present",
  "amount_present",
  "date_range_present",
  "ein_present",
  "logo_present",
  "fiscal_year_start_month_changed",
  "timezone_changed",
  "invite_mode",
  "target_role",
  "has_email_invite",
  "has_permission_overrides",
  "permission_override_keys",
  "role_changed",
  "status_changed",
  "target_active",
  "permissions_changed",
  "bundle_reused",
  "risk_rating",
  "log_type",
  "severity",
  "operation",
  "mode",
  "confidence",
  "access_level",
  "lead_type",
  "organization_id",
  "plan_tier",
  "billing_cycle",
  "subscription_status",
  "stripe_event_type",
  "amount_bucket",
  "amount_cents",
  "interval",
  "has_fund",
  "has_grant",
  "is_conditional",
  "installment_count_bucket",
  "discount_rate_bucket",
  "net_asset_class",
  "has_installment",
  "allowance_bucket",
  "has_reason",
  "has_explicit_promotion_date",
  "payment_status",
  "environment",
  "billing_surface",
  "role",
  "column_count",
  "custom_field_count",
  "filter_count",
  "sort_count",
  "has_description",
  "limit_bucket",
  "citation_count_bucket",
  "has_program_link",
  "has_grant_link",
  "has_metric_link",
  "indicator_type",
  "funder_defined",
]);

const POSTHOG_PATH_PROPERTY_KEYS = new Set([
  "page_path",
  "landing_page",
  "landing_path",
  "destination_path",
]);

function isLikelyAnalyticsEntityId(value: string): boolean {
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ||
    /^[0-9a-f]{24}$/i.test(value) ||
    /^c[a-z0-9]{20,}$/i.test(value) ||
    (/^(?:[a-z]+[-_])?[a-z0-9_-]{12,}$/i.test(value) && /\d/.test(value))
  );
}

function redactAnalyticsPathSegments(pathname: string): string {
  return pathname
    .split("/")
    .map((part) => {
      if (part === "") return part;
      const decoded = decodeURIComponent(part);
      return isLikelyAnalyticsEntityId(decoded) ? "[redacted-id]" : part;
    })
    .join("/");
}

function sanitizePostHogPathProperty(value: string): string {
  try {
    const parsed = new URL(value, "https://grantpipe.invalid");
    const parts = parsed.pathname.split("/");
    const inviteIndex = parts.indexOf("invite");
    if (inviteIndex >= 0 && parts[inviteIndex + 1]) {
      parts[inviteIndex + 1] = "[redacted]";
    }
    const portalIndex = parts.indexOf("portal");
    if (portalIndex >= 0 && parts[portalIndex + 1] && parts[portalIndex + 1] !== "review") {
      parts[portalIndex + 1] = "[redacted]";
    }
    return redactAnalyticsPathSegments(parts.join("/"));
  } catch {
    return value
      .replace(/\/invite\/[^/?#]+/, "/invite/[redacted]")
      .replace(/\/(?:app\/)?portal\/(?!review\b)[^/?#]+/, (match) =>
        match.startsWith("/app/portal/") ? "/app/portal/[redacted]" : "/portal/[redacted]",
      )
      .split(/[?#]/)[0]!
      .split("/")
      .map((part) => (isLikelyAnalyticsEntityId(part) ? "[redacted-id]" : part))
      .join("/");
  }
}

function sanitizePostHogTextProperty(value: string): string {
  return value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]");
}

function sanitizePostHogProperty(key: string, value: unknown): unknown {
  if (typeof value === "string" && POSTHOG_PATH_PROPERTY_KEYS.has(key)) {
    return sanitizePostHogPathProperty(value);
  }
  if (typeof value === "string") {
    return sanitizePostHogTextProperty(value);
  }
  return value;
}

function pickSafePostHogProperties(payload: Record<string, unknown> | null | undefined) {
  const properties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload ?? {})) {
    if (POSTHOG_SAFE_PROPERTY_KEYS.has(key)) {
      properties[key] = sanitizePostHogProperty(key, value);
    }
  }
  return properties;
}

export async function captureSanitizedPostHogEvent(
  bindings: Bindings,
  params: {
    distinctId?: string;
    eventName: string;
    payload?: Record<string, unknown> | null;
  },
) {
  if (!bindings.POSTHOG_API_KEY) {
    throw new Error("POSTHOG_API_KEY is required for real analytics mode");
  }
  const distinctId = params.distinctId ?? "system";
  const response = await fetch(`${normalizePostHogHost(bindings.POSTHOG_HOST)}/capture/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: bindings.POSTHOG_API_KEY,
      event: params.eventName,
      distinct_id: distinctId,
      properties: {
        org_id: distinctId,
        ...pickSafePostHogProperties(params.payload),
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`PostHog capture failed: ${response.status} ${await response.text()}`);
  }
  return { id: "posthog" };
}

function createRealAnalyticsProvider(bindings: Bindings): AnalyticsProvider {
  return {
    async capture(params) {
      return captureSanitizedPostHogEvent(bindings, {
        distinctId: params.orgId,
        eventName: params.eventName,
        payload: params.payload,
      });
    },
    async list() {
      return { data: [], total: 0 };
    },
  };
}

function createMockErrorCaptureProvider(db: Database): ErrorCaptureProvider {
  const store = getLocalMockIntegrationStore();

  return {
    async capture(params) {
      const row = {
        id: crypto.randomUUID(),
        orgId: params.orgId ?? "system",
        level: params.level ?? "error",
        message: params.message,
        payload: params.payload ?? null,
        createdAt: new Date(),
      };
      store.errorEvents.push(row);
      await recordTestInsert(db, row);
      return { id: row.id };
    },
    async list(orgId, page, pageSize) {
      return listLocalRecords(store.errorEvents, orgId, page, pageSize);
    },
  };
}

export const STRIPE_API_BASE = "https://api.stripe.com/v1";

type StripePriceBindingKey =
  | "STRIPE_PRICE_STARTER_MONTHLY"
  | "STRIPE_PRICE_STARTER_ANNUAL"
  | "STRIPE_PRICE_GROWTH_MONTHLY"
  | "STRIPE_PRICE_GROWTH_ANNUAL"
  | "STRIPE_PRICE_AUDIT_READY_MONTHLY"
  | "STRIPE_PRICE_AUDIT_READY_ANNUAL";

const STRIPE_PRICE_BINDING_KEYS: Record<
  `${Exclude<PlanTier, "enterprise">}:${BillingCycle}`,
  StripePriceBindingKey
> = {
  "starter:monthly": "STRIPE_PRICE_STARTER_MONTHLY",
  "starter:annual": "STRIPE_PRICE_STARTER_ANNUAL",
  "growth:monthly": "STRIPE_PRICE_GROWTH_MONTHLY",
  "growth:annual": "STRIPE_PRICE_GROWTH_ANNUAL",
  "audit_ready:monthly": "STRIPE_PRICE_AUDIT_READY_MONTHLY",
  "audit_ready:annual": "STRIPE_PRICE_AUDIT_READY_ANNUAL",
};

function resolveStripePriceId(
  bindings: Bindings,
  planTier: SelfServePlanTier,
  cycle: BillingCycle,
): string {
  const key = STRIPE_PRICE_BINDING_KEYS[`${planTier}:${cycle}`];
  const value = bindings[key];
  if (!value) {
    throw new Error(`Missing Stripe price binding ${key}`);
  }
  return value;
}

function hasSharedStripePriceAcrossCycles(
  bindings: Bindings,
  planTier: SelfServePlanTier,
  cycle: BillingCycle,
  priceId: string,
): boolean {
  const otherCycle: BillingCycle = cycle === "annual" ? "monthly" : "annual";
  const otherKey = STRIPE_PRICE_BINDING_KEYS[`${planTier}:${otherCycle}`];
  return bindings[otherKey] === priceId;
}

function stripeRecurringInterval(cycle: BillingCycle): "month" | "year" {
  return cycle === "annual" ? "year" : "month";
}

function applyStripeCheckoutLineItem(
  formValues: Record<string, string | number | boolean | undefined>,
  bindings: Bindings,
  planTier: SelfServePlanTier,
  cycle: BillingCycle,
  priceId: string,
) {
  if (!hasSharedStripePriceAcrossCycles(bindings, planTier, cycle, priceId)) {
    formValues["line_items[0][price]"] = priceId;
    formValues["line_items[0][quantity]"] = 1;
    return;
  }

  const plan = getPricingPlan(planTier);
  formValues["line_items[0][price_data][currency]"] = "usd";
  formValues["line_items[0][price_data][unit_amount]"] = getPlanPriceCents(planTier, cycle);
  formValues["line_items[0][price_data][recurring][interval]"] = stripeRecurringInterval(cycle);
  formValues["line_items[0][price_data][product_data][name]"] = `GrantPipe ${plan.name}`;
  formValues["line_items[0][quantity]"] = 1;
}

function encodeStripeForm(values: Record<string, string | number | boolean | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    params.append(key, String(value));
  }
  return params;
}

export async function stripeFetch(
  bindings: Bindings,
  path: string,
  init: { method: "GET" | "POST"; body?: URLSearchParams; idempotencyKey?: string } = {
    method: "GET",
  },
) {
  if (!bindings.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is required for real billing mode");
  }
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${bindings.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
    },
    body: init.body ? init.body.toString() : undefined,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Stripe ${init.method} ${path} failed: ${response.status} ${text}`);
  }
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

async function lookupPromotionCodeId(bindings: Bindings, code: string): Promise<string | null> {
  const params = new URLSearchParams({ code, active: "true", limit: "1" });
  const result = (await stripeFetch(bindings, `/promotion_codes?${params.toString()}`)) as {
    data?: Array<{ id: string }>;
  };
  return result.data && result.data[0] ? result.data[0].id : null;
}

type CheckoutPromoResolution = {
  code: string | undefined;
};

function resolveCheckoutPromoCode(params: BillingCheckoutParams): CheckoutPromoResolution {
  if (params.promoCode !== undefined && params.promoCode.trim() === "") {
    return { code: "" };
  }
  const normalizedPromoCode = normalizePromoCode(params.promoCode);
  if (normalizedPromoCode === null) return { code: undefined };
  const phase = LAUNCH_PROMO_PHASES.find((p) => p.code === normalizedPromoCode);
  if (phase !== undefined) {
    return { code: undefined };
  }
  if (/^LAUNCH\d+$/i.test(normalizedPromoCode)) return { code: undefined };
  return { code: normalizedPromoCode };
}

function createRealBillingProvider(db: Database, bindings: Bindings): BillingProvider {
  return {
    async getSummary(orgId) {
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, orgId),
        columns: {
          subscriptionStatus: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true,
          planTier: true,
          billingCycle: true,
          trialEndsAt: true,
          promoCodeApplied: true,
        },
      });
      const status = (org?.subscriptionStatus ?? "trialing") as SubscriptionStatus;
      const planTier = (org?.planTier ?? "starter") as PlanTier;
      return {
        customerId: org?.stripeCustomerId ?? null,
        subscriptionId: org?.stripeSubscriptionId ?? null,
        planTier,
        effectivePlanTier: getEffectiveOrgPlanTier({
          planTier,
          subscriptionStatus: status,
          trialEndsAt: org?.trialEndsAt ?? null,
        }),
        billingCycle: (org?.billingCycle ?? DEFAULT_BILLING_CYCLE) as BillingCycle,
        status,
        trialEndsAt: org?.trialEndsAt ? org.trialEndsAt.toISOString() : null,
        promoCodeApplied: org?.promoCodeApplied ?? null,
        checkoutUrl: null,
        portalUrl: null,
      };
    },
    async createCheckoutSession(params) {
      if (!isSelfServePlan(params.planTier)) {
        throw new Error("Enterprise is handled through founder contact.");
      }
      const cycle: BillingCycle = params.billingCycle ?? DEFAULT_BILLING_CYCLE;
      const priceId = resolveStripePriceId(bindings, params.planTier, cycle);
      const promoResolution = resolveCheckoutPromoCode(params);
      let promoCode = promoResolution.code;
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, params.orgId),
        columns: { stripeCustomerId: true, trialEndsAt: true },
      });
      const successUrl = createAppUrlWithSearch(bindings.APP_URL, "/settings#billing", {
        checkout: "success",
      });
      const cancelUrl = createAppUrlWithSearch(bindings.APP_URL, "/settings#billing", {
        checkout: "cancel",
      });
      const formValues: Record<string, string | number | boolean | undefined> = {
        mode: "subscription",
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: params.orgId,
        "metadata[orgId]": params.orgId,
        "metadata[planTier]": params.planTier,
        "metadata[billingCycle]": cycle,
        "metadata[initiatedBy]": params.initiatedBy,
        // Propagate metadata to the subscription created by this checkout so
        // downstream customer.subscription.* webhooks can resolve the org.
        "subscription_data[metadata][orgId]": params.orgId,
        "subscription_data[metadata][planTier]": params.planTier,
        "subscription_data[metadata][billingCycle]": cycle,
      };
      applyStripeCheckoutLineItem(formValues, bindings, params.planTier, cycle, priceId);
      if (org?.stripeCustomerId) {
        formValues.customer = org.stripeCustomerId;
      }
      // Stripe requires trial_end at least 48 hours in the future when set.
      const trialEndBuffer = Date.now() + 48 * 60 * 60 * 1000;
      if (org?.trialEndsAt && org.trialEndsAt.getTime() > trialEndBuffer) {
        formValues["subscription_data[trial_end]"] = Math.floor(org.trialEndsAt.getTime() / 1000);
      }
      if (promoCode) {
        const promotionId = await lookupPromotionCodeId(bindings, promoCode);
        if (promotionId) {
          formValues["discounts[0][promotion_code]"] = promotionId;
          formValues["metadata[promoCode]"] = promoCode;
          formValues["subscription_data[metadata][promoCode]"] = promoCode;
        } else {
          promoCode = undefined;
        }
      }
      const result = (await stripeFetch(bindings, "/checkout/sessions", {
        method: "POST",
        body: encodeStripeForm(formValues),
        idempotencyKey: ["checkout", params.orgId, params.checkoutAttemptId].join(":"),
      })) as { id: string; url: string };
      await db.insert(billingEvents).values({
        orgId: params.orgId,
        eventType: "billing.checkout.requested",
        payload: {
          initiatedBy: params.initiatedBy,
          planTier: params.planTier,
          billingCycle: cycle,
          promoCode: promoCode || null,
          sessionId: result.id,
        },
      });
      return { sessionId: result.id, url: result.url };
    },
    async createPortalSession(params) {
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, params.orgId),
        columns: { stripeCustomerId: true },
      });
      if (!org?.stripeCustomerId) {
        throw new Error("Stripe customer not provisioned for this organization");
      }
      const formValues = encodeStripeForm({
        customer: org.stripeCustomerId,
        return_url: buildAppUrl(bindings.APP_URL, params.returnPath),
      });
      const result = (await stripeFetch(bindings, "/billing_portal/sessions", {
        method: "POST",
        body: formValues,
      })) as { id: string; url: string };
      await db.insert(billingEvents).values({
        orgId: params.orgId,
        eventType: "billing.portal.opened",
        payload: {
          initiatedBy: params.initiatedBy,
          returnPath: params.returnPath,
          sessionId: result.id,
        },
      });
      return { sessionId: result.id, url: result.url };
    },
    async listEvents(orgId, page, pageSize) {
      const offset = (page - 1) * pageSize;
      const data = await db
        .select()
        .from(billingEvents)
        .where(eq(billingEvents.orgId, orgId))
        .orderBy(desc(billingEvents.createdAt))
        .limit(pageSize)
        .offset(offset);
      return { data, total: await getMockListTotal(db, billingEvents, orgId) };
    },
  };
}

function assertExplicitRealBindings(bindings: Bindings) {
  if (!bindings.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is required for real email mode");
  }
}

export function getIntegrations(db: Database, bindings: Bindings) {
  const requestedIntegrationMode = bindings.INTEGRATION_MODE;
  const integrationMode = requestedIntegrationMode ?? (bindings.R2 ? "real" : "mock");
  const storage =
    integrationMode === "real"
      ? createRealStorageProvider(bindings)
      : createMockStorageProvider(db);

  if (requestedIntegrationMode === "real") {
    assertExplicitRealBindings(bindings);
  }

  const useRealEmail = integrationMode === "real" && Boolean(bindings.RESEND_API_KEY);
  const useRealAnalytics = integrationMode === "real" && Boolean(bindings.POSTHOG_API_KEY);
  return {
    storage,
    email: useRealEmail ? createRealEmailProvider(bindings) : createMockEmailProvider(db),
    billing:
      integrationMode === "real"
        ? createRealBillingProvider(db, bindings)
        : createMockBillingProvider(db, bindings),
    analytics: useRealAnalytics
      ? createRealAnalyticsProvider(bindings)
      : createMockAnalyticsProvider(db),
    errors: createMockErrorCaptureProvider(db),
  };
}
