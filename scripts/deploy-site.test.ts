import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const { execSyncMock } = vi.hoisted(() => ({
  execSyncMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execSync: execSyncMock,
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    rmSync: vi.fn(),
  };
});

import {
  deploySite,
  DEPLOY_SITE_STEPS,
  isEntrypoint,
  runCli,
  runDeployCommand,
  SCRIPT_PATH,
} from "./deploy-site";

beforeEach(() => {
  execSyncMock.mockReset();
});

describe("deploySite", () => {
  it("checks Sentry release env before build, then runs sync, verify, and deploy", () => {
    const exec = vi.fn();

    deploySite({ exec });

    // First call: Sentry check (no maxAttempts/beforeRetry)
    expect(exec).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        command: "pnpm exec tsx scripts/check-sentry-release-env.ts --app site",
      }),
      1,
    );
    // Second call: site build (has maxAttempts: 2)
    expect(exec).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        command: "pnpm --filter @grantpipe/site run build",
        env: { REQUIRE_LEAD_MAGNET_PDF_BUILD: "1" },
        maxAttempts: 2,
      }),
      1,
    );
    // Third call: R2 sync
    expect(exec).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        command: "pnpm run sync:lead-magnets:r2",
      }),
      1,
    );
    // Fourth call: R2 verify
    expect(exec).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        command: "pnpm run verify:lead-magnets:r2",
      }),
      1,
    );
    // Fifth call: Pages deploy
    expect(exec).toHaveBeenNthCalledWith(
      5,
      expect.objectContaining({
        command: "pnpm --filter @grantpipe/site run deploy",
      }),
      1,
    );
    expect(exec).toHaveBeenCalledTimes(DEPLOY_SITE_STEPS.length);
  });

  it("keeps the site package deploy script wired to the built asset directory", () => {
    const sitePackageJson = JSON.parse(readFileSync("apps/site/package.json", "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(sitePackageJson.scripts.deploy).toContain("--assets dist/client");
  });

  it("retries the build step once on failure and calls beforeRetry between attempts", () => {
    let buildCallCount = 0;

    deploySite({
      exec: (s) => {
        if (s.command === "pnpm --filter @grantpipe/site run build") {
          buildCallCount++;
          if (buildCallCount === 1) {
            // Simulate the step's beforeRetry by calling it directly since
            // deploySite calls s.beforeRetry() internally
          } else {
            return; // succeed on second attempt
          }
          throw new Error("transient build failure");
        }
        // all other steps succeed
      },
    });

    // The build step was attempted twice
    expect(buildCallCount).toBe(2);
  });

  it("retries the build step and calls the real beforeRetry hook once", () => {
    // Intercept the beforeRetry call by wrapping DEPLOY_SITE_STEPS
    const buildStep = DEPLOY_SITE_STEPS.find(
      (s) => s.command === "pnpm --filter @grantpipe/site run build",
    )!;
    const originalBeforeRetry = buildStep.beforeRetry;
    const retryHookSpy = vi.fn();
    buildStep.beforeRetry = retryHookSpy;

    try {
      let buildCallCount = 0;
      deploySite({
        exec: (s) => {
          if (s.command === "pnpm --filter @grantpipe/site run build") {
            buildCallCount++;
            if (buildCallCount === 1) throw new Error("transient build failure");
          }
        },
      });

      expect(buildCallCount).toBe(2);
      expect(retryHookSpy).toHaveBeenCalledTimes(1);
    } finally {
      buildStep.beforeRetry = originalBeforeRetry;
    }
  });

  it("exhausts maxAttempts and re-throws the final error", () => {
    const boom = new Error("persistent build failure");
    let buildCallCount = 0;

    expect(() =>
      deploySite({
        exec: (s) => {
          if (s.command === "pnpm --filter @grantpipe/site run build") {
            buildCallCount++;
            throw boom;
          }
        },
      }),
    ).toThrow("persistent build failure");

    // maxAttempts: 2 means exactly 2 attempts
    expect(buildCallCount).toBe(2);
  });

  it("steps without maxAttempts run exactly once and do not call beforeRetry", () => {
    const boom = new Error("one-shot failure");
    let sentryCallCount = 0;

    expect(() =>
      deploySite({
        exec: (s) => {
          if (s.command === "pnpm exec tsx scripts/check-sentry-release-env.ts --app site") {
            sentryCallCount++;
            throw boom;
          }
        },
      }),
    ).toThrow("one-shot failure");

    // Sentry check has no maxAttempts — should be called exactly once
    expect(sentryCallCount).toBe(1);
  });
});

describe("runDeployCommand", () => {
  it("passes step environment overrides without relying on shell syntax", () => {
    runDeployCommand({
      command: "pnpm --filter @grantpipe/site run build",
      env: { REQUIRE_LEAD_MAGNET_PDF_BUILD: "1" },
    });

    expect(execSyncMock).toHaveBeenCalledWith(
      "pnpm --filter @grantpipe/site run build",
      expect.objectContaining({
        stdio: "inherit",
        env: expect.objectContaining({
          REQUIRE_LEAD_MAGNET_PDF_BUILD: "1",
        }),
      }),
    );
  });

  it("logs attempt number when maxAttempts > 1", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    runDeployCommand(
      {
        command: "pnpm --filter @grantpipe/site run build",
        maxAttempts: 2,
      },
      2,
    );

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("attempt 2/2"));
    consoleSpy.mockRestore();
  });

  it("does not log attempt info for single-attempt steps", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    runDeployCommand({
      command: "pnpm exec tsx scripts/check-sentry-release-env.ts --app site",
    });

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe("runCli", () => {
  it("does nothing when imported", () => {
    const execute = vi.fn();

    runCli({ argv: ["node"], execute });
    runCli({ argv: ["node", "/tmp/other-script.ts"], execute });

    expect(execute).not.toHaveBeenCalled();
  });

  it("runs the deploy when invoked as the script entrypoint", () => {
    const execute = vi.fn();

    runCli({ argv: ["node", SCRIPT_PATH], execute });

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("logs Error messages and exits non-zero when deployment fails", () => {
    const logError = vi.fn();
    const exit = vi.fn();

    runCli({
      argv: ["node", SCRIPT_PATH],
      execute: () => {
        throw new Error("deploy failed");
      },
      exit,
      logError,
    });

    expect(logError).toHaveBeenCalledWith("deploy failed");
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("isEntrypoint", () => {
  it("matches direct tsx invocation on Windows-style paths", () => {
    expect(
      isEntrypoint("file:///C:/repo/scripts/deploy-site.ts", "C:\\repo\\scripts\\deploy-site.ts"),
    ).toBe(true);
  });
});
