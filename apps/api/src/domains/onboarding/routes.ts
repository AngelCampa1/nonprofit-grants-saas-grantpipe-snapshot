import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { ANALYTICS_EVENTS, DEFAULT_BILLING_CYCLE, onboardingSchema } from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { requireRole } from "../../middleware/require-role";
import { getOnboardingStatus, completeOnboarding, markOnboardingCompleted } from "./service";
import { captureApiAnalyticsSafely } from "../../lib/analytics";
import { getIntegrations } from "../../lib/integrations";
import { recordLifecycleEvent } from "../leads/sequencer";
import { captureBackgroundException } from "../../lib/sentry";
import { saveBillingSelection } from "../org/service";

function analyticsForContext(c: Context<AppEnv>) {
  return getIntegrations(c.get("db"), c.env ?? ({} as AppEnv["Bindings"])).analytics;
}

function recordOnboardingLifecycle(c: Context<AppEnv>, onboardingGoal: unknown): Promise<void> {
  const orgId = c.get("orgId")!;
  const user = c.get("user")!;
  return recordLifecycleEvent(c.env, {
    email: user.email,
    event: ANALYTICS_EVENTS.onboardingCompleted,
    idempotencyKey: `${ANALYTICS_EVENTS.onboardingCompleted}:grantpipe:org:${orgId}`,
    properties: {
      orgId,
      userId: user.id,
      ...(typeof onboardingGoal === "string" ? { onboardingGoal } : {}),
    },
  });
}

function captureSequencerLifecycleFailure(c: Context<AppEnv>, error: unknown): void {
  const sanitizedError = new Error("Sequencer onboarding_completed event failed");
  if (error instanceof Error) {
    sanitizedError.name = error.name;
  }
  captureBackgroundException(sanitizedError, "onboarding", {
    step: "sequencer-onboarding-completed",
    org_id: c.get("orgId")!,
  });
}

type WaitUntilExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

function getExecutionContext(c: Context<AppEnv>): WaitUntilExecutionContext | null {
  try {
    return c.executionCtx;
  } catch {
    return null;
  }
}

export const onboardingRoutes = new Hono<AppEnv>()
  .get("/status", async (c) => {
    const db = c.get("db");
    const orgId = c.get("orgId")!;
    const status = await getOnboardingStatus(db, orgId);
    return c.json(status);
  })
  .patch("/", requireRole("admin"), zValidator("json", onboardingSchema), async (c) => {
    const db = c.get("db");
    const orgId = c.get("orgId")!;
    const user = c.get("user")!;
    const { orgName, fiscalYearStartMonth, timezone, onboardingGoal, planTier, billingCycle } =
      c.req.valid("json");
    if (planTier !== undefined) {
      const selection = await saveBillingSelection(db, {
        orgId,
        actorId: user.id,
        data: {
          planTier,
          billingCycle: billingCycle ?? DEFAULT_BILLING_CYCLE,
        },
      });
      captureApiAnalyticsSafely(
        analyticsForContext(c).capture({
          orgId,
          eventName: ANALYTICS_EVENTS.billingSelectionSaved,
          payload: {
            actorId: user.id,
            planTier: selection.planTier,
            billingCycle: selection.billingCycle,
          },
        }),
        { c, eventName: ANALYTICS_EVENTS.billingSelectionSaved },
      );
    }
    const org = await completeOnboarding(db, {
      orgId,
      orgName,
      fiscalYearStartMonth,
      timezone,
      ...(onboardingGoal !== undefined ? { onboardingGoal } : {}),
    });
    return c.json(org);
  })
  .post("/complete", requireRole("admin"), async (c) => {
    const db = c.get("db");
    const orgId = c.get("orgId")!;
    const { org, wasAlreadyComplete } = await markOnboardingCompleted(db, orgId);
    if (!wasAlreadyComplete) {
      captureApiAnalyticsSafely(
        analyticsForContext(c).capture({
          orgId,
          eventName: ANALYTICS_EVENTS.onboardingCompleted,
          payload: { actorId: c.get("user")!.id },
        }),
        { c, eventName: ANALYTICS_EVENTS.onboardingCompleted },
      );
      const lifecyclePromise = recordOnboardingLifecycle(c, org.onboardingGoal).catch((error) => {
        captureSequencerLifecycleFailure(c, error);
      });
      const executionCtx = getExecutionContext(c);
      if (executionCtx) {
        executionCtx.waitUntil(lifecyclePromise);
      } else {
        void lifecyclePromise;
      }
    }
    return c.json(org);
  });
