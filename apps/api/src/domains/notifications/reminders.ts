import { and, eq, gt, inArray, isNull, ne, sum } from "drizzle-orm";
import {
  expenses,
  grantCloseoutItems,
  grantReportingRequirements,
  grants,
  notificationPreferences,
  notifications,
  orgMembers,
  type Database,
} from "@grantpipe/db";
import {
  getEffectivePlanTier,
  hasAutomationEmails,
  isWithinBusinessHours,
  type PlanTier,
} from "@grantpipe/shared";
import { getIntegrations } from "../../lib/integrations";
import { captureScheduledException } from "../../lib/sentry";
import { withDbRetry } from "../../lib/db-retry";
import { isSampleNotificationContent } from "./sample-alerts";
import {
  deliverClaimedNotificationEmail,
  prepareNotificationEmailClaims,
  type NotificationEmailDeliveryClaim,
} from "./email-delivery";

type ReminderEnv = {
  APP_URL: string;
  RESEND_API_KEY?: string;
};

type GrantRow = {
  id: string;
  name: string;
  applicationDeadline: Date | null;
};

type ReportingRequirementRow = {
  id: string;
  grantId: string;
  dueDate: Date | null;
  status: string;
  deletedAt: Date | null;
  grant: { name: string } | null;
};

type CloseoutItemRow = {
  id: string;
  grantId: string;
  dueDate: Date | null;
  label: string;
  completed: boolean;
  deletedAt: Date | null;
  grant: { name: string } | null;
};

type OrgReminderSnapshot = {
  grants: GrantRow[];
  reportingRequirements: ReportingRequirementRow[];
  closeoutItems: CloseoutItemRow[];
};

type NotificationPreferenceState = {
  emailEnabled: boolean;
  inAppEnabled: boolean;
};

type ReminderRecipient = {
  orgId: string;
  timezone: string;
  userId: string;
  email: string;
  name: string;
  planTier: PlanTier;
};

export const REMINDER_THRESHOLD_DAYS = [0, 1, 7] as const;

export function isThresholdDay(days: number): boolean {
  return (REMINDER_THRESHOLD_DAYS as readonly number[]).includes(days);
}

export function isEmailEligible(planTier: PlanTier): boolean {
  return hasAutomationEmails(planTier);
}

function getLocalDateParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value ?? "0"),
    month: Number(parts.find((part) => part.type === "month")?.value ?? "0"),
    day: Number(parts.find((part) => part.type === "day")?.value ?? "0"),
  };
}

function toUtcMidnight(date: Date, timeZone: string) {
  const parts = getLocalDateParts(date, timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

export function getDaysUntilDeadline(deadline: Date, timeZone: string, now = new Date()) {
  const currentDayUtc = toUtcMidnight(now, timeZone);
  const deadlineDayUtc = toUtcMidnight(deadline, timeZone);
  return Math.round((deadlineDayUtc - currentDayUtc) / 86_400_000);
}

function buildUrgencyLabel(daysUntilDeadline: number): string {
  if (daysUntilDeadline === 0) return "is due today";
  if (daysUntilDeadline === 1) return "is due tomorrow";
  return `is due in ${daysUntilDeadline} days`;
}

export function buildGrantDeadlineReminder(params: {
  grantId: string;
  grantName: string;
  deadline: Date;
  daysUntilDeadline: number;
}) {
  const deadlineLabel = params.deadline.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const urgency = buildUrgencyLabel(params.daysUntilDeadline);

  return {
    title: `Grant deadline: ${params.grantName}`,
    body: `${params.grantName} ${urgency} on ${deadlineLabel}.`,
    dedupeKey: `grant_deadline:${params.grantId}:${deadlineLabel}`,
  };
}

export function buildReportingDeadlineReminder(params: {
  requirementId: string;
  grantId: string;
  grantName: string;
  dueDate: Date;
  daysUntilDeadline: number;
}) {
  const dateLabel = params.dueDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const urgency = buildUrgencyLabel(params.daysUntilDeadline);

  return {
    title: `Reporting deadline: ${params.grantName}`,
    body: `Reporting requirement for ${params.grantName} ${urgency} on ${dateLabel}.`,
    dedupeKey: `reporting_deadline:${params.requirementId}:${dateLabel}`,
  };
}

export function buildCloseoutDeadlineReminder(params: {
  itemId: string;
  grantId: string;
  grantName: string;
  dueDate: Date;
  daysUntilDeadline: number;
}) {
  const dateLabel = params.dueDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const urgency = buildUrgencyLabel(params.daysUntilDeadline);

  return {
    title: `Closeout deadline: ${params.grantName}`,
    body: `Closeout item for ${params.grantName} ${urgency} on ${dateLabel}.`,
    dedupeKey: `closeout_deadline:${params.itemId}:${dateLabel}`,
  };
}

const DEFAULT_PREFERENCE: NotificationPreferenceState = {
  emailEnabled: true,
  inAppEnabled: true,
};

function preferenceKey(userId: string, notificationType: string): string {
  return `${userId}:${notificationType}`;
}

async function loadOrgNotificationPreferences(
  db: Database,
  orgId: string,
  userIds: string[],
): Promise<Map<string, NotificationPreferenceState>> {
  const map = new Map<string, NotificationPreferenceState>();
  if (userIds.length === 0) return map;

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

const DEADLINE_JOB = "notifications.deadlines";

export async function sendScheduledGrantDeadlineReminders(
  db: Database,
  env: ReminderEnv,
  cron = "unknown",
  now: Date = new Date(),
) {
  const integrations = getIntegrations(db, env as never);
  // Transient database control-plane blips on the first read after pre-warm are
  // recoverable on retry (GRANTPIPE-API-Y). Logic errors still fail fast.
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

  // Group members by org so each org's snapshot + preference batch load
  // happens once and covers every member — replacing the prior
  // O(members × 3) point-lookups with O(orgs × 4) queries total.
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

  // Per-invocation cache keyed by orgId. Members of the same org now share
  // a single read of each of the three scan tables instead of triggering
  // N identical queries — this was the O(members × 3) scan blow-up that
  // exhausted the scheduled handler's wall-time budget in production.
  const orgSnapshots = new Map<string, OrgReminderSnapshot>();

  async function getOrgSnapshot(orgId: string): Promise<OrgReminderSnapshot> {
    const cached = orgSnapshots.get(orgId);
    if (cached) return cached;

    const [grantRows, reportingRows, closeoutRows] = await withDbRetry(() =>
      Promise.all([
        db.query.grants.findMany({
          where: and(eq(grants.orgId, orgId), isNull(grants.deletedAt)),
          columns: {
            id: true,
            name: true,
            applicationDeadline: true,
          },
        }),
        db.query.grantReportingRequirements.findMany({
          where: and(
            eq(grantReportingRequirements.orgId, orgId),
            isNull(grantReportingRequirements.deletedAt),
            ne(grantReportingRequirements.status, "submitted"),
          ),
          columns: {
            id: true,
            grantId: true,
            dueDate: true,
            status: true,
            deletedAt: true,
          },
          with: {
            grant: {
              columns: { name: true },
            },
          },
        }),
        db.query.grantCloseoutItems.findMany({
          where: and(
            eq(grantCloseoutItems.orgId, orgId),
            isNull(grantCloseoutItems.deletedAt),
            eq(grantCloseoutItems.completed, false),
          ),
          columns: {
            id: true,
            grantId: true,
            dueDate: true,
            label: true,
            completed: true,
            deletedAt: true,
          },
          with: {
            grant: {
              columns: { name: true },
            },
          },
        }),
      ]),
    );

    const snapshot: OrgReminderSnapshot = {
      grants: grantRows,
      reportingRequirements: reportingRows,
      closeoutItems: closeoutRows,
    };
    orgSnapshots.set(orgId, snapshot);
    return snapshot;
  }

  function queueEmailSend(
    emailPromises: Promise<unknown>[],
    claim: NotificationEmailDeliveryClaim,
  ) {
    // Fire the Resend request off the DB connection. Individual email
    // failures are swallowed (logged + captured to Sentry) so that one
    // downstream outage cannot bubble up and fail the whole scheduled job.
    emailPromises.push(
      deliverClaimedNotificationEmail(db, integrations, claim).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[scheduled] email send failed", {
          job: DEADLINE_JOB,
          orgId: claim.orgId,
          error: message,
        });
        captureScheduledException(err, `${DEADLINE_JOB}.email`, cron);
      }),
    );
  }

  // Members are iterated serially rather than via Promise.all because every
  // query runs through a single pg.Client per job (node-postgres serializes
  // statements on one connection). Parallelizing here would not actually
  // pipeline work — it would only grow the in-flight queue. Throughput is
  // instead bought by the per-org snapshot + preference batch caches below.
  for (const [orgId, orgMemberList] of membersByOrg) {
    // Hold the org's reminders to its local business hours. The in-app
    // notification and its email are inserted together (the email only fires
    // on a freshly inserted notification), so gating the whole org keeps them
    // atomic. The three reminder threshold days (7/1/0) can never all be
    // weekend days, so deferring out-of-hours ticks shifts which threshold day
    // the single reminder lands on without ever dropping it.
    const orgTimezone = orgMemberList[0]?.organization?.timezone;
    if (!isWithinBusinessHours(now, orgTimezone)) continue;

    const snapshot = await getOrgSnapshot(orgId);
    const preferenceIndex = await loadOrgNotificationPreferences(
      db,
      orgId,
      orgMemberList.map((m) => m.user!.id),
    );
    const getPref = (userId: string, type: string): NotificationPreferenceState =>
      preferenceIndex.get(preferenceKey(userId, type)) ?? DEFAULT_PREFERENCE;

    for (const member of orgMemberList) {
      const organization = member.organization!;
      const user = member.user!;
      const recipient: ReminderRecipient = {
        orgId,
        timezone: organization.timezone,
        userId: user.id,
        email: user.email,
        name: user.name,
        planTier: getEffectivePlanTier({
          planTier: organization.planTier,
          subscriptionStatus: organization.subscriptionStatus,
          trialEndsAt: organization.trialEndsAt,
        }),
      };
      const preference = getPref(recipient.userId, "grant_deadline");
      const reportingPreference = getPref(recipient.userId, "reporting_deadline");
      const closeoutPreference = getPref(recipient.userId, "closeout_deadline");

      const hasAnyInterest =
        preference.emailEnabled ||
        preference.inAppEnabled ||
        reportingPreference.emailEnabled ||
        reportingPreference.inAppEnabled ||
        closeoutPreference.emailEnabled ||
        closeoutPreference.inAppEnabled;
      if (!hasAnyInterest) continue;

      const grantRows = snapshot.grants;

      const emailPromises: Promise<unknown>[] = [];

      for (const grant of grantRows) {
        if (!grant.applicationDeadline) {
          continue;
        }

        const daysUntilDeadline = getDaysUntilDeadline(
          grant.applicationDeadline,
          recipient.timezone,
          now,
        );

        if (!isThresholdDay(daysUntilDeadline)) {
          continue;
        }

        const reminder = buildGrantDeadlineReminder({
          grantId: grant.id,
          grantName: grant.name,
          deadline: grant.applicationDeadline,
          daysUntilDeadline,
        });
        const notificationValues: typeof notifications.$inferInsert = {
          orgId: recipient.orgId,
          userId: recipient.userId,
          type: "grant_deadline",
          title: reminder.title,
          body: reminder.body,
          entityType: "grant",
          entityId: grant.id,
          dedupeKey: reminder.dedupeKey,
          readAt: preference.inAppEnabled ? null : new Date(),
        };
        const emailByDedupe = new Map<string, Parameters<typeof integrations.email.send>[0]>();
        if (
          preference.emailEnabled &&
          isEmailEligible(recipient.planTier) &&
          !isSampleNotificationContent(reminder.title, reminder.body)
        ) {
          emailByDedupe.set(reminder.dedupeKey, {
            orgId: recipient.orgId,
            to: [recipient.email],
            subject: reminder.title,
            text: `${reminder.body}\n\nOpen GrantPipe: ${env.APP_URL}/app/grants/${grant.id}`,
            source: { orgId: recipient.orgId, entityType: "grant", entityId: grant.id },
          });
        }
        const claim = (
          await prepareNotificationEmailClaims([notificationValues], emailByDedupe)
        ).get(reminder.dedupeKey);

        const [notification] = await db
          .insert(notifications)
          .values(notificationValues)
          .onConflictDoNothing()
          .returning();

        if (notification && claim) queueEmailSend(emailPromises, claim);
      }

      // Reporting requirements. The query already filters out submitted +
      // soft-deleted rows in SQL; the runtime re-check below is a belt-and-
      // suspenders guard that also lets unit tests drive this path with
      // hand-built row fixtures that bypass the where clause.
      const reportingRows = snapshot.reportingRequirements;

      for (const requirement of reportingRows) {
        if (
          requirement.deletedAt != null ||
          !requirement.dueDate ||
          requirement.status === "submitted"
        ) {
          continue;
        }

        const daysUntilDeadline = getDaysUntilDeadline(
          requirement.dueDate,
          recipient.timezone,
          now,
        );
        if (!isThresholdDay(daysUntilDeadline)) {
          continue;
        }

        const grantName = requirement.grant?.name ?? "Unknown Grant";
        const reminder = buildReportingDeadlineReminder({
          requirementId: requirement.id,
          grantId: requirement.grantId,
          grantName,
          dueDate: requirement.dueDate,
          daysUntilDeadline,
        });
        const notificationValues: typeof notifications.$inferInsert = {
          orgId: recipient.orgId,
          userId: recipient.userId,
          type: "reporting_deadline",
          title: reminder.title,
          body: reminder.body,
          entityType: "grant",
          entityId: requirement.grantId,
          dedupeKey: reminder.dedupeKey,
          readAt: reportingPreference.inAppEnabled ? null : new Date(),
        };
        const emailByDedupe = new Map<string, Parameters<typeof integrations.email.send>[0]>();
        if (
          reportingPreference.emailEnabled &&
          isEmailEligible(recipient.planTier) &&
          !isSampleNotificationContent(reminder.title, reminder.body)
        ) {
          emailByDedupe.set(reminder.dedupeKey, {
            orgId: recipient.orgId,
            to: [recipient.email],
            subject: reminder.title,
            text: `${reminder.body}\n\nOpen GrantPipe: ${env.APP_URL}/app/grants/${requirement.grantId}`,
            source: {
              orgId: recipient.orgId,
              entityType: "grant",
              entityId: requirement.grantId,
            },
          });
        }
        const claim = (
          await prepareNotificationEmailClaims([notificationValues], emailByDedupe)
        ).get(reminder.dedupeKey);

        const [notification] = await db
          .insert(notifications)
          .values(notificationValues)
          .onConflictDoNothing()
          .returning();

        if (notification && claim) queueEmailSend(emailPromises, claim);
      }

      // Closeout items. Same SQL-filter + runtime guard pattern as above.
      const closeoutRows = snapshot.closeoutItems;

      for (const item of closeoutRows) {
        if (item.deletedAt != null || item.completed || !item.dueDate) {
          continue;
        }

        const daysUntilDeadline = getDaysUntilDeadline(item.dueDate, recipient.timezone, now);
        if (!isThresholdDay(daysUntilDeadline)) {
          continue;
        }

        const grantName = item.grant?.name ?? "Unknown Grant";
        const reminder = buildCloseoutDeadlineReminder({
          itemId: item.id,
          grantId: item.grantId,
          grantName,
          dueDate: item.dueDate,
          daysUntilDeadline,
        });
        const notificationValues: typeof notifications.$inferInsert = {
          orgId: recipient.orgId,
          userId: recipient.userId,
          type: "closeout_deadline",
          title: reminder.title,
          body: reminder.body,
          entityType: "grant",
          entityId: item.id,
          dedupeKey: reminder.dedupeKey,
          readAt: closeoutPreference.inAppEnabled ? null : new Date(),
        };
        const emailByDedupe = new Map<string, Parameters<typeof integrations.email.send>[0]>();
        if (
          closeoutPreference.emailEnabled &&
          isEmailEligible(recipient.planTier) &&
          !isSampleNotificationContent(reminder.title, reminder.body)
        ) {
          emailByDedupe.set(reminder.dedupeKey, {
            orgId: recipient.orgId,
            to: [recipient.email],
            subject: reminder.title,
            text: `${reminder.body}\n\nOpen GrantPipe: ${env.APP_URL}/app/grants/${item.grantId}`,
            source: { orgId: recipient.orgId, entityType: "grant", entityId: item.grantId },
          });
        }
        const claim = (
          await prepareNotificationEmailClaims([notificationValues], emailByDedupe)
        ).get(reminder.dedupeKey);

        const [notification] = await db
          .insert(notifications)
          .values(notificationValues)
          .onConflictDoNothing()
          .returning();

        if (notification && claim) queueEmailSend(emailPromises, claim);
      }

      // All DB work for this member is done — flush any queued emails off
      // the DB connection so Resend latency no longer blocks it. Individual
      // failures were already caught + logged inside queueEmailSend.
      //
      // NOTE: inserts above are issued per-item rather than bulk-per-member
      // because every member of every org needs its own dedupe-keyed row
      // (per the (orgId, userId, dedupeKey) unique constraint on
      // notifications). The win over the pre-fix shape came from eliminating
      // per-member *reads*, not from reducing insert count.
      await Promise.allSettled(emailPromises);
    }
  }
}

const SPEND_DOWN_JOB = "notifications.spend-down";

type TriggeredGrant = {
  id: string;
  orgId: string;
  name: string;
  state: "80" | "90" | "100";
};

function computeSpendDownState(
  expenseTotal: number,
  budget: number,
): TriggeredGrant["state"] | null {
  if (budget <= 0) return null;
  const ratio = expenseTotal / budget;
  if (ratio >= 1) return "100";
  if (ratio >= 0.9) return "90";
  if (ratio >= 0.8) return "80";
  return null;
}

export async function checkGrantSpendDownThresholds(
  db: Database,
  env: ReminderEnv,
  cron = "unknown",
  now: Date = new Date(),
) {
  const integrations = getIntegrations(db, env as never);

  const activeGrants = await withDbRetry(() =>
    db.query.grants.findMany({
      where: and(isNull(grants.deletedAt), gt(grants.amountCents, 0)),
      columns: { id: true, orgId: true, name: true, amountCents: true },
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
      },
    }),
  );

  if (activeGrants.length === 0) return;

  // Sum expenses across every active grant in a single grouped SQL query
  // instead of running one findMany per grant. This replaces the prior
  // O(grants) read amplification that was the next-most-likely source of
  // the scheduled-handler timeout.
  const grantIds = activeGrants.map((g) => g.id);
  const expenseRows = await withDbRetry(() =>
    db
      .select({
        grantId: expenses.grantId,
        total: sum(expenses.amountCents),
      })
      .from(expenses)
      .where(and(inArray(expenses.grantId, grantIds), isNull(expenses.deletedAt)))
      .groupBy(expenses.grantId),
  );

  const expenseTotals = new Map<string, number>();
  for (const row of expenseRows) {
    if (!row.grantId) continue;
    expenseTotals.set(row.grantId, Number(row.total ?? 0));
  }

  // Group triggered grants by orgId so each org's member roster + preference
  // batch load happens once, not once per grant. planTier rides with the
  // bucket so we never have to re-derive it inside the per-org loop.
  const triggeredByOrg = new Map<
    string,
    { planTier: PlanTier; timezone: string; grants: TriggeredGrant[] }
  >();
  for (const grant of activeGrants) {
    if (!grant.organization) continue;
    if (grant.amountCents == null) continue;
    const expenseTotal = expenseTotals.get(grant.id) ?? 0;
    const state = computeSpendDownState(expenseTotal, grant.amountCents);
    if (!state) continue;

    const entry: TriggeredGrant = { id: grant.id, orgId: grant.orgId, name: grant.name, state };
    const bucket = triggeredByOrg.get(grant.orgId);
    if (bucket) {
      bucket.grants.push(entry);
    } else {
      triggeredByOrg.set(grant.orgId, {
        planTier: getEffectivePlanTier({
          planTier: grant.organization.planTier,
          subscriptionStatus: grant.organization.subscriptionStatus,
          trialEndsAt: grant.organization.trialEndsAt,
        }),
        timezone: grant.organization.timezone,
        grants: [entry],
      });
    }
  }

  for (const [orgId, { planTier, timezone, grants: triggeredGrants }] of triggeredByOrg) {
    // Spend-down alerts dedupe on threshold state (not date), so holding an
    // out-of-hours org skips this tick and the alert fires on the next
    // in-business-hours tick — deferred, never dropped.
    if (!isWithinBusinessHours(now, timezone)) continue;

    const members = await withDbRetry(() =>
      db.query.orgMembers.findMany({
        where: and(eq(orgMembers.orgId, orgId), isNull(orgMembers.deletedAt)),
        with: { user: { columns: { id: true, email: true, name: true } } },
      }),
    );

    const userIds = members.map((m) => m.user?.id).filter((id): id is string => Boolean(id));
    if (userIds.length === 0) continue;

    const preferenceIndex = await withDbRetry(() =>
      loadOrgNotificationPreferences(db, orgId, userIds),
    );

    type NotificationInsert = typeof notifications.$inferInsert;
    const rowsToInsert: NotificationInsert[] = [];
    const emailByDedupe = new Map<string, Parameters<typeof integrations.email.send>[0]>();

    for (const member of members) {
      if (!member.user) continue;
      const preference =
        preferenceIndex.get(preferenceKey(member.user.id, "spend_down_threshold")) ??
        DEFAULT_PREFERENCE;
      if (!preference.emailEnabled && !preference.inAppEnabled) continue;

      for (const grant of triggeredGrants) {
        const dedupeKey = `grant_spend_threshold:${grant.id}:${member.user.id}:${grant.state}`;
        const title = `Spend-down alert: ${grant.name}`;
        const body = `${grant.name} has reached ${grant.state}% of its budget.`;

        rowsToInsert.push({
          orgId,
          userId: member.user.id,
          type: "spend_down_threshold",
          title,
          body,
          entityType: "grant",
          entityId: grant.id,
          dedupeKey,
          readAt: preference.inAppEnabled ? null : new Date(),
        });

        if (
          preference.emailEnabled &&
          isEmailEligible(planTier) &&
          !isSampleNotificationContent(title, body)
        ) {
          emailByDedupe.set(dedupeKey, {
            orgId,
            to: [member.user.email],
            subject: title,
            text: `${body}\n\nView: ${env.APP_URL}/app/grants/${grant.id}`,
            source: {
              orgId,
              entityType: "grant",
              entityId: grant.id,
            },
          });
        }
      }
    }

    if (rowsToInsert.length === 0) continue;

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
            job: SPEND_DOWN_JOB,
            orgId,
            error: message,
          });
          captureScheduledException(err, `${SPEND_DOWN_JOB}.email`, cron);
        }),
      );
    }

    // Flush queued emails after all DB work for this org has completed so
    // Resend latency does not pin the DB connection.
    await Promise.allSettled(emailPromises);
  }
}
