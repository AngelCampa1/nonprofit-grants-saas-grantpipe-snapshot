import { describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createLiveE2ERunProof } from "./lib/live-e2e-proof";

describe("ad-hoc production stress scripts", () => {
  it("require the live cleanup wrapper before production execution", () => {
    const dir = path.resolve(process.cwd(), "e2e-adhoc");
    const offenders = readdirSync(dir)
      .filter((file) => file.endsWith("-prod-stress.mjs"))
      .filter((file) => {
        const source = readFileSync(path.join(dir, file), "utf8");
        return (
          !source.includes("assertProductionE2ECanMutate") || !source.includes("pnpm e2e:live --")
        );
      });

    expect(offenders).toEqual([]);
  });

  it("require the shared production mutation cleanup guard", () => {
    const dir = path.resolve(process.cwd(), "e2e-adhoc");
    const offenders = readdirSync(dir)
      .filter((file) => file.endsWith("-prod-stress.mjs") || file === "ai-cs-prod-e2e.mjs")
      .filter((file) => {
        const source = readFileSync(path.join(dir, file), "utf8");
        return !source.includes("assertProductionE2ECanMutate");
      });

    expect(offenders).toEqual([]);
  });

  it("rejects forged wrapper markers without cleanup proof", async () => {
    const guard = (await import(
      pathToFileURL(path.resolve(process.cwd(), "e2e-adhoc/live-e2e-guard.mjs")).href
    )) as {
      assertProductionE2ECanMutate: (input: {
        appUrl: string;
        env: Record<string, string | undefined>;
      }) => void;
    };

    expect(() =>
      guard.assertProductionE2ECanMutate({
        appUrl: "https://app.grantpipe.com",
        env: {
          GRANTPIPE_LIVE_E2E_WRAPPER: "1",
        },
      }),
    ).toThrow("production E2E requires a cleanup wrapper run token");
  });

  it("allows production ad-hoc scripts with cleanup proof", async () => {
    const guard = (await import(
      pathToFileURL(path.resolve(process.cwd(), "e2e-adhoc/live-e2e-guard.mjs")).href
    )) as {
      assertProductionE2ECanMutate: (input: {
        appUrl: string;
        env: Record<string, string | undefined>;
      }) => void;
    };
    const rootDir = mkdtempSync(path.join(tmpdir(), "grantpipe-live-e2e-"));

    try {
      const proof = createLiveE2ERunProof({ rootDir });

      expect(() =>
        guard.assertProductionE2ECanMutate({
          appUrl: "https://app.grantpipe.com",
          env: {
            GRANTPIPE_LIVE_E2E_WRAPPER: "1",
            GRANTPIPE_LIVE_E2E_RUN_TOKEN: proof.token,
            GRANTPIPE_LIVE_E2E_RUN_TOKEN_FILE: proof.filePath,
          },
        }),
      ).not.toThrow();
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("do not run nested live cleanup that can mask failure artifacts", () => {
    const dir = path.resolve(process.cwd(), "e2e-adhoc");
    const offenders = readdirSync(dir)
      .filter((file) => file.endsWith("-prod-stress.mjs"))
      .filter((file) => {
        const source = readFileSync(path.join(dir, file), "utf8");
        return (
          source.includes("e2e:live:cleanup") ||
          source.includes("cleanupGeneratedData") ||
          source.includes("spawnSync")
        );
      });

    expect(offenders).toEqual([]);
  });

  it("documents database cleanup guardrails for production E2E", () => {
    const doc = readFileSync(path.resolve(process.cwd(), "docs/production-e2e-cleanup.md"), "utf8");

    expect(doc).toContain("GRANTPIPE_E2E_EMAIL");
    expect(doc).toContain("GRANTPIPE_E2E_ORG_NAME");
    expect(doc).toContain(
      "Do not create more production E2E data while cleanup is already non-zero.",
    );
    expect(doc).toContain("Do not create one-off production accounts");
    expect(doc).toContain("pnpm e2e:live");
    expect(doc).toContain("pnpm e2e:live:cleanup");
  });
});
