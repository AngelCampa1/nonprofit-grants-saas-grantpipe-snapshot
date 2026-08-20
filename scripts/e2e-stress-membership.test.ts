import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { liveE2EHelperScripts, productionStressScripts } from "./lib/e2e-suite-inventory";

const root = process.cwd();

describe("production stress inventory", () => {
  it("classifies every e2e-adhoc module", () => {
    const diskFiles = readdirSync(join(root, "e2e-adhoc"))
      .filter((file) => file.endsWith(".mjs"))
      .sort();
    const inventoriedFiles = [
      ...productionStressScripts.map(({ file }) => file),
      ...liveE2EHelperScripts,
    ].sort();

    expect(inventoriedFiles).toEqual(diskFiles);
  });

  it("requires every production stress script to use the live mutation guard", () => {
    for (const entry of productionStressScripts) {
      expect(entry).toMatchObject({
        mutatesProduction: true,
        requiresLiveWrapper: true,
        owner: "grantpipe",
      });
      const source = readFileSync(join(root, "e2e-adhoc", entry.file), "utf8");
      expect(source).toContain('from "./live-e2e-guard.mjs"');
      if (entry.file === "ai-cs-prod-e2e.mjs") {
        expect(source).toMatch(/try\s*\{\s*assertProductionE2ECanMutate\s*\(/);
      } else {
        expect(source).toContain("assertProductionWrapper();");
      }
      expect(source).not.toMatch(/`\$\{APP_URL\}\/(?:login|signup)/);
      if (source.includes('appRouteUrl(APP_URL, "/')) {
        expect(source).toContain('from "./app-route.mjs"');
      }
    }
  });
});
