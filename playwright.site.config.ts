import { defineConfig, devices } from "@playwright/test";
import {
  getLocalSiteOrigin,
  getLocalSitePort,
  getLocalWebPort,
} from "./scripts/lib/local-dev-config";

const sitePort = getLocalSitePort();
const siteHost = "localhost";
const webPort = getLocalWebPort();
const siteDevCommand =
  process.platform === "win32"
    ? `cmd /c "set PUBLIC_APP_URL=http://localhost:${webPort}&& pnpm --dir apps/site exec astro dev --host ${siteHost} --port ${sitePort}"`
    : `PUBLIC_APP_URL=http://localhost:${webPort} pnpm --dir apps/site exec astro dev --host ${siteHost} --port ${sitePort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: getLocalSiteOrigin(),
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
  webServer: {
    command: siteDevCommand,
    cwd: ".",
    url: getLocalSiteOrigin(),
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120_000,
  },
});
