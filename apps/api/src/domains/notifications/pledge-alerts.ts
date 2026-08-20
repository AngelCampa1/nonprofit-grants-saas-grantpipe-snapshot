import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import {
  notifications,
  notificationPreferences,
  orgMembers,
  pledgeInstallments,
  type Database,
} from "@grantpipe/db";
import {
  canUsePledgeTracker,
  getEffectivePlanTier,
  isWithinBusinessHours,
  type PlanTier,
} from "@grantpipe/shared";
import { getIntegrations } from "../../lib/integrations";
import { captureScheduledException } from "../../lib/sentry";
import { withDbRetry } from "../../lib/db-retry";
import { isSampleNotificationContent } from "./sample-alerts";
import { deliverClaimedNotificationEmail, prepareNotificationEmailClaims } from "./email-delivery";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PLEDGE_ALERT_JOB = "notifications.pledge_tracker";

/** Days before due date that an installment is considered "upcoming". */
const UPCOMING_DAYS = 14;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type AlertEnv = {
  APP_URL: string;
  RESEND_API_KEY?: string;
};

type NotificationPreferenceState = {
  emailEnabled: boolean;
  inAppEnabled: boolean;
};

const DEFAULT_PREFERENCE: NotificationPreferenceState = {
  emailEnabled: true,
  inAppEnabled: true,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function preferenceKey(userId: string, notificationType: string): string {
  return `${userId}:${notificationType}`;
}

async function loadOrgNotificationPreferences(
  db: Database,
  orgId: string,
  userIds: string[],
): Promise<Map<string, NotificationPreferenceState>> {
  const map = new Map<string, NotificationPreferenceState>();

  const rows = await db.query.notificationPreferences.findMany({
    where: and(
      eq(notificationPreferences.orgId, orgId),
      inArray(notificationPreferences.userId, userIds),
    ),
    columns: {
      userId: true,
      notificationType: true,
      emailEnabled: true,
      inAppEnabled: true,
    },
  });

  for (const row of rows) {
    map.set(preferenceKey(row.userId, row.notificationType), {
      emailEnabled: row.emailEnabled,
      inAppEnabled: row.inAppEnabled,
    });
  }

  return map;
}

type AlertBucket = "upcoming" | "overdue";

function classifyInstallmentBucket(dueDate: Date, now: Date): AlertBucket | null {
  const msPerDay = 86_400_000;
  const daysUntilDue = (dueDate.getTime() - now.getTime()) / msPerDay;

  if (daysUntilDue >= 0 && daysUntilDue <= UPCOMING_DAYS) return "upcoming";
  if (daysUntilDue < 0) return "overdue";
  return null;
}

function formatDonorName(contact: {
  type: string;
  firstName: string | null;
  lastName: string | null;
  organizationName: string | null;
}): string {
  if (contact.type === "organization") {
    return contact.organizationName ?? "Unknown Donor";
  }
  return [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unknown Donor";
}

function formatAmount(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

type AlertPayload = {
  title: string;
  body: string;
  dedupeKey: string;
};

function buildInstallmentAlert(
  installmentId: string,
  dueDate: Date,
  amountCents: number,
  donorName: string,
  bucket: AlertBucket,
  now: Date,
): AlertPayload {
  const msPerDay = 86_400_000;
  const amount = formatAmount(amountCents);

  if (bucket === "upcoming") {
    const daysUntil = Math.ceil((dueDate.getTime() - now.getTime()) / msPerDay);
    const dueDateStr = dueDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return {
      title: `Pledge installment due in ${daysUntil} day${daysUntil === 1 ? "" : "s"} — ${donorName}`,
      body: `${donorName} has a pledge installment of ${amount} due on ${dueDateStr}.`,
      dedupeKey: `pledge_installment_due:${installmentId}:upcoming`,
    };
  }

  const daysPast = Math.floor((now.getTime() - dueDate.getTime()) / msPerDay);
  const dueDateStr = dueDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return {
    title: `Pledge installment overdue ${daysPast} day${daysPast === 1 ? "" : "s"} — ${donorName}`,
    body: `${donorName} has an overdue pledge installment of ${amount} that was due on ${dueDateStr}.`,
    dedupeKey: `pledge_installment_due:${installmentId}:overdue`,
  };
}

// ---------------------------------------------------------------------------
// scanPledgeInstallmentAlerts
// ---------------------------------------------------------------------------

/**
 * Scans all entitled orgs for pledge installments that are upcoming (within
 * UPCOMING_DAYS) or overdue. Inserts `notifications` rows with
 * type = "pledge_installment_due", dedupe-keyed per installment+bucket.
 *
 * Safe to re-run: all inserts use onConflictDoNothing.
 */
export async function scanPledgeInstallmentAlerts(
  db: Database,
  env: AlertEnv,
  now: Date = new Date(),
): Promise<void> {
  const integrations = getIntegrations(db, env as never);

  const members = await withDbRetry(() =>
    db.query.orgMembers.findMany({
      where: isNull(orgMembers.deletedAt),
      with: {
        organization: {
          columns: {
            id: true,
            timezone: true,
            planTier: true,
            subscriptionStatus: true,
            trialEndsAt: true,
          },
        },
        user: {
          columns: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    }),
  );

  // Group by org
  const membersByOrg = new Map<string, typeof members>();
  for (const member of members) {
    if (!member.organization || !member.user) continue;
    const bucket = membersByOrg.get(member.organization.id);
    if (bucket) {
      bucket.push(member);
    } else {
      membersByOrg.set(member.organization.id, [member]);
    }
  }

  for (const [orgId, orgMemberList] of membersByOrg) {
    const orgInfo = orgMemberList[0]?.organization;
    /* v8 ignore next */
    if (!orgInfo) continue;

    const orgTimezone = orgInfo.timezone;
    if (!isWithinBusinessHours(now, orgTimezone)) continue;

    const planTier: PlanTier = getEffectivePlanTier({
      planTier: orgInfo.planTier,
      subscriptionStatus: orgInfo.subscriptionStatus,
      trialEndsAt: orgInfo.trialEndsAt,
    });

    if (!canUsePledgeTracker(planTier)) continue;

    // Find upcoming and overdue installments on active pledges
    const windowStart = new Date(now.getTime() - 365 * 86_400_000); // up to 1y overdue
    const windowEnd = new Date(now.getTime() + UPCOMING_DAYS * 86_400_000);

    let alertableInstallments: Awaited<ReturnType<typeof db.query.pledgeInstallments.findMany>>;

    try {
      alertableInstallments = await withDbRetry(() =>
        db.query.pledgeInstallments.findMany({
          where: and(
            eq(pledgeInstallments.orgId, orgId),
            isNull(pledgeInstallments.deletedAt),
            gte(pledgeInstallments.dueDate, windowStart),
            lte(pledgeInstallments.dueDate, windowEnd),
          ),
          with: {
            pledge: {
              columns: {
                id: true,
                contactId: true,
                status: true,
                faceAmountCents: true,
              },
              with: {
                contact: {
                  columns: {
                    firstName: true,
                    lastName: true,
                    type: true,
                    organizationName: true,
                  },
                },
              },
            },
          },
        }),
      );
    } catch (error) {
      captureScheduledException(error, `${PLEDGE_ALERT_JOB}.fetchInstallments`, "scheduled");
      continue;
    }

    // Filter to only active pledges with outstanding installments
    type InstallmentWithRelations = (typeof alertableInstallments)[number] & {
      pledge: {
        id: string;
        contactId: string;
        status: string;
        faceAmountCents: number;
        contact: {
          firstName: string | null;
          lastName: string | null;
          type: string;
          organizationName: string | null;
        } | null;
      } | null;
    };

    const alertItems = (alertableInstallments as InstallmentWithRelations[]).filter((inst) => {
      if (!inst.pledge) return false;
      if (inst.pledge.status !== "active") return false;
      if (inst.status === "paid" || inst.status === "written_off") return false;
      const dueDate = inst.dueDate instanceof Date ? inst.dueDate : new Date(inst.dueDate);
      return classifyInstallmentBucket(dueDate, now) !== null;
    });

    if (alertItems.length === 0) continue;

    const userIds = orgMemberList.map((m) => m.user?.id).filter((id): id is string => Boolean(id));

    try {
      const preferenceIndex = await withDbRetry(() =>
        loadOrgNotificationPreferences(db, orgId, userIds),
      );

      const getPref = (userId: string): NotificationPreferenceState =>
        preferenceIndex.get(preferenceKey(userId, "pledge_installment_due")) ?? DEFAULT_PREFERENCE;

      for (const member of orgMemberList) {
        const userId = member.user?.id;
        if (!userId) continue;

        const preference = getPref(userId);
        if (!preference.emailEnabled && !preference.inAppEnabled) continue;

        type NotificationInsert = typeof notifications.$inferInsert;
        const rowsToInsert: NotificationInsert[] = [];
        const emailByDedupe = new Map<string, Parameters<typeof integrations.email.send>[0]>();

        for (const inst of alertItems) {
          const dueDate = inst.dueDate instanceof Date ? inst.dueDate : new Date(inst.dueDate);
          const bucket = classifyInstallmentBucket(dueDate, now);
          /* v8 ignore next */
          if (!bucket) continue;

          const contact = (inst as InstallmentWithRelations).pledge?.contact;
          const donorName = contact ? formatDonorName(contact) : "Unknown Donor";

          const alert = buildInstallmentAlert(
            inst.id,
            dueDate,
            inst.amountCents,
            donorName,
            bucket,
            now,
          );

          rowsToInsert.push({
            orgId,
            userId,
            type: "pledge_installment_due",
            title: alert.title,
            body: alert.body,
            entityType: "pledge",
            entityId: (inst as InstallmentWithRelations).pledge?.id ?? inst.pledgeId,
            dedupeKey: alert.dedupeKey,
            readAt: preference.inAppEnabled ? null : new Date(),
          });

          if (preference.emailEnabled && !isSampleNotificationContent(alert.title, alert.body)) {
            const pledgeId = (inst as InstallmentWithRelations).pledge?.id ?? inst.pledgeId;
            emailByDedupe.set(alert.dedupeKey, {
              orgId,
              to: [member.user!.email],
              subject: alert.title,
              text: `${alert.body}\n\nView pledge: ${env.APP_URL}/app/donors/${(inst as InstallmentWithRelations).pledge?.contactId}`,
              source: {
                orgId,
                entityType: "pledge",
                entityId: pledgeId,
              },
            });
          }
        }

        /* v8 ignore next */
        if (rowsToInsert.length === 0) continue;

        const emailClaimByDedupe = await prepareNotificationEmailClaims(
          rowsToInsert,
          emailByDedupe,
        );

        const inserted = await db
          .insert(notifications)
          .values(rowsToInsert)
          .onConflictDoNothing()
          .returning({ dedupeKey: notifications.dedupeKey });

        const emailPromises: Promise<unknown>[] = [];
        for (const row of inserted) {
          if (!row.dedupeKey) continue;
          const claim = emailClaimByDedupe.get(row.dedupeKey);
          if (!claim) continue;
          emailPromises.push(
            deliverClaimedNotificationEmail(db, integrations, claim).catch((err: unknown) => {
              const message = err instanceof Error ? err.message : String(err);
              console.error("[scheduled] email send failed", {
                job: PLEDGE_ALERT_JOB,
                orgId,
                error: message,
              });
              captureScheduledException(err, `${PLEDGE_ALERT_JOB}.email`, "scheduled");
            }),
          );
        }

        if (emailPromises.length > 0) {
          await Promise.allSettled(emailPromises);
        }
      }
    } catch (error) {
      captureScheduledException(error, `${PLEDGE_ALERT_JOB}.processOrg`, "scheduled");
    }
  }
}
