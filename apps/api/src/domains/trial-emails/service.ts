import { and, eq, gt, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import {
  notificationPreferences,
  orgMembers,
  organizations,
  trialEmailSchedule,
  user as userTable,
} from "@grantpipe/db";
import type { Database, TransactionDatabase } from "@grantpipe/db";
import { marketingKnowledge } from "@grantpipe/shared/public-kb";
import { ANALYTICS_EVENTS, buildAppUrl, isWithinBusinessHours } from "@grantpipe/shared";
import type { Bindings } from "../../types";
import {
  renderCtaButton,
  renderEmailLayout,
  renderListUnsubscribeHeader,
} from "../../lib/email-layout";
import { isRetryableScheduledDbError, withDbRetry } from "../../lib/db-retry";
import { captureBackgroundException } from "../../lib/sentry";
import { getIntegrations } from "../../lib/integrations";

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 100;
const DELIVERY_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
const WRAPUP_CLAIM_LEASE_MS = 5 * 60 * 1000;
const DELIVERY_IN_PROGRESS_PREFIX = "delivery_in_progress:";
const DELIVERY_AMBIGUOUS_PREFIX = "delivery_ambiguous:";

export const TRIAL_EMAIL_KINDS = [
  "welcome",
  "quick_start",
  "proof_file",
  "team_invite",
  "report_view",
  "plan_nudge",
  "billing_prompt",
  "trial_wrapup",
] as const;

export type TrialEmailKind = (typeof TRIAL_EMAIL_KINDS)[number];

type TrialEmailRow = {
  id: string;
  sendAfter: Date;
  orgId: string;
  userId: string;
  emailKind: TrialEmailKind;
  trialDeadlineAt: Date | string | null;
  toEmail: string | null;
  userName: string | null;
  orgName: string;
  subscriptionStatus: string | null;
  timezone: string;
  memberRole: string | null;
  memberDeletedAt: Date | null;
  trialEndsAt: Date | string | null;
  trialWillEndNotifiedAt: Date | string | null;
  trialWrapupNotifiedForEndAt: Date | string | null;
  error: string | null;
  deliverySnapshot: unknown;
};

type TrialEmailDeliverySnapshot = {
  version: 1;
  idempotencyKey: string;
  firstAttemptAt: string;
  trialEndsAt: string | null;
  request: TrialEmailProviderRequest;
};

type TrialWrapupDeliveryIntent = {
  version: 1;
  intent: "trial_wrapup";
  trialEndsAt: string;
};

type TrialEmailProviderRequest = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  headers: { "List-Unsubscribe": string };
};

type DueTrialWrapupOrgRow = {
  id: string;
  subscriptionStatus: string | null;
  trialEndsAt: Date | string | null;
  trialWillEndNotifiedAt: Date | string | null;
  trialWrapupNotifiedForEndAt: Date | string | null;
  trialWrapupScheduledForEndAt: Date | string | null;
};

type ActiveAdminRow = {
  userId: string;
  email: string | null;
};

type TrialWrapupScheduleOutcome = "scheduled" | "missing_admin" | "skipped";

type TrialEmailDeliveryLease = {
  claimedAt: Date;
  token: string | null;
};

export type EmailResult =
  | { ok: true; error?: never; ambiguous?: never }
  | { ok: false; error: string; ambiguous?: true };

export type TrialWrapupDiscoveryResult = {
  eligible: number;
  scheduled: number;
  missingAdmin: number;
  skipped: number;
};

export type EnqueueTrialEmailSequenceInput = {
  orgId: string;
  userId: string;
  trialStartedAt: Date | string | null;
  trialEndsAt: Date | string | null;
};

type TrialWrapupScheduleSnapshot = {
  id: string;
  userId: string;
  trialDeadlineAt: Date | string | null;
  error: string | null;
  deliverySnapshot: unknown;
};

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function normalizeDate(value: Date | string | null): Date | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}

function parseDeliveryLease(error: string | null): TrialEmailDeliveryLease | null {
  if (!error?.startsWith(DELIVERY_IN_PROGRESS_PREFIX)) return null;
  const encoded = error.slice(DELIVERY_IN_PROGRESS_PREFIX.length);
  const separator = encoded.lastIndexOf("|");
  const claimedAt = normalizeDate(separator === -1 ? encoded : encoded.slice(0, separator));
  if (!claimedAt) return null;
  const token = separator === -1 ? null : encoded.slice(separator + 1).trim() || null;
  return { claimedAt, token };
}

function formatDeliveryLease(claimedAt: Date, token: string): string {
  return `${DELIVERY_IN_PROGRESS_PREFIX}${claimedAt.toISOString()}|${token}`;
}

function getTrialSequenceDates(
  input: EnqueueTrialEmailSequenceInput,
): Record<TrialEmailKind, Date> {
  const start = normalizeDate(input.trialStartedAt) ?? new Date();
  const trialEndsAt = normalizeDate(input.trialEndsAt) ?? addDays(start, 30);
  return {
    welcome: start,
    quick_start: addDays(start, 1),
    proof_file: addDays(start, 2),
    team_invite: addDays(start, 3),
    report_view: addDays(start, 4),
    plan_nudge: addDays(start, 5),
    billing_prompt: addDays(start, 6),
    trial_wrapup: addDays(trialEndsAt, -3),
  };
}

function observedTrialWrapupWhere(existing: TrialWrapupScheduleSnapshot) {
  return and(
    eq(trialEmailSchedule.id, existing.id),
    eq(trialEmailSchedule.emailKind, "trial_wrapup"),
    eq(trialEmailSchedule.userId, existing.userId),
    isNull(trialEmailSchedule.sentAt),
    existing.deliverySnapshot === null
      ? isNull(trialEmailSchedule.deliverySnapshot)
      : eq(trialEmailSchedule.deliverySnapshot, existing.deliverySnapshot),
    existing.error === null
      ? isNull(trialEmailSchedule.error)
      : eq(trialEmailSchedule.error, existing.error),
  );
}

export async function enqueueTrialEmailSequence(
  db: TransactionDatabase,
  input: EnqueueTrialEmailSequenceInput,
): Promise<void> {
  const dates = getTrialSequenceDates(input);
  const trialDeadlineAt = addDays(dates.trial_wrapup, 3);
  for (const emailKind of TRIAL_EMAIL_KINDS) {
    await db
      .insert(trialEmailSchedule)
      .values({
        orgId: input.orgId,
        userId: input.userId,
        emailKind,
        trialDeadlineAt: emailKind === "trial_wrapup" ? trialDeadlineAt : null,
        sendAfter: dates[emailKind],
      })
      .onConflictDoNothing();
  }
}

export async function enqueueTrialWrapupEmail(
  db: TransactionDatabase,
  input: { orgId: string; userId: string; trialEndsAt: Date },
): Promise<boolean> {
  const now = new Date();
  const intent: TrialWrapupDeliveryIntent = {
    version: 1,
    intent: "trial_wrapup",
    trialEndsAt: input.trialEndsAt.toISOString(),
  };
  const candidate = await db.query.trialEmailSchedule.findFirst({
    where: and(
      eq(trialEmailSchedule.orgId, input.orgId),
      eq(trialEmailSchedule.emailKind, "trial_wrapup"),
      eq(trialEmailSchedule.trialDeadlineAt, input.trialEndsAt),
      isNull(trialEmailSchedule.sentAt),
    ),
    columns: {
      id: true,
      userId: true,
      trialDeadlineAt: true,
      error: true,
      deliverySnapshot: true,
    },
  });
  const candidateDeadline = candidate
    ? (normalizeDate(candidate.trialDeadlineAt) ??
      normalizeDate(
        parseTrialWrapupIntent(candidate.deliverySnapshot)?.trialEndsAt ??
          parseDeliverySnapshot(candidate.deliverySnapshot)?.trialEndsAt ??
          null,
      ))
    : null;
  const existing =
    candidate && candidateDeadline?.getTime() === input.trialEndsAt.getTime() ? candidate : null;
  if (existing) {
    const hasUncertainDelivery =
      existing.error?.startsWith(DELIVERY_IN_PROGRESS_PREFIX) ||
      existing.error?.startsWith(DELIVERY_AMBIGUOUS_PREFIX);
    if (hasUncertainDelivery) return false;

    const existingDeadline =
      parseTrialWrapupIntent(existing.deliverySnapshot)?.trialEndsAt ??
      parseDeliverySnapshot(existing.deliverySnapshot)?.trialEndsAt;
    if (normalizeDate(existingDeadline ?? null)?.getTime() === input.trialEndsAt.getTime()) {
      const recipientChanged = existing.userId !== input.userId;
      if (!recipientChanged) {
        await db
          .update(trialEmailSchedule)
          .set({ sendAfter: now, error: null, updatedAt: now })
          .where(observedTrialWrapupWhere(existing));
        return false;
      }

      const superseded = await db
        .update(trialEmailSchedule)
        .set({
          emailKind: `trial_wrapup_superseded:${existing.id}`,
          error: `superseded_by_recipient:${input.userId}`,
          updatedAt: now,
        })
        .where(observedTrialWrapupWhere(existing))
        .returning({ id: trialEmailSchedule.id });
      if (superseded.length === 0) return false;
    } else {
      const superseded = await db
        .update(trialEmailSchedule)
        .set({
          emailKind: `trial_wrapup_superseded:${existing.id}`,
          error: `superseded_by_deadline:${intent.trialEndsAt}`,
          updatedAt: now,
        })
        .where(observedTrialWrapupWhere(existing))
        .returning({ id: trialEmailSchedule.id });
      if (superseded.length === 0) return false;
    }
  }
  const inserted = await db
    .insert(trialEmailSchedule)
    .values({
      orgId: input.orgId,
      userId: input.userId,
      emailKind: "trial_wrapup",
      trialDeadlineAt: input.trialEndsAt,
      sendAfter: now,
      deliverySnapshot: intent,
    })
    .onConflictDoNothing()
    .returning({ id: trialEmailSchedule.id });
  return inserted.length > 0;
}

function isDueForTrialWrapup(row: DueTrialWrapupOrgRow | null | undefined, now: Date): boolean {
  if (!row) return false;
  if (row.subscriptionStatus !== "trialing") return false;
  const trialEndsAt = normalizeDate(row.trialEndsAt);
  const notifiedForEndAt = normalizeDate(row.trialWrapupNotifiedForEndAt);
  if (
    trialEndsAt &&
    (notifiedForEndAt?.getTime() === trialEndsAt.getTime() ||
      (!notifiedForEndAt && row.trialWillEndNotifiedAt !== null))
  ) {
    return false;
  }
  return (
    trialEndsAt !== null &&
    trialEndsAt.getTime() > now.getTime() &&
    trialEndsAt.getTime() <= addDays(now, 3).getTime()
  );
}

async function findTrialWrapupDiscoveryOrgs(
  db: Database,
  now: Date,
  limit = BATCH_SIZE,
  cursor?: { trialEndsAt: Date; id: string },
): Promise<DueTrialWrapupOrgRow[]> {
  const cursorCondition = cursor
    ? or(
        gt(organizations.trialEndsAt, cursor.trialEndsAt),
        and(eq(organizations.trialEndsAt, cursor.trialEndsAt), gt(organizations.id, cursor.id)),
      )
    : undefined;
  return withDbRetry(
    () =>
      db
        .select({
          id: organizations.id,
          subscriptionStatus: organizations.subscriptionStatus,
          trialEndsAt: organizations.trialEndsAt,
          trialWillEndNotifiedAt: organizations.trialWillEndNotifiedAt,
          trialWrapupNotifiedForEndAt: organizations.trialWrapupNotifiedForEndAt,
          trialWrapupScheduledForEndAt: organizations.trialWrapupScheduledForEndAt,
        })
        .from(organizations)
        .where(
          and(
            eq(organizations.subscriptionStatus, "trialing"),
            or(
              isNull(organizations.trialWrapupNotifiedForEndAt),
              ne(organizations.trialWrapupNotifiedForEndAt, organizations.trialEndsAt),
            ),
            isNull(organizations.deletedAt),
            gt(organizations.trialEndsAt, now),
            lte(organizations.trialEndsAt, addDays(now, 3)),
            cursorCondition,
          ),
        )
        .orderBy(organizations.trialEndsAt, organizations.id)
        .limit(limit),
    { isRetryable: isRetryableScheduledDbError },
  );
}

async function findActiveOrgAdmin(
  db: Database | TransactionDatabase,
  orgId: string,
): Promise<ActiveAdminRow | null> {
  const rows = await withDbRetry(
    () =>
      db
        .select({
          userId: orgMembers.userId,
          email: userTable.email,
        })
        .from(orgMembers)
        .innerJoin(userTable, eq(orgMembers.userId, userTable.id))
        .where(
          and(
            eq(orgMembers.orgId, orgId),
            eq(orgMembers.role, "admin"),
            isNull(orgMembers.deletedAt),
          ),
        )
        .orderBy(orgMembers.joinedAt, orgMembers.userId)
        .limit(1),
    { isRetryable: isRetryableScheduledDbError },
  );

  return rows[0] ?? null;
}

async function scheduleDiscoveredTrialWrapup(
  db: Database,
  row: DueTrialWrapupOrgRow,
  now: Date,
): Promise<TrialWrapupScheduleOutcome> {
  return db.transaction(async (tx) => {
    const fresh = await tx.query.organizations.findFirst({
      where: eq(organizations.id, row.id),
      columns: {
        id: true,
        subscriptionStatus: true,
        trialEndsAt: true,
        trialWillEndNotifiedAt: true,
        trialWrapupNotifiedForEndAt: true,
        trialWrapupScheduledForEndAt: true,
      },
    });
    if (!isDueForTrialWrapup(fresh, now)) return "skipped";

    const admin = await findActiveOrgAdmin(tx, row.id);
    if (!admin?.userId || !admin.email) return "missing_admin";

    const trialEndsAt = normalizeDate(fresh!.trialEndsAt);
    if (!trialEndsAt) return "skipped";
    const newlyScheduled = await enqueueTrialWrapupEmail(tx, {
      orgId: row.id,
      userId: admin.userId,
      trialEndsAt,
    });

    await tx
      .update(organizations)
      .set({ trialWrapupScheduledForEndAt: trialEndsAt, updatedAt: now })
      .where(eq(organizations.id, row.id));

    return newlyScheduled ? "scheduled" : "skipped";
  });
}

export async function runTrialWrapupDiscoveryTick(
  db: Database,
  now: Date = new Date(),
  bindings?: Bindings,
): Promise<TrialWrapupDiscoveryResult> {
  const result: TrialWrapupDiscoveryResult = {
    eligible: 0,
    scheduled: 0,
    missingAdmin: 0,
    skipped: 0,
  };

  let cursor: { trialEndsAt: Date; id: string } | undefined;
  while (true) {
    const dueOrgs = await findTrialWrapupDiscoveryOrgs(db, now, BATCH_SIZE, cursor);
    result.eligible += dueOrgs.length;
    for (const row of dueOrgs) {
      let outcome: TrialWrapupScheduleOutcome;
      try {
        outcome = await scheduleDiscoveredTrialWrapup(db, row, now);
      } catch (error) {
        result.skipped += 1;
        captureBackgroundException(error, "trial-email-discovery", {
          orgId: row.id,
          reason: "schedule_failed",
        });
        continue;
      }
      if (outcome === "scheduled") {
        result.scheduled += 1;
        if (bindings) {
          await captureWrapupAnalytics(
            db,
            bindings,
            row.id,
            normalizeDate(row.trialEndsAt)!,
            ANALYTICS_EVENTS.trialWrapupDiscovered,
            now,
          );
        }
        continue;
      }

      if (outcome === "missing_admin") {
        result.missingAdmin += 1;
        captureBackgroundException(
          new Error("Trial wrapup discovery skipped org without an active admin"),
          "trial-email-discovery",
          { orgId: row.id, reason: "missing_admin" },
        );
        continue;
      }

      result.skipped += 1;
    }
    if (dueOrgs.length < BATCH_SIZE) break;
    const last = dueOrgs.at(-1)!;
    const lastTrialEndsAt = normalizeDate(last.trialEndsAt);
    if (!lastTrialEndsAt) break;
    cursor = { trialEndsAt: lastTrialEndsAt, id: last.id };
  }

  return result;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseDeliverySnapshot(value: unknown): TrialEmailDeliverySnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Record<string, unknown>;
  const request = snapshot.request;
  if (!request || typeof request !== "object") return null;
  const payload = request as Record<string, unknown>;
  const headers = payload.headers;
  return snapshot.version === 1 &&
    typeof snapshot.idempotencyKey === "string" &&
    typeof snapshot.firstAttemptAt === "string" &&
    normalizeDate(snapshot.firstAttemptAt) !== null &&
    (typeof snapshot.trialEndsAt === "string" || snapshot.trialEndsAt === null) &&
    typeof payload.from === "string" &&
    Array.isArray(payload.to) &&
    payload.to.length === 1 &&
    typeof payload.to[0] === "string" &&
    typeof payload.subject === "string" &&
    typeof payload.html === "string" &&
    typeof payload.text === "string" &&
    !!headers &&
    typeof headers === "object" &&
    typeof (headers as Record<string, unknown>)["List-Unsubscribe"] === "string"
    ? (snapshot as TrialEmailDeliverySnapshot)
    : null;
}

function parseTrialWrapupIntent(value: unknown): TrialWrapupDeliveryIntent | null {
  if (!value || typeof value !== "object") return null;
  const intent = value as Record<string, unknown>;
  return intent.version === 1 &&
    intent.intent === "trial_wrapup" &&
    typeof intent.trialEndsAt === "string" &&
    normalizeDate(intent.trialEndsAt)
    ? (intent as TrialWrapupDeliveryIntent)
    : null;
}

function parseResendErrorName(body: string): string | null {
  try {
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== "object") return null;
    const name = (parsed as Record<string, unknown>).name;
    return typeof name === "string" && /^[a-z0-9_]{1,100}$/.test(name) ? name : null;
  } catch {
    return null;
  }
}

function buildEmailCopy(params: {
  emailKind: TrialEmailKind;
  userName?: string | null;
  orgName: string;
  appUrl: string;
  marketingUrl: string;
  trialEndsAt?: Date;
  now?: Date;
}) {
  const name = params.userName?.trim() || "there";
  const safeName = escapeHtml(name);
  const safeOrgName = escapeHtml(params.orgName);
  const onboardingUrl = buildAppUrl(params.appUrl, "/onboarding");
  const billingUrl = buildAppUrl(params.appUrl, "/settings/billing");
  const awardIntakeUrl = buildAppUrl(params.appUrl, "/import?source=trial-email");
  const complianceUrl = buildAppUrl(params.appUrl, "/grants?source=trial-email");
  const documentsUrl = buildAppUrl(params.appUrl, "/documents?source=trial-email");
  const teamUrl = buildAppUrl(params.appUrl, "/settings/team?source=trial-email");
  const reportsUrl = buildAppUrl(params.appUrl, "/reports?source=trial-email");
  const ledgerUrl = buildAppUrl(params.appUrl, "/reports/ask-ledger?source=trial-email");
  const productTourUrl = `${params.marketingUrl.replace(/\/+$/, "")}/product/#product-tour`;

  switch (params.emailKind) {
    case "welcome":
      return {
        subject: "Start with one award",
        preheader: "Add one award file and see what GrantPipe can track.",
        html: `<p>Hi ${safeName},</p>
<p>Your GrantPipe trial is active for ${safeOrgName}. Start with one award letter or grant file. GrantPipe can pull out dates, amounts, fund limits, and proof your next report may need.</p>
${renderCtaButton(awardIntakeUrl, "Add one award")}
<p>If you want to see the app first, <a href="${productTourUrl}">watch the product tour</a>.</p>
<p>Thanks for giving GrantPipe a try,<br/>Angel Campa, founder</p>`,
        text: `Hi ${name},

Your GrantPipe trial is active for ${params.orgName}. Start with one award letter or grant file. GrantPipe can pull out dates, amounts, fund limits, and proof your next report may need.

Add one award: ${awardIntakeUrl}

Watch the product tour: ${productTourUrl}

Thanks for giving GrantPipe a try,
Angel Campa, founder`,
      };
    case "proof_file":
      return {
        subject: "Attach one proof file",
        preheader: "Add one document before the next report is due.",
        html: `<p>Hi ${safeName},</p>
<p>Add one proof file today. Use an award letter, receipt, report, or email. The goal is simple: make the next report easier to prove.</p>
${renderCtaButton(documentsUrl, "Attach proof")}
<p>Thanks,<br/>Angel</p>`,
        text: `Hi ${name},

Add one proof file today. Use an award letter, receipt, report, or email. The goal is simple: make the next report easier to prove.

Attach proof: ${documentsUrl}

Thanks,
Angel`,
      };
    case "team_invite":
      return {
        subject: "Invite the person who owns the report",
        preheader: "Bring in the teammate who knows the grant details.",
        html: `<p>Hi ${safeName},</p>
<p>If someone else owns the grant details, invite them now. They can add dates, files, and notes while the work is fresh.</p>
${renderCtaButton(teamUrl, "Invite a teammate")}
<p>Thanks,<br/>Angel</p>`,
        text: `Hi ${name},

If someone else owns the grant details, invite them now. They can add dates, files, and notes while the work is fresh.

Invite a teammate: ${teamUrl}

Thanks,
Angel`,
      };
    case "report_view":
      return {
        subject: "Open your first report view",
        preheader: "Check what GrantPipe can show from your setup.",
        html: `<p>Hi ${safeName},</p>
<p>Open reports and check one view. Look for a deadline, balance, or proof gap. If it is missing, you know what to add next.</p>
${renderCtaButton(reportsUrl, "Open reports")}
<p>Thanks,<br/>Angel</p>`,
        text: `Hi ${name},

Open reports and check one view. Look for a deadline, balance, or proof gap. If it is missing, you know what to add next.

Open reports: ${reportsUrl}

Thanks,
Angel`,
      };
    case "quick_start":
      return {
        subject: "Add the next report date",
        preheader: "Give GrantPipe one deadline to watch.",
        html: `<p>Hi ${safeName},</p>
<p>Add the next report date for one grant. Then GrantPipe can show what is due, what is left, and what needs proof.</p>
${renderCtaButton(complianceUrl, "Add a report date")}
<p>If you want sample records first, <a href="${onboardingUrl}">open onboarding</a>.</p>
<p>Thanks,<br/>Angel</p>`,
        text: `Hi ${name},

Add the next report date for one grant. Then GrantPipe can show what is due, what is left, and what needs proof.

Add a report date: ${complianceUrl}

Open onboarding: ${onboardingUrl}

Thanks,
Angel`,
      };
    case "plan_nudge":
      return {
        subject: "Ask where the money went",
        preheader: "Use Ask-Your-Ledger on one real grant question.",
        html: `<p>Hi ${safeName},</p>
<p>Try one question your team asks before a report. Ask which fund paid for a grant cost, what is left, or which records prove the answer.</p>
${renderCtaButton(ledgerUrl, "Ask a ledger question")}
<p>Thanks,<br/>Angel</p>`,
        text: `Hi ${name},

Try one question your team asks before a report. Ask which fund paid for a grant cost, what is left, or which records prove the answer.

Ask a ledger question: ${ledgerUrl}

Thanks,
Angel`,
      };
    case "billing_prompt":
      return {
        subject: "Pick the plan that fits",
        preheader: "Choose the plan that matches the answers you need.",
        html: `<p>Hi ${safeName},</p>
<p>Your trial is still open. Pick the plan that matches the answers ${safeOrgName} needs. You can add billing when you are ready.</p>
${renderCtaButton(billingUrl, "Review plan fit")}
<p>Thanks,<br/>Angel</p>`,
        text: `Hi ${name},

Your trial is still open. Pick the plan that matches the answers ${params.orgName} needs. You can add billing when you are ready.

Review plan fit: ${billingUrl}

Thanks,
Angel`,
      };
    case "trial_wrapup": {
      const remainingMs = params.trialEndsAt
        ? params.trialEndsAt.getTime() - (params.now ?? new Date()).getTime()
        : 0;
      const remainingDays = Math.max(1, Math.ceil(remainingMs / DAY_MS));
      const timeLeft =
        remainingMs >= DAY_MS
          ? `${remainingDays} ${remainingDays === 1 ? "day" : "days"}`
          : "less than a day";
      return {
        subject: `Your GrantPipe trial ends in ${timeLeft}`,
        preheader: "Pick a plan and add billing details to keep access open.",
        html: `<p>Hi ${safeName},</p>
<p>Your GrantPipe trial for ${safeOrgName} ends in <strong>${timeLeft}</strong>. Pick a plan and add billing details to keep access open.</p>
${renderCtaButton(billingUrl, "Manage billing")}
<p>Thanks for giving GrantPipe a try,<br/>Angel Campa, founder</p>`,
        text: `Hi ${name},

Your GrantPipe trial for ${params.orgName} ends in ${timeLeft}. Pick a plan and add billing details to keep access open.

Manage billing: ${billingUrl}

Thanks for giving GrantPipe a try,
Angel Campa, founder`,
      };
    }
  }
}

function isTrialEmailKind(value: string): value is TrialEmailKind {
  return (TRIAL_EMAIL_KINDS as readonly string[]).includes(value);
}

export async function sendTrialLifecycleEmail(
  bindings: Bindings,
  params: {
    emailKind: TrialEmailKind;
    idempotencyKey?: string;
    toEmail: string;
    userName?: string | null;
    orgName: string;
    trialEndsAt?: Date;
    now?: Date;
  },
): Promise<EmailResult> {
  if (!bindings.RESEND_API_KEY) {
    return { ok: false, error: "RESEND_API_KEY is required for trial email delivery" };
  }

  const request = buildTrialEmailProviderRequest(bindings, params);
  return sendTrialEmailProviderRequest(bindings, request, params.idempotencyKey);
}

function buildTrialEmailProviderRequest(
  bindings: Bindings,
  params: {
    emailKind: TrialEmailKind;
    toEmail: string;
    userName?: string | null;
    orgName: string;
    trialEndsAt?: Date;
    now?: Date;
  },
): TrialEmailProviderRequest {
  const appUrl = bindings.APP_URL ?? marketingKnowledge.brand.appUrl;
  const marketingUrl = bindings.MARKETING_URL ?? marketingKnowledge.brand.siteUrl;
  const unsubscribeUrl = buildAppUrl(appUrl, "/notifications?source=trial-email");
  const copy = buildEmailCopy({ ...params, appUrl, marketingUrl });
  const text = `${copy.text.trim()}\n\nManage trial emails: ${unsubscribeUrl}`;
  return {
    from: marketingKnowledge.contact.transactionalSender,
    to: [params.toEmail],
    subject: copy.subject,
    html: renderEmailLayout({
      body: copy.html,
      marketingUrl: bindings.MARKETING_URL,
      preheader: copy.preheader,
      unsubscribeUrl,
      receivedBecause: "You're receiving this because you're using a GrantPipe trial.",
    }),
    text,
    headers: {
      "List-Unsubscribe": renderListUnsubscribeHeader(unsubscribeUrl),
    },
  };
}

async function sendTrialEmailProviderRequest(
  bindings: Bindings,
  request: TrialEmailProviderRequest,
  idempotencyKey?: string,
): Promise<EmailResult> {
  if (!bindings.RESEND_API_KEY) {
    return { ok: false, error: "RESEND_API_KEY is required for trial email delivery" };
  }
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bindings.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify(request),
    });
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? `resend_network_error:${error.message}` : "resend_network_error",
      ambiguous: true,
    };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const resendErrorName = parseResendErrorName(body);
    const result: EmailResult = {
      ok: false,
      error: `resend_status_${response.status}:${resendErrorName ?? body}`,
    };
    if (
      (response.status === 409 && resendErrorName !== "invalid_idempotent_request") ||
      response.status === 408 ||
      response.status === 425 ||
      response.status === 429 ||
      response.status >= 500
    ) {
      result.ambiguous = true;
    }
    return result;
  }
  return { ok: true };
}

export async function findDueTrialEmailRows(
  db: Database,
  now: Date,
  limit = BATCH_SIZE,
  cursor?: Pick<TrialEmailRow, "sendAfter" | "id">,
): Promise<TrialEmailRow[]> {
  // Transient database control-plane blips on this read are recoverable on retry
  // (GRANTPIPE-API-Z). The read has no side effects, so a re-run is safe.
  const rows = await withDbRetry(
    () =>
      db
        .select({
          id: trialEmailSchedule.id,
          sendAfter: trialEmailSchedule.sendAfter,
          orgId: trialEmailSchedule.orgId,
          userId: trialEmailSchedule.userId,
          emailKind: trialEmailSchedule.emailKind,
          trialDeadlineAt: trialEmailSchedule.trialDeadlineAt,
          toEmail: userTable.email,
          userName: userTable.name,
          orgName: organizations.name,
          subscriptionStatus: organizations.subscriptionStatus,
          timezone: organizations.timezone,
          memberRole: orgMembers.role,
          memberDeletedAt: orgMembers.deletedAt,
          trialEndsAt: organizations.trialEndsAt,
          trialWillEndNotifiedAt: organizations.trialWillEndNotifiedAt,
          trialWrapupNotifiedForEndAt: organizations.trialWrapupNotifiedForEndAt,
          error: trialEmailSchedule.error,
          deliverySnapshot: trialEmailSchedule.deliverySnapshot,
        })
        .from(trialEmailSchedule)
        .innerJoin(organizations, eq(trialEmailSchedule.orgId, organizations.id))
        .innerJoin(userTable, eq(trialEmailSchedule.userId, userTable.id))
        .innerJoin(
          orgMembers,
          and(
            eq(orgMembers.orgId, trialEmailSchedule.orgId),
            eq(orgMembers.userId, trialEmailSchedule.userId),
          ),
        )
        .where(
          and(
            isNull(trialEmailSchedule.sentAt),
            lte(trialEmailSchedule.sendAfter, now),
            inArray(trialEmailSchedule.emailKind, TRIAL_EMAIL_KINDS),
            eq(organizations.subscriptionStatus, "trialing"),
            cursor
              ? or(
                  gt(trialEmailSchedule.sendAfter, cursor.sendAfter),
                  and(
                    eq(trialEmailSchedule.sendAfter, cursor.sendAfter),
                    gt(trialEmailSchedule.id, cursor.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(trialEmailSchedule.sendAfter, trialEmailSchedule.id)
        .limit(limit),
    { isRetryable: isRetryableScheduledDbError },
  );

  return rows
    .filter((row) => isTrialEmailKind(row.emailKind))
    .map((row) => ({ ...row, emailKind: row.emailKind as TrialEmailKind }));
}

async function isTrialLifecycleEmailEnabled(
  db: Database,
  row: Pick<TrialEmailRow, "orgId" | "userId">,
): Promise<boolean> {
  const preference = await withDbRetry(
    () =>
      db.query.notificationPreferences.findFirst({
        where: and(
          eq(notificationPreferences.orgId, row.orgId),
          eq(notificationPreferences.userId, row.userId),
          eq(notificationPreferences.notificationType, "trial_lifecycle"),
        ),
        columns: { emailEnabled: true },
      }),
    { isRetryable: isRetryableScheduledDbError },
  );

  return preference?.emailEnabled ?? true;
}

async function claimTrialWrapup(
  db: Database,
  row: TrialEmailRow,
  trialEndsAt: Date,
  now: Date,
  claimToken: string,
): Promise<boolean> {
  const staleBefore = new Date(now.getTime() - WRAPUP_CLAIM_LEASE_MS);
  const rows = await db
    .update(organizations)
    .set({
      trialWrapupClaimedAt: now,
      trialWrapupClaimToken: claimToken,
      trialWrapupClaimedForEndAt: trialEndsAt,
      updatedAt: now,
    })
    .where(
      and(
        eq(organizations.id, row.orgId),
        eq(organizations.subscriptionStatus, "trialing"),
        eq(organizations.trialEndsAt, trialEndsAt),
        or(
          isNull(organizations.trialWrapupNotifiedForEndAt),
          ne(organizations.trialWrapupNotifiedForEndAt, trialEndsAt),
        ),
        or(
          isNull(organizations.trialWrapupClaimedAt),
          lt(organizations.trialWrapupClaimedAt, staleBefore),
          ne(organizations.trialWrapupClaimedForEndAt, trialEndsAt),
        ),
      ),
    )
    .returning({ id: organizations.id });
  return rows.length > 0;
}

async function releaseTrialWrapupClaim(
  db: Database,
  row: TrialEmailRow,
  trialEndsAt: Date,
  now: Date,
  claimToken: string,
): Promise<void> {
  await db
    .update(organizations)
    .set({
      trialWrapupClaimedAt: null,
      trialWrapupClaimToken: null,
      trialWrapupClaimedForEndAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(organizations.id, row.orgId),
        eq(organizations.trialWrapupClaimedForEndAt, trialEndsAt),
        eq(organizations.trialWrapupClaimToken, claimToken),
      ),
    );
}

async function captureWrapupAnalytics(
  db: Database,
  bindings: Bindings,
  orgId: string,
  trialEndsAt: Date,
  eventName: string,
  now: Date,
): Promise<void> {
  try {
    await getIntegrations(db, bindings).analytics.capture({
      orgId,
      eventName,
      payload: {
        days_remaining: Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / DAY_MS)),
      },
    });
  } catch (error) {
    captureBackgroundException(error, "trial-email-analytics", { analytics_event: eventName });
  }
}

async function markTrialEmailSent(
  db: Database,
  row: TrialEmailRow,
  deliverySnapshot: TrialEmailDeliverySnapshot,
  deliveryLease: string,
  now: Date,
  deliveredTrialEndsAt?: Date,
): Promise<boolean> {
  const sentUpdate = { sentAt: now, error: null, updatedAt: now };
  if (row.emailKind !== "trial_wrapup") {
    const sent = await db
      .update(trialEmailSchedule)
      .set(sentUpdate)
      .where(trialEmailAttemptWhere(row, deliverySnapshot, deliveryLease))
      .returning({ id: trialEmailSchedule.id });
    return sent.length > 0;
  }
  if (!deliveredTrialEndsAt) return false;

  return db.transaction(async (tx) => {
    let alreadyNotifiedForDeadline = false;
    const notified = await tx
      .update(organizations)
      .set({
        trialWillEndNotifiedAt: now,
        trialWrapupNotifiedForEndAt: deliveredTrialEndsAt,
        trialWrapupClaimedAt: null,
        trialWrapupClaimToken: null,
        trialWrapupClaimedForEndAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(organizations.id, row.orgId),
          eq(organizations.trialEndsAt, deliveredTrialEndsAt),
          eq(organizations.trialWrapupClaimedForEndAt, deliveredTrialEndsAt),
          eq(organizations.trialWrapupClaimToken, deliveryLease),
        ),
      )
      .returning({ id: organizations.id });
    if (notified.length === 0) {
      const fresh = await tx.query.organizations.findFirst({
        where: eq(organizations.id, row.orgId),
        columns: {
          trialEndsAt: true,
          trialWrapupNotifiedForEndAt: true,
          trialWrapupClaimToken: true,
        },
      });
      const liveDeadline = normalizeDate(fresh?.trialEndsAt ?? null);
      const notifiedDeadline = normalizeDate(fresh?.trialWrapupNotifiedForEndAt ?? null);
      if (
        liveDeadline?.getTime() === deliveredTrialEndsAt.getTime() &&
        notifiedDeadline?.getTime() !== deliveredTrialEndsAt.getTime()
      ) {
        // A newer owner for this same deadline will finish the exact frozen
        // request. The stale sender must not touch either shared state row.
        if (fresh?.trialWrapupClaimToken !== deliveryLease) return false;
        throw new Error("Trial wrapup claim could not be finalized");
      }
      alreadyNotifiedForDeadline = notifiedDeadline?.getTime() === deliveredTrialEndsAt.getTime();
    }

    const sent = await tx
      .update(trialEmailSchedule)
      .set(sentUpdate)
      .where(trialEmailAttemptWhere(row, deliverySnapshot, deliveryLease))
      .returning({ id: trialEmailSchedule.id });
    if (sent.length === 0) {
      if (alreadyNotifiedForDeadline) {
        const finalized = await tx.query.trialEmailSchedule.findFirst({
          where: eq(trialEmailSchedule.id, row.id),
          columns: { sentAt: true, deliverySnapshot: true },
        });
        const finalizedSnapshot = parseDeliverySnapshot(finalized?.deliverySnapshot);
        if (
          finalized?.sentAt &&
          finalizedSnapshot?.idempotencyKey === deliverySnapshot.idempotencyKey &&
          normalizeDate(finalizedSnapshot.trialEndsAt)?.getTime() === deliveredTrialEndsAt.getTime()
        ) {
          return false;
        }
      }
      throw new Error("Trial wrapup schedule lease could not be finalized");
    }
    return true;
  });
}

function observedTrialEmailErrorWhere(error: string | null) {
  return error == null ? isNull(trialEmailSchedule.error) : eq(trialEmailSchedule.error, error);
}

function trialEmailAttemptWhere(
  row: TrialEmailRow,
  deliverySnapshot: TrialEmailDeliverySnapshot,
  expectedError?: string,
) {
  return and(
    eq(trialEmailSchedule.id, row.id),
    eq(trialEmailSchedule.userId, row.userId),
    eq(trialEmailSchedule.emailKind, row.emailKind),
    isNull(trialEmailSchedule.sentAt),
    eq(trialEmailSchedule.deliverySnapshot, deliverySnapshot),
    expectedError === undefined ? undefined : eq(trialEmailSchedule.error, expectedError),
  );
}

function trialEmailDeliveryAuthorizationWhere(
  row: TrialEmailRow,
  deliverySnapshot: TrialEmailDeliverySnapshot,
  now: Date,
  trialEndsAt: Date | null,
) {
  const liveTrialDeadline = trialEndsAt ?? normalizeDate(row.trialEndsAt);
  const snapshotRecipient = normalizeEmail(deliverySnapshot.request.to[0])!;
  return and(
    trialEmailAttemptWhere(row, deliverySnapshot),
    observedTrialEmailErrorWhere(row.error),
    sql`exists (
      select 1 from ${userTable}
      where ${userTable.id} = ${row.userId}
        and lower(btrim(${userTable.email})) = ${snapshotRecipient}
    )`,
    sql`exists (
      select 1 from ${orgMembers}
      where ${orgMembers.orgId} = ${row.orgId}
        and ${orgMembers.userId} = ${row.userId}
        and ${orgMembers.role} = ${"admin"}
        and ${orgMembers.deletedAt} is null
    )`,
    sql`not exists (
      select 1 from ${notificationPreferences}
      where ${notificationPreferences.orgId} = ${row.orgId}
        and ${notificationPreferences.userId} = ${row.userId}
        and ${notificationPreferences.notificationType} = ${"trial_lifecycle"}
        and ${notificationPreferences.emailEnabled} = ${false}
    )`,
    sql`exists (
      select 1 from ${organizations}
      where ${organizations.id} = ${row.orgId}
        and ${organizations.deletedAt} is null
        and ${organizations.subscriptionStatus} = ${"trialing"}
        and ${organizations.trialEndsAt} > ${now}
        ${liveTrialDeadline ? sql`and ${organizations.trialEndsAt} = ${liveTrialDeadline}` : sql``}
        ${
          row.emailKind === "trial_wrapup" && liveTrialDeadline
            ? sql`and ${organizations.trialEndsAt} <= ${addDays(now, 3)}
                and (${organizations.trialWrapupNotifiedForEndAt} is null
                  or ${organizations.trialWrapupNotifiedForEndAt} <> ${liveTrialDeadline})`
            : sql``
        }
    )`,
  );
}

function buildDeliverySnapshot(
  bindings: Bindings,
  row: TrialEmailRow,
  now: Date,
  trialEndsAt: Date | null,
): TrialEmailDeliverySnapshot {
  const persistedAttemptAt = parseDeliveryLease(row.error)?.claimedAt ?? null;
  const idempotencyKey =
    row.emailKind === "trial_wrapup" && trialEndsAt
      ? `trial-wrapup/${row.orgId}/${trialEndsAt.getTime()}/${crypto.randomUUID()}`
      : `trial-email/${row.id}/${crypto.randomUUID()}`;
  return {
    version: 1,
    idempotencyKey,
    firstAttemptAt: (persistedAttemptAt ?? now).toISOString(),
    trialEndsAt: trialEndsAt?.toISOString() ?? null,
    request: buildTrialEmailProviderRequest(bindings, {
      emailKind: row.emailKind,
      toEmail: row.toEmail!,
      userName: row.userName,
      orgName: row.orgName,
      trialEndsAt: trialEndsAt ?? undefined,
      now,
    }),
  };
}

async function quarantineInvalidDeliverySnapshot(
  db: Database,
  row: TrialEmailRow,
  now: Date,
): Promise<void> {
  await db
    .update(trialEmailSchedule)
    .set({ error: `${DELIVERY_AMBIGUOUS_PREFIX}invalid_snapshot`, updatedAt: now })
    .where(eq(trialEmailSchedule.id, row.id));
  captureBackgroundException(
    new Error("Trial email delivery snapshot is invalid"),
    "trial-email-delivery",
    { emailKind: row.emailKind, reason: "invalid_delivery_snapshot" },
  );
}

async function resolveDeliverySnapshot(
  db: Database,
  bindings: Bindings,
  row: TrialEmailRow,
  now: Date,
  trialEndsAt: Date | null,
): Promise<TrialEmailDeliverySnapshot | null> {
  if (row.deliverySnapshot !== null) {
    const existing = parseDeliverySnapshot(row.deliverySnapshot);
    if (existing) return existing;
    const intent = parseTrialWrapupIntent(row.deliverySnapshot);
    const intentMatchesCurrentDeadline =
      intent && normalizeDate(intent.trialEndsAt)?.getTime() === trialEndsAt?.getTime();
    // Ambiguous rows are held before snapshot resolution in runTrialEmailTick.
    const intentMayHaveReachedProvider = row.error?.startsWith(DELIVERY_IN_PROGRESS_PREFIX);
    if (!intent || (!intentMatchesCurrentDeadline && intentMayHaveReachedProvider)) {
      await quarantineInvalidDeliverySnapshot(db, row, now);
      return null;
    }
  }

  const candidate = buildDeliverySnapshot(bindings, row, now, trialEndsAt);
  const claimed = await db
    .update(trialEmailSchedule)
    .set({ deliverySnapshot: candidate, updatedAt: now })
    .where(
      and(
        eq(trialEmailSchedule.id, row.id),
        row.deliverySnapshot === null
          ? isNull(trialEmailSchedule.deliverySnapshot)
          : eq(trialEmailSchedule.deliverySnapshot, row.deliverySnapshot),
      ),
    )
    .returning({ deliverySnapshot: trialEmailSchedule.deliverySnapshot });
  const persisted =
    claimed[0]?.deliverySnapshot ??
    (
      await db.query.trialEmailSchedule.findFirst({
        where: eq(trialEmailSchedule.id, row.id),
        columns: { deliverySnapshot: true },
      })
    )?.deliverySnapshot;
  const snapshot = parseDeliverySnapshot(persisted);
  if (!snapshot) await quarantineInvalidDeliverySnapshot(db, row, now);
  return snapshot;
}

export async function runTrialEmailTick(
  db: Database,
  bindings: Bindings,
  now: Date = new Date(),
): Promise<void> {
  let cursor: Pick<TrialEmailRow, "sendAfter" | "id"> | undefined;

  while (true) {
    const dueRows = await findDueTrialEmailRows(db, now, BATCH_SIZE, cursor);

    for (const row of dueRows) {
      if (!row.toEmail) continue;
      let currentTrialEndsAt: Date | null = null;
      if (row.emailKind === "trial_wrapup") {
        const trialEndsAt = normalizeDate(row.trialEndsAt);
        const notifiedForEndAt = normalizeDate(row.trialWrapupNotifiedForEndAt);
        if (
          row.subscriptionStatus !== "trialing" ||
          !trialEndsAt ||
          notifiedForEndAt?.getTime() === trialEndsAt.getTime() ||
          (!notifiedForEndAt && row.trialWillEndNotifiedAt !== null) ||
          trialEndsAt.getTime() <= now.getTime() ||
          trialEndsAt.getTime() > now.getTime() + 3 * DAY_MS
        ) {
          continue;
        }
        currentTrialEndsAt = trialEndsAt;
      } else {
        const trialEndsAt = normalizeDate(row.trialEndsAt);
        if (
          row.subscriptionStatus !== "trialing" ||
          !trialEndsAt ||
          trialEndsAt.getTime() <= now.getTime()
        ) {
          continue;
        }
      }
      if (row.memberRole !== "admin" || row.memberDeletedAt !== null) continue;
      // Hold lifecycle sends to the recipient org's local business hours. The
      // hourly cron re-reads this row each tick (sentAt stays null), so a row
      // that is due but out-of-hours is simply picked up on the next in-hours
      // tick instead of landing at, say, midnight local time.
      if (!isWithinBusinessHours(now, row.timezone)) continue;
      if (!(await isTrialLifecycleEmailEnabled(db, row))) continue;

      if (row.error?.startsWith(DELIVERY_AMBIGUOUS_PREFIX)) continue;
      const deliverySnapshot = await resolveDeliverySnapshot(
        db,
        bindings,
        row,
        now,
        currentTrialEndsAt,
      );
      if (!deliverySnapshot) continue;
      const snapshotTrialEndsAt = normalizeDate(deliverySnapshot.trialEndsAt);
      if (
        row.emailKind === "trial_wrapup" &&
        snapshotTrialEndsAt?.getTime() !== currentTrialEndsAt?.getTime()
      ) {
        await quarantineInvalidDeliverySnapshot(db, row, now);
        continue;
      }
      const snapshotRecipient = normalizeEmail(deliverySnapshot.request.to[0]);
      const currentRecipient = normalizeEmail(row.toEmail);
      if (!snapshotRecipient || snapshotRecipient !== currentRecipient) {
        const deliveryWasAttempted = row.error?.startsWith(DELIVERY_IN_PROGRESS_PREFIX) ?? false;
        await db
          .update(trialEmailSchedule)
          .set({
            error: deliveryWasAttempted ? `${DELIVERY_AMBIGUOUS_PREFIX}recipient_changed` : null,
            ...(deliveryWasAttempted ? {} : { deliverySnapshot: null }),
            updatedAt: now,
          })
          .where(trialEmailAttemptWhere(row, deliverySnapshot));
        if (deliveryWasAttempted) {
          captureBackgroundException(
            new Error("Trial email recipient changed after delivery began"),
            "trial-email-delivery",
            { emailKind: row.emailKind, reason: "recipient_changed_after_attempt" },
          );
        }
        continue;
      }
      const existingLease = parseDeliveryLease(row.error);
      const firstAttemptAt = normalizeDate(deliverySnapshot.firstAttemptAt)!;
      if (
        row.error?.startsWith(DELIVERY_IN_PROGRESS_PREFIX) &&
        (!existingLease || now.getTime() - firstAttemptAt.getTime() >= DELIVERY_RETRY_WINDOW_MS)
      ) {
        await db
          .update(trialEmailSchedule)
          .set({
            error: `${DELIVERY_AMBIGUOUS_PREFIX}${now.toISOString()}`,
            updatedAt: now,
          })
          .where(eq(trialEmailSchedule.id, row.id));
        captureBackgroundException(
          new Error("Trial email provider outcome requires reconciliation"),
          "trial-email-delivery",
          { emailKind: row.emailKind, reason: "provider_outcome_ambiguous" },
        );
        continue;
      }
      if (
        existingLease &&
        now.getTime() - existingLease.claimedAt.getTime() < WRAPUP_CLAIM_LEASE_MS
      ) {
        continue;
      }

      const deliveryLease = formatDeliveryLease(now, crypto.randomUUID());
      const authorized = await db
        .update(trialEmailSchedule)
        .set({
          error: deliveryLease,
          updatedAt: now,
        })
        .where(
          trialEmailDeliveryAuthorizationWhere(row, deliverySnapshot, now, snapshotTrialEndsAt),
        )
        .returning({ id: trialEmailSchedule.id });
      if (authorized.length === 0) {
        continue;
      }

      if (
        row.emailKind === "trial_wrapup" &&
        (!snapshotTrialEndsAt ||
          !(await claimTrialWrapup(db, row, snapshotTrialEndsAt, now, deliveryLease)))
      ) {
        await db
          .update(trialEmailSchedule)
          .set({ error: row.error, updatedAt: now })
          .where(trialEmailAttemptWhere(row, deliverySnapshot, deliveryLease));
        continue;
      }

      const result = await sendTrialEmailProviderRequest(
        bindings,
        deliverySnapshot.request,
        deliverySnapshot.idempotencyKey,
      );

      if (result.ok) {
        const markedSent = await markTrialEmailSent(
          db,
          row,
          deliverySnapshot,
          deliveryLease,
          now,
          snapshotTrialEndsAt ?? undefined,
        );
        if (markedSent && row.emailKind === "trial_wrapup" && snapshotTrialEndsAt) {
          await captureWrapupAnalytics(
            db,
            bindings,
            row.orgId,
            snapshotTrialEndsAt,
            ANALYTICS_EVENTS.trialWrapupDelivered,
            now,
          );
        }
      } else {
        const error = result.ambiguous ? deliveryLease : result.error.slice(0, 1000);
        const recorded = await db
          .update(trialEmailSchedule)
          .set({
            error,
            ...(result.ambiguous ? {} : { deliverySnapshot: null }),
            updatedAt: new Date(),
          })
          .where(trialEmailAttemptWhere(row, deliverySnapshot, deliveryLease))
          .returning({ id: trialEmailSchedule.id });
        if (recorded.length > 0 && row.emailKind === "trial_wrapup" && !result.ambiguous) {
          await releaseTrialWrapupClaim(db, row, snapshotTrialEndsAt!, now, deliveryLease);
        }
        if (!result.ambiguous) {
          captureBackgroundException(
            new Error("Trial email provider delivery failed"),
            "trial-email-delivery",
            { emailKind: row.emailKind, reason: "provider_failed" },
          );
        }
      }
    }

    if (dueRows.length < BATCH_SIZE) return;
    const lastRow = dueRows[dueRows.length - 1]!;
    cursor = { sendAfter: lastRow.sendAfter, id: lastRow.id };
  }
}
