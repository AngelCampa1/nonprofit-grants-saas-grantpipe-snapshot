import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { guideParamsSchema, updateGuideProgressSchema } from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { requireRole } from "../../middleware/require-role";
import { listGuideProgress, upsertGuideProgress } from "./service";

export const helpRoutes = new Hono<AppEnv>()
  .get("/progress", requireRole("viewer"), async (c) => {
    const result = await listGuideProgress(c.get("db"), {
      orgId: c.get("orgId")!,
      userId: c.get("user")!.id,
    });
    return c.json(result);
  })
  .patch(
    "/progress/:guideKey",
    requireRole("viewer"),
    zValidator("param", guideParamsSchema),
    zValidator("json", updateGuideProgressSchema),
    async (c) => {
      const result = await upsertGuideProgress(c.get("db"), {
        orgId: c.get("orgId")!,
        userId: c.get("user")!.id,
        guideKey: c.req.valid("param").guideKey,
        data: c.req.valid("json"),
      });

      return c.json(result);
    },
  );
