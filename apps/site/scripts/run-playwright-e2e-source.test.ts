import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("run-playwright-e2e source", () => {
  const source = readFileSync(resolve(import.meta.dirname, "./run-playwright-e2e.mjs"), "utf8");

  it("checks the preview port before starting Astro preview", () => {
    expect(source).toContain("async function assertPreviewPortAvailable()");
    expect(source).toContain("server.listen(PORT, HOST)");
    expect(source).toContain("refusing to run E2E tests against a stale server");
    expect(source.indexOf("await assertPreviewPortAvailable()")).toBeLessThan(
      source.indexOf("const preview = spawn("),
    );
  });

  it("fails startup when the spawned preview exits before readiness", () => {
    expect(source).toContain("async function waitForPreview(preview)");
    expect(source).toContain('preview.once("exit"');
    expect(source).toContain("Preview server stopped before it was ready");
  });

  it("cleans up the exact preview process when interrupted", () => {
    expect(source).toContain('process.once("SIGINT"');
    expect(source).toContain('process.once("SIGTERM"');
    expect(source).toContain("stopPreview(preview)");
    expect(source).toContain('spawnSync("taskkill", ["/PID", String(preview.pid), "/T", "/F"]');
  });
});
