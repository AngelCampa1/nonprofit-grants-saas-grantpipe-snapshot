import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("production stress runner", () => {
  it("executes the authoritative production stress inventory through the live wrapper", () => {
    const source = readFileSync(join(root, "scripts/run-production-stress-suite.ts"), "utf8");

    expect(source).toContain("productionStressScripts");
    expect(source).toContain('"e2e:live"');
    expect(source).toContain('join("e2e-adhoc", entry.file)');
  });

  it("is the only full-suite command documented by the package and migration runbook", () => {
    const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const runbook = readFileSync(join(root, "docs/operations/neon-to-supabase-runbook.md"), "utf8");

    expect(packageJson.scripts?.["e2e:prod:stress"]).toBe(
      "tsx scripts/run-production-stress-suite.ts",
    );
    expect(runbook.match(/pnpm e2e:prod:stress/g)).toHaveLength(2);
    expect(runbook).not.toContain("Get-ChildItem e2e-adhoc -Filter *-prod-stress.mjs");
  });
});
