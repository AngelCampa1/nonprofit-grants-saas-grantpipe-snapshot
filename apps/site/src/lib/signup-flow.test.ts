import { describe, expect, it } from "vitest";

import { buildPublicSignupFlowConfig } from "@grantpipe/ui/site/lib/public-signup-flow";
import { siteConfig } from "../config/site";
import { GET } from "../pages/signup-flow.json";

describe("signup-flow.json", () => {
  it("returns the shared public signup-flow payload", async () => {
    const response = await GET({} as never);

    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
    await expect(response.json()).resolves.toEqual(buildPublicSignupFlowConfig(siteConfig));
  });
});
