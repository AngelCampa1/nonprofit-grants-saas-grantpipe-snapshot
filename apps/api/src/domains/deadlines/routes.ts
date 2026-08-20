import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { radarQuerySchema, type RadarObligation } from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { requireEntityRole } from "../../middleware/require-role";
import { bandObligations, collectObligations } from "./service";

export const deadlineRoutes = new Hono<AppEnv>().get(
  "/",
  requireEntityRole("viewer"),
  zValidator("query", radarQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    const now = new Date();

    const obligations = await collectObligations(c.get("db"), {
      orgId: c.get("orgId")!,
      entityId: c.get("entityId")!,
      now,
      horizonDays: query.horizonDays,
      kinds: query.kinds,
      includeResolved: query.includeResolved,
    });

    const filtered: RadarObligation[] = query.status
      ? obligations.filter((obligation) => obligation.status === query.status)
      : obligations;

    return c.json(bandObligations(filtered, now));
  },
);
