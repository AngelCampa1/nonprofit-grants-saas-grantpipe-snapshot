import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("web coverage command", () => {
  it("lets the custom verifier enforce per-file thresholds and baselines", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    const vitestConfig = readFileSync("vitest.config.ts", "utf8");

    expect(packageJson.scripts["test:coverage"]).toBe(
      "vitest run --coverage --maxWorkers=1 --pool=forks --no-file-parallelism && node scripts/verify-coverage-thresholds.mjs",
    );
    expect(vitestConfig).toContain('"json-summary"');
    expect(vitestConfig).not.toContain("thresholds:");
  });
});
