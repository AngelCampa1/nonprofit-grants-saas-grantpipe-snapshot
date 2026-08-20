import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  ANALYTICS_EVENTS,
  documentExtractionCommitSchema,
  documentExtractionReviewActionSchema,
  documentExtractionStartSchema,
} from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { captureApiAnalyticsSafely } from "../../lib/analytics";
import { getIntegrations } from "../../lib/integrations";
import { captureBackgroundException } from "../../lib/sentry";
import { requireEntityPermission } from "../../middleware/require-role";
import { getContextEffectivePlanTier } from "../../lib/effective-plan-tier";
import { documentEntityTypesForRole } from "../documents/access";
import { AppError } from "../../lib/app-error";
import {
  cancelDocumentExtraction,
  commitDocumentExtraction,
  createDocumentExtraction,
  getDocumentExtraction,
  recordDocumentExtractionAction,
} from "./service";

function analyticsForContext(c: Context<AppEnv>) {
  return getIntegrations(c.get("db"), c.env ?? ({} as AppEnv["Bindings"])).analytics;
}

function captureAwardIntakeEvent(
  c: Context<AppEnv>,
  eventName: string,
  payload: Record<string, unknown>,
): void {
  const orgId = c.get("orgId");
  const user = c.get("user");
  if (!orgId || !user) return;

  captureApiAnalyticsSafely(
    analyticsForContext(c).capture({
      orgId,
      eventName,
      payload: { actorId: user.id, ...payload },
    }),
    { c, eventName },
  );
}

function handleDomainError(error: unknown) {
  if (error instanceof AppError) {
    // Mirror the global error handler so structured errors (e.g. the
    // ai_usage_cap_reached upgrade contract) keep their errorCode + details
    // for the client, instead of being flattened to a bare { error } body.
    const body: Record<string, unknown> = { error: error.message };
    if (error.errorCode) body.errorCode = error.errorCode;
    if (error.details) Object.assign(body, error.details);
    return { body, status: error.status };
  }
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status: unknown }).status);
    const body =
      "body" in error && typeof (error as { body: unknown }).body === "object"
        ? (error as { body: object }).body
        : { error: error instanceof Error ? error.message : "request_failed" };
    return { body, status };
  }
  throw error;
}

function failureTypeFromBody(body: unknown): string {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof (body as { error: unknown }).error === "string" &&
    /^[a-z0-9_:-]+$/i.test((body as { error: string }).error)
  ) {
    return (body as { error: string }).error;
  }
  return "request_failed";
}

function captureHandledDomainFailure(
  operation: string,
  handled: { body: unknown; status: number },
) {
  if (!Number.isFinite(handled.status) || handled.status < 500) return;

  captureBackgroundException(new Error("Handled award intake domain failure"), "award_intake", {
    operation,
    status: String(handled.status),
    failure_type: failureTypeFromBody(handled.body),
  });
}

export const documentExtractionRoutes = new Hono<AppEnv>()
  .post(
    "/",
    requireEntityPermission("documents", "edit"),
    zValidator("json", documentExtractionStartSchema),
    async (c) => {
      try {
        const input = c.req.valid("json");
        const planTier = getContextEffectivePlanTier(c);
        const result = await createDocumentExtraction(c.get("db"), c.env, {
          orgId: c.get("orgId")!,
          userId: c.get("user")!.id,
          planTier,
          documentId: input.documentId,
          attemptId: input.attemptId,
        });
        if (result.created) {
          captureAwardIntakeEvent(c, ANALYTICS_EVENTS.awardIntakeStarted, {
            entity_type: "award_intake",
            plan: planTier,
          });
        }
        return c.json(result.extraction, 201);
      } catch (error) {
        const handled = handleDomainError(error);
        captureHandledDomainFailure("start", handled);
        captureAwardIntakeEvent(c, ANALYTICS_EVENTS.awardIntakeFailed, {
          entity_type: "award_intake",
          operation: "start",
          failure_type: failureTypeFromBody(handled.body),
        });
        return c.json(handled.body, handled.status as never);
      }
    },
  )
  .get("/:extractionId", requireEntityPermission("documents", "view"), async (c) => {
    try {
      return c.json(
        await getDocumentExtraction(c.get("db"), {
          orgId: c.get("orgId")!,
          extractionId: c.req.param("extractionId"),
          allowedDocumentEntityTypes: documentEntityTypesForRole(c.get("memberRole")),
        }),
      );
    } catch (error) {
      const handled = handleDomainError(error);
      captureHandledDomainFailure("read", handled);
      return c.json(handled.body, handled.status as never);
    }
  })
  .post(
    "/:extractionId/actions",
    requireEntityPermission("documents", "edit"),
    zValidator("json", documentExtractionReviewActionSchema),
    async (c) => {
      try {
        const input = c.req.valid("json");
        const result = await recordDocumentExtractionAction(c.get("db"), {
          orgId: c.get("orgId")!,
          userId: c.get("user")!.id,
          extractionId: c.req.param("extractionId"),
          input,
        });
        captureAwardIntakeEvent(c, ANALYTICS_EVENTS.awardIntakeFieldActioned, {
          entity_type: "award_intake_field",
          operation: input.action,
          ...(input.mappedEntityType ? { mapped_entity_type: input.mappedEntityType } : {}),
        });
        return c.json(result, 201);
      } catch (error) {
        const handled = handleDomainError(error);
        captureHandledDomainFailure("action", handled);
        return c.json(handled.body, handled.status as never);
      }
    },
  )
  .post("/:extractionId/cancel", requireEntityPermission("documents", "edit"), async (c) => {
    try {
      return c.json(
        await cancelDocumentExtraction(c.get("db"), {
          orgId: c.get("orgId")!,
          userId: c.get("user")!.id,
          extractionId: c.req.param("extractionId"),
        }),
      );
    } catch (error) {
      const handled = handleDomainError(error);
      captureHandledDomainFailure("cancel", handled);
      return c.json(handled.body, handled.status as never);
    }
  })
  .post(
    "/:extractionId/commit",
    requireEntityPermission("grants", "edit"),
    zValidator("json", documentExtractionCommitSchema),
    async (c) => {
      try {
        const input = c.req.valid("json");
        const result = await commitDocumentExtraction(c.get("db"), {
          orgId: c.get("orgId")!,
          entityId: c.get("entityId") ?? undefined,
          userId: c.get("user")!.id,
          extractionId: c.req.param("extractionId"),
          planTier: getContextEffectivePlanTier(c),
          input,
        });
        captureAwardIntakeEvent(c, ANALYTICS_EVENTS.awardIntakeCommitted, {
          entity_type: "award_intake",
          funder_decision: input.funderDecision.action,
          grant_decision: input.grantDecision.action,
          amount_present: input.requiredGrantBasics.amountCents !== undefined,
          date_range_present:
            input.requiredGrantBasics.startDate !== undefined &&
            input.requiredGrantBasics.endDate !== undefined,
        });
        return c.json(result, 201);
      } catch (error) {
        const handled = handleDomainError(error);
        captureHandledDomainFailure("commit", handled);
        captureAwardIntakeEvent(c, ANALYTICS_EVENTS.awardIntakeFailed, {
          entity_type: "award_intake",
          operation: "commit",
          failure_type: failureTypeFromBody(handled.body),
        });
        return c.json(handled.body, handled.status as never);
      }
    },
  );
