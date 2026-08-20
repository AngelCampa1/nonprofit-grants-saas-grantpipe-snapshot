import { and, eq, inArray, isNull } from "drizzle-orm";
import { notifications, notificationPreferences, orgMembers, type Database } from "@grantpipe/db";
import {
  ANALYTICS_EVENTS,
  canUseAccountingAnomalyDetector,
  getDefaultPermissionsForEntityRole,
  getEffectivePlanTier,
  isWithinBusinessHours,
  resolveEffectivePermissions,
  type EntityPermissionOverrides,
  type EntityRole,
  type PlanTier,
  type Role,
} from "@grantpipe/shared";
import { getAnomalies, isReviewableAnomaly, type AnomalyItem } from "../accounting/anomaly.service";
import { getIntegrations } from "../../lib/integrations";
import { captureScheduledException } from "../../lib/sentry";
import { withDbRetry } from "../../lib/db-retry";
import { isSampleNotificationContent } from "./sample-alerts";
import { deliverClaimedNotificationEmail, prepareNotificationEmailClaims } from "./email-delivery";

type AnomalyAlertEnv = {
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

const ANOMALY_ALERT_JOB = "notifications.accounting_anomaly";

function preferenceKey(userId: string, notificationType: string): string {
  return `${userId}:${notificationType}`;
}

function anomalyAnalyticsPayload(
  item: AnomalyItem,
  deliveryChannel: "dedupe_only" | "in_app" | "email",
): Record<string, unknown> {
  return {
    anomaly_class: item.class,
    severity: item.severity,
    entity_type: item.entityType,
    delivery_channel: deliveryChannel,
  };
}

function captureAnomalyAnalytics(
  integrations: ReturnType<typeof getIntegrations>,
  orgId: string,
  eventName: string,
  payload: Record<string, unknown>,
): void {
  void Promise.resolve(integrations.analytics.capture({ orgId, eventName, payload })).catch(
    (error: unknown) => {
      captureScheduledException(error, `${ANOMALY_ALERT_JOB}.analytics`, "scheduled");
    },
  );
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

export function buildAnomalyAlert(item: AnomalyItem): {
  title: string;
  body: string;
  dedupeKey: string;
};
export function buildAnomalyAlert(
  item: AnomalyItem,
  activeEntityId: string,
): {
  title: string;
  body: string;
  dedupeKey: string;
};
export function buildAnomalyAlert(item: AnomalyItem, activeEntityId?: string) {
  const title = `Accounting anomaly detected: ${item.class.replace(/_/g, " ")}`;
  const body = item.reason;
  const dedupeKey = `anomaly:${activeEntityId ? `${activeEntityId}:` : ""}${item.class}:${item.entityId}`;
  return { title, body, dedupeKey };
}

function canViewAccounting(role: Role, permissions: Record<string, string> | null | undefined) {
  return resolveEffectivePermissions(role, permissions).accounting !== "none";
}

function canViewEntityAccounting(entityMember: {
  role: string;
  permissions?: Record<string, string> | null;
}) {
  const role = entityMember.role as EntityRole;
  const defaults = getDefaultPermissionsForEntityRole(role);
  const effective =
    role === "admin" || role === "auditor"
      ? defaults
      : { ...defaults, ...(entityMember.permissions as EntityPermissionOverrides | null) };
  return effective.accounting !== "none";
}

export async function scanAccountingAnomalies(
  db: Database,
  env: AnomalyAlertEnv,
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
        entityMembers: {
          where: (entityMember, { isNull: relationIsNull }) =>
            relationIsNull(entityMember.deletedAt),
          columns: {
            entityId: true,
            role: true,
            permissions: true,
            deletedAt: true,
          },
          with: {
            entity: {
              columns: {
                status: true,
                deletedAt: true,
              },
            },
          },
        },
      },
    }),
  );

  // Group members by org
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
    const orgTimezone = orgMemberList[0]?.organization?.timezone;
    if (!isWithinBusinessHours(now, orgTimezone)) continue;

    const orgInfo = orgMemberList[0]!.organization!;
    const planTier: PlanTier = getEffectivePlanTier({
      planTier: orgInfo.planTier,
      subscriptionStatus: orgInfo.subscriptionStatus,
      trialEndsAt: orgInfo.trialEndsAt,
    });

    // Accounting anomaly detector is audit_ready+ only (starter and growth excluded).
    if (!canUseAccountingAnomalyDetector(planTier)) continue;

    const membersByEntity = new Map<string, typeof orgMemberList>();
    for (const member of orgMemberList) {
      if (
        !canViewAccounting(member.role as Role, member.permissions as Record<string, string> | null)
      ) {
        continue;
      }
      for (const entityMember of member.entityMembers) {
        if (entityMember.entity?.status !== "active" || entityMember.entity.deletedAt !== null) {
          continue;
        }
        if (!canViewEntityAccounting(entityMember)) continue;
        const bucket = membersByEntity.get(entityMember.entityId);
        if (bucket) bucket.push(member);
        else membersByEntity.set(entityMember.entityId, [member]);
      }
    }

    await Promise.allSettled(
      [...membersByEntity].map(async ([activeEntityId, eligibleMembers]) => {
        let reviewableItems: AnomalyItem[];
        try {
          const result = await getAnomalies(db, {
            orgId,
            entityId: activeEntityId,
            now,
            hasRestrictionData: true,
            hasIndirectRules: true,
          });
          reviewableItems = result.items.filter(isReviewableAnomaly);
        } catch (error) {
          captureScheduledException(error, `${ANOMALY_ALERT_JOB}.getAnomalies`, "scheduled");
          return;
        }

        if (reviewableItems.length === 0) return;
        const userIds = eligibleMembers.map((member) => member.user!.id);

        try {
          const preferenceIndex = await withDbRetry(() =>
            loadOrgNotificationPreferences(db, orgId, userIds),
          );

          const getPref = (userId: string, notificationType: string): NotificationPreferenceState =>
            preferenceIndex.get(preferenceKey(userId, notificationType)) ?? DEFAULT_PREFERENCE;

          for (const member of eligibleMembers) {
            const userId = member.user!.id;

            type NotificationInsert = typeof notifications.$inferInsert;
            const rowsToInsert: NotificationInsert[] = [];
            const emailByDedupe = new Map<string, Parameters<typeof integrations.email.send>[0]>();
            const itemByDedupe = new Map<string, AnomalyItem>();
            const alertChannelByDedupe = new Map<string, "dedupe_only" | "in_app">();

            for (const item of reviewableItems) {
              const notificationType = "accounting_anomaly";
              const preference = getPref(userId, notificationType);

              if (!preference.emailEnabled && !preference.inAppEnabled) continue;

              const alert = buildAnomalyAlert(item, activeEntityId);

              rowsToInsert.push({
                orgId,
                userId,
                type: notificationType,
                title: alert.title,
                body: alert.body,
                entityType: item.entityType,
                entityId: item.entityId,
                activeEntityId,
                dedupeKey: alert.dedupeKey,
                readAt: preference.inAppEnabled ? null : new Date(),
              });
              itemByDedupe.set(alert.dedupeKey, item);
              alertChannelByDedupe.set(
                alert.dedupeKey,
                preference.inAppEnabled ? "in_app" : "dedupe_only",
              );

              if (
                preference.emailEnabled &&
                !isSampleNotificationContent(alert.title, alert.body)
              ) {
                emailByDedupe.set(alert.dedupeKey, {
                  orgId,
                  to: [member.user!.email],
                  subject: alert.title,
                  text: `${alert.body}\n\nView: ${env.APP_URL}/app/accounting/anomalies?entityId=${encodeURIComponent(activeEntityId)}`,
                  source: {
                    orgId,
                    entityType: item.entityType,
                    entityId: item.entityId,
                  },
                });
              }
            }

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
              const item = itemByDedupe.get(row.dedupeKey);
              if (!item) continue;
              captureAnomalyAnalytics(
                integrations,
                orgId,
                ANALYTICS_EVENTS.accountingAnomalyAlertCreated,
                anomalyAnalyticsPayload(item, alertChannelByDedupe.get(row.dedupeKey)!),
              );
              const claim = emailClaimByDedupe.get(row.dedupeKey);
              if (!claim) continue;
              emailPromises.push(
                deliverClaimedNotificationEmail(db, integrations, claim)
                  .then(() => {
                    captureAnomalyAnalytics(
                      integrations,
                      orgId,
                      ANALYTICS_EVENTS.accountingAnomalyEmailSent,
                      anomalyAnalyticsPayload(item, "email"),
                    );
                  })
                  .catch((err: unknown) => {
                    const message = String(err);
                    console.error("[scheduled] email send failed", {
                      job: ANOMALY_ALERT_JOB,
                      orgId,
                      error: message,
                    });
                    captureScheduledException(err, `${ANOMALY_ALERT_JOB}.email`, "scheduled");
                  }),
              );
            }

            await Promise.allSettled(emailPromises);
          }
        } catch (error) {
          captureScheduledException(error, `${ANOMALY_ALERT_JOB}.deliver`, "scheduled");
        }
      }),
    );
  }
}
