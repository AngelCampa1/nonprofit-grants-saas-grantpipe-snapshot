import { Hono } from "hono";
import type { AppEnv } from "../../types";

const QUICKBOOKS_UNAVAILABLE_RESPONSE = {
  error: "quickbooks_integration_unavailable",
  message: "QuickBooks Online integration is not currently available.",
} as const;

const ACCOUNTING_INTEGRATIONS_UNAVAILABLE_RESPONSE = {
  error: "accounting_integrations_unavailable",
  message:
    "GrantPipe includes native accounting, but external accounting integrations are not currently available.",
} as const;

export const accountingIntegrationRoutes = new Hono<AppEnv>()
  .get("/quickbooks/connect-url", (c) => c.json(QUICKBOOKS_UNAVAILABLE_RESPONSE, 410))
  .get("/quickbooks/callback", (c) => c.json(QUICKBOOKS_UNAVAILABLE_RESPONSE, 410))
  .all("*", (c) => c.json(ACCOUNTING_INTEGRATIONS_UNAVAILABLE_RESPONSE, 410));
