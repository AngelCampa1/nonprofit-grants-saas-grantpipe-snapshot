import { describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createLiveE2ERunProof } from "./lib/live-e2e-proof";
import {
  assertLiveCommandCanRun,
  buildLiveE2EEnv,
  runLiveE2E,
  resolveLiveE2ECommand,
} from "./run-live-e2e";

describe("resolveLiveE2ECommand", () => {
  it("requires a command after -- so raw live tests are wrapped intentionally", () => {
    expect(() => resolveLiveE2ECommand(["node", "script"])).toThrow(
      "Pass the live E2E command after --",
    );
  });

  it("returns the command and args after --", () => {
    expect(resolveLiveE2ECommand(["node", "script", "--", "pnpm", "e2e"])).toEqual({
      command: "pnpm",
      args: ["e2e"],
    });
  });
});

describe("buildLiveE2EEnv", () => {
  it("marks child commands as cleanup-wrapped live E2E runs", () => {
    expect(buildLiveE2EEnv({ EXISTING: "value" })).toMatchObject({
      EXISTING: "value",
      GRANTPIPE_LIVE_E2E_WRAPPER: "1",
    });
  });

  it("passes a cleanup proof token to child commands", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "grantpipe-live-e2e-"));
    try {
      const proof = createLiveE2ERunProof({ rootDir });

      expect(buildLiveE2EEnv({ EXISTING: "value" }, proof)).toMatchObject({
        EXISTING: "value",
        GRANTPIPE_LIVE_E2E_WRAPPER: "1",
        GRANTPIPE_LIVE_E2E_RUN_TOKEN: proof.token,
        GRANTPIPE_LIVE_E2E_RUN_TOKEN_FILE: proof.filePath,
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});

describe("assertLiveCommandCanRun", () => {
  it("allows public production checks", () => {
    expect(() =>
      assertLiveCommandCanRun({
        command: "pnpm",
        args: ["exec", "playwright", "test", "--config=playwright.public-prod.config.ts"],
      }),
    ).not.toThrow();
  });

  it("allows arbitrary live commands once the cleanup wrapper owns execution", () => {
    expect(() =>
      assertLiveCommandCanRun(
        {
          command: "node",
          args: ["e2e-adhoc/activity-prod-stress.mjs", "playwright.public-prod.config.ts"],
        },
        {},
      ),
    ).not.toThrow();
  });
});

describe("runLiveE2E", () => {
  it("runs cleanup before and after a successful live command", async () => {
    const cleanup = vi.fn(async () => undefined);
    const run = vi.fn(async () => 0);
    const tokenDir = mkdtempSync(join(tmpdir(), "grantpipe-live-e2e-"));

    try {
      await expect(
        runLiveE2E({
          argv: ["node", "script", "--", "pnpm", "e2e"],
          cleanup,
          run,
          env: {
            GRANTPIPE_LIVE_E2E_TOKEN_DIR: tokenDir,
          },
        }),
      ).resolves.toBe(0);
    } finally {
      rmSync(tokenDir, { recursive: true, force: true });
    }

    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenCalledWith(
      "pnpm",
      ["e2e"],
      expect.objectContaining({
        GRANTPIPE_LIVE_E2E_RUN_TOKEN: expect.any(String),
        GRANTPIPE_LIVE_E2E_RUN_TOKEN_FILE: expect.any(String),
      }),
    );
  });

  it("removes the cleanup proof token after the live command finishes", async () => {
    const cleanup = vi.fn(async () => undefined);
    const run = vi.fn(async (_command: string, _args: string[], env?: NodeJS.ProcessEnv) => {
      expect(env?.GRANTPIPE_LIVE_E2E_RUN_TOKEN_FILE).toBeTruthy();
      expect(existsSync(env?.GRANTPIPE_LIVE_E2E_RUN_TOKEN_FILE ?? "")).toBe(true);
      return 0;
    });
    const tokenDir = mkdtempSync(join(tmpdir(), "grantpipe-live-e2e-"));

    await expect(
      runLiveE2E({
        argv: ["node", "script", "--", "pnpm", "e2e"],
        cleanup,
        run,
        env: {
          POSTHOG_PERSONAL_API_KEY: "phx_secret",
          POSTHOG_PROJECT_ID: "12345",
          GRANTPIPE_LIVE_E2E_TOKEN_DIR: tokenDir,
        },
      }),
    ).resolves.toBe(0);

    expect(existsSync(tokenDir)).toBe(true);
    expect(existsSync(run.mock.calls[0]?.[2]?.GRANTPIPE_LIVE_E2E_RUN_TOKEN_FILE ?? "")).toBe(false);
    rmSync(tokenDir, { recursive: true, force: true });
  });

  it("still runs cleanup after a failed live command and returns the failure code", async () => {
    const cleanup = vi.fn(async () => undefined);
    const run = vi.fn(async () => 7);

    await expect(
      runLiveE2E({
        argv: ["node", "script", "--", "pnpm", "e2e"],
        cleanup,
        run,
        env: {
          POSTHOG_PERSONAL_API_KEY: "phx_secret",
          POSTHOG_PROJECT_ID: "12345",
        },
      }),
    ).resolves.toBe(7);

    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it("preserves the live command failure code when post-cleanup also fails", async () => {
    const cleanupError = new Error("cleanup failed");
    const cleanup = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(cleanupError);
    const run = vi.fn(async () => 7);
    const logError = vi.fn();

    await expect(
      runLiveE2E({
        argv: ["node", "script", "--", "pnpm", "e2e"],
        cleanup,
        run,
        logError,
        env: {
          POSTHOG_PERSONAL_API_KEY: "phx_secret",
          POSTHOG_PROJECT_ID: "12345",
        },
      }),
    ).resolves.toBe(7);

    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining("Post-run live E2E cleanup failed"),
      cleanupError,
    );
  });

  it("returns failure when the live command passes but post-cleanup fails", async () => {
    const cleanup = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("cleanup failed"));
    const run = vi.fn(async () => 0);

    await expect(
      runLiveE2E({
        argv: ["node", "script", "--", "pnpm", "e2e"],
        cleanup,
        run,
        env: {
          POSTHOG_PERSONAL_API_KEY: "phx_secret",
          POSTHOG_PROJECT_ID: "12345",
        },
      }),
    ).resolves.toBe(1);
  });
});
