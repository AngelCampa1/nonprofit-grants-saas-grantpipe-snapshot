import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("public production E2E contract", () => {
  it("exposes a cleanup-wrapped public production Playwright command", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(pkg.scripts?.["e2e:prod:public"]).toBe(
      "tsx scripts/run-live-e2e.ts -- pnpm exec playwright test --config=playwright.public-prod.config.ts",
    );
  });

  it("exposes a cleanup-wrapped authenticated production Playwright command", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(pkg.scripts?.["e2e:prod:authenticated"]).toBe(
      "tsx scripts/run-live-e2e.ts -- pnpm exec playwright test --config=playwright.authenticated-prod.config.ts",
    );
  });

  it("keeps public production checks in a dedicated config and spec", () => {
    expect(existsSync(join(root, "playwright.public-prod.config.ts"))).toBe(true);
    expect(existsSync(join(root, "playwright.authenticated-prod.config.ts"))).toBe(true);
    expect(existsSync(join(root, "e2e", "public-prod-site.spec.ts"))).toBe(true);
  });

  it("keeps authenticated production config limited to its maintained specs", () => {
    const config = readFileSync(join(root, "playwright.authenticated-prod.config.ts"), "utf8");

    expect(config).toContain('globalSetup: "./scripts/live-e2e-playwright-global-setup.ts"');
    expect(config).toContain("testMatch: authenticatedProductionE2ESpecs");
    expect(config).toContain('testDir: "./e2e"');
    expect(config).toContain("authenticated-prod-chromium");
  });

  it("keeps production failures diagnosable without retries", () => {
    for (const fileName of [
      "playwright.prod.config.ts",
      "playwright.authenticated-prod.config.ts",
      "playwright.public-prod.config.ts",
    ]) {
      const config = readFileSync(join(root, fileName), "utf8");

      expect(config).toContain('trace: "retain-on-failure"');
      expect(config).toContain('screenshot: "only-on-failure"');
    }
  });

  it("requires global setup guards for mutating production configs", () => {
    for (const fileName of [
      "playwright.prod.config.ts",
      "playwright.authenticated-prod.config.ts",
    ]) {
      const config = readFileSync(join(root, fileName), "utf8");

      expect(config).toContain('globalSetup: "./scripts/live-e2e-playwright-global-setup.ts"');
    }

    const publicConfig = readFileSync(join(root, "playwright.public-prod.config.ts"), "utf8");
    expect(publicConfig).not.toContain("live-e2e-playwright-global-setup");
  });

  it("guards against public production false positives", () => {
    const spec = readFileSync(join(root, "e2e", "public-prod-site.spec.ts"), "utf8");

    expect(spec).toContain("maxRedirects: 0");
    expect(spec).toContain("expect(leadMagnet.status()).toBe(200)");
    expect(spec).toContain('expect(leadMagnet.url()).not.toContain("/login")');
    expect(spec).toContain("content-disposition");
    expect(spec).toContain("toHaveText");
  });
});
