import { and, eq, inArray, isNull } from "drizzle-orm";
import { notifications, notificationPreferences, orgMembers, type Database } from "@grantpipe/db";
import {
  ANALYTICS_EVENTS,
  canUseGrantBudgetAlerts,
  getEffectivePlanTier,
  isWithinBusinessHours,
  resolveEffectivePermissions,
  type PermissionLevel,
  type PermissionOverrides,
  type PlanTier,
  type Role,
} from "@grantpipe/shared";
import {
  getBudgetSentinel,
  isAlertableBand,
  type BudgetSentinelItem,
  type BudgetSentinelOverspendItem,
  type BudgetSentinelUnderspendItem,
} from "../grants/sentinel.service";
import { getIntegrations } from "../../lib/integrations";
import { captureScheduledException } from "../../lib/sentry";
import { withDbRetry } from "../../lib/db-retry";
import { isSampleNotificationContent } from "./sample-alerts";
import { deliverClaimedNotificationEmail, prepareNotificationEmailClaims } from "./email-delivery";

type SentinelAlertEnv = {
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

const SENTINEL_ALERT_JOB = "notifications.budget_sentinel";

const PERMISSION_RANK: Record<PermissionLevel, number> = {
  none: 0,
  view: 1,
  edit: 2,
  manage: 3,
};

function preferenceKey(userId: string, notificationType: string): string {
  return `${userId}:${notificationType}`;
}

function notificationTypeForItem(item: BudgetSentinelItem): string {
  return item.kind === "overspend" ? "grant_overspend_alert" : "fund_underspend_alert";
}

function entityTypeForItem(item: BudgetSentinelItem): string {
  return item.kind === "overspend" ? "grant_budget_line" : "restriction_term";
}

function analyticsPayloadForItem(
  item: BudgetSentinelItem,
  deliveryChannel: "email" | "in_app",
): Record<string, unknown> {
  return {
    alert_kind: item.kind,
    alert_band: item.band,
    entity_type: entityTypeForItem(item),
    delivery_channel: deliveryChannel,
  };
}

async function captureBudgetSentinelAnalytics(
  integrations: ReturnType<typeof getIntegrations>,
  orgId: string,
  eventName: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await integrations.analytics.capture({ orgId, eventName, payload });
  } catch (error) {
    captureScheduledException(error, `${SENTINEL_ALERT_JOB}.analytics`, "scheduled");
  }
}

function canViewBudgetSentinelItem(
  role: Role,
  permissions: PermissionOverrides | null | undefined,
  item: BudgetSentinelItem,
): boolean {
  const effective = resolveEffectivePermissions(role, permissions);

  if (item.kind === "overspend") {
    return PERMISSION_RANK[effective.grants] >= PERMISSION_RANK.view;
  }

  if (item.fundId) {
    return PERMISSION_RANK[effective.funds] >= PERMISSION_RANK.view;
  }

  if (item.grantId) {
    return PERMISSION_RANK[effective.grants] >= PERMISSION_RANK.view;
  }

  return (
    PERMISSION_RANK[effective.funds] >= PERMISSION_RANK.view ||
    PERMISSION_RANK[effective.grants] >= PERMISSION_RANK.view
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

export function buildBudgetSentinelAlert(item: BudgetSentinelItem): {
  title: string;
  body: string;
  dedupeKey: string;
} {
  if (item.kind === "overspend") {
    return buildOverspendAlert(item);
  }
  return buildUnderspendAlert(item);
}

function buildOverspendAlert(item: BudgetSentinelOverspendItem): {
  title: string;
  body: string;
  dedupeKey: string;
} {
  const overDollars = (item.overByCents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  const projDollars = (item.projectedCents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  const title = `Budget line '${item.category}' on grant '${item.grantName}' at risk`;

  let body: string;
  if (item.band === "over_budget") {
    body = `Budget line '${item.category}' on grant '${item.grantName}' is over budget by ${overDollars}.`;
  } else {
    body = `Budget line '${item.category}' on grant '${item.grantName}' is projected to reach ${projDollars}, exceeding the approved amount.`;
  }

  return { title, body, dedupeKey: `grant_overspend:${item.id}:${item.band}` };
}

function buildUnderspendAlert(item: BudgetSentinelUnderspendItem): {
  title: string;
  body: string;
  dedupeKey: string;
} {
  const balanceDollars = (item.balanceCents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  const title = `Restricted fund '${item.title}' has unspent balance`;

  let body: string;
  if (item.band === "lapsed_unspent") {
    body = `Restricted fund '${item.title}' has ${balanceDollars} of unspent balance that has lapsed (end date passed ${Math.abs(item.daysUntilEnd)} days ago).`;
  } else {
    body = `Restricted fund '${item.title}' has ${balanceDollars} lapsing in ${item.daysUntilEnd} days.`;
  }

  return { title, body, dedupeKey: `fund_underspend:${item.id}:${item.band}` };
}

export async function scanBudgetSentinelAlerts(
  db: Database,
  env: SentinelAlertEnv,
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

    // The entire budget sentinel feature (in-app + email) is Growth+ only.
    // Starter orgs get no notifications at all; we skip the scan entirely to
    // avoid loading budget data for ineligible orgs.
    if (!canUseGrantBudgetAlerts(planTier)) continue;

    let atRiskItems: BudgetSentinelItem[];
    try {
      const result = await getBudgetSentinel(db, { orgId, now });
      // Only alert on actionable bands:
      // - overspend: projected_overspend, over_budget (near_limit shows in view but does NOT fire a notification)
      // - underspend: all non-ok bands (lapse_watch, lapsing_soon, lapsed_unspent)
      atRiskItems = result.items.filter(isAlertableBand);
    } catch (error) {
      captureScheduledException(error, `${SENTINEL_ALERT_JOB}.getBudgetSentinel`, "scheduled");
      continue;
    }

    if (atRiskItems.length === 0) continue;

    const userIds = orgMemberList.map((m) => m.user?.id).filter((id): id is string => Boolean(id));

    try {
      const preferenceIndex = await withDbRetry(() =>
        loadOrgNotificationPreferences(db, orgId, userIds),
      );

      const getPref = (userId: string, notificationType: string): NotificationPreferenceState =>
        preferenceIndex.get(preferenceKey(userId, notificationType)) ?? DEFAULT_PREFERENCE;

      for (const member of orgMemberList) {
        const userId = member.user!.id;

        // Build notification rows for all alertable items this member should receive
        type NotificationInsert = typeof notifications.$inferInsert;
        const rowsToInsert: NotificationInsert[] = [];
        const emailByDedupe = new Map<string, Parameters<typeof integrations.email.send>[0]>();
        const itemByDedupe = new Map<string, BudgetSentinelItem>();

        for (const item of atRiskItems) {
          if (
            !canViewBudgetSentinelItem(
              (member.role ?? "viewer") as Role,
              member.permissions as PermissionOverrides | null | undefined,
              item,
            )
          ) {
            continue;
          }

          const notificationType = notificationTypeForItem(item);
          const preference = getPref(userId, notificationType);

          if (!preference.emailEnabled && !preference.inAppEnabled) continue;

          const alert = buildBudgetSentinelAlert(item);
          itemByDedupe.set(alert.dedupeKey, item);

          rowsToInsert.push({
            orgId,
            userId,
            type: notificationType,
            title: alert.title,
            body: alert.body,
            entityType: entityTypeForItem(item),
            entityId: item.id,
            dedupeKey: alert.dedupeKey,
            readAt: preference.inAppEnabled ? null : new Date(),
          });

          if (preference.emailEnabled && !isSampleNotificationContent(alert.title, alert.body)) {
            // overspend: link to grant detail page (budget is a tab, not a route segment)
            // underspend: prefer fund page when fundId is set, else grant page, else list
            const entityPath =
              item.kind === "overspend"
                ? `/app/grants/${item.grantId}`
                : item.fundId
                  ? `/app/funds/${item.fundId}`
                  : item.grantId
                    ? `/app/grants/${item.grantId}`
                    : `/app/grants`;

            emailByDedupe.set(alert.dedupeKey, {
              orgId,
              to: [member.user!.email],
              subject: alert.title,
              text: `${alert.body}\n\nView: ${env.APP_URL}${entityPath}`,
              source: {
                orgId,
                entityType: entityTypeForItem(item),
                entityId: item.id,
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
        const analyticsPromises: Promise<unknown>[] = [];
        for (const row of inserted) {
          if (!row.dedupeKey) continue;
          const item = itemByDedupe.get(row.dedupeKey);
          if (item) {
            analyticsPromises.push(
              captureBudgetSentinelAnalytics(
                integrations,
                orgId,
                ANALYTICS_EVENTS.budgetSentinelAlertCreated,
                analyticsPayloadForItem(item, "in_app"),
              ),
            );
          }

          const claim = emailClaimByDedupe.get(row.dedupeKey);
          if (!claim) continue;
          emailPromises.push(
            (async () => {
              try {
                await deliverClaimedNotificationEmail(db, integrations, claim);
                if (item) {
                  await captureBudgetSentinelAnalytics(
                    integrations,
                    orgId,
                    ANALYTICS_EVENTS.budgetSentinelEmailSent,
                    analyticsPayloadForItem(item, "email"),
                  );
                }
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.error("[scheduled] email send failed", {
                  job: SENTINEL_ALERT_JOB,
                  orgId,
                  error: message,
                });
                captureScheduledException(err, `${SENTINEL_ALERT_JOB}.email`, "scheduled");
              }
            })(),
          );
        }

        await Promise.allSettled([...analyticsPromises, ...emailPromises]);
      }
    } catch (error) {
      captureScheduledException(error, `${SENTINEL_ALERT_JOB}.deliver`, "scheduled");
    }
  }
}
