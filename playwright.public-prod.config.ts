import { defineConfig, devices } from "@playwright/test";
import { basename, dirname } from "node:path";

import { publicProductionE2ESpecs } from "./scripts/lib/e2e-suite-inventory";
import { loadRootDotEnv } from "./scripts/lib/local-env";
import { requireProductionUrl } from "./scripts/lib/prod-e2e-targets";

loadRootDotEnv();
const worktreesDir = dirname(process.cwd());
if (basename(worktreesDir) === ".worktrees") {
  loadRootDotEnv({ rootDir: dirname(worktreesDir) });
}

const appUrl = requireProductionUrl(
  process.env.GRANTPIPE_E2E_APP_URL ?? "https://app.grantpipe.com",
  "app.grantpipe.com",
  "GRANTPIPE_E2E_APP_URL",
);
const siteUrl = requireProductionUrl(
  process.env.GRANTPIPE_E2E_SITE_URL ?? "https://grantpipe.com",
  "grantpipe.com",
  "GRANTPIPE_E2E_SITE_URL",
);

export default defineConfig({
  testDir: "./e2e",
  testMatch: publicProductionE2ESpecs,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: siteUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  metadata: {
    appUrl,
    siteUrl,
  },
  projects: [
    {
      name: "public-prod-chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
