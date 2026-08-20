import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import {
  authenticatedProductionE2ESpecs,
  helperE2ESpecs,
  localE2ESpecs,
  playwrightSpecInventory,
  productionFunnelE2ESpecs,
  publicProductionE2ESpecs,
} from "./lib/e2e-suite-inventory";

const root = process.cwd();

function findSpecs(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return findSpecs(path);
    if (!entry.name.endsWith(".spec.ts")) return [];
    return [relative(join(root, "e2e"), path).replaceAll("\\", "/")];
  });
}

describe("Playwright suite membership", () => {
  it("keeps local Playwright incapable of selecting production-only or helper specs", () => {
    expect(localE2ESpecs).not.toContain("production-funnel.spec.ts");
    expect(localE2ESpecs).not.toContain("public-prod-site.spec.ts");
    expect(localE2ESpecs).not.toContain("helpers/visual-qa.spec.ts");

    const config = readFileSync(join(root, "playwright.config.ts"), "utf8");
    expect(config).toContain("testMatch: localE2ESpecs");

    for (const spec of playwrightSpecInventory) {
      if (spec.productionOnly || spec.helper) {
        expect(spec.local).toBe(false);
      }
      if (spec.helper) {
        expect(spec.authenticatedProduction || spec.funnelProduction || spec.publicProduction).toBe(
          false,
        );
      }
    }
  });

  it("maintains an explicit inventory for every Playwright spec", () => {
    const inventoriedSpecs = new Set([
      ...localE2ESpecs,
      ...authenticatedProductionE2ESpecs,
      ...productionFunnelE2ESpecs,
      ...publicProductionE2ESpecs,
      ...helperE2ESpecs,
    ]);

    expect([...inventoriedSpecs].sort()).toEqual(findSpecs(join(root, "e2e")).sort());

    expect(readFileSync(join(root, "playwright.prod.config.ts"), "utf8")).toContain(
      "testMatch: productionFunnelE2ESpecs",
    );
    expect(readFileSync(join(root, "playwright.public-prod.config.ts"), "utf8")).toContain(
      "testMatch: publicProductionE2ESpecs",
    );
  });

  it("names the maintained authenticated production suite for its actual scope", () => {
    const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["e2e:prod:authenticated"]).toBe(
      "tsx scripts/run-live-e2e.ts -- pnpm exec playwright test --config=playwright.authenticated-prod.config.ts",
    );
    expect(packageJson.scripts?.["e2e:prod:full"]).toBeUndefined();

    const config = readFileSync(join(root, "playwright.authenticated-prod.config.ts"), "utf8");
    expect(config).toContain("testMatch: authenticatedProductionE2ESpecs");
    expect([...authenticatedProductionE2ESpecs].sort()).toEqual(
      [
        "auth-onboarding.spec.ts",
        "import-and-grant-flow.spec.ts",
        "surface-sweep.spec.ts",
        "advanced-flows.spec.ts",
        "deep-flows.spec.ts",
      ].sort(),
    );
  });
});
