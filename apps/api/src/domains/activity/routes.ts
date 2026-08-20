import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { activityListSchema, orgActivityListSchema } from "@grantpipe/shared";
import type { ActivityEntityType } from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { requireEntityRole, requireRole } from "../../middleware/require-role";
import { listActivity, listOrgActivity } from "./service";

const AUDITOR_ACTIVITY_ENTITY_TYPES = [
  "grant",
  "fund",
  "allocation",
  "expense",
  "reporting_requirement",
  "closeout_item",
  "generated_report",
  "document",
  "account",
  "fiscal_period",
  "journal_entry",
  "payment_request",
  "payment_request_line",
  "payment_request_adjustment",
  "payment",
] as const satisfies readonly ActivityEntityType[];

function canAuditorReadActivity(entityType: ActivityEntityType) {
  return (AUDITOR_ACTIVITY_ENTITY_TYPES as readonly ActivityEntityType[]).includes(entityType);
}

export const activityRoutes = new Hono<AppEnv>()
  .get("/", requireEntityRole("viewer"), zValidator("query", activityListSchema), async (c) => {
    const query = c.req.valid("query");
    if (c.get("memberRole") === "auditor" && !canAuditorReadActivity(query.entityType)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const result = await listActivity(c.get("db"), {
      orgId: c.get("orgId")!,
      activeEntityId: c.get("entityId")!,
      ...query,
    });
    return c.json(result);
  })
  .get("/org", requireRole("viewer"), zValidator("query", orgActivityListSchema), async (c) => {
    const { entityType, actorId, fromDate, toDate, sortOrder, page, pageSize } =
      c.req.valid("query");
    if (
      c.get("memberRole") === "auditor" &&
      entityType !== undefined &&
      !canAuditorReadActivity(entityType)
    ) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const result = await listOrgActivity(c.get("db"), {
      orgId: c.get("orgId")!,
      activeEntityId: c.get("entityId")!,
      entityType,
      allowedEntityTypes:
        c.get("memberRole") === "auditor" ? AUDITOR_ACTIVITY_ENTITY_TYPES : undefined,
      actorId,
      fromDate: fromDate !== undefined ? new Date(fromDate) : undefined,
      toDate: toDate !== undefined ? new Date(toDate) : undefined,
      sortOrder,
      page,
      pageSize,
    });
    return c.json(result);
  });
