import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { contacts, donations, funds, grants, importHistory, organizations } from "@grantpipe/db";
import type { Database } from "@grantpipe/db";
import type { OnboardingGoal } from "@grantpipe/shared";
import { isMissingColumnError } from "../../lib/db-errors";
import { conflict } from "../../lib/app-error";

// ---------------------------------------------------------------------------
// getOnboardingStatus
// ---------------------------------------------------------------------------

export async function getOnboardingStatus(
  db: Database,
  orgId: string,
): Promise<{ completed: boolean }> {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: { onboardingCompleted: true },
  });

  return { completed: org?.onboardingCompleted ?? false };
}

// ---------------------------------------------------------------------------
// completeOnboarding
// ---------------------------------------------------------------------------

type CompleteOnboardingInput = {
  orgId: string;
  orgName: string;
  fiscalYearStartMonth: number;
  timezone: string;
  onboardingGoal?: OnboardingGoal;
};

type OnboardingCompletionResult = {
  org: typeof organizations.$inferSelect;
  wasAlreadyComplete: boolean;
};

export async function completeOnboarding(
  db: Database,
  input: CompleteOnboardingInput,
): Promise<typeof organizations.$inferSelect> {
  const { orgId, orgName, fiscalYearStartMonth, timezone } = input;
  const current = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: { onboardingCompleted: true },
  });
  const onboardingCompleted = current?.onboardingCompleted ?? false;
  const now = new Date();
  let updated: typeof organizations.$inferSelect | undefined;

  try {
    [updated] = await db
      .update(organizations)
      .set({
        name: orgName,
        fiscalYearStartMonth,
        timezone,
        ...(input.onboardingGoal !== undefined ? { onboardingGoal: input.onboardingGoal } : {}),
        onboardingCompleted,
        updatedAt: now,
      })
      .where(eq(organizations.id, orgId))
      .returning();
  } catch (error) {
    if (!isMissingColumnError(error, "plan_selected_at")) {
      throw error;
    }

    console.error("[onboarding] Falling back for completeOnboarding without plan_selected_at", {
      orgId,
    });
    // This fallback only runs on a schema old enough to be missing plan_selected_at.
    // onboarding_goal (added in migration 0069, newer than plan_selected_at) is
    // therefore guaranteed absent on that same schema, so it is omitted from the SET
    // clause — referencing the real column there would throw "column does not exist"
    // in exactly the case this fallback exists to handle. RETURNING still emits a
    // typed NULL placeholder (NULL::text as "onboardingGoal") so the returned row
    // matches the declared $inferSelect shape without touching the missing column.
    const result = await db.execute<typeof organizations.$inferSelect>(sql`
      UPDATE "organizations"
      SET
        "name" = ${orgName},
        "fiscal_year_start_month" = ${fiscalYearStartMonth},
        "timezone" = ${timezone},
        "onboarding_completed" = ${onboardingCompleted},
        "updated_at" = ${now}
      WHERE "id" = ${orgId}
      RETURNING
        "id",
        "name",
        "slug",
        "ein",
        "fiscal_year_start_month" as "fiscalYearStartMonth",
        "timezone",
        "logo_url" as "logoUrl",
        "address",
        "stripe_customer_id" as "stripeCustomerId",
        "stripe_subscription_id" as "stripeSubscriptionId",
        "plan_tier" as "planTier",
        "billing_cycle" as "billingCycle",
        "subscription_status" as "subscriptionStatus",
        "trial_started_at" as "trialStartedAt",
        "trial_ends_at" as "trialEndsAt",
        "trial_will_end_notified_at" as "trialWillEndNotifiedAt",
        "promo_code_applied" as "promoCodeApplied",
        NULL::timestamptz as "planSelectedAt",
        NULL::text as "onboardingGoal",
        "onboarding_completed" as "onboardingCompleted",
        "accounting_enabled" as "accountingEnabled",
        "created_at" as "createdAt",
        "updated_at" as "updatedAt",
        "deleted_at" as "deletedAt"
    `);
    const rows = Array.isArray(result) ? result : result.rows;
    [updated] = rows;
  }

  if (!updated) {
    throw new Error("Failed to update organization");
  }

  return updated;
}

export async function markOnboardingCompleted(
  db: Database,
  orgId: string,
): Promise<OnboardingCompletionResult> {
  const current = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: { onboardingCompleted: true },
  });
  const wasAlreadyComplete = current?.onboardingCompleted ?? false;
  const hasActivationEvidence = await hasOnboardingActivationEvidence(
    db,
    orgId,
    wasAlreadyComplete,
  );
  if (!hasActivationEvidence) {
    throw conflict("Finish one setup action before completing onboarding.");
  }

  const now = new Date();
  let updated: typeof organizations.$inferSelect | undefined;

  try {
    [updated] = await db
      .update(organizations)
      .set({
        onboardingCompleted: true,
        updatedAt: now,
      })
      .where(eq(organizations.id, orgId))
      .returning();
  } catch (error) {
    if (!isMissingColumnError(error, "plan_selected_at")) {
      throw error;
    }

    console.error(
      "[onboarding] Falling back for markOnboardingCompleted without plan_selected_at",
      {
        orgId,
      },
    );
    const result = await db.execute<typeof organizations.$inferSelect>(sql`
      UPDATE "organizations"
      SET
        "onboarding_completed" = true,
        "updated_at" = ${now}
      WHERE "id" = ${orgId}
      RETURNING
        "id",
        "name",
        "slug",
        "ein",
        "fiscal_year_start_month" as "fiscalYearStartMonth",
        "timezone",
        "logo_url" as "logoUrl",
        "address",
        "stripe_customer_id" as "stripeCustomerId",
        "stripe_subscription_id" as "stripeSubscriptionId",
        "plan_tier" as "planTier",
        "billing_cycle" as "billingCycle",
        "subscription_status" as "subscriptionStatus",
        "trial_started_at" as "trialStartedAt",
        "trial_ends_at" as "trialEndsAt",
        "trial_will_end_notified_at" as "trialWillEndNotifiedAt",
        "promo_code_applied" as "promoCodeApplied",
        NULL::timestamptz as "planSelectedAt",
        NULL::text as "onboardingGoal",
        "onboarding_completed" as "onboardingCompleted",
        "accounting_enabled" as "accountingEnabled",
        "created_at" as "createdAt",
        "updated_at" as "updatedAt",
        "deleted_at" as "deletedAt"
    `);
    const rows = Array.isArray(result) ? result : result.rows;
    [updated] = rows;
  }

  if (!updated) {
    throw new Error("Failed to complete onboarding");
  }

  return { org: updated, wasAlreadyComplete };
}

export async function hasOnboardingActivationEvidence(
  db: Database,
  orgId: string,
  alreadyCompleted = false,
): Promise<boolean> {
  const [contact, donation, fund, grant, importRow] = await Promise.all([
    db.query.contacts.findFirst({
      where: and(eq(contacts.orgId, orgId), isNull(contacts.deletedAt)),
      columns: { id: true },
    }),
    db.query.donations.findFirst({
      where: and(eq(donations.orgId, orgId), isNull(donations.deletedAt)),
      columns: { id: true },
    }),
    db.query.funds.findFirst({
      where: and(eq(funds.orgId, orgId), isNull(funds.deletedAt)),
      columns: { id: true },
    }),
    db.query.grants.findFirst({
      where: and(eq(grants.orgId, orgId), isNull(grants.deletedAt)),
      columns: { id: true },
    }),
    db.query.importHistory.findFirst({
      where: and(eq(importHistory.orgId, orgId), gt(importHistory.insertedRows, 0)),
      columns: { id: true },
    }),
  ]);

  return Boolean(alreadyCompleted || contact || donation || fund || grant || importRow);
}
