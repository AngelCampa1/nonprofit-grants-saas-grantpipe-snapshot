import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const runbook = readFileSync(
  resolve(process.cwd(), "docs/operations/neon-to-supabase-runbook.md"),
  "utf8",
);

describe("Neon to Supabase runbook", () => {
  it("sets the Supabase cleanup target before post-cutover production E2E", () => {
    const sectionStart = runbook.indexOf("## Post-Cutover Production Testing");
    const providerEnv = runbook.indexOf(
      '$env:EXPECTED_PROD_DB_PROVIDER = "supabase"',
      sectionStart,
    );
    const databaseEnv = runbook.indexOf("$env:GRANTPIPE_PROD_DATABASE_URL", sectionStart);
    const firstProdE2e = runbook.indexOf("pnpm run e2e:prod", sectionStart);

    expect(sectionStart).toBeGreaterThanOrEqual(0);
    expect(providerEnv).toBeGreaterThan(sectionStart);
    expect(databaseEnv).toBeGreaterThan(sectionStart);
    expect(firstProdE2e).toBeGreaterThan(sectionStart);
    expect(providerEnv).toBeLessThan(firstProdE2e);
    expect(databaseEnv).toBeLessThan(firstProdE2e);
  });

  it("requires local database health proof before local browser E2E", () => {
    const sectionStart = runbook.indexOf("## Local App Verification");
    const stopServers = runbook.indexOf("pnpm dev:server stop all", sectionStart);
    const containerProof = runbook.indexOf('docker ps --filter "name=supabase_db_"', stopServers);
    const startServers = runbook.indexOf("pnpm dev:server start all", sectionStart);
    const healthProbe = runbook.indexOf("http://localhost:8787/api/health/db", sectionStart);
    const targetText = runbook.indexOf(
      "The health response must match the Supabase target you intentionally configured.",
      sectionStart,
    );
    const localSupabaseText = runbook.indexOf(
      "For the local Supabase CLI/Docker stack, `127.0.0.1` is acceptable",
      sectionStart,
    );
    const firstLocalE2e = runbook.indexOf("pnpm e2e -- e2e/auth-onboarding.spec.ts", sectionStart);

    expect(sectionStart).toBeGreaterThanOrEqual(0);
    expect(stopServers).toBeGreaterThan(sectionStart);
    expect(containerProof).toBeGreaterThan(stopServers);
    expect(startServers).toBeGreaterThan(containerProof);
    expect(healthProbe).toBeGreaterThan(sectionStart);
    expect(targetText).toBeGreaterThan(sectionStart);
    expect(localSupabaseText).toBeGreaterThan(sectionStart);
    expect(firstLocalE2e).toBeGreaterThan(sectionStart);
    expect(startServers).toBeLessThan(healthProbe);
    expect(healthProbe).toBeLessThan(firstLocalE2e);
    expect(targetText).toBeLessThan(firstLocalE2e);
    expect(localSupabaseText).toBeLessThan(firstLocalE2e);
  });

  it("states the production cleanup blocker before mutating production E2E commands", () => {
    const baselineStart = runbook.indexOf("## Production Baseline Before Cutover");
    const baselineBlocker = runbook.indexOf("Current blocker, 2026-07-04", baselineStart);
    const firstBaselineMutation = runbook.indexOf("pnpm run e2e:prod", baselineStart);
    const postCutoverStart = runbook.indexOf("## Post-Cutover Production Testing");
    const postCutoverGate = runbook.indexOf(
      "Stop if dry-run reports any removable",
      postCutoverStart,
    );
    const firstPostCutoverMutation = runbook.indexOf("pnpm run e2e:prod", postCutoverStart);

    expect(baselineStart).toBeGreaterThanOrEqual(0);
    expect(baselineBlocker).toBeGreaterThan(baselineStart);
    expect(firstBaselineMutation).toBeGreaterThan(baselineStart);
    expect(baselineBlocker).toBeLessThan(firstBaselineMutation);
    expect(postCutoverStart).toBeGreaterThanOrEqual(0);
    expect(postCutoverGate).toBeGreaterThan(postCutoverStart);
    expect(firstPostCutoverMutation).toBeGreaterThan(postCutoverStart);
    expect(postCutoverGate).toBeLessThan(firstPostCutoverMutation);
  });
});
