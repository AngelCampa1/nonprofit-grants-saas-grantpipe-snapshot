import { and, eq, inArray, isNull } from "drizzle-orm";
import { notifications, notificationPreferences, orgMembers, type Database } from "@grantpipe/db";
import {
  getEffectivePlanTier,
  hasAutomationEmails,
  isWithinBusinessHours,
  type PlanTier,
  type DonorLapseRiskBand,
} from "@grantpipe/shared";
import { getAtRiskDonors, type AtRiskDonor } from "../donors/lapse.service";
import { getIntegrations } from "../../lib/integrations";
import { captureScheduledException } from "../../lib/sentry";
import { withDbRetry } from "../../lib/db-retry";
import { isSampleNotificationContent } from "./sample-alerts";
import { deliverClaimedNotificationEmail, prepareNotificationEmailClaims } from "./email-delivery";

type LapseAlertEnv = {
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

const LAPSE_ALERT_JOB = "notifications.donor_lapse";

const ALERT_BANDS: DonorLapseRiskBand[] = ["lapsing", "at_risk", "lapsed"];

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

export function buildDonorLapseAlert(params: {
  contactId: string;
  displayName: string;
  band: Exclude<DonorLapseRiskBand, "none">;
  daysSinceLastGift: number;
}): { title: string; body: string; dedupeKey: string } {
  const { contactId, displayName, band, daysSinceLastGift } = params;

  const bandLabel =
    band === "lapsing" ? "lapsing" : band === "at_risk" ? "at risk of lapsing" : "lapsed";

  const title = `At-risk donor: ${displayName}`;
  const body = `${displayName} is ${bandLabel}. Last gift was ${daysSinceLastGift} days ago.`;
  const dedupeKey = `donor_lapse:${contactId}:${band}`;

  return { title, body, dedupeKey };
}

export async function scanDonorLapseAlerts(
  db: Database,
  env: LapseAlertEnv,
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
            defaultEntityId: true,
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
    if (!orgInfo.defaultEntityId) continue;
    const planTier: PlanTier = getEffectivePlanTier({
      planTier: orgInfo.planTier,
      subscriptionStatus: orgInfo.subscriptionStatus,
      trialEndsAt: orgInfo.trialEndsAt,
    });

    // The entire lapse feature (in-app + email) is Growth+ only.
    // Starter orgs get no notifications at all, and we skip the donor scan to
    // avoid the expensive query on ineligible orgs.
    if (!hasAutomationEmails(planTier)) continue;

    // Get at-risk donors for this org (only alert bands)
    let atRiskDonors: AtRiskDonor[];
    try {
      const result = await getAtRiskDonors(db, {
        orgId,
        entityId: orgInfo.defaultEntityId,
        now,
        bands: ALERT_BANDS,
      });
      atRiskDonors = result.donors;
    } catch (error) {
      captureScheduledException(error, `${LAPSE_ALERT_JOB}.getAtRiskDonors`, "scheduled");
      continue;
    }

    if (atRiskDonors.length === 0) continue;

    const userIds = orgMemberList.map((m) => m.user?.id).filter((id): id is string => Boolean(id));

    const preferenceIndex = await withDbRetry(() =>
      loadOrgNotificationPreferences(db, orgId, userIds),
    );
    const getPref = (userId: string): NotificationPreferenceState =>
      preferenceIndex.get(preferenceKey(userId, "donor_lapse_alert")) ?? DEFAULT_PREFERENCE;

    for (const member of orgMemberList) {
      const preference = getPref(member.user!.id);

      if (!preference.emailEnabled && !preference.inAppEnabled) continue;

      const emailByDedupe = new Map<string, Parameters<typeof integrations.email.send>[0]>();

      type NotificationInsert = typeof notifications.$inferInsert;
      const rowsToInsert: NotificationInsert[] = [];

      for (const donor of atRiskDonors) {
        const alert = buildDonorLapseAlert({
          contactId: donor.contactId,
          displayName: donor.displayName,
          band: donor.band,
          daysSinceLastGift: donor.daysSinceLastGift,
        });

        rowsToInsert.push({
          orgId,
          userId: member.user!.id,
          type: "donor_lapse_alert",
          title: alert.title,
          body: alert.body,
          entityType: "contact",
          entityId: donor.contactId,
          dedupeKey: alert.dedupeKey,
          readAt: preference.inAppEnabled ? null : new Date(),
        });

        if (
          preference.emailEnabled &&
          hasAutomationEmails(planTier) &&
          !isSampleNotificationContent(alert.title, alert.body)
        ) {
          emailByDedupe.set(alert.dedupeKey, {
            orgId,
            to: [member.user!.email],
            subject: alert.title,
            text: `${alert.body}\n\nView donor: ${env.APP_URL}/app/donors/${donor.contactId}`,
            source: {
              orgId,
              entityType: "contact",
              entityId: donor.contactId,
            },
          });
        }
      }

      const emailClaimByDedupe = await prepareNotificationEmailClaims(rowsToInsert, emailByDedupe);

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
              job: LAPSE_ALERT_JOB,
              orgId,
              error: message,
            });
            captureScheduledException(err, `${LAPSE_ALERT_JOB}.email`, "scheduled");
          }),
        );
      }

      await Promise.allSettled(emailPromises);
    }
  }
}
