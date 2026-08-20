import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright smoke-test config for the GrantPipe marketing site.
 *
 * These tests are intentionally not wired into the CI pre-commit hook.
 * The package `test:e2e` script builds and serves the current production
 * preview so local runs cannot accidentally pass against a stale dev server.
 */
export default defineConfig({
  testDir: "./playwright",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4321",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 12"] },
    },
  ],
});
