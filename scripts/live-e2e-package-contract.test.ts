import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("live E2E package scripts", () => {
  it("exposes a cleanup-wrapped live E2E command", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["e2e:live"]).toContain("scripts/run-live-e2e.ts");
    expect(packageJson.scripts?.["e2e:live:cleanup"]).toContain("scripts/prod-e2e-cleanup.ts");
  });
});
