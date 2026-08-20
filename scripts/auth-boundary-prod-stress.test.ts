import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const source = () =>
  readFileSync(join(repoRoot, "e2e-adhoc/auth-boundary-prod-stress.mjs"), "utf8");

describe("auth boundary production stress script", () => {
  it("uses the reusable E2E credentials without creating new accounts", () => {
    expect(source()).toContain("GRANTPIPE_E2E_EMAIL");
    expect(source()).toContain("GRANTPIPE_E2E_PASSWORD");
    expect(source()).not.toContain("sign-up/email");
    expect(source()).not.toContain("createDisposableAccount");
  });

  it("runs only through the production cleanup wrapper", () => {
    expect(source()).toContain("assertProductionWrapper");
    expect(source()).toContain("assertProductionE2ECanMutate");
    expect(source()).toContain("pnpm e2e:live -- node e2e-adhoc/auth-boundary-prod-stress.mjs");
  });

  it("covers anonymous, bogus-cookie, public, authenticated, and validation boundaries", () => {
    expect(source()).toContain("anonymous-protected-endpoints");
    expect(source()).toContain("bogus-cookie-protected-endpoints");
    expect(source()).toContain("public-invalid-invite-token");
    expect(source()).toContain("authenticated-admin-read-boundaries");
    expect(source()).toContain("authenticated-validation-boundaries");
    expect(source()).toContain("/api/auth/invites/not-a-real-token");
    expect(source()).toContain("/api/org/team");
    expect(source()).toContain("/api/org/profile");
    expect(source()).toContain("/api/org/custom-fields?entityType=nope");
  });

  it("writes a standard redacted live E2E report", () => {
    expect(source()).toContain('"test-results", "live-e2e", "auth-boundary"');
    expect(source()).toContain("auth-boundary-prod-stress-${Date.now()}.json");
    expect(source()).toContain("redactForReport");
    expect(source()).toContain("scenarioCount: AUTH_BOUNDARY_SCENARIOS.length");
    expect(source()).toContain("complete: isCompleteRun(results)");
  });
});
