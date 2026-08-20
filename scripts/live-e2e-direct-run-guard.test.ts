import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..");

describe("production live E2E direct-run guard", () => {
  it("requires production ad hoc E2E scripts to run through the cleanup wrapper", () => {
    const source = readFileSync(join(repoRoot, "e2e-adhoc", "ai-cs-prod-e2e.mjs"), "utf8");
    const guardSource = readFileSync(join(repoRoot, "e2e-adhoc", "live-e2e-guard.mjs"), "utf8");

    expect(source).toContain("assertProductionE2ECanMutate");
    expect(guardSource).toContain("GRANTPIPE_LIVE_E2E_WRAPPER");
    expect(guardSource).toContain("GRANTPIPE_LIVE_E2E_RUN_TOKEN_FILE");
    expect(source).toContain("pnpm e2e:live --");
  });
});
