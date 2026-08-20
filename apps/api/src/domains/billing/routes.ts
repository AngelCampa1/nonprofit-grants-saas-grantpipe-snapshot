import { Hono } from "hono";
import type { AppEnv } from "../../types";
import { requireRole } from "../../middleware/require-role";

export const billingRoutes = new Hono<AppEnv>().post(
  "/checkout/trial",
  requireRole("admin"),
  async (c) => {
    return c.json(
      {
        error: "trial_checkout_removed",
        message:
          "Free trials no longer require card collection. Finish onboarding, then add billing later from Settings when you're ready.",
      },
      410,
    );
  },
);
