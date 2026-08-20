import { defineConfig, devices } from "@playwright/test";
import { basename, dirname } from "node:path";
import {
  getLocalApiOrigin,
  getLocalApiPort,
  getLocalSiteOrigin,
  getLocalSitePort,
  getLocalWebOrigin,
  getLocalWebPort,
} from "./scripts/lib/local-dev-config";
import { localE2ESpecs } from "./scripts/lib/e2e-suite-inventory";
import { loadRootDotEnv } from "./scripts/lib/local-env";

loadRootDotEnv();
const worktreesDir = dirname(process.cwd());
if (basename(worktreesDir) === ".worktrees") {
  loadRootDotEnv({ rootDir: dirname(worktreesDir) });
}

const apiPort = getLocalApiPort();
const webPort = getLocalWebPort();
const sitePort = getLocalSitePort();
const apiHost = "localhost";
const webHost = "localhost";
const siteHost = "localhost";
const siteDevCommand =
  process.platform === "win32"
    ? `cmd /c "set PUBLIC_APP_URL=http://${webHost}:${webPort}&& pnpm --dir apps/site exec astro dev --host ${siteHost} --port ${sitePort}"`
    : `PUBLIC_APP_URL=http://${webHost}:${webPort} pnpm --dir apps/site exec astro dev --host ${siteHost} --port ${sitePort}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: localE2ESpecs,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: getLocalWebOrigin(),
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
  webServer: [
    {
      command: `pnpm --dir apps/api exec wrangler dev --ip ${apiHost} --port ${apiPort}`,
      cwd: ".",
      url: `${getLocalApiOrigin()}/api/health`,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120_000,
    },
    {
      command: `pnpm --dir apps/web exec vite --host ${webHost} --port ${webPort} --strictPort`,
      cwd: ".",
      url: getLocalWebOrigin(),
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120_000,
    },
    {
      command: siteDevCommand,
      cwd: ".",
      url: getLocalSiteOrigin(),
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120_000,
    },
  ],
});
