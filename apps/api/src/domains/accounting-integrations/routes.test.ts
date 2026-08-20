import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../../types";
import { accountingIntegrationRoutes } from "./routes";

const app = new Hono<AppEnv>().route("/accounting/integrations", accountingIntegrationRoutes);

describe("deactivated accounting integration routes", () => {
  it.each(["connect-url", "callback"])(
    "keeps the QuickBooks %s tombstone unavailable",
    async (path) => {
      const response = await app.request(
        `/accounting/integrations/quickbooks/${path}?code=unused&realmId=unused&state=unused`,
      );

      expect(response.status).toBe(410);
      await expect(response.json()).resolves.toEqual({
        error: "quickbooks_integration_unavailable",
        message: "QuickBooks Online integration is not currently available.",
      });
    },
  );

  it.each([
    ["GET", "/accounting/integrations"],
    ["POST", "/accounting/integrations/example/sync"],
    ["PATCH", "/accounting/integrations/example/settings"],
    ["DELETE", "/accounting/integrations/example"],
  ])("returns the external-integration tombstone for %s %s", async (method, path) => {
    const response = await app.request(path, { method });

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      error: "accounting_integrations_unavailable",
      message:
        "GrantPipe includes native accounting, but external accounting integrations are not currently available.",
    });
  });
});
