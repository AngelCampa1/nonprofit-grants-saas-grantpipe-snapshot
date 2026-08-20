import { Hono } from "hono";
import {
  ANALYTICS_EVENTS,
  SUBSCRIPTION_STATUSES,
  billingLifecycleState,
  type SubscriptionStatus,
} from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import {
  AccountDeletionBlockedError,
  acceptInvite,
  checkInvite,
  deleteUserAccount,
} from "./service";
import { getIntegrations } from "../../lib/integrations";
import { captureBackgroundException } from "../../lib/sentry";
import { getEffectiveOrgPlanTier } from "../../lib/effective-plan-tier";
import { listEntityAccessForOrgMember, listEntityAccessForUser } from "../../lib/entity-access";

function mapAcceptInviteError(error: string) {
  switch (error) {
    case "invite_not_found":
      return "Invite not found";
    case "invite_expired":
      return "Invite expired";
    case "invite_already_used":
      return "Invite already used";
    case "invite_email_mismatch":
      return "This invite was sent to a different email address";
    default:
      return "Failed to accept invite";
  }
}

function swallowCapture(surface: string, step: string, capture: () => Promise<unknown> | unknown) {
  try {
    void Promise.resolve(capture()).catch((error: unknown) => {
      captureBackgroundException(error, surface, { step });
    });
  } catch (error) {
    captureBackgroundException(error, surface, { step });
    // Telemetry must never change the user-facing auth result.
  }
}

function normalizeSubscriptionStatus(value: string | null | undefined): SubscriptionStatus | null {
  if (!value) return null;
  if ((SUBSCRIPTION_STATUSES as readonly string[]).includes(value)) {
    return value as SubscriptionStatus;
  }
  return "trialing";
}

// Public invite verification route — must be mounted BEFORE the session middleware
// so that invitees without an active session can confirm a link is valid before
// signing up or logging in. The accept POST is intentionally NOT included here;
// it still requires an authenticated session and lives on `authRoutes` below.
export const publicInviteRoutes = new Hono<AppEnv>().get("/invites/:token", async (c) => {
  const token = c.req.param("token");
  const result = await checkInvite(c.get("db"), { token });
  if (!result.valid) {
    return c.json({ message: mapAcceptInviteError(result.error) }, 400);
  }
  return c.json({ valid: true, role: result.role });
});

export const inviteAcceptanceRoutes = new Hono<AppEnv>().post(
  "/invites/:token/accept",
  async (c) => {
    const token = c.req.param("token");
    const result = await acceptInvite(c.get("db"), {
      token,
      userId: c.get("user")!.id,
      userEmail: c.get("user")!.email,
    });
    if ("error" in result) {
      swallowCapture("auth", "invite_error_capture", () =>
        getIntegrations(c.get("db"), c.env).errors.capture({
          orgId: c.get("orgId") ?? undefined,
          message: mapAcceptInviteError(result.error),
          payload: { actorId: c.get("user")!.id },
        }),
      );
      return c.json({ message: mapAcceptInviteError(result.error) }, 400);
    }
    swallowCapture("auth", "invite_accepted_analytics", () =>
      getIntegrations(c.get("db"), c.env).analytics.capture({
        orgId: result.orgId,
        eventName: ANALYTICS_EVENTS.inviteAccepted,
        payload: { actorId: c.get("user")!.id, role: result.role },
      }),
    );
    return c.json(result);
  },
);

export const accountRoutes = new Hono<AppEnv>().delete("/account", async (c) => {
  const payload = (await c.req.json().catch(() => null)) as { confirmation?: unknown } | null;
  if (payload?.confirmation !== "DELETE") {
    return c.json({ message: "Type DELETE to confirm account deletion." }, 400);
  }

  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    await deleteUserAccount(c.get("db"), user.id);
    return c.json({ status: "deleted" });
  } catch (error) {
    if (error instanceof AccountDeletionBlockedError) {
      return c.json({ message: error.message }, 400);
    }
    throw error;
  }
});

export const authRoutes = new Hono<AppEnv>().get("/session", async (c) => {
  const user = c.get("user");
  const session = c.get("session");
  const orgId = c.get("orgId");
  const orgMemberId = c.get("orgMemberId");
  const memberRole = c.get("memberRole");
  const memberPermissions = c.get("memberPermissions");
  const entityId = c.get("entityId");
  const entityScope = c.get("entityScope");
  const entityRole = c.get("entityRole");
  const entityPermissions = c.get("entityPermissions");
  const orgSubscription = c.get("orgSubscription");
  const normalizedStatus = normalizeSubscriptionStatus(orgSubscription?.subscriptionStatus);
  const availableEntities =
    orgId && orgMemberId
      ? await listEntityAccessForOrgMember(c.get("db"), {
          orgId,
          orgMemberId,
          defaultEntityId: orgSubscription?.defaultEntityId ?? null,
        })
      : user && orgId
        ? await listEntityAccessForUser(c.get("db"), {
            orgId,
            userId: user.id,
            defaultEntityId: orgSubscription?.defaultEntityId ?? null,
          })
        : [];
  const activeEntity = availableEntities.find((entity) => entity.id === entityId) ?? null;

  return c.json({
    user,
    session: { id: session?.id },
    orgId,
    memberRole,
    memberPermissions,
    entityId,
    entityScope,
    entityRole,
    entityPermissions,
    activeEntity,
    availableEntities,
    onboardingCompleted: orgSubscription?.onboardingCompleted ?? false,
    planSelectionCompleted: orgSubscription?.planSelectedAt != null,
    onboardingGoal: orgSubscription?.onboardingGoal ?? null,
    orgSubscription: orgSubscription
      ? {
          subscriptionStatus: normalizedStatus,
          billingLifecycleState: billingLifecycleState({
            subscriptionStatus: normalizedStatus ?? "expired",
            trialEndsAt: orgSubscription.trialEndsAt ?? null,
          }),
          trialEndsAt: orgSubscription.trialEndsAt?.toISOString() ?? null,
          planTier: orgSubscription.planTier ?? null,
          effectivePlanTier: getEffectiveOrgPlanTier(orgSubscription),
          onboardingCompleted: orgSubscription.onboardingCompleted,
          onboardingGoal: orgSubscription.onboardingGoal ?? null,
          planSelectedAt: orgSubscription.planSelectedAt?.toISOString() ?? null,
          stripeSubscriptionId: orgSubscription.stripeSubscriptionId ?? null,
        }
      : null,
  });
});
