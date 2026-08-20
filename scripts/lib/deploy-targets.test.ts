import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DEPLOY_COMMANDS, getDeployCommands, getDeployTargets } from "./deploy-targets";

const rootPackageJson = JSON.parse(readFileSync("package.json", "utf-8")) as {
  scripts: Record<string, string>;
};
const apiPackageJson = JSON.parse(readFileSync("apps/api/package.json", "utf-8")) as {
  scripts: Record<string, string>;
};
const webPackageJson = JSON.parse(readFileSync("apps/web/package.json", "utf-8")) as {
  scripts: Record<string, string>;
};

describe("getDeployTargets", () => {
  it("returns empty array when only docs change", () => {
    expect(
      getDeployTargets([
        "docs/go-live-manual.md",
        "README.md",
        "docs/superpowers/plans/example.md",
      ]),
    ).toEqual([]);
  });

  it("deploys api for direct api changes", () => {
    expect(getDeployTargets(["apps/api/src/app.ts"])).toEqual(["api"]);
  });

  it("deploys site when the lead magnet R2 sync script changes", () => {
    expect(getDeployTargets(["apps/api/src/scripts/sync-lead-magnets-to-r2.ts"])).toEqual([
      "api",
      "site",
    ]);
  });

  it("deploys web for direct web changes", () => {
    expect(getDeployTargets(["apps/web/src/main.tsx"])).toEqual(["web"]);
  });

  it("deploys site for direct site changes", () => {
    expect(getDeployTargets(["apps/site/src/pages/index.astro"])).toEqual(["site"]);
  });

  it("deploys api, web, and site for shared package changes", () => {
    expect(getDeployTargets(["packages/shared/src/index.ts"])).toEqual(["api", "web", "site"]);
  });

  it("deploys api for db package changes", () => {
    expect(getDeployTargets(["packages/db/src/index.ts"])).toEqual(["api"]);
  });

  it("deploys web and site for ui package changes", () => {
    expect(getDeployTargets(["packages/ui/src/index.ts"])).toEqual(["web", "site"]);
  });

  it("deploys all apps for root deploy config changes", () => {
    expect(
      getDeployTargets([
        "package.json",
        "pnpm-lock.yaml",
        "tsconfig.base.json",
        "eslint.config.js",
        "scripts/deploy-changed.ts",
      ]),
    ).toEqual(["api", "web", "site"]);
  });

  it.each([
    ["scripts/deploy-api.ts", ["api"]],
    ["scripts/deploy-web.ts", ["web"]],
    ["scripts/deploy-site.ts", ["site"]],
    ["scripts/check-sentry-release-env.ts", ["web", "site"]],
    ["scripts/lib/local-env.ts", ["api", "web", "site"]],
    ["scripts/lib/wrangler-custom-domains.ts", ["site"]],
    ["scripts/patch-site-canonical-host-redirect.ts", ["site"]],
    ["scripts/patch-wrangler-site-custom-domains.ts", ["site"]],
    ["scripts/strip-missing-sourcemap-comments.ts", ["site"]],
  ] as const)("deploys %s changes to affected production apps", (file, targets) => {
    expect(getDeployTargets([file])).toEqual(targets);
  });

  it("deduplicates targets and preserves deploy order", () => {
    expect(
      getDeployTargets([
        "packages/shared/src/index.ts",
        "apps/site/src/pages/index.astro",
        "apps/api/src/app.ts",
      ]),
    ).toEqual(["api", "web", "site"]);
  });
});

describe("getDeployCommands", () => {
  it("maps targets to the expected root deploy commands", () => {
    expect(getDeployCommands(["api", "site"])).toEqual([DEPLOY_COMMANDS.api, DEPLOY_COMMANDS.site]);
  });

  it("uses the guarded site deploy script that syncs and verifies lead magnet PDFs", () => {
    expect(DEPLOY_COMMANDS.site).toBe("pnpm run deploy:site");
  });

  it("uses a cross-platform site deploy runner", () => {
    expect(rootPackageJson.scripts["deploy:site"]).toBe("tsx scripts/deploy-site.ts");
  });

  it("uses a cross-platform web deploy runner that loads local env", () => {
    expect(rootPackageJson.scripts["deploy:web"]).toBe("tsx scripts/deploy-web.ts");
  });

  it("deploys the web app through a Worker config instead of Pages", () => {
    expect(webPackageJson.scripts.deploy).toBe("wrangler deploy --config wrangler.jsonc");
    expect(webPackageJson.scripts.deploy).not.toContain("pages deploy");
  });

  it("runs database migrations before deploying the API worker", () => {
    expect(rootPackageJson.scripts["deploy:api"]).toBe("tsx scripts/deploy-api.ts");
    expect(apiPackageJson.scripts.deploy).toBe("tsx ../../scripts/deploy-api.ts");
  });
});
